"""
Radar — APScheduler bootstrap.

Schedules per-user job-check runs based on subscription tier.

Tier cadences (start times staggered across a 2-hour window via sha256(user_id)):
  STARTER   → Mon + Thu  at 07:xx UTC
  PRO       → Daily      at 07:xx UTC
  TRIALING  → Daily      at 07:xx UTC  (treated the same as PRO)
  UNLIMITED → Every 6 h  (start time offset by user_id hash)
  FREE      → No schedule (manual checks only)
"""

from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone, timedelta

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy import text

logger = logging.getLogger(__name__)

# ── Singleton ────────────────────────────────────────────────────────────────

_scheduler: BackgroundScheduler | None = None


def get_scheduler() -> BackgroundScheduler:
    """Return the module-level BackgroundScheduler, creating it on first call."""
    global _scheduler
    if _scheduler is None:
        _scheduler = BackgroundScheduler(timezone="UTC")
    return _scheduler


# ── Stagger helpers ──────────────────────────────────────────────────────────

def _stagger_minutes(user_id: str) -> int:
    """Return a deterministic 0–119 minute offset derived from user_id."""
    digest = int(hashlib.sha256(user_id.encode()).hexdigest(), 16)
    return digest % 120


def _offset_hour_minute(base_hour: int, extra_minutes: int) -> tuple[int, int]:
    """Add extra_minutes to base_hour and return (hour, minute) with day rollover."""
    total = base_hour * 60 + extra_minutes
    return (total // 60) % 24, total % 60


# ── Trigger factory ──────────────────────────────────────────────────────────

def _make_trigger(tier: str, offset_minutes: int):
    """Return an APScheduler trigger for the given tier, or None for FREE."""
    if tier == "STARTER":
        h, m = _offset_hour_minute(7, offset_minutes)
        return CronTrigger(day_of_week="mon,thu", hour=h, minute=m, timezone="UTC")

    if tier in ("PRO", "TRIALING"):
        h, m = _offset_hour_minute(7, offset_minutes)
        return CronTrigger(day_of_week="*", hour=h, minute=m, timezone="UTC")

    if tier == "UNLIMITED":
        # Every 6 hours; stagger the first fire within the next 6-hour window.
        now = datetime.now(timezone.utc)
        # Anchor: midnight UTC today + user's offset
        start = now.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(minutes=offset_minutes)
        # Advance to the next future slot
        while start <= now:
            start += timedelta(hours=6)
        return IntervalTrigger(hours=6, start_date=start, timezone="UTC")

    return None  # FREE or unknown — no schedule


# ── Public API ───────────────────────────────────────────────────────────────

def schedule_user(user_id: str, tier: str) -> None:
    """
    Register (or replace) the automated check job for a user.

    Safe to call at any time — removes any existing job first so this is
    idempotent. Called on startup (bootstrap) and whenever a user's tier
    changes (POST /api/jobs/trigger-schedule-update).
    """
    scheduler = get_scheduler()
    job_id = f"check_{user_id}"

    # Remove existing job first (idempotent re-schedule)
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)

    if tier == "FREE":
        logger.info("scheduler: user %s is FREE — no automated check registered", user_id)
        return

    offset = _stagger_minutes(user_id)
    trigger = _make_trigger(tier, offset)
    if trigger is None:
        return

    from jobs_runner import check_user_jobs

    scheduler.add_job(
        check_user_jobs,
        trigger=trigger,
        id=job_id,
        name=f"job-check:{user_id} ({tier})",
        args=[user_id],
        misfire_grace_time=3600,  # tolerate up to 1 h of downtime before skipping
        coalesce=True,            # collapse multiple missed fires into one
        replace_existing=True,
    )
    logger.info(
        "scheduler: registered user %s (%s) with +%d min stagger",
        user_id, tier, offset,
    )


def unschedule_user(user_id: str) -> None:
    """Remove a user's scheduled job (on account deletion or FREE downgrade)."""
    scheduler = get_scheduler()
    job_id = f"check_{user_id}"
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
        logger.info("scheduler: unscheduled user %s", user_id)


def bootstrap_scheduler() -> None:
    """
    Called once at FastAPI startup via the lifespan handler in main.py.

    1. Queries all users with an active paid tier from the DB.
    2. Registers a scheduled job for each.
    3. Starts the BackgroundScheduler thread.
    """
    scheduler = get_scheduler()
    if scheduler.running:
        logger.warning("bootstrap_scheduler called on an already-running scheduler — skipping")
        return

    # Load all users who should have automated checks
    rows = []
    try:
        from database import get_db

        db_gen = get_db()
        db = next(db_gen)
        try:
            rows = db.execute(
                text(
                    "SELECT id, subscription_tier FROM users "
                    "WHERE subscription_status IN ('ACTIVE', 'TRIALING') "
                    "AND subscription_tier != 'FREE'"
                )
            ).fetchall()
        finally:
            try:
                next(db_gen)
            except StopIteration:
                pass
    except Exception as exc:
        logger.warning("bootstrap_scheduler: could not load users from DB — %s", exc)

    registered = 0
    for row in rows:
        try:
            schedule_user(row.id, row.subscription_tier)
            registered += 1
        except Exception as exc:
            logger.error(
                "bootstrap_scheduler: failed to schedule user %s — %s", row.id, exc
            )

    scheduler.start()
    logger.info(
        "APScheduler started — %d job(s) registered across %d user(s) loaded from DB",
        len(scheduler.get_jobs()),
        registered,
    )

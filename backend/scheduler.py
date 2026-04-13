"""
Radar - APScheduler bootstrap.

Schedules per-user job-check runs based on subscription tier.

Tier cadences (start times staggered across a 2-hour window via sha256(user_id)):
  STARTER   -> Mon + Thu  at 07:xx UTC
  PRO       -> Daily      at 07:xx UTC
  TRIALING  -> Daily      at 07:xx UTC  (same cadence as PRO)
  UNLIMITED -> Every 6 h  (first run offset by user_id hash)
  FREE      -> No schedule (manual checks only)

Master on/off switch:
  Set SCHEDULER_ENABLED=true in Railway env vars to activate automated checks.
  Defaults to false so dev environments and demo accounts never burn tokens.

Per-account exclusions:
  Set SCHEDULER_EXCLUDED_EMAILS=demo@radar.app,test@example.com to prevent
  specific accounts from being scheduled even when SCHEDULER_ENABLED=true.
  Use this to protect demo and internal test accounts.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import threading

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy import text

logger = logging.getLogger(__name__)

# ── Singleton ──────────────────────────────────────────────────────────────────

_scheduler: BackgroundScheduler | None = None
_scheduler_lock = threading.Lock()


def get_scheduler() -> BackgroundScheduler:
    global _scheduler
    with _scheduler_lock:
        if _scheduler is None:
            _scheduler = BackgroundScheduler(timezone="UTC")
        return _scheduler


# ── Helpers ────────────────────────────────────────────────────────────────────

def _minute_offset(user_id: str) -> int:
    """
    Derive a stable 0-119 minute offset from the user's ID so checks for
    different users are staggered across a 2-hour window rather than all
    firing at exactly 07:00 UTC.
    """
    digest = hashlib.sha256(user_id.encode()).hexdigest()
    return int(digest[:8], 16) % 120


def _is_scheduler_enabled() -> bool:
    return os.getenv("SCHEDULER_ENABLED", "false").strip().lower() == "true"


def _excluded_emails() -> set[str]:
    raw = os.getenv("SCHEDULER_EXCLUDED_EMAILS", "")
    return {e.strip().lower() for e in raw.split(",") if e.strip()}


def _job_id(user_id: str) -> str:
    return f"check_{user_id}"


# ── Per-user scheduling ────────────────────────────────────────────────────────

def _run_check_sync(user_id: str) -> None:
    """
    Sync wrapper called by APScheduler's thread pool.
    Creates a fresh event loop for each run so async code works correctly
    inside APScheduler's threaded BackgroundScheduler.
    """
    try:
        from jobs_runner import check_user_jobs
        result = check_user_jobs(user_id)
        new = result.get("new_postings", 0)
        errors = result.get("errors", [])
        logger.info("[SCHEDULER] user=%s new_postings=%d errors=%d", user_id, new, len(errors))
        for err in errors:
            logger.warning("[SCHEDULER] user=%s error: %s", user_id, err)
    except Exception as e:
        logger.error("[SCHEDULER] Fatal error for user %s: %s", user_id, e)


def schedule_user(user_id: str, tier: str) -> None:
    """
    Add or replace the scheduled job for a single user based on their tier.
    Called at bootstrap and whenever a user's subscription changes.
    Silently no-ops when SCHEDULER_ENABLED=false.
    """
    if not _is_scheduler_enabled():
        return

    scheduler = get_scheduler()
    job_id = _job_id(user_id)

    # Remove any existing job for this user first
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)

    if tier == "FREE":
        # FREE tier has no automated schedule
        return

    offset = _minute_offset(user_id)
    hour = 7 + offset // 60
    minute = offset % 60

    if tier == "STARTER":
        scheduler.add_job(
            _run_check_sync,
            trigger=CronTrigger(day_of_week="mon,thu", hour=hour, minute=minute, timezone="UTC"),
            args=[user_id],
            id=job_id,
            replace_existing=True,
            misfire_grace_time=3600,  # 1 hour tolerance for missed fires
        )
        logger.info(
            "[SCHEDULER] STARTER user=%s scheduled Mon+Thu at %02d:%02d UTC",
            user_id, hour, minute,
        )

    elif tier in ("PRO", "TRIALING"):
        scheduler.add_job(
            _run_check_sync,
            trigger=CronTrigger(hour=hour, minute=minute, timezone="UTC"),
            args=[user_id],
            id=job_id,
            replace_existing=True,
            misfire_grace_time=3600,
        )
        logger.info(
            "[SCHEDULER] %s user=%s scheduled daily at %02d:%02d UTC",
            tier, user_id, hour, minute,
        )

    elif tier == "UNLIMITED":
        # Every 6 hours; start time offset by user_id hash so they don't all
        # fire at the same time
        start_minute = offset % 60
        start_hour = offset // 60  # 0 or 1
        scheduler.add_job(
            _run_check_sync,
            trigger=IntervalTrigger(hours=6, start_date=f"2000-01-01 0{start_hour}:{start_minute:02d}:00"),
            args=[user_id],
            id=job_id,
            replace_existing=True,
            misfire_grace_time=3600,
        )
        logger.info(
            "[SCHEDULER] UNLIMITED user=%s scheduled every 6h (offset %dm)",
            user_id, offset,
        )


def unschedule_user(user_id: str) -> None:
    """Remove a user's scheduled job. Called on subscription cancellation."""
    scheduler = get_scheduler()
    job_id = _job_id(user_id)
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
        logger.info("[SCHEDULER] Removed job for user=%s", user_id)


# ── Bootstrap ──────────────────────────────────────────────────────────────────

def bootstrap_scheduler() -> None:
    """
    Called once on FastAPI startup (main.py lifespan).

    When SCHEDULER_ENABLED=false (default), logs a message and returns
    immediately without starting the scheduler or touching the DB.
    This is the safe default for dev environments and demo accounts.

    When SCHEDULER_ENABLED=true, loads all eligible users from the DB
    and registers their scheduled jobs, then starts the scheduler.
    """
    if not _is_scheduler_enabled():
        logger.info(
            "[SCHEDULER] Disabled (SCHEDULER_ENABLED != true). "
            "Set SCHEDULER_ENABLED=true on Railway to activate automated checks."
        )
        return

    excluded = _excluded_emails()
    if excluded:
        logger.info("[SCHEDULER] Excluded emails: %s", ", ".join(sorted(excluded)))

    # Load all users who should have automated checks
    try:
        from database import get_db
        db_gen = get_db()
        db = next(db_gen)

        rows = db.execute(
            text(
                "SELECT id, email, subscription_tier, subscription_status "
                "FROM users "
                "WHERE subscription_tier IN ('STARTER', 'PRO', 'UNLIMITED') "
                "AND subscription_status IN ('ACTIVE', 'TRIALING')"
            )
        ).fetchall()

        try:
            next(db_gen)
        except StopIteration:
            pass

    except Exception as e:
        logger.error("[SCHEDULER] Failed to load users from DB: %s", e)
        return

    scheduler = get_scheduler()
    scheduled_count = 0

    for row in rows:
        user_id = str(row.id)
        email = (row.email or "").lower()
        tier = row.subscription_tier

        if email in excluded:
            logger.info("[SCHEDULER] Skipping excluded account: %s", email)
            continue

        # Treat TRIALING users the same as PRO for scheduling purposes
        effective_tier = "PRO" if row.subscription_status == "TRIALING" else tier
        schedule_user(user_id, effective_tier)
        scheduled_count += 1

    if not scheduler.running:
        scheduler.start()

    logger.info(
        "[SCHEDULER] Started. %d user(s) scheduled. EXCLUDED=%d account(s).",
        scheduled_count,
        len(excluded),
    )

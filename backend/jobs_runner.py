"""
Radar — check_user_jobs() — the master job check function.
Called by the scheduler (automated) and the manual-check endpoint (FREE tier).
"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from pipeline import ingest_posting, run_takedown_detection, _title_matches_profile
from scraper import scrape_career_page, _enrich_locations
from ats_clients import run_ats_discovery
from utils import parse_json_field


def _get_user_profile(db: Session, user_id: str) -> dict:
    """Load the candidate profile as a plain dict for AI scoring."""
    row = db.execute(
        text("SELECT * FROM candidate_profiles WHERE user_id = :uid"),
        {"uid": user_id},
    ).fetchone()
    if not row:
        return {}
    p = dict(row._mapping)
    parse_json_field(p, "education", [])
    return p


def _get_discovery_settings(db: Session, user_id: str) -> dict:
    row = db.execute(
        text("SELECT * FROM discovery_settings WHERE user_id = :uid"),
        {"uid": user_id},
    ).fetchone()
    if not row:
        return {
            "greenhouse_enabled": False,
            "lever_enabled": False,
            "ashby_enabled": False,
            "location_keywords": [],
            "role_keywords": [],
        }
    return dict(row._mapping)


async def _check_user_jobs_async(user_id: str) -> dict:
    """Async implementation of check_user_jobs."""
    from database import get_db

    db_gen = get_db()
    db: Session = next(db_gen)
    total_new = 0
    errors: list[str] = []

    try:
        profile = _get_user_profile(db, user_id)
        discovery = _get_discovery_settings(db, user_id)

        # ── 1. Watchlist scraping ────────────────────────────────────────────
        companies = db.execute(
            text(
                "SELECT id, company_name, career_page_url FROM companies "
                "WHERE user_id = :uid AND is_active = true"
            ),
            {"uid": user_id},
        ).fetchall()

        for company in companies:
            try:
                raw_jobs = await scrape_career_page(company.career_page_url, company.company_name)

                # ── Title pre-filter before location enrichment ───────────────
                # Only fire HTTP location requests for jobs that matched the
                # candidate's target roles / high-value titles. Unmatched jobs
                # (which will score 5 and appear at the bottom of the feed)
                # keep "See posting" and skip enrichment entirely.
                matched_jobs = [
                    j for j in raw_jobs
                    if _title_matches_profile(j.get("title", ""), profile)
                ]
                unmatched_jobs = [
                    j for j in raw_jobs
                    if not _title_matches_profile(j.get("title", ""), profile)
                ]

                # Enrich locations only for title-matched jobs
                if matched_jobs:
                    matched_jobs = await _enrich_locations(matched_jobs)

                all_jobs = matched_jobs + unmatched_jobs

                new_count = 0
                live_ids: set[str] = set()

                for raw in all_jobs:
                    from pipeline import make_fingerprint
                    fp = make_fingerprint(company.company_name, raw.get("title", ""), raw.get("apply_url", ""))
                    live_ids.add(fp)
                    is_new = ingest_posting(
                        db=db,
                        user_id=user_id,
                        company_id=company.id,
                        source="WATCHLIST",
                        raw=raw,
                        profile=profile,
                    )
                    if is_new:
                        new_count += 1

                # Takedown detection
                run_takedown_detection(db, user_id, company.id, live_ids)

                # Update last_checked_at and posting_count
                db.execute(
                    text(
                        "UPDATE companies SET last_checked_at = NOW(), posting_count = :cnt "
                        "WHERE id = :id"
                    ),
                    {"cnt": len(all_jobs), "id": company.id},
                )
                db.commit()
                total_new += new_count

            except Exception as e:
                errors.append(f"Watchlist scrape error ({company.company_name}): {e}")

        # ── 2. ATS Discovery ─────────────────────────────────────────────────
        if any([
            discovery.get("greenhouse_enabled"),
            discovery.get("lever_enabled"),
            discovery.get("ashby_enabled"),
        ]):
            try:
                ats_new = await run_ats_discovery(
                    db=db,
                    user_id=user_id,
                    greenhouse_enabled=discovery.get("greenhouse_enabled", False),
                    lever_enabled=discovery.get("lever_enabled", False),
                    ashby_enabled=discovery.get("ashby_enabled", False),
                    location_keywords=discovery.get("location_keywords", []),
                    role_keywords=discovery.get("role_keywords", []),
                    profile=profile,
                )
                total_new += ats_new
            except Exception as e:
                errors.append(f"ATS discovery error: {e}")

        # ── 3. Notification trigger (PRO/UNLIMITED with high-scoring new posts) ──
        user_row = db.execute(
            text("SELECT subscription_tier FROM users WHERE id = :uid"),
            {"uid": user_id},
        ).fetchone()
        tier = user_row.subscription_tier if user_row else "FREE"

        if tier in ("PRO", "UNLIMITED", "TRIALING") and total_new > 0:
            pref_row = db.execute(
                text("SELECT email_enabled, instant_alert_threshold FROM notification_preferences WHERE user_id = :uid"),
                {"uid": user_id},
            ).fetchone()
            email_enabled = pref_row.email_enabled if pref_row else True
            threshold = pref_row.instant_alert_threshold if pref_row else 75

            high_score_rows = db.execute(
                text(
                    "SELECT id, title, company_name, location, match_score, "
                    "description_summary, match_explanation, apply_url, salary_raw "
                    "FROM job_postings WHERE user_id = :uid "
                    "AND is_new_since_last_visit = true AND match_score >= :threshold "
                    "ORDER BY match_score DESC LIMIT 20"
                ),
                {"uid": user_id, "threshold": threshold},
            ).fetchall()

            if high_score_rows:
                ids = [r.id for r in high_score_rows]
                db.execute(
                    text(
                        "INSERT INTO notifications (id, user_id, type, sent_at, posting_ids) "
                        "VALUES (gen_random_uuid(), :uid, 'NEW_MATCH', NOW(), :ids)"
                    ),
                    {"uid": user_id, "ids": ids},
                )
                db.commit()

                if email_enabled:
                    user_email_row = db.execute(
                        text("SELECT email FROM users WHERE id = :uid"),
                        {"uid": user_id},
                    ).fetchone()
                    if user_email_row:
                        from email_client import send_instant_alert
                        for row in high_score_rows[:3]:  # cap at 3 instant alerts
                            try:
                                send_instant_alert(
                                    to=user_email_row.email,
                                    job_title=row.title,
                                    company_name=row.company_name,
                                    location=row.location,
                                    match_score=row.match_score,
                                    summary=row.description_summary or "",
                                    match_explanation=row.match_explanation or "",
                                    apply_url=row.apply_url,
                                    salary_raw=row.salary_raw,
                                )
                            except Exception as mail_err:
                                errors.append(f"Email send error: {mail_err}")

    except Exception as e:
        errors.append(f"check_user_jobs fatal error: {e}")
    finally:
        try:
            next(db_gen)
        except StopIteration:
            pass

    return {"new_postings": total_new, "errors": errors}


def check_user_jobs(user_id: str) -> dict:
    """Synchronous wrapper — used by APScheduler."""
    return asyncio.run(_check_user_jobs_async(user_id))


async def check_user_jobs_async(user_id: str) -> dict:
    """Async version — used by FastAPI endpoints (legacy synchronous path)."""
    return await _check_user_jobs_async(user_id)


async def run_check_background(job_id: str, user_id: str) -> None:
    """
    Background task wrapper used by the fire-and-forget /run-check endpoint.
    Runs the full job check and writes the result to the in-memory job store
    so the frontend can poll /check-status/{job_id} for completion.
    """
    from job_status import update_job
    try:
        result = await _check_user_jobs_async(user_id)
        update_job(job_id, "complete", result=result)
    except Exception as e:
        update_job(job_id, "error", error=str(e))

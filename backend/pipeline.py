"""
Radar — Core ingestion pipeline.
MOCK MODE: All Claude API calls replaced with hardcoded/randomised returns.
Swap parse_job_description / score_match / generate_summary with real Claude
calls when ANTHROPIC_API_KEY is set and you're ready for production.
"""

from __future__ import annotations

import hashlib
import random
from datetime import datetime, timezone
from typing import Any
from sqlalchemy import text
from sqlalchemy.orm import Session


# ─── Fingerprinting ─────────────────────────────────────────────────────────────

def make_fingerprint(company_name: str, title: str, apply_url: str) -> str:
    raw = f"{company_name.strip().lower()}|{title.strip().lower()}|{apply_url.strip().lower()}"
    return hashlib.sha256(raw.encode()).hexdigest()


# ─── MOCK AI pipeline ────────────────────────────────────────────────────────────

_ROLE_CATEGORIES = [
    "Data Engineering", "Frontend", "Backend", "Full Stack", "ML/AI", "DevOps"
]
_role_cycle_index = 0


def parse_job_description(raw_description: str) -> dict:
    """MOCK: Returns fixed structured job data. Replace with Claude call in production."""
    global _role_cycle_index
    role_category = _ROLE_CATEGORIES[_role_cycle_index % len(_ROLE_CATEGORIES)]
    _role_cycle_index += 1

    return {
        "experience_level": random.choice(["ENTRY", "MID", "ENTRY", "MID"]),
        "role_category": role_category,
        "required_skills": ["Python", "SQL", "React", "TypeScript"],
        "salary_min": None,
        "salary_max": None,
        "salary_currency": None,
        "salary_raw": None,
    }


def score_match(profile: dict, parsed_job: dict) -> dict:
    """MOCK: Returns randomised match score. Replace with Claude call in production."""
    score = random.randint(55, 97)
    return {
        "match_score": score,
        "match_explanation": (
            "Strong alignment on Python and SQL skills which are central to this role. "
            "Your target roles closely match this position. Junior-level experience "
            "aligns with the posted requirements."
        ),
    }


def generate_summary(raw_description: str) -> str:
    """MOCK: Returns fixed summary. Replace with Claude call in production."""
    return (
        "This role focuses on building and maintaining data pipelines and dashboards "
        "for internal business teams. The team operates in an agile environment with "
        "modern tooling. Strong SQL and Python skills are required with exposure to "
        "cloud platforms preferred."
    )


# ─── Takedown detection ───────────────────────────────────────────────────────────

def run_takedown_detection(
    db: Session, user_id: str, company_id: str, live_external_ids: set[str]
) -> int:
    """Mark postings that have disappeared as inactive. Returns count of deactivated."""
    active_rows = db.execute(
        text(
            "SELECT id, external_id FROM job_postings "
            "WHERE user_id = :uid AND company_id = :cid AND is_active = true"
        ),
        {"uid": user_id, "cid": company_id},
    ).fetchall()

    deactivated = 0
    for row in active_rows:
        if row.external_id not in live_external_ids:
            db.execute(
                text("UPDATE job_postings SET is_active = false WHERE id = :id"),
                {"id": row.id},
            )
            deactivated += 1

    if deactivated:
        db.commit()
    return deactivated


# ─── Posting ingestion ─────────────────────────────────────────────────────────────

def ingest_posting(
    db: Session,
    user_id: str,
    company_id: str | None,
    source: str,
    raw: dict,
    profile: dict,
) -> bool:
    """
    Process a single raw posting dict through the full pipeline.
    Returns True if the posting is new (was inserted), False if duplicate.
    """
    title = raw.get("title", "").strip()
    company_name = raw.get("company_name", "").strip()
    apply_url = raw.get("apply_url", "").strip()
    location = raw.get("location", "").strip() or "Not specified"

    if not title or not apply_url:
        return False

    fingerprint = make_fingerprint(company_name, title, apply_url)

    # Dedup check
    existing = db.execute(
        text("SELECT id FROM job_postings WHERE user_id = :uid AND external_id = :eid"),
        {"uid": user_id, "eid": fingerprint},
    ).fetchone()

    if existing:
        db.execute(
            text(
                "UPDATE job_postings SET last_verified_at = NOW(), is_active = true "
                "WHERE id = :id"
            ),
            {"id": existing.id},
        )
        db.commit()
        return False

    raw_description = raw.get("description", "") or f"{title} at {company_name} in {location}"

    # MOCK AI pipeline
    parsed_job = parse_job_description(raw_description)
    match_result = score_match(profile, parsed_job)
    summary = generate_summary(raw_description)

    # Salary from raw or AI parse
    salary_min = parsed_job.get("salary_min") or raw.get("salary_min")
    salary_max = parsed_job.get("salary_max") or raw.get("salary_max")
    salary_currency = parsed_job.get("salary_currency") or raw.get("salary_currency")
    salary_raw = parsed_job.get("salary_raw") or raw.get("salary_raw")

    exp_level = parsed_job.get("experience_level") or raw.get("experience_level")
    valid_levels = {"ENTRY", "MID", "SENIOR", "STAFF"}
    if exp_level not in valid_levels:
        exp_level = None

    posted_at_raw = raw.get("posted_at")
    posted_at = None
    if posted_at_raw:
        try:
            posted_at = datetime.fromisoformat(str(posted_at_raw).replace("Z", "+00:00"))
        except Exception:
            posted_at = None

    db.execute(
        text("""
            INSERT INTO job_postings (
                id, user_id, company_id, external_id, title, company_name, location,
                salary_min, salary_max, salary_currency, salary_raw,
                description_raw, description_summary,
                match_score, match_explanation,
                experience_level, role_category, apply_url, source,
                status, is_new_since_last_visit, posted_at,
                first_seen_at, last_verified_at, is_active, created_at
            ) VALUES (
                gen_random_uuid(), :user_id, :company_id, :external_id,
                :title, :company_name, :location,
                :salary_min, :salary_max, :salary_currency, :salary_raw,
                :description_raw, :description_summary,
                :match_score, :match_explanation,
                :experience_level, :role_category, :apply_url, :source,
                'NEW', true, :posted_at,
                NOW(), NOW(), true, NOW()
            )
        """),
        {
            "user_id": user_id,
            "company_id": company_id,
            "external_id": fingerprint,
            "title": title,
            "company_name": company_name,
            "location": location,
            "salary_min": salary_min,
            "salary_max": salary_max,
            "salary_currency": salary_currency,
            "salary_raw": salary_raw,
            "description_raw": raw_description,
            "description_summary": summary,
            "match_score": match_result.get("match_score", 0),
            "match_explanation": match_result.get("match_explanation", ""),
            "experience_level": exp_level,
            "role_category": parsed_job.get("role_category"),
            "apply_url": apply_url,
            "source": source,
            "posted_at": posted_at,
        },
    )
    db.commit()
    return True

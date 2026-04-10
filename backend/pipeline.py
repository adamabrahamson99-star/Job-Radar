"""
Radar — Core ingestion pipeline.

When ANTHROPIC_API_KEY is set, each new job posting is processed with a single
Claude API call that handles parsing, match scoring, and summary generation
together. When the key is absent (local dev / mock mode), the mock fallbacks
below are used automatically so the app stays fully functional without a key.
"""

from __future__ import annotations

import hashlib
import json
import os
import random
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session


# ─── Fingerprinting ───────────────────────────────────────────────────────────

def make_fingerprint(company_name: str, title: str, apply_url: str) -> str:
    raw = f"{company_name.strip().lower()}|{title.strip().lower()}|{apply_url.strip().lower()}"
    return hashlib.sha256(raw.encode()).hexdigest()


# ─── Claude AI pipeline ───────────────────────────────────────────────────────

_SYSTEM_PROMPT = """\
You are a job-candidate matching engine for Radar, an AI-powered job tracking app.
Given a job description and a candidate profile, you will analyse the job and score
how well the candidate fits.

Return ONLY a valid JSON object — no markdown fences, no explanation, no preamble."""

_USER_PROMPT = """\
Candidate profile:
- Experience level: {experience_level} ({years} years of experience)
- Skills: {skills}
- Target roles: {target_roles}
- High-priority skills: {high_value_skills}
- High-priority titles: {high_value_titles}
- Preferred locations: {preferred_locations}

Job posting:
Title: {title}
Company: {company}
Location: {location}
Description:
{description}

Return a JSON object with exactly these fields:

{{
  "experience_level": "ENTRY | MID | SENIOR | STAFF",
  "role_category": "one of: Data Engineering | Frontend | Backend | Full Stack | ML/AI | DevOps | Design | Product | Marketing | Sales | Operations | Other",
  "required_skills": ["skill1", "skill2"],
  "salary_min": null,
  "salary_max": null,
  "salary_currency": null,
  "salary_raw": null,
  "match_score": 0,
  "match_explanation": "2–3 sentence explanation of fit or gaps",
  "description_summary": "2–3 sentence neutral summary of what the role involves"
}}

Scoring guide:
- 80–100: Strong match — skills, level, and target roles align closely
- 60–79: Good match — most requirements met, minor gaps
- 40–59: Partial match — relevant background but notable gaps
- 0–39: Poor match — different domain, level, or skill set

Salary: extract from the description if present, otherwise leave as null.
Return ONLY the JSON object."""


def _build_prompt(raw_description: str, profile: dict, title: str, company: str, location: str) -> str:
    def _join(lst: Any) -> str:
        if isinstance(lst, list):
            return ", ".join(str(x) for x in lst) or "Not specified"
        return str(lst) if lst else "Not specified"

    return _USER_PROMPT.format(
        experience_level=profile.get("experience_level", "ENTRY"),
        years=profile.get("years_of_experience", 0),
        skills=_join(profile.get("skills", [])),
        target_roles=_join(profile.get("target_roles", [])),
        high_value_skills=_join(profile.get("high_value_skills", [])),
        high_value_titles=_join(profile.get("high_value_titles", [])),
        preferred_locations=_join(profile.get("preferred_locations", [])),
        title=title,
        company=company,
        location=location,
        # Truncate long descriptions to keep token cost predictable (~2k tokens)
        description=raw_description[:6000],
    )


def analyze_job_posting(
    raw_description: str,
    profile: dict,
    title: str = "",
    company: str = "",
    location: str = "",
) -> dict:
    """
    Send job + profile to Claude in a single call and return all analysis fields.
    Falls back to mock values if ANTHROPIC_API_KEY is not set or the call fails.
    """
    api_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        return _mock_analysis()

    try:
        import anthropic  # lazy import — not required if running in mock mode

        client = anthropic.Anthropic(api_key=api_key)
        message = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1024,
            system=_SYSTEM_PROMPT,
            messages=[{
                "role": "user",
                "content": _build_prompt(raw_description, profile, title, company, location),
            }],
        )

        raw_text = message.content[0].text.strip()

        # Strip markdown code fences if Claude includes them despite instructions
        if raw_text.startswith("```"):
            lines = raw_text.split("\n")
            raw_text = "\n".join(
                lines[1:-1] if lines[-1].strip() == "```" else lines[1:]
            )

        result = json.loads(raw_text)

        # Validate required fields exist; fall back to mock if malformed
        required = {"match_score", "match_explanation", "description_summary",
                    "experience_level", "role_category"}
        if not required.issubset(result.keys()):
            raise ValueError(f"Missing fields in Claude response: {required - result.keys()}")

        # Clamp score to valid range
        result["match_score"] = max(0, min(100, int(result.get("match_score", 0))))
        return result

    except Exception as e:
        print(f"[CLAUDE PIPELINE ERROR] {e} — falling back to mock")
        return _mock_analysis()


# ─── Mock fallback (used when ANTHROPIC_API_KEY is not set) ──────────────────

_ROLE_CATEGORIES = [
    "Data Engineering", "Frontend", "Backend", "Full Stack", "ML/AI", "DevOps"
]
_role_cycle_index = 0


def _mock_analysis() -> dict:
    """Returns plausible-looking mock analysis. Used in dev / when key is absent."""
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
        "match_score": random.randint(55, 97),
        "match_explanation": (
            "Strong alignment on Python and SQL skills which are central to this role. "
            "Your target roles closely match this position. Junior-level experience "
            "aligns with the posted requirements."
        ),
        "description_summary": (
            "This role focuses on building and maintaining data pipelines and dashboards "
            "for internal business teams. The team operates in an agile environment with "
            "modern tooling. Strong SQL and Python skills are required with exposure to "
            "cloud platforms preferred."
        ),
    }


# ─── Kept for backwards compatibility (called nowhere new) ───────────────────
# These delegate to analyze_job_posting so any existing callers still work,
# but ingest_posting now calls analyze_job_posting directly.

def parse_job_description(raw_description: str) -> dict:
    result = analyze_job_posting(raw_description, {})
    return {k: result[k] for k in (
        "experience_level", "role_category", "required_skills",
        "salary_min", "salary_max", "salary_currency", "salary_raw"
    )}


def score_match(profile: dict, parsed_job: dict) -> dict:
    return {
        "match_score": parsed_job.get("match_score", 0),
        "match_explanation": parsed_job.get("match_explanation", ""),
    }


def generate_summary(raw_description: str) -> str:
    return analyze_job_posting(raw_description, {}).get("description_summary", "")


# ─── Takedown detection ───────────────────────────────────────────────────────

def run_takedown_detection(
    db: Session, user_id: str, company_id: str, live_external_ids: set[str]
) -> int:
    """Mark postings that have disappeared as inactive. Returns count deactivated."""
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


# ─── Posting ingestion ────────────────────────────────────────────────────────

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
    Returns True if the posting is new (inserted), False if it's a duplicate.
    """
    title = raw.get("title", "").strip()
    company_name = raw.get("company_name", "").strip()
    apply_url = raw.get("apply_url", "").strip()
    location = raw.get("location", "").strip() or "Not specified"

    if not title or not apply_url:
        return False

    fingerprint = make_fingerprint(company_name, title, apply_url)

    # ── Dedup check ───────────────────────────────────────────────────────────
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

    # ── Single Claude call (or mock fallback) ─────────────────────────────────
    analysis = analyze_job_posting(
        raw_description=raw_description,
        profile=profile,
        title=title,
        company=company_name,
        location=location,
    )

    # Salary: prefer values from the raw posting (ATS APIs often provide them);
    # use Claude's extracted values as fallback
    salary_min = raw.get("salary_min") or analysis.get("salary_min")
    salary_max = raw.get("salary_max") or analysis.get("salary_max")
    salary_currency = raw.get("salary_currency") or analysis.get("salary_currency")
    salary_raw = raw.get("salary_raw") or analysis.get("salary_raw")

    exp_level = analysis.get("experience_level") or raw.get("experience_level")
    if exp_level not in {"ENTRY", "MID", "SENIOR", "STAFF"}:
        exp_level = None

    posted_at = None
    posted_at_raw = raw.get("posted_at")
    if posted_at_raw:
        try:
            posted_at = datetime.fromisoformat(
                str(posted_at_raw).replace("Z", "+00:00")
            )
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
            "description_summary": analysis.get("description_summary", ""),
            "match_score": analysis.get("match_score", 0),
            "match_explanation": analysis.get("match_explanation", ""),
            "experience_level": exp_level,
            "role_category": analysis.get("role_category"),
            "apply_url": apply_url,
            "source": source,
            "posted_at": posted_at,
        },
    )
    db.commit()
    return True

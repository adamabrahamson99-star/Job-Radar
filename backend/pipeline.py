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


# ─── Location pre-filter ─────────────────────────────────────────────────────

# All known US state names and abbreviations, upper-cased for fast lookup
_US_LOCATION_TERMS = frozenset({
    # Two-letter abbreviations
    "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN",
    "IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV",
    "NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN",
    "TX","UT","VT","VA","WA","WV","WI","WY","DC",
    # Full state names
    "ALABAMA","ALASKA","ARIZONA","ARKANSAS","CALIFORNIA","COLORADO","CONNECTICUT",
    "DELAWARE","FLORIDA","GEORGIA","HAWAII","IDAHO","ILLINOIS","INDIANA","IOWA",
    "KANSAS","KENTUCKY","LOUISIANA","MAINE","MARYLAND","MASSACHUSETTS","MICHIGAN",
    "MINNESOTA","MISSISSIPPI","MISSOURI","MONTANA","NEBRASKA","NEVADA",
    "NEW HAMPSHIRE","NEW JERSEY","NEW MEXICO","NEW YORK","NORTH CAROLINA",
    "NORTH DAKOTA","OHIO","OKLAHOMA","OREGON","PENNSYLVANIA","RHODE ISLAND",
    "SOUTH CAROLINA","SOUTH DAKOTA","TENNESSEE","TEXAS","UTAH","VERMONT",
    "VIRGINIA","WASHINGTON","WEST VIRGINIA","WISCONSIN","WYOMING",
    "DISTRICT OF COLUMBIA",
    # Country-level US identifiers
    "UNITED STATES","UNITED STATES OF AMERICA","USA","US","U.S.","U.S.A.",
})

# Preference terms that signal a US-only requirement (lower-cased for comparison)
_US_PREF_TERMS = frozenset({
    "united states", "united states of america", "us", "usa",
    "u.s.", "u.s.a.",
})

# Recognised non-US country names and common abbreviations (lower-cased).
# Used to identify "City, Country" patterns so we can make confident rejections.
# Not exhaustive — only needed for countries that appear as the trailing segment
# of a job location string.
_KNOWN_COUNTRIES = frozenset({
    "afghanistan","albania","algeria","andorra","angola","argentina","armenia",
    "australia","austria","azerbaijan","bahrain","bangladesh","belarus","belgium",
    "bolivia","bosnia","botswana","brazil","bulgaria","cambodia","cameroon",
    "canada","chile","china","colombia","croatia","cuba","cyprus","czechia",
    "czech republic","denmark","ecuador","egypt","estonia","ethiopia","finland",
    "france","georgia","germany","ghana","greece","guatemala","honduras",
    "hungary","india","indonesia","iran","iraq","ireland","israel","italy",
    "japan","jordan","kazakhstan","kenya","kosovo","kuwait","latvia","lebanon",
    "libya","lithuania","luxembourg","malaysia","malta","mexico","moldova",
    "mongolia","morocco","mozambique","myanmar","nepal","netherlands",
    "new zealand","nigeria","north korea","norway","oman","pakistan","panama",
    "paraguay","peru","philippines","poland","portugal","qatar","romania",
    "russia","saudi arabia","senegal","serbia","singapore","slovakia","slovenia",
    "south africa","south korea","spain","sri lanka","sudan","sweden",
    "switzerland","syria","taiwan","tanzania","thailand","tunisia","turkey",
    "ukraine","united arab emirates","uae","united kingdom","uk","uruguay",
    "uzbekistan","venezuela","vietnam","yemen","zimbabwe",
    # Common regional / alternate names
    "england","scotland","wales","northern ireland","great britain",
    "hong kong","macau","puerto rico",
})


def _location_passes_filter(job_location: str, preferred_locations: list) -> bool:
    """
    Returns True if the job location is compatible with the candidate's preferred
    locations. Works for any country preference, not just the US.

    Errs heavily on the side of inclusion — only rejects when a confident
    country/region mismatch can be identified from a "City, Country" pattern.

    Rules (evaluated in order):
    1. No preferred locations set → always pass.
    2. Location is empty / "See posting" / "Not specified" → always pass.
    3. Location contains "Remote" → always pass.
    4. Any preferred term appears as a substring of the location → pass.
    5. Location has no comma (single segment, e.g. "Austin" or "London") →
       too ambiguous to reject → pass.
    6. Last comma-segment is a recognised US state/identifier:
       • Candidate has a US preference → pass.
       • No US preference → reject.
    7. Last comma-segment is a recognised non-US country name:
       • That country substring-matches any preferred term (or vice-versa) → pass.
       • No match → reject.
    8. Last comma-segment is unrecognised → too ambiguous → pass.
    """
    if not preferred_locations:
        return True

    loc = job_location.strip()
    loc_lower = loc.lower()

    # Unclear or remote locations always pass
    if not loc or loc_lower in ("see posting", "not specified", ""):
        return True
    if "remote" in loc_lower:
        return True

    pref_lower = {p.lower().strip() for p in preferred_locations if p}
    if not pref_lower:
        return True

    # Rule 4: direct substring match — any preferred term appears in the location
    if any(pref in loc_lower for pref in pref_lower):
        return True

    # Rules 5–8: inspect the last comma-segment to identify the job's country
    parts = [p.strip() for p in loc.split(",")]
    if len(parts) < 2:
        # Single-segment location — too ambiguous to reject
        return True

    last_upper = parts[-1].strip().upper()
    last_lower = parts[-1].strip().lower()

    # Rule 6: last segment is a recognised US state or country identifier
    if last_upper in _US_LOCATION_TERMS:
        has_us_pref = bool(pref_lower & _US_PREF_TERMS)
        return has_us_pref

    # Rule 7: last segment is a recognised non-US country name
    if last_lower in _KNOWN_COUNTRIES:
        # Accept if any preferred term overlaps with the identified country
        return any(
            last_lower in pref or pref in last_lower
            for pref in pref_lower
        )

    # Rule 8: unrecognised trailing segment — too ambiguous to reject
    return True


# ─── Title pre-filter ────────────────────────────────────────────────────────

def _title_matches_profile(title: str, profile: dict) -> bool:
    """
    Cheap keyword-overlap check between a job title and the candidate's
    target roles / high-value titles.  Called before the Claude API call so
    we don't spend tokens on obviously-irrelevant postings.

    Returns True (pass through) in the following cases:
    - Profile has no target role / title preferences (nothing to filter against).
    - At least one word from any target role or high-value title appears in the
      job title (case-insensitive, whole-word match via simple split).

    Returns False (skip Claude call) only when:
    - The candidate has explicit role preferences AND the title shares zero
      keywords with all of them.

    We err heavily on the side of inclusion — the goal is to catch clear
    mismatches (e.g. "Facilities Manager" for a Software Engineer candidate),
    not to be a strict filter.
    """
    target_roles: list = profile.get("target_roles") or []
    high_value_titles: list = profile.get("high_value_titles") or []

    all_prefs = [str(r) for r in target_roles + high_value_titles if r]
    if not all_prefs:
        return True  # No preferences set — always pass

    title_words = {w.lower() for w in title.split() if len(w) > 2}
    if not title_words:
        return True  # Unparseable title — pass through

    for pref in all_prefs:
        pref_words = {w.lower() for w in pref.split() if len(w) > 2}
        if pref_words & title_words:  # non-empty intersection
            return True

    return False


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

Location rule: if the candidate has preferred locations and the job location does
not fall within them (and is not Remote), treat this as a hard mismatch and cap
the score at 35 regardless of skill alignment. Always call out the location
mismatch in match_explanation.

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

    # ── Location pre-filter ───────────────────────────────────────────────────
    preferred_locations = profile.get("preferred_locations", [])
    if not _location_passes_filter(location, preferred_locations):
        print(
            f"[PIPELINE] Skipping '{title}' at {company_name} "
            f"— location '{location}' outside preferred {preferred_locations}"
        )
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

    # ── Title pre-filter — skip Claude call for obvious role mismatches ────────
    if not _title_matches_profile(title, profile):
        print(
            f"[PIPELINE] Skipping Claude for '{title}' at {company_name} "
            f"— title has no keyword overlap with target roles"
        )
        # Still insert the posting (it's new and real), just with a low default score
        analysis = {
            "experience_level": None,
            "role_category": None,
            "required_skills": [],
            "salary_min": None,
            "salary_max": None,
            "salary_currency": None,
            "salary_raw": None,
            "match_score": 5,
            "match_explanation": "Role title does not match your target roles or preferred titles.",
            "description_summary": "",
        }
    else:
        # ── Single Claude call (or mock fallback) ─────────────────────────────
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

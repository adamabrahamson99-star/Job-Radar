"""
Radar — ATS API clients.
MOCK MODE: All ATS endpoints replaced with fake data generators.
Replace fetch_greenhouse / fetch_lever / fetch_ashby with real HTTP calls
when you're ready to connect live ATS data.
"""

from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone


_ATS_TITLES = [
    "Senior Data Analyst",
    "Software Engineer II",
    "Staff Engineer",
    "Product Manager",
    "Data Engineer",
    "Frontend Developer",
    "DevOps Engineer",
    "ML Research Engineer",
    "Full Stack Engineer",
    "Business Intelligence Developer",
]

_ATS_LOCATIONS = [
    "Remote",
    "San Francisco, CA",
    "New York, NY",
    "Austin, TX",
    "Seattle, WA",
    "Remote (US)",
]

_SALARIES = [
    ("$100,000 – $130,000", 100000, 130000, "USD"),
    ("$90,000 – $115,000", 90000, 115000, "USD"),
    (None, None, None, None),
    (None, None, None, None),
    ("$120,000 – $150,000", 120000, 150000, "USD"),
]


def _days_ago(n: int) -> str:
    dt = datetime.now(timezone.utc) - timedelta(days=n)
    return dt.isoformat()


def _make_postings(company_name: str, source_domain: str, count: int = 5) -> list[dict]:
    titles = random.sample(_ATS_TITLES, min(count, len(_ATS_TITLES)))
    result = []
    for title in titles:
        location = random.choice(_ATS_LOCATIONS)
        sal_raw, sal_min, sal_max, sal_cur = random.choice(_SALARIES)
        slug = title.lower().replace(" ", "-")
        job_id = random.randint(10000, 99999)
        result.append({
            "title": title,
            "company_name": company_name,
            "apply_url": f"https://{source_domain}/jobs/{slug}-{job_id}",
            "location": location,
            "description": (
                f"Join {company_name} as a {title}. We are looking for a highly motivated "
                f"individual to contribute to our growing team. This is a {location} position "
                f"requiring strong analytical and communication skills. Python, SQL, and cloud "
                f"experience are valued. We offer competitive compensation and benefits."
            ),
            "salary_raw": sal_raw,
            "salary_min": sal_min,
            "salary_max": sal_max,
            "salary_currency": sal_cur,
            "posted_at": _days_ago(random.randint(1, 14)),
        })
    return result


async def fetch_greenhouse(slug: str, company_name: str) -> list[dict]:
    """MOCK: Returns 5 fake Greenhouse postings."""
    postings = _make_postings(company_name, f"boards.greenhouse.io/{slug}")
    print(f"[MOCK GREENHOUSE] {len(postings)} postings for {company_name}")
    return postings


async def fetch_lever(slug: str, company_name: str) -> list[dict]:
    """MOCK: Returns 5 fake Lever postings."""
    postings = _make_postings(company_name, f"jobs.lever.co/{slug}")
    print(f"[MOCK LEVER] {len(postings)} postings for {company_name}")
    return postings


async def fetch_ashby(slug: str, company_name: str) -> list[dict]:
    """MOCK: Returns 5 fake Ashby postings."""
    postings = _make_postings(company_name, f"jobs.ashbyhq.com/{slug}")
    print(f"[MOCK ASHBY] {len(postings)} postings for {company_name}")
    return postings


def _matches_keywords(job: dict, location_keywords: list[str], role_keywords: list[str]) -> bool:
    if not location_keywords and not role_keywords:
        return True
    loc_lower = job.get("location", "").lower()
    title_lower = job.get("title", "").lower()
    for kw in location_keywords:
        if kw.lower() in loc_lower:
            return True
    for kw in role_keywords:
        if kw.lower() in title_lower:
            return True
    return True  # In mock mode: always include all postings


async def run_ats_discovery(
    db,
    user_id: str,
    greenhouse_enabled: bool,
    lever_enabled: bool,
    ashby_enabled: bool,
    location_keywords: list[str],
    role_keywords: list[str],
    profile: dict,
) -> int:
    """Run ATS discovery (MOCK). Returns count of new jobs ingested."""
    from sqlalchemy import text
    from pipeline import ingest_posting

    all_jobs: list[tuple[str, dict]] = []

    if greenhouse_enabled:
        rows = db.execute(
            text(
                "SELECT company_slug, company_name FROM ats_companies "
                "WHERE source = 'GREENHOUSE' AND is_active = true LIMIT 5"
            )
        ).fetchall()
        for row in rows:
            for j in await fetch_greenhouse(row.company_slug, row.company_name):
                all_jobs.append(("GREENHOUSE", j))

    if lever_enabled:
        rows = db.execute(
            text(
                "SELECT company_slug, company_name FROM ats_companies "
                "WHERE source = 'LEVER' AND is_active = true LIMIT 5"
            )
        ).fetchall()
        for row in rows:
            for j in await fetch_lever(row.company_slug, row.company_name):
                all_jobs.append(("LEVER", j))

    if ashby_enabled:
        rows = db.execute(
            text(
                "SELECT company_slug, company_name FROM ats_companies "
                "WHERE source = 'ASHBY' AND is_active = true LIMIT 5"
            )
        ).fetchall()
        for row in rows:
            for j in await fetch_ashby(row.company_slug, row.company_name):
                all_jobs.append(("ASHBY", j))

    new_count = 0
    for source, job in all_jobs:
        is_new = ingest_posting(
            db=db,
            user_id=user_id,
            company_id=None,
            source=source,
            raw=job,
            profile=profile,
        )
        if is_new:
            new_count += 1

    return new_count

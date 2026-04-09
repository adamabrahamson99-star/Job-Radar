"""
Radar — ATS API clients.
Real implementations for Greenhouse, Lever, and Ashby public job board APIs.
All three APIs are publicly accessible — no authentication required.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone

import httpx


# ─── HTML stripping ───────────────────────────────────────────────────────────

def _strip_html(html: str) -> str:
    """Remove HTML tags and collapse whitespace."""
    if not html:
        return ""
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"&amp;", "&", text)
    text = re.sub(r"&lt;", "<", text)
    text = re.sub(r"&gt;", ">", text)
    text = re.sub(r"&nbsp;", " ", text)
    text = re.sub(r"&#\d+;", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _parse_iso(date_str: str | None) -> str | None:
    """Normalise an ISO date string for storage."""
    if not date_str:
        return None
    try:
        return datetime.fromisoformat(
            date_str.replace("Z", "+00:00")
        ).isoformat()
    except Exception:
        return None


def _ms_epoch_to_iso(ms: int | None) -> str | None:
    """Convert a millisecond epoch timestamp (Lever) to ISO string."""
    if not ms:
        return None
    try:
        return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat()
    except Exception:
        return None


# ─── Greenhouse ───────────────────────────────────────────────────────────────

async def fetch_greenhouse(slug: str, company_name: str) -> list[dict]:
    """
    Fetch live job listings from Greenhouse's public board API.
    Docs: https://developers.greenhouse.io/job-board.html
    """
    url = f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true"
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(url, headers={"User-Agent": "Radar-JobBoard/1.0"})
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as e:
        print(f"[GREENHOUSE ERROR] {company_name} ({slug}): HTTP {e.response.status_code}")
        return []
    except Exception as e:
        print(f"[GREENHOUSE ERROR] {company_name} ({slug}): {e}")
        return []

    results = []
    for job in data.get("jobs", []):
        title = job.get("title", "").strip()
        if not title:
            continue

        location = (job.get("location") or {}).get("name") or "Not specified"
        apply_url = job.get("absolute_url") or f"https://boards.greenhouse.io/{slug}"
        description = _strip_html(job.get("content", ""))
        posted_at = _parse_iso(job.get("updated_at"))

        results.append({
            "title": title,
            "company_name": company_name,
            "apply_url": apply_url,
            "location": location,
            "description": description or f"{title} at {company_name}.",
            "salary_raw": None,
            "salary_min": None,
            "salary_max": None,
            "salary_currency": None,
            "posted_at": posted_at,
        })

    print(f"[GREENHOUSE] {company_name}: {len(results)} postings")
    return results


# ─── Lever ────────────────────────────────────────────────────────────────────

async def fetch_lever(slug: str, company_name: str) -> list[dict]:
    """
    Fetch live job listings from Lever's public postings API.
    Docs: https://hire.lever.co/developer/postings
    """
    url = f"https://api.lever.co/v0/postings/{slug}?mode=json"
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(url, headers={"User-Agent": "Radar-JobBoard/1.0"})
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as e:
        print(f"[LEVER ERROR] {company_name} ({slug}): HTTP {e.response.status_code}")
        return []
    except Exception as e:
        print(f"[LEVER ERROR] {company_name} ({slug}): {e}")
        return []

    results = []
    for job in data:
        title = job.get("text", "").strip()
        if not title:
            continue

        categories = job.get("categories") or {}
        location = categories.get("location") or categories.get("allLocations") or "Not specified"
        if isinstance(location, list):
            location = ", ".join(location)

        apply_url = job.get("hostedUrl") or f"https://jobs.lever.co/{slug}"
        description = _strip_html(
            job.get("description", "") + " " + job.get("descriptionPlain", "")
        )
        posted_at = _ms_epoch_to_iso(job.get("createdAt"))

        results.append({
            "title": title,
            "company_name": company_name,
            "apply_url": apply_url,
            "location": location,
            "description": description or f"{title} at {company_name}.",
            "salary_raw": None,
            "salary_min": None,
            "salary_max": None,
            "salary_currency": None,
            "posted_at": posted_at,
        })

    print(f"[LEVER] {company_name}: {len(results)} postings")
    return results


# ─── Ashby ────────────────────────────────────────────────────────────────────

async def fetch_ashby(slug: str, company_name: str) -> list[dict]:
    """
    Fetch live job listings from Ashby's public GraphQL API.
    """
    gql_url = "https://jobs.ashbyhq.com/api/non-user-graphql"
    query = """
    query JobBoard($organizationHostedJobsPageName: String!) {
      jobBoard: jobBoardWithTeams(
        organizationHostedJobsPageName: $organizationHostedJobsPageName
      ) {
        jobPostings {
          id
          title
          isListed
          locationName
          externalLink
          descriptionHtml
          publishedDate
        }
      }
    }
    """
    payload = {
        "operationName": "JobBoard",
        "query": query,
        "variables": {"organizationHostedJobsPageName": slug},
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                gql_url,
                json=payload,
                headers={
                    "Content-Type": "application/json",
                    "User-Agent": "Radar-JobBoard/1.0",
                },
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as e:
        print(f"[ASHBY ERROR] {company_name} ({slug}): HTTP {e.response.status_code}")
        return []
    except Exception as e:
        print(f"[ASHBY ERROR] {company_name} ({slug}): {e}")
        return []

    postings = (
        (data.get("data") or {})
        .get("jobBoard") or {}
    ).get("jobPostings") or []

    results = []
    for job in postings:
        # Skip unlisted postings
        if not job.get("isListed", True):
            continue

        title = job.get("title", "").strip()
        if not title:
            continue

        job_id = job.get("id", "")
        # Prefer the externalLink if provided, otherwise build the Ashby board URL
        apply_url = (
            job.get("externalLink")
            or f"https://jobs.ashbyhq.com/{slug}/{job_id}"
        )
        location = job.get("locationName") or "Not specified"
        description = _strip_html(job.get("descriptionHtml", ""))
        posted_at = _parse_iso(job.get("publishedDate"))

        results.append({
            "title": title,
            "company_name": company_name,
            "apply_url": apply_url,
            "location": location,
            "description": description or f"{title} at {company_name}.",
            "salary_raw": None,
            "salary_min": None,
            "salary_max": None,
            "salary_currency": None,
            "posted_at": posted_at,
        })

    print(f"[ASHBY] {company_name}: {len(results)} postings")
    return results


# ─── Keyword filter ───────────────────────────────────────────────────────────

def _matches_keywords(job: dict, location_keywords: list[str], role_keywords: list[str]) -> bool:
    """Filter a job against user's location and role keyword preferences."""
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
    return False


# ─── Discovery orchestrator ───────────────────────────────────────────────────

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
    """Run ATS discovery with real API calls. Returns count of new jobs ingested."""
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
            jobs = await fetch_greenhouse(row.company_slug, row.company_name)
            for j in jobs:
                if _matches_keywords(j, location_keywords, role_keywords):
                    all_jobs.append(("GREENHOUSE", j))

    if lever_enabled:
        rows = db.execute(
            text(
                "SELECT company_slug, company_name FROM ats_companies "
                "WHERE source = 'LEVER' AND is_active = true LIMIT 5"
            )
        ).fetchall()
        for row in rows:
            jobs = await fetch_lever(row.company_slug, row.company_name)
            for j in jobs:
                if _matches_keywords(j, location_keywords, role_keywords):
                    all_jobs.append(("LEVER", j))

    if ashby_enabled:
        rows = db.execute(
            text(
                "SELECT company_slug, company_name FROM ats_companies "
                "WHERE source = 'ASHBY' AND is_active = true LIMIT 5"
            )
        ).fetchall()
        for row in rows:
            jobs = await fetch_ashby(row.company_slug, row.company_name)
            for j in jobs:
                if _matches_keywords(j, location_keywords, role_keywords):
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

"""
Radar — Career page scraper.
MOCK MODE: Returns 3 realistic fake job postings per company.
Replace scrape_career_page() with the real Playwright implementation when ready.
"""

from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone


_MOCK_TITLES = [
    "Data Analyst",
    "Junior Software Engineer",
    "Business Intelligence Analyst",
    "Frontend Engineer",
    "Full Stack Developer",
    "Product Analyst",
    "Backend Engineer",
    "ML Engineer",
    "Data Engineer",
    "Site Reliability Engineer",
    "DevOps Engineer",
    "QA Engineer",
]

_MOCK_LOCATIONS = [
    "San Francisco, CA",
    "New York, NY",
    "Remote",
    "Austin, TX",
    "Denver, CO",
    "Hybrid — Seattle, WA",
    "Remote (US)",
]

_MOCK_SALARIES = [
    ("$85,000 – $105,000", 85000, 105000),
    ("$95,000 – $120,000", 95000, 120000),
    ("$75,000 – $95,000", 75000, 95000),
    (None, None, None),  # no salary listed
    (None, None, None),  # no salary listed
]


def _days_ago(n: int) -> str:
    dt = datetime.now(timezone.utc) - timedelta(days=n)
    return dt.isoformat()


async def scrape_career_page(url: str, company_name: str) -> list[dict]:
    """
    MOCK: Returns 3 fake job postings for the given company.
    Replace with real Playwright scraping when PLAYWRIGHT_HEADLESS env is active.
    """
    titles = random.sample(_MOCK_TITLES, min(3, len(_MOCK_TITLES)))
    postings = []

    for i, title in enumerate(titles):
        location = random.choice(_MOCK_LOCATIONS)
        salary_raw, salary_min, salary_max = random.choice(_MOCK_SALARIES)
        posted_days_ago = random.randint(1, 10)
        slug = title.lower().replace(" ", "-")

        postings.append({
            "title": title,
            "company_name": company_name,
            "apply_url": f"{url.rstrip('/')}/{slug}-{random.randint(1000, 9999)}",
            "location": location,
            "description": (
                f"We are looking for a talented {title} to join {company_name}. "
                f"You will work cross-functionally to deliver high-impact projects. "
                f"Python, SQL, and data analysis experience preferred. "
                f"This is a {location} role with competitive compensation."
            ),
            "salary_raw": salary_raw,
            "salary_min": salary_min,
            "salary_max": salary_max,
            "salary_currency": "USD" if salary_min else None,
            "posted_at": _days_ago(posted_days_ago),
        })

    print(f"[MOCK SCRAPER] Returned {len(postings)} fake postings for {company_name}")
    return postings

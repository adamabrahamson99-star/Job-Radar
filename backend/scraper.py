"""
Radar — Career page scraper.
Real Playwright implementation. Navigates to a company's career page and
extracts individual job listings with their specific apply URLs.

Location extraction strategy (in order):
  1. JSON-LD JobPosting schema on the listing page (free, zero extra requests)
  2. Async concurrent httpx fetches of individual job pages — parses JSON-LD,
     <title>, and common CSS patterns (max 5 concurrent, rate-limited)
  3. Parent-container text heuristic from the listing page DOM
  4. Falls back to "See posting" if nothing found
"""

from __future__ import annotations

import asyncio
import json
import re
from urllib.parse import urljoin, urlparse

import httpx
from playwright.async_api import async_playwright, Page, TimeoutError as PlaywrightTimeout


# ─── Navigation words that are never job titles ───────────────────────────────

_NAV_SKIP = {
    "about", "contact", "privacy", "terms", "blog", "news", "press", "team",
    "values", "culture", "benefits", "faq", "help", "login", "sign in",
    "sign up", "register", "back", "home", "next", "previous", "see all",
    "view all", "apply now", "learn more", "read more", "careers", "jobs",
    "linkedin", "twitter", "facebook", "instagram", "youtube", "glassdoor",
}

_NAV_PATH_SEGMENTS = {
    "about", "contact", "privacy", "terms", "blog", "news", "press",
    "team", "culture", "benefits", "faq", "help", "login", "register",
}

_OVERLAY_SELECTORS = [
    "#onetrust-accept-btn-handler",
    "[id*='cookie'] button[id*='accept']",
    "[class*='cookie'] button[class*='accept']",
    "button[aria-label*='Accept']",
    "button[aria-label*='accept']",
    "button[aria-label*='Close']",
    "[data-testid*='cookie'] button",
    ".cc-btn.cc-allow",
    "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll",
]

_HTTP_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    )
}


# ─── URL / domain helpers ─────────────────────────────────────────────────────

def _normalize_domain(url: str) -> str:
    return urlparse(url).netloc.replace("www.", "")


def _is_same_domain(link_url: str, base_url: str) -> bool:
    base = _normalize_domain(base_url)
    link = _normalize_domain(link_url)
    return base in link or link in base


def _is_job_link(href: str, text: str, base_url: str) -> bool:
    """Heuristic: is this link an individual job posting?"""
    if not href or not text:
        return False
    text = text.strip()
    if len(text) < 5 or len(text) > 110:
        return False
    if text.lower() in _NAV_SKIP:
        return False

    full_url = urljoin(base_url, href)
    if not _is_same_domain(full_url, base_url):
        return False

    path = urlparse(full_url).path.rstrip("/")
    if not path or path == urlparse(base_url).path.rstrip("/"):
        return False
    if path.split("/")[-1].lower() in _NAV_PATH_SEGMENTS:
        return False

    base_path = urlparse(base_url).path.rstrip("/")
    if not path.startswith(base_path) and len(path) <= len(base_path):
        return False

    return True


# ─── JSON-LD location parsing ─────────────────────────────────────────────────

def _parse_jsonld_location(item: dict) -> str | None:
    """
    Extract a human-readable location string from a JSON-LD JobPosting item.
    Handles both physical addresses and remote work flags.
    """
    # Check for remote work requirement first
    remote = item.get("jobLocationType") or ""
    if "remote" in str(remote).lower():
        return "Remote"

    job_location = item.get("jobLocation")
    if not job_location:
        return None

    if isinstance(job_location, list):
        job_location = job_location[0] if job_location else None
    if not isinstance(job_location, dict):
        return None

    address = job_location.get("address", {})
    if isinstance(address, str):
        return address.strip() or None

    parts: list[str] = []
    city = address.get("addressLocality", "")
    region = address.get("addressRegion", "")
    country = address.get("addressCountry", "")

    if city:
        parts.append(city)
    if region and region != city:
        parts.append(region)
    # Only include country if it's non-US (US is assumed default)
    if country and country not in ("US", "USA", "United States"):
        parts.append(country)

    return ", ".join(parts) if parts else None


async def _extract_jsonld_location_map(page: Page) -> dict[str, str]:
    """
    Parse all JSON-LD <script> blocks on the listing page.
    Returns {job_url: location_string} for any JobPosting entries found.
    """
    location_map: dict[str, str] = {}
    try:
        scripts = await page.locator('script[type="application/ld+json"]').all()
        for script in scripts:
            try:
                raw = await script.inner_text(timeout=500)
                data = json.loads(raw)
            except Exception:
                continue

            items = data if isinstance(data, list) else [data]
            for item in items:
                # Handle @graph containers
                for graph_item in [item] + item.get("@graph", []):
                    if graph_item.get("@type") == "JobPosting":
                        job_url = graph_item.get("url") or (
                            graph_item.get("identifier", {}).get("value")
                            if isinstance(graph_item.get("identifier"), dict)
                            else None
                        )
                        loc = _parse_jsonld_location(graph_item)
                        if job_url and loc:
                            location_map[job_url] = loc
    except Exception:
        pass
    return location_map


# ─── Per-job-page HTTP location fetch ────────────────────────────────────────

async def _fetch_location_from_job_page(job_url: str) -> str | None:
    """
    Fetch an individual job page via HTTP and extract location from:
      1. JSON-LD JobPosting schema
      2. <title> tag  (e.g. "Engineer – Remote | Stripe")
      3. Common location CSS class patterns in raw HTML
    Returns None if nothing is found or the request fails.
    """
    try:
        async with httpx.AsyncClient(
            timeout=8, follow_redirects=True, headers=_HTTP_HEADERS
        ) as client:
            resp = await client.get(job_url)
            if resp.status_code != 200:
                return None
            html = resp.text

        # ── 1. JSON-LD on the job page ────────────────────────────────────────
        jsonld_blocks = re.findall(
            r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
            html,
            re.DOTALL | re.IGNORECASE,
        )
        for block in jsonld_blocks:
            try:
                data = json.loads(block)
                items = data if isinstance(data, list) else [data]
                for item in items:
                    for candidate in [item] + item.get("@graph", []):
                        if candidate.get("@type") == "JobPosting":
                            loc = _parse_jsonld_location(candidate)
                            if loc:
                                return loc
            except Exception:
                pass

        # ── 2. <title> tag heuristic ──────────────────────────────────────────
        # Matches patterns like: "Engineer - Remote | Stripe" or "SWE – Austin, TX"
        title_match = re.search(r"<title>([^<]+)</title>", html, re.IGNORECASE)
        if title_match:
            title_text = title_match.group(1)
            loc_match = re.search(
                r"[-–|]\s*(Remote|Hybrid|On.?[Ss]ite|(?:[A-Z][a-z]+ )*[A-Z]{2})\s*(?:[-–|]|$)",
                title_text,
            )
            if loc_match:
                return loc_match.group(1).strip()

        # ── 3. Common location element patterns ───────────────────────────────
        loc_match = re.search(
            r'class="[^"]*(?:location|job-location|posting-location)[^"]*"[^>]*>\s*([^<]{3,80})\s*<',
            html,
            re.IGNORECASE,
        )
        if loc_match:
            loc_text = loc_match.group(1).strip()
            if 2 < len(loc_text) < 80:
                return loc_text

    except Exception:
        pass
    return None


async def _enrich_locations(
    jobs: list[dict],
    max_concurrent: int = 5,
) -> list[dict]:
    """
    For jobs still missing a real location, fire concurrent HTTP requests to
    their individual job pages and update the location field in-place.
    Capped at max_concurrent simultaneous requests to avoid rate-limiting.
    """
    missing = [
        i for i, j in enumerate(jobs)
        if j.get("location") in (None, "See posting", "Not specified", "")
    ]
    if not missing:
        return jobs

    semaphore = asyncio.Semaphore(max_concurrent)

    async def fetch_one(idx: int) -> tuple[int, str | None]:
        async with semaphore:
            loc = await _fetch_location_from_job_page(jobs[idx]["apply_url"])
            await asyncio.sleep(0.1)  # small courtesy delay between requests
            return idx, loc

    outcomes = await asyncio.gather(*[fetch_one(i) for i in missing], return_exceptions=True)

    for outcome in outcomes:
        if isinstance(outcome, Exception):
            continue
        idx, loc = outcome
        if loc:
            jobs[idx]["location"] = loc

    return jobs


# ─── Playwright page helpers ──────────────────────────────────────────────────

async def _dismiss_overlays(page: Page) -> None:
    for selector in _OVERLAY_SELECTORS:
        try:
            btn = page.locator(selector).first
            if await btn.is_visible(timeout=800):
                await btn.click(timeout=800)
                await asyncio.sleep(0.4)
        except Exception:
            pass


async def _scroll_to_load(page: Page, steps: int = 6) -> None:
    for _ in range(steps):
        await page.evaluate("window.scrollBy(0, window.innerHeight * 0.8)")
        await asyncio.sleep(0.25)
    await page.evaluate("window.scrollTo(0, 0)")


async def _try_get_location_near_link(link_locator) -> str | None:
    """
    Last-resort: inspect the DOM parent container of a job link for text
    that looks like a location (city/state pattern or remote keyword).
    """
    try:
        parent = link_locator.locator("xpath=..")
        parent_text = await parent.inner_text(timeout=500)
        lines = [ln.strip() for ln in parent_text.splitlines() if ln.strip()]
        for line in lines:
            lower = line.lower()
            if any(kw in lower for kw in (
                "remote", "hybrid", "on-site", "onsite",
                "new york", "san francisco", "london", "austin",
                "seattle", "denver", "boston", "chicago", "los angeles",
            )):
                if 2 < len(line) < 80:
                    return line
            # City, ST pattern (e.g. "Austin, TX")
            if re.match(r"^[A-Z][a-zA-Z\s]+,\s*[A-Z]{2}$", line):
                return line
    except Exception:
        pass
    return None


# ─── Main scraper ─────────────────────────────────────────────────────────────

async def scrape_career_page(url: str, company_name: str) -> list[dict]:
    """
    Navigate to a company's career page and extract individual job listings
    with real per-job apply URLs and best-effort location data.
    """
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-blink-features=AutomationControlled",
            ],
        )
        context = await browser.new_context(
            user_agent=_HTTP_HEADERS["User-Agent"],
            viewport={"width": 1280, "height": 900},
        )
        page = await context.new_page()

        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=30_000)
            await page.wait_for_timeout(2_500)
            await _dismiss_overlays(page)
            await _scroll_to_load(page)

            # ── 1. Extract JSON-LD location map from listing page ─────────────
            jsonld_map = await _extract_jsonld_location_map(page)

            # ── 2. Detect iframe-based career pages ───────────────────────────
            frame = page.main_frame
            for f in page.frames:
                if f.url and any(
                    d in f.url
                    for d in ("myworkdayjobs", "icims", "taleo", "successfactors")
                ):
                    frame = f
                    break

            # ── 3. Extract job links ──────────────────────────────────────────
            links = await frame.locator("a[href]").all()
            seen_urls: set[str] = set()
            results: list[dict] = []

            for link in links:
                try:
                    href = await link.get_attribute("href", timeout=500)
                    text = re.sub(
                        r"\s+", " ", (await link.inner_text(timeout=500)).strip()
                    )
                except Exception:
                    continue

                if not _is_job_link(href, text, url):
                    continue

                full_url = urljoin(url, href)
                if full_url in seen_urls:
                    continue
                seen_urls.add(full_url)

                # Try JSON-LD map first, then DOM heuristic
                location = (
                    jsonld_map.get(full_url)
                    or await _try_get_location_near_link(link)
                )

                results.append({
                    "title": text,
                    "company_name": company_name,
                    "apply_url": full_url,
                    "location": location,  # may still be None — enriched below
                    "description": (
                        f"{text} at {company_name}. "
                        f"Visit the job posting for the full description and requirements."
                    ),
                    "salary_raw": None,
                    "salary_min": None,
                    "salary_max": None,
                    "salary_currency": None,
                    "posted_at": None,
                })

                if len(results) >= 50:
                    break

        except PlaywrightTimeout:
            print(f"[SCRAPER TIMEOUT] {company_name} ({url})")
            return []
        except Exception as e:
            print(f"[SCRAPER ERROR] {company_name} ({url}): {e}")
            return []
        finally:
            await context.close()
            await browser.close()

    # ── 4. Enrich missing locations via async HTTP fetches ────────────────────
    # Done outside the Playwright context so the browser is already closed.
    results = await _enrich_locations(results, max_concurrent=5)

    # ── 5. Final fallback ─────────────────────────────────────────────────────
    for job in results:
        if not job["location"]:
            job["location"] = "See posting"

    print(f"[SCRAPER] {company_name}: found {len(results)} postings at {url}")
    return results

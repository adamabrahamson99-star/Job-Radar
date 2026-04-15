"""
Radar — Career page scraper.

Multi-layer job detection strategy:
  Layer 1: JSON-LD JobPosting schema  — unconditional accept, highest confidence
  Layer 2: URL template clustering    — primary detection for most sites
  Layer 3: DOM parent structure       — supplement, catches SPAs & unusual layouts
  Layer 4: is_child_of_base           — supplement, nested career URL structures
  Layer 5: Content sampling           — spot-checks cluster against actual page HTML

Pagination strategy (applied in order of speed / reliability):
  1. URL-pattern pagination  → parallel httpx fetches (fastest, no browser)
  2. Load-more button        → click loop within existing Playwright session
  3. Dynamic infinite scroll → scroll until link count stabilises

No cap on job collection. Title pre-filtering in pipeline.py controls Claude cost.
"""

from __future__ import annotations

import asyncio
import json
import re
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse, parse_qsl, urlencode, urlunparse

import httpx
from playwright.async_api import async_playwright, Page, TimeoutError as PlaywrightTimeout


# ─── Constants ────────────────────────────────────────────────────────────────

# Link text that clearly belongs to site navigation, never a job title
_NAV_SKIP = {
    "about", "contact", "privacy", "terms", "blog", "news", "press", "team",
    "values", "culture", "benefits", "faq", "help", "login", "sign in",
    "sign up", "register", "back", "home", "next", "previous", "see all",
    "view all", "apply now", "learn more", "read more", "careers", "jobs",
    "linkedin", "twitter", "facebook", "instagram", "youtube", "glassdoor",
}

# URL path segments that identify nav sub-pages even when nested under /careers
_NAV_PATH_SEGMENTS = {
    "about", "contact", "privacy", "terms", "blog", "news", "press",
    "team", "culture", "benefits", "faq", "help", "login", "register",
}

# Path segments that identify listing/search/category pages.
# Distinct from _NAV_PATH_SEGMENTS (which catches nav pages).
# These catch listing pages that survive domain and nav filtering.
_LISTING_PATH_SEGMENTS = {
    "search", "filter", "category", "categories", "department", "departments",
    "results", "browse", "explore", "all-jobs", "job-search",
}

# Cookie / consent overlay selectors
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

# "Load more" / "Show more" button selectors (Playwright text-matching)
_LOAD_MORE_SELECTORS = [
    "button:has-text('Load more')",
    "button:has-text('Load More')",
    "button:has-text('Show more')",
    "button:has-text('Show More')",
    "button:has-text('View more')",
    "button:has-text('More jobs')",
    "button:has-text('See more jobs')",
    "[class*='load-more']",
    "[class*='show-more']",
    "[data-testid*='load-more']",
    "a:has-text('Load more')",
    "a:has-text('Show more')",
]

# Title patterns that indicate a category/department listing page rather than
# a single job posting. Link text like "Engineering & QA565 available jobs"
# (count concatenated with text by missing whitespace) or
# "Professional Services – 247 Available Jobs" are never real job titles.
_CATEGORY_TITLE_RE = re.compile(
    r"\d+\s*available\s+jobs?"          # "247 available jobs" / "247available jobs"
    r"|\d+\s+open\s+positions?"          # "120 open positions"
    r"|\d+\s+job\s+openings?"            # "34 job openings"
    r"|^all\s+(jobs?|positions?|openings?)\s*$"  # "All Jobs"
    r"|jobs?\s+in\s+\w",                 # "Jobs in Engineering"
    re.IGNORECASE,
)

# Keywords that validate a page is a real job posting (for content sampling)
_JOB_PAGE_SIGNALS = [
    r"\bapply\b",
    r"job description",
    r"responsibilities",
    r"qualifications",
    r"requirements",
    r"about the role",
    r"what you.{0,10}(do|bring)",
    r"we.{0,10}looking for",
    r"who you are",
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
    # Exact match (same subdomain, e.g. careers.hpe.com == careers.hpe.com)
    if base == link:
        return True
    # Link is a subdomain of base (e.g. base=hpe.com, link=careers.hpe.com)
    if link.endswith("." + base):
        return True
    # NOTE: intentionally NOT allowing the reverse (base=careers.hpe.com, link=hpe.com)
    # because that would let www.hpe.com links pass when scraping careers.hpe.com.
    return False


def _is_candidate_link(href: str, text: str, base_url: str) -> bool:
    """
    Broad gate: keep same-domain links with job-plausible text.
    Actual job detection is handled downstream by the multi-layer strategy.
    """
    if not href or not text:
        return False
    text = text.strip()
    if len(text) < 5 or len(text) > 110:
        return False
    if text.lower() in _NAV_SKIP:
        return False
    # Skip non-navigable hrefs
    if href.startswith(("#", "javascript:", "mailto:", "tel:")):
        return False

    full_url = urljoin(base_url, href)
    if not _is_same_domain(full_url, base_url):
        return False

    path = urlparse(full_url).path.rstrip("/")
    if not path or path == urlparse(base_url).path.rstrip("/"):
        return False

    segments = [s.lower() for s in path.split("/") if s]
    if any(seg in _NAV_PATH_SEGMENTS for seg in segments):
        return False

    # Tier 1 pre-filter: reject known listing/search/category page path segments
    if any(seg in _LISTING_PATH_SEGMENTS for seg in segments):
        return False

    return True


# ─── URL template normalisation ───────────────────────────────────────────────

def _url_template(path: str) -> str:
    """
    Normalise a URL path to a structural template by replacing variable
    segments (IDs and job-title slugs) with placeholders.

      /us/en/job/1200226/Account-Manager         →  /us/en/job/{id}/{slug}
      /us/en/jobs/opportunity/detail/3000076607  →  /us/en/jobs/opportunity/detail/{id}
      /careers/software-engineer-12345           →  /careers/{slug}
      /open-positions/product-manager-london     →  /open-positions/{slug}

    Rules:
      - Pure numeric              → {id}
      - UUID format               → {id}
      - Has hyphen AND len > 8    → {slug}  (job-title slugs like "Account-Manager")
      - len > 35                  → {slug}  (very long unhyphenated slugs)
      - Short structural segments → kept as-is  (us, en, job, careers, ...)
    """
    result = []
    for seg in path.split("/"):
        if not seg:
            result.append(seg)
        elif re.match(r"^\d+$", seg):
            result.append("{id}")
        elif re.match(
            r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
            seg, re.IGNORECASE,
        ):
            result.append("{id}")
        elif "-" in seg and len(seg) > 8:
            # Hyphenated slug: "Account-Manager", "req-123456", "senior-swe-nyc"
            result.append("{slug}")
        elif len(seg) > 35:
            result.append("{slug}")
        else:
            result.append(seg)
    return "/".join(result)


# ─── Layer 2: URL template clustering ─────────────────────────────────────────

def _cluster_job_links(
    candidates: list[tuple[str, str]],
    min_cluster_size: int = 3,
) -> dict:
    """
    Group candidates by URL template. Returns the dominant cluster(s) and the
    set of templates they share.

    Threshold cascade:
      1. >= min_cluster_size  (confident cluster)
      2. >= 2                 (small company fallback)

    Returns {"links": [...], "templates": set(...)}
    """
    if not candidates:
        return {"links": [], "templates": set()}

    groups: dict[str, list[tuple[str, str]]] = {}
    for url, text in candidates:
        path = urlparse(url).path.rstrip("/")
        tmpl = _url_template(path)
        groups.setdefault(tmpl, []).append((url, text))

    for threshold in (min_cluster_size, 2):
        matched = [links for links in groups.values() if len(links) >= threshold]
        if matched:
            # Prefer clusters whose URL template contains a numeric {id} segment.
            # Real job postings (e.g. /job/1198238/Senior-Engineer) have an ID;
            # category/department pages (e.g. /c/engineering-qa-jobs) do not.
            # If any ID-bearing clusters exist, discard the slug-only ones entirely.
            id_clusters = [
                links for links in matched
                if "{id}" in _url_template(urlparse(links[0][0]).path.rstrip("/"))
            ]
            if id_clusters:
                matched = id_clusters

            result_links: list[tuple[str, str]] = []
            result_templates: set[str] = set()
            for cluster_links in matched:
                result_links.extend(cluster_links)
                for url, _ in cluster_links:
                    result_templates.add(_url_template(urlparse(url).path.rstrip("/")))
            return {"links": result_links, "templates": result_templates}

    return {"links": [], "templates": set()}


# ─── Layer 3: DOM parent structure analysis ───────────────────────────────────

async def _dom_cluster_links(
    raw_candidates: list[tuple[str, str, object]],
) -> set[str]:
    """
    Find links that share a common parent container element.
    Links appearing as siblings inside the same container (e.g., a <ul> or
    job-card grid) are likely all the same type of content — job listings.
    Returns a set of URLs belonging to shared-container groups of 2+.
    """
    parent_groups: dict[str, list[str]] = {}

    for url, _text, locator in raw_candidates:
        if locator is None:
            continue
        try:
            parent_key = await locator.evaluate(
                """el => {
                    const p = el.closest('li, article, [class]');
                    return p ? (p.className || p.tagName || '') : '';
                }"""
            )
            key = str(parent_key).strip()
            if key and len(key) > 2:
                parent_groups.setdefault(key, []).append(url)
        except Exception:
            pass

    job_urls: set[str] = set()
    for urls in parent_groups.values():
        if len(urls) >= 2:
            job_urls.update(urls)
    return job_urls


# ─── Layer 5: Content sampling validation ────────────────────────────────────

async def _validate_job_cluster(sample_urls: list[str]) -> bool:
    """
    Fetch one sample URL from the detected cluster and check whether it looks
    like a job posting page. Returns True by default if the fetch fails so we
    never discard jobs due to a slow server.
    """
    if not sample_urls:
        return True
    try:
        async with httpx.AsyncClient(
            timeout=6, follow_redirects=True, headers=_HTTP_HEADERS
        ) as client:
            resp = await client.get(sample_urls[0])
            if resp.status_code != 200:
                return True
            text_lower = resp.text.lower()
            signals = sum(
                1 for p in _JOB_PAGE_SIGNALS if re.search(p, text_lower, re.IGNORECASE)
            )
            # 1+ signal = likely a job page; 0 = might be wrong cluster
            return signals >= 1
    except Exception:
        return True  # optimistic default


# ─── JSON-LD extraction (Layer 1 + location map) ──────────────────────────────

def _parse_jsonld_location(item: dict) -> str | None:
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
    if country and country not in ("US", "USA", "United States"):
        parts.append(country)
    return ", ".join(parts) if parts else None


async def _extract_jsonld_jobs(page: Page) -> list[dict]:
    """
    Layer 1: Extract job listings directly from JSON-LD JobPosting schema.
    When 2+ jobs are found here, the result is used as-is — no clustering needed.
    """
    jobs: list[dict] = []
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
                for graph_item in [item] + item.get("@graph", []):
                    if graph_item.get("@type") != "JobPosting":
                        continue

                    job_url = (
                        graph_item.get("url")
                        or graph_item.get("sameAs")
                        or (
                            graph_item.get("identifier", {}).get("value")
                            if isinstance(graph_item.get("identifier"), dict)
                            else None
                        )
                    )
                    title = (graph_item.get("title") or graph_item.get("name") or "").strip()
                    if not job_url or not title:
                        continue

                    company = ""
                    hiring_org = graph_item.get("hiringOrganization", {})
                    if isinstance(hiring_org, dict):
                        company = hiring_org.get("name", "").strip()

                    location = _parse_jsonld_location(graph_item)
                    if job_url and location:
                        location_map[job_url] = location

                    # Salary extraction
                    salary_raw = None
                    base_salary = graph_item.get("baseSalary", {})
                    if isinstance(base_salary, dict):
                        value = base_salary.get("value", {})
                        currency = base_salary.get("currency", "")
                        if isinstance(value, dict):
                            min_v = value.get("minValue")
                            max_v = value.get("maxValue")
                            if min_v and max_v:
                                salary_raw = f"{currency}{min_v}–{max_v}"
                        elif isinstance(value, (int, float)):
                            salary_raw = f"{currency}{value}"

                    description = graph_item.get("description", "")
                    if len(description) > 6000:
                        description = description[:6000]

                    jobs.append({
                        "title": title,
                        "company_name": company,
                        "apply_url": job_url.strip(),
                        "location": location,
                        "description": description or f"{title} at {company}. Visit the posting for full details.",
                        "salary_raw": salary_raw,
                        "salary_min": None,
                        "salary_max": None,
                        "salary_currency": None,
                        "posted_at": graph_item.get("datePosted"),
                    })
    except Exception:
        pass
    return jobs


# ─── Location enrichment ──────────────────────────────────────────────────────

async def _fetch_location_from_job_page(job_url: str) -> str | None:
    try:
        async with httpx.AsyncClient(
            timeout=8, follow_redirects=True, headers=_HTTP_HEADERS
        ) as client:
            resp = await client.get(job_url)
            if resp.status_code != 200:
                return None
            html = resp.text

        # JSON-LD on the job page
        for block in re.findall(
            r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
            html, re.DOTALL | re.IGNORECASE,
        ):
            try:
                data = json.loads(block)
                for item in (data if isinstance(data, list) else [data]):
                    for candidate in [item] + item.get("@graph", []):
                        if candidate.get("@type") == "JobPosting":
                            loc = _parse_jsonld_location(candidate)
                            if loc:
                                return loc
            except Exception:
                pass

        # <title> tag heuristic  e.g. "Engineer – Remote | Stripe"
        title_match = re.search(r"<title>([^<]+)</title>", html, re.IGNORECASE)
        if title_match:
            loc_match = re.search(
                r"[-–|]\s*(Remote|Hybrid|On.?[Ss]ite|(?:[A-Z][a-z]+ )*[A-Z]{2})\s*(?:[-–|]|$)",
                title_match.group(1),
            )
            if loc_match:
                return loc_match.group(1).strip()

        # Common location CSS class patterns
        loc_match = re.search(
            r'class="[^"]*(?:location|job-location|posting-location)[^"]*"[^>]*>\s*([^<]{3,80})\s*<',
            html, re.IGNORECASE,
        )
        if loc_match:
            loc_text = loc_match.group(1).strip()
            if 2 < len(loc_text) < 80:
                return loc_text
    except Exception:
        pass
    return None


async def _enrich_locations(jobs: list[dict], max_concurrent: int = 5) -> list[dict]:
    """Fire concurrent httpx requests to fill missing location fields."""
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
            await asyncio.sleep(0.1)
            return idx, loc

    for outcome in await asyncio.gather(*[fetch_one(i) for i in missing], return_exceptions=True):
        if isinstance(outcome, Exception):
            continue
        idx, loc = outcome
        if loc:
            jobs[idx]["location"] = loc

    return jobs


# ─── HTML link parsing (for httpx-fetched paginated pages) ────────────────────

class _LinkParser(HTMLParser):
    def __init__(self, base_url: str):
        super().__init__()
        self._base = base_url
        self.links: list[tuple[str, str]] = []
        self._href: str | None = None
        self._buf: list[str] = []

    def handle_starttag(self, tag: str, attrs: list) -> None:
        if tag == "a":
            attrs_d = dict(attrs)
            href = attrs_d.get("href", "")
            if href and not href.startswith(("#", "javascript:", "mailto:", "tel:")):
                self._href = urljoin(self._base, href)
                self._buf = []

    def handle_endtag(self, tag: str) -> None:
        if tag == "a" and self._href:
            text = " ".join(" ".join(self._buf).split()).strip()
            if text:
                self.links.append((self._href, text))
            self._href = None
            self._buf = []

    def handle_data(self, data: str) -> None:
        if self._href is not None:
            self._buf.append(data)


def _parse_html_links(html: str, base_url: str) -> list[tuple[str, str]]:
    parser = _LinkParser(base_url)
    try:
        parser.feed(html)
    except Exception:
        pass
    return parser.links


# ─── Pagination detection ─────────────────────────────────────────────────────

def _extract_pagination_pattern(page1_url: str, page2_url: str) -> dict | None:
    """
    Derive the pagination parameter by comparing the page-1 and page-2 URLs.
    Returns a pattern dict or None if no numeric difference is found.
    """
    p1 = urlparse(page1_url)
    p2 = urlparse(page2_url)

    # Query-parameter pagination (most common)
    p1_params = dict(parse_qsl(p1.query))
    p2_params = dict(parse_qsl(p2.query))

    for key, val2 in p2_params.items():
        val1 = p1_params.get(key, "0")
        try:
            n1, n2 = int(val1), int(val2)
            if n2 > n1:
                return {"type": "query", "param": key, "step": n2 - n1, "page1_value": n1}
        except (ValueError, TypeError):
            pass

    # New query parameter introduced on page 2
    for key, val2 in p2_params.items():
        if key not in p1_params:
            try:
                n2 = int(val2)
                if n2 > 0:
                    return {"type": "query", "param": key, "step": n2, "page1_value": 0}
            except (ValueError, TypeError):
                pass

    # Path-segment pagination (e.g., /jobs/page/2 or /jobs/2)
    p1_parts = [s for s in p1.path.split("/") if s]
    p2_parts = [s for s in p2.path.split("/") if s]

    if len(p1_parts) == len(p2_parts):
        for i, (s1, s2) in enumerate(zip(p1_parts, p2_parts)):
            if s1 != s2:
                try:
                    n1 = int(s1) if s1.isdigit() else 1
                    n2 = int(s2)
                    if n2 > n1:
                        return {
                            "type": "path", "segment_index": i,
                            "step": n2 - n1, "page1_value": n1,
                        }
                except (ValueError, TypeError):
                    pass
    elif len(p2_parts) == len(p1_parts) + 1:
        # Appended page number (e.g., /jobs → /jobs/2)
        last = p2_parts[-1]
        if last.isdigit() and int(last) == 2:
            return {
                "type": "path_append", "step": 1,
                "page1_value": 1, "base_path": p1.path,
            }

    return None


def _generate_page_urls(pattern: dict, base_url: str, total_pages: int) -> list[str]:
    """Generate URLs for pages 2 … total_pages from a detected pagination pattern."""
    parsed = urlparse(base_url)
    urls = []

    for page_num in range(2, total_pages + 1):
        if pattern["type"] == "query":
            params = dict(parse_qsl(parsed.query))
            val = pattern["page1_value"] + (page_num - 1) * pattern["step"]
            params[pattern["param"]] = str(val)
            urls.append(urlunparse(parsed._replace(query=urlencode(params))))

        elif pattern["type"] == "path":
            parts = parsed.path.split("/")
            non_empty_idx = [j for j, s in enumerate(parts) if s]
            seg_idx = pattern["segment_index"]
            if seg_idx < len(non_empty_idx):
                val = pattern["page1_value"] + (page_num - 1) * pattern["step"]
                parts[non_empty_idx[seg_idx]] = str(val)
            urls.append(urlunparse(parsed._replace(path="/".join(parts))))

        elif pattern["type"] == "path_append":
            base = pattern["base_path"].rstrip("/")
            urls.append(urlunparse(parsed._replace(path=f"{base}/{page_num}")))

    return urls


async def _estimate_total_pages(page: Page, max_cap: int = 100) -> int:
    """Find the highest page number linked from pagination controls."""
    try:
        max_page = 1
        for link in await page.locator("a[href]").all():
            try:
                text = (await link.inner_text(timeout=150)).strip()
                if re.match(r"^\d+$", text):
                    n = int(text)
                    if 2 <= n <= max_cap:
                        max_page = max(max_page, n)
            except Exception:
                pass
        return min(max_page, max_cap)
    except Exception:
        return 10  # conservative fallback


async def _detect_url_pagination(page: Page, base_url: str) -> dict | None:
    """
    Detect URL-based pagination from the current Playwright page.
    Returns {pattern, base_url, total_pages} or None.
    """
    # Strategy 1: rel="next" (most reliable canonical signal)
    try:
        next_href = await page.locator('a[rel="next"]').first.get_attribute(
            "href", timeout=800
        )
        if next_href:
            next_url = urljoin(base_url, next_href)
            pattern = _extract_pagination_pattern(base_url, next_url)
            if pattern:
                total = await _estimate_total_pages(page)
                return {"pattern": pattern, "base_url": base_url, "total_pages": total}
    except Exception:
        pass

    # Strategy 2: numbered page links
    try:
        page_map: dict[int, str] = {}
        for link in await page.locator("a[href]").all():
            try:
                text = (await link.inner_text(timeout=150)).strip()
                href = await link.get_attribute("href", timeout=150)
                if href and re.match(r"^\d+$", text) and 2 <= int(text) <= 500:
                    page_map[int(text)] = urljoin(base_url, href)
            except Exception:
                pass

        if page_map:
            p2_url = page_map.get(2)
            if p2_url:
                pattern = _extract_pagination_pattern(base_url, p2_url)
                if pattern:
                    return {
                        "pattern": pattern,
                        "base_url": base_url,
                        "total_pages": min(max(page_map.keys()), 100),
                    }
    except Exception:
        pass

    return None


async def _fetch_page_links_httpx(
    url: str,
    known_templates: set[str],
    base_url: str,
    semaphore: asyncio.Semaphore,
) -> list[tuple[str, str]]:
    """Fetch one paginated page via httpx and return job links matching known templates."""
    async with semaphore:
        try:
            async with httpx.AsyncClient(
                timeout=10, follow_redirects=True, headers=_HTTP_HEADERS
            ) as client:
                resp = await client.get(url)
                if resp.status_code != 200:
                    return []

            results: list[tuple[str, str]] = []
            seen: set[str] = set()
            for href, text in _parse_html_links(resp.text, url):
                text = text.strip()
                if not text or len(text) < 5 or len(text) > 110:
                    continue
                if text.lower() in _NAV_SKIP:
                    continue
                if not _is_same_domain(href, base_url):
                    continue
                path = urlparse(href).path.rstrip("/")
                if not path:
                    continue
                if _url_template(path) in known_templates and href not in seen:
                    seen.add(href)
                    results.append((href, text))
            return results
        except Exception:
            return []


async def _fetch_paginated_links(
    pagination: dict,
    known_templates: set[str],
    base_url: str,
    max_concurrent: int = 8,
) -> list[tuple[str, str]]:
    """
    Fetch all remaining pages concurrently via httpx.
    Stops early once a batch returns no matching links (pages exhausted).
    """
    page_urls = _generate_page_urls(
        pagination["pattern"], base_url, pagination["total_pages"]
    )
    if not page_urls:
        return []

    semaphore = asyncio.Semaphore(max_concurrent)
    all_links: list[tuple[str, str]] = []

    for batch_start in range(0, len(page_urls), max_concurrent):
        batch = page_urls[batch_start : batch_start + max_concurrent]
        results = await asyncio.gather(
            *[_fetch_page_links_httpx(u, known_templates, base_url, semaphore) for u in batch],
            return_exceptions=True,
        )
        batch_links: list[tuple[str, str]] = []
        for r in results:
            if isinstance(r, list):
                batch_links.extend(r)

        all_links.extend(batch_links)
        if not batch_links:
            break  # remaining pages are empty — stop early

    return all_links


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


async def _scroll_to_load_dynamic(page: Page, max_rounds: int = 12) -> None:
    """
    Scroll incrementally and stop as soon as no new links appear between rounds.
    More efficient than a fixed number of scrolls.
    """
    prev_count = 0
    for _ in range(max_rounds):
        await page.evaluate("window.scrollBy(0, window.innerHeight * 1.5)")
        await asyncio.sleep(0.7)
        current_count = await page.locator("a[href]").count()
        if current_count == prev_count:
            break
        prev_count = current_count
    await page.evaluate("window.scrollTo(0, 0)")


async def _click_load_more(page: Page, max_clicks: int = 15) -> int:
    """
    Click 'Load more' style buttons repeatedly until none are visible or
    clicking produces no new links. Returns the number of successful clicks.
    """
    clicks = 0
    for _ in range(max_clicks):
        prev_count = await page.locator("a[href]").count()
        clicked = False
        for selector in _LOAD_MORE_SELECTORS:
            try:
                btn = page.locator(selector).first
                if await btn.is_visible(timeout=400):
                    await btn.scroll_into_view_if_needed(timeout=500)
                    await btn.click(timeout=1000)
                    await page.wait_for_timeout(1500)
                    clicked = True
                    clicks += 1
                    break
            except Exception:
                pass
        if not clicked:
            break
        new_count = await page.locator("a[href]").count()
        if new_count <= prev_count:
            break  # button clicked but no new content appeared
    return clicks


async def _try_get_location_near_link(link_locator) -> str | None:
    """DOM heuristic: inspect the parent container for location text."""
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
            if re.match(r"^[A-Z][a-zA-Z\s]+,\s*[A-Z]{2}$", line):
                return line
    except Exception:
        pass
    return None


# ─── Job dict builder ─────────────────────────────────────────────────────────

def _build_job_dict(vr: dict, company_name: str) -> dict:
    """Build a raw job dict from a validated CandidateSignals result."""
    title = vr["extracted_title"] or vr["anchor_text"]
    description = vr["extracted_description"] or (
        f"{title} at {company_name}. "
        "Visit the job posting for the full description and requirements."
    )
    return {
        "title":           title,
        "company_name":    company_name,
        "apply_url":       vr["url"],
        "location":        vr["extracted_location"],
        "description":     description,
        "salary_raw":      vr.get("extracted_salary_raw"),
        "salary_min":      None,
        "salary_max":      None,
        "salary_currency": None,
        "posted_at":       None,
    }


# ─── Main scraper ─────────────────────────────────────────────────────────────

async def scrape_career_page(
    url: str,
    company_name: str,
    skip_urls: set[str] | None = None,
    skip_domains: set[str] | None = None,
) -> tuple[list[dict], list[dict]]:
    """
    Navigate to a company's career page and extract all job listings.

    Detection runs through five layers (see module docstring). Each candidate
    URL is validated by validator.py before being accepted as a job posting.

    Args:
        url:          Career page URL to scrape.
        company_name: Human-readable company name (used in logging + job dicts).
        skip_urls:    Normalised URLs to skip (already in the validation cache).
        skip_domains: Domains currently in backoff (from domain health check).

    Returns:
        (accepted_jobs, all_validation_results) — caller writes cache + health.
    """
    results: list[dict] = []
    detection_method = "none"
    validation_results: list[dict] = []
    discovered_by_map: dict[str, str] = {}

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

            # ── 1. JSON-LD job extraction (Layer 1) ───────────────────────────
            jsonld_jobs = await _extract_jsonld_jobs(page)
            # Build location map from JSON-LD for use in result construction
            jsonld_location_map = {
                j["apply_url"]: j["location"]
                for j in jsonld_jobs
                if j.get("location")
            }

            # ── 2. Dynamic scroll + load-more ─────────────────────────────────
            await _scroll_to_load_dynamic(page)
            load_more_clicks = await _click_load_more(page)
            if load_more_clicks > 0:
                await _scroll_to_load_dynamic(page)

            # ── 3. Detect iframe-based ATS ────────────────────────────────────
            frame = page.main_frame
            for f in page.frames:
                if f.url and any(
                    d in f.url
                    for d in ("myworkdayjobs", "icims", "taleo", "successfactors")
                ):
                    frame = f
                    break

            # ── 4. Collect candidate links ────────────────────────────────────
            raw_candidates: list[tuple[str, str, object]] = []
            seen_urls: set[str] = set()

            for link in await frame.locator("a[href]").all():
                try:
                    href = await link.get_attribute("href", timeout=500)
                    text = re.sub(
                        r"\s+", " ", (await link.inner_text(timeout=500)).strip()
                    )
                except Exception:
                    continue

                if not _is_candidate_link(href, text, url):
                    continue

                full_url = urljoin(url, href)
                if full_url in seen_urls:
                    continue
                seen_urls.add(full_url)
                raw_candidates.append((full_url, text, link))

            # ── 5. Multi-layer job URL detection ──────────────────────────────

            if len(jsonld_jobs) >= 2:
                # Layer 1 — JSON-LD: high confidence, use directly
                job_url_set = {j["apply_url"] for j in jsonld_jobs}
                known_templates = {
                    _url_template(urlparse(u).path.rstrip("/")) for u in job_url_set
                }
                detection_method = "jsonld"

            else:
                # Layer 2 — URL template clustering
                cluster_result = _cluster_job_links(
                    [(u, t) for u, t, _ in raw_candidates],
                    min_cluster_size=3,
                )
                job_url_set = {u for u, _ in cluster_result["links"]}
                known_templates: set[str] = cluster_result["templates"]
                for url_item, _ in cluster_result["links"]:
                    discovered_by_map.setdefault(url_item, "cluster")

                # Layer 3 — DOM parent structure analysis
                dom_urls = await _dom_cluster_links(raw_candidates)
                job_url_set |= dom_urls
                for url_item in dom_urls:
                    discovered_by_map.setdefault(url_item, "dom")

                # Layer 4 — is_child_of_base supplement
                # Only add URLs that match the cluster templates already established by
                # Layer 2. Without this guard, broad category/department listing pages
                # (e.g. /c/engineering-qa-jobs on HPE) would be accepted because they
                # share the same base path as real job postings. If no templates were
                # found yet we fall back to the original behaviour.
                base_path = urlparse(url).path.rstrip("/")
                if "." in base_path.split("/")[-1]:
                    base_path = base_path.rsplit("/", 1)[0]
                for full_url, _, _ in raw_candidates:
                    if full_url not in job_url_set:
                        candidate_path = urlparse(full_url).path.rstrip("/")
                        if base_path and candidate_path.startswith(base_path + "/"):
                            if not known_templates or _url_template(candidate_path) in known_templates:
                                job_url_set.add(full_url)
                                discovered_by_map.setdefault(full_url, "base_path")

                # Layer 5 — Content sampling validation
                sample = [u for u in list(job_url_set)[:3]]
                if sample and not await _validate_job_cluster(sample):
                    print(
                        f"[SCRAPER] {company_name}: content sampling returned low confidence"
                        " — proceeding, but check results"
                    )

                detection_method = "cluster+dom+base"

            # ── 6. URL-pattern pagination (httpx, parallel) ───────────────────
            if known_templates:
                pagination = await _detect_url_pagination(page, url)
                if pagination:
                    extra_links = await _fetch_paginated_links(
                        pagination, known_templates, url
                    )
                    for href, text in extra_links:
                        if href not in seen_urls:
                            seen_urls.add(href)
                            job_url_set.add(href)
                            raw_candidates.append((href, text, None))
                            discovered_by_map.setdefault(href, "pagination")

            # ── 7. Validate candidates and build job dicts ────────────────────
            # Lazy imports: validator imports _url_template from this module, so
            # importing at module level would create a circular import.
            from validator import validate_candidates as _validate_candidates
            from scrape_cache import normalize_url as _normalize_url

            skip_url_normalized = skip_urls or set()
            skip_domain_set     = skip_domains or set()

            candidates_to_validate: list[tuple[str, str, str]] = []
            for full_url, text, _ in raw_candidates:
                if full_url not in job_url_set:
                    continue
                # Tier 2: anchor text — reject category listing page link text
                if _CATEGORY_TITLE_RE.search(text):
                    print(f"[SCRAPER] {company_name}: pre-filter anchor — {text!r}")
                    continue
                # Tier 3: domain health — skip domains in backoff
                domain = urlparse(full_url).netloc
                if domain in skip_domain_set:
                    print(f"[SCRAPER] {company_name}: pre-filter domain health — {domain}")
                    continue
                # Tier 4: URL cache dedup — skip already-validated URLs
                if _normalize_url(full_url) in skip_url_normalized:
                    print(f"[SCRAPER] {company_name}: pre-filter cache hit — {full_url}")
                    continue
                candidates_to_validate.append((
                    full_url,
                    text,
                    discovered_by_map.get(full_url, "cluster"),
                ))

            if candidates_to_validate:
                validation_results = await _validate_candidates(
                    candidates_to_validate,
                    known_templates=known_templates,
                )
                for vr in validation_results:
                    print(
                        f"[VALIDATOR] {company_name} | {vr['page_type_guess']} | "
                        f"score={vr['score']} accept={vr['accept']} | "
                        f"reason={vr['rejection_reason']} | {vr['url']}"
                    )
                    if not vr["accept"]:
                        continue
                    results.append(_build_job_dict(vr, company_name))

            # JSON-LD jobs bypass the validator — add any not already in results
            crawled_urls = {r["apply_url"] for r in results}
            for j in jsonld_jobs:
                if j["apply_url"] not in crawled_urls:
                    results.append(j)

        except PlaywrightTimeout:
            print(f"[SCRAPER TIMEOUT] {company_name} ({url}) — page took too long to load")
        except Exception as e:
            print(f"[SCRAPER ERROR] {company_name} ({url}): {e}")
        finally:
            await context.close()
            await browser.close()

    # ── 8. Final location fallback + deduplication ───────────────────────────
    # Note: HTTP-based location enrichment is intentionally not run here.
    # jobs_runner.py calls _enrich_locations() *after* the title pre-filter so
    # we only fire HTTP requests for jobs that matched the candidate's profile.
    seen: set[str] = set()
    deduped: list[dict] = []
    for job in results:
        if not job.get("location"):
            job["location"] = "See posting"
        if job["apply_url"] not in seen:
            seen.add(job["apply_url"])
            deduped.append(job)

    print(
        f"[SCRAPER] {company_name}: {len(deduped)} postings "
        f"(method={detection_method}) at {url}"
    )
    return deduped, validation_results


# ─── Lightweight preview (used at company-add time) ───────────────────────────

async def preview_career_page(url: str) -> dict:
    """
    Quick scrape for company-add-time validation.
    Runs page-1 detection only (no pagination, no location enrichment, no Claude).
    Returns a preview dict the API can send back to the frontend.
    """
    try:
        parsed = urlparse(url)
        if not parsed.scheme or not parsed.netloc:
            return {
                "status": "invalid_url",
                "job_count": 0,
                "samples": [],
                "message": "Invalid URL format.",
            }
    except Exception:
        return {
            "status": "invalid_url",
            "job_count": 0,
            "samples": [],
            "message": "Invalid URL format.",
        }

    # Run a quick single-page scrape (pagination disabled for speed)
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        context = await browser.new_context(
            user_agent=_HTTP_HEADERS["User-Agent"],
            viewport={"width": 1280, "height": 900},
        )
        page = await context.new_page()
        job_titles: list[str] = []
        status = "ok"
        message = ""

        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=20_000)
            await page.wait_for_timeout(2_000)
            await _dismiss_overlays(page)
            await _scroll_to_load_dynamic(page, max_rounds=4)

            jsonld_jobs = await _extract_jsonld_jobs(page)
            if len(jsonld_jobs) >= 2:
                job_titles = [j["title"] for j in jsonld_jobs]
            else:
                links = await page.main_frame.locator("a[href]").all()
                candidates: list[tuple[str, str]] = []
                seen: set[str] = set()
                for link in links:
                    try:
                        href = await link.get_attribute("href", timeout=400)
                        text = re.sub(r"\s+", " ", (await link.inner_text(timeout=400)).strip())
                    except Exception:
                        continue
                    if not _is_candidate_link(href, text, url):
                        continue
                    full_url = urljoin(url, href)
                    if full_url not in seen:
                        seen.add(full_url)
                        candidates.append((full_url, text))

                cluster_result = _cluster_job_links(candidates, min_cluster_size=3)
                job_titles = [t for _, t in cluster_result["links"]]

            if not job_titles:
                status = "no_jobs"
                message = (
                    "No job postings were detected at this URL. "
                    "Try providing the page that lists all open positions."
                )

        except PlaywrightTimeout:
            status = "timeout"
            message = "Page took too long to load. The URL may require login or block automated access."
        except Exception as e:
            status = "error"
            message = f"Could not load page: {e}"
        finally:
            await context.close()
            await browser.close()

    return {
        "status": status,
        "job_count": len(job_titles),
        "samples": job_titles[:5],
        "message": message or f"Found {len(job_titles)} job postings.",
    }

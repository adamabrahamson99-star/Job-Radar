"""
validator.py — Candidate URL validation layer for the watchlist scraper.

Pure async function layer. No DB writes — callers (jobs_runner.py) handle persistence.

Public API:
    validate_candidates(candidates, known_templates, ...) -> list[CandidateSignals]
"""

from __future__ import annotations

import asyncio
import os
import re
import time
from collections import defaultdict
from datetime import datetime, timezone
from typing import Literal, TypedDict
from urllib.parse import urljoin, urlparse

import httpx

from scraper import _url_template  # shared URL template normaliser


# ─── Configuration (overridable via env vars) ──────────────────────────────────

VALIDATOR_MAX_CONCURRENT    = int(os.getenv("VALIDATOR_MAX_CONCURRENT",    "10"))
VALIDATOR_PER_DOMAIN_MAX    = int(os.getenv("VALIDATOR_PER_DOMAIN_MAX",    "2"))
VALIDATOR_TIMEOUT_SEC       = float(os.getenv("VALIDATOR_TIMEOUT_SEC",     "8.0"))
VALIDATOR_RETRY_ATTEMPTS    = int(os.getenv("VALIDATOR_RETRY_ATTEMPTS",    "2"))
VALIDATOR_RETRY_BACKOFF_SEC = float(os.getenv("VALIDATOR_RETRY_BACKOFF_SEC", "1.5"))

RETRYABLE_STATUS = {429, 500, 502, 503, 504}

_ANTI_BOT_SIGNALS = [
    "cf-challenge", "cf-chl", "cloudflare", "verify you are human",
    "please complete the security check", "access denied", "robot check",
]

# Titles that indicate a generic / non-job page even if the h1 length passes.
_GENERIC_TITLE_RE = re.compile(
    r"^(home|jobs|careers|job search|search results?|all jobs?|"
    r"open positions?|opportunities|find a job|apply now|"
    r"job listings?|current openings?|vacancies|work with us|"
    r"join (?:our )?team|browse jobs?)$",
    re.IGNORECASE,
)


# ─── TypedDicts ────────────────────────────────────────────────────────────────

PageType = Literal["job_detail", "listing", "non_job", "unknown"]


class CandidateSignals(TypedDict):
    # ── Source ────────────────────────────────────────────────────────────────
    url:                         str
    anchor_text:                 str          # original link text from discovery
    discovered_by:               str          # "cluster"|"dom"|"base_path"|"pagination"

    # ── Extracted content ─────────────────────────────────────────────────────
    extracted_title:             str | None   # from <h1> or <title>, not anchor text
    extracted_location:          str | None   # from location CSS class or JSON-LD
    extracted_description:       str | None   # ~500-char body snippet for Claude scoring

    # ── Signals (boolean) ─────────────────────────────────────────────────────
    has_job_title:               bool   # extracted_title exists, len 5-120, not generic
    has_apply_signal:            bool   # apply button or apply link found
    has_qualifications_signal:   bool   # "qualifications", "requirements", etc.
    has_responsibilities_signal: bool   # "responsibilities", "what you'll do", etc.
    has_location_signal:         bool   # location keyword or value found
    has_req_id_signal:           bool   # "req #", "requisition", "job id" found
    has_structured_schema:       bool   # JSON-LD JobPosting found on individual page
    has_single_job_focus:        bool   # page has fewer than 8 links matching job templates

    # ── Derived ───────────────────────────────────────────────────────────────
    page_type_guess:             PageType
    score:                       int          # 0–3 in V1
    needs_review:                bool         # not accept and score >= 2

    # ── Decision ──────────────────────────────────────────────────────────────
    accept:                      bool
    rejection_reason:            str | None   # None if accepted

    # ── Operational metadata ──────────────────────────────────────────────────
    fetched_at:                  str | None   # ISO 8601 UTC
    http_status:                 int | None
    final_url:                   str | None   # URL after redirects
    fetch_error_type:            str | None   # "timeout"|"connection_error"|"http_4xx"|
                                              # "http_5xx"|"http_429"|"anti_bot"|None
    validation_duration_ms:      int | None


# ─── Failed result helper ──────────────────────────────────────────────────────

def _make_failed_result(
    url: str,
    anchor_text: str,
    discovered_by: str,
    error_type: str,
    http_status: int | None = None,
) -> CandidateSignals:
    """Returns a rejected CandidateSignals for fetch failures."""
    return {
        "url":                         url,
        "anchor_text":                 anchor_text,
        "discovered_by":               discovered_by,
        "extracted_title":             None,
        "extracted_location":          None,
        "extracted_description":       None,
        "has_job_title":               False,
        "has_apply_signal":            False,
        "has_qualifications_signal":   False,
        "has_responsibilities_signal": False,
        "has_location_signal":         False,
        "has_req_id_signal":           False,
        "has_structured_schema":       False,
        "has_single_job_focus":        True,
        "page_type_guess":             "unknown",
        "score":                       0,
        "needs_review":                False,
        "accept":                      False,
        "rejection_reason":            error_type,
        "fetched_at":                  datetime.now(timezone.utc).isoformat(),
        "http_status":                 http_status,
        "final_url":                   None,
        "fetch_error_type":            error_type,
        "validation_duration_ms":      None,
    }


# ─── Retry fetch ──────────────────────────────────────────────────────────────

async def _fetch_with_retry(
    client: httpx.AsyncClient,
    url: str,
    attempts: int,
    backoff_sec: float,
) -> httpx.Response | None:
    """
    Fetch url with exponential backoff on retryable status codes and network errors.
    Returns the response (possibly a non-200) or None on total failure.
    Respects Retry-After header on 429 responses.
    """
    for attempt in range(attempts):
        try:
            resp = await client.get(url, follow_redirects=True)
            if resp.status_code not in RETRYABLE_STATUS:
                return resp
            # Respect Retry-After on 429
            if resp.status_code == 429:
                retry_after = resp.headers.get("Retry-After")
                if retry_after:
                    try:
                        wait = min(int(retry_after), 60)
                        await asyncio.sleep(wait)
                        continue
                    except ValueError:
                        pass
            if attempt < attempts - 1:
                await asyncio.sleep(backoff_sec * (2 ** attempt))
        except httpx.TimeoutException:
            if attempt < attempts - 1:
                await asyncio.sleep(backoff_sec * (2 ** attempt))
            else:
                raise
        except httpx.ConnectError:
            if attempt < attempts - 1:
                await asyncio.sleep(backoff_sec * (2 ** attempt))
            else:
                raise
    return None


# ─── Signal extraction ────────────────────────────────────────────────────────

def _extract_title(html: str) -> str | None:
    """
    Extract a job title from HTML.
    Priority: first <h1> → <title> first segment → None.
    Accepts strings of length 5–120 that aren't generic page titles.
    """
    # 1. First <h1>
    h1_match = re.search(r"<h1[^>]*>(.*?)</h1>", html, re.IGNORECASE | re.DOTALL)
    if h1_match:
        candidate = re.sub(r"<[^>]+>", "", h1_match.group(1)).strip()
        if 5 <= len(candidate) <= 120 and not _GENERIC_TITLE_RE.match(candidate):
            return candidate

    # 2. <title> first segment
    title_match = re.search(r"<title[^>]*>(.*?)</title>", html, re.IGNORECASE | re.DOTALL)
    if title_match:
        raw = re.sub(r"<[^>]+>", "", title_match.group(1)).strip()
        # Split on common separators, take the first meaningful segment
        for sep in (" - ", " | ", " – ", " — "):
            if sep in raw:
                raw = raw.split(sep)[0].strip()
                break
        if 5 <= len(raw) <= 120 and not _GENERIC_TITLE_RE.match(raw):
            return raw

    return None


def _extract_location(html: str) -> str | None:
    """
    Extract location string from common CSS class patterns or JSON-LD.
    Returns the first match found, or None.
    """
    # Common location CSS class patterns
    loc_class_match = re.search(
        r'class=["\'][^"\']*(?:location|job-location|posting-location|job__location)'
        r'[^"\']*["\'][^>]*>\s*([^<]{2,80})',
        html,
        re.IGNORECASE,
    )
    if loc_class_match:
        candidate = loc_class_match.group(1).strip()
        if candidate:
            return candidate

    # JSON-LD jobLocation
    jsonld_loc = re.search(
        r'"jobLocation"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]{2,80})"',
        html,
        re.IGNORECASE,
    )
    if jsonld_loc:
        return jsonld_loc.group(1).strip()

    return None


def _extract_description(html: str) -> str | None:
    """
    Extract a ~500-char plain text snippet from the job description body.
    Strips script/style blocks and HTML tags. Returns None if nothing useful found.
    """
    # Remove script and style blocks
    cleaned = re.sub(r"<(script|style)[^>]*>.*?</(script|style)>", "", html,
                     flags=re.IGNORECASE | re.DOTALL)
    # Remove all remaining tags
    text = re.sub(r"<[^>]+>", " ", cleaned)
    # Collapse whitespace
    text = re.sub(r"\s+", " ", text).strip()

    if len(text) < 50:
        return None

    # Try to find a region that looks like job body content by anchoring on signals
    anchor_match = re.search(
        r"(responsibilities|qualifications?|requirements?|what you.{0,15}do|"
        r"what you.{0,15}need|your role)",
        text,
        re.IGNORECASE,
    )
    if anchor_match:
        start = max(0, anchor_match.start() - 50)
        return text[start : start + 500].strip()

    # Fallback: first 500 chars of body text
    return text[:500].strip()


def _extract_signals(html: str, url: str, known_templates: set[str]) -> dict:
    """
    Extract all boolean signals from the fetched HTML in a single pass.
    Returns a plain dict — callers convert to CandidateSignals fields.
    """
    # ── Content signals ───────────────────────────────────────────────────────
    has_apply_signal = bool(re.search(
        r"<(button|a)[^>]*>\s*(apply|apply now|apply for this job|apply here)\s*</(button|a)>",
        html, re.IGNORECASE,
    )) or bool(re.search(
        r'href=["\'][^"\']*apply[^"\']*["\']',
        html, re.IGNORECASE,
    ))

    has_qualifications_signal = bool(re.search(
        r"\b(qualifications?|requirements?|what you.{0,10}need|what we.{0,15}looking for)\b",
        html, re.IGNORECASE,
    ))

    has_responsibilities_signal = bool(re.search(
        r"\b(responsibilities|what you.{0,15}do|your role|day.to.day|you will)\b",
        html, re.IGNORECASE,
    ))

    has_location_signal = bool(re.search(
        r"\b(remote|hybrid|on.?site|location|new york|san francisco|chicago|"
        r"london|austin|seattle|boston|denver|los angeles|washington)\b",
        html, re.IGNORECASE,
    ))

    has_req_id_signal = bool(re.search(
        r"\b(req(?:uisition)?[\s#:]*\d+|job\s+(?:id|#|number)[\s:]*[\w-]+|"
        r"job\s+code[\s:]*\w+)\b",
        html, re.IGNORECASE,
    ))

    has_structured_schema = (
        '"@type":"JobPosting"' in html or '"@type": "JobPosting"' in html
    )

    # ── Single-job focus: count links matching known job URL templates ─────────
    job_link_count = 0
    for href_match in re.finditer(r'href=["\']([^"\']+)["\']', html):
        path = urlparse(urljoin(url, href_match.group(1))).path.rstrip("/")
        if _url_template(path) in known_templates:
            job_link_count += 1
            if job_link_count >= 8:
                break
    has_single_job_focus = job_link_count < 8

    # ── Extracted content ─────────────────────────────────────────────────────
    extracted_title    = _extract_title(html)
    extracted_location = _extract_location(html)
    extracted_description = _extract_description(html)

    has_job_title = (
        extracted_title is not None
        and 5 <= len(extracted_title) <= 120
        and not _GENERIC_TITLE_RE.match(extracted_title)
    )

    return {
        "extracted_title":             extracted_title,
        "extracted_location":          extracted_location,
        "extracted_description":       extracted_description,
        "has_job_title":               has_job_title,
        "has_apply_signal":            has_apply_signal,
        "has_qualifications_signal":   has_qualifications_signal,
        "has_responsibilities_signal": has_responsibilities_signal,
        "has_location_signal":         has_location_signal,
        "has_req_id_signal":           has_req_id_signal,
        "has_structured_schema":       has_structured_schema,
        "has_single_job_focus":        has_single_job_focus,
    }


# ─── Page type + scoring + acceptance ─────────────────────────────────────────

def _derive_page_type(s: dict) -> PageType:
    # Check listing first — a listing page can still have a title and apply links
    if not s["has_single_job_focus"]:
        return "listing"
    if s["has_job_title"] and (s["has_apply_signal"] or s["has_structured_schema"]):
        return "job_detail"
    if s["has_job_title"] or s["has_apply_signal"]:
        return "unknown"
    return "non_job"


def _compute_score(s: dict) -> int:
    return (
        int(s["has_job_title"])
        + int(s["has_apply_signal"])
        + int(s["has_qualifications_signal"] or s["has_responsibilities_signal"])
    )


def _accept(s: dict, score: int) -> tuple[bool, str | None]:
    if s["page_type_guess"] in ("listing", "non_job"):
        return False, f"page_type={s['page_type_guess']}"
    if not s["has_job_title"]:
        return False, "no_job_title"
    if not s["has_apply_signal"]:
        return False, "no_apply_signal"
    if not (s["has_qualifications_signal"] or s["has_responsibilities_signal"]):
        return False, "no_body_content_signal"
    return True, None


# ─── Per-URL validation ────────────────────────────────────────────────────────

async def _validate_one(
    url: str,
    anchor_text: str,
    discovered_by: str,
    known_templates: set[str],
    client: httpx.AsyncClient,
    global_sem: asyncio.Semaphore,
    domain_sem: asyncio.Semaphore,
) -> CandidateSignals:
    """Fetch and validate a single candidate URL. Never raises."""
    start_mono = time.monotonic()

    async with global_sem:
        async with domain_sem:
            try:
                resp = await _fetch_with_retry(
                    client, url,
                    attempts=VALIDATOR_RETRY_ATTEMPTS,
                    backoff_sec=VALIDATOR_RETRY_BACKOFF_SEC,
                )
            except httpx.TimeoutException:
                return _make_failed_result(url, anchor_text, discovered_by, "timeout")
            except httpx.ConnectError:
                return _make_failed_result(url, anchor_text, discovered_by, "connection_error")
            except Exception as exc:
                print(f"[VALIDATOR] Unexpected fetch error for {url}: {exc}")
                return _make_failed_result(url, anchor_text, discovered_by, "connection_error")

    elapsed_ms = int((time.monotonic() - start_mono) * 1000)
    fetched_at = datetime.now(timezone.utc).isoformat()

    if resp is None:
        # All retry attempts exhausted with retryable status
        return {
            **_make_failed_result(url, anchor_text, discovered_by, "http_5xx"),
            "validation_duration_ms": elapsed_ms,
            "fetched_at": fetched_at,
        }

    http_status = resp.status_code
    final_url   = str(resp.url)

    # ── HTTP error handling ────────────────────────────────────────────────────
    if http_status == 429:
        return {
            **_make_failed_result(url, anchor_text, discovered_by, "http_429", http_status),
            "final_url":              final_url,
            "validation_duration_ms": elapsed_ms,
            "fetched_at":             fetched_at,
        }
    if 400 <= http_status < 500:
        return {
            **_make_failed_result(url, anchor_text, discovered_by, "http_4xx", http_status),
            "final_url":              final_url,
            "validation_duration_ms": elapsed_ms,
            "fetched_at":             fetched_at,
        }
    if http_status >= 500:
        return {
            **_make_failed_result(url, anchor_text, discovered_by, "http_5xx", http_status),
            "final_url":              final_url,
            "validation_duration_ms": elapsed_ms,
            "fetched_at":             fetched_at,
        }

    html = resp.text

    # ── Anti-bot detection ─────────────────────────────────────────────────────
    html_lower = html.lower()
    if any(sig in html_lower for sig in _ANTI_BOT_SIGNALS):
        return {
            **_make_failed_result(url, anchor_text, discovered_by, "anti_bot", http_status),
            "final_url":              final_url,
            "validation_duration_ms": elapsed_ms,
            "fetched_at":             fetched_at,
        }

    # Flag suspicious cross-domain redirects
    original_domain = urlparse(url).netloc
    final_domain    = urlparse(final_url).netloc
    if final_domain and final_domain != original_domain:
        # Different domain entirely — treat as anti-bot or expired redirect
        return {
            **_make_failed_result(url, anchor_text, discovered_by, "anti_bot", http_status),
            "final_url":              final_url,
            "validation_duration_ms": elapsed_ms,
            "fetched_at":             fetched_at,
        }

    # ── Extract signals ────────────────────────────────────────────────────────
    signals = _extract_signals(html, url, known_templates)

    page_type = _derive_page_type(signals)
    signals["page_type_guess"] = page_type

    score            = _compute_score(signals)
    accepted, reason = _accept(signals, score)
    needs_review     = (not accepted) and score >= 2

    return {
        # Source
        "url":          url,
        "anchor_text":  anchor_text,
        "discovered_by": discovered_by,
        # Extracted content
        "extracted_title":       signals["extracted_title"],
        "extracted_location":    signals["extracted_location"],
        "extracted_description": signals["extracted_description"],
        # Boolean signals
        "has_job_title":               signals["has_job_title"],
        "has_apply_signal":            signals["has_apply_signal"],
        "has_qualifications_signal":   signals["has_qualifications_signal"],
        "has_responsibilities_signal": signals["has_responsibilities_signal"],
        "has_location_signal":         signals["has_location_signal"],
        "has_req_id_signal":           signals["has_req_id_signal"],
        "has_structured_schema":       signals["has_structured_schema"],
        "has_single_job_focus":        signals["has_single_job_focus"],
        # Derived
        "page_type_guess": page_type,
        "score":           score,
        "needs_review":    needs_review,
        # Decision
        "accept":           accepted,
        "rejection_reason": reason,
        # Operational metadata
        "fetched_at":             fetched_at,
        "http_status":            http_status,
        "final_url":              final_url,
        "fetch_error_type":       None,
        "validation_duration_ms": elapsed_ms,
    }


# ─── Public API ───────────────────────────────────────────────────────────────

async def validate_candidates(
    candidates: list[tuple[str, str, str]],  # (url, anchor_text, discovered_by)
    known_templates: set[str],
    max_concurrent: int = VALIDATOR_MAX_CONCURRENT,
    per_domain_max: int = VALIDATOR_PER_DOMAIN_MAX,
    timeout: float = VALIDATOR_TIMEOUT_SEC,
) -> list[CandidateSignals]:
    """
    Fetch and validate each candidate URL concurrently.
    Returns one CandidateSignals per input URL, in the same order.
    Never raises — failed fetches return a rejected result with fetch_error_type set.
    """
    if not candidates:
        return []

    global_sem: asyncio.Semaphore = asyncio.Semaphore(max_concurrent)
    domain_sems: dict[str, asyncio.Semaphore] = defaultdict(
        lambda: asyncio.Semaphore(per_domain_max)
    )

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }

    async with httpx.AsyncClient(
        timeout=httpx.Timeout(timeout),
        headers=headers,
        follow_redirects=True,
        max_redirects=5,
    ) as client:
        tasks = []
        for url, anchor_text, discovered_by in candidates:
            domain = urlparse(url).netloc
            domain_sem = domain_sems[domain]
            tasks.append(
                _validate_one(
                    url, anchor_text, discovered_by,
                    known_templates, client, global_sem, domain_sem,
                )
            )
        results = await asyncio.gather(*tasks)

    return list(results)

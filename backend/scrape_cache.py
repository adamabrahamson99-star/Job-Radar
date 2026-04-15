"""
scrape_cache.py — URL validation cache helpers.

Reads and writes the scrape_url_cache table.
No business logic — pure DB I/O + URL normalization.
"""

from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from sqlalchemy import text
from sqlalchemy.orm import Session

if TYPE_CHECKING:
    from validator import CandidateSignals


# ─── URL normalisation ─────────────────────────────────────────────────────────

# Tracking / session params stripped before hashing
_STRIP_PARAMS = {
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "ref", "referrer", "source", "fbclid", "gclid", "sessionid", "_ga",
}


def normalize_url(url: str) -> str:
    """
    Canonical form used for cache keying.
    Strips tracking params, lowercases scheme/host, removes trailing slash.
    """
    p = urlparse(url.strip())
    scheme  = p.scheme.lower()
    netloc  = p.netloc.lower()
    path    = p.path.rstrip("/") or "/"
    params  = [(k, v) for k, v in sorted(parse_qsl(p.query)) if k not in _STRIP_PARAMS]
    query   = urlencode(params)
    return urlunparse((scheme, netloc, path, "", query, ""))


def url_hash(url: str) -> str:
    """SHA-256 of the normalized URL, hex-encoded. Used as the cache primary key."""
    return hashlib.sha256(normalize_url(url).encode()).hexdigest()


# ─── TTLs ─────────────────────────────────────────────────────────────────────

_TTL: dict[str, timedelta] = {
    "accepted": timedelta(days=7),
    "rejected": timedelta(hours=48),
    "error":    timedelta(hours=6),
}


# ─── Batch cache read ──────────────────────────────────────────────────────────

def load_url_cache_batch(
    db: Session,
    url_hashes: list[str],
) -> dict[str, dict]:
    """
    Returns a dict keyed by url_hash for all non-expired cache entries.
    Caller checks result.get(hash) to determine if a URL should be skipped.
    Degrades gracefully on DB error (returns empty dict — proceed as if no cache).
    """
    if not url_hashes:
        return {}
    try:
        rows = db.execute(
            text(
                "SELECT url_hash, result, extracted_title, extracted_location, "
                "page_type_guess, score, rejection_reason "
                "FROM scrape_url_cache "
                "WHERE url_hash = ANY(:hashes) AND expires_at > NOW()"
            ),
            {"hashes": url_hashes},
        ).fetchall()
        return {row.url_hash: dict(row._mapping) for row in rows}
    except Exception as e:
        print(f"[CACHE] Read failed (non-fatal): {e}")
        return {}


# ─── Batch cache write ─────────────────────────────────────────────────────────

def write_url_cache_batch(
    db: Session,
    results: list[CandidateSignals],
    company_name: str,
) -> None:
    """
    Upsert one cache entry per validation result.
    Degrades gracefully on DB error (logs + rolls back — scrape run continues).
    """
    if not results:
        return
    try:
        now = datetime.now(timezone.utc)
        for r in results:
            result_type = (
                "accepted" if r["accept"]
                else ("error" if r["fetch_error_type"] else "rejected")
            )
            ttl = _TTL[result_type]
            db.execute(
                text("""
                    INSERT INTO scrape_url_cache (
                        url_hash, normalized_url, company_name, result,
                        page_type_guess, score, rejection_reason, http_status,
                        extracted_title, extracted_location,
                        validated_at, expires_at
                    ) VALUES (
                        :url_hash, :normalized_url, :company_name, :result,
                        :page_type_guess, :score, :rejection_reason, :http_status,
                        :extracted_title, :extracted_location,
                        NOW(), :expires_at
                    )
                    ON CONFLICT (url_hash) DO UPDATE SET
                        result            = EXCLUDED.result,
                        page_type_guess   = EXCLUDED.page_type_guess,
                        score             = EXCLUDED.score,
                        rejection_reason  = EXCLUDED.rejection_reason,
                        http_status       = EXCLUDED.http_status,
                        extracted_title   = EXCLUDED.extracted_title,
                        extracted_location = EXCLUDED.extracted_location,
                        validated_at      = NOW(),
                        expires_at        = EXCLUDED.expires_at
                """),
                {
                    "url_hash":          url_hash(r["url"]),
                    "normalized_url":    normalize_url(r["url"]),
                    "company_name":      company_name,
                    "result":            result_type,
                    "page_type_guess":   r.get("page_type_guess"),
                    "score":             r.get("score"),
                    "rejection_reason":  r.get("rejection_reason"),
                    "http_status":       r.get("http_status"),
                    "extracted_title":   r.get("extracted_title"),
                    "extracted_location": r.get("extracted_location"),
                    "expires_at":        now + ttl,
                },
            )
        db.commit()
    except Exception as e:
        print(f"[CACHE] Write failed (non-fatal): {e}")
        db.rollback()

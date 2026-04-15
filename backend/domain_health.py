"""
domain_health.py — Domain-level health tracking for the watchlist scraper.

Reads and writes the scrape_domain_health table.
compute_domain_health_updates() is a pure function — no DB access.
"""

from __future__ import annotations

import os
from collections import defaultdict
from typing import TYPE_CHECKING
from urllib.parse import urlparse

from sqlalchemy import text
from sqlalchemy.orm import Session

if TYPE_CHECKING:
    from validator import CandidateSignals


# ─── Configuration (overridable via env vars) ──────────────────────────────────

DOMAIN_FAILURE_THRESHOLD   = float(os.getenv("DOMAIN_FAILURE_THRESHOLD",          "0.5"))
DOMAIN_BACKOFF_BASE_SEC    = int(os.getenv("DOMAIN_BACKOFF_BASE_SEC",             "300"))
DOMAIN_BACKOFF_MAX_SEC     = int(os.getenv("DOMAIN_BACKOFF_MAX_SEC",              "86400"))
DOMAIN_ANTIBOT_MULTIPLIER  = int(os.getenv("DOMAIN_ANTIBOT_BACKOFF_MULTIPLIER",   "2"))

# Error types that count as domain-level failures (not URL-level issues like 404).
_DOMAIN_LEVEL_ERRORS = {"http_429", "timeout", "connection_error", "anti_bot", "http_5xx"}


# ─── Batch health read ─────────────────────────────────────────────────────────

def load_domain_health(db: Session, domains: set[str]) -> set[str]:
    """
    Returns the set of domains currently in backoff.
    Caller filters candidate URLs whose domain is in this set.
    Degrades gracefully on DB error (returns empty set — proceed as if all healthy).
    """
    if not domains:
        return set()
    try:
        rows = db.execute(
            text(
                "SELECT domain FROM scrape_domain_health "
                "WHERE domain = ANY(:domains) AND backoff_until > NOW()"
            ),
            {"domains": list(domains)},
        ).fetchall()
        return {row.domain for row in rows}
    except Exception as e:
        print(f"[DOMAIN HEALTH] Read failed (non-fatal): {e}")
        return set()


# ─── Pure compute function ─────────────────────────────────────────────────────

def compute_domain_health_updates(
    results: list[CandidateSignals],
) -> dict[str, dict]:
    """
    Pure function. Takes validation results, returns per-domain health update directives.

    Returns:
        dict keyed by domain string.
        Values: {"action": "reset"|"backoff", "reason": str | None}
    """
    domain_events: dict[str, list[str | None]] = defaultdict(list)
    for r in results:
        domain = urlparse(r["url"]).netloc
        domain_events[domain].append(r.get("fetch_error_type"))

    updates: dict[str, dict] = {}
    for domain, events in domain_events.items():
        total = len(events)
        if total == 0:
            continue

        # Only domain-level failures count toward the backoff threshold
        domain_failures = [e for e in events if e in _DOMAIN_LEVEL_ERRORS]
        failure_rate = len(domain_failures) / total

        if not domain_failures or failure_rate < DOMAIN_FAILURE_THRESHOLD:
            # Majority success — reset health record
            updates[domain] = {"action": "reset", "reason": None}
        else:
            # Majority domain-level failure — apply backoff
            if "anti_bot" in domain_failures:
                reason = "anti_bot"
            elif "http_429" in domain_failures:
                reason = "rate_limited"
            elif "timeout" in domain_failures:
                reason = "timeout"
            else:
                reason = "connection_error"
            updates[domain] = {"action": "backoff", "reason": reason}

    return updates


# ─── Health write ──────────────────────────────────────────────────────────────

def write_domain_health_updates(
    db: Session,
    updates: dict[str, dict],
) -> None:
    """
    Write domain health updates to the DB.
    Degrades gracefully on DB error (logs + rolls back — scrape run continues).
    """
    if not updates:
        return
    try:
        for domain, update in updates.items():
            if update["action"] == "reset":
                db.execute(
                    text("""
                        INSERT INTO scrape_domain_health
                            (domain, consecutive_failures, backoff_until,
                             last_success_at, last_checked_at)
                        VALUES (:domain, 0, NULL, NOW(), NOW())
                        ON CONFLICT (domain) DO UPDATE SET
                            consecutive_failures = 0,
                            backoff_until        = NULL,
                            last_success_at      = NOW(),
                            last_checked_at      = NOW()
                    """),
                    {"domain": domain},
                )
            else:  # backoff
                db.execute(
                    text("""
                        INSERT INTO scrape_domain_health
                            (domain, consecutive_failures, failure_reason,
                             backoff_until, last_checked_at)
                        VALUES (
                            :domain, 1, :reason,
                            NOW() + (:backoff_sec || ' seconds')::interval,
                            NOW()
                        )
                        ON CONFLICT (domain) DO UPDATE SET
                            consecutive_failures = scrape_domain_health.consecutive_failures + 1,
                            failure_reason       = :reason,
                            backoff_until        = NOW() + (
                                LEAST(
                                    :base_sec * POWER(2, scrape_domain_health.consecutive_failures),
                                    :max_sec
                                ) || ' seconds'
                            )::interval,
                            last_checked_at      = NOW()
                    """),
                    {
                        "domain":      domain,
                        "reason":      update["reason"],
                        "backoff_sec": DOMAIN_BACKOFF_BASE_SEC,
                        "base_sec":    DOMAIN_BACKOFF_BASE_SEC,
                        "max_sec":     DOMAIN_BACKOFF_MAX_SEC,
                    },
                )
        db.commit()
    except Exception as e:
        print(f"[DOMAIN HEALTH] Write failed (non-fatal): {e}")
        db.rollback()

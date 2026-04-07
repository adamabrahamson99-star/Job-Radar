"""
Radar — Email client.
MOCK MODE: All sends replaced with console.log.
Replace _send() with real Resend HTTP call when RESEND_API_KEY is configured.
"""

from __future__ import annotations

import json
from datetime import date


def _send(to: str, subject: str, html: str) -> bool:
    """MOCK: Log email to console instead of sending."""
    preview = html.replace("\n", " ")[:120] + "..."
    print(f"[MOCK EMAIL] to={to} | subject={subject} | preview={preview}")
    return True


def send_instant_alert(
    to: str,
    job_title: str,
    company_name: str,
    location: str,
    match_score: int,
    summary: str,
    match_explanation: str,
    apply_url: str,
    salary_raw: str | None = None,
) -> bool:
    return _send(
        to,
        f"New match: {job_title} at {company_name} · {match_score}%",
        f"<p>{summary}</p><p>{match_explanation}</p><a href='{apply_url}'>Apply</a>",
    )


def send_digest(
    to: str,
    digest_type: str,
    postings: list[dict],
) -> bool:
    today = date.today().strftime("%B %d, %Y")
    label = "Daily" if digest_type == "daily" else "Weekly"
    count = len(postings)
    return _send(
        to,
        f"Radar {label}: {count} new matches for {today}",
        f"<p>{count} postings: {json.dumps([p.get('title') for p in postings[:3]])}</p>",
    )

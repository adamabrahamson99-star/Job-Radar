"""
Radar — Email client.

When RESEND_API_KEY is set, emails are sent via the Resend REST API.
When the key is absent (local dev / mock mode), sends are replaced with
console logging so the rest of the app stays fully functional without a key.
"""

from __future__ import annotations

import json
import os
from datetime import date

import httpx

# ─── Config ───────────────────────────────────────────────────────────────────

_RESEND_API_URL = "https://api.resend.com/emails"
_APP_URL = (
    os.getenv("NEXT_PUBLIC_APP_URL")
    or os.getenv("RAILWAY_STATIC_URL")
    or "http://localhost:3000"
)
_EMAIL_FROM = os.getenv("EMAIL_FROM", "Radar <notifications@radar.app>")


# ─── HTML helpers ─────────────────────────────────────────────────────────────

def _score_grade(score: int) -> tuple[str, str]:
    """Return (letter_grade, badge_css_class) for a match score."""
    if score >= 80:
        return "A", "score-a"
    if score >= 60:
        return "B", "score-b"
    if score >= 40:
        return "C", "score-c"
    return "D", "score-d"


def _email_base(content: str) -> str:
    """Wrap content in the full Radar dark-themed email shell."""
    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Radar</title>
  <style>
    body {{ margin:0; padding:0; background:#0F1623; font-family: 'Helvetica Neue', Arial, sans-serif; color:#F0F4FF; }}
    .container {{ max-width:600px; margin:0 auto; padding:32px 24px; }}
    .header {{ display:flex; align-items:center; gap:10px; margin-bottom:32px; padding-bottom:20px; border-bottom:1px solid #263047; }}
    .logo-text {{ font-size:20px; font-weight:700; color:#F0F4FF; letter-spacing:-0.5px; }}
    .dot {{ width:8px; height:8px; border-radius:50%; background:#3B82F6; display:inline-block; margin-right:6px; }}
    .card {{ background:#141C2E; border:1px solid #263047; border-radius:12px; padding:20px; margin-bottom:12px; }}
    .score-badge {{ display:inline-block; padding:2px 10px; border-radius:6px; font-size:12px; font-weight:600; font-family:monospace; }}
    .score-a {{ background:rgba(34,197,94,0.15); color:#86efac; border:1px solid rgba(34,197,94,0.3); }}
    .score-b {{ background:rgba(234,179,8,0.15); color:#fde047; border:1px solid rgba(234,179,8,0.3); }}
    .score-c {{ background:rgba(249,115,22,0.15); color:#fdba74; border:1px solid rgba(249,115,22,0.3); }}
    .score-d {{ background:rgba(148,163,184,0.15); color:#94a3b8; border:1px solid rgba(148,163,184,0.3); }}
    .job-title {{ font-size:16px; font-weight:600; color:#F0F4FF; margin:0 0 4px; }}
    .job-meta {{ font-size:12px; color:#8B9ABF; margin:0 0 8px; }}
    .summary {{ font-size:13px; color:#8B9ABF; line-height:1.6; margin:8px 0; }}
    .apply-btn {{ display:inline-block; padding:8px 18px; background:#3B82F6; color:#fff; text-decoration:none; border-radius:8px; font-size:13px; font-weight:600; }}
    .footer {{ margin-top:32px; padding-top:20px; border-top:1px solid #263047; font-size:11px; color:#4A5878; text-align:center; }}
    .footer a {{ color:#3B82F6; text-decoration:none; }}
    h2 {{ font-size:20px; font-weight:700; color:#F0F4FF; margin:0 0 6px; }}
    p {{ margin:0 0 16px; color:#8B9ABF; font-size:14px; line-height:1.6; }}
  </style>
</head>
<body>
<div class="container">
  <div class="header">
    <span class="dot"></span>
    <span class="logo-text">Radar</span>
  </div>
  {content}
  <div class="footer">
    <p>You're receiving this because you have email notifications enabled.<br/>
    <a href="{_APP_URL}/dashboard/profile">Manage notification preferences</a> &middot;
    <a href="{_APP_URL}/dashboard">Go to dashboard</a></p>
  </div>
</div>
</body>
</html>"""


# ─── Transport ────────────────────────────────────────────────────────────────

def _send(to: str, subject: str, html: str) -> bool:
    """
    Send an email via Resend REST API.
    Falls back to console logging when RESEND_API_KEY is not set.
    Returns True on success, False on failure.
    """
    api_key = os.getenv("RESEND_API_KEY", "").strip()

    if not api_key:
        preview = html.replace("\n", " ")[:120] + "..."
        print(f"[MOCK EMAIL] to={to} | subject={subject} | preview={preview}")
        return True

    try:
        response = httpx.post(
            _RESEND_API_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "from": _EMAIL_FROM,
                "to": [to],
                "subject": subject,
                "html": html,
            },
            timeout=10.0,
        )
        if response.status_code in (200, 201):
            data = response.json()
            print(f"[EMAIL SENT] id={data.get('id')} to={to} subject={subject!r}")
            return True
        else:
            print(f"[EMAIL ERROR] status={response.status_code} body={response.text[:200]}")
            return False
    except Exception as e:
        print(f"[EMAIL ERROR] {e}")
        return False


# ─── Instant alert ────────────────────────────────────────────────────────────

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
    grade, badge_class = _score_grade(match_score)
    salary_fragment = f" &middot; {salary_raw}" if salary_raw else ""
    explanation_fragment = (
        f'<p class="summary" style="color:#4A5878;">&#x2736; {match_explanation}</p>'
        if match_explanation else ""
    )

    content = f"""
    <h2>New match found</h2>
    <p>Radar found a job that matches your profile with a strong score.</p>
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:8px;">
        <div>
          <p class="job-title">{job_title}</p>
          <p class="job-meta">{company_name} &middot; {location}{salary_fragment}</p>
        </div>
        <span class="score-badge {badge_class}">{grade} &middot; {match_score}%</span>
      </div>
      <p class="summary">{summary}</p>
      {explanation_fragment}
      <a href="{apply_url}" class="apply-btn">View &amp; Apply &rarr;</a>
    </div>
    """

    return _send(
        to=to,
        subject=f"New match: {job_title} at {company_name} \u00b7 {match_score}%",
        html=_email_base(content),
    )


# ─── Digest (daily / weekly) ──────────────────────────────────────────────────

def send_digest(
    to: str,
    digest_type: str,
    postings: list[dict],
) -> bool:
    today = date.today().strftime("%B %d, %Y")
    label = "Daily" if digest_type == "daily" else "Weekly"
    period = "today" if digest_type == "daily" else "this week"
    count = len(postings)

    job_rows = ""
    for j in postings[:10]:
        score = j.get("match_score", 0)
        grade, badge_class = _score_grade(score)
        salary_fragment = f" &middot; {j['salary_raw']}" if j.get("salary_raw") else ""
        raw_summary = j.get("description_summary") or ""
        # Show just the first sentence to keep cards compact
        short_summary = raw_summary.split(".")[0] + "." if raw_summary else ""
        summary_fragment = (
            f'<p class="summary">{short_summary}</p>' if short_summary else ""
        )

        job_rows += f"""
        <div class="card">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <div>
              <p class="job-title" style="font-size:14px;">{j.get("title", "")}</p>
              <p class="job-meta">{j.get("company_name", "")} &middot; {j.get("location", "")}{salary_fragment}</p>
            </div>
            <span class="score-badge {badge_class}">{grade} &middot; {score}%</span>
          </div>
          {summary_fragment}
          <a href="{j.get("apply_url", "#")}" class="apply-btn" style="font-size:12px; padding:6px 14px;">Apply &rarr;</a>
        </div>
        """

    plural = "" if count == 1 else "es"
    content = f"""
    <h2>Radar {label}: {count} new match{plural} {period}</h2>
    <p>Here are your top job matches for {today}. Sorted by match score.</p>
    {job_rows}
    <p style="text-align:center; margin-top:24px;">
      <a href="{_APP_URL}/dashboard" class="apply-btn">View all on dashboard &rarr;</a>
    </p>
    """

    return _send(
        to=to,
        subject=f"Radar {label}: {count} new match{plural} for {today}",
        html=_email_base(content),
    )

"""
Radar — Demo database seed.
Populates:
  - 1 demo user (demo@radar.app / Demo1234!)
  - 1 candidate profile
  - 5 watchlist companies
  - 20 seeded job postings

Run:
    python seed_demo.py

Also called automatically by main.py on startup if the users table is empty.
"""

from __future__ import annotations

import hashlib
import random
import sys
import os
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

import bcrypt
from database import get_db
from sqlalchemy import text

# ─── Demo data ───────────────────────────────────────────────────────────────────

DEMO_EMAIL = "demo@radar.app"
DEMO_PASSWORD = "Demo1234!"
DEMO_FULL_NAME = "Alex Chen"

COMPANIES = [
    ("Google", "https://careers.google.com"),
    ("Stripe", "https://stripe.com/jobs"),
    ("Notion", "https://notion.so/careers"),
    ("Airbnb", "https://careers.airbnb.com"),
    ("Linear", "https://linear.app/careers"),
]

# 20 seeded job postings — varied mix per spec
SEED_POSTINGS = [
    # Google
    {
        "company": "Google", "url": "https://careers.google.com",
        "title": "Data Analyst, Trust & Safety",
        "location": "Remote (US)", "exp": "ENTRY", "cat": "Data Engineering",
        "match": 96, "status": "SAVED", "new": True, "days_ago": 1,
        "salary_raw": "$95,000 – $120,000", "salary_min": 95000, "salary_max": 120000,
    },
    {
        "company": "Google", "url": "https://careers.google.com",
        "title": "Junior Software Engineer, Platforms",
        "location": "San Francisco, CA", "exp": "ENTRY", "cat": "Backend",
        "match": 88, "status": "NEW", "new": True, "days_ago": 2,
        "salary_raw": "$115,000 – $140,000", "salary_min": 115000, "salary_max": 140000,
    },
    {
        "company": "Google", "url": "https://careers.google.com",
        "title": "Business Intelligence Analyst",
        "location": "New York, NY", "exp": "MID", "cat": "Data Engineering",
        "match": 82, "status": "NEW", "new": True, "days_ago": 3,
        "salary_raw": None, "salary_min": None, "salary_max": None,
    },
    {
        "company": "Google", "url": "https://careers.google.com",
        "title": "DevOps Engineer, Cloud Infrastructure",
        "location": "Austin, TX", "exp": "MID", "cat": "DevOps",
        "match": 61, "status": "NOT_INTERESTED", "new": False, "days_ago": 7,
        "salary_raw": "$125,000 – $155,000", "salary_min": 125000, "salary_max": 155000,
    },
    # Stripe
    {
        "company": "Stripe", "url": "https://stripe.com/jobs",
        "title": "Data Engineer, Payments Intelligence",
        "location": "Remote", "exp": "ENTRY", "cat": "Data Engineering",
        "match": 91, "status": "APPLIED", "new": False, "days_ago": 5,
        "salary_raw": "$105,000 – $130,000", "salary_min": 105000, "salary_max": 130000,
    },
    {
        "company": "Stripe", "url": "https://stripe.com/jobs",
        "title": "Frontend Engineer, Dashboard",
        "location": "Remote (US)", "exp": "MID", "cat": "Frontend",
        "match": 74, "status": "SAVED", "new": True, "days_ago": 2,
        "salary_raw": None, "salary_min": None, "salary_max": None,
    },
    {
        "company": "Stripe", "url": "https://stripe.com/jobs",
        "title": "Business Analyst, Revenue Operations",
        "location": "Denver, CO", "exp": "ENTRY", "cat": "Data Engineering",
        "match": 85, "status": "NEW", "new": True, "days_ago": 1,
        "salary_raw": "$80,000 – $100,000", "salary_min": 80000, "salary_max": 100000,
    },
    {
        "company": "Stripe", "url": "https://stripe.com/jobs",
        "title": "ML Engineer, Fraud Detection",
        "location": "San Francisco, CA", "exp": "MID", "cat": "ML/AI",
        "match": 58, "status": "NOT_INTERESTED", "new": False, "days_ago": 10,
        "salary_raw": "$140,000 – $170,000", "salary_min": 140000, "salary_max": 170000,
    },
    # Notion
    {
        "company": "Notion", "url": "https://notion.so/careers",
        "title": "Data Analyst, Product Growth",
        "location": "Remote", "exp": "ENTRY", "cat": "Data Engineering",
        "match": 93, "status": "APPLIED", "new": False, "days_ago": 8,
        "salary_raw": "$90,000 – $110,000", "salary_min": 90000, "salary_max": 110000,
    },
    {
        "company": "Notion", "url": "https://notion.so/careers",
        "title": "Full Stack Engineer",
        "location": "New York, NY", "exp": "MID", "cat": "Full Stack",
        "match": 69, "status": "NEW", "new": False, "days_ago": 6,
        "salary_raw": None, "salary_min": None, "salary_max": None,
    },
    {
        "company": "Notion", "url": "https://notion.so/careers",
        "title": "Junior Product Analyst",
        "location": "Remote (US)", "exp": "ENTRY", "cat": "Data Engineering",
        "match": 87, "status": "NEW", "new": True, "days_ago": 3,
        "salary_raw": "$75,000 – $95,000", "salary_min": 75000, "salary_max": 95000,
    },
    {
        "company": "Notion", "url": "https://notion.so/careers",
        "title": "Backend Engineer, Infrastructure",
        "location": "San Francisco, CA", "exp": "MID", "cat": "Backend",
        "match": 55, "status": "NOT_INTERESTED", "new": False, "days_ago": 12,
        "salary_raw": None, "salary_min": None, "salary_max": None,
    },
    # Airbnb
    {
        "company": "Airbnb", "url": "https://careers.airbnb.com",
        "title": "Data Analyst, Trust & Community",
        "location": "Remote (US)", "exp": "ENTRY", "cat": "Data Engineering",
        "match": 79, "status": "NEW", "new": True, "days_ago": 4,
        "salary_raw": "$92,000 – $115,000", "salary_min": 92000, "salary_max": 115000,
    },
    {
        "company": "Airbnb", "url": "https://careers.airbnb.com",
        "title": "Software Engineer II, Payments",
        "location": "San Francisco, CA", "exp": "MID", "cat": "Backend",
        "match": 63, "status": "NEW", "new": False, "days_ago": 9,
        "salary_raw": None, "salary_min": None, "salary_max": None,
    },
    {
        "company": "Airbnb", "url": "https://careers.airbnb.com",
        "title": "Frontend Engineer, Listings",
        "location": "Denver, CO", "exp": "ENTRY", "cat": "Frontend",
        "match": 71, "status": "SAVED", "new": False, "days_ago": 11,
        "salary_raw": "$100,000 – $125,000", "salary_min": 100000, "salary_max": 125000,
    },
    {
        "company": "Airbnb", "url": "https://careers.airbnb.com",
        "title": "Business Intelligence Developer",
        "location": "Remote", "exp": "MID", "cat": "Data Engineering",
        "match": 45, "status": "NOT_INTERESTED", "new": False, "days_ago": 14,
        "salary_raw": None, "salary_min": None, "salary_max": None,
    },
    # Linear
    {
        "company": "Linear", "url": "https://linear.app/careers",
        "title": "Junior Data Engineer",
        "location": "Remote", "exp": "ENTRY", "cat": "Data Engineering",
        "match": 94, "status": "SAVED", "new": True, "days_ago": 1,
        "salary_raw": "$85,000 – $105,000", "salary_min": 85000, "salary_max": 105000,
    },
    {
        "company": "Linear", "url": "https://linear.app/careers",
        "title": "Full Stack Engineer",
        "location": "Remote (US)", "exp": "MID", "cat": "Full Stack",
        "match": 76, "status": "NEW", "new": False, "days_ago": 5,
        "salary_raw": None, "salary_min": None, "salary_max": None,
    },
    {
        "company": "Linear", "url": "https://linear.app/careers",
        "title": "Product Analyst",
        "location": "Remote", "exp": "ENTRY", "cat": "Data Engineering",
        "match": 89, "status": "NEW", "new": True, "days_ago": 2,
        "salary_raw": "$80,000 – $98,000", "salary_min": 80000, "salary_max": 98000,
    },
    {
        "company": "Linear", "url": "https://linear.app/careers",
        "title": "DevOps Engineer",
        "location": "Remote", "exp": "MID", "cat": "DevOps",
        "match": 48, "status": "NOT_INTERESTED", "new": False, "days_ago": 13,
        "salary_raw": None, "salary_min": None, "salary_max": None,
    },
]

DESCRIPTION_TEMPLATE = (
    "We are looking for a talented {title} to join our team at {company}. "
    "You will work cross-functionally to deliver high-impact projects. "
    "Python, SQL, and data analysis skills are valued."
)
SUMMARY = (
    "This role focuses on building and maintaining data pipelines and dashboards "
    "for internal business teams. The team operates in an agile environment with "
    "modern tooling. Strong SQL and Python skills are required with exposure to "
    "cloud platforms preferred."
)
MATCH_EXPLANATION = (
    "Strong alignment on Python and SQL skills which are central to this role. "
    "Your target roles closely match this position. Junior-level experience aligns "
    "with the posted requirements."
)


def make_fp(company: str, title: str, url: str) -> str:
    raw = f"{company.lower()}|{title.lower()}|{url.lower()}"
    return hashlib.sha256(raw.encode()).hexdigest()


def seed_database():
    db_gen = get_db()
    db = next(db_gen)

    try:
        # ── Check if already seeded ───────────────────────────────────────────
        existing = db.execute(text("SELECT COUNT(*) FROM users")).scalar()
        if existing and existing > 0:
            print(f"⏭  Database already has {existing} user(s). Skipping seed.")
            return

        print("🌱 Seeding demo database...")

        # ── Demo user ─────────────────────────────────────────────────────────
        pw_hash = bcrypt.hashpw(DEMO_PASSWORD.encode(), bcrypt.gensalt(12)).decode()
        trial_ends = datetime.now(timezone.utc) + timedelta(days=10)

        user_id = db.execute(
            text("""
                INSERT INTO users (
                    id, email, password_hash, full_name,
                    subscription_tier, subscription_status, trial_ends_at,
                    manual_checks_this_month, manual_checks_reset_at,
                    onboarding_completed, created_at, updated_at
                ) VALUES (
                    gen_random_uuid(), :email, :pw, :name,
                    'PRO', 'TRIALING', :trial,
                    0, NOW(), true, NOW(), NOW()
                ) RETURNING id
            """),
            {"email": DEMO_EMAIL, "pw": pw_hash, "name": DEMO_FULL_NAME, "trial": trial_ends},
        ).scalar()
        db.commit()
        print(f"  ✓ User created: {DEMO_EMAIL} (id={user_id})")

        # ── Candidate profile ─────────────────────────────────────────────────
        import json
        education = json.dumps([
            {"degree": "B.S.", "field": "Computer Science", "institution": "State University", "year": 2024}
        ])
        db.execute(
            text("""
                INSERT INTO candidate_profiles (
                    id, user_id, experience_level, years_of_experience,
                    skills, target_roles, education,
                    high_value_skills, high_value_titles, preferred_locations,
                    parsed_at, updated_at
                ) VALUES (
                    gen_random_uuid(), :uid, 'ENTRY', 1,
                    ARRAY['Python','SQL','React','TypeScript','Data Analysis','Git'],
                    ARRAY['Data Analyst','Junior Software Engineer','Business Analyst'],
                    :edu,
                    ARRAY['Python','SQL'],
                    ARRAY['Data Analyst','Junior Software Engineer'],
                    ARRAY['Denver, CO','Remote'],
                    NOW(), NOW()
                )
            """),
            {"uid": user_id, "edu": education},
        )
        db.commit()
        print("  ✓ Candidate profile created")

        # ── Companies ─────────────────────────────────────────────────────────
        company_ids: dict[str, str] = {}
        for name, url in COMPANIES:
            cid = db.execute(
                text("""
                    INSERT INTO companies (
                        id, user_id, company_name, career_page_url,
                        is_active, posting_count, created_at
                    ) VALUES (
                        gen_random_uuid(), :uid, :name, :url,
                        true, 4, NOW()
                    ) RETURNING id
                """),
                {"uid": user_id, "name": name, "url": url},
            ).scalar()
            company_ids[name] = cid
        db.commit()
        print(f"  ✓ {len(COMPANIES)} companies created")

        # ── Job postings ──────────────────────────────────────────────────────
        for p in SEED_POSTINGS:
            cid = company_ids.get(p["company"])
            apply_url = f"{p['url']}/{p['title'].lower().replace(' ', '-')}-demo"
            fp = make_fp(p["company"], p["title"], apply_url)
            posted_at = datetime.now(timezone.utc) - timedelta(days=p["days_ago"])
            description = DESCRIPTION_TEMPLATE.format(title=p["title"], company=p["company"])

            db.execute(
                text("""
                    INSERT INTO job_postings (
                        id, user_id, company_id, external_id,
                        title, company_name, location,
                        salary_min, salary_max, salary_currency, salary_raw,
                        description_raw, description_summary,
                        match_score, match_explanation,
                        experience_level, role_category, apply_url, source,
                        status, is_new_since_last_visit, posted_at,
                        first_seen_at, last_verified_at, is_active, created_at
                    ) VALUES (
                        gen_random_uuid(), :uid, :cid, :eid,
                        :title, :company, :loc,
                        :sal_min, :sal_max, :sal_cur, :sal_raw,
                        :desc, :summary,
                        :score, :explanation,
                        :exp, :cat, :url, 'WATCHLIST',
                        :status, :new, :posted,
                        :posted, NOW(), true, NOW()
                    )
                """),
                {
                    "uid": user_id, "cid": cid, "eid": fp,
                    "title": p["title"], "company": p["company"], "loc": p["location"],
                    "sal_min": p["salary_min"], "sal_max": p["salary_max"],
                    "sal_cur": "USD" if p["salary_min"] else None,
                    "sal_raw": p["salary_raw"],
                    "desc": description, "summary": SUMMARY,
                    "score": p["match"], "explanation": MATCH_EXPLANATION,
                    "exp": p["exp"], "cat": p["cat"], "url": apply_url,
                    "status": p["status"], "new": p["new"], "posted": posted_at,
                },
            )
        db.commit()
        print(f"  ✓ {len(SEED_POSTINGS)} job postings created")

        # ── Discovery settings ────────────────────────────────────────────────
        db.execute(
            text("""
                INSERT INTO discovery_settings (
                    id, user_id, greenhouse_enabled, lever_enabled, ashby_enabled,
                    location_keywords, role_keywords, updated_at
                ) VALUES (
                    gen_random_uuid(), :uid, false, false, false,
                    ARRAY['Remote','Denver, CO'], ARRAY['Data Analyst','Engineer'],
                    NOW()
                )
            """),
            {"uid": user_id},
        )
        db.commit()
        print("  ✓ Discovery settings created")

        print(f"\n✅ Demo seed complete!")
        print(f"   Login: {DEMO_EMAIL} / {DEMO_PASSWORD}")
        print(f"   Trial ends: {trial_ends.strftime('%Y-%m-%d')}")

    except Exception as e:
        db.rollback()
        print(f"❌ Seed failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        try:
            next(db_gen)
        except StopIteration:
            pass


if __name__ == "__main__":
    seed_database()

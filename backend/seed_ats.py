"""
Run once to populate the ats_companies table.
Usage: python seed_ats.py
"""
import os
import sys
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from database import get_db  # noqa: E402
from sqlalchemy import text  # noqa: E402
from ats_seed_data import ATS_COMPANIES  # noqa: E402


def seed():
    db_gen = get_db()
    db = next(db_gen)
    inserted = 0
    skipped = 0
    try:
        for c in ATS_COMPANIES:
            existing = db.execute(
                text("SELECT id FROM ats_companies WHERE source = :src AND company_slug = :slug"),
                {"src": c["source"], "slug": c["slug"]},
            ).fetchone()
            if existing:
                skipped += 1
                continue
            db.execute(
                text(
                    "INSERT INTO ats_companies (id, source, company_slug, company_name, is_active) "
                    "VALUES (gen_random_uuid(), :src, :slug, :name, true)"
                ),
                {"src": c["source"], "slug": c["slug"], "name": c["name"]},
            )
            inserted += 1
        db.commit()
        print(f"✅ Seeded {inserted} ATS companies ({skipped} already existed).")
    except Exception as e:
        db.rollback()
        print(f"❌ Seed failed: {e}")
        sys.exit(1)
    finally:
        try:
            next(db_gen)
        except StopIteration:
            pass


if __name__ == "__main__":
    seed()

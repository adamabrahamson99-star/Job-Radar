"""Database connection for FastAPI backend."""

import os
from typing import Generator

_engine = None
_SessionLocal = None


def _get_engine():
    global _engine, _SessionLocal
    if _engine is None:
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        
        database_url = os.getenv("DATABASE_URL", "")
        
        # Support Unix socket connections (for local dev with pgserver)
        # Format: postgresql+psycopg2://user@/dbname?host=/socket/dir&port=N
        if not database_url:
            raise RuntimeError("DATABASE_URL not set")
        
        _engine = create_engine(
            database_url,
            pool_pre_ping=True,
            pool_size=5,
            max_overflow=10,
        )
        _SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_engine)
    return _engine, _SessionLocal


def get_db() -> Generator:
    _, SessionLocal = _get_engine()
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

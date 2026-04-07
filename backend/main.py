"""Radar — FastAPI Backend (Phase 2)"""

import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from routers import profile
from routers import jobs

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("🚀 Radar FastAPI backend starting...")

    # Auto-seed demo data if DB is empty
    try:
        from seed_demo import seed_database
        seed_database()
    except Exception as e:
        print(f"⚠️  Auto-seed skipped: {e}")

    try:
        from scheduler import bootstrap_scheduler
        bootstrap_scheduler()
    except Exception as e:
        print(f"⚠️  Scheduler startup error: {e}")
    yield
    # Shutdown
    try:
        from scheduler import get_scheduler
        s = get_scheduler()
        if s.running:
            s.shutdown(wait=False)
    except Exception:
        pass
    print("🛑 Radar FastAPI backend shut down.")


app = FastAPI(
    title="Radar API",
    description="AI-powered job intelligence backend",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS — allow Next.js frontend
allowed_origins = [
    os.getenv("NEXT_PUBLIC_APP_URL", "http://localhost:3000"),
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(profile.router, prefix="/api/profile", tags=["profile"])
app.include_router(jobs.router, prefix="/api/jobs", tags=["jobs"])


@app.get("/health")
async def health():
    from scheduler import get_scheduler
    try:
        s = get_scheduler()
        job_count = len(s.get_jobs())
    except Exception:
        job_count = 0
    return {"status": "ok", "service": "radar-api", "scheduled_jobs": job_count}

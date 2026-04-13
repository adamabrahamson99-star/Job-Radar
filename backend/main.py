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

# CORS — origins are driven entirely by environment variables.
# NEXT_PUBLIC_APP_URL must be set on Railway (e.g. https://your-app.up.railway.app).
# CORS_EXTRA_ORIGINS can be a comma-separated list for additional allowed origins.
_app_url = os.getenv("NEXT_PUBLIC_APP_URL", "http://localhost:3000")
_extra = [o.strip() for o in os.getenv("CORS_EXTRA_ORIGINS", "").split(",") if o.strip()]
allowed_origins = list({_app_url, "http://localhost:3000"} | set(_extra))

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
    return {"status": "ok"}

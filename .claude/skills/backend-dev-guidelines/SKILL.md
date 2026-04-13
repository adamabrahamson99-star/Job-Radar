---
name: backend-dev-guidelines
description: Backend development guide for Job Radar's FastAPI/Python backend. Use when creating or modifying routes, scrapers, pipeline logic, schedulers, background tasks, or working with Prisma database access in the backend/ directory. Covers FastAPI router patterns, internal authentication (X-Internal-User-ID / X-Internal-Secret), background task architecture, APScheduler, Playwright scraping, Claude AI integration, and Prisma ORM usage in Python.
---

# Job Radar — Backend Development Guidelines

> ⚠️ **Template Notice:** The `resources/` folder in this directory contains reference patterns from
> an Express/Node.js project. They are kept as structural references only. This SKILL.md is the
> canonical guide for Job Radar's FastAPI/Python backend. Always follow this file over the resources.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | FastAPI (Python 3.11+) |
| ORM | Prisma Client Python |
| Database | PostgreSQL (Railway plugin) |
| Scraping | Playwright (async) |
| AI | Anthropic Claude (`claude-sonnet-4-20250514`) |
| Task Queue | FastAPI BackgroundTasks (in-process) |
| Scheduling | APScheduler (CronTrigger / IntervalTrigger) |
| Auth | Internal headers — `X-Internal-User-ID` + `X-Internal-Secret` |

---

## Directory Structure

```
backend/
├── main.py              — FastAPI app, CORS, lifespan, router registration
├── routers/
│   ├── profile.py       — /api/profile/* (resume upload, parse, update)
│   └── jobs.py          — /api/jobs/* (run-check, check-status, validate-url)
├── pipeline.py          — Claude AI profile parse + job scoring
├── scraper.py           — Playwright career page scraper + _enrich_locations
├── ats_clients.py       — Greenhouse / Lever / Ashby API clients
├── jobs_runner.py       — Orchestrates scrape → title filter → enrich → score → save
├── job_status.py        — In-memory job status store (running/complete/error)
├── scheduler.py         — APScheduler bootstrap, user scheduling
├── auth_utils.py        — Validates X-Internal-User-ID / X-Internal-Secret headers
└── email_client.py      — Resend email integration
```

---

## Core Patterns

### Route definition
```python
from fastapi import APIRouter, BackgroundTasks, Depends
from auth_utils import require_internal_auth

router = APIRouter()

@router.post("/my-endpoint")
async def my_endpoint(
    background_tasks: BackgroundTasks,
    user_id: str = Depends(require_internal_auth),
):
    ...
```

### Authentication (server-to-server)
All FastAPI routes called from Next.js must validate internal headers via `require_internal_auth`.
The Next.js side sends `X-Internal-User-ID` (user's DB id) and `X-Internal-Secret` (shared env var).

### Background tasks (fire-and-forget pattern)
```python
from job_status import create_job, update_job

@router.post("/run-check")
async def run_check(background_tasks: BackgroundTasks, user_id: str = Depends(...)):
    job_id = create_job()
    background_tasks.add_task(run_check_background, job_id, user_id)
    return {"job_id": job_id, "status": "running"}

async def run_check_background(job_id: str, user_id: str):
    try:
        result = await _check_user_jobs_async(user_id)
        update_job(job_id, "complete", result=result)
    except Exception as e:
        update_job(job_id, "error", error=str(e))
```

### Efficiency rules (cost gate)
1. Scrape all jobs from career pages / ATS sources
2. **Title pre-filter** via `_title_matches_profile()` — cheap, runs on all jobs
3. **Location enrichment** via `_enrich_locations()` — HTTP call, runs only on title-matched jobs
4. **Claude scoring** — API call, runs only on title-matched + location-enriched jobs

This order prevents burning tokens on irrelevant postings.

### Prisma queries (Python)
```python
from prisma import Prisma

db = Prisma()
await db.connect()

companies = await db.company.find_many(where={"user_id": user_id, "is_active": True})
await db.jobposting.create(data={...})
```

---

## Environment Variables

| Variable | Service | Description |
|---|---|---|
| `DATABASE_URL` | FastAPI | PostgreSQL connection string |
| `ANTHROPIC_API_KEY` | FastAPI | Claude API key |
| `INTERNAL_API_SECRET` | Both | Shared secret for server-to-server auth |
| `SCHEDULER_ENABLED` | FastAPI | `true` to activate APScheduler (default: `false`) |
| `SCHEDULER_EXCLUDED_EMAILS` | FastAPI | Comma-separated emails to skip scheduling |

---

## Code Standards

- All route handlers must be `async def`
- Never hardcode secrets — always `os.getenv()`
- Use `try/except Exception as e` in background tasks; always call `update_job(job_id, "error", ...)` on failure
- Do not add new Python dependencies without flagging it first
- Match existing code style (no type: ignore, no bare excepts)

---

## Anti-Patterns to Avoid

❌ Synchronous I/O in async handlers (use `asyncio.run_in_executor` if needed)
❌ Calling Claude API before title pre-filter
❌ Location enrichment on all jobs (only after title filter)
❌ Hardcoded credentials or API keys
❌ Skipping `update_job(job_id, "error", ...)` in background task exception handlers

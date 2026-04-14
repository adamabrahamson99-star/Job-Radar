"""Jobs router — manual check endpoint and scheduler management."""

from __future__ import annotations

from fastapi import APIRouter, Request, HTTPException, Depends, BackgroundTasks
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import text

from database import get_db
from auth_utils import get_user_id_from_request

router = APIRouter()


@router.post("/validate-url")
async def validate_career_url(request: Request):
    """
    Lightweight pre-check called when a user adds a company.
    Runs a page-1-only scrape and returns job count + sample titles
    so the UI can confirm the URL is a real career page before saving.
    """
    body = await request.json()
    url = (body.get("url") or "").strip()

    if not url:
        raise HTTPException(status_code=400, detail="url is required")

    from scraper import preview_career_page
    result = await preview_career_page(url)
    return JSONResponse(content=result)


@router.post("/run-check")
async def run_check(
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Kick off a background job check for a user.
    Returns a job_id immediately — the check runs asynchronously.
    Poll GET /api/jobs/check-status/{job_id} for completion.
    """
    body = await request.json()
    user_id = body.get("user_id")

    # Allow call from Next.js internal without cookie auth (user_id provided in body)
    # For external calls, validate JWT
    if not user_id:
        user_id = get_user_id_from_request(request)

    from job_status import create_job
    from jobs_runner import run_check_background

    job_id = create_job()
    background_tasks.add_task(run_check_background, job_id, user_id)

    return JSONResponse(content={"job_id": job_id, "status": "running"})


@router.get("/check-status/{job_id}")
async def check_status(job_id: str):
    """
    Poll this endpoint after POST /run-check to get the result.
    Returns { status: "running" | "complete" | "error", result?, error? }
    Returns 404 if the job_id is unknown (e.g. after a service restart).
    """
    from job_status import get_job
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found — the service may have restarted")
    return JSONResponse(content=job)


@router.post("/trigger-schedule-update")
async def trigger_schedule_update(
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Called when a user's subscription tier changes.
    Reschedules (or removes) their automated check job.
    """
    user_id = get_user_id_from_request(request)
    user_row = db.execute(
        text("SELECT subscription_tier FROM users WHERE id = :uid"),
        {"uid": user_id},
    ).fetchone()

    if not user_row:
        raise HTTPException(status_code=404, detail="User not found")

    from scheduler import schedule_user
    schedule_user(user_id, user_row.subscription_tier)

    return JSONResponse(content={"ok": True, "tier": user_row.subscription_tier})

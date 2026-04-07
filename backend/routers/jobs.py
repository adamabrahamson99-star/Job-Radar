"""Jobs router — manual check endpoint and scheduler management."""

from __future__ import annotations

from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import text

from database import get_db
from auth_utils import get_user_id_from_request
from jobs_runner import check_user_jobs_async

router = APIRouter()

MONTHLY_LIMIT = 3


@router.post("/run-check")
async def run_check(
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Trigger a job check for a user.
    Called internally by the Next.js manual-check API route.
    Also used by the scheduler.
    """
    body = await request.json()
    user_id = body.get("user_id")

    # Allow call from Next.js internal without cookie auth (user_id provided in body)
    # For external calls, validate JWT
    if not user_id:
        user_id = get_user_id_from_request(request)

    result = await check_user_jobs_async(user_id)
    return JSONResponse(content=result)


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

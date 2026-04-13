"""
In-memory job status store for background check tasks.

Tracks running / complete / error state for each manual check job.
Job IDs are UUIDs; state lives in the FastAPI process and is cleared on restart.
"""

from __future__ import annotations

import uuid
from typing import Any


# { job_id: { status, result, error } }
_jobs: dict[str, dict[str, Any]] = {}


def create_job() -> str:
    """Register a new job and return its ID."""
    job_id = str(uuid.uuid4())
    _jobs[job_id] = {"status": "running", "result": None, "error": None}
    return job_id


def update_job(job_id: str, status: str, result: Any = None, error: str | None = None) -> None:
    """Update an existing job's status and payload."""
    if job_id in _jobs:
        _jobs[job_id] = {"status": status, "result": result, "error": error}


def get_job(job_id: str) -> dict[str, Any] | None:
    """Return the job dict or None if the ID is unknown (e.g. after a restart)."""
    return _jobs.get(job_id)

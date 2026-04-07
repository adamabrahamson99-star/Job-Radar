"""
Radar — Scheduler.
MOCK MODE: APScheduler is not started. All tiers can manually trigger checks.
Replace bootstrap_scheduler() contents with real scheduling when going live.
"""

from __future__ import annotations


def get_scheduler():
    """MOCK: Returns a stub with no running jobs."""
    class _StubScheduler:
        running = False
        def get_jobs(self): return []
        def add_job(self, *a, **kw): pass
        def remove_job(self, *a, **kw): pass
        def start(self): pass
        def shutdown(self, *a, **kw): pass
    return _StubScheduler()


def schedule_user(user_id: str, tier: str):
    """MOCK: No-op. Scheduling disabled in mock mode."""
    print(f"[MOCK SCHEDULER] schedule_user called for {user_id} ({tier}) — no-op")


def unschedule_user(user_id: str):
    """MOCK: No-op."""
    pass


def bootstrap_scheduler():
    """MOCK: No-op. Scheduler not started in mock mode."""
    print("[MOCK SCHEDULER] bootstrap_scheduler called — APScheduler not started in mock mode")

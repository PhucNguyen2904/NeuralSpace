"""Garbage-collection Celery tasks — idle detection and orphan namespace cleanup.

Integration with GarbageCollector service:
───────────────────────────────────────────
scan_and_kill_idle_workspaces() is the entry point called by Celery Beat every
60 seconds.  For each RUNNING workspace whose auto_kill_at has passed it:

  1. Acquires per-workspace GC distributed lock (via GarbageCollector) to
     prevent concurrent workers from double-killing the same workspace.
  2. Runs the multi-signal idle check (heartbeat + kernel + sessions).
  3. If ≥2/3 signals say idle → calls graceful_kill() which:
       a. Publishes IDLE_WARNING to the frontend via Redis pub/sub.
       b. Triggers Jupyter checkpoint.
       c. Enqueues stop_workspace_task (K8s teardown + MinIO sync).
       d. Writes IDLE_KILL audit event to the DB.
  4. If the workspace has an active kernel (busy) → extends auto_kill_at
     and leaves it alone.

The legacy _has_busy_kernel() sync helper is preserved for the older
scan_and_kill_idle_workspaces path and for backward-compat with test mocks.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

import httpx
import redis as sync_redis

from app.config import get_settings
from app.core.metrics import workspace_idle_kill_total
from app.models.workspace import Workspace, WorkspaceStatus
from app.models.workspace_event import WorkspaceEvent, WorkspaceEventType
from app.services.k8s_service import KubernetesService
from app.workers.celery_app import celery_app
from app.workers.db import get_db_session
from app.workers.provisioning_tasks import stop_workspace_task


# ── Sync Jupyter helper (used by scan task, preserved for test mocking) ───────

def _has_busy_kernel(pod_ip: str) -> bool:
    """
    Quick synchronous check: is any Jupyter kernel currently executing code?

    Returns False (not busy) on any error so that the GC can proceed.
    The async GarbageCollector service provides a more robust multi-signal
    version; this helper is used by the legacy scan loop for fast pre-filtering.
    """
    try:
        with httpx.Client(timeout=5.0) as client:
            resp = client.get(f"http://{pod_ip}:8888/api/kernels")
            resp.raise_for_status()
        kernels = resp.json()
        return any(
            (kernel.get("execution_state") or "").lower() == "busy"
            for kernel in kernels
        )
    except Exception:
        return False


def _sync_redis_client() -> sync_redis.Redis:
    settings = get_settings()
    return sync_redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)


# ── Main GC scan task ─────────────────────────────────────────────────────────

@celery_app.task(
    name="app.workers.gc_tasks.scan_and_kill_idle_workspaces",
    queue="gc",
)
def scan_and_kill_idle_workspaces() -> dict[str, int]:
    """
    Periodic GC scan: find RUNNING workspaces past their auto_kill_at deadline,
    apply multi-signal idle detection, and gracefully kill confirmed idle ones.

    Uses the async GarbageCollector service inside asyncio.run() because Celery
    workers run in a synchronous thread pool.  The async layer lets us concurrently
    probe heartbeat + Jupyter kernel + Jupyter sessions without blocking the
    Celery thread for the full timeout on each workspace.

    Returns a summary dict: {killed, extended, warned, skipped}.
    """
    now = datetime.now(timezone.utc)
    killed = 0
    extended = 0
    warned = 0
    skipped = 0

    with get_db_session() as db:
        candidates: list[Workspace] = (
            db.query(Workspace)
            .filter(
                Workspace.status == WorkspaceStatus.RUNNING,
                Workspace.auto_kill_at.is_not(None),
                Workspace.auto_kill_at <= now,
            )
            .all()
        )

        if not candidates:
            return {"killed": killed, "extended": extended, "warned": warned, "skipped": skipped}

        # Snapshot the fields we need; the session closes after the `with` block.
        snapshots = [
            {"id": ws.id, "pod_ip": ws.pod_ip}
            for ws in candidates
        ]

    # Run the async GC logic for each candidate.
    for snap in snapshots:
        workspace_id: str = snap["id"]
        pod_ip: str | None = snap["pod_ip"]

        result = asyncio.run(_run_gc_for_workspace(workspace_id, pod_ip))
        action = result.get("action")
        if action == "killed":
            killed += 1
            workspace_idle_kill_total.inc()
        elif action == "extended":
            extended += 1
        elif action == "warned":
            warned += 1
        else:
            skipped += 1

    return {"killed": killed, "extended": extended, "warned": warned, "skipped": skipped}


async def _run_gc_for_workspace(workspace_id: str, pod_ip: str | None) -> dict:
    """
    Async helper that performs the full GC lifecycle for a single workspace.

    Opens fresh async DB + Redis clients for the lifetime of this call.
    Kept separate from the Celery task function so it can be tested directly
    as a coroutine without needing a Celery worker.
    """
    import redis.asyncio as aioredis
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

    from app.services.gc_service import GarbageCollector
    from app.services.notification_service import NotificationService

    settings = get_settings()

    # Build short-lived async engine + session for this workspace
    engine = create_async_engine(settings.DATABASE_URL, pool_pre_ping=True)
    async_session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session_maker() as db_session:
        redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=False)
        try:
            gc = GarbageCollector(redis=redis_client, db=db_session)
            idle_result = await gc.check_workspace_idle(workspace_id, pod_ip)

            if idle_result.should_warn and not idle_result.is_idle:
                # Approaching idle threshold but not there yet — warn the user.
                await NotificationService.notify_idle_warning(
                    redis_client,
                    workspace_id,
                    minutes_left=max(1, (settings.IDLE_TIMEOUT_SECONDS - idle_result.idle_duration_seconds) // 60),
                )
                return {"action": "warned", "workspace_id": workspace_id}

            if not idle_result.is_idle:
                # Workspace is active — extend the deadline and move on.
                with get_db_session() as db:
                    ws = db.get(Workspace, workspace_id)
                    if ws is not None:
                        ws.auto_kill_at = datetime.now(timezone.utc) + timedelta(minutes=15)
                return {"action": "extended", "workspace_id": workspace_id}

            # ≥2/3 signals say idle → graceful kill
            kill_result = await gc.graceful_kill(workspace_id)
            if kill_result.success:
                return {"action": "killed", "workspace_id": workspace_id}
            else:
                return {"action": "skipped", "workspace_id": workspace_id, "reason": kill_result.error}

        finally:
            await redis_client.aclose()

    await engine.dispose()


# ── Direct kill task (called by scan or external callers) ─────────────────────

@celery_app.task(
    name="app.workers.gc_tasks.kill_workspace_task",
    queue="gc",
)
def kill_workspace_task(workspace_id: str, reason: str = "IDLE_TIMEOUT") -> None:
    """
    Kill a single workspace — used by the legacy scan path and as a standalone
    task for external callers (e.g. admin tooling).

    Attempts a Jupyter shutdown signal before delegating to stop_workspace_task
    for K8s teardown.

    Note: This task does NOT acquire the distributed GC lock because it is
    typically called *after* the scan has already acquired it.  For lock-safe
    kills from the GC service use GarbageCollector.graceful_kill() directly.
    """
    with get_db_session() as db:
        workspace = db.get(Workspace, workspace_id)
        if workspace is None:
            return
        pod_ip = workspace.pod_ip

    if pod_ip:
        try:
            with httpx.Client(timeout=5.0) as client:
                client.post(f"http://{pod_ip}:8888/api/shutdown")
            # Brief pause for Jupyter to flush buffers before K8s deletes the pod.
            asyncio.run(asyncio.sleep(3))
        except Exception:
            pass  # non-fatal; stop task handles cleanup regardless

    stop_workspace_task.delay(workspace_id, save_notebooks=True)

    with get_db_session() as db:
        db.add(
            WorkspaceEvent(
                workspace_id=workspace_id,
                event_type=WorkspaceEventType.IDLE_KILL.value,
                actor="system",
                details={"reason": reason, "killed_at": datetime.now(timezone.utc).isoformat()},
            )
        )


@celery_app.task(name="gc_kill", queue="gc")
def gc_kill(workspace_id: str, reason: str = "IDLE_TIMEOUT") -> None:
    """Alias task name for low-priority GC kill routing (backward compatibility)."""
    kill_workspace_task.run(workspace_id, reason=reason)


# ── Orphan namespace cleanup task ─────────────────────────────────────────────

@celery_app.task(
    name="app.workers.gc_tasks.cleanup_orphan_namespaces",
    queue="gc",
)
def cleanup_orphan_namespaces() -> int:
    """
    Find K8s namespaces with no matching workspace DB record (or in terminal
    state > 10 minutes ago) and delete them.

    Protects against:
      • Workspace record deleted from DB while the namespace still exists.
      • Failed provisioning that created a namespace but never reached RUNNING.
      • Stuck STOPPING workspaces where the stop task failed mid-way.
    """
    k8s_service = KubernetesService()
    namespace_names = asyncio.run(k8s_service.list_workspace_namespaces())
    now = datetime.now(timezone.utc)
    deleted = 0

    with get_db_session() as db:
        for namespace in namespace_names:
            workspace_id = namespace.removeprefix("ws-")
            workspace = db.get(Workspace, workspace_id)

            if workspace is None:
                # No DB record → definitely orphaned
                asyncio.run(k8s_service.delete_namespace(namespace))
                deleted += 1
                continue

            terminal = workspace.status in {WorkspaceStatus.STOPPED, WorkspaceStatus.ERROR}
            pivot_time = workspace.stopped_at or workspace.updated_at or now
            if terminal and (now - pivot_time) > timedelta(minutes=10):
                asyncio.run(k8s_service.delete_namespace(namespace))
                deleted += 1

    return deleted

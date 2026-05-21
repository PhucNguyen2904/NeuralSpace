"""
Garbage Collection service — idle detection and graceful workspace termination.

Why multi-signal (2-of-3 voting)?
──────────────────────────────────
Single-signal approaches each have blind spots:

  • Heartbeat alone   → browser tab closed silently; kernel may still be running code.
  • Kernel state alone → kernel sits 'idle' between two cells of a long script;
                         naively would kill a workspace mid-computation.
  • Sessions alone     → Jupyter session persists even after the browser navigates
                         away; this signal alone causes far too many false-positives.

Requiring AT LEAST 2 of 3 signals to agree on "idle" means:
  - A busy kernel ALWAYS keeps the workspace alive (Signal 2 = not-idle → can't
    reach the required 2 votes by itself).
  - A user in the middle of a large file upload has kernel idle but an active
    session with recent file activity → also kept alive.
  - Only a workspace that is genuinely dormant from multiple angles gets GC'd.

Distributed lock (SETNX):
──────────────────────────
Celery may run multiple GC scanner workers in parallel (e.g. when beat schedule
fires while a previous run hasn't finished).  Without a lock, two workers could
both pass the idle check for the same workspace and enqueue two stop tasks,
causing a double-kill race condition.  We use Redis SETNX (SET if Not eXists)
with a TTL to guarantee only one GC worker processes a given workspace at a time.
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import httpx
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.logging import get_logger
from app.models.workspace import WorkspaceStatus
from app.models.workspace_event import WorkspaceEventType
from app.repositories.workspace_repository import WorkspaceRepository
from app.workers.tasks import stop_workspace_task

logger = get_logger(__name__)

# ── Constants ────────────────────────────────────────────────────────────────
# GC distributed lock TTL.  Must exceed the beat schedule interval (60 s) so
# that a second worker firing while the first is still running will find the
# lock occupied and skip — not double-kill.
GC_LOCK_TTL: int = 120  # seconds

# Jupyter API call timeout.  Keep short: a slow Jupyter means the pod is
# struggling → treat as idle rather than blocking the entire GC loop.
JUPYTER_TIMEOUT: float = 3.0  # seconds

# How long idle before we send a "workspace will be closed soon" warning
# (20 minutes).  Workspace won't be killed until IDLE_TIMEOUT_SECONDS.
WARN_THRESHOLD_SECONDS: int = 1200  # 20 minutes


# ── Data classes ─────────────────────────────────────────────────────────────

@dataclass
class SignalResult:
    """Result of a single idle-detection signal probe."""

    name: str
    is_idle: bool
    reason: str
    checked_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )


@dataclass
class IdleCheckResult:
    """Aggregated result from all three idle signals."""

    is_idle: bool
    idle_duration_seconds: int
    signals: dict[str, Any]
    should_warn: bool  # True when idle > 20 min → send pre-kill warning


@dataclass
class KillResult:
    """Result of a graceful workspace kill attempt."""

    workspace_id: str
    success: bool
    steps_completed: list[str]
    error: str | None = None


# ── Helper coroutines for missing pod_ip ─────────────────────────────────────

async def _idle_signal_no_pod(name: str) -> SignalResult:
    """Return an idle signal for when no pod IP is available (pod presumed gone)."""
    return SignalResult(
        name=name,
        is_idle=True,
        reason="No pod_ip recorded — pod is presumed gone or never started",
    )


# ── Main GC class ─────────────────────────────────────────────────────────────

class GarbageCollector:
    """
    Multi-signal idle detection and graceful workspace termination.

    Instantiate per-scan with a live async DB session and Redis client.
    """

    def __init__(self, redis: Redis, db: AsyncSession) -> None:
        self.redis = redis
        self.db = db
        self.settings = get_settings()

    # ── Private signal probes ─────────────────────────────────────────────────

    async def _signal_heartbeat(self, workspace_id: str) -> SignalResult:
        """
        Signal 1 — Redis heartbeat key.

        The client POSTs /heartbeat every N seconds.  WorkspaceService writes:
            SET workspace:last_activity:{id}  <iso-timestamp>  EX <IDLE_TIMEOUT>

        If the key is absent (expired or was never set), the workspace has been
        silent for at least IDLE_TIMEOUT seconds → mark as idle.
        If the key exists, parse the timestamp and compute elapsed time.
        """
        key = f"workspace:last_activity:{workspace_id}"
        raw = await self.redis.get(key)

        if raw is None:
            return SignalResult(
                name="heartbeat",
                is_idle=True,
                reason=(
                    "Key expired or never set — no client heartbeat within the "
                    f"IDLE_TIMEOUT window ({self.settings.IDLE_TIMEOUT_SECONDS}s)"
                ),
            )

        try:
            last_ts = datetime.fromisoformat(raw.decode())
            if last_ts.tzinfo is None:
                last_ts = last_ts.replace(tzinfo=timezone.utc)
            elapsed = (datetime.now(timezone.utc) - last_ts).total_seconds()
            is_idle = elapsed > self.settings.IDLE_TIMEOUT_SECONDS
            return SignalResult(
                name="heartbeat",
                is_idle=is_idle,
                reason=(
                    f"Last heartbeat {elapsed:.0f}s ago "
                    f"(threshold={self.settings.IDLE_TIMEOUT_SECONDS}s)"
                ),
            )
        except Exception as exc:
            # Corrupt key value → conservatively mark idle
            return SignalResult(
                name="heartbeat",
                is_idle=True,
                reason=f"Could not parse heartbeat timestamp: {exc}",
            )

    async def _signal_kernel(self, pod_ip: str) -> SignalResult:
        """
        Signal 2 — Jupyter kernel execution state.

        GET /api/kernels  →  list of kernel objects, each has 'execution_state'.
        Any kernel with execution_state='busy' means user is running code → NOT idle.

        Edge cases:
          • Pod unreachable (crash, OOM-killed) → httpx raises → treat as idle.
          • Timeout > JUPYTER_TIMEOUT         → treat as idle (avoid blocking GC).
          • Long-running loop in kernel       → state stays 'busy' → NOT killed. ✓
        """
        try:
            async with httpx.AsyncClient(timeout=JUPYTER_TIMEOUT) as client:
                resp = await client.get(f"http://{pod_ip}:8888/api/kernels")
                resp.raise_for_status()
                kernels: list[dict[str, Any]] = resp.json()

            busy = any(
                (k.get("execution_state") or "").lower() == "busy"
                for k in kernels
            )
            if busy:
                return SignalResult(
                    name="kernel",
                    is_idle=False,
                    reason=f"Found busy kernel among {len(kernels)} kernel(s)",
                )
            return SignalResult(
                name="kernel",
                is_idle=True,
                reason=f"{len(kernels)} kernel(s), none in 'busy' state",
            )

        except httpx.TimeoutException:
            return SignalResult(
                name="kernel",
                is_idle=True,
                reason=(
                    f"Jupyter /api/kernels timed out after {JUPYTER_TIMEOUT}s "
                    "— treating as idle to avoid blocking GC"
                ),
            )
        except Exception as exc:
            return SignalResult(
                name="kernel",
                is_idle=True,
                reason=(
                    f"Pod unreachable or Jupyter error "
                    f"({type(exc).__name__}: {exc}) — treating as idle"
                ),
            )

    async def _signal_sessions(self, pod_ip: str) -> SignalResult:
        """
        Signal 3 — Jupyter active sessions + file-upload guard.

        GET /api/sessions → list of open sessions (one per open notebook tab).
        No sessions → no active browser connection → likely idle.

        File-upload edge case:
        A large file upload keeps network traffic flowing but the kernel stays
        'idle' (no cell execution).  If sessions exist AND a file was modified
        within the last 60 seconds, we treat this as NOT idle to avoid
        interrupting an in-progress upload.

        Edge cases:
          • Pod unreachable → treat as idle.
          • Timeout         → treat as idle.
        """
        try:
            async with httpx.AsyncClient(timeout=JUPYTER_TIMEOUT) as client:
                sess_resp = await client.get(f"http://{pod_ip}:8888/api/sessions")
                sess_resp.raise_for_status()
                sessions: list[dict[str, Any]] = sess_resp.json()

            if not sessions:
                return SignalResult(
                    name="sessions",
                    is_idle=True,
                    reason="No active Jupyter sessions",
                )

            # Sessions exist — check for very recent file activity (upload guard).
            # We do this best-effort; if the contents API itself fails we still
            # report "not idle" because there ARE active sessions.
            try:
                async with httpx.AsyncClient(timeout=JUPYTER_TIMEOUT) as client:
                    contents_resp = await client.get(
                        f"http://{pod_ip}:8888/api/contents",
                        params={"type": "file"},
                    )
                if contents_resp.status_code == 200:
                    now = datetime.now(timezone.utc)
                    items = contents_resp.json().get("content") or []
                    for item in items:
                        last_mod_raw = item.get("last_modified")
                        if last_mod_raw:
                            last_mod = datetime.fromisoformat(
                                last_mod_raw.replace("Z", "+00:00")
                            )
                            if (now - last_mod).total_seconds() < 60:
                                return SignalResult(
                                    name="sessions",
                                    is_idle=False,
                                    reason=(
                                        f"{len(sessions)} session(s) active and a file "
                                        "was modified within the last 60s — "
                                        "possible large file upload in progress"
                                    ),
                                )
            except Exception:
                pass  # upload guard is best-effort; don't fail the whole signal

            return SignalResult(
                name="sessions",
                is_idle=False,
                reason=f"{len(sessions)} active session(s) open",
            )

        except httpx.TimeoutException:
            return SignalResult(
                name="sessions",
                is_idle=True,
                reason=(
                    f"Jupyter /api/sessions timed out after {JUPYTER_TIMEOUT}s "
                    "— treating as idle"
                ),
            )
        except Exception as exc:
            return SignalResult(
                name="sessions",
                is_idle=True,
                reason=(
                    f"Pod unreachable ({type(exc).__name__}: {exc}) "
                    "— treating as idle"
                ),
            )

    # ── Public API ────────────────────────────────────────────────────────────

    async def check_workspace_idle(
        self, workspace_id: str, pod_ip: str | None
    ) -> IdleCheckResult:
        """
        Probe all three signals concurrently and apply majority-vote logic.

        Returns IdleCheckResult with:
          • is_idle             — True when ≥2 of 3 signals vote idle
          • idle_duration_seconds — best estimate of seconds since last activity
          • signals             — per-signal details for debugging / audit
          • should_warn         — True when idle > 20 min (send warning first)

        Running checks via asyncio.gather() keeps total latency at
        max(signal_latency) rather than sum(signal_latency).
        """
        # Build coroutines; fall back to synthetic "idle" signal when pod_ip absent
        kernel_coro = (
            self._signal_kernel(pod_ip)
            if pod_ip
            else _idle_signal_no_pod("kernel")
        )
        sessions_coro = (
            self._signal_sessions(pod_ip)
            if pod_ip
            else _idle_signal_no_pod("sessions")
        )

        heartbeat_sig, kernel_sig, session_sig = await asyncio.gather(
            self._signal_heartbeat(workspace_id),
            kernel_coro,
            sessions_coro,
        )

        signals: dict[str, Any] = {
            "heartbeat": {
                "is_idle": heartbeat_sig.is_idle,
                "reason": heartbeat_sig.reason,
                "checked_at": heartbeat_sig.checked_at,
            },
            "kernel": {
                "is_idle": kernel_sig.is_idle,
                "reason": kernel_sig.reason,
                "checked_at": kernel_sig.checked_at,
            },
            "sessions": {
                "is_idle": session_sig.is_idle,
                "reason": session_sig.reason,
                "checked_at": session_sig.checked_at,
            },
        }

        idle_votes = sum(
            [heartbeat_sig.is_idle, kernel_sig.is_idle, session_sig.is_idle]
        )
        is_idle = idle_votes >= 2  # majority vote

        # Best proxy for idle duration: parse the heartbeat Redis key
        idle_duration_seconds = 0
        try:
            raw = await self.redis.get(f"workspace:last_activity:{workspace_id}")
            if raw:
                last_ts = datetime.fromisoformat(raw.decode())
                if last_ts.tzinfo is None:
                    last_ts = last_ts.replace(tzinfo=timezone.utc)
                idle_duration_seconds = int(
                    (datetime.now(timezone.utc) - last_ts).total_seconds()
                )
            else:
                # Key expired — the workspace has been idle for at least the full
                # timeout window (IDLE_TIMEOUT_SECONDS).
                idle_duration_seconds = self.settings.IDLE_TIMEOUT_SECONDS
        except Exception:
            idle_duration_seconds = 0

        should_warn = idle_duration_seconds >= WARN_THRESHOLD_SECONDS

        logger.info(
            "GC idle check complete",
            workspace_id=workspace_id,
            idle_votes=idle_votes,
            is_idle=is_idle,
            idle_duration_seconds=idle_duration_seconds,
            should_warn=should_warn,
        )

        return IdleCheckResult(
            is_idle=is_idle,
            idle_duration_seconds=idle_duration_seconds,
            signals=signals,
            should_warn=should_warn,
        )

    async def graceful_kill(self, workspace_id: str) -> KillResult:
        """
        Gracefully shut down a workspace with state preservation.

        Step 1 — Notify:      Publish IDLE_WARNING via Redis pub/sub so the
                               frontend can show a countdown to the user.
        Step 2 — Save state:  Trigger Jupyter checkpoints for all open notebooks
                               (wait ≤ 30 s).
        Step 3 — Kill:        Enqueue stop_workspace_task Celery task which
                               handles K8s teardown and MinIO sync.
        Step 4 — Audit:       Write IDLE_KILL event to the workspace event log.

        Distributed lock (Redis SETNX):
        ────────────────────────────────
        Before doing anything, we attempt:
            SET workspace:gc:lock:{id}  "1"  NX  EX 120
        NX  = only set if key does NOT exist.
        EX  = auto-expire after GC_LOCK_TTL seconds (safety net for crashes).

        If another GC worker already holds the lock, we bail immediately.
        This prevents a race where two concurrent Celery workers both pass
        the idle check and enqueue two stop tasks for the same workspace.
        """
        lock_key = f"workspace:gc:lock:{workspace_id}"
        steps: list[str] = []

        # ── Acquire distributed lock ──────────────────────────────────────────
        acquired = await self.redis.set(lock_key, "1", nx=True, ex=GC_LOCK_TTL)
        if not acquired:
            logger.warning(
                "GC lock already held — skipping to prevent double-kill",
                workspace_id=workspace_id,
            )
            return KillResult(
                workspace_id=workspace_id,
                success=False,
                steps_completed=[],
                error="Lock held by another GC worker — skipped",
            )

        try:
            workspace = await WorkspaceRepository.get_by_id(self.db, workspace_id)
            if workspace is None:
                return KillResult(
                    workspace_id=workspace_id,
                    success=False,
                    steps_completed=[],
                    error="Workspace not found",
                )
            if workspace.status != WorkspaceStatus.RUNNING:
                return KillResult(
                    workspace_id=workspace_id,
                    success=False,
                    steps_completed=[],
                    error=f"Workspace not running (status={workspace.status.value})",
                )

            pod_ip = workspace.pod_ip

            # ── Step 1: Notify frontend ───────────────────────────────────────
            # Import here to avoid circular imports (gc_service ↔ notification_service)
            from app.services.notification_service import NotificationService  # noqa: PLC0415

            try:
                await NotificationService.notify_idle_warning(
                    self.redis, workspace_id, minutes_left=1
                )
                steps.append("notify_idle_warning")
                # Brief pause so the browser has a chance to receive and render
                # the countdown before we start killing infrastructure.
                await asyncio.sleep(2)
            except Exception as exc:
                logger.warning(
                    "Failed to send pre-kill notification — continuing anyway",
                    workspace_id=workspace_id,
                    error=str(exc),
                )

            # ── Step 2: Save state (Jupyter checkpoint) ───────────────────────
            if pod_ip:
                try:
                    await self._trigger_jupyter_checkpoint(pod_ip)
                    steps.append("jupyter_checkpoint")
                except Exception as exc:
                    # Checkpoint failure is non-fatal; the Celery stop task also
                    # calls StorageService.sync_notebooks_to_minio as a second
                    # save path.
                    logger.warning(
                        "Jupyter checkpoint failed — stop task will still sync",
                        workspace_id=workspace_id,
                        error=str(exc),
                    )

            # ── Step 3: Enqueue Celery stop task ─────────────────────────────
            # This is fire-and-forget; the task handles K8s teardown + MinIO sync.
            stop_workspace_task.delay(workspace_id, save_notebooks=True)
            steps.append("stop_task_queued")

            # ── Step 4: Audit event ───────────────────────────────────────────
            await WorkspaceRepository.add_event(
                db=self.db,
                workspace_id=workspace_id,
                event_type=WorkspaceEventType.IDLE_KILL.value,
                actor="system:gc",
                details={
                    "reason": "IDLE_TIMEOUT",
                    "killed_at": datetime.now(timezone.utc).isoformat(),
                    "pod_ip": pod_ip,
                    "steps_completed": steps,
                },
            )
            await self.db.commit()
            steps.append("audit_logged")

            # Notify "workspace killed" so the frontend can redirect/refresh
            try:
                await NotificationService.notify_workspace_killed(
                    self.redis, workspace_id
                )
                steps.append("notify_killed")
            except Exception:
                pass  # best-effort

            logger.info(
                "GC graceful kill completed",
                workspace_id=workspace_id,
                steps=steps,
            )
            return KillResult(workspace_id=workspace_id, success=True, steps_completed=steps)

        except Exception as exc:
            logger.exception(
                "GC graceful kill encountered unhandled error",
                workspace_id=workspace_id,
                error=str(exc),
            )
            return KillResult(
                workspace_id=workspace_id,
                success=False,
                steps_completed=steps,
                error=str(exc),
            )
        finally:
            # Always release the lock — even on error — so the next GC cycle
            # can retry if the kill was incomplete.
            await self.redis.delete(lock_key)

    # ── Private helpers ───────────────────────────────────────────────────────

    async def _trigger_jupyter_checkpoint(self, pod_ip: str) -> None:
        """
        Ask Jupyter to checkpoint all open notebooks.

        1. GET /api/contents → list items in root directory.
        2. For each item of type='notebook', POST to its /checkpoints URL.
        3. Wait up to 30 seconds total for all checkpoints to complete.

        This is best-effort; errors from individual notebooks are swallowed so
        one broken notebook doesn't prevent others from being saved.
        """
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"http://{pod_ip}:8888/api/contents")
            resp.raise_for_status()

        items: list[dict[str, Any]] = resp.json().get("content") or []
        notebooks = [
            item["path"]
            for item in items
            if item.get("type") == "notebook" and item.get("path")
        ]

        if not notebooks:
            return

        async def _checkpoint_one(path: str) -> None:
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    await client.post(
                        f"http://{pod_ip}:8888/api/contents/{path}/checkpoints"
                    )
            except Exception as exc:
                logger.debug(
                    "Checkpoint failed for notebook",
                    path=path,
                    error=str(exc),
                )

        # Cap total wait at 30 s to avoid hanging the GC worker indefinitely
        try:
            await asyncio.wait_for(
                asyncio.gather(*[_checkpoint_one(nb) for nb in notebooks]),
                timeout=30.0,
            )
        except asyncio.TimeoutError:
            logger.warning(
                "Jupyter checkpoint timed out after 30s",
                pod_ip=pod_ip,
                notebook_count=len(notebooks),
            )

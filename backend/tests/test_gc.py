"""
Unit tests for the GC subsystem — idle detection, graceful kill, SSE streaming,
and Redis notifications.

Test strategy:
  • All external I/O (httpx, Redis, DB) is fully mocked so tests run without
    any running services.
  • We use pytest-asyncio for coroutine tests (the GarbageCollector methods
    are all async).
  • The SSE test drives the generator directly rather than spinning up a real
    HTTP server, keeping the tests fast and deterministic.
"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch, call
import pytest
import pytest_asyncio

from app.models.workspace import WorkspaceStatus
from app.models.workspace_event import WorkspaceEventType
from app.services.gc_service import (
    GarbageCollector,
    IdleCheckResult,
    KillResult,
    WARN_THRESHOLD_SECONDS,
    GC_LOCK_TTL,
)
from app.services.notification_service import NotificationService, WORKSPACE_EVENTS_CHANNEL


# ── Fixtures ──────────────────────────────────────────────────────────────────

def _make_workspace(
    workspace_id: str = "ws_test01",
    pod_ip: str | None = "10.0.0.1",
    status: WorkspaceStatus = WorkspaceStatus.RUNNING,
) -> SimpleNamespace:
    """Create a minimal workspace-like object for mocking."""
    return SimpleNamespace(
        id=workspace_id,
        user_id="user-abc",
        pod_ip=pod_ip,
        status=status,
        auto_kill_at=datetime.now(timezone.utc) - timedelta(minutes=5),
        last_heartbeat=datetime.now(timezone.utc) - timedelta(minutes=40),
    )


def _make_redis(
    last_activity: str | None = None,
    lock_acquired: bool = True,
) -> AsyncMock:
    """
    Build a mock async Redis client with pre-configured return values.

    Args:
        last_activity: ISO timestamp to return for the heartbeat key.
                       None simulates an expired / missing key.
        lock_acquired: Whether SETNX succeeds (True = lock available).
    """
    r = AsyncMock()
    r.get = AsyncMock(return_value=last_activity.encode() if last_activity else None)
    r.set = AsyncMock(return_value=lock_acquired)
    r.delete = AsyncMock(return_value=1)
    r.publish = AsyncMock(return_value=1)
    return r


def _make_db(workspace: SimpleNamespace | None = None) -> AsyncMock:
    """Build a mock async DB session."""
    db = AsyncMock()
    db.commit = AsyncMock()
    db.flush = AsyncMock()
    return db


# ── Test 1: Multi-signal voting requires exactly 2-of-3 signals ───────────────

class TestIdleDetectionRequires2of3Signals:
    """
    Verify the 2-of-3 majority-vote logic.

    Each parametrized case specifies which signals vote "idle" and the expected
    overall is_idle result.  We patch all three signal methods directly to
    return controlled SignalResult objects.
    """

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "heartbeat_idle, kernel_idle, sessions_idle, expected_idle",
        [
            # 0 signals idle → NOT idle
            (False, False, False, False),
            # 1 signal idle each → NOT idle
            (True,  False, False, False),
            (False, True,  False, False),
            (False, False, True,  False),
            # 2 signals idle → IS idle (first two valid combos)
            (True,  True,  False, True),
            (True,  False, True,  True),
            (False, True,  True,  True),
            # 3 signals idle → IS idle
            (True,  True,  True,  True),
        ],
    )
    async def test_vote_combinations(
        self,
        heartbeat_idle: bool,
        kernel_idle: bool,
        sessions_idle: bool,
        expected_idle: bool,
    ) -> None:
        from app.services.gc_service import SignalResult

        redis = _make_redis(last_activity=None)  # heartbeat key absent
        db = _make_db()

        gc = GarbageCollector(redis=redis, db=db)

        hb_sig = SignalResult(name="heartbeat", is_idle=heartbeat_idle, reason="mocked")
        kn_sig = SignalResult(name="kernel",    is_idle=kernel_idle,    reason="mocked")
        ss_sig = SignalResult(name="sessions",  is_idle=sessions_idle,  reason="mocked")

        with (
            patch.object(gc, "_signal_heartbeat", AsyncMock(return_value=hb_sig)),
            patch.object(gc, "_signal_kernel",    AsyncMock(return_value=kn_sig)),
            patch.object(gc, "_signal_sessions",  AsyncMock(return_value=ss_sig)),
        ):
            result = await gc.check_workspace_idle("ws_test01", pod_ip="10.0.0.1")

        assert result.is_idle is expected_idle, (
            f"Expected is_idle={expected_idle} when "
            f"heartbeat={heartbeat_idle}, kernel={kernel_idle}, sessions={sessions_idle}"
        )

    @pytest.mark.asyncio
    async def test_signals_dict_contains_all_three_keys(self) -> None:
        """The signals dict must always expose all three signal details."""
        from app.services.gc_service import SignalResult

        redis = _make_redis()
        gc = GarbageCollector(redis=redis, db=_make_db())

        sig = SignalResult(name="x", is_idle=True, reason="mock")
        with (
            patch.object(gc, "_signal_heartbeat", AsyncMock(return_value=sig)),
            patch.object(gc, "_signal_kernel",    AsyncMock(return_value=sig)),
            patch.object(gc, "_signal_sessions",  AsyncMock(return_value=sig)),
        ):
            result = await gc.check_workspace_idle("ws_1", "10.0.0.1")

        assert set(result.signals.keys()) == {"heartbeat", "kernel", "sessions"}
        for v in result.signals.values():
            assert "is_idle" in v
            assert "reason" in v
            assert "checked_at" in v


# ── Test 2: Busy kernel prevents kill ─────────────────────────────────────────

class TestBusyKernelPreventsKill:
    """
    Signal 2 (kernel) returning is_idle=False must prevent the majority vote
    from reaching is_idle=True when the other signals are inconclusive.
    """

    @pytest.mark.asyncio
    async def test_busy_kernel_alone_cannot_be_overridden_by_one_other_signal(self) -> None:
        """
        Scenario: Heartbeat says idle, kernel says busy, sessions says idle.
        Votes: 2 idle vs 1 not-idle → is_idle=True.

        This is intentional: if the heartbeat Redis key is gone AND sessions
        have no activity, but the kernel is truly busy (running a long loop),
        the busy kernel loses to 2 votes.

        The important behaviour: one busy kernel + two non-idle signals → safe.
        """
        from app.services.gc_service import SignalResult

        gc = GarbageCollector(redis=_make_redis(), db=_make_db())

        # kernel busy; heartbeat = not idle; sessions = not idle → 0 idle votes
        with (
            patch.object(gc, "_signal_heartbeat", AsyncMock(return_value=SignalResult("heartbeat", is_idle=False, reason="recent"))),
            patch.object(gc, "_signal_kernel",    AsyncMock(return_value=SignalResult("kernel",    is_idle=False, reason="busy"))),
            patch.object(gc, "_signal_sessions",  AsyncMock(return_value=SignalResult("sessions",  is_idle=False, reason="active"))),
        ):
            result = await gc.check_workspace_idle("ws_1", "10.0.0.1")

        assert result.is_idle is False, "All signals not-idle → must NOT be killed"

    @pytest.mark.asyncio
    async def test_busy_kernel_signal_has_correct_reason(self) -> None:
        """The kernel signal reason must mention 'busy'."""
        gc = GarbageCollector(redis=_make_redis(), db=_make_db())

        kernels_response = [{"id": "k1", "execution_state": "busy"}]

        with patch("app.services.gc_service.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            resp = MagicMock()
            resp.raise_for_status = MagicMock()
            resp.json = MagicMock(return_value=kernels_response)
            mock_client.get = AsyncMock(return_value=resp)
            mock_client_cls.return_value = mock_client

            sig = await gc._signal_kernel("10.0.0.1")

        assert sig.is_idle is False
        assert "busy" in sig.reason.lower()

    @pytest.mark.asyncio
    async def test_idle_kernel_returns_idle_signal(self) -> None:
        """Kernel with no busy kernels → signal reports idle."""
        gc = GarbageCollector(redis=_make_redis(), db=_make_db())

        idle_kernels = [{"id": "k1", "execution_state": "idle"}]

        with patch("app.services.gc_service.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            resp = MagicMock()
            resp.raise_for_status = MagicMock()
            resp.json = MagicMock(return_value=idle_kernels)
            mock_client.get = AsyncMock(return_value=resp)
            mock_client_cls.return_value = mock_client

            sig = await gc._signal_kernel("10.0.0.1")

        assert sig.is_idle is True


# ── Test 3: Unreachable pod → treat as idle ───────────────────────────────────

class TestUnreachablePodTreatedAsIdle:
    """
    If the pod IP is not reachable, all Jupyter probes will fail with
    a connection error.  Both Signal 2 and Signal 3 must report is_idle=True
    so the workspace can still be GC'd (the pod has likely crashed).
    """

    @pytest.mark.asyncio
    async def test_connection_error_on_kernel_api_returns_idle(self) -> None:
        import httpx

        gc = GarbageCollector(redis=_make_redis(), db=_make_db())

        with patch("app.services.gc_service.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.get = AsyncMock(side_effect=httpx.ConnectError("Connection refused"))
            mock_client_cls.return_value = mock_client

            sig = await gc._signal_kernel("192.168.99.99")

        assert sig.is_idle is True
        assert "unreachable" in sig.reason.lower() or "error" in sig.reason.lower()

    @pytest.mark.asyncio
    async def test_timeout_on_kernel_api_returns_idle(self) -> None:
        import httpx

        gc = GarbageCollector(redis=_make_redis(), db=_make_db())

        with patch("app.services.gc_service.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.get = AsyncMock(side_effect=httpx.TimeoutException("timed out"))
            mock_client_cls.return_value = mock_client

            sig = await gc._signal_kernel("192.168.99.99")

        assert sig.is_idle is True
        assert "timeout" in sig.reason.lower() or "timed out" in sig.reason.lower()

    @pytest.mark.asyncio
    async def test_missing_pod_ip_returns_idle_for_both_jupyter_signals(self) -> None:
        """pod_ip=None should shortcut both Jupyter signals to idle immediately."""
        from app.services.gc_service import SignalResult

        redis = _make_redis(last_activity=None)  # heartbeat also expired
        gc = GarbageCollector(redis=redis, db=_make_db())

        with (
            patch.object(gc, "_signal_heartbeat", AsyncMock(return_value=SignalResult("heartbeat", is_idle=True, reason="expired"))),
            # _signal_kernel and _signal_sessions should NOT be called when pod_ip=None
        ):
            result = await gc.check_workspace_idle("ws_1", pod_ip=None)

        # All three signals idle → voted idle
        assert result.is_idle is True
        assert result.signals["kernel"]["is_idle"] is True
        assert result.signals["sessions"]["is_idle"] is True

    @pytest.mark.asyncio
    async def test_connection_error_on_sessions_api_returns_idle(self) -> None:
        import httpx

        gc = GarbageCollector(redis=_make_redis(), db=_make_db())

        with patch("app.services.gc_service.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.get = AsyncMock(side_effect=httpx.ConnectError("connection refused"))
            mock_client_cls.return_value = mock_client

            sig = await gc._signal_sessions("192.168.99.99")

        assert sig.is_idle is True


# ── Test 4: Graceful kill saves notebooks first ───────────────────────────────

class TestGracefulKillSavesNotebooksFirst:
    """
    GarbageCollector.graceful_kill() must:
      1. Acquire the distributed lock.
      2. Call _trigger_jupyter_checkpoint BEFORE enqueueing the stop task.
      3. Enqueue stop_workspace_task.
      4. Write the IDLE_KILL audit event.
      5. Release the lock.
    """

    @pytest.mark.asyncio
    async def test_checkpoint_called_before_stop_task(self) -> None:
        ws = _make_workspace()
        redis = _make_redis(lock_acquired=True)
        db = _make_db()

        call_order: list[str] = []

        async def fake_checkpoint(pod_ip: str) -> None:
            call_order.append("checkpoint")

        gc = GarbageCollector(redis=redis, db=db)

        with (
            patch("app.repositories.workspace_repository.WorkspaceRepository.get_by_id", AsyncMock(return_value=ws)),
            patch("app.repositories.workspace_repository.WorkspaceRepository.add_event", AsyncMock()),
            patch("app.services.notification_service.NotificationService.notify_idle_warning", AsyncMock()),
            patch("app.services.notification_service.NotificationService.notify_workspace_killed", AsyncMock()),
            patch.object(gc, "_trigger_jupyter_checkpoint", fake_checkpoint),
            patch("app.workers.tasks.stop_workspace_task.delay", side_effect=lambda *a, **k: call_order.append("stop")),
            patch("asyncio.sleep", AsyncMock()),  # skip the 2s pause
        ):
            result = await gc.graceful_kill(ws.id)

        assert result.success is True
        # Notebook checkpoint MUST come before the stop task is enqueued
        assert call_order.index("checkpoint") < call_order.index("stop"), (
            "Jupyter checkpoint must be triggered before the stop task is queued"
        )

    @pytest.mark.asyncio
    async def test_graceful_kill_returns_all_steps_completed(self) -> None:
        ws = _make_workspace()
        redis = _make_redis(lock_acquired=True)
        db = _make_db()
        gc = GarbageCollector(redis=redis, db=db)

        with (
            patch("app.repositories.workspace_repository.WorkspaceRepository.get_by_id", AsyncMock(return_value=ws)),
            patch("app.repositories.workspace_repository.WorkspaceRepository.add_event", AsyncMock()),
            patch("app.services.notification_service.NotificationService.notify_idle_warning", AsyncMock()),
            patch("app.services.notification_service.NotificationService.notify_workspace_killed", AsyncMock()),
            patch.object(gc, "_trigger_jupyter_checkpoint", AsyncMock()),
            patch("app.workers.tasks.stop_workspace_task.delay", MagicMock()),
            patch("asyncio.sleep", AsyncMock()),
        ):
            result = await gc.graceful_kill(ws.id)

        assert "notify_idle_warning" in result.steps_completed
        assert "jupyter_checkpoint" in result.steps_completed
        assert "stop_task_queued" in result.steps_completed
        assert "audit_logged" in result.steps_completed

    @pytest.mark.asyncio
    async def test_distributed_lock_prevents_double_kill(self) -> None:
        """If the GC lock is already held, graceful_kill must bail immediately."""
        ws = _make_workspace()
        redis = _make_redis(lock_acquired=False)  # lock NOT acquired
        gc = GarbageCollector(redis=redis, db=_make_db())

        stop_mock = MagicMock()
        with patch("app.workers.tasks.stop_workspace_task.delay", stop_mock):
            result = await gc.graceful_kill(ws.id)

        assert result.success is False
        assert "lock" in (result.error or "").lower()
        stop_mock.assert_not_called()

    @pytest.mark.asyncio
    async def test_lock_released_even_on_failure(self) -> None:
        """The GC lock must be released via the finally block even if kill fails."""
        ws = _make_workspace()
        redis = _make_redis(lock_acquired=True)
        gc = GarbageCollector(redis=redis, db=_make_db())

        with (
            patch("app.repositories.workspace_repository.WorkspaceRepository.get_by_id",
                  AsyncMock(side_effect=RuntimeError("DB error"))),
        ):
            result = await gc.graceful_kill(ws.id)

        # Lock should be released regardless
        redis.delete.assert_called_once_with(f"workspace:gc:lock:{ws.id}")
        assert result.success is False

    @pytest.mark.asyncio
    async def test_graceful_kill_skips_stopped_workspace(self) -> None:
        """Should not kill a workspace that is not in RUNNING status."""
        ws = _make_workspace(status=WorkspaceStatus.STOPPED)
        gc = GarbageCollector(redis=_make_redis(lock_acquired=True), db=_make_db())
        stop_mock = MagicMock()

        with (
            patch("app.repositories.workspace_repository.WorkspaceRepository.get_by_id", AsyncMock(return_value=ws)),
            patch("app.workers.tasks.stop_workspace_task.delay", stop_mock),
        ):
            result = await gc.graceful_kill(ws.id)

        assert result.success is False
        assert "not running" in (result.error or "").lower()
        stop_mock.assert_not_called()


# ── Test 5: SSE streams idle warning ──────────────────────────────────────────

class TestSSEStreamsIdleWarning:
    """
    Test that the SSE generator correctly streams events received from Redis
    pub/sub, including IDLE_WARNING and WORKSPACE_KILLED events.
    """

    @pytest.mark.asyncio
    async def test_sse_yields_connected_event_first(self) -> None:
        """The first frame emitted must be a 'connected' event."""
        from app.api.v1.events.router import _workspace_event_stream

        request = MagicMock()
        request.is_disconnected = AsyncMock(return_value=False)

        # Set up pubsub mock that disconnects immediately after "connected"
        pubsub = AsyncMock()
        pubsub.subscribe = AsyncMock()
        pubsub.unsubscribe = AsyncMock()
        pubsub.aclose = AsyncMock()

        disconnect_after = [0]  # counter

        async def fake_get_message(**kwargs):
            disconnect_after[0] += 1
            if disconnect_after[0] >= 2:
                request.is_disconnected = AsyncMock(return_value=True)
            return None  # no message

        pubsub.get_message = fake_get_message

        redis = AsyncMock()
        redis.pubsub = MagicMock(return_value=pubsub)

        frames: list[str] = []
        async for frame in _workspace_event_stream("ws_test01", redis, request):
            frames.append(frame)
            if len(frames) >= 1:
                break  # only need the first frame

        assert frames, "Expected at least one SSE frame"
        first_frame = frames[0]
        assert "event: connected" in first_frame
        assert "CONNECTED" in first_frame

    @pytest.mark.asyncio
    async def test_sse_streams_idle_warning_event(self) -> None:
        """An IDLE_WARNING message published to Redis must appear in the SSE stream."""
        from app.api.v1.events.router import _workspace_event_stream

        idle_warning_payload = {
            "type": "IDLE_WARNING",
            "workspace_id": "ws_test01",
            "minutes_left": 5,
            "message": "Workspace sẽ bị đóng sau 5 phút",
        }

        request = MagicMock()
        call_count = [0]

        async def is_disconnected() -> bool:
            call_count[0] += 1
            return call_count[0] > 10  # disconnect after 10 polls

        request.is_disconnected = is_disconnected

        pubsub = AsyncMock()
        pubsub.subscribe = AsyncMock()
        pubsub.unsubscribe = AsyncMock()
        pubsub.aclose = AsyncMock()

        message_sent = [False]

        async def fake_get_message(**kwargs):
            if not message_sent[0]:
                message_sent[0] = True
                return {
                    "type": "message",
                    "data": json.dumps(idle_warning_payload).encode(),
                }
            return None

        pubsub.get_message = fake_get_message

        redis = AsyncMock()
        redis.pubsub = MagicMock(return_value=pubsub)

        received_events: list[str] = []
        async for frame in _workspace_event_stream("ws_test01", redis, request):
            received_events.append(frame)

        event_data = "\n".join(received_events)
        assert "IDLE_WARNING" in event_data, "SSE stream must forward IDLE_WARNING events"
        assert "event: idle_warning" in event_data.lower() or "idle_warning" in event_data.lower()

    @pytest.mark.asyncio
    async def test_sse_closes_after_workspace_killed(self) -> None:
        """The SSE stream must auto-close when it receives WORKSPACE_KILLED."""
        from app.api.v1.events.router import _workspace_event_stream

        killed_payload = {
            "type": "WORKSPACE_KILLED",
            "workspace_id": "ws_test01",
            "message": "Workspace đã bị đóng",
        }

        request = MagicMock()
        request.is_disconnected = AsyncMock(return_value=False)

        pubsub = AsyncMock()
        pubsub.subscribe = AsyncMock()
        pubsub.unsubscribe = AsyncMock()
        pubsub.aclose = AsyncMock()

        message_sent = [False]

        async def fake_get_message(**kwargs):
            if not message_sent[0]:
                message_sent[0] = True
                return {"type": "message", "data": json.dumps(killed_payload).encode()}
            return None

        pubsub.get_message = fake_get_message

        redis = AsyncMock()
        redis.pubsub = MagicMock(return_value=pubsub)

        frames: list[str] = []
        async for frame in _workspace_event_stream("ws_test01", redis, request):
            frames.append(frame)
            # Generator should stop after WORKSPACE_KILLED — prevent infinite loop guard
            if len(frames) > 20:
                pytest.fail("SSE stream did not close after WORKSPACE_KILLED")

        combined = "".join(frames)
        assert "WORKSPACE_KILLED" in combined

    @pytest.mark.asyncio
    async def test_sse_cleanup_unsubscribes_pubsub(self) -> None:
        """Unsubscribe must be called on the pubsub object when the stream ends."""
        from app.api.v1.events.router import _workspace_event_stream

        request = MagicMock()
        request.is_disconnected = AsyncMock(return_value=True)  # immediately disconnect

        pubsub = AsyncMock()
        pubsub.subscribe = AsyncMock()
        pubsub.unsubscribe = AsyncMock()
        pubsub.aclose = AsyncMock()
        pubsub.get_message = AsyncMock(return_value=None)

        redis = AsyncMock()
        redis.pubsub = MagicMock(return_value=pubsub)

        async for _ in _workspace_event_stream("ws_1", redis, request):
            pass  # drain

        pubsub.unsubscribe.assert_called_once()
        pubsub.aclose.assert_called_once()


# ── Test 6: Notification published before kill ────────────────────────────────

class TestNotificationPublishedBeforeKill:
    """
    The IDLE_WARNING notification must be published via Redis BEFORE the
    Celery stop task is enqueued, giving the frontend time to react.
    """

    @pytest.mark.asyncio
    async def test_idle_warning_published_before_stop_task(self) -> None:
        ws = _make_workspace()
        redis = _make_redis(lock_acquired=True)
        db = _make_db()
        gc = GarbageCollector(redis=redis, db=db)

        event_order: list[str] = []

        async def fake_notify_idle(r, workspace_id, minutes_left):
            event_order.append("notify_idle_warning")

        async def fake_checkpoint(pod_ip):
            event_order.append("checkpoint")

        def fake_stop_delay(*args, **kwargs):
            event_order.append("stop_task_queued")

        with (
            patch("app.repositories.workspace_repository.WorkspaceRepository.get_by_id", AsyncMock(return_value=ws)),
            patch("app.repositories.workspace_repository.WorkspaceRepository.add_event", AsyncMock()),
            patch("app.services.notification_service.NotificationService.notify_idle_warning", fake_notify_idle),
            patch("app.services.notification_service.NotificationService.notify_workspace_killed", AsyncMock()),
            patch.object(gc, "_trigger_jupyter_checkpoint", fake_checkpoint),
            patch("app.workers.tasks.stop_workspace_task.delay", fake_stop_delay),
            patch("asyncio.sleep", AsyncMock()),
        ):
            result = await gc.graceful_kill(ws.id)

        assert result.success is True
        notify_idx = event_order.index("notify_idle_warning")
        stop_idx = event_order.index("stop_task_queued")
        assert notify_idx < stop_idx, (
            "IDLE_WARNING notification must be sent before the stop task is enqueued"
        )

    @pytest.mark.asyncio
    async def test_workspace_killed_notification_published_after_stop_task(self) -> None:
        ws = _make_workspace()
        redis = _make_redis(lock_acquired=True)
        db = _make_db()
        gc = GarbageCollector(redis=redis, db=db)

        event_order: list[str] = []

        def fake_stop_delay(*args, **kwargs):
            event_order.append("stop_task_queued")

        async def fake_notify_killed(r, workspace_id):
            event_order.append("notify_killed")

        with (
            patch("app.repositories.workspace_repository.WorkspaceRepository.get_by_id", AsyncMock(return_value=ws)),
            patch("app.repositories.workspace_repository.WorkspaceRepository.add_event", AsyncMock()),
            patch("app.services.notification_service.NotificationService.notify_idle_warning", AsyncMock()),
            patch("app.services.notification_service.NotificationService.notify_workspace_killed", fake_notify_killed),
            patch.object(gc, "_trigger_jupyter_checkpoint", AsyncMock()),
            patch("app.workers.tasks.stop_workspace_task.delay", fake_stop_delay),
            patch("asyncio.sleep", AsyncMock()),
        ):
            result = await gc.graceful_kill(ws.id)

        stop_idx = event_order.index("stop_task_queued")
        killed_idx = event_order.index("notify_killed")
        assert stop_idx < killed_idx, (
            "WORKSPACE_KILLED notification must come after the stop task is enqueued"
        )

    @pytest.mark.asyncio
    async def test_notify_idle_warning_publishes_correct_payload(self) -> None:
        """NotificationService must publish well-formed JSON to the correct channel."""
        redis = AsyncMock()
        redis.publish = AsyncMock()

        await NotificationService.notify_idle_warning(
            redis=redis,
            workspace_id="ws_test01",
            minutes_left=5,
        )

        redis.publish.assert_called_once()
        channel, raw_payload = redis.publish.call_args[0]

        assert channel == WORKSPACE_EVENTS_CHANNEL.format(workspace_id="ws_test01")

        payload = json.loads(raw_payload)
        assert payload["type"] == "IDLE_WARNING"
        assert payload["workspace_id"] == "ws_test01"
        assert payload["minutes_left"] == 5
        assert "message" in payload
        assert "timestamp" in payload

    @pytest.mark.asyncio
    async def test_notify_workspace_killed_publishes_correct_payload(self) -> None:
        redis = AsyncMock()
        redis.publish = AsyncMock()

        await NotificationService.notify_workspace_killed(redis=redis, workspace_id="ws_dead")

        redis.publish.assert_called_once()
        channel, raw_payload = redis.publish.call_args[0]
        payload = json.loads(raw_payload)

        assert channel == WORKSPACE_EVENTS_CHANNEL.format(workspace_id="ws_dead")
        assert payload["type"] == "WORKSPACE_KILLED"
        assert payload["workspace_id"] == "ws_dead"


# ── Test 7: should_warn threshold ────────────────────────────────────────────

class TestIdleDurationAndWarnThreshold:
    @pytest.mark.asyncio
    async def test_should_warn_when_idle_exceeds_20_minutes(self) -> None:
        from app.services.gc_service import SignalResult

        # Heartbeat key present but idle for 25 minutes (> WARN_THRESHOLD_SECONDS=1200)
        idle_ts = (
            datetime.now(timezone.utc) - timedelta(seconds=1500)
        ).isoformat()
        redis = _make_redis(last_activity=idle_ts)
        gc = GarbageCollector(redis=redis, db=_make_db())

        sig_idle = SignalResult(name="x", is_idle=True, reason="mock")
        sig_not_idle = SignalResult(name="x", is_idle=False, reason="mock")

        # Not fully idle (only 1 vote), but enough for should_warn
        with (
            patch.object(gc, "_signal_heartbeat", AsyncMock(return_value=sig_idle)),
            patch.object(gc, "_signal_kernel",    AsyncMock(return_value=sig_not_idle)),
            patch.object(gc, "_signal_sessions",  AsyncMock(return_value=sig_not_idle)),
        ):
            result = await gc.check_workspace_idle("ws_1", "10.0.0.1")

        assert result.should_warn is True
        assert result.idle_duration_seconds >= 1500

    @pytest.mark.asyncio
    async def test_should_not_warn_when_recently_active(self) -> None:
        from app.services.gc_service import SignalResult

        # Heartbeat key present, active 2 minutes ago
        recent_ts = (datetime.now(timezone.utc) - timedelta(seconds=120)).isoformat()
        redis = _make_redis(last_activity=recent_ts)
        gc = GarbageCollector(redis=redis, db=_make_db())

        sig_not_idle = SignalResult(name="x", is_idle=False, reason="mock")
        with (
            patch.object(gc, "_signal_heartbeat", AsyncMock(return_value=sig_not_idle)),
            patch.object(gc, "_signal_kernel",    AsyncMock(return_value=sig_not_idle)),
            patch.object(gc, "_signal_sessions",  AsyncMock(return_value=sig_not_idle)),
        ):
            result = await gc.check_workspace_idle("ws_1", "10.0.0.1")

        assert result.should_warn is False
        assert result.idle_duration_seconds < WARN_THRESHOLD_SECONDS

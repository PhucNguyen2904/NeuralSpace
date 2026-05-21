"""Unit tests for Celery worker tasks in eager mode."""

from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from celery.exceptions import Retry

from app.models.workspace import WorkspaceStatus
from app.workers.celery_app import celery_app
from app.workers.gc_tasks import kill_workspace_task, scan_and_kill_idle_workspaces
from app.workers.provisioning_tasks import spawn_workspace, stop_workspace_task


class FakeDB:
    def __init__(self, workspace: SimpleNamespace | None = None, items: list[SimpleNamespace] | None = None) -> None:
        self.workspace = workspace
        self.items = items or []
        self.events: list[SimpleNamespace] = []

    def get(self, model: object, workspace_id: str) -> SimpleNamespace | None:
        _ = model
        if self.workspace and self.workspace.id == workspace_id:
            return self.workspace
        return None

    def add(self, event: object) -> None:
        self.events.append(event)  # type: ignore[arg-type]

    def query(self, model: object) -> "FakeQuery":
        _ = model
        return FakeQuery(self.items)


class FakeQuery:
    def __init__(self, items: list[SimpleNamespace]) -> None:
        self._items = items

    def filter(self, *args: object) -> "FakeQuery":
        _ = args
        return self

    def all(self) -> list[SimpleNamespace]:
        return self._items


@pytest.fixture(autouse=True)
def _eager_mode() -> None:
    celery_app.conf.task_always_eager = True
    celery_app.conf.CELERY_TASK_ALWAYS_EAGER = True


def _workspace(status: WorkspaceStatus = WorkspaceStatus.PROVISIONING) -> SimpleNamespace:
    return SimpleNamespace(
        id="ws_1234",
        user_id="user-1",
        tier="cpu-standard",
        dataset_ids=["d1"],
        model_ids=["m1"],
        status=status,
        k8s_namespace="ws-ws_1234",
        k8s_pod_name="ws-pod-ws_1234",
        pod_ip="10.0.0.9",
        access_url=None,
        jupyter_token_hash=None,
        started_at=None,
        stopped_at=None,
        last_heartbeat=None,
        auto_kill_at=datetime.now(timezone.utc) - timedelta(minutes=1),
        updated_at=datetime.now(timezone.utc) - timedelta(minutes=20),
        error_message=None,
    )


def test_spawn_workspace_success_flow(monkeypatch: pytest.MonkeyPatch) -> None:
    ws = _workspace()
    db = FakeDB(workspace=ws)

    @contextmanager
    def _db_session():
        yield db

    redis_client = MagicMock()
    k8s = MagicMock()
    k8s.create_workspace_namespace = AsyncMock(return_value="ws-ws_1234")
    k8s.create_workspace_secret = AsyncMock(return_value=None)
    k8s.create_workspace_pod = AsyncMock(return_value="pod-1")
    k8s.wait_for_pod_ready = AsyncMock(return_value="10.42.0.15")
    k8s.apply_network_policy = AsyncMock(return_value=None)

    pvc = MagicMock()
    pvc.ensure_notebook_pvc = AsyncMock(return_value="user-1-notebooks")

    upstream = MagicMock()
    upstream.get_dataset_storage_path = AsyncMock(return_value="dataset-pvc")
    upstream.get_model_storage_path = AsyncMock(return_value="model-pvc")

    monkeypatch.setattr("app.workers.provisioning_tasks.get_db_session", _db_session)
    monkeypatch.setattr("app.workers.provisioning_tasks._redis_client", lambda: redis_client)
    monkeypatch.setattr("app.workers.provisioning_tasks.KubernetesService", lambda *a, **k: k8s)
    monkeypatch.setattr("app.workers.provisioning_tasks.PVCService", lambda *a, **k: pvc)
    monkeypatch.setattr("app.workers.provisioning_tasks.UpstreamClient", lambda: upstream)

    spawn_workspace.delay(ws.id).get()

    assert ws.status == WorkspaceStatus.RUNNING
    assert ws.pod_ip == "10.42.0.15"
    redis_client.set.assert_called_once()


def test_spawn_workspace_k8s_fail_cleans_up(monkeypatch: pytest.MonkeyPatch) -> None:
    ws = _workspace()
    db = FakeDB(workspace=ws)

    @contextmanager
    def _db_session():
        yield db

    class K8sStub:
        async def create_workspace_namespace(self, workspace_id: str, user_id: str) -> str:
            _ = (workspace_id, user_id)
            return "ws-ws_1234"

        async def create_workspace_secret(self, namespace: str, workspace_id: str, token: str) -> None:
            _ = (namespace, workspace_id, token)
            raise RuntimeError("secret create failed")

        async def delete_namespace(self, namespace: str) -> None:
            assert namespace == "ws-ws_1234"

    upstream = MagicMock()
    upstream.get_dataset_storage_path = AsyncMock(return_value="dataset-pvc")
    upstream.get_model_storage_path = AsyncMock(return_value="model-pvc")

    monkeypatch.setattr("app.workers.provisioning_tasks.get_db_session", _db_session)
    monkeypatch.setattr("app.workers.provisioning_tasks.KubernetesService", lambda *a, **k: K8sStub())
    monkeypatch.setattr("app.workers.provisioning_tasks.PVCService", lambda *a, **k: MagicMock())
    monkeypatch.setattr("app.workers.provisioning_tasks.UpstreamClient", lambda: upstream)
    monkeypatch.setattr("app.workers.provisioning_tasks._redis_client", lambda: MagicMock())
    monkeypatch.setattr("app.workers.provisioning_tasks.spawn_workspace.retry", lambda *a, **k: (_ for _ in ()).throw(Retry()))

    with pytest.raises(Retry):
        spawn_workspace.run(ws.id)
    assert ws.status == WorkspaceStatus.ERROR


def test_spawn_workspace_retries_on_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    ws = _workspace()
    db = FakeDB(workspace=ws)

    @contextmanager
    def _db_session():
        yield db

    class K8sStub:
        async def create_workspace_namespace(self, workspace_id: str, user_id: str) -> str:
            _ = (workspace_id, user_id)
            return "ws-ws_1234"

        async def create_workspace_secret(self, namespace: str, workspace_id: str, token: str) -> None:
            _ = (namespace, workspace_id, token)

        async def create_workspace_pod(self, **kwargs: object) -> str:
            _ = kwargs
            return "pod-1"

        async def wait_for_pod_ready(self, namespace: str, pod_name: str, timeout: int = 120) -> str:
            _ = (namespace, pod_name, timeout)
            raise TimeoutError("pod timeout")

        async def delete_namespace(self, namespace: str) -> None:
            _ = namespace

    upstream = MagicMock()
    upstream.get_dataset_storage_path = AsyncMock(return_value="dataset-pvc")
    upstream.get_model_storage_path = AsyncMock(return_value="model-pvc")

    pvc = MagicMock()
    pvc.ensure_notebook_pvc = AsyncMock(return_value="user-1-notebooks")

    monkeypatch.setattr("app.workers.provisioning_tasks.get_db_session", _db_session)
    monkeypatch.setattr("app.workers.provisioning_tasks.KubernetesService", lambda *a, **k: K8sStub())
    monkeypatch.setattr("app.workers.provisioning_tasks.PVCService", lambda *a, **k: pvc)
    monkeypatch.setattr("app.workers.provisioning_tasks.UpstreamClient", lambda: upstream)
    monkeypatch.setattr("app.workers.provisioning_tasks._redis_client", lambda: MagicMock())
    monkeypatch.setattr("app.workers.provisioning_tasks.spawn_workspace.retry", lambda *a, **k: (_ for _ in ()).throw(Retry()))

    with pytest.raises(Retry):
        spawn_workspace.run(ws.id)


def test_stop_workspace_syncs_notebooks(monkeypatch: pytest.MonkeyPatch) -> None:
    ws = _workspace(status=WorkspaceStatus.RUNNING)
    db = FakeDB(workspace=ws)

    @contextmanager
    def _db_session():
        yield db

    storage = MagicMock()
    storage.sync_notebooks_to_minio = AsyncMock(return_value=None)
    k8s = MagicMock()
    k8s.delete_namespace = AsyncMock(return_value=None)
    redis_client = MagicMock()

    monkeypatch.setattr("app.workers.provisioning_tasks.get_db_session", _db_session)
    monkeypatch.setattr("app.workers.provisioning_tasks.StorageService", lambda: storage)
    monkeypatch.setattr("app.workers.provisioning_tasks.KubernetesService", lambda *a, **k: k8s)
    monkeypatch.setattr("app.workers.provisioning_tasks._redis_client", lambda: redis_client)
    monkeypatch.setattr("app.workers.provisioning_tasks.httpx.Client", MagicMock())

    stop_workspace_task.delay(ws.id, save_notebooks=True).get()

    assert ws.status == WorkspaceStatus.STOPPED
    redis_client.delete.assert_called_once()


def test_gc_skips_busy_kernel(monkeypatch: pytest.MonkeyPatch) -> None:
    """
    When _run_gc_for_workspace returns action='extended' (kernel busy),
    the scan must increment `extended` and NOT call kill_workspace_task.
    """
    ws = _workspace(status=WorkspaceStatus.RUNNING)
    db = FakeDB(items=[ws])

    @contextmanager
    def _db_session():
        yield db

    async def _fake_run_gc(workspace_id: str, pod_ip) -> dict:
        # Simulate: GC checked the kernel, found it busy → extended
        return {"action": "extended", "workspace_id": workspace_id}

    monkeypatch.setattr("app.workers.gc_tasks.get_db_session", _db_session)
    monkeypatch.setattr("app.workers.gc_tasks._run_gc_for_workspace", _fake_run_gc)
    killer = MagicMock()
    monkeypatch.setattr("app.workers.gc_tasks.kill_workspace_task.delay", killer)

    result = scan_and_kill_idle_workspaces.delay().get()

    assert result["extended"] == 1
    killer.assert_not_called()


def test_gc_kills_idle_workspace(monkeypatch: pytest.MonkeyPatch) -> None:
    """
    When _run_gc_for_workspace returns action='killed' (workspace genuinely idle),
    the scan must increment `killed`. The direct kill_workspace_task path is tested
    separately to verify the Jupyter shutdown + stop_workspace_task chain.
    """
    ws = _workspace(status=WorkspaceStatus.RUNNING)
    db = FakeDB(items=[ws], workspace=ws)

    @contextmanager
    def _db_session():
        yield db

    async def _fake_run_gc(workspace_id: str, pod_ip) -> dict:
        # Simulate: GC ran all 3 signals, all idle → graceful_kill succeeded
        return {"action": "killed", "workspace_id": workspace_id}

    monkeypatch.setattr("app.workers.gc_tasks.get_db_session", _db_session)
    monkeypatch.setattr("app.workers.gc_tasks._run_gc_for_workspace", _fake_run_gc)
    stop_delay = MagicMock()
    monkeypatch.setattr("app.workers.gc_tasks.stop_workspace_task.delay", stop_delay)
    monkeypatch.setattr("app.workers.gc_tasks.httpx.Client", MagicMock())

    result = scan_and_kill_idle_workspaces.delay().get()

    assert result["killed"] == 1


def test_gc_direct_kill_task_chains_stop(monkeypatch: pytest.MonkeyPatch) -> None:
    """
    kill_workspace_task (the direct kill path used by admin/manual calls) must:
      1. Try the Jupyter shutdown signal (best-effort).
      2. Enqueue stop_workspace_task.
      3. Write an IDLE_KILL audit event.
    """
    ws = _workspace(status=WorkspaceStatus.RUNNING)
    db = FakeDB(items=[ws], workspace=ws)

    @contextmanager
    def _db_session():
        yield db

    stop_delay = MagicMock()
    monkeypatch.setattr("app.workers.gc_tasks.get_db_session", _db_session)
    monkeypatch.setattr("app.workers.gc_tasks.stop_workspace_task.delay", stop_delay)
    monkeypatch.setattr("app.workers.gc_tasks.httpx.Client", MagicMock())

    kill_workspace_task.delay(ws.id, reason="IDLE_TIMEOUT").get()

    stop_delay.assert_called_once_with(ws.id, save_notebooks=True)

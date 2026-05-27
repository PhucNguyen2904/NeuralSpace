"""Celery tasks for workspace provisioning and lifecycle operations."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

import httpx
import redis
from celery import Task

from app.clients.upstream_client import UpstreamClient
from app.config import get_settings
from app.core.security import generate_workspace_token, hash_token
from app.core.metrics import (
    workspace_active_gauge,
    workspace_created_total,
    workspace_provisioning_duration_seconds,
)
from app.models.workspace import Workspace, WorkspaceStatus
from app.models.workspace_event import WorkspaceEvent, WorkspaceEventType
from app.services.k8s_service import KubernetesService
from app.services.pvc_service import PVCService
from app.services.storage_service import StorageService
from app.workers.celery_app import celery_app
from app.workers.db import get_db_session


def _retry_countdown(retries: int) -> int:
    backoff = [5, 30, 120]
    return backoff[min(retries, len(backoff) - 1)]


def _redis_client() -> redis.Redis:
    settings = get_settings()
    return redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)


def _workspace_or_none(workspace_id: str) -> Workspace | None:
    with get_db_session() as db:
        return db.get(Workspace, workspace_id)


def _record_event(
    workspace_id: str,
    event_type: WorkspaceEventType | str,
    actor: str,
    details: dict | None = None,
) -> None:
    with get_db_session() as db:
        db.add(
            WorkspaceEvent(
                workspace_id=workspace_id,
                event_type=str(event_type),
                actor=actor,
                details=details or {},
            )
        )


@celery_app.task(
    bind=True,
    name="app.workers.provisioning_tasks.spawn_workspace",
    queue="provisioning",
    max_retries=3,
)
def spawn_workspace(self: Task, workspace_id: str) -> None:
    namespace_created = False
    namespace: str | None = None

    try:
        with get_db_session() as db:
            workspace = db.get(Workspace, workspace_id)
            if workspace is None:
                return
            user_id = workspace.user_id
            tier = workspace.tier
            created_at = workspace.created_at
            dataset_ids = workspace.dataset_ids or []
            model_ids = workspace.model_ids or []

        upstream_client = UpstreamClient()
        dataset_path = (
            asyncio.run(upstream_client.get_dataset_storage_path(dataset_ids[0])) if dataset_ids else None
        )
        model_path = asyncio.run(upstream_client.get_model_storage_path(model_ids[0])) if model_ids else None

        k8s_service = KubernetesService(redis_client=_redis_client())
        pvc_service = PVCService(upstream_client=upstream_client)

        if get_settings().ENVIRONMENT == "development":
            import os
            try:
                os.makedirs(f"/notebooks/{workspace_id}", exist_ok=True)
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning(f"Failed to create local workspace dir: {e}")

        namespace = asyncio.run(k8s_service.create_workspace_namespace(workspace_id, user_id))
        namespace_created = True

        token = generate_workspace_token()
        asyncio.run(k8s_service.create_workspace_secret(namespace, workspace_id, token))
        notebook_pvc = asyncio.run(pvc_service.ensure_notebook_pvc(user_id))
        pod_name = asyncio.run(
            k8s_service.create_workspace_pod(
                namespace=namespace,
                workspace_id=workspace_id,
                user_id=user_id,
                tier=tier,
                dataset_path=dataset_path,
                model_path=model_path,
                notebook_pvc=notebook_pvc,
            )
        )
        pod_ip = asyncio.run(k8s_service.wait_for_pod_ready(namespace, pod_name, timeout=120))
        asyncio.run(k8s_service.apply_network_policy(namespace, workspace_id))

        now = datetime.now(timezone.utc)
        settings = get_settings()
        with get_db_session() as db:
            workspace = db.get(Workspace, workspace_id)
            if workspace is None:
                return
            workspace.status = WorkspaceStatus.RUNNING
            workspace.k8s_namespace = namespace
            workspace.k8s_pod_name = pod_name
            workspace.pod_ip = pod_ip
            workspace.access_url = f"http://{pod_ip}:8888"
            workspace.jupyter_token_hash = hash_token(token)
            workspace.started_at = now
            workspace.last_heartbeat = now
            workspace.auto_kill_at = now + timedelta(seconds=settings.IDLE_TIMEOUT_SECONDS)
            workspace.error_message = None
            duration = max(0.0, (now - created_at).total_seconds()) if created_at else 0.0
            workspace_provisioning_duration_seconds.observe(duration)
            workspace_created_total.labels(tier=tier, status="running").inc()
            workspace_active_gauge.labels(tier=tier).inc()
            db.add(
                WorkspaceEvent(
                    workspace_id=workspace_id,
                    event_type=WorkspaceEventType.RUNNING.value,
                    actor="system",
                    details={"pod_name": pod_name, "namespace": namespace},
                )
            )

        redis_client = _redis_client()
        redis_client.set(f"workspace:pod_ip:{workspace_id}", f"{pod_ip}:8888", ex=24 * 60 * 60)
    except Exception as exc:
        with get_db_session() as db:
            workspace = db.get(Workspace, workspace_id)
            if workspace is not None:
                workspace_created_total.labels(tier=getattr(workspace, "tier", "unknown"), status="error").inc()
                workspace.status = WorkspaceStatus.ERROR
                workspace.error_message = str(exc)
                db.add(
                    WorkspaceEvent(
                        workspace_id=workspace_id,
                        event_type=WorkspaceEventType.ERROR.value,
                        actor="system",
                        details={"message": str(exc)},
                    )
                )

        if namespace_created and namespace:
            try:
                asyncio.run(KubernetesService().delete_namespace(namespace))
            except Exception:
                pass

        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc, countdown=_retry_countdown(self.request.retries)) from exc
        raise


@celery_app.task(
    bind=True,
    name="app.workers.provisioning_tasks.stop_workspace_task",
    queue="lifecycle",
    max_retries=3,
)
def stop_workspace_task(self: Task, workspace_id: str, save_notebooks: bool = True) -> None:
    with get_db_session() as db:
        workspace = db.get(Workspace, workspace_id)
        if workspace is None:
            return
        namespace = workspace.k8s_namespace
        user_id = workspace.user_id
        pod_ip = workspace.pod_ip

    if save_notebooks and pod_ip:
        try:
            token = ""
            with httpx.Client(timeout=5.0) as client:
                client.post(f"http://{pod_ip}:8888/api/contents", headers={"Authorization": f"token {token}"})
            asyncio.run(asyncio.sleep(5))
            asyncio.run(
                StorageService().sync_notebooks_to_minio(
                    user_id=user_id,
                    namespace=workspace_id,
                    pod_ip=pod_ip,
                )
            )
        except Exception:
            # autosave/sync best-effort for shutdown path
            pass

    if namespace:
        asyncio.run(KubernetesService().delete_namespace(namespace))

    now = datetime.now(timezone.utc)
    with get_db_session() as db:
        workspace = db.get(Workspace, workspace_id)
        if workspace is None:
            return
        workspace.status = WorkspaceStatus.STOPPED
        workspace.stopped_at = now
        workspace.pod_ip = None
        workspace.k8s_pod_name = None
        workspace.error_message = None
        db.add(
            WorkspaceEvent(
                workspace_id=workspace_id,
                event_type=WorkspaceEventType.STOPPED.value,
                actor="system",
                details={"save_notebooks": save_notebooks},
            )
        )

    redis_client = _redis_client()
    redis_client.delete(
        f"workspace:pod_ip:{workspace_id}",
        f"workspace:last_activity:{workspace_id}",
        f"ws:token:{workspace_id}",
    )

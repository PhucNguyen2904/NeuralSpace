"""Monitoring tasks for workspace metrics refresh."""

from __future__ import annotations

import asyncio

import redis

from app.config import get_settings
from app.models.workspace import Workspace, WorkspaceStatus
from app.services.k8s_service import KubernetesService
from app.workers.celery_app import celery_app
from app.workers.db import get_db_session


@celery_app.task(name="app.workers.monitoring_tasks.refresh_all_workspace_metrics", queue="gc")
def refresh_all_workspace_metrics() -> int:
    settings = get_settings()
    redis_client = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)
    k8s = KubernetesService(redis_client=redis_client)
    refreshed = 0

    with get_db_session() as db:
        running = db.query(Workspace).filter(Workspace.status == WorkspaceStatus.RUNNING).all()

    for workspace in running:
        if not workspace.k8s_namespace or not workspace.k8s_pod_name:
            continue
        try:
            asyncio.run(k8s.get_pod_metrics(workspace.k8s_namespace, workspace.k8s_pod_name))
            refreshed += 1
        except Exception:
            continue
    return refreshed

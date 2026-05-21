"""Celery application initialization."""

from __future__ import annotations

import os

from celery import Celery

from app.config import get_settings
from app.workers.celery_beat_schedule import CELERYBEAT_SCHEDULE

settings = get_settings()

celery_app = Celery(
    "cloud_ide_platform",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=[
        "app.workers.tasks",
        "app.workers.provisioning_tasks",
        "app.workers.gc_tasks",
        "app.workers.monitoring_tasks",
    ],
)
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    result_expires=3600,
    task_track_started=True,
    task_time_limit=30 * 60,
    task_soft_time_limit=25 * 60,
    task_default_retry_delay=5,
    task_annotations={"*": {"max_retries": 3, "retry_backoff": True, "retry_jitter": True}},
    beat_schedule=CELERYBEAT_SCHEDULE,
    task_routes={
        "spawn_workspace": {"queue": "provisioning"},
        "stop_workspace": {"queue": "lifecycle"},
        "stop_workspace_task": {"queue": "lifecycle"},
        "app.workers.provisioning_tasks.spawn_workspace": {"queue": "provisioning"},
        "app.workers.provisioning_tasks.stop_workspace_task": {"queue": "lifecycle"},
        "gc_kill": {"queue": "gc"},
        "app.workers.gc_tasks.scan_and_kill_idle_workspaces": {"queue": "gc"},
        "app.workers.gc_tasks.kill_workspace_task": {"queue": "gc"},
        "app.workers.gc_tasks.cleanup_orphan_namespaces": {"queue": "gc"},
    },
    task_always_eager=os.getenv("CELERY_TASK_ALWAYS_EAGER", "false").lower() == "true",
    task_eager_propagates=os.getenv("CELERY_TASK_EAGER_PROPAGATES", "false").lower() == "true",
)
celery_app.autodiscover_tasks(["app.workers"])

# Backward-compatible name used by existing imports.
app = celery_app

"""Celery application setup and configuration."""

from celery import Celery
from celery.schedules import crontab
from app.config import settings


celery_app = Celery(
    "model_download_service",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=30 * 60,  # 30 minutes hard limit
    task_soft_time_limit=25 * 60,  # 25 minutes soft limit
    worker_prefetch_multiplier=1,  # Grab one task at a time
    worker_max_tasks_per_child=1000,
)

# Configure celery logging
celery_app.conf.worker_log_format = (
    "[%(asctime)s: %(levelname)s/%(processName)s] %(message)s"
)
celery_app.conf.worker_task_log_format = (
    "[%(asctime)s: %(levelname)s/%(processName)s] [%(task_name)s(%(task_id)s)] %(message)s"
)

# Celery Beat schedule
celery_app.conf.beat_schedule = {
    "recover-stale-tasks": {
        "task": "workers.recover_stale_tasks",
        "schedule": crontab(minute="*/5"),  # Every 5 minutes
    },
}


def import_tasks():
    """Import all Celery tasks to register them."""
    from app.workers import download_worker  # noqa: F401
    from app.workers import recovery_worker  # noqa: F401

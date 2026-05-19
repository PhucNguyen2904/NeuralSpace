"""Celery application initialization."""

from celery import Celery

from app.celery_config import *  # noqa: F401, F403

app = Celery("cloud_ide_platform")
app.config_from_object("app.celery_config")

# Auto-discover tasks from all registered apps
app.autodiscover_tasks(["app.workers"])

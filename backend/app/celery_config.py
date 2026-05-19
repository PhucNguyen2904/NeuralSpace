"""Celery configuration."""

from app.config import get_settings

settings = get_settings()

broker_url = settings.REDIS_URL
result_backend = settings.REDIS_URL

task_serializer = "json"
accept_content = ["json"]
result_serializer = "json"
timezone = "UTC"
enable_utc = True

task_track_started = True
task_time_limit = 30 * 60  # 30 minutes hard limit
task_soft_time_limit = 25 * 60  # 25 minutes soft limit

"""Celery beat schedule declarations."""

CELERYBEAT_SCHEDULE = {
    "scan-idle": {
        "task": "app.workers.gc_tasks.scan_and_kill_idle_workspaces",
        "schedule": 60.0,
    },
    "cleanup-orphans": {
        "task": "app.workers.gc_tasks.cleanup_orphan_namespaces",
        "schedule": 300.0,
    },
    "refresh-metrics": {
        "task": "app.workers.monitoring_tasks.refresh_all_workspace_metrics",
        "schedule": 30.0,
    },
}

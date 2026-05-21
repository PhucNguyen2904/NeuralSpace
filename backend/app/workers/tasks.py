"""Celery task declarations for workspace operations."""

from __future__ import annotations

from app.workers.celery_app import celery_app
from app.workers.provisioning_tasks import spawn_workspace as _spawn_workspace_impl
from app.workers.provisioning_tasks import stop_workspace_task as _stop_workspace_impl


@celery_app.task(name="spawn_workspace", queue="provisioning")
def spawn_workspace(workspace_id: str) -> None:
    """Spawn workspace infrastructure."""
    _spawn_workspace_impl.run(workspace_id)


@celery_app.task(name="stop_workspace_task", queue="lifecycle")
def stop_workspace_task(workspace_id: str, save_notebooks: bool = True) -> None:
    """Stop workspace infrastructure."""
    _stop_workspace_impl.run(workspace_id, save_notebooks=save_notebooks)


@celery_app.task(name="stop_workspace", queue="lifecycle")
def stop_workspace(workspace_id: str, save_notebooks: bool = True) -> None:
    """Alias task name for lifecycle stop routing."""
    _stop_workspace_impl.run(workspace_id, save_notebooks=save_notebooks)

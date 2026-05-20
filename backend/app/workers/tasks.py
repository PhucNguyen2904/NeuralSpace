"""Celery task declarations for workspace operations."""

from __future__ import annotations

from app.workers.celery_app import app


@app.task(name="spawn_workspace")
def spawn_workspace(workspace_id: str) -> None:
    """Spawn workspace infrastructure."""
    return None


@app.task(name="stop_workspace_task")
def stop_workspace_task(workspace_id: str, save_notebooks: bool = True) -> None:
    """Stop workspace infrastructure."""
    return None

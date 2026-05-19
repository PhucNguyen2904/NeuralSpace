"""Download task endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status, Query
import json
import redis

from app.api.v1.schemas.task import (
    DownloadRequest,
    DownloadResponse,
    TaskStatusResponse,
)
from app.config import settings
from app.db.session import get_db_session
from app.db.models import TaskStatus
from app.services.task_service import TaskService
from app.services.model_service import ModelService
from app.services.storage_service import StorageService
from app.core.exceptions import DuplicateModelError, TaskNotRetryableError
from app.workers.download_worker import download_model_task


router = APIRouter(prefix="/models", tags=["downloads"])

# Redis client for progress tracking (lazy so a missing Redis doesn't crash startup)
_redis_client = None

def get_redis():
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(settings.REDIS_URL)
    return _redis_client


@router.post("/download", status_code=202)
async def create_download_task(
    request: DownloadRequest,
    db = Depends(get_db_session),
):
    """Create a new download task (returns 202 Accepted)."""
    task_svc = TaskService(db)
    model_svc = ModelService(db)

    # Check for existing model with same identifier
    existing = await model_svc.find_by_identifier(
        request.source_type,
        request.source_identifier,
    )
    if existing and existing.status == "ready":
        raise DuplicateModelError(
            existing.id,
            f"Model already exists with ID {existing.id}",
        )

    # Create task
    task = await task_svc.create_task(
        source_type=request.source_type,
        source_identifier=request.source_identifier,
        priority=request.priority,
        tags=request.tags,
        request_metadata={
            "revision": request.revision,
            "file_patterns": request.file_patterns,
            "hf_token": request.hf_token,
            "tags": request.tags,
        },
    )
    await db.commit()

    # Enqueue Celery task
    celery_task = download_model_task.apply_async(
        args=[task.id],
        task_id=f"celery-{task.id}",
        priority=request.priority,
    )
    task.celery_task_id = celery_task.id
    await db.commit()

    return DownloadResponse(
        task_id=task.id,
        status=task.status,
        created_at=task.created_at,
        poll_url=f"/api/v1/tasks/{task.id}",
        estimated_size_bytes=None,
    )


@router.get("/tasks/{task_id}")
async def get_task_status(
    task_id: str,
    db = Depends(get_db_session),
):
    """Get task status and progress."""
    task_svc = TaskService(db)
    task = await task_svc.get_task(task_id)

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Try to get real-time progress from Redis first
    progress_key = f"task:{task_id}:progress"
    try:
        progress_data = get_redis().get(progress_key)
    except Exception:
        progress_data = None

    if progress_data:
        progress = json.loads(progress_data)
        pct = progress.get("pct", task.progress_pct)
        downloaded = progress.get("downloaded", task.downloaded_bytes)
    else:
        pct = task.progress_pct
        downloaded = task.downloaded_bytes

    # Calculate ETA
    eta_seconds = None
    if task.total_bytes and downloaded > 0 and pct < 100:
        elapsed_seconds = (
            (task.updated_at - task.created_at).total_seconds()
            if task.created_at
            else 1
        )
        if elapsed_seconds > 0:
            speed = downloaded / elapsed_seconds
            remaining = task.total_bytes - downloaded
            eta_seconds = int(remaining / speed) if speed > 0 else None

    return TaskStatusResponse(
        task_id=task.id,
        status=task.status.value,
        progress_pct=pct,
        downloaded_bytes=downloaded,
        total_bytes=task.total_bytes,
        speed_bps=None,  # Could calculate from Redis data
        eta_seconds=eta_seconds,
        current_file=task.current_file,
        model_id=task.model_id,
        error_code=task.error_code,
        error_message=task.error_message,
        retry_count=task.retry_count,
        max_retries=task.max_retries,
        created_at=task.created_at,
        started_at=task.started_at,
        completed_at=task.completed_at,
        updated_at=task.updated_at,
    )


@router.post("/tasks/{task_id}/retry", status_code=202)
async def retry_task(
    task_id: str,
    db = Depends(get_db_session),
):
    """Retry a failed task."""
    task_svc = TaskService(db)

    try:
        task = await task_svc.retry_task(task_id)
    except TaskNotRetryableError as e:
        raise HTTPException(status_code=422, detail=str(e))

    await db.commit()

    # Re-enqueue Celery task
    celery_task = download_model_task.apply_async(
        args=[task.id],
        task_id=f"celery-{task.id}",
        priority=task.priority,
    )
    task.celery_task_id = celery_task.id
    await db.commit()

    return {
        "task_id": task.id,
        "status": task.status.value,
        "retry_count": task.retry_count,
        "poll_url": f"/api/v1/tasks/{task.id}",
    }


@router.post("/tasks/{task_id}/cancel", status_code=200)
async def cancel_task(
    task_id: str,
    db = Depends(get_db_session),
):
    """Cancel a pending or running download task."""
    task_svc = TaskService(db)
    task = await task_svc.get_task(task_id)

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if task.status.value in ("completed", "cancelled"):
        raise HTTPException(
            status_code=422,
            detail=f"Task is already {task.status.value} and cannot be cancelled",
        )

    await task_svc.cancel_task(task_id)
    await db.commit()

    return {"success": True, "task_id": task_id}


@router.get("/tasks")
async def list_tasks(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    status: str = Query(None),
    db = Depends(get_db_session),
):
    """List all download tasks with optional filtering."""
    task_svc = TaskService(db)
    tasks, total = await task_svc.list_tasks(skip=skip, limit=limit, status=status)

    return {
        "items": [
            TaskStatusResponse(
                task_id=t.id,
                status=t.status.value,
                progress_pct=t.progress_pct,
                downloaded_bytes=t.downloaded_bytes,
                total_bytes=t.total_bytes,
                speed_bps=None,
                eta_seconds=None,
                current_file=t.current_file,
                model_id=t.model_id,
                error_code=t.error_code,
                error_message=t.error_message,
                retry_count=t.retry_count,
                max_retries=t.max_retries,
                created_at=t.created_at,
                started_at=t.started_at,
                completed_at=t.completed_at,
                updated_at=t.updated_at,
            )
            for t in tasks
        ],
        "total": total,
        "skip": skip,
        "limit": limit,
    }

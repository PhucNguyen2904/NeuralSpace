from __future__ import annotations

from celery.result import AsyncResult
from fastapi import APIRouter, Depends

from app.dependencies import UserContext, get_current_user
from app.schemas.mlops_dataset import TaskStatusResponse
from app.workers.celery_app import celery_app

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("/{task_id}/status", response_model=TaskStatusResponse)
async def get_task_status(task_id: str, _user: UserContext = Depends(get_current_user)) -> TaskStatusResponse:
    res = AsyncResult(task_id, app=celery_app)
    payload = res.result if isinstance(res.result, dict) else None
    error = str(res.result) if res.failed() else None
    return TaskStatusResponse(task_id=task_id, status=res.status, result=payload, error=error)

"""Model registry API endpoints."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import UserContext, get_current_user, get_db
from app.models.model_registry import ModelRegistry
from app.models.workspace_assets import WorkspaceModel
from app.repositories.workspace_repository import WorkspaceRepository

router = APIRouter(tags=["models"])
workspace_router = APIRouter(prefix="/workspaces", tags=["models"])


class PaginatedModelResponse(BaseModel):
    items: list[dict]
    total: int
    page: int
    pageSize: int


class WorkspaceModelMountRequest(BaseModel):
    model_id: str = Field(min_length=1)
    mount_path: str | None = None


@router.get("/models", response_model=PaginatedModelResponse)
async def list_models(
    search: str | None = Query(default=None),
    framework: list[str] | None = Query(default=None),
    task_type: list[str] | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    sort: str | None = Query(default="newest"),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=18, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _current_user: UserContext = Depends(get_current_user),
) -> PaginatedModelResponse:
    filters = []
    if search:
        like = f"%{search.lower()}%"
        filters.append(func.lower(ModelRegistry.name).like(like))
    if framework:
        filters.append(ModelRegistry.framework.in_(framework))
    if task_type:
        filters.append(ModelRegistry.task_type.in_(task_type))
    if status_filter:
        filters.append(ModelRegistry.status == status_filter)

    where_clause = and_(*filters) if filters else None

    base_stmt = select(ModelRegistry)
    count_stmt = select(func.count(ModelRegistry.id))
    if where_clause is not None:
        base_stmt = base_stmt.where(where_clause)
        count_stmt = count_stmt.where(where_clause)

    if sort == "name":
        base_stmt = base_stmt.order_by(ModelRegistry.name.asc())
    elif sort == "oldest":
        base_stmt = base_stmt.order_by(ModelRegistry.created_at.asc())
    else:
        base_stmt = base_stmt.order_by(ModelRegistry.updated_at.desc())

    offset = (page - 1) * limit
    base_stmt = base_stmt.offset(offset).limit(limit)

    rows = (await db.execute(base_stmt)).scalars().all()
    total = int((await db.execute(count_stmt)).scalar_one())

    items = [
        {
            "id": m.id,
            "name": m.name,
            "description": (m.source_payload or {}).get("description", ""),
            "architecture": m.architecture,
            "framework": m.framework,
            "task_type": m.task_type or "unknown",
            "status": m.status,
            "size_bytes": m.size_bytes,
            "parameter_count": m.parameter_count,
            "primary_metric_name": m.primary_metric_name or "metric",
            "primary_metric_value": m.primary_metric_value or 0.0,
            "all_metrics": m.all_metrics or {},
            "tags": m.tags or [],
            "created_by": m.created_by or "system",
            "created_at": m.created_at,
            "updated_at": m.updated_at,
            "version": m.version or "v1.0",
            "storage_path": m.storage_path or "",
        }
        for m in rows
    ]

    return PaginatedModelResponse(items=items, total=total, page=page, pageSize=limit)


@router.get("/models/{id}")
async def get_model_detail(
    id: str,
    db: AsyncSession = Depends(get_db),
    _current_user: UserContext = Depends(get_current_user),
) -> dict:
    model = await db.get(ModelRegistry, id)
    if model is None:
        raise HTTPException(status_code=404, detail="Model not found")
    return {
        "id": model.id,
        "name": model.name,
        "description": (model.source_payload or {}).get("description", ""),
        "architecture": model.architecture,
        "framework": model.framework,
        "framework_version": "unknown",
        "task_type": model.task_type or "unknown",
        "status": model.status,
        "size_bytes": model.size_bytes,
        "parameter_count": model.parameter_count,
        "primary_metric_name": model.primary_metric_name or "metric",
        "primary_metric_value": model.primary_metric_value or 0.0,
        "all_metrics": model.all_metrics or {},
        "tags": model.tags or [],
        "created_by": model.created_by or "system",
        "created_at": model.created_at,
        "updated_at": model.updated_at,
        "version": model.version or "v1.0",
        "storage_path": model.storage_path or "",
        "input_shape": "unknown",
        "output_shape": "unknown",
        "dataset_id": None,
        "files": [],
    }


@router.get("/models/{id}/metrics")
async def get_model_metrics(
    id: str,
    db: AsyncSession = Depends(get_db),
    _current_user: UserContext = Depends(get_current_user),
) -> dict:
    model = await db.get(ModelRegistry, id)
    if model is None:
        raise HTTPException(status_code=404, detail="Model not found")
    metric_name = model.primary_metric_name or "metric"
    metric_value = float(model.primary_metric_value or 0.0)
    return {
        "training_history": [],
        "confusion_matrix": [],
        "class_names": [],
        "final_metrics": {metric_name: metric_value},
    }


@router.get("/models/{id}/versions")
async def get_model_versions(
    id: str,
    db: AsyncSession = Depends(get_db),
    _current_user: UserContext = Depends(get_current_user),
) -> list[dict]:
    model = await db.get(ModelRegistry, id)
    if model is None:
        raise HTTPException(status_code=404, detail="Model not found")
    return [
        {
            "id": f"{model.id}:{model.version or 'v1.0'}",
            "version": model.version or "v1.0",
            "note": "Current registry version",
            "created_at": model.updated_at or datetime.utcnow(),
            "current": True,
        }
    ]


@workspace_router.post("/{id}/models", status_code=status.HTTP_201_CREATED)
async def mount_model_to_workspace(
    id: str,
    payload: WorkspaceModelMountRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserContext = Depends(get_current_user),
) -> dict:
    workspace = await WorkspaceRepository.get_by_id_and_user(db, id, current_user.user_id)
    if workspace is None:
        raise HTTPException(status_code=404, detail="Workspace not found")

    model = await db.get(ModelRegistry, payload.model_id)
    if model is None:
        raise HTTPException(status_code=404, detail="Model not found")

    mount_path = payload.mount_path or f"/workspace/models/{model.name.lower().replace(' ', '_')}"

    existing_stmt = select(WorkspaceModel).where(
        WorkspaceModel.workspace_id == id,
        WorkspaceModel.model_id == model.id,
    )
    existing = (await db.execute(existing_stmt)).scalar_one_or_none()
    if existing is None:
        db.add(
            WorkspaceModel(
                workspace_id=id,
                model_id=model.id,
                mount_path=mount_path,
                mounted_by=current_user.user_id,
            )
        )
    else:
        existing.mount_path = mount_path
        existing.mounted_by = current_user.user_id

    await db.commit()
    return {
        "workspace_id": id,
        "model_id": model.id,
        "mount_path": mount_path,
        "message": "Model mounted",
    }


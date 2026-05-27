"""Model registry API endpoints."""

from __future__ import annotations

import json
from pathlib import Path
from uuid import uuid4
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import audit_event, get_logger
from app.dependencies import UserContext, get_current_user, get_db
from app.models.model_registry import ModelRegistry
from app.models.workspace_assets import WorkspaceModel
from app.repositories.workspace_repository import WorkspaceRepository

router = APIRouter(tags=["models"])
workspace_router = APIRouter(prefix="/workspaces", tags=["models"])
logger = get_logger(__name__)


class PaginatedModelResponse(BaseModel):
    items: list[dict]
    total: int
    page: int
    pageSize: int


class WorkspaceModelMountRequest(BaseModel):
    model_id: str = Field(min_length=1)
    mount_path: str | None = None


def _guess_framework_from_filename(filename: str) -> str:
    lower = filename.lower()
    if lower.endswith(".onnx"):
        return "onnx"
    if lower.endswith(".pt") or lower.endswith(".pth"):
        return "pytorch"
    if lower.endswith(".h5") or lower.endswith(".keras"):
        return "tensorflow"
    if lower.endswith(".safetensors"):
        return "huggingface"
    return "pytorch"


def _parse_metadata(raw: str | None) -> dict:
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid metadata JSON: {exc.msg}") from exc
    if not isinstance(parsed, dict):
        raise HTTPException(status_code=400, detail="metadata must be a JSON object")
    return parsed


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


@router.post("/models/upload", status_code=status.HTTP_201_CREATED)
async def upload_model(
    file: UploadFile = File(...),
    metadata: str | None = Form(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: UserContext = Depends(get_current_user),
) -> dict:
    if not file.filename:
        audit_event(logger, "model.upload_failed", reason="missing_filename", user_id=current_user.user_id)
        raise HTTPException(status_code=400, detail="Missing filename")

    parsed = _parse_metadata(metadata)
    model_id = f"model_{uuid4().hex[:12]}"
    model_name = str(parsed.get("name") or Path(file.filename).stem).strip() or "Uploaded Model"
    framework = str(parsed.get("framework") or _guess_framework_from_filename(file.filename)).strip().lower()
    task_type = str(parsed.get("task_type") or "regression").strip().lower()
    primary_metric_name = str(parsed.get("primary_metric_name") or "accuracy").strip()
    primary_metric_value = float(parsed.get("primary_metric_value") or 0.0)
    all_metrics = parsed.get("all_metrics") if isinstance(parsed.get("all_metrics"), dict) else {}
    if primary_metric_name and primary_metric_name not in all_metrics:
        all_metrics[primary_metric_name] = primary_metric_value
    tags = parsed.get("tags") if isinstance(parsed.get("tags"), list) else []
    tags = [str(tag) for tag in tags]

    storage_dir = Path("/workspace/models")
    storage_dir.mkdir(parents=True, exist_ok=True)
    target_name = f"{model_id}_{Path(file.filename).name}"
    target_path = storage_dir / target_name

    payload = await file.read()
    target_path.write_bytes(payload)
    size_bytes = target_path.stat().st_size

    row = ModelRegistry(
        id=model_id,
        name=model_name,
        architecture=str(parsed.get("architecture") or "unknown"),
        framework=framework,
        task_type=task_type,
        status="ready",
        version=str(parsed.get("version") or "v1.0"),
        size_bytes=size_bytes,
        parameter_count=int(parsed.get("parameter_count") or 0),
        primary_metric_name=primary_metric_name,
        primary_metric_value=primary_metric_value,
        all_metrics=all_metrics,
        tags=tags,
        storage_path=str(target_path),
        created_by=current_user.user_id,
        source_payload={
            "description": str(parsed.get("description") or ""),
            "original_filename": file.filename,
            "content_type": file.content_type or "application/octet-stream",
        },
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    audit_event(
        logger,
        "model.upload",
        user_id=current_user.user_id,
        model_id=row.id,
        model_name=row.name,
        framework=row.framework,
        task_type=row.task_type,
        size_bytes=row.size_bytes,
    )

    return {
        "id": row.id,
        "name": row.name,
        "description": (row.source_payload or {}).get("description", ""),
        "architecture": row.architecture,
        "framework": row.framework,
        "task_type": row.task_type or "unknown",
        "status": row.status,
        "size_bytes": row.size_bytes,
        "parameter_count": row.parameter_count,
        "primary_metric_name": row.primary_metric_name or "metric",
        "primary_metric_value": row.primary_metric_value or 0.0,
        "all_metrics": row.all_metrics or {},
        "tags": row.tags or [],
        "created_by": row.created_by or "system",
        "created_at": row.created_at,
        "updated_at": row.updated_at,
        "version": row.version or "v1.0",
        "storage_path": row.storage_path or "",
    }


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
        audit_event(logger, "model.mount_failed", user_id=current_user.user_id, workspace_id=id, model_id=payload.model_id, reason="workspace_not_found")
        raise HTTPException(status_code=404, detail="Workspace not found")

    model = await db.get(ModelRegistry, payload.model_id)
    if model is None:
        audit_event(logger, "model.mount_failed", user_id=current_user.user_id, workspace_id=id, model_id=payload.model_id, reason="model_not_found")
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
    audit_event(
        logger,
        "model.mount",
        user_id=current_user.user_id,
        workspace_id=id,
        model_id=model.id,
        mount_path=mount_path,
    )
    return {
        "workspace_id": id,
        "model_id": model.id,
        "mount_path": mount_path,
        "message": "Model mounted",
    }

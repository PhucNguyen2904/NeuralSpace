"""Dataset registry API endpoints."""

from __future__ import annotations

import json
import io
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from minio import Minio
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.logging import audit_event, get_logger
from app.dependencies import UserContext, get_current_user, get_db
from app.models.dataset import Dataset
from app.models.workspace_assets import WorkspaceDataset
from app.repositories.workspace_repository import WorkspaceRepository

router = APIRouter(tags=["datasets"])
workspace_router = APIRouter(prefix="/workspaces", tags=["datasets"])
logger = get_logger(__name__)


class PaginatedDatasetResponse(BaseModel):
    items: list[dict]
    total: int
    page: int
    pageSize: int


class WorkspaceDatasetMountRequest(BaseModel):
    dataset_id: str = Field(min_length=1)
    mount_path: str | None = None


class ValidateDatasetsRequest(BaseModel):
    dataset_ids: list[str] = Field(default_factory=list)
    user_id: str = Field(min_length=1)


def _normalize_mount_key(raw: str) -> str:
    key = "".join(ch.lower() if ch.isalnum() else "_" for ch in raw).strip("_")
    return key or "dataset"


def _resolve_default_mount_path(dataset: Dataset) -> str:
    storage_path = (dataset.storage_path or "").strip()
    if storage_path.startswith("/workspace/datasets/"):
        return storage_path
    return f"/workspace/datasets/{_normalize_mount_key(dataset.id)}"


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


def _minio_client() -> Minio:
    settings = get_settings()
    return Minio(
        endpoint=settings.MINIO_ENDPOINT,
        access_key=settings.MINIO_ACCESS_KEY,
        secret_key=settings.MINIO_SECRET_KEY,
        secure=False,
    )


def _ensure_bucket(client: Minio) -> str:
    bucket = get_settings().MINIO_BUCKET
    if not client.bucket_exists(bucket):
        client.make_bucket(bucket)
    return bucket


@router.get("/datasets", response_model=PaginatedDatasetResponse)
async def list_datasets(
    search: str | None = Query(default=None),
    dataset_type: list[str] | None = Query(default=None, alias="type"),
    status_filter: str | None = Query(default=None, alias="status"),
    sort: str | None = Query(default="newest"),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=18, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _current_user: UserContext = Depends(get_current_user),
) -> PaginatedDatasetResponse:
    filters = []
    if search:
        like = f"%{search.lower()}%"
        filters.append(func.lower(Dataset.name).like(like))
    if dataset_type:
        filters.append(Dataset.dataset_type.in_(dataset_type))
    if status_filter:
        filters.append(Dataset.status == status_filter)

    where_clause = and_(*filters) if filters else None

    base_stmt = select(Dataset)
    count_stmt = select(func.count(Dataset.id))
    if where_clause is not None:
        base_stmt = base_stmt.where(where_clause)
        count_stmt = count_stmt.where(where_clause)

    if sort == "name":
        base_stmt = base_stmt.order_by(Dataset.name.asc())
    elif sort == "oldest":
        base_stmt = base_stmt.order_by(Dataset.created_at.asc())
    elif sort == "size":
        base_stmt = base_stmt.order_by(Dataset.size_bytes.desc())
    else:
        base_stmt = base_stmt.order_by(Dataset.updated_at.desc())

    offset = (page - 1) * limit
    base_stmt = base_stmt.offset(offset).limit(limit)

    rows = (await db.execute(base_stmt)).scalars().all()
    total = int((await db.execute(count_stmt)).scalar_one())

    items = [
        {
            "id": d.id,
            "name": d.name,
            "description": d.description or "",
            "type": d.dataset_type,
            "label_status": d.label_status or "unlabeled",
            "size_bytes": d.size_bytes,
            "item_count": d.item_count,
            "class_count": (d.source_payload or {}).get("class_count"),
            "tags": d.tags or [],
            "created_by": d.created_by or "system",
            "created_at": d.created_at,
            "updated_at": d.updated_at,
            "thumbnail_url": (d.source_payload or {}).get("thumbnail_url"),
            "storage_path": d.storage_path or "",
        }
        for d in rows
    ]

    return PaginatedDatasetResponse(items=items, total=total, page=page, pageSize=limit)


@router.post("/datasets/upload", status_code=status.HTTP_201_CREATED)
async def upload_dataset(
    file: UploadFile = File(...),
    metadata: str | None = Form(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: UserContext = Depends(get_current_user),
) -> dict:
    if not file.filename:
        audit_event(logger, "dataset.upload_failed", reason="missing_filename", user_id=current_user.user_id)
        raise HTTPException(status_code=400, detail="Missing filename")

    parsed = _parse_metadata(metadata)
    dataset_id = f"ds_{uuid4().hex[:12]}"
    dataset_name = str(parsed.get("name") or Path(file.filename).stem).strip() or "Uploaded Dataset"
    dataset_type = str(parsed.get("type") or "tabular").strip().lower()
    label_status = str(parsed.get("label_status") or "unlabeled").strip().lower()
    tags = parsed.get("tags") if isinstance(parsed.get("tags"), list) else []
    tags = [str(tag) for tag in tags]

    payload = await file.read()
    size_bytes = len(payload)
    target_name = f"{dataset_id}_{Path(file.filename).name}"
    object_key = f"users/{current_user.user_id}/datasets/{dataset_id}/{target_name}"
    minio = _minio_client()
    bucket = _ensure_bucket(minio)
    minio.put_object(bucket, object_key, data=io.BytesIO(payload), length=size_bytes)

    row = Dataset(
        id=dataset_id,
        name=dataset_name,
        description=str(parsed.get("description") or ""),
        dataset_type=dataset_type,
        status="ready",
        size_bytes=size_bytes,
        item_count=int(parsed.get("item_count") or 0),
        label_status=label_status,
        tags=tags,
        storage_path=object_key,
        created_by=current_user.user_id,
        source_payload={
            "class_count": parsed.get("class_count"),
            "thumbnail_url": parsed.get("thumbnail_url"),
            "original_filename": file.filename,
            "content_type": file.content_type or "application/octet-stream",
        },
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    audit_event(
        logger,
        "dataset.upload",
        user_id=current_user.user_id,
        dataset_id=row.id,
        dataset_name=row.name,
        dataset_type=row.dataset_type,
        size_bytes=row.size_bytes,
        item_count=row.item_count,
    )

    return {
        "id": row.id,
        "name": row.name,
        "description": row.description or "",
        "type": row.dataset_type,
        "label_status": row.label_status or "unlabeled",
        "size_bytes": row.size_bytes,
        "item_count": row.item_count,
        "class_count": (row.source_payload or {}).get("class_count"),
        "tags": row.tags or [],
        "created_by": row.created_by or "system",
        "created_at": row.created_at,
        "updated_at": row.updated_at,
        "thumbnail_url": (row.source_payload or {}).get("thumbnail_url"),
        "storage_path": row.storage_path or "",
    }


@router.get("/datasets/{id}/storage-path")
async def get_dataset_storage_path(
    id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserContext = Depends(get_current_user),
) -> dict:
    dataset = await db.get(Dataset, id)
    if dataset is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    if dataset.created_by != current_user.user_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    return {"storage_path": dataset.storage_path or ""}


@router.post("/datasets/validate")
async def validate_datasets(
    payload: ValidateDatasetsRequest,
    db: AsyncSession = Depends(get_db),
    _current_user: UserContext = Depends(get_current_user),
) -> dict:
    if not payload.dataset_ids:
        return {"valid": True}
    stmt = select(func.count(Dataset.id)).where(
        Dataset.id.in_(payload.dataset_ids),
        Dataset.created_by == payload.user_id,
    )
    total = int((await db.execute(stmt)).scalar_one())
    return {"valid": total == len(set(payload.dataset_ids))}


@workspace_router.post("/{id}/datasets", status_code=status.HTTP_201_CREATED)
async def mount_dataset_to_workspace(
    id: str,
    payload: WorkspaceDatasetMountRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserContext = Depends(get_current_user),
) -> dict:
    logger.info(
        "Mount dataset requested",
        workspace_id=id,
        dataset_id=payload.dataset_id,
        user_id=current_user.user_id,
    )

    workspace = await WorkspaceRepository.get_by_id_and_user(db, id, current_user.user_id)
    if workspace is None:
        logger.warning(
            "Mount dataset failed: workspace not found",
            workspace_id=id,
            dataset_id=payload.dataset_id,
            user_id=current_user.user_id,
        )
        audit_event(
            logger,
            "dataset.mount_failed",
            user_id=current_user.user_id,
            workspace_id=id,
            dataset_id=payload.dataset_id,
            reason="workspace_not_found",
        )
        raise HTTPException(status_code=404, detail="Workspace not found")

    dataset = await db.get(Dataset, payload.dataset_id)
    if dataset is None:
        logger.warning(
            "Mount dataset failed: dataset not found",
            workspace_id=id,
            dataset_id=payload.dataset_id,
            user_id=current_user.user_id,
        )
        audit_event(
            logger,
            "dataset.mount_failed",
            user_id=current_user.user_id,
            workspace_id=id,
            dataset_id=payload.dataset_id,
            reason="dataset_not_found",
        )
        raise HTTPException(status_code=404, detail="Dataset not found")

    mount_path = payload.mount_path or _resolve_default_mount_path(dataset)

    existing_stmt = select(WorkspaceDataset).where(
        WorkspaceDataset.workspace_id == id,
        WorkspaceDataset.dataset_id == dataset.id,
    )
    existing = (await db.execute(existing_stmt)).scalar_one_or_none()
    if existing is None:
        db.add(
            WorkspaceDataset(
                workspace_id=id,
                dataset_id=dataset.id,
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
        "dataset.mount",
        user_id=current_user.user_id,
        workspace_id=id,
        dataset_id=dataset.id,
        mount_path=mount_path,
    )
    logger.info(
        "Mount dataset succeeded",
        workspace_id=id,
        dataset_id=dataset.id,
        dataset_name=dataset.name,
        user_id=current_user.user_id,
        mounted_path=mount_path,
    )
    return {
        "workspace_id": id,
        "dataset_id": dataset.id,
        "dataset_name": dataset.name,
        "mount_path": mount_path,
        "mounted_path": mount_path,
        "mount_status": "mounted",
        "message": "Dataset mounted",
    }

"""Dataset registry API endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import UserContext, get_current_user, get_db
from app.models.dataset import Dataset
from app.models.workspace_assets import WorkspaceDataset
from app.repositories.workspace_repository import WorkspaceRepository

router = APIRouter(tags=["datasets"])
workspace_router = APIRouter(prefix="/workspaces", tags=["datasets"])


class PaginatedDatasetResponse(BaseModel):
    items: list[dict]
    total: int
    page: int
    pageSize: int


class WorkspaceDatasetMountRequest(BaseModel):
    dataset_id: str = Field(min_length=1)
    mount_path: str | None = None


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


@workspace_router.post("/{id}/datasets", status_code=status.HTTP_201_CREATED)
async def mount_dataset_to_workspace(
    id: str,
    payload: WorkspaceDatasetMountRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserContext = Depends(get_current_user),
) -> dict:
    workspace = await WorkspaceRepository.get_by_id_and_user(db, id, current_user.user_id)
    if workspace is None:
        raise HTTPException(status_code=404, detail="Workspace not found")

    dataset = await db.get(Dataset, payload.dataset_id)
    if dataset is None:
        raise HTTPException(status_code=404, detail="Dataset not found")

    mount_path = payload.mount_path or f"/workspace/datasets/{dataset.name.lower().replace(' ', '_')}"

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
    return {
        "workspace_id": id,
        "dataset_id": dataset.id,
        "mount_path": mount_path,
        "message": "Dataset mounted",
    }


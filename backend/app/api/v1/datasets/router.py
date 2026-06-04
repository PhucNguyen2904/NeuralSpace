"""Legacy-compatible datasets API for frontend list/detail pages."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db
from app.models.dataset import Dataset

router = APIRouter(prefix="/datasets", tags=["datasets"])


def _to_payload(row: Dataset) -> dict:
    source = row.source_payload or {}
    return {
        "id": row.id,
        "name": row.name,
        "description": row.description or "",
        "type": row.dataset_type,
        "label_status": row.label_status or "processing",
        "size_bytes": int(row.size_bytes or 0),
        "item_count": int(row.item_count or 0),
        "class_count": source.get("class_count"),
        "tags": row.tags or [],
        "created_by": row.created_by or "system",
        "created_at": row.created_at.isoformat(),
        "updated_at": row.updated_at.isoformat(),
        "thumbnail_url": None,
        "storage_path": row.storage_path or "",
    }


@router.get("")
async def list_datasets(
    page: int = Query(1, ge=1),
    limit: int = Query(24, ge=1, le=200),
    search: str | None = Query(default=None),
    type: list[str] | None = Query(default=None),
    status: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
) -> dict:
    filters = []
    if search:
        filters.append(func.lower(Dataset.name).like(f"%{search.lower()}%"))
    if type:
        filters.append(Dataset.dataset_type.in_(type))
    if status:
        filters.append(Dataset.label_status == status)

    stmt = select(Dataset)
    count_stmt = select(func.count(Dataset.id))
    if filters:
        for cond in filters:
            stmt = stmt.where(cond)
            count_stmt = count_stmt.where(cond)

    stmt = stmt.order_by(Dataset.updated_at.desc()).offset((page - 1) * limit).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    total = int((await db.execute(count_stmt)).scalar() or 0)
    return {"items": [_to_payload(row) for row in rows], "total": total, "page": page, "pageSize": limit}


@router.get("/{dataset_id}")
async def get_dataset(dataset_id: str, db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)) -> dict:
    row = await db.get(Dataset, dataset_id)
    if row is None:
        return {}
    return _to_payload(row)


@router.get("/{dataset_id}/preview")
async def get_dataset_preview(dataset_id: str, db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)) -> dict:
    row = await db.get(Dataset, dataset_id)
    if row is None:
        return {"samples": []}
    return {
        "samples": [{"id": f"{dataset_id}-sample-{i}", "content": f"Sample {i} of {row.name}", "thumbnail_url": None} for i in range(1, 7)],
        "class_distribution": {"class_a": 42, "class_b": 33, "class_c": 25} if row.dataset_type in {"image", "text"} else None,
        "split_info": {"train": 80, "val": 10, "test": 10},
        "column_info": [{"name": "feature_1", "type": "numeric"}, {"name": "label", "type": "text"}] if row.dataset_type == "tabular" else None,
    }


@router.post("/upload")
async def upload_dataset(
    file: UploadFile = File(...),
    metadata: str | None = Form(default=None),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
) -> dict:
    parsed = json.loads(metadata) if metadata else {}
    now = datetime.now(timezone.utc)
    dataset_id = f"ds_{uuid4().hex[:10]}"
    payload = Dataset(
        id=dataset_id,
        name=parsed.get("name") or file.filename.rsplit(".", 1)[0],
        description=parsed.get("description") or "Uploaded dataset",
        dataset_type=parsed.get("type") or "tabular",
        status="ready",
        size_bytes=int(file.size or 0),
        item_count=int(parsed.get("item_count") or 0),
        label_status=parsed.get("label_status") or "processing",
        tags=parsed.get("tags") or [],
        storage_path=f"/datasets/{dataset_id}",
        created_by="upload-user",
        source_payload={"class_count": parsed.get("class_count")},
        created_at=now,
        updated_at=now,
    )
    db.add(payload)
    await db.commit()
    await db.refresh(payload)
    return _to_payload(payload)

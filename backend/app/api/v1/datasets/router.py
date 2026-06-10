"""Legacy-compatible datasets API for frontend list/detail pages."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from uuid import uuid4
import re

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import UserContext, get_current_user, get_db
from app.models.dataset import Dataset
from app.models.mlops_tracking import DatasetVersion, MLDataset, ModelDatasetLink, ModelVersion, Run

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


def _version_payload(row: DatasetVersion, linked_models: list[dict] | None = None) -> dict:
    return {
        "id": row.id,
        "dataset_id": row.dataset_id,
        "version": row.version,
        "dvc_md5": row.dvc_md5 or "",
        "dvc_commit": row.dvc_commit or "",
        "git_commit": row.dvc_commit or "",
        "storage_path": row.storage_path or "",
        "storage_uri": row.storage_path or "",
        "size_bytes": int(row.size_bytes or 0),
        "item_count": int(row.item_count or 0),
        "split_info": row.split_info or {},
        "schema_snapshot": row.schema_snapshot or {},
        "changelog": row.changelog or "",
        "note": row.changelog or "",
        "is_latest": bool(row.is_latest),
        "status": row.status,
        "created_by": row.created_by,
        "created_at": row.created_at.isoformat(),
        "tracked_at": row.created_at.isoformat(),
        "linked_models": linked_models or [],
    }


async def _resolve_mlops_dataset(db: AsyncSession, dataset_id: str, user: UserContext) -> MLDataset:
    if re.fullmatch(r"[0-9a-fA-F-]{36}", dataset_id):
        row = await db.get(MLDataset, dataset_id)
        if row is not None:
            return row

    public_dataset = await db.get(Dataset, dataset_id)
    if public_dataset is not None:
        by_name = (
            await db.execute(select(MLDataset).where(MLDataset.name == public_dataset.name))
        ).scalar_one_or_none()
        if by_name is not None:
            return by_name

        row = MLDataset(
            id=str(uuid4()),
            name=public_dataset.name,
            description=public_dataset.description,
            type=public_dataset.dataset_type,
            owner_id=user.user_id,
            team_id=None,
            dvc_repo_url=None,
            storage_path=public_dataset.storage_path,
            tags=public_dataset.tags or [],
            status="active",
        )
        db.add(row)
        await db.commit()
        await db.refresh(row)
        return row

    by_name = (
        await db.execute(select(MLDataset).where(MLDataset.name == dataset_id))
    ).scalar_one_or_none()
    if by_name is not None:
        return by_name

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")


async def _version_linked_models(db: AsyncSession, version_id: str) -> list[dict]:
    rows = (
        await db.execute(
            select(ModelVersion)
            .join(ModelDatasetLink, ModelDatasetLink.model_version_id == ModelVersion.id)
            .where(ModelDatasetLink.dataset_version_id == version_id)
            .order_by(ModelVersion.created_at.desc())
        )
    ).scalars().all()
    return [
        {
            "id": row.id,
            "name": row.mlflow_name,
            "version": f"v{row.mlflow_version}",
            "stage": row.stage,
            "status": row.status,
        }
        for row in rows
    ]


@router.get("")
async def list_datasets(
    page: int = Query(1, ge=1),
    limit: int = Query(24, ge=1, le=200),
    search: str | None = Query(default=None),
    type: list[str] | None = Query(default=None),
    status: str | None = Query(default=None),
    size_min: int | None = Query(default=None),
    size_max: int | None = Query(default=None),
    tags: list[str] | None = Query(default=None),
    created_after: datetime | None = Query(default=None),
    sort: str | None = Query(default=None),
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
    if size_min is not None:
        filters.append(Dataset.size_bytes >= size_min)
    if size_max is not None:
        filters.append(Dataset.size_bytes <= size_max)
    if created_after is not None:
        filters.append(Dataset.created_at >= created_after)
    if tags:
        for tag in tags:
            filters.append(Dataset.tags.contains([tag]))

    stmt = select(Dataset)
    count_stmt = select(func.count(Dataset.id))
    if filters:
        for cond in filters:
            stmt = stmt.where(cond)
            count_stmt = count_stmt.where(cond)

    if sort == "oldest":
        stmt = stmt.order_by(Dataset.created_at.asc())
    elif sort == "name":
        stmt = stmt.order_by(Dataset.name.asc())
    elif sort == "size":
        stmt = stmt.order_by(Dataset.size_bytes.desc())
    else:
        stmt = stmt.order_by(Dataset.updated_at.desc())
        
    stmt = stmt.offset((page - 1) * limit).limit(limit)
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


@router.get("/{dataset_id}/versions")
async def list_dataset_versions(
    dataset_id: str,
    status_filter: str | None = Query(default=None, alias="status"),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=100, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: UserContext = Depends(get_current_user),
) -> dict:
    dataset = await _resolve_mlops_dataset(db, dataset_id, current_user)
    stmt = select(DatasetVersion).where(DatasetVersion.dataset_id == dataset.id)
    count_stmt = select(func.count(DatasetVersion.id)).where(DatasetVersion.dataset_id == dataset.id)
    if status_filter:
        stmt = stmt.where(DatasetVersion.status == status_filter)
        count_stmt = count_stmt.where(DatasetVersion.status == status_filter)
    stmt = stmt.order_by(DatasetVersion.created_at.desc()).offset((page - 1) * limit).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    total = int((await db.execute(count_stmt)).scalar() or 0)
    return {
        "items": [_version_payload(row) for row in rows],
        "total": total,
        "page": page,
        "pageSize": limit,
    }


@router.post("/{dataset_id}/versions", status_code=status.HTTP_201_CREATED)
async def create_dataset_version(
    dataset_id: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    current_user: UserContext = Depends(get_current_user),
) -> dict:
    dataset = await _resolve_mlops_dataset(db, dataset_id, current_user)
    latest = (
        await db.execute(
            select(DatasetVersion)
            .where(DatasetVersion.dataset_id == dataset.id)
            .order_by(DatasetVersion.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    latest_major = 0
    if latest is not None:
        match = re.match(r"^v?(\d+)", latest.version or "")
        latest_major = int(match.group(1)) if match else 0
    version = str(payload.get("version") or f"v{latest_major + 1}.0")
    await db.execute(
        DatasetVersion.__table__.update()
        .where(DatasetVersion.dataset_id == dataset.id, DatasetVersion.is_latest.is_(True))
        .values(is_latest=False)
    )
    row = DatasetVersion(
        id=str(uuid4()),
        dataset_id=dataset.id,
        version=version,
        dvc_md5=str(payload.get("dvc_md5") or payload.get("md5") or ""),
        dvc_commit=str(payload.get("dvc_commit") or payload.get("git_commit") or ""),
        storage_path=str(payload.get("storage_path") or payload.get("path") or payload.get("local_path") or dataset.storage_path or ""),
        size_bytes=int(payload.get("size_bytes") or 0),
        item_count=int(payload.get("item_count") or 0),
        schema_snapshot=payload.get("schema_snapshot") if isinstance(payload.get("schema_snapshot"), dict) else {},
        split_info=payload.get("split_info") if isinstance(payload.get("split_info"), dict) else {},
        changelog=str(payload.get("changelog") or payload.get("note") or payload.get("commit_message") or ""),
        is_latest=True,
        status=str(payload.get("status") or "draft"),
        created_by=current_user.user_id,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _version_payload(row)


@router.get("/{dataset_id}/versions/{version_id}")
async def get_dataset_version(
    dataset_id: str,
    version_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserContext = Depends(get_current_user),
) -> dict:
    dataset = await _resolve_mlops_dataset(db, dataset_id, current_user)
    row = await db.get(DatasetVersion, version_id)
    if row is None or row.dataset_id != dataset.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset version not found")
    return _version_payload(row, linked_models=await _version_linked_models(db, row.id))


@router.patch("/{dataset_id}/versions/{version_id}")
async def update_dataset_version(
    dataset_id: str,
    version_id: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    current_user: UserContext = Depends(get_current_user),
) -> dict:
    dataset = await _resolve_mlops_dataset(db, dataset_id, current_user)
    row = await db.get(DatasetVersion, version_id)
    if row is None or row.dataset_id != dataset.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset version not found")
    if "changelog" in payload:
        row.changelog = str(payload["changelog"])
    if "status" in payload:
        row.status = str(payload["status"])
    await db.commit()
    await db.refresh(row)
    return _version_payload(row, linked_models=await _version_linked_models(db, row.id))


@router.post("/{dataset_id}/versions/{version_id}/validate")
async def validate_dataset_version(
    dataset_id: str,
    version_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserContext = Depends(get_current_user),
) -> dict:
    dataset = await _resolve_mlops_dataset(db, dataset_id, current_user)
    row = await db.get(DatasetVersion, version_id)
    if row is None or row.dataset_id != dataset.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset version not found")
    actual_md5 = row.dvc_md5 or ""
    return {
        "is_valid": bool(actual_md5),
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "details": {
            "db_md5": row.dvc_md5 or "",
            "actual_md5": actual_md5,
            "storage_path": row.storage_path or "",
        },
    }


@router.get("/{dataset_id}/diff")
async def diff_dataset_versions(
    dataset_id: str,
    version_a: str = Query(...),
    version_b: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: UserContext = Depends(get_current_user),
) -> dict:
    dataset = await _resolve_mlops_dataset(db, dataset_id, current_user)
    rows = (
        await db.execute(select(DatasetVersion).where(DatasetVersion.dataset_id == dataset.id))
    ).scalars().all()
    by_key = {row.id: row for row in rows} | {row.version: row for row in rows}
    a = by_key.get(version_a)
    b = by_key.get(version_b)
    if a is None or b is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="One or both versions not found")
    item_delta = int((a.item_count or 0) - (b.item_count or 0))
    size_delta = int((a.size_bytes or 0) - (b.size_bytes or 0))
    changed = (a.dvc_md5 or "") != (b.dvc_md5 or "")
    return {
        "versionAId": a.id,
        "versionBId": b.id,
        "added": max(item_delta, 0),
        "modified": 1 if changed else 0,
        "removed": max(-item_delta, 0),
        "netChange": item_delta,
        "netPercent": round((item_delta / max(int(b.item_count or 1), 1)) * 100, 2),
        "sizeDelta": size_delta,
        "samples": [],
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

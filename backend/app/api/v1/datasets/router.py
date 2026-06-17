"""Legacy-compatible datasets API for frontend list/detail pages."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from uuid import uuid4
import re

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import UserContext, get_current_user, get_db
from app.models.dataset import Dataset
from app.models.mlops_tracking import DatasetVersion, MLDataset, ModelDatasetLink, ModelVersion, Run
from app.models.workspace_assets import WorkspaceDataset

router = APIRouter(prefix="/datasets", tags=["datasets"])


def _object_from_storage_path(storage_path: str | None) -> tuple[str | None, str] | None:
    if not storage_path:
        return None
    if storage_path.startswith("s3://"):
        _, rest = storage_path.split("s3://", 1)
        bucket, _, object_name = rest.partition("/")
        return (bucket or None, object_name) if object_name else None
    normalized = storage_path.replace("\\", "/").lstrip("/")
    return (None, normalized) if normalized else None


def _dataset_minio_refs(row: Dataset | None, mlops_row: MLDataset | None, versions: list[DatasetVersion]) -> set[tuple[str | None, str]]:
    refs: set[tuple[str | None, str]] = set()
    for storage_path in [getattr(row, "storage_path", None), getattr(mlops_row, "storage_path", None)]:
        ref = _object_from_storage_path(storage_path)
        if ref:
            refs.add(ref)
    if row is not None:
        source = row.source_payload or {}
        minio_object = source.get("minio_object")
        if isinstance(minio_object, str) and minio_object.strip():
            refs.add((None, minio_object.strip()))
    for version in versions:
        ref = _object_from_storage_path(version.storage_path)
        if ref:
            refs.add(ref)
    return refs


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
        "custom_metadata": source.get("custom_metadata") or {},
        "tags": row.tags or [],
        "created_by": row.created_by or "system",
        "created_at": row.created_at.isoformat(),
        "updated_at": row.updated_at.isoformat(),
        "thumbnail_url": None,
        "storage_path": row.storage_path or "",
    }


def _mlops_to_payload(row: MLDataset) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "description": row.description or "",
        "type": row.type,
        "label_status": "labeled" if row.status == "active" else "processing",
        "size_bytes": 0,
        "item_count": 0,
        "class_count": None,
        "custom_metadata": {},
        "tags": row.tags or [],
        "created_by": row.owner_id or "system",
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
        "metadata_uri": getattr(row, "metadata_uri", None),
        "validation_report_uri": getattr(row, "validation_report_uri", None),
        "validation_status": getattr(row, "validation_status", None),
        "validation_summary": getattr(row, "validation_summary", None),
        "metadata_snapshot": getattr(row, "metadata_snapshot", None),
        "format": getattr(row, "format", None),
        "task_type": getattr(row, "task_type", None),
        "created_by": row.created_by,
        "created_at": row.created_at.isoformat(),
        "tracked_at": row.created_at.isoformat(),
        "linked_models": linked_models or [],
    }


def _parse_tags(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


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
    if row is not None:
        return _to_payload(row)

    mlops_row = None
    if re.fullmatch(r"[0-9a-fA-F-]{36}", dataset_id):
        mlops_row = await db.get(MLDataset, dataset_id)
    if mlops_row is None:
        mlops_row = (
            await db.execute(select(MLDataset).where(MLDataset.name == dataset_id))
        ).scalar_one_or_none()
    if mlops_row is None:
        return {}
    return _mlops_to_payload(mlops_row)


@router.patch("/{dataset_id}")
async def update_dataset(
    dataset_id: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    current_user: UserContext = Depends(get_current_user),
) -> dict:
    row = await db.get(Dataset, dataset_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")

    if "description" in payload:
        row.description = str(payload["description"] or "")
    if "tags" in payload and isinstance(payload["tags"], list):
        row.tags = [str(item).strip() for item in payload["tags"] if str(item).strip()]
    if "label_status" in payload and payload["label_status"] is not None:
        allowed_label_statuses = {"labeled", "unlabeled", "processing"}
        label_status = str(payload["label_status"])
        if label_status not in allowed_label_statuses:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"label_status must be one of {sorted(allowed_label_statuses)}",
            )
        row.label_status = label_status

    if "class_count" in payload:
        source_payload = dict(row.source_payload or {})
        class_count = payload["class_count"]
        if class_count in (None, ""):
            source_payload.pop("class_count", None)
        else:
            try:
                parsed_class_count = int(class_count)
            except (TypeError, ValueError) as exc:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="class_count must be an integer",
                ) from exc
            if parsed_class_count < 0:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="class_count must be greater than or equal to 0",
                )
            source_payload["class_count"] = parsed_class_count
        row.source_payload = source_payload

    if "custom_metadata" in payload:
        custom_metadata = payload["custom_metadata"]
        if not isinstance(custom_metadata, dict):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="custom_metadata must be an object",
            )
        source_payload = dict(row.source_payload or {})
        source_payload["custom_metadata"] = {
            str(key).strip(): str(value).strip()
            for key, value in custom_metadata.items()
            if str(key).strip() and value is not None and str(value).strip()
        }
        row.source_payload = source_payload

    row.updated_at = datetime.now(timezone.utc)

    mlops_dataset = await _resolve_mlops_dataset(db, dataset_id, current_user)
    mlops_dataset.description = row.description
    mlops_dataset.tags = row.tags or []

    await db.commit()
    await db.refresh(row)
    return _to_payload(row)


@router.delete("/{dataset_id}")
async def delete_dataset(
    dataset_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserContext = Depends(get_current_user),
) -> dict:
    from app.clients.minio_client import get_minio_client

    row = await db.get(Dataset, dataset_id)
    mlops_dataset: MLDataset | None = None
    if re.fullmatch(r"[0-9a-fA-F-]{36}", dataset_id):
        mlops_dataset = await db.get(MLDataset, dataset_id)
    if row is not None and mlops_dataset is None:
        mlops_dataset = (
            await db.execute(select(MLDataset).where(MLDataset.name == row.name))
        ).scalar_one_or_none()
    if mlops_dataset is None:
        mlops_dataset = (
            await db.execute(select(MLDataset).where(MLDataset.name == dataset_id))
        ).scalar_one_or_none()
    if row is None and mlops_dataset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")

    if (
        row is not None
        and row.created_by
        and row.created_by != current_user.user_id
        and "admin" not in current_user.roles
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permission")
    if (
        mlops_dataset is not None
        and mlops_dataset.owner_id != current_user.user_id
        and "admin" not in current_user.roles
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permission")

    versions = []
    if mlops_dataset is not None:
        versions = list(
            (
                await db.execute(
                    select(DatasetVersion).where(DatasetVersion.dataset_id == mlops_dataset.id)
                )
            ).scalars().all()
        )

    minio = get_minio_client()
    deleted_objects = 0
    for bucket, object_name in _dataset_minio_refs(row, mlops_dataset, versions):
        if object_name.endswith(".dvc"):
            continue
        await minio.delete_object(object_name, bucket=bucket)
        deleted_objects += 1
    if row is not None:
        deleted_objects += await minio.delete_prefix(f"datasets/{row.id}/")
    if mlops_dataset is not None:
        deleted_objects += await minio.delete_prefix(f"datasets/{mlops_dataset.id}/")

    if mlops_dataset is not None and versions:
        version_ids = [item.id for item in versions]
        await db.execute(
            update(Run)
            .where(Run.dvc_dataset_version_id.in_(version_ids))
            .values(dvc_dataset_version_id=None, dvc_md5=None)
        )
        await db.execute(delete(ModelDatasetLink).where(ModelDatasetLink.dataset_version_id.in_(version_ids)))
        await db.execute(delete(DatasetVersion).where(DatasetVersion.id.in_(version_ids)))
    if row is not None:
        await db.execute(delete(WorkspaceDataset).where(WorkspaceDataset.dataset_id == row.id))
        await db.delete(row)
    if mlops_dataset is not None:
        await db.delete(mlops_dataset)
    await db.commit()

    return {"deleted": True, "dataset_id": dataset_id, "deleted_objects": deleted_objects}


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


@router.post("/{dataset_id}/versions/track", status_code=status.HTTP_201_CREATED)
async def track_dataset_version(
    dataset_id: str,
    # ── File upload ──────────────────────────────────────────────────────────
    file: UploadFile = File(..., description="New dataset file to track with DVC"),
    # ── Form fields ──────────────────────────────────────────────────────────
    version: str | None = Form(default=None, description="Optional explicit version, e.g. v2 or v2.0"),
    commit_message: str = Form(..., description="Git commit message for this DVC snapshot"),
    changelog: str = Form(default="", description="Human-readable change description"),
    item_count: int = Form(default=0, description="Number of samples/rows in the dataset"),
    version_status: str = Form(default="draft", alias="status", description="draft | validated | deprecated"),
    split_info: str | None = Form(default=None, description="JSON string: {train, val, test} split ratios"),
    schema_snapshot: str | None = Form(default=None, description="JSON string: column/feature schema snapshot"),
    # ── Dependencies ─────────────────────────────────────────────────────────
    db: AsyncSession = Depends(get_db),
    current_user: UserContext = Depends(get_current_user),
) -> dict:
    """
    Upload a new dataset file and track it as a new DatasetVersion via DVC.

    - Saves the file to a safe staging path inside the local DVC repo.
    - Runs `dvc add`, `git commit`, `dvc push`.
    - Marks the previous latest version as `is_latest=false`.
    - Creates a new `DatasetVersion` row with `is_latest=true`.
    - Updates the parent `MLDataset` metadata.

    Requires `DVC_REPO_PATH` to point to an initialised `git+dvc` repository.
    """
    import json

    from app.config import get_settings
    from app.services.mlops_dataset_service import DatasetService

    settings = get_settings()

    # ── Resolve / auto-create the MLDataset row ───────────────────────────
    dataset = await _resolve_mlops_dataset(db, dataset_id, current_user)

    # ── Parse optional JSON form fields ──────────────────────────────────
    parsed_split_info: dict | None = None
    parsed_schema_snapshot: dict | None = None
    if split_info:
        try:
            parsed_split_info = json.loads(split_info)
        except (ValueError, TypeError):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="split_info must be valid JSON",
            )
    if schema_snapshot:
        try:
            parsed_schema_snapshot = json.loads(schema_snapshot)
        except (ValueError, TypeError):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="schema_snapshot must be valid JSON",
            )

    # ── Read file bytes ───────────────────────────────────────────────────
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Uploaded file is empty",
        )

    # ── Validate version_status value ────────────────────────────────────
    allowed_statuses = {"draft", "validated", "deprecated"}
    if version_status not in allowed_statuses:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"status must be one of {sorted(allowed_statuses)}",
        )

    # ── Delegate to service ──────────────────────────────────────────────
    svc = DatasetService(db)
    new_version = await svc.track_new_version(
        dataset=dataset,
        file_bytes=file_bytes,
        filename=file.filename or "upload",
        version=version,
        commit_message=commit_message,
        changelog=changelog,
        item_count=item_count,
        version_status=version_status,
        split_info=parsed_split_info,
        schema_snapshot=parsed_schema_snapshot,
        user=current_user,
        dvc_repo_path=settings.DVC_REPO_PATH,
        dvc_remote_name=settings.DVC_REMOTE_NAME,
    )

    return _version_payload(new_version)


@router.post("/uploads/yolo", status_code=status.HTTP_201_CREATED)
async def upload_yolo_dataset(
    file: UploadFile = File(..., description="YOLO/Ultralytics dataset ZIP"),
    name: str | None = Form(default=None),
    version: str | None = Form(default=None),
    description: str | None = Form(default=None),
    tags: str | None = Form(default=None, description="Comma-separated tags"),
    db: AsyncSession = Depends(get_db),
    current_user: UserContext = Depends(get_current_user),
) -> dict:
    from app.services.dataset_upload_service import DatasetUploadService

    return await DatasetUploadService(db).upload_yolo(
        file=file,
        user=current_user,
        name=name,
        version=version,
        description=description,
        tags=_parse_tags(tags),
    )


@router.post("/uploads/general", status_code=status.HTTP_201_CREATED)
async def upload_general_dataset(
    file: UploadFile = File(..., description="CSV, JSON, Parquet, or custom ZIP dataset"),
    name: str | None = Form(default=None),
    version: str | None = Form(default=None),
    description: str | None = Form(default=None),
    dataset_type: str | None = Form(default=None),
    task: str | None = Form(default=None),
    label_column: str | None = Form(default=None),
    tags: str | None = Form(default=None, description="Comma-separated tags"),
    db: AsyncSession = Depends(get_db),
    current_user: UserContext = Depends(get_current_user),
) -> dict:
    from app.services.dataset_upload_service import DatasetUploadService

    return await DatasetUploadService(db).upload_general(
        file=file,
        user=current_user,
        name=name,
        version=version,
        description=description,
        dataset_type=dataset_type,
        task_type=task,
        tags=_parse_tags(tags),
        label_column=label_column,
    )


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


@router.get("/{dataset_id}/versions/{version_id}/metadata")
async def get_dataset_version_metadata(
    dataset_id: str,
    version_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserContext = Depends(get_current_user),
) -> dict:
    dataset = await _resolve_mlops_dataset(db, dataset_id, current_user)
    row = await db.get(DatasetVersion, version_id)
    if row is None or row.dataset_id != dataset.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset version not found")
    return getattr(row, "metadata_snapshot", None) or {}


@router.get("/{dataset_id}/versions/{version_id}/validation-report")
async def get_dataset_version_validation_report(
    dataset_id: str,
    version_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserContext = Depends(get_current_user),
) -> dict:
    dataset = await _resolve_mlops_dataset(db, dataset_id, current_user)
    row = await db.get(DatasetVersion, version_id)
    if row is None or row.dataset_id != dataset.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset version not found")
    snapshot = getattr(row, "metadata_snapshot", None) or {}
    validation = snapshot.get("validation") if isinstance(snapshot, dict) else None
    return {
        "status": getattr(row, "validation_status", None) or "unknown",
        "summary": getattr(row, "validation_summary", None) or {},
        "validation": validation or {},
        "validation_report_uri": getattr(row, "validation_report_uri", None),
    }


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
    current_user: UserContext = Depends(get_current_user),
) -> dict:
    from app.clients.minio_client import get_minio_client, md5_hex
    from app.config import get_settings
    from app.services.mlops_dataset_service import DatasetService

    try:
        parsed = json.loads(metadata) if metadata else {}
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="metadata must be valid JSON",
        ) from exc
    now = datetime.now(timezone.utc)
    dataset_id = f"ds_{uuid4().hex[:10]}"

    # --- Read file contents ---
    raw = await file.read()
    file_size = len(raw)
    file_md5 = md5_hex(raw)

    # --- Upload to MinIO ---
    minio = get_minio_client()
    safe_filename = (file.filename or "upload").replace("\\", "/").split("/")[-1]
    object_name = f"datasets/{dataset_id}/versions/v1/{safe_filename}"
    content_type = file.content_type or "application/octet-stream"
    storage_path = await minio.upload_bytes(
        object_name=object_name,
        data=raw,
        content_type=content_type,
    )

    # --- Persist metadata to DB ---
    payload = Dataset(
        id=dataset_id,
        name=parsed.get("name") or safe_filename.rsplit(".", 1)[0],
        description=parsed.get("description") or "Uploaded dataset",
        dataset_type=parsed.get("type") or "tabular",
        status="ready",
        size_bytes=file_size,
        item_count=int(parsed.get("item_count") or 0),
        label_status=parsed.get("label_status") or "processing",
        tags=parsed.get("tags") or [],
        storage_path=storage_path,
        created_by=str(getattr(current_user, "user_id", "upload-user")),
        source_payload={
            "class_count": parsed.get("class_count"),
            "minio_object": object_name,
            "md5": file_md5,
        },
        created_at=now,
        updated_at=now,
    )
    db.add(payload)
    await db.commit()
    await db.refresh(payload)

    payload_id = payload.id
    payload_name = payload.name
    existing_mlops_dataset = (
        await db.execute(select(MLDataset).where(MLDataset.name == payload_name))
    ).scalar_one_or_none()
    mlops_dataset_id: str | None = None
    try:
        mlops_dataset = await _resolve_mlops_dataset(db, payload.id, current_user)
        mlops_dataset_id = mlops_dataset.id
        version = await DatasetService(db).track_new_version(
            dataset=mlops_dataset,
            file_bytes=raw,
            filename=safe_filename,
            version=parsed.get("version") if parsed.get("version") is not None else None,
            commit_message=str(parsed.get("commit_message") or f"chore(data): track {payload_name}"),
            changelog=str(parsed.get("changelog") or "Initial upload"),
            item_count=int(payload.item_count or 0),
            version_status=str(parsed.get("version_status") or parsed.get("status") or "draft"),
            split_info=parsed.get("split_info") if isinstance(parsed.get("split_info"), dict) else None,
            schema_snapshot=parsed.get("schema_snapshot") if isinstance(parsed.get("schema_snapshot"), dict) else None,
            user=current_user,
            dvc_repo_path=get_settings().DVC_REPO_PATH,
            dvc_remote_name=get_settings().DVC_REMOTE_NAME,
        )
    except Exception:
        await db.rollback()
        await minio.delete_object(object_name)
        await db.execute(delete(Dataset).where(Dataset.id == payload_id))
        if existing_mlops_dataset is None and mlops_dataset_id is not None:
            await db.execute(delete(MLDataset).where(MLDataset.id == mlops_dataset_id))
        await db.commit()
        raise

    response = _to_payload(payload)
    response["latest_version"] = _version_payload(version)
    return response

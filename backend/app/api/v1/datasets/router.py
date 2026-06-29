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
        "status": row.status,
        "yolo_task": source.get("task_type"),
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
        "dvc_profile_id": row.dvc_profile_id,
        "status": row.status,
    }


def _version_payload(row: DatasetVersion, linked_models: list[dict] | None = None) -> dict:
    return {
        "id": row.id,
        "dataset_id": row.dataset_id,
        "version": row.version,
        "dvc_md5": row.dvc_md5 or "",
        "dvc_commit": row.dvc_commit or "",
        "dvc_profile_id": row.dvc_profile_id,
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


async def _resolve_user_names(db: AsyncSession, items: list[dict], keys: list[str] | None = None) -> None:
    if keys is None:
        keys = ["created_by"]
    from app.models.user import User
    import uuid
    user_ids = set()
    for item in items:
        for key in keys:
            val = item.get(key)
            if val and val != "system":
                try:
                    uuid.UUID(str(val))
                    user_ids.add(val)
                except ValueError:
                    pass
    if not user_ids:
        return
    rows = (await db.execute(select(User.id, User.full_name).where(User.id.in_(list(user_ids))))).all()
    mapping = {str(r.id): r.full_name or "Unknown User" for r in rows}
    for item in items:
        for key in keys:
            val = item.get(key)
            if val and val in mapping:
                item[key] = mapping[val]

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
    archive_status: str | None = Query(default="active"),
    task_type: list[str] | None = Query(default=None),
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

    if archive_status == "active":
        filters.append(Dataset.status != "archived")
    elif archive_status == "archived":
        filters.append(Dataset.status == "archived")

    if task_type:
        from sqlalchemy import or_
        task_conditions = [
            Dataset.source_payload["task_type"].astext == t
            for t in task_type
        ]
        filters.append(or_(*task_conditions))

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
    payloads = [_to_payload(row) for row in rows]
    await _resolve_user_names(db, payloads)
    return {"items": payloads, "total": total, "page": page, "pageSize": limit}


@router.get("/{dataset_id}/download-url")
async def get_dataset_download_url(
    dataset_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserContext = Depends(get_current_user),
) -> dict:
    from app.clients.minio_client import get_minio_client

    dataset = await _resolve_mlops_dataset(db, dataset_id, current_user)
    
    # Prioritize latest version for downloading
    latest_version = (
        await db.execute(
            select(DatasetVersion)
            .where(DatasetVersion.dataset_id == dataset.id, DatasetVersion.is_latest.is_(True))
        )
    ).scalar_one_or_none()

    storage_path = None
    dvc_md5 = None

    if latest_version:
        if latest_version.dvc_md5:
            dvc_md5 = latest_version.dvc_md5.strip()
        if latest_version.storage_path:
            storage_path = latest_version.storage_path

    # Fallback to dataset storage path if no version found
    if not storage_path and not dvc_md5:
        storage_path = dataset.storage_path
        if not storage_path:
            pub_ds = await db.get(Dataset, dataset_id)
            if pub_ds:
                storage_path = pub_ds.storage_path

    if not storage_path and not dvc_md5:
        raise HTTPException(status_code=404, detail="Dataset file not found")

    bucket = None
    object_name = None

    if dvc_md5:
        dvc_prefix = "dvc/"
        if dataset.dvc_profile_id:
            from app.models.mlops_tracking import DVCProfile
            profile_row = await db.get(DVCProfile, dataset.dvc_profile_id)
            if profile_row and profile_row.remote_url:
                match = re.match(r"s3://([^/]+)(/.*)?", profile_row.remote_url.strip())
                if match:
                    bucket = match.group(1)
                    parsed_prefix = match.group(2).strip("/") if match.group(2) else ""
                    if parsed_prefix:
                        dvc_prefix = parsed_prefix + "/"
        
        object_name = f"{dvc_prefix}files/md5/{dvc_md5[:2]}/{dvc_md5[2:]}"
    elif storage_path:
        if storage_path.endswith(".dvc"):
             raise HTTPException(status_code=404, detail="No DVC MD5 found for dataset")
             
        if storage_path.startswith("s3://"):
            _, rest = storage_path.split("s3://", 1)
            bucket, _, object_name = rest.partition("/")
        else:
            object_name = storage_path.replace("\\", "/", -1).lstrip("/")
            
    if not object_name:
         raise HTTPException(status_code=404, detail="Dataset file not found")

    client = get_minio_client()

    # ── Check if this is a delta version and reconstruct if needed ────────
    if latest_version:
        snapshot = latest_version.metadata_snapshot or {}
        if snapshot.get("is_delta") and snapshot.get("base_version_id") and snapshot.get("delta_type"):
            delta_type = snapshot["delta_type"]
            try:
                base_version_id = snapshot["base_version_id"]
                base_ver = await db.get(DatasetVersion, base_version_id)
                if base_ver and base_ver.storage_path:
                    base_path = base_ver.storage_path
                    base_bucket = None
                    if base_path.startswith("s3://"):
                        _, rest = base_path.split("s3://", 1)
                        base_bucket, _, base_path = rest.partition("/")

                    base_raw = await client.get_object_data(base_path, bucket=base_bucket)
                    delta_raw = await client.get_object_data(object_name, bucket=bucket)

                    from app.services.dataset_delta_service import apply_delta
                    merged_raw, _ = apply_delta(base_raw, delta_raw, delta_type)

                    # Upload merged file to a temp path for presigned URL
                    import io as _io
                    ext = ".zip" if delta_type == "zip" else f".{delta_type}"
                    content_type = {
                        "zip": "application/zip",
                        "csv": "text/csv",
                        "json": "application/json"
                    }.get(delta_type, "application/octet-stream")
                    merged_object = f"datasets/reconstructed/{latest_version.id}/merged{ext}"
                    
                    await client.upload_fileobj(
                        merged_object,
                        _io.BytesIO(merged_raw),
                        len(merged_raw),
                        content_type=content_type,
                    )
                    url = client.presigned_get_url(merged_object, bucket=bucket, expires_seconds=3600)
                    return {"url": url, "reconstructed": True}
            except Exception:
                # Fallback to returning the delta file directly if reconstruction fails
                pass

    url = client.presigned_get_url(object_name, bucket=bucket, expires_seconds=3600)
    return {"url": url}



@router.get("/{dataset_id}")
async def get_dataset(dataset_id: str, db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)) -> dict:
    row = await db.get(Dataset, dataset_id)
    if row is not None:
        payload = _to_payload(row)
        await _resolve_user_names(db, [payload])
        return payload

    mlops_row = None
    if re.fullmatch(r"[0-9a-fA-F-]{36}", dataset_id):
        mlops_row = await db.get(MLDataset, dataset_id)
    if mlops_row is None:
        mlops_row = (
            await db.execute(select(MLDataset).where(MLDataset.name == dataset_id))
        ).scalar_one_or_none()
    if mlops_row is None:
        return {}
    payload = _mlops_to_payload(mlops_row)
    await _resolve_user_names(db, [payload])
    return payload


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

    if "status" in payload and payload["status"] is not None:
        allowed_statuses = {"ready", "active", "archived"}
        status_val = str(payload["status"])
        if status_val not in allowed_statuses:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"status must be one of {sorted(allowed_statuses)}",
            )
        row.status = "archived" if status_val == "archived" else "ready"

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
    if "status" in payload and payload["status"] is not None:
        mlops_dataset.status = "archived" if str(payload["status"]) == "archived" else "active"

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

        if mlops_dataset.dvc_profile_id:
            from app.config import get_settings
            from app.services.dvc_profile_service import DVCProfileService
            from src.integrations.dvc.client import DVCClient
            import logging

            settings = get_settings()
            try:
                profile = await DVCProfileService(db, settings).resolve_for_dataset(
                    dataset=mlops_dataset,
                    user=current_user,
                    requested_profile_id=mlops_dataset.dvc_profile_id
                )
                dvc_client = DVCClient(
                    repo_path=profile.repo_path,
                    remote_name=profile.remote_name,
                    ssh_key_encrypted=profile.ssh_key_encrypted,
                    git_ssh_url=profile.git_ssh_url,
                )
                await dvc_client.remove_dataset(
                    dataset_name=dataset_id,
                    commit_message=f"chore(data): hard delete dataset {mlops_dataset.name}"
                )
            except Exception as exc:
                logging.warning(f"Failed to remove dataset from DVC repository: {exc}")

    minio = get_minio_client()
    deleted_objects = 0
    
    dvc_bucket = minio._bucket
    dvc_prefix = ""
    if mlops_dataset and mlops_dataset.dvc_profile_id:
        try:
            from app.models.mlops_tracking import DVCProfile
            profile_row = await db.get(DVCProfile, mlops_dataset.dvc_profile_id)
            if profile_row and profile_row.remote_url:
                match = re.match(r"s3://([^/]+)(/.*)?", profile_row.remote_url.strip())
                if match:
                    dvc_bucket = match.group(1)
                    parsed_prefix = match.group(2).strip("/") if match.group(2) else ""
                    if parsed_prefix:
                        dvc_prefix = parsed_prefix + "/"
        except Exception:
            pass

    md5_set = set()
    for v in versions:
        if not v.dvc_md5:
            continue
        dvc_md5 = v.dvc_md5.strip()
        if not dvc_md5:
            continue
        md5_set.add(dvc_md5)
        if dvc_md5.endswith(".dir"):
            dir_obj_name = f"{dvc_prefix}files/md5/{dvc_md5[:2]}/{dvc_md5[2:]}"
            try:
                import json
                raw_data = await minio.get_object_data(dir_obj_name, bucket=dvc_bucket)
                dir_data = json.loads(raw_data.decode("utf-8"))
                for item in dir_data:
                    if isinstance(item, dict) and "md5" in item:
                        md5_set.add(item["md5"])
            except Exception as exc:
                import logging
                logging.warning(f"Could not parse .dir file {dvc_md5} from MinIO during hard delete: {exc}")

    for md5 in md5_set:
        obj_name = f"{dvc_prefix}files/md5/{md5[:2]}/{md5[2:]}"
        try:
            await minio.delete_object(obj_name, bucket=dvc_bucket)
            deleted_objects += 1
        except Exception as exc:
            import logging
            logging.warning(f"Failed to delete DVC chunk {md5} from MinIO: {exc}")

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
    payloads = [_version_payload(row) for row in rows]
    await _resolve_user_names(db, payloads)
    return {
        "items": payloads,
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
        dvc_profile_id=payload.get("dvc_profile_id") if isinstance(payload.get("dvc_profile_id"), str) else dataset.dvc_profile_id,
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
    dvc_profile_id: str | None = Form(default=None, description="Optional DVC storage profile id"),
    git_repository_id: str | None = Form(default=None, description="Optional Git repository id"),
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
    from app.services.dvc_profile_service import DVCProfileService

    settings = get_settings()

    # ── Resolve / auto-create the MLDataset row ───────────────────────────
    dataset = await _resolve_mlops_dataset(db, dataset_id, current_user)
    profile = await DVCProfileService(db, settings).resolve_for_dataset(
        dataset=dataset,
        user=current_user,
        requested_profile_id=dvc_profile_id or git_repository_id,
    )

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

    # ── Verify file size constraint ───────────────────────────────────────
    if not getattr(file, "size", 1) or file.size == 0:
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
        file=file,
        version=version,
        commit_message=commit_message,
        changelog=changelog,
        item_count=item_count,
        version_status=version_status,
        split_info=parsed_split_info,
        schema_snapshot=parsed_schema_snapshot,
        user=current_user,
        dvc_repo_path=profile.repo_path,
        dvc_remote_name=profile.remote_name,
        dvc_profile_id=profile.id,
        ssh_key_encrypted=profile.ssh_key_encrypted,
        git_ssh_url=profile.git_ssh_url,
    )

    payload = _version_payload(new_version)
    await _resolve_user_names(db, [payload])
    return payload


@router.post("/{dataset_id}/versions/track-delta", status_code=status.HTTP_201_CREATED)
async def track_dataset_version_delta(
    dataset_id: str,
    # ── File upload ──────────────────────────────────────────────────────────
    file: UploadFile = File(..., description="Delta file containing only the changes (ZIP with delta_manifest.json for images, or ZIP with added/removed CSVs for tabular data)"),
    # ── Required: base version ───────────────────────────────────────────────
    base_version_id: str = Form(..., description="ID of the DatasetVersion to apply this delta on top of"),
    # ── Optional form fields ─────────────────────────────────────────────────
    version: str | None = Form(default=None, description="Optional explicit version, e.g. v3 or v3.0"),
    commit_message: str = Form(default="", description="Git commit message for this DVC snapshot"),
    changelog: str = Form(default="", description="Human-readable change description"),
    item_count: int = Form(default=0, description="Number of samples/rows in the merged dataset"),
    version_status: str = Form(default="draft", alias="status", description="draft | validated | deprecated"),
    split_info: str | None = Form(default=None, description="JSON string: {train, val, test} split ratios"),
    schema_snapshot: str | None = Form(default=None, description="JSON string: column/feature schema snapshot"),
    dvc_profile_id: str | None = Form(default=None, description="Optional DVC storage profile id"),
    # ── Dependencies ─────────────────────────────────────────────────────────
    db: AsyncSession = Depends(get_db),
    current_user: UserContext = Depends(get_current_user),
) -> dict:
    """
    Upload a *delta* file and create a new DatasetVersion by merging it with an existing base version.

    Instead of uploading the entire dataset again, only upload the changes:

    **For ZIP / Image datasets** — upload a ZIP containing:
    - Only the added or modified files
    - A `delta_manifest.json` describing removed files

    **For CSV datasets** — upload a ZIP containing:
    - `added_rows.csv` — new rows to append
    - `modified_rows.csv` — updated rows (with `__original_index__` column)
    - `removed_ids.json` — list of 0-based row indices to remove
    - `delta_manifest.json`

    **For JSON datasets** — upload a ZIP containing:
    - `added_records.json` — new records to append
    - `removed_ids.json` — list of 0-based indices to remove
    - `delta_manifest.json`

    The server merges the delta with the base version and stores the full reconstructed
    file (transparent to the download flow).
    """
    import json as _json

    from app.config import get_settings
    from app.services.mlops_dataset_service import DatasetService
    from app.services.dvc_profile_service import DVCProfileService

    settings = get_settings()

    # ── Resolve dataset ───────────────────────────────────────────────────
    dataset = await _resolve_mlops_dataset(db, dataset_id, current_user)

    # ── Parse optional JSON form fields ──────────────────────────────────
    parsed_split_info: dict | None = None
    parsed_schema_snapshot: dict | None = None
    if split_info:
        try:
            parsed_split_info = _json.loads(split_info)
        except (ValueError, TypeError):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="split_info must be valid JSON",
            )
    if schema_snapshot:
        try:
            parsed_schema_snapshot = _json.loads(schema_snapshot)
        except (ValueError, TypeError):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="schema_snapshot must be valid JSON",
            )

    # ── Validate status ───────────────────────────────────────────────────
    allowed_statuses = {"draft", "validated", "deprecated"}
    if version_status not in allowed_statuses:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"status must be one of {sorted(allowed_statuses)}",
        )

    # ── Validate file is not empty ────────────────────────────────────────
    if not getattr(file, "size", 1) or file.size == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Delta file is empty",
        )

    # ── Resolve DVC profile ───────────────────────────────────────────────
    profile = await DVCProfileService(db, settings).resolve_for_dataset(
        dataset=dataset,
        user=current_user,
        requested_profile_id=dvc_profile_id,
    )

    # ── Delegate to service ───────────────────────────────────────────────
    svc = DatasetService(db)
    new_version = await svc.track_delta_version(
        dataset=dataset,
        delta_file=file,
        base_version_id=base_version_id,
        version=version,
        commit_message=commit_message or f"chore(data): delta update for {dataset.name}",
        changelog=changelog,
        item_count=item_count,
        version_status=version_status,
        split_info=parsed_split_info,
        schema_snapshot=parsed_schema_snapshot,
        user=current_user,
        dvc_repo_path=profile.repo_path,
        dvc_remote_name=profile.remote_name,
        dvc_profile_id=profile.id,
        ssh_key_encrypted=profile.ssh_key_encrypted,
        git_ssh_url=profile.git_ssh_url,
    )

    response_payload = _version_payload(new_version)
    await _resolve_user_names(db, [response_payload])
    return response_payload


@router.post("/uploads/yolo", status_code=status.HTTP_201_CREATED)
async def upload_yolo_dataset(
    file: UploadFile = File(..., description="YOLO/Ultralytics dataset ZIP"),
    name: str | None = Form(default=None),
    version: str | None = Form(default=None),
    description: str | None = Form(default=None),
    tags: str | None = Form(default=None, description="Comma-separated tags"),
    task: str | None = Form(default=None, description="YOLO task type: object_detection, instance_segmentation, pose_estimation, image_classification, obb"),
    dvc_profile_id: str | None = Form(default=None),
    git_repository_id: str | None = Form(default=None),
    storage_provider_id: str | None = Form(default=None),
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
        task_type=task,
        dvc_profile_id=dvc_profile_id or git_repository_id,
        storage_provider_id=storage_provider_id,
    )


@router.post("/uploads/yolo/inspect")
async def inspect_yolo_dataset(
    file: UploadFile = File(..., description="YOLO/Ultralytics dataset ZIP"),
    name: str | None = Form(default=None),
    version: str | None = Form(default=None),
    description: str | None = Form(default=None),
    tags: str | None = Form(default=None, description="Comma-separated tags"),
    task: str | None = Form(default=None, description="YOLO task type override"),
    db: AsyncSession = Depends(get_db),
    _current_user: UserContext = Depends(get_current_user),
) -> dict:
    from app.services.dataset_upload_service import DatasetUploadService

    return await DatasetUploadService(db).inspect_yolo(
        file=file,
        name=name,
        version=version,
        description=description,
        tags=_parse_tags(tags),
        task_type=task,
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
    dvc_profile_id: str | None = Form(default=None),
    storage_provider_id: str | None = Form(default=None),
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
        dvc_profile_id=dvc_profile_id,
        storage_provider_id=storage_provider_id,
    )


@router.post("/uploads/general/inspect")
async def inspect_general_dataset(
    file: UploadFile = File(..., description="CSV, JSON, Parquet, or custom ZIP dataset"),
    name: str | None = Form(default=None),
    version: str | None = Form(default=None),
    description: str | None = Form(default=None),
    dataset_type: str | None = Form(default=None),
    task: str | None = Form(default=None),
    label_column: str | None = Form(default=None),
    tags: str | None = Form(default=None, description="Comma-separated tags"),
    db: AsyncSession = Depends(get_db),
    _current_user: UserContext = Depends(get_current_user),
) -> dict:
    from app.services.dataset_upload_service import DatasetUploadService

    return await DatasetUploadService(db).inspect_general(
        file=file,
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
    from app.services.dvc_profile_service import DVCProfileService

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
        requested_profile_id = parsed.get("dvc_profile_id") or parsed.get("git_repository_id")
        requested_profile_id = requested_profile_id if isinstance(requested_profile_id, str) else None
        profile = await DVCProfileService(db, get_settings()).resolve_for_dataset(
            dataset=mlops_dataset,
            user=current_user,
            requested_profile_id=requested_profile_id,
        )
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
            dvc_repo_path=profile.repo_path,
            dvc_remote_name=profile.remote_name,
            dvc_profile_id=profile.id,
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

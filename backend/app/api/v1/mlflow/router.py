"""Legacy-compatible MLflow tracking API for frontend experiment pages."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import UserContext, get_current_user, get_db
from app.models.mlops_tracking import ApprovalRequest, Experiment, ModelDatasetLink, ModelVersion, Run, RunLog

router = APIRouter(prefix="/mlflow", tags=["mlflow"])


def _object_from_storage_path(storage_path: str | None) -> tuple[str | None, str] | None:
    if not storage_path:
        return None
    if storage_path.startswith("s3://"):
        _, rest = storage_path.split("s3://", 1)
        bucket, _, object_name = rest.partition("/")
        return (bucket or None, object_name) if object_name else None
    normalized = storage_path.replace("\\", "/").lstrip("/")
    return (None, normalized) if normalized else None

async def _resolve_user_names(db: AsyncSession, items: list[dict], keys: list[str] | None = None) -> None:
    if keys is None:
        keys = ["user_id"]
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
    rows = (await db.execute(select(User.id, User.full_name, User.email).where(User.id.in_(list(user_ids))))).all()
    mapping = {str(r.id): r.full_name or r.email or "Unknown User" for r in rows}
    for item in items:
        for key in keys:
            val = item.get(key)
            if val and val in mapping:
                item[key] = mapping[val]


def _run_payload(row: Run) -> dict:
    metrics = [
        {"key": key, "value": value, "step": 0}
        for key, value in (row.metrics_snapshot or {}).items()
        if isinstance(value, (int, float))
    ]
    params = [
        {"key": key, "value": str(value)}
        for key, value in (row.params_snapshot or {}).items()
    ]
    return {
        "run_id": row.id,
        "experiment_id": row.experiment_id,
        "name": row.name,
        "status": row.status,
        "start_time": row.start_time.isoformat() if row.start_time else row.created_at.isoformat(),
        "end_time": row.end_time.isoformat() if row.end_time else None,
        "duration_ms": (
            int((row.end_time - row.start_time).total_seconds() * 1000)
            if row.start_time and row.end_time
            else None
        ),
        "artifact_uri": row.artifact_uri,
        "user_id": row.user_id,
        "tags": row.tags_snapshot or {},
        "params": params,
        "metrics": metrics,
        "dvc_dataset_version_id": row.dvc_dataset_version_id,
        "dvc_md5": row.dvc_md5,
        "source_type": row.source_type,
        "source_name": row.source_name,
        "git_commit": row.git_commit,
    }


def _model_version_payload(row: ModelVersion) -> dict:
    return {
        "id": row.id,
        "name": row.mlflow_name,
        "version": _model_display_version(row),
        "stage": row.stage,
        "source": row.source,
        "run_id": row.run_id,
        "description": row.description,
        "tags": row.tags or {},
        "metrics": row.metrics or {},
        "created_at": row.created_at.isoformat(),
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def _model_display_version(row: ModelVersion) -> str:
    return f"v{row.mlflow_version}"


async def _experiment_payload(db: AsyncSession, row: Experiment) -> dict:
    run_count = int(
        (
            await db.execute(
                select(func.count(Run.id)).where(Run.experiment_id == row.id)
            )
        ).scalar()
        or 0
    )
    latest_run = (
        await db.execute(
            select(Run)
            .where(Run.experiment_id == row.id)
            .order_by(Run.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    return {
        "experiment_id": row.id,
        "name": row.name,
        "lifecycle_stage": row.lifecycle_stage,
        "artifact_location": row.artifact_location,
        "created_at": row.created_at.isoformat(),
        "updated_at": row.updated_at.isoformat(),
        "tags": row.tags or {},
        "latest_run": _run_payload(latest_run) if latest_run else None,
        "run_count": run_count,
    }


@router.get("/experiments")
async def list_experiments(
    search: str | None = Query(default=None),
    lifecycle_stage: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: UserContext = Depends(get_current_user),
) -> dict:
    stmt = select(Experiment).where(Experiment.owner_id == current_user.user_id)
    count_stmt = select(func.count(Experiment.id)).where(Experiment.owner_id == current_user.user_id)
    if search:
        stmt = stmt.where(func.lower(Experiment.name).like(f"%{search.lower()}%"))
        count_stmt = count_stmt.where(func.lower(Experiment.name).like(f"%{search.lower()}%"))
    if lifecycle_stage:
        stmt = stmt.where(Experiment.lifecycle_stage == lifecycle_stage)
        count_stmt = count_stmt.where(Experiment.lifecycle_stage == lifecycle_stage)

    stmt = stmt.order_by(Experiment.updated_at.desc()).offset((page - 1) * limit).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    total = int((await db.execute(count_stmt)).scalar() or 0)
    return {
        "items": [await _experiment_payload(db, row) for row in rows],
        "total": total,
        "page": page,
        "pageSize": limit,
    }


@router.get("/experiments/{experiment_id}")
async def get_experiment(
    experiment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserContext = Depends(get_current_user),
) -> dict:
    row = await db.get(Experiment, experiment_id)
    if row is None or row.owner_id != current_user.user_id:
        return {}
    return await _experiment_payload(db, row)


@router.delete("/experiments/{experiment_id}")
async def delete_experiment(
    experiment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserContext = Depends(get_current_user),
) -> dict:
    from app.clients.minio_client import get_minio_client

    row = await db.get(Experiment, experiment_id)
    if row is None or row.owner_id != current_user.user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Experiment not found")

    runs = list(
        (
            await db.execute(select(Run).where(Run.experiment_id == row.id))
        ).scalars().all()
    )
    run_ids = [item.id for item in runs]
    model_versions = []
    if run_ids:
        model_versions = list(
            (
                await db.execute(select(ModelVersion).where(ModelVersion.run_id.in_(run_ids)))
            ).scalars().all()
        )
    model_version_ids = [item.id for item in model_versions]

    refs: set[tuple[str | None, str]] = set()
    ref = _object_from_storage_path(row.artifact_location)
    if ref:
        refs.add(ref)
    for run in runs:
        ref = _object_from_storage_path(run.artifact_uri)
        if ref:
            refs.add(ref)
    for version in model_versions:
        ref = _object_from_storage_path(version.source)
        if ref:
            refs.add(ref)

    minio = get_minio_client()
    deleted_objects = 0
    for bucket, object_name in refs:
        deleted_objects += await minio.delete_prefix(f"{object_name.rstrip('/')}/", bucket=bucket)
        if await minio.object_exists(object_name, bucket=bucket):
            await minio.delete_object(object_name, bucket=bucket)
            deleted_objects += 1

    if model_version_ids:
        await db.execute(delete(ApprovalRequest).where(ApprovalRequest.model_version_id.in_(model_version_ids)))
        await db.execute(delete(ModelDatasetLink).where(ModelDatasetLink.model_version_id.in_(model_version_ids)))
        await db.execute(delete(ModelVersion).where(ModelVersion.id.in_(model_version_ids)))
    if run_ids:
        await db.execute(delete(RunLog).where(RunLog.run_id.in_(run_ids)))
        await db.execute(delete(Run).where(Run.id.in_(run_ids)))

    await db.delete(row)
    await db.commit()
    return {
        "deleted": True,
        "experiment_id": experiment_id,
        "deleted_runs": len(run_ids),
        "deleted_model_versions": len(model_version_ids),
        "deleted_objects": deleted_objects,
    }


@router.get("/runs")
async def list_runs(
    experiment_id: str | None = Query(default=None),
    status: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=200, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: UserContext = Depends(get_current_user),
) -> dict:
    stmt = select(Run).where(Run.user_id == current_user.user_id)
    count_stmt = select(func.count(Run.id)).where(Run.user_id == current_user.user_id)
    if experiment_id:
        stmt = stmt.where(Run.experiment_id == experiment_id)
        count_stmt = count_stmt.where(Run.experiment_id == experiment_id)
    if status:
        stmt = stmt.where(Run.status == status)
        count_stmt = count_stmt.where(Run.status == status)

    stmt = stmt.order_by(Run.created_at.desc()).offset((page - 1) * limit).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    total = int((await db.execute(count_stmt)).scalar() or 0)
    payloads = [_run_payload(row) for row in rows]
    await _resolve_user_names(db, payloads)
    return {
        "items": payloads,
        "total": total,
        "page": page,
        "pageSize": limit,
    }


@router.get("/runs/{run_id}")
async def get_run(
    run_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserContext = Depends(get_current_user),
) -> dict:
    row = await db.get(Run, run_id)
    if row is None or row.user_id != current_user.user_id:
        return {}
    payload = _run_payload(row)
    await _resolve_user_names(db, [payload])
    return payload


@router.delete("/runs/{run_id}")
async def delete_run(
    run_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserContext = Depends(get_current_user),
) -> dict:
    row = await db.get(Run, run_id)
    if row is None or row.user_id != current_user.user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")

    model_version_ids = (
        await db.execute(select(ModelVersion.id).where(ModelVersion.run_id == run_id))
    ).scalars().all()
    if model_version_ids:
        await db.execute(
            delete(ApprovalRequest).where(ApprovalRequest.model_version_id.in_(model_version_ids))
        )
        await db.execute(
            delete(ModelDatasetLink).where(ModelDatasetLink.model_version_id.in_(model_version_ids))
        )
        await db.execute(delete(ModelVersion).where(ModelVersion.id.in_(model_version_ids)))

    await db.execute(delete(RunLog).where(RunLog.run_id == run_id))
    await db.delete(row)
    await db.commit()
    return {"deleted": True, "run_id": run_id}


@router.get("/model-versions")
async def list_model_versions(
    model_name: str | None = Query(default=None),
    stage: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=200, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    _current_user: UserContext = Depends(get_current_user),
) -> dict:
    stmt = select(ModelVersion)
    count_stmt = select(func.count(ModelVersion.id))
    if model_name:
        stmt = stmt.where(ModelVersion.mlflow_name == model_name)
        count_stmt = count_stmt.where(ModelVersion.mlflow_name == model_name)
    if stage:
        stmt = stmt.where(ModelVersion.stage == stage)
        count_stmt = count_stmt.where(ModelVersion.stage == stage)

    stmt = stmt.order_by(ModelVersion.mlflow_name.asc(), ModelVersion.mlflow_version.desc()).offset((page - 1) * limit).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    total = int((await db.execute(count_stmt)).scalar() or 0)
    return {
        "items": [_model_version_payload(row) for row in rows],
        "total": total,
        "page": page,
        "pageSize": limit,
    }

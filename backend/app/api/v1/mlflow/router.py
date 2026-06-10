"""Legacy-compatible MLflow tracking API for frontend experiment pages."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import UserContext, get_current_user, get_db
from app.models.mlops_tracking import Experiment, ModelVersion, Run

router = APIRouter(prefix="/mlflow", tags=["mlflow"])


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
        "version": f"v{row.mlflow_version}",
        "stage": row.stage,
        "source": row.source,
        "run_id": row.run_id,
        "description": row.description,
        "tags": row.tags or {},
        "metrics": row.metrics or {},
        "created_at": row.created_at.isoformat(),
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


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
    return {
        "items": [_run_payload(row) for row in rows],
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
    return _run_payload(row)


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

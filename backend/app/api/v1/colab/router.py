"""Colab integration endpoints."""

from __future__ import annotations

from datetime import datetime, timedelta
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from minio import Minio
from minio.error import S3Error
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.logging import audit_event, get_logger
from app.dependencies import UserContext, get_current_user, get_db, get_redis
from app.models.dataset import Dataset
from app.models.mlops_tracking import Experiment, ModelVersion, Run, RunLog
from app.models.model_registry import ModelRegistry
from app.repositories.workspace_repository import WorkspaceRepository
from app.schemas.colab import (
    ColabAssetsResponse,
    ColabBootstrapResponse,
    ColabClaimExchangeRequest,
    ColabClaimResponse,
    ColabDatasetPayload,
    ColabModelPayload,
    RuntimeHeartbeatResponse,
    RuntimeLogRequest,
    RuntimeRunAssetRequest,
    RuntimeModelVersionRequest,
    RuntimeModelVersionResponse,
    RuntimeRunCreateRequest,
    RuntimeRunFinishRequest,
    RuntimeRunResponse,
    RuntimeSessionResponse,
    RuntimeValuesRequest,
    WorkspaceSessionDashboardResponse,
    ArtifactUploadGrantRequest,
    ArtifactUploadGrantResponse,
)
from app.services.colab_claim_service import ColabClaimService
from app.services.runtime_session_service import RuntimeIdentity, RuntimeSessionService

router = APIRouter(prefix="/colab", tags=["colab"])
logger = get_logger(__name__)


def _minio_client(public: bool = False) -> Minio:
    settings = get_settings()
    return Minio(
        endpoint=settings.MINIO_PUBLIC_ENDPOINT if public else settings.MINIO_ENDPOINT,
        access_key=settings.MINIO_ACCESS_KEY,
        secret_key=settings.MINIO_SECRET_KEY,
        secure=settings.MINIO_PUBLIC_SECURE if public else False,
        region="us-east-1",
    )


def _storage_location(storage_path: str, default_bucket: str) -> tuple[str, str]:
    value = storage_path.strip()
    if value.startswith("s3://"):
        bucket, _, object_name = value.removeprefix("s3://").partition("/")
        return bucket or default_bucket, object_name.lstrip("/")
    return default_bucket, value.lstrip("/")


def _presigned_existing_object(
    internal_client: Minio,
    public_client: Minio,
    bucket: str,
    object_name: str,
    expires: timedelta,
) -> str | None:
    try:
        internal_client.stat_object(bucket, object_name)
    except S3Error as exc:
        if exc.code in {"NoSuchBucket", "NoSuchKey"}:
            return None
        raise
    return public_client.presigned_get_object(bucket, object_name, expires=expires)


async def _workspace_assets_payload(
    db: AsyncSession,
    workspace_id: str,
    user_id: str,
) -> ColabAssetsResponse:
    workspace = await WorkspaceRepository.get_by_id_and_user(db, workspace_id, user_id)
    if workspace is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")

    dataset_ids = list(workspace.dataset_ids or [])
    model_ids = list(workspace.model_ids or [])
    settings = get_settings()
    expires_seconds = max(60, settings.COLAB_DATA_URL_EXPIRE_SECONDS)
    expires = timedelta(seconds=expires_seconds)
    internal_client = _minio_client()
    public_client: Minio | None = None
    datasets: list[ColabDatasetPayload] = []
    models: list[ColabModelPayload] = []

    if dataset_ids:
        dataset_rows = (
            await db.execute(
                select(Dataset).where(Dataset.id.in_(dataset_ids))
            )
        ).scalars().all()
        public_client = _minio_client(public=True)
        for row in dataset_rows:
            if not row.storage_path:
                continue
            bucket, object_name = _storage_location(row.storage_path, settings.MINIO_BUCKET)
            signed_url = _presigned_existing_object(
                internal_client,
                public_client,
                bucket,
                object_name,
                expires,
            )
            datasets.append(ColabDatasetPayload(dataset_id=row.id, name=row.name, signed_url=signed_url))

    if model_ids:
        model_rows = (
            await db.execute(
                select(ModelRegistry).where(ModelRegistry.id.in_(model_ids))
            )
        ).scalars().all()
        if public_client is None:
            public_client = _minio_client(public=True)
        for row in model_rows:
            signed_url = None
            if row.storage_path:
                bucket, object_name = _storage_location(row.storage_path, settings.MINIO_BUCKET)
                signed_url = _presigned_existing_object(
                    internal_client,
                    public_client,
                    bucket,
                    object_name,
                    expires,
                )
            models.append(
                ColabModelPayload(
                    model_id=row.id,
                    name=row.name,
                    version=row.version,
                    framework=row.framework,
                    task_type=row.task_type,
                    signed_url=signed_url,
                )
            )

    return ColabAssetsResponse(datasets=datasets, models=models)


@router.post("/workspaces/{workspace_id}/claims", response_model=ColabClaimResponse)
async def create_colab_claim(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
    current_user: UserContext = Depends(get_current_user),
) -> ColabClaimResponse:
    settings = get_settings()

    workspace = await WorkspaceRepository.get_by_id_and_user(db, workspace_id, current_user.user_id)
    if workspace is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")

    runtime_session = await RuntimeSessionService.create(db, workspace.id, current_user.user_id)
    await db.commit()

    expires_in = min(120, max(60, settings.COLAB_CLAIM_EXPIRE_SECONDS))
    claim_code = await ColabClaimService.create(
        redis,
        session_id=runtime_session.id,
        workspace_id=workspace.id,
        user_id=current_user.user_id,
        expires_in=expires_in,
    )
    audit_event(
        logger,
        "colab.claim_created",
        user_id=current_user.user_id,
        workspace_id=workspace.id,
        session_id=runtime_session.id,
    )
    return ColabClaimResponse(
        claim_code=claim_code,
        notebook_url=settings.get_colab_notebook_url(),
        session_id=runtime_session.id,
        expires_in=expires_in,
    )


@router.post("/claims/exchange", response_model=ColabBootstrapResponse)
async def exchange_colab_claim(
    payload: ColabClaimExchangeRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
) -> ColabBootstrapResponse:
    claim = await ColabClaimService.consume(redis, payload.claim_code)
    if claim is None:
        audit_event(
            logger,
            "colab.claim_exchange_failed",
            reason="invalid_expired_or_used",
            client_ip=request.client.host if request.client else "unknown",
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid, expired, or used claim code")

    user_id = claim["user_id"]
    workspace_id = claim["workspace_id"]
    session_id = claim["session_id"]

    workspace = await WorkspaceRepository.get_by_id_and_user(db, workspace_id, user_id)
    if workspace is None:
        audit_event(logger, "colab.claim_exchange_failed", reason="workspace_not_found", session_id=session_id)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Claim is no longer valid")

    session = await RuntimeSessionService.get(db, session_id)
    if (
        session is None
        or session.workspace_id != workspace_id
        or session.user_id != user_id
        or session.status.value != "CREATED"
    ):
        audit_event(logger, "colab.claim_exchange_failed", reason="session_not_created", session_id=session_id)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Claim is no longer valid")

    runtime_session, runtime_token = await RuntimeSessionService.connect(db, session_id, user_id)
    audit_event(
        logger,
        "colab.claim_exchanged",
        user_id=user_id,
        workspace_id=workspace_id,
        session_id=runtime_session.id,
    )

    assets = await _workspace_assets_payload(db, workspace_id, user_id)

    return ColabBootstrapResponse(
        session_id=runtime_session.id,
        runtime_token=runtime_token,
        capabilities=runtime_session.capabilities,
        expires_at=runtime_session.expires_at,
        datasets=assets.datasets,
        models=assets.models,
    )


async def _runtime_identity(
    authorization: str = Header(default=""),
    db: AsyncSession = Depends(get_db),
) -> RuntimeIdentity:
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing runtime token")
    return await RuntimeSessionService.authenticate(db, token)


def _require_capability(identity: RuntimeIdentity, capability: str) -> None:
    if capability not in identity.session.capabilities:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Missing capability: {capability}")


async def _owned_run(db: AsyncSession, run_id: str, identity: RuntimeIdentity) -> Run:
    result = await db.execute(
        select(Run).where(
            Run.id == run_id,
            Run.user_id == identity.user_id,
            Run.workspace_id == identity.session.workspace_id,
            Run.runtime_session_id == identity.session.id,
        )
    )
    run = result.scalar_one_or_none()
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")
    return run


async def _runtime_experiment(db: AsyncSession, identity: RuntimeIdentity) -> Experiment:
    name = f"Colab workspace {identity.session.workspace_id}"
    result = await db.execute(
        select(Experiment).where(Experiment.owner_id == identity.user_id, Experiment.name == name)
    )
    experiment = result.scalar_one_or_none()
    if experiment is not None:
        return experiment

    next_mlflow_id = (
        await db.execute(select(func.coalesce(func.max(Experiment.mlflow_experiment_id), 0) + 1))
    ).scalar_one()
    experiment = Experiment(
        mlflow_experiment_id=int(next_mlflow_id),
        name=name,
        description="Runs reported by a NeuralSpace Google Colab runtime",
        owner_id=identity.user_id,
        tags={"workspace_id": identity.session.workspace_id, "provider": "google_colab"},
        lifecycle_stage="active",
    )
    db.add(experiment)
    await db.flush()
    return experiment


def _runtime_asset_payload(payload: RuntimeRunAssetRequest) -> dict[str, str]:
    return {
        "asset_type": payload.asset_type,
        "asset_id": payload.asset_id,
        "role": payload.role,
    }


def _append_runtime_asset(run: Run, direction: str, payload: RuntimeRunAssetRequest) -> dict:
    tags = dict(run.tags_snapshot or {})
    lineage = dict(tags.get("colab_lineage") or {})
    assets = list(lineage.get(direction) or [])
    asset = _runtime_asset_payload(payload)
    if asset not in assets:
        assets.append(asset)
    lineage[direction] = assets
    tags["colab_lineage"] = lineage
    run.tags_snapshot = tags
    return asset


def _runtime_run_status(value: str) -> str:
    normalized = value.strip().upper()
    if normalized == "SUCCESS":
        return "FINISHED"
    if normalized in {"FINISHED", "FAILED", "KILLED", "RUNNING"}:
        return normalized
    return "FAILED"


def _session_response(identity: RuntimeIdentity) -> RuntimeSessionResponse:
    session = identity.session
    return RuntimeSessionResponse(
        session_id=session.id,
        workspace_id=session.workspace_id,
        provider=session.provider,
        status=session.status.value,
        capabilities=session.capabilities,
        connected_at=session.connected_at,
        last_heartbeat_at=session.last_heartbeat_at,
        expires_at=session.expires_at,
    )


@router.get("/runtime/session", response_model=RuntimeSessionResponse)
async def get_runtime_session(identity: RuntimeIdentity = Depends(_runtime_identity)) -> RuntimeSessionResponse:
    return _session_response(identity)


@router.get("/runtime/assets", response_model=ColabAssetsResponse)
async def get_runtime_assets(
    identity: RuntimeIdentity = Depends(_runtime_identity),
    db: AsyncSession = Depends(get_db),
) -> ColabAssetsResponse:
    _require_capability(identity, "dataset:read")
    return await _workspace_assets_payload(db, identity.session.workspace_id, identity.user_id)


@router.post("/runtime/heartbeat", response_model=RuntimeHeartbeatResponse)
async def heartbeat_runtime(
    identity: RuntimeIdentity = Depends(_runtime_identity),
    db: AsyncSession = Depends(get_db),
) -> RuntimeHeartbeatResponse:
    _require_capability(identity, "heartbeat:write")
    session = await RuntimeSessionService.heartbeat(db, identity.session)
    return RuntimeHeartbeatResponse(
        session_id=session.id,
        status=session.status.value,
        expires_at=session.expires_at,
    )


@router.post("/runtime/runs", response_model=RuntimeRunResponse, status_code=status.HTTP_201_CREATED)
async def create_runtime_run(
    payload: RuntimeRunCreateRequest,
    identity: RuntimeIdentity = Depends(_runtime_identity),
    db: AsyncSession = Depends(get_db),
) -> RuntimeRunResponse:
    _require_capability(identity, "run:write")
    now = datetime.utcnow()
    experiment = await _runtime_experiment(db, identity)
    run = Run(
        mlflow_run_id=uuid4().hex,
        experiment_id=experiment.id,
        workspace_id=identity.session.workspace_id,
        runtime_session_id=identity.session.id,
        name=payload.name,
        status="RUNNING",
        start_time=now,
        source_type="NOTEBOOK",
        source_name="neuralspace-colab",
        user_id=identity.user_id,
        metrics_snapshot={},
        params_snapshot={},
        tags_snapshot={"runtime_session_id": identity.session.id},
    )
    db.add(run)
    for item in payload.inputs:
        _append_runtime_asset(run, "inputs", item)
    for item in payload.outputs:
        _append_runtime_asset(run, "outputs", item)
    await db.commit()
    await db.refresh(run)
    audit_event(
        logger,
        "colab.run_created",
        user_id=identity.user_id,
        workspace_id=identity.session.workspace_id,
        session_id=identity.session.id,
        run_id=run.id,
    )
    return RuntimeRunResponse(run_id=run.id, status=run.status, started_at=run.start_time or now)


@router.patch("/runtime/runs/{run_id}")
async def finish_runtime_run(
    run_id: str,
    payload: RuntimeRunFinishRequest,
    identity: RuntimeIdentity = Depends(_runtime_identity),
    db: AsyncSession = Depends(get_db),
):
    _require_capability(identity, "run:write")
    run = await _owned_run(db, run_id, identity)
    run.status = _runtime_run_status(payload.status)
    if run.status in {"FINISHED", "FAILED", "KILLED"} and run.end_time is None:
        run.end_time = datetime.utcnow()
    await db.commit()
    return {"run_id": run.id, "status": run.status, "ended_at": run.end_time}


@router.post("/runtime/runs/{run_id}/inputs", status_code=status.HTTP_201_CREATED)
async def log_runtime_input(
    run_id: str,
    payload: RuntimeRunAssetRequest,
    identity: RuntimeIdentity = Depends(_runtime_identity),
    db: AsyncSession = Depends(get_db),
):
    _require_capability(identity, "run:write")
    run = await _owned_run(db, run_id, identity)
    asset = _append_runtime_asset(run, "inputs", payload)
    await db.commit()
    return {"run_id": run.id, "input": asset, "lineage": (run.tags_snapshot or {}).get("colab_lineage", {})}


@router.post("/runtime/runs/{run_id}/outputs", status_code=status.HTTP_201_CREATED)
async def log_runtime_output(
    run_id: str,
    payload: RuntimeRunAssetRequest,
    identity: RuntimeIdentity = Depends(_runtime_identity),
    db: AsyncSession = Depends(get_db),
):
    _require_capability(identity, "run:write")
    run = await _owned_run(db, run_id, identity)
    asset = _append_runtime_asset(run, "outputs", payload)
    await db.commit()
    return {"run_id": run.id, "output": asset, "lineage": (run.tags_snapshot or {}).get("colab_lineage", {})}


@router.post("/runtime/runs/{run_id}/metrics")
async def log_runtime_metrics(
    run_id: str,
    payload: RuntimeValuesRequest,
    identity: RuntimeIdentity = Depends(_runtime_identity),
    db: AsyncSession = Depends(get_db),
):
    _require_capability(identity, "run:write")
    run = await _owned_run(db, run_id, identity)
    run.metrics_snapshot = {**(run.metrics_snapshot or {}), **payload.values}
    await db.commit()
    return {"run_id": run.id, "metrics": run.metrics_snapshot}


@router.post("/runtime/runs/{run_id}/params")
async def log_runtime_params(
    run_id: str,
    payload: RuntimeValuesRequest,
    identity: RuntimeIdentity = Depends(_runtime_identity),
    db: AsyncSession = Depends(get_db),
):
    _require_capability(identity, "run:write")
    run = await _owned_run(db, run_id, identity)
    run.params_snapshot = {**(run.params_snapshot or {}), **payload.values}
    await db.commit()
    return {"run_id": run.id, "params": run.params_snapshot}


@router.post("/runtime/runs/{run_id}/logs", status_code=status.HTTP_201_CREATED)
async def log_runtime_message(
    run_id: str,
    payload: RuntimeLogRequest,
    identity: RuntimeIdentity = Depends(_runtime_identity),
    db: AsyncSession = Depends(get_db),
):
    _require_capability(identity, "run:write")
    run = await _owned_run(db, run_id, identity)
    log = RunLog(
        run_id=run.id,
        runtime_session_id=identity.session.id,
        level=payload.level,
        message=payload.message,
    )
    db.add(log)
    await db.commit()
    await db.refresh(log)
    return {
        "run_id": run.id,
        "level": log.level,
        "message": log.message,
        "timestamp": log.created_at,
    }


@router.post("/runtime/artifacts/upload-grant", response_model=ArtifactUploadGrantResponse)
async def create_artifact_upload_grant(
    payload: ArtifactUploadGrantRequest,
    identity: RuntimeIdentity = Depends(_runtime_identity),
    db: AsyncSession = Depends(get_db),
) -> ArtifactUploadGrantResponse:
    _require_capability(identity, "artifact:write")
    await _owned_run(db, payload.run_id, identity)
    safe_filename = payload.filename.replace("\\", "/").split("/")[-1]
    object_path = f"runs/{payload.run_id}/{identity.session.id}/{safe_filename}"
    expires_in = max(60, get_settings().COLAB_DATA_URL_EXPIRE_SECONDS)
    upload_url = _minio_client(public=True).presigned_put_object(
        get_settings().MLFLOW_ARTIFACT_BUCKET,
        object_path,
        expires=timedelta(seconds=expires_in),
    )
    return ArtifactUploadGrantResponse(
        object_path=object_path,
        upload_url=upload_url,
        expires_in=expires_in,
    )


@router.post("/runtime/model-versions", response_model=RuntimeModelVersionResponse)
async def register_runtime_model_version(
    payload: RuntimeModelVersionRequest,
    identity: RuntimeIdentity = Depends(_runtime_identity),
    db: AsyncSession = Depends(get_db),
) -> RuntimeModelVersionResponse:
    _require_capability(identity, "model_version:create")
    run = await _owned_run(db, payload.run_id, identity)
    next_version = (
        await db.execute(
            select(func.coalesce(func.max(ModelVersion.mlflow_version), 0) + 1).where(
                ModelVersion.mlflow_name == payload.name
            )
        )
    ).scalar_one()
    model_version = ModelVersion(
        mlflow_name=payload.name,
        mlflow_version=int(next_version),
        run_id=run.id,
        source=payload.artifact_path,
        framework=payload.framework,
        task_type=payload.task_type,
        metrics=payload.metrics,
        status="READY",
        created_by=identity.user_id,
    )
    db.add(model_version)
    await db.flush()
    _append_runtime_asset(
        run,
        "outputs",
        RuntimeRunAssetRequest(
            asset_type="model",
            asset_id=model_version.id,
            role="trained_model",
        ),
    )
    await db.commit()
    await db.refresh(model_version)
    return RuntimeModelVersionResponse(
        model_version_id=model_version.id,
        name=model_version.mlflow_name,
        version=model_version.mlflow_version,
        status=model_version.status,
    )


@router.post("/sessions/{session_id}/revoke", response_model=RuntimeSessionResponse)
async def revoke_runtime_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserContext = Depends(get_current_user),
) -> RuntimeSessionResponse:
    session = await RuntimeSessionService.get(db, session_id)
    if session is None or session.user_id != current_user.user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Runtime session not found")
    session = await RuntimeSessionService.revoke(db, session)
    audit_event(
        logger,
        "colab.session_revoked",
        user_id=current_user.user_id,
        workspace_id=session.workspace_id,
        session_id=session.id,
    )
    return _session_response(RuntimeIdentity(session=session, user_id=current_user.user_id))


@router.get("/workspaces/{workspace_id}/session", response_model=WorkspaceSessionDashboardResponse)
async def get_latest_workspace_session(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserContext = Depends(get_current_user),
) -> WorkspaceSessionDashboardResponse:
    workspace = await WorkspaceRepository.get_by_id_and_user(db, workspace_id, current_user.user_id)
    if workspace is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")

    sessions = await RuntimeSessionService.list_for_workspace(db, workspace_id, current_user.user_id)
    if not sessions:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Runtime session not found")

    session = sessions[0]
    run = (
        await db.execute(
            select(Run)
            .where(
                Run.runtime_session_id == session.id,
                Run.workspace_id == workspace_id,
                Run.user_id == current_user.user_id,
            )
            .order_by(Run.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if run is None:
        return WorkspaceSessionDashboardResponse(
            session_status=session.status.value,
            session_last_seen=session.last_heartbeat_at or session.connected_at or session.created_at,
        )

    run_logs = list(
        (
            await db.execute(
                select(RunLog)
                .where(RunLog.run_id == run.id, RunLog.runtime_session_id == session.id)
                .order_by(RunLog.created_at.asc())
                .limit(200)
            )
        ).scalars().all()
    )
    report_time = run_logs[-1].created_at if run_logs else session.last_heartbeat_at or run.created_at
    metrics = [
        {"key": key, "value": value, "step": 0, "timestamp": report_time}
        for key, value in (run.metrics_snapshot or {}).items()
        if isinstance(value, (int, float))
    ]
    return WorkspaceSessionDashboardResponse(
        session_status=session.status.value,
        session_last_seen=session.last_heartbeat_at or session.connected_at or session.created_at,
        run_id=run.id,
        run_status=run.status,
        run_started_at=run.start_time,
        run_last_reported=report_time,
        metrics=metrics,
        logs=[
            {"level": item.level, "message": item.message, "timestamp": item.created_at}
            for item in run_logs
        ],
    )


@router.get("/workspaces/{workspace_id}/sessions", response_model=list[RuntimeSessionResponse])
async def list_runtime_sessions(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserContext = Depends(get_current_user),
) -> list[RuntimeSessionResponse]:
    workspace = await WorkspaceRepository.get_by_id_and_user(db, workspace_id, current_user.user_id)
    if workspace is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    sessions = await RuntimeSessionService.list_for_workspace(db, workspace_id, current_user.user_id)
    return [
        _session_response(RuntimeIdentity(session=session, user_id=current_user.user_id))
        for session in sessions
    ]

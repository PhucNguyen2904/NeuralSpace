"""Colab integration endpoints."""

from __future__ import annotations

from datetime import timedelta
from urllib.parse import quote, urlparse
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, status
from minio import Minio
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.security import create_access_token, verify_token
from app.dependencies import UserContext, get_current_user, get_db, get_redis
from app.models.dataset import Dataset
from app.models.mlops_tracking import ModelVersion, Run
from app.repositories.workspace_repository import WorkspaceRepository
from app.schemas.colab import (
    ColabBootstrapRequest,
    ColabBootstrapResponse,
    ColabDatasetPayload,
    ColabLaunchResponse,
    RuntimeHeartbeatResponse,
    RuntimeModelVersionRequest,
    RuntimeModelVersionResponse,
    RuntimeSessionResponse,
    RuntimeValuesRequest,
    WorkspaceSessionDashboardResponse,
    ArtifactUploadGrantRequest,
    ArtifactUploadGrantResponse,
)
from app.services.runtime_session_service import RuntimeIdentity, RuntimeSessionService

router = APIRouter(prefix="/colab", tags=["colab"])


def _minio_client(public: bool = False) -> Minio:
    settings = get_settings()
    return Minio(
        endpoint=settings.MINIO_PUBLIC_ENDPOINT if public else settings.MINIO_ENDPOINT,
        access_key=settings.MINIO_ACCESS_KEY,
        secret_key=settings.MINIO_SECRET_KEY,
        secure=settings.MINIO_PUBLIC_SECURE if public else False,
    )


@router.post("/workspaces/{workspace_id}/launch", response_model=ColabLaunchResponse)
async def launch_colab(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
    current_user: UserContext = Depends(get_current_user),
) -> ColabLaunchResponse:
    settings = get_settings()
    if not settings.COLAB_NOTEBOOK_GITHUB_URL:
        raise HTTPException(status_code=503, detail="Colab notebook template is not configured")

    workspace = await WorkspaceRepository.get_by_id_and_user(db, workspace_id, current_user.user_id)
    if workspace is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")

    runtime_session = await RuntimeSessionService.create(db, workspace.id, current_user.user_id)
    await db.commit()

    ttl_minutes = max(1, settings.COLAB_LAUNCH_TOKEN_EXPIRE_MINUTES)
    token_id = uuid4().hex
    token = create_access_token(
        {
            "type": "colab_launch",
            "jti": token_id,
            "sub": current_user.user_id,
            "workspace_id": workspace.id,
            "session_id": runtime_session.id,
        },
        expires_delta=timedelta(minutes=ttl_minutes),
    )
    await redis.set(f"colab:launch:{token_id}", "1", ex=ttl_minutes * 60)

    raw_template = settings.COLAB_NOTEBOOK_GITHUB_URL.strip()
    if raw_template.startswith("https://github.com/"):
        parsed = urlparse(raw_template)
        raw_template = parsed.path.lstrip("/")
    template = quote(raw_template, safe="/")
    launch_url = (
        "https://colab.research.google.com/github/"
        f"{template}?launch_token={quote(token, safe='')}"
        f"&api_base_url={quote(settings.PUBLIC_API_BASE_URL.rstrip('/'), safe='')}"
    )
    return ColabLaunchResponse(
        launch_url=launch_url,
        session_id=runtime_session.id,
        expires_in=ttl_minutes * 60,
    )


@router.post("/bootstrap", response_model=ColabBootstrapResponse)
async def bootstrap_colab(
    payload: ColabBootstrapRequest,
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
) -> ColabBootstrapResponse:
    try:
        claims = verify_token(payload.token)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired launch token") from exc

    if claims.get("type") != "colab_launch":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid launch token type")

    token_id = str(claims.get("jti") or "")
    user_id = str(claims.get("sub") or "")
    workspace_id = str(claims.get("workspace_id") or "")
    session_id = str(claims.get("session_id") or "")
    if not token_id or not user_id or not workspace_id or not session_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Malformed launch token")

    one_time_key = f"colab:launch:{token_id}"
    exists = await redis.getdel(one_time_key)
    if not exists:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Launch token already used or expired")

    workspace = await WorkspaceRepository.get_by_id_and_user(db, workspace_id, user_id)
    if workspace is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")

    runtime_session, runtime_token = await RuntimeSessionService.connect(db, session_id, user_id)

    dataset_ids = list(workspace.dataset_ids or [])
    if not dataset_ids:
        return ColabBootstrapResponse(
            session_id=runtime_session.id,
            workspace_id=workspace_id,
            user_id=user_id,
            runtime_token=runtime_token,
            capabilities=runtime_session.capabilities,
            expires_at=runtime_session.expires_at,
            datasets=[],
        )

    stmt = select(Dataset).where(Dataset.id.in_(dataset_ids))
    rows = (await db.execute(stmt)).scalars().all()
    signed_items: list[ColabDatasetPayload] = []
    if rows:
        client = _minio_client(public=True)
        settings = get_settings()
        expires_seconds = max(60, settings.COLAB_DATA_URL_EXPIRE_SECONDS)
        for row in rows:
            if not row.storage_path:
                continue
            signed_url = client.presigned_get_object(
                settings.MINIO_BUCKET,
                row.storage_path,
                expires=timedelta(seconds=expires_seconds),
            )
            signed_items.append(
                ColabDatasetPayload(
                    dataset_id=row.id,
                    name=row.name,
                    signed_url=signed_url,
                )
            )

    return ColabBootstrapResponse(
        session_id=runtime_session.id,
        workspace_id=workspace_id,
        user_id=user_id,
        runtime_token=runtime_token,
        capabilities=runtime_session.capabilities,
        expires_at=runtime_session.expires_at,
        datasets=signed_items,
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


async def _owned_run(db: AsyncSession, run_id: str, user_id: str) -> Run:
    result = await db.execute(select(Run).where(Run.id == run_id, Run.user_id == user_id))
    run = result.scalar_one_or_none()
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")
    return run


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


def _dashboard_session_status(session_status: str) -> str:
    if session_status == "CREATED":
        return "ISSUED"
    return session_status


@router.get("/runtime/session", response_model=RuntimeSessionResponse)
async def get_runtime_session(identity: RuntimeIdentity = Depends(_runtime_identity)) -> RuntimeSessionResponse:
    return _session_response(identity)


@router.post("/runtime/heartbeat", response_model=RuntimeHeartbeatResponse)
async def heartbeat_runtime(
    identity: RuntimeIdentity = Depends(_runtime_identity),
    db: AsyncSession = Depends(get_db),
) -> RuntimeHeartbeatResponse:
    session = await RuntimeSessionService.heartbeat(db, identity.session)
    return RuntimeHeartbeatResponse(
        session_id=session.id,
        status=session.status.value,
        expires_at=session.expires_at,
    )


@router.post("/runtime/runs/{run_id}/metrics")
async def log_runtime_metrics(
    run_id: str,
    payload: RuntimeValuesRequest,
    identity: RuntimeIdentity = Depends(_runtime_identity),
    db: AsyncSession = Depends(get_db),
):
    _require_capability(identity, "run:write")
    run = await _owned_run(db, run_id, identity.user_id)
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
    run = await _owned_run(db, run_id, identity.user_id)
    run.params_snapshot = {**(run.params_snapshot or {}), **payload.values}
    await db.commit()
    return {"run_id": run.id, "params": run.params_snapshot}


@router.post("/runtime/artifacts/upload-grant", response_model=ArtifactUploadGrantResponse)
async def create_artifact_upload_grant(
    payload: ArtifactUploadGrantRequest,
    identity: RuntimeIdentity = Depends(_runtime_identity),
    db: AsyncSession = Depends(get_db),
) -> ArtifactUploadGrantResponse:
    _require_capability(identity, "artifact:write")
    await _owned_run(db, payload.run_id, identity.user_id)
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
    run = await _owned_run(db, payload.run_id, identity.user_id)
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
    return WorkspaceSessionDashboardResponse(
        session_status=_dashboard_session_status(session.status.value),
        session_last_seen=session.last_heartbeat_at or session.connected_at or session.created_at,
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

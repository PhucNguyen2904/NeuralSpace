"""Colab integration endpoints."""

from __future__ import annotations

from datetime import timedelta
from urllib.parse import quote, urlparse
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from minio import Minio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.security import create_access_token, verify_token
from app.dependencies import UserContext, get_current_user, get_db, get_redis
from app.models.dataset import Dataset
from app.repositories.workspace_repository import WorkspaceRepository
from app.schemas.colab import (
    ColabBootstrapRequest,
    ColabBootstrapResponse,
    ColabDatasetPayload,
    ColabLaunchResponse,
)

router = APIRouter(prefix="/colab", tags=["colab"])


def _minio_client() -> Minio:
    settings = get_settings()
    return Minio(
        endpoint=settings.MINIO_ENDPOINT,
        access_key=settings.MINIO_ACCESS_KEY,
        secret_key=settings.MINIO_SECRET_KEY,
        secure=False,
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

    ttl_minutes = max(1, settings.COLAB_LAUNCH_TOKEN_EXPIRE_MINUTES)
    token_id = uuid4().hex
    token = create_access_token(
        {
            "type": "colab_launch",
            "jti": token_id,
            "sub": current_user.user_id,
            "workspace_id": workspace.id,
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
    )
    return ColabLaunchResponse(launch_url=launch_url, expires_in=ttl_minutes * 60)


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
    if not token_id or not user_id or not workspace_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Malformed launch token")

    one_time_key = f"colab:launch:{token_id}"
    exists = await redis.get(one_time_key)
    if not exists:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Launch token already used or expired")
    await redis.delete(one_time_key)

    workspace = await WorkspaceRepository.get_by_id_and_user(db, workspace_id, user_id)
    if workspace is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")

    dataset_ids = list(workspace.dataset_ids or [])
    if not dataset_ids:
        return ColabBootstrapResponse(workspace_id=workspace_id, user_id=user_id, datasets=[])

    stmt = select(Dataset).where(Dataset.id.in_(dataset_ids), Dataset.created_by == user_id)
    rows = (await db.execute(stmt)).scalars().all()
    signed_items: list[ColabDatasetPayload] = []
    if rows:
        client = _minio_client()
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
        workspace_id=workspace_id,
        user_id=user_id,
        datasets=signed_items,
    )

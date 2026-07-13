"""
Storage API Router — CRUD + File operations + DVC integration.

Prefix: /api/v1/storage (configured in main router)
"""

from __future__ import annotations

import tempfile
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import UserContext, get_current_user, get_db
from app.schemas.storage import (
    StorageConnectionResponse,
    StorageConnectRequest,
    StorageMkdirRequest,
    StoragePatchRequest,
    StorageSyncRequest,
    StorageQuotaResponse,
    SyncJobResponse,
    DVCConfigureRequest,
    DVCOperationRequest,
)
from app.services.storage_service import StorageService

router = APIRouter(tags=["storage"])


def get_storage_service(db: AsyncSession = Depends(get_db)) -> StorageService:
    return StorageService(db)


# ── Connection Management ─────────────────────────────────────────────────────

@router.post(
    "/connect",
    response_model=StorageConnectionResponse,
    status_code=201,
    summary="Kết nối Storage (key-based: S3/MinIO/R2)",
)
async def connect_storage(
    request_body: StorageConnectRequest,
    request: Request,
    current_user: UserContext = Depends(get_current_user),
    service: StorageService = Depends(get_storage_service),
) -> StorageConnectionResponse:
    """Kết nối storage provider dùng Access Key (S3, MinIO, R2)."""
    connection = await service.connect(
        user_id=str(current_user.user_id),
        request=request_body,
        ip_address=request.client.host if request.client else None,
    )
    return StorageConnectionResponse.model_validate(connection)


@router.get(
    "/list",
    response_model=list[StorageConnectionResponse],
    summary="Liệt kê storage connections",
)
async def list_connections(
    current_user: UserContext = Depends(get_current_user),
    service: StorageService = Depends(get_storage_service),
) -> list[StorageConnectionResponse]:
    connections = await service.list_connections(str(current_user.user_id))
    return [StorageConnectionResponse.model_validate(c) for c in connections]


@router.get(
    "/{connection_id}",
    response_model=StorageConnectionResponse,
    summary="Chi tiết một connection",
)
async def get_connection(
    connection_id: str,
    current_user: UserContext = Depends(get_current_user),
    service: StorageService = Depends(get_storage_service),
) -> StorageConnectionResponse:
    connection = await service.get_connection(connection_id, str(current_user.user_id))
    return StorageConnectionResponse.model_validate(connection)


@router.patch(
    "/{connection_id}",
    response_model=StorageConnectionResponse,
    summary="Cập nhật connection metadata",
)
async def patch_connection(
    connection_id: str,
    request_body: StoragePatchRequest,
    current_user: UserContext = Depends(get_current_user),
    service: StorageService = Depends(get_storage_service),
) -> StorageConnectionResponse:
    connection = await service.patch_connection(
        connection_id, str(current_user.user_id), request_body
    )
    return StorageConnectionResponse.model_validate(connection)


@router.post(
    "/{connection_id}/disconnect",
    status_code=200,
    summary="Ngắt kết nối storage",
)
async def disconnect_storage(
    connection_id: str,
    request: Request,
    current_user: UserContext = Depends(get_current_user),
    service: StorageService = Depends(get_storage_service),
) -> dict:
    await service.disconnect(
        connection_id,
        str(current_user.user_id),
        ip_address=request.client.host if request.client else None,
    )
    return {"message": "Disconnected successfully"}


@router.post(
    "/{connection_id}/default",
    response_model=StorageConnectionResponse | dict,
    summary="Set connection làm default",
)
async def set_default_storage(
    connection_id: str,
    current_user: UserContext = Depends(get_current_user),
    service: StorageService = Depends(get_storage_service),
):
    result = await service.set_default(connection_id, str(current_user.user_id))
    if isinstance(result, dict):
        return result
    return StorageConnectionResponse.model_validate(result)


@router.post(
    "/{connection_id}/validate",
    response_model=StorageQuotaResponse,
    summary="Validate credential và lấy quota",
)
async def validate_connection(
    connection_id: str,
    current_user: UserContext = Depends(get_current_user),
    service: StorageService = Depends(get_storage_service),
) -> StorageQuotaResponse:
    result = await service.validate_connection(connection_id, str(current_user.user_id))
    from datetime import datetime, timezone
    return StorageQuotaResponse(
        valid=result["valid"],
        total=result.get("total"),
        used=result.get("used"),
        free=result.get("free"),
        validated_at=datetime.now(timezone.utc),
    )


# ── File Operations ───────────────────────────────────────────────────────────

@router.get(
    "/{connection_id}/files",
    summary="Liệt kê files trong remote storage",
)
async def list_files(
    connection_id: str,
    path: str = "",
    current_user: UserContext = Depends(get_current_user),
    service: StorageService = Depends(get_storage_service),
) -> list[dict]:
    return await service.list_files(connection_id, str(current_user.user_id), path)


@router.post(
    "/{connection_id}/mkdir",
    status_code=201,
    summary="Tạo thư mục",
)
async def make_directory(
    connection_id: str,
    request_body: StorageMkdirRequest,
    current_user: UserContext = Depends(get_current_user),
    service: StorageService = Depends(get_storage_service),
) -> dict:
    await service.mkdir(connection_id, str(current_user.user_id), request_body.path)
    return {"message": "Directory created", "path": request_body.path}


@router.delete(
    "/{connection_id}/files",
    summary="Xóa file hoặc thư mục",
)
async def delete_file(
    connection_id: str,
    path: str,
    is_dir: bool = False,
    current_user: UserContext = Depends(get_current_user),
    service: StorageService = Depends(get_storage_service),
) -> dict:
    await service.delete_file(connection_id, str(current_user.user_id), path, is_dir)
    return {"message": "Deleted successfully"}


@router.post(
    "/{connection_id}/sync",
    summary="Đồng bộ files",
)
async def sync_files(
    connection_id: str,
    request_body: StorageSyncRequest,
    current_user: UserContext = Depends(get_current_user),
    service: StorageService = Depends(get_storage_service),
) -> dict:
    await service.sync(
        connection_id,
        str(current_user.user_id),
        request_body.src_path,
        request_body.dest_path,
    )
    return {"message": "Sync completed"}


@router.post(
    "/{connection_id}/upload",
    status_code=201,
    summary="Upload file lên remote storage",
)
async def upload_file(
    connection_id: str,
    path: str = Form(..., description="Destination path bao gồm tên file"),
    file: UploadFile = File(...),
    current_user: UserContext = Depends(get_current_user),
    service: StorageService = Depends(get_storage_service),
) -> dict:
    import os

    with tempfile.NamedTemporaryFile(delete=False, suffix=f"_{file.filename}") as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        await service.upload(connection_id, str(current_user.user_id), path, tmp_path)
        return {"message": "Upload successful", "path": path, "size": len(content)}
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


@router.get(
    "/{connection_id}/download",
    summary="Download file từ remote storage",
)
async def download_file(
    connection_id: str,
    path: str,
    current_user: UserContext = Depends(get_current_user),
    service: StorageService = Depends(get_storage_service),
) -> Response:
    content = await service.download(connection_id, str(current_user.user_id), path)
    filename = path.split("/")[-1] or "download"
    return Response(
        content=content,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── DVC Integration ───────────────────────────────────────────────────────────

@router.post(
    "/{connection_id}/dvc/configure",
    summary="Cấu hình DVC remote trỏ vào storage connection",
)
async def configure_dvc_remote(
    connection_id: str,
    request_body: DVCConfigureRequest,
    current_user: UserContext = Depends(get_current_user),
    service: StorageService = Depends(get_storage_service),
) -> dict:
    result = await service.configure_dvc_remote(
        connection_id=connection_id,
        user_id=str(current_user.user_id),
        dvc_profile_id=request_body.dvc_profile_id,
        base_path=request_body.base_path,
        set_as_default=request_body.set_as_default,
    )
    return result


@router.post(
    "/{connection_id}/dvc/push",
    summary="DVC push lên user's cloud storage",
)
async def dvc_push(
    connection_id: str,
    request_body: DVCOperationRequest,
    current_user: UserContext = Depends(get_current_user),
    service: StorageService = Depends(get_storage_service),
) -> dict:
    """Push DVC-tracked data lên cloud storage của user."""
    from app.services.storage.dvc_adapter import DVCStorageAdapter, DVCStorageError
    from app.services.dvc_profile_service import DVCProfileService
    from app.config import get_settings
    from app.dependencies import UserContext as UC

    connection = await service.get_connection(connection_id, str(current_user.user_id))
    db = service.db

    dvc_service = DVCProfileService(db, get_settings())
    user_ctx = UC(user_id=str(current_user.user_id), email="", roles=[])
    profile = await dvc_service.resolve_for_dataset(
        dataset=None, user=user_ctx,  # type: ignore
        requested_profile_id=request_body.dvc_profile_id
    )

    adapter = DVCStorageAdapter()
    # Đảm bảo DVC remote được cấu hình
    await adapter.configure_dvc_remote(
        repo_path=profile.repo_path,
        connection=connection,
    )

    try:
        stdout, stderr = await adapter.push(
            repo_path=profile.repo_path,
            connection=connection,
            targets=request_body.targets,
            jobs=request_body.jobs,
        )
        return {"message": "DVC push completed", "output": stdout, "warnings": stderr}
    except DVCStorageError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/{connection_id}/dvc/pull",
    summary="DVC pull từ user's cloud storage",
)
async def dvc_pull(
    connection_id: str,
    request_body: DVCOperationRequest,
    current_user: UserContext = Depends(get_current_user),
    service: StorageService = Depends(get_storage_service),
) -> dict:
    from app.services.storage.dvc_adapter import DVCStorageAdapter, DVCStorageError
    from app.services.dvc_profile_service import DVCProfileService
    from app.config import get_settings
    from app.dependencies import UserContext as UC

    connection = await service.get_connection(connection_id, str(current_user.user_id))
    db = service.db

    dvc_service = DVCProfileService(db, get_settings())
    user_ctx = UC(user_id=str(current_user.user_id), email="", roles=[])
    profile = await dvc_service.resolve_for_dataset(
        dataset=None, user=user_ctx,  # type: ignore
        requested_profile_id=request_body.dvc_profile_id
    )

    adapter = DVCStorageAdapter()
    try:
        stdout, stderr = await adapter.pull(
            repo_path=profile.repo_path,
            connection=connection,
            targets=request_body.targets,
            jobs=request_body.jobs,
        )
        return {"message": "DVC pull completed", "output": stdout, "warnings": stderr}
    except DVCStorageError as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Sync Jobs ─────────────────────────────────────────────────────────────────

@router.get(
    "/jobs/{job_id}",
    response_model=SyncJobResponse,
    summary="Trạng thái sync job",
)
async def get_sync_job(
    job_id: str,
    current_user: UserContext = Depends(get_current_user),
    service: StorageService = Depends(get_storage_service),
) -> SyncJobResponse:
    return await service.get_sync_job(job_id, str(current_user.user_id))

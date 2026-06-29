"""Storage API routes."""

import tempfile
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, UserContext, get_db
from app.schemas.storage import (
    StorageConnectionResponse,
    StorageConnectRequest,
    StorageMkdirRequest,
    StorageSyncRequest,
)
from app.services.storage_service import StorageService

from app.api.v1.storage.oauth import router as oauth_router

router = APIRouter(tags=["storage"])
router.include_router(oauth_router)


def get_storage_service(db: AsyncSession = Depends(get_db)) -> StorageService:
    return StorageService(db)

@router.post("/connect", response_model=StorageConnectionResponse)
async def connect_storage(
    request: StorageConnectRequest,
    current_user: UserContext = Depends(get_current_user),
    service: StorageService = Depends(get_storage_service)
):
    """Connect a new storage provider."""
    return await service.connect(str(current_user.user_id), request)

@router.get("/list", response_model=list[StorageConnectionResponse])
async def list_connections(
    current_user: UserContext = Depends(get_current_user),
    service: StorageService = Depends(get_storage_service)
):
    """List all storage connections for the user."""
    return await service.list_connections(str(current_user.user_id))

@router.post("/{id}/disconnect")
async def disconnect_storage(
    id: str,
    current_user: UserContext = Depends(get_current_user),
    service: StorageService = Depends(get_storage_service)
):
    """Disconnect a storage provider."""
    await service.disconnect(id, str(current_user.user_id))
    return {"message": "Successfully disconnected"}

@router.post("/{id}/default", response_model=StorageConnectionResponse)
async def set_default_storage(
    id: str,
    current_user: UserContext = Depends(get_current_user),
    service: StorageService = Depends(get_storage_service)
):
    """Set a storage connection as the default."""
    return await service.set_default(id, str(current_user.user_id))

@router.get("/{id}/files")
async def list_files(
    id: str,
    path: str = "",
    current_user: UserContext = Depends(get_current_user),
    service: StorageService = Depends(get_storage_service)
):
    """List files in the remote storage."""
    return await service.list_files(id, str(current_user.user_id), path)

@router.post("/{id}/mkdir")
async def make_directory(
    id: str,
    request: StorageMkdirRequest,
    current_user: UserContext = Depends(get_current_user),
    service: StorageService = Depends(get_storage_service)
):
    """Create a directory in the remote storage."""
    await service.mkdir(id, str(current_user.user_id), request.path)
    return {"message": "Directory created"}

@router.delete("/{id}/files")
async def delete_file(
    id: str,
    path: str,
    is_dir: bool = False,
    current_user: UserContext = Depends(get_current_user),
    service: StorageService = Depends(get_storage_service)
):
    """Delete a file or directory in the remote storage."""
    await service.delete_file(id, str(current_user.user_id), path, is_dir=is_dir)
    return {"message": "Deleted successfully"}

@router.post("/{id}/sync")
async def sync_files(
    id: str,
    request: StorageSyncRequest,
    current_user: UserContext = Depends(get_current_user),
    service: StorageService = Depends(get_storage_service)
):
    """Synchronize files on the remote storage."""
    await service.sync(id, str(current_user.user_id), request.src_path, request.dest_path)
    return {"message": "Sync completed"}

@router.post("/{id}/upload")
async def upload_file(
    id: str,
    path: str = Form(..., description="Destination path including filename"),
    file: UploadFile = File(...),
    current_user: UserContext = Depends(get_current_user),
    service: StorageService = Depends(get_storage_service)
):
    """Upload a file to the remote storage."""
    # Save uploaded file to a temporary file
    with tempfile.NamedTemporaryFile(delete=False) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        await service.upload(id, str(current_user.user_id), path, tmp_path)
        return {"message": "Upload successful"}
    finally:
        import os
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

@router.post("/{id}/download")
async def download_file(
    id: str,
    path: str = Form(...),
    current_user: UserContext = Depends(get_current_user),
    service: StorageService = Depends(get_storage_service)
):
    """Download a file from the remote storage."""
    content = await service.download(id, str(current_user.user_id), path)
    return Response(content=content)

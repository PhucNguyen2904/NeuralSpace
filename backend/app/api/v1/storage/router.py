"""Storage API endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import UserContext, get_current_user, get_db
from app.models.workspace import WorkspaceStatus
from app.repositories.workspace_repository import WorkspaceRepository
from app.services.storage_service import StorageService, StorageSyncError

router = APIRouter(prefix="/storage", tags=["storage"])


@router.get("/notebooks")
async def list_notebooks(
    workspace_id: str | None = Query(default=None),
    current_user: UserContext = Depends(get_current_user),
):
    """List notebook objects of current user from storage."""
    _ = workspace_id
    service = StorageService()
    notebooks = await service.list_user_notebooks(current_user.user_id, workspace_id=workspace_id)
    return {"items": [n.__dict__ for n in notebooks]}


@router.get("/notebooks/{path:path}/download")
async def generate_download_url(
    path: str,
    expires: int = Query(default=3600, ge=60, le=86400),
    current_user: UserContext = Depends(get_current_user),
):
    """Create presigned URL so frontend can download notebook directly from MinIO."""
    service = StorageService()
    url = await service.generate_presigned_url(current_user.user_id, path, expires=expires)
    return {"url": url, "expires_in": expires}


@router.get("/notebooks/{path:path}/content")
async def read_notebook_content(
    path: str,
    current_user: UserContext = Depends(get_current_user),
):
    """Read raw notebook/script content for preview panel."""
    service = StorageService()
    content = await service.read_user_notebook_content(current_user.user_id, path)
    return {"path": path, "content": content}


@router.post("/notebooks/upload")
async def upload_notebook(
    file: UploadFile = File(...),
    workspace_id: str = Form(...),
    current_user: UserContext = Depends(get_current_user),
):
    """Upload one .ipynb or .py file to user notebook storage."""
    filename = file.filename or ""
    if not (filename.endswith(".ipynb") or filename.endswith(".py")):
        raise HTTPException(status_code=400, detail="Only .ipynb and .py are supported")
    service = StorageService()
    payload = await file.read()
    notebook = await service.upload_user_notebook(current_user.user_id, workspace_id, filename, payload)
    return {"item": notebook.__dict__}


@router.delete("/notebooks/{path:path}")
async def delete_notebook(
    path: str,
    current_user: UserContext = Depends(get_current_user),
):
    """Delete a notebook/script object from storage."""
    service = StorageService()
    await service.delete_user_notebook(current_user.user_id, path)
    return {"deleted": True, "path": path}


@router.post("/notebooks/{path:path}/restore")
async def restore_notebook_to_current_workspace(
    path: str,
    workspace_id: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: UserContext = Depends(get_current_user),
):
    """Restore one notebook object to the current running workspace pod."""
    if workspace_id is None:
        running = await WorkspaceRepository.list_by_user(
            db=db,
            user_id=current_user.user_id,
            status_filter=WorkspaceStatus.RUNNING,
            limit=1,
            offset=0,
        )
        if not running:
            raise HTTPException(status_code=409, detail="No running workspace available for restore")
        workspace = running[0]
    else:
        workspace = await WorkspaceRepository.get_by_id_and_user(db, workspace_id, current_user.user_id)
        if workspace is None:
            raise HTTPException(status_code=404, detail="Workspace not found")
        if workspace.status != WorkspaceStatus.RUNNING or not workspace.pod_ip:
            raise HTTPException(status_code=409, detail="Workspace is not running")

    service = StorageService()
    try:
        result = await service.restore_notebook_to_pod(
            user_id=current_user.user_id,
            file_path=path,
            pod_ip=workspace.pod_ip or "",
        )
    except StorageSyncError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {
        "workspace_id": workspace.id,
        "requested_path": path,
        "files_restored": result.files_synced,
        "bytes_transferred": result.bytes_transferred,
        "errors": result.errors,
    }

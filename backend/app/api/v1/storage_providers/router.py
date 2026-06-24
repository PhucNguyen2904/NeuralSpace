"""Storage Providers API router."""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from app.dependencies import UserContext, get_current_user, get_db
from app.models.storage_provider import StorageProvider
from app.schemas.storage_provider import StorageProviderCreate, StorageProviderResponse, StorageProviderUpdate

router = APIRouter(prefix="/storage-providers", tags=["storage-providers"])

from app.config import get_settings

@router.get("", response_model=List[StorageProviderResponse])
async def list_storage_providers(
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user),
) -> List[dict]:
    stmt = select(StorageProvider).where(
        (StorageProvider.created_by == user.user_id) | (StorageProvider.created_by.is_(None))
    )
    result = await db.execute(stmt)
    providers = list(result.scalars().all())
    # Remove duplicate server defaults that might have been seeded in the DB
    providers = [p for p in providers if p.id != "server-default-minio" and p.name != "Server Default (MinIO)"]
    
    # Check if there is any user-defined default
    has_user_default = any(p.is_default for p in providers)
    
    settings = get_settings()
    server_default = {
        "id": "server-default-minio",
        "name": "Server Default (MinIO)",
        "type": "minio",
        "config": {
            "endpoint": settings.MINIO_ENDPOINT,
            "bucket": settings.MINIO_BUCKET,
            "access_key": "system-managed",
        },
        "is_active": True,
        "is_default": not has_user_default,
        "created_by": None,
        "created_at": "2024-01-01T00:00:00Z",
        "updated_at": "2024-01-01T00:00:00Z",
    }
    
    return [server_default] + providers

@router.post("", response_model=StorageProviderResponse, status_code=status.HTTP_201_CREATED)
async def create_storage_provider(
    payload: StorageProviderCreate,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user),
) -> StorageProvider:
    row = StorageProvider(
        name=payload.name,
        type=payload.type,
        config=payload.config,
        is_active=payload.is_active,
        created_by=user.user_id,
    )
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Storage provider with name '{payload.name}' already exists.",
        )
    await db.refresh(row)
    return row

@router.delete("/{provider_id}")
async def delete_storage_provider(
    provider_id: str,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user),
):
    row = await db.get(StorageProvider, provider_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Storage provider not found")
    if row.created_by != user.user_id and "admin" not in user.roles:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot delete this storage provider")
    
    await db.delete(row)
    await db.commit()
    return {"success": True}

@router.post("/clear-default")
async def clear_default_storage_provider(
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user),
):
    """Clear user-specific default, falling back to server default."""
    from sqlalchemy import update
    await db.execute(
        update(StorageProvider)
        .where(StorageProvider.created_by == user.user_id)
        .values(is_default=False)
    )
    await db.commit()
    return {"success": True}

@router.put("/{provider_id}", response_model=StorageProviderResponse)
async def update_storage_provider(
    provider_id: str,
    payload: StorageProviderUpdate,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user),
) -> StorageProvider:
    row = await db.get(StorageProvider, provider_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Storage provider not found")
    if row.created_by != user.user_id and "admin" not in user.roles:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot update this storage provider")
    
    # If setting to default, unset others for this user
    if payload.is_default is True:
        from sqlalchemy import update
        await db.execute(
            update(StorageProvider)
            .where(StorageProvider.created_by == user.user_id)
            .values(is_default=False)
        )
    
    if payload.name is not None:
        row.name = payload.name
    if payload.config is not None:
        row.config = payload.config
    if payload.is_active is not None:
        row.is_active = payload.is_active
    if payload.is_default is not None:
        row.is_default = payload.is_default
        
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Storage provider with name '{payload.name}' already exists.",
        )
    await db.refresh(row)
    return row


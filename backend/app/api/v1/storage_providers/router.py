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

@router.get("", response_model=List[StorageProviderResponse])
async def list_storage_providers(
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user),
) -> List[StorageProvider]:
    stmt = select(StorageProvider).where(
        (StorageProvider.created_by == user.user_id) | (StorageProvider.created_by.is_(None))
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())

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

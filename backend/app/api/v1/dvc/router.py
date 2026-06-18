from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.dependencies import UserContext, get_current_user, get_db
from app.schemas.mlops_dataset import DVCProfileCreateRequest
from app.services.dvc_profile_service import DVCProfileService


router = APIRouter(prefix="/dvc", tags=["dvc"])


@router.get("/profiles")
async def list_dvc_profiles(
    db: AsyncSession = Depends(get_db),
    current_user: UserContext = Depends(get_current_user),
) -> dict:
    service = DVCProfileService(db, get_settings())
    return {"items": await service.list_profiles(current_user)}


@router.post("/profiles", status_code=status.HTTP_201_CREATED)
async def create_dvc_profile(
    payload: DVCProfileCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserContext = Depends(get_current_user),
) -> dict:
    service = DVCProfileService(db, get_settings())
    row = await service.create_profile(payload, current_user)
    return service._to_payload(row)

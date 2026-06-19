from __future__ import annotations

from fastapi import APIRouter, Depends, status, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.dependencies import UserContext, get_current_user, get_db
from app.schemas.mlops_dataset import (
    DVCProfileCreateRequest,
    DVCProfilePatchRequest,
    CreateManagedGitProfileRequest,
    SetupRepoRequest,
)
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


@router.patch("/profiles/{profile_id}")
async def update_dvc_profile(
    profile_id: str,
    payload: DVCProfilePatchRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserContext = Depends(get_current_user),
) -> dict:
    service = DVCProfileService(db, get_settings())
    row = await service.update_profile(profile_id, payload, current_user)
    return service._to_payload(row)


@router.delete("/profiles/{profile_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def delete_dvc_profile(
    profile_id: str,
    delete_files: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: UserContext = Depends(get_current_user),
):
    service = DVCProfileService(db, get_settings())
    await service.delete_profile(profile_id, current_user, delete_files=delete_files)


@router.post("/profiles/managed-git", status_code=status.HTTP_201_CREATED)
async def create_managed_git_profile(
    payload: CreateManagedGitProfileRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserContext = Depends(get_current_user),
) -> dict:
    service = DVCProfileService(db, get_settings())
    resp = await service.create_managed_git_profile(payload, current_user)
    return resp.model_dump()


@router.post("/profiles/{profile_id}/setup-repo", status_code=status.HTTP_200_OK)
async def setup_managed_git_repo(
    profile_id: str,
    payload: SetupRepoRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserContext = Depends(get_current_user),
) -> dict:
    service = DVCProfileService(db, get_settings())
    resp = await service.setup_repo_for_profile(profile_id, payload, current_user)
    return resp.model_dump()

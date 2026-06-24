"""Settings router – returns user profile and app preferences."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import UserContext, get_current_user, get_db
from app.models.user import User
from app.models.git_integration import GitSyncPreference
from pydantic import BaseModel

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("")
async def get_settings(
    db: AsyncSession = Depends(get_db),
    current_user: UserContext = Depends(get_current_user),
) -> dict:
    """Return the current user's settings payload expected by the frontend."""
    # Fetch real user data
    row = (await db.execute(select(User).where(User.id == current_user.user_id))).scalar_one_or_none()
    full_name = (row.full_name or "") if row else ""
    email = (row.email or current_user.email or "") if row else current_user.email or ""

    pref = (await db.execute(select(GitSyncPreference).where(GitSyncPreference.user_id == current_user.user_id))).scalar_one_or_none()
    git_sync = {
        "autoSync": pref.auto_sync_experiments if pref else True,
        "commitCheckpoints": pref.commit_checkpoints if pref else False,
        "createPr": pref.create_pr_on_completion if pref else True,
        "syncInterval": str(pref.sync_interval) if pref else "15"
    }

    return {
        "profile": {
            "fullName": full_name,
            "email": email,
            "avatarUrl": None,
        },
        "defaults": {
            "tier": "cpu-standard",
            "pythonVersion": "3.11",
            "idleTimeoutMinutes": 30,
            "autoSaveEnabled": True,
            "autoSaveIntervalMinutes": 5,
        },
        "notifications": {
            "workspaceReady": True,
            "idleWarning": True,
            "autoStopped": True,
            "weeklyUsage": False,
            "platformUpdates": False,
        },
        "apiKeys": [],
        "billing": {
            "planName": "Pro",
            "workspaceUsed": 0,
            "workspaceLimit": 5,
            "storageUsedGb": 0,
            "storageLimitGb": 10,
            "computeUsedHours": 0,
            "computeLimitHours": 120,
            "history7d": [
                {"day": "Mon", "hours": 0},
                {"day": "Tue", "hours": 0},
                {"day": "Wed", "hours": 0},
                {"day": "Thu", "hours": 0},
                {"day": "Fri", "hours": 0},
                {"day": "Sat", "hours": 0},
                {"day": "Sun", "hours": 0},
            ],
        },
        "gitSync": git_sync,
    }

class GitSyncUpdateRequest(BaseModel):
    autoSync: bool
    commitCheckpoints: bool
    createPr: bool
    syncInterval: str

@router.put("/git-sync")
async def update_git_sync_preferences(
    payload: GitSyncUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserContext = Depends(get_current_user),
):
    """Update user's git sync preferences."""
    pref = (await db.execute(select(GitSyncPreference).where(GitSyncPreference.user_id == current_user.user_id))).scalar_one_or_none()
    
    interval_int = int(payload.syncInterval) if payload.syncInterval != "manual" else -1
    
    if pref:
        pref.auto_sync_experiments = payload.autoSync
        pref.commit_checkpoints = payload.commitCheckpoints
        pref.create_pr_on_completion = payload.createPr
        pref.sync_interval = interval_int
    else:
        pref = GitSyncPreference(
            user_id=current_user.user_id,
            auto_sync_experiments=payload.autoSync,
            commit_checkpoints=payload.commitCheckpoints,
            create_pr_on_completion=payload.createPr,
            sync_interval=interval_int
        )
        db.add(pref)
        
    await db.commit()
    
    return {"status": "success"}

import urllib.parse
from datetime import timedelta
from typing import Annotated, Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.dependencies import get_db, get_current_user, UserContext
from app.models.git_integration import GitAccount, GitRepository
from app.models.user import User
from app.core.security import encrypt_token, decrypt_token, create_access_token, verify_token
from app.config import get_settings

router = APIRouter()

@router.get("/oauth/login")
async def github_oauth_login(
    current_user: Annotated[UserContext, Depends(get_current_user)]
) -> dict[str, str]:
    """Generate GitHub OAuth login URL."""
    settings = get_settings()
    if not settings.GITHUB_CLIENT_ID:
        raise HTTPException(status_code=500, detail="GitHub OAuth is not configured")
        
    state = create_access_token(
        data={"sub": str(current_user.user_id), "action": "github_oauth"},
        expires_delta=timedelta(minutes=15)
    )
    
    params = {
        "client_id": settings.GITHUB_CLIENT_ID,
        "redirect_uri": settings.GITHUB_REDIRECT_URI,
        "scope": "public_repo user",
        "state": state
    }
    url = f"https://github.com/login/oauth/authorize?{urllib.parse.urlencode(params)}"
    return {"url": url}

@router.get("/oauth/callback")
async def github_oauth_callback(
    code: str,
    state: str,
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Handle GitHub OAuth callback."""
    settings = get_settings()
    try:
        payload = verify_token(state)
        user_id = payload.get("sub")
        action = payload.get("action")
        if action != "github_oauth" or not user_id:
            raise ValueError("Invalid state payload")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid or expired state parameter")
        
    # Exchange code for token
    async with httpx.AsyncClient() as client:
        token_res = await client.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            data={
                "client_id": settings.GITHUB_CLIENT_ID,
                "client_secret": settings.GITHUB_CLIENT_SECRET,
                "code": code,
                "redirect_uri": settings.GITHUB_REDIRECT_URI
            }
        )
        if token_res.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to fetch access token")
            
        token_data = token_res.json()
        access_token = token_data.get("access_token")
        if not access_token:
            raise HTTPException(status_code=400, detail="No access token returned from GitHub")
            
        # Get user info
        user_res = await client.get(
            "https://api.github.com/user",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/vnd.github.v3+json"
            }
        )
        if user_res.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to fetch GitHub user info")
            
        user_info = user_res.json()
        username = user_info.get("login")
        
        # Save to DB
        encrypted_token = encrypt_token(access_token)
        
        result = await db.execute(
            select(GitAccount).where(
                GitAccount.user_id == user_id, 
                GitAccount.provider == "github", 
                GitAccount.username == username
            )
        )
        existing = result.scalar_one_or_none()
        
        if existing:
            existing.access_token = encrypted_token
        else:
            account = GitAccount(
                user_id=user_id,
                provider="github",
                username=username,
                access_token=encrypted_token
            )
            db.add(account)
            
        await db.commit()
        
    return RedirectResponse(url=f"{settings.FRONTEND_URL}/settings#git")

@router.get("", response_model=list[dict[str, Any]])
async def list_git_accounts(
    current_user: Annotated[UserContext, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)]
) -> list[dict[str, Any]]:
    """List connected Git accounts."""
    result = await db.execute(
        select(GitAccount).where(GitAccount.user_id == current_user.user_id)
    )
    accounts = result.scalars().all()
    
    return [
        {
            "id": acc.id,
            "provider": acc.provider,
            "username": acc.username,
            "created_at": acc.created_at
        }
        for acc in accounts
    ]

@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
async def disconnect_git_account(
    account_id: str,
    current_user: Annotated[UserContext, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Disconnect a Git account."""
    result = await db.execute(
        select(GitAccount).where(GitAccount.id == account_id, GitAccount.user_id == current_user.user_id)
    )
    account = result.scalar_one_or_none()
    
    if not account:
        raise HTTPException(status_code=404, detail="Git account not found")
        
    await db.delete(account)
    await db.commit()
    return None

@router.get("/{account_id}/repos")
async def list_git_repositories(
    account_id: str,
    current_user: Annotated[UserContext, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)]
) -> list[dict[str, Any]]:
    """List repositories for a Git account from GitHub API."""
    result = await db.execute(
        select(GitAccount).where(GitAccount.id == account_id, GitAccount.user_id == current_user.user_id)
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Git account not found")
        
    access_token = decrypt_token(account.access_token)
    
    async with httpx.AsyncClient() as client:
        res = await client.get(
            "https://api.github.com/user/repos",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/vnd.github.v3+json"
            },
            params={"per_page": 100, "sort": "updated"}
        )
        
        if res.status_code != 200:
            if res.status_code == 401:
                raise HTTPException(status_code=401, detail="GitHub token expired or revoked")
            raise HTTPException(status_code=400, detail="Failed to fetch repositories from GitHub")
            
        # Filter strictly for public repositories
        github_repos = [r for r in res.json() if not r.get("private")]
        
    # Upsert repos to cache
    result = await db.execute(
        select(GitRepository).where(GitRepository.git_account_id == account.id)
    )
    existing_repos = {repo.repo_name: repo for repo in result.scalars().all()}
    
    for r in github_repos:
        repo_name = r.get("full_name")
        repo_url = r.get("clone_url")
        is_private = r.get("private", False)
        
        if repo_name in existing_repos:
            repo = existing_repos[repo_name]
            repo.repo_url = repo_url
            repo.is_private = is_private
        else:
            repo = GitRepository(
                git_account_id=account.id,
                repo_name=repo_name,
                repo_url=repo_url,
                is_private=is_private
            )
            db.add(repo)
            
    await db.commit()
    
    # Re-fetch
    result = await db.execute(
        select(GitRepository).where(GitRepository.git_account_id == account.id)
    )
    repos = result.scalars().all()
        
    return [
        {
            "id": repo.id,
            "repo_name": repo.repo_name,
            "repo_url": repo.repo_url,
            "is_private": repo.is_private,
            "is_tracked": repo.is_tracked,
            "tracked_branch": repo.tracked_branch,
            "last_sync_time": repo.last_sync_time.isoformat() if repo.last_sync_time else None,
            "sync_status": repo.sync_status
        }
        for repo in repos
    ]

class TrackRepoRequest(BaseModel):
    is_tracked: bool
    tracked_branch: str | None = None

@router.get("/tracked-repos")
async def list_tracked_repositories(
    current_user: Annotated[UserContext, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)]
) -> list[dict[str, Any]]:
    """List all tracked repositories across all connected Git accounts."""
    result = await db.execute(
        select(GitRepository)
        .join(GitAccount, GitRepository.git_account_id == GitAccount.id)
        .where(
            GitAccount.user_id == current_user.user_id,
            GitRepository.is_tracked == True
        )
    )
    repos = result.scalars().all()
    
    return [
        {
            "id": repo.id,
            "repo_name": repo.repo_name,
            "repo_url": repo.repo_url,
            "is_private": repo.is_private,
            "is_tracked": repo.is_tracked,
            "tracked_branch": repo.tracked_branch,
            "last_sync_time": repo.last_sync_time.isoformat() if repo.last_sync_time else None,
            "sync_status": repo.sync_status
        }
        for repo in repos
    ]

@router.get("/untracked-repos")
async def list_untracked_repositories(
    current_user: Annotated[UserContext, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)]
) -> list[dict[str, Any]]:
    """List all untracked repositories across all connected Git accounts."""
    result = await db.execute(
        select(GitRepository)
        .join(GitAccount, GitRepository.git_account_id == GitAccount.id)
        .where(
            GitAccount.user_id == current_user.user_id,
            GitRepository.is_tracked == False
        )
    )
    repos = result.scalars().all()
    
    return [
        {
            "id": repo.id,
            "repo_name": repo.repo_name,
            "repo_url": repo.repo_url,
            "is_private": repo.is_private,
            "is_tracked": repo.is_tracked,
            "tracked_branch": repo.tracked_branch,
            "last_sync_time": repo.last_sync_time.isoformat() if repo.last_sync_time else None,
            "sync_status": repo.sync_status
        }
        for repo in repos
    ]

@router.put("/repos/{repo_id}/track")
async def track_repository(
    repo_id: str,
    payload: TrackRepoRequest,
    current_user: Annotated[UserContext, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)]
) -> dict[str, Any]:
    """Enable or disable tracking for a repository."""
    result = await db.execute(
        select(GitRepository)
        .join(GitAccount, GitRepository.git_account_id == GitAccount.id)
        .where(
            GitRepository.id == repo_id,
            GitAccount.user_id == current_user.user_id
        )
    )
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
        
    repo.is_tracked = payload.is_tracked
    if payload.tracked_branch is not None:
        repo.tracked_branch = payload.tracked_branch
        
    if payload.is_tracked:
        from datetime import datetime, timezone
        repo.sync_status = "active"
        repo.last_sync_time = datetime.now(timezone.utc)
    else:
        repo.sync_status = None
        repo.last_sync_time = None
        
    await db.commit()
    
    return {
        "id": repo.id,
        "is_tracked": repo.is_tracked,
        "tracked_branch": repo.tracked_branch,
        "sync_status": repo.sync_status
    }

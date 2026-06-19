from __future__ import annotations

import asyncio
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy import select, update, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.dependencies import UserContext
from app.models.mlops_tracking import DatasetVersion, DVCProfile, MLDataset
from app.schemas.mlops_dataset import DVCProfileCreateRequest, DVCProfilePatchRequest
from src.integrations.dvc.exceptions import DVCRepositoryError
import shutil


ENV_DEFAULT_DVC_PROFILE_ID = "__env_default__"


@dataclass(frozen=True)
class ResolvedDVCProfile:
    id: str | None
    name: str
    repo_path: str
    remote_name: str
    remote_url: str | None = None


def environment_dvc_profile(settings: Settings) -> dict:
    return {
        "id": ENV_DEFAULT_DVC_PROFILE_ID,
        "name": "Server default",
        "scope": "global",
        "scope_id": None,
        "repo_mode": "existing_path",
        "git_repo_url": None,
        "git_branch": "main",
        "repo_path": settings.DVC_REPO_PATH,
        "remote_name": settings.DVC_REMOTE_NAME,
        "remote_url": None,
        "endpoint_url": None,
        "is_default": True,
        "status": "ready",
        "status_message": "Uses the server default DVC path configured by the administrator",
        "is_environment_default": True,
    }


class DVCProfileService:
    def __init__(self, db: AsyncSession, settings: Settings) -> None:
        self.db = db
        self.settings = settings

    async def list_profiles(self, user: UserContext) -> list[dict]:
        stmt = select(DVCProfile).where(
            ((DVCProfile.scope == "global")
            | (DVCProfile.created_by == user.user_id)
            | ((DVCProfile.scope == "user") & (DVCProfile.scope_id == user.user_id)))
            & (DVCProfile.status != "archived")
        )
        rows = list((await self.db.execute(stmt.order_by(DVCProfile.is_default.desc(), DVCProfile.name.asc()))).scalars().all())
        items = [environment_dvc_profile(self.settings)]
        items.extend(self._to_payload(row) for row in rows)
        return items

    async def create_profile(self, payload: DVCProfileCreateRequest, user: UserContext) -> DVCProfile:
        if payload.scope == "global" and "admin" not in user.roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins can create global DVC profiles")
        if payload.scope == "user" and payload.scope_id not in (None, user.user_id) and "admin" not in user.roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot create another user's DVC profile")

        profile_id = str(uuid4())
        repo_mode = payload.repo_mode
        git_repo_url = payload.git_repo_url.strip() if payload.git_repo_url else None
        git_branch = (payload.git_branch or "main").strip()
        if repo_mode == "managed_git" and not git_repo_url:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="git_repo_url is required for managed Git profiles")
        if repo_mode == "existing_path" and not payload.repo_path:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="repo_path is required for existing server path profiles")

        repo_path = (payload.repo_path or "").strip()
        if repo_mode == "managed_git":
            repo_path = str(Path(self.settings.DVC_MANAGED_REPO_ROOT) / profile_id)

        status_value, status_message = await self._prepare_repo(
            repo_mode=repo_mode,
            repo_path=repo_path,
            git_repo_url=git_repo_url,
            git_branch=git_branch,
            remote_name=(payload.remote_name or "minio").strip(),
            remote_url=payload.remote_url.strip() if payload.remote_url else None,
            endpoint_url=payload.endpoint_url.strip() if payload.endpoint_url else None,
        )

        row = DVCProfile(
            id=profile_id,
            name=payload.name.strip(),
            scope=payload.scope,
            scope_id=payload.scope_id or (user.user_id if payload.scope == "user" else None),
            repo_mode=repo_mode,
            git_repo_url=git_repo_url,
            git_branch=git_branch,
            repo_path=repo_path,
            remote_name=(payload.remote_name or "minio").strip(),
            remote_url=payload.remote_url.strip() if payload.remote_url else None,
            endpoint_url=payload.endpoint_url.strip() if payload.endpoint_url else None,
            is_default=payload.is_default,
            status=status_value,
            status_message=status_message,
            created_by=user.user_id,
        )
        if row.is_default:
            await self._clear_default(row.scope, row.scope_id)
        self.db.add(row)
        await self.db.commit()
        await self.db.refresh(row)
        return row

    async def update_profile(self, profile_id: str, payload: DVCProfilePatchRequest, user: UserContext) -> DVCProfile:
        if profile_id == ENV_DEFAULT_DVC_PROFILE_ID:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot modify the server default profile")
            
        profile = await self.db.get(DVCProfile, profile_id)
        if profile is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="DVC profile not found")
            
        self._check_access(profile, user)
        
        if payload.name is not None:
            profile.name = payload.name.strip()
        if payload.status is not None:
            profile.status = payload.status
        if payload.is_default is not None:
            profile.is_default = payload.is_default
            if profile.is_default:
                await self._clear_default(profile.scope, profile.scope_id)
                
        await self.db.commit()
        await self.db.refresh(profile)
        return profile

    async def delete_profile(self, profile_id: str, user: UserContext, delete_files: bool = False) -> None:
        if profile_id == ENV_DEFAULT_DVC_PROFILE_ID:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete the server default profile")

        profile = await self.db.get(DVCProfile, profile_id)
        if profile is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="DVC profile not found")

        self._check_access(profile, user)

        # Check usages
        dataset_count = await self.db.scalar(
            select(func.count()).select_from(MLDataset).where(MLDataset.dvc_profile_id == profile_id)
        )
        version_count = await self.db.scalar(
            select(func.count()).select_from(DatasetVersion).where(DatasetVersion.dvc_profile_id == profile_id)
        )

        if dataset_count or version_count:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "message": "DVC profile is in use. Disable it instead.",
                    "datasets_count": dataset_count or 0,
                    "versions_count": version_count or 0,
                }
            )

        repo_mode = profile.repo_mode
        repo_path = profile.repo_path

        await self.db.delete(profile)
        await self.db.commit()

        if repo_mode == "managed_git" and delete_files and repo_path:
            managed_root = Path(self.settings.DVC_MANAGED_REPO_ROOT).resolve()
            try:
                target_path = Path(repo_path).resolve()
                if managed_root in target_path.parents:
                    shutil.rmtree(target_path, ignore_errors=True)
            except Exception:
                pass

    async def resolve_for_dataset(
        self,
        *,
        dataset: MLDataset,
        user: UserContext,
        requested_profile_id: str | None = None,
    ) -> ResolvedDVCProfile:
        if requested_profile_id == ENV_DEFAULT_DVC_PROFILE_ID:
            return self._from_env()

        profile = None
        if requested_profile_id:
            profile = await self.db.get(DVCProfile, requested_profile_id)
            if profile is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="DVC profile not found")
            self._check_access(profile, user)
        elif dataset.dvc_profile_id:
            profile = await self.db.get(DVCProfile, dataset.dvc_profile_id)

        if profile is None:
            profile = (
                await self.db.execute(
                    select(DVCProfile)
                    .where(DVCProfile.is_default.is_(True), DVCProfile.status == "ready")
                    .order_by(DVCProfile.scope.asc(), DVCProfile.created_at.desc())
                    .limit(1)
                )
            ).scalar_one_or_none()

        if profile is None:
            return self._from_env()
        if profile.status != "ready":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"DVC profile is not ready: {profile.status_message or profile.status}")
        self._check_access(profile, user)
        return ResolvedDVCProfile(
            id=profile.id,
            name=profile.name,
            repo_path=profile.repo_path,
            remote_name=profile.remote_name,
            remote_url=profile.remote_url,
        )

    async def _clear_default(self, scope: str, scope_id: str | None) -> None:
        scope_filter = DVCProfile.scope_id.is_(None) if scope_id is None else DVCProfile.scope_id == scope_id
        await self.db.execute(
            update(DVCProfile)
            .where(DVCProfile.scope == scope, scope_filter)
            .values(is_default=False)
        )

    def _from_env(self) -> ResolvedDVCProfile:
        return ResolvedDVCProfile(
            id=None,
            name="Server default",
            repo_path=self.settings.DVC_REPO_PATH,
            remote_name=self.settings.DVC_REMOTE_NAME,
        )

    def _check_access(self, profile: DVCProfile, user: UserContext) -> None:
        if profile.scope == "global" or "admin" in user.roles:
            return
        if profile.scope == "user" and profile.scope_id == user.user_id:
            return
        if profile.created_by == user.user_id:
            return
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permission for DVC profile")

    @staticmethod
    def _validate_repo(repo_path: str) -> None:
        path = Path(repo_path)
        if not path.exists():
            raise DVCRepositoryError(f"repo_path does not exist: {repo_path}")
        if not (path / ".git").exists():
            raise DVCRepositoryError(f"repo_path is missing .git: {repo_path}")
        if not (path / ".dvc").exists():
            raise DVCRepositoryError(f"repo_path is missing .dvc: {repo_path}")

    async def _prepare_repo(
        self,
        *,
        repo_mode: str,
        repo_path: str,
        git_repo_url: str | None,
        git_branch: str,
        remote_name: str,
        remote_url: str | None,
        endpoint_url: str | None,
    ) -> tuple[str, str]:
        try:
            if repo_mode == "managed_git":
                await self._clone_managed_repo(repo_path, git_repo_url or "", git_branch)
                await self._ensure_dvc_repo(repo_path)
                await self._configure_remote(repo_path, remote_name, remote_url, endpoint_url)
            self._validate_repo(repo_path)
            return "ready", "Repo validated"
        except DVCRepositoryError as exc:
            return "error", str(exc)

    async def _clone_managed_repo(self, repo_path: str, git_repo_url: str, git_branch: str) -> None:
        path = Path(repo_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.exists() and (path / ".git").exists():
            return
        if path.exists() and any(path.iterdir()):
            raise DVCRepositoryError(f"managed repo path is not empty: {repo_path}")
        await self._run(["git", "clone", "--branch", git_branch, git_repo_url, repo_path], cwd=None)

    async def _ensure_dvc_repo(self, repo_path: str) -> None:
        path = Path(repo_path)
        if not (path / ".dvc").exists():
            await self._run(["dvc", "init"], cwd=repo_path)
            await self._run(["git", "add", ".dvc", ".gitignore"], cwd=repo_path)
            await self._run(["git", "commit", "-m", "chore: initialize dvc"], cwd=repo_path, allow_failure=True)

    async def _configure_remote(self, repo_path: str, remote_name: str, remote_url: str | None, endpoint_url: str | None) -> None:
        if not remote_url:
            return
        # Auto-create the S3/MinIO bucket if it does not exist yet.
        await asyncio.to_thread(self._ensure_s3_bucket, remote_url, endpoint_url)
        await self._run(["dvc", "remote", "add", "-d", remote_name, remote_url], cwd=repo_path, allow_failure=True)
        await self._run(["dvc", "remote", "modify", remote_name, "url", remote_url], cwd=repo_path, allow_failure=True)
        if endpoint_url:
            await self._run(["dvc", "remote", "modify", remote_name, "endpointurl", endpoint_url], cwd=repo_path)
        await self._run(["git", "add", ".dvc/config"], cwd=repo_path)
        await self._run(["git", "commit", "-m", "chore: configure dvc remote"], cwd=repo_path, allow_failure=True)

    def _ensure_s3_bucket(self, remote_url: str, endpoint_url: str | None) -> None:
        """Create the S3/MinIO bucket extracted from remote_url if it does not exist."""
        import re
        match = re.match(r"s3://([^/]+)", remote_url.strip())
        if not match:
            return  # Not an S3 URL – skip
        bucket_name = match.group(1)
        try:
            import boto3
            from botocore.client import Config
            from botocore.exceptions import ClientError

            effective_endpoint = endpoint_url or self.settings.MINIO_ENDPOINT
            if effective_endpoint and not effective_endpoint.startswith("http"):
                effective_endpoint = f"http://{effective_endpoint}"

            s3 = boto3.client(
                "s3",
                endpoint_url=effective_endpoint,
                aws_access_key_id=self.settings.MINIO_ACCESS_KEY,
                aws_secret_access_key=self.settings.MINIO_SECRET_KEY,
                config=Config(signature_version="s3v4"),
            )
            try:
                s3.head_bucket(Bucket=bucket_name)
            except ClientError as exc:
                code = exc.response.get("Error", {}).get("Code", "")
                if code in ("404", "NoSuchBucket"):
                    s3.create_bucket(Bucket=bucket_name)
        except Exception:
            # Non-fatal: bucket creation failure is caught later by dvc push.
            pass

    @staticmethod
    async def _run(command: list[str], *, cwd: str | None, allow_failure: bool = False) -> None:
        import os
        env = os.environ.copy()
        env["GIT_TERMINAL_PROMPT"] = "0"
        # Fallback identity so `git commit` works in headless Docker containers.
        env.setdefault("GIT_AUTHOR_NAME", "NeuralSpace")
        env.setdefault("GIT_AUTHOR_EMAIL", "noreply@neuralspace.local")
        env.setdefault("GIT_COMMITTER_NAME", "NeuralSpace")
        env.setdefault("GIT_COMMITTER_EMAIL", "noreply@neuralspace.local")
        
        proc = await asyncio.create_subprocess_exec(
            *command,
            cwd=cwd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0 and not allow_failure:
            detail = (stderr or stdout).decode(errors="ignore").strip()
            if "terminal prompts disabled" in detail or "could not read Username" in detail:
                raise DVCRepositoryError("Git authentication failed. For private repositories, please include credentials in the URL (e.g. https://<token>@github.com/...) or use SSH.")
            raise DVCRepositoryError(detail or f"command failed: {' '.join(command)}")

    @staticmethod
    def _to_payload(row: DVCProfile) -> dict:
        return {
            "id": row.id,
            "name": row.name,
            "scope": row.scope,
            "scope_id": row.scope_id,
            "repo_mode": row.repo_mode,
            "git_repo_url": row.git_repo_url,
            "git_branch": row.git_branch,
            "repo_path": row.repo_path,
            "remote_name": row.remote_name,
            "remote_url": row.remote_url,
            "endpoint_url": row.endpoint_url,
            "is_default": row.is_default,
            "status": row.status,
            "status_message": row.status_message,
            "is_environment_default": False,
        }

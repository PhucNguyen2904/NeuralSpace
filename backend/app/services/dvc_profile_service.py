from __future__ import annotations

import asyncio
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy import select, update, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from app.config import Settings
from app.dependencies import UserContext
from app.models.mlops_tracking import DatasetVersion, DVCProfile, MLDataset
from app.models.git_integration import GitRepository, GitAccount
from app.core.security import decrypt_token
import urllib.parse
from app.schemas.mlops_dataset import (
    DVCProfileCreateRequest,
    DVCProfilePatchRequest,
    CreateManagedGitProfileRequest,
    CreateManagedGitProfileResponse,
    SetupRepoRequest,
    SetupRepoResponse,
)

from app.utils.ssh_key_manager import generate_ssh_keypair
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
    git_ssh_url: str | None = None
    ssh_key_encrypted: bytes | None = None


def environment_dvc_profile(settings: Settings) -> dict:
    # Trong production (Render), không có persistent disk nên server default không hoạt động.
    # User phải tạo DVC profile riêng với git remote + R2/S3 storage.
    is_production = settings.ENVIRONMENT == "production"
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
        "is_default": not is_production,
        "status": "inactive" if is_production else "ready",
        "status_message": (
            "Không khả dụng trong môi trường production (ephemeral disk). "
            "Vui lòng tạo DVC Profile riêng với Git repo và R2/S3 remote storage."
            if is_production
            else "Uses the server default DVC path configured by the administrator"
        ),
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
        try:
            await self.db.commit()
        except IntegrityError:
            await self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"A DVC profile with the name '{payload.name.strip()}' already exists in this scope.",
            )
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

    async def create_managed_git_profile(
        self, payload: CreateManagedGitProfileRequest, user: UserContext
    ) -> CreateManagedGitProfileResponse:
        profile_id = str(uuid4())
        repo_path = str(Path(self.settings.DVC_MANAGED_REPO_ROOT) / profile_id)

        # Trạng thái pending_oauth: Đợi user connect GitHub
        row = DVCProfile(
            id=profile_id,
            name=payload.name.strip(),
            scope="user",
            scope_id=user.user_id,
            repo_mode="managed_git",
            repo_path=repo_path,
            remote_name="minio",
            is_default=False,
            status="pending_oauth",
            status_message="Waiting for GitHub App connection",
            created_by=user.user_id,
        )
        self.db.add(row)
        try:
            await self.db.commit()
        except IntegrityError:
            await self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"A DVC profile with the name '{payload.name.strip()}' already exists.",
            )

        # Tạo connect URL, truyền state là profile_id để callback biết
        connect_url = f"/api/v1/git/accounts/oauth/login"

        return CreateManagedGitProfileResponse(
            profile_id=profile_id,
            status="pending_oauth",
            connect_url=connect_url,
        )

    async def setup_repo_for_profile(
        self, profile_id: str, payload: SetupRepoRequest, user: UserContext
    ) -> SetupRepoResponse:
        profile = await self.db.get(DVCProfile, profile_id)
        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found")
        self._check_access(profile, user)

        if profile.status != "pending_repo_selection":
            raise HTTPException(
                status_code=400, detail=f"Cannot setup repo in status: {profile.status}"
            )
        if not profile.github_installation_id:
            raise HTTPException(
                status_code=400, detail="Missing installation ID. Connect GitHub first."
            )

        # Đã chuyển sang OAuth, logic setup deploy key phải gọi qua OAuth Token nếu cần.
        # Tạm thời throw NotImplementedError
        raise NotImplementedError("Managed Git setup via GitHub App is deprecated. Use standard Git Integration.")

        # 3. Update DB
        profile.git_repo_owner = payload.repo_owner
        profile.git_repo_name = payload.repo_name
        profile.git_ssh_url = f"git@github.com:{payload.repo_owner}/{payload.repo_name}.git"
        profile.github_deploy_key_id = key_id
        profile.ssh_key_encrypted = encrypted_private_key
        profile.ssh_public_key = public_key
        profile.status = "active"
        profile.status_message = "Ready"

        await self.db.commit()

        # 4. Clone repo and initialize DVC
        try:
            from app.utils.ssh_key_manager import temp_ssh_key_file
            with temp_ssh_key_file(encrypted_private_key) as key_path:
                extra_env = {
                    "GIT_SSH_COMMAND": f"ssh -i {key_path} -o StrictHostKeyChecking=no -o BatchMode=yes",
                }
                await self._clone_managed_repo(profile.repo_path, profile.git_ssh_url, profile.git_branch or "main", extra_env=extra_env)
                await self._ensure_dvc_repo(profile.repo_path)
                
                remote_url = profile.remote_url or f"s3://dvc-{profile_id}"
                endpoint_url = profile.endpoint_url or self.settings.MINIO_ENDPOINT
                await self._configure_remote(profile.repo_path, profile.remote_name, remote_url, endpoint_url)
                
                await self._run(["git", "push", "-u", "origin", "HEAD"], cwd=profile.repo_path, extra_env=extra_env)
                
                if not profile.remote_url:
                    profile.remote_url = remote_url
                    await self.db.commit()

        except Exception as e:
            profile.status = "error"
            profile.status_message = f"Failed to initialize repository: {e}"
            await self.db.commit()
            raise HTTPException(status_code=500, detail=f"Failed to initialize repository: {e}")

        return SetupRepoResponse(
            profile_id=profile_id,
            status="active",
            repo=f"{payload.repo_owner}/{payload.repo_name}",
            message="Deploy key added and repository initialized successfully.",
        )

    async def delete_profile(self, profile_id: str, user: UserContext, delete_files: bool = False) -> None:
        if profile_id == ENV_DEFAULT_DVC_PROFILE_ID:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete the server default profile")

        profile = await self.db.get(DVCProfile, profile_id)
        if profile is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="DVC profile not found")

        self._check_access(profile, user)

        # Check usages removed. Database handles this via ON DELETE SET NULL for MLDataset and DatasetVersion.

        repo_mode = profile.repo_mode
        repo_path = profile.repo_path

        # Thu hồi Deploy Key nếu có
        # GitHub App is deprecated. We no longer revoke deploy keys automatically via App.
        # User must revoke manually or we implement it via OAuth token in the future.

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
                from sqlalchemy.orm import selectinload
                repo = await self.db.execute(
                    select(GitRepository)
                    .options(selectinload(GitRepository.account))
                    .where(GitRepository.id == requested_profile_id)
                )
                repo_obj = repo.scalar_one_or_none()
                if repo_obj:
                    return await self._resolve_git_repository(repo_obj, user)
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
        if profile.status not in ("ready", "active"):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"DVC profile is not ready: {profile.status_message or profile.status}")
        self._check_access(profile, user)

        if profile.repo_mode == "managed_git" and not Path(profile.repo_path).exists():
            try:
                if profile.ssh_key_encrypted:
                    from app.utils.ssh_key_manager import temp_ssh_key_file
                    with temp_ssh_key_file(profile.ssh_key_encrypted) as key_path:
                        extra_env = {"GIT_SSH_COMMAND": f"ssh -i {key_path} -o StrictHostKeyChecking=no -o BatchMode=yes"}
                        await self._clone_managed_repo(profile.repo_path, profile.git_ssh_url or profile.git_repo_url, profile.git_branch or "main", extra_env=extra_env)
                else:
                    await self._clone_managed_repo(profile.repo_path, profile.git_repo_url, profile.git_branch or "main")
            except Exception as e:
                import logging
                logging.error(f"Failed to auto-clone managed git repo {profile.id}: {e}")

        return ResolvedDVCProfile(
            id=profile.id,
            name=profile.name,
            repo_path=profile.repo_path,
            remote_name=profile.remote_name,
            remote_url=profile.remote_url,
            git_ssh_url=profile.git_ssh_url,
            ssh_key_encrypted=profile.ssh_key_encrypted,
        )

    async def _resolve_git_repository(self, repo: GitRepository, user: UserContext) -> ResolvedDVCProfile:
        import logging
        from app.models.mlops_tracking import DVCProfile
        
        access_token = decrypt_token(repo.account.access_token)
        username = urllib.parse.quote_plus(repo.account.username)
        encoded_token = urllib.parse.quote_plus(access_token)
        
        parsed_url = urllib.parse.urlparse(repo.repo_url)
        auth_url = f"{parsed_url.scheme}://{username}:{encoded_token}@{parsed_url.netloc}{parsed_url.path}"
        
        managed_root = Path(self.settings.DVC_MANAGED_REPO_ROOT).resolve()
        repo_path = str(managed_root / f"git_repo_{repo.id}")
        
        if not Path(repo_path).exists():
            try:
                branch = repo.tracked_branch or "main"
                await self._clone_managed_repo(repo_path, auth_url, branch)
                
                await self._run(["git", "config", "user.name", repo.account.username], cwd=repo_path)
                await self._run(["git", "config", "user.email", f"{repo.account.username}@users.noreply.github.com"], cwd=repo_path)
                
                # Auto-initialize DVC if missing
                if not (Path(repo_path) / ".dvc").exists():
                    await self._ensure_dvc_repo(repo_path)
                    await self._run(["git", "push", "origin", "HEAD"], cwd=repo_path)
            except Exception as e:
                logging.error(f"Failed to auto-clone git repo {repo.id}: {e}")
                raise HTTPException(status_code=500, detail=f"Failed to clone repository: {e}")
        # Mirror GitRepository as a DVCProfile to satisfy foreign key constraints
        profile = await self.db.get(DVCProfile, repo.id)
        if not profile:
            profile = DVCProfile(
                id=repo.id,
                name=f"Git Integration: {repo.repo_name}",
                scope="user",
                scope_id=user.user_id,
                repo_mode="managed_git",
                git_repo_url=auth_url,
                git_branch=repo.tracked_branch or "main",
                repo_path=repo_path,
                remote_name=self.settings.DVC_REMOTE_NAME,
                status="ready",
                created_by=user.user_id,
            )
            self.db.add(profile)
            try:
                await self.db.commit()
            except Exception as e:
                await self.db.rollback()
                logging.error(f"Failed to sync GitRepository to DVCProfile: {e}")

        return ResolvedDVCProfile(
            id=repo.id,
            name=repo.repo_name,
            repo_path=repo_path,
            remote_name=self.settings.DVC_REMOTE_NAME,
            remote_url=auth_url,
            git_ssh_url=None,
            ssh_key_encrypted=None,
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
            git_ssh_url=None,
            ssh_key_encrypted=None,
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
                if git_repo_url: # Normal managed git
                    await self._clone_managed_repo(repo_path, git_repo_url, git_branch)
                    await self._ensure_dvc_repo(repo_path)
                    await self._configure_remote(repo_path, remote_name, remote_url, endpoint_url)
                    await self._run(["git", "push", "origin", "HEAD"], cwd=repo_path)
                else: # GitHub App managed git, wait for setup
                    return "pending_repo_selection", "Waiting for GitHub App connection"
            self._validate_repo(repo_path)
            return "ready", "Repo validated"
        except DVCRepositoryError as exc:
            return "error", str(exc)

    async def _clone_managed_repo(self, repo_path: str, git_repo_url: str, git_branch: str, extra_env: dict | None = None) -> None:
        path = Path(repo_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.exists() and (path / ".git").exists():
            return
        if path.exists() and any(path.iterdir()):
            raise DVCRepositoryError(f"managed repo path is not empty: {repo_path}")
            
        await self._run(["git", "clone", git_repo_url, repo_path], cwd=None, extra_env=extra_env)
        try:
            await self._run(["git", "checkout", git_branch], cwd=repo_path, extra_env=extra_env)
        except DVCRepositoryError:
            await self._run(["git", "checkout", "-b", git_branch], cwd=repo_path, extra_env=extra_env)

    async def _ensure_dvc_repo(self, repo_path: str) -> None:
        path = Path(repo_path)
        if not (path / ".dvc").exists():
            await self._run(["dvc", "init"], cwd=repo_path)
            await self._run(["git", "add", ".dvc", ".gitignore"], cwd=repo_path)
            await self._run(["git", "commit", "-m", "chore: initialize dvc"], cwd=repo_path, allow_failure=True)

    async def _configure_remote(self, repo_path: str, remote_name: str, remote_url: str | None, endpoint_url: str | None) -> None:
        if not remote_url:
            return
            
        if not remote_url.startswith("gdrive://"):
            # Auto-create the S3/MinIO bucket if it does not exist yet.
            await asyncio.to_thread(self._ensure_s3_bucket, remote_url, endpoint_url)
            
        await self._run(["dvc", "remote", "add", "-d", remote_name, remote_url], cwd=repo_path, allow_failure=True)
        await self._run(["dvc", "remote", "modify", remote_name, "url", remote_url], cwd=repo_path, allow_failure=True)
        
        if remote_url.startswith("gdrive://"):
            await self._run(["dvc", "remote", "modify", "--local", remote_name, "gdrive_client_id", self.settings.GOOGLE_CLIENT_ID], cwd=repo_path)
            await self._run(["dvc", "remote", "modify", "--local", remote_name, "gdrive_client_secret", self.settings.GOOGLE_CLIENT_SECRET], cwd=repo_path)
            await self._run(["dvc", "remote", "modify", "--local", remote_name, "gdrive_use_service_account", "false"], cwd=repo_path)
            await self._run(["dvc", "remote", "modify", "--local", remote_name, "gdrive_user_credentials_file", ".dvc/gdrive_credentials.json"], cwd=repo_path)
        else:
            if endpoint_url:
                effective_endpoint = endpoint_url if endpoint_url.startswith("http") else f"http://{endpoint_url}"
                await self._run(["dvc", "remote", "modify", remote_name, "endpointurl", effective_endpoint], cwd=repo_path)
            
            # Configure credentials locally so dvc push can authenticate
            await self._run(["dvc", "remote", "modify", "--local", remote_name, "access_key_id", self.settings.MINIO_ACCESS_KEY], cwd=repo_path)
            await self._run(["dvc", "remote", "modify", "--local", remote_name, "secret_access_key", self.settings.MINIO_SECRET_KEY], cwd=repo_path)
        
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
    async def _run(command: list[str], *, cwd: str | None, allow_failure: bool = False, extra_env: dict | None = None) -> None:
        import os
        env = os.environ.copy()
        env["GIT_TERMINAL_PROMPT"] = "0"
        # Fallback identity so `git commit` works in headless Docker containers.
        env.setdefault("GIT_AUTHOR_NAME", "NeuralSpace")
        env.setdefault("GIT_AUTHOR_EMAIL", "noreply@neuralspace.local")
        env.setdefault("GIT_COMMITTER_NAME", "NeuralSpace")
        env.setdefault("GIT_COMMITTER_EMAIL", "noreply@neuralspace.local")
        
        if extra_env:
            env.update(extra_env)
        
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

"""
Storage Service — Orchestration layer cho Cloud Storage operations.

Không chứa logic storage cụ thể. Delegate xuống:
  - Provider Registry → StorageProvider implementations
  - TokenManager → OAuth token lifecycle
  - StorageConnectionRepository → DB operations
  - StorageAuditLogRepository → Audit trail
"""

from __future__ import annotations

import logging
import os
from collections.abc import Sequence
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.storage_exceptions import (
    CredentialExpired,
    StorageException,
    UnsupportedProvider,
)
from app.models.storage_connection import StorageConnection
from app.repositories.storage_connection_repository import StorageConnectionRepository
from app.repositories.storage_audit_log_repository import StorageAuditLogRepository
from app.repositories.sync_job_repository import SyncJobRepository
from app.schemas.storage import (
    StorageConnectRequest,
    StoragePatchRequest,
    SyncJobResponse,
)
from app.services.storage.auth.base_auth import AuthCredential
from app.services.storage.registry import get_auth_strategy, get_provider
from app.services.storage.token_manager import TokenManager
from app.services.storage.provider_interface import FileInfo, StorageQuota

logger = logging.getLogger(__name__)


class StorageService:
    """Business logic for remote storage management."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repo = StorageConnectionRepository(db)
        self.audit = StorageAuditLogRepository(db)
        self.job_repo = SyncJobRepository(db)
        self.token_manager = TokenManager(db)

    def _get_user_config_path(self, user_id: str) -> str:
        base_dir = os.environ.get("STORAGE_CONFIGS_DIR", "/storage-configs")
        return str(Path(base_dir) / user_id / "rclone.conf")

    # ── Connection Lifecycle ──────────────────────────────────────────────

    async def connect(
        self,
        user_id: str,
        request: StorageConnectRequest,
        ip_address: str | None = None,
    ) -> StorageConnection:
        """
        Kết nối storage provider dùng Access Key (S3/MinIO).
        OAuth2 providers dùng oauth_init() + oauth_callback().
        """
        config_path = self._get_user_config_path(user_id)

        # Validate & authenticate credential
        try:
            strategy = get_auth_strategy(request.provider)
        except UnsupportedProvider as e:
            raise HTTPException(status_code=400, detail=str(e))

        try:
            credential = await strategy.authenticate(request.params)
        except StorageException as e:
            raise HTTPException(status_code=e.status_code, detail=str(e))

        # Write rclone config
        try:
            provider = get_provider(request.provider)
            await provider.connect(
                connection_id="",  # Chưa có ID, config trước
                remote_name=request.remote_name,
                config_path=config_path,
                credential=credential,
            )
        except StorageException as e:
            raise HTTPException(status_code=e.status_code, detail=str(e))

        # Lưu DB
        display_name = request.display_name
        if credential.metadata.get("email"):
            display_name = f"{display_name} ({credential.metadata['email']})"

        connection = await self.repo.create(
            user_id=user_id,
            config_path=config_path,
            provider=request.provider,
            remote_name=request.remote_name,
            display_name=display_name,
            encrypted_credentials=credential.to_encrypted_blob(),
            credential_type=credential.credential_type,
            credential_expires_at=credential.expires_at,
            status="connected",
        )

        await self.audit.log(
            user_id=user_id,
            action="connect",
            connection_id=connection.id,
            metadata={"provider": request.provider, "remote_name": request.remote_name},
            ip_address=ip_address,
        )

        return connection

    async def complete_oauth_connect(
        self,
        user_id: str,
        provider: str,
        remote_name: str,
        display_name: str,
        credential: AuthCredential,
        ip_address: str | None = None,
    ) -> StorageConnection:
        """
        Hoàn tất kết nối sau OAuth2 callback.
        Gọi từ oauth_callback endpoint sau khi exchange code.
        """
        config_path = self._get_user_config_path(user_id)

        # Write rclone config
        try:
            storage_provider = get_provider(provider)
            await storage_provider.connect(
                connection_id="",
                remote_name=remote_name,
                config_path=config_path,
                credential=credential,
            )
        except StorageException as e:
            raise HTTPException(status_code=e.status_code, detail=str(e))

        # Build display name với email nếu có
        final_display_name = display_name
        if credential.metadata.get("email"):
            email = credential.metadata["email"]
            if f"({email})" not in final_display_name:
                final_display_name = f"{final_display_name} ({email})"

        connection = await self.repo.create(
            user_id=user_id,
            config_path=config_path,
            provider=provider,
            remote_name=remote_name,
            display_name=final_display_name,
            encrypted_credentials=credential.to_encrypted_blob(),
            credential_type=credential.credential_type,
            credential_expires_at=credential.expires_at,
            status="connected",
        )

        await self.audit.log(
            user_id=user_id,
            action="connect",
            connection_id=connection.id,
            metadata={"provider": provider, "auth_type": "oauth2"},
            ip_address=ip_address,
        )

        return connection

    async def disconnect(
        self,
        connection_id: str,
        user_id: str,
        ip_address: str | None = None,
    ) -> None:
        """Ngắt kết nối, revoke token, xóa config và DB row."""
        connection = await self._get_owned_connection(connection_id, user_id)

        # Revoke token (best-effort)
        if connection.encrypted_credentials and connection.credential_type == "oauth2":
            try:
                cred = AuthCredential.from_encrypted_blob(connection.encrypted_credentials)
                strategy = get_auth_strategy(connection.provider)
                await strategy.revoke(cred)
            except Exception as e:
                logger.warning(f"Token revoke failed (non-fatal): {e}")

        # Remove rclone config section
        try:
            provider = get_provider(connection.provider)
            await provider.disconnect(connection.remote_name, connection.config_path)
        except Exception as e:
            logger.warning(f"rclone config cleanup failed (non-fatal): {e}")

        await self.repo.delete(connection_id)

        await self.audit.log(
            user_id=user_id,
            action="disconnect",
            connection_id=connection_id,
            metadata={"provider": connection.provider},
            ip_address=ip_address,
        )

    async def list_connections(self, user_id: str) -> Sequence[StorageConnection]:
        return await self.repo.get_by_user_id(user_id)

    async def get_connection(
        self, connection_id: str, user_id: str, ensure_valid_token: bool = True
    ) -> StorageConnection:
        """
        Lấy connection, verify ownership, đảm bảo rclone.conf tồn tại,
        và tự động refresh token nếu cần.
        """
        connection = await self._get_owned_connection(connection_id, user_id)

        # Rebuild rclone.conf nếu bị mất (container restart)
        if connection.encrypted_credentials and not os.path.exists(connection.config_path):
            await self._rebuild_rclone_config(connection)

        # Token refresh
        if ensure_valid_token:
            try:
                connection = await self.token_manager.ensure_valid(connection)
            except CredentialExpired as e:
                raise HTTPException(
                    status_code=401,
                    detail=f"Storage credential has expired. Please reconnect. ({e})"
                )

        return connection

    async def patch_connection(
        self, connection_id: str, user_id: str, request: StoragePatchRequest
    ) -> StorageConnection:
        """Cập nhật display_name hoặc is_default."""
        connection = await self._get_owned_connection(connection_id, user_id)

        if request.display_name is not None:
            await self.repo.update_display_name(connection_id, request.display_name)

        if request.is_default is not None and request.is_default:
            await self.repo.set_default(user_id, connection_id)
        elif request.is_default is False:
            await self.repo.unset_all_defaults(user_id)

        return await self._get_owned_connection(connection_id, user_id)

    async def set_default(self, connection_id: str, user_id: str) -> StorageConnection | dict:
        """Set connection as default (backward-compat)."""
        if connection_id == "system":
            await self.repo.unset_all_defaults(user_id)
            return {"message": "System storage set as default"}

        connection = await self._get_owned_connection(connection_id, user_id)
        await self.repo.set_default(user_id, connection_id)
        return await self._get_owned_connection(connection_id, user_id)

    # ── File Operations ───────────────────────────────────────────────────

    async def list_files(
        self, connection_id: str, user_id: str, path: str = ""
    ) -> list[dict[str, Any]]:
        connection = await self.get_connection(connection_id, user_id)
        try:
            provider = get_provider(connection.provider)
            files = await provider.list_files(connection.remote_name, connection.config_path, path)
            return [
                {
                    "name": f.name,
                    "path": f.path,
                    "size": f.size,
                    "is_dir": f.is_dir,
                    "modified_at": f.modified_at.isoformat() if f.modified_at else None,
                    "mime_type": f.mime_type,
                }
                for f in files
            ]
        except StorageException as e:
            raise HTTPException(status_code=e.status_code, detail=str(e))

    async def mkdir(self, connection_id: str, user_id: str, path: str) -> None:
        connection = await self.get_connection(connection_id, user_id)
        try:
            provider = get_provider(connection.provider)
            await provider.create_folder(connection.remote_name, connection.config_path, path)
        except StorageException as e:
            raise HTTPException(status_code=e.status_code, detail=str(e))

        await self.audit.log(
            user_id=user_id,
            action="mkdir",
            connection_id=connection_id,
            resource_path=path,
        )

    async def delete_file(
        self, connection_id: str, user_id: str, path: str, is_dir: bool = False
    ) -> None:
        connection = await self.get_connection(connection_id, user_id)
        try:
            provider = get_provider(connection.provider)
            await provider.delete(connection.remote_name, connection.config_path, path, is_dir)
        except StorageException as e:
            raise HTTPException(status_code=e.status_code, detail=str(e))

        await self.audit.log(
            user_id=user_id,
            action="delete",
            connection_id=connection_id,
            resource_path=path,
        )

    async def sync(
        self, connection_id: str, user_id: str, src_path: str, dest_path: str
    ) -> None:
        connection = await self.get_connection(connection_id, user_id)

        # Normalize paths: nếu là relative path → thêm remote_name prefix
        if ":" not in src_path:
            src_path = f"{connection.remote_name}:{src_path.lstrip('/')}"
        if ":" not in dest_path:
            dest_path = f"{connection.remote_name}:{dest_path.lstrip('/')}"

        try:
            provider = get_provider(connection.provider)
            await provider.sync(
                connection.remote_name, connection.config_path, src_path, dest_path
            )
        except StorageException as e:
            raise HTTPException(status_code=e.status_code, detail=str(e))

        # Update last_sync_at
        await self.db.execute(
            __import__("sqlalchemy", fromlist=["update"]).update(StorageConnection)
            .where(StorageConnection.id == connection_id)
            .values(last_sync_at=datetime.now(timezone.utc))
        )
        await self.db.commit()

        await self.audit.log(
            user_id=user_id,
            action="sync_complete",
            connection_id=connection_id,
            metadata={"src": src_path, "dest": dest_path},
        )

    async def upload(
        self, connection_id: str, user_id: str, remote_path: str, local_path: str
    ) -> None:
        connection = await self.get_connection(connection_id, user_id)
        try:
            provider = get_provider(connection.provider)
            await provider.upload(
                connection.remote_name, connection.config_path, local_path, remote_path
            )
        except StorageException as e:
            raise HTTPException(status_code=e.status_code, detail=str(e))

        import os as _os
        file_size = _os.path.getsize(local_path) if _os.path.exists(local_path) else None
        await self.audit.log(
            user_id=user_id,
            action="upload",
            connection_id=connection_id,
            resource_path=remote_path,
            resource_size=file_size,
        )

    async def download(self, connection_id: str, user_id: str, remote_path: str) -> bytes:
        """Download và trả về bytes."""
        import asyncio
        import tempfile

        connection = await self.get_connection(connection_id, user_id)

        with tempfile.TemporaryDirectory() as tmp_dir:
            local_path = os.path.join(tmp_dir, "download")
            try:
                provider = get_provider(connection.provider)
                await provider.download(
                    connection.remote_name, connection.config_path, remote_path, local_path
                )
            except StorageException as e:
                raise HTTPException(status_code=e.status_code, detail=str(e))

            # Tìm file đã download (provider copy vào directory)
            downloaded = None
            if os.path.isfile(local_path):
                downloaded = local_path
            else:
                # rclone copy src_file dest_dir/ → tạo file trong dest_dir
                files = list(Path(tmp_dir).rglob("*"))
                for f in files:
                    if f.is_file():
                        downloaded = str(f)
                        break

            if not downloaded:
                raise HTTPException(status_code=404, detail="File not found or download failed")

            content = Path(downloaded).read_bytes()

        await self.audit.log(
            user_id=user_id,
            action="download",
            connection_id=connection_id,
            resource_path=remote_path,
            resource_size=len(content),
        )

        return content

    # ── Validation ────────────────────────────────────────────────────────

    async def validate_connection(
        self, connection_id: str, user_id: str
    ) -> dict[str, Any]:
        """Validate credential và lấy quota."""
        connection = await self._get_owned_connection(connection_id, user_id)

        provider = get_provider(connection.provider)
        valid = await provider.validate_credential(
            connection.remote_name, connection.config_path
        )

        quota = StorageQuota(total=None, used=None, free=None)
        if valid:
            quota = await provider.get_quota(connection.remote_name, connection.config_path)
            await self.repo.mark_last_validated(connection_id)

        await self.audit.log(
            user_id=user_id,
            action="validate",
            connection_id=connection_id,
            status="success" if valid else "failure",
        )

        return {
            "valid": valid,
            "total": quota.total,
            "used": quota.used,
            "free": quota.free,
            "validated_at": datetime.now(timezone.utc).isoformat(),
        }

    # ── DVC ───────────────────────────────────────────────────────────────

    async def configure_dvc_remote(
        self,
        connection_id: str,
        user_id: str,
        dvc_profile_id: str,
        base_path: str = "dvc-data",
        set_as_default: bool = False,
    ) -> dict[str, str]:
        """Cấu hình DVC remote trỏ vào storage connection này."""
        from app.services.storage.dvc_adapter import DVCStorageAdapter
        from app.services.dvc_profile_service import DVCProfileService
        from app.config import get_settings

        connection = await self.get_connection(connection_id, user_id)

        dvc_service = DVCProfileService(self.db, get_settings())
        from app.dependencies import UserContext
        user_ctx = UserContext(user_id=user_id, email="", roles=[])
        profile = await dvc_service.resolve_for_dataset(
            dataset=None,  # type: ignore
            user=user_ctx,
            requested_profile_id=dvc_profile_id,
        )

        adapter = DVCStorageAdapter()
        remote_name = await adapter.configure_dvc_remote(
            repo_path=profile.repo_path,
            connection=connection,
            base_path=base_path,
            set_as_default=set_as_default,
        )

        return {"dvc_remote_name": remote_name, "repo_path": profile.repo_path}

    # ── Sync Jobs ─────────────────────────────────────────────────────────

    async def create_sync_job(
        self,
        user_id: str,
        job_type: str,
        connection_id: str | None = None,
        source_path: str | None = None,
        dest_path: str | None = None,
        params: dict | None = None,
    ) -> SyncJobResponse:
        """Tạo background sync job."""
        job = await self.job_repo.create(
            user_id=user_id,
            job_type=job_type,
            connection_id=connection_id,
            source_path=source_path,
            dest_path=dest_path,
            params=params,
        )
        return SyncJobResponse.model_validate(job)

    async def get_sync_job(self, job_id: str, user_id: str) -> SyncJobResponse:
        job = await self.job_repo.get_by_id(job_id, user_id)
        if not job:
            raise HTTPException(status_code=404, detail="Sync job not found")
        return SyncJobResponse.model_validate(job)

    # ── Internal Helpers ──────────────────────────────────────────────────

    async def _get_owned_connection(
        self, connection_id: str, user_id: str
    ) -> StorageConnection:
        connection = await self.repo.get_by_id(connection_id)
        if not connection:
            raise HTTPException(status_code=404, detail="Storage connection not found")
        if str(connection.user_id) != user_id:
            raise HTTPException(status_code=403, detail="Not authorized")
        return connection

    async def _rebuild_rclone_config(self, connection: StorageConnection) -> None:
        """Tái tạo rclone.conf từ encrypted_credentials khi file bị mất."""
        import configparser

        try:
            cred = AuthCredential.from_encrypted_blob(connection.encrypted_credentials)
            config_path = connection.config_path
            os.makedirs(os.path.dirname(config_path), exist_ok=True)

            config = configparser.ConfigParser()
            if os.path.exists(config_path):
                config.read(config_path)

            if not config.has_section(connection.remote_name):
                config.add_section(connection.remote_name)

            config.set(connection.remote_name, "type", connection.provider)
            for key, value in cred.raw_params.items():
                config.set(connection.remote_name, key, str(value))

            with open(config_path, "w") as f:
                config.write(f)

            logger.info(
                "Rebuilt rclone config from encrypted credentials",
                connection_id=connection.id,
            )
        except Exception as e:
            logger.error(f"Failed to rebuild rclone config: {e}", connection_id=connection.id)

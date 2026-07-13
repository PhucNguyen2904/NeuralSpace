"""Pydantic schemas for storage endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


# ── Connect Requests ─────────────────────────────────────────────────────────

class StorageConnectRequest(BaseModel):
    """Request schema cho kết nối storage key-based (S3, MinIO, R2)."""

    provider: str = Field(..., description="Provider type: 's3', 'minio', 'r2'")
    remote_name: str = Field(..., description="Unique remote name trong rclone config")
    display_name: str = Field(..., description="Tên hiển thị cho người dùng")
    params: dict[str, str] = Field(..., description="Configuration params: access_key_id, secret_access_key, ...")


class OAuthInitRequest(BaseModel):
    """Request khởi tạo OAuth2 flow."""

    provider: str = Field(..., description="OAuth2 provider: 'drive', 'onedrive', 'dropbox'")
    remote_name: str = Field(..., description="Unique remote name")
    display_name: str = Field(..., description="Tên hiển thị")


class OAuthInitResponse(BaseModel):
    """Response chứa auth_url để frontend redirect user."""

    state: str
    auth_url: str
    provider: str
    expires_in: int = 600  # 10 phút để hoàn thành flow


class StoragePatchRequest(BaseModel):
    """PATCH request để cập nhật connection metadata."""

    display_name: str | None = None
    is_default: bool | None = None


# ── Connection Response ───────────────────────────────────────────────────────

class StorageConnectionResponse(BaseModel):
    """Response schema cho một storage connection."""

    id: str
    user_id: str
    provider: str
    remote_name: str
    display_name: str
    status: str
    status_message: str | None = None
    is_default: bool
    credential_type: str | None = None
    credential_expires_at: datetime | None = None
    last_sync_at: datetime | None = None
    last_validated_at: datetime | None = None
    total_bytes_synced: int = 0
    created_at: datetime
    updated_at: datetime

    # Chỉ có trong response khi vừa khởi tạo OAuth flow
    auth_url: str | None = None

    class Config:
        from_attributes = True


# ── Quota ────────────────────────────────────────────────────────────────────

class StorageQuotaResponse(BaseModel):
    """Thông tin dung lượng storage."""

    valid: bool
    total: int | None = None
    used: int | None = None
    free: int | None = None
    validated_at: datetime


# ── File Operations ──────────────────────────────────────────────────────────

class FileItem(BaseModel):
    """Thông tin file/thư mục — normalized output."""

    name: str
    path: str
    size: int
    is_dir: bool
    modified_at: datetime | None = None
    mime_type: str | None = None


class StorageMkdirRequest(BaseModel):
    path: str = Field(..., description="Path của thư mục mới")


class StorageSyncRequest(BaseModel):
    src_path: str = Field(..., description="Source path (local hoặc remote:path)")
    dest_path: str = Field(..., description="Destination path")
    async_: bool = Field(False, alias="async", description="Chạy async (background job)")


class StorageDeleteRequest(BaseModel):
    path: str
    is_dir: bool = False


# ── DVC Operations ───────────────────────────────────────────────────────────

class DVCConfigureRequest(BaseModel):
    """Cấu hình DVC remote trỏ vào storage connection."""

    dvc_profile_id: str = Field(..., description="DVCProfile ID")
    base_path: str = Field("dvc-data", description="Base path trong remote storage")
    set_as_default: bool = Field(False, description="Set làm DVC remote mặc định")


class DVCOperationRequest(BaseModel):
    """Request cho DVC push/pull/fetch."""

    dvc_profile_id: str
    targets: list[str] | None = Field(None, description="DVC file targets (None = all)")
    jobs: int = Field(4, ge=1, le=32, description="Số parallel jobs")
    async_: bool = Field(True, alias="async", description="Chạy background")


# ── Sync Jobs ────────────────────────────────────────────────────────────────

class SyncJobResponse(BaseModel):
    """Response cho sync job."""

    id: str
    job_type: str
    status: str
    progress_pct: int | None = None
    bytes_transferred: int | None = None
    files_transferred: int | None = None
    error_message: str | None = None
    result_summary: dict | None = None
    scheduled_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime

    class Config:
        from_attributes = True


# ── Audit Logs ───────────────────────────────────────────────────────────────

class AuditLogResponse(BaseModel):
    """Audit log entry response."""

    id: str
    action: str
    resource_path: str | None = None
    resource_size: int | None = None
    status: str
    error_code: str | None = None
    error_message: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True

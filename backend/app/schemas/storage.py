"""Pydantic schemas for storage endpoints."""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class StorageConnectRequest(BaseModel):
    """Request schema for connecting to a new storage provider."""
    provider: str = Field(..., description="Provider type (e.g., gdrive, s3, dropbox)")
    remote_name: str = Field(..., description="Unique name for the remote")
    display_name: str = Field(..., description="User-friendly name for the remote")
    params: dict[str, str] = Field(..., description="Configuration parameters for rclone")


class StorageConnectionResponse(BaseModel):
    """Response schema for a storage connection."""
    id: str
    user_id: str
    provider: str
    remote_name: str
    display_name: str
    status: str
    is_default: bool
    last_sync_at: datetime | None = None
    auth_url: str | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class FileItem(BaseModel):
    """Schema for a file or directory item returned by lsjson."""
    Path: str
    Name: str
    Size: int
    MimeType: str
    ModTime: str
    IsDir: bool


class StorageMkdirRequest(BaseModel):
    """Request schema for creating a directory."""
    path: str = Field(..., description="Path of the new directory")


class StorageSyncRequest(BaseModel):
    """Request schema for syncing files."""
    src_path: str = Field(..., description="Source path")
    dest_path: str = Field(..., description="Destination path")

"""Storage Provider schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field

class StorageProviderBase(BaseModel):
    name: str = Field(..., max_length=255)
    type: Literal["minio", "s3", "gdrive"]
    config: dict[str, Any]
    is_active: bool = True

class StorageProviderCreate(StorageProviderBase):
    pass

class StorageProviderUpdate(BaseModel):
    name: str | None = Field(None, max_length=255)
    config: dict[str, Any] | None = None
    is_active: bool | None = None

class StorageProviderResponse(StorageProviderBase):
    id: str
    created_by: str | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

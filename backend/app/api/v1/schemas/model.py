"""Model API schemas."""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class ModelResponse(BaseModel):
    """Response schema for model endpoints."""
    id: str
    name: str
    source_type: str
    source_identifier: str
    storage_path: Optional[str]
    sha256: Optional[str]
    size_bytes: Optional[int]
    status: str
    tags: list[str]
    metadata: dict
    created_at: datetime
    updated_at: datetime
    last_used_at: Optional[datetime]

    class Config:
        from_attributes = True


class ModelListResponse(BaseModel):
    """Response schema for GET /models (list)."""
    items: list[ModelResponse]
    total: int
    skip: int
    limit: int


class DeleteModelRequest(BaseModel):
    """Request schema for DELETE /models/{model_id}."""
    delete_files: bool = Field(
        default=False,
        description="Whether to delete physical files from storage"
    )

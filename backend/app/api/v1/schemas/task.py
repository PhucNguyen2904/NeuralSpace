"""Task API schemas."""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class DownloadRequest(BaseModel):
    """Request schema for POST /models/download."""
    source_type: str = Field(
        ...,
        description="Source type: 'huggingface', 'github_release', or 'direct_url'"
    )
    source_identifier: str = Field(
        ...,
        description=(
            "Source identifier: 'org/model' for HF, 'owner/repo/tag' for GitHub, "
            "or URL for direct_url"
        )
    )
    revision: str = Field(
        default="main",
        description="Git revision (branch/tag/commit) - for HF only"
    )
    file_patterns: list[str] = Field(
        default=[],
        description="Glob patterns to filter files (empty = all files)"
    )
    hf_token: Optional[str] = Field(
        default=None,
        description="HuggingFace token for private repos"
    )
    priority: int = Field(
        default=1,
        ge=1,
        le=10,
        description="Download priority (1-10, higher = more urgent)"
    )
    tags: list[str] = Field(
        default=[],
        description="Tags to attach to the model"
    )


class DownloadResponse(BaseModel):
    """Response schema for POST /models/download (202 Accepted)."""
    task_id: str
    status: str
    created_at: datetime
    poll_url: str
    estimated_size_bytes: Optional[int]

    class Config:
        from_attributes = True


class TaskStatusResponse(BaseModel):
    """Response schema for GET /tasks/{task_id}."""
    task_id: str
    status: str
    progress_pct: int
    downloaded_bytes: int
    total_bytes: Optional[int]
    speed_bps: Optional[int]
    eta_seconds: Optional[int]
    current_file: Optional[str]
    model_id: Optional[str]
    error_code: Optional[str]
    error_message: Optional[str]
    retry_count: int
    max_retries: int
    created_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    updated_at: datetime

    model_config = {
        "from_attributes": True,
        "protected_namespaces": (),
    }

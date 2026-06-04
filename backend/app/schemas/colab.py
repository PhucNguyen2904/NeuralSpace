"""Schemas for Google Colab launch/bootstrap APIs."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class ColabLaunchResponse(BaseModel):
    """Response payload for Colab launch."""

    launch_url: str
    session_id: str
    expires_in: int


class ColabBootstrapRequest(BaseModel):
    """Notebook bootstrap request payload."""

    token: str = Field(min_length=1)


class ColabDatasetPayload(BaseModel):
    """Dataset payload returned to Colab runtime."""

    dataset_id: str
    name: str
    signed_url: str


class ColabBootstrapResponse(BaseModel):
    """Validated runtime config payload for Colab notebook."""

    session_id: str
    workspace_id: str
    user_id: str
    runtime_token: str
    capabilities: list[str]
    expires_at: datetime
    datasets: list[ColabDatasetPayload]


class RuntimeSessionResponse(BaseModel):
    session_id: str
    workspace_id: str
    provider: str
    status: str
    capabilities: list[str]
    connected_at: datetime | None = None
    last_heartbeat_at: datetime | None = None
    expires_at: datetime


class WorkspaceSessionDashboardResponse(BaseModel):
    session_status: str
    session_last_seen: datetime | None = None
    run_id: str | None = None
    run_status: str | None = None
    run_started_at: datetime | None = None
    run_last_reported: datetime | None = None
    metrics: list[dict] = Field(default_factory=list)
    logs: list[dict] = Field(default_factory=list)
    artifacts: list[dict] = Field(default_factory=list)
    model_version: str | None = None


class RuntimeHeartbeatResponse(BaseModel):
    session_id: str
    status: str
    expires_at: datetime


class RuntimeValuesRequest(BaseModel):
    values: dict[str, float | int | str | bool]


class ArtifactUploadGrantRequest(BaseModel):
    run_id: str
    filename: str = Field(min_length=1, max_length=255)


class ArtifactUploadGrantResponse(BaseModel):
    object_path: str
    upload_url: str
    expires_in: int


class RuntimeModelVersionRequest(BaseModel):
    run_id: str
    name: str = Field(min_length=1, max_length=255)
    artifact_path: str = Field(min_length=1, max_length=500)
    framework: str | None = Field(default=None, max_length=50)
    task_type: str | None = Field(default=None, max_length=50)
    metrics: dict[str, float | int] = Field(default_factory=dict)


class RuntimeModelVersionResponse(BaseModel):
    model_version_id: str
    name: str
    version: int
    status: str

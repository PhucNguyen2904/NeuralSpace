"""Schemas for Google Colab launch/bootstrap APIs."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class ColabClaimResponse(BaseModel):
    """Response payload for a user-entered one-time claim."""

    claim_code: str
    notebook_url: str
    session_id: str
    expires_in: int


class ColabClaimExchangeRequest(BaseModel):
    """Notebook claim exchange payload."""

    claim_code: str = Field(min_length=1, max_length=64)


class ColabDatasetPayload(BaseModel):
    """Dataset payload returned to Colab runtime."""

    dataset_id: str
    name: str
    signed_url: str | None = None


class ColabModelPayload(BaseModel):
    """Model payload returned to Colab runtime."""

    model_id: str
    name: str
    version: str | None = None
    framework: str | None = None
    task_type: str | None = None
    signed_url: str | None = None


class ColabAssetsResponse(BaseModel):
    """Current workspace assets visible to the Colab runtime."""

    datasets: list[ColabDatasetPayload] = Field(default_factory=list)
    models: list[ColabModelPayload] = Field(default_factory=list)


class ColabBootstrapResponse(BaseModel):
    """Validated runtime config payload for Colab notebook."""

    session_id: str
    runtime_token: str
    capabilities: list[str]
    expires_at: datetime
    datasets: list[ColabDatasetPayload]
    models: list[ColabModelPayload] = Field(default_factory=list)


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


class RuntimeRunAssetRequest(BaseModel):
    asset_type: str = Field(pattern="^(dataset|model|artifact)$")
    asset_id: str = Field(min_length=1, max_length=255)
    role: str = Field(default="input", min_length=1, max_length=80)


class RuntimeRunCreateRequest(BaseModel):
    name: str = Field(default="Colab test run", min_length=1, max_length=255)
    inputs: list[RuntimeRunAssetRequest] = Field(default_factory=list)
    outputs: list[RuntimeRunAssetRequest] = Field(default_factory=list)


class RuntimeRunResponse(BaseModel):
    run_id: str
    status: str
    started_at: datetime


class RuntimeRunFinishRequest(BaseModel):
    status: str = Field(default="success", pattern="^(success|failed|killed|FINISHED|FAILED|KILLED|RUNNING)$")


class RuntimeLogRequest(BaseModel):
    level: str = Field(default="INFO", pattern="^(DEBUG|INFO|WARN|ERROR)$")
    message: str = Field(min_length=1, max_length=4000)


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

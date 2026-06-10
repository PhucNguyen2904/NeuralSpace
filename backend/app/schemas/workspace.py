"""Pydantic schemas for workspace APIs."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.workspace import WorkspaceStatus

PACKAGE_NAME_REGEX = re.compile(r"^[a-zA-Z0-9_\-]+$")


class WorkspaceEnvironmentConfig(BaseModel):
    """Environment config for workspace startup."""

    python_version: Literal["3.10", "3.11", "3.12"] = "3.11"
    extra_packages: list[str] = Field(default_factory=list, max_length=20)

    @field_validator("extra_packages")
    @classmethod
    def validate_extra_packages(cls, value: list[str]) -> list[str]:
        for package in value:
            if not PACKAGE_NAME_REGEX.match(package):
                raise ValueError(f"Invalid package name: {package}")
        return value


class WorkspaceCreateRequest(BaseModel):
    """Create a reusable project context for external runtimes."""

    name: str = Field(min_length=3, max_length=255)
    tier: Literal["external-colab"] = "external-colab"
    dataset_ids: list[str] = Field(default_factory=list, max_length=10)
    model_ids: list[str] = Field(default_factory=list, max_length=10)
    environment: WorkspaceEnvironmentConfig = Field(default_factory=WorkspaceEnvironmentConfig)


class WorkspaceAssetsUpdateRequest(BaseModel):
    """Replace datasets and models attached to a workspace context."""

    dataset_ids: list[str] = Field(default_factory=list, max_length=10)
    model_ids: list[str] = Field(default_factory=list, max_length=10)


class WorkspaceStopRequest(BaseModel):
    """Stop workspace request payload."""

    save_notebooks: bool = True


class WorkspaceStatusResponse(BaseModel):
    """Workspace status payload."""

    workspace_id: str
    status: WorkspaceStatus
    access_url: str | None = None
    started_at: datetime | None = None
    stopped_at: datetime | None = None
    last_heartbeat: datetime | None = None
    auto_kill_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class WorkspaceDetailResponse(BaseModel):
    """Detailed workspace payload."""

    id: str
    user_id: str
    name: str | None = None
    status: WorkspaceStatus
    tier: str
    k8s_namespace: str | None = None
    k8s_pod_name: str | None = None
    pod_ip: str | None = None
    access_url: str | None = None
    dataset_ids: list[str] = Field(default_factory=list)
    model_ids: list[str] = Field(default_factory=list)
    environment_config: dict[str, Any] = Field(default_factory=dict)
    resource_config: dict[str, Any] = Field(default_factory=dict)
    resource_usage: dict[str, Any] = Field(default_factory=dict)
    started_at: datetime | None = None
    stopped_at: datetime | None = None
    last_heartbeat: datetime | None = None
    last_kernel_activity: datetime | None = None
    auto_kill_at: datetime | None = None
    error_message: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class WorkspaceListResponse(BaseModel):
    """Paginated workspace list payload."""

    items: list[WorkspaceDetailResponse]
    total: int
    limit: int
    offset: int


class WorkspaceTokenResponse(BaseModel):
    """Workspace token payload."""

    ws_token: str
    expires_in: int
    websocket_url: str


class HeartbeatResponse(BaseModel):
    """Heartbeat response payload."""

    workspace_id: str | None = None
    next_kill_at: datetime | None = None
    message: str = "Session extended"


class WorkspaceCreateAcceptedResponse(BaseModel):
    """Created project context response."""

    workspace_id: str
    status: WorkspaceStatus
    estimated_ready_in_seconds: int = 0
    poll_url: str


class WorkspaceStatusPollResponse(BaseModel):
    """Lightweight polling response."""

    workspace_id: str
    status: WorkspaceStatus
    access_url: str | None = None
    created_at: datetime
    idle_since: datetime | None = None
    auto_kill_at: datetime | None = None
    resource_usage: dict[str, Any] = Field(default_factory=dict)


class WorkspaceOperationResponse(BaseModel):
    """Generic operation response."""

    workspace_id: str
    status: WorkspaceStatus
    message: str

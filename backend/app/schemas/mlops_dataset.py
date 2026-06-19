from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class DatasetCreateRequest(BaseModel):
    name: str = Field(..., examples=["customer-churn-dataset"])
    description: str | None = Field(default=None, examples=["Monthly snapshot for churn modeling"])
    type: Literal["image", "tabular", "text", "audio", "video", "custom"] = Field(..., examples=["tabular"])
    team_id: str | None = Field(default=None, examples=["de305d54-75b4-431b-adb2-eb6b9e546014"])
    dvc_profile_id: str | None = Field(default=None, examples=["2f0d7d4c-7fd3-44ec-9e4a-5b32d43ad51e"])
    dvc_repo_url: str | None = Field(default=None, examples=["https://git.internal/mlops-data.git"])
    storage_path: str | None = Field(default=None, examples=["datasets/customer-churn"])
    tags: list[str] = Field(default_factory=list, examples=[["pii-redacted", "gold"]])


class DatasetUpdateRequest(BaseModel):
    description: str | None = None
    tags: list[str] | None = None
    status: Literal["active", "archived", "deprecated"] | None = None


class DatasetVersionTrackRequest(BaseModel):
    local_path: str = Field(..., examples=["/data/staging/customer-churn-v2.csv"])
    dataset_name: str = Field(..., examples=["datasets/customer-churn"])
    commit_message: str = Field(..., examples=["feat(data): add april snapshot"])
    changelog: str = Field(default="", examples=["Added 20k rows from CRM export"])


class DatasetVersionPatchRequest(BaseModel):
    changelog: str | None = None
    status: Literal["draft", "validated", "deprecated"] | None = None


class DatasetPullRequest(BaseModel):
    workspace_path: str = Field(..., examples=["/workspace/datasets/customer-churn"])


class DatasetResponse(BaseModel):
    id: str
    name: str
    description: str | None = None
    type: str
    owner_id: str
    team_id: str | None = None
    dvc_profile_id: str | None = None
    dvc_repo_url: str | None = None
    storage_path: str | None = None
    tags: list[str] = Field(default_factory=list)
    status: str
    created_at: datetime
    updated_at: datetime


class DatasetListResponse(BaseModel):
    items: list[DatasetResponse]
    total: int
    page: int
    page_size: int


class DatasetVersionResponse(BaseModel):
    id: str
    dataset_id: str
    version: str
    dvc_md5: str | None = None
    dvc_commit: str | None = None
    dvc_profile_id: str | None = None
    storage_path: str | None = None
    size_bytes: int | None = None
    item_count: int | None = None
    split_info: dict[str, Any] | None = None
    schema_snapshot: dict[str, Any] | None = None
    metadata_uri: str | None = None
    validation_report_uri: str | None = None
    validation_status: str | None = None
    validation_summary: dict[str, Any] | None = None
    metadata_snapshot: dict[str, Any] | None = None
    format: str | None = None
    task_type: str | None = None
    changelog: str | None = None
    is_latest: bool
    status: str
    created_by: str
    created_at: datetime


class DatasetVersionTrackResponse(BaseModel):
    """Response schema for POST /datasets/{id}/versions/track."""

    id: str
    dataset_id: str
    version: str
    dvc_md5: str | None = None
    dvc_commit: str | None = None
    dvc_profile_id: str | None = None
    storage_path: str | None = None
    size_bytes: int | None = None
    item_count: int | None = None
    split_info: dict[str, Any] | None = None
    schema_snapshot: dict[str, Any] | None = None
    metadata_uri: str | None = None
    validation_report_uri: str | None = None
    validation_status: str | None = None
    validation_summary: dict[str, Any] | None = None
    metadata_snapshot: dict[str, Any] | None = None
    format: str | None = None
    task_type: str | None = None
    changelog: str | None = None
    is_latest: bool
    status: str
    created_by: str
    created_at: datetime


class DatasetVersionListResponse(BaseModel):
    items: list[DatasetVersionResponse]


class IntegrityValidationResponse(BaseModel):
    is_valid: bool
    checked_at: datetime
    details: dict[str, Any]


class LineageResponse(BaseModel):
    dataset_version: DatasetVersionResponse
    runs: list[dict[str, Any]]
    model_versions: list[dict[str, Any]]


class DatasetPullResponse(BaseModel):
    workspace_path: str
    size_bytes: int


class AsyncAcceptedResponse(BaseModel):
    task_id: str
    status: str = "queued"


class TaskStatusResponse(BaseModel):
    task_id: str
    status: str
    result: dict[str, Any] | None = None
    error: str | None = None


class DVCProfileCreateRequest(BaseModel):
    name: str = Field(..., examples=["Team A DVC"])
    scope: Literal["global", "team", "user", "workspace"] = "global"
    scope_id: str | None = Field(default=None, examples=["ws_ab123"])
    repo_mode: Literal["managed_git", "existing_path"] = "managed_git"
    git_repo_url: str | None = Field(default=None, examples=["https://github.com/company/team-a-dvc.git"])
    git_branch: str = Field(default="main", examples=["main"])
    repo_path: str | None = Field(default=None, examples=["/srv/dvc-repos/team-a"])
    remote_name: str = Field(default="minio", examples=["minio"])
    remote_url: str | None = Field(default=None, examples=["s3://dvc-data/team-a"])
    endpoint_url: str | None = Field(default=None, examples=["http://minio:9000"])
    is_default: bool = False


class DVCProfilePatchRequest(BaseModel):
    name: str | None = None
    status: Literal["ready", "inactive"] | None = None
    is_default: bool | None = None


class DVCProfileResponse(BaseModel):
    id: str
    name: str
    scope: str
    scope_id: str | None = None
    repo_mode: str = "managed_git"
    git_repo_url: str | None = None
    git_branch: str = "main"
    repo_path: str
    remote_name: str
    remote_url: str | None = None
    endpoint_url: str | None = None
    is_default: bool
    status: str
    status_message: str | None = None
    is_environment_default: bool = False

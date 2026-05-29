from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class DatasetCreateRequest(BaseModel):
    name: str = Field(..., examples=["customer-churn-dataset"])
    description: str | None = Field(default=None, examples=["Monthly snapshot for churn modeling"])
    type: Literal["image", "tabular", "text", "audio", "video"] = Field(..., examples=["tabular"])
    team_id: str | None = Field(default=None, examples=["de305d54-75b4-431b-adb2-eb6b9e546014"])
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
    storage_path: str | None = None
    size_bytes: int | None = None
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

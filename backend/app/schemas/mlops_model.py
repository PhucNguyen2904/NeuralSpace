from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class PromoteRequest(BaseModel):
    target_stage: Literal["Staging", "Production"] = Field(..., examples=["Production"])
    reason: str = Field(..., examples=["Passed offline and canary evaluation"])
    notify_team: bool = Field(default=True)


class RollbackRequest(BaseModel):
    reason: str = Field(..., examples=["High latency regression in production"])


class ApprovalActionRequest(BaseModel):
    note: str = Field(..., examples=["All checks passed, approved for rollout"])


class PromoteResponse(BaseModel):
    approval_request_id: str | None = None
    status: Literal["pending", "auto_approved"]


class ModelVersionResponse(BaseModel):
    id: str
    model_name: str
    version: int
    run_id: str
    stage: str
    status: str
    created_by: str
    created_at: datetime
    updated_at: datetime
    metrics: dict[str, Any] | None = None
    tags: dict[str, Any] | None = None


class ModelResponse(BaseModel):
    model_name: str
    versions: list[ModelVersionResponse]


class ModelListResponse(BaseModel):
    items: list[str]
    total: int


class RollbackResponse(BaseModel):
    rolled_back_version: int
    restored_version: int


class ModelLineageResponse(BaseModel):
    model_version: dict[str, Any]
    training_run: dict[str, Any]
    dataset_versions: list[dict[str, Any]]


class ModelAuditResponse(BaseModel):
    items: list[dict[str, Any]]


class ApprovalActionResponse(BaseModel):
    request_id: str
    status: str

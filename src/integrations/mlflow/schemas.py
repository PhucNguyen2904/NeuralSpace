"""Pydantic models for MLflow integration."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel


class MLflowExperiment(BaseModel):
    experiment_id: str
    name: str
    lifecycle_stage: str = "active"
    artifact_location: str | None = None
    tags: dict[str, Any] = {}


class MLflowRun(BaseModel):
    run_id: str
    experiment_id: str
    status: str
    start_time: datetime | None = None
    end_time: datetime | None = None
    artifact_uri: str | None = None
    tags: dict[str, str] = {}
    metrics: dict[str, float] = {}
    params: dict[str, str] = {}


class RegisteredModelVersion(BaseModel):
    name: str
    version: int
    current_stage: str = "None"
    status: str = "READY"
    run_id: str | None = None
    source: str | None = None
    tags: dict[str, str] = {}
    description: str = ""


class TagValidationResult(BaseModel):
    is_valid: bool
    missing_tags: list[str]
    invalid_tags: list[str]


class SyncReport(BaseModel):
    synced_runs: int = 0
    synced_models: int = 0
    errors: list[str] = []


class MLflowWebhookPayload(BaseModel):
    event: str
    timestamp: int | None = None
    model_name: str | None = None
    version: str | None = None
    to_stage: str | None = None
    from_stage: str | None = None
    data: dict[str, Any] = {}

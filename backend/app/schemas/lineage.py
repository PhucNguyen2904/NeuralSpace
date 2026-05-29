"""Pydantic schemas for lineage graph and reproducibility responses."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class LineageNode(BaseModel):
    id: str
    type: Literal["dataset_version", "run", "model_version"]
    label: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    status: str | None = None


class LineageEdge(BaseModel):
    source: str = Field(..., alias="from")
    target: str = Field(..., alias="to")
    label: str
    metadata: dict[str, Any] = Field(default_factory=dict)

    model_config = {"populate_by_name": True}


class DatasetLineageGraph(BaseModel):
    dataset_version: dict[str, Any]
    runs: list[dict[str, Any]]
    model_versions: list[dict[str, Any]]


class ModelLineageGraph(BaseModel):
    model_version: dict[str, Any]
    training_run: dict[str, Any]
    dataset_versions: list[dict[str, Any]]


class LineageGraph(BaseModel):
    nodes: list[LineageNode]
    edges: list[LineageEdge]


class ImpactedModel(BaseModel):
    model_name: str
    model_version: int
    stage: str
    trained_at: datetime | None = None
    accuracy: float | None = None
    risk_level: Literal["high", "medium", "low"]


class ImpactAnalysisRequest(BaseModel):
    dataset_version_id: str
    check_production_only: bool = True


class ReproducibilityReport(BaseModel):
    is_reproducible: bool
    checks: dict[str, bool]
    missing_items: list[str]
    reproduction_steps: list[str]

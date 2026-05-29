"""Schemas for Google Colab launch/bootstrap APIs."""

from __future__ import annotations

from pydantic import BaseModel, Field


class ColabLaunchResponse(BaseModel):
    """Response payload for Colab launch."""

    launch_url: str
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

    workspace_id: str
    user_id: str
    datasets: list[ColabDatasetPayload]

"""MLflow integration configuration."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.config import get_settings


class MLflowConfig(BaseModel):
    tracking_uri: str = Field(default="http://localhost:5000")
    artifact_bucket: str = Field(default="mlflow-artifacts")
    stage_transition_timeout_seconds: int = Field(default=60)
    stage_transition_poll_seconds: int = Field(default=2)
    webhook_secret: str = Field(default="")


def get_mlflow_config() -> MLflowConfig:
    settings = get_settings()
    return MLflowConfig(
        tracking_uri=getattr(settings, "MLFLOW_TRACKING_URI", "http://localhost:5000"),
        artifact_bucket=getattr(settings, "MLFLOW_ARTIFACT_BUCKET", "mlflow-artifacts"),
        webhook_secret=getattr(settings, "MLFLOW_WEBHOOK_SECRET", ""),
    )

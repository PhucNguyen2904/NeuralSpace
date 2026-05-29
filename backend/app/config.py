"""Application configuration using Pydantic Settings."""

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Basic
    ENVIRONMENT: Literal["development", "staging", "production"] = "development"
    LOG_LEVEL: str = "INFO"

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/cloud_ide"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # Security
    SECRET_KEY: str = "your-secret-key-change-me-to-min-32-chars-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # Kubernetes
    KUBERNETES_IN_CLUSTER: bool = False
    KUBERNETES_NAMESPACE_PREFIX: str = "ws-"

    # Jupyter
    JUPYTER_BASE_IMAGE: str = "registry.platform.com/jupyter-base:latest"

    # MinIO
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_BUCKET: str = "workspace-data"

    # Upstream module
    UPSTREAM_BASE_URL: str = "http://localhost:9000"

    # Workspace Configuration
    MAX_WORKSPACES_PER_USER: int = 2
    IDLE_TIMEOUT_SECONDS: int = 1800

    # API Docs
    DOCS_URL: str | None = "/docs"
    REDOC_URL: str | None = "/redoc"
    OPENAPI_URL: str | None = "/openapi.json"

    # CORS Origins (comma-separated)
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:8000"
    COLAB_NOTEBOOK_GITHUB_URL: str = ""
    COLAB_LAUNCH_TOKEN_EXPIRE_MINUTES: int = 10
    COLAB_DATA_URL_EXPIRE_SECONDS: int = 900
    MLFLOW_TRACKING_URI: str = "http://localhost:5000"
    MLFLOW_ARTIFACT_BUCKET: str = "mlflow-artifacts"
    MLFLOW_WEBHOOK_SECRET: str = ""

    class Config:
        """Pydantic config."""

        env_file = ".env"
        case_sensitive = True

    def __init__(self, **data):
        """Initialize settings with environment-based docs visibility."""
        super().__init__(**data)
        # Override docs URLs based on environment
        if self.ENVIRONMENT != "development":
            self.DOCS_URL = None
            self.REDOC_URL = None
            self.OPENAPI_URL = None

    def get_cors_origins(self) -> list[str]:
        """Parse CORS origins from comma-separated string."""
        if isinstance(self.CORS_ORIGINS, str):
            return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]
        return self.CORS_ORIGINS


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()

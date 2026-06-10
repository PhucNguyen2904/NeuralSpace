"""Application configuration using Pydantic Settings."""

from functools import lru_cache
import re
from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True, extra="ignore")

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

    # MinIO
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_PUBLIC_ENDPOINT: str = "localhost:9000"
    MINIO_PUBLIC_SECURE: bool = False
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_BUCKET: str = "workspace-data"

    # Upstream module
    UPSTREAM_BASE_URL: str = "http://localhost:9000"

    # API Docs
    DOCS_URL: str | None = "/docs"
    REDOC_URL: str | None = "/redoc"
    OPENAPI_URL: str | None = "/openapi.json"

    # CORS Origins (comma-separated)
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:8000"
    PUBLIC_API_BASE_URL: str = "http://localhost:8000/api/v1"
    COLAB_TEMPLATE_ORGANIZATION: str = "neuralspace-ai"
    COLAB_TEMPLATE_REPOSITORY: str = "colab-templates"
    COLAB_TEMPLATE_REF: str = "main"
    COLAB_TEMPLATE_NOTEBOOK_PATH: str = "notebooks/bootstrap.ipynb"
    COLAB_CLAIM_EXPIRE_SECONDS: int = 120
    COLAB_RUNTIME_TOKEN_EXPIRE_MINUTES: int = 480
    COLAB_DATA_URL_EXPIRE_SECONDS: int = 900
    MLFLOW_TRACKING_URI: str = "http://localhost:5000"
    MLFLOW_ARTIFACT_BUCKET: str = "mlflow-artifacts"
    MLFLOW_WEBHOOK_SECRET: str = ""

    # DVC – local git+dvc working directory used for dataset tracking
    # Must be a path to an already-initialised `git init && dvc init` repo.
    DVC_REPO_PATH: str = "/srv/dvc-repo"
    DVC_REMOTE_NAME: str = "minio"

    def __init__(self, **data):
        """Initialize settings with environment-based docs visibility."""
        super().__init__(**data)
        # Override docs URLs based on environment
        if self.ENVIRONMENT != "development":
            self.DOCS_URL = None
            self.REDOC_URL = None
            self.OPENAPI_URL = None

    @model_validator(mode="after")
    def validate_colab_template_ref(self):
        ref = self.COLAB_TEMPLATE_REF.strip()
        if not re.fullmatch(r"[A-Za-z0-9._/-]+", ref):
            raise ValueError("COLAB_TEMPLATE_REF contains invalid characters")
        if self.ENVIRONMENT == "production":
            is_commit_sha = bool(re.fullmatch(r"[0-9a-fA-F]{40}", ref))
            is_release_tag = bool(
                re.fullmatch(r"(?:v?\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?|release[-/][A-Za-z0-9._-]+)", ref)
            )
            if not is_commit_sha and not is_release_tag:
                raise ValueError("COLAB_TEMPLATE_REF must be a commit SHA or release tag in production")
            if not self.PUBLIC_API_BASE_URL.startswith("https://"):
                raise ValueError("PUBLIC_API_BASE_URL must use HTTPS in production")
        return self

    def get_colab_notebook_url(self) -> str:
        organization = self.COLAB_TEMPLATE_ORGANIZATION.strip("/")
        repository = self.COLAB_TEMPLATE_REPOSITORY.strip("/")
        ref = self.COLAB_TEMPLATE_REF.strip("/")
        notebook_path = self.COLAB_TEMPLATE_NOTEBOOK_PATH.strip("/")
        return (
            "https://colab.research.google.com/github/"
            f"{organization}/{repository}/blob/{ref}/{notebook_path}"
        )

    def get_cors_origins(self) -> list[str]:
        """Parse CORS origins from comma-separated string."""
        if isinstance(self.CORS_ORIGINS, str):
            return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]
        return self.CORS_ORIGINS


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()

# Trigger reload

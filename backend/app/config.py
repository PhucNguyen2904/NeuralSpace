"""Application configuration using Pydantic Settings."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings from environment variables."""

    # === DATABASE ===
    DATABASE_URL: str = "postgresql+asyncpg://ml_app_user:password@localhost:5432/ml_model_store"
    DATABASE_POOL_SIZE: int = 10
    DATABASE_MAX_OVERFLOW: int = 20

    # === REDIS ===
    REDIS_URL: str = "redis://localhost:6379/0"

    # === CELERY ===
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/0"
    CELERY_WORKER_CONCURRENCY: int = 2
    CELERY_MAX_MEMORY_PER_CHILD: int = 2097152  # 2GB in KB

    # === STORAGE ===
    STORAGE_BASE_PATH: str = "/data/models"
    TEMP_DOWNLOAD_PATH: str = "/tmp/model_downloads"
    MIN_FREE_DISK_GB: float = 5.0

    # === DOWNLOAD ===
    CHUNK_SIZE_BYTES: int = 8 * 1024 * 1024  # 8MB
    MAX_RETRY_COUNT: int = 3
    CONNECT_TIMEOUT: int = 30
    READ_TIMEOUT: int = 60
    DISK_CHECK_INTERVAL_BYTES: int = 50 * 1024 * 1024  # 50MB
    MAX_CONCURRENT_DOWNLOADS: int = 3

    # === HUGGINGFACE ===
    HF_DEFAULT_TOKEN: str | None = None

    # === API ===
    API_V1_PREFIX: str = "/api/v1"
    LOG_LEVEL: str = "info"
    DEBUG: bool = False

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True
        extra = "ignore"


settings = Settings()

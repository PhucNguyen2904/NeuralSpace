"""
Storage Provider Registry — Factory pattern với @register_provider decorator.

Nguyên tắc Open/Closed:
  - ĐÓNG để thay đổi: file này không cần sửa khi thêm provider mới
  - MỞ để mở rộng: provider mới chỉ cần @register_provider("type_name")

Cách thêm provider mới:
    1. Tạo class trong providers/new_provider.py
    2. Decorate với @register_provider("new_type")
    3. Import trong providers/__init__.py
    4. Done — không cần sửa bất kỳ file nào khác
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from app.core.storage_exceptions import UnsupportedProvider

if TYPE_CHECKING:
    from app.services.storage.provider_interface import StorageProviderInterface

logger = logging.getLogger(__name__)

# Registry: provider_type → class
_PROVIDER_REGISTRY: dict[str, type["StorageProviderInterface"]] = {}

# Auth strategy registry: provider_type → strategy class
_AUTH_STRATEGY_REGISTRY: dict[str, type] = {}


def register_provider(provider_type: str):
    """
    Decorator để đăng ký StorageProvider implementation.

    Usage:
        @register_provider("drive")
        class GoogleDriveProvider(StorageProviderInterface):
            ...
    """
    def decorator(cls: type) -> type:
        if provider_type in _PROVIDER_REGISTRY:
            logger.warning(
                f"Provider '{provider_type}' is being overridden in registry"
            )
        _PROVIDER_REGISTRY[provider_type] = cls
        logger.debug(f"Registered storage provider: {provider_type} → {cls.__name__}")
        return cls

    return decorator


def register_auth_strategy(provider_type: str):
    """
    Decorator để đăng ký AuthStrategy cho một provider type.

    Usage:
        @register_auth_strategy("drive")
        class GoogleDriveOAuthStrategy(OAuth2AuthStrategy):
            ...
    """
    def decorator(cls: type) -> type:
        _AUTH_STRATEGY_REGISTRY[provider_type] = cls
        return cls

    return decorator


def get_provider(provider_type: str) -> "StorageProviderInterface":
    """
    Factory: tạo và trả về instance của provider tương ứng.

    Raises:
        UnsupportedProvider: nếu provider_type chưa được đăng ký.
    """
    # Normalize: "gdrive" → "drive", "s3-compatible" → "s3"
    normalized = _normalize_provider_type(provider_type)

    if normalized not in _PROVIDER_REGISTRY:
        available = ", ".join(sorted(_PROVIDER_REGISTRY.keys()))
        raise UnsupportedProvider(
            f"{provider_type}. Available providers: {available}"
        )

    cls = _PROVIDER_REGISTRY[normalized]
    return cls()


def get_auth_strategy(provider_type: str):
    """
    Factory: tạo AuthStrategy cho provider.

    Tự động chọn strategy phù hợp dựa trên provider_type.
    """
    from app.services.storage.auth.oauth2_strategy import OAUTH2_PROVIDER_CONFIGS, OAuth2AuthStrategy
    from app.services.storage.auth.access_key_strategy import AccessKeyAuthStrategy

    normalized = _normalize_provider_type(provider_type)

    # OAuth2 providers
    if normalized in OAUTH2_PROVIDER_CONFIGS:
        return OAuth2AuthStrategy(normalized)

    # Access Key providers
    if normalized in ("s3", "minio", "r2", "b2"):
        return AccessKeyAuthStrategy(normalized)

    # Custom registry
    if normalized in _AUTH_STRATEGY_REGISTRY:
        cls = _AUTH_STRATEGY_REGISTRY[normalized]
        return cls(normalized)

    raise UnsupportedProvider(
        f"No auth strategy for provider: {provider_type}"
    )


def list_providers() -> list[str]:
    """Trả về danh sách provider types đã đăng ký."""
    return sorted(_PROVIDER_REGISTRY.keys())


def _normalize_provider_type(provider_type: str) -> str:
    """Chuẩn hóa provider type string."""
    aliases = {
        "gdrive": "drive",
        "google_drive": "drive",
        "google-drive": "drive",
        "s3-compatible": "s3",
        "amazon_s3": "s3",
        "azure": "azureblob",
        "azure_blob": "azureblob",
        "microsoft_onedrive": "onedrive",
    }
    return aliases.get(provider_type.lower(), provider_type.lower())


def _load_all_providers() -> None:
    """
    Import tất cả provider modules để kích hoạt @register_provider decorators.
    Gọi một lần khi startup.
    """
    try:
        from app.services.storage import providers as _  # noqa: F401
    except ImportError as e:
        logger.error(f"Failed to load storage providers: {e}")


# Auto-load khi module được import
_load_all_providers()

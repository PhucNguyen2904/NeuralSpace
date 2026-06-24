"""Base storage provider abstraction."""

from abc import ABC, abstractmethod
from typing import Any

class BaseStorageProvider(ABC):
    def __init__(self, config: dict[str, Any]):
        self.config = config

    @abstractmethod
    async def upload(self, file_path: str, dest_path: str) -> str:
        """Upload a local file to storage and return its URI."""
        pass

    @abstractmethod
    async def upload_bytes(self, data: bytes, dest_path: str, content_type: str = "application/octet-stream") -> str:
        """Upload raw bytes to storage and return its URI."""
        pass

    @abstractmethod
    async def download(self, path: str) -> bytes:
        """Download a file from storage and return its bytes."""
        pass

    @abstractmethod
    async def delete(self, path: str) -> None:
        """Delete a file from storage."""
        pass

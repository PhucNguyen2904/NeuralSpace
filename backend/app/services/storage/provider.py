"""Storage Provider abstractions."""

from abc import ABC, abstractmethod
from typing import Any

from app.models.storage_connection import StorageConnection
from app.services.storage.rclone_service import RcloneService


class StorageProvider(ABC):
    """Abstract interface for storage providers."""

    @abstractmethod
    def list_files(self, connection: StorageConnection, path: str) -> list[dict[str, Any]]:
        """List files and directories."""
        pass

    @abstractmethod
    def create_directory(self, connection: StorageConnection, path: str) -> None:
        """Create a new directory."""
        pass

    @abstractmethod
    def delete(self, connection: StorageConnection, path: str, is_dir: bool = False) -> None:
        """Delete a file or directory."""
        pass

    @abstractmethod
    def copy(self, connection: StorageConnection, src_path: str, dest_path: str) -> None:
        """Copy a file or directory."""
        pass

    @abstractmethod
    def sync(self, connection: StorageConnection, src_path: str, dest_path: str) -> None:
        """Synchronize source to destination."""
        pass

    @abstractmethod
    def connect(self, connection: StorageConnection, params: dict[str, Any]) -> None:
        """Initialize connection and save configuration."""
        pass

    @abstractmethod
    def disconnect(self, connection: StorageConnection) -> None:
        """Remove connection and cleanup configuration."""
        pass


class RcloneStorageProvider(StorageProvider):
    """Storage provider implementation using rclone."""

    def __init__(self, rclone_service: RcloneService):
        self.rclone_service = rclone_service

    def _get_remote_path(self, connection: StorageConnection, path: str) -> str:
        """Format the full remote path for rclone (e.g. 'myremote:path/to/file')."""
        # Ensure path doesn't start with a slash when joining with remote:
        clean_path = path.lstrip("/")
        return f"{connection.remote_name}:{clean_path}"

    def list_files(self, connection: StorageConnection, path: str) -> list[dict[str, Any]]:
        remote_path = self._get_remote_path(connection, path)
        return self.rclone_service.list_files(connection.config_path, remote_path, provider=connection.provider)

    def create_directory(self, connection: StorageConnection, path: str) -> None:
        remote_path = self._get_remote_path(connection, path)
        self.rclone_service.mkdir(connection.config_path, remote_path, provider=connection.provider)

    def delete(self, connection: StorageConnection, path: str, is_dir: bool = False) -> None:
        remote_path = self._get_remote_path(connection, path)
        self.rclone_service.delete(connection.config_path, remote_path, provider=connection.provider, is_dir=is_dir)

    def copy(self, connection: StorageConnection, src_path: str, dest_path: str) -> None:
        remote_src = self._get_remote_path(connection, src_path)
        remote_dest = self._get_remote_path(connection, dest_path)
        self.rclone_service.copy(connection.config_path, remote_src, remote_dest, provider=connection.provider)

    def sync(self, connection: StorageConnection, src_path: str, dest_path: str) -> None:
        remote_src = self._get_remote_path(connection, src_path)
        remote_dest = self._get_remote_path(connection, dest_path)
        self.rclone_service.sync(connection.config_path, remote_src, remote_dest, provider=connection.provider)

    def connect(self, connection: StorageConnection, params: dict[str, Any]) -> None:
        """Generate the rclone configuration file for this remote."""
        self.rclone_service.create_remote(
            config_path=connection.config_path,
            remote_name=connection.remote_name,
            provider_type=connection.provider,
            params=params,
        )
        
        if connection.provider == "drive" and "token" not in params:
            import configparser
            config = configparser.ConfigParser()
            config.read(connection.config_path)
            if config.has_section(connection.remote_name):
                if config.has_option(connection.remote_name, "token"):
                    params["token"] = config.get(connection.remote_name, "token")
                if config.has_option(connection.remote_name, "client_id"):
                    params["client_id"] = config.get(connection.remote_name, "client_id")
                if config.has_option(connection.remote_name, "client_secret"):
                    params["client_secret"] = config.get(connection.remote_name, "client_secret")

    def disconnect(self, connection: StorageConnection) -> None:
        """Remove the remote from the rclone configuration."""
        self.rclone_service.delete_remote(connection.config_path, connection.remote_name)

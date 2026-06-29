"""Storage related exceptions."""

from app.core.exceptions import AppException


class StorageException(AppException):
    """Base exception for storage errors."""
    status_code = 500
    error_code = "storage_error"


class RemoteNotFound(StorageException):
    """Raised when a configured remote is not found."""
    status_code = 404
    error_code = "remote_not_found"
    
    def __init__(self, remote_name: str) -> None:
        super().__init__(f"Storage remote '{remote_name}' not found", remote_name=remote_name)


class AuthenticationFailed(StorageException):
    """Raised when rclone fails to authenticate with the provider."""
    status_code = 401
    error_code = "authentication_failed"
    
    def __init__(self, provider: str, message: str = "") -> None:
        super().__init__(f"Authentication failed for provider '{provider}': {message}", provider=provider)


class PermissionDenied(StorageException):
    """Raised when rclone encounters a permission error."""
    status_code = 403
    error_code = "permission_denied"
    
    def __init__(self, path: str) -> None:
        super().__init__(f"Permission denied accessing path '{path}'", path=path)


class FileAlreadyExists(StorageException):
    """Raised when trying to write to a file that already exists."""
    status_code = 409
    error_code = "file_already_exists"
    
    def __init__(self, path: str) -> None:
        super().__init__(f"File already exists at path '{path}'", path=path)


class StorageUnavailable(StorageException):
    """Raised when the storage provider is unreachable or down."""
    status_code = 503
    error_code = "storage_unavailable"
    
    def __init__(self, provider: str, message: str = "") -> None:
        super().__init__(f"Storage provider '{provider}' is currently unavailable: {message}", provider=provider)

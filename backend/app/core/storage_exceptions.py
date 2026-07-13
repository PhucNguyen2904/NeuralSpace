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


class UnsupportedProvider(StorageException):
    """Raised when an unsupported storage provider is requested."""
    status_code = 400
    error_code = "unsupported_provider"

    def __init__(self, provider: str) -> None:
        super().__init__(f"Storage provider '{provider}' is not supported", provider=provider)


class CredentialExpired(StorageException):
    """Raised when a stored credential (OAuth token, SAS token) has expired."""
    status_code = 401
    error_code = "credential_expired"

    def __init__(self, provider: str, connection_id: str = "") -> None:
        super().__init__(
            f"Credential for provider '{provider}' has expired. Please reconnect.",
            provider=provider,
            connection_id=connection_id,
        )


class TokenRefreshFailed(StorageException):
    """Raised when automatic OAuth token refresh fails."""
    status_code = 502
    error_code = "token_refresh_failed"

    def __init__(self, provider: str, reason: str = "") -> None:
        super().__init__(
            f"Failed to refresh token for provider '{provider}': {reason}",
            provider=provider,
        )

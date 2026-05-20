"""Custom exception classes for the application."""

from typing import Any


class AppException(Exception):
    """Base exception for the application."""

    status_code: int = 500
    error_code: str = "internal_error"

    def __init__(self, message: str, **kwargs: Any) -> None:
        """Initialize exception with message and additional context."""
        self.message = message
        self.context = kwargs
        super().__init__(self.message)


class WorkspaceNotFoundError(AppException):
    """Raised when a workspace is not found."""

    status_code = 404
    error_code = "workspace_not_found"

    def __init__(self, workspace_id: str) -> None:
        """Initialize with workspace ID."""
        super().__init__(f"Workspace {workspace_id} not found", workspace_id=workspace_id)


class WorkspaceNotOwnedError(AppException):
    """Raised when a user doesn't own the workspace."""

    status_code = 403
    error_code = "workspace_not_owned"

    def __init__(self, workspace_id: str, user_id: str) -> None:
        """Initialize with workspace and user IDs."""
        super().__init__(
            f"User {user_id} does not own workspace {workspace_id}",
            workspace_id=workspace_id,
            user_id=user_id,
        )


class QuotaExceededError(AppException):
    """Raised when user quota is exceeded."""

    status_code = 429
    error_code = "quota_exceeded"

    def __init__(self, current: int, max: int) -> None:
        """Initialize with current and max quota values."""
        super().__init__(
            f"Quota exceeded: {current}/{max}",
            current=current,
            max=max,
        )


class WorkspaceNotRunningError(AppException):
    """Raised when trying to access a workspace that is not running."""

    status_code = 409
    error_code = "workspace_not_running"

    def __init__(self, workspace_id: str, current_status: str) -> None:
        """Initialize with workspace ID and current status."""
        super().__init__(
            f"Workspace {workspace_id} is not running (status: {current_status})",
            workspace_id=workspace_id,
            current_status=current_status,
        )


class ProvisioningError(AppException):
    """Raised when workspace provisioning fails."""

    status_code = 500
    error_code = "provisioning_error"

    def __init__(self, message: str) -> None:
        """Initialize with error message."""
        super().__init__(f"Workspace provisioning failed: {message}", detail=message)

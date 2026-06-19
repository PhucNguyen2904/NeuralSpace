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


class InvalidWorkspaceAssetsError(AppException):
    """Raised when workspace creation references unknown assets."""

    status_code = 422
    error_code = "invalid_workspace_assets"

    def __init__(self, dataset_ids: list[str], model_ids: list[str]) -> None:
        parts = []
        if dataset_ids:
            parts.append(f"datasets: {', '.join(dataset_ids)}")
        if model_ids:
            parts.append(f"models: {', '.join(model_ids)}")
        super().__init__(
            f"Unknown workspace assets ({'; '.join(parts)})",
            dataset_ids=dataset_ids,
            model_ids=model_ids,
        )


class ProvisioningError(AppException):
    """Raised when workspace provisioning fails."""

    status_code = 500
    error_code = "provisioning_error"

    def __init__(self, message: str) -> None:
        """Initialize with error message."""
        super().__init__(f"Workspace provisioning failed: {message}", detail=message)


class GitAuthError(AppException):
    """Raised when Git authentication fails."""

    status_code = 403
    error_code = "git_auth_error"

    def __init__(self, message: str) -> None:
        super().__init__(f"Git authentication error: {message}")


class GitPushError(AppException):
    """Raised when Git push fails."""

    status_code = 422
    error_code = "git_push_error"

    def __init__(self, message: str) -> None:
        super().__init__(f"Git push failed: {message}")

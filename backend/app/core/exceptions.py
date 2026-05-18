"""Custom exception classes for model download service."""


class ModelDownloadError(Exception):
    """Base exception for all model download errors."""

    def __init__(self, message: str, code: str = "DOWNLOAD_ERROR", retryable: bool = False):
        self.message = message
        self.code = code
        self.retryable = retryable
        super().__init__(message)


class InsufficientDiskSpaceError(ModelDownloadError):
    """Raised when there is insufficient disk space to download the model."""

    def __init__(self, required_bytes: int, available_bytes: int):
        self.required_bytes = required_bytes
        self.available_bytes = available_bytes
        message = (
            f"Insufficient disk space. Required: {required_bytes} bytes, "
            f"Available: {available_bytes} bytes"
        )
        super().__init__(message, code="DISK_FULL", retryable=False)


class ChecksumMismatchError(ModelDownloadError):
    """Raised when downloaded file checksum does not match expected."""

    def __init__(self, expected: str, actual: str):
        self.expected = expected
        self.actual = actual
        message = (
            f"Checksum mismatch. Expected: {expected}, Got: {actual}"
        )
        super().__init__(message, code="CHECKSUM_MISMATCH", retryable=False)


class SourceUnavailableError(ModelDownloadError):
    """Raised when source is not available or unreachable."""

    def __init__(self, message: str):
        super().__init__(message, code="SOURCE_UNAVAILABLE", retryable=True)


class DuplicateModelError(ModelDownloadError):
    """Raised when model already exists in the system."""

    def __init__(self, model_id: str, message: str = "Model already exists"):
        self.model_id = model_id
        super().__init__(message, code="DUPLICATE_MODEL", retryable=False)


class TaskNotRetryableError(ModelDownloadError):
    """Raised when task cannot be retried."""

    def __init__(self, message: str):
        super().__init__(message, code="TASK_NOT_RETRYABLE", retryable=False)


class RangeRequestNotSupportedError(ModelDownloadError):
    """Raised when server does not support HTTP Range requests."""

    def __init__(self, message: str = "Server does not support range requests"):
        super().__init__(message, code="RANGE_NOT_SUPPORTED", retryable=True)


class InvalidConfigurationError(ModelDownloadError):
    """Raised when there is an invalid configuration."""

    def __init__(self, message: str):
        super().__init__(message, code="INVALID_CONFIG", retryable=False)

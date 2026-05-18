"""Global FastAPI exception handlers."""

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from datetime import datetime
import logging

from app.core.exceptions import ModelDownloadError


logger = logging.getLogger(__name__)


def register_exception_handlers(app: FastAPI) -> None:
    """Register all global exception handlers with FastAPI app."""

    @app.exception_handler(ModelDownloadError)
    async def model_download_error_handler(request, exc: ModelDownloadError):
        """Handle ModelDownloadError and subclasses."""
        # Extract task_id from request path if available
        task_id = None
        path_parts = request.url.path.split("/")
        if "tasks" in path_parts:
            idx = path_parts.index("tasks")
            if idx + 1 < len(path_parts):
                task_id = path_parts[idx + 1]

        response_body = {
            "error": {
                "code": exc.code,
                "message": exc.message,
                "task_id": task_id,
                "retryable": exc.retryable,
                "timestamp": datetime.utcnow().isoformat() + "Z",
            }
        }

        status_code = 400
        if exc.code == "DISK_FULL":
            status_code = 507  # Insufficient Storage
        elif exc.code == "DUPLICATE_MODEL":
            status_code = 409  # Conflict
        elif exc.code == "TASK_NOT_RETRYABLE":
            status_code = 422  # Unprocessable Entity
        elif exc.code == "SOURCE_UNAVAILABLE":
            status_code = 503  # Service Unavailable
        elif exc.code == "INVALID_CONFIG":
            status_code = 500  # Internal Server Error

        logger.warning(f"ModelDownloadError: {exc.code} - {exc.message}")
        return JSONResponse(status_code=status_code, content=response_body)

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(request, exc: RequestValidationError):
        """Handle Pydantic validation errors."""
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": "Invalid request data",
                    "details": exc.errors(),
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                }
            },
        )

    @app.exception_handler(Exception)
    async def generic_exception_handler(request, exc: Exception):
        """Handle unexpected exceptions."""
        logger.exception(f"Unexpected error: {exc}")
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "INTERNAL_SERVER_ERROR",
                    "message": "An unexpected error occurred",
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                }
            },
        )

"""Structured logging configuration."""

import logging
import sys
import uuid
from contextvars import ContextVar

import structlog

from app.config import get_settings

# Context variable for request ID tracking
request_id_ctx: ContextVar[str] = ContextVar("request_id", default="")


def configure_logging() -> None:
    """Configure structured logging with structlog."""
    settings = get_settings()

    timestamper = structlog.processors.TimeStamper(fmt="iso")

    shared_processors = [
        structlog.stdlib.add_log_level,
        timestamper,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.CallsiteParameterAdder(),
        structlog.processors.dict_tracebacks,
    ]

    if settings.ENVIRONMENT == "production":
        # JSON output for production
        structlog.configure(
            processors=shared_processors
            + [
                structlog.processors.JSONRenderer(),
            ],
            context_class=dict,
            logger_factory=structlog.PrintLoggerFactory(),
            cache_logger_on_first_use=True,
        )
    else:
        # Pretty console output for development
        structlog.configure(
            processors=shared_processors
            + [
                structlog.dev.ConsoleRenderer(),
            ],
            context_class=dict,
            logger_factory=structlog.PrintLoggerFactory(),
            cache_logger_on_first_use=True,
        )

    # Configure stdlib logging
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=settings.LOG_LEVEL,
    )


def get_logger(name: str) -> structlog.typing.WrappedLogger:
    """
    Get a logger instance.

    Args:
        name: Logger name (usually __name__)

    Returns:
        Configured logger
    """
    return structlog.get_logger(name)


def generate_request_id() -> str:
    """
    Generate a new request ID.

    Returns:
        UUID4 string
    """
    return str(uuid.uuid4())


def set_request_id(request_id: str) -> None:
    """
    Set the request ID in context.

    Args:
        request_id: Request ID to set
    """
    request_id_ctx.set(request_id)


def get_request_id() -> str:
    """
    Get the current request ID from context.

    Returns:
        Current request ID or empty string
    """
    return request_id_ctx.get()


def audit_event(logger: structlog.typing.WrappedLogger, action: str, **fields) -> None:
    """
    Emit structured audit log for state-changing operations.

    Args:
        logger: Logger instance
        action: Stable action key, e.g. "workspace.create"
        **fields: Extra context fields
    """
    logger.info("AUDIT", action=action, request_id=get_request_id(), **fields)

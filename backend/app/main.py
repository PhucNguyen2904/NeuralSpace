"""FastAPI application entrypoint."""

from contextlib import asynccontextmanager
from time import perf_counter

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.requests import Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from app import __version__
from app.api.v1.router import router as api_v1_router
from app.config import get_settings
from app.core.logging import configure_logging, get_logger, generate_request_id, set_request_id
from app.core.metrics import api_request_duration_seconds
from app.core.tracing import setup_tracing
from app.middleware.auth_middleware import AuthMiddleware
from app.middleware.rate_limit_middleware import RateLimitMiddleware
from app.dependencies import (
    close_db,
    close_redis,
    get_db_engine,
    init_db,
    init_redis,
)

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Manage application lifecycle.

    - On startup: initialize database, Redis, and other resources
    - On shutdown: clean up resources
    """
    # Startup
    logger.info("Starting up application", version=__version__)
    configure_logging()

    try:
        await init_db()
        logger.info("Database initialized")
        await init_redis()
        logger.info("Redis initialized")
    except Exception as e:
        logger.exception("Failed to initialize resources", error=str(e))
        raise

    yield

    # Shutdown
    logger.info("Shutting down application")
    try:
        await close_db()
        logger.info("Database closed")
        await close_redis()
        logger.info("Redis closed")
    except Exception as e:
        logger.exception("Error during shutdown", error=str(e))


def create_app() -> FastAPI:
    """
    Create and configure FastAPI application.

    Returns:
        Configured FastAPI app
    """
    settings = get_settings()

    app = FastAPI(
        title="Cloud IDE Platform API",
        description="Backend API for Cloud IDE Platform (like Google Colab)",
        version=__version__,
        docs_url=settings.DOCS_URL,
        redoc_url=settings.REDOC_URL,
        openapi_url=settings.OPENAPI_URL,
        lifespan=lifespan,
    )

    # CORS Middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.get_cors_origins(),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Trusted Host Middleware
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=["*"],
    )
    app.add_middleware(AuthMiddleware)
    app.add_middleware(RateLimitMiddleware)

    # Request ID Middleware
    @app.middleware("http")
    async def add_request_id(request: Request, call_next):
        """Add request ID to all requests."""
        request_id = request.headers.get("X-Request-ID", generate_request_id())
        set_request_id(request_id)
        trace_id = request.headers.get("X-Trace-ID", request_id)
        request.state.trace_id = trace_id
        start = perf_counter()
        response = await call_next(request)
        duration = perf_counter() - start
        endpoint = request.url.path
        api_request_duration_seconds.labels(endpoint=endpoint, method=request.method).observe(duration)
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Trace-ID"] = trace_id
        return response

    # Global exception handlers
    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        """Handle HTTP exceptions."""
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error_code": "http_error",
                "message": exc.detail,
                "status_code": exc.status_code,
            },
        )

    @app.exception_handler(ValidationError)
    async def validation_exception_handler(request: Request, exc: ValidationError):
        """Handle validation errors."""
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "error_code": "validation_error",
                "message": "Validation failed",
                "details": exc.errors(),
            },
        )

    # Health check endpoint
    @app.get("/health", tags=["health"])
    async def health_check():
        """Health check endpoint."""
        return {
            "status": "ok",
            "version": __version__,
        }

    # Include API routers
    app.include_router(api_v1_router, prefix="/api/v1")
    setup_tracing(app, db_engine=get_db_engine())

    logger.info("FastAPI application created", environment=settings.ENVIRONMENT)

    return app


# Create app instance
app = create_app()

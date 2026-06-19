"""FastAPI application entrypoint."""

from contextlib import asynccontextmanager
from time import perf_counter

import httpx
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.requests import Request
from fastapi.responses import Response, JSONResponse
from pydantic import ValidationError

from app import __version__
from fastapi.exceptions import RequestValidationError
import asyncio
from app.api.v1.router import router as api_v1_router
from app.config import get_settings
from app.utils.ngrok import get_ngrok_public_url
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

    settings = get_settings()
    if settings.ENVIRONMENT == "development":
        ngrok_url = None
        for attempt in range(10):
            ngrok_url = await get_ngrok_public_url()
            if ngrok_url:
                break
            logger.info(f"Chờ ngrok... (lần {attempt + 1}/10)")
            await asyncio.sleep(2)

        if ngrok_url:
            settings.BACKEND_URL = ngrok_url
            logger.info("=" * 50)
            logger.info(f"✅ ngrok tunnel: {ngrok_url}")
            logger.info(f"   GitHub Callback URL:")
            logger.info(f"   {ngrok_url}/api/v1/github/callback")
            logger.info("=" * 50)
        else:
            logger.warning("⚠️  Không lấy được ngrok URL sau 10 lần thử")

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
        title="NeuralSpace Control Plane API",
        description="MLOps control plane for registries, tracking, lineage, and external runtimes",
        version=__version__,
        docs_url=settings.DOCS_URL,
        redoc_url=settings.REDOC_URL,
        openapi_url=settings.OPENAPI_URL,
        lifespan=lifespan,
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
        logger.info(
            "HTTP request started",
            request_id=request_id,
            trace_id=trace_id,
            method=request.method,
            path=request.url.path,
            query=str(request.url.query or ""),
            client_ip=request.client.host if request.client else "unknown",
        )
        try:
            response = await call_next(request)
        except Exception as exc:
            duration = perf_counter() - start
            logger.exception(
                "HTTP request failed",
                request_id=request_id,
                trace_id=trace_id,
                method=request.method,
                path=request.url.path,
                duration_ms=round(duration * 1000, 2),
                error=str(exc),
            )
            raise

        duration = perf_counter() - start
        endpoint = request.url.path
        api_request_duration_seconds.labels(endpoint=endpoint, method=request.method).observe(duration)
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Trace-ID"] = trace_id
        logger.info(
            "HTTP request completed",
            request_id=request_id,
            trace_id=trace_id,
            method=request.method,
            path=request.url.path,
            status_code=response.status_code,
            duration_ms=round(duration * 1000, 2),
        )
        return response

    # CORS must be the outermost middleware so auth/rate-limit error responses
    # still include Access-Control-Allow-Origin for the browser.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.get_cors_origins(),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Global exception handlers
    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        """Handle HTTP exceptions."""
        logger.warning(
            "HTTP exception returned",
            request_id=request.headers.get("X-Request-ID", ""),
            method=request.method,
            path=request.url.path,
            status_code=exc.status_code,
            detail=str(exc.detail),
        )
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error_code": "http_error",
                "message": exc.detail,
                "status_code": exc.status_code,
            },
        )

    @app.exception_handler(ValidationError)
    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: ValidationError | RequestValidationError):
        """Handle validation errors."""
        logger.warning(
            "Validation exception returned",
            request_id=request.headers.get("X-Request-ID", ""),
            method=request.method,
            path=request.url.path,
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            errors=exc.errors(),
        )
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

    @app.api_route(
        "/{bucket_name}/{object_path:path}",
        methods=["GET", "HEAD", "PUT"],
        include_in_schema=False,
    )
    async def public_minio_proxy(bucket_name: str, object_path: str, request: Request):
        if bucket_name not in {"workspace-data", "mlflow-artifacts"}:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

        query = request.url.query
        target_url = f"http://{settings.MINIO_ENDPOINT}/{bucket_name}/{object_path}"
        if query:
            target_url = f"{target_url}?{query}"

        upstream_headers = {"host": request.headers.get("host", "")}
        for header_name in ("content-type", "content-length", "x-amz-content-sha256"):
            header_value = request.headers.get(header_name)
            if header_value:
                upstream_headers[header_name] = header_value

        async with httpx.AsyncClient(follow_redirects=False, timeout=None) as client:
            upstream = await client.request(
                request.method,
                target_url,
                headers=upstream_headers,
                content=await request.body(),
            )

        response_headers = {
            name: value
            for name, value in upstream.headers.items()
            if name.lower()
            in {
                "accept-ranges",
                "content-disposition",
                "content-length",
                "content-range",
                "content-type",
                "etag",
                "last-modified",
            }
        }
        return Response(
            content=upstream.content if request.method != "HEAD" else b"",
            status_code=upstream.status_code,
            headers=response_headers,
        )

    setup_tracing(app, db_engine=get_db_engine())

    logger.info("FastAPI application created", environment=settings.ENVIRONMENT)

    return app


# Create app instance
app = create_app()

"""FastAPI application factory."""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging

from app.config import settings
from app.core.error_handlers import register_exception_handlers
from app.api.v1.router import router as api_v1_router
from app.db.session import engine
from app.core.celery_app import import_tasks


logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage FastAPI lifespan events."""
    # Startup
    logger.info("Starting ML Model Download Service")
    import_tasks()  # Register Celery tasks

    yield

    # Shutdown
    logger.info("Shutting down ML Model Download Service")
    await engine.dispose()


def create_app() -> FastAPI:
    """Create and configure FastAPI application."""
    app = FastAPI(
        title="ML Model Download Service",
        description="Async ML model download and management service",
        version="1.0.0",
        lifespan=lifespan,
    )

    # Add middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Register exception handlers
    register_exception_handlers(app)

    # Include API routers
    app.include_router(api_v1_router)

    # Root endpoint
    @app.get("/")
    async def root():
        return {
            "service": "ML Model Download Service",
            "version": "1.0.0",
            "api_prefix": settings.API_V1_PREFIX,
            "docs": f"{settings.API_V1_PREFIX}/docs",
        }

    return app


app = create_app()

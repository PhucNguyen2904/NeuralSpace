"""Monitoring endpoints: health, readiness, and Prometheus metrics."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends, Response, status
from redis.asyncio import Redis
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app import __version__
from app.core.metrics import render_metrics
from app.dependencies import get_db, get_redis
from app.services.k8s_service import K8sService

router = APIRouter(tags=["monitoring"])


@router.get("/health", status_code=status.HTTP_200_OK)
async def liveness() -> dict[str, str]:
    """Basic liveness check."""
    return {"status": "ok", "version": __version__}


@router.get("/health/ready", status_code=status.HTTP_200_OK)
async def readiness(
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> dict:
    """Readiness checks for DB, Redis, and Kubernetes API connectivity."""
    checks = {"db": False, "redis": False, "k8s": False}

    try:
        await db.execute(text("SELECT 1"))
        checks["db"] = True
    except Exception:
        checks["db"] = False

    try:
        pong = await redis.ping()
        checks["redis"] = bool(pong)
    except Exception:
        checks["redis"] = False

    try:
        k8s = K8sService()
        await asyncio.wait_for(k8s.list_workspace_namespaces(), timeout=5.0)
        checks["k8s"] = True
    except Exception:
        checks["k8s"] = False

    ready = all(checks.values())
    return {"status": "ready" if ready else "not_ready", "checks": checks}


@router.get("/metrics")
async def metrics() -> Response:
    """Prometheus scrape endpoint."""
    payload, content_type = render_metrics()
    return Response(content=payload, media_type=content_type)

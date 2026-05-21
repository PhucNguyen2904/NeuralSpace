"""Prometheus metrics registry and helpers."""

from __future__ import annotations

from prometheus_client import CONTENT_TYPE_LATEST, Counter, Gauge, Histogram, generate_latest

workspace_created_total = Counter(
    "workspace_created_total",
    "Total number of workspace create attempts.",
    labelnames=("tier", "status"),
)

workspace_active_gauge = Gauge(
    "workspace_active_gauge",
    "Current number of active running workspaces.",
    labelnames=("tier",),
)

workspace_provisioning_duration_seconds = Histogram(
    "workspace_provisioning_duration_seconds",
    "Time spent provisioning a workspace.",
    buckets=(1, 2, 5, 10, 20, 30, 60, 120, 300),
)

workspace_idle_kill_total = Counter(
    "workspace_idle_kill_total",
    "Total number of workspaces killed by idle GC.",
)

api_request_duration_seconds = Histogram(
    "api_request_duration_seconds",
    "API request duration in seconds.",
    labelnames=("endpoint", "method"),
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10),
)


def render_metrics() -> tuple[bytes, str]:
    """Render all registered metrics in Prometheus text format."""
    return generate_latest(), CONTENT_TYPE_LATEST

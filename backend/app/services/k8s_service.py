"""Kubernetes service integration helpers."""

from __future__ import annotations

import httpx


class K8sService:
    """Service that performs direct pod-level operations."""

    async def restart_kernel(self, pod_ip: str, kernel_id: str) -> None:
        url = f"http://{pod_ip}:8888/api/kernels/{kernel_id}/restart"
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(url)
        response.raise_for_status()

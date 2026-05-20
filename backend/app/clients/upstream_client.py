"""Async client for upstream module APIs."""

from __future__ import annotations

import asyncio

import httpx

from app.config import get_settings


class UpstreamClient:
    """HTTP client wrapper for upstream APIs."""

    def __init__(self) -> None:
        settings = get_settings()
        self.base_url = settings.UPSTREAM_BASE_URL.rstrip("/")
        self.timeout = 5.0
        self.retries = 2

    async def validate_dataset_ids(self, dataset_ids: list[str], user_id: str) -> bool:
        if not dataset_ids:
            return True
        payload = {"dataset_ids": dataset_ids, "user_id": user_id}
        return await self._post_with_retry("/api/v1/datasets/validate", payload)

    async def validate_model_ids(self, model_ids: list[str], user_id: str) -> bool:
        if not model_ids:
            return True
        payload = {"model_ids": model_ids, "user_id": user_id}
        return await self._post_with_retry("/api/v1/models/validate", payload)

    async def get_dataset_storage_path(self, dataset_id: str) -> str:
        data = await self._get_with_retry(f"/api/v1/datasets/{dataset_id}/storage-path")
        return str(data["storage_path"])

    async def get_model_storage_path(self, model_id: str) -> str:
        data = await self._get_with_retry(f"/api/v1/models/{model_id}/storage-path")
        return str(data["storage_path"])

    async def _post_with_retry(self, path: str, payload: dict) -> bool:
        last_error: Exception | None = None
        for attempt in range(self.retries + 1):
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    response = await client.post(f"{self.base_url}{path}", json=payload)
                if response.status_code == 200:
                    body = response.json()
                    return bool(body.get("valid", True))
                return False
            except (httpx.HTTPError, asyncio.TimeoutError) as exc:
                last_error = exc
                if attempt < self.retries:
                    await asyncio.sleep(0.2 * (attempt + 1))
        if last_error:
            raise last_error
        return False

    async def _get_with_retry(self, path: str) -> dict:
        last_error: Exception | None = None
        for attempt in range(self.retries + 1):
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    response = await client.get(f"{self.base_url}{path}")
                response.raise_for_status()
                return response.json()
            except (httpx.HTTPError, asyncio.TimeoutError) as exc:
                last_error = exc
                if attempt < self.retries:
                    await asyncio.sleep(0.2 * (attempt + 1))
        if last_error:
            raise last_error
        raise RuntimeError("Unexpected upstream client failure")

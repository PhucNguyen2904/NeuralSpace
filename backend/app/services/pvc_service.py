"""PVC provisioning helpers for workspace storage."""

from __future__ import annotations

import asyncio

from kubernetes import client
from kubernetes.client import (
    V1ObjectMeta,
    V1PersistentVolumeClaim,
    V1PersistentVolumeClaimSpec,
    V1ResourceRequirements,
)
from kubernetes.client.exceptions import ApiException

from app.clients.upstream_client import UpstreamClient

STORAGE_NAMESPACE = "jupyter-storage"
UPSTREAM_STORAGE_NAMESPACE = "upstream-storage"


class PVCService:
    """Service that ensures and resolves PVC references."""

    def __init__(self, upstream_client: UpstreamClient | None = None) -> None:
        self.core_api = client.CoreV1Api()
        self.upstream_client = upstream_client or UpstreamClient()

    async def ensure_notebook_pvc(self, user_id: str) -> str:
        pvc_name = f"{user_id}-notebooks"
        try:
            await asyncio.to_thread(
                self.core_api.read_namespaced_persistent_volume_claim,
                pvc_name,
                STORAGE_NAMESPACE,
            )
            return pvc_name
        except ApiException as exc:
            if exc.status != 404:
                raise

        pvc = V1PersistentVolumeClaim(
            metadata=V1ObjectMeta(name=pvc_name, namespace=STORAGE_NAMESPACE),
            spec=V1PersistentVolumeClaimSpec(
                access_modes=["ReadWriteOnce"],
                storage_class_name="standard",
                resources=V1ResourceRequirements(requests={"storage": "5Gi"}),
            ),
        )
        await asyncio.to_thread(
            self.core_api.create_namespaced_persistent_volume_claim,
            STORAGE_NAMESPACE,
            pvc,
        )
        return pvc_name

    async def get_dataset_pvc(self, dataset_id: str) -> str | None:
        try:
            metadata = await self.upstream_client._get_with_retry(f"/api/v1/datasets/{dataset_id}/pvc")
            pvc_name = metadata.get("pvc_name") or metadata.get("pvc") or metadata.get("name")
            if not pvc_name:
                return None

            await asyncio.to_thread(
                self.core_api.read_namespaced_persistent_volume_claim,
                str(pvc_name),
                UPSTREAM_STORAGE_NAMESPACE,
            )
            return str(pvc_name)
        except Exception:
            return None

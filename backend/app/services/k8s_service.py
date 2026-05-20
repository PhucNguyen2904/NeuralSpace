"""Kubernetes service integration helpers."""

from __future__ import annotations

import asyncio
import base64
import json
from typing import Any

import httpx
from kubernetes import client, config
from kubernetes.client import (
    V1DeleteOptions,
    V1Namespace,
    V1ObjectMeta,
    V1ResourceQuota,
    V1ResourceQuotaSpec,
    V1Secret,
)
from kubernetes.client.exceptions import ApiException

from app.config import get_settings
from app.core.exceptions import ProvisioningError
from app.services.k8s_templates import build_network_policy, build_pod_spec


class KubernetesService:
    """Service for workspace Kubernetes resource lifecycle."""

    def __init__(self, redis_client: Any | None = None) -> None:
        settings = get_settings()
        if settings.KUBERNETES_IN_CLUSTER:
            config.load_incluster_config()
        else:
            config.load_kube_config()
        self.settings = settings
        self.core_api = client.CoreV1Api()
        self.custom_api = client.CustomObjectsApi()
        self.network_api = client.NetworkingV1Api()
        self.redis = redis_client

    async def create_workspace_namespace(self, workspace_id: str, user_id: str) -> str:
        namespace = f"{self.settings.KUBERNETES_NAMESPACE_PREFIX}{workspace_id}"
        labels = {
            "app": "jupyter-workspace",
            "user-id": user_id,
            "workspace-id": workspace_id,
        }

        ns_body = V1Namespace(metadata=V1ObjectMeta(name=namespace, labels=labels))
        await asyncio.to_thread(self.core_api.create_namespace, ns_body)

        quota_body = V1ResourceQuota(
            metadata=V1ObjectMeta(name="workspace-quota", namespace=namespace),
            spec=V1ResourceQuotaSpec(
                hard={
                    "requests.cpu": "250m",
                    "limits.cpu": "2000m",
                    "requests.memory": "512Mi",
                    "limits.memory": "4Gi",
                }
            ),
        )
        await asyncio.to_thread(self.core_api.create_namespaced_resource_quota, namespace, quota_body)
        return namespace

    async def create_workspace_secret(self, namespace: str, workspace_id: str, jupyter_token: str) -> None:
        secret_name = f"ws-secret-{workspace_id}"
        encoded_token = base64.b64encode(jupyter_token.encode("utf-8")).decode("utf-8")
        secret = V1Secret(
            metadata=V1ObjectMeta(name=secret_name, namespace=namespace),
            type="Opaque",
            data={"token": encoded_token},
        )
        await asyncio.to_thread(self.core_api.create_namespaced_secret, namespace, secret)

    async def create_workspace_pod(
        self,
        namespace: str,
        workspace_id: str,
        user_id: str,
        tier: str,
        dataset_path: str | None,
        model_path: str | None,
        notebook_pvc: str,
    ) -> str:
        pod = build_pod_spec(
            workspace_id=workspace_id,
            user_id=user_id,
            tier=tier,
            config={
                "namespace": namespace,
                "dataset_pvc": dataset_path,
                "model_pvc": model_path,
                "notebook_pvc": notebook_pvc,
                "jupyter_base_image": self.settings.JUPYTER_BASE_IMAGE,
            },
        )
        created = await asyncio.to_thread(self.core_api.create_namespaced_pod, namespace, pod)

        policy = build_network_policy(workspace_id)
        await asyncio.to_thread(self.network_api.create_namespaced_network_policy, namespace, policy)
        return created.metadata.name

    async def wait_for_pod_ready(self, namespace: str, pod_name: str, timeout: int = 120) -> str:
        deadline = asyncio.get_running_loop().time() + timeout
        while asyncio.get_running_loop().time() < deadline:
            pod = await asyncio.to_thread(self.core_api.read_namespaced_pod, pod_name, namespace)
            status = getattr(pod, "status", None)
            if status and status.phase == "Running" and status.pod_ip:
                return str(status.pod_ip)
            await asyncio.sleep(2)
        raise ProvisioningError(f"Timed out waiting for pod {pod_name} to be ready in namespace {namespace}")

    async def delete_namespace(self, namespace: str) -> None:
        delete_options = V1DeleteOptions(grace_period_seconds=30)
        await asyncio.to_thread(
            self.core_api.delete_namespace,
            namespace,
            body=delete_options,
            grace_period_seconds=30,
        )

    async def get_pod_metrics(self, namespace: str, pod_name: str) -> dict[str, float]:
        try:
            metric_obj = await asyncio.to_thread(
                self.custom_api.get_namespaced_custom_object,
                "metrics.k8s.io",
                "v1beta1",
                namespace,
                "pods",
                pod_name,
            )
            usage = metric_obj["containers"][0]["usage"]
            cpu_millicores = self._cpu_to_millicores(usage.get("cpu", "0"))
            memory_mb = self._memory_to_mb(usage.get("memory", "0Mi"))

            pod = await asyncio.to_thread(self.core_api.read_namespaced_pod, pod_name, namespace)
            limits = (pod.spec.containers[0].resources.limits or {}) if pod.spec and pod.spec.containers else {}
            cpu_limit_m = self._cpu_to_millicores(str(limits.get("cpu", "0")))
            memory_limit_mb = self._memory_to_mb(str(limits.get("memory", "0Mi")))
            cpu_percent = (cpu_millicores / cpu_limit_m * 100.0) if cpu_limit_m > 0 else 0.0
            result = {
                "cpu_percent": round(cpu_percent, 2),
                "memory_mb": round(memory_mb, 2),
                "memory_limit_mb": round(memory_limit_mb, 2),
            }
            await self._cache_metrics(namespace, pod_name, result)
            return result
        except (ApiException, KeyError, IndexError, TypeError, ValueError):
            cached = await self._load_cached_metrics(namespace, pod_name)
            if cached is not None:
                return cached
            return {"cpu_percent": 0.0, "memory_mb": 0.0, "memory_limit_mb": 0.0}

    async def restart_pod(self, namespace: str, pod_name: str) -> None:
        await asyncio.to_thread(self.core_api.delete_namespaced_pod, pod_name, namespace)

    async def list_workspace_namespaces(self) -> list[str]:
        namespaces = await asyncio.to_thread(
            self.core_api.list_namespace,
            label_selector="app=jupyter-workspace",
        )
        return [ns.metadata.name for ns in namespaces.items if ns.metadata and ns.metadata.name]

    async def restart_kernel(self, pod_ip: str, kernel_id: str) -> None:
        url = f"http://{pod_ip}:8888/api/kernels/{kernel_id}/restart"
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(url)
        response.raise_for_status()

    async def _cache_metrics(self, namespace: str, pod_name: str, data: dict[str, float]) -> None:
        if self.redis is None:
            return
        key = f"workspace:resource_usage:{namespace}:{pod_name}"
        payload = json.dumps(data)
        maybe_coro = self.redis.set(key, payload, ex=60)
        if asyncio.iscoroutine(maybe_coro):
            await maybe_coro

    async def _load_cached_metrics(self, namespace: str, pod_name: str) -> dict[str, float] | None:
        if self.redis is None:
            return None
        key = f"workspace:resource_usage:{namespace}:{pod_name}"
        maybe_coro = self.redis.get(key)
        raw = await maybe_coro if asyncio.iscoroutine(maybe_coro) else maybe_coro
        if not raw:
            return None
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8")
        obj = json.loads(raw)
        return {
            "cpu_percent": float(obj.get("cpu_percent", 0.0)),
            "memory_mb": float(obj.get("memory_mb", 0.0)),
            "memory_limit_mb": float(obj.get("memory_limit_mb", 0.0)),
        }

    @staticmethod
    def _cpu_to_millicores(value: str) -> float:
        if value.endswith("n"):
            return float(value[:-1]) / 1_000_000
        if value.endswith("u"):
            return float(value[:-1]) / 1_000
        if value.endswith("m"):
            return float(value[:-1])
        return float(value) * 1000

    @staticmethod
    def _memory_to_mb(value: str) -> float:
        units = {
            "Ki": 1 / 1024,
            "Mi": 1,
            "Gi": 1024,
            "Ti": 1024 * 1024,
            "K": 1 / 1000,
            "M": 1,
            "G": 1000,
            "T": 1000 * 1000,
        }
        for unit, factor in units.items():
            if value.endswith(unit):
                return float(value[: -len(unit)]) * factor
        return float(value) / (1024 * 1024)


class K8sService(KubernetesService):
    """Backward-compatible alias for existing imports."""

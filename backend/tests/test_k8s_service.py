"""Unit tests for Kubernetes service and templates."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from app.core.exceptions import ProvisioningError
from app.services.k8s_service import KubernetesService
from app.services.k8s_templates import build_pod_spec


@pytest.mark.asyncio
@patch("app.services.k8s_service.config.load_kube_config")
@patch("app.services.k8s_service.client.CoreV1Api")
@patch("app.services.k8s_service.client.CustomObjectsApi")
@patch("app.services.k8s_service.client.NetworkingV1Api")
async def test_create_namespace_sets_correct_labels(
    mock_network_api: MagicMock,
    mock_custom_api: MagicMock,
    mock_core_api: MagicMock,
    _mock_load_config: MagicMock,
) -> None:
    service = KubernetesService()
    service.core_api.create_namespace = MagicMock()
    service.core_api.create_namespaced_resource_quota = MagicMock()

    await service.create_workspace_namespace("ws123", "user001")

    created_namespace = service.core_api.create_namespace.call_args.args[0]
    assert created_namespace.metadata.name == "ws-ws123"
    assert created_namespace.metadata.labels["app"] == "jupyter-workspace"
    assert created_namespace.metadata.labels["user-id"] == "user001"
    assert created_namespace.metadata.labels["workspace-id"] == "ws123"
    assert mock_network_api.called
    assert mock_custom_api.called
    assert mock_core_api.called


def test_pod_spec_has_security_context() -> None:
    pod = build_pod_spec(
        workspace_id="ws123",
        user_id="u1",
        tier="cpu-standard",
        config={
            "notebook_pvc": "u1-notebooks",
            "dataset_pvc": "dataset-a",
            "model_pvc": "model-a",
            "jupyter_base_image": "repo/jupyter:latest",
        },
    )
    container = pod.spec.containers[0]
    assert container.security_context.run_as_non_root is True
    assert container.security_context.run_as_user == 1000
    assert container.security_context.read_only_root_filesystem is True
    assert container.security_context.allow_privilege_escalation is False
    assert container.security_context.capabilities.drop == ["ALL"]
    assert container.security_context.seccomp_profile.type == "RuntimeDefault"


def test_pod_spec_cpu_standard_limits() -> None:
    pod = build_pod_spec(
        workspace_id="ws123",
        user_id="u1",
        tier="cpu-standard",
        config={
            "notebook_pvc": "u1-notebooks",
            "dataset_pvc": None,
            "model_pvc": None,
            "jupyter_base_image": "repo/jupyter:latest",
        },
    )
    resources = pod.spec.containers[0].resources
    assert resources.requests["cpu"] == "250m"
    assert resources.requests["memory"] == "512Mi"
    assert resources.limits["cpu"] == "2"
    assert resources.limits["memory"] == "4Gi"


def test_pod_spec_gpu_t4_includes_gpu_resource() -> None:
    pod = build_pod_spec(
        workspace_id="ws123",
        user_id="u1",
        tier="gpu-t4",
        config={
            "notebook_pvc": "u1-notebooks",
            "dataset_pvc": None,
            "model_pvc": None,
            "jupyter_base_image": "repo/jupyter:latest",
        },
    )
    limits = pod.spec.containers[0].resources.limits
    assert limits["nvidia.com/gpu"] == "1"


@pytest.mark.asyncio
@patch("app.services.k8s_service.config.load_kube_config")
@patch("app.services.k8s_service.client.CoreV1Api")
@patch("app.services.k8s_service.client.CustomObjectsApi")
@patch("app.services.k8s_service.client.NetworkingV1Api")
async def test_wait_for_pod_ready_timeout_raises_error(
    _mock_network_api: MagicMock,
    _mock_custom_api: MagicMock,
    _mock_core_api: MagicMock,
    _mock_load_config: MagicMock,
) -> None:
    service = KubernetesService()
    not_ready_pod = SimpleNamespace(status=SimpleNamespace(phase="Pending", pod_ip=None))
    service.core_api.read_namespaced_pod = MagicMock(return_value=not_ready_pod)

    with pytest.raises(ProvisioningError):
        await service.wait_for_pod_ready("ws-test", "pod-a", timeout=1)


@pytest.mark.asyncio
@patch("app.services.k8s_service.config.load_kube_config")
@patch("app.services.k8s_service.client.CoreV1Api")
@patch("app.services.k8s_service.client.CustomObjectsApi")
@patch("app.services.k8s_service.client.NetworkingV1Api")
async def test_delete_namespace_called_with_correct_name(
    _mock_network_api: MagicMock,
    _mock_custom_api: MagicMock,
    _mock_core_api: MagicMock,
    _mock_load_config: MagicMock,
) -> None:
    service = KubernetesService()
    service.core_api.delete_namespace = MagicMock()

    await service.delete_namespace("ws-to-delete")
    args = service.core_api.delete_namespace.call_args
    assert args.args[0] == "ws-to-delete"
    assert args.kwargs["grace_period_seconds"] == 30

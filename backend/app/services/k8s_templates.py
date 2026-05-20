"""Kubernetes object templates for workspace workloads."""

from __future__ import annotations

from kubernetes.client import (
    V1Capabilities,
    V1ConfigMapEnvSource,
    V1Container,
    V1ContainerPort,
    V1EmptyDirVolumeSource,
    V1EnvFromSource,
    V1EnvVar,
    V1HTTPGetAction,
    V1LabelSelector,
    V1NetworkPolicy,
    V1NetworkPolicyEgressRule,
    V1NetworkPolicyIngressRule,
    V1NetworkPolicyPeer,
    V1NetworkPolicyPort,
    V1NetworkPolicySpec,
    V1ObjectMeta,
    V1PersistentVolumeClaimVolumeSource,
    V1Pod,
    V1PodSecurityContext,
    V1PodSpec,
    V1Probe,
    V1ResourceRequirements,
    V1SeccompProfile,
    V1SecretEnvSource,
    V1SecurityContext,
    V1Volume,
    V1VolumeMount,
)

TIER_RESOURCES: dict[str, dict[str, dict[str, str]]] = {
    "cpu-standard": {
        "requests": {"cpu": "250m", "memory": "512Mi"},
        "limits": {"cpu": "2", "memory": "4Gi"},
    },
    "cpu-large": {
        "requests": {"cpu": "500m", "memory": "1Gi"},
        "limits": {"cpu": "4", "memory": "8Gi"},
    },
    "gpu-t4": {
        "requests": {"cpu": "500m", "memory": "2Gi"},
        "limits": {"cpu": "4", "memory": "16Gi", "nvidia.com/gpu": "1"},
    },
}


def build_pod_spec(workspace_id: str, user_id: str, tier: str, config: dict) -> V1Pod:
    resources = TIER_RESOURCES.get(tier)
    if resources is None:
        raise ValueError(f"Unsupported tier: {tier}")

    pod_name = f"ws-pod-{workspace_id}"
    notebook_pvc = str(config["notebook_pvc"])
    dataset_pvc = config.get("dataset_pvc")
    model_pvc = config.get("model_pvc")

    volumes = [
        V1Volume(
            name="notebooks",
            persistent_volume_claim=V1PersistentVolumeClaimVolumeSource(claim_name=notebook_pvc, read_only=False),
        ),
        V1Volume(name="tmp", empty_dir=V1EmptyDirVolumeSource(size_limit="2Gi")),
        V1Volume(name="jupyter-config", empty_dir=V1EmptyDirVolumeSource()),
    ]

    mounts = [
        V1VolumeMount(name="notebooks", mount_path="/workspace/notebooks", read_only=False),
        V1VolumeMount(name="tmp", mount_path="/tmp", read_only=False),
        V1VolumeMount(name="jupyter-config", mount_path="/workspace/.jupyter", read_only=False),
    ]

    if dataset_pvc:
        volumes.append(
            V1Volume(
                name="datasets",
                persistent_volume_claim=V1PersistentVolumeClaimVolumeSource(
                    claim_name=str(dataset_pvc),
                    read_only=True,
                ),
            )
        )
        mounts.append(V1VolumeMount(name="datasets", mount_path="/workspace/datasets", read_only=True))

    if model_pvc:
        volumes.append(
            V1Volume(
                name="models",
                persistent_volume_claim=V1PersistentVolumeClaimVolumeSource(
                    claim_name=str(model_pvc),
                    read_only=True,
                ),
            )
        )
        mounts.append(V1VolumeMount(name="models", mount_path="/workspace/models", read_only=True))

    container = V1Container(
        name="jupyter",
        image=str(config["jupyter_base_image"]),
        image_pull_policy="IfNotPresent",
        ports=[V1ContainerPort(container_port=8888, name="http")],
        command=["jupyter", "lab", "--ip=0.0.0.0", "--port=8888", "--no-browser", "--ServerApp.token=$(JUPYTER_TOKEN)"],
        env=[
            V1EnvVar(name="WORKSPACE_ID", value=workspace_id),
            V1EnvVar(name="USER_ID", value=user_id),
        ],
        env_from=[
            V1EnvFromSource(secret_ref=V1SecretEnvSource(name=f"ws-secret-{workspace_id}")),
            V1EnvFromSource(config_map_ref=V1ConfigMapEnvSource(name="workspace-config")),
        ],
        resources=V1ResourceRequirements(requests=resources["requests"], limits=resources["limits"]),
        security_context=V1SecurityContext(
            run_as_non_root=True,
            run_as_user=1000,
            read_only_root_filesystem=True,
            allow_privilege_escalation=False,
            capabilities=V1Capabilities(drop=["ALL"]),
            seccomp_profile=V1SeccompProfile(type="RuntimeDefault"),
        ),
        volume_mounts=mounts,
        readiness_probe=V1Probe(
            http_get=V1HTTPGetAction(path="/api/status", port=8888),
            initial_delay_seconds=5,
            period_seconds=3,
            timeout_seconds=2,
            failure_threshold=10,
        ),
        liveness_probe=V1Probe(
            http_get=V1HTTPGetAction(path="/api/status", port=8888),
            initial_delay_seconds=30,
            period_seconds=15,
            timeout_seconds=3,
            failure_threshold=5,
        ),
    )

    return V1Pod(
        metadata=V1ObjectMeta(
            name=pod_name,
            labels={
                "app": "jupyter-workspace",
                "workspace-id": workspace_id,
                "user-id": user_id,
                "tier": tier,
            },
        ),
        spec=V1PodSpec(
            restart_policy="OnFailure",
            security_context=V1PodSecurityContext(run_as_non_root=True, run_as_user=1000),
            containers=[container],
            volumes=volumes,
        ),
    )


def build_network_policy(workspace_id: str) -> V1NetworkPolicy:
    return V1NetworkPolicy(
        metadata=V1ObjectMeta(
            name=f"ws-netpol-{workspace_id}",
            labels={"app": "jupyter-workspace", "workspace-id": workspace_id},
        ),
        spec=V1NetworkPolicySpec(
            pod_selector=V1LabelSelector(match_labels={"workspace-id": workspace_id}),
            policy_types=["Ingress", "Egress"],
            ingress=[
                V1NetworkPolicyIngressRule(
                    _from=[
                        V1NetworkPolicyPeer(
                            namespace_selector=V1LabelSelector(
                                match_labels={"kubernetes.io/metadata.name": "workspace-proxy"}
                            )
                        )
                    ],
                    ports=[V1NetworkPolicyPort(port=8888, protocol="TCP")],
                )
            ],
            egress=[
                V1NetworkPolicyEgressRule(
                    ports=[
                        V1NetworkPolicyPort(port=80, protocol="TCP"),
                        V1NetworkPolicyPort(port=443, protocol="TCP"),
                    ]
                ),
                V1NetworkPolicyEgressRule(ports=[V1NetworkPolicyPort(port=53, protocol="UDP")]),
            ],
        ),
    )

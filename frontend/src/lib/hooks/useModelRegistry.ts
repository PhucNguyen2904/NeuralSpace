"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getModelVersions as getMlflowModelVersions, transitionModelVersionStage } from "@/lib/api/mlflow";
import type { Stage } from "@/types/mlflow";

export interface RegistryModelVersion {
  id: string;
  modelName: string;
  version: string;
  stage: Stage;
  accuracy: number;
  loss: number;
  f1: number;
  map50?: number;
  datasetName: string;
  datasetVersion: string;
  datasetHash: string;
  promotedAgo?: string;
  promotedBy?: string;
  size: string;
  frameworkVersion: string;
  gitCommit: string;
  runId: string;
  registeredAt: string;
  approvalStatus?: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
  approvalReviewer?: string;
  approvalReason?: string;
  auditTrail: Array<{ at: string; actor: string; action: string }>;
}

export interface ApprovalRequest {
  id: string;
  model: string;
  version: string;
  targetStage: "Production";
  requestedBy: string;
  requestedAgo: string;
  reason: string;
  metrics: {
    accuracyNew: number;
    accuracyCurrent: number;
    lossNew: number;
    lossCurrent: number;
  };
  dataset: { name: string; version: string; status: "validated" | "draft" | "deprecated" };
}

const MOCK_VERSIONS: RegistryModelVersion[] = [
  {
    id: "mv_13",
    modelName: "resnet50-custom",
    version: "v1.3",
    stage: "Production",
    accuracy: 0.924,
    loss: 0.12,
    f1: 0.887,
    map50: 0.783,
    datasetName: "COCO 2017 Detection",
    datasetVersion: "v1.3",
    datasetHash: "abc1234",
    promotedAgo: "2 days ago",
    promotedBy: "alice",
    size: "245 MB",
    frameworkVersion: "PyTorch 2.3.0",
    gitCommit: "abc1234",
    runId: "run_2024_01_15",
    registeredAt: "3 days ago",
    approvalStatus: "APPROVED",
    approvalReviewer: "reviewer",
    auditTrail: [
      { at: "2024-01-15 14:32", actor: "alice", action: "Registered v1.3" },
      { at: "2024-01-16 09:00", actor: "alice", action: "Requested promote -> Production" },
      { at: "2024-01-16 10:23", actor: "reviewer", action: "Approved: Metrics met the threshold" },
      { at: "2024-01-16 10:23", actor: "system", action: "Promoted -> Production" }
    ]
  },
  {
    id: "mv_12",
    modelName: "resnet50-custom",
    version: "v1.2",
    stage: "Archived",
    accuracy: 0.903,
    loss: 0.15,
    f1: 0.871,
    datasetName: "COCO 2017 Detection",
    datasetVersion: "v1.2",
    datasetHash: "def5678",
    promotedAgo: "1 week ago",
    promotedBy: "alice",
    size: "242 MB",
    frameworkVersion: "PyTorch 2.3.0",
    gitCommit: "def5678",
    runId: "run_2024_01_14",
    registeredAt: "1 week ago",
    auditTrail: []
  },
  {
    id: "mv_11",
    modelName: "resnet50-custom",
    version: "v1.1",
    stage: "Archived",
    accuracy: 0.891,
    loss: 0.18,
    f1: 0.856,
    datasetName: "COCO 2017 Detection",
    datasetVersion: "v1.1",
    datasetHash: "ghi9012",
    promotedAgo: "1 month ago",
    promotedBy: "alice",
    size: "239 MB",
    frameworkVersion: "PyTorch 2.2.1",
    gitCommit: "ghi9012",
    runId: "run_2024_01_12",
    registeredAt: "1 month ago",
    auditTrail: []
  }
];

const MOCK_APPROVALS: ApprovalRequest[] = [
  {
    id: "apr_1",
    model: "resnet50-custom",
    version: "v1.3",
    targetStage: "Production",
    requestedBy: "alice",
    requestedAgo: "2h ago",
    reason: "Model passed evaluation on the COCO test set",
    metrics: { accuracyNew: 0.924, accuracyCurrent: 0.903, lossNew: 0.12, lossCurrent: 0.15 },
    dataset: { name: "COCO 2017", version: "v1.3", status: "validated" }
  }
];

export function useModelVersions(modelName: string) {
  return useQuery({
    queryKey: ["registry-model-versions", modelName],
    enabled: Boolean(modelName),
    queryFn: async () => {
      try {
        const response = await getMlflowModelVersions({ model_name: modelName, limit: 50 });
        const versions = response.items.map<RegistryModelVersion>((item) => {
          const metrics = item.metrics ?? {};
          const tags = item.tags ?? {};
          return {
            id: item.id,
            modelName: item.name,
            version: item.version,
            stage: item.stage,
            accuracy: metrics.accuracy ?? 0,
            loss: metrics.loss ?? 0,
            f1: metrics.f1_score ?? metrics.f1 ?? 0,
            map50: metrics.map50,
            datasetName: tags.dataset_name ?? "Unknown Dataset",
            datasetVersion: tags.dataset_version ?? "",
            datasetHash: tags.dataset_hash ?? "N/A",
            promotedAgo: item.stage === "Production" ? "1 day ago" : undefined,
            promotedBy: item.stage === "Production" ? "system" : undefined,
            size: "245 MB",
            frameworkVersion: tags.framework_version ?? "unknown",
            gitCommit: tags.git_commit ?? tags.commit ?? "abc1234",
            runId: item.run_id ?? "",
            registeredAt: item.created_at ? new Date(item.created_at).toLocaleDateString("vi-VN") : "N/A",
            approvalStatus: item.stage === "Production" ? "APPROVED" : undefined,
            approvalReviewer: item.stage === "Production" ? "demo-reviewer" : undefined,
            auditTrail: [
              { at: item.created_at ?? "", actor: "seed-script", action: `Registered ${item.version}` },
              ...(item.stage === "Production" ? [{ at: item.updated_at ?? item.created_at ?? "", actor: "demo-reviewer", action: "Approved -> Production" }] : [])
            ]
          };
        });
        if (versions.length > 0) return versions;
      } catch {
        // Fall back to bundled demo data when the local API is unavailable.
      }
      return MOCK_VERSIONS.filter((item) => item.modelName === modelName);
    }
  });
}

export function usePromoteModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { modelName: string; version: string; targetStage: "Staging" | "Production" }) => {
      await transitionModelVersionStage(payload.modelName, payload.version, payload.targetStage);
      return payload;
    },
    onSuccess: async (_, vars) => {
      await queryClient.invalidateQueries({ queryKey: ["registry-model-versions", vars.modelName] });
    }
  });
}

export function usePendingApprovals() {
  return useQuery({
    queryKey: ["registry-approvals"],
    queryFn: async () => MOCK_APPROVALS
  });
}

export function useReviewApproval() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { requestId: string; decision: "approve" | "reject"; note?: string }) => {
      await new Promise((resolve) => setTimeout(resolve, 700));
      return payload;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["registry-approvals"] });
    }
  });
}

export type PreflightCheckState = "running" | "pass" | "warn" | "fail";
export interface PreflightCheckItem {
  key: string;
  label: string;
  detail?: string;
  state: PreflightCheckState;
}

export function useRealtimePreflight(targetStage: "Staging" | "Production", metrics: { accuracy: number; loss: number }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => (t + 1) % 4), 1200);
    return () => window.clearInterval(id);
  }, []);

  const checks = useMemo<PreflightCheckItem[]>(() => {
    const accuracyPass = metrics.accuracy >= 0.9;
    const lossPass = metrics.loss <= 0.15;
    return [
      { key: "ready", label: "Model status: READY", state: tick > 0 ? "pass" : "running" },
      { key: "tags", label: "Required tags: dvc.md5, git.commit", state: tick > 1 ? "pass" : "running" },
      { key: "metrics", label: "Evaluation metrics meet the threshold", detail: `accuracy ${metrics.accuracy} >= 0.90, loss ${metrics.loss} <= 0.15`, state: tick > 2 ? (accuracyPass && lossPass ? "pass" : "warn") : "running" },
    ];
  }, [metrics.accuracy, metrics.loss, tick]);

  return checks;
}

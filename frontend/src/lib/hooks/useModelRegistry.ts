"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
    promotedAgo: "2 ngày trước",
    promotedBy: "alice",
    size: "245 MB",
    frameworkVersion: "PyTorch 2.3.0",
    gitCommit: "abc1234",
    runId: "run_2024_01_15",
    registeredAt: "3 ngày trước",
    approvalStatus: "APPROVED",
    approvalReviewer: "reviewer",
    auditTrail: [
      { at: "2024-01-15 14:32", actor: "alice", action: "Registered v1.3" },
      { at: "2024-01-16 09:00", actor: "alice", action: "Requested promote -> Production" },
      { at: "2024-01-16 10:23", actor: "reviewer", action: "Approved: Metrics đạt threshold" },
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
    promotedAgo: "1 tuần trước",
    promotedBy: "alice",
    size: "242 MB",
    frameworkVersion: "PyTorch 2.3.0",
    gitCommit: "def5678",
    runId: "run_2024_01_14",
    registeredAt: "1 tuần trước",
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
    promotedAgo: "1 tháng trước",
    promotedBy: "alice",
    size: "239 MB",
    frameworkVersion: "PyTorch 2.2.1",
    gitCommit: "ghi9012",
    runId: "run_2024_01_12",
    registeredAt: "1 tháng trước",
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
    reason: "Model đã pass evaluation với COCO test set",
    metrics: { accuracyNew: 0.924, accuracyCurrent: 0.903, lossNew: 0.12, lossCurrent: 0.15 },
    dataset: { name: "COCO 2017", version: "v1.3", status: "validated" }
  }
];

export function useModelVersions(modelName: string) {
  return useQuery({
    queryKey: ["registry-model-versions", modelName],
    enabled: Boolean(modelName),
    queryFn: async () => MOCK_VERSIONS.filter((item) => item.modelName === modelName)
  });
}

export function usePromoteModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { modelName: string; version: string; targetStage: "Staging" | "Production"; reason: string; reviewers: string[] }) => {
      await new Promise((resolve) => setTimeout(resolve, 800));
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
      { key: "metrics", label: "Evaluation metrics đạt threshold", detail: `accuracy ${metrics.accuracy} >= 0.90, loss ${metrics.loss} <= 0.15`, state: tick > 2 ? (accuracyPass && lossPass ? "pass" : "fail") : "running" },
      { key: "approval", label: targetStage === "Production" ? "Chưa có approval request -> sẽ tạo mới" : "Staging auto-approved", state: targetStage === "Production" ? "warn" : "pass" }
    ];
  }, [metrics.accuracy, metrics.loss, targetStage, tick]);

  return checks;
}

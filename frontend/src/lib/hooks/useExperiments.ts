"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteRun, getExperiments, getRunById, getRuns } from "@/lib/api/mlflow";
import type { Experiment, Run, RunStatus } from "@/types/mlflow";

export interface ExperimentSummary extends Experiment {
  run_count: number;
}

export interface RunFilters {
  search?: string;
  status?: RunStatus | "ALL";
  minAccuracy?: number;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: "name" | "status" | "accuracy" | "loss" | "f1_score" | "started";
  sortOrder?: "asc" | "desc";
}

export interface RunArtifact {
  path: string;
  type: "folder" | "file" | "image";
  size?: string;
}

export interface RunDetailData extends Run {
  branch: string;
  commit: string;
  durationLabel: string;
  metricsMap: Record<string, number>;
  metricHistory: Array<{ epoch: number; train_accuracy: number; val_accuracy: number; train_loss: number; val_loss: number }>;
  paramsMap: Record<string, string | number>;
  artifacts: RunArtifact[];
  dataset: {
    id: string;
    name: string;
    version: string;
    dvcHash: string;
    size: string;
    status: "draft" | "validated" | "deprecated";
  };
}

const MOCK_EXPERIMENTS: ExperimentSummary[] = [
  { experiment_id: "exp_resnet", name: "ResNet Training", lifecycle_stage: "active", run_count: 23, created_at: "2024-01-10T08:30:00Z", tags: { description: "Training ResNet models for image classification." } },
  { experiment_id: "exp_yolo", name: "YOLOv8 Custom", lifecycle_stage: "active", run_count: 8, created_at: "2024-01-12T14:15:00Z", tags: { description: "Object detection using YOLOv8 on custom dataset." } },
  { experiment_id: "exp_bert", name: "BERT Sentiment", lifecycle_stage: "active", run_count: 15, created_at: "2024-01-15T09:45:00Z", tags: { description: "Fine-tuning BERT for sentiment analysis." } }
];

const MOCK_RUNS: RunDetailData[] = [
  createMockRun("run_2024_01_15", "FINISHED", 0.924, 0.12, 3, "alice"),
  createMockRun("run_2024_01_14", "FINISHED", 0.903, 0.15, 28, "alice"),
  createMockRun("run_2024_01_13", "FAILED", 0, 0, 52, "bob"),
  createMockRun("run_2024_01_12", "FINISHED", 0.891, 0.18, 76, "alice")
];

function createMockRun(name: string, status: RunStatus, accuracy: number, loss: number, hoursAgo: number, user: string): RunDetailData {
  const start = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
  const metricHistory = Array.from({ length: 51 }).map((_, epoch) => ({
    epoch,
    train_accuracy: Math.min(0.99, 0.55 + epoch * 0.007 + Math.random() * 0.01),
    val_accuracy: Math.min(0.97, 0.52 + epoch * 0.007 + Math.random() * 0.01),
    train_loss: Math.max(0.05, 1.2 - epoch * 0.022 + Math.random() * 0.02),
    val_loss: Math.max(0.07, 1.3 - epoch * 0.022 + Math.random() * 0.03)
  }));

  return {
    run_id: `rid_${name}`,
    experiment_id: "exp_resnet",
    name,
    status,
    start_time: start.toISOString(),
    end_time: status === "FINISHED" ? new Date(start.getTime() + 45 * 60 * 1000).toISOString() : undefined,
    duration_ms: 45 * 60 * 1000 + 23 * 1000,
    artifact_uri: "s3://mlflow-artifacts/exp_resnet",
    user_id: user,
    tags: { branch: "main", commit: "abc1234" },
    branch: "main",
    commit: "abc1234",
    durationLabel: "45m 23s",
    metricsMap: { accuracy, loss, f1_score: accuracy > 0 ? accuracy - 0.037 : 0 },
    metricHistory,
    paramsMap: { lr: 0.001, batch_size: 32, epochs: 50, optimizer: "Adam" },
    artifacts: [
      { path: "model/", type: "folder" },
      { path: "model/model.pt", type: "file", size: "245 MB" },
      { path: "plots/confusion_matrix.png", type: "image" },
      { path: "plots/roc_curve.png", type: "image" },
      { path: "training_log.txt", type: "file", size: "2.4 MB" }
    ],
    dataset: {
      id: "dataset_1",
      name: "COCO 2017 Detection",
      version: "v1.3",
      dvcHash: "abc1234",
      size: "18.7 GB",
      status: "validated"
    }
  };
}

function sortRuns(runs: RunDetailData[], filters: RunFilters): RunDetailData[] {
  const sortBy = filters.sortBy ?? "started";
  const sortOrder = filters.sortOrder ?? "desc";
  return [...runs].sort((a, b) => {
    const factor = sortOrder === "asc" ? 1 : -1;
    if (sortBy === "accuracy") return factor * ((a.metricsMap.accuracy ?? -1) - (b.metricsMap.accuracy ?? -1));
    if (sortBy === "loss") return factor * ((a.metricsMap.loss ?? Number.POSITIVE_INFINITY) - (b.metricsMap.loss ?? Number.POSITIVE_INFINITY));
    if (sortBy === "f1_score") return factor * ((a.metricsMap.f1_score ?? -1) - (b.metricsMap.f1_score ?? -1));
    if (sortBy === "name") return factor * (a.name ?? "").localeCompare(b.name ?? "");
    if (sortBy === "status") return factor * a.status.localeCompare(b.status);
    return factor * (new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  });
}

function formatDuration(durationMs?: number): string | undefined {
  if (!durationMs) return undefined;
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  }
  return `${minutes}m ${seconds}s`;
}

export function useExperimentList() {
  return useQuery({
    queryKey: ["experiments-list"],
    queryFn: async () => {
      try {
        const response = await getExperiments({ limit: 50 });
        return response.items.map((exp) => ({ ...exp, run_count: exp.run_count ?? 0 }));
      } catch {
        return [];
      }
    }
  });
}

export function useRunList(experimentId: string, filters: RunFilters) {
  return useQuery({
    queryKey: ["runs-list", experimentId, filters],
    enabled: Boolean(experimentId),
    queryFn: async () => {
      let runs: RunDetailData[] = [];
      try {
        const response = await getRuns({ experiment_id: experimentId, status: filters.status === "ALL" ? undefined : filters.status, limit: 200 });
        runs = response.items.map((run, index) => {
          const base = MOCK_RUNS[index % MOCK_RUNS.length];
          const paramsMap = Object.fromEntries((run.params ?? []).map((param) => [param.key, param.value]));
          const metricsMap = Object.fromEntries((run.metrics ?? []).map((metric) => [metric.key, metric.value]));
          return {
            ...base,
            ...run,
            name: run.name ?? base.name,
            status: run.status,
            start_time: run.start_time,
            branch: run.tags?.branch ?? base.branch,
            commit: run.git_commit ?? run.tags?.commit ?? base.commit,
            durationLabel: formatDuration(run.duration_ms) ?? base.durationLabel,
            metricsMap: {
              accuracy: Number(metricsMap.accuracy ?? base.metricsMap.accuracy),
              loss: Number(metricsMap.loss ?? base.metricsMap.loss),
              f1_score: Number(metricsMap.f1_score ?? metricsMap.f1 ?? base.metricsMap.f1_score)
            },
            paramsMap: Object.keys(paramsMap).length ? paramsMap : base.paramsMap,
            dataset: {
              ...base.dataset,
              id: run.dvc_dataset_version_id ?? base.dataset.id,
              name: run.dvc_dataset_version_id ? "Dataset version" : base.dataset.name,
              version: run.dvc_dataset_version_id ? run.dvc_dataset_version_id.slice(0, 8) : base.dataset.version,
              dvcHash: run.dvc_md5 ?? base.dataset.dvcHash
            }
          };
        });
      } catch {
        runs = [];
      }

      const filtered = runs.filter((run) => {
        if (filters.search && !(run.name ?? "").toLowerCase().includes(filters.search.toLowerCase())) return false;
        if (filters.status && filters.status !== "ALL" && run.status !== filters.status) return false;
        if (typeof filters.minAccuracy === "number" && (run.metricsMap.accuracy ?? 0) < filters.minAccuracy) return false;
        if (filters.dateFrom && new Date(run.start_time) < new Date(filters.dateFrom)) return false;
        if (filters.dateTo && new Date(run.start_time) > new Date(filters.dateTo)) return false;
        return true;
      });

      return sortRuns(filtered, filters);
    }
  });
}

export function useRunDetail(runId: string) {
  return useQuery({
    queryKey: ["run-detail", runId],
    enabled: Boolean(runId),
    queryFn: async () => {
      try {
        const run = await getRunById(runId);
        const mock = MOCK_RUNS.find((item) => item.run_id === runId) ?? MOCK_RUNS[0];
        const paramsMap = Object.fromEntries((run.params ?? []).map((param) => [param.key, param.value]));
        const metricsMap = Object.fromEntries((run.metrics ?? []).map((metric) => [metric.key, metric.value]));
        return {
          ...mock,
          ...run,
          name: run.name ?? mock.name,
          branch: run.tags?.branch ?? mock.branch,
          commit: run.git_commit ?? run.tags?.commit ?? mock.commit,
          durationLabel: formatDuration(run.duration_ms) ?? mock.durationLabel,
          metricsMap: {
            accuracy: Number(metricsMap.accuracy ?? mock.metricsMap.accuracy),
            loss: Number(metricsMap.loss ?? mock.metricsMap.loss),
            f1_score: Number(metricsMap.f1_score ?? metricsMap.f1 ?? mock.metricsMap.f1_score)
          },
          paramsMap: Object.keys(paramsMap).length ? paramsMap : mock.paramsMap,
          dataset: {
            ...mock.dataset,
            id: run.dvc_dataset_version_id ?? mock.dataset.id,
            name: run.dvc_dataset_version_id ? "Dataset version" : mock.dataset.name,
            version: run.dvc_dataset_version_id ? run.dvc_dataset_version_id.slice(0, 8) : mock.dataset.version,
            dvcHash: run.dvc_md5 ?? mock.dataset.dvcHash
          }
        };
      } catch {
        throw new Error("Run not found");
      }
    }
  });
}

export function useDeleteRun() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (runId: string) => deleteRun(runId),
    onSuccess: async (_data, runId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["runs-list"] }),
        queryClient.invalidateQueries({ queryKey: ["experiments-list"] }),
        queryClient.invalidateQueries({ queryKey: ["run-detail", runId] }),
        queryClient.invalidateQueries({ queryKey: ["lineage-graph"] }),
        queryClient.invalidateQueries({ queryKey: ["lineage-impact-analysis"] }),
        queryClient.invalidateQueries({ queryKey: ["registry-model-versions"] }),
        queryClient.invalidateQueries({ queryKey: ["models"] })
      ]);
    }
  });
}

export function useCompareRuns(runIds: string[]) {
  const runsQuery = useQuery({
    queryKey: ["compare-runs", runIds],
    enabled: runIds.length > 1,
    queryFn: async () => {
      const details = await Promise.all(runIds.map((id) => useRunDetailFallback(id)));
      return details;
    }
  });

  const comparison = useMemo(() => {
    const runs = runsQuery.data ?? [];
    const metrics = ["accuracy", "loss", "f1_score"];
    return metrics.map((metric) => {
      const values = runs.map((run) => ({ runId: run.run_id, value: run.metricsMap[metric] ?? 0 }));
      const best = metric === "loss"
        ? values.reduce((min, item) => (item.value < min.value ? item : min), values[0] ?? { runId: "", value: 0 }).runId
        : values.reduce((max, item) => (item.value > max.value ? item : max), values[0] ?? { runId: "", value: 0 }).runId;
      return { metric, values, best };
    });
  }, [runsQuery.data]);

  return {
    ...runsQuery,
    comparison
  };
}

async function useRunDetailFallback(runId: string): Promise<RunDetailData> {
  try {
    const run = await getRunById(runId);
    const mock = MOCK_RUNS.find((item) => item.run_id === runId) ?? MOCK_RUNS[0];
    return { ...mock, ...run, name: run.name ?? mock.name };
  } catch {
    return MOCK_RUNS.find((item) => item.run_id === runId) ?? MOCK_RUNS[0];
  }
}

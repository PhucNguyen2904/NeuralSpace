"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteExperiment, deleteRun, getExperiments, getRunById, getRuns } from "@/lib/api/mlflow";
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

function processRunData(run: Run): RunDetailData {
  const paramsMap = Object.fromEntries((run.params ?? []).map((param) => [param.key, param.value]));
  const metricsMap = Object.fromEntries((run.metrics ?? []).map((metric) => [metric.key, Number(metric.value)]));

  // Determine an artifact structure. If there's an artifact_uri, we list it as the main folder.
  const artifacts: RunArtifact[] = [];
  if (run.artifact_uri) {
    artifacts.push({ path: "model_artifacts/", type: "folder" });
    if (run.artifact_uri.includes("best.pt") || run.artifact_uri.includes(".pt") || run.artifact_uri.includes(".onnx") || run.artifact_uri.includes(".zip")) {
      artifacts.push({ path: "model_artifacts/weights", type: "file" });
    }
  }

  // Attempt to build some history from tags if it exists, otherwise empty. (Real metric history needs a separate API call)
  const metricHistory: Array<{ epoch: number; train_accuracy: number; val_accuracy: number; train_loss: number; val_loss: number }> = [];
  
  return {
    ...run,
    name: run.name || run.run_id || "Unnamed Run",
    branch: run.tags?.branch || "main",
    commit: run.git_commit || run.tags?.commit || "-",
    durationLabel: formatDuration(run.duration_ms) || "-",
    metricsMap: {
      ...metricsMap,
      accuracy: Number(metricsMap.accuracy || metricsMap["metrics/accuracy"] || 0),
      loss: Number(metricsMap.loss || metricsMap["metrics/loss"] || 0),
      f1_score: Number(metricsMap.f1_score || metricsMap.f1 || metricsMap["metrics/f1"] || 0)
    },
    paramsMap: paramsMap,
    artifacts: artifacts,
    metricHistory: metricHistory,
    dataset: {
      id: run.dvc_dataset_version_id || "-",
      name: run.dvc_dataset_version_id ? "Linked Dataset" : "Unknown Dataset",
      version: run.dvc_dataset_version_id ? run.dvc_dataset_version_id.slice(0, 8) : "-",
      dvcHash: run.dvc_md5 || "-",
      size: "-",
      status: "validated"
    }
  };
}

export function useExperimentList() {
  return useQuery({
    queryKey: ["experiments-list"],
    staleTime: 2 * 60_000,
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
    staleTime: 60_000,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      let runs: RunDetailData[] = [];
      try {
        const response = await getRuns({ experiment_id: experimentId, status: filters.status === "ALL" ? undefined : filters.status, limit: 200 });
        runs = response.items.map(processRunData);
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
        return processRunData(run);
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

export function useDeleteExperiment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (experimentId: string) => deleteExperiment(experimentId),
    onSuccess: async (_data, experimentId) => {
      queryClient.removeQueries({ queryKey: ["runs-list", experimentId] });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["experiments-list"] }),
        queryClient.invalidateQueries({ queryKey: ["runs-list"] }),
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
      const details = await Promise.all(runIds.map(async (id) => {
        try {
          const run = await getRunById(id);
          return processRunData(run);
        } catch {
          // fallback to empty if missing
          return processRunData({ run_id: id, name: id, status: "FAILED", start_time: new Date().toISOString(), tags: {}, params: [], metrics: [], user_id: "" } as any);
        }
      }));
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

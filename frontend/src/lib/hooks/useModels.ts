"use client";

import { create } from "zustand";
import { useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { getModelById, getModelMetrics, getModels, getModelVersions, loadModelToWorkspace } from "@/lib/api/models";
import type { ModelFilters, ModelListParams } from "@/types/model";

export const defaultModelFilters: ModelFilters = {
  search: "",
  frameworks: [],
  taskTypes: [],
  status: "all",
  minMetric: undefined,
  sizeCategory: "all",
  sort: "newest",
  view: "grid"
};

type ModelStore = { filters: ModelFilters; setFilters: (patch: Partial<ModelFilters>) => void; resetFilters: () => void };
export const useModelFilterStore = create<ModelStore>((set) => ({
  filters: defaultModelFilters,
  setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
  resetFilters: () => set({ filters: defaultModelFilters })
}));

function toParams(filters: ModelFilters): ModelListParams {
  return {
    search: filters.search || undefined,
    framework: filters.frameworks.length ? filters.frameworks : undefined,
    task_type: filters.taskTypes.length ? filters.taskTypes : undefined,
    status: filters.status === "all" ? undefined : filters.status,
    min_metric: filters.minMetric,
    size_category: filters.sizeCategory === "all" ? undefined : filters.sizeCategory,
    sort: filters.sort,
    page: 1,
    limit: 18
  };
}

export function useModels(filters: ModelFilters) {
  const params = useMemo(() => toParams(filters), [filters]);
  return useQuery({ queryKey: ["models", params], queryFn: () => getModels(params), staleTime: 60_000, placeholderData: (p) => p });
}

export function useModelDetail(id: string) {
  const detail = useQuery({ queryKey: ["model-detail", id], queryFn: () => getModelById(id), enabled: Boolean(id) });
  const metrics = useQuery({ queryKey: ["model-metrics", id], queryFn: () => getModelMetrics(id), enabled: Boolean(id) });
  const versions = useQuery({ queryKey: ["model-versions", id], queryFn: () => getModelVersions(id), enabled: Boolean(id) });
  return { detail, metrics, versions };
}

export function useModelComparison(ids: string[]) {
  return useQuery({
    queryKey: ["model-comparison", ids],
    queryFn: async () => Promise.all(ids.map((id) => getModelById(id))),
    enabled: ids.length >= 2
  });
}

export function useLoadModel() {
  return useMutation({
    mutationFn: ({ modelId, workspaceId, mountPath }: { modelId: string; workspaceId: string; mountPath: string }) =>
      loadModelToWorkspace(modelId, workspaceId, mountPath)
  });
}

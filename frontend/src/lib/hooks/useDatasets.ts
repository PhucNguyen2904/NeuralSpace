"use client";

import { create } from "zustand";
import { useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { subDays, startOfDay, subMonths } from "date-fns";
import { getDatasetById, getDatasets, getDatasetPreview, mountDatasetToWorkspace } from "@/lib/api/datasets";
import type { DatasetFilters, DatasetListParams } from "@/types/dataset";

export const defaultDatasetFilters: DatasetFilters = {
  search: "",
  types: [],
  status: "all",
  sizeMin: 0,
  sizeMax: 50 * 1024 * 1024 * 1024,
  createdWithin: "all",
  tags: [],
  sort: "newest",
  view: "grid"
};

type DatasetFilterStore = {
  filters: DatasetFilters;
  setFilters: (patch: Partial<DatasetFilters>) => void;
  resetFilters: () => void;
};

export const useDatasetFilterStore = create<DatasetFilterStore>((set) => ({
  filters: defaultDatasetFilters,
  setFilters: (patch) => set((state) => ({ filters: { ...state.filters, ...patch } })),
  resetFilters: () => set({ filters: defaultDatasetFilters })
}));

function createdAfterFromFilter(createdWithin: DatasetFilters["createdWithin"]): string | undefined {
  const now = new Date();
  if (createdWithin === "today") return startOfDay(now).toISOString();
  if (createdWithin === "7d") return subDays(now, 7).toISOString();
  if (createdWithin === "30d") return subDays(now, 30).toISOString();
  if (createdWithin === "3m") return subMonths(now, 3).toISOString();
  return undefined;
}

function toParams(filters: DatasetFilters): DatasetListParams {
  return {
    search: filters.search || undefined,
    type: filters.types.length ? filters.types : undefined,
    status: filters.status === "all" ? undefined : filters.status,
    size_min: filters.sizeMin,
    size_max: filters.sizeMax,
    tags: filters.tags.length ? filters.tags : undefined,
    created_after: createdAfterFromFilter(filters.createdWithin),
    sort: filters.sort,
    page: 1,
    limit: 24
  };
}

export function useDatasets(filters: DatasetFilters) {
  const params = useMemo(() => toParams(filters), [filters]);
  return useQuery({
    queryKey: ["datasets", params],
    queryFn: () => getDatasets(params),
    staleTime: 60_000,
    placeholderData: (previous) => previous
  });
}

export function useDatasetDetail(id: string) {
  const detail = useQuery({
    queryKey: ["dataset-detail", id],
    queryFn: () => getDatasetById(id),
    enabled: Boolean(id)
  });
  const preview = useQuery({
    queryKey: ["dataset-preview", id],
    queryFn: () => getDatasetPreview(id),
    enabled: Boolean(id)
  });
  return { detail, preview };
}

export function useMountDatasetMutation() {
  return useMutation({
    mutationFn: ({ datasetId, workspaceId }: { datasetId: string; workspaceId: string }) =>
      mountDatasetToWorkspace(datasetId, workspaceId)
  });
}

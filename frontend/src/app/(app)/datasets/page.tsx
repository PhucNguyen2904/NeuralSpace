"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { Grid2X2, List, Plus, SearchX } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { DatasetCard } from "@/components/datasets/DatasetCard";
import { DatasetDetailDrawer } from "@/components/datasets/DatasetDetailDrawer";
import { DatasetRow } from "@/components/datasets/DatasetRow";
import { FilterPanel } from "@/components/datasets/FilterPanel";
import { DatasetUploadModal } from "@/components/datasets/upload/DatasetUploadModal";
import { Button } from "@/components/ui";
import { useDatasets, useDatasetFilterStore, useMountDatasetMutation } from "@/lib/hooks/useDatasets";
import { useToast } from "@/lib/hooks/useToast";
import type { Dataset, DatasetFilters, DatasetType } from "@/types/dataset";

function parseFilters(params: URLSearchParams): Partial<DatasetFilters> {
  const types = params.getAll("type") as DatasetType[];
  const sizeMin = params.get("sizeMin");
  const sizeMax = params.get("sizeMax");
  return {
    search: params.get("search") ?? "",
    types,
    status: (params.get("status") as DatasetFilters["status"]) ?? "all",
    sort: (params.get("sort") as DatasetFilters["sort"]) ?? "newest",
    view: (params.get("view") as DatasetFilters["view"]) ?? "grid",
    archiveStatus: (params.get("archiveStatus") as DatasetFilters["archiveStatus"]) ?? "active",
    tags: params.getAll("tag"),
    createdWithin: (params.get("created") as DatasetFilters["createdWithin"]) ?? "all",
    ...(sizeMin ? { sizeMin: parseInt(sizeMin, 10) } : {}),
    ...(sizeMax ? { sizeMax: parseInt(sizeMax, 10) } : {})
  };
}

function DatasetsPageContent() {
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { filters, setFilters, resetFilters } = useDatasetFilterStore();
  const [searchText, setSearchText] = useState(filters.search);
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);
  const [mountedMap, setMountedMap] = useState<Record<string, string>>({});
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const mountMutation = useMountDatasetMutation();

  const openDatasetVersions = (dataset: Dataset) => {
    router.push(`/datasets/${encodeURIComponent(dataset.id)}`);
  };

  useEffect(() => {
    setFilters(parseFilters(new URLSearchParams(searchParams.toString())));
  }, [searchParams, setFilters]);

  useEffect(() => {
    const timeout = setTimeout(() => setFilters({ search: searchText }), 300);
    return () => clearTimeout(timeout);
  }, [searchText, setFilters]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.search) params.set("search", filters.search);
    filters.types.forEach((type) => params.append("type", type));
    if (filters.status !== "all") params.set("status", filters.status);
    if (filters.sort !== "newest") params.set("sort", filters.sort);
    if (filters.view !== "grid") params.set("view", filters.view);
    if (filters.archiveStatus !== "active") params.set("archiveStatus", filters.archiveStatus);
    if (filters.createdWithin !== "all") params.set("created", filters.createdWithin);
    if (filters.sizeMin > 0) params.set("sizeMin", filters.sizeMin.toString());
    if (filters.sizeMax < 50 * 1024 * 1024 * 1024) params.set("sizeMax", filters.sizeMax.toString());
    filters.tags.forEach((tag) => params.append("tag", tag));
    router.replace(`${pathname}?${params.toString()}`);
  }, [filters, pathname, router]);

  const { data, isLoading } = useDatasets(filters);
  const datasets = data?.items ?? [];
  const total = data?.total ?? 0;

  const activeCount = useMemo(() => {
    let count = 0;
    if (filters.search) count += 1;
    if (filters.types.length) count += 1;
    if (filters.status !== "all") count += 1;
    if (filters.tags.length) count += 1;
    if (filters.createdWithin !== "all") count += 1;
    return count;
  }, [filters]);

  const handleMount = (dataset: Dataset, workspaceId: string) => {
    mountMutation.mutate(
      { datasetId: dataset.id, workspaceId },
      {
        onSuccess: () => {
          setMountedMap((prev) => ({ ...prev, [dataset.id]: workspaceId }));
          toast.success(`✅ ${dataset.name} was mounted to ${workspaceId}`);
        }
      }
    );
  };

  return (
    <div style={{ ["--color-dataset-500" as string]: "#10B981", ["--color-dataset-50" as string]: "#ECFDF5", ["--color-dataset-100" as string]: "#D1FAE5" }} className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">Datasets</h1>
            <span className="rounded-full bg-[#ECFDF5] px-2 py-1 text-xs text-emerald-700">{total} datasets</span>
          </div>
          <p className="mt-1 text-sm text-text-secondary">Browse and select datasets to use in your workspace</p>
        </div>
        <Button className="bg-[#ECFDF5] text-emerald-700 hover:bg-[#D1FAE5]" onClick={() => setUploadModalOpen(true)}>
          <Plus size={14} /> Upload Dataset
        </Button>
      </header>
      <div className="flex flex-col gap-4 lg:flex-row">
        <FilterPanel filters={filters} searchValue={searchText} activeFilterCount={activeCount} onSearchChange={setSearchText} onChange={setFilters} onReset={resetFilters} />
        <section className="min-w-0 flex-1 space-y-3 rounded-lg border border-border bg-bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-text-secondary">{activeCount > 0 ? `Showing ${datasets.length} / ${total} datasets` : `Showing ${total} results`}</p>
            <div className="flex items-center gap-2">
              <div className="flex rounded-md border border-border p-1">
                 <button onClick={() => setFilters({ archiveStatus: "active" })} className={filters.archiveStatus === "active" ? "rounded bg-[#ECFDF5] px-3 py-1 text-xs font-medium text-emerald-700" : "rounded px-3 py-1 text-xs text-text-secondary hover:bg-bg-muted"}>Active</button>
                 <button onClick={() => setFilters({ archiveStatus: "archived" })} className={filters.archiveStatus === "archived" ? "rounded bg-[#ECFDF5] px-3 py-1 text-xs font-medium text-emerald-700" : "rounded px-3 py-1 text-xs text-text-secondary hover:bg-bg-muted"}>Archived</button>
              </div>
              <select value={filters.sort} onChange={(e) => setFilters({ sort: e.target.value as DatasetFilters["sort"] })} className="h-9 rounded-md border border-border px-3 text-sm">
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="name">Name A-Z</option>
                <option value="size">Largest</option>
              </select>
              <div className="flex rounded-md border border-border p-1">
                <button onClick={() => setFilters({ view: "grid" })} className={filters.view === "grid" ? "rounded bg-[#ECFDF5] p-1 text-emerald-700" : "rounded p-1 text-text-secondary"}><Grid2X2 size={15} /></button>
                <button onClick={() => setFilters({ view: "list" })} className={filters.view === "list" ? "rounded bg-[#ECFDF5] p-1 text-emerald-700" : "rounded p-1 text-text-secondary"}><List size={15} /></button>
              </div>
            </div>
          </div>
          {isLoading ? <SkeletonGrid /> : null}
          {!isLoading && datasets.length === 0 ? (
            <div className="flex min-h-72 flex-col items-center justify-center text-center">
              <SearchX className="mb-3 text-text-tertiary" />
              <p className="text-base font-medium">No matching datasets found</p>
              <p className="text-sm text-text-secondary">Try changing filters or search keywords</p>
              <button className="mt-2 text-sm text-brand-600 hover:underline" onClick={resetFilters}>Clear all filters</button>
            </div>
          ) : null}
          {!isLoading && datasets.length > 0 && filters.view === "grid" ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {datasets.map((dataset) => (
                <DatasetCard
                  key={dataset.id}
                  dataset={dataset}
                  active={Boolean(mountedMap[dataset.id])}
                  onUse={(item) => setSelectedDataset(item)}
                  onViewDetails={setSelectedDataset}
                  onViewVersions={openDatasetVersions}
                />
              ))}
            </div>
          ) : null}
          {!isLoading && datasets.length > 0 && filters.view === "list" ? (
            <div className="space-y-1">
              <div className="grid grid-cols-[40px_1.8fr_0.8fr_0.8fr_0.7fr_0.8fr_0.8fr_0.7fr] gap-3 border-b border-border px-3 pb-2 text-xs uppercase tracking-wide text-text-tertiary">
                <span>Icon</span><span>Name & Desc</span><span>Type</span><span>Size</span><span>Items</span><span>Status</span><span>Modified</span><span>Versions</span>
              </div>
              {datasets.map((dataset) => (
                <DatasetRow key={dataset.id} dataset={dataset} onSelect={setSelectedDataset} onUse={(item) => setSelectedDataset(item)} onViewVersions={openDatasetVersions} />
              ))}
            </div>
          ) : null}
        </section>
      </div>
      <DatasetDetailDrawer datasetId={selectedDataset?.id ?? null} open={Boolean(selectedDataset)} onClose={() => setSelectedDataset(null)} />
      <DatasetUploadModal
        open={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onUploaded={() => {
          toast.success("Dataset uploaded");
          void queryClient.invalidateQueries({ queryKey: ["datasets"] });
          router.refresh();
        }}
      />
    </div>
  );
}

export default function DatasetsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-text-secondary">Loading...</div>}>
      <DatasetsPageContent />
    </Suspense>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="space-y-2 rounded-lg border border-border p-4">
          <div className="skeleton-shimmer h-4 w-1/3 rounded" />
          <div className="skeleton-shimmer h-4 w-5/6 rounded" />
          <div className="skeleton-shimmer h-20 rounded" />
          <div className="skeleton-shimmer h-9 rounded" />
        </div>
      ))}
    </div>
  );
}


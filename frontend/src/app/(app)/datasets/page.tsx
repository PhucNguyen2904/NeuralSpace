"use client";

import { useEffect, useMemo, useState } from "react";
import { Grid2X2, List, Plus, SearchX } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DatasetCard } from "@/components/datasets/DatasetCard";
import { DatasetDetailDrawer } from "@/components/datasets/DatasetDetailDrawer";
import { DatasetRow } from "@/components/datasets/DatasetRow";
import { FilterPanel } from "@/components/datasets/FilterPanel";
import { Button } from "@/components/ui";
import { useDatasets, useDatasetFilterStore, useMountDatasetMutation } from "@/lib/hooks/useDatasets";
import { useToast } from "@/lib/hooks/useToast";
import type { Dataset, DatasetFilters, DatasetType } from "@/types/dataset";

function parseFilters(params: URLSearchParams): Partial<DatasetFilters> {
  const types = params.getAll("type") as DatasetType[];
  return {
    search: params.get("search") ?? "",
    types,
    status: (params.get("status") as DatasetFilters["status"]) ?? "all",
    sort: (params.get("sort") as DatasetFilters["sort"]) ?? "newest",
    view: (params.get("view") as DatasetFilters["view"]) ?? "grid",
    tags: params.getAll("tag"),
    createdWithin: (params.get("created") as DatasetFilters["createdWithin"]) ?? "all"
  };
}

export default function DatasetsPage() {
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { filters, setFilters, resetFilters } = useDatasetFilterStore();
  const [searchText, setSearchText] = useState(filters.search);
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);
  const [mountedMap, setMountedMap] = useState<Record<string, string>>({});
  const mountMutation = useMountDatasetMutation();

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
    if (filters.createdWithin !== "all") params.set("created", filters.createdWithin);
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
          toast.success(`✅ ${dataset.name} đã được gắn vào ${workspaceId}`);
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
          <p className="mt-1 text-sm text-text-secondary">Duyệt và chọn datasets để dùng trong workspace của bạn</p>
        </div>
        <Button className="bg-[#ECFDF5] text-emerald-700 hover:bg-[#D1FAE5]"><Plus size={14} /> Upload Dataset</Button>
      </header>
      <div className="flex flex-col gap-4 lg:flex-row">
        <FilterPanel filters={filters} searchValue={searchText} activeFilterCount={activeCount} onSearchChange={setSearchText} onChange={setFilters} onReset={resetFilters} />
        <section className="min-w-0 flex-1 space-y-3 rounded-lg border border-border bg-bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-text-secondary">{activeCount > 0 ? `Hiển thị ${datasets.length} / ${total} datasets` : `Hiển thị ${total} kết quả`}</p>
            <div className="flex items-center gap-2">
              <select value={filters.sort} onChange={(e) => setFilters({ sort: e.target.value as DatasetFilters["sort"] })} className="h-9 rounded-md border border-border px-3 text-sm">
                <option value="newest">Mới nhất</option>
                <option value="oldest">Cũ nhất</option>
                <option value="name">Tên A-Z</option>
                <option value="size">Lớn nhất</option>
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
              <p className="text-base font-medium">Không tìm thấy dataset phù hợp</p>
              <p className="text-sm text-text-secondary">Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm</p>
              <button className="mt-2 text-sm text-brand-600 hover:underline" onClick={resetFilters}>Xóa tất cả bộ lọc</button>
            </div>
          ) : null}
          {!isLoading && datasets.length > 0 && filters.view === "grid" ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {datasets.map((dataset) => (
                <DatasetCard key={dataset.id} dataset={dataset} active={Boolean(mountedMap[dataset.id])} onUse={(item) => handleMount(item, "ws_resnet")} onViewDetails={setSelectedDataset} />
              ))}
            </div>
          ) : null}
          {!isLoading && datasets.length > 0 && filters.view === "list" ? (
            <div className="space-y-1">
              <div className="grid grid-cols-[40px_1.8fr_0.8fr_0.8fr_0.7fr_0.8fr_0.8fr_90px] gap-3 border-b border-border px-3 pb-2 text-xs uppercase tracking-wide text-text-tertiary">
                <span>Icon</span><span>Name & Desc</span><span>Type</span><span>Size</span><span>Items</span><span>Status</span><span>Modified</span><span>Use</span>
              </div>
              {datasets.map((dataset) => (
                <DatasetRow key={dataset.id} dataset={dataset} onSelect={setSelectedDataset} onUse={(item) => handleMount(item, "ws_resnet")} />
              ))}
            </div>
          ) : null}
        </section>
      </div>
      <DatasetDetailDrawer datasetId={selectedDataset?.id ?? null} open={Boolean(selectedDataset)} onClose={() => setSelectedDataset(null)} onUse={handleMount} />
    </div>
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

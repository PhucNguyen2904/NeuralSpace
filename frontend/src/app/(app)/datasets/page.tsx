"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Grid2X2, List, Paperclip, Plus, SearchX } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DatasetCard } from "@/components/datasets/DatasetCard";
import { DatasetDetailDrawer } from "@/components/datasets/DatasetDetailDrawer";
import { DatasetRow } from "@/components/datasets/DatasetRow";
import { FilterPanel } from "@/components/datasets/FilterPanel";
import { Button, Input, Modal } from "@/components/ui";
import { uploadDataset } from "@/lib/api/datasets";
import { useDatasets, useDatasetFilterStore, useMountDatasetMutation } from "@/lib/hooks/useDatasets";
import { useToast } from "@/lib/hooks/useToast";
import { cn } from "@/lib/utils/cn";
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
    tags: params.getAll("tag"),
    createdWithin: (params.get("created") as DatasetFilters["createdWithin"]) ?? "all",
    sizeMin: sizeMin ? parseInt(sizeMin, 10) : undefined,
    sizeMax: sizeMax ? parseInt(sizeMax, 10) : undefined
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
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const metadataInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingUploadFiles, setPendingUploadFiles] = useState<File[]>([]);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [metadataFileName, setMetadataFileName] = useState("");
  const [uploadMeta, setUploadMeta] = useState({
    name: "",
    description: "",
    type: "tabular",
    label_status: "unlabeled",
    item_count: "0",
    class_count: "",
    tags: ""
  });
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
          toast.success(`✅ ${dataset.name} đã được gắn vào ${workspaceId}`);
        }
      }
    );
  };

  const handleUploadDatasetFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const accepted = Array.from(files).filter((file) => {
      const lower = file.name.toLowerCase();
      return lower.endsWith(".csv") || lower.endsWith(".json") || lower.endsWith(".parquet") || lower.endsWith(".zip");
    });
    if (accepted.length === 0) {
      toast.warning("File không hợp lệ", { description: "Hỗ trợ: .csv, .json, .parquet, .zip" });
      return;
    }
    setPendingUploadFiles(accepted);
    setUploadModalOpen(true);
  };

  const submitDatasetUpload = async () => {
    if (pendingUploadFiles.length === 0) return;
    setUploading(true);
    let successCount = 0;
    for (const file of pendingUploadFiles) {
      const itemCount = Number(uploadMeta.item_count);
      const classCount = Number(uploadMeta.class_count);
      const metadata = {
        name: pendingUploadFiles.length === 1 ? uploadMeta.name.trim() || undefined : undefined,
        description: uploadMeta.description.trim() || undefined,
        type: uploadMeta.type,
        label_status: uploadMeta.label_status,
        item_count: Number.isFinite(itemCount) ? itemCount : 0,
        class_count: uploadMeta.class_count.trim() ? (Number.isFinite(classCount) ? classCount : undefined) : undefined,
        tags: uploadMeta.tags.split(",").map((s) => s.trim()).filter(Boolean)
      };

      try {
        await uploadDataset(file, metadata);
        successCount += 1;
      } catch {
        toast.error(`Upload thất bại: ${file.name}`);
      }
    }

    setUploading(false);
    setUploadModalOpen(false);
    setPendingUploadFiles([]);
    if (successCount > 0) {
      toast.success(`Đã upload ${successCount}/${pendingUploadFiles.length} dataset`);
      router.refresh();
    }
  };

  const handleImportMetadata = async (file: File | null) => {
    if (!file) return;
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (!parsed || typeof parsed !== "object") throw new Error("Invalid metadata");
      setUploadMeta((prev) => ({
        ...prev,
        name: typeof parsed.name === "string" ? parsed.name : prev.name,
        description: typeof parsed.description === "string" ? parsed.description : prev.description,
        type: typeof parsed.type === "string" ? parsed.type : prev.type,
        label_status: typeof parsed.label_status === "string" ? parsed.label_status : prev.label_status,
        item_count: typeof parsed.item_count === "number" ? String(parsed.item_count) : prev.item_count,
        class_count: typeof parsed.class_count === "number" ? String(parsed.class_count) : prev.class_count,
        tags: Array.isArray(parsed.tags) ? parsed.tags.map((t) => String(t)).join(", ") : prev.tags
      }));
      setMetadataFileName(file.name);
      toast.success("Đã import metadata JSON");
    } catch {
      toast.error("Metadata JSON không hợp lệ");
    }
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
        <input
          ref={uploadInputRef}
          type="file"
          multiple
          accept=".csv,.json,.parquet,.zip"
          className="hidden"
          onChange={(event) => {
            handleUploadDatasetFiles(event.target.files);
            event.currentTarget.value = "";
          }}
        />
        <Button className="bg-[#ECFDF5] text-emerald-700 hover:bg-[#D1FAE5]" onClick={() => uploadInputRef.current?.click()}>
          <Plus size={14} /> Upload Dataset
        </Button>
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
                <DatasetCard key={dataset.id} dataset={dataset} active={Boolean(mountedMap[dataset.id])} onUse={(item) => setSelectedDataset(item)} onViewDetails={setSelectedDataset} />
              ))}
            </div>
          ) : null}
          {!isLoading && datasets.length > 0 && filters.view === "list" ? (
            <div className="space-y-1">
              <div className="grid grid-cols-[40px_1.8fr_0.8fr_0.8fr_0.7fr_0.8fr_0.8fr] gap-3 border-b border-border px-3 pb-2 text-xs uppercase tracking-wide text-text-tertiary">
                <span>Icon</span><span>Name & Desc</span><span>Type</span><span>Size</span><span>Items</span><span>Status</span><span>Modified</span>
              </div>
              {datasets.map((dataset) => (
                <DatasetRow key={dataset.id} dataset={dataset} onSelect={setSelectedDataset} onUse={(item) => setSelectedDataset(item)} />
              ))}
            </div>
          ) : null}
        </section>
      </div>
      <DatasetDetailDrawer datasetId={selectedDataset?.id ?? null} open={Boolean(selectedDataset)} onClose={() => setSelectedDataset(null)} />
      <Modal
        open={uploadModalOpen}
        onClose={() => !uploading && setUploadModalOpen(false)}
        title={
          <div>
            <h2 className="text-[15px] font-semibold text-[#0F1117]">
              Upload Dataset
              <span className="ml-2 rounded-full bg-[#ECFDF5] px-2 py-0.5 text-[12px] font-normal text-[#10B981]">
                {pendingUploadFiles.length} file
              </span>
            </h2>
            {pendingUploadFiles[0] ? (
              <p className="mt-1 flex items-center gap-1.5 text-[12px] text-[#64748B]">
                <Paperclip size={11} />
                <span className="max-w-[360px] truncate">{pendingUploadFiles[0].name}</span>
                <span className="text-[#94A3B8]">·</span>
                <span className="shrink-0 text-[#94A3B8]">{formatBytes(pendingUploadFiles[0].size)}</span>
              </p>
            ) : null}
          </div>
        }
        size="md"
        showCloseButton
        allowContentOverflow
        closeOnBackdrop={false}
        footer={
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setUploadModalOpen(false)}
              disabled={uploading}
              className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-[13px] font-medium text-[#475569] transition-colors hover:bg-[#F1F5F9] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Hủy
            </button>
            <Button className="bg-emerald-600 px-5 py-2 text-[13px] font-medium text-white hover:bg-emerald-500" onClick={() => void submitDatasetUpload()} disabled={uploading}>
              {uploading ? "Đang upload..." : "Upload"}
            </Button>
          </div>
        }
      >
        <div className="space-y-3.5">
          <input
            ref={metadataInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(event) => {
              void handleImportMetadata(event.target.files?.[0] ?? null);
              event.currentTarget.value = "";
            }}
          />
          <div className="flex items-center justify-between gap-2 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2">
            <div className="min-w-0 text-[12px] text-[#64748B]">
              <p className="font-medium text-[#334155]">Metadata JSON</p>
              <p className="truncate">{metadataFileName || "Chưa chọn file metadata"}</p>
            </div>
            <button
              type="button"
              className="shrink-0 rounded-md border border-[#CBD5E1] px-2.5 py-1 text-[12px] font-medium text-[#475569] hover:bg-[#F1F5F9]"
              onClick={() => metadataInputRef.current?.click()}
            >
              Import .json
            </button>
          </div>
          {pendingUploadFiles.length > 1 ? <p className="text-[12px] text-[#64748B]">Tên dataset sẽ lấy theo từng tên file khi upload nhiều file.</p> : null}
          <Field label="Tên dataset" hint="(tùy chọn)">
            <input className={inputCls()} value={uploadMeta.name} onChange={(e) => setUploadMeta((p) => ({ ...p, name: e.target.value }))} placeholder="vd: Customer Churn 2026" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type" required>
              <select className={inputCls()} value={uploadMeta.type} onChange={(e) => setUploadMeta((p) => ({ ...p, type: e.target.value }))}>
                <option value="tabular">Tabular</option>
                <option value="image">Image</option>
                <option value="text">Text</option>
                <option value="audio">Audio</option>
                <option value="video">Video</option>
              </select>
            </Field>
            <Field label="Label Status" required>
              <select className={inputCls()} value={uploadMeta.label_status} onChange={(e) => setUploadMeta((p) => ({ ...p, label_status: e.target.value }))}>
                <option value="unlabeled">Unlabeled</option>
                <option value="labeled">Labeled</option>
                <option value="processing">Processing</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Item Count">
              <input className={inputCls()} type="number" min="0" value={uploadMeta.item_count} onChange={(e) => setUploadMeta((p) => ({ ...p, item_count: e.target.value }))} />
            </Field>
            <Field label="Class Count" hint="(tùy chọn)">
              <input className={inputCls()} type="number" min="0" value={uploadMeta.class_count} onChange={(e) => setUploadMeta((p) => ({ ...p, class_count: e.target.value }))} />
            </Field>
          </div>
          <Field label="Tags" hint="(phân cách bằng dấu phẩy)">
            <input className={inputCls()} value={uploadMeta.tags} onChange={(e) => setUploadMeta((p) => ({ ...p, tags: e.target.value }))} placeholder="tabular, churn, prod..." />
          </Field>
          <Field label="Mô tả" hint="(tùy chọn)">
            <textarea rows={3} className={cn(inputCls(), "resize-none")} value={uploadMeta.description} onChange={(e) => setUploadMeta((p) => ({ ...p, description: e.target.value }))} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  children
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[12.5px] font-medium text-[#374151]">
        {label}
        {hint ? <span className="ml-1 font-normal text-[#9CA3AF]">{hint}</span> : null}
        {required ? <span className="ml-0.5 text-red-500">*</span> : null}
      </label>
      {children}
    </div>
  );
}

function inputCls(error = false) {
  return cn(
    "w-full rounded-lg border bg-white px-3 py-1.5 text-[13.5px] text-[#0F1117]",
    "placeholder:text-[#9CA3AF]",
    "focus:outline-none focus:ring-2 transition-colors",
    error
      ? "border-red-300 focus:border-red-400 focus:ring-red-200"
      : "border-[#E2E8F0] focus:border-[#10B981] focus:ring-[#10B981]/20"
  );
}

function formatBytes(value: number) {
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${value} B`;
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


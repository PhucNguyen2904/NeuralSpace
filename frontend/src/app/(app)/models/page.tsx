"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BrainCircuit, Paperclip, Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ModelCard } from "@/components/models/ModelCard";
import { ModelCompareTool } from "@/components/models/ModelCompareTool";
import { ModelDetailDrawer } from "@/components/models/ModelDetailDrawer";
import { ModelRow } from "@/components/models/ModelRow";
import { ResourceBrowser } from "@/components/shared/ResourceBrowser";
import { Button, Input, Modal } from "@/components/ui";
import { uploadModel } from "@/lib/api/models";
import { useToast } from "@/lib/hooks/useToast";
import { defaultModelFilters, useLoadModel, useModelFilterStore, useModels } from "@/lib/hooks/useModels";
import { cn } from "@/lib/utils/cn";
import type { Model, ModelFilters, ModelFramework, TaskType } from "@/types/model";

const frameworkOptions: Array<{ key: ModelFramework; label: string; count: number }> = [
  { key: "pytorch", label: "PyTorch", count: 8 },
  { key: "tensorflow", label: "TensorFlow", count: 4 },
  { key: "onnx", label: "ONNX", count: 3 },
  { key: "huggingface", label: "HuggingFace", count: 2 },
  { key: "sklearn", label: "Scikit-learn", count: 1 }
];
const taskOptions: Array<{ key: TaskType; label: string; count: number }> = [
  { key: "image_classification", label: "Image Classification", count: 5 },
  { key: "object_detection", label: "Object Detection", count: 4 },
  { key: "text_classification", label: "Text Classification", count: 3 },
  { key: "semantic_segmentation", label: "Semantic Segmentation", count: 2 },
  { key: "text_generation", label: "Text Generation", count: 2 },
  { key: "regression", label: "Regression / Other", count: 2 }
];

function parseFilters(params: URLSearchParams): Partial<ModelFilters> {
  return {
    search: params.get("search") ?? "",
    frameworks: params.getAll("framework") as ModelFramework[],
    taskTypes: params.getAll("task") as TaskType[],
    status: (params.get("status") as ModelFilters["status"]) ?? "all",
    sizeCategory: (params.get("size") as ModelFilters["sizeCategory"]) ?? "all",
    sort: (params.get("sort") as ModelFilters["sort"]) ?? "newest",
    view: (params.get("view") as ModelFilters["view"]) ?? "grid",
    minMetric: params.get("minMetric") ? Number(params.get("minMetric")) : undefined
  };
}

export default function ModelsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { filters, setFilters, resetFilters } = useModelFilterStore();
  const [searchText, setSearchText] = useState(filters.search);
  const [selectedModel, setSelectedModel] = useState<Model | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const metadataInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingUploadFiles, setPendingUploadFiles] = useState<File[]>([]);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [metadataFileName, setMetadataFileName] = useState<string>("");
  const [metricInputs, setMetricInputs] = useState<Array<{ name: string; value: string }>>([{ name: "accuracy", value: "0.0" }]);
  const [uploadMeta, setUploadMeta] = useState({
    name: "",
    description: "",
    framework: "onnx",
    task_type: "image_classification",
    architecture: "",
    tags: ""
  });
  const loadMutation = useLoadModel();

  useEffect(() => {
    const raw = sessionStorage.getItem("model-compare");
    if (raw) setCompareIds(JSON.parse(raw) as string[]);
  }, []);
  useEffect(() => {
    sessionStorage.setItem("model-compare", JSON.stringify(compareIds));
  }, [compareIds]);
  useEffect(() => {
    setFilters({ ...defaultModelFilters, ...parseFilters(new URLSearchParams(searchParams.toString())) });
  }, [searchParams, setFilters]);
  useEffect(() => {
    const t = setTimeout(() => setFilters({ search: searchText }), 300);
    return () => clearTimeout(t);
  }, [searchText, setFilters]);
  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.search) params.set("search", filters.search);
    filters.frameworks.forEach((f) => params.append("framework", f));
    filters.taskTypes.forEach((t) => params.append("task", t));
    if (filters.status !== "all") params.set("status", filters.status);
    if (filters.sizeCategory !== "all") params.set("size", filters.sizeCategory);
    if (filters.sort !== "newest") params.set("sort", filters.sort);
    if (filters.view !== "grid") params.set("view", filters.view);
    if (typeof filters.minMetric === "number") params.set("minMetric", String(filters.minMetric));
    router.replace(`${pathname}?${params.toString()}`);
  }, [filters, pathname, router]);

  const { data, isLoading } = useModels(filters);
  const models = data?.items ?? [];
  const total = data?.total ?? 0;
  const compareModels = models.filter((m) => compareIds.includes(m.id));

  const activeCount = useMemo(() => {
    let c = 0;
    if (filters.search) c++;
    if (filters.frameworks.length) c++;
    if (filters.taskTypes.length) c++;
    if (filters.status !== "all") c++;
    if (filters.sizeCategory !== "all") c++;
    if (typeof filters.minMetric === "number") c++;
    return c;
  }, [filters]);

  const metricLabel = filters.taskTypes.length === 1
    ? (filters.taskTypes[0] === "object_detection" ? "mAP tối thiểu" : filters.taskTypes[0].includes("classification") ? "Accuracy tối thiểu" : "Metric tối thiểu")
    : "Chọn task type để lọc theo metric";

  const allMetricsPreview = useMemo(() => {
    const metrics: Array<{ name: string; value: number }> = [];
    const seen = new Set<string>();

    const pushMetric = (name: string, value: number) => {
      const key = name.trim().toLowerCase();
      if (!name.trim() || !Number.isFinite(value) || seen.has(key)) return;
      metrics.push({ name: name.trim(), value });
      seen.add(key);
    };

    for (const metric of metricInputs) {
      const value = Number(metric.value);
      if (metric.name.trim() && Number.isFinite(value)) {
        pushMetric(metric.name, value);
      }
    }

    return metrics;
  }, [metricInputs]);

  const onLoad = (model: Model, workspaceId = "ws_resnet", mountPath = `/workspace/models/${model.name.toLowerCase().replaceAll(" ", "")}`) => {
    loadMutation.mutate({ modelId: model.id, workspaceId, mountPath }, { onSuccess: () => toast.success(`Model ${model.name} đã được load`) });
  };

  const handleUploadModelFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const accepted = Array.from(files).filter((file) => {
      const lower = file.name.toLowerCase();
      return lower.endsWith(".onnx") || lower.endsWith(".pt") || lower.endsWith(".pth") || lower.endsWith(".h5") || lower.endsWith(".safetensors");
    });
    if (accepted.length === 0) {
      toast.warning("File không hợp lệ", { description: "Hỗ trợ: .onnx, .pt, .pth, .h5, .safetensors" });
      return;
    }
    setPendingUploadFiles(accepted);
    setUploadModalOpen(true);
  };

  const submitModelUpload = async () => {
    if (pendingUploadFiles.length === 0) return;
    setUploading(true);
    let successCount = 0;
    for (const file of pendingUploadFiles) {
      const allMetrics: Record<string, number> = {};
      for (const metric of allMetricsPreview) {
        allMetrics[metric.name] = metric.value;
      }
      const firstMetric = allMetricsPreview[0];

      const metadata = {
        name: pendingUploadFiles.length === 1 ? uploadMeta.name.trim() || undefined : undefined,
        description: uploadMeta.description.trim() || undefined,
        framework: uploadMeta.framework,
        task_type: uploadMeta.task_type,
        architecture: uploadMeta.architecture.trim() || undefined,
        primary_metric_name: firstMetric?.name || "metric",
        primary_metric_value: firstMetric?.value ?? 0,
        all_metrics: Object.keys(allMetrics).length ? allMetrics : undefined,
        tags: uploadMeta.tags.split(",").map((s) => s.trim()).filter(Boolean),
        version: "v1.0"
      };

      try {
        await uploadModel(file, metadata);
        successCount += 1;
      } catch {
        toast.error(`Upload thất bại: ${file.name}`);
      }
    }

    setUploading(false);
    setUploadModalOpen(false);
    setPendingUploadFiles([]);

    if (successCount > 0) {
      toast.success(`Đã upload ${successCount}/${pendingUploadFiles.length} model`);
      await queryClient.invalidateQueries({ queryKey: ["models"] });
      router.refresh();
    }
  };

  const handleImportMetadata = async (file: File | null) => {
    if (!file) return;
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (!parsed || typeof parsed !== "object") {
        throw new Error("Metadata phải là JSON object");
      }

      setUploadMeta((prev) => ({
        ...prev,
        name: typeof parsed.name === "string" ? parsed.name : prev.name,
        description: typeof parsed.description === "string" ? parsed.description : prev.description,
        framework: typeof parsed.framework === "string" ? parsed.framework : prev.framework,
        task_type: typeof parsed.task_type === "string" ? parsed.task_type : prev.task_type,
        architecture: typeof parsed.architecture === "string" ? parsed.architecture : prev.architecture,
        tags: Array.isArray(parsed.tags) ? parsed.tags.map((t) => String(t)).join(", ") : prev.tags
      }));
      const parsedMetrics: Array<{ name: string; value: string }> = [];
      if (parsed.all_metrics && typeof parsed.all_metrics === "object") {
        for (const [k, v] of Object.entries(parsed.all_metrics as Record<string, unknown>)) {
          const n = typeof v === "number" ? v : Number(v);
          if (Number.isFinite(n)) parsedMetrics.push({ name: k, value: String(n) });
        }
      }
      if (parsedMetrics.length > 0) {
        setMetricInputs(parsedMetrics);
      } else if (typeof parsed.primary_metric_name === "string" && typeof parsed.primary_metric_value === "number") {
        setMetricInputs([{ name: parsed.primary_metric_name, value: String(parsed.primary_metric_value) }]);
      }
      setMetadataFileName(file.name);
      toast.success("Đã import metadata JSON");
    } catch {
      toast.error("Metadata JSON không hợp lệ");
    }
  };

  return (
    <div style={{ ["--color-model-500" as string]: "#8B5CF6", ["--color-model-600" as string]: "#7C3AED", ["--color-model-50" as string]: "#F5F3FF", ["--color-model-100" as string]: "#EDE9FE" }} className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">Models</h1>
            <span className="rounded-full bg-violet-50 px-2 py-1 text-xs text-violet-700">{total} models</span>
          </div>
          <p className="mt-1 text-sm text-text-secondary">Chọn model để inference hoặc fine-tuning trong workspace</p>
        </div>
        <input
          ref={uploadInputRef}
          type="file"
          multiple
          accept=".onnx,.pt,.pth,.h5,.safetensors"
          className="hidden"
          onChange={(event) => {
            handleUploadModelFiles(event.target.files);
            event.currentTarget.value = "";
          }}
        />
        <Button
          className="bg-violet-600 text-white hover:bg-violet-500"
          onClick={() => uploadInputRef.current?.click()}
        >
          <Plus size={14} /> Upload Model
        </Button>
      </header>
      <div className="flex flex-col gap-4 lg:flex-row">
        <aside className="sticky top-4 h-fit w-full space-y-4 rounded-lg border border-border bg-bg-surface p-4 md:w-[280px]">
          <div>
            <p className="mb-2 text-sm font-semibold">Search</p>
            <Input placeholder="Tìm model..." value={searchText} onChange={(e) => setSearchText(e.target.value)} />
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold">Framework {activeCount ? <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs text-violet-700">Bộ lọc ({activeCount})</span> : null}</p>
            <div className="space-y-1.5">
              {frameworkOptions.map((o) => <label key={o.key} className="flex items-center justify-between text-sm text-text-secondary"><span><input type="checkbox" checked={filters.frameworks.includes(o.key)} onChange={(e) => setFilters({ frameworks: e.target.checked ? [...filters.frameworks, o.key] : filters.frameworks.filter((f) => f !== o.key) })} className="mr-2" />{o.label}</span><span>{o.count}</span></label>)}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold">Task Type</p>
            <div className="space-y-1.5">
              {taskOptions.map((o) => <label key={o.key} className="flex items-center justify-between text-sm text-text-secondary"><span><input type="checkbox" checked={filters.taskTypes.includes(o.key)} onChange={(e) => setFilters({ taskTypes: e.target.checked ? [...filters.taskTypes, o.key] : filters.taskTypes.filter((t) => t !== o.key) })} className="mr-2" />{o.label}</span><span>{o.count}</span></label>)}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold">Trạng thái</p>
            {([
              { value: "all", label: "Tất cả" },
              { value: "ready", label: "Ready" },
              { value: "training", label: "Training" },
              { value: "trained", label: "Trained" },
              { value: "failed", label: "Failed" }
            ] as const).map((s) => (
              <label key={s.value} className="mb-1 block text-sm text-text-secondary">
                <input
                  className="mr-2"
                  type="radio"
                  name="status-model"
                  checked={filters.status === s.value}
                  onChange={() => setFilters({ status: s.value })}
                />
                {s.label}
              </label>
            ))}
          </div>
          <div>
            <p className="mb-1 text-sm font-semibold">{metricLabel}</p>
            <input disabled={filters.taskTypes.length !== 1} type="range" min={0} max={100} value={filters.minMetric ?? 0} onChange={(e) => setFilters({ minMetric: Number(e.target.value) })} className="w-full accent-violet-500 disabled:cursor-not-allowed" />
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold">Kích thước model</p>
            <div className="flex flex-wrap gap-2">{(["all", "small", "medium", "large"] as const).map((s) => <button key={s} onClick={() => setFilters({ sizeCategory: s })} className={filters.sizeCategory === s ? "rounded-full bg-violet-500 px-3 py-1 text-xs text-white" : "rounded-full border border-border px-3 py-1 text-xs text-text-secondary hover:bg-violet-50"}>{s === "all" ? "Tất cả" : s === "small" ? "< 100MB" : s === "medium" ? "100MB-1GB" : "> 1GB"}</button>)}</div>
          </div>
          {activeCount > 0 ? <button className="text-sm text-brand-600 hover:underline" onClick={resetFilters}>Xóa tất cả bộ lọc</button> : null}
        </aside>
        <ResourceBrowser
          resultLabel={activeCount ? `Hiển thị ${models.length} / ${total} models` : `Hiển thị ${total} kết quả`}
          sort={filters.sort}
          onSortChange={(value) => setFilters({ sort: value as ModelFilters["sort"] })}
          view={filters.view}
          onViewChange={(value) => setFilters({ view: value })}
          loading={isLoading}
          isEmpty={!models.length}
          onClearFilters={resetFilters}
          skeleton={<ModelSkeleton />}
          gridContent={<div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{models.map((m) => <ModelCard key={m.id} model={m} checked={compareIds.includes(m.id)} canLoad onCheck={(id, v) => setCompareIds((prev) => v ? [...new Set([...prev, id])] : prev.filter((x) => x !== id))} onLoad={onLoad} onDetail={setSelectedModel} />)}</div>}
          listContent={<div className="space-y-1"><div className="grid grid-cols-[30px_1.7fr_1.2fr_0.8fr_0.7fr_0.8fr_0.7fr] gap-2 border-b border-border px-3 pb-2 text-xs uppercase tracking-wide text-text-tertiary"><span></span><span>Name</span><span>Task</span><span>Framework</span><span>Size</span><span>Metric</span><span>Status</span></div>{models.map((m) => <ModelRow key={m.id} model={m} checked={compareIds.includes(m.id)} onCheck={(id, v) => setCompareIds((prev) => v ? [...new Set([...prev, id])] : prev.filter((x) => x !== id))} onDetail={setSelectedModel} onLoad={onLoad} />)}</div>}
        />
      </div>
      {!isLoading && models.length === 0 ? <div className="rounded-lg border border-border bg-bg-surface p-6 text-center"><BrainCircuit className="mx-auto mb-2 text-text-tertiary" /><p className="font-medium">Chưa có model nào</p><p className="text-sm text-text-secondary">Train model đầu tiên của bạn trên Upstream module</p></div> : null}
      <ModelDetailDrawer modelId={selectedModel?.id ?? null} open={Boolean(selectedModel)} onClose={() => setSelectedModel(null)} />
      <ModelCompareTool selected={compareModels} onClear={() => setCompareIds([])} />
      <Modal
        open={uploadModalOpen}
        onClose={() => !uploading && setUploadModalOpen(false)}
        title={
          <div>
            <h2 className="text-[15px] font-semibold text-[#0F1117]">
              Upload Model
              <span className="ml-2 rounded-full bg-[#EEF2FF] px-2 py-0.5 text-[12px] font-normal text-[#6366F1]">
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
            <Button className="px-5 py-2 text-[13px] font-medium text-white shadow-sm shadow-indigo-200 bg-[#6366F1] hover:bg-[#4F46E5]" onClick={() => void submitModelUpload()} disabled={uploading}>
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
              {allMetricsPreview.length > 0 ? (
                <p className="mt-0.5 truncate text-[#6366F1]">
                  Loaded {allMetricsPreview.length} metrics
                </p>
              ) : null}
            </div>
            <button
              type="button"
              className="shrink-0 rounded-md border border-[#CBD5E1] px-2.5 py-1 text-[12px] font-medium text-[#475569] hover:bg-[#F1F5F9]"
              onClick={() => metadataInputRef.current?.click()}
            >
              Import .json
            </button>
          </div>
          {pendingUploadFiles.length > 1 ? <p className="text-[12px] text-[#64748B]">Tên model sẽ lấy theo từng tên file khi upload nhiều file.</p> : null}
          <Field label="Tên model" hint="(tùy chọn)">
            <input className={inputCls()} value={uploadMeta.name} onChange={(e) => setUploadMeta((p) => ({ ...p, name: e.target.value }))} placeholder="vd: ResNet-50 Custom" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Framework" required>
              <select className={inputCls()} value={uploadMeta.framework} onChange={(e) => setUploadMeta((p) => ({ ...p, framework: e.target.value }))}>
                <option value="onnx">ONNX</option>
                <option value="pytorch">PyTorch</option>
                <option value="tensorflow">TensorFlow</option>
                <option value="huggingface">HuggingFace</option>
                <option value="sklearn">Scikit-learn</option>
              </select>
            </Field>
            <Field label="Task Type" required>
              <select className={inputCls()} value={uploadMeta.task_type} onChange={(e) => setUploadMeta((p) => ({ ...p, task_type: e.target.value }))}>
                <option value="image_classification">Image Classification</option>
                <option value="object_detection">Object Detection</option>
                <option value="semantic_segmentation">Segmentation</option>
                <option value="text_classification">Text Classification</option>
                <option value="text_generation">Text Generation</option>
                <option value="regression">Regression</option>
              </select>
            </Field>
          </div>
          <Field label="Architecture" hint="(tùy chọn)">
            <input className={inputCls()} value={uploadMeta.architecture} onChange={(e) => setUploadMeta((p) => ({ ...p, architecture: e.target.value }))} placeholder="vd: ResNet-50, BERT-base, YOLOv8..." />
          </Field>
          <Field label="Metrics">
            <div className="space-y-2">
              {metricInputs.map((metric, index) => (
                <div key={`metric-${index}`} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                  <input
                    className={inputCls()}
                    placeholder={`Metric ${index + 1} Name`}
                    value={metric.name}
                    onChange={(e) =>
                      setMetricInputs((prev) => prev.map((item, i) => (i === index ? { ...item, name: e.target.value } : item)))
                    }
                  />
                  <input
                    className={inputCls()}
                    type="number"
                    step="0.001"
                    min="0"
                    placeholder={`Metric ${index + 1} Value`}
                    value={metric.value}
                    onChange={(e) =>
                      setMetricInputs((prev) => prev.map((item, i) => (i === index ? { ...item, value: e.target.value } : item)))
                    }
                  />
                  <button
                    type="button"
                    className="rounded-lg border border-[#E2E8F0] px-2 text-[12px] text-[#64748B] hover:bg-[#F1F5F9]"
                    onClick={() => setMetricInputs((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev))}
                  >
                    Xóa
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="rounded-lg border border-[#CBD5E1] px-3 py-1.5 text-[12px] font-medium text-[#475569] hover:bg-[#F1F5F9]"
                onClick={() => setMetricInputs((prev) => [...prev, { name: "", value: "" }])}
              >
                + Thêm Metric
              </button>
            </div>
          </Field>
          <Field label="Tags" hint="(phân cách bằng dấu phẩy)">
            <input className={inputCls()} value={uploadMeta.tags} onChange={(e) => setUploadMeta((p) => ({ ...p, tags: e.target.value }))} placeholder="classification, production, v2..." />
          </Field>
          <Field label="Mô tả" hint="(tùy chọn)">
            <textarea rows={3} className={cn(inputCls(), "resize-none")} value={uploadMeta.description} onChange={(e) => setUploadMeta((p) => ({ ...p, description: e.target.value }))} placeholder="Mô tả ngắn về model, dataset đã dùng, kết quả..." />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

function ModelSkeleton() {
  return <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="space-y-2 rounded-lg border border-border p-4"><div className="skeleton-shimmer h-5 w-2/3 rounded" /><div className="skeleton-shimmer h-16 rounded" /><div className="skeleton-shimmer h-8 rounded" /></div>)}</div>;
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
      : "border-[#E2E8F0] focus:border-[#6366F1] focus:ring-[#6366F1]/20"
  );
}

function formatBytes(value: number) {
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${value} B`;
}


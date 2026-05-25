"use client";

import { useEffect, useMemo, useState } from "react";
import { BrainCircuit, Plus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ModelCard } from "@/components/models/ModelCard";
import { ModelCompareTool } from "@/components/models/ModelCompareTool";
import { ModelDetailDrawer } from "@/components/models/ModelDetailDrawer";
import { ModelRow } from "@/components/models/ModelRow";
import { ResourceBrowser } from "@/components/shared/ResourceBrowser";
import { Button, Input } from "@/components/ui";
import { useToast } from "@/lib/hooks/useToast";
import { defaultModelFilters, useLoadModel, useModelFilterStore, useModels } from "@/lib/hooks/useModels";
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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { filters, setFilters, resetFilters } = useModelFilterStore();
  const [searchText, setSearchText] = useState(filters.search);
  const [selectedModel, setSelectedModel] = useState<Model | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
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

  const onLoad = (model: Model, workspaceId = "ws_resnet", mountPath = `/workspace/models/${model.name.toLowerCase().replaceAll(" ", "")}`) => {
    loadMutation.mutate({ modelId: model.id, workspaceId, mountPath }, { onSuccess: () => toast.success(`Model ${model.name} đã được load`) });
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
        <Button variant="secondary"><Plus size={14} /> Upload Model</Button>
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
            {(["all", "ready", "training", "trained", "failed"] as const).map((s) => <label key={s} className="mb-1 block text-sm text-text-secondary"><input className="mr-2" type="radio" name="status-model" checked={filters.status === s} onChange={() => setFilters({ status: s })} />{s === "all" ? "Tất cả" : s}</label>)}
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
          listContent={<div className="space-y-1"><div className="grid grid-cols-[30px_1.7fr_1.2fr_0.8fr_0.7fr_0.8fr_0.7fr_70px_70px] gap-2 border-b border-border px-3 pb-2 text-xs uppercase tracking-wide text-text-tertiary"><span></span><span>Name</span><span>Task</span><span>Framework</span><span>Size</span><span>Metric</span><span>Status</span><span>Use</span><span></span></div>{models.map((m) => <ModelRow key={m.id} model={m} checked={compareIds.includes(m.id)} onCheck={(id, v) => setCompareIds((prev) => v ? [...new Set([...prev, id])] : prev.filter((x) => x !== id))} onDetail={setSelectedModel} onLoad={onLoad} />)}</div>}
        />
      </div>
      {!isLoading && models.length === 0 ? <div className="rounded-lg border border-border bg-bg-surface p-6 text-center"><BrainCircuit className="mx-auto mb-2 text-text-tertiary" /><p className="font-medium">Chưa có model nào</p><p className="text-sm text-text-secondary">Train model đầu tiên của bạn trên Upstream module</p></div> : null}
      <ModelDetailDrawer modelId={selectedModel?.id ?? null} open={Boolean(selectedModel)} onClose={() => setSelectedModel(null)} onLoad={onLoad} />
      <ModelCompareTool selected={compareModels} onClear={() => setCompareIds([])} />
    </div>
  );
}

function ModelSkeleton() {
  return <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="space-y-2 rounded-lg border border-border p-4"><div className="skeleton-shimmer h-5 w-2/3 rounded" /><div className="skeleton-shimmer h-16 rounded" /><div className="skeleton-shimmer h-8 rounded" /></div>)}</div>;
}

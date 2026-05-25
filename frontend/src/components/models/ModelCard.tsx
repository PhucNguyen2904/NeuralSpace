"use client";

import { formatDistanceToNow } from "date-fns";
import { CheckCircle2, FileText, Layers, LoaderCircle, Package, PenTool, ScanSearch, Sparkles, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import type { Model } from "@/types/model";

const taskIcon = {
  image_classification: Layers,
  object_detection: ScanSearch,
  semantic_segmentation: PenTool,
  text_classification: FileText,
  text_generation: Sparkles,
  regression: Layers
};

export function ModelCard({
  model,
  checked,
  canLoad = true,
  onCheck,
  onLoad,
  onDetail
}: {
  model: Model;
  checked: boolean;
  canLoad?: boolean;
  onCheck: (id: string, value: boolean) => void;
  onLoad: (model: Model) => void;
  onDetail: (model: Model) => void;
}) {
  const Icon = taskIcon[model.task_type];
  return (
    <article className={cn("group rounded-lg border border-border bg-bg-surface p-4 transition-all hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md", model.status === "failed" && "border-red-200")}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="rounded-md bg-violet-50 p-2 text-violet-600"><Icon size={18} /></div>
          <div>
            <p className="text-sm font-semibold text-text-primary">{model.name}</p>
            <p className="text-xs text-text-secondary">{prettyTask(model.task_type)}</p>
          </div>
        </div>
        <StatusBadge status={model.status} />
      </div>
      <div className="space-y-2 rounded-md bg-bg-elevated/50 p-2">
        <MetricRow label={model.primary_metric_name} value={model.primary_metric_value} />
        {Object.entries(model.all_metrics).slice(1, 2).map(([k, v]) => <MetricRow key={k} label={k} value={v} />)}
      </div>
      <div className="my-3 h-px bg-border" />
      <p className="mb-3 flex items-center gap-3 text-xs text-text-secondary">
        <span>🔥 {prettyFramework(model.framework)}</span>
        <span className="inline-flex items-center gap-1"><Package size={12} />{formatSize(model.size_bytes)}</span>
        <span>{formatDistanceToNow(new Date(model.updated_at), { addSuffix: true })}</span>
      </p>
      {model.status === "failed" ? (
        <p className="mb-2 inline-flex items-center gap-1 text-xs text-red-600"><TriangleAlert size={13} />Training thất bại</p>
      ) : null}
      <div className="mb-2 flex items-center justify-between">
        <label className="text-xs text-text-secondary"><input type="checkbox" checked={checked} onChange={(e) => onCheck(model.id, e.target.checked)} className="mr-1" />So sánh</label>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" className="flex-1 bg-violet-50 text-violet-700 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60" disabled={!canLoad} title={!canLoad ? "Cần có workspace đang chạy để load model" : undefined} onClick={() => onLoad(model)}>
          Load vào Workspace
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onDetail(model)}>Chi tiết →</Button>
      </div>
    </article>
  );
}

function MetricRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-16 text-text-secondary">{label}</span>
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-bg-elevated">
        <span className="block h-full bg-violet-500" style={{ width: `${Math.min(100, value)}%` }} />
      </span>
      <span className="w-10 text-right font-medium text-text-primary">{value.toFixed(1)}%</span>
    </div>
  );
}

function StatusBadge({ status }: { status: Model["status"] }) {
  if (status === "ready") return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700"><CheckCircle2 size={12} />Ready</span>;
  if (status === "training") return <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-700 status-pulse"><LoaderCircle size={12} className="animate-spin" />Training</span>;
  if (status === "trained") return <span className="rounded-full bg-violet-50 px-2 py-1 text-xs text-violet-700">Trained</span>;
  return <span className="rounded-full bg-red-50 px-2 py-1 text-xs text-red-600">Failed</span>;
}

function prettyFramework(f: Model["framework"]) {
  return f === "huggingface" ? "HuggingFace" : f === "onnx" ? "ONNX" : f === "sklearn" ? "Scikit-learn" : f[0].toUpperCase() + f.slice(1);
}
function prettyTask(task: Model["task_type"]) { return task.replaceAll("_", " "); }
function formatSize(value: number) { if (value > 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`; return `${(value / 1024 ** 2).toFixed(1)} MB`; }

"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle2, Eye, FileText, GitBranch, Layers, LoaderCircle, Package, PenTool, ScanSearch, Sparkles, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import type { Model } from "@/types/model";

const taskIcon = {
  image_classification: Layers ?? Package,
  object_detection: ScanSearch ?? Layers ?? Package,
  semantic_segmentation: PenTool ?? Layers ?? Package,
  text_classification: FileText ?? Layers ?? Package,
  text_generation: Sparkles ?? Layers ?? Package,
  regression: Layers ?? Package,
  image_segmentation: PenTool ?? Layers ?? Package,
  tabular_classification: Layers ?? Package
};
const StatusReadyIcon = CheckCircle2 ?? Layers ?? Package;
const StatusTrainingIcon = LoaderCircle ?? Layers ?? Package;
const StatusFailedIcon = TriangleAlert ?? Layers ?? Package;
const PackageIcon = Package ?? Layers;

export function ModelCard({
  model,
  checked,
  onCheck,
  onDetail
}: {
  model: Model;
  checked: boolean;
  canLoad?: boolean;
  onCheck: (id: string, value: boolean) => void;
  onLoad: (model: Model) => void;
  onDetail: (model: Model) => void;
}) {
  const Icon = taskIcon[model.task_type as keyof typeof taskIcon] ?? Layers ?? Package;
  const metrics = getDisplayMetrics(model);
  return (
    <article className={cn("group flex h-full flex-col rounded-lg border border-border bg-bg-surface p-4 transition-all hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md", model.status === "failed" && "border-red-200")}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="shrink-0 rounded-md bg-violet-50 p-2 text-violet-600"><Icon size={18} /></div>
          <div className="min-w-0 flex-1">
            <p className="h-11 overflow-hidden text-sm font-semibold leading-5 text-text-primary">{model.name}</p>
            <p className="h-8 overflow-hidden text-xs leading-4 text-text-secondary">{prettyTask(model.task_type)}</p>
          </div>
        </div>
        <StatusBadge status={model.status} />
      </div>
      <div className="space-y-2 rounded-md bg-bg-elevated/50 p-2">
        {metrics.slice(0, 2).map((metric, index) => (
          <MetricRow key={`${metric.label}-${index}`} label={metric.label} value={metric.value} />
        ))}
      </div>
      <div className="mt-auto">
        <div className="my-3 h-px bg-border" />
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-secondary">
          <span className="whitespace-nowrap">🔥 {prettyFramework(model.framework)}</span>
          <span className="inline-flex items-center gap-1 whitespace-nowrap"><PackageIcon size={12} />{formatSize(model.size_bytes)}</span>
          <span className="whitespace-nowrap">{formatDistanceToNow(new Date(model.updated_at), { addSuffix: true })}</span>
        </div>
        <div className="mb-2 min-h-[18px]">
          {model.status === "failed" ? (
            <p className="inline-flex items-center gap-1 text-xs text-red-600"><StatusFailedIcon size={13} />Training thất bại</p>
          ) : null}
        </div>
        <div className="mb-2 flex items-center justify-between">
          <label className="inline-flex items-center gap-1.5 text-xs leading-none text-text-secondary">
            <input type="checkbox" checked={checked} onChange={(e) => onCheck(model.id, e.target.checked)} className="h-4 w-4 shrink-0 rounded border-border" />
            <span>So sánh</span>
          </label>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button size="sm" variant="outline" className="text-text-secondary" onClick={() => onDetail(model)}>
          <Eye size={14} /> Chi tiết
        </Button>
        <Link
          href={`/models/${encodeURIComponent(model.name)}`}
          className="inline-flex h-7 items-center justify-center gap-2 rounded-md bg-violet-50 px-3 text-xs font-medium text-violet-700 transition-all hover:bg-violet-100"
        >
          <GitBranch size={14} /> Versions
        </Link>
      </div>
    </article>
  );
}

function getDisplayMetrics(model: Model): Array<{ label: string; value: number }> {
  const result: Array<{ label: string; value: number }> = [];
  const primaryLabel = model.primary_metric_name.trim().toLowerCase();
  const primaryValue = Number(model.primary_metric_value);
  const seen = new Set<string>();

  if (Number.isFinite(primaryValue)) {
    result.push({ label: model.primary_metric_name, value: primaryValue });
    seen.add(primaryLabel);
  }

  for (const [label, rawValue] of Object.entries(model.all_metrics)) {
    const value = Number(rawValue);
    if (!Number.isFinite(value)) continue;
    const normalizedLabel = label.trim().toLowerCase();
    const isPrimaryDuplicate = normalizedLabel === primaryLabel && Math.abs(value - primaryValue) < 1e-9;
    if (isPrimaryDuplicate) continue;
    if (seen.has(normalizedLabel)) continue;
    result.push({ label, value });
    seen.add(normalizedLabel);
  }

  return result;
}

function MetricRow({ label, value }: { label: string; value: number }) {
  const normalized = value <= 1 ? value * 100 : value;
  const pct = Math.min(100, Math.max(0, normalized));
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 shrink-0 truncate text-text-secondary" title={label}>{label}</span>
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-bg-elevated">
        <span className="block h-full bg-violet-500" style={{ width: `${pct}%` }} />
      </span>
      <span className="w-10 shrink-0 text-right font-medium text-text-primary">{normalized.toFixed(1)}%</span>
    </div>
  );
}

function StatusBadge({ status }: { status: Model["status"] }) {
  if (status === "ready") return <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs leading-none text-emerald-700"><StatusReadyIcon size={12} />Ready</span>;
  if (status === "training") return <span className="status-pulse inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs leading-none text-amber-700"><StatusTrainingIcon size={12} className="animate-spin" />Training</span>;
  if (status === "trained") return <span className="inline-flex shrink-0 items-center rounded-full bg-violet-50 px-2 py-1 text-xs leading-none text-violet-700">Trained</span>;
  return <span className="inline-flex shrink-0 items-center rounded-full bg-red-50 px-2 py-1 text-xs leading-none text-red-600">Failed</span>;
}

function prettyFramework(f: Model["framework"]) {
  return f === "huggingface" ? "HuggingFace" : f === "onnx" ? "ONNX" : f === "sklearn" ? "Scikit-learn" : f[0].toUpperCase() + f.slice(1);
}
function prettyTask(task: Model["task_type"]) { return task.replaceAll("_", " "); }
function formatSize(value: number) { if (value > 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`; return `${(value / 1024 ** 2).toFixed(1)} MB`; }

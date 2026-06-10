"use client";

import { formatDistanceToNow } from "date-fns";
import { Calendar, CheckCircle2, ExternalLink, FileText, Film, Images, LoaderCircle, Mic, Package, Table } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import type { Dataset } from "@/types/dataset";

const typeIconMap = {
  image: Images,
  text: FileText,
  tabular: Table,
  audio: Mic,
  video: Film
};

export function DatasetCard({
  dataset,
  active = false,
  onUse,
  onViewDetails
}: {
  dataset: Dataset;
  active?: boolean;
  onUse: (dataset: Dataset) => void;
  onViewDetails: (dataset: Dataset) => void;
}) {
  const TypeIcon = typeIconMap[dataset.type];
  return (
    <article className="group overflow-hidden rounded-lg border border-border bg-bg-surface p-4 transition-all duration-150 hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md">
      <div className="mb-3 flex items-start justify-between">
        <div className="rounded-md bg-[#ECFDF5] p-2 text-emerald-600">
          <TypeIcon size={20} />
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium",
            dataset.label_status === "labeled" && "bg-[#ECFDF5] text-emerald-700",
            dataset.label_status === "unlabeled" && "bg-gray-100 text-gray-600",
            dataset.label_status === "processing" && "bg-amber-50 text-amber-700 status-pulse"
          )}
        >
          {dataset.label_status === "labeled" ? <CheckCircle2 size={12} /> : null}
          {dataset.label_status === "processing" ? <LoaderCircle size={12} className="animate-spin" /> : null}
          {dataset.label_status === "labeled" ? "Labeled" : dataset.label_status === "processing" ? "Processing" : "Unlabeled"}
        </span>
      </div>
      <p className="truncate text-base font-semibold text-text-primary">{dataset.name}</p>
      <p className="mb-3 truncate text-sm text-text-secondary">{dataset.description}</p>
      <div className="mb-3 h-px bg-border" />
      <div className="grid grid-cols-2 gap-x-2 gap-y-3 text-sm">
        <div className="flex min-w-0 items-center gap-1.5 text-text-secondary"><Package size={14} className="shrink-0" /><span className="truncate font-medium text-text-primary" title={formatSize(dataset.size_bytes)}>{formatSize(dataset.size_bytes)}</span></div>
        <div className="flex min-w-0 items-center gap-1.5 text-text-secondary"><Images size={14} className="shrink-0" /><span className="truncate font-medium text-text-primary" title={formatCount(dataset.item_count)}>{formatCount(dataset.item_count)}</span></div>
        <div className="flex min-w-0 items-center gap-1.5 text-text-secondary"><CheckCircle2 size={14} className="shrink-0" /><span className="truncate font-medium text-text-primary" title={dataset.label_status}>{dataset.label_status}</span></div>
        <div className="flex min-w-0 items-center gap-1.5 text-text-secondary"><Calendar size={14} className="shrink-0" /><span className="truncate font-medium text-text-primary" title={formatDistanceToNow(new Date(dataset.updated_at), { addSuffix: true })}>{formatDistanceToNow(new Date(dataset.updated_at), { addSuffix: true })}</span></div>
      </div>
      <div className="mt-4 flex">
        <Button size="sm" variant="outline" className="w-full text-text-secondary" onClick={() => onViewDetails(dataset)}>
          Chi tiết
        </Button>
      </div>
    </article>
  );
}

function formatCount(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1000)}K`;
  return `${value}`;
}

function formatSize(size: number) {
  const gb = 1024 ** 3;
  const mb = 1024 ** 2;
  if (size >= gb) return `${(size / gb).toFixed(1)} GB`;
  return `${Math.round(size / mb)} MB`;
}

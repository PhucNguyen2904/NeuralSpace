"use client";

import { formatDistanceToNow } from "date-fns";
import { FileText, Film, GitBranch, Images, Mic, Table } from "lucide-react";
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

const yoloTaskBadge: Record<string, { label: string; color: string }> = {
  object_detection: { label: "Detection", color: "bg-blue-50 text-blue-700" },
  instance_segmentation: { label: "Seg.", color: "bg-purple-50 text-purple-700" },
  pose_estimation: { label: "Pose", color: "bg-orange-50 text-orange-700" },
  image_classification: { label: "Classif.", color: "bg-emerald-50 text-emerald-700" },
  obb: { label: "OBB", color: "bg-rose-50 text-rose-700" }
};


export function DatasetRow({
  dataset,
  onSelect,
  onUse,
  onViewVersions
}: {
  dataset: Dataset;
  onSelect: (d: Dataset) => void;
  onUse: (d: Dataset) => void;
  onViewVersions: (d: Dataset) => void;
}) {
  const TypeIcon = typeIconMap[dataset.type];
  return (
    <div onClick={() => onSelect(dataset)} className="grid w-full cursor-pointer grid-cols-[40px_1.8fr_0.8fr_0.8fr_0.7fr_0.8fr_0.8fr_0.7fr] items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-bg-elevated">
      <span className="rounded-md bg-[#ECFDF5] p-1.5 text-emerald-600"><TypeIcon size={16} /></span>
      <span>
        <span className="block truncate font-medium text-text-primary">{dataset.name}</span>
        <span className="block truncate text-xs text-text-secondary">{dataset.description}</span>
      </span>
      <span className="flex flex-col gap-1">
        <span className="text-sm capitalize text-text-secondary">{dataset.type}</span>
        {dataset.yolo_task && yoloTaskBadge[dataset.yolo_task] ? (
          <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${yoloTaskBadge[dataset.yolo_task].color}`}>
            {yoloTaskBadge[dataset.yolo_task].label}
          </span>
        ) : null}
      </span>
      <span className="text-sm text-text-secondary">{formatSize(dataset.size_bytes)}</span>
      <span className="text-sm text-text-secondary">{formatCount(dataset.item_count)}</span>
      <span className={cn("text-xs font-medium", dataset.label_status === "labeled" && "text-emerald-700", dataset.label_status === "processing" && "text-amber-600", dataset.label_status === "unlabeled" && "text-text-secondary")}>{dataset.label_status}</span>
      <span className="text-sm text-text-secondary">{formatDistanceToNow(new Date(dataset.updated_at), { addSuffix: true })}</span>
      <Button
        size="sm"
        variant="ghost"
        className="justify-start px-2 text-emerald-700 hover:text-emerald-600"
        onClick={(event) => {
          event.stopPropagation();
          onViewVersions(dataset);
        }}
      >
        <GitBranch size={14} /> Versions
      </Button>
    </div>
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
  if (size >= gb) return `${(size / gb).toFixed(1)}GB`;
  return `${Math.round(size / mb)}MB`;
}

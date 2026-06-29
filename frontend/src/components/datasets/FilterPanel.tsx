"use client";

import type { LucideIcon } from "lucide-react";
import { AudioLines, Boxes, FileText, Film, Footprints, ImageIcon, RotateCcw, ScanLine, Search, Table2 } from "lucide-react";
import { Input } from "@/components/ui";
import type { DatasetFilters, DatasetType, YoloTaskType } from "@/types/dataset";

const typeItems: Array<{ key: DatasetType; label: string; icon: LucideIcon }> = [
  { key: "image", label: "Image", icon: ImageIcon },
  { key: "text", label: "Text / NLP", icon: FileText },
  { key: "tabular", label: "Tabular / CSV", icon: Table2 },
  { key: "audio", label: "Audio", icon: AudioLines },
  { key: "video", label: "Video", icon: Film }
];


const yoloTaskItems: Array<{ key: YoloTaskType; label: string; icon: LucideIcon; color: string }> = [
  { key: "object_detection", label: "Object Detection", icon: Boxes, color: "bg-blue-50 text-blue-700" },
  { key: "instance_segmentation", label: "Instance Segmentation", icon: ScanLine, color: "bg-purple-50 text-purple-700" },
  { key: "pose_estimation", label: "Pose Estimation", icon: Footprints, color: "bg-orange-50 text-orange-700" },
  { key: "image_classification", label: "Image Classification", icon: ImageIcon, color: "bg-emerald-50 text-emerald-700" },
  { key: "obb", label: "OBB Detection", icon: RotateCcw, color: "bg-rose-50 text-rose-700" }
];

const allTags = ["computer-vision", "nlp", "benchmark", "custom", "tabular", "audio", "video"];

export function FilterPanel({
  filters,
  searchValue,
  activeFilterCount,
  onSearchChange,
  onChange,
  onReset
}: {
  filters: DatasetFilters;
  searchValue: string;
  activeFilterCount: number;
  onSearchChange: (value: string) => void;
  onChange: (patch: Partial<DatasetFilters>) => void;
  onReset: () => void;
}) {
  return (
    <aside className="sticky top-4 h-fit w-full space-y-5 rounded-lg border border-border bg-bg-surface p-4 md:w-[280px]">
      <div>
        <p className="mb-2 text-sm font-semibold text-text-primary">Search</p>
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <Input value={searchValue} onChange={(e) => onSearchChange(e.target.value)} placeholder="Search datasets..." className="pl-9" />
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold text-text-primary">Data type {activeFilterCount > 0 ? <span className="rounded-full bg-[#ECFDF5] px-2 py-0.5 text-xs text-emerald-700">Filters ({activeFilterCount})</span> : null}</p>
        <div className="space-y-2">
          {typeItems.map((item) => (
            <label key={item.key} className="flex cursor-pointer items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-text-secondary"><input type="checkbox" checked={filters.types.includes(item.key)} onChange={(event) => onChange({ types: event.target.checked ? [...filters.types, item.key] : filters.types.filter((type) => type !== item.key) })} className="h-4 w-4 rounded border-border text-emerald-600 focus:ring-emerald-500" /><item.icon size={14} className="text-emerald-600" /> {item.label}</span>
            </label>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold text-text-primary">YOLO Task</p>
        <div className="space-y-2">
          {yoloTaskItems.map((item) => {
            const checked = filters.yoloTasks.includes(item.key);
            return (
              <label key={item.key} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) =>
                    onChange({
                      yoloTasks: event.target.checked
                        ? [...filters.yoloTasks, item.key]
                        : filters.yoloTasks.filter((t) => t !== item.key)
                    })
                  }
                  className="h-4 w-4 rounded border-border text-emerald-600 focus:ring-emerald-500"
                />
                <span className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${item.color}`}>
                  <item.icon size={11} />
                  {item.label}
                </span>
              </label>
            );
          })}
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold text-text-primary">Status</p>
        <div className="space-y-2 text-sm text-text-secondary">
          {(["all", "labeled", "unlabeled", "processing"] as const).map((status) => (
            <label key={status} className="flex cursor-pointer items-center gap-2">
              <input type="radio" name="status" checked={filters.status === status} onChange={() => onChange({ status })} />
              {status === "all" ? "All" : status === "labeled" ? "Labeled" : status === "unlabeled" ? "Unlabeled" : "Processing"}
            </label>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold text-text-primary">Size</p>
        <input type="range" min={0} max={50 * 1024} value={Math.round(filters.sizeMin / (1024 * 1024))} onChange={(event) => onChange({ sizeMin: Number(event.target.value) * 1024 * 1024 })} className="w-full accent-emerald-500" />
        <input type="range" min={0} max={50 * 1024} value={Math.round(filters.sizeMax / (1024 * 1024))} onChange={(event) => onChange({ sizeMax: Number(event.target.value) * 1024 * 1024 })} className="mt-2 w-full accent-emerald-500" />
        <p className="mt-1 text-xs text-text-secondary">{humanSize(filters.sizeMin)} - {humanSize(filters.sizeMax)}</p>
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold text-text-primary">Created date</p>
        <select value={filters.createdWithin} onChange={(e) => onChange({ createdWithin: e.target.value as DatasetFilters["createdWithin"] })} className="h-9 w-full rounded-md border border-border bg-bg-surface px-3 text-sm">
          <option value="all">All time</option>
          <option value="today">Today</option>
          <option value="7d">7 days</option>
          <option value="30d">30 days</option>
          <option value="3m">3 months</option>
        </select>
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold text-text-primary">Tags</p>
        <div className="flex flex-wrap gap-2">
          {allTags.map((tag) => {
            const selected = filters.tags.includes(tag);
            return (
              <button key={tag} onClick={() => onChange({ tags: selected ? filters.tags.filter((t) => t !== tag) : [...filters.tags, tag] })} className={selected ? "rounded-full bg-emerald-500 px-2.5 py-1 text-xs text-white" : "rounded-full bg-bg-elevated px-2.5 py-1 text-xs text-text-secondary hover:bg-[#ECFDF5]"}>
                {tag}
              </button>
            );
          })}
        </div>
      </div>
      {activeFilterCount > 0 ? (
        <button className="text-sm text-brand-600 hover:underline" onClick={onReset}>
          Clear all filters
        </button>
      ) : null}
    </aside>
  );
}

function humanSize(value: number) {
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  return `${Math.round(value / 1024 ** 2)} MB`;
}

"use client";

import type { LucideIcon } from "lucide-react";
import { AudioLines, FileText, Film, ImageIcon, Search, Table2 } from "lucide-react";
import { Input } from "@/components/ui";
import type { DatasetFilters, DatasetType } from "@/types/dataset";

const typeItems: Array<{ key: DatasetType; label: string; icon: LucideIcon; count: number }> = [
  { key: "image", label: "Image", icon: ImageIcon, count: 12 },
  { key: "text", label: "Text / NLP", icon: FileText, count: 6 },
  { key: "tabular", label: "Tabular / CSV", icon: Table2, count: 4 },
  { key: "audio", label: "Audio", icon: AudioLines, count: 1 },
  { key: "video", label: "Video", icon: Film, count: 1 }
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
          <Input value={searchValue} onChange={(e) => onSearchChange(e.target.value)} placeholder="Tìm dataset..." className="pl-9" />
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold text-text-primary">Loại dữ liệu {activeFilterCount > 0 ? <span className="rounded-full bg-[#ECFDF5] px-2 py-0.5 text-xs text-emerald-700">Bộ lọc ({activeFilterCount})</span> : null}</p>
        <div className="space-y-2">
          {typeItems.map((item) => (
            <label key={item.key} className="flex cursor-pointer items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-text-secondary"><input type="checkbox" checked={filters.types.includes(item.key)} onChange={(event) => onChange({ types: event.target.checked ? [...filters.types, item.key] : filters.types.filter((type) => type !== item.key) })} className="h-4 w-4 rounded border-border text-emerald-600 focus:ring-emerald-500" /><item.icon size={14} className="text-emerald-600" /> {item.label}</span>
              <span className="text-text-tertiary">{item.count}</span>
            </label>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold text-text-primary">Trạng thái</p>
        <div className="space-y-2 text-sm text-text-secondary">
          {(["all", "labeled", "unlabeled", "processing"] as const).map((status) => (
            <label key={status} className="flex cursor-pointer items-center gap-2">
              <input type="radio" name="status" checked={filters.status === status} onChange={() => onChange({ status })} />
              {status === "all" ? "Tất cả" : status === "labeled" ? "Đã gán nhãn" : status === "unlabeled" ? "Chưa gán nhãn" : "Đang xử lý"}
            </label>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold text-text-primary">Kích thước</p>
        <input type="range" min={0} max={50 * 1024} value={Math.round(filters.sizeMin / (1024 * 1024))} onChange={(event) => onChange({ sizeMin: Number(event.target.value) * 1024 * 1024 })} className="w-full accent-emerald-500" />
        <input type="range" min={0} max={50 * 1024} value={Math.round(filters.sizeMax / (1024 * 1024))} onChange={(event) => onChange({ sizeMax: Number(event.target.value) * 1024 * 1024 })} className="mt-2 w-full accent-emerald-500" />
        <p className="mt-1 text-xs text-text-secondary">{humanSize(filters.sizeMin)} - {humanSize(filters.sizeMax)}</p>
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold text-text-primary">Thời gian tạo</p>
        <select value={filters.createdWithin} onChange={(e) => onChange({ createdWithin: e.target.value as DatasetFilters["createdWithin"] })} className="h-9 w-full rounded-md border border-border bg-bg-surface px-3 text-sm">
          <option value="all">Tất cả thời gian</option>
          <option value="today">Hôm nay</option>
          <option value="7d">7 ngày</option>
          <option value="30d">30 ngày</option>
          <option value="3m">3 tháng</option>
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
          Xóa tất cả bộ lọc
        </button>
      ) : null}
    </aside>
  );
}

function humanSize(value: number) {
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  return `${Math.round(value / 1024 ** 2)} MB`;
}

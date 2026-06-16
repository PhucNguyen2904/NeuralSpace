"use client";

import { Grid2X2, List, SearchX } from "lucide-react";
import type { ReactNode } from "react";

export function ResourceBrowser({
  resultLabel,
  sort,
  onSortChange,
  view,
  onViewChange,
  loading,
  isEmpty,
  onClearFilters,
  gridContent,
  listContent,
  skeleton
}: {
  resultLabel: string;
  sort: string;
  onSortChange: (value: string) => void;
  view: "grid" | "list";
  onViewChange: (value: "grid" | "list") => void;
  loading: boolean;
  isEmpty: boolean;
  onClearFilters: () => void;
  gridContent: ReactNode;
  listContent: ReactNode;
  skeleton: ReactNode;
}) {
  return (
    <section className="min-w-0 flex-1 space-y-3 rounded-lg border border-border bg-bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-text-secondary">{resultLabel}</p>
        <div className="flex items-center gap-2">
          <select value={sort} onChange={(e) => onSortChange(e.target.value)} className="h-9 rounded-md border border-border px-3 text-sm">
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="name">Name A-Z</option>
            <option value="accuracy">Highest metric</option>
            <option value="size">Largest</option>
          </select>
          <div className="flex rounded-md border border-border p-1">
            <button onClick={() => onViewChange("grid")} className={view === "grid" ? "rounded bg-bg-elevated p-1 text-text-primary" : "rounded p-1 text-text-secondary"}><Grid2X2 size={15} /></button>
            <button onClick={() => onViewChange("list")} className={view === "list" ? "rounded bg-bg-elevated p-1 text-text-primary" : "rounded p-1 text-text-secondary"}><List size={15} /></button>
          </div>
        </div>
      </div>
      {loading ? skeleton : null}
      {!loading && isEmpty ? (
        <div className="flex min-h-72 flex-col items-center justify-center text-center">
          <SearchX className="mb-3 text-text-tertiary" />
          <p className="text-base font-medium">No matching results found</p>
          <button className="mt-2 text-sm text-brand-600 hover:underline" onClick={onClearFilters}>Clear all filters</button>
        </div>
      ) : null}
      {!loading && !isEmpty && view === "grid" ? gridContent : null}
      {!loading && !isEmpty && view === "list" ? listContent : null}
    </section>
  );
}

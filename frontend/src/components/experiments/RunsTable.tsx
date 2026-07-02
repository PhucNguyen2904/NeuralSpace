import { useMemo, useState } from "react";
import { Trash2, Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui";
import { RunStatusBadge } from "@/components/shared";
import { cn } from "@/lib/utils/cn";
import { formatRelativeTime } from "@/lib/utils/format";
import type { RunDetailData, RunFilters } from "@/lib/hooks/useExperiments";

const ALL_COLUMNS = ["accuracy", "loss", "f1_score"] as const;
type MetricColumn = (typeof ALL_COLUMNS)[number];

interface RunsTableProps {
  runs: RunDetailData[];
  filters: RunFilters;
  onFiltersChange: (patch: Partial<RunFilters>) => void;
  selectedRunIds: string[];
  onToggleSelect: (runId: string) => void;
  onOpenRun: (runId: string) => void;
  onDeleteRun: (run: RunDetailData) => void;
  onCompare: () => void;
}

export function RunsTable({
  runs,
  filters,
  onFiltersChange,
  selectedRunIds,
  onToggleSelect,
  onOpenRun,
  onDeleteRun,
  onCompare
}: RunsTableProps) {
  const [columns, setColumns] = useState<MetricColumn[]>(["accuracy", "loss"]);
  const [columnsMenuOpen, setColumnsMenuOpen] = useState(false);

  const canCompare = selectedRunIds.length >= 2 && selectedRunIds.length <= 4;

  const statusOptions = useMemo(() => ["ALL", "RUNNING", "FINISHED", "FAILED", "KILLED"] as const, []);

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-bg-surface p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" size={16} />
            <input
              value={filters.search ?? ""}
              onChange={(event) => onFiltersChange({ search: event.target.value })}
              placeholder="Search runs..."
              className="h-9 min-w-[240px] rounded-md border border-border bg-white pl-9 pr-3 text-sm transition-colors focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
          </div>
          
          <select
            value={filters.status ?? "ALL"}
            onChange={(event) => onFiltersChange({ status: event.target.value as RunFilters["status"] })}
            className="h-9 rounded-md border border-border bg-white px-3 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          >
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status === "ALL" ? "All Statuses" : status}
              </option>
            ))}
          </select>
          
          <input
            type="number"
            step={0.01}
            min={0}
            max={1}
            value={filters.minAccuracy ?? ""}
            onChange={(event) => onFiltersChange({ minAccuracy: event.target.value ? Number(event.target.value) : undefined })}
            placeholder="Min Accuracy"
            className="h-9 w-[130px] rounded-md border border-border bg-white px-3 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => setColumnsMenuOpen((prev) => !prev)}
              className="bg-white"
            >
              <SlidersHorizontal size={14} className="mr-2" /> Columns
            </Button>
            {columnsMenuOpen ? (
              <div className="absolute right-0 top-full z-20 mt-1.5 w-48 rounded-lg border border-border bg-white p-2 shadow-lg">
                <div className="mb-2 px-2 pb-1 text-xs font-semibold uppercase tracking-wider text-text-tertiary">Visible Columns</div>
                {ALL_COLUMNS.map((column) => (
                  <label key={column} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={columns.includes(column)}
                      onChange={() =>
                        setColumns((prev) =>
                          prev.includes(column) ? prev.filter((item) => item !== column) : [...prev, column]
                        )
                      }
                      className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                    />
                    {column.replace("_", " ")}
                  </label>
                ))}
              </div>
            ) : null}
          </div>
          <Button 
            size="sm" 
            disabled={!canCompare} 
            onClick={onCompare}
            className={canCompare ? "bg-violet-600 text-white hover:bg-violet-700" : ""}
          >
            Compare Runs
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-bg-surface/50">
            <tr className="border-b border-border text-xs font-semibold uppercase tracking-wide text-text-tertiary">
              <th className="px-4 py-3 w-[40px] text-center" />
              <th className="px-4 py-3 cursor-pointer hover:text-text-primary transition-colors" onClick={() => onFiltersChange({ sortBy: "name" })}>Run Name</th>
              <th className="px-4 py-3 cursor-pointer hover:text-text-primary transition-colors" onClick={() => onFiltersChange({ sortBy: "status" })}>Status</th>
              {columns.map((column) => (
                <th key={column} className="px-4 py-3 cursor-pointer hover:text-text-primary transition-colors" onClick={() => onFiltersChange({ sortBy: column })}>
                  {column.replace("_", " ")}
                </th>
              ))}
              <th className="px-4 py-3 cursor-pointer hover:text-text-primary transition-colors" onClick={() => onFiltersChange({ sortBy: "started" })}>Started</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {runs.map((run) => (
              <tr key={run.run_id} className="transition-colors hover:bg-bg-surface/50">
                <td className="px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={selectedRunIds.includes(run.run_id)}
                    onChange={() => onToggleSelect(run.run_id)}
                    className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                  />
                </td>
                <td className="px-4 py-3">
                  <button className="font-semibold text-brand-600 hover:underline" onClick={() => onOpenRun(run.run_id)}>
                    {run.name}
                  </button>
                </td>
                <td className="px-4 py-3"><RunStatusBadge status={run.status} size="sm" /></td>
                {columns.map((column) => {
                  const value = run.metricsMap[column];
                  const good = column === "loss" ? value <= 0.15 : value >= 0.9;
                  return (
                    <td key={`${run.run_id}-${column}`} className={cn("px-4 py-3 font-medium", value ? (good ? "text-emerald-600" : "text-error-600") : "text-text-tertiary")}>
                      {value ? value.toFixed(3) : "—"}
                    </td>
                  );
                })}
                <td className="px-4 py-3 text-text-secondary">{formatRelativeTime(run.start_time)}</td>
                <td className="px-4 py-3 text-right">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 px-0 text-text-tertiary hover:bg-error-50 hover:text-error-600 transition-colors"
                    onClick={() => onDeleteRun(run)}
                    title="Delete run"
                  >
                    <Trash2 size={16} />
                  </Button>
                </td>
              </tr>
            ))}
            {runs.length === 0 && (
              <tr>
                <td colSpan={5 + columns.length} className="px-4 py-12 text-center text-text-secondary">
                  No runs matched the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

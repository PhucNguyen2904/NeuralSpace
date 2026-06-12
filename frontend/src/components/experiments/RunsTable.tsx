import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
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
    <section className="rounded-lg border border-border bg-bg-surface p-3">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={filters.search ?? ""}
          onChange={(event) => onFiltersChange({ search: event.target.value })}
          placeholder="Search runs..."
          className="h-9 min-w-[220px] rounded-md border border-border px-3 text-sm"
        />
        <select
          value={filters.status ?? "ALL"}
          onChange={(event) => onFiltersChange({ status: event.target.value as RunFilters["status"] })}
          className="h-9 rounded-md border border-border px-3 text-sm"
        >
          {statusOptions.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
        <input
          type="number"
          step={0.001}
          min={0}
          max={1}
          value={filters.minAccuracy ?? ""}
          onChange={(event) => onFiltersChange({ minAccuracy: event.target.value ? Number(event.target.value) : undefined })}
          placeholder="Min accuracy"
          className="h-9 w-[130px] rounded-md border border-border px-3 text-sm"
        />
        <div className="relative">
          <Button size="sm" variant="outline" onClick={() => setColumnsMenuOpen((prev) => !prev)}>
            Columns
          </Button>
          {columnsMenuOpen ? (
            <div className="absolute right-0 z-20 mt-1 w-40 rounded-md border border-border bg-bg-surface p-2 shadow-sm">
              {ALL_COLUMNS.map((column) => (
                <label key={column} className="mb-1 flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={columns.includes(column)}
                    onChange={() =>
                      setColumns((prev) =>
                        prev.includes(column) ? prev.filter((item) => item !== column) : [...prev, column]
                      )
                    }
                  />
                  {column}
                </label>
              ))}
            </div>
          ) : null}
        </div>
        <Button size="sm" disabled={!canCompare} onClick={onCompare}>
          Compare
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-tertiary">
              <th className="px-2 py-2" />
              <th className="px-2 py-2 cursor-pointer" onClick={() => onFiltersChange({ sortBy: "name" })}>Run Name</th>
              <th className="px-2 py-2 cursor-pointer" onClick={() => onFiltersChange({ sortBy: "status" })}>Status</th>
              {columns.map((column) => (
                <th key={column} className="px-2 py-2 cursor-pointer" onClick={() => onFiltersChange({ sortBy: column })}>
                  {column.toUpperCase()}
                </th>
              ))}
              <th className="px-2 py-2 cursor-pointer" onClick={() => onFiltersChange({ sortBy: "started" })}>Started</th>
              <th className="px-2 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.run_id} className="border-b border-border/70 hover:bg-bg-elevated">
                <td className="px-2 py-2">
                  <input
                    type="checkbox"
                    checked={selectedRunIds.includes(run.run_id)}
                    onChange={() => onToggleSelect(run.run_id)}
                  />
                </td>
                <td className="px-2 py-2">
                  <button className="text-left font-medium hover:text-brand-600" onClick={() => onOpenRun(run.run_id)}>
                    {run.name}
                  </button>
                </td>
                <td className="px-2 py-2"><RunStatusBadge status={run.status} size="sm" /></td>
                {columns.map((column) => {
                  const value = run.metricsMap[column];
                  const good = column === "loss" ? value <= 0.15 : value >= 0.9;
                  return (
                    <td key={`${run.run_id}-${column}`} className={cn("px-2 py-2 font-medium", value ? (good ? "text-emerald-600" : "text-red-600") : "text-text-tertiary")}>
                      {value ? value.toFixed(3) : "—"}
                    </td>
                  );
                })}
                <td className="px-2 py-2 text-text-secondary">{formatRelativeTime(run.start_time)}</td>
                <td className="px-2 py-2 text-right">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 px-0 text-error-500 hover:text-error-500"
                    onClick={() => onDeleteRun(run)}
                    aria-label={`Delete run ${run.name ?? run.run_id}`}
                    title="Delete run"
                  >
                    <Trash2 size={14} />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

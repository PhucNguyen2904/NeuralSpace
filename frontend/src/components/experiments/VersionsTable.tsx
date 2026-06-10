import { useState } from "react";
import { Button } from "@/components/ui";
import { StageBadge } from "@/components/shared";
import { cn } from "@/lib/utils/cn";
import type { RegistryModelVersion } from "@/lib/hooks/useModelRegistry";

const ALL_COLUMNS = ["accuracy", "loss", "f1"] as const;
type MetricColumn = (typeof ALL_COLUMNS)[number];

interface VersionsTableProps {
  versions: RegistryModelVersion[];
  selectedVersionIds: string[];
  onToggleSelect: (versionId: string) => void;
  onOpenVersion: (versionId: string) => void;
  onCompare: () => void;
}

export function VersionsTable({
  versions,
  selectedVersionIds,
  onToggleSelect,
  onOpenVersion,
  onCompare
}: VersionsTableProps) {
  const [columns, setColumns] = useState<MetricColumn[]>(["accuracy", "loss", "f1"]);
  const [columnsMenuOpen, setColumnsMenuOpen] = useState(false);
  const [search, setSearch] = useState("");

  const canCompare = selectedVersionIds.length >= 2 && selectedVersionIds.length <= 4;

  const filteredVersions = versions.filter((v) =>
    v.version.toLowerCase().includes(search.toLowerCase()) ||
    v.runId.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <section className="rounded-lg border border-border bg-bg-surface p-3">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search versions..."
          className="h-9 min-w-[220px] rounded-md border border-border px-3 text-sm"
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
              <th className="px-2 py-2">Version</th>
              <th className="px-2 py-2">Stage</th>
              {columns.map((column) => (
                <th key={column} className="px-2 py-2">
                  {column.toUpperCase()}
                </th>
              ))}
              <th className="px-2 py-2">Registered At</th>
            </tr>
          </thead>
          <tbody>
            {filteredVersions.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-2 py-6 text-center text-xs text-text-tertiary">
                  No versions found.
                </td>
              </tr>
            ) : null}
            {filteredVersions.map((version) => (
              <tr key={version.id} className="border-b border-border/70 hover:bg-bg-elevated">
                <td className="px-2 py-2">
                  <input
                    type="checkbox"
                    checked={selectedVersionIds.includes(version.id)}
                    onChange={() => onToggleSelect(version.id)}
                  />
                </td>
                <td className="px-2 py-2">
                  <button className="text-left font-medium hover:text-brand-600" onClick={() => onOpenVersion(version.id)}>
                    {version.version}
                  </button>
                </td>
                <td className="px-2 py-2">
                  <StageBadge stage={version.stage} />
                </td>
                {columns.map((column) => {
                  const value = version[column as keyof RegistryModelVersion];
                  const numericValue = typeof value === "number" ? value : null;
                  const good = column === "loss" ? (numericValue && numericValue <= 0.15) : (numericValue && numericValue >= 0.85);
                  return (
                    <td key={`${version.id}-${column}`} className={cn("px-2 py-2 font-medium", numericValue ? (good ? "text-emerald-600" : "text-red-600") : "text-text-tertiary")}>
                      {numericValue ? numericValue.toFixed(3) : "—"}
                    </td>
                  );
                })}
                <td className="px-2 py-2 text-text-secondary">{version.registeredAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

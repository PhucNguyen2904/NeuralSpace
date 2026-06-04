import { useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, Pencil, XCircle } from "lucide-react";
import { Button } from "@/components/ui";
import type { DatasetVersion, VersionDiffSummary } from "@/lib/hooks/useDatasetVersions";

interface VersionDiffProps {
  currentVersion: DatasetVersion;
  versions: DatasetVersion[];
  diff: VersionDiffSummary | null;
  loading?: boolean;
  onCompare: (againstVersionId: string) => void;
}

export function VersionDiff({ currentVersion, versions, diff, loading = false, onCompare }: VersionDiffProps) {
  const [againstVersionId, setAgainstVersionId] = useState("");
  const [expanded, setExpanded] = useState(false);

  const compareTargets = useMemo(
    () => versions.filter((item) => item.id !== currentVersion.id),
    [versions, currentVersion.id]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-text-secondary">Compare với:</label>
        <select
          value={againstVersionId}
          onChange={(event) => setAgainstVersionId(event.target.value)}
          className="h-9 min-w-[160px] rounded-md border border-border bg-bg-surface px-3 text-sm"
        >
          <option value="">Chọn version</option>
          {compareTargets.map((item) => (
            <option key={item.id} value={item.id}>
              {item.version}
            </option>
          ))}
        </select>
        <Button size="sm" disabled={!againstVersionId || loading} onClick={() => onCompare(againstVersionId)}>
          {loading ? "Comparing..." : "Compare"}
        </Button>
      </div>

      {diff ? (
        <div className="rounded-lg border border-border bg-bg-elevated p-4">
          <div className="space-y-2 text-sm">
            <p className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-600" />
              Added: {diff.added.toLocaleString()} items
            </p>
            <p className="flex items-center gap-2">
              <Pencil size={16} className="text-amber-600" />
              Modified: {diff.modified.toLocaleString()} items
            </p>
            <p className="flex items-center gap-2">
              <XCircle size={16} className="text-red-600" />
              Removed: {diff.removed.toLocaleString()} items
            </p>
            <div className="my-2 border-t border-border" />
            <p className="font-medium">
              Net change: {diff.netChange > 0 ? "+" : ""}
              {diff.netChange.toLocaleString()} items ({diff.netPercent > 0 ? "+" : ""}
              {diff.netPercent.toFixed(1)}%)
            </p>
          </div>
          <button
            type="button"
            className="mt-3 inline-flex items-center gap-1 text-xs text-brand-600 hover:underline"
            onClick={() => setExpanded((prev) => !prev)}
          >
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            Chi tiết samples thay đổi
          </button>
          {expanded ? (
            <ul className="mt-2 space-y-1 text-xs text-text-secondary">
              {diff.samples.map((sample) => (
                <li key={sample.id}>
                  {sample.id} · {sample.changeType} · {sample.note}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

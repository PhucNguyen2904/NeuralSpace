import { Search } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui";
import { VersionTag } from "@/components/shared";
import { formatBytes, formatRelativeTime } from "@/lib/utils/format";
import type { DatasetVersion } from "@/lib/hooks/useDatasetVersions";

interface VersionListProps {
  versions: DatasetVersion[];
  selectedVersionId: string | null;
  search: string;
  errorMessage?: string;
  onSearchChange: (value: string) => void;
  onSelectVersion: (version: DatasetVersion) => void;
  onTrack: () => void;
}

export function VersionList({
  versions,
  selectedVersionId,
  search,
  errorMessage,
  onSearchChange,
  onSelectVersion,
  onTrack
}: VersionListProps) {
  return (
    <aside className="w-full rounded-lg border border-border bg-bg-surface lg:w-[360px]">
      <div className="border-b border-border p-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search versions..."
              className="h-9 w-full rounded-md border border-border bg-bg-surface pl-8 pr-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
          <Button size="sm" className="h-9 px-3" onClick={onTrack}>
            + Track
          </Button>
        </div>
      </div>

      <div className="max-h-[640px] overflow-y-auto p-2">
        {errorMessage ? (
          <p className="p-4 text-sm text-red-600">{errorMessage}</p>
        ) : versions.length === 0 ? (
          <p className="p-4 text-sm text-text-secondary">No versions found.</p>
        ) : null}
        {versions.map((version) => {
          const active = version.id === selectedVersionId;
          return (
            <button
              key={version.id}
              type="button"
              onClick={() => onSelectVersion(version)}
              className={cn(
                "mb-1 w-full rounded-md border border-transparent px-3 py-2 text-left transition-colors hover:bg-bg-elevated",
                active && "border-l-2 border-l-brand-500 bg-brand-50"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <VersionTag version={version.version} isLatest={version.is_latest} status={version.status} />
                {version.validation_status ? (
                  <span className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-medium",
                    version.validation_status === "failed" ? "bg-red-50 text-red-700" : version.validation_status === "warning" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"
                  )}>
                    {version.validation_status}
                  </span>
                ) : null}
              </div>
              <p className="mt-1.5 text-xs text-text-secondary">
                {[version.format, version.task_type].filter(Boolean).join(" · ") || version.dvc_md5.slice(0, 7) || "metadata"}
              </p>
              <p className="mt-1 text-xs text-text-secondary">
                {formatBytes(version.size_bytes)} · {formatRelativeTime(version.created_at)}
              </p>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

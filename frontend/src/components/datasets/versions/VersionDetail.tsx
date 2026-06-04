import { Copy, ExternalLink, Package, GitBranch, Boxes, Link2 } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { IntegrityCheck } from "@/components/datasets/versions/IntegrityCheck";
import { VersionDiff } from "@/components/datasets/versions/VersionDiff";
import { Button } from "@/components/ui";
import { StageBadge, VersionTag } from "@/components/shared";
import { formatBytes, formatRelativeTime } from "@/lib/utils/format";
import type { DatasetVersion, UseVersionDiffReturn } from "@/lib/hooks/useDatasetVersions";

type DetailTab = "info" | "diff" | "integrity" | "models";

interface VersionDetailProps {
  version: DatasetVersion;
  versions: DatasetVersion[];
  diffState: UseVersionDiffReturn;
  onRecheckIntegrity: () => void;
}

export function VersionDetail({ version, versions, diffState, onRecheckIntegrity }: VersionDetailProps) {
  const [tab, setTab] = useState<DetailTab>("info");
  const [schemaExpanded, setSchemaExpanded] = useState(false);

  const tabClass = useMemo(
    () => (value: DetailTab) =>
      value === tab
        ? "rounded-md bg-brand-50 px-2.5 py-1 text-sm font-medium text-brand-600"
        : "rounded-md px-2.5 py-1 text-sm text-text-secondary",
    [tab]
  );

  return (
    <section className="min-w-0 flex-1 rounded-lg border border-border bg-bg-surface p-4">
      <header className="space-y-2 border-b border-border pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold">{version.version}</h2>
          <VersionTag version={version.version} isLatest={version.is_latest} status={version.status} />
        </div>
        <p className="text-sm text-text-secondary">
          Tạo bởi {version.created_by} · {formatRelativeTime(version.created_at)} · {version.dvc_md5}
        </p>
      </header>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<Package size={15} />} label="Size" value={formatBytes(version.size_bytes)} />
        <StatCard icon={<Boxes size={15} />} label="Items" value={`${version.item_count.toLocaleString()} items`} />
        <StatCard icon={<GitBranch size={15} />} label="Split" value={version.split_ratio} />
        <StatCard icon={<Link2 size={15} />} label="Models" value={`${version.linked_models.length} models`} />
      </div>

      <div className="mt-4 border-b border-border pb-2">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setTab("info")} className={tabClass("info")}>Info</button>
          <button type="button" onClick={() => setTab("diff")} className={tabClass("diff")}>Diff</button>
          <button type="button" onClick={() => setTab("integrity")} className={tabClass("integrity")}>Integrity</button>
          <button type="button" onClick={() => setTab("models")} className={tabClass("models")}>Models using this</button>
        </div>
      </div>

      <div className="mt-4">
        {tab === "info" ? (
          <div className="space-y-4 text-sm">
            <div>
              <p className="font-medium">Changelog</p>
              <p className="text-text-secondary">{version.changelog}</p>
            </div>
            <div>
              <p className="mb-2 font-medium">DVC metadata</p>
              <MetaRow label="Git commit" value={version.git_commit} />
              <MetaRow label="DVC md5" value={version.dvc_md5} />
              <MetaRow label="Storage" value={version.storage_uri} />
              <MetaRow label="Tracked at" value={version.tracked_at} />
            </div>
            <div>
              <button type="button" className="text-sm font-medium text-brand-600 hover:underline" onClick={() => setSchemaExpanded((prev) => !prev)}>
                Schema snapshot {schemaExpanded ? "▲" : "▼"}
              </button>
              {schemaExpanded ? (
                <div className="mt-2 rounded-md border border-border bg-bg-elevated p-2 font-mono text-xs">
                  filename | label | bbox_x | bbox_y | bbox_w | bbox_h
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {tab === "diff" ? (
          <VersionDiff
            currentVersion={version}
            versions={versions}
            diff={diffState.diff}
            loading={diffState.isLoading}
            onCompare={diffState.compare}
          />
        ) : null}

        {tab === "integrity" ? (
          <IntegrityCheck
            lastCheckedAt={version.integrity.lastChecked}
            checks={version.integrity.checks}
            onRecheck={onRecheckIntegrity}
            checking={diffState.isRecheckingIntegrity}
          />
        ) : null}

        {tab === "models" ? (
          <div className="space-y-2">
            {version.linked_models.map((model) => (
              <div key={model.id} className="flex items-center justify-between rounded-md border border-border p-2">
                <p className="text-sm font-medium">{model.name}</p>
                <div className="flex items-center gap-2">
                  <StageBadge stage={model.stage} size="sm" />
                  <a href={`/models?id=${model.id}`} className="text-sm text-brand-600 hover:underline">
                    <ExternalLink size={14} className="inline" /> Open
                  </a>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-1 flex items-center justify-between gap-3 rounded-md border border-border px-2 py-1.5">
      <span className="text-text-secondary">{label}</span>
      <div className="flex items-center gap-1.5">
        <code className="max-w-[360px] truncate font-mono text-xs text-text-primary">{value}</code>
        <Button size="sm" variant="ghost"><Copy size={12} /></Button>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-bg-elevated p-3">
      <p className="mb-1 flex items-center gap-1 text-xs text-text-secondary">
        {icon}
        {label}
      </p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}

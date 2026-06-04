"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { VersionDetail } from "@/components/datasets/versions/VersionDetail";
import { VersionList } from "@/components/datasets/versions/VersionList";
import { TrackVersionModal } from "@/components/datasets/versions/TrackVersionModal";
import { useDatasetDetail } from "@/lib/hooks/useDatasets";
import { useTrackVersion, useVersionDetail, useVersionDiff, useVersionList } from "@/lib/hooks/useDatasetVersions";

type PageTab = "overview" | "versions" | "preview" | "usage-history";

export default function DatasetDetailPage() {
  const params = useParams<{ id: string }>();
  const datasetId = params?.id ?? "";
  const [tab, setTab] = useState<PageTab>("versions");
  const [search, setSearch] = useState("");
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [trackModalOpen, setTrackModalOpen] = useState(false);

  const datasetDetail = useDatasetDetail(datasetId);
  const listQuery = useVersionList(datasetId);
  const versions = listQuery.data ?? [];
  const filteredVersions = useMemo(
    () => versions.filter((item) => item.version.toLowerCase().includes(search.toLowerCase()) || item.dvc_md5.toLowerCase().includes(search.toLowerCase())),
    [versions, search]
  );

  const activeVersionId = selectedVersionId ?? filteredVersions[0]?.id ?? "";
  const detailQuery = useVersionDetail(activeVersionId);
  const diffState = useVersionDiff(activeVersionId);
  const tracker = useTrackVersion();

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">{datasetDetail.detail.data?.name ?? "Dataset Detail"}</h1>
        <p className="text-sm text-text-secondary">Quản lý metadata, versions và lineage của dataset.</p>
      </header>

      <div className="flex flex-wrap gap-2 border-b border-border pb-2">
        <TabButton label="Overview" active={tab === "overview"} onClick={() => setTab("overview")} />
        <TabButton label="Versions ★" active={tab === "versions"} onClick={() => setTab("versions")} />
        <TabButton label="Preview" active={tab === "preview"} onClick={() => setTab("preview")} />
        <TabButton label="Usage History" active={tab === "usage-history"} onClick={() => setTab("usage-history")} />
      </div>

      {tab === "overview" ? <Placeholder text="Overview content giữ theo dataset summary hiện có." /> : null}
      {tab === "preview" ? <Placeholder text="Preview tab sẽ nối với sample preview hiện có." /> : null}
      {tab === "usage-history" ? <Placeholder text="Usage History sẽ hiển thị lịch sử training/inference theo workspace." /> : null}

      {tab === "versions" ? (
        <div className="flex flex-col gap-4 lg:flex-row">
          <VersionList
            versions={filteredVersions}
            selectedVersionId={activeVersionId || null}
            search={search}
            onSearchChange={setSearch}
            onSelectVersion={(version) => setSelectedVersionId(version.id)}
            onTrack={() => {
              tracker.reset();
              setTrackModalOpen(true);
            }}
          />

          {detailQuery.data ? (
            <VersionDetail
              version={detailQuery.data}
              versions={versions}
              diffState={diffState}
              onRecheckIntegrity={() => {
                // Re-check action placeholder for API integration.
              }}
            />
          ) : (
            <section className="flex min-h-[400px] flex-1 items-center justify-center rounded-lg border border-border bg-bg-surface text-sm text-text-secondary">
              {listQuery.isLoading ? "Loading versions..." : "No version selected."}
            </section>
          )}
        </div>
      ) : null}

      <TrackVersionModal
        open={trackModalOpen}
        onClose={() => setTrackModalOpen(false)}
        datasetId={datasetId}
        tracker={tracker}
      />
    </div>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={active ? "rounded-md bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-600" : "rounded-md px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-elevated"}
    >
      {label}
    </button>
  );
}

function Placeholder({ text }: { text: string }) {
  return (
    <section className="rounded-lg border border-border bg-bg-surface p-4 text-sm text-text-secondary">{text}</section>
  );
}

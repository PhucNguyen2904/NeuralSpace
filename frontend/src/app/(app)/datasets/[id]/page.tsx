"use client";

import { useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { VersionDetail } from "@/components/datasets/versions/VersionDetail";
import { VersionList } from "@/components/datasets/versions/VersionList";
import { TrackVersionModal } from "@/components/datasets/versions/TrackVersionModal";
import { Button } from "@/components/ui";
import { useDatasetDetail } from "@/lib/hooks/useDatasets";
import { useTrackVersion, useVersionDetail, useVersionDiff, useVersionList } from "@/lib/hooks/useDatasetVersions";

export default function DatasetDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const datasetId = params?.id ?? "";
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
  const detailQuery = useVersionDetail(datasetId, activeVersionId);
  const diffState = useVersionDiff(datasetId, activeVersionId);
  const tracker = useTrackVersion();

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="outline" onClick={() => router.push("/datasets")}>
          <ArrowLeft size={14} /> Back
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">{datasetDetail.detail.data?.name ?? "Dataset Versions"}</h1>
          <p className="text-sm text-text-secondary">Quản lý versions, DVC metadata, integrity và lineage của dataset.</p>
        </div>
      </header>

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
            onRecheckIntegrity={() => void diffState.recheckIntegrity()}
          />
        ) : (
          <section className="flex min-h-[400px] flex-1 items-center justify-center rounded-lg border border-border bg-bg-surface text-sm text-text-secondary">
            {listQuery.isLoading ? "Loading versions..." : "No version selected."}
          </section>
        )}
      </div>

      <TrackVersionModal
        open={trackModalOpen}
        onClose={() => setTrackModalOpen(false)}
        datasetId={datasetId}
        onSuccess={() => {
          // Auto-select the newly created version (first in refetched list)
          setSelectedVersionId(null);
        }}
      />
    </div>
  );
}

"use client";

import { useState } from "react";
import { ArrowLeft, UploadCloud } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui";
import { StageBadge } from "@/components/shared";
import { VersionTimeline } from "@/components/models/registry/VersionTimeline";
import { UploadVersionModal } from "@/components/models/registry/UploadVersionModal";
import { useModelVersions } from "@/lib/hooks/useModelRegistry";
import { useModels } from "@/lib/hooks/useModels";

type Tab = "versions" | "experiments" | "settings";

export default function ModelRegistryDetailPage() {
  const params = useParams<{ name: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const modelName = safeDecode(params?.name ?? "");
  const [tab, setTab] = useState<Tab>("versions");
  const [uploadOpen, setUploadOpen] = useState(false);
  const versions = useModelVersions(modelName);
  const latest = versions.data?.[0];

  // Find the matching model from the main model list to get its internal id
  const modelsQuery = useModels({ search: modelName, frameworks: [], taskTypes: [], status: "all", sizeCategory: "all", sort: "newest", view: "grid" });
  const matchedModel = modelsQuery.data?.items.find((m) => m.name === modelName) ?? null;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button size="sm" variant="outline" onClick={() => router.push("/models")}>
            <ArrowLeft size={14} /> Back
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">{modelName}</h1>
            {latest ? (
              <div className="mt-1 flex items-center gap-2 text-sm">
                <span className="text-text-secondary">Latest: {latest.version}</span>
                <StageBadge stage={latest.stage} />
              </div>
            ) : null}
          </div>
        </div>
        <Button
          className="bg-violet-600 text-white hover:bg-violet-500"
          onClick={() => setUploadOpen(true)}
          disabled={!matchedModel}
          title={!matchedModel ? "Model not found in registry" : undefined}
        >
          <UploadCloud size={14} /> Upload version
        </Button>
      </header>

      <div className="flex gap-2 border-b border-border pb-2">
        <TabButton label="Versions" active={tab === "versions"} onClick={() => setTab("versions")} />
        <TabButton label="Experiments" active={tab === "experiments"} onClick={() => setTab("experiments")} />
        <TabButton label="Settings" active={tab === "settings"} onClick={() => setTab("settings")} />
      </div>

      {tab === "versions" ? (
        <VersionTimeline
          versions={versions.data ?? []}
          onViewVersion={(version) => router.push(`/models/${encodeURIComponent(modelName)}/versions/${encodeURIComponent(version.replace(/^v/, ""))}`)}
          onRollback={() => {}}
        />
      ) : null}
      {tab === "experiments" ? <Placeholder text="Experiments list linked to MLflow runs for this model." /> : null}
      {tab === "settings" ? <Placeholder text="Registry settings: tags, ownership, retention policy." /> : null}

      {matchedModel ? (
        <UploadVersionModal
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          modelId={matchedModel.id}
          modelName={matchedModel.name}
          currentVersion={matchedModel.version}
          primaryMetricName={matchedModel.primary_metric_name}
          primaryMetricValue={matchedModel.primary_metric_value}
          defaultMode={matchedModel.framework === "ultralytics" ? "yolo" : "general"}
          onUploaded={() => {
            setUploadOpen(false);
            void queryClient.invalidateQueries({ queryKey: ["registry-model-versions", modelName] });
            void queryClient.invalidateQueries({ queryKey: ["models"] });
          }}
        />
      ) : null}
    </div>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={active ? "rounded-md bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-600" : "rounded-md px-3 py-1.5 text-sm text-text-secondary"}>
      {label}
    </button>
  );
}

function Placeholder({ text }: { text: string }) {
  return <div className="rounded-md border border-border bg-bg-surface p-4 text-sm text-text-secondary">{text}</div>;
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

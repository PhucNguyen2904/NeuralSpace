"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { StageBadge } from "@/components/shared";
import { VersionTimeline } from "@/components/models/registry/VersionTimeline";
import { useModelVersions } from "@/lib/hooks/useModelRegistry";

type Tab = "versions" | "experiments" | "settings";

export default function ModelRegistryDetailPage() {
  const params = useParams<{ name: string }>();
  const router = useRouter();
  const modelName = params?.name ?? "";
  const [tab, setTab] = useState<Tab>("versions");
  const versions = useModelVersions(modelName);
  const latest = versions.data?.[0];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">{modelName}</h1>
        <p className="text-sm text-text-secondary">Framework: PyTorch | Task: Image Classification</p>
        {latest ? (
          <div className="mt-2 flex items-center gap-2 text-sm">
            <span>Latest: {latest.version}</span>
            <StageBadge stage={latest.stage} />
          </div>
        ) : null}
      </header>

      <div className="flex gap-2 border-b border-border pb-2">
        <TabButton label="Versions" active={tab === "versions"} onClick={() => setTab("versions")} />
        <TabButton label="Experiments" active={tab === "experiments"} onClick={() => setTab("experiments")} />
        <TabButton label="Settings" active={tab === "settings"} onClick={() => setTab("settings")} />
      </div>

      {tab === "versions" ? (
        <VersionTimeline
          versions={versions.data ?? []}
          onViewVersion={(version) => router.push(`/models/${modelName}/versions/${version.replace(/^v/, "")}`)}
          onRollback={() => {}}
        />
      ) : null}
      {tab === "experiments" ? <Placeholder text="Experiments list liên kết MLflow runs cho model này." /> : null}
      {tab === "settings" ? <Placeholder text="Registry settings: tags, ownership, retention policy." /> : null}
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

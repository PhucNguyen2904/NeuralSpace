"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ModelSidebar } from "@/components/experiments/ModelSidebar";
import { VersionsTable } from "@/components/experiments/VersionsTable";
import { useModels, defaultModelFilters } from "@/lib/hooks/useModels";
import { useModelVersions } from "@/lib/hooks/useModelRegistry";

export default function ExperimentsPage() {
  const router = useRouter();
  
  // Load models for the sidebar
  const modelsData = useModels(defaultModelFilters);
  const models = modelsData.data?.items ?? [];
  const firstModelId = models[0]?.id ?? "";
  
  const [activeModelId, setActiveModelId] = useState<string>("");
  const resolvedModelId = activeModelId || firstModelId;
  const activeModel = models.find((m) => m.id === resolvedModelId);

  // Load versions for the right dashboard
  const versionsData = useModelVersions(activeModel?.name ?? "");
  const versions = versionsData.data ?? [];

  const [selectedVersionIds, setSelectedVersionIds] = useState<string[]>([]);

  const toggleSelected = (versionId: string) => {
    setSelectedVersionIds((prev) => (prev.includes(versionId) ? prev.filter((id) => id !== versionId) : [...prev, versionId]));
  };

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <ModelSidebar
        models={models}
        activeModelId={resolvedModelId}
        onSelect={(id) => {
          setActiveModelId(id);
          setSelectedVersionIds([]);
        }}
      />

      <main className="min-w-0 flex-1 space-y-3">
        <h1 className="text-xl font-semibold">Model: {activeModel?.name ?? "N/A"}</h1>
        <VersionsTable
          versions={versions}
          selectedVersionIds={selectedVersionIds}
          onToggleSelect={toggleSelected}
          onOpenVersion={(versionId) => {
            if (activeModel) {
              const versionNumber = versions.find(v => v.id === versionId)?.version.replace(/^v/, "");
              if (versionNumber) {
                router.push(`/models/${encodeURIComponent(activeModel.name)}/versions/${versionNumber}`);
              }
            }
          }}
          onCompare={() => {
            // Placeholder for compare functionality
            console.log("Compare", selectedVersionIds);
          }}
        />
      </main>
    </div>
  );
}

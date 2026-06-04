"use client";

import { useMemo, useState } from "react";
import { CompareRunsView } from "@/components/experiments/CompareRunsView";
import { ExperimentSidebar } from "@/components/experiments/ExperimentSidebar";
import { RunDetailDrawer } from "@/components/experiments/RunDetailDrawer";
import { RunsTable } from "@/components/experiments/RunsTable";
import { useCompareRuns, useExperimentList, useRunDetail, useRunList, type RunFilters } from "@/lib/hooks/useExperiments";

export default function ExperimentsPage() {
  const experiments = useExperimentList();
  const firstExperimentId = experiments.data?.[0]?.experiment_id ?? "";
  const [activeExperimentId, setActiveExperimentId] = useState(firstExperimentId);
  const [filters, setFilters] = useState<RunFilters>({ status: "ALL", sortBy: "started", sortOrder: "desc" });
  const [selectedRunIds, setSelectedRunIds] = useState<string[]>([]);
  const [openedRunId, setOpenedRunId] = useState<string>("");
  const [compareMode, setCompareMode] = useState(false);

  const resolvedExperimentId = activeExperimentId || firstExperimentId;
  const runs = useRunList(resolvedExperimentId, filters);
  const openedRun = useRunDetail(openedRunId);
  const compare = useCompareRuns(selectedRunIds);

  const activeExperimentName = useMemo(
    () => experiments.data?.find((item) => item.experiment_id === resolvedExperimentId)?.name ?? "Experiment",
    [experiments.data, resolvedExperimentId]
  );

  const toggleSelected = (runId: string) => {
    setSelectedRunIds((prev) => (prev.includes(runId) ? prev.filter((id) => id !== runId) : [...prev, runId]));
  };

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <ExperimentSidebar
        experiments={experiments.data ?? []}
        activeExperimentId={resolvedExperimentId}
        onSelect={(id) => {
          setActiveExperimentId(id);
          setSelectedRunIds([]);
          setCompareMode(false);
        }}
      />

      <main className="min-w-0 flex-1 space-y-3">
        <h1 className="text-xl font-semibold">Experiment: {activeExperimentName}</h1>
        {compareMode ? (
          <CompareRunsView runs={compare.data ?? []} onBack={() => setCompareMode(false)} />
        ) : (
          <RunsTable
            runs={runs.data ?? []}
            filters={filters}
            onFiltersChange={(patch) => setFilters((prev) => ({ ...prev, ...patch }))}
            selectedRunIds={selectedRunIds}
            onToggleSelect={toggleSelected}
            onOpenRun={setOpenedRunId}
            onCompare={() => setCompareMode(true)}
          />
        )}
      </main>

      <RunDetailDrawer run={openedRun.data ?? null} open={Boolean(openedRunId)} onClose={() => setOpenedRunId("")} />
    </div>
  );
}

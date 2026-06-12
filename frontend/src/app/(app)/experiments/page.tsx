"use client";

import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { CompareRunsView } from "@/components/experiments/CompareRunsView";
import { ExperimentSidebar } from "@/components/experiments/ExperimentSidebar";
import { RunDetailDrawer } from "@/components/experiments/RunDetailDrawer";
import { RunsTable } from "@/components/experiments/RunsTable";
import { Button, Modal } from "@/components/ui";
import { useDeleteRun, useExperimentList, useRunDetail, useRunList, type RunDetailData, type RunFilters } from "@/lib/hooks/useExperiments";

export default function ExperimentsPage() {
  const experimentsQuery = useExperimentList();
  const experiments = experimentsQuery.data ?? [];
  const firstExperimentId = experiments[0]?.experiment_id ?? "";
  const [activeExperimentId, setActiveExperimentId] = useState("");
  const resolvedExperimentId = activeExperimentId || firstExperimentId;
  const activeExperiment = experiments.find((experiment) => experiment.experiment_id === resolvedExperimentId);
  const [filters, setFilters] = useState<RunFilters>({ status: "ALL", sortBy: "started", sortOrder: "desc" });
  const [selectedRunIds, setSelectedRunIds] = useState<string[]>([]);
  const [openRunId, setOpenRunId] = useState<string>("");
  const [compareMode, setCompareMode] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RunDetailData | null>(null);
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);

  const runsQuery = useRunList(resolvedExperimentId, filters);
  const deleteRunMutation = useDeleteRun();
  const runs = runsQuery.data ?? [];
  const runDetail = useRunDetail(openRunId);
  const compareRuns = useMemo(
    () => runs.filter((run) => selectedRunIds.includes(run.run_id)),
    [runs, selectedRunIds]
  );

  const patchFilters = (patch: Partial<RunFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
  };

  const toggleRun = (runId: string) => {
    setSelectedRunIds((current) =>
      current.includes(runId)
        ? current.filter((id) => id !== runId)
        : [...current, runId].slice(0, 4)
    );
  };

  const closeDeleteModal = () => {
    if (deleteRunMutation.isPending) return;
    setDeleteTarget(null);
    setDeleteConfirmed(false);
  };

  const confirmDeleteRun = () => {
    if (!deleteTarget) return;
    deleteRunMutation.mutate(deleteTarget.run_id, {
      onSuccess: () => {
        setSelectedRunIds((current) => current.filter((id) => id !== deleteTarget.run_id));
        if (openRunId === deleteTarget.run_id) setOpenRunId("");
        setDeleteTarget(null);
        setDeleteConfirmed(false);
      }
    });
  };

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <ExperimentSidebar
        experiments={experiments}
        activeExperimentId={resolvedExperimentId}
        onSelect={(id) => {
          setActiveExperimentId(id);
          setSelectedRunIds([]);
          setCompareMode(false);
        }}
      />

      <main className="min-w-0 flex-1 space-y-3">
        <header className="rounded-lg border border-border bg-bg-surface p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold">{activeExperiment?.name ?? "Experiments"}</h1>
              <p className="mt-1 text-sm text-text-secondary">
                Track runs, metrics, params, artifacts, dataset versions, and output model versions.
              </p>
            </div>
            <span className="rounded-full bg-brand-50 px-2 py-1 text-xs text-brand-600">
              {activeExperiment?.run_count ?? runs.length} runs
            </span>
          </div>
        </header>

        {compareMode ? (
          <CompareRunsView runs={compareRuns} onBack={() => setCompareMode(false)} />
        ) : (
          <RunsTable
            runs={runs}
            filters={filters}
            onFiltersChange={patchFilters}
            selectedRunIds={selectedRunIds}
            onToggleSelect={toggleRun}
            onOpenRun={setOpenRunId}
            onDeleteRun={(run) => {
              setDeleteTarget(run);
              setDeleteConfirmed(false);
            }}
            onCompare={() => setCompareMode(true)}
          />
        )}

        {!runsQuery.isLoading && resolvedExperimentId && runs.length === 0 ? (
          <section className="rounded-lg border border-dashed border-border bg-bg-surface p-6 text-center text-sm text-text-secondary">
            No runs found for this experiment.
          </section>
        ) : null}

        {!experimentsQuery.isLoading && experiments.length === 0 ? (
          <section className="rounded-lg border border-dashed border-border bg-bg-surface p-6 text-center text-sm text-text-secondary">
            No experiments found. Runs created from Colab will appear here.
          </section>
        ) : null}
      </main>

      <RunDetailDrawer
        run={runDetail.data ?? null}
        open={Boolean(openRunId)}
        onClose={() => setOpenRunId("")}
      />

      <Modal
        open={Boolean(deleteTarget)}
        onClose={closeDeleteModal}
        size="sm"
        title={<span className="flex items-center gap-2"><AlertTriangle className="text-error-500" size={18} /> Delete run?</span>}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={closeDeleteModal} disabled={deleteRunMutation.isPending}>Cancel</Button>
            <Button
              variant="danger"
              onClick={confirmDeleteRun}
              disabled={!deleteConfirmed}
              loading={deleteRunMutation.isPending}
            >
              Delete permanently
            </Button>
          </div>
        }
      >
        <p className="text-sm text-text-secondary">
          This will delete {deleteTarget?.name ?? "this run"} and linked model versions from experiment tracking. This action cannot be undone.
        </p>
        <label className="mt-4 inline-flex items-center gap-2 text-sm text-text-secondary">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-border"
            checked={deleteConfirmed}
            onChange={(event) => setDeleteConfirmed(event.target.checked)}
          />
          I understand and want to delete this run
        </label>
      </Modal>
    </div>
  );
}

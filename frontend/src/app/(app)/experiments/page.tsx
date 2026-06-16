"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { CompareRunsView } from "@/components/experiments/CompareRunsView";
import { ExperimentSidebar } from "@/components/experiments/ExperimentSidebar";
import { RunDetailDrawer } from "@/components/experiments/RunDetailDrawer";
import { RunsTable } from "@/components/experiments/RunsTable";
import { Button, Modal } from "@/components/ui";
import { useDeleteExperiment, useDeleteRun, useExperimentList, useRunDetail, useRunList, type RunDetailData, type RunFilters } from "@/lib/hooks/useExperiments";

function ExperimentSidebarSkeleton() {
  return (
    <aside className="w-full space-y-1.5 rounded-lg border border-border bg-bg-surface p-4 md:w-56">
      <div className="skeleton-shimmer mb-3 h-4 w-24 rounded" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="skeleton-shimmer h-9 rounded-md" />
      ))}
    </aside>
  );
}

function RunsTableSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-bg-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="skeleton-shimmer h-9 w-56 rounded-md" />
        <div className="skeleton-shimmer h-9 w-24 rounded-md" />
      </div>
      <div className="p-4 space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="grid grid-cols-[24px_2fr_1fr_1fr_1fr_1fr] gap-3 items-center rounded-md border border-border p-3">
            <div className="skeleton-shimmer h-4 w-4 rounded" />
            <div className="skeleton-shimmer h-4 rounded" />
            <div className="skeleton-shimmer h-5 w-16 rounded-full" />
            <div className="skeleton-shimmer h-4 rounded" />
            <div className="skeleton-shimmer h-4 rounded" />
            <div className="skeleton-shimmer h-4 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

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
  const [deleteExperimentOpen, setDeleteExperimentOpen] = useState(false);
  const [deleteExperimentConfirmed, setDeleteExperimentConfirmed] = useState(false);

  const runsQuery = useRunList(resolvedExperimentId, filters);
  const deleteRunMutation = useDeleteRun();
  const deleteExperimentMutation = useDeleteExperiment();
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

  const closeDeleteExperimentModal = () => {
    if (deleteExperimentMutation.isPending) return;
    setDeleteExperimentOpen(false);
    setDeleteExperimentConfirmed(false);
  };

  const confirmDeleteExperiment = () => {
    if (!activeExperiment) return;
    deleteExperimentMutation.mutate(activeExperiment.experiment_id, {
      onSuccess: () => {
        setSelectedRunIds([]);
        setOpenRunId("");
        setCompareMode(false);
        setActiveExperimentId("");
        setDeleteExperimentOpen(false);
        setDeleteExperimentConfirmed(false);
      }
    });
  };

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      {experimentsQuery.isLoading ? (
        <ExperimentSidebarSkeleton />
      ) : (
        <ExperimentSidebar
          experiments={experiments}
          activeExperimentId={resolvedExperimentId}
          onSelect={(id) => {
            setActiveExperimentId(id);
            setSelectedRunIds([]);
            setCompareMode(false);
          }}
        />
      )}

      <main className="min-w-0 flex-1 space-y-3">
        <header className="rounded-lg border border-border bg-bg-surface p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold">{activeExperiment?.name ?? "Experiments"}</h1>
              <p className="mt-1 text-sm text-text-secondary">
                Track runs, metrics, params, artifacts, dataset versions, and output model versions.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-brand-50 px-2 py-1 text-xs text-brand-600">
                {activeExperiment?.run_count ?? runs.length} runs
              </span>
              {activeExperiment ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-error-600 hover:text-error-700"
                  onClick={() => {
                    setDeleteExperimentOpen(true);
                    setDeleteExperimentConfirmed(false);
                  }}
                >
                  <Trash2 size={14} />
                </Button>
              ) : null}
            </div>
          </div>
        </header>

        {compareMode ? (
          <CompareRunsView runs={compareRuns} onBack={() => setCompareMode(false)} />
        ) : runsQuery.isLoading ? (
          <RunsTableSkeleton />
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

      <Modal
        open={deleteExperimentOpen}
        onClose={closeDeleteExperimentModal}
        size="sm"
        title={<span className="flex items-center gap-2"><AlertTriangle className="text-error-500" size={18} /> Delete experiment?</span>}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={closeDeleteExperimentModal} disabled={deleteExperimentMutation.isPending}>Cancel</Button>
            <Button
              variant="danger"
              onClick={confirmDeleteExperiment}
              disabled={!deleteExperimentConfirmed}
              loading={deleteExperimentMutation.isPending}
            >
              Delete permanently
            </Button>
          </div>
        }
      >
        <p className="text-sm text-text-secondary">
          This will delete {activeExperiment?.name ?? "this experiment"}, its runs, linked model versions, and stored artifacts. This action cannot be undone.
        </p>
        <label className="mt-4 inline-flex items-center gap-2 text-sm text-text-secondary">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-border"
            checked={deleteExperimentConfirmed}
            onChange={(event) => setDeleteExperimentConfirmed(event.target.checked)}
          />
          I understand and want to delete this experiment
        </label>
      </Modal>
    </div>
  );
}

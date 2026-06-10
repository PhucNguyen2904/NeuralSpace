"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  Archive,
  CheckCircle2,
  ChevronLeft,
  Circle,
  ClipboardCopy,
  Clock3,
  Database,
  ExternalLink,
  KeyRound,
  NotebookTabs,
  Package,
  Plus,
  RefreshCw,
  Search,
  Terminal,
  WifiOff,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button, Modal } from "@/components/ui";
import { defaultDatasetFilters, useDatasets } from "@/lib/hooks/useDatasets";
import { defaultModelFilters, useModels } from "@/lib/hooks/useModels";
import { useLaunchWorkspaceInColab, useUpdateWorkspaceAssets, useWorkspaceDetail, useWorkspaceRunData } from "@/lib/hooks/useWorkspace";
import { cn } from "@/lib/utils/cn";
import type { Dataset } from "@/types/dataset";
import type { Model } from "@/types/model";
import type { ColabArtifact, ColabLaunchResult, ColabMetric, ColabRunStatus, ColabSessionStatus } from "@/types/workspace";

function sessionColor(status: ColabSessionStatus | undefined) {
  if (!status) return "text-text-tertiary";
  return {
    CREATED: "text-warning-500",
    CONNECTED: "text-success-500",
    DISCONNECTED: "text-error-500",
    EXPIRED: "text-text-tertiary",
    REVOKED: "text-error-500",
  }[status] ?? "text-text-tertiary";
}

function sessionLabel(status: ColabSessionStatus | undefined) {
  if (!status) return "No session";
  return {
    CREATED: "Created",
    CONNECTED: "Connected",
    DISCONNECTED: "Disconnected",
    EXPIRED: "Expired",
    REVOKED: "Revoked",
  }[status] ?? status;
}

function runLabel(status: ColabRunStatus | null | undefined) {
  if (!status) return "No run";
  return {
    CREATED: "Created",
    RUNNING: "Running",
    FINISHED: "Finished",
    FAILED: "Failed",
    STALE: "Stale",
    CANCEL_REQUESTED: "Cancelling…",
  }[status] ?? status;
}

function runColor(status: ColabRunStatus | null | undefined) {
  if (!status) return "text-text-tertiary";
  return {
    CREATED: "text-text-secondary",
    RUNNING: "text-warning-500",
    FINISHED: "text-success-500",
    FAILED: "text-error-500",
    STALE: "text-text-tertiary",
    CANCEL_REQUESTED: "text-warning-500",
  }[status] ?? "text-text-tertiary";
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <button
      onClick={handleCopy}
      className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-bg-surface px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:border-brand-500 hover:text-brand-600"
    >
      {copied ? <CheckCircle2 size={14} className="text-success-500" /> : <ClipboardCopy size={14} />}
      {copied ? "Copied!" : label}
    </button>
  );
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-text-tertiary">
      {icon}
      {title}
    </div>
  );
}

function AssetChip({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="rounded-lg border border-border bg-bg-elevated px-3 py-2">
      <p className="truncate text-xs font-semibold text-text-primary">{label}</p>
      <p className="mt-0.5 truncate font-mono text-[10px] text-text-tertiary">{detail}</p>
    </div>
  );
}

function AssetPickerList({
  title,
  icon,
  options,
  selected,
  loading,
  getMeta,
  onToggle,
}: {
  title: string;
  icon: React.ReactNode;
  options: Array<Dataset | Model>;
  selected: string[];
  loading: boolean;
  getMeta: (item: Dataset | Model) => string;
  onToggle: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = options.filter((item) =>
    `${item.name} ${item.id} ${getMeta(item)}`.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <section className="rounded-lg border border-border bg-bg-base p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-brand-50 text-brand-600">{icon}</span>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
            <p className="text-[11px] text-text-tertiary">{selected.length}/{options.length} selected</p>
          </div>
        </div>
      </div>
      <div className="relative mb-3">
        <Search className="absolute left-3 top-2.5 text-text-tertiary" size={14} />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={`Search ${title.toLowerCase()}...`}
          className="h-9 w-full rounded-md border border-border bg-bg-surface pl-9 pr-3 text-sm text-text-primary outline-none focus:border-brand-500"
        />
      </div>
      <div className="max-h-64 space-y-2 overflow-y-auto scrollbar-thin">
        {loading ? <p className="py-6 text-center text-xs text-text-tertiary">Loading assets...</p> : null}
        {!loading && filtered.length === 0 ? <p className="py-6 text-center text-xs text-text-tertiary">No matching assets.</p> : null}
        {filtered.map((item) => {
          const checked = selected.includes(item.id);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onToggle(item.id)}
              className={cn(
                "flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-left transition",
                checked ? "border-brand-500 bg-brand-50" : "border-border bg-bg-surface hover:bg-bg-elevated",
              )}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-text-primary">{item.name}</span>
                <span className="block truncate text-xs text-text-tertiary">{getMeta(item)}</span>
              </span>
              <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-sm border", checked ? "border-brand-500 bg-brand-500 text-white" : "border-border")}>
                {checked ? <CheckCircle2 size={13} /> : null}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function WorkspaceAssetsPanel({
  workspaceId,
  datasetIds,
  modelIds,
}: {
  workspaceId: string;
  datasetIds: string[];
  modelIds: string[];
}) {
  const datasetsQuery = useDatasets(defaultDatasetFilters);
  const modelsQuery = useModels(defaultModelFilters);
  const updateAssets = useUpdateWorkspaceAssets();
  const [open, setOpen] = useState(false);
  const [selectedDatasets, setSelectedDatasets] = useState(datasetIds);
  const [selectedModels, setSelectedModels] = useState(modelIds);
  const datasets = datasetsQuery.data?.items ?? [];
  const models = modelsQuery.data?.items ?? [];
  const datasetMap = new Map(datasets.map((dataset) => [dataset.id, dataset]));
  const modelMap = new Map(models.map((model) => [model.id, model]));

  useEffect(() => {
    if (!open) {
      setSelectedDatasets(datasetIds);
      setSelectedModels(modelIds);
    }
  }, [datasetIds, modelIds, open]);

  const toggleId = (kind: "dataset" | "model", id: string) => {
    const setter = kind === "dataset" ? setSelectedDatasets : setSelectedModels;
    setter((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id].slice(0, 10));
  };

  const save = async () => {
    await updateAssets.mutateAsync({ id: workspaceId, datasets: selectedDatasets, models: selectedModels });
    setOpen(false);
  };

  return (
    <section className="rounded-xl border border-border bg-bg-surface p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <SectionTitle icon={<Package size={13} />} title="Workspace assets" />
          <p className="mt-2 text-xs text-text-tertiary">Changes apply to newly generated Colab sessions. Running notebooks can call refresh assets.</p>
        </div>
        <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)} iconLeft={<Plus size={14} />}>
          Add assets
        </Button>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-text-secondary">
            <Database size={13} className="text-brand-600" /> Datasets
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {datasetIds.length === 0 ? <p className="rounded-lg border border-dashed border-border px-3 py-4 text-xs text-text-tertiary">No datasets attached.</p> : null}
            {datasetIds.map((id) => {
              const dataset = datasetMap.get(id);
              return <AssetChip key={id} label={dataset?.name ?? id} detail={dataset ? `${dataset.type} · ${dataset.item_count.toLocaleString()} items` : id} />;
            })}
          </div>
        </div>
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-text-secondary">
            <Package size={13} className="text-brand-600" /> Models
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {modelIds.length === 0 ? <p className="rounded-lg border border-dashed border-border px-3 py-4 text-xs text-text-tertiary">No models attached.</p> : null}
            {modelIds.map((id) => {
              const model = modelMap.get(id);
              return <AssetChip key={id} label={model?.name ?? id} detail={model ? `${model.framework} · ${model.version}` : id} />;
            })}
          </div>
        </div>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="lg"
        title="Manage workspace assets"
        showCloseButton
        footer={
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-text-tertiary">{selectedDatasets.length} datasets · {selectedModels.length} models selected</p>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="button" onClick={save} loading={updateAssets.isPending}>Save assets</Button>
            </div>
          </div>
        }
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <AssetPickerList
            title="Datasets"
            icon={<Database size={16} />}
            options={datasets}
            selected={selectedDatasets}
            loading={datasetsQuery.isLoading}
            getMeta={(item) => {
              const dataset = item as Dataset;
              return `${dataset.type} · ${dataset.item_count.toLocaleString()} items`;
            }}
            onToggle={(id) => toggleId("dataset", id)}
          />
          <AssetPickerList
            title="Models"
            icon={<Package size={16} />}
            options={models}
            selected={selectedModels}
            loading={modelsQuery.isLoading}
            getMeta={(item) => {
              const model = item as Model;
              return `${model.framework} · ${model.version}`;
            }}
            onToggle={(id) => toggleId("model", id)}
          />
        </div>
        {updateAssets.error ? <p className="mt-3 rounded-md bg-error-50 px-3 py-2 text-xs text-error-500">{updateAssets.error.message}</p> : null}
      </Modal>
    </section>
  );
}

function ConnectionStep({
  number,
  title,
  description,
  complete,
}: {
  number: number;
  title: string;
  description: string;
  complete?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
          complete ? "bg-success-500 text-white" : "border border-brand-200 bg-bg-surface text-brand-600"
        }`}
      >
        {complete ? <CheckCircle2 size={15} /> : number}
      </div>
      <div>
        <p className="text-sm font-medium text-text-primary">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-text-tertiary">{description}</p>
      </div>
    </div>
  );
}

function StatusCard({
  label,
  value,
  valueClassName,
  detail,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  detail?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-bg-surface p-4 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">{label}</p>
      <p className={`mt-1 text-sm font-semibold ${valueClassName ?? "text-text-primary"}`}>{value}</p>
      <p className="mt-1 truncate text-[10px] text-text-tertiary">{detail ?? "Waiting for data"}</p>
    </div>
  );
}

function MetricsTable({ metrics }: { metrics: ColabMetric[] }) {
  if (metrics.length === 0) {
    return <p className="text-xs italic text-text-tertiary">No metrics reported yet.</p>;
  }

  const latest = Object.values(
    metrics.reduce<Record<string, ColabMetric>>((accumulator, metric) => {
      if (!accumulator[metric.key] || metric.step > accumulator[metric.key].step) accumulator[metric.key] = metric;
      return accumulator;
    }, {})
  );

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {latest.map((metric) => (
        <div key={metric.key} className="rounded-lg border border-border bg-bg-base px-3 py-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">{metric.key}</span>
          <p className="mt-1 font-mono text-lg font-semibold text-brand-600">
            {metric.value.toFixed?.(4) ?? metric.value}
          </p>
        </div>
      ))}
    </div>
  );
}

function ArtifactsList({ artifacts }: { artifacts: ColabArtifact[] }) {
  if (artifacts.length === 0) {
    return <p className="text-xs italic text-text-tertiary">No artifacts uploaded yet.</p>;
  }

  return (
    <div className="space-y-1.5">
      {artifacts.map((artifact) => (
        <div key={artifact.name} className="flex items-center justify-between rounded-lg bg-bg-elevated px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <Package size={13} className="shrink-0 text-brand-600" />
            <span className="truncate text-xs text-text-primary">{artifact.name}</span>
          </div>
          <span
            className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
              artifact.status === "CONFIRMED" ? "bg-success-50 text-success-500" : "bg-warning-50 text-warning-500"
            }`}
          >
            {artifact.status === "CONFIRMED" ? "Confirmed" : "Pending"}
          </span>
        </div>
      ))}
    </div>
  );
}

function LogsList({ logs }: { logs: { level: string; message: string; timestamp: string }[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [logs.length]);

  if (logs.length === 0) {
    return <p className="text-xs italic text-text-tertiary">No logs received yet.</p>;
  }

  return (
    <div ref={ref} className="max-h-56 space-y-1 overflow-y-auto rounded-lg bg-bg-sunken p-3 scrollbar-thin">
      {logs.map((log, index) => (
        <div key={`${log.timestamp}-${index}`} className="flex gap-2 font-mono text-[11px] leading-relaxed">
          <span
            className={`shrink-0 font-semibold ${
              log.level === "ERROR"
                ? "text-error-500"
                : log.level === "WARN"
                  ? "text-warning-500"
                  : "text-text-tertiary"
            }`}
          >
            {log.level.padEnd(5)}
          </span>
          <span className="text-text-secondary">{log.message}</span>
        </div>
      ))}
    </div>
  );
}

export default function WorkspaceDetailPage({ params }: { params: { id: string } }): JSX.Element {
  const { data: workspace, isLoading } = useWorkspaceDetail(params.id);
  const launch = useLaunchWorkspaceInColab();
  const runData = useWorkspaceRunData(params.id);
  const [launchResult, setLaunchResult] = useState<ColabLaunchResult | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  useEffect(() => {
    if (!launchResult || secondsRemaining <= 0) return;
    const timer = window.setInterval(() => {
      setSecondsRemaining((remaining) => Math.max(0, remaining - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [launchResult, secondsRemaining]);

  const generateClaim = () => {
    setLaunchError(null);
    launch.mutate(params.id, {
      onSuccess: (result) => {
        setLaunchResult(result);
        setSecondsRemaining(result.expires_in);
      },
      onError: (error) => setLaunchError(error.message),
    });
  };

  if (isLoading || !workspace) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-text-secondary">
        <RefreshCw size={16} className="mr-2 animate-spin" /> Loading project…
      </div>
    );
  }

  const runtimeData = runData.data;
  const claimIsActive = Boolean(launchResult && secondsRemaining > 0);
  const sessionIsConnected = runtimeData?.session_status === "CONNECTED";
  const lastReported = runtimeData?.run_last_reported ?? runtimeData?.session_last_seen;

  return (
    <div className="flex min-h-0 flex-col space-y-5 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/workspaces"
            className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary"
          >
            <ChevronLeft size={15} /> Quay lại Projects
          </Link>
          <h1 className="mt-2 text-xl font-semibold text-text-primary">{workspace.name}</h1>
          <p className="text-xs text-text-tertiary">{workspace.id} · Google Colab external runtime</p>
        </div>
        <div
          className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${
            sessionIsConnected
              ? "border-success-500/30 bg-success-50 text-success-500"
              : "border-border bg-bg-surface text-text-tertiary"
          }`}
        >
          <Circle size={8} fill="currentColor" />
          {sessionIsConnected ? "Runtime connected" : "Runtime offline"}
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 via-bg-surface to-bg-surface shadow-sm">
        <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.85fr)] lg:p-6">
          <div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
              <NotebookTabs size={20} />
            </div>
            <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-brand-600">Connect Google Colab</p>
            <h2 className="mt-1 text-xl font-semibold text-text-primary">Your notebook is ready to run</h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-text-secondary">
              No setup snippets needed. Generate a secure one-time code, open the prepared notebook, then paste the code
              when prompted.
            </p>

            <div className="mt-6 grid gap-4 md:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              <ConnectionStep
                number={1}
                title="Generate code"
                description="Create a short-lived claim for this project."
                complete={claimIsActive || sessionIsConnected}
              />
              <ConnectionStep
                number={2}
                title="Open notebook"
                description="Launch the preconfigured NeuralSpace notebook."
                complete={sessionIsConnected}
              />
              <ConnectionStep
                number={3}
                title="Run and monitor"
                description="Metrics and logs appear below automatically."
                complete={sessionIsConnected}
              />
            </div>
          </div>

          <div className="flex flex-col justify-center rounded-xl border border-border bg-bg-surface/90 p-4 shadow-sm backdrop-blur">
            {launch.isPending && (
              <div className="flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-600">
                <RefreshCw size={13} className="animate-spin" />
                Generating secure claim code…
              </div>
            )}
            {launchError && (
              <div className="flex items-start gap-2 rounded-lg bg-error-50 px-3 py-2 text-xs text-error-500">
                <AlertCircle size={13} className="mt-0.5 shrink-0" />
                Could not create session: {launchError}
              </div>
            )}

            {claimIsActive && launchResult ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">
                    One-time claim code
                  </p>
                  <span className="flex items-center gap-1 rounded-full bg-success-50 px-2 py-1 text-[10px] font-medium text-success-500">
                    <Clock3 size={11} /> {secondsRemaining}s
                  </span>
                </div>
                <p className="mt-4 break-all font-mono text-2xl font-semibold tracking-wider text-brand-600">
                  {launchResult.claim_code}
                </p>
                <p className="mt-2 text-xs text-text-tertiary">Paste this code when the Colab notebook asks for it.</p>
                <div className="mt-5 grid grid-cols-2 gap-2">
                  <CopyButton text={launchResult.claim_code} label="Copy code" />
                  <Button
                    onClick={() => window.open(launchResult.notebook_url, "_blank", "noopener,noreferrer")}
                    iconRight={<ExternalLink size={14} />}
                  >
                    Open Colab
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <KeyRound size={19} />
                </div>
                <h3 className="mt-4 text-sm font-semibold text-text-primary">
                  {launchResult ? "Claim code expired" : "Start a secure Colab session"}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-text-tertiary">
                  {launchResult
                    ? "Generate a new code to reconnect. Expired codes cannot be reused."
                    : "The claim code is single-use and expires automatically."}
                </p>
                <Button onClick={generateClaim} disabled={launch.isPending} className="mt-5 w-full">
                  {launchResult ? "Generate new claim code" : "Generate claim code"}
                </Button>
              </>
            )}
          </div>
        </div>
      </section>

      <WorkspaceAssetsPanel
        workspaceId={workspace.id}
        datasetIds={workspace.datasets ?? []}
        modelIds={workspace.models ?? []}
      />

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-text-primary">Runtime activity</h2>
          <p className="text-xs text-text-tertiary">Live metrics, logs, and artifacts reported by your notebook.</p>
        </div>
        {runData.isFetching && (
          <span className="flex items-center gap-1 text-[10px] text-text-tertiary">
            <RefreshCw size={10} className="animate-spin" /> Refreshing
          </span>
        )}
      </div>

      {!runtimeData && (
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-bg-surface px-4 py-4 text-xs text-text-tertiary">
          <WifiOff size={16} className="shrink-0" />
          {runData.isLoading
            ? "Loading runtime activity…"
            : "No runtime connected yet. Generate a claim code and run the prepared notebook in Colab."}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatusCard
          label="Session"
          value={sessionLabel(runtimeData?.session_status)}
          valueClassName={sessionColor(runtimeData?.session_status)}
          detail={
            runtimeData?.session_last_seen
              ? `Last seen ${formatDistanceToNow(new Date(runtimeData.session_last_seen), { addSuffix: true })}`
              : undefined
          }
        />
        <StatusCard
          label="Latest run"
          value={runLabel(runtimeData?.run_status)}
          valueClassName={runColor(runtimeData?.run_status)}
          detail={runtimeData?.run_id ? `Run ${runtimeData.run_id.slice(0, 8)}` : undefined}
        />
        <StatusCard
          label="Last report"
          value={lastReported ? formatDistanceToNow(new Date(lastReported), { addSuffix: true }) : "No reports"}
          detail={lastReported ? new Date(lastReported).toLocaleString() : undefined}
        />
        <StatusCard
          label="Run ID"
          value={runtimeData?.run_id ? runtimeData.run_id.slice(0, 8) : "Not available"}
          detail={runtimeData?.run_id ?? undefined}
        />
      </div>

      {runtimeData?.model_version && (
        <div className="flex items-center gap-2 rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 text-xs text-brand-600">
          <Package size={14} />
          Model registered: <span className="font-semibold">{runtimeData.model_version}</span>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="rounded-xl border border-border bg-bg-surface p-4 shadow-sm">
          <SectionTitle icon={<Activity size={13} />} title="Latest metrics" />
          <div className="mt-4">
            <MetricsTable metrics={runtimeData?.metrics ?? []} />
          </div>
        </section>

        <section className="rounded-xl border border-border bg-bg-surface p-4 shadow-sm">
          <SectionTitle icon={<Terminal size={13} />} title="Runtime logs" />
          <div className="mt-4">
            <LogsList logs={runtimeData?.logs ?? []} />
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-border bg-bg-surface p-4 shadow-sm">
        <SectionTitle icon={<Archive size={13} />} title="Artifacts" />
        <div className="mt-4">
          <ArtifactsList artifacts={runtimeData?.artifacts ?? []} />
        </div>
      </section>
    </div>
  );
}

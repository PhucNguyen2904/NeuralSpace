"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  Archive,
  ChevronLeft,
  CheckCircle2,
  Circle,
  ClipboardCopy,
  ExternalLink,
  Package,
  RefreshCw,
  Terminal,
  WifiOff,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui";
import { useWorkspaceDetail, useLaunchWorkspaceInColab, useWorkspaceRunData } from "@/lib/hooks/useWorkspace";
import type { ColabArtifact, ColabLaunchResult, ColabMetric, ColabRunStatus, ColabSessionStatus } from "@/types/workspace";

// ─── helpers ─────────────────────────────────────────────────────────────────

function buildBootstrapSnippet(claimCode: string, workspaceName: string) {
  return `# ── NeuralSpace · ${workspaceName} ──────────────────
!pip install neuralspace-client -q

from neuralspace import ColabRuntime

runtime = ColabRuntime.bootstrap(
    claim="${claimCode}"
)
print("✅ Connected to NeuralSpace")`;
}

const REPORT_SNIPPET = `# ── Report metrics ───────────────────────────────────
runtime.log_metrics({"loss": 0.42, "accuracy": 0.91})

# ── Upload artifact ───────────────────────────────────
runtime.upload_artifact("model.pt")

# ── Register model version ────────────────────────────
runtime.register_model("model.pt", name="my-model")

# ── Mark run finished ─────────────────────────────────
runtime.finish()`;

function sessionColor(s: ColabSessionStatus | undefined) {
  if (!s) return "text-text-tertiary";
  return {
    ISSUED: "text-warning-500",
    CONNECTED: "text-success-500",
    DISCONNECTED: "text-error-500",
    EXPIRED: "text-text-tertiary",
    REVOKED: "text-error-500",
  }[s] ?? "text-text-tertiary";
}

function sessionLabel(s: ColabSessionStatus | undefined) {
  if (!s) return "No session";
  return {
    ISSUED: "Issued",
    CONNECTED: "Connected",
    DISCONNECTED: "Disconnected",
    EXPIRED: "Expired",
    REVOKED: "Revoked",
  }[s] ?? s;
}

function runLabel(s: ColabRunStatus | null | undefined) {
  if (!s) return "No run";
  return {
    CREATED: "Created",
    RUNNING: "Running",
    FINISHED: "Finished",
    FAILED: "Failed",
    STALE: "Stale",
    CANCEL_REQUESTED: "Cancelling…",
  }[s] ?? s;
}

function runColor(s: ColabRunStatus | null | undefined) {
  if (!s) return "text-text-tertiary";
  return {
    CREATED: "text-text-secondary",
    RUNNING: "text-warning-500",
    FINISHED: "text-success-500",
    FAILED: "text-error-500",
    STALE: "text-text-tertiary",
    CANCEL_REQUESTED: "text-warning-500",
  }[s] ?? "text-text-tertiary";
}

// ─── sub-components ──────────────────────────────────────────────────────────

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handle = () => {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <button
      id="btn-copy-snippet"
      onClick={handle}
      className="flex items-center gap-1.5 rounded-md border border-border bg-bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary hover:border-brand-500 hover:text-brand-600 transition-colors"
    >
      {copied ? <CheckCircle2 size={13} className="text-success-500" /> : <ClipboardCopy size={13} />}
      {copied ? "Copied!" : label}
    </button>
  );
}

function CodeBlock({ code, id }: { code: string; id: string }) {
  return (
    <div className="relative rounded-lg border border-border bg-bg-sunken font-mono text-xs leading-relaxed overflow-x-auto">
      <pre id={id} className="p-4 whitespace-pre text-text-primary">{code}</pre>
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-text-tertiary">
      {icon}
      {title}
    </div>
  );
}

function MetricsTable({ metrics }: { metrics: ColabMetric[] }) {
  if (metrics.length === 0) {
    return <p className="text-xs text-text-tertiary italic">No metrics reported yet.</p>;
  }
  // Show latest value per key
  const latest = Object.values(
    metrics.reduce<Record<string, ColabMetric>>((acc, m) => {
      if (!acc[m.key] || m.step > acc[m.key].step) acc[m.key] = m;
      return acc;
    }, {})
  );
  return (
    <div className="space-y-1.5">
      {latest.map((m) => (
        <div key={m.key} className="flex items-center justify-between rounded-md bg-bg-elevated px-3 py-2">
          <span className="text-xs font-medium text-text-primary">{m.key}</span>
          <span className="font-mono text-xs text-brand-600">{m.value.toFixed?.(4) ?? m.value}</span>
        </div>
      ))}
    </div>
  );
}

function ArtifactsList({ artifacts }: { artifacts: ColabArtifact[] }) {
  if (artifacts.length === 0) {
    return <p className="text-xs text-text-tertiary italic">No artifacts uploaded yet.</p>;
  }
  return (
    <div className="space-y-1.5">
      {artifacts.map((a) => (
        <div key={a.name} className="flex items-center justify-between rounded-md bg-bg-elevated px-3 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <Package size={13} className="shrink-0 text-brand-600" />
            <span className="truncate text-xs text-text-primary">{a.name}</span>
          </div>
          <span
            className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
              a.status === "CONFIRMED" ? "bg-success-50 text-success-500" : "bg-warning-50 text-warning-500"
            }`}
          >
            {a.status === "CONFIRMED" ? "Confirmed" : "Pending"}
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
    return <p className="text-xs text-text-tertiary italic">No logs received yet.</p>;
  }
  return (
    <div ref={ref} className="max-h-40 overflow-y-auto space-y-1 scrollbar-thin">
      {logs.map((l, i) => (
        <div key={i} className="flex gap-2 font-mono text-[11px] leading-relaxed">
          <span
            className={`shrink-0 font-semibold ${
              l.level === "ERROR" ? "text-error-500" : l.level === "WARN" ? "text-warning-500" : "text-text-tertiary"
            }`}
          >
            {l.level.padEnd(5)}
          </span>
          <span className="text-text-secondary">{l.message}</span>
        </div>
      ))}
    </div>
  );
}

// ─── page ────────────────────────────────────────────────────────────────────

export default function WorkspaceDetailPage({ params }: { params: { id: string } }): JSX.Element {
  const { data: workspace, isLoading } = useWorkspaceDetail(params.id);
  const launch = useLaunchWorkspaceInColab();
  const runData = useWorkspaceRunData(params.id);

  const [launchResult, setLaunchResult] = useState<ColabLaunchResult | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const launchedRef = useRef(false);

  // Auto-create a new claim when the page loads (once per workspace id)
  useEffect(() => {
    if (launchedRef.current) return;
    launchedRef.current = true;
    launch.mutate(params.id, {
      onSuccess: (res) => setLaunchResult(res),
      onError: (err) => setLaunchError(err.message),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);


  if (isLoading || !workspace) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-text-secondary">
        <RefreshCw size={16} className="mr-2 animate-spin" /> Loading project…
      </div>
    );
  }

  const claimCode = launchResult?.claim_code ?? "";
  const bootstrapSnippet = buildBootstrapSnippet(claimCode || "<CLAIM_CODE>", workspace.name);
  const rd = runData.data;

  return (
    <div className="flex min-h-0 flex-col space-y-4 px-4 py-4">
      {/* Back + title */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/workspaces"
            className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary"
          >
            <ChevronLeft size={15} /> Quay lại Projects
          </Link>
          <h1 className="mt-2 text-xl font-semibold text-text-primary">{workspace.name}</h1>
          <p className="text-xs text-text-tertiary">
            {workspace.id} · Google Colab external runtime
          </p>
        </div>
        
        {launchResult?.launch_url && (
          <Button
            onClick={() => window.open(launchResult.launch_url, "_blank", "noopener,noreferrer")}
            iconRight={<ExternalLink size={16} />}
          >
            Open in Colab
          </Button>
        )}
      </div>

      {/* Main 40/60 split */}
      <div className="flex gap-4 flex-col lg:flex-row min-h-0">

        {/* ── LEFT: Code Panel (40%) ── */}
        <div className="flex flex-col gap-4 lg:w-[40%]">

          {/* Bootstrap snippet */}
          <section className="rounded-xl border border-border bg-bg-surface p-4 shadow-sm">
            <SectionTitle icon={<Terminal size={13} />} title="Bootstrap snippet" />

            {launch.isPending && (
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-600">
                <RefreshCw size={12} className="animate-spin" />
                Generating claim code…
              </div>
            )}
            {launchError && (
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-error-50 px-3 py-2 text-xs text-error-500">
                <AlertCircle size={12} />
                Could not create session: {launchError}
              </div>
            )}
            {launchResult && (
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-success-50 px-3 py-2 text-xs text-success-500">
                <CheckCircle2 size={12} />
                New claim ready · expires in {launchResult.expires_in}s
              </div>
            )}

            <CodeBlock id="snippet-bootstrap" code={bootstrapSnippet} />

            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-text-tertiary">
                Paste into your first Colab cell and run.
              </p>
              <CopyButton text={bootstrapSnippet} label="Copy snippet" />
            </div>
          </section>

          {/* Reporting snippets */}
          <section className="rounded-xl border border-border bg-bg-surface p-4 shadow-sm">
            <SectionTitle icon={<Activity size={13} />} title="Reporting snippets" />
            <CodeBlock id="snippet-reporting" code={REPORT_SNIPPET} />
            <div className="mt-3 flex justify-end">
              <CopyButton text={REPORT_SNIPPET} label="Copy" />
            </div>
          </section>
        </div>

        {/* ── RIGHT: Data Dashboard (60%) ── */}
        <div className="flex flex-col gap-4 lg:w-[60%]">

          {/* Session + Run status */}
          <section className="rounded-xl border border-border bg-bg-surface p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <SectionTitle icon={<Circle size={13} />} title="Session & Run status" />
              {runData.isFetching && (
                <span className="flex items-center gap-1 text-[10px] text-text-tertiary">
                  <RefreshCw size={10} className="animate-spin" /> Refreshing
                </span>
              )}
            </div>

            {!rd ? (
              <div className="flex items-center gap-2 rounded-lg bg-bg-elevated px-4 py-3 text-xs text-text-tertiary">
                <WifiOff size={14} />
                {runData.isLoading ? "Loading session data…" : "No active session. Run the bootstrap snippet to connect."}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border bg-bg-base p-3">
                  <p className="text-[10px] uppercase tracking-wider text-text-tertiary">Session</p>
                  <p className={`mt-1 text-sm font-semibold ${sessionColor(rd.session_status)}`}>
                    {sessionLabel(rd.session_status)}
                  </p>
                  {rd.session_last_seen && (
                    <p className="mt-0.5 text-[10px] text-text-tertiary">
                      Last reported {formatDistanceToNow(new Date(rd.session_last_seen), { addSuffix: true })}
                    </p>
                  )}
                </div>
                <div className="rounded-lg border border-border bg-bg-base p-3">
                  <p className="text-[10px] uppercase tracking-wider text-text-tertiary">Run</p>
                  <p className={`mt-1 text-sm font-semibold ${runColor(rd.run_status)}`}>
                    {runLabel(rd.run_status)}
                  </p>
                  {rd.run_last_reported && (
                    <p className="mt-0.5 text-[10px] text-text-tertiary">
                      Last reported {formatDistanceToNow(new Date(rd.run_last_reported), { addSuffix: true })}
                    </p>
                  )}
                </div>
                {rd.model_version && (
                  <div className="col-span-2 flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-600">
                    <Package size={12} />
                    Model registered: <span className="font-semibold">{rd.model_version}</span>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Metrics */}
          <section className="rounded-xl border border-border bg-bg-surface p-4 shadow-sm">
            <SectionTitle icon={<Activity size={13} />} title="Metrics received" />
            <MetricsTable metrics={rd?.metrics ?? []} />
          </section>

          {/* Logs */}
          <section className="rounded-xl border border-border bg-bg-surface p-4 shadow-sm">
            <SectionTitle icon={<Terminal size={13} />} title="Logs received" />
            <LogsList logs={rd?.logs ?? []} />
          </section>

          {/* Artifacts */}
          <section className="rounded-xl border border-border bg-bg-surface p-4 shadow-sm">
            <SectionTitle icon={<Archive size={13} />} title="Artifacts" />
            <ArtifactsList artifacts={rd?.artifacts ?? []} />
          </section>
        </div>
      </div>
    </div>
  );
}

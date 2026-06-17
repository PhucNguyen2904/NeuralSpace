"use client";

import Link from "next/link";
import {
  ArrowRight,
  Bell,
  CheckCircle2,
  Database,
  FlaskConical,
  GitBranch,
  LineChart,
  Rocket,
  ShieldCheck,
  SquareTerminal
} from "lucide-react";
import { useMemo, type ComponentType, type CSSProperties } from "react";
import { defaultDatasetFilters, useDatasets } from "@/lib/hooks/useDatasets";
import { useExperimentList } from "@/lib/hooks/useExperiments";
import { useLineageGraph } from "@/lib/hooks/useLineageGraph";
import { defaultModelFilters, useModels } from "@/lib/hooks/useModels";
import { useWorkspaces } from "@/lib/hooks/useWorkspace";
import { useAuthStore } from "@/lib/stores/authStore";
import type { Workspace, WorkspaceStatus } from "@/types/workspace";

type ProjectStatus = "ready" | "idle" | "running";

type DisplayProject = {
  id: string;
  name: string;
  assets: number;
  status: ProjectStatus;
  lastActive: string;
};

type StatCardProps = {
  icon: ComponentType<{ size?: string | number; className?: string }>;
  title: string;
  value: string;
  subtitle: string;
  badge: string;
  accentColor: "blue" | "indigo" | "violet" | "cyan";
  footerText: string;
  index: number;
};

const sampleProjects: DisplayProject[] = [
  { id: "ws_1", name: "ws_1", assets: 6, status: "ready", lastActive: "2 hours ago" },
  { id: "ws_2", name: "ws_2", assets: 3, status: "idle", lastActive: "1 day ago" },
  { id: "ws_3", name: "ws_3", assets: 12, status: "running", lastActive: "Just now" }
];

const statusCopy: Record<ProjectStatus, string> = {
  ready: "Ready",
  idle: "Idle",
  running: "Running"
};

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const { data: projects = [] } = useWorkspaces();
  const datasetsQuery = useDatasets(defaultDatasetFilters);
  const modelsQuery = useModels(defaultModelFilters);
  const experimentsQuery = useExperimentList();
  const lineageQuery = useLineageGraph("dataset", "", 4);
  const displayName = user?.name?.split(" ")[0] || "Alex";
  const datasetTotal = datasetsQuery.data?.total ?? 0;
  const modelTotal = modelsQuery.data?.total ?? 0;
  const experiments = experimentsQuery.data ?? [];
  const runTotal = experiments.reduce((total, experiment) => total + (experiment.run_count ?? 0), 0);
  const lineageNodeTotal = lineageQuery.data?.nodes.length ?? 0;
  const lineageEdgeTotal = lineageQuery.data?.edges.length ?? 0;
  const runningProjectTotal = projects.filter((project) => project.status === "RUNNING").length;

  const rows = useMemo(() => {
    const liveProjects = projects.slice(0, 5).map(toDisplayProject);
    return liveProjects.length > 0 ? liveProjects : sampleProjects;
  }, [projects]);

  const stats: Array<Omit<StatCardProps, "index">> = [
    {
      icon: SquareTerminal,
      title: "Colab Projects",
      value: String(projects.length),
      subtitle: "External runtime workspaces",
      badge: "External runtimes",
      accentColor: "blue",
      footerText: runningProjectTotal > 0 ? `${runningProjectTotal} running now` : "Ready to launch"
    },
    {
      icon: Database,
      title: "Assets",
      value: String(datasetTotal + modelTotal),
      subtitle: "Registry inventory",
      badge: "Versioned assets",
      accentColor: "indigo",
      footerText: `${datasetTotal} Datasets · ${modelTotal} Models`
    },
    {
      icon: FlaskConical,
      title: "Experiments",
      value: String(experiments.length),
      subtitle: "Tracked MLflow groups",
      badge: `${runTotal} Runs`,
      accentColor: "violet",
      footerText: runTotal > 0 ? "Runs synced from MLflow" : "No runs recorded yet"
    },
    {
      icon: GitBranch,
      title: "Lineage",
      value: String(lineageEdgeTotal),
      subtitle: "Graph connectivity",
      badge: lineageEdgeTotal > 0 ? "Graph healthy" : "Awaiting links",
      accentColor: "cyan",
      footerText: `${lineageNodeTotal} Nodes · ${lineageEdgeTotal} Edges`
    }
  ];

  return (
    <div className="dashboard-industrial space-y-8 pb-8">
      <HeroBanner username={displayName} />

      <RuntimePromoBanner />

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4" aria-label="Workspace metrics">
        {stats.map((stat, index) => (
          <StatCard key={stat.title} {...stat} index={index} />
        ))}
      </section>

      <section className="rounded-lg border border-border bg-bg-surface shadow-sm">
        <div className="flex flex-col gap-4 border-b border-border px-6 py-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-[18px] font-semibold text-text-primary">Recent Colab Projects</h2>
            <p className="mt-1 text-sm text-text-secondary">Project contexts hold assets and scoped external runtime sessions.</p>
          </div>
          <Link href="/workspaces" className="inline-flex items-center gap-1 text-sm font-medium text-brand-500 transition hover:text-text-primary">
            View all
            <ArrowRight size={15} />
          </Link>
        </div>

        <div className="divide-y divide-border">
          {rows.map((project) => (
            <ProjectRow key={project.id} {...project} />
          ))}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]" aria-label="Recommended actions">
        <WorkflowPanel />
        <SignalPanel />
      </section>

      <style jsx global>{`
        .dashboard-industrial {
          --dash-grid: linear-gradient(var(--color-border-subtle) 1px, transparent 1px),
            linear-gradient(90deg, var(--color-border-subtle) 1px, transparent 1px);
        }

        .hero-mesh {
          background:
            radial-gradient(circle at 18% 20%, var(--color-accent-glow), transparent 34%),
            radial-gradient(circle at 78% 12%, color-mix(in srgb, var(--color-accent-secondary) 22%, transparent), transparent 32%),
            linear-gradient(135deg, var(--color-bg-surface), var(--color-bg-elevated));
        }

        .hero-mesh::before {
          background-image: var(--dash-grid);
          background-size: 32px 32px;
          mask-image: linear-gradient(90deg, transparent, black 16%, black 84%, transparent);
        }

        .stat-card {
          animation: stat-rise 280ms ease both;
          animation-delay: calc(var(--stat-index) * 80ms);
        }

        .stat-card:hover {
          transform: translateY(-3px);
        }

        .project-row .project-action {
          opacity: 0;
          transform: translateX(-4px);
        }

        .project-row:hover .project-action {
          opacity: 1;
          transform: translateX(0);
        }

        @keyframes stat-rise {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

const launchStepConfig = [
  {
    step: 1,
    label: "Create a workspace",
    detail: "Pick a Colab runtime and name your project",
    gradient: "from-violet-500 to-purple-600",
    glow: "shadow-violet-500/40",
    connector: "bg-gradient-to-b from-violet-400/60 to-blue-400/60"
  },
  {
    step: 2,
    label: "Attach assets",
    detail: "Link datasets and model versions before running",
    gradient: "from-blue-500 to-indigo-600",
    glow: "shadow-blue-500/40",
    connector: "bg-gradient-to-b from-blue-400/60 to-cyan-400/60"
  },
  {
    step: 3,
    label: "Launch & track",
    detail: "Metrics and artifacts are captured automatically",
    gradient: "from-cyan-500 to-teal-500",
    glow: "shadow-cyan-500/40",
    connector: null
  }
] as const;

function RuntimePromoBanner() {
  return (
    <section className="promo-banner overflow-hidden rounded-xl border border-violet-200/40 shadow-lg" style={{background: "linear-gradient(135deg, #0f0c29 0%, #1a1040 40%, #0d1b3e 100%)"}}>
      {/* Glow orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
        <div className="absolute -left-20 -top-20 h-64 w-64 rounded-full bg-violet-600/20 blur-3xl" />
        <div className="absolute -bottom-16 left-1/3 h-48 w-48 rounded-full bg-blue-500/15 blur-3xl" />
        <div className="absolute -right-10 top-1/4 h-40 w-40 rounded-full bg-cyan-400/15 blur-3xl" />
      </div>

      <div className="relative grid gap-0 md:grid-cols-[minmax(0,1fr)_300px]">
        {/* Left: copy */}
        <div className="px-7 py-8 md:px-8 md:py-9">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/40 bg-violet-500/20 px-3 py-1 text-[12px] font-semibold text-violet-200 backdrop-blur-sm">
              <Rocket size={12} className="text-violet-300" />
              Runtime launch pack
            </span>
            <span className="text-xs font-medium text-slate-400">For teams standardizing Colab experiments</span>
          </div>
          <h2 className="mt-4 text-[22px] font-bold leading-snug text-white">
            Prepare assets, launch a workspace,{" "}
            <span className="bg-gradient-to-r from-violet-300 via-blue-300 to-cyan-300 bg-clip-text text-transparent">
              and keep lineage connected.
            </span>
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">
            Bundle datasets and models before opening Colab so every run reports metrics, artifacts, and downstream model versions back into NeuralSpace.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/workspaces/new"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-gradient-to-r from-violet-600 to-blue-600 px-4 text-sm font-semibold text-white shadow-lg shadow-violet-500/30 transition hover:brightness-110 hover:shadow-violet-500/50"
            >
              <SquareTerminal size={15} />
              Create workspace
            </Link>
            <Link
              href="/lineage"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/15 bg-white/8 px-4 text-sm font-semibold text-slate-200 backdrop-blur-sm transition hover:border-violet-400/50 hover:bg-white/12"
            >
              <GitBranch size={15} />
              Inspect lineage
            </Link>
          </div>
        </div>

        {/* Right: Quick start steps */}
        <div className="relative border-t border-white/10 px-7 py-8 md:border-l md:border-t-0">
          <div className="mb-5 flex items-center gap-2">
            <span className="h-px flex-1 bg-gradient-to-r from-violet-500/50 to-transparent" />
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Quick start</p>
            <span className="h-px flex-1 bg-gradient-to-l from-cyan-500/50 to-transparent" />
          </div>
          <ol className="space-y-0">
            {launchStepConfig.map((s) => (
              <LaunchStep key={s.step} {...s} />
            ))}
          </ol>
        </div>
      </div>

      <style jsx global>{`
        .promo-banner { position: relative; }
        .bg-white\/8 { background-color: rgba(255,255,255,0.08); }
        .bg-white\/12 { background-color: rgba(255,255,255,0.12); }
      `}</style>
    </section>
  );
}

function LaunchStep({
  step, label, detail, gradient, glow, connector
}: typeof launchStepConfig[number]) {
  return (
    <li className="flex gap-4">
      {/* Icon + connector column */}
      <div className="flex flex-col items-center">
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${gradient} text-[13px] font-bold text-white shadow-lg ${glow}`}
        >
          {step}
        </span>
        {connector && (
          <span className={`mt-1 h-8 w-0.5 rounded-full ${connector}`} />
        )}
      </div>
      {/* Text */}
      <span className={`min-w-0 ${connector ? "pb-3" : ""}`}>
        <span className="block text-sm font-semibold text-slate-100">{label}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-slate-400">{detail}</span>
      </span>
    </li>
  );
}

function HeroBanner({ username }: { username: string }) {
  return (
    <section className="hero-mesh relative overflow-hidden rounded-lg border border-border px-6 py-6 shadow-sm md:px-7 md:py-7">
      <div className="pointer-events-none absolute inset-0 opacity-35 before:absolute before:inset-0" />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-text-tertiary">Dashboard</p>
          <h1 className="mt-1 text-[26px] font-bold leading-tight text-text-primary">Good day, {username}</h1>
          <p className="mt-1 max-w-2xl text-sm text-text-secondary">Overview of workspaces, assets, experiments, and lineage health.</p>
        </div>

        <div className="rounded-lg border border-border bg-bg-surface/70 px-5 py-4 lg:w-[380px]">
          <p className="text-xs font-semibold uppercase text-text-tertiary">Today&apos;s focus</p>
          <p className="mt-1 text-sm font-medium text-text-primary">Review active work and decide what needs attention next.</p>
          <p className="mt-1 text-xs leading-5 text-text-secondary">Metrics below summarize the current workspace inventory, not a campaign or launch flow.</p>
        </div>
      </div>
    </section>
  );
}

const statAccentStyles: Record<StatCardProps["accentColor"], {
  card: string;
  glow: string;
  icon: string;
  badge: string;
  footerDot: string;
}> = {
  blue: {
    card: "border-blue-100/80 bg-gradient-to-br from-white via-blue-50/35 to-bg-surface hover:border-blue-300/80 hover:shadow-blue-100/80",
    glow: "bg-blue-400/10",
    icon: "border-blue-100 bg-blue-50 text-blue-600",
    badge: "border-blue-100 bg-blue-50 text-blue-700",
    footerDot: "bg-blue-500"
  },
  indigo: {
    card: "border-indigo-100/80 bg-gradient-to-br from-white via-indigo-50/35 to-bg-surface hover:border-indigo-300/80 hover:shadow-indigo-100/80",
    glow: "bg-indigo-400/10",
    icon: "border-indigo-100 bg-indigo-50 text-indigo-600",
    badge: "border-indigo-100 bg-indigo-50 text-indigo-700",
    footerDot: "bg-indigo-500"
  },
  violet: {
    card: "border-violet-100/80 bg-gradient-to-br from-white via-violet-50/35 to-bg-surface hover:border-violet-300/80 hover:shadow-violet-100/80",
    glow: "bg-violet-400/10",
    icon: "border-violet-100 bg-violet-50 text-violet-600",
    badge: "border-violet-100 bg-violet-50 text-violet-700",
    footerDot: "bg-violet-500"
  },
  cyan: {
    card: "border-cyan-100/80 bg-gradient-to-br from-white via-cyan-50/35 to-emerald-50/20 hover:border-cyan-300/80 hover:shadow-cyan-100/80",
    glow: "bg-cyan-400/10",
    icon: "border-cyan-100 bg-cyan-50 text-cyan-700",
    badge: "border-emerald-100 bg-emerald-50 text-emerald-700",
    footerDot: "bg-emerald-500"
  }
};

function StatCard({ icon: Icon, title, value, subtitle, badge, accentColor, footerText, index }: StatCardProps) {
  const accent = statAccentStyles[accentColor];

  return (
    <article
      className={`stat-card group relative overflow-hidden rounded-2xl border p-6 shadow-sm transition duration-200 ease-out hover:shadow-lg ${accent.card}`}
      style={{ "--stat-index": index } as CSSProperties}
    >
      <div className={`pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full blur-2xl transition-opacity duration-200 group-hover:opacity-100 ${accent.glow}`} />
      <div className="relative flex items-start justify-between gap-3">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl border shadow-sm ${accent.icon}`}>
          <Icon size={21} />
        </span>
        <span className={`max-w-[9.5rem] truncate rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none ${accent.badge}`}>
          {badge}
        </span>
      </div>
      <div className="relative mt-6">
        <p className="text-[12px] font-semibold uppercase text-text-tertiary">{title}</p>
        <p className="mt-2 truncate text-[34px] font-bold leading-none text-text-primary">{value}</p>
        <p className="mt-2 text-sm font-medium text-text-secondary">{subtitle}</p>
      </div>
      <div className="relative mt-6 flex items-center gap-2 border-t border-border/60 pt-4 text-xs font-medium text-text-tertiary">
        <span className={`h-1.5 w-1.5 rounded-full ${accent.footerDot}`} />
        <span className="truncate">{footerText}</span>
      </div>
    </article>
  );
}

function ProjectRow({ id, name, assets, status, lastActive }: DisplayProject) {
  return (
    <Link href={`/workspaces/${id}`} className="project-row group grid gap-4 px-6 py-5 transition hover:bg-bg-elevated sm:grid-cols-[minmax(0,1fr)_140px_220px] sm:items-center">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate font-mono text-sm font-semibold text-text-primary">{name}</p>
          <span className="shrink-0 rounded-sm border border-border bg-bg-elevated px-1.5 py-0.5 text-[11px] font-medium text-text-secondary">{assets} assets</span>
        </div>
        <p className="mt-1 font-mono text-[11px] text-text-tertiary">{id}</p>
      </div>

      <StatusPill status={status} />

      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <span className="text-sm text-text-secondary">{lastActive}</span>
        <span className="project-action grid h-8 w-8 place-items-center rounded-md border border-border text-text-secondary transition duration-150 group-hover:text-text-primary">
          <ArrowRight size={15} />
        </span>
      </div>
    </Link>
  );
}

function WorkflowPanel() {
  const steps = [
    { icon: Database, title: "Upload a dataset version", copy: "Attach schema and split metadata before training.", href: "/datasets" },
    { icon: FlaskConical, title: "Run an experiment", copy: "Use the Colab bootstrap notebook to report runs.", href: "/experiments" },
    { icon: LineChart, title: "Review model impact", copy: "Check lineage before promoting new model versions.", href: "/lineage" }
  ];

  return (
    <section className="rounded-lg border border-border bg-bg-surface shadow-sm">
      <div className="border-b border-border px-6 py-5">
        <h2 className="text-[18px] font-semibold text-text-primary">Suggested next steps</h2>
        <p className="mt-1 text-sm text-text-secondary">Keep the MLOps loop complete from input data to registered model.</p>
      </div>
      <div className="divide-y divide-border">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <Link key={step.title} href={step.href} className="grid gap-4 px-6 py-5 transition hover:bg-bg-elevated sm:grid-cols-[44px_minmax(0,1fr)_auto] sm:items-center">
              <span className="grid h-11 w-11 place-items-center rounded-md border border-border bg-bg-elevated text-brand-500">
                <Icon size={18} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-text-primary">{step.title}</span>
                <span className="mt-0.5 block text-sm text-text-secondary">{step.copy}</span>
              </span>
              <ArrowRight size={16} className="hidden text-text-tertiary sm:block" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function SignalPanel() {
  const signals = [
    { icon: CheckCircle2, label: "Registry health", value: "Stable", tone: "text-success-500" },
    { icon: Bell, label: "Runtime alerts", value: "Enabled", tone: "text-warning-500" },
    { icon: ShieldCheck, label: "Approval queue", value: "Ready", tone: "text-brand-500" }
  ];

  return (
    <section className="rounded-lg border border-border bg-bg-surface shadow-sm">
      <div className="border-b border-border px-6 py-5">
        <h2 className="text-[18px] font-semibold text-text-primary">Operational signals</h2>
        <p className="mt-1 text-sm text-text-secondary">A compact view of platform readiness.</p>
      </div>
      <div className="space-y-4 px-6 py-5">
        {signals.map((signal) => {
          const Icon = signal.icon;
          return (
            <div key={signal.label} className="flex items-center justify-between rounded-md border border-border bg-bg-elevated px-3 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <Icon size={17} className={signal.tone} />
                <span className="truncate text-sm font-medium text-text-primary">{signal.label}</span>
              </div>
              <span className={`font-mono text-xs font-semibold ${signal.tone}`}>{signal.value}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function StatusPill({ status }: { status: ProjectStatus }) {
  const tone = status === "ready" ? "bg-success-500" : status === "running" ? "bg-warning-500 status-pulse" : "bg-text-tertiary";

  return (
    <span className="inline-flex w-fit items-center gap-2 rounded-sm border border-border bg-bg-elevated px-2 py-1 text-xs font-medium text-text-secondary">
      <span className={`h-1.5 w-1.5 rounded-full ${tone}`} />
      {statusCopy[status]}
    </span>
  );
}

function toDisplayProject(project: Workspace): DisplayProject {
  return {
    id: project.id,
    name: project.name || project.id,
    assets: (project.datasets?.length ?? 0) + (project.models?.length ?? 0),
    status: normalizeStatus(project.status),
    lastActive: formatLastActive(project.lastActiveAt)
  };
}

function normalizeStatus(status: WorkspaceStatus): ProjectStatus {
  if (status === "RUNNING") return "running";
  if (status === "READY") return "ready";
  return "idle";
}

function formatLastActive(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "Recently";

  const diffMs = Date.now() - timestamp;
  const minutes = Math.max(0, Math.round(diffMs / 60_000));
  if (minutes < 2) return "Just now";
  if (minutes < 60) return `${minutes} minutes ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hours ago`;

  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

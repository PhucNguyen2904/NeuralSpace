"use client";

import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Database,
  FlaskConical,
  GitBranch,
  SquareTerminal
} from "lucide-react";
import { useMemo, type ComponentType, type CSSProperties } from "react";
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
  value: string;
  label: string;
  trend?: string;
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
  const displayName = user?.name?.split(" ")[0] || "Alex";

  const rows = useMemo(() => {
    const liveProjects = projects.slice(0, 5).map(toDisplayProject);
    return liveProjects.length > 0 ? liveProjects : sampleProjects;
  }, [projects]);

  const stats = [
    { icon: SquareTerminal, value: String(projects.length || 3), label: "Colab Projects", trend: "External runtimes" },
    { icon: Database, value: "Registry", label: "12 Datasets", trend: "Versioned assets" },
    { icon: FlaskConical, value: "Tracked", label: "48 Experiments", trend: "MLflow sync" },
    { icon: GitBranch, value: "Connected", label: "Lineage", trend: "Graph healthy" }
  ];

  return (
    <div className="dashboard-industrial space-y-6">
      <HeroBanner username={displayName} />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" aria-label="Workspace metrics">
        {stats.map((stat, index) => (
          <StatCard key={stat.label} {...stat} index={index} />
        ))}
      </section>

      <section className="rounded-lg border border-border bg-bg-surface shadow-sm">
        <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
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
          border-color: var(--color-brand-500);
          box-shadow: var(--shadow-sm), 0 0 20px var(--color-accent-glow);
          transform: translateY(-1px);
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

function HeroBanner({ username }: { username: string }) {
  return (
    <section className="hero-mesh relative overflow-hidden rounded-lg border border-border px-5 py-5 shadow-md md:px-6 md:py-6">
      <div className="pointer-events-none absolute inset-0 opacity-50 before:absolute before:inset-0" />
      <div className="relative grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center">
        <div>
          <h1 className="text-[28px] font-bold leading-tight text-text-primary">Good day, {username}</h1>
          <p className="mt-2 max-w-2xl text-sm text-text-secondary">NeuralSpace control plane for external Colab runtimes.</p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Link href="/workspaces/new" className="inline-flex h-9 items-center gap-2 rounded-md bg-brand-500 px-3 text-sm font-semibold text-white shadow-brand transition hover:brightness-110">
              <SquareTerminal size={16} />
              New Colab Project
            </Link>
            <Link href="/workspaces" className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-bg-surface/70 px-3 text-sm font-semibold text-text-primary transition hover:bg-bg-elevated">
              <BookOpen size={16} />
              View Docs
            </Link>
          </div>
        </div>

        <NeuralSketch />
      </div>
    </section>
  );
}

function NeuralSketch() {
  const nodes = [
    [54, 42],
    [126, 28],
    [108, 94],
    [196, 54],
    [248, 112],
    [294, 44]
  ];

  return (
    <div className="hidden h-44 items-center justify-center lg:flex">
      <svg viewBox="0 0 340 180" className="h-full w-full text-brand-500" role="img" aria-label="Neural topology sketch">
        <defs>
          <linearGradient id="neural-line" x1="0" x2="1">
            <stop offset="0%" stopColor="var(--color-brand-500)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--color-accent-secondary)" stopOpacity="0.58" />
          </linearGradient>
          <filter id="neural-glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <path d="M54 42L126 28L196 54L294 44M54 42L108 94L196 54M108 94L248 112L294 44M126 28L248 112" fill="none" stroke="url(#neural-line)" strokeWidth="1.5" />
        <path d="M34 138H306" stroke="var(--color-border-default)" strokeDasharray="4 8" />
        {nodes.map(([cx, cy], index) => (
          <g key={`${cx}-${cy}`} filter={index > 2 ? "url(#neural-glow)" : undefined}>
            <circle cx={cx} cy={cy} r="7" fill="var(--color-bg-elevated)" stroke="var(--color-brand-500)" strokeWidth="1.5" />
            <circle cx={cx} cy={cy} r="2.5" fill={index % 2 ? "var(--color-accent-secondary)" : "var(--color-brand-500)"} />
          </g>
        ))}
        <rect x="210" y="134" width="82" height="20" rx="4" fill="var(--color-bg-elevated)" stroke="var(--color-border-default)" />
        <path d="M222 144H254M262 144H282" stroke="var(--color-text-tertiary)" strokeWidth="1.4" />
      </svg>
    </div>
  );
}

function StatCard({ icon: Icon, value, label, trend, index }: StatCardProps) {
  return (
    <article
      className="stat-card rounded-lg border border-border bg-bg-surface p-5 shadow-sm transition duration-150 ease-out"
      style={{ "--stat-index": index } as CSSProperties}
    >
      <div className="flex items-center justify-between">
        <span className="grid h-9 w-9 place-items-center rounded-md border border-border bg-brand-50 text-brand-500">
          <Icon size={20} />
        </span>
        {trend ? <span className="rounded-sm border border-border bg-bg-elevated px-2 py-1 font-mono text-[11px] font-medium text-text-tertiary">{trend}</span> : null}
      </div>
      <p className="mt-4 text-[28px] font-bold leading-none text-text-primary">{value}</p>
      <p className="mt-2 text-sm text-text-secondary">{label}</p>
    </article>
  );
}

function ProjectRow({ id, name, assets, status, lastActive }: DisplayProject) {
  return (
    <Link href={`/workspaces/${id}`} className="project-row group grid gap-3 px-5 py-4 transition hover:bg-bg-elevated sm:grid-cols-[minmax(0,1fr)_140px_220px] sm:items-center">
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
  if (status === "RUNNING" || status === "PROVISIONING") return "running";
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

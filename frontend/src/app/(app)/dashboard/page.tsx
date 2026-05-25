"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { BookOpen, Cpu, HardDrive, MoreHorizontal, SquareTerminal, Terminal } from "lucide-react";
import { memo, useMemo } from "react";
import { PageHeader, StatusBadge } from "@/components/shared";
import { Button, Card } from "@/components/ui";
import { useAuthStore } from "@/lib/stores/authStore";
import { useWorkspaces } from "@/lib/hooks/useWorkspace";
import type { Workspace } from "@/types/workspace";

function Progress({ value, max }: { value: number; max: number }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="mt-2 h-1.5 w-full rounded-full bg-bg-elevated">
      <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

const activities = [
  { color: "text-success-500", text: "Workspace 'ResNet Training' đã khởi động", at: new Date(Date.now() - 2 * 60_000) },
  { color: "text-error-500", text: "Workspace 'EDA Session' bị đóng do idle", at: new Date(Date.now() - 60 * 60_000) },
  { color: "text-info-500", text: "3 notebooks đã được lưu tự động", at: new Date(Date.now() - 70 * 60_000) }
];

const RunningWorkspaceCard = memo(function RunningWorkspaceCard({ workspace }: { workspace: Workspace }) {
  return (
    <div className="rounded-xl border border-border bg-bg-primary p-4 sm:p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between xl:gap-6">
      <div className="min-w-0 space-y-2">
        <p className="font-semibold leading-6 text-text-primary">{workspace.name}</p>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-bg-elevated px-2 py-0.5 text-text-secondary">{workspace.tier} GPU</span>
          <span className="text-text-tertiary">Running {workspace.runtimeMinutes} min</span>
        </div>
      </div>
      <div className="min-w-0 flex-1 xl:max-w-[420px]">
      <div className="grid gap-3 text-xs text-text-secondary">
        <div>
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium text-text-secondary">CPU</span>
            <span>{workspace.cpuUsed}/{workspace.cpuLimit}</span>
          </div>
          <Progress value={workspace.cpuUsed} max={workspace.cpuLimit} />
        </div>
        <div>
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium text-text-secondary">RAM</span>
            <span>{workspace.ramUsedGb}/{workspace.ramLimitGb} GB</span>
          </div>
          <Progress value={workspace.ramUsedGb} max={workspace.ramLimitGb} />
        </div>
      </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 xl:justify-end">
        <StatusBadge status={workspace.status} />
        <Button size="sm">Open</Button>
        <Button size="sm" variant="secondary">Stop</Button>
        <Button size="sm" variant="ghost" aria-label="More actions">
          <MoreHorizontal size={16} />
        </Button>
      </div>
      </div>
    </div>
  );
}, (prev, next) => prev.workspace.id === next.workspace.id && prev.workspace.status === next.workspace.status);

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const { data: workspaces = [] } = useWorkspaces();

  const running = useMemo(() => workspaces.filter((workspace) => workspace.status === "RUNNING"), [workspaces]);
  const storageUsed = 2.4;

  const summaryCards = [
    {
      icon: Terminal,
      metric: `${running.length}`,
      label: "Workspaces đang chạy",
      footerText: "2 / 2 quota dùng",
      progress: { value: 2, max: 2 }
    },
    {
      icon: Cpu,
      metric: "4.2 hrs",
      label: "Thời gian tính toán hôm nay",
      footerText: "Mức dùng ổn định"
    },
    {
      icon: BookOpen,
      metric: "12",
      label: "Notebooks đã lưu",
      footerText: "3 notebooks mới hôm nay"
    },
    {
      icon: HardDrive,
      metric: `${storageUsed} GB`,
      label: "Dung lượng đã dùng / 10 GB",
      footerText: `${Math.round((storageUsed / 10) * 100)}% dung lượng đã dùng`,
      progress: { value: storageUsed, max: 10 }
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={`Good day, ${user?.name ?? "there"} `} description={new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((item) => (
          <Card key={item.label} className="min-h-[172px] p-5 transition hover:-translate-y-[1px] hover:shadow-md">
            <div className="flex h-full flex-col items-start gap-3 text-left">
              <div className="w-full">
                <span className="inline-flex rounded-full bg-brand-50 p-2 text-brand-600">
                  <item.icon size={18} />
                </span>
              </div>
              <div className="w-full space-y-1">
                <p className="text-2xl font-semibold leading-none text-brand-600">{item.metric}</p>
                <p className="text-sm leading-5 text-text-secondary">{item.label}</p>
              </div>
              <div className="mt-auto w-full">
                <p className="text-xs text-text-tertiary">{item.footerText}</p>
                {item.progress ? <Progress value={item.progress.value} max={item.progress.max} /> : null}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card className="rounded-xl border-brand-100/80 p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <h2 className="text-lg font-semibold text-text-primary">Workspaces đang chạy</h2>
          <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-600">{running.length}</span>
        </div>

        {running.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <svg width="84" height="56" viewBox="0 0 84 56" className="mx-auto mb-3 text-text-tertiary">
              <rect x="6" y="6" width="72" height="40" rx="8" fill="currentColor" fillOpacity="0.1" stroke="currentColor" />
              <path d="M42 18v16M34 26h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <p className="text-sm text-text-secondary">Chưa có workspace nào đang chạy</p>
            <Link href="/workspaces/new"><Button className="mt-4">Tạo workspace mới</Button></Link>
          </div>
        ) : (
          <div className="space-y-3.5">
            {running.map((workspace) => <RunningWorkspaceCard key={workspace.id} workspace={workspace} />)}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Link href="/workspaces/new" className="rounded-xl border border-border/80 bg-bg-primary p-4 transition hover:border-brand-300 hover:bg-brand-50/40">
          <div className="flex h-8 items-center gap-2 text-sm font-medium text-text-secondary">
            <SquareTerminal size={16} className="text-brand-500" />
            New Workspace
          </div>
        </Link>
        <Link href="/notebooks" className="rounded-xl border border-border/80 bg-bg-primary p-4 transition hover:border-brand-300 hover:bg-brand-50/40">
          <div className="flex h-8 items-center gap-2 text-sm font-medium text-text-secondary">
            <BookOpen size={16} className="text-brand-500" />
            Browse Notebooks
          </div>
        </Link>
        <Link href="/datasets" className="rounded-xl border border-border/80 bg-bg-primary p-4 transition hover:border-brand-300 hover:bg-brand-50/40">
          <div className="flex h-8 items-center gap-2 text-sm font-medium text-text-secondary">
            <HardDrive size={16} className="text-brand-500" />
            Go to Datasets
          </div>
        </Link>
      </div>

      <Card className="rounded-xl border-border/90 p-5">
        <h2 className="mb-4 text-base font-semibold text-text-primary">Recent Activity</h2>
        <ul className="space-y-2.5">
          {activities.map((item) => (
            <li key={item.text} className="flex items-start justify-between gap-4 rounded-md px-2 py-1.5 text-sm">
              <span className="min-w-0 flex items-start gap-2 text-text-secondary">
                <span className={`pt-0.5 text-base leading-none ${item.color}`}>●</span>
                <span className="truncate sm:whitespace-normal">{item.text}</span>
              </span>
              <span className="shrink-0 whitespace-nowrap pr-1 pt-0.5 text-xs text-text-tertiary">{formatDistanceToNow(item.at, { addSuffix: true })}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

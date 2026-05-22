"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { BookOpen, Cpu, Database, HardDrive, Plus, Terminal } from "lucide-react";
import { useMemo } from "react";
import { PageHeader, StatusBadge } from "@/components/shared";
import { Button, Card } from "@/components/ui";
import { useAuthStore } from "@/lib/stores/authStore";
import { useWorkspaces } from "@/lib/hooks/useWorkspace";

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

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const { data: workspaces = [] } = useWorkspaces();

  const running = useMemo(() => workspaces.filter((workspace) => workspace.status === "RUNNING"), [workspaces]);
  const storageUsed = 2.4;

  return (
    <div className="space-y-6">
      <PageHeader title={`Good morning, ${user?.name ?? "there"} 👋`} description={new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="transition hover:-translate-y-[1px] hover:shadow-md" padding="md">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-2xl font-semibold text-brand-600">{running.length}</p>
              <p className="text-sm text-text-secondary">workspaces đang chạy</p>
              <p className="mt-2 text-xs text-text-tertiary">2 / 2 quota dùng</p>
              <Progress value={2} max={2} />
            </div>
            <span className="rounded-full bg-brand-50 p-2 text-brand-600"><Terminal size={18} /></span>
          </div>
        </Card>

        <Card className="transition hover:-translate-y-[1px] hover:shadow-md" padding="md">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-2xl font-semibold text-brand-600">4.2 hrs</p>
              <p className="text-sm text-text-secondary">thời gian tính toán hôm nay</p>
            </div>
            <span className="rounded-full bg-brand-50 p-2 text-brand-600"><Cpu size={18} /></span>
          </div>
        </Card>

        <Card className="transition hover:-translate-y-[1px] hover:shadow-md" padding="md">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-2xl font-semibold text-brand-600">12</p>
              <p className="text-sm text-text-secondary">notebooks đã lưu</p>
            </div>
            <span className="rounded-full bg-brand-50 p-2 text-brand-600"><BookOpen size={18} /></span>
          </div>
        </Card>

        <Card className="transition hover:-translate-y-[1px] hover:shadow-md" padding="md">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-2xl font-semibold text-brand-600">2.4 GB</p>
              <p className="text-sm text-text-secondary">/ 10 GB</p>
              <Progress value={storageUsed} max={10} />
            </div>
            <span className="rounded-full bg-brand-50 p-2 text-brand-600"><HardDrive size={18} /></span>
          </div>
        </Card>
      </div>

      <Card padding="lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Workspaces đang chạy</h2>
          <span className="rounded-full bg-brand-50 px-2 py-1 text-xs text-brand-600">{running.length}</span>
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
          <div className="space-y-3">
            {running.map((workspace) => (
              <div key={workspace.id} className="flex flex-wrap items-center gap-4 rounded-lg border border-border p-4">
                <div className="min-w-52 flex-1">
                  <p className="font-semibold text-text-primary">{workspace.name}</p>
                  <div className="mt-1 flex items-center gap-2 text-xs">
                    <span className="rounded-full bg-bg-elevated px-2 py-0.5 text-text-secondary">{workspace.tier}</span>
                    <span className="text-text-tertiary">Running {workspace.runtimeMinutes} min</span>
                  </div>
                </div>
                <div className="w-52 text-xs text-text-secondary">
                  CPU {workspace.cpuUsed}/{workspace.cpuLimit}
                  <Progress value={workspace.cpuUsed} max={workspace.cpuLimit} />
                  RAM {workspace.ramUsedGb}/{workspace.ramLimitGb} GB
                  <Progress value={workspace.ramUsedGb} max={workspace.ramLimitGb} />
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <StatusBadge status={workspace.status} />
                  <Button size="sm">Open</Button>
                  <Button size="sm" variant="ghost">...</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Link href="/workspaces/new" className="rounded-lg border border-dashed border-border bg-brand-50 p-4 transition hover:border-brand-500"><p className="font-medium text-brand-600">+ New Workspace</p></Link>
        <Link href="/notebooks" className="rounded-lg border border-dashed border-border bg-brand-50 p-4 transition hover:border-brand-500"><p className="font-medium text-brand-600">📁 Browse Notebooks</p></Link>
        <Link href="/datasets" className="rounded-lg border border-dashed border-border bg-brand-50 p-4 transition hover:border-brand-500"><p className="font-medium text-brand-600">🔗 Go to Datasets</p></Link>
      </div>

      <Card padding="lg">
        <h2 className="mb-4 text-lg font-semibold">Recent Activity</h2>
        <ul className="space-y-3">
          {activities.map((item) => (
            <li key={item.text} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2 text-text-secondary"><span className={`text-base ${item.color}`}>●</span>{item.text}</span>
              <span className="text-xs text-text-tertiary">{formatDistanceToNow(item.at, { addSuffix: true })}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

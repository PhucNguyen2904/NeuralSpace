"use client";

import Link from "next/link";
import { Database, FlaskConical, GitBranch, SquareTerminal } from "lucide-react";
import { PageHeader, StatusBadge } from "@/components/shared";
import { Button, Card } from "@/components/ui";
import { useWorkspaces } from "@/lib/hooks/useWorkspace";
import { useAuthStore } from "@/lib/stores/authStore";

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const { data: projects = [] } = useWorkspaces();

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 via-white to-cyan-50 p-6">
        <PageHeader
          title={`Good day, ${user?.name ?? "there"}`}
          description="NeuralSpace control plane for external Colab runtimes."
          action={<Link href="/workspaces/new"><Button>New Colab project</Button></Link>}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="Colab projects" value={String(projects.length)} icon={<SquareTerminal size={18} />} />
        <Metric label="Datasets" value="Registry" icon={<Database size={18} />} />
        <Metric label="Experiments" value="Tracked" icon={<FlaskConical size={18} />} />
        <Metric label="Lineage" value="Connected" icon={<GitBranch size={18} />} />
      </div>

      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-text-primary">Recent Colab projects</h2>
            <p className="text-sm text-text-secondary">Project contexts hold assets and issue scoped runtime sessions.</p>
          </div>
          <Link href="/workspaces" className="text-sm text-brand-600">View all</Link>
        </div>
        <div className="space-y-2">
          {projects.slice(0, 5).map((project) => (
            <Link key={project.id} href={`/workspaces/${project.id}`} className="flex items-center justify-between rounded-lg border border-border p-3 hover:bg-bg-elevated">
              <div>
                <p className="font-medium text-text-primary">{project.name}</p>
                <p className="text-xs text-text-tertiary">{(project.datasets?.length ?? 0) + (project.models?.length ?? 0)} attached assets</p>
              </div>
              <StatusBadge status={project.status} />
            </Link>
          ))}
          {projects.length === 0 ? <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-text-secondary">Chưa có Colab project.</p> : null}
        </div>
      </Card>
    </div>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon: JSX.Element }) {
  return (
    <Card className="p-5">
      <span className="inline-flex rounded-full bg-brand-50 p-2 text-brand-600">{icon}</span>
      <p className="mt-4 text-2xl font-semibold text-text-primary">{value}</p>
      <p className="text-sm text-text-secondary">{label}</p>
    </Card>
  );
}

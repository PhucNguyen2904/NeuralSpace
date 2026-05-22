"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { MoreHorizontal, Play, Search, Square, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { DeleteConfirmModal, PageHeader, StatusBadge } from "@/components/shared";
import { Button } from "@/components/ui";
import { useDeleteWorkspace, useStopWorkspace, useWorkspaces } from "@/lib/hooks/useWorkspace";
import type { Workspace, WorkspaceStatus } from "@/types/workspace";

type StatusFilter = "All" | "RUNNING" | "STOPPED" | "ERROR";
type SortMode = "Newest" | "Oldest" | "Name A-Z";

function SkeletonRows() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, idx) => (
        <div key={idx} className="grid grid-cols-6 gap-3 rounded-md border border-border p-3">
          <div className="skeleton-shimmer h-4 rounded" />
          <div className="skeleton-shimmer h-4 rounded" />
          <div className="skeleton-shimmer h-4 rounded" />
          <div className="skeleton-shimmer h-4 rounded" />
          <div className="skeleton-shimmer h-4 rounded" />
          <div className="skeleton-shimmer h-4 rounded" />
        </div>
      ))}
    </div>
  );
}

function rowActions(workspace: Workspace) {
  const common = ["Download notebooks", "Delete"];
  if (workspace.status === "RUNNING") {
    return ["Open", "Stop", "Restart", ...common];
  }
  return ["Start", ...common];
}

export default function WorkspacesPage() {
  const { data: workspaces = [], isLoading } = useWorkspaces();
  const stopMutation = useStopWorkspace();
  const deleteMutation = useDeleteWorkspace();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [sortMode, setSortMode] = useState<SortMode>("Newest");
  const [page, setPage] = useState(1);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Workspace | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const pageSize = 10;

  const filtered = useMemo(() => {
    let items = workspaces.filter((workspace) => workspace.name.toLowerCase().includes(search.toLowerCase()));
    if (statusFilter !== "All") {
      items = items.filter((workspace) => workspace.status === statusFilter);
    }
    if (sortMode === "Newest") {
      items = [...items].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    } else if (sortMode === "Oldest") {
      items = [...items].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
    } else {
      items = [...items].sort((a, b) => a.name.localeCompare(b.name));
    }
    return items;
  }, [workspaces, search, statusFilter, sortMode]);

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const paginated = filtered.slice(start, start + pageSize);

  const handleStop = (id: string) => {
    stopMutation.mutate(id);
    setMenuOpenId(null);
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => {
        setDeleteTarget(null);
        setConfirmDelete(false);
      }
    });
  };

  return (
    <div className="space-y-5">
      <PageHeader title="My Workspaces" description="Manage cloud IDE environments." action={<Link href="/workspaces/new"><Button size="sm">New Workspace</Button></Link>} />

      <div className="rounded-lg border border-border bg-bg-surface p-4">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label className="relative min-w-56 flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo tên..." className="h-10 w-full rounded-md border border-border bg-bg-sunken pl-9 pr-3 text-sm outline-none focus:border-brand-500" />
          </label>

          <div className="flex rounded-md bg-bg-elevated p-1">
            {(["All", "RUNNING", "STOPPED", "ERROR"] as StatusFilter[]).map((status) => (
              <button key={status} onClick={() => setStatusFilter(status)} className={`rounded px-3 py-1.5 text-xs ${statusFilter === status ? "bg-bg-surface text-brand-600 shadow-xs" : "text-text-secondary"}`}>
                {status}
              </button>
            ))}
          </div>

          <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)} className="h-10 rounded-md border border-border bg-bg-surface px-3 text-sm text-text-secondary">
            <option>Newest</option>
            <option>Oldest</option>
            <option>Name A-Z</option>
          </select>
        </div>

        {isLoading ? (
          <SkeletonRows />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-tertiary">
                  <th className="py-2">Name</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Tier</th>
                  <th className="py-2">Runtime</th>
                  <th className="py-2">Last Active</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((workspace) => (
                  <tr key={workspace.id} className="border-b border-border/70 hover:bg-bg-elevated">
                    <td className="py-3 font-medium text-text-primary">
                      <span className="inline-flex items-center gap-2">
                        {workspace.status === "RUNNING" ? <span className="h-2 w-2 rounded-full bg-success-500 status-pulse" /> : null}
                        {workspace.name}
                      </span>
                    </td>
                    <td className="py-3"><StatusBadge status={workspace.status as WorkspaceStatus} /></td>
                    <td className="py-3 uppercase text-text-secondary">{workspace.tier.replace("-", " ")}</td>
                    <td className="py-3 text-text-secondary">{workspace.status === "RUNNING" ? workspace.runtimeLabel : "-"}</td>
                    <td className="py-3 text-text-secondary">{formatDistanceToNow(new Date(workspace.lastActiveAt), { addSuffix: true })}</td>
                    <td className="relative py-3">
                      <div className="flex items-center gap-2">
                        {workspace.status === "RUNNING" ? <Button size="sm">Open</Button> : <Button size="sm" variant="secondary" iconLeft={<Play size={14} />}>Start</Button>}
                        <button onClick={() => setMenuOpenId(menuOpenId === workspace.id ? null : workspace.id)} className="rounded-md border border-border p-2 hover:bg-bg-elevated" aria-label="Row actions">
                          <MoreHorizontal size={16} />
                        </button>
                      </div>

                      {menuOpenId === workspace.id ? (
                        <div className="absolute right-0 top-12 z-30 min-w-44 rounded-md border border-border bg-bg-surface p-1 shadow-md">
                          {rowActions(workspace).map((action) => {
                            const danger = action === "Delete";
                            return (
                              <button
                                key={action}
                                className={`flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm ${danger ? "text-error-500 hover:bg-error-50" : "text-text-secondary hover:bg-bg-elevated"}`}
                                onClick={() => {
                                  if (action === "Stop") handleStop(workspace.id);
                                  if (action === "Open") setMenuOpenId(null);
                                  if (action === "Delete") {
                                    setDeleteTarget(workspace);
                                    setMenuOpenId(null);
                                  }
                                }}
                              >
                                {action === "Stop" ? <Square size={14} /> : action === "Delete" ? <Trash2 size={14} /> : null}
                                {action}
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between text-sm text-text-secondary">
          <p>Showing {total === 0 ? 0 : start + 1}-{Math.min(start + pageSize, total)} of {total}</p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
            <span className="font-semibold text-text-primary">{page}</span>
            <Button variant="ghost" size="sm" onClick={() => setPage((p) => (start + pageSize < total ? p + 1 : p))} disabled={start + pageSize >= total}>Next</Button>
          </div>
        </div>
      </div>

      <DeleteConfirmModal
        open={Boolean(deleteTarget)}
        confirmChecked={confirmDelete}
        setConfirmChecked={setConfirmDelete}
        deleting={deleteMutation.isPending}
        onClose={() => {
          setDeleteTarget(null);
          setConfirmDelete(false);
        }}
        onConfirm={handleDelete}
      />
    </div>
  );
}

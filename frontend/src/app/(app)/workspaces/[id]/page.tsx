"use client";

import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Clock3,
  Database,
  FileCode2,
  FileSpreadsheet,
  Folder,
  FolderPlus,
  Lock,
  MoreVertical,
  NotebookPen,
  Package,
  Play,
  Plus,
  Save,
  Square,
  Terminal,
  TriangleAlert
} from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { StatusBadge } from "@/components/shared";
import { Button, Input, Separator, Spinner } from "@/components/ui";
import { useIdleTimer } from "@/lib/hooks/useIdleTimer";
import { useKernelStatus } from "@/lib/hooks/useKernelStatus";
import { useResourceMetrics } from "@/lib/hooks/useResourceMetrics";
import { useWorkspaceIdle } from "@/lib/hooks/useWorkspaceIdle";
import { useHeartbeatMutation, useStopWorkspace, useWorkspaceDetail, useWorkspaceFiles, useWorkspaceResources, useWorkspaceToken } from "@/lib/hooks/useWorkspace";
import { cn } from "@/lib/utils/cn";
import type { WorkspaceFileNode } from "@/types/workspace";

const WorkspaceIframe = dynamic(() => import("@/components/workspace/WorkspaceIframe").then((m) => m.WorkspaceIframe), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-text-secondary">Loading IDE...</div>
});

const ResourceMonitorPanel = dynamic(
  () => import("@/components/workspace/ResourceMonitorPanel").then((m) => m.ResourceMonitorPanel),
  { ssr: false }
);

function formatCountdown(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function fileIcon(type: WorkspaceFileNode["type"]) {
  if (type === "notebook") return <NotebookPen size={14} className="text-warning-500" />;
  if (type === "csv") return <FileSpreadsheet size={14} className="text-success-500" />;
  if (type === "model") return <Package size={14} className="text-brand-600" />;
  if (type === "python") return <FileCode2 size={14} className="text-info-500" />;
  return <Folder size={14} className="text-text-secondary" />;
}

function FileTree({ nodes, onOpenFile }: { nodes: WorkspaceFileNode[]; onOpenFile: (path: string) => void }) {
  return (
    <div className="space-y-1">
      {nodes.map((node) => (
        <div key={node.id}>
          <button
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-text-secondary hover:bg-bg-elevated"
            onClick={() => {
              if (node.type !== "folder") onOpenFile(node.name);
            }}
          >
            {fileIcon(node.type)}
            <span className="truncate">{node.name}</span>
            {node.readonly ? <Lock size={12} className="ml-auto text-text-tertiary" /> : null}
          </button>
          {node.children ? (
            <div className="ml-4 border-l border-border pl-2">
              <FileTree nodes={node.children} onOpenFile={onOpenFile} />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export default function WorkspaceIdePage({ params }: { params: { id: string } }) {
  const workspaceId = params.id;
  const [isRenaming, setIsRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [filePanelOpen, setFilePanelOpen] = useState(true);
  const [resourcePanelOpen, setResourcePanelOpen] = useState(false);

  const workspaceQuery = useWorkspaceDetail(workspaceId);
  const filesQuery = useWorkspaceFiles(workspaceId);
  const tokenQuery = useWorkspaceToken(workspaceId);
  const resourcesQuery = useWorkspaceResources(workspaceId);
  const { status: kernelStatus, activeKernels } = useKernelStatus(workspaceId);
  const stopMutation = useStopWorkspace();
  const heartbeatMutation = useHeartbeatMutation();

  const idle = useWorkspaceIdle(workspaceId);
  const idleTimer = useIdleTimer(workspaceQuery.data?.autoKillAt);

  const workspace = workspaceQuery.data;
  const hasGpu = workspace?.tier === "gpu-t4";
  const metrics = useResourceMetrics(workspaceId, resourcePanelOpen, hasGpu, workspace?.ramLimitGb ?? 4);
  const resources = resourcesQuery.data;

  const kernelStateClass =
    kernelStatus === "busy"
      ? "text-warning-500"
      : kernelStatus === "dead"
        ? "text-error-500"
        : "text-success-500";

  const openFileInIframe = (path: string) => {
    window.postMessage(
      {
        type: "NEURALSPACE_OPEN_FILE",
        payload: { path }
      },
      "*"
    );
  };

  const idleWarningText = useMemo(() => {
    const minutes = Math.floor(idle.minutesLeft);
    const seconds = Math.floor((idle.minutesLeft - minutes) * 60);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }, [idle.minutesLeft]);

  if (!workspace) {
    return <div className="p-6 text-sm text-text-secondary" aria-live="polite">Loading workspace...</div>;
  }

  const compactCpu = resourcePanelOpen ? metrics.cpu.usagePercent : resources?.cpu ?? 0;
  const compactRamUsed = resourcePanelOpen ? metrics.memory.usedGb : resources?.ramUsedGb ?? 0;
  const compactRamTotal = resourcePanelOpen ? metrics.memory.totalGb : resources?.ramTotalGb ?? workspace.ramLimitGb;
  const compactGpu = resourcePanelOpen ? metrics.gpu.usagePercent : resources?.gpu ?? 0;

  const cpuClass =
    compactCpu > 80
      ? "text-error-500 status-pulse"
      : compactCpu >= 60
        ? "text-warning-500"
        : "text-text-secondary";

  return (
    <div className="-m-6 flex h-[calc(100vh-56px)] flex-col overflow-hidden">
      <div className="flex h-12 items-center justify-between border-b border-border bg-bg-surface px-3">
        <div className="flex items-center gap-2">
          <Link href="/workspaces"><Button size="sm" variant="ghost" iconLeft={<ChevronLeft size={14} />}>Back</Button></Link>
          {isRenaming ? (
            <Input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => setIsRenaming(false)}
              autoFocus
              className="h-8"
            />
          ) : (
            <button className="text-sm font-semibold text-text-primary" onClick={() => { setNameDraft(workspace.name); setIsRenaming(true); }}>
              {workspace.name}
            </button>
          )}
          <StatusBadge status={workspace.status} />
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" iconRight={<ChevronsUpDown size={14} />}>{activeKernels[0] ?? "Python 3 (ipykernel)"}</Button>
          <Button size="sm" variant="ghost">Interrupt</Button>
          <Button size="sm" variant="ghost">Restart kernel</Button>
        </div>

        <div className="flex items-center gap-2">
          <p className={cn("font-mono text-sm", cpuClass)}>CPU {compactCpu}% · RAM {compactRamUsed}/{compactRamTotal}GB</p>
          <p className={cn("inline-flex items-center gap-1 font-mono text-sm", idleTimer.isWarning ? "text-warning-500" : "text-text-secondary", idleTimer.isUrgent && "status-pulse text-error-500")}><Clock3 size={13} /> Idle: {formatCountdown(idleTimer.timeUntilKill)}</p>
          <Button size="sm" variant="ghost" onClick={() => heartbeatMutation.mutate(workspaceId)}>Extend Session</Button>
          <Separator className="h-6 w-px" />
          <Button size="sm" variant="danger" onClick={() => stopMutation.mutate(workspaceId)}>Stop</Button>
          <Button size="sm" variant="ghost" iconLeft={<MoreVertical size={14} />}>Menu</Button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <motion.aside
          initial={false}
          animate={{ width: filePanelOpen ? 240 : 0, opacity: filePanelOpen ? 1 : 0 }}
          transition={{ duration: 0.2 }}
          className="hidden border-r border-border bg-bg-surface md:block"
        >
          {filePanelOpen ? (
            <div className="flex h-full flex-col">
              <div className="flex h-10 items-center justify-between border-b border-border px-2">
                <p className="text-sm font-medium">Files</p>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" iconLeft={<Plus size={12} />}>File</Button>
                  <Button size="sm" variant="ghost" iconLeft={<FolderPlus size={12} />}>Folder</Button>
                  <Button size="sm" variant="ghost" onClick={() => setFilePanelOpen(false)} iconLeft={<ChevronLeft size={12} />} />
                </div>
              </div>
              <div className="flex-1 overflow-auto p-2">
                {filesQuery.isLoading ? <div className="p-2 text-xs text-text-tertiary">Loading files...</div> : null}
                {filesQuery.data ? <FileTree nodes={filesQuery.data} onOpenFile={openFileInIframe} /> : null}
              </div>
            </div>
          ) : null}
        </motion.aside>

        {!filePanelOpen ? (
          <button className="absolute left-2 top-2 z-20 rounded-md border border-border bg-bg-surface p-1.5" onClick={() => setFilePanelOpen(true)}>
            <ChevronRight size={14} />
          </button>
        ) : null}

        <div className="min-h-0 flex-1 overflow-hidden">
          {tokenQuery.isLoading ? (
            <div className="flex h-full items-center justify-center text-sm text-text-secondary" aria-live="polite"><Spinner /> <span className="ml-2">Preparing secure tunnel...</span></div>
          ) : (
            <WorkspaceIframe
              workspaceId={workspaceId}
              accessUrl={tokenQuery.data?.access_url ?? workspace.accessUrl ?? "https://jupyter.org/try-jupyter/lab/"}
              wsToken={tokenQuery.data?.ws_token}
            />
          )}
        </div>

        {idle.isIdleWarning ? (
          <motion.div
            initial={{ x: 320, opacity: 0 }}
            animate={{ x: 0, opacity: 1, scale: idle.minutesLeft <= 1 ? [1, 1.02, 1] : 1 }}
            transition={{ duration: 0.3, repeat: idle.minutesLeft <= 1 ? Infinity : 0, repeatDelay: 0.8 }}
            className="absolute right-4 top-4 z-30 w-80 rounded-lg border border-warning-500 bg-bg-surface p-4 shadow-lg"
          >
            <p className="font-semibold text-text-primary">⚠️ Workspace sắp bị đóng</p>
            <p className="mt-1 text-sm text-text-secondary">Không có hoạt động trong 25 phút</p>
            <p className="mt-1 text-sm text-warning-500">Tự động đóng sau: {idleWarningText}</p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={() => idle.extendSession()}>Gia hạn thêm 30 phút</Button>
              <Button size="sm" variant="ghost" onClick={() => idle.dismissIdleWarning()}>Để đóng</Button>
            </div>
          </motion.div>
        ) : null}
      </div>

      <div className="relative flex h-7 items-center border-t border-border bg-bg-elevated px-3 text-xs">
        <p className={cn("inline-flex items-center gap-1", kernelStateClass)}>
          Kernel: Python 3 · {kernelStatus === "busy" ? "Busy" : kernelStatus === "dead" ? "Dead" : "Idle"}
          {kernelStatus === "busy" ? <Spinner size="sm" /> : null}
        </p>
        <p className="absolute left-1/2 -translate-x-1/2 text-text-secondary">Last saved: {workspace.lastSavedAt ? "2 minutes ago" : "-"}</p>
        <button className="ml-auto font-mono text-text-secondary" onClick={() => setResourcePanelOpen((prev) => !prev)}>
          CPU: {compactCpu}% · RAM: {compactRamUsed}GB · GPU: {compactGpu}%
        </button>

        <ResourceMonitorPanel
          open={resourcePanelOpen}
          hasGpu={hasGpu}
          cpu={metrics.cpu}
          memory={metrics.memory}
          gpu={metrics.gpu}
          history={metrics.history}
        />
      </div>
    </div>
  );
}

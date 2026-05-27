"use client";

import { AlertTriangle, Loader2, MoreVertical, Play, RotateCcw, Save, Square, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "../ui/Button";
import { KernelStatusIndicator } from "./KernelStatusIndicator";

export interface NotebookToolbarProps {
  notebookName: string;
  isSaving: boolean;
  isDirty: boolean;
  lastSaved: Date | null;
  kernelStatus: "idle" | "busy" | "starting" | "dead";
  connectionStatus?: "disconnected" | "connecting" | "connected" | "error";
  onSave: () => void;
  onRunAll: () => void;
  onInterrupt: () => void;
  onRestartKernel: () => void;
  onRestartAndRunAll: () => void;
  onClearAllOutputs: () => void;
  onAddCell: () => void;
  onRunSelected?: () => void;
  onRenameNotebook?: (name: string) => void;
}

function formatSavedTime(lastSaved: Date | null): string {
  if (!lastSaved) {
    return "";
  }
  const hours = `${lastSaved.getHours()}`.padStart(2, "0");
  const minutes = `${lastSaved.getMinutes()}`.padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function NotebookToolbar({
  notebookName,
  isSaving,
  isDirty,
  lastSaved,
  kernelStatus,
  connectionStatus = "connected",
  onSave,
  onRunAll,
  onInterrupt,
  onRestartKernel,
  onRestartAndRunAll,
  onClearAllOutputs,
  onAddCell,
  onRunSelected,
  onRenameNotebook
}: NotebookToolbarProps): JSX.Element {
  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  const [isEditingName, setIsEditingName] = useState<boolean>(false);
  const [nameDraft, setNameDraft] = useState<string>(notebookName);

  const saveLabel = useMemo(() => {
    if (isSaving) {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-text-secondary">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang lưu...
        </span>
      );
    }

    if (isDirty) {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-amber-700">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Chưa lưu
        </span>
      );
    }

    return <span className="text-xs text-success-500">✓ Đã lưu lúc {formatSavedTime(lastSaved)}</span>;
  }, [isDirty, isSaving, lastSaved]);

  return (
    <div className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-border bg-bg-surface px-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="inline-flex items-center gap-2 font-semibold text-text-primary">
          <span className="h-2.5 w-2.5 rounded-full bg-brand-500" />
          <span>NeuralSpace</span>
        </div>
        <span className="h-5 w-px bg-border" />

        {isEditingName ? (
          <input
            value={nameDraft}
            onChange={(event) => setNameDraft(event.target.value)}
            className="h-7 rounded border border-border px-2 text-sm"
            onBlur={() => {
              setIsEditingName(false);
              onRenameNotebook?.(nameDraft.trim().length > 0 ? nameDraft.trim() : notebookName);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                setIsEditingName(false);
                onRenameNotebook?.(nameDraft.trim().length > 0 ? nameDraft.trim() : notebookName);
              }
            }}
            autoFocus
          />
        ) : (
          <button type="button" className="truncate text-sm font-medium text-text-primary" onClick={() => setIsEditingName(true)}>
            {notebookName}
          </button>
        )}

        {saveLabel}
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={onRunSelected ?? onRunAll}>
          <Play className="h-3.5 w-3.5" /> Run
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={onInterrupt} disabled={kernelStatus !== "busy"}>
          <Square className="h-3.5 w-3.5" /> Interrupt
        </Button>

        <div className="relative">
          <Button type="button" size="sm" variant="secondary" onClick={() => setMenuOpen((open) => !open)}>
            <Play className="h-3.5 w-3.5" />
            <Play className="-ml-2 h-3.5 w-3.5" />
            Run All
            <MoreVertical className="h-3.5 w-3.5" />
          </Button>
          {menuOpen ? (
            <div className="absolute right-0 z-40 mt-2 w-52 rounded-md border border-border bg-bg-surface p-1 shadow-md">
              <button type="button" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-bg-elevated" onClick={() => { setMenuOpen(false); onRunAll(); }}>
                <Play className="h-3.5 w-3.5" /> Chạy tất cả
              </button>
              <button type="button" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-bg-elevated" onClick={() => { setMenuOpen(false); onRestartAndRunAll(); }}>
                <RotateCcw className="h-3.5 w-3.5" /> Restart & Run All
              </button>
              <button type="button" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-bg-elevated" onClick={() => { setMenuOpen(false); onClearAllOutputs(); }}>
                <Trash2 className="h-3.5 w-3.5" /> Clear All Outputs
              </button>
            </div>
          ) : null}
        </div>

        <Button type="button" size="sm" variant="ghost" onClick={onAddCell}>
          + Cell
        </Button>

        <Button type="button" size="sm" variant="ghost" onClick={onSave}>
          <Save className="h-3.5 w-3.5" /> Save
        </Button>

        <KernelStatusIndicator
          kernelStatus={kernelStatus}
          connectionStatus={connectionStatus}
          kernelName="Python 3 (ipykernel)"
          onRestart={onRestartKernel}
          onInterrupt={onInterrupt}
          onViewKernelInfo={() => {
            window.alert("Kernel info panel se duoc bo sung o layer tiep theo.");
          }}
        />

        {kernelStatus === "dead" ? <AlertTriangle className="h-4 w-4 text-error-500" /> : null}
      </div>
    </div>
  );
}

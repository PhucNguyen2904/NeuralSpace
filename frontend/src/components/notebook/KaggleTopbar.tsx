"use client";

import { ChevronDown, ChevronRight, Database, Loader2, Play, Save, Square } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "../../lib/utils/cn";
import type { UseKernelReturn } from "../../hooks/useKernel";
import type { UseNotebookReturn } from "../../hooks/useNotebook";

interface KaggleTopbarProps {
  notebookName: string;
  onNameChange: (name: string) => void;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  kernel: UseKernelReturn;
  notebook: UseNotebookReturn;
  onRunCell: () => void;
  onRunAll: () => void;
  onInterrupt: () => void;
  isRightSidebarOpen: boolean;
  onToggleRightSidebar: () => void;
}

function formatRelative(date: Date): string {
  const diff = Date.now() - date.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hour = Math.floor(min / 60);
  return `${hour}h`;
}

export function KaggleTopbar({
  notebookName,
  onNameChange,
  isSidebarOpen,
  onToggleSidebar,
  kernel,
  notebook,
  onRunCell,
  onRunAll,
  onInterrupt,
  isRightSidebarOpen,
  onToggleRightSidebar
}: KaggleTopbarProps): JSX.Element {
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(notebookName);

  useEffect(() => {
    setNameValue(notebookName);
  }, [notebookName]);

  const kernelConfig = useMemo(
    () =>
      ({
        idle: { dot: "bg-emerald-400", label: "Idle" },
        busy: { dot: "bg-amber-400 animate-ping", label: "Running..." },
        starting: { dot: "bg-sky-400 animate-pulse", label: "Starting..." },
        dead: { dot: "bg-red-400", label: "Dead" }
      })[kernel.kernelStatus] ?? { dot: "bg-gray-300", label: "Unknown" },
    [kernel.kernelStatus]
  );

  return (
    <header className="flex h-12 shrink-0 select-none items-center gap-2 border-b border-[#E2E8F0] bg-white px-3">
      <button
        onClick={onToggleSidebar}
        title={isSidebarOpen ? "An file tree" : "Hien file tree"}
        className={cn(
          "rounded-md p-1.5 transition-colors",
          isSidebarOpen ? "bg-[#EEF2FF] text-[#6366F1]" : "text-[#94A3B8] hover:bg-[#F8FAFC] hover:text-[#1A202C]"
        )}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="2" y="3" width="5" height="10" rx="1" fill="currentColor" opacity="0.4" />
          <rect x="9" y="3" width="5" height="2" rx="0.5" fill="currentColor" />
          <rect x="9" y="7" width="5" height="2" rx="0.5" fill="currentColor" />
          <rect x="9" y="11" width="3" height="2" rx="0.5" fill="currentColor" />
        </svg>
      </button>

      <div className="flex min-w-0 items-center gap-1.5">
        <span className="shrink-0 text-[13px] font-semibold text-[#6366F1]">CollabClone</span>
        <ChevronRight size={13} className="shrink-0 text-[#CBD5E0]" />

        {editingName ? (
          <input
            autoFocus
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={() => {
              setEditingName(false);
              if (nameValue.trim()) onNameChange(nameValue.trim());
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setNameValue(notebookName);
                setEditingName(false);
              }
            }}
            className="w-48 min-w-0 rounded border border-[#6366F1] bg-[#F8FAFC] px-1.5 py-0.5 text-[13px] font-medium text-[#1A202C] outline-none"
          />
        ) : (
          <button
            onClick={() => setEditingName(true)}
            title="Click de doi ten"
            className="max-w-[200px] truncate text-[13px] font-medium text-[#1A202C] transition-colors hover:text-[#6366F1]"
          >
            {notebookName}
          </button>
        )}

        {notebook.isDirty ? <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#6366F1]" /> : null}
      </div>

      <div className="flex-1" />

      <span className="hidden shrink-0 text-[11px] text-[#A0AEC0] sm:block">
        {notebook.isSaving ? "Dang luu..." : notebook.lastSaved ? `Da luu ${formatRelative(notebook.lastSaved)}` : ""}
      </span>

      <div
        className={cn(
          "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
          kernel.connectionStatus === "error" ? "border-red-200 bg-red-50 text-red-600" : "border-[#E2E8F0] bg-[#F8FAFC] text-[#64748B]"
        )}
      >
        {kernel.connectionStatus === "connected" ? <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", kernelConfig.dot)} /> : <span className="h-1.5 w-1.5 rounded-full bg-red-400" />}
        <span>Python 3 · {kernelConfig.label}</span>
      </div>

      <div className="h-5 w-px shrink-0 bg-[#E2E8F0]" />

      <button
        onClick={onToggleRightSidebar}
        title="Datasets & Models"
        className={cn(
          "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-medium transition-colors",
          isRightSidebarOpen
            ? "border-[#6366F1]/30 bg-[#EEF2FF] text-[#6366F1]"
            : "border-transparent text-[#475569] hover:bg-[#F1F5F9]"
        )}
      >
        <Database size={14} />
        <span className="hidden sm:inline">Data</span>
      </button>

      <TopbarButton
        icon={notebook.isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
        label="Luu"
        shortcut="Ctrl+S"
        onClick={() => {
          void notebook.saveNotebook();
        }}
        disabled={!notebook.isDirty || notebook.isSaving}
      />

      {kernel.kernelStatus === "busy" ? <TopbarButton icon={<Square size={13} fill="currentColor" />} label="Dung" onClick={onInterrupt} variant="danger" /> : null}

      <TopbarButton
        icon={kernel.kernelStatus === "busy" ? <Loader2 size={14} className="animate-spin" /> : <Play size={13} fill="currentColor" />}
        label="Run"
        shortcut="Shift+Enter"
        onClick={onRunCell}
        disabled={!kernel.isReady}
        variant="primary"
      />

      <RunAllDropdown
        onRunAll={onRunAll}
        onRestartAndRunAll={async () => {
          await kernel.restartKernel();
          onRunAll();
        }}
        onClearOutputs={notebook.clearAllOutputs}
        disabled={!kernel.isReady}
      />
    </header>
  );
}

interface TopbarButtonProps {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "primary" | "danger";
}

function TopbarButton({ icon, label, shortcut, onClick, disabled, variant = "default" }: TopbarButtonProps): JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-all duration-100 disabled:cursor-not-allowed disabled:opacity-40",
        variant === "primary" && "bg-[#6366F1] text-white shadow-sm shadow-indigo-200 hover:bg-[#4F46E5] disabled:hover:bg-[#6366F1]",
        variant === "danger" && "border border-red-200 bg-red-50 text-red-600 hover:bg-red-100",
        variant === "default" && "border border-transparent text-[#475569] hover:border-[#E2E8F0] hover:bg-[#F1F5F9]"
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function RunAllDropdown({ onRunAll, onRestartAndRunAll, onClearOutputs, disabled }: { onRunAll: () => void; onRestartAndRunAll: () => void; onClearOutputs: () => void; disabled: boolean }): JSX.Element {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        className="flex items-center gap-1 rounded-md border border-[#E2E8F0] px-2 py-1.5 text-[12px] font-medium text-[#475569] transition-colors hover:bg-[#F1F5F9] disabled:opacity-40"
      >
        <ChevronDown size={13} />
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 w-52 rounded-lg border border-[#E2E8F0] bg-white py-1 text-[13px] text-[#1A202C] shadow-lg shadow-black/10">
            <DropdownItem icon="▶▶" label="Chay tat ca" onClick={() => { onRunAll(); setOpen(false); }} />
            <DropdownItem icon="⟳" label="Restart & Chay tat ca" onClick={() => { onRestartAndRunAll(); setOpen(false); }} />
            <div className="my-1 h-px bg-[#E2E8F0]" />
            <DropdownItem icon="✕" label="Xoa tat ca output" className="text-[#EF4444]" onClick={() => { onClearOutputs(); setOpen(false); }} />
          </div>
        </>
      ) : null}
    </div>
  );
}

function DropdownItem({ icon, label, onClick, className }: { icon: string; label: string; onClick: () => void; className?: string }): JSX.Element {
  return (
    <button onClick={onClick} className={cn("flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-[#F8FAFC]", className)}>
      <span className="w-4 text-center text-[11px]">{icon}</span>
      {label}
    </button>
  );
}

"use client";

import { AlertTriangle, Circle, Info, RotateCcw, Square, XCircle } from "lucide-react";
import { useMemo, useState } from "react";

export interface KernelStatusIndicatorProps {
  kernelStatus: "idle" | "busy" | "starting" | "dead";
  connectionStatus: "disconnected" | "connecting" | "connected" | "error";
  kernelName: string;
  onRestart: () => void;
  onInterrupt?: () => void;
  onViewKernelInfo?: () => void;
}

export function KernelStatusIndicator({
  kernelStatus,
  connectionStatus,
  kernelName,
  onRestart,
  onInterrupt,
  onViewKernelInfo
}: KernelStatusIndicatorProps): JSX.Element {
  const [open, setOpen] = useState<boolean>(false);

  const statusView = useMemo(() => {
    if (connectionStatus === "error") {
      return {
        label: "Loi ket noi",
        icon: <XCircle className="h-3.5 w-3.5 text-error-500" />,
        detail: "Error"
      };
    }

    if (connectionStatus === "disconnected" || connectionStatus === "connecting") {
      return {
        label: "Mat ket noi",
        icon: <AlertTriangle className="h-3.5 w-3.5 text-warning-500" />,
        detail: "Disconnected"
      };
    }

    if (kernelStatus === "busy") {
      return {
        label: "Python 3",
        icon: <RotateCcw className="h-3.5 w-3.5 animate-spin text-warning-500" />,
        detail: "Busy"
      };
    }

    if (kernelStatus === "starting") {
      return {
        label: "Python 3",
        icon: <Circle className="h-3.5 w-3.5 status-pulse text-text-tertiary" />,
        detail: "Starting"
      };
    }

    return {
      label: "Python 3",
      icon: <Circle className="h-3.5 w-3.5 fill-success-500 text-success-500" />,
      detail: "Idle"
    };
  }, [connectionStatus, kernelStatus]);

  return (
    <div className="relative">
      <button
        type="button"
        className="inline-flex h-8 items-center gap-2 rounded-full border border-border bg-bg-surface px-3 text-xs font-medium text-text-primary hover:bg-bg-elevated"
        onClick={() => setOpen((current) => !current)}
      >
        {statusView.icon}
        {statusView.label}
      </button>

      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-64 rounded-md border border-border bg-bg-surface p-2 shadow-md">
          <div className="px-2 py-1">
            <p className="text-sm font-medium text-text-primary">🐍 {kernelName}</p>
            <p className="text-xs text-text-secondary">Trang thai: {statusView.detail}</p>
          </div>

          <div className="my-1 h-px bg-border" />

          <button
            type="button"
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-bg-elevated"
            onClick={() => {
              setOpen(false);
              onRestart();
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" /> Restart Kernel
          </button>

          <button
            type="button"
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-bg-elevated disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!onInterrupt}
            onClick={() => {
              setOpen(false);
              onInterrupt?.();
            }}
          >
            <Square className="h-3.5 w-3.5" /> Interrupt Kernel
          </button>

          <div className="my-1 h-px bg-border" />

          <button
            type="button"
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-bg-elevated disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!onViewKernelInfo}
            onClick={() => {
              setOpen(false);
              onViewKernelInfo?.();
            }}
          >
            <Info className="h-3.5 w-3.5" /> Xem thong tin kernel
          </button>
        </div>
      ) : null}
    </div>
  );
}

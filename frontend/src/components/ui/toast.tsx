"use client";

import { motion } from "framer-motion";
import { X, CheckCircle, AlertTriangle, XCircle, Info, Loader2 } from "lucide-react";
import { Toaster as SonnerToaster, toast as sonnerToast } from "sonner";

// ─── Sonner re-exports (keep backward compat) ──────────────────────────────
/** Storybook: Toast viewport bound to design token palette. */
export function Toaster() {
  return (
    <SonnerToaster
      richColors
      closeButton
      theme="dark"
      toastOptions={{
        classNames: {
          toast: "!bg-bg-elevated !border !border-border !text-text-primary",
          description: "!text-text-secondary",
          actionButton: "!bg-accent !text-white",
          cancelButton: "!bg-bg-overlay !text-text-primary",
        },
      }}
    />
  );
}

export const toast = {
  success: (m: string, a?: { label: string; onClick: () => void }) =>
    sonnerToast.success(m, a ? { action: a } : {}),
  error: (m: string, a?: { label: string; onClick: () => void }) =>
    sonnerToast.error(m, a ? { action: a } : {}),
  warning: (m: string, a?: { label: string; onClick: () => void }) =>
    sonnerToast.warning(m, a ? { action: a } : {}),
  info: (m: string, a?: { label: string; onClick: () => void }) =>
    sonnerToast.info(m, a ? { action: a } : {}),
};

// ─── Custom Toast system (used by ToastProvider) ────────────────────────────
export type ToastVariant = "success" | "error" | "warning" | "info" | "loading";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
  duration?: number;
  action?: ToastAction;
}

interface ToastProps {
  item: ToastItem;
  remaining: number;
  progressPct: number;
  onClose: (id: string) => void;
  onPause: (id: string, paused: boolean) => void;
}

const icons: Record<ToastVariant, React.ReactNode> = {
  success: <CheckCircle className="h-4 w-4 text-green-400" />,
  error: <XCircle className="h-4 w-4 text-red-400" />,
  warning: <AlertTriangle className="h-4 w-4 text-yellow-400" />,
  info: <Info className="h-4 w-4 text-blue-400" />,
  loading: <Loader2 className="h-4 w-4 animate-spin text-text-secondary" />,
};

const borderColors: Record<ToastVariant, string> = {
  success: "border-green-500/30",
  error: "border-red-500/30",
  warning: "border-yellow-500/30",
  info: "border-blue-500/30",
  loading: "border-border",
};

const progressColors: Record<ToastVariant, string> = {
  success: "bg-green-500",
  error: "bg-red-500",
  warning: "bg-yellow-500",
  info: "bg-blue-500",
  loading: "bg-text-secondary",
};

export function Toast({ item, progressPct, onClose, onPause }: ToastProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -16, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.95 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={`relative w-80 overflow-hidden rounded-lg border bg-bg-elevated shadow-lg ${borderColors[item.variant]}`}
      onMouseEnter={() => onPause(item.id, true)}
      onMouseLeave={() => onPause(item.id, false)}
    >
      <div className="flex items-start gap-3 p-3">
        <span className="mt-0.5 shrink-0">{icons[item.variant]}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text-primary">{item.title}</p>
          {item.description && (
            <p className="mt-0.5 text-xs text-text-secondary">{item.description}</p>
          )}
          {item.action && (
            <button
              onClick={item.action.onClick}
              className="mt-1.5 text-xs font-medium text-accent hover:underline"
            >
              {item.action.label}
            </button>
          )}
        </div>
        <button
          onClick={() => onClose(item.id)}
          className="shrink-0 rounded p-0.5 text-text-tertiary transition-colors hover:bg-bg-overlay hover:text-text-primary"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {item.duration && item.duration > 0 && (
        <div className="h-0.5 w-full bg-bg-overlay">
          <div
            className={`h-full transition-all ${progressColors[item.variant]}`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}
    </motion.div>
  );
}

import { Check, Clock3, Loader2, OctagonX, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { RunStatus } from "@/types/mlflow";

const RUN_STATUS_CONFIG: Record<
  RunStatus,
  {
    label: string;
    root: string;
    icon: string;
    Icon: typeof Loader2;
    spin?: boolean;
  }
> = {
  RUNNING: {
    label: "Running",
    root: "bg-amber-50 text-run-running",
    icon: "text-run-running",
    Icon: Loader2,
    spin: true
  },
  FINISHED: {
    label: "Finished",
    root: "bg-emerald-50 text-run-finished",
    icon: "text-run-finished",
    Icon: Check
  },
  FAILED: {
    label: "Failed",
    root: "bg-red-50 text-run-failed",
    icon: "text-run-failed",
    Icon: X
  },
  KILLED: {
    label: "Killed",
    root: "bg-violet-50 text-run-killed",
    icon: "text-run-killed",
    Icon: OctagonX
  },
  SCHEDULED: {
    label: "Scheduled",
    root: "bg-slate-100 text-slate-600",
    icon: "text-slate-500",
    Icon: Clock3
  }
};

export function RunStatusBadge({ status, size = "md" }: { status: RunStatus; size?: "sm" | "md" | "lg" }) {
  const item = RUN_STATUS_CONFIG[status];
  const sizeClass = size === "sm" ? "text-[11px] px-2 py-0.5" : size === "lg" ? "text-sm px-3 py-1.5" : "text-xs px-2.5 py-1";
  const iconSize = size === "sm" ? 12 : size === "lg" ? 15 : 14;

  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full font-medium", item.root, sizeClass)}>
      <item.Icon className={cn(item.icon, item.spin && "animate-spin")} size={iconSize} />
      {item.label}
    </span>
  );
}

import { cn } from "@/lib/utils/cn";
import type { WorkspaceStatus } from "@/types/workspace";

const mapping: Record<
  WorkspaceStatus,
  {
    label: string;
    className: string;
    pulse: boolean;
  }
> = {
  READY: {
    label: "Ready",
    className: "bg-success-50 text-success-500",
    pulse: false
  },
  PROVISIONING: {
    label: "Ready",
    className: "bg-success-50 text-success-500",
    pulse: false
  },
  RUNNING: {
    label: "Running",
    className: "bg-success-50 text-success-500",
    pulse: true
  },
  STOPPING: {
    label: "Ready",
    className: "bg-success-50 text-success-500",
    pulse: false
  },
  STOPPED: {
    label: "Ready",
    className: "bg-success-50 text-success-500",
    pulse: false
  },
  ERROR: {
    label: "Error",
    className: "bg-error-50 text-error-500",
    pulse: false
  }
};

export function StatusBadge({ status }: { status: WorkspaceStatus }) {
  const item = mapping[status];
  const displayStatus = item.label.toUpperCase();

  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", item.className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", displayStatus === "ERROR" ? "bg-error-500" : "bg-success-500", item.pulse && "status-pulse")} />
      {item.label}
    </span>
  );
}

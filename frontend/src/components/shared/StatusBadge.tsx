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
  PROVISIONING: {
    label: "Đang khởi động",
    className: "bg-warning-50 text-warning-500",
    pulse: true
  },
  RUNNING: {
    label: "Đang chạy",
    className: "bg-success-50 text-success-500",
    pulse: true
  },
  STOPPING: {
    label: "Đang dừng",
    className: "bg-warning-50 text-warning-500",
    pulse: true
  },
  STOPPED: {
    label: "Đã dừng",
    className: "bg-bg-elevated text-text-secondary",
    pulse: false
  },
  ERROR: {
    label: "Lỗi",
    className: "bg-error-50 text-error-500",
    pulse: false
  }
};

export function StatusBadge({ status }: { status: WorkspaceStatus }) {
  const item = mapping[status];

  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", item.className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", status === "ERROR" ? "bg-error-500" : status === "RUNNING" ? "bg-success-500" : status === "STOPPED" ? "bg-text-tertiary" : "bg-warning-500", item.pulse && "status-pulse")} />
      {item.label}
    </span>
  );
}

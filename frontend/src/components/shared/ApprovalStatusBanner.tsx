import { AlertTriangle, CheckCircle2, Hourglass, XCircle } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";

export interface ApprovalStatusBannerProps {
  status: ApprovalStatus;
  reviewer?: string;
  remaining?: string;
  approvedAgo?: string;
  reason?: string;
  className?: string;
}

const STATUS_CONFIG: Record<
  ApprovalStatus,
  {
    icon: typeof Hourglass;
    root: string;
    iconClass: string;
    buildMessage: (props: ApprovalStatusBannerProps) => string;
  }
> = {
  PENDING: {
    icon: Hourglass,
    root: "bg-amber-50 border-amber-200 text-amber-800",
    iconClass: "text-amber-600",
    buildMessage: ({ reviewer, remaining }) =>
      `Pending approval${reviewer ? ` from @${reviewer}` : ""}${remaining ? ` · ${remaining} remaining` : ""}`
  },
  APPROVED: {
    icon: CheckCircle2,
    root: "bg-emerald-50 border-emerald-200 text-emerald-800",
    iconClass: "text-emerald-600",
    buildMessage: ({ reviewer, approvedAgo }) =>
      `Approved${reviewer ? ` by @${reviewer}` : ""}${approvedAgo ? ` · ${approvedAgo}` : ""}`
  },
  REJECTED: {
    icon: XCircle,
    root: "bg-red-50 border-red-200 text-red-800",
    iconClass: "text-red-600",
    buildMessage: ({ reason }) => `Rejected${reason ? `: "${reason}"` : ""}`
  },
  EXPIRED: {
    icon: AlertTriangle,
    root: "bg-slate-100 border-slate-200 text-slate-700",
    iconClass: "text-slate-500",
    buildMessage: () => "Request expired · Create a new request"
  }
};

export function ApprovalStatusBanner(props: ApprovalStatusBannerProps) {
  const config = STATUS_CONFIG[props.status];
  const Icon = config.icon;

  return (
    <div className={cn("flex items-start gap-2.5 rounded-md border px-3 py-2 text-sm font-medium", config.root, props.className)}>
      <Icon size={16} className={cn("mt-0.5 shrink-0", config.iconClass)} />
      <span>{config.buildMessage(props)}</span>
    </div>
  );
}

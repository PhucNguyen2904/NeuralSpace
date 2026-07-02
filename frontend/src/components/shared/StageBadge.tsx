import { cn } from "@/lib/utils/cn";
import type { Stage } from "@/types/mlflow";

const STAGE_CONFIG: Record<
  Stage,
  {
    label: string;
    dot: string;
    bg: string;
    text: string;
    pulse?: boolean;
  }
> = {
  None: {
    label: "Development",
    dot: "bg-stage-none",
    bg: "bg-slate-100",
    text: "text-slate-600"
  },
  Staging: {
    label: "Staging",
    dot: "bg-stage-staging",
    bg: "bg-blue-50",
    text: "text-blue-700"
  },
  Production: {
    label: "Production",
    dot: "bg-stage-production",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    pulse: true
  },
  Archived: {
    label: "Archived",
    dot: "bg-stage-archived",
    bg: "bg-slate-50",
    text: "text-slate-500"
  }
};

const SIZE_CONFIG = {
  sm: { root: "px-2 py-0.5 text-[11px]", dot: "h-1.5 w-1.5" },
  md: { root: "px-2.5 py-1 text-xs", dot: "h-2 w-2" },
  lg: { root: "px-3 py-1.5 text-sm", dot: "h-2.5 w-2.5" }
} as const;

export function StageBadge({ stage, size = "md" }: { stage: Stage; size?: "sm" | "md" | "lg" }) {
  const item = STAGE_CONFIG[stage];
  const sizeClass = SIZE_CONFIG[size];

  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full font-medium", item.bg, item.text, sizeClass.root)}>
      <span className={cn("rounded-full", item.dot, sizeClass.dot, item.pulse && "status-pulse")} />
      {item.label}
    </span>
  );
}

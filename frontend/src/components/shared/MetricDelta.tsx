import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface MetricDeltaProps {
  value: number;
  baseline: number;
  format?: "percent" | "absolute";
  higherIsBetter?: boolean;
}

function formatChange(value: number, format: "percent" | "absolute") {
  if (format === "absolute") return value.toFixed(4);
  return `${value.toFixed(1)}%`;
}

export function MetricDelta({ value, baseline, format = "percent", higherIsBetter = true }: MetricDeltaProps) {
  const rawDelta = format === "percent" ? (baseline === 0 ? 0 : ((value - baseline) / Math.abs(baseline)) * 100) : value - baseline;
  const normalized = higherIsBetter ? rawDelta : -rawDelta;
  const isNeutral = Math.abs(rawDelta) < 0.0001;
  const isPositive = !isNeutral && normalized > 0;
  const display = `${rawDelta > 0 ? "+" : ""}${formatChange(rawDelta, format)}`;

  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", isNeutral ? "text-slate-500" : isPositive ? "text-emerald-600" : "text-red-600")}>
      {isNeutral ? <Minus size={13} /> : isPositive ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
      {display}
    </span>
  );
}

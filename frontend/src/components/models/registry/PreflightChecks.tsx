import { AlertTriangle, CheckCircle2, Loader2, XCircle } from "lucide-react";
import type { PreflightCheckItem } from "@/lib/hooks/useModelRegistry";

export function PreflightChecks({ checks }: { checks: PreflightCheckItem[] }) {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-bg-elevated p-3">
      {checks.map((check) => (
        <div key={check.key} className="flex items-start gap-2 text-sm">
          {check.state === "running" ? <Loader2 size={15} className="mt-0.5 animate-spin text-amber-600" /> : null}
          {check.state === "pass" ? <CheckCircle2 size={15} className="mt-0.5 text-emerald-600" /> : null}
          {check.state === "warn" ? <AlertTriangle size={15} className="mt-0.5 text-amber-600" /> : null}
          {check.state === "fail" ? <XCircle size={15} className="mt-0.5 text-red-600" /> : null}
          <div>
            <p className="font-medium">{check.label}</p>
            {check.detail ? <p className="text-xs text-text-secondary">{check.detail}</p> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

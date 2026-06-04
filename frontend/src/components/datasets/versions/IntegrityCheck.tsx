import { CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import { Button } from "@/components/ui";
import type { IntegrityCheckResult } from "@/lib/hooks/useDatasetVersions";

interface IntegrityCheckProps {
  lastCheckedAt: string;
  checks: IntegrityCheckResult[];
  onRecheck: () => void;
  checking?: boolean;
}

export function IntegrityCheck({ lastCheckedAt, checks, onRecheck, checking = false }: IntegrityCheckProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-secondary">Last checked: {lastCheckedAt}</p>
        <Button size="sm" variant="outline" loading={checking} onClick={onRecheck}>
          {!checking ? <RotateCcw size={14} /> : null}
          Re-check now
        </Button>
      </div>
      <div className="space-y-2 rounded-lg border border-border p-3">
        {checks.map((check) => (
          <div key={check.key} className="flex items-start gap-2 text-sm">
            {check.passed ? (
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
            ) : (
              <XCircle size={16} className="mt-0.5 shrink-0 text-red-600" />
            )}
            <div>
              <p className="font-medium">{check.label}</p>
              {!check.passed && check.message ? (
                <p className="text-xs text-red-600">
                  {check.message} <button className="ml-1 underline">Report issue</button>
                </p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

import { CheckCircle2, Loader2 } from "lucide-react";
import type { TrackProgressStep } from "@/lib/hooks/useDatasetVersions";

interface TrackProgressUIProps {
  steps: TrackProgressStep[];
}

export function TrackProgressUI({ steps }: TrackProgressUIProps) {
  return (
    <div className="rounded-lg border border-border bg-bg-elevated p-3">
      <p className="mb-2 text-sm font-medium">Track progress</p>
      <div className="space-y-2">
        {steps.map((step) => (
          <div key={step.key} className="flex items-center gap-2 text-sm">
            {step.status === "done" ? (
              <CheckCircle2 size={16} className="text-emerald-600" />
            ) : step.status === "running" ? (
              <Loader2 size={16} className="animate-spin text-amber-600" />
            ) : (
              <span className="inline-block h-4 w-4 rounded-full border border-border" />
            )}
            <span>{step.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

import { StageBadge } from "@/components/shared";
import type { RegistryModelVersion } from "@/lib/hooks/useModelRegistry";

interface VersionTimelineProps {
  versions: RegistryModelVersion[];
  onViewVersion: (version: string) => void;
  onRollback: (version: string) => void;
}

export function VersionTimeline({ versions, onViewVersion, onRollback }: VersionTimelineProps) {
  return (
    <div className="relative pl-6">
      <div className="absolute bottom-1 left-[11px] top-1 w-px border-l-2 border-dashed border-slate-200" />
      <div className="space-y-4">
        {versions.map((item) => (
          <div key={item.id} className="relative rounded-md border border-border bg-bg-surface p-3">
            <span
              className={
                item.stage === "Production"
                  ? "status-pulse absolute -left-[19px] top-4 h-3.5 w-3.5 rounded-full bg-emerald-500"
                  : item.stage === "Staging"
                    ? "absolute -left-[19px] top-4 h-3.5 w-3.5 rounded-full bg-blue-500"
                    : "absolute -left-[19px] top-4 h-3.5 w-3.5 rounded-full border-2 border-slate-300 bg-white"
              }
            />
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-base font-semibold">{item.version}</p>
              <StageBadge stage={item.stage} size="sm" />
            </div>
            <p className="mt-1 text-sm">
              Accuracy: {item.accuracy.toFixed(3)} {item.version === "v1.3" ? "↑+2.1%" : ""}
            </p>
            <p className="text-sm text-text-secondary">Trained on: {item.datasetName} {item.datasetVersion}</p>
            {item.promotedAgo ? <p className="text-sm text-text-secondary">Promoted: {item.promotedAgo} bởi {item.promotedBy}</p> : null}
            <div className="mt-2 flex gap-2 text-sm">
              <button className="text-brand-600 hover:underline" onClick={() => onViewVersion(item.version)}>View Details</button>
              {item.stage === "Production" ? <button className="text-amber-700 hover:underline" onClick={() => onRollback(item.version)}>Rollback</button> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

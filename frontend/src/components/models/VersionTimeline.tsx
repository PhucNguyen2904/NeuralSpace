"use client";

import { formatDistanceToNow } from "date-fns";
import type { ModelVersion } from "@/types/model";

export function VersionTimeline({ versions }: { versions: ModelVersion[] }) {
  return (
    <div className="relative pl-6">
      <div className="absolute left-[11.5px] top-1 bottom-1 w-px bg-violet-200" />
      <div className="space-y-4">
        {versions.map((v) => (
          <div key={v.id} className="relative">
            <span className={`absolute -left-[18px] top-1.5 h-3 w-3 rounded-full border-2 ${v.current ? "border-violet-500 bg-violet-500" : "border-violet-500 bg-white"}`} />
            <p className="text-sm font-semibold text-text-primary">{v.version} {v.current ? "(Current)" : ""}</p>
            <p className="text-sm text-text-secondary">{v.note}</p>
            <p className="text-xs text-text-tertiary">{formatDistanceToNow(new Date(v.created_at), { addSuffix: true })}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

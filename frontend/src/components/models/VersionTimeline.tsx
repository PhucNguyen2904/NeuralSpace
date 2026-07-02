"use client";

import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import type { ModelVersion } from "@/types/model";

export function VersionTimeline({ versions, modelName }: { versions: ModelVersion[]; modelName: string }) {
  return (
    <div className="relative pl-6">
      <div className="absolute left-[11.5px] top-1 bottom-1 w-px bg-violet-200" />
      <div className="space-y-4">
        {versions.map((v) => (
          <div key={v.id} className="relative rounded-md border border-border bg-bg-surface p-3">
            <span className={`absolute -left-[24px] top-4 h-3 w-3 rounded-full border-2 ${v.current ? "border-violet-500 bg-violet-500" : "border-violet-500 bg-white"}`} />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-text-primary">{v.version} {v.current ? "(Current)" : ""}</p>
                <p className="text-xs text-text-tertiary">{formatDistanceToNow(new Date(v.created_at), { addSuffix: true })}</p>
              </div>
            </div>
            <p className="mt-2 text-sm text-text-secondary">{v.note}</p>
            <div className="mt-3 flex gap-2">
              <Link href={`/models/${encodeURIComponent(modelName)}/versions/${encodeURIComponent(v.version.replace(/^v/, ""))}`} className="text-xs text-brand-600 hover:underline">
                View Details & Approval
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { motion } from "framer-motion";
import { GitBranch, Clock, ArrowRight, CheckCircle2, User } from "lucide-react";
import type { ModelVersion } from "@/types/model";

export function VersionTimeline({ versions, modelName }: { versions: ModelVersion[]; modelName: string }) {
  if (!versions?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-text-tertiary">
        <GitBranch className="mb-3 h-10 w-10 text-violet-200" />
        <p className="text-sm">No versions available for this model.</p>
      </div>
    );
  }

  return (
    <div className="relative py-2 pl-6">
      <div className="absolute bottom-4 left-[11.5px] top-4 w-px bg-violet-100" />
      <div className="space-y-6">
        {versions.map((v, i) => (
          <motion.div 
            key={v.id} 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="relative"
          >
            {/* Timeline Dot */}
            <span className={`absolute -left-[29px] top-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 bg-white ${v.current ? "border-violet-500 text-violet-500" : "border-violet-200 text-violet-200"}`}>
              {v.current ? (
                <CheckCircle2 size={12} className="text-violet-500" />
              ) : (
                <div className="h-1.5 w-1.5 rounded-full bg-violet-200" />
              )}
            </span>
            
            <div className={`group rounded-xl border p-4 transition-all hover:shadow-sm ${v.current ? "border-violet-200 bg-violet-50/50" : "border-border bg-white"}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <h4 className="text-[15px] font-semibold text-text-primary">
                      {v.version}
                    </h4>
                    {v.current && (
                      <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-[11px] font-medium text-violet-700">
                        Current
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-text-tertiary">
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      {formatDistanceToNow(new Date(v.created_at), { addSuffix: true })}
                    </span>
                    {v.created_by && (
                      <span className="flex items-center gap-1">
                        <User size={12} />
                        {v.created_by}
                      </span>
                    )}
                  </div>
                </div>
                <Link 
                  href={`/models/${encodeURIComponent(modelName)}/versions/${encodeURIComponent(v.version.replace(/^v/, ""))}`} 
                  className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-100"
                >
                  View Details
                  <ArrowRight size={14} />
                </Link>
              </div>
              {v.note && (
                <div className="mt-3 border-t border-border/50 pt-3 text-[13px] leading-relaxed text-text-secondary">
                  {v.note}
                </div>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

"use client";

import { motion } from "framer-motion";
import { ArrowRight, RotateCcw, Activity, Database, Clock, User, CheckCircle2 } from "lucide-react";
import { StageBadge } from "@/components/shared";
import type { RegistryModelVersion } from "@/lib/hooks/useModelRegistry";
import { cn } from "@/lib/utils/cn";

interface VersionTimelineProps {
  versions: RegistryModelVersion[];
  onViewVersion: (version: string) => void;
  onRollback: (version: string) => void;
}

export function VersionTimeline({ versions, onViewVersion, onRollback }: VersionTimelineProps) {
  if (!versions?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-text-tertiary">
        <Activity className="mb-3 h-10 w-10 text-violet-200" />
        <p className="text-sm">No versions available in registry.</p>
      </div>
    );
  }

  return (
    <div className="relative py-2 pl-6">
      <div className="absolute bottom-4 left-[11.5px] top-4 w-px bg-violet-100" />
      <div className="space-y-6">
        {versions.map((item, i) => {
          const isProd = item.stage === "Production";
          const isStaging = item.stage === "Staging";
          
          return (
            <motion.div 
              key={item.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="relative"
            >
              <span
                className={cn(
                  "absolute -left-[29px] top-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 bg-white",
                  isProd ? "border-emerald-500 text-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.1)]" : 
                  isStaging ? "border-blue-500 text-blue-500 shadow-[0_0_0_4px_rgba(59,130,246,0.1)]" : 
                  "border-slate-200 text-slate-300"
                )}
              >
                {isProd || isStaging ? <CheckCircle2 size={12} className={isProd ? "text-emerald-500" : "text-blue-500"} /> : <div className="h-1.5 w-1.5 rounded-full bg-slate-200" />}
              </span>

              <div className={cn(
                "group rounded-xl border p-4 transition-all hover:shadow-sm",
                isProd ? "border-emerald-200 bg-emerald-50/30" : 
                isStaging ? "border-blue-200 bg-blue-50/30" : 
                "border-border bg-white"
              )}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <h4 className="text-[16px] font-semibold text-text-primary">{item.version}</h4>
                      <StageBadge stage={item.stage} size="sm" />
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm text-text-secondary">
                      <div className="flex items-center gap-1.5">
                        <Activity size={14} className="text-violet-500" />
                        <span>Accuracy: <strong className="text-text-primary">{item.accuracy.toFixed(3)}</strong></span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Database size={14} className="text-blue-500" />
                        <span>{item.datasetName} <span className="text-xs opacity-75">{item.datasetVersion}</span></span>
                      </div>
                      
                      {item.promotedAgo && (
                        <div className="flex items-center gap-1.5 sm:col-span-2 text-xs text-text-tertiary">
                          <Clock size={12} />
                          <span>Promoted {item.promotedAgo}</span>
                          {item.promotedBy && (
                            <>
                              <span className="mx-1">•</span>
                              <User size={12} />
                              <span>{item.promotedBy}</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {isProd && (
                      <button 
                        onClick={() => onRollback(item.version)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 hover:text-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-200"
                      >
                        <RotateCcw size={14} />
                        Rollback
                      </button>
                    )}
                    <button 
                      onClick={() => onViewVersion(item.version)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-100"
                    >
                      View Details
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

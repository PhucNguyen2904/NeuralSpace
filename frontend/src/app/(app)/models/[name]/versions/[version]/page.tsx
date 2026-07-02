"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Box, Clock, GitCommit, ListTree, Target, Activity, FileJson, Hash } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { MetricDelta, StageBadge } from "@/components/shared";
import { PromoteModal } from "@/components/models/registry/PromoteModal";
import { useModelVersions } from "@/lib/hooks/useModelRegistry";
import { cn } from "@/lib/utils/cn";

type Tab = "overview" | "lineage" | "audit";

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default function ModelVersionDetailPage() {
  const params = useParams<{ name: string; version: string }>();
  const router = useRouter();
  const modelName = safeDecode(params?.name ?? "");
  const versionParam = safeDecode(params?.version ?? "");
  const normalized = versionParam.startsWith("v") ? versionParam : `v${versionParam}`;
  const [tab, setTab] = useState<Tab>("overview");
  const [promoteOpen, setPromoteOpen] = useState(false);
  const versions = useModelVersions(modelName);

  const current = useMemo(
    () => (versions.data ?? []).find((item) => item.version === normalized) ?? versions.data?.[0],
    [normalized, versions.data]
  );

  if (!current) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-3">
          <button 
            onClick={() => router.push(`/models/${encodeURIComponent(modelName)}`)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-text-tertiary transition-colors hover:text-text-primary"
          >
            <ArrowLeft size={16} /> Back to versions
          </button>
          
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-text-primary">{modelName}</h1>
            <span className="flex items-center gap-1.5 rounded-md bg-violet-50 px-2 py-0.5 text-lg font-semibold text-violet-700">
              {current.version}
            </span>
            <StageBadge stage={current.stage} />
          </div>
        </div>

        <button 
          onClick={() => setPromoteOpen(true)}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
        >
          <Target size={16} />
          Promote Stage
        </button>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        <TabButton label="Overview" icon={<Box size={14} />} active={tab === "overview"} onClick={() => setTab("overview")} />
        <TabButton label="Lineage" icon={<ListTree size={14} />} active={tab === "lineage"} onClick={() => setTab("lineage")} />
        <TabButton label="Audit Trail" icon={<Clock size={14} />} active={tab === "audit"} onClick={() => setTab("audit")} />
      </div>

      {/* Content */}
      {tab === "overview" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid gap-6 lg:grid-cols-2">
          {/* Metrics Card */}
          <section className="rounded-xl border border-border bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2 border-b border-border pb-3">
              <Activity className="text-violet-500" size={18} />
              <h3 className="font-semibold text-text-primary">Performance Metrics</h3>
            </div>
            
            <div className="mb-6">
              <p className="text-sm font-medium text-text-secondary">Primary Metric</p>
              <div className="mt-1 flex items-end gap-3">
                <span className="text-3xl font-bold text-text-primary">
                  {(current.accuracy ?? 0).toFixed(4)}
                </span>
                <div className="mb-1">
                  <MetricDelta value={current.accuracy ?? 0} baseline={0.903} format="percent" />
                </div>
              </div>
              <p className="text-[13px] text-text-tertiary">Accuracy on primary validation set</p>
            </div>

            <div className="grid grid-cols-3 gap-4 rounded-lg bg-bg-surface p-4">
              <div>
                <p className="text-[12px] font-medium text-text-tertiary">Loss</p>
                <p className="mt-0.5 font-semibold text-text-primary">{(current.loss ?? 0).toFixed(4)}</p>
              </div>
              <div>
                <p className="text-[12px] font-medium text-text-tertiary">F1 Score</p>
                <p className="mt-0.5 font-semibold text-text-primary">{(current.f1 ?? 0).toFixed(4)}</p>
              </div>
              <div>
                <p className="text-[12px] font-medium text-text-tertiary">mAP50</p>
                <p className="mt-0.5 font-semibold text-text-primary">{(current.map50 ?? 0).toFixed(4)}</p>
              </div>
            </div>
          </section>

          {/* Metadata Card */}
          <section className="rounded-xl border border-border bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2 border-b border-border pb-3">
              <FileJson className="text-blue-500" size={18} />
              <h3 className="font-semibold text-text-primary">Version Metadata</h3>
            </div>
            
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-1 text-[13px] font-medium text-text-tertiary">Training Dataset</div>
                <div className="col-span-2 flex items-center gap-2 text-[13px] text-text-primary">
                  <span className="font-medium text-brand-600 hover:underline cursor-pointer">{current.datasetName}</span>
                  <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{current.datasetVersion}</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-1 text-[13px] font-medium text-text-tertiary">MLflow Run</div>
                <div className="col-span-2">
                  <a href={`/experiments`} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-600 hover:underline">
                    <Hash size={13} />
                    {current.runId}
                  </a>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-1 text-[13px] font-medium text-text-tertiary">Git Branch</div>
                <div className="col-span-2 flex items-center gap-1.5 text-[13px] text-text-primary">
                  <GitCommit size={14} className="text-text-tertiary" />
                  main
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-1 text-[13px] font-medium text-text-tertiary">Uploaded By</div>
                <div className="col-span-2 text-[13px] text-text-primary">
                  {current.promotedBy || "System Admin"}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-1 text-[13px] font-medium text-text-tertiary">Last Promoted</div>
                <div className="col-span-2 text-[13px] text-text-primary">
                  {current.promotedAgo ? `${current.promotedAgo}` : "Never promoted"}
                </div>
              </div>
            </div>
          </section>

          {/* Dataset section from original */}
          <section className="rounded-xl border border-border bg-white p-5 shadow-sm lg:col-span-2">
            <p className="text-sm font-medium">Trained on dataset</p>
            <p className="mt-1">📊 {current.datasetName} {current.datasetVersion}</p>
            <p className="text-sm text-text-secondary">Hash: {current.datasetHash}</p>
            <div className="mt-2 flex gap-3">
              <a href="/datasets" className="text-sm text-brand-600 hover:underline">View Datasets</a>
              <button className="text-sm text-text-secondary hover:underline">Check Integrity</button>
            </div>
          </section>
        </motion.div>
      )}

      {tab === "lineage" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex min-h-[200px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-bg-surface p-8 text-center">
          <ListTree className="mb-3 h-10 w-10 text-slate-300" />
          <h3 className="text-sm font-semibold text-text-primary">No Lineage Data</h3>
          <p className="mt-1 text-xs text-text-tertiary">Lineage graph mapping datasets, experiments, and this version is not available yet.</p>
        </motion.div>
      )}

      {tab === "audit" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-border bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2 border-b border-border pb-3">
            <Clock className="text-violet-500" size={18} />
            <h3 className="font-semibold text-text-primary">Audit Log</h3>
          </div>
          <div className="space-y-4">
            {current.auditTrail?.length ? current.auditTrail.map((item, idx) => (
              <div key={`${item.at}-${idx}`} className="flex items-start gap-3">
                <div className="mt-1 h-2 w-2 rounded-full bg-violet-400" />
                <div>
                  <p className="text-sm text-text-primary">
                    <span className="font-semibold">{item.actor}</span> {item.action}
                  </p>
                  <p className="text-xs text-text-tertiary">{item.at}</p>
                </div>
              </div>
            )) : (
              <p className="text-sm text-text-tertiary">No audit logs recorded for this version.</p>
            )}
          </div>
        </motion.div>
      )}

      {promoteOpen && (
        <PromoteModal
          open={promoteOpen}
          onClose={() => setPromoteOpen(false)}
          modelName={modelName}
          version={current.version}
          currentStage={current.stage}
          accuracy={current.accuracy}
          loss={current.loss}
        />
      )}
    </div>
  );
}

function TabButton({ label, icon, active, onClick }: { label: string; icon: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none",
        active
          ? "border-violet-600 text-violet-700"
          : "border-transparent text-text-secondary hover:border-slate-300 hover:text-text-primary"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

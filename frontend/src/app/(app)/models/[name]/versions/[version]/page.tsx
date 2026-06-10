"use client";

import { useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { ApprovalStatusBanner, MetricDelta, StageBadge } from "@/components/shared";
import { PromoteModal } from "@/components/models/registry/PromoteModal";
import { useModelVersions } from "@/lib/hooks/useModelRegistry";

type Tab = "overview" | "lineage" | "audit";

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
  if (!current) return null;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center gap-3">
        <button className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-bg-elevated" onClick={() => router.push(`/models/${encodeURIComponent(modelName)}`)}>
          <ArrowLeft size={15} /> Back
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold">{modelName}</h1>
          <span className="text-lg font-medium">{current.version}</span>
          <StageBadge stage={current.stage} />
        </div>
        <button className="ml-auto rounded-md border border-border px-3 py-1.5 text-sm hover:bg-bg-elevated" onClick={() => setPromoteOpen(true)}>
          Rollback/Promote
        </button>
      </header>

      {current.approvalStatus ? (
        <ApprovalStatusBanner
          status={current.approvalStatus}
          reviewer={current.approvalReviewer}
          reason={current.approvalReason}
          approvedAgo={current.approvalStatus === "APPROVED" ? "2h trước" : undefined}
          remaining={current.approvalStatus === "PENDING" ? "23h" : undefined}
        />
      ) : null}

      <div className="flex gap-2 border-b border-border pb-2">
        <TabButton label="Overview" active={tab === "overview"} onClick={() => setTab("overview")} />
        <TabButton label="Lineage" active={tab === "lineage"} onClick={() => setTab("lineage")} />
        <TabButton label="Audit Trail" active={tab === "audit"} onClick={() => setTab("audit")} />
      </div>

      {tab === "overview" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-md border border-border bg-bg-surface p-4">
            <p className="text-sm font-medium">Metrics</p>
            <p className="mt-2 text-sm">Primary: Accuracy {current.accuracy.toFixed(3)} <MetricDelta value={current.accuracy} baseline={0.903} format="percent" /></p>
            <p className="text-sm text-text-secondary">Loss {current.loss}, F1 {current.f1}, mAP {current.map50}</p>
            <a href={`/experiments`} className="mt-2 inline-block text-sm text-brand-600 hover:underline">Training run: {current.runId}</a>
          </section>
          <section className="rounded-md border border-border bg-bg-surface p-4">
            <p className="text-sm font-medium">Metadata</p>
            <Info label="Version" value={current.version.replace(/^v/, "")} />
            <Info label="Stage" value={current.stage} />
            <Info label="Registered" value={current.registeredAt} />
            <Info label="Approved by" value={current.approvalReviewer ? `@${current.approvalReviewer}` : "-"} />
            <Info label="Size" value={current.size} />
            <Info label="Framework" value={current.frameworkVersion} />
            <Info label="Git commit" value={current.gitCommit} />
          </section>
          <section className="rounded-md border border-border bg-bg-surface p-4 lg:col-span-2">
            <p className="text-sm font-medium">Trained on dataset</p>
            <p className="mt-1">📊 {current.datasetName} {current.datasetVersion}</p>
            <p className="text-sm text-text-secondary">18.7 GB • 118K items • {current.datasetHash}</p>
            <div className="mt-2 flex gap-3">
              <a href="/datasets/dataset_1" className="text-sm text-brand-600 hover:underline">View Dataset</a>
              <button className="text-sm text-text-secondary hover:underline">Check Integrity</button>
            </div>
          </section>
        </div>
      ) : null}

      {tab === "lineage" ? <Placeholder text="Lineage graph preview (UI-05) embedded tại đây." /> : null}
      {tab === "audit" ? (
        <div className="rounded-md border border-border bg-bg-surface p-4">
          <div className="space-y-2 text-sm">
            {current.auditTrail.map((item) => (
              <p key={`${item.at}-${item.action}`}>
                <span className="text-text-secondary">{item.at}</span> <strong>{item.actor}</strong> {item.action}
              </p>
            ))}
          </div>
        </div>
      ) : null}

      <PromoteModal
        open={promoteOpen}
        onClose={() => setPromoteOpen(false)}
        modelName={modelName}
        version={current.version}
        accuracy={current.accuracy}
        loss={current.loss}
      />
    </div>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={active ? "rounded-md bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-600" : "rounded-md px-3 py-1.5 text-sm text-text-secondary"}>
      {label}
    </button>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <p className="mt-1 text-sm"><span className="text-text-tertiary">{label}: </span><span>{value}</span></p>;
}

function Placeholder({ text }: { text: string }) {
  return <div className="rounded-md border border-border bg-bg-surface p-4 text-sm text-text-secondary">{text}</div>;
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

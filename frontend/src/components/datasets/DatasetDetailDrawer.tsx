"use client";

import { formatDistanceToNow } from "date-fns";
import { motion } from "framer-motion";
import { ExternalLink, X } from "lucide-react";
import * as React from "react";
import { Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ClassDistributionChart } from "@/components/datasets/ClassDistributionChart";
import { Button } from "@/components/ui";
import { useDatasetDetail } from "@/lib/hooks/useDatasets";
import type { Dataset } from "@/types/dataset";

type TabValue = "overview" | "preview" | "distribution" | "history";

export function DatasetDetailDrawer({
  datasetId,
  open,
  onClose,
  onUse
}: {
  datasetId: string | null;
  open: boolean;
  onClose: () => void;
  onUse: (dataset: Dataset, workspaceId: string) => void;
}) {
  const { detail, preview } = useDatasetDetail(datasetId ?? "");
  const dataset = detail.data;
  const [tab, setTab] = React.useState<TabValue>("overview");
  const [workspaceId, setWorkspaceId] = React.useState("ws_resnet");

  React.useEffect(() => {
    if (!open) setTab("overview");
  }, [open]);

  if (!open || !dataset) return null;

  return (
    <div className="fixed inset-0 z-50">
      <motion.button initial={{ opacity: 0 }} animate={{ opacity: 0.3 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black backdrop-blur-sm" onClick={onClose} />
      <motion.aside initial={{ x: "100%" }} animate={{ x: 0 }} transition={{ duration: 0.25, ease: "easeOut" }} className="absolute right-0 top-0 h-full w-full max-w-[520px] overflow-hidden border-l border-border bg-bg-surface md:w-[520px]">
        <div className="flex items-start justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-xl font-bold text-text-primary">{dataset.name}</h2>
            <span className="rounded-full bg-[#ECFDF5] px-2 py-1 text-xs text-emerald-700">{dataset.label_status}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost">Open in Upstream <ExternalLink size={14} /></Button>
            <Button size="sm" className="bg-[#ECFDF5] text-emerald-700 hover:bg-[#D1FAE5]" onClick={() => onUse(dataset, workspaceId)}>Use in Workspace</Button>
            <Button size="sm" variant="ghost" onClick={onClose}><X size={16} /></Button>
          </div>
        </div>
        <div className="border-b border-border px-5 py-2">
          <div className="flex gap-2 text-sm">
            {(["overview", "preview", "distribution", "history"] as TabValue[]).map((item) => (
              <button key={item} onClick={() => setTab(item)} className={tab === item ? "rounded-md bg-[#ECFDF5] px-2 py-1 font-medium text-emerald-700" : "rounded-md px-2 py-1 text-text-secondary"}>
                {item.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div className="h-[calc(100%-152px)] overflow-y-auto px-5 py-4">
          {tab === "overview" ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-border p-3 text-sm">
                <Info label="Loại" value={dataset.type} />
                <Info label="Kích thước" value={formatSize(dataset.size_bytes)} />
                <Info label="Số items" value={`${dataset.item_count.toLocaleString()} items`} />
                <Info label="Classes" value={dataset.class_count ? `${dataset.class_count} categories` : "-"} />
                <Info label="Tạo bởi" value={dataset.created_by} />
                <Info label="Cập nhật" value={formatDistanceToNow(new Date(dataset.updated_at), { addSuffix: true })} />
              </div>
              <p className="text-sm text-text-secondary">{dataset.description}</p>
            </div>
          ) : null}
          {tab === "preview" ? (
            <div>
              {dataset.type === "tabular" ? (
                <div className="rounded-lg border border-border p-3 text-sm">Tabular preview ({preview.data?.samples.length ?? 0} rows)</div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {(preview.data?.samples ?? []).slice(0, 12).map((sample) => (
                    <div key={sample.id} className="overflow-hidden rounded-md border border-border">
                      <img src={sample.thumbnail_url} alt={sample.content} className="h-20 w-full object-cover" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
          {tab === "distribution" ? (
            <div className="space-y-4">
              {preview.data?.class_distribution ? <ClassDistributionChart distribution={preview.data.class_distribution} /> : <p className="text-sm text-text-secondary">Không có dữ liệu phân phối.</p>}
              {preview.data?.split_info ? (
                <div className="h-56 rounded-lg border border-border p-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={[{ name: "Train", value: preview.data.split_info.train }, { name: "Val", value: preview.data.split_info.val }, { name: "Test", value: preview.data.split_info.test }]} dataKey="value" nameKey="name" outerRadius={80} label />
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : null}
            </div>
          ) : null}
          {tab === "history" ? (
            <div className="space-y-2 text-sm text-text-secondary">
              <p>ResNet Training - 3 ngày trước - 2h 15m</p>
              <p>EDA Session - 1 tuần trước - 45m</p>
            </div>
          ) : null}
        </div>
        <div className="absolute bottom-0 left-0 right-0 border-t border-border bg-bg-surface px-5 py-3">
          <p className="mb-2 text-xs text-text-secondary">Mount vào workspace</p>
          <div className="flex items-center gap-2">
            <select value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} className="h-9 flex-1 rounded-md border border-border px-3 text-sm">
              <option value="ws_resnet">ResNet Training</option>
              <option value="ws_eda">EDA Session</option>
            </select>
            <Button className="bg-emerald-500 text-white hover:bg-emerald-600" onClick={() => onUse(dataset, workspaceId)}>Áp dụng</Button>
          </div>
        </div>
      </motion.aside>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="text-text-tertiary">{label}: </span>
      <span className="font-medium text-text-primary">{value}</span>
    </p>
  );
}

function formatSize(size: number) {
  const gb = 1024 ** 3;
  if (size >= gb) return `${(size / gb).toFixed(1)} GB`;
  return `${Math.round(size / 1024 ** 2)} MB`;
}

"use client";

import { formatDistanceToNow } from "date-fns";
import { motion } from "framer-motion";
import { Download, GitBranch, Pencil, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Button, Modal } from "@/components/ui";
import { useDatasetDetail, useDeleteDataset, useUpdateDataset } from "@/lib/hooks/useDatasets";
import { useToast } from "@/lib/hooks/useToast";
import { useVersionList } from "@/lib/hooks/useDatasetVersions";
import { formatBytes } from "@/lib/utils/format";
import type { DatasetVersion } from "@/lib/hooks/useDatasetVersions";
import type { Dataset } from "@/types/dataset";

type TabValue = "overview" | "preview" | "versions" | "history";
type CustomField = { key: string; value: string };

export function DatasetDetailDrawer({
  datasetId,
  open,
  onClose
}: {
  datasetId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { detail, preview } = useDatasetDetail(datasetId ?? "");
  const updateDataset = useUpdateDataset();
  const deleteDataset = useDeleteDataset();
  const versionsQuery = useVersionList(datasetId ?? "");
  const dataset = detail.data;
  const [tab, setTab] = React.useState<TabValue>("overview");
  const [metadataModalOpen, setMetadataModalOpen] = React.useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = React.useState(false);
  const [deleteConfirmed, setDeleteConfirmed] = React.useState(false);
  const [metadataForm, setMetadataForm] = React.useState({
    description: "",
    labelStatus: "processing",
    classCount: "",
    tags: "",
    customFields: [] as CustomField[]
  });

  React.useEffect(() => {
    if (!open) setTab("overview");
  }, [open]);

  React.useEffect(() => {
    if (!dataset) return;
    setMetadataForm({
      description: dataset.description ?? "",
      labelStatus: dataset.label_status,
      classCount: dataset.class_count == null ? "" : String(dataset.class_count),
      tags: dataset.tags.join(", "),
      customFields: Object.entries(dataset.custom_metadata ?? {}).map(([key, value]) => ({
        key,
        value: String(value)
      }))
    });
  }, [dataset]);

  if (!open || !dataset) return null;

  const submitMetadata = async () => {
    const classCount = metadataForm.classCount.trim() ? Number(metadataForm.classCount) : null;
    if (classCount !== null && (!Number.isInteger(classCount) || classCount < 0)) {
      toast.warning("Class count phải là số nguyên không âm");
      return;
    }
    try {
      await updateDataset.mutateAsync({
        datasetId: dataset.id,
        payload: {
          description: metadataForm.description.trim(),
          label_status: metadataForm.labelStatus as Dataset["label_status"],
          class_count: classCount,
          custom_metadata: fieldsToMetadata(metadataForm.customFields),
          tags: metadataForm.tags.split(",").map((tag) => tag.trim()).filter(Boolean)
        }
      });
      toast.success("Đã cập nhật metadata dataset");
      setMetadataModalOpen(false);
    } catch {
      toast.error("Cập nhật metadata dataset thất bại");
    }
  };

  const confirmDelete = async () => {
    try {
      await deleteDataset.mutateAsync(dataset.id);
      toast.success("Đã xóa dataset");
      setDeleteModalOpen(false);
      setDeleteConfirmed(false);
      onClose();
    } catch {
      toast.error("Xóa dataset thất bại");
    }
  };

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
            <Button size="sm" variant="outline" onClick={() => setMetadataModalOpen(true)}>
              <Pencil size={14} className="mr-1" /> Edit
            </Button>
            <Button size="sm" variant="ghost" onClick={() => router.push(`/datasets/${encodeURIComponent(dataset.id)}`)}>
              <GitBranch size={14} className="mr-1" /> Versions
            </Button>
            <Button size="sm" variant="ghost" onClick={() => {
              const a = document.createElement("a");
              a.href = "data:text/plain;charset=utf-8,Mock%20Dataset%20Content";
              a.download = `${dataset.name}.zip`;
              a.click();
            }}>
              <Download size={14} className="mr-1" /> Download
            </Button>
            <Button size="sm" variant="ghost" className="text-error-600 hover:text-error-700" onClick={() => setDeleteModalOpen(true)}>
              <Trash2 size={14} />
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose}><X size={16} /></Button>
          </div>
        </div>
        <div className="border-b border-border px-5 py-2">
          <div className="flex gap-2 text-sm">
            {(["overview", "preview", "versions", "history"] as TabValue[]).map((item) => (
              <button key={item} onClick={() => setTab(item)} className={tab === item ? "rounded-md bg-[#ECFDF5] px-2 py-1 font-medium text-emerald-700" : "rounded-md px-2 py-1 text-text-secondary"}>
                {item.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div className="h-[calc(100%-115px)] overflow-y-auto px-5 py-4">
          {tab === "overview" ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-border p-3 text-sm">
                <Info label="Phiên bản" value={dataset.version || "v1.0"} />
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
          {tab === "versions" ? (
            <DatasetVersionTimeline
              dataset={dataset}
              versions={versionsQuery.data ?? []}
              loading={versionsQuery.isLoading}
              onOpenVersions={() => router.push(`/datasets/${encodeURIComponent(dataset.id)}`)}
            />
          ) : null}
          {tab === "history" ? (
            <div className="space-y-2 text-sm text-text-secondary">
              <p>ResNet Training - 3 ngày trước - 2h 15m</p>
              <p>EDA Session - 1 tuần trước - 45m</p>
            </div>
          ) : null}
        </div>
      </motion.aside>
      <Modal
        open={metadataModalOpen}
        onClose={() => !updateDataset.isPending && setMetadataModalOpen(false)}
        title="Update dataset metadata"
        size="md"
        showCloseButton
        closeOnBackdrop={false}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setMetadataModalOpen(false)} disabled={updateDataset.isPending}>Hủy</Button>
            <Button className="bg-emerald-600 text-white hover:bg-emerald-500" onClick={() => void submitMetadata()} disabled={updateDataset.isPending}>
              {updateDataset.isPending ? "Đang lưu..." : "Lưu metadata"}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <MetadataField label="Description">
            <textarea className={`${metadataInputCls()} min-h-24 resize-none`} value={metadataForm.description} onChange={(event) => setMetadataForm((prev) => ({ ...prev, description: event.target.value }))} />
          </MetadataField>
          <div className="grid grid-cols-2 gap-3">
            <MetadataField label="Label status">
              <select className={metadataInputCls()} value={metadataForm.labelStatus} onChange={(event) => setMetadataForm((prev) => ({ ...prev, labelStatus: event.target.value }))}>
                <option value="processing">processing</option>
                <option value="labeled">labeled</option>
                <option value="unlabeled">unlabeled</option>
              </select>
            </MetadataField>
            <MetadataField label="Class count">
              <input className={metadataInputCls()} type="number" min="0" value={metadataForm.classCount} onChange={(event) => setMetadataForm((prev) => ({ ...prev, classCount: event.target.value }))} />
            </MetadataField>
          </div>
          <MetadataField label="Tags">
            <input className={metadataInputCls()} value={metadataForm.tags} onChange={(event) => setMetadataForm((prev) => ({ ...prev, tags: event.target.value }))} placeholder="vision, gold, pii-redacted" />
          </MetadataField>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[12.5px] font-medium text-text-secondary">Custom fields</p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setMetadataForm((prev) => ({ ...prev, customFields: [...prev.customFields, { key: "", value: "" }] }))}
              >
                <Plus size={14} /> Add field
              </Button>
            </div>
            {metadataForm.customFields.map((field, index) => (
              <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <input
                  className={metadataInputCls()}
                  value={field.key}
                  onChange={(event) => setMetadataForm((prev) => updateCustomField(prev, index, "key", event.target.value))}
                  placeholder="field_name"
                />
                <input
                  className={metadataInputCls()}
                  value={field.value}
                  onChange={(event) => setMetadataForm((prev) => updateCustomField(prev, index, "value", event.target.value))}
                  placeholder="value"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setMetadataForm((prev) => ({ ...prev, customFields: prev.customFields.filter((_, itemIndex) => itemIndex !== index) }))}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </Modal>
      <Modal
        open={deleteModalOpen}
        onClose={() => !deleteDataset.isPending && setDeleteModalOpen(false)}
        title="Xóa dataset?"
        size="sm"
        showCloseButton
        closeOnBackdrop={false}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteModalOpen(false)} disabled={deleteDataset.isPending}>Hủy</Button>
            <Button variant="danger" onClick={() => void confirmDelete()} disabled={!deleteConfirmed || deleteDataset.isPending}>
              {deleteDataset.isPending ? "Đang xóa..." : "Xóa vĩnh viễn"}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-text-secondary">Metadata và object lưu trên MinIO của dataset này sẽ bị xóa.</p>
        <label className="mt-4 inline-flex items-center gap-2 text-sm text-text-secondary">
          <input type="checkbox" className="h-4 w-4 rounded border-border" checked={deleteConfirmed} onChange={(event) => setDeleteConfirmed(event.target.checked)} />
          Tôi hiểu và muốn xóa
        </label>
      </Modal>
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

function DatasetVersionTimeline({
  dataset,
  versions,
  loading,
  onOpenVersions
}: {
  dataset: Dataset;
  versions: DatasetVersion[];
  loading: boolean;
  onOpenVersions: () => void;
}) {
  const displayVersions = versions.length > 0 ? versions.slice(0, 5) : [];

  if (loading) {
    return <div className="rounded-lg border border-border p-4 text-sm text-text-secondary">Loading versions...</div>;
  }

  if (displayVersions.length === 0) {
    return (
      <div className="space-y-3">
        <div className="relative pl-6">
          <div className="absolute bottom-1 left-[11.5px] top-1 w-px bg-emerald-200" />
          <div className="relative">
            <span className="absolute -left-[18px] top-1.5 h-3 w-3 rounded-full border-2 border-emerald-500 bg-emerald-500" />
            <p className="text-sm font-semibold text-text-primary">{dataset.version || "v1.0"} Current</p>
            <p className="text-sm text-text-secondary">{formatSize(dataset.size_bytes)} · {dataset.item_count.toLocaleString()} items</p>
            <p className="text-xs text-text-tertiary">{formatDistanceToNow(new Date(dataset.updated_at), { addSuffix: true })}</p>
          </div>
        </div>
        <Button size="sm" className="bg-[#ECFDF5] text-emerald-700 hover:bg-[#D1FAE5]" onClick={onOpenVersions}>
          <GitBranch size={14} /> View all versions
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative pl-6">
        <div className="absolute bottom-1 left-[11.5px] top-1 w-px bg-emerald-200" />
        <div className="space-y-4">
          {displayVersions.map((version) => (
            <div key={version.id} className="relative">
              <span className={`absolute -left-[18px] top-1.5 h-3 w-3 rounded-full border-2 ${version.is_latest ? "border-emerald-500 bg-emerald-500" : "border-emerald-500 bg-bg-surface"}`} />
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-text-primary">{version.version}</p>
                {version.is_latest ? <span className="rounded-full bg-[#ECFDF5] px-2 py-0.5 text-xs text-emerald-700">Latest</span> : null}
              </div>
              <p className="text-sm text-text-secondary">{formatBytes(version.size_bytes)} · {version.item_count.toLocaleString()} items · {version.status}</p>
              <p className="text-xs text-text-tertiary">{formatDistanceToNow(new Date(version.created_at), { addSuffix: true })}</p>
            </div>
          ))}
        </div>
      </div>
      <Button size="sm" className="bg-[#ECFDF5] text-emerald-700 hover:bg-[#D1FAE5]" onClick={onOpenVersions}>
        <GitBranch size={14} /> View all versions
      </Button>
    </div>
  );
}

function formatSize(size: number) {
  const gb = 1024 ** 3;
  if (size >= gb) return `${(size / gb).toFixed(1)} GB`;
  return `${Math.round(size / 1024 ** 2)} MB`;
}

function MetadataField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[12.5px] font-medium text-text-secondary">
      {label}
      {children}
    </label>
  );
}

function metadataInputCls() {
  return "w-full rounded-lg border border-border bg-white px-3 py-2 text-[13px] text-text-primary placeholder:text-text-tertiary focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100";
}

function updateCustomField<T extends { customFields: CustomField[] }>(
  form: T,
  index: number,
  property: keyof CustomField,
  value: string
): T {
  return {
    ...form,
    customFields: form.customFields.map((field, itemIndex) =>
      itemIndex === index ? { ...field, [property]: value } : field
    )
  };
}

function fieldsToMetadata(fields: CustomField[]) {
  return fields.reduce<Record<string, string>>((metadata, field) => {
    const key = field.key.trim();
    const value = field.value.trim();
    if (key && value) metadata[key] = value;
    return metadata;
  }, {});
}

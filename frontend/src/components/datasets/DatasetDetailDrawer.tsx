"use client";

import { formatDistanceToNow } from "date-fns";
import { motion } from "framer-motion";
import { AlertTriangle, Archive, Download, GitBranch, Link2, Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Button, Modal } from "@/components/ui";
import { useDatasetDetail, useDeleteDataset, useUpdateDataset, useDatasetDownloadUrl } from "@/lib/hooks/useDatasets";
import { useToast } from "@/lib/hooks/useToast";
import { useVersionList } from "@/lib/hooks/useDatasetVersions";
import { formatBytes } from "@/lib/utils/format";
import type { DatasetVersion } from "@/lib/hooks/useDatasetVersions";
import type { Dataset } from "@/types/dataset";

type TabValue = "overview" | "preview" | "usage" | "versions" | "history";
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
  const downloadUrlQuery = useDatasetDownloadUrl(dataset?.id, tab === "usage");
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
      labelStatus: dataset.label_status ?? "processing",
      classCount: dataset.class_count == null ? "" : String(dataset.class_count),
      tags: (dataset.tags ?? []).join(", "),
      customFields: Object.entries(dataset.custom_metadata ?? {}).map(([key, value]) => ({
        key,
        value: String(value)
      }))
    });
  }, [dataset]);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Failed to copy");
    }
  };

  const getCurlCommand = () => {
    if (downloadUrlQuery.isLoading) return "Generating URL...";
    if (downloadUrlQuery.isError) return "Failed to generate URL";
    const safeName = (dataset?.name || "dataset").replace(/\s+/g, "_");
    return `curl -L -o "${safeName}.zip" "${downloadUrlQuery.data?.url || ""}"`;
  };

  if (!open || !dataset) return null;

  const submitMetadata = async () => {
    const classCount = metadataForm.classCount.trim() ? Number(metadataForm.classCount) : null;
    if (classCount !== null && (!Number.isInteger(classCount) || classCount < 0)) {
      toast.warning("Class count must be a non-negative integer");
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
      toast.success("Dataset metadata updated");
      setMetadataModalOpen(false);
    } catch {
      toast.error("Failed to update dataset metadata");
    }
  };

  const confirmDelete = async () => {
    try {
      await deleteDataset.mutateAsync(dataset.id);
      toast.success("Dataset deleted");
      setDeleteModalOpen(false);
      setDeleteConfirmed(false);
      onClose();
    } catch {
      toast.error("Failed to delete dataset");
    }
  };

  return (
    <div className="fixed inset-0 z-50">
      <motion.button initial={{ opacity: 0 }} animate={{ opacity: 0.3 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black backdrop-blur-sm" onClick={onClose} />
      <motion.aside initial={{ x: "100%" }} animate={{ x: 0 }} transition={{ duration: 0.25, ease: "easeOut" }} className="absolute right-0 top-0 h-full w-full max-w-[520px] overflow-hidden border-l border-border bg-bg-surface md:w-[520px]">
        <div className="flex items-start justify-between border-b border-border px-5 py-4">
          <div className="min-w-0 pr-4">
            <h2 className="truncate text-xl font-bold text-text-primary">{dataset.name}</h2>
            <div className="mt-1.5">
              <span className="rounded-full bg-[#ECFDF5] px-2 py-1 text-xs text-emerald-700">{dataset.label_status}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center justify-end gap-1">
            <Button size="sm" variant="outline" className="px-2.5" onClick={() => setMetadataModalOpen(true)} title="Edit">
              <Pencil size={14} className="mr-1" /> Edit
            </Button>
            <Button size="sm" variant="ghost" className="px-2.5" onClick={() => router.push(`/datasets/${encodeURIComponent(dataset.id)}`)} title="Versions">
              <GitBranch size={14} className="mr-1" /> Versions
            </Button>

            {dataset.status === "archived" ? (
              <Button size="sm" variant="ghost" className="px-2" disabled={updateDataset.isPending} onClick={() => {
                void updateDataset.mutateAsync({ datasetId: dataset.id, payload: { status: "active" } });
              }} title="Restore">
                <RefreshCw size={14} />
              </Button>
            ) : (
              <Button size="sm" variant="ghost" className="px-2" disabled={updateDataset.isPending} onClick={() => {
                void updateDataset.mutateAsync({ datasetId: dataset.id, payload: { status: "archived" } });
              }} title="Archive">
                <Archive size={14} />
              </Button>
            )}
            <Button size="sm" variant="ghost" className="px-2 text-error-600 hover:text-error-700 hover:bg-error-50" onClick={() => setDeleteModalOpen(true)} title="Delete permanently">
              <Trash2 size={14} />
            </Button>
            <div className="mx-0.5 h-4 w-px bg-border" />
            <Button size="sm" variant="ghost" className="px-2" onClick={onClose} title="Close"><X size={16} /></Button>
          </div>
        </div>
        <div className="border-b border-border px-5 py-2">
          <div className="flex gap-2 text-sm">
            {(["overview", "preview", "usage", "versions", "history"] as TabValue[]).map((item) => (
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
                <Info label="Version" value={dataset.version || "v1.0"} />
                <Info label="Type" value={dataset.type ?? "-"} />
                <Info label="Size" value={formatSize(dataset.size_bytes ?? 0)} />
                <Info label="Item count" value={`${(dataset.item_count ?? 0).toLocaleString()} items`} />
                <Info label="Classes" value={dataset.class_count ? `${dataset.class_count} categories` : "-"} />
                <Info label="Created by" value={dataset.created_by ?? "-"} />
                {dataset.yolo_task ? (
                  <Info label="YOLO Task" value={dataset.yolo_task.replace(/_/g, " ")} />
                ) : null}
                <Info
                  label="Last updated"
                  value={dataset.updated_at ? formatDistanceToNow(new Date(dataset.updated_at), { addSuffix: true }) : "-"}
                />
              </div>
              <p className="text-sm text-text-secondary">{dataset.description}</p>
            </div>
          ) : null}
          {tab === "preview" ? (
            <div>
              {dataset.type === "tabular" ? (
                <div className="rounded-lg border border-border p-3 text-sm">Tabular preview ({preview.data?.samples?.length ?? 0} rows)</div>
              ) : (
                <div className="space-y-4">
                  {preview.data?.split_info && Object.keys(preview.data.split_info).length > 0 ? (
                    <div className="rounded-lg border border-border p-3 text-sm">
                      <p className="mb-2 font-semibold">Dataset Splits</p>
                      <ul className="list-inside list-disc text-text-secondary">
                        {Object.entries(preview.data.split_info).map(([key, value]) => (
                          <li key={key} className="capitalize">
                            {key}: {value} items
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {preview.data?.class_distribution && Object.keys(preview.data.class_distribution).length > 0 ? (
                    <div className="rounded-lg border border-border p-3 text-sm">
                      <p className="mb-2 font-semibold">Class Distribution</p>
                      <ul className="max-h-48 list-inside list-disc overflow-y-auto text-text-secondary">
                        {Object.entries(preview.data.class_distribution).map(([key, value]) => (
                          <li key={key}>
                            {key}: {value} items
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {(!preview.data?.split_info && !preview.data?.class_distribution) ? (
                    <div className="rounded-lg border border-border p-4 text-center text-sm text-text-secondary">
                      Detailed preview summary is not available for this dataset.
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}
          {tab === "usage" ? (
            <div className="space-y-5">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Direct Download</p>
                </div>
                <div className="flex items-center justify-between rounded-md border border-border bg-bg-surface p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Archive size={16} className="text-text-secondary" />
                    <span className="font-medium text-text-primary">{dataset.name}.zip</span>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => {
                    const a = document.createElement("a");
                    if (downloadUrlQuery.data?.url) {
                      a.href = downloadUrlQuery.data.url;
                    } else {
                      a.href = "data:text/plain;charset=utf-8,Mock%20Dataset%20Content";
                    }
                    a.download = `${dataset.name}.zip`;
                    a.click();
                  }}>
                    <Download size={14} className="mr-1" /> Download Zip
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Download via cURL</p>
                  <Button size="sm" variant="ghost" disabled={!downloadUrlQuery.data?.url} onClick={() => copyToClipboard(getCurlCommand())}>
                    <Link2 size={14} className="mr-1" />Copy
                  </Button>
                </div>
                <pre className="overflow-x-auto rounded-md border border-border bg-bg-surface p-3 font-mono text-xs">{getCurlCommand()}</pre>
              </div>
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
            <DatasetHistory
              dataset={dataset}
              versions={versionsQuery.data ?? []}
              loading={versionsQuery.isLoading}
            />
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
            <Button variant="outline" onClick={() => setMetadataModalOpen(false)} disabled={updateDataset.isPending}>Cancel</Button>
            <Button className="bg-emerald-600 text-white hover:bg-emerald-500" onClick={() => void submitMetadata()} disabled={updateDataset.isPending}>
              {updateDataset.isPending ? "Saving..." : "Save metadata"}
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
        title={
          <div className="flex items-center gap-2 text-error-600">
            <AlertTriangle size={18} />
            <span>Delete dataset permanently?</span>
          </div>
        }
        size="sm"
        showCloseButton
        closeOnBackdrop={false}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteModalOpen(false)} disabled={deleteDataset.isPending}>Cancel</Button>
            <Button variant="danger" onClick={() => void confirmDelete()} disabled={!deleteConfirmed || deleteDataset.isPending}>
              {deleteDataset.isPending ? "Deleting..." : "Delete permanently"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="rounded-md border border-error-200 bg-error-50 p-3 text-sm text-error-800">
            <p className="font-semibold">Warning: This action cannot be undone.</p>
            <p className="mt-1">All data, history, and versions for dataset <strong className="font-semibold">{dataset.name}</strong> will be permanently deleted from the system.</p>
          </div>
          <label className="inline-flex cursor-pointer items-start gap-2.5 text-sm text-text-secondary transition-colors hover:text-text-primary">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-border text-error-600 transition-colors focus:ring-error-500"
              checked={deleteConfirmed}
              onChange={(event) => setDeleteConfirmed(event.target.checked)}
            />
            <span className="leading-tight">I understand this data will be lost and cannot be restored, and I confirm deletion.</span>
          </label>
        </div>
      </Modal>
    </div>
  );
}

function DatasetHistory({
  dataset,
  versions,
  loading
}: {
  dataset: Dataset;
  versions: DatasetVersion[];
  loading: boolean;
}) {
  const events = buildDatasetHistory(dataset, versions);

  if (loading) {
    return <div className="rounded-lg border border-border p-4 text-sm text-text-secondary">Loading history...</div>;
  }

  if (events.length === 0) {
    return <div className="rounded-lg border border-border p-4 text-sm text-text-secondary">No history recorded yet.</div>;
  }

  return (
    <div className="space-y-3">
      {events.map((event) => (
        <div key={event.key} className="rounded-lg border border-border p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-text-primary">{event.title}</p>
              <p className="mt-1 text-xs text-text-secondary">{event.detail}</p>
            </div>
            <span className="shrink-0 text-xs text-text-tertiary">{event.when}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function buildDatasetHistory(dataset: Dataset, versions: DatasetVersion[]) {
  const versionEvents = versions.map((version) => ({
    key: `version-${version.id}`,
    title: `${version.is_latest ? "Latest version" : "Version"} ${version.version}`,
    detail: [
      version.changelog || (version.validation_status ? `Validation ${version.validation_status}` : version.status),
      `${formatBytes(version.size_bytes ?? 0)}`,
      `${(version.item_count ?? 0).toLocaleString()} items`,
      version.created_by ? `by ${version.created_by}` : ""
    ].filter(Boolean).join(" - "),
    at: version.created_at,
    when: relativeTime(version.created_at)
  }));

  const metadataEvents = [
    {
      key: `dataset-updated-${dataset.id}`,
      title: "Dataset metadata updated",
      detail: `${dataset.label_status} - ${formatSize(dataset.size_bytes)} - ${(dataset.item_count ?? 0).toLocaleString()} items`,
      at: dataset.updated_at,
      when: relativeTime(dataset.updated_at)
    },
    {
      key: `dataset-created-${dataset.id}`,
      title: "Dataset created",
      detail: dataset.created_by ? `Created by ${dataset.created_by}` : "Initial dataset record",
      at: dataset.created_at,
      when: relativeTime(dataset.created_at)
    }
  ].filter((event, index, items) => {
    if (index !== 0) return true;
    return dataset.updated_at && dataset.created_at && dataset.updated_at !== dataset.created_at && items.length > 1;
  });

  return [...versionEvents, ...metadataEvents]
    .filter((event) => Boolean(event.at))
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

function relativeTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return formatDistanceToNow(date, { addSuffix: true });
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
            <p className="text-sm text-text-secondary">
              {formatSize(dataset.size_bytes)} · {(dataset.item_count ?? 0).toLocaleString()} items
            </p>
            <p className="text-xs text-text-tertiary">
              {dataset.updated_at ? formatDistanceToNow(new Date(dataset.updated_at), { addSuffix: true }) : "-"}
            </p>
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
              <p className="text-sm text-text-secondary">
                {formatBytes(version.size_bytes ?? 0)} · {(version.item_count ?? 0).toLocaleString()} items · {version.status}
              </p>
              <p className="text-xs text-text-tertiary">
                {version.created_at ? formatDistanceToNow(new Date(version.created_at), { addSuffix: true }) : "-"}
              </p>
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

function formatSize(size: number | null | undefined) {
  const value = size ?? 0;
  const gb = 1024 ** 3;
  if (value >= gb) return `${(value / gb).toFixed(1)} GB`;
  return `${Math.round(value / 1024 ** 2)} MB`;
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

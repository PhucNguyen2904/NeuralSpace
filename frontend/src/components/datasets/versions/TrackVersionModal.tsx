"use client";

import { useCallback, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileJson,
  FileUp,
  Loader2,
  UploadCloud,
  XCircle,
} from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { useUploadVersion, type UploadStep } from "@/lib/hooks/useDatasetVersions";
import type { DvcVersionStatus } from "@/lib/api/dvc";

type DatasetVersionMetadata = {
  version?: string;
  commit_message?: string;
  commitMessage?: string;
  changelog?: string;
  note?: string;
  item_count?: number;
  itemCount?: number;
  status?: DvcVersionStatus;
  split_info?: Record<string, number>;
  splitInfo?: Record<string, number>;
  schema_snapshot?: Record<string, unknown>;
  schemaSnapshot?: Record<string, unknown>;
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function StepIcon({ status }: { status: UploadStep["status"] }) {
  if (status === "done") return <CheckCircle2 size={16} className="text-emerald-500" />;
  if (status === "running") return <Loader2 size={16} className="animate-spin text-brand-500" />;
  if (status === "error") return <XCircle size={16} className="text-red-500" />;
  return <span className="inline-block h-4 w-4 rounded-full border border-border bg-bg-elevated" />;
}

function StepRow({ step }: { step: UploadStep }) {
  const isUpload = step.key === "upload";
  const pct = isUpload && "percent" in step ? step.percent : undefined;
  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <StepIcon status={step.status} />
        <span
          className={
            step.status === "error"
              ? "text-red-500"
              : step.status === "done"
                ? "text-text-primary"
                : step.status === "running"
                  ? "text-brand-500"
                  : "text-text-tertiary"
          }
        >
          {step.label}
        </span>
      </div>
      {isUpload && pct !== undefined && step.status === "running" && (
        <div className="ml-6 h-1.5 w-full overflow-hidden rounded-full bg-bg-elevated">
          <div
            className="h-full rounded-full bg-brand-500 transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </li>
  );
}

function FileDrop({
  file,
  onFile,
  disabled,
}: {
  file: File | null;
  onFile: (f: File) => void;
  disabled: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const dropped = e.dataTransfer.files[0];
      if (dropped) onFile(dropped);
    },
    [onFile]
  );

  return (
    <div
      className={[
        "relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-8 transition-colors",
        dragging
          ? "border-brand-500 bg-brand-50/10"
          : file
            ? "border-emerald-500 bg-emerald-50/10"
            : "border-border bg-bg-elevated hover:border-brand-400",
        disabled ? "pointer-events-none opacity-50" : "cursor-pointer",
      ].join(" ")}
      onClick={() => !disabled && inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        disabled={disabled}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
      />
      {file ? (
        <>
          <FileUp size={32} className="text-emerald-500" />
          <div className="text-center">
            <p className="font-medium text-text-primary">{file.name}</p>
            <p className="mt-0.5 text-xs text-text-secondary">
              {(file.size / 1024 / 1024).toFixed(2)} MB · Click to replace
            </p>
          </div>
        </>
      ) : (
        <>
          <UploadCloud size={32} className="text-text-tertiary" />
          <div className="text-center">
            <p className="text-sm font-medium text-text-primary">
              Drag & drop or <span className="text-brand-500">browse</span>
            </p>
            <p className="mt-0.5 text-xs text-text-secondary">
              Any file format · Max recommended 500 MB
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

interface UploadVersionModalProps {
  open: boolean;
  onClose: () => void;
  datasetId: string;
  onSuccess?: () => void;
}

export function TrackVersionModal({
  open,
  onClose,
  datasetId,
  onSuccess,
}: UploadVersionModalProps) {
  const uploader = useUploadVersion();

  const [file, setFile] = useState<File | null>(null);
  const [version, setVersion] = useState("");
  const [commitMessage, setCommitMessage] = useState("");
  const [changelog, setChangelog] = useState("");
  const [itemCount, setItemCount] = useState<string>("");
  const [versionStatus, setVersionStatus] = useState<DvcVersionStatus>("draft");
  const metadataInputRef = useRef<HTMLInputElement>(null);
  const [metadataFileName, setMetadataFileName] = useState("");
  const [importedMetadata, setImportedMetadata] = useState<DatasetVersionMetadata | null>(null);

  const isDone = uploader.steps.every((s) => s.status === "done");
  const hasError = uploader.steps.some((s) => s.status === "error");
  const isActive = uploader.isUploading;

  const canSubmit = Boolean(file) && !isActive && !isDone;

  const applyFileDefaults = async (selected: File) => {
    setFile(selected);
    const datasetName = filenameStem(selected.name);
    const inferredCount = await inferItemCount(selected);
    setCommitMessage((current) => current.trim() || `chore(data): track ${datasetName}`);
    setChangelog((current) => current.trim() || `Upload ${selected.name}`);
    setItemCount((current) => current.trim() || (inferredCount > 0 ? String(inferredCount) : ""));
  };

  const handleClose = () => {
    if (isActive) return;
    uploader.reset();
    setFile(null);
    setVersion("");
    setCommitMessage("");
    setChangelog("");
    setItemCount("");
    setVersionStatus("draft");
    setMetadataFileName("");
    setImportedMetadata(null);
    onClose();
  };

  const handleSubmit = async () => {
    if (!file) return;
    try {
      await uploader.upload({
        datasetId,
        file,
        version,
        commitMessage: commitMessage.trim() || `chore(data): track ${filenameStem(file.name)}`,
        changelog,
        itemCount: itemCount ? parseInt(itemCount, 10) : 0,
        status: versionStatus,
        splitInfo: importedMetadata?.split_info ?? importedMetadata?.splitInfo,
        schemaSnapshot: importedMetadata?.schema_snapshot ?? importedMetadata?.schemaSnapshot,
      });
      onSuccess?.();
    } catch {
      // useTrackVersionUploader stores the visible error state.
    }
  };

  const importMetadata = async (metadataFile: File | null) => {
    if (!metadataFile) return;
    try {
      const parsed = JSON.parse(await metadataFile.text()) as DatasetVersionMetadata;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Invalid metadata");
      }
      const nextStatus = parsed.status;
      const nextItemCount = parsed.item_count ?? parsed.itemCount;
      setImportedMetadata(parsed);
      setMetadataFileName(metadataFile.name);
      setVersion(typeof parsed.version === "string" ? parsed.version : version);
      setCommitMessage(typeof parsed.commit_message === "string" ? parsed.commit_message : typeof parsed.commitMessage === "string" ? parsed.commitMessage : commitMessage);
      setChangelog(typeof parsed.changelog === "string" ? parsed.changelog : typeof parsed.note === "string" ? parsed.note : changelog);
      setItemCount(typeof nextItemCount === "number" && Number.isFinite(nextItemCount) ? String(nextItemCount) : itemCount);
      if (nextStatus === "draft" || nextStatus === "validated" || nextStatus === "deprecated") {
        setVersionStatus(nextStatus);
      }
    } catch {
      setMetadataFileName("");
      setImportedMetadata(null);
    }
  };

  const showProgress = uploader.steps.some((s) => s.status !== "pending");

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Upload New Dataset Version"
      showCloseButton
      size="lg"
      closeOnBackdrop={!isActive}
      footer={
        <div className="flex items-center justify-between gap-2">
          {isDone ? (
            <span className="flex items-center gap-1.5 text-sm text-emerald-600">
              <CheckCircle2 size={15} />
              Version created successfully
            </span>
          ) : (
            <span className="text-xs text-text-tertiary">
              DVC tracking may take 1–3 minutes
            </span>
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={handleClose} disabled={isActive}>
              {isDone ? "Close" : "Cancel"}
            </Button>
            {!isDone && (
              <Button
                onClick={() => void handleSubmit()}
                disabled={!canSubmit}
                loading={isActive}
                className="gap-1.5"
              >
                <UploadCloud size={15} />
                Upload & Track
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {/* ── File drop zone ── */}
        {!showProgress && (
          <div>
            <label className="mb-2 block text-sm font-medium">
              Dataset file <span className="text-red-500">*</span>
            </label>
            <FileDrop file={file} onFile={(selected) => void applyFileDefaults(selected)} disabled={isActive} />
          </div>
        )}

        {!showProgress && (
          <div>
            <input
              ref={metadataInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              disabled={isActive}
              onChange={(e) => {
                void importMetadata(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-bg-surface px-3 py-2 text-sm">
              <div className="flex min-w-0 items-center gap-2">
                <FileJson size={16} className="shrink-0 text-brand-500" />
                <p className="truncate text-text-secondary">{metadataFileName || "No version metadata JSON selected"}</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => metadataInputRef.current?.click()} disabled={isActive}>
                Import JSON
              </Button>
            </div>
          </div>
        )}

        {/* ── Version ── */}
        {!showProgress && (
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">
              Version <span className="text-text-tertiary">(optional)</span>
            </label>
            <input
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              disabled={isActive}
              placeholder="v2 or v2.0"
              className="h-9 w-full rounded-md border border-border bg-bg-surface px-3 text-sm placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-50"
            />
          </div>
        )}

        {/* ── Commit message ── */}
        {!showProgress && (
          <div>
            <label className="mb-1 block text-sm font-medium">
              Commit message <span className="text-text-tertiary">(auto)</span>
            </label>
            <input
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              disabled={isActive}
              placeholder={file ? `chore(data): track ${filenameStem(file.name)}` : "Generated from the selected file"}
              className="h-9 w-full rounded-md border border-border bg-bg-surface px-3 text-sm placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-50"
            />
          </div>
        )}

        {/* ── Changelog ── */}
        {!showProgress && (
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">
              Changelog <span className="text-text-tertiary">(optional)</span>
            </label>
            <textarea
              rows={2}
              value={changelog}
              onChange={(e) => setChangelog(e.target.value)}
              disabled={isActive}
              placeholder="Describe changes from the previous version..."
              className="w-full rounded-md border border-border bg-bg-surface px-3 py-2 text-sm placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-50"
            />
          </div>
        )}

        {/* ── Metadata row ── */}
        {!showProgress && (
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-text-secondary">
                Item count <span className="text-text-tertiary">(auto for CSV/JSON)</span>
              </label>
              <input
                type="number"
                min={0}
                value={itemCount}
                onChange={(e) => setItemCount(e.target.value)}
                disabled={isActive}
                placeholder="e.g. 5000"
                className="h-9 w-full rounded-md border border-border bg-bg-surface px-3 text-sm placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-50"
              />
            </div>
            <div className="w-36">
              <label className="mb-1 block text-sm font-medium text-text-secondary">
                Status
              </label>
              <select
                value={versionStatus}
                onChange={(e) => setVersionStatus(e.target.value as DvcVersionStatus)}
                disabled={isActive}
                className="h-9 w-full rounded-md border border-border bg-bg-surface px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-50"
              >
                <option value="draft">Draft</option>
                <option value="validated">Validated</option>
                <option value="deprecated">Deprecated</option>
              </select>
            </div>
          </div>
        )}

        {/* ── Progress steps ── */}
        {showProgress && (
          <div className="rounded-xl border border-border bg-bg-elevated px-5 py-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              Progress
            </p>
            <ul className="space-y-3 text-sm">
              {uploader.steps.map((step) => (
                <StepRow key={step.key} step={step} />
              ))}
            </ul>
          </div>
        )}

        {/* ── Error ── */}
        {hasError && uploader.error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Upload failed</p>
              <p className="mt-0.5 text-xs opacity-90">{uploader.error}</p>
            </div>
          </div>
        )}

        {/* ── Hint ── */}
        {!showProgress && (
          <p className="flex items-center gap-1.5 text-xs text-text-tertiary">
            <AlertTriangle size={12} />
            Previous latest version will be marked as non-latest automatically.
          </p>
        )}
      </div>
    </Modal>
  );
}

function filenameStem(filename: string) {
  const clean = filename.replace(/\\/g, "/").split("/").pop() || "dataset";
  return clean.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "dataset";
}

async function inferItemCount(file: File) {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".csv")) {
    const text = await file.slice(0, 8 * 1024 * 1024).text();
    const rows = text.split(/\r?\n/).filter((line) => line.trim()).length;
    return Math.max(rows - 1, 0);
  }
  if (lower.endsWith(".json")) {
    try {
      const parsed = JSON.parse(await file.slice(0, 8 * 1024 * 1024).text()) as unknown;
      if (Array.isArray(parsed)) return parsed.length;
      if (parsed && typeof parsed === "object") {
        const records = (parsed as { records?: unknown; data?: unknown; items?: unknown }).records
          ?? (parsed as { data?: unknown }).data
          ?? (parsed as { items?: unknown }).items;
        return Array.isArray(records) ? records.length : 1;
      }
    } catch {
      return 0;
    }
  }
  return 0;
}

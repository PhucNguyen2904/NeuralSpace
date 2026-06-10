"use client";

import { useCallback, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileUp,
  Loader2,
  UploadCloud,
  XCircle,
} from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { useUploadVersion, type UploadStep } from "@/lib/hooks/useDatasetVersions";
import type { DvcVersionStatus } from "@/lib/api/dvc";

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
  const [commitMessage, setCommitMessage] = useState("");
  const [changelog, setChangelog] = useState("");
  const [itemCount, setItemCount] = useState<string>("");
  const [versionStatus, setVersionStatus] = useState<DvcVersionStatus>("draft");

  const isDone = uploader.steps.every((s) => s.status === "done");
  const hasError = uploader.steps.some((s) => s.status === "error");
  const isActive = uploader.isUploading;

  const canSubmit = Boolean(file && commitMessage.trim()) && !isActive && !isDone;

  const handleClose = () => {
    if (isActive) return;
    uploader.reset();
    setFile(null);
    setCommitMessage("");
    setChangelog("");
    setItemCount("");
    setVersionStatus("draft");
    onClose();
  };

  const handleSubmit = async () => {
    if (!file) return;
    await uploader.upload({
      datasetId,
      file,
      commitMessage,
      changelog,
      itemCount: itemCount ? parseInt(itemCount, 10) : 0,
      status: versionStatus,
    });
    onSuccess?.();
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
            <FileDrop file={file} onFile={setFile} disabled={isActive} />
          </div>
        )}

        {/* ── Commit message ── */}
        {!showProgress && (
          <div>
            <label className="mb-1 block text-sm font-medium">
              Commit message <span className="text-red-500">*</span>
            </label>
            <input
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              disabled={isActive}
              placeholder="feat(data): add april snapshot with 20k new rows"
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
              placeholder="Mô tả thay đổi so với version trước..."
              className="w-full rounded-md border border-border bg-bg-surface px-3 py-2 text-sm placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-50"
            />
          </div>
        )}

        {/* ── Metadata row ── */}
        {!showProgress && (
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-text-secondary">
                Item count
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

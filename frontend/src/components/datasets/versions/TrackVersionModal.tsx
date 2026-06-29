"use client";

import { useCallback, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Database,
  FileJson,
  FileUp,
  GitCompare,
  Loader2,
  UploadCloud,
  XCircle,
  Zap,
} from "lucide-react";
import { Button, Modal } from "@/components/ui";
import {
  useDvcProfiles,
  useUploadDeltaVersion,
  useUploadVersion,
  useVersionList,
  type UploadStep,
} from "@/lib/hooks/useDatasetVersions";
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

type UploadMode = "full" | "delta";

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
  label,
  hint,
}: {
  file: File | null;
  onFile: (f: File) => void;
  disabled: boolean;
  label?: string;
  hint?: string;
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
              {label ?? <>Drag & drop or <span className="text-brand-500">browse</span></>}
            </p>
            <p className="mt-0.5 text-xs text-text-secondary">
              {hint ?? "Any file format · Max recommended 500 MB"}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Mode Toggle ─────────────────────────────────────────────────────────────

function ModeToggle({ mode, onChange, disabled }: { mode: UploadMode; onChange: (m: UploadMode) => void; disabled: boolean }) {
  return (
    <div className="flex rounded-lg border border-border bg-bg-elevated p-1 gap-1">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange("full")}
        className={[
          "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          mode === "full"
            ? "bg-bg-surface text-text-primary shadow-sm"
            : "text-text-secondary hover:text-text-primary",
          disabled ? "opacity-50 pointer-events-none" : "",
        ].join(" ")}
      >
        <UploadCloud size={15} />
        Full Upload
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange("delta")}
        className={[
          "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          mode === "delta"
            ? "bg-brand-500/10 text-brand-500 shadow-sm"
            : "text-text-secondary hover:text-text-primary",
          disabled ? "opacity-50 pointer-events-none" : "",
        ].join(" ")}
      >
        <Zap size={15} />
        Delta Upload
      </button>
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
  const deltaUploader = useUploadDeltaVersion();
  const { data: dvcProfiles = [], isLoading: isLoadingDvcProfiles } = useDvcProfiles();
  const { data: existingVersions = [] } = useVersionList(datasetId);

  const [mode, setMode] = useState<UploadMode>("full");
  const [file, setFile] = useState<File | null>(null);
  const [dvcProfileId, setDvcProfileId] = useState("");
  const [version, setVersion] = useState("");
  const [commitMessage, setCommitMessage] = useState("");
  const [changelog, setChangelog] = useState("");
  const [itemCount, setItemCount] = useState<string>("");
  const [versionStatus, setVersionStatus] = useState<DvcVersionStatus>("draft");

  // Delta-specific state
  const [baseVersionId, setBaseVersionId] = useState("");

  const metadataInputRef = useRef<HTMLInputElement>(null);
  const [metadataFileName, setMetadataFileName] = useState("");
  const [importedMetadata, setImportedMetadata] = useState<DatasetVersionMetadata | null>(null);

  const activeUploader = mode === "delta" ? deltaUploader : uploader;
  const isDone = activeUploader.steps.every((s) => s.status === "done");
  const hasError = activeUploader.steps.some((s) => s.status === "error");
  const isActive = activeUploader.isUploading;

  const readyDvcProfiles = dvcProfiles.filter((profile) => profile.status === "ready");
  const selectedDvcProfileId = dvcProfileId || readyDvcProfiles.find((profile) => profile.is_environment_default)?.id || readyDvcProfiles[0]?.id || "";

  // For delta: auto-select latest version as base
  const latestVersion = existingVersions.find((v) => v.is_latest);
  const resolvedBaseVersionId = baseVersionId || latestVersion?.id || "";

  const canSubmitFull = Boolean(file && selectedDvcProfileId) && !isActive && !isDone;
  const canSubmitDelta = Boolean(file && selectedDvcProfileId && resolvedBaseVersionId) && !isActive && !isDone;
  const canSubmit = mode === "delta" ? canSubmitDelta : canSubmitFull;

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
    deltaUploader.reset();
    setFile(null);
    setMode("full");
    setDvcProfileId("");
    setVersion("");
    setCommitMessage("");
    setChangelog("");
    setItemCount("");
    setVersionStatus("draft");
    setBaseVersionId("");
    setMetadataFileName("");
    setImportedMetadata(null);
    onClose();
  };

  const handleSubmit = async () => {
    if (!file) return;
    try {
      if (mode === "delta") {
        await deltaUploader.upload({
          datasetId,
          file,
          baseVersionId: resolvedBaseVersionId,
          version,
          commitMessage: commitMessage.trim() || `chore(data): delta update for ${filenameStem(file.name)}`,
          changelog,
          itemCount: itemCount ? parseInt(itemCount, 10) : 0,
          status: versionStatus,
          dvcProfileId: selectedDvcProfileId,
          splitInfo: importedMetadata?.split_info ?? importedMetadata?.splitInfo,
          schemaSnapshot: importedMetadata?.schema_snapshot ?? importedMetadata?.schemaSnapshot,
        });
      } else {
        await uploader.upload({
          datasetId,
          file,
          version,
          commitMessage: commitMessage.trim() || `chore(data): track ${filenameStem(file.name)}`,
          changelog,
          itemCount: itemCount ? parseInt(itemCount, 10) : 0,
          status: versionStatus,
          dvcProfileId: selectedDvcProfileId,
          splitInfo: importedMetadata?.split_info ?? importedMetadata?.splitInfo,
          schemaSnapshot: importedMetadata?.schema_snapshot ?? importedMetadata?.schemaSnapshot,
        });
      }
      onSuccess?.();
    } catch {
      // useUploadVersion / useUploadDeltaVersion stores the visible error state.
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

  const showProgress = activeUploader.steps.some((s) => s.status !== "pending");
  const activeError = activeUploader.error;

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
              {mode === "delta" ? "Delta merge + DVC tracking may take 1–3 minutes" : "DVC tracking may take 1–3 minutes"}
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
                {mode === "delta" ? <Zap size={15} /> : <UploadCloud size={15} />}
                {mode === "delta" ? "Upload Delta" : "Upload & Track"}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {/* ── Mode toggle ── */}
        {!showProgress && (
          <ModeToggle mode={mode} onChange={setMode} disabled={isActive} />
        )}

        {/* ── Delta mode: base version selector ── */}
        {!showProgress && mode === "delta" && (
          <div className="rounded-xl border border-brand-200 bg-brand-50/5 px-4 py-3 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-brand-400">
              <GitCompare size={15} />
              Delta Upload — only upload the changes
            </div>
            <p className="text-xs text-text-secondary">
              Upload a <strong>ZIP file containing only the changes</strong> (added/modified files for images,
              or <code>added_rows.csv</code> / <code>removed_ids.json</code> for tabular data).
              The server merges it with the base version automatically.
            </p>
            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">
                Base version <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
                <select
                  value={resolvedBaseVersionId}
                  onChange={(e) => setBaseVersionId(e.target.value)}
                  disabled={isActive || existingVersions.length === 0}
                  className="h-9 w-full appearance-none rounded-md border border-border bg-bg-surface px-3 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-50"
                >
                  {existingVersions.length === 0 && (
                    <option value="">No existing versions</option>
                  )}
                  {existingVersions.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.version}{v.is_latest ? " · latest" : ""}
                    </option>
                  ))}
                </select>
              </div>
              {existingVersions.length === 0 && (
                <p className="mt-1 text-xs text-red-500">No existing versions found. Use Full Upload for the first version.</p>
              )}
            </div>
          </div>
        )}

        {/* ── File drop zone ── */}
        {!showProgress && (
          <div>
            <label className="mb-2 block text-sm font-medium">
              {mode === "delta" ? "Delta file" : "Dataset file"} <span className="text-red-500">*</span>
            </label>
            <FileDrop
              file={file}
              onFile={(selected) => void applyFileDefaults(selected)}
              disabled={isActive}
              label={mode === "delta" ? "Drag & drop your delta ZIP or browse" : undefined}
              hint={mode === "delta" ? "Must be a ZIP with delta_manifest.json + changed files only" : undefined}
            />
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

        {/* ── DVC storage ── */}
        {!showProgress && (
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">
              DVC storage
            </label>
            <div className="relative">
              <Database size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
              <select
                value={selectedDvcProfileId}
                onChange={(e) => setDvcProfileId(e.target.value)}
                disabled={isActive || isLoadingDvcProfiles || readyDvcProfiles.length === 0}
                className="h-9 w-full rounded-md border border-border bg-bg-surface pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-50"
              >
                {readyDvcProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.is_environment_default ? `${profile.name} · no setup needed` : `${profile.name} · ${profile.remote_name}`}
                  </option>
                ))}
              </select>
            </div>
            {readyDvcProfiles.length === 0 ? (
              <p className="mt-1 text-xs text-red-500">No ready DVC storage profile is available.</p>
            ) : null}
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
              placeholder={file ? `chore(data): ${mode === "delta" ? "delta update for" : "track"} ${filenameStem(file.name)}` : "Generated from the selected file"}
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
              placeholder={mode === "delta" ? "Describe what changed in this delta..." : "Describe changes from the previous version..."}
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
              {activeUploader.steps.map((step) => (
                <StepRow key={step.key} step={step} />
              ))}
            </ul>
          </div>
        )}

        {/* ── Error ── */}
        {hasError && activeError && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">{mode === "delta" ? "Delta upload failed" : "Upload failed"}</p>
              <p className="mt-0.5 text-xs opacity-90">{activeError}</p>
            </div>
          </div>
        )}

        {/* ── Hint ── */}
        {!showProgress && (
          <p className="flex items-center gap-1.5 text-xs text-text-tertiary">
            <AlertTriangle size={12} />
            {mode === "delta"
              ? "Delta is merged server-side; the stored version is always a complete snapshot."
              : "Previous latest version will be marked as non-latest automatically."}
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

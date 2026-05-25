"use client";

import { useCallback, useRef, useState } from "react";
import { Loader2, Plus, Upload, X } from "lucide-react";
import { JUPYTER_CONFIG } from "../../../lib/jupyter/config";
import { cn } from "../../../lib/utils/cn";
import { generateUploadCode } from "../shared/ImportCodeGenerator";

interface UploadFile {
  id: string;
  file: File;
  status: "pending" | "uploading" | "done" | "error";
  progress: number;
  error?: string;
  path?: string;
}

interface LocalUploadPanelProps {
  onInjectCode: (code: string) => void;
  workspaceId: string;
}

const ACCEPTED_TYPES = [
  ".csv", ".tsv", ".xlsx", ".xls", ".json", ".jsonl", ".txt", ".md", ".png", ".jpg", ".jpeg", ".pt", ".pth", ".pkl", ".h5", ".onnx", ".py", ".ipynb", ".zip", ".tar", ".gz"
];

const MAX_FILE_SIZE_MB = 200;

export function LocalUploadPanel({ onInjectCode }: LocalUploadPanelProps): JSX.Element {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((rawFiles: File[]) => {
    const accepted: UploadFile[] = [];
    const rejected: UploadFile[] = [];

    for (const f of rawFiles) {
      const ext = `.${f.name.split(".").pop()?.toLowerCase() ?? ""}`;
      const sizeMb = f.size / 1024 / 1024;
      if (!ACCEPTED_TYPES.includes(ext)) {
        rejected.push({ id: crypto.randomUUID(), file: f, status: "error", progress: 0, error: "Dinh dang file khong duoc ho tro" });
        continue;
      }
      if (sizeMb > MAX_FILE_SIZE_MB) {
        rejected.push({ id: crypto.randomUUID(), file: f, status: "error", progress: 0, error: `File vuot qua ${MAX_FILE_SIZE_MB}MB` });
        continue;
      }
      accepted.push({ id: crypto.randomUUID(), file: f, status: "pending", progress: 0 });
    }

    setFiles((prev) => [...prev, ...accepted, ...rejected]);
    accepted.forEach((item) => {
      void uploadFile(item);
    });
  }, []);

  const encodePath = (path: string): string =>
    path
      .split("/")
      .filter((segment) => segment.length > 0)
      .map((segment) => encodeURIComponent(segment))
      .join("/");

  const uploadFile = async (item: UploadFile): Promise<void> => {
    setFiles((prev) => prev.map((f) => (f.id === item.id ? { ...f, status: "uploading", progress: 10, error: undefined } : f)));

    try {
      const isText = isTextFile(item.file.name);
      const format = isText ? "text" : "base64";
      const content = isText ? await item.file.text() : await readFileAsBase64(item.file);
      const uploadPath = `uploads/${item.file.name}`;

      setFiles((prev) => prev.map((f) => (f.id === item.id ? { ...f, progress: 45 } : f)));

      const res = await fetch(`${JUPYTER_CONFIG.baseUrl}/api/contents/${encodePath(uploadPath)}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `token ${JUPYTER_CONFIG.token}`
        },
        body: JSON.stringify({ type: "file", format, content })
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      setFiles((prev) => prev.map((f) => (f.id === item.id ? { ...f, status: "done", progress: 100, path: uploadPath } : f)));
    } catch {
      setFiles((prev) => prev.map((f) => (f.id === item.id ? { ...f, status: "error", progress: 0, error: "Upload that bai. Thu lai." } : f)));
    }
  };

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          addFiles(Array.from(e.dataTransfer.files));
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "relative flex cursor-pointer select-none flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-5 transition-all duration-150",
          isDragging ? "scale-[1.01] border-[#6366F1] bg-[#EEF2FF]" : "border-[#E2E8F0] hover:border-[#6366F1] hover:bg-[#F8FAFC]"
        )}
      >
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-full transition-colors", isDragging ? "bg-[#6366F1] text-white" : "bg-[#F1F5F9] text-[#94A3B8]")}>
          <Upload size={18} />
        </div>

        <div className="text-center">
          <p className="text-[13px] font-medium text-[#1A202C]">{isDragging ? "Tha file vao day" : "Keo tha hoac click de chon"}</p>
          <p className="mt-0.5 text-[11px] text-[#A0AEC0]">CSV, PT, PKL, PY, IPYNB... (toi da {MAX_FILE_SIZE_MB}MB)</p>
        </div>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_TYPES.join(",")}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(Array.from(e.target.files));
            e.target.value = "";
          }}
        />
      </div>

      {files.length > 0 ? (
        <div className="flex-1 space-y-1.5 overflow-y-auto">
          {files.map((item) => (
            <UploadFileItem
              key={item.id}
              item={item}
              onAddToNotebook={() => {
                if (!item.path) return;
                onInjectCode(generateUploadCode(item.file.name, item.path));
              }}
              onRemove={() => setFiles((prev) => prev.filter((f) => f.id !== item.id))}
              onRetry={() => {
                void uploadFile(item);
              }}
            />
          ))}
        </div>
      ) : null}

      <p className="shrink-0 text-center text-[11px] text-[#A0AEC0]">
        File duoc luu vao <code className="font-mono">/workspace/uploads/</code>
      </p>
    </div>
  );
}

function UploadFileItem({ item, onAddToNotebook, onRemove, onRetry }: { item: UploadFile; onAddToNotebook: () => void; onRemove: () => void; onRetry: () => void }): JSX.Element {
  const ext = `.${item.file.name.split(".").pop()?.toLowerCase() ?? ""}`;

  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-lg border p-2.5 transition-colors",
        item.status === "error"
          ? "border-red-200 bg-red-50"
          : item.status === "done"
            ? "border-emerald-200 bg-emerald-50/50"
            : "border-[#E2E8F0] bg-white"
      )}
    >
      <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[13px]", item.status === "done" ? "bg-emerald-100" : "bg-[#F1F5F9]")}>{item.status === "done" ? "✅" : item.status === "error" ? "❌" : getFileEmoji(ext)}</div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-medium text-[#1A202C]">{item.file.name}</p>
        <p className="text-[11px] text-[#A0AEC0]">{formatBytes(item.file.size)}</p>

        {item.status === "uploading" ? (
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[#E2E8F0]">
            <div className="h-full rounded-full bg-[#6366F1] transition-all duration-300" style={{ width: `${item.progress}%` }} />
          </div>
        ) : null}

        {item.status === "error" && item.error ? <p className="mt-0.5 text-[11px] text-red-600">{item.error}</p> : null}

        {item.status === "done" ? (
          <button onClick={onAddToNotebook} className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-[#6366F1] hover:underline">
            <Plus size={10} /> Them code vao notebook
          </button>
        ) : null}
      </div>

      <div className="shrink-0">
        {item.status === "uploading" ? (
          <Loader2 size={14} className="animate-spin text-[#6366F1]" />
        ) : item.status === "error" ? (
          <button onClick={onRetry} className="text-[11px] text-red-500 hover:underline">
            Thu lai
          </button>
        ) : (
          <button onClick={onRemove} className="text-[#CBD5E0] transition-colors hover:text-[#64748B]">
            <X size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

function isTextFile(name: string): boolean {
  const ext = `.${name.split(".").pop()?.toLowerCase() ?? ""}`;
  return [".csv", ".tsv", ".txt", ".md", ".json", ".jsonl", ".py", ".yaml", ".yml", ".ipynb"].includes(ext);
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(new Error("Read failed"));
    reader.readAsDataURL(file);
  });
}

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function getFileEmoji(ext: string): string {
  const map: Record<string, string> = {
    ".csv": "📊",
    ".xlsx": "📊",
    ".tsv": "📊",
    ".py": "🐍",
    ".ipynb": "📓",
    ".txt": "📄",
    ".md": "📝",
    ".pt": "📦",
    ".pth": "📦",
    ".pkl": "📦",
    ".h5": "📦",
    ".png": "🖼",
    ".jpg": "🖼",
    ".jpeg": "🖼",
    ".json": "🔧",
    ".yaml": "🔧",
    ".zip": "🗜"
  };
  return map[ext] ?? "📄";
}

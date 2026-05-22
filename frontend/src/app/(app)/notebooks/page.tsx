"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { BookOpen, Download, Grid2x2, List, Search, Trash2, Upload, X } from "lucide-react";
import { PageHeader } from "@/components/shared";
import { Button } from "@/components/ui";
import { getDownloadPresignedUrl, useDeleteNotebook, useNotebookPreview, useRestoreNotebook, useStoredNotebooks, useUploadNotebook } from "@/lib/hooks/useNotebooks";
import { useWorkspaces } from "@/lib/hooks/useWorkspace";
import { cn } from "@/lib/utils/cn";

type TimeFilter = "today" | "week" | "month" | "all";
type TypeFilter = ".ipynb" | ".py" | "all";
type ViewMode = "grid" | "list";
type SortMode = "newest" | "name" | "size";
type UploadProgress = { id: string; name: string; progress: number; status: "uploading" | "done" | "error" };

const ACCEPTED = ".ipynb,.py";

const inWindow = (date: Date, window: TimeFilter) => {
  const now = Date.now();
  const diff = now - date.getTime();
  if (window === "today") return diff <= 24 * 60 * 60 * 1000;
  if (window === "week") return diff <= 7 * 24 * 60 * 60 * 1000;
  if (window === "month") return diff <= 30 * 24 * 60 * 60 * 1000;
  return true;
};

const formatSize = (size: number) => {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

export default function NotebooksPage() {
  const { data: notebooks = [], isLoading, refetch } = useStoredNotebooks();
  const { data: workspaces = [] } = useWorkspaces();
  const uploadMutation = useUploadNotebook();
  const deleteMutation = useDeleteNotebook();
  const restoreMutation = useRestoreNotebook();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [workspaceFilter, setWorkspaceFilter] = useState("all");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [dragActive, setDragActive] = useState(false);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [progress, setProgress] = useState<UploadProgress[]>([]);

  const previewQuery = useNotebookPreview(previewPath);

  const workspaceCounts = useMemo(() => {
    const map = new Map<string, number>();
    notebooks.forEach((item) => map.set(item.workspace_id, (map.get(item.workspace_id) || 0) + 1));
    return map;
  }, [notebooks]);

  const workspaceName = (id: string) => workspaces.find((w) => w.id === id)?.name || id;
  const workspaceItems = Array.from(workspaceCounts.entries());
  const defaultWorkspaceId = workspaceItems[0]?.[0] || "";

  const filtered = useMemo(() => {
    const rows = notebooks
      .filter((item) => (workspaceFilter === "all" ? true : item.workspace_id === workspaceFilter))
      .filter((item) => (typeFilter === "all" ? true : item.name.endsWith(typeFilter)))
      .filter((item) => item.name.toLowerCase().includes(search.toLowerCase()))
      .filter((item) => (item.last_modified ? inWindow(new Date(item.last_modified), timeFilter) : timeFilter === "all"));
    if (sortMode === "name") return [...rows].sort((a, b) => a.name.localeCompare(b.name));
    if (sortMode === "size") return [...rows].sort((a, b) => b.size - a.size);
    return [...rows].sort((a, b) => +new Date(b.last_modified || 0) - +new Date(a.last_modified || 0));
  }, [notebooks, workspaceFilter, typeFilter, search, timeFilter, sortMode]);

  const handleDownload = async (path: string, name: string) => {
    const { url } = await getDownloadPresignedUrl(path);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.rel = "noopener noreferrer";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  };

  const handleUploadFiles = async (files: FileList | File[]) => {
    const fileList = Array.from(files);
    const selectedWorkspace = workspaceFilter === "all" ? defaultWorkspaceId || "general" : workspaceFilter;
    for (const file of fileList) {
      if (!file.name.endsWith(".ipynb") && !file.name.endsWith(".py")) continue;
      const id = `${file.name}-${Date.now()}`;
      setProgress((prev) => [...prev, { id, name: file.name, progress: 0, status: "uploading" }]);
      try {
        await uploadMutation.mutateAsync({
          file,
          workspaceId: selectedWorkspace,
          onUploadProgress: (evt) => {
            const total = evt.total || file.size || 1;
            const pct = Math.min(100, Math.round(((evt.loaded || 0) / total) * 100));
            setProgress((prev) => prev.map((p) => (p.id === id ? { ...p, progress: pct } : p)));
          }
        });
        setProgress((prev) => prev.map((p) => (p.id === id ? { ...p, progress: 100, status: "done" } : p)));
      } catch {
        setProgress((prev) => prev.map((p) => (p.id === id ? { ...p, status: "error" } : p)));
      }
    }
    await refetch();
  };

  const notebookCells = useMemo(() => {
    if (!previewQuery.data?.content || !previewPath?.endsWith(".ipynb")) return [];
    try {
      const parsed = JSON.parse(previewQuery.data.content) as { content?: { cells?: Array<{ cell_type?: string; source?: string[] }> } };
      return parsed.content?.cells?.slice(0, 8) || [];
    } catch {
      return [];
    }
  }, [previewQuery.data?.content, previewPath]);

  return (
    <div
      className="relative space-y-5"
      onDragOver={(e) => {
        e.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragActive(false);
        if (e.dataTransfer.files?.length) void handleUploadFiles(e.dataTransfer.files);
      }}
    >
      <PageHeader title="Notebooks" description="Xem, tải và quản lý notebooks đã lưu." />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4 rounded-xl border border-border bg-bg-surface p-4">
          <h2 className="text-lg font-semibold text-text-primary">Notebooks</h2>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">Theo Workspace</p>
            <div className="space-y-1">
              <button onClick={() => setWorkspaceFilter("all")} className={cn("flex w-full items-center justify-between rounded-md px-3 py-2 text-sm", workspaceFilter === "all" ? "bg-brand-50 text-brand-600" : "text-text-secondary hover:bg-bg-elevated")}>
                <span>📁 All notebooks</span><span>({notebooks.length})</span>
              </button>
              {workspaceItems.map(([id, count]) => (
                <button key={id} onClick={() => setWorkspaceFilter(id)} className={cn("flex w-full items-center justify-between rounded-md px-3 py-2 text-sm", workspaceFilter === id ? "bg-brand-50 text-brand-600" : "text-text-secondary hover:bg-bg-elevated")}>
                  <span>📁 {workspaceName(id)}</span><span>({count})</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">Lọc theo</p>
            <div className="space-y-3 text-sm">
              <div>
                <p className="mb-1 text-text-secondary">Thời gian</p>
                <div className="flex flex-wrap gap-1">
                  {[
                    { k: "today", l: "Hôm nay" },
                    { k: "week", l: "Tuần này" },
                    { k: "month", l: "Tháng này" },
                    { k: "all", l: "Tất cả" }
                  ].map((item) => (
                    <button key={item.k} onClick={() => setTimeFilter(item.k as TimeFilter)} className={cn("rounded-md px-2 py-1 text-xs", timeFilter === item.k ? "bg-brand-50 text-brand-600" : "bg-bg-elevated text-text-secondary")}>{item.l}</button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1 text-text-secondary">Loại</p>
                <div className="flex gap-1">
                  {[".ipynb", ".py", "all"].map((ext) => (
                    <button key={ext} onClick={() => setTypeFilter(ext as TypeFilter)} className={cn("rounded-md px-2 py-1 text-xs", typeFilter === ext ? "bg-brand-50 text-brand-600" : "bg-bg-elevated text-text-secondary")}>{ext === "all" ? "Tất cả" : ext}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </aside>

        <section className="space-y-4 rounded-xl border border-border bg-bg-surface p-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="relative min-w-56 flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm notebook..." className="h-10 w-full rounded-md border border-border bg-bg-sunken pl-9 pr-3 text-sm outline-none focus:border-brand-500" />
            </label>
            <div className="flex rounded-md bg-bg-elevated p-1">
              <button onClick={() => setViewMode("grid")} className={cn("rounded px-2 py-1", viewMode === "grid" ? "bg-bg-surface text-brand-600" : "text-text-secondary")}><Grid2x2 size={15} /></button>
              <button onClick={() => setViewMode("list")} className={cn("rounded px-2 py-1", viewMode === "list" ? "bg-bg-surface text-brand-600" : "text-text-secondary")}><List size={15} /></button>
            </div>
            <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)} className="h-10 rounded-md border border-border bg-bg-surface px-3 text-sm text-text-secondary">
              <option value="newest">Mới nhất</option>
              <option value="name">Tên</option>
              <option value="size">Kích thước</option>
            </select>
            <input ref={fileInputRef} type="file" accept={ACCEPTED} multiple className="hidden" onChange={(e) => e.target.files && void handleUploadFiles(e.target.files)} />
            <Button size="sm" iconLeft={<Upload size={14} />} onClick={() => fileInputRef.current?.click()}>Upload</Button>
          </div>

          {progress.length > 0 ? (
            <div className="rounded-md border border-border bg-bg-sunken p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">Upload Progress</p>
              <div className="space-y-2">
                {progress.slice(-5).map((item) => (
                  <div key={item.id}>
                    <div className="mb-1 flex items-center justify-between text-xs"><span>{item.name}</span><span>{item.status === "error" ? "Lỗi" : `${item.progress}%`}</span></div>
                    <div className="h-2 rounded bg-bg-elevated"><div className={cn("h-2 rounded", item.status === "error" ? "bg-error-500" : "bg-brand-500")} style={{ width: `${item.progress}%` }} /></div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {!isLoading && filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-bg-surface p-10 text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-600"><BookOpen size={28} /></div>
              <h3 className="text-lg font-semibold text-text-primary">Chưa có notebook nào được lưu</h3>
              <p className="mt-1 text-sm text-text-secondary">Mở một workspace và bắt đầu code!</p>
              <div className="mt-4"><Link href="/workspaces/new"><Button size="sm">Tạo workspace mới</Button></Link></div>
            </div>
          ) : null}

          {viewMode === "grid" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((item) => (
                <div key={item.path} className="group rounded-lg border border-border bg-bg-surface p-4 transition hover:shadow-md">
                  <p className="text-3xl">📓</p>
                  <button onClick={() => setPreviewPath(item.path)} className="mt-3 line-clamp-1 text-left font-semibold text-text-primary hover:text-brand-600">{item.name}</button>
                  <p className="text-xs text-text-tertiary">{formatSize(item.size)}</p>
                  <p className="text-xs text-text-tertiary">{item.last_modified ? formatDistanceToNow(new Date(item.last_modified), { addSuffix: true }) : "-"}</p>
                  <div className="mt-3 hidden gap-1 group-hover:flex">
                    <Button size="sm" variant="outline" iconLeft={<Download size={13} />} onClick={() => void handleDownload(item.path, item.name)}>Download</Button>
                    <Button size="sm" variant="secondary" onClick={() => restoreMutation.mutate({ path: item.path, workspaceId: item.workspace_id })}>Open in WS</Button>
                    <Button size="sm" variant="ghost" iconLeft={<Trash2 size={13} />} onClick={() => deleteMutation.mutate(item.path)} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-tertiary">
                    <th className="py-2">Name</th><th className="py-2">Workspace</th><th className="py-2">Size</th><th className="py-2">Modified</th><th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => (
                    <tr key={item.path} className="border-b border-border/70 hover:bg-bg-elevated">
                      <td className="py-3"><button onClick={() => setPreviewPath(item.path)} className="font-medium text-text-primary hover:text-brand-600">{item.name}</button></td>
                      <td className="py-3 text-text-secondary">{workspaceName(item.workspace_id)}</td>
                      <td className="py-3 text-text-secondary">{formatSize(item.size)}</td>
                      <td className="py-3 text-text-secondary">{item.last_modified ? formatDistanceToNow(new Date(item.last_modified), { addSuffix: true }) : "-"}</td>
                      <td className="py-3">
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" iconLeft={<Download size={13} />} onClick={() => void handleDownload(item.path, item.name)} />
                          <Button size="sm" variant="ghost" onClick={() => restoreMutation.mutate({ path: item.path, workspaceId: item.workspace_id })}>▶</Button>
                          <Button size="sm" variant="ghost" iconLeft={<Trash2 size={13} />} onClick={() => deleteMutation.mutate(item.path)} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {dragActive ? (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-brand-500/15">
          <div className="rounded-xl border-2 border-dashed border-brand-500 bg-bg-surface px-10 py-8 text-brand-600">Thả file vào đây</div>
        </div>
      ) : null}

      <div className={cn("fixed right-0 top-0 z-50 h-full w-full max-w-[480px] transform border-l border-border bg-bg-surface shadow-xl transition-transform", previewPath ? "translate-x-0" : "translate-x-full")}>
        <div className="flex items-start justify-between border-b border-border p-4">
          <div>
            <p className="font-semibold text-text-primary">{previewPath?.split("/").pop()}</p>
            <p className="text-xs text-text-secondary">{previewPath}</p>
          </div>
          <button onClick={() => setPreviewPath(null)} className="rounded p-1 hover:bg-bg-elevated"><X size={16} /></button>
        </div>
        <div className="h-[calc(100%-140px)] overflow-auto p-4">
          {previewQuery.isLoading ? <p className="text-sm text-text-secondary">Đang tải preview...</p> : null}
          {previewPath?.endsWith(".ipynb") ? (
            <div className="space-y-3">
              {notebookCells.map((cell, idx) => (
                <div key={idx} className="rounded-md border border-border bg-bg-sunken p-3">
                  <p className="mb-2 text-xs uppercase tracking-wide text-text-tertiary">{cell.cell_type || "cell"}</p>
                  <pre className="whitespace-pre-wrap text-xs text-text-primary">{(cell.source || []).join("")}</pre>
                </div>
              ))}
            </div>
          ) : (
            <pre className="whitespace-pre-wrap rounded-md border border-border bg-bg-sunken p-3 text-xs">{previewQuery.data?.content || ""}</pre>
          )}
        </div>
        <div className="flex gap-2 border-t border-border p-4">
          <Button size="sm" variant="outline" iconLeft={<Download size={14} />} onClick={() => previewPath && void handleDownload(previewPath, previewPath.split("/").pop() || "notebook")}>Tải xuống</Button>
          <Button size="sm" onClick={() => previewPath && restoreMutation.mutate({ path: previewPath })}>Mở trong workspace</Button>
        </div>
      </div>
    </div>
  );
}

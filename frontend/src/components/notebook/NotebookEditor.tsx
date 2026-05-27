"use client";

import { AlertTriangle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useCell } from "../../hooks/useCell";
import { useKernel, type UseKernelReturn } from "../../hooks/useKernel";
import { useNotebook, type UseNotebookReturn } from "../../hooks/useNotebook";
import { JUPYTER_CONFIG } from "../../lib/jupyter/config";
import type { CellOutput, DisplayDataContent, ErrorContent, ExecuteResultContent, NotebookCell as NotebookCellType, StreamContent } from "../../lib/jupyter/types";
import { KaggleIDELayout } from "./KaggleIDELayout";
import { NotebookCell } from "./NotebookCell";

interface NotebookEditorProps {
  workspaceId: string;
  notebookPath?: string;
}

interface NotebookCellWrapperProps {
  cell: NotebookCellType;
  index: number;
  isSelected: boolean;
  isExecuting: boolean;
  kernel: UseKernelReturn;
  notebook: UseNotebookReturn;
  onSelect: () => void;
  onAddCellBelow: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onKeyNav: (direction: "up" | "down", currentIndex: number) => void;
}

function getFileName(path: string): string {
  return path.split("/").pop() ?? "Untitled.ipynb";
}

function normalizeNotebookPath(path: string): string {
  const normalized = path.replace(/^\/+/, "");
  if (normalized.startsWith("notebooks/")) {
    return normalized.slice("notebooks/".length);
  }
  return normalized;
}

function ensureWorkspaceNotebookPath(workspaceId: string, path: string): string {
  const normalized = normalizeNotebookPath(path);
  if (normalized.startsWith(`${workspaceId}/`)) {
    return normalized;
  }
  const fileName = normalized.split("/").pop() ?? "main.ipynb";
  return `${workspaceId}/${fileName}`;
}

function NotebookCellWrapper({ cell, index, isSelected, isExecuting, kernel, notebook, onSelect, onAddCellBelow, onDelete, onMoveUp, onMoveDown, onKeyNav }: NotebookCellWrapperProps): JSX.Element {
  const cellExecution = useCell(cell.id, kernel, notebook);

  const handleExecute = useCallback(() => {
    if (cell.cell_type !== "code") return;
    cellExecution.executeCell(cell.source);
  }, [cell.cell_type, cell.source, cellExecution]);

  return (
    <div
      id={`cell-${cell.id}`}
      onKeyDown={(event) => {
        if (!isSelected) return;
        if (event.key === "ArrowUp") {
          event.preventDefault();
          onKeyNav("up", index);
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          onKeyNav("down", index);
        }
      }}
      tabIndex={0}
      className="outline-none"
    >
      <NotebookCell
        cell={cell}
        index={index}
        isSelected={isSelected}
        isExecuting={isExecuting || cellExecution.isExecuting}
        onSelect={onSelect}
        onExecute={handleExecute}
        onSourceChange={(source) => notebook.updateCellSource(cell.id, source)}
        onAddCellBelow={onAddCellBelow}
        onDelete={onDelete}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onSave={() => {
          void notebook.saveNotebook();
        }}
      />
    </div>
  );
}

function NotebookSkeleton(): JSX.Element {
  return (
    <div className="space-y-3">
      <div className="h-[120px] rounded-lg border border-[#E2E8F0] bg-white skeleton-shimmer" />
      <div className="h-[80px] rounded-lg border border-[#E2E8F0] bg-white skeleton-shimmer" />
      <div className="h-[160px] rounded-lg border border-[#E2E8F0] bg-white skeleton-shimmer" />
    </div>
  );
}

function NotebookError({ error, onRetry }: { error: string; onRetry: () => void }): JSX.Element {
  return (
    <div className="rounded-md border border-error-500 bg-error-50 p-3 text-sm text-error-500">
      <p className="flex items-center gap-2 font-medium">
        <AlertTriangle className="h-4 w-4" /> {error}
      </p>
      <button type="button" className="mt-2 rounded border border-error-500 px-2 py-1 text-xs font-medium hover:bg-red-100" onClick={onRetry}>
        Thu lai
      </button>
    </div>
  );
}

export function NotebookEditor({ workspaceId, notebookPath }: NotebookEditorProps): JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const resolvedNotebookPath = useMemo(() => normalizeNotebookPath(notebookPath ?? `${workspaceId}/untitled.ipynb`), [notebookPath, workspaceId]);
  const kernel = useKernel("python3");
  const notebook = useNotebook(resolvedNotebookPath);

  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const [runAllExecutingCellId, setRunAllExecutingCellId] = useState<string | null>(null);
  const [activeFilePath, setActiveFilePath] = useState<string>(resolvedNotebookPath);
  const [notebookName, setNotebookName] = useState<string>(getFileName(resolvedNotebookPath));
  const runAllAbortRef = useRef<boolean>(false);
  const [pendingInject, setPendingInject] = useState<{ code: string; beforeCellIds: string[] } | null>(null);

  useEffect(() => {
    setActiveFilePath(resolvedNotebookPath);
    setNotebookName(getFileName(resolvedNotebookPath));
    setSelectedCellId(null);
  }, [resolvedNotebookPath]);

  useEffect(() => {
    const firstCell = notebook.notebook?.cells[0];
    if (firstCell && !selectedCellId) setSelectedCellId(firstCell.id);
  }, [notebook.notebook?.cells, selectedCellId]);

  const handleCellKeyNav = useCallback(
    (direction: "up" | "down", currentIndex: number) => {
      const cells = notebook.notebook?.cells ?? [];
      const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
      if (cells[nextIndex]) setSelectedCellId(cells[nextIndex].id);
    },
    [notebook.notebook?.cells]
  );

  const runCellAndWait = useCallback(
    (cell: NotebookCellType): Promise<void> =>
      new Promise((resolve) => {
        notebook.clearCellOutputs(cell.id);
        const accumulatedOutputs: CellOutput[] = [];

        const pushOutput = (output: CellOutput): void => {
          const last = accumulatedOutputs[accumulatedOutputs.length - 1];
          if (output.output_type === "stream" && last && last.output_type === "stream" && last.name === output.name) {
            last.text += output.text;
          } else {
            accumulatedOutputs.push(output);
          }
          notebook.updateCellOutputs(cell.id, [...accumulatedOutputs]);
        };

        const complete = (): void => {
          setRunAllExecutingCellId(null);
          resolve();
        };

        const messageId = kernel.executeCode(cell.source, {
          onStream: (content: StreamContent) => pushOutput({ output_type: "stream", name: content.name, text: content.text }),
          onResult: (content: ExecuteResultContent) =>
            pushOutput({ output_type: "execute_result", execution_count: content.execution_count, data: content.data, metadata: content.metadata }),
          onDisplayData: (content: DisplayDataContent) => pushOutput({ output_type: "display_data", data: content.data, metadata: content.metadata }),
          onError: (content: ErrorContent) => {
            pushOutput({ output_type: "error", ename: content.ename, evalue: content.evalue, traceback: content.traceback });
            complete();
          },
          onReply: () => complete()
        });

        if (!messageId) complete();
      }),
    [kernel, notebook]
  );

  const handleRunAll = useCallback(async () => {
    const currentNotebook = notebook.notebook;
    if (!currentNotebook) return;

    runAllAbortRef.current = false;
    const codeCells = currentNotebook.cells.filter((cell) => cell.cell_type === "code");

    for (const cell of codeCells) {
      if (runAllAbortRef.current) break;
      setSelectedCellId(cell.id);
      setRunAllExecutingCellId(cell.id);
      await runCellAndWait(cell);
    }

    setRunAllExecutingCellId(null);
  }, [notebook.notebook, runCellAndWait]);

  const handleRunCell = useCallback(() => {
    const cell = notebook.notebook?.cells.find((c) => c.id === selectedCellId);
    if (cell && cell.cell_type === "code") {
      void runCellAndWait(cell);
    }
  }, [notebook.notebook?.cells, runCellAndWait, selectedCellId]);

  const showConnectionError = Boolean(kernel.error) || kernel.connectionStatus === "error";

  const handleInjectCode = useCallback(
    (code: string) => {
      const cells = notebook.notebook?.cells ?? [];
      const selectedIndex = selectedCellId ? cells.findIndex((c) => c.id === selectedCellId) : -1;
      const insertAfterIndex = selectedIndex >= 0 ? selectedIndex : cells.length - 1;
      const beforeCellIds = cells.map((c) => c.id);

      setPendingInject({ code, beforeCellIds });
      notebook.addCell(insertAfterIndex, "code");
    },
    [notebook, selectedCellId]
  );

  useEffect(() => {
    if (!pendingInject || !notebook.notebook) return;
    const createdCell = notebook.notebook.cells.find((cell) => !pendingInject.beforeCellIds.includes(cell.id));
    if (!createdCell) return;

    notebook.updateCellSource(createdCell.id, pendingInject.code);
    setSelectedCellId(createdCell.id);
    setPendingInject(null);

    setTimeout(() => {
      document.getElementById(`cell-${createdCell.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  }, [notebook, pendingInject]);

  return (
    <KaggleIDELayout
      workspaceId={workspaceId}
      notebookName={notebookName}
      onNameChange={setNotebookName}
      activeFile={activeFilePath}
      onFileOpen={(path, name) => {
        const normalizedPath = ensureWorkspaceNotebookPath(workspaceId, path);
        setActiveFilePath(normalizedPath);
        setNotebookName(name);
        router.replace(`${pathname}?file=${encodeURIComponent(normalizedPath)}`);
        void notebook.loadNotebook(normalizedPath);
      }}
      kernel={kernel}
      notebook={notebook}
      onRunCell={handleRunCell}
      onRunAll={() => {
        void handleRunAll();
      }}
      onInjectCode={handleInjectCode}
    >
      {showConnectionError ? (
        <div className="mb-4 rounded-md border border-error-500 bg-error-50 p-3 text-sm text-error-500">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" /> Không thể kết nối Jupyter Server tại {JUPYTER_CONFIG.baseUrl}
          </p>
          <button
            type="button"
            className="mt-2 rounded border border-error-500 px-2 py-1 text-xs font-medium hover:bg-red-100"
            onClick={() => {
              void kernel.startKernel();
              void notebook.loadNotebook(activeFilePath);
            }}
          >
            Thu lai
          </button>
        </div>
      ) : null}

      {notebook.isLoading ? (
        <NotebookSkeleton />
      ) : notebook.error ? (
        <NotebookError
          error={notebook.error}
          onRetry={() => {
            void notebook.loadNotebook(activeFilePath);
          }}
        />
      ) : (
        <>
          {notebook.notebook?.cells.map((cell, index) => (
            <NotebookCellWrapper
              key={cell.id}
              cell={cell}
              index={index}
              isSelected={selectedCellId === cell.id}
              isExecuting={runAllExecutingCellId === cell.id}
              kernel={kernel}
              notebook={notebook}
              onSelect={() => setSelectedCellId(cell.id)}
              onAddCellBelow={() => notebook.addCell(index)}
              onDelete={() => notebook.deleteCell(cell.id)}
              onMoveUp={() => notebook.moveCellUp(cell.id)}
              onMoveDown={() => notebook.moveCellDown(cell.id)}
              onKeyNav={handleCellKeyNav}
            />
          ))}

          {notebook.notebook?.cells.length === 0 ? (
            <button
              onClick={() => notebook.addCell(0)}
              className="w-full rounded-lg border-2 border-dashed border-[#E2E8F0] py-3 text-sm text-[#94A3B8] transition-all hover:border-[#6366F1] hover:bg-[#EEF2FF] hover:text-[#6366F1]"
            >
              + Thêm cell đầu tiên
            </button>
          ) : null}
        </>
      )}
    </KaggleIDELayout>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { JupyterApiError, JupyterRestClient } from "../lib/jupyter/rest-client";
import type { CellOutput, CellType, NotebookContent } from "../lib/jupyter/types";
import {
  clearAllOutputs as clearAllOutputsModel,
  clearCellOutputs as clearCellOutputsModel,
  createCell,
  createNewNotebook,
  DEFAULT_NOTEBOOK_STARTER_CODE,
  deleteCell as deleteCellModel,
  insertCell,
  moveCellDown as moveCellDownModel,
  moveCellUp as moveCellUpModel,
  serializeToSave,
  updateCellOutputs as updateCellOutputsModel,
  updateCellSource as updateCellSourceModel
} from "../lib/jupyter/notebook-model";

export interface UseNotebookReturn {
  notebook: NotebookContent | null;
  isLoading: boolean;
  isSaving: boolean;
  isDirty: boolean;
  lastSaved: Date | null;
  error: string | null;
  addCell: (afterIndex: number, type?: CellType) => void;
  deleteCell: (cellId: string) => void;
  updateCellSource: (cellId: string, source: string) => void;
  moveCellUp: (cellId: string) => void;
  moveCellDown: (cellId: string) => void;
  updateCellOutputs: (cellId: string, outputs: CellOutput[]) => void;
  clearCellOutputs: (cellId: string) => void;
  clearAllOutputs: () => void;
  saveNotebook: () => Promise<void>;
  loadNotebook: (path: string) => Promise<void>;
}

export function useNotebook(initialPath?: string): UseNotebookReturn {
  const restClientRef = useRef(new JupyterRestClient());
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathRef = useRef<string>(initialPath ?? "");
  const notebookRef = useRef<NotebookContent | null>(null);
  // Track whether the backend was reachable; skip auto-save when it wasn't
  const backendAvailableRef = useRef<boolean>(false);

  const [notebook, setNotebook] = useState<NotebookContent | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    notebookRef.current = notebook;
  }, [notebook]);

  const sourceToText = useCallback((source: unknown): string => {
    if (typeof source === "string") {
      return source;
    }
    if (Array.isArray(source)) {
      return source.join("");
    }
    return "";
  }, []);

  const applyStarterTemplateIfEmpty = useCallback((content: NotebookContent): NotebookContent => {
    const isLegacyStarter = (text: string): boolean => {
      const normalized = text.replace(/\r\n/g, "\n").trim().toLowerCase();
      return (
        normalized.includes("hello from jupyter on docker") ||
        normalized.includes("kaggle/python docker image") ||
        normalized.includes("/kaggle/input")
      );
    };

    // Do not auto-replace user-edited empty notebooks with starter template.
    // Only keep legacy one-cell migration below.

    if (content.cells.length === 1 && content.cells[0].cell_type === "code") {
      const text = sourceToText(content.cells[0].source);
      if (isLegacyStarter(text)) {
        return {
          ...content,
          cells: [
            {
              ...content.cells[0],
              source: DEFAULT_NOTEBOOK_STARTER_CODE,
              outputs: [],
              execution_count: null
            }
          ]
        };
      }
    }

    return content;
  }, [sourceToText]);

  const markDirty = useCallback(() => {
    setIsDirty(true);
  }, []);

  const saveNotebook = useCallback(async (): Promise<void> => {
    const currentNotebook = notebookRef.current;
    if (!currentNotebook || !pathRef.current) {
      return;
    }
    setIsSaving(true);
    setError(null);

    try {
      // FIX [BƯỚC 3]: Save from ref to avoid stale closure snapshot during debounce/manual save races.
      const toSave = serializeToSave(currentNotebook);
      // FIX [BƯỚC 1]: Path diagnostics to verify load/save path consistency.
      console.info("[NotebookSave] resolved pathRef", { path: pathRef.current });
      await restClientRef.current.saveNotebook(pathRef.current, toSave);
      // FIX [BƯỚC 2]: Verify persisted content by refetching with no-store; never show false success.
      const reloaded = await restClientRef.current.getNotebook(pathRef.current);
      const savedSignature = createNotebookSignature(toSave);
      const reloadedSignature = createNotebookSignature(reloaded.content);
      console.info("[NotebookSave] verify signatures", { savedSignature, reloadedSignature });
      if (savedSignature !== reloadedSignature) {
        throw new Error("Notebook verification failed after save");
      }
      setNotebook(toSave);
      setIsDirty(false);
      setLastSaved(new Date());
    } catch (err) {
      const message =
        err instanceof JupyterApiError
          ? `Không thể lưu notebook (${err.status}) tại ${err.endpoint}.`
          : "Không thể lưu notebook.";
      setError(message);
      console.error("Notebook save failed", err);
      // Keep dirty state so user knows changes are not persisted yet.
      setIsDirty(true);
    } finally {
      setIsSaving(false);
    }
  }, []);

  const loadNotebook = useCallback(async (path: string): Promise<void> => {
    const normalizedPath = path.replace(/^\/+/, "");
    setIsLoading(true);
    setError(null);
    pathRef.current = normalizedPath;
    // FIX [BƯỚC 1]: Log normalized path used by GET/PUT.
    console.info("[NotebookLoad] request path", { originalPath: path, normalizedPath });

    try {
      const loaded = await restClientRef.current.getNotebook(normalizedPath);
      const raw = loaded.content;
      pathRef.current = loaded.resolvedPath.replace(/^\/+/, "");
      console.info("[NotebookLoad] resolved pathRef", { path: pathRef.current });
      if (raw.nbformat !== 4) {
        throw new Error("Unsupported notebook format");
      }

      const normalized: NotebookContent = {
        ...raw,
        cells: raw.cells.map((cell) => ({
          ...cell,
          id: cell.id && cell.id.trim().length > 0 ? cell.id : crypto.randomUUID(),
          source: sourceToText(cell.source),
          outputs: cell.outputs ?? [],
          execution_count: typeof cell.execution_count === "number" ? cell.execution_count : null
        }))
      };

      const hydrated = applyStarterTemplateIfEmpty(normalized);
      backendAvailableRef.current = true;
      setNotebook(hydrated);
      setIsDirty(false);
      setLastSaved(new Date());
    } catch (error) {
      if (error instanceof JupyterApiError && error.status === 404) {
        try {
          const createPath = normalizedPath;
          const parentDirectory = createPath.split("/").slice(0, -1).join("/");
          if (parentDirectory.length > 0) {
            const segments = parentDirectory.split("/").filter((segment) => segment.length > 0);
            let progressivePath = "";
            for (const segment of segments) {
              progressivePath = progressivePath ? `${progressivePath}/${segment}` : segment;
              await restClientRef.current.ensureDirectory(progressivePath);
            }
          }
          const draft = createNewNotebook();
          await restClientRef.current.saveNotebook(createPath, draft);
          pathRef.current = createPath;
          backendAvailableRef.current = true;
          setNotebook(draft);
          // FIX [BƯỚC 4]: New file case should be dirty so user can see unsynced draft intent until first explicit save.
          setIsDirty(true);
          setLastSaved(new Date());
          return;
        } catch {
          setError("Không thể tạo notebook mới trên Jupyter Server.");
          backendAvailableRef.current = false;
          return;
        }
      }
      // FIX [BƯỚC 4]: Do not replace state on 5xx/network errors to avoid silent data-loss overwrite.
      backendAvailableRef.current = false;
      setError("Không thể tải Notebook từ Jupyter Server.");
    } finally {
      setIsLoading(false);
    }
  }, [applyStarterTemplateIfEmpty, sourceToText]);

  const addCell = useCallback((afterIndex: number, type: CellType = "code") => {
    setNotebook((current) => {
      const base = current ?? createNewNotebook();
      const next = insertCell(base, afterIndex, createCell(type));
      return next;
    });
    markDirty();
  }, [markDirty]);

  const deleteCell = useCallback((cellId: string) => {
    setNotebook((current) => (current ? deleteCellModel(current, cellId) : current));
    markDirty();
  }, [markDirty]);

  const updateCellSource = useCallback((cellId: string, source: string) => {
    setNotebook((current) => (current ? updateCellSourceModel(current, cellId, source) : current));
    markDirty();
  }, [markDirty]);

  const moveCellUp = useCallback((cellId: string) => {
    setNotebook((current) => (current ? moveCellUpModel(current, cellId) : current));
    markDirty();
  }, [markDirty]);

  const moveCellDown = useCallback((cellId: string) => {
    setNotebook((current) => (current ? moveCellDownModel(current, cellId) : current));
    markDirty();
  }, [markDirty]);

  const updateCellOutputs = useCallback((cellId: string, outputs: CellOutput[]) => {
    setNotebook((current) => (current ? updateCellOutputsModel(current, cellId, outputs) : current));
    markDirty();
  }, [markDirty]);

  const clearCellOutputs = useCallback((cellId: string) => {
    setNotebook((current) => (current ? clearCellOutputsModel(current, cellId) : current));
    markDirty();
  }, [markDirty]);

  const clearAllOutputs = useCallback(() => {
    setNotebook((current) => (current ? clearAllOutputsModel(current) : current));
    markDirty();
  }, [markDirty]);

  useEffect(() => {
    if (!initialPath) {
      setNotebook((current) => current ?? createNewNotebook());
      return;
    }

    void loadNotebook(initialPath);
  }, [initialPath, loadNotebook]);

  useEffect(() => {
    // Skip auto-save entirely when backend was never reachable.
    // The user can trigger a manual save once the server is running.
    if (!isDirty || !notebook || !pathRef.current || !backendAvailableRef.current) {
      return;
    }

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      void saveNotebook();
    }, 2000);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [isDirty, notebook, saveNotebook]);

  useEffect(() => {
    if (!isDirty) {
      return;
    }

    const handler = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handler);

    return () => {
      window.removeEventListener("beforeunload", handler);
    };
  }, [isDirty]);

  return {
    notebook,
    isLoading,
    isSaving,
    isDirty,
    lastSaved,
    error,
    addCell,
    deleteCell,
    updateCellSource,
    moveCellUp,
    moveCellDown,
    updateCellOutputs,
    clearCellOutputs,
    clearAllOutputs,
    saveNotebook,
    loadNotebook
  };
}

function createNotebookSignature(notebook: NotebookContent): string {
  const normalizedCells = notebook.cells.map((cell) => ({
    cell_type: cell.cell_type,
    source: Array.isArray(cell.source) ? cell.source.join("") : String(cell.source ?? ""),
    outputsCount: Array.isArray(cell.outputs) ? cell.outputs.length : 0
  }));
  return JSON.stringify({
    nbformat: notebook.nbformat,
    nbformat_minor: notebook.nbformat_minor,
    cells: normalizedCells
  });
}

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteStoredNotebook,
  getNotebookContent,
  getNotebookDownloadUrl,
  listStoredNotebooks,
  restoreNotebookToWorkspace,
  uploadStoredNotebook
} from "@/lib/api/storage";

const NOTEBOOKS_QUERY_KEY = ["stored-notebooks"];

export const useStoredNotebooks = () =>
  useQuery({
    queryKey: NOTEBOOKS_QUERY_KEY,
    queryFn: () => listStoredNotebooks(),
    staleTime: 20_000
  });

export const useNotebookPreview = (path: string | null) =>
  useQuery({
    queryKey: ["stored-notebook-content", path],
    queryFn: () => getNotebookContent(path || ""),
    enabled: Boolean(path)
  });

export const useUploadNotebook = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, workspaceId, onUploadProgress }: { file: File; workspaceId: string; onUploadProgress?: Parameters<typeof uploadStoredNotebook>[2] }) =>
      uploadStoredNotebook(file, workspaceId, onUploadProgress),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: NOTEBOOKS_QUERY_KEY })
  });
};

export const useDeleteNotebook = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (path: string) => deleteStoredNotebook(path),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: NOTEBOOKS_QUERY_KEY })
  });
};

export const useRestoreNotebook = () =>
  useMutation({
    mutationFn: ({ path, workspaceId }: { path: string; workspaceId?: string }) => restoreNotebookToWorkspace(path, workspaceId)
  });

export const getDownloadPresignedUrl = (path: string) => getNotebookDownloadUrl(path);

import type { AxiosProgressEvent } from "axios";
import { apiClient } from "@/lib/api/client";

export type StoredNotebook = {
  name: string;
  size: number;
  last_modified: string | null;
  workspace_id: string;
  path: string;
};

export const listStoredNotebooks = async (workspaceId?: string) => {
  const { data } = await apiClient.get<{ items: StoredNotebook[] }>("/storage/notebooks", {
    params: workspaceId ? { workspace_id: workspaceId } : undefined
  });
  return data.items;
};

export const getNotebookDownloadUrl = async (path: string, expires = 3600) => {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const { data } = await apiClient.get<{ url: string; expires_in: number }>(`/storage/notebooks/${encodedPath}/download`, { params: { expires } });
  return data;
};

export const getNotebookContent = async (path: string) => {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const { data } = await apiClient.get<{ path: string; content: string }>(`/storage/notebooks/${encodedPath}/content`);
  return data;
};

export const restoreNotebookToWorkspace = async (path: string, workspaceId?: string) => {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const { data } = await apiClient.post<{
    workspace_id: string;
    requested_path: string;
    files_restored: number;
    bytes_transferred: number;
    errors: string[];
  }>(`/storage/notebooks/${encodedPath}/restore`, null, {
    params: workspaceId ? { workspace_id: workspaceId } : undefined
  });
  return data;
};

export const deleteStoredNotebook = async (path: string) => {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  await apiClient.delete(`/storage/notebooks/${encodedPath}`);
};

export const uploadStoredNotebook = async (
  file: File,
  workspaceId: string,
  onUploadProgress?: (evt: AxiosProgressEvent) => void
) => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("workspace_id", workspaceId);
  const { data } = await apiClient.post<{ item: StoredNotebook }>("/storage/notebooks/upload", formData, { onUploadProgress });
  return data.item;
};

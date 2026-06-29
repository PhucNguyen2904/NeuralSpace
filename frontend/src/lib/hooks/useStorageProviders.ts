import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, unwrapResponse } from "@/lib/api/client";

export interface StorageConnection {
  id: string;
  user_id: string;
  provider: string;
  remote_name: string;
  display_name: string;
  created_at: string;
  updated_at: string;
  status: string;
  is_default: boolean;
  last_sync_at?: string | null;
}

export function useConnectGoogleDrive() {
  return useMutation({
    mutationFn: async (displayName: string) => {
      const searchParams = new URLSearchParams({ display_name: displayName });
      return unwrapResponse(apiClient.get(`/storage/google/oauth/url?${searchParams.toString()}`));
    },
    onSuccess: (data: { url: string }) => {
      window.location.href = data.url;
    },
  });
}

export function useStorageConnections() {
  return useQuery({
    queryKey: ["storage-connections"],
    queryFn: async (): Promise<StorageConnection[]> => {
      return unwrapResponse(apiClient.get("/storage/list"));
    },
  });
}

export function useConnectStorage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { provider: string; remote_name: string; display_name: string; params: Record<string, string> }) => {
      try {
        return await unwrapResponse(apiClient.post("/storage/connect", payload));
      } catch (error: any) {
        throw new Error(error.response?.data?.detail || "Failed to connect storage provider");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["storage-connections"] });
    },
  });
}

export function useDisconnectStorage() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      return unwrapResponse(apiClient.post(`/storage/${id}/disconnect`));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["storage-connections"] });
    },
  });
}

export function useSetDefaultStorage() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      return unwrapResponse(apiClient.post(`/storage/${id}/default`));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["storage-connections"] });
    },
  });
}

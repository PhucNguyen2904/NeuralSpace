import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, unwrapResponse } from "@/lib/api/client";

export interface StorageProvider {
  id: string;
  name: string;
  type: "minio" | "s3" | "gdrive";
  config: Record<string, any>;
  is_active: boolean;
  created_at: string;
}

export function useStorageProviders() {
  return useQuery({
    queryKey: ["storage-providers"],
    queryFn: async (): Promise<StorageProvider[]> => {
      return unwrapResponse(apiClient.get("/storage-providers"));
    },
  });
}

export function useCreateStorageProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { name: string; type: string; config: any; is_active?: boolean }) => {
      try {
        return await unwrapResponse(apiClient.post("/storage-providers", payload));
      } catch (error: any) {
        throw new Error(error.response?.data?.detail || "Failed to create storage provider");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["storage-providers"] });
    },
  });
}

export function useDeleteStorageProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await unwrapResponse(apiClient.delete(`/storage-providers/${id}`));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["storage-providers"] });
    },
  });
}

export function useGoogleOAuthLogin() {
  return useMutation({
    mutationFn: async () => {
      const response = await apiClient.get("/storage/google/oauth/login?action=connect");
      if (response.data?.url) {
        window.location.href = response.data.url;
      }
    },
    onError: (error: any) => {
      console.error("Google OAuth login failed:", error);
      alert(
        "Failed to initiate Google Drive Connect. " + 
        (error.response?.status === 401 ? "Your session may have expired. Please log out and log back in." : "Please check your network and backend logs.")
      );
    }
  });
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../api/client";

export interface GitAccount {
  id: string;
  provider: string;
  username: string;
  created_at: string;
}

export interface GitRepository {
  id: string;
  repo_name: string;
  repo_url: string;
  is_private: boolean;
  is_tracked: boolean;
  tracked_branch: string;
  last_sync_time: string | null;
  sync_status: string | null;
}

export function useGitAccounts() {
  return useQuery<GitAccount[]>({
    queryKey: ["gitAccounts"],
    queryFn: async () => {
      const response = await apiClient.get("/git/accounts");
      return response.data;
    }
  });
}

export function useGitOAuthLogin() {
  return useMutation({
    mutationFn: async () => {
      const response = await apiClient.get("/git/accounts/oauth/login");
      if (response.data?.url) {
        window.location.href = response.data.url;
      }
    },
    onError: (error: any) => {
      console.error("OAuth login failed:", error);
      alert(
        "Failed to initiate GitHub Connect. " + 
        (error.response?.status === 401 ? "Your session may have expired. Please log out and log back in." : "Please check your network and backend logs.")
      );
    }
  });
}

export function useDisconnectGitAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (accountId: string) => {
      await apiClient.delete(`/git/accounts/${accountId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gitAccounts"] });
    }
  });
}

export function useGitRepositories(accountId: string | undefined) {
  return useQuery<GitRepository[]>({
    queryKey: ["gitRepositories", accountId],
    queryFn: async () => {
      const response = await apiClient.get(`/git/accounts/${accountId}/repos`);
      return response.data;
    },
    enabled: !!accountId
  });
}

export function useTrackedRepositories() {
  return useQuery<GitRepository[]>({
    queryKey: ["trackedRepositories"],
    queryFn: async () => {
      const response = await apiClient.get("/git/accounts/tracked-repos");
      return response.data;
    }
  });
}

export function useUntrackedRepositories() {
  return useQuery<GitRepository[]>({
    queryKey: ["untrackedRepositories"],
    queryFn: async () => {
      const response = await apiClient.get("/git/accounts/untracked-repos");
      return response.data;
    }
  });
}

export function useTrackRepository() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ repoId, payload }: { repoId: string; payload: { is_tracked: boolean; tracked_branch?: string } }) => {
      const response = await apiClient.put(`/git/accounts/repos/${repoId}/track`, payload);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gitRepositories"] });
      queryClient.invalidateQueries({ queryKey: ["trackedRepositories"] });
      queryClient.invalidateQueries({ queryKey: ["untrackedRepositories"] });
    }
  });
}

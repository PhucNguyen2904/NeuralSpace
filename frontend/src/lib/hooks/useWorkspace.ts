"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createWorkspace,
  deleteWorkspace,
  getKernelStatus,
  getWorkspaceAccessToken,
  getWorkspaceById,
  getWorkspaceResources,
  getWorkspaceStatus,
  heartbeatWorkspace,
  listWorkspaceFiles,
  listWorkspaces,
  stopWorkspace
} from "@/lib/api/workspaces";
import type { CreateWorkspaceInput, Workspace, WorkspaceFileNode } from "@/types/workspace";

const WORKSPACES_QUERY_KEY = ["workspaces"];

export const useWorkspaces = () =>
  useQuery({
    queryKey: WORKSPACES_QUERY_KEY,
    queryFn: listWorkspaces,
    staleTime: 30_000,
    refetchInterval: (query) => {
      const data = query.state.data as Workspace[] | undefined;
      return data?.some((workspace) => workspace.status === "PROVISIONING") ? 10_000 : false;
    }
  });

export const useWorkspaceDetail = (id: string) =>
  useQuery({
    queryKey: ["workspace", id],
    queryFn: () => getWorkspaceById(id),
    enabled: Boolean(id)
  });

export const useWorkspaceStatus = (id: string) =>
  useQuery({
    queryKey: ["workspace-status", id],
    queryFn: () => getWorkspaceStatus(id),
    enabled: Boolean(id)
  });

export const useWorkspaceFiles = (id: string) =>
  useQuery<WorkspaceFileNode[]>({
    queryKey: ["workspace-files", id],
    queryFn: () => listWorkspaceFiles(id),
    enabled: Boolean(id),
    staleTime: 30_000
  });

export const useWorkspaceResources = (id: string) =>
  useQuery({
    queryKey: ["workspace-resources", id],
    queryFn: () => getWorkspaceResources(id),
    enabled: Boolean(id),
    refetchInterval: 10_000
  });

export const useWorkspaceToken = (id: string) =>
  useQuery({
    queryKey: ["workspace-token", id],
    queryFn: () => getWorkspaceAccessToken(id),
    enabled: Boolean(id),
    staleTime: 0
  });

export const useKernelStatusQuery = (id: string, enabled = true) =>
  useQuery({
    queryKey: ["workspace-kernel", id],
    queryFn: () => getKernelStatus(id),
    enabled: Boolean(id) && enabled,
    refetchInterval: 5_000
  });

export const useHeartbeatMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => heartbeatWorkspace(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["workspace", id] });
    }
  });
};

export const useCreateWorkspaceMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateWorkspaceInput) => createWorkspace(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WORKSPACES_QUERY_KEY });
    }
  });
};

export const useDeleteWorkspace = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteWorkspace(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: WORKSPACES_QUERY_KEY });
      const previous = queryClient.getQueryData<Workspace[]>(WORKSPACES_QUERY_KEY) ?? [];
      queryClient.setQueryData<Workspace[]>(WORKSPACES_QUERY_KEY, previous.filter((workspace) => workspace.id !== id));
      return { previous };
    },
    onError: (_error, _id, context) => {
      queryClient.setQueryData(WORKSPACES_QUERY_KEY, context?.previous ?? []);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: WORKSPACES_QUERY_KEY });
    }
  });
};

export const useStopWorkspace = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => stopWorkspace(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WORKSPACES_QUERY_KEY });
    }
  });
};

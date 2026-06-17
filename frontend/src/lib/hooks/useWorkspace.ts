"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createWorkspace,
  deleteWorkspace,
  getWorkspaceById,
  getWorkspaceRunData,
  launchWorkspaceInColab,
  listWorkspaces,
  updateWorkspaceAssets,
} from "@/lib/api/workspaces";
import { useNotificationStore } from "@/lib/stores/notificationStore";
import type { ColabLaunchResult, CreateWorkspaceInput, Workspace } from "@/types/workspace";

const WORKSPACES_QUERY_KEY = ["workspaces"];

export const useWorkspaces = (enabled = true) =>
  useQuery({
    queryKey: WORKSPACES_QUERY_KEY,
    queryFn: listWorkspaces,
    enabled,
    staleTime: 30_000,
    refetchInterval: (query) => {
      const data = query.state.data as Workspace[] | undefined;
      return data?.some((workspace) => workspace.status === "RUNNING") ? 10_000 : false;
    }
  });

export const useWorkspaceDetail = (id: string) =>
  useQuery({
    queryKey: ["workspace", id],
    queryFn: () => getWorkspaceById(id),
    enabled: Boolean(id),
    staleTime: 60_000,
  });

export const useCreateWorkspaceMutation = () => {
  const queryClient = useQueryClient();
  const addNotification = useNotificationStore((state) => state.addNotification);
  return useMutation({
    mutationFn: (input: CreateWorkspaceInput) => createWorkspace(input),
    onSuccess: (workspace) => {
      addNotification({
        type: "WORKSPACE_STARTED",
        title: "Workspace ready",
        description: `${workspace.name} is ready to use.`,
        workspaceId: workspace.id
      });
      queryClient.invalidateQueries({ queryKey: WORKSPACES_QUERY_KEY });
    }
  });
};

export const useDeleteWorkspace = () => {
  const queryClient = useQueryClient();
  const addNotification = useNotificationStore((state) => state.addNotification);

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
    onSuccess: (_result, id) => {
      addNotification({
        type: "WORKSPACE_KILLED",
        title: "Workspace closed",
        description: "Workspace deletion was scheduled.",
        workspaceId: id
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: WORKSPACES_QUERY_KEY });
    }
  });
};

export const useLaunchWorkspaceInColab = () => {
  const queryClient = useQueryClient();
  return useMutation<ColabLaunchResult, Error, string>({
    mutationFn: (id: string) => launchWorkspaceInColab(id),
    onSuccess: (_result, id) => {
      queryClient.invalidateQueries({ queryKey: ["workspace-run-data", id] });
    }
  });
};

export const useUpdateWorkspaceAssets = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, datasets, models }: { id: string; datasets: string[]; models: string[] }) =>
      updateWorkspaceAssets(id, { datasets, models }),
    onSuccess: (workspace) => {
      queryClient.setQueryData(["workspace", workspace.id], workspace);
      queryClient.invalidateQueries({ queryKey: WORKSPACES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["workspace", workspace.id] });
    }
  });
};

/** Polls session + run data every 15 seconds for the Data Dashboard. */
export const useWorkspaceRunData = (id: string) =>
  useQuery({
    queryKey: ["workspace-run-data", id],
    queryFn: () => getWorkspaceRunData(id),
    enabled: Boolean(id),
    refetchInterval: (query) =>
      query.state.data !== null ? 15_000 : false,  // only poll when a session exists
    staleTime: 10_000,
  });

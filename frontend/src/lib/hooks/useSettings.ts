"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  changePassword,
  createApiKey,
  getSettings,
  revokeApiKey,
  updateNotificationPrefs,
  updateProfile,
  updateWorkspaceDefaults,
  type NotificationPrefs,
  type SettingsPayload,
  type UserProfile,
  type WorkspaceDefaults
} from "@/lib/api/settings";

const SETTINGS_KEY = ["settings"];

export const useSettings = () =>
  useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: getSettings,
    staleTime: 30_000
  });

const patchCache = (old: SettingsPayload | undefined, patcher: (draft: SettingsPayload) => SettingsPayload) => {
  if (!old) return old;
  return patcher(structuredClone(old));
};

export const useUpdateProfile = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<UserProfile>) => updateProfile(payload),
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: SETTINGS_KEY });
      const prev = queryClient.getQueryData<SettingsPayload>(SETTINGS_KEY);
      queryClient.setQueryData<SettingsPayload | undefined>(SETTINGS_KEY, (old) =>
        patchCache(old, (draft) => ({ ...draft, profile: { ...draft.profile, ...payload } }))
      );
      return { prev };
    },
    onError: (_e, _p, ctx) => queryClient.setQueryData(SETTINGS_KEY, ctx?.prev),
    onSettled: () => queryClient.invalidateQueries({ queryKey: SETTINGS_KEY })
  });
};

export const useChangePassword = () =>
  useMutation({
    mutationFn: (payload: { currentPassword: string; newPassword: string }) => changePassword(payload)
  });

export const useUpdateWorkspaceDefaults = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<WorkspaceDefaults>) => updateWorkspaceDefaults(payload),
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: SETTINGS_KEY });
      const prev = queryClient.getQueryData<SettingsPayload>(SETTINGS_KEY);
      queryClient.setQueryData<SettingsPayload | undefined>(SETTINGS_KEY, (old) =>
        patchCache(old, (draft) => ({ ...draft, defaults: { ...draft.defaults, ...payload } }))
      );
      return { prev };
    },
    onError: (_e, _p, ctx) => queryClient.setQueryData(SETTINGS_KEY, ctx?.prev),
    onSettled: () => queryClient.invalidateQueries({ queryKey: SETTINGS_KEY })
  });
};

export const useUpdateNotifications = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<NotificationPrefs>) => updateNotificationPrefs(payload),
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: SETTINGS_KEY });
      const prev = queryClient.getQueryData<SettingsPayload>(SETTINGS_KEY);
      queryClient.setQueryData<SettingsPayload | undefined>(SETTINGS_KEY, (old) =>
        patchCache(old, (draft) => ({ ...draft, notifications: { ...draft.notifications, ...payload } }))
      );
      return { prev };
    },
    onError: (_e, _p, ctx) => queryClient.setQueryData(SETTINGS_KEY, ctx?.prev),
    onSettled: () => queryClient.invalidateQueries({ queryKey: SETTINGS_KEY })
  });
};

export const useCreateApiKey = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createApiKey(name),
    onMutate: async (name) => {
      await queryClient.cancelQueries({ queryKey: SETTINGS_KEY });
      const prev = queryClient.getQueryData<SettingsPayload>(SETTINGS_KEY);
      const optimisticId = `temp_${Date.now()}`;
      queryClient.setQueryData<SettingsPayload | undefined>(SETTINGS_KEY, (old) =>
        patchCache(old, (draft) => ({
          ...draft,
          apiKeys: [
            {
              id: optimisticId,
              name,
              maskedKey: "nsk_****************PEND",
              createdAt: new Date().toISOString(),
              lastUsedAt: null
            },
            ...draft.apiKeys
          ]
        }))
      );
      return { prev, optimisticId };
    },
    onError: (_e, _p, ctx) => queryClient.setQueryData(SETTINGS_KEY, ctx?.prev),
    onSettled: () => queryClient.invalidateQueries({ queryKey: SETTINGS_KEY })
  });
};

export const useRevokeApiKey = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => revokeApiKey(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: SETTINGS_KEY });
      const prev = queryClient.getQueryData<SettingsPayload>(SETTINGS_KEY);
      queryClient.setQueryData<SettingsPayload | undefined>(SETTINGS_KEY, (old) =>
        patchCache(old, (draft) => ({ ...draft, apiKeys: draft.apiKeys.filter((item) => item.id !== id) }))
      );
      return { prev };
    },
    onError: (_e, _p, ctx) => queryClient.setQueryData(SETTINGS_KEY, ctx?.prev),
    onSettled: () => queryClient.invalidateQueries({ queryKey: SETTINGS_KEY })
  });
};

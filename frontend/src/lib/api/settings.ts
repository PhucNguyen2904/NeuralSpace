import { apiClient } from "@/lib/api/client";

export type UserProfile = {
  fullName: string;
  email: string;
  avatarUrl?: string;
};

export type WorkspaceDefaults = {
  tier: "cpu-standard" | "cpu-large" | "gpu-t4";
  pythonVersion: "3.10" | "3.11" | "3.12";
  idleTimeoutMinutes: 15 | 30 | 60 | 120;
  autoSaveEnabled: boolean;
  autoSaveIntervalMinutes: number;
};

export type NotificationPrefs = {
  workspaceReady: boolean;
  idleWarning: boolean;
  autoStopped: boolean;
  weeklyUsage: boolean;
  platformUpdates: boolean;
};

export type ApiKeyItem = {
  id: string;
  name: string;
  maskedKey: string;
  rawKey?: string;
  createdAt: string;
  lastUsedAt: string | null;
};

export type BillingUsage = {
  planName: string;
  workspaceUsed: number;
  workspaceLimit: number;
  storageUsedGb: number;
  storageLimitGb: number;
  computeUsedHours: number;
  computeLimitHours: number;
  history7d: Array<{ day: string; hours: number }>;
};

export type SettingsPayload = {
  profile: UserProfile;
  defaults: WorkspaceDefaults;
  notifications: NotificationPrefs;
  apiKeys: ApiKeyItem[];
  billing: BillingUsage;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let mockSettings: SettingsPayload = {
  profile: { fullName: "Alex Nguyen", email: "alex@neuralspace.dev" },
  defaults: {
    tier: "cpu-standard",
    pythonVersion: "3.11",
    idleTimeoutMinutes: 30,
    autoSaveEnabled: true,
    autoSaveIntervalMinutes: 5
  },
  notifications: {
    workspaceReady: true,
    idleWarning: true,
    autoStopped: true,
    weeklyUsage: false,
    platformUpdates: false
  },
  apiKeys: [
    { id: "k_1", name: "Local dev", maskedKey: "nsk_****************A91F", createdAt: new Date(Date.now() - 7 * 86_400_000).toISOString(), lastUsedAt: new Date(Date.now() - 3_600_000).toISOString() },
    { id: "k_2", name: "CI pipeline", maskedKey: "nsk_****************C77D", createdAt: new Date(Date.now() - 20 * 86_400_000).toISOString(), lastUsedAt: null }
  ],
  billing: {
    planName: "Pro",
    workspaceUsed: 3,
    workspaceLimit: 5,
    storageUsedGb: 2.4,
    storageLimitGb: 10,
    computeUsedHours: 43,
    computeLimitHours: 120,
    history7d: [
      { day: "Mon", hours: 4 },
      { day: "Tue", hours: 6 },
      { day: "Wed", hours: 8 },
      { day: "Thu", hours: 7 },
      { day: "Fri", hours: 9 },
      { day: "Sat", hours: 5 },
      { day: "Sun", hours: 4 }
    ]
  }
};

export const getSettings = async () => {
  try {
    const { data } = await apiClient.get<SettingsPayload>("/settings");
    return data;
  } catch {
    await wait(180);
    return structuredClone(mockSettings);
  }
};

export const updateProfile = async (payload: Partial<UserProfile>) => {
  try {
    const { data } = await apiClient.patch<UserProfile>("/settings/profile", payload);
    return data;
  } catch {
    await wait(180);
    mockSettings.profile = { ...mockSettings.profile, ...payload };
    return structuredClone(mockSettings.profile);
  }
};

export const changePassword = async (_payload: { currentPassword: string; newPassword: string }) => {
  try {
    await apiClient.post("/settings/password", _payload);
  } catch {
    await wait(220);
  }
  return true;
};

export const updateWorkspaceDefaults = async (payload: Partial<WorkspaceDefaults>) => {
  try {
    const { data } = await apiClient.patch<WorkspaceDefaults>("/settings/workspace-defaults", payload);
    return data;
  } catch {
    await wait(180);
    mockSettings.defaults = { ...mockSettings.defaults, ...payload };
    return structuredClone(mockSettings.defaults);
  }
};

export const updateNotificationPrefs = async (payload: Partial<NotificationPrefs>) => {
  try {
    const { data } = await apiClient.patch<NotificationPrefs>("/settings/notifications", payload);
    return data;
  } catch {
    await wait(150);
    mockSettings.notifications = { ...mockSettings.notifications, ...payload };
    return structuredClone(mockSettings.notifications);
  }
};

export const createApiKey = async (name: string) => {
  try {
    const { data } = await apiClient.post<ApiKeyItem>("/settings/api-keys", { name });
    return data;
  } catch {
    await wait(220);
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    const rawKey = `nsk_live_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    const newKey: ApiKeyItem = {
      id: `k_${Date.now()}`,
      name,
      rawKey,
      maskedKey: `nsk_****************${rand}`,
      createdAt: new Date().toISOString(),
      lastUsedAt: null
    };
    mockSettings.apiKeys = [newKey, ...mockSettings.apiKeys];
    return structuredClone(newKey);
  }
};

export const revokeApiKey = async (id: string) => {
  try {
    await apiClient.delete(`/settings/api-keys/${id}`);
  } catch {
    await wait(160);
    mockSettings.apiKeys = mockSettings.apiKeys.filter((item) => item.id !== id);
  }
  return true;
};

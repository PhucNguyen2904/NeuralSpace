import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type NotificationType =
  | "WORKSPACE_RUNNING"
  | "WORKSPACE_STARTED"
  | "IDLE_WARNING"
  | "WORKSPACE_KILLED"
  | "WORKSPACE_ERROR"
  | "SAVE_COMPLETE"
  | "QUOTA_WARNING";

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  description: string;
  workspaceId?: string;
  actionLabel?: string;
  read: boolean;
  createdAt: string;
}

interface NotificationState {
  notifications: NotificationItem[];
  unreadCount: number;
  addNotification: (n: Omit<NotificationItem, "id" | "read" | "createdAt">) => void;
  markAllRead: () => void;
  clearAll: () => void;
  markRead: (id: string) => void;
}

const safeStorage =
  typeof window !== "undefined"
    ? createJSONStorage(() => localStorage)
    : createJSONStorage(() => ({
        getItem: () => null,
        setItem: () => undefined,
        removeItem: () => undefined
      }));

const calculateUnread = (notifications: NotificationItem[]) => notifications.filter((item) => !item.read).length;

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set) => ({
      notifications: [],
      unreadCount: 0,
      addNotification: (n) =>
        set((state) => {
          const notifications = [
            {
              ...n,
              id: `n_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              read: false,
              createdAt: new Date().toISOString()
            },
            ...state.notifications
          ].slice(0, 50);

          return { notifications, unreadCount: calculateUnread(notifications) };
        }),
      markAllRead: () =>
        set((state) => {
          const notifications = state.notifications.map((item) => ({ ...item, read: true }));
          return { notifications, unreadCount: 0 };
        }),
      clearAll: () => set({ notifications: [], unreadCount: 0 }),
      markRead: (id) =>
        set((state) => {
          const notifications = state.notifications.map((item) => (item.id === id ? { ...item, read: true } : item));
          return { notifications, unreadCount: calculateUnread(notifications) };
        })
    }),
    {
      name: "neuralspace-notifications",
      storage: safeStorage,
      partialize: (state) => ({ notifications: state.notifications.slice(0, 50), unreadCount: state.unreadCount })
    }
  )
);

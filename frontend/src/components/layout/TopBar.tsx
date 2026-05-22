"use client";

import { Bell } from "lucide-react";
import { useState } from "react";
import { NotificationPanel } from "@/components/layout/NotificationPanel";
import { useNotificationStore } from "@/lib/stores/notificationStore";

export function TopBar() {
  const [openPanel, setOpenPanel] = useState(false);
  const unreadCount = useNotificationStore((state) => state.unreadCount);

  return (
    <>
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-bg-surface px-6">
        <div className="text-sm text-text-secondary">Workspace / Dashboard</div>
        <div className="flex items-center gap-4">
          <button className={`relative rounded-md p-2 hover:bg-bg-elevated ${unreadCount > 0 ? "bell-pulse" : ""}`} aria-label="Notifications" onClick={() => setOpenPanel((prev) => !prev)}>
            <Bell size={18} className="text-text-secondary" />
            {unreadCount > 0 ? (
              <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-error-500 px-1 text-center text-[10px] font-semibold text-white unread-pop">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            ) : null}
          </button>
          <div className="rounded-md border border-border bg-bg-surface px-3 py-1.5 text-sm text-text-secondary">Profile · Settings · Sign out</div>
        </div>
      </header>
      <NotificationPanel open={openPanel} onClose={() => setOpenPanel(false)} />
    </>
  );
}

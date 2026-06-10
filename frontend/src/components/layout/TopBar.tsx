"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, ChevronDown, LogOut, Settings, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NotificationPanel } from "@/components/layout/NotificationPanel";
import { Avatar } from "@/components/ui/Avatar";
import { useAuth } from "@/lib/hooks/useAuth";
import { useNotificationStore } from "@/lib/stores/notificationStore";

export function TopBar() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [openPanel, setOpenPanel] = useState(false);
  const [openAccountMenu, setOpenAccountMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const unreadCount = useNotificationStore((state) => state.unreadCount);
  const displayName = user?.name?.trim() || "User";
  const displayEmail = user?.email?.trim() || "user@example.com";

  useEffect(() => {
    if (!openAccountMenu) return;
    const onPointerDown = (event: PointerEvent): void => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpenAccountMenu(false);
      }
    };
    const onEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setOpenAccountMenu(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onEscape);
    };
  }, [openAccountMenu]);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-bg-base/90 px-4 backdrop-blur md:px-6">
        <nav className="flex min-w-0 items-center gap-2 truncate pr-4 text-sm" aria-label="Breadcrumb">
          <span className="text-text-secondary">Workspace</span>
          <span className="font-mono text-[11px] text-text-tertiary">/</span>
          <span className="font-medium text-text-primary">Dashboard</span>
        </nav>
        <div className="flex items-center gap-3">
          <button className={`relative grid h-9 w-9 place-items-center rounded-md border border-border bg-bg-surface text-text-secondary transition hover:bg-bg-elevated hover:text-text-primary ${unreadCount > 0 ? "bell-pulse" : ""}`} aria-label="Notifications" onClick={() => setOpenPanel((prev) => !prev)}>
            <Bell size={18} className="text-text-secondary" />
            {unreadCount > 0 ? (
              <span className="absolute right-1 top-1 h-2 min-w-2 rounded-full bg-error-500 px-0 text-center text-[0px] font-semibold text-white unread-pop">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            ) : null}
          </button>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={openAccountMenu}
              onClick={() => setOpenAccountMenu((prev) => !prev)}
              className="flex h-9 items-center gap-2 rounded-md border border-border bg-bg-surface px-2 transition-colors hover:bg-bg-elevated"
            >
              <Avatar name={displayName} className="h-7 w-7 text-[11px]" />
              <div className="hidden min-w-0 text-left sm:block">
                <p className="truncate text-xs font-medium text-text-primary">{displayName}</p>
                <p className="truncate text-[11px] text-text-tertiary">{displayEmail}</p>
              </div>
              <ChevronDown size={14} className={`text-text-secondary transition-transform ${openAccountMenu ? "rotate-180" : ""}`} />
            </button>

            {openAccountMenu ? (
              <div className="absolute right-0 z-40 mt-2 w-56 rounded-md border border-border bg-bg-surface p-1 shadow-lg" role="menu">
                <div className="border-b border-border px-2 py-2">
                  <p className="truncate text-xs font-medium text-text-primary">{displayName}</p>
                  <p className="truncate text-[11px] text-text-tertiary">{displayEmail}</p>
                </div>

                <Link
                  href="/settings"
                  className="mt-1 flex items-center gap-2 rounded px-2 py-2 text-sm text-text-secondary transition-colors hover:bg-bg-elevated hover:text-text-primary"
                  role="menuitem"
                  onClick={() => setOpenAccountMenu(false)}
                >
                  <UserRound size={14} />
                  Profile
                </Link>

                <Link
                  href="/settings"
                  className="flex items-center gap-2 rounded px-2 py-2 text-sm text-text-secondary transition-colors hover:bg-bg-elevated hover:text-text-primary"
                  role="menuitem"
                  onClick={() => setOpenAccountMenu(false)}
                >
                  <Settings size={14} />
                  Settings
                </Link>

                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 rounded px-2 py-2 text-sm text-error-500 transition-colors hover:bg-error-50"
                  onClick={() => {
                    logout();
                    document.cookie = "auth_token=; Path=/; Max-Age=0; SameSite=Lax";
                    setOpenAccountMenu(false);
                    router.push("/login");
                  }}
                >
                  <LogOut size={14} />
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>
      <NotificationPanel open={openPanel} onClose={() => setOpenPanel(false)} />
    </>
  );
}

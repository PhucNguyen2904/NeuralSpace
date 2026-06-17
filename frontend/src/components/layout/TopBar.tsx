"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, ChevronDown, ChevronRight, LogOut, Settings, UserRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { NotificationPanel } from "@/components/layout/NotificationPanel";
import { Avatar } from "@/components/ui/Avatar";
import { useAuth } from "@/lib/hooks/useAuth";
import { useNotificationStore } from "@/lib/stores/notificationStore";

/** Human-readable label for each known URL segment */
const SEGMENT_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  workspaces: "Colab Projects",
  workspace: "Colab Projects",
  datasets: "Datasets",
  models: "Models",
  experiments: "Experiments",
  lineage: "Lineage",
  settings: "Settings",
  new: "New Project",
  notebooks: "Notebooks",
  approvals: "Approvals",
};

function segmentLabel(seg: string): string {
  return SEGMENT_LABELS[seg] ?? (seg.length > 12 ? `${seg.slice(0, 10)}…` : seg);
}

function useBreadcrumbs() {
  const pathname = usePathname();

  return useMemo(() => {
    const segments = pathname.replace(/^\//, "").split("/").filter(Boolean);

    if (segments.length === 0) {
      return [{ label: "Dashboard", href: "/dashboard", isCurrent: true, isMono: false }];
    }

    // Build one crumb per segment — no artificial section prefix
    let builtPath = "";
    return segments.map((seg, i) => {
      builtPath += `/${seg}`;
      return {
        label: segmentLabel(seg),
        href: builtPath,
        isCurrent: i === segments.length - 1,
        isMono: !SEGMENT_LABELS[seg],
      };
    });
  }, [pathname]);
}

export function TopBar() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [openPanel, setOpenPanel] = useState(false);
  const [openAccountMenu, setOpenAccountMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const unreadCount = useNotificationStore((state) => state.unreadCount);
  const displayName = user?.name?.trim() || "User";
  const displayEmail = user?.email?.trim() || "user@example.com";
  const breadcrumbs = useBreadcrumbs();

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
        <nav className="flex min-w-0 items-center gap-1 overflow-hidden pr-4" aria-label="Breadcrumb">
          {breadcrumbs.map((crumb, index) => (
            <span key={index} className="flex shrink-0 items-center gap-1">
              {index > 0 && (
                <ChevronRight size={12} className="shrink-0 text-text-tertiary/60" />
              )}
              {crumb.isCurrent ? (
                <span className={`font-semibold text-text-primary ${crumb.isMono ? "font-mono text-[11px]" : "text-[13px]"}`}>
                  {crumb.label}
                </span>
              ) : (
                <Link
                  href={crumb.href}
                  className="text-[13px] text-text-tertiary transition hover:text-text-primary"
                >
                  {crumb.label}
                </Link>
              )}
            </span>
          ))}
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
            {/* Account trigger button */}
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={openAccountMenu}
              id="account-menu-trigger"
              onClick={() => setOpenAccountMenu((prev) => !prev)}
              className={`group flex h-9 items-center gap-2 rounded-lg border pl-1 pr-2 transition-all duration-200 ${
                openAccountMenu
                  ? "border-brand-500/50 bg-bg-elevated shadow-sm shadow-brand-500/10"
                  : "border-border bg-bg-surface hover:border-brand-500/30 hover:bg-bg-elevated"
              }`}
            >
              {/* Avatar */}
              <Avatar
                name={displayName}
                className="h-7 w-7 shrink-0 text-[11px] font-bold ring-2 ring-bg-surface"
              />

              {/* Name only — no email to keep it compact */}
              <span className="hidden max-w-[96px] truncate text-[13px] font-medium text-text-primary sm:block">
                {displayName.split(" ")[0]}
              </span>

              <ChevronDown
                size={12}
                className={`shrink-0 transition-transform duration-200 ${
                  openAccountMenu ? "rotate-180 text-brand-500" : "text-text-tertiary group-hover:text-text-secondary"
                }`}
              />
            </button>

            {/* Dropdown */}
            {openAccountMenu ? (
              <div
                className="absolute right-0 z-40 mt-2 w-60 overflow-hidden rounded-xl border border-border bg-bg-surface shadow-xl"
                role="menu"
                style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.18), 0 1px 4px rgba(0,0,0,0.10)" }}
              >
                {/* Profile header card */}
                <div className="relative overflow-hidden px-4 py-4" style={{ background: "linear-gradient(135deg, var(--color-bg-elevated) 0%, var(--color-bg-surface) 100%)" }}>
                  <div className="pointer-events-none absolute inset-0 opacity-40"
                    style={{ background: "radial-gradient(ellipse at 20% 50%, var(--color-accent-glow), transparent 60%)" }}
                  />
                  <div className="relative flex items-center gap-3">
                    <span className="relative shrink-0">
                      <span className="absolute inset-0 rounded-full bg-gradient-to-br from-brand-400 to-violet-500 opacity-70 blur-[3px]" />
                      <Avatar name={displayName} className="relative h-10 w-10 text-sm ring-2 ring-white/15" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-text-primary">{displayName}</p>
                      <p className="truncate text-[11px] text-text-tertiary">{displayEmail}</p>
                      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-success-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-success-500">
                        <span className="h-1 w-1 rounded-full bg-success-500" />
                        Active
                      </span>
                    </div>
                  </div>
                </div>

                {/* Menu items */}
                <div className="border-t border-border p-1">
                  <Link
                    href="/settings"
                    id="account-menu-profile"
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-bg-elevated hover:text-text-primary"
                    role="menuitem"
                    onClick={() => setOpenAccountMenu(false)}
                  >
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border bg-bg-elevated text-text-secondary">
                      <UserRound size={13} />
                    </span>
                    <span>
                      <span className="block text-[12px] font-medium text-text-primary">Profile</span>
                      <span className="block text-[11px] text-text-tertiary">View your account</span>
                    </span>
                  </Link>

                  <Link
                    href="/settings"
                    id="account-menu-settings"
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-bg-elevated hover:text-text-primary"
                    role="menuitem"
                    onClick={() => setOpenAccountMenu(false)}
                  >
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border bg-bg-elevated text-text-secondary">
                      <Settings size={13} />
                    </span>
                    <span>
                      <span className="block text-[12px] font-medium text-text-primary">Settings</span>
                      <span className="block text-[11px] text-text-tertiary">Preferences & workspace</span>
                    </span>
                  </Link>
                </div>

                {/* Sign out */}
                <div className="border-t border-border p-1">
                  <button
                    type="button"
                    id="account-menu-signout"
                    role="menuitem"
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-error-50 dark:hover:bg-error-500/10"
                    onClick={() => {
                      logout();
                      document.cookie = "auth_token=; Path=/; Max-Age=0; SameSite=Lax";
                      setOpenAccountMenu(false);
                      router.push("/login");
                    }}
                  >
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-error-200/60 bg-error-50/60 text-error-500 dark:border-error-800/30 dark:bg-error-900/20">
                      <LogOut size={13} />
                    </span>
                    <span className="text-[12px] font-medium text-error-600 dark:text-error-400">Sign out</span>
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </header>
      <NotificationPanel open={openPanel} onClose={() => setOpenPanel(false)} />
    </>
  );
}

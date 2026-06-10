"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { Avatar } from "@/components/ui/Avatar";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  Box,
  ChevronLeft,
  ChevronRight,
  Database,
  FlaskConical,
  GitBranch,
  LayoutDashboard,
  Moon,
  Settings,
  Sun,
  Terminal
} from "lucide-react";
import { useEffect, useState } from "react";

const sections = [
  {
    label: "WORKSPACE",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/workspaces", label: "Colab Projects", icon: Terminal }
    ]
  },
  {
    label: "RESOURCES",
    items: [
      { href: "/datasets", label: "Datasets", icon: Database },
      { href: "/models", label: "Models", icon: Box },
      { href: "/experiments", label: "Experiments", icon: FlaskConical },
      { href: "/lineage", label: "Lineage", icon: GitBranch }
    ]
  },
  {
    label: "ACCOUNT",
    items: [{ href: "/settings", label: "Settings", icon: Settings }]
  }
];

function NeuralIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
      <path d="M3 3H7.6L11 8.1L14.4 3H19L13.4 11L19 19H14.4L11 13.9L7.6 19H3L8.6 11L3 3Z" fill="currentColor" />
      <path d="M7.7 6.6L10.1 10.1M14.3 15.4L11.9 11.9" stroke="var(--color-bg-base)" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const [isLight, setIsLight] = useState(false);
  const [mounted, setMounted] = useState(false);
  const isRouteActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const displayName = user?.name?.trim() || "Alex Nguyen";
  const displayEmail = user?.email?.trim() || "alex@neuralspace.dev";
  const themeIsLight = mounted && isLight;

  useEffect(() => {
    setMounted(true);
    const applyTheme = (value: "system" | "light" | "dark") => {
      const root = document.documentElement;
      const systemLight = !window.matchMedia("(prefers-color-scheme: dark)").matches;
      const shouldUseLight = value === "light" || (value === "system" && systemLight);
      root.classList.toggle("light", shouldUseLight);
      root.classList.toggle("theme-dark", !shouldUseLight);
      setIsLight(shouldUseLight);
    };

    const saved = window.localStorage.getItem("ui-theme");
    applyTheme(saved === "light" || saved === "dark" || saved === "system" ? saved : "dark");
  }, []);

  const toggleTheme = () => {
    const nextTheme = isLight ? "dark" : "light";
    window.localStorage.setItem("ui-theme", nextTheme);
    document.documentElement.classList.toggle("light", nextTheme === "light");
    document.documentElement.classList.toggle("theme-dark", nextTheme === "dark");
    setIsLight(nextTheme === "light");
  };

  return (
    <>
      <aside className={cn("fixed left-0 top-0 z-40 hidden h-screen flex-col border-r border-border bg-bg-surface transition-[width] duration-200 md:flex", collapsed ? "w-14 px-2 py-3" : "w-60 p-4")}>
        <div className={cn("mb-7 flex items-center gap-2 text-brand-500", collapsed ? "justify-center" : "justify-between")}>
          <Link href="/dashboard" className="flex min-w-0 items-center gap-2" aria-label="NeuralSpace dashboard">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-border bg-bg-elevated text-brand-500 shadow-xs">
              <NeuralIcon />
            </span>
            <span className={cn("truncate text-[15px] font-semibold tracking-tight text-text-primary", collapsed && "hidden")}>NeuralSpace</span>
          </Link>
          <button
            className={cn("grid h-8 w-8 place-items-center rounded-md text-text-secondary transition hover:bg-bg-elevated hover:text-text-primary", collapsed && "absolute -right-4 top-3 border border-border bg-bg-surface shadow-sm")}
            onClick={onToggle}
            aria-label={collapsed ? "Open sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        <div className="flex-1 space-y-6">
          {sections.map((section) => (
            <div key={section.label}>
              <p className={cn("mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-tertiary", collapsed && "sr-only")}>{section.label}</p>
              <div className="space-y-1">
                {section.items.map((item) => {
                  const isActive = isRouteActive(item.href);
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "group relative flex h-9 items-center gap-2 rounded-md border-l-[3px] px-2 text-sm font-medium text-text-secondary transition",
                        collapsed && "justify-center px-0",
                        isActive
                          ? "border-brand-500 bg-brand-50 text-text-primary shadow-xs"
                          : "border-transparent hover:bg-bg-elevated hover:text-text-primary"
                      )}
                      aria-label={item.label}
                      title={collapsed ? item.label : undefined}
                    >
                      <Icon size={16} className={cn("shrink-0", isActive ? "text-brand-500" : "text-text-tertiary group-hover:text-text-primary")} />
                      <span className={cn("truncate", collapsed && "hidden")}>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-border pt-3">
          <div className={cn("mb-2 flex items-center gap-2 rounded-lg border border-border bg-bg-elevated/60 p-2", collapsed && "justify-center border-transparent bg-transparent p-0")}>
            <Avatar name={displayName} className="h-8 w-8 shrink-0 border border-border bg-brand-50 text-[11px]" />
            <div className={cn("min-w-0", collapsed && "hidden")}>
              <p className="truncate text-xs font-semibold text-text-primary">{displayName}</p>
              <p className="truncate text-[11px] text-text-tertiary">{displayEmail}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            className={cn("flex h-9 w-full items-center gap-2 rounded-md px-2 text-sm font-medium text-text-secondary transition hover:bg-bg-elevated hover:text-text-primary", collapsed && "justify-center px-0")}
            aria-label={themeIsLight ? "Switch to dark mode" : "Switch to light mode"}
            title={themeIsLight ? "Switch to dark mode" : "Switch to light mode"}
          >
            <span className="relative grid h-5 w-5 place-items-center">
              <Sun size={16} className={cn("absolute transition-all", themeIsLight ? "rotate-0 opacity-100" : "-rotate-90 opacity-0")} />
              <Moon size={16} className={cn("absolute transition-all", themeIsLight ? "rotate-90 opacity-0" : "rotate-0 opacity-100")} />
            </span>
            <span className={cn(collapsed && "hidden")}>{themeIsLight ? "Light mode" : "Dark mode"}</span>
          </button>
        </div>
      </aside>

      <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-border bg-bg-surface px-2 py-1 md:hidden" aria-label="Bottom navigation">
        {sections.flatMap((s) => s.items).slice(0, 5).map((item) => {
          const Icon = item.icon;
          const isActive = isRouteActive(item.href);
          return (
            <Link key={item.href} href={item.href} className={cn("flex flex-1 flex-col items-center justify-center rounded-md py-2 text-[11px]", isActive ? "text-brand-600" : "text-text-secondary")} aria-label={item.label}>
              <Icon size={16} />
              <span className="mt-1">{item.label.split(" ")[0]}</span>
            </Link>
          );
        })}
        <button type="button" onClick={toggleTheme} className="flex flex-1 flex-col items-center justify-center rounded-md py-2 text-[11px] text-text-secondary" aria-label={themeIsLight ? "Switch to dark mode" : "Switch to light mode"}>
          {themeIsLight ? <Sun size={16} /> : <Moon size={16} />}
          <span className="mt-1">Theme</span>
        </button>
      </nav>
    </>
  );
}

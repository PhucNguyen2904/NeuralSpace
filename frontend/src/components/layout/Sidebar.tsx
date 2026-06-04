"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { Brain, ChevronLeft, ChevronRight, Database, FlaskConical, GitBranch, LayoutDashboard, Settings, Terminal } from "lucide-react";

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
      { href: "/models", label: "Models", icon: Brain },
      { href: "/experiments", label: "Experiments", icon: FlaskConical },
      { href: "/lineage", label: "Lineage", icon: GitBranch }
    ]
  },
  {
    label: "Account",
    items: [{ href: "/settings", label: "Settings", icon: Settings }]
  }
];

function NeuralIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <circle cx="4" cy="4" r="2" fill="currentColor" />
      <circle cx="16" cy="4" r="2" fill="currentColor" />
      <circle cx="4" cy="16" r="2" fill="currentColor" />
      <circle cx="16" cy="16" r="2" fill="currentColor" />
      <circle cx="10" cy="10" r="2" fill="currentColor" />
      <path d="M5.5 5.5L8.5 8.5M14.5 5.5L11.5 8.5M5.5 14.5L8.5 11.5M14.5 14.5L11.5 11.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  const isRouteActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <aside className={cn("fixed left-0 top-0 z-40 hidden h-screen flex-col border-r border-border bg-bg-surface p-3 transition-[width] duration-200 md:flex", collapsed ? "w-14" : "w-60 p-4")}>
      <div className="mb-8 flex items-center justify-between gap-2 text-brand-600">
        <div className="flex items-center gap-2">
          <NeuralIcon />
          <span className={cn("text-lg font-semibold text-text-primary", collapsed && "hidden")}>NeuralSpace</span>
        </div>
        <button className="rounded-md p-1 text-text-secondary hover:bg-bg-elevated hover:text-text-primary" onClick={onToggle} aria-label={collapsed ? "Open sidebar" : "Collapse sidebar"}>
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
      <div className="space-y-6">
        {sections.map((section) => (
          <div key={section.label}>
            <p className={cn("mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary", collapsed && "hidden")}>{section.label}</p>
            <div className="space-y-1">
              {section.items.map((item) => {
                const isActive = isRouteActive(item.href);
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2 rounded-md border-l-2 px-2 py-2 text-sm text-text-secondary transition",
                      isActive
                        ? "border-brand-500 bg-brand-50 text-brand-600"
                        : "border-transparent hover:bg-bg-elevated hover:text-text-primary"
                    )}
                    aria-label={item.label}
                  >
                    <Icon size={16} />
                    <span className={cn(collapsed && "hidden")}>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
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
      </nav>
    </>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { BookOpen, Brain, Database, LayoutDashboard, Settings, Terminal } from "lucide-react";

const sections = [
  {
    label: "WORKSPACE",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/workspaces", label: "My Workspaces", icon: Terminal },
      { href: "/notebooks", label: "Notebooks", icon: BookOpen }
    ]
  },
  {
    label: "RESOURCES",
    items: [
      { href: "/datasets", label: "Datasets", icon: Database },
      { href: "/models", label: "Models", icon: Brain }
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

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 flex h-screen w-60 flex-col border-r border-border bg-bg-surface p-4">
      <div className="mb-8 flex items-center gap-2 text-brand-600">
        <NeuralIcon />
        <span className="text-lg font-semibold text-text-primary">NeuralSpace</span>
      </div>
      <div className="space-y-6">
        {sections.map((section) => (
          <div key={section.label}>
            <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">{section.label}</p>
            <div className="space-y-1">
              {section.items.map((item) => {
                const isActive = pathname === item.href;
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
                  >
                    <Icon size={16} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-auto flex items-center gap-2 rounded-lg bg-bg-elevated p-2">
        <Avatar name="Alex Nguyen" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-text-primary">Alex Nguyen</p>
          <p className="truncate text-xs text-text-tertiary">alex@neuralspace.dev</p>
        </div>
      </div>
    </aside>
  );
}

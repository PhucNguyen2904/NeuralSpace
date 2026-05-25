"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { PageTransition } from "@/components/shared/PageTransition";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    const raw = window.localStorage.getItem("sidebar-collapsed");
    if (raw) setSidebarCollapsed(raw === "1");
  }, []);

  useEffect(() => {
    window.localStorage.setItem("sidebar-collapsed", sidebarCollapsed ? "1" : "0");
  }, [sidebarCollapsed]);

  return (
    <div className="min-h-screen bg-bg-base">
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((prev) => !prev)} />
      <div className={`min-h-screen ${sidebarCollapsed ? "md:ml-14" : "md:ml-60"}`}>
        <TopBar />
        <main id="main-content" className="pb-20 pt-5 md:pb-8 md:pt-6" tabIndex={-1}>
          <div className="mx-auto w-full max-w-[1400px] px-4 md:px-6">
            <AnimatePresence mode="wait">
              <PageTransition key={pathname}>{children}</PageTransition>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
}

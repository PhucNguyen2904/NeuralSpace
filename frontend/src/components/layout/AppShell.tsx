import type { ReactNode } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-bg-base">
      <Sidebar />
      <div className="ml-60 min-h-screen">
        <TopBar />
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}

"use client";

import { type ReactNode, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FolderOpen, PanelLeftClose, Variable } from "lucide-react";
import { cn } from "../../lib/utils/cn";
import { ResizeHandle } from "./ResizeHandle";
import { TabBar, type IDETab } from "./TabBar";

interface IDELayoutProps {
  sidebarContent: (activeTab: "files" | "variables") => ReactNode;
  sidebarDefaultOpen?: boolean;
  tabs: IDETab[];
  activeTabId: string;
  onTabChange: (id: string) => void;
  onTabClose: (id: string) => void;
  onNewTab: () => void;
  children: ReactNode;
  toolbar?: ReactNode;
}

interface SidebarIconButtonProps {
  icon: ReactNode;
  tooltip: string;
  isActive: boolean;
  onClick: () => void;
}

function SidebarIconButton({ icon, tooltip, isActive, onClick }: SidebarIconButtonProps): JSX.Element {
  return (
    <button
      type="button"
      title={tooltip}
      onClick={onClick}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-md border transition-colors",
        isActive
          ? "border-[#C7D2FE] bg-[#EEF2FF] text-[#4F46E5]"
          : "border-transparent text-[#5A6070] hover:bg-[#ECEEF4] hover:text-[#0F1117]"
      )}
    >
      {icon}
    </button>
  );
}

export function IDELayout({
  sidebarContent,
  sidebarDefaultOpen = true,
  tabs,
  activeTabId,
  onTabChange,
  onTabClose,
  onNewTab,
  children,
  toolbar
}: IDELayoutProps): JSX.Element {
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(sidebarDefaultOpen);
  const [sidebarWidth, setSidebarWidth] = useState<number>(260);
  const [activeSidebarTab, setActiveSidebarTab] = useState<"files" | "variables">("files");

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#F8F9FC]">
      <div className="flex flex-1 overflow-hidden">
        <div className="w-10 shrink-0 border-r border-[#E2E5EE] bg-[#F1F3F8] pt-2">
          <div className="flex flex-col items-center gap-1">
            <SidebarIconButton
              icon={<FolderOpen size={18} />}
              tooltip="Project Files"
              isActive={sidebarOpen && activeSidebarTab === "files"}
              onClick={() => {
                if (activeSidebarTab === "files" && sidebarOpen) {
                  setSidebarOpen(false);
                } else {
                  setActiveSidebarTab("files");
                  setSidebarOpen(true);
                }
              }}
            />

            <SidebarIconButton
              icon={<Variable size={18} />}
              tooltip="Variables"
              isActive={sidebarOpen && activeSidebarTab === "variables"}
              onClick={() => {
                if (activeSidebarTab === "variables" && sidebarOpen) {
                  setSidebarOpen(false);
                } else {
                  setActiveSidebarTab("variables");
                  setSidebarOpen(true);
                }
              }}
            />
          </div>
        </div>

        <AnimatePresence initial={false}>
          {sidebarOpen ? (
            <motion.div
              key="sidebar"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: sidebarWidth, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="flex shrink-0 flex-col overflow-hidden border-r border-[#E2E5EE] bg-white"
            >
              <div className="flex h-9 items-center justify-between border-b border-[#E2E5EE] px-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#9299A8]">
                  {activeSidebarTab === "files" ? "Project Files" : "Variables"}
                </span>
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  className="rounded p-0.5 text-[#9299A8] hover:text-[#0F1117]"
                >
                  <PanelLeftClose size={14} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">{sidebarContent(activeSidebarTab)}</div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {sidebarOpen ? (
          <ResizeHandle onResize={(delta) => setSidebarWidth((w) => Math.min(Math.max(w + delta, 180), 480))} />
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <TabBar
            tabs={tabs}
            activeTabId={activeTabId}
            onTabChange={onTabChange}
            onTabClose={onTabClose}
            onNewTab={onNewTab}
          />

          {toolbar ? <div className="shrink-0 border-b border-[#E2E5EE]">{toolbar}</div> : null}

          <div className="flex-1 overflow-y-auto">{children}</div>
        </div>
      </div>
    </div>
  );
}

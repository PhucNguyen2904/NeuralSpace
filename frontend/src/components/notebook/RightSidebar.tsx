"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Brain, Database, Upload, X } from "lucide-react";
import { cn } from "../../lib/utils/cn";
import { DatasetImportPanel } from "./panels/DatasetImportPanel";
import { LocalUploadPanel } from "./panels/LocalUploadPanel";
import { ModelImportPanel } from "./panels/ModelImportPanel";

type RightTab = "datasets" | "models" | "upload";

interface RightSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onInjectCode: (code: string) => void;
  workspaceId: string;
}

const TABS: Array<{ id: RightTab; label: string; icon: React.ReactNode }> = [
  { id: "datasets", label: "Datasets", icon: <Database size={14} /> },
  { id: "models", label: "Models", icon: <Brain size={14} /> },
  { id: "upload", label: "Upload", icon: <Upload size={14} /> }
];

const SIDEBAR_WIDTH = 300;

export function RightSidebar({ isOpen, onClose, onInjectCode, workspaceId }: RightSidebarProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<RightTab>("datasets");

  return (
    <AnimatePresence initial={false}>
      {isOpen ? (
        <motion.aside
          key="right-sidebar"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: SIDEBAR_WIDTH, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
          className="flex h-full shrink-0 flex-col overflow-hidden border-l border-[#E2E8F0] bg-white"
          style={{ width: SIDEBAR_WIDTH }}
        >
          <div className="flex shrink-0 items-center border-b border-[#E2E8F0]">
            <div className="flex flex-1">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "-mb-px flex h-9 flex-1 items-center justify-center gap-1.5 border-b-2 text-[12px] font-medium transition-colors",
                    activeTab === tab.id
                      ? "border-[#6366F1] text-[#6366F1]"
                      : "border-transparent text-[#94A3B8] hover:text-[#475569]"
                  )}
                >
                  {tab.icon}
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              ))}
            </div>

            <button
              onClick={onClose}
              className="mr-1 rounded p-2 text-[#94A3B8] transition-colors hover:bg-[#F8FAFC] hover:text-[#475569]"
            >
              <X size={14} />
            </button>
          </div>

          <div className="flex-1 overflow-hidden">
            {activeTab === "datasets" ? <DatasetImportPanel onInjectCode={onInjectCode} workspaceId={workspaceId} /> : null}
            {activeTab === "models" ? <ModelImportPanel onInjectCode={onInjectCode} workspaceId={workspaceId} /> : null}
            {activeTab === "upload" ? <LocalUploadPanel onInjectCode={onInjectCode} workspaceId={workspaceId} /> : null}
          </div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}

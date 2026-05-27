"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import type { UseKernelReturn } from "../../hooks/useKernel";
import type { UseNotebookReturn } from "../../hooks/useNotebook";
import { FileTreePanel } from "./FileTreePanel";
import { KaggleTopbar } from "./KaggleTopbar";
import { RightSidebar } from "./RightSidebar";

const SIDEBAR_WIDTH = 240;

interface KaggleIDELayoutProps {
  workspaceId: string;
  notebookName: string;
  onNameChange: (name: string) => void;
  activeFile?: string;
  onFileOpen: (path: string, name: string) => void;
  kernel: UseKernelReturn;
  notebook: UseNotebookReturn;
  onRunCell: () => void;
  onRunAll: () => void;
  onInjectCode: (code: string) => void;
  children: React.ReactNode;
}

export function KaggleIDELayout({
  workspaceId,
  notebookName,
  onNameChange,
  activeFile,
  onFileOpen,
  kernel,
  notebook,
  onRunCell,
  onRunAll,
  onInjectCode,
  children
}: KaggleIDELayoutProps): JSX.Element {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#F8FAFC]">
      <KaggleTopbar
        notebookName={notebookName}
        onNameChange={onNameChange}
        isSidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((o) => !o)}
        kernel={kernel}
        notebook={notebook}
        onRunCell={onRunCell}
        onRunAll={onRunAll}
        onInterrupt={() => {
          void kernel.interruptKernel();
        }}
        isRightSidebarOpen={rightSidebarOpen}
        onToggleRightSidebar={() => setRightSidebarOpen((o) => !o)}
      />

      <div className="flex flex-1 overflow-hidden">
        <AnimatePresence initial={false}>
          {sidebarOpen ? (
            <motion.div
              key="sidebar"
              initial={{ width: 0 }}
              animate={{ width: SIDEBAR_WIDTH }}
              exit={{ width: 0 }}
              transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
              className="shrink-0 overflow-hidden border-r border-[#E2E8F0]"
              style={{ width: SIDEBAR_WIDTH }}
            >
              <div style={{ width: SIDEBAR_WIDTH }} className="h-full">
                <FileTreePanel
                  onFileOpen={(path, name) => {
                    onFileOpen(path, name);
                  }}
                  activeFile={activeFile}
                  onClose={() => setSidebarOpen(false)}
                />
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[860px] px-4 py-5">{children}</div>
        </main>

        <RightSidebar
          isOpen={rightSidebarOpen}
          onClose={() => setRightSidebarOpen(false)}
          onInjectCode={onInjectCode}
          workspaceId={workspaceId}
        />
      </div>
    </div>
  );
}

"use client";

import { Loader2, Plus, X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/utils/cn";

export interface IDETab {
  id: string;
  label: string;
  icon?: ReactNode;
  isDirty?: boolean;
  isLoading?: boolean;
}

interface TabBarProps {
  tabs: IDETab[];
  activeTabId: string;
  onTabChange: (id: string) => void;
  onTabClose: (id: string) => void;
  onNewTab: () => void;
}

export function TabBar({ tabs, activeTabId, onTabChange, onTabClose, onNewTab }: TabBarProps): JSX.Element {
  return (
    <div
      className="scrollbar-none flex h-9 items-end overflow-x-auto border-b border-[#E2E5EE] bg-[#F1F3F8] shrink-0"
      style={{ scrollbarWidth: "none" }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "relative group flex h-full max-w-[220px] shrink-0 cursor-pointer select-none items-center gap-1.5 border-r border-[#E2E5EE] px-3 text-sm",
              isActive ? "bg-white font-medium text-[#0F1117]" : "bg-[#F1F3F8] text-[#5A6070] hover:bg-[#ECEEF4]"
            )}
          >
            {isActive ? <div className="absolute left-0 right-0 top-0 h-[2px] rounded-b bg-[#6366F1]" /> : null}

            <span className="shrink-0 text-base">{tab.icon ?? "📓"}</span>
            <span className="max-w-[130px] truncate">{tab.label}</span>

            <div className="flex h-4 w-4 shrink-0 items-center justify-center">
              {tab.isLoading ? <Loader2 size={12} className="animate-spin text-[#9299A8]" /> : null}
              {!tab.isLoading && tab.isDirty ? <span className="h-2 w-2 rounded-full bg-[#6366F1] group-hover:hidden" /> : null}
              {!tab.isLoading ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onTabClose(tab.id);
                  }}
                  className="hidden rounded p-0.5 text-[#9299A8] hover:bg-[#E2E5EE] hover:text-[#0F1117] group-hover:flex"
                >
                  <X size={12} />
                </button>
              ) : null}
            </div>
          </div>
        );
      })}

      <button
        type="button"
        onClick={onNewTab}
        className="flex h-full w-8 shrink-0 items-center justify-center text-[#9299A8] transition-colors hover:bg-[#ECEEF4] hover:text-[#0F1117]"
      >
        <Plus size={14} />
      </button>

      <div className="flex-1" />
    </div>
  );
}

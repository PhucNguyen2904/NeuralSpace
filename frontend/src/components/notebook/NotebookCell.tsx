"use client";

import { ArrowDown, ArrowUp, Play, Plus, Trash2, Copy, Check } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import type { NotebookCell as NotebookCellType } from "../../lib/jupyter/types";
import { cn } from "../../lib/utils/cn";
import { CellEditor } from "./CellEditor";
import { CellOutput } from "./CellOutput";

export interface NotebookCellProps {
  cell: NotebookCellType;
  index: number;
  isSelected: boolean;
  isExecuting: boolean;
  onSelect: () => void;
  onExecute: () => void;
  onSourceChange: (source: string) => void;
  onAddCellBelow: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onSave?: () => void;
}

export function NotebookCell({
  cell,
  isSelected,
  isExecuting,
  onSelect,
  onExecute,
  onSourceChange,
  onAddCellBelow,
  onDelete,
  onMoveUp,
  onMoveDown,
  onSave
}: NotebookCellProps): JSX.Element {
  const [isMarkdownEditing, setIsMarkdownEditing] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    if (!isSelected) setIsMarkdownEditing(false);
  }, [isSelected]);

  const handleCopy = () => {
    navigator.clipboard.writeText(cell.source);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const executionCount = useMemo(() => (typeof cell.execution_count === "number" ? cell.execution_count : null), [cell.execution_count]);
  const showMarkdownPreview = cell.cell_type === "markdown" && (!isSelected || !isMarkdownEditing);

  return (
    <div onClick={onSelect} className={cn("group relative rounded-r-lg transition-all duration-150")}>
      <div
        className={cn(
          "absolute bottom-0 left-0 top-0 w-[3px] rounded-full transition-colors duration-150",
          isExecuting ? "bg-amber-400" : isSelected ? "bg-[#6366F1]" : "bg-transparent group-hover:bg-[#E2E8F0]"
        )}
      />

      <div className="pl-4">
        <div className="flex items-start gap-2">
          <div className="flex w-10 shrink-0 items-start justify-end pt-3">
            {isExecuting ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
            ) : (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onExecute();
                  }}
                  className={cn(
                    "hidden h-5 w-5 items-center justify-center rounded-full bg-[#6366F1] shadow-sm transition-colors hover:bg-[#4F46E5] group-hover:flex"
                  )}
                >
                  <Play size={9} fill="white" className="ml-px text-white" />
                </button>
                <span className="font-mono text-[11px] tabular-nums text-[#CBD5E0] group-hover:hidden">
                  {executionCount != null ? `[${executionCount}]` : "[ ]"}
                </span>
              </>
            )}
          </div>

          <div className="min-w-0 flex-1">
            {showMarkdownPreview ? (
              <div className="prose prose-sm max-w-none rounded-lg border border-[#E2E8F0] bg-white p-3 text-[#1A202C]" onDoubleClick={() => setIsMarkdownEditing(true)}>
                {cell.source.trim().length > 0 ? <ReactMarkdown rehypePlugins={[rehypeHighlight]}>{cell.source}</ReactMarkdown> : "(Markdown rong)"}
              </div>
            ) : (
              <div
                className={cn(
                  "overflow-hidden rounded-lg border transition-all",
                  isSelected
                    ? "border-[#6366F1] shadow-[0_0_0_3px_#EEF2FF]"
                    : isExecuting
                      ? "border-amber-300"
                      : "border-[#E2E8F0] group-hover:border-[#C7D2FE]"
                )}
              >
                <CellEditor
                  value={cell.source}
                  onChange={onSourceChange}
                  onExecute={onExecute}
                  onExecuteAndInsert={() => {
                    onExecute();
                    onAddCellBelow();
                  }}
                  onSave={onSave}
                  isExecuting={isExecuting}
                  language={cell.cell_type === "code" ? "python" : cell.cell_type}
                />
              </div>
            )}

            {(cell.outputs.length > 0 || isExecuting) && cell.cell_type === "code" ? (
              <div className="mt-0 rounded-b-lg border border-t-0 border-[#E2E8F0] bg-white px-4 py-3">
                <CellOutput outputs={cell.outputs} isExecuting={isExecuting && cell.outputs.length === 0} />
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-1 flex items-center gap-2 py-1 pl-12 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAddCellBelow();
            }}
            className={cn(
              "flex items-center gap-1 rounded-full border border-dashed border-[#CBD5E0] px-2 py-0.5 text-[11px] text-[#94A3B8]",
              "transition-all hover:border-[#6366F1] hover:bg-[#EEF2FF] hover:text-[#6366F1]"
            )}
          >
            <Plus size={10} /> Code
          </button>
        </div>
      </div>

      <div className="absolute right-2 top-2 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <CellMenuButton icon={isCopied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />} title="Sao chép" onClick={handleCopy} />
        <CellMenuButton icon={<ArrowUp size={12} />} title="Di chuyen len" onClick={onMoveUp} />
        <CellMenuButton icon={<ArrowDown size={12} />} title="Di chuyen xuong" onClick={onMoveDown} />
        <CellMenuButton icon={<Trash2 size={12} />} title="Xoa cell" onClick={onDelete} className="hover:bg-red-50 hover:text-red-500" />
      </div>
    </div>
  );
}

function CellMenuButton({ icon, title, onClick, className }: { icon: React.ReactNode; title: string; onClick: () => void; className?: string }): JSX.Element {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={title}
      className={cn("rounded p-1 text-[#CBD5E0] transition-colors hover:bg-[#F1F5F9] hover:text-[#64748B]", className)}
    >
      {icon}
    </button>
  );
}

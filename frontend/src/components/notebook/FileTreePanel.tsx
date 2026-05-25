"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, RefreshCw, X } from "lucide-react";
import { JupyterRestClient } from "../../lib/jupyter/rest-client";
import { cn } from "../../lib/utils/cn";

interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
  loaded: boolean;
}

interface FileTreePanelProps {
  onFileOpen: (path: string, name: string) => void;
  activeFile?: string;
  onClose: () => void;
}

const FILE_ICONS: Record<string, { icon: string; color: string }> = {
  ".ipynb": { icon: "📓", color: "text-orange-500" },
  ".py": { icon: "🐍", color: "text-blue-500" },
  ".csv": { icon: "📊", color: "text-emerald-600" }
};

const HIDDEN_PATTERNS = [/^\./, /^__pycache__$/, /^node_modules$/];

function isHidden(name: string): boolean {
  return HIDDEN_PATTERNS.some((p) => p.test(name));
}

function getFileIcon(name: string): { icon: string; color: string } {
  const ext = `.${name.split(".").pop()?.toLowerCase() ?? ""}`;
  return FILE_ICONS[ext] ?? { icon: "📄", color: "text-gray-400" };
}

function updateChildren(nodes: FileNode[], targetPath: string, children: FileNode[]): FileNode[] {
  return nodes.map((n) => {
    if (n.path === targetPath) return { ...n, children, loaded: true };
    if (n.children) return { ...n, children: updateChildren(n.children, targetPath, children) };
    return n;
  });
}

export function FileTreePanel({ onFileOpen, activeFile, onClose }: FileTreePanelProps): JSX.Element {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set());
  const client = useMemo(() => new JupyterRestClient(), []);

  const loadDir = async (path: string): Promise<FileNode[]> => {
    const items = await client.listDirectory(path);
    return items
      .filter((item) => !isHidden(item.name))
      .filter((item) => item.type === "directory" || [".ipynb", ".py", ".csv"].some((ext) => item.name.toLowerCase().endsWith(ext)))
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .map((item) => ({
        name: item.name,
        path: item.path,
        type: item.type === "directory" ? "directory" : "file",
        loaded: false
      }));
  };

  useEffect(() => {
    void loadDir("").then((nodes) => {
      setTree(nodes);
      setLoading(false);
    });
  }, []);

  const toggleDir = async (node: FileNode): Promise<void> => {
    const isOpen = expanded.has(node.path);
    if (isOpen) {
      setExpanded((prev) => {
        const next = new Set(prev);
        next.delete(node.path);
        return next;
      });
      return;
    }

    setExpanded((prev) => new Set([...prev, node.path]));

    if (!node.loaded) {
      setLoadingPaths((prev) => new Set([...prev, node.path]));
      const children = await loadDir(node.path);
      setTree((prev) => updateChildren(prev, node.path, children));
      setLoadingPaths((prev) => {
        const next = new Set(prev);
        next.delete(node.path);
        return next;
      });
    }
  };

  const renderNode = (node: FileNode, depth: number): JSX.Element => {
    const isDir = node.type === "directory";
    const isExpanded = expanded.has(node.path);
    const isLoading = loadingPaths.has(node.path);
    const isActive = activeFile === node.path;
    const iconCfg = isDir ? { icon: isExpanded ? "📂" : "📁", color: "text-amber-500" } : getFileIcon(node.name);

    return (
      <div key={node.path}>
        <button
          onClick={() => (isDir ? void toggleDir(node) : onFileOpen(node.path, node.name))}
          className={cn(
            "group flex w-full items-center gap-1.5 rounded-md py-[4px] pr-2 text-left text-[12.5px] transition-colors duration-100",
            isActive ? "bg-[#EEF2FF] font-medium text-[#4F46E5]" : "text-[#475569] hover:bg-[#F8FAFC] hover:text-[#1A202C]"
          )}
          style={{ paddingLeft: `${10 + depth * 14}px` }}
        >
          {isDir ? (
            <ChevronRight size={12} className={cn("shrink-0 text-[#CBD5E0] transition-transform duration-150", isExpanded && "rotate-90", isLoading && "animate-spin")} />
          ) : (
            <span className="w-3 shrink-0" />
          )}

          <span className={cn("shrink-0 text-[13px] leading-none", iconCfg.color)}>{iconCfg.icon}</span>
          <span className="flex-1 truncate">{node.name}</span>
        </button>

        {isDir && isExpanded && node.children ? (
          <div>
            {node.children.length === 0 ? (
              <p className="italic text-[11px] text-[#A0AEC0]" style={{ paddingLeft: `${26 + depth * 14}px` }}>
                (trong)
              </p>
            ) : (
              node.children.map((child) => renderNode(child, depth + 1))
            )}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[#E2E8F0] px-3">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-[#94A3B8]">Files</span>
        <div className="flex items-center gap-1">
          <button
            onClick={async () => {
              setLoading(true);
              const nodes = await loadDir("");
              setTree(nodes);
              setExpanded(new Set());
              setLoading(false);
            }}
            title="Lam moi"
            className="rounded p-1 text-[#94A3B8] transition-colors hover:bg-[#F1F5F9] hover:text-[#475569]"
          >
            <RefreshCw size={12} />
          </button>
          <button onClick={onClose} title="Dong" className="rounded p-1 text-[#94A3B8] transition-colors hover:bg-[#F1F5F9] hover:text-[#475569]">
            <X size={12} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-1 py-1">
        {loading ? (
          <FileTreeSkeleton />
        ) : tree.length === 0 ? (
          <p className="py-6 text-center text-[12px] text-[#A0AEC0]">Khong co file nao</p>
        ) : (
          tree.map((node) => renderNode(node, 0))
        )}
      </div>
    </div>
  );
}

function FileTreeSkeleton(): JSX.Element {
  const widths = ["w-3/4", "w-1/2", "w-2/3", "w-4/5", "w-1/3"];
  return (
    <div className="space-y-1 px-2 py-1 animate-pulse">
      {widths.map((w, i) => (
        <div key={i} className={cn("h-5 rounded bg-[#F1F5F9]", w)} style={{ marginLeft: i > 1 ? "14px" : "0" }} />
      ))}
    </div>
  );
}

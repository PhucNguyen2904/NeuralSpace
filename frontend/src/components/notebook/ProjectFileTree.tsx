"use client";

import { ChevronRight, FilePlus, FolderPlus, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { JupyterRestClient } from "../../lib/jupyter/rest-client";
import { cn } from "../../lib/utils/cn";

interface FileTreeNode {
  id: string;
  name: string;
  type: "file" | "directory";
  children?: FileTreeNode[];
  path: string;
}

const restClient = new JupyterRestClient();

function getFileIcon(name: string): string {
  if (name.endsWith(".ipynb")) return "📓";
  if (name.endsWith(".py")) return "🐍";
  if (name.endsWith(".csv")) return "📊";
  if (name.endsWith(".txt")) return "📄";
  if (name.endsWith(".md")) return "📝";
  if (name.endsWith(".json")) return "🔧";
  if (name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".jpeg")) return "🖼";
  if (name.endsWith(".pt") || name.endsWith(".pkl")) return "📦";
  return "📄";
}

function updateNodeChildren(nodes: FileTreeNode[], nodePath: string, children: FileTreeNode[]): FileTreeNode[] {
  return nodes.map((node) => {
    if (node.path === nodePath) {
      return { ...node, children };
    }
    if (!node.children) {
      return node;
    }
    return { ...node, children: updateNodeChildren(node.children, nodePath, children) };
  });
}

function ToolbarIconButton({ icon, tooltip, onClick }: { icon: JSX.Element; tooltip: string; onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      title={tooltip}
      onClick={onClick}
      className="rounded p-1 text-[#9299A8] transition-colors hover:bg-[#EEF2FF] hover:text-[#0F1117]"
    >
      {icon}
    </button>
  );
}

function FileTreeSkeleton(): JSX.Element {
  return (
    <div className="space-y-2 p-2">
      <div className="h-6 rounded bg-[#F1F3F8]" />
      <div className="h-6 rounded bg-[#F1F3F8]" />
      <div className="h-6 rounded bg-[#F1F3F8]" />
    </div>
  );
}

export function ProjectFileTree({ onFileOpen }: { onFileOpen: (path: string) => void }): JSX.Element {
  const [tree, setTree] = useState<FileTreeNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set([""]));
  const [loading, setLoading] = useState<boolean>(true);

  const loadDirectory = useCallback(async (path: string): Promise<FileTreeNode[]> => {
    const items = await restClient.listDirectory(path);
    return items
      .filter((item) => !item.name.startsWith("."))
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .map((item) => ({
        id: item.path,
        name: item.name,
        type: item.type === "directory" ? "directory" : "file",
        path: item.path
      }));
  }, []);

  useEffect(() => {
    setLoading(true);
    void loadDirectory("")
      .then(setTree)
      .finally(() => setLoading(false));
  }, [loadDirectory]);

  const toggleDirectory = useCallback(
    async (node: FileTreeNode) => {
      const next = new Set(expanded);
      if (next.has(node.path)) {
        next.delete(node.path);
        setExpanded(next);
        return;
      }

      next.add(node.path);
      setExpanded(next);

      if (!node.children) {
        const children = await loadDirectory(node.path);
        setTree((prev) => updateNodeChildren(prev, node.path, children));
      }
    },
    [expanded, loadDirectory]
  );

  const renderNode = (node: FileTreeNode, depth = 0): JSX.Element => {
    const isExpanded = expanded.has(node.path);
    return (
      <div key={node.id}>
        <div
          className={cn(
            "mx-1 flex cursor-pointer select-none items-center gap-1.5 rounded-sm px-2 py-[3px] text-sm text-[#5A6070] transition-colors",
            "hover:bg-[#EEF2FF] hover:text-[#0F1117]"
          )}
          style={{ paddingLeft: `${8 + depth * 16}px` }}
          onClick={() => {
            if (node.type === "directory") {
              void toggleDirectory(node);
              return;
            }
            onFileOpen(node.path);
          }}
        >
          {node.type === "directory" ? (
            <ChevronRight size={12} className={cn("shrink-0 text-[#C8CEDD] transition-transform", isExpanded && "rotate-90")} />
          ) : (
            <span className="w-3 shrink-0" />
          )}

          <span className="shrink-0 text-sm">{node.type === "directory" ? (isExpanded ? "📂" : "📁") : getFileIcon(node.name)}</span>
          <span className="truncate">{node.name}</span>
        </div>

        {node.type === "directory" && isExpanded && node.children ? <div>{node.children.map((child) => renderNode(child, depth + 1))}</div> : null}
      </div>
    );
  };

  if (loading) return <FileTreeSkeleton />;

  return (
    <div className="py-1">
      <div className="mb-1 flex items-center justify-end gap-1 border-b border-[#E2E5EE] px-2 py-1">
        <ToolbarIconButton icon={<FilePlus size={13} />} tooltip="New file" onClick={() => undefined} />
        <ToolbarIconButton icon={<FolderPlus size={13} />} tooltip="New folder" onClick={() => undefined} />
        <ToolbarIconButton
          icon={<RefreshCw size={13} />}
          tooltip="Refresh"
          onClick={() => {
            setLoading(true);
            void loadDirectory("")
              .then(setTree)
              .finally(() => setLoading(false));
          }}
        />
      </div>

      {tree.length === 0 ? <p className="py-4 text-center text-xs text-[#9299A8]">Không có file nào</p> : tree.map((node) => renderNode(node))}
    </div>
  );
}

"use client";

import { useMemo, useRef, useState } from "react";
import { Background, Controls, MiniMap, ReactFlow, type Edge, type Node } from "@xyflow/react";
import { useRouter } from "next/navigation";
import { DatasetNode } from "@/components/lineage/nodes/DatasetNode";
import { ModelNode } from "@/components/lineage/nodes/ModelNode";
import { RunNode } from "@/components/lineage/nodes/RunNode";
import type { DatasetNodeData, LineageNodeData } from "@/lib/lineage/transform";
import { cn } from "@/lib/utils/cn";
import "@xyflow/react/dist/style.css";

const nodeTypes = {
  dataset: DatasetNode,
  run: RunNode,
  model: ModelNode
};

const MENU_WIDTH = 150;
const MENU_HEIGHT = 88;
const MENU_MARGIN = 8;

function collectConnected(
  nodeId: string,
  nodes: Node<LineageNodeData>[],
  edges: Edge[],
  direction: "forward" | "backward" | "both"
) {
  const queue = [nodeId];
  const visited = new Set<string>([nodeId]);
  const visitedEdges = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    edges.forEach((edge) => {
      const forward = edge.source === current;
      const backward = edge.target === current;
      const shouldFollow =
        direction === "forward" ? forward : direction === "backward" ? backward : forward || backward;
      if (!shouldFollow) return;

      visitedEdges.add(edge.id);
      const other = forward ? edge.target : edge.source;
      if (!visited.has(other)) {
        visited.add(other);
        queue.push(other);
      }
    });
  }

  return { nodeIds: visited, edgeIds: visitedEdges };
}

function collectDirectNeighbors(nodeId: string, edges: Edge[]) {
  const nodeIds = new Set<string>([nodeId]);
  const edgeIds = new Set<string>();

  edges.forEach((edge) => {
    if (edge.source !== nodeId && edge.target !== nodeId) return;
    edgeIds.add(edge.id);
    nodeIds.add(edge.source);
    nodeIds.add(edge.target);
  });

  return { nodeIds, edgeIds };
}

export function LineageGraph({
  rawNodes,
  rawEdges,
  selectedNodeId,
  rootNodeId,
  graphKey,
  onSelectNode,
  highlightPath,
  impactedModelIds,
  onOpenDatasetDetail
}: {
  rawNodes: Node<LineageNodeData>[];
  rawEdges: Edge[];
  selectedNodeId: string;
  rootNodeId: string;
  graphKey: string;
  onSelectNode: (nodeId: string) => void;
  highlightPath: boolean;
  impactedModelIds: string[];
  onOpenDatasetDetail?: (datasetId: string) => void;
}) {
  const router = useRouter();
  const graphRef = useRef<HTMLDivElement | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; node: Node<LineageNodeData> } | null>(null);
  const highlightAnchorId = useMemo(() => {
    if (rawNodes.some((node) => node.id === selectedNodeId)) return selectedNodeId;
    if (rawNodes.some((node) => node.id === rootNodeId)) return rootNodeId;
    return "";
  }, [rawNodes, selectedNodeId, rootNodeId]);
  const hasHighlightAnchor = Boolean(highlightAnchorId);

  const anchorNode = useMemo(
    () => rawNodes.find((node) => node.id === highlightAnchorId),
    [highlightAnchorId, rawNodes]
  );

  // Determine traversal direction based on the anchor node type:
  //   model   → backward only  (model ← run ← dataset)
  //   dataset → forward only   (dataset → run → model)
  //   run     → direct neighbors only, handled separately below
  const anchorDirection = useMemo((): "forward" | "backward" | "both" => {
    if (!highlightAnchorId) return "both";
    if (anchorNode?.type === "model") return "backward";
    if (anchorNode?.type === "dataset") return "forward";
    return "both";
  }, [highlightAnchorId, anchorNode?.type]);

  const connected = useMemo(
    () =>
      hasHighlightAnchor
        ? anchorNode?.type === "run"
          ? collectDirectNeighbors(highlightAnchorId, rawEdges)
          : collectConnected(highlightAnchorId, rawNodes, rawEdges, anchorDirection)
        : { nodeIds: new Set<string>(), edgeIds: new Set<string>() },
    [hasHighlightAnchor, highlightAnchorId, rawNodes, rawEdges, anchorDirection, anchorNode?.type]
  );

  const nodes = useMemo(
    () =>
      rawNodes.map((node) => {
        const selected = node.id === selectedNodeId;
        const dim = highlightPath && hasHighlightAnchor && !connected.nodeIds.has(node.id);
        const impacted = node.type === "model" && impactedModelIds.includes(node.id);
        return {
          ...node,
          data: { ...node.data, isSelected: selected, impacted },
          style: { ...(node.style ?? {}), opacity: dim ? 0.25 : 1 }
        };
      }),
    [rawNodes, selectedNodeId, highlightPath, connected.nodeIds, impactedModelIds]
  );

  const edges = useMemo(
    () =>
      rawEdges.map((edge) => {
        const dim = highlightPath && hasHighlightAnchor && !connected.edgeIds.has(edge.id);
        return {
          ...edge,
          animated: highlightPath && connected.edgeIds.has(edge.id),
          style: { ...(edge.style ?? {}), opacity: dim ? 0.2 : 1 }
        };
      }),
    [rawEdges, highlightPath, selectedNodeId, connected.edgeIds]
  );

  const openNodeDetail = (node: Node<LineageNodeData>) => {
    onSelectNode(node.id);
    setMenu(null);

    if (node.type === "dataset") {
      const data = node.data as DatasetNodeData;
      const datasetId = data.datasetId ?? node.id;
      if (onOpenDatasetDetail) {
        onOpenDatasetDetail(datasetId);
      } else {
        const versionQuery = data.versionId ? `?version=${encodeURIComponent(data.versionId)}` : "";
        router.push(`/datasets/${encodeURIComponent(datasetId)}${versionQuery}`);
      }
      return;
    }

    if (node.type === "run") {
      router.push("/experiments");
      return;
    }

    if (node.type === "model") {
      router.push(`/models/${encodeURIComponent(String(node.data.name))}`);
    }
  };

  return (
    <div ref={graphRef} className="relative h-[680px] w-full overflow-hidden rounded-xl border border-border bg-white" onClick={() => setMenu(null)}>
      <ReactFlow
        key={graphKey}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => onSelectNode(node.id)}
        onPaneClick={() => {
          onSelectNode("");
          setMenu(null);
        }}
        onNodeDoubleClick={(_, node) => openNodeDetail(node)}
        onNodeContextMenu={(event, node) => {
          event.preventDefault();
          event.stopPropagation();
          onSelectNode(node.id);

          const bounds = graphRef.current?.getBoundingClientRect();
          if (!bounds) {
            setMenu({ x: event.clientX, y: event.clientY, node });
            return;
          }

          const x = Math.min(
            Math.max(event.clientX - bounds.left, MENU_MARGIN),
            bounds.width - MENU_WIDTH - MENU_MARGIN
          );
          const y = Math.min(
            Math.max(event.clientY - bounds.top, MENU_MARGIN),
            bounds.height - MENU_HEIGHT - MENU_MARGIN
          );

          setMenu({ x, y, node });
        }}
        fitView
      >
        <Background color="#e2e8f0" gap={20} />
        <Controls position="bottom-right" />
        <MiniMap pannable zoomable position="bottom-left" />
      </ReactFlow>
      {menu ? (
        <div
          className="absolute z-20 min-w-[150px] rounded-md border border-border bg-white p-1 shadow-lg"
          style={{ top: menu.y, left: menu.x }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-slate-100"
            onClick={() => {
              openNodeDetail(menu.node);
            }}
          >
            View detail
          </button>
          <button
            className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-slate-100"
            onClick={() => {
              void navigator.clipboard?.writeText(menu.node.id);
              setMenu(null);
            }}
          >
            Copy ID
          </button>
        </div>
      ) : null}
      <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-white/90 px-2 py-1 text-xs text-slate-500">
        Click: select • Double click: open detail • Right click: actions
      </div>
      {impactedModelIds.length > 0 ? (
        <div className={cn("absolute left-1/2 top-3 -translate-x-1/2 rounded-md border border-red-200 bg-red-50 px-3 py-1 text-xs text-red-700")}>
          {impactedModelIds.length} downstream models impacted
        </div>
      ) : null}
    </div>
  );
}

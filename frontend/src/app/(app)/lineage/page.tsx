"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { LineageGraph } from "@/components/lineage/LineageGraph";
import { LineageToolbar } from "@/components/lineage/LineageToolbar";
import { NodeInfoPanel } from "@/components/lineage/NodeInfoPanel";
import { useImpactAnalysis, useLineageGraph } from "@/hooks/useLineageGraph";
import { getLayoutedElements } from "@/lib/lineage/layout";
import type { LineageNodeData } from "@/lib/lineage/transform";
import type { Edge, Node } from "@xyflow/react";

/**
 * Robustly parse a display name and version from raw node data.
 * Handles two formats:
 *   1. Clean: name="COCO 2017 Detection", version="v1.3"  (separate fields)
 *   2. Embedded: name="COCO 2017 Detection v1.3", version="v1.3" or version=""
 * Always returns: { name: "COCO 2017 Detection", version: "v1.3" }
 */
function parseNodeNameVersion(rawName: string, rawVersion: string): { name: string; version: string } {
  // Normalize the version field first
  let version = rawVersion.trim();
  if (version && !version.toLowerCase().startsWith("v")) version = `v${version}`;
  version = version.toLowerCase();

  // Strip the version suffix from the name if it's embedded there
  let name = rawName.trim();
  if (version) {
    // e.g. name = "COCO 2017 Detection v1.3", version = "v1.3" → strip suffix
    const suffixRe = new RegExp(`\\s+${version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
    name = name.replace(suffixRe, "").trim();
  } else {
    // version field is empty — try to parse version out of the name itself
    // matches patterns like "ResNet-50 v3", "COCO 2017 Detection v1.3"
    const match = name.match(/^(.+?)\s+(v[\d][\d.]*)$/i);
    if (match) {
      name = match[1].trim();
      version = match[2].toLowerCase();
    }
  }

  return { name, version };
}

export default function LineagePage() {
  const [rootType, setRootType] = useState<"dataset" | "model">("dataset");
  const [rootId, setRootId] = useState("");
  const [depth, setDepth] = useState(3);
  const [highlightPath, setHighlightPath] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [impactMode, setImpactMode] = useState(false);
  // Client-side filter state lifted from toolbar
  const [filterModelName, setFilterModelName] = useState("");
  const [filterVersion, setFilterVersion] = useState("");

  const graph = useLineageGraph(rootType, rootId, depth);
  const selectorGraph = useLineageGraph(rootType, "", 4);
  const impact = useImpactAnalysis(impactMode ? rootId : "");

  // Structured node options — parse name/version consistently regardless of API format
  const nodeOptions = useMemo(
    () =>
      (selectorGraph.data?.nodes ?? []).map((node) => {
        const data = node.data as { name?: string; version?: string };
        const { name, version } = parseNodeNameVersion(
          String(data.name ?? node.id),
          String(data.version ?? "")
        );
        return {
          id: node.id,
          name,
          version,
          type: node.type as "dataset" | "run" | "model"
        };
      }),
    [selectorGraph.data?.nodes]
  );

  const selectedNode = useMemo(() => (graph.data?.nodes ?? []).find((node) => node.id === selectedNodeId) ?? null, [graph.data?.nodes, selectedNodeId]);

  // ── Client-side subgraph extraction ──────────────────────────────────────
  const filteredGraphData = useMemo(() => {
    const allNodes = (graph.data?.nodes ?? []) as Node<LineageNodeData>[];
    const allEdges = (graph.data?.edges ?? []) as Edge[];

    if (!filterModelName) return { nodes: allNodes, edges: allEdges };

    // Find seed nodes (model or dataset) that match the filter
    // Use parseNodeNameVersion so matching is consistent with what the dropdowns show
    const seedIds = new Set<string>(
      allNodes
        .filter((node) => {
          if (node.type !== rootType) return false;
          const data = node.data as { name?: string; version?: string };
          const { name, version } = parseNodeNameVersion(
            String(data.name ?? ""),
            String(data.version ?? "")
          );
          if (name !== filterModelName) return false;
          if (!filterVersion) return true; // match any version of this entity
          return version === filterVersion;
        })
        .map((n) => n.id)
    );

    if (seedIds.size === 0) return { nodes: allNodes, edges: allEdges };

    // Directed BFS to collect connected nodes + edges:
    //   dataset mode → traverse FORWARD  (dataset → run → model)
    //   model mode   → traverse BACKWARD (model  ← run ← dataset)
    // Using directed traversal prevents sibling entities from bleeding in
    // (e.g. Dataset B that shares a Run with Dataset A should NOT appear when filtering Dataset A)
    const connectedNodeIds = new Set<string>(seedIds);
    const connectedEdgeIds = new Set<string>();
    const nodeTypeById = new Map(allNodes.map((node) => [node.id, node.type]));
    const queue = [...seedIds];

    while (queue.length > 0) {
      const current = queue.shift()!;
      allEdges.forEach((edge) => {
        const forward = edge.source === current;   // current → next
        const backward = edge.target === current;  // current ← prev

        // For datasets: follow forward edges, and include model inputs for matching runs
        // For models:   follow backward edges only
        const shouldFollow =
          rootType === "dataset"
            ? forward || (nodeTypeById.get(current) === "run" && backward && nodeTypeById.get(edge.source) === "model")
            : backward;
        if (!shouldFollow) return;

        connectedEdgeIds.add(edge.id);
        const other = forward ? edge.target : edge.source;
        if (!connectedNodeIds.has(other)) {
          connectedNodeIds.add(other);
          queue.push(other);
        }
      });
    }

    const subNodes = allNodes.filter((n) => connectedNodeIds.has(n.id));
    const subEdges = allEdges.filter((e) => connectedEdgeIds.has(e.id));

    // Re-layout the subgraph so dagre positions are clean
    return getLayoutedElements(subNodes, subEdges);
  }, [graph.data?.nodes, graph.data?.edges, filterModelName, filterVersion, rootType]);

  useEffect(() => {
    if (!selectedNodeId) return;
    // Check against the DISPLAYED graph, not the raw API data
    const exists = filteredGraphData.nodes.some((node) => node.id === selectedNodeId);
    if (!exists) setSelectedNodeId("");
  }, [filteredGraphData.nodes, selectedNodeId]);

  const graphKey = useMemo(() => {
    const nodeIds = filteredGraphData.nodes.map((node) => node.id).sort().join("|");
    const edgeIds = filteredGraphData.edges.map((edge) => `${edge.source}>${edge.target}:${edge.id}`).sort().join("|");
    return `${nodeIds}::${edgeIds}`;
  }, [filteredGraphData.nodes, filteredGraphData.edges]);

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Lineage Graph</h1>
      <LineageToolbar
        rootType={rootType}
        rootId={rootId}
        depth={depth}
        highlightPath={highlightPath}
        onRootTypeChange={(value) => {
          setRootType(value);
          setRootId("");
        }}
        onRootIdChange={(value) => {
          setRootId(value);
          setImpactMode(false);
          // Auto-select the node so it shows the "selected" ring in the graph
          if (value) setSelectedNodeId(value);
        }}
        onDepthChange={setDepth}
        onToggleHighlightPath={setHighlightPath}
        onFilterChange={(modelName, version) => {
          setFilterModelName(modelName);
          setFilterVersion(version);
          // Clear stale selection when filter changes
          setSelectedNodeId("");
        }}
        onReset={() => {
          setDepth(3);
          setHighlightPath(true);
          setRootId("");
          setSelectedNodeId("");
          setImpactMode(false);
          setFilterModelName("");
          setFilterVersion("");
        }}
        nodeOptions={nodeOptions}
      />

      <div className="grid gap-3 lg:grid-cols-[260px_1fr]">
        <aside className="space-y-3">
          <div className="rounded-xl border border-border bg-white p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Legend</p>
            <ul className="space-y-2 text-sm text-slate-700">
              <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-node-dataset" />Dataset</li>
              <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-node-run" />Run</li>
              <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-node-model" />Model</li>
            </ul>
          </div>

          <div className="rounded-xl border border-border bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Impact Analysis</p>
              <button
                type="button"
                className="rounded-md border border-border px-2 py-1 text-xs hover:bg-slate-50"
                onClick={() => setImpactMode((prev) => !prev)}
              >
                {impactMode ? "Disable" : "Enable"}
              </button>
            </div>
            <p className="text-xs text-slate-600">Enable this mode to highlight downstream models impacted by the selected dataset.</p>
            {impactMode && impact.hasImpact ? (
              <p className="mt-2 flex items-center gap-1 text-xs text-red-700">
                <AlertTriangle size={14} />
                {impact.data?.message}
              </p>
            ) : null}
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Selected Node</p>
            <NodeInfoPanel node={selectedNode} />
          </div>
        </aside>

        <main>
          <LineageGraph
            rawNodes={filteredGraphData.nodes}
            rawEdges={filteredGraphData.edges}
            selectedNodeId={selectedNodeId}
            // Suppress rootNodeId as highlight anchor when a name filter is active.
            // In a filtered subgraph all nodes are already connected, so using rootNodeId
            // as anchor would animate every edge. Highlight path should only activate
            // from user-clicked nodes (selectedNodeId) in that context.
            rootNodeId={filterModelName ? "" : rootId}
            graphKey={graphKey}
            onSelectNode={setSelectedNodeId}
            highlightPath={highlightPath}
            impactedModelIds={impactMode ? impact.data?.affectedModelIds ?? [] : []}
          />
        </main>
      </div>
    </div>
  );
}

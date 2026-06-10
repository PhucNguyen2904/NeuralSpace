"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { LineageGraph } from "@/components/lineage/LineageGraph";
import { LineageToolbar } from "@/components/lineage/LineageToolbar";
import { NodeInfoPanel } from "@/components/lineage/NodeInfoPanel";
import { useImpactAnalysis, useLineageGraph } from "@/hooks/useLineageGraph";

export default function LineagePage() {
  const [rootType, setRootType] = useState<"dataset" | "model">("dataset");
  const [rootId, setRootId] = useState("");
  const [depth, setDepth] = useState(3);
  const [highlightPath, setHighlightPath] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [impactMode, setImpactMode] = useState(false);

  const graph = useLineageGraph(rootType, rootId, depth);
  const selectorGraph = useLineageGraph(rootType, "", 4);
  const impact = useImpactAnalysis(impactMode ? rootId : "");

  const nodeOptions = useMemo(
    () =>
      (selectorGraph.data?.nodes ?? []).map((node) => {
        const data = node.data as { name?: string; version?: string };
        const name = String(data.name ?? node.id);
        const version = data.version ? ` ${data.version.startsWith("v") ? data.version : `v${data.version}`}` : "";
        return {
          id: node.id,
          name: `${name}${version}`,
          type: node.type as "dataset" | "run" | "model"
        };
      }),
    [selectorGraph.data?.nodes]
  );

  const selectedNode = useMemo(() => (graph.data?.nodes ?? []).find((node) => node.id === selectedNodeId) ?? null, [graph.data?.nodes, selectedNodeId]);

  useEffect(() => {
    if (!selectedNodeId) return;
    const exists = (graph.data?.nodes ?? []).some((node) => node.id === selectedNodeId);
    if (!exists) setSelectedNodeId("");
  }, [graph.data?.nodes, selectedNodeId]);

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
        }}
        onDepthChange={setDepth}
        onToggleHighlightPath={setHighlightPath}
        onReset={() => {
          setDepth(3);
          setHighlightPath(true);
          setRootId("");
          setSelectedNodeId("");
          setImpactMode(false);
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
            <p className="text-xs text-slate-600">Bật chế độ này để highlight model downstream bị ảnh hưởng từ dataset đã chọn.</p>
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
            rawNodes={graph.data?.nodes ?? []}
            rawEdges={graph.data?.edges ?? []}
            selectedNodeId={selectedNodeId}
            rootNodeId={rootId}
            onSelectNode={setSelectedNodeId}
            highlightPath={highlightPath}
            impactedModelIds={impactMode ? impact.data?.affectedModelIds ?? [] : []}
          />
        </main>
      </div>
    </div>
  );
}

import dagre from "@dagrejs/dagre";
import type { Edge, Node } from "@xyflow/react";
import type { LineageNodeData } from "@/lib/lineage/transform";

const NODE_WIDTH = 200;
const NODE_HEIGHT = 100;

export function getLayoutedElements(nodes: Node<LineageNodeData>[], edges: Edge[]) {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: "LR",
    ranksep: 150,
    nodesep: 64,
    marginx: 40,
    marginy: 40
  });

  nodes.forEach((node) => graph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));
  edges.forEach((edge) => graph.setEdge(edge.source, edge.target));
  dagre.layout(graph);

  const nextNodes = nodes.map((node) => {
    const p = graph.node(node.id);
    return {
      ...node,
      position: {
        x: p.x - NODE_WIDTH / 2,
        y: p.y - NODE_HEIGHT / 2
      }
    };
  });

  return { nodes: nextNodes, edges };
}

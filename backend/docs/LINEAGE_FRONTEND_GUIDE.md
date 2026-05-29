# Frontend LineageGraph Rendering Guide

## API shape
`GET /api/v1/lineage/graph?root_type=dataset_version&root_id=<id>&depth=3`
returns:
- `nodes[]`: `{ id, type, label, metadata, status }`
- `edges[]`: `{ from, to, label, metadata }`

## Option A: React Flow (recommended)
1. Install:
```bash
npm i reactflow
```
2. Map backend payload:
```ts
const rfNodes = graph.nodes.map((n) => ({
  id: n.id,
  data: { label: n.label, meta: n.metadata },
  position: { x: 0, y: 0 },
  type: n.type,
}));

const rfEdges = graph.edges.map((e, i) => ({
  id: `e-${i}`,
  source: e.from,
  target: e.to,
  label: e.label,
  animated: e.label === 'used_for_training',
}));
```
3. Color by type:
- dataset_version: blue
- run: amber
- model_version: green

4. Add filters:
- hide non-production models
- depth slider
- highlight impacted nodes

## Option B: D3 force graph
- Use `d3-force` with `forceLink().id(d => d.id)`
- Node radius by degree
- Edge stroke by label (`used_for_training` vs `produced`)

## UX tips
- Click node -> open side panel with metadata and deep links
- Keep graph incremental (request depth=1 first, expand on demand)
- Cache lineage by `root_type:root_id:depth` on frontend state

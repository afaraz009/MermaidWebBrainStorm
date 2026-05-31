// All node shapes the renderer + parser + border-clipper know how to draw.
// Maps 1:1 onto Mermaid flowchart's FlowVertexTypeParam values (see
// `node_modules/mermaid/dist/diagrams/flowchart/types.d.ts`), normalised to a
// single canonical name per shape. `rect` is the fallback for any unknown
// vertex type so the renderer never silently fails on an unrecognised shape.
export type NodeShape =
  | 'rect'           // [text]            — square corners
  | 'round'          // (text)            — rounded rectangle
  | 'stadium'        // ([text])          — pill / fully-rounded rectangle
  | 'subroutine'     // [[text]]          — rectangle with vertical bars
  | 'cylinder'       // [(text)]          — database/disk
  | 'circle'         // ((text))          — circle
  | 'double-circle'  // (((text)))        — circle in a circle
  | 'diamond'        // {text}            — decision rhombus
  | 'hexagon'        // {{text}}          — hexagon
  | 'parallelogram'  // [/text/]          — parallelogram leaning right
  | 'parallelogram-alt' // [\text\]       — parallelogram leaning left
  | 'trapezoid'      // [/text\]          — trapezoid (wide top)
  | 'trapezoid-alt'  // [\text/]          — trapezoid (wide bottom)
  | 'asymmetric'     // >text]            — flag / asymmetric shape ("odd")
  | 'ellipse';       // ellipse           — wide oval (legacy alias)

export interface IRNode {
  id: string;
  label: string;
  shape: NodeShape;
  parent?: string;
  pinned?: boolean;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface IREdge {
  // Unique within an IR — load-bearing identity. Two edges may share
  // (from, to) when findNonClusterChild's reserve-fallback rewrites a
  // subgraph endpoint to a leaf that's already an explicit endpoint of
  // another edge (see fixture_reserve_fallback.mmd). Renderer keys edges
  // by `id` (not (from,to)) and layout passes `id` as dagre's multigraph
  // edge name so duplicates survive end-to-end.
  id: string;
  from: string;
  to: string;
  label?: string;
  style?: 'solid' | 'dotted';
  points?: { x: number; y: number }[];
  originalPoints?: { x: number; y: number }[];
  routedPath?: { x: number; y: number }[];
  // When set, indicates this edge's endpoint was rewritten from a subgraph id
  // by parser-adapter.ts. Renderer/layout should clip the edge endpoint to the
  // cluster's bbox border instead of the leaf shape's outline. Mirrors
  // Mermaid's `fromCluster`/`toCluster` edge attributes from
  // adjustClustersAndEdges Pass 4 (mermaid.core/dagre-KV5264BT.mjs:262-268).
  fromCluster?: string;
  toCluster?: string;
  // Dagre's label-dummy coordinate (`g.edge(...).x/y`) for this edge, in global
  // coords, recorded by the RECURSIVE engine only. This is where dagre reserved
  // the label rank — Mermaid's `positionEdgeLabel` anchors the label here. Our
  // post-dagre clipping (clipEdgeWaypoints) straightens the routed path, so this
  // raw coord can end up slightly OFF the final path; the renderer snaps it to
  // the nearest point on the drawn path (edgeLabelAnchor). Unset on the flat
  // legacy path and deleted when a non-layout reroute (side-aware drag / A*)
  // rebuilds the path, so the renderer falls back to a path-relative anchor.
  // Cleared at the top of layout() so a recursive→flat flip can't read a stale
  // value. See HANDOFF-4.
  labelPos?: { x: number; y: number };
}

export interface IRSubgraph {
  id: string;
  label: string;
  parent?: string;
  children: string[];
  collapsed?: boolean;
  // The subgraph's own declared `direction` (from a `direction XX` line inside
  // the block), normalised like the top-level direction. `undefined` when the
  // block declares none — recursive layout then applies Mermaid's default-dir
  // flip for an encapsulated cluster (parent TB → LR, else TB). Mirrors
  // Mermaid's `subGraph.dir` → cluster node `clusterData.dir`.
  direction?: Direction;
}

// Top-level flow direction, normalised from Mermaid's `db.getDirection()`
// (TD→TB). Maps 1:1 onto dagre's `rankdir`. Per-subgraph `direction`
// overrides are NOT represented here — flat dagre applies a single rankdir
// to the whole graph, so a nested subgraph declaring a direction different
// from the top-level one is a known parity gap (see fixture_lr_subdir.mmd).
export type Direction = 'TB' | 'BT' | 'LR' | 'RL';

export interface IR {
  nodes: IRNode[];
  edges: IREdge[];
  subgraphs: IRSubgraph[];
  // Defaults to 'TB' when the source omits a direction.
  direction?: Direction;
  // Per-cluster drawn-rect half-margins (per side, on each axis) set by the
  // RECURSIVE engine only. When present for a cluster id, computeClusterBboxes
  // expands that cluster's content bbox by these (symmetric, NO label offset)
  // instead of the flat-path CLUSTER_PADDING/CLUSTER_LABEL_OFFSET — so the
  // recursive cluster's DRAWN rect equals Mermaid's dagre compound-box size
  // (rank-axis margin = ranksep/2, cross-axis margin = (nodesep+edgesep)/2,
  // mapped to x/y by the cluster's direction). The flat path leaves this unset,
  // so its clusters keep the legacy padding and stay byte-identical. Cleared at
  // the top of layout() so a graph that flips recursive→flat can't read stale
  // margins. See recursive-layout.ts (clusterMargins) and HANDOFF-1.
  clusterMargins?: Map<string, { x: number; y: number }>;
  // Per-cluster DRAWN rect (top-left corner + size) in global coords, recorded
  // directly from dagre's compound box by recursive-layout.ts. Preferred over
  // clusterMargins by cluster-bbox.ts when present: a cluster whose compound box
  // is widened by edge-routing dummies (e.g. an external cluster with cross-
  // boundary edges fanning into it) is NOT symmetric around its leaves, so the
  // leaf-bbox + symmetric-margin model under-sizes it. The recorded rect IS
  // Mermaid's drawn rect (both derive from the same dagre-d3-es compound box).
  clusterRects?: Map<string, { x: number; y: number; w: number; h: number }>;
}

// Live-mutable A* settings shared by routing, the grid overlay, and the UI.
// Plain object (not a class) so reads are zero-cost.

export type HeuristicName = 'manhattan' | 'octile' | 'euclidean' | 'chebyshev' | 'zero';
export type Connectivity = 4 | 8;
// Which non-A* edge strategy is active. Orthogonal to the A* on/off toggle:
// A* routing (when enabled) always takes precedence at render time; this
// only controls what the dagre / drag-preview / drop-time path looks like.
//   'side-aware' — bbox-axis + side-distributed + Manhattan midpoint curves
//                  (the "side deduction" strategy added in commit 76420cd).
//   'dagre'      — pre-76420cd behaviour: render dagre's originalPoints with
//                  curveBasis, straight center-to-center drag preview,
//                  re-run dagre on drop.
export type EdgeMode = 'side-aware' | 'dagre';
// How aggressively to push parallel edges apart in batch (full re-route) mode:
//   'off'  — independent A* per edge, paths may overlap.
//   'soft' — earlier edges add a per-cell penalty; later edges prefer free
//            cells but may share where space is tight.
//   'hard' — earlier edges hard-block their cells; later edges must find a
//            disjoint route or fall back to a straight line.
export type EdgeSeparation = 'off' | 'soft' | 'hard';

export interface AstarSettings {
  cellSize: number;
  padding: number;
  marginCells: number;
  connectivity: Connectivity;
  cornerCut: boolean;
  heuristic: HeuristicName;
  // When false, edges keep their dagre-routed `originalPoints` and drag /
  // re-route paths skip the A* pass — UI toggle for "Hide A* Feature".
  enabled: boolean;
  // Edge-separation mode for full re-routes (toggle-on, expand/collapse).
  // Drag re-routes ignore this setting and always run independent A*.
  separation: EdgeSeparation;
  // Live edge-rendering strategy. Derived from `enabled` for backwards
  // compatibility on first load; user can change via the "Edges:" button.
  edgeMode: EdgeMode;
  // Debug toggle. When true, `chooseEdgesToReverseForMermaidOrder` runs and
  // dagre's input edges are reversed on inter-cluster cycles so subgraph
  // ranking matches Mermaid's reference output. When false, raw
  // `@dagrejs/dagre` ordering is used — useful for seeing what the parity fix
  // actually corrects. Toggle via the "Mermaid parity" button.
  mermaidParity: boolean;
}

export const astarSettings: AstarSettings = {
  cellSize: 10,
  // Padding is locked to cellSize so the blocked ring around each node is
  // exactly one cell wide (no sub-cell quantization rounding). Keep it in
  // sync if cellSize ever changes at runtime.
  padding: 10,
  marginCells: 4,
  connectivity: 4,
  cornerCut: false,
  heuristic: 'manhattan',
  enabled: false,
  separation: 'off',
  edgeMode: 'side-aware',
  mermaidParity: true,
};

// A snapshot of the cells A* touched on its most recent invocation. Used by
// the grid overlay to render closed/open sets. Maps grid-cell coordinates to
// world space, so the overlay can draw on the diagram canvas.
export interface AstarTrace {
  cellSize: number;
  cols: number;
  rows: number;
  originX: number;
  originY: number;
  closed: Uint8Array;
  open: Uint8Array;
  expanded: number;
  // Cells that were excluded from being marked as obstacles for this call
  // (i.e. the source and goal nodes' padded bboxes). Same coordinate system
  // as `closed`/`open`. The overlay uses this to suppress the red obstacle
  // tint on the endpoints of the last-routed edge.
  excludedCells: Uint8Array;
  // The chosen start and goal cells (the cells A* actually searched from/to).
  startCell: { cx: number; cy: number };
  goalCell: { cx: number; cy: number };
}

export const lastTrace: { value: AstarTrace | null } = { value: null };

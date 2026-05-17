// Live-mutable A* settings shared by routing, the grid overlay, and the UI.
// Plain object (not a class) so reads are zero-cost.

export type HeuristicName = 'manhattan' | 'octile' | 'euclidean' | 'chebyshev' | 'zero';
export type Connectivity = 4 | 8;

export interface AstarSettings {
  cellSize: number;
  padding: number;
  marginCells: number;
  connectivity: Connectivity;
  cornerCut: boolean;
  heuristic: HeuristicName;
}

export const astarSettings: AstarSettings = {
  cellSize: 10,
  // Padding is locked to cellSize so the blocked ring around each node is
  // exactly one cell wide (no sub-cell quantization rounding). Keep it in
  // sync if cellSize ever changes at runtime.
  padding: 10,
  marginCells: 4,
  connectivity: 8,
  cornerCut: false,
  heuristic: 'octile',
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

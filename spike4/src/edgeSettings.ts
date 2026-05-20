// Live-mutable edge-rendering settings — the non-A* strategy used at render
// time and during drag/drop. Orthogonal to `astarSettings`:
//   • A* routing (when enabled in `astarSettings`) always wins at render time;
//     `edgeMode` only controls what the dagre / drag-preview / drop-time path
//     looks like when A* is off (or hasn't been run on a given edge yet).
//   • 'side-aware' — bbox-axis + side-distributed + Manhattan midpoint curves
//                    (the "side deduction" strategy added in commit 76420cd).
//   • 'dagre'      — pre-76420cd behaviour: render dagre's originalPoints with
//                    curveBasis, straight center-to-center drag preview,
//                    re-run dagre on drop.

export type EdgeMode = 'side-aware' | 'dagre';

export interface EdgeSettings {
  edgeMode: EdgeMode;
}

export const edgeSettings: EdgeSettings = {
  edgeMode: 'side-aware',
};

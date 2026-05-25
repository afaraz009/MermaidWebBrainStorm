// Live-mutable layout settings — knobs for `layout.ts` and the dagre adapter.
// Kept separate from `astarSettings` (which is the pathfinder) and
// `edgeSettings` (which picks the non-A* edge strategy) so each singleton has
// one job.

export interface LayoutSettings {
  // When true, `chooseEdgesToReverseForMermaidOrder` runs and dagre's input
  // edges are reversed on inter-cluster cycles so subgraph ranking matches
  // Mermaid's reference output. When false, raw `@dagrejs/dagre` ordering is
  // used — useful as a debug toggle to see what the parity fix actually
  // corrects.
  mermaidParity: boolean;
}

export const layoutSettings: LayoutSettings = {
  mermaidParity: true,
};

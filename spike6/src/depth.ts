import type { IR } from './types.js';

// Nesting depth of each subgraph, derived purely from the `parent` chain that
// the parser stamps on `IRSubgraph` (the immediate containing subgraph id).
// Root subgraphs (no parent) are depth 1; each nesting level adds 1. This is a
// pure read over `ir.subgraphs` — it does NOT touch layout, collapse flags, or
// the renderer. The depth slider (entry.ts) uses it to drive `sg.collapsed`.
//
// Returns a Map keyed by subgraph id. A broken/cyclic parent link (which the
// parser should never produce) is guarded against so this can't loop forever;
// such a chain just stops counting at the cycle.
export function computeDepths(ir: IR): Map<string, number> {
  const byId = new Map(ir.subgraphs.map(s => [s.id, s]));
  const depths = new Map<string, number>();

  function depthOf(id: string): number {
    const cached = depths.get(id);
    if (cached !== undefined) return cached;
    const seen = new Set<string>();
    let depth = 1;
    let parent = byId.get(id)?.parent;
    while (parent && byId.has(parent) && !seen.has(parent)) {
      seen.add(parent);
      depth++;
      parent = byId.get(parent)!.parent;
    }
    depths.set(id, depth);
    return depth;
  }

  for (const sg of ir.subgraphs) depthOf(sg.id);
  return depths;
}

// Deepest nesting level present in the graph (0 when there are no subgraphs).
// Used to set the depth slider's `max` from the loaded fixture.
export function maxDepth(ir: IR): number {
  let max = 0;
  for (const d of computeDepths(ir).values()) max = Math.max(max, d);
  return max;
}

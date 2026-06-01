import type { IR } from './types.js';

// Shared disclosure-overlay primitive — pure helpers, no listeners and no mode
// state. Reused by focus mode (Step 2) and path mode (Step 3). All of this is
// framework-agnostic IR-walk + SVG-class mutation, so it ports into the product
// render package largely unchanged.

export interface Adjacency {
  // Undirected neighbours of each node id (focus mode's 1-hop walk uses this).
  neighbors: Map<string, Set<string>>;
  // Incident edge keys (= `e.id` = the `data-edge-key` attribute) of each node id.
  incident: Map<string, string[]>;
  // Directed successors: `from → to` for each edge. Path mode's forward reach.
  out: Map<string, Set<string>>;
  // Directed predecessors: `to → from` for each edge. Path mode's backward reach.
  in: Map<string, Set<string>>;
}

// Build undirected adjacency over the EFFECTIVE IR's edges. Surrogate
// (collapsed-cluster) nodes are ordinary nodes here — they appear in
// `ir.nodes`, so they get entries like any leaf. The edge key is `e.id`, which
// the renderer uses verbatim as `data-edge-key` (see renderer.ts `edgeKey`).
export function buildAdjacency(ir: IR): Adjacency {
  const neighbors = new Map<string, Set<string>>();
  const incident = new Map<string, string[]>();
  const out = new Map<string, Set<string>>();
  const inAdj = new Map<string, Set<string>>();
  for (const n of ir.nodes) {
    neighbors.set(n.id, new Set());
    incident.set(n.id, []);
    out.set(n.id, new Set());
    inAdj.set(n.id, new Set());
  }
  // An endpoint not present in `ir.nodes` (shouldn't happen for a well-formed
  // effective IR, but be defensive) still gets an entry so lookups never miss.
  const ensure = (id: string): void => {
    if (!neighbors.has(id)) neighbors.set(id, new Set());
    if (!incident.has(id)) incident.set(id, []);
    if (!out.has(id)) out.set(id, new Set());
    if (!inAdj.has(id)) inAdj.set(id, new Set());
  };
  for (const e of ir.edges) {
    ensure(e.from);
    ensure(e.to);
    neighbors.get(e.from)!.add(e.to);
    neighbors.get(e.to)!.add(e.from);
    incident.get(e.from)!.push(e.id);
    incident.get(e.to)!.push(e.id);
    out.get(e.from)!.add(e.to);
    inAdj.get(e.to)!.add(e.from);
  }
  return { neighbors, incident, out, in: inAdj };
}

// Dim everything NOT in the active sets and mark the active ones, by mutating
// classes on the live SVG. Operates on `[data-node-id]` and `[data-edge-key]`
// elements only — cluster rects (`[data-subgraph-id]`) are intentionally left
// alone this round. Idempotent: re-calling with a new selection re-classes all
// elements without a separate clear.
export function setEmphasis(
  svg: SVGSVGElement,
  activeNodeIds: Set<string>,
  activeEdgeKeys: Set<string>,
): void {
  svg.querySelectorAll('[data-node-id]').forEach((el) => {
    const active = activeNodeIds.has(el.getAttribute('data-node-id')!);
    el.classList.toggle('disclosure-active', active);
    el.classList.toggle('disclosure-dim', !active);
  });
  svg.querySelectorAll('[data-edge-key]').forEach((el) => {
    const active = activeEdgeKeys.has(el.getAttribute('data-edge-key')!);
    el.classList.toggle('disclosure-active', active);
    el.classList.toggle('disclosure-dim', !active);
  });
}

// Restore full opacity: remove both overlay classes from every element. Safe to
// call when nothing is emphasised.
export function clearEmphasis(svg: SVGSVGElement): void {
  svg.querySelectorAll('.disclosure-dim, .disclosure-active').forEach((el) => {
    el.classList.remove('disclosure-dim', 'disclosure-active');
  });
}

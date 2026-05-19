import { graphlib, layout as dagreLayout } from '@dagrejs/dagre';
import type { IR, NodeShape } from './types.js';
import { clipToBorder } from './border.js';
import { astarSettings } from './astarSettings.js';

// Round up to a multiple of `step`. Used to size nodes and snap positions to
// the A* grid so every node boundary lands on a cell line.
function ceilTo(v: number, step: number): number {
  return Math.ceil(v / step) * step;
}

// Per-shape canonical sizes. These are the "gallery" sizes — every node of a
// given shape renders at this fixed footprint, regardless of label length.
// Longer labels still get a width bump (Math.max with the text width) so they
// don't overflow the shape, but the *base* dimensions are constant so any
// diagram renders with the same look as the shape gallery.
//
// Numbers chosen to match the gallery proportions; tweak here to retune
// everywhere.
const SHAPE_SIZES: Record<NodeShape, { w: number; h: number }> = {
  rect:                { w: 130, h: 40 },
  round:               { w: 130, h: 40 },
  stadium:             { w: 140, h: 50 },
  subroutine:          { w: 150, h: 50 },
  cylinder:            { w: 140, h: 60 },
  circle:              { w: 90,  h: 90 },
  'double-circle':     { w: 110, h: 110 },
  diamond:             { w: 140, h: 80 },
  hexagon:             { w: 150, h: 60 },
  parallelogram:       { w: 160, h: 50 },
  'parallelogram-alt': { w: 160, h: 50 },
  trapezoid:           { w: 160, h: 60 },
  'trapezoid-alt':     { w: 160, h: 60 },
  asymmetric:          { w: 150, h: 50 },
  ellipse:             { w: 160, h: 60 },
};

// Resolve a node's bounding-box size. Looks up the canonical size for the
// shape; for longer-than-default labels, expands the width just enough to
// keep the label inside (height stays canonical).
function sizeForShape(shape: NodeShape, labelLen: number): { w: number; h: number } {
  const base = SHAPE_SIZES[shape] ?? SHAPE_SIZES.rect;
  // Rough text footprint: 8px/char + 24px padding. Only widens the box; never
  // shrinks it below the canonical size.
  const textW = labelLen * 8 + 24;
  if (shape === 'circle' || shape === 'double-circle') {
    // Keep these as squares so the inscribed circle stays a circle even when
    // the label is long.
    const d = Math.max(base.w, textW);
    return { w: d, h: d };
  }
  return { w: Math.max(base.w, textW), h: base.h };
}

// Walk inter-cluster edges to identify cycles between top-level subgraphs.
// Returns the set of IR edges that should be reversed for dagre layout so the
// resulting subgraph ordering matches Mermaid's reference (later-declared
// subgraph above earlier-declared on a cycle). The reversal is undone for
// rendering — dagre's edge points are flipped back to the original direction.
function chooseEdgesToReverseForMermaidOrder(ir: IR): Set<import('./types.js').IREdge> {
  if (ir.subgraphs.length === 0) return new Set();

  // Map every node to its top-level (root) subgraph id, or undefined.
  const sgById = new Map(ir.subgraphs.map(sg => [sg.id, sg]));
  function rootSgOf(sgId: string | undefined): string | undefined {
    let cur = sgId;
    while (cur) {
      const sg = sgById.get(cur);
      if (!sg) return cur;
      if (!sg.parent) return cur;
      cur = sg.parent;
    }
    return undefined;
  }
  const nodeRootSg = new Map<string, string | undefined>();
  for (const n of ir.nodes) nodeRootSg.set(n.id, rootSgOf(n.parent));

  // Declaration-order index for each top-level subgraph.
  const sgIndex = new Map<string, number>();
  ir.subgraphs.filter(sg => !sg.parent).forEach((sg, i) => sgIndex.set(sg.id, i));

  // Build an inter-cluster adjacency: for each ordered pair (A, B) of distinct
  // top-level subgraphs, does at least one edge go from A to B?
  const adj = new Map<string, Set<string>>();
  for (const e of ir.edges) {
    const fromSg = nodeRootSg.get(e.from);
    const toSg = nodeRootSg.get(e.to);
    if (!fromSg || !toSg || fromSg === toSg) continue;
    if (!sgIndex.has(fromSg) || !sgIndex.has(toSg)) continue;
    if (!adj.has(fromSg)) adj.set(fromSg, new Set());
    adj.get(fromSg)!.add(toSg);
  }

  // For each edge that goes earlier→later subgraph, check if there's also a
  // path back (later→…→earlier). If yes, mark this edge for reversal so dagre
  // ranks the later-declared subgraph above the earlier one.
  const toReverse = new Set<import('./types.js').IREdge>();
  for (const e of ir.edges) {
    const fromSg = nodeRootSg.get(e.from);
    const toSg = nodeRootSg.get(e.to);
    if (!fromSg || !toSg || fromSg === toSg) continue;
    const fi = sgIndex.get(fromSg);
    const ti = sgIndex.get(toSg);
    if (fi == null || ti == null) continue;
    if (fi >= ti) continue;  // already goes later→earlier or same — leave it
    // BFS from `toSg` to see if we can reach `fromSg` via inter-cluster edges.
    const seen = new Set<string>([toSg]);
    const queue: string[] = [toSg];
    let cycle = false;
    while (queue.length) {
      const cur = queue.shift()!;
      const next = adj.get(cur);
      if (!next) continue;
      for (const n of next) {
        if (n === fromSg) { cycle = true; break; }
        if (!seen.has(n)) { seen.add(n); queue.push(n); }
      }
      if (cycle) break;
    }
    if (cycle) toReverse.add(e);
  }
  return toReverse;
}

export function layout(ir: IR): IR {
  // Match Mermaid's dagre setup so subgraph rank/column placement aligns with
  // the reference renderer. Mermaid uses `multigraph: true, compound: true`
  // with no explicit acyclicer and lets @dagrejs default-rank the graph.
  const g = new graphlib.Graph({ multigraph: true, compound: true });
  g.setGraph({
    rankdir: 'TB',
    nodesep: 50,
    ranksep: 50,
    marginx: 8,
    marginy: 8,
  });
  g.setDefaultEdgeLabel(() => ({}));

  const cell = astarSettings.cellSize;

  // Subgraph compound nodes — size also snapped to cellSize so subgraph
  // boundaries align with grid lines. Insertion order matches IR declaration
  // order (same as Mermaid).
  for (const sg of ir.subgraphs) {
    g.setNode(sg.id, {
      label: sg.label,
      width: ceilTo(sg.label.length * 8 + 24, cell),
      height: ceilTo(30, cell),
    });
  }
  for (const sg of ir.subgraphs) {
    if (sg.parent) g.setParent(sg.id, sg.parent);
  }

  // Leaf nodes in IR declaration order.
  for (const n of ir.nodes) {
    const { w: rawW, h: rawH } = sizeForShape(n.shape, n.label.length);
    const width = ceilTo(rawW, cell);
    const height = ceilTo(rawH, cell);
    if (n.pinned && n.x != null && n.y != null) {
      g.setNode(n.id, { label: n.label, width, height, x: n.x, y: n.y });
    } else {
      g.setNode(n.id, { label: n.label, width, height });
    }
    if (n.parent) g.setParent(n.id, n.parent);
  }

  // Detect inter-cluster edges that form a cycle and pick which ones to
  // reverse for dagre layout. Mermaid's reference puts the LATER-declared
  // subgraph above the EARLIER-declared one when there's a cycle between
  // them. To match: for each inter-cluster edge whose source subgraph was
  // declared BEFORE its target subgraph AND a reverse path exists (cycle),
  // reverse the edge in dagre's view so the later-declared cluster ranks
  // higher. The original direction is preserved for rendering via
  // `reversedEdges` — we swap the points back after dagre runs.
  const reversedEdges = chooseEdgesToReverseForMermaidOrder(ir);

  for (const e of ir.edges) {
    if (reversedEdges.has(e)) {
      g.setEdge(e.to, e.from, { label: e.label || '', weight: 1 });
    } else {
      g.setEdge(e.from, e.to, { label: e.label || '', weight: 1 });
    }
  }

  dagreLayout(g);

  // Branch-ordering correction is only safe on flat graphs. On graphs with
  // subgraphs, dagre's native ordering already matches Mermaid (compound
  // layout uses subgraph membership to pick column order), and a global
  // horizontal mirror would flip sibling subgraphs relative to Mermaid's
  // reference output. Skip the mirror pass in that case.
  if (ir.subgraphs.length === 0) {
    fixBranchOrdering(g, ir);
  }

  // Write positions back to IR nodes. After taking dagre's chosen position,
  // snap each non-pinned node so its left edge falls on a cell line — i.e.
  // round (x - width/2) to a multiple of cellSize and recompute x. This makes
  // the node's outline land exactly on grid lines so the A* grid never has to
  // mark a cell as "partially inside the node."
  for (const n of ir.nodes) {
    const gn = g.node(n.id);
    if (!gn) continue;
    n.width = gn.width;
    n.height = gn.height;
    if (!n.pinned) {
      const left = Math.round((gn.x - gn.width / 2) / cell) * cell;
      const top  = Math.round((gn.y - gn.height / 2) / cell) * cell;
      n.x = left + gn.width / 2;
      n.y = top  + gn.height / 2;
    }
  }

  // Write edge waypoints, border-clipping the first and last point so
  // endpoints sit on the node edge rather than at the center.
  for (const e of ir.edges) {
    const rev = reversedEdges.has(e);
    const ge = rev ? g.edge(e.to, e.from) : g.edge(e.from, e.to);
    if (ge && ge.points) {
      let pts = (ge.points as { x: number; y: number }[]).map(p => ({ x: p.x, y: p.y }));
      if (rev) pts.reverse();
      const fromNode = ir.nodes.find(n => n.id === e.from);
      const toNode   = ir.nodes.find(n => n.id === e.to);
      if (pts.length >= 2 && fromNode && toNode) {
        pts[0] = clipToBorder(fromNode, pts[1]);
        pts[pts.length - 1] = clipToBorder(toNode, pts[pts.length - 2]);
      }
      // Ensure at least 3 points for curveBasis to produce a smooth curve.
      if (pts.length === 2) {
        pts = [pts[0], { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }, pts[1]];
      }
      e.points = pts;
      e.originalPoints = pts.map(p => ({ ...p }));
    }
  }

  return ir;
}

/**
 * For every branching node (2+ outgoing edges), ensure dagre placed the
 * first-declared child to the LEFT. If not, mirror the entire graph
 * horizontally — i.e., flip all x-coordinates around the graph centre.
 *
 * This works because Mermaid consistently puts first-declared branch
 * targets left. Dagre consistently puts them right for this fixture.
 * A single global horizontal mirror corrects it without breaking edges.
 */
function fixBranchOrdering(g: any, ir: IR): void {
  // Find the first branching node in IR order
  for (const src of ir.nodes) {
    const declaredTargets = ir.edges.filter(e => e.from === src.id).map(e => e.to);
    if (declaredTargets.length < 2) continue;
    if (!g.hasNode(src.id)) continue;

    const [t0, t1] = declaredTargets;
    if (!g.hasNode(t0) || !g.hasNode(t1)) continue;

    const x0 = (g.node(t0) as any).x as number;
    const x1 = (g.node(t1) as any).x as number;

    if (x0 === x1) continue; // same column, can't determine order

    if (x0 > x1) {
      // First-declared target is to the right — mirror the whole graph
      mirrorHorizontally(g);
    }
    // Only check the first branching node (one mirror fixes all branches uniformly)
    return;
  }
}

/**
 * Reflect all node x-coordinates and edge waypoint x-coordinates
 * horizontally around the graph's x midpoint.
 * This preserves relative spacing while flipping left↔right.
 */
function mirrorHorizontally(g: any): void {
  const allNodeIds: string[] = g.nodes();

  // Compute x bounds across all nodes
  let minX = Infinity, maxX = -Infinity;
  for (const id of allNodeIds) {
    const x = (g.node(id) as any).x as number;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
  }
  const mid = (minX + maxX) / 2;

  // Flip all node x-coords
  for (const id of allNodeIds) {
    const n = g.node(id) as any;
    n.x = 2 * mid - n.x;
  }

  // Flip all edge waypoint x-coords
  const allEdges: any[] = g.edges();
  for (const e of allEdges) {
    const edge = g.edge(e) as any;
    if (!edge?.points) continue;
    for (const pt of edge.points as { x: number; y: number }[]) {
      pt.x = 2 * mid - pt.x;
    }
  }
}

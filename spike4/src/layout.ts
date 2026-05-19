import { graphlib, layout as dagreLayout } from '@dagrejs/dagre';
import type { IR, IRNode, IRSubgraph, NodeShape } from './types.js';
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

// Order nodes so dagre sees them grouped by subgraph in the same order used
// for subgraph insertion. Inside each subgraph, preserve the original
// declaration order so dagre's intra-subgraph ranking is unaffected.
// Nodes with no parent come last.
function orderNodesForLayout(ir: IR, orderedSubgraphs: IRSubgraph[]): IRNode[] {
  const nodesByParent = new Map<string, IRNode[]>();
  const orphans: IRNode[] = [];
  for (const n of ir.nodes) {
    if (n.parent) {
      if (!nodesByParent.has(n.parent)) nodesByParent.set(n.parent, []);
      nodesByParent.get(n.parent)!.push(n);
    } else {
      orphans.push(n);
    }
  }
  const out: IRNode[] = [];
  for (const sg of orderedSubgraphs) {
    const kids = nodesByParent.get(sg.id);
    if (kids) out.push(...kids);
  }
  out.push(...orphans);
  return out;
}

// A "source" subgraph is one with no incoming inter-cluster edges — that is,
// no edge whose target lies inside this subgraph (recursively, through nested
// subgraphs) and whose source lies outside it. Source subgraphs in dagre's
// compound layout are the ones that need the reverse-declaration-order bias
// to match Mermaid; sinks and intermediates are left in declaration order.
function orderSubgraphsForLayout(ir: IR): IRSubgraph[] {
  // Map every node id -> its top-level (root) subgraph id, if any.
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

  // For each top-level subgraph, is it a source? (no edge from outside ends inside it)
  const incoming = new Set<string>();
  for (const e of ir.edges) {
    const fromRoot = nodeRootSg.get(e.from);
    const toRoot = nodeRootSg.get(e.to);
    if (toRoot && fromRoot !== toRoot) incoming.add(toRoot);
  }

  // Partition top-level subgraphs by source/non-source, preserving declaration order.
  const topLevel = ir.subgraphs.filter(sg => !sg.parent);
  const sources = topLevel.filter(sg => !incoming.has(sg.id));
  const others  = topLevel.filter(sg =>  incoming.has(sg.id));

  // Sources reversed; others forward. Then nested subgraphs (which we leave
  // in declaration order — they're column-ordered inside their parent and
  // the source/sink rule is about top-level columns).
  const nested = ir.subgraphs.filter(sg => sg.parent);
  return [...sources.reverse(), ...others, ...nested];
}

export function layout(ir: IR): IR {
  const g = new graphlib.Graph({ compound: true });
  g.setGraph({ rankdir: 'TB', nodesep: 50, ranksep: 60, marginx: 30, marginy: 30 });
  g.setDefaultEdgeLabel(() => ({}));

  const cell = astarSettings.cellSize;

  // Mermaid Compatibility: bias dagre's column placement for sibling
  // subgraphs. Dagre tends to place earlier-inserted siblings further right;
  // Mermaid's column order differs subtly. The rule that matches Mermaid on
  // typical flowchart-TD fixtures:
  //   - "Source" subgraphs (no incoming inter-cluster edges) are inserted in
  //     REVERSE declaration order, so the later-declared source ends up
  //     leftmost (e.g., DEVOPS declared after FRONTEND but rendered left of
  //     FRONTEND).
  //   - All other subgraphs ("sinks" or "intermediate") are inserted in
  //     forward declaration order, preserving dagre's natural ranking
  //     between them (e.g., BACKEND left of DATABASE).
  const subgraphsForLayout = orderSubgraphsForLayout(ir);

  // Subgraph compound nodes — size also snapped to cellSize so subgraph
  // boundaries align with grid lines.
  for (const sg of subgraphsForLayout) {
    g.setNode(sg.id, {
      label: sg.label,
      width: ceilTo(sg.label.length * 8 + 24, cell),
      height: ceilTo(30, cell),
    });
  }
  for (const sg of subgraphsForLayout) {
    if (sg.parent) g.setParent(sg.id, sg.parent);
  }

  // Leaf nodes — grouped by their parent subgraph in the same order used for
  // subgraph insertion, so dagre's intra-subgraph ranking is preserved while
  // sibling subgraphs are biased by the source/sink rule above.
  const nodesForLayout = orderNodesForLayout(ir, subgraphsForLayout);
  for (const n of nodesForLayout) {
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

  // Edges in declaration order
  for (const e of ir.edges) {
    g.setEdge(e.from, e.to, { label: e.label || '', weight: 1 });
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
    const ge = g.edge(e.from, e.to);
    if (ge && ge.points) {
      let pts = (ge.points as { x: number; y: number }[]).map(p => ({ x: p.x, y: p.y }));
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

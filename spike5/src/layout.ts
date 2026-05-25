import { graphlib, layout as dagreLayout } from '@dagrejs/dagre';
import type { IR, NodeShape } from './types.js';
import { clipToBorder } from './border.js';
import { astarSettings } from './astarSettings.js';
import { layoutSettings } from './layoutSettings.js';

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

// Mirror of Mermaid's sortNodesByHierarchy + sorter
// (dagre-KV5264BT.mjs:370-382). Walks the IR's subgraph + leaf-node hierarchy
// DFS-style and returns ids in parent-then-children order. Used as the
// insertion order for g.setNode so dagre's dfsFAS picks back-edges the same
// way Mermaid does (Mermaid feeds dagre nodes in this same order).
//
// Mermaid's `sorter` walks a single child list per node (the graph already
// encodes hierarchy via setParent). Our IR keeps subgraph-children and
// leaf-children in separate arrays, so we emit subgraph descendants first,
// then leaf children — same end ordering Mermaid produces given how it
// builds the graph (subgraphs get setParent before leaves).
function sortNodesByHierarchy(ir: IR): string[] {
  const sgChildren = new Map<string | undefined, string[]>();
  for (const sg of ir.subgraphs) {
    const key = sg.parent;
    if (!sgChildren.has(key)) sgChildren.set(key, []);
    sgChildren.get(key)!.push(sg.id);
  }
  const nodeChildren = new Map<string | undefined, string[]>();
  for (const n of ir.nodes) {
    const key = n.parent;
    if (!nodeChildren.has(key)) nodeChildren.set(key, []);
    nodeChildren.get(key)!.push(n.id);
  }
  const out: string[] = [];
  function emit(parent: string | undefined): void {
    for (const sgId of sgChildren.get(parent) ?? []) {
      out.push(sgId);
      emit(sgId);
    }
    for (const nId of nodeChildren.get(parent) ?? []) {
      out.push(nId);
    }
  }
  emit(undefined);
  return out;
}

// Identify the set of inter-cluster IR edges to reverse before handing the
// graph to dagre so that the resulting top-level-subgraph rank order matches
// Mermaid's reference output.
//
// Strategy: find inter-cluster cycles (SCCs of size ≥ 2 on the inter-cluster
// digraph) and pick a feedback arc set per SCC using this priority:
//
//   1. PREFER DOTTED EDGES. Mermaid treats dotted (`-.->`) edges as
//      lower-weight "back-edges" in cycles. dagre's DFS-FAS may not always
//      pick them, but Mermaid users have learned to treat dotted as
//      "informational return-path" and our parity heuristic does too. If any
//      dotted edge sits inside an SCC, prefer reversing it.
//   2. FALL BACK to "earlier→later declaration order" — i.e. reverse edges
//      that point from an earlier-declared cluster to a later-declared one.
//      After reversal the surviving SCC-internal edges point later→earlier,
//      which dagre then ranks as later-above-earlier. This is the
//      `fixture.mmd` case (Authentication ↔ Payment_System cycle): both
//      edges are solid, dotted-pref doesn't fire, declaration-order kicks in
//      and reverses O→Q so Payment_System ranks above Authentication.
//
// The dotted preference matters for `fixture_crosscluster.mmd`: Frontend →
// Services → DataLayer → External plus two DOTTED back-edges (EventBus →
// Cache, AnalyticsSvc → Gateway). Without the dotted preference our previous
// SCC pass reversed both back-edges AND the forward edges going from
// Frontend to other clusters, producing "External on top" — opposite of
// Mermaid. With the dotted preference we only reverse the two back-edges
// and the four-cluster top-down flow is preserved.
//
// Edges OUTSIDE any SCC (no cycle) stay untouched.
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
  const topSgIds: string[] = [];
  ir.subgraphs.filter(sg => !sg.parent).forEach((sg, i) => {
    sgIndex.set(sg.id, i);
    topSgIds.push(sg.id);
  });

  // Build an inter-cluster adjacency (top-level subgraph ids only). Edges
  // within a single cluster don't affect inter-cluster ordering, and edges
  // touching nodes outside any top-level cluster are also ignored here.
  const adj = new Map<string, Set<string>>();
  for (const id of topSgIds) adj.set(id, new Set());
  for (const e of ir.edges) {
    const fromSg = nodeRootSg.get(e.from);
    const toSg = nodeRootSg.get(e.to);
    if (!fromSg || !toSg || fromSg === toSg) continue;
    if (!sgIndex.has(fromSg) || !sgIndex.has(toSg)) continue;
    adj.get(fromSg)!.add(toSg);
  }

  // Tarjan's SCC over the inter-cluster digraph. We only need to know which
  // SCC each cluster belongs to so we can ask "are u and v in the same
  // cycle?" in O(1) below.
  const sccOf = new Map<string, number>();
  {
    const index = new Map<string, number>();
    const lowlink = new Map<string, number>();
    const onStack = new Set<string>();
    const stack: string[] = [];
    let next = 0;
    let sccCount = 0;

    // Iterative Tarjan to avoid blowing the stack on large graphs. Each
    // frame carries the node and the iterator over its outgoing neighbours.
    function strongconnect(start: string) {
      const work: Array<{ v: string; it: Iterator<string>; }> = [];
      index.set(start, next);
      lowlink.set(start, next);
      next++;
      stack.push(start);
      onStack.add(start);
      work.push({ v: start, it: (adj.get(start) ?? new Set<string>()).values() });

      while (work.length) {
        const frame = work[work.length - 1];
        const step = frame.it.next();
        if (!step.done) {
          const w = step.value;
          if (!index.has(w)) {
            index.set(w, next);
            lowlink.set(w, next);
            next++;
            stack.push(w);
            onStack.add(w);
            work.push({ v: w, it: (adj.get(w) ?? new Set<string>()).values() });
          } else if (onStack.has(w)) {
            lowlink.set(frame.v, Math.min(lowlink.get(frame.v)!, index.get(w)!));
          }
        } else {
          // Finished exploring frame.v: propagate lowlink up and, if this is
          // an SCC root, pop the component off the stack.
          work.pop();
          if (work.length) {
            const parent = work[work.length - 1];
            lowlink.set(parent.v, Math.min(lowlink.get(parent.v)!, lowlink.get(frame.v)!));
          }
          if (lowlink.get(frame.v) === index.get(frame.v)) {
            const id = sccCount++;
            while (stack.length) {
              const w = stack.pop()!;
              onStack.delete(w);
              sccOf.set(w, id);
              if (w === frame.v) break;
            }
          }
        }
      }
    }

    for (const v of topSgIds) {
      if (!index.has(v)) strongconnect(v);
    }
  }

  // Group SCC-internal inter-cluster edges by SCC id so we can pick a feedback
  // arc set per SCC. Edges outside any SCC (no cycle they're part of) are
  // left alone.
  const sccEdges = new Map<number, import('./types.js').IREdge[]>();
  for (const e of ir.edges) {
    const fromSg = nodeRootSg.get(e.from);
    const toSg = nodeRootSg.get(e.to);
    if (!fromSg || !toSg || fromSg === toSg) continue;
    if (!sgIndex.has(fromSg) || !sgIndex.has(toSg)) continue;
    const a = sccOf.get(fromSg);
    const b = sccOf.get(toSg);
    if (a == null || b == null || a !== b) continue;
    if (!sccEdges.has(a)) sccEdges.set(a, []);
    sccEdges.get(a)!.push(e);
  }

  const toReverse = new Set<import('./types.js').IREdge>();

  // Pick the feedback arc set per SCC. Priority:
  //   1. If the SCC contains any dotted edges, reverse only those — they are
  //      Mermaid's intended back-edges.
  //   2. Otherwise reverse every earlier→later edge in the SCC — matches
  //      Mermaid's declaration-reversed ordering on solid-only cycles.
  for (const edges of sccEdges.values()) {
    const dotted = edges.filter(e => e.style === 'dotted');
    if (dotted.length > 0) {
      for (const e of dotted) toReverse.add(e);
    } else {
      for (const e of edges) {
        const fi = sgIndex.get(nodeRootSg.get(e.from)!)!;
        const ti = sgIndex.get(nodeRootSg.get(e.to)!)!;
        if (fi < ti) toReverse.add(e);
      }
    }
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

  // Grid-snap node sizes/positions only when A* is on. When A* is off the
  // grid is invisible and unused, so coupling layout to cellSize just makes
  // the dagre output drift when the user changes the slider.
  const snapToGrid = astarSettings.enabled;
  const cell = astarSettings.cellSize;
  const snap = (v: number) => (snapToGrid ? ceilTo(v, cell) : v);

  // Node insertion order driven by sortNodesByHierarchy — see helper above.
  // Mermaid calls g.setNode in parent-then-children order, which controls
  // dagre's dfsFAS back-edge picks during cycle breaking. Matching that
  // order is the §8.10 sub-option-2 parity experiment.
  //
  // Subgraph compound nodes — size snapped to cellSize so subgraph
  // boundaries align with grid lines (A* mode only).
  const ordered = sortNodesByHierarchy(ir);
  const sgById = new Map(ir.subgraphs.map(sg => [sg.id, sg]));
  const nodeById = new Map(ir.nodes.map(n => [n.id, n]));

  for (const id of ordered) {
    const sg = sgById.get(id);
    if (sg) {
      g.setNode(sg.id, {
        label: sg.label,
        width: snap(sg.label.length * 8 + 24),
        height: snap(30),
      });
      continue;
    }
    const n = nodeById.get(id);
    if (n) {
      const { w: rawW, h: rawH } = sizeForShape(n.shape, n.label.length);
      const width = snap(rawW);
      const height = snap(rawH);
      if (n.pinned && n.x != null && n.y != null) {
        g.setNode(n.id, { label: n.label, width, height, x: n.x, y: n.y });
      } else {
        g.setNode(n.id, { label: n.label, width, height });
      }
    }
  }

  // setParent in a second pass — compound graphs require both parent and
  // child to exist as nodes before setParent is called.
  for (const sg of ir.subgraphs) {
    if (sg.parent) g.setParent(sg.id, sg.parent);
  }
  for (const n of ir.nodes) {
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
  //
  // Skipped when `astarSettings.mermaidParity` is false — useful as a debug
  // toggle to see raw `@dagrejs/dagre` subgraph ordering side-by-side with
  // the Mermaid-matched output.
  const reversedEdges = layoutSettings.mermaidParity
    ? chooseEdgesToReverseForMermaidOrder(ir)
    : new Set<import('./types.js').IREdge>();

  for (const e of ir.edges) {
    if (reversedEdges.has(e)) {
      g.setEdge(e.to, e.from, { label: e.label || '', weight: 1 });
    } else {
      g.setEdge(e.from, e.to, { label: e.label || '', weight: 1 });
    }
  }

  dagreLayout(g);

  // Branch-ordering correction. On flat graphs (no subgraphs) we use a
  // single global horizontal mirror — see `fixBranchOrdering`. On graphs with
  // subgraphs we can't mirror globally (it would also flip sibling-subgraph
  // positions relative to Mermaid's reference), so instead we mirror each
  // top-level subgraph's interior independently — see
  // `fixBranchOrderingPerSubgraph`.
  if (ir.subgraphs.length === 0) {
    fixBranchOrdering(g, ir);
  } else {
    fixBranchOrderingPerSubgraph(g, ir);
  }

  // Write positions back to IR nodes. When A* is on, snap each non-pinned
  // node so its left edge falls on a cell line — round (x - width/2) to a
  // multiple of cellSize and recompute x. This makes the node's outline land
  // exactly on grid lines so the A* grid never has to mark a cell as
  // "partially inside the node." With A* off, take dagre's chosen position
  // verbatim so the cellSize slider doesn't perturb the layout.
  for (const n of ir.nodes) {
    const gn = g.node(n.id);
    if (!gn) continue;
    n.width = gn.width;
    n.height = gn.height;
    if (!n.pinned) {
      if (snapToGrid) {
        const left = Math.round((gn.x - gn.width / 2) / cell) * cell;
        const top  = Math.round((gn.y - gn.height / 2) / cell) * cell;
        n.x = left + gn.width / 2;
        n.y = top  + gn.height / 2;
      } else {
        n.x = gn.x;
        n.y = gn.y;
      }
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

/**
 * Per-subgraph local branch-ordering correction.
 *
 * The global `fixBranchOrdering` cannot be used when subgraphs exist because
 * a single global mirror would also flip sibling-subgraph positions away
 * from Mermaid's reference. This pass does the same correction at subgraph
 * scope: for each top-level subgraph, find the first branching node whose
 * source AND both first-two declared targets all sit inside that subgraph;
 * if the first-declared target landed to the RIGHT of the second-declared
 * target, mirror that subgraph's interior nodes (and edge waypoints fully
 * inside the subgraph) around the subgraph's local x-midpoint.
 *
 * CRITICAL CONSTRAINT (learned the hard way): we skip the mirror if ANY
 * inter-cluster edge touches a node in this subgraph. Reason: dagre's
 * waypoints for an inter-cluster edge are drawn against the OLD interior
 * node positions; mirroring interior nodes leaves the inter-cluster edge
 * waypoints pointing at where the node USED to be. `clipToBorder` re-anchors
 * the first/last point, but the middle waypoints still curve toward the old
 * position, producing a visibly kinked edge. Without this guard the mirror
 * regresses `fixture.mmd` (every cluster there has at least one inter-cluster
 * edge: O→Q, S→L, T→M). The trade-off is that clusters connected via inter-
 * cluster edges don't get mirror correction — accept this as cosmetic; the
 * within-cluster branch ordering may still be off, but at least edges aren't
 * torn. Long-term fix would require rebuilding affected inter-cluster edge
 * waypoints; not worth it until users complain.
 *
 * Also: only consider top-level subgraphs. Nested subgraphs inherit their
 * parent's local frame and dagre's compound layout already handles the
 * intra-cluster ordering between nested siblings.
 */
function fixBranchOrderingPerSubgraph(g: any, ir: IR): void {
  // Build top-level-subgraph membership for every node. Walk up the parent
  // chain to find each node's root subgraph (matches the helper used in
  // `chooseEdgesToReverseForMermaidOrder`).
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

  // Group node ids by top-level subgraph.
  const nodesBySg = new Map<string, string[]>();
  for (const n of ir.nodes) {
    const root = nodeRootSg.get(n.id);
    if (!root) continue;
    if (!nodesBySg.has(root)) nodesBySg.set(root, []);
    nodesBySg.get(root)!.push(n.id);
  }

  // Per-cluster flag: does any inter-cluster edge touch a member of this
  // cluster? If yes, skip mirror to avoid tearing inter-cluster edge
  // waypoints (see CRITICAL CONSTRAINT in the doc-comment above).
  const hasInterClusterEdge = new Set<string>();
  for (const e of ir.edges) {
    const fromRoot = nodeRootSg.get(e.from);
    const toRoot = nodeRootSg.get(e.to);
    if (fromRoot && toRoot && fromRoot !== toRoot) {
      if (fromRoot) hasInterClusterEdge.add(fromRoot);
      if (toRoot) hasInterClusterEdge.add(toRoot);
    } else if (fromRoot && !toRoot) {
      // Edge leaving a cluster to a top-level node — also counts.
      hasInterClusterEdge.add(fromRoot);
    } else if (!fromRoot && toRoot) {
      hasInterClusterEdge.add(toRoot);
    }
  }

  for (const sg of ir.subgraphs) {
    if (sg.parent) continue;  // top-level only
    if (hasInterClusterEdge.has(sg.id)) continue;  // see CRITICAL CONSTRAINT
    const memberIds = nodesBySg.get(sg.id);
    if (!memberIds || memberIds.length < 2) continue;
    const memberSet = new Set(memberIds);

    // Find the first branching node IN IR ORDER whose source is in this
    // subgraph and whose first two declared in-subgraph targets are also in
    // this subgraph. Intra-subgraph edges only — cross-cluster edges don't
    // tell us anything about the local left/right convention.
    let srcId: string | null = null;
    let t0: string | null = null;
    let t1: string | null = null;
    for (const n of ir.nodes) {
      if (!memberSet.has(n.id)) continue;
      const innerTargets = ir.edges
        .filter(e => e.from === n.id && memberSet.has(e.to))
        .map(e => e.to);
      if (innerTargets.length < 2) continue;
      srcId = n.id;
      t0 = innerTargets[0];
      t1 = innerTargets[1];
      break;
    }
    if (!srcId || !t0 || !t1) continue;
    if (!g.hasNode(t0) || !g.hasNode(t1)) continue;

    const x0 = (g.node(t0) as any).x as number;
    const x1 = (g.node(t1) as any).x as number;
    if (x0 === x1) continue;  // same column — can't infer ordering
    if (x0 <= x1) continue;   // already first-declared-left, nothing to do

    // First-declared target sits to the right — mirror this subgraph's
    // interior nodes AND intra-subgraph edge waypoints around the cluster's
    // local x-midpoint.
    let minX = Infinity, maxX = -Infinity;
    for (const id of memberIds) {
      if (!g.hasNode(id)) continue;
      const gn = g.node(id) as any;
      const lx = gn.x - gn.width / 2;
      const rx = gn.x + gn.width / 2;
      if (lx < minX) minX = lx;
      if (rx > maxX) maxX = rx;
    }
    if (!isFinite(minX) || !isFinite(maxX)) continue;
    const mid = (minX + maxX) / 2;
    for (const id of memberIds) {
      if (!g.hasNode(id)) continue;
      const gn = g.node(id) as any;
      gn.x = 2 * mid - gn.x;
    }
    // Mirror waypoints of edges whose BOTH endpoints are inside this
    // cluster. Since we guarded above against any inter-cluster edges
    // touching this cluster, every edge between member nodes is purely
    // intra-cluster — safe to mirror its waypoints.
    const allEdges: any[] = g.edges();
    for (const ek of allEdges) {
      if (!memberSet.has(ek.v) || !memberSet.has(ek.w)) continue;
      const edge = g.edge(ek) as any;
      if (!edge?.points) continue;
      for (const pt of edge.points as { x: number; y: number }[]) {
        pt.x = 2 * mid - pt.x;
      }
    }
  }
}

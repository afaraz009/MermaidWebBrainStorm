// A/B: swap from @dagrejs/dagre@3 to Mermaid's dagre-d3-es@7 fork.
// Same graphlib API; barycenter/tie-breaking may differ on branch ordering.
import * as graphlib from 'dagre-d3-es/src/graphlib/index.js';
import { layout as dagreLayout } from 'dagre-d3-es/src/dagre/index.js';
import type { IR, NodeShape } from './types.js';
import { clipToBorder } from './border.js';
import { astarSettings } from './astarSettings.js';

// Round up to a multiple of `step`. Used to size nodes and snap positions to
// the A* grid so every node boundary lands on a cell line.
function ceilTo(v: number, step: number): number {
  return Math.ceil(v / step) * step;
}

// Per-shape canonical sizes. Calibrated against Mermaid v11's actual dagre
// input on fixture200.mmd (captured 2026-05-25 via the `Graph before layout`
// log line — see spike6_mermaid-graph-200.json). Mermaid measures real text
// bbox + padding:15 per side; we approximate with `labelLen * 10 + 30` and
// fall back to a base that matches Mermaid's minimum observed dims for short
// labels.
//
// Sample Mermaid values for fixture200 leaves: squareRect "SMS 1" (5 chars) =
// 100x54, "Edge Gateway" (12 chars) = 162x54. cylinder "SMS 5" (5 chars) =
// 55x62, "Telemetry 10" (12 chars) = 108x74. lean_right "SMS 7" (5 chars) =
// 94x39, "Telemetry 7" (11 chars) = 139x39.
const SHAPE_SIZES: Record<NodeShape, { w: number; h: number }> = {
  rect:                { w: 100, h: 54 },
  round:               { w: 100, h: 54 },
  stadium:             { w: 140, h: 50 },
  subroutine:          { w: 150, h: 50 },
  cylinder:            { w: 55,  h: 62 },
  circle:              { w: 90,  h: 90 },
  'double-circle':     { w: 110, h: 110 },
  diamond:             { w: 140, h: 80 },
  hexagon:             { w: 150, h: 60 },
  parallelogram:       { w: 94,  h: 39 },
  'parallelogram-alt': { w: 94,  h: 39 },
  trapezoid:           { w: 160, h: 60 },
  'trapezoid-alt':     { w: 160, h: 60 },
  asymmetric:          { w: 150, h: 50 },
  ellipse:             { w: 160, h: 60 },
};

// Resolve a node's bounding-box size. Width approximates Mermaid's text-bbox
// formula (labelLen * 10 + 30 ≈ avg char width 10px + padding 15 per side);
// floor at the shape's canonical base so short labels still fill the shape.
function sizeForShape(shape: NodeShape, labelLen: number): { w: number; h: number } {
  const base = SHAPE_SIZES[shape] ?? SHAPE_SIZES.rect;
  const textW = labelLen * 10 + 30;
  if (shape === 'circle' || shape === 'double-circle') {
    // Keep these as squares so the inscribed circle stays a circle even when
    // the label is long.
    const d = Math.max(base.w, textW);
    return { w: d, h: d };
  }
  return { w: Math.max(base.w, textW), h: base.h };
}

// Mermaid-faithful node insertion order for dagre. Returns the IR's nodes in
// the same sequence Mermaid v11 inserts them into its outer compound graph
// (verified empirically against the `Adjusted Graph` log entry from
// mermaid-debug.html for fixture_nested.mmd, 2026-05-25). The order affects
// dagre's barycenter tiebreaker when sibling clusters have no edges between
// them at their level — see the in-function comment for the load-bearing
// detail (reverse sibling order at every cluster level).
function sortNodesByHierarchy(ir: IR): string[] {
  // Mermaid's `Adjusted Graph` for fixture_nested.mmd (captured 2026-05-25
  // via mermaid-debug.html) shows TWO surprising properties of its node
  // insertion order:
  //   1. ALL cluster nodes are inserted first, in a single DFS pass through
  //      the cluster hierarchy, BEFORE any leaf nodes.
  //   2. Subgraph siblings are visited in REVERSE declaration order — Mermaid
  //      visits Storage_L2 (declared 2nd) before Services_L2 (1st), and
  //      CacheLayer_L3 (declared 2nd) before PrimaryDB_L3 (1st), at every
  //      level of the hierarchy.
  // Property (2) is the empirical source of the Storage_L2 L/R divergence:
  // when two clusters have no edges between them at their level (Storage_L2's
  // case), dagre's barycenter tiebreaker falls back to insertion order. Cache
  // being inserted first puts CacheLayer LEFT — matching Mermaid v11.
  // Leaves are emitted after all clusters via a second DFS in declaration
  // order (mirrors the leaf order observed in Mermaid's dump).
  const subgraphsByParent = new Map<string | undefined, string[]>();
  for (const sg of ir.subgraphs) {
    const key = sg.parent;
    if (!subgraphsByParent.has(key)) subgraphsByParent.set(key, []);
    subgraphsByParent.get(key)!.push(sg.id);
  }
  for (const list of subgraphsByParent.values()) list.reverse();

  const leavesByParent = new Map<string | undefined, string[]>();
  for (const n of ir.nodes) {
    const key = n.parent;
    if (!leavesByParent.has(key)) leavesByParent.set(key, []);
    leavesByParent.get(key)!.push(n.id);
  }

  const out: string[] = [];

  function emitClusters(parent: string | undefined): void {
    for (const sgId of subgraphsByParent.get(parent) ?? []) {
      out.push(sgId);
      emitClusters(sgId);
    }
  }
  function emitLeaves(parent: string | undefined): void {
    for (const leafId of leavesByParent.get(parent) ?? []) {
      out.push(leafId);
    }
    // Recurse into subgraphs in DECLARATION order (NOT reversed) — Mermaid's
    // leaf section visits clusters in declaration order, opposite of how it
    // orders the cluster section. Use ir.subgraphs filter to get declaration
    // order rather than the reversed subgraphsByParent map.
    for (const sg of ir.subgraphs) {
      if ((sg.parent ?? null) === (parent ?? null)) emitLeaves(sg.id);
    }
  }

  emitClusters(undefined);
  emitLeaves(undefined);

  return out;
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

  for (const e of ir.edges) {
    g.setEdge(e.from, e.to, { label: e.label || '', weight: 1 });
  }

  // Temporary diagnostic: when `?dump=1`, capture our dagre-d3-es input graph
  // before layout for field-by-field diffing against Mermaid's. Remove once
  // the fixture_nested / fixture200 divergence is understood.
  if (typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('dump') === '1') {
    (window as any).__oursGraphDump = dumpGraph(g);
  }

  dagreLayout(g, {});

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

// Temporary diagnostic for fixture_nested / fixture200 parity investigation.
// Dumps the dagre-d3-es input graph as a plain object so it can be compared
// to Mermaid's `Graph before layout:` JSON. Delete this helper once the
// barycenter divergence is understood.
function dumpGraph(g: any) {
  // Deep-clone via JSON round-trip — graphlib value objects are mutated in
  // place by dagreLayout, so we must snapshot them at dump time.
  return JSON.parse(JSON.stringify({
    graph: g.graph(),
    nodes: g.nodes().map((id: string) => ({
      id,
      value: g.node(id),
      parent: g.parent(id) ?? null,
    })),
    edges: g.edges().map((e: any) => ({
      v: e.v, w: e.w, name: e.name,
      value: g.edge(e),
    })),
  }));
}

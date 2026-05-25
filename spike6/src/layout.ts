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

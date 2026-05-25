// A/B: swap from @dagrejs/dagre@3 to Mermaid's dagre-d3-es@7 fork.
// Same graphlib API; barycenter/tie-breaking may differ on branch ordering.
import * as graphlib from 'dagre-d3-es/src/graphlib/index.js';
import { layout as dagreLayout } from 'dagre-d3-es/src/dagre/index.js';
import type { IR, IRNode, NodeShape } from './types.js';
import { clipToBorder, clipToClusterRect } from './border.js';
import { astarSettings } from './astarSettings.js';

// Round up to a multiple of `step`. Used to size nodes and snap positions to
// the A* grid so every node boundary lands on a cell line.
function ceilTo(v: number, step: number): number {
  return Math.ceil(v / step) * step;
}

// Match Mermaid v11's label rendering font so our measured text widths line
// up with what Mermaid's dagre input contains. Renderer.ts must use the same
// font for the visible label text or the rendered text will float in an
// oversized box (or overflow an undersized one).
const LABEL_FONT_SIZE = 16;
const LABEL_FONT_FAMILY = '"trebuchet ms", verdana, arial, sans-serif';

// Hidden offscreen HTML span reused for every measurement. Using HTML (not
// SVG <text>) because Mermaid renders labels inside foreignObject HTML and
// sizes nodes from getBoundingClientRect — which returns the line-box height
// (~24 at 16px Trebuchet MS), whereas SVG getBBox returns the tight glyph
// height (~18.67 for the same text). The 5px difference shows up as ~5px
// shortfall in cylinder heights when using SVG measurement.
let _measureSpan: HTMLSpanElement | null = null;

function getMeasureSpan(): HTMLSpanElement {
  if (_measureSpan) return _measureSpan;
  _measureSpan = document.createElement('span');
  _measureSpan.style.position = 'absolute';
  _measureSpan.style.visibility = 'hidden';
  _measureSpan.style.left = '-9999px';
  _measureSpan.style.top = '0';
  _measureSpan.style.whiteSpace = 'nowrap';
  _measureSpan.style.fontSize = `${LABEL_FONT_SIZE}px`;
  _measureSpan.style.fontFamily = LABEL_FONT_FAMILY;
  // Mermaid wraps labels in a <p>, which gives a line-box height of 1.5 * fontSize
  // (24px at 16px font). Default span bbox returns tight glyph height (~18.67),
  // which under-measures by ~5 px and shows up as short cylinder caps. Forcing
  // line-height here matches Mermaid's effective text height.
  _measureSpan.style.lineHeight = '1.5';
  _measureSpan.style.display = 'inline-block';
  document.body.appendChild(_measureSpan);
  return _measureSpan;
}

export function measureLabel(label: string): { w: number; h: number } {
  if (typeof document === 'undefined') {
    // SSR / test fallback.
    return { w: label.length * 9.5, h: 24 };
  }
  const sp = getMeasureSpan();
  sp.textContent = label || ' ';
  const bb = sp.getBoundingClientRect();
  return { w: bb.width, h: bb.height };
}

// Edge-label wrap width and line-height match Mermaid's `createText` defaults
// (mermaid.js:40651 / :40549). Live here (not renderer.ts) because dagre also
// needs edge label dimensions when allocating space between nodes — otherwise
// a wide label gets squashed by tight node spacing. Renderer imports the same
// helpers so the rendered rect matches the box dagre reserved.
export const EDGE_LABEL_WRAP_WIDTH = 200;
export const EDGE_LABEL_LINE_HEIGHT_EM = 1.1;
const EDGE_LABEL_PAD_X = 4;
const EDGE_LABEL_PAD_Y = 0;

export function wrapEdgeLabel(text: string): string[] {
  if (!text) return [];
  const { w: fullW } = measureLabel(text);
  if (fullW <= EDGE_LABEL_WRAP_WIDTH) return [text];
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const trial = current ? `${current} ${word}` : word;
    if (measureLabel(trial).w <= EDGE_LABEL_WRAP_WIDTH) {
      current = trial;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [text];
}

export function edgeLabelSize(label: string): { w: number; h: number } {
  const lines = wrapEdgeLabel(label);
  if (lines.length === 0) return { w: 0, h: 0 };
  let maxW = 0;
  let lineH = 0;
  for (const line of lines) {
    const m = measureLabel(line);
    if (m.w > maxW) maxW = m.w;
    if (m.h > lineH) lineH = m.h;
  }
  const totalH = lineH + lineH * EDGE_LABEL_LINE_HEIGHT_EM * (lines.length - 1);
  return {
    w: maxW + EDGE_LABEL_PAD_X * 2,
    h: totalH + EDGE_LABEL_PAD_Y * 2,
  };
}

// Per-shape sizing calibrated against Mermaid v11's actual dagre input
// dimensions (`Graph before layout` log entry) on fixture.mmd + fixture200.mmd
// captured 2026-05-25. Each shape gets a SEPARATE horizontal padding because
// Mermaid uses different padding per shape — derived empirically as
// `(Mermaid dagre width - HTML text bbox width) / 2`:
//   rect/round       30   (Process Node 153.84 - text 93.84 = 60)
//   diamond          27   (Decision Node 154.66 - text 100.66 = 54)
//   parallelograms   27   (Input Output 145.89 - text 91.88 = 54)
//   subroutine       15.5 (Subroutine 108.28 - text 77.28 = 31)
//   stadium          12.5 (Start 59.74 - text 35.01 = 24.73)
//   asymmetric       12.5 (Asymmetric Node 150.16 - text 125.40 = 24.76)
//   hexagon          17   (Hexagon Node 136.74 - text 102.24 = 34.5)
//   cylinder         7.5  (Database 80.5 - text 65.5 = 15)
//   double-circle    15   (Circle Node 112.98 - text 82.98 = 30)
// Height policy:
//   - number     : fixed Mermaid height (stadium=39, rect=54, etc.)
//   - 'square'   : w = h (diamond, circle, double-circle inscribe text in a
//                  square so the rotated rhombus / round shape has room)
//   - 'cylinder' : Mermaid expands cylinder height with width to keep the
//                  elliptical caps proportional — `textH + 30 + w * 0.18`
//                  matches Database(80.5,68.38), Storage(69,65.68), and
//                  fixture200 Telemetry 10(108,73.86) within ~1px.
const SHAPE_BASE: Record<NodeShape, { baseW: number; h: number | 'square' | 'cylinder'; pad: number }> = {
  rect:                { baseW: 100, h: 54,         pad: 30 },
  round:               { baseW: 100, h: 54,         pad: 30 },
  stadium:             { baseW: 50,  h: 39,         pad: 12.5 },
  subroutine:          { baseW: 80,  h: 39,         pad: 15.5 },
  cylinder:            { baseW: 55,  h: 'cylinder', pad: 7.5 },
  circle:              { baseW: 50,  h: 'square',   pad: 15 },
  'double-circle':     { baseW: 50,  h: 'square',   pad: 15 },
  diamond:             { baseW: 50,  h: 'square',   pad: 27 },
  hexagon:             { baseW: 80,  h: 39,         pad: 17 },
  parallelogram:       { baseW: 50,  h: 39,         pad: 27 },
  'parallelogram-alt': { baseW: 50,  h: 39,         pad: 27 },
  trapezoid:           { baseW: 100, h: 60,         pad: 27 },
  'trapezoid-alt':     { baseW: 100, h: 60,         pad: 27 },
  asymmetric:          { baseW: 80,  h: 39,         pad: 12.5 },
  ellipse:             { baseW: 100, h: 39,         pad: 25 },
};

function sizeForShape(shape: NodeShape, label: string): { w: number; h: number } {
  const cfg = SHAPE_BASE[shape] ?? SHAPE_BASE.rect;
  const { w: textW, h: textH } = measureLabel(label);
  const w = Math.max(cfg.baseW, textW + 2 * cfg.pad);
  let h: number;
  if (cfg.h === 'square') h = w;
  else if (cfg.h === 'cylinder') h = textH + 30 + w * 0.18;
  else h = cfg.h;
  return { w, h };
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
      const { w: rawW, h: rawH } = sizeForShape(n.shape, n.label);
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
    {
      const { w, h } = e.label ? edgeLabelSize(e.label) : { w: 0, h: 0 };
      g.setEdge(e.from, e.to, { label: e.label || '', weight: 1, width: w, height: h });
    }
  }

  // Temporary diagnostic: when `?dump=1`, capture our dagre-d3-es input graph
  // before layout for field-by-field diffing against Mermaid's. Remove once
  // the fixture_nested / fixture200 divergence is understood.
  if (typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('dump') === '1') {
    (window as any).__oursGraphDump = dumpGraph(g);
  }

  dagreLayout(g, {});

  // Pass-1.5: re-anchor cluster-endpoint edges to the actual extremal leaf.
  // findNonClusterChild (parser-adapter) uses a declaration-order heuristic
  // that doesn't always match dagre's final ranking — e.g. cyc3's
  // Productivity→Halt rewrites to Rev_Comment (top of Reviewer, which
  // sibling-reverse + cycle puts at the TOP of the cluster), so Halt ends up
  // at Editor's rank instead of below the whole cluster. Now that pass-1
  // has settled positions, pick the true bottom-most leaf (max Y) for
  // outgoing cluster edges and the true top-most leaf (min Y) for incoming
  // ones, and re-run dagre with the corrected edges. The re-run is cheap on
  // our fixture sizes (≤200 nodes) and converges in one extra pass.
  const edgesChanged = reanchorClusterEdges(ir, g);
  if (edgesChanged) {
    for (const e of g.edges()) g.removeEdge(e);
    for (const e of ir.edges) {
      {
      const { w, h } = e.label ? edgeLabelSize(e.label) : { w: 0, h: 0 };
      g.setEdge(e.from, e.to, { label: e.label || '', weight: 1, width: w, height: h });
    }
    }
    dagreLayout(g, {});
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
  // endpoints sit on the node edge rather than at the center. For edges
  // whose endpoint was rewritten from a subgraph id (fromCluster/toCluster
  // stamped by parser-adapter.ts), clip to the cluster's drawn bbox instead
  // of the leaf shape's outline — so the edge visually terminates at the
  // cluster border the user sees, matching Mermaid's behavior.
  for (const e of ir.edges) {
    const ge = g.edge(e.from, e.to);
    if (ge && ge.points) {
      let pts = (ge.points as { x: number; y: number }[]).map(p => ({ x: p.x, y: p.y }));
      const fromNode = ir.nodes.find(n => n.id === e.from);
      const toNode   = ir.nodes.find(n => n.id === e.to);
      if (pts.length >= 2 && fromNode && toNode) {
        // Start endpoint: cluster border if rewritten from subgraph, else leaf shape.
        if (e.fromCluster) {
          const bbox = clusterBboxFromIR(e.fromCluster, ir);
          if (bbox) {
            // Drop dagre waypoints that fall INSIDE the cluster — they were
            // routed for the leaf-anchored edge and cause curveBasis loops
            // once we move pts[0] out to the cluster border. Keep popping
            // pts[1] while it lies inside the cluster bbox; what remains is
            // the first exterior waypoint dagre chose.
            while (pts.length > 2 && pointInBbox(pts[1], bbox)) pts.splice(1, 1);
            pts[0] = clipToClusterRect(bbox, pts[1]);
          } else {
            pts[0] = clipToBorder(fromNode, pts[1]);  // fallback if bbox unavailable
          }
        } else {
          pts[0] = clipToBorder(fromNode, pts[1]);
        }
        // End endpoint: same dual path.
        if (e.toCluster) {
          const bbox = clusterBboxFromIR(e.toCluster, ir);
          if (bbox) {
            while (pts.length > 2 && pointInBbox(pts[pts.length - 2], bbox)) {
              pts.splice(pts.length - 2, 1);
            }
            pts[pts.length - 1] = clipToClusterRect(bbox, pts[pts.length - 2]);
          } else {
            pts[pts.length - 1] = clipToBorder(toNode, pts[pts.length - 2]);
          }
        } else {
          pts[pts.length - 1] = clipToBorder(toNode, pts[pts.length - 2]);
        }
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

// Mirror of renderer.ts:computeSubgraphBboxes. Computes the cluster's DRAWN
// bbox from its descendant leaves' positions, recursively, including the same
// PADDING and label-offset (+10 on Y) the renderer uses. Returns null if the
// cluster is empty or its leaves haven't been positioned yet. Kept in sync
// with the renderer so cluster-anchored edges clip to exactly the rectangle
// the user sees on screen.
const CLUSTER_BBOX_PADDING = 20;

// Inclusive bbox containment — used by the edge write-back to discard
// dagre waypoints inside a cluster we're about to clip the endpoint out of.
function pointInBbox(
  p: { x: number; y: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
}

// All deep-descendant leaves of a cluster, recursively. Mutates `out`.
function collectClusterLeaves(clusterId: string, ir: IR, out: IRNode[]): void {
  for (const n of ir.nodes) {
    if (n.parent === clusterId) out.push(n);
  }
  for (const sg of ir.subgraphs) {
    if (sg.parent === clusterId) collectClusterLeaves(sg.id, ir, out);
  }
}

// Pass-1.5 re-anchor. For every IR edge stamped with fromCluster/toCluster,
// find the bottom-most (outgoing) or top-most (incoming) leaf of that cluster
// by actual Y coord after pass-1 dagre. If the current anchor isn't extremal,
// swap and signal that the graph needs re-running. Returns true if anything
// changed.
function reanchorClusterEdges(ir: IR, g: any): boolean {
  let changed = false;
  const leafCache = new Map<string, IRNode[]>();
  function leavesOf(id: string): IRNode[] {
    let l = leafCache.get(id);
    if (l) return l;
    l = [];
    collectClusterLeaves(id, ir, l);
    leafCache.set(id, l);
    return l;
  }
  // Read Y from g (dagre's output) rather than n.y, since IR write-back
  // hasn't happened yet at this point.
  const yOf = (id: string): number => {
    const gn = g.node(id);
    return gn ? gn.y : 0;
  };
  for (const e of ir.edges) {
    if (e.fromCluster) {
      const leaves = leavesOf(e.fromCluster);
      if (leaves.length > 0) {
        const bottom = leaves.reduce((a, b) => (yOf(a.id) > yOf(b.id) ? a : b));
        if (bottom.id !== e.from) { e.from = bottom.id; changed = true; }
      }
    }
    if (e.toCluster) {
      const leaves = leavesOf(e.toCluster);
      if (leaves.length > 0) {
        const top = leaves.reduce((a, b) => (yOf(a.id) < yOf(b.id) ? a : b));
        if (top.id !== e.to) { e.to = top.id; changed = true; }
      }
    }
  }
  return changed;
}
function clusterBboxFromIR(
  clusterId: string,
  ir: IR,
): { x: number; y: number; w: number; h: number } | null {
  const sg = ir.subgraphs.find(s => s.id === clusterId);
  if (!sg) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const childId of sg.children) {
    const n = ir.nodes.find(nn => nn.id === childId);
    if (!n || n.x == null || n.y == null || n.width == null || n.height == null) continue;
    minX = Math.min(minX, n.x - n.width / 2);
    minY = Math.min(minY, n.y - n.height / 2);
    maxX = Math.max(maxX, n.x + n.width / 2);
    maxY = Math.max(maxY, n.y + n.height / 2);
  }
  for (const nested of ir.subgraphs.filter(s => s.parent === clusterId)) {
    const nb = clusterBboxFromIR(nested.id, ir);
    if (!nb) continue;
    minX = Math.min(minX, nb.x);
    minY = Math.min(minY, nb.y);
    maxX = Math.max(maxX, nb.x + nb.w);
    maxY = Math.max(maxY, nb.y + nb.h);
  }
  if (!isFinite(minX)) return null;
  return {
    x: minX - CLUSTER_BBOX_PADDING,
    y: minY - CLUSTER_BBOX_PADDING - 10,
    w: maxX - minX + CLUSTER_BBOX_PADDING * 2,
    h: maxY - minY + CLUSTER_BBOX_PADDING * 2 + 10,
  };
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

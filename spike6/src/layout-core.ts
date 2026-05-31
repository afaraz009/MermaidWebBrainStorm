// Shared layout primitives used by BOTH the flat path and the recursive
// encapsulate-then-translate path (layout.ts + recursive-layout.ts). Extracted
// verbatim from layout.ts so there is ONE implementation of label measurement,
// shape sizing, node-insertion order, descendant maps, and the external-
// connection classifier. No behaviour change vs the original flat code.
import type { IR, IRNode, IREdge, NodeShape } from './types.js';
import type { BBox } from './cluster-bbox.js';
import { clipToBorder, clipToClusterRect } from './border.js';

// Round up to a multiple of `step`. Used to size nodes and snap positions to
// the A* grid so every node boundary lands on a cell line.
export function ceilTo(v: number, step: number): number {
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

export function sizeForShape(shape: NodeShape, label: string): { w: number; h: number } {
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
//
// `scope` (added for the recursive port) restricts the walk to a subset of
// members: when laying out ONE cluster's level in isolation, only that
// cluster's direct children participate, and nested clusters appear as a
// single placeholder rather than being descended into. `scope.parent` is the
// cluster id whose direct children we emit (undefined = top level);
// `scope.stopAt` is the set of child-subgraph ids that are encapsulated at
// this level (their interiors are NOT descended into — they are placeholders).
// With no `scope`, behaviour is byte-identical to the original whole-IR walk.
export function sortNodesByHierarchy(
  ir: IR,
  scope?: { parent: string | undefined; stopAt: Set<string> },
): string[] {
  // Mermaid's `Adjusted Graph` for fixture_nested.mmd (captured 2026-05-25
  // via mermaid-debug.html) shows TWO surprising properties of its node
  // insertion order:
  //   1. ALL cluster nodes are inserted first, in a single DFS pass through
  //      the cluster hierarchy, BEFORE any leaf nodes.
  //   2. The cluster DFS and the leaf DFS use DIFFERENT sibling orders:
  //      • cluster section visits siblings in REVERSE declaration order.
  //      • leaf section visits the same siblings in DECLARATION order.
  // The asymmetry on (2) is empirical — see the dump. It's surprising enough
  // that the code below takes the order as an explicit parameter rather than
  // implying it via "which map you read from", so the asymmetry is visible
  // at the call site instead of hidden in a pre-reversed data structure.
  //
  // Why (2) matters: when two clusters at the same level have no edges
  // between them (e.g. fixture_nested's Storage_L2 children Cache/Primary),
  // dagre's barycenter tiebreaker falls back to insertion order. The reverse
  // cluster order puts Cache LEFT and Primary RIGHT — matching Mermaid v11.
  const subgraphsByParent = new Map<string | undefined, string[]>();
  for (const sg of ir.subgraphs) {
    const key = sg.parent;
    if (!subgraphsByParent.has(key)) subgraphsByParent.set(key, []);
    subgraphsByParent.get(key)!.push(sg.id);
  }
  const leavesByParent = new Map<string | undefined, string[]>();
  for (const n of ir.nodes) {
    const key = n.parent;
    if (!leavesByParent.has(key)) leavesByParent.set(key, []);
    leavesByParent.get(key)!.push(n.id);
  }

  // Child subgraph ids of `parent`, in the requested visit order. Pristine
  // declaration order is what the map holds; `reversed` returns a fresh
  // reversed copy so the map itself stays canonical.
  type SiblingOrder = 'declaration' | 'reversed';
  function childSubgraphs(parent: string | undefined, order: SiblingOrder): string[] {
    const list = subgraphsByParent.get(parent) ?? [];
    return order === 'reversed' ? list.slice().reverse() : list;
  }

  const out: string[] = [];
  const stopAt = scope?.stopAt;

  // CLUSTER section — siblings REVERSED. Load-bearing for property (2) above.
  function emitClusters(parent: string | undefined): void {
    for (const sgId of childSubgraphs(parent, 'reversed')) {
      out.push(sgId);
      // In scoped mode, an encapsulated child is a placeholder — don't descend.
      if (stopAt?.has(sgId)) continue;
      emitClusters(sgId);
    }
  }

  // LEAF section — leaves of each cluster, then recurse into nested clusters
  // in DECLARATION order. Opposite asymmetry from emitClusters by design.
  function emitLeaves(parent: string | undefined): void {
    for (const leafId of leavesByParent.get(parent) ?? []) {
      out.push(leafId);
    }
    for (const sgId of childSubgraphs(parent, 'declaration')) {
      if (stopAt?.has(sgId)) continue;
      emitLeaves(sgId);
    }
  }

  if (scope) {
    // Per-level: only this parent's direct children. Encapsulated child
    // clusters are emitted as single ids (placeholders); leaves of flat
    // (non-encapsulated) child clusters still descend so compound setParent
    // matches the flat path.
    emitClusters(scope.parent);
    emitLeaves(scope.parent);
  } else {
    emitClusters(undefined);
    emitLeaves(undefined);
  }

  return out;
}

// Inclusive bbox containment — used by the edge write-back to discard
// dagre waypoints inside a cluster we're about to clip the endpoint out of.
export function pointInBbox(
  p: { x: number; y: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
}

// All deep-descendant leaves of a cluster, recursively. Mutates `out`.
export function collectClusterLeaves(clusterId: string, ir: IR, out: IRNode[]): void {
  for (const n of ir.nodes) {
    if (n.parent === clusterId) out.push(n);
  }
  for (const sg of ir.subgraphs) {
    if (sg.parent === clusterId) collectClusterLeaves(sg.id, ir, out);
  }
}

// Map cluster id → set of all descendant node + subgraph ids (deep).
// Used by `computeExternalConnections` to detect boundary-crossing edges per
// Mermaid's `isDescendant` semantics (the cluster itself is NOT a descendant
// of itself).
export function buildDescendantsMap(ir: IR): Map<string, Set<string>> {
  const childrenOf = new Map<string, string[]>();
  for (const sg of ir.subgraphs) {
    childrenOf.set(sg.id, []);
  }
  for (const sg of ir.subgraphs) {
    if (sg.parent) childrenOf.get(sg.parent)!.push(sg.id);
  }
  for (const n of ir.nodes) {
    if (n.parent) {
      if (!childrenOf.has(n.parent)) childrenOf.set(n.parent, []);
      childrenOf.get(n.parent)!.push(n.id);
    }
  }
  const out = new Map<string, Set<string>>();
  function collect(id: string, into: Set<string>): void {
    const kids = childrenOf.get(id);
    if (!kids) return;
    for (const k of kids) {
      into.add(k);
      collect(k, into);
    }
  }
  for (const sg of ir.subgraphs) {
    const desc = new Set<string>();
    collect(sg.id, desc);
    out.set(sg.id, desc);
  }
  return out;
}

// Clip an edge's raw dagre waypoints to node borders / cluster rects. Shared by
// the flat path (layout.ts) and the recursive path (recursive-layout.ts) so the
// endpoint geometry is byte-identical regardless of which engine produced
// rawPts. For an endpoint rewritten from a subgraph id (fromCluster/toCluster),
// clip to the cluster's drawn bbox (perpendicular) and cull waypoints inside
// the cluster; otherwise clip to the leaf shape outline. Guarantees >=3 points
// so curveBasis renders a smooth curve. (Extracted verbatim from the layout.ts
// edge write-back so the geometry is single-sourced.)
export function clipEdgeWaypoints(
  e: IREdge,
  rawPts: { x: number; y: number }[],
  clusterBboxes: Map<string, BBox>,
  nodesById: Map<string, IRNode>,
): { x: number; y: number }[] {
  let pts = rawPts.map(p => ({ x: p.x, y: p.y }));
  const fromNode = nodesById.get(e.from);
  const toNode   = nodesById.get(e.to);
  if (pts.length >= 2 && fromNode && toNode) {
    // Start endpoint: cluster border if rewritten from subgraph, else leaf shape.
    if (e.fromCluster) {
      const bbox = clusterBboxes.get(e.fromCluster);
      if (bbox) {
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
      const bbox = clusterBboxes.get(e.toCluster);
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
  return pts;
}

// The set of cluster ids that have at least one edge crossing their boundary
// (exactly one endpoint is a descendant — XOR), using ORIGINAL endpoints
// (`fromCluster ?? from` / `toCluster ?? to`) so a cluster-anchored rewrite
// doesn't look boundary-crossing. Mirrors Mermaid's `adjustClustersAndEdges`
// `externalConnections` flag (dagre-KV5264BT.mjs:218-226). A cluster NOT in
// this set is `externalConnections === false` → Mermaid encapsulates it.
//
// Extracted from the former `hasExternal` closure inside reanchorClusterEdges;
// behaviour is identical (a pure per-cluster predicate).
export function computeExternalConnections(ir: IR): Set<string> {
  const descendants = buildDescendantsMap(ir);
  const external = new Set<string>();
  for (const sg of ir.subgraphs) {
    const desc = descendants.get(sg.id);
    if (!desc) continue;
    for (const e of ir.edges) {
      const src = e.fromCluster ?? e.from;
      const dst = e.toCluster ?? e.to;
      if (desc.has(src) !== desc.has(dst)) {
        external.add(sg.id);
        break;
      }
    }
  }
  return external;
}

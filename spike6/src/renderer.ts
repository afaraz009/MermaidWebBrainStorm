import { line, curveBasis } from 'd3-shape';
import type { IR, IREdge, IRSubgraph, IRNode, NodeShape } from './types.js';
import {
  clipToBorder,
  clipToClusterRect,
  hexagonVerts,
  parallelogramRightVerts,
  parallelogramLeftVerts,
  trapezoidVerts,
  trapezoidAltVerts,
  asymmetricVerts,
} from './border.js';
import { isSurrogateId, sgIdFromSurrogate, countHiddenDescendants } from './effective-ir.js';
import { astarSettings } from './astarSettings.js';
import { edgeSettings } from './edgeSettings.js';
import { measureLabel, wrapEdgeLabel, edgeLabelSize, EDGE_LABEL_LINE_HEIGHT_EM } from './layout.js';
import { computeClusterBboxes, type BBox } from './cluster-bbox.js';

// Mermaid v11 edge-label styling. Spec verified against Mermaid's source
// (node_modules/mermaid/dist/mermaid.js:95453 + theme defaults at :2894):
//   - background: edgeLabelBackground = `#e8e8e8`
//   - rect has `opacity: 0.5` — softens the fill so it doesn't overwhelm the
//     underlying edge line.
// Wrap width (200px) + line-height (1.1) live in layout.ts because dagre also
// uses edgeLabelSize to allocate space between nodes for the label.
// These three constants (font, fill, opacity) and the rendered geometry must
// stay aligned across the three label-render sites: initial render,
// `restoreEdgeStyle`, `refreshEdgesFromLayout`.
const EDGE_LABEL_FONT_SIZE = 16;
const EDGE_LABEL_FONT_FAMILY = '"trebuchet ms", verdana, arial, sans-serif';
const EDGE_LABEL_FILL = '#e8e8e8';
const EDGE_LABEL_OPACITY = '0.5';
const EDGE_LABEL_TEXT = '#333';

const SVG_NS = 'http://www.w3.org/2000/svg';
const ARROW_TIP_LEN = 10;
const ARROW_MARKER_ID = 'arrow';

// Edge keys are the IR edge `id` (stamped by parser-adapter, see types.ts).
// Keying by `id` (not `${from}::${to}`) is what lets duplicate (from,to)
// edges coexist in the renderer's per-edge maps and DOM nodes.
export function edgeKey(e: IREdge): string {
  return e.id;
}

interface MountMeta {
  ir: IR;
  adjacency: Map<string, string[]>;
  edgeMap: Map<string, IREdge>;
  displayPoints: Map<string, { x: number; y: number }[]>;
  displayMode: Map<string, 'curve' | 'straight'>;
  subgraphRects: Map<string, SVGRectElement>;
  subgraphLabels: Map<string, SVGTextElement>;
}

function el(tag: string): SVGElement {
  return document.createElementNS(SVG_NS, tag) as SVGElement;
}

// Build the SVG element(s) that draw a single node shape. Returned in
// draw-order; caller appends them in sequence. Local coordinate origin is the
// node group's (0,0) — the group is already translated to (left, top), so
// shapes span (0, 0)–(w, h).
//
// All shape outlines must enclose the same bounding box that border.ts clips
// against, so edges always land on the visible outline.
function createShapeElements(
  shape: NodeShape,
  w: number,
  h: number,
  fill: string,
  fillOpacity: string,
  stroke: string,
  strokeWidth: string,
): SVGElement[] {
  const style = (e: SVGElement) => {
    e.setAttribute('fill', fill);
    e.setAttribute('fill-opacity', fillOpacity);
    e.setAttribute('stroke', stroke);
    e.setAttribute('stroke-width', strokeWidth);
  };

  // Helpers — vertex generators in border.ts are in screen coords centred at
  // (cx,cy). Reuse them centred at (w/2, h/2), then convert each vertex to the
  // group's local space by subtracting nothing (they already are local).
  const cx = w / 2, cy = h / 2;
  const hw = w / 2, hh = h / 2;
  const ptsToPolygon = (pts: { x: number; y: number }[]) =>
    pts.map(p => `${p.x},${p.y}`).join(' ');

  if (shape === 'round') {
    const r = el('rect');
    r.setAttribute('width', String(w));
    r.setAttribute('height', String(h));
    r.setAttribute('rx', '8');
    r.setAttribute('ry', '8');
    style(r);
    return [r];
  }

  if (shape === 'stadium') {
    // Pill — full-height rounded corners.
    const r = el('rect');
    r.setAttribute('width', String(w));
    r.setAttribute('height', String(h));
    r.setAttribute('rx', String(h / 2));
    r.setAttribute('ry', String(h / 2));
    style(r);
    return [r];
  }

  if (shape === 'subroutine') {
    // Rectangle with two inner vertical bars marking the subroutine boundary.
    const r = el('rect');
    r.setAttribute('width', String(w));
    r.setAttribute('height', String(h));
    r.setAttribute('rx', '0');
    style(r);
    const inset = Math.min(10, w * 0.08);
    const bar1 = el('line') as SVGLineElement;
    bar1.setAttribute('x1', String(inset));
    bar1.setAttribute('y1', '0');
    bar1.setAttribute('x2', String(inset));
    bar1.setAttribute('y2', String(h));
    bar1.setAttribute('stroke', stroke);
    bar1.setAttribute('stroke-width', strokeWidth);
    const bar2 = el('line') as SVGLineElement;
    bar2.setAttribute('x1', String(w - inset));
    bar2.setAttribute('y1', '0');
    bar2.setAttribute('x2', String(w - inset));
    bar2.setAttribute('y2', String(h));
    bar2.setAttribute('stroke', stroke);
    bar2.setAttribute('stroke-width', strokeWidth);
    return [r, bar1, bar2];
  }

  if (shape === 'cylinder') {
    // Database/disk: rectangle body + top ellipse cap + bottom ellipse arc.
    const ry = Math.min(8, h * 0.18);
    const body = el('path');
    // Front face: arc top + straight sides + arc bottom.
    body.setAttribute(
      'd',
      `M 0 ${ry} A ${w / 2} ${ry} 0 0 0 ${w} ${ry} L ${w} ${h - ry} A ${w / 2} ${ry} 0 0 1 ${w / 2} ${h} A ${w / 2} ${ry} 0 0 1 0 ${h - ry} Z`,
    );
    style(body);
    // Top ellipse stroke (gives the "rim" look).
    const topArc = el('path');
    topArc.setAttribute('d', `M 0 ${ry} A ${w / 2} ${ry} 0 0 1 ${w} ${ry}`);
    topArc.setAttribute('fill', 'none');
    topArc.setAttribute('stroke', stroke);
    topArc.setAttribute('stroke-width', strokeWidth);
    return [body, topArc];
  }

  if (shape === 'circle') {
    const c = el('circle');
    c.setAttribute('cx', String(cx));
    c.setAttribute('cy', String(cy));
    c.setAttribute('r', String(Math.min(hw, hh)));
    style(c);
    return [c];
  }

  if (shape === 'double-circle') {
    const r = Math.min(hw, hh);
    const outer = el('circle');
    outer.setAttribute('cx', String(cx));
    outer.setAttribute('cy', String(cy));
    outer.setAttribute('r', String(r));
    style(outer);
    const inner = el('circle');
    inner.setAttribute('cx', String(cx));
    inner.setAttribute('cy', String(cy));
    inner.setAttribute('r', String(Math.max(2, r - 5)));
    inner.setAttribute('fill', 'none');
    inner.setAttribute('stroke', stroke);
    inner.setAttribute('stroke-width', strokeWidth);
    return [outer, inner];
  }

  if (shape === 'diamond') {
    const p = el('polygon');
    p.setAttribute('points', `${cx},0 ${w},${cy} ${cx},${h} 0,${cy}`);
    style(p);
    return [p];
  }

  if (shape === 'hexagon') {
    const p = el('polygon');
    p.setAttribute('points', ptsToPolygon(hexagonVerts(cx, cy, hw, hh)));
    style(p);
    return [p];
  }

  if (shape === 'parallelogram') {
    const p = el('polygon');
    p.setAttribute('points', ptsToPolygon(parallelogramRightVerts(cx, cy, hw, hh)));
    style(p);
    return [p];
  }

  if (shape === 'parallelogram-alt') {
    const p = el('polygon');
    p.setAttribute('points', ptsToPolygon(parallelogramLeftVerts(cx, cy, hw, hh)));
    style(p);
    return [p];
  }

  if (shape === 'trapezoid') {
    const p = el('polygon');
    p.setAttribute('points', ptsToPolygon(trapezoidVerts(cx, cy, hw, hh)));
    style(p);
    return [p];
  }

  if (shape === 'trapezoid-alt') {
    const p = el('polygon');
    p.setAttribute('points', ptsToPolygon(trapezoidAltVerts(cx, cy, hw, hh)));
    style(p);
    return [p];
  }

  if (shape === 'asymmetric') {
    const p = el('polygon');
    p.setAttribute('points', ptsToPolygon(asymmetricVerts(cx, cy, hw, hh)));
    style(p);
    return [p];
  }

  if (shape === 'ellipse') {
    const e2 = el('ellipse');
    e2.setAttribute('cx', String(cx));
    e2.setAttribute('cy', String(cy));
    e2.setAttribute('rx', String(hw));
    e2.setAttribute('ry', String(hh));
    style(e2);
    return [e2];
  }

  // 'rect' (default).
  const r = el('rect');
  r.setAttribute('width', String(w));
  r.setAttribute('height', String(h));
  r.setAttribute('rx', '4');
  style(r);
  return [r];
}

function anchoredPts(pts: { x: number; y: number }[]): { x: number; y: number }[] {
  return [pts[0], ...pts, pts[pts.length - 1]];
}

type Side = 'top' | 'bottom' | 'left' | 'right';
type Axis = 'vertical' | 'horizontal' | 'overlap';

// Classify the dominant axis of separation between two nodes by their bboxes.
//   'vertical'   — the nodes are clearly above/below each other (their X
//                  projections don't overlap, OR vertical clearance > horizontal)
//   'horizontal' — clearly side-by-side
//   'overlap'    — bboxes overlap on both axes; no clean "side" applies and
//                  edges should fall back to clip-to-border for smoothness.
// Using bbox clearance (not center-to-center direction) gives hysteresis: the
// side only flips when one node *fully* passes the other on that axis, so a
// node moving past a peer doesn't snap to a new side mid-overlap.
function classifyAxis(a: IRNode, b: IRNode): Axis {
  const ahw = (a.width ?? 80) / 2, ahh = (a.height ?? 40) / 2;
  const bhw = (b.width ?? 80) / 2, bhh = (b.height ?? 40) / 2;
  const dx = Math.abs((b.x ?? 0) - (a.x ?? 0)) - (ahw + bhw);
  const dy = Math.abs((b.y ?? 0) - (a.y ?? 0)) - (ahh + bhh);
  // Both axes overlap → nodes are interpenetrating or directly adjacent.
  if (dx < 0 && dy < 0) return 'overlap';
  // Whichever axis has the larger positive clearance wins.
  if (dy >= dx) return 'vertical';
  return 'horizontal';
}

// Pick the side of `node` that faces `toward`. Uses a normalized comparison so
// nodes with very different aspect ratios (e.g., tall diamond vs wide
// parallelogram) pick the correct face — purely comparing |dx| vs |dy| would
// over-prefer the vertical axis on tall nodes.
function chooseSide(node: IRNode, toward: { x: number; y: number }): Side {
  const cx = node.x ?? 0;
  const cy = node.y ?? 0;
  const hw = (node.width ?? 80) / 2;
  const hh = (node.height ?? 40) / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  // Compare slopes against the node's half-width:half-height ratio. If
  // |dy|/hh > |dx|/hw the connection is more vertical → top or bottom.
  if (Math.abs(dy) * hw > Math.abs(dx) * hh) {
    return dy >= 0 ? 'bottom' : 'top';
  }
  return dx >= 0 ? 'right' : 'left';
}

// Side of `node` that faces `peer`, constrained to a specific axis. Used by
// the bbox-aware path: once classifyAxis() picks the dominant axis, both
// endpoints anchor on that axis so the edge runs cleanly between facing sides
// instead of flipping mid-drag.
function sideOnAxis(node: IRNode, peer: IRNode, axis: 'vertical' | 'horizontal'): Side {
  if (axis === 'vertical') {
    return ((peer.y ?? 0) >= (node.y ?? 0)) ? 'bottom' : 'top';
  }
  return ((peer.x ?? 0) >= (node.x ?? 0)) ? 'right' : 'left';
}

// Anchor point at the midpoint of the chosen side, on the node's outline.
function anchorOnSide(node: IRNode, side: Side): { x: number; y: number } {
  const cx = node.x ?? 0;
  const cy = node.y ?? 0;
  const hw = (node.width ?? 80) / 2;
  const hh = (node.height ?? 40) / 2;
  switch (side) {
    case 'top':    return { x: cx,      y: cy - hh };
    case 'bottom': return { x: cx,      y: cy + hh };
    case 'left':   return { x: cx - hw, y: cy      };
    case 'right':  return { x: cx + hw, y: cy      };
  }
}

// Pair of (side, point) anchors for the two endpoints of an edge during drag.
export function sideAwareAnchors(
  fromNode: IRNode,
  toNode: IRNode,
): {
  from: { side: Side; point: { x: number; y: number } };
  to:   { side: Side; point: { x: number; y: number } };
} {
  const fromCenter = { x: fromNode.x ?? 0, y: fromNode.y ?? 0 };
  const toCenter   = { x: toNode.x   ?? 0, y: toNode.y   ?? 0 };
  const fromSide = chooseSide(fromNode, toCenter);
  const toSide   = chooseSide(toNode,   fromCenter);
  return {
    from: { side: fromSide, point: anchorOnSide(fromNode, fromSide) },
    to:   { side: toSide,   point: anchorOnSide(toNode,   toSide)   },
  };
}

// Build the 4-point curve used during drag / persisted on drop: anchor on each
// node's facing side + a short perpendicular stub for clean exit/entry.
// Centralized here so drag-time rendering and post-drop persistence stay in
// sync — both end up with the same geometry, so the visible edge doesn't snap
// from "side-aware curve" back to "dagre originalPoints" on mouseup.
export function buildSideAwareCurve(
  fromNode: IRNode,
  toNode: IRNode,
  stubDist = 16,
): { x: number; y: number }[] {
  const { from: a, to: b } = sideAwareAnchors(fromNode, toNode);
  return [a.point, stubFromSide(a.side, a.point, stubDist), stubFromSide(b.side, b.point, stubDist), b.point];
}

// Compute smooth, intelligent edge curves for every edge touching `pivotNode`.
//
// Per-edge strategy (decided by the bbox relationship between pivot and peer):
//   • "vertical"   — peer fully above/below pivot. Anchor on top/bottom sides.
//   • "horizontal" — peer fully left/right. Anchor on left/right sides.
//   • "overlap"    — bboxes interpenetrate. Anchor via clipToBorder (radial
//                    intersection from each center toward the other), which
//                    slides smoothly along the outline as the node moves and
//                    avoids the visible "snap" of a discrete side change.
//
// For the discrete (non-overlap) edges, edges sharing a pivot side are
// distributed across the inner 80% of that side (sorted by peer position so
// they don't cross) so multiple edges fan out instead of stacking at the
// midpoint.
//
// Returns a Map keyed by the caller's `ref` so the caller can write the points
// back onto IR / displayPoints without re-deriving identity.
//
// Cluster-anchored peers: if an edge has `fromCluster`/`toCluster` set on the
// peer side (i.e. the peer's id is the rewritten leaf of a subgraph endpoint),
// the caller supplies the cluster bbox via `clusterBboxes`. We then treat the
// peer as a rectangle the size of the drawn cluster — axis classification +
// side picking + anchor clipping all use the cluster bbox instead of the
// leaf's outline, so the drag preview matches the post-layout static render.
export function buildSideAwareCurvesForNode(
  pivotNode: IRNode,
  edges: { from: string; to: string; ref: unknown; fromCluster?: string; toCluster?: string }[],
  nodesById: Map<string, IRNode>,
  clusterBboxes?: Map<string, BBox>,
  stubDist = 16,
): Map<unknown, { x: number; y: number }[]> {
  type Item = { ref: unknown; peer: IRNode; isOutgoing: boolean; peerCluster?: BBox };
  const bySide: Record<Side, Item[]> = { top: [], bottom: [], left: [], right: [] };
  const overlapItems: Item[] = [];
  const out = new Map<unknown, { x: number; y: number }[]>();

  for (const e of edges) {
    const isOutgoing = e.from === pivotNode.id;
    const peerId = isOutgoing ? e.to : e.from;
    const peer = nodesById.get(peerId);
    if (!peer) continue;
    // Peer side cluster annotation: outgoing → toCluster, incoming → fromCluster.
    const peerClusterId = isOutgoing ? e.toCluster : e.fromCluster;
    const peerCluster = peerClusterId ? clusterBboxes?.get(peerClusterId) : undefined;

    // PIVOT-side cluster annotation: the dragged node is itself the rewritten
    // representative leaf of a cluster→X edge (outgoing → fromCluster, incoming
    // → toCluster). The visible endpoint on the pivot side is the CLUSTER border,
    // not this leaf — so anchor cluster-border ↔ peer and DON'T fan the edge out
    // on the pivot. Without this, dragging an interior leaf (e.g. Open Doc inside
    // the Productivity cluster) drags the cluster's external edge (Productivity→
    // Halt) onto the leaf. The cluster border itself tracks the drag as the
    // cluster resizes (see computeClusterBboxes / drag.ts ancestor-rect clear).
    const pivotClusterId = isOutgoing ? e.fromCluster : e.toCluster;
    const pivotCluster = pivotClusterId ? clusterBboxes?.get(pivotClusterId) : undefined;
    if (pivotCluster) {
      const pivotCenter = { x: pivotCluster.x + pivotCluster.w / 2, y: pivotCluster.y + pivotCluster.h / 2 };
      const peerCenter = peerCluster
        ? { x: peerCluster.x + peerCluster.w / 2, y: peerCluster.y + peerCluster.h / 2 }
        : { x: peer.x ?? 0, y: peer.y ?? 0 };
      const pivotAnchor = clipToClusterRect(pivotCluster, peerCenter);
      const peerAnchor = peerCluster
        ? clipToClusterRect(peerCluster, pivotCenter)
        : clipToBorder(peer, pivotCenter);
      const pivotStub = stubAlongNormal(pivotCenter, pivotAnchor, stubDist);
      const peerStub = stubAlongNormal(peerCenter, peerAnchor, stubDist);
      out.set(e.ref, isOutgoing
        ? [pivotAnchor, pivotStub, peerStub, peerAnchor]
        : [peerAnchor, peerStub, pivotStub, pivotAnchor]);
      continue;
    }

    // For axis/side classification, use the cluster's rectangle when the peer
    // is cluster-anchored — otherwise the leaf's tiny bbox would pick the
    // wrong side once the pivot is dragged across the cluster boundary.
    const peerForAxis = peerCluster ? bboxAsNode(peerCluster) : peer;
    const axis = classifyAxis(pivotNode, peerForAxis);
    if (axis === 'overlap') {
      overlapItems.push({ ref: e.ref, peer, isOutgoing, peerCluster });
    } else {
      const side = sideOnAxis(pivotNode, peerForAxis, axis);
      bySide[side].push({ ref: e.ref, peer, isOutgoing, peerCluster });
    }
  }

  // Overlap edges — radial clip-to-border on both endpoints. Smooth and
  // continuous; no side-snap. Stub away from each anchor along the local
  // outward normal so the basis curve has a defined tangent.
  for (const it of overlapItems) {
    const pivotCenter = { x: pivotNode.x ?? 0, y: pivotNode.y ?? 0 };
    const peerCenter  = it.peerCluster
      ? { x: it.peerCluster.x + it.peerCluster.w / 2, y: it.peerCluster.y + it.peerCluster.h / 2 }
      : { x: it.peer.x ?? 0, y: it.peer.y ?? 0 };
    const pivotAnchor = clipToBorder(pivotNode, peerCenter);
    const peerAnchor  = it.peerCluster
      ? clipToClusterRect(it.peerCluster, pivotCenter)
      : clipToBorder(it.peer, pivotCenter);
    const pivotStub = stubAlongNormal(pivotCenter, pivotAnchor, stubDist);
    const peerStub  = stubAlongNormal(peerCenter,  peerAnchor,  stubDist);
    const pts = it.isOutgoing
      ? [pivotAnchor, pivotStub, peerStub, peerAnchor]
      : [peerAnchor,  peerStub,  pivotStub, pivotAnchor];
    out.set(it.ref, pts);
  }

  // Discrete-side edges — distribute along the chosen pivot side.
  const cx = pivotNode.x ?? 0;
  const cy = pivotNode.y ?? 0;
  const hw = (pivotNode.width ?? 80) / 2;
  const hh = (pivotNode.height ?? 40) / 2;

  for (const side of ['top', 'bottom', 'left', 'right'] as Side[]) {
    const items = bySide[side];
    if (items.length === 0) continue;
    const horizontal = side === 'top' || side === 'bottom';
    // Use cluster center for sorting when peer is cluster-anchored, else
    // the leaf node's center.
    const peerSortKey = (it: Item) => {
      if (it.peerCluster) {
        return horizontal
          ? it.peerCluster.x + it.peerCluster.w / 2
          : it.peerCluster.y + it.peerCluster.h / 2;
      }
      return horizontal ? (it.peer.x ?? 0) : (it.peer.y ?? 0);
    };
    items.sort((a, b) => peerSortKey(a) - peerSortKey(b));

    const span = horizontal ? hw * 2 * 0.8 : hh * 2 * 0.8;
    const n = items.length;
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const offset = (t - 0.5) * span;
      // Virtual target sits along the outward side direction at the offset.
      // We then clip a ray from the pivot center toward that target onto the
      // pivot's actual outline — this gives anchors that lie on the real shape
      // (diamond, hexagon, parallelogram, …) instead of a fictional axis-
      // aligned bbox side. Mandatory for non-rectangular shapes: without it,
      // edges visibly stop short of the node outline.
      let virtualTarget: { x: number; y: number };
      switch (side) {
        case 'top':    virtualTarget = { x: cx + offset, y: cy - hh * 2 }; break;
        case 'bottom': virtualTarget = { x: cx + offset, y: cy + hh * 2 }; break;
        case 'left':   virtualTarget = { x: cx - hw * 2, y: cy + offset }; break;
        case 'right':  virtualTarget = { x: cx + hw * 2, y: cy + offset }; break;
      }
      const pivotAnchor = clipToBorder(pivotNode, virtualTarget);

      // Peer side is the OPPOSITE of pivot side on the same axis — guaranteed
      // by classifyAxis. Pinning it avoids the peer's anchor flipping when
      // the dragged node passes over a corner.
      const peerSide: Side =
          side === 'top'    ? 'bottom'
        : side === 'bottom' ? 'top'
        : side === 'left'   ? 'right'
                            : 'left';
      // Same shape-aware clip for the peer anchor. Aim along the peer's
      // OUTWARD direction at the peer's bbox center on that side; clipToBorder
      // returns the actual outline intersection. When the peer is cluster-
      // anchored, use the cluster bbox + clipToClusterRect so the anchor
      // lands on the drawn cluster border rather than the leaf shape.
      const peerCluster = items[i].peerCluster;
      const pcx = peerCluster ? peerCluster.x + peerCluster.w / 2 : (items[i].peer.x ?? 0);
      const pcy = peerCluster ? peerCluster.y + peerCluster.h / 2 : (items[i].peer.y ?? 0);
      const phw = peerCluster ? peerCluster.w / 2 : (items[i].peer.width ?? 80) / 2;
      const phh = peerCluster ? peerCluster.h / 2 : (items[i].peer.height ?? 40) / 2;
      let peerVirtual: { x: number; y: number };
      switch (peerSide) {
        case 'top':    peerVirtual = { x: pcx,           y: pcy - phh * 2 }; break;
        case 'bottom': peerVirtual = { x: pcx,           y: pcy + phh * 2 }; break;
        case 'left':   peerVirtual = { x: pcx - phw * 2, y: pcy            }; break;
        case 'right':  peerVirtual = { x: pcx + phw * 2, y: pcy            }; break;
      }
      const peerAnchor = peerCluster
        ? clipToClusterRect(peerCluster, peerVirtual)
        : clipToBorder(items[i].peer, peerVirtual);
      const pivotStub = stubFromSide(side,     pivotAnchor, stubDist);
      const peerStub  = stubFromSide(peerSide, peerAnchor,  stubDist);
      const pts = items[i].isOutgoing
        ? [pivotAnchor, pivotStub, peerStub, peerAnchor]
        : [peerAnchor,  peerStub,  pivotStub, pivotAnchor];
      out.set(items[i].ref, pts);
    }
  }
  return out;
}

// Wrap a cluster bbox as a virtual IRNode for classifyAxis / sideOnAxis. Only
// the fields those helpers read (x, y, width, height) are populated.
function bboxAsNode(b: BBox): IRNode {
  return {
    id: '',
    label: '',
    shape: 'rect',
    x: b.x + b.w / 2,
    y: b.y + b.h / 2,
    width: b.w,
    height: b.h,
  };
}

// Short stub from `anchor` along the outward direction (anchor - center).
// Used in the overlap case where the anchor isn't on a flat side, so we need
// the outward normal rather than a fixed top/bottom/left/right direction.
function stubAlongNormal(
  center: { x: number; y: number },
  anchor: { x: number; y: number },
  dist: number,
): { x: number; y: number } {
  const dx = anchor.x - center.x;
  const dy = anchor.y - center.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-3) return { x: anchor.x, y: anchor.y };
  return { x: anchor.x + (dx / len) * dist, y: anchor.y + (dy / len) * dist };
}

// One short stub point perpendicular to the chosen side. Used to seed the
// curve direction so the path exits/enters the node head-on rather than
// curling back into it on diagonal connections.
export function stubFromSide(side: Side, p: { x: number; y: number }, dist: number): { x: number; y: number } {
  switch (side) {
    case 'top':    return { x: p.x,        y: p.y - dist };
    case 'bottom': return { x: p.x,        y: p.y + dist };
    case 'left':   return { x: p.x - dist, y: p.y        };
    case 'right':  return { x: p.x + dist, y: p.y        };
  }
}

const curveGen = line<{ x: number; y: number }>().x(d => d.x).y(d => d.y).curve(curveBasis);

// Smooth curveBasis path with the last point pulled back so the arrow tip
// lands cleanly on the node border.
export function edgeCurvePath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  const anchored = anchoredPts(pts);
  let body = anchored;
  if (anchored.length >= 2) {
    const last = anchored[anchored.length - 1];
    const prev = anchored[anchored.length - 2];
    const dx = last.x - prev.x;
    const dy = last.y - prev.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > ARROW_TIP_LEN) {
      const ratio = (len - ARROW_TIP_LEN) / len;
      const shortened = { x: prev.x + dx * ratio, y: prev.y + dy * ratio };
      body = [...anchored.slice(0, -1), shortened];
    }
  }
  return curveGen(body) ?? '';
}

export function updateArrowLine(lineEl: SVGLineElement, pts: { x: number; y: number }[]): void {
  if (pts.length < 2) return;
  const last = pts[pts.length - 1];
  const secondLast = pts[pts.length - 2];
  const adx = last.x - secondLast.x;
  const ady = last.y - secondLast.y;
  const alen = Math.sqrt(adx * adx + ady * ady);
  const shaftStart = alen > ARROW_TIP_LEN
    ? { x: last.x - (adx / alen) * ARROW_TIP_LEN, y: last.y - (ady / alen) * ARROW_TIP_LEN }
    : secondLast;
  lineEl.setAttribute('x1', String(shaftStart.x));
  lineEl.setAttribute('y1', String(shaftStart.y));
  lineEl.setAttribute('x2', String(last.x));
  lineEl.setAttribute('y2', String(last.y));
}

// Pick the points used for initial render. A* (when enabled) always wins —
// it produces a routed straight polyline. Otherwise fall back to dagre's
// originalPoints rendered with curveBasis; those points may already be the
// side-aware curves stamped on by the drop handler when edgeMode is
// 'side-aware', so this works for both 'side-aware' and 'dagre' modes.
type EdgePoints = { pts: { x: number; y: number }[]; mode: 'curve' | 'straight' };
function initialEdgePoints(e: IREdge): EdgePoints | undefined {
  if (astarSettings.enabled && e.routedPath && e.routedPath.length >= 2) {
    return { pts: e.routedPath.map(p => ({ ...p })), mode: 'straight' };
  }
  if (e.originalPoints && e.originalPoints.length > 0) {
    return { pts: e.originalPoints.map(p => ({ ...p })), mode: 'curve' };
  }
  return undefined;
}

// Straight-segment path: M start L p1 L p2 ... L end, with the last segment
// pulled back by ARROW_TIP_LEN so the arrow tip lands cleanly on the border.
function edgeStraightPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  const last = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  const dx = last.x - prev.x;
  const dy = last.y - prev.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const endPt = len > ARROW_TIP_LEN
    ? { x: prev.x + (dx / len) * (len - ARROW_TIP_LEN), y: prev.y + (dy / len) * (len - ARROW_TIP_LEN) }
    : last;
  const body = [...pts.slice(0, -1), endPt];
  return body.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
}

function edgePathString(ep: EdgePoints): string {
  return ep.mode === 'curve' ? edgeCurvePath(ep.pts) : edgeStraightPath(ep.pts);
}

// Arc-length midpoint of an edge path, replicating Mermaid v11's
// `utils.calcLabelPosition` → `traverseEdge` (chunk-5PVQY5BW.mjs:166-220): the
// point reached after walking HALF the path's total arc length, linearly
// interpolated within the segment where the halfway mark falls. This is NOT the
// middle-index waypoint (which lands on a cluster border for a crossing edge —
// HANDOFF-4 issue A). Mermaid uses THIS only when the path was clipped at a
// cluster boundary (`updatedPath`); for a normal edge it keeps dagre's label
// coord (see `edgeLabelAnchor`). Operates on the SAME clipped waypoints the path
// `d` is drawn from, so the label tracks the visible curve. (HANDOFF-4)
function calcLabelPosition(pts: { x: number; y: number }[]): { x: number; y: number } {
  if (pts.length === 0) return { x: 0, y: 0 };
  if (pts.length === 1) return pts[0];
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += dist(pts[i - 1], pts[i]);
  let remaining = total / 2;
  for (let i = 1; i < pts.length; i++) {
    const seg = dist(pts[i - 1], pts[i]);
    if (seg === 0) continue;
    if (seg < remaining) {
      remaining -= seg;
      continue;
    }
    const r = remaining / seg;
    if (r <= 0) return pts[i - 1];
    if (r >= 1) return { x: pts[i].x, y: pts[i].y };
    return {
      x: (1 - r) * pts[i - 1].x + r * pts[i].x,
      y: (1 - r) * pts[i - 1].y + r * pts[i].y,
    };
  }
  return pts[pts.length - 1];
}

// The waypoint nearest `p` (Euclidean). dagre's label dummy is always a vertex
// of the routed path; after clipping it survives as a vertex (with a possibly
// straightened coord), so snapping `p` to the nearest vertex recovers it.
function nearestVertex(
  p: { x: number; y: number },
  pts: { x: number; y: number }[],
): { x: number; y: number } {
  let best = pts[0], bestD = Infinity;
  for (const q of pts) {
    const d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
    if (d < bestD) { bestD = d; best = q; }
  }
  return best;
}

// Edge-label anchor — replicates Mermaid's `positionEdgeLabel`
// (chunk-ENJZ2VHE.mjs:315), which anchors a label at dagre's label-dummy coord.
// dagre reserves a rank for the label and threads it through the routed path as
// a vertex; we record that coord in `e.labelPos`. Its rank (y for TB) is exact,
// but dagre offsets its cross-coord to the SIDE of the path, and our post-dagre
// clipping then straightens the path — so the raw coord sits beside the drawn
// path. Snapping it to the nearest path vertex restores Mermaid's position:
//   • cyclic_nested_1 `retry`: raw (271.9,706.5) → vertex (240.2,706.5) =
//     Mermaid (240.2,706.7).
//   • fixture_nested `auth`: raw (315.3,445.8) → vertex (285.2,445.8) = Mermaid
//     exactly — the waypoint just ABOVE the cluster border, clear of the "Auth
//     Subsystem" title that the naive middle-index waypoint lands on (issue A).
// When labelPos is absent — flat legacy path (pinned / no-subgraph), or a
// non-layout reroute (side-aware drag / A*) that deleted the now-stale coord —
// fall back to the arc-length midpoint = geometric middle of the drawn path. NOT
// the middle-INDEX waypoint: a side-aware rebuild is a 4-point curve
// [anchor, stub, peerStub, peerAnchor], whose middle index (pts[2]=peerStub)
// sits at the arrowhead end — the drag-jump bug. The arc-length midpoint is
// jump-free for any path shape.
function edgeLabelAnchor(e: IREdge, pts: { x: number; y: number }[]): { x: number; y: number } {
  if (e.labelPos && pts.length >= 1) return nearestVertex(e.labelPos, pts);
  return calcLabelPosition(pts);
}

export function renderFull(ir: IR, mountEl: SVGElement, interactive = false, originalIR?: IR): void {
  mountEl.innerHTML = '';

  mountEl.setAttribute('overflow', 'visible');
  mountEl.style.overflow = 'visible';

  const defs = el('defs');
  const marker = el('marker');
  marker.setAttribute('id', ARROW_MARKER_ID);
  marker.setAttribute('viewBox', '0 0 10 10');
  marker.setAttribute('refX', '9');
  marker.setAttribute('refY', '5');
  marker.setAttribute('markerWidth', '6');
  marker.setAttribute('markerHeight', '6');
  marker.setAttribute('orient', 'auto-start-reverse');
  const markerPath = el('path');
  markerPath.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
  markerPath.setAttribute('fill', '#333333');
  marker.appendChild(markerPath);
  defs.appendChild(marker);
  mountEl.appendChild(defs);

  const bboxMap = computeClusterBboxes(ir);

  // Layer 1: subgraphs
  const sgGroup = el('g');
  sgGroup.setAttribute('class', 'subgraphs');
  const subgraphRects = new Map<string, SVGRectElement>();
  const subgraphLabels = new Map<string, SVGTextElement>();
  for (const sg of sortSubgraphsOuterFirst(ir.subgraphs)) {
    const bbox = bboxMap.get(sg.id);
    if (!bbox) continue;
    const g = el('g') as SVGGElement;
    g.setAttribute('data-subgraph-id', sg.id);
    g.setAttribute('class', 'subgraph-group');
    g.style.cursor = 'pointer';

    const rect = el('rect') as SVGRectElement;
    rect.setAttribute('x', String(bbox.x));
    rect.setAttribute('y', String(bbox.y));
    rect.setAttribute('width', String(bbox.w));
    rect.setAttribute('height', String(bbox.h));
    rect.setAttribute('fill', '#f8f9fa');
    rect.setAttribute('fill-opacity', '0.15');
    rect.setAttribute('stroke', '#adb5bd');
    rect.setAttribute('stroke-width', '1.5');
    rect.setAttribute('rx', '6');

    // Cluster title — match Mermaid's subgraph title: 16px trebuchet, normal
    // weight, near-black, sitting in the box's top margin band (baseline ~18px
    // below the box top puts the glyph centre ~12px down, as Mermaid renders it).
    // The "▾" is our collapse affordance (Mermaid has none); kept but now in the
    // matching font. Title font does NOT affect layout (clusters are sized by
    // content+margins, not by label width), so this is purely cosmetic.
    const text = el('text') as SVGTextElement;
    // Centre the BARE label like Mermaid (which has no caret): with text-anchor
    // middle on "label  ▾" the trailing caret pulls the visible title left of
    // centre, so shift the anchor right by half the width of the "  ▾" suffix.
    // Stored on the element so the drag-reposition path applies the same shift
    // without re-measuring.
    const labelDx = (measureLabel(sg.label + '  ▾').w - measureLabel(sg.label).w) / 2;
    text.setAttribute('x', String(bbox.x + bbox.w / 2 + labelDx));
    text.setAttribute('y', String(bbox.y + 18));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('font-size', '16');
    text.setAttribute('font-family', '"trebuchet ms", verdana, arial, sans-serif');
    text.setAttribute('fill', '#333333');
    text.setAttribute('class', 'sg-header');
    text.textContent = sg.label + '  ▾';
    (text as unknown as { __labelDx: number }).__labelDx = labelDx;

    g.appendChild(rect);
    g.appendChild(text);
    sgGroup.appendChild(g);
    subgraphRects.set(sg.id, rect);
    subgraphLabels.set(sg.id, text);
  }
  mountEl.appendChild(sgGroup);

  // Adjacency + edge maps
  const adjacency = new Map<string, string[]>();
  const edgeMap = new Map<string, IREdge>();
  const displayPoints = new Map<string, { x: number; y: number }[]>();
  const displayMode = new Map<string, 'curve' | 'straight'>();

  for (const n of ir.nodes) adjacency.set(n.id, []);

  for (const e of ir.edges) {
    const key = edgeKey(e);
    edgeMap.set(key, e);
    adjacency.get(e.from)?.push(key);
    adjacency.get(e.to)?.push(key);
    const ep = initialEdgePoints(e);
    if (ep) {
      displayPoints.set(key, ep.pts);
      displayMode.set(key, ep.mode);
    }
  }

  const meta: MountMeta = { ir, adjacency, edgeMap, displayPoints, displayMode, subgraphRects, subgraphLabels };
  (mountEl as any).__meta = meta;

  // Layer 2: edges
  const edgeGroup = el('g');
  edgeGroup.setAttribute('class', 'edges');

  for (const e of ir.edges) {
    const key = edgeKey(e);
    const pts = displayPoints.get(key);
    if (!pts || pts.length === 0) continue;

    const g = el('g') as SVGGElement;
    g.setAttribute('data-edge-key', key);

    const mode = displayMode.get(key) ?? 'curve';
    const dStr = edgePathString({ pts, mode });

    // Invisible wide hit-area so right-click on a thin diagonal edge reliably
    // targets the edge group. Painted first so the visible path sits on top.
    const hit = el('path');
    hit.setAttribute('class', 'edge-hit-area');
    hit.setAttribute('d', dStr);
    hit.setAttribute('fill', 'none');
    hit.setAttribute('stroke', 'transparent');
    hit.setAttribute('stroke-width', '14');
    hit.setAttribute('pointer-events', 'stroke');
    hit.style.cursor = 'pointer';
    g.appendChild(hit);

    const path = el('path');
    path.setAttribute('class', 'edge-path');
    path.setAttribute('d', dStr);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#333333');
    path.setAttribute('stroke-width', '2');
    // Visible stroke is the same logical edge for hover styling, but
    // pointer-events go through to the wider hit area underneath.
    path.setAttribute('pointer-events', 'none');
    if (e.style === 'dotted') {
      path.setAttribute('stroke-dasharray', '5,5');
    }
    g.appendChild(path);

    const arrowLine = el('line') as SVGLineElement;
    arrowLine.setAttribute('class', 'edge-arrow-line');
    arrowLine.setAttribute('stroke', '#333333');
    arrowLine.setAttribute('stroke-width', '2');
    arrowLine.setAttribute('marker-end', `url(#${ARROW_MARKER_ID})`);
    arrowLine.setAttribute('pointer-events', 'none');
    if (e.style === 'dotted') {
      arrowLine.setAttribute('stroke-dasharray', 'none');
    }
    updateArrowLine(arrowLine, pts);
    g.appendChild(arrowLine);

    if (e.label) {
      // Dual rule: normal edge → dagre's label coord; cluster-crossing edge →
      // arc-length midpoint (clear of the cluster border/title). See
      // edgeLabelAnchor / HANDOFF-4 issue A.
      const mid = edgeLabelAnchor(e, pts);
      const lines = wrapEdgeLabel(e.label);
      const { w: labelW, h: labelH } = edgeLabelSize(e.label);
      const bg = el('rect');
      bg.setAttribute('class', 'edge-label-bg');
      bg.setAttribute('x', String(mid.x - labelW / 2));
      bg.setAttribute('y', String(mid.y - labelH / 2));
      bg.setAttribute('width', String(labelW));
      bg.setAttribute('height', String(labelH));
      bg.setAttribute('fill', EDGE_LABEL_FILL);
      bg.setAttribute('opacity', EDGE_LABEL_OPACITY);
      const text = el('text');
      text.setAttribute('class', 'edge-label-text');
      text.setAttribute('x', String(mid.x));
      text.setAttribute('y', String(mid.y));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'middle');
      text.setAttribute('font-size', String(EDGE_LABEL_FONT_SIZE));
      text.setAttribute('font-family', EDGE_LABEL_FONT_FAMILY);
      text.setAttribute('fill', EDGE_LABEL_TEXT);
      // Multi-line: first tspan at -((n-1)/2) * lineHeight, subsequent at +1.1em.
      const dy0 = -((lines.length - 1) / 2) * EDGE_LABEL_LINE_HEIGHT_EM;
      for (let i = 0; i < lines.length; i++) {
        const tspan = el('tspan') as SVGTSpanElement;
        tspan.setAttribute('x', String(mid.x));
        tspan.setAttribute('dy', i === 0 ? `${dy0}em` : `${EDGE_LABEL_LINE_HEIGHT_EM}em`);
        tspan.textContent = lines[i];
        text.appendChild(tspan);
      }
      g.appendChild(bg);
      g.appendChild(text);
    }

    edgeGroup.appendChild(g);
  }
  mountEl.appendChild(edgeGroup);

  // Layer 3: nodes
  const nodeGroup = el('g');
  nodeGroup.setAttribute('class', 'nodes');
  for (const n of ir.nodes) {
    if (n.x == null || n.y == null || n.width == null || n.height == null) continue;

    const surrogate = isSurrogateId(n.id);
    const sgId = surrogate ? sgIdFromSurrogate(n.id) : null;

    const g = el('g') as SVGGElement;
    g.setAttribute('data-node-id', n.id);
    if (surrogate && sgId) g.setAttribute('data-surrogate-for', sgId);
    g.setAttribute('transform', `translate(${n.x - n.width / 2}, ${n.y - n.height / 2})`);
    g.style.cursor = 'grab';

    if (surrogate) {
      // "Stacked card" shadow behind the main rect (surrogates always use the
      // rounded-rect shape so the offset shadow lines up with the foreground).
      const shadow = el('rect');
      shadow.setAttribute('x', '4');
      shadow.setAttribute('y', '4');
      shadow.setAttribute('width', String(n.width));
      shadow.setAttribute('height', String(n.height));
      shadow.setAttribute('fill', '#cdd6ff');
      shadow.setAttribute('stroke', '#4a6cf7');
      shadow.setAttribute('stroke-width', '1.5');
      shadow.setAttribute('rx', '4');
      shadow.setAttribute('fill-opacity', '0.6');
      g.appendChild(shadow);
    }

    // Surrogates render as a rounded rect regardless of the underlying shape;
    // they're a disclosure affordance, not the node itself.
    const renderShape: NodeShape = surrogate ? 'round' : (n.shape ?? 'rect');
    const fill = surrogate ? '#e8edff' : 'white';
    const fillOpacity = surrogate ? '1' : '0.35';
    const stroke = '#4a6cf7';
    const strokeWidth = surrogate ? '2' : '1.5';
    const shapeEls = createShapeElements(renderShape, n.width, n.height, fill, fillOpacity, stroke, strokeWidth);
    for (const child of shapeEls) g.appendChild(child);

    const text = el('text');
    text.setAttribute('x', String(n.width / 2));
    text.setAttribute('y', String(n.height / 2));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    // Match the font layout.ts uses for label measurement. Mismatched font
    // would mean nodes are sized to fit a different text than what renders.
    text.setAttribute('font-size', '16');
    text.setAttribute('font-family', '"trebuchet ms", verdana, arial, sans-serif');
    text.setAttribute('fill', '#1a1a2e');
    text.textContent = n.label;

    g.appendChild(text);

    if (surrogate && sgId && originalIR) {
      const count = countHiddenDescendants(originalIR, sgId);
      const badge = el('text') as SVGTextElement;
      badge.setAttribute('x', String(n.width - 6));
      badge.setAttribute('y', '13');
      badge.setAttribute('text-anchor', 'end');
      badge.setAttribute('font-size', '10');
      badge.setAttribute('font-weight', 'bold');
      badge.setAttribute('fill', '#4a6cf7');
      badge.textContent = `(${count})`;
      g.appendChild(badge);
    }

    nodeGroup.appendChild(g);
  }
  mountEl.appendChild(nodeGroup);

  // Size the SVG to the actual layout extent + padding via fitSVG, in both
  // interactive and non-interactive modes. The prior interactive branch pinned
  // the SVG to a fixed 2400x1800 with no viewBox, which caused fixture200's
  // ~5020x5920 dagre output to extend off the right/bottom of the SVG by
  // default (the visible "horizontal sprawl" diagnosed 2026-05-25). Setting
  // width/height equal to viewBox dimensions preserves 1:1 SVG-local <-> model
  // coordinates, so pan.ts's screenToModel keeps working without changes.
  fitSVG(ir, mountEl);
}

// Live drag update — dotted center-to-center straight lines for each connected
// edge. Arrow tip + label are hidden during the drag (restored on mouseup).
export function updateNodePosition(
  nodeId: string,
  newX: number,
  newY: number,
  mountEl: SVGElement,
  ir: IR
): void {
  const node = ir.nodes.find(n => n.id === nodeId);
  if (!node || node.width == null || node.height == null) return;

  node.x = newX;
  node.y = newY;
  const nodeEl = mountEl.querySelector(`[data-node-id="${nodeId}"]`);
  if (nodeEl) {
    nodeEl.setAttribute('transform', `translate(${newX - node.width / 2}, ${newY - node.height / 2})`);
  }

  const meta: MountMeta = (mountEl as any).__meta;
  if (!meta) return;

  const connectedKeys = meta.adjacency.get(nodeId) || [];
  const edgeEntries = connectedKeys
    .map(k => ({ key: k, edge: meta.edgeMap.get(k) }))
    .filter((e): e is { key: string; edge: IREdge } => !!e.edge);

  // Bbox map for cluster-anchored peers — used by BOTH branches so the drag
  // preview's cluster-side endpoint stays on the drawn cluster border rather
  // than snapping to the rewritten leaf. Recomputed each tick because the
  // pivot's new position changes the cluster's bbox.
  const clusterBboxes = ir.subgraphs.length > 0 ? computeClusterBboxes(ir) : undefined;

  // Drag preview is branched by edgeMode so we can compare the three
  // strategies live without a layout reset.
  //   • 'side-aware' / 'astar' — distributed side-aware curves (current).
  //   • 'dagre'                — pre-76420cd straight center-to-center line.
  if (edgeSettings.edgeMode === 'dagre') {
    for (const { key, edge } of edgeEntries) {
      const fromNode = ir.nodes.find(n => n.id === edge.from);
      const toNode   = ir.nodes.find(n => n.id === edge.to);
      if (!fromNode || !toNode) continue;
      const sx = fromNode.x ?? 0;
      const sy = fromNode.y ?? 0;
      const tx = toNode.x   ?? 0;
      const ty = toNode.y   ?? 0;
      // For cluster-anchored peers, project the centre of the OTHER endpoint
      // onto the cluster bbox — mirrors layout.ts edge writeback and keeps
      // the dragged line stuck to the cluster border.
      const fromBbox = edge.fromCluster ? clusterBboxes?.get(edge.fromCluster) : undefined;
      const toBbox   = edge.toCluster   ? clusterBboxes?.get(edge.toCluster)   : undefined;
      const start = fromBbox ? clipToClusterRect(fromBbox, { x: tx, y: ty }) : { x: sx, y: sy };
      const end   = toBbox   ? clipToClusterRect(toBbox,   { x: sx, y: sy }) : { x: tx, y: ty };
      const pts = [start, end];
      meta.displayPoints.set(key, pts);
      meta.displayMode.set(key, 'straight');
      const dStr = `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
      const pathEl = mountEl.querySelector(`[data-edge-key="${key}"] .edge-path`) as SVGPathElement | null;
      if (pathEl) {
        pathEl.setAttribute('d', dStr);
        pathEl.setAttribute('stroke-dasharray', '4,4');
        pathEl.setAttribute('stroke', '#888');
      }
      const hitEl = mountEl.querySelector(`[data-edge-key="${key}"] .edge-hit-area`) as SVGPathElement | null;
      if (hitEl) hitEl.setAttribute('d', dStr);
      hideEdgeOverlays(mountEl, key);
    }
    updateSubgraphRects(meta);
    return;
  }

  // Side-aware / A* drag preview — distributed curves with Manhattan
  // midpoints. Computed in one pass so parallel edges on the same pivot side
  // fan out instead of stacking.
  const nodesById = new Map(ir.nodes.map(n => [n.id, n]));
  const curves = buildSideAwareCurvesForNode(
    node,
    edgeEntries.map(e => ({
      from: e.edge.from, to: e.edge.to, ref: e.key,
      fromCluster: e.edge.fromCluster, toCluster: e.edge.toCluster,
    })),
    nodesById,
    clusterBboxes,
  );

  for (const { key } of edgeEntries) {
    const pts = curves.get(key);
    if (!pts) continue;
    meta.displayPoints.set(key, pts);
    meta.displayMode.set(key, 'curve');

    const dStr = edgeCurvePath(pts);
    const pathEl = mountEl.querySelector(`[data-edge-key="${key}"] .edge-path`) as SVGPathElement | null;
    if (pathEl) {
      pathEl.setAttribute('d', dStr);
      pathEl.setAttribute('stroke-dasharray', '4,4');
      pathEl.setAttribute('stroke', '#888');
    }
    const hitEl = mountEl.querySelector(`[data-edge-key="${key}"] .edge-hit-area`) as SVGPathElement | null;
    if (hitEl) hitEl.setAttribute('d', dStr);

    hideEdgeOverlays(mountEl, key);
  }

  updateSubgraphRects(meta);
}

// Hide arrow + label while an edge is being previewed during drag.
function hideEdgeOverlays(mountEl: SVGElement, key: string): void {
  const arrowEl = mountEl.querySelector(`[data-edge-key="${key}"] .edge-arrow-line`) as SVGLineElement | null;
  if (arrowEl) arrowEl.setAttribute('display', 'none');
  const bgEl = mountEl.querySelector(`[data-edge-key="${key}"] .edge-label-bg`) as SVGElement | null;
  if (bgEl) bgEl.setAttribute('display', 'none');
  const textEl = mountEl.querySelector(`[data-edge-key="${key}"] .edge-label-text`) as SVGElement | null;
  if (textEl) textEl.setAttribute('display', 'none');
}

// Restore curved style on the given edges (called after A* re-route writes
// fresh `d`). Clears the dotted dragging style, unhides arrow and label,
// repositions the label to the midpoint of the new path.
export function restoreEdgeStyle(
  mountEl: SVGElement,
  edgeKeys: string[]
): void {
  const meta: MountMeta = (mountEl as any).__meta;
  if (!meta) return;
  for (const key of edgeKeys) {
    const edge = meta.edgeMap.get(key);
    if (!edge) continue;

    const pathEl = mountEl.querySelector(`[data-edge-key="${key}"] .edge-path`) as SVGPathElement | null;
    if (pathEl) {
      pathEl.setAttribute('stroke', '#333333');
      if (edge.style === 'dotted') pathEl.setAttribute('stroke-dasharray', '5,5');
      else pathEl.removeAttribute('stroke-dasharray');
    }

    const arrowEl = mountEl.querySelector(`[data-edge-key="${key}"] .edge-arrow-line`) as SVGLineElement | null;
    if (arrowEl) arrowEl.removeAttribute('display');

    const pts = meta.displayPoints.get(key);
    if (pts && pts.length > 0) {
      const mid = edgeLabelAnchor(edge, pts);
      const { w: labelW, h: labelH } = edgeLabelSize(edge.label ?? '');
      const bgEl = mountEl.querySelector(`[data-edge-key="${key}"] .edge-label-bg`) as SVGElement | null;
      if (bgEl) {
        bgEl.removeAttribute('display');
        bgEl.setAttribute('x', String(mid.x - labelW / 2));
        bgEl.setAttribute('y', String(mid.y - labelH / 2));
      }
      const textEl = mountEl.querySelector(`[data-edge-key="${key}"] .edge-label-text`) as SVGElement | null;
      if (textEl) {
        textEl.removeAttribute('display');
        textEl.setAttribute('x', String(mid.x));
        textEl.setAttribute('y', String(mid.y));
        textEl.querySelectorAll('tspan').forEach(t => t.setAttribute('x', String(mid.x)));
      }
    }
  }
}

// Set a freshly routed path on a single edge: update displayPoints, the <path>
// `d`, and the arrow tip. A* paths are always rendered as straight segments.
export function applyRoutedPath(
  mountEl: SVGElement,
  key: string,
  pts: { x: number; y: number }[]
): void {
  const meta: MountMeta = (mountEl as any).__meta;
  if (!meta) return;
  meta.displayPoints.set(key, pts);
  meta.displayMode.set(key, 'straight');

  const pathEl = mountEl.querySelector(`[data-edge-key="${key}"] .edge-path`) as SVGPathElement | null;
  if (pathEl) pathEl.setAttribute('d', edgeStraightPath(pts));
  const hitEl = mountEl.querySelector(`[data-edge-key="${key}"] .edge-hit-area`) as SVGPathElement | null;
  if (hitEl) hitEl.setAttribute('d', edgeStraightPath(pts));

  const arrowEl = mountEl.querySelector(`[data-edge-key="${key}"] .edge-arrow-line`) as SVGLineElement | null;
  if (arrowEl) updateArrowLine(arrowEl, pts);
}

// Called by Reset Layout: redraw every edge from its IR points, snap nodes to
// IR positions, refresh subgraph rects.
export function refreshEdgesFromLayout(mountEl: SVGElement): void {
  const meta: MountMeta = (mountEl as any).__meta;
  if (!meta) return;

  for (const e of meta.ir.edges) {
    const key = edgeKey(e);
    const ep = initialEdgePoints(e);
    if (!ep) continue;
    const pts = ep.pts;
    meta.displayPoints.set(key, pts);
    meta.displayMode.set(key, ep.mode);

    const pathEl = mountEl.querySelector(`[data-edge-key="${key}"] .edge-path`) as SVGPathElement | null;
    if (pathEl) {
      pathEl.setAttribute('d', edgePathString(ep));
      pathEl.setAttribute('stroke', '#333333');
      if (e.style === 'dotted') pathEl.setAttribute('stroke-dasharray', '5,5');
      else pathEl.removeAttribute('stroke-dasharray');
    }
    const hitEl = mountEl.querySelector(`[data-edge-key="${key}"] .edge-hit-area`) as SVGPathElement | null;
    if (hitEl) hitEl.setAttribute('d', edgePathString(ep));

    const arrowEl = mountEl.querySelector(`[data-edge-key="${key}"] .edge-arrow-line`) as SVGLineElement | null;
    if (arrowEl) { arrowEl.removeAttribute('display'); updateArrowLine(arrowEl, pts); }

    // Same anchor rule as initial render. After a side-aware drag the rebuilt
    // path is a 2-point line, so edgeLabelAnchor takes the arc-length middle
    // instead of the middle-index waypoint — which would be the arrowhead (the
    // old drag-jump bug).
    const mid = edgeLabelAnchor(e, pts);
    const { w: labelW, h: labelH } = edgeLabelSize(e.label ?? '');
    const bgEl = mountEl.querySelector(`[data-edge-key="${key}"] .edge-label-bg`) as SVGElement | null;
    if (bgEl) {
      bgEl.removeAttribute('display');
      bgEl.setAttribute('x', String(mid.x - labelW / 2));
      bgEl.setAttribute('y', String(mid.y - labelH / 2));
    }
    const textEl = mountEl.querySelector(`[data-edge-key="${key}"] .edge-label-text`) as SVGElement | null;
    if (textEl) {
      textEl.removeAttribute('display');
      textEl.setAttribute('x', String(mid.x));
      textEl.setAttribute('y', String(mid.y));
      textEl.querySelectorAll('tspan').forEach(t => t.setAttribute('x', String(mid.x)));
    }
  }

  for (const n of meta.ir.nodes) {
    if (n.x == null || n.y == null || n.width == null || n.height == null) continue;
    const nodeEl = mountEl.querySelector(`[data-node-id="${n.id}"]`);
    if (nodeEl) {
      nodeEl.setAttribute('transform', `translate(${n.x - n.width / 2}, ${n.y - n.height / 2})`);
    }
  }

  updateSubgraphRects(meta);
}

function updateSubgraphRects(meta: MountMeta): void {
  if (meta.ir.subgraphs.length === 0) return;
  const bboxMap = computeClusterBboxes(meta.ir);
  for (const sg of meta.ir.subgraphs) {
    const bbox = bboxMap.get(sg.id);
    const rect = meta.subgraphRects.get(sg.id);
    const text = meta.subgraphLabels.get(sg.id);
    if (!bbox || !rect) continue;
    rect.setAttribute('x', String(bbox.x));
    rect.setAttribute('y', String(bbox.y));
    rect.setAttribute('width', String(bbox.w));
    rect.setAttribute('height', String(bbox.h));
    if (text) {
      const dx = (text as unknown as { __labelDx?: number }).__labelDx ?? 0;
      text.setAttribute('x', String(bbox.x + bbox.w / 2 + dx));
      text.setAttribute('y', String(bbox.y + 18));
    }
  }
}

// Paint subgraph rects shallow-first so the DEEPEST cluster ends up on top and
// receives clicks. The previous "no-parent before has-parent" partition was
// insufficient for ≥3 levels: Mermaid's getSubGraphs() emits subgraphs
// inner-first (post-order), so a stable partition leaves an intermediate
// cluster (e.g. cyc3's `Apps`) painted AFTER its own nested children
// (`ProdA`/`ProdB`) — the parent rect then sits on top and swallows every
// collapse click meant for the children. Sorting by nesting depth (number of
// ancestors) fixes the z-order: outer clusters underneath, inner clusters on
// top, so `closest('[data-subgraph-id]')` resolves to the innermost rect.
function sortSubgraphsOuterFirst(subgraphs: IRSubgraph[]): IRSubgraph[] {
  const byId = new Map(subgraphs.map(s => [s.id, s]));
  const depthOf = (sg: IRSubgraph): number => {
    let d = 0;
    let cur = sg.parent;
    while (cur) {
      const p = byId.get(cur);
      if (!p) break;
      d++;
      cur = p.parent;
    }
    return d;
  };
  return [...subgraphs].sort((a, b) => depthOf(a) - depthOf(b));
}

function fitSVG(ir: IR, mountEl: SVGElement): void {
  const allX = ir.nodes.filter(n => n.x != null && n.width != null).flatMap(n => [n.x! - n.width! / 2, n.x! + n.width! / 2]);
  const allY = ir.nodes.filter(n => n.y != null && n.height != null).flatMap(n => [n.y! - n.height! / 2, n.y! + n.height! / 2]);
  if (!allX.length) return;

  const pad = 40;
  const minX = Math.min(...allX) - pad;
  const minY = Math.min(...allY) - pad;
  const maxX = Math.max(...allX) + pad;
  const maxY = Math.max(...allY) + pad;
  const w = maxX - minX;
  const h = maxY - minY;

  mountEl.setAttribute('viewBox', `${minX} ${minY} ${w} ${h}`);
  mountEl.setAttribute('width', String(w));
  mountEl.setAttribute('height', String(h));
}

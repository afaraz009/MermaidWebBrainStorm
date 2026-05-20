import { line, curveBasis } from 'd3-shape';
import type { IR, IREdge, IRSubgraph, IRNode, NodeShape } from './types.js';
import {
  clipToBorder,
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

const SVG_NS = 'http://www.w3.org/2000/svg';
const PADDING = 20;
const ARROW_TIP_LEN = 10;
const ARROW_MARKER_ID = 'arrow';

// '::' is safe — Mermaid node IDs never contain it.
export function edgeKey(from: string, to: string): string {
  return `${from}::${to}`;
}

interface BBox { x: number; y: number; w: number; h: number }

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
export function buildSideAwareCurvesForNode(
  pivotNode: IRNode,
  edges: { from: string; to: string; ref: unknown }[],
  nodesById: Map<string, IRNode>,
  stubDist = 16,
): Map<unknown, { x: number; y: number }[]> {
  type Item = { ref: unknown; peer: IRNode; isOutgoing: boolean };
  const bySide: Record<Side, Item[]> = { top: [], bottom: [], left: [], right: [] };
  const overlapItems: Item[] = [];

  for (const e of edges) {
    const isOutgoing = e.from === pivotNode.id;
    const peerId = isOutgoing ? e.to : e.from;
    const peer = nodesById.get(peerId);
    if (!peer) continue;
    const axis = classifyAxis(pivotNode, peer);
    if (axis === 'overlap') {
      overlapItems.push({ ref: e.ref, peer, isOutgoing });
    } else {
      const side = sideOnAxis(pivotNode, peer, axis);
      bySide[side].push({ ref: e.ref, peer, isOutgoing });
    }
  }

  const out = new Map<unknown, { x: number; y: number }[]>();

  // Overlap edges — radial clip-to-border on both endpoints. Smooth and
  // continuous; no side-snap. Stub away from each anchor along the local
  // outward normal so the basis curve has a defined tangent.
  for (const it of overlapItems) {
    const pivotCenter = { x: pivotNode.x ?? 0, y: pivotNode.y ?? 0 };
    const peerCenter  = { x: it.peer.x  ?? 0, y: it.peer.y  ?? 0 };
    const pivotAnchor = clipToBorder(pivotNode, peerCenter);
    const peerAnchor  = clipToBorder(it.peer,   pivotCenter);
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
    items.sort((a, b) =>
      horizontal
        ? (a.peer.x ?? 0) - (b.peer.x ?? 0)
        : (a.peer.y ?? 0) - (b.peer.y ?? 0),
    );

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
      // returns the actual outline intersection.
      const pcx = items[i].peer.x ?? 0;
      const pcy = items[i].peer.y ?? 0;
      const phw = (items[i].peer.width ?? 80) / 2;
      const phh = (items[i].peer.height ?? 40) / 2;
      let peerVirtual: { x: number; y: number };
      switch (peerSide) {
        case 'top':    peerVirtual = { x: pcx,           y: pcy - phh * 2 }; break;
        case 'bottom': peerVirtual = { x: pcx,           y: pcy + phh * 2 }; break;
        case 'left':   peerVirtual = { x: pcx - phw * 2, y: pcy            }; break;
        case 'right':  peerVirtual = { x: pcx + phw * 2, y: pcy            }; break;
      }
      const peerAnchor = clipToBorder(items[i].peer, peerVirtual);
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

  const bboxMap = computeSubgraphBboxes(ir);

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

    const text = el('text') as SVGTextElement;
    text.setAttribute('x', String(bbox.x + bbox.w / 2));
    text.setAttribute('y', String(bbox.y + 14));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('font-size', '12');
    text.setAttribute('font-weight', 'bold');
    text.setAttribute('fill', '#495057');
    text.setAttribute('class', 'sg-header');
    text.textContent = sg.label + '  ▾';

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
    const key = edgeKey(e.from, e.to);
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
    const key = edgeKey(e.from, e.to);
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
      const mid = pts[Math.floor(pts.length / 2)];
      const labelW = e.label.length * 7 + 8;
      const labelH = 16;
      const bg = el('rect');
      bg.setAttribute('class', 'edge-label-bg');
      bg.setAttribute('x', String(mid.x - labelW / 2));
      bg.setAttribute('y', String(mid.y - labelH - 4));
      bg.setAttribute('width', String(labelW));
      bg.setAttribute('height', String(labelH));
      bg.setAttribute('fill', 'white');
      bg.setAttribute('opacity', '0.5');
      const text = el('text');
      text.setAttribute('class', 'edge-label-text');
      text.setAttribute('x', String(mid.x));
      text.setAttribute('y', String(mid.y - 6));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-size', '11');
      text.setAttribute('fill', '#333');
      text.textContent = e.label;
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
    text.setAttribute('font-size', '13');
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

  if (interactive) {
    mountEl.removeAttribute('viewBox');
    mountEl.setAttribute('width', '2400');
    mountEl.setAttribute('height', '1800');
  } else {
    fitSVG(ir, mountEl);
  }
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
      const pts = [{ x: sx, y: sy }, { x: tx, y: ty }];
      meta.displayPoints.set(key, pts);
      meta.displayMode.set(key, 'straight');
      const dStr = `M ${sx} ${sy} L ${tx} ${ty}`;
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
    edgeEntries.map(e => ({ from: e.edge.from, to: e.edge.to, ref: e.key })),
    nodesById,
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
      const mid = pts[Math.floor(pts.length / 2)];
      const labelW = (edge.label?.length ?? 0) * 7 + 8;
      const bgEl = mountEl.querySelector(`[data-edge-key="${key}"] .edge-label-bg`) as SVGElement | null;
      if (bgEl) {
        bgEl.removeAttribute('display');
        bgEl.setAttribute('x', String(mid.x - labelW / 2));
        bgEl.setAttribute('y', String(mid.y - 20));
      }
      const textEl = mountEl.querySelector(`[data-edge-key="${key}"] .edge-label-text`) as SVGElement | null;
      if (textEl) {
        textEl.removeAttribute('display');
        textEl.setAttribute('x', String(mid.x));
        textEl.setAttribute('y', String(mid.y - 6));
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
    const key = edgeKey(e.from, e.to);
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

    const mid = pts[Math.floor(pts.length / 2)];
    const labelW = (e.label?.length ?? 0) * 7 + 8;
    const bgEl = mountEl.querySelector(`[data-edge-key="${key}"] .edge-label-bg`) as SVGElement | null;
    if (bgEl) {
      bgEl.removeAttribute('display');
      bgEl.setAttribute('x', String(mid.x - labelW / 2));
      bgEl.setAttribute('y', String(mid.y - 20));
    }
    const textEl = mountEl.querySelector(`[data-edge-key="${key}"] .edge-label-text`) as SVGElement | null;
    if (textEl) {
      textEl.removeAttribute('display');
      textEl.setAttribute('x', String(mid.x));
      textEl.setAttribute('y', String(mid.y - 6));
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
  const bboxMap = computeSubgraphBboxes(meta.ir);
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
      text.setAttribute('x', String(bbox.x + bbox.w / 2));
      text.setAttribute('y', String(bbox.y + 14));
    }
  }
}

function computeSubgraphBboxes(ir: IR): Map<string, BBox> {
  const map = new Map<string, BBox>();
  const sgById = new Map(ir.subgraphs.map(sg => [sg.id, sg]));

  function bboxForSg(sgId: string): BBox | null {
    if (map.has(sgId)) return map.get(sgId)!;
    const sg = sgById.get(sgId);
    if (!sg) return null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const childId of sg.children) {
      const n = ir.nodes.find(n => n.id === childId);
      if (!n || n.x == null || n.y == null || n.width == null || n.height == null) continue;
      minX = Math.min(minX, n.x - n.width / 2);
      minY = Math.min(minY, n.y - n.height / 2);
      maxX = Math.max(maxX, n.x + n.width / 2);
      maxY = Math.max(maxY, n.y + n.height / 2);
    }

    for (const nested of ir.subgraphs.filter(s => s.parent === sgId)) {
      const nb = bboxForSg(nested.id);
      if (!nb) continue;
      minX = Math.min(minX, nb.x);
      minY = Math.min(minY, nb.y);
      maxX = Math.max(maxX, nb.x + nb.w);
      maxY = Math.max(maxY, nb.y + nb.h);
    }

    if (!isFinite(minX)) return null;

    const bbox: BBox = {
      x: minX - PADDING,
      y: minY - PADDING - 10,
      w: maxX - minX + PADDING * 2,
      h: maxY - minY + PADDING * 2 + 10,
    };
    map.set(sgId, bbox);
    return bbox;
  }

  for (const sg of ir.subgraphs) bboxForSg(sg.id);
  return map;
}

function sortSubgraphsOuterFirst(subgraphs: IRSubgraph[]): IRSubgraph[] {
  return [...subgraphs].sort((a, b) => {
    if (!a.parent && b.parent) return -1;
    if (a.parent && !b.parent) return 1;
    return 0;
  });
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

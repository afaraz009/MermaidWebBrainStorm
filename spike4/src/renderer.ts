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

// Pick the points used for initial render: prefer A*-routed waypoints if the
// edge has been re-routed, else dagre's originalPoints. Both modes render as
// straight polyline segments — Mermaid's default edge interpolation is
// `linear`, so curveBasis-style smoothing here makes our renderer drift away
// from the reference. (A* output also requires straight segments; the curve
// branch exists only for callers that explicitly opt in.)
type EdgePoints = { pts: { x: number; y: number }[]; mode: 'curve' | 'straight' };
function initialEdgePoints(e: IREdge): EdgePoints | undefined {
  if (e.routedPath && e.routedPath.length >= 2) {
    return { pts: e.routedPath.map(p => ({ ...p })), mode: 'straight' };
  }
  if (e.originalPoints && e.originalPoints.length > 0) {
    return { pts: e.originalPoints.map(p => ({ ...p })), mode: 'straight' };
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
  markerPath.setAttribute('fill', '#555');
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
    path.setAttribute('stroke', '#555');
    path.setAttribute('stroke-width', '1.5');
    // Visible stroke is the same logical edge for hover styling, but
    // pointer-events go through to the wider hit area underneath.
    path.setAttribute('pointer-events', 'none');
    if (e.style === 'dotted') {
      path.setAttribute('stroke-dasharray', '5,5');
    }
    g.appendChild(path);

    const arrowLine = el('line') as SVGLineElement;
    arrowLine.setAttribute('class', 'edge-arrow-line');
    arrowLine.setAttribute('stroke', '#555');
    arrowLine.setAttribute('stroke-width', '1.5');
    arrowLine.setAttribute('marker-end', `url(#${ARROW_MARKER_ID})`);
    arrowLine.setAttribute('pointer-events', 'none');
    if (e.style === 'dotted') {
      arrowLine.setAttribute('stroke-dasharray', 'none');
    }
    updateArrowLine(arrowLine, pts);
    g.appendChild(arrowLine);

    if (e.label) {
      const mid = pts[Math.floor(pts.length / 2)];
      const bg = el('rect');
      bg.setAttribute('class', 'edge-label-bg');
      bg.setAttribute('x', String(mid.x - 20));
      bg.setAttribute('y', String(mid.y - 20));
      bg.setAttribute('width', '40');
      bg.setAttribute('height', '16');
      bg.setAttribute('fill', 'white');
      bg.setAttribute('opacity', '0.8');
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
  for (const key of connectedKeys) {
    const edge = meta.edgeMap.get(key);
    if (!edge) continue;
    const fromNode = ir.nodes.find(n => n.id === edge.from);
    const toNode   = ir.nodes.find(n => n.id === edge.to);
    if (!fromNode || !toNode) continue;

    const sx = fromNode.x ?? 0;
    const sy = fromNode.y ?? 0;
    const tx = toNode.x   ?? 0;
    const ty = toNode.y   ?? 0;
    const pts = [{ x: sx, y: sy }, { x: tx, y: ty }];
    meta.displayPoints.set(key, pts);

    const pathEl = mountEl.querySelector(`[data-edge-key="${key}"] .edge-path`) as SVGPathElement | null;
    if (pathEl) {
      pathEl.setAttribute('d', `M ${sx} ${sy} L ${tx} ${ty}`);
      pathEl.setAttribute('stroke-dasharray', '4,4');
      pathEl.setAttribute('stroke', '#888');
    }
    const hitEl = mountEl.querySelector(`[data-edge-key="${key}"] .edge-hit-area`) as SVGPathElement | null;
    if (hitEl) hitEl.setAttribute('d', `M ${sx} ${sy} L ${tx} ${ty}`);

    // Hide arrow + label during drag
    const arrowEl = mountEl.querySelector(`[data-edge-key="${key}"] .edge-arrow-line`) as SVGLineElement | null;
    if (arrowEl) arrowEl.setAttribute('display', 'none');
    const bgEl = mountEl.querySelector(`[data-edge-key="${key}"] .edge-label-bg`) as SVGElement | null;
    if (bgEl) bgEl.setAttribute('display', 'none');
    const textEl = mountEl.querySelector(`[data-edge-key="${key}"] .edge-label-text`) as SVGElement | null;
    if (textEl) textEl.setAttribute('display', 'none');
  }

  updateSubgraphRects(meta);
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
      pathEl.setAttribute('stroke', '#555');
      if (edge.style === 'dotted') pathEl.setAttribute('stroke-dasharray', '5,5');
      else pathEl.removeAttribute('stroke-dasharray');
    }

    const arrowEl = mountEl.querySelector(`[data-edge-key="${key}"] .edge-arrow-line`) as SVGLineElement | null;
    if (arrowEl) arrowEl.removeAttribute('display');

    const pts = meta.displayPoints.get(key);
    if (pts && pts.length > 0) {
      const mid = pts[Math.floor(pts.length / 2)];
      const bgEl = mountEl.querySelector(`[data-edge-key="${key}"] .edge-label-bg`) as SVGElement | null;
      if (bgEl) {
        bgEl.removeAttribute('display');
        bgEl.setAttribute('x', String(mid.x - 20));
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
      pathEl.setAttribute('stroke', '#555');
      if (e.style === 'dotted') pathEl.setAttribute('stroke-dasharray', '5,5');
      else pathEl.removeAttribute('stroke-dasharray');
    }
    const hitEl = mountEl.querySelector(`[data-edge-key="${key}"] .edge-hit-area`) as SVGPathElement | null;
    if (hitEl) hitEl.setAttribute('d', edgePathString(ep));

    const arrowEl = mountEl.querySelector(`[data-edge-key="${key}"] .edge-arrow-line`) as SVGLineElement | null;
    if (arrowEl) { arrowEl.removeAttribute('display'); updateArrowLine(arrowEl, pts); }

    const mid = pts[Math.floor(pts.length / 2)];
    const bgEl = mountEl.querySelector(`[data-edge-key="${key}"] .edge-label-bg`) as SVGElement | null;
    if (bgEl) {
      bgEl.removeAttribute('display');
      bgEl.setAttribute('x', String(mid.x - 20));
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

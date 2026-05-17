import { line, curveBasis } from 'd3-shape';
import type { IR, IREdge, IRSubgraph, IRNode } from './types.js';
import { clipToBorder } from './border.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const PADDING = 20;
const ARROW_TIP_LEN = 10;
const ARROW_MARKER_ID = 'arrow';

// Safe edge key: uses '::' separator (node IDs in Mermaid cannot contain '::')
function edgeKey(from: string, to: string): string {
  return `${from}::${to}`;
}

interface BBox { x: number; y: number; w: number; h: number }

// Data attached to the mount element so drag can update edges and subgraphs
// without rebuilding the SVG. `originalPoints` holds the canonical dagre route
// — drag never touches it. `displayPoints` is the transient drag overlay used
// for the live SVG `d` attribute.
interface MountMeta {
  ir: IR;
  adjacency: Map<string, string[]>;     // nodeId -> edgeKey[]
  edgeMap: Map<string, IREdge>;         // edgeKey -> IREdge
  displayPoints: Map<string, { x: number; y: number }[]>; // edgeKey -> live points
  subgraphRects: Map<string, SVGRectElement>; // sgId -> <rect>
  subgraphLabels: Map<string, SVGTextElement>; // sgId -> <text>
}

function el(tag: string): SVGElement {
  return document.createElementNS(SVG_NS, tag) as SVGElement;
}

// Duplicate endpoints so curveBasis passes exactly through the first and last waypoint.
function anchoredPts(pts: { x: number; y: number }[]): { x: number; y: number }[] {
  return [pts[0], ...pts, pts[pts.length - 1]];
}

const curveGen = line<{ x: number; y: number }>().x(d => d.x).y(d => d.y).curve(curveBasis);

// Build the curveBasis path string. When there's an arrow, pull the last
// anchored point back by ARROW_TIP_LEN so the curve body stops just before the
// node border and the arrowhead covers the gap. Mirrors EdgePath.tsx in
// md-diagrams-testing.
function edgeCurvePath(pts: { x: number; y: number }[]): string {
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

// Drag-time edge geometry: 3-point waypoint set
// (sourceBorder → midpoint → targetBorder), shape-aware on both ends.
// Identical strategy to md-diagrams-testing's `displayLayout` override.
function dragWaypoints(fromNode: IRNode, toNode: IRNode): { x: number; y: number }[] {
  const fc = { x: fromNode.x ?? 0, y: fromNode.y ?? 0 };
  const tc = { x: toNode.x   ?? 0, y: toNode.y   ?? 0 };
  const start = clipToBorder(fromNode, tc);
  const end   = clipToBorder(toNode,   fc);
  const mid   = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  return [start, mid, end];
}

// Update the straight `<line>` that carries the arrow marker so the tip lands
// exactly on the node border at the last waypoint.
function updateArrowLine(
  lineEl: SVGLineElement,
  pts: { x: number; y: number }[]
): void {
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

export function renderFull(ir: IR, mountEl: SVGElement, interactive = false): void {
  mountEl.innerHTML = '';

  // overflow visible: nodes/edges dragged outside the initial viewBox stay visible
  mountEl.setAttribute('overflow', 'visible');
  mountEl.style.overflow = 'visible';

  // Arrow marker in <defs>
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

  // Layer 1: subgraphs (back, outer before inner)
  const sgGroup = el('g');
  sgGroup.setAttribute('class', 'subgraphs');
  const subgraphRects = new Map<string, SVGRectElement>();
  const subgraphLabels = new Map<string, SVGTextElement>();
  for (const sg of sortSubgraphsOuterFirst(ir.subgraphs)) {
    const bbox = bboxMap.get(sg.id);
    if (!bbox) continue;
    const g = el('g') as SVGGElement;
    g.setAttribute('data-subgraph-id', sg.id);

    const rect = el('rect') as SVGRectElement;
    rect.setAttribute('x', String(bbox.x));
    rect.setAttribute('y', String(bbox.y));
    rect.setAttribute('width', String(bbox.w));
    rect.setAttribute('height', String(bbox.h));
    rect.setAttribute('fill', '#f8f9fa');
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
    text.textContent = sg.label;

    g.appendChild(rect);
    g.appendChild(text);
    sgGroup.appendChild(g);
    subgraphRects.set(sg.id, rect);
    subgraphLabels.set(sg.id, text);
  }
  mountEl.appendChild(sgGroup);

  // Build adjacency, edge lookup, and the live displayPoints map.
  // displayPoints starts as a deep copy of originalPoints so the rendered
  // geometry equals the dagre route until a drag overrides it.
  const adjacency = new Map<string, string[]>();
  const edgeMap = new Map<string, IREdge>();
  const displayPoints = new Map<string, { x: number; y: number }[]>();

  for (const n of ir.nodes) adjacency.set(n.id, []);

  for (const e of ir.edges) {
    const key = edgeKey(e.from, e.to);
    edgeMap.set(key, e);
    adjacency.get(e.from)?.push(key);
    adjacency.get(e.to)?.push(key);
    if (e.originalPoints && e.originalPoints.length > 0) {
      displayPoints.set(key, e.originalPoints.map(p => ({ ...p })));
    }
  }

  const meta: MountMeta = {
    ir,
    adjacency,
    edgeMap,
    displayPoints,
    subgraphRects,
    subgraphLabels,
  };
  (mountEl as any).__meta = meta;

  // Layer 2: edges (middle)
  const edgeGroup = el('g');
  edgeGroup.setAttribute('class', 'edges');

  for (const e of ir.edges) {
    const key = edgeKey(e.from, e.to);
    const pts = displayPoints.get(key);
    if (!pts || pts.length === 0) continue;

    const g = el('g') as SVGGElement;
    g.setAttribute('data-edge-key', key);

    // Curved body
    const path = el('path');
    path.setAttribute('class', 'edge-path');
    path.setAttribute('d', edgeCurvePath(pts));
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#555');
    path.setAttribute('stroke-width', '1.5');
    if (e.style === 'dotted') {
      path.setAttribute('stroke-dasharray', '5,5');
    }
    g.appendChild(path);

    // Arrow tip
    const arrowLine = el('line') as SVGLineElement;
    arrowLine.setAttribute('class', 'edge-arrow-line');
    arrowLine.setAttribute('stroke', '#555');
    arrowLine.setAttribute('stroke-width', '1.5');
    arrowLine.setAttribute('marker-end', `url(#${ARROW_MARKER_ID})`);
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

  // Layer 3: nodes (front)
  const nodeGroup = el('g');
  nodeGroup.setAttribute('class', 'nodes');
  for (const n of ir.nodes) {
    if (n.x == null || n.y == null || n.width == null || n.height == null) continue;

    const g = el('g') as SVGGElement;
    g.setAttribute('data-node-id', n.id);
    g.setAttribute('transform', `translate(${n.x - n.width / 2}, ${n.y - n.height / 2})`);
    g.style.cursor = 'grab';

    const rect = el('rect');
    rect.setAttribute('width', String(n.width));
    rect.setAttribute('height', String(n.height));
    rect.setAttribute('fill', 'white');
    rect.setAttribute('stroke', '#4a6cf7');
    rect.setAttribute('stroke-width', '1.5');
    rect.setAttribute('rx', '4');

    const text = el('text');
    text.setAttribute('x', String(n.width / 2));
    text.setAttribute('y', String(n.height / 2));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.setAttribute('font-size', '13');
    text.setAttribute('fill', '#1a1a2e');
    text.textContent = n.label;

    g.appendChild(rect);
    g.appendChild(text);
    nodeGroup.appendChild(g);
  }
  mountEl.appendChild(nodeGroup);

  if (interactive) {
    // Interactive: large fixed canvas, no viewBox scaling.
    mountEl.removeAttribute('viewBox');
    mountEl.setAttribute('width', '2400');
    mountEl.setAttribute('height', '1800');
  } else {
    fitSVG(ir, mountEl);
  }
}

// Live drag update. Mutates only the visible SVG and `displayPoints` — the
// dagre route stored on `IREdge.originalPoints` is preserved so a re-layout
// (or simply releasing the drag) can restore the multi-waypoint shape.
export function updateNodePosition(
  nodeId: string,
  newX: number,
  newY: number,
  mountEl: SVGElement,
  ir: IR
): void {
  const node = ir.nodes.find(n => n.id === nodeId);
  if (!node || node.width == null || node.height == null) return;

  // Move the node logically and visually
  node.x = newX;
  node.y = newY;
  const nodeEl = mountEl.querySelector(`[data-node-id="${nodeId}"]`);
  if (nodeEl) {
    nodeEl.setAttribute('transform', `translate(${newX - node.width / 2}, ${newY - node.height / 2})`);
  }

  const meta: MountMeta = (mountEl as any).__meta;
  if (!meta) return;

  // Rebuild geometry only for edges incident to the dragged node
  const connectedKeys = meta.adjacency.get(nodeId) || [];
  for (const key of connectedKeys) {
    const edge = meta.edgeMap.get(key);
    if (!edge) continue;
    const fromNode = ir.nodes.find(n => n.id === edge.from);
    const toNode   = ir.nodes.find(n => n.id === edge.to);
    if (!fromNode || !toNode) continue;

    const pts = dragWaypoints(fromNode, toNode);
    meta.displayPoints.set(key, pts);

    const pathEl = mountEl.querySelector(`[data-edge-key="${key}"] .edge-path`);
    if (pathEl) pathEl.setAttribute('d', edgeCurvePath(pts));

    const arrowLineEl = mountEl.querySelector(`[data-edge-key="${key}"] .edge-arrow-line`) as SVGLineElement | null;
    if (arrowLineEl) updateArrowLine(arrowLineEl, pts);

    const mid = pts[Math.floor(pts.length / 2)];
    const bgEl = mountEl.querySelector(`[data-edge-key="${key}"] .edge-label-bg`);
    if (bgEl) {
      bgEl.setAttribute('x', String(mid.x - 20));
      bgEl.setAttribute('y', String(mid.y - 20));
    }
    const textEl = mountEl.querySelector(`[data-edge-key="${key}"] .edge-label-text`);
    if (textEl) {
      textEl.setAttribute('x', String(mid.x));
      textEl.setAttribute('y', String(mid.y - 6));
    }
  }

  // Subgraph rectangles must follow their children
  updateSubgraphRects(meta);
}

// Re-render every edge from its IR `originalPoints`. Called after drag release
// once `layout()` has produced fresh dagre waypoints — restores multi-waypoint
// curves.
export function refreshEdgesFromLayout(mountEl: SVGElement): void {
  const meta: MountMeta = (mountEl as any).__meta;
  if (!meta) return;

  for (const e of meta.ir.edges) {
    const key = edgeKey(e.from, e.to);
    if (!e.originalPoints || e.originalPoints.length === 0) continue;
    const pts = e.originalPoints.map(p => ({ ...p }));
    meta.displayPoints.set(key, pts);

    const pathEl = mountEl.querySelector(`[data-edge-key="${key}"] .edge-path`);
    if (pathEl) pathEl.setAttribute('d', edgeCurvePath(pts));

    const arrowLineEl = mountEl.querySelector(`[data-edge-key="${key}"] .edge-arrow-line`) as SVGLineElement | null;
    if (arrowLineEl) updateArrowLine(arrowLineEl, pts);

    const mid = pts[Math.floor(pts.length / 2)];
    const bgEl = mountEl.querySelector(`[data-edge-key="${key}"] .edge-label-bg`);
    if (bgEl) {
      bgEl.setAttribute('x', String(mid.x - 20));
      bgEl.setAttribute('y', String(mid.y - 20));
    }
    const textEl = mountEl.querySelector(`[data-edge-key="${key}"] .edge-label-text`);
    if (textEl) {
      textEl.setAttribute('x', String(mid.x));
      textEl.setAttribute('y', String(mid.y - 6));
    }
  }

  // Move every node element to its IR position (a node other than the dragged
  // one may have been re-ranked by dagre on the post-drag layout pass).
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

// --- helpers ---

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

import { line, curveBasis } from 'd3-shape';
import type { IR, IREdge, IRNode } from './types';

const SVG_NS = 'http://www.w3.org/2000/svg';

const lineGen = line<{ x: number; y: number }>()
  .curve(curveBasis)
  .x((d) => d.x)
  .y((d) => d.y);

export interface RenderState {
  svg: SVGSVGElement;
  ir: IR;
  adjacency: Map<string, string[]>;
  // For each subgraph, its direct child node IDs and direct child subgraph IDs.
  // Used to recompute bounds bottom-up when a descendant moves.
  subgraphChildren: Map<string, { nodeIds: string[]; subgraphIds: string[] }>;
  // For each leaf node, its parent subgraph chain (innermost first). Empty if at root.
  nodeAncestors: Map<string, string[]>;
}

const edgeKey = (e: { from: string; to: string }) => `${e.from}->${e.to}`;

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
}

function defs(): SVGDefsElement {
  const d = svgEl('defs');
  const marker = svgEl('marker');
  marker.setAttribute('id', 'arrow');
  marker.setAttribute('viewBox', '0 -5 10 10');
  marker.setAttribute('refX', '8');
  marker.setAttribute('refY', '0');
  marker.setAttribute('markerWidth', '8');
  marker.setAttribute('markerHeight', '8');
  marker.setAttribute('orient', 'auto');
  const path = svgEl('path');
  path.setAttribute('d', 'M0,-5L10,0L0,5');
  path.setAttribute('fill', '#555');
  marker.appendChild(path);
  d.appendChild(marker);
  return d;
}

function renderSubgraph(sg: IR['subgraphs'][number]): SVGGElement {
  const g = svgEl('g');
  g.setAttribute('data-subgraph-id', sg.id);
  const x = (sg.x ?? 0) - (sg.width ?? 0) / 2;
  const y = (sg.y ?? 0) - (sg.height ?? 0) / 2;
  const rect = svgEl('rect');
  rect.setAttribute('x', String(x));
  rect.setAttribute('y', String(y));
  rect.setAttribute('width', String(sg.width ?? 0));
  rect.setAttribute('height', String(sg.height ?? 0));
  rect.setAttribute('fill', 'rgba(120, 140, 200, 0.06)');
  rect.setAttribute('stroke', '#8a9bd0');
  rect.setAttribute('stroke-dasharray', '3,3');
  rect.setAttribute('rx', '6');
  g.appendChild(rect);

  const text = svgEl('text');
  text.setAttribute('x', String(x + 8));
  text.setAttribute('y', String(y + 16));
  text.setAttribute('font-size', '12');
  text.setAttribute('font-family', 'system-ui, sans-serif');
  text.setAttribute('fill', '#445');
  text.textContent = sg.label;
  g.appendChild(text);
  return g;
}

function renderNode(n: IRNode): SVGGElement {
  const g = svgEl('g');
  g.setAttribute('data-node-id', n.id);
  g.setAttribute('transform', `translate(${n.x ?? 0}, ${n.y ?? 0})`);
  g.style.cursor = 'grab';

  // TODO: switch on n.shape — cylinder/parallelogram/etc. Spike uses rectangles only.
  const w = n.width ?? 80;
  const h = n.height ?? 40;
  const rect = svgEl('rect');
  rect.setAttribute('x', String(-w / 2));
  rect.setAttribute('y', String(-h / 2));
  rect.setAttribute('width', String(w));
  rect.setAttribute('height', String(h));
  rect.setAttribute('rx', '4');
  rect.setAttribute('fill', '#fff');
  rect.setAttribute('stroke', '#333');
  rect.setAttribute('stroke-width', '1.5');
  g.appendChild(rect);

  const text = svgEl('text');
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('dominant-baseline', 'middle');
  text.setAttribute('font-size', '13');
  text.setAttribute('font-family', 'system-ui, sans-serif');
  text.setAttribute('fill', '#222');
  text.textContent = n.label;
  g.appendChild(text);
  return g;
}

function renderEdge(e: IREdge): SVGGElement {
  const g = svgEl('g');
  g.setAttribute('data-edge-id', edgeKey(e));
  const path = svgEl('path');
  const d = e.points && e.points.length >= 2 ? lineGen(e.points) : '';
  path.setAttribute('d', d ?? '');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', '#555');
  path.setAttribute('stroke-width', '1.5');
  path.setAttribute('marker-end', 'url(#arrow)');
  if (e.style === 'dotted') path.setAttribute('stroke-dasharray', '5,5');
  g.appendChild(path);

  if (e.label && e.points && e.points.length > 0) {
    const mid = e.points[Math.floor(e.points.length / 2)];
    const t = svgEl('text');
    t.setAttribute('x', String(mid.x));
    t.setAttribute('y', String(mid.y - 4));
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('font-size', '11');
    t.setAttribute('font-family', 'system-ui, sans-serif');
    t.setAttribute('fill', '#445');
    t.textContent = e.label;
    g.appendChild(t);
  }
  return g;
}

function computeBounds(ir: IR): { width: number; height: number } {
  let maxX = 0;
  let maxY = 0;
  for (const n of ir.nodes) {
    maxX = Math.max(maxX, (n.x ?? 0) + (n.width ?? 0) / 2);
    maxY = Math.max(maxY, (n.y ?? 0) + (n.height ?? 0) / 2);
  }
  for (const sg of ir.subgraphs) {
    maxX = Math.max(maxX, (sg.x ?? 0) + (sg.width ?? 0) / 2);
    maxY = Math.max(maxY, (sg.y ?? 0) + (sg.height ?? 0) / 2);
  }
  return { width: maxX + 40, height: maxY + 40 };
}

export function renderFull(ir: IR, mountEl: HTMLElement): RenderState {
  mountEl.innerHTML = '';
  const svg = svgEl('svg');
  const { width, height } = computeBounds(ir);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.style.background = '#fafafa';
  svg.appendChild(defs());

  // Order: subgraphs (outermost first) → edges → nodes.
  const sortedSubgraphs = [...ir.subgraphs].sort((a, b) => {
    const da = a.parentId ? 1 : 0;
    const db = b.parentId ? 1 : 0;
    return da - db;
  });
  for (const sg of sortedSubgraphs) svg.appendChild(renderSubgraph(sg));
  for (const e of ir.edges) svg.appendChild(renderEdge(e));
  for (const n of ir.nodes) svg.appendChild(renderNode(n));

  // Adjacency map for partial updates.
  const adjacency = new Map<string, string[]>();
  for (const e of ir.edges) {
    const k = edgeKey(e);
    if (!adjacency.has(e.from)) adjacency.set(e.from, []);
    if (!adjacency.has(e.to)) adjacency.set(e.to, []);
    adjacency.get(e.from)!.push(k);
    adjacency.get(e.to)!.push(k);
  }

  // Subgraph children map and per-node ancestor chain (innermost → outermost).
  const subgraphChildren = new Map<string, { nodeIds: string[]; subgraphIds: string[] }>();
  for (const sg of ir.subgraphs) {
    subgraphChildren.set(sg.id, { nodeIds: [...sg.childNodeIds], subgraphIds: [...sg.childSubgraphIds] });
  }
  const nodeAncestors = new Map<string, string[]>();
  const sgById = new Map(ir.subgraphs.map((s) => [s.id, s]));
  for (const n of ir.nodes) {
    const chain: string[] = [];
    let pid = n.parentId;
    while (pid) {
      chain.push(pid);
      pid = sgById.get(pid)?.parentId;
    }
    nodeAncestors.set(n.id, chain);
  }

  mountEl.appendChild(svg);
  return { svg, ir, adjacency, subgraphChildren, nodeAncestors };
}

// Where does the line from `from` to `to` exit `to`'s bounding rect? Returns the
// intersection with the rect border, or `to`'s center if `from` is inside the rect.
function rectAnchor(
  from: { x: number; y: number },
  to: { x: number; y: number; width: number; height: number },
): { x: number; y: number } {
  const dx = from.x - to.x;
  const dy = from.y - to.y;
  if (dx === 0 && dy === 0) return { x: to.x, y: to.y };
  const hw = to.width / 2;
  const hh = to.height / 2;
  // scale = how far along (from→to_center) we hit the box border.
  // Pick the smaller of the two axis-clipped scales.
  const sx = Math.abs(dx) > 0 ? hw / Math.abs(dx) : Infinity;
  const sy = Math.abs(dy) > 0 ? hh / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return { x: to.x + dx * s, y: to.y + dy * s };
}

// Build a clean two-point path for an edge during drag: anchor at each node's
// rectangle border, drop dagre's stale interior waypoints. curveBasis over two
// points degenerates to a straight line — fine, looks natural.
// Returns both the path `d` string and the midpoint, so the label can follow.
function liveDragPath(
  e: IREdge,
  fromNode: IRNode,
  toNode: IRNode,
): { d: string; mid: { x: number; y: number } } {
  const fromCenter = { x: fromNode.x ?? 0, y: fromNode.y ?? 0 };
  const toCenter = { x: toNode.x ?? 0, y: toNode.y ?? 0 };
  const fromAnchor = rectAnchor(toCenter, {
    x: fromCenter.x,
    y: fromCenter.y,
    width: fromNode.width ?? 80,
    height: fromNode.height ?? 40,
  });
  const toAnchor = rectAnchor(fromCenter, {
    x: toCenter.x,
    y: toCenter.y,
    width: toNode.width ?? 80,
    height: toNode.height ?? 40,
  });
  return {
    d: lineGen([fromAnchor, toAnchor]) ?? '',
    mid: { x: (fromAnchor.x + toAnchor.x) / 2, y: (fromAnchor.y + toAnchor.y) / 2 },
  };
}

// Padding inside a subgraph's recomputed bounds (around children + label area).
const SUBGRAPH_PADDING = 16;
const SUBGRAPH_LABEL_TOP = 22;

// Recompute one subgraph's bounds from the current positions of its direct children
// (both leaf nodes and child subgraphs). Mutates the IR in place AND updates the SVG.
function recomputeSubgraphBounds(state: RenderState, sgId: string): void {
  const sg = state.ir.subgraphs.find((s) => s.id === sgId);
  const kids = state.subgraphChildren.get(sgId);
  if (!sg || !kids) return;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const childNodeId of kids.nodeIds) {
    const n = state.ir.nodes.find((nn) => nn.id === childNodeId);
    if (!n || n.x === undefined || n.y === undefined) continue;
    const w = n.width ?? 80, h = n.height ?? 40;
    minX = Math.min(minX, n.x - w / 2);
    minY = Math.min(minY, n.y - h / 2);
    maxX = Math.max(maxX, n.x + w / 2);
    maxY = Math.max(maxY, n.y + h / 2);
  }
  for (const childSgId of kids.subgraphIds) {
    const c = state.ir.subgraphs.find((s) => s.id === childSgId);
    if (!c || c.x === undefined || c.y === undefined) continue;
    const w = c.width ?? 0, h = c.height ?? 0;
    minX = Math.min(minX, c.x - w / 2);
    minY = Math.min(minY, c.y - h / 2);
    maxX = Math.max(maxX, c.x + w / 2);
    maxY = Math.max(maxY, c.y + h / 2);
  }

  if (!isFinite(minX)) return; // no children with positions

  const x = minX - SUBGRAPH_PADDING;
  const y = minY - SUBGRAPH_PADDING - SUBGRAPH_LABEL_TOP;
  const width = (maxX - minX) + SUBGRAPH_PADDING * 2;
  const height = (maxY - minY) + SUBGRAPH_PADDING * 2 + SUBGRAPH_LABEL_TOP;
  sg.x = x + width / 2;
  sg.y = y + height / 2;
  sg.width = width;
  sg.height = height;

  // Update the SVG: rect attributes + label position.
  const g = state.svg.querySelector(`[data-subgraph-id="${sgId}"]`) as SVGGElement | null;
  if (!g) return;
  const rect = g.querySelector('rect');
  if (rect) {
    rect.setAttribute('x', String(x));
    rect.setAttribute('y', String(y));
    rect.setAttribute('width', String(width));
    rect.setAttribute('height', String(height));
  }
  const text = g.querySelector('text');
  if (text) {
    text.setAttribute('x', String(x + 8));
    text.setAttribute('y', String(y + 16));
  }
}

// Live drag tick: move the node, redraw connected edges as straight rect-anchored
// segments (no stale waypoints), and grow ancestor subgraphs to contain the node.
export function updateNodePosition(
  state: RenderState,
  nodeId: string,
  newX: number,
  newY: number,
): void {
  const node = state.ir.nodes.find((n) => n.id === nodeId);
  if (!node) return;
  node.x = newX;
  node.y = newY;

  const g = state.svg.querySelector(`[data-node-id="${nodeId}"]`) as SVGGElement | null;
  if (g) g.setAttribute('transform', `translate(${newX}, ${newY})`);

  // Walk up the parent chain bottom-up, recomputing each ancestor's bounds from its
  // direct children. Inner subgraphs settle first so outer subgraphs see their
  // updated sizes.
  const ancestors = state.nodeAncestors.get(nodeId) ?? [];
  for (const sgId of ancestors) recomputeSubgraphBounds(state, sgId);

  const keys = state.adjacency.get(nodeId) ?? [];
  for (const k of keys) {
    const e = state.ir.edges.find((ed) => edgeKey(ed) === k);
    if (!e) continue;
    const fromNode = state.ir.nodes.find((n) => n.id === e.from);
    const toNode = state.ir.nodes.find((n) => n.id === e.to);
    if (!fromNode || !toNode) continue;
    const edgeGroup = state.svg.querySelector(`[data-edge-id="${k}"]`) as SVGGElement | null;
    if (!edgeGroup) continue;
    const { d, mid } = liveDragPath(e, fromNode, toNode);
    const path = edgeGroup.querySelector('path');
    if (path) path.setAttribute('d', d);
    const label = edgeGroup.querySelector('text');
    if (label) {
      label.setAttribute('x', String(mid.x));
      label.setAttribute('y', String(mid.y - 4));
    }
  }
}


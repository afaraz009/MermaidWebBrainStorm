import { line, curveLinear } from 'd3-shape';
import type { IR, IREdge, IRNode } from './types';
import { CELL, buildBlockedMask, type Obstacle } from './astar';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Edges use curveLinear: raw waypoints, sharp corners, true to the A* grid.
const lineGen = line<{ x: number; y: number }>()
  .curve(curveLinear)
  .x((d) => d.x)
  .y((d) => d.y);

const straightGen = line<{ x: number; y: number }>()
  .x((d) => d.x)
  .y((d) => d.y);

export interface RenderState {
  svg: SVGSVGElement;
  ir: IR;
  adjacency: Map<string, string[]>;
  subgraphChildren: Map<string, { nodeIds: string[]; subgraphIds: string[] }>;
  nodeAncestors: Map<string, string[]>;
}

export const edgeKey = (e: { from: string; to: string }) => `${e.from}->${e.to}`;

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
  const pts = e.routedPath && e.routedPath.length >= 2 ? e.routedPath
            : e.points && e.points.length >= 2 ? e.points
            : null;
  const d = pts ? lineGen(pts) : '';
  path.setAttribute('d', d ?? '');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', '#555');
  path.setAttribute('stroke-width', '1.5');
  path.setAttribute('marker-end', 'url(#arrow)');
  if (e.style === 'dotted') path.setAttribute('stroke-dasharray', '5,5');
  g.appendChild(path);

  if (e.label && pts && pts.length > 0) {
    const mid = pts[Math.floor(pts.length / 2)];
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

  const sortedSubgraphs = [...ir.subgraphs].sort((a, b) => {
    const da = a.parentId ? 1 : 0;
    const db = b.parentId ? 1 : 0;
    return da - db;
  });
  for (const sg of sortedSubgraphs) svg.appendChild(renderSubgraph(sg));
  for (const e of ir.edges) svg.appendChild(renderEdge(e));
  for (const n of ir.nodes) svg.appendChild(renderNode(n));

  const adjacency = new Map<string, string[]>();
  for (const e of ir.edges) {
    const k = edgeKey(e);
    if (!adjacency.has(e.from)) adjacency.set(e.from, []);
    if (!adjacency.has(e.to)) adjacency.set(e.to, []);
    adjacency.get(e.from)!.push(k);
    adjacency.get(e.to)!.push(k);
  }

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

// Rectangle border anchor: where does the line from `from` to `to`'s center enter `to`?
export function rectAnchor(
  from: { x: number; y: number },
  to: { x: number; y: number; width: number; height: number },
): { x: number; y: number } {
  const dx = from.x - to.x;
  const dy = from.y - to.y;
  if (dx === 0 && dy === 0) return { x: to.x, y: to.y };
  const hw = to.width / 2;
  const hh = to.height / 2;
  const sx = Math.abs(dx) > 0 ? hw / Math.abs(dx) : Infinity;
  const sy = Math.abs(dy) > 0 ? hh / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return { x: to.x + dx * s, y: to.y + dy * s };
}

const SUBGRAPH_PADDING = 16;
const SUBGRAPH_LABEL_TOP = 22;

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

  if (!isFinite(minX)) return;

  const x = minX - SUBGRAPH_PADDING;
  const y = minY - SUBGRAPH_PADDING - SUBGRAPH_LABEL_TOP;
  const width = (maxX - minX) + SUBGRAPH_PADDING * 2;
  const height = (maxY - minY) + SUBGRAPH_PADDING * 2 + SUBGRAPH_LABEL_TOP;
  sg.x = x + width / 2;
  sg.y = y + height / 2;
  sg.width = width;
  sg.height = height;

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

// During-drag styling: straight dotted line, hidden label. Saves original attrs.
function applyDraggingStyle(edgeGroup: SVGGElement, fromNode: IRNode, toNode: IRNode): void {
  const path = edgeGroup.querySelector('path') as SVGPathElement | null;
  if (!path) return;
  if (path.dataset.origStroke === undefined) {
    path.dataset.origStroke = path.getAttribute('stroke') ?? '#555';
    path.dataset.origDash = path.getAttribute('stroke-dasharray') ?? '';
    path.dataset.origMarker = path.getAttribute('marker-end') ?? '';
  }
  const a = { x: fromNode.x ?? 0, y: fromNode.y ?? 0 };
  const b = { x: toNode.x ?? 0, y: toNode.y ?? 0 };
  path.setAttribute('d', straightGen([a, b]) ?? '');
  path.setAttribute('stroke', '#aaa');
  path.setAttribute('stroke-dasharray', '4,4');
  path.removeAttribute('marker-end');
  const label = edgeGroup.querySelector('text');
  if (label) (label as SVGTextElement).style.display = 'none';
}

function restoreEdgeStyle(edgeGroup: SVGGElement): void {
  const path = edgeGroup.querySelector('path') as SVGPathElement | null;
  if (!path) return;
  if (path.dataset.origStroke !== undefined) {
    path.setAttribute('stroke', path.dataset.origStroke);
    if (path.dataset.origDash) path.setAttribute('stroke-dasharray', path.dataset.origDash);
    else path.removeAttribute('stroke-dasharray');
    // Restore marker-end unconditionally (empty origMarker means remove it, not keep blank).
    const origMarker = path.dataset.origMarker ?? '';
    if (origMarker) path.setAttribute('marker-end', origMarker);
    else path.removeAttribute('marker-end');
    // Clear saved attrs so re-drags save fresh originals.
    delete path.dataset.origStroke;
    delete path.dataset.origDash;
    delete path.dataset.origMarker;
  }
  const label = edgeGroup.querySelector('text');
  if (label) (label as SVGTextElement).style.display = '';
}

// Live drag tick. Invalidates routedPath on connected edges and shows the dotted stub.
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

  const ancestors = state.nodeAncestors.get(nodeId) ?? [];
  for (const sgId of ancestors) recomputeSubgraphBounds(state, sgId);

  const keys = state.adjacency.get(nodeId) ?? [];
  for (const k of keys) {
    const e = state.ir.edges.find((ed) => edgeKey(ed) === k);
    if (!e) continue;
    e.routedPath = undefined;
    e.routedAt = undefined;
    const fromNode = state.ir.nodes.find((n) => n.id === e.from);
    const toNode = state.ir.nodes.find((n) => n.id === e.to);
    if (!fromNode || !toNode) continue;
    const edgeGroup = state.svg.querySelector(`[data-edge-id="${k}"]`) as SVGGElement | null;
    if (!edgeGroup) continue;
    applyDraggingStyle(edgeGroup, fromNode, toNode);
  }
}

// Render the A* grid overlay: thin gridlines + red translucent blocks for obstacle cells.
// Inserted as the first child of <svg> so it sits behind everything else.
// Call `setGridOverlay(state, true|false)` to toggle.
export function setGridOverlay(state: RenderState, enabled: boolean): void {
  const existing = state.svg.querySelector('[data-grid-overlay]') as SVGGElement | null;
  if (existing) existing.remove();
  if (!enabled) return;

  const width = Number(state.svg.getAttribute('width') ?? 800);
  const height = Number(state.svg.getAttribute('height') ?? 600);

  const obstacles: Obstacle[] = state.ir.nodes
    .filter((n) => n.x !== undefined && n.y !== undefined)
    .map((n) => ({ x: n.x!, y: n.y!, width: n.width ?? 80, height: n.height ?? 40 }));
  const { cols, rows, blocked } = buildBlockedMask(obstacles, { width, height });

  const g = svgEl('g');
  g.setAttribute('data-grid-overlay', '');
  g.setAttribute('pointer-events', 'none');

  // Blocked cells as a single combined path for cheap rendering.
  let blockedD = '';
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!blocked[y * cols + x]) continue;
      blockedD += `M${x * CELL},${y * CELL}h${CELL}v${CELL}h${-CELL}z`;
    }
  }
  if (blockedD) {
    const blockedPath = svgEl('path');
    blockedPath.setAttribute('d', blockedD);
    blockedPath.setAttribute('fill', 'rgba(220, 60, 60, 0.18)');
    blockedPath.setAttribute('stroke', 'none');
    g.appendChild(blockedPath);
  }

  // Gridlines.
  let linesD = '';
  for (let x = 0; x <= cols; x++) linesD += `M${x * CELL},0V${rows * CELL}`;
  for (let y = 0; y <= rows; y++) linesD += `M0,${y * CELL}H${cols * CELL}`;
  const linesPath = svgEl('path');
  linesPath.setAttribute('d', linesD);
  linesPath.setAttribute('fill', 'none');
  linesPath.setAttribute('stroke', 'rgba(100, 120, 160, 0.18)');
  linesPath.setAttribute('stroke-width', '0.5');
  g.appendChild(linesPath);

  // Insert just after <defs> so it sits behind subgraphs/edges/nodes.
  const defsEl = state.svg.querySelector('defs');
  if (defsEl && defsEl.nextSibling) state.svg.insertBefore(g, defsEl.nextSibling);
  else state.svg.appendChild(g);
}

// On mouseup: rewrite path `d` for each edgeKey using routedPath (A*) when available,
// otherwise fall back to a clean rect-anchor line at current node positions.
// Dagre's stale `e.points` are never used here — they point to pre-drag coordinates.
export function applyRoutedEdges(state: RenderState, edgeKeys: string[]): void {
  const nodeById = new Map(state.ir.nodes.map((n) => [n.id, n]));

  for (const k of edgeKeys) {
    const e = state.ir.edges.find((ed) => edgeKey(ed) === k);
    if (!e) continue;
    const edgeGroup = state.svg.querySelector(`[data-edge-id="${k}"]`) as SVGGElement | null;
    if (!edgeGroup) continue;
    restoreEdgeStyle(edgeGroup);
    const path = edgeGroup.querySelector('path') as SVGPathElement | null;
    if (!path) continue;

    let pts: { x: number; y: number }[] | null = null;

    if (e.routedPath && e.routedPath.length >= 2) {
      pts = e.routedPath;
    } else {
      // A* failed or wasn't run — build a clean rect-anchor straight line at current positions.
      const fromNode = nodeById.get(e.from);
      const toNode = nodeById.get(e.to);
      if (fromNode && toNode && fromNode.x !== undefined && toNode.x !== undefined) {
        const fromCenter = { x: fromNode.x, y: fromNode.y! };
        const toCenter = { x: toNode.x, y: toNode.y! };
        const fromAnchor = rectAnchor(toCenter, {
          x: fromCenter.x, y: fromCenter.y,
          width: fromNode.width ?? 80, height: fromNode.height ?? 40,
        });
        const toAnchor = rectAnchor(fromCenter, {
          x: toCenter.x, y: toCenter.y,
          width: toNode.width ?? 80, height: toNode.height ?? 40,
        });
        pts = [fromAnchor, toAnchor];
      }
    }

    if (pts) path.setAttribute('d', lineGen(pts) ?? '');

    if (pts && pts.length > 0) {
      const label = edgeGroup.querySelector('text') as SVGTextElement | null;
      if (label) {
        const mid = pts[Math.floor(pts.length / 2)];
        label.setAttribute('x', String(mid.x));
        label.setAttribute('y', String(mid.y - 4));
      }
    }
  }
}

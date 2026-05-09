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

  mountEl.appendChild(svg);
  return { svg, ir, adjacency };
}

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

  const keys = state.adjacency.get(nodeId) ?? [];
  const newCenter = { x: newX, y: newY };
  for (const k of keys) {
    const e = state.ir.edges.find((ed) => edgeKey(ed) === k);
    if (!e || !e.points) continue;
    const original = e.points;
    const points =
      e.to === nodeId
        ? [...original.slice(0, -1), newCenter]
        : [newCenter, ...original.slice(1)];
    const path = state.svg.querySelector(`[data-edge-id="${k}"] path`) as SVGPathElement | null;
    if (path) path.setAttribute('d', lineGen(points) ?? '');
    e.points = points;
  }
}

// Edge creation UX modeled on E:/Projects/MermaidWeb (ConnectDragOverlay +
// DiagramCanvas onStartEdgeCreate).
//
//   1. User right-clicks a node → context menu → "Connect from this node…".
//   2. That node gets a highlighted "source" outline + a single cyan handle
//      circle at the node's centre. A hint banner appears at the bottom of
//      the screen: "Drag to a node or subgraph to connect — Esc to cancel".
//   3. User mousedowns on the handle (or anywhere on the source node) and
//      drags. A dashed preview line with an arrow head follows the cursor.
//      A small cyan dot anchors the line origin to the source.
//   4. Whatever node/subgraph the cursor is currently over becomes the
//      candidate target: it gets highlighted, the preview line turns green,
//      and a green snap dot appears at the target's centre.
//   5. Mouseup over a valid target creates the edge. Over empty space, the
//      connect is cancelled silently.
//   6. Esc at any time cancels.
//
// Everything lives in a single overlay <g> appended to the SVG so it cleans
// up by removing one element.

import type { IR } from './types.js';
import { connectNodes } from './menuActions.js';
import { screenToModel } from './pan.js';

const NS = 'http://www.w3.org/2000/svg';
const HANDLE_RADIUS = 8;
const SNAP_RADIUS = 7;
const SOURCE_DOT_RADIUS = 5;

let svgRef: SVGSVGElement | null = null;

interface ActiveSession {
  sourceId: string;
  sourceCx: number;   // model coords of source node centre
  sourceCy: number;
  overlay: SVGGElement;
  handle: SVGCircleElement;
  sourceHighlight: SVGRectElement;
  banner: HTMLDivElement;
  // Filled in once a drag actually starts:
  drag: null | {
    ghostShadow: SVGLineElement;
    ghostMain: SVGLineElement;
    sourceDot: SVGCircleElement;
    snapDot: SVGCircleElement | null;
    targetGroup: SVGGElement | null;
  };
}

let session: ActiveSession | null = null;

// ── Public API used by the right-click menu ─────────────────────────────────

export function showHandlesFor(nodeId: string): void {
  if (!svgRef) return;
  hideHandles();
  const g = svgRef.querySelector<SVGGElement>(`g[data-node-id="${cssEscape(nodeId)}"]`);
  if (!g) return;
  if (g.getAttribute('data-surrogate-for')) return; // no connect on surrogates

  const rect = g.querySelector('rect');
  if (!rect) return;
  const w = parseFloat(rect.getAttribute('width')  || '0');
  const h = parseFloat(rect.getAttribute('height') || '0');
  if (!w || !h) return;

  // Source node centre in model coords. The node group's transform is
  // `translate(left, top)` — derive left/top by parsing the transform.
  const tf = g.getAttribute('transform') || '';
  const m = /translate\(([-\d.]+),\s*([-\d.]+)\)/.exec(tf);
  const left = m ? parseFloat(m[1]) : 0;
  const top  = m ? parseFloat(m[2]) : 0;
  const sourceCx = left + w / 2;
  const sourceCy = top  + h / 2;

  const overlay = document.createElementNS(NS, 'g') as SVGGElement;
  overlay.setAttribute('class', 'connect-overlay');
  // Ensure the overlay sits on top of everything in the SVG.
  overlay.style.pointerEvents = 'none';

  // Source highlight: a rect drawn directly over the source node.
  const sourceHighlight = document.createElementNS(NS, 'rect');
  sourceHighlight.setAttribute('x', String(left));
  sourceHighlight.setAttribute('y', String(top));
  sourceHighlight.setAttribute('width',  String(w));
  sourceHighlight.setAttribute('height', String(h));
  sourceHighlight.setAttribute('rx', '4');
  sourceHighlight.setAttribute('fill', 'none');
  sourceHighlight.setAttribute('stroke', '#06b6d4');
  sourceHighlight.setAttribute('stroke-width', '3');
  sourceHighlight.setAttribute('pointer-events', 'none');
  overlay.appendChild(sourceHighlight);

  // The big draggable handle at the source centre.
  const handle = document.createElementNS(NS, 'circle');
  handle.setAttribute('class', 'connect-handle');
  handle.setAttribute('cx', String(sourceCx));
  handle.setAttribute('cy', String(sourceCy));
  handle.setAttribute('r',  String(HANDLE_RADIUS));
  handle.setAttribute('fill', '#06b6d4');
  handle.setAttribute('stroke', '#ffffff');
  handle.setAttribute('stroke-width', '2.5');
  handle.setAttribute('data-connect-handle', '1');
  handle.style.cursor = 'crosshair';
  handle.style.pointerEvents = 'all';
  overlay.appendChild(handle);

  svgRef.appendChild(overlay);

  // Ensure the arrow marker for the drag preview is defined.
  ensureConnectArrowMarker(svgRef);

  // Hint banner.
  const banner = document.createElement('div');
  banner.className = 'connect-hint-banner';
  banner.textContent = 'Drag to a node to connect — press Esc to cancel';
  banner.style.cssText = [
    'position: fixed',
    'bottom: 24px',
    'left: 50%',
    'transform: translateX(-50%)',
    'background: rgba(6,182,212,0.92)',
    'color: #fff',
    'font: 12px sans-serif',
    'padding: 6px 14px',
    'border-radius: 999px',
    'z-index: 10001',
    'pointer-events: none',
    'box-shadow: 0 2px 8px rgba(0,0,0,0.2)',
  ].join(';');
  document.body.appendChild(banner);

  session = {
    sourceId: nodeId,
    sourceCx,
    sourceCy,
    overlay,
    handle,
    sourceHighlight,
    banner,
    drag: null,
  };
}

export function hideHandles(): void {
  if (!session) return;
  session.overlay.remove();
  session.banner.remove();
  session = null;
}

export function getActiveConnectNodeId(): string | null {
  return session?.sourceId ?? null;
}

// ── Wiring (called once from entry.ts) ──────────────────────────────────────

export function attachConnect(
  svg: SVGSVGElement,
  getIR: () => IR,
  rerender: () => void,
): () => void {
  svgRef = svg;
  const ac = new AbortController();
  const opts: AddEventListenerOptions = { signal: ac.signal };

  svg.addEventListener('mousedown', (e: MouseEvent) => {
    if (e.button !== 0 || !session) return;
    const handle = (e.target as Element).closest('[data-connect-handle]') as SVGCircleElement | null;
    if (!handle) return;
    e.preventDefault();
    e.stopPropagation();
    beginDrag(svg);
  }, opts);

  window.addEventListener('mousemove', (e: MouseEvent) => {
    if (!session?.drag) return;
    const m = screenToModel(svg, e.clientX, e.clientY);
    const d = session.drag;
    d.ghostShadow.setAttribute('x2', String(m.x));
    d.ghostShadow.setAttribute('y2', String(m.y));
    d.ghostMain.setAttribute('x2', String(m.x));
    d.ghostMain.setAttribute('y2', String(m.y));

    // Find candidate target under cursor (DOM order: nodes paint on top, so
    // elementFromPoint reports the leaf node, not the parent subgraph).
    const t = document.elementFromPoint(e.clientX, e.clientY);
    const targetGroup = t ? (t as Element).closest('g[data-node-id], g[data-subgraph-id]') as SVGGElement | null : null;
    const targetId = targetGroup?.getAttribute('data-node-id')
                  ?? targetGroup?.getAttribute('data-subgraph-id')
                  ?? null;

    // Update highlight class
    if (d.targetGroup && d.targetGroup !== targetGroup) {
      d.targetGroup.classList.remove('connect-target');
      d.targetGroup = null;
    }
    if (targetGroup && targetId && targetId !== session.sourceId) {
      targetGroup.classList.add('connect-target');
      d.targetGroup = targetGroup;
    }

    const validTarget = !!(targetGroup && targetId && targetId !== session.sourceId);

    // Update preview line colour
    d.ghostMain.setAttribute('stroke', validTarget ? '#10b981' : '#06b6d4');

    // Update snap dot
    if (validTarget && targetGroup) {
      const c = nodeCentreModel(targetGroup);
      if (c) {
        if (!d.snapDot) {
          const dot = document.createElementNS(NS, 'circle');
          dot.setAttribute('class', 'connect-snap-dot');
          dot.setAttribute('r', String(SNAP_RADIUS));
          dot.setAttribute('fill', '#10b981');
          dot.setAttribute('stroke', '#ffffff');
          dot.setAttribute('stroke-width', '2');
          dot.setAttribute('opacity', '0.9');
          dot.setAttribute('pointer-events', 'none');
          session.overlay.appendChild(dot);
          d.snapDot = dot;
        }
        d.snapDot.setAttribute('cx', String(c.x));
        d.snapDot.setAttribute('cy', String(c.y));
      }
    } else if (d.snapDot) {
      d.snapDot.remove();
      d.snapDot = null;
    }
  }, opts);

  window.addEventListener('mouseup', (e: MouseEvent) => {
    if (!session?.drag) return;
    const d = session.drag;
    const t = document.elementFromPoint(e.clientX, e.clientY);
    const targetGroup = t ? (t as Element).closest('g[data-node-id], g[data-subgraph-id]') as SVGGElement | null : null;
    const targetId = targetGroup?.getAttribute('data-node-id')
                  ?? targetGroup?.getAttribute('data-subgraph-id')
                  ?? null;
    const fromId = session.sourceId;

    // Tear down highlight + overlay before the rerender either way.
    if (d.targetGroup) d.targetGroup.classList.remove('connect-target');
    hideHandles();

    if (!targetGroup || !targetId || targetId === fromId) return;
    connectNodes(getIR(), fromId, targetId);
    rerender();
  }, opts);

  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    if (session?.drag?.targetGroup) session.drag.targetGroup.classList.remove('connect-target');
    hideHandles();
  }, opts);

  return () => {
    ac.abort();
    hideHandles();
    svgRef = null;
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function beginDrag(svg: SVGSVGElement): void {
  if (!session) return;
  const { sourceCx, sourceCy } = session;

  const ghostShadow = document.createElementNS(NS, 'line') as SVGLineElement;
  ghostShadow.setAttribute('x1', String(sourceCx));
  ghostShadow.setAttribute('y1', String(sourceCy));
  ghostShadow.setAttribute('x2', String(sourceCx));
  ghostShadow.setAttribute('y2', String(sourceCy));
  ghostShadow.setAttribute('stroke', 'rgba(0,0,0,0.18)');
  ghostShadow.setAttribute('stroke-width', '4');
  ghostShadow.setAttribute('stroke-dasharray', '6,4');
  ghostShadow.setAttribute('stroke-linecap', 'round');
  ghostShadow.setAttribute('pointer-events', 'none');
  session.overlay.appendChild(ghostShadow);

  const ghostMain = document.createElementNS(NS, 'line') as SVGLineElement;
  ghostMain.setAttribute('x1', String(sourceCx));
  ghostMain.setAttribute('y1', String(sourceCy));
  ghostMain.setAttribute('x2', String(sourceCx));
  ghostMain.setAttribute('y2', String(sourceCy));
  ghostMain.setAttribute('stroke', '#06b6d4');
  ghostMain.setAttribute('stroke-width', '2.5');
  ghostMain.setAttribute('stroke-dasharray', '6,4');
  ghostMain.setAttribute('stroke-linecap', 'round');
  ghostMain.setAttribute('marker-end', 'url(#connect-arrow)');
  ghostMain.setAttribute('pointer-events', 'none');
  session.overlay.appendChild(ghostMain);

  const sourceDot = document.createElementNS(NS, 'circle');
  sourceDot.setAttribute('cx', String(sourceCx));
  sourceDot.setAttribute('cy', String(sourceCy));
  sourceDot.setAttribute('r', String(SOURCE_DOT_RADIUS));
  sourceDot.setAttribute('fill', '#06b6d4');
  sourceDot.setAttribute('stroke', '#ffffff');
  sourceDot.setAttribute('stroke-width', '2');
  sourceDot.setAttribute('pointer-events', 'none');
  session.overlay.appendChild(sourceDot);

  // Hide the static handle while dragging — the sourceDot replaces it.
  session.handle.style.display = 'none';
  // Hide the hint banner — the user is already engaged.
  session.banner.style.display = 'none';

  session.drag = { ghostShadow, ghostMain, sourceDot, snapDot: null, targetGroup: null };
  svg.style.cursor = 'crosshair';
}

function nodeCentreModel(g: SVGGElement): { x: number; y: number } | null {
  // For node groups: parse the translate and use rect dimensions.
  const tf = g.getAttribute('transform') || '';
  const m = /translate\(([-\d.]+),\s*([-\d.]+)\)/.exec(tf);
  if (m) {
    const rect = g.querySelector('rect');
    if (!rect) return null;
    const w = parseFloat(rect.getAttribute('width')  || '0');
    const h = parseFloat(rect.getAttribute('height') || '0');
    return { x: parseFloat(m[1]) + w / 2, y: parseFloat(m[2]) + h / 2 };
  }
  // For subgraph groups: the first child <rect> carries x/y/w/h.
  const rect = g.querySelector('rect');
  if (!rect) return null;
  const x = parseFloat(rect.getAttribute('x') || '0');
  const y = parseFloat(rect.getAttribute('y') || '0');
  const w = parseFloat(rect.getAttribute('width')  || '0');
  const h = parseFloat(rect.getAttribute('height') || '0');
  return { x: x + w / 2, y: y + h / 2 };
}

function ensureConnectArrowMarker(svg: SVGSVGElement): void {
  if (svg.querySelector('#connect-arrow')) return;
  let defs = svg.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS(NS, 'defs');
    svg.insertBefore(defs, svg.firstChild);
  }
  const marker = document.createElementNS(NS, 'marker');
  marker.setAttribute('id', 'connect-arrow');
  marker.setAttribute('markerWidth', '8');
  marker.setAttribute('markerHeight', '8');
  marker.setAttribute('refX', '6');
  marker.setAttribute('refY', '3');
  marker.setAttribute('orient', 'auto');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', 'M0,0 L0,6 L8,3 z');
  path.setAttribute('fill', '#06b6d4');
  marker.appendChild(path);
  defs.appendChild(marker);
}

function cssEscape(s: string): string {
  if (typeof (window as any).CSS?.escape === 'function') return (window as any).CSS.escape(s);
  return s.replace(/[^a-zA-Z0-9_-]/g, m => '\\' + m);
}

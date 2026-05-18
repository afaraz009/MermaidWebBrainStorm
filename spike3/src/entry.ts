import { parseToIR } from './parser-adapter.js';
import { layout } from './layout.js';
import { renderFull } from './renderer.js';
import { attachDrag } from './drag.js';
import { renderGridOverlay, clearGridOverlay, isGridOverlayShown } from './gridOverlay.js';
import { routeEdge } from './routing.js';
import { astarSettings, type HeuristicName, type Connectivity } from './astarSettings.js';
import { deriveEffectiveIR, isSurrogateId } from './effective-ir.js';
import { attachCollapseHandlers } from './collapse.js';
import type { IR } from './types.js';

// `ir` is the source of truth (with `sg.collapsed` flags + pinned node
// positions persisted across collapse cycles). `currentEff` is what the
// renderer, drag handler, and grid overlay see — it's reconstructed on every
// collapse/expand and on initial load.
let ir: IR;
let currentEff: IR;
let detachDrag: (() => void) | null = null;
const svg = document.getElementById('mount') as unknown as SVGSVGElement;

function readFixtureName(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get('fixture') || 'fixture.mmd';
}

function reattach(): void {
  if (detachDrag) detachDrag();
  detachDrag = attachDrag(svg, currentEff, svg);
}

// Write positions/sizes computed for the effective IR back onto the source IR,
// for every visible (non-surrogate) node and edge. Hidden nodes keep their
// last-known position so they reappear in place on expand.
function syncEffToSource(): void {
  for (const en of currentEff.nodes) {
    if (isSurrogateId(en.id)) continue;
    const src = ir.nodes.find(n => n.id === en.id);
    if (src) {
      src.x = en.x;
      src.y = en.y;
      src.width = en.width;
      src.height = en.height;
    }
  }
  for (const ee of currentEff.edges) {
    if (isSurrogateId(ee.from) || isSurrogateId(ee.to)) continue;
    const src = ir.edges.find(e => e.from === ee.from && e.to === ee.to);
    if (src) {
      src.points = ee.points;
      src.originalPoints = ee.originalPoints;
    }
  }
}

// Full collapse/expand-aware re-render. Stale A* routedPath values are cleared
// because the layout shift invalidates them; the user can re-route by dragging.
function rerenderWithCollapse(): void {
  const overlayWasShown = isGridOverlayShown(svg);
  ir.edges.forEach(e => { delete e.routedPath; });
  currentEff = deriveEffectiveIR(ir);
  layout(currentEff);
  syncEffToSource();
  renderFull(currentEff, svg, true, ir);
  reattach();
  if (overlayWasShown) renderGridOverlay(svg, currentEff);
}

async function main() {
  const fixture = readFixtureName();
  const source = await fetch('./' + fixture).then(r => r.text());
  ir = await parseToIR(source);
  currentEff = deriveEffectiveIR(ir);
  layout(currentEff);
  syncEffToSource();
  renderFull(currentEff, svg, true, ir);
  reattach();
  attachCollapseHandlers(svg, () => ir, rerenderWithCollapse);
}

document.getElementById('reset')!.addEventListener('click', () => {
  // Reset clears pinned positions and stale A* paths but preserves collapse
  // state — collapsed subgraphs stay collapsed across reset (matching user
  // intuition: reset is about layout, not disclosure state).
  ir.nodes.forEach(n => { n.pinned = false; delete n.x; delete n.y; });
  ir.edges.forEach(e => { delete e.routedPath; });
  rerenderWithCollapse();
});

const collapseAllBtn = document.getElementById('collapseAll');
if (collapseAllBtn) {
  collapseAllBtn.addEventListener('click', () => {
    ir.subgraphs.forEach(sg => { sg.collapsed = true; });
    rerenderWithCollapse();
  });
}

const expandAllBtn = document.getElementById('expandAll');
if (expandAllBtn) {
  expandAllBtn.addEventListener('click', () => {
    ir.subgraphs.forEach(sg => { sg.collapsed = false; });
    rerenderWithCollapse();
  });
}

const gridBtn = document.getElementById('toggleGrid');
if (gridBtn) {
  gridBtn.addEventListener('click', () => {
    if (isGridOverlayShown(svg)) {
      clearGridOverlay(svg);
      gridBtn.textContent = 'Show A* Grid';
      gridBtn.classList.remove('on');
    } else {
      renderGridOverlay(svg, currentEff);
      gridBtn.textContent = 'Hide A* Grid';
      gridBtn.classList.add('on');
    }
  });
}

// Re-route every edge that has been A*-routed at least once, using the
// current settings. Then redraw all edges, preserving overlay visibility.
function rerouteAll(): void {
  const overlayWasShown = isGridOverlayShown(svg);
  for (const edge of currentEff.edges) {
    if (!edge.routedPath) continue;
    const fromNode = currentEff.nodes.find(n => n.id === edge.from);
    const toNode   = currentEff.nodes.find(n => n.id === edge.to);
    if (!fromNode || !toNode) continue;
    edge.routedPath = routeEdge(fromNode, toNode, currentEff, {
      cellSize: astarSettings.cellSize,
      padding: astarSettings.padding,
      marginCells: astarSettings.marginCells,
    });
  }
  renderFull(currentEff, svg, true, ir);
  reattach();
  if (overlayWasShown) renderGridOverlay(svg, currentEff);
}

const cellSizeEl = document.getElementById('cfgCellSize') as HTMLInputElement | null;
const cellSizeValEl = document.getElementById('cfgCellSizeVal');
if (cellSizeEl) {
  cellSizeEl.value = String(astarSettings.cellSize);
  if (cellSizeValEl) cellSizeValEl.textContent = String(astarSettings.cellSize);
  cellSizeEl.addEventListener('input', () => {
    astarSettings.cellSize = +cellSizeEl.value;
    // Padding is locked to cellSize so the obstacle ring stays exactly one
    // cell wide regardless of resolution.
    astarSettings.padding = astarSettings.cellSize;
    if (cellSizeValEl) cellSizeValEl.textContent = cellSizeEl.value;
  });
  // Apply on release so the grid doesn't re-route on every pixel of slider drag.
  cellSizeEl.addEventListener('change', () => rerouteAll());
}

const connEl = document.getElementById('cfgConnectivity') as HTMLSelectElement | null;
if (connEl) {
  connEl.value = String(astarSettings.connectivity);
  connEl.addEventListener('change', () => {
    astarSettings.connectivity = (+connEl.value) as Connectivity;
    rerouteAll();
  });
}

const ccEl = document.getElementById('cfgCornerCut') as HTMLSelectElement | null;
if (ccEl) {
  ccEl.value = astarSettings.cornerCut ? '1' : '0';
  ccEl.addEventListener('change', () => {
    astarSettings.cornerCut = ccEl.value === '1';
    rerouteAll();
  });
}

const hEl = document.getElementById('cfgHeuristic') as HTMLSelectElement | null;
if (hEl) {
  hEl.value = astarSettings.heuristic;
  hEl.addEventListener('change', () => {
    astarSettings.heuristic = hEl.value as HeuristicName;
    rerouteAll();
  });
}

// ---- Zoom: scroll wheel scales an outer wrapper around the SVG, centered on
// the cursor position. The SVG itself isn't transformed — instead the parent
// wrapper is — so screen-to-SVG point math used elsewhere (drag.ts via
// `getScreenCTM`) keeps working correctly because the CTM picks up the
// CSS transform automatically.
let zoom = 1;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;

function applyZoomAt(factor: number, cursorClientX: number, cursorClientY: number): void {
  const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom * factor));
  if (newZoom === zoom) return;
  // Translate so the cursor stays anchored to the same logical point.
  // We use transform-origin: 0 0 and adjust with translate so the math is
  // straightforward: world_x = (screen_x - tx) / zoom. Hold world_x constant.
  const rect = svg.getBoundingClientRect();
  const sx = cursorClientX - rect.left;
  const sy = cursorClientY - rect.top;
  // Current logical coords under cursor (in svg-local px, pre-zoom)
  const lx = sx / zoom;
  const ly = sy / zoom;
  zoom = newZoom;
  // After updating zoom, ensure (lx * newZoom + origin offset) lands at cursor.
  // Since transform-origin is 0,0 and we only scale, we use translateX/Y in CSS.
  const tx = sx - lx * zoom;
  const ty = sy - ly * zoom;
  svg.style.transformOrigin = '0 0';
  svg.style.transform = `translate(${tx}px, ${ty}px) scale(${zoom})`;
}

svg.addEventListener('wheel', (e: WheelEvent) => {
  e.preventDefault();
  // deltaY > 0 => scroll down => zoom out
  const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
  applyZoomAt(factor, e.clientX, e.clientY);
}, { passive: false });

main().catch(err => {
  console.error('Render failed:', err);
  document.body.innerHTML = `<pre style="color:red">${err}\n\n${err.stack}</pre>`;
});

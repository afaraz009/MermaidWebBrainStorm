import { parseToIR } from './parser-adapter.js';
import { layout } from './layout.js';
import { renderFull } from './renderer.js';
import { attachDrag } from './drag.js';
import { renderGridOverlay, clearGridOverlay, isGridOverlayShown } from './gridOverlay.js';
import { routeEdge } from './routing.js';
import { astarSettings, type HeuristicName, type Connectivity } from './astarSettings.js';
import type { IR } from './types.js';

let ir: IR;
let detachDrag: (() => void) | null = null;
const svg = document.getElementById('mount') as unknown as SVGSVGElement;

function readFixtureName(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get('fixture') || 'fixture.mmd';
}

function reattach(): void {
  if (detachDrag) detachDrag();
  detachDrag = attachDrag(svg, ir, svg);
}

// Re-render edges + overlay, preserving overlay visibility across the
// renderFull(...) call (which wipes the entire SVG).
function rerenderPreservingOverlay(): void {
  const overlayWasShown = isGridOverlayShown(svg);
  renderFull(ir, svg, true);
  reattach();
  if (overlayWasShown) renderGridOverlay(svg, ir);
}

async function main() {
  const fixture = readFixtureName();
  const source = await fetch('./' + fixture).then(r => r.text());
  ir = await parseToIR(source);
  layout(ir);
  renderFull(ir, svg, true);
  reattach();
}

document.getElementById('reset')!.addEventListener('click', () => {
  ir.nodes.forEach(n => { n.pinned = false; delete n.x; delete n.y; });
  ir.edges.forEach(e => { delete e.routedPath; });
  layout(ir);
  rerenderPreservingOverlay();
});

const gridBtn = document.getElementById('toggleGrid');
if (gridBtn) {
  gridBtn.addEventListener('click', () => {
    if (isGridOverlayShown(svg)) {
      clearGridOverlay(svg);
      gridBtn.textContent = 'Show A* Grid';
      gridBtn.classList.remove('on');
    } else {
      renderGridOverlay(svg, ir);
      gridBtn.textContent = 'Hide A* Grid';
      gridBtn.classList.add('on');
    }
  });
}

// Re-route every edge that has been A*-routed at least once, using the
// current settings. Then redraw all edges, preserving overlay visibility.
function rerouteAll(): void {
  for (const edge of ir.edges) {
    if (!edge.routedPath) continue;
    const fromNode = ir.nodes.find(n => n.id === edge.from);
    const toNode   = ir.nodes.find(n => n.id === edge.to);
    if (!fromNode || !toNode) continue;
    edge.routedPath = routeEdge(fromNode, toNode, ir, {
      cellSize: astarSettings.cellSize,
      padding: astarSettings.padding,
      marginCells: astarSettings.marginCells,
    });
  }
  rerenderPreservingOverlay();
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

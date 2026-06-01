import { parseToIR } from './parser-adapter.js';
import { layout } from './layout.js';
import { renderFull } from './renderer.js';
import { attachDrag } from './drag.js';
import { renderGridOverlay, clearGridOverlay, isGridOverlayShown } from './gridOverlay.js';
import { routeEdge, routeEdgesBatch } from './routing.js';
import { astarSettings, type HeuristicName, type Connectivity, type EdgeSeparation } from './astarSettings.js';
import { edgeSettings, type EdgeMode } from './edgeSettings.js';
import { deriveEffectiveIR, isSurrogateId } from './effective-ir.js';
import { attachCollapseHandlers } from './collapse.js';
import { attachPan, getPan, getZoom, setZoom, setPan } from './pan.js';
import { attachContextMenu } from './contextMenuWiring.js';
import { attachConnect, hideHandles } from './connect.js';
import { computeDepths, maxDepth } from './depth.js';
import { attachFocus } from './focus.js';
import { attachPath } from './path.js';
import type { IR } from './types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Live-editor entry point. Mirrors `entry.ts`'s full feature wiring (drag,
// collapse/expand, depth slider, focus, path, A* + separation + edge mode,
// pan/zoom, connect, context menu) but sources the Mermaid text from a LEFT-pane
// textarea instead of a `?fixture=` file. `entry.ts` + `our-renderer.html` are
// untouched — this is a parallel harness (SPEC strategy b).
//
// The one structural difference from `entry.ts`: the source IR is re-parsed on
// every edit, so `renderFromSource()` reassigns the module-level `ir`. The
// persistent handlers (collapse / pan / context-menu / connect) are attached
// ONCE against `() => ir` getters, so reassigning `ir` propagates to them with
// no re-attach (which would otherwise stack duplicate listeners).
// ─────────────────────────────────────────────────────────────────────────────

let ir: IR;
let currentEff: IR;
let detachDrag: (() => void) | null = null;
let detachFocus: (() => void) | null = null;
let detachPath: (() => void) | null = null;
let depths: Map<string, number> = new Map();
let persistentAttached = false;

const svg = document.getElementById('mount') as unknown as SVGSVGElement;
const textarea = document.getElementById('source') as HTMLTextAreaElement;
const renderBtn = document.getElementById('renderBtn');
const errorBar = document.getElementById('errorBar') as HTMLElement | null;

function reattach(): void {
  if (detachDrag) detachDrag();
  detachDrag = attachDrag(svg, currentEff, svg);
  if (detachFocus) detachFocus();
  detachFocus = attachFocus(svg, () => currentEff);
  if (detachPath) detachPath();
  detachPath = attachPath(svg, () => currentEff);
  hideHandles();
}

function routeAllEffWithCurrentSeparation(): void {
  routeEdgesBatch(
    currentEff.edges,
    currentEff,
    {
      cellSize: astarSettings.cellSize,
      padding: astarSettings.padding,
      marginCells: astarSettings.marginCells,
    },
    astarSettings.separation,
  );
  for (const edge of currentEff.edges) {
    if (!edge.routedPath) continue;
    const src = ir.edges.find(e => e.from === edge.from && e.to === edge.to);
    if (src) src.routedPath = edge.routedPath;
  }
}

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

// Collapse/expand-aware re-render (collapse flags only — does NOT re-parse).
function rerenderWithCollapse(): void {
  const overlayWasShown = isGridOverlayShown(svg);
  ir.edges.forEach(e => { delete e.routedPath; });
  currentEff = deriveEffectiveIR(ir);
  layout(currentEff);
  syncEffToSource();
  if (astarSettings.enabled) {
    routeAllEffWithCurrentSeparation();
  }
  renderFull(currentEff, svg, true, ir);
  reattach();
  if (overlayWasShown) renderGridOverlay(svg, currentEff);
}

// ── Parse + full re-render from textarea source ──────────────────────────────
// The editor's equivalent of `entry.ts main()`, but callable repeatedly. On
// parse failure it surfaces the error and KEEPS the last good diagram on screen
// (SPEC §4) — `ir`/`currentEff` are only reassigned on success.
async function renderFromSource(source: string): Promise<void> {
  let parsed: IR;
  try {
    parsed = await parseToIR(source);
  } catch (err) {
    showError(err);
    return;
  }
  hideError();
  ir = parsed;
  depths = computeDepths(ir);
  currentEff = deriveEffectiveIR(ir);
  layout(currentEff);
  syncEffToSource();
  if (astarSettings.enabled) routeAllEffWithCurrentSeparation();
  renderFull(currentEff, svg, true, ir);
  reattach();
  refreshDepthBounds();

  // Persistent (global) handlers attach exactly once, after the first good
  // render. They read `() => ir`, so later re-parses need no re-attach.
  if (!persistentAttached) {
    attachCollapseHandlers(svg, () => ir, rerenderWithCollapse);
    attachPan(svg);
    attachContextMenu(svg, () => ir, rerenderWithCollapse, resetLayout, toggleAstar, fitView);
    attachConnect(svg, () => ir, rerenderWithCollapse);
    persistentAttached = true;
  }
}

function showError(err: unknown): void {
  if (!errorBar) return;
  const msg = err instanceof Error ? err.message : String(err);
  errorBar.textContent = 'Parse error: ' + msg;
  errorBar.style.display = 'block';
}

function hideError(): void {
  if (errorBar) errorBar.style.display = 'none';
}

// ── Depth slider ─────────────────────────────────────────────────────────────
// Same semantics as entry.ts: collapsed = depthOf(sg) > N, range 0…maxDepth,
// default maxDepth (fully expanded). The 'input' listener is wired ONCE; bounds
// are refreshed after each re-parse since a new diagram changes maxDepth.
const depthEl = document.getElementById('cfgDepth') as HTMLInputElement | null;
const depthValEl = document.getElementById('cfgDepthVal');

function refreshDepthBounds(): void {
  if (!depthEl) return;
  const max = maxDepth(ir);
  depthEl.min = '0';
  depthEl.max = String(Math.max(0, max));
  depthEl.value = String(max);
  depthEl.disabled = max < 1;
  if (depthValEl) depthValEl.textContent = String(max);
}

if (depthEl) {
  depthEl.addEventListener('input', () => {
    const n = +depthEl.value;
    if (depthValEl) depthValEl.textContent = String(n);
    for (const sg of ir.subgraphs) {
      sg.collapsed = (depths.get(sg.id) ?? 1) > n;
    }
    rerenderWithCollapse();
  });
}

function resetLayout(): void {
  ir.nodes.forEach(n => { n.pinned = false; delete n.x; delete n.y; });
  ir.edges.forEach(e => { delete e.routedPath; });
  rerenderWithCollapse();
}

function fitView(): void {
  setPan(0, 0);
  setZoom(1);
}

function toggleAstar(): void {
  astarSettings.enabled = !astarSettings.enabled;
  const overlayWasShown = isGridOverlayShown(svg);
  const btn = document.getElementById('toggleAstar');
  if (astarSettings.enabled) {
    if (btn) { btn.textContent = 'Hide A* Feature'; btn.classList.add('on'); }
    layout(currentEff);
    routeAllEffWithCurrentSeparation();
  } else {
    if (btn) { btn.textContent = 'Show A* Feature'; btn.classList.remove('on'); }
    for (const edge of currentEff.edges) delete edge.routedPath;
    for (const edge of ir.edges)         delete edge.routedPath;
    if (edgeSettings.edgeMode === 'dagre') {
      layout(currentEff);
    }
  }
  syncEdgeModeBtnDisabled();
  renderFull(currentEff, svg, true, ir);
  reattach();
  if (overlayWasShown) renderGridOverlay(svg, currentEff);
}

// ── Toolbar wiring (identical surface to entry.ts) ───────────────────────────
document.getElementById('reset')?.addEventListener('click', () => resetLayout());

document.getElementById('collapseAll')?.addEventListener('click', () => {
  ir.subgraphs.forEach(sg => { sg.collapsed = true; });
  rerenderWithCollapse();
});

document.getElementById('expandAll')?.addEventListener('click', () => {
  ir.subgraphs.forEach(sg => { sg.collapsed = false; });
  rerenderWithCollapse();
});

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

const astarBtn = document.getElementById('toggleAstar');
if (astarBtn) astarBtn.addEventListener('click', () => toggleAstar());

const sepBtn = document.getElementById('toggleSeparation');
function labelForSeparation(mode: EdgeSeparation): string {
  return mode === 'off'  ? 'Separation: Off'
       : mode === 'soft' ? 'Separation: Soft'
                         : 'Separation: Hard';
}
if (sepBtn) {
  sepBtn.textContent = labelForSeparation(astarSettings.separation);
  sepBtn.addEventListener('click', () => {
    astarSettings.separation =
      astarSettings.separation === 'off'  ? 'soft'
    : astarSettings.separation === 'soft' ? 'hard'
                                          : 'off';
    sepBtn.textContent = labelForSeparation(astarSettings.separation);
    sepBtn.classList.toggle('on', astarSettings.separation !== 'off');
    if (!astarSettings.enabled) return;
    const overlayWasShown = isGridOverlayShown(svg);
    routeAllEffWithCurrentSeparation();
    renderFull(currentEff, svg, true, ir);
    reattach();
    if (overlayWasShown) renderGridOverlay(svg, currentEff);
  });
}

const edgeModeBtn = document.getElementById('toggleEdgeMode');
function labelForEdgeMode(m: EdgeMode): string {
  return m === 'side-aware' ? 'Edges: Side-aware' : 'Edges: Dagre';
}
function applyEdgeMode(): void {
  if (astarSettings.enabled) return;
  const overlayWasShown = isGridOverlayShown(svg);
  if (edgeSettings.edgeMode === 'dagre') {
    layout(currentEff);
  }
  renderFull(currentEff, svg, true, ir);
  reattach();
  if (overlayWasShown) renderGridOverlay(svg, currentEff);
}
function syncEdgeModeBtnDisabled(): void {
  if (!edgeModeBtn) return;
  const disabled = astarSettings.enabled;
  (edgeModeBtn as HTMLButtonElement).disabled = disabled;
  edgeModeBtn.style.opacity = disabled ? '0.5' : '';
  edgeModeBtn.style.cursor = disabled ? 'not-allowed' : '';
  edgeModeBtn.title = disabled
    ? 'Edges strategy is overridden by A* while A* is on'
    : '';
}
if (edgeModeBtn) {
  edgeModeBtn.textContent = labelForEdgeMode(edgeSettings.edgeMode);
  edgeModeBtn.classList.toggle('on', edgeSettings.edgeMode === 'dagre');
  syncEdgeModeBtnDisabled();
  edgeModeBtn.addEventListener('click', () => {
    if (astarSettings.enabled) return;
    edgeSettings.edgeMode =
      edgeSettings.edgeMode === 'side-aware' ? 'dagre' : 'side-aware';
    edgeModeBtn.textContent = labelForEdgeMode(edgeSettings.edgeMode);
    edgeModeBtn.classList.toggle('on', edgeSettings.edgeMode === 'dagre');
    applyEdgeMode();
  });
}

function rerouteAll(): void {
  if (!astarSettings.enabled) return;
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
    astarSettings.padding = astarSettings.cellSize;
    if (cellSizeValEl) cellSizeValEl.textContent = cellSizeEl.value;
  });
  cellSizeEl.addEventListener('change', () => {
    if (astarSettings.enabled) layout(currentEff);
    rerouteAll();
  });
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

// ── Zoom (wheel), identical to entry.ts ──────────────────────────────────────
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
function applyZoomAt(factor: number, cursorClientX: number, cursorClientY: number): void {
  const oldZoom = getZoom();
  const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, oldZoom * factor));
  if (newZoom === oldZoom) return;
  const rect = svg.getBoundingClientRect();
  const sx = cursorClientX - rect.left;
  const sy = cursorClientY - rect.top;
  const pan = getPan();
  const wx = (sx - pan.x) / oldZoom;
  const wy = (sy - pan.y) / oldZoom;
  const newPanX = sx - wx * newZoom;
  const newPanY = sy - wy * newZoom;
  setZoom(newZoom);
  setPan(newPanX, newPanY);
}
svg.addEventListener('wheel', (e: WheelEvent) => {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
  applyZoomAt(factor, e.clientX, e.clientY);
}, { passive: false });

// ── Editor-specific wiring: textarea → render ────────────────────────────────
let debounceTimer = 0;
if (textarea) {
  textarea.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => { void renderFromSource(textarea.value); }, 400);
  });
}
renderBtn?.addEventListener('click', () => {
  clearTimeout(debounceTimer);
  void renderFromSource(textarea.value);
});

// Initial render from the seed content already in the textarea.
void renderFromSource(textarea ? textarea.value : '');

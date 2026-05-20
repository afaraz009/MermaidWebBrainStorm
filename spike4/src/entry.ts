import { parseToIR } from './parser-adapter.js';
import { layout } from './layout.js';
import { renderFull } from './renderer.js';
import { attachDrag } from './drag.js';
import { renderGridOverlay, clearGridOverlay, isGridOverlayShown } from './gridOverlay.js';
import { routeEdge, routeEdgesBatch } from './routing.js';
import { astarSettings, type HeuristicName, type Connectivity, type EdgeSeparation, type EdgeMode } from './astarSettings.js';
import { deriveEffectiveIR, isSurrogateId } from './effective-ir.js';
import { attachCollapseHandlers } from './collapse.js';
import { attachPan, getPan, getZoom, setZoom, setPan } from './pan.js';
import { attachContextMenu } from './contextMenuWiring.js';
import { attachConnect, hideHandles } from './connect.js';
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
  // Any pending connect-handle session is invalidated by a full re-render
  // since the node DOM was rebuilt.
  hideHandles();
}

// Route every edge in `currentEff` with the active separation mode, then
// mirror the resulting `routedPath` onto matching source-IR edges so collapse
// / reset see the same state. Centralizes the batch-route flow shared by
// `rerenderWithCollapse` and the toggle-on click handler.
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
// because the collapse/expand invalidates them. If the A* toggle is currently
// on, re-route every edge with A* against the new layout so the result matches
// the active toggle state — without this, expand/collapse would always show
// dagre output regardless of the toggle.
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
  attachPan(svg);
  attachContextMenu(svg, () => ir, rerenderWithCollapse, resetLayout, toggleAstar, fitView);
  attachConnect(svg, () => ir, rerenderWithCollapse);
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
    // Re-run dagre so node sizes/positions snap to the current cellSize
    // (layout.ts only snaps when astarSettings.enabled is true). Without
    // this, A* would route against an un-snapped layout and the grid cells
    // would not align with node borders.
    layout(currentEff);
    routeAllEffWithCurrentSeparation();
  } else {
    if (btn) { btn.textContent = 'Show A* Feature'; btn.classList.remove('on'); }
    for (const edge of currentEff.edges) delete edge.routedPath;
    for (const edge of ir.edges)         delete edge.routedPath;
    // Restore the appropriate non-A* geometry for the current edgeMode:
    //   • 'dagre'      — re-run dagre so edges get fresh originalPoints.
    //   • 'side-aware' — keep whatever originalPoints are already cached
    //                    (raw dagre from initial load OR side-aware curves
    //                    stamped onto originalPoints by previous drops).
    //                    Re-running layout here would wipe those stamped
    //                    curves and snap node sizes/positions away from
    //                    where the user left them.
    if (astarSettings.edgeMode === 'dagre') {
      layout(currentEff);
    }
  }
  // The Edges button is interactive only while A* is off.
  syncEdgeModeBtnDisabled();
  renderFull(currentEff, svg, true, ir);
  reattach();
  if (overlayWasShown) renderGridOverlay(svg, currentEff);
}

document.getElementById('reset')!.addEventListener('click', () => {
  // Reset clears pinned positions and stale A* paths but preserves collapse
  // state — collapsed subgraphs stay collapsed across reset (matching user
  // intuition: reset is about layout, not disclosure state).
  resetLayout();
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

// Toggle A* edge routing. The two directions are symmetric:
//   off → re-run dagre, drop all cached A* paths, render the curved default.
//   on  → A*-route every edge immediately against the current node positions,
//         render the straight A* polylines. No node drag required.
// Shared logic lives in toggleAstar() above so the context-menu "Toggle A*"
// item can reuse it.
const astarBtn = document.getElementById('toggleAstar');
if (astarBtn) {
  astarBtn.addEventListener('click', () => toggleAstar());
}

// Cycle the edge-separation mode: off → soft → hard → off. When A* is on,
// re-route the whole graph immediately under the new mode so the change is
// visible without requiring a drag.
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

// Toggle the non-A* edge strategy in real time. Orthogonal to A*:
// the A* button continues to control routing independently. When edgeMode
// switches to 'dagre' we re-run layout to overwrite any side-aware curves
// stamped onto originalPoints by a previous drop; 'side-aware' simply keeps
// whatever originalPoints exist (raw dagre or stamped side-aware curves).
// Reuses the same redraw path as toggleAstar so pinned positions, collapse
// state, pan/zoom, and grid overlay persist across switches.
const edgeModeBtn = document.getElementById('toggleEdgeMode');
function labelForEdgeMode(m: EdgeMode): string {
  return m === 'side-aware' ? 'Edges: Side-aware' : 'Edges: Dagre';
}
function applyEdgeMode(): void {
  // While A* is on, A*'s routedPath overrides edgeMode at render time and the
  // drop path short-circuits to A* before reading edgeMode. Re-running layout
  // and redrawing here would be wasted work. The setting is still mutated so
  // the user's preference takes effect the moment A* turns off.
  if (astarSettings.enabled) return;
  const overlayWasShown = isGridOverlayShown(svg);
  if (astarSettings.edgeMode === 'dagre') {
    layout(currentEff);
  }
  renderFull(currentEff, svg, true, ir);
  reattach();
  if (overlayWasShown) renderGridOverlay(svg, currentEff);
}
// Sync the Edges button's interactive state with A*. While A* is on, the
// button is visually disabled (still shows the current edgeMode label so the
// user can see what it'd be set to) and clicks are blocked.
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
  edgeModeBtn.textContent = labelForEdgeMode(astarSettings.edgeMode);
  edgeModeBtn.classList.toggle('on', astarSettings.edgeMode === 'dagre');
  syncEdgeModeBtnDisabled();
  edgeModeBtn.addEventListener('click', () => {
    if (astarSettings.enabled) return;
    astarSettings.edgeMode =
      astarSettings.edgeMode === 'side-aware' ? 'dagre' : 'side-aware';
    edgeModeBtn.textContent = labelForEdgeMode(astarSettings.edgeMode);
    edgeModeBtn.classList.toggle('on', astarSettings.edgeMode === 'dagre');
    applyEdgeMode();
  });
}

// Debug toggle for `chooseEdgesToReverseForMermaidOrder`. Flipping it re-runs
// layout so the subgraph ordering changes immediately. When off, you should
// see raw @dagrejs/dagre ordering — earlier-declared subgraphs ranked above
// later-declared ones on inter-cluster cycles, which is the OPPOSITE of
// Mermaid's reference output on the fixture's T→M / O→Q cycle.
const parityBtn = document.getElementById('toggleMermaidParity');
function labelForParity(on: boolean): string {
  return on ? 'Mermaid parity: On' : 'Mermaid parity: Off';
}
if (parityBtn) {
  parityBtn.textContent = labelForParity(astarSettings.mermaidParity);
  parityBtn.classList.toggle('on', astarSettings.mermaidParity);
  parityBtn.addEventListener('click', () => {
    astarSettings.mermaidParity = !astarSettings.mermaidParity;
    parityBtn.textContent = labelForParity(astarSettings.mermaidParity);
    parityBtn.classList.toggle('on', astarSettings.mermaidParity);
    // Re-run the full pipeline so layout picks up the new flag.
    // Drop pinned positions so the parity change is visible on every node;
    // otherwise drag-pinned nodes would stay put and mask the reordering.
    ir.nodes.forEach(n => { n.pinned = false; delete n.x; delete n.y; });
    ir.edges.forEach(e => { delete e.routedPath; delete e.originalPoints; delete e.points; });
    rerenderWithCollapse();
  });
}

// Re-route every edge that has been A*-routed at least once, using the
// current settings. Then redraw all edges, preserving overlay visibility.
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
    // Padding is locked to cellSize so the obstacle ring stays exactly one
    // cell wide regardless of resolution.
    astarSettings.padding = astarSettings.cellSize;
    if (cellSizeValEl) cellSizeValEl.textContent = cellSizeEl.value;
  });
  // Apply on release so the grid doesn't re-route on every pixel of slider drag.
  // When A* is on, re-run dagre first so node sizes/positions snap to the new
  // cellSize — otherwise nodes keep their old grid-aligned dimensions and the
  // new grid would no longer align with their borders.
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

// ---- Zoom: scroll wheel scales the SVG, centred on the cursor position.
// The pan + zoom state lives in `pan.ts` so both translate components compose
// in a single CSS transform. After the zoom factor changes, we adjust the pan
// so the world point currently under the cursor stays under the cursor.
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;

function applyZoomAt(factor: number, cursorClientX: number, cursorClientY: number): void {
  const oldZoom = getZoom();
  const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, oldZoom * factor));
  if (newZoom === oldZoom) return;
  const rect = svg.getBoundingClientRect();
  const sx = cursorClientX - rect.left;
  const sy = cursorClientY - rect.top;
  // World point under cursor before zoom change.
  const pan = getPan();
  const wx = (sx - pan.x) / oldZoom;
  const wy = (sy - pan.y) / oldZoom;
  // Solve for new pan so that wx, wy still maps to sx, sy under newZoom.
  const newPanX = sx - wx * newZoom;
  const newPanY = sy - wy * newZoom;
  setZoom(newZoom);
  setPan(newPanX, newPanY);
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

import {
  updateNodePosition,
  refreshEdgesFromLayout,
} from './renderer.js';
import { routeEdgesBatch, DEFAULT_CONFIG } from './routing.js';
import { renderGridOverlay, isGridOverlayShown } from './gridOverlay.js';
import { astarSettings } from './astarSettings.js';
import { layout } from './layout.js';
import type { IR } from './types.js';

export function attachDrag(svg: SVGSVGElement, ir: IR, mountEl: SVGElement): () => void {
  let dragging: { id: string; offsetX: number; offsetY: number; moved: boolean } | null = null;
  const ac = new AbortController();
  const opts: AddEventListenerOptions = { signal: ac.signal };

  svg.addEventListener('mousedown', (e: MouseEvent) => {
    const target = (e.target as Element).closest('[data-node-id]');
    if (!target) return;
    const id = target.getAttribute('data-node-id')!;
    const node = ir.nodes.find(n => n.id === id);
    if (!node) return;
    const pt = toSVGPoint(svg, e);
    dragging = { id, offsetX: pt.x - (node.x ?? 0), offsetY: pt.y - (node.y ?? 0), moved: false };
    (target as SVGElement).style.cursor = 'grabbing';
    e.preventDefault();
  }, opts);

  window.addEventListener('mousemove', (e: MouseEvent) => {
    if (!dragging) return;
    dragging.moved = true;
    const pt = toSVGPoint(svg, e);
    updateNodePosition(
      dragging.id,
      pt.x - dragging.offsetX,
      pt.y - dragging.offsetY,
      mountEl,
      ir
    );
    // Keep the grid overlay in sync with the dragged node's live position so
    // you can see blocked cells move as you drag.
    if (isGridOverlayShown(mountEl)) renderGridOverlay(mountEl, ir);
  }, opts);

  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    const droppedId = dragging.id;
    const moved = dragging.moved;
    const node = ir.nodes.find(n => n.id === droppedId);
    if (node) node.pinned = true;
    const nodeEl = mountEl.querySelector(`[data-node-id="${droppedId}"]`) as SVGElement | null;
    if (nodeEl) nodeEl.style.cursor = 'grab';
    dragging = null;

    if (!moved) {
      refreshEdgesFromLayout(mountEl);
      if (isGridOverlayShown(mountEl)) renderGridOverlay(mountEl, ir);
      return;
    }

    // Snap the dropped node so its left/top edge lands on a grid line.
    // Sub-cell drag offsets are absorbed here so the post-drop routing sees a
    // perfectly cell-aligned node — no quantization mismatches between drops.
    if (node && node.width != null && node.height != null) {
      const cell = astarSettings.cellSize;
      const left = Math.round((node.x! - node.width / 2) / cell) * cell;
      const top  = Math.round((node.y! - node.height / 2) / cell) * cell;
      node.x = left + node.width / 2;
      node.y = top  + node.height / 2;
      const nodeElSnap = mountEl.querySelector(`[data-node-id="${droppedId}"]`);
      if (nodeElSnap) {
        nodeElSnap.setAttribute(
          'transform',
          `translate(${node.x - node.width / 2}, ${node.y - node.height / 2})`,
        );
      }
    }

    // A*-route every edge in the graph using the active separation mode so a
    // single drop produces a self-consistent picture. We can't route only the
    // dropped node's edges: with separation = 'soft'/'hard', the cost/block
    // buffer needs every edge's cells in scope, otherwise the dragged edges
    // would ignore the long-running edges they should be avoiding (and would
    // revert to "default A* style" overlapping at the dock). Cheap enough on
    // realistic fixtures — same path the toggle and collapse handlers use.
    //
    // When the A* feature is toggled off, we skip re-routing entirely so the
    // edge falls back to dagre's curved `originalPoints` on the next redraw.
    if (astarSettings.enabled) {
      routeEdgesBatch(ir.edges, ir, DEFAULT_CONFIG, astarSettings.separation);
    } else {
      // A* is off — clear any stale A* paths and re-run dagre with the dropped
      // node pinned so every edge gets a fresh `originalPoints` for the new
      // geometry. Without this, refreshEdgesFromLayout would replay the
      // pre-drag dagre points and edges would visibly disconnect from the
      // moved node (matches the behavior in `../spike/src/drag.ts`).
      for (const edge of ir.edges) delete edge.routedPath;
      layout(ir);
    }

    refreshEdgesFromLayout(mountEl);
    if (isGridOverlayShown(mountEl)) renderGridOverlay(mountEl, ir);
  }, opts);

  return () => ac.abort();
}

function toSVGPoint(svg: SVGSVGElement, e: MouseEvent): { x: number; y: number } {
  const pt = svg.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: e.clientX, y: e.clientY };
  const transformed = pt.matrixTransform(ctm.inverse());
  return { x: transformed.x, y: transformed.y };
}

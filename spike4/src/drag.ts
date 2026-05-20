import {
  updateNodePosition,
  refreshEdgesFromLayout,
  buildSideAwareCurvesForNode,
} from './renderer.js';
import { routeEdgesBatch, DEFAULT_CONFIG } from './routing.js';
import { renderGridOverlay, isGridOverlayShown } from './gridOverlay.js';
import { astarSettings } from './astarSettings.js';
import { edgeSettings } from './edgeSettings.js';
import { layout } from './layout.js';
import type { IR } from './types.js';

export function attachDrag(svg: SVGSVGElement, ir: IR, mountEl: SVGElement): () => void {
  let dragging: { id: string; offsetX: number; offsetY: number; moved: boolean } | null = null;
  const ac = new AbortController();
  const opts: AddEventListenerOptions = { signal: ac.signal };

  svg.addEventListener('mousedown', (e: MouseEvent) => {
    if (e.button !== 0) return;
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
    // Only meaningful when A* is on; with A* off the grid is invisible and
    // snapping would just jerk the node away from where it was dropped.
    if (astarSettings.enabled && node && node.width != null && node.height != null) {
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

    // Drop-time edge geometry. A* runs whenever it's enabled (takes
    // precedence over edgeMode). Otherwise:
    //   • 'side-aware' — persist the distributed side-aware curves drawn live
    //                    so the visible edge doesn't jump on mouseup.
    //   • 'dagre'      — pre-76420cd behaviour: clear cached overrides and
    //                    re-run dagre so connected edges get fresh original
    //                    points for the new geometry. May visibly fold on
    //                    back-edges — that's the point of this mode.
    if (astarSettings.enabled) {
      routeEdgesBatch(ir.edges, ir, DEFAULT_CONFIG, astarSettings.separation);
    } else if (edgeSettings.edgeMode === 'side-aware') {
      const droppedNode = node;
      if (droppedNode) {
        const connectedEdges = ir.edges.filter(e => e.from === droppedId || e.to === droppedId);
        const nodesById = new Map(ir.nodes.map(n => [n.id, n]));
        const curves = buildSideAwareCurvesForNode(
          droppedNode,
          connectedEdges.map(e => ({ from: e.from, to: e.to, ref: e })),
          nodesById,
        );
        for (const edge of connectedEdges) {
          delete edge.routedPath;
          const pts = curves.get(edge);
          if (!pts) continue;
          edge.originalPoints = pts.map(p => ({ ...p }));
          edge.points = pts.map(p => ({ ...p }));
        }
      }
    } else {
      // 'dagre'
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

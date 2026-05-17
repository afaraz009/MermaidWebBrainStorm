import { updateNodePosition, refreshEdgesFromLayout } from './renderer.js';
import { layout } from './layout.js';
import type { IR } from './types.js';

export function attachDrag(svg: SVGSVGElement, ir: IR, mountEl: SVGElement): void {
  let dragging: { id: string; offsetX: number; offsetY: number } | null = null;

  // mousedown on the SVG — find the node that was clicked
  svg.addEventListener('mousedown', (e: MouseEvent) => {
    const target = (e.target as Element).closest('[data-node-id]');
    if (!target) return;
    const id = target.getAttribute('data-node-id')!;
    const node = ir.nodes.find(n => n.id === id);
    if (!node) return;
    const pt = toSVGPoint(svg, e);
    // offsetX/Y = cursor distance from node center at drag start
    dragging = { id, offsetX: pt.x - (node.x ?? 0), offsetY: pt.y - (node.y ?? 0) };
    (target as SVGElement).style.cursor = 'grabbing';
    e.preventDefault();
  });

  // mousemove and mouseup on window so drag continues when cursor leaves the SVG boundary
  window.addEventListener('mousemove', (e: MouseEvent) => {
    if (!dragging) return;
    const pt = toSVGPoint(svg, e);
    updateNodePosition(
      dragging.id,
      pt.x - dragging.offsetX,
      pt.y - dragging.offsetY,
      mountEl,
      ir
    );
  });

  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    const node = ir.nodes.find(n => n.id === dragging!.id);
    if (node) node.pinned = true;
    const nodeEl = mountEl.querySelector(`[data-node-id="${dragging.id}"]`) as SVGElement | null;
    if (nodeEl) nodeEl.style.cursor = 'grab';
    dragging = null;

    // Re-run layout with the dragged node pinned. Dagre returns a fresh
    // multi-waypoint route for every edge given the new node position.
    // `refreshEdgesFromLayout` then replaces the transient 3-point drag
    // overlay with those routes — same outcome as md-diagrams-testing's
    // SET_NODE_POSITION → useEffect → runDagre cycle.
    layout(ir);
    refreshEdgesFromLayout(mountEl);
  });
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

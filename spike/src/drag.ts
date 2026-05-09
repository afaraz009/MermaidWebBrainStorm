import { updateNodePosition, type RenderState } from './renderer';

export function attachDrag(state: RenderState): () => void {
  let dragId: string | null = null;
  let offsetX = 0;
  let offsetY = 0;

  const svgPoint = (clientX: number, clientY: number) => {
    const p = state.svg.createSVGPoint();
    p.x = clientX;
    p.y = clientY;
    const ctm = state.svg.getScreenCTM();
    if (!ctm) return { x: clientX, y: clientY };
    const t = p.matrixTransform(ctm.inverse());
    return { x: t.x, y: t.y };
  };

  const onDown = (ev: MouseEvent) => {
    const target = (ev.target as Element).closest('[data-node-id]') as SVGGElement | null;
    if (!target) return;
    dragId = target.dataset.nodeId!;
    const node = state.ir.nodes.find((n) => n.id === dragId);
    if (!node) return;
    const pt = svgPoint(ev.clientX, ev.clientY);
    offsetX = pt.x - (node.x ?? 0);
    offsetY = pt.y - (node.y ?? 0);
    target.style.cursor = 'grabbing';
    ev.preventDefault();
  };

  const onMove = (ev: MouseEvent) => {
    if (!dragId) return;
    const pt = svgPoint(ev.clientX, ev.clientY);
    updateNodePosition(state, dragId, pt.x - offsetX, pt.y - offsetY);
  };

  const onUp = () => {
    if (!dragId) return;
    const node = state.ir.nodes.find((n) => n.id === dragId);
    if (node) node.pinned = true;
    const target = state.svg.querySelector(`[data-node-id="${dragId}"]`) as SVGGElement | null;
    if (target) target.style.cursor = 'grab';
    dragId = null;
  };

  state.svg.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);

  return () => {
    state.svg.removeEventListener('mousedown', onDown);
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };
}

import type { IR } from './types.js';

const CLICK_THRESHOLD_PX = 4;

// Attach delegated click handlers to the SVG for collapse (subgraph header
// click) and expand (surrogate-node click without drag). The expand path
// watches mousedown/mouseup distance itself so it can tell click apart from
// the drag that drag.ts also services on surrogates (which carry both
// data-node-id and data-surrogate-for).
export function attachCollapseHandlers(
  svg: SVGSVGElement,
  getIR: () => IR,
  rerender: () => void,
): () => void {
  const ac = new AbortController();
  const opts: AddEventListenerOptions = { signal: ac.signal };

  // Collapse: click anywhere inside a subgraph container (rect or label).
  // Subgraphs are siblings in DOM (not nested), so a click in an inner
  // subgraph's painted area hits the inner rect first and collapses just
  // that inner subgraph. Nodes and edges paint on top in their own layers,
  // so node/edge clicks don't bubble through a [data-subgraph-id] ancestor.
  svg.addEventListener('click', (e: MouseEvent) => {
    const sgEl = (e.target as Element).closest('[data-subgraph-id]') as SVGElement | null;
    if (!sgEl) return;
    const sgId = sgEl.getAttribute('data-subgraph-id')!;
    const ir = getIR();
    const sg = ir.subgraphs.find(s => s.id === sgId);
    if (!sg) return;
    sg.collapsed = true;
    rerender();
  }, opts);

  // Expand: mousedown-on-surrogate followed by mouseup-without-significant-move.
  let pressed: { x: number; y: number; sgId: string } | null = null;

  svg.addEventListener('mousedown', (e: MouseEvent) => {
    const surrEl = (e.target as Element).closest('[data-surrogate-for]') as SVGElement | null;
    if (!surrEl) { pressed = null; return; }
    pressed = {
      x: e.clientX,
      y: e.clientY,
      sgId: surrEl.getAttribute('data-surrogate-for')!,
    };
  }, opts);

  window.addEventListener('mouseup', (e: MouseEvent) => {
    if (!pressed) return;
    const dx = e.clientX - pressed.x;
    const dy = e.clientY - pressed.y;
    const moved = Math.hypot(dx, dy) >= CLICK_THRESHOLD_PX;
    const sgId = pressed.sgId;
    pressed = null;
    if (moved) return; // drag.ts handled the move; do not expand.
    const ir = getIR();
    const sg = ir.subgraphs.find(s => s.id === sgId);
    if (!sg) return;
    sg.collapsed = false;
    rerender();
  }, opts);

  return () => ac.abort();
}

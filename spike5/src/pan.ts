// Canvas pan handler. Coexists with drag.ts and collapse.ts via mutually
// exclusive target selectors: pan only engages on mousedown that does NOT
// land on a node, surrogate, edge, or subgraph. Pan + zoom are composed in a
// single CSS transform on the SVG element so the existing wheel-zoom math
// keeps working.

let pan = { x: 0, y: 0 };
let zoom = 1;

let panning: {
  startClientX: number;
  startClientY: number;
  baseX: number;
  baseY: number;
} | null = null;

let transformTargetEl: SVGSVGElement | null = null;

export function getPan(): { x: number; y: number } {
  return { x: pan.x, y: pan.y };
}

export function setPan(x: number, y: number): void {
  pan.x = x;
  pan.y = y;
  applyTransform();
}

export function getZoom(): number {
  return zoom;
}

export function setZoom(z: number): void {
  zoom = z;
  applyTransform();
}

/** Convert a screen-space (client) point into model (SVG-local) coordinates,
 *  accounting for current pan and zoom. */
export function screenToModel(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const rect = svg.getBoundingClientRect();
  return {
    x: (clientX - rect.left - pan.x) / zoom,
    y: (clientY - rect.top  - pan.y) / zoom,
  };
}

function applyTransform(): void {
  if (!transformTargetEl) return;
  transformTargetEl.style.transformOrigin = '0 0';
  transformTargetEl.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
}

export function attachPan(svg: SVGSVGElement): () => void {
  transformTargetEl = svg;
  applyTransform();
  svg.style.cursor = 'grab';

  const ac = new AbortController();
  const opts: AddEventListenerOptions = { signal: ac.signal };

  svg.addEventListener('mousedown', (e: MouseEvent) => {
    // Left-button only. Right-click goes to context menu, middle is ignored.
    if (e.button !== 0) return;

    // Cede to drag.ts / collapse.ts / connect.ts when the press hits a real
    // diagram element or the connect-from handle.
    const t = e.target as Element;
    if (t.closest('[data-node-id], [data-surrogate-for], [data-subgraph-id], [data-edge-key], [data-connect-handle]')) {
      return;
    }

    panning = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      baseX: pan.x,
      baseY: pan.y,
    };
    svg.style.cursor = 'grabbing';
    e.preventDefault();
  }, opts);

  window.addEventListener('mousemove', (e: MouseEvent) => {
    if (!panning) return;
    pan.x = panning.baseX + (e.clientX - panning.startClientX);
    pan.y = panning.baseY + (e.clientY - panning.startClientY);
    applyTransform();
  }, opts);

  window.addEventListener('mouseup', () => {
    if (!panning) return;
    panning = null;
    svg.style.cursor = 'grab';
  }, opts);

  return () => {
    ac.abort();
    transformTargetEl = null;
  };
}

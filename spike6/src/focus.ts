import type { IR } from './types.js';
import { buildAdjacency, setEmphasis, clearEmphasis } from './disclosure-overlay.js';
import { disclosureSettings } from './disclosureSettings.js';

// Focus mode (SPEC §2C). When active, a click on a node isolates its
// neighbourhood (the node + its 1-hop neighbours + connecting edges) by dimming
// everything else — a PURE overlay: it mutates SVG classes only and never calls
// layout() or re-renders, so no node moves.
//
// Wired like drag.ts / collapse.ts: delegated listeners under an AbortController,
// re-attached by entry.ts `reattach()` after any full re-render. The mode itself
// lives in the `disclosureSettings` singleton so it survives a re-render; the
// current *selection* lives only in this closure, so a re-render (which detaches
// and re-attaches) drops it automatically — no stale node id outlives a DOM rebuild.

// Same click-vs-drag threshold collapse.ts uses to tell a click from a drag.
const CLICK_THRESHOLD_PX = 4;
// Neighbourhood radius. Kept a single constant so bumping/configuring it later
// (full connected component, 2-hop, …) is a one-line change — see SPEC §3.
const HOPS = 1;

export function attachFocus(svg: SVGSVGElement, getEff: () => IR): () => void {
  const ac = new AbortController();
  const opts: AddEventListenerOptions = { signal: ac.signal };
  const btn = document.getElementById('toggleFocus');
  const pathBtn = document.getElementById('togglePath');

  // Press bookkeeping to distinguish a select-click from a real drag (drag.ts
  // services the drag itself). `nodeId` is null when the press didn't land on a
  // node — that's an "empty canvas" click.
  let pressed: { x: number; y: number; nodeId: string | null } | null = null;

  // Sync BOTH mode buttons to the shared mode (SPEC §3A — focus and path are
  // mutually exclusive). Entering focus un-lights Path and vice versa.
  function syncButtons(): void {
    btn?.classList.toggle('on', disclosureSettings.mode === 'focus');
    pathBtn?.classList.toggle('on', disclosureSettings.mode === 'path');
  }

  function enterFocus(): void {
    clearEmphasis(svg);   // drop any emphasis left by path mode when switching in.
    disclosureSettings.mode = 'focus';
    syncButtons();
  }

  function exitFocus(): void {
    disclosureSettings.mode = 'default';
    syncButtons();
    clearEmphasis(svg);
  }

  // Emphasise the clicked node's neighbourhood. Frontier expansion so HOPS > 1
  // needs no new logic. Active edges are the clicked node's incident edges (the
  // connecting edges), per SPEC §2C.
  function focusNode(nodeId: string): void {
    const { neighbors, incident } = buildAdjacency(getEff());
    const active = new Set<string>([nodeId]);
    let frontier = new Set<string>([nodeId]);
    for (let h = 0; h < HOPS; h++) {
      const next = new Set<string>();
      for (const id of frontier) {
        for (const nb of neighbors.get(id) ?? []) {
          if (!active.has(nb)) {
            active.add(nb);
            next.add(nb);
          }
        }
      }
      frontier = next;
    }
    const activeEdges = new Set<string>(incident.get(nodeId) ?? []);
    setEmphasis(svg, active, activeEdges);
  }

  // Toolbar toggle. Reflects (and is reflected by) the shared mode singleton.
  btn?.addEventListener('click', () => {
    if (disclosureSettings.mode === 'focus') exitFocus();
    else enterFocus();
  }, opts);

  svg.addEventListener('mousedown', (e: MouseEvent) => {
    if (disclosureSettings.mode !== 'focus' || e.button !== 0) { pressed = null; return; }
    const nodeEl = (e.target as Element).closest('[data-node-id]') as SVGElement | null;
    pressed = {
      x: e.clientX,
      y: e.clientY,
      nodeId: nodeEl ? nodeEl.getAttribute('data-node-id') : null,
    };
  }, opts);

  window.addEventListener('mouseup', (e: MouseEvent) => {
    if (!pressed) return;
    const moved = Math.hypot(e.clientX - pressed.x, e.clientY - pressed.y) >= CLICK_THRESHOLD_PX;
    const nodeId = pressed.nodeId;
    pressed = null;
    if (disclosureSettings.mode !== 'focus') return;
    if (moved) return;                  // real drag — drag.ts handled it; don't select.
    if (nodeId) focusNode(nodeId);      // select → isolate its neighbourhood.
    else clearEmphasis(svg);            // empty-canvas click → clear but STAY in focus.
  }, opts);

  // Esc exits focus mode entirely (back to default), per SPEC §2C.
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape' && disclosureSettings.mode === 'focus') exitFocus();
  }, opts);

  // Reflect the persisted mode on (re)attach so the buttons stay correct after a
  // re-render while in focus mode.
  syncButtons();

  return () => ac.abort();
}

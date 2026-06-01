import type { IR } from './types.js';
import { buildAdjacency, setEmphasis, clearEmphasis } from './disclosure-overlay.js';
import { disclosureSettings } from './disclosureSettings.js';

// BFS reachability set (inclusive of `start`) over a directed adjacency map.
function reach(adj: Map<string, Set<string>>, start: string): Set<string> {
  const seen = new Set<string>([start]);
  const queue: string[] = [start];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const nx of adj.get(cur) ?? []) {
      if (!seen.has(nx)) { seen.add(nx); queue.push(nx); }
    }
  }
  return seen;
}

// Path mode (SPEC §3A) — the final disclosure mode. When active, click two nodes
// and the shortest undirected route between them (nodes + connecting edges) stays
// lit while everything else dims. Like focus, it's a PURE overlay: SVG-class
// mutation only, never layout() / re-render. Second consumer of the shared
// disclosure-overlay primitive.
//
// Wired like focus.ts: AbortController-scoped listeners, re-attached by entry.ts
// `reattach()`. The shared `disclosureSettings.mode` makes path and focus
// mutually exclusive; the in-progress selection lives only in this closure, so a
// re-render drops it.

const CLICK_THRESHOLD_PX = 4;

export function attachPath(svg: SVGSVGElement, getEff: () => IR): () => void {
  const ac = new AbortController();
  const opts: AddEventListenerOptions = { signal: ac.signal };
  const focusBtn = document.getElementById('toggleFocus');
  const pathBtn = document.getElementById('togglePath');

  let pressed: { x: number; y: number; nodeId: string | null } | null = null;
  // First-clicked node of the current pair, or null when awaiting click 1.
  let source: string | null = null;
  // Pending "no path" cue timer, so a rapid second no-route click resets it.
  let cueTimer: number | undefined;

  // Transient "no path" cue: briefly flash the clicked target node so a no-route
  // second click gives feedback (the source stays selected). `.path-no-route`
  // forces full opacity + a red outline over the dim, then fades back out.
  function flashNoRoute(nodeId: string): void {
    const el = svg.querySelector(`[data-node-id="${nodeId}"]`);
    if (!el) return;
    el.classList.add('path-no-route');
    if (cueTimer !== undefined) clearTimeout(cueTimer);
    cueTimer = window.setTimeout(() => {
      el.classList.remove('path-no-route');
      cueTimer = undefined;
    }, 600);
  }
  // Drop a pending cue timer when this attachment is torn down (re-render).
  ac.signal.addEventListener('abort', () => {
    if (cueTimer !== undefined) clearTimeout(cueTimer);
  });

  function syncButtons(): void {
    focusBtn?.classList.toggle('on', disclosureSettings.mode === 'focus');
    pathBtn?.classList.toggle('on', disclosureSettings.mode === 'path');
  }

  function enterPath(): void {
    clearEmphasis(svg);   // drop any emphasis left by focus mode when switching in.
    source = null;
    disclosureSettings.mode = 'path';
    syncButtons();
  }

  function exitPath(): void {
    disclosureSettings.mode = 'default';
    source = null;
    syncButtons();
    clearEmphasis(svg);
  }

  // Click 1: remember the source and show it so the pick is visible.
  function pickSource(nodeId: string): void {
    source = nodeId;
    setEmphasis(svg, getEff(), new Set([nodeId]), new Set());
  }

  // Click 2: highlight EVERY node/edge on ANY directed route source→target, via
  // reachability intersection (captures all parallel branches of any length with
  // no path enumeration). Click order is forgiving: if T isn't reachable from S,
  // we try the reverse once.
  //
  // No directed route either way → KEEP the source selected and its highlight on
  // screen (source bright, rest dimmed), so this reads as "no path to that
  // target" and the next click just retries the target. We deliberately do NOT
  // clearEmphasis here: in a dim-based overlay, clearing un-dims the whole graph,
  // which looks identical to "everything is the path." (User decision; supersedes
  // the spec §3.1 clearEmphasis no-op.) On success we reset the source so the
  // next click starts a fresh selection.
  function completePath(target: string): void {
    const src = source!;
    const eff = getEff();
    const { out, in: inAdj } = buildAdjacency(eff);

    let s = src;
    let t = target;
    let reachFromS = reach(out, s);
    if (!reachFromS.has(t)) {
      // Swap once so click order doesn't matter.
      [s, t] = [t, s];
      reachFromS = reach(out, s);
      if (!reachFromS.has(t)) {
        // Keep source selected; re-assert its highlight (source bright, rest
        // dimmed) and flash the clicked target as a "no path" cue. source stays
        // set → next click retries the target.
        setEmphasis(svg, eff, new Set([src]), new Set());
        flashNoRoute(target);
        return;
      }
    }
    source = null;
    const reachToT = reach(inAdj, t);

    // Nodes on some S→T route = reachable from S AND able to reach T.
    const pathNodes = new Set<string>();
    for (const id of reachFromS) if (reachToT.has(id)) pathNodes.add(id);

    // An edge lies on an S→T route iff its (logical) tail is reachable from S and
    // its (logical) head can reach T (the edge bridges the two reach sets). Use
    // logical endpoints so whole-cluster edges count toward the route.
    const pathEdges = new Set<string>();
    for (const e of eff.edges) {
      const lf = e.fromCluster ?? e.from;
      const lt = e.toCluster ?? e.to;
      if (reachFromS.has(lf) && reachToT.has(lt)) pathEdges.add(e.id);
    }
    setEmphasis(svg, eff, pathNodes, pathEdges);
  }

  pathBtn?.addEventListener('click', () => {
    if (disclosureSettings.mode === 'path') exitPath();
    else enterPath();
  }, opts);

  svg.addEventListener('mousedown', (e: MouseEvent) => {
    if (disclosureSettings.mode !== 'path' || e.button !== 0) { pressed = null; return; }
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
    if (disclosureSettings.mode !== 'path') return;
    if (moved) return;                                   // real drag — drag.ts handled it.
    if (!nodeId) { clearEmphasis(svg); source = null; return; } // empty-canvas: clear + reset, stay.
    if (source === null) pickSource(nodeId);             // click 1
    else completePath(nodeId);                           // click 2 (or restart)
  }, opts);

  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape' && disclosureSettings.mode === 'path') exitPath();
  }, opts);

  // Reflect persisted mode on (re)attach.
  syncButtons();

  return () => ac.abort();
}

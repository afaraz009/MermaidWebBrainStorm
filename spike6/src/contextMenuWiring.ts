// Delegated right-click dispatcher. One listener on the SVG; inspects the
// event target and opens the appropriate menu (canvas / node / edge / subgraph
// / surrogate).

import type { IR } from './types.js';
import { showContextMenu, hideContextMenu, type MenuItem } from './contextMenu.js';
import { screenToModel } from './pan.js';
import {
  addNodeAt,
  addSubgraphAt,
  editNodeLabel,
  cycleNodeShape,
  setNodeShape,
  SHAPES,
  duplicateNode,
  wrapNodeInSubgraph,
  deleteNode,
  editEdgeLabel,
  reverseEdge,
  toggleEdgeDashed,
  duplicateEdge,
  deleteEdge,
  editSubgraphLabel,
  toggleSubgraphCollapsed,
  addNodeToSubgraph,
  addNestedSubgraph,
  deleteSubgraphCascade,
  resolveNodeOrSurrogate,
} from './menuActions.js';

// Connect UX (primary): drag handles on the active node. The right-click
// menu's "Connect from this node…" item calls showHandlesFor(id) which
// reveals the four handle dots on that single node; the user then drags from
// any handle to a target node. See connect.ts.
import { showHandlesFor, hideHandles, getActiveConnectNodeId } from './connect.js';

export function attachContextMenu(
  svg: SVGSVGElement,
  getIR: () => IR,
  rerender: () => void,
  resetLayout: () => void,
  toggleAstar: () => void,
  fitView: () => void,
): () => void {
  const ac = new AbortController();
  const opts: AddEventListenerOptions = { signal: ac.signal };

  svg.addEventListener('contextmenu', (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const ir = getIR();

    // Hit-test resolution. We do three independent passes (most specific
    // first), each fully independent of SVG's painted z-order, so the user
    // gets the menu for the element they're visually pointing at — even
    // when subgraph backgrounds or other elements overlap edges.
    let nodeEl: SVGElement | null = (e.target as Element).closest('[data-node-id]') as SVGElement | null;
    let edgeEl: SVGElement | null = (e.target as Element).closest('[data-edge-key]') as SVGElement | null;
    let sgEl:   SVGElement | null = (e.target as Element).closest('[data-subgraph-id]') as SVGElement | null;

    // If no direct hit, walk the stack at the cursor (elementsFromPoint).
    if (!nodeEl && !edgeEl) {
      const stack = (typeof (document as any).elementsFromPoint === 'function')
        ? (document as any).elementsFromPoint(e.clientX, e.clientY) as Element[]
        : [];
      for (const layer of stack) {
        if (!nodeEl) nodeEl = (layer as Element).closest('[data-node-id]') as SVGElement | null;
        if (!edgeEl) edgeEl = (layer as Element).closest('[data-edge-key]') as SVGElement | null;
        if (!sgEl)   sgEl   = (layer as Element).closest('[data-subgraph-id]') as SVGElement | null;
        if (nodeEl || edgeEl) break;
      }
    }

    // Last-resort edge hit-test: walk every [data-edge-key] in the SVG and
    // check whether the cursor is within EDGE_HIT_TOLERANCE px of the
    // visible path. This bypasses SVG pointer-events entirely, which is
    // what we need when subgraph rects (or any other element) overlay an
    // edge in the painted z-order.
    if (!nodeEl && !edgeEl) {
      const hitKey = hitTestEdgeByGeometry(svg, e.clientX, e.clientY);
      if (hitKey) {
        edgeEl = svg.querySelector(`[data-edge-key="${cssEscape(hitKey)}"]`) as SVGElement | null;
      }
    }

    // Priority: node (incl. surrogate) > edge > subgraph > canvas.
    if (nodeEl) {
      const id = nodeEl.getAttribute('data-node-id')!;
      const info = resolveNodeOrSurrogate(ir, id);
      if (info.kind === 'surrogate' && info.subgraphId) {
        showContextMenu(e.clientX, e.clientY, buildSurrogateMenu(info.subgraphId, ir, rerender));
      } else {
        showContextMenu(e.clientX, e.clientY, buildNodeMenu(id, ir, rerender));
      }
      return;
    }
    if (edgeEl) {
      const key = edgeEl.getAttribute('data-edge-key')!;
      showContextMenu(e.clientX, e.clientY, buildEdgeMenu(key, ir, rerender));
      return;
    }
    if (sgEl) {
      const id = sgEl.getAttribute('data-subgraph-id')!;
      showContextMenu(e.clientX, e.clientY, buildSubgraphMenu(id, ir, rerender));
      return;
    }
    // Canvas (empty area).
    const model = screenToModel(svg, e.clientX, e.clientY);
    showContextMenu(
      e.clientX, e.clientY,
      buildCanvasMenu(model.x, model.y, ir, rerender, resetLayout, toggleAstar, fitView),
    );
  }, opts);

  return () => ac.abort();
}

// ── Menu builders ───────────────────────────────────────────────────────────

function buildCanvasMenu(
  modelX: number, modelY: number,
  ir: IR,
  rerender: () => void,
  resetLayout: () => void,
  toggleAstar: () => void,
  fitView: () => void,
): MenuItem[] {
  return [
    { label: 'Add Node here',     onClick: () => { addNodeAt(ir, modelX, modelY);     rerender(); } },
    { label: 'Add Subgraph here', onClick: () => { addSubgraphAt(ir, modelX, modelY); rerender(); } },
    { separator: true, label: '' },
    { label: 'Fit View',     onClick: () => { fitView(); } },
    { label: 'Reset Layout', onClick: () => { resetLayout(); } },
    { label: 'Toggle A* Routing', onClick: () => { toggleAstar(); } },
  ];
}

function buildNodeMenu(nodeId: string, ir: IR, rerender: () => void): MenuItem[] {
  const node = ir.nodes.find(n => n.id === nodeId);
  if (!node) return [];

  const items: MenuItem[] = [
    {
      label: 'Edit Label…',
      onClick: () => {
        const v = window.prompt('Node label:', node.label);
        if (v != null) { editNodeLabel(ir, nodeId, v); rerender(); }
      },
    },
    {
      label: `Next Shape (${node.shape})`,
      onClick: () => { cycleNodeShape(ir, nodeId); rerender(); },
    },
    {
      label: 'Set Shape…',
      onClick: () => {
        const list = SHAPES.join(', ');
        const v = window.prompt(`Shape (one of: ${list}):`, node.shape);
        if (v != null) {
          const next = v.trim();
          if ((SHAPES as readonly string[]).includes(next)) {
            setNodeShape(ir, nodeId, next as typeof SHAPES[number]);
            rerender();
          }
        }
      },
    },
    {
      label: 'Duplicate',
      onClick: () => { duplicateNode(ir, nodeId); rerender(); },
    },
    {
      label: 'Wrap in Subgraph',
      onClick: () => { wrapNodeInSubgraph(ir, nodeId); rerender(); },
    },
    {
      label: getActiveConnectNodeId() === nodeId
        ? 'Hide Connect Handles'
        : 'Connect from this node…',
      onClick: () => {
        if (getActiveConnectNodeId() === nodeId) hideHandles();
        else showHandlesFor(nodeId);
      },
    },
    { separator: true, label: '' },
    {
      label: 'Delete Node',
      danger: true,
      onClick: () => { hideHandles(); deleteNode(ir, nodeId); rerender(); },
    },
  ];
  return items;
}

function buildEdgeMenu(key: string, ir: IR, rerender: () => void): MenuItem[] {
  // Edge keys are the IR edge `id` (see renderer.ts edgeKey()).
  const edge = ir.edges.find(e => e.id === key);
  if (!edge) return [];

  return [
    {
      label: 'Edit Label…',
      onClick: () => {
        const v = window.prompt('Edge label:', edge.label ?? '');
        if (v != null) { editEdgeLabel(ir, key, v); rerender(); }
      },
    },
    {
      label: 'Reverse Direction',
      onClick: () => { reverseEdge(ir, key); rerender(); },
    },
    {
      label: edge.style === 'dotted' ? 'Make Solid' : 'Make Dashed',
      onClick: () => { toggleEdgeDashed(ir, key); rerender(); },
    },
    {
      label: 'Duplicate',
      onClick: () => { duplicateEdge(ir, key); rerender(); },
    },
    { separator: true, label: '' },
    {
      label: 'Delete Edge',
      danger: true,
      onClick: () => { deleteEdge(ir, key); rerender(); },
    },
  ];
}

function buildSubgraphMenu(sgId: string, ir: IR, rerender: () => void): MenuItem[] {
  const sg = ir.subgraphs.find(s => s.id === sgId);
  if (!sg) return [];

  return [
    {
      label: 'Edit Label…',
      onClick: () => {
        const v = window.prompt('Subgraph label:', sg.label);
        if (v != null) { editSubgraphLabel(ir, sgId, v); rerender(); }
      },
    },
    {
      label: sg.collapsed ? 'Expand' : 'Collapse',
      onClick: () => { toggleSubgraphCollapsed(ir, sgId); rerender(); },
    },
    {
      label: 'Add Node Inside',
      onClick: () => { addNodeToSubgraph(ir, sgId); rerender(); },
    },
    {
      label: 'Add Nested Subgraph',
      onClick: () => { addNestedSubgraph(ir, sgId); rerender(); },
    },
    { separator: true, label: '' },
    {
      label: 'Delete Subgraph (cascade)',
      danger: true,
      onClick: () => { deleteSubgraphCascade(ir, sgId); rerender(); },
    },
  ];
}

function buildSurrogateMenu(sgId: string, ir: IR, rerender: () => void): MenuItem[] {
  const sg = ir.subgraphs.find(s => s.id === sgId);
  if (!sg) return [];
  return [
    {
      label: 'Expand Subgraph',
      onClick: () => { sg.collapsed = false; rerender(); },
    },
    {
      label: 'Edit Label…',
      onClick: () => {
        const v = window.prompt('Subgraph label:', sg.label);
        if (v != null) { editSubgraphLabel(ir, sgId, v); rerender(); }
      },
    },
    { separator: true, label: '' },
    {
      label: 'Delete Subgraph (cascade)',
      danger: true,
      onClick: () => { deleteSubgraphCascade(ir, sgId); rerender(); },
    },
  ];
}

// Re-export so callers don't need a separate import for hide.
export { hideContextMenu };

// ── Geometric edge hit-test ────────────────────────────────────────────────
// Walk every <g data-edge-key> in the SVG and find the closest one whose
// painted path comes within EDGE_HIT_TOLERANCE pixels of the cursor. We use
// path.getPointAtLength + path.getTotalLength to sample the path and measure
// in screen space (after the SVG's CSS transform). Returns the key, or null.
const EDGE_HIT_TOLERANCE = 10;     // px in screen space
const EDGE_HIT_SAMPLES   = 60;     // samples per path

function hitTestEdgeByGeometry(svg: SVGSVGElement, clientX: number, clientY: number): string | null {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const pt = svg.createSVGPoint();

  let bestKey: string | null = null;
  let bestDist = EDGE_HIT_TOLERANCE;

  const groups = svg.querySelectorAll<SVGGElement>('g[data-edge-key]');
  for (const g of groups) {
    const path = g.querySelector('path.edge-hit-area') as SVGPathElement | null;
    if (!path) continue;
    let total = 0;
    try { total = path.getTotalLength(); } catch { total = 0; }
    if (!total || !isFinite(total)) continue;

    for (let i = 0; i <= EDGE_HIT_SAMPLES; i++) {
      const p = path.getPointAtLength((i / EDGE_HIT_SAMPLES) * total);
      pt.x = p.x; pt.y = p.y;
      const screen = pt.matrixTransform(ctm);
      const dx = screen.x - clientX;
      const dy = screen.y - clientY;
      const d = Math.hypot(dx, dy);
      if (d < bestDist) {
        bestDist = d;
        bestKey = g.getAttribute('data-edge-key');
      }
    }
  }
  return bestKey;
}

function cssEscape(s: string): string {
  if (typeof (window as any).CSS?.escape === 'function') return (window as any).CSS.escape(s);
  return s.replace(/[^a-zA-Z0-9_-]/g, m => '\\' + m);
}

// Pure mutations on the source IR for context-menu actions. Each function
// mutates `ir` in place; callers run `rerenderWithCollapse` (or equivalent)
// after to recompute the effective IR and redraw.
//
// Geometry: when new nodes/subgraphs are added at a model-space cursor point,
// we set initial x/y and mark pinned=true so dagre keeps them where the user
// clicked. (If we left them unpinned, dagre would lay them out at the root
// and the placement would feel disconnected from the right-click point.)

import type { IR, IRNode, IREdge, IRSubgraph, NodeShape } from './types.js';
import { isSurrogateId, sgIdFromSurrogate } from './effective-ir.js';

// Initial placeholder size for newly-added nodes. The next layout pass will
// replace these with the shape's canonical size from SHAPE_SIZES in layout.ts.
const NEW_NODE_WIDTH  = 130;
const NEW_NODE_HEIGHT = 40;

function uniqueId(prefix: string, ir: IR): string {
  let n = Date.now();
  const allIds = new Set<string>([
    ...ir.nodes.map(x => x.id),
    ...ir.subgraphs.map(x => x.id),
  ]);
  let id = `${prefix}_${n}`;
  while (allIds.has(id)) { n += 1; id = `${prefix}_${n}`; }
  return id;
}

// ── Canvas actions ──────────────────────────────────────────────────────────

export function addNodeAt(ir: IR, x: number, y: number, parent?: string): IRNode {
  const node: IRNode = {
    id: uniqueId('node', ir),
    label: 'New Node',
    shape: 'rect',
    x, y,
    width: NEW_NODE_WIDTH,
    height: NEW_NODE_HEIGHT,
    pinned: true,
    parent,
  };
  ir.nodes.push(node);
  if (parent) {
    const sg = ir.subgraphs.find(s => s.id === parent);
    if (sg && !sg.children.includes(node.id)) sg.children.push(node.id);
  }
  return node;
}

export function addSubgraphAt(ir: IR, x: number, y: number, parent?: string): IRSubgraph {
  const sgId = uniqueId('sg', ir);
  const childNode = addNodeAt(ir, x, y, sgId);
  const sg: IRSubgraph = {
    id: sgId,
    label: 'Group',
    parent,
    children: [childNode.id],
  };
  ir.subgraphs.push(sg);
  if (parent) {
    const ps = ir.subgraphs.find(s => s.id === parent);
    if (ps && !ps.children.includes(sgId)) ps.children.push(sgId);
  }
  return sg;
}

// ── Node actions ────────────────────────────────────────────────────────────

export function editNodeLabel(ir: IR, nodeId: string, newLabel: string): void {
  const node = ir.nodes.find(n => n.id === nodeId);
  if (node) node.label = newLabel;
}

// Order roughly follows visual similarity so cycling feels natural:
// box family → rounded → pill → subroutine → cylinder → circles → diamond/hex
// → slanted/trapezoid → asymmetric → ellipse.
export const SHAPES: readonly NodeShape[] = [
  'rect',
  'round',
  'stadium',
  'subroutine',
  'cylinder',
  'circle',
  'double-circle',
  'diamond',
  'hexagon',
  'parallelogram',
  'parallelogram-alt',
  'trapezoid',
  'trapezoid-alt',
  'asymmetric',
  'ellipse',
] as const;

export function cycleNodeShape(ir: IR, nodeId: string): void {
  const node = ir.nodes.find(n => n.id === nodeId);
  if (!node) return;
  const i = SHAPES.indexOf(node.shape);
  node.shape = SHAPES[(i + 1) % SHAPES.length];
}

export function setNodeShape(ir: IR, nodeId: string, shape: NodeShape): void {
  const node = ir.nodes.find(n => n.id === nodeId);
  if (node) node.shape = shape;
}

export function duplicateNode(ir: IR, nodeId: string): IRNode | null {
  const node = ir.nodes.find(n => n.id === nodeId);
  if (!node) return null;
  const clone: IRNode = {
    ...node,
    id: uniqueId('node', ir),
    label: node.label + ' (copy)',
    x: (node.x ?? 0) + 30,
    y: (node.y ?? 0) + 30,
    pinned: true,
  };
  ir.nodes.push(clone);
  if (clone.parent) {
    const sg = ir.subgraphs.find(s => s.id === clone.parent);
    if (sg) sg.children.push(clone.id);
  }
  return clone;
}

export function wrapNodeInSubgraph(ir: IR, nodeId: string): IRSubgraph | null {
  const node = ir.nodes.find(n => n.id === nodeId);
  if (!node) return null;
  const sgId = uniqueId('sg', ir);
  const parent = node.parent;
  // Remove from old parent's children
  if (parent) {
    const oldParent = ir.subgraphs.find(s => s.id === parent);
    if (oldParent) oldParent.children = oldParent.children.filter(c => c !== nodeId);
  }
  node.parent = sgId;
  const sg: IRSubgraph = {
    id: sgId,
    label: 'Group',
    parent,
    children: [nodeId],
  };
  ir.subgraphs.push(sg);
  if (parent) {
    const oldParent = ir.subgraphs.find(s => s.id === parent);
    if (oldParent) oldParent.children.push(sgId);
  }
  return sg;
}

export function deleteNode(ir: IR, nodeId: string): void {
  ir.nodes = ir.nodes.filter(n => n.id !== nodeId);
  ir.edges = ir.edges.filter(e => e.from !== nodeId && e.to !== nodeId);
  for (const sg of ir.subgraphs) {
    sg.children = sg.children.filter(c => c !== nodeId);
  }
}

// Mint an edge id that won't collide with existing ones. Parser-adapter
// stamps `L_<idx>`; we use a different prefix + random suffix so menu-minted
// edges remain distinguishable and don't fight the parser's counter.
function mintEdgeId(): string {
  return `E_${Math.random().toString(36).slice(2, 10)}`;
}

export function connectNodes(ir: IR, fromId: string, toId: string): IREdge {
  const edge: IREdge = { id: mintEdgeId(), from: fromId, to: toId, style: 'solid' };
  ir.edges.push(edge);
  return edge;
}

// ── Edge actions ────────────────────────────────────────────────────────────
// Edges are identified by `data-edge-key = <IREdge.id>` in the renderer.

export function findEdgeByKey(ir: IR, key: string): IREdge | undefined {
  return ir.edges.find(e => e.id === key);
}

export function editEdgeLabel(ir: IR, key: string, newLabel: string): void {
  const e = findEdgeByKey(ir, key);
  if (e) e.label = newLabel;
}

export function reverseEdge(ir: IR, key: string): void {
  const e = findEdgeByKey(ir, key);
  if (!e) return;
  const f = e.from; e.from = e.to; e.to = f;
  // Stale geometry — drop so layout re-derives.
  delete e.points; delete e.originalPoints; delete e.routedPath;
}

export function toggleEdgeDashed(ir: IR, key: string): void {
  const e = findEdgeByKey(ir, key);
  if (!e) return;
  e.style = e.style === 'dotted' ? 'solid' : 'dotted';
}

export function duplicateEdge(ir: IR, key: string): IREdge | null {
  const e = findEdgeByKey(ir, key);
  if (!e) return null;
  const clone: IREdge = { id: mintEdgeId(), from: e.from, to: e.to, label: e.label, style: e.style };
  ir.edges.push(clone);
  return clone;
}

export function deleteEdge(ir: IR, key: string): void {
  ir.edges = ir.edges.filter(x => x.id !== key);
}

// ── Subgraph actions ────────────────────────────────────────────────────────

export function editSubgraphLabel(ir: IR, sgId: string, newLabel: string): void {
  const sg = ir.subgraphs.find(s => s.id === sgId);
  if (sg) sg.label = newLabel;
}

export function toggleSubgraphCollapsed(ir: IR, sgId: string): void {
  const sg = ir.subgraphs.find(s => s.id === sgId);
  if (sg) sg.collapsed = !sg.collapsed;
}

export function addNodeToSubgraph(ir: IR, sgId: string): IRNode | null {
  const sg = ir.subgraphs.find(s => s.id === sgId);
  if (!sg) return null;
  // Place near the existing centre of subgraph children, or origin if empty.
  let cx = 0, cy = 0, count = 0;
  for (const cid of sg.children) {
    const child = ir.nodes.find(n => n.id === cid);
    if (child?.x != null && child?.y != null) { cx += child.x; cy += child.y; count++; }
  }
  if (count > 0) { cx /= count; cy /= count; }
  return addNodeAt(ir, cx + 30, cy + 30, sgId);
}

export function addNestedSubgraph(ir: IR, parentSgId: string): IRSubgraph | null {
  const parent = ir.subgraphs.find(s => s.id === parentSgId);
  if (!parent) return null;
  let cx = 0, cy = 0, count = 0;
  for (const cid of parent.children) {
    const child = ir.nodes.find(n => n.id === cid);
    if (child?.x != null && child?.y != null) { cx += child.x; cy += child.y; count++; }
  }
  if (count > 0) { cx /= count; cy /= count; }
  return addSubgraphAt(ir, cx + 30, cy + 30, parentSgId);
}

// Delete a subgraph and all descendant nodes + nested subgraphs. Edges with
// either endpoint inside are dropped.
export function deleteSubgraphCascade(ir: IR, sgId: string): void {
  const sgById = new Map(ir.subgraphs.map(s => [s.id, s] as const));

  const sgsToDelete = new Set<string>();
  const nodesToDelete = new Set<string>();

  function collect(id: string): void {
    const sg = sgById.get(id);
    if (!sg) return;
    sgsToDelete.add(id);
    for (const cid of sg.children) {
      if (sgById.has(cid)) collect(cid);
      else nodesToDelete.add(cid);
    }
  }
  collect(sgId);

  ir.nodes = ir.nodes.filter(n => !nodesToDelete.has(n.id));
  ir.subgraphs = ir.subgraphs.filter(s => !sgsToDelete.has(s.id));
  ir.edges = ir.edges.filter(e => !nodesToDelete.has(e.from) && !nodesToDelete.has(e.to));
  // Remove deleted ids from any remaining parent's children list.
  for (const sg of ir.subgraphs) {
    sg.children = sg.children.filter(c => !nodesToDelete.has(c) && !sgsToDelete.has(c));
  }
}

// ── Surrogate helper: resolve to its underlying subgraph ────────────────────

export function resolveNodeOrSurrogate(ir: IR, nodeId: string): {
  kind: 'node' | 'surrogate';
  subgraphId?: string;
} {
  if (isSurrogateId(nodeId)) {
    return { kind: 'surrogate', subgraphId: sgIdFromSurrogate(nodeId) };
  }
  return { kind: 'node' };
}

import type { IR, IRNode, IREdge, IRSubgraph } from './types.js';

export const SURROGATE_PREFIX = '__sg__';

export function surrogateIdFor(sgId: string): string {
  return SURROGATE_PREFIX + sgId;
}

export function isSurrogateId(id: string): boolean {
  return id.startsWith(SURROGATE_PREFIX);
}

export function sgIdFromSurrogate(id: string): string {
  return id.slice(SURROGATE_PREFIX.length);
}

// Walks the ancestor chain of `sgId` (inclusive) and returns the outermost
// (closest-to-root) subgraph whose `collapsed` flag is true, or undefined.
// "Outermost wins" — if both an outer and an inner ancestor are collapsed,
// the outer ancestor is the one that hides everything beneath it.
function outermostCollapsedAncestor(
  sgId: string | undefined,
  sgById: Map<string, IRSubgraph>,
): string | undefined {
  let cur = sgId;
  let hit: string | undefined;
  while (cur) {
    const sg = sgById.get(cur);
    if (!sg) break;
    if (sg.collapsed) hit = cur;
    cur = sg.parent;
  }
  return hit;
}

export function deriveEffectiveIR(ir: IR): IR {
  const sgById = new Map(ir.subgraphs.map(sg => [sg.id, sg]));

  // 1. Visible leaf nodes: every node whose outermost collapsed ancestor is undefined.
  const nodes: IRNode[] = [];
  for (const n of ir.nodes) {
    const root = n.parent ? outermostCollapsedAncestor(n.parent, sgById) : undefined;
    if (root !== undefined) continue;
    nodes.push({ ...n });
  }

  // 2. Surrogate nodes: one per subgraph that IS the outermost collapsed
  //    (i.e. collapsed itself, and no ancestor above it is collapsed).
  for (const sg of ir.subgraphs) {
    if (!sg.collapsed) continue;
    const outer = sg.parent ? outermostCollapsedAncestor(sg.parent, sgById) : undefined;
    if (outer !== undefined) continue;
    nodes.push({
      id: surrogateIdFor(sg.id),
      label: sg.label,
      shape: 'rect',
      parent: sg.parent,
    });
  }

  // 3. Visible subgraphs: those where neither self nor any ancestor is collapsed.
  const subgraphs: IRSubgraph[] = [];
  for (const sg of ir.subgraphs) {
    const root = outermostCollapsedAncestor(sg.id, sgById);
    if (root !== undefined) continue;
    subgraphs.push({ ...sg, children: sg.children.slice(), collapsed: undefined });
  }

  // 4. Edge remapping with dedup.
  const nodeById = new Map(ir.nodes.map(n => [n.id, n]));
  function remap(id: string): string {
    const n = nodeById.get(id);
    if (!n) return id;
    const root = n.parent ? outermostCollapsedAncestor(n.parent, sgById) : undefined;
    return root ? surrogateIdFor(root) : id;
  }

  const seen = new Set<string>();
  const edges: IREdge[] = [];
  for (const e of ir.edges) {
    const from = remap(e.from);
    const to = remap(e.to);
    if (from === to) continue; // interior edge
    const key = from + '\x00' + to;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({
      from, to,
      label: e.label, style: e.style,
      // Preserve cluster-anchor annotations stamped by parser-adapter so
      // layout.ts can clip edge endpoints to the cluster border instead of
      // the rewritten leaf. Stripping these here was making cluster-endpoint
      // edges visually terminate at deep leaves (e.g. Productivity→Halt
      // landing on Comment in fixture_cyclic_nested_3).
      fromCluster: e.fromCluster,
      toCluster: e.toCluster,
    });
  }

  return { nodes, edges, subgraphs };
}

// Total descendant nodes (deep) of `sgId`, used for the surrogate count badge.
// Counts leaf nodes only, not nested subgraphs themselves.
export function countHiddenDescendants(ir: IR, sgId: string): number {
  const sgById = new Map(ir.subgraphs.map(sg => [sg.id, sg]));
  // Build a child-subgraph index
  const childSgsByParent = new Map<string, string[]>();
  for (const sg of ir.subgraphs) {
    if (!sg.parent) continue;
    if (!childSgsByParent.has(sg.parent)) childSgsByParent.set(sg.parent, []);
    childSgsByParent.get(sg.parent)!.push(sg.id);
  }

  let count = 0;
  const stack = [sgId];
  while (stack.length) {
    const id = stack.pop()!;
    const sg = sgById.get(id);
    if (!sg) continue;
    count += sg.children.length;
    const nested = childSgsByParent.get(id);
    if (nested) stack.push(...nested);
  }
  return count;
}

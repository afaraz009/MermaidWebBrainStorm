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
  //    A surrogate whose collapsed cluster was nested inside another (still
  //    visible) cluster must be registered as a child of that parent — see
  //    step 3. Without this, a parent cluster whose ONLY content was the now-
  //    collapsed nested cluster (e.g. cyc3's `Productivity`, which has no
  //    direct leaf children, only `Apps`) would have an empty `children` array
  //    AND no surviving nested subgraph, so computeClusterBboxes can't size it
  //    and the renderer drops the cluster entirely.
  const surrogateChildrenByParent = new Map<string, string[]>();
  for (const sg of ir.subgraphs) {
    if (!sg.collapsed) continue;
    const outer = sg.parent ? outermostCollapsedAncestor(sg.parent, sgById) : undefined;
    if (outer !== undefined) continue;
    const surrId = surrogateIdFor(sg.id);
    nodes.push({
      id: surrId,
      label: sg.label,
      shape: 'rect',
      parent: sg.parent,
    });
    if (sg.parent) {
      if (!surrogateChildrenByParent.has(sg.parent)) surrogateChildrenByParent.set(sg.parent, []);
      surrogateChildrenByParent.get(sg.parent)!.push(surrId);
    }
  }

  // 3. Visible subgraphs: those where neither self nor any ancestor is
  //    collapsed. A visible cluster's children are its original leaf children
  //    plus any surrogate standing in for a directly-nested collapsed cluster.
  const subgraphs: IRSubgraph[] = [];
  for (const sg of ir.subgraphs) {
    const root = outermostCollapsedAncestor(sg.id, sgById);
    if (root !== undefined) continue;
    const surrogateKids = surrogateChildrenByParent.get(sg.id) ?? [];
    subgraphs.push({ ...sg, children: [...sg.children, ...surrogateKids], collapsed: undefined });
  }

  // 4. Edge remapping with dedup.
  const nodeById = new Map(ir.nodes.map(n => [n.id, n]));
  function remap(id: string): string {
    const n = nodeById.get(id);
    if (!n) return id;
    const root = n.parent ? outermostCollapsedAncestor(n.parent, sgById) : undefined;
    return root ? surrogateIdFor(root) : id;
  }

  // Dedup applies ONLY to surrogate edges produced by collapse — i.e. edges
  // where remap() actually changed an endpoint. Without this gate, two
  // distinct IR edges that legitimately share a (from, to) pair (e.g. the
  // findNonClusterChild reserve-fallback case in fixture_reserve_fallback.mmd
  // where rewriting Start→Cluster to Start→L2 collides with an explicit
  // Start→L2 edge) would silently merge here. The collapse fan-out dedup
  // case still applies: multiple A→Z, B→Z edges where A and B both collapse
  // into surrogate-X dedup to one surrogate-X→Z.
  const seenSurrogate = new Set<string>();
  const edges: IREdge[] = [];
  for (const e of ir.edges) {
    const from = remap(e.from);
    const to = remap(e.to);
    if (from === to) continue; // interior edge
    const remapped = from !== e.from || to !== e.to;
    if (remapped) {
      const key = from + '\x00' + to;
      if (seenSurrogate.has(key)) continue;
      seenSurrogate.add(key);
    }
    // Cluster-anchor annotations: preserve a side's annotation ONLY if that
    // side wasn't remapped into a surrogate. When a side gets collapsed into
    // a surrogate, the original cluster id no longer resolves to anything in
    // the derived IR's `subgraphs` (the cluster has been filtered out) — so
    // the annotation would become dead data that downstream code relies on
    // returning `undefined` from. Strip it explicitly here so the data flow
    // is intentional, not accidental.
    //
    // The non-remapped side keeps its annotation (it still points at a real
    // cluster in the derived IR). Common case: an edge from outside into a
    // collapsed cluster keeps the OUTSIDE side's annotation if it had one,
    // drops the collapsed side's.
    //
    // ⚠ Load-bearing invariant — see the comment block above
    // `reanchorClusterEdges` in layout.ts. The invariant is preserved
    // (annotations always equal the pre-rewrite original endpoint OR are
    // absent); we just clear them where they'd be unresolvable.
    edges.push({
      id: e.id,
      from, to,
      label: e.label, style: e.style,
      fromCluster: from === e.from ? e.fromCluster : undefined,
      toCluster:   to   === e.to   ? e.toCluster   : undefined,
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

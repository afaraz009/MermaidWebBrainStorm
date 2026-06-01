import type { IR } from './types.js';

// Shared disclosure-overlay primitive — pure helpers, no listeners and no mode
// state. Reused by focus mode (Step 2) and path mode (Step 3). All of this is
// framework-agnostic IR-walk + SVG-class mutation, so it ports into the product
// render package largely unchanged.

export interface Adjacency {
  // Undirected neighbours of each node id (focus mode's 1-hop walk uses this).
  neighbors: Map<string, Set<string>>;
  // Incident edge keys (= `e.id` = the `data-edge-key` attribute) of each node id.
  incident: Map<string, string[]>;
  // Directed successors: `from → to` for each edge. Path mode's forward reach.
  out: Map<string, Set<string>>;
  // Directed predecessors: `to → from` for each edge. Path mode's backward reach.
  in: Map<string, Set<string>>;
}

// Build undirected adjacency over the EFFECTIVE IR's edges. Surrogate
// (collapsed-cluster) nodes are ordinary nodes here — they appear in
// `ir.nodes`, so they get entries like any leaf. The edge key is `e.id`, which
// the renderer uses verbatim as `data-edge-key` (see renderer.ts `edgeKey`).
export function buildAdjacency(ir: IR): Adjacency {
  const neighbors = new Map<string, Set<string>>();
  const incident = new Map<string, string[]>();
  const out = new Map<string, Set<string>>();
  const inAdj = new Map<string, Set<string>>();
  for (const n of ir.nodes) {
    neighbors.set(n.id, new Set());
    incident.set(n.id, []);
    out.set(n.id, new Set());
    inAdj.set(n.id, new Set());
  }
  // An endpoint not present in `ir.nodes` (shouldn't happen for a well-formed
  // effective IR, but be defensive) still gets an entry so lookups never miss.
  const ensure = (id: string): void => {
    if (!neighbors.has(id)) neighbors.set(id, new Set());
    if (!incident.has(id)) incident.set(id, []);
    if (!out.has(id)) out.set(id, new Set());
    if (!inAdj.has(id)) inAdj.set(id, new Set());
  };
  for (const e of ir.edges) {
    // Logical endpoints: an edge that connects to a whole cluster is stored
    // against a rewritten representative leaf, with the real cluster id in
    // `fromCluster`/`toCluster`. Build the route graph from those cluster ids so
    // an (expanded) cluster becomes a first-class waypoint, not an arbitrary
    // internal leaf. Leaf↔leaf edges are unchanged. `e.id` stays the edge key.
    const lf = e.fromCluster ?? e.from;
    const lt = e.toCluster ?? e.to;
    ensure(lf);
    ensure(lt);
    neighbors.get(lf)!.add(lt);
    neighbors.get(lt)!.add(lf);
    incident.get(lf)!.push(e.id);
    incident.get(lt)!.push(e.id);
    out.get(lf)!.add(lt);
    inAdj.get(lt)!.add(lf);
  }
  return { neighbors, incident, out, in: inAdj };
}

// Tri-state, cluster-aware emphasis on the live SVG. `activeNodeIds` may contain
// leaf ids AND cluster ids (a cluster that is a route waypoint); `activeEdgeKeys`
// are `e.id`s. Each `[data-node-id]` / `[data-edge-key]` / `[data-subgraph-id]`
// element ends in one of three states (equivalent to the spec's three passes,
// applied per element with precedence active > neutral > dim):
//   • active  — on the route: `.disclosure-active` (accented), no dim.
//   • neutral — inside an on-route cluster, or a cluster containing the route:
//               neither class (normal visibility).
//   • dimmed  — off route: `.disclosure-dim`.
// Containment comes from a read-only walk of `ir.subgraphs` / `ir.nodes`.
export function setEmphasis(
  svg: SVGSVGElement,
  ir: IR,
  activeNodeIds: Set<string>,
  activeEdgeKeys: Set<string>,
): void {
  const sgById = new Map(ir.subgraphs.map((s) => [s.id, s]));
  const nodeById = new Map(ir.nodes.map((n) => [n.id, n]));
  const edgeById = new Map(ir.edges.map((e) => [e.id, e]));

  // Immediate containing subgraph id of a node OR subgraph id.
  const parentOf = (id: string): string | undefined =>
    sgById.has(id) ? sgById.get(id)!.parent : nodeById.get(id)?.parent;

  // Memoised set of ancestor cluster ids (innermost→outermost) for any id.
  const ancCache = new Map<string, Set<string>>();
  const ancestorsOf = (id: string): Set<string> => {
    const hit = ancCache.get(id);
    if (hit) return hit;
    const out = new Set<string>();
    const seen = new Set<string>();
    let p = parentOf(id);
    while (p && !seen.has(p)) { seen.add(p); out.add(p); p = sgById.get(p)?.parent; }
    ancCache.set(id, out);
    return out;
  };

  // Active clusters = active ids that are subgraph ids (route waypoints).
  const activeClusters = new Set<string>();
  for (const id of activeNodeIds) if (sgById.has(id)) activeClusters.add(id);

  const descendantOfActive = (id: string): boolean => {
    for (const a of ancestorsOf(id)) if (activeClusters.has(a)) return true;
    return false;
  };

  // Clusters that contain any active element must stay visible (neutral).
  const ancestorVisible = new Set<string>();
  for (const id of activeNodeIds) for (const a of ancestorsOf(id)) ancestorVisible.add(a);

  const setState = (el: Element, state: 'active' | 'neutral' | 'dim'): void => {
    el.classList.toggle('disclosure-active', state === 'active');
    el.classList.toggle('disclosure-dim', state === 'dim');
  };

  // Leaves: active if selected, neutral if inside an active cluster, else dim.
  svg.querySelectorAll('[data-node-id]').forEach((el) => {
    const id = el.getAttribute('data-node-id')!;
    setState(el, activeNodeIds.has(id) ? 'active' : descendantOfActive(id) ? 'neutral' : 'dim');
  });

  // Clusters: active if a waypoint, neutral if inside an active cluster or
  // containing the route, else dim.
  svg.querySelectorAll('[data-subgraph-id]').forEach((el) => {
    const id = el.getAttribute('data-subgraph-id')!;
    const neutral = descendantOfActive(id) || ancestorVisible.has(id);
    setState(el, activeNodeIds.has(id) ? 'active' : neutral ? 'neutral' : 'dim');
  });

  // Edges: active if on route, neutral if an internal edge of an on-route cluster
  // (both logical endpoints descend from the SAME active cluster), else dim.
  svg.querySelectorAll('[data-edge-key]').forEach((el) => {
    const key = el.getAttribute('data-edge-key')!;
    if (activeEdgeKeys.has(key)) { setState(el, 'active'); return; }
    const e = edgeById.get(key);
    let neutral = false;
    if (e) {
      const lf = e.fromCluster ?? e.from;
      const lt = e.toCluster ?? e.to;
      const al = ancestorsOf(lf);
      const at = ancestorsOf(lt);
      for (const c of activeClusters) if (al.has(c) && at.has(c)) { neutral = true; break; }
    }
    setState(el, neutral ? 'neutral' : 'dim');
  });
}

// Restore full opacity: remove both overlay classes from every element (nodes,
// edges, AND cluster rects). Safe to call when nothing is emphasised.
export function clearEmphasis(svg: SVGSVGElement): void {
  svg.querySelectorAll('.disclosure-dim, .disclosure-active').forEach((el) => {
    el.classList.remove('disclosure-dim', 'disclosure-active');
  });
}

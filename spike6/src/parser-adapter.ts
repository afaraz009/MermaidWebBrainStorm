import type { IR, IRNode, IREdge, IRSubgraph, NodeShape } from './types.js';

// Mermaid-faithful anchor leaf finder for cluster-endpoint edges. When an IR
// edge has a subgraph id as endpoint, we must rewrite the endpoint to one of
// the cluster's descendant LEAVES (dagre rejects compound-node endpoints).
// `findNonClusterChild` mirrors Mermaid's algorithm
// (mermaid.core/dagre-KV5264BT.mjs:162-180): walk the cluster's children,
// prefer the first non-cluster descendant that doesn't have a "common edge"
// with the cluster itself (which would create a dagre self-loop after rewrite).
//
// `pickLast` controls anchor direction — analogous to the old `leafDescendant`'s
// directional flag. Without an extractor + recursive render path, the chosen
// leaf's RANK in dagre's flat compound layout determines where the other
// endpoint lands. Mermaid avoids this concern by recursively rendering
// extracted clusters; we must pick a leaf that gives the right rank.
//
//   pickLast = false (TO side / incoming):
//     subgraphs reversed (matches layout.ts:sortNodesByHierarchy sibling-reverse)
//     + leaves declaration → first/top leaf. Needed by fixture_cyclic_nested_3:
//     DP_Reporter → Productivity must rewrite to Rev_Open (not Ed_Compose) so
//     dfsFAS enters the Apps cycle at the same node as Mermaid's recursive call.
//
//   pickLast = true (FROM side / outgoing):
//     subgraphs declaration + leaves reversed → last/bottom leaf. Needed by
//     fixture_node_to_subgraph: Platform → Done must rewrite to Egress → Done
//     (not Ingress → Done) so dagre ranks Done below the cluster's bottom edge.
function findNonClusterChild(
  id: string,
  rawSubgraphsById: Map<string, any>,
  subgraphIds: Set<string>,
  clusterId: string,
  edges: { from: string; to: string }[],
  pickLast: boolean,
): string | undefined {
  const sg = rawSubgraphsById.get(id);
  if (!sg) return id;  // already a leaf

  // Walk order is asymmetric and chooses anchors that give the right RANK in
  // dagre's flat compound layout (Mermaid avoids this concern via extractor +
  // recursive render; we can't, so direct-leaf vs deep-descendant matters):
  //
  //   pickLast=true (outgoing): reverse the ENTIRE sg.nodes declaration list.
  //     The last-declared child wins. For Pipeline [Pipe_Enter, Stage,
  //     Pipe_Exit], reversed = [Pipe_Exit, Stage, Pipe_Enter] → Pipe_Exit (a
  //     direct leaf at the cluster's BOTTOM rank) is returned. For Stage
  //     [Stage_Coord, DiamondScc], reversed → DiamondScc first → recurse to
  //     D_Join (Stage's bottom rank, deep inside). Works because users
  //     typically declare top-to-bottom in TB layouts.
  //
  //   pickLast=false (incoming): prefer DIRECT leaves (declaration order)
  //     over subgraph descendants. Falls back to subgraph siblings in
  //     REVERSED order only when there are no direct leaves. This handles
  //     two cases simultaneously:
  //       - Pipeline incoming: Pipe_Enter (direct leaf at TOP rank) wins
  //         over Stage's deep descendants (which would land at wrong rank).
  //       - Productivity → Apps → ProdB → Rev_Open: Apps has NO direct
  //         leaves, so we fall through to subgraph-reversed → ProdB first
  //         (matches the sibling-reverse in layout.ts:sortNodesByHierarchy),
  //         and ProdB has direct leaves so picks Rev_Open. Critical for
  //         fixture_cyclic_nested_3 — DP_Reporter must enter the Apps cycle
  //         at the same node Mermaid's recursive render uses.
  let ordered: string[];
  if (pickLast) {
    ordered = (sg.nodes as string[]).slice().reverse();
  } else {
    const subgraphChildren = (sg.nodes as string[]).filter(n => subgraphIds.has(n));
    const leafChildren = (sg.nodes as string[]).filter(n => !subgraphIds.has(n));
    if (leafChildren.length > 0) {
      ordered = [...leafChildren, ...subgraphChildren];
    } else {
      ordered = subgraphChildren.slice().reverse();
    }
  }

  if (ordered.length === 0) return undefined;

  let reserve: string | undefined;
  for (const child of ordered) {
    const _id = findNonClusterChild(child, rawSubgraphsById, subgraphIds, clusterId, edges, pickLast);
    if (!_id) continue;
    const common = findCommonEdges(edges, clusterId, _id);
    if (common.length > 0) {
      reserve = _id;
    } else {
      return _id;
    }
  }
  return reserve;
}

// Mirror of Mermaid's findCommonEdges (mermaid.core/dagre-KV5264BT.mjs:147-160).
// Detects whether picking `id2` as the anchor for cluster `id1` would conflict
// with an existing edge on `id2`. Preserves Mermaid's apparent typo (the .w
// substitution is a no-op: `edge.w === id1 ? id1 : edge.w`) for behavioral
// parity — don't "fix" it without verifying it still matches Mermaid v11.
function findCommonEdges(
  edges: { from: string; to: string }[],
  id1: string,
  id2: string,
): { v: string; w: string }[] {
  const edges1 = edges.filter(e => e.from === id1 || e.to === id1);
  const edges2 = edges.filter(e => e.from === id2 || e.to === id2);
  const edges1Prim = edges1.map(e => ({
    v: e.from === id1 ? id2 : e.from,
    w: e.to === id1 ? id1 : e.to,  // intentional: matches Mermaid line 152
  }));
  const edges2Prim = edges2.map(e => ({ v: e.from, w: e.to }));
  return edges1Prim.filter(p1 => edges2Prim.some(p2 => p1.v === p2.v && p1.w === p2.w));
}

// Mermaid's flowDb is a class instance exposed after parse.
// We access it via the Diagram API introduced in mermaid v10+.
export async function parseToIR(source: string): Promise<IR> {
  // Dynamically import mermaid to avoid SSR issues and get the ESM build.
  const mermaid = (await import('mermaid')).default;

  mermaid.initialize({ startOnLoad: false, suppressErrorRendering: true });

  // mermaid.parse() in v10+ returns a Diagram object with a db property.
  const diagram = await mermaid.mermaidAPI.getDiagramFromText(source);
  const db = (diagram as any).db;

  // getVertices() returns Map<string, FlowVertex>
  const vertexMap: Map<string, any> = db.getVertices();
  // getEdges() returns FlowEdge[]
  const rawEdges: any[] = db.getEdges();
  // getSubGraphs() returns FlowSubGraph[] (flat list)
  const rawSubgraphs: any[] = db.getSubGraphs();

  // Build subgraph hierarchy. Each subgraph has a `nodes` array of child IDs
  // (which can be other subgraph IDs or vertex IDs).
  const subgraphIds = new Set(rawSubgraphs.map((sg: any) => sg.id));

  // Map subgraph id -> parent subgraph id
  const sgParentMap = new Map<string, string>();
  for (const sg of rawSubgraphs) {
    for (const childId of sg.nodes) {
      if (subgraphIds.has(childId)) {
        sgParentMap.set(childId, sg.id);
      }
    }
  }

  const subgraphs: IRSubgraph[] = rawSubgraphs.map((sg: any) => ({
    id: sg.id,
    label: sg.title || sg.id,
    parent: sgParentMap.get(sg.id),
    // children: only direct non-subgraph node children
    children: sg.nodes.filter((n: string) => !subgraphIds.has(n)),
  }));

  // Map vertex id -> parent subgraph id
  const nodeParentMap = new Map<string, string>();
  for (const sg of rawSubgraphs) {
    for (const childId of sg.nodes) {
      if (!subgraphIds.has(childId)) {
        nodeParentMap.set(childId, sg.id);
      }
    }
  }

  const nodes: IRNode[] = [];
  vertexMap.forEach((v: any, id: string) => {
    // Mermaid's flowDb registers a phantom vertex for any id that appears as
    // an edge endpoint, including subgraph ids (e.g. `Entry --> Platform`
    // where Platform is also a `subgraph Platform [...]` block). Skip those
    // — they're already represented as IRSubgraph entries; emitting a leaf
    // node with the same id would render a duplicate shape on top of the
    // cluster's first leaf.
    if (subgraphIds.has(id)) return;
    nodes.push({
      id,
      label: v.text || id,
      shape: mapShape(v.type),
      parent: nodeParentMap.get(id),
    });
  });

  const edges: IREdge[] = rawEdges.map((e: any) => ({
    from: e.start,
    to: e.end,
    label: e.text || undefined,
    style: e.stroke === 'dotted' ? 'dotted' : 'solid',
  }));

  // Rewrite edges whose endpoint is a subgraph id — dagre's compound layout
  // throws on compound-node endpoints. Use findNonClusterChild to pick an
  // anchor leaf (Mermaid-faithful: reverse subgraph sibling order, skip leaves
  // that would create self-loops via shared edges). Stamp `fromCluster`/
  // `toCluster` so layout.ts's edge write-back can clip endpoints to the
  // cluster's drawn bbox instead of the leaf shape outline. Drop the edge if
  // the subgraph is empty.
  const rawSubgraphsById = new Map<string, any>(rawSubgraphs.map((sg: any) => [sg.id, sg]));
  // Pre-stash raw edge endpoints as { from, to } for findCommonEdges.
  // (Don't pass IREdge — findCommonEdges only needs from/to.)
  const rawEndpointPairs = edges.map(e => ({ from: e.from, to: e.to }));

  const rewrittenEdges: IREdge[] = [];
  for (const e of edges) {
    let { from, to } = e;
    let fromCluster: string | undefined;
    let toCluster: string | undefined;
    if (subgraphIds.has(from)) {
      // Outgoing: pickLast=true → last/bottom leaf so dagre ranks the target
      // BELOW the cluster's bottom edge.
      const leaf = findNonClusterChild(from, rawSubgraphsById, subgraphIds, from, rawEndpointPairs, true);
      if (!leaf) {
        console.warn(`[parser-adapter] dropping edge from empty subgraph "${from}" → "${to}"`);
        continue;
      }
      fromCluster = from;
      from = leaf;
    }
    if (subgraphIds.has(to)) {
      // Incoming: pickLast=false → first/top leaf. With sibling-reverse on
      // subgraphs this matches Mermaid's anchor (e.g. Rev_Open for Productivity).
      const leaf = findNonClusterChild(to, rawSubgraphsById, subgraphIds, to, rawEndpointPairs, false);
      if (!leaf) {
        console.warn(`[parser-adapter] dropping edge from "${e.from}" → empty subgraph "${to}"`);
        continue;
      }
      toCluster = to;
      to = leaf;
    }
    if (fromCluster || toCluster) {
      rewrittenEdges.push({ ...e, from, to, fromCluster, toCluster });
    } else {
      rewrittenEdges.push(e);
    }
  }

  return { nodes, edges: rewrittenEdges, subgraphs };
}

// Mermaid's `vertex.type` covers the full FlowVertexTypeParam union; we
// normalise to the IR's NodeShape names. Unknown types (e.g. shapes added by a
// future Mermaid release) fall back to 'rect' so the diagram still renders.
function mapShape(type: string | undefined): NodeShape {
  switch (type) {
    case 'square':         return 'rect';
    case 'rect':           return 'rect';
    case 'round':          return 'round';
    case 'stadium':        return 'stadium';
    case 'subroutine':     return 'subroutine';
    case 'cylinder':       return 'cylinder';
    case 'circle':         return 'circle';
    case 'doublecircle':   return 'double-circle';
    case 'diamond':        return 'diamond';
    case 'hexagon':        return 'hexagon';
    case 'lean_right':     return 'parallelogram';
    case 'lean_left':      return 'parallelogram-alt';
    case 'trapezoid':      return 'trapezoid';
    case 'inv_trapezoid':  return 'trapezoid-alt';
    case 'odd':            return 'asymmetric';
    case 'ellipse':        return 'ellipse';
    default:               return 'rect';
  }
}

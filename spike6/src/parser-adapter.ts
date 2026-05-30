import type { IR, IRNode, IREdge, IRSubgraph, NodeShape, Direction } from './types.js';

// Mermaid-faithful anchor leaf finder for cluster-endpoint edges. When an IR
// edge has a subgraph id as endpoint, we must rewrite the endpoint to one of
// the cluster's descendant LEAVES (dagre rejects compound-node endpoints).
//
// Walks children in the order Mermaid's `graph.children(id)` returns them:
// SUBGRAPHS in REVERSED declaration order first (matches the sibling-reverse
// insertion in layout.ts:sortNodesByHierarchy — Mermaid v11 inserts subgraph
// nodes into the dagre graph in reverse-declaration order), THEN direct LEAVES
// in declaration order. Verified against Mermaid v11 dumps for cyc2/cyc3/cyc4:
//   - cyc2 API_Layer.children = [Service_Tier, API_Router] → first-DFS picks
//     Cache_Lookup (Service_Tier → Cache_Tier → Cache_Lookup).
//   - cyc3 Productivity.children = [Apps] → Apps.children = [ProdB, ProdA]
//     (reversed) → ProdB.children = [Rev_Open, Rev_Comment] → picks Rev_Open.
//   - cyc4 Stage.children = [DiamondScc, Stage_Coord] → DiamondScc.children =
//     [D_Source, D_Left, D_Right, D_Join] → picks D_Source.
//
// `findCommonEdges` short-circuits to `reserve` when picking a child would
// create a dagre self-loop (e.g. a leaf already connected to a sibling that
// also touches the cluster), so the algorithm keeps walking. Direction-
// agnostic: layout.ts's pass-1.5 re-anchors clusters with
// `externalConnections=false` to the extremal leaf by Y (mimicking Mermaid's
// recursive-render encapsulation result, which our flat layout cannot
// replicate natively).
function findNonClusterChild(
  id: string,
  rawSubgraphsById: Map<string, any>,
  subgraphIds: Set<string>,
  clusterId: string,
  edges: { from: string; to: string }[],
  vertexOrder: Map<string, number>,
): string | undefined {
  const sg = rawSubgraphsById.get(id);
  if (!sg) return id;  // already a leaf

  const subgraphChildren = (sg.nodes as string[]).filter(n => subgraphIds.has(n));
  const leafChildren = (sg.nodes as string[]).filter(n => !subgraphIds.has(n));
  // Subgraphs in REVERSE declaration order, then leaves in VERTEX-MAP order
  // (= first-appearance-in-parse order). Matches Mermaid's data4Layout
  // (flowDiagram-DWJPFMVM.mjs:945): subgraphs pushed reverse-decl, then
  // vertices iterated via `getVertices().forEach` (insertion order = parse
  // order). When dagre setParent runs in that order, graph.children(parent)
  // returns the same order.
  //
  // Why this matters: when a leaf appears as an edge endpoint BEFORE the
  // subgraph block declaring it (e.g. `Start --> L2` on line 2, with the
  // `subgraph Cluster ... L1 L2 ...` block on lines 5+), the leaf's
  // first-appearance index is earlier than its sibling declared *only*
  // inside the subgraph. In fixture_reserve_fallback Mermaid sees
  // children(Cluster) = [L2, L1], reserve-fallback returns L1; with naive
  // decl-order [L1, L2] we'd return L2 and the layout asymmetry visible in
  // the screenshot results.
  const sortedLeaves = leafChildren.slice().sort((a, b) => {
    const ai = vertexOrder.get(a) ?? Number.MAX_SAFE_INTEGER;
    const bi = vertexOrder.get(b) ?? Number.MAX_SAFE_INTEGER;
    return ai - bi;
  });
  const ordered = [...subgraphChildren.slice().reverse(), ...sortedLeaves];

  if (ordered.length === 0) return undefined;

  let reserve: string | undefined;
  for (const child of ordered) {
    const _id = findNonClusterChild(child, rawSubgraphsById, subgraphIds, clusterId, edges, vertexOrder);
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

  // Top-level diagram direction. Mermaid normalises arrows internally but
  // still returns 'TD' for top-down; fold it onto dagre's 'TB'. Anything
  // unrecognised falls back to 'TB' so the diagram still lays out.
  const direction = normalizeDirection(db.getDirection?.());

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

  // `id` is the load-bearing edge identity (see types.ts IREdge). Position-
  // based `L_<idx>` is stable across re-parse and matches Mermaid's own
  // `L_<start>_<end>_<counter>` convention closely enough for downstream
  // dagre/renderer keying. Format does not need to leave layout/renderer.
  const edges: IREdge[] = rawEdges.map((e: any, idx: number) => ({
    id: `L_${idx}`,
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

  // Vertex-first-appearance order — mirrors Mermaid's `getVertices()` Map
  // iteration order, which (because Map preserves insertion order and
  // Mermaid's parser inserts vertices on first encounter) equals
  // first-appearance-in-source order. findNonClusterChild uses this to walk
  // leaf children of a cluster the way Mermaid's `graph.children()` does.
  const vertexOrder = new Map<string, number>();
  {
    let i = 0;
    vertexMap.forEach((_v, id) => vertexOrder.set(id, i++));
  }

  const rewrittenEdges: IREdge[] = [];
  for (const e of edges) {
    let { from, to } = e;
    let fromCluster: string | undefined;
    let toCluster: string | undefined;
    if (subgraphIds.has(from)) {
      const leaf = findNonClusterChild(from, rawSubgraphsById, subgraphIds, from, rawEndpointPairs, vertexOrder);
      if (!leaf) {
        console.warn(`[parser-adapter] dropping edge from empty subgraph "${from}" → "${to}"`);
        continue;
      }
      fromCluster = from;
      from = leaf;
    }
    if (subgraphIds.has(to)) {
      const leaf = findNonClusterChild(to, rawSubgraphsById, subgraphIds, to, rawEndpointPairs, vertexOrder);
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

  return { nodes, edges: rewrittenEdges, subgraphs, direction };
}

// Fold Mermaid's direction string onto the dagre rankdir set. 'TD' is
// Mermaid's spelling of top-down; dagre calls it 'TB'. Empty/unknown → 'TB'.
function normalizeDirection(dir: string | undefined): Direction {
  switch (dir) {
    case 'BT': return 'BT';
    case 'LR': return 'LR';
    case 'RL': return 'RL';
    case 'TB':
    case 'TD':
    default:   return 'TB';
  }
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

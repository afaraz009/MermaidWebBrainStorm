import type { IR, IRNode, IREdge, IRSubgraph, NodeShape } from './types.js';

// Mermaid-faithful anchor leaf finder for cluster-endpoint edges. When an IR
// edge has a subgraph id as endpoint, we must rewrite the endpoint to one of
// the cluster's descendant LEAVES (dagre rejects compound-node endpoints).
//
// Walk order is direction-dependent because flat dagre layout can't replicate
// Mermaid's recursive-render encapsulation. Mermaid renders each cluster
// independently then drops it into the parent's layout as a single sized
// node — the cross-edge becomes a normal leaf-to-leaf edge at the parent
// level and never dictates the cluster's interior ordering. We can't do
// that. So the anchor we pick at the FROM side and the TO side directly
// shape dagre's rank assignment and back-edge picks for the cluster:
//
//   pickLast=true (outgoing / FROM-side): walk sg.nodes in DECLARATION
//     order — Mermaid-faithful. Verified against cyc4's dump for
//     `Stage → Pipe_Exit`: Mermaid walks [Stage_Coord, DiamondScc, D_Source]
//     in order, rejects Stage_Coord (common edge with Pipe_Enter→Stage),
//     recurses into DiamondScc, returns D_Source — which puts Pipe_Exit
//     beside DiamondScc's middle rank, matching Mermaid's visual. Pass-1.5
//     in layout.ts then re-anchors TOP-LEVEL outgoing edges to the
//     bottom-most leaf by Y so dagre ranks the target past the cluster
//     bbox bottom (mimicking Mermaid's "single node" encapsulation result).
//
//   pickLast=false (incoming / TO-side): prefer DIRECT leaves over deep
//     descendants, and walk subgraphs in REVERSED declaration order. This
//     deviates from Mermaid's algorithm but matches what Mermaid's
//     recursive-render visual implies for sibling-reverse clusters. For
//     cyc3's `DP_Reporter → Productivity`, declaration-order would pick
//     Ed_Compose (Editor's top leaf), pulling Editor up — but Mermaid
//     renders Reviewer at the top of Apps (sibling-reverse). With this
//     reversed walk we pick Rev_Open instead, so dagre pulls Reviewer up
//     to match. Fallback to subgraph-reversed when no direct leaves are
//     available — Productivity has only [Apps] direct, so we recurse Apps
//     and try ProdB (Reviewer) first.
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

  let ordered: string[];
  if (pickLast) {
    ordered = sg.nodes as string[];
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
      const leaf = findNonClusterChild(from, rawSubgraphsById, subgraphIds, from, rawEndpointPairs, true);
      if (!leaf) {
        console.warn(`[parser-adapter] dropping edge from empty subgraph "${from}" → "${to}"`);
        continue;
      }
      fromCluster = from;
      from = leaf;
    }
    if (subgraphIds.has(to)) {
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

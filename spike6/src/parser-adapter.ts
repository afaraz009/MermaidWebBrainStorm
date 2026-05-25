import type { IR, IRNode, IREdge, IRSubgraph, NodeShape } from './types.js';

// Recursively find a leaf (non-subgraph) descendant of a subgraph by walking
// sg.nodes in declaration order. `pickLast=false` returns the FIRST leaf (used
// as the anchor for INCOMING edges — drops you at the top of the cluster, the
// way Mermaid's findNonClusterChild does); `pickLast=true` returns the LAST
// leaf (used for OUTGOING edges so they leave from the bottom of the cluster).
// Returns undefined for an empty subgraph.
function leafDescendant(
  sgId: string,
  rawSubgraphsById: Map<string, any>,
  subgraphIds: Set<string>,
  pickLast: boolean,
): string | undefined {
  const sg = rawSubgraphsById.get(sgId);
  if (!sg) return undefined;
  const order = pickLast ? [...sg.nodes].reverse() : sg.nodes;
  for (const childId of order) {
    if (subgraphIds.has(childId)) {
      const inner = leafDescendant(childId, rawSubgraphsById, subgraphIds, pickLast);
      if (inner) return inner;
    } else {
      return childId;
    }
  }
  return undefined;
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
  // throws on compound-node endpoints. Anchor to the cluster's BOTTOM leaf for
  // outgoing edges (so the edge leaves from the bottom of the cluster) and the
  // cluster's TOP leaf for incoming edges (so the edge enters at the top). This
  // mirrors Mermaid's effective behavior on `cluster --> node` / `node -->
  // cluster` patterns. Drop the edge if the subgraph is empty.
  const rawSubgraphsById = new Map<string, any>(rawSubgraphs.map((sg: any) => [sg.id, sg]));
  const rewrittenEdges: IREdge[] = [];
  for (const e of edges) {
    let { from, to } = e;
    let rewrote = false;
    if (subgraphIds.has(from)) {
      const leaf = leafDescendant(from, rawSubgraphsById, subgraphIds, true);
      if (!leaf) {
        console.warn(`[parser-adapter] dropping edge from empty subgraph "${from}" → "${to}"`);
        continue;
      }
      from = leaf;
      rewrote = true;
    }
    if (subgraphIds.has(to)) {
      const leaf = leafDescendant(to, rawSubgraphsById, subgraphIds, false);
      if (!leaf) {
        console.warn(`[parser-adapter] dropping edge from "${e.from}" → empty subgraph "${to}"`);
        continue;
      }
      to = leaf;
      rewrote = true;
    }
    rewrittenEdges.push(rewrote ? { ...e, from, to } : e);
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

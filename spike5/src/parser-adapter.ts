import type { IR, IRNode, IREdge, IRSubgraph, NodeShape } from './types.js';

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

  return { nodes, edges, subgraphs };
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

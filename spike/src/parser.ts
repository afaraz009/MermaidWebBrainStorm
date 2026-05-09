import mermaid from 'mermaid';
import type { IR, IRNode, IREdge, IRSubgraph, Shape } from './types';

// Spike note: mermaid.parse() only validates (returns boolean / throws). It does NOT
// return an AST. To get structured graph data we have to reach into the diagram object
// and read the FlowDB. mermaidAPI.getDiagramFromText is the documented escape hatch.
//
// FlowDB exposes:
//   getVertices(): Map<id, FlowVertex>      // nodes
//   getEdges(): FlowEdge[]                  // edges with .start / .end / .stroke / .text
//   getSubGraphs(): FlowSubGraph[]          // each: { id, title, nodes: string[] }
//
// Subgraph nesting: getSubGraphs() returns a FLAT list. Each subgraph's `nodes` array
// contains the IDs of its direct children — which can include OTHER subgraph IDs as
// well as leaf node IDs. We reconstruct the parent map from that.

function mapShape(type: string | undefined): Shape {
  switch (type) {
    case 'square':
    case 'round':
    case 'rect':
      return 'rect';
    case 'cylinder':
      return 'cylinder';
    case 'lean_right':
    case 'lean_left':
    case 'trapezoid':
    case 'inv_trapezoid':
      return 'parallelogram';
    default:
      return 'unknown';
  }
}

function extractText(maybe: any): string {
  if (typeof maybe === 'string') return maybe;
  if (maybe && typeof maybe === 'object' && 'text' in maybe) return String(maybe.text);
  return '';
}

export async function parseFixture(src: string): Promise<IR> {
  mermaid.initialize({ startOnLoad: false, securityLevel: 'loose' });

  // Validate first via the public API. This both confirms the fixture parses
  // and warms whatever internal state getDiagramFromText needs.
  // mermaid.parse() can return a Promise<ParseResult> in v11; we just await it.
  await mermaid.parse(src);

  const api: any = (mermaid as any).mermaidAPI ?? mermaid;
  const diagram: any = await api.getDiagramFromText(src);
  const db: any = diagram.db;

  const verticesMap: Map<string, any> = db.getVertices();
  const flowEdges: any[] = db.getEdges();
  const flowSubgraphs: any[] = db.getSubGraphs();

  // Build subgraph IR + parent map.
  const subgraphIds = new Set<string>(flowSubgraphs.map((s) => s.id));
  const subgraphs: IRSubgraph[] = flowSubgraphs.map((s) => ({
    id: s.id,
    label: extractText(s.title) || s.id,
    childNodeIds: [],
    childSubgraphIds: [],
  }));
  const subgraphById = new Map(subgraphs.map((s) => [s.id, s]));

  for (const s of flowSubgraphs) {
    const ir = subgraphById.get(s.id)!;
    for (const childId of s.nodes ?? []) {
      if (subgraphIds.has(childId)) {
        ir.childSubgraphIds.push(childId);
        const child = subgraphById.get(childId);
        if (child) child.parentId = s.id;
      } else {
        ir.childNodeIds.push(childId);
      }
    }
  }

  // Build node parentId from leaf membership.
  const nodeParent = new Map<string, string>();
  for (const sg of subgraphs) {
    for (const childId of sg.childNodeIds) nodeParent.set(childId, sg.id);
  }

  const nodes: IRNode[] = [];
  for (const [id, v] of verticesMap.entries()) {
    nodes.push({
      id,
      label: extractText(v.text) || id,
      shape: mapShape(v.type),
      parentId: nodeParent.get(id),
    });
  }

  const edges: IREdge[] = flowEdges.map((e) => ({
    from: e.start,
    to: e.end,
    label: extractText(e.text) || undefined,
    style: e.stroke === 'dotted' ? 'dotted' : 'solid',
  }));

  return { nodes, edges, subgraphs };
}

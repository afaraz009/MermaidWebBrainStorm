import dagre from '@dagrejs/dagre';
import type { IR } from './types';

export function layoutIR(ir: IR): IR {
  const g = new dagre.graphlib.Graph({ compound: true, multigraph: false });
  g.setGraph({ rankdir: 'TB', nodesep: 50, ranksep: 50, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));

  // 1. Subgraphs as compound nodes (no width/height — dagre derives from members).
  for (const sg of ir.subgraphs) g.setNode(sg.id, { label: sg.label });
  for (const sg of ir.subgraphs) if (sg.parentId) g.setParent(sg.id, sg.parentId);

  // 2. Real nodes.
  for (const n of ir.nodes) {
    const width = n.label.length * 8 + 24;
    const height = 40;
    g.setNode(n.id, { width, height });
    if (n.parentId) g.setParent(n.id, n.parentId);
  }

  // 3. Edges.
  for (const e of ir.edges) g.setEdge(e.from, e.to, { label: e.label ?? '' });

  dagre.layout(g);

  // 4. Read positions back. Pinned nodes keep their IR-stored x/y.
  for (const n of ir.nodes) {
    const dn = g.node(n.id);
    if (!dn) continue;
    if (!(n.pinned && n.x !== undefined && n.y !== undefined)) {
      n.x = dn.x;
      n.y = dn.y;
    }
    n.width = dn.width;
    n.height = dn.height;
  }

  for (const e of ir.edges) {
    const de = g.edge(e.from, e.to);
    e.points = de?.points ?? [];
  }

  for (const sg of ir.subgraphs) {
    const ds = g.node(sg.id);
    if (!ds) continue;
    sg.x = ds.x;
    sg.y = ds.y;
    sg.width = ds.width;
    sg.height = ds.height;
  }

  return ir;
}

export type Shape = 'rect' | 'cylinder' | 'parallelogram' | 'unknown';

export interface IRNode {
  id: string;
  label: string;
  shape: Shape;
  parentId?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  pinned?: boolean;
}

export interface IREdge {
  from: string;
  to: string;
  label?: string;
  style: 'solid' | 'dotted';
  points?: { x: number; y: number }[];
  // A*-computed polyline; renderer prefers this over `points` when present.
  routedPath?: { x: number; y: number }[];
  // Endpoint coords this routedPath was computed against. Cleared when either endpoint moves.
  routedAt?: { fromX: number; fromY: number; toX: number; toY: number };
}

export interface IRSubgraph {
  id: string;
  label: string;
  parentId?: string;
  childNodeIds: string[];
  childSubgraphIds: string[];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface IR {
  nodes: IRNode[];
  edges: IREdge[];
  subgraphs: IRSubgraph[];
}

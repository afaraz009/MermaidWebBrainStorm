export interface IRNode {
  id: string;
  label: string;
  shape: string;
  parent?: string;
  pinned?: boolean;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface IREdge {
  from: string;
  to: string;
  label?: string;
  style?: 'solid' | 'dotted';
  points?: { x: number; y: number }[];
  originalPoints?: { x: number; y: number }[];
  routedPath?: { x: number; y: number }[];
}

export interface IRSubgraph {
  id: string;
  label: string;
  parent?: string;
  children: string[];
}

export interface IR {
  nodes: IRNode[];
  edges: IREdge[];
  subgraphs: IRSubgraph[];
}

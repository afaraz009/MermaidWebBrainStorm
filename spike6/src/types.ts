// All node shapes the renderer + parser + border-clipper know how to draw.
// Maps 1:1 onto Mermaid flowchart's FlowVertexTypeParam values (see
// `node_modules/mermaid/dist/diagrams/flowchart/types.d.ts`), normalised to a
// single canonical name per shape. `rect` is the fallback for any unknown
// vertex type so the renderer never silently fails on an unrecognised shape.
export type NodeShape =
  | 'rect'           // [text]            — square corners
  | 'round'          // (text)            — rounded rectangle
  | 'stadium'        // ([text])          — pill / fully-rounded rectangle
  | 'subroutine'     // [[text]]          — rectangle with vertical bars
  | 'cylinder'       // [(text)]          — database/disk
  | 'circle'         // ((text))          — circle
  | 'double-circle'  // (((text)))        — circle in a circle
  | 'diamond'        // {text}            — decision rhombus
  | 'hexagon'        // {{text}}          — hexagon
  | 'parallelogram'  // [/text/]          — parallelogram leaning right
  | 'parallelogram-alt' // [\text\]       — parallelogram leaning left
  | 'trapezoid'      // [/text\]          — trapezoid (wide top)
  | 'trapezoid-alt'  // [\text/]          — trapezoid (wide bottom)
  | 'asymmetric'     // >text]            — flag / asymmetric shape ("odd")
  | 'ellipse';       // ellipse           — wide oval (legacy alias)

export interface IRNode {
  id: string;
  label: string;
  shape: NodeShape;
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
  collapsed?: boolean;
}

export interface IR {
  nodes: IRNode[];
  edges: IREdge[];
  subgraphs: IRSubgraph[];
}

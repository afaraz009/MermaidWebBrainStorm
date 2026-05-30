// A/B: swap from @dagrejs/dagre@3 to Mermaid's dagre-d3-es@7 fork.
// Same graphlib API; barycenter/tie-breaking may differ on branch ordering.
import * as graphlib from 'dagre-d3-es/src/graphlib/index.js';
import { layout as dagreLayout } from 'dagre-d3-es/src/dagre/index.js';
import type { IR, IRNode } from './types.js';
import { astarSettings } from './astarSettings.js';
import { computeClusterBboxes } from './cluster-bbox.js';
import {
  ceilTo,
  sizeForShape,
  edgeLabelSize,
  sortNodesByHierarchy,
  collectClusterLeaves,
  computeExternalConnections,
  clipEdgeWaypoints,
} from './layout-core.js';
import { layoutRecursive } from './recursive-layout.js';

// Re-export the label helpers consumed by renderer.ts so its import path
// (`from './layout.js'`) is unchanged after the helper extraction into
// layout-core.ts.
export {
  measureLabel,
  wrapEdgeLabel,
  edgeLabelSize,
  EDGE_LABEL_WRAP_WIDTH,
  EDGE_LABEL_LINE_HEIGHT_EM,
} from './layout-core.js';

export function layout(ir: IR): IR {
  // Selective recursion (Mermaid's `extractor`): a cluster with NO boundary-
  // crossing edge (externalConnections === false) is encapsulated into its own
  // isolated sub-layout with its OWN direction, sized as a single node in its
  // parent, then its children are translated into place. Clusters WITH external
  // connections stay flat (their declared direction is ignored) — which is what
  // the flat path below already does and already matches Mermaid byte-for-byte.
  //
  // Stage 3 gate (deliberately narrow): take the recursive path ONLY when every
  // cluster is encapsulatable (no external cluster anywhere) and nothing is
  // pinned. Mixed graphs (some external + some encapsulated) and pinned graphs
  // fall through to the proven flat path until later stages widen the gate.
  // Per-cluster drawn-rect margins are a recursive-path artefact. Clear any
  // from a previous run so the flat path (and a graph that just flipped
  // recursive→flat) never reads stale margins into computeClusterBboxes.
  ir.clusterMargins = undefined;

  const external = computeExternalConnections(ir);
  const anyExternal = external.size > 0;
  const anyEncapsulatable = ir.subgraphs.some(sg => !external.has(sg.id));
  const anyPinned = ir.nodes.some(n => n.pinned);
  if (anyEncapsulatable && !anyExternal && !anyPinned) {
    return layoutRecursive(ir, external);
  }

  // ── Flat path (legacy; unchanged) ─────────────────────────────────────────
  // Match Mermaid's dagre setup so subgraph rank/column placement aligns with
  // the reference renderer. Mermaid uses `multigraph: true, compound: true`
  // with no explicit acyclicer and lets @dagrejs default-rank the graph.
  const g = new graphlib.Graph({ multigraph: true, compound: true });
  g.setGraph({
    // Honour the diagram's declared flow direction (TB/BT/LR/RL). Flat dagre
    // applies one rankdir to the whole graph — per-subgraph `direction`
    // overrides are not modelled (known parity gap).
    rankdir: ir.direction ?? 'TB',
    nodesep: 50,
    ranksep: 50,
    marginx: 8,
    marginy: 8,
  });
  g.setDefaultEdgeLabel(() => ({}));

  // Grid-snap node sizes/positions only when A* is on. When A* is off the
  // grid is invisible and unused, so coupling layout to cellSize just makes
  // the dagre output drift when the user changes the slider.
  const snapToGrid = astarSettings.enabled;
  const cell = astarSettings.cellSize;
  const snap = (v: number) => (snapToGrid ? ceilTo(v, cell) : v);

  // Node insertion order driven by sortNodesByHierarchy — see helper above.
  // Mermaid calls g.setNode in parent-then-children order, which controls
  // dagre's dfsFAS back-edge picks during cycle breaking. Matching that
  // order is the §8.10 sub-option-2 parity experiment.
  //
  // Subgraph compound nodes — size snapped to cellSize so subgraph
  // boundaries align with grid lines (A* mode only).
  const ordered = sortNodesByHierarchy(ir);
  const sgById = new Map(ir.subgraphs.map(sg => [sg.id, sg]));
  const nodeById = new Map(ir.nodes.map(n => [n.id, n]));

  for (const id of ordered) {
    const sg = sgById.get(id);
    if (sg) {
      g.setNode(sg.id, {
        label: sg.label,
        width: snap(sg.label.length * 8 + 24),
        height: snap(30),
      });
      continue;
    }
    const n = nodeById.get(id);
    if (n) {
      const { w: rawW, h: rawH } = sizeForShape(n.shape, n.label);
      const width = snap(rawW);
      const height = snap(rawH);
      if (n.pinned && n.x != null && n.y != null) {
        g.setNode(n.id, { label: n.label, width, height, x: n.x, y: n.y });
      } else {
        g.setNode(n.id, { label: n.label, width, height });
      }
    }
  }

  // setParent in a second pass — compound graphs require both parent and
  // child to exist as nodes before setParent is called.
  for (const sg of ir.subgraphs) {
    if (sg.parent) g.setParent(sg.id, sg.parent);
  }
  for (const n of ir.nodes) {
    if (n.parent) g.setParent(n.id, n.parent);
  }

  // Pass IREdge.id (4th arg) so dagre's multigraph keeps duplicate (from,to)
  // pairs distinct. Without a name, setEdge keys on (v,w,DEFAULT_EDGE_NAME)
  // and a second call silently overwrites the first — which loses edges
  // when findNonClusterChild's reserve-fallback rewrites a subgraph
  // endpoint to a leaf that's already an endpoint of another explicit edge
  // (see fixture_reserve_fallback.mmd). Mermaid's own dagre calls do the
  // same thing with edge.id.
  for (const e of ir.edges) {
    const { w, h } = e.label ? edgeLabelSize(e.label) : { w: 0, h: 0 };
    g.setEdge(e.from, e.to, { label: e.label || '', weight: 1, width: w, height: h }, e.id);
  }

  dagreLayout(g, {});

  // Pass-1.5: re-anchor cluster-endpoint edges to the actual extremal leaf.
  // findNonClusterChild (parser-adapter) uses a declaration-order heuristic
  // that doesn't always match dagre's final ranking — e.g. cyc3's
  // Productivity→Halt rewrites to Rev_Comment (top of Reviewer, which
  // sibling-reverse + cycle puts at the TOP of the cluster), so Halt ends up
  // at Editor's rank instead of below the whole cluster. Now that pass-1
  // has settled positions, pick the true bottom-most leaf (max Y) for
  // outgoing cluster edges and the true top-most leaf (min Y) for incoming
  // ones, and re-run dagre with the corrected edges. The re-run is cheap on
  // our fixture sizes (≤200 nodes) and converges in one extra pass.
  const edgesChanged = reanchorClusterEdges(ir, g);
  if (edgesChanged) {
    for (const e of g.edges()) g.removeEdge(e);
    for (const e of ir.edges) {
      const { w, h } = e.label ? edgeLabelSize(e.label) : { w: 0, h: 0 };
      g.setEdge(e.from, e.to, { label: e.label || '', weight: 1, width: w, height: h }, e.id);
    }
    dagreLayout(g, {});
  }

  // Write positions back to IR nodes. When A* is on, snap each non-pinned
  // node so its left edge falls on a cell line — round (x - width/2) to a
  // multiple of cellSize and recompute x. This makes the node's outline land
  // exactly on grid lines so the A* grid never has to mark a cell as
  // "partially inside the node." With A* off, take dagre's chosen position
  // verbatim so the cellSize slider doesn't perturb the layout.
  for (const n of ir.nodes) {
    const gn = g.node(n.id);
    if (!gn) continue;
    n.width = gn.width;
    n.height = gn.height;
    if (!n.pinned) {
      if (snapToGrid) {
        const left = Math.round((gn.x - gn.width / 2) / cell) * cell;
        const top  = Math.round((gn.y - gn.height / 2) / cell) * cell;
        n.x = left + gn.width / 2;
        n.y = top  + gn.height / 2;
      } else {
        n.x = gn.x;
        n.y = gn.y;
      }
    }
  }

  // Write edge waypoints, border-clipping the first and last point so
  // endpoints sit on the node edge rather than at the center. For edges
  // whose endpoint was rewritten from a subgraph id (fromCluster/toCluster
  // stamped by parser-adapter.ts), clip to the cluster's drawn bbox instead
  // of the leaf shape's outline — so the edge visually terminates at the
  // cluster border the user sees, matching Mermaid's behavior.
  //
  // Bbox map is computed once for the whole IR — shared with renderer.ts so
  // the clip target is byte-identical to the rectangle drawn on screen.
  const clusterBboxes = computeClusterBboxes(ir);
  const nodesById = new Map(ir.nodes.map(n => [n.id, n]));
  for (const e of ir.edges) {
    const ge = g.edge(e.from, e.to, e.id);
    if (ge && ge.points) {
      const rawPts = (ge.points as { x: number; y: number }[]).map(p => ({ x: p.x, y: p.y }));
      const pts = clipEdgeWaypoints(e, rawPts, clusterBboxes, nodesById);
      e.points = pts;
      e.originalPoints = pts.map(p => ({ ...p }));
    }
  }

  return ir;
}

// Pass-1.5 re-anchor. Only applies to clusters with externalConnections=false
// (no IR edge crosses the cluster boundary except cluster-endpoint edges
// themselves). For these, Mermaid's recursive render encapsulates the cluster
// as a single sized node at the parent's dagre call, and the cross-edge
// target lands above/below as a normal leaf-to-leaf placement. Flat dagre
// can't encapsulate, so we mimic the result by anchoring at the extremal
// leaf by Y — bottom-most for outgoing, top-most for incoming.
//
// For clusters with externalConnections=true (e.g. cyc2 API_Layer with
// Cache_Store→Telemetry_Sink crossing the boundary, or cyc4 Stage with
// Pipe_Enter→Stage_Coord crossing), Mermaid DOES rewrite the cluster edge
// to its first-DFS anchor leaf. In that case we keep the parser-adapter's
// first-DFS pick — which already matches Mermaid byte-for-byte (Cache_Lookup
// for cyc2 API_Layer, D_Source for cyc4 Stage).
//
// `computeExternalConnections` (layout-core.ts) checks each IR edge: if exactly
// one of its endpoints is a descendant of the cluster (XOR), the edge crosses
// the boundary. Cluster-endpoint edges themselves don't count — the cluster
// id is not a descendant of itself in Mermaid's isDescendant.
//
// ┌─── LOAD-BEARING INVARIANT ─────────────────────────────────────────────┐
// │ `e.fromCluster` / `e.toCluster` must ALWAYS equal the pre-rewrite      │
// │ original endpoint when present; absent means the edge had a leaf       │
// │ endpoint originally. Stamped by parser-adapter.ts (parseToIR loop).    │
// │                                                                        │
// │ Any IR pass that rewrites `e.from` / `e.to` MUST either preserve       │
// │ `fromCluster` / `toCluster` unchanged, or clear them explicitly.       │
// │ Silently dropping these annotations breaks:                            │
// │   • the externalConnections check (false negative → wrong anchor       │
// │     choice, e.g. cyc3 Halt drifts off the cluster).                    │
// │   • layout.ts edge writeback (clip target falls back to leaf shape).   │
// │   • renderer.ts drag preview (line snaps to leaf during drag).         │
// │   • routing.ts A* trim (path terminates on leaf, not cluster border).  │
// │                                                                        │
// │ Sites that must maintain the invariant:                                │
// │   • effective-ir.ts:80–98 — collapse/expand edge remap (had one bug    │
// │     here already; field preservation lines 95–97 are load-bearing).   │
// │ Add new sites here as they appear.                                     │
// └────────────────────────────────────────────────────────────────────────┘
function reanchorClusterEdges(ir: IR, g: any): boolean {
  let changed = false;
  // Clusters Mermaid would NOT encapsulate (a real boundary-crossing edge).
  // For the complementary set (externalConnections=false), flat dagre needs
  // the extremal-leaf correction below to mimic Mermaid's encapsulation.
  const external = computeExternalConnections(ir);
  const leafCache = new Map<string, IRNode[]>();
  function leavesOf(id: string): IRNode[] {
    let l = leafCache.get(id);
    if (l) return l;
    l = [];
    collectClusterLeaves(id, ir, l);
    leafCache.set(id, l);
    return l;
  }
  // Extremal-leaf selection runs along the FLOW axis, not always Y. Read the
  // coordinate from g (dagre's output) since IR write-back hasn't happened
  // yet. For LR/RL the flow runs along X; for TB/BT along Y. The "downstream"
  // end (where an outgoing cluster edge should leave from) is the larger
  // coordinate for TB/LR and the smaller for BT/RL — mirror it for incoming.
  // TB stays byte-identical to the previous Y-max/Y-min logic.
  const horizontal = ir.direction === 'LR' || ir.direction === 'RL';
  const downstreamIsMax = ir.direction !== 'BT' && ir.direction !== 'RL';
  const coordOf = (id: string): number => {
    const gn = g.node(id);
    if (!gn) return 0;
    return horizontal ? gn.x : gn.y;
  };
  const pickExtreme = (leaves: IRNode[], wantMax: boolean): IRNode =>
    leaves.reduce((a, b) => {
      const ca = coordOf(a.id), cb = coordOf(b.id);
      return (wantMax ? ca > cb : ca < cb) ? a : b;
    });
  for (const e of ir.edges) {
    if (e.fromCluster && !external.has(e.fromCluster)) {
      const leaves = leavesOf(e.fromCluster);
      if (leaves.length > 0) {
        const downstream = pickExtreme(leaves, downstreamIsMax);
        if (downstream.id !== e.from) { e.from = downstream.id; changed = true; }
      }
    }
    if (e.toCluster && !external.has(e.toCluster)) {
      const leaves = leavesOf(e.toCluster);
      if (leaves.length > 0) {
        const upstream = pickExtreme(leaves, !downstreamIsMax);
        if (upstream.id !== e.to) { e.to = upstream.id; changed = true; }
      }
    }
  }
  return changed;
}

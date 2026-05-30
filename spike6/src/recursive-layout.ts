// Selective recursive layout — the headless port of Mermaid v11's
// extractor/recursiveRender (dagre-KV5264BT.mjs). A cluster with NO boundary-
// crossing edge (externalConnections === false) is laid out in its OWN isolated
// dagre graph with its OWN direction, sized to exactly the rectangle
// cluster-bbox.ts will later derive, inserted into its parent as a single
// placeholder node, then its children are translated into the parent's frame.
//
// This is the piece the flat path could only approximate (and mis-ordered when
// a cluster ran parallel to another branch, and could not honour a per-subgraph
// direction). Clusters WITH external connections are left to the flat path.
//
// Contract (same as layout()): mutate `ir` in place — write n.x/y/width/height
// and e.points/originalPoints — and return it. The cluster-anchor invariant is
// preserved: this module never writes e.from/to/fromCluster/toCluster; the
// per-level dagre endpoint (a placeholder or anchor leaf) is a local build
// detail only.
import * as graphlib from 'dagre-d3-es/src/graphlib/index.js';
import { layout as dagreLayout } from 'dagre-d3-es/src/dagre/index.js';
import type { IR, IRNode, IREdge, Direction } from './types.js';
import { astarSettings } from './astarSettings.js';
import {
  computeClusterBboxes,
  CLUSTER_PADDING,
  CLUSTER_LABEL_OFFSET,
} from './cluster-bbox.js';
import {
  ceilTo,
  sizeForShape,
  edgeLabelSize,
  sortNodesByHierarchy,
  clipEdgeWaypoints,
} from './layout-core.js';

interface LeafBox { x: number; y: number; width: number; height: number }

// One cluster level's result, in that level's LOCAL dagre frame. `width`/
// `height` are the padded placeholder size the parent reserves (== the rect
// cluster-bbox.ts re-derives globally). `contentMin*` is the content bbox
// origin in the local frame, used by the parent to align content inside the
// placeholder at the correct padding offset.
interface SubResult {
  width: number;
  height: number;
  contentMinX: number;
  contentMinY: number;
  leafPos: Map<string, LeafBox>;
  edgePoints: Map<string, { x: number; y: number }[]>;
}

export function layoutRecursive(ir: IR, external: Set<string>): IR {
  // Clusters to encapsulate = subgraphs without a boundary-crossing edge.
  // (Stage 3 gate guarantees `external` is empty, so every cluster qualifies;
  // written generally so Stage 5 can pass a non-empty `external`.)
  const encapsulated = new Set(ir.subgraphs.map(sg => sg.id).filter(id => !external.has(id)));

  const sgById = new Map(ir.subgraphs.map(sg => [sg.id, sg]));
  const nodeById = new Map(ir.nodes.map(n => [n.id, n]));

  const snapToGrid = astarSettings.enabled;
  const cell = astarSettings.cellSize;
  const snap = (v: number) => (snapToGrid ? ceilTo(v, cell) : v);

  // Parent lookup that works for both leaves and subgraphs.
  const parentOf = (id: string): string | undefined =>
    sgById.has(id) ? sgById.get(id)!.parent : nodeById.get(id)?.parent;

  // Ancestor chain [id, parent, …, undefined(root)].
  const ancestorChain = (id: string): (string | undefined)[] => {
    const chain: (string | undefined)[] = [];
    let cur: string | undefined = id;
    while (cur !== undefined) {
      chain.push(cur);
      cur = parentOf(cur);
    }
    chain.push(undefined);
    return chain;
  };

  // Place each edge at the LCA cluster of its LOGICAL endpoints (original
  // endpoints via fromCluster/toCluster), with each endpoint mapped to the
  // direct child of the LCA that contains it (a leaf or an encapsulated-cluster
  // placeholder). This is how a Frontend→Backend edge inside System, or a
  // node→subgraph whole-cluster edge, lands at the right level.
  const edgesByLevel = new Map<string | undefined, { e: IREdge; repFrom: string; repTo: string }[]>();
  for (const e of ir.edges) {
    const lf = e.fromCluster ?? e.from;
    const lt = e.toCluster ?? e.to;
    if (lf === lt) continue;
    const cf = ancestorChain(lf).reverse(); // root … lf
    const ct = ancestorChain(lt).reverse(); // root … lt
    let i = 0;
    while (i < cf.length && i < ct.length && cf[i] === ct[i]) i++;
    const lca = cf[i - 1];                       // last common ancestor
    const repFrom = (i < cf.length ? cf[i] : lf) as string; // child of LCA toward lf
    const repTo = (i < ct.length ? ct[i] : lt) as string;
    if (repFrom === repTo) continue;             // degenerate (self within a child)
    if (!edgesByLevel.has(lca)) edgesByLevel.set(lca, []);
    edgesByLevel.get(lca)!.push({ e, repFrom, repTo });
  }

  // Replicate Mermaid's edge-order side-effect: `adjustClustersAndEdges`
  // removeEdge+setEdge's every cluster-touching edge, which moves whole-cluster
  // edges to the END of each level's edge list (leaf↔leaf edges keep their
  // original order). This edge insertion order is load-bearing — it flips
  // dagre's barycenter tiebreak for parallel branches (e.g. Proc-vs-Audit in
  // fixture_rl_chain: with whole-cluster edges last, Proc lands below Audit,
  // matching Mermaid). Array.sort is stable, so equal-key edges keep order.
  for (const list of edgesByLevel.values()) {
    const touches = (x: { repFrom: string; repTo: string }) =>
      encapsulated.has(x.repFrom) || encapsulated.has(x.repTo) ? 1 : 0;
    list.sort((a, b) => touches(a) - touches(b));
  }

  // Recursively lay out one cluster level. `clusterId === undefined` is the
  // whole-diagram root. Returns positions in this level's LOCAL frame; the
  // caller composes by a single additive translation.
  function layoutCluster(
    clusterId: string | undefined,
    parentRankdir: Direction | undefined,
    parentRanksep: number,
  ): SubResult {
    const sg = clusterId !== undefined ? sgById.get(clusterId) : undefined;
    // Direction: root honours the diagram direction; an encapsulated cluster
    // honours its own declared `direction`, else Mermaid's default-axis flip
    // (parent TB → LR, otherwise TB) — verbatim from extractor line 316.
    const dir: Direction = clusterId === undefined
      ? (ir.direction ?? 'TB')
      : (sg?.direction ?? (parentRankdir === 'TB' ? 'LR' : 'TB'));

    // Mermaid bumps an ENCAPSULATED cluster's own sub-layout ranksep by 25 over
    // its parent's (recursiveRender lines 424-428: `node.graph.setGraph({…,
    // ranksep: ranksep + 25})` set by the parent before recursing), compounding
    // with depth. The root uses the diagram default (50). nodesep is unchanged.
    const ranksep = clusterId === undefined ? 50 : parentRanksep + 25;

    const g = new graphlib.Graph({ multigraph: true, compound: true });
    g.setGraph({ rankdir: dir, nodesep: 50, ranksep, marginx: 8, marginy: 8 });
    g.setDefaultEdgeLabel(() => ({}));

    // Insert this level's direct members in Mermaid order (encapsulated child
    // clusters are single placeholders → `stopAt`).
    const ordered = sortNodesByHierarchy(ir, { parent: clusterId, stopAt: encapsulated });
    const subResults = new Map<string, SubResult>();
    for (const id of ordered) {
      if (sgById.has(id)) {
        const sub = layoutCluster(id, dir, ranksep);
        subResults.set(id, sub);
        g.setNode(id, { label: sgById.get(id)!.label, width: snap(sub.width), height: snap(sub.height) });
      } else {
        const n = nodeById.get(id);
        if (!n) continue;
        const { w, h } = sizeForShape(n.shape, n.label);
        g.setNode(id, { label: n.label, width: snap(w), height: snap(h) });
      }
    }

    const levelEdges = edgesByLevel.get(clusterId) ?? [];
    for (const { e, repFrom, repTo } of levelEdges) {
      const { w, h } = e.label ? edgeLabelSize(e.label) : { w: 0, h: 0 };
      g.setEdge(repFrom, repTo, { label: e.label || '', weight: 1, width: w, height: h }, e.id);
    }

    dagreLayout(g, {});

    // Collect positions in this level's local frame, translating each
    // encapsulated child's sub-result so its content sits at the correct
    // padding offset inside its placeholder.
    const leafPos = new Map<string, LeafBox>();
    const edgePoints = new Map<string, { x: number; y: number }[]>();
    for (const id of ordered) {
      const gn = g.node(id);
      if (!gn) continue;
      if (sgById.has(id)) {
        const sub = subResults.get(id)!;
        const tx = (gn.x - gn.width / 2) + CLUSTER_PADDING - sub.contentMinX;
        const ty = (gn.y - gn.height / 2) + CLUSTER_PADDING + CLUSTER_LABEL_OFFSET - sub.contentMinY;
        for (const [lid, p] of sub.leafPos) {
          leafPos.set(lid, { x: p.x + tx, y: p.y + ty, width: p.width, height: p.height });
        }
        for (const [eid, pts] of sub.edgePoints) {
          edgePoints.set(eid, pts.map(p => ({ x: p.x + tx, y: p.y + ty })));
        }
      } else {
        leafPos.set(id, { x: gn.x, y: gn.y, width: gn.width, height: gn.height });
      }
    }
    // Edges placed at this level: raw dagre points in local frame.
    for (const { e, repFrom, repTo } of levelEdges) {
      const ge = g.edge(repFrom, repTo, e.id);
      if (ge && ge.points) {
        edgePoints.set(e.id, (ge.points as { x: number; y: number }[]).map(p => ({ x: p.x, y: p.y })));
      }
    }

    // Content bbox over this level's DIRECT members (leaf rects + nested-cluster
    // PLACEHOLDER rects), NOT the flattened descendant leaves. This is the
    // load-bearing fix for nested sizing: computeClusterBboxes draws a cluster
    // by enclosing its nested clusters' padded bboxes (padding compounds per
    // nesting level), so the placeholder must be sized the same way — a nested
    // cluster contributes its full drawn extent (== its placeholder rect, by
    // construction), not just its leaves. Measuring from leaves undercounts the
    // nested padding, making the drawn rect overflow the space dagre reserved
    // and overlap siblings/parents (e.g. the Root node in deep nesting).
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const id of ordered) {
      const gn = g.node(id);
      if (!gn) continue;
      minX = Math.min(minX, gn.x - gn.width / 2);
      minY = Math.min(minY, gn.y - gn.height / 2);
      maxX = Math.max(maxX, gn.x + gn.width / 2);
      maxY = Math.max(maxY, gn.y + gn.height / 2);
    }
    if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 0; maxY = 0; }
    const contentW = maxX - minX;
    const contentH = maxY - minY;
    return {
      width: contentW + 2 * CLUSTER_PADDING,
      height: contentH + 2 * CLUSTER_PADDING + CLUSTER_LABEL_OFFSET,
      contentMinX: minX,
      contentMinY: minY,
      leafPos,
      edgePoints,
    };
  }

  const root = layoutCluster(undefined, undefined, 50);

  // Write global leaf positions back to the IR.
  for (const n of ir.nodes) {
    const p = root.leafPos.get(n.id);
    if (!p) continue;
    n.x = p.x;
    n.y = p.y;
    n.width = p.width;
    n.height = p.height;
  }

  // Clip edge waypoints through the SAME helper the flat path uses, so endpoint
  // geometry (leaf border vs cluster-rect perpendicular) is identical. Cluster
  // bboxes are re-derived globally from the just-written leaf positions and, by
  // construction (§ placeholder sizing), equal the placeholder rect dagre
  // reserved — so a whole-cluster edge clips to the drawn border.
  const clusterBboxes = computeClusterBboxes(ir);
  const nodesById = new Map(ir.nodes.map(n => [n.id, n]));
  for (const e of ir.edges) {
    const rawPts = root.edgePoints.get(e.id);
    if (!rawPts || rawPts.length === 0) continue;
    const pts = clipEdgeWaypoints(e, rawPts, clusterBboxes, nodesById);
    e.points = pts;
    e.originalPoints = pts.map(p => ({ ...p }));
  }

  return ir;
}

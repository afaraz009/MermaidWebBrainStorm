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
import { computeClusterBboxes } from './cluster-bbox.js';
import {
  ceilTo,
  sizeForShape,
  edgeLabelSize,
  sortNodesByHierarchy,
  clipEdgeWaypoints,
} from './layout-core.js';

// Mermaid sizes a cluster's drawn rect == the dagre compound box dagre lays its
// children into. That box exceeds the children's bbox by, on each side:
//   • the RANK axis (direction of dagre ranks): ranksep / 2
//   • the CROSS axis (perpendicular): (nodesep + edgesep) / 2
// derived empirically from Mermaid's `Graph after layout` dumps (exact across
// fixture_lr_nested / node_to_subgraph / lr_subdir / rl_chain — 13 clusters)
// and confirmed against @dagrejs/dagre's border-node separation (`sep()` uses
// edgesep/2 for the dummy border node + nodesep/2 for the adjacent real child).
// nodesep/edgesep match the sub-graph's dagre config (50 / dagre default 20);
// ranksep is per-cluster (parentRanksep + 25) and passed in.
const DAGRE_NODESEP = 50;
const DAGRE_EDGESEP = 20;
const CROSS_HALF_MARGIN = (DAGRE_NODESEP + DAGRE_EDGESEP) / 2; // 35
// When a cluster's sole member is a NON-extracted nested cluster, the two sit
// as nested dagre compounds in one graph and their borders are dummy↔dummy, so
// the OUTER cluster's cross-axis half-margin shrinks to edgesep (20, vs 35 for
// a real-node child). Verified on fixture_deep_5level (L3 around L4: +40, not
// +70). See `nonExtracted` in layoutRecursive.
const NESTED_CROSS_HALF_MARGIN = DAGRE_EDGESEP; // 20

interface LeafBox { x: number; y: number; width: number; height: number }

// One cluster level's result, in that level's LOCAL dagre frame. `width`/
// `height` are the cluster's compound-box size the parent reserves as the
// placeholder node — and, by construction, == the rect cluster-bbox.ts
// re-derives globally from the leaf positions + the per-cluster margins this
// module records. `contentCenter*` is the centre of the direct-member content
// bbox in the local frame; the parent centres this child's content on the
// placeholder centre (the box is symmetric about the content centre).
interface SubResult {
  width: number;
  height: number;
  contentCenterX: number;
  contentCenterY: number;
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

  // Empirical Mermaid extraction rule (verified on fixture_deep_5level's L4
  // against the extraction dump): a cluster is NOT extracted into its own
  // sub-layout when it is the SOLE child of its parent AND contains only leaves
  // (no nested subgraph). Mermaid keeps such a cluster as a nested dagre
  // COMPOUND inside its parent's graph — so it shares the parent's ranksep (NO
  // +25 bump) and the parent reserves a tighter cross-margin (edgesep, not
  // nodesep+edgesep). We mirror it: the cluster is transparent to the recursion
  // (its leaves are laid out directly in the nearest extracted ancestor's
  // level) and both rects are painted from the recorded margins. `extracted` is
  // therefore the set that actually gets its own placeholder + sub-graph.
  const childCount = new Map<string | undefined, number>();
  for (const n of ir.nodes) childCount.set(n.parent, (childCount.get(n.parent) ?? 0) + 1);
  for (const sg of ir.subgraphs) childCount.set(sg.parent, (childCount.get(sg.parent) ?? 0) + 1);
  const parentsOfSubgraphs = new Set(
    ir.subgraphs.map(sg => sg.parent).filter((p): p is string => p !== undefined),
  );
  const nonExtracted = new Set<string>();
  for (const sg of ir.subgraphs) {
    if (!encapsulated.has(sg.id)) continue;
    const soleChild = (childCount.get(sg.parent) ?? 0) === 1;
    const leafOnly = !parentsOfSubgraphs.has(sg.id);
    if (soleChild && leafOnly) nonExtracted.add(sg.id);
  }
  const extracted = new Set([...encapsulated].filter(id => !nonExtracted.has(id)));

  const snapToGrid = astarSettings.enabled;
  const cell = astarSettings.cellSize;
  const snap = (v: number) => (snapToGrid ? ceilTo(v, cell) : v);

  // Per-cluster drawn-rect half-margins (per side, per axis) recorded as each
  // cluster is sized, then handed to computeClusterBboxes (via ir.clusterMargins)
  // so the DRAWN rect equals the placeholder == Mermaid's compound box. Keyed by
  // cluster id (margins are sizes, frame-invariant — no translation needed).
  const clusterMargins = new Map<string, { x: number; y: number }>();

  // Parent lookup that works for both leaves and subgraphs.
  const parentOf = (id: string): string | undefined =>
    sgById.has(id) ? sgById.get(id)!.parent : nodeById.get(id)?.parent;

  // Effective parent for edge placement: skip non-extracted clusters, which are
  // transparent — their leaves live in the nearest extracted ancestor's graph,
  // so an edge inside one (e.g. Leaf1→Leaf2 inside the non-extracted L4) must be
  // placed at that ancestor's level with the leaves themselves as endpoints.
  const effectiveParentOf = (id: string): string | undefined => {
    let p = parentOf(id);
    while (p !== undefined && nonExtracted.has(p)) p = parentOf(p);
    return p;
  };

  // Ancestor chain [id, effective-parent, …, undefined(root)] — non-extracted
  // clusters are omitted so the LCA + per-level representative land on an
  // extracted cluster (or a leaf), never on a transparent cluster.
  const ancestorChain = (id: string): (string | undefined)[] => {
    const chain: (string | undefined)[] = [];
    let cur: string | undefined = id;
    while (cur !== undefined) {
      chain.push(cur);
      cur = effectiveParentOf(cur);
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
      extracted.has(x.repFrom) || extracted.has(x.repTo) ? 1 : 0;
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

    // Insert this level's direct members in Mermaid order. EXTRACTED child
    // clusters are single placeholders → `stopAt: extracted`. A NON-extracted
    // child cluster is transparent: it is NOT a node here; its leaves are
    // emitted by sortNodesByHierarchy (descended through, since it is not in
    // `stopAt`) and laid out flat in this graph at THIS level's ranksep —
    // exactly as Mermaid lays a non-extracted nested compound.
    const ordered = sortNodesByHierarchy(ir, { parent: clusterId, stopAt: extracted });
    const subResults = new Map<string, SubResult>();
    for (const id of ordered) {
      if (extracted.has(id)) {
        const sub = layoutCluster(id, dir, ranksep);
        subResults.set(id, sub);
        g.setNode(id, { label: sgById.get(id)!.label, width: snap(sub.width), height: snap(sub.height) });
      } else if (sgById.has(id)) {
        continue; // non-extracted nested cluster — transparent (leaves laid flat)
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
    // encapsulated child's sub-result so its content centre lands on the
    // placeholder centre. The placeholder size == the child's compound box,
    // which is symmetric about the child's content centre, so centring is the
    // correct anchor (the per-side margins fall out equal on both sides).
    const leafPos = new Map<string, LeafBox>();
    const edgePoints = new Map<string, { x: number; y: number }[]>();
    for (const id of ordered) {
      const gn = g.node(id);
      if (!gn) continue;
      if (sgById.has(id)) {
        const sub = subResults.get(id)!;
        const tx = gn.x - sub.contentCenterX;
        const ty = gn.y - sub.contentCenterY;
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

    const rankHalf = ranksep / 2;
    const horizIsRank = dir === 'LR' || dir === 'RL';

    // A NON-extracted child cluster has no node in `g`; size its drawn rect from
    // its own leaves (laid out flat here) + a NORMAL margin (35 cross / ranksep
    // /2 rank, this level's dir & ranksep — it shares them), record that margin,
    // and let it stand in for its leaves when sizing THIS cluster's content
    // bbox. Maps id → its box corners in the local frame. Empty in the common
    // (fully-extracted) case, so behaviour there is unchanged.
    const nonExtBox = new Map<string, { x0: number; y0: number; x1: number; y1: number }>();
    const leavesOfNonExt = new Set<string>();
    for (const id of ordered) {
      if (!nonExtracted.has(id)) continue;
      let a0 = Infinity, b0 = Infinity, a1 = -Infinity, b1 = -Infinity;
      for (const n of ir.nodes) {
        if (n.parent !== id) continue;
        leavesOfNonExt.add(n.id);
        const gn = g.node(n.id);
        if (!gn) continue;
        a0 = Math.min(a0, gn.x - gn.width / 2);
        b0 = Math.min(b0, gn.y - gn.height / 2);
        a1 = Math.max(a1, gn.x + gn.width / 2);
        b1 = Math.max(b1, gn.y + gn.height / 2);
      }
      if (!isFinite(a0)) continue;
      const mx = horizIsRank ? rankHalf : CROSS_HALF_MARGIN;
      const my = horizIsRank ? CROSS_HALF_MARGIN : rankHalf;
      clusterMargins.set(id, { x: mx, y: my });
      nonExtBox.set(id, { x0: a0 - mx, y0: b0 - my, x1: a1 + mx, y1: b1 + my });
    }

    // Content bbox over this level's DIRECT members (leaf rects + extracted-
    // cluster PLACEHOLDER rects + NON-extracted child BOXES), NOT the flattened
    // descendant leaves. Each member contributes its full drawn extent so the
    // box stacks correctly per nesting level — the same way computeClusterBboxes
    // re-derives it globally by enclosing nested boxes. Leaves owned by a non-
    // extracted child are skipped (their box already covers them).
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const id of ordered) {
      const box = nonExtBox.get(id);
      if (box) {
        minX = Math.min(minX, box.x0); minY = Math.min(minY, box.y0);
        maxX = Math.max(maxX, box.x1); maxY = Math.max(maxY, box.y1);
        continue;
      }
      if (leavesOfNonExt.has(id)) continue;
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

    // Size the compound box like Mermaid: rank-axis half-margin = ranksep/2,
    // cross-axis half-margin = (nodesep+edgesep)/2, mapped to x/y by direction.
    // When this cluster's sole member is a non-extracted nested compound, the
    // cross-axis half-margin shrinks to edgesep (dummy↔dummy borders). Record
    // the margins so computeClusterBboxes paints the SAME rect globally (drawn
    // rect == placeholder). The root (clusterId undefined) draws no rect and its
    // returned size is unused, so skip recording for it.
    const crossHalf = nonExtBox.size > 0 ? NESTED_CROSS_HALF_MARGIN : CROSS_HALF_MARGIN;
    const marginX = horizIsRank ? rankHalf : crossHalf;
    const marginY = horizIsRank ? crossHalf : rankHalf;
    if (clusterId !== undefined) clusterMargins.set(clusterId, { x: marginX, y: marginY });

    return {
      width: contentW + 2 * marginX,
      height: contentH + 2 * marginY,
      contentCenterX: (minX + maxX) / 2,
      contentCenterY: (minY + maxY) / 2,
      leafPos,
      edgePoints,
    };
  }

  const root = layoutCluster(undefined, undefined, 50);

  // Hand the per-cluster margins to the renderer/edge-clipper/drag/A* via the
  // shared computeClusterBboxes — so every consumer paints the recursive
  // cluster's drawn rect at the compound-box size, equal to the placeholder.
  ir.clusterMargins = clusterMargins;

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

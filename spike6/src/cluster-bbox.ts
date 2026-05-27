import type { IR } from './types.js';

// Padding added around the union of a cluster's descendants when computing the
// rectangle the renderer draws for the cluster outline. Used by both the
// renderer (cluster outline rectangle) and layout (edge endpoint clip target).
// Must stay equal across both call sites — keeping the constant single-sourced
// here is what prevents silent divergence between the drawn border and the
// edge clip point.
export const CLUSTER_PADDING = 20;

// Extra vertical room above the descendants to leave space for the cluster
// label. Applied on top of CLUSTER_PADDING on the Y axis only.
export const CLUSTER_LABEL_OFFSET = 10;

export interface BBox { x: number; y: number; w: number; h: number }

// Compute the drawn bbox for every cluster in `ir`. Recursive: a cluster's
// bbox encloses the bboxes of nested clusters plus the rects of any direct
// leaf children. Returns a Map keyed by cluster id. Memoized internally so
// each cluster is computed once per call.
//
// A cluster missing positions (parser ran but layout hasn't yet) yields no
// entry — callers should treat a missing key as "not laid out yet" and skip.
export function computeClusterBboxes(ir: IR): Map<string, BBox> {
  const map = new Map<string, BBox>();
  const sgById = new Map(ir.subgraphs.map(sg => [sg.id, sg]));
  const nodeById = new Map(ir.nodes.map(n => [n.id, n]));

  // Pre-index nested subgraphs by parent so we don't filter ir.subgraphs once
  // per recursion (O(C^2) → O(C)).
  const nestedByParent = new Map<string, string[]>();
  for (const sg of ir.subgraphs) {
    if (!sg.parent) continue;
    if (!nestedByParent.has(sg.parent)) nestedByParent.set(sg.parent, []);
    nestedByParent.get(sg.parent)!.push(sg.id);
  }

  function bboxForSg(sgId: string): BBox | null {
    if (map.has(sgId)) return map.get(sgId)!;
    const sg = sgById.get(sgId);
    if (!sg) return null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const childId of sg.children) {
      const n = nodeById.get(childId);
      if (!n || n.x == null || n.y == null || n.width == null || n.height == null) continue;
      minX = Math.min(minX, n.x - n.width / 2);
      minY = Math.min(minY, n.y - n.height / 2);
      maxX = Math.max(maxX, n.x + n.width / 2);
      maxY = Math.max(maxY, n.y + n.height / 2);
    }

    for (const nestedId of nestedByParent.get(sgId) ?? []) {
      const nb = bboxForSg(nestedId);
      if (!nb) continue;
      minX = Math.min(minX, nb.x);
      minY = Math.min(minY, nb.y);
      maxX = Math.max(maxX, nb.x + nb.w);
      maxY = Math.max(maxY, nb.y + nb.h);
    }

    if (!isFinite(minX)) return null;

    const bbox: BBox = {
      x: minX - CLUSTER_PADDING,
      y: minY - CLUSTER_PADDING - CLUSTER_LABEL_OFFSET,
      w: maxX - minX + CLUSTER_PADDING * 2,
      h: maxY - minY + CLUSTER_PADDING * 2 + CLUSTER_LABEL_OFFSET,
    };
    map.set(sgId, bbox);
    return bbox;
  }

  for (const sg of ir.subgraphs) bboxForSg(sg.id);
  return map;
}

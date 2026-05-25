import type { IR, IREdge, IRNode } from './types.js';
import {
  AStarGrid,
  Cell,
  findPath,
  worldToCell,
  cellToWorld,
  nearestFreeCell,
  isBlocked,
} from './astar.js';
import { astarSettings, lastTrace, type EdgeSeparation } from './astarSettings.js';

export interface RoutingConfig {
  cellSize: number;
  padding: number;       // px padding around each obstacle node
  marginCells: number;   // free cells around the canvas edge
}

// Read directly from the live settings singleton so UI changes take effect
// without rebuilding the config object.
export function currentConfig(): RoutingConfig {
  return {
    cellSize: astarSettings.cellSize,
    padding: astarSettings.padding,
    marginCells: astarSettings.marginCells,
  };
}

// Kept for backward compatibility with callers that imported a constant.
export const DEFAULT_CONFIG: RoutingConfig = {
  get cellSize() { return astarSettings.cellSize; },
  get padding() { return astarSettings.padding; },
  get marginCells() { return astarSettings.marginCells; },
} as RoutingConfig;

// Build a grid covering all node bounding boxes (plus a margin). Mark every
// cell whose center sits inside the padded bbox of any node *not* in
// `excludeNodeIds` as blocked.
export function buildGrid(
  ir: IR,
  excludeNodeIds: Set<string>,
  config: RoutingConfig
): AStarGrid {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of ir.nodes) {
    if (n.x == null || n.y == null || n.width == null || n.height == null) continue;
    minX = Math.min(minX, n.x - n.width / 2);
    minY = Math.min(minY, n.y - n.height / 2);
    maxX = Math.max(maxX, n.x + n.width / 2);
    maxY = Math.max(maxY, n.y + n.height / 2);
  }
  if (!isFinite(minX)) {
    return { cellSize: config.cellSize, cols: 1, rows: 1, originX: 0, originY: 0, blocked: new Uint8Array(1) };
  }

  const margin = config.cellSize * config.marginCells;
  // Snap the grid origin to a multiple of cellSize so cells are pinned to
  // fixed world coordinates. Without this, nudging a node by a sub-cell
  // amount shifts the whole grid origin and every cell boundary drifts with
  // it — making the blocked region look different on every drop. With the
  // snap, cells stay put; only which cells a node's border crosses changes
  // when the node crosses an actual cell boundary.
  const rawOriginX = minX - margin;
  const rawOriginY = minY - margin;
  const originX = Math.floor(rawOriginX / config.cellSize) * config.cellSize;
  const originY = Math.floor(rawOriginY / config.cellSize) * config.cellSize;
  const cols = Math.ceil((maxX + margin - originX) / config.cellSize);
  const rows = Math.ceil((maxY + margin - originY) / config.cellSize);
  const blocked = new Uint8Array(cols * rows);

  for (const n of ir.nodes) {
    if (excludeNodeIds.has(n.id)) continue;
    if (n.x == null || n.y == null || n.width == null || n.height == null) continue;
    const left   = n.x - n.width / 2 - config.padding;
    const right  = n.x + n.width / 2 + config.padding;
    const top    = n.y - n.height / 2 - config.padding;
    const bottom = n.y + n.height / 2 + config.padding;

    const c0 = Math.max(0, Math.floor((left - originX) / config.cellSize));
    const c1 = Math.min(cols - 1, Math.floor((right - originX) / config.cellSize));
    const r0 = Math.max(0, Math.floor((top - originY) / config.cellSize));
    const r1 = Math.min(rows - 1, Math.floor((bottom - originY) / config.cellSize));

    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        blocked[r * cols + c] = 1;
      }
    }
  }

  return { cellSize: config.cellSize, cols, rows, originX, originY, blocked };
}

// Return a cell mask for the union of the given nodes' padded bboxes,
// quantized to whole grid cells the same way `buildGrid` does. Used to flag
// "cells that would be obstacles if these nodes were not excluded."
function paddedBboxCells(grid: AStarGrid, nodes: IRNode[], config: RoutingConfig): Uint8Array {
  const mask = new Uint8Array(grid.cols * grid.rows);
  for (const n of nodes) {
    if (n.x == null || n.y == null || n.width == null || n.height == null) continue;
    const left   = n.x - n.width / 2 - config.padding;
    const right  = n.x + n.width / 2 + config.padding;
    const top    = n.y - n.height / 2 - config.padding;
    const bottom = n.y + n.height / 2 + config.padding;
    const c0 = Math.max(0, Math.floor((left   - grid.originX) / grid.cellSize));
    const c1 = Math.min(grid.cols - 1, Math.floor((right  - grid.originX) / grid.cellSize));
    const r0 = Math.max(0, Math.floor((top    - grid.originY) / grid.cellSize));
    const r1 = Math.min(grid.rows - 1, Math.floor((bottom - grid.originY) / grid.cellSize));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        mask[r * grid.cols + c] = 1;
      }
    }
  }
  return mask;
}

type Face = 'top' | 'bottom' | 'left' | 'right';

// Which face on `thisNode` faces `otherCenter`? Uses the same aspect-ratio-aware
// comparison as the dock placement so face selection is consistent between
// face-slot assignment and dock cell computation.
function pickFace(thisNode: IRNode, otherCenter: { x: number; y: number }): Face {
  const nx = thisNode.x ?? 0;
  const ny = thisNode.y ?? 0;
  const halfW = (thisNode.width  ?? 0) / 2;
  const halfH = (thisNode.height ?? 0) / 2;
  const dx = otherCenter.x - nx;
  const dy = otherCenter.y - ny;
  const horizFraction = halfW > 0 ? Math.abs(dx) / halfW : 0;
  const vertFraction  = halfH > 0 ? Math.abs(dy) / halfH : 0;
  if (horizFraction >= vertFraction) {
    return dx >= 0 ? 'right' : 'left';
  }
  return dy >= 0 ? 'bottom' : 'top';
}

// Find every edge that touches `thisNode` and uses the same face as the edge
// in question. Return the slot offset (in cells, along the face tangent) for
// the current edge, ordered by angle to the neighbor's center so edges fan out
// in the same order they leave the node — mirrors the reference image where
// the gateway has many edges distributed along its bottom face.
//
// Slots are symmetric around the face center: an odd count is …, -1, 0, +1, …
// and an even count is …, -1.5, -0.5, +0.5, +1.5, …. Clamped to the available
// cells on the face so a small node with many edges doesn't push slots outside
// its own width/height.
function faceSlotOffset(
  thisNode: IRNode,
  thisOtherCenter: { x: number; y: number },
  ir: IR,
  edgeId: string,
  cellSize: number,
): number {
  const face = pickFace(thisNode, thisOtherCenter);

  interface Sibling { id: string; angle: number }
  const siblings: Sibling[] = [];
  for (const e of ir.edges) {
    const isOutgoing = e.from === thisNode.id;
    const isIncoming = e.to   === thisNode.id;
    if (!isOutgoing && !isIncoming) continue;
    const otherId = isOutgoing ? e.to : e.from;
    const other = ir.nodes.find(n => n.id === otherId);
    if (!other || other.x == null || other.y == null) continue;
    const oc = { x: other.x, y: other.y };
    if (pickFace(thisNode, oc) !== face) continue;
    const dx = oc.x - (thisNode.x ?? 0);
    const dy = oc.y - (thisNode.y ?? 0);
    siblings.push({ id: `${e.from}::${e.to}`, angle: Math.atan2(dy, dx) });
  }

  if (siblings.length <= 1) return 0;

  // Order along the face tangent. For top/bottom faces, ascending angle is not
  // monotonic in x; sort by x-component of the neighbor offset directly. For
  // left/right faces, sort by y-component.
  siblings.sort((a, b) => a.angle - b.angle);
  // Map angle order to tangent order: for top face, leftmost angle should be
  // leftmost slot (negative). We re-sort by the actual tangent coordinate.
  const tangentValue = (s: Sibling): number => {
    // Recover dx, dy from angle (unit vector is fine — we only need ordering).
    const dx = Math.cos(s.angle);
    const dy = Math.sin(s.angle);
    switch (face) {
      case 'top':    return dx;          // left → negative x
      case 'bottom': return dx;
      case 'left':   return dy;          // up → negative y
      case 'right':  return dy;
    }
  };
  siblings.sort((a, b) => tangentValue(a) - tangentValue(b));

  const idx = siblings.findIndex(s => s.id === edgeId);
  if (idx < 0) return 0;

  const n = siblings.length;
  // Symmetric, integer-spaced slot offsets.
  let slot = idx - (n - 1) / 2;

  // Clamp so slots stay within the node's face. Leave one cell of margin on
  // each end so the dock doesn't fall off the corner.
  const halfW = (thisNode.width  ?? 0) / 2;
  const halfH = (thisNode.height ?? 0) / 2;
  const faceLen = (face === 'top' || face === 'bottom') ? 2 * halfW : 2 * halfH;
  const maxCellsOnFace = Math.max(1, Math.floor(faceLen / cellSize) - 1);
  const maxAbsSlot = (maxCellsOnFace - 1) / 2;
  if (slot >  maxAbsSlot) slot =  maxAbsSlot;
  if (slot < -maxAbsSlot) slot = -maxAbsSlot;
  return slot;
}

// Compute the face-centered docking cell and the face's outward normal for
// an endpoint:
//   1. The line from this node's center to the OTHER endpoint's center crosses
//      exactly one face (top/bottom/left/right). We pick that face by comparing
//      |dx|/halfW vs |dy|/halfH — aspect-ratio-aware face selection.
//   2. The dock cell is the CENTER cell of that face, sitting one cell
//      OUTSIDE the node, optionally shifted along the face tangent by
//      `slotOffset` cells so multiple edges sharing a face don't overlap.
//   3. The normal `(nx,ny)` is the unit step that points OUTWARD from the face.
//
// The caller adds a "guard" cell one normal-step further from the dock cell.
// A* routes between guards, then the dock cells are appended/prepended so the
// final segment is always along the normal — i.e. perpendicular to the face.
interface DockInfo { dock: Cell; normalDx: number; normalDy: number }
function borderDock(
  grid: AStarGrid,
  thisNode: IRNode,
  otherCenter: { x: number; y: number },
  slotOffset: number = 0,
): DockInfo {
  const nx = thisNode.x ?? 0;
  const ny = thisNode.y ?? 0;
  const halfW = (thisNode.width  ?? 0) / 2;
  const halfH = (thisNode.height ?? 0) / 2;
  const cs = grid.cellSize;

  const dx = otherCenter.x - nx;
  const dy = otherCenter.y - ny;
  const horizFraction = halfW > 0 ? Math.abs(dx) / halfW : 0;
  const vertFraction  = halfH > 0 ? Math.abs(dy) / halfH : 0;

  let cx: number;
  let cy: number;
  let normalDx = 0;
  let normalDy = 0;
  if (horizFraction >= vertFraction) {
    // left or right face — slot offset shifts along Y (vertical tangent).
    cy = Math.floor((ny - grid.originY) / cs) + Math.round(slotOffset);
    if (dx >= 0) {
      cx = Math.floor((nx + halfW - grid.originX) / cs);
      normalDx = 1;
    } else {
      cx = Math.floor((nx - halfW - grid.originX) / cs) - 1;
      normalDx = -1;
    }
  } else {
    // top or bottom face — slot offset shifts along X (horizontal tangent).
    cx = Math.floor((nx - grid.originX) / cs) + Math.round(slotOffset);
    if (dy >= 0) {
      cy = Math.floor((ny + halfH - grid.originY) / cs);
      normalDy = 1;
    } else {
      cy = Math.floor((ny - halfH - grid.originY) / cs) - 1;
      normalDy = -1;
    }
  }

  return { dock: nearestFreeCell(grid, { cx, cy }), normalDx, normalDy };
}

// Collapse colinear runs to corner points only — three consecutive cells on
// the same line are reduced. This produces a polyline of {start, corner_1,
// ..., corner_n, end} which is what curveBasis needs to smooth without
// over-sampling the straight runs.
function collapseColinear(cells: Cell[]): Cell[] {
  if (cells.length <= 2) return cells.slice();
  const out: Cell[] = [cells[0]];
  for (let i = 1; i < cells.length - 1; i++) {
    const a = cells[i - 1];
    const b = cells[i];
    const c = cells[i + 1];
    const cross = (b.cx - a.cx) * (c.cy - a.cy) - (b.cy - a.cy) * (c.cx - a.cx);
    if (cross !== 0) out.push(b);
  }
  out.push(cells[cells.length - 1]);
  return out;
}

// Find a route from `fromNode` to `toNode` that avoids every other node.
// Returns a raw corner polyline of cell centers:
// [startCellCenter, corner_1, ..., corner_n, goalCellCenter].
//
// The endpoints are the centers of the A*-chosen start and goal cells (one
// cell outside each node's padded bbox), NOT pixel-perfect intersections with
// the node outline. This keeps the visible edge faithful to A*'s grid view:
// every endpoint and corner sits exactly on a cell center.
export function routeEdge(
  fromNode: IRNode,
  toNode: IRNode,
  ir: IR,
  config: RoutingConfig
): { x: number; y: number }[] {
  const fc = { x: fromNode.x ?? 0, y: fromNode.y ?? 0 };
  const tc = { x: toNode.x   ?? 0, y: toNode.y   ?? 0 };

  // Exclude both endpoints so their padded bboxes don't block dock/guard cells.
  const exclude = new Set<string>([fromNode.id, toNode.id]);
  const grid = buildGrid(ir, exclude, config);

  // Per-edge slot offsets so multiple edges sharing a node face fan out
  // along the face instead of all landing on the same dock cell.
  const edgeId = `${fromNode.id}::${toNode.id}`;
  const startSlot = faceSlotOffset(fromNode, tc, ir, edgeId, config.cellSize);
  const goalSlot  = faceSlotOffset(toNode,   fc, ir, edgeId, config.cellSize);

  // Dock cells (face-center, one cell outside, shifted by slot offset) plus
  // face outward normals.
  const startDock = borderDock(grid, fromNode, tc, startSlot);
  const goalDock  = borderDock(grid, toNode,   fc, goalSlot);

  // Guard cells: one normal-step further out than the docks. Routing happens
  // *between guards*. Because the only way to reach a dock from its guard is
  // a single normal-direction step (and we'll glue that step on after A*),
  // the first and last segments of the rendered path are guaranteed
  // perpendicular to their faces — i.e. the arrow always enters/exits head-on.
  const startGuard: Cell = {
    cx: startDock.dock.cx + startDock.normalDx,
    cy: startDock.dock.cy + startDock.normalDy,
  };
  const goalGuard: Cell = {
    cx: goalDock.dock.cx + goalDock.normalDx,
    cy: goalDock.dock.cy + goalDock.normalDy,
  };

  // If a guard fell off the grid or onto an obstacle, snap to the nearest
  // free cell. Edge cases only — keeps routing alive.
  const sg = nearestFreeCell(grid, startGuard);
  const gg = nearestFreeCell(grid, goalGuard);

  const startCenter = cellToWorld(grid, startDock.dock.cx, startDock.dock.cy);
  const goalCenter  = cellToWorld(grid, goalDock.dock.cx,  goalDock.dock.cy);

  const excludedCells = paddedBboxCells(grid, [fromNode, toNode], config);

  const publishTrace = (closed: Uint8Array, open: Uint8Array, expanded: number): void => {
    lastTrace.value = {
      cellSize: grid.cellSize,
      cols: grid.cols,
      rows: grid.rows,
      originX: grid.originX,
      originY: grid.originY,
      closed,
      open,
      expanded,
      excludedCells,
      startCell: { cx: startDock.dock.cx, cy: startDock.dock.cy },
      goalCell:  { cx: goalDock.dock.cx,  cy: goalDock.dock.cy  },
    };
  };

  if (isBlocked(grid, startDock.dock.cx, startDock.dock.cy) || isBlocked(grid, goalDock.dock.cx, goalDock.dock.cy)) {
    publishTrace(new Uint8Array(grid.cols * grid.rows), new Uint8Array(grid.cols * grid.rows), 0);
    return [startCenter, goalCenter];
  }

  const result = findPath(grid, sg, gg, {
    connectivity: astarSettings.connectivity,
    cornerCut: astarSettings.cornerCut,
    heuristic: astarSettings.heuristic,
  });

  publishTrace(result.closed, result.open, result.expanded);

  if (!result.path) return [startCenter, goalCenter];

  // Prepend the start dock and append the goal dock. The dock→guard and
  // guard→dock steps are along the face normals by construction, so the
  // first and last rendered segments are perpendicular to the faces.
  const fullPath: Cell[] = [startDock.dock, ...result.path, goalDock.dock];
  const collapsed = collapseColinear(fullPath);
  return collapsed.map(c => cellToWorld(grid, c.cx, c.cy));
}

// Per-cell soft penalty added for every cell an earlier edge already occupies.
// Larger than the max neighbor move cost (sqrt 2 ≈ 1.414) so a single shared
// cell is always more expensive than a one-step detour around it. We don't
// want this so large that A* takes wild detours through unrelated space, so
// it's modest — about one "extra cell of distance" per overlap.
const SOFT_OVERLAP_PENALTY = 4;

// Tag every cell on a freshly-routed path so the next edge in the batch sees
// it. For soft mode we accumulate into `extraCost` (cell may still be used but
// at higher cost). For hard mode we mark `dynamicBlocked` so the cell becomes
// a full obstacle for later edges. We also tag the orthogonal neighbors of
// each path cell — without this, parallel edges run on adjacent rows/columns
// and visually merge in curveBasis rendering even though they don't share
// cells.
function markPathCells(
  pathCells: Cell[],
  cols: number,
  rows: number,
  extraCost: Float32Array | null,
  dynamicBlocked: Uint8Array | null,
): void {
  const stamp = (cx: number, cy: number, weight: number): void => {
    if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return;
    const idx = cy * cols + cx;
    if (extraCost) extraCost[idx] += SOFT_OVERLAP_PENALTY * weight;
    if (dynamicBlocked) dynamicBlocked[idx] = 1;
  };
  for (const c of pathCells) {
    stamp(c.cx, c.cy, 1.0);
    // Neighborhood penalty — softer than the center cell so the path is still
    // free to ride alongside, just with a cost preference for greater spacing.
    stamp(c.cx + 1, c.cy, 0.5);
    stamp(c.cx - 1, c.cy, 0.5);
    stamp(c.cx, c.cy + 1, 0.5);
    stamp(c.cx, c.cy - 1, 0.5);
  }
}

// Sequential batch router. Routes every edge against a SHARED grid + cost
// buffer so each new edge can "see" the cells used by earlier edges. With
// `separation = 'off'` the buffer stays empty and the result matches calling
// `routeEdge` independently per edge. Mutates each `IREdge.routedPath` in
// place; ignores edges whose endpoints are missing.
//
// Edge ordering: longest manhattan distance first. Long edges are the most
// constrained (they cross more obstacles) so giving them first pick of cells
// keeps short edges flexible to detour around the long ones.
export function routeEdgesBatch(
  edges: IREdge[],
  ir: IR,
  config: RoutingConfig,
  separation: EdgeSeparation,
): void {
  if (separation === 'off') {
    for (const edge of edges) {
      const fromNode = ir.nodes.find(n => n.id === edge.from);
      const toNode   = ir.nodes.find(n => n.id === edge.to);
      if (!fromNode || !toNode) continue;
      edge.routedPath = routeEdge(fromNode, toNode, ir, config);
    }
    return;
  }

  // Order: longest first so the most constrained edges claim cells before the
  // short, flexible ones.
  const ordered = [...edges]
    .map(e => {
      const f = ir.nodes.find(n => n.id === e.from);
      const t = ir.nodes.find(n => n.id === e.to);
      const dx = (f?.x ?? 0) - (t?.x ?? 0);
      const dy = (f?.y ?? 0) - (t?.y ?? 0);
      return { e, dist: Math.abs(dx) + Math.abs(dy) };
    })
    .sort((a, b) => b.dist - a.dist)
    .map(x => x.e);

  // Build a grid once that EXCLUDES no nodes (so all node interiors are
  // blocked). We swap exclusions in/out per edge by remembering and clearing
  // their bbox cells. This keeps the grid dimensions / origin constant across
  // the batch, so a single shared `extraCost` / `dynamicBlocked` buffer is
  // safe to reuse.
  const baseGrid = buildGrid(ir, new Set<string>(), config);
  const total = baseGrid.cols * baseGrid.rows;
  const extraCost: Float32Array | null = separation === 'soft' ? new Float32Array(total) : null;
  // `dynamicBlocked` is overlaid on top of baseGrid.blocked for hard mode.
  // We can't mutate baseGrid.blocked because the per-edge exclusion needs to
  // see the original blocked mask, not blocked + previous edges.
  const dynamicBlocked: Uint8Array | null = separation === 'hard' ? new Uint8Array(total) : null;

  for (const edge of ordered) {
    const fromNode = ir.nodes.find(n => n.id === edge.from);
    const toNode   = ir.nodes.find(n => n.id === edge.to);
    if (!fromNode || !toNode) continue;
    edge.routedPath = routeEdgeOnSharedGrid(
      fromNode, toNode, ir, config, baseGrid, extraCost, dynamicBlocked,
    );
  }
}

// Like `routeEdge` but uses a caller-supplied shared grid + cost buffers. The
// caller is responsible for grid/buffer lifetime; this function only mutates
// `baseGrid.blocked` *transiently* (un-blocks the two endpoint nodes' cells
// for the duration of the search, then restores them).
function routeEdgeOnSharedGrid(
  fromNode: IRNode,
  toNode: IRNode,
  ir: IR,
  config: RoutingConfig,
  baseGrid: AStarGrid,
  extraCost: Float32Array | null,
  dynamicBlocked: Uint8Array | null,
): { x: number; y: number }[] {
  const fc = { x: fromNode.x ?? 0, y: fromNode.y ?? 0 };
  const tc = { x: toNode.x   ?? 0, y: toNode.y   ?? 0 };

  // Un-block the two endpoint nodes' padded bbox cells so their dock cells
  // aren't obstacles. Remember which cells we touched so we can restore.
  const restore: number[] = [];
  for (const n of [fromNode, toNode]) {
    if (n.x == null || n.y == null || n.width == null || n.height == null) continue;
    const left   = n.x - n.width / 2 - config.padding;
    const right  = n.x + n.width / 2 + config.padding;
    const top    = n.y - n.height / 2 - config.padding;
    const bottom = n.y + n.height / 2 + config.padding;
    const c0 = Math.max(0, Math.floor((left   - baseGrid.originX) / baseGrid.cellSize));
    const c1 = Math.min(baseGrid.cols - 1, Math.floor((right  - baseGrid.originX) / baseGrid.cellSize));
    const r0 = Math.max(0, Math.floor((top    - baseGrid.originY) / baseGrid.cellSize));
    const r1 = Math.min(baseGrid.rows - 1, Math.floor((bottom - baseGrid.originY) / baseGrid.cellSize));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const i = r * baseGrid.cols + c;
        if (baseGrid.blocked[i] === 1) {
          baseGrid.blocked[i] = 0;
          restore.push(i);
        }
      }
    }
  }

  try {
    const edgeId = `${fromNode.id}::${toNode.id}`;
    const startSlot = faceSlotOffset(fromNode, tc, ir, edgeId, config.cellSize);
    const goalSlot  = faceSlotOffset(toNode,   fc, ir, edgeId, config.cellSize);

    const startDock = borderDock(baseGrid, fromNode, tc, startSlot);
    const goalDock  = borderDock(baseGrid, toNode,   fc, goalSlot);

    const startGuard: Cell = {
      cx: startDock.dock.cx + startDock.normalDx,
      cy: startDock.dock.cy + startDock.normalDy,
    };
    const goalGuard: Cell = {
      cx: goalDock.dock.cx + goalDock.normalDx,
      cy: goalDock.dock.cy + goalDock.normalDy,
    };
    const sg = nearestFreeCell(baseGrid, startGuard);
    const gg = nearestFreeCell(baseGrid, goalGuard);

    const startCenter = cellToWorld(baseGrid, startDock.dock.cx, startDock.dock.cy);
    const goalCenter  = cellToWorld(baseGrid, goalDock.dock.cx,  goalDock.dock.cy);

    if (isBlocked(baseGrid, startDock.dock.cx, startDock.dock.cy) ||
        isBlocked(baseGrid, goalDock.dock.cx,  goalDock.dock.cy)) {
      return [startCenter, goalCenter];
    }

    // For hard mode we apply the dynamic block on top of the base grid by
    // briefly OR-ing it in. Saves allocating a new grid per edge.
    const dynRestore: number[] = [];
    if (dynamicBlocked) {
      for (let i = 0; i < dynamicBlocked.length; i++) {
        if (dynamicBlocked[i] === 1 && baseGrid.blocked[i] === 0) {
          baseGrid.blocked[i] = 1;
          dynRestore.push(i);
        }
      }
    }

    let result;
    try {
      result = findPath(baseGrid, sg, gg, {
        connectivity: astarSettings.connectivity,
        cornerCut: astarSettings.cornerCut,
        heuristic: astarSettings.heuristic,
        extraCost: extraCost ?? undefined,
      });
    } finally {
      for (const i of dynRestore) baseGrid.blocked[i] = 0;
    }

    if (!result.path) return [startCenter, goalCenter];

    const fullPath: Cell[] = [startDock.dock, ...result.path, goalDock.dock];
    // Stamp the chosen path cells onto the shared buffers BEFORE collapsing,
    // so the cost grid reflects every cell the route actually traverses (not
    // just the polyline corners).
    markPathCells(fullPath, baseGrid.cols, baseGrid.rows, extraCost, dynamicBlocked);

    const collapsed = collapseColinear(fullPath);
    return collapsed.map(c => cellToWorld(baseGrid, c.cx, c.cy));
  } finally {
    for (const i of restore) baseGrid.blocked[i] = 1;
  }
}

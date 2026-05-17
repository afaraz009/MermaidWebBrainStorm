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
import { astarSettings, lastTrace } from './astarSettings.js';

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

// Compute the face-centered docking cell and the face's outward normal for
// an endpoint:
//   1. The line from this node's center to the OTHER endpoint's center crosses
//      exactly one face (top/bottom/left/right). We pick that face by comparing
//      |dx|/halfW vs |dy|/halfH — aspect-ratio-aware face selection.
//   2. The dock cell is the CENTER cell of that face, sitting one cell
//      OUTSIDE the node.
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
    cy = Math.floor((ny - grid.originY) / cs);
    if (dx >= 0) {
      cx = Math.floor((nx + halfW - grid.originX) / cs);
      normalDx = 1;
    } else {
      cx = Math.floor((nx - halfW - grid.originX) / cs) - 1;
      normalDx = -1;
    }
  } else {
    cx = Math.floor((nx - grid.originX) / cs);
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

  // Dock cells (face-center, one cell outside) plus face outward normals.
  const startDock = borderDock(grid, fromNode, tc);
  const goalDock  = borderDock(grid, toNode,   fc);

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

// Grid-based A* pathfinder. Pure module — no DOM, no IR dependency.
// 8-way connectivity, Manhattan heuristic with diagonal correction,
// binary min-heap open set, Uint8Array closed set.

export interface AStarGrid {
  cellSize: number;
  cols: number;
  rows: number;
  originX: number;
  originY: number;
  blocked: Uint8Array;
}

export interface Cell {
  cx: number;
  cy: number;
}

const SQRT2 = Math.SQRT2;

const NEIGHBORS_4: ReadonlyArray<readonly [number, number, number]> = [
  [ 1,  0, 1],
  [-1,  0, 1],
  [ 0,  1, 1],
  [ 0, -1, 1],
];
const NEIGHBORS_8: ReadonlyArray<readonly [number, number, number]> = [
  [ 1,  0, 1],
  [-1,  0, 1],
  [ 0,  1, 1],
  [ 0, -1, 1],
  [ 1,  1, SQRT2],
  [ 1, -1, SQRT2],
  [-1,  1, SQRT2],
  [-1, -1, SQRT2],
];

export type HeuristicName = 'manhattan' | 'octile' | 'euclidean' | 'chebyshev' | 'zero';
export type Connectivity = 4 | 8;

export interface FindPathOptions {
  connectivity?: Connectivity;
  cornerCut?: boolean;
  heuristic?: HeuristicName;
  // Optional per-cell soft penalty added to the move cost when stepping INTO
  // that cell. Same layout as `grid.blocked` (row-major, cols*rows). Used by
  // the sequential batch router to discourage edges from reusing cells that
  // earlier edges already occupy, without forbidding overlap entirely.
  extraCost?: Float32Array;
}

export interface FindPathResult {
  path: Cell[] | null;
  closed: Uint8Array;
  open: Uint8Array;
  expanded: number;
}

function pickHeuristic(name: HeuristicName): (ax: number, ay: number, bx: number, by: number) => number {
  switch (name) {
    case 'manhattan': return (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by);
    case 'euclidean': return (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
    case 'chebyshev': return (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
    case 'zero':      return () => 0;
    case 'octile':
    default: return (ax, ay, bx, by) => {
      const dx = Math.abs(ax - bx), dy = Math.abs(ay - by);
      return (dx + dy) + (SQRT2 - 2) * Math.min(dx, dy);
    };
  }
}

export function inBounds(grid: AStarGrid, cx: number, cy: number): boolean {
  return cx >= 0 && cy >= 0 && cx < grid.cols && cy < grid.rows;
}

export function isBlocked(grid: AStarGrid, cx: number, cy: number): boolean {
  if (!inBounds(grid, cx, cy)) return true;
  return grid.blocked[cy * grid.cols + cx] === 1;
}

export function worldToCell(grid: AStarGrid, x: number, y: number): Cell {
  return {
    cx: Math.floor((x - grid.originX) / grid.cellSize),
    cy: Math.floor((y - grid.originY) / grid.cellSize),
  };
}

export function cellToWorld(grid: AStarGrid, cx: number, cy: number): { x: number; y: number } {
  return {
    x: grid.originX + (cx + 0.5) * grid.cellSize,
    y: grid.originY + (cy + 0.5) * grid.cellSize,
  };
}

// If the requested cell is blocked, walk outward in a small spiral to find the
// nearest free cell. Returns the original cell if nothing free is found within
// `maxRadius`.
export function nearestFreeCell(grid: AStarGrid, cell: Cell, maxRadius = 6): Cell {
  if (!isBlocked(grid, cell.cx, cell.cy)) return cell;
  for (let r = 1; r <= maxRadius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const ncx = cell.cx + dx;
        const ncy = cell.cy + dy;
        if (inBounds(grid, ncx, ncy) && !isBlocked(grid, ncx, ncy)) {
          return { cx: ncx, cy: ncy };
        }
      }
    }
  }
  return cell;
}

// Binary min-heap keyed on `f`. We also store `h` for tie-breaking.
interface HeapEntry { idx: number; f: number; h: number }

class MinHeap {
  private data: HeapEntry[] = [];
  size(): number { return this.data.length; }
  push(e: HeapEntry): void {
    this.data.push(e);
    this.bubbleUp(this.data.length - 1);
  }
  pop(): HeapEntry | undefined {
    if (this.data.length === 0) return undefined;
    const top = this.data[0];
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      this.sinkDown(0);
    }
    return top;
  }
  private less(a: HeapEntry, b: HeapEntry): boolean {
    if (a.f !== b.f) return a.f < b.f;
    return a.h < b.h;
  }
  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.less(this.data[i], this.data[parent])) {
        [this.data[i], this.data[parent]] = [this.data[parent], this.data[i]];
        i = parent;
      } else break;
    }
  }
  private sinkDown(i: number): void {
    const n = this.data.length;
    while (true) {
      const l = i * 2 + 1;
      const r = i * 2 + 2;
      let best = i;
      if (l < n && this.less(this.data[l], this.data[best])) best = l;
      if (r < n && this.less(this.data[r], this.data[best])) best = r;
      if (best === i) break;
      [this.data[i], this.data[best]] = [this.data[best], this.data[i]];
      i = best;
    }
  }
}

export function findPath(
  grid: AStarGrid,
  start: Cell,
  goal: Cell,
  options: FindPathOptions = {}
): FindPathResult {
  const connectivity: Connectivity = options.connectivity ?? 8;
  const cornerCut = options.cornerCut ?? false;
  const heuristic = pickHeuristic(options.heuristic ?? 'octile');
  const neighbors = connectivity === 4 ? NEIGHBORS_4 : NEIGHBORS_8;
  const extraCost = options.extraCost;

  const { cols, rows } = grid;
  const total = cols * rows;
  const closed = new Uint8Array(total);
  const inOpen = new Uint8Array(total);

  if (!inBounds(grid, start.cx, start.cy) || !inBounds(grid, goal.cx, goal.cy)
      || isBlocked(grid, start.cx, start.cy) || isBlocked(grid, goal.cx, goal.cy)) {
    return { path: null, closed, open: inOpen, expanded: 0 };
  }

  const gScore = new Float64Array(total); gScore.fill(Infinity);
  const cameFrom = new Int32Array(total); cameFrom.fill(-1);

  const startIdx = start.cy * cols + start.cx;
  const goalIdx = goal.cy * cols + goal.cx;
  gScore[startIdx] = 0;

  const open = new MinHeap();
  const h0 = heuristic(start.cx, start.cy, goal.cx, goal.cy);
  open.push({ idx: startIdx, f: h0, h: h0 });
  inOpen[startIdx] = 1;

  let expanded = 0;

  while (open.size() > 0) {
    const current = open.pop()!;
    if (closed[current.idx] === 1) continue;
    closed[current.idx] = 1;
    inOpen[current.idx] = 0;
    expanded++;

    if (current.idx === goalIdx) {
      return { path: reconstruct(cameFrom, current.idx, cols), closed, open: inOpen, expanded };
    }

    const cx = current.idx % cols;
    const cy = (current.idx - cx) / cols;
    const gCur = gScore[current.idx];

    for (const [dx, dy, cost] of neighbors) {
      const ncx = cx + dx;
      const ncy = cy + dy;
      if (!inBounds(grid, ncx, ncy)) continue;
      const nIdx = ncy * cols + ncx;
      if (closed[nIdx] === 1) continue;
      if (grid.blocked[nIdx] === 1) continue;

      // No corner-cutting: diagonal moves require both orthogonal neighbors to
      // be free, so the path can't slip through the corner of an obstacle.
      if (!cornerCut && dx !== 0 && dy !== 0) {
        if (grid.blocked[cy * cols + ncx] === 1) continue;
        if (grid.blocked[ncy * cols + cx] === 1) continue;
      }

      const penalty = extraCost ? extraCost[nIdx] : 0;
      const tentative = gCur + cost + penalty;
      if (tentative < gScore[nIdx]) {
        gScore[nIdx] = tentative;
        cameFrom[nIdx] = current.idx;
        const h = heuristic(ncx, ncy, goal.cx, goal.cy);
        open.push({ idx: nIdx, f: tentative + h, h });
        inOpen[nIdx] = 1;
      }
    }
  }

  return { path: null, closed, open: inOpen, expanded };
}

function reconstruct(cameFrom: Int32Array, endIdx: number, cols: number): Cell[] {
  const out: Cell[] = [];
  let cur = endIdx;
  while (cur !== -1) {
    const cx = cur % cols;
    const cy = (cur - cx) / cols;
    out.push({ cx, cy });
    cur = cameFrom[cur];
  }
  out.reverse();
  return out;
}

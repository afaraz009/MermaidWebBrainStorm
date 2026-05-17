// Grid-based A* for post-drop edge routing.
// 8-connected, octile heuristic. Written from scratch — no external pathfinding lib.

export interface Point { x: number; y: number; }
export interface Obstacle { x: number; y: number; width: number; height: number; }

export interface RouteRequest {
  from: Point;            // source node center
  to: Point;              // target node center
  fromBox: Obstacle;      // source node bounds (excluded from obstacles)
  toBox: Obstacle;        // target node bounds (excluded from obstacles)
  obstacles: Obstacle[];  // every OTHER node
  bounds: { width: number; height: number }; // canvas extent
}

export interface RouteResult {
  path: Point[];
  ok: boolean;
}

// Tunables. Documented in SPIKE2_NOTES.md.
export const CELL = 10;          // grid cell size in px
export const OBSTACLE_PAD = 6;   // padding around blocked obstacles in px
const SQRT2 = Math.SQRT2;

// Compute the blocked-cell mask for visualization. Mirrors the masking logic in
// routeEdge but takes a flat obstacle list (no from/to exclusions).
export function buildBlockedMask(
  obstacles: Obstacle[],
  bounds: { width: number; height: number },
): { cols: number; rows: number; blocked: Uint8Array } {
  const cols = Math.max(2, Math.ceil(bounds.width / CELL));
  const rows = Math.max(2, Math.ceil(bounds.height / CELL));
  const blocked = new Uint8Array(cols * rows);
  for (const ob of obstacles) {
    const minX = Math.max(0, Math.floor((ob.x - ob.width / 2 - OBSTACLE_PAD) / CELL));
    const maxX = Math.min(cols - 1, Math.ceil((ob.x + ob.width / 2 + OBSTACLE_PAD) / CELL));
    const minY = Math.max(0, Math.floor((ob.y - ob.height / 2 - OBSTACLE_PAD) / CELL));
    const maxY = Math.min(rows - 1, Math.ceil((ob.y + ob.height / 2 + OBSTACLE_PAD) / CELL));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const cx = x * CELL + CELL / 2;
        const cy = y * CELL + CELL / 2;
        const hw = ob.width / 2 + OBSTACLE_PAD;
        const hh = ob.height / 2 + OBSTACLE_PAD;
        if (cx >= ob.x - hw && cx <= ob.x + hw && cy >= ob.y - hh && cy <= ob.y + hh) {
          blocked[y * cols + x] = 1;
        }
      }
    }
  }
  return { cols, rows, blocked };
}

function inRect(px: number, py: number, ob: Obstacle, pad: number): boolean {
  const hw = ob.width / 2 + pad;
  const hh = ob.height / 2 + pad;
  return px >= ob.x - hw && px <= ob.x + hw && py >= ob.y - hh && py <= ob.y + hh;
}

// Rectangle border anchor: where a line from `from` to `to`'s center enters `to`.
function rectAnchor(from: Point, to: Obstacle): Point {
  const dx = from.x - to.x;
  const dy = from.y - to.y;
  if (dx === 0 && dy === 0) return { x: to.x, y: to.y };
  const hw = to.width / 2;
  const hh = to.height / 2;
  const sx = Math.abs(dx) > 0 ? hw / Math.abs(dx) : Infinity;
  const sy = Math.abs(dy) > 0 ? hh / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return { x: to.x + dx * s, y: to.y + dy * s };
}

// Minimal binary min-heap keyed by fScore.
class MinHeap {
  private data: { idx: number; f: number }[] = [];
  get size() { return this.data.length; }
  push(idx: number, f: number) {
    this.data.push({ idx, f });
    this.bubbleUp(this.data.length - 1);
  }
  pop(): number | undefined {
    if (this.data.length === 0) return undefined;
    const top = this.data[0];
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      this.sinkDown(0);
    }
    return top.idx;
  }
  private bubbleUp(i: number) {
    const item = this.data[i];
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.data[parent].f <= item.f) break;
      this.data[i] = this.data[parent];
      i = parent;
    }
    this.data[i] = item;
  }
  private sinkDown(i: number) {
    const n = this.data.length;
    const item = this.data[i];
    for (;;) {
      const l = 2 * i + 1, r = 2 * i + 2;
      let smallest = i;
      let sf = item.f;
      if (l < n && this.data[l].f < sf) { smallest = l; sf = this.data[l].f; }
      if (r < n && this.data[r].f < sf) { smallest = r; sf = this.data[r].f; }
      if (smallest === i) break;
      this.data[i] = this.data[smallest];
      i = smallest;
    }
    this.data[i] = item;
  }
}

function octile(dx: number, dy: number): number {
  const adx = Math.abs(dx), ady = Math.abs(dy);
  return (adx > ady) ? (adx + (SQRT2 - 1) * ady) : (ady + (SQRT2 - 1) * adx);
}

// Find nearest unblocked cell within radius `maxR` (in cells) of (cx, cy).
function nearestFree(blocked: Uint8Array, cols: number, rows: number, cx: number, cy: number, maxR: number): number {
  const inBounds = (x: number, y: number) => x >= 0 && x < cols && y >= 0 && y < rows;
  if (inBounds(cx, cy) && !blocked[cy * cols + cx]) return cy * cols + cx;
  for (let r = 1; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = cx + dx, y = cy + dy;
        if (inBounds(x, y) && !blocked[y * cols + x]) return y * cols + x;
      }
    }
  }
  return -1;
}

// Collapse colinear runs: drop any waypoint whose neighbors form the same direction.
function collapseColinear(path: Point[]): Point[] {
  if (path.length < 3) return path;
  const out: Point[] = [path[0]];
  for (let i = 1; i < path.length - 1; i++) {
    const a = out[out.length - 1], b = path[i], c = path[i + 1];
    const dx1 = b.x - a.x, dy1 = b.y - a.y;
    const dx2 = c.x - b.x, dy2 = c.y - b.y;
    // Same direction if cross product is 0 AND dot product > 0.
    const cross = dx1 * dy2 - dy1 * dx2;
    const dot = dx1 * dx2 + dy1 * dy2;
    if (cross === 0 && dot > 0) continue;
    out.push(b);
  }
  out.push(path[path.length - 1]);
  return out;
}

export function routeEdge(req: RouteRequest): RouteResult {
  const cols = Math.max(2, Math.ceil(req.bounds.width / CELL));
  const rows = Math.max(2, Math.ceil(req.bounds.height / CELL));
  const blocked = new Uint8Array(cols * rows);

  // Mark obstacles (excluding fromBox / toBox).
  for (const ob of req.obstacles) {
    if (ob === req.fromBox || ob === req.toBox) continue;
    const minX = Math.max(0, Math.floor((ob.x - ob.width / 2 - OBSTACLE_PAD) / CELL));
    const maxX = Math.min(cols - 1, Math.ceil((ob.x + ob.width / 2 + OBSTACLE_PAD) / CELL));
    const minY = Math.max(0, Math.floor((ob.y - ob.height / 2 - OBSTACLE_PAD) / CELL));
    const maxY = Math.min(rows - 1, Math.ceil((ob.y + ob.height / 2 + OBSTACLE_PAD) / CELL));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const cx = x * CELL + CELL / 2;
        const cy = y * CELL + CELL / 2;
        if (inRect(cx, cy, ob, OBSTACLE_PAD)) blocked[y * cols + x] = 1;
      }
    }
  }

  // Cell-coord helpers.
  const cellOf = (p: Point) => ({
    cx: Math.max(0, Math.min(cols - 1, Math.floor(p.x / CELL))),
    cy: Math.max(0, Math.min(rows - 1, Math.floor(p.y / CELL))),
  });
  const cellCenter = (idx: number): Point => {
    const cy = Math.floor(idx / cols);
    const cx = idx - cy * cols;
    return { x: cx * CELL + CELL / 2, y: cy * CELL + CELL / 2 };
  };

  // Start/goal: cell just outside each box on the side facing the other endpoint.
  const fromAnchor = rectAnchor(req.to, req.fromBox);
  const toAnchor = rectAnchor(req.from, req.toBox);
  // Step one cell outward beyond the anchor.
  const fdx = req.to.x - req.from.x, fdy = req.to.y - req.from.y;
  const fmag = Math.hypot(fdx, fdy) || 1;
  const startPoint = { x: fromAnchor.x + (fdx / fmag) * CELL, y: fromAnchor.y + (fdy / fmag) * CELL };
  const goalPoint  = { x: toAnchor.x  - (fdx / fmag) * CELL, y: toAnchor.y  - (fdy / fmag) * CELL };

  const sCell = cellOf(startPoint);
  const gCell = cellOf(goalPoint);
  const startIdx = nearestFree(blocked, cols, rows, sCell.cx, sCell.cy, 3);
  const goalIdx  = nearestFree(blocked, cols, rows, gCell.cx, gCell.cy, 3);

  if (startIdx < 0 || goalIdx < 0) {
    return { ok: false, path: [req.from, req.to] };
  }

  const gScore = new Float64Array(cols * rows).fill(Infinity);
  gScore[startIdx] = 0;
  const cameFrom = new Int32Array(cols * rows).fill(-1);
  const closed = new Uint8Array(cols * rows);
  const open = new MinHeap();
  const gy = Math.floor(goalIdx / cols), gx = goalIdx - gy * cols;
  const sy = Math.floor(startIdx / cols), sx = startIdx - sy * cols;
  open.push(startIdx, octile(gx - sx, gy - sy));

  const MAX_ITER = cols * rows;
  let iter = 0;

  const dirs = [
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
    [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2],
  ] as const;

  let found = false;
  while (open.size > 0 && iter < MAX_ITER) {
    iter++;
    const cur = open.pop()!;
    if (cur === goalIdx) { found = true; break; }
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cy = Math.floor(cur / cols), cx = cur - cy * cols;
    const curG = gScore[cur];
    for (const [dx, dy, cost] of dirs) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const nIdx = ny * cols + nx;
      if (blocked[nIdx] || closed[nIdx]) continue;
      // Disallow corner-cutting through blocked cardinals when moving diagonally.
      if (dx !== 0 && dy !== 0) {
        if (blocked[cy * cols + nx] || blocked[ny * cols + cx]) continue;
      }
      const tentative = curG + cost;
      if (tentative < gScore[nIdx]) {
        gScore[nIdx] = tentative;
        cameFrom[nIdx] = cur;
        const h = octile(gx - nx, gy - ny);
        open.push(nIdx, tentative + h);
      }
    }
  }

  if (!found) {
    return { ok: false, path: [req.from, req.to] };
  }

  // Reconstruct.
  const cells: number[] = [];
  for (let c = goalIdx; c !== -1; c = cameFrom[c]) {
    cells.push(c);
    if (c === startIdx) break;
  }
  cells.reverse();
  let waypoints = cells.map(cellCenter);

  // Smooth: collapse colinear runs.
  waypoints = collapseColinear(waypoints);

  // Add border anchor tails so the edge terminates at the node rectangle.
  const srcBorder = rectAnchor(waypoints[0] ?? req.to, req.fromBox);
  const dstBorder = rectAnchor(waypoints[waypoints.length - 1] ?? req.from, req.toBox);
  const path = [srcBorder, ...waypoints, dstBorder];

  return { ok: true, path };
}

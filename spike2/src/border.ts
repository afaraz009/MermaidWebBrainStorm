import type { IRNode } from './types.js';

// Shape-aware border clipping. Returns the point on the node's outline along
// the ray from the node center toward `toward`.
//
// Mirrors `clipPointToNodeBorder` in md-diagrams-testing/lib/layout/runDagre.ts:
// rectangle/rounded-rectangle use bbox, diamond uses rotated-square edges,
// circle/round use radial intersection.
export function clipToBorder(
  node: IRNode,
  toward: { x: number; y: number }
): { x: number; y: number } {
  const cx = node.x ?? 0;
  const cy = node.y ?? 0;
  const hw = (node.width ?? 80) / 2;
  const hh = (node.height ?? 40) / 2;

  const dx = toward.x - cx;
  const dy = toward.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy - hh };

  const shape = node.shape;

  if (shape === 'diamond') {
    // Diamond vertices clockwise from top
    const verts = [
      { x: cx,      y: cy - hh },
      { x: cx + hw, y: cy      },
      { x: cx,      y: cy + hh },
      { x: cx - hw, y: cy      },
    ];
    let bestT = Infinity;
    let bestPt: { x: number; y: number } | null = null;
    for (let i = 0; i < 4; i++) {
      const a = verts[i];
      const b = verts[(i + 1) % 4];
      const t = rayIntersectSegmentParam(cx, cy, toward.x, toward.y, a.x, a.y, b.x, b.y);
      if (t !== null && t >= 0 && t < bestT) {
        bestT = t;
        bestPt = { x: cx + t * dx, y: cy + t * dy };
      }
    }
    return bestPt ?? { x: cx, y: cy };
  }

  if (shape === 'circle' || shape === 'double-circle') {
    const r = Math.min(hw, hh);
    const len = Math.sqrt(dx * dx + dy * dy);
    return { x: cx + (dx / len) * r, y: cy + (dy / len) * r };
  }

  // Rectangle / rounded / stadium / cylinder / parallelogram fallback.
  const tx = dx !== 0 ? hw / Math.abs(dx) : Infinity;
  const ty = dy !== 0 ? hh / Math.abs(dy) : Infinity;
  const t = Math.min(tx, ty);
  return { x: cx + dx * t, y: cy + dy * t };
}

// Parameter t along ray (cx,cy)→(tx,ty) where it crosses segment (ax,ay)–(bx,by).
// Returns null if parallel or outside the segment.
function rayIntersectSegmentParam(
  cx: number, cy: number, tx: number, ty: number,
  ax: number, ay: number, bx: number, by: number
): number | null {
  const dx1 = tx - cx, dy1 = ty - cy;
  const dx2 = bx - ax, dy2 = by - ay;
  const denom = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denom) < 1e-10) return null;
  const t = ((ax - cx) * dy2 - (ay - cy) * dx2) / denom;
  const u = ((ax - cx) * dy1 - (ay - cy) * dx1) / denom;
  if (t >= 0 && u >= 0 && u <= 1) return t;
  return null;
}

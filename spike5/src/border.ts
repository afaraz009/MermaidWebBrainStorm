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

  if (shape === 'ellipse') {
    // Ray–ellipse intersection. (dx/a)^2 + (dy/b)^2 = (1/t)^2 ⇒ t scales to the
    // outline. Avoids the bbox over-shoot for tall/wide ellipses.
    const a = hw, b = hh;
    const t = 1 / Math.sqrt((dx * dx) / (a * a) + (dy * dy) / (b * b));
    return { x: cx + dx * t, y: cy + dy * t };
  }

  if (shape === 'hexagon') {
    return clipToPolygon(cx, cy, dx, dy, hexagonVerts(cx, cy, hw, hh));
  }

  if (shape === 'parallelogram') {
    return clipToPolygon(cx, cy, dx, dy, parallelogramRightVerts(cx, cy, hw, hh));
  }

  if (shape === 'parallelogram-alt') {
    return clipToPolygon(cx, cy, dx, dy, parallelogramLeftVerts(cx, cy, hw, hh));
  }

  if (shape === 'trapezoid') {
    return clipToPolygon(cx, cy, dx, dy, trapezoidVerts(cx, cy, hw, hh));
  }

  if (shape === 'trapezoid-alt') {
    return clipToPolygon(cx, cy, dx, dy, trapezoidAltVerts(cx, cy, hw, hh));
  }

  if (shape === 'asymmetric') {
    return clipToPolygon(cx, cy, dx, dy, asymmetricVerts(cx, cy, hw, hh));
  }

  // Rectangle / round / stadium / subroutine / cylinder fallback.
  // These all live inside their bounding box, so bbox clipping is correct.
  const tx = dx !== 0 ? hw / Math.abs(dx) : Infinity;
  const ty = dy !== 0 ? hh / Math.abs(dy) : Infinity;
  const t = Math.min(tx, ty);
  return { x: cx + dx * t, y: cy + dy * t };
}

// ── Shape vertex generators (clockwise from top-leftish) ──────────────────
// Each generator returns polygon vertices in screen coords. `clipToPolygon`
// walks the edges and picks the smallest positive t along the ray.

export const HEX_INSET = 0.25; // horizontal indent of hexagon side vertices

export function hexagonVerts(cx: number, cy: number, hw: number, hh: number): { x: number; y: number }[] {
  const ix = hw * HEX_INSET;
  return [
    { x: cx - hw + ix, y: cy - hh },
    { x: cx + hw - ix, y: cy - hh },
    { x: cx + hw,      y: cy      },
    { x: cx + hw - ix, y: cy + hh },
    { x: cx - hw + ix, y: cy + hh },
    { x: cx - hw,      y: cy      },
  ];
}

export const PARA_SKEW = 0.25; // horizontal skew as fraction of half-width

export function parallelogramRightVerts(cx: number, cy: number, hw: number, hh: number): { x: number; y: number }[] {
  const sk = hw * PARA_SKEW;
  return [
    { x: cx - hw + sk, y: cy - hh },
    { x: cx + hw,      y: cy - hh },
    { x: cx + hw - sk, y: cy + hh },
    { x: cx - hw,      y: cy + hh },
  ];
}

export function parallelogramLeftVerts(cx: number, cy: number, hw: number, hh: number): { x: number; y: number }[] {
  const sk = hw * PARA_SKEW;
  return [
    { x: cx - hw,      y: cy - hh },
    { x: cx + hw - sk, y: cy - hh },
    { x: cx + hw,      y: cy + hh },
    { x: cx - hw + sk, y: cy + hh },
  ];
}

export function trapezoidVerts(cx: number, cy: number, hw: number, hh: number): { x: number; y: number }[] {
  const sk = hw * PARA_SKEW;
  return [
    { x: cx - hw + sk, y: cy - hh }, // top-left
    { x: cx + hw - sk, y: cy - hh }, // top-right
    { x: cx + hw,      y: cy + hh }, // bottom-right
    { x: cx - hw,      y: cy + hh }, // bottom-left
  ];
}

export function trapezoidAltVerts(cx: number, cy: number, hw: number, hh: number): { x: number; y: number }[] {
  const sk = hw * PARA_SKEW;
  return [
    { x: cx - hw,      y: cy - hh }, // top-left
    { x: cx + hw,      y: cy - hh }, // top-right
    { x: cx + hw - sk, y: cy + hh }, // bottom-right
    { x: cx - hw + sk, y: cy + hh }, // bottom-left
  ];
}

export const ASYM_NOTCH = 0.25; // size of the left-side "flag" notch

export function asymmetricVerts(cx: number, cy: number, hw: number, hh: number): { x: number; y: number }[] {
  // Mermaid's >text] shape: rectangle with a chevron-notched left side.
  const notch = hw * ASYM_NOTCH;
  return [
    { x: cx - hw + notch, y: cy - hh }, // top, just right of the notch
    { x: cx + hw,         y: cy - hh },
    { x: cx + hw,         y: cy + hh },
    { x: cx - hw + notch, y: cy + hh },
    { x: cx - hw,         y: cy      }, // notch apex
  ];
}

function clipToPolygon(
  cx: number, cy: number,
  dx: number, dy: number,
  verts: { x: number; y: number }[],
): { x: number; y: number } {
  let bestT = Infinity;
  let bestPt: { x: number; y: number } | null = null;
  const tx = cx + dx, ty = cy + dy;
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % verts.length];
    const t = rayIntersectSegmentParam(cx, cy, tx, ty, a.x, a.y, b.x, b.y);
    if (t !== null && t >= 0 && t < bestT) {
      bestT = t;
      bestPt = { x: cx + t * dx, y: cy + t * dy };
    }
  }
  return bestPt ?? { x: cx, y: cy };
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

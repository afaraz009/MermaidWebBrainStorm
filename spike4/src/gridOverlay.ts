import { buildGrid, currentConfig } from './routing.js';
import { lastTrace } from './astarSettings.js';
import type { IR } from './types.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const OVERLAY_ID = 'astar-grid-overlay';

// Render the A*-routing grid as an SVG overlay on `mountEl`. Uses the exact
// same grid construction A* uses at drop time (no excluded nodes — pure view
// of the obstacle field). Blocked cells are tinted red; free cells get faint
// gridlines so the routing space is visible.
//
// `mountEl` is the same <svg> the diagram is rendered into. The overlay is
// inserted as the FIRST child so it sits behind every other layer.
export function renderGridOverlay(mountEl: SVGElement, ir: IR): void {
  clearGridOverlay(mountEl);
  const grid = buildGrid(ir, new Set(), currentConfig());
  if (grid.cols < 2 || grid.rows < 2) return;

  const g = document.createElementNS(SVG_NS, 'g') as SVGGElement;
  g.setAttribute('id', OVERLAY_ID);
  g.setAttribute('pointer-events', 'none');

  const cellSize = grid.cellSize;
  const width = grid.cols * cellSize;
  const height = grid.rows * cellSize;

  // Background rect makes the routable area visually distinct from the
  // canvas outside the grid.
  const bg = document.createElementNS(SVG_NS, 'rect');
  bg.setAttribute('x', String(grid.originX));
  bg.setAttribute('y', String(grid.originY));
  bg.setAttribute('width', String(width));
  bg.setAttribute('height', String(height));
  bg.setAttribute('fill', '#fafbfd');
  bg.setAttribute('stroke', '#c3cad8');
  bg.setAttribute('stroke-width', '1');
  bg.setAttribute('opacity', '0.25');
  g.appendChild(bg);

  // Closed/open cells from the last A* call. Drawn first so blocked cells
  // (drawn next) and the path itself overlay them. The trace's grid origin
  // and dimensions might differ from the current grid (e.g. if the user
  // changed cellSize between routing and overlay render), so we use the
  // trace's own coordinate system.
  const trace = lastTrace.value;
  if (trace) {
    let closedD = '';
    let openD = '';
    for (let r = 0; r < trace.rows; r++) {
      for (let c = 0; c < trace.cols; c++) {
        const idx = r * trace.cols + c;
        const x = trace.originX + c * trace.cellSize;
        const y = trace.originY + r * trace.cellSize;
        if (trace.closed[idx]) {
          closedD += `M ${x} ${y} h ${trace.cellSize} v ${trace.cellSize} h ${-trace.cellSize} z `;
        } else if (trace.open[idx]) {
          openD += `M ${x} ${y} h ${trace.cellSize} v ${trace.cellSize} h ${-trace.cellSize} z `;
        }
      }
    }
    if (closedD) {
      const closedEl = document.createElementNS(SVG_NS, 'path');
      closedEl.setAttribute('d', closedD);
      closedEl.setAttribute('fill', '#5a8bdc');
      closedEl.setAttribute('opacity', '0.45');
      g.appendChild(closedEl);
    }
    if (openD) {
      const openEl = document.createElementNS(SVG_NS, 'path');
      openEl.setAttribute('d', openD);
      openEl.setAttribute('fill', '#2ec27e');
      openEl.setAttribute('opacity', '0.55');
      g.appendChild(openEl);
    }
  }

  // Blocked cells — one merged path for efficiency. Cells inside the last
  // routed edge's endpoint nodes are skipped, since they weren't obstacles
  // for that edge. The trace's grid must match the overlay's grid for this
  // suppression to align correctly (same cellSize/origin/dims).
  const traceAligned = trace
    && trace.cellSize === cellSize
    && trace.cols === grid.cols
    && trace.rows === grid.rows
    && trace.originX === grid.originX
    && trace.originY === grid.originY;
  const excluded = traceAligned ? trace!.excludedCells : null;
  let blockedD = '';
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const idx = r * grid.cols + c;
      if (grid.blocked[idx] !== 1) continue;
      if (excluded && excluded[idx]) continue;
      const x = grid.originX + c * cellSize;
      const y = grid.originY + r * cellSize;
      blockedD += `M ${x} ${y} h ${cellSize} v ${cellSize} h ${-cellSize} z `;
    }
  }
  if (blockedD) {
    const blockedEl = document.createElementNS(SVG_NS, 'path');
    blockedEl.setAttribute('d', blockedD);
    blockedEl.setAttribute('fill', '#e0395d');
    blockedEl.setAttribute('opacity', '0.5');
    g.appendChild(blockedEl);
  }

  // Highlight the start and goal cells of the most recent A* call — the cells
  // A* actually used as endpoints (one cell outside each node's padded bbox).
  if (traceAligned) {
    const drawMarker = (cx: number, cy: number, fill: string) => {
      const x = trace!.originX + cx * trace!.cellSize;
      const y = trace!.originY + cy * trace!.cellSize;
      const m = document.createElementNS(SVG_NS, 'rect');
      m.setAttribute('x', String(x));
      m.setAttribute('y', String(y));
      m.setAttribute('width', String(trace!.cellSize));
      m.setAttribute('height', String(trace!.cellSize));
      m.setAttribute('fill', fill);
      m.setAttribute('stroke', '#1a2942');
      m.setAttribute('stroke-width', '1');
      m.setAttribute('opacity', '0.85');
      g.appendChild(m);
    };
    drawMarker(trace!.startCell.cx, trace!.startCell.cy, '#2ec27e');
    drawMarker(trace!.goalCell.cx,  trace!.goalCell.cy,  '#e0395d');
  }

  // Gridlines — one path with all verticals + horizontals merged.
  let lineD = '';
  for (let c = 0; c <= grid.cols; c++) {
    const x = grid.originX + c * cellSize;
    lineD += `M ${x} ${grid.originY} V ${grid.originY + height} `;
  }
  for (let r = 0; r <= grid.rows; r++) {
    const y = grid.originY + r * cellSize;
    lineD += `M ${grid.originX} ${y} H ${grid.originX + width} `;
  }
  const linesEl = document.createElementNS(SVG_NS, 'path');
  linesEl.setAttribute('d', lineD);
  linesEl.setAttribute('stroke', '#c3cad8');
  linesEl.setAttribute('stroke-width', '0.5');
  linesEl.setAttribute('fill', 'none');
  linesEl.setAttribute('opacity', '0.55');
  g.appendChild(linesEl);

  // Insert AFTER the subgraph group so the overlay sits on top of subgraph
  // fills (which would otherwise dim the cell tints), but before the edge and
  // node groups so edges and labels stay crisp on top.
  const sgGroup = mountEl.querySelector('g.subgraphs');
  if (sgGroup && sgGroup.nextSibling) {
    mountEl.insertBefore(g, sgGroup.nextSibling);
  } else if (sgGroup) {
    mountEl.appendChild(g);
  } else if (mountEl.firstChild) {
    mountEl.insertBefore(g, mountEl.firstChild);
  } else {
    mountEl.appendChild(g);
  }
}

export function clearGridOverlay(mountEl: SVGElement): void {
  const existing = mountEl.querySelector(`#${OVERLAY_ID}`);
  if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
}

export function isGridOverlayShown(mountEl: SVGElement): boolean {
  return !!mountEl.querySelector(`#${OVERLAY_ID}`);
}

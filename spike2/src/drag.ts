import { updateNodePosition, applyRoutedEdges, edgeKey, type RenderState } from './renderer';
import { routeEdge, type Obstacle } from './astar';

export interface DragOptions {
  onChange?: () => void;
}

export function attachDrag(state: RenderState, opts: DragOptions = {}): () => void {
  let dragId: string | null = null;
  let offsetX = 0;
  let offsetY = 0;

  const svgPoint = (clientX: number, clientY: number) => {
    const p = state.svg.createSVGPoint();
    p.x = clientX;
    p.y = clientY;
    const ctm = state.svg.getScreenCTM();
    if (!ctm) return { x: clientX, y: clientY };
    const t = p.matrixTransform(ctm.inverse());
    return { x: t.x, y: t.y };
  };

  const onDown = (ev: MouseEvent) => {
    const target = (ev.target as Element).closest('[data-node-id]') as SVGGElement | null;
    if (!target) return;
    dragId = target.dataset.nodeId!;
    const node = state.ir.nodes.find((n) => n.id === dragId);
    if (!node) return;
    const pt = svgPoint(ev.clientX, ev.clientY);
    offsetX = pt.x - (node.x ?? 0);
    offsetY = pt.y - (node.y ?? 0);
    target.style.cursor = 'grabbing';
    ev.preventDefault();
  };

  const onMove = (ev: MouseEvent) => {
    if (!dragId) return;
    const pt = svgPoint(ev.clientX, ev.clientY);
    updateNodePosition(state, dragId, pt.x - offsetX, pt.y - offsetY);
    opts.onChange?.();
  };

  const onUp = () => {
    if (!dragId) return;
    const droppedId = dragId;
    const node = state.ir.nodes.find((n) => n.id === droppedId);
    if (node) node.pinned = true;
    const target = state.svg.querySelector(`[data-node-id="${droppedId}"]`) as SVGGElement | null;
    if (target) target.style.cursor = 'grab';

    // A*-route every edge connected to the dropped node.
    const edgeKeys = state.adjacency.get(droppedId) ?? [];
    if (edgeKeys.length > 0) {
      const bounds = {
        width: Number(state.svg.getAttribute('width') ?? 800),
        height: Number(state.svg.getAttribute('height') ?? 600),
      };
      const allObstacles: Obstacle[] = state.ir.nodes
        .filter((n) => n.x !== undefined && n.y !== undefined)
        .map((n) => ({ x: n.x!, y: n.y!, width: n.width ?? 80, height: n.height ?? 40 }));
      const nodeById = new Map(state.ir.nodes.map((n) => [n.id, n]));

      for (const k of edgeKeys) {
        const e = state.ir.edges.find((ed) => edgeKey(ed) === k);
        if (!e) continue;
        const fromNode = nodeById.get(e.from);
        const toNode = nodeById.get(e.to);
        if (!fromNode || !toNode || fromNode.x === undefined || toNode.x === undefined) continue;
        const fromBox: Obstacle = { x: fromNode.x!, y: fromNode.y!, width: fromNode.width ?? 80, height: fromNode.height ?? 40 };
        const toBox: Obstacle = { x: toNode.x!, y: toNode.y!, width: toNode.width ?? 80, height: toNode.height ?? 40 };
        // Build obstacle list excluding the two endpoints.
        const obstacles = allObstacles.filter((o) => o !== fromBox && o !== toBox);
        // Re-include the box objects themselves via identity in the routeEdge filter:
        // routeEdge already filters fromBox/toBox by identity, so pass them as-is.
        const result = routeEdge({
          from: { x: fromNode.x!, y: fromNode.y! },
          to: { x: toNode.x!, y: toNode.y! },
          fromBox, toBox,
          obstacles: [...obstacles, fromBox, toBox],
          bounds,
        });
        if (result.ok && result.path.length >= 2) {
          e.routedPath = result.path;
          e.routedAt = { fromX: fromNode.x!, fromY: fromNode.y!, toX: toNode.x!, toY: toNode.y! };
        }
      }

      applyRoutedEdges(state, edgeKeys);
    }

    dragId = null;
    opts.onChange?.();
  };

  state.svg.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);

  return () => {
    state.svg.removeEventListener('mousedown', onDown);
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };
}

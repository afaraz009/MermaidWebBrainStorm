# 03 — Rendering & Edges

[← architecture index](README.md)

> **TL;DR.** `renderFull(ir, svg)` paints four stacked SVG layers — defs, subgraph
> rects, edges, nodes — and stashes a `__meta` object on the mount element so
> interaction handlers can mutate the scene without re-querying the DOM. Two facts
> dominate everything: **a node's `(x,y)` is its center but its SVG `transform` is its
> top-left** (`x − w/2, y − h/2`); and **edges are 4-point "side-aware" curves**
> `[anchor, stub, peerStub, peerAnchor]` drawn with d3 `curveBasis`, not straight
> lines. Edge labels anchor to dagre's recorded coord snapped onto the path, falling
> back to the arc-length midpoint.

---

## 1. `renderFull()` — the scene builder (`src/renderer.ts:730`)

`renderFull(ir, mountEl, interactive = false, originalIR?)` rebuilds the entire SVG
from the IR. Layers paint in this order (later = on top):

1. **`<defs>`** (`:736`) — the arrowhead `<marker>`.
2. **`<g class="subgraphs">`** (`:755`) — cluster rectangles + titles, **outer-first**
   (`sortSubgraphsOuterFirst`, `:1278`) so an inner cluster's rect paints on top and
   receives clicks before its parent.
3. **`<g class="edges">`** (`:833`) — edge `<path>` + a separate arrow `<line>` + label.
4. **`<g class="nodes">`** (`:927`) — node shapes + labels.

Then `fitSVG()` (`:1294`) sizes the `viewBox` to the content extent + 40px padding, and
the `__meta` object (§4) is attached at `:830`.

Data attributes are the interaction contract: `data-node-id`, `data-surrogate-for`
(collapsed-cluster stand-ins), `data-subgraph-id`, `data-edge-key` (= `e.id`).

---

## 2. The center / top-left rule (don't forget this)

IR stores node **centers**. The renderer draws each node group at its **top-left**:

```ts
g.setAttribute('transform', `translate(${n.x - n.width/2}, ${n.y - n.height/2})`);  // :938
```

Shape geometry is then authored in group-local coords spanning `(0,0)→(w,h)`. So when
you read a `[data-node-id]` transform back during verification, it's the top-left — the
center is `transform + (w/2, h/2)`. (This is exactly the trap that caused a false
"stale coordinate" diagnosis during the drag-bug work.)

---

## 3. Node shapes (`createShapeElements`, `:67`)

Dispatches on `NodeShape` and returns SVG primitives:

- **Rounded family** — `rect` (`rx=4`), `round` (`rx=8`), `stadium` (`rx=h/2`),
  `subroutine` (rect + two side bars), `cylinder` (elliptical-arc `<path>`).
- **Circular** — `circle`, `double-circle` (`<circle>` ×1/2), `ellipse`.
- **Polygonal** — `diamond`, `hexagon`, `parallelogram(-alt)`, `trapezoid(-alt)`,
  `asymmetric` — vertices come from `border.ts` generators (`hexagonVerts`,
  `parallelogramRightVerts`, …) so the **same vertex math** is used to *draw* the shape
  and to *clip edges* to it. That shared source is why edges land exactly on the drawn
  outline.

Dimensions are not computed here — they come from layout (`sizeForShape` in
`layout-core.ts`, calibrated against Mermaid's dagre input).

**Surrogates** (`:941`): when `isSurrogateId(n.id)`, the node is a collapsed cluster's
stand-in — drawn as a `round` shape with a stacked-card shadow and a `(N)` count badge
(`countHiddenDescendants`), regardless of the underlying shape.

---

## 4. The `__meta` object (`:46`, attached `:830`)

```ts
interface MountMeta {
  ir: IR;                                    // live layout state
  adjacency:      Map<nodeId, edgeKey[]>;    // which edges touch a node
  edgeMap:        Map<edgeKey, IREdge>;
  displayPoints:  Map<edgeKey, {x,y}[]>;     // what's CURRENTLY drawn (may differ from IR mid-drag)
  displayMode:    Map<edgeKey, 'curve'|'straight'>;
  subgraphRects:  Map<sgId, SVGRectElement>;
  subgraphLabels: Map<sgId, SVGTextElement>;
}
```

Interaction handlers read `__meta` to update only what moved. `displayPoints` /
`displayMode` track the *visible* geometry separately from the IR, which is what lets a
drag preview show dotted side-aware curves without committing them until mouseup. In
verification, `mountEl.__meta.ir` is the cleanest way to read true positions.

---

## 5. Edges — the side-aware curve system

Edges are **not** straight center-to-center lines (except in the simplest drag preview).
The core builder is **`buildSideAwareCurvesForNode(pivotNode, edges, nodesById,
clusterBboxes, stubDist=16)`** (`:378`), used both on initial render and on drag. It
returns, per edge, a **4-point curve**:

```
[ anchor,  stub,  peerStub,  peerAnchor ]
   │         │        │          └ point on the peer's outline
   │         │        └ short perpendicular off the peer's anchor
   │         └ short perpendicular off the pivot's anchor (gives curveBasis a clean tangent)
   └ point on the pivot node's outline
```

How each edge is shaped:

1. **Axis classification** — `classifyAxis(a,b)` (`:266`) returns `vertical`,
   `horizontal`, or `overlap` based on **bbox clearance with hysteresis** (the side only
   flips once one node fully clears the other), preventing jitter during drag.
2. **Discrete side** (vertical/horizontal): pick the facing side, then **distribute
   parallel edges** across the inner 80% of that side (sorted by peer position) so
   multiple edges fan out instead of overlapping. Each anchor is the *shape-aware*
   outline intersection (`clipToBorder`) toward a virtual target — mandatory for
   diamonds/hexagons where the side midpoint isn't on the outline.
3. **Overlap** (bboxes interpenetrate): radial `clipToBorder` on both ends with an
   outward-normal stub (`stubAlongNormal`).
4. **Cluster anchoring** — two branches, both clipping to the **drawn cluster rect**
   (`clipToClusterRect`) instead of a leaf:
   - **Peer-side cluster** (`:395`): the *other* end is a cluster-anchored leaf → anchor
     to the peer cluster's border.
   - **Pivot-side cluster** (`:407`): the *dragged* node is itself a cluster's rewritten
     representative leaf → anchor the **cluster border ↔ peer** and skip pivot fan-out.
     This is the fix for "dragging Open Doc reconnected Halt to Open Doc" — see
     [04](04-interaction-and-routing.md).

The curve is rendered by `edgeCurvePath` (`:585`): wrap endpoints, **shorten the final
segment by `ARROW_TIP_LEN` (10px)** so the arrowhead lands on the border, then apply
d3 `curveBasis`. The arrowhead is a separate `<line>` (`updateArrowLine`, `:604`) so the
marker auto-rotates to the true incoming direction.

`buildSideAwareCurve` (`:345`) is the 2-node version used for simple drag previews.

---

## 6. Edge labels (`edgeLabelAnchor`, `:725`)

Two-tier placement, in priority order:

1. **`e.labelPos` present** → snap it to the **nearest vertex** of the drawn path
   (`nearestVertex`, `:694`). `labelPos` is dagre's label-dummy coord (recursive engine
   only); post-dagre clipping straightens the path so the raw coord can sit slightly off
   it — snapping recovers Mermaid's exact position (e.g. a label sitting just above the
   cluster title).
2. **No `labelPos`** → **arc-length midpoint** (`calcLabelPosition`, `:665`), a port of
   Mermaid's `utils.calcLabelPosition`: walk half the total path length and interpolate.
   This is the fallback after a side-aware/A* rebuild deletes `labelPos`.

> **Why not the middle-index point?** A side-aware curve's middle index is `peerStub` —
> right next to the arrowhead. Using it made labels jump to the arrowhead on drag. The
> arc-length midpoint is the fix; never reintroduce middle-index anchoring.

Label styling constants (`:29`) mirror Mermaid v11 (16px Trebuchet MS, `#e8e8e8` bg at
0.5 opacity) and must stay aligned across initial render, `restoreEdgeStyle`, and
`refreshEdgesFromLayout`.

---

## 7. The refresh & live-update flow

- **`initialEdgePoints(e)`** (`:626`) picks what to draw: `e.routedPath` **if A* is
  enabled** (mode `straight`), else `e.originalPoints` (mode `curve`). This single
  chooser is why A* cleanly overrides the other edge modes at render time.
- **`refreshEdgesFromLayout(mountEl)`** (`:1192`) — the reset/redraw path: for every IR
  edge, recompute points via `initialEdgePoints`, update path `d`, arrow, and label;
  snap nodes to IR positions; recompute subgraph rects. Used after `layout()` re-runs.
- **`updateNodePosition(id, x, y, mountEl, ir)`** (`:1010`) — the live drag tick: move
  the node's transform, rebuild its connected edges (side-aware unless A*/dagre mode),
  and call `updateSubgraphRects`.
- **`updateSubgraphRects(meta)`** (`:1249`) — re-runs `computeClusterBboxes(meta.ir)` and
  resizes each cluster rect/title live, so containers grow and shrink as you drag an
  interior node.

---

## 8. Cluster rectangles

Drawn in the subgraphs layer from `computeClusterBboxes(ir)` (the single source of
truth — see [02](02-layout-engine.md) §5). Each gets a `<g data-subgraph-id>` with a
filled `<rect>` and a centered title + `▾` caret; the rect and label elements are cached
in `__meta.subgraphRects`/`subgraphLabels` for cheap live updates. Outer-first paint
order (`:1278`) guarantees nested clusters sit visually inside — and click-priority
above — their parents.

---

**Next:** how drag, collapse, and routing drive all this →
[04 — Interaction & routing](04-interaction-and-routing.md).

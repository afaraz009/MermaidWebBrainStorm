# MermaidWeb — Flowchart Renderer Architecture

**Scope:** This document covers **only the flowchart renderer component** validated by Spikes 1–4. The full product is much bigger; this is the one piece spike work has finalized.
**Audience:** anyone building the production flowchart renderer off the spike work.
**Source of truth:** `spike4/` is the reference implementation. This doc explains *why* it is shaped the way it is and *what contracts* every module must keep.
**Companions:** `SPIKE_NOTES.md` for the path that got us here; `_bmad-output/planning-artifacts/prd.md` for the surrounding product; `_bmad-output/planning-artifacts/architecture-decisions-renderer.md` for the locked renderer-stack decisions this implements.

---

## 1. How this fits the larger product

MermaidWeb is a Markdown-native, comprehension-first workspace for technical documentation containing Mermaid diagrams. The full Wave 1.1 product includes a Markdown source + preview workspace, a Mermaid syntax editor, backend persistence with short share URLs, anonymous sessions, premium auth/billing, command palette, minimap, and the full four-mode progressive-disclosure family (collapse, focus, path-trace, depth-slider). See `prd.md` for the complete scope.

**This document describes one component of that product: the flowchart renderer.** The renderer is the load-bearing piece of the product thesis — the disclosure family and interactive editing both live here, and the PRD's renderer-research session locked the stack choices (SVG + parser-only Mermaid + dagre + d3-shape) that Spikes 1–4 then implemented and validated.

**What the renderer does *not* own** (and this doc therefore does not cover):
- Markdown parsing / preview / source editing surfaces.
- The **Renderer Router** that dispatches flowcharts to this pipeline and other Mermaid types (sequence, class, state, ER, gantt) to Mermaid's own renderer as a viewer-only fallback (PRD `FR15a`). The disclosure family is **flowchart-first by design**; this renderer never sees non-flowchart input.
- Backend persistence, short-URL generation, anonymous sessions, auth, billing, sharing permissions, export, analytics.
- The three unbuilt disclosure modes (focus, path-trace, depth-slider), command palette, and minimap — these will plug into this renderer's IR transform pattern (see §4) when their spikes happen, but they are not in scope for this document.

**Constraints inherited from the PRD that *do* shape this renderer's design:**
- `NFR-P3` — interaction frame time ≤16ms p50 / ≤33ms p95 on a 200-node diagram. Drives the partial-update DOM mutation pattern in §8 and the live-mutable settings approach in §13.
- `NFR-P4/P5` — graceful degradation at 500 nodes, no-crash at 1000. Drives the performance budget in §15.
- `NFR-P2` — time-to-first-render ≤1.5s on 200 nodes. Drives the bundle-size discipline that locked parser-only + dagre + d3-shape over shipping full Mermaid (~800KB savings).
- `FR3` — interactive canvas (click/hover/select directly), not a static image. Drives the data-* delegation contract in §12.
- `FR15a` — non-flowchart types are not this renderer's problem; the Renderer Router handles them.

---

## 2. The pipeline (every diagram flows through this)

```
mermaid (parser only) ──► IR (canonical) ──► deriveEffectiveIR ──► layout (dagre) ──►
   ──► edge geometry (A* | side-aware | dagre) ──► SVG (renderer) ──► interactions
```

Each stage has one module owner and one input/output shape. Modules **never reach across** — they pass through the IR.

| Stage | Module(s) | Input | Output |
|---|---|---|---|
| Parse | `parser-adapter.ts` | Mermaid source string | `IR` |
| Disclosure transform | `effective-ir.ts` | `IR` (with `collapsed` flags) | `IR` (effective) |
| Layout | `layout.ts` | effective `IR` | mutated `IR` with `x,y,width,height,points,originalPoints` |
| Edge geometry | `renderer.ts` (`initialEdgePoints`, side-aware helpers); `routing.ts` (A*) | effective `IR` + settings | edge waypoint arrays |
| Render | `renderer.ts` | effective `IR` | DOM (SVG) |
| Interaction | `drag.ts`, `collapse.ts`, `pan.ts`, `contextMenuWiring.ts`, `connect.ts` | DOM events + `IR` | mutates `IR`, calls `rerenderWithCollapse` |

---

## 3. The IR (canonical state)

Defined in `spike4/src/types.ts`. Three arrays — `nodes`, `edges`, `subgraphs` — plus a 15-value `NodeShape` union covering every Mermaid flowchart shape.

```ts
interface IRNode    { id; label; shape: NodeShape; parent?; pinned?; x?; y?; width?; height?; }
interface IREdge    { from; to; label?; style?; points?; originalPoints?; routedPath?; }
interface IRSubgraph{ id; label; parent?; children: string[]; collapsed?; }
interface IR        { nodes: IRNode[]; edges: IREdge[]; subgraphs: IRSubgraph[]; }
```

**Invariants:**
- `IR` is mutated **only** by user actions (parse load, drag pin, collapse toggle, context-menu edit, connect, reset). Nothing in the render pipeline mutates `IR` except `layout()` writing back geometry.
- `shape` must be a member of the `NodeShape` union — `parser-adapter.ts::mapShape` is the only entry point and it falls back to `'rect'` for unknown vertex types.
- `IREdge` carries three optional waypoint arrays with distinct meanings:
  - `originalPoints` — dagre's output or side-aware curve (the "default" geometry).
  - `points` — currently displayed waypoints (may equal `originalPoints` or be replaced by side-aware during drag).
  - `routedPath` — A* result. When present and A* is enabled, takes precedence at render time.

---

## 4. The `ir` / `currentEff` split (the architectural cornerstone)

`entry.ts` owns two top-level variables:

```ts
let ir: IR;          // canonical, user-mutated
let currentEff: IR;  // disclosure-transformed, what everything else sees
```

`currentEff = deriveEffectiveIR(ir)` is recomputed on every collapse, expand, reset, and on initial load. **Every other module receives `currentEff`, never `ir`.** This single rule is what lets us add new disclosure transforms (focus, path-trace, depth-slider) without touching the renderer.

`syncEffToSource()` writes positions/sizes computed for `currentEff` back onto matching ids in `ir`, so hidden nodes "remember" their last-known position when re-shown.

---

## 5. The `deriveEffectiveIR` transform contract

Pure function. No DOM. ~100 LOC. Located in `effective-ir.ts`.

**Inputs:** canonical `IR` (the only relevant flag today is `IRSubgraph.collapsed`).
**Output:** fresh `IR` where:
1. Leaf nodes inside an outermost-collapsed ancestor are removed.
2. One **surrogate** leaf node (id `__sg__<sgId>`, shape `'rect'`) is added per outermost-collapsed subgraph.
3. Visible subgraphs are kept; subgraphs shadowed by a collapsed ancestor are removed.
4. Edges are remapped to surrogate endpoints; interior edges (both endpoints in same collapsed subgraph) are dropped; duplicate `(from,to)` pairs are deduped.

**"Outermost-collapsed wins"** — if both an outer and inner subgraph are collapsed, only the outer surrogate appears.

**Adding new transforms (focus / path-trace / depth-slider):** write another pure function with the same `IR → IR` shape and compose. The architecture is open to a transform pipeline; v1 only needs collapse, but the seam is there.

---

## 6. Layout (`layout.ts`)

- **Library:** `@dagrejs/dagre` with `multigraph: true, compound: true`. Settings match Mermaid's: `rankdir: 'TB'`, `nodesep: 50`, `ranksep: 50`, `marginx/y: 8`.
- **Per-shape canonical sizes** in `SHAPE_SIZES` — each shape has a base footprint; labels longer than the base widen the width but never below canonical.
- **Grid-snap toggle:** when `astarSettings.enabled`, node sizes and positions snap to `cellSize` so node borders fall on grid lines (required for A*). When A* is off, dagre's positions are used verbatim — coupling layout to `cellSize` while A* is invisible would cause unwanted drift when the user moves the cellSize slider.
- **Mermaid subgraph-ordering parity:** `chooseEdgesToReverseForMermaidOrder(ir)` detects inter-cluster cycles between top-level subgraphs and reverses earlier→later edges in dagre's input so the later-declared cluster ranks above. Edge points are flipped back post-layout. **Why this is needed (verified 2026-05-20):** `@dagrejs/dagre` and `dagre-d3-es` (the fork Mermaid uses) implement the *same* DFS-based feedback-arc-set algorithm — the cycle-breaking heuristic is identical. The divergence comes from upstream of dagre: Mermaid pre-processes the graph in `mermaid-graphlib.js` (`adjustClustersAndEdges`, `extractor`, `sortNodesByHierarchy`) before calling layout — rewriting cross-cluster edges to endpoint-on-cluster-id, extracting each subgraph into its own nested `graphlib.Graph` and running dagre per-subgraph, and re-emitting nodes in parent-then-children order. Because `dfsFAS` iterates `g.nodes()` in insertion order, those upstream changes flip which back-edge gets reversed and therefore which subgraph ranks above. We hand dagre a flat graph instead, so `chooseEdgesToReverseForMermaidOrder` is the smaller-surface alternative: pre-reverse the same set of edges Mermaid would end up reversing, without porting Mermaid's whole cluster-extraction pipeline. Live-toggleable via `astarSettings.mermaidParity` and the "Mermaid parity" button.
- **`fixBranchOrdering` mirror pass** runs only on flat graphs (no subgraphs) to correct dagre's left/right branch ordering against Mermaid's first-declared-target-left convention.
- **Edge waypoint clipping:** the first/last waypoint of each edge is replaced by `clipToBorder(node, neighborPoint)` so endpoints land on the visible outline of the node, not the centre. A 2-point edge gets a midpoint inserted so `curveBasis` produces a smooth curve.

---

## 7. Edge rendering (three orthogonal strategies)

Two orthogonal settings in `astarSettings.ts`:

```ts
enabled: boolean;             // A* on/off
edgeMode: 'side-aware' | 'dagre';  // non-A* fallback strategy
```

**Render-time decision tree (`renderer.ts::initialEdgePoints`):**
```
if (astarSettings.enabled && edge.routedPath?.length >= 2)
    → render edge.routedPath as straight polyline    // A*
else if (edge.originalPoints?.length > 0)
    → render edge.originalPoints with curveBasis     // dagre or side-aware curve
```

**Drag-time preview (`renderer.ts::updateNodePosition`):**
- `edgeMode === 'dagre'`: straight dotted center-to-center line. Visibly folds — that's the legacy behavior we kept as a toggle.
- `edgeMode === 'side-aware'`: distributed side-aware curves via `buildSideAwareCurvesForNode`. Faces are re-derived every `mousemove` so the curve flips sides when the dragged node crosses a peer.

**Drop-time geometry (`drag.ts` mouseup):**
- A* enabled → `routeEdgesBatch` over connected edges.
- Else `edgeMode === 'side-aware'` → stamp the live side-aware curves onto `edge.originalPoints`/`edge.points` (so the visible edge doesn't jump on release).
- Else `edgeMode === 'dagre'` → clear all `routedPath`, re-run `layout(ir)` so connected edges get fresh dagre originals for the new node position.

### Side-aware algorithm (brief)

1. **Pick a side** per node by aspect-ratio-normalized comparison: `|dy| * hw vs |dx| * hh` decides whether the edge anchors on a horizontal face (top/bottom) or vertical face (left/right).
2. **Anchor at face midpoint**, distributed along the side for parallel edges sharing the same pivot side.
3. **Seed the basis curve** with perpendicular stubs (`stubFromSide`) so the curve direction matches the face normal, then a Manhattan midpoint waypoint produces the swept-elbow shape.
4. **Handle bbox overlap** via `clipToBorder` so anchors stay on the visible outline regardless of which side was picked.

This is the strategy added in commit `76420cd` ("Manhattan midpoint waypoints… Mermaid-style swept curves"). It eliminates the drag-fold without needing A* and matches Mermaid's visual style for cross-rank edges.

### A* routing (`routing.ts` + `astar.ts`)

- Pure A* in `astar.ts` (no DOM, no IR).
- `routing.ts` builds the obstacle grid from node bboxes (padded one cell wide), picks face-centred dock cells with outward normals, and exposes `routeEdge` (single edge) and `routeEdgesBatch` (with separation modes: `off`/`soft`/`hard`).
- Settings live-mutable in `astarSettings.ts`: `cellSize`, `padding` (locked to cellSize), `marginCells`, `connectivity` (4/8), `cornerCut`, `heuristic` (manhattan/octile/euclidean/chebyshev/zero), `separation`.
- `astarSettings.lastTrace` carries the last expansion's open/closed cells for the debug overlay.

---

## 8. Renderer (`renderer.ts`)

**Three responsibilities, kept distinct:**
1. **`renderFull(ir, svg, …)`** — full re-render. Subgraphs paint as siblings (not nested) in their own layer, then nodes, then edges, all on top. Painting order is the event-delegation contract — see §11.
2. **`createShapeElements(shape, w, h, …)`** — returns SVG element(s) for any of the 15 shapes. Shares vertex helpers (`hexagonVerts`, `parallelogramRightVerts`, etc.) with `border.ts` so the visible outline and the edge clipper agree.
3. **`updateNodePosition(id, x, y, mountEl, ir)`** — partial-update mutator used during drag. Mutates `transform` on the node group and `d` on each connected edge in place — no re-render, no GC churn. 60fps even with hundreds of edges.

**Surrogate badge:** when a node's id starts with `__sg__`, draw a `+N` descendant-count badge in the corner using `countHiddenDescendants`. The renderer never asks what a surrogate "means" — it just renders the badge when it sees the prefix.

---

## 9. Border clipping (`border.ts`)

`clipToBorder(node, neighborPoint)` returns the point on the node's outline where the line from the node centre toward the neighbor exits the shape. Per-shape implementations:

- **Rectangular family** (rect, round, stadium, subroutine, cylinder) → bounding-box intersection.
- **Circle / double-circle** → radial intersection.
- **Diamond** → segment walk.
- **Ellipse** → closed-form ray-ellipse formula.
- **Polygonal** (hexagon, parallelogram-{,alt}, trapezoid{,-alt}, asymmetric) → ray-vs-polygon walk; vertex builders exported for renderer reuse.

**Geometry constants** in `border.ts`:
- `HEX_INSET = 0.25` — hex side-vertex horizontal indent.
- `PARA_SKEW = 0.25` — parallelogram/trapezoid skew.
- `ASYM_NOTCH = 0.25` — asymmetric "flag" notch depth.

Adding a new shape = add to `NodeShape`, add to `border.ts` (clipper + vertex helper), add to `renderer.ts::createShapeElements`, add to `layout.ts::SHAPE_SIZES`, add to `parser-adapter.ts::mapShape`. Five touch points; no other code needs to change.

---

## 10. Interactions

### 10.1 Drag (`drag.ts`)
mousedown → mousemove → mouseup. Selector is `[data-node-id]` — surrogates carry this attribute, so they drag like any other node. On mouseup: snap node to cellSize grid, pin, then dispatch edge geometry per §7. Drag-pinned positions survive collapse/expand/reset (only "Reset Layout" clears them).

### 10.2 Collapse / expand (`collapse.ts`)
- **Collapse:** delegated `click` on `[data-subgraph-id]` → flip `collapsed = true` → `rerenderWithCollapse()`. No `stopPropagation` — painting order handles it.
- **Expand:** mousedown on `[data-surrogate-for]` records position; `window` mouseup measures Euclidean distance; if `< 4px` (`CLICK_THRESHOLD_PX`), flip `collapsed = false`. Otherwise it was a drag — leave it to `drag.ts`.
- `window` (not `svg`) for mouseup so off-canvas releases still fire.

### 10.3 Pan / zoom (`pan.ts` + wheel handler in `entry.ts`)
Single CSS transform combining pan translate + zoom scale. Wheel zoom is cursor-anchored: pan is recomputed so the world point under the cursor stays under the cursor. Zoom clamp: `[0.25, 4]`.

### 10.4 Context menus (`contextMenu.ts`, `contextMenuWiring.ts`, `menuActions.ts`)
Single delegated `contextmenu` handler inspects `closest('[data-…]')` to pick one of four targets: canvas, node, edge, subgraph. Each target gets a tailored menu. Menu items call `menuActions.ts` which mutates `ir` then calls `rerenderWithCollapse`.

### 10.5 Connect-to (`connect.ts`)
"Connect-to" mode shows directional handles on a source node; clicking a target node (or subgraph) appends an edge to `ir.edges` and re-renders. Connect-target highlighting via the `.connect-target` CSS class on `[data-node-id]` / `[data-subgraph-id]`.

---

## 11. The render-orchestrator contract (`rerenderWithCollapse`)

**Every** state change that affects layout or visibility funnels through this one function in `entry.ts`:

```ts
function rerenderWithCollapse(): void {
  const overlayWasShown = isGridOverlayShown(svg);
  ir.edges.forEach(e => delete e.routedPath);   // stale relative to new layout
  currentEff = deriveEffectiveIR(ir);
  layout(currentEff);
  syncEffToSource();
  if (astarSettings.enabled) routeAllEffWithCurrentSeparation();
  renderFull(currentEff, svg, true, ir);
  reattach();                                   // re-bind drag handler
  if (overlayWasShown) renderGridOverlay(svg, currentEff);
}
```

Callers: collapse, expand, "Collapse All" / "Expand All", reset, context-menu edits, connect-to, fixture load.

**Do not invent siblings.** New features should call this. The only reason to bypass it is the partial-update drag path — and that's explicitly scoped to `updateNodePosition` mutating `transform`/`d` in place, not changing any IR shape.

---

## 12. DOM contract (event delegation)

These attributes are the entire delegation surface. Keep them stable; any new interaction should reuse them or add a new one with the same `data-` discipline.

| Attribute | On | Used by |
|---|---|---|
| `data-node-id` | every node group (including surrogates) | drag, context menu, connect, hover |
| `data-subgraph-id` | every subgraph group | collapse click, context menu |
| `data-surrogate-for` | every surrogate node | expand discrimination |
| `data-edge-key` | every edge group | edge hover style, context menu |

**Painting order (in `renderFull`):** subgraphs (siblings, not nested) → nodes → edges. A click hits the painted thing under the cursor. This is what lets node clicks not bubble to a subgraph ancestor.

---

## 13. Settings (`astarSettings.ts`)

Plain mutable object — zero-cost reads, shared by routing, overlay, and UI. Fields:

| Field | Type | Effect |
|---|---|---|
| `cellSize` | number | A* grid resolution and snap step |
| `padding` | number | obstacle ring around nodes; **locked to cellSize** |
| `marginCells` | number | extra obstacle ring beyond padding |
| `connectivity` | 4 \| 8 | A* neighbor count |
| `cornerCut` | boolean | allow A* to cut diagonal corners between obstacles |
| `heuristic` | enum | manhattan / octile / euclidean / chebyshev / zero |
| `enabled` | boolean | A* on/off — render-time precedence |
| `separation` | 'off'\|'soft'\|'hard' | parallel-edge separation in batch routing |
| `edgeMode` | 'side-aware'\|'dagre' | non-A* fallback strategy |

UI controls in `our-renderer.html` mutate these directly; the `change` handler on each control re-routes or re-renders as appropriate.

---

## 14. File map (the production codebase will start from this)

```
src/
  types.ts                  — IR + NodeShape union
  parser-adapter.ts         — Mermaid → IR (versioned wrapper)
  effective-ir.ts           — deriveEffectiveIR + surrogate helpers
  layout.ts                 — dagre adapter + Mermaid-parity passes
  border.ts                 — per-shape clipping + vertex builders
  renderer.ts               — full render + partial drag update + shape elements + side-aware curves
  astar.ts                  — pure A*
  astarSettings.ts          — live-mutable settings singleton
  routing.ts                — A* glue (grid build, dock cells, batch)
  gridOverlay.ts            — debug overlay
  drag.ts                   — mousedown/move/up + drop-time edge geometry
  collapse.ts               — click-vs-mousedown discrimination for collapse/expand
  pan.ts                    — pan state + CSS transform
  contextMenu.ts            — menu DOM + positioning
  contextMenuWiring.ts      — delegated handler + per-target menu construction
  menuActions.ts            — IR mutators for menu items + shape cycle
  connect.ts                — connect-to mode (directional handles, click-to-link)
  entry.ts                  — bootstrap + ir/currentEff state + rerenderWithCollapse + UI wiring
```

---

## 15. Performance budget and instrumentation hooks

PRD target: **≤16ms p50 / ≤33ms p95 interaction frames at 200 nodes**, graceful at 500, no-crash at 1000.

Hot paths to instrument:
- `layout(currentEff)` — dominant cost on collapse/expand/reset. Re-evaluate at 500+ nodes (spike 7 in `HANDOFF.md`).
- `routeEdgesBatch` — second worst on large diagrams when A* is on. Worst case is hub nodes; consider partial re-route (only edges whose source/target moved) before reaching for new routers.
- `updateNodePosition` — must stay constant-time per edge. The partial-update DOM mutation is what makes drag 60fps; don't replace it with a full re-render.
- `renderFull` — dominated by node count, not edge count. Acceptable up to 1000 in current shape.

Cheap measurement: wrap each in `performance.mark`/`performance.measure`, expose via a hidden dev panel.

---

## 16. Known limitations observed in the spikes

These were observed and accepted during Spikes 3–4. They are not "future work" — they are the current behavior of the renderer as validated, recorded so production engineers don't re-discover them.

| Limitation | Source | Current behavior |
|---|---|---|
| Multi-edge dedup hides parallel edges in collapsed state | Spike 3 §4 | When multiple sibling→inside-collapsed-subgraph edges remap to the same `(from, to)` pair after collapse, all but one are dropped from the effective IR. Source IR keeps them; expand restores them. |
| Whole-graph dagre re-layout on every disclosure change | Spike 3 §6 | `rerenderWithCollapse` runs `layout(currentEff)` on every collapse/expand/reset. Imperceptible at 200 nodes, untested at 500. |
| Collapse/expand has no animation | Spike 3 §6 | State changes are instant. Users in Spike 3 informal testing described it as "readable but jarring." |
| Shape-specific layout sizing is per-shape canonical, not label-aware beyond width-bump | Spike 4 §"What the renderer does *not* do" | Matches Mermaid's behavior. A long-labelled circle gets a wide bounding box that the circle inscribes. |
| No icon/image shapes | Spike 4 | Mermaid's `icon` / `img` shape extensions are not implemented. Falls back to `'rect'`. |
| `chooseEdgesToReverseForMermaidOrder` is O(V·E) BFS per inter-cluster edge | Spike 4 (Bug 1 fix) | Fine at 200 nodes. Required because we hand dagre a flat graph instead of replicating Mermaid's per-subgraph nested-layout pre-processing — see §6 for the full explanation. |

---



**Read this whole doc, then `SPIKE_NOTES.md`, then start in `spike4/src/` as the reference. Every file in §14 has a one-job contract — keep them that way.**

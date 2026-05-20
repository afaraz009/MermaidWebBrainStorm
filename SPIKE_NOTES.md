# Spike Notes — MermaidWeb Renderer (Spikes 1–4)

**Status:** All four spikes complete. Architecture validated. Moving to production app.
**Last spike:** Spike 4 (`spike4/`) — current reference implementation.
**Date:** 2026-05-20.

This file is a short, durable record of what each spike was, what it answered, and the residual decisions that carry into the production build. For per-spike detail, read the `SPIKE*_NOTES.md` inside each spike directory; for the production architecture distilled from these, read `ARCHITECTURE.md` in the repo root.

---

## Spike 1 — Custom rendering pipeline (`spike/`)

**Question:** Can we replace Mermaid's renderer while keeping its parser, so that we own the SVG output and can do interactive re-routing / disclosure transforms?

**Answer:** Yes. The pipeline `mermaid (parser only) → IR → dagre layout → d3-shape + plain SVG` produces output structurally equivalent to Mermaid's reference render and supports 60fps node drag via partial-update DOM mutation (mutate `transform` and path `d` in place, no re-render).

**Takeaways carried forward:**
- Mermaid parser is private API (`getDiagramFromText().db.getVertices/getEdges/getSubGraphs`). Wrap it in a versioned adapter so a Mermaid major-version bump only touches one file.
- Dagre compound graph (`setParent`) handles nested subgraphs. Subgraph bounding boxes are computed from children, not from dagre directly.
- Curve smoothing during drag is the single biggest source of "ugly" edges (curveBasis pulls control points into nodes). Motivated Spike 2.

---

## Spike 2 — A* edge routing on drop (`spike2/`)

**Question:** Can grid-A* re-route edges fast enough on drop to meet the PRD's interaction-frame budget (≤16ms p50 / ≤33ms p95 at 200 nodes), with output cleaner than dagre+curveBasis?

**Answer:** Yes for the 200-node target. ~100ms worst-case on hub nodes; imperceptible on common cases. Output is clean orthogonal/octile paths that always enter/exit node faces perpendicular.

**Takeaways carried forward:**
- 10px cells, 8-way connectivity, corner-cut blocked, octile heuristic, padding = cellSize.
- Face-centred docking with outward face normals.
- No post-route smoothing — collinear collapse only. curveBasis was removed because obstacle-unaware control points cut through nodes A* explicitly avoided.
- Grid debug overlay was decisive for tuning; production should retain a hidden-by-default version.

**Still open after Spike 2 (deferred for now):** orthogonal-with-port routing, ELK-as-routing-engine, hybrid straight-by-default. None block Wave 1.1.

---

## Spike 3 — Subgraph collapse / expand (`spike3/`)

**Question:** Does the "IR transform + disclosure-agnostic renderer" pattern work as the foundation for the whole progressive-disclosure family (collapse, focus, path-trace, depth-slider)?

**Answer:** Yes. Collapse/expand was implemented as a pure `deriveEffectiveIR(ir): IR` function. The renderer, drag, A* router, and grid overlay all operate on the effective IR and never learn what a "collapsed subgraph" is. The pattern composes with A*, drag, and pin without renderer-side changes beyond a single surrogate "+N" badge.

**Takeaways carried forward (load-bearing):**
- **`ir` vs `currentEff` split.** `ir` is canonical (mutated only by user actions); `currentEff = deriveEffectiveIR(ir)` is what every downstream module sees.
- **Outermost-collapsed wins** for nested subgraphs.
- **Surrogates are leaf-level nodes**, not container abstractions — dagre/drag/render treat them like any other node.
- **`syncEffToSource` after every layout** persists positions back to `ir` so hidden nodes "remember" their last position on expand.
- **Click vs mousedown/mouseup discrimination** (4px threshold) lets surrogates be both draggable AND expandable without a modifier key.
- **Painting order, not DOM nesting**, makes delegated subgraph clicks work cleanly — no `stopPropagation` calls anywhere.

**Still open:** transform composition (collapse + focus), layout cost at 500/1000 nodes, multi-edge dedup vs fan-out, animation polish.

---

## Spike 4 — Pan / zoom / context menus / shape library / side-aware drag edges (`spike4/`)

**Question:** Can interactive editing (right-click menus on canvas/node/edge/subgraph, shape changes, connect-to, pan, zoom) coexist with everything Spikes 1–3 shipped, without re-architecting? Bonus: can edges stop folding sharply during drag without needing A*?

**Answer:** Yes on both. Editing wires entirely into the existing IR-mutation + `rerenderWithCollapse` orchestrator. The "side-aware" edge strategy added in commit `76420cd` solves drag-folding for the non-A* path by picking anchor sides from relative node positions every `mousemove`.

**Takeaways carried forward:**
- **Right-click menus dispatch via a single delegated handler** that inspects `closest('[data-…]')` to pick canvas/node/edge/subgraph context. Mirrors the collapse/expand discrimination pattern.
- **Full 15-shape Mermaid library** is threaded end-to-end through parser → `NodeShape` union → `border.ts` clippers → `renderer.ts` shape elements. `border.ts` exports its polygon-vertex helpers so the renderer and clipper share geometry.
- **Three orthogonal edge strategies** (A*, side-aware, dagre) — A* gates on `astarSettings.enabled`; the other two are picked by `astarSettings.edgeMode`. A* takes precedence when enabled. See ARCHITECTURE.md §"Edge rendering" for the full decision tree.
- **Side-aware anchoring** (aspect-ratio-normalized side selection: `|dy|*hw vs |dx|*hh`) is what kills the drag-fold. Anchors live on the chosen side at face midpoints; parallel edges are distributed along the side; basis curves are seeded with perpendicular stubs so the curve direction matches the face normal.
- **Pan/zoom lives in a single CSS transform** owned by `pan.ts`. Wheel-zoom is cursor-anchored: it recomputes pan so the world point under the cursor stays under the cursor.

**Decisions reached during Spike 4 (clarified architecture):**
- Edge strategy is a *runtime toggle*, not a build-time choice — production keeps all three so users can pick the trade-off.
- A* and edge-mode are orthogonal toggles, not a single cycle. Mixing them caused user confusion until we separated them.
- Context-menu wiring belongs in its own module (`contextMenu.ts` + `contextMenuWiring.ts`) so the menu UI and the action handlers stay decoupled from `entry.ts`.

---

## Cross-spike conclusions (what we know now)

1. **The IR-transform pattern is the architecture.** Disclosure is transforms over a canonical IR; every other module operates on the effective IR. This was the answer Spike 3 was looking for and Spike 4 reconfirmed by adding editing on top without breaking it.
2. **Grid-A* is good enough for v1.** Re-evaluate at 500+ nodes; alternate routers (orthogonal-with-port, ELK, hybrid) are filed but not blocking.
3. **One redraw path, not many.** `rerenderWithCollapse` is the single orchestrator that A*, collapse, expand, reset, context-menu mutations, and connect-to all funnel through. New features should reuse it, not invent siblings.
4. **Mermaid parity is achievable but not free.** Matching Mermaid's subgraph ordering required `chooseEdgesToReverseForMermaidOrder` (cycle-aware edge reversal) because `@dagrejs/dagre` picks different cycle-breaking edges than Mermaid's `dagre-d3-es`.
5. **Painting order > DOM nesting** for SVG event delegation. Keep subgraphs as siblings with nodes/edges on top in their own layers.

---

## Anti-goals (do not re-litigate in production)

- Don't reimplement layout — dagre stays.
- Don't fix node-on-node overlap — out of scope.
- Don't add manual edge bend-handles — PRD doesn't require it.
- Don't try to handle non-flowchart diagram types — sequence/class/state/ER use Mermaid's renderer in v1 (`FR15a`).
- Don't optimize before measuring — PRD frame-time targets are the bar.

---

## What's in each spike directory

| Spike | Dir | Use as reference for |
|---|---|---|
| 1 | `spike/` | The minimal renderer pipeline (parser → IR → dagre → SVG). Frozen baseline. |
| 2 | `spike2/` | A* routing, grid overlay, separation modes. |
| 3 | `spike3/` | `effective-ir.ts`, `collapse.ts`, the `ir`/`currentEff` split. |
| 4 | `spike4/` | **Current head — production scaffold.** Pan, zoom, context menus, 15 shapes, three edge strategies, connect-to, side-aware drag. |

Read `ARCHITECTURE.md` next.

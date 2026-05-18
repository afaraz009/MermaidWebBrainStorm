# Spike 3 Notes — Subgraph collapse / expand

**Status:** Wrapped. Outcome: the "IR transform + disclosure-agnostic renderer" pattern works. Click-to-collapse and click-to-expand coexist with A\* routing and node drag without renderer-side changes beyond a single surrogate badge.

This document records *current* implementation and *current* decisions. For the A\* routing pipeline this spike builds on, see `spike2/SPIKE2_NOTES.md`. For the originating brief and build plan: `prompt-spike3.md`, `IMPLEMENTATION_SPIKE3.md`. For end-to-end product context across all three spikes: `HANDOFF.md`.

---

## 1. The effective-IR transform

The split is the load-bearing decision: `ir` is canonical (collapse flags, pinned positions, all leaf nodes always exist) and `currentEff` is what every other module sees. `currentEff = deriveEffectiveIR(ir)` runs on every collapse / expand and on initial load. Layout, render, drag, grid overlay, and A\* routing all operate on `currentEff` and don't need to know subgraphs can collapse.

Three rules drive the transform (`src/effective-ir.ts`):

- **Outermost-collapsed wins.** Walking up a node's `parent` chain, the highest collapsed subgraph is the one whose surrogate shows. Inner collapsed-but-shadowed subgraphs produce no surrogate.
- **Surrogates are leaf-level rectangles**, not subgraph containers. This lets `drag.ts` and `renderer.ts` treat them as ordinary nodes — no special "container that can move" code path. The renderer's only concession is rendering a "+N" descendant badge on ids starting with the `__sg__` prefix.
- **Edge remap + dedup.** Each endpoint id is remapped to its outermost collapsed ancestor's surrogate (or kept if not shadowed). Edges where both endpoints remap to the same id are dropped (interior edges). After remap, duplicate `(from, to)` pairs are deduped — multiple sibling-to-collapsed-subgraph edges collapse into a single edge.

After layout runs on `currentEff`, `syncEffToSource()` writes the resulting positions back onto matching ids in `ir`. This is what makes positions of *visible* nodes survive the next collapse cycle, and what lets hidden nodes keep their last-known position so they reappear in place on expand.

---

## 2. Interaction model

Two delegated handlers on the SVG (`src/collapse.ts`):

- **Collapse:** any `click` whose target's `closest('[data-subgraph-id]')` is non-null sets that subgraph's `collapsed = true` and re-renders. Subgraphs paint as siblings (not nested) with nodes and edges painted on top in their own layers — so clicks on nodes/edges don't bubble through a subgraph ancestor, and clicks in an inner subgraph's painted area hit the inner rect first (correctly collapsing just the inner one).
- **Expand:** `mousedown` on `[data-surrogate-for]` records `(clientX, clientY)`. The global `mouseup` measures Euclidean distance from mousedown; if < 4px (`CLICK_THRESHOLD_PX`) it expands, otherwise it leaves the surrogate alone and `drag.ts`'s mousemove/mouseup chain handles the drag.

This split — collapse uses `click`, expand uses mousedown/mouseup discrimination — is what lets surrogates be both draggable nodes *and* expandable badges without a modifier key.

---

## 3. Interaction with A\* re-routing

`rerenderWithCollapse` is the load-bearing orchestrator:

1. Clear all `routedPath` on source-IR edges (stale relative to the new layout).
2. `currentEff = deriveEffectiveIR(ir)`.
3. `layout(currentEff)` — fresh dagre run on the effective IR.
4. `syncEffToSource()` — persist new positions back onto source IR.
5. If `astarSettings.enabled`: `routeEdgesBatch` over every effective edge, then mirror each resulting `routedPath` back onto the matching source edge.
6. `renderFull` + `reattach` drag handler.
7. If the grid overlay was visible, re-render it against the new effective IR.

Without step 5, toggling the A\* feature on *before* collapsing and then collapsing would silently revert every edge to dagre's curved output because routing wouldn't get re-run. The toggle-on click handler shares the same `routeAllEffWithCurrentSeparation` helper for symmetry.

---

## 4. Failure modes / edge cases (current)

| Mode | When it triggers | Behavior | Mitigation |
|---|---|---|---|
| Interior edge dropped | Both endpoints inside the same collapsed subgraph | Edge disappears from the effective IR until expand | Intended — interior edges are not meaningful when the subgraph is a single surrogate. Source IR keeps the edge; expand restores it. |
| Duplicate edges after remap | Multiple sibling-to-inside-collapsed-subgraph edges | All except one are dropped | Intended for v1. Multi-edge port spreading is deferred (see `HANDOFF.md` §"open questions"). |
| Dragging a surrogate | User mousedowns on a surrogate and moves > 4px before release | Treated as a node drag; `drag.ts` runs, surrogate moves, A\* re-routes its connected edges (which are the remapped boundary edges). Click-to-expand is suppressed. | Threshold (`CLICK_THRESHOLD_PX = 4`) is generous enough to be unambiguous; small enough to not feel sticky. |
| A\* routedPath across collapse cycles | Source IR carried `routedPath` from before collapse | Cleared at the start of `rerenderWithCollapse` (stale relative to new layout) | Without the clear, edges would render with paths grounded in the old layout origin. |
| Nested collapse (inner then outer) | User collapses inner, then outer | Outermost-wins: only the outer surrogate appears | Expand outer first → inner surrogate reappears (since inner's `collapsed` flag was preserved). Two-step expansion matches user intuition. |
| Reset Layout after collapse | User clicks Reset Layout while subgraphs are collapsed | Pinned positions cleared, `routedPath` cleared, but `collapsed` flags preserved | Intentional — reset is about layout, not disclosure state. |

---

## 5. What surprised us

- **Painting order, not DOM nesting, is what makes delegated subgraph clicks work cleanly.** The initial mental model was "nest subgraphs in the DOM so events bubble naturally." The shipped model — subgraphs as siblings, nodes/edges in their own layers on top — means a click hits the painted thing at the cursor, which is the right semantic for the user (clicking a node clicks the node, not its enclosing subgraph). No `stopPropagation` calls needed.
- **Surrogates being leaf nodes** (not subgraph containers) was the single biggest simplification. We expected to need a "container that can move and route edges" abstraction; we didn't. Dagre lays out a surrogate node the same as any other node.
- **`syncEffToSource` on every layout** is what makes hidden nodes "remember" their last-known position when the user expands. Without it, expanding a subgraph would re-run dagre against stale inside-positions and the inside nodes would visibly jump.

---

## 6. Production readiness

**Verdict: the IR-transform pattern is viable for the disclosure family.** Collapse / expand works, composes with A\* and drag, and the renderer stayed agnostic. The same pattern should extend to **focus** (transform: keep only the focused node + neighbors) and **path-trace** (transform: keep only nodes/edges on the highlighted path) without renderer changes. **Depth-slider** is the open question — depth-N filtering is structurally another transform, but only Wave 1.1 implementation will confirm it doesn't need cross-cutting renderer support.

**Ceilings we hit:**
- **Multi-edge dedup hides information.** Two distinct semantic edges from outside the subgraph to two different inside nodes collapse to one visible edge after remap. For v1 this reads cleanly; for production we likely want a count badge or fan-out.
- **Whole-graph dagre re-layout on every collapse / expand** is the dominant cost. Imperceptible on the 200-node fixture but worth instrumenting before committing to the pattern at 500+ nodes.
- **No animation.** Collapse and expand are instant. Users in informal testing said the diagram "snaps" — readable but jarring. Animated transition (interpolate node positions, fade edges) is a Wave 1.1 polish task.

**Recommended next steps (for the next spike — see `HANDOFF.md`):**
1. Implement **focus mode** as another `deriveEffectiveIR`-style transform. Confirms the pattern composes.
2. Instrument **dagre re-layout cost** at 500 / 1000 nodes; if it exceeds the PRD's 33ms p95 interaction-frame target, design a partial-layout strategy.
3. Decide on **multi-edge handling at the boundary** (dedup vs. fan-out vs. count badge).

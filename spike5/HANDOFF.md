# Handoff — MermaidWeb Renderer Spikes (Spike 1 + Spike 2 + Spike 3 + Spike 4)

> **Spike 4 update (planning + iterative):** Spike 4 was created by copying `spike3/` and adds canvas pan, mouse-wheel zoom (already present from Spike 3 wired in `entry.ts`), right-click context menus for canvas, node, edge, and subgraph targets, and the **full Mermaid flowchart node-shape library** (15 shapes — see `SPIKE4_NOTES.md` §"Shape library" for the table). None of the Spike 1–3 features change. The new feature plan lives in `spike4_feature_Implementation.md` at the repo root. The Spike 4 build also retains the open questions listed in §3 below — they remain the strategic priorities for Spike 5 onward, but feature-edit ergonomics (Spike 4) moved up the queue because the editor pipeline needs them before user testing of disclosure modes is meaningful.

---


**For:** the next agents running spikes on the remaining disclosure-family features (focus mode, path-trace, depth-slider) or on the open routing questions.
**From:** Spike 1 (custom renderer pipeline), Spike 2 (A\* edge routing on drop), Spike 3 (subgraph collapse / expand).
**Date:** 2026-05-18.

Read this in full before starting your spike. It is structured to be the only context you need on top of the PRD (`../prd.md`) to make good decisions about what to try next.

---

## 1. The product context (one paragraph)

MermaidWeb (`../prd.md`) is a comprehension-first workspace for Mermaid diagrams. The load-bearing UX is the **progressive disclosure family**: collapse, focus, path-trace, depth-slider. These are interactive — clicking a node must re-route its edges *now*, not on the next layout pass, and toggling visibility must work without breaking the renderer's contract. That's why we own the renderer (Mermaid's renderer can't do incremental re-routing or disclosure) and why edge routing on interaction *plus* disclosure-as-IR-transform are both in the critical path for Wave 1.1.

**Performance target (PRD):** ≤ 16ms p50 / ≤ 33ms p95 interaction frames on a 200-node flowchart on a typical engineer laptop. 500-node degrades gracefully. 1000-node renders without crashing.

---

## 2. The three completed spikes (what they validated)

### Spike 1 — `spike/` — custom rendering pipeline

**Outcome:** validated. The pipeline `mermaid (parser only) → IR → dagre layout → d3-shape → plain SVG` works. Static rendering matches Mermaid's reference render structurally. Drag-to-reposition is 60fps via partial-update SVG mutation (mutating `transform` and `d` attributes in place — no re-render).

**Read:** `spike/SPIKE_NOTES.md`. The whole file is ~5 minutes. Notable findings:
- Mermaid's parser is undocumented private API (`getDiagramFromText().db.getVertices/getEdges/getSubGraphs`). Stable across v10/v11 but a major version bump is a risk. Versioned adapter wraps it.
- Dagre's compound graph (`setParent`) handles two-level subgraph nesting. Subgraph bounding boxes are computed manually.
- The during-drag "ugly curve" (curveBasis with swapped endpoint pulling toward old waypoints) is *the* failure mode that motivated Spike 2.

### Spike 2 — `spike2/` — A\* edge routing on drop

**Outcome:** viable for the 200-node target. Edges find clean paths around obstacles; arrows always enter/exit node faces perpendicular; latency is imperceptible on the small fixture and ~100ms on hub nodes in the 200-node fixture.

**Read:** `spike2/SPIKE2_NOTES.md`. Key shipped choices: 10px cells, 8-way connectivity with corner-cutting blocked, octile heuristic, padding locked to cell size, face-centered docking with outward face normals, *no smoothing* (collinear collapse only; curveBasis removed because obstacle-unaware control points cut into nodes A\* explicitly avoided).

**Open from Spike 2:** alternative routing engines (orthogonal with port assignment, ELKjs as routing-only, hybrid straight-by-default) — see §4. None blocking for Wave 1.1.

### Spike 3 — `spike3/` (this spike) — subgraph collapse / expand

**Outcome:** the "IR transform + disclosure-agnostic renderer" pattern validated. Click-to-collapse and click-to-expand coexist with A\* routing and node drag without renderer-side changes beyond a single surrogate badge.

**Read first:** `SPIKE3_NOTES.md` (current state and decisions, ~10 min) and then `IMPLEMENTATION_SPIKE3.md` (the build plan, gives you the build-order rationale). `prompt-spike3.md` is the originating brief, useful but skippable.

**Code map (`spike3/src/`):**
| File | What it does | Lift wholesale into next spike? |
|---|---|---|
| `types.ts` | IR shape. `IRSubgraph.collapsed` is the new disclosure-state field. | Yes |
| `parser-adapter.ts` | Mermaid → IR. From Spike 1, unmodified. | Yes |
| `layout.ts` | dagre layout adapter. From Spike 1, unmodified. | Yes |
| `border.ts` | `clipToBorder` — from Spike 1, unmodified. | Yes |
| `astar.ts` | Pure A\*. From Spike 2, unmodified. | Yes |
| `astarSettings.ts` | Live-mutable A\* settings singleton. From Spike 2. | Yes |
| `routing.ts` | A\* glue: `buildGrid`, dock cells, `routeEdge`, `routeEdgesBatch`. From Spike 2. | Yes |
| `gridOverlay.ts` | Debug SVG overlay. From Spike 2. | Yes |
| `renderer.ts` | SVG render + surrogate "+N" badge. Otherwise from Spike 2. | Yes |
| `drag.ts` | mousedown/move/up. From Spike 2, unmodified. Surrogates carry `data-node-id` so drag works on them out of the box. | Yes |
| `effective-ir.ts` | **NEW.** `deriveEffectiveIR(ir)` — the IR-to-effective-IR transform plus surrogate id helpers (`SURROGATE_PREFIX`, `surrogateIdFor`, `isSurrogateId`, `sgIdFromSurrogate`) and `countHiddenDescendants`. | Yes — your spike likely *extends* this with another transform (focus, path-trace, depth-slider). |
| `collapse.ts` | **NEW.** Delegated click for collapse; mousedown/mouseup click-vs-drag discrimination for expand. | Yes — as a model for the next disclosure interaction. |
| `entry.ts` | Bootstrap. Owns the `ir` / `currentEff` split, `rerenderWithCollapse`, "Collapse All" / "Expand All" buttons, `syncEffToSource`. | Yes — your spike adds the next button/state alongside collapse. |

**Key implementation choices (in `SPIKE3_NOTES.md` §1–§3):**
- **Outermost-collapsed wins** when subgraphs are nested.
- **Surrogates are leaf-level rectangles**, not subgraph containers — dagre treats them like any other node, `drag.ts` drags them like any other node, the renderer only needs a `__sg__` prefix check for the "+N" badge.
- **Edge remap + dedup:** edges with both endpoints inside the same collapsed subgraph are dropped; remaining edges have endpoints remapped to surrogates; duplicate `(from, to)` pairs are deduped.
- **`syncEffToSource` on every layout** persists positions of visible nodes back to the source IR so hidden nodes "remember" their last-known position for the next expand.
- **Click-to-collapse uses `click`; click-to-expand uses mousedown/mouseup with 4px threshold** — surrogates can be both draggable nodes and expandable badges without a modifier key.
- **Collapse state survives Reset Layout.** Reset is about layout, not disclosure.

**Two fixtures included:** `fixture.mmd` (~10 nodes), `fixture200.mmd` (200 nodes). Use both when comparing.

**Running it:** `cd spike3 && npm install && npm run dev`. Visit the printed URL. Two iframes side-by-side: Mermaid reference (left) and our renderer (right).

---

## 3. What we're handing you (the open questions)

> **Does the IR-transform pattern from Spike 3 extend cleanly to the rest of the disclosure family (focus, path-trace, depth-slider)?**
>
> **And: is grid-A\* the right *production* routing engine, or is there a better trade-off in the alternatives we haven't yet tried?**

Spike 3 said *yes* for collapse / expand. It did *not* yet validate:
- **Composition** — can two transforms (e.g. collapse + focus) compose, or do they interact in surprising ways?
- **Cost** — whole-graph dagre re-layout on every disclosure change is fine at 200 nodes. Is it fine at 500 / 1000?
- **Multi-edge handling** — the dedup-on-remap behavior hides information. We need a decision on dedup vs. count-badge vs. fan-out for production.
- **Animation** — collapse/expand snaps. Users said "readable but jarring." Animated transition is a Wave 1.1 polish target.

And Spike 2's routing questions are still open (see §4 below).

---

## 4. What to spike next (recommended, in priority order)

### Spike 4 — Focus mode as a second IR transform

**Hypothesis:** focus is just another `deriveEffectiveIR`-style transform: given a focused node id and a neighborhood radius, return an effective IR containing only the focused node and its N-hop neighbors. If this works, the disclosure family is structurally one pattern (transforms over canonical IR), not four bespoke features.

**Validation bar:**
- Focus turns on / off without renderer changes.
- Composes with collapse (a focused node *inside* a collapsed subgraph either: pulls its subgraph open, or focuses on the surrogate — pick one and document).
- Composes with A\* routing (toggle A\* on after entering focus mode → edges re-route against the focused effective IR).
- Performance: no measurable regression over Spike 3 on the 200-node fixture.

### Spike 5 — Path-trace as a third IR transform

**Hypothesis:** path-trace = highlight a path between two clicked nodes. Variant A: highlight via styling (no IR change). Variant B: another transform that returns just the path's nodes + edges. Validate which feels right and which composes with collapse / focus.

**Validation bar:** same shape as Spike 4.

### Spike 6 — Depth-slider

**Hypothesis:** depth-N filtering ("show only nodes within N hops of any 'root' node") is another transform. *Unlike* collapse and focus, the depth slider is a *global* filter, not a localized one — open question whether incremental update or full re-derivation feels better as the user drags the slider.

**Validation bar:** smooth slider drag (≤ 33ms per frame) at 200 nodes minimum.

### Spike 7 — Layout cost at scale

**Hypothesis:** dagre re-layout on every collapse/expand/focus/path/depth change is the dominant cost. At 500+ nodes, frame budget is at risk. Investigate: partial layout (only re-position the changed subgraph's contents), or layout caching keyed by `(visible-node-set, visible-edge-set)`.

**Validation bar:** ≤ 33ms p95 frame time on a 500-node fixture with rapid collapse / expand toggling.

### Spike 8a — Orthogonal routing with port assignment (Spike 2's open question)

**Hypothesis:** for layered graphs of the shape Mermaid produces, segment-based orthogonal routing (à la libavoid / mxGraph's orthogonal router) is faster, produces cleaner output, and handles multi-edge-between-same-pair correctly with port spreading.

**Validation bar:** match or beat Spike 2 on the small + 200-node fixtures across (latency, visual cleanliness on 5–10 representative drags, lines-of-code, bundle-size delta). Plus: confirm it integrates with Spike 3's IR transform (routing should not care that the IR was derived from a transform).

### Spike 8b — ELKjs as a routing-only engine (Spike 2's open question)

**Hypothesis:** ELK (Eclipse Layout Kernel, JS port) is industrial-strength for layered graphs and handles routing as part of layout. We could keep dagre for the *initial* layout and call ELK only for *post-drag re-routing* of affected edges.

**Risks:** ELK's API is layout-centric, not "re-route this one edge" — verify it can be invoked for partial re-routing without recomputing the whole layout. Bundle size is multi-hundred-KB.

### Spike 8c — Hybrid: straight-by-default, route-only-on-collision (Spike 2's open question)

**Hypothesis:** most edges don't intersect any obstacle most of the time. Run a cheap segment-vs-rect intersection test on each connected edge after drop; only invoke A\* for edges that would actually cross a node.

**Validation bar:** measure what fraction of edges-on-drop actually need routing. If it's <30%, the hybrid wins by a lot.

---

## 5. Spike methodology (what worked for us — copy the pattern)

1. **Self-contained spike directory at repo root.** Don't symlink, don't import across spikes. Copy. Keeps each spike a frozen checkpoint you can return to.
2. **Two iframes side-by-side: Mermaid reference + your renderer.** Same fixture picker. Lets you sanity-check that you're rendering the same diagram.
3. **Both fixtures, every time.** Small for fast iteration; 200-node for the actual target.
4. **Live-tunable parameters in a UI panel.** We added cell size, connectivity, corner-cut, heuristic, separation mode as live controls in Spike 2. Do the same for whatever your algorithm or feature has knobs for.
5. **Debug overlay.** `gridOverlay.ts` was decisive for understanding A\*. Build the equivalent for your feature (highlight the focused subset, visualize the path being traced — whatever you have).
6. **Honest notes file, <600 words, structured.** Sections: parameter choices, quality, latency, failure modes, surprises, production readiness. See §1–§6 of `SPIKE3_NOTES.md` for the shape.
7. **Timebox 2–4 hours for the implementation, then write the notes the same session.**

---

## 6. Anti-goals (do not waste your spike timebox on these)

- **Don't reimplement layout.** Dagre is settled. Layout is `IR → laid-out IR`; your spike starts after layout.
- **Don't fix node-on-node overlap.** Out of scope for routing or disclosure; out of scope for these spikes entirely.
- **Don't worry about subgraph borders as edge obstacles.** Cross-subgraph edges are normal Mermaid output.
- **Don't add a manual edge-editing UI** (bend handles, double-click to add bend, port reassignment). The PRD doesn't require it and it'll eat your whole timebox.
- **Don't try to handle non-flowchart diagram types.** Sequence/class/state/ER use Mermaid's renderer in v1 (`FR15a`).
- **Don't optimize before measuring.** The PRD's frame-time target is the bar. If you hit it, stop optimizing.

---

## 7. Files to read, in order

1. `../prd.md` — sections "Web Application Specific Requirements," "Architecture Decisions," "Performance Targets," and the FR6–FR11 disclosure family. ~15 min.
2. `_bmad-output/planning-artifacts/architecture-decisions-renderer.md` — if it exists in your view; load-bearing rationale for SVG + parser-only + dagre + d3-shape.
3. `spike/SPIKE_NOTES.md` — Spike 1 findings. ~5 min.
4. `spike2/SPIKE2_NOTES.md` — Spike 2 current state. ~10 min.
5. `spike3/SPIKE3_NOTES.md` — Spike 3 current state. ~10 min.
6. `spike3/src/effective-ir.ts` and `spike3/src/entry.ts` — the actual transform pattern + orchestration. ~20 min.
7. *Then* this handoff document's §4 to pick your spike target.

---

## 8. Hand-off checklist (verify before starting)

- [ ] `cd spike3 && npm install && npm run dev` starts the dev server cleanly.
- [ ] You can click a subgraph and see it collapse to a surrogate with a "+N" badge.
- [ ] You can click that surrogate (no drag) and see it expand — inner nodes in their previous positions.
- [ ] You can drag a surrogate and it moves as a node; click-without-drag still expands afterward.
- [ ] Toggling the A\* feature on / off works in both collapsed and expanded states.
- [ ] "Reset Layout" clears pinned positions but preserves collapse state.
- [ ] You've read `SPIKE3_NOTES.md` end-to-end (it's short).
- [ ] You've picked one of §4's spike targets and can articulate the hypothesis in one sentence.
- [ ] You have a fresh `spike4/` (or appropriate) directory copied from `spike3/` as your scaffold.
- [ ] You're working on a timebox, not open-ended.

Good luck. The architectural decision the PRD is waiting on now is "does the IR-transform pattern carry the rest of the disclosure family, or do we need a different architecture before Wave 1.1?" Your spike answers that.

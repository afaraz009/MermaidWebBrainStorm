# Handoff — MermaidWeb Renderer Spikes (Spike 1 + Spike 2)

**For:** the next agents running spikes on alternative edge-routing libraries / algorithms.
**From:** Spike 1 (custom renderer pipeline) and Spike 2 (A* edge routing on drop).
**Date:** 2026-05-17.

Read this in full before starting your spike. It is structured to be the only context you need on top of the PRD (`../prd.md`) to make good decisions about what to try next.

---

## 1. The product context (one paragraph)

MermaidWeb (`../prd.md`) is a comprehension-first workspace for Mermaid diagrams. The load-bearing UX is the **progressive disclosure family**: collapse, focus, path-trace, depth-slider. These are interactive — clicking a node must re-route its edges *now*, not on the next layout pass. That's why we own the renderer (Mermaid's renderer can't do incremental re-routing) and why edge routing on interaction is in the critical path for Wave 1.1.

**Performance target (PRD):** ≤ 16ms p50 / ≤ 33ms p95 interaction frames on a 200-node flowchart on a typical engineer laptop. 500-node degrades gracefully. 1000-node renders without crashing.

---

## 2. The two completed spikes (what they validated)

### Spike 1 — `spike/` — custom rendering pipeline

**Outcome:** validated. The pipeline `mermaid (parser only) → IR → dagre layout → d3-shape → plain SVG` works. Static rendering matches Mermaid's reference render structurally. Drag-to-reposition is 60fps via partial-update SVG mutation (mutating `transform` and `d` attributes in place — no re-render).

**Read:** `spike/SPIKE_NOTES.md`. The whole file is ~5 minutes. Notable findings:
- Mermaid's parser is undocumented private API (`getDiagramFromText().db.getVertices/getEdges/getSubGraphs`). Stable across v10/v11 but a major version bump is a risk. Versioned adapter wraps it.
- Dagre's compound graph (`setParent`) handles two-level subgraph nesting. Subgraph bounding boxes are computed manually.
- The during-drag "ugly curve" (curveBasis with swapped endpoint pulling toward old waypoints) is *the* failure mode that motivated Spike 2.

**Open from Spike 1, not addressed:** shape rendering beyond rectangles, exact subgraph bbox geometry, parser adapter hardening against Mermaid version churn. These are not your problem unless your spike happens to need them.

### Spike 2 — `spike2/` — A* edge routing on drop

**Outcome:** viable for the 200-node target with the implementation choices documented in `SPIKE2_NOTES.md`. Edges find clean paths around obstacles; arrows always enter/exit node faces perpendicular; latency is imperceptible on the small fixture and ~100ms on hub nodes in the 200-node fixture.

**Read first:** `SPIKE2_NOTES.md` (current state and decisions, ~10 min) and then `IMPLEMENTATION_SPIKE2.md` (the original build plan, gives you the build-order rationale). `prompt-spike2.md` is the originating brief, useful but skippable.

**Code map (`spike2/src/`):**
| File | What it does | Lift wholesale? |
|---|---|---|
| `types.ts` | IR shape. `IREdge.routedPath` is the field that survives post-drop. | Yes |
| `parser-adapter.ts` | Mermaid → IR. Copied from Spike 1, unmodified. | Yes |
| `layout.ts` | dagre layout adapter. Sets `originalPoints` from dagre's edge waypoints. | Yes |
| `border.ts` | `clipToBorder` — line-from-outside intersects rect. Used in the renderer's curveBasis path-shortening for non-A*-routed edges. | Yes |
| `astar.ts` | Pure A*. Binary min-heap, Uint8Array closed set, configurable connectivity / heuristic / corner-cut. No DOM, no IR dependency. ~250 LOC. | Yes (reusable building block) |
| `astarSettings.ts` | Live-mutable settings singleton + last-trace snapshot for the overlay. | Reusable; tiny |
| `routing.ts` | Glue: `buildGrid`, face-centered dock cells + outward normals, `routeEdge`. **The interesting part.** | Read in full — your alternative algorithm replaces `routeEdge` |
| `gridOverlay.ts` | Debug SVG overlay rendering the obstacle grid + last A* expansion. Toggleable. | Worth keeping for your spike too — invaluable for debugging routing alternatives |
| `renderer.ts` | SVG render + drag overlay (dotted straight lines) + `applyRoutedPath` to mutate one edge's `<path>` and arrow tip. Per-mode rendering (`'curve'` for dagre output, `'straight'` for routed output). | Yes; you may add a third mode |
| `drag.ts` | mousedown/move/up. On mouseup: snap node to grid, then for each connected edge call `routeEdge` and write `edge.routedPath`. | Yes; replace the `routeEdge` call with yours |
| `entry.ts` | Bootstrap, fixture picker, A* control panel wiring, wheel zoom. | Yes |

**Key implementation choices (in `SPIKE2_NOTES.md` §1–§4):**
- 10px cells, 8-way connectivity with corner-cutting blocked, octile heuristic.
- Padding locked to cellSize so the obstacle ring is exactly one cell wide.
- Grid origin and node positions snap to multiples of cellSize on drop (no sub-cell drift between drops).
- **Face-centered docking with outward face normal.** First and last rendered segments are perpendicular to the node face by construction — arrows enter/exit head-on, no off-axis tips.
- **No smoothing.** Collinear-collapse only, straight segments. curveBasis was removed because it's obstacle-unaware and the post-collapse polyline already reads cleanly. §4 of `SPIKE2_NOTES.md` explains.
- A* mutates only the edges connected to the dropped node; everything else stays put. `routedPath` survives subsequent drags of other nodes.

**Two fixtures included:**
- `fixture.mmd` — small flowchart, ~10 nodes, fast to iterate on.
- `fixture200.mmd` — 200 nodes, several nested subgraphs. The Wave 1.1 performance target. **Use both** when comparing your algorithm.

**Running it:** `cd spike2 && npm install && npm run dev`. Visit the printed URL. Two iframes side-by-side: Mermaid reference (left) and our renderer (right). Drag any node on the right pane.

---

## 3. What we're handing you (the open question)

> **Is grid-A* the right *production* routing engine for MermaidWeb, or is there a better trade-off in the alternatives we haven't yet tried?**

Grid-A* works. But it has structural properties worth questioning:
- **Cost scales with canvas area, not graph size.** A 2400×1800 canvas at 10px cells = 432k cells. Fine for indie scale, but if Wave 1.2/1.3 pulls in larger diagrams this matters.
- **Output is corners, not segments.** We emit a corner polyline and render as straight segments. A *segment-based* router (orthogonal routing with ports) emits segments directly and may be cheaper and cleaner.
- **Per-edge grid rebuild.** Could be amortized, but the algorithm choice may eliminate the question.
- **No port/anchor assignment.** Multiple edges between the same two nodes will overlap at the face center because there's no "spread the ports along the face" logic.

---

## 4. What to spike next (recommended, in priority order)

### Spike 3a — Orthogonal routing with port assignment

**Hypothesis:** for layered graphs of the shape Mermaid produces, segment-based orthogonal routing (à la libavoid / mxGraph's orthogonal router) is faster, produces cleaner output, and handles multi-edge-between-same-pair correctly with port spreading.

**Libraries to evaluate:**
- **libavoid-js** (or its successor `Avoidlibavoid`) — the C++ libavoid compiled to JS. Used by Inkscape, Dia, draw.io for orthogonal connector routing. Mature, but bundle size + WASM startup are real costs to measure.
- **mxGraph / maxGraph orthogonal router** — extractable; production-tested in draw.io. JS-native, no WASM.
- **Roll your own** — orthogonal A* on a *segment* graph rather than a cell grid. Much smaller state space (~node count × 4 ports, not canvas pixels × pixels). The face-normal docking we built is structurally already the right primitive.

**Validation bar:** match or beat Spike 2 on the small + 200-node fixtures across (latency, visual cleanliness on 5–10 representative drags, lines-of-code, bundle-size delta).

### Spike 3b — ELKjs as a routing-only engine

**Hypothesis:** ELK (Eclipse Layout Kernel, JS port) is industrial-strength for layered graphs and handles routing as part of layout. We could keep dagre for the *initial* layout and call ELK only for *post-drag re-routing* of affected edges.

**Risks:** ELK's API is layout-centric, not "re-route this one edge" — verify it can be invoked for partial re-routing without recomputing the whole layout. Bundle size is multi-hundred-KB. Performance on incremental routing is the open question.

**Validation bar:** same as 3a, plus a hard look at "can we invoke ELK incrementally" — if it requires whole-graph re-layout per drop, it's disqualified by the PRD's interaction-frame target.

### Spike 3c — Hybrid: straight-by-default, route-only-on-collision

**Hypothesis:** most edges don't intersect any obstacle most of the time. Run a cheap segment-vs-rect intersection test on each connected edge after drop; only invoke A* (or whatever routing engine you picked) for edges that would actually cross a node.

**Why this is interesting:** even with current A*, the latency at hub nodes (4+ edges) comes from running A* for every connected edge whether or not it needs it. Skipping the no-collision cases could push hub-node drop latency from ~100ms to ~10ms.

**Validation bar:** measure what fraction of edges-on-drop actually need routing. If it's <30%, the hybrid wins by a lot. If it's >70%, no point — go with 3a or 3b.

### Spike 3d (lower priority) — semantic-aware routing

**Hypothesis:** routing should know about edge labels (route around them), subgraph borders (prefer to cross at gaps), and edge bundles (route parallel edges together). These are the things that visually distinguish "machine-routed" from "designer-routed" diagrams.

**Punt on this** until 3a/3b are done. It's a quality enhancement, not an architectural decision.

---

## 5. Spike methodology (what worked for us — copy the pattern)

1. **Self-contained spike directory at repo root.** Don't symlink, don't import across spikes. Copy. Keeps each spike a frozen checkpoint you can return to.
2. **Two iframes side-by-side: Mermaid reference + your renderer.** Same fixture picker. Lets you sanity-check that you're rendering the same diagram, not just that your routing looks plausible.
3. **Both fixtures, every time.** The small fixture is for fast iteration; the 200-node fixture is the actual target. A spike that only validates on the small fixture is not validated.
4. **Live-tunable parameters in a UI panel.** We added cell size, connectivity, corner-cut, heuristic as live controls. The next agent (you) gets to *play* with the algorithm, not just read about it. Do the same for whatever your algorithm has knobs for.
5. **Debug overlay.** `gridOverlay.ts` was decisive for understanding why A* picked certain paths. Build the equivalent for your algorithm (port positions, segment routes, intersection-test markers — whatever you have).
6. **Honest notes file, <600 words, structured.** Sections: parameter choices, quality, latency, failure modes, surprises, production readiness with explicit next step if the answer is "no." See §6 of `SPIKE2_NOTES.md` for the shape.
7. **Timebox 2–4 hours for the implementation, then write the notes the same session.** Writing notes a week later loses the small-but-important findings.

---

## 6. Anti-goals (do not waste your spike timebox on these)

- **Don't reimplement layout.** Dagre is settled. Layout is `IR → laid-out IR`; your spike starts after layout.
- **Don't fix node-on-node overlap.** Out of scope for routing; out of scope for these spikes entirely.
- **Don't worry about subgraph borders as obstacles.** Cross-subgraph edges are normal Mermaid output.
- **Don't add a manual edge-editing UI** (bend handles, double-click to add bend, port reassignment). The PRD doesn't require it and it'll eat your whole timebox.
- **Don't try to handle non-flowchart diagram types.** Sequence/class/state/ER use Mermaid's renderer in v1 (`FR15a`); the routing question is flowchart-only.
- **Don't optimize before measuring.** The PRD's frame-time target is the bar. If you hit it, stop optimizing.

---

## 7. Files to read, in order

1. `../prd.md` — sections "Web Application Specific Requirements," "Architecture Decisions," "Performance Targets," and the FR6–FR11 disclosure family. ~15 min.
2. `_bmad-output/planning-artifacts/architecture-decisions-renderer.md` — if it exists in your view; load-bearing rationale for SVG + parser-only + dagre + d3-shape. The PRD section "Architecture Decisions" references it.
3. `spike/SPIKE_NOTES.md` — Spike 1 findings. ~5 min.
4. `spike2/SPIKE2_NOTES.md` — Spike 2 current state. ~10 min.
5. `spike2/src/routing.ts` and `spike2/src/astar.ts` — the actual algorithm. ~20 min.
6. *Then* this handoff document's §4 to pick your spike target.

---

## 8. Hand-off checklist (verify before starting)

- [ ] `cd spike2 && npm install && npm run dev` starts the dev server cleanly.
- [ ] You can drag nodes on the right pane and see edges re-route on drop.
- [ ] You can toggle the A* grid overlay and see obstacle cells + last A* expansion.
- [ ] You've read `SPIKE2_NOTES.md` end-to-end (it's short).
- [ ] You've picked one of §4's spike targets and can articulate the hypothesis in one sentence.
- [ ] You have a fresh `spike3/` (or `spike3a/`, etc.) directory copied from `spike2/` as your scaffold.
- [ ] You're working on a timebox, not open-ended.

Good luck. The architectural decision the PRD is waiting on is "is grid-A* the production routing engine, or is there a better trade-off?" Your spike answers that.

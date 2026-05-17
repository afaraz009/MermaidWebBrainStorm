# Spike 2 Implementation Plan — A* Edge Routing on Drop

Source: `prompt-spike2.md`. Reference baseline: `spike/` (Spike 1) and `spike/SPIKE_NOTES.md`.

This plan is sequenced so each phase produces a runnable artifact. Stop and validate after each phase before moving on. Total timebox: **2–3 hours**.

---

## Phase 0 — Scaffold (15 min)

Create `spike2/` at repo root, parallel to `spike/`.

1. Copy `spike/package.json`, `spike/tsconfig.json`, `spike/vite.config.ts` into `spike2/`. Bump `name` field in `package.json` to `spike2`.
2. Copy fixtures: `spike/fixture.mmd` → `spike2/fixture.mmd`, `spike/fixture-200.mmd` → `spike2/fixture-200.mmd`.
3. Copy `spike/mermaid-reference.html` → `spike2/mermaid-reference.html` (no changes needed beyond verifying the fixture path).
4. Copy the lifted source files into `spike2/src/` **as-is**:
   - `types.ts`
   - `parser.ts`
   - `layout.ts`
   - `renderer.ts` (will be modified in Phase 2)
   - `drag.ts` (will be modified in Phase 3)
5. Skip `static-entry.ts` and `interactive-entry.ts`; we'll write a single `entry.ts` in Phase 4.
6. Run `npm install` inside `spike2/` to confirm the package set resolves.

**Validation:** `cd spike2 && npm install` completes without errors.

---

## Phase 1 — IR extension (10 min)

The dropped node's connected edges must persist their A*-computed waypoints so that subsequent drags of *other* nodes do not re-trigger routing for that edge.

Edit `spike2/src/types.ts`:

- Add an optional `routedPath?: { x: number; y: number }[]` field to `IREdge`.
  - `routedPath` is the smoothed, A*-derived polyline that replaces dagre's `points` once routing has run.
  - Renderer prefers `routedPath` over `points` when present.
- Add an optional `routedAt?: { fromX: number; fromY: number; toX: number; toY: number }` field on `IREdge`.
  - Stores the endpoint coordinates that `routedPath` was computed against. When either endpoint moves, we re-route; otherwise we keep `routedPath`.

No other type changes. Keep `Point` inline (`{ x: number; y: number }`) to avoid touching unrelated modules.

**Validation:** `npx tsc --noEmit` in `spike2/` is clean.

---

## Phase 2 — During-drag visual: straight dotted lines (20 min)

Edit `spike2/src/renderer.ts`:

1. Replace the body of `liveDragPath` (or introduce a sibling `liveDragDottedPath`) so the during-drag path is:
   - **node-center to node-center** (no rectangle anchoring),
   - rendered as `lineGen([fromCenter, toCenter])`,
   - styled as dotted (`stroke-dasharray="4,4"`) with a softer stroke color, e.g. `#999`.
2. Inside `updateNodePosition`, when redrawing each connected edge's `<path>`:
   - Save the original `stroke`, `stroke-dasharray`, `marker-end` on the path element if not already saved (use a `data-orig-*` attribute or a small in-state cache keyed by edge id).
   - Apply the dotted-in-transit styling.
   - Leave the label hidden (`display: none`) during drag — labels make no sense over an "in-transit" stub.
3. The midpoint label update is no longer load-bearing during drag; skip it for simplicity.

We are deliberately not optimizing during-drag visual quality. The load-bearing question is drop-time routing.

**Validation:** drag a node in the interactive page — connected edges go straight dotted center-to-center. Other edges remain untouched.

---

## Phase 3 — A* routing module (60–75 min, the load-bearing piece)

Create `spike2/src/astar.ts`. Self-contained, ~150 LOC, no external deps.

### Public API

```ts
export interface Obstacle {
  x: number; y: number; width: number; height: number; // center-anchored
}

export interface RouteRequest {
  from: { x: number; y: number }; // source node center
  to: { x: number; y: number };   // target node center
  fromBox: Obstacle;              // source node bounds (excluded from obstacles)
  toBox: Obstacle;                // target node bounds (excluded from obstacles)
  obstacles: Obstacle[];          // every OTHER node
  bounds: { width: number; height: number }; // canvas extent
}

export interface RouteResult {
  path: { x: number; y: number }[]; // smoothed polyline, world coordinates
  ok: boolean;                      // false if no path was found (fallback to straight line)
}

export function routeEdge(req: RouteRequest): RouteResult;
```

### Algorithm shape

1. **Grid construction.**
   - Cell size constant `CELL = 10` (8–12 is the prompt's suggested range; document choice in notes).
   - Obstacle padding constant `OBSTACLE_PAD = 6` (half a cell or so).
   - Grid dimensions: `cols = ceil(bounds.width / CELL)`, `rows = ceil(bounds.height / CELL)`.
   - Blocked mask: a `Uint8Array(cols * rows)`. For each obstacle except `fromBox` and `toBox`, mark cells whose center lies inside the padded box.
2. **Start/goal cell selection.**
   - Start cell: pick the cell just outside `fromBox`'s border on the side facing `to`. Same for goal cell on `toBox`. If that cell is blocked (because an obstacle is touching), fall back to the nearest unblocked cell within a 3-cell radius; if none, return `{ ok: false, path: [from, to] }`.
3. **A* search.**
   - 8-connected neighbours (cardinal cost 1, diagonal cost √2). Diagonal motion keeps paths shorter and visually less zigzag-y.
   - Heuristic: **octile distance** (admissible for 8-connected). Document in notes.
   - Open set: a small binary heap (write inline, ~30 LOC). Use a `Map<cellIndex, fScore>` for `gScore` and `cameFrom`.
   - Cap iterations at e.g. `cols * rows` to prevent runaway on pathological inputs; on cap-hit, return `{ ok: false }`.
4. **Reconstruction.** Walk `cameFrom` from goal to start, reverse, convert cell indices back to world (cell center) coordinates.
5. **Smoothing.**
   - First, collapse colinear runs (any cell whose previous and next cell form the same direction is removed).
   - Then run the resulting polyline through `d3-shape`'s `line().curve(curveBasis)` at render time — keep `astar.ts` returning raw waypoints; render-side smoothing keeps the module pure.
   - Document smoothing choice in notes.
6. **Border tails.**
   - Compute the rectangle border anchor on `fromBox` toward the first waypoint (same `rectAnchor` logic Spike 1 uses).
   - Compute the rectangle border anchor on `toBox` from the last waypoint.
   - Prepend the source-border anchor and append the target-border anchor to the path so the edge terminates on the node border with the arrow marker landing correctly.

### Failure / edge handling

- If `routeEdge` returns `ok: false`, the caller falls back to a straight rectangle-anchored line (Spike 1's `liveDragPath` style, solid not dotted). This is observable in the spike notes' "failure modes" section.
- If `from` and `to` are inside the same parent node's footprint (shouldn't happen, but defensively), return a straight line.

### Recommended hard-coded constants (revisit in notes)

| Constant | Value | Rationale |
|---|---|---|
| `CELL` | 10 px | Mid of suggested 8–12 range |
| `OBSTACLE_PAD` | 6 px | Keep edges off node borders without forcing wide detours |
| `MAX_ITER` | cols × rows | Guarantees termination |

**Validation:** unit-style smoke test inside `astar.ts` (a `__smokeTest()` function called by `entry.ts` in dev) that routes a horizontal edge with one obstacle in the middle and asserts the resulting path goes around it. Comment out or remove before final.

---

## Phase 4 — Drop integration (30 min)

Edit `spike2/src/drag.ts`:

1. On `mouseup`, before clearing `dragId`:
   - Collect the dropped node's connected edges from `state.adjacency`.
   - For each edge:
     - Build the `RouteRequest` (obstacles = every node except the two endpoints, padded; bounds = the SVG's current width/height).
     - Call `routeEdge(req)`.
     - On `ok`, write `edge.routedPath = result.path` and `edge.routedAt = { fromX, fromY, toX, toY }`.
     - On `!ok`, leave `routedPath` empty (renderer falls back to `points` or straight rectAnchor line).
   - After all edges are routed, call a new `applyRoutedEdges(state, edgeIds)` in `renderer.ts` that:
     - Restores the original stroke/dasharray/marker-end styling.
     - Re-shows labels.
     - Replaces each path's `d` with `lineGen(edge.routedPath ?? edge.points)`.
2. **Invalidation rule on subsequent drags:** in `updateNodePosition`, when an edge's endpoint is moving, *clear* that edge's `routedPath` so it falls back to the during-drag dotted style. Edges whose endpoints did not move keep their previous `routedPath` untouched.

Edit `spike2/src/renderer.ts`:

- `renderEdge` should prefer `e.routedPath` over `e.points` when both exist.
- Export `applyRoutedEdges(state, edgeKeys)` for the drag handler to call.

**Validation:** drag node A behind node B. Release. The A↔* edges re-route around B within ~half a second. Other edges in the diagram are unchanged.

---

## Phase 5 — Pages and entry (15 min)

1. Create `spike2/src/entry.ts`:
   - Same shape as Spike 1's `interactive-entry.ts`: read selected fixture, parse → IR → layout → renderFull → attachDrag.
   - Add a fixture-picker (`<select>`) wired to small / 200-node fixtures.
   - Add a **Reset Layout** button that re-runs `layoutIR` from scratch and re-mounts.
2. Create `spike2/our-renderer.html`: single-page host for `entry.ts`, the fixture picker, and the reset button. Pattern after `spike/our-renderer-interactive.html`.
3. Create `spike2/index.html`: two-pane layout. Left iframe = `mermaid-reference.html`, right iframe = `our-renderer.html`. Same fixture picker at the top driving both iframes via `postMessage` or a shared `?fixture=` query string (whichever Spike 1 used — match it).

**Validation:** `npm run dev`, open the served `index.html`, both iframes show the same diagram, fixture picker switches both panes.

---

## Phase 6 — SPIKE2_NOTES.md (15 min)

Write `spike2/SPIKE2_NOTES.md`, **under 400 words**, six sections matching the prompt:

1. A* parameter choices — one sentence each on cell size, heuristic, padding, smoothing.
2. Routing quality — honest assessment, including the "dragged behind another node" test case.
3. Drop-time latency — eyeball at 200 nodes on a node with 4+ edges.
4. Failure modes — pick the surrounded-node case, report what happens.
5. Edge cases that surprised you.
6. Production readiness — 3 sentences max. Is grid-A* enough for 200-node target? If not, what next? (Candidates to mention: orthogonal routing with port assignment, ELKjs edge routing layer.)

Be brutally honest. A false-positive "viable" is the worst outcome.

---

## Definition of Done Checklist (from prompt)

- [ ] `cd spike2 && npm install && npm run dev` starts the dev server.
- [ ] `index.html` shows two panes.
- [ ] Fixture picker switches small / 200-node in both panes.
- [ ] Right pane: initial layout matches Spike 1.
- [ ] Drag a node → connected edges become straight dotted lines.
- [ ] Release → connected edges re-route as obstacle-avoiding curves landing on node borders within ~half a second.
- [ ] Rest of the diagram does not move on drop.
- [ ] Reset Layout button restores dagre's output (including clearing `routedPath` on all edges).
- [ ] `SPIKE2_NOTES.md` exists, < 400 words, answers all six sections.

---

## Risks / where to cut scope if time runs out

In priority order (keep top, drop bottom):

1. **Keep:** A* core + drop integration + dotted during-drag + 200-node fixture working. This is the load-bearing answer.
2. **Keep:** SPIKE2_NOTES.md — even a rough notes file is more valuable than polish.
3. **Trim:** smoothing. Raw colinear-collapsed polyline is acceptable if `curveBasis` introduces visual artifacts; document and move on.
4. **Trim:** invalidation niceties. If invalidation is fiddly, accept that subsequent drags of other nodes may leave stale `routedPath` until those edges are dragged — note it as a known issue.
5. **Drop:** Reset Layout button can be a hard page reload if wiring the in-place reset eats time.
6. **Drop:** fixture-picker syncing both panes — fall back to two independent `?fixture=` query params, document.

The spike's job is to answer "is grid-A* viable?" — anything beyond that is decoration.

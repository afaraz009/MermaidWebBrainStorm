# Spike 2 — A\* edge routing on node drop

## What's already been validated

Spike 1 (in `spike/`) validated the parser-only + dagre + d3-shape pipeline against a Mermaid reference render. Static rendering works. Drag-to-reposition works with a partial-update SVG mutation pattern. Read `spike/SPIKE_NOTES.md` and `_bmad-output/planning-artifacts/architecture-decisions-renderer.md` before starting — they're load-bearing context.

The one limitation Spike 1 left open is **edge routing**. During drag, connected edges are rendered as straight rectangle-anchored lines. After drop, they stay straight. If a dragged node ends up behind another node, its edges pass straight through that node's body. Dagre has no incremental "re-route this one edge" mode and re-running dagre over the whole graph shifts the entire diagram, so the spike just left straight lines as-is.

## What this spike validates

Whether **A\* path-finding on a grid** can produce visually acceptable, obstacle-avoiding edge routes for the edges connected to a node *after* the user drops it. Specifically:

1. Initial layout still comes from dagre. Same as Spike 1.
2. **During drag, draw the connected edges as straight dotted lines.** Cheap, no routing work per frame. Visual signal that the edges are "in transit" and will settle on release. (We are deliberately not optimizing the during-drag visual in this spike — drop-time quality is the load-bearing question.)
3. **On mouseup, run A\*** for each edge connected to the dropped node, with all other nodes (and optionally subgraph rectangles) as obstacles. Compute a smooth path that goes from the other endpoint's border, around any obstacles, to the dropped node's border. Mutate just those edges' SVG paths. Nothing else in the diagram moves.

## What you must produce

A new `spike2/` directory at the repo root, parallel to `spike/`. Same three-pane comparison layout as Spike 1:

- **Mermaid reference** (left iframe) — official Mermaid render via CDN. Identical to `spike/mermaid-reference.html`. The visual *layout* target, not the routing target — Mermaid's edge routing isn't what we're trying to match either; we just want a side-by-side sanity check that we're rendering the same diagram.
- **Our renderer with A\*** (right iframe) — our pipeline with dagre layout, drag-to-reposition, and A\* re-routing on mouseup.

Two iframes are enough this time. No separate "static" page. The interactive page IS the spike.

## You may copy from Spike 1

Spike 1's parser adapter, IR types, dagre layout adapter, SVG renderer, drag handler, and the 200-node fixture are reusable. **Copy** the files you need into `spike2/` — do not symlink or import across spikes. We want Spike 2 to be self-contained so Spike 1 stays a clean checkpoint.

Files in `spike/src/` you can almost certainly lift wholesale:
- `types.ts`
- `parser.ts`
- `layout.ts`
- The non-drag parts of `renderer.ts` (initial render, subgraph rendering, node rendering, defs/arrow marker)
- The 200-node fixture (`spike/fixture-200.mmd`) and small fixture (`spike/fixture.mmd`)

What you will need to rewrite or significantly change:
- The during-drag edge update path in `renderer.ts` — replace rectangle-anchored straight curves with **straight dotted lines**, no rectangle anchoring needed during drag (just node-center to node-center, dashed).
- The drag handler's `mouseup` — add the A\* re-route step.
- Add a new module for A\* itself.

## A\* — what's load-bearing and what you decide

**Load-bearing:**

1. **Grid-based A\*.** Overlay an invisible uniform grid on the canvas (cell size your call; 8–12px is a reasonable starting range). Mark cells inside other nodes as blocked. Find a path from a cell near the source border to a cell near the target border.
2. **Run per affected edge on mouseup only.** Not during drag, not on every node — only edges connected to the dropped node, only once per drop.
3. **Mutate the existing `<path>` element's `d` attribute.** Same partial-update pattern as Spike 1. Do not re-render the whole SVG.
4. **The dropped node's connected edges store their A\*-computed waypoints in the IR.** Add a field on the edge type (e.g. `routedPath: Point[]` or just overwrite `points`). Subsequent drags of *other* nodes should not invalidate this edge's routing unless one of its endpoints moved.
5. **Edges must terminate at the node's border, not its center.** Use the same `rectAnchor` logic Spike 1 has (find where the line from outside enters the rectangle). The A\* path should start one cell outside the source border and end one cell outside the target border; then add a short tail segment that lands on the actual border.

**You decide:**

- Cell size. Smaller = nicer paths, slower; larger = chunkier paths, faster. Pick a value, document it.
- Heuristic. Manhattan distance is fine; Euclidean is fine; you choose.
- Whether subgraph rectangles count as obstacles, count as soft costs, or are ignored. (Recommendation: ignore for this spike. Edges crossing subgraph borders are normal in Mermaid output.)
- How much padding to leave around each obstacle node. Too tight and edges shave node borders; too loose and short edges get pushed weirdly far.
- How to smooth the A\* output. The raw output is a zigzag of grid cells. Options: collapse colinear cells, run through `d3.line().curve(curveBasis)`, or your choice. Document what you picked.
- The during-drag dotted style (color, dash pattern). Just make it look "in-transit."

## Hard constraints

- **No new heavy dependencies.** A\* is ~150 lines of code; write it yourself. Do not pull in `pathfinding`, `astar.js`, or similar. You can keep `mermaid`, `@dagrejs/dagre`, `d3-shape`, `vite`, `typescript`.
- **No re-running dagre during interaction.** Initial layout only. The drag/drop cycle never calls `layoutIR` (except via the "Reset Layout" button).
- **No framework.** Plain TypeScript, plain DOM. Same as Spike 1.
- **No manual edge editing UI.** Out of scope for this spike (bend handles, double-click-to-add-bend, segment curvature toggle, etc. are deliberately deferred — they require this spike's data-model change but are next-iteration work).
- **2–3 hour timebox.** Working-and-incomplete beats stuck-and-perfect, same rule as Spike 1.

## Deliverables

```
spike2/
  package.json
  tsconfig.json
  vite.config.ts
  index.html                  # 2-pane comparison, fixture picker (small + 200-node)
  fixture.mmd                 # copied from spike/
  fixture-200.mmd             # copied from spike/
  mermaid-reference.html      # copied / lightly adapted from spike/
  our-renderer.html           # the A* interactive page
  src/
    types.ts
    parser.ts
    layout.ts
    renderer.ts               # initial render + drag + A*-on-drop integration
    drag.ts                   # mousedown/move/up; calls into routing on mouseup
    astar.ts                  # the grid-based path-finder, written from scratch
    entry.ts
  SPIKE2_NOTES.md             # findings, max 400 words
```

## SPIKE2_NOTES.md must cover

1. **A\* parameter choices** — cell size, heuristic, obstacle padding, smoothing. One sentence each.
2. **Routing quality** — drag a node behind another node. Do its edges go around the obstacle? Honest assessment.
3. **Drop-time latency** — eyeball judgment. Is there a perceptible pause between mouseup and the edges settling? At 200 nodes with a node that has 4+ connected edges?
4. **Failure modes** — does A\* ever fail to find a path? Pick an edge case (e.g. dropped node tightly surrounded by other nodes) and report what happens.
5. **Edge cases worth flagging** — what surprised you?
6. **Production readiness assessment** — three sentences max. Is grid-A\* good enough for the architecture decisions doc's 200-node target, or does this approach hit a ceiling we should know about? If a ceiling, what's the next thing to try?

## Definition of done

1. `cd spike2 && npm install && npm run dev` starts the dev server.
2. Open `http://localhost:<port>/index.html` — two panes visible.
3. Switch the fixture picker between small and 200-node; both panes update.
4. On the right pane:
   - Initial layout matches Spike 1 (same dagre output).
   - Drag any node. Connected edges become straight dotted lines during drag.
   - Release the mouse. Within ~half a second, the connected edges re-route as smooth obstacle-avoiding curves landing on the node borders.
   - The rest of the diagram does not move.
   - Reset Layout button restores dagre's output.
5. `SPIKE2_NOTES.md` exists, under 400 words, answers all six sections honestly.

## Why this matters

The architecture decisions doc commits the production renderer to owning its edge routing — Mermaid's renderer doesn't have the post-interaction routing flexibility the disclosure family (collapse, focus, path-tracing) needs. Spike 1 confirmed the rendering pattern is viable. This spike confirms whether grid-A\* is a viable routing approach, or whether we need to go straight to something heavier (orthogonal routing with port assignment, ELKjs as a routing engine, etc.). The answer drives the next 1–2 weekends of build.

Be brutally honest in `SPIKE2_NOTES.md`. A confident "A\* is viable" when it isn't is the worst outcome.

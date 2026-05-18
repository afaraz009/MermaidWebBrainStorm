# Spike 2 Implementation Plan — A* edge routing on node drop

Companion to `prompt-spike2.md`. Read that prompt first; this plan turns it into concrete steps grounded in what Spike 1 (`spike/`) actually shipped.

---

## 0. Reality check against the prompt

Two mismatches between `prompt-spike2.md` and the Spike 1 code that I'm flagging before they cause confusion mid-build:

1. **The prompt says Spike 1 "left straight lines as-is" on drop.** What `spike/src/drag.ts:35-50` actually does on `mouseup` is re-run dagre with the dragged node pinned and call `refreshEdgesFromLayout` — which restores multi-waypoint curves but shifts the rest of the diagram. The spike isn't doing nothing on drop; it's doing the wrong thing (whole-graph re-layout). Spike 2 must **replace** that mouseup branch with A*, not add to it. The prompt's hard constraint "No re-running dagre during interaction" is the binding one.
2. **Fixture filename.** Prompt says `fixture-200.mmd`; the real file is `spike/fixture200.mmd` (no hyphen). Copy it under its existing name and let `index.html`'s picker reference `fixture200.mmd`. Don't rename — it's not worth the extra delta against Spike 1 history.

Also worth knowing: Spike 1 has both a static page (`our-renderer.html` + `main-static.ts`) and an interactive page (`our-renderer-interactive.html` + `main-interactive.ts`). The prompt says "no separate static page" — we'll collapse to a single `our-renderer.html` for Spike 2 that IS the interactive page.

---

## 1. Directory and file scaffold

Create `spike2/` parallel to `spike/`. Final shape:

```
spike2/
  package.json           # same deps as spike/, no additions
  tsconfig.json          # copy verbatim
  vite.config.ts         # copy verbatim
  index.html             # 2-pane iframe comparison + fixture picker
  fixture.mmd            # copy from spike/
  fixture200.mmd         # copy from spike/ (keep existing name)
  mermaid-reference.html # copy from spike/
  our-renderer.html      # the interactive A* page (single page, no static variant)
  src/
    types.ts             # copy from spike/, extend IREdge
    parser-adapter.ts    # copy from spike/ verbatim
    layout.ts            # copy from spike/ verbatim
    border.ts            # copy from spike/ verbatim (clipToBorder is load-bearing)
    renderer.ts          # copy then modify: drag overlay → dotted; add A* application path
    drag.ts              # copy then modify: replace mouseup body with A* re-route
    astar.ts             # NEW — grid pathfinder, ~150 LOC from scratch
    routing.ts           # NEW — obstacle grid build, smoothing, IR write-back
    entry.ts             # NEW — bootstrap for our-renderer.html (the prompt's deliverable name)
```

Notes on the scaffold:
- Prompt lists `entry.ts` in deliverables. Spike 1 used `main-interactive.ts`. Use `entry.ts` per the prompt — one file, mirrors `main-interactive.ts`'s shape, plus a fixture picker handler.
- `routing.ts` is split out from `astar.ts` deliberately: A* is the algorithm (reusable, testable); `routing.ts` is the glue (obstacle marshaling, smoothing, mutation of `<path>` `d` attributes). Keeps `astar.ts` honest about being ~150 LOC.

---

## 2. IR change

`spike/src/types.ts:13-20` is the existing `IREdge`. Extend it:

```ts
export interface IREdge {
  from: string;
  to: string;
  label?: string;
  style?: 'solid' | 'dotted';
  points?: { x: number; y: number }[];
  originalPoints?: { x: number; y: number }[]; // dagre's initial route
  routedPath?: { x: number; y: number }[];      // NEW: A*-computed waypoints, post-drop
}
```

Semantics:
- `originalPoints` keeps its Spike 1 meaning (dagre's initial layout). Never overwritten after layout.
- `routedPath`, when present, is the source of truth for rendering this edge. It's set on drop and survives subsequent drops *of other nodes*.
- When **either endpoint** of an edge moves (i.e., that endpoint's node is the one being dropped), the edge's `routedPath` is invalidated and recomputed by A\*. Edges whose endpoints didn't move keep their existing `routedPath` (or fall back to `originalPoints` if they never had one).
- "Reset Layout" button clears all `routedPath` and re-runs dagre.

This satisfies prompt constraint #4 ("Subsequent drags of other nodes should not invalidate this edge's routing unless one of its endpoints moved").

---

## 3. A* module (`astar.ts`)

Pure function, no DOM. ~150 LOC target.

**Signature:**

```ts
export interface AStarGrid {
  cellSize: number;
  cols: number;
  rows: number;
  originX: number;
  originY: number;
  blocked: Uint8Array; // length cols*rows, 1 = obstacle
}

export function findPath(
  grid: AStarGrid,
  startCell: { cx: number; cy: number },
  goalCell: { cx: number; cy: number }
): { cx: number; cy: number }[] | null;
```

**Implementation choices:**
- **Heuristic:** Manhattan. Cheap, admissible on a 4-connected grid, produces axis-aligned bias which reads as "diagram-like" routing. Document in `SPIKE2_NOTES.md`.
- **Connectivity:** 8-way (orthogonal + diagonal). 4-way produces visible staircasing on 8–12px cells; 8-way costs almost nothing and looks much better. Diagonal cost = `√2`, orthogonal = 1.
- **Open set:** a binary min-heap keyed by `f = g + h`. Don't use a sorted array — at 200 nodes worst-case the open set can hit thousands of cells and `Array.sort` per insertion is the kind of accidental O(n²) that turns "~half a second" drop latency into "perceptible pause." 60-line heap, well-understood.
- **Closed set:** `Uint8Array` of size `cols*rows`, indexed by `cy*cols + cx`. Faster than `Set<string>` keys.
- **Tie-breaking:** prefer the cell with lower `h` on `f` ties (produces cleaner straight runs).
- **No path found:** return `null`. Caller falls back to a straight border-to-border line (so the edge never disappears).

**What NOT to do:**
- Don't pull in `pathfinding`, `astar.js`, etc. Prompt explicitly forbids.
- Don't make it generic over heuristic/connectivity via DI. One concrete impl, hardcoded choices, document them in notes.

---

## 4. Routing glue (`routing.ts`)

This is where the spike's quality lives. Three pieces:

### 4a. Build the obstacle grid

```ts
export function buildGrid(ir: IR, excludeNodeIds: Set<string>, cellSize: number, padding: number): AStarGrid;
```

- Compute the canvas bounds from all node positions (with margin).
- Allocate `blocked` as `Uint8Array`.
- For each node **not** in `excludeNodeIds` (we exclude the dropped node and the edge's *other* endpoint — the path's start and goal must be in free cells), mark every cell whose center is inside `(x - w/2 - padding, y - h/2 - padding)` to `(x + w/2 + padding, y + h/2 + padding)` as blocked.
- Padding default: **6px** (roughly half a cell at 12px cell size). Tweakable; document chosen value.
- Subgraph rectangles: **ignore** (per prompt's recommendation). Edges crossing subgraph borders is normal Mermaid output.

Rebuild the grid on every drop — it's cheap (one pass over ~200 nodes, ~50k cells worst case for an 8px grid on a 2400×1800 canvas).

### 4b. Find path for one edge

```ts
export function routeEdge(
  edge: IREdge,
  fromNode: IRNode,
  toNode: IRNode,
  ir: IR,
  cellSize: number,
  padding: number
): { x: number; y: number }[];
```

Steps:
1. Build grid excluding `fromNode` and `toNode`.
2. Compute border points using existing `clipToBorder` from `spike/src/border.ts` — line from `fromNode` center toward `toNode` center, and vice versa. These are the *true* endpoints the edge must visually land on.
3. Pick start/goal grid cells: walk one cell **outward** along the border-exit vector from each clipped point. (Prompt's wording: "one cell outside the source border and end one cell outside the target border.") If that cell is blocked (rare; happens when the two nodes are touching), nudge to the nearest free neighbor.
4. Run A\*. If `null`, fall back to `[startBorder, midpoint, goalBorder]` — same shape as Spike 1's `dragWaypoints`.
5. Convert path of grid cells → world coordinates (cell center).
6. **Prepend** the true source border point. **Append** the true target border point. This is the "short tail segment" the prompt asks for — it guarantees the edge visually terminates on the node border even though A\* worked in free space.
7. Smooth (see 4c).

### 4c. Smoothing

Raw A\* output is a staircase. Two-stage smoothing:

1. **Collinear collapse pass.** Walk the cell list; drop any cell where prev/curr/next are colinear. Cheap, removes the zigzag along straight runs. This alone makes the output usable.
2. **`d3.line().curve(curveBasis)`.** Already imported in Spike 1's `renderer.ts`. Apply to the collapsed point list. curveBasis approximates rather than interpolates, which softens the remaining grid corners.

Document the choice in `SPIKE2_NOTES.md`. If curveBasis pulls corners *too* far from the path (cutting into now-not-blocked obstacles), fall back to `curveCatmullRom` with low alpha — curveCatmullRom interpolates the control points.

### 4d. Apply to DOM

`routing.ts` exports `applyRoutedPath(mountEl, edgeKey, pts)`: mutates the `<path>` `d` and the `<line>` arrow tip using the same `edgeCurvePath` / `updateArrowLine` helpers that already exist in `spike/src/renderer.ts:45-94`. **Lift those helpers** into `renderer.ts` exports (or move to a shared `edge-svg.ts` if cleaner) so `routing.ts` doesn't duplicate them.

---

## 5. Drag handler changes (`drag.ts`)

Three changes from the Spike 1 version:

### 5a. mousedown — capture which edges will be re-routed
No change to logic. Existing handler already finds the node by `data-node-id`.

### 5b. mousemove — switch overlay to straight dotted lines
Currently `updateNodePosition` (in `renderer.ts`) builds a 3-point `dragWaypoints` with `clipToBorder` on both ends and runs through `curveBasis`. Replace with: **for each connected edge, set `d` to a straight `M sx sy L tx ty` between node centers, with `stroke-dasharray='4,4'`.** Center-to-center is fine per the prompt ("no rectangle anchoring needed during drag"). Hide the arrow `<line>` and edge label during drag (`display:none`) — they're noisy on a transient overlay. Re-show on mouseup.

Two cleanups while modifying `updateNodePosition`:
- It still needs to move subgraph rects (via `updateSubgraphRects` — keep that).
- The existing `displayPoints` map stays, but during drag we just store `[fromCenter, toCenter]` for each connected edge.

### 5c. mouseup — replace dagre re-layout with A\*
Currently:
```ts
layout(ir);
refreshEdgesFromLayout(mountEl);
```

Replace with:
```ts
const droppedId = dragging.id;
const cellSize = 10;       // chosen value; document in notes
const padding = 6;
const grid = buildGrid(ir, /*exclude:*/ new Set(), cellSize, padding); // grid rebuilt per-edge inside routeEdge
const connectedEdges = ir.edges.filter(e => e.from === droppedId || e.to === droppedId);
for (const edge of connectedEdges) {
  const fromNode = ir.nodes.find(n => n.id === edge.from)!;
  const toNode   = ir.nodes.find(n => n.id === edge.to)!;
  const pts = routeEdge(edge, fromNode, toNode, ir, cellSize, padding);
  edge.routedPath = pts;
  applyRoutedPath(mountEl, edgeKey(edge.from, edge.to), pts);
}
// Restore arrow/label visibility on these edges.
node.pinned = true;
```

**Do not call `layout(ir)`.** That's the prompt's hard constraint.

### 5d. Reset Layout button (in `entry.ts`)
Clear `routedPath` on every edge, clear `pinned` on every node, then re-run `layout(ir)` and `renderFull`. Same as Spike 1's reset.

---

## 6. Renderer changes (`renderer.ts`)

Most of the file copies verbatim. Specific changes:

1. **Initial render path** — when an edge has `routedPath`, render from that. Otherwise render from `originalPoints` (Spike 1 behavior).
2. **Export `edgeCurvePath`, `updateArrowLine`, `edgeKey`** so `routing.ts` can apply paths without re-implementing them.
3. **`updateNodePosition`** — replace the curved overlay with the dotted straight-line overlay per §5b. Hide arrow line + label.
4. **`refreshEdgesFromLayout`** — keep as-is; only the reset button uses it now.

---

## 7. `index.html` — two-pane comparison with fixture picker

Layout: two iframes side by side, plus a fixture `<select>` above them. On change, post a message (or just update each iframe's `src` with a `?fixture=fixture200.mmd` query param). Each child page reads the query param in `entry.ts` and fetches the matching `.mmd`.

```html
<!-- spike2/index.html (sketch) -->
<select id="fixture">
  <option value="fixture.mmd">small</option>
  <option value="fixture200.mmd">200-node</option>
</select>
<div style="display:flex; gap:8px;">
  <iframe id="left"  src="mermaid-reference.html?fixture=fixture.mmd"></iframe>
  <iframe id="right" src="our-renderer.html?fixture=fixture.mmd"></iframe>
</div>
```

`mermaid-reference.html` already reads a fixture in Spike 1 — extend to honor `?fixture=`. Same for `our-renderer.html`.

---

## 8. Build order (suggested, given 2–3 hour timebox)

In order — each step leaves a working artifact:

1. **Scaffold** (~15 min). Copy files, get `npm install && npm run dev` working with the small fixture rendering on `our-renderer.html`. No A* yet. Confirms the copy is clean.
2. **Drag overlay → dotted straight lines** (~20 min). Change `updateNodePosition`. Drag still works, lines just look transient. mouseup still does the old dagre re-layout (visibly wrong but we leave it).
3. **`astar.ts`** (~45 min). Pure module, no DOM. Sanity-check it standalone in the console: build a tiny grid with a known obstacle, assert the path goes around. Don't skip this — debugging A\* via the full pipeline is painful.
4. **`routing.ts` glue + mouseup wiring** (~45 min). Replace the mouseup body. Test on the small fixture first (10 nodes — easy to eyeball routing quality). Then 200-node.
5. **Smoothing** (~20 min). Start with colinear collapse only; add curveBasis if the result looks too zigzaggy.
6. **Reset Layout, fixture picker, two-pane `index.html`** (~15 min).
7. **`SPIKE2_NOTES.md`** (~20 min). All 6 sections, under 400 words. Be honest about failure modes — the prompt closes with "A confident 'A\* is viable' when it isn't is the worst outcome."

If running over time, the cuts in order: skip curveBasis smoothing (collinear-only is acceptable); skip the 200-node performance honesty section if you haven't measured (write "not measured" — don't fake it).

---

## 9. Risks and what to do about them

| Risk | Likelihood | Mitigation |
|---|---|---|
| A\* is too slow at 200 nodes with 8px cells | Medium | Default to 12px. Profile: a 2400×1800 grid at 12px is 200×150 = 30k cells; A\* on that is sub-50ms even with bad implementations. Notes section #3 covers this. |
| Smoothed path cuts through obstacles | Medium | Document in failure modes. Mitigation if observed: stop at colinear-collapse; or expand obstacle padding so the curve has slack. Don't try to make this perfect — note the ceiling. |
| Edges connected to nodes inside tight clusters fail to find a path | Low-Medium | Fall back to straight line (already in plan). Note in `SPIKE2_NOTES.md` failure modes. |
| Border-to-grid-cell handoff produces visible kinks | Medium | The two-segment tail (true border point → first grid cell, last grid cell → true border point) usually looks fine because curveBasis smooths the join. If kinks visible, increase the "step out" distance from 1 cell to 2 cells. |
| Diagonal A\* "cuts corners" through obstacle diagonals | Low | Disallow diagonal moves where both orthogonal neighbors are blocked. ~3 LOC check in the A\* expansion step. |

---

## 10. Definition-of-done checklist (mirrors prompt §"Definition of done")

- [ ] `cd spike2 && npm install && npm run dev` starts the dev server.
- [ ] `http://localhost:<port>/index.html` shows two panes.
- [ ] Fixture picker toggles both panes between `fixture.mmd` and `fixture200.mmd`.
- [ ] Initial layout on the right pane matches Spike 1 (same dagre output).
- [ ] Drag any node → connected edges become straight dotted lines.
- [ ] Release → within ~500ms, those edges re-route as smooth obstacle-avoiding curves landing on node borders.
- [ ] Nothing else in the diagram moves on drop.
- [ ] Reset Layout restores dagre's output (clears `routedPath` everywhere).
- [ ] `SPIKE2_NOTES.md` exists, under 400 words, covers all 6 sections honestly.

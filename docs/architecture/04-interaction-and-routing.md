# 04 — Interaction & Routing

[← architecture index](README.md)

> **TL;DR.** The interactions that matter: **drag** (pin-and-recalculate — moves one node,
> rebuilds only its edges, never re-runs full layout) and the **disclosure family** —
> **collapse/expand**, the **depth slider** (folds by nesting depth via the collapse path),
> and **focus** / **path** (pure SVG-class overlays that isolate a node's neighbourhood or
> light every directed route between two nodes — no relayout). A `disclosureSettings.mode`
> singleton keeps focus/path mutually exclusive; a shared `disclosure-overlay.ts` does
> adjacency + tri-state emphasis (on-route clusters render as lit containers). Edges also
> have three drop-time modes — **side-aware** (default), **dagre**, **A*** (optional). A
> pan/zoom layer, a "connect" tool, and a context menu round it out.

---

## 1. Drag — pin-and-recalculate (`src/drag.ts`)

This is architecture Decision 5: dragging updates **one** node; the rest of the layout
is untouched. `attachDrag(svg, ir, mountEl)` wires three handlers via an
`AbortController` (so a re-render cleanly detaches them — `entry.ts reattach()`).

**mousedown** (`:35`): find the `[data-node-id]`, record the grab offset, and snapshot
the dragged node's **cluster ancestry** (`ancestorClusterIds`, `:17`) — innermost→
outermost containing subgraphs.

**mousemove** (`:51`): on the **first** actual move, invalidate the frozen rects of the
dragged node's ancestor clusters:

```ts
if (!dragging.moved && ir.clusterRects) {
  for (const cid of dragging.ancestors) ir.clusterRects.delete(cid);   // :60
}
```

Then `updateNodePosition()` moves the node and rebuilds its edges live. This deletion is
**drag-bug fix #1**: external clusters carry a *recorded* dagre box in `ir.clusterRects`
(see [02](02-layout-engine.md) §5) that doesn't track moving leaves, so the container
appeared not to resize. Dropping the ancestors makes `computeClusterBboxes` fall back to
the live leaf-bbox + margin path, and the container resizes like an encapsulated one.
Done on first *move* (not mousedown) so a plain click reshapes nothing.

**mouseup** (`:76`): pin the node (`node.pinned = true`), then commit drop-time edge
geometry by mode (`:120`):

| Mode | Drop behaviour |
|---|---|
| **A* enabled** | `routeEdgesBatch(...)` re-routes **every** edge through the grid; deletes `labelPos`. Takes precedence over `edgeMode`. |
| **side-aware** (default) | `buildSideAwareCurvesForNode` for the dropped node's edges only; stamp the curves onto `originalPoints`/`points`; delete `routedPath` + `labelPos`. The visible edge doesn't jump on release. |
| **dagre** | clear overrides and re-run `layout(ir)` — connected edges get fresh dagre points; may visibly fold on back-edges (that's the mode's purpose). |

**Drag-bug fix #2** lives in the side-aware builder, not here: when the dragged node is
a cluster's rewritten representative leaf, `buildSideAwareCurvesForNode` detects the
**pivot-side cluster** and anchors the edge to the cluster border instead of fanning it
onto the leaf (see [03](03-rendering-and-edges.md) §5). Together the two fixes mean the
cluster's external edge stays pinned to the (now-resizing) cluster border as you drag an
interior node.

> When A* is on, the drop also **grid-snaps** the node so its top-left lands on a cell
> line (`:97`), keeping the routing grid aligned to node borders.

---

## 2. Collapse / expand — disclosure mode 1 (`src/collapse.ts`)

The one disclosure-family mode that exists today. `attachCollapseHandlers(svg, getIR,
rerender)`:

- **Collapse** (`:23`): a left-click landing on a `[data-subgraph-id]` sets
  `sg.collapsed = true` and re-renders. Because clusters paint outer-first, a click in
  an inner cluster hits the inner rect first and collapses just that one.
- **Expand** (`:39`): mousedown on a `[data-surrogate-for]` followed by mouseup within
  `CLICK_THRESHOLD_PX` (4px) sets `sg.collapsed = false`. The distance check
  distinguishes an expand-click from a drag of the surrogate (drag.ts also services
  surrogates).

Both call `rerenderWithCollapse()` (`entry.ts:89`), which: clears stale routed paths,
`deriveEffectiveIR(ir)` → `currentEff`, `layout(currentEff)`, `syncEffToSource()`,
optionally re-routes A*, `renderFull`, `reattach`. So collapse flows through the **same**
`layout()` door as everything else — there is no separate collapse layout path. The
mechanics of the derivation are in [01](01-data-pipeline.md) §3.

This is the proof that the disclosure family can ride on this substrate: the hardest
structural case (collapsing a cluster whose only child is another cluster) already works
via the surrogate-reparenting in `effective-ir.ts`.

---

## 2A. The disclosure family — depth, focus, path (`depth.ts`, `focus.ts`, `path.ts`, `disclosure-overlay.ts`)

The other three disclosure modes (collapse is §2) sit on a tiny shared layer. **Focus and
path are pure overlays — they never call `layout()` or re-render; they only toggle SVG
classes.** A `disclosureSettings.mode` singleton (`'default' | 'focus' | 'path'`) makes the
modes mutually exclusive; a toolbar button drives each.

**Shared primitive — `disclosure-overlay.ts`.** `buildAdjacency(ir)` builds undirected
`neighbors` + directed `out`/`in` over the *effective* IR using **logical endpoints**
(`fromCluster ?? from`, `toCluster ?? to`) — so an edge wired to a whole cluster makes the
cluster a graph node, i.e. a route **waypoint**. `setEmphasis(svg, ir, activeNodeIds,
activeEdgeKeys)` applies a **tri-state** to every node/edge/cluster — **active** (on the
selection), **neutral** (inside an active cluster, or a cluster that contains the
selection), or **dimmed** (everything else); `clearEmphasis(svg)` resets. An on-route
cluster thus renders as a **lit container**: border accented, contents legible, off-route
graph dimmed.

**Depth slider — `depth.ts` + a toolbar range.** `computeDepths(ir)` / `maxDepth(ir)` give
each subgraph's nesting depth; the slider sets `sg.collapsed = (depth > N)` for `N` in
`0…maxDepth` and re-runs the **existing collapse path** (`rerenderWithCollapse`). `N = 0`
folds even single-level clusters; `N = maxDepth` is fully expanded. No new layout code — it
drives the same machinery as §2.

**Focus — `focus.ts`.** In focus mode, clicking a node emphasises it + its 1-hop neighbours
(`const HOPS = 1`) + connecting edges; Esc exits, empty-click clears but stays in mode. A
node wired to a cluster focuses the cluster (logical adjacency).

**Path — `path.ts`.** Two clicks pick source/target; it lights **every node/edge on a
directed route** between them via reachability intersection (`reachFromS ∩ reachToT` over
`out`/`in`), capturing all parallel branches — not a single shortest path. Click order is
forgiving (auto-swap). No directed route either way → the source stays lit and the target
flashes a red `.path-no-route` cue (rather than clearing the whole graph).

**Interaction hygiene.** Select-clicks use the `collapse.ts` click-vs-drag threshold (a real
drag still drags) and **don't pin** the node (pin only on an actual move — see §1 / `drag.ts`),
so combining a mode with the depth slider can't silently force the flat layout engine.
`collapse.ts` suppresses collapse/expand while a mode is active. Emphasis is DOM-class only,
so any re-render wipes it; the mode toggle persists, the selection resets.

---

## 3. The three edge modes

Selection precedence at both render time and drop time:

```
A* enabled?  ── yes ──▶  routedPath  (orthogonal grid polyline)
     │ no
     ▼
edgeMode === 'side-aware'  ──▶  4-point side-aware curve   (DEFAULT)
edgeMode === 'dagre'       ──▶  raw dagre curveBasis points (re-layout on drop)
```

`edgeSettings.edgeMode` (`edgeSettings.ts`) defaults to `'side-aware'`.
`astarSettings.enabled` (`astarSettings.ts`) defaults to **false**. The UI toggles
(`entry.ts`) keep these orthogonal: A* overrides `edgeMode` while on, and the "Edges"
button is disabled (but still shows the pending mode) until A* is turned off.

---

## 4. A* orthogonal routing — optional, experimental (`src/routing.ts`, `src/astar.ts`)

> This is a **toggle-off-by-default experiment**, not part of the Mermaid-parity story.
> Default edges are the side-aware curves. A* exists to explore clean orthogonal
> routing (the kind architecture diagrams often want) and is gated behind the "A*
> Feature" button and a panel of tuning controls.

**Grid model** (`astar.ts:5`): a uniform cell grid (`cellSize` default 10px) over the
node bboxes plus a margin. A cell is **blocked** if its center lies inside any node's
padded bbox; the grid origin snaps to a cell multiple so it doesn't drift as nodes move.
Clusters aren't blocked directly — their descendant leaves are.

**Single edge** (`routeEdge`, `routing.ts:301`): build a grid excluding the two
endpoints; compute **dock** cells (one cell outside the padded bbox) and **guard** cells
(one further along the face normal) via `borderDock`/`faceSlotOffset` so parallel edges
fan out along a face and final segments stay perpendicular; run `findPath` (binary-heap
A*, `astar.ts:164`); collapse colinear runs to corners; **clip the cluster-side end to
the drawn cluster rect** (`clipPathToCluster`, `:502`) so it matches the static render.

**Batch** (`routeEdgesBatch`, `routing.ts:440`): routes all edges against a shared grid,
longest-first, with an `EdgeSeparation` mode — `off` (independent), `soft` (a per-cell
`SOFT_OVERLAP_PENALTY = 4` nudges parallel edges apart), or `hard` (earlier edges block
their cells). Tunables (connectivity 4/8, heuristic, corner-cut, cell size) live in
`astarSettings.ts` and are wired to the UI in `entry.ts`.

`gridOverlay.ts` can visualise the grid for debugging. None of this runs unless the user
enables A*.

---

## 5. The rest of the interaction layer

| Module | Role |
|---|---|
| `pan.ts` | Pan + wheel-zoom composed into a single CSS transform; zoom centers on the cursor (`entry.ts applyZoomAt`). |
| `connect.ts` | Draw a new edge between two nodes (hover handles → drag to target). |
| `contextMenu.ts` / `contextMenuWiring.ts` / `menuActions.ts` | Right-click menu: reset layout, toggle A*, fit view, collapse/expand, etc. |
| `gridOverlay.ts` | Debug overlay for the A* grid. |
| `border.ts` | Shared shape-outline + cluster-rect clipping math (used by renderer **and** routing — see [03](03-rendering-and-edges.md) §3). |

All of these re-attach through `entry.ts` after any full re-render, and all mutate the
same IR / SVG — there is no separate state store.

---

**Next:** the rules that keep all of this correct →
[05 — Invariants & parity](05-invariants-and-parity.md).

# StackConstraints — Edge Stability During Node Drag

This document explains the edge-shape consistency bug in the **spike** project,
compares the diagram-rendering stack and runtime strategy against the working
**md-diagrams-testing** project, and answers whether parity can be reached.

The analysis is restricted to the diagram rendering / runtime layer. UI chrome,
themes, panels, code editor, export, undo, etc. are explicitly out of scope.

---

## 1. The bug, observed

Source frames analysed:

- **Spike (buggy):** `assets/frames/spike_crop_*.png`, `spike_zoom_*.png`,
  `spike_hd_*.png`, `spike_bot_*.png`. Mounted at `our-renderer-interactive.html`
  → "Custom Pipeline (interactive — drag nodes)".
- **md-diagrams-testing (working):** `assets/frames/prod_*.png`,
  `prod_crop_*.png`. Recorded against `md-diagrams-ui-test.vercel.app`.

What the frames show:

| Scenario | Spike | md-diagrams-testing |
|---|---|---|
| Initial layout (no drag) | Smooth multi-waypoint dagre curves | Smooth multi-waypoint dagre curves |
| Mid-drag (e.g. moving "Budget Available?" sideways) | Edge collapses to a sharp diagonal / hard kink, "No"/"Yes" labels float in mid-air, curve shape disappears | Edge stays as a clean curveBasis path that smoothly tracks the moving endpoint; no hard kinks |
| After release | Edge stays as the sharp diagonal — does not re-route | Edge stays clean and consistent with the moved geometry |

The bug is therefore not "edges fail to update during drag" — it is **edges
update to a degenerate 3-point straight-line waypoint set, losing the
multi-waypoint curvature dagre originally produced**.

---

## 2. Diagram runtime / rendering stack — Spike

`E:\Projects\MD Test\spike\package.json`

```jsonc
{
  "type": "module",
  "dependencies": {
    "@dagrejs/dagre": "^3.0.0",   // layout
    "d3-path": "^3.1.0",
    "d3-shape": "^3.2.0",          // curveBasis line generator
    "mermaid": "^11.14.0"          // parser only (mermaidAPI.getDiagramFromText)
  },
  "devDependencies": {
    "vite": "^8.0.11",
    "typescript": "^6.0.3"
  }
}
```

Constraints / shape of the runtime:

- **No framework.** Plain TypeScript modules served by Vite. The render target
  is a single `<svg id="mount">` element in a static HTML page
  (`our-renderer-interactive.html`).
- **Imperative SVG mutation.** `src/renderer.ts` builds SVG DOM with
  `document.createElementNS` and mutates it on every drag tick via
  `updateNodePosition()` (`renderer.ts:270`).
- **Single source of truth = mutated IR.** `IREdge.points` is overwritten in
  place during drag (`renderer.ts:306`). There is no immutable layout snapshot.
- **Layout engine:** `@dagrejs/dagre` v3 (`src/layout.ts`). Produces multi-point
  waypoints once at load / reset. Re-layout never runs while dragging.
- **Edge geometry pipeline (initial render):** dagre points → border-clip first
  and last point → if only 2 points, insert a midpoint → emit as
  `IREdge.points`/`IREdge.originalPoints` (`layout.ts:70-86`).
- **Edge geometry pipeline (during drag):** `dragWaypoints(fromNode, toNode)`
  builds **3 points only**: `clipToBorder(from→toCenter)`, midpoint,
  `clipToBorder(to→fromCenter)` (`renderer.ts:54-64`). The original dagre
  waypoints stored in `originalPoints` are read from `meta` but the function
  **does not consume them** — it just rebuilds a 3-point segment from current
  positions (`renderer.ts:295-309`).
- **Curve generator:** `d3-shape` `line().curve(curveBasis)` over the points,
  with the first and last point duplicated so the curve actually touches the
  endpoints (`renderer.ts:25-35`). This is a **B-spline**, not an orthogonal
  router.
- **Arrowhead:** rendered as a separate short straight `<line>` with
  `marker-end`, recomputed from the last two waypoints
  (`renderer.ts:67-83, 195`).
- **Drag input:** raw `mousedown`/`mousemove`/`mouseup` on the SVG with
  `getScreenCTM().inverse()` for coordinate conversion (`src/drag.ts`). No
  pointer capture, no React re-render — just direct `setAttribute('d', …)` and
  `setAttribute('transform', …)`.
- **Viewport:** for the interactive view the SVG `viewBox` is removed and a
  fixed `2400×1800` canvas is used (`renderer.ts:259-267`). No pan/zoom.
- **Subgraph bounding boxes** are computed once at render and **not** recomputed
  during drag.

Where the bug lives, in one line:

> `dragWaypoints()` in `src/renderer.ts` discards every dagre waypoint between
> the endpoints and replaces them with a single midpoint, so a 5- or 7-point
> orthogonal-ish dagre route collapses to a 3-point near-straight one as soon
> as the user touches a node.

---

## 3. Diagram runtime / rendering stack — md-diagrams-testing

`E:\Projects\MD diagrams test\md-diagrams-testing\package.json` (filtered to
diagram-relevant deps):

```jsonc
{
  "dependencies": {
    "next": "16.2.4",
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "zustand": "^5.0.12",          // store
    "immer": "^11.1.4",            // immutable doc updates
    "dagre": "^0.8.5",             // layout
    "d3-path": "^3.1.0",
    "d3-shape": "^3.2.0",          // curveBasis line generator
    "mermaid": "^11.14.0"          // parser (importer, not renderer)
  }
}
```

Constraints / shape of the runtime:

- **Framework:** Next.js 16 + React 19 client component
  (`components/diagram/DiagramCanvas.tsx`). Rendering is fully declarative;
  React diffs the SVG tree.
- **State model:** Zustand store (`lib/store/useDiagramStore.ts`) holds an
  immutable `DocumentModel`. Layout (`LayoutResult`) is *derived* from the
  document via `runDagre()` and stored in component state, **not** mutated in
  place.
- **Layout engine:** `dagre` v0.8.5 (`lib/layout/runDagre.ts`). Produces
  multi-point waypoints, clipped to node borders. Re-layout runs whenever the
  document changes **and is suppressed during drag**
  (`DiagramCanvas.tsx:84-98`: `if (dragStateRef.current) return`).
- **Edge geometry pipeline (initial render):** dagre points → shape-aware
  `clipPointToNodeBorder()` for endpoints (handles `diamond`, `circle`,
  `double-circle`, plus rectangular fallback) → if only 2 points, insert
  midpoint → store as `LayoutEdge.waypoints`. Same multi-waypoint route is
  preserved (`runDagre.ts:223-249`).
- **Edge geometry pipeline (during drag):** `displayLayout` in
  `DiagramCanvas.tsx:100-141` overlays the dragged node's new position on top
  of the cached layout, then **for each edge incident to the dragged node**
  it rebuilds a **3-point** waypoint set:
  `[startPt, mid, endPt]` using the same shape-aware `clipPointToNodeBorder`.
  Edges *not* incident to the dragged node keep their original multi-waypoint
  route untouched. This is the same simplification the spike applies, but —
  see §4 — applied to a different population of edges and consumed by a
  different rendering layer.
- **Curve generator:** `d3-shape` `line().curve(curveBasis)` with endpoint
  duplication (`lib/renderer/edges/EdgePath.tsx:9-52`). Identical to spike's
  curve construction.
- **Arrowhead:** separate short straight `<line>` with `marker-end`, plus an
  **arrow shortening** so the curve body stops `ARROW_TIP_LEN` before the node
  border and the arrow tip covers the gap (`EdgePath.tsx:38-50, 99-112`).
- **Drag input:** React pointer events with `setPointerCapture`
  (`DiagramCanvas.tsx:215-319`). Drag offset stored in a ref; live position
  stored in component state (`draggedPos`) and committed to the store on
  pointer-up via `SET_NODE_POSITION`.
- **Viewport:** custom pan/zoom implemented as a CSS transform on a wrapper
  `<div>`; the SVG has `overflow: visible` and a flexible `bounds`.
- **Memoization:** `EdgePath` is `React.memo`'d, so only edges whose props
  change re-render.

---

## 4. Why the spike "loses" edge shape and md-diagrams-testing does not

Both projects collapse incident edges to a 3-point waypoint set during drag.
That sounds like the same bug, but the **outcome diverges** because the
*surrounding constraints* differ. Five concrete reasons, ordered by impact:

### 4.1 The dragged-edge population is the same — but the spike commits the collapse to the IR

- **md-diagrams-testing:** the 3-point collapse is computed inside
  `displayLayout`, a *derived* value, on every render. `layout.edges[id]` (the
  cached dagre route) is never mutated. When the user releases, `displayLayout`
  is no longer overridden and the edge snaps back to whatever the next
  `runDagre()` produces. The collapse is purely visual and lasts for the drag
  only (`DiagramCanvas.tsx:100-141, 287-302`).
- **Spike:** `updateNodePosition` writes the 3 collapsed points directly into
  `edge.points` (`renderer.ts:306`). That mutation persists after
  `mouseup`, because the spike never re-runs layout on release — the node is
  marked `pinned` and the IR keeps the degenerate route. So every subsequent
  frame, including the post-drag still frame, shows the broken edge.

### 4.2 Spike never feeds `originalPoints` back into the drag path

`layout.ts:85` already stores `e.originalPoints = pts.map(p => ({...p}))`, the
full multi-waypoint dagre route. `renderer.ts:297` reads it
(`!edge.originalPoints || edge.originalPoints.length === 0`) only as a
sentinel — the actual waypoints are then thrown away and replaced with
`dragWaypoints(fromNode, toNode)` which knows nothing about the original
shape. So the affordance for "translate the original waypoints by the drag
delta" exists in the data model and is unused.

### 4.3 Mutated IR vs. derived layout snapshot

- The spike's `IR` object is the *only* place node coordinates and edge
  waypoints live. Any drag-time mutation immediately becomes the next render's
  truth.
- md-diagrams-testing has three layers: `DocumentModel` (logical, in store) →
  `LayoutResult` (geometric, in component state, recomputed by `runDagre`) →
  `displayLayout` (per-render override that merges drag state). Drag mutations
  live only in the third layer and never poison the first two.

This is the structural root cause. Without this separation, the spike has no
clean "fall back to the last good layout" path; mutating in place is the only
option, and 3 points is the cheapest mutation, so that is what was written.

### 4.4 No re-layout after pin

md-diagrams-testing dispatches `SET_NODE_POSITION` on pointer up
(`DiagramCanvas.tsx:294`), which triggers the document-watching `useEffect` on
the next frame, which calls `runDagre()` again with that node's
`fixedPosition` honoured. dagre then produces a fresh multi-waypoint route for
*all* edges given the new node position. The collapsed 3-point edges are
replaced by proper routes within ~one frame.

The spike has no such hook. `mouseup` only sets `node.pinned = true`
(`drag.ts:37`) and the IR is left holding the 3-point edges.

### 4.5 Subgraph and shape awareness during drag

- md-diagrams-testing's `clipPointToNodeBorder` is shape-aware (diamond, circle,
  double-circle, plus rect fallback) — `runDagre.ts:6-63`. So when the user
  drags a diamond like "Approved?" or "Budget Available?", endpoints stay
  exactly on the diamond's slanted edge.
- Spike's `clipToBorder` (`renderer.ts:39-51`, `layout.ts:6-18`) treats *every*
  shape as an axis-aligned rectangle. For diamonds in the fixture
  ("Approved?", "Budget Available?"), the endpoint sits on the **bounding
  box** rather than on the diamond's slanted side, so the arrow tip ends up
  in empty space slightly outside the visible diamond — visually
  reinforcing the "edge is unstable" perception.

Spike subgraph bounding boxes are also frozen at initial render
(`renderer.ts:332-375` runs once); nothing recomputes them when their child
nodes are dragged. md-diagrams-testing recomputes the entire layout post-drag,
so subgraphs reframe their children correctly.

---

## 5. Side-by-side summary table

| Concern | Spike (`our-renderer-interactive.html`) | md-diagrams-testing (`DiagramCanvas.tsx`) |
|---|---|---|
| Framework | Vanilla TS + Vite | Next.js 16 + React 19 |
| State container | Mutable `IR` object | Zustand + Immer (immutable `DocumentModel`) |
| Layout engine | `@dagrejs/dagre@3` | `dagre@0.8.5` |
| Layout-result lifetime | Mutated in place during drag | Derived; cached `LayoutResult` is read-only during drag |
| Drag-time edge geometry | 3 points: `[startBorder, mid, endBorder]` written into `IR.edges[].points` | 3 points: `[startBorder, mid, endBorder]` written into `displayLayout.edges` only |
| Source of edge points | Final dagre route or 3-point collapse — same field | Final dagre route preserved; 3-point collapse only in transient overlay |
| Endpoint clipping | Rectangular bbox only (all shapes) | Shape-aware (diamond / circle / rect) |
| Curve | `d3-shape` `curveBasis`, endpoints duplicated | `d3-shape` `curveBasis`, endpoints duplicated |
| Arrowhead | Separate `<line>` with `marker-end` | Separate `<line>` with `marker-end` + arrow-shorten gap |
| Re-layout on drop | Never (just `node.pinned = true`) | Yes — `SET_NODE_POSITION` triggers `runDagre()` next frame |
| Re-layout suppression while dragging | N/A (no re-layout exists) | Explicit guard `if (dragStateRef.current) return` |
| Edges not incident to drag | Untouched (correct) | Untouched (correct) |
| Pan / zoom | None (fixed 2400×1800) | CSS transform on wrapper |
| Hit testing | DOM `closest('[data-node-id]')` | Geometric `hitTest()` |

---

## 6. Can the spike achieve the same edge behaviour?

**Yes.** The spike's stack is sufficient. There is nothing about being
framework-less, Vite-based, or imperative-SVG that prevents stable curves.
The fix has nothing to do with React, Zustand, Immer, Next.js, or `dagre`
versions. md-diagrams-testing's working result is produced by the *same*
`d3-shape curveBasis` line generator the spike already uses, with effectively
the same 3-point collapse during drag.

What the spike must change, in priority order:

1. **Stop mutating `IR.edges[].points` during drag.** Either:
   - keep a separate "live" map of `edgeKey → SVG path d` that drag writes to
     and renderer reads from, leaving `IR` untouched; or
   - keep `IR` as the canonical state but only write `originalPoints` on
     re-layout, never on drag.
2. **Re-run `layout(ir)` on `mouseup`** while preserving `node.pinned` and
   `node.x/y` for the dragged node. This is what restores the multi-waypoint
   dagre route after release. (This requires the `pinned`/fixed-position path
   in `layout.ts:37-42` to keep working — it already does.)
3. **Use the existing `originalPoints` for drag-time interpolation** instead
   of `dragWaypoints()`. Strategy: translate the source-side and target-side
   tails of `originalPoints` so they still meet the (possibly moved) node
   borders. A simple, robust implementation is:
   - Apply the drag delta only to the endpoint nearest the dragged node, and
     re-clip it; leave interior waypoints alone.
   - When that produces a visibly bent route (because the moved node has gone
     past an interior waypoint), fall back to a 3-point collapse — accepting
     that frame as a transient until `mouseup` re-routes.
   This matches the perceived behaviour in
   `prod_crop_0100.png`–`prod_crop_0300.png`.
4. **Make `clipToBorder` shape-aware** so diamonds/circles attach correctly.
   The md-diagrams-testing implementation in `runDagre.ts:6-63` is
   self-contained and can be ported as-is.
5. **Recompute subgraph bounding boxes** when a child node moves, otherwise
   the rectangle stays put while its child slides out of it.

None of those steps require adopting React. They only require honouring the
distinction between "the canonical layout result" and "the live drag preview".

---

## 7. Files referenced

Spike:

- `src/renderer.ts:25-35` — curveBasis with duplicated endpoints
- `src/renderer.ts:54-64` — `dragWaypoints()`, the 3-point collapse
- `src/renderer.ts:259-267` — fixed canvas during interactive
- `src/renderer.ts:270-326` — `updateNodePosition()`, in-place IR mutation
- `src/layout.ts:70-86` — initial waypoints, `originalPoints` saved
- `src/layout.ts:6-18` — rectangular `clipToBorder` (shape-blind)
- `src/drag.ts:8-42` — mousedown/mousemove/mouseup drag

md-diagrams-testing:

- `lib/layout/runDagre.ts:6-63` — shape-aware `clipPointToNodeBorder`
- `lib/layout/runDagre.ts:125-277` — full layout pass
- `components/diagram/DiagramCanvas.tsx:84-98` — re-layout suppression while dragging
- `components/diagram/DiagramCanvas.tsx:100-141` — `displayLayout` derivation, drag-time edge override
- `components/diagram/DiagramCanvas.tsx:287-319` — pointer up commits position, triggers re-layout
- `lib/renderer/edges/EdgePath.tsx:9-52` — curveBasis path with arrow-shorten gap
- `lib/renderer/renderDocument.tsx` — declarative SVG composition

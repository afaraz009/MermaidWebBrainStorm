# MermaidWeb — Native Pipeline Architecture (as-built)

**Scope:** the rendering + layout + interaction engine validated in `spike6/` and
now promoted to the seed of the PRD's **Native Pipeline** (flowchart renderer).
**Status:** spike complete, stack validated — see [`spike6/SPIKE6_COMPLETE.md`](../../spike6/SPIKE6_COMPLETE.md).
**Audience:** the team (architecture review) and the next coding agent (pickup).

> **These docs are themselves progressive disclosure** — fitting, since that's the
> product. This page is **Level 0**: read it in ~3 minutes and you have the whole
> shape. Each linked doc is **Level 1**: drill into one subsystem when you need it.
> Every Level-1 doc opens with its own **TL;DR**, so you can stop one level early
> anywhere. You should never have to read all of it to answer one question.

---

## Level 0 — the whole thing in one screen

The native pipeline turns Mermaid flowchart **source text** into an **interactive
SVG** whose layout is pixel-faithful to Mermaid v11, then layers drag and
collapse/expand on top. One unidirectional data flow, one re-entrant `layout()`
call that all interactions share.

```
 Mermaid source (.mmd / a ```mermaid block)
   │
   │  parser-adapter.ts ── parseToIR()      uses mermaid as PARSER ONLY
   ▼                                        (db.getVertices / getEdges / getSubGraphs)
 IR  { nodes[], edges[], subgraphs[], direction }      ← the single data model (types.ts)
   │
   │  effective-ir.ts ── deriveEffectiveIR()   collapse state → surrogate nodes
   ▼                                           (identity when nothing is collapsed)
 effective IR  (what the renderer & drag actually see)
   │
   │  layout.ts ── layout(ir)   ┌─────────────── THE GATE ───────────────┐
   ▼                            │ has subgraphs & nothing pinned?         │
 ┌──────────────────────────────┴─────────────────────┬───────────────────┘
 │ RECURSIVE engine                                    │ FLAT engine (legacy)
 │ recursive-layout.ts ── layoutRecursive()            │ flat dagre body in layout.ts
 │ Mermaid extractor/recursiveRender port:             │ one dagre pass, whole graph;
 │ encapsulate non-external clusters, size each as a   │ taken when something is pinned
 │ placeholder, translate children into place.         │ or there are no clusters.
 └──────────────────────────────┬─────────────────────┘
   │  writes: n.x/y/width/height, e.points/originalPoints,
   │          ir.clusterRects, ir.clusterMargins, e.labelPos
   ▼
 cluster-bbox.ts ── computeClusterBboxes()   single source of truth for drawn cluster rects
   │
   │  renderer.ts ── renderFull(eff, svg)
   ▼
 SVG scene  ── <g data-node-id> · <path> edges · <rect data-subgraph-id>
   │           + mountEl.__meta (live IR / adjacency / display points)
   ▼
 Interaction layer (all re-enter layout() or mutate the SVG directly)
   ├─ drag.ts ............ pin-and-recalculate; side-aware edge rebuild on the dragged node
   ├─ collapse.ts ........ disclosure mode 1: click cluster → collapse, click surrogate → expand
   ├─ routing.ts/astar.ts  optional A* orthogonal edge routing (toggle; off by default)
   ├─ pan.ts ............. pan + wheel-zoom (single CSS transform)
   ├─ connect.ts ........ draw new edges between nodes
   └─ contextMenu*.ts .... right-click actions
```

### The four ideas you must hold in your head

1. **The IR is the universe.** `types.ts` defines `IR` (nodes, edges, subgraphs,
   direction). Everything reads and mutates this one structure in place. There is no
   second model — the renderer, drag, routing, and collapse all operate on the same
   `IR`. → [01-data-pipeline](01-data-pipeline.md)

2. **Layout has two engines behind one door.** `layout(ir)` is the only layout entry
   point, re-run by every interaction. It *gates* between a **recursive** engine
   (Mermaid-faithful cluster encapsulation) and the **flat** legacy dagre body. The
   recursive engine is the parity asset; the flat body is the byte-identical
   fallback for pinned/cluster-less graphs. → [02-layout-engine](02-layout-engine.md)

3. **A node's `(x,y)` is its center; its SVG transform is its top-left.** Layout
   stores centers; the renderer translates to `(x − w/2, y − h/2)`. Half the
   "stale coordinate" confusion in this codebase is forgetting that. Edges are
   4-point **side-aware curves**, not straight lines. → [03-rendering-and-edges](03-rendering-and-edges.md)

4. **Drag never re-runs full layout.** It pins one node, rebuilds only that node's
   edge curves, and resizes only the clusters that contain it. Collapse/expand *does*
   re-run `layout()` on a derived IR. → [04-interaction-and-routing](04-interaction-and-routing.md)

---

## Level 1 — the deep dives

Read these when you need the detail behind one box above. Each is self-contained.

| # | Doc | What it covers | Read it when… |
|---|-----|----------------|---------------|
| 01 | [Data pipeline & IR](01-data-pipeline.md) | `types.ts` IR model; `parser-adapter.ts`; the cluster-edge rewriting (`fromCluster`/`toCluster`); `effective-ir.ts` collapse derivation | you're changing the data model or how source becomes IR |
| 02 | [Layout engine](02-layout-engine.md) | the gate; `recursive-layout.ts` (extractor port); `layout-core.ts` helpers; dagre setup; `clusterRects` vs `clusterMargins`; `cluster-bbox.ts` | you're touching positioning, cluster sizing, or parity |
| 03 | [Rendering & edges](03-rendering-and-edges.md) | `renderer.ts` SVG model; node shapes; side-aware 4-point curves; edge-label anchoring; `__meta`; refresh flow | you're changing what's drawn or how edges look |
| 04 | [Interaction & routing](04-interaction-and-routing.md) | drag (pin-and-recalculate); collapse/expand; the three edge modes (dagre / side-aware / A*); pan/zoom; connect | you're adding an interaction or a disclosure mode |
| 05 | [Invariants & parity](05-invariants-and-parity.md) | the load-bearing invariants you must not break; the Mermaid-dump parity methodology; known gaps & deferred items | you're about to refactor and want to not break parity |
| 06 | [From spike to product](06-from-spike-to-product.md) | how each module maps to the PRD architecture; what's reusable as-is; what the next agent builds (disclosure family, perf, backend) | you're starting the Phase-1 product build |

---

## Dependencies (the whole stack)

From `spike6/package.json` — deliberately tiny, per architecture Decision 2:

| Package | Role |
|---|---|
| `mermaid` (^11) | **Parser only.** AST source via `flowDb`. Never used to render. |
| `dagre-d3-es` (^7, Mermaid's fork) | Layout. Same engine Mermaid uses internally → geometric equivalence. (`@dagrejs/dagre` is also installed; the recursive + flat paths use `dagre-d3-es`.) |
| `d3-shape` (`curveBasis`) | Edge curves — the same curve function Mermaid uses. |
| `d3-path` | SVG path construction companion to d3-shape. |
| `vite` + `typescript` | Build/dev only. |

No framework, no state library, no canvas/WebGL — all deferred to the product's
architecture phase. The engine is plain TS + the SVG DOM.

## Run & verify it

```
cd spike6
npm install                         # first time only
./node_modules/.bin/tsc --noEmit    # type-check (must be silent)
npx vite --port 5190 --strictPort   # dev server
```

- **`index.html?fixture=NAME.mmd`** — split view: Mermaid reference (left) vs ours (right).
- **`our-renderer.html?fixture=NAME.mmd`** — just our renderer (drag a node here).
- **`mermaid-debug.html?fixture=NAME.mmd`** — Mermaid with internal logging teed to
  `window.__dump` — this is the parity ground truth (see [05](05-invariants-and-parity.md)).

24 fixtures live in `spike6/fixture_*.mmd` and are registered in the `index.html`
dropdown (12 core/parity-locked, 6 direction/multi-level, 6 break-attempt stress).

## Disclosure-family readiness (the product thesis)

The four PRD disclosure modes, against this substrate:

| Mode | Status | Notes |
|---|---|---|
| **Collapse / expand** | ✅ Prototyped | `effective-ir.ts` + `collapse.ts`; surrogate nodes, re-runs `layout()`. |
| **Depth slider** | ⬜ Not built | Mechanically close to collapse-all-below-depth-N over `effective-ir`. |
| **Focus mode** | ⬜ Not built | Needs an adjacency walk over IR + opacity mutation; PRD-flagged novel UX. |
| **Path mode** | ⬜ Not built | Needs BFS over IR adjacency; PRD-flagged novel UX; has a 3-mode fallback. |

→ The build plan for these is in [06-from-spike-to-product](06-from-spike-to-product.md).

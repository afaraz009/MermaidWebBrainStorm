# 06 — From Spike to Product

[← architecture index](README.md)

> **TL;DR.** `spike6/src/` *is* the PRD's "Native Pipeline" — every box in the
> planning-stage architecture diagram now has a real module behind it. The layout
> engine (the hard, novel part) is built and Mermaid-faithful. What's left is
> **product scaffolding the spike never had** (Markdown workspace, backend, framework)
> and **three disclosure modes** that are mostly **adjacency walks + opacity** on top of
> the finished renderer — they don't need the layout engine at all. Two risks travel
> with you into Phase 1: **performance at scale is unmeasured** and **focus/path are
> unbuilt**. Don't reopen the renderer technology decisions — they're settled.

---

## 1. As-built ↔ PRD Native Pipeline

The planning doc (`architecture-decisions-renderer.md`) drew this target pipeline. Here
is what now implements each box:

| PRD pipeline box | As-built module | Status |
|---|---|---|
| Parser Adapter (`mermaid.parse → AST`) | `parser-adapter.ts` | ✅ Done — clean parser-only boundary |
| AST Normalizer → Internal IR | `parser-adapter.ts` + `types.ts` | ✅ Done — the IR is the model |
| Layout Engine (dagre) | `layout.ts` + `recursive-layout.ts` + `layout-core.ts` | ✅ Done — Mermaid-faithful, both engines |
| Render Model Builder (coords, curveBasis) | `cluster-bbox.ts` + `renderer.ts` curve builders | ✅ Done |
| SVG Renderer (data-* hooks, partial update) | `renderer.ts` | ✅ Done — `__meta`, live updates |
| Interaction: **Collapse Engine** | `effective-ir.ts` + `collapse.ts` | ✅ Prototyped |
| Interaction: **Drag** (Strategy 1) | `drag.ts` | ✅ Done |
| Interaction: Pan/Zoom | `pan.ts` | ✅ Done |
| Interaction: **Depth Engine** | — | ⬜ Not built |
| Interaction: **Focus Engine** | — | ⬜ Not built |
| Interaction: **Path Engine** (BFS over IR) | — | ⬜ Not built |
| Command Palette (fuzzy over IR labels) | — | ⬜ Not built |
| Minimap (shadow render) | — | ⬜ Not built |
| elkjs "Adaptive" layout | — | ⬜ Not built (deferred; pluggable by design) |
| Mermaid **viewer fallback** (non-flowchart) | — | ⬜ Not built (Renderer Router is the seam) |

Everything green is reusable **as-is**. The layout engine is the asset that justified
the spike.

---

## 2. What the spike is *not* yet (the scaffolding gap)

The spike is a **static HTML harness**: `index.html` with a fixture dropdown, two
iframes, a Vite dev server. The product needs things the harness deliberately skipped:

- **Markdown-native workspace** — source editor + rendered Markdown + the canvas,
  live-syncing. None of this exists; the spike loads a single `.mmd` file.
- **Backend persistence + short URLs** — PRD Phase-1 step 2. Nothing here touches a
  server.
- **Framework & state** — the spike is framework-less plain TS mutating the SVG DOM. The
  PRD leaves front-end framework, state management, build tooling, hosting, and the final
  workspace pane-count **open to the architecture phase**. The engine doesn't impose a
  choice — it's a pure `IR → SVG` function plus DOM-event handlers, embeddable under any
  framework, but the integration is real work.
- **Renderer Router** — the dispatch that sends flowcharts to this pipeline and other
  Mermaid types to a viewer-only fallback. The seam is named in the PRD; it isn't coded.

> Practical implication: promote `spike6/src/` into the product as a **layout/render
> package** with a small, deliberate public API (roughly `parseToIR`, `layout`,
> `renderFull`, `attachDrag`, `deriveEffectiveIR`) and wrap *that* in the chosen
> framework — rather than building the app around the harness's globals.

---

## 3. The disclosure family — the build plan

This is the product thesis and the encouraging part: **two of the three missing modes
are pure overlays** over the finished renderer, using adjacency the engine already
exposes. Build cheapest-first (the PRD's locked order):

### 3a. Depth slider (cheapest — it's collapse, driven by a number)
`effective-ir.ts` already collapses an **arbitrary set** of clusters. A depth slider is
just: compute each subgraph's nesting depth, set `collapsed = (depth >= N)`, call
`rerenderWithCollapse()`. No new layout or render code — it drives the existing
collapse path. Start here.

### 3b. Focus mode (no layout change at all)
Click a node → fade everything not connected to it. This is a **visual overlay**, not a
re-layout: BFS over IR adjacency (the renderer already builds
`__meta.adjacency: nodeId → edgeKey[]` and `__meta.edgeMap`), then set opacity on the
nodes/edges outside the connected set. No `layout()` call. The PRD flags focus as novel
UX — but the *mechanism* is small against this substrate.

### 3c. Path mode (BFS + highlight)
Click two nodes → highlight the path between them. Again a visual overlay: build an
adjacency map from `ir.edges`, BFS/shortest-path between the two ids, set a highlight
class on the path's nodes/edges, dim the rest. The PRD's pre-approved fallback ships the
family as 3 modes (collapse + depth + focus) and adds path as a fast-follow if it proves
hard — but the adjacency it needs is trivially available.

> The reusable insight: **focus and path never touch the layout engine.** They are
> adjacency queries over the IR plus attribute mutation on the SVG. The expensive,
> novel work (Mermaid-faithful layout) is already paid for.

---

## 4. The two risks you carry into Phase 1

From `SPIKE6_COMPLETE.md` §6 — restated because they shape the first sprints:

1. **Performance is unmeasured.** Every spike fixture is small. The recursive engine
   re-runs dagre per cluster level and `computeClusterBboxes` rebuilds maps per call —
   unprofiled past ~20 nodes. **Land 200/500/1000-node fixtures and frame-time
   instrumentation alongside the first disclosure mode, not after.** The PRD makes
   ≤16ms@200 a release gate.
2. **Focus & path are unbuilt** — and they're the comprehension thesis. The spike
   de-risked the substrate, not the product. Treat the §3 plan as real Phase-1 work with
   real UX risk, even though the plumbing is small.

---

## 5. Settled — do not reopen

These are empirically validated now, not provisional. Reopening them re-litigates closed
questions:

- **D1 SVG**, **D2 parser-only + dagre + d3-shape**, **D5 pin-and-recalculate drag** —
  all proven (see `SPIKE6_COMPLETE.md` §2).
- The **Mermaid `graph.children()` ordering** and the **`fromCluster`/`toCluster`
  invariant** — these are correct; don't "simplify" them away (see [05](05-invariants-and-parity.md)).

Still genuinely open (architecture phase): framework, state, hosting, backend stack,
workspace pane-count, elkjs-as-default, sequence-diagram graduation timing.

---

## 6. A concrete first move

If you're the next agent starting Phase 1, a sensible first PR sequence:

1. **Extract `spike6/src/` into a `@mermaidweb/render` package** with the small public
   API in §2 and a thin demo that reproduces `our-renderer.html`. No behaviour change —
   this is the seam that lets the app consume the engine cleanly.
2. **Add the perf harness**: 200/500/1000-node generated fixtures + a frame-time probe
   around `layout()` and `renderFull()`. Establish the baseline the PRD gate measures.
3. **Ship the depth slider** (§3a) as the first new disclosure mode — lowest risk,
   exercises the collapse path end-to-end through the package API.
4. **Then** backend skeleton (PRD step 2) and focus/path in parallel.

Read order for getting up to speed: [README](README.md) → [01](01-data-pipeline.md) →
[02](02-layout-engine.md) → [05](05-invariants-and-parity.md) (so you don't break
parity) → the rest as needed.

---

*Back to the [architecture index](README.md). Spike closure & risk register:*
[`spike6/SPIKE6_COMPLETE.md`](../../spike6/SPIKE6_COMPLETE.md).

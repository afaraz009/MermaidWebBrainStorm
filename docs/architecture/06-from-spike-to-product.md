# 06 — From Spike to Product

[← architecture index](README.md)

> **TL;DR.** `spike6/src/` *is* the PRD's "Native Pipeline" — every box in the
> planning-stage architecture diagram now has a real module behind it. The layout
> engine (the hard, novel part) is built and Mermaid-faithful. What's left is
> **product scaffolding the spike never had** (Markdown workspace, backend, framework)
> and **three disclosure modes** that are mostly **adjacency walks + opacity** on top of
> the finished renderer — they don't need the layout engine at all. Two risks travel
> with you into Phase 1: **performance at scale is unmeasured** and the **comprehension
> thesis is unvalidated** (all four disclosure modes are now built on the harness, but
> not yet proven with users). Don't reopen the renderer technology decisions — settled.

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
| Interaction: **Collapse Engine** | `effective-ir.ts` + `collapse.ts` | ✅ Built |
| Interaction: **Drag** (Strategy 1) | `drag.ts` | ✅ Done |
| Interaction: Pan/Zoom | `pan.ts` | ✅ Done |
| Interaction: **Depth Engine** | `depth.ts` + slider | ✅ Built (on harness) |
| Interaction: **Focus Engine** | `focus.ts` + `disclosure-overlay.ts` | ✅ Built (on harness) |
| Interaction: **Path Engine** (all directed routes) | `path.ts` + `disclosure-overlay.ts` | ✅ Built (on harness) |
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

## 3. The disclosure family — as built

All four modes are implemented on the harness (`spike6/`), built stepwise via the
`SPEC.md` handoff. The bet held: **focus and path turned out to be pure overlays** —
adjacency queries over the IR plus SVG-attribute mutation, no layout involvement. How
each works (full detail in [04 §2A](04-interaction-and-routing.md)):

- **Collapse / expand** (`collapse.ts` + `effective-ir.ts`) — click a cluster to fold it
  to a surrogate; re-runs `layout()` on the derived IR.
- **Depth slider** (`depth.ts`) — folds the diagram by nesting depth
  (`collapsed = depth > N`, `N` from `0…maxDepth`) by driving the same collapse path. No
  new layout code.
- **Focus** (`focus.ts`) — click a node → emphasise its 1-hop neighbourhood, dim the rest.
  Pure class mutation, no relayout.
- **Path** (`path.ts`) — click two nodes → light **every directed route** between them
  (reachability intersection — all parallel branches, not one shortest path), dim the rest.
- **Shared primitive** (`disclosure-overlay.ts` + `disclosureSettings.ts`) — logical-endpoint
  adjacency + tri-state emphasis + the mode manager. A whole-cluster connection makes the
  cluster a **lit-container waypoint** on the route.

> The insight held: **focus and path never touch the layout engine.** They are adjacency
> queries over the IR plus attribute mutation on the SVG. The expensive, novel work
> (Mermaid-faithful layout) was already paid for. **Next:** port these onto the product
> package unchanged (§6) and run the thesis-validation pass.

---

## 4. The two risks you carry into Phase 1

From `SPIKE6_COMPLETE.md` §6 — restated because they shape the first sprints:

1. **Performance is unmeasured.** Every spike fixture is small. The recursive engine
   re-runs dagre per cluster level and `computeClusterBboxes` rebuilds maps per call —
   unprofiled past ~20 nodes. **Land 200/500/1000-node fixtures and frame-time
   instrumentation alongside the first disclosure mode, not after.** The PRD makes
   ≤16ms@200 a release gate.
2. **The thesis is unvalidated.** All four modes are now built (§3), but whether the
   disclosure family produces the "aha" on real diagrams is still unproven — that's the
   comprehension thesis and the real product risk. The spike de-risked the substrate and
   the modes de-risked the mechanism; **user validation (the 5–10-friend pass) is the next
   gate.**

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
3. **Port the disclosure family** (collapse/depth/focus/path — already built on the harness,
   §3) onto the package API, behaviour unchanged.
4. **Then** backend skeleton (PRD step 2).

Read order for getting up to speed: [README](README.md) → [01](01-data-pipeline.md) →
[02](02-layout-engine.md) → [05](05-invariants-and-parity.md) (so you don't break
parity) → the rest as needed.

---

*Back to the [architecture index](README.md). Spike closure & risk register:*
[`spike6/SPIKE6_COMPLETE.md`](../../spike6/SPIKE6_COMPLETE.md).

# Disclosure Family — Spec

**Status:** living document, updated as design decisions are made
**Owner:** the design/brainstorming agent (the architecture session). Build agent MUST NOT modify this file.
**Build history:** lives in `BUILD_LOG.md` (build agent owns that file).
**Output location:** `spike6/` — new modules in `spike6/src/`, UI wiring in `spike6/our-renderer.html`.

> **Read first:** the as-built architecture is documented in
> [`docs/architecture/`](docs/architecture/README.md). The most relevant docs for
> this build are **01 (data pipeline / IR)**, **03 (rendering & edges)**, **04
> (interaction)**, and **05 (invariants — do not break these)**. Spike status:
> [`spike6/SPIKE6_COMPLETE.md`](spike6/SPIKE6_COMPLETE.md).

---

## 1. What we're building

The **progressive-disclosure interaction family** — **depth slider**, **focus mode**,
and **path mode** — layered on the spike6 flowchart renderer (the proven
parser-only → dagre → d3-shape → SVG engine). **Collapse/expand already exists**
(`effective-ir.ts` + `collapse.ts`); this completes the four-mode family the PRD's
comprehension thesis rests on.

**Why on the harness:** to validate the thesis — does peeling a large diagram back to
the slice you care about produce the "aha"? — at the cheapest possible cost, on the
already-proven renderer, before any product scaffolding (no framework/backend yet).

**Success:** each mode works smoothly across the 24 fixtures; **zero layout/parity
regressions** (the layout engine and parser are untouched); and the new code is
**product-portable** — pure IR-walk + SVG-attribute logic, framework-agnostic, so it
moves into the real app's render package later largely unchanged.

---

## 2. Decisions (locked)

**Substrate / boundaries**
- Build in `spike6/`: new modules in `spike6/src/`, wired into the `our-renderer.html`
  toolbar. Plain TypeScript (ESM), no framework, no backend.
- **Do NOT modify** the layout engine (`layout.ts`, `recursive-layout.ts`,
  `layout-core.ts`, `cluster-bbox.ts`), the parser (`parser-adapter.ts`), or any
  parity code. This is the load-bearing rule — see `docs/architecture/05`.
- Reuse the single `layout()` entry, `effective-ir.ts`, `renderer.ts`, and the
  `mountEl.__meta` object. Match the existing module style: `attach*(svg, …)` returning
  a detach fn via `AbortController` (see `drag.ts` / `collapse.ts`).

**Modes are mutually exclusive interaction states**
- A small **mode manager** governs three states: `default` (collapse/drag as today),
  `focus`, `path`. Toolbar buttons toggle Focus and Path (`.btn`, `.on` when active).
- Entering focus/path changes how a **node click** is interpreted (select, not collapse).
- **Esc** and **clicking empty canvas** clear focus/path back to `default`.
- **Any full re-render** (fixture switch, collapse, drag-drop, reset) **clears overlay
  state** — overlays are visual-only and must not survive a DOM rebuild.

**Depth slider** (Step 1)
- Drives `sg.collapsed` from nesting depth, then calls the existing
  `rerenderWithCollapse()`. **No new layout or render code** — it reuses the collapse
  machinery. Semantics: "show down to depth N, collapse deeper" → for every subgraph,
  `collapsed = (depth > N)`.

**Focus & path are PURE OVERLAYS**
- They set **opacity / highlight via attribute mutation** on the *existing* SVG. They
  **MUST NOT** call `layout()` or trigger a re-render — **no node moves**. (See
  `docs/architecture/04 §3`: focus/path never touch the layout engine.)
- Dimmed = opacity `0.1`; active = full opacity; path highlight = stroke emphasis
  consistent with the existing hover color `#4a6cf7`.

**Shared overlay primitive** (built in Step 2, reused by Step 3)
- **Adjacency builder** (undirected) over the *effective* IR's edges →
  `Map<nodeId, Set<nodeId>>` plus `nodeId → edgeKey[]`. Prefer reusing
  `__meta.adjacency`/`__meta.edgeMap` if convenient; otherwise build from `ir.edges`.
  Surrogate (collapsed-cluster) nodes count as ordinary nodes.
- **Emphasize/dim API**: given a set of active node ids + active edge keys, dim the rest
  (`.disclosure-dim`) and mark active (`.disclosure-active`); a `clear()` restores. Operates
  on the live SVG via the existing `data-node-id` / `data-edge-key` attributes.

**Focus behaviour** (Step 2)
- In focus mode, click a node → neighborhood = the node + its **1-hop** neighbors + the
  connecting edges → dim everything else. Keep hop-count a single constant (1) but
  structure it so bumping/configuring it later is trivial. Clicking another node
  re-focuses; Esc clears.

**Path behaviour** (Step 3)
- In path mode, click node A then node B → **shortest path** over undirected adjacency
  (BFS) → highlight path nodes + edges, dim the rest. No path → brief no-op/indicator.
  Esc, or a third click, resets the selection.

**Click-vs-drag**
- In focus/path mode a node press that stays within the click threshold = select; a real
  drag still drags (reuse the `CLICK_THRESHOLD_PX` pattern from `collapse.ts`). Left-click
  collapse-on-subgraph is suppressed while in focus/path mode.

**Build health**
- `cd spike6 && ./node_modules/.bin/tsc --noEmit` stays silent; `npx vite build` passes.

---

## 3. Open design questions

The build agent should **not** act on these beyond the stated default; flag in
BUILD_LOG if a step forces the issue.

- **Focus hop-count:** 1-hop vs full connected-component vs configurable. **Default: 1-hop.**
- **Depth slider vs manual collapse sync:** should the slider re-sync when the user
  manually collapses/expands a cluster? **Default: no** — the slider writes flags; manual
  collapse may diverge; document as a known limitation, don't over-engineer.
- **Friends-beta surface:** the harness toolbar is cluttered with A* debug controls. A
  stripped viewer page may be wanted later — **out of scope for now**, noted for the design
  session.

---

## 4. Visual / technical style

- TypeScript ESM, no framework; direct SVG-DOM mutation. New modules mirror
  `drag.ts`/`collapse.ts`: an `attach*` that wires delegated listeners under an
  `AbortController` and returns a detach fn; re-attached by `entry.ts reattach()`.
- CSS lives in the `our-renderer.html` `<style>` block. Add: `.disclosure-dim {opacity:.1}`,
  `.disclosure-active {}`, `.path-highlight {}` (stroke emphasis ~`#4a6cf7`). A short opacity
  transition is fine (cheap); no elaborate animation.
- Toolbar additions go in `our-renderer.html .controls` / a panel: a **Depth** range input
  + value label (mirror the existing `#cfgCellSize` slider markup), and **Focus**/**Path**
  toggle buttons styled like the existing `.btn`.
- Wiring goes in `entry.ts` alongside the existing button handlers; keep the two-IR dance
  intact (`ir` source of truth, `currentEff` derived — see `docs/architecture/01 §4`).

---

## 5. Out of scope

- **No** changes to: layout engine, parser, `recursive-layout`/`layout-core`/`cluster-bbox`,
  or any parity code. No re-baselining of fixtures.
- **No** backend, Markdown workspace, editor, framework, command palette, or minimap.
- **No** changes to `index.html` (the parity split view) or `mermaid-debug.html`.
- **No** entanglement with the A* routing code — leave it as-is.
- **Do not** edit `docs/architecture/**`, `SPIKE6_COMPLETE.md`, or this `SPEC.md`.
- No performance-at-scale work this round (separate risk, separate phase).

---

## 6. Build scope — current phase: **STEP 1 — Depth slider only**

Deliver **only** the depth slider this round. Do **not** build focus, path, or the
overlay primitive yet.

1. **Depth utility** — compute each subgraph's nesting depth from `ir.subgraphs` parent
   chains (root subgraphs = depth 1, each nesting level +1). Put it in a small new module
   (e.g. `spike6/src/depth.ts`) or alongside existing helpers — your call, keep it pure.
2. **Toolbar control** — add a range input `#cfgDepth` (min 1, max = the graph's max
   depth, default = max so nothing is collapsed initially) + a value label, in
   `our-renderer.html`. Mirror the `#cfgCellSize` markup/styling. The max should be set
   from the loaded fixture's actual max depth on load.
3. **Wiring** (`entry.ts`) — on slider `input`/`change`, set
   `sg.collapsed = (depthOf(sg) > N)` for every subgraph, then call
   `rerenderWithCollapse()`. Threshold semantics: depth ≤ N visible, deeper collapsed;
   at max → no collapses, at 1 → everything folds to top-level surrogates.
4. **Coexistence** — Collapse All / Expand All / manual collapse must still work. Don't
   attempt perfect slider↔manual sync (see §3); note the limitation in BUILD_LOG.
5. **Verify** — exercise on `fixture_nested`, `fixture_cyclic_nested_3`, and
   `fixture_deep_5level` (deepest nesting). `tsc --noEmit` clean; `vite build` passes.
6. **Log** — append a BUILD_LOG entry: what was built, files touched, any assumptions
   where the spec was ambiguous, and open questions for the design agent.

**Definition of done (Step 1):** dragging the depth slider folds/unfolds the diagram by
nesting level using the existing collapse path, with no layout/parity changes and a clean
type-check.

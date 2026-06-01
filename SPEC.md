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

**Depth slider** (Step 1, refined in 1.1)
- Drives `sg.collapsed` from nesting depth, then calls the existing
  `rerenderWithCollapse()`. **No new layout or render code** — it reuses the collapse
  machinery.
- **Range `0 … maxDepth`, default `maxDepth`** (fully expanded on load). Formula
  `collapsed = (depthOf(sg) > N)`. Reading: "reveal N levels of nesting."
  - `N = maxDepth` → nothing collapsed.
  - `N = 1` → only top-level clusters open; deeper levels folded to surrogates.
  - `N = 0` → **every** cluster folded to a top-level surrogate — including
    single-level / top-level clusters (e.g. `authentication`, `payment_system` in
    `fixture.mmd`). This is the case the original `min = 1` could not reach.
- **Enabled whenever the graph has ≥ 1 subgraph** (`maxDepth ≥ 1`). Disabled only when
  there are no subgraphs at all (`maxDepth = 0`), where there is nothing to fold.

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
  collapse may diverge; document as a known limitation, don't over-engineer. _(Confirmed
  after Step 1: keep no-sync; the Step-2 mode manager will NOT reset the slider. Revisit
  only if it confuses beta users.)_
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

## 6. Build scope — current phase: **STEP 1.1 — Depth slider: reach single-level clusters**

Step 1 (the depth slider) is built and verified. This round is a small refinement so the
slider can also collapse **top-level / single-level clusters**. On fixtures like
`fixture.mmd` and `fixture_crosscluster` every cluster is depth 1, so the original
`min = 1` left the slider disabled and those clusters uncollapsible. Change **only** the
depth slider; do **not** start focus / path / overlay work.

1. **Range** — change the `#cfgDepth` slider `min` from `1` to **`0`**. Keep
   `max = maxDepth(ir)` and `default = max`. Keep the formula
   `collapsed = (depthOf(sg) > N)`. (Full locked semantics in §2 "Depth slider".)
2. **Enable condition** — enable the slider whenever `maxDepth(ir) >= 1` (graph has at
   least one subgraph). Disable ONLY when `maxDepth(ir) === 0` (no subgraphs). This
   replaces Step 1's "disable when max ≤ 1".
3. **Label** — the value label shows the current `N` (`0 … maxDepth`). At `N = 0` the
   whole diagram folds to top-level surrogates; at `N = maxDepth` it is fully expanded.
4. **Verify** — on `fixture.mmd` and `fixture_crosscluster` (single-level clusters:
   confirm `N = 0` collapses `authentication` / `payment_system` / etc. to surrogates and
   `N = 1` restores them), plus `fixture_nested` and `fixture_deep_5level` (multi-level
   still steps cleanly). `tsc --noEmit` clean; `vite build` passes.
5. **Log** — append a BUILD_LOG entry; note any assumptions/questions.

**Definition of done (1.1):** the depth slider is enabled on any clustered graph and, at
its low end (`N = 0`), folds even single-level top-level clusters into surrogates, with no
layout / parity changes and a clean type-check.

> **Resolutions for the Step-1 open questions** (so the build agent has context without
> reading BUILD_LOG):
> - **OQ1** (prose vs formula) — RESOLVED: adopt `min = 0` with the existing `> N`
>   formula (this round). §2 and the prose are now consistent.
> - **OQ2** (max derived on load only) — CONFIRMED correct: `our-renderer.html` selects
>   the fixture by URL param with no in-page switcher, and no later step needs the max
>   re-derived without a reload.
> - **OQ3** (slider vs manual-collapse drift) — CONFIRMED: keep the no-sync default (§3);
>   the Step-2 mode manager will not reset the slider.
> - **Assumption 1** (wire `input` only, not `change`) — ACCEPTED, keep as built.
> - **Assumption 2** (dedicated `#depthPanel`) — ACCEPTED, keep as built.
> - **Assumption 3** (disable when max ≤ 1) — SUPERSEDED by item 2 above.

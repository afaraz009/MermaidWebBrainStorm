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

**Click-vs-drag, pinning, mode persistence**
- In focus/path mode a node press that stays within the click threshold = select; a real
  drag still drags (reuse the `CLICK_THRESHOLD_PX` pattern from `collapse.ts`). Left-click
  collapse-on-subgraph is suppressed while in focus/path mode.
- A **select-click never pins** the node — pin only on an actual move. (A zero-distance
  click that pins would force the flat layout engine on the next `layout()`, silently
  degrading recursive parity when focus/path is combined with the depth slider.)
- A disclosure mode (focus/path) **persists across re-renders** (button stays lit) while
  the emphasis clears with the rebuilt DOM — re-click to re-emphasize.
- In focus/path mode, clicking a **surrogate** treats it as an ordinary node
  (focus/select it), not expand.
- Focus and Path are **mutually exclusive**: both toggles write the single
  `disclosureSettings.mode`; entering one clears the other's emphasis and button highlight.

**Cluster-anchored edges & cluster waypoints**
- Path and focus build adjacency from **logical endpoints** — `fromCluster ?? from` and
  `toCluster ?? to` on the *effective* IR — so an edge that connects to a whole cluster
  (e.g. `source --> Processing` in `fixture_rl_chain`) makes the (expanded) cluster a
  first-class **waypoint** on the route, not an arbitrary representative leaf.
- A cluster that is a waypoint renders as a **lit container**: its border accented, its
  contents at NORMAL visibility, everything off-route dimmed. Tri-state per element:
  **active** (on route) / **neutral** (inside an on-route cluster, or a cluster that
  contains the route) / **dimmed** (off route).
- A **collapsed** cluster is already a surrogate node in the effective IR — it participates
  as an ordinary node; no special handling.

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

## 6. Build scope — current phase: **STEP 3.2 — Path/focus through whole clusters (lit container)**

Path mode (3.1) lights all routes correctly when both endpoints are **leaves**. But an edge
that connects to a **whole cluster** is stored against a rewritten representative leaf, with
the real cluster id in `fromCluster`/`toCluster`. So a route like `source → Processing →
sink` (`fixture_rl_chain`) or `request → API_Layer → response` (`fixture_cyclic_nested_2`)
currently threads through an arbitrary internal leaf instead of treating the cluster as the
waypoint.

Fix: build the route graph from **logical endpoints** so the (expanded) cluster becomes a
waypoint, and render an on-route cluster as a **lit container** (locked in §2
"Cluster-anchored edges & cluster waypoints"). This also improves focus (same primitive).

### 1. Adjacency on logical endpoints — `disclosure-overlay.ts buildAdjacency`
- For each effective edge use `lf = e.fromCluster ?? e.from` and `lt = e.toCluster ?? e.to`
  as the graph endpoints when building `out`, `in`, and `neighbors`. Leaf↔leaf edges are
  unchanged; only whole-cluster edges now point at the cluster id, so cluster ids appear as
  graph nodes. `e.id` stays the edge key for emphasis.

### 2. Reachability may include cluster ids — `path.ts` / `focus.ts`
- Path: unchanged 3.1 algorithm, now over the logical graph — `pathNodes = reachFromS ∩
  reachToT` (may include cluster ids); `pathEdges = e.id` for every effective edge with
  `lf ∈ reachFromS && lt ∈ reachToT`. Pass both to `setEmphasis`.
- Focus: neighbours now come from the logical `neighbors`, so a node wired to a cluster
  focuses the cluster. No other change.

### 3. Tri-state emphasis with cluster awareness — `setEmphasis`
- Change signature to take the effective IR: `setEmphasis(svg, ir, activeNodeIds,
  activeEdgeKeys)`. `activeNodeIds` may contain leaf **and** cluster ids. Implement as three
  passes:
  1. **Dim all** — add `.disclosure-dim` to every `[data-node-id]`, `[data-edge-key]`,
     `[data-subgraph-id]`.
  2. **Un-dim the neutral set** (remove `.disclosure-dim`, no accent):
     - every leaf that is a **descendant of an active cluster**;
     - every edge whose BOTH logical endpoints are descendants of the **same** active
       cluster (an internal edge of an on-route cluster);
     - every cluster that is a **descendant of an active cluster** OR an **ancestor of any
       active element** (the containing boxes of the route stay visible).
  3. **Accent the active set** (remove `.disclosure-dim`, add `.disclosure-active`): active
     `[data-node-id]` leaves, active `[data-edge-key]` edges, active `[data-subgraph-id]`
     clusters.
- `clearEmphasis` clears all three element types (incl. `[data-subgraph-id]`).
- Containment (descendants/ancestors) comes from `ir.subgraphs`; compute once per call. Keep
  the primitive pure: DOM + read-only `ir` in, classes out.

### CSS (add to `our-renderer.html <style>`)
- Active cluster border: `[data-subgraph-id].disclosure-active > rect { stroke:#4a6cf7;
  stroke-width:2.5; }`.
- Confirm `.disclosure-dim` (opacity 0.1) reads acceptably on `[data-subgraph-id]` groups;
  soften the selector if a dimmed cluster rect looks harsh.

### Constraints
- Pure SVG-class mutation; `ir` is read-only. No `layout()`/`renderFull`/`rerenderWithCollapse`;
  no layout/parser/parity/cluster-bbox changes.

### Verify
- `fixture_rl_chain`: Path → `source` then `sink` → route lights and **`Processing` shows as
  a lit container** (border accented, internals at normal visibility), off-route dimmed.
- `fixture_cyclic_nested_2`: `request` then `response` → `API_Layer` lights as the connecting
  container.
- 3.1 leaf↔leaf cases (`fixture.mmd` both-branches) still correct; focus still works; a
  collapsed cluster on a route lights as a single surrogate node. `tsc --noEmit` clean;
  `vite build` passes.

### Log
- Append a BUILD_LOG entry: what changed, files touched, assumptions, open questions.

**Definition of done (3.2):** two leaves connected through a cluster light the cluster as a
waypoint (lit container) with the off-route graph dimmed; leaf↔leaf routes and focus
unchanged; no relayout; type-check clean.

> **Known limitation (note, do NOT build):** selecting a node that lives *inside* such a
> cluster as a path endpoint is not specially handled — the cluster waypoint and its
> internal leaves are distinct graph nodes (no containment bridging). Flag if it comes up;
> out of scope this round.

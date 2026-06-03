# Story 1.2: Extract the render engine into `@mermaidweb/render` behind a DiagramController

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a founder-engineer,
I want the spike6 engine extracted into a framework-agnostic `@mermaidweb/render` package behind a `DiagramController` facade with no behavior change,
so that the validated engine is reusable under React without React ever reconciling its SVG.

## Acceptance Criteria

1. **Migration + public API (AR2).**
   **Given** `spike6/src/`
   **When** it is migrated into `packages/render/src` (git history preserved)
   **Then** the public API barrel exposes `parseToIR`, `layout`, `renderFull`, `attachDrag`, `deriveEffectiveIR`, and a `DiagramController` facade with `mount`/`destroy`/`setSource`, commands (`focus`/`path`/`collapse`/`expand`/`setDepth`/`panTo`/`resetLayout`/`setTheme`/`export`), and events (`viewStateChange`/`select`/`parseError`/`ready`).

2. **No behavior change + no app coupling.**
   **Given** the extracted engine
   **When** the existing harness and fixtures run
   **Then** behavior is identical to spike6 (no behavior change)
   **And** the engine imports nothing app-side (no React, Supabase, or store imports).

3. **Engine conventions preserved (AR11).**
   **Given** engine conventions
   **When** the code is reviewed
   **Then** kebab-case modules, camelCase IR fields, PascalCase types, `data-node-id`/`data-subgraph-id` hooks, `L_<index>` edge identity, and node `(x,y)` = center are all preserved, and the `docs/architecture/05` invariants (`fromCluster`/`toCluster`, `graph.children()` order, edge-id identity) are unchanged.

4. **Single versioned ViewState schema (AR5).**
   **Given** the shared package
   **When** the engine's `ViewState` type is defined
   **Then** `packages/shared` holds the single, versioned `view_state` Zod schema the engine consumes, with no duplicate validators elsewhere.

## Tasks / Subtasks

- [ ] **Task 1 — Migrate `spike6/src/` → `packages/render/src/` with git history preserved (AC: #1, #2, #3)**
  - [ ] Use `git mv` per file (rename detection preserves blame/history per AR2) to move all 28 modules from `spike6/src/` into `packages/render/src/`. Commit the move **separately** from any edits so history stays clean. (`spike6/src` on `main` already includes the merged `recursive-layout` work — migrate as-is.)
  - [ ] Classify each module:
    - **Library (stays in `src/`, behavior unchanged):** `types.ts`, `parser-adapter.ts`, `effective-ir.ts`, `layout.ts`, `recursive-layout.ts`, `layout-core.ts`, `cluster-bbox.ts`, `renderer.ts`, `border.ts`, `drag.ts`, `pan.ts`, `connect.ts`, `collapse.ts`, `depth.ts`, `focus.ts`, `path.ts`, `disclosure-overlay.ts`, `disclosureSettings.ts`, `routing.ts`, `astar.ts`, `astarSettings.ts`, `edgeSettings.ts`.
    - **Harness/demo chrome (move to `packages/render/demo/`, NOT in the library barrel):** `entry.ts`, `entry-editor.ts`, `contextMenu.ts`, `contextMenuWiring.ts`, `menuActions.ts`, `gridOverlay.ts`. These are the spike's static-HTML UI; the controller (Task 3) replaces their bootstrap role. Decide per-module; the principle: the library exposes the *engine*, the demo keeps the *harness chrome*.
  - [ ] Move the HTML harness pages (`index.html`, `our-renderer.html`, `mermaid-debug.html`, `editor.html`) + `vite.config.ts` into `packages/render/demo/` so the demo reproduces `our-renderer.html` (AC #2 "harness runs").
  - [ ] Add `packages/render` real `package.json` deps: `mermaid` (parser-only — **pin the version**; `parseToIR` uses Mermaid's non-public `getDiagramFromText`, which is version-fragile and a locked/accepted coupling — do NOT refactor it), `@dagrejs/dagre`, `d3-shape`, `d3-path`. (Replaces the 1.1 shell.)
  - [ ] **Preserve filenames during the move.** Migrate every module under its current name, including the camelCase modules (`disclosureSettings.ts`, `astarSettings.ts`, `edgeSettings.ts`, `contextMenu.ts`, `contextMenuWiring.ts`, `menuActions.ts`, `gridOverlay.ts`), so `git mv` keeps history and imports intact (Rule 0: don't rename existing conventions). Kebab-case applies to the net-new files (`controller.ts`, `index.ts`, `view-state.ts`); normalizing the camelCase names is an optional follow-up, not part of this story.
  - [ ] **Guardrail:** this is a *move + wrap*, not a rewrite. Do not "simplify," rename, or refactor engine internals — AC #2/#3 require byte-behavior parity. The only net-new code is the barrel, the controller, and the shared ViewState schema.

- [ ] **Task 2 — Public API barrel `src/index.ts` (AC: #1)**
  - [ ] Export the named pipeline functions verbatim (verified current signatures):
    - `parseToIR(source: string): Promise<IR>` ← **async**, the parser boundary
    - `layout(ir: IR): IR` ← mutates in place; selective recursion gate (recursive when subgraphs present & nothing pinned, else flat)
    - `renderFull(ir: IR, mountEl: SVGElement, interactive?: boolean, originalIR?: IR): void`
    - `attachDrag(svg: SVGSVGElement, ir: IR, mountEl: SVGElement): () => void` ← returns a detach fn
    - `deriveEffectiveIR(ir: IR): IR` ← collapse-aware view; pure (input unchanged)
  - [ ] Export `DiagramController` (Task 3) and the public types from `types.ts` (`IR`, `IRNode`, `IREdge`, `NodeShape`, etc., all **PascalCase**, camelCase fields).
  - [ ] Keep disclosure modules (`collapse`/`depth`/`focus`/`path`/`disclosure-overlay`) consumed **internally** by the controller; re-export only if a consumer needs them directly (the architecture barrel names the 5 functions + controller as the surface).

- [ ] **Task 3 — `src/controller.ts` — the `DiagramController` facade (AC: #1, #2)**
  - [ ] **`mount(el: HTMLElement | SVGElement, options?: { source?: string; viewState?: ViewState })`** sets up the SVG subtree the controller owns. When `options.source` is provided it renders immediately via the bootstrap below; when omitted, the controller mounts empty and waits for the first `setSource`. This is the **initial-source path** (no globals; the app passes source in).
  - [ ] **`setSource(source: string)`** is the (re-)parse-and-render entry point — the verified `entry.ts` bootstrap, parameterized by source instead of a fixture fetch:
    `parseToIR(source)` (await — it is async) → set as source-of-truth `ir` (holds `collapsed` flags) → `deriveEffectiveIR(ir)` → `currentEff` → `layout(currentEff)` → sync positions back → `renderFull(currentEff, svg, true, ir)` → (re)attach `pan` + `drag` + collapse/focus/path listeners. **Re-apply the current `ViewState`** and **silently drop orphaned node/fence IDs** (collapse flags / pins that no longer resolve), then emit `ready` (first render) / `viewStateChange`. On parse failure, emit `parseError` and keep the last-good render — do not throw. `mount` with an initial `source` simply calls this once. (The deeper *live-edit* hardening of view_state reconciliation against an evolving source is exercised in Story 2.1/AR6; the **mechanism** lives here.)
  - [ ] **`destroy()`** calls every detach fn (drag/collapse/pan/focus/path are AbortController-scoped `() => void` returns) and clears the subtree — no leaks. Hold `ir`/`currentEff`/adjacency as **controller state** (see `__meta` note in Dev Notes) so `setSource` and the commands can read them.
  - [ ] **Commands → wire to EXISTING engine functions (behavior-preserving):**
    - `collapse(id)`/`expand(id)` → set `sg.collapsed` → the `deriveEffectiveIR → layout → renderFull` re-render cycle (verified `rerenderWithCollapse`).
    - `setDepth(n)` → drive collapse flags via `computeDepths`/`maxDepth` (depth slider logic; no new layout).
    - `focus(nodeId)` / `path(a, b)` → `attachFocus`/`attachPath` overlay logic (pure adjacency + `setEmphasis`; **no relayout** — keep this property).
    - `panTo(...)` / `resetLayout()` → existing pan + reset (resetLayout re-runs `layout()` to fully-expanded default).
  - [ ] **Events → NET-NEW emitter layer (the engine has NO events today):** add a small typed event emitter and emit:
    - `ready` after first successful render.
    - `parseError` by wrapping `parseToIR` in try/catch (today `entry-editor.ts` catches and writes to a DOM bar — replace that with an emitted event; keep last-good render).
    - `viewStateChange` on collapse/expand/depth/pin(drag-drop) — emit the current `ViewState` (Task 4 shape).
    - `select` on node click/hover — **net-new**, layered over the existing `[data-node-id]` DOM (the engine has no selection model today). Basic click→select is enough here; full consumption is Story 1.4.
  - [ ] **`setTheme(theme)` and `export(format)` are NET-NEW seams (no existing engine code; colors are hardcoded in `renderer.ts`):** expose them on the facade with correct signatures, but implement **minimally** in this story — `export('svg')` may serialize the current SVG subtree (the renderer already produces SVG, so this is near-free); `setTheme` may be a documented no-op/CSS-var stub. **Full theming (AR13) and full SVG-export-with-collapse-state (FR29) are Epic 4** — do not build them here; just establish the seam so the facade surface is complete. [Source: architecture.md#Gap #3; #Frontend Architecture — Theming]
  - [ ] Controller imports **nothing app-side** — no React/Supabase/Zustand (AC #2). It MAY import `@mermaidweb/shared` for the `ViewState` schema (shared types are not "app-side").

- [ ] **Task 4 — Versioned `ViewState` Zod schema in `packages/shared` (AC: #4)**
  - [ ] Add `packages/shared/src/schemas/view-state.ts`: a **versioned** Zod schema modelling the persisted overlay `{ version, collapsed: string[], depth?: number, pins: Record<nodeId, {x,y}> }` (per the data model, keyed within a fence's slice). Export the inferred `ViewState` type.
  - [ ] The controller **consumes** this schema: `setViewState(vs)` applies it to the IR (set `collapsed` flags, depth, pins) on mount; `viewStateChange` emits a validated `ViewState`. The engine's internal IR flags are unchanged (no behavior change) — the controller is the **translation seam** between the persisted shape and the engine's internal representation.
  - [ ] **No duplicate validators** anywhere (AR5): this schema is the single source; `packages/render` imports it from `@mermaidweb/shared`. (`packages/shared` graduates from its 1.1 shell here.)

- [ ] **Task 5 — Prove no behavior change + no app coupling (AC: #2, #3)**
  - [ ] Run the migrated demo (`packages/render/demo`) and confirm it reproduces `our-renderer.html` on the **locked fixtures** (`fixture`, `fixture200`, `fixture_crosscluster(_acyclic)`, `fixture_nested`, `fixture_cyclic_nested_1..4`, `fixture_node_to_subgraph`, `fixture_shapes`, `fixture_reserve_fallback`) — spot-check the parity checkpoints (cyc2 Router bottom-left/Response right; cyc3 Reviewer above Editor/Halt below Productivity; cyc4 Exit beside DiamondScc/Done below Pipeline; fixture_nested Cache-left/Primary-right). [Source: docs/architecture/05-invariants-and-parity.md §2]
  - [ ] The dump-driven Playwright parity check (`mermaid-debug.html` → `window.__dump`) is the rigorous method, but **Playwright is opt-in per `CLAUDE.md`** — confirm with Ahmed before using it; otherwise verify via the demo + a render-output assertion.
  - [ ] Grep the engine for app-side imports (`react`, `@supabase`, `stores/`, `zustand`) → must be **zero** (AC #2).
  - [ ] `pnpm --filter @mermaidweb/render build` + `typecheck` pass; `pnpm -r build` still green (1.1 topo order holds).

- [ ] **Task 6 — Engine conformance review (AC: #3)**
  - [ ] Confirm preserved: existing module filenames unchanged (camelCase modules kept as-is per Task 1; net-new files use kebab-case), camelCase IR fields (`fromCluster`/`toCluster`/`originalPoints`/`labelPos`), PascalCase types, DOM hooks `data-node-id` / `data-subgraph-id` / `data-edge-key` (=`e.id`=`L_<index>`) / `data-surrogate-for`, node `(x,y)`=center → `translate` transform. [Source: architecture.md#Rule 0; survey of renderer.ts]
  - [ ] Confirm the **inviolable invariants** (05 §1) are untouched: I1 `fromCluster`/`toCluster` == original endpoint; I2 edge identity = `id` not `(from,to)`; I3 `graph.children()` order; I4 placeholder==drawn rect; I5 `cluster-bbox.ts` single source; I6 `layout()` clears recursive artefacts at entry; I7 flat path byte-identical. [Source: docs/architecture/05-invariants-and-parity.md §1]

## Dev Notes

### Story scope & guardrails (READ FIRST)

This is the **FIRST implementation priority** and build-order step 1: extract the validated engine **with no behavior change**, then 1.3 measures it, then 1.4 binds it. [Source: architecture.md#Decision Impact Analysis; docs/architecture/06 §6]

**Depends on Story 1.1** (the `packages/render` + `packages/shared` shells, the monorepo, TS-strict tooling). **Move + wrap, do not rewrite.** The hard, novel work (Mermaid-faithful recursive layout + disclosure family) is **already built and validated** — your job is to package it cleanly behind a facade, not to improve it.

**In scope:** git-history-preserving migration, the public barrel, the `DiagramController` facade (incl. the net-new event emitter + select + parseError surface), the versioned `ViewState` schema in shared, proof of parity.

**Out of scope (later):** perf fixtures/gate (1.3); the React `<DiagramCanvas>` binding + Zustand (1.4); the disclosure *UI* (1.5–1.9 — the engine logic exists; only controller wiring here); full theming (Epic 4, AR13); full SVG-export-with-collapse-state (Epic 4, FR29); command palette/minimap (1.10/1.11). The controller exposes `setTheme`/`export` as **seams**, nothing more.

### Verified current engine state (from a full spike6 survey — trust these facts)

- **No events exist today.** The engine surfaces state only via callbacks passed at wire-time (`getIR`, `rerender`) and AbortController-scoped DOM listeners that return a detach `() => void`. The controller's four events are **net-new**. Node selection/hover and parse-error propagation are **not modeled** today — both are net-new in the facade.
- **No `index.ts` barrel and no `controller.ts` exist** in `spike6/src` — both are net-new (28 files total, listed in Task 1).
- **`parseToIR` is `async`** (`Promise<IR>`) — the controller's mount/setSource must await it; emit `parseError` on rejection.
- **`mountEl.__meta` is NOT currently attached to the DOM** — `renderFull` builds a local `MountMeta { ir, adjacency, edgeMap, displayPoints, displayMode, subgraphRects, subgraphLabels }` but does not persist it. The architecture's Rule 0 names "live data on `mountEl.__meta`" as a **target** convention. **Decision for the dev:** have the controller hold this meta in its own state (cleaner) **and/or** attach it to `mountEl.__meta` — later stories (1.4 select, 1.10 palette, 1.11 minimap) need access to `{ir, adjacency, edgeMap}`. Attaching `__meta` is additive (no render change), so it does not violate "no behavior change."
- **No theming, no SVG export** — colors are hardcoded in `renderer.ts` (cluster `#f8f9fa`/`#adb5bd`, node `#fff`/`#333`, etc.). `setTheme`/`export` have zero existing code → seams only here.
- The collapse/expand re-render cycle is `clear A* artifacts → deriveEffectiveIR → layout → sync positions → (optional A* route) → renderFull → reattach listeners`. The controller's `collapse`/`expand`/`setDepth`/`resetLayout` reuse exactly this.
- `focus`/`path`/`depth-compute` are **pure overlays / pure IR reads — no relayout**; preserve that (it is the whole performance argument). `collapse`/`expand`/`setDepth`/`resetLayout` **do** re-run `layout()` on the derived IR. [Source: docs/architecture/06 §3]

### Architecture compliance (binding)

- **Engine boundary:** `@mermaidweb/render` is framework-agnostic plain TS that owns its SVG subtree; **React never reconciles it** (the binding lands in 1.4). The sole bridge will be `DiagramController` (props in · imperative commands · events out). The engine imports nothing app-side. [Source: architecture.md#Frontend Architecture; #Component boundaries]
- **Facade surface (AR2):** `mount`/`destroy`; commands `focus/path/collapse/expand/setDepth/panTo/resetLayout/setTheme/export`; events `viewStateChange/select/parseError/ready`. Extend the existing camelCase event names; never rename. [Source: architecture.md#Frontend Architecture; #Communication Patterns]
- **Casing seam (AR5):** `packages/shared` is the ONLY place mapping/validation lives; the `view_state` schema is **versioned** there. `packages/render` depends on `@mermaidweb/shared` for `ViewState`. No duplicate DTOs/validators. [Source: architecture.md#Format Patterns; #Data boundaries]
- **Rule 0 (highest priority) + the 05 invariants are inviolable** — see Task 6. Drag stays pin-and-recalculate (never full `layout()` on drag). [Source: architecture.md#Rule 0; docs/architecture/05 §1]

### Testing standards

- Co-locate Vitest unit tests `*.test.ts` in `packages/render/src`. Add at least: a `parseToIR → layout → renderFull` smoke (produces expected `data-node-id`/`data-edge-key` DOM), a `deriveEffectiveIR` collapse test, and a controller lifecycle test (`mount` emits `ready`, `destroy` detaches). [Source: architecture.md#Structure Patterns]
- The authoritative **parity** method is dump-driven comparison vs Mermaid's internal logs (05 §2), but Playwright is opt-in (`CLAUDE.md`) — confirm before using; otherwise assert render output on the locked fixtures. Do not let the known deferred cosmetic gaps (05 §3: +18px container width, `fixture_crosscluster` x-offset, internal ranksep) read as regressions.

### Previous Story Intelligence (Story 1.1)

`packages/render` and `packages/shared` already exist as **buildable shells** (placeholder `src/index.ts`, `package.json`, `tsconfig.json` extending `tsconfig.base.json`). `apps/web` declares `workspace:*` deps on both, so once you fill the barrel, `pnpm -r build` resolves engine-before-app. TS strict + ESLint + Prettier are configured and must stay green. Vitest is wired in `apps/web`; add it to `packages/render` here.

### Git Intelligence

`main` already merged `recursive-layout` (commit `6617954`), so `spike6/src` has the recursive engine + the HANDOFF-1..4 fixes (cluster-size parity, mixed-graph encapsulation, reserve-fallback flip, flat-path parity — all DONE). The decision trail lives in `spike6/RECURSIVE_LAYOUT_LOG.md` + `spike6/handoffs/`; leave those and `docs/architecture/**` in place. Use `git mv` so blame survives the move (AR2 "git history preserved"). Other `spike*` dirs are untouched.

### Latest Tech Information

- **`mermaid` is a parser-only dependency** and uses a **non-public API** (`getDiagramFromText`) — **pin the exact version** that spike6 validated against (`mermaid ^11.14.0` per `spike6/package.json`); a minor bump can break the parser boundary. Do not upgrade as part of this story.
- `@dagrejs/dagre ^3`, `d3-shape ^3`, `d3-path ^3` — match spike6 versions so layout output is byte-identical. [Source: spike6/package.json]
- Zod (latest v3+) for the shared `ViewState` schema. TypeScript strict (from 1.1 base).

### Project Context Reference

No `project-context.md` exists. Authoritative sources: `epics.md` Story 1.2 (+ AR2/AR5/AR11), `architecture.md` (Frontend Architecture, Rule 0, Format/Communication patterns, Gap #3), `docs/architecture/05` (the 7 invariants + parity methodology), `docs/architecture/06` (what's built vs net-new, the extraction first-move), and the verified spike6 survey above.

### Project Structure Notes

- Target tree for this story: `packages/render/{src/{...28 modules..., controller.ts, index.ts}, demo/, fixtures/, perf/, package.json, tsconfig.json}` + `packages/shared/src/schemas/view-state.ts`. `perf/` + the 500/1000-node fixtures are **Story 1.3**; `demo/` is the migrated harness. [Source: architecture.md#Complete Project Directory Structure]
- **Divergence to record:** the architecture tree shows `index.ts` and `controller.ts` as if present; the survey confirms they are net-new — created here, not migrated. Also `mountEl.__meta` is a target convention not yet realized (see Verified state). Note these in Completion Notes.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.2: Extract the render engine into `@mermaidweb/render` behind a DiagramController]
- [Source: _bmad-output/planning-artifacts/epics.md — AR2 (engine extraction), AR5 (single DB↔TS / ViewState seam), AR11 (engine conformance Rule 0)]
- [Source: _bmad-output/planning-artifacts/architecture.md#Frontend Architecture (DiagramController surface, binding, theming seam)]
- [Source: _bmad-output/planning-artifacts/architecture.md#Implementation Patterns → Rule 0, Naming, Communication, Format Patterns]
- [Source: _bmad-output/planning-artifacts/architecture.md#Gap Analysis Results → Gap #3 (net-new: theming pipeline, SVG export)]
- [Source: docs/architecture/05-invariants-and-parity.md §1 (I1–I7 invariants), §2 (parity methodology), §3 (deferred cosmetic gaps)]
- [Source: docs/architecture/06-from-spike-to-product.md §2 (public API), §3 (disclosure as-built), §6 (extraction first-move)]
- [Source: spike6/package.json (pinned engine deps), spike6/src/* (verified API surface), spike6/SPIKE6_HANDOFF.md, spike6/SPIKE6_COMPLETE.md]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

# Story 1.4: Interactive diagram canvas with pan and zoom

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to load a Mermaid flowchart into an interactive canvas and pan, zoom, and select nodes,
so that I can treat a large diagram as something I can manipulate rather than a static image.

## Acceptance Criteria

1. **React `<DiagramCanvas>` mounts the controller; engine owns the SVG subtree (FR3, AR2).**
   **Given** a minimal source input (paste/textarea) containing valid flowchart Mermaid
   **When** I submit it
   **Then** a React `<DiagramCanvas>` mounts a `DiagramController` and renders the diagram as SVG, with React owning the container and the engine owning the SVG subtree.

2. **Click/hover selection emits `select` (FR3).**
   **Given** a rendered diagram
   **When** I click or hover a node
   **Then** the node is highlighted/selectable and the controller emits a `select` event.

3. **Pan + zoom with layout parity (FR15).**
   **Given** a rendered diagram
   **When** I drag-pan and zoom (wheel/controls)
   **Then** the canvas pans and zooms smoothly and node/edge geometry preserves Mermaid layout parity.

4. **Invalid source → non-fatal error (FR3 supporting).**
   **Given** invalid Mermaid source
   **When** it is submitted
   **Then** the controller emits `parseError` and the canvas shows a non-fatal error state rather than crashing (full inline editor errors arrive in Epic 2).

## Tasks / Subtasks

- [ ] **Task 1 — `<DiagramCanvas>` + `useDiagram` lifecycle (AC: #1)**
  - [ ] Create `apps/web/src/features/canvas/DiagramCanvas.tsx`: render a single container element via a `ref`; in a `useEffect`, create a `DiagramController`, call `controller.mount(ref.current)`, and on cleanup call `controller.destroy()`. **React must NOT render the SVG subtree in JSX** — the engine owns it (AR2). The container `<div>`/`<svg>` is the only React-owned node; everything under it is engine-rendered.
  - [ ] Create `apps/web/src/hooks/useDiagram.ts` wrapping controller creation/teardown + subscribing to events (`ready`/`select`/`parseError`/`viewStateChange`) and returning the controller handle + current state to the component.
  - [ ] Guard React 19 StrictMode double-invoke: mount/destroy must be idempotent (destroy fully detaches; remount rebuilds) so the dev-mode double effect doesn't leak listeners or duplicate SVG.

- [ ] **Task 2 — Minimal source input + setSource (AC: #1)**
  - [ ] Add a **minimal** paste/textarea + "Render" affordance in `features/canvas` (or `features/workspace` shell) that feeds source to the controller (`controller.setSource(text)` / re-mount). This is explicitly the *throwaway minimal input* — **Story 2.1 replaces it with the CodeMirror 6 live editor**; do not build live-sync, highlighting, or debounce here.
  - [ ] On submit of valid flowchart Mermaid, the canvas renders (AC #1).

- [ ] **Task 3 — Pan + zoom via the engine (AC: #3)**
  - [ ] Wire the engine's existing pan/zoom (`pan.ts`, attached by `controller.mount`) so drag-pan and wheel-zoom work on the canvas. **Verify** `pan.ts` provides wheel-zoom; doc 06 marks Pan/Zoom "Done" — if only pan exists, add zoom **engine-side** (kebab-case module, transform-only, **no relayout**) so it stays in the engine, not React.
  - [ ] Pan/zoom is a **viewport transform only** — it must NOT re-run `layout()` and must preserve node/edge geometry (Mermaid parity, FR15). Selection/render geometry is unchanged by panning. [Source: docs/architecture/05 — layout parity]
  - [ ] Optional on-canvas zoom controls (+/−/fit) may call `controller.panTo` / a fit helper; keep minimal.

- [ ] **Task 4 — Selection wiring + the diagram store (AC: #2)**
  - [ ] Consume the controller's `select` event (defined in Story 1.2, net-new over `[data-node-id]`): on click/hover a node, highlight it (engine applies the visual; React reflects selected-id in state) and surface the selected node id to the app.
  - [ ] Introduce the **Zustand `diagram-store`** (`apps/web/src/stores/diagram-store.ts`) as the controlled-`view_state` ↔ controller bridge: React holds canonical state, the engine emits deltas up via `viewStateChange`, React reflects them. This is the **first use of Zustand** — install `zustand` here (1.1 deferred it). Keep the store minimal (selection + a `view_state` slice placeholder); the disclosure slices (`collapsed[]`/`depth`/pins) are populated by Stories 1.5–1.9.
  - [ ] Immutable updates inside store actions only; components read via selectors; no cross-store reach-in (binding rules). [Source: architecture.md#Communication Patterns — State]

- [ ] **Task 5 — Non-fatal parse-error state (AC: #4)**
  - [ ] Subscribe to `parseError`; on error show a **non-fatal** inline banner/overlay in the canvas chrome and keep the last-good render (or an empty state on first load) — never crash or blank uncontrollably.
  - [ ] **Scope:** this is the canvas-level error surface only. **Inline, in-editor error placement at the offending line is Story 2.5** (CodeMirror) — do not build editor diagnostics here. Wrap the canvas in a React error boundary per route as a backstop. [Source: architecture.md#Process Patterns — Error handling]

- [ ] **Task 6 — Tests (AC: #1, #2, #3, #4)**
  - [ ] Vitest component tests: `<DiagramCanvas>` mounts → SVG with `data-node-id` nodes present (AC #1); a node click triggers `select` and updates selected state (AC #2); invalid source → `parseError` → non-fatal banner, no throw (AC #4). Co-locate as `*.test.tsx`. [Source: architecture.md#Structure Patterns]
  - [ ] Note pan/zoom parity is covered by the engine's own fixtures (Story 1.2/1.3); the canvas test asserts the transform applies without relayout, not full geometry parity.

## Dev Notes

### Story scope & guardrails (READ FIRST)

This is **build-order step 3** — the first React↔engine binding. It turns the packaged engine (1.2) into something a user touches, with a **minimal** source input that Epic 2 upgrades into the real workspace. [Source: architecture.md#Decision Impact Analysis]

**Depends on Story 1.1** (app shell, React Router, app build) **and Story 1.2** (the `@mermaidweb/render` package + `DiagramController` with its `mount`/`destroy`, `panTo`, and `select`/`parseError`/`ready`/`viewStateChange` events). Do not start before 1.2's facade exists.

**In scope:** `<DiagramCanvas>` + `useDiagram`, minimal source input, pan/zoom wiring, click/hover `select`, the Zustand `diagram-store` bridge (first use), a non-fatal canvas parse-error state.

**Explicitly OUT of scope (later stories — do NOT build):**
- Collapse/expand, depth, focus, path **UI/controls** → Stories 1.5–1.9 (the engine logic already exists; this story does not surface disclosure controls).
- Command palette (1.10), minimap (1.11).
- CodeMirror editor, live-sync, multi-block Markdown, inline editor errors → Epic 2 (the textarea here is throwaway).
- Persistence/save/share/slug → Epic 3 (no Supabase here; the canvas is fed by local input only).

### The load-bearing boundary (AR2) — get this exactly right

React owns the **container** + chrome; **`@mermaidweb/render` owns the SVG subtree** and React **never reconciles it**. Concretely: a single `ref`'d container, `controller.mount(el)` in an effect, `controller.destroy()` on cleanup — no JSX inside the SVG, no React state driving SVG attributes. The only bridge is the controller (imperative commands in, events out). Getting this wrong (rendering SVG via React, or letting React re-render the subtree) is the canonical failure this architecture is built to prevent. [Source: architecture.md#Component boundaries; #Frontend Architecture]

### Engine facts that shape this story (from the 1.2 survey)

- The `select` event is **net-new** in the 1.2 controller, layered over the existing `[data-node-id]` DOM hooks — the engine had no selection model. This story is its first real consumer; confirm 1.2 emits it on click (and decide hover semantics with 1.2 if not already wired).
- Pan/zoom lives in the engine (`pan.ts`), attached during `controller.mount`. It is a **transform**, not a relayout — parity is preserved for free as long as nothing re-runs `layout()` on pan/zoom.
- `parseToIR` is async and `parseError` is emitted by the controller (net-new; replaced the spike's DOM error-bar). Subscribe and render a non-fatal state.
- DOM identity hooks present for selection/highlight: `data-node-id`, `data-edge-key` (=`L_<index>`), `data-subgraph-id`, `data-surrogate-for`. Node `(x,y)` = center via `translate`. `mountEl.__meta` (`{ir, adjacency, edgeMap}`) may be exposed by the controller (per 1.2) — useful if you need adjacency for highlight, but selection here is simple node-id highlight.

### Architecture compliance (binding)

- **State:** Zustand 5 domain stores — `useDiagramStore` is the controlled `view_state` ↔ controller bridge; `useUiStore` (panes/palette/theme) may also start here if needed for canvas chrome. Immutable updates in actions; selector reads; no cross-store reach-in. TanStack Query is **not** used yet (no server state until Epic 3). [Source: architecture.md#Core Architectural Decisions; #Communication Patterns]
- **Feature-first:** `apps/web/src/features/canvas/` for `<DiagramCanvas>` + the minimal input + Renderer-Router seam (the full per-fence Renderer Router is Epic 2 — here it is a single flowchart controller). Hooks in `hooks/`, stores in `stores/`. [Source: architecture.md#Structure Patterns; #Requirements → Structure Mapping]
- **Routing:** mount the canvas under an app route (e.g. `/app`) using the React Router setup from 1.1. [Source: architecture.md#Frontend Architecture — Routing]
- **Error handling:** React error boundary per route + non-fatal inline state; user-facing message distinct from logged detail; last-good render preserved. [Source: architecture.md#Process Patterns]

### Testing standards

- Vitest + a DOM environment (jsdom/happy-dom) for component tests, co-located `*.test.tsx`. Assert the engine actually rendered (`data-node-id` present) rather than mocking the controller away — the binding is the thing under test. Mock only the heavy parser if needed for speed, but prefer a real small fixture. [Source: architecture.md#Structure Patterns; NFR-M3]
- This is a **critical user-facing path** (workspace/canvas) — NFR-M3 wants it covered in CI. The first Playwright E2E is deferred to Story 2.3, but the Vitest coverage here is the CI floor.

### Previous Story Intelligence (Stories 1.1, 1.2)

- **From 1.1:** React 19 + React Router v7 SPA shell exists with placeholder routes; `apps/web/src/{features,hooks,stores,lib}/` dirs exist (empty). Zustand was deliberately deferred to its first use — **that's this story** (install `zustand`). TS strict + ESLint + Prettier must stay green.
- **From 1.2:** `@mermaidweb/render` exposes `DiagramController` (`mount`/`destroy`, `panTo`/`resetLayout`/etc., events `ready`/`select`/`parseError`/`viewStateChange`) and consumes the versioned `ViewState` from `@mermaidweb/shared`. Use the **public API only** — never import engine internals or reach into the SVG from React. The known deferred cosmetic parity gaps (05 §3) are not bugs to fix here.

### Git Intelligence

No app UI code exists before this epic; `apps/web` is the 1.1 scaffold and `<DiagramCanvas>` is the first feature component. Nothing to avoid breaking except the scaffold's clean lint/type/build and the engine package boundary (don't import engine internals).

### Latest Tech Information

- **React 19** (StrictMode double-effect in dev — make mount/destroy idempotent), **Zustand 5**, **React Router 7** (SPA mode). No new heavy deps beyond `zustand`. CodeMirror/cmdk/react-markdown are **later** (Epic 2 / 1.10). [Source: architecture.md#Architecture Validation Results]

### Project Context Reference

No `project-context.md` exists. Authoritative sources: `epics.md` Story 1.4 (FR3/FR15, AR2), `architecture.md` (Frontend Architecture, Component/State boundaries, Communication/Process patterns), the 1.2 engine facade, and `docs/prd.md` FR3/FR15. `CLAUDE.md`: no Playwright MCP unless asked — Vitest is the test path here.

### Project Structure Notes

- New this story: `apps/web/src/features/canvas/DiagramCanvas.tsx`, `apps/web/src/hooks/useDiagram.ts`, `apps/web/src/stores/diagram-store.ts`, and a route mounting the canvas. The `features/disclosure`, `features/palette`, `features/minimap` dirs stay empty until their stories.
- The single-flowchart controller here is the seed of the per-fence **Renderer Router** (Epic 2, AR12); structure `features/canvas` so a second controller per fence is an extension, not a rewrite — but do not build multi-fence now.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.4: Interactive diagram canvas with pan and zoom]
- [Source: _bmad-output/planning-artifacts/epics.md — AR2 (DiagramController / engine owns SVG), AR11 (engine conformance)]
- [Source: _bmad-output/planning-artifacts/architecture.md#Frontend Architecture (binding, state, routing, theming seam)]
- [Source: _bmad-output/planning-artifacts/architecture.md#Architectural Boundaries → Component boundaries, State boundaries]
- [Source: _bmad-output/planning-artifacts/architecture.md#Implementation Patterns → Communication Patterns (Zustand stores), Process Patterns (error handling, loading)]
- [Source: docs/architecture/05-invariants-and-parity.md (layout parity — pan/zoom must not relayout)]
- [Source: docs/architecture/06-from-spike-to-product.md §2 (engine as IR→SVG + handlers, embeddable)]
- [Source: docs/prd.md — FR3 (interactive canvas), FR15 (pan/zoom)]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

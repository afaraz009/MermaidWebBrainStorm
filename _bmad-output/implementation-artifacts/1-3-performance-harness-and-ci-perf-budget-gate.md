# Story 1.3: Performance harness and CI perf-budget gate

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a founder-engineer,
I want 200/500/1000-node fixtures with frame-time and cold-load probes wired into a CI perf-budget gate,
so that the unmeasured-performance risk is closed and any regression blocks release.

## Acceptance Criteria

1. **Fixtures generated + checked in (AR3, NFR-P8).**
   **Given** the engine package
   **When** fixtures are generated
   **Then** 200-, 500-, and 1000-node flowchart fixtures exist under `packages/render/fixtures` and are checked into the repo.

2. **Frame-time gate (NFR-P3, NFR-P4).**
   **Given** a disclosure interaction on the 200-node fixture
   **When** frame time is probed
   **Then** the gate asserts ≤ 16 ms p50 and ≤ 33 ms p95
   **And** on the 500-node fixture it asserts ≤ 33 ms p50.

3. **No-crash floor (NFR-P5).**
   **Given** the 1000-node fixture
   **When** it is rendered and basically interacted with
   **Then** it does not crash — the no-crash floor — and is asserted as such **without** a frame-time gate.

4. **CI blocks on regression (NFR-P8, NFR-M1/M3, AR17).**
   **Given** a PR that regresses a perf budget
   **When** CI runs
   **Then** the perf-gate fails and blocks the deploy
   **And** the GitHub Actions pipeline runs typecheck · lint · Vitest · perf-gate.

5. **A\*-enabled routing variant (FR15b, AR3, AR19; NFR-P1/P2).**
   **Given** the 200-node fixture with edge routing set to A\* (`view_state.edgeMode = 'astar'`)
   **When** cold-load first-render and A\* route-time are probed
   **Then** the gate asserts they meet the first-render / cold-load targets (NFR-P2/P1) **with A\* on** — because a shared A\*-routed diagram re-routes on the recipient's cold load
   **And** if the A\* variant cannot meet the budget, that is surfaced as the carried perf risk (gate reports it) **before** A\* shares ship in Story 1.12.

## Tasks / Subtasks

- [ ] **Task 1 — Fixture generator + checked-in 200/500/1000-node fixtures (AC: #1)**
  - [ ] Add a deterministic fixture generator under `packages/render/fixtures/` (e.g. `generate.ts` / `gen-fixtures.ts`) that emits flowchart `.mmd` at parameterized node counts.
  - [ ] **Critical:** generated fixtures MUST contain **nested subgraphs/clusters**, not a flat chain — the expensive, unprofiled path is the **recursive** layout (per-cluster dagre + `computeClusterBboxes` rebuild). A flat fixture would measure the cheap path and give a false-green gate. Include cross-cluster edges so collapse/expand and `deriveEffectiveIR` are exercisable. [Source: docs/architecture/06-from-spike-to-product.md §4]
  - [ ] Commit generated `fixture200.mmd` / `fixture500.mmd` / `fixture1000.mmd` (or generator + a checked-in snapshot) so the suite is reproducible and the gate runs on stable inputs (NFR-P8 "checked into the test suite"). Note: `spike6/` already ships a hand-authored `fixture200.mmd` — reuse/port its shape if it already has clusters; otherwise generate.
  - [ ] Keep fixtures under `packages/render/fixtures/` (canonical location per the structure tree).

- [ ] **Task 2 — Frame-time probe over an engine-level disclosure interaction (AC: #2, #3)**
  - [ ] Add probes under `packages/render/perf/` measuring the cost of a disclosure interaction: drive an **engine-level collapse** (the disclosure op that re-runs `layout()` on the derived IR — the worst case) and time `deriveEffectiveIR → layout → renderFull` with `performance.now()`.
  - [ ] **Scope note:** the React disclosure *UI* arrives in Stories 1.5–1.9; this probe drives the **engine API directly** (the `controller`/exported functions from Story 1.2), independent of any React UI. Measure engine compute + DOM mutation, not React.
  - [ ] Report **p50 and p95** over a sufficient sample (e.g. ≥ 30 timed iterations after warm-up runs to stabilize JIT/caches). Discard warm-up iterations from the statistics.
  - [ ] Assert: 200-node ≤ 16 ms p50 **and** ≤ 33 ms p95 (NFR-P3); 500-node ≤ 33 ms p50 (NFR-P4).
  - [ ] 1000-node: render + one basic interaction; assert it **completes without throwing / crashing** (no-crash floor, NFR-P5) — **no** frame-time threshold on this fixture.

- [ ] **Task 3 — Cold-load / first-render probe (AC: #1 support, #5; NFR-P2, NFR-P1)**
  - [ ] Add an engine first-render probe: time `parseToIR → layout → renderFull` cold (no prior render) on the 200-node fixture as the proxy for NFR-P2 (time-to-first-render ≤ 1.5 s).
  - [ ] **A\*-enabled variant (AC #5, FR15b/AR19):** run the same 200-node first-render probe with `view_state.edgeMode = 'astar'` so the cold render also pays the A\* **batch route cost** (`routeEdgesBatch` over the grid). Assert it meets NFR-P2/P1 with A\* on; if it cannot, the gate **reports it as the carried risk** rather than silently passing — this is what decides whether A\* may ride in a shared doc's `view_state` (Story 1.12) or must stay author-only. Reuse the same clustered fixture (A\* routes against the laid-out node grid, so the cluster shape matters). [Source: docs/architecture/04-interaction-and-routing.md §4 (`routeEdgesBatch`); epics.md AR19]
  - [ ] **Scope note:** the *full recipient* cold-load TTI (NFR-P1 ≤ 3.0 s — bundle download + network + hydrate) cannot be measured until the app/recipient bundle exists (**Epic 3**). This story measures the **engine render cost** only (side-aware **and** A\*); record that the end-to-end TTI gate lands with the recipient read path. [Source: architecture.md#Requirements Coverage Validation — Performance]

- [ ] **Task 4 — Choose & document the measurement environment (AC: #2, #4)**
  - [ ] Decide the probe runtime (see Dev Notes "Measurement environment — open decision"): a **real headless browser** (Playwright/Chromium or Vitest browser mode) gives fidelity to "frame time"; a DOM shim (happy-dom/jsdom) is lighter and, because the cost here is compute-bound (dagre + bbox), a usable proxy. The engine mutates real SVG DOM, so the runtime must provide a DOM.
  - [ ] Document the chosen runtime, warm-up count, sample size, and the "typical engineer laptop" reference (NFR-P3) in `packages/render/perf/README.md` so results are interpretable and reproducible.

- [ ] **Task 5 — Wire the CI perf-budget gate + GitHub Actions pipeline (AC: #4)**
  - [ ] Create `.github/workflows/ci.yml` (this story **owns** this file; Story 1.1 created the npm script *names* it calls). Jobs/steps in order: **typecheck · lint · Vitest · perf-gate** (AR17, NFR-M1/M3).
  - [ ] Expose the perf gate as a script (e.g. `pnpm --filter @mermaidweb/render perf` or root `pnpm perf`) that exits non-zero when any AC #2/#3 assertion fails, so the CI job blocks the merge/deploy (NFR-P8, NFR-M1).
  - [ ] **Deploy steps** (`wrangler deploy` + `supabase db push`, AR17) require Cloudflare/Supabase projects + secrets that don't exist until Epic 3 — wire the **gate** now; add the deploy stage when there's a target to deploy. Note this in the workflow as a TODO marker, don't fabricate secrets.
  - [ ] Pin the runner (`runs-on`) and Node version (`.nvmrc`) for reproducibility; enable pnpm via corepack/`pnpm/action-setup`.

## Dev Notes

### Story scope & guardrails (READ FIRST)

This is **build-order step 2** — the perf harness lands **immediately after the engine extraction (Story 1.2) and before the app shell binding / backend**, by explicit architecture decision, because *unmeasured performance is the load-bearing residual risk* of the whole project. [Source: architecture.md#Decision Impact Analysis; docs/architecture/06-from-spike-to-product.md §4, §6]

**Depends on Story 1.2** — the `@mermaidweb/render` package, its public API (`parseToIR`/`layout`/`renderFull`/`deriveEffectiveIR`/`DiagramController`), and the disclosure functions must exist to probe. Do not start 1.3 before 1.2's engine is in `packages/render/src`.

**In scope:** fixtures (200/500/1000, clustered), frame-time + first-render probes (incl. the **A\*-enabled 200-node first-render/route-time variant**, AC #5), the pass/fail perf gate, the `.github/workflows/ci.yml` pipeline (typecheck·lint·Vitest·perf-gate).

**Out of scope (later):** the React disclosure UI (1.5–1.9 — this probe calls the engine directly); full recipient cold-load TTI incl. bundle/network (Epic 3); Playwright critical-path E2E jobs (first real E2E = Story 2.3 — add that CI stage then); deploy steps (Epic 3, when targets/secrets exist).

### Why this matters / the risk being closed

From `SPIKE6_COMPLETE.md` §6, restated in doc 06: **every spike fixture is small; the engine is unprofiled past ~20 nodes.** The recursive engine re-runs dagre **per cluster level** and `computeClusterBboxes` **rebuilds maps per call**. The PRD makes **≤16 ms @200 a release gate**. The whole point of this story is to convert "addressed but unmeasured" (architecture Gap #2) into a measured, enforced baseline. [Source: architecture.md#Gap Analysis Results — Gap #2; docs/architecture/06 §4]

**A\* routing is a *second* unprofiled expensive path (AC #5, FR15b/AR19).** With A\* promoted to an MVP opt-in mode, `routeEdgesBatch` runs a binary-heap A\* over a uniform cell grid for **every edge, longest-first** — also never profiled at 200/500 nodes, and worse: a shared A\*-routed diagram pays this on the **recipient's cold load** (NFR-P1/P2), not just on an author's local toggle. So the A\* variant (AC #5) is not a nice-to-have measurement — it is the gate that decides whether A\* may persist into a shared `view_state` (Story 1.12) or must stay author-only. [Source: docs/architecture/04-interaction-and-routing.md §4; architecture.md#Edge routing modes / Correct-course 2026-06-03]

### Budgets (the gate's assertions)

| Fixture | Metric | Budget | NFR | Gate? |
|---|---|---|---|---|
| 200-node | disclosure frame time | ≤ 16 ms p50 **and** ≤ 33 ms p95 | NFR-P3 | **Blocks** |
| 500-node | disclosure frame time | ≤ 33 ms p50 | NFR-P4 | **Blocks** |
| 1000-node | render + basic interaction | **no crash** (no frame budget) | NFR-P5 | **Blocks on crash only** |
| 200-node | first-render (engine) | proxy for ≤ 1.5 s | NFR-P2 | measure; full TTI → Epic 3 |
| 200-node, **A\* on** | first-render + A\* route-time | proxy for ≤ 1.5 s / ≤ 3.0 s with A\* on | NFR-P2/P1 | measure + **report risk** (FR15b/AR19; gates A\* shares in 1.12) |

The 1000-node fixture is the **no-crash floor**, explicitly *not* a frame-time gate — do not assert ms on it. [Source: architecture.md#Requirements Coverage Validation; epics.md Story 1.3 AC]

### Measurement environment — open decision (flag for founder)

NFR-P3 is specified "on a **typical engineer laptop**," but the *gate* runs in **CI**, where shared runners are noisier and slower than a laptop. Absolute-ms budgets on shared CI can be flaky. Two reconcilable readings:
- **Absolute budgets** (epics AC literal): assert the ms thresholds directly. Mitigate variance with warm-up iterations, large sample, p50/p95 (not mean), and a **pinned runner class**.
- **Regression-relative** (NFR-P8 literal: *"regressions block release"*): store a committed baseline and fail when a PR regresses it beyond a tolerance band.

**Recommendation:** implement absolute budgets per the AC, but structure the probe so a baseline-relative mode is a small add-on; if CI proves flaky, switch the *gate semantics* to regression-relative (still satisfies NFR-P8) while keeping the absolute numbers as the local-laptop target (NFR-P3). **This is the one decision worth confirming with Ahmed before implementing** — see Completion Notes / Story Questions.

### Architecture & structure compliance

- Probes live under `packages/render/perf/`; fixtures under `packages/render/fixtures/` — both are named in the canonical tree. [Source: architecture.md#Complete Project Directory Structure]
- CI: GitHub Actions `typecheck · lint · Vitest · perf-budget gate vs 200/500-node fixtures (NFR-P8) → wrangler deploy + supabase db push`. This story delivers the gate portion; deploy is deferred. [Source: architecture.md#Infrastructure & Deployment / CI/CD]
- Obey **Rule 0 / the `docs/architecture/05` invariants** when authoring clustered fixtures — fixtures must be valid Mermaid the engine lays out the same as Mermaid; don't author shapes that trip a known deferred gap (e.g. `fixture_crosscluster` x-offset, +18px container width) and mistake it for a perf failure. [Source: docs/architecture/05-invariants-and-parity.md §3]
- Module naming: kebab-case `.ts` for probe/generator modules; tests co-located `*.test.ts` (Vitest). [Source: architecture.md#Naming Patterns]

### Testing standards

- The perf gate is itself runnable via Vitest (or a standalone Node script invoked by CI) and must exit non-zero on budget breach. Co-locate any unit tests as `*.test.ts`. The gate is **separate** from ordinary unit tests so a perf failure is distinguishable from a logic failure in CI output. [Source: architecture.md#Structure Patterns, #CI/CD]
- Determinism: seed/parameterize the fixture generator so 200/500/1000 are stable across runs; a non-deterministic generator would make the gate noisy.

### Previous Story Intelligence (Stories 1.1, 1.2)

- **From 1.1:** root scripts `typecheck`/`lint`/`test`/`build` exist and pass on the scaffold; `ci.yml` was deliberately left for **this** story. `.nvmrc` + corepack/pnpm are set up — reuse them in the workflow. Vitest is already wired in `apps/web`; add/confirm Vitest in `packages/render` for the gate.
- **From 1.2:** the engine is now in `packages/render/src` with the public API barrel + `DiagramController`. Use the **public API** for probes (don't reach into private internals) so the harness reflects how the app will actually call the engine. The known deferred parity gaps (05 §3) are *not* perf bugs — don't chase them.

### Git Intelligence

Only `spike*` prototype code + planning docs exist before this epic. `spike6/` already contains `fixture200.mmd` and many `fixture_*.mmd` (clustered/cyclic/nested cases) — survey them as generator templates; the 500/1000-node fixtures are net-new. No prior CI workflow exists (this story introduces `.github/workflows/ci.yml`).

### Latest Tech Information

- **GitHub Actions** with `pnpm/action-setup` + `actions/setup-node` (Node from `.nvmrc`, 20.19+/22.12+). Pin `runs-on` for perf stability.
- **Vitest** (latest) for the gate runner / browser mode if a real-DOM probe is chosen; **Playwright/Chromium** only if a real-browser frame-time probe is selected (note: `CLAUDE.md` restricts the *Playwright MCP*, not Playwright-as-a-test-dependency — but confirm the runtime choice in Task 4 before adding heavy deps). [Source: architecture.md#Architecture Validation Results]

### Project Context Reference

No `project-context.md` exists. Authoritative sources: `epics.md` Story 1.3 (+ AR3, AR17), `architecture.md` (CI/CD, perf coverage, Gap #2), `docs/architecture/06` §4/§6 (the perf risk + "land fixtures alongside the first disclosure mode"), `docs/prd.md` NFR-P1–P5/P8/M1/M3.

### Project Structure Notes

- `.github/workflows/ci.yml` is the canonical CI location (architecture tree root). This story creates it; later stories (2.3 E2E, Epic 3 deploy) extend it — design the jobs so stages can be appended without rewrites.
- Fixtures/probes are colocated in the engine package so the gate travels with the engine and runs in package-scoped CI, matching `pnpm -r` topology from 1.1.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.3: Performance harness and CI perf-budget gate]
- [Source: _bmad-output/planning-artifacts/epics.md — AR3 (perf harness + CI gate, incl. A*-enabled variant), AR17 (CI/CD pipeline), AR19 (edge routing modes), Story 1.3 AC #5, Story 1.12 (A* feature), FR15b]
- [Source: docs/architecture/04-interaction-and-routing.md §4 (A* `routeEdgesBatch` grid pathfinding — the unprofiled route cost)]
- [Source: _bmad-output/planning-artifacts/architecture.md#Infrastructure & Deployment → CI/CD]
- [Source: _bmad-output/planning-artifacts/architecture.md#Decision Impact Analysis → build order (perf gate = step 2)]
- [Source: _bmad-output/planning-artifacts/architecture.md#Gap Analysis Results → Gap #2 (performance addressed but unmeasured)]
- [Source: _bmad-output/planning-artifacts/architecture.md#Requirements Coverage Validation → Performance P1/P2/P3/P4/P5/P8]
- [Source: docs/architecture/06-from-spike-to-product.md §4 (two risks), §6 (first-move sequence)]
- [Source: docs/architecture/05-invariants-and-parity.md §3 (known deferred gaps — not perf bugs)]
- [Source: docs/prd.md — NFR-P1/P2/P3/P4/P5/P8 (performance), NFR-M1/M3 (automated CI before deploy)]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

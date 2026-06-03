# Story 1.1: Scaffold the monorepo and application shell

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a founder-engineer,
I want the pnpm-workspaces monorepo and the Vite 8 + React 19 + TypeScript SPA scaffolded on Cloudflare,
so that all subsequent engine and app work shares one consistent build, test, and deploy pipeline.

## Acceptance Criteria

1. **Monorepo + topological build (AR4).**
   **Given** a clean checkout
   **When** I run the documented initialization
   **Then** a pnpm-workspaces monorepo exists with `packages/render`, `packages/shared`, and `apps/web`
   **And** `pnpm -r build` completes successfully in workspace topological order (packages before app).

2. **SPA stack on Cloudflare (AR1).**
   **Given** the app workspace
   **When** it is scaffolded
   **Then** `apps/web` is a Vite 8 + React 19 + TypeScript (strict) SPA created via `create-vite react-ts`, with `@cloudflare/vite-plugin` + `wrangler` configured and `not_found_handling = "single-page-application"`.

3. **Local dev runs SPA + Worker together.**
   **Given** the dev command
   **When** I run `pnpm --filter web dev`
   **Then** the SPA and its Cloudflare Worker serve together locally (Vite + `workerd`) and a placeholder route renders in the browser.

4. **Documented ≤30-min setup + clean lint/type (NFR-M2, NFR-M1/M3 groundwork).**
   **Given** a new maintainer (or future-Ahmed after a gap)
   **When** they follow the documented setup process
   **Then** the full stack runs locally in ≤ 30 minutes
   **And** TypeScript strict, ESLint, and Prettier are configured and pass cleanly on the scaffold.

## Tasks / Subtasks

- [ ] **Task 1 — Establish the pnpm-workspaces monorepo root (AC: #1, #4)**
  - [ ] Add root `package.json` (private, `"packageManager": "pnpm@<current>"`, `"engines": { "node": ">=20.19" }`) — there is **no** root `package.json` today; create it.
  - [ ] Add `pnpm-workspace.yaml` with globs `packages/*` and `apps/*` **only** (this deliberately excludes the throwaway `spike`/`spike2`–`spike6` dirs — do NOT add them as workspaces).
  - [ ] Add `tsconfig.base.json` (`strict: true`, `moduleResolution: "bundler"`, path aliases `@mermaidweb/*` → `packages/*/src`). Each package/app `tsconfig.json` extends it.
  - [ ] Add root ESLint config + `.prettierrc`. Use the config style matching the installed ESLint major (flat `eslint.config.js` for ESLint 9+; the architecture's `.eslintrc.cjs` name predates flat config — see Project Structure Notes). Configure for TS + React.
  - [ ] Add `.nvmrc` (Node 20.19+ or 22.12+).
  - [ ] **Update** (do not overwrite) the existing root `.gitignore` to cover `node_modules/`, `dist/`, `.wrangler/`, `.turbo/`, coverage output. Leave existing entries and existing root files (`ARCHITECTURE.md`, `BUILD_LOG.md`, `SPEC.md`, `spike*/`, `docs/`, `_bmad*/`) untouched.
  - [ ] Add root scripts: `build` (`pnpm -r build`), `typecheck` (`pnpm -r typecheck`), `lint`, `format`, `format:check`, `test` (`pnpm -r test`), `dev` (`pnpm --filter web dev`). These script *names* are the seam Story 1.3 wires into CI — keep them stable.

- [ ] **Task 2 — Create buildable package shells `@mermaidweb/render` and `@mermaidweb/shared` (AC: #1)**
  - [ ] `packages/render/`: `package.json` (`"name": "@mermaidweb/render"`, `build`/`typecheck`/`test` scripts), `tsconfig.json` extending base, `src/index.ts` placeholder export. **Scope guardrail:** this story creates the *empty package shell only*; the `spike6/src/` engine migration + `DiagramController` is **Story 1.2** — do NOT migrate engine code here.
  - [ ] `packages/shared/`: `package.json` (`"name": "@mermaidweb/shared"`, same scripts), `tsconfig.json`, `src/index.ts` placeholder. **Scope guardrail:** the real Zod `view_state` schema + `mapDocument` casing layer land in **Story 1.2 / Epic 3** — shell only here.
  - [ ] Verify each package's `build` (tsc emit) and `typecheck` succeed standalone.

- [ ] **Task 3 — Scaffold the `apps/web` SPA via create-vite react-ts (AC: #2)**
  - [ ] Generate the Vite 8 + React 19 + TS (strict) app using the `react-ts` template inside `apps/web` (align Vite to `^8`, matching `spike6` which already runs Vite 8).
  - [ ] Install `-D @cloudflare/vite-plugin wrangler`; wire `@cloudflare/vite-plugin` into `vite.config.ts`.
  - [ ] Add `wrangler.jsonc` with `not_found_handling = "single-page-application"` (SPA fallback) + the worker entry; placeholder `bindings` left empty until Epic 3.
  - [ ] Add `apps/web/package.json` workspace deps `"@mermaidweb/render": "workspace:*"` and `"@mermaidweb/shared": "workspace:*"` so `pnpm -r build` resolves packages-before-app topo order (AC #1) even though they are not yet imported.
  - [ ] Add `public/robots.txt` with `Disallow: /d/` (NFR-S3 groundwork; the load-bearing `X-Robots-Tag` header is Epic 3 — note only).
  - [ ] `apps/web/tsconfig.json` extends `tsconfig.base.json` (strict).

- [ ] **Task 4 — Minimal app shell: React Router placeholder + minimal Hono Worker (AC: #3)**
  - [ ] `src/main.tsx` · `src/app.tsx` · `src/router.tsx`: React Router v7 in **SPA mode (`ssr: false`)** with a single placeholder `/` route that renders visible text (e.g. "MermaidWeb — scaffold"). Full route set (`/d/:slug`, `/app`, `/account`, `/pricing`) and Zustand stores are **later stories** (1.4 / Epic 3) — create the empty `src/{routes,features,components,hooks,stores,lib,styles}/` dirs but do not implement features.
  - [ ] `apps/web/worker/index.ts`: minimal **Hono** app (install `hono`) exposing one trivial route (e.g. `GET /api/health` → 200) so the Cloudflare plugin serves a Worker alongside the SPA. Full endpoint set (`/api/d/:slug`, `/api/auth/*`, webhooks, analytics, cache-purge) is Epic 3 — do not build it here.
  - [ ] Confirm `pnpm --filter web dev` serves SPA + Worker together via `workerd` and the placeholder route renders.

- [ ] **Task 5 — Vitest wiring + scaffold smoke test (AC: #1, #4)**
  - [ ] Add Vitest to `apps/web` (and a root passthrough) so `pnpm -r test` runs. Co-locate tests as `*.test.ts(x)`.
  - [ ] Add one trivial smoke test (e.g. the placeholder `App` renders its text) so `test` is green, not empty.
  - [ ] Create an empty `apps/web/e2e/` dir as the Playwright home; **defer** Playwright config/install to the first real E2E need (Story 2.3 / Epic 3) — note this, do not wire Playwright now.

- [ ] **Task 6 — Document the setup (AC: #4 / NFR-M2)**
  - [ ] Add a root `README.md` (or `docs/development-setup.md`) "Getting Started": prerequisites (Node version, `corepack enable` for pnpm), `pnpm install`, `pnpm dev`, `pnpm build`, `pnpm test`, `pnpm lint`. Target: a clean machine reaches a running dev server in ≤ 30 minutes.
  - [ ] Run `pnpm install && pnpm -r build && pnpm typecheck && pnpm lint && pnpm format:check && pnpm test` from a clean state and confirm all pass (AC #1, #4). Record the exact commands in the File List / Completion Notes.

## Dev Notes

### Story scope & guardrails (READ FIRST)

This is the **scaffolding** story. Its job is the *skeleton*, not the features. The architecture's post-spike build order is authoritative and front-loads the engine before the backend; this story is **build-order step 3's foundation** (app shell), deliberately *before* the engine extraction lands in it. [Source: architecture.md#Decision Impact Analysis]

**In scope:** monorepo root, buildable `packages/render` + `packages/shared` *shells*, the `apps/web` Vite/React/Cloudflare SPA with a placeholder route + minimal Hono Worker, TS-strict/ESLint/Prettier/Vitest tooling that passes clean, documented ≤30-min setup.

**Explicitly OUT of scope (later stories — do NOT start them):**
- Migrating `spike6/src/` → `packages/render` + the `DiagramController` facade → **Story 1.2**.
- 200/500/1000-node perf fixtures + CI perf-budget gate + the `.github/workflows/ci.yml` pipeline → **Story 1.3** (this story only guarantees the `build`/`typecheck`/`lint`/`test` script *names* exist for 1.3 to wire).
- `<DiagramCanvas>`, `useDiagram`, Zustand domain stores, engine binding → **Story 1.4**.
- Supabase client, `/api/*` real endpoints, auth, RLS → **Epic 3**.

Do not reach into later stories' surface area; an over-eager scaffold that half-implements features creates merge friction with 1.2–1.4.

### Architecture compliance (binding)

- **Selected stack (locked):** Vite 8 (Rolldown bundler) · React 19 · TypeScript **strict** · Node **20.19+ / 22.12+** · `@cloudflare/vite-plugin` (Workers runtime/`workerd` in dev, `wrangler deploy` to Cloudflare) · SPA fallback via `not_found_handling = "single-page-application"`. Meta-frameworks (Next/Remix) were **rejected** (SPA-not-MPA, all diagram pages `noindex`, client-side SVG render) — do not introduce SSR. [Source: architecture.md#Starter Template Evaluation]
- **Init command of record (AR1):** `npm create vite@latest … --template react-ts`, then add `-D @cloudflare/vite-plugin wrangler` and `@supabase/supabase-js`. Adapt to pnpm. `@supabase/supabase-js` may be installed now per AR1 but stays **unimported** until Epic 3 — if your lint flags unused deps, defer the supabase install to Epic 3 and note it. [Source: architecture.md#Starter Template Evaluation; epics.md#AR1]
- **Repo realization:** the existing repo root **becomes** the pnpm-workspaces monorepo root. `docs/architecture/**` and `_bmad-output/**` planning artifacts **stay as-is**. `spike6` remains in place (it is the engine seed extracted in 1.2); leave all `spike*` dirs untouched and out of the workspace globs. [Source: architecture.md#Complete Project Directory Structure]
- **Rule 0 awareness:** you are not touching engine code in this story, but the package you scaffold (`@mermaidweb/render`) will receive the spike6 engine in 1.2 under strict conformance rules (kebab-case modules, camelCase IR fields, PascalCase types, `data-node-id`/`data-subgraph-id`, `L_<index>` edge identity, invariants in `docs/architecture/05`). Don't pre-impose conventions on the empty package that would conflict. [Source: architecture.md#Rule 0]

### Target structure (this story's slice of the canonical tree)

```
mermaidweb/                              # existing repo root, now the workspace root
├── package.json                         # NEW workspace root (pnpm)
├── pnpm-workspace.yaml                  # NEW — packages/* and apps/* only
├── tsconfig.base.json                   # NEW — strict; @mermaidweb/* path aliases
├── eslint.config.js (or .eslintrc.cjs)  # NEW — see variance note
├── .prettierrc · .nvmrc                 # NEW
├── .gitignore                           # UPDATE existing (add node_modules/dist/.wrangler)
├── README.md                            # NEW — ≤30-min Getting Started (NFR-M2)
├── packages/
│   ├── render/   { package.json, tsconfig.json, src/index.ts }   # SHELL ONLY (engine = 1.2)
│   └── shared/   { package.json, tsconfig.json, src/index.ts }   # SHELL ONLY (schemas = 1.2/Epic 3)
└── apps/
    └── web/
        ├── index.html · vite.config.ts  # Vite 8 + @cloudflare/vite-plugin + react
        ├── wrangler.jsonc               # not_found_handling=single-page-application
        ├── public/robots.txt            # Disallow: /d/
        ├── tsconfig.json
        ├── package.json                 # deps: react-router; workspace:* render+shared
        ├── src/ { main.tsx, app.tsx, router.tsx, routes/, features/, components/, hooks/, stores/, lib/, styles/ }
        ├── worker/index.ts              # minimal Hono app (GET /api/health)
        └── e2e/                         # empty (Playwright deferred)
```
[Source: architecture.md#Complete Project Directory Structure]

### Naming & structure patterns (binding on every file you create)

- React components `PascalCase.tsx`; hooks `useThing.ts`; **all other modules `kebab-case.ts`**; functions/vars `camelCase`; types/interfaces `PascalCase`; constants `UPPER_SNAKE_CASE`; booleans `isX`/`hasX`. [Source: architecture.md#Code (TypeScript)]
- **Feature-first** under `apps/web/src/features/<feature>/`; cross-cutting UI in `components/`, hooks in `hooks/`, non-UI helpers in `lib/`. Tests co-located `*.test.ts(x)` (Vitest); Playwright E2E in `e2e/`. [Source: architecture.md#Structure Patterns]
- **All AI agents MUST** pass TypeScript strict + ESLint + Prettier — CI blocks on any lint/type error (this story makes that pass on an empty scaffold). [Source: architecture.md#Enforcement Guidelines]

### Dev / build / deploy workflow this scaffold must satisfy

- **Dev:** `pnpm --filter web dev` → Vite + `workerd` (via the Cloudflare plugin) serve SPA + Worker together. (`supabase start` joins the dev loop in Epic 3 — not now.) [Source: architecture.md#Development Workflow Integration]
- **Build:** `pnpm -r build`; the Cloudflare plugin emits SPA assets + Worker; `packages/*` build first in workspace topo order — the workspace `workspace:*` deps you add in Task 3 are what *force* that order (AC #1). [Source: architecture.md#Development Workflow Integration]
- **Deploy/CI:** `wrangler deploy` + `supabase db push` behind a GitHub Actions gate — **Story 1.3 owns the pipeline file**; here, only ensure the npm scripts it will call exist and are green. [Source: architecture.md#Infrastructure & Deployment]

### Testing standards

- **Vitest** for unit/component, co-located `*.test.ts(x)`. This story ships exactly one smoke test (placeholder renders) so `pnpm -r test` is green and non-empty — the harness 1.3 extends. [Source: architecture.md#Structure Patterns]
- **Playwright** E2E lives in `apps/web/e2e/`; first real E2E is the FR15a disclosure-disabled assertion (Story 2.3). Create the dir; defer Playwright install/config. [Source: architecture.md#CI/CD; epics.md Story 2.3]

### Project Structure Notes

- **No root `package.json` exists today** — this story introduces the workspace root. The repo currently holds only sequential spike prototypes (`spike`…`spike6`) with their own `package.json`/`node_modules`; restricting `pnpm-workspace.yaml` to `packages/*` + `apps/*` keeps those spikes out of the workspace graph (they are not deleted, not built, not linted).
- **ESLint filename variance (resolved):** the architecture tree names `.eslintrc.cjs` (legacy eslintrc format). ESLint 9+ defaults to **flat config** (`eslint.config.js`). The binding AC is "ESLint configured and passes cleanly" (AC #4), not the filename — use the format matching the installed ESLint major and note the choice in Completion Notes. This is a naming variance, not an architecture conflict.
- **`spike6` versions as ground truth:** `spike6` already runs Vite `^8`, TypeScript `^6`, `mermaid ^11`, `@dagrejs/dagre ^3`, `d3-shape`/`d3-path` — align the scaffold's Vite/TS majors to these so the 1.2 engine migration drops in without a toolchain bump. [Source: spike6/package.json]
- **`@supabase/supabase-js`** appears in the AR1 init command but is unused until Epic 3 — include per AR1 or defer to avoid an unused-dependency lint failure; either is acceptable, just record which.

### Previous Story Intelligence

None — this is the first story in Epic 1 and the first implementation story in the project. No prior story file to learn from.

### Git Intelligence

Recent commits (`Epics 3 stories created`, `Epics created`, `Architecture updated`, `Merge branch 'recursive-layout'`) are **planning/docs only** — no application code exists yet. The only code in the repo is the `spike*` prototypes; `spike6` is the validated engine seed (migrated in Story 1.2, not here). Nothing to build upon or avoid breaking except: **do not disturb the `spike*` dirs or the `docs/` + `_bmad-output/` artifacts.**

### Latest Tech Information

Versions were pinned by the architecture as current at June 2026; pin to the current stable of each major at implementation time, holding these majors: **Vite 8** (Rolldown), **React 19**, **`@cloudflare/vite-plugin` 1.x**, **wrangler** (latest), **React Router 7** (SPA mode), **Hono** (latest), **Vitest** (latest), Node **20.19+/22.12+**. Use `corepack enable` to get a reproducible pnpm. Don't downgrade any major below these — later stories assume them. [Source: architecture.md#Architecture Validation Results / Decision Compatibility]

### Project Context Reference

No `project-context.md` exists in the repo (checked). The authoritative sources for this story are `epics.md` (Story 1.1 + AR1/AR4), `architecture.md` (starter, structure, patterns, workflow), and `docs/prd.md` (NFR-M1/M2/M3). `CLAUDE.md` instruction: do not use the Playwright MCP unless explicitly asked — consistent with deferring Playwright here.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.1: Scaffold the monorepo and application shell]
- [Source: _bmad-output/planning-artifacts/epics.md — AR1 (starter/init), AR4 (monorepo structure)]
- [Source: _bmad-output/planning-artifacts/architecture.md#Starter Template Evaluation]
- [Source: _bmad-output/planning-artifacts/architecture.md#Project Structure & Boundaries → Complete Project Directory Structure]
- [Source: _bmad-output/planning-artifacts/architecture.md#Implementation Patterns & Consistency Rules → Naming/Structure Patterns, Enforcement Guidelines, Rule 0]
- [Source: _bmad-output/planning-artifacts/architecture.md#Decision Impact Analysis → Implementation sequence (build order)]
- [Source: _bmad-output/planning-artifacts/architecture.md#Infrastructure & Deployment, Development Workflow Integration]
- [Source: docs/prd.md — NFR-M1 (§803), NFR-M2 (§804, ≤30-min setup), NFR-M3 (§805)]
- [Source: spike6/package.json, spike6/tsconfig.json, spike6/vite.config.ts — existing toolchain to align with]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

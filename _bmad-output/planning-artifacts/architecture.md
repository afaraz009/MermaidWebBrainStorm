---
stepsCompleted: ['step-01-init', 'step-02-context', 'step-03-starter', 'step-04-decisions', 'step-05-patterns', 'step-06-structure', 'step-07-validation', 'step-08-complete']
lastStep: 8
status: 'complete'
completedDate: '2026-06-01'
inputDocuments:
  - docs/prd.md
  - _bmad-output/planning-artifacts/architecture-decisions-renderer.md
  - docs/architecture/README.md
  - docs/architecture/01-data-pipeline.md
  - docs/architecture/02-layout-engine.md
  - docs/architecture/03-rendering-and-edges.md
  - docs/architecture/04-interaction-and-routing.md
  - docs/architecture/05-invariants-and-parity.md
  - docs/architecture/06-from-spike-to-product.md
workflowType: 'architecture'
project_name: 'MermaidWeb'
user_name: 'Ahmed'
date: '2026-06-01'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:** ~41 FRs across 9 categories. Wave 1.1 (the binding
launch scope) includes all except FR31–38 (AI Generation = Wave 1.2, Code Connect =
Wave 1.3, which need design seams now but not implementation). Architecturally the
FRs cluster into four surfaces:
- **Workspace** (FR1–5, 12–15a) — live-syncing source editor ↔ Markdown preview ↔
  interactive canvas; command palette; minimap; pan/zoom; the Renderer Router that
  sends flowcharts to the native pipeline and all other Mermaid types to a
  viewer-only fallback.
- **Disclosure family** (FR6–11) — collapse/expand, focus, path, depth slider.
  Already built and spike6-validated on the engine harness; focus/path are pure
  IR-adjacency overlays, collapse re-runs layout on a derived IR.
- **Persistence, sharing, identity** (FR16–25) — anonymous-first session tokens,
  cryptographically random short-URL slugs, recipient-as-first-class-user (same SPA
  bundle), anonymous→premium claim, view/edit share permissions.
- **Account, premium, observability** (FR26–30, 39–41) — auth, hosted-checkout
  billing, **SVG export with collapse state preserved** (PNG/PDF a post-launch fast-follow), custom branding,
  first-party analytics live before launch.

**Non-Functional Requirements:** 37 NFRs. The architecturally load-bearing ones:
- *Performance:* recipient cold-load TTI ≤3.0s and first-render ≤1.5s @200 nodes
  (the distribution-loop SLA); disclosure frame time ≤16ms p50 / ≤33ms p95 @200
  nodes; save→share-URL ≤300ms p50. (The PRD sets no fixed bundle-size NFR — it gates on
  the TTI targets above; a self-imposed ~350KB initial-bundle figure is adopted only as an
  engineering proxy for those targets, **not** as a release gate or an ADR-mandated budget —
  the renderer ADR explicitly retired the original 350KB framing.)
- *Security/Privacy:* encryption at rest; ≥64-bit random slugs (no enumeration);
  noindex/no public discovery surface (hard privacy rule); argon2id; PCI SAQ-A via
  hosted checkout only; TLS 1.2+.
- *Reliability:* ≥99.5% save/load; issued share URLs never 404 except by owner
  deletion; anonymous diagrams persist ≥90 days; graceful degradation with in-flight
  edits preserved when the backend is unreachable.
- *Scalability/Cost/Maintainability:* absorb a 10× viral spike by configuration, not
  re-architecture; opex sustainable without revenue; automated build/test/deploy;
  full stack runnable locally in ≤30 minutes; performance budgets enforced in CI
  against 200/500-node fixtures.

### Scale & Complexity

- Primary domain: **Browser single-page application (developer tools)** plus a
  lightweight persistence / auth / billing / analytics backend.
- Complexity level: **Medium** — but the genuine technical risk (owned SVG renderer
  with Mermaid-faithful recursive layout + the 4-mode disclosure family) is
  **already built and spike6-validated**. Remaining work is largely conventional
  web-SaaS scaffolding wrapped around a finished, framework-less engine.
- Estimated architectural components: ~15–20 — the engine package, ~8–10 front-end
  shell modules, ~6–7 backend services, and the hosting/storage/monitoring infra.

### Technical Constraints & Dependencies

**Locked (not re-litigated this pass):**
- SVG renderer; Mermaid as **parser only** + `dagre-d3-es` + `d3-shape`; owned
  rendering pipeline; pin-and-recalculate drag; Position-3 hybrid (native flowchart
  pipeline + Mermaid viewer-only fallback for other types).
- SPA, not MPA; recipient pages hydrate from the same SPA bundle.
- Backend persistence from day one (no URL-encoded diagram state).
- Mermaid is the only diagram format in v1; Markdown is first-class.
- Desktop-first; mobile is viewer-only. Tier-1 browsers: Chrome/Edge/Firefox last 2,
  Safari 15+.
- First-party analytics only (no GA/ad-tech); transactional email only at launch;
  Stripe **or** Paddle hosted checkout (processor TBD this phase).

**Carried into the engine boundary:** the engine is plain TS mutating the SVG DOM
(no framework, no state library). It is embeddable under any front-end framework as a
pure `IR → SVG` function plus event handlers — `06-from-spike-to-product.md` proposes
extracting `spike6/src/` into a `@mermaidweb/render` package with a small public API
(`parseToIR`, `layout`, `renderFull`, `attachDrag`, `deriveEffectiveIR`).

**Resource constraint:** solo founder, weekend pace, coding-agent-assisted → bias
toward boring, well-trodden building blocks and low operational surface.

### Cross-Cutting Concerns Identified

- **Anonymous-first identity** — session tokens span persistence, sharing, claim-flow,
  and security; not an auth-tier afterthought.
- **Performance budget enforcement** — 200/500-node fixtures + frame-time/cold-load
  probes spanning engine, bundle/build, and hosting; a CI release gate.
- **Privacy/encryption posture** — default-sensitive content across frontend, backend,
  and infra (encryption, noindex, no gallery, SAQ-A).
- **Live-sync state** — single source of truth feeding source editor, Markdown
  preview, and canvas without round-trips.
- **Disclosure/collapse-state serialization** — must round-trip through the
  Diagram-Document model and the export pipeline (FR29).
- **Observability from day one** — analytics wired and verified before public launch,
  not retrofitted.
- **Engine-package boundary** — the seam between the finished framework-less engine
  and the chosen front-end framework (one of this pass's four open decisions).

## Starter Template Evaluation

### Primary Technology Domain

Browser **single-page application** (Vite + React + TypeScript) wrapping the
existing framework-less render engine, plus an edge/API layer on Cloudflare Workers
and a Supabase data plane. Not a meta-framework app (SSR rejected — see rationale).

### Starter Options Considered

- **Vite + React-TS SPA (`create-vite react-ts`) + `@cloudflare/vite-plugin`** —
  minimal, framework-agnostic base on the same Vite/TS toolchain the engine already
  uses; the Cloudflare plugin adds the Workers runtime + bindings (R2/KV/edge fns) and
  SPA-fallback routing in one project. **Selected.**
- **Meta-framework (Next.js / Remix / TanStack Start)** — rejected: PRD mandates
  SPA-not-MPA; all diagram pages are `noindex` (no SEO payoff); the SVG render is
  inherently client-side, so SSR adds a server render path with no benefit and more ops.
- **Opinionated React boilerplate (T3-style, batteries-included)** — rejected for a
  solo founder who wants deliberate, boring, minimal dependencies; we add libraries
  intentionally rather than inherit a stack.

### Selected Starter: Vite 8 + React 19 + TypeScript (SPA) on Cloudflare

**Rationale for Selection:**
- Same Vite/TypeScript toolchain as the engine → the `@mermaidweb/render` package and
  the app share one build/test pipeline (engine extraction stays seamless).
- React: largest component ecosystem (CodeMirror, cmdk, etc.) + best coding-agent
  training data for weekend-pace, agent-assisted build; bundle fits the self-imposed
  ~350KB initial-bundle proxy (see the Performance note in Requirements Overview).
- `@cloudflare/vite-plugin` 1.0 makes "SPA + edge Workers bindings" first-class in one
  project, serving the recipient cold-load SLA and viral-spike-by-config NFRs.
- Supabase as data plane keeps anonymous tokens, encryption-at-rest, RLS, and the
  anonymous→premium claim flow boring and fast to ship.

**Initialization Command** (versions current as of June 2026):

```bash
# Scaffold the SPA (Vite 8 / React 19 / TypeScript)
npm create vite@latest mermaidweb-app -- --template react-ts

# Add the Cloudflare Vite plugin (Workers runtime + bindings + SPA fallback)
npm install -D @cloudflare/vite-plugin wrangler

# Data plane client
npm install @supabase/supabase-js
```

**Architectural Decisions Provided by the Starter:**

- **Language & Runtime:** TypeScript (strict mode), React 19, Node 20.19+/22.12+.
- **Build Tooling:** Vite 8 (Rolldown bundler); `@cloudflare/vite-plugin` for the
  Workers runtime in dev (`workerd`) and `wrangler deploy` to Cloudflare; SPA fallback
  via `not_found_handling = "single-page-application"`.
- **Deployment Target:** Cloudflare (static assets + edge Workers); Supabase for
  durable Postgres/Auth/Storage.

**Deliberately left open (decided in step-04 / step-05 / step-06):**

- **Styling** (Tailwind vs CSS Modules vs vanilla-extract) — base template ships none.
- **State management** (Zustand / Jotai / Redux Toolkit) for the live source↔preview↔
  canvas sync — base template ships none.
- **Editor & UI libs** (CodeMirror 6 for the Mermaid editor, `cmdk` for the command
  palette, a Markdown renderer) — added deliberately.
- **Data fetching** (TanStack Query over `supabase-js`) and the engine-package
  monorepo layout (`@mermaidweb/render` + app) — covered in step-06 structure.
- **Testing** (Vitest for unit, Playwright — already in the repo for engine
  verification — for E2E).

**Note:** Project initialization with the command above should be the **first
implementation story**.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (block implementation):**
- Engine extracted to `@mermaidweb/render` (React-free) behind a `DiagramController` facade.
- Diagram-Document data model: one row per *document*, source-of-truth = Markdown,
  `view_state` jsonb keyed by stable fence IDs.
- Identity & access: Supabase anonymous auth + uid-preserving claim; read-by-slug
  capability + RLS owner edit/delete.
- Backend topology: hybrid (direct supabase-js + RLS for CRUD; Hono Workers for the
  edge paths).
- App foundation: Vite 8 + React 19 + TS SPA on Cloudflare (from step-03).

**Important Decisions (shape architecture):**
- Hybrid React↔engine binding (controlled `view_state` + imperative commands).
- State: Zustand + TanStack Query. Routing: React Router v7 (SPA mode).
- Edge-cached recipient read path; encryption = Supabase disk-level + access control.
- PostHog analytics; Sentry monitoring; GitHub Actions CI with a perf-budget gate.
- pnpm-workspaces monorepo; Supabase CLI local stack for dev.

**Wave-1.1 decision deferred to just-in-time (NOT post-MVP):**
- **Payment processor (Paddle vs Stripe)** — the payment *capability* (hosted checkout,
  FR27/NFR-S7) is **in Wave-1.1 scope** (premium tier); only the *processor selection* is
  deferred to the premium milestone (the last build step). The architecture is
  processor-agnostic (a webhook Worker + a `subscriptions` row), so this blocks the
  premium milestone, not the architecture. Tracked as Gap #1. *(If you choose to re-scope
  premium/payments to a post-1.1 fast-follow, that is a PRD `correct-course`, not an
  architecture change — the seam supports either.)*
  **Reconciliation with PRD Open Decision #5** (which nominally places the processor choice
  in the *architecture* phase): this is an **intentional deferral**, ratified 2026-06-01.
  **Action (done 2026-06-02):** PRD Open Decision #5's trigger updated to "before the premium
  milestone" so downstream agents don't treat it as a missed architecture-phase decision.

**Genuinely deferred (post-MVP or later trigger):**
- App-level field encryption — revisit only on enterprise/regulated demand.
- elkjs "Adaptive" layout (pluggable by design); sequence-diagram disclosure
  graduation (post-launch demand); mobile editor, version history / diff view (V2).
- Self-serve account-deletion UI — a documented manual deletion runbook covers the
  NFR-S8 obligation at launch; the self-serve UI is a fast-follow (the deletion *cascade*
  is specified now — see Authentication & Security).

### Data Architecture

- **Source of truth = Markdown text.** One `documents` row per `/d/{slug}`. IR, layout
  coords, SVG, adjacency are always recomputed by the engine on load — never persisted
  (eliminates dual-write drift; matches the engine's derive-from-source model).
- **`documents`** (Supabase Postgres): `id uuid` · `slug text unique` (≥64-bit random,
  `nanoid(12)`/`pgcrypto`) · `markdown text` · `view_state jsonb` · `title text` ·
  `owner_id uuid NOT NULL` → `auth.users` · `visibility` (`private`/`link-view`) ·
  `theme jsonb null` · `created_at` · `updated_at` · `last_accessed_at` (drives
  ≥90-day anon retention, NFR-R3).
- **`document_grants`** (capability links — the mechanism behind FR25 view/editable
  sharing): `{ id, document_id → documents, role ('view'|'edit'), token text unique
  (≥64-bit), label, created_at, revoked_at null }`. The owner mints/revokes grants
  (direct, RLS). The bare slug is the default **view** link (when `visibility='link-view'`);
  an **editable** share (FR25) is an `edit`-role grant token. Revocable, multiple per doc.
- **`subscriptions`** (billing state, processor-agnostic): `{ id, owner_id → auth.users,
  processor null, external_id null, status, current_period_end, updated_at }`.
- **`deletion_requests`** (FR30 audit/SLA): `{ id, user_id → auth.users, requested_at,
  verified_at, completed_at null, status }` — drives the deletion request path (see
  Authentication & Security).
- **Ownership is uniform across tiers (no nullable owner, no separate session token).**
  Anonymous users are real **Supabase anonymous-auth** users, so every document —
  anonymous or premium — is owned by an `auth.uid()`. Anonymous diagrams are therefore
  **fully persisted and shareable from day one** (FR16/17/18/22 — the distribution loop
  depends on this; persistence is NOT skipped for anonymous users). On signup the same
  uid is preserved (`updateUser`), so claim (FR19) needs no row migration. This is what
  lets RLS be a single rule (`owner_id = auth.uid()`) for edit/delete across both tiers,
  while public read stays a slug capability (below).
- **`view_state` (soft overlay), keyed by stable fence ID** (`id=…` auto-stamped into
  each ```` ```mermaid ```` fence, stripped before parse): `{ collapsed[], depth?,
  pins{nodeId→{x,y}} }` per block. Reconciled on parse — orphaned IDs dropped silently.
  Pins persisted best-effort; pan/zoom/focus/path are ephemeral.
- **Shared links open in the author's saved `view_state`.**
- **`theme` (premium branding, FR28):** `theme jsonb` holds a **versioned theme object**
  (schema in `packages/shared` — palette, fonts, node/edge/cluster styles, optional
  logo/watermark). Applied by the engine on render (Frontend → Theming), returned with the
  document on recipient read (so **shared views are branded**), and inlined into **SVG
  export** (so branding reaches exported artifacts). `null` = default theme.
- **Validation:** shared Zod schemas (`packages/shared`) + markdown size cap; Mermaid
  syntax validated client-side (FR5). **Migrations:** Supabase CLI SQL, in-repo.
- No version-history table in v1 (diff view = V2).

### Authentication & Security

- **Supabase Auth.** Anonymous sign-in (FR16/17); **uid-preserving conversion**
  (`updateUser` linking email/OAuth) = automatic anonymous→premium claim (FR19);
  email+password (bcrypt default, NFR-S5); Google + GitHub OAuth fast-follow (FR26).
- **Session model (browser-held, hardened — keeps direct CRUD).** `supabase-js` runs in
  the browser and makes direct, RLS-protected PostgREST calls (preserves the hybrid
  topology — no BFF). The **short-lived access token lives in memory only** (module scope,
  never `localStorage`), and the **long-lived refresh token lives in an
  httpOnly/Secure/SameSite=Lax cookie** owned by a thin `/api/auth/*` Worker route (set on
  sign-in/OAuth-callback, rotated on refresh, cleared on sign-out). On load / access-token
  expiry the SPA calls the Worker refresh route, which reads the httpOnly refresh cookie,
  exchanges it with Supabase, and returns a fresh in-memory access token. The refresh token
  (the persistent secret) fits the "Workers own the secret-holding paths" principle.
  Authorization always uses verified `getUser()`, never unverified `getSession()`.
- **⚠️ Accepted deviation from NFR-S6 (ratified 2026-06-01).** NFR-S6 reads "session tokens
  are HTTP-only." The **access token is browser-JS-readable (in memory)** to enable direct
  CRUD — a *conscious relaxation*; only the **refresh token is httpOnly**. This is **not
  claimed as full NFR-S6 compliance.** Compensating controls: strict CSP, short
  access-token TTL, refresh rotation, in-memory (not `localStorage`) storage. **Action
  (done 2026-06-02):** NFR-S6 annotated in the PRD to record this acceptance. *(Strict-compliance alternative —
  a Worker BFF proxying all writes in httpOnly cookies — was rejected as contradicting the
  locked direct-CRUD/hybrid topology; plain `localStorage` was rejected outright.)*
- **Access control (incl. editable sharing, FR25):** *read* is a slug capability
  (unguessable ≥64-bit slug, NFR-S2) via `SECURITY DEFINER get_shared_document(slug)`;
  *owner* edit/delete via RLS (`owner_id = auth.uid()`). **Non-owner editable shares**
  (FR25) go through `SECURITY DEFINER update_shared_document(slug, grantToken, patch)`,
  which validates a live (non-revoked) `edit` grant in `document_grants` and writes —
  owner-only RLS otherwise blocks recipients, so the **grant token is the edit capability**
  (revocable, rate-limited, premium-gated). **Premium entitlement** (minting an `edit` grant,
  custom themes, export) is enforced **server-side against an active `subscriptions.status`**
  — inside the `SECURITY DEFINER` RPC or an RLS predicate — **never by the `is_anonymous`
  claim alone**: `is_anonymous` only distinguishes anonymous-vs-registered, and a registered
  user whose subscription has lapsed must lose premium features (PRD Technical Success #4,
  "clean free/premium boundary"). The `is_anonymous` JWT claim gates anonymous-vs-registered
  behaviour; `visibility` (`private`/`link-view`) gates whether the bare slug is readable.
- **Encryption at rest = Supabase disk-level AES-256 + RLS + unguessable slugs + TLS
  1.2+** (NFR-S1/S4). **`X-Robots-Tag: noindex, nofollow` response header on every `/d/*`
  route** (set in asset/Worker middleware — the SPA-fallback serves a single `index.html`,
  so the response header, not a client-injected `<meta>` a crawler may ignore, is the
  load-bearing control) + `robots.txt` `Disallow: /d/` + no sitemap entry (NFR-S3 — a hard
  privacy rule).
- **Rate limiting** on Worker endpoints (Hono middleware) + Supabase Auth limits
  (NFR-S6). Dependency scanning weekly (NFR-S9).
- **Account-data deletion cascade (FR30/NFR-S8, ≤30 days).** A single service-role
  deletion routine removes, for a given user: (1) all owned `documents` + a **cache purge
  for every owned slug** (via the purge path below), (2) any `subscriptions` row + a
  cancel call to the payment processor, (3) the PostHog person (delete API), (4) the
  `auth.users` row last. DB-level `ON DELETE CASCADE` from `auth.users` covers
  `documents`/`subscriptions` as a backstop. Error-log PII (Sentry) is handled by bounded
  retention + scrub. **At launch this runs as a documented manual runbook** invoking the
  routine; the **fully-automated self-serve flow is a fast-follow** (the cascade itself is
  specified now).
- **Deletion *request path* (launch-ready, FR30/NFR-S8).** Execution may be manual at
  launch, but the **request intake is not**: an in-app "Request account deletion" action in
  premium settings (documented support address as fallback) requires **re-authentication
  (owner verification)**, writes a `deletion_requests` row (**audit trail**) that **starts
  the ≤30-day SLA clock**, and notifies the founder. The founder runs the cascade within
  SLA and marks the request `completed`. So intake + verification + audit + SLA exist from
  day one; only the end-to-end automation is deferred.

### API & Communication Patterns

- **Authed CRUD:** `supabase-js` (PostgREST) directly, secured by RLS — no hand-written
  CRUD API.
- **Cloudflare Workers (Hono), focused endpoint set:**
  - `GET /api/d/:slug` — recipient read; Cache-API edge-cached (short TTL backstop).
  - `/api/auth/*` — session helper: sets/rotates/clears the httpOnly **refresh** cookie,
    returns in-memory access tokens (see Session model).
  - `POST /api/webhooks/:processor` — subscription state → Supabase (service role).
  - `POST /api/analytics` — first-party event ingest → PostHog (keys server-side).
  - `POST /internal/cache/purge` — **not client-callable**; invoked only by the Supabase
    DB webhook below (shared-secret authenticated).
- **Cache-invalidation mechanism (closes the purge gap).** Because writes go direct to
  Supabase, purge is **server-driven, not client-trusted**: a **Supabase database webhook
  / trigger on `documents` UPDATE & DELETE** calls `POST /internal/cache/purge` to evict
  that slug's edge-cache entry. A short Cache-API TTL is the backstop. Correctness target
  is **delete-eviction** (so a deleted slug stops serving and 404s per NFR-R2); **edit
  staleness is explicitly acceptable in v1** (PRD §Real-Time: recipient view is
  read-once-then-cache, updates seen on reload), so the trigger primarily guarantees
  delete/owner-action freshness rather than live edit propagation.
- **Retention touch (closes the cache-vs-retention gap).** Because edge-cache *hits* bypass
  Postgres, `last_accessed_at` would never bump for actively-viewed diagrams → the ≥90-day
  cleanup (NFR-R3) could reap a live anonymous diagram. Fix: on every recipient read (hit
  **or** miss) the Worker fires an **async, sampled `touch_document(slug)`** (fire-and-forget;
  bumps `last_accessed_at` at most ~once/hour/slug to avoid write amplification). Retention
  is measured by real access, not by cache state.
- **Editable-share writes (FR25)** use `supabase.rpc('update_shared_document', {slug,
  grantToken, patch})` (PostgREST RPC, stays in the data plane — no extra Worker); the write
  fires the same `documents` trigger → cache purge. Rate-limited + size-capped in the RPC.
- **Contracts:** shared Zod schemas type-check Worker payloads and the engine
  `ViewState`. Consistent JSON error envelope; client errors surfaced via TanStack
  Query. Optimistic UI on create/save/share (NFR optimistic), debounced save (~500ms).

### Frontend Architecture

- **Engine package `@mermaidweb/render` (framework-agnostic)** exposes
  `DiagramController` (`mount/destroy`, commands `focus/path/collapse/expand/setDepth/
  panTo/resetLayout/setTheme/export`, events `viewStateChange/select/parseError/ready`). React
  binding (`<DiagramCanvas>` / `useDiagram`) lives app-side, extractable to
  `@mermaidweb/render-react` later. **The engine owns its SVG subtree; React never
  reconciles it.**
- **Binding = hybrid:** `view_state` is controlled (React holds canonical, engine emits
  deltas up, React debounces persistence); transient actions are imperative commands.
- **State:** Zustand 5 (client/UI/document — the controller can drive a vanilla store
  without React) + TanStack Query 5 (Supabase server state, optimistic).
- **Routing:** React Router v7 (SPA mode, `ssr:false`).
- **Editor/preview:** CodeMirror 6 (Mermaid editing, inline errors) + `react-markdown`
  (remark) preview; live flow = one text field → preview + debounced **per-fence**
  `controller.setSource()` (see Multi-block).
- **Multi-block documents (FR2/FR15a):** one Markdown source can embed **many** ```` ```mermaid ````
  fences of mixed types. `lib/markdown.ts` produces a **block registry** —
  `[{ fenceId, type, source }]` (stable `id=…` stamped per fence; `type` detected from the
  fence's first non-empty line) — the single source of truth for what renders where.
  `react-markdown` renders each fence as a **mount point**; the **Renderer Router runs per
  fence**, instantiating **one `DiagramController` per flowchart fence** and **one lazy
  `mermaid`-viewer per non-flowchart fence**. Each controller owns only its own SVG subtree
  and binds to its own **`view_state[fenceId]` slice**; a source edit re-stamps the registry
  and calls `setSource()` on the **affected fence(s) only**. (The controller is **per-fence,
  not per-document** — the data model's per-fence `view_state`, keyed by fence ID, already
  assumes exactly this; orphaned fence IDs are reconciled away on parse.)
- **Renderer Router (PRD seam):** runs **per fence** — flowchart/graph → native pipeline;
  all other Mermaid types → lazy-loaded full `mermaid` viewer (pan/zoom only, FR15a).
  **Required UX affordance (FR15a):** on a non-flowchart block the disclosure controls render
  in a **disabled state with an explanatory tooltip/badge** ("Disclosure is flowchart-only"),
  so fallback diagrams don't look broken — covered by an E2E test asserting the controls
  are disabled-with-explanation. **Code-split** the editor, the mermaid viewer-fallback,
  and elkjs to keep the recipient bundle within the self-imposed ~350KB proxy that serves
  the cold-load / first-render TTI targets (NFR-P1/P2 are time-based; the KB figure is our
  proxy, not the NFR itself).
- **Theming / branding (FR28, premium):** a document's `theme` (versioned schema in
  `packages/shared`) is applied by the engine as a **styling API** — `controller.setTheme
  (theme)` maps theme tokens to **CSS custom properties + style attributes** on the SVG
  subtree (no relayout). Because the recipient read returns the document's `theme`, **shared
  views are branded automatically**; and because SVG export **inlines** the resolved theme
  styles into the serialized artifact, branding **propagates to exports** too — covering
  FR28's "shared *and* exported outputs". Premium-gated via active `subscriptions.status`.

### Infrastructure & Deployment

- **Hosting:** Cloudflare (SPA static assets + Hono Workers) via `@cloudflare/vite-plugin`;
  Supabase data plane.
- **Environments:** Supabase CLI local (Docker) → per-PR Cloudflare preview + staging
  Supabase → production. Secrets via `wrangler secret`; service-role key only in Workers.
- **CI/CD (GitHub Actions):** typecheck · lint · Vitest · Playwright (critical paths,
  NFR-M3) · **perf-budget gate vs 200/500-node fixtures** (NFR-P8) → `wrangler deploy` +
  `supabase db push`.
- **Monitoring:** Sentry (single error channel, NFR-M4) + Workers/Supabase logs +
  PostHog; retention ≥30 days (NFR-M5).
- **Scaling:** edge-cached recipient read shields Postgres; 10× spike = Workers
  autoscale + cache, with Supabase compute tier as the one config dial (NFR-Sc1/Sc2).
- **Backup & DR (NFR-R5):** Supabase **Pro tier** = daily automated backups (PITR an
  optional add-on for tighter RPO). A **quarterly restore-test runbook — owned by the
  founder** — restores the latest backup to a scratch project and verifies integrity. The
  Cloudflare/edge tier is **stateless** (no backup); any R2 artifacts rely on bucket
  versioning. Backup tier + restore cadence + owner are recorded in the ops runbook.
- **Repo:** pnpm workspaces — `packages/render`, `packages/shared`, `apps/web` (the SPA +
  its Cloudflare Worker under `apps/web/worker/`), detailed in step-06.

### Decision Impact Analysis

**Implementation sequence — note: this intentionally supersedes the PRD's pre-spike
build order** (PRD §Implementation Considerations / Phase 1, which placed the backend
skeleton earlier). That order predates spike6 + `docs/architecture/06`; because the engine
is already built and the load-bearing residual risk is **unmeasured performance**, the
post-spike order front-loads the engine extraction + perf gate before the backend. If any
downstream artifact cites the PRD sequence, **this document is authoritative for build
order.**
1. Extract `@mermaidweb/render` + `DiagramController` (no behavior change); `packages/shared` types/Zod.
2. Perf harness: 200/500/1000-node fixtures + frame-time/cold-load probes → CI gate baseline.
3. App shell: Vite+React+Cloudflare scaffold, React Router, Zustand, `<DiagramCanvas>` binding; port the built disclosure family onto the package API.
4. Backend skeleton: Supabase schema + RLS + **anonymous auth (owner_id = anon uid)** + slug + `get_shared_document` RPC; Hono recipient-read Worker + `/api/auth/*` refresh-cookie route + the `documents` write-trigger → `/internal/cache/purge`.
5. Workspace: CodeMirror editor + react-markdown preview + live-sync; command palette; minimap.
6. Premium: auth conversion/claim, share permissions, export-with-collapse, themes, account-deletion routine — **then** wire the payment processor (Wave-1.1, just-in-time selection).
7. Analytics (PostHog) + Sentry wired continuously, verified before launch.

**Cross-component dependencies:**
- `view_state` shape is the contract binding engine ↔ data model ↔ export ↔ persistence — versioned in `packages/shared`.
- Fence-ID stamping couples the Markdown parse layer ↔ data model ↔ engine block identity.
- Edge-cache invalidation couples the write path (Supabase `documents` UPDATE/DELETE trigger) ↔ the Worker `/internal/cache/purge` ↔ the recipient-read cache. Delete-eviction is the correctness target (NFR-R2); edit staleness is acceptable (PRD §Real-Time).
- Uniform `owner_id` (anon or premium uid) + `is_anonymous` claim couples auth ↔ every data access path; the account-deletion cascade depends on this ownership + the purge path.
- The browser session model (in-memory access token + httpOnly refresh cookie via `/api/auth/*`) couples the SPA auth bootstrap ↔ the Worker auth route ↔ direct supabase-js CRUD.

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

**Critical Conflict Points Identified:** ~15 areas where independent AI agents could
diverge. Two are project-specific (engine conformance; the Postgres↔TS casing seam);
the rest are conventional. These rules are binding on every agent and every PR.

### Rule 0 — Conform to the existing engine (highest priority)

The `spike6/` engine is the seed of `@mermaidweb/render`. Agents MUST match its
established conventions and MUST NOT rename or "simplify" them:
- Module files: **kebab-case** (`parser-adapter.ts`, `effective-ir.ts`).
- IR/types: **camelCase** fields (`fromCluster`, `toCluster`, `originalPoints`,
  `labelPos`); types/interfaces **PascalCase** (`IRNode`, `NodeShape`).
- DOM hooks: `data-node-id`, `data-subgraph-id`; live data on `mountEl.__meta`.
- Edge identity: `L_<index>`; node `(x,y)` is the **center** (renderer translates to
  top-left). Edges are 4-point side-aware curves.
- The invariants in `docs/architecture/05-invariants-and-parity.md`
  (`fromCluster`/`toCluster`, `graph.children()` order, edge-id identity) are
  **inviolable** — changing them breaks Mermaid parity.

### Naming Patterns

**Database (Postgres / Supabase):** `snake_case`; **plural** tables (`documents`,
`subscriptions`); PK `id` (uuid); FK `<entity>_id` (`owner_id`); timestamps
`created_at` / `updated_at` / `last_accessed_at` (`timestamptz`); indexes
`idx_<table>_<cols>`; RLS policies `<table>_<action>_<audience>`
(`documents_select_owner`).

**API (Hono Workers, app-facing):** routes under `/api/*`, lowercase kebab, plural
nouns, params `:slug` / `:id`; **request/response JSON fields are camelCase** (see
casing rule).

**Code (TypeScript):** React components `PascalCase.tsx`; hooks `useThing.ts`; other
modules `kebab-case.ts`; functions/variables `camelCase`; types/interfaces
`PascalCase`; constants `UPPER_SNAKE_CASE`; booleans `isX` / `hasX`.

### Structure Patterns

- **Monorepo (pnpm):** `packages/render` (engine), `packages/shared` (types + Zod +
  casing maps), `apps/web` (React SPA + its Cloudflare Worker), detailed in step-06.
- **Feature-first** inside `apps/web/src/features/<feature>/` (workspace, editor,
  canvas, palette, share, account); cross-cutting UI in `components/`, hooks in
  `hooks/`, non-UI helpers in `lib/`.
- **Tests co-located** as `*.test.ts(x)` (Vitest); Playwright E2E in `e2e/`.

### Format Patterns

- **Casing seam (the one rule):** **camelCase in TS, snake_case in DB.** The ONLY place
  mapping happens is a Zod transform layer in `packages/shared`. No ad-hoc mapping
  anywhere else; never let `snake_case` leak into app/engine code.
- **Worker responses:** success = the bare resource as JSON (HTTP status conveys
  outcome); error = `{ "error": { "code": string, "message": string } }` with the
  correct HTTP status. (Direct supabase-js calls keep Supabase's native shape, mapped
  via `packages/shared`.)
- **Dates:** ISO-8601 UTC strings in all JSON. **IDs:** uuid v4 internal; base62 slug
  (≥64-bit) external.

### Communication Patterns

- **Engine events:** the existing camelCase controller events
  (`viewStateChange` / `select` / `parseError` / `ready`) — extend, never rename.
- **State (Zustand):** multiple **domain stores** — `useWorkspaceStore` (doc/source),
  `useDiagramStore` (the controlled `view_state` ↔ controller bridge), `useUiStore`
  (panes/palette/theme). Immutable updates only, inside store actions; components read
  via selectors. No mutation outside actions; no cross-store reach-in.
- **Server state (TanStack Query):** centralized query-key factory in
  `lib/query-keys.ts` (`documents.detail(slug)`, `documents.list(userId)`); never
  hand-write key arrays inline.
- **`view_state` schema** changes go through the versioned schema in `packages/shared`.

### Process Patterns

- **Validation:** Zod at every boundary (Worker input, forms, `view_state` on
  load/parse). Parse-don't-validate; reuse shared schemas — no duplicate hand-written
  validators.
- **Error handling:** React error boundary per route; Worker errors → JSON envelope +
  Sentry; engine `parseError` surfaced **inline in the editor** (FR5). User-facing
  message text is distinct from logged technical detail.
- **Loading:** TanStack Query `isPending`/`isFetching`; skeletons on first load, inline
  spinners on refetch. **Optimistic mutations with rollback** for create/save/share;
  in-flight edits preserved on failure (NFR-R6).
- **Auth flow:** anonymous sign-in is **lazy** — fired on the **first create/persist action**,
  not on page load (FR16), so read-only recipients never mint `auth.users` rows and recipient
  cold-load isn't coupled to an auth round-trip; convert via
  `updateUser` on signup (FR19); **authorize only with verified `getUser()`**, never
  `getSession()`.

### Enforcement Guidelines

**All AI agents MUST:**
- Read this section + `docs/architecture/05-invariants-and-parity.md` before writing code.
- Pass TypeScript strict, ESLint, Prettier — CI blocks on any lint/type error.
- Keep all DB↔TS mapping inside `packages/shared`; import types from there, never
  redefine DTOs locally.
- Add/extend Zod schemas in `packages/shared` rather than inlining validation.

**Pattern enforcement:** ESLint config + `tsconfig` strict are the machine-checkable
floor; this section is the human-checkable source of truth; violations are fixed in the
PR that introduces them, not deferred.

### Pattern Examples

**Good:**
- `const { ownerId } = mapDocument(row)` — snake→camel mapping via `packages/shared`.
- `queryClient.invalidateQueries({ queryKey: documents.detail(slug) })` after a save.
- `useDiagramStore.getState().setViewState(next)` driven by the engine's
  `viewStateChange` event.

**Anti-patterns:**
- `row.owner_id` used directly in a React component (casing leak).
- A second `interface Document {…}` redefined inside `apps/web` (DTO drift).
- Re-running full `layout()` on drag, or renaming `fromCluster`/`toCluster` (breaks
  engine invariants).
- Authorizing a request from `getSession()` (unverified) instead of `getUser()`.

## Project Structure & Boundaries

### Complete Project Directory Structure

The existing repo becomes the pnpm-workspaces monorepo root; `spike6/src/` migrates into
`packages/render` (git history preserved), and the harness HTML pages become the package
demo. `docs/architecture/**` and the planning artifacts stay as-is.

```
mermaidweb/
├── package.json                      # workspace root (pnpm)
├── pnpm-workspace.yaml
├── tsconfig.base.json                # strict; path aliases to @mermaidweb/*
├── .eslintrc.cjs · .prettierrc · .gitignore
├── .github/workflows/ci.yml          # typecheck · lint · vitest · playwright · perf-gate · deploy
│
├── packages/
│   ├── render/                       # @mermaidweb/render — framework-agnostic engine
│   │   ├── src/
│   │   │   ├── types.ts                      # IR model (camelCase fields)
│   │   │   ├── parser-adapter.ts             # parseToIR (mermaid = parser only)
│   │   │   ├── effective-ir.ts               # deriveEffectiveIR (collapse → surrogates)
│   │   │   ├── layout.ts · recursive-layout.ts · layout-core.ts · cluster-bbox.ts
│   │   │   ├── renderer.ts                   # renderFull → SVG (data-* hooks, __meta)
│   │   │   ├── drag.ts · pan.ts · connect.ts
│   │   │   ├── collapse.ts · depth.ts · focus.ts · path.ts · disclosure-overlay.ts
│   │   │   ├── routing.ts · astar.ts         # optional A* (off by default)
│   │   │   ├── controller.ts                 # NEW: DiagramController facade
│   │   │   └── index.ts                      # public API barrel
│   │   ├── fixtures/                         # fixture_*.mmd + generated 200/500/1000-node
│   │   ├── perf/                             # frame-time + cold-load probes
│   │   ├── demo/                             # ex-harness (index/our-renderer/mermaid-debug)
│   │   └── package.json · tsconfig.json
│   │
│   └── shared/                       # @mermaidweb/shared — the ONLY DB↔TS mapping layer
│       ├── src/
│       │   ├── schemas/{document,view-state,subscription}.ts   # Zod (+ version on view-state)
│       │   ├── mappers.ts                    # mapDocument(row) snake→camel, and back
│       │   ├── types.ts · index.ts
│       └── package.json · tsconfig.json
│
├── apps/
│   └── web/                          # React SPA + its Cloudflare Worker (one Vite project)
│       ├── index.html · vite.config.ts        # Vite 8 + @cloudflare/vite-plugin + react
│       ├── wrangler.jsonc                     # not_found_handling=single-page-application; bindings
│       ├── public/robots.txt                  # Disallow: /d/
│       ├── src/
│       │   ├── main.tsx · app.tsx · router.tsx # React Router v7 (SPA mode)
│       │   ├── routes/                         # /, /d/:slug, /app, /account, /pricing
│       │   ├── features/
│       │   │   ├── workspace/                  # FR1–4: panes + live-sync; FR21 per-diagram delete (anon)
│       │   │   ├── editor/                     # FR1,5: CodeMirror 6 (inline errors)
│       │   │   ├── preview/                    # FR2: react-markdown
│       │   │   ├── canvas/                     # FR3,15: <DiagramCanvas> + Renderer Router
│       │   │   ├── disclosure/                 # FR6–11: collapse/focus/path/depth controls
│       │   │   ├── palette/                    # FR12–13: cmdk fuzzy search
│       │   │   ├── minimap/                    # FR14
│       │   │   ├── share/                      # FR22–25: view/edit grants; FR24 "create your own"/duplicate
│       │   │   ├── export/                     # FR29: SVG w/ collapse state (PNG/PDF fast-follow)
│       │   │   ├── account/                    # FR20,28,30
│       │   │   └── auth/                       # FR16–19,26: anon + signup + claim
│       │   ├── components/                     # shared UI primitives
│       │   ├── hooks/                          # useDiagram, useAutoSave, useAnonSession
│       │   ├── stores/                         # workspace-store · diagram-store · ui-store (Zustand)
│       │   ├── lib/
│       │   │   ├── supabase.ts                 # browser client; in-memory access token
│       │   │   ├── auth.ts                      # bootstrap + refresh via /api/auth/*
│       │   │   ├── query-client.ts · query-keys.ts
│       │   │   ├── markdown.ts                 # fence parse + stable-id stamping
│       │   │   └── analytics.ts                # PostHog → /api/analytics; visitor_id distinct_id + alias→anon uid on create
│       │   └── styles/
│       ├── worker/                            # the Cloudflare Worker (Hono)
│       │   ├── index.ts                        # Hono app
│       │   ├── routes/
│       │   │   ├── shared-document.ts           # GET /api/d/:slug (edge-cached); sets visitor_id + fires recipient_open
│       │   │   ├── auth.ts                      # /api/auth/* (httpOnly refresh cookie)
│       │   │   ├── webhooks.ts                  # POST /api/webhooks/:processor
│       │   │   ├── analytics.ts                 # POST /api/analytics
│       │   │   ├── cache-purge.ts               # POST /internal/cache/purge (DB-webhook only)
│       │   │   └── account.ts                   # account-deletion cascade routine
│       │   └── middleware/{rate-limit,cors,webhook-auth}.ts
│       ├── e2e/                                # Playwright critical paths (NFR-M3)
│       └── package.json · tsconfig.json
│
├── supabase/
│   ├── config.toml                            # CLI local stack
│   └── migrations/                            # SQL: documents, document_grants, subscriptions, deletion_requests,
│                                              #      RLS, get_shared_document + update_shared_document + touch_document RPCs,
│                                              #      documents UPDATE/DELETE webhook → cache-purge, ON DELETE CASCADE
│
└── docs/architecture/**                       # existing as-built engine docs (unchanged)
```

### Architectural Boundaries

**API boundaries:**
- **Client → Supabase** (authed CRUD): `supabase-js` (PostgREST) under RLS — list/rename/
  delete/save own documents (FR20/21), create (FR16, owned by anon uid), claim (FR19).
- **Client → Worker** (`/api/*`): recipient read, `/api/auth/*` session refresh, analytics ingest.
- **Worker → Supabase** (service role): `get_shared_document(slug)` RPC, webhook writes, deletion cascade.
- **Supabase DB webhook → Worker**: `documents` UPDATE/DELETE → `/internal/cache/purge` (shared-secret).
- **Payment processor → Worker**: `/api/webhooks/:processor` (processor selected just-in-time, Wave-1.1).

**Component boundaries:**
- React owns the container + chrome; **`@mermaidweb/render` owns the SVG subtree** —
  React never reconciles it. Sole bridge = `DiagramController` (props in · imperative
  commands · events out). The engine imports nothing app-side; it never imports React,
  Supabase, or stores.

**State boundaries:**
- **Engine** = geometry truth (ephemeral, recomputed). **Zustand domain stores** =
  client/UI/document truth. **TanStack Query** = server cache. The controlled
  `view_state` is the only object that crosses engine↔store↔server.

**Data boundaries:**
- `documents` + RLS is the persistence boundary; `packages/shared` is the **only** place
  snake_case↔camelCase mapping and Zod validation occur; the `view_state` schema (versioned
  in `shared`) is the contract for engine ↔ persistence ↔ export.

### Requirements → Structure Mapping (cross-cutting)

- **Anonymous identity & claim (FR16–19):** `features/auth` + `hooks/useAnonSession` +
  Supabase anonymous auth (**every doc owned by the anon `auth.uid()`** — fully persisted +
  shareable) + `updateUser` conversion; RLS keys off `auth.uid()`/`is_anonymous`. Session
  bootstrap/refresh via `lib/auth.ts` ↔ `worker/routes/auth.ts`.
- **Live-sync (FR1–2):** `features/workspace` orchestrates: editor change → `lib/markdown.ts`
  (parse + stamp) → `preview` re-render + debounced `controller.setSource()`.
- **Disclosure (FR6–11) + non-flowchart affordance (FR15a):** behavior in `packages/render`
  (built); UI triggers in `features/disclosure`; state via `diagram-store` ↔ controller
  `viewStateChange`. On non-flowchart blocks the controls render disabled-with-explanation
  (E2E-tested).
- **Sharing capability (FR22–25):** `features/share` mints/revokes `document_grants`
  (view/edit tokens, direct RLS); recipients read via the slug and edit via
  `update_shared_document` RPC validating an `edit` grant. **Recipient → creator (FR24):**
  a "Create your own" / "Duplicate this" affordance in the shared-workspace chrome creates a
  new recipient-owned document (lazy anon uid, fresh slug) and fires `recipient_became_creator`.
- **Per-diagram delete (FR21):** a "Delete diagram" action — workspace chrome for the anon
  owner, `features/account` dashboard for premium — direct RLS DELETE → `documents` DELETE
  trigger → cache-purge → the slug's one sanctioned 404 (NFR-R2).
- **Export with collapse state (FR29):** `features/export` reads current `view_state` +
  `controller.export('svg')` — **SVG at launch** (the renderer is already SVG, so this is a
  serialize-with-applied-`view_state` path, near-free); PNG/PDF rasterization is a
  post-launch fast-follow.
- **Themes / branding (FR28, premium):** `features/account` edits the `theme`; the engine
  applies it via `controller.setTheme` (renderer styling API), recipient reads return it
  (branded shares), and SVG export inlines it (branded exports). Gated on active
  `subscriptions.status`.
- **Account-data deletion (FR30/NFR-S8):** request via `features/account` (re-auth →
  `deletion_requests` row, audit + SLA) → execution via `worker/routes/account.ts` cascade
  (documents + per-slug cache purge, subscriptions + processor cancel, PostHog person,
  `auth.users`). Manual runbook drives execution at launch; intake/audit/SLA live from day one.

### Integration Points & Data Flow

**Auth bootstrap:** on load, `lib/auth.ts` calls `/api/auth/refresh`; the Worker reads the
httpOnly refresh cookie, exchanges it with Supabase, returns a fresh **in-memory** access
token. With no cookie the SPA stays **unauthenticated for read-only browsing** (recipient
reads use the public `get_shared_document` path and need no session); `signInAnonymously()`
is **deferred to the first create/persist action** — consistent with the lazy Auth-flow
process pattern, *not* fired on page load — minting the anon uid then, and the Worker sets
the refresh cookie as a **persistent** cookie (long Max-Age) so anonymous work survives a
browser restart (FR17). All subsequent CRUD is direct supabase-js under RLS.

**Author save path:** edit → `workspace` → `diagram-store` (engine deltas) → debounced
TanStack mutation → `supabase-js` write (optimistic, RLS-scoped to `owner_id`) → the
Supabase `documents` UPDATE trigger fires `/internal/cache/purge` for that slug (server-
driven; the client does not purge). Edit staleness for recipients is acceptable per PRD
§Real-Time; delete eviction is guaranteed (NFR-R2).

**Diagram delete path (FR21, anonymous *and* premium).** A single per-diagram **"Delete
diagram"** action — surfaced in the **workspace chrome for the anonymous owner** and in the
**account dashboard for premium** (FR20) — issues a direct `supabase-js` DELETE under RLS
(`owner_id = auth.uid()`, identical for anon and premium because ownership is uniform). The
`documents` **DELETE trigger** fires `/internal/cache/purge`, so the slug stops serving and
**404s — the one sanctioned 404 (NFR-R2).** This is distinct from the account-wide cascade
below (FR30): FR21 deletes one diagram; FR30 deletes the whole account.

**Recipient cold path:** `GET /api/d/:slug` (Hono Worker, edge-cached) → `get_shared_document`
RPC → document JSON → SPA hydrates → engine `parseToIR → layout → renderFull` →
author's saved `view_state` applied. On the same read (hit **or** miss — both bypass the
client) the Worker, async: (1) sets a **first-party, non-auth `visitor_id` cookie** if absent
— a random id, persistent, Secure, SameSite=Lax, **not** a Supabase identity; it is the
analytics correlation id that **exists at open time**, before any anon uid, and is disclosed
in the cookie notice (first-party only, no ad-tech); (2) fires a sampled `touch_document(slug)`
(retention); and (3) fires the **server-side `recipient_open` event keyed to `visitor_id`**
(FR39's distribution-loop leading metric — emitted Worker-side because a cache hit never
reaches the client). Lazy-load CodeMirror /
mermaid-fallback only if needed.

**Recipient → creator path (FR24 — the distribution loop's conversion).** Every shared
workspace shows a one-click **"Create your own"** affordance in the recipient chrome —
always visible, never behind signup. Two shapes, both producing a **brand-new `documents`
row owned by the recipient**:
- **New** (the default, obvious FR24 action) — opens a fresh workspace (`/app`, blank or a
  starter); nothing is copied.
- **Duplicate this** (optional "remix") — copies the shared doc's `markdown` (fences
  **re-stamped** with fresh IDs) and deep-copies the matching `view_state` slices into the
  new row.

The create action is the trigger for **lazy `signInAnonymously()`** (Auth bootstrap): the
recipient gets an anon uid *then*, and the new row is written direct via `supabase-js` under
RLS with `owner_id = that uid` and a fresh `slug`. **Analytics identity bridge (closes the
attribution gap):** `recipient_open` was keyed to the pre-auth `visitor_id`, which exists from
the first shared read; at this first-create moment the client issues a PostHog
**`identify(anonUid)` carrying the prior `visitor_id` as `$anon_distinct_id`** (an alias /
person-merge), folding the open and the create into **one PostHog person**. Only then does
**`recipient_became_creator`** (keyed to the anon uid) join back to that visitor's
`recipient_open` — the recipient→creator conversion the 6-week gate rides on (FR39; PRD
§Success). Because the Supabase anon uid is **preserved** on any later premium signup
(`updateUser`), the PostHog identity stays stable across the claim — no second alias is
needed. The recipient is now a first-class owner (edit / delete / share).

**Editable-share write path (FR25):** recipient on an `edit` link → `supabase.rpc
('update_shared_document', {slug, grantToken, patch})` → RPC validates a live `edit` grant →
write → `documents` trigger → cache purge. (Owner edits use the direct RLS path above.)

**Account-deletion path:** request → in-app "Request account deletion" (re-auth) writes a
`deletion_requests` row (audit + ≤30-day SLA) → execution: `worker/routes/account.ts`
(service role) deletes owned documents (+ purge each slug) → cancels/deletes subscription at
processor + local row → PostHog person delete → deletes `auth.users` → marks request
`completed`. Manual runbook drives execution at launch; intake/audit/SLA are live from day one.

**External integrations:** Supabase (data plane), Cloudflare (edge/host), PostHog (analytics),
Sentry (errors), payment processor (Wave-1.1; processor chosen just-in-time, isolated to the
webhook Worker + `subscriptions`).

### Development Workflow Integration

- **Dev:** `supabase start` (Docker) + `pnpm --filter web dev` (Vite + `workerd` via the
  Cloudflare plugin → SPA + Worker together).
- **Build:** `pnpm -r build`; the Cloudflare plugin emits SPA assets + Worker; `packages/*`
  build first (workspace topo order).
- **Deploy:** CI runs the gate, then `wrangler deploy` + `supabase db push`; per-PR preview
  deploys point at the staging Supabase project.

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:** All chosen technologies are current (June 2026) and mutually
compatible: Vite 8 · React 19 · `@cloudflare/vite-plugin` 1.0 · Supabase (`supabase-js` 2 in
the browser with an in-memory token store; `@supabase/ssr` used server-side in the `/api/auth/*`
Worker for the refresh-cookie exchange) · Zustand 5 · TanStack Query 5 · React Router 7 · Hono ·
CodeMirror 6. The
`@mermaidweb/render` engine is framework-agnostic plain TS, so it embeds under React without
conflict. The Cloudflare-host + Supabase-data-plane split is a proven, well-trodden pattern;
the one cross-provider hop (Worker→Supabase) is shielded on the hot path by the edge cache.
No contradictory decisions found.

**Pattern Consistency:** The casing seam (camelCase TS / snake_case DB, mapped only in
`packages/shared`), the engine-conformance rule (Rule 0), and the naming/communication/process
patterns all align with the stack. The controlled-`view_state` binding is consistent across
data model → engine → persistence → export.

**Structure Alignment:** The pnpm monorepo (`packages/render`, `packages/shared`, `apps/web`
+ its Worker) directly realizes the engine-package boundary and the single-mapping-layer rule.
Boundaries (React owns container / engine owns SVG subtree; RLS as the data boundary) are
expressible in the structure as drawn.

### Requirements Coverage Validation ✅

**Functional Requirements (Wave 1.1):**
- Workspace/editing FR1–5 → `features/{workspace,editor,preview,canvas}` + inline parse errors.
- Disclosure FR6–11 → `packages/render` (built) + `features/disclosure`.
- Navigation FR12–15a → `features/{palette,minimap}`, engine pan/zoom, Renderer Router +
  lazy mermaid viewer.
- Persistence/session FR16–21 → Supabase anonymous auth, `documents` + RLS, slug, claim;
  **per-diagram delete (FR21)** via in-workspace action (anon) / account dashboard (premium)
  → DELETE trigger → cache-purge → sanctioned 404 (NFR-R2).
- Sharing FR22–25 → slug = view capability + edge-cached Worker read; **editable shares
  (FR25) via `document_grants` edit tokens + `update_shared_document` RPC** (non-owner write
  path; owner RLS otherwise blocks recipients); **recipient "Create your own" / duplicate
  (FR24)** → new recipient-owned `documents` row + `recipient_became_creator` (see
  Recipient → creator path).
- Account/premium FR26–30 → auth/OAuth, **themes (FR28: `controller.setTheme` on render → branded shared *and* SVG-exported outputs)**, `controller.export('svg')` (collapse state; PNG/PDF fast-follow), deletion. **Premium-only writes gate on active `subscriptions.status`, not the `is_anonymous` claim.**
- Observability FR39–41 → PostHog + `/api/analytics` Worker. Distribution-loop events are
  designed explicitly: `recipient_open` fires **Worker-side on the cached `/api/d/:slug`
  read path** keyed to a **pre-auth first-party `visitor_id` cookie** (an edge-cache hit
  never reaches the client, and no anon uid exists yet at open time); on first create the
  client **aliases `visitor_id` → the anon uid** (PostHog `identify` with `$anon_distinct_id`)
  so `recipient_open` and `recipient_became_creator` resolve to one person and the
  recipient→creator conversion actually computes; verified live pre-launch.
- FR31–38 (AI, Code Connect) → correctly **seam-only** (Waves 1.2/1.3): premium auth +
  quota hooks land later; no architecture rework required.

**Non-Functional Requirements:**
- Performance P1/P2/P7 (cold-load, first-render, save→URL) → edge-cached recipient read +
  optimistic save + code-splitting (within the self-imposed ~350KB proxy). P3/P4/P5/P8 →
  client-side engine + a **CI perf-budget gate**: frame-time budgets block on the 200-node
  (P3) and 500-node (P4) fixtures per NFR-P8; the 1000-node fixture is the **no-crash floor**
  (P5), not a frame-time gate.
- Security S1–S11 → disk-level encryption + RLS + ≥64-bit slugs + noindex/robots + TLS +
  bcrypt + SAQ-A hosted checkout + ≤30-day deletion cascade + weekly dep scan + (1.2)
  no-train LLM posture. **NFR-S6 is partial by ratified decision:** refresh token is
  httpOnly; access token is in-memory (accepted deviation — PRD annotation applied 2026-06-02).
- Reliability R1–R6 → **Supabase Pro daily backups + quarterly restore-test runbook
  (NFR-R5)**, slug stability (no 404 except owner delete, NFR-R2), `last_accessed_at`-driven
  ≥90-day retention **with the Worker retention-touch on cached reads**, optimistic-with-
  rollback degradation.
- Scalability Sc1–Sc2 → edge cache shields Postgres; Workers autoscale; Supabase tier = the
  one config dial.
- Maintainability M1–M5 / Cost C1–C4 → automated CI/CD, ≤30-min local (Supabase CLI + pnpm),
  critical-path Playwright, Sentry, low Cloudflare opex.

### Implementation Readiness Validation ✅

- **Decisions** documented with verified versions; the four open decisions are all resolved.
  Payment-*processor* selection is a Wave-1.1 decision deferred to just-in-time (the seam is
  processor-agnostic); the session model is decided (browser-held, hardened).
- **Structure** is concrete (complete tree, boundaries, FR→location mapping, data-flow paths).
- **Patterns** cover the conflict points including the two project-specific ones (engine
  conformance, casing seam) with examples and anti-patterns.

### Gap Analysis Results

**Critical gaps (block implementation):** None.

**Important gaps (track, non-blocking):**
1. **Payment-processor selection (Wave-1.1, just-in-time — NOT post-MVP)** — the premium
   *milestone* (FR27/NFR-S7) can't ship until Paddle/Stripe is chosen; the rest of premium
   (auth, claim, share permissions, export, themes) is unblocked. Seam is processor-agnostic
   (webhook Worker + `subscriptions`). *Re-scoping premium out of 1.1 is a PRD correct-course
   option, not an architecture change.*
2. **Performance is addressed but unmeasured** — NFR-P3/P4/P5 are validated only once the CI
   perf-gate + 200/500/1000-node fixtures exist (impl step 2). Carried risk from `docs/
   architecture/06`. The architecture *enables* the proof; it is not yet proven.
3. **Net-new (specced, not built):** command palette, minimap, Renderer Router, mermaid
   viewer-fallback, **SVG export** (serialize the live SVG with `view_state` applied —
   net-new but low-risk; PNG/PDF deferred to a fast-follow), the **recipient "Create your
   own" / duplicate flow (FR24)**, and the **theming pipeline (FR28: `setTheme` → branded
   shares + theme inlined into SVG export)** — expected at architecture stage; flagged so
   they aren't assumed done.
4. **Integration points now specified, need focused tests:** the cache purge path
   (Supabase `documents` write-trigger → `/internal/cache/purge`; delete-eviction per NFR-R2);
   the sampled retention-touch (`touch_document`); the editable-share RPC
   (`update_shared_document` grant validation + rate-limit); and `view_state` fence-ID
   stamping + orphan reconciliation (multi-block).

**Nice-to-have (later):** PNG/PDF export (SVG ships in Wave 1.1; raster/PDF is a
fast-follow), elkjs "Adaptive" layout, version history / diff view, app-level field
encryption, self-serve account-deletion UI — all deferred by design.

### Validation Issues Addressed

No critical issues. The important gaps above are documented with owners/triggers; the two
carried risks (perf unmeasured, comprehension thesis unvalidated) are product/sequencing
concerns surfaced from `docs/architecture/06`, not architecture defects — both are mitigated
by the front-loaded CI perf-gate and the pre-launch beta.

**Post-review corrections (2026-06-01).** A design review surfaced six issues, all resolved
in this revision:
1. *Payment mislabeled post-MVP* → re-categorized as a Wave-1.1 just-in-time processor
   selection (Decisions + Gap #1).
2. *Anonymous ownership inconsistency* (`owner_id null` vs RLS `auth.uid()`) → `owner_id NOT
   NULL`; anonymous docs owned by the Supabase anonymous uid and **fully persisted/shareable**
   (the proposal to drop anonymous persistence was rejected — it would break the FR16–22
   distribution loop).
3. *Cache purge path undefined* → Supabase `documents` UPDATE/DELETE webhook → Worker
   `/internal/cache/purge` + short TTL; delete-eviction is the NFR-R2 target, edit staleness
   acceptable per PRD §Real-Time.
4. *Session model contradiction* (httpOnly cookies vs direct browser CRUD) → resolved as
   browser-held + hardened: in-memory access token + httpOnly refresh cookie via `/api/auth/*`
   Worker route (keeps direct CRUD; a full BFF was rejected as contradicting the hybrid topology).
5. *Account deletion unarchitected* → explicit service-role cascade routine (documents + cache
   purge, subscriptions + processor cancel, PostHog person, `auth.users`); manual runbook at
   launch, self-serve UI deferred.
6. *FR15a affordance missing* → disclosure controls render disabled-with-explanation on
   non-flowchart blocks, with an E2E test.

Plus a governance note: the implementation sequence explicitly **supersedes** the PRD's
pre-spike build order (rationale in Decision Impact Analysis).

**Second-review corrections (2026-06-01).** A follow-up review surfaced six more, all resolved:
1. *Editable sharing unauthorized (FR25)* → added `document_grants` (view/edit capability
   tokens) + `update_shared_document` SECURITY DEFINER RPC validating an `edit` grant
   (owner-only RLS otherwise blocks recipients). The grant token is the revocable edit
   capability.
2. *Session relaxes NFR-S6* → **ratified** as an explicit accepted deviation (in-memory
   access token; httpOnly refresh token); no longer claimed as S6-compliant; PRD NFR-S6
   annotation recommended.
3. *Cached reads break ≥90-day retention* → Worker fires an async sampled
   `touch_document(slug)` on every recipient read (hit or miss), ~once/hour/slug.
4. *Deletion lacked a request path* → `deletion_requests` table + in-app re-auth'd intake
   (audit trail + ≤30-day SLA clock); execution still manual at launch.
5. *Backup/restore unarchitected (NFR-R5)* → Supabase Pro daily backups + founder-owned
   quarterly restore-test runbook; edge tier stateless.
6. *Payment timing vs PRD Open Decision #5* → recorded as an **intentional deferral**; PRD
   Open Decision #5's trigger updated to "before the premium milestone" (done 2026-06-02).

**Third-review corrections (2026-06-02).** A third pass (this review) applied the following,
with matching PRD `correct-course` edits where the PRD was the system of record:
1. *350KB bundle "budget" misattributed* → relabelled as a self-imposed engineering proxy for
   the TTI NFRs (the renderer ADR had **retired** the number and the PRD defines no KB NFR);
   it is not a release gate.
2. *Premium entitlement under-specified* → paid-feature writes (edit-grant minting, themes,
   export) now gate **server-side on active `subscriptions.status`**, not the `is_anonymous`
   claim (which only separates anon-vs-registered).
3. *Export scope reduced for MVP* → **Wave 1.1 ships SVG export only**; PNG/PDF are a
   post-launch fast-follow. Applied to FR29 + premium-tier scope in the PRD and to the export
   feature/mapping here. (Founder decision, 2026-06-02.)
4. *`noindex` mechanism on `/d/*`* → specified as an **`X-Robots-Tag` response header** (the
   load-bearing control for the SPA-fallback HTML), with `robots.txt` + no-sitemap as backups.
5. *Distribution-loop analytics undesigned* → `recipient_open` fires **Worker-side** on the
   cached read path; recipient→creator attributed across the anon→signup transition.
6. *Eager anonymous sign-in* → made **lazy** (first create/persist action), avoiding
   `auth.users` bloat from read-only recipients and keeping recipient cold-load off an auth
   round-trip; the refresh cookie is **persistent** so anonymous work survives restart (FR17).
7. *Governance reconciliations executed in the PRD:* NFR-S6 access-token deviation annotated;
   build-order supersession noted on both PRD build-order lists; Open Decision #5 trigger
   updated to "before the premium milestone."

Plus a precision fix: the CI perf-budget **frame-time** gate blocks on the 200/500-node
fixtures (NFR-P8); the 1000-node fixture is the no-crash floor (NFR-P5), not a frame gate.

**Fourth-review corrections (2026-06-02).** A follow-up review surfaced five FR-coverage gaps
where the architecture under-served an existing PRD requirement (no PRD change needed — these
were architecture omissions, not PRD defects); all resolved here:
1. *FR24 recipient → creator unarchitected* → added the **"Create your own" / "Duplicate this"**
   flow: an always-visible recipient affordance, a new recipient-owned `documents` row (lazy
   anon uid, fresh slug; re-stamped fences + copied `view_state` on duplicate), and the
   `recipient_became_creator` conversion event (see Integration Points & Data Flow).
2. *Lazy anonymous-auth inconsistency* → the **Auth bootstrap** data-flow now matches the
   Process-pattern: `signInAnonymously()` is deferred to first create/persist (not page load),
   recipient reads stay unauthenticated, and the refresh cookie is persistent (FR17).
3. *Multi-block Markdown under-specified* → defined the **block registry** (`lib/markdown.ts`
   → `[{fenceId, type, source}]`) and **one controller per fence** (flowchart) / lazy viewer
   per non-flowchart fence, each bound to its `view_state[fenceId]` slice (FR2/FR15a).
4. *Themes were a field, not an architecture* → added the versioned `theme` schema, the engine
   **styling API** (`controller.setTheme` → CSS vars/attrs on the SVG), **share-view
   application** (theme returned on recipient read), and **export serialization** (theme
   inlined into the SVG) — covering FR28's "shared *and* exported outputs".
5. *Anonymous delete too implicit* → added the explicit **per-diagram delete path (FR21)**:
   in-workspace action (anon) / dashboard (premium) → RLS DELETE → `documents` DELETE trigger
   → cache-purge → the one sanctioned 404 (NFR-R2), distinct from the FR30 account cascade.

**Fifth-review corrections (2026-06-02).** One remaining cross-cutting gap resolved:
- *Distribution-loop attribution was inconsistent with lazy auth* — `recipient_open` fired at
  read time when (per the lazy-auth decision) no anon uid yet exists, so it could not be joined
  to a `recipient_became_creator` keyed on the later uid, breaking the PRD's recipient-open and
  recipient→creator metrics. **Fix:** a **first-party, non-auth `visitor_id` cookie** is set on
  the first shared read and is the `distinct_id` for `recipient_open`; on first create the
  client **aliases `visitor_id` → the anon uid** (PostHog `identify` + `$anon_distinct_id`),
  merging them into one person so the conversion computes. Eager anon-auth-for-recipients was
  considered and rejected — it would reintroduce the `auth.users` bloat the lazy-auth fix
  removed. The anon uid is preserved on premium signup, so identity is stable across the claim.

### Architecture Completeness Checklist

**Requirements Analysis**
- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed
- [x] Technical constraints identified
- [x] Cross-cutting concerns mapped

**Architectural Decisions**
- [x] Critical decisions documented with versions
- [x] Technology stack fully specified
- [x] Integration patterns defined
- [x] Performance considerations addressed (measurement pending CI gate — see Gap #2)

**Implementation Patterns**
- [x] Naming conventions established
- [x] Structure patterns defined
- [x] Communication patterns specified
- [x] Process patterns documented

**Project Structure**
- [x] Complete directory structure defined
- [x] Component boundaries established
- [x] Integration points mapped
- [x] Requirements to structure mapping complete

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION (all 16 checklist items confirmed; no critical
gaps — the open items are a Wave-1.1 just-in-time payment-processor selection and an
unmeasured-perf risk that the first implementation steps are designed to close).

**Confidence Level:** High — the hardest, novel risk (the renderer/layout/disclosure engine)
is already built and spike6-validated; remaining work is conventional web-SaaS scaffolding
around it, with the residual risk concentrated in measurement (perf) and validation (thesis),
both explicitly sequenced first.

**Key Strengths:**
- Builds on a validated engine; the boundary keeps it framework-free and reusable.
- Minimal, boring, low-opex stack matched to a solo-founder weekend pace.
- Privacy/security posture (capability slugs, RLS, noindex, SAQ-A) is coherent end-to-end.
- One source-of-truth data model with a single DB↔TS mapping seam.

**Areas for Future Enhancement:** elkjs adaptive layout; sequence-diagram disclosure
graduation; version history/diff; richer multi-diagram canvas; app-level field encryption if
enterprise demand appears.

### Implementation Handoff

**AI Agent Guidelines:**
- Follow all architectural decisions exactly as documented.
- Use the implementation patterns consistently; obey Rule 0 (engine conformance) and the
  `docs/architecture/05` invariants.
- Respect project structure and boundaries; keep all DB↔TS mapping in `packages/shared`.
- Refer to this document for all architectural questions.

**First Implementation Priority:** Extract `spike6/src/` → `@mermaidweb/render` behind the
`DiagramController` facade (no behavior change), then land the perf harness + CI gate —
before the app shell and backend skeleton.

---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics']
inputDocuments:
  - docs/prd.md
  - _bmad-output/planning-artifacts/architecture.md
scope: 'Wave 1.1 (FR1-30, 39-41); FR31-38 deferred to Waves 1.2/1.3 (seam-only)'
---

# MermaidWeb - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for MermaidWeb, decomposing the requirements from the PRD and Architecture into implementable stories. (No UX Design document exists — the PRD defers final workspace layout/pane count to the design phase, so there is no UX spec to extract from.)

**Binding scope:** Wave 1.1 launch — **FR1–FR30, FR39–FR41** and all Wave 1.1 NFRs. **FR31–FR38** (AI Generation, Code Connect) and Wave 1.2+ NFRs are **seam-only / out of scope** for these epics; the architecture provides design seams now, but no implementation stories are generated for them yet.

## Requirements Inventory

### Functional Requirements

**Diagram Workspace & Editing**

- **FR1 [1.1]:** Any user can paste, type, or edit Mermaid syntax in a source-text surface and see the rendered diagram update without manual refresh.
- **FR2 [1.1]:** Any user can write Markdown that contains embedded Mermaid blocks and see both the rendered Markdown preview and the interactive diagram canvas update from the same source.
- **FR3 [1.1]:** Any user can interact with the rendered Mermaid canvas (click, hover, select nodes) directly, not just view it as a static image.
- **FR4 [1.1]:** Any user can resize the source surface, preview surface, and diagram canvas relative to one another within the workspace.
- **FR5 [1.1]:** The Mermaid editor surfaces syntax errors inline in a way the user can locate and correct without leaving the workspace.

**Progressive Disclosure Family** *(flowchart-first; FR6–11 apply to flowchart/graph diagrams)*

- **FR6 [1.1]:** Any user can collapse a subgraph into its parent node and re-expand it, reversibly.
- **FR7 [1.1]:** Any user can enter a "focus" state on a selected node such that nodes not connected to it are visually de-emphasized.
- **FR8 [1.1]:** Any user can select two nodes and have the path(s) between them visually highlighted (path mode). *Pre-approved fallback: may ship in a 2–4-week fast-follow patch if intractable in Wave 1.1 budget.*
- **FR9 [1.1]:** Any user can adjust a depth-based control such that the diagram auto-collapses everything below a chosen depth, reversibly.
- **FR10 [1.1]:** Any user can exit any disclosure mode and return the diagram to its fully-expanded default state.
- **FR11 [1.1]:** Disclosure interactions can be triggered both by direct manipulation (click) and by keyboard.

**Navigation & Wayfinding**

- **FR12 [1.1]:** Any user can open a command palette and search for nodes by label using fuzzy matching.
- **FR13 [1.1]:** Any user can navigate to (focus / scroll to) a node selected from the command palette.
- **FR14 [1.1]:** Any user can see a minimap that indicates the current viewport position relative to the full diagram.
- **FR15 [1.1]:** Any user can pan and zoom the diagram canvas.
- **FR15a [1.1]:** Any user can render a Markdown document containing non-flowchart Mermaid types (sequence, class, state, ER, gantt, etc.) via Mermaid's renderer with pan/zoom. The disclosure family does not apply; the UI clearly indicates disclosure is flowchart-specific (controls disabled-with-explanation). Unknown/future types fall back to this viewer path automatically.
- **FR15b [1.1]:** Any user can switch a flowchart's edge routing to an orthogonal (A\*-based) layout as an alternative to the default side-aware curves; the chosen mode is saved with the diagram and reproduced for recipients of a shared link. (Flowchart/graph only; non-flowchart fallbacks unaffected. MVP = single on/off mode with fixed routing defaults; per-diagram tuning is post-launch.)

**Persistence & Session Management**

- **FR16 [1.1]:** Any user can create a diagram without signing up or providing personal information.
- **FR17 [1.1]:** Anonymous diagrams persist across browser sessions on the same device via a session token.
- **FR18 [1.1]:** Each diagram (anonymous or premium) receives a unique, cryptographically random short URL slug that does not encode the diagram content.
- **FR19 [1.1]:** A premium user can claim diagrams previously created anonymously in the same browser session, associating them with their account on signup.
- **FR20 [1.1]:** A premium user can list, rename, and delete the diagrams they own.
- **FR21 [1.1]:** Any user can delete a diagram they created (anonymous via the diagram's UI; premium via account dashboard).

**Sharing & Recipient Experience**

- **FR22 [1.1]:** Any user can copy or send a short URL that opens their diagram in a fully interactive workspace for the recipient.
- **FR23 [1.1]:** A recipient opening a shared URL gets the same disclosure family (where the diagram type supports it), command palette, and minimap available to the original creator, without signing up.
- **FR24 [1.1]:** A recipient can create their own new diagram from any shared workspace in a single, obvious action.
- **FR25 [1.1]:** A premium user can share a diagram with a chosen permission level (view-only or editable) such that recipients are restricted accordingly.

**Account & Premium Features**

- **FR26 [1.1]:** A user can create a premium account using email + password, and over time using OAuth (Google, GitHub) as a fast-follow.
- **FR27 [1.1]:** A premium user can subscribe, change plan, or cancel via a hosted-checkout flow that does not expose card data to MermaidWeb.
- **FR28 [1.1]:** A premium user can apply custom themes / branding to their diagrams that propagate to shared and exported outputs.
- **FR29 [1.1]:** A premium user can export any diagram to **SVG**, with the diagram's current collapse state preserved. *(PNG/PDF export are a post-launch fast-follow — de-scoped from Wave 1.1 on 2026-06-02.)*
- **FR30 [1.1]:** A premium user can request deletion of all account data and have it carried out within a documented timeframe (≤30 days).

**Observability & Analytics**

- **FR39 [1.1]:** The system records weekly active users, diagrams created, diagrams shared, recipient opens of shared URLs, recipient → creator conversions, and returning-author rates.
- **FR40 [1.1]:** The system records free → premium conversion events at the moment of paid signup.
- **FR41 [1.1]:** Analytics instrumentation is verified live and producing data before the public launch, not retrofitted afterward.

**Deferred (out of Wave 1.1 scope — listed for the capability contract; NOT decomposed into stories here)**

- **FR31–FR35 [1.2]:** AI-assisted generation (code→diagram, prose→diagram, improvement suggestions, usage quota, no-training posture).
- **FR36–FR38 [1.3]:** Code Connect (bind node↔file, bidirectional navigation, line-range bindings).

### NonFunctional Requirements

**Performance**

- **NFR-P1 [1.1]:** Recipient cold-load time-to-interactive ≤ 3.0 s on broadband (50 Mbps) for a 200-node diagram. (Distribution-loop SLA.)
- **NFR-P2 [1.1]:** Time-to-first-render ≤ 1.5 s on broadband for a 200-node diagram.
- **NFR-P3 [1.1]:** Disclosure interaction frame time ≤ 16 ms p50 and ≤ 33 ms p95 on a 200-node diagram on a typical engineer laptop.
- **NFR-P4 [1.1]:** Disclosure interaction frame time degrades gracefully on a 500-node diagram (≤ 33 ms p50, no visible judder).
- **NFR-P5 [1.1]:** Diagrams of 200+ nodes (no-crash floor: 1000+ nodes) render and support basic interactions without crashing the browser or losing work.
- **NFR-P7 [1.1]:** Anonymous-diagram save → share URL ready ≤ 300 ms p50.
- **NFR-P8 [1.1]:** Performance budgets enforced continuously against a fixture set (200/500 nodes) checked into the test suite. Regressions block release.

**Security & Privacy**

- **NFR-S1 [1.1]:** All diagram content encrypted at rest. Anonymous diagrams accessible only via their random slug; premium additionally scoped to the owning account.
- **NFR-S2 [1.1]:** Slugs cryptographically random with ≥ 64 bits effective entropy; sequential/guessable slugs forbidden.
- **NFR-S3 [1.1]:** All diagram pages return `noindex, nofollow`, are excluded from `robots.txt`, never appear in a sitemap, and are never surfaced in any public discovery surface.
- **NFR-S4 [1.1]:** All network traffic uses TLS 1.2+; HTTP redirected to HTTPS.
- **NFR-S5 [1.1]:** Premium passwords hashed with argon2id (or bcrypt with current cost factor); never stored recoverably.
- **NFR-S6 [1.1]:** Session tokens HTTP-only, Secure, SameSite=Lax minimum; login/password-reset rate-limited. *Accepted deviation (ratified 2026-06-01): refresh token is httpOnly; short-lived access token held in browser memory (JS-readable) to enable direct RLS CRUD — not full S6 compliance, with compensating controls (strict CSP, short access-TTL, refresh rotation, in-memory not localStorage).*
- **NFR-S7 [1.1]:** Card data never touches MermaidWeb infrastructure; processor hosted-checkout only (PCI-DSS SAQ-A).
- **NFR-S8 [1.1]:** A working data-deletion path exists for premium users, executed within 30 days of request.
- **NFR-S9 [1.1]:** Dependencies scanned for known vulnerabilities at least weekly; high-severity patched within 7 days of disclosure.
- *(NFR-S10–S11 [1.2]: AI no-training posture + prompt-injection-aware handling — deferred with Wave 1.2.)*

**Reliability & Durability**

- **NFR-R1 [1.1]:** Diagram save/load succeeds for ≥ 99.5% of attempts measured monthly (write reliability/durability, not marketing-page uptime).
- **NFR-R2 [1.1]:** Once issued, a short share URL does not 404 except by explicit owner-initiated deletion.
- **NFR-R3 [1.1]:** Anonymous diagrams persist ≥ 90 days from last access; deletion policy documented and enforced thereafter.
- **NFR-R4 [1.1]:** Premium diagrams persist indefinitely until owner deletes them or closes the account.
- **NFR-R5 [1.1]:** Backups at least daily for premium diagram storage; restore tested at least quarterly.
- **NFR-R6 [1.1]:** Graceful degradation when backend is unreachable: in-flight edits preserved in browser state, clear error shown rather than silent loss.

**Scalability**

- **NFR-Sc1 [1.1]:** Supports ≥ 200 WAU at week 6 with headroom for a 10× spike without write failures or share-URL latency exceeding 1 s p95.
- **NFR-Sc2 [1.1]:** Hosting/database elastic enough that absorbing a viral spike is a configuration change, not a re-architecture.
- *(NFR-Sc3 [1.2], NFR-Sc4 [V2]: LLM cost bounding and beyond-V1 re-architecture — out of Wave 1.1 scope.)*

**Maintainability**

- **NFR-M1 [1.1]:** Build, test, deploy automated end-to-end; no manual deployment steps in the release process.
- **NFR-M2 [1.1]:** A new maintainer (or future-Ahmed after a 3-month gap) can run the full stack locally from documented setup in ≤ 30 minutes.
- **NFR-M3 [1.1]:** Critical user-facing paths (workspace, disclosure family, share URL recipient flow, premium signup) have automated tests running in CI before deploy.
- **NFR-M4 [1.1]:** Production errors surfaced via a single error-monitoring channel; founder alerted on new error classes.
- **NFR-M5 [1.1]:** Logs/metrics for each user-facing FR area retained ≥ 30 days.

**Cost**

- **NFR-C1 [1.1]:** Wave 1.1 monthly opex (hosting, DB, transactional email, domain, monitoring) stays under a documented, sustainable-without-revenue ceiling.
- **NFR-C4 [1.1]:** Hosting/storage costs scale roughly linearly with usage; reserved capacity sized for current usage with auto-scale headroom.
- *(NFR-C2–C3 [1.2]: LLM-spend bounding and pre-ship cost monitoring — deferred with Wave 1.2.)*

### Additional Requirements

*(Technical/infrastructure requirements derived from the Architecture document that materially shape epics and stories. The Architecture's implementation sequence **intentionally supersedes** the PRD's pre-spike build order — engine extraction + perf gate front-loaded before the backend.)*

- **AR1 — Starter / project init (Epic 1, Story 1):** Scaffold the monorepo and the Vite 8 + React 19 + TypeScript SPA via `npm create vite@latest … --template react-ts`, add `@cloudflare/vite-plugin` + `wrangler` (Workers runtime, bindings, SPA fallback `not_found_handling=single-page-application`) and `@supabase/supabase-js`. Project initialization is the first implementation story.
- **AR2 — Engine extraction (FIRST implementation priority):** Extract `spike6/src/` → `@mermaidweb/render` (framework-agnostic, React-free) behind a `DiagramController` facade (`mount/destroy/setSource`; commands `focus/path/collapse/expand/setDepth/panTo/resetLayout/setTheme/setEdgeMode/export`; events `viewStateChange/select/parseError/ready`) with **no behavior change**, git history preserved. The engine owns its SVG subtree; React never reconciles it.
- **AR3 — Perf harness + CI perf-gate (impl step 2, before backend):** 200/500/1000-node fixtures + frame-time/cold-load probes → a CI perf-budget gate. Frame-time gate blocks on 200-node (NFR-P3) and 500-node (NFR-P4) fixtures; the 1000-node fixture is the no-crash floor (NFR-P5). **Also gates an A\*-enabled 200-node first-render/route-time variant** (FR15b — a shared A\*-routed diagram re-routes on the recipient's cold load, so NFR-P1/P2 must hold with A\* on); A\* routing cost at 200/500 nodes is currently unmeasured and this gate is what proves it safe.
- **AR4 — Monorepo structure (pnpm workspaces):** `packages/render` (engine), `packages/shared` (types + Zod + casing maps), `apps/web` (React SPA + its Cloudflare Worker under `apps/web/worker/`). Feature-first under `apps/web/src/features/<feature>/`. Tests co-located (`*.test.tsx`, Vitest); Playwright E2E under `e2e/`.
- **AR5 — Single DB↔TS mapping seam:** `packages/shared` is the ONLY place snake_case↔camelCase mapping (Zod transforms / `mapDocument`) and shared validation occur. No DTO redefinition or casing leak in app/engine code.
- **AR6 — Supabase data plane / migrations:** Postgres schema + RLS for `documents`, `document_grants`, `subscriptions`, `deletion_requests`; SECURITY DEFINER RPCs `get_shared_document`, `update_shared_document`, `touch_document`; `documents` UPDATE/DELETE webhook → cache-purge; `ON DELETE CASCADE` from `auth.users`. Migrations are in-repo Supabase CLI SQL. Source of truth = Markdown text; IR/layout/SVG always recomputed by the engine, never persisted. `view_state` jsonb keyed by stable fence IDs.
- **AR7 — Identity / session model:** Supabase **anonymous auth** (every doc owned by an `auth.uid()`, uniform across tiers); **lazy** `signInAnonymously()` on first create/persist (not page load); uid-preserving `updateUser` conversion = automatic anonymous→premium claim (FR19). Browser-held hardened session: **in-memory access token + httpOnly/Secure/SameSite=Lax refresh cookie** owned by a `/api/auth/*` Worker route. Authorize only with verified `getUser()`, never `getSession()`.
- **AR8 — Cloudflare Workers (Hono) endpoint set:** `GET /api/d/:slug` (recipient read, edge-cached), `/api/auth/*` (refresh-cookie session helper), `POST /api/webhooks/:processor` (subscription state), `POST /api/analytics` (PostHog ingest, keys server-side), `POST /internal/cache/purge` (DB-webhook only, shared-secret). Worker middleware: rate-limit, cors, webhook-auth.
- **AR9 — Edge-cache invalidation:** server-driven purge via Supabase `documents` UPDATE/DELETE trigger → `/internal/cache/purge`; short Cache-API TTL backstop. **Delete-eviction is the correctness target** (NFR-R2); edit staleness is acceptable in v1 (recipient view is read-once-then-cache).
- **AR10 — Retention touch:** on every recipient read (hit or miss) the Worker fires an async sampled `touch_document(slug)` (≤ ~once/hour/slug) so edge-cache hits don't starve the ≥90-day retention clock (NFR-R3).
- **AR11 — Engine conformance (Rule 0, highest priority):** Match the spike6 engine conventions — kebab-case modules, camelCase IR fields, PascalCase types, `data-node-id`/`data-subgraph-id` hooks, `L_<index>` edge identity, node `(x,y)` = center. The invariants in `docs/architecture/05-invariants-and-parity.md` (`fromCluster`/`toCluster`, `graph.children()` order, edge-id identity) are inviolable — changing them breaks Mermaid parity. Drag = pin-and-recalculate (never re-run full `layout()` on drag).
- **AR12 — Renderer Router + multi-block (FR2/FR15a):** runs **per fence**. `lib/markdown.ts` produces a block registry `[{fenceId, type, source}]` (stable `id=` stamped per fence, stripped before parse). One `DiagramController` per flowchart fence; one lazy `mermaid` viewer per non-flowchart fence; each bound to its own `view_state[fenceId]` slice. Source edits re-stamp the registry and call `setSource()` on affected fences only.
- **AR13 — Theming pipeline (FR28):** versioned `theme` schema in `packages/shared`; engine applies via `controller.setTheme` (CSS custom properties + style attrs on the SVG subtree, no relayout); theme returned on recipient read (branded shares) and inlined into SVG export (branded exports). Premium-gated.
- **AR14 — Analytics identity bridge (FR39–41):** first-party PostHog only (no GA/ad-tech). A pre-auth first-party `visitor_id` cookie set on first shared read is the `distinct_id` for the Worker-side `recipient_open` event; on first create the client aliases `visitor_id` → anon uid (`identify` + `$anon_distinct_id`) so recipient_open and `recipient_became_creator` merge to one person. Sentry for error monitoring. Verified live pre-launch.
- **AR15 — Premium entitlement enforcement:** paid-feature writes (edit-grant minting, custom themes, export) gate **server-side on active `subscriptions.status`** inside the SECURITY DEFINER RPC / RLS predicate — **never on the `is_anonymous` claim alone** (a lapsed registered user must lose premium features).
- **AR16 — Payment processor (Wave-1.1, just-in-time):** the payment *capability* (hosted checkout, FR27/NFR-S7) is in Wave-1.1 scope; only *processor selection* (Stripe vs Paddle) is deferred to the premium milestone. Architecture is processor-agnostic (webhook Worker + `subscriptions` row), so this blocks only the premium milestone, not the architecture.
- **AR17 — CI/CD + environments + ops:** GitHub Actions: typecheck · lint · Vitest · Playwright (critical paths) · perf-budget gate → `wrangler deploy` + `supabase db push`. Environments: Supabase CLI local (Docker) → per-PR Cloudflare preview + staging Supabase → production. Supabase Pro daily backups + founder-owned quarterly restore-test runbook (NFR-R5). `X-Robots-Tag: noindex, nofollow` response header on every `/d/*` route + `robots.txt Disallow: /d/` + no sitemap (NFR-S3).
- **AR18 — Account-deletion cascade (FR30/NFR-S8):** launch-ready intake (in-app re-auth'd "Request account deletion" → `deletion_requests` audit row + ≤30-day SLA clock) + a service-role cascade routine (owned documents + per-slug cache purge → subscription cancel at processor + local row → PostHog person delete → `auth.users` last). Manual runbook drives execution at launch; self-serve automation is a fast-follow.
- **AR19 — Edge routing modes (FR15b):** the engine carries three edge-routing modes — **side-aware curves (Mermaid-parity default)**, dagre, and **opt-in A\*** orthogonal routing (the spike6 `routing.ts`/`astar.ts`/`gridOverlay.ts` modules). A\* is **additive** — it does not change the default look or the `docs/architecture/05` invariants. Selected via `controller.setEdgeMode('side-aware'|'dagre'|'astar')`; **MVP exposes a single on/off toggle with fixed routing defaults** (cell size / connectivity / separation hardcoded to spike-validated values — no user tunables). The mode persists per-doc in **`view_state.edgeMode`** (versioned `packages/shared` contract) so a shared A\*-routed diagram reproduces for the recipient (FR23). The A\* module is **lazy-loaded on demand** (only when `view_state.edgeMode === 'astar'`) so side-aware diagrams never pay its bundle weight (NFR-P1). Carries the AR3 A\*-enabled perf-gate obligation.

### UX Design Requirements

_Not applicable — no UX Design document exists. The PRD explicitly defers the final workspace layout / pane count (Open Decision #3) to the design phase. Workspace-layout stories therefore carry that as an explicit open design point rather than a fixed spec._

### FR Coverage Map

_All 34 Wave 1.1 FRs mapped to an epic; none missed. (FR31–38 deferred to Waves 1.2/1.3.)_

- **FR1:** Epic 2 — Edit Mermaid source with live render
- **FR2:** Epic 2 — Markdown w/ embedded Mermaid → preview + canvas from one source
- **FR3:** Epic 1 — Interactive canvas (click/hover/select)
- **FR4:** Epic 2 — Resizable source/preview/canvas panes
- **FR5:** Epic 2 — Inline syntax errors in the editor
- **FR6:** Epic 1 — Collapse/expand a subgraph, reversibly
- **FR7:** Epic 1 — Focus mode (de-emphasize unconnected nodes)
- **FR8:** Epic 1 — Path mode (highlight path between two nodes)
- **FR9:** Epic 1 — Depth slider (auto-collapse below a depth)
- **FR10:** Epic 1 — Exit any disclosure mode to fully-expanded default
- **FR11:** Epic 1 — Click + keyboard disclosure triggers
- **FR12:** Epic 1 — Command palette fuzzy node search
- **FR13:** Epic 1 — Navigate to a node selected from the palette
- **FR14:** Epic 1 — Minimap with viewport indicator
- **FR15:** Epic 1 — Pan and zoom the canvas
- **FR15a:** Epic 2 — Non-flowchart Mermaid types render via viewer fallback (per-fence Renderer Router; disclosure controls disabled-with-explanation)
- **FR15b:** Epic 1 — Opt-in A\* orthogonal edge routing (side-aware default), persisted per-doc and reproduced for recipients
- **FR16:** Epic 3 — Create a diagram without signing up
- **FR17:** Epic 3 — Anonymous diagrams persist across browser sessions
- **FR18:** Epic 3 — Cryptographically random short URL slug (no content encoding)
- **FR19:** Epic 4 — Claim anonymous diagrams on signup
- **FR20:** Epic 4 — List, rename, delete owned diagrams (premium dashboard)
- **FR21:** Epic 3 — Delete a diagram you created (anon via workspace UI)
- **FR22:** Epic 3 — Copy/send a short URL opening an interactive recipient workspace
- **FR23:** Epic 3 — Recipient gets full disclosure family + palette + minimap, no signup
- **FR24:** Epic 3 — Recipient creates their own diagram from a shared workspace in one action
- **FR25:** Epic 4 — Share with view-only vs editable permission
- **FR26:** Epic 4 — Email+password account (OAuth Google/GitHub fast-follow)
- **FR27:** Epic 4 — Subscribe/change/cancel via hosted checkout (no card data on MermaidWeb)
- **FR28:** Epic 4 — Custom themes/branding propagated to shared + exported outputs
- **FR29:** Epic 4 — Export to SVG with current collapse state preserved
- **FR30:** Epic 4 — Request deletion of all account data (≤30 days)
- **FR39:** Epic 3 — Record WAU, creates, shares, recipient opens, recipient→creator, returning-author
- **FR40:** Epic 4 — Record free→premium conversion at paid signup
- **FR41:** Epic 3 — Analytics verified live and producing data before public launch

## Epic List

### Epic 1: Interactive Comprehension Canvas
A user can load a Mermaid flowchart and interactively explore it with the full progressive-disclosure family (collapse/expand, focus, path, depth slider) plus navigation (command palette, minimap) and pan/zoom — the core comprehension experience that is the product's reason to exist. Carries the foundation, because this is where the engine first reaches a user: pnpm monorepo + Vite/React/Cloudflare project init (AR1), extraction of `spike6/src/` → `@mermaidweb/render` + `DiagramController` facade with no behavior change (AR2), the 200/500/1000-node perf harness + CI perf-budget gate (AR3), app shell + React `<DiagramCanvas>` binding (engine owns its SVG subtree), then the already-built disclosure family ported onto the package API. Obeys engine-conformance Rule 0 + the `docs/architecture/05` invariants (AR11).
**FRs covered:** FR3, FR6, FR7, FR8, FR9, FR10, FR11, FR12, FR13, FR14, FR15, FR15b
**NFRs anchored:** P1, P2, P3, P4, P5, P8 (perf gate, incl. A\*-enabled variant); M1, M2, M3 (CI, local-run, critical-path tests)
**Standalone:** delivers the interactive comprehension canvas fed by a minimal source input; enables every later epic.

### Epic 2: Markdown-Native Authoring Workspace
A user can author and edit in the full live workspace — a Mermaid source editor ↔ rendered Markdown preview ↔ interactive canvas all syncing from one source — with embedded multi-block Mermaid documents, resizable panes, inline syntax errors, and a graceful viewer-fallback for non-flowchart diagram types. Mechanism: CodeMirror 6 editor, `react-markdown` preview, the `lib/markdown.ts` block registry with stable per-fence IDs, and the per-fence Renderer Router (one `DiagramController` per flowchart fence, one lazy `mermaid` viewer per non-flowchart fence) (AR12). Workspace pane count/layout is an open design decision (PRD Open Decision #3) resolved within this epic.
**FRs covered:** FR1, FR2, FR4, FR5, FR15a
**Standalone:** upgrades Epic 1's minimal input into the real workspace; complete authoring surface.

### Epic 3: Persistence, Sharing & the Distribution Loop
A user can create without signup, have anonymous work persist across sessions, get a clean cryptographically-random short share URL, delete their own diagrams, and have recipients land in a fully interactive workspace and become creators in one click — instrumented with the distribution-loop analytics the 6-week gate rides on. Mechanism: Supabase data plane (schema + RLS + lazy anonymous auth, AR6/AR7), `get_shared_document` RPC, the Hono recipient-read Worker (edge-cached) + `/api/auth/*` refresh-cookie route + `documents` write-trigger → `/internal/cache/purge` (AR8/AR9), sampled retention touch (AR10), and the PostHog `visitor_id`→anon-uid analytics identity bridge with Worker-side `recipient_open` (AR14). Recipient parity (FR23) includes the author's **saved edge-routing mode** — a shared A\*-routed diagram reproduces via `view_state.edgeMode` (FR15b, AR19). Completes the free tier; CI/CD + ops + privacy headers (AR17) land here.
**FRs covered:** FR16, FR17, FR18, FR21, FR22, FR23, FR24, FR39, FR41
**NFRs anchored:** S1–S4 (encryption, slugs, noindex, TLS); R1–R3, R6 (durability, no-404, retention, degradation); P1, P2, P7 (cold-load, first-render, save→URL); Sc1, Sc2 (viral-spike headroom)
**Standalone:** completes the free product end-to-end.

### Epic 4: Premium Accounts & Monetization
A user can sign up — claiming the anonymous diagrams from their browser — manage their diagrams (list/rename/delete), share with view-only vs editable permissions, apply custom branding, export to SVG with collapse state preserved, subscribe/change/cancel via a hosted-checkout flow, and request deletion of all account data. Mechanism: Supabase uid-preserving conversion + `document_grants` edit-capability tokens + `update_shared_document` RPC, theming pipeline via `controller.setTheme` (AR13), `controller.export('svg')`, server-side entitlement gating on active `subscriptions.status` (AR15), a processor-agnostic webhook Worker with just-in-time Stripe/Paddle selection (AR16), and the launch-ready deletion-request intake + cascade routine (AR18).
**FRs covered:** FR19, FR20, FR25, FR26, FR27, FR28, FR29, FR30, FR40
**NFRs anchored:** S5 (password hashing), S6 (session model — accepted deviation), S7 (SAQ-A hosted checkout), S8 (deletion path), R4 (premium persistence), R5 (backups/restore); C1 (opex ceiling)
**Standalone:** the complete premium tier built on top of the free product.

## Epic 1: Interactive Comprehension Canvas

A user can load a Mermaid flowchart and interactively explore it with the full progressive-disclosure family plus navigation and pan/zoom — the core comprehension experience. This epic carries the foundation: monorepo + project init, engine extraction to `@mermaidweb/render`, the perf harness + CI gate, and the React `<DiagramCanvas>` binding, then the already-built disclosure family ported onto the package API. Engine-conformance Rule 0 and the `docs/architecture/05` invariants are inviolable throughout.

### Story 1.1: Scaffold the monorepo and application shell

As a founder-engineer,
I want the pnpm-workspaces monorepo and the Vite + React + TypeScript SPA scaffolded on Cloudflare,
So that all subsequent engine and app work shares one consistent build, test, and deploy pipeline.

**Acceptance Criteria:**

**Given** a clean checkout
**When** I run the documented initialization
**Then** a pnpm-workspaces monorepo exists with `packages/render`, `packages/shared`, and `apps/web`
**And** `pnpm -r build` completes successfully in workspace topological order (AR4).

**Given** the app workspace
**When** it is scaffolded
**Then** `apps/web` is a Vite 8 + React 19 + TypeScript (strict) SPA created via `create-vite react-ts`, with `@cloudflare/vite-plugin` + `wrangler` configured and `not_found_handling = "single-page-application"` (AR1).

**Given** the dev command
**When** I run `pnpm --filter web dev`
**Then** the SPA and its Cloudflare Worker serve together locally (Vite + `workerd`) and a placeholder route renders in the browser.

**Given** a new maintainer (or future-Ahmed after a gap)
**When** they follow the documented setup process
**Then** the full stack runs locally in ≤ 30 minutes (NFR-M2)
**And** TypeScript strict, ESLint, and Prettier are configured and pass cleanly on the scaffold.

### Story 1.2: Extract the render engine into `@mermaidweb/render` behind a DiagramController

As a founder-engineer,
I want the spike6 engine extracted into a framework-agnostic `@mermaidweb/render` package behind a `DiagramController` facade with no behavior change,
So that the validated engine is reusable under React without React ever reconciling its SVG.

**Acceptance Criteria:**

**Given** `spike6/src/`
**When** it is migrated into `packages/render/src` (git history preserved)
**Then** the public API barrel exposes `parseToIR`, `layout`, `renderFull`, `attachDrag`, `deriveEffectiveIR`, and a `DiagramController` facade with `mount`/`destroy`/`setSource`, commands (`focus`/`path`/`collapse`/`expand`/`setDepth`/`panTo`/`resetLayout`/`setTheme`/`setEdgeMode`/`export`), and events (`viewStateChange`/`select`/`parseError`/`ready`) (AR2).

**Given** the extracted engine
**When** the existing harness and fixtures run
**Then** behavior is identical to spike6 (no behavior change)
**And** the engine imports nothing app-side (no React, Supabase, or store imports).

**Given** engine conventions
**When** the code is reviewed
**Then** kebab-case modules, camelCase IR fields, PascalCase types, `data-node-id`/`data-subgraph-id` hooks, `L_<index>` edge identity, and node `(x,y)` = center are all preserved, and the `docs/architecture/05` invariants (`fromCluster`/`toCluster`, `graph.children()` order, edge-id identity) are unchanged (AR11).

**Given** the shared package
**When** the engine's `ViewState` type is defined
**Then** `packages/shared` holds the single, versioned `view_state` Zod schema the engine consumes, with no duplicate validators elsewhere (AR5).

### Story 1.3: Performance harness and CI perf-budget gate

As a founder-engineer,
I want 200/500/1000-node fixtures with frame-time and cold-load probes wired into a CI perf-budget gate,
So that the unmeasured-performance risk is closed and any regression blocks release.

**Acceptance Criteria:**

**Given** the engine package
**When** fixtures are generated
**Then** 200-, 500-, and 1000-node flowchart fixtures exist under `packages/render/fixtures` and are checked into the repo (AR3, NFR-P8).

**Given** a disclosure interaction on the 200-node fixture
**When** frame time is probed
**Then** the gate asserts ≤ 16 ms p50 and ≤ 33 ms p95 (NFR-P3)
**And** on the 500-node fixture it asserts ≤ 33 ms p50 (NFR-P4).

**Given** the 1000-node fixture
**When** it is rendered and basically interacted with
**Then** it does not crash — the no-crash floor (NFR-P5) — and is asserted as such without a frame-time gate.

**Given** the 200-node fixture with edge routing set to A\* (`view_state.edgeMode = 'astar'`)
**When** cold-load first-render and A\* route-time are probed
**Then** the gate asserts they meet the recipient cold-load / first-render targets (NFR-P1/P2) with A\* on, since a shared A\*-routed diagram re-routes on the recipient (FR15b, AR3, AR19)
**And** if the A\* variant cannot meet the budget, that is surfaced as the carried perf risk before A\* shares ship.

**Given** a PR that regresses a perf budget
**When** CI runs
**Then** the perf-gate fails and blocks the deploy (NFR-P8, NFR-M1)
**And** the GitHub Actions pipeline runs typecheck · lint · Vitest · perf-gate (AR17, NFR-M1/M3).

### Story 1.4: Interactive diagram canvas with pan and zoom

As a user,
I want to load a Mermaid flowchart into an interactive canvas and pan, zoom, and select nodes,
So that I can treat a large diagram as something I can manipulate rather than a static image.

**Acceptance Criteria:**

**Given** a minimal source input (paste/textarea) containing valid flowchart Mermaid
**When** I submit it
**Then** a React `<DiagramCanvas>` mounts a `DiagramController` and renders the diagram as SVG, with React owning the container and the engine owning the SVG subtree (FR3, AR2).

**Given** a rendered diagram
**When** I click or hover a node
**Then** the node is highlighted/selectable and the controller emits a `select` event (FR3).

**Given** a rendered diagram
**When** I drag-pan and zoom (wheel/controls)
**Then** the canvas pans and zooms smoothly and node/edge geometry preserves Mermaid layout parity (FR15).

**Given** invalid Mermaid source
**When** it is submitted
**Then** the controller emits `parseError` and the canvas shows a non-fatal error state rather than crashing (full inline editor errors arrive in Epic 2).

### Story 1.5: Collapse and expand subgraphs

As a user,
I want to collapse a subgraph into a single parent node and re-expand it,
So that I can hide the parts of a large diagram I don't currently care about.

**Acceptance Criteria:**

**Given** a flowchart containing a subgraph
**When** I trigger collapse on that subgraph
**Then** it folds into its parent node and connected edges re-route to the surrogate, via `controller.collapse` (FR6).

**Given** a collapsed subgraph
**When** I trigger expand
**Then** it returns to its expanded layout reversibly (FR6, FR10).

**Given** a collapse or expand action
**When** it completes
**Then** the `view_state.collapsed[]` slice updates via the `viewStateChange` event into the diagram store (AR5).

**Given** the 200-node fixture
**When** a collapse interaction runs
**Then** it meets the frame-time budget (NFR-P3).

### Story 1.6: Depth slider

As a user,
I want a depth control that auto-collapses everything below a chosen depth,
So that I can see the top-level shape of a diagram before drilling into detail.

**Acceptance Criteria:**

**Given** a flowchart
**When** I set the depth control to depth N
**Then** all nodes below depth N auto-collapse via `controller.setDepth`, reversibly (FR9).

**Given** a depth setting
**When** I raise the depth back up
**Then** deeper levels re-expand and the diagram moves toward fully-expanded (FR9, FR10).

**Given** a depth change
**When** it completes
**Then** `view_state.depth` updates via `viewStateChange`.

**Given** the 200-node fixture
**When** a depth change runs
**Then** it meets the frame-time budget (NFR-P3).

### Story 1.7: Focus mode

As a user,
I want to focus on a selected node so unconnected nodes are de-emphasized,
So that I can build a mental model around one entity in a large diagram.

**Acceptance Criteria:**

**Given** a selected node
**When** I enter focus mode
**Then** nodes and edges not connected to it are visually de-emphasized (e.g., reduced opacity) via `controller.focus`, as an IR-adjacency overlay with no relayout (FR7).

**Given** focus mode is active
**When** I exit it
**Then** full emphasis is restored (FR7, FR10).

**Given** focus is ephemeral
**When** it is applied
**Then** it is an overlay and is NOT persisted into `view_state` collapse state, consistent with the engine's focus/path overlay model.

**Given** the 200-node fixture
**When** a focus interaction runs
**Then** it meets the frame-time budget (NFR-P3).

### Story 1.8: Path mode

As a user,
I want to select two nodes and see the path(s) between them highlighted,
So that I can trace a specific call chain or dependency in a large diagram.

**Acceptance Criteria:**

**Given** a flowchart
**When** I select a source node and a target node
**Then** the path(s) between them are highlighted and off-path elements de-emphasized via `controller.path` (FR8).

**Given** path mode is active
**When** I exit it
**Then** the highlight clears and the diagram returns to default (FR8, FR10).

**Given** no path exists between the two selected nodes
**When** path mode is requested
**Then** the UI indicates "no path" rather than failing silently.

**Given** the locked cheapest-first build order
**When** path mode proves intractable within the Wave 1.1 disclosure budget
**Then** per the PRD pre-approved fallback it MAY ship in a 2–4-week fast-follow patch without blocking the rest of Epic 1 (FR8).

### Story 1.9: Exit to default and keyboard-triggered disclosure

As a user,
I want to exit any disclosure mode back to the fully-expanded default and to trigger disclosure by keyboard as well as click,
So that I can reset my view quickly and work without the mouse.

**Acceptance Criteria:**

**Given** any combination of active disclosure modes (collapse / focus / path / depth)
**When** I invoke reset/exit
**Then** the diagram returns to its fully-expanded default state via `controller.resetLayout` (FR10).

**Given** the canvas has focus
**When** I use the documented keyboard shortcuts
**Then** collapse/expand, focus, path, depth, and reset are all triggerable by keyboard, mirroring the click affordances (FR11).

**Given** keyboard and click triggers
**When** either is used for the same action
**Then** they produce identical `view_state`/overlay outcomes (FR11)
**And** the disclosure controls are reachable via standard keyboard focus traversal.

### Story 1.10: Command palette node search and navigation

As a user,
I want to open a command palette and fuzzy-search nodes by label and jump to one,
So that I can find a node by name in a large diagram without hunting for it visually.

**Acceptance Criteria:**

**Given** a rendered diagram
**When** I press Cmd/Ctrl+K
**Then** a command palette (cmdk) opens with a fuzzy node-label search field (FR12).

**Given** a search query
**When** results are shown
**Then** they fuzzy-match node labels and are ranked by relevance (FR12).

**Given** a selected search result
**When** I confirm it
**Then** the canvas pans/scrolls to and selects that node via `controller.panTo` + select (FR13).

**Given** the palette is open
**When** I use arrow keys, Enter, and Escape
**Then** it is fully keyboard-navigable and closes on Escape.

### Story 1.11: Minimap with viewport indicator

As a user,
I want a minimap showing where my current viewport sits within the full diagram,
So that I keep spatial context while panned or zoomed into a large diagram.

**Acceptance Criteria:**

**Given** a rendered diagram larger than the viewport
**When** the canvas is displayed
**Then** a minimap shows a scaled overview of the full diagram (FR14).

**Given** I pan or zoom the main canvas
**When** the viewport changes
**Then** the minimap's viewport indicator updates to match (FR14).

**Given** the minimap
**When** I click or drag within it
**Then** the main canvas viewport moves accordingly.

**Given** a viewport 1024–1279 px wide
**When** the workspace first loads
**Then** the minimap may auto-hide on initial load per the PRD responsive-design table.

### Story 1.12: Opt-in A* orthogonal edge routing

As a user,
I want to switch a flowchart's edges to orthogonal (A*) routing instead of the default curves,
So that I can get the clean right-angled edge style architecture diagrams often call for.

**Acceptance Criteria:**

**Given** a rendered flowchart (default side-aware curves)
**When** I toggle the edge-routing control to A*
**Then** edges re-route orthogonally via `controller.setEdgeMode('astar')` and the side-aware/dagre default is otherwise unchanged (FR15b, AR19).

**Given** the MVP scope
**When** A* is enabled
**Then** it runs with **fixed routing defaults** (cell size / connectivity / separation hardcoded to spike-validated values) — a single on/off toggle with no user-facing tuning controls (per-diagram tuning is a post-launch enhancement) (FR15b, AR19).

**Given** I have set a diagram to A* routing and saved it
**When** the document is reloaded or opened by a recipient of a shared link
**Then** the routing mode is restored from `view_state.edgeMode` and the recipient sees the same A*-routed edges (FR15b, FR23, AR6/AR19).

**Given** a diagram using the default side-aware routing
**When** the bundle is analyzed
**Then** the A* module is **not** in the initial/critical bundle — it is lazy-loaded on demand only when `view_state.edgeMode === 'astar'` (NFR-P1, AR19).

**Given** a 200-node diagram with A* enabled
**When** the perf gate runs (Story 1.3)
**Then** cold-load first-render and A* route-time meet NFR-P1/P2 with A* on; failure to meet the budget is surfaced as the carried perf risk before A* shares ship (AR3, AR19).

**Given** A* is the active mode
**When** I drag a node
**Then** drop-time re-routing and grid-snap behave per the engine's A* drop path (interacting with pins as documented), preserving engine-conformance Rule 0 and the `docs/architecture/05` invariants (AR11).

## Epic 2: Markdown-Native Authoring Workspace

A user can author and edit in the full live workspace — a Mermaid source editor ↔ rendered Markdown preview ↔ interactive canvas all syncing from one source — with embedded multi-block Mermaid documents, resizable panes, inline syntax errors, and a graceful viewer-fallback for non-flowchart diagram types. The workspace pane count/arrangement is resolved within this epic (PRD Open Decision #3).

### Story 2.1: Mermaid source editor with live-syncing render

As a user,
I want to edit Mermaid syntax in a real source editor and see the canvas update live without a manual refresh,
So that authoring and tweaking a diagram feels fast and immediate.

**Acceptance Criteria:**

**Given** the workspace
**When** it loads
**Then** a CodeMirror 6 source editor replaces the minimal paste input from Epic 1, with Mermaid-appropriate syntax highlighting (FR1).

**Given** I type or edit Mermaid in the editor
**When** I pause (~500 ms debounce)
**Then** the canvas re-renders via a debounced `controller.setSource()` with no manual refresh (FR1).

**Given** a live edit changes the source
**When** the diagram re-renders
**Then** the existing `view_state` (collapse / depth / pins) is reconciled against the new source — orphaned fence/node IDs dropped silently — rather than reset (AR6).

**Given** rapid editing
**When** edits stream in
**Then** the UI never blocks on render and updates remain responsive (live-sync pattern).

### Story 2.2: Markdown-native source with rendered preview and embedded diagrams

As a user,
I want to write Markdown containing embedded Mermaid blocks and see both a rendered Markdown preview and the interactive canvas update from the same source,
So that my diagrams live in their documentation context, not in isolation.

**Acceptance Criteria:**

**Given** a single Markdown source surface
**When** I write Markdown with one or more ` ```mermaid ` fences
**Then** `lib/markdown.ts` produces a block registry `[{ fenceId, type, source }]` with a stable `id=` stamped into each fence (stripped before parse) (FR2, AR12).

**Given** the source
**When** it renders
**Then** a `react-markdown` preview shows the rendered Markdown and each flowchart fence is a mount point with its own `DiagramController` bound to its `view_state[fenceId]` slice (FR2, AR12).

**Given** an edit to one fence
**When** the source changes
**Then** the registry re-stamps and `setSource()` is called on the affected fence(s) only, not the whole document (AR12).

**Given** the single source of truth
**When** I edit
**Then** the source, the Markdown preview, and the canvas stay in sync (FR2).

### Story 2.3: Non-flowchart diagram viewer fallback

As a user,
I want non-flowchart Mermaid types (sequence, class, state, ER, gantt, etc.) to render with pan/zoom and a clear indication that disclosure is flowchart-only,
So that mixed documents render fully and don't look broken.

**Acceptance Criteria:**

**Given** a Markdown fence whose type is not flowchart/graph
**When** it renders
**Then** the per-fence Renderer Router routes it to a lazy-loaded full `mermaid` viewer with pan/zoom only (FR15a, AR12).

**Given** a non-flowchart block
**When** it displays
**Then** the disclosure controls render in a disabled state with an explanatory tooltip/badge ("Disclosure is flowchart-only") (FR15a).

**Given** an unknown or future Mermaid type
**When** it is encountered
**Then** it falls back to the viewer path automatically rather than erroring (FR15a).

**Given** a non-flowchart block
**When** the E2E suite runs
**Then** a test asserts the disclosure controls are disabled-with-explanation (FR15a, NFR-M3)
**And** the mermaid viewer-fallback and elkjs are code-split so they do not weigh down the recipient bundle (AR12, NFR-P1).

### Story 2.4: Resizable workspace panes

As a user,
I want to resize the source, preview, and canvas surfaces relative to one another,
So that I can give space to whatever I'm working on.

**Acceptance Criteria:**

**Given** the workspace layout (pane count/arrangement finalized here per PRD Open Decision #3)
**When** it renders on a ≥ 1280 px viewport
**Then** the source, preview, and canvas surfaces are present and resizable relative to each other (FR4).

**Given** a pane divider
**When** I drag it
**Then** the adjacent surfaces resize smoothly and the layout persists for the session.

**Given** a 1024–1279 px viewport
**When** the workspace loads
**Then** default widths tighten and the minimap may auto-hide, per the responsive-design table.

**Given** a < 768 px (mobile) viewport
**When** the workspace loads
**Then** it falls back to read-only/viewer mode with the editor hidden behind an "Open in desktop" prompt (PRD responsive table).

### Story 2.5: Inline Mermaid syntax errors

As a user,
I want syntax errors surfaced inline in the editor where I can locate and fix them,
So that I never have to leave the workspace to debug my Mermaid.

**Acceptance Criteria:**

**Given** invalid Mermaid in a fence
**When** the parser emits a `parseError`
**Then** the error is surfaced inline in the CodeMirror editor at or near the offending location (FR5).

**Given** an inline error is shown
**When** the user reads it
**Then** the user-facing message is distinct from logged technical detail, and the last good render remains visible rather than blanking the canvas (process/error-handling pattern).

**Given** I correct the error
**When** the source re-parses cleanly
**Then** the inline error clears and the canvas updates (FR5).

**Given** a multi-block document
**When** one fence has a syntax error
**Then** the error is scoped to that fence and the other fences keep rendering (AR12).

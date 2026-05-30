---
title: "Product Brief: MermaidWeb"
status: "superseded-by-prd"
created: "2026-05-06"
updated: "2026-05-08"
inputs:
  - _bmad-output/brainstorming/brainstorming-session-2026-05-05-1740.md
downstream:
  - _bmad-output/planning-artifacts/prd.md
---

> **Status note (2026-05-08):** This brief is preserved as the originating strategic document. The canonical, current source of truth for MermaidWeb requirements is now the PRD at `_bmad-output/planning-artifacts/prd.md`. Where this brief and the PRD differ, the PRD wins. Notable refinements made during PRD authoring are summarized at the bottom of this document under "PRD-stage Updates".

# Product Brief: MermaidWeb

## Executive Summary

**MermaidWeb is the comprehension layer for technical documentation — starting with Mermaid diagrams, where the pain is sharpest.**

Engineers, architects, and new hires routinely face architecture diagrams, infra topologies, ML pipelines, and state machines that are technically correct but practically unreadable — mega-diagrams that show everything at once and force the reader to do all the cognitive work. MermaidWeb fixes this by making large diagrams *navigable*: a Markdown-native workspace combining source editing, rendered Markdown preview, and an interactive Mermaid canvas, paired with a family of progressive-disclosure interactions (collapse/expand, focus, path-tracing, depth slider) that let the reader peel a complex diagram back to exactly the layer they need. (Specific workspace layout — single-pane, two-pane, or multi-pane — is finalized during design; the Markdown-native, comprehension-first commitment is locked.)

The product launches free and zero-friction — no signup required — with a premium tier for persistence, sharing, export, and branding. Subsequent waves layer in AI-assisted diagram generation and bidirectional code-to-diagram binding. The strategy is indie-scale and adoption-first: prove the comprehension thesis with real users before applying pricing pressure, then expand into the broader category of multi-format document comprehension over time.

## The Problem

Engineers don't struggle with diagrams because diagrams are bad — they struggle because diagrams are **static while thinking is dynamic**. A 500-node service map shows everything at once, but the engineer only needs to trace one path, understand one subsystem, or onboard against one slice. Today they're stuck:

- **Reading mode:** Squinting at PNG exports in Confluence, zooming in and out of mermaid.live or a static SVG, mentally hiding parts of the diagram they don't care about, and giving up when the diagram is too large to load smoothly.
- **Authoring mode:** Writing Mermaid in mermaid.live or Mermaid Chart with no way to manage complexity as the diagram grows — diagrams either stay artificially small to remain readable, or balloon past the point of usefulness.
- **Sharing mode:** Pasting screenshots into Slack, exporting SVGs that lose interactivity, or sending links to mermaid.live where the recipient sees the same impenetrable wall the author did.

Adjacent tools (Lucidchart, Whimsical, Excalidraw) optimize for diagram *creation*, not *consumption*. AI code-context tools (Cursor, Cody, Sourcegraph) optimize for code, not diagrams. Mermaid Chart focuses on authoring polish. **No incumbent solves the comprehension problem on the diagram surface specifically** — the cost is real but quiet: slower onboarding, slower architecture reviews, knowledge that lives in someone's head because the diagram couldn't carry it.

## The Solution

MermaidWeb is a web-based Markdown-native workspace — combining source editing, rendered Markdown preview, and an interactive Mermaid canvas — built around a **progressive-disclosure family** that turns big diagrams into navigable ones:

- **Collapse/expand** — click any subgraph to fold it into a single parent node; click again to expand
- **Focus mode** — click a node, fade everything not connected to it
- **Path mode** — click two nodes, highlight only the path between them
- **Depth slider** — auto-collapse everything below depth N for a top-down view

Power-user navigation comes in via a **command palette** (fuzzy node search and keyboard navigation) and a **minimap** for spatial orientation in large diagrams. Every diagram is **backend-stored from day one**, so any diagram — free or premium — gets a clean short URL like `mermaidweb.app/d/abc123` that the recipient can open and interact with, not just view. No signup is required to use the full free tier.

Premium adds the practical layer engineers expect from a tool they rely on: account-bound persistence, share permissions (view vs. edit), export to PNG/SVG/PDF *with collapse states preserved*, and custom themes/branding. AI generation (Wave 2) and Code Connect (Wave 3) follow once the core thesis has paying users.

## What Makes This Different

The defensibility isn't a single feature — it's a **stack of compounding advantages**:

1. **The disclosure family, not just collapse.** A weekend clone can copy click-to-collapse. Replicating four interaction modes that each map to a distinct comprehension pain (path tracing, mental-model construction, big-picture view) is meaningfully harder.
2. **Comprehension-first positioning.** Mermaid Chart, mermaid.live, Whimsical, and Lucidchart all position around *creating* diagrams. MermaidWeb positions around *understanding* them. That's an unoccupied frame in the market.
3. **Markdown-native, not diagram-only.** The workspace sits at the intersection HackMD (no diagram intelligence), Notion (no Mermaid depth), and Mermaid Chart (no Markdown context) all miss. Diagrams live where docs live.
4. **vs. the obvious free comparison (mermaid.live):** mermaid.live is a syntax sandbox. MermaidWeb is a workspace — disclosure family, command palette, minimap, persistent short share URLs, and a 3-pane editor are all things a syntax playground doesn't try to be.
5. **First-mover on a real gap.** Mermaid Chart focuses on authoring; AI agents don't yet handle complex visual comprehension; Lucidchart/Whimsical are not chasing dev workflows. The window is real but not infinite.
6. **Founder-fit.** Built by an experienced software engineer who hits this pain in his own work, has the working prototype already, and has the patience for indie/wedge mode rather than venture pace.

The honest read: none of these are bulletproof on their own. Together — and shipped before incumbents notice — they're enough.

## Who This Serves

**Primary: Software engineers** reading or authoring architecture, infra, or system diagrams as part of design review, onboarding, debugging, or documentation work. They are technical, price-sensitive, free-tool-biased, and reachable through HN, Reddit, dev.to, and Mermaid community channels. The "aha moment" is the first time they collapse a 200-node diagram into the 6 nodes they actually care about.

**Secondary: Tech leads, architects, and new hires** — the people who feel the comprehension pain most acutely (architects produce these diagrams; new hires are buried by them). They benefit from the same product without requiring it to be reshaped for them.

## Distribution & Conversion Loop

The shared short URL is the **distribution engine**, not just a feature. Every time a user shares a diagram, the recipient lands on a working interactive workspace — with the disclosure family, the editor, and a frictionless path to creating their own diagram. Recipient → creator conversion is the loop the product is built around, instrumented from day one.

The **upgrade trigger hypothesis** for premium is concrete: free users hit it when they (a) want their work to persist beyond a browser session, (b) want to share with view-vs-edit permissions, or (c) need to export with collapse states baked in for a slide deck or doc. Premium feature priorities are chosen against these triggers, not guessed.

**Pre-launch path:** ship to 5–10 engineering friends/colleagues for ~2 weeks of real-diagram usage before public launch — catches UX-on-real-diagrams risks cheaply and seeds the first wave of shared URLs. Public launch then targets HN, Reddit r/programming, dev.to, the Mermaid community, and engineering Twitter/X.

## Success Criteria

The launch is **adoption-first, revenue-second**. Wave 1 is judged at a pre-committed **6-week post-launch decision gate**:

| Outcome | Threshold | Action |
|---------|-----------|--------|
| 🟢 Green | ≥ 200 WAU at week 6 | Proceed to Wave 2 (AI generation) |
| 🟡 Yellow | 50–200 WAU | Investigate retention loop before further build |
| 🔴 Red | < 50 WAU | Pivot or sunset — F1a confirmed |

The 200 WAU figure is a **directional target**, not a calibrated forecast — it's the line that distinguishes "thesis is working" from "thesis isn't" with the information available pre-launch, and may be re-calibrated against actual signal post-launch.

**Secondary metrics, instrumented from day one:**
- Diagrams created per active user
- Diagrams shared per active user, recipient open rate, recipient → creator conversion
- Returning author rate (the leading indicator of retention against the "intermittent reading" risk)

Personal success at the 12–18 month horizon: clearing the directional WAU bar, validating the comprehension thesis with real users, and earning the right to ship Waves 2 and 3.

## Scope

**Wave 1 — In scope (the real MVP):**
- Free: Markdown-native workspace (layout finalized in design), full Mermaid syntax editor, progressive-disclosure family (4 modes), command palette, minimap, backend-stored short share URLs, no-account access via session token
- Premium: account-bound save, share permissions, export with collapse states, custom themes/branding

**Wave 2 (after Wave 1 validates):** AI-assisted diagram generation from code, from prose, and AI improvement of existing diagrams.

**Wave 3 (after Wave 2 validates):** Code Connect — bind diagram nodes to single code files, then to ranges.

**Explicitly out of v1:**
- Diagram formats other than Mermaid (D2, PlantUML, BPMN — post-launch)
- Real-time collaboration, comment threads, team workspaces (V2)
- Notion / Confluence / GitHub embeds (V2)
- IDE / browser extensions, mobile viewer (V2+)
- Public diagram gallery, multi-repo support, CI-driven code↔diagram sync (skip / maybe)
- **Open-sourcing the product** — MermaidWeb is a closed-source commercial product; OSS is not part of the strategy.

## Vision

**Year 1:** MermaidWeb is the place engineers go when they need to understand a Mermaid diagram, and increasingly the place they go to author one — known for "the editor where collapse actually works."

**Year 2-3:** MermaidWeb expands beyond Mermaid into a **multi-format diagram and document comprehension layer** — supporting D2, PlantUML, and adjacent visual formats — with team workspaces, deeper collaboration, and Code Connect mature enough to be a primary value prop. The product helps organizations make their internal documentation actually navigable, not just searchable.

**Long-horizon optionality:** as AI agents take on more software-engineering work, structured navigable context over codebases and knowledge bases becomes increasingly valuable. The same comprehension primitives MermaidWeb builds for humans could one day serve agents as well — but this is a far-future possibility, not part of the near-term plan.

## Risks and What We're Doing About Them

**Designed against (mitigated in Wave 1):**
- **Intermittent-reading retention risk (F1a).** Authoring made first-class so daily usage replaces monthly reading; sharing instrumented as the leading indicator; pre-committed decision gate keeps execution honest.
- **OSS/clone of progressive disclosure.** The disclosure *family* (4 modes) raises the clone bar.
- **URL length limits on shareable state.** Eliminated by backend storage from day one.

**Explicitly accepted:**
- Mermaid Chart or the Mermaid spec adding collapse — out of our control; first-mover speed and Wave 2/3 differentiation are the answer.
- AI agents subsuming diagram comprehension — partially hedged by Wave 2 AI features; tail risk accepted.
- Side-project pace and burnout risk — accepted as indie reality; managed by wave staging, not formal mitigation.

T
## Strategic / scope decisions 

- **Accessibility excluded for indie phase.** The PRD does not commit to WCAG conformance and marketing materials will not claim it until verified. Revisit at scale or with enterprise customers.
- **SEO minimized.** Marketing landing page is indexable; all diagram pages return `noindex, nofollow` (privacy rule, not marketing decision).
- **No public diagram gallery .** Upgraded from "skipped feature" in the brainstorm to architectural rule in the PRD.
- **Phased delivery confirmed.** Wave 1.1 / 1.2 / 1.3 / V2 / Vision sequencing locked, with explicit triggers between phases tied to the 6-week / 200-WAU decision gate.


## Open Decisions

1. **Launch date** — to be set; side projects without deadlines drift.
2. **Wave 1 premium pricing** — likely $5–15/mo individual, finalized closer to launch.
3. **Renderer technology** (SVG vs. Canvas vs. WebGL) — decided by an architecture spike against real-world diagrams of 200 / 500 / 1000+ nodes.
4. **Annotations and diagram-diff view** — held in the Consider pile; revisit during build.

> The full and current Open Decisions table (10 items, with owners, triggers, and defaults) lives in the PRD's Open Decisions section. Items 5–10 there cover: workspace pane count, payment processor (Stripe vs. Paddle), anonymous-diagram retention policy, LLM provider for Wave 1.2, and stack-level technology choices.


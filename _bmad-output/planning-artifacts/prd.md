---
stepsCompleted: ['step-01-init', 'step-02-discovery', 'step-02b-vision', 'step-02c-executive-summary', 'step-03-success', 'step-04-journeys', 'step-05-domain', 'step-06-innovation', 'step-07-project-type', 'step-08-scoping', 'step-09-functional', 'step-10-nonfunctional', 'step-11-polish', 'step-12-complete']
status: 'complete'
completedDate: '2026-05-08'
inputDocuments:
  - _bmad-output/planning-artifacts/product-brief-MermaidWeb.md
  - _bmad-output/brainstorming/brainstorming-session-2026-05-05-1740.md
workflowType: 'prd'
documentCounts:
  briefs: 1
  research: 0
  brainstorming: 1
  projectDocs: 0
classification:
  projectType: web_app
  domain: developer_tools
  complexity: medium
  projectContext: greenfield
releaseMode: phased
---

# Product Requirements Document - MermaidWeb

**Author:** Ahmed
**Date:** 2026-05-06

## Executive Summary

MermaidWeb is a web-based comprehension layer for technical documentation that contains complex visual structure — launching with Mermaid diagrams, where the comprehension pain is sharpest and the wedge is cheapest. The product targets software engineers, architects, and technical leads who routinely face large architecture, infrastructure, and system diagrams that are technically correct but practically unreadable, forcing the reader to do all the cognitive work.

The core thesis: diagrams fail not because they are badly drawn, but because they are **static while thinking is dynamic**. A 500-node service map shows everything at once, but the reader only needs to trace one path, understand one subsystem, or onboard against one slice. MermaidWeb fixes this with a Markdown-native workspace combining source editing, rendered Markdown preview, and an interactive Mermaid canvas, built around a **family of progressive-disclosure interactions** — collapse/expand, focus, path-tracing, and depth-slider modes — that let any reader peel a complex diagram back to exactly the layer they need. The Markdown-native, comprehension-first commitment is locked; the specific workspace layout (pane count, arrangement) is finalized during design.

The product launches free and zero-friction (no signup required), with backend-stored diagrams from day one producing clean short share URLs. A premium tier follows for persistence, share permissions, export with collapse states preserved, and custom branding. Subsequent waves layer in AI-assisted diagram generation (Wave 2) and bidirectional Code Connect (Wave 3). Strategy is indie-scale and adoption-first: prove the comprehension thesis with real users at a pre-committed 6-week / 200-WAU decision gate before applying pricing pressure or expanding scope.

### What Makes This Special

MermaidWeb's defensibility is a stack of compounding advantages, none bulletproof alone but together meaningful at indie scale:

1. **The disclosure family, not just collapse.** A weekend clone can replicate click-to-collapse. Replicating four interaction modes — each mapped to a distinct comprehension pain (path tracing, mental-model construction, big-picture orientation) — is meaningfully harder.
2. **Comprehension-first positioning in a creation-first market.** Mermaid Chart, mermaid.live, Whimsical, and Lucidchart all position around *creating* diagrams. MermaidWeb positions around *understanding* them — an unoccupied frame in the market.
3. **Markdown-native, not diagram-only.** The workspace sits in the gap that HackMD (no diagram intelligence), Notion (no Mermaid depth), and Mermaid Chart (no Markdown context) each miss.
4. **Distribution loop baked into the product, not bolted on.** Every shared short URL lands the recipient in a working interactive workspace — disclosure family, editor, frictionless path to authoring their own diagram. Recipient → creator conversion is the loop the product is instrumented around from day one.
5. **First-mover on a real, time-bounded gap.** Mermaid Chart is chasing authoring polish, AI agents don't yet handle complex visual comprehension, and Lucidchart/Whimsical aren't pursuing dev workflows. The window is real but not infinite.

The core insight powering all of this: progressive disclosure isn't a feature added on top of a diagram — it's the right *shape of interaction* for a job that has been done wrong for decades. The "aha moment" is the first time a user collapses a 200-node diagram into the 6 nodes they actually care about.

## Project Classification

| Attribute | Value |
|-----------|-------|
| **Project Type** | Web application (browser-based SPA workspace) |
| **Domain** | Developer tools / technical documentation |
| **Complexity** | Medium — graph rendering performance at 200/500/1000+ nodes and the 4-mode disclosure family are the genuine technical risks; backend persistence, auth, and payments are well-trodden web SaaS work |
| **Project Context** | Greenfield — working prototype exists (collapse/expand on Mermaid), but no production codebase, users, or integrations to preserve |

## Success Criteria

MermaidWeb's launch is **adoption-first, revenue-second**. Wave 1 success is whether the comprehension thesis works — whether real engineers come back, share, and pull peers in. Revenue is a deliberate secondary signal at launch, becoming primary only once Wave 1 has validated the audience exists.

### User Success

A user has succeeded when they:

1. **Open a complex diagram and reduce it to the layer they care about within 60 seconds of first interaction.** This is the "aha" moment — the first time a 200-node diagram becomes the 6 nodes that matter. If a new user doesn't reach this within their first session, the product has failed for them.
2. **Return within 7 days to author or extend their own diagram, not just read someone else's.** Returning authors (created in week N, edited or created in week N+1) is the leading indicator of retention against the F1a "intermittent reading" risk. Reading-only return without authoring return is a yellow flag.
3. **Share a diagram and feel confident the recipient will see something useful, not a static screenshot.** The shared short URL must produce an interactive, navigable workspace on the recipient side — disclosure family functional, no signup required to read or interact.
4. **Hit the upgrade trigger organically** — they want their work to persist beyond the browser session, want to share with view-vs-edit permissions, or need to export with collapse states baked in for a slide deck or doc. Upgrade is pulled by a concrete need, not pushed by paywall friction on core features.

### Business Success

Wave 1 is judged at a pre-committed **6-week post-launch decision gate**:

| Outcome | Weekly Active Users at Week 6 | Action |
|---------|-------------------------------|--------|
| 🟢 Green | ≥ 200 WAU | Comprehension thesis validated — proceed to Wave 2 (AI generation) |
| 🟡 Yellow | 50 – 200 WAU | Investigate retention loop and recipient → creator conversion before further build |
| 🔴 Red | < 50 WAU | F1a confirmed (reading is too intermittent) — pivot the shape or sunset rather than building Wave 2 on a weak base |

The 200 WAU figure is a **directional target, not a calibrated forecast** — it draws the line between "thesis is working" and "thesis isn't" with the information available pre-launch, and may be re-calibrated against actual signal post-launch.

**Secondary metrics, instrumented from day one:**
- Diagrams created per active user per week
- Diagrams shared per active user per week
- Recipient open rate on shared URLs (% of share links that get opened by a non-creator)
- Recipient → creator conversion rate (% of recipients who create their own diagram within 14 days)
- Returning author rate (% of week-N creators who edit or create again in week N+1)
- Free → premium conversion rate (only meaningful once premium ships in Wave 1)

**Revenue framing:** Revenue is *not* a Wave 1 success metric. Premium exists at launch to validate that *some* subset of free users will pay for persistence/sharing/branding (low single-digit % conversion is enough signal), not to fund the project at MVP. Meaningful revenue is a Wave 2/3 conversation.

**Personal success at the 12–18 month horizon:** clearing the directional WAU bar, validating the comprehension thesis with paying users, and earning the right to ship Waves 2 and 3.

### Technical Success

Technical success in Wave 1 is bounded by what the comprehension thesis actually requires:

1. **Renderer holds up on real-world diagrams.** The disclosure family must be smooth (≤ 16 ms interaction frames on a typical engineer's laptop) on Mermaid graphs of **200 nodes**, **degrade gracefully** on **500 nodes**, and **at minimum render without crashing** on **1000+ nodes**. Specific thresholds get calibrated by the architecture spike (SVG vs. Canvas vs. WebGL) before the disclosure family is built on top.
2. **Backend persistence is reliable from day one.** Anonymous diagram records survive the user's session, premium diagrams survive forever, share URLs do not 404. Targeting **99.5% successful save / load** (not "99.9% uptime" — the real concern is *write reliability and durability*, not minutes of marketing-page outage).
3. **Share recipient experience is fast.** Shared diagrams must render and become interactive in **under 3 seconds on a cold load** for a 200-node diagram on broadband. The recipient experience is the distribution loop; if it's slow, the loop dies.
4. **Free / premium boundary is clean.** Free tier is genuinely useful with no paywall on core comprehension features; premium adds *only* persistence, share permissions, export, and branding. No accidental crippling of the free tier as code evolves.
5. **Analytics are wired before public launch.** The decision gate at week 6 is meaningless without instrumentation for WAU, creates, shares, recipient opens, returning authors, and free→premium conversion — *all* live and verified before public launch, not retrofitted afterward.

### Measurable Outcomes

| Outcome | Metric | Target | Window |
|---------|--------|--------|--------|
| Comprehension thesis works | WAU | ≥ 200 | Week 6 post-launch |
| Distribution loop fires | Recipient open rate on shared URLs | ≥ 40% | Rolling, post-launch |
| Recipients become creators | Recipient → creator conversion | ≥ 10% within 14 days | Rolling, post-launch |
| Authoring drives retention | Returning author rate (week N → week N+1) | ≥ 25% | Rolling, post-launch |
| Premium has pull | Free → premium conversion | ≥ 1% of WAU on premium | By week 12 post-launch |
| Renderer is good enough | Frame time on 200-node diagram | ≤ 16 ms p50, ≤ 33 ms p95 | Continuous, instrumented |
| Share recipient load | Time-to-interactive on 200-node shared diagram | ≤ 3 s on broadband cold load | Continuous, instrumented |

Targets in this table are **directional pre-launch**; once real data arrives, they get re-calibrated rather than treated as gospel.

## Product Scope

### MVP — Minimum Viable Product (Wave 1)

The Wave 1 launch *is* the MVP. Sub-staged inside Wave 1 is a 3-wave-within-V1 release plan to manage build complexity:

**Wave 1.1 — Free Core + Persistence Premium (the actual launch):**

*Free tier:*
- Markdown-native workspace combining source editing, rendered Markdown preview, and interactive Mermaid canvas (live-syncing across surfaces; layout/pane count finalized in design)
- Mermaid syntax editor with syntax highlighting and validation
- Progressive disclosure family — four modes: collapse/expand, focus, path-tracing, depth slider
- Command palette (Cmd+K) for fuzzy node search and keyboard navigation
- Minimap with viewport indicator
- Backend-stored diagrams from day one with clean short share URLs (`mermaidweb.app/d/abc123`)
- No-account access — anonymous session tokens; premium signup is when accounts appear

*Premium tier:*
- Save to account (auth ships here; anonymous diagrams claimable on signup)
- Share with permissions (view-only vs. editable)
- Export to PNG / SVG / PDF with collapse states preserved
- Custom themes / branding

**Wave 1.2 — AI Generation Premium (ships after 1.1 validates):**
- AI: code → diagram
- AI: prose → diagram
- AI: diagram improvement / refactor suggestions

**Wave 1.3 — Code Connect Premium (ships after 1.2 validates):**
- Bind a diagram node to a single code file (with range bindings as fast follow)

### Growth Features (Post-MVP / V2)

Earned features for once Wave 1 has validated audience:
- Real-time collaboration, comment threads on nodes, team workspaces
- AI explanation of an existing diagram and AI Q&A (natural-language navigation)
- Auto-generate diagram from a whole repo
- Embeds in Notion / Confluence / GitHub
- Templates library
- Slack / Discord / Teams integrations
- Mobile / tablet viewer
- Annotations on nodes (held in Consider pile; revisit during build)
- Diagram diff view (held in Consider pile)

### Vision (Future)

**Year 1:** MermaidWeb is the place engineers go when they need to understand a Mermaid diagram, and increasingly the place they go to author one — known for "the editor where collapse actually works."

**Year 2-3:** Expansion into a **multi-format diagram and document comprehension layer** — supporting D2, PlantUML, and adjacent visual formats — with team workspaces, deeper collaboration, and Code Connect mature enough to be a primary value proposition. The product helps organizations make their internal documentation actually navigable, not just searchable.

**Long-horizon optionality:** as AI agents take on more software-engineering work, structured navigable context over codebases and knowledge bases becomes increasingly valuable. The same comprehension primitives MermaidWeb builds for humans could one day serve agents as well — flagged as a far-future possibility, not part of the near-term plan.

**Explicitly out of scope (locked):**
- Diagram formats other than Mermaid in v1 (D2, PlantUML, BPMN — post-launch)
- Real-time collaboration in v1
- Notion / Confluence / GitHub embeds in v1
- IDE / browser extensions, mobile viewer in v1
- Public diagram gallery, multi-repo support, CI-driven code↔diagram sync (skip / maybe)
- Open-sourcing the product — MermaidWeb is a closed-source commercial product; OSS is not part of the strategy

## User Journeys

### Journey 1 — Priya, Senior Engineer Onboarding to a New Service (Primary, Reading + Comprehension)

**Persona:** Priya is a senior backend engineer who joined a 200-person company three weeks ago. She's been assigned a feature that touches the order-processing pipeline. Her tech lead pasted a link to the architecture doc in Slack: a Confluence page with a 180-node Mermaid service map embedded in it. She's smart, opinionated, time-pressured, and skeptical of new tools — she will not sign up for anything to read a diagram.

**Opening Scene:** Priya opens the Confluence page on Tuesday afternoon. The Mermaid diagram is rendered as a static SVG. She zooms in, finds her service (`order-validator`), and immediately loses spatial context. She zooms out, finds the service again, can't see what calls it. Her current pattern: take a screenshot, paste it into Excalidraw, manually delete everything she doesn't care about. This takes 25 minutes and produces a diagram nobody else can use.

**Rising Action:** Her tech lead pings her: *"btw try opening the source diagram in mermaidweb — that thing has a focus mode that's weirdly good."* The link is a clean `mermaidweb.app/d/k8a3xq` URL. She clicks it on her work laptop in Chrome. The page loads in under 3 seconds. The diagram renders interactively. No signup wall, no email capture, no popup.

**Climax:** She uses Cmd+K, types "order-validator", and the command palette jumps to it. She right-clicks and picks **Focus mode**. Everything not connected to `order-validator` fades to 10% opacity. The 180-node diagram becomes the 11 nodes she actually has to reason about. She holds Shift and clicks `payment-gateway` — **Path mode** lights up the exact 4-hop call chain. She thinks "huh, that's the answer to the question I was about to spend an hour figuring out."

**Resolution:** Total time from link-click to understanding: 90 seconds. She bookmarks the URL, copies it into her Linear ticket. The next time her tech lead sends a Mermaid link, she opens it without flinching. Two weeks later she pastes her own service-extension Mermaid into mermaidweb.app *to author it* — because it's a better editor than mermaid.live, not just a better viewer.

**Capabilities revealed:**
- No-account access to full free tier (zero friction onboarding)
- Backend-stored short share URLs that produce an interactive workspace, not a static export
- Command palette (Cmd+K) with fuzzy node search
- Focus mode (single-node + connected subgraph isolation)
- Path mode (two-node selection → highlighted path)
- Sub-3-second cold load on a 200-node diagram for first-time recipients

### Journey 2 — Marcus, Staff Engineer Authoring an Architecture RFC (Primary, Authoring)

**Persona:** Marcus is a staff engineer who owns the data-platform RFC he's writing this quarter. He's a Mermaid power user — he's been writing Mermaid in mermaid.live for two years because it's the lowest-friction tool, but he hates that diagrams over ~80 nodes become a wall of unreadable text in his RFC PDFs. He's the *author* MermaidWeb most needs to retain weekly, not just monthly.

**Opening Scene:** Marcus opens the PR for his RFC on Monday morning. The Markdown has a 140-node Mermaid block embedded. He needs to add three new services to the diagram and reorganize the storage layer. In mermaid.live he'd be staring at a 600-line `.mmd` file in a single text pane, scrolling endlessly to find the subgraph he wants to edit, with the rendered preview running off-screen on a 200-node diagram.

**Rising Action:** He opens mermaidweb.app, pastes his RFC's Markdown in. The workspace renders his source, the rendered Markdown preview, and the interactive Mermaid canvas side-by-side. He clicks the storage subgraph in the canvas — **collapse** — the 22 storage nodes fold into one parent he can ignore while he edits the new service nodes. As he types in the source surface, the canvas live-updates, and the storage subgraph stays collapsed. He uses **depth slider** to drop the whole diagram to depth 2 to sanity-check the top-level shape before re-expanding to add detail.

**Climax:** He realizes for the first time that authoring a large diagram doesn't require holding the whole thing in his head. He can collapse the parts he's not editing, focus on what he is, expand to verify. The diagram he ships at end-of-day is 160 nodes — 20 more than he'd normally allow himself, because at this size the reader can collapse what they don't care about. He copies the share URL into the RFC.

**Resolution:** Marcus is back the next day editing the same diagram. And the day after. He hits the upgrade trigger on Thursday: he wants this diagram to persist across browsers (he started it on his desktop, wants to extend it on his laptop at the offsite). He pays. His three anonymous diagrams from the last two days are claimed into his account on signup.

**Capabilities revealed:**
- Markdown-native workspace with live source ↔ preview ↔ canvas sync (layout decided in design)
- Mermaid syntax editor (full editing, syntax highlighting, validation)
- Collapse/expand subgraphs *while authoring*, not just while reading
- Depth slider for top-down structural review
- Backend persistence for anonymous diagrams (multi-day editing across sessions)
- Anonymous → premium claim flow (anonymous diagrams associate to user account on signup)

### Journey 3 — Sam, Recipient Who Becomes Creator (The Distribution Loop)

**Persona:** Sam is a mid-level frontend engineer at a different company than Priya and Marcus. He's never heard of MermaidWeb. He's reading a tech blog post on dev.to about distributed system patterns, and the author embeds a `mermaidweb.app/d/...` link with the caption *"open this and click around — that's the actual point of the post."*

**Opening Scene:** Sam clicks. The diagram opens in a fresh tab. No signup. No marketing splash. Just the workspace. He's confused for a moment — *is this an editor or a viewer?* — and then he sees the disclosure controls, plays with collapse, and gets it.

**Rising Action:** He thinks: "I have a microservices diagram for a side project that I keep meaning to write up. I bet this thing would render it." He opens a new tab, goes to `mermaidweb.app`, pastes his Mermaid in. It works. He's never created an account, never given an email address, but he has a working diagram and a share URL within 90 seconds.

**Climax:** He shares it in his team's Slack. Two of his teammates open it. One of them creates their own diagram three days later. The loop has fired twice in a week from a single dev.to article that wasn't even about MermaidWeb.

**Resolution:** Sam is now a weekly active user. He hasn't paid yet. Maybe he never will. But the analytics show: shared URL opened by N=3, recipients-who-became-creators N=2, and Sam himself returned and created on day 4. The instrumentation tells Ahmed the comprehension thesis is working.

**Capabilities revealed:**
- Recipient experience requires *zero* setup steps to become interactive
- Authoring path is reachable in one click from any shared URL ("create your own")
- Anonymous session token persists Sam's work across this browser
- All five distribution-loop metrics get telemetry events at this stage: shared-URL-open, time-to-first-disclosure-interaction, recipient-became-creator, recipient-shared-onward, returning-author

### Journey 4 — Alex, Tech Lead Hitting the Premium Upgrade Trigger

**Persona:** Alex is a tech lead who has been using MermaidWeb free for three weeks. He has six diagrams. He uses it most days. He's the closest persona to the people who actually pay.

**Opening Scene:** Friday afternoon. Alex is preparing the architecture review deck for next week's exec presentation. He needs to export the system diagram as a PDF page in the deck — and critically, he needs the exported version to show the diagram in the *collapsed* state he uses when presenting (top-level only, with the auth subsystem expanded because that's the focus of the review). In mermaid.live, an export is just the fully-expanded SVG. Useless.

**Rising Action:** He clicks Export. A modal explains: PNG / SVG / PDF export with current collapse states preserved is a premium feature. The pricing is shown — $9/mo. He has six diagrams currently saved anonymously in this browser, which he cares about; he'd like to share next week's prepared diagram with the exec team using a view-only permission so they can interact but not edit.

**Climax:** Three concrete needs converge in a single afternoon: persistence (claim his anonymous diagrams), share permissions (view-only for execs), export with collapse states (the deck). All three are premium features. He signs up. His anonymous diagrams claim into his account. He exports the PDF with the collapse state baked in. The exec deck looks better than any architecture deck the team has shipped.

**Resolution:** Alex pays for two months. Whether he stays at month three depends on whether he hits the same set of triggers regularly — which depends on whether his usage patterns are persistent or episodic. *That's the F1a retention question, surfacing again at the premium tier.*

**Capabilities revealed:**
- Premium signup/auth with anonymous-diagram claim flow
- Share permissions (view vs. edit roles)
- Export to PNG / SVG / PDF with collapse states preserved
- Custom themes / branding for shared and exported outputs
- Premium pricing presented in-context at the moment of need (pull, not push)

### Journey Requirements Summary

| Capability Area | Journeys That Reveal It |
|---|---|
| **Free tier — no-account access** | Priya (recipient/reader), Sam (recipient → creator), Marcus (Day 1 author) |
| **Markdown-native workspace + Mermaid editor** | Marcus, Sam |
| **Progressive disclosure family — collapse/expand** | Priya, Marcus, Sam |
| **Progressive disclosure family — focus mode** | Priya |
| **Progressive disclosure family — path mode** | Priya |
| **Progressive disclosure family — depth slider** | Marcus |
| **Command palette (Cmd+K)** | Priya |
| **Minimap** | (implicit in Priya/Marcus large-diagram navigation) |
| **Backend-stored anonymous diagrams + short URLs** | All four journeys |
| **Sub-3-second cold load for recipients** | Priya, Sam |
| **Anonymous → premium claim flow** | Marcus, Alex |
| **Premium auth + persistence** | Marcus, Alex |
| **Share permissions (view/edit)** | Alex |
| **Export with collapse states preserved** | Alex |
| **Custom themes / branding** | Alex |
| **Distribution-loop instrumentation** | Sam (and indirectly Priya, Marcus, Alex) |

**Personas explicitly *not* mapped in v1:**
- **Admin / ops user** — no admin surfaces in v1 (no team workspaces, no shared org-level configuration). Deferred to V2 with team workspaces.
- **Support / troubleshooting user** — no internal support tooling in v1; bug reports route through email or social. Acceptable at indie scale.
- **API consumer / integration** — no public API in v1. Embeds (Notion / Confluence / GitHub) deferred to V2.

## Domain-Specific Requirements

MermaidWeb operates in the developer-tools / technical-documentation domain. There is no industry regulator and no certification path required for v1. The domain-specific concerns below are the load-bearing ones — they are real but bounded, and naming them now prevents launch-week surprises.

### Data Privacy & Sensitive Content

User-pasted Mermaid diagrams will frequently contain **non-public internal architecture** — service names, infrastructure topology, vendor identifiers, even credential-shaped strings inside node labels. The product must treat this as default-sensitive content even though it isn't legally regulated.

**Requirements:**
- Anonymous diagrams: stored encrypted at rest, accessible only via the random short-URL slug (slug must be cryptographically random, not sequential — no enumeration)
- Premium diagrams: same encryption, plus access scoped to the owning user account
- **No diagram content is ever indexed by search engines.** All diagram pages return `noindex, nofollow` headers and are excluded from `robots.txt`
- **No diagram content is ever surfaced in any public gallery, suggested-content surface, or "trending diagrams" list.** This is a hard rule — public discovery is architecturally absent, not "off by default"
- Anonymous → premium claim flow: when a user signs up and claims their anonymous diagrams from this browser, the claim is authenticated against the session token, not the diagram URL alone

### Authentication & Account Security (Wave 1.1 Premium)

When premium ships, the bar is "boring, correct, and unsurprising" — not novel:
- Email + password with industry-standard hashing (argon2id or bcrypt with a current cost factor)
- Optional OAuth (Google + GitHub at minimum — both are first-class for the engineer audience)
- Session tokens are HTTP-only, secure, SameSite=Lax minimum
- Rate-limited login and password-reset endpoints
- No SMS-based 2FA; if 2FA ships in v1, it is TOTP-based

### Payment Processing

Premium subscriptions go through a third-party processor (Stripe or Paddle — chosen at architecture phase). MermaidWeb never directly handles or stores card numbers. PCI-DSS scope is reduced to **SAQ-A** (the lightest tier), achieved by ensuring the payment form is hosted by the processor (Stripe Elements / Paddle Checkout overlay), not embedded as raw form fields on MermaidWeb's domain.

**Implication for build:** the processor's hosted-checkout integration is the only acceptable shape. Custom-styled card input forms that touch card data are out of scope and out of policy.

### Privacy & Regulatory Posture

- **GDPR-light compliance:** privacy policy, terms of service, cookie disclosure, and a working data-deletion request path for premium users (anonymous users delete via clearing browser storage and the diagram-deletion UI). EU users are not actively excluded; the product is not making aggressive marketing claims of GDPR-readiness, but the basics are present
- **No marketing email at launch.** Transactional email only (signup confirmation, password reset, payment receipts). Avoids the CAN-SPAM / GDPR-marketing surface entirely until there's an actual marketing program to support
- **No analytics partner that re-sells user data.** First-party analytics (PostHog self-hosted, Plausible, or equivalent) — not Google Analytics with default ad-personalization

### Wave 2 Domain Concerns (LLM Integration)

When AI features ship in Wave 1.2 / Wave 2, additional requirements activate:
- **Customer diagrams are not used to train any model.** This is stated explicitly in the privacy policy and contractually with the chosen LLM provider (OpenAI / Anthropic both offer no-training-by-default API tiers)
- **LLM provider data retention** is set to the minimum the provider supports (Anthropic: zero retention available on enterprise tiers; OpenAI: 30-day default with zero-retention option for eligible accounts)
- **AI cost controls per user** — credit/quota system to prevent a single power user (or attacker) from running up unbounded LLM bills. Free tier gets zero AI calls; premium gets a monthly quota; over-quota is either rate-limited or pay-per-use depending on tier design
- **Prompt-injection-aware handling** of user-pasted content fed into AI calls — treat user input as untrusted data, never as instructions to the model

### Risks & Mitigations Summary

| Risk | Mitigation |
|------|------------|
| User pastes confidential infrastructure into an anonymous diagram, then loses control of the URL | Random slugs, `noindex`, no public gallery, owner-deletion path even for anonymous (via session token) |
| Payment-processing surface area expands PCI scope | Hosted-checkout-only — never touch card data |
| Wave 2 LLM provider trains on customer diagrams | Contractual no-train tier + explicit privacy-policy commitment |
| Wave 2 LLM cost runaway from one user / abuse | Per-user credit/quota system with hard caps |
| Compliance claims drift past reality | No "HIPAA-compliant", "SOC 2", or "enterprise-ready" claims in marketing until they're audit-backed; current posture is honestly stated as "indie product, encryption + access control, not certified" |

## Innovation & Novel Patterns

### Detected Innovation Areas

MermaidWeb's innovation is real but bounded. It is not novel technology — it is a **novel application of well-understood interaction patterns to a domain that has been doing things wrong for decades**, expressed as a coherent family rather than a feature.

**1. Progressive disclosure as the *interaction shape* for diagram comprehension.**
The cognitive insight — *diagrams are static while thinking is dynamic* — is not new in HCI literature (fisheye views, semantic zoom, focus+context, and graph filtering have been studied since the 1990s). What is new is **applying this systematically to Mermaid** as a coherent product family of four modes mapped to distinct comprehension tasks:

- **Collapse/expand** → hierarchical decomposition, hide what you don't care about
- **Focus mode** → mental model construction around a single entity
- **Path mode** → trace a specific call chain or dependency path
- **Depth slider** → top-down structural understanding before drilling in

Each mode answers a question users actually ask of large diagrams. Together they form a **family** — meaningfully harder to clone than a single feature, and the "stack of compounding advantages" the brief calls out.

**2. Comprehension-first positioning in a creation-first market.**
Mermaid Chart, mermaid.live, Whimsical, Lucidchart, Excalidraw all position around *creating* diagrams. AI tools (Cursor, Sourcegraph, Cody) optimize for code comprehension, not visual structure. **The diagram-comprehension frame is structurally unoccupied.** That alone isn't innovation, but the discipline of refusing to drift back into "another diagram editor" framing — and instead designing every product surface (workspace, share URL, export, AI features) against the comprehension thesis — is a strategic move worth naming.

**3. Recipient as first-class user.**
Most diagram tools treat sharing as terminal — "export to PNG, paste into Slack, done." MermaidWeb treats sharing as **the start of the next user's journey**. Every shared short URL produces a fully interactive workspace; the recipient gets the disclosure family, the editor, and a one-click path to author their own diagram. The recipient → creator conversion is the primary loop the product is built and instrumented around. This isn't a feature; it's a structural commitment about who the product serves.

### Market Context & Competitive Landscape

Adjacent players cluster into four groups, none directly contesting the comprehension-first frame:

| Group | Examples | Optimizes for | Why it doesn't contest the frame |
|-------|----------|---------------|-----------------------------------|
| **Mermaid-native authoring** | mermaid.live, Mermaid Chart | Syntax editing, authoring polish | No comprehension UX on top of large diagrams; positioned as syntax sandboxes / creation tools |
| **General diagramming** | Lucidchart, Whimsical, Excalidraw | Freeform visual creation | Different format (proprietary), different audience (designers/PMs over engineers), no Mermaid-syntax compatibility, no progressive-disclosure interaction model |
| **Doc platforms with embedded Mermaid** | Notion, HackMD, Confluence, GitHub, Obsidian | Document authoring | Render Mermaid as static SVG inside docs — no diagram-level interaction at all |
| **AI code-context tools** | Cursor, Cody, Sourcegraph, CodeSee | Code comprehension | Optimize for code, not visual structure; auto-generate diagrams in some cases but don't try to make existing large diagrams navigable |

**Time-bounded gap:** The window is real but not infinite. Mermaid Chart could add collapse and shrink the gap. AI agents could subsume diagram comprehension entirely on a long enough timeline (already named as F5a in the risk register). First-mover speed and the disclosure family's depth are the primary defenses; Wave 2 AI features and Wave 3 Code Connect are the secondary ones.

### Validation Approach

Innovation gets validated against three levers, in order:

1. **Does the disclosure family produce the "aha" moment on real-world diagrams?**
   - Pre-launch beta: ship to 5–10 engineering friends/colleagues for ~2 weeks of real-diagram usage before public launch. Catch UX-on-real-diagrams risks cheaply.
   - Acceptance signal: at least 60% of beta users hit a meaningful disclosure interaction (focus or path mode on a diagram > 50 nodes) within their first session, unprompted.

2. **Does the recipient → creator loop fire under public-launch traffic?**
   - Instrument from day one: shared-URL opens, recipient time-to-first-disclosure-interaction, recipient → creator conversion within 14 days.
   - Acceptance signal: ≥ 40% recipient-open rate and ≥ 10% recipient-becomes-creator rate sustained over a 4-week rolling window.

3. **Does comprehension-first positioning convert to retention?**
   - Decision gate at week 6: ≥ 200 WAU = thesis validated. < 50 WAU = thesis disconfirmed (F1a). 50–200 WAU = ambiguous, investigate retention loop directly before committing to Wave 2 spend.

### Risk Mitigation

| Innovation risk | Fallback / mitigation |
|------------------|------------------------|
| Disclosure family doesn't actually produce the "aha" on real diagrams (UX failure) | Pre-launch beta with 5–10 real users; if focus/path modes don't land, simplify the family before public launch |
| Comprehension-first framing is too abstract to communicate to engineers | Marketing-page copy leads with the demo (interactive 200-node diagram on the homepage), not the thesis. Show, don't tell |
| Mermaid Chart adds collapse and the differentiation collapses | Disclosure family depth (4 modes vs. 1) + Wave 2/3 differentiation (AI generation, Code Connect) maintain distance. Accepted as out-of-control beyond that |
| AI agents subsume the category before Year 2 | Partial hedge: Wave 2 ships AI features inside MermaidWeb. Tail risk explicitly accepted in the brief |
| The disclosure family is harder to build than the prototype suggests (focus and path modes are each novel UX work) | Build order locked cheapest-first; pre-approved 3-mode fallback documented in Project Scoping section |

## Web Application Specific Requirements

### Project-Type Overview

MermaidWeb is a browser-based **single-page application** (SPA) centered on an interactive Mermaid workspace and a recipient-facing share viewer that runs the same workspace bundle. The product is browser-only in v1 — no native desktop app, no mobile app, no IDE/browser extensions (all deferred). The architecture spike will decide both the renderer technology (SVG vs. Canvas vs. WebGL) and the workspace layout (single-pane, two-pane, or multi-pane configurations); the disclosure family, editor, and share-recipient experience all run as a SPA regardless of those choices.

### Architecture Decisions (locked)

These were locked during the brainstorm and brief and are repeated here as the binding decisions for the web-app surface:

- **SPA**, not MPA. Single-page workspace; share-recipient pages hydrate from the same SPA bundle.
- **Backend persistence from day one** for both anonymous and premium diagrams (no URL-encoded state). Eliminates URL-length issues entirely.
- **Mermaid is the only diagram format in v1.** D2/PlantUML are post-launch.
- **Markdown is first-class.** A Markdown source surface and a rendered preview are part of the workspace; view-only mode (no editor) is rejected.
- **Click is the primary disclosure trigger**, with keyboard shortcuts via the command palette.

### Open Design Decisions (resolved during architecture / design phase)

- **Renderer technology** (SVG vs. Canvas vs. WebGL) — decided by a 1–2-weekend architecture spike against real-world Mermaid diagrams of 200/500/1000+ nodes. Blocks the disclosure-family build.
- **Workspace layout** — single-pane vs. two-pane (e.g., source + canvas, with rendered Markdown inline) vs. multi-pane (source / rendered / canvas) is an open design choice. The brainstorm leaned multi-pane; the actual count is decided during design with real diagrams in front of real users. The Markdown-native + comprehension-first commitments hold regardless.

### Browser Support Matrix

Target browsers, two-tier:

**Tier 1 — full support, all features tested per release:**
- Chrome / Edge — last 2 stable major versions
- Firefox — last 2 stable major versions
- Safari — current and previous stable major version (15+ at minimum)

**Tier 2 — best effort, no regression-testing burden:**
- Older Safari, Firefox ESR, Chrome on older OS versions — should render and basic editing should work; advanced disclosure interactions may degrade gracefully

**Out of scope for v1:**
- Internet Explorer (any version)
- Mobile browsers as a first-class target — the workspace is desktop-optimized; mobile is "viewer works, editor not promised"
- WebView-only embeds (Electron / Tauri / native shells) — possible later, not now

### Responsive Design

The workspace is **desktop-first** by deliberate choice — large diagrams on small screens are a contradiction the product won't pretend to solve in v1.

| Viewport | Behavior |
|----------|----------|
| ≥ 1280 px wide | Full workspace layout, panes resizable (whatever the final pane count is) |
| 1024 – 1279 px | Workspace stays, default widths tighten; minimap may auto-hide on initial load |
| 768 – 1023 px (tablet) | Reduced layout (e.g., tab-switchable secondary surfaces); disclosure family fully functional |
| < 768 px (mobile) | **Read-only / viewer mode only.** Diagram is interactive (collapse/focus/path work); editor is hidden behind an "Open in desktop" prompt. Acceptable degradation for v1 |

**Mobile editor is V2.** Recipients on mobile *can* still interact with shared diagrams — this matters because share recipients arrive from Slack on phones.

### Performance Targets

Targets are **measured, instrumented, and tied to real-world diagram sizes** — not generic "fast" goals.

| Metric | Target | Diagram size | Notes |
|--------|--------|--------------|-------|
| Time-to-interactive (recipient cold load) | ≤ 3.0 s on broadband (50 Mbps) | 200-node diagram | The distribution loop SLA — if this slips, the loop dies |
| Time-to-first-render | ≤ 1.5 s on broadband | 200-node diagram | The recipient sees diagram outline before fully interactive |
| Disclosure interaction frame time | p50 ≤ 16 ms, p95 ≤ 33 ms | 200-node diagram | Smooth on a typical engineer laptop |
| Disclosure interaction frame time (degraded) | p50 ≤ 33 ms (visible but no judder) | 500-node diagram | Graceful degradation tier |
| Render-without-crash | Diagram renders, basic interactions work | 1000+ node diagram | Hard floor — the product doesn't break on real-world large diagrams |
| Anonymous-diagram save → URL ready | ≤ 300 ms p50 | n/a | Latency the user perceives as "share is instant" |

**Performance budget enforcement:**
- Real-world diagram fixtures (200 / 500 / 1000+ nodes) are checked into the test suite from the architecture-spike output forward
- Frame-time budgets verified against fixtures continuously
- Budget regressions block release in pre-launch beta and post-launch sprints

### SEO Posture

**Indie-stage stance: minimal. The marketing page is indexable; everything diagram-shaped is not.**

- Marketing landing page and pricing page are indexable with basic Open Graph metadata. No content-marketing program at launch.
- **All diagram pages (`/d/{slug}`) return `noindex, nofollow` headers and are excluded from `robots.txt`.** This is a privacy rule, not a marketing decision — user-pasted diagrams may contain confidential infrastructure detail.
- All authenticated app routes are non-indexed.

Content marketing, keyword strategy, structured data, sitemap optimization — deferred until there's a marketing program to support.

### Real-Time Requirements

**No real-time multi-user collaboration in v1.** Live cursors / presence / co-editing is V2.

**What *is* real-time in v1:**
- The workspace itself: source edits live-update the rendered preview and Mermaid canvas (single-user, single-tab)
- Disclosure-family interactions are real-time on the canvas (no server round-trip for collapse/focus/path/depth)

**Network behavior:**
- Diagram saves are debounced (~500 ms after last edit) and async — UI never blocks on save
- Recipient view: read-once-then-cache. Recipients don't see live edits from the author unless they reload (acceptable at v1; live recipient view is V2)
- Optimistic UI: anonymous-diagram creation, share-URL generation, and edits all update the UI before server confirms; rollback on failure

### Sections Skipped (per CSV `skip_sections`)

**Native features** and **CLI commands** — not applicable. MermaidWeb is browser-only and has no native or CLI surface in v1. IDE/browser extensions are deferred to V2+.

### Implementation Considerations

- **Stack-level choices deferred to architecture phase**, not locked in this PRD: front-end framework, state management, renderer (the blocking decision), backend stack, database, hosting, *and final workspace layout/pane count*. The PRD constrains the *shape* of decisions (SPA, backend-from-day-one, no public indexing of diagrams, performance budgets), not specific technologies or pane counts.
- **Build order from brainstorm reaffirmed:**
  1. Architecture spike — renderer choice (1–2 weekends)
  2. Backend skeleton — anonymous diagram records, short URL generator, session token, share endpoint (1 weekend)
  3. Disclosure family — collapse → depth slider → focus → path (4–6 weekends, in that order; cheapest first)
  4. Workspace layout + Mermaid editor (2–3 weekends, pane count finalized here)
  5. Command palette + minimap (2 weekends)
  6. Analytics instrumentation continuously alongside, not retrofit
- **Pre-launch beta gate:** ship to 5–10 engineering friends/colleagues for ~2 weeks of real-diagram usage before any public launch
- **Public launch channels** (recap from brief): HN, Reddit r/programming, dev.to, Mermaid community, engineering Twitter/X

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**MVP Approach: Problem-Solving MVP + Distribution-Loop MVP (combined).**

The Wave 1.1 launch is structured around two concurrent validation jobs:
1. **Problem-solving validation** — does the disclosure family actually produce the "aha" moment on real-world Mermaid diagrams? Validated by recipient time-to-first-disclosure-interaction and the 6-week WAU gate.
2. **Distribution-loop validation** — does the recipient → creator conversion fire? Validated by share open rate, recipient → creator conversion, and shares-per-active-user.

This is **not a revenue-validation MVP.** Premium ships in Wave 1.1 to validate that *some* free users will pay for persistence/sharing/branding — but a low single-digit % conversion rate is enough signal at this gate. Meaningful revenue is a Wave 2/3 concern.

**Resource Requirements:**
- **Team size:** 1 (Ahmed, founder-engineer)
- **Cadence:** side-project / weekend pace
- **Pre-launch beta:** 5–10 engineering friends and colleagues for ~2 weeks of real-diagram usage before public launch
- **Budget:** capex deferred (no hiring, no paid acquisition); opex limited to hosting, domain, transactional email, and (Wave 1.2+) LLM API spend
- **Skills required (already present):** front-end engineering, Mermaid familiarity, basic backend, design judgment, willingness to ship a closed-source indie product

### Phase 1 — Wave 1.1: Free Core + Persistence Premium (the MVP launch)

**Build sequence (locked by brainstorm):**
1. Architecture spike — renderer choice (1–2 weekends)
2. Backend skeleton — anonymous diagram records, short URL generator, session token, share endpoint (1 weekend)
3. Disclosure family — collapse → depth slider → focus → path (4–6 weekends, cheapest first)
4. Workspace layout + Mermaid editor (2–3 weekends; pane count finalized here)
5. Command palette + minimap (2 weekends)
6. Premium tier — auth, anonymous-claim flow, share permissions, export with collapse states, custom themes (~3–4 weekends)
7. Analytics instrumentation — continuous, alongside all of the above (not retrofit)
8. Pre-launch beta with 5–10 engineering friends/colleagues (~2 weeks)

**Total realistic side-project budget:** ~3–6 months of consistent weekend work.

**Core User Journeys Supported in Phase 1:**
- Journey 1 (Priya — recipient/reader)
- Journey 2 (Marcus — author)
- Journey 3 (Sam — recipient → creator distribution loop)
- Journey 4 (Alex — premium upgrade trigger)

All four primary journeys are in scope for Wave 1.1. None are deferred.

**Must-Have Capabilities (Wave 1.1):**

*Free tier:*
- Markdown-native workspace with source / rendered preview / interactive Mermaid canvas, live-syncing (layout finalized in design)
- Mermaid syntax editor with syntax highlighting and validation
- Progressive disclosure family — all four modes (collapse/expand, focus, path, depth slider)
- Command palette (Cmd+K) with fuzzy node search
- Minimap with viewport indicator
- Backend-stored diagrams from day one
- Clean short share URLs (`mermaidweb.app/d/{slug}`)
- No-account access via anonymous session tokens
- Distribution-loop instrumentation live before public launch

*Premium tier:*
- Email + password auth (with Google + GitHub OAuth as fast-follow)
- Anonymous → premium claim flow on signup
- Share permissions (view-only vs. editable)
- Export to PNG / SVG / PDF with collapse states preserved
- Custom themes / branding
- Stripe or Paddle hosted checkout (PCI SAQ-A scope)

**Pre-approved fallback (within Phase 1):**

If path mode proves harder than the 4–6-weekend disclosure-family budget allows, ship the disclosure family as 3 modes (collapse/expand + depth slider + focus) at pre-launch beta and add path mode in a fast-follow patch within 2–4 weeks of launch. Default plan is to ship all 4 modes at launch; this fallback only activates if path mode is genuinely intractable in budget. (Pre-approved in brainstorm risk register and in scoping confirmation.)

### Phase 2 — Wave 1.2: AI Generation Premium

**Trigger:** Wave 1.1 hits the green-zone decision gate (≥ 200 WAU at week 6).

**Capabilities added (premium-tier):**
- AI: code → diagram (paste code, get Mermaid)
- AI: prose → diagram (paste spec / PRD, get Mermaid)
- AI: diagram improvement / refactor suggestions

**Build risk:** Medium. LLM provider integration, prompt engineering, cost/credits system, malformed-output handling, prompt-injection-aware input handling.

**Dependencies on Phase 1:**
- Premium auth + billing must exist (LLM costs need a paying account to amortize against)
- Cost-control infrastructure (per-user credit/quota system) must ship with the AI features, not after
- LLM provider's no-train tier must be contractually in place before any customer diagram is sent

### Phase 3 — Wave 1.3: Code Connect Premium

**Trigger:** Wave 1.2 validates that users will pay more for AI generation.

**Capabilities added (premium-tier):**
- Bind a diagram node to a single code file (capability 2A from brainstorm)
- Range bindings (capability 2B) as fast follow

**Build risk:** Medium-high. File-tree UI, file picker, persistent bindings, navigation surfaces, integration with chosen storage model.

**Dependencies on Phase 2:**
- Wave 1.2 usage patterns reveal what code-binding UX should actually look like
- AI features available means users have a richer mental model of the diagram, making code binding more useful

### Phase 4 — V2 Growth Features (post-V1 validation)

These ship **only after the full V1 (1.1 + 1.2 + 1.3) has audience validation.** Sequencing within V2 is not pre-committed:

- Real-time collaboration, comment threads on nodes, team workspaces
- AI explanation of an existing diagram and AI Q&A (natural-language navigation)
- Auto-generate diagram from a whole repo
- Embeds in Notion / Confluence / GitHub
- Templates library
- Slack / Discord / Teams integrations
- Mobile / tablet viewer (the editor side; recipient viewer is already in V1)
- Annotations on nodes (Consider pile from SCAMPER)
- Diagram diff view (Consider pile from SCAMPER)
- Diagram formats beyond Mermaid (D2, PlantUML, BPMN)

### Phase 5 — Vision (Year 2-3)

**Multi-format diagram + document comprehension layer.** Long-horizon expansion from "Mermaid comprehension tool" to "the place organizations make their internal documentation actually navigable." Long-horizon AI-agent comprehension optionality is flagged but not committed.

### Out of Scope (locked, all phases)

These are not deferred — they are not part of the product strategy:
- Open-sourcing MermaidWeb (closed-source commercial product)
- Public diagram gallery / community feed (architecturally absent — privacy rule)
- Multi-repo support, CI-driven code↔diagram sync (skipped from brainstorm)

### Risk Mitigation Strategy

**Technical Risks:**
- *Renderer performance on real-world large diagrams:* architecture spike before disclosure-family build, fixtures at 200/500/1000+ nodes checked into test suite, frame-time budgets enforced continuously
- *Disclosure family is harder to build than the prototype suggests:* build order locked cheapest-first (collapse → depth slider → focus → path); if path mode is intractable, ship 3-mode family and fast-follow
- *Backend/auth/payments at indie scale:* use boring well-trodden building blocks (Stripe/Paddle hosted checkout, argon2id, SAQ-A scope). No novel infrastructure
- *LLM cost runaway in Wave 1.2:* per-user credit/quota system ships *with* the AI features, not after — hard caps from day one

**Market Risks:**
- *F1a — adoption fails because reading is intermittent:* validated against pre-committed 6-week 200-WAU gate; authoring made first-class to drive daily use; distribution loop instrumented as leading indicator
- *Mermaid Chart adds collapse and the gap shrinks:* first-mover speed + disclosure family depth (4 modes) + Wave 2/3 differentiation. Accepted as out-of-control beyond that
- *AI agents subsume diagram comprehension:* partially hedged by Wave 1.2 AI features inside the product. Tail risk explicitly accepted
- *Pre-launch beta surfaces UX failures on real diagrams:* deliberately scoped — 5–10 engineering friends for 2 weeks before public launch, *exactly* to catch this cheaply

**Resource Risks:**
- *Side-project pace + burnout:* wave staging is the management mechanism — each wave can stand alone as a release if life slows down. Wave 1.1 alone is a useful product
- *Less weekend time than projected:* the 3–6 month estimate is honest, not optimistic. If it slips to 6–9 months, the product still ships; the only thing that breaks is the launch-date psychology, not the plan
- *Contingency:* if Ahmed loses 2+ weekends to obligations mid-build, the fallback is ship Wave 1.1 with 3 disclosure modes + skip custom themes (defer to a fast-follow). Both are pre-approved degradations that don't break the product thesis
- *Scaling beyond solo:* not contemplated for Wave 1.x. Wave 2 / V2 may justify contractor help (designer for landing page, possibly a part-time backend engineer); not budgeted in current plan

## Functional Requirements

The following requirements are the **capability contract** for MermaidWeb. Every feature shipped in the product must trace back to one of these requirements. Capabilities not listed here are out of scope until explicitly added.

Each FR is tagged with the phase in which it must first be available: **[1.1]** = Wave 1.1 launch, **[1.2]** = Wave 1.2 (AI generation), **[1.3]** = Wave 1.3 (Code Connect), **[V2]** = post-V1.

### Diagram Workspace & Editing

- **FR1 [1.1]:** Any user can paste, type, or edit Mermaid syntax in a source-text surface and see the rendered diagram update without manual refresh.
- **FR2 [1.1]:** Any user can write Markdown that contains embedded Mermaid blocks and see both the rendered Markdown preview and the interactive diagram canvas update from the same source.
- **FR3 [1.1]:** Any user can interact with the rendered Mermaid canvas (click, hover, select nodes) directly, not just view it as a static image.
- **FR4 [1.1]:** Any user can resize the source surface, preview surface, and diagram canvas relative to one another within the workspace.
- **FR5 [1.1]:** The Mermaid editor surfaces syntax errors inline in a way the user can locate and correct without leaving the workspace.

### Progressive Disclosure Family

- **FR6 [1.1]:** Any user can collapse a subgraph into its parent node and re-expand it, reversibly.
- **FR7 [1.1]:** Any user can enter a "focus" state on a selected node such that nodes not connected to it are visually de-emphasized.
- **FR8 [1.1]:** Any user can select two nodes and have the path(s) between them visually highlighted (path mode). *Pre-approved fallback: may ship in 2–4-week fast-follow patch if intractable in Wave 1.1 budget.*
- **FR9 [1.1]:** Any user can adjust a depth-based control such that the diagram auto-collapses everything below a chosen depth, reversibly.
- **FR10 [1.1]:** Any user can exit any disclosure mode and return the diagram to its fully-expanded default state.
- **FR11 [1.1]:** Disclosure interactions can be triggered both by direct manipulation (click) and by keyboard.

### Navigation & Wayfinding

- **FR12 [1.1]:** Any user can open a command palette and search for nodes by label using fuzzy matching.
- **FR13 [1.1]:** Any user can navigate to (focus / scroll to) a node selected from the command palette.
- **FR14 [1.1]:** Any user can see a minimap that indicates the current viewport position relative to the full diagram.
- **FR15 [1.1]:** Any user can pan and zoom the diagram canvas.

### Persistence & Session Management

- **FR16 [1.1]:** Any user can create a diagram without signing up or providing personal information.
- **FR17 [1.1]:** Anonymous diagrams persist across browser sessions on the same device via a session token.
- **FR18 [1.1]:** Each diagram (anonymous or premium) receives a unique, cryptographically random short URL slug that does not encode the diagram content.
- **FR19 [1.1]:** A premium user can claim diagrams previously created anonymously in the same browser session, associating them with their account on signup.
- **FR20 [1.1]:** A premium user can list, rename, and delete the diagrams they own.
- **FR21 [1.1]:** Any user can delete a diagram they created (anonymous via the diagram's UI; premium via account dashboard).

### Sharing & Recipient Experience

- **FR22 [1.1]:** Any user can copy or send a short URL that opens their diagram in a fully interactive workspace for the recipient.
- **FR23 [1.1]:** A recipient opening a shared URL gets the same disclosure family, command palette, and minimap available to the original creator, without signing up.
- **FR24 [1.1]:** A recipient can create their own new diagram from any shared workspace in a single, obvious action.
- **FR25 [1.1]:** A premium user can share a diagram with a chosen permission level (view-only or editable) such that recipients are restricted accordingly.

### Account & Premium Features

- **FR26 [1.1]:** A user can create a premium account using email + password, and over time using OAuth (Google, GitHub) as a fast-follow.
- **FR27 [1.1]:** A premium user can subscribe, change plan, or cancel via a hosted-checkout flow that does not expose card data to MermaidWeb.
- **FR28 [1.1]:** A premium user can apply custom themes / branding to their diagrams that propagate to shared and exported outputs.
- **FR29 [1.1]:** A premium user can export any diagram to PNG, SVG, and PDF formats, with the diagram's current collapse state preserved in the exported artifact.
- **FR30 [1.1]:** A premium user can request deletion of all account data and have it carried out within a documented timeframe.

### AI-Assisted Generation (Wave 1.2)

- **FR31 [1.2]:** A premium user can paste source code and receive a generated Mermaid diagram representing its structure.
- **FR32 [1.2]:** A premium user can paste prose (e.g., a spec or PRD section) and receive a generated Mermaid diagram representing its content.
- **FR33 [1.2]:** A premium user can request AI-generated improvement suggestions for an existing diagram and accept, reject, or edit the result.
- **FR34 [1.2]:** A premium user can see their current AI-generation usage relative to their plan's monthly quota and is prevented from exceeding it.
- **FR35 [1.2]:** AI features operate under a no-training contractual posture with the chosen LLM provider; user diagrams are never used to train any model.

### Code Connect (Wave 1.3)

- **FR36 [1.3]:** A premium user can bind a diagram node to a single code file path.
- **FR37 [1.3]:** A premium user can navigate from a bound node to the corresponding code file, and from a bound code file back to the diagram node.
- **FR38 [1.3]:** A premium user can bind a diagram node to a range within a code file (line ranges) — fast-follow capability after FR36.

### Observability & Analytics

- **FR39 [1.1]:** The system records weekly active users, diagrams created, diagrams shared, recipient opens of shared URLs, recipient → creator conversions, and returning-author rates.
- **FR40 [1.1]:** The system records free → premium conversion events at the moment of paid signup.
- **FR41 [1.1]:** Analytics instrumentation is verified live and producing data before the public launch, not retrofitted afterward.

### Out-of-scope capabilities (named here so they cannot be reintroduced silently)

- ❌ Real-time multi-user co-editing — V2
- ❌ Comment threads on nodes — V2
- ❌ Team workspaces / org-level admin — V2
- ❌ Diagram formats other than Mermaid — V2+
- ❌ Notion / Confluence / GitHub embeds — V2
- ❌ Mobile editor — V2 (recipient viewer on mobile is in V1)
- ❌ Public diagram gallery / discovery feed — never (privacy rule)
- ❌ Open-sourcing the product — never (strategy decision)
- ❌ Public API / webhooks — V2+
- ❌ Multi-repo, CI-driven code↔diagram sync — never / Maybe pile

## Non-Functional Requirements

The following NFRs specify **how well** MermaidWeb must perform on the dimensions that matter for the Wave 1.1 launch and beyond. Categories are included only where they materially affect product success at indie scale; accessibility, internationalization, and external-integration NFRs are deliberately excluded for the current phase.

### Performance

The renderer and the recipient cold-load are the two performance surfaces that materially affect product success.

- **NFR-P1 [1.1]:** Recipient cold-load time-to-interactive is ≤ 3.0 s on broadband (50 Mbps) for a 200-node Mermaid diagram. This is the distribution-loop SLA — slip it and the loop dies.
- **NFR-P2 [1.1]:** Time-to-first-render is ≤ 1.5 s on broadband for a 200-node diagram so the recipient sees diagram outline before fully interactive.
- **NFR-P3 [1.1]:** Disclosure interaction frame time is ≤ 16 ms p50 and ≤ 33 ms p95 on a 200-node diagram on a typical engineer laptop.
- **NFR-P4 [1.1]:** Disclosure interaction frame time degrades gracefully on a 500-node diagram (≤ 33 ms p50, no visible judder).
- **NFR-P5 [1.1]:** Diagrams of 200+ nodes render and support basic interactions without crashing the browser or losing the user's work.
- **NFR-P7 [1.1]:** Anonymous-diagram save → share URL ready in ≤ 300 ms p50; the user perceives sharing as instant.
- **NFR-P8 [1.1]:** Performance budgets are enforced continuously against a fixture set of real-world Mermaid diagrams (200 / 500 ) checked into the test suite. Regressions block release.

### Security & Privacy

User-pasted content is treated as default-sensitive, even though the product is not in a regulated industry.

- **NFR-S1 [1.1]:** All diagram content is encrypted at rest. Anonymous diagrams are accessible only via their cryptographically random short-URL slug; premium diagrams are additionally scoped to the owning user account.
- **NFR-S2 [1.1]:** Short-URL slugs are cryptographically random with sufficient entropy (≥ 64 bits effective) to make enumeration infeasible. Sequential or guessable slugs are forbidden.
- **NFR-S3 [1.1]:** All diagram pages return `noindex, nofollow` headers, are excluded from `robots.txt`, and never appear in any sitemap. No diagram is ever surfaced in any public discovery surface.
- **NFR-S4 [1.1]:** All network traffic uses TLS 1.2 or higher. HTTP requests are redirected to HTTPS.
- **NFR-S5 [1.1]:** Premium-account passwords are hashed with argon2id (or bcrypt with current-cost factor) and never stored in plaintext or recoverable form.
- **NFR-S6 [1.1]:** Session tokens are HTTP-only, Secure, and SameSite=Lax minimum. Login and password-reset endpoints are rate-limited.
- **NFR-S7 [1.1]:** Card data never touches MermaidWeb infrastructure; payment is handled by the chosen processor's hosted-checkout flow (PCI-DSS SAQ-A scope).
- **NFR-S8 [1.1]:** A working data-deletion path exists for premium users, executed within 30 days of request.
- **NFR-S9 [1.1]:** Dependencies are scanned for known vulnerabilities at least weekly; high-severity vulnerabilities are patched within 7 days of public disclosure.
- **NFR-S10 [1.2]:** AI features operate under a contractual no-training agreement with the LLM provider; LLM-provider data retention is set to the minimum supported tier.
- **NFR-S11 [1.2]:** User-pasted content sent to LLM APIs is treated as untrusted data, never as instructions to the model (prompt-injection-aware handling).

### Reliability & Durability

Reliability is bounded by what matters at indie scale: writes must be durable, share URLs must not 404, and recipient experience must not silently break.

- **NFR-R1 [1.1]:** Diagram save / load operations succeed for ≥ 99.5% of attempts measured monthly. Note: this targets *write reliability and durability*, not "marketing-page uptime."
- **NFR-R2 [1.1]:** Once a short share URL has been issued, it does not 404 except as the result of an explicit owner-initiated deletion.
- **NFR-R3 [1.1]:** Anonymous diagrams persist for at least 90 days from last access, after which the deletion policy is documented and enforced (e.g., extended retention or scheduled cleanup — the specific policy is locked before public launch).
- **NFR-R4 [1.1]:** Premium diagrams persist indefinitely until the owner deletes them or closes the account.
- **NFR-R5 [1.1]:** Backups are taken at least daily for premium-tier diagram storage; restore from backup is tested at least quarterly.
- **NFR-R6 [1.1]:** The system gracefully degrades when the backend is unreachable: in-flight edits are preserved in browser state and a clear error is shown rather than silent loss.

### Scalability

Indie launch — small absolute numbers, but the recipient → creator loop creates viral-spike risk that must not break the product.

- **NFR-Sc1 [1.1]:** The system supports the Wave 1.1 target of ≥ 200 WAU at week 6, with headroom to absorb a 10× spike (e.g., from a successful HN/Reddit post) without write failures or share-URL latency exceeding 1 s p95.
- **NFR-Sc2 [1.1]:** Hosting and database choices are elastic enough that absorbing a viral spike is a configuration change, not a re-architecture. Specific stack choices are deferred to architecture phase.
- **NFR-Sc3 [1.2]:** Wave 1.2 LLM cost is bounded by per-user quotas with hard caps; total LLM-spend exposure for the platform is monitored and alerted on.
- **NFR-Sc4 [V2]:** Scaling beyond V1 (real-time collaboration, team workspaces) requires re-architecture and is out of NFR scope here.

### Maintainability

The product is built and operated by a solo founder; future-self maintainability is non-negotiable.

- **NFR-M1 [1.1]:** Build, test, and deploy are automated end-to-end. Manual deployment steps are not part of the release process.
- **NFR-M2 [1.1]:** A new maintainer (or future-Ahmed after a 3-month gap) can run the full stack locally from a documented setup process in ≤ 30 minutes.
- **NFR-M3 [1.1]:** Critical user-facing paths (workspace, disclosure family, share URL recipient flow, premium signup) have automated tests that run in CI before deploy.
- **NFR-M4 [1.1]:** Production errors are surfaced via a single error-monitoring channel (e.g., Sentry equivalent); the founder is alerted on new error classes.
- **NFR-M5 [1.1]:** Logs and metrics for each user-facing FR area are retained for at least 30 days for debugging and product-decision purposes.

### Cost

LLM and hosting cost discipline matters at indie revenue scale.

- **NFR-C1 [1.1]:** Wave 1.1 monthly opex (hosting, database, transactional email, domain, monitoring) stays under a documented ceiling — chosen pre-launch, recalibrated by traffic — that the founder can sustain without revenue.
- **NFR-C2 [1.2]:** LLM-spend per premium user is bounded by the quota system such that LLM cost per user does not exceed a fixed fraction of subscription revenue (target: ≤ 30% gross margin contribution from LLM costs).
- **NFR-C3 [1.2]:** Cost monitoring and alerting are live before any LLM feature ships; first-dollar visibility into spend is non-negotiable.
- **NFR-C4 [1.1]:** Hosting and storage costs scale roughly linearly with usage, not with worst-case provisioning. Reserved capacity is sized for current usage with auto-scale headroom, not for hypothetical future usage.

### Out-of-Scope NFR Categories (named explicitly)

- **Accessibility:** Excluded for indie phase. Revisit when scale, enterprise customers, or legal exposure makes WCAG-AA a requirement. Marketing materials will not claim WCAG conformance until verified.
- **Internationalization / Localization:** English-only at launch. Multi-language support is V2+.
- **External integration / API:** No integrations or public API in V1. Revisit when V2 surfaces (Notion / Confluence / GitHub embeds, public API) come into scope.
- **Disaster recovery beyond daily backup:** Multi-region failover, RPO/RTO formal targets, etc., not in scope at indie scale. Daily backup + tested restore is the floor.

## Open Decisions

The following decisions are deliberately deferred. Each is named here so it does not get lost between the PRD and downstream phases (architecture, design, launch). Each decision has a clear owner, trigger point, and consequence-if-deferred.

| # | Decision | Owner | Trigger / Deadline | Default if not decided in time |
|---|----------|-------|---------------------|---------------------------------|
| 1 | **Public launch date** | Founder | Set before architecture spike begins | Side-project drift — actively at risk per brainstorm; pick a calendar date even if soft |
| 2 | **Renderer technology** (SVG / Canvas / WebGL) | Architecture spike | Before disclosure-family build (1–2 weekends in) | Blocks all disclosure-family work; cannot be skipped |
| 3 | **Workspace layout / pane count** (single, two-pane, multi-pane) | Design phase | Before the workspace-and-editor build (Phase 1 step 4) | Fall back to multi-pane (source / preview / canvas) — the brainstorm leaning, but not locked |
| 4 | **Wave 1.1 premium pricing** | Founder, pre-launch | Before payment processor integration | Likely $5–15/mo individual, finalized closer to launch |
| 5 | **Payment processor** (Stripe vs. Paddle) | Founder, architecture phase | Before premium-tier build | Paddle preferred for EU VAT MOSS handling; Stripe acceptable; pick before billing code is written |
| 6 | **Anonymous diagram retention policy** (NFR-R3) | Founder, pre-launch | Locked before public launch | 90 days from last access (current minimum); may extend to 365 days or indefinite based on storage cost |
| 7 | **Annotations on nodes** (Consider pile) | Founder, during build | Decide during workspace build, V1.1 or defer | Default: defer to V2 unless an obvious build window appears |
| 8 | **Diagram diff view** (Consider pile) | Founder, post-launch | Revisit after Wave 1.1 has signal | Default: V2; not part of the comprehension thesis as currently scoped |
| 9 | **LLM provider for Wave 1.2** (OpenAI / Anthropic / other) | Founder, architecture for Wave 1.2 | Before Wave 1.2 begins | Both offer no-train tiers; decide closer to Wave 1.2 build based on cost, model quality on diagram tasks, and latency |
| 10 | **Front-end framework, backend stack, database, hosting** | Architecture phase | Before Phase 1 build begins beyond the spike | Out of scope for this PRD; constrained by NFRs but technology-agnostic |

**Shipping discipline note:** The brainstorm explicitly named *"side projects without deadlines drift indefinitely"* as a real risk. Decision #1 (public launch date) is the most important open decision in this list — not because the date itself matters, but because the act of committing to one creates the forcing function that makes every other decision in this table get resolved.


---
stepsCompleted: [1, 2, 3, 4]
inputDocuments: []
session_topic: 'Defining the right product to build around progressive-disclosure diagram navigation for codebase documentation'
session_goals: 'Validate whether progressive disclosure is a defensible moat, expand product surface area, surface adjacent problems, identify monetization angles, and land on a defensible main application thesis worth building'
selected_approach: 'user-selected'
techniques_used: ['Five Whys', 'Constraint Mapping', 'Assumption Reversal', 'First Principles Thinking', 'Mind Mapping', 'SCAMPER', 'Reverse Brainstorming', 'Analogical Thinking + Cross-Pollination']
ideas_generated: []
context_file: ''
---

# Brainstorming Session Results

**Facilitator:** Ahmed
**Date:** 2026-05-05

## Session Overview

**Topic:** Defining the right product to build around progressive-disclosure diagram navigation for codebase documentation.

**Goals:**
1. Pressure-test whether progressive disclosure is a real moat or just a feature
2. Generate a wide range of product directions (editor, viewer, IDE plugin, AI-powered, etc.)
3. Surface adjacent problems the underlying tech could solve
4. Identify monetization angles tied to genuine user pain
5. Land on a defensible "main application" thesis worth building

### Background Context

Ahmed (software engineer) built a prototype where huge Mermaid diagrams (graphs + subgraphs) can be progressively disclosed — clicking a subgraph collapses everything inside, leaving only the parent node visible; clicking again expands it. The motivating pain: engineers struggle to absorb large architecture/codebase documentation, especially mega-diagrams that try to show everything at once.

Initial product hypotheses on the table:
- **A. MD document editor** with embedded Mermaid canvas (edit diagrams via UI alongside the doc)
- **B. Standalone Mermaid editor** with progressive disclosure as the moat (vs. Mermaid Chart, mermaid.live, etc.)
- **C. Something else** that takes the progressive-disclosure insight further

Open strategic question: Is progressive disclosure alone enough of a moat? What's the actual problem we're solving — Mermaid editing, or codebase comprehension?

## Technique Selection

**Approach:** User-Selected Techniques

**Selected Techniques (in execution order):**

### Phase 1 — Validate the Real Problem
1. **Five Whys** — Drill to the root cause of "engineers struggle with large diagrams"
2. **Constraint Mapping** — Identify what truly blocks engineers from understanding docs today
3. **Assumption Reversal** — Flip each baked-in assumption to surface hidden pivots

### Phase 2 — Rebuild from Scratch
4. **First Principles Thinking** — Strip "Mermaid editor" framing and rebuild from atoms
5. **Mind Mapping** — Branch from the central insight into adjacent product territories

### Phase 3 — Expand & Pressure-Test
6. **SCAMPER** — Run leading idea through 7 lenses for systematic surface expansion
7. **Reverse Brainstorming** — Try to make the product fail spectacularly, extract risks
8. **Analogical Thinking + Cross-Pollination** — Steal patterns from other domains

**Selection Rationale:** Ahmed selected Constraint Mapping and Mind Mapping explicitly, then accepted the suggested core sequence. The combination front-loads problem validation before solution expansion — the best protection against building the wrong thing.

### Mid-Session Strategic Reframe (after Five Whys)

Ahmed surfaced the real strategic tension: he wants to build a focused indie SaaS earning ~$1–10K MRR, NOT a venture-scale unicorn — but doesn't want to be blind if a 10x opportunity is hiding in the same insight. **Decision: Path B — Wedge Mode.** Build the narrow indie product as a Trojan horse: ship Mermaid + progressive disclosure with the *option* to expand into a broader documentation-comprehension layer if signal emerges. This pivots the remaining sequence away from expansion techniques (First Principles, Cross-Pollination dropped) toward focus + validation + execution techniques.

**Revised technique sequence:**
1. Five Whys (✅ done)
2. Constraint Mapping (next)
3. Assumption Reversal
4. Mind Mapping (light — just to see the bigger map, then put it down)
5. SCAMPER (sharpen the wedge)
6. Reverse Brainstorming (stress-test)

---

## Five Whys — Findings

**Chain of root cause:**
- **L1:** Engineers struggle with huge codebase diagrams
- **L2:** Specifically — path tracing fails, mental model construction fails
- **L3:** Because diagrams (a) show too much at once AND (c) are static while thinking is dynamic
- **L4:** No existing player solves this exact gap. Adjacent players solve code→AI context (Cursor, Cody, Sourcegraph), code→auto-diagram (CodeSee, GitDiagram), or generic diagramming (Lucidchart, Whimsical, Excalidraw). Mermaid Chart focuses on diagram *creation* not *consumption*. Technical implementation difficulty: low.
- **L5 (root):** The real risk is not technical and not competitive — it's **frequency of pain × willingness to pay × AI-displacement risk**.

**Bear case validated by Ahmed:**
- (a) Reading huge diagrams may be a rare engineering activity (monthly/onboarding only) ✅
- (b) When it happens, pain may not be acute enough to pay for ✅

**Bull case validated by Ahmed:**
- (a) Real user is broader: anyone absorbing complex visual info from docs (architecture, infra, ML pipelines, BPMN, ER, K8s topology, state machines) ✅
- (b) Deeper TAM is "comprehension of other people's documentation" — diagrams are the worst-suffering surface ✅
- (e) A small high-quality niche can be a legitimate wedge (Linear, Vercel, Raycast all started narrow) ✅

**Reframe accepted:** The product is probably **"a comprehension layer for technical documentation that contains complex visual structure."** Mermaid is the cheapest viral wedge into it. Indie scope first; expansion-aware architecture.

**Open questions taken forward:**
1. Who feels this pain *daily*, not occasionally?
2. What other diagram formats suffer the same disease?
3. Is the buyer the reader or the writer? (Major strategic fork.)

---

## Constraint Mapping — Findings

**Strategic decisions surfaced during constraint mapping:**

- **This is a side project**, not a funded venture. Time/capital constrained but not blocked.
- **Marketing deferred** — not a near-term concern. Build first, market later.
- **Budget deferred** — same logic.
- **Go-to-market model: free-first, freemium later.**
  - Phase 1: Ship core progressive-disclosure features for free. Build audience and usage.
  - Phase 2: Expand free tier (more features) to deepen adoption.
  - Phase 3: Layer premium tier on top — likely AI features, advanced collaboration, or user/team features.

**User-side constraints (Category 1) confirmed valid:**
- Engineers lack personal budget; expense reimbursement is a major friction
- Developer audience is price-sensitive, free/open-source-biased
- Pain is intermittent, not continuous — recurring-revenue is harder to justify

**Implications of the freemium-later approach:**
- Revenue is *not* the v1 success metric. **Adoption is.**
- The MVP must be genuinely useful and shippable as a free standalone tool — not crippled by paywalls
- Premium hooks need to be *additive* (AI features, collaboration, persistence) not *core feature gating*
- The product must be defensible against "someone clones the free tier and ships it for free" — defensibility comes from execution speed, brand, AI features, or network effects, not from the core feature itself

**Categories deferred (low priority for indie side-project mode):**
- Distribution / channels — revisit after MVP
- Business model — premium tier design comes after audience exists
- Founder / resources — accepted as side-project constraints

**Categories still worth pressure-testing:**
- Product / technical constraints (Mermaid spec, browser perf, rendering limits)
- Competitive / defensibility constraints (Mermaid Chart, AI agents, OSS clones)

### Strategic Commitments Locked During Constraint Mapping

**Premium tier philosophy:** Additive, never subtractive. Free tier remains genuinely useful. Paywall sits on top of free, doesn't gate core comprehension features.

**Premium feature direction (gut-level, refinable):**
- AI-powered auto-generate diagrams from code/specs
- AI-powered diagram improvement / refactor suggestions
- **Code Connect** — link code files to diagram nodes; navigate between code and diagram bidirectionally
- (Implication: premium plays in the AI + code-awareness territory — separating the product from "just a Mermaid editor with collapse")

**Defensibility thesis:**
- Not a single moat — it's a **stack of small advantages**: research depth, first-mover, AI features, code integration. Individually thin; collectively meaningful for the indie scale targeted.
- A weekend clone of progressive disclosure alone wouldn't replicate the AI/code-connect layer.
- First-mover advantage is real if Ahmed ships before incumbents notice or before AI agents fully eat doc comprehension.

**Implicit acceptance:** Browser perf, Mermaid syntax coverage, collapse state persistence — Ahmed accepted these as real but solvable. T1/T2/T3 not actively scary — flagged for engineering attention, not strategic pivot.

---

## Assumption Reversal — Findings

Ahmed reacted to 10 assumptions with K (keep), F (flip), or M (mix):

| # | Assumption | Reaction | Insight |
|---|-----------|---------|---------|
| 1 | Users come with an existing diagram to read | **M** | Both reading AND authoring matter. Product must serve both jobs. |
| 2 | Diagrams live in Markdown docs | **K** | Markdown is the right wrapper. Confluence/Notion are not v1. |
| 3 | User is a software engineer | **M** | Engineer is primary, but tech leads / architects / new hires also feel pain. Multi-persona but engineer-first. |
| 4 | Product is a web app | **M** | Web is core, but adjacent surfaces (VS Code ext, browser ext, plugins) are interesting. Don't be only a destination. |
| 5 | Premium = AI + Code Connect | **M** | AI/Code Connect is the headliner, but collaboration / persistence / team features also pull weight. Premium is a bundle. |
| 6 | Mermaid is the right format | **K** | Mermaid is the right wedge. Other formats (D2, PlantUML) are future, not now. |
| 7 | Progressive disclosure happens via click | **K** | Click-based collapse is the core UX. Query is interesting but not v1. |
| 8 | Free tier wedge → premium funnel is the model | **K** | Direct user monetization (freemium) is the right model. No pivot to consulting/enterprise. |
| 9 | Code Connect is a premium feature | **K** | Code Connect stays premium. Diagram remains the product, not "living code map." |
| 10 | Indie/side-project mode is the call | **K** | Path B (wedge mode, indie scale) confirmed. No pivot to venture. |

**The pattern is striking:**
- **Strategic decisions = locked (K).** Format, business model, scale, premium strategy, scope of disclosure UX — all confirmed.
- **Tactical / execution = mixed (M).** Reading vs. authoring, single vs. multi-persona, web vs. extensions, premium feature mix — these are *bundle* questions, not *pivot* questions.

**Implication: the brainstorm has converged. The remaining work is not strategic exploration — it's MVP scope definition.**

**Locked product spine (post-Assumption Reversal):**
- Web app (with future extension/plugin surfaces possible)
- Markdown-wrapped Mermaid documents
- Click-based progressive disclosure as core UX
- Serves both diagram-reading AND diagram-authoring jobs (Assumption 1 = M)
- Engineer-first, but designed not to alienate adjacent personas (architects, leads, new hires)
- Freemium ladder: free core → free expanded → premium (AI + Code Connect + collaboration bundle)
- Indie scale, side-project pace, expansion-aware architecture

---

## Mind Mapping — Premium Bundle Triage

Ahmed sorted 35 candidate premium features into V1 / V2 / Maybe / Skip. After the initial triage, four differentiation features were promoted from V2/Maybe into V1 (1A, 1B, 1D, 2A), and the V1 itself was then split into a 3-wave launch plan to manage build complexity. The reconciled table:

### 🟢 V1 — Wave 1 (ship first: free core + persistence premium)
*Free tier:*
- Markdown + Mermaid editor
- Progressive disclosure (collapse/expand subgraphs) — the existing prototype, polished

*Premium:*
- **3A** — Save diagrams to account
- **3B** — Share via link (read-only or editable)
- **3H** — Permissions (view/edit/share)
- **3I** — Export to PNG/SVG/PDF with collapse states baked in
- **4A** — Custom themes / branding

### 🟢 V1 — Wave 2 (ship after Wave 1 validates: AI premium)
- **1A** — Auto-generate diagram from code
- **1B** — Auto-generate diagram from prose
- **1D** — AI-assisted diagram improvement

### 🟢 V1 — Wave 3 (ship after Wave 2 validates: code coupling premium)
- **2A** — Bind node to single code file (and likely **2B** range bindings as fast follow)

### 🟡 V2 (clear roadmap, post-launch)
- **1C** — Auto-generate diagram from a whole repo
- **1E** — AI explanation of a diagram
- **1F** — AI Q&A on a diagram (natural language navigation)
- **3C** — Comment threads on nodes
- **3D** — Real-time collaboration
- **3E** — Team workspaces
- **3G** — Embeds in Notion / Confluence / GitHub
- **4D** — Templates library
- **4E** — Slack / Discord / Teams integration
- **4H** — Mobile / tablet viewer

### ⚪ Maybe (interesting, unresolved — revisit after launch)
- **1H** — AI drift detection between code and diagram
- **2B** — Bind node to range of code *(if not already pulled into Wave 3)*
- **2D** — Live code↔diagram sync via CI
- **3F** — Version history / diff
- **4B** — Self-host / private hosting
- **4G** — API / webhooks

### 🔴 Skip
- **1G** — AI-suggested progressive disclosure
- **1I** — AI-generated multi-level views
- **2C** — Bidirectional code↔node navigation
- **2E** — GitHub/GitLab integration
- **2F** — Hover code preview
- **2G** — Coverage view (which nodes lack bindings)
- **2H** — Multi-repo support
- **4C** — Diagram analytics
- **4F** — Public diagram gallery / community

### Critical Insight from the Triage

**Ahmed has effectively redefined the V1 premium tier away from his earlier intuition.**

He originally said premium = "AI + Code Connect." But the triage shows:
- **AI features → all pushed to V2.** None made V1.
- **Code Connect features → almost all pushed to Maybe or Skip.** None made V1.
- **V1 premium is actually: collaboration/persistence basics (save, share, permissions, export) + light branding.**

This is a much more pragmatic v1: **premium ≈ "your work persists, you can share it, and it looks like yours."** This is the proven indie SaaS pattern (Excalidraw+, tldraw Pro, Whimsical, Notion). It works. It's also far less risky to build than AI/Code Connect.

**Implication:** The "AI + Code Connect" pitch was the *future* premium. The v1 premium is **persistence + sharing + branding** — which is faster to build, more reliable to charge for, and won't get eaten by AI agents in 18 months.

**Hidden risk surfaced:** The Maybe pile contains the differentiation features (Code Connect 2A/2B/2D, AI drift 1H, version history 3F, self-host 4B). If Ahmed never moves any of these to V1 or V2, the product becomes "another Whimsical/Excalidraw with collapse" — defensibility weakens. Recommendation: at least one Maybe must graduate to V1 to maintain the differentiation thesis.

### Post-Triage Promotion (Ahmed's revision)

Ahmed reversed the drift toward "thin V1" by promoting four differentiation features:
- **1A** Auto-generate diagram from code → V1
- **1B** Auto-generate diagram from prose → V1
- **1D** AI-assisted diagram improvement → V1
- **2A** Bind node to single code file → V1

This restored the AI + Code Connect thesis to the launch product.

### Final V1 Wave Sequencing (3-Wave Launch Plan)

To manage build complexity against side-project time constraints, V1 is staged in three waves:

**Wave 1 — Free Core + Persistence Premium**
*Goal: validate the progressive-disclosure thesis with real users; establish paying-user behavior on low-risk features.*
- Free tier: Markdown + Mermaid editor, progressive disclosure (collapse/expand subgraphs), the existing prototype polished and shippable
- Premium: 3A Save to account, 3B Share via link, 3H Permissions, 3I Export with collapse states, 4A Custom themes/branding
- **Build risk:** Low. No LLM cost. No external integrations. Pure UX work.
- **Validates:** Will users adopt progressive disclosure at all? Will any subset pay for persistence/sharing?

**Wave 2 — AI Generation Premium**
*Goal: layer in AI features once Wave 1 has paying users to amortize cost and signal that AI is what they want.*
- Premium additions: 1A Code→diagram, 1B Prose→diagram, 1D AI diagram improvement
- **Build risk:** Medium. LLM integration, prompt engineering, cost/credits system, malformed-output handling.
- **Validates:** Are users willing to pay more for AI generation? Does AI accuracy clear the bar where it's actually useful?

**Wave 3 — Code Connect Premium**
*Goal: ship the deepest differentiator once AI usage patterns reveal what code-binding UX actually needs to look like.*
- Premium addition: 2A Bind node to single code file (and likely 2B range bindings as a fast follow)
- **Build risk:** Medium-high. File-tree UI, persistent bindings, navigation surfaces, integration with chosen storage model.
- **Validates:** Is Code Connect the moat we believe it to be — or are users satisfied with AI-only premium?

### Strategic Logic of Wave Sequencing

This sequencing has three smart properties:
1. **Each wave validates the next.** Wave 1 proves users care about diagrams in MD at all. Wave 2 proves they'll pay for AI. Wave 3 proves they want code coupling.
2. **Each wave can stand alone as a "release."** If life slows down between waves, the product is still shippable and useful at each stop.
3. **Risk increases gradually with revenue.** Wave 1 is cheap to build but pays nothing fancy. Wave 2 introduces LLM costs but Wave 1's revenue is already cushioning them. Wave 3 takes the deepest engineering bet but only when the audience is proven.

**Implicit decision:** The 3-wave plan effectively makes Wave 1 the *real* MVP. Waves 2 and 3 are V1.5 and V2.0 disguised as V1 phases. This is fine — the labeling matters less than the sequencing logic.

---

## SCAMPER on Wave 1 — Findings

Each lens generated 3-5 prompts; Ahmed selected what resonated. Net effect: Wave 1 expanded from a thin MVP to a serious indie product with multiple defensible features, while still cutting auth from the free tier.

### Substitute
- **S1 ✅** — Side-by-side UI confirmed (was already the prototype intent)
- **S3 ⏸** — Renderer choice (SVG vs Canvas/WebGL) deferred to architecture phase
- **S2, S4** — Dismissed as out-of-scope for v1

### Combine
- **C1 ✅** — **3-pane workspace**: MD source + rendered MD preview + interactive diagram canvas. *Significantly upgraded Wave 1 positioning — competing with HackMD/Notion-for-engineers, not mermaid.live.*
- **C3 ⚪** — Annotations on nodes → consider pile (revisit at synthesis)
- **C2** — Static code snippet binding deferred (would cascade into Wave 3 territory)
- **C4** — Public-by-default URLs killed

### Adapt
- **A1 ✅** — **Command palette (Cmd+K)** for power-user node search/navigation — V1
- **A2 ✅** — **Minimap** with viewport indicator for large-diagram navigation — V1
- **A5 ⚪** — Diagram diff view → Maybe pile
- **A3, A4** — Killed

### Modify
- **M1 ✅** — **Progressive disclosure becomes a family**: collapse/expand + focus mode + path mode + depth slider. *This is the moat upgrade — each mode hits a distinct pain from Five Whys L2 (path tracing, mental model construction, big-picture view), and the family is much harder to clone than a single feature.*
- **M3 ✅** — **State-baked shareable URLs**: collapse state, focused node, zoom level all encoded in URL. Free distribution channel.
- **M2, M4, M5** — Killed (preserve editor primacy and side-by-side layout)

### Put to Other Uses
- **P1–P5** — All filed as "nice but later." Multi-use-case positioning is a post-launch lever, not a Wave 1 concern.

### Eliminate
- **E3 ✂️** — **No-account free tier**. localStorage + URL state for free; auth only for premium. Strategic cut: zero friction for try-before-buy, deferred auth/email/password engineering until premium tier ships.
- **E1, E2, E4, E5, E6** — All kept. Editor stays, themes stay in v1 premium, syntax editing stays, export with collapse stays, premium ships in v1.

### Reverse / Rearrange
- **R1–R5** — All dismissed. Plan is internally consistent; reverses don't add value at this stage.

### Net Effect on Wave 1 Scope

**Free tier features added or confirmed:**
1. 3-pane workspace (MD source + MD preview + diagram canvas)
2. Mermaid syntax editor (full editing)
3. Progressive disclosure *family* — 4 modes (collapse, focus, path, depth slider)
4. Command palette (Cmd+K)
5. Minimap
6. State-baked shareable URLs
7. No-account, localStorage + URL state
8. Annotations *(C3, consider pile)*

**Premium tier features confirmed:**
1. Save to account (auth + cloud storage)
2. Share with permissions (view/edit roles)
3. Export to PNG/SVG/PDF with collapse states preserved
4. Custom themes / branding

### Honest Scope Flag

Wave 1 now contains ~12-15 distinct features. Realistic side-project build estimate: **3-6 months of consistent weekend work**. This is large but coherent — every feature traces back to the validated root cause from Five Whys. The scope risk will be addressed explicitly in Reverse Brainstorming next.

---

## Reverse Brainstorming — Findings

Six failure-mode categories were presented (~18 specific scenarios across adoption, build, conversion, competition, AI displacement, UX). Ahmed's reaction:

- **F2b (URL length limits):** Solved at the architecture level — **backend-stored diagram state** instead of URL-only encoding. State-baked URLs become a *short-link to backend record*, not a literal-encoding-in-URL. Removes the failure mode entirely for premium users; free users get reasonable-size URL encoding only.
- **All other failure modes:** Ahmed dismissed as not concerning.

### Facilitator's Honest Caveat

Dismissing 17/18 surfaced risks is itself a meaningful signal. It can mean one of three things:
1. Ahmed has high genuine confidence backed by deep prior research (possible — he's said as much)
2. Ahmed is in execution mindset and ready to stop second-guessing
3. The session has reached saturation; remaining risks aren't going to be acknowledged through more facilitation

This is documented as a flag, not a verdict. The dismissed risks remain *real* — particularly:
- **F1a/F1b (adoption / retention)** — the bear case from Five Whys L5 has not been disproven, only deferred to "we'll see at launch"
- **F2c (burnout on long side-project timelines)** — universal indie risk, not specific to this product
- **F4a/F4b (Mermaid Chart / Mermaid spec response)** — incumbents reacting after launch is the most predictable competitive scenario in dev tools
- **F5a (AI eating the category)** — already named by Ahmed himself in Five Whys L5 bear case (e), now apparently dismissed

Ahmed's call to dismiss is logged. These risks will be reflected in the final synthesis as "explicit risks accepted" rather than "risks designed against."

### Architecture Decision (locked)

**Backend-stored diagram state from day one — for everyone, not just premium users.**

Reversed the earlier "URL state for free, backend for premium" split. Instead:
- All diagrams (free or premium) saved as anonymous records in backend storage at creation
- Sharing produces a short URL pointing at a backend record, not an encoded URL
- Free users get a session token / anonymous ID; their diagrams persist tied to that ID in localStorage
- When auth ships in Wave 1 premium, anonymous diagrams associate with the user account on signup ("we found 3 diagrams from this browser — claim them?")

**Why this is better than state-baked URLs:**
- Solves F2b (URL length limits) completely
- Removes the URL-encoding engineering entirely
- Makes the auth migration painless — no data format change between free and premium
- Sharing becomes faster and cleaner (short URLs from day one)
- Recipient can interact with shared diagrams without parsing complex URL state
- Costs: requires a backend from day one — but Wave 1 premium needs one anyway, so no marginal cost

**Implication for Wave 1 build:** Backend service exists from the start. Free tier writes anonymous records; premium tier upgrades them to user-bound records. This is actually *simpler* engineering than the dual-path (URL-for-free, backend-for-premium) plan it replaces.

### Designated Risk to Design Against: F1a (Adoption Fails Because Pain Is Intermittent)

After review, Ahmed designated **F1a** as the only failure mode worth explicitly designing against. F1a is the existential risk: users try the product, find it neat, but never come back because reading-huge-diagrams isn't a frequent enough activity to retain them. This is the same risk surfaced as the L5 bear case (a) and (b) in Five Whys.

**Why this is the right pick:** F1a is the *only* failure that can't be fixed after launch. If users don't return, you have no signal to act on, no audience to monetize, and no path to Wave 2/3. Every other risk (Mermaid Chart copying, AI displacement, build delays) only matters *if* Wave 1 retains users in the first place.

**Three concrete design choices to mitigate F1a (to be incorporated into Wave 1 build):**

1. **Build the diagram-creation pull, not just the diagram-reading push.**
   - The 3-pane workspace (C1) and Mermaid syntax editor (E1 kept) already point in this direction.
   - Make authoring genuinely *better* than mermaid.live, not just "as good." Specifically: the progressive-disclosure family (M1) should help authors *organize* their own diagrams visually as they build — collapse subgraphs while editing, focus mode while debugging layout, etc. Authoring becomes a daily activity, not a monthly one.
   - **Test:** if a user creates a diagram in your tool, do they come back to edit/extend it? Returning authors are the leading indicator of retention.

2. **Make sharing the primary success metric, not signups.**
   - State-baked URLs (M3) + backend-stored diagrams = every shared link is both a distribution event AND a retention proxy.
   - **Instrument explicitly:**
     - How many diagrams shared per active user?
     - Of shared diagrams, how many are opened by the recipient?
     - Of recipients, how many become creators?
   - These metrics tell you within 4-8 weeks of launch whether F1a is happening or whether the loop is firing.

3. **Set a 6-week post-launch decision gate.**
   - Define *now*, before building, what "Wave 1 worked" means quantitatively. Suggested thresholds (Ahmed to confirm or revise):
     - **>= 200 weekly active users 6 weeks after launch** → F1a not happening, proceed to Wave 2
     - **50-200 WAU** → marginal; investigate before committing to Wave 2
     - **< 50 WAU** → F1a confirmed; pivot or sunset rather than building Wave 2 on a weak base
   - Without a pre-committed gate, the indie-founder default is to keep building waves regardless of signal — which is how 18 months disappear.

**Risks accepted (not designed against):**
- F1b, F1c (specific adoption-loop variants beyond F1a)
- F2a, F2c (build-time risks; managed by side-project pace, not formal mitigation)
- F3a, F3b (premium conversion risks; addressed naturally by 3-wave staging)
- F3c (OSS clone risk; mitigated by progressive-disclosure family + first-mover)
- F4a, F4b (Mermaid Chart / Mermaid spec response; accepted as out-of-control)
- F5a, F5b (AI displacement; partially mitigated by Wave 2 AI features, but tail risk accepted)
- F6a, F6b (UX failure on real diagrams; addressed by testing on real diagrams during build)

**Decision gate thresholds confirmed by Ahmed:**
- **≥ 200 WAU at 6 weeks post-launch** → green: proceed to Wave 2
- **50-200 WAU** → yellow: investigate retention before committing to Wave 2
- **< 50 WAU** → red: F1a confirmed, pivot or sunset

---

# 🎯 FINAL SYNTHESIS — MVP Scope Document

## Product Thesis (one paragraph)

A web-based, side-by-side technical document workspace where engineers and architects can author, read, and share Markdown documents containing Mermaid diagrams — with **progressive disclosure** as the core differentiator. The free tier is genuinely useful: a 3-pane editor (markdown source + rendered preview + interactive diagram canvas) with a *family* of disclosure modes (collapse/expand, focus, path-tracing, depth slider) plus power-user navigation (command palette, minimap) and frictionless backend-stored sharing via short URLs. The premium tier adds account-bound persistence, share permissions, export-with-collapse-states, and custom themes — followed in Wave 2 by AI generation features (code→diagram, prose→diagram, AI-assisted improvement) and in Wave 3 by Code Connect (binding diagram nodes to code files). Indie-scale, side-project pace, expansion-aware architecture, optimized for adoption metrics over revenue at launch.

## Wave 1 Scope (the actual MVP)

### Free Tier Features
1. **3-pane workspace** — Markdown source pane + rendered Markdown preview pane + interactive Mermaid diagram canvas, all live-syncing
2. **Mermaid syntax editor** — full text editing of `.mmd` syntax with syntax highlighting and validation
3. **Progressive disclosure family** — four interaction modes:
   - Collapse/expand subgraphs (the original prototype, polished)
   - Focus mode (click a node, fade everything not connected)
   - Path mode (click two nodes, highlight only the path between)
   - Depth slider (auto-collapse everything below depth N)
4. **Command palette (Cmd+K)** — fuzzy search any node, jump to it, expand/collapse via keyboard
5. **Minimap** — viewport indicator overlay for navigating large diagrams
6. **Backend-stored diagrams + short share URLs** — anonymous records from day one; sharing produces clean `app.com/d/abc123` URLs
7. **No-account access** — try the full free tier with zero signup friction; anonymous session token associates work to browser

### Premium Tier Features
1. **Save to account** — auth ships here; anonymous diagrams claimable on signup
2. **Share with permissions** — view-only vs. editable roles
3. **Export to PNG / SVG / PDF** — with current collapse states preserved
4. **Custom themes / branding** — color palettes, logos, branded share pages

### Consider Pile (decide before/during build)
- **Annotations on nodes** (C3) — inline notes pinned to nodes, collapsing with their subgraph
- **Diagram diff view** (A5) — side-by-side comparison of diagram versions

## Wave 2 Scope (ships after Wave 1 validates)

### Premium additions
- **AI: Code → Diagram** — paste code, get Mermaid
- **AI: Prose → Diagram** — paste spec/PRD, get Mermaid
- **AI: Diagram improvement** — "make this clearer," "simplify," "add missing nodes"

### Build risk: Medium
LLM integration, prompt engineering, cost-per-call management, credits/limits system, malformed-output handling.

## Wave 3 Scope (ships after Wave 2 validates)

### Premium addition
- **Code Connect** — bind a diagram node to a single code file (2A); range bindings (2B) as fast follow

### Build risk: Medium-high
File-tree UI, file picker, persistent bindings, navigation from node↔file.

## Architecture Decisions (locked)

1. **Backend from day one.** All diagrams (free + premium) stored as backend records. Free users get anonymous records via session token; premium users own them on signup.
2. **Side-by-side 3-pane UI.** Markdown source / rendered MD / diagram canvas.
3. **Renderer choice deferred** to architecture phase — SVG vs. Canvas vs. WebGL based on perf testing on real-world diagrams.
4. **Mermaid is the only diagram format for v1** — D2, PlantUML, BPMN are post-launch expansion.
5. **Markdown is first-class.** Editor stays. View-only mode rejected.
6. **Click is the primary disclosure trigger** (with keyboard shortcuts via command palette).
7. **State persistence is backend, not URL-encoded.** Eliminates URL length issues entirely.

## Success Metrics & Decision Gate

**Primary metric:** Weekly Active Users (WAU) measured at week 6 post-launch.

**Secondary metrics (instrument from day one):**
- Diagrams created per active user
- Diagrams shared per active user
- Recipient opens of shared diagrams
- Recipient → creator conversion rate
- Returning author rate (created in week N, edited or created in week N+1)

**Decision gate (week 6 post-launch):**
- **≥ 200 WAU** → 🟢 Wave 1 worked; begin Wave 2 build
- **50–200 WAU** → 🟡 Marginal; investigate retention loop before committing further build time
- **< 50 WAU** → 🔴 F1a confirmed; pivot to a different shape or sunset

## Risks Designed Against (in Wave 1)

| Risk | Mitigation built into Wave 1 |
|------|------------------------------|
| **F1a — Reading is intermittent** | Authoring made first-class (3-pane workspace, disclosure-while-editing) → daily use, not monthly |
| **F1a — Distribution loop fails** | Backend-stored diagrams + short share URLs from day one; recipient opens are instrumented |
| **F1a — No retention signal** | Pre-committed 6-week decision gate with quantitative thresholds |
| **F2b — URL length limits** | Backend storage from day one; URLs are short pointers |
| **F3c — OSS clone of progressive disclosure** | Disclosure *family* (4 modes) makes weekend clones obviously inferior |

## Risks Explicitly Accepted (not designed against)

- **Adoption loop variants beyond F1a** — accepted; revisit at decision gate
- **Build delays / burnout (F2a, F2c)** — accepted as side-project reality; managed by pace not formal mitigation
- **Premium conversion failure (F3a, F3b)** — accepted; 3-wave staging means low irreversible investment before signal
- **Mermaid Chart / Mermaid spec adds collapse (F4a, F4b)** — accepted as out-of-control; rely on first-mover + disclosure family + Wave 2/3 differentiation
- **AI agents subsume diagram comprehension (F5a)** — partially mitigated by Wave 2 AI features, residual tail risk accepted
- **LLM cost burn in Wave 2 (F5b)** — addressed by credits/limits system in Wave 2 design
- **UX breaks on complex real-world diagrams (F6a, F6b)** — addressed by ongoing testing on real diagrams during build, not formal mitigation

## Recommended Next Actions (concrete)

1. **Architecture spike (1–2 weekends).** Decide renderer (SVG vs. Canvas vs. WebGL) by performance-testing the existing prototype against real-world Mermaid diagrams of 200+, 500+, 1000+ nodes. The renderer decision blocks the disclosure family build.
2. **Backend skeleton (1 weekend).** Minimal stack: anonymous diagram records, short URL generator, session token, share endpoint. No auth yet.
3. **Disclosure family build (4–6 weekends).** In order: collapse/expand (already prototyped, productionize) → depth slider (cheapest) → focus mode → path mode (most complex).
4. **3-pane workspace + Mermaid editor (2–3 weekends).**
5. **Command palette + minimap (2 weekends).**
6. **Instrument analytics from day one** — WAU, creates, shares, recipient opens, returning authors. Without these, the decision gate is meaningless.
7. **Set ship-by date now.** Pick a calendar date for Wave 1 launch. Side projects without deadlines drift indefinitely.
8. **Pre-launch beta.** Ship to 5–10 engineering friends/colleagues for 2 weeks of real-diagram usage *before* public launch. Catches F6 risks cheaply.
9. **Public launch.** HN, Reddit r/programming, dev.to, Twitter/X, Mermaid community channels.
10. **Watch the decision gate at week 6.** Don't start Wave 2 until the metric confirms green or yellow.

## Open Questions (carry forward)

1. **Renderer technology** — defer to architecture spike
2. **Pricing for Wave 1 premium** — likely $5-15/mo individual, but defer until premium scope is locked
3. **Annotations (C3) and diff view (A5)** — keep in Consider pile; revisit during build
4. **Persona sharpening** — engineer-first is locked, but how strongly to also signal to architects/leads/new hires? Defer to landing-page copy phase

---


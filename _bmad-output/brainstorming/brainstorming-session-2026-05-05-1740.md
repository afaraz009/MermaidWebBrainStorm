---
stepsCompleted: [1, 2]
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


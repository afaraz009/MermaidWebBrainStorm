---
session: Renderer-research
date: 2026-05-08
status: decisions-pending-spike-validation
relatedDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/product-brief-MermaidWeb.md
resolves:
  - PRD Open Decision #2 (Renderer technology) — pending spike confirmation
---

# Architecture Decisions — Rendering Pipeline

## Purpose

Captures the architecture decisions made during the renderer-research session for MermaidWeb. Resolves (pending spike validation) PRD Open Decision #2: *"Renderer technology (SVG / Canvas / WebGL) — decided by a 1–2-weekend architecture spike."*

## Context Summary

MermaidWeb is a Markdown-native diagram-comprehension web app whose core differentiator is a "progressive disclosure family" — collapse, focus, path-tracing, and depth slider — applied to large Mermaid flowcharts. Performance budget reduced during this session from the PRD's 200/500/1000-node tiers to a focused **200-node target**: ≤16ms p50, ≤33ms p95 frame time on disclosure interactions.

Build context: solo founder, side-project pace, 3–6 months of weekends, with coding-agent assistance for implementation.

## Decisions

### Decision 1 — Rendering technology family: SVG

**Decision:** SVG, not Canvas or WebGL.

**Why:**
- 200-node target makes SVG sufficient; Canvas/WebGL are over-spec'd for this floor.
- SVG text labels are real DOM, making Cmd+K fuzzy search and SVG/PNG/PDF export straightforward (both are first-class product features).
- Disclosure interactions (focus opacity, path highlighting, collapse) reduce to CSS class and attribute mutations on SVG — cheap and well-trodden.
- WebGL text rendering and Canvas re-rendering both add disproportionate cost relative to the value at this scale.

**Ruled out:**
- Canvas (Cytoscape.js, vis-network) — requires AST adapter, loses DOM-text affordances, no significant performance benefit at 200 nodes.
- WebGL (Sigma.js, Reagraph) — overkill, painful text handling, no hierarchical flowchart layouts, requires shipping dagre on top anyway.
- Force-directed graph libraries — wrong layout style for flowcharts.

### Decision 2 — Stack composition: parser-only + dagre + d3-shape

**Decision:** Use Mermaid's parser only. Build the rendering pipeline from primitives.

**Stack:**

| Library | Role |
|---|---|
| `mermaid` | **Parser only.** Used to parse Mermaid syntax into AST. Never used for rendering in the native pipeline. |
| `dagre` (`@dagrejs/dagre`) | Graph layout engine. The same library Mermaid uses internally — geometric equivalence to Mermaid's output. |
| `d3-shape` (`curveBasis`) | Edge curve generation. The same function Mermaid uses for edge paths. |
| `d3-path` | Companion to d3-shape for SVG path construction. |
| `elkjs` | Alternative layout engine for an "Adaptive" mode. Lazy-loaded; does not affect initial bundle. |

**Why over Architecture A (Mermaid renderer + svg-pan-zoom + CSS interaction layer):**
- **Visual ceiling.** Renderer ownership enables animated disclosure transitions (collapse easing, focus fades, path glows, depth-band crossfades) — which Architecture A constrains because mutating someone else's SVG limits animation lifecycle control.
- **Stable dependency surface.** Mermaid parser AST is more stable than its emitted SVG. Dagre and d3-shape change slowly. Architecture A couples to Mermaid's emitted DOM (class names, group nesting) which can shift on minor-version bumps.
- **Bundle headroom.** Drops ~800 KB gzipped vs. shipping full Mermaid; comfortably under the PRD's 350 KB initial bundle budget.
- **Geometric equivalence.** Same dagre + same d3-shape `curveBasis` = visually-indistinguishable layouts vs. Mermaid for users coming from elsewhere. Not a different renderer — the same renderer, owned.
- **Layout pluggability.** Swapping dagre for elkjs ("Adaptive" mode) becomes a one-function swap; both produce `{nodes: [{x,y,w,h}], edges: [{points}]}`.
- **Custom node affordances.** Wave 1.3 Code Connect (binding nodes to code files) needs custom visual states that are native in an owned renderer.

**Trade-off accepted:**
- Upfront pipeline construction cost (~1.5–2 weekends without coding agents; compressed with agent assistance).
- Long-tail flowchart syntax coverage (linkStyle, classDef, edge variants) becomes the maintainer's responsibility, implemented as primitive operations against AST flags.
- Mermaid's ongoing renderer improvements no longer flow in for free.

### Decision 3 — Reverse-engineering Mermaid's renderer: rejected

**Decision:** Do not reverse-engineer Mermaid's renderer for any diagram type.

**Why:**
- Lifts thousands of lines of edge-case-handling code without the context for *why* each piece exists.
- Coding agents are weak at deriving specs from existing code; high bug surface.
- Inherits Mermaid's structural choices, defeating the renderer-ownership advantage.
- Defeats the upstream-improvement signal — porting future Mermaid improvements becomes manual work without context.

**Operating principle:** *If you're not changing the rendering behavior, use Mermaid's renderer. If you are, build your own from primitives — never by reverse-engineering Mermaid's.*

### Decision 4 — Multi-diagram-type strategy: Position 3 (Hybrid)

**Decision:** Native pipeline for flowcharts. Mermaid as viewer-only fallback for non-flowchart types. Disclosure family is flowchart-first by design.

**Product framing (to be added to PRD):**
> MermaidWeb's disclosure family applies to flowchart-style diagrams, where comprehension pain is sharpest. Other Mermaid types (sequence, class, gantt, ER, state, etc.) render natively and support pan/zoom; the disclosure family is flowchart-first by design. Additional types graduate into full disclosure support based on post-launch demand.

**Why:**
- The comprehension thesis is fundamentally about large architecture/service diagrams — overwhelmingly flowchart-shaped.
- Sequence, gantt, class, ER do not have the same comprehension pain at typical sizes; the disclosure family is a flowchart-shaped solution.
- Avoids the "two leaky renderers" trap — the boundary is clean because the *interaction model itself* is scoped to the renderer being used, not promised uniformly across both.
- Multi-type support is genuinely required: the product is a *document* comprehension tool, and a document containing a sequence diagram alongside flowcharts must not show a hard error.

**Rejected alternatives:**
- *Flowchart-only with hard error on other types* — too user-hostile for a document-comprehension tool.
- *Full custom pipeline for every diagram type at launch* — multi-weekend cost per type, blocks the wedge.
- *Apply disclosure family across both renderers via a unified interaction abstraction* — leaky abstraction, two surfaces to maintain, leaks the rendering boundary into the interaction layer.

### Decision 5 — Drag-to-reposition: pin-and-recalculate (Strategy 1)

**Decision:** When a user drags a node, only that node's position updates. Edges connected to the dragged node re-route locally; the rest of the layout is untouched.

**Why:**
- Re-running full dagre layout on every drag tick produces visual jumps and exceeds the 16ms frame budget.
- Pin-and-recalculate matches user expectation (the node went where I dropped it; nothing else moved).
- Validates the partial-update SVG mutation pattern that disclosure-family animations will rely on.

**Note from investigation:** The official Mermaid OSS codebase implements no drag at all — it is a static renderer. Drag interaction patterns must be built from primitives; nothing to crib from upstream. Strengthens the case for an owned renderer (Decision 2) — adding drag to Mermaid's emitted SVG would already mean mutating someone else's DOM.

## High-Level Architecture

```
Markdown source (user document)
    │
    ▼
Markdown Parser (remark)
    │
    ▼
Diagram Block Inspector
    (detects diagram type from first non-empty line)
    │
    ▼
Renderer Router
    ├── flowchart / graph → Native Pipeline
    └── all other types  → Mermaid Viewer (viewer-only)
                                │
Native Pipeline (flowchart):    │
  Parser Adapter (mermaid.parse → AST)
    │
  AST Normalizer → Internal IR
    │
  Layout Engine (dagre, optional elkjs)
    │
  Render Model Builder (computes SVG coords, curveBasis curves)
    │
  SVG Renderer (data-* hooks, partial-update support)
    │
  Interaction Layer (full disclosure family)
    ├── Pan/Zoom (svg-pan-zoom)
    ├── Collapse Engine
    ├── Focus Engine
    ├── Path Engine (BFS over IR adjacency map)
    ├── Depth Engine
    ├── Command Palette (fuzzy search over IR labels)
    ├── Minimap (shadow render at low scale)
    └── Drag (Strategy 1: pin-and-recalculate)

Mermaid Viewer (non-flowchart):
  Mermaid renders natively (mermaid.render)
    │
  Pan/Zoom only — no disclosure family
```

**Key architectural property:** the Renderer Router is the single dispatch point. As diagram types graduate from viewer-only to native rendering (sequence diagrams the most likely first candidate post-launch), they move via this switch — not via a refactor.

## Validation Plan

A 2–3-hour timeboxed spike validates the load-bearing assumptions before further build:

**Spike question:** Can the parser-adapter → AST-normalizer → dagre → d3-shape → SVG pipeline produce visually-acceptable output on a representative Mermaid flowchart with nested subgraphs, *and* support smooth real-time drag with edge updates?

**Deliverables:**
1. Mermaid reference render of a fixture (visual target).
2. Custom static render of the same fixture.
3. Custom interactive render with drag-to-reposition.
4. `SPIKE_NOTES.md` with brutally honest assessment.

**Fixture:** a graph with two-level nested subgraphs, multiple node shapes, a dotted labeled edge, and edges crossing subgraph boundaries — covers ~80% of real architecture-diagram patterns.

**Pass criteria:**
- Static custom render is recognizably the same diagram as Mermaid's reference.
- Drag is smooth on the dragged node; edges connected to it update in real-time.
- Mermaid parser API exposes the AST cleanly enough that nested subgraphs come through without reconstruction hacks.

**Decision tree from spike outcome:**

| Spike result | Action |
|---|---|
| Pass on all three | Proceed with Architecture B as designed. |
| Static passes, drag judders | Architecture B viable; revisit animation ambition for disclosure family. |
| Mermaid parser hostile (regex workarounds needed) | Reconsider — parser dependency is load-bearing. |
| Static render structurally wrong | Reconsider Architecture A under Position 3 framing. |

## Open Sub-Decisions (deferred)

- **Front-end framework, build tooling, hosting** — out of scope for this session, deferred to architecture phase per PRD Open Decision #10.
- **Layout engine default — dagre vs. elkjs as primary** — defaults to dagre (geometric equivalence to Mermaid); elkjs is the lazy-loaded "Adaptive" alternative. Final default confirmed post-spike.
- **Sequence-diagram graduation timing** — held until post-launch usage data identifies it as load-bearing.
- **Re-running dagre on drag-end** — out of scope for spike; production may revisit if pinned-only edges look pathological at extreme positions.

## Non-Decisions / Items Explicitly Held

- This session did not change any decision in the PRD other than (pending spike) Open Decision #2.
- Performance budgets above 200 nodes (the 500/1000-node tiers from the PRD) are not eliminated — they are de-prioritized for the spike phase. The architecture above remains compatible with raising the ceiling later.
- The disclosure family's *visual ambition* (snap states vs. animated transitions) is held — the architecture supports either, and the spike's drag result is the leading indicator for which is realistic.

## References

- PRD Open Decision #2 (Renderer technology)
- PRD §Performance (NFR-P1 through NFR-P8)
- PRD §Web Application Specific Requirements
- Library survey (this session, in-conversation): Mermaid+svg-pan-zoom, Cytoscape.js, D3+dagre-d3, React Flow, Sigma.js, vis-network, G6, Reagraph
- Mermaid OSS codebase investigation (this session): drag is not implemented in the upstream codebase

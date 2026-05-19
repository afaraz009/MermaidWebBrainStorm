# Spike 4 — inherits Spike 3 brief verbatim

> **For Spike 4 readers:** the body below is the original Spike 3 brief — every requirement it describes is implemented in `spike4/` (copied from `spike3/`) and is in-scope to preserve. The *new* Spike 4 brief — pan / mouse-zoom / right-click context menus / **full Mermaid flowchart shape library** (all 15 vertex shapes, end-to-end through parser, IR, renderer, and edge clipper) — is documented in `spike4_feature_Implementation.md` at the repo root and summarised in `SPIKE4_NOTES.md` §"Shape library". The shape-gallery fixture (`fixture_shapes.mmd`) demonstrates every supported shape.

---

# Spike 3 — Subgraph collapse / expand

## What's already been validated

- **Spike 1** (`spike/`) validated the parser-only + dagre + d3-shape rendering pipeline against a Mermaid reference render. Static rendering works; drag-to-reposition works with partial-update SVG mutation.
- **Spike 2** (`spike2/`) validated grid-A\* as a viable post-drop edge router for the 200-node target. Face-centered docking + outward normals + collinear-collapse only (no curveBasis). Read `spike2/SPIKE2_NOTES.md` for the full picture.

Spike 3 builds on top of Spike 2's pipeline — the A\* code, parser, layout, drag handler, and renderer are all carried over largely unchanged. The new question is about **interactive disclosure**, not routing.

## What this spike validates

Whether **subgraph collapse / expand** — clicking a subgraph header to collapse it into a single surrogate node, and clicking that surrogate to expand it back — can be added to the renderer pipeline as a pure transform over the IR, *without* re-architecting the renderer or breaking the A\* re-routing pipeline.

Specifically:

1. The source IR (`ir`) stays canonical and stores per-subgraph `collapsed: boolean` flags plus pinned node positions.
2. A derived **effective IR** (`currentEff`) is computed by `deriveEffectiveIR(ir)` on every collapse/expand. The effective IR hides leaf nodes inside collapsed subgraphs and replaces each outermost-collapsed subgraph with a single surrogate node.
3. **Outermost-collapsed wins.** If both an outer and an inner subgraph are collapsed, the outer one's surrogate hides everything beneath it — the inner surrogate doesn't appear.
4. Edges crossing the boundary of a collapsed subgraph are **remapped** to terminate on the surrogate. Interior edges (both endpoints inside the collapsed subgraph) are dropped. Duplicates after remapping are deduped.
5. Renderer, drag handler, grid overlay, and A\* routing all run against the effective IR. They don't need to know subgraphs can collapse.
6. Click-to-collapse uses event delegation on the SVG (anywhere inside a `[data-subgraph-id]` container). Click-to-expand on a surrogate distinguishes click from drag via a 4px threshold so `drag.ts` can still drag surrogate nodes.
7. **Collapse state survives Reset Layout.** Reset is about layout, not disclosure.

## What you must produce

A `spike3/` directory parallel to `spike2/`, copied as a starting scaffold. Same two-pane comparison (Mermaid reference left, our renderer right) with the same fixture picker.

## You may copy from Spike 2

Almost everything. The A\* code, parser adapter, IR types, dagre layout adapter, SVG renderer, drag handler, A\* settings, and grid overlay are carried over with minimal changes. The 200-node fixture and small fixture are copied verbatim.

What you will need to add or modify:
- **New:** `src/effective-ir.ts` — the IR-to-effective-IR transform plus surrogate id helpers.
- **New:** `src/collapse.ts` — delegated click handlers for collapse and click-vs-drag-discriminated expand.
- **Modified:** `src/types.ts` — add `collapsed?: boolean` to `IRSubgraph`.
- **Modified:** `src/entry.ts` — own the `ir` / `currentEff` split, wire `rerenderWithCollapse`, "Collapse All" / "Expand All" buttons, and sync effective-IR positions back to source IR after layout.
- **Modified:** `src/renderer.ts` — render surrogate nodes with a "+N" badge for descendant count.
- **Modified:** `our-renderer.html` — Collapse All / Expand All buttons; updated panel labels.

## Hard constraints

- **No new heavy dependencies.** Same set as Spike 2: `mermaid`, `@dagrejs/dagre`, `d3-shape`, `vite`, `typescript`.
- **The renderer must not know about collapse state.** Collapse is a transform over IR; the renderer renders whatever IR it's handed. The only renderer-side concession is recognizing surrogate node ids for the descendant-count badge.
- **A\* routing must keep working** in both directions: collapse/expand re-derives the effective IR, dagre re-layouts it, and (if A\* is currently toggled on) A\* re-routes every edge against the new layout. Without this, expand/collapse would always show dagre output regardless of the toggle state.
- **No framework.** Plain TypeScript, plain DOM. Same as Spike 1/2.
- **2–3 hour timebox.**

## What you decide

- Surrogate node shape and label format. (Spike 3 ships rectangles with the subgraph label plus a "+N" badge for the count of hidden descendants.)
- Click-vs-drag threshold for the expand path. (Spike 3 uses 4px.)
- Whether to support nested collapse. (Spike 3 supports it via "outermost wins" semantics, but you can simplify if it eats your timebox.)
- Whether collapse state survives "Reset Layout." (Spike 3 says yes — reset is about layout, not disclosure.)

## Deliverables

```
spike3/
  package.json
  tsconfig.json
  vite.config.ts
  index.html
  fixture.mmd
  fixture200.mmd
  mermaid-reference.html
  our-renderer.html
  src/
    types.ts             # + collapsed flag on IRSubgraph
    parser-adapter.ts    # from spike2
    layout.ts            # from spike2
    border.ts            # from spike2
    astar.ts             # from spike2
    astarSettings.ts     # from spike2
    routing.ts           # from spike2
    gridOverlay.ts       # from spike2
    renderer.ts          # + surrogate badge
    drag.ts              # from spike2 (works on surrogates too)
    effective-ir.ts      # NEW
    collapse.ts          # NEW
    entry.ts             # + collapse/expand wiring
  SPIKE3_NOTES.md        # findings, under 400 words
```

## SPIKE3_NOTES.md must cover

1. **The effective-IR transform** — outermost-wins semantics, edge remapping + dedup, why surrogates are leaf-level nodes (not subgraph containers).
2. **Interaction model** — how collapse (delegated click on subgraph) and expand (click-vs-drag-discriminated mousedown/mouseup on surrogate) coexist with `drag.ts`.
3. **Interaction with A\* re-routing** — the re-derivation flow on every collapse/expand, and the toggle-on / toggle-off symmetry.
4. **Failure modes / edge cases** — interior edges, duplicate edges after remap, nested collapse, dragging a surrogate, A\* state across collapse cycles.
5. **What surprised you.**
6. **Production readiness assessment** — is this approach (IR transform + delegated events) the right one for the disclosure family in the PRD, or does it hit a ceiling we should know about?

## Definition of done

1. `cd spike3 && npm install && npm run dev` starts the dev server.
2. Open `http://localhost:<port>/index.html` — two panes visible.
3. Switch the fixture picker between `fixture.mmd` and `fixture200.mmd`; both panes update.
4. On the right pane:
   - Initial layout matches Spike 2 (same dagre output).
   - Click a subgraph anywhere inside its painted area → it collapses to a single surrogate node showing its label and a "+N" descendant-count badge. Edges crossing the boundary re-target the surrogate.
   - Click the surrogate (no drag) → the subgraph expands. Inner node positions are restored.
   - Drag the surrogate → it moves as a node; clicking-without-drag still expands.
   - "Collapse All" / "Expand All" buttons collapse / expand every subgraph at once.
   - Toggling the A\* feature on after a collapse re-routes every edge in the effective IR.
   - "Reset Layout" clears pinned positions but preserves collapse state.
5. `SPIKE3_NOTES.md` exists, under 400 words, covers all six sections honestly.

## Why this matters

The PRD's load-bearing UX is the progressive disclosure family: collapse, focus, path-trace, depth-slider. Spike 2 confirmed the renderer can re-route edges on interaction; Spike 3 confirms the *data model* underneath disclosure is workable — that "what is visible" can be a pure transform over the canonical IR, with the renderer staying disclosure-agnostic. If this transform pattern holds, focus / path-trace / depth-slider all become further transforms over the same IR, not bespoke renderer modes. If it breaks, we need a different architecture before Wave 1.1.

Be honest in `SPIKE3_NOTES.md`. A confident "the transform pattern scales" when it doesn't is the worst outcome.

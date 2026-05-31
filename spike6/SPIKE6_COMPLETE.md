# SPIKE 6 — COMPLETE

**Status:** ✅ Closed — renderer stack validated
**Date:** 2026-05-31
**Branch:** `recursive-layout`
**Fulfils:** the `SPIKE_NOTES.md` deliverable named in
`_bmad-output/planning-artifacts/architecture-decisions-renderer.md` → *Validation Plan*.
**Supersedes:** `SPIKE6_HANDOFF.md` (the four HANDOFFs it tracked are all resolved).

> This is the provenance record that lets the team stop here and lets the next
> coding agent pick up the main PRD build with a clean conscience. It says three
> things plainly: **what is proven**, **what is deferred (cosmetic)**, and **what
> is carried forward as unmeasured risk**. The full as-built architecture lives in
> [`../docs/architecture/`](../docs/architecture/README.md).

---

## 1. What the spike was supposed to prove

The PRD (`docs/prd.md`) makes the renderer the **first** item in the Phase-1 build
sequence, and the renderer-research session locked five architecture decisions
*pending a validation spike*. The spike question, verbatim from
`architecture-decisions-renderer.md`:

> Can the **parser-adapter → AST-normalizer → dagre → d3-shape → SVG** pipeline
> produce visually-acceptable output on a representative Mermaid flowchart with
> nested subgraphs, **and** support smooth real-time drag with edge updates?

Pass criteria (same doc):

1. Static custom render is recognisably the same diagram as Mermaid's reference.
2. Drag is smooth on the dragged node; its edges update in real-time.
3. Mermaid's parser API exposes the AST cleanly enough that nested subgraphs come
   through without reconstruction hacks.

## 2. Verdict

**All three pass — and the spike went far past its own bar.** It was timeboxed at
2–3 hours to answer "is the stack viable." It instead became a multi-week parity
engineering effort that now reproduces Mermaid v11's layout to within a few pixels
on the structural fixtures, including a from-scratch port of Mermaid's recursive
`extractor`/`recursiveRender` cluster engine. The stack is not just *viable*; the
hardest part of the native pipeline (Mermaid-faithful layout) is **already built**.

| PRD locked decision | Spike6 evidence (as-built) |
|---|---|
| **D1** — Rendering tech = **SVG** | `renderer.ts renderFull()` emits `<g data-node-id>` / `<rect data-subgraph-id>` SVG; disclosure interactions are attribute mutations. |
| **D2** — **parser-only + dagre + d3-shape** | `parser-adapter.ts` uses only `mermaid` `db.getVertices/getEdges/getSubGraphs` (no regex, no DOM scraping); `dagre-d3-es` does layout; `d3-shape curveBasis` draws edges. |
| **D2** — nested subgraphs render | `recursive-layout.ts` (Mermaid `extractor` port) + 4 cyclic-nested fixtures + `fixture_nested` + 5-level deep fixture all render. |
| **D5** — drag = **pin-and-recalculate** | `drag.ts` updates one node + locally re-routes its edges; full layout is **not** re-run on drag. |
| Collapse/expand (disclosure mode 1) | `effective-ir.ts` + `collapse.ts` — a working surrogate-node collapse/expand prototype already exists. |

## 3. Pass-criteria assessment

| Criterion | Result | Evidence |
|---|---|---|
| Static render ≈ Mermaid | **PASS (exceeds)** | Verified against Mermaid's own internal `__dump` (graphlib JSON per recursion level), not just eyeballed. Structural fixtures match within +18w/−1h; leaf positions exact on the encapsulated path. |
| Drag smooth + live edges | **PASS** | Side-aware 4-point curves rebuild on the dragged node only; container clusters resize live; cluster-anchored edges stay pinned to the cluster border (the two drag bugs fixed 2026-05-31). |
| Parser exposes AST cleanly | **PASS** | No reconstruction hacks. The one subtlety — `graph.children()` ordering — was matched faithfully (`findNonClusterChild`), not worked around. |

Build health at closure: `tsc --noEmit` **clean**, `vite build` **passes**, working
tree **clean**, 24 fixtures in the harness all render without NaN or console error.

## 4. What is PROVEN (bankable for the product build)

- **SVG is sufficient** at the spike's fixture sizes; the DOM-text affordances the
  PRD wants (Cmd+K search, SVG/PNG/PDF export) are reachable because labels are real
  `<text>` nodes.
- **The parser-only boundary holds.** Mermaid's `flowDb` is a clean AST source; the
  adapter never touches Mermaid's emitted SVG. The dependency surface is the stable
  one the decision banked on.
- **Geometric equivalence to Mermaid is real and reproducible** — same `dagre-d3-es`,
  same `curveBasis`, plus a faithful port of Mermaid's recursive cluster handling.
  A user arriving from mermaid.live sees the same diagram.
- **Pin-and-recalculate drag works** and validates the partial-SVG-mutation pattern
  the disclosure-family animations will reuse.
- **Collapse/expand is de-risked** — the one disclosure mode prototyped here works
  through the same `layout()` entry point, including the hard cases (collapsing a
  cluster whose only child is another cluster).

## 5. What is DEFERRED (known, cosmetic, non-blocking)

These are logged parity nits, not architecture risks. None blocks the product build.

| Item | Detail | Where tracked |
|---|---|---|
| **+18px container width** | Container (outer) clusters are uniformly ~18px wider than Mermaid; `crossHalfFor` keys on `extracted`, empty in the all-external case, so the cross-margin is slightly off. Manifests as +18 dx on some labels. | `RECURSIVE_LAYOUT_LOG.md`, HANDOFF-4 §REMAINING |
| **`fixture_crosscluster` x-divergence** | A pre-existing ~190px node-layout x-offset vs Mermaid on this one fixture, independent of labels. | HANDOFF-4 §REMAINING (d) |
| **Issue B — internal ranksep** | Internal spacing on some flat clusters is marginally tighter than Mermaid. | HANDOFF-4 notes |
| **Per-subgraph direction in flat path** | A nested subgraph declaring a direction different from the top-level one is a known flat-path gap (`fixture_lr_subdir`). The recursive path honours per-cluster direction; the flat path applies one rankdir. | `types.ts` `Direction` comment |

## 6. What is CARRIED FORWARD as RISK (unmeasured — read before Phase 1)

The spike validated **correctness/parity**, not **the product's two real risks**.
Neither was in the spike's scope; both move to the Phase-1 build and should be
instrumented early, not discovered late.

1. **Performance at scale is unmeasured.** The PRD demands ≤16ms p50 frames at 200
   nodes, graceful at 500, no-crash at 1000+. Every spike fixture is a small
   *correctness* fixture (`fixture200` is the largest and is not a perf benchmark).
   The recursive engine re-runs dagre per cluster level and `computeClusterBboxes`
   rebuilds maps per call — fine at 20 nodes, unprofiled at 200+. **Action:** check
   real 200/500/1000-node fixtures into the suite and profile before building the
   disclosure family on top.
2. **The disclosure family is mostly unbuilt — and it is the actual product thesis.**
   Only **collapse/expand** exists. **Focus**, **path**, and **depth-slider** modes
   (the PRD flags focus + path as novel UX work) are not prototyped. The spike
   de-risked the *substrate*, not the *product*. A pre-approved 3-mode fallback
   exists in the PRD if path mode proves intractable.
3. **The parity rabbit-hole is a process lesson.** A 2–3h spike became weeks of
   pixel-chasing against Mermaid internals. That depth was worth it (the layout
   engine is now a real asset), but the next phase should **timebox parity polish**
   and treat the deferred items in §5 as backlog, not blockers.

## 7. Recommendation

**Close spike6. Proceed to the PRD Phase-1 build sequence.** Specifically:

- **Promote `spike6/src/` to the seed of the "Native Pipeline"** in the PRD
  architecture diagram (parser-adapter → IR → layout → render-model → SVG renderer
  → interaction layer are all present and mapped — see
  [`../docs/architecture/06-from-spike-to-product.md`](../docs/architecture/06-from-spike-to-product.md)).
- **Do not reopen renderer technology questions** — D1/D2/D5 are now empirically
  settled, not provisional.
- **Next coding-agent entry points**, in PRD order: (2) backend skeleton, then the
  rest of the **disclosure family on this substrate** (depth-slider → focus → path),
  with **performance fixtures + instrumentation landing alongside**, not after.

The deferred items in §5 ride along as polish tickets. The risks in §6 are the real
Phase-1 agenda.

---

*As-built architecture (team review + agent pickup):*
[`docs/architecture/README.md`](../docs/architecture/README.md).
*Decision rationale (planning stage):*
[`architecture-decisions-renderer.md`](../_bmad-output/planning-artifacts/architecture-decisions-renderer.md).
*Parity decision trail:* `RECURSIVE_LAYOUT_LOG.md`.

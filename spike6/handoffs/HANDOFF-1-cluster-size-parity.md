# Handoff 1 — Cluster-size parity (recursive clusters are too compact)

> **✅ RESOLVED 2026-05-31.** Implemented in `src/recursive-layout.ts` +
> `src/cluster-bbox.ts` (+ `ir.clusterMargins` on `src/types.ts`, cleared in
> `src/layout.ts`). Full write-up: `../RECURSIVE_LAYOUT_LOG.md` → "HANDOFF-1
> RESOLVED". **Important correction to this doc's premise below:** Mermaid does
> NOT draw a small rect inside a bigger placeholder — it draws the full dagre
> **compound box** (verified by measuring the rendered `.cluster rect`). So the
> fix sizes the drawn rect == placeholder == compound box (rank-axis Δ = ranksep,
> cross-axis Δ = nodesep+edgesep = 70, or edgesep = 40 for a non-extracted nested
> compound), decoupled from the flat-path `CLUSTER_PADDING` via `ir.clusterMargins`
> so locked flat fixtures stay byte-identical. The "decouple, keep drawn rect
> small" shape suggested below was therefore NOT followed — read the log entry,
> not the recommendation below, for what shipped.

**Status:** deferred, NOT a regression. Layout is internally consistent and renders
cleanly; it's just tighter than Mermaid on nested diagrams.
**Risk:** Medium. Touches placeholder sizing; must not change the *drawn* rect of
the locked flat fixtures.
**Read first:** `README.md` in this folder (how the engine works + the verification
harness). Skim `../RECURSIVE_LAYOUT_LOG.md` Stage 4.

## Problem

When the recursive engine encapsulates clusters, the resulting cluster rectangles
are noticeably **smaller** than Mermaid's, and the gap grows with nesting depth.
Measured on `fixture_lr_nested` (drawn rect W×H, ours vs Mermaid's cluster node
from the dump):

| cluster  | ours     | Mermaid  |
|----------|----------|----------|
| Backend  | 321×118  | 363×138  |
| UI       | 363×104  | 448×124  |
| Frontend | 605×154  | 750×194  |
| System   | 1040×204 | 1263×264 |

Consequence: our nested diagrams are more cramped and node positions drift from
Mermaid (the parent reserves less room around each cluster, so siblings sit
closer than in Mermaid).

This is **separate** from the already-fixed nested-overlap bug (where placeholder
< drawn rect). Here placeholder **==** drawn rect (internally consistent); the
issue is that BOTH are smaller than what Mermaid uses.

## Root cause

Our placeholder/drawn rect = content + `CLUSTER_PADDING`(20)/side + `CLUSTER_LABEL_OFFSET`(10) on top (`cluster-bbox.ts`). Mermaid's cluster **node** size (the box it
reserves in the parent's dagre, from the `"Graph after layout"` dump) is bigger.
Empirically from the `fixture_lr_nested` / `fixture_node_to_subgraph` dumps:
- **height** ≈ content_height + ~70 (vs our +50), roughly symmetric ~35/side.
- **width** ≈ content_width + a larger, **label-width-influenced** amount (varies:
  Backend +99, UI +124, System +75 across the same fixture).

Subtlety to respect: `CLUSTER_PADDING = 20` is **calibrated so our DRAWN rect
matches Mermaid's DRAWN rect on the LOCKED FLAT fixtures**. So you cannot simply
bump `CLUSTER_PADDING` — that would break the flat fixtures' visual parity. The
evidence suggests **Mermaid's cluster *node* size (used for parent spacing) is
larger than its *drawn* rect** — i.e. Mermaid leaves margin around the cluster
when spacing siblings. Our engine collapses the two into one value.

## The fix (recommended shape)

**Decouple the two sizes** in the recursive engine:
1. **Drawn rect** stays exactly as `cluster-bbox.ts` computes it (content + 20/+10)
   — keep clipping/rendering and the flat fixtures unchanged.
2. **Placeholder size** (what the parent dagre reserves for the cluster node) =
   Mermaid's cluster-node formula, which is *larger*. Derive it from the dumps
   (see below) and apply it ONLY to the `g.setNode(clusterId, {width, height})`
   placeholder in `recursive-layout.ts`. The cluster's children still align to
   the drawn rect inside the (now slightly larger) reserved box.

Net effect: edges/siblings get Mermaid-like spacing, while the visible cluster
border (drawn rect) is unchanged. The edge clip target (drawn rect) sits inside
the placeholder with a small margin — exactly what Mermaid does.

### Where to work
- `src/recursive-layout.ts` — `layoutCluster()`:
  - the `SubResult.width/height` return (currently `content + 2·PAD (+LABEL)`),
  - the placeholder `g.setNode(id, { width: snap(sub.width), height: snap(sub.height) })`,
  - the child-translation offset uses `contentMinX/Y` + `CLUSTER_PADDING`/`LABEL`
    so children land on the **drawn rect** corner; if you enlarge the placeholder,
    keep children anchored to the DRAWN-rect corner (centered within the larger
    box, or top-left — match what the dump shows).
- `src/cluster-bbox.ts` — do NOT change the constants; they're the drawn-rect
  source. If you need Mermaid's larger node size as a formula, add it in
  `recursive-layout.ts`, not here.

### Derive Mermaid's exact formula first (don't guess)
Capture cluster node width/height vs content across several fixtures and fit the
formula. Via `mermaid-debug.html` + `window.__dump`, pull every `"Graph after
layout"` entry and, for each cluster node, compare its `width/height` to the
bbox of its direct children (also in that entry). Do this for
`fixture_node_to_subgraph` (1 cluster), `fixture_lr_nested` (LR, nested),
`fixture_deep_5level` (TB, deep), `fixture_lr_cyclic`. Separate the height term
(looks like a clean constant per side) from the width term (label-influenced —
check against the cluster title text width via `measureLabel`).

## Acceptance criteria
- `fixture_lr_nested`, `fixture_deep_5level`, `fixture_node_to_subgraph`,
  `fixture_lr_subdir`, `fixture_rl_chain`: our cluster sizes AND node positions
  match Mermaid within a few px (compare to `"Graph after layout"` relative
  positions; absolute origin will differ).
- The **drawn** cluster rects still match Mermaid's drawn rects (eyeball
  side-by-side `index.html`).
- All locked flat fixtures **byte-identical** to `:5175` (they don't hit the
  recursive engine, but re-verify representatives: `fixture_crosscluster`,
  `fixture_cyclic_nested_3`).
- `tsc --noEmit` silent, `vite build` passes, no console errors on any fixture.

## Risks / gotchas
- If you enlarge the placeholder, the cluster-anchored whole-cluster edges clip to
  the DRAWN rect (smaller, inside) — confirm the arrowheads still land on the
  visible border and don't float in the margin. (Mermaid clips to the drawn
  border too, so this should match.)
- Keep placeholder==drawn-rect for the SINGLE-cluster case if the dump shows
  Mermaid's node==drawn there; only the multi-level cases may need the margin.
  Verify per fixture rather than assuming a global rule.
- `ranksep = parentRanksep + 25` (compounds with depth) and the per-level edge
  reorder (whole-cluster edges last) are already correct — don't disturb them.

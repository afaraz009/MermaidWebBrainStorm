# Spike 6 — Project state handoff

Last commit on `spike6` branch: `3dff5db` "Spike 6 stable, just reserve callback mmd mirrored".
Working tree clean at handoff time. Typecheck (`cd spike6 && npx tsc --noEmit`) is green.

## What this app is

A custom SVG flowchart renderer aiming for **visual parity with Mermaid v11**.
We reuse Mermaid's parser and Mermaid's layout engine but reimplement the
renderer and the IR-extraction layer, so we control edge routing, cluster
outlines, drag/collapse interactivity, and (optionally) A* edge routing.

Pipeline:
```
.mmd source
  → Mermaid parser (mermaid.mermaidAPI.getDiagramFromText)   [parser-adapter.ts]
  → our IR (nodes / edges / subgraphs)                        [types.ts]
  → dagre-d3-es layout (compound graph)                       [layout.ts]
  → SVG render                                                [renderer.ts]
  → interactivity: drag, collapse/expand, connect, A* route   [drag/collapse/connect/routing]
```

`spike6/index.html` is a **side-by-side comparison page**: left pane = real
Mermaid render, right pane = ours. Load any fixture via
`http://localhost:<port>/index.html?fixture=NAME.mmd` (dev server:
`cd spike6 && npx vite`, port auto-bumps, often 5175). No registration — the
`?fixture=` param fetches the `.mmd` directly from `spike6/`.

## File reference (spike6/src)

Core data + layout:
- `types.ts` — `IRNode`, `IREdge`, `IRSubgraph`, `IR`. Note **`IREdge.id` is
  required and load-bearing** (unique identity; two edges can share
  `(from,to)`). `fromCluster?`/`toCluster?` mark cluster-anchored edges.
- `parser-adapter.ts` — Mermaid → IR. Owns `findNonClusterChild` +
  `findCommonEdges` (byte-for-byte mirror of Mermaid's cluster-anchor
  algorithm, including a deliberately-preserved Mermaid typo at line ~72).
  Stamps `id` (`L_${idx}`) and `fromCluster`/`toCluster` on edges.
- `layout.ts` — dagre wrapper. Builds compound graph, runs `dagreLayout`,
  a **pass-1.5 cluster re-anchor** (`reanchorClusterEdges`), then writes
  positions + clipped edge waypoints back to IR. `g.setEdge`/`g.edge` always
  pass `e.id` as the dagre multigraph name. `sortNodesByHierarchy` controls
  node insertion order (clusters reversed, leaves declaration order).
- `cluster-bbox.ts` — **single source of truth** for the drawn cluster
  rectangle (`CLUSTER_PADDING=20`, `CLUSTER_LABEL_OFFSET=10`, memoized
  `computeClusterBboxes`). Used by renderer, layout, drag, routing.
- `border.ts` — shape-aware border clipping (`clipToBorder`) + cluster-bbox
  perpendicular clip (`clipToClusterRect`).
- `effective-ir.ts` — derives an IR view with collapsed clusters replaced by
  surrogate nodes; strips cluster annotations on the collapsed side only.

Render + interactivity:
- `renderer.ts` — SVG render; keys edges by `id`. Hosts
  `buildSideAwareCurvesForNode` (drag-preview edge curves, cluster-aware).
- `drag.ts` — node drag; persists side-aware curves on drop.
- `collapse.ts` / `connect.ts` / `contextMenu.ts` / `contextMenuWiring.ts` /
  `menuActions.ts` — collapse/expand, edge creation, right-click menu.
- `routing.ts` + `astar.ts` + `astarSettings.ts` — optional A* edge router
  (only when `astarSettings.enabled`); clips cluster-anchored endpoints to
  the cluster border via `clipPathToCluster`.
- `pan.ts` / `gridOverlay.ts` / `edgeSettings.ts` / `entry.ts` — pan/zoom,
  debug grid, edge-mode toggle, bootstrap.

## Fixtures (spike6/*.mmd)

10 production fixtures, all currently matching Mermaid byte-for-byte —
**must not regress**:
`fixture.mmd`, `fixture200.mmd`, `fixture_crosscluster.mmd`,
`fixture_crosscluster_acyclic.mmd`, `fixture_node_to_subgraph.mmd`,
`fixture_nested.mmd`, `fixture_cyclic_nested_1.mmd`–`_4.mmd`.
Plus `fixture_shapes.mmd` (shape coverage) and `fixture_reserve_fallback.mmd`
(duplicate-edge edge case — now matches Mermaid).

Specific parity checkpoints to re-verify if layout changes:
- cyc2: Router bottom-left, Response on right.
- cyc3: Reviewer above Editor, Halt below Productivity.
- cyc4: Exit beside DiamondScc, Done below Pipeline.
- fixture_nested: Cache-LEFT / Primary-RIGHT in Storage_L2.

## Locked architectural decisions

1. **Parser is Mermaid's, not ours.** We call the (non-public)
   `mermaid.mermaidAPI.getDiagramFromText`. Version-fragile but accepted —
   not worth reimplementing the flow grammar.
2. **Layout is flat dagre-d3-es, NOT recursive.** Mermaid lays out each
   cluster recursively and encapsulates it; we run flat dagre and approximate
   encapsulation with a **two-pass re-anchor heuristic** (`reanchorClusterEdges`)
   keyed on `externalConnections`. This is acknowledged debt — works for the
   10 fixtures, not provably general. A real recursive-layout port would
   dissolve both this and the interior-waypoint culling, but is out of scope
   until a fixture forces it.
3. **Cluster-anchored edges** rewrite the subgraph endpoint to a descendant
   leaf for dagre, but carry `fromCluster`/`toCluster` so the renderer clips
   the visible endpoint to the **drawn cluster border** (perpendicular).
   ⚠ Invariant: `fromCluster`/`toCluster` always equal the pre-rewrite
   original endpoint when present — see the boxed comment above
   `reanchorClusterEdges` in `layout.ts`. Any new IR pass that rewrites
   `from`/`to` must preserve or explicitly clear these.
4. **Edge identity is `IREdge.id`, not `(from,to)`.** dagre runs in
   `multigraph:true` and we pass `id` as the edge name, so duplicate
   `(from,to)` pairs (from reserve-fallback rewrites) survive end-to-end.
   This mirrors Mermaid's `edge.id` naming scheme.
5. **`findCommonEdges` Mermaid typo is intentionally preserved** for
   byte-parity. Do not "fix" it without a fixture proving Mermaid changed.
6. **`cluster-bbox.ts` is the only place** that computes the drawn cluster
   rectangle. Don't recompute padding/label-offset anywhere else.
7. **Playwright is opt-in.** Per `CLAUDE.md`, only use it when the user
   explicitly asks to test. Default verification = `tsc --noEmit` + targeted
   reading + asking the user to load the comparison page.

## Known remaining debt (not yet addressed)

- **#1/#2 architectural — PARTIALLY ADDRESSED on branch `recursive-layout`.**
  A selective recursive layout (`src/recursive-layout.ts`, gated from
  `layout.ts`) now encapsulates `externalConnections===false` clusters into
  their own sub-layout with their own `direction` — mirroring Mermaid's
  `extractor`/`recursiveRender`. This fixes the per-subgraph-direction gap
  (`fixture_lr_subdir`) and parallel-branch ordering for encapsulatable clusters
  (`fixture_rl_chain`), verified against Mermaid's dump. Shared helpers live in
  `src/layout-core.ts`. Still on the FLAT two-pass re-anchor + interior-cull path
  (unchanged, byte-identical): any graph containing an EXTERNAL cluster — i.e.
  all the cross-boundary fixtures (`fixture`, `fixture200`, `fixture_nested`,
  `cyclic_nested_1..4`, `crosscluster*`, `reserve_fallback`) — because Mermaid
  also lays external clusters out flat. Remaining gaps: (a) MIXED graphs
  (cyc3/cyc4 — Mermaid partially encapsulates; we keep them flat to preserve the
  locked checkpoints); (b) recursive cluster SIZING is more compact than
  Mermaid's (cluster-bbox.ts padding vs Mermaid's larger label-influenced
  padding); (c) `reserve_fallback`'s L1/L2 flip is a flat-path reserve-fallback
  issue, not the recursive gap. See `RECURSIVE_LAYOUT_LOG.md` for the full trail.
- **Non-public Mermaid API coupling** (`parser-adapter.ts`) — no version
  guard; would break silently on a Mermaid major bump.
- These were explicitly deferred — see prior session's plan at
  `C:\Users\ahmed\.claude\plans\wiggly-drifting-ullman.md`.
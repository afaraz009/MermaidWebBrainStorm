# Handoff 2 — Mixed-graph partial encapsulation (cyc3 / cyc4)

**Status: ✅ RESOLVED (2026-05-31).** cyc3/cyc4 now take the recursive engine and
are partially encapsulated, matching Mermaid. Encapsulated set parity
(`Productivity`⊃`Apps`; `Pipeline`), locked checkpoints hold, all all-external +
fully-encapsulated fixtures byte-identical (git-stash before/after diff), `tsc`/
`vite build` green. Full decision trail: `../RECURSIVE_LAYOUT_LOG.md` "HANDOFF-2
RESOLVED". Two corrections to the brief below: (a) NO reanchor pass is needed —
Mermaid keeps external clusters' first-DFS anchor, which the parser-adapter
already reproduces; (b) the hard part was the cycle-break ORDER — extracted
sub-levels must use Mermaid's `copy()` node order (root keeps `buildLayoutGraph`
order), see the log. Original brief preserved below for context.

**Was:** deferred, NOT a regression. The affected fixtures (`fixture_cyclic_nested_3`,
`fixture_cyclic_nested_4`) PASSED their locked checkpoints via the flat
path. This task closes the remaining structural-parity gap with Mermaid for
graphs that mix encapsulatable and external clusters.
**Risk:** HIGH — these are LOCKED fixtures. A wrong move regresses passing
checkpoints. Implement behind the gate and verify obsessively against the dump.
**Read first:** `README.md` (engine + harness). Skim `../RECURSIVE_LAYOUT_LOG.md`
Stage 5 + "HANDOFF-1 RESOLVED".

> **Visible symptom (expected until this lands):** on the side-by-side, cyc3's
> nested clusters render markedly more COMPACT than Mermaid — e.g. `Productivity`
> 295×585 vs Mermaid 365×906, `Apps` 255×535 vs 295×831 (measured 2026-05-31).
> That is this deferred item, NOT a HANDOFF-1 regression: cyc3 goes entirely
> through the flat path (it has external clusters), which HANDOFF-1 left
> byte-identical to baseline. Two causes compound here: (a) Mermaid gives
> `Productivity`/`Apps` their own encapsulated layout (≈320px more height) which we
> don't, and (b) flat-path clusters are drawn at `cluster-bbox` padding, smaller
> than Mermaid's dagre compound box.
>
> **Leverage from HANDOFF-1:** the recursive engine now sizes each encapsulated
> cluster to Mermaid's exact compound box and records per-cluster margins in
> `ir.clusterMargins` (see `recursive-layout.ts` + the log). So once this task
> routes `Productivity`/`Apps` through `layoutRecursive`, they get correct
> Mermaid-sized rects for free. The remaining flat external clusters
> (`ControlPlane`/`DataPlane`/`ProdA`/`ProdB`) keep the legacy `cluster-bbox`
> padding (no `clusterMargins` entry) — matching the locked flat fixtures, but
> still smaller than Mermaid's box for those four. Closing that last flat-cluster
> sizing gap would mean applying the compound-box size on the flat path too, which
> un-locks every flat fixture — out of scope for cyc3 parity unless explicitly taken on.

## Problem

Today `layout.ts` only takes the recursive engine when a graph has **no** external
cluster (`!anyExternal`). A *mixed* graph — some clusters encapsulatable, some
external — is sent **entirely** to the flat path. Mermaid instead **partially**
encapsulates: it encapsulates the `externalConnections===false` clusters and keeps
the external ones flat, at the same level.

Confirmed from `mermaid-debug.html?fixture=fixture_cyclic_nested_3.mmd` dump:
- ENCAPSULATED by Mermaid: `Productivity` (depth 0) and `Apps` (depth 1, inside it).
- KEPT FLAT (external): `ControlPlane`, `DataPlane` (the ControlPlane↔DataPlane
  cycle), `ProdA`, `ProdB` (the ProdA↔ProdB cycle inside `Apps`).

So at the ROOT level Mermaid has `Productivity` as an encapsulated node *alongside*
the flat `ControlPlane`/`DataPlane`; and inside `Apps`, `Apps` is encapsulated while
`ProdA`/`ProdB` are flat within it. Our flat-only handling produces a different
(though checkpoint-passing) layout. `fixture_cyclic_nested_4` is analogous.

## Root cause

`src/layout.ts` gate:
```ts
if (anyEncapsulatable && !anyExternal && !anyPinned) return layoutRecursive(ir, external);
// else: flat path
```
The `!anyExternal` clause forces mixed graphs to flat. And `recursive-layout.ts`
`layoutCluster()` currently assumes EVERY child subgraph at a level is an
encapsulated placeholder (it has no branch for a flat/external child cluster).

## The fix (recommended shape)

1. **Widen the gate** to `anyEncapsulatable && !anyPinned` (drop `!anyExternal`).
   Keep the pinned exclusion (Handoff-independent; pins still go flat).
2. **Teach `layoutCluster()` to handle a level with BOTH kinds of children:**
   - Encapsulatable child subgraph (`!external`) → recurse + single placeholder
     (as today).
   - External child subgraph → do NOT encapsulate. Add it the way the FLAT path
     does: `g.setNode` each of its descendant leaves/nested-clusters and
     `g.setParent` them into THIS level's compound graph (this is why the level's
     graph is created `compound:true`). Its declared `direction` is ignored
     (matches Mermaid). Its cluster rect is later derived by `cluster-bbox.ts`
     from the leaf positions, same as the flat path.
   - Edges among/into the flat external clusters must be added at this level with
     their leaf endpoints (not a placeholder), and the **extremal-leaf re-anchor**
     + interior-waypoint cull (today in `layout.ts::reanchorClusterEdges`) must run
     for those external clusters. Easiest: factor the reanchor so it can run on the
     per-level subgraph, scoped to the external cluster set.
3. **Two-pass reanchor at mixed levels.** The flat path runs dagre, re-anchors
   cluster-endpoint edges to the settled extremal leaf, then re-runs dagre. A mixed
   level needs the same two passes (the encapsulated placeholders are stable across
   the re-run; only the external clusters' anchor edges change).

This is genuinely the hard part the original task brief flagged ("budget most of
your care" on cross-boundary edges). The clean sub-problem: a single dagre level
that contains leaves + encapsulated placeholders + flat compound external clusters,
with the reanchor pass applied only to the external clusters.

### Where to work
- `src/layout.ts` — the gate; consider routing ALL cluster graphs through
  `layoutRecursive` and letting it fall back to pure-flat internally when a level
  has only external clusters (so the all-external fixtures still produce the exact
  flat result — verify byte-identical!).
- `src/recursive-layout.ts` — `layoutCluster()` per-level construction (add the
  external-child branch + compound setParent + scoped reanchor).
- `src/layout-core.ts` — `computeExternalConnections` already gives the set;
  `collectClusterLeaves`, `buildDescendantsMap`, and the reanchor logic may need to
  be callable per-level.

## Acceptance criteria
- Our encapsulated-cluster SET equals Mermaid's for `cyc3` and `cyc4` (compare to
  the `"Cluster without external connections"` dump lines): `Productivity`+`Apps`
  for cyc3; the analogous set for cyc4.
- Locked checkpoints HOLD: cyc3 Reviewer above Editor / Halt below Productivity;
  cyc4 Exit beside DiamondScc / Done below Pipeline. (These are the regression
  tripwires — verify on the side-by-side and against `"Graph after layout"`.)
- **All-external fixtures stay byte-identical to `:5175`**: `fixture`,
  `fixture200`, `fixture_nested`, `cyclic_nested_1/2`, `crosscluster(_acyclic)`,
  `reserve_fallback`. This is non-negotiable — confirm with the 5190-vs-5175 diff.
- Per-level node + edge insertion order matches Mermaid's `"Graph before layout"`
  for cyc3/cyc4 (barycenter is order-sensitive).
- `tsc` silent, `vite build` passes.

## Risks / gotchas
- Highest-risk change in the whole port. Do it incrementally: first make
  `layoutRecursive` reproduce the EXACT flat result for an all-external graph
  (byte-identical), THEN add encapsulation of the non-external children.
- The interaction of compound `setParent` (external clusters) + placeholder nodes
  (encapsulated) at one dagre level is the crux — Mermaid does this in
  `recursiveRender` (clusterNode vs the "non recursive path" where
  `graph.children(v).length > 0`). Study `dagre-KV5264BT.mjs` lines 422-469.
- Preserve the `fromCluster`/`toCluster` invariant; the per-level edge reorder
  (cluster-touching last) and `ranksep += 25` rules still apply.

# Handoff 4 — Flat-path Mermaid parity (all-external graphs)

**Status:** MOSTLY RESOLVED (2026-05-31) — all-external graphs now route through
the recursive engine and size clusters from dagre's true compound box. Cluster
rects within +18px (containers) / exact (leaf-only) of Mermaid; HANDOFF-3 fixed
as a side-effect. One small residual remains (uniform +18 on container clusters)
— see "Progress — MOSTLY RESOLVED" at the bottom. (Was: DEFERRED by choice.)
This task closes a *pre-existing* parity gap between our legacy FLAT engine and
Mermaid for graphs where every cluster is external.
**Risk:** HIGHEST in the whole port. This effectively *replaces the proven flat
path*, so it intentionally **un-locks every flat fixture** — each must be
re-baselined against Mermaid (not against the old byte-identical output).
**Read first:** `README.md` (engine + harness) and `../RECURSIVE_LAYOUT_LOG.md`
→ "HANDOFF-2 RESOLVED" + "Remaining / deferred" (the flat-path bullet). This
task is the natural successor to HANDOFF-2, and **subsumes HANDOFF-3**
(`reserve_fallback` L1/L2 flip is the same flat-path gap).

## Problem

A graph in which **every** subgraph has a boundary-crossing edge
(`anyEncapsulatable === false`) takes the legacy **flat** engine (the body of
`src/layout.ts`) — in BOTH Mermaid and us. Mermaid lays such a graph out with
its `recursiveRender` root call (no extraction, all clusters as dagre compounds,
each drawn at its **compound box**). Our flat path approximates that with
`compound:true` dagre + `cluster-bbox.ts` legacy padding, and diverges from
Mermaid in visible ways. Measured on `fixture_nested.mmd` (2026-05-31, Mermaid
left-iframe vs our-renderer):

- **(A) Cluster-entering edge labels collide with the cluster TITLE.** The
  `ServiceRouter -->|auth| AuthEntry` edge label lands at y≈482.8 — *inside*
  the `Auth Subsystem` cluster (rect top 477.8) — on top of the cluster title
  (y≈495.8). Mermaid instead drops `auth` in the gap *above* the cluster border
  (edge label bottom ≈ above border; title sits below the border, clear). Same
  for `payment` / `Payment Subsystem`.
- **(B) Internal ranksep slightly tighter than Mermaid.** `Create Session →
  Session Cache` gap ≈ 169 (ours) vs ≈ 190 (Mermaid, scale-adjusted).
- **(C) Cluster rects smaller than Mermaid.** Flat clusters use
  `CLUSTER_PADDING = 20` (+ `CLUSTER_LABEL_OFFSET = 10` top), which is smaller
  than Mermaid's dagre compound box (rank half-margin `ranksep/2`, cross
  half-margin 35/20 — see `crossHalfFor` in `recursive-layout.ts`). This thin
  top band is what lets the edge label in (A) overlap the title.

`reserve_fallback` L1/L2 sibling flip (HANDOFF-3) is the same family: a flat-path
layout divergence from Mermaid's flat result.

## Root cause

`src/layout.ts` flat body: clusters are sized by `cluster-bbox.ts` legacy
padding (not the compound box), and cluster-crossing edges + their labels are
ranked by flat dagre + the pass-1.5 `reanchorClusterEdges` heuristic, which does
not reproduce Mermaid's edge-label-relative-to-border placement. The RECURSIVE
engine (`src/recursive-layout.ts`) already matches Mermaid for the
encapsulated/mixed cases (HANDOFF-1/2): compound-box margins via
`ir.clusterMargins`, `crossHalfFor`, `copyOrder`, no-reanchor. The flat path was
deliberately left untouched to keep the locked fixtures byte-identical.

## The fix (recommended shape)

**Route all-external graphs through `layoutRecursive` too**, then re-baseline
every flat fixture against Mermaid. Rationale: the recursive engine now lays
external clusters out FLAT as dagre compounds sized to the compound box
(HANDOFF-2). For an all-external graph there are **no extracted clusters**, so
`layoutRecursive`'s root `layoutCluster(undefined, …)` already lays everything
flat — it's the flat path, but Mermaid-sized and with the corrected
cross-margin/edge rules.

1. **Widen the gate** in `layout.ts`: drop the `anyEncapsulatable` precondition
   so a no-encapsulatable-cluster graph still recurses (keep the `!anyPinned`
   exclusion). Or invert: only the pinned / no-subgraph cases stay flat.
2. **Make `layoutRecursive` reproduce Mermaid's flat layout for an all-external
   root.** The root already uses `sortNodesByHierarchy` (matches
   `buildLayoutGraph`); verify the all-external root produces Mermaid's node
   order + positions. Watch the cluster-touching edge ordering and the
   `effectiveParentOf`/`edgesByLevel` placement when there are NO extracted
   levels.
3. **Solve (A) — edge label vs cluster border.** This is the genuinely hard part
   (a dagre ranking detail). Confirm against Mermaid's `"Graph after layout"`
   dump where the cluster-crossing edge's LABEL dummy ranks relative to the
   cluster border node, and reproduce it so the label lands OUTSIDE the cluster
   top band. Budget most of your care here.
4. **Re-verify EVERY former-flat fixture against Mermaid** (side-by-side +
   dump), not against the old 5176 baseline — they WILL shift; the new target is
   Mermaid parity. Fold in HANDOFF-3 (`reserve_fallback`).

Alternative (smaller, partial): keep the flat path but set `ir.clusterMargins`
on it (compound-box sizing) so cluster rects match Mermaid (fixes C, helps A).
Does NOT fix (A)'s edge-label ranking or (B). Still un-locks the flat fixtures.

## Where to work
- `src/layout.ts` — the gate; possibly retire most of the flat body.
- `src/recursive-layout.ts` — ensure the all-external root level is
  Mermaid-faithful (order, edge placement, edge-label-vs-border).
- `src/cluster-bbox.ts` — already applies `clusterMargins` when present.
- Harness: `index.html?fixture=…` (left Mermaid / right ours),
  `mermaid-debug.html` dump, the import-the-live-modules capture from
  `RECURSIVE_LAYOUT_LOG.md`.

## Acceptance criteria
- Each former-flat fixture (`fixture`, `fixture200`, `fixture_shapes`,
  `fixture_nested`, `crosscluster(_acyclic)`, `cyclic_nested_1/2`,
  `reserve_fallback`, `bt_pipeline`, `lr_cyclic`) matches **Mermaid** structurally:
  cluster sizes to the compound box (within the short-label leaf residual), edge
  labels clear of cluster titles (A), internal spacing matching (B).
- Locked CHECKPOINTS re-verified against Mermaid (not the old baseline): cyc2
  Router bottom-left / Response right; `fixture_nested` Cache-LEFT / Primary-RIGHT
  in Storage_L2; `reserve_fallback` L1/L2 order; crosscluster parallel externals.
- cyc3/cyc4 (HANDOFF-2) and the encapsulated probes stay correct.
- `tsc --noEmit` silent, `vite build` passes, no console errors, no NaN.

## Risks / gotchas
- **This un-locks the byte-identical guarantee on purpose.** There is no
  "same-as-before" safety net — correctness is judged against Mermaid only. Do it
  incrementally, fixture by fixture, against the dump.
- The pass-1.5 reanchor exists ONLY on the flat path; the recursive engine
  deliberately has none (external clusters keep their first-DFS anchor — see
  `RECURSIVE_LAYOUT_LOG.md` HANDOFF-2 §4). Make sure dropping the flat path does
  not lose a behaviour some all-external fixture relied on (e.g. reserve-fallback
  self-loop avoidance — that lives in `parser-adapter.findNonClusterChild`, which
  both paths share, so it should carry over).
- The short-label `rect` baseW=100-vs-Mermaid-83 leaf residual (HANDOFF-1) will
  still leave a few px of width error — that's a separate leaf-sizing issue, not
  this task.
- Edge-label-vs-cluster-border (A) is the crux and is subtle dagre ranking
  behaviour; verify it on more than `fixture_nested` (any `node→leaf-inside-
  cluster` labelled edge).

---

## Progress — MOSTLY RESOLVED (2026-05-31)

**Approach:** Full (route all-external through the recursive engine). Playwright
authorized for dump-driven verification. `tsc --noEmit` clean throughout.

### Changes applied (4 files)
1. **`src/layout.ts`** gate widened. Was `if (anyEncapsulatable && !anyPinned)`;
   now `if (ir.subgraphs.length > 0 && !anyPinned) return layoutRecursive(...)`.
   All-external graphs (`encapsulated`/`extracted` empty) now take the recursive
   root, which lays every cluster as a flat dagre compound. Only PINNED / no-
   subgraph graphs stay on the legacy flat body. Also clears `ir.clusterRects`
   at the top alongside `ir.clusterMargins`.
2. **`src/types.ts`** — new `IR.clusterRects?: Map<id, {x,y,w,h}>` (drawn rect in
   global coords, recorded straight from dagre's compound box).
3. **`src/recursive-layout.ts`** — record each **EXTERNAL** cluster's dagre
   compound box (`g.node(id)`, centre+size) into a per-level `clusterRects` map,
   bubble it up through the same additive translation as `leafPos`/`edgePoints`,
   and expose at root as `ir.clusterRects`. EXTRACTED/encapsulated clusters are
   deliberately NOT recorded — they keep the proven `clusterMargins` path
   (HANDOFF-1/2), so fully-encapsulated fixtures get an empty `clusterRects` and
   are byte-identical.
4. **`src/cluster-bbox.ts`** — `computeClusterBboxes` prefers a recorded
   `clusterRects` entry over the leaf-bbox+margin derivation.

### THE root-cause finding (this is the crux, not what the handoff guessed)
The handoff theorised issue C/A was an edge-*anchoring* bug. It is NOT. Debug
probe of `g.node(clusterId)` at the recursive root showed **dagre already
computes the correct compound box** (e.g. `fixture_nested` PrimaryDB_L3 = 715
wide, matching Mermaid's 697±18). The bug was entirely in the **drawn-rect
derivation**: `computeClusterBboxes` rebuilt each rect as leaf-bbox + symmetric
margin, which structurally CANNOT reproduce a box that dagre widened for
edge-routing dummies (cross-boundary edges fanning into a cluster). PrimaryDB
held two ~120px cylinders → derived 190 wide vs dagre's true 715. Fix = use
dagre's recorded box. PrimaryDB went **190 → 715 (err −507 → +18)**.

### Verified vs Mermaid dumps
- **`fixture_nested`** (all-external, the canonical case): every cluster now
  within **+18px width / −1px height** of Mermaid. Leaf-only clusters & all
  heights EXACT. Leaf positions exact. No NaN, 21 nodes/11 clusters. Visual
  side-by-side matches Mermaid's nesting.
- **`fixture.mmd`**: Authentication 402×440 vs Mermaid 401×440 (**~exact**);
  Payment_System 441×460 vs 431×459 (+10/+1).
- **`fixture_reserve_fallback` — HANDOFF-3 NOW FIXED**: L2 LEFT (x=43) / L1 RIGHT
  (x=193), matching Mermaid (L2@81 / L1@208). Was flipped before. ✅ subsumes H-3.
- **cyc3** (mixed/encapsulated, HANDOFF-2): UNCHANGED — ProdB 254×293 exact,
  cycle-break order preserved (Reviewer above Editor, ProdA left of ProdB), no
  NaN. The external-only narrowing kept the extracted path untouched.
- All 17 fixtures render without error.

### REMAINING (small, optional)
1. **Uniform +18px width on CONTAINER clusters** (those whose direct children
   include another cluster: Platform_Top, Services_L2, Storage_L2, Auth_L3,
   PrimaryDB_L3, System, Frontend, Backend). Leaf-only clusters are exact. The
   +18 lives in **dagre's own compound box** (came straight from `g.node()`), so
   it's a dagre-INPUT parity nit, not a margin/post-processing fix. Hypothesis:
   Mermaid reserves a smaller cross-margin (edgesep/2, ~18 less) when a cluster
   border sits next to a child COMPOUND vs a real node — our `crossHalfFor`
   already models this (`NESTED_CROSS_HALF_MARGIN`) but keys on `extracted`,
   which is empty in the all-external case, so external container borders get the
   full 35. Needs investigation at the dagre border-node/setParent level.
   Cosmetic only (clusters slightly roomy; no overlaps, no title collisions).
2. Issue **B** (internal spacing): not yet separately re-measured post-fix.
3. `vite build` (only `tsc --noEmit` run so far).
4. Remaining fixtures not yet numerically swept: `fixture200`, `fixture_shapes`,
   `crosscluster(_acyclic)`, `cyclic_nested_1/2/4`, `bt_pipeline`, `lr_cyclic`,
   `lr_subdir`, `node_to_subgraph`, `deep_5level` (all render; not all measured).

### Issue A (edge-label placement) — RESOLVED (2026-05-31)

**The dual-rule the earlier handoff prescribed (`labelPos` = dagre `edge.x/y`
for normal, arc-length for crossing) was based on a misdiagnosis.** Two findings
overturned it:

1. **dagre's raw `g.edge().x` is OFF our final path.** Its rank coord (y for TB)
   is exact, but dagre offsets the cross-coord to the SIDE of the path, and our
   `clipEdgeWaypoints` then straightens the path — so the raw coord ends up
   ~25–30px beside the drawn path. Using it verbatim is what made labels sit "too
   far to one side" (cyclic_nested_1 `retry`: raw x=271.9 vs path x=240.2).
2. **`fromCluster`/`toCluster` does NOT flag the auth/payment crossing edges.**
   Those flags are only set when an endpoint was a *subgraph id* rewritten to a
   leaf; `ServiceRouter→AuthEntry` has an explicit leaf endpoint, so it's unflagged
   — the crossing branch never fired for the exact edges issue A is about.

**Final rule (`renderer.ts` `edgeLabelAnchor`):** still plumb dagre's label coord
into `e.labelPos` (recursive engine, `recursive-layout.ts`), but at render time
**snap it to the nearest path VERTEX**. dagre threads the label dummy through the
routed path as a vertex; clipping preserves it as a vertex (possibly with a
straightened coord), so nearest-vertex recovers exactly Mermaid's point:
- `retry` (normal): raw (271.9,706.5) → vertex (240.2,706.5) = Mermaid (240.2,706.7).
- `auth` (into-cluster): raw (315.3,445.8) → vertex (285.2,445.8) = Mermaid EXACT —
  the waypoint just ABOVE the cluster border, clear of the "Auth Subsystem" title
  that the naive middle-index waypoint lands on. Issue A solved without any
  crossing-flag detection.

**Fallback when `labelPos` is absent** (flat legacy path; or a non-layout reroute —
side-aware drag / A* — which DELETES the now-stale coord in `drag.ts`): use the
**arc-length midpoint** (geometric middle of the drawn path), NOT the middle-INDEX
waypoint. A side-aware curve is 4 points `[anchor,stub,peerStub,peerAnchor]` whose
middle index (`pts[2]`=peerStub) sits at the arrowhead end — THAT was the drag-jump
bug. Arc-length is jump-free for any path shape.

**Files:** `types.ts` (IREdge.labelPos), `recursive-layout.ts` (capture
`g.edge().x/y` → bubble up → write `e.labelPos`), `layout.ts` (clear labelPos at
top), `drag.ts` (delete labelPos on side-aware + A* rebuild), `renderer.ts`
(`nearestVertex` + `edgeLabelAnchor`, used at all 3 label-placement sites).

**Verified vs Mermaid dumps:** retry, auth (exact), payment/evict/audit (dy≈0; dx
within the documented +18 container residual), crosscluster `yes` (label correctly
on-path, y exact; its 190px x-gap is the fixture's pre-existing node-layout
divergence, not a label issue). Drag: dragging C_Process lands the `retry` label at
the path's geometric middle, not the arrowhead. `tsc --noEmit` clean; no NaN across
all 16 fixtures; every labelled edge gets a labelPos.

### Verification harness gotchas (hard-won — read before re-probing)
- `window.__dump` entries are OBJECTS `{method, args:[fmtStr, colorStr, msgStr,
  ...data]}`. Message = `args[2]`. For `"Graph after layout"`, the graph is a
  **JSON STRING** in `args[3]` (`data.find(x => x.trim().startsWith('{'))`, then
  `JSON.parse`). Each node: `{v, value:{x,y,width,height,isGroup,parentId}}` —
  global coords, one flat root graph for an all-external fixture.
- Count `"Returning from recursive render"` to tell if Mermaid encapsulated: 1 =
  flat/all-external; >1 = recursed (cyc3 = 3, lr_nested = 5).
- `mermaid-debug.html?fixture=NAME` = inline Mermaid SVG. `our-renderer.html` =
  ours (`[data-node-id]` translate=center; `[data-subgraph-id] rect`). `index.html`
  has iframes `#left` (mermaid-reference) / `#right` (ours) — set `.src` on both,
  read via `iframe.contentDocument`.
- `browser_evaluate` `filename:` + screenshots write to MCP cwd = repo ROOT
  (`D:\CODE\MermaidRecursive_WT\`), NOT `spike6/`.
- dev server `:5190` (this branch). `:5175` is NOT a pre-port baseline — it
  serves a recursive-capable build too (byte-identical to :5190 on flat
  fixtures), so it is USELESS for "did I change flat behaviour". Mermaid dump is
  the only ground truth.

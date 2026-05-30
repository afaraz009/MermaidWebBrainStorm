# Recursive-layout port — running log

Branch `recursive-layout`. Plan: `~/.claude/plans/go-through-recursive-layout-task-md-and-jazzy-nova.md`.
Goal: replace flat dagre with Mermaid's **selective** encapsulate-then-translate
(encapsulate only `externalConnections === false` clusters, each with its own
direction; leave external clusters flat). Closes the parallel-branch ordering
flip and the per-subgraph-direction gap.

## Verification harness
- Dev server (this worktree): `npx vite --port 5190 --strictPort` (port 5175 is
  occupied by another checkout's server — do not rely on it).
- Ground truth: `mermaid-debug.html?fixture=NAME.mmd` tees Mermaid's `log.*` into
  `window.__dump`. Markers: `"Cluster without external connections…"` = which
  clusters Mermaid encapsulates; `"Fixing dir A B"` = direction chosen; `"Graph
  after layout: {…}"` = per-level positions. Read via Playwright (authorized).
- Side-by-side: `index.html?fixture=NAME.mmd` (left = Mermaid, right = ours).

## Mermaid ground truth — which clusters get ENCAPSULATED (captured 2026-05-30)

| Fixture | Encapsulated (dir) | External → flat | Recursive change? |
|---|---|---|---|
| `fixture.mmd` | — | Authentication, Payment_System | none (flat) |
| `fixture200.mmd` | — | all 24 | none (flat) |
| `fixture_nested.mmd` | — | all 11 (Platform_Top, Services_L2, Storage_L2, Auth_L3, Payments_L3, *_L4 …) | none (flat) |
| `fixture_cyclic_nested_2.mmd` | — | Telemetry, API_Layer, Service_Tier, Cache_Tier | none (flat) |
| `fixture_node_to_subgraph.mmd` | **Platform (TB)** | — | YES — encapsulate |
| `fixture_rl_chain.mmd` | **Proc (RL)** | — | YES — encapsulate |
| `fixture_lr_subdir.mmd` | **Stack (TB), Flow (LR)** | — | YES — encapsulate (the direction probe) |
| `fixture_lr_nested.mmd` | **System, Frontend, Backend, UI (all LR)** — nested 0/1/2 deep | — | YES — multi-level |

**Decisive confirmation of the plan's core hypothesis:** the edge-dense "realistic"
locked fixtures (`fixture`, `fixture200`, `fixture_nested`, cyclic*) are
**all-external → stay flat → byte-identical** under the new code (they take the
retained flat path). Encapsulation engages only for the clean probes +
`fixture_node_to_subgraph`. The dir-flip-default risk is moot for the
direction-less locked fixtures because none of them are encapsulated.

TODO capture before the stage that needs them: `fixture_deep_5level`,
`fixture_lr_cyclic`, `fixture_bt_pipeline` (expect Build external → flat),
`fixture_crosscluster(_acyclic)`, `fixture_cyclic_nested_1/3/4`; and per-level
`"Graph after layout"` positions for the encapsulated probes.

## Stage progress

- **Stage 0 — Boot.** DONE. `npm install` in worktree (175 pkgs); `dagre-d3-es`
  resolves; `tsc --noEmit` clean; `vite build` passes on unchanged code.
- **Stage 1 — Plumb per-subgraph direction.** DONE. Added `IRSubgraph.direction?`
  (types.ts); parser-adapter stamps it from `rawSubgraph.dir` (undefined when
  undeclared, so the flip-default can fire). `tsc` clean; our-renderer still
  renders fixture.mmd (20 nodes, 2 subgraphs). Ground-truth dirs above confirm
  the values to honor (Stack→TB, Flow→LR, Proc→RL, Platform→TB, lr_nested→LR).
- **Stage 2 — Extract shared helpers + computeExternalConnections.** DONE.
  Created `layout-core.ts` (verbatim helpers + `computeExternalConnections` +
  a `scope`-parameterized `sortNodesByHierarchy` for Stage 3). `layout.ts` now
  imports them and re-exports the label helpers for renderer.ts; slimmed
  `reanchorClusterEdges` to use `computeExternalConnections`. `tsc`+build clean.
  **Verified BYTE-IDENTICAL** vs original code: node transforms match exactly on
  `fixture_cyclic_nested_3` (reanchor path) and `fixture_crosscluster` (16
  nodes, parallel externals).

- **Stage 3 — Recursive driver (structure + direction).** DONE. New
  `recursive-layout.ts` (`layoutRecursive`/`layoutCluster`); `layout.ts` gates to
  it only when every cluster is encapsulatable (no external cluster) and nothing
  pinned, else flat fallback. Shared `clipEdgeWaypoints` extracted to layout-core
  (flat path re-verified byte-identical: crosscluster, cyclic_nested_3).
  **Results vs Mermaid:**
  - `fixture_lr_subdir` ✓ — Stack stacks vertically (TB), Flow horizontal (LR),
    overall LR. **Per-subgraph-direction bug FIXED.**
  - `fixture_rl_chain` ✓ — Proc internal RL, and Proc below Audit / Audit on top,
    matching Mermaid. **Parallel-branch ordering bug FIXED.**
  - `fixture_node_to_subgraph` — structure correct (Platform TB); total span now
    matches Mermaid (ranksep fix). Residual: a diamond (Router) sits ~23px above
    center between its rect neighbours — **identical in the original flat code
    (5175)**, so pre-existing, not a regression; revisit in Stage 4 if needed.
  - No-regression: `fixture_crosscluster`, `fixture_reserve_fallback` byte-
    identical to 5175 (flat fallback for external-cluster graphs).
  **Two load-bearing discoveries (baked into recursive-layout.ts):**
  1. **Edge insertion order.** Mermaid's `adjustClustersAndEdges` removeEdge+
     setEdge's every cluster-touching edge → whole-cluster edges land LAST in
     each level's edge list. This flips dagre's barycenter tiebreak for parallel
     branches. Replicated via a stable partition (non-touching first). Without
     it, rl_chain's Proc came out on the wrong side.
  2. **ranksep bump.** An encapsulated cluster's OWN sub-layout uses
     `ranksep = parentRanksep + 25` (compounding with depth); root = 50; nodesep
     = 50 everywhere. (Mermaid recursiveRender 424-428 — bumps the CHILD graph,
     not the level containing the placeholder. Verified vs node_to_subgraph dump:
     Platform internal ranksep ≈ 75.)
  **Deferred:** `fixture_reserve_fallback`'s L1/L2 flip is an EXTERNAL cluster
  (Start→L2 leaf crossing) → not encapsulated → Stage 5 (cross-boundary).

- **Stage 4 — Nested encapsulation + sizing.** Nesting VERIFIED. `fixture_lr_nested`
  (System⊃{Frontend⊃UI, Backend}, 3 levels, all LR) — every level LR, correct
  containment (UI⊂Frontend⊂System), Backend right of Frontend. `fixture_deep_5level`
  (5 levels) renders with clean 20px-inset nesting, no NaN. Internal ranksep now
  matches Mermaid (Backend gap ⇒ ranksep 100 ✓).
  **Known sizing gap (documented, not chased):** our cluster placeholders use
  cluster-bbox.ts padding (content + 2·20 + 10), so clusters render MORE COMPACT
  than Mermaid, whose cluster nodes are larger (Backend 363×138 vs ours ~320×118;
  System 1263×264 vs ~1020×204) — Mermaid's cluster padding is larger and
  label-width-influenced (vertical ≈ +70, horizontal varies). Matching it exactly
  would require decoupling the placeholder size from the drawn-rect constant,
  which risks the locked flat fixtures (they share cluster-bbox.ts) and the
  drawn-rect==clip-target guarantee. Structure/direction/order are correct;
  nested PROBE fixtures (lr_nested, deep_5level) are visually more compact than
  Mermaid. The one LOCKED recursive fixture (node_to_subgraph) is close (total
  span matches).
- **Stage 5 — Mixed graphs: DESCOPED (deliberate).** Dump survey of encapsulation
  per fixture:
  - Fully-encapsulatable (→ recursive): `lr_subdir`, `rl_chain`,
    `node_to_subgraph`, `lr_nested`, `deep_5level`.
  - All-external (→ flat, byte-identical to baseline): `fixture`, `fixture200`,
    `fixture_nested`, `cyclic_nested_1/2`, `crosscluster(_acyclic)`,
    `reserve_fallback`, `bt_pipeline`, `shapes`.
  - **MIXED** (some encapsulated + some external): `cyclic_nested_3` (Mermaid
    encapsulates Productivity⊃Apps, keeps ControlPlane/DataPlane/ProdA/ProdB
    flat), and `cyclic_nested_4` (similar). These are LOCKED fixtures currently
    PASSING via the flat path. My gate (`any external → full flat`) keeps them
    fully flat = byte-identical to the passing baseline. Implementing partial
    encapsulation for them would risk regressing the locked cyc3/cyc4 checkpoints
    (Reviewer above Editor; Halt below Productivity; Exit beside DiamondScc) for
    NO bug-fix benefit (no catalogued bug lives in a mixed fixture). The truly-
    hard cross-boundary edges are between EXTERNAL clusters, which Mermaid ALSO
    lays out flat — handled by our proven flat path. → Mixed encapsulation NOT
    implemented; revisit only if a fixture forces it.
- **Stage 6 — Interactivity.** VERIFIED on the recursive path (deep_5level):
  collapse→expand round-trips (6 nodes/5 subs restored, no errors); drag pins a
  node → gate falls to flat → node moves, re-lays out, no crash/NaN; reset
  un-pins → recursive layout restored to the exact original position. Pinned-node
  strategy is the coarse form of the plan's (any pin → flat); reset recovers.

### Bugfix (post-review) — nested placeholder undersized (ROOT CAUSE, not fixture-specific)
Symptom (reported on `fixture_deep_5level`): the top-level `Root` node overlapped
the `Level 1` cluster rect and the `→Done` arrow ran behind it. Dagre's root
output was CORRECT (Root y8–47, L1 placeholder y97–788 height **691**, Done
below). But the DRAWN L1 rect was height **821** — 130px taller than the
placeholder dagre reserved — so it overflowed upward into Root.
Cause: I sized each cluster placeholder from its FLATTENED descendant leaves,
but `computeClusterBboxes` draws a cluster by enclosing its nested clusters'
PADDED bboxes — so padding compounds per nesting level in the drawn rect but not
in the placeholder. The §3 invariant (placeholder == drawn rect) held for
single-level clusters, broke for nested ones.
Fix (`recursive-layout.ts`): compute each level's content bbox from its DIRECT
members' rects (leaf node rects + nested-cluster PLACEHOLDER rects), not the deep
leaves. A nested cluster now contributes its full drawn extent. Placeholder ==
drawn rect at every level again. Verified: deep_5level Root now 70px above L1,
clean nesting, no overlap (screenshot + positions); single-level fixtures
unchanged (their direct members ARE their leaves); user confirmed no regression
across diagrams. NOTE: this is internal-consistency only — it does NOT change
that our clusters are more compact than Mermaid's (separate padding gap below).

### HANDOFF-1 RESOLVED (2026-05-31) — exact cluster-size parity
Stage 4's "known sizing gap" is now FIXED to pixel parity. Key correction: the
handoff (and Stage 4 above) assumed Mermaid DRAWS a small rect (content+20+10)
inside a larger reserved placeholder. Measuring Mermaid's rendered `.cluster
rect` (DOM `getAttribute`) disproves that — **Mermaid draws the full dagre
compound box** (Backend 363.31×138.38, System 1262.9×264). Drawn rect ==
placeholder == compound box; there is no small-rect-inside-big-box.

Law derived from Mermaid's `Graph after layout` dumps (exact across lr_nested /
node_to_subgraph / lr_subdir / rl_chain — 13 clusters) and confirmed against
@dagrejs/dagre border-node `sep()`:
- **rank-axis** half-margin (dagre rank direction) = `ranksep/2`
- **cross-axis** half-margin = `(nodesep+edgesep)/2 = 35` for a leaf/extracted-
  placeholder child; `edgesep = 20` when the sole child is a NON-extracted
  nested compound (dummy↔dummy borders, e.g. deep_5level L3 around L4 → +40).

Implementation (`recursive-layout.ts` + `cluster-bbox.ts`):
1. Each recursive cluster is sized by this law (direction-aware, symmetric about
   its content centre) for BOTH the parent placeholder AND the drawn rect.
2. The drawn rect is decoupled from the flat-path `CLUSTER_PADDING` via
   `ir.clusterMargins` (per-cluster half-margins): `computeClusterBboxes` applies
   them when present (NO label offset — label overlaps the top margin, as Mermaid
   draws it), else falls back to the legacy padding. The flat path leaves
   `clusterMargins` unset (cleared at top of `layout()`), so **flat fixtures are
   byte-identical** (verified crosscluster + cyclic_nested_3 vs :5175). All
   computeClusterBboxes consumers (renderer / edge-clip / drag / A*) get the big
   box automatically, so the whole-cluster edge clip target == the drawn border.
3. Non-extraction (deep_5level L4): replicated Mermaid's empirical rule — a SOLE
   leaf-only child cluster is NOT extracted; it stays a nested dagre compound in
   its parent's graph (shares parent ranksep, no +25; leaves laid flat there).
   Implemented via `nonExtracted`/`extracted` sets + an effective-parent that
   makes such clusters transparent to edge-LCA placement.

Follow-up (cosmetic): the cluster TITLE font was matched to Mermaid in
`renderer.ts` — 16px trebuchet / normal weight / #333 (was 12px bold #495057),
baseline `bbox.y + 18`. Title font does NOT affect layout (clusters are sized by
content+margins, not label width), so all positions are unchanged; the "▾"
collapse affordance is kept in the matching font. Applies to both paths.

Result: cluster sizes & node positions match Mermaid to the pixel on
node_to_subgraph, lr_subdir (Stack), rl_chain, deep_5level (all 5 clusters +
leaf spacing), and lr_nested (UI/Frontend). RESIDUAL: Backend/System (lr_nested)
and Flow (lr_subdir) are ~17–24px wider — traced to a PRE-EXISTING leaf-node
sizing diff (`sizeForShape` `rect` baseW=100 floors short labels like "API" at
100 vs Mermaid's 82.81). That constant is shared with the locked flat fixtures,
so it is out of scope here; the cluster *formula* is exact (the gap equals the
leaf-width delta, propagated). `tsc --noEmit` silent, `vite build` passes, no
console errors on any fixture.

### Remaining / deferred (honest status)
- `reserve_fallback` L1/L2 flip: its `Cluster` is FULLY external (Start→L2 leaf
  crossing) → flat in BOTH Mermaid and us; our flat reserve-fallback heuristic
  diverges from Mermaid's flat result. This is a pre-existing FLAT-PATH issue,
  not the flat-vs-recursive gap, and is not fixed by the recursive port.
- Cluster-size parity for nested clusters (Stage 4) — **DONE** (see above).
- Short-label `rect` baseW=100 vs Mermaid ~83 — pre-existing leaf-node sizing
  (shared with locked flat fixtures), surfaces as a few px on clusters whose
  width is driven by short-label rects. Out of HANDOFF-1 scope.
- Mixed-graph partial encapsulation (cyc3/cyc4) — intentionally flat.

### Before/after harness (established Stage 2)
- **Port 5175 = ORIGINAL pre-refactor code** (another checkout's dev server).
- **Port 5190 = this worktree** (`npx vite --port 5190 --strictPort`).
- Diff `our-renderer.html?fixture=…` node `transform`s between the two to detect
  regressions on the all-external (flat-path) fixtures, which MUST stay
  identical. Capture: sort `[data-node-id]` → `id:transform`, join, compare.

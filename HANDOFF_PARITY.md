# Handoff — Mermaid Layout Parity (Session 2026-05-22)

**Purpose:** capture every decision, dead-end, makeshift fix, and open question from the layout-parity session so the next agent or future-self can pick up where we left off without re-discovering anything.

**Scope:** layout-side parity between our `spike4/` flowchart renderer and Mermaid's reference renderer. Specifically: subgraph ranking on cycles, branch ordering inside subgraphs, and how those choices interact with our flat-graph `@dagrejs/dagre` pipeline.

**Author context:** Wrapping up Spike 4. Two architecture docs already exist at the repo root — `ARCHITECTURE.md` (the production architecture) and `SPIKE_NOTES.md` (history). This document supplements §6 of ARCHITECTURE.md with the messier conversation backstory and the unresolved trade-offs.

**Read these first:**
1. `ARCHITECTURE.md` §6 — the current state of layout-parity decisions.
2. `ARCHITECTURE.md` §16 — known limitations (this conversation's trade-offs should be added there).
3. `_bmad-output/planning-artifacts/prd.md` — product context.
4. `_bmad-output/planning-artifacts/architecture-decisions-renderer.md` — Decision 3 explicitly rules out reverse-engineering Mermaid's renderer. Relevant to the "should we port `adjustClustersAndEdges`?" question below.

---

## 1. The verified-and-locked facts

These are not opinions; they were verified in the session (mostly by reading source).

### 1.1 The two dagre packages implement the same cycle-breaking algorithm

- We use `@dagrejs/dagre` 3.0.0.
- Mermaid 11.14.0 uses `dagre-d3-es` 7.0.14.
- A verification subagent read both packages' `acyclic.js` / `acyclic.ts` and `greedy-fas.js`. They implement the **same** DFS-based feedback arc set, line-for-line (modulo lodash vs. native).
- Mermaid never sets `acyclicer: 'greedy'` — both packages run the same `dfsFAS` branch.
- **Therefore:** if both packages were fed the same `graphlib.Graph` they would reverse the same edges. The fork choice is NOT the source of any parity divergence.

### 1.2 The real source of divergence is Mermaid's preprocessing

Before calling `dagre.layout()`, Mermaid runs a substantial pipeline in `mermaid-graphlib.js` (compiled to `dist/chunks/mermaid.core/dagre-*.mjs`):

1. **`adjustClustersAndEdges`** — rewrites every cross-cluster edge so the endpoint becomes the cluster id, not the inner node.
2. **`extractor`** — recursively lifts each self-contained subgraph into its own nested `graphlib.Graph` and runs dagre **separately per nested graph** (deepest first). Each subgraph becomes a sized node in the parent's layout.
3. **`sortNodesByHierarchy`** — re-emits nodes in parent-then-children order before each dagre call.
4. **`rankdir` flip per subgraph** — sometimes flips TB↔LR on nested subgraphs.

`dfsFAS` walks nodes in `g.nodes()` insertion order and picks the first back-edge it hits per DFS branch. Mermaid's preprocessing changes both the edge set dagre sees AND the node order it walks, which flips which back-edge gets reversed — which flips which subgraph ranks above.

### 1.3 We do NOT replicate any of that preprocessing

We hand dagre a flat graph with `setParent()` hints for subgraph membership (`compound: true`). The whole point of the parity adapters in `layout.ts` is to nudge dagre's flat-graph output toward Mermaid's nested-graph output without porting the preprocessing.

### 1.4 Decision 3 of the PRD's renderer-research session

> *"If you're not changing the rendering behavior, use Mermaid's renderer. If you are, build your own from primitives — never by reverse-engineering Mermaid's."*

Porting any of `adjustClustersAndEdges` / `extractor` / `sortNodesByHierarchy` is on the wrong side of this line. Worth re-litigating only when the cost of NOT porting exceeds the cost of porting.

---

## 2. What we currently have in `layout.ts` (post-session)

Two adapter functions, both live-toggleable via `layoutSettings.mermaidParity` and the "Mermaid parity" button in `our-renderer.html`:

### 2.1 `chooseEdgesToReverseForMermaidOrder(ir): Set<IREdge>`

**Replaced an older per-edge BFS implementation that didn't generalise.**

Strategy:
1. Build inter-cluster digraph keyed on top-level subgraph ids.
2. Run iterative Tarjan's SCC.
3. For each SCC of size ≥ 2, pick a feedback arc set using this priority:
   - **If the SCC contains dotted edges (`-.->`)**, reverse only those. Mermaid treats dotted as conventional back-edge markers; preferring them matches Mermaid's behaviour on diagrams whose primary flow is one direction with dotted return paths (e.g. `fixture_crosscluster.mmd`).
   - **Otherwise** reverse every earlier→later inter-cluster edge in the SCC. After reversal all surviving edges point later→earlier, which dagre ranks as "later above earlier" — matches Mermaid on solid-only cycles (e.g. `fixture.mmd`).

Edges outside any SCC are left alone. Edge points are flipped back post-layout so rendering still sees the original direction.

### 2.2 `fixBranchOrderingPerSubgraph(g, ir)`

For each top-level subgraph: find the first branching node whose source AND first two declared targets all sit inside the subgraph; if dagre placed the first-declared target to the right of the second, mirror that subgraph's interior nodes (and intra-subgraph edge waypoints) around the local x-midpoint.

**CRITICAL CONSTRAINT (added as a makeshift fix this session):** the pass skips any cluster whose members participate in *any* inter-cluster edge. Reason in §3.3 below.

The flat-graph case (no subgraphs) still uses the original global `fixBranchOrdering` and `mirrorHorizontally` — unchanged.

---

## 3. The four fixtures and what each tests

Reference these by name when discussing layout behaviour.

| Fixture | Tests |
|---|---|
| `fixture.mmd` | Classic two-subgraph cycle (Authentication ↔ Payment_System via O→Q and T→M; both solid). The original case `chooseEdgesToReverseForMermaidOrder` was built for. **Regression target — must not break.** |
| `fixture_crosscluster.mmd` | Four top-level clusters (Frontend, Services, DataLayer, External) with two dotted back-edges (EventBus -.→ Cache, AnalyticsSvc -.→ Gateway) forming a single 4-cluster SCC. Dense-cycle stress case. |
| `fixture_crosscluster_acyclic.mmd` | Same diagram, back-edges removed. Control fixture. Verifies that without cycles, the flat-graph layout is structurally close to Mermaid. |
| `fixture_nested.mmd` | 4-level deep subgraph nesting under one top-level `Platform_Top`. Stresses flat-graph compound layout vs. Mermaid's per-subgraph extractor. **Has a known bug — see §3.4.** |

### 3.1 `fixture.mmd` — current state

- Pre-session: rendered correctly (Payment_System above Authentication; branch order correct).
- During session: agent's first attempt at `fixBranchOrderingPerSubgraph` REGRESSED this fixture (inter-cluster edges got visibly weird).
- Post-session (after CRITICAL CONSTRAINT added): back to working. Both clusters touch inter-cluster edges (O→Q, T→M, S→L) so the mirror skips them entirely; layout reverts to dagre's natural output for this case.

### 3.2 `fixture_crosscluster.mmd` — current state

- Pre-session: wildly divergent from Mermaid. All four clusters scattered, edges criss-crossing. Caused by the old per-edge BFS reversing wrong edges on the dense 4-cluster cycle.
- Post-session: SCC + dotted-edge preference reverses only the two `-.->` back-edges. Should now match Mermaid's Frontend→Services→DataLayer→External top-down ordering. **Not visually verified by the user yet** as of session end.

### 3.3 `fixture_crosscluster_acyclic.mmd` — current state

- Pre-session: structurally close to Mermaid (cluster ordering right). One cosmetic issue: Frontend Cluster's `Auth?` branch is mirrored (yes-branch lands on the wrong side vs. Mermaid).
- Post-session: **issue persists unfixed.** The `fixBranchOrderingPerSubgraph` mirror would correct it, but it skips Frontend Cluster because Frontend has many inter-cluster edges to Services/DataLayer/External. The CRITICAL CONSTRAINT (§3.5) prevents the fix.

### 3.4 `fixture_nested.mmd` — known crash

Originally crashed with `TypeError: Cannot set properties of undefined (setting 'rank')` from inside `@dagrejs/dagre`. Root cause: the fixture had `Entry --> Platform_Top` where `Platform_Top` is a subgraph id. **`@dagrejs/dagre`'s compound layout does not support edges where an endpoint is a compound node** (one with children via `setParent`). Mermaid handles this case via `adjustClustersAndEdges` rewriting; we don't.

Workaround applied in the fixture: edges were redirected to inner anchor nodes (`Entry --> PlatformIngress`, `PlatformExit --> Done`) to avoid the crash.

**This is a real production bug, not just a fixture mistake.** Any user diagram with `nodeA --> SomeSubgraph` syntax will crash our renderer. Two fixes available:
- **Quick:** detect such edges in `parser-adapter.ts` and remap to a synthetic anchor inside the cluster (~20 LOC, similar in spirit to `adjustClustersAndEdges` but minimal).
- **Loud:** drop or error-flag such edges.

Currently neither is implemented. Filed here for future work.

### 3.5 The CRITICAL CONSTRAINT and why it's makeshift

The per-subgraph mirror only mirrors interior **nodes** (and intra-cluster edge waypoints). Inter-cluster edge waypoints are NOT mirrored, because they cross the subgraph boundary — mirroring only the inside portion would tear the polyline at the boundary.

If we don't mirror anything but only flip node positions, the inter-cluster edges drawn by dagre still curve toward the OLD positions of inner nodes. `clipToBorder` re-anchors endpoint 0 and endpoint N, but the middle waypoints curve toward where the node used to be — producing visibly kinked edges.

To avoid this, the mirror skips any cluster with inter-cluster edges. In real architecture diagrams almost every cluster has inter-cluster edges (that's what subgraphs are for). So **the per-subgraph mirror is effectively dead code in production.**

This is the makeshift the user explicitly flagged. It's not a proper fix.

---

## 4. The unresolved big question: port `adjustClustersAndEdges`?

This came up multiple times in the session. The honest summary:

### 4.1 What porting would solve

- The `fixture_nested.mmd` crash (edges to subgraph ids).
- The Frontend Cluster mirror cosmetic issue (and any similar future ones).
- Probably 1-2 other parity issues we haven't discovered yet.

### 4.2 What porting costs

| Cost item | Estimate |
|---|---|
| Rewrite cross-cluster edge endpoints to cluster ids | ~50 LOC |
| Track "real" endpoint for rendering | ~20 LOC |
| Splice cluster-boundary → inner-node segment after layout | ~30-50 LOC |
| Update A* routing to know about endpoint rewriting | ~30 LOC |
| Update side-aware curves to know about endpoint rewriting | ~30 LOC |
| Update drag-time geometry to know about endpoint rewriting | ~30 LOC |
| Verify compound-mode + endpoint-on-cluster interaction works | ~hours of testing |
| **Total** | **~1-2 days careful work + visual verification per fixture** |

### 4.3 Why I (assistant) walked back two earlier optimistic claims

1. **"Maybe just port `adjustClustersAndEdges` as a middle ground, ~100-200 LOC."** I made this claim then walked it back when pressed. DFS-FAS is sensitive to node insertion order, which `sortNodesByHierarchy` controls — NOT `adjustClustersAndEdges`. Porting only the edge-rewrite without the node-ordering rewrite may trade one parity bug for another. **Not verified.** Anyone considering this needs to spike it properly with a fixture battery.

2. **"Skipping `clipToBorder` would simplify the port."** The user asked this; I checked and `clipToBorder` is used in three essential places (post-dagre endpoint fix, side-aware curves, arrowhead positioning). Skipping it isn't an option — edges would draw through node centers on every diagram. Saving the splice work is ~30-50 LOC out of a ~250-300 LOC port. Not the load-bearing cost.

### 4.4 Trigger conditions for revisiting

Don't port speculatively. Trigger conditions:

- **2+ real-user reports** of mirror or layout issues that the current adapters can't patch.
- **A user diagram with `node → subgraph` syntax** that we need to support (forces fixing the §3.4 crash either way).
- **Layout cost** at 500 nodes exceeds the 33ms p95 frame budget AND we determine that per-subgraph layout would be cheaper.

If any of those fire, do the port properly — with a fixture battery (the four above + 2-3 user-reported regressions) and visual verification per fixture before committing.

---

## 5. What the agent we ran in this session did

For full transparency to the next agent picking this up:

1. We invoked a subagent (general-purpose claude) to fix the cycle-breaking and per-subgraph mirror issues.
2. The agent replaced `chooseEdgesToReverseForMermaidOrder` with the Tarjan-SCC version (good — correct algorithmically, equivalent on `fixture.mmd`).
3. The agent added `fixBranchOrderingPerSubgraph` (well-intentioned — but introduced the regression on `fixture.mmd` because it didn't account for the inter-cluster-edge-waypoint problem).
4. The user reported the regression. The assistant (not the agent) then:
   - Added the dotted-edge preference to the SCC pass (real improvement — needed for `fixture_crosscluster.mmd`).
   - Added the CRITICAL CONSTRAINT guard to the per-subgraph mirror (makeshift — accepted because `fixture.mmd` was a hard regression and we ran out of session time).

**Honest lesson:** the agent honestly admitted in its report that it didn't visually verify. The assistant trusted the typecheck. Both were insufficient. Next time, force visual verification per fixture before declaring done.

---

## 6. Files touched in this session

| File | Change |
|---|---|
| `spike4/src/layout.ts` | Replaced `chooseEdgesToReverseForMermaidOrder` with Tarjan-SCC + dotted-edge preference. Added `fixBranchOrderingPerSubgraph` (with CRITICAL CONSTRAINT guard). |
| `spike4/src/astarSettings.ts` | Added `mermaidParity: boolean` and `edgeMode` field — user-toggleable parity switch. |
| `spike4/src/layoutSettings.ts` | (User-added during session.) Reads `mermaidParity` flag separately from astar settings. |
| `spike4/src/edgeSettings.ts` | (User-added during session.) Holds `edgeMode` separately from astarSettings. |
| `spike4/our-renderer.html` | Added "Mermaid parity" toggle button. |
| `spike4/fixture_nested.mmd` | New — 4-level nested subgraphs. Had to remove `Entry --> Platform_Top` and `Platform_Top --> Done` to avoid the §3.4 crash. |
| `spike4/fixture_crosscluster.mmd` | New — 4-cluster dense stress test with 2 dotted back-edges. |
| `spike4/fixture_crosscluster_acyclic.mmd` | New — control variant without back-edges. |
| `spike4/index.html` | Added new fixtures to the picker dropdown. |
| `ARCHITECTURE.md` | §6 updated with verified cause of parity divergence + SCC algorithm + dotted-edge preference. §16 limitations table updated. |
| `SPIKE_NOTES.md` | Created earlier in session. Covers Spikes 1-4. |
| `HANDOFF_PARITY.md` | This file. |

---

## 7. Immediate next-action options (pick at most one)

For the next agent or future-self deciding what to do:

| Option | Effort | Outcome |
|---|---|---|
| **A. Accept makeshift, document and move on** | 30 min | Add a row to `ARCHITECTURE.md` §16: "per-subgraph mirror disabled on clusters with inter-cluster edges; cosmetic mirror issue may appear on Frontend Cluster of `fixture_crosscluster_acyclic.mmd`; tracked for revisit." Move to other Wave 1.1 work. |
| **B. Mirror waypoints too (proper fix for the mirror)** | ~3 hours | Modify `fixBranchOrderingPerSubgraph` to mirror inter-cluster edge waypoint segments that fall inside the subgraph's bbox, and splice at the boundary. Remove the CRITICAL CONSTRAINT guard. Fixes Frontend Cluster mirror; doesn't address `fixture_nested.mmd` crash. |
| **C. Bias dagre with hidden weight edges (proper, no waypoint surgery)** | ~4-6 hours | Add hidden edges in `layout.ts` to bias dagre toward Mermaid's branch ordering naturally. No post-hoc mirror needed. Fixes Frontend Cluster mirror; doesn't address `fixture_nested.mmd` crash. |
| **D. Quick fix for `fixture_nested.mmd` crash only** | ~1 hour | In `parser-adapter.ts`, detect edges where an endpoint is a subgraph id; remap to a synthetic anchor inside the cluster. Doesn't address mirror issues. |
| **E. Full `adjustClustersAndEdges` port** | ~1-2 days | Read Mermaid's source, port the edge-rewrite + endpoint-tracking + rendering splice end-to-end. Update routing + side-aware + drag to handle rewritten edges. Visual-verify all four fixtures. Probably addresses everything in this doc. Highest risk-reward. |

**Recommendation (as of session end):** Option A unless real-user signal arrives. If real signal arrives, jump to Option E rather than incrementally trying B then C — the incremental path tends to accumulate more makeshift fixes that bridge to the eventual port anyway.

---

## 8. Anatomy of Mermaid's layout pipeline (for the eventual port)

If/when option E gets picked, this section is the starting reference. **All quoted line numbers are from `node_modules/mermaid/dist/chunks/mermaid.core/dagre-KV5264BT.mjs`** in Mermaid 11.14.0 — the compiled-but-non-minified chunk where the pipeline lives. Function names are preserved in that build, so grep works. Source-tree equivalents live in `mermaid/packages/mermaid/src/rendering-util/layout-algorithms/dagre/`.

### 8.1 The entry point

```js
// Top-level orchestrator. Called once per diagram.
render(data4Layout, element) {                     // line ~590
  ...
  // 1. Build the graphlib.Graph from parsed AST. Nodes are added with
  //    cluster (subgraph) parents via setParent(). Self-loop edges get
  //    expanded into a 3-edge cyclic-special construction so dagre doesn't
  //    crash on them — see lines ~640-670.
  graph.setEdge(edge.start, edge.end, { ...edge }, edge.id);

  // 2. Pre-process the graph to make it compound-layout-friendly.
  adjustClustersAndEdges(graph);                   // line 673

  // 3. Run dagre per subgraph (recursive) and render in one pass.
  await recursiveRender(element, graph, ...);      // line 676
}
```

There's no separate "layout then render" phase — `recursiveRender` does both, depth-first per cluster.

### 8.2 `findNonClusterChild(id, graph, clusterId)` — line 161

Helper. Walks down `graph.children(id)` until it finds a leaf node (one with no children of its own). Returns that leaf id. Used to pick the "anchor" leaf inside a cluster — the node that will become the visible endpoint of any external edge after rewriting.

**Why it's not just "first child":** prefers children that don't already have edges to/from the cluster (via `findCommonEdges`) — this avoids picking a leaf that's already a "special" anchor.

**Port cost:** ~15 LOC, straightforward recursion. Depends on having a `findCommonEdges` helper (~10 LOC).

### 8.3 `getAnchorId(id)` — line 181

Given an id that may be a cluster id, returns either:
- the leaf anchor id if `id` is a cluster with `externalConnections === true`,
- `id` unchanged otherwise.

This is the lookup `adjustClustersAndEdges` uses when rewriting edge endpoints: `v = getAnchorId(e.v); w = getAnchorId(e.w)`.

**Port cost:** ~10 LOC. Needs `clusterDb` to be populated first (see next section).

### 8.4 `adjustClustersAndEdges(graph, depth)` — line 193

The core preprocessing function. Three passes over the graph:

**Pass 1 (lines 200-212):** Find every cluster (node with children). Record its descendants (`descendants.set`) and its leaf anchor (`clusterDb.set(id, { id: anchor, clusterData })`).

**Pass 2 (lines 213-230):** For each cluster, scan all edges. If an edge has exactly one endpoint inside the cluster (XOR — `d1 ^ d2`), mark the cluster as `externalConnections: true`. This is the flag that determines whether the cluster's anchor gets used later.

**Pass 3 (lines 231-237):** Walk up the parent chain — if a leaf anchor's parent is also a cluster without external connections, hoist the anchor up. This produces a stable anchor that lives at the right depth for the rewriting to make sense.

**Pass 4 — the actual rewriting (lines 238-273):** For each edge `e.v → e.w`, if either endpoint is in `clusterDb`, call `getAnchorId` on both, remove the original edge, and re-add it as `anchor_v → anchor_w` with `fromCluster` / `toCluster` annotations on the edge data so the renderer can later draw the "last mile" back from anchor to the real cluster boundary.

**Then (line 275):** Recursively calls `extractor(graph, 0)` to lift extractable subgraphs into nested graphs.

**Port cost:** ~150 LOC for the four passes + ~50 LOC of supporting helpers (`isDescendant`, `extractDescendants`, `findCommonEdges`, the `clusterDb` and `descendants` Maps). The rewriting itself is mechanical; the load-bearing decisions are which leaf to pick as anchor and how to propagate the `externalConnections` flag.

### 8.5 `extractor(graph, depth)` — line 278

Recursively lifts clusters into their own nested `graphlib.Graph` instances.

For each node that is (a) a cluster, (b) has `externalConnections: false`, (c) has children, AND (d) has no parent itself:
1. Create a new `graphlib.Graph({ multigraph: true, compound: true })`.
2. Optionally flip `rankdir` — if parent is `'TB'`, child gets `'LR'` and vice versa (line 316). Overridable per-cluster via `clusterData.dir`.
3. `copy(node, graph, clusterGraph, node)` — recursively copy the cluster's contents into the new graph and remove from parent.
4. Replace the cluster node in the parent with `{ clusterNode: true, id, clusterData, label, graph: clusterGraph }`.

Then recurse into each new `clusterNode.graph`.

**Critical:** only clusters WITHOUT external connections get extracted into nested graphs. Clusters WITH external connections stay in the parent graph (because their members are referenced by edges crossing the boundary). This split is why `externalConnections` from `adjustClustersAndEdges` is load-bearing.

**Port cost:** ~80 LOC + the `copy()` helper (~40 LOC). The rankdir flip is a one-liner but matters for visual parity. Depth limit (10) is a safety bail.

### 8.6 `sortNodesByHierarchy(graph)` — line 382

Returns a flat list of node ids in parent-then-children order via a DFS-style recursion (`sorter` function, line 370). Used so that downstream rendering visits parents before children.

**This is the function whose output controls `dfsFAS`'s back-edge choice.** Because Mermaid calls `dagre.layout()` after rebuilding the graph in this order, dagre's internal node iteration walks in parent-then-children order — which changes which back-edge gets reversed when there's a cycle.

**Port cost:** ~15 LOC. Trivial in isolation; the work is making sure callers actually use it where it matters.

### 8.7 `recursiveRender(elem, graph, …)` — line 385

The layout-and-render driver. Per call:
1. Walk all nodes. For each node that's a `clusterNode`, recursively `recursiveRender` its nested graph — this lays out the inner cluster first and computes its bounding box.
2. Set the cluster node's `width/height` on the parent graph from the recursive render's bounds (`updateNodeBounds`).
3. Process edges (insert edge labels).
4. **Call `dagreLayout(graph)` on THIS level** — this is where the per-subgraph layout actually happens. Each nesting level gets its own dagre invocation, working on a smaller graph that treats inner clusters as single sized nodes.
5. Use `sortNodesByHierarchy(graph)` to position nodes parent-first.
6. Render edges (with `fromCluster` / `toCluster` annotations from §8.4 driving where the "last mile" segment ends).

**This is the part that changes layout semantics most dramatically vs. our flat single-call approach.** Each cluster's children are laid out as if the cluster were the whole world, then composed into the parent layout.

**Port cost:** ~200 LOC of orchestration + careful integration with our renderer (which currently expects one set of post-layout coords, not nested coords). This is also where the `subGraphTitleTotalMargin` adjustment lives (line 500) and other Mermaid-specific spacing knobs.

### 8.8 The data structures that hold everything together

- **`clusterDb: Map<clusterId, { id: anchorLeafId, clusterData, externalConnections?, node? }>`** — module-level Map. Populated by `adjustClustersAndEdges`, read by `extractor` and `recursiveRender`. **This Map is the central state.** Any port has to either replicate it or fold its contents into our IR.
- **`descendants: Map<clusterId, Set<descendantId>>`** — module-level Map of every leaf reachable under each cluster. Used by `isDescendant`.
- **`graph.edge(e).fromCluster / toCluster`** — annotations stamped onto edge data during rewriting. The renderer uses these to draw the "last mile" from the dagre-output endpoint (on the anchor leaf) back out to the original cluster boundary.

### 8.9 Total port estimate (refined from §4.2)

| Module | LOC | Notes |
|---|---|---|
| `findNonClusterChild` + `findCommonEdges` | ~30 | Trivial. |
| `getAnchorId` | ~10 | Trivial. |
| `adjustClustersAndEdges` (4 passes) | ~150 | Mechanical but careful flag propagation. |
| `clusterDb` + `descendants` state | ~20 | Either Map-on-IR or fold into IR shape. |
| `extractor` + `copy` + rankdir flip | ~120 | Needs nested-graph data model. |
| `sortNodesByHierarchy` + `sorter` | ~15 | Trivial. |
| `recursiveRender` orchestration | ~200 | Most of the work; integrates with our renderer. |
| Update `routing.ts` (A*) for rewritten edges | ~30 | Needs awareness of `fromCluster`/`toCluster`. |
| Update `renderer.ts` side-aware curves | ~30 | Same. |
| Update `drag.ts` drop-time geometry | ~30 | Same. |
| **Rendering splice** (anchor → cluster boundary) | ~50 | Per-shape geometry. |
| Visual verification on 4 existing fixtures + 2-3 new | ~hours | Don't skip. |
| **TOTAL** | **~700 LOC + 1-2 days testing** | Higher than the §4.2 estimate of ~250-300 LOC — that earlier estimate was too optimistic; it didn't account for `extractor`, `recursiveRender`, or the supporting helpers. |

### 8.10 Two pragmatic sub-options if the full port is too much

If the full port is too expensive but the current adapters keep failing, two intermediate options:

1. **Port only `adjustClustersAndEdges` + the rendering splice.** Skip `extractor`/`recursiveRender`. Keep our single flat `dagre.layout()` call but feed it the rewritten graph. **Untested.** May or may not produce Mermaid-equivalent rank order — `sortNodesByHierarchy` is what controls back-edge selection, and we wouldn't be running it. Walked back in §4.3 row 1; the optimism was unverified. ~250 LOC + spike to confirm it actually buys parity.

2. **Port only `sortNodesByHierarchy` + use it on our existing flat graph.** Add nodes to dagre in parent-then-children order before `g.setEdge` calls. This might flip dagre's back-edge choice without any other rewriting. ~30 LOC + spike. **Worth trying before the full port** — cheap experiment with high information value about whether the node-order change alone is enough.

If anyone picks this up, **Option 2 is the first thing to try.** It costs almost nothing and tells us whether the rest of the preprocessing is actually load-bearing or just incidental.

---

## 9. What the user explicitly cares about (from session)

- Wave 1.1 shipping the comprehension thesis (PRD-level).
- Visible parity with Mermaid's reference renderer on real architecture diagrams.
- NOT spending weekends reverse-engineering Mermaid internals unless the comprehension thesis demands it.
- Honest cost-benefit on every architectural change — the user explicitly pushed back on hand-waved estimates and made the assistant verify claims more than once this session.

When you (the next agent) report on this, **err on the side of "I'm not sure, here's what I'd need to verify"** rather than confident speculation. The session's two biggest mis-steps were both confident-sounding claims I had to walk back.

  Confirmed from the fork's list

  - #1 Two-pass dagre + reanchor — layout.ts:305–325
  - #2 Interior waypoint cull — layout.ts:373, 385
  - #3 Duplicate bbox — renderer.ts:1085 computeSubgraphBboxes vs layout.ts:545 clusterBboxFromIR are line-for-line duplicates. The constants PADDING = 20
  (renderer:34) and CLUSTER_BBOX_PADDING = 20 (layout:414) are two separate const = 20 declarations. Real silent-divergence risk.
  - #6 externalConnections substitution — layout.ts:469–470

  Additional findings the fork missed

  A. Drag preview ignores cluster annotations (renderer.ts:855 dragNode)
  buildSideAwareCurvesForNode and the 'dagre' branch (lines 877–902) compute drag-preview endpoints via clipToBorder on the leaf node — not clipToClusterRect on
  the cluster bbox. So when you drag a node connected to a cluster-anchored edge, the preview snaps to the leaf, then jumps back to the cluster border on the next
  layout. UX inconsistency.

  B. A* routing ignores cluster annotations (routing.ts:444, 479)
  routeEdge and routeEdgeOnSharedGrid route to the rewritten leaf endpoint. If A* is enabled while viewing the cyclic fixtures, the A*-routed path will terminate
  at the leaf, not the cluster border. The new clipping logic only fires in the dagre-baseline render path.

  C. ?dump=1 diagnostic still wired in (layout.ts:298–301 + dumpGraph at 581–596)
  The comment literally says "Remove once the fixture_nested / fixture200 divergence is understood" — and per the session notes, it was. Dead code that still runs
  on every layout when ?dump=1 is in the URL.

  D. Empty block scopes around setEdge (layout.ts:289–292, 319–322)
  Leftover { } from a refactor. Harmless but noise.

  E. Cluster annotations become dead in the collapsed-surrogate case (effective-ir.ts:88–97)
  When a cluster is collapsed, the edge gets remapped to a surrogate node, but fromCluster/toCluster still point at the original cluster id. clusterBboxFromIR then
   looks up the cluster, gets null (it's been filtered out of ir.subgraphs), and falls back to clipToBorder on the surrogate. Result is correct but the data flow
  is messy — and it depends on clusterBboxFromIR returning null rather than throwing. Fragile.

  F. O(N) ir.nodes.find inside hot loops (layout.ts:361–362, 553, renderer.ts:1097)
  Edge write-back does up to 4 linear scans of ir.nodes per edge. clusterBboxFromIR does another scan per child per cluster. The same file already builds nodeById
  as a Map at line 254 for the node insertion loop — the edge loop just doesn't reuse it. Not a parity bug; an inconsistency.

  G. clusterBboxFromIR doesn't memoize, the renderer's twin does (layout.ts:545 vs renderer.ts:1085)
  The renderer copy uses map.set to cache; the layout copy recomputes from scratch per edge. Same logic, different perf — would also be fixed by extracting one
  shared helper (#3).

  H. findNonClusterChild's reserve fallback (parser-adapter.ts:55)
  If every candidate child triggers findCommonEdges (would create a self-loop), the function returns the last reserved one — which IS a self-loop creator. This
  matches Mermaid's behavior, but it means dagre receives a degenerate edge in that pathological case. Not exercised by our fixtures, but worth flagging.

  I. Non-public Mermaid API surface (parser-adapter.ts:87)
  mermaid.mermaidAPI.getDiagramFromText is internal. No stability guarantee across Mermaid versions — silent breakage if Mermaid renames/refactors. The whole
  IR-extraction path is coupled to a private surface.

  J. sortNodesByHierarchy internal inconsistency (layout.ts:199–216)
  emitClusters uses the reversed subgraphsByParent map; emitLeaves iterates ir.subgraphs (declaration order) directly. The intent is documented in the comment at
  209–215 — but reading the two emit functions side-by-side, it looks like a bug. Worth refactoring to make the asymmetry explicit (e.g. pass an explicit order:
  'reversed' | 'declaration').

  Severity ranking

  Things that could silently produce wrong output:
  - #3 duplicate bbox + #G non-memoized layout twin — one edit to a constant in one file would break clip alignment.
  - A + B — drag and A* paths diverge from the static render's cluster-border treatment.

  Things that are correctness-by-accident:
  - E (surrogate fallback works because find returns undefined, not because the data flow makes sense)

  Pure cleanup:
  - C (dead diagnostic), D (empty braces), F/G (perf), J (readability).

  Real fragility:
  - I (private API surface) — out of scope of "makeshift" but worth knowing.

  The fork's "concentrated in #1+#2" framing still holds for architectural debt. The most actionable item remains #3 + #G + #F as one consolidation: extract the
  cluster-bbox helper to a shared module, memoize it, and pass it where needed. That closes the silent-divergence risk and the perf issue in one move.  Confirmed from the fork's list

  - #1 Two-pass dagre + reanchor — layout.ts:305–325
  - #2 Interior waypoint cull — layout.ts:373, 385
  - #3 Duplicate bbox — renderer.ts:1085 computeSubgraphBboxes vs layout.ts:545 clusterBboxFromIR are line-for-line duplicates. The constants PADDING = 20
  (renderer:34) and CLUSTER_BBOX_PADDING = 20 (layout:414) are two separate const = 20 declarations. Real silent-divergence risk.
  - #6 externalConnections substitution — layout.ts:469–470

  Additional findings the fork missed

  A. Drag preview ignores cluster annotations (renderer.ts:855 dragNode)
  buildSideAwareCurvesForNode and the 'dagre' branch (lines 877–902) compute drag-preview endpoints via clipToBorder on the leaf node — not clipToClusterRect on
  the cluster bbox. So when you drag a node connected to a cluster-anchored edge, the preview snaps to the leaf, then jumps back to the cluster border on the next
  layout. UX inconsistency.

  B. A* routing ignores cluster annotations (routing.ts:444, 479)
  routeEdge and routeEdgeOnSharedGrid route to the rewritten leaf endpoint. If A* is enabled while viewing the cyclic fixtures, the A*-routed path will terminate
  at the leaf, not the cluster border. The new clipping logic only fires in the dagre-baseline render path.

  C. ?dump=1 diagnostic still wired in (layout.ts:298–301 + dumpGraph at 581–596)
  The comment literally says "Remove once the fixture_nested / fixture200 divergence is understood" — and per the session notes, it was. Dead code that still runs
  on every layout when ?dump=1 is in the URL.

  D. Empty block scopes around setEdge (layout.ts:289–292, 319–322)
  Leftover { } from a refactor. Harmless but noise.

  E. Cluster annotations become dead in the collapsed-surrogate case (effective-ir.ts:88–97)
  When a cluster is collapsed, the edge gets remapped to a surrogate node, but fromCluster/toCluster still point at the original cluster id. clusterBboxFromIR then
   looks up the cluster, gets null (it's been filtered out of ir.subgraphs), and falls back to clipToBorder on the surrogate. Result is correct but the data flow
  is messy — and it depends on clusterBboxFromIR returning null rather than throwing. Fragile.

  F. O(N) ir.nodes.find inside hot loops (layout.ts:361–362, 553, renderer.ts:1097)
  Edge write-back does up to 4 linear scans of ir.nodes per edge. clusterBboxFromIR does another scan per child per cluster. The same file already builds nodeById
  as a Map at line 254 for the node insertion loop — the edge loop just doesn't reuse it. Not a parity bug; an inconsistency.

  G. clusterBboxFromIR doesn't memoize, the renderer's twin does (layout.ts:545 vs renderer.ts:1085)
  The renderer copy uses map.set to cache; the layout copy recomputes from scratch per edge. Same logic, different perf — would also be fixed by extracting one
  shared helper (#3).

  H. findNonClusterChild's reserve fallback (parser-adapter.ts:55)
  If every candidate child triggers findCommonEdges (would create a self-loop), the function returns the last reserved one — which IS a self-loop creator. This
  matches Mermaid's behavior, but it means dagre receives a degenerate edge in that pathological case. Not exercised by our fixtures, but worth flagging.

  I. Non-public Mermaid API surface (parser-adapter.ts:87)
  mermaid.mermaidAPI.getDiagramFromText is internal. No stability guarantee across Mermaid versions — silent breakage if Mermaid renames/refactors. The whole
  IR-extraction path is coupled to a private surface.

  J. sortNodesByHierarchy internal inconsistency (layout.ts:199–216)
  emitClusters uses the reversed subgraphsByParent map; emitLeaves iterates ir.subgraphs (declaration order) directly. The intent is documented in the comment at
  209–215 — but reading the two emit functions side-by-side, it looks like a bug. Worth refactoring to make the asymmetry explicit (e.g. pass an explicit order:
  'reversed' | 'declaration').

  Severity ranking

  Things that could silently produce wrong output:
  - #3 duplicate bbox + #G non-memoized layout twin — one edit to a constant in one file would break clip alignment.
  - A + B — drag and A* paths diverge from the static render's cluster-border treatment.

  Things that are correctness-by-accident:
  - E (surrogate fallback works because find returns undefined, not because the data flow makes sense)

  Pure cleanup:
  - C (dead diagnostic), D (empty braces), F/G (perf), J (readability).

  Real fragility:
  - I (private API surface) — out of scope of "makeshift" but worth knowing.

  The fork's "concentrated in #1+#2" framing still holds for architectural debt. The most actionable item remains #3 + #G + #F as one consolidation: extract the
  cluster-bbox helper to a shared module, memoize it, and pass it where needed. That closes the silent-divergence risk and the perf issue in one move.
# Handoff 3 — `fixture_reserve_fallback` sibling order flipped vs Mermaid

**Status:** deferred, pre-existing. This is a FLAT-PATH quirk, **not** the
flat-vs-recursive gap — the recursive port doesn't touch it. The catalogued
"parallel-branch ordering" bug had two instances; `fixture_rl_chain` is fixed by
the port, this one is not (its cluster is fully external, so Mermaid lays it out
flat too — our flat result just differs from Mermaid's flat result).
**Risk:** Medium. Changing flat-path anchor/edge handling can ripple into the
cyclic fixtures, which depend on the current behavior.
**Read first:** `README.md` (engine + harness).

## Problem

`fixture_reserve_fallback.mmd`:
```
flowchart TD
    Start --> Cluster
    Start --> L2
    subgraph Cluster
        L1
        L2
    end
    Cluster --> T1
    Cluster --> T2
    L1 --> T1
    L2 --> T2
```
Mermaid renders **L2 on the LEFT, L1 on the RIGHT**. We render the opposite:
`L1@(43,137)` (left), `L2@(193,137)` (right) — flipped. (Captured on both `:5190`
and the original `:5175`, so the port did not change it.)

## Root cause (already traced)

`Cluster` is **fully external** (`L1 --> T1` and `L2 --> T2` cross the boundary →
`externalConnections = true`), so it is NOT encapsulated — flat in BOTH Mermaid and
us. The flip comes from the **reserve-fallback anchor**: `Cluster --> T1`,
`Cluster --> T2`, and `Start --> Cluster` all rewrite their `Cluster` endpoint to
the same anchor leaf `L1` (via `findNonClusterChild` in `parser-adapter.ts`). That
gives `L1` extra phantom connectivity, which pulls it across in dagre's ordering.
`reanchorClusterEdges` can't rescue it because the cluster is external (its
extremal-leaf correction is skipped for external clusters by design).

So our dagre INPUT for this fixture differs from Mermaid's in a way that flips the
`L1`/`L2` barycenter — even though both run flat. The fix must make our flat dagre
input match Mermaid's for this shape.

## Where to investigate

1. **Diff the dagre input vs Mermaid.** Capture Mermaid's root `"Graph before
   layout"` for this fixture (node order + edge list, post-`adjustClustersAndEdges`)
   and compare to ours. Look specifically at:
   - which anchor leaf each `Cluster`-endpoint edge resolves to (Mermaid's
     `getAnchorId` / `findNonClusterChild` vs ours),
   - the node insertion order of `L1` vs `L2`,
   - the edge insertion order.
   Our `findNonClusterChild` + `findCommonEdges` in `parser-adapter.ts` are meant to
   be a byte-mirror of Mermaid's (`dagre-KV5264BT.mjs` lines 147-180). Verify they
   still match for THIS input — the `vertexOrder` (first-appearance) sort of leaf
   children is load-bearing (see the long comment in `findNonClusterChild`).
2. **Note the parse order subtlety.** `L2` appears as an edge endpoint (`Start --> L2`)
   on line 3, BEFORE the `subgraph Cluster` block declares `L1 L2`. So `L2`'s
   first-appearance index is earlier than `L1`'s. `findNonClusterChild` already
   sorts leaf children by `vertexOrder` for this reason. Confirm the resulting
   anchor matches Mermaid (the in-code comment claims Mermaid picks `L1` here via
   reserve-fallback — verify against a fresh dump, since that's the crux).

## Likely fix locations
- `src/parser-adapter.ts` — `findNonClusterChild` / `findCommonEdges` (anchor pick)
  and the `vertexOrder` construction. The mismatch is most likely here or in the
  edge set fed to dagre.
- `src/layout.ts` — flat-path node/edge insertion order (`sortNodesByHierarchy`,
  the `g.setEdge` loop) if the divergence is in ordering rather than the anchor.

## Acceptance criteria
- `fixture_reserve_fallback` matches Mermaid: **L2 left, L1 right** (compare
  side-by-side `index.html` and Mermaid's `"Graph after layout"` x of L1 vs L2).
- **No regression anywhere else** — re-run the full locked list against `:5175`,
  especially the cyclic fixtures (`cyclic_nested_1..4`) and `fixture_crosscluster`,
  which exercise the same `findNonClusterChild` reserve-fallback path. These MUST
  stay byte-identical.
- `tsc --noEmit` silent, `vite build` passes.

## Risks / gotchas
- The Mermaid `findCommonEdges` "typo" (`edge.w === id1 ? id1 : edge.w`) is
  **intentionally preserved** for parity — do not "fix" it without a dump proving
  Mermaid changed.
- Preserve the `fromCluster`/`toCluster` invariant.
- This shape is pathological (reserve-fallback collisions). Make sure any change is
  driven by matching Mermaid's actual dagre input for THIS fixture, not by a
  heuristic that happens to flip this one case (a fixture-specific hack will likely
  break a cyclic fixture). Validate the anchor choice against Mermaid for cyc2/cyc4
  too (their anchors — Cache_Lookup, D_Source — are documented in `layout.ts`).

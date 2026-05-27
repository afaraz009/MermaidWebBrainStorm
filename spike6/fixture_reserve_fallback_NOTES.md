# fixture_reserve_fallback — Notes

## What this fixture tests

It deterministically exercises the **reserve fallback** in `findNonClusterChild`
(`src/parser-adapter.ts:44–55`). That path is taken when *every* candidate leaf of
a cluster would create a common-edge conflict (`findCommonEdges` returns non-empty),
so the function exhausts the loop and returns the last `reserve` value instead of a
clean leaf.

In this fixture `Cluster` has two leaves (L1, L2). L1 shares target T1 with the
cluster; L2 shares target T2 with the cluster. Neither leaf is "clean", so `reserve`
ends up as `"L2"` and is returned as the anchor for the incoming `Start --> Cluster`
edge.

## Expected degenerate edge after rewrite

The edge `Start --> Cluster` is rewritten to `Start --> L2`.
The fixture also contains an explicit `Start --> L2` edge.
Both produce identical dagre `setEdge("Start", "L2")` calls with no `name` key.
dagre's `setEdge` is not additive — the second call **overwrites** the first.
One edge's label/style is silently lost; dagre's graph ends up with only one
`Start → L2` arc instead of two visually distinct edges.

## What to look for in the comparison

**Mermaid reference render**
- Does Mermaid draw *two* separate arrows from `Start` to `L2`?  
  (It may, because Mermaid's own post-processing might assign unique `name`s.)
- Does the `Start → Cluster` arrow survive, or does Mermaid route it differently?
- Are `Cluster → T1` and `Cluster → T2` drawn as cluster-level arrows or dropped?

**Our renderer**
- Expect to see only *one* `Start → L2` arrow (the duplicate was overwritten).
- `Cluster → T1` / `Cluster → T2` may route oddly or disappear — they are
  compound-node edges that dagre does not support natively.
- L2 may appear to have an unusually high fan-in (Start + cluster rewrite both
  land on it).

**Likely visible artifacts**
- A missing or merged arrow between `Start` and `L2`.
- `Cluster → T1` or `Cluster → T2` rendered outside/through the subgraph box.
- Any layout asymmetry between the two renders is a parity signal.

## How to open the comparison

```
http://localhost:5175/index.html?fixture=fixture_reserve_fallback.mmd
```

(Port may differ — check your Vite dev-server output. Both the Mermaid reference
panel and our renderer panel are on the same page.)

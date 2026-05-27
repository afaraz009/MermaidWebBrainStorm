# Reserve-fallback duplicate-edge collision — investigation handoff

## Hypothesis confirmed / refuted

**Confirmed.** Mermaid passes a unique `edge.id` as the fourth argument to
`graph.setEdge`, exploiting dagre's `multigraph: true` mode. Our `g.setEdge`
call at `spike6/src/layout.ts:300` omits the name and therefore overwrites
duplicate `(v, w)` pairs.

## How Mermaid names edges

`node_modules/mermaid/dist/chunks/mermaid.core/dagre-KV5264BT.mjs:669`
(inside `render`, in the per-edge loop):

```js
data4Layout.edges.forEach((edge) => {
  if (edge.start === edge.end) { /* cyclic-special-* split */ }
  else {
    graph.setEdge(edge.start, edge.end, { ...edge }, edge.id);   // ← 4th arg
  }
});
```

`edge.id` is assigned in the flow parser at
`node_modules/mermaid/dist/chunks/mermaid.core/flowDiagram-DWJPFMVM.mjs:295-307`:

```js
if (id && !this.edges.some((e) => e.id === id)) {
  edge.id = id;
  edge.isUserDefinedId = true;
} else {
  const existingLinks = this.edges.filter((e) => e.start === edge.start && e.end === edge.end);
  if (existingLinks.length === 0) {
    edge.id = getEdgeId(edge.start, edge.end, { counter: 0, prefix: "L" });
  } else {
    edge.id = getEdgeId(edge.start, edge.end, { counter: existingLinks.length + 1, prefix: "L" });
  }
}
```

So every Mermaid edge gets a globally unique id like `L_Start_Cluster_0`,
`L_Start_L2_1`, … and that id is the dagre multigraph `name`.

The other Mermaid `setEdge` sites are consistent: `dagre-KV5264BT.mjs:115`
(`newGraph.setEdge(edge.v, edge.w, data2, edge.name)` during cluster
extraction) and lines 665-667 (cyclic-special split) all pass a name.
**Mermaid never calls `setEdge` without a name.**

## Dagre multigraph behavior

`node_modules/dagre-d3-es/src/graphlib/graph.js:852-913` (`setEdge`):

```js
var e = edgeArgsToId(this._isDirected, v, w, name);
if (Object.prototype.hasOwnProperty.call(this._edgeLabels, e)) {
  if (valueSpecified) {
    this._edgeLabels[e] = value;        // ← OVERWRITES the label
  }
  return this;                           // ← does NOT add a second edge
}
```

`edgeArgsToId` (same file, line 1125-1134) keys edges by
`v + DELIM + w + DELIM + (name ?? DEFAULT_EDGE_NAME)`.

Concretely:
- `multigraph: true`, no `name` → `name=DEFAULT_EDGE_NAME` for every call →
  second `setEdge(v, w, …)` enters the `hasOwnProperty` branch and just
  updates the label. Edge count stays at 1.
- `multigraph: true`, unique `name` per call → distinct keys, both edges
  coexist (`_edgeCount++` runs both times). This is exactly what the
  docstring at lines 152-160 of the same file advertises.

Also confirmed: `g.edge(v, w)` at line 941-947 with no `name` argument fetches
only the `DEFAULT_EDGE_NAME` slot, so a graph populated with named multiedges
would return `undefined` for that call.

## Proposed fix

The IR doesn't currently carry an edge id, so the minimum change is to
synthesize a position-based unique name at the call site. Two `setEdge`
sites in `spike6/src/layout.ts` (lines 300 and 320) and the read-back at line
361 need to agree on the same name.

**Edit at `spike6/src/layout.ts:298-301`** (and the parallel block at 318-321
inside the re-anchor branch):

```ts
for (let i = 0; i < ir.edges.length; i++) {
  const e = ir.edges[i];
  const { w, h } = e.label ? edgeLabelSize(e.label) : { w: 0, h: 0 };
  g.setEdge(e.from, e.to, { label: e.label || '', weight: 1, width: w, height: h }, `L_${i}`);
}
```

**Ripple at `spike6/src/layout.ts:360-361`** — the write-back loop must read
back the same named edge:

```ts
for (let i = 0; i < ir.edges.length; i++) {
  const e = ir.edges[i];
  const ge = g.edge(e.from, e.to, `L_${i}`);
  …
}
```

(Or factor `edgeName(i)` into a helper.) Using a synthesized `L_<index>` is
sufficient for dagre uniqueness; we don't need to reproduce Mermaid's
`L_<start>_<end>_<counter>` format because the name is internal to dagre and
never leaves layout.ts.

No other sites in `spike6/src` touch `g.setEdge`, `g.edge(…)`, `g.removeEdge`,
or `g.edges()` for label reads (`g.edges()` at line 317 just iterates EdgeObjs,
which already carry `.name` and round-trip cleanly through `removeEdge(e)`).

Optionally: add `id?: string` to `IREdge` and stamp it in parser-adapter so
the name is stable across re-runs. Not required for parity, just cleaner.

## Regression risk per fixture

For naming-introduced regressions to bite, a fixture would need either (a)
two source edges with identical `(from, to)` after rewrite, or (b) downstream
code relying on `g.edge(v, w)` returning the unnamed slot. (b) is fixed by
the layout.ts:361 ripple above. (a) survey:

- `fixture.mmd` — leaf-to-leaf edges only, all unique pairs. No risk.
- `fixture_crosscluster.mmd` — labeled cross-cluster edges; each `(from,to)`
  pair appears once. No risk. Currently named would simply preserve current
  layout (only ONE edge per pair, named instead of unnamed — same edge count).
- `fixture_crosscluster_acyclic.mmd` — same as above, two back-edges
  removed. No risk.
- `fixture_node_to_subgraph.mmd` — `Entry→Platform`, `Platform→Done` rewrite
  to different leaves; `Ingress→Router`, `Router→Egress` are unique. No risk.
- `fixture_nested.mmd` — all edges between unique leaf pairs. No risk.
- `fixture200.mmd` — no edge with a subgraph id as endpoint (verified by
  pattern search: none of the 24 subgraph ids appears as an edge endpoint).
  All edges already use leaf ids, so rewriting can't introduce collisions.
  No risk.
- `fixture_cyclic_nested_1.mmd` — `Start→Outer_Entry` rewrites nothing
  (Outer_Entry is a leaf). `Outer_Exit→Finish` likewise. No cluster
  endpoints → no rewrite-induced duplicates. No risk.
- `fixture_cyclic_nested_2.mmd` — `Ingress→API_Layer` and `API_Layer→Egress`
  rewrite to leaves inside API_Layer; the leaves picked are different from
  any explicit edges touching them. No risk.
- `fixture_cyclic_nested_3.mmd` — `Productivity→Halt` and
  `DP_Reporter→Productivity` rewrite to Productivity's anchor leaf; that
  leaf has no other edge to Halt or from DP_Reporter. No risk.
- `fixture_cyclic_nested_4.mmd` — `Start→Pipeline` and `Pipeline→Done`
  rewrite to D_Source (Pipeline's anchor per the existing comment); D_Source
  has no other edge to/from Start or Done. No risk.

In other words: the fix is **conservatively neutral** on every currently-
matching fixture, because none of them produce duplicate `(from, to)` pairs
after rewrite. The fix only changes behavior on the
reserve-fallback fixture where a duplicate currently silently disappears.

## L1/L2 mirror analysis

**Downstream symptom, not a separate bug** — high confidence.

Reasoning: in the current code, the rewrite produces only 3 distinct edges
(`Start→L2`, `L2→T1`, `L2→T2`) because the collisions ate the others. Inside
the `Cluster` subgraph, L1 has effectively *one* edge after collision
(`L1→T1`), while L2 has *three* (`Start→L2`, `L2→T1`, `L2→T2`). Dagre's
barycenter sorter uses edge degree + connected-neighbor barycenters as the
primary signal; L2 ends up "heavier" and gets pulled to whichever side
matches T1/T2's induced order — putting L2 left-of-L1.

In Mermaid, with all 6 edges intact, L1 has 2 incident edges (`L1→T1` plus
the rewrite of `Cluster→...` reaching it via a different anchor) and L2 has
3, but more importantly Start has two outgoing edges to the cluster (Start→
Cluster, Start→L2). The barycenter math for the cluster's children is
materially different, and Mermaid's layout converges on L2-left/L1-right.

`sortNodesByHierarchy` (`layout.ts:167-232`) only governs **node insertion
order** into dagre — it doesn't reorder within-cluster siblings except by
declaration order. For Cluster's children [L1, L2] declaration order is
L1-first, L2-second; that's the same in both Mermaid and ours, so the
mismatch can't be coming from there. It's coming from barycenter input.

Recommendation: implement the duplicate-edge fix first, re-run the fixture,
and re-verify L1/L2 visually. I expect the mirror to resolve as a side
effect. If it doesn't, that becomes a separate, narrower investigation.

## Open questions

1. **Edge id stability across re-runs.** The re-anchor pass at `layout.ts:316-323`
   removes ALL edges and re-adds them. Using `L_${i}` based on `ir.edges`
   index keeps names stable across the two passes. Confirm there's no other
   code path that mutates `ir.edges` length between the two `setEdge` loops.
   (Quick scan: `reanchorClusterEdges` only mutates `e.from`/`e.to`, not the
   array. Looks safe.)

2. **Should we stamp `IREdge.id` in `parser-adapter.ts` and pass that through
   instead of `L_${i}`?** Cleaner, future-proof if any caller starts depending
   on stable identity, but a strictly larger change. Defer unless you want it.

3. **The `findCommonEdges` typo (`parser-adapter.ts:72`) intentionally
   mirrors Mermaid's bug.** With the duplicate-edge fix landed, does the
   reserve-fallback still get triggered, or does Mermaid's full edge set
   change the anchor pick to L1 (and our typo-mirrored adapter follow)? If
   reserve fallback no longer fires, we get L1 as anchor, which matches the
   visual mirror (L2-left/L1-right after barycenter). Worth re-running
   parse output after the fix to compare.

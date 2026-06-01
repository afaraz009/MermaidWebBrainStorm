# 05 — Invariants & Parity

[← architecture index](README.md)

> **TL;DR.** A handful of invariants keep this engine correct and Mermaid-faithful;
> break one and a fixture silently drifts. The big ones: **`fromCluster`/`toCluster`
> always equal the pre-rewrite original endpoint (or are absent)**; **an edge's
> identity is `id`, never `(from,to)`**; **cluster-child order must match Mermaid's
> `graph.children()`**; and **a recursive placeholder must equal the rect that gets
> drawn**. Parity is verified not by eyeballing but against **Mermaid's own internal
> logs** (`mermaid-debug.html` → `window.__dump`). A short list of cosmetic gaps is
> knowingly deferred.

---

## 1. Load-bearing invariants

### I1 — `fromCluster` / `toCluster` == the original endpoint (or absent)
**Statement.** When present, these always equal the subgraph id the endpoint was
rewritten *from*; absent means the edge had a leaf endpoint to begin with.
**Where.** Stamped in `parser-adapter.ts:232`. The canonical statement is the boxed
comment above `reanchorClusterEdges` (`layout.ts:245`).
**Why / what breaks.** They drive: the `externalConnections` classification (a false
negative re-routes a cluster edge wrongly — e.g. cyc3's Halt drifts off its cluster);
the edge clip target (falls back to the leaf outline); the drag preview (line snaps to
the leaf); A* trim (path ends on the leaf, not the border); and the **disclosure overlay's
logical-endpoint adjacency** (`fromCluster ?? from`), which is what lets focus/path treat a
whole-cluster edge as a route waypoint (lit container) instead of an arbitrary leaf.
**Rule.** Any pass that rewrites `e.from`/`e.to` must **preserve or explicitly clear**
these. Known maintained sites: `effective-ir.ts:131` (clears on the remapped side only).
Add new sites to that comment block.

### I2 — Edge identity is `id`, not `(from,to)`
**Statement.** Two edges can legitimately share a `(from,to)` pair (reserve-fallback in
`findNonClusterChild` rewrites a cluster endpoint to a leaf that's already an explicit
endpoint elsewhere — see `fixture_reserve_fallback`).
**Where.** `types.ts:35` (the `id` comment); the renderer keys on `data-edge-key = e.id`;
both layout engines pass `e.id` as dagre's **multigraph edge name** so duplicates aren't
silently overwritten.
**What breaks.** Key on `(from,to)` anywhere and you lose an edge whenever this collision
happens.

### I3 — Cluster-child order matches Mermaid's `graph.children()`
**Statement.** Nested **subgraphs in reverse declaration order**, then **leaves in
vertex-first-appearance order**.
**Where.** `findNonClusterChild` (`parser-adapter.ts:54`); `sortNodesByHierarchy` and
`copyOrder` in the layout engine.
**Why / what breaks.** This order drives dagre's barycenter tie-breaks and `dfsFAS`
cycle-break edge choice. Get it wrong and parallel branches swap sides or a cycle breaks
on the wrong edge (the cyc3/cyc4 and `fixture_reserve_fallback` parity cases). See the
memory note *"Mermaid children() order"*.

### I4 — Placeholder == drawn rect, at every recursive level
**Statement.** The recursive driver sizes each cluster placeholder to *equal* the rect
`computeClusterBboxes` will later derive for it.
**Where.** `recursive-layout.ts` margin recording ↔ `cluster-bbox.ts` precedence.
**What breaks.** If they diverge, a cluster lays out at one size and draws at another;
nested clusters and edge clips desync. Keep them equal unless a task explicitly changes
the model.

### I5 — `cluster-bbox.ts` is the single source of truth for cluster rects
**Statement.** Renderer outline, edge clip target, drag preview, and A* trim all read
the **same** `computeClusterBboxes(ir)` output; the padding constants are single-sourced
in that file.
**What breaks.** Duplicate the padding math anywhere and the drawn border silently
diverges from the edge clip point.

### I6 — `layout()` clears recursive artefacts at entry
**Statement.** `ir.clusterMargins`, `ir.clusterRects`, and every `e.labelPos` are cleared
at the top of `layout()` (`layout.ts:50`).
**Why.** A graph that flips **recursive → flat** (e.g. the user pins a node) must not read
stale margins/rects/label coords the flat path never produces.

### I7 — The flat path stays byte-identical
**Statement.** The legacy flat dagre body (`layout.ts:76+`) must not change behaviour;
the locked fixtures depend on it.
**How to check.** A sibling dev server on `:5175` serves the pre-port code as a baseline;
compare it against `:5190` for the flat fixtures (§2).

---

## 2. Parity methodology — verify against Mermaid's internals, not your eyes

Parity here means matching **Mermaid's own dagre output**, read from its internal logs —
not "looks about right."

**Harness** (`mermaid-debug.html?fixture=NAME.mmd`): renders with Mermaid at
`logLevel:'info'` and tees every `log.*` into `window.__dump`. Useful markers (read via
Playwright `browser_evaluate`):

| Marker | Tells you |
|---|---|
| `"Cluster without external connections, … <ID>"` | which clusters Mermaid **encapsulates** |
| `"Fixing dir <A> <B>"` | the **direction** Mermaid chose for an encapsulated cluster |
| `"Graph after layout: {…}"` | per-level node `x/y/width/height` (graphlib JSON; deepest level first, root last) |
| `"Graph before layout: {…}"` | per-level node + edge **insertion order** |

**Compare panes:** `index.html?fixture=NAME.mmd` = Mermaid (left) vs ours (right). Capture
our positions from `[data-node-id]` transforms (remember: top-left, [03](03-rendering-and-edges.md) §2),
or read `mountEl.__meta.ir` directly.

**Locked fixtures that must not regress** (compare `:5190` vs `:5175`, byte-identical):
`fixture`, `fixture200`, `fixture_crosscluster(_acyclic)`, `fixture_nested`,
`fixture_cyclic_nested_1..4`, `fixture_node_to_subgraph`, `fixture_shapes`,
`fixture_reserve_fallback`. Spot-check checkpoints: cyc2 Router bottom-left / Response
right; cyc3 Reviewer above Editor / Halt below Productivity; cyc4 Exit beside DiamondScc
/ Done below Pipeline; fixture_nested Cache-left / Primary-right in Storage_L2.

> Playwright is **opt-in** per `CLAUDE.md`; it was authorised for this work because
> dump-driven verification is the only reliable parity check. Confirm with the user
> before using it. The full reusable how-to is the memory note
> *"Mermaid debug harness"*.

---

## 3. Known gaps & deferred items (cosmetic, non-blocking)

These are tracked and intentionally **not** fixed — none is an architecture risk. The
full closure rationale is in [`spike6/SPIKE6_COMPLETE.md`](../../spike6/SPIKE6_COMPLETE.md) §5.

| Gap | Detail | Status |
|---|---|---|
| **+18px container width** | Outer/container clusters ~18px wider than Mermaid; `crossHalfFor` keys on `extracted` (empty in all-external). Bleeds +18 dx onto some labels. | Deferred |
| **`fixture_crosscluster` x-offset** | Pre-existing ~190px node-layout x-divergence on this one fixture, independent of labels. | Deferred |
| **Issue B — internal ranksep** | Internal spacing on some flat clusters marginally tighter than Mermaid. | Deferred |
| **Per-subgraph direction (flat path)** | A nested subgraph declaring a different direction than the top level is a flat-path-only gap (`fixture_lr_subdir`). The recursive path honours per-cluster direction. | Known limitation |

---

## 4. Where the decision trail lives

- **`spike6/RECURSIVE_LAYOUT_LOG.md`** — the full chronological decision log for the
  recursive port (HANDOFF-1…4 resolutions, root-cause analyses).
- **`spike6/handoffs/`** — the original task specs (HANDOFF-1, -2, -4 resolved; README
  has the index). Superseded for status by `SPIKE6_COMPLETE.md`.
- **`spike6/MakeShift_Fixes.md` / `Layout-recursive-issue.md`** — older working notes.
- **Auto-memory** (`MEMORY.md`) — durable cross-session notes: *children() order*,
  *cluster size law*, *mixed-graph encapsulation*, *flat-path parity*, *debug harness*.

---

**Next:** turning this validated engine into the product →
[06 — From spike to product](06-from-spike-to-product.md).

# 02 — Layout Engine

[← architecture index](README.md)

> **TL;DR.** `layout(ir)` is the single layout entry point, re-run by every
> interaction. It clears recursive-path artefacts, then **gates**: any graph with
> subgraphs and nothing pinned goes to the **recursive engine**
> (`recursive-layout.ts`, a port of Mermaid v11's `extractor`/`recursiveRender`);
> graphs that are pinned or have no clusters take the **flat** legacy dagre body.
> The recursive engine encapsulates each non-boundary-crossing cluster into its own
> dagre sub-layout (own direction, own ranksep), sizes it as one placeholder in its
> parent, then translates the children back into global coordinates. Cluster
> rectangles are sized three ways depending on the cluster's role, all funnelled
> through `cluster-bbox.ts` as the single source of truth.

---

## 1. The gate (`src/layout.ts:30`)

```ts
export function layout(ir: IR): IR {
  ir.clusterMargins = undefined;          // clear recursive-path artefacts so a
  ir.clusterRects   = undefined;          //   recursive→flat flip can't read stale state
  for (const e of ir.edges) e.labelPos = undefined;

  const external  = computeExternalConnections(ir);
  const anyPinned = ir.nodes.some(n => n.pinned);

  if (ir.subgraphs.length > 0 && !anyPinned) {
    return layoutRecursive(ir, external);   // ← RECURSIVE engine (the default for clustered graphs)
  }
  // ...FLAT engine (legacy body) below...
}
```

So the **flat** engine runs only when **(a)** there are no subgraphs, or **(b)**
something is pinned (the coarse "any pin → flat" rule). Everything else — including
the **all-external** case where no cluster is encapsulatable — goes recursive. That
all-external routing was HANDOFF-4: Mermaid lays an all-external graph out with a
single flat dagre pass where every cluster is a compound, which is exactly what the
recursive engine's degenerate root level does.

### `computeExternalConnections` — the classification rule (`src/layout-core.ts:374`)

Returns the set of cluster ids that have at least one **boundary-crossing edge**: an
edge with *exactly one* endpoint that is a descendant of the cluster (XOR). It uses
**original** endpoints — `fromCluster ?? from`, `toCluster ?? to` — so a cluster-anchor
rewrite doesn't create a false crossing. Whole-cluster edges (`node → subgraphId`)
don't count. Backed by `buildDescendantsMap` (`:282`) for O(descendants) membership.

A cluster **in** this set is *external* → laid out flat in place. A cluster **not** in
it is *encapsulatable* → a candidate for recursive encapsulation.

---

## 2. The recursive engine (`src/recursive-layout.ts`)

`layoutRecursive(ir, external): IR` (`:78`) is the Mermaid-faithful path. It mutates the
IR in place and returns it.

### 2a. Classify every cluster (`:86`)

```
encapsulated = subgraphs NOT in `external`
nonExtracted = encapsulated ∩ { sole child of its parent AND contains only leaves }
extracted    = encapsulated \ nonExtracted
```

- **extracted** → gets its own isolated dagre sub-graph, sized as one placeholder node
  in its parent. The interesting case.
- **nonExtracted** → "transparent": its leaves lay out flat in the parent's graph at
  the parent's ranksep (Mermaid does not extract a sole-leaf-only child). Replicating
  this was HANDOFF-1.
- **external** → laid out flat as a dagre compound at its own level.

### 2b. `layoutCluster()` — the recursion (`:267`)

Called once for the root (`clusterId = undefined`) and once per **extracted** cluster.
Returns a `SubResult` (local positions + content bbox + margins + recorded rects),
which the caller translates into place.

Each call builds one dagre graph and configures it:

| Setting | Root | Extracted child |
|---|---|---|
| **direction** (`:276`) | `ir.direction ?? 'TB'` | `sg.direction ?? (parentRankdir === 'TB' ? 'LR' : 'TB')` — Mermaid's flip-default |
| **ranksep** (`:284`) | `50` | `parentRanksep + 25` (compounds with depth) |
| **nodesep** | `50` | `50` |

**Node insertion order is load-bearing** (it drives dagre's cycle-break and
barycenter tie-breaks):
- **Root** uses `sortNodesByHierarchy(ir, { parent: undefined, stopAt: extracted })`
  (`layout-core.ts:176`) — nested clusters in **reverse declaration order**, then leaves
  in declaration order, not descending into extracted clusters.
- **Extracted sub-levels** use `copyOrder()` (`:249`) — a replica of Mermaid's `copy()`:
  subgraphs reversed, non-extracted/external emitted **post-order** (subtree then the
  subgraph node), leaves in first-appearance order. This is the fix that makes
  mixed-graph cycles (cyc3/cyc4) break on the same edge Mermaid breaks.

**Edges are placed at their LCA level** (`:180`). For each edge, the engine climbs both
endpoints' effective-parent chains (skipping non-extracted/external), finds the lowest
common ancestor, and inserts the edge between the LCA's two **representative** children
with the real edge `id` as dagre's multigraph name. A stable sort pushes
cluster-touching edges last (`:210`) to match Mermaid's barycenter tie-break.

Then `dagreLayout(g, {})` runs — the graph config above is the *only* dagre tuning.

### 2c. Translate child results up (`:363`)

For each extracted child, the placeholder node's dagre center `gn.{x,y}` minus the
child's own content-center gives a translation `(tx, ty)`. That offset is applied to
**everything** the child produced — leaf positions, edge points, edge label positions,
and any nested external cluster rects — lifting local coordinates into the parent
frame. Recursion composes; the root call returns global coordinates.

### 2d. Record cluster sizing artefacts

The engine records two things that `cluster-bbox.ts` later consumes:

- **`ir.clusterMargins`** (`:413`) — per-cluster symmetric half-margins reproducing
  Mermaid's dagre compound-box size: **rank-axis half = ranksep/2**, **cross-axis half
  = `crossHalfFor(id)`** which is **35** (`CROSS_HALF_MARGIN = (nodesep+edgesep)/2`)
  when the cluster's children are real nodes, or **20** (`NESTED_CROSS_HALF_MARGIN =
  edgesep`) when a child is itself a compound (`:141`). Direction maps rank/cross onto
  x/y (`horizIsRank = dir is LR|RL`).
- **`ir.clusterRects`** (`:390`) — for **external** clusters only, the *actual* dagre
  compound box `g.node(id)`. Why only external: an external cluster's box can be
  **widened asymmetrically** by edge-routing dummies (cross-boundary edges fanning in),
  which the symmetric leaf-bbox + margin model cannot reproduce. Extracted/non-extracted
  clusters are symmetric, so they keep the margin model. This was HANDOFF-4's root-cause
  fix (PrimaryDB 190→715 px).

It also captures **`e.labelPos`** (`:407`) — dagre's label-dummy `g.edge().x/y`,
bubbled up by the same translation — for the renderer's label anchoring.

---

## 3. The flat engine (legacy, byte-identical) (`src/layout.ts:76`)

Unchanged from before the recursive port; the locked fixtures depend on it staying
byte-identical. Taken for pinned or cluster-less graphs.

1. One `dagre-d3-es` graph, `{ multigraph: true, compound: true }`, single
   `rankdir = ir.direction` for the **whole** graph (per-subgraph direction is a known
   flat-path gap — `fixture_lr_subdir`).
2. Nodes inserted via `sortNodesByHierarchy(ir)` (parent-then-children, Mermaid order);
   subgraphs as compound nodes; `setParent` in a second pass; edges with `e.id` as the
   multigraph name (`:152`).
3. **Pass-1.5 re-anchor** (`reanchorClusterEdges`, `:264`): after the first dagre pass,
   for clusters with `externalConnections === false`, re-point cluster-edges to the true
   extremal leaf **along the flow axis** (bottom-most for outgoing, top-most for
   incoming; X for LR/RL, Y for TB/BT) and re-run dagre once. This mimics, in the flat
   path, the encapsulation result the recursive path gets natively. The boxed comment
   above this function (`:245`) is the canonical statement of the
   `fromCluster`/`toCluster` invariant — read it before touching any pass that rewrites
   endpoints.
4. Write-back: node `x/y/width/height`, then edge waypoints through the shared
   `clipEdgeWaypoints` (`:210`).

Optional **A* grid-snap** (`snapToGrid`, `:96`) rounds node sizes/positions to
`cellSize` — but **only when A* is enabled**, so the slider never perturbs the default
layout.

---

## 4. Edge clipping — shared by both engines (`src/layout-core.ts:321`)

`clipEdgeWaypoints(e, rawPts, clusterBboxes, nodesById)` is called by *both* the flat
write-back and the recursive finaliser, so endpoint geometry is byte-identical
regardless of engine:

- **Cluster endpoint** (`e.fromCluster`/`toCluster` set) → clip to the cluster's drawn
  rect (`clipToClusterRect`) and cull waypoints that fall inside it.
- **Leaf endpoint** → clip to the node shape's outline (`clipToBorder`, shape-aware).
- Always returns ≥3 points so `curveBasis` stays smooth.

---

## 5. Cluster sizing — one source of truth (`src/cluster-bbox.ts`)

Every consumer (renderer outline, edge clip target, drag preview, A* trim) gets cluster
rectangles from `computeClusterBboxes(ir)` (`:24`). It resolves each cluster by a strict
precedence:

```
1. ir.clusterRects.get(id)   → use verbatim   (external cluster: recorded dagre box)
2. else leaf-bbox of descendants, expanded by:
   2a. ir.clusterMargins.get(id)   → symmetric, NO label offset   (recursive cluster)
   2b. else CLUSTER_PADDING (20) + CLUSTER_LABEL_OFFSET (10) on top   (flat cluster, legacy)
```

Because the recursive driver sizes each placeholder to *equal* the rect this function
will later derive, **placeholder == drawn rect at every level** — a key invariant; keep
it unless a task explicitly says otherwise.

> **Why the drag bug existed here.** `ir.clusterRects` froze the external clusters'
> boxes. Dragging an interior node moved the leaves but the recorded rect didn't
> track them. The fix (see [04](04-interaction-and-routing.md)) deletes the dragged
> node's cluster ancestry from `ir.clusterRects` on first move, so those clusters fall
> back to the live leaf-bbox + margin path and resize naturally.

---

## 6. Key constants

| Constant | Value | Where | Meaning |
|---|---|---|---|
| root `ranksep` | 50 | `recursive-layout.ts:284` | rank separation at root (Mermaid default) |
| nested `ranksep` | `parent + 25` | `:284` | compounds with nesting depth |
| `nodesep` | 50 | `:287` / `layout.ts:88` | node separation, all levels |
| `CROSS_HALF_MARGIN` | 35 | `:42` | cross-axis half-margin, child = real node |
| `NESTED_CROSS_HALF_MARGIN` | 20 | `:48` | cross-axis half-margin, child = compound |
| `DAGRE_NODESEP / EDGESEP` | 50 / 20 | `:40` | the inputs the margins derive from |
| `CLUSTER_PADDING` | 20 | `cluster-bbox.ts:9` | flat-path cluster padding |
| `CLUSTER_LABEL_OFFSET` | 10 | `cluster-bbox.ts:13` | flat-path extra top room for label |

> **Known residual:** container (outer) clusters come out uniformly ~**+18px** wide vs
> Mermaid because `crossHalfFor` keys on `extracted` (empty in the all-external case).
> Cosmetic, deferred — see [05](05-invariants-and-parity.md).

---

**Next:** how positioned IR becomes pixels → [03 — Rendering & edges](03-rendering-and-edges.md).

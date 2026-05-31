# 01 — Data Pipeline & the IR

[← architecture index](README.md)

> **TL;DR.** Source text becomes one mutable data structure, the **IR**
> (`types.ts`), and everything downstream reads/writes that same object. The parser
> adapter (`parser-adapter.ts`) uses Mermaid purely as an AST source and does one
> non-trivial transform: it **rewrites edges whose endpoint is a subgraph** to a
> representative leaf, stamping `fromCluster`/`toCluster` so downstream code can clip
> back to the cluster border. For interaction, `effective-ir.ts` derives a second IR
> that folds collapsed clusters into **surrogate nodes** — that derived IR is what
> the renderer and drag handler actually see.

---

## 1. The IR — one model to rule them all (`src/types.ts`)

There is exactly one data model. Layout, rendering, drag, routing, and collapse all
mutate it in place. Holding its shape in your head is most of understanding the
codebase.

```ts
interface IR {
  nodes: IRNode[];
  edges: IREdge[];
  subgraphs: IRSubgraph[];
  direction?: Direction;                 // 'TB' | 'BT' | 'LR' | 'RL', default 'TB'
  clusterMargins?: Map<id, {x,y}>;        // recursive-path artefact (see 02)
  clusterRects?:   Map<id, {x,y,w,h}>;    // recursive-path artefact (see 02)
}
```

### `IRNode` (`types.ts:23`)
`{ id, label, shape, parent?, pinned?, x?, y?, width?, height? }`
- `x`/`y` are the node **center** (the renderer translates to top-left — see [03](03-rendering-and-edges.md)).
- `parent` is the **immediate** containing subgraph id (or undefined at root).
- `pinned` = the user dragged it; pins force the **flat** layout engine (see [02](02-layout-engine.md)).
- `shape` is one of 14 `NodeShape` values (`types.ts:6`), each mapped 1:1 from
  Mermaid's `FlowVertexTypeParam`; unknown shapes fall back to `rect`.

### `IREdge` (`types.ts:35`) — read the field comments, they're load-bearing
`{ id, from, to, label?, style?, points?, originalPoints?, routedPath?, fromCluster?, toCluster?, labelPos? }`

| Field | Meaning |
|---|---|
| **`id`** | **The edge's identity** — `L_<index>` from the parser. *Not* `(from,to)`: two edges can share a `(from,to)` pair after cluster-edge rewriting (see `fixture_reserve_fallback`). The renderer keys edges by `id`; dagre gets `id` as its multigraph edge name so duplicates survive end-to-end. |
| **`from` / `to`** | Current leaf endpoints (post-rewrite). |
| **`fromCluster` / `toCluster`** | If set, this endpoint was **originally a subgraph id**, rewritten to a leaf. The value is the *original* subgraph id. Downstream clips the edge to that cluster's drawn border instead of the leaf outline. **Load-bearing invariant** — see [05](05-invariants-and-parity.md). |
| **`points`** | Current display waypoints (may be mid-drag). |
| **`originalPoints`** | The "clean" waypoints to redraw from on reset/refresh. Either raw dagre `curveBasis` points or side-aware curves stamped by a drop. |
| **`routedPath`** | A* orthogonal polyline; only present and preferred when A* is enabled. |
| **`labelPos`** | Dagre's label-dummy coord (recursive engine only); the renderer snaps the label to the nearest path vertex from here. Cleared on flat path and on side-aware/A* rebuilds. |

### `IRSubgraph` (`types.ts:70`)
`{ id, label, parent?, children[], collapsed?, direction? }`
- `children` holds **only direct leaf** children (nested subgraphs are linked via
  their own `parent`, not listed here). The parser sets this (`parser-adapter.ts:140`).
- `direction` is the block's own declared `direction XX`, or `undefined`. Undefined is
  meaningful: the recursive engine applies Mermaid's flip-default (parent TB → child
  LR) only when it's undefined — don't default it to `'TB'`.
- `collapsed` drives `effective-ir.ts` (§3).

`clusterMargins` / `clusterRects` are written by the recursive engine and consumed by
`cluster-bbox.ts`; they're explained in [02](02-layout-engine.md). The flat path leaves
them unset and `layout()` clears them at entry so a recursive→flat flip can't read
stale values.

---

## 2. Parsing — Mermaid as an AST source only (`src/parser-adapter.ts`)

`parseToIR(source): Promise<IR>` (`parser-adapter.ts:99`) is the whole front door.

1. **Parse via Mermaid's own DB**, never its renderer:
   `mermaid.mermaidAPI.getDiagramFromText(source)` → `diagram.db`, then
   `db.getDirection()`, `db.getVertices()` (a `Map`), `db.getEdges()`,
   `db.getSubGraphs()`. This is the clean boundary Decision 2 banked on — no regex, no
   DOM scraping.
2. **Build the subgraph hierarchy** (`:123`): a subgraph's `nodes` array can contain
   other subgraph ids; split those out to compute `parent` links and the direct-leaf
   `children` array.
3. **Skip phantom vertices** (`:165`): Mermaid registers a vertex for *any* id used as
   an edge endpoint, including subgraph ids. Those are already `IRSubgraph`s — emitting
   a leaf for them would double-draw. Skipped.
4. **Edge identity** (`:178`): `id = L_<idx>`, stable across re-parse. (See `IREdge.id`.)
5. **Direction normalisation** (`:244`): Mermaid's `TD` → dagre's `TB`; unknown → `TB`.

### 2a. The cluster-edge rewrite — the one subtle transform (`:209`)

dagre rejects edges whose endpoint is a **compound** (subgraph) node. So an edge like
`Productivity --> Halt` (where `Productivity` is a subgraph) must be rewritten to a
*leaf inside* `Productivity`. Two pieces do this Mermaid-faithfully:

- **`findNonClusterChild()`** (`:26`) walks a cluster's children in **exactly Mermaid's
  `graph.children()` order**: nested **subgraphs in reverse declaration order first**,
  then **direct leaves in vertex-first-appearance order** (`vertexOrder`, built at
  `:203`). This ordering is load-bearing — it's why `fixture_reserve_fallback` and the
  cyclic-nested fixtures match. (See the memory note "Mermaid children() order".)
- **`findCommonEdges()`** (`:82`) is a faithful port of Mermaid's same-named function
  (including a harmless apparent typo preserved for parity at `:91`). It makes
  `findNonClusterChild` **skip** a candidate leaf that would create a dagre self-loop,
  falling back to a `reserve` pick. This is the "reserve-fallback" that can legitimately
  produce two edges sharing `(from,to)` — hence edge `id` identity.

When an endpoint is rewritten, the edge gets `fromCluster`/`toCluster` = the original
subgraph id (`:232`). Empty subgraphs → the edge is dropped with a console warning.

> The result of `parseToIR` is the canonical source IR. In the interactive app it is
> held as the **source of truth** and never mutated by collapse — collapse derives a
> *copy* (§3).

---

## 3. Effective IR — collapse as a derived view (`src/effective-ir.ts`)

Collapse/expand (disclosure mode 1) does **not** mutate the source IR's structure. It
flips `sg.collapsed` flags on the source, then `deriveEffectiveIR(ir)` (`:36`) builds a
fresh IR in which each collapsed cluster is replaced by a single **surrogate node**.
The renderer and drag handler only ever see this derived IR.

How the derivation works:

1. **Visible leaves** (`:41`): a node survives iff its `outermostCollapsedAncestor`
   (`:21`) is undefined. "Outermost wins" — an outer collapsed cluster hides everything
   beneath it regardless of inner flags.
2. **Surrogate nodes** (`:57`): one per cluster that is the *outermost* collapsed one.
   Id is `__sg__<clusterId>` (`SURROGATE_PREFIX`, `:3`). A surrogate nested inside a
   still-visible parent is registered as that parent's child (`:68`) — without this, a
   parent whose only content was the now-collapsed cluster (e.g. cyc3's `Productivity`)
   would become un-sizable and vanish.
3. **Visible subgraphs** (`:77`): clusters with no collapsed self-or-ancestor, their
   `children` augmented with any surrogate standing in for a directly-nested collapsed
   cluster.
4. **Edge remap + dedup** (`:86`): each endpoint inside a collapsed cluster is remapped
   to that cluster's surrogate; interior edges (both ends remap to the same surrogate)
   are dropped; fan-in/out collapses dedup. Crucially, dedup applies **only** to edges
   an endpoint actually changed (`:108`) — so two legitimately-distinct edges sharing a
   `(from,to)` pair don't silently merge. Cluster annotations are preserved on the
   non-remapped side and cleared on the remapped side (`:131`) — this maintains the
   `fromCluster`/`toCluster` invariant (see [05](05-invariants-and-parity.md)).

`countHiddenDescendants()` (`:145`) feeds the `(N)` badge the renderer draws on a
surrogate.

---

## 4. Orchestration — source vs effective (`src/entry.ts`)

`entry.ts` wires the pipeline and owns the two-IR dance:

- `ir` — the **source of truth** (collapse flags + pinned positions persist here).
- `currentEff` — `deriveEffectiveIR(ir)`, rebuilt on every collapse/expand and on load.

The load/redraw cycle (`main()` `:103`, `rerenderWithCollapse()` `:89`):

```
deriveEffectiveIR(ir) → currentEff
layout(currentEff)                     // positions on the derived IR
syncEffToSource()                      // write visible positions back to ir (:63)
renderFull(currentEff, svg, true, ir)  // render derived IR; pass source for badges
reattach()                             // re-bind drag (DOM was rebuilt)
```

`syncEffToSource()` (`:63`) copies computed `x/y/width/height` and edge points from the
effective IR back onto the source for every non-surrogate node, so hidden nodes
reappear in place on expand and the source stays the durable record.

`resetLayout()` (`:118`) clears pins and stale routed paths but **keeps collapse
state** — reset is about layout, not disclosure.

---

**Next:** how `layout(currentEff)` actually positions everything →
[02 — Layout engine](02-layout-engine.md).

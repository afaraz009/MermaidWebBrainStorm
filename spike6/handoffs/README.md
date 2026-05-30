# Recursive-layout follow-up handoffs

Three independent, deferred items from the recursive-layout port (branch
`recursive-layout`, commit that added `src/recursive-layout.ts` +
`src/layout-core.ts`). Each file below is a **standalone task spec** — an agent
can pick up one without reading the others. None of these is a regression; the
core port (per-subgraph direction + parallel-branch ordering for encapsulatable
clusters) is shipped and verified. Full decision trail: `../RECURSIVE_LAYOUT_LOG.md`.

| # | File | One-liner | Risk |
|---|------|-----------|------|
| 1 | [HANDOFF-1-cluster-size-parity.md](HANDOFF-1-cluster-size-parity.md) | ✅ DONE (2026-05-31). Recursive clusters now sized to Mermaid's dagre compound box (rank Δ=ranksep, cross Δ=70/40); drawn rect decoupled via `ir.clusterMargins`; sole-leaf-child non-extraction replicated. See `../RECURSIVE_LAYOUT_LOG.md` "HANDOFF-1 RESOLVED". | Medium |
| 2 | [HANDOFF-2-mixed-graph-encapsulation.md](HANDOFF-2-mixed-graph-encapsulation.md) | Mixed graphs (cyc3/cyc4) kept fully flat; Mermaid partially encapsulates them. | High (locked fixtures) |
| 3 | [HANDOFF-3-reserve-fallback-flip.md](HANDOFF-3-reserve-fallback-flip.md) | `fixture_reserve_fallback` L1/L2 sibling order flipped vs Mermaid (flat-path quirk). | Medium |

Recommended order: **1** (best visual-parity payoff, self-contained) → **3**
(small, isolated) → **2** (hardest, touches locked fixtures).

---

## How the layout works today (read this first)

`src/layout.ts` `layout(ir): IR` mutates the IR in place (writes `n.x/y/width/height`
and `e.points`/`e.originalPoints`) and is the single entry point re-run by all
interactivity. It **gates** between two engines:

- **Recursive** (`src/recursive-layout.ts`) — taken **only** when every cluster is
  encapsulatable and nothing is pinned (gate: `anyEncapsulatable && !anyExternal
  && !anyPinned`). Mirrors Mermaid v11's `extractor`/`recursiveRender`: a cluster
  with `externalConnections === false` is laid out in its own dagre sub-graph with
  its own `direction`, sized as one placeholder node in its parent, then its
  children are translated into place. Composes recursively (root returns global
  coords).
- **Flat** (the legacy body in `layout.ts`) — taken for any graph with an external
  cluster, any pinned node, or no clusters. Unchanged from before the port; the
  locked fixtures rely on it being **byte-identical**.

`externalConnections` = `computeExternalConnections(ir)` in `layout-core.ts`: a
cluster is *external* iff some edge has exactly ONE endpoint that is a descendant
of it (a true leaf↔leaf boundary crossing), using original endpoints
(`fromCluster ?? from`). Whole-cluster edges (`node → subgraphId`) do NOT count.

**Single source of truth for the drawn cluster rect:** `src/cluster-bbox.ts`
`computeClusterBboxes(ir)` derives every cluster rectangle from descendant leaf
positions (`CLUSTER_PADDING = 20`, `CLUSTER_LABEL_OFFSET = 10`). The renderer,
edge clipping, drag preview, and A* all consume it. The recursive driver sizes
each placeholder to **equal** the rect this will later derive (so placeholder ==
drawn rect at every level — keep that invariant unless the task says otherwise).

**Load-bearing invariant:** `e.fromCluster`/`e.toCluster` always equal the
pre-rewrite original endpoint. Any pass that rewrites `from`/`to` must preserve
or explicitly clear them (boxed comment above `reanchorClusterEdges` in
`layout.ts`).

---

## Verification harness (shared by all three tasks)

**Build (this worktree has its own `node_modules`):**
```
cd spike6
npm install                  # first time only
./node_modules/.bin/tsc --noEmit   # must be silent  (npx tsc can mis-resolve)
npx vite build               # must pass
npx vite --port 5190 --strictPort   # dev server (background)
```
Note: a dev server on **:5175** serves the ORIGINAL pre-port code from a sibling
checkout — use it as a **before/after baseline** to prove flat-path fixtures stay
byte-identical. Your branch is on **:5190**.

**Ground truth = Mermaid's own internals.** `mermaid-debug.html?fixture=NAME.mmd`
renders with Mermaid `logLevel:'info'` and tees every `log.*` into `window.__dump`.
Useful markers (Playwright `browser_evaluate` to read them):
- `"Cluster without external connections, … with children <ID> <depth>"` — exactly
  which clusters Mermaid ENCAPSULATES.
- `"Fixing dir <A> <B>"` — the direction Mermaid chose for an encapsulated cluster.
- `"Graph after layout: {…}"` — per-level node x/y/width/height (graphlib JSON;
  one entry per recursion level, deepest first, root last).
- `"Graph before layout: {…}"` — per-level node + edge INSERTION ORDER.

**Compare panes.** `index.html?fixture=NAME.mmd` = left Mermaid, right ours.
Our SVG (`#mount` in `our-renderer.html?fixture=NAME.mmd`): nodes are
`[data-node-id]` groups with a `translate(x,y)` transform (center); cluster rects
are `[data-subgraph-id] rect` (x/y/width/height).

**Capture our node positions (Playwright):**
```js
const pos = {};
for (const g of document.getElementById('mount').querySelectorAll('[data-node-id]')) {
  const m = (g.getAttribute('transform')||'').match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
  if (m) pos[g.getAttribute('data-node-id')] = { x:+m[1], y:+m[2] };
}
```

**Locked fixtures that must NOT regress** (compare 5190 vs 5175, byte-identical):
`fixture`, `fixture200`, `fixture_crosscluster(_acyclic)`, `fixture_nested`,
`fixture_cyclic_nested_1..4`, `fixture_node_to_subgraph`, `fixture_shapes`,
`fixture_reserve_fallback`. Handoff checkpoints (from `SPIKE6_HANDOFF.md`):
cyc2 Router bottom-left / Response right; cyc3 Reviewer above Editor / Halt below
Productivity; cyc4 Exit beside DiamondScc / Done below Pipeline; fixture_nested
Cache-LEFT / Primary-RIGHT in Storage_L2.

> Per `../../CLAUDE.md` Playwright is opt-in; it WAS authorized for this work
> because dump-driven verification is the only reliable parity check. Confirm
> with the user before using it.

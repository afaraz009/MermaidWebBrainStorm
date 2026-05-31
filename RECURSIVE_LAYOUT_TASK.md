# Task: close the flat-vs-recursive layout gap

You are working in a dedicated worktree (branch `recursive-layout`) to replace
our flat layout with a recursive one. Read this brief, then **investigate the
codebase yourself and work in steps** — this document deliberately does NOT
prescribe an implementation. Form your own plan, verify each stage, and adjust.

## Start here
- Read `spike6/SPIKE6_HANDOFF.md` end-to-end first — it describes the app, the
  pipeline, the locked decisions, and the catalogued bugs. The section on
  remaining debt names the exact problem you're solving.
- Then read the layout path in `spike6/src` until you genuinely understand how
  positions and edge waypoints are produced today. Don't start changing things
  until you can explain the current flow back to yourself.

## The problem
We aim for visual parity with Mermaid v11. Mermaid lays each subgraph out
**recursively**: it sizes every cluster from its own isolated sub-layout,
treats that cluster as a single node in its parent, then translates the
children into place. We instead run **one flat pass** over the whole compound
graph and approximate cluster encapsulation with heuristics.

This approximation breaks down in predictable shapes:
- Sibling/parallel-branch ordering comes out mirrored vs. Mermaid when a
  cluster runs parallel to another branch.
- A subgraph that declares its own `direction` (different from the top-level
  one) cannot be honoured, because a single flat pass has one global rankdir.

These are not separate bugs — they are the same root cause. The handoff's debt
section lists the concrete observed instances and the fixtures that show them.

## The proposed direction (high level only)
Match Mermaid's **recursive, encapsulate-then-translate** strategy instead of
the single flat pass. The key idea is: lay out the innermost clusters first,
collapse each into a single sized placeholder in its parent, lay out the
parent, then expand and reposition. Mermaid's own implementation (the same
layout library we already depend on) is available in `node_modules` as a
reference for *what* the algorithm does — study it, but you do not have to
mirror its DOM-coupled mechanics; we want a headless version.

The hardest part is **edges that cross cluster boundaries**. Budget most of
your care there. Do the easy structural part first and prove it before taking
on cross-boundary edges.

## Hard constraints (do not violate)
- **Preserve the existing layout entry-point contract.** Interactivity
  (drag / collapse-expand / connect / reset) is built on re-running layout over
  a mutated in-memory model. Whatever you build must keep that same shape so
  those features keep working without a round-trip through source text.
- **Do not regress the locked parity fixtures.** The handoff lists the fixtures
  that currently match Mermaid byte-for-byte and the specific checkpoints to
  re-verify. Treat any divergence on those as a failure, not an acceptable
  trade.
- Respect the load-bearing invariants the code already documents (especially
  the cluster-anchored-edge annotation invariant — there is a boxed comment in
  the layout code about it). If you change how endpoints are rewritten, keep
  those annotations honest.
- Keep the single source of truth for the drawn cluster rectangle. Don't
  recompute padding/label geometry in new places.

## What "done" looks like
- The catalogued parallel-branch ordering instances match Mermaid.
- A subgraph with its own `direction` lays out in that direction (the probe
  fixture for this is in the handoff's fixture list).
- All previously-passing parity fixtures still pass.
- The interactivity features still work after collapse/expand and edge edits.

## How to verify (per the handoff)
- `cd spike6 && npx tsc --noEmit` must stay silent, `npx vite build` must pass.
- `npx vite`, then load fixtures via the side-by-side comparison page and
  compare panes (left = Mermaid reference, right = ours). Per `CLAUDE.md`,
  browser automation is opt-in — only reach for it if explicitly asked.

## Working style
Go in verifiable increments. After each step, build, typecheck, and eyeball a
fixture before moving on. Keep a short running log of what you tried and what
the comparison showed, so the decision trail survives. When a stage changes
layout output, re-check the locked fixtures immediately rather than at the end.

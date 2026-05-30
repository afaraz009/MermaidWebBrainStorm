### Layout-parity bugs catalogued 2026-05-30 (all symptoms of #1/#2)

These do NOT have standalone fixes — they're the flat-dagre-vs-recursive
gap surfacing in specific graph shapes. Listed so they're tracked as known
shapes, not surprises. The clean fix for all of them is the recursive port.

- **Parallel-branch ordering flip.** When a *cluster* runs parallel to
  another branch (cluster or leaf) at the same rank with no edge between
  them, the cross-axis order can come out opposite to Mermaid. Mermaid orders
  the cluster as a single *encapsulated* node; we explode it into its leaves
  (spanning multiple ranks, with cluster-anchored edges rewritten onto those
  leaves), so dagre's barycenter tiebreak lands the other way. Visible as a
  left/right swap under TB, top/bottom under LR/RL.
  - `fixture_reserve_fallback`: Mermaid `L2`-left/`L1`-right, ours flipped.
    Root cause traced: `Cluster→T1`, `Cluster→T2`, `Start→Cluster` all
    reserve-fallback to leaf `L1`, giving `L1` phantom connectivity that
    pulls it across. `reanchorClusterEdges` can't rescue it (`Cluster` has a
    real boundary-crossing edge `Start→L2` → `externalConnections=true`).
  - `fixture_rl_chain`: `Proc` cluster vs `Audit` leaf are parallel branches;
    Mermaid puts `Proc` at the bottom, ours on top. Same exploded-leaf
    barycenter cause.
  - Risky levers (pre-seeding dagre per-rank `order`, sharing a barycenter
    across a cluster's exploded leaves) were considered and rejected as
    fragile — they jeopardise the 10 passing parity fixtures.

- **Per-subgraph `direction` not honoured.** Top-level direction (TB/BT/LR/RL)
  now flows through the pipeline (`parser-adapter` → `IR.direction` →
  dagre `rankdir`, with `reanchorClusterEdges` made flow-axis aware). But flat
  dagre applies ONE `rankdir` to the whole graph, so a nested subgraph that
  declares a *different* `direction` than its parent renders in the parent's
  direction instead. Probe fixture: `fixture_lr_subdir.mmd` (LR diagram with a
  `direction TB` subgraph — expected to diverge). Subgraphs that inherit /
  match the top-level direction are fine.



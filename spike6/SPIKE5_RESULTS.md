# Spike 5 — Results

**Date:** 2026-05-25
**Branch:** `spike5` (off `spike3`)
**Folder:** `spike5/` (copied from `spike4/`)
**Commits:**
- `e88c2f6` — Suggestion 1: port `sortNodesByHierarchy` — verified no-op
- `83f71d5` — Suggestion 2: rewrite `node → subgraph` edges to first-leaf descendant

## TL;DR

| Suggestion | Outcome | Land it? |
|---|---|---|
| **1** — Mirror Mermaid's parent-then-children node insertion order | **No-op** on all 5 baseline fixtures (no improvement, no regression) | Yes — it's harmless and arguably the more "honest" insertion order even if it didn't move dagre. Don't expect parity gains. |
| **2** — Rewrite `node → subgraph` edges to first-leaf descendant in `parser-adapter.ts` | **Fixes the production crash.** Pure no-op on all 5 baseline fixtures. The new `fixture_node_to_subgraph.mmd` previously crashed with `TypeError`; now renders. | **Yes.** Real bug fix, zero downside. |

**Recommendation:** Merge both. Then escalate to the structural-port handoff (`C:\Users\ahmed\AppData\Local\Temp\claudeHandoffs\structural-port-handoff-2026-05-25.md`) for the three remaining parity divergences — they are NOT going to be fixed by any narrow surface-level change.

---

## Methodology

- Both renderers loaded via `npm run dev --prefix spike5` (vite picked port 5177; earlier ports 5173–5176 still held by prior session).
- Numeric extraction via Playwright MCP, computing cluster + node centres in SVG user-space coordinates (`element.getCTM()` applied to bbox centre via `createSVGPoint`). CSS pan/zoom transforms on the `<svg>` element are excluded from CTM so the numbers are reproducible across visits.
- Wait per fixture: 3.5s for the four small fixtures, 8s for `fixture200.mmd` (191 nodes, 24 subgraphs).
- Coordinates here are NOT directly comparable to the prior-session baseline in `D:\CODE\MermaidBrainStorm\layout-data.json` — that file used a different extraction (different origin/offset). What's compared instead are the **structural parity invariants** the handoff identified per fixture.

Raw numeric data:
- `spike5/layout-data-spike5-s1.json` — after Suggestion 1
- `spike5/layout-data-spike5-s2.json` — after Suggestion 2 (includes spot-check confirmations of no regression on `fixture.mmd` and `fixture_nested.mmd`)

Visuals: `spike5/fx{1..6}-*-spike5.png` (our renderer only — Mermaid reference unchanged from baseline).

---

## Per-fixture verdict

### `fixture.mmd` — ✅ parity preserved
- Mermaid: Payment_System cy=892, Authentication cy=1355 → Payment_System above.
- Ours:    Payment_System cy=826.5, Authentication cy=1237.5 → Payment_System above.
- s2 numbers bit-identical to s1. No-op confirmed.

### `fixture_crosscluster.mmd` — ❌ structural divergence persists
- Mermaid: External cy=431, Frontend cy=367 → External side-by-side with Frontend at the top of the layout.
- Ours:    Frontend cy=318, Services cy=673, DataLayer cy=868, External cy=1018 → all four clusters in a vertical chain, External at the bottom.
- Matches pre-Spike-5 baseline characterisation in handoff. Suggestion 1 did not flip this. Requires structural port.

### `fixture_crosscluster_acyclic.mmd` — ❌ AuthCheck branch mirror persists
- Mermaid: RateLimit cx=606, AuthCheck cx=727 → RateLimit LEFT of AuthCheck.
- Ours:    RateLimit cx=708.5, AuthCheck cx=606 → RateLimit RIGHT of AuthCheck.
- Matches pre-Spike-5 baseline (handoff: "ours RateLimit x=725 right of AuthCheck x=622"; my measurement 708.5 vs 606 is the same direction, ~17px shift is extractor-noise). Suggestion 1 did not flip. Requires structural port.

### `fixture_nested.mmd` — ✅ all 5 cluster invariants maintained
| Invariant | Mermaid | Ours | Match |
|---|---|---|---|
| Services above Storage | 649 < 1302 | 560 < 1093 | ✓ |
| Auth left of Payments | 293 < 802 | 305 < 838 | ✓ |
| Token left of Session | 174 < 415 | 178 < 433 | ✓ |
| Refund left of Card | 684 < 918 | 718 < 963 | ✓ |
| PrimaryDB left of Cache | 330 < 689 | 193 < 710 | ✓ |

s2 numbers bit-identical to s1 across all 10 measured subgraphs. (Workaround in fixture file is still there. Could be removed now that Suggestion 2 handles raw `node → subgraph` syntax, but the handoff explicitly said to leave fixtures alone.)

### `fixture200.mmd` — ❌ catastrophic sprawl persists
- Mermaid: 8 top-level clusters, cx span 190 → 2406 = **2216 px wide**.
- Ours:    8 top-level clusters, cx span 355 → 6104 = **5749 px wide** (~2.6× wider).
- Cluster order completely different:
  - Mermaid: Shipping, Web, Mobile, Payments, Orders, Inventory, Notifications, Analytics (compact, non-monotone with declaration order)
  - Ours:    Analytics, Notifications, Shipping, Inventory, Payments, Orders, Mobile, Web (near-declaration order, monotonic spread)
- Suggestion 1 did not move the needle here, as predicted. Requires structural port.

### `fixture_node_to_subgraph.mmd` (new) — ✅ FIXED
- Source: `Entry → Platform`, `Platform → Done`, `Platform = { Ingress, Router, Egress }`.
- Pre-fix: `TypeError: Cannot set properties of undefined (setting 'rank')` from `@dagrejs/dagre`.
- Post-fix: renders cleanly. Edges rewritten via `firstLeafDescendant`:
  - `Entry → Platform` → `Entry → Ingress`
  - `Platform → Done` → `Ingress → Done`
- Mermaid (control) renders identically; its internal `adjustClustersAndEdges` does the equivalent rewrite.

**Caveat on `Platform → Done`:** ideally would have rewritten to `Egress → Done` (the *last* leaf, which is the semantic exit of the subgraph). First-leaf-in-declaration-order picks `Ingress` for both endpoints, which means the visible edge in our render leaves from the top of the Platform cluster instead of the bottom. This matches what the handoff explicitly accepted: *"first-leaf is sufficient for crash avoidance. Mermaid uses commonEdges scoring; we don't."* Acceptable per Decision 3 in `architecture-decisions-renderer.md`. If we ever want render-perfect parity for this case, port `findCommonEdges` too.

---

## Net parity status post-Spike-5

| Fixture | Pre-Spike-5 | Post-Spike-5 |
|---|---|---|
| `fixture.mmd` | ✅ parity | ✅ parity |
| `fixture_crosscluster.mmd` | ❌ structural | ❌ structural |
| `fixture_crosscluster_acyclic.mmd` | ❌ branch mirror | ❌ branch mirror |
| `fixture_nested.mmd` | ✅ parity (5 invariants) | ✅ parity (5 invariants) |
| `fixture200.mmd` | ❌ catastrophic | ❌ catastrophic |
| `fixture_node_to_subgraph.mmd` | 💥 crash | ✅ renders |

**Nothing new at parity. One new crash fixed.** That matches the handoff's "honest expectation."

---

## What this confirms

1. **§8.10 sub-option-2 hypothesis is dead.** Mimicking Mermaid's node insertion order alone is not enough to change dagre's structural choices for the three divergent fixtures. The DFS-FAS back-edge picks must already be the same — the divergence comes from *somewhere else* (the structural rewrites Mermaid's renderer applies before handing to dagre).

2. **The remaining divergences are not narrow.** Fixture_crosscluster's "External at bottom in vertical chain" and fixture200's 2.6× horizontal sprawl are both consistent with the absence of Mermaid's per-cluster `extractor` pass — Mermaid lays out each cluster's contents *independently* into nested sub-graphs, then composes. We do one flat compound layout, so the global ranking inflates.

3. **The crash fix is unambiguously good.** Removes a real production bug at the cost of one cheap helper and ~20 LOC in `parser-adapter.ts`. No fixture regresses.

---

## Recommendation

1. **Keep both commits** on `spike5` and merge to `main` (or fast-forward to `spike4` if you prefer to keep spike branches around as snapshots).
2. **Escalate to the structural port handoff** at `C:\Users\ahmed\AppData\Local\Temp\claudeHandoffs\structural-port-handoff-2026-05-25.md`. The three remaining divergences (cross-cluster structural, acyclic branch mirror, fixture200 sprawl) all point at the same gap and won't be fixed by anything smaller than that.
3. **Optional follow-ups** if you don't want to commit to the full structural port:
   - Port `findCommonEdges` so `firstLeafDescendant` becomes "best-leaf descendant" — would clean up the cosmetic issue in `fixture_node_to_subgraph` (Platform→Done leaving from the top instead of the bottom).
   - Remove the workaround in `fixture_nested.mmd` (`Entry --> PlatformIngress` → `Entry --> Platform_Top`) now that Suggestion 2 handles it. Trivial; would just exercise the rewrite path in one more place.

Neither follow-up is load-bearing for parity. Both are < 1 hour of work if motivated.

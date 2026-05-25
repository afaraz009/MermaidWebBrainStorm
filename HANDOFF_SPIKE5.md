# Handoff — Spike 5: `sortNodesByHierarchy` + `node→subgraph` crash fix

**Date:** 2026-05-25
**Repo:** `D:\CODE\MermaidBrainStorm`
**Starting branch:** `spike3` (this is where the user has been working; `git status` shows untracked `fx*.png` and `layout-data*.json` files at the repo root that are verification artifacts from the previous session — **keep them, they are baselines**)
**Target branch:** `spike5` (new, create off the user's preferred base — confirm with them whether to branch off `spike3` or `main`)
**Target folder:** `spike5/` (new, copy from `spike4/`)

---

## What this session is for

Two cheap, low-risk parity experiments. Both ~1 hour each. Total session budget: ~3 hours including verification and write-up.

| # | Task | Effort | Goal |
|---|---|---|---|
| 1 | Port Mermaid's `sortNodesByHierarchy` and use it to order `g.setNode` calls in our `layout.ts` | ~30 LOC, ~1h | Confirm or deny the §8.10 sub-option-2 hypothesis with hard data. Hypothesis: changing dagre's node-insertion order alone might flip its DFS-FAS back-edge choice and improve parity, without any other rewriting |
| 2 | Detect edges with `node → subgraph` syntax in `parser-adapter.ts` and remap the endpoint to a synthetic leaf anchor | ~20-30 LOC, ~1h | Fix a real production crash (`@dagrejs/dagre` throws `TypeError: Cannot set properties of undefined (setting 'rank')` when an edge endpoint is a compound node) |

These are **independent**. Suggestion 1 is parity-flavored experimentation; Suggestion 2 is an orthogonal bug fix. Land them as separate commits.

**What this session is NOT for:** the full structural `extractor` port. That has its own handoff at `C:\Users\ahmed\AppData\Local\Temp\claudeHandoffs\structural-port-handoff-2026-05-25.md` and is explicitly deferred until Spike 5 results are in.

---

## Required reading before touching code

In order:

1. **`D:\CODE\MermaidBrainStorm\HANDOFF_PARITY.md`** — read §1 (cycle-breaking equivalence), §3 (the four fixtures and what each tests), §8.6 (`sortNodesByHierarchy` description with line refs into Mermaid source), §8.10 sub-option 2 (the hypothesis Suggestion 1 tests). Skim the rest.
2. **`D:\CODE\MermaidBrainStorm\spike4\src\layout.ts`** — the whole file. Particularly the `layout()` function (~line 226) and the existing `chooseEdgesToReverseForMermaidOrder` / `fixBranchOrderingPerSubgraph` adapters. Suggestion 1 modifies the node-insertion order inside `layout()`; the existing adapters should be left alone for this spike.
3. **`D:\CODE\MermaidBrainStorm\spike4\src\parser-adapter.ts`** — the whole file (~100 lines). Suggestion 2 lives here. Pay attention to `rawSubgraphs` / `subgraphIds` / `rawEdges` data shapes.
4. **`D:\CODE\MermaidBrainStorm\spike\node_modules\mermaid\dist\chunks\mermaid.core\dagre-KV5264BT.mjs` lines 370-382** — Mermaid's actual `sorter` / `sortNodesByHierarchy` implementation. Verify our port against this, not against the HANDOFF doc's restatement.

The PRD (`_bmad-output/planning-artifacts/prd.md`) and the renderer decisions doc are background but not load-bearing for this spike.

---

## Verified context (from session 2026-05-25 — do not re-derive)

The previous session loaded all 5 fixtures in Playwright, extracted exact node + cluster center coordinates from both renderers' SVGs, and produced **regression baselines** at repo root:

| File | Contents |
|---|---|
| `D:\CODE\MermaidBrainStorm\layout-data.json` | Cluster + node centers for fixtures 1-4, both Mermaid reference and our renderer |
| `D:\CODE\MermaidBrainStorm\layout-data-200.json` | Cluster centers for fixture200 (nodes omitted — too many) |
| `D:\CODE\MermaidBrainStorm\fx1-small.png` | fixture.mmd visual baseline |
| `D:\CODE\MermaidBrainStorm\fx2-crosscluster.png` | fixture_crosscluster.mmd visual baseline |
| `D:\CODE\MermaidBrainStorm\fx3-acyclic.png` | fixture_crosscluster_acyclic.mmd visual baseline |
| `D:\CODE\MermaidBrainStorm\fx4-nested.png` | fixture_nested.mmd visual baseline |
| `D:\CODE\MermaidBrainStorm\fx5-200.png` | fixture200.mmd visual baseline |

**Verdicts per fixture (verified numerically):**

| Fixture | Pre-Spike-5 status |
|---|---|
| `fixture.mmd` | ✅ PARITY (Payment_System above Authentication; all branches match) |
| `fixture_crosscluster.mmd` | ❌ STRUCTURAL DIVERGENCE — Mermaid puts External cluster side-by-side with Frontend at top; ours puts External at bottom in vertical chain |
| `fixture_crosscluster_acyclic.mmd` | ❌ LOCAL DIVERGENCE — Cluster order matches but AuthCheck branch mirrored: Mermaid RateLimit x=365 (LEFT of AuthCheck x=434); ours RateLimit x=725 (RIGHT of AuthCheck x=622) |
| `fixture_nested.mmd` | ✅ PARITY on all cluster invariants (Services above Storage; Auth left of Payments; Token left of Session; Refund left of Card; PrimaryDB left of Cache). Latent `node→subgraph` crash but workaround already in fixture |
| `fixture200.mmd` | ❌ CATASTROPHIC — 8 top-level clusters sprawl ~6000px wide in approx reverse-declaration order; Mermaid fits same graph in ~600px wide compact layout |

**Honest expectation for Suggestion 1:**
- *Maybe* shifts `fixture_crosscluster.mmd` and `fixture_crosscluster_acyclic.mmd` a little.
- **Almost certainly does NOT fix `fixture200.mmd`.** That fixture fails for structural layout-topology reasons (lack of per-cluster extraction), not for back-edge selection. The point is to confirm this with evidence so we never have to wonder.
- Should not regress fixtures already at parity. If it does, the change is wrong.

**Honest expectation for Suggestion 2:**
- Doesn't touch any visible fixture (all our existing fixtures avoid `node → subgraph` syntax — `fixture_nested.mmd` had the workaround applied).
- **Add a new fixture** `spike5/fixture_node_to_subgraph.mmd` that exercises the bug, to prove the fix works.

---

## Environment & setup

```powershell
# From repo root D:\CODE\MermaidBrainStorm
git status               # confirm starting branch + verify untracked artifacts are present
git checkout -b spike5   # off whichever base the user prefers — ASK
Copy-Item -Recurse spike4 spike5

# Clean stale build artifacts that may have copied
Remove-Item -Recurse -Force spike5\dist, spike5\node_modules -ErrorAction SilentlyContinue

cd spike5
npm install              # ~15s, ~175 packages
# Test that vite still runs cleanly
npm run dev              # should pick first free port from 5173 upward
```

**Things to update in `spike5/` after the copy** (to avoid confusion with spike4):
- `spike5/index.html` — title says "Spike 3 — Collapse / Expand subgraphs" (stale from spike4); update to "Spike 5 — Layout parity experiments"
- `spike5/our-renderer.html` — `<h2>` says "Spike 4 — Pan the canvas..."; update to mention this is the spike5 experiment build
- `spike5/package.json` — `name: "spike4"`, change to `"spike5"`
- `spike5/vite.config.ts` — check if it has any hardcoded paths (it didn't in spike4 last I looked, but verify)

**Vite ports — leftover dev servers from prior session.** The previous session left two background vite processes running on ports 5175 and 5176 — they may or may not still be alive. If your fresh `npm run dev` picks a different port, just use that. Don't try to kill the old ones unless they're confirmed running and blocking.

**Playwright MCP is loaded in your session.** CLAUDE.md says don't use by default; user explicitly authorized for this parity work in the prior session. Same authorization carries forward for Spike 5 verification.

---

## Suggestion 1 implementation — `sortNodesByHierarchy`

### What it does

Mermaid's `sortNodesByHierarchy` (`dagre-KV5264BT.mjs` line 382) walks the graph DFS-style starting from `graph.children()` (i.e., top-level nodes) and emits each node followed recursively by its children. Result: a flat list in parent-then-children order.

When Mermaid then calls `dagre.layout()`, the underlying `dfsFAS` algorithm (used for cycle breaking) walks `g.nodes()` in their insertion order. So `sortNodesByHierarchy` controls which back-edge `dfsFAS` picks first, which in turn determines which subgraph ends up above which on cycles.

We currently insert nodes in IR declaration order: all subgraphs first, then all leaf nodes. That's NOT parent-then-children. The hypothesis (§8.10 sub-option 2 of HANDOFF_PARITY): mimicking Mermaid's order might be enough to flip the back-edge picks.

### Where to change

`spike5/src/layout.ts` — the `layout()` function, currently inserts nodes around lines 250-272.

### The patch

Add a helper `sortNodesByHierarchy(ir): string[]` near the top of the file (after the existing helper functions). It should return ids in parent-then-children order. Reference implementation:

```typescript
// Mirror of Mermaid's sortNodesByHierarchy + sorter (dagre-KV5264BT.mjs:370-382).
// Walks the subgraph + leaf-node hierarchy DFS-style, returning ids in
// parent-then-children order. Used to control dagre's node insertion order
// so dfsFAS picks back-edges the same way Mermaid does.
function sortNodesByHierarchy(ir: IR): string[] {
  // children-of-parent maps
  const sgChildren = new Map<string | undefined, string[]>();
  for (const sg of ir.subgraphs) {
    const key = sg.parent;  // undefined means top-level
    if (!sgChildren.has(key)) sgChildren.set(key, []);
    sgChildren.get(key)!.push(sg.id);
  }
  const nodeChildren = new Map<string | undefined, string[]>();
  for (const n of ir.nodes) {
    const key = n.parent;
    if (!nodeChildren.has(key)) nodeChildren.set(key, []);
    nodeChildren.get(key)!.push(n.id);
  }
  const out: string[] = [];
  function emit(parent: string | undefined): void {
    // Mermaid's `sorter` emits the parent's children first, then recurses.
    // For us, that's: for each child subgraph, emit it AND its descendants;
    // then emit this parent's leaf children. The exact order within siblings
    // mirrors IR declaration order (Maps preserve insertion order).
    for (const sgId of sgChildren.get(parent) ?? []) {
      out.push(sgId);
      emit(sgId);
    }
    for (const nId of nodeChildren.get(parent) ?? []) {
      out.push(nId);
    }
  }
  emit(undefined);
  return out;
}
```

Then **replace the existing two-loop node insertion** in `layout()` (the loop adding subgraphs and the loop adding leaf nodes) with a single ordered loop:

```typescript
const ordered = sortNodesByHierarchy(ir);
const sgById = new Map(ir.subgraphs.map(sg => [sg.id, sg]));
const nodeById = new Map(ir.nodes.map(n => [n.id, n]));

for (const id of ordered) {
  if (sgById.has(id)) {
    const sg = sgById.get(id)!;
    g.setNode(id, {
      label: sg.label,
      width: snap(sg.label.length * 8 + 24),
      height: snap(30),
    });
  } else if (nodeById.has(id)) {
    const n = nodeById.get(id)!;
    const { w: rawW, h: rawH } = sizeForShape(n.shape, n.label.length);
    const width = snap(rawW);
    const height = snap(rawH);
    if (n.pinned && n.x != null && n.y != null) {
      g.setNode(n.id, { label: n.label, width, height, x: n.x, y: n.y });
    } else {
      g.setNode(n.id, { label: n.label, width, height });
    }
  }
}

// Apply setParent in a SECOND pass (same as before). Parent must be set
// AFTER both parent and child exist as nodes.
for (const sg of ir.subgraphs) {
  if (sg.parent) g.setParent(sg.id, sg.parent);
}
for (const n of ir.nodes) {
  if (n.parent) g.setParent(n.id, n.parent);
}
```

**Edge insertion loop stays unchanged** — edges still iterate `ir.edges` in declaration order.

**Everything below `dagreLayout(g)` stays unchanged** — branch ordering correction, position writeback, edge waypoint clipping, etc. all stay.

### Watch-outs

- **Don't change `g.setEdge` order.** Only node insertion order matters for `dfsFAS`. If you change edge order too, you confound the experiment.
- **Don't remove or modify `chooseEdgesToReverseForMermaidOrder` or `fixBranchOrderingPerSubgraph`.** Those are separate adapters. We're isolating one variable.
- **Compound graphs require setParent AFTER setNode for both parent and child.** That's why setParent is its own pass.

### Verification

```typescript
// Re-run the same Playwright script as the prior session. The full script lives
// in the conversation history; the abbreviated form is:
async () => {
  const fixtures = ['fixture.mmd', 'fixture_crosscluster.mmd',
                    'fixture_crosscluster_acyclic.mmd', 'fixture_nested.mmd',
                    'fixture200.mmd'];
  // ... for each fixture, navigate left = mermaid-reference.html, right = our-renderer.html,
  // wait for render, extract cluster + node bbox centers, return as JSON.
}
```

Save output to `spike5/layout-data-spike5-s1.json`. Diff against `D:\CODE\MermaidBrainStorm\layout-data.json` and `layout-data-200.json` per fixture.

**Report per fixture: improved / unchanged / regressed.** Be specific — name which clusters or nodes shifted and by how much. If a fixture regressed, that's a stop-and-think moment, not a stop-and-revert.

---

## Suggestion 2 implementation — `node → subgraph` crash fix

### What the crash is

`@dagrejs/dagre`'s compound layout does not support edges where an endpoint is a compound node (one with children via `setParent`). When fed such an edge, it throws:

```
TypeError: Cannot set properties of undefined (setting 'rank')
```

Mermaid handles this via `adjustClustersAndEdges` (which we explicitly chose not to port — see Decision 3 in `architecture-decisions-renderer.md`). Without that handling, any user diagram with `nodeA --> SomeSubgraph` syntax crashes our renderer.

`fixture_nested.mmd` originally had this issue (`Entry --> Platform_Top`); the workaround was to redirect to inner anchors (`Entry --> PlatformIngress`). That's why the fixture currently renders. **The bug is real and latent.**

### Where to fix

`spike5/src/parser-adapter.ts` — after the IR is fully constructed (nodes, edges, subgraphs all built), add a rewrite pass before returning.

### Strategy

Mermaid's approach (per `findNonClusterChild` at `dagre-KV5264BT.mjs:161`): recursively walk into the cluster's children until you find a leaf (non-subgraph) node, return that leaf's id, use it as the edge endpoint. Prefer leaves that don't already have many incoming edges, but a simple "first leaf descendant in declaration order" is fine for v1.

### The patch

In `parser-adapter.ts`, add this helper near the top of the file:

```typescript
// Recursively find a leaf (non-subgraph) descendant of a given subgraph id.
// Returns the leaf id, or undefined if the subgraph has no leaf descendants.
// Used to rewrite edges whose endpoint is a subgraph id — @dagrejs/dagre's
// compound layout crashes if an edge endpoint is a compound node. We pick the
// first leaf descendant in declaration order and reroute the edge there.
// This mirrors Mermaid's findNonClusterChild (dagre-KV5264BT.mjs:161), minus
// the findCommonEdges scoring — that scoring exists for the rendering splice
// case which we don't have; first-leaf is sufficient for crash avoidance.
function firstLeafDescendant(
  sgId: string,
  subgraphsById: Map<string, any>,
  subgraphIds: Set<string>
): string | undefined {
  const sg = subgraphsById.get(sgId);
  if (!sg) return undefined;
  for (const childId of sg.nodes) {
    if (subgraphIds.has(childId)) {
      const inner = firstLeafDescendant(childId, subgraphsById, subgraphIds);
      if (inner) return inner;
    } else {
      return childId;
    }
  }
  return undefined;
}
```

Then, inside `parseToIR`, after `rawEdges` is mapped to `edges` but before the return statement, add the rewrite pass:

```typescript
// Rewrite edges whose endpoint is a subgraph id — @dagrejs/dagre crashes
// on `nodeA --> SomeSubgraph` syntax because compound nodes can't be edge
// endpoints. Reroute to the first leaf descendant of the subgraph. Drop
// the edge if no leaf descendant exists (empty subgraph).
const subgraphsByIdMap = new Map(rawSubgraphs.map((sg: any) => [sg.id, sg]));
const rewrittenEdges: IREdge[] = [];
for (const e of edges) {
  let from = e.from;
  let to = e.to;
  let rewrote = false;
  if (subgraphIds.has(from)) {
    const leaf = firstLeafDescendant(from, subgraphsByIdMap, subgraphIds);
    if (!leaf) continue;  // drop edge — subgraph is empty
    from = leaf;
    rewrote = true;
  }
  if (subgraphIds.has(to)) {
    const leaf = firstLeafDescendant(to, subgraphsByIdMap, subgraphIds);
    if (!leaf) continue;  // drop edge — subgraph is empty
    to = leaf;
    rewrote = true;
  }
  rewrittenEdges.push(rewrote ? { ...e, from, to } : e);
}
return { nodes, edges: rewrittenEdges, subgraphs };
```

### Add a regression fixture

Create `spike5/fixture_node_to_subgraph.mmd`:

```
flowchart TD
    Entry([Entry]) --> Platform
    Platform --> Done([Done])

    subgraph Platform [Platform]
        direction TB
        Ingress[Ingress]
        Router{Router}
        Egress[Egress]
        Ingress --> Router
        Router --> Egress
    end
```

This is the exact pattern that crashes today. After the fix, it should render with `Entry → Ingress` (first leaf descendant) and `Egress → Done` (or wherever the leaf-descendant pick lands).

Add it to `spike5/index.html`'s fixture-select dropdown.

### Watch-outs

- **Edge drop on empty subgraph.** The patch silently drops edges to empty subgraphs. That's probably correct (an edge to nothing has no rendering anyway), but document it. If a user is writing pathological cases, a console.warn might be friendlier.
- **Both endpoints might be subgraphs.** The patch handles each independently. If both rewrites resolve to the same leaf id, the edge becomes a self-loop — dagre handles self-loops, but they look weird. Probably acceptable; document.
- **Don't touch `effective-ir.ts` or `collapse.ts`.** Those operate on the canonical IR and assume subgraph ids are stable. The rewrite happens in `parser-adapter.ts` upstream of all of that, so the canonical IR never sees a subgraph-endpointed edge.
- **The IR shape changes slightly.** Now every edge's `from` and `to` are guaranteed to be leaf-node ids, never subgraph ids. That's a new invariant. If anything downstream was relying on the possibility of subgraph-endpointed edges (it shouldn't be — we never supported them), this might surface bugs. Verify with full Playwright sweep, not just the new fixture.

### Verification

1. Load `spike5/fixture_node_to_subgraph.mmd` in `spike5/index.html`. Confirm both renderers render without crashing. Visual side-by-side.
2. Re-run the 5-fixture Playwright sweep. Confirm `fixture.mmd`, `fixture_crosscluster.mmd`, `fixture_crosscluster_acyclic.mmd`, `fixture_nested.mmd`, `fixture200.mmd` all still match their pre-Suggestion-2 baselines (this fix should be a no-op for them — all 5 existing fixtures avoid `node → subgraph` syntax).
3. Save output to `spike5/layout-data-spike5-s2.json`.

---

## Combined verification at end of spike

After both patches land:

1. Save final numeric output as `spike5/layout-data-spike5-final.json`.
2. Take final screenshots as `spike5/fx*-spike5.png` for the same 5 fixtures plus the new `fixture_node_to_subgraph` one.
3. Write `spike5/SPIKE5_RESULTS.md` summarizing:
   - Per-fixture: numeric diff from baseline, pass/regress/no-change verdict.
   - Net parity status: is anything now matching Mermaid that wasn't before?
   - Recommendation: do we commit Suggestion 1 to spike4 (or merge spike5 → main)? Do we escalate to the structural port handoff?

**Do not declare done on typecheck.** The prior session's documented failure mode (`HANDOFF_PARITY.md` §5) was exactly that. Visual verification per fixture is mandatory.

---

## Risks to flag during work

1. **Suggestion 1 might silently regress fixtures already at parity** (`fixture.mmd`, `fixture_nested.mmd`). The existing branch-ordering corrections were tuned against the current node-insertion order. Changing the insertion order may shift dagre's column choices in ways that bypass or invalidate those corrections. Watch for regressions, don't just check the divergent fixtures.

2. **`fixture200.mmd` is slow.** 191 nodes, 24 subgraphs. The Playwright extract may need a longer wait (8-10s) for both renderers to settle. The prior session used `setTimeout(r, 8000)` for fixture200 and `3500` for others.

3. **`@dagrejs/dagre` and Mermaid's `dagre-d3-es` are equivalent** (verified in prior session by reading both `acyclic.js` files). So porting Mermaid's node insertion order is meaningful — the underlying DFS-FAS will respond to it the same way.

4. **The user's parity tolerance is tight.** Quote from this session: *"minor differences in mirroring can cause huge difference in nodes with multiple nesting or cross cluster links, so we need to be really careful in accepting any difference."* A 50-pixel shift in a single cluster center is worth flagging, not handwaving.

5. **CLAUDE.md governs Playwright use.** It says don't use by default. User authorized for parity verification in the prior session. Re-confirm at session start if unsure, but for THIS specific work, you're authorized.

---

## Files / paths quick reference

| Path | Purpose |
|---|---|
| `D:\CODE\MermaidBrainStorm\HANDOFF_PARITY.md` | Prior session's deep parity doc. §1, §3, §8 are required reading. |
| `D:\CODE\MermaidBrainStorm\spike4\src\layout.ts` | Suggestion 1 lives in here (after copying to `spike5/src/layout.ts`). |
| `D:\CODE\MermaidBrainStorm\spike4\src\parser-adapter.ts` | Suggestion 2 lives in here (after copying to `spike5/src/parser-adapter.ts`). |
| `D:\CODE\MermaidBrainStorm\spike\node_modules\mermaid\dist\chunks\mermaid.core\dagre-KV5264BT.mjs` | Mermaid's actual source. Lines 161 (`findNonClusterChild`), 370-382 (`sorter` / `sortNodesByHierarchy`). Verify ports against this file. |
| `D:\CODE\MermaidBrainStorm\layout-data.json` | Baseline numeric layout data for fixtures 1-4 from prior session. **Diff baseline.** |
| `D:\CODE\MermaidBrainStorm\layout-data-200.json` | Baseline for fixture200. |
| `D:\CODE\MermaidBrainStorm\fx*.png` | Visual baselines from prior session. Keep them. |
| `C:\Users\ahmed\AppData\Local\Temp\claudeHandoffs\structural-port-handoff-2026-05-25.md` | Deferred handoff for Suggestion 3 (the deep port). Reference if Spike 5 results indicate escalation. |
| `C:\Users\ahmed\.claude\projects\D--CODE-MermaidBrainStorm\memory\MEMORY.md` | User's persisted preferences. Includes "understand before proposing" rule. |

---

## Memory / preferences the next agent should already know

(Auto-loaded if your session is in this project. Listed here for explicit reference.)

1. **For architectural problems, fully read code + verify visually before proposing approaches.** Playwright is authorized for verification on this parity work specifically.
2. **CLAUDE.md says don't use Playwright by default.** Exception is parity verification per (1).
3. **The previous session documented this failure mode:** assistant trusted typecheck without visual verification, missed regressions. Don't repeat.

---

## Definition of done

- [ ] `spike5` branch + folder exist, copied from `spike4`, `npm install` + `npm run dev` work cleanly.
- [ ] `spike5/index.html` / `our-renderer.html` / `package.json` titles updated.
- [ ] Suggestion 1: `sortNodesByHierarchy` helper added; node insertion order in `layout()` uses it; existing adapters and edge insertion left unchanged.
- [ ] Suggestion 2: `firstLeafDescendant` helper added; edge rewrite pass added at end of `parseToIR`; `fixture_node_to_subgraph.mmd` added; dropdown updated.
- [ ] Playwright verification across all 6 fixtures (5 existing + new one); numeric diff vs. baseline reported per fixture.
- [ ] Screenshots taken for any fixture whose numbers changed materially.
- [ ] `spike5/SPIKE5_RESULTS.md` written with per-fixture verdict and recommendation.
- [ ] Two separate commits: one for Suggestion 1, one for Suggestion 2. Each commit message explains the experiment and the verified outcome.
- [ ] User informed: "results in `SPIKE5_RESULTS.md`. Suggestion 1 outcome: X. Suggestion 2 outcome: Y. Recommendation on next step: Z."

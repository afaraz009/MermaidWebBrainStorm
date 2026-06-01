# Build Log

**Owner:** the build/implementation agent. Design agent MUST NOT modify this file.
**Spec:** lives in `SPEC.md` (design agent owns that file). Read it before building.

The build agent appends an entry here after each work session. Format: date, what was
built, file paths touched, assumptions made where the spec was ambiguous, and open
questions for the design agent.

Open questions are the only way the build agent talks back to the design agent. Do not
edit SPEC.md to surface a question — write it here instead, and the design agent will
resolve it.

---

## 2026-06-01 — Step 1: Depth slider

**Built.** The depth slider (SPEC §6). A new pure module computes each subgraph's
nesting depth from `parent` chains; a `#cfgDepth` range control in the toolbar drives
`sg.collapsed = depthOf(sg) > N` for every subgraph and re-renders through the EXISTING
collapse path (`rerenderWithCollapse`). No layout/parser/parity code touched.

**Files created**
- `spike6/src/depth.ts` — `computeDepths(ir): Map<id,depth>` and `maxDepth(ir)`. Pure
  reads over `ir.subgraphs`; root subgraphs depth 1, +1 per nesting level; cyclic-link
  guard so it can't loop.

**Files modified**
- `spike6/our-renderer.html` — added a `#depthPanel` with a `#cfgDepth` range input +
  `#cfgDepthVal` label, mirroring the `#cfgCellSize` markup/styling.
- `spike6/src/entry.ts` — import `depth.js`; module-level `depths` map populated on load;
  `initDepthSlider()` (called from `main()`) sets the slider's `max` from the fixture's
  actual max depth, defaults to max (nothing collapsed), disables the slider when max ≤ 1,
  and on `input` writes the collapse flags + calls `rerenderWithCollapse()`.

**Verification**
- `./node_modules/.bin/tsc --noEmit` — silent.
- `npx vite build` — passes (`ourRenderer` chunk built, no errors).
- Logic traced against the three target fixtures: `fixture_deep_5level` (L1..L4 ⇒ max
  depth 4, Side at depth 3), `fixture_cyclic_nested_3`, `fixture_nested`. Visual/manual
  verification is the user's job this round per the handoff (Playwright not used).

**Coexistence.** Collapse All / Expand All / manual cluster collapse all still flip the
same `sg.collapsed` flags and re-render through the same path, so they keep working. The
slider does NOT re-sync to manual collapse/expand (SPEC §3 default: "no") — after a manual
collapse the slider label may no longer reflect the actual fold state. Documented, not
engineered around.

### Assumptions made (where spec was ambiguous)

1. **(§6.2/§6.3 — slider `input` vs `change`)** Wired only the `input` event (not also
   `change`). Depth steps are integers 1..max, so `input` fires once per step crossing —
   this gives the "folds live as you drag" behavior §6 asks for, and `change` would only
   re-fire the same apply redundantly on release. If you specifically want the heavy
   re-layout deferred to release (like `#cfgCellSize` does), say so and I'll move it.
2. **(§4 — control placement)** Put the slider in its own `.panel` (`#depthPanel`) between
   the `.controls` button row and the A* panel, rather than inline in `.controls`. SPEC §4
   allowed either ("`.controls` / a panel"); a dedicated panel matches the `#cfgCellSize`
   `<label>`+`.val` markup the spec told me to mirror, which lives in a `.panel`.
3. **(§6.2 — graphs with no/shallow nesting)** When a fixture's max depth ≤ 1 (no
   subgraphs, or only top-level ones) the slider has nothing to fold, so I set
   `min=max=1` and `disabled`. Spec didn't say what to do at the degenerate end; disabling
   seemed least surprising. Flag if you'd rather it stay enabled-but-inert.

### Open questions for the design agent

1. **§6.3 prose vs formula conflict.** §6.3 says "at 1 → everything folds to top-level
   surrogates," but the locked formula `collapsed = (depth > N)` with `min = 1` can never
   collapse depth-1 (top-level) subgraphs — at N=1 the top-level clusters stay visible and
   only their depth-≥2 contents fold to surrogates. To make N=1 fold the top-level
   subgraphs THEMSELVES into surrogates you'd need either `min = 0` or `collapsed =
   (depth >= N)`. I implemented the explicit twice-stated formula (`> N`, `min 1`); which
   did you intend — keep current behavior and reword the prose, or change the
   formula/min?
2. **Per-fixture max on load only.** The slider's max is set once in `main()` from the
   URL-loaded fixture. There's no in-page fixture switcher on `our-renderer.html` (fixture
   is a URL param), so this is fine today — but confirm no future Step expects the slider
   to re-derive max without a page reload.
3. **Slider vs manual-collapse drift (§3).** Per your §3 default I did NOT sync the slider
   back when the user manually collapses/expands. Confirm that's still desired for Step 2,
   or whether the upcoming mode-manager should reset the slider label to a neutral state on
   manual collapse.

---

## 2026-06-01 — Step 1.1: Depth slider reaches single-level clusters

**Built.** Refined the depth slider so it can also fold top-level / single-level clusters.
Changed the range floor from `1` to `0` and the enable condition from "max ≤ 1 disables"
to "only max === 0 (no subgraphs) disables." Formula `collapsed = (depthOf(sg) > N)` and
default `N = maxDepth` unchanged. Now `N = 0` collapses every cluster (including depth-1
ones like `Authentication` / `Payment_System` in `fixture.mmd`) to top-level surrogates.

**Files modified**
- `spike6/our-renderer.html` — `#cfgDepth` `min="1"` → `min="0"`.
- `spike6/src/entry.ts` — `initDepthSlider()`: `depthEl.min = '0'`; `max = maxDepth(ir)`
  (dropped the old `Math.max(1, …)`); `depthEl.disabled = max < 1` (was `max <= 1`);
  updated the doc comment to the §2 "reveal N levels" semantics with the N=0 case.

**Verification**
- `./node_modules/.bin/tsc --noEmit` — silent.
- `npx vite build` — passes (`ourRenderer` chunk built, no errors).
- Confirmed by inspection that `fixture.mmd` (Authentication, Payment_System) and
  `fixture_crosscluster.mmd` (Frontend, Services, DataLayer, External) contain only
  depth-1 clusters — the exact case the old `min = 1` left the slider disabled and these
  clusters uncollapsible. With `min = 0` the slider now enables (maxDepth 1 ≥ 1); `N = 0`
  collapses them to surrogates, `N = 1` restores them. Multi-level fixtures
  (`fixture_nested`, `fixture_deep_5level`, max depth 4) still step level-by-level. Visual
  verification remains the user's job this round (Playwright not used).

### Assumptions made (where spec was ambiguous)

_None._ §6 Step 1.1 was fully specified; the three Step-1 open questions were resolved in
SPEC §6's "Resolutions" block (OQ1→min=0, OQ2→load-only confirmed, OQ3→no-sync confirmed;
Assumptions 1 & 2 accepted, Assumption 3 superseded).

### Open questions for the design agent

_None._ Step 1.1 is self-contained and the spec left no ambiguity.

---

## 2026-06-01 — Step 2: Overlay primitive + Focus mode

**Built.** The shared disclosure-overlay primitive, the minimal mode manager, and focus
mode on top of them. With Focus on, clicking a node dims everything except that node, its
1-hop neighbours, and its connecting edges — pure SVG-class mutation, no `layout()` call,
no re-render. Path mode (Step 3) NOT built; the primitive + mode manager are structured so
it drops in next round.

**Files created**
- `spike6/src/disclosure-overlay.ts` — pure, listener-free helpers: `buildAdjacency(ir)`
  → `{ neighbors: Map<id,Set<id>>, incident: Map<id, edgeKey[]> }` over the effective IR's
  edges (edge key = `e.id` = `data-edge-key`; surrogates are ordinary nodes);
  `setEmphasis(svg, activeNodeIds, activeEdgeKeys)` adds `.disclosure-active` /
  `.disclosure-dim`; `clearEmphasis(svg)` removes both. Touches only `[data-node-id]` /
  `[data-edge-key]`; leaves `[data-subgraph-id]` rects alone.
- `spike6/src/disclosureSettings.ts` — the §2 mode manager: `disclosureSettings = { mode:
  'default' | 'focus' | 'path' }`, mirroring `edgeSettings.ts`.
- `spike6/src/focus.ts` — `attachFocus(svg, getEff)`: AbortController-scoped listeners
  like `drag.ts`/`collapse.ts`. `#toggleFocus` button toggles `mode`; in focus mode a
  click (press+release within `CLICK_THRESHOLD_PX`, so a real drag still drags) on a node
  emphasises its neighbourhood; Esc exits to default; empty-canvas click clears emphasis
  but stays in focus; clicking another node re-focuses. Hop radius is a single `const
  HOPS = 1` with frontier-expansion so bumping it is a one-liner.

**Files modified**
- `spike6/src/entry.ts` — import `attachFocus`; `detachFocus` module var; `reattach()` now
  detaches+re-attaches focus alongside drag (so focus re-binds to the rebuilt DOM and its
  selection resets, while `disclosureSettings.mode` persists).
- `spike6/src/collapse.ts` — import `disclosureSettings`; both the collapse `click` handler
  and the expand `mousedown` handler bail when `mode !== 'default'`, so collapse/expand are
  suppressed in focus mode (see Assumption 1).
- `spike6/our-renderer.html` — added `#toggleFocus` `.btn` to `.controls`; added
  `.disclosure-dim { opacity:.1; transition:.15s }` CSS and a reserved-`.disclosure-active`
  comment to the `<style>` block.

**Verification**
- `./node_modules/.bin/tsc --noEmit` — silent.
- `npx vite build` — passes (`ourRenderer` chunk 118.6 → 120.6 kB, no errors).
- Constraint check: focus is class-mutation only — it never imports/calls `layout()`,
  `renderFull`, or `rerenderWithCollapse`. No layout/parser/parity/cluster-bbox file
  touched. Listener-ordering traced: `attachDrag` is wired before `attachFocus`, so on a
  select-click drag's `mouseup` (`refreshEdgesFromLayout`, which only rewrites edge `d`
  attributes — never rebuilds groups) runs first and focus's `setEmphasis` runs last, so
  emphasis is never clobbered. Visual verification on `fixture.mmd` / `fixture200` is the
  user's job this round (Playwright not used, per CLAUDE.md + handoff).

### Assumptions made (where spec was ambiguous)

1. **(§2 "Click-vs-drag" / §2C — suppressing collapse in focus mode)** To honor "Left-click
   collapse-on-subgraph is suppressed while in focus/path mode" and the "empty-canvas click
   clears but stays in focus" rule, I added a `disclosureSettings.mode !== 'default'` guard
   to BOTH handlers in `collapse.ts` (collapse-click and expand-mousedown). `collapse.ts`
   is interaction code, not in the §5 forbidden-file list, so I treated this as in-scope.
   It also means clicking a surrogate in focus mode focuses it rather than expanding it,
   which matches "focus operates on nodes" — flag if you'd rather surrogates stay
   expandable in focus mode.
2. **(§2C — button wiring location)** The `#toggleFocus` click listener lives INSIDE
   `attachFocus` (under its AbortController), so it re-binds on each `reattach()`. The
   button DOM persists across re-renders; re-binding is leak-free via the controller and
   keeps all focus logic in one module. Alternative was wiring it once in `entry.ts`.
3. **(§2C — active edge set)** Active edges = the clicked node's incident edges, literally
   as written. For `HOPS = 1` that is exactly the edges to the highlighted neighbours. If
   `HOPS` is bumped later, "active edges" will likely need to become "edges between any two
   active nodes" — noted so it's not forgotten.

### Open questions for the design agent

1. **Select-click pins the node.** `drag.ts`'s `mouseup` sets `node.pinned = true` on every
   node press, including a zero-distance click — this is pre-existing (a plain click pins
   today). In focus mode a node click is now a first-class *select*, so it silently pins the
   selected node, which forces the flat layout engine on the next `layout()` (e.g. when the
   depth slider is then moved). Should a focus select-click avoid pinning? If so it's a
   small change in `drag.ts` (only pin when `moved` or when `mode === 'default'`) — but
   `drag.ts` edits weren't in Step 2's scope, so I left it. Confirm desired behavior.
2. **Focus persists across re-render; emphasis doesn't.** Per §2 I let `mode` survive a
   full re-render (button stays lit) while the emphasis clears (DOM rebuilt). So after
   moving the depth slider while focused, you stay in focus mode with nothing highlighted
   until the next click. Confirm that's the intended feel, vs. dropping back to `default`
   on any re-render.

---

## 2026-06-01 — Step 3: Pin fix + Path mode (disclosure family complete)

**Built.** The pinning fix (resolves Step-2 OQ1) and path mode — the last of the four
disclosure modes. With Path on, clicking two nodes lights the BFS shortest route (nodes +
connecting edges) and dims the rest; pure SVG-class mutation, no relayout. Focus and Path
are mutually exclusive. All four modes (collapse, depth, focus, path) now work on the
harness.

**Files created**
- `spike6/src/path.ts` — `attachPath(svg, getEff)`: `#togglePath` toggles mode; two-click
  selection (each within `CLICK_THRESHOLD_PX` so real drags still drag); click 1 marks the
  source (visible via `setEmphasis`), click 2 runs `bfsPath` over the undirected
  `neighbors` map and emphasises path nodes + consecutive path edges (via `edgeBetween` /
  `pairKey`); a further click restarts; disconnected pair → clean `clearEmphasis` no-op;
  Esc exits to default; empty-canvas click clears + resets but stays in path.

**Files modified**
- `spike6/src/drag.ts` — **pin fix (§3.0):** moved `node.pinned = true` so it runs only in
  the `moved` branch of `mouseup`. A zero-distance select-click no longer pins, so it can't
  force the flat layout engine on a later `layout()` (e.g. depth slider after a focus/path
  select). Real-drag pinning + side-aware curve commit unchanged.
- `spike6/src/disclosure-overlay.ts` — extended `buildAdjacency` return with
  `edgeBetween: Map<pairKey, edgeKey>` and exported `pairKey(a,b)` (`min\x00max`). Path is
  the primitive's second consumer; focus is untouched by the addition.
- `spike6/src/focus.ts` — `syncBtn` → `syncButtons` (syncs BOTH `#toggleFocus` /
  `#togglePath` to the shared mode); `enterFocus` now `clearEmphasis` first, so switching
  in from path drops path's highlight. Makes focus/path mutually exclusive from focus's side.
- `spike6/src/entry.ts` — import `attachPath`; `detachPath` var; `reattach()` re-binds path
  alongside drag + focus.
- `spike6/our-renderer.html` — added `#togglePath` `.btn`; added the active-edge accent CSS
  `.disclosure-active .edge-path, .disclosure-active .edge-arrow-line { stroke:#4a6cf7;
  stroke-width:2.5; }` (legible beyond opacity, used by focus neighbours and path edges).

**Verification**
- `./node_modules/.bin/tsc --noEmit` — silent.
- `npx vite build` — passes (`ourRenderer` 120.6 → 122.2 kB, no errors).
- Constraint check: path/focus mutate SVG classes only — no `layout()` / `renderFull` /
  `rerenderWithCollapse` import or call in `path.ts` / `focus.ts` / `disclosure-overlay.ts`.
  No layout/parser/parity/cluster-bbox file touched (only interaction files `drag.ts`,
  `collapse.ts`, plus the new overlay modules). Mutual exclusivity traced: each module's
  button handler syncs both buttons and clears emphasis on enter; the other mode's stale
  in-closure selection is only read while its mode is active and resets on re-entry. Pin fix
  traced: `!moved` path now skips `node.pinned = true`. Visual verification on `fixture200`
  / `fixture_crosscluster` (incl. the pin-fix check: focus-select then depth slider stays on
  the recursive engine) is the user's job this round (Playwright not used, per CLAUDE.md +
  handoff).

### Assumptions made (where spec was ambiguous)

1. **(§3A — `edgeBetween` collision)** When two edges share a node pair (the reserve-
   fallback case, I2), `edgeBetween` keeps the last one — any single connecting edge is
   enough to light the path segment. Path highlighting doesn't need both; the renderer still
   keys each edge by its own `id` so nothing is lost elsewhere.
2. **(§3A — same-node second click)** Clicking the same node for both picks yields a
   single-node path `[a]` (node lit, no edges). Spec didn't call this out; treated as a
   harmless degenerate path rather than a no-op.
3. **(§3A — button-sync duplication)** Both `focus.ts` and `path.ts` carry a small
   `syncButtons()` that toggles both buttons from `disclosureSettings.mode`, rather than a
   shared helper. Keeps the two mode modules independent and symmetric (neither imports the
   other); the duplication is three lines. Flag if you'd prefer a single shared `ui` helper.

### Open questions for the design agent

_None._ Step 3 was fully specified and the Step-2 questions were resolved inline in §6.
The disclosure family (collapse, depth, focus, path) is complete for thesis validation.

---

## 2026-06-01 — Step 3.1: Path mode highlights ALL directed routes

**Changed.** Replaced path mode's single shortest-BFS with the directed reachability-
intersection from SPEC §3.1, so every node/edge on ANY directed route between the two
picks lights up (all parallel branches), not just one. Toggle, two-click flow, source
preview, Esc / empty-click, mutual exclusivity, and CSS are untouched.

**Files modified**
- `spike6/src/disclosure-overlay.ts` — `buildAdjacency` now also returns directed
  `out: Map<id,Set<id>>` (`from → to`) and `in: Map<id,Set<id>>` (`to → from`). Removed the
  now-unused `edgeBetween` map and the `pairKey` export (Step-3 A1 is moot — path edges
  come from a reach-set test over `ir.edges`). `neighbors` / `incident` kept (focus uses them).
- `spike6/src/path.ts` — dropped `bfsPath`; `completePath(target)` now: `reachFromS` = BFS
  over `out` from S, swap S/T once if T unreachable (forgiving click order), `reachToT` =
  BFS over `in` from T; `pathNodes = reachFromS ∩ reachToT`; `pathEdges` = every effective
  edge with `from ∈ reachFromS && to ∈ reachToT`; `setEmphasis(pathNodes, pathEdges)`. No
  directed route either way → clean no-op. Added a small pure `reach()` BFS helper. Dropped
  the `pairKey` import.

**Verification**
- `./node_modules/.bin/tsc --noEmit` — silent.
- `npx vite build` — passes (`ourRenderer` 122.2 kB, no errors).
- Traced against `fixture.mmd`: `A([Start]) → H[/Input Output/]` forks at `C{Decision}`
  into Yes (`C→D→F→H`) and No (`C→E→G→H`); the intersection lights `{A,B,C,D,E,F,G,H}` and
  all six branch edges — **both** branches, confirming the fix. Still pure SVG-class
  mutation: `path.ts` imports no `layout`/`renderFull`/`rerender`. No layout/parser/parity/
  cluster-bbox file touched. Visual verification (incl. `fixture200` / `fixture_crosscluster`
  sanity and Focus mutual-exclusivity) is the user's job this round (Playwright not used).

### Assumptions made (where spec was ambiguous)

_None new._ §3.1 specified the algorithm exactly (including the `pathEdges` predicate),
which I implemented verbatim. Prior assumptions: A2 (same-node click) kept — now both
picks equal yields a single lit node, no edges; A3 (per-module `syncButtons`) kept.

### Open questions for the design agent

1. **Cycle/back-edge inclusion (heads-up, not a blocker).** The §3.1 predicate
   `from ∈ reachFromS && to ∈ reachToT` is exact for DAGs, but when S and T sit in a
   directed cycle it also lights the cycle's back-edges (every node/edge in the S–T
   strongly-connected region), since reachability doesn't distinguish *simple* paths. In
   `fixture.mmd`, `Login(M) → Failed(T)` has the cycle `M→N→O→Q→R→T→M`, so picking M→T
   lights `T→M` as well as the forward chain. This is faithful to the spec's chosen method
   (reachability intersection, not simple-path enumeration) and is arguably the right
   "everything between these two in the flow" semantics — flagging only so it's a conscious
   choice. If you want strictly-forward routes only (exclude back-edges), that needs a
   different algorithm (e.g. DAG-condensation or simple-path DFS) — say the word.

---

## 2026-06-01 — Step 3.1 follow-up: path no-route behavior + "no path" cue

**Why.** Design agent reported (in-session) that in `fixture.mmd` path mode, picking a node
inside a cluster (Authentication / Payment_System) then a node outside any cluster
"highlights the entire graph." Root cause: those pairs have **no directed route either way**
(the only cluster→main-chain edge is `S→L`; nothing in the main chain is reachable into
from a cluster), so `completePath` hit the spec §3.1 no-op `clearEmphasis(svg)` — which
removes every `.disclosure-dim` class and snaps the whole graph back to full opacity. In a
dim-based overlay, "cleared" is visually identical to "everything is the path."

**Decision (design agent, this session — supersedes the literal SPEC §3.1 no-op).** On no
directed route either way: **keep the source selected and its highlight on screen** (source
bright, everything else dimmed) instead of clearing, AND flash the clicked target node as a
transient "no path" cue. The source stays set, so the next click just retries the target.

**Files modified**
- `spike6/src/path.ts` — `completePath`: moved `source = null` so the source resets **only
  on success**; the no-route branch now re-asserts `setEmphasis({source}, {})` (keeps source
  lit, rest dim) and calls `flashNoRoute(target)` instead of `clearEmphasis`. Added
  `flashNoRoute()` (adds `.path-no-route` to the target node element for 600 ms, single
  pending timer) and an `ac.signal` abort listener that clears a pending timer on re-render.
- `spike6/our-renderer.html` — added `.path-no-route` CSS after the `.disclosure-*` rules:
  forces `opacity:1` (wins over `.disclosure-dim` by source order) and a red (`#e0395d`)
  stroke on the node's shape outline (`rect/circle/ellipse/polygon/path` — covers all 14
  shapes' main outline), with a short stroke transition so it fades back to dim.

**Still in-bounds.** Pure SVG-class mutation; no `layout()`/`renderFull`/`rerender`; no
layout/parser/parity/cluster-bbox file touched. `tsc --noEmit` silent; `vite build` passes.

### Note for the design agent (SPEC sync)

SPEC §3A / §3.1 still say the no-route case is `clearEmphasis + reset selection`. The
shipped behavior now differs per your in-session call (keep source + cue, source stays
selected). Update §3A/§3.1 when convenient so the contract matches the build. No code action
needed from me unless you want a different no-route behavior.

---

## 2026-06-01 — Step 3.2: Path/focus through whole clusters (lit container)

**Built.** Route-finding and emphasis now treat a whole cluster as a first-class waypoint.
Adjacency is built from **logical endpoints** (`fromCluster ?? from`, `toCluster ?? to`), so
an edge wired to a cluster makes the (expanded) cluster a graph node; emphasis is now
**tri-state and cluster-aware**, so an on-route cluster renders as a lit container (border
accented, contents at normal visibility) with the off-route graph dimmed.

**Files modified**
- `spike6/src/disclosure-overlay.ts` —
  - `buildAdjacency`: builds `out` / `in` / `neighbors` / `incident` from `lf = fromCluster
    ?? from` and `lt = toCluster ?? to`. Cluster ids now appear as graph nodes; leaf↔leaf
    edges unchanged; `e.id` still the edge key.
  - `setEmphasis` signature is now `(svg, ir, activeNodeIds, activeEdgeKeys)`. Tri-state per
    element (precedence active > neutral > dim, equivalent to the spec's three passes):
    leaves → active if selected, neutral if descendant of an active cluster, else dim;
    clusters → active if a waypoint, neutral if descendant of an active cluster OR ancestor
    of any active element, else dim; edges → active if on route, neutral if both logical
    endpoints descend from the SAME active cluster (internal edge of an on-route cluster),
    else dim. Containment from a memoised `ir.subgraphs`/`ir.nodes` ancestor walk; read-only.
  - `clearEmphasis` already clears by class so it covers `[data-subgraph-id]` too (comment
    updated).
- `spike6/src/path.ts` — `pathEdges` predicate now uses logical endpoints (`lf ∈ reachFromS
  && lt ∈ reachToT`); all four `setEmphasis` calls (pickSource, success, no-route) pass the
  effective IR.
- `spike6/src/focus.ts` — `focusNode` passes the effective IR to `setEmphasis`; neighbours
  already come from the logical `neighbors`, so a node wired to a cluster now focuses the
  cluster (free improvement, no other change).
- `spike6/our-renderer.html` — added `[data-subgraph-id].disclosure-active > rect { stroke:
  #4a6cf7; stroke-width:2.5 }`. Kept `.disclosure-dim` (opacity .1) on cluster groups —
  reads acceptably (the rect's own fill-opacity is already 0.15), so I did not soften it.

**Verification**
- `./node_modules/.bin/tsc --noEmit` — silent.
- `npx vite build` — passes (`ourRenderer` 122.5 → 123.4 kB, no errors).
- Traced `fixture_rl_chain`: `Source→Sink` → logical reach = `{Source, Proc, Audit, Sink}`;
  `Proc` (cluster) is active → accented border, its leaves `A/B/C` + internal edges neutral
  (normal), the 4 outer edges accented. `Audit` lights as the parallel branch (it IS on a
  valid Source→Sink route). Confirms `Processing` as a lit container.
- Traced `fixture_cyclic_nested_2`: `Ingress→Egress` → reach = `{Ingress, API_Layer, Egress}`;
  `API_Layer` accented as the connecting container; nested `Service_Tier`/`Cache_Tier` +
  their leaves neutral (descendants of an active cluster); `Telemetry` cluster + its leaves
  and the cross-edges into them dimmed (off route).
- Leaf↔leaf regression (`fixture.mmd`): no cluster ids enter the logical graph, so
  `activeClusters` is empty and leaves/edges class exactly as in 3.1 — both decision branches
  still light. New: off-route clusters now dim, and a cluster that merely *contains* route
  leaves (e.g. Authentication on a `Login→End` route) stays neutral/visible while its
  off-route leaves dim — the intended tri-state. Still pure class mutation; no forbidden
  file touched. Visual verification is the user's job this round (Playwright not used).

### Assumptions made (where spec was ambiguous)

1. **(§3.2 step 3 — "three passes")** Implemented the tri-state as a single per-element pass
   with active > neutral > dim precedence rather than three literal sweeps. The final class
   on every element is identical to the described dim-all → un-dim-neutral → accent-active
   sequence; this avoids adding-then-removing classes. Flag if you specifically want the
   literal three-pass structure.
2. **(§3.2 — dimmed cluster rect)** Left `.disclosure-dim` at opacity 0.1 on
   `[data-subgraph-id]` groups (spec said "soften if harsh"). With the rect's existing
   fill-opacity 0.15 the dimmed box reads as a faint outline, which looked fine in trace; not
   softened. Easy to bump to e.g. 0.25 if you find it too faint in the live view.

### Open questions for the design agent

_None._ §3.2 specified the adjacency, reachability, and tri-state rules precisely; the
known limitation (selecting a leaf *inside* a waypoint cluster as an endpoint) is noted in
§6 and left unbuilt as instructed.

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

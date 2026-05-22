# Spike 4 Implementation Plan — inherits Spike 3

> **Note for Spike 4 readers:** every step described below was completed for Spike 3 and ships verbatim in Spike 4 (the `spike4/` directory was created by copying `spike3/`). The Spike 4 *new* work — canvas pan, right-click context menus for canvas / node / edge / subgraph, **and the full Mermaid flowchart node-shape library** — is planned separately in `spike4_feature_Implementation.md` at the repo root. Read that for the new feature work. Read on for the inherited collapse / expand pipeline that Spike 4 must preserve.
>
> **Shape library callout:** Spike 3 only knew five shape buckets. Spike 4 expands `parser-adapter.ts::mapShape`, `types.ts::NodeShape`, `border.ts::clipToBorder` (with exported polygon-vertex builders), `renderer.ts::createShapeElements`, `menuActions.ts::SHAPES`, and the node context menu to cover all 15 Mermaid flowchart shapes. See `SPIKE4_NOTES.md` §"Shape library" for the canonical name table, and `spike4_feature_Implementation.md` §"Shape library implementation" for the per-module threading.

---

# Spike 3 Implementation Plan — Subgraph collapse / expand

Companion to `prompt-spike4.md` (renamed from `prompt-spike3.md`). Read that prompt first; this plan turns it into concrete steps grounded in what Spike 2 (`spike2/`) actually shipped.

---

## 0. Reality check against the prompt

A few things worth flagging up front:

1. **Spike 2's `renderer.ts` already paints subgraphs as siblings**, not nested DOM containers. This is a free win for delegated click: a click in an inner subgraph's painted area hits the inner rect first, so collapse semantics ("clicking the innermost subgraph collapses that one") fall out without `stopPropagation`. We don't need to touch the DOM nesting model.
2. **Spike 2's `drag.ts` already binds to `data-node-id`.** Surrogates carry `data-node-id` *and* `data-surrogate-for`. That means `drag.ts` works on surrogates with zero changes — the only new code is the click-vs-drag discriminator for the *expand* path, which lives in `collapse.ts`, not in `drag.ts`.
3. **`IREdge.routedPath` from Spike 2 must be cleared on every collapse / expand.** Otherwise an edge that was A\*-routed pre-collapse renders with a path grounded in the old layout origin, which looks broken. This clear is one line in `rerenderWithCollapse` but it's easy to miss.

---

## 1. Directory and file scaffold

Copy `spike2/` to `spike3/`. Final shape (* = new, ~ = modified, blank = unchanged from Spike 2):

```
spike3/
  package.json           ~ name → "spike3"
  tsconfig.json
  vite.config.ts
  index.html
  fixture.mmd
  fixture200.mmd
  mermaid-reference.html
  our-renderer.html      ~ + Collapse All / Expand All buttons; copy adjustments
  src/
    types.ts             ~ + `collapsed?: boolean` on IRSubgraph
    parser-adapter.ts
    layout.ts
    border.ts
    astar.ts
    astarSettings.ts
    routing.ts
    gridOverlay.ts
    renderer.ts          ~ + surrogate "+N" badge; recognize `__sg__` ids
    drag.ts              (no changes — works on surrogates because they carry data-node-id)
    effective-ir.ts      * NEW
    collapse.ts          * NEW
    entry.ts             ~ ir / currentEff split, rerenderWithCollapse, Collapse All / Expand All wiring
```

---

## 2. IR change

`src/types.ts` gets one new field:

```ts
export interface IRSubgraph {
  id: string;
  label: string;
  parent?: string;
  children: string[];
  collapsed?: boolean;  // NEW
}
```

That's it. The surrogate node itself is *not* a permanent IR entity — it's synthesized on the fly by `deriveEffectiveIR`.

---

## 3. `effective-ir.ts` (NEW)

Pure functions. No DOM. ~100 LOC target.

**Exports:**

```ts
export const SURROGATE_PREFIX = '__sg__';
export function surrogateIdFor(sgId: string): string;
export function isSurrogateId(id: string): boolean;
export function sgIdFromSurrogate(id: string): string;

export function deriveEffectiveIR(ir: IR): IR;
export function countHiddenDescendants(ir: IR, sgId: string): number;
```

**Implementation choices:**

- `SURROGATE_PREFIX = '__sg__'`. The double-underscore + lowercase keeps it visually distinct from user-authored Mermaid ids while staying short enough to debug-print.
- `outermostCollapsedAncestor(sgId, sgById)` walks the `parent` chain upward and returns the *highest* (closest-to-root) collapsed ancestor. "Outermost wins" — if both an outer and inner subgraph are collapsed, the outer one is the one whose surrogate shows.
- `deriveEffectiveIR` runs in four passes: (1) visible leaf nodes, (2) surrogate nodes (one per outermost-collapsed subgraph), (3) visible subgraphs (those not shadowed by any collapsed ancestor), (4) edges with both endpoints remapped + dedup + interior-edge drop.
- Each surrogate is a leaf-level `IRNode` with `shape: 'rect'`. It inherits the collapsed subgraph's `parent` so it nests correctly inside any visible outer subgraph.
- `countHiddenDescendants` counts *leaf* descendants only (across arbitrarily nested child subgraphs), used for the renderer's "+N" badge.

**What NOT to do:**

- Don't mutate `ir`. `deriveEffectiveIR` returns a fresh object. The source IR is canonical and should only be mutated by user actions (collapse toggle, drag pin, reset).
- Don't have surrogates carry references back to the inside graph. The transform is one-directional: source → effective. To "look inside" a collapsed subgraph, expand it.

---

## 4. `collapse.ts` (NEW)

One exported function:

```ts
export function attachCollapseHandlers(
  svg: SVGSVGElement,
  getIR: () => IR,
  rerender: () => void,
): () => void;
```

Returns a detach function (uses `AbortController` so all three listeners come off at once).

**Three listeners:**

1. **`svg.addEventListener('click', ...)`** — collapse. `(e.target as Element).closest('[data-subgraph-id]')`. If non-null, flip that subgraph's `collapsed = true` and call `rerender`. Returns early on non-subgraph clicks. No `stopPropagation` — relies on painting order (nodes/edges paint on top in their own layer).

2. **`svg.addEventListener('mousedown', ...)`** — capture potential expand. `(e.target as Element).closest('[data-surrogate-for]')`. If non-null, store `{x: clientX, y: clientY, sgId}` in a module-local `pressed` variable. If null, clear `pressed`.

3. **`window.addEventListener('mouseup', ...)`** — expand. If `pressed` is non-null and Euclidean distance from mousedown to current mouseup < `CLICK_THRESHOLD_PX` (= 4), flip that subgraph's `collapsed = false` and call `rerender`. Otherwise (moved ≥ 4px), do nothing — `drag.ts` has been handling the drag, and we don't want to expand-on-drop.

**Why mouseup is on `window`, not `svg`:** the user can release the mouse outside the SVG bounds (especially when zoomed in). Binding to `svg` would miss those releases and leave `pressed` stuck.

---

## 5. `entry.ts` changes

Three load-bearing additions:

### 5a. `ir` / `currentEff` split

```ts
let ir: IR;             // source of truth
let currentEff: IR;     // what renderer/drag/grid-overlay/A* see
```

Every place that previously passed `ir` to the renderer now passes `currentEff`. `attachCollapseHandlers` gets `getIR: () => ir` (closures over the live `ir` reference) so it always sees current `collapsed` flags.

### 5b. `rerenderWithCollapse`

```ts
function rerenderWithCollapse(): void {
  const overlayWasShown = isGridOverlayShown(svg);
  ir.edges.forEach(e => { delete e.routedPath; });   // stale relative to new layout
  currentEff = deriveEffectiveIR(ir);
  layout(currentEff);
  syncEffToSource();
  if (astarSettings.enabled) routeAllEffWithCurrentSeparation();
  renderFull(currentEff, svg, true, ir);
  reattach();
  if (overlayWasShown) renderGridOverlay(svg, currentEff);
}
```

This is called on every collapse, every expand, every Collapse All / Expand All, and on Reset.

### 5c. `syncEffToSource`

After `layout(currentEff)`, walk every non-surrogate node in `currentEff` and write `x, y, width, height` back to the matching node in `ir`. Do the same for non-surrogate edge `points` and `originalPoints`. This is what lets hidden nodes "remember" their last position so they reappear in place on expand.

### 5d. `routeAllEffWithCurrentSeparation`

Helper used by both `rerenderWithCollapse` and the A\* toggle-on handler. Runs `routeEdgesBatch` over every effective edge under the current separation mode, then mirrors each resulting `routedPath` back onto the matching source-IR edge.

### 5e. Button wiring

- **Reset Layout:** clear `pinned` and `x/y` on every source node, clear `routedPath` on every source edge, then `rerenderWithCollapse()`. Crucially, do *not* touch `collapsed` flags.
- **Collapse All:** `ir.subgraphs.forEach(sg => { sg.collapsed = true; })`, then `rerenderWithCollapse()`.
- **Expand All:** `ir.subgraphs.forEach(sg => { sg.collapsed = false; })`, then `rerenderWithCollapse()`.

---

## 6. `renderer.ts` changes

Only one addition: when rendering a node whose id starts with `__sg__`, draw a "+N" descendant-count badge in the corner. Use `countHiddenDescendants(ir, sgIdFromSurrogate(node.id))` for N.

Everything else copies verbatim from Spike 2. The renderer doesn't know what a surrogate "means" — it just renders the badge when it sees the prefix.

---

## 7. `our-renderer.html` changes

Two new buttons in `.controls`:

```html
<button id="collapseAll" class="btn">Collapse All</button>
<button id="expandAll" class="btn">Expand All</button>
```

Wired in `entry.ts` as described in §5e. The existing A\* feature buttons, grid overlay, and separation toggle are unchanged.

---

## 8. Build order (suggested, 2–3 hour timebox)

1. **Scaffold** (~15 min). Copy `spike2/` → `spike3/`, rename `package.json`, get `npm install && npm run dev` clean.
2. **`effective-ir.ts`** (~45 min). Pure functions; sanity-check on the small fixture by manually toggling a subgraph's `collapsed` in `entry.ts` and re-rendering. Surrogate should appear with edges remapped.
3. **`entry.ts` ir/eff split + `rerenderWithCollapse`** (~30 min). Wire Collapse All / Expand All buttons first — they're the cheapest UI for testing collapse without click handling.
4. **`collapse.ts`** (~30 min). Delegated click for collapse, mousedown/mouseup discrimination for expand. Test interaction with drag (ensure dragging a surrogate doesn't expand).
5. **Surrogate badge in `renderer.ts`** (~15 min).
6. **`syncEffToSource`** (~15 min). Without this, expanding loses inside-positions.
7. **A\* interaction wiring** (~20 min). Confirm toggle-on after collapse re-routes against the effective IR. Confirm `routedPath` clears on every collapse cycle.
8. **`SPIKE3_NOTES.md`** (~20 min). All six sections, under 400 words. Be honest about failure modes.

If running over time, cuts in order: skip Collapse All / Expand All buttons (per-subgraph click is enough); skip the surrogate badge (untyped surrogate rectangles still render correctly); skip `syncEffToSource` only if you're willing to live with nodes visibly jumping on expand.

---

## 9. Risks and what to do about them

| Risk | Likelihood | Mitigation |
|---|---|---|
| Collapse click bubbles from a node up to the subgraph and double-collapses | Low (painting order prevents it) | Verify on the 200-node fixture with nodes inside nested subgraphs. If it triggers, add `stopPropagation` on node-layer clicks in `renderer.ts`. |
| Surrogate drag stops working because `drag.ts` doesn't recognize it | Low (surrogates carry `data-node-id`) | Verify by dragging a surrogate; if it doesn't move, audit `drag.ts`'s mousedown selector. |
| Expand-on-mouseup fires when user mouse-ups off-SVG | Mitigated by binding mouseup to `window` | See §4. |
| A\* paths from before a collapse render against new layout | Mitigated by clearing `routedPath` in `rerenderWithCollapse` | One line; just don't forget it. |
| Layout cost on every collapse / expand exceeds frame budget at 500+ nodes | Medium for production, low for spike | Out of scope for Spike 3 — flag in §6 of notes. |
| Multi-edge dedup hides edges users expect to see | Medium for production, low for spike | Out of scope for v1 — flag in §6. Production decision: dedup vs. count-badge vs. fan-out. |

---

## 10. Definition-of-done checklist (mirrors prompt §"Definition of done")

- [ ] `cd spike3 && npm install && npm run dev` starts the dev server.
- [ ] `http://localhost:<port>/index.html` shows two panes.
- [ ] Fixture picker toggles both panes between `fixture.mmd` and `fixture200.mmd`.
- [ ] Initial layout on the right pane matches Spike 2.
- [ ] Click anywhere in a subgraph → that subgraph collapses to a single surrogate node with a "+N" badge.
- [ ] Click the surrogate (no drag) → the subgraph expands; inner nodes are in their original positions.
- [ ] Drag the surrogate → it moves as a node; click-without-drag still expands afterward.
- [ ] Nested subgraphs: clicking the inner first collapses inner only; clicking the outer after that collapses outer and shadows inner.
- [ ] "Collapse All" / "Expand All" buttons work.
- [ ] Toggling A\* on after collapse routes against the effective IR.
- [ ] Reset Layout clears pinned positions and `routedPath` but preserves `collapsed` flags.
- [ ] `SPIKE3_NOTES.md` exists, under 400 words, covers all six sections honestly.

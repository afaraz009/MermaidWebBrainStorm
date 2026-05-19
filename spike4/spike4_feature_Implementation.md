# Spike 4 — Feature Implementation Plan

**Status:** planning only. Implementation comes later.

This document plans the **new** Spike 4 work on top of the spike3 baseline that was copied into `spike4/`. Everything in `SPIKE4_NOTES.md`, `IMPLEMENTATION_SPIKE4.md`, and `prompt-spike4.md` is the inherited Spike 3 scope and ships unchanged — A\* edge routing, subgraph collapse / expand, node drag, surrogate badges, fixture picker, Reset / Collapse All / Expand All. None of those behaviours are touched here.

## Goals (new in Spike 4)

1. **Canvas pan.** Click-and-drag on empty canvas pans the diagram. The existing node drag (`drag.ts`) and collapse-click (`collapse.ts`) still win when the press lands on a node, surrogate, edge, or subgraph.
2. **Mouse-wheel zoom.** Already present in `src/entry.ts` (`applyZoomAt`, lines 275–305). Verified working. Spike 4 carries it forward; the only change is reconciling the existing CSS-transform zoom with the new pan translation so zoom-around-cursor still anchors correctly while panned.
3. **Right-click context menus, four targets:**
   - **Canvas** (empty space): Add Node, Add Subgraph, Fit View, Reset Layout, Toggle A\*.
   - **Node** (`[data-node-id]`, including surrogates): Edit Label, Next Shape (cycle), Set Shape… (prompt picker), Change Color, Border style, Duplicate, Wrap in Subgraph, Connect to…, Delete.
   - **Edge** (`[data-edge-key]`): Edit Label, Reverse, Toggle Dashed/Solid, Look style, Color, Duplicate, Delete.
   - **Subgraph** (`[data-subgraph-id]`): Edit Label, Color, Border, Collapse/Expand toggle, Add Node, Add Nested Subgraph, Duplicate, Delete.
4. **Full Mermaid flowchart shape library.** Every node-shape Mermaid can parse renders correctly — `rect`, `round`, `stadium`, `subroutine`, `cylinder`, `circle`, `double-circle`, `diamond`, `hexagon`, `parallelogram`, `parallelogram-alt`, `trapezoid`, `trapezoid-alt`, `asymmetric`, `ellipse`. Edge clipping uses shape-specific outline geometry so arrows always land on the visible border.
5. **Preserve every existing interaction.** Left-click collapse, surrogate expand, node drag, A\* toggle, grid overlay, sliders, and the wheel zoom must all keep working unmodified.

## Reference material analyzed

From `E:\Projects\MermaidWeb\components\editor\`:

- `ContextMenu.tsx` — portal-based menu with submenus, swatch rows, drag handle, viewport clamping, keyboard navigation, Esc/outside-click dismissal. Pattern we adopt: **portal to `document.body`, fixed positioning, clamp to viewport, dismiss on outside-mousedown / Esc / scroll**.
- `ElementToolbar.tsx` lines 1399–1540 — `CanvasContextMenu` component. Its `addNode` and `addSubgraph` actions (1447–1471) are the closest reference for what our menu does when there is *no* selection — mutate the diagram, re-serialize, hand back to the editor.
- `DiagramCanvas.tsx` lines 370–417 — pan cursor management and the `contextmenu` suppression handler. Key insight: pan and right-click both bind on `containerRef`, with `e.preventDefault()` on `contextmenu` *always*, even when no menu is shown, so the browser native menu never appears.
- `DiagramCanvas.tsx` lines 1244–1252 — model-coordinate conversion under pan + zoom: `modelX = (clientX - rect.left - pan.x) / zoom`. We need the same math because Spike 4 zoom is CSS-transform-based, not SVG-viewBox-based.

The MermaidWeb context menu has rich features (submenus, swatches, drag-to-move). For Spike 4 we adopt a **simpler flat menu** in the same visual style: one click → one action, no submenus or drag handle in v1. Sub-menus and swatch palettes are deferred — they're polish, not load-bearing for the validation question.

## Architecture

### New files

```
spike4/src/
  pan.ts              * NEW   — canvas pan handler. Mirrors collapse.ts shape:
                                 attach(svg, ...): () => void using AbortController.
  contextMenu.ts      * NEW   — single ContextMenu class/factory: renders an
                                 absolutely-positioned <div> menu attached to
                                 document.body. Exposes show(x, y, items),
                                 hide(), and an internal outside-click handler.
  menuActions.ts      * NEW   — pure functions that mutate `ir` for each menu
                                 action (addNode, addSubgraph, deleteNode,
                                 duplicateEdge, etc.). Returns void; caller
                                 invokes rerenderWithCollapse() afterward.
  contextMenuWiring.ts * NEW  — delegated right-click listener on the SVG.
                                 Inspects the event target, decides which menu
                                 (canvas/node/edge/subgraph) to open, builds
                                 the item list from menuActions, calls
                                 contextMenu.show().
```

### Modified files

```
spike4/src/
  entry.ts            ~ wire up pan + contextMenuWiring; reconcile pan+zoom
                        math so the existing wheel zoom centres on the cursor
                        even when the diagram has been panned.
  renderer.ts         ~ Add data-edge-key prefix lookups (already present),
                        but ensure edges render with a hit-area (transparent
                        wider stroke) so right-click reliably targets thin
                        lines. Subgraph hit area already covers the rect.
                        Also: `createShapeElements(shape, w, h, …)` draws every
                        node shape (rect / round / stadium / subroutine /
                        cylinder / circle / double-circle / diamond / hexagon /
                        parallelogram[-alt] / trapezoid[-alt] / asymmetric /
                        ellipse). Surrogates always paint as a rounded rect.
  types.ts            ~ `NodeShape` union exported and IRNode.shape typed to
                        it. Optional: extend IRNode with `color?: string` and
                        `borderStyle?: 'thin'|'normal'|'thick'|'dashed'` so
                        the node menu has properties to write to. v1 can do
                        without — label / shape edits cover most use.
  border.ts           ~ Shape-aware clipping for every NodeShape. Exports
                        vertex builders (hexagonVerts, parallelogramRightVerts,
                        parallelogramLeftVerts, trapezoidVerts,
                        trapezoidAltVerts, asymmetricVerts) and the geometry
                        constants HEX_INSET / PARA_SKEW / ASYM_NOTCH so the
                        renderer and clipper agree on the outline.
  parser-adapter.ts   ~ `mapShape` is now a full switch over Mermaid's
                        FlowVertexTypeParam, normalised to NodeShape names.
  menuActions.ts      ~ SHAPES export is the cycle order; new setNodeShape()
                        jumps to a specific shape.
  contextMenuWiring.ts ~ Node menu has "Next Shape (current)" cycle item plus
                         a "Set Shape…" prompt that accepts any NodeShape name.

spike4/our-renderer.html  ~ already updated. No further HTML changes needed —
                            the context menu DOM is created in JS at runtime.
spike4/index.html         ~ fixture picker adds "shape gallery" option.
spike4/fixture_shapes.mmd * NEW — one leaf node per shape, chained, for visual
                                  parity testing against the Mermaid reference.
```

## Pan implementation

**Model.** Treat pan as a CSS `translate(...)` applied to the same `svg` element that already carries the wheel-zoom transform. The existing `applyZoomAt` writes `transform: translate(tx,ty) scale(z)`; pan composes by adjusting `tx` / `ty` while keeping `z` constant.

**State (module-local in `pan.ts`).**

```ts
let pan = { x: 0, y: 0 };   // current cumulative pan
let panning: { startX: number; startY: number; baseX: number; baseY: number } | null = null;
```

Export `getPan()` so `entry.ts` can read the current pan value when computing the zoom anchor.

**Listeners.**

- `svg.addEventListener('mousedown', e => { ... })` — only enter pan mode if the target has **no** `closest('[data-node-id], [data-subgraph-id], [data-edge-key]')` hit. Otherwise existing handlers own the gesture.
- `window.addEventListener('mousemove', ...)` — when panning, write the new transform.
- `window.addEventListener('mouseup', ...)` — exit pan mode, restore `cursor: grab`.

The pan handler **runs before** drag.ts because both bind `mousedown` on `svg`. Order of listener registration matters only for the cursor visual; behaviorally each handler is guarded by its own target selector so they don't conflict.

**Zoom reconciliation.** The current `applyZoomAt` math computes `tx = sx - lx * zoom` where `sx` is the cursor's screen position relative to the SVG bounding rect. With pan, the formula becomes:

```
worldX = (screenX - rect.left - pan.x) / zoom
```

Update `applyZoomAt` to read `pan.x` / `pan.y` (imported from `pan.ts`) and bake them into `tx` / `ty` so the cursor stays anchored to the same world point after zoom even when panned.

**Pan cursor.** `svg.style.cursor = 'grab'` by default; `grabbing` while panning. Set on `mousedown`, restore on `mouseup`. Skip the cursor change when the press is consumed by node drag or surrogate expand (already handled by `drag.ts` setting its own `grabbing` cursor on the node element).

## Context menu implementation

### `contextMenu.ts`

One module exporting a singleton-ish API:

```ts
export interface MenuItem {
  label: string;
  icon?: string;       // optional SVG path or emoji char for v1
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
  separator?: boolean; // if true, render a divider, ignore other fields
}

export function showContextMenu(clientX: number, clientY: number, items: MenuItem[]): void;
export function hideContextMenu(): void;
```

**DOM.** A single `<div class="ctx-menu">` appended lazily to `document.body` on first `show`. Subsequent `show` calls reuse and reposition it. Positioning: `position: fixed; left: ${clientX}px; top: ${clientY}px;` clamped to viewport (`window.innerWidth` / `innerHeight`) with an 8px gap.

**Dismissal.** On `show`, register on `document`:
- `mousedown` (capture) — if target is outside the menu div, hide.
- `keydown` — if `key === 'Escape'`, hide.
- `scroll` (capture) — hide.
- `contextmenu` — if target is outside the menu, hide (then the new right-click wiring opens a fresh menu).

All registered via `AbortController` so they tear down on `hide`.

**Styling.** Inline styles (or a single CSS block injected into `<head>` on first show). Use the existing `.btn` palette from `our-renderer.html` so the look matches: white bg, `#4a6cf7` accent, 4px border-radius, 13px font. No framework dependency.

### `contextMenuWiring.ts`

```ts
export function attachContextMenu(
  svg: SVGSVGElement,
  getIR: () => IR,
  rerender: () => void,
): () => void
```

One `contextmenu` listener on `svg`:

```ts
svg.addEventListener('contextmenu', (e) => {
  e.preventDefault();                       // always suppress native menu
  const el = e.target as Element;
  const ir = getIR();

  const nodeEl = el.closest('[data-node-id]');
  const edgeEl = el.closest('[data-edge-key]');
  const sgEl   = el.closest('[data-subgraph-id]');

  // Priority order: node > edge > subgraph > canvas.
  // (Node sits visually on top; we honour painting order for hit-testing.)
  if (nodeEl) {
    showContextMenu(e.clientX, e.clientY, buildNodeMenu(nodeEl.getAttribute('data-node-id')!, ir, rerender));
  } else if (edgeEl) {
    showContextMenu(e.clientX, e.clientY, buildEdgeMenu(edgeEl.getAttribute('data-edge-key')!, ir, rerender));
  } else if (sgEl) {
    showContextMenu(e.clientX, e.clientY, buildSubgraphMenu(sgEl.getAttribute('data-subgraph-id')!, ir, rerender));
  } else {
    showContextMenu(e.clientX, e.clientY, buildCanvasMenu(e.clientX, e.clientY, ir, rerender));
  }
});
```

### `menuActions.ts`

Each builder returns a `MenuItem[]`. Inside each item's `onClick`, mutate `ir`, then call `rerender()` (which is `rerenderWithCollapse` from `entry.ts`). All mutations preserve `pinned` and `collapsed` flags unless the action specifically clears them.

**Canvas menu.**
- *Add Node* — push a new `IRNode` with id `n_${Date.now()}`, label "New Node", shape "rect", position computed from the right-click cursor in model coordinates (using the same pan/zoom math as MermaidWeb's lines 1244–1252).
- *Add Subgraph* — push a new `IRSubgraph` with one starter node inside it; place near cursor.
- *Fit View* — reset pan to `(0, 0)` and zoom to `1`. Re-apply transform.


**Node menu.** Lookup by `id`; surface a subset of MermaidWeb's `ElementToolbar` node actions:
- *Edit Label* — prompt for a string (use a tiny inline input rendered in the menu for v1, or `window.prompt` as a fallback shortcut); write `node.label = newValue`; rerender.
- *Change Color* — `window.prompt` for hex string. Submenu palette deferred.
- *Border Style* — cycle through `thin / normal / thick / dashed` similarly.
- *Wrap in Subgraph* — create a new subgraph containing this node only (matches MermaidWeb line 667).
- *Connect to…* — set a transient `pendingEdgeFrom` flag on a module-level; next right-click on a node creates an edge. Cancel on Esc.
- *Delete* — remove node, remove its edges, remove its id from any subgraph's `children`.

**Edge menu.** Lookup by `(from, to)` decoded from `data-edge-key`:
- *Edit Label* — prompt; write `edge.label`.
- *Reverse* — swap `edge.from` and `edge.to`.
- *Toggle Dashed/Solid* — toggle `edge.style`.
- *Color* — prompt for hex, store on edge (requires `color?: string` on `IREdge` in types.ts).
- *Duplicate* — push a clone (will dedup in collapse if endpoints land on a surrogate; that's fine for v1).
- *Delete* — filter `ir.edges`.

**Subgraph menu.** Lookup by `id`:
- *Edit Label* — prompt; write `sg.label`.
- *Color / Border* — store on the subgraph (extend `IRSubgraph` if needed).
- *Add Node* — push a new `IRNode` with `parent = sg.id`.
- *Add Nested Subgraph* — push a new `IRSubgraph` with `parent = sg.id` and one starter node.
- *Duplicate* — clone the subgraph with new ids for it and every descendant.
- *Delete* — remove the subgraph, set `parent = undefined` on its descendants, recurse for nested subgraphs.

### Edge hit area

Edges currently render as 1–2px strokes. Right-click on a thin diagonal line is hard. Add a sibling `<path class="edge-hit-area">` to each edge group with `stroke-width: 14px; stroke: transparent; pointer-events: stroke; fill: none;`. The hit area pre-dates this spike in many libraries — Mermaid does the same — and is the cheapest way to make right-click on edges reliable without changing the visible geometry.

Modify `renderer.ts` to emit this hit-area path inside the same `[data-edge-key]` group, **before** the visible path so it sits underneath in DOM order. The visible path stays unchanged.

## Interaction order and conflicts

The full mouse-event stack on the SVG, in priority order:

1. **`contextmenu`** — right-click anywhere. Always fires first; always cancelled (`preventDefault`). Opens our menu.
2. **`click` (left)** — collapse handler (`collapse.ts`) on `[data-subgraph-id]`. Unchanged.
3. **`mousedown` (left)** — three competing handlers:
   - **drag.ts** — wins on `[data-node-id]`.
   - **collapse.ts** — wins on `[data-surrogate-for]` (records press for click-vs-drag).
   - **pan.ts** — wins when no node/surrogate/subgraph/edge is hit.
   Each handler `return`s early on a mismatched target, so they coexist without explicit ordering as long as their selectors are mutually exclusive.
4. **`wheel`** — zoom (unchanged from spike3).

**One conflict to resolve.** The collapse handler binds `click` on `[data-subgraph-id]`. Right-click also produces a `click` event in some browsers if the button is then released over the same element. Guard the collapse handler with `e.button !== 0` so only left-clicks collapse. (This is a one-line fix to `collapse.ts`.)

## Risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Pan transform fights with wheel-zoom anchor math, cursor drifts | Medium | Centralize pan + zoom in one function that writes a single `transform: translate(...) scale(...)`. `pan.ts` exports `getPan` / `setPan`; `entry.ts` owns the actual `style.transform` writes. |
| Right-click on a thin edge misses | High without hit-area | Add transparent stroke-14 hit path in renderer.ts. |
| Browser native menu flickers visible before ours | Low | `e.preventDefault()` in the `contextmenu` handler before any awaits. |
| `window.prompt` for label edits feels ugly | Medium | Acceptable for v1 spike validation. Inline input panel inside the menu is v2. |
| Menu doesn't dismiss when scrolling the page | Low | Bind `scroll` on `document` in capture phase (matches MermaidWeb's `ContextMenu.tsx` line 167). |
| Adding nodes via menu produces nodes not laid out by dagre | Certain | After every mutation, call `rerenderWithCollapse` which re-runs dagre on `currentEff` — the new node gets a position from dagre. |
| Right-click drag-pan ambiguity (right-button + drag) | Low | Don't bind pan to right button. Only left button pans. |
| Surrogate context menu — should it offer node-style edits? | Medium | Surrogate carries `data-node-id` *and* `data-surrogate-for`. Choose surrogate-flavored menu (Expand, Add Node Inside, Delete Whole Subgraph) when both attributes are present. Distinguish in `contextMenuWiring.ts` via `el.closest('[data-surrogate-for]')`. |

## Build order (suggested timebox: 4–5 hours)

1. **`pan.ts`** (~45 min). Mousedown / move / up. Coexists with drag and collapse via selector guards. Verify nothing breaks by panning around then dragging a node then collapsing a subgraph.
2. **Reconcile pan + zoom** (~30 min). Update `applyZoomAt` to compose with pan. Verify zoom-around-cursor still works after panning.
3. **`contextMenu.ts`** (~45 min). Minimal menu rendering, viewport clamping, dismissal. Test with a hardcoded items list bound to a debug button.
4. **Edge hit area in `renderer.ts`** (~20 min). Verify right-click on a thin diagonal edge opens a menu without missing.
5. **`menuActions.ts` + `contextMenuWiring.ts` — canvas menu** (~40 min). Just Add Node and Add Subgraph first. Verify dagre re-runs and the new element shows up.
6. **Node, edge, subgraph menus** (~90 min). Build out each builder. Wire delete + label + duplicate first; shape/colour/border last.
7. **Edge case fixes** (~30 min). `e.button !== 0` guard in `collapse.ts`. Surrogate context menu variant. Esc dismissal of the "Connect to…" pending state.
8. **Spike notes update** (~20 min). Append a §"Spike 4 additions" section to `SPIKE4_NOTES.md` documenting what shipped, what was punted, and what's brittle.

Cuts in priority order if running long:
- Skip Connect-to… (creating edges by menu) — keep the edge menu for editing only.
- Skip subgraph Duplicate (it requires recursive id cloning, fiddly).
- Skip border-style and color edits (deferred to v2 polish pass).

## Shape library implementation

Spike 3 mapped only five shapes; everything else fell to `rect`. Spike 4 covers every Mermaid flowchart vertex type. The threading is:

1. **Parse** — `parser-adapter.ts::mapShape` normalises Mermaid's `vertex.type` (one of `square`, `doublecircle`, `circle`, `ellipse`, `stadium`, `subroutine`, `rect`, `cylinder`, `round`, `diamond`, `hexagon`, `odd`, `trapezoid`, `inv_trapezoid`, `lean_right`, `lean_left`) onto the IR's `NodeShape` union. Unknown → `rect`.
2. **Type** — `types.ts::NodeShape` is the canonical union. `IRNode.shape: NodeShape` so the rest of the code never sees a string outside this set.
3. **Layout** — `layout.ts` is unchanged. All shapes use the same bbox-from-label sizing; the shape is purely a paint concern.
4. **Clip** — `border.ts::clipToBorder` dispatches on `node.shape`:
   - `diamond` — segment walk over four vertices.
   - `circle` / `double-circle` — radial intersection at `min(hw, hh)`.
   - `ellipse` — closed-form ray-ellipse formula.
   - `hexagon` / `parallelogram` / `parallelogram-alt` / `trapezoid` / `trapezoid-alt` / `asymmetric` — segment walk over the same polygon the renderer paints.
   - `rect` / `round` / `stadium` / `subroutine` / `cylinder` — bounding-box fallback (these all fully fill their bbox; rounded corners are visually inset but the bbox clip is what Mermaid does too).
5. **Render** — `renderer.ts::createShapeElements(shape, w, h, fill, fillOpacity, stroke, strokeWidth)` returns the SVG element(s) to draw the shape inside the node group's local frame (origin top-left, extending to `(w, h)`). For polygonal shapes the renderer reuses the same vertex builders that `border.ts` clips against, so paint and clipping never disagree.
6. **Edit** — `menuActions.ts::SHAPES` is the cycle order. `cycleNodeShape` rotates; `setNodeShape(ir, id, shape)` jumps. `contextMenuWiring.ts` exposes both as menu items.

### Trade-offs taken in v1

- **Uniform width-from-label** — circles for long labels get wide bbox. Acceptable; matches Mermaid.
- **Surrogate-as-round** — collapsed subgraph surrogates always paint as a rounded rectangle for layout consistency (the shadow card geometry assumes a rect).
- **No icon / image shapes** — Mermaid's `icon` / `img` shape extensions are out of scope.
- **No fill-color customisation** — every shape paints with the same `#4a6cf7` stroke and white fill. Per-node color is a follow-up (would also require a `color?: string` on `IRNode`).

## Definition of done

- [ ] `cd spike4 && npm install && npm run dev` starts.
- [ ] Left-drag on empty canvas pans; cursor changes to grabbing.
- [ ] Mouse wheel zooms in / out, anchored to cursor, even after panning.
- [ ] Right-click on empty canvas opens a menu with Add Node / Add Subgraph / Fit / Reset.
- [ ] Right-click on a node opens a node menu; Edit Label / Delete / Duplicate / Wrap in Subgraph work.
- [ ] Right-click on an edge opens an edge menu; Reverse / Toggle Dashed / Delete work.
- [ ] Right-click on a subgraph opens a subgraph menu; Add Node / Collapse-Expand / Delete work.
- [ ] Right-click on a surrogate opens the surrogate menu (Expand, Delete Subgraph).
- [ ] Esc dismisses any open menu. Click-outside dismisses. Scroll dismisses.
- [ ] Left-click on a subgraph still collapses (no regression).
- [ ] Left-click on a surrogate (no drag) still expands (no regression).
- [ ] Drag a node still drags + re-routes (no regression).
- [ ] A\* toggle, separation cycle, sliders, grid overlay still work (no regression).
- [ ] Collapse All / Expand All / Reset Layout still work (no regression).
- [ ] `SPIKE4_NOTES.md` gains a §"Spike 4 additions" section.
- [ ] Loading `fixture_shapes.mmd` renders every shape with the correct outline, and edges land cleanly on each shape's border (no over-/under-shoot).
- [ ] Right-click on a node → "Next Shape" cycles through all 15 NodeShape values and the SVG updates each time.
- [ ] Right-click on a node → "Set Shape…" prompt accepts a NodeShape name and applies it.

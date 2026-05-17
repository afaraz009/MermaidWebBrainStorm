  I'm validating whether I can replace Mermaid's renderer with my own pipeline while keeping its parser, with edge behaviour stable across node drags. The original spike was a 2-3 hour timeboxed exercise; this version layers in the edge-stability work driven by parity with `md-diagrams-testing`.

  Output: three HTML pages I can open in a browser to compare:
  1. Mermaid's official rendering of a fixture (the visual target)
  2. My custom pipeline rendering the same fixture (static)
  3. My custom pipeline rendering the same fixture, with drag-to-reposition and stable post-drop edge routes

  Stack constraints (do not deviate)

  - mermaid (npm package) — used only for parsing. Do not call mermaid.render() in the custom pipeline. Use mermaid.mermaidAPI.getDiagramFromText() and read from the returned diagram's flowDb.
  - @dagrejs/dagre — graph layout
  - d3-shape — edge curve generation, specifically curveBasis
  - d3-path — companion to d3-shape if needed
  - Plain SVG output. No React, Vue, or other framework.
  - Vanilla TypeScript. ES modules. Vite for the dev server / build.
  - No drag library. Plain DOM mousedown / mousemove / mouseup. No d3-drag, no react-dnd, no interact.js.

  Project structure

  spike/
    package.json
    tsconfig.json
    vite.config.ts
    index.html                       # links to all three pages side by side
    fixture.mmd                      # Mermaid source (provided below)
    mermaid-reference.html           # renders fixture via Mermaid (target)
    our-renderer.html                # renders fixture via custom pipeline (static)
    our-renderer-interactive.html    # custom pipeline + drag + reset button
    src/
      types.ts                       # IR types: IRNode, IREdge, IRSubgraph, IR
      parser-adapter.ts              # mermaid source -> normalized IR
      layout.ts                      # IR -> dagre layout -> positioned IR
      border.ts                      # shape-aware border clipping (diamond / circle / rect)
      renderer.ts                    # positioned IR -> SVG (with partial-update + post-drop refresh)
      drag.ts                        # mouse drag handlers (interactive page only)
      main-static.ts                 # wires pipeline for our-renderer.html
      main-interactive.ts            # wires pipeline + drag + reset for our-renderer-interactive.html
    SPIKE_NOTES.md                   # findings
    StackConstraints.md              # comparison vs. md-diagrams-testing edge behaviour

  Fixture (fixture.mmd)

  flowchart TD
      A[Submit Request] --> B[Manager Review]

      B --> C{Approved?}

      C -- No --> D[Rejected]
      C -- Yes --> E[Finance Approval]

      E --> F{Budget Available?}

      F -- No --> D
      F -- Yes --> G[Final Approval]

  Variety in this fixture is intentional:
  - Two diamond decision nodes (`{Approved?}` and `{Budget Available?}`) — exercises shape-aware border clipping
  - Branching with labelled edges (`-- No -->`, `-- Yes -->`) — exercises edge-label rendering
  - A node (`D[Rejected]`) reached from two different branches — exercises convergent edges
  - Top-down rank flow with horizontal branch spread

  Pipeline requirements (in order)

  1. Parser adapter (parser-adapter.ts)

  - Load fixture.mmd, call Mermaid's parser, return a normalized internal representation:
    - IRNode: { id, label, shape, parent?, pinned?, x?, y?, width?, height? }
    - IREdge: { from, to, label?, style?: 'solid' | 'dotted', points?, originalPoints? }
    - IRSubgraph: { id, label, parent?, children: string[] }
    - IR: { nodes, edges, subgraphs }
  - Use `mermaid.mermaidAPI.getDiagramFromText(source)` and read `db.getVertices()`, `db.getEdges()`, `db.getSubGraphs()`.
  - `originalPoints` on IREdge is the canonical dagre route — written by `layout()`, never mutated by drag.

  2. Layout (layout.ts)

  - Feed the IR to dagre. Use compound graph support (`setParent()`) for nested subgraphs.
  - Configure with `rankdir: 'TB'`, `nodesep: 50`, `ranksep: 60`, `marginx/y: 30`.
  - Estimate node dimensions from label length: `width = label.length * 8 + 24`, `height = 40`.
  - Honor pinned nodes: if `node.pinned === true`, pass `x` / `y` to `g.setNode()` and skip writing dagre's value back.
  - Branch-ordering correction: if dagre placed the first-declared branch target to the right of later targets, mirror the entire graph horizontally so first-declared targets sit on the left (matches Mermaid).
  - Border-clip the first and last point of every edge using shape-aware `clipToBorder` from `border.ts` so endpoints sit on the node outline (diamond on slanted edge, circle on radius, rect on bbox).
  - Ensure every edge has at least 3 points (insert a midpoint when dagre returns 2) so curveBasis produces a smooth curve.
  - Write `e.points = pts` and a deep copy `e.originalPoints = pts.map(p => ({...p}))`.

  3. Border clipping (border.ts)

  - Single shared `clipToBorder(node, toward)` function used by both `layout.ts` and `renderer.ts`.
  - Shape-aware:
    - `diamond` — intersect ray with the four diamond edges, return the nearest hit
    - `circle` / `double-circle` — radial intersection
    - any other shape (rect / rounded / stadium / cylinder / parallelogram) — axis-aligned bbox intersection
  - This is the only place that knows about node geometry; nothing in `renderer.ts` should reimplement it.

  4. Renderer (renderer.ts)

  Three exported functions plus internal helpers:

  renderFull(ir, mountEl, interactive = false) — full render from scratch:
  - Each node: `<g data-node-id="..." transform="translate(x, y)"><rect ...><text ...></text></g>`. All shapes drawn as rectangles in this spike — leave `// TODO: switch on node.shape — cylinder/parallelogram/etc.` where shape branching would plug in.
  - Each edge: `<g data-edge-key="from::to">` containing:
    - a curved `<path class="edge-path">` with `d` from `d3.line().curve(d3.curveBasis)` over the anchored points
    - a separate straight `<line class="edge-arrow-line">` carrying `marker-end="url(#arrow)"` so the arrow tip lands precisely on the node border
    - optional `<rect class="edge-label-bg">` + `<text class="edge-label-text">` for the edge label
  - Subgraphs: `<g data-subgraph-id="..."><rect ... /><text>label</text></g>` enclosing the bounding box of member nodes (with `PADDING = 20px`), label at the top, drawn outermost-first so nested subgraphs paint over their parents.
  - A `<defs>` block with the arrow marker (`viewBox 0 0 10 10`, `refX 9`, `refY 5`).
  - Dotted edges: `stroke-dasharray="5,5"` on the curved body only — the arrow shaft stays solid so the marker renders cleanly.
  - Curve construction:
    - Duplicate the first and last waypoint so curveBasis touches them exactly.
    - Pull the last anchored point back by `ARROW_TIP_LEN = 10px` so the curve body stops just before the node border and the arrowhead covers the gap (mirrors the reference project's edge body).
  - Stash a `MountMeta` on `mountEl.__meta` containing:
    - the IR reference,
    - an `adjacency: Map<nodeId, edgeKey[]>`,
    - an `edgeMap: Map<edgeKey, IREdge>`,
    - a `displayPoints: Map<edgeKey, Point[]>` initialised from each edge's `originalPoints`,
    - `subgraphRects` and `subgraphLabels` maps so drag can update subgraph boxes without re-rendering.
  - When `interactive === true`: drop the viewBox and use a fixed `2400 × 1800` canvas (no pan/zoom). When `false`: fit the SVG viewBox to the diagram bounds with 40px padding.

  updateNodePosition(nodeId, newX, newY, mountEl, ir) — partial update for live drag:
  - Mutate the existing `<g data-node-id>` transform and update `node.x` / `node.y`.
  - For every edge connected to the dragged node (looked up via `adjacency`), compute a 3-point drag waypoint set: `[clipToBorder(from, toCenter), midpoint, clipToBorder(to, fromCenter)]`. Write it into `displayPoints` only — do not touch `IREdge.originalPoints`.
  - Mutate the existing edge `<path>` `d` attribute, the arrow `<line>`, and the label rect+text in place.
  - Recompute every subgraph bounding box and update the corresponding `<rect>` and `<text>` so subgraph containers track their children live.

  refreshEdgesFromLayout(mountEl) — partial update after a fresh layout pass:
  - For every edge, copy `IREdge.originalPoints` back into `displayPoints` and update the SVG `<path>` `d`, the arrow `<line>`, and the label.
  - Move every node `<g>` transform to its current IR position (a non-dragged node may have been re-ranked by dagre).
  - Recompute subgraph bounding boxes.

  5. Drag (drag.ts)

  - `attachDrag(svg, ir, mountEl)`. One set of handlers per mount.
  - `mousedown` on any element matching `[data-node-id]`: capture the node id and the cursor-to-center offset in SVG coordinates (`svg.createSVGPoint() + getScreenCTM().inverse()`).
  - `mousemove` on `window`: translate the cursor into SVG coordinates and call `updateNodePosition()`. Drag continues even when the cursor leaves the SVG.
  - `mouseup` on `window`:
    1. Mark the node `pinned = true`.
    2. Re-run `layout(ir)` so dagre produces fresh multi-waypoint routes for every edge given the dropped node position. Pinned nodes keep their `x` / `y`; unpinned nodes may be re-ranked.
    3. Call `refreshEdgesFromLayout(mountEl)` to swap the transient 3-point drag overlay for the new dagre routes.
  - This deliberately routes mid-drag through a 3-point collapse and post-drop through a full dagre re-route, matching the edge stability behaviour seen in `md-diagrams-testing`.
  - The original "use original waypoints with only the dragged endpoint replaced" shortcut from the first spike is intentionally *replaced*: the visible kink it produced when nodes moved sideways was the bug this version fixes.

  6. Mermaid reference (mermaid-reference.html)

  Dead simple. ESM Mermaid from a CDN, render the fixture into a `<div id="diagram">` via `mermaid.render()`. This is the visual target — minimal effort.

  7. Static custom render (our-renderer.html)

  Runs the pipeline and mounts the SVG via `renderFull(ir, mountEl, false)`. No drag, no reset button, no `__meta` is needed for downstream interaction (it's still attached but unused).

  8. Interactive custom render (our-renderer-interactive.html)

  Same pipeline as static, plus drag + reset:

  - `<svg id="mount">` and a `<button id="reset">Reset Layout</button>` above it.
  - `main-interactive.ts` calls `parseToIR` → `layout` → `renderFull(..., true)` → `attachDrag(...)`.
  - Reset button: clear `pinned` and `x` / `y` on every node, re-run `layout(ir)`, call `renderFull(ir, svg, true)`, re-attach drag.
  - Edges connected to the dragged node update during drag (3-point collapse). On release every edge is re-routed by dagre and the multi-waypoint curve returns. Subgraph containers track their children both during and after drag.

  9. Side-by-side index.html

  Three iframes side by side, labels above each ("Mermaid (target)" / "Custom static" / "Custom interactive"). One screen, easy comparison.

  Edge stability requirements (the change from the original spike)

  - During drag: incident edges may collapse to a 3-point curve; non-incident edges must remain untouched.
  - On release (mouseup): every edge must re-acquire a smooth multi-waypoint curve via a fresh `layout(ir)` pass, with the dragged node held in place by `pinned`.
  - `IREdge.originalPoints` is the canonical dagre route. Drag never writes to it; only `layout()` does.
  - Endpoints must always sit on the visible outline of the node, including diamonds and circles. The arrow tip must always be a straight short shaft from the second-to-last point to the last point.
  - Subgraph rectangles must reflect the current positions of their children at all times, not their positions at first render.

  Out of scope (do not implement)

  - Multiple node shapes drawn as anything other than rectangles (shape branching is left as a TODO comment in renderer.ts; only the *clipping* is shape-aware via border.ts)
  - Edge style variation beyond `solid` / `dotted`
  - Theme variables / classDef
  - Animations / transitions
  - Pan / zoom
  - Click handlers other than drag and the reset button
  - Markdown rendering inside labels
  - Touch / pointer events (mouse only)
  - Multi-select drag
  - Snap-to-grid or alignment guides
  - Undo / redo
  - Connecting nodes by dragging from anchors
  - Context menus
  - Editing node labels in place
  - Persisting positions across reloads
  - Edge re-routing strategies other than "3-point collapse during drag, full dagre re-layout on release"

  SPIKE_NOTES.md

  1. Parser extraction — one paragraph
  - Was Mermaid's parser API usable directly, or did you need to reach into internals?
  - Did nested subgraphs come through cleanly or did you have to reconstruct the hierarchy?
  - Anything that would block a production implementation?

  2. Layout quality
  - Does dagre's output look ~equivalent to Mermaid's? Specific differences?
  - Does the branch-ordering mirror pass produce the right left-right order for the fixture?
  - Did anything surprise you?

  3. Static render comparison
  - Open our-renderer.html and mermaid-reference.html side by side. Honest assessment: same diagram? Different diagram? Recognizably-the-same-but-rough?

  4. Drag behavior
  - Does drag feel smooth (eyeball judgment, no instrumentation needed)?
  - During drag, do incident edges stay attached to the dragged node's border (including diamonds)?
  - On release, do all edges return to smooth multi-waypoint curves?
  - Are subgraph rectangles tracking their children both during and after drag?
  - Does the post-drop dagre re-layout introduce any visible jump for non-dragged nodes?

  5. Edge stability assessment
  - Compared with `md-diagrams-testing`'s edge behaviour, does the spike now match? Any residual differences (e.g. arrowhead alignment, label positioning, curve smoothness on long drags)?

  6. Honest viability assessment
  - Three sentences max. Is this stack viable for a production renderer? What's the biggest concern that surfaced?

  7. What you'd improve next
  - Three bullets. What you'd build/fix/explore in the next iteration if proceeding.

  StackConstraints.md

  Already written. Documents the diagram-rendering / runtime-only comparison between the spike and `md-diagrams-testing`, including:
  - The edge-stability bug observed in the original spike and the working behaviour in the reference project
  - The rendering stack constraints of each project
  - Why both projects use a 3-point collapse during drag yet only one shows the bug
  - The five concrete reasons the spike now matches the reference behaviour after the fix

  Hard constraints

  - Edge stability is the load-bearing requirement. If a change to layout, drag, or rendering would break "smooth multi-waypoint curve after drop", reject it.
  - `IREdge.originalPoints` is read-only outside `layout.ts`. Any code path that writes to it from drag or rendering is wrong.
  - No framework. No drag library. No pan / zoom. No undo / redo.
  - Working-and-incomplete beats stuck-and-perfect. A correct edge-stability flow with a documented missing shape is more valuable than a half-finished shape system that destabilises edges.

  Definition of done

  - I open index.html in a browser.
  - I see three diagrams side by side.
  - The static custom render is recognizably the same diagram as Mermaid's, including the two diamond decision nodes.
  - The interactive page lets me drag any node, with edges updating in real time during drag.
  - On release, every edge returns to a smooth multi-waypoint curve and stays there until I drag again.
  - Subgraph rectangles (when present) track their children during and after drag.
  - Reset Layout returns the diagram to its initial dagre layout.
  - SPIKE_NOTES.md gives me a clear read on whether to proceed.

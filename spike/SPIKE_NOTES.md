# Spike notes — parser-only + dagre + d3-shape

> Findings after running the spike against `fixture.mmd`. Max 400 words.
> **Fill in the bracketed `[…]` sections after eyeballing the three pages side-by-side.**

## 1. Parser extraction

The public `mermaid.parse(src)` only validates — it returns/awaits a `ParseResult` with no AST. To get structured graph data the spike calls `mermaid.mermaidAPI.getDiagramFromText(src)` and reads `diagram.db`, which exposes `getVertices()`, `getEdges()`, and `getSubGraphs()`. This is undocumented-but-stable internals, used by mermaid's own renderer.

Nested subgraphs come through cleanly: `getSubGraphs()` returns a flat list, but each subgraph's `nodes` array contains both leaf-node IDs *and* child-subgraph IDs. We reconstruct the parent map in one pass — no regex hacks. **No manual hierarchy reconstruction beyond that flat-to-tree rebuild.**

Production blocker risk: depending on mermaid internals (`mermaidAPI.getDiagramFromText`, `diagram.db.*`) means a minor-version bump can break us. Mitigation: pin mermaid, add a smoke-test that asserts the FlowDB shape on every dependency upgrade.

[ Confirm/correct after running: did `getDiagramFromText` exist on mermaid 11.x as expected? Any console errors? ]

## 2. Layout quality

[ Compare side-by-side. Specifics to look for: ]
- Subgraph nesting (Backend containing Orders/Payments) — does dagre place them similarly to Mermaid?
- Edge routing through subgraph boundaries (e.g. Rate → OrderAPI crosses into Backend > Orders).
- `OrderAPI -.->|sync| PayAPI` — both endpoints inside Backend, dotted with label.

## 3. Static render comparison

[ Open `our-renderer.html` and `mermaid-reference.html` side by side. Pick one: same diagram / different diagram / recognizably-the-same-but-rough. Note any structural differences. ]

## 4. Drag behavior

[ Drag each node, especially Notif (sibling to two nested subgraphs) and OrderAPI (3 connected edges). Report: ]
- Smoothness (eyeball, no instrumentation).
- How edges look when a node is dragged far from origin — `curveBasis` + stale waypoints will produce ugly curves at extreme positions; that's expected, note honestly.
- One sentence: is partial-update SVG mutation viable for animated disclosure later?

## 5. Honest viability assessment

[ Three sentences max. Is parser-only + dagre + d3-shape viable for production? Biggest concern? ]

## 6. What I'd improve next

- [ e.g. shape variants (cylinder/parallelogram), so the visual delta with Mermaid drops further ]
- [ e.g. re-route dragged-node edges through dagre on `mouseup` to clean up curveBasis ugliness ]
- [ e.g. swap dagre for elkjs behind a flag to compare adaptive layout quality ]

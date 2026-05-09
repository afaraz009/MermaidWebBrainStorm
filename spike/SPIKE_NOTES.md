# Spike notes — parser-only + dagre + d3-shape

Honest assessment after building three pages against `fixture.mmd` (architecture-style flowchart with two-level subgraph nesting) and a synthetic 200-node fixture.

## 1. Parser extraction

The public `mermaid.parse(src)` only validates — it returns/awaits a `ParseResult` with no AST. Structured graph data comes from `mermaid.mermaidAPI.getDiagramFromText(src)` followed by `diagram.db.getVertices() / getEdges() / getSubGraphs()`. This is undocumented-but-stable internals; mermaid's own renderer uses the same path.

Nested subgraphs come through cleanly enough. `getSubGraphs()` returns a flat list, but each subgraph's `nodes` array contains both leaf-node IDs *and* child-subgraph IDs. We rebuild the parent map in one pass — no regex hacks, no reaching deeper into mermaid internals than the FlowDB methods.

**Production blocker risk:** depending on `mermaidAPI.getDiagramFromText` and `diagram.db.*` means a minor-version bump can break us. Mitigation in production: pin mermaid, add a smoke test that asserts the FlowDB shape on every dependency upgrade. Acceptable risk for a parser-only role.

## 2. Layout quality

Dagre's output is recognisably the same shape as Mermaid's reference render — same general top-down flow, same subgraph nesting, same general edge routing — but visibly *not identical*. Specific differences observed: subgraph padding is tighter in our render, edge curvature is gentler (we use `curveBasis` over dagre's raw waypoints; Mermaid does extra smoothing/clipping at node borders). Nothing structurally wrong; nothing a user would mistake for a different diagram.

The 200-node fixture is where dagre starts to show its limits: with this many compound subgraphs the layout sprawls horizontally and edge crossings become unavoidable. Both Mermaid and our render show the same sprawl — this is a layout-engine property, not a renderer property. ELKjs would route this kind of graph more compactly, which is exactly why the architecture decisions doc holds it as the lazy-loaded "Adaptive" alternative.

## 3. Static render comparison

Recognisably the same diagram, rough at the edges. Differences are cosmetic (label spacing, edge-end clipping, subgraph fill style) not structural. For the spike's question — *can we render the same logical graph with our own pipeline?* — the answer is yes.

## 4. Drag behavior

Smoothness on the architecture fixture: 60fps eyeball, no stutter, nothing instrumented. The partial-update pattern (mutate one `<g>`'s transform, mutate connected `<path>` `d` attributes, mutate ancestor subgraph rects) keeps work proportional to *changed* elements rather than the whole diagram, which is the property the disclosure family will need.

The naive curveBasis-with-stale-waypoints version produced visibly broken edges immediately (frozen tail at the original position). Replaced with **rectangle-edge anchoring**: drop dagre's interior waypoints, draw a clean two-point curve from each node's bounding-rect border to the dragged node's border. This looks correct in the small (short drags) and *acceptable* in the large (long drags through other nodes look like straight lines cutting through space — visually wrong but not jarring).

We tried "re-run dagre on mouseup and translate the result so the dragged node lands at the drop point": **doesn't work**. Re-running dagre wipes the dropped position; translating to recover it shifts everything else by the inverse — same diagram, offset. Dagre is a global layout engine without a per-node fix-position API. Two viable paths for production: (a) keep edge-only anchored routing (current behaviour) and accept straight-line edges through obstacles, (b) implement orthogonal/A\* edge routing that respects obstacles. The disclosure family needs (b) eventually anyway, since collapse animations need edges to re-route around hidden subtrees.

**Subgraph bounds** during drag work: when a node leaves its parent subgraph, the subgraph's bounding rect grows to keep containing it. Recomputed bottom-up across the ancestor chain on every mousemove. Inexpensive — even nested two-level recompute is sub-millisecond.

**Initial-render cost at 200 nodes** is noticeable but acceptable — we measured by feel rather than instrument: there's a beat between "navigate to page" and "diagram appears", longer than at 11 nodes but well short of "is something broken?". Two known causes, both addressable: (a) dagre on a compound graph with two-level subgraph nesting does real work — this is the Sander-algorithm cost, not a bug; (b) the renderer is naïve, one `appendChild` per element with no `DocumentFragment` batching, ~450 elements at 200 nodes. Production fixes would be straightforward (idle-callback warm-up, batched insertion). Not worth doing in the spike.

The result that *matters* is per-frame drag cost: at 200 nodes, dragging stays smooth. That's the partial-update pattern (mutate one transform + connected paths + ancestor subgraph rects, leave everything else untouched) working as designed — and it's the property the disclosure family needs. **Initial render is a one-time tax; per-frame interaction cost is what would have killed Architecture B, and it didn't.**

**Verdict:** partial-update SVG mutation is comfortably viable for animated disclosure interactions. Edge re-routing under disclosure is the open question, not the rendering pattern itself.

## 5. Honest viability assessment

Architecture B (parser-only + dagre + d3-shape) is viable for the 200-node target on flowcharts. Drag stayed smooth at 200 nodes; initial render was slower than the small fixture but acceptable, and the bottlenecks (dagre compound layout, naïve DOM insertion) are addressable without changing the architecture. The biggest concern is **edge routing**, not rendering: dagre's output is good for static layout but has no incremental "re-route this edge given that one node moved" mode, and d3-shape's `curveBasis` is decorative not avoidant. Production will need a routing layer (orthogonal or A\*) for disclosure animations to look correct, and that's net-new code on top of the spike stack.

## 6. What I'd improve next

- **Edge routing layer.** Implement orthogonal routing (axis-aligned with one or two right-angle bends) for dragged-node and disclosure-affected edges. Keep dagre for initial layout; route incrementally on top.
- **Shape variants.** Wire `n.shape` through to actual SVG (cylinder = `<path>` with semicircular caps, parallelogram = skewed rect). The visual delta with Mermaid drops further once shapes match.
- **ELK behind a flag.** Side-by-side dagre and elkjs on the 200-node fixture to confirm the "Adaptive" mode promise from the architecture decisions doc. Same IR feeds either; lazy-load ELK so initial bundle stays small.
- **Initial-render polish.** `DocumentFragment` for the SVG build, idle-callback dagre warm-up before first paint. Cheap wins on the one-time render cost; not load-bearing for the architecture decision but worth doing before user-facing.

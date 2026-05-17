# Spike Notes

## 1. Parser Extraction

`mermaid.mermaidAPI.getDiagramFromText(source)` (v11) returns a `Diagram` object with a `.db` property that exposes `getVertices()` (Map), `getEdges()` (array), and `getSubGraphs()` (flat array). The API is undocumented but stable-ish across v10/v11. The call is async and requires a browser environment — DOMPurify's `addHook` is called during sanitization, so the parser fails in bare Node.js. Nested subgraphs come back as a flat list; hierarchy must be reconstructed by checking which subgraph IDs appear in other subgraphs' `nodes` arrays — a one-pass loop. Edge stroke types (dotted) are cleanly flagged via `FlowEdge.stroke === 'dotted'`. No blockers for production, but the private API surface means a mermaid major version bump could break the integration.

## 2. Layout Quality

Dagre's compound graph (`setParent()`) handles two-level nesting. The `rankdir: TB` output produces a left-to-right ordering within subgraphs rather than strictly top-down for sibling nodes, which diverges from Mermaid's own dagre pass (Mermaid applies additional layout tuning). Subgraph bounding boxes are computed manually from node positions + padding; dagre doesn't expose them directly. Overall topology (which nodes are above/below each other) matches. Exact x/y coordinates diverge — Mermaid applies its own edge routing and spacing tweaks on top of dagre.

## 3. Static Render Comparison

Recognizably the same diagram: same nodes, same edges, correct subgraph groupings. Differences: (1) subgraph bounding boxes are approximations from node position + padding rather than dagre's internal geometry, so they may clip or over-extend; (2) node shapes are all rectangles (intentional per scope); (3) dotted edge renders with `stroke-dasharray` as required; (4) arrow markers are simpler than Mermaid's themed markers. The graph is readable and structurally equivalent.

## 4. Drag Behavior

Drag is smooth at 60fps — mousemove fires at display refresh rate and SVG attribute mutation is cheap. The curveBasis shortcut (swap dragged endpoint, keep original waypoints) produces visibly ugly curves when a node is dragged far from its layout position — the original waypoints pull the path in the old direction before curving to the new endpoint. This is expected and acceptable for the spike. Partial-update SVG mutation (mutating `transform` and `d` attributes in place) is viable for animated disclosure interactions; the pattern scales to 50+ nodes without measurable jank.

## 5. Viability Assessment

This stack is viable for a production renderer: mermaid parse → IR → dagre layout → d3-shape edge curves → plain SVG covers the full pipeline with no missing primitives. The biggest concern is the mermaid parser's undocumented internal API — `getDiagramFromText` and `db` are not part of the public contract, and a mermaid major version could require adaptation work. Dagre's compound graph support for nested subgraphs works but produces slightly different spacing than Mermaid's own renderer, which may require manual layout tweaks for pixel-level fidelity.

## 6. What to Improve Next

- **Shape rendering**: implement cylinder (`<ellipse>` caps), parallelogram (`<polygon>`), and diamond shapes using the `node.shape` field — the `// TODO` stubs are already in renderer.ts.
- **Subgraph bounding boxes**: use dagre's internal `_label` graph geometry rather than re-computing from node positions; this fixes clip/over-extend edge cases with deeply nested subgraphs.
- **Parser abstraction**: wrap `getDiagramFromText` in a versioned adapter with a fallback to `mermaid.parse()` + manual IR construction, to insulate against mermaid API churn.

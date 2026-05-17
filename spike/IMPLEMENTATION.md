# Spike Implementation Plan: Custom Mermaid Renderer

**Goal:** Validate replacing Mermaid's renderer with a custom pipeline (dagre + d3-shape + plain SVG) while keeping Mermaid's parser. Timeboxed 2–3 hours.

**Output:** Three browser-comparable HTML pages — Mermaid reference, custom static, custom interactive (drag).

---

## 1. Scaffolding (≈15 min)

### `package.json`
Dependencies:
- `mermaid` (parser only)
- `dagre` or `@dagrejs/dagre`
- `d3-shape`, `d3-path`
- Dev: `typescript`, `vite` (simplest dev server for ESM + TS)

### `tsconfig.json`
Standard: `"target": "ES2020"`, `"module": "ESNext"`, `"moduleResolution": "bundler"`, `"strict": true`.

### Project layout
```
spike/
  package.json
  tsconfig.json
  index.html                     # 3-iframe side-by-side
  fixture.mmd                    # paste fixture from prompt
  mermaid-reference.html
  our-renderer.html
  our-renderer-interactive.html
  src/
    parser-adapter.ts
    layout.ts
    renderer.ts
    drag.ts
    main-static.ts
    main-interactive.ts
  SPIKE_NOTES.md
```

### `fixture.mmd`
Paste the flowchart TD source verbatim from the prompt (Client → Auth → Rate → OrderAPI/PayAPI, with nested subgraphs `Backend > Orders/Payments`, dotted `OrderAPI -.->|sync| PayAPI`).

---

## 2. Parser Adapter — `src/parser-adapter.ts` (≈30 min, biggest risk)

**Task:** Mermaid source → normalized IR.

**IR shape:**
```ts
interface IR {
  nodes: { id: string; label: string; shape: string; parent?: string; pinned?: boolean; x?: number; y?: number }[];
  edges: { from: string; to: string; label?: string; style?: 'solid' | 'dotted' }[];
  subgraphs: { id: string; label: string; parent?: string; children: string[] }[];
}
```

**Approach (in order — stop at the first that works):**
1. `await mermaid.parse(source, { suppressErrors: false })` — check the return for parse tree access.
2. If empty, dig into `mermaid/dist`: import the flow parser directly, e.g. `import flowDb from 'mermaid/dist/diagrams/flowchart/flowDb'` (path varies by version — `grep` the installed package for `flowDb` and `getVertices`/`getEdges`/`getSubGraphs`).
3. Call `parser.parse(source)`, then read `flowDb.getVertices()`, `flowDb.getEdges()`, `flowDb.getSubGraphs()`.

**Subgraph nesting:** `getSubGraphs()` returns flat list; reconstruct hierarchy by checking which subgraph IDs appear in another subgraph's `nodes` array. Document any awkwardness in `SPIKE_NOTES.md`.

**Edge styles:** Mermaid edge objects have `type`/`stroke` fields — map `dotted_arrow_point` (or similar) → `style: 'dotted'`.

**Bail-out:** If parser internals are hostile after 30 min, hand-write the IR for the fixture and document the obstacle. Working-and-incomplete > stuck-and-perfect.

---

## 3. Layout — `src/layout.ts` (≈25 min)

```ts
import dagre from '@dagrejs/dagre';

export function layout(ir: IR): IR {
  const g = new dagre.graphlib.Graph({ compound: true });
  g.setGraph({ rankdir: 'TB', nodesep: 50, ranksep: 50 });
  g.setDefaultEdgeLabel(() => ({}));

  // Add subgraphs as nodes (compound graph)
  for (const sg of ir.subgraphs) {
    g.setNode(sg.id, { label: sg.label });
    if (sg.parent) g.setParent(sg.id, sg.parent);
  }

  // Add nodes
  for (const n of ir.nodes) {
    const width = n.label.length * 8 + 24;
    const height = 40;
    if (n.pinned && n.x != null && n.y != null) {
      g.setNode(n.id, { width, height, x: n.x, y: n.y });
    } else {
      g.setNode(n.id, { width, height });
    }
    if (n.parent) g.setParent(n.id, n.parent);
  }

  // Edges
  for (const e of ir.edges) g.setEdge(e.from, e.to, { label: e.label });

  dagre.layout(g);

  // Read positions back into IR
  for (const n of ir.nodes) {
    const node = g.node(n.id);
    n.x = node.x; n.y = node.y;
    (n as any).width = node.width; (n as any).height = node.height;
  }
  for (const e of ir.edges) {
    const edge = g.edge(e.from, e.to);
    (e as any).points = edge.points;
  }
  return ir;
}
```

**Pinned nodes:** dagre honors pre-set `x`/`y` on nodes when they're already laid out — verify; if not, post-process by overwriting positions for pinned nodes and re-routing edges via dagre is fine (waypoints stay).

---

## 4. Renderer — `src/renderer.ts` (≈40 min)

### `renderFull(ir, mountEl)`

Build SVG with namespace `http://www.w3.org/2000/svg`:

1. `<defs>` with arrow marker:
   ```html
   <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
     <path d="M 0 0 L 10 5 L 0 10 z" fill="#333"/>
   </marker>
   ```

2. **Subgraphs first** (back layer): for each subgraph, compute bbox from positioned children (recursive — include nested subgraph bboxes), pad ~20px, render `<g data-subgraph-id><rect/><text/></g>`. Render outer subgraphs before inner ones so labels stack correctly.

3. **Edges** (middle layer):
   ```ts
   import { line, curveBasis } from 'd3-shape';
   const lineFn = line<{x:number,y:number}>().x(d => d.x).y(d => d.y).curve(curveBasis);
   const d = lineFn(edge.points);
   // <g data-edge-id="from->to"><path d marker-end="url(#arrow)" stroke-dasharray={style==='dotted'?'5,5':null}/><text>label</text></g>
   ```

4. **Nodes** (top layer): `<g data-node-id transform="translate(x-w/2, y-h/2)"><rect width height/><text x=w/2 y=h/2 text-anchor=middle dominant-baseline=middle>label</text></g>`. Add `// TODO: switch on node.shape — cylinder/parallelogram/etc.` above the rect.

5. **Build adjacency map** during render: `nodeId → edgeIds[]` stored on the mount element (`mountEl.__adjacency`) for use by `updateNodePosition`.

### `updateNodePosition(nodeId, newX, newY, mountEl, ir)`

- Find node in IR, mutate `x`, `y`.
- `mountEl.querySelector('[data-node-id="' + nodeId + '"]').setAttribute('transform', ...)`.
- For each connected edge in adjacency map:
  - Get original `points` array (cached on the edge IR object — store at first render).
  - Replace endpoint matching `nodeId` with `{x: newX, y: newY}`. Other endpoint and intermediate waypoints unchanged.
  - Recompute path via `lineFn(newPoints)`, mutate `<path>` `d` attribute.

**Critical:** keep an `originalPoints` snapshot per edge from initial dagre layout; the shortcut is to not re-route, just swap the dragged endpoint.

---

## 5. Mermaid Reference — `mermaid-reference.html` (≈5 min)

```html
<!DOCTYPE html>
<html><body>
<pre class="mermaid">
flowchart TD
  ...paste fixture...
</pre>
<script type="module">
  import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
  mermaid.initialize({ startOnLoad: true });
</script>
</body></html>
```

Fetch `fixture.mmd` instead of inlining if convenient.

---

## 6. Static Custom — `our-renderer.html` + `main-static.ts` (≈10 min)

```ts
// main-static.ts
import { parseToIR } from './parser-adapter';
import { layout } from './layout';
import { renderFull } from './renderer';

const src = await fetch('./fixture.mmd').then(r => r.text());
const ir = layout(await parseToIR(src));
renderFull(ir, document.getElementById('mount')!);
```

`our-renderer.html`: `<svg id="mount" width="1200" height="800"></svg>` + `<script type="module" src="./src/main-static.ts">`.

---

## 7. Interactive — `drag.ts` + `main-interactive.ts` (≈25 min)

### `drag.ts`
```ts
export function attachDrag(svg: SVGSVGElement, ir: IR, mountEl: SVGGElement) {
  let dragging: { id: string; offsetX: number; offsetY: number } | null = null;

  svg.addEventListener('mousedown', (e) => {
    const target = (e.target as Element).closest('[data-node-id]');
    if (!target) return;
    const id = target.getAttribute('data-node-id')!;
    const node = ir.nodes.find(n => n.id === id)!;
    const pt = svgPoint(svg, e);
    dragging = { id, offsetX: pt.x - node.x!, offsetY: pt.y - node.y! };
  });

  svg.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const pt = svgPoint(svg, e);
    updateNodePosition(dragging.id, pt.x - dragging.offsetX, pt.y - dragging.offsetY, mountEl, ir);
  });

  svg.addEventListener('mouseup', () => {
    if (!dragging) return;
    const node = ir.nodes.find(n => n.id === dragging!.id)!;
    node.pinned = true;
    dragging = null;
  });
}

function svgPoint(svg: SVGSVGElement, e: MouseEvent) {
  const pt = svg.createSVGPoint();
  pt.x = e.clientX; pt.y = e.clientY;
  return pt.matrixTransform(svg.getScreenCTM()!.inverse());
}
```

### `main-interactive.ts`
Pipeline + drag + a `<button id="reset">Reset Layout</button>`:
```ts
document.getElementById('reset')!.addEventListener('click', () => {
  ir.nodes.forEach(n => { n.pinned = false; });
  layout(ir);
  mountEl.innerHTML = '';
  renderFull(ir, mountEl);
  attachDrag(svg, ir, mountEl);
});
```

**Smoothness:** mousemove fires faster than 60fps in browsers — no `requestAnimationFrame` needed for spike, but note in `SPIKE_NOTES.md` if it stutters.

---

## 8. Index — `index.html` (≈5 min)

```html
<!DOCTYPE html>
<html><body style="margin:0;display:grid;grid-template-columns:1fr 1fr 1fr;height:100vh">
  <div><h3>Mermaid (target)</h3><iframe src="mermaid-reference.html" style="width:100%;height:95%;border:0"></iframe></div>
  <div><h3>Custom static</h3><iframe src="our-renderer.html" style="width:100%;height:95%;border:0"></iframe></div>
  <div><h3>Custom interactive</h3><iframe src="our-renderer-interactive.html" style="width:100%;height:95%;border:0"></iframe></div>
</body></html>
```

---

## 9. SPIKE_NOTES.md (≈15 min — write last, while it's fresh)

Six sections per the prompt. Be brutally honest. Max 400 words total.

1. **Parser extraction** — public API or internals? Subgraph nesting clean?
2. **Layout quality** — vs. Mermaid, specific differences.
3. **Static render comparison** — same/different/recognizably-rough.
4. **Drag behavior** — smoothness, stale-waypoint ugliness at extreme positions, viability for animated disclosure.
5. **Viability** — 3 sentences. Biggest concern.
6. **Next iteration** — 3 bullets.

---

## Risk-Ordered Punch List

| Risk | Mitigation |
|------|------------|
| Mermaid parser API undocumented / changes between versions | Pin `mermaid@10.x`; if internals are hostile after 30 min, hand-roll IR for this fixture and document |
| Dagre compound graph + nested subgraphs | Test with single-level first; if double nesting breaks, flatten and document |
| curveBasis with stale waypoints looks awful when dragging | Expected — note in SPIKE_NOTES, don't try to fix |
| TS toolchain friction on Windows | Use Vite (`npm create vite@latest`) — handles TS+ESM out of the box |

---

## Definition of Done Checklist

- [ ] `npm run dev`, open `index.html` → three diagrams visible
- [ ] Custom static is recognizably the same diagram as Mermaid's
- [ ] Drag any node on interactive page; edges update during the drag
- [ ] Reset Layout button works
- [ ] `SPIKE_NOTES.md` answers all 6 sections honestly

---

## Time Budget (target 2.5h)

| Phase | Time |
|-------|------|
| Scaffold + deps | 15m |
| Parser adapter | 30m |
| Layout | 25m |
| Renderer (full + partial) | 40m |
| Mermaid reference page | 5m |
| Static page wiring | 10m |
| Drag + interactive page | 25m |
| Index + cross-browser sanity check | 5m |
| SPIKE_NOTES | 15m |
| **Total** | **2h 50m** |

If parser eats >45m: hand-roll IR, move on. The architecture decision needs the rendering/drag signal more than it needs proof the parser API works.

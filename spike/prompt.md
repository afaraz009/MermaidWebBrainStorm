  I'm validating whether I can replace Mermaid's renderer with my own pipeline while keeping its parser. This is a 2-3 hour timeboxed spike — working-and-incomplete beats stuck-and-perfect.

  Output: three HTML pages I can open in a browser to compare:
  1. Mermaid's official rendering of a fixture (the visual target)
  2. My custom pipeline rendering the same fixture (static)
  3. My custom pipeline rendering the same fixture, with drag-to-reposition

  Stack constraints (do not deviate)

  - mermaid (npm package) — used only for parsing. Do not call mermaid.render() in the custom pipeline. Find and use mermaid.parse() or the underlying flow database (flowDb).
  - dagre (or @dagrejs/dagre) — graph layout
  - d3-shape — edge curve generation, specifically curveBasis
  - d3-path — companion to d3-shape if needed
  - Plain SVG output. No React, Vue, or other framework.
  - Vanilla TypeScript (preferred) or JavaScript.
  - No drag library. Plain DOM mousedown / mousemove / mouseup. No d3-drag, no react-dnd, no interact.js.

  Project structure

  spike/
    package.json
    tsconfig.json
    index.html                       # links to all three pages side by side
    fixture.mmd                      # Mermaid source (provided below)
    mermaid-reference.html           # renders fixture via Mermaid (target)
    our-renderer.html                # renders fixture via custom pipeline (static)
    our-renderer-interactive.html    # custom pipeline + drag
    src/
      parser-adapter.ts              # mermaid source -> normalized IR
      layout.ts                      # IR -> dagre layout -> positioned graph
      renderer.ts                    # positioned graph -> SVG (with partial-update support)
      drag.ts                        # mouse drag handlers (interactive page only)
      main-static.ts                 # wires pipeline for our-renderer.html
      main-interactive.ts            # wires pipeline + drag for our-renderer-interactive.html
    SPIKE_NOTES.md                   # findings (max 400 words)

  Fixture (fixture.mmd)

  flowchart TD
      Client[Client App]

      subgraph Gateway[API Gateway]
          Auth[Auth Service]
          Rate[Rate Limiter]
      end

      subgraph Backend[Backend Services]
          subgraph Orders[Order Domain]
              OrderAPI[Order API]
              OrderDB[(Order DB)]
              OrderQueue[/Order Queue/]
          end
          subgraph Payments[Payment Domain]
              PayAPI[Payment API]
              PayDB[(Payment DB)]
          end
          Notif[Notification Service]
      end

      Client --> Auth
      Auth --> Rate
      Rate --> OrderAPI
      Rate --> PayAPI
      OrderAPI --> OrderDB
      OrderAPI --> OrderQueue
      OrderQueue --> Notif
      PayAPI --> PayDB
      PayAPI --> Notif
      OrderAPI -.->|sync| PayAPI

  Variety in this fixture is intentional:
  - Two-level subgraph nesting (Backend contains Orders and Payments)
  - Multiple node shapes (rect [...], cylinder [(...)], parallelogram [/.../])
  - A dotted edge with a label (-.->|sync|)
  - Edges crossing subgraph boundaries
  - A node sibling to nested subgraphs (Notif)

  Pipeline requirements (in order)

  1. Parser adapter (parser-adapter.ts)

  - Load fixture.mmd, call Mermaid's parser, return a normalized internal representation:
  
  - Use mermaid.parse() and read from the returned data structure. If the public API is awkward, dig into mermaid/dist to find flowDb or equivalent. Do not write your own Mermaid parser.
  - If extracting nested subgraphs is hard, document exactly what you tried and what Mermaid's API returned in SPIKE_NOTES.md. This is critical signal for the architecture decision.

  1. Layout (layout.ts)

  - Feed the IR to dagre. Use compound graph support (setParent()) for nested subgraphs.
  - Configure with rankdir: TB to match flowchart TD.
  - Estimate node dimensions from label length: width = label.length * 8 + 24, height = 40.
  - Honor pinned nodes: if node.pinned === true, skip dagre's positioning for that node and use node.x, node.y directly. (Used by drag — see below.)
  - Return positioned IR: nodes have { x, y, width, height }, edges have { points: [{x, y}, ...] }.

  3. Renderer (renderer.ts)

  Two functions:

  renderFull(positionedIR, mountEl) — full render from scratch:
  - Each node: <g data-node-id="..." transform="translate(x, y)"><rect ...><text ...></text></g>
  - Each edge: <g data-edge-id="from->to"><path d="..." marker-end="url(#arrow)" /><text>label</text></g> where d comes from d3.line().curve(d3.curveBasis)(edge.points)
  - Subgraphs: <g data-subgraph-id="..."><rect ... /><text>label</text></g> enclosing the bounding box of member nodes (computed from positioned children with padding ~20px), with the label at the top
  - A <defs> block with the arrow marker
  - All shapes can be rectangles in this spike — leave a code comment where shape variation would plug in (// TODO: switch on node.shape — cylinder/parallelogram/etc.)
  - Try to make the dotted edge dotted (stroke-dasharray="5,5") if it's cheap; skip if it's not

  updateNodePosition(nodeId, newX, newY, mountEl, ir) — partial update for drag:
  - Mutate the existing <g data-node-id="..."> transform attribute. Do not unmount and re-mount.
  - Find all edges connected to this node (via an in-memory adjacency map you build during render).
  - For each connected edge: recompute the path using d3.line().curve(d3.curveBasis) over [other-endpoint, ...intermediate-waypoints, dragged-node-new-center]. Keep all original waypoints from the dagre layout; only replace the endpoint that's the dragged node. This is intentionally a shortcut.
  - Mutate the existing <path> d attribute on each connected edge.

  4. Mermaid reference (mermaid-reference.html)

  Dead simple. Use the official Mermaid CDN script and render the fixture. This is the visual target — minimal effort.

  5. Static custom render (our-renderer.html)

  Runs the pipeline and mounts the SVG via renderFull().

  6. Interactive custom render (our-renderer-interactive.html)

  Same as static, plus drag (drag.ts):

  - Each node has mousedown / mousemove / mouseup listeners.
  - During drag (mousemove): compute new node center from cursor position, call updateNodePosition(). Target: smooth at 16ms intervals.
  - After drag (mouseup): set node.pinned = true, save final x, y to the IR.
  - A "Reset Layout" button: clear all pinned flags, re-run dagre, call renderFull().

  Important: edges connected to the dragged node update during the drag, not just after release. The point of this spike is to see how real-time edge updates behave on this stack.

  7. Side-by-side index.html

  Three iframes side by side, labels above each ("Mermaid (target)" / "Custom static" / "Custom interactive"). One screen, easy comparison.

  Out of scope (do not implement)

  - Multiple node shapes (rectangles only)
  - Edge style variation beyond dotted-if-cheap
  - Theme variables / classDef
  - Animations / transitions
  - Pan/zoom
  - Click handlers (other than drag)
  - Markdown rendering
  - Touch / pointer events (mouse only)
  - Multi-select drag
  - Snap-to-grid or alignment guides
  - Undo/redo
  - Re-routing dragged-node edges through dagre (the curveBasis-with-original-waypoints shortcut is fine)

  SPIKE_NOTES.md

  1. Parser extraction — one paragraph
  - Was Mermaid's parser API usable directly, or did you need to reach into internals?
  - Did nested subgraphs come through cleanly or did you have to reconstruct the hierarchy?
  - Anything that would block a production implementation?

  2. Layout quality
  - Does dagre's output look ~equivalent to Mermaid's? Specific differences?
  - Did anything surprise you?

  3. Static render comparison
  - Open our-renderer.html and mermaid-reference.html side by side. Honest assessment: same diagram? Different diagram? Recognizably-the-same-but-rough?

  4. Drag behavior
  - Does drag feel smooth (eyeball judgment, no instrumentation needed)?
  - How do edges look when a node is dragged far from its original position? (curveBasis with stale waypoints will produce ugly curves at extreme positions — note honestly)
  - Is partial-update SVG mutation viable for animated disclosure interactions later? One sentence.

  5. Honest viability assessment
  - Three sentences max. Is this stack viable for a production renderer? What's the biggest concern that surfaced?

  6. What you'd improve next
  - Three bullets. What you'd build/fix/explore in the next iteration if proceeding.

  Hard constraints

  - 2-3 hours wall-clock max. If something is taking too long (parser API hostile, dagre subgraph nesting weird), simplify and document in SPIKE_NOTES.md.
  - Working-and-incomplete beats stuck-and-perfect. A static render that works + a noted drag limitation is more valuable than no render at all.
  - Be brutally honest in SPIKE_NOTES.md. I'm using this to make a load-bearing architecture decision. A confident "this stack is viable" when you're not sure is the worst outcome.

  Definition of done

  - I open index.html in a browser.
  - I see three diagrams side by side.
  - The static custom render is recognizably the same diagram as Mermaid's.
  - The interactive page lets me drag any node, with edges updating in real-time.
  - SPIKE_NOTES.md gives me a clear read on whether to proceed.
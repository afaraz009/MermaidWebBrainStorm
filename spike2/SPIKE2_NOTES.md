# Spike 2 Notes — A* edge routing on drop

**Status:** Wrapped. Outcome: grid-A* is viable for the 200-node target. Several improvements layered on top of the original 2–3-hour timebox have closed most of the failure modes flagged in the first pass.

This document records *current* implementation and *current* decisions. For history of how we got here (early findings, the initial bake-off question that picked SVG + parser-only + dagre + d3-shape) see `spike/SPIKE_NOTES.md`. For the original Spike 2 prompt and plan: `prompt-spike2.md`, `IMPLEMENTATION_SPIKE2.md`.

---

## 1. A* parameter choices (live-tunable in the UI)

The defaults are what shipped. Every parameter is exposed in the right-pane control panel so the next agent can sweep them without code changes.

| Parameter | Default | Range | Why |
|---|---|---|---|
| **Cell size** | 10px | 6–30px | 10px hits the sweet spot for typical 80×40 nodes — 8px multiplies grid cell count, 12px chunks short edges. Larger cells (20–30px) trade routing quality for fewer cells, useful on the 200-node fixture if expansion counts matter. |
| **Padding** | locked to cellSize | — | Locked equal to cellSize so the blocked ring around each node is exactly one cell wide regardless of resolution. Decoupling them caused sub-cell rounding mismatches between the blocked region and the docking cell math. |
| **Connectivity** | 8-way | 4 / 8 | 4-way alone produces visible staircase paths even after collapse. 8-way costs almost nothing extra and looks much better. |
| **Corner cutting** | Blocked | Blocked / Allowed | When blocked, a diagonal move requires both orthogonal neighbors free. Prevents the path from slipping through the corner where two nodes' padded bboxes touch diagonally. |
| **Heuristic** | Octile | Manhattan / Octile / Euclidean / Chebyshev / Zero | Octile is admissible on 8-connected grids and encourages straight runs. Zero is Dijkstra (useful for debugging — shows the full expansion field). |
| **Margin cells** | 4 | (code-only) | Free cells around the bounding box of all nodes; gives A* somewhere to go when routing around the edge of the layout. |

**Smoothing:** *removed.* The first pass used `collinear-collapse → d3 curveBasis`. We dropped curveBasis entirely — straight segments between corner points read more honestly as "the route A* actually found," and curveBasis was the source of the worst residual failure mode in the first pass (obstacle-unaware control points pulling the curve through nodes A* had avoided). What ships now is collapse-collinear only, rendered as `M corner_0 L corner_1 L corner_2 ...`. See §4.

---

## 2. Routing quality (current)

**Small fixture:** drag a node behind any other node — connected edges bend cleanly around the obstacle, land face-on (perpendicular) on both endpoint nodes' borders, arrow tips point directly at the target. No staircase artifacts, no visible kinks at the start/end.

**200-node fixture, tight subgraph clusters:** edges still find paths in nearly every case. With cell size 10px and padding=cellSize, the obstacle ring is wide enough that A* almost never has to thread through a one-cell gap. Corner-cut blocking removes the remaining "slipped through the diagonal" cases.

**What changed from the first pass to fix the "noisy 200-node cluster" finding:**
1. **Face-centered docking with outward normal.** Each endpoint computes a *dock cell* (one cell outside the face the other endpoint sits closest to) plus the face's outward normal. A* routes between *guard cells* (one normal-step further out), then the dock cells are prepended/appended. The first and last rendered segments are along the face normal *by construction* — arrows always enter and exit perpendicular to the node border, not at oblique angles.
2. **Aspect-ratio-aware face selection** (`|dx|/halfW` vs `|dy|/halfH` instead of raw `|dx|` vs `|dy|`). Wide nodes (label nodes) no longer get edges popping out the top when the other endpoint is slightly above the center line.
3. **Node snap-to-grid on drop.** On mouseup, the dropped node is snapped so its left/top edge lands on a grid line. Removes sub-cell drift that was previously making "blocked cells" jitter between drops.
4. **Grid origin snap.** `buildGrid` snaps `originX/originY` to multiples of `cellSize`. Without this, nudging a node by a sub-cell amount shifted the whole grid and every cell boundary drifted with it.

The "smoothed-path collision" production-readiness ceiling flagged in the first pass is no longer a concern because we removed smoothing. The new ceiling is layout density (see §6).

---

## 3. Drop-time latency

Eyeball judgment, not instrumented:

- **Small fixture (~10 nodes):** imperceptible.
- **200-node fixture, typical node (1–2 edges):** imperceptible.
- **200-node fixture, hub node (4+ edges):** under ~100ms — slightly noticeable as a tiny pause before edges settle, but well under "perceptible lag."

Per-edge grid rebuild still dominates. Could be amortized to one rebuild per drop with a "mask off endpoints on the fly" trick, but it isn't worth the complexity at current latency. Flagged for the next agent if they explore larger fixtures.

The grid-overlay visualization (toggle button in the UI) renders cell counts in the thousands without jank, which is a useful upper-bound proxy for "is the grid size pathologically large at this cell size."

---

## 4. Why we shipped straight segments instead of curveBasis

The original plan was collinear-collapse → curveBasis for "smoother" rendering. Three problems killed it:

1. **curveBasis approximates, doesn't interpolate.** Control points pull the curve toward straight runs but the actual curve can cut up to ~1/3 of the cell-size inside obstacles that A* explicitly avoided. Looks fine in the small fixture, fails visibly in tight 200-node clusters.
2. **Arrow tip direction drifts.** The shortening logic to land the arrow on the border has to subtract a fixed tail length along the curve's tangent. With curveBasis that tangent is *not* aligned to the face normal even when the underlying corner polyline ends perpendicular — so arrows looked slightly off-axis.
3. **Communicates the wrong thing.** A* gives you a corner polyline. Drawing a smooth curve hides the grid origin of the path and obscures debugging when something goes wrong. Straight segments read as "this is what A* found," which is honest.

Collinear-collapse alone is enough: it drops the zigzag along long straight runs and leaves only the genuine corners. With face-normal docking (§2), the start/end segments are guaranteed straight along the normal, so the visual is "perpendicular face exit → straight runs with right-angle turns → perpendicular face entry." That reads cleanly even at high diagram density.

**If smoothing is wanted later:** restore curveBasis *only* on the interior corner polyline (drop the first and last cells before smoothing, keep them as straight tails). The dock/guard machinery already exists for this; the renderer just needs to splice in three sub-paths instead of one.

---

## 5. Failure modes (current)

| Mode | When it triggers | Behavior | Mitigation |
|---|---|---|---|
| Start or goal cell still blocked after `nearestFreeCell` | Dropped node lands fully inside another node's padded bbox (overlapping drop) | Returns the straight 2-point fallback `[startCenter, goalCenter]` — edge cuts through obstacles but is never lost. | The grid overlay clearly shows the situation when the user toggles it. No silent failure. |
| A* finds no path | Goal cell isolated by a full obstacle wall (extremely rare; haven't reproduced on either fixture even with adversarial layouts) | Same 2-point fallback. | None needed at current density. Would be the trigger to revisit routing approach. |
| Two nodes overlapping after drop | User drags a node on top of another | Both nodes render, no collision detection, A* still routes everything else's edges normally | Out of scope — node-on-node collision was never a Spike 2 deliverable. Flagged for the next layer (UX or constraint-based layout). |
| Edge endpoint slips after a *different* node moves | Never — `routedPath` is only invalidated when an endpoint moves | n/a | This is the intended semantics; flagged here so it isn't mistaken for a bug. |
| Subgraph borders ignored | Always (by design) | Edges can cross subgraph borders | Normal Mermaid behavior; treating subgraphs as obstacles would over-constrain. |

---

## 6. Production readiness

**Verdict: grid-A* is viable for the 200-node target.** All concerns from the first pass have been addressed except one: the approach is still *layout-dense* (lots of small cells), so cost scales with canvas area, not graph size. At ~2400×1800 / 10px that's ~432k cells worth of `Uint8Array`; A* itself touches only a small fraction. Manageable for indie-scale targets.

**Ceiling we hit:** layout density, not pathfinding throughput. The 200-node fixture sits comfortably; 500-node clusters in tight subgraphs would force either bigger cells (chunkier paths) or per-edge subgrid building (more code, more bugs). Per the renderer-research session in the PRD, the 200-node tier is the primary Wave 1.1 target and the 500/1000-node tiers can be revisited after the primary pipeline ships.

**Recommended next steps (for the next agent — see `HANDOFF.md`):**
1. Try **orthogonal routing with port assignment** as a head-to-head comparison. Segment-based, no grid, no smoothing pass, deterministic right-angle output. The face-normal dock + corner polyline we already produce is structurally close to what an orthogonal router emits — a useful baseline for comparison.
2. Try **ELKjs as a routing-only engine** (layout from dagre, ports + edge routing from ELK). Heavier but battle-tested for layered graphs and what large diagram tools (PlantUML web, Eclipse Sirius) use.
3. Try **hybrid: dagre layout + A* fallback only when a straight edge intersects an obstacle.** Cheaper at scale because most edges don't need A* at all; only the ones that would otherwise overlap a node trigger routing.

The current implementation is good enough to ship Wave 1.1's interactive disclosure family on top of. It is not the last word on edge routing — the next spike round should explicitly compare it against one of the three alternatives above before locking the production pipeline.

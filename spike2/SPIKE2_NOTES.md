# Spike 2 — A* edge routing on drop

## 1. A* parameter choices

- **Cell size: 10 px.** Mid of 8–12. Smaller was nicer but slower on 200 nodes; larger looked chunky.
- **Heuristic: octile.** Admissible for 8-connected; Manhattan over-estimates diagonals, Euclidean under-estimates.
- **Obstacle padding: 6 px.** Keeps paths off node borders without long detours.
- **Smoothing: collapse colinear runs in A\*, then `curveBasis` at render.** Routing module stays pure (returns waypoints); d3-shape does the visual smoothing.

## 2. Routing quality

Drag a node behind another, release: edges bend around the obstacle, land outside the padded box with a short tail onto the destination border. Colinear-collapse + curveBasis hides most stairstep. On 200 nodes the same holds for low-degree nodes. In dense clusters, two routed edges sometimes hug the same obstacle and overlap — that's a port-assignment problem, not an A* one.

## 3. Drop-time latency

No perceptible pause on the small fixture. On 200 nodes with a 4-edge node, sub-half-second beat between release and re-route; reads as "settling," not "stuck." Per-edge with no shared grid memoization, so scales linearly with edge count. Likely bottleneck under heavier graphs is obstacle-mask construction, not A* search.

## 4. Failure modes

Node dropped tight against three neighbors: `routeEdge` returns `ok: false` — start/goal cells get padded into blocked and `nearestFree`'s radius-3 fallback can't escape. Renderer keeps the prior dagre `points` so the edge stays visible, but doesn't avoid the obstacle. Right failure shape for a spike (visible, not silent); production needs a wider escape search or a "push node out to a routable cell" fallback.

## 5. Edge cases worth flagging

- **Endpoint identity matters.** `routeEdge` filters `fromBox`/`toBox` by reference — build obstacles and boxes from the same node lookup or you'll route through your own endpoint.
- **Bounds fixed at initial canvas size.** Drop a node well outside and the routing grid clips; path completes but hugs the boundary.
- **`routedAt` recorded but never read.** Invalidation is unconditional; reading `routedAt` would preserve routing for edges whose endpoints haven't moved. Not load-bearing for the spike.

## 6. Production readiness

Grid-A* is viable for the 200-node target on flowcharts of this style — drop latency stays under perceptual threshold and routes are recognisably obstacle-aware. Ceiling: edge overlap in dense clusters, where per-edge optima converge on the same channels. Next: orthogonal routing with per-node port assignment; ELKjs's edge router held in reserve.

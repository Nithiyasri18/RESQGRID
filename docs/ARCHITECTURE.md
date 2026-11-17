# RESQGRID — Architecture, DAA Algorithms & Faculty Demonstration Guide

> **Academic Simulation Disclaimer:** RESQGRID is a Design & Analysis of Algorithms (DAA) capstone prototype for simulated disaster-response decision support across a configurable Chennai metropolitan study area. All incidents, road closures, team positions, and travel times are simulated. Open OpenStreetMap edges must never be interpreted as verified flood-safe.

## 1. System Architecture

```text
React 19 + TypeScript + Tailwind v4 + Leaflet + Recharts
                     │  REST (/api/v1/*) + SSE (/api/v1/events)
                     ▼
        Express + TypeScript Server (Port 3000)
          ├── JWT Auth + RBAC (admin / dispatcher / viewer)
          ├── Versioned Directed Graph Cache (networkVersion + scenarioId + closureVersion)
          ├── Custom DAA Engines (server/algorithms/)
          │     ├── traversal.ts    (BFS, DFS)
          │     ├── shortestPath.ts (BinaryMinHeap, Dijkstra, A*)
          │     ├── dispatch.ts     (Greedy Baseline, Lexicographic MCMF via SPFA)
          │     └── benchmark.ts    (Reproducible scaling & closure sweeps)
          └── SQLite Persistent Store (resqgrid.db with idempotent migrations)
```

## 2. Database ER Overview

- `users` (1) ───< `audit_logs`, `disaster_scenarios`, `rescue_assignments`
- `disaster_scenarios` (1) ───< `incidents`, `rescue_teams`, `scenario_road_closures`, `rescue_assignments`, `algorithm_runs`, `volunteers`
- `road_nodes` (1) ───< `road_edges` (directed `source_node_id -> target_node_id`)
- `road_edges` (1) ───< `scenario_road_closures` (isolated per scenario; base network untouched)
- `incidents` & `rescue_teams` ───< `rescue_assignments` (status state machine: `proposed -> approved -> dispatched -> en_route -> arrived -> completed | cancelled`)

## 3. Custom DAA Algorithms & Complexity Table

| Algorithm | Implementation | Time Complexity | Space Complexity | Academic Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **BFS** | Explicit FIFO Queue | `O(V + E)` | `O(V)` | Unweighted reachability & hop count |
| **DFS** | Explicit LIFO Stack | `O(V + E)` | `O(V)` | Connected exploration & traversal trace |
| **Dijkstra** | Adjacency Lists + Custom `BinaryMinHeap` | `O((V + E) log V)` | `O(V + E)` | Exact weighted shortest path (distance or time) |
| **A\*** | Binary Min-Heap + Admissible Geodesic `h(u)` | `O((V + E) log V)` worst-case | `O(V + E)` | Goal-directed optimal path with reduced explored set |
| **Greedy Dispatch** | Severity Sort + Nearest Feasible Route | `O(D·T + D log D)` post-matrix | `O(T + D)` | Myopic baseline showing local blocking pitfalls |
| **Lexicographic MCMF** | Residual Graph + Sequential Tier SPFA | `O(F · V_flow · E_flow)` | `O(V_flow + E_flow)` | Maximizes Critical -> High -> Medium -> Low coverage, then minimizes total route cost |

## 4. OpenStreetMap Attribution & Geographic Scope

- **Study Area vs GCC:** The configurable study-area polygon includes Greater Chennai Corporation (GCC) core zones plus outer metropolitan corridors (Avadi, Ambattur West, Tambaram, Sholinganallur). The UI explicitly distinguishes outer metro areas from GCC administrative boundaries.
- **Attribution:** Map tiles & road references © OpenStreetMap contributors (ODbL).

## 5. Faculty 5–7 Minute Demonstration Script

1. **Authenticate (`/login`):** Use the Academic Demo Admin session (or seeded credentials) to demonstrate RBAC.
2. **Command Center (`/dashboard`):** Review live DB KPIs, severity breakdown, and audit trail.
3. **Chennai Study-Area Map (`/map`):** Switch to *Velachery Northeast Monsoon Flood Simulation*, inspect blocked vs restricted roads, click the map to create a simulated incident, and block an arterial road.
4. **DAA Routing & Comparison (`/routes`):** Run Dijkstra vs A* from a Guindy rescue base to a Velachery incident; compare explored nodes, relaxations, and verify equal optimal cost; block a used road and click **Rerun after closure**; play back BFS/DFS step animation.
5. **Rescue Dispatch Optimization (`/dispatch`):** Run **Compare Plans** to contrast Greedy vs Lexicographic MCMF; inspect unmet demand reasons; click **Approve Selected Plan**, then step an assignment through `dispatched -> en_route -> arrived -> completed`.
6. **Analytics & Benchmarks (`/analytics`):** Run the reproducible benchmark suite, inspect scaling (`V` vs runtime) and closure-impact curves, and export raw records via **Export CSV**.

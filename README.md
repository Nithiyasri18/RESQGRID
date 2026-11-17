# RESQGRID — Intelligent Emergency Rescue Routing and Team Dispatch Optimization

Academic Design & Analysis of Algorithms (DAA) capstone prototype for simulated disaster-response decision support across a configurable Chennai metropolitan study area.

> **Disclaimer:** RESQGRID is an academic simulation and human-reviewed decision-support prototype, **not** a live emergency response service. All incidents, road closures, rescue teams, positions, and travel times are simulated. Open OpenStreetMap edges must never be interpreted as verified hazard-safe.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment variables (optional; sensible dev defaults provided)
cp .env.example .env

# 3. Start full-stack server (Express API + Vite React SPA on port 3000)
npm run dev
```

## Verification Commands

```bash
# TypeScript typecheck
npm run lint

# Custom DAA algorithms & SQLite integration tests
npm test

# Production bundle build
npm run build
```

## Implemented Modules

- **Database & Seed (`server/db.ts`, `server/seed.ts`)**: Versioned SQLite migrations (`users`, `disaster_scenarios`, `road_nodes`, `road_edges`, `scenario_road_closures`, `incidents`, `rescue_teams`, `rescue_assignments`, `algorithm_runs`, `audit_logs`, `volunteers`, `shelters_hospitals`, `system_settings`) with 5 reproducible Chennai scenarios.
- **Custom DAA Engines (`server/algorithms/`)**:
  - `traversal.ts`: Custom FIFO Queue **BFS** and LIFO Stack **DFS** (`O(V + E)`).
  - `shortestPath.ts`: Custom `BinaryMinHeap`, **Dijkstra** (`O((V + E) log V)`), and **A\*** with admissible geodesic distance & max-speed time heuristics.
  - `dispatch.ts`: **Greedy Baseline** vs **Lexicographic Min-Cost Max-Flow** (sequential severity tiers on residual graph via SPFA).
  - `benchmark.ts`: Reproducible scaling, closure-resilience, and resource-fulfillment benchmark suite.
- **Full-Stack Routes (`src/pages/`)**: `/dashboard`, `/map`, `/incidents`, `/routes`, `/dispatch`, `/scenarios`, `/analytics`, `/portal`, `/settings`, `/login`.
- **Offline OSMnx Importer (`scripts/import_chennai_roads.py`)**: Optional Python script for extracting fresh OpenStreetMap drivable graphs locally with ODbL attribution.

See `docs/ARCHITECTURE.md` for ER overview, algorithm complexity analysis, and the 5–7 minute faculty demonstration script.

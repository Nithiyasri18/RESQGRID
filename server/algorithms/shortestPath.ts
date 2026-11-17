import { haversineMeters } from '../chennaiNetwork.ts';
import type { CostMode } from '../types.ts';
import { getEdgeWeight, type DirectedEdgeEntry, type GraphSnapshot } from './graph.ts';

/**
 * Custom Binary Min-Heap priority queue for Dijkstra & A*.
 * Supports O(log N) push and pop operations.
 */
export class BinaryMinHeap<T> {
  private heap: Array<{ key: number; value: T }> = [];

  get size(): number {
    return this.heap.length;
  }

  push(key: number, value: T): void {
    this.heap.push({ key, value });
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): { key: number; value: T } | undefined {
    if (this.heap.length === 0) return undefined;
    const min = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.sinkDown(0);
    }
    return min;
  }

  private bubbleUp(idx: number): void {
    while (idx > 0) {
      const parent = (idx - 1) >> 1;
      if (this.heap[idx].key >= this.heap[parent].key) break;
      const tmp = this.heap[idx];
      this.heap[idx] = this.heap[parent];
      this.heap[parent] = tmp;
      idx = parent;
    }
  }

  private sinkDown(idx: number): void {
    const n = this.heap.length;
    while (true) {
      let smallest = idx;
      const left = (idx << 1) + 1;
      const right = left + 1;
      if (left < n && this.heap[left].key < this.heap[smallest].key) smallest = left;
      if (right < n && this.heap[right].key < this.heap[smallest].key) smallest = right;
      if (smallest === idx) break;
      const tmp = this.heap[idx];
      this.heap[idx] = this.heap[smallest];
      this.heap[smallest] = tmp;
      idx = smallest;
    }
  }
}

export interface SearchStepSnapshot {
  stepIndex: number;
  settledNodeId: string;
  gScore: number;
  fScore: number;
  visitedCount: number;
  heapSize: number;
  viaEdgeId: string | null;
}

export interface ShortestPathResult {
  status: 'found' | 'unreachable' | 'invalid_input';
  algorithm: 'dijkstra' | 'astar';
  costMode: CostMode;
  sourceNodeId: string;
  targetNodeId: string;
  pathNodeIds: string[];
  pathEdgeIds: string[];
  geometryCoordinates: Array<[number, number]>; // [lng, lat]
  roadNames: string[];
  totalCost: number;
  totalDistanceM: number;
  estimatedTravelTimeS: number;
  visitedNodesCount: number;
  relaxationsCount: number;
  runtimeMs: number;
  heapDeltaBytes: number;
  steps: SearchStepSnapshot[];
  stepsTruncated: boolean;
  errorReason: string | null;
  heuristicNote: string;
  complexity: {
    time: string;
    space: string;
  };
}

const MAX_STEPS = 80;

function reconstructPath(
  graph: GraphSnapshot,
  sourceNodeId: string,
  targetNodeId: string,
  prevNode: Map<string, string>,
  prevEdge: Map<string, DirectedEdgeEntry>
): {
  pathNodeIds: string[];
  pathEdgeIds: string[];
  geometryCoordinates: Array<[number, number]>;
  roadNames: string[];
  totalDistanceM: number;
  estimatedTravelTimeS: number;
} {
  const pathNodeIds: string[] = [];
  const pathEdges: DirectedEdgeEntry[] = [];

  let curr: string | undefined = targetNodeId;
  while (curr !== undefined) {
    pathNodeIds.push(curr);
    if (curr === sourceNodeId) break;
    const e = prevEdge.get(curr);
    if (!e) break;
    pathEdges.push(e);
    curr = prevNode.get(curr);
  }

  pathNodeIds.reverse();
  pathEdges.reverse();

  const geometryCoordinates: Array<[number, number]> = [];
  const roadNames: string[] = [];
  let totalDistanceM = 0;
  let estimatedTravelTimeS = 0;

  for (let i = 0; i < pathEdges.length; i++) {
    const edge = pathEdges[i];
    totalDistanceM += edge.lengthM;
    estimatedTravelTimeS += edge.effectiveTravelTimeS;
    if (roadNames.length === 0 || roadNames[roadNames.length - 1] !== edge.name) {
      roadNames.push(edge.name);
    }
    const coords = edge.coordinatesLngLat;
    for (let j = 0; j < coords.length; j++) {
      if (i > 0 && j === 0) continue; // avoid duplicate junction point
      geometryCoordinates.push(coords[j]);
    }
  }

  return {
    pathNodeIds,
    pathEdgeIds: pathEdges.map((e) => e.edgeId),
    geometryCoordinates,
    roadNames,
    totalDistanceM: Math.round(totalDistanceM * 10) / 10,
    estimatedTravelTimeS: Math.round(estimatedTravelTimeS * 10) / 10,
  };
}

/**
 * Custom Dijkstra's shortest-path algorithm from scratch.
 * Uses adjacency lists + BinaryMinHeap with lazy deletion (stale-entry skip).
 * Validates nonnegative edge weights and tracks exact edge IDs for parallel-edge correctness.
 *
 * Complexity: O((V + E) log V) worst-case time with binary heap (up to E entries in heap),
 * O(V + E) space for adjacency lists, distances, and heap entries.
 */
export function runDijkstra(
  graph: GraphSnapshot,
  sourceNodeId: string,
  targetNodeId: string,
  costMode: CostMode = 'travel_time_s',
  recordSteps = false
): ShortestPathResult {
  if (!graph.nodes.has(sourceNodeId) || !graph.nodes.has(targetNodeId)) {
    return {
      status: 'invalid_input',
      algorithm: 'dijkstra',
      costMode,
      sourceNodeId,
      targetNodeId,
      pathNodeIds: [],
      pathEdgeIds: [],
      geometryCoordinates: [],
      roadNames: [],
      totalCost: 0,
      totalDistanceM: 0,
      estimatedTravelTimeS: 0,
      visitedNodesCount: 0,
      relaxationsCount: 0,
      runtimeMs: 0,
      heapDeltaBytes: 0,
      steps: [],
      stepsTruncated: false,
      errorReason: 'Origin or destination node ID does not exist in active graph snapshot.',
      heuristicNote: 'Dijkstra uses zero heuristic (h(v) = 0).',
      complexity: { time: 'O((V + E) log V)', space: 'O(V + E)' },
    };
  }

  const memBefore = process.memoryUsage().heapUsed;
  const t0 = performance.now();

  const dist = new Map<string, number>();
  const prevNode = new Map<string, string>();
  const prevEdge = new Map<string, DirectedEdgeEntry>();
  const settled = new Set<string>();
  const heap = new BinaryMinHeap<string>();
  const steps: SearchStepSnapshot[] = [];
  let stepsTruncated = false;
  let relaxationsCount = 0;

  dist.set(sourceNodeId, 0);
  heap.push(0, sourceNodeId);

  while (heap.size > 0) {
    const top = heap.pop()!;
    const u = top.value;
    const d = top.key;

    // Stale heap entry check
    if (settled.has(u) || d > (dist.get(u) ?? Infinity)) {
      continue;
    }

    settled.add(u);

    if (recordSteps) {
      if (steps.length < MAX_STEPS) {
        steps.push({
          stepIndex: steps.length,
          settledNodeId: u,
          gScore: Math.round(d * 100) / 100,
          fScore: Math.round(d * 100) / 100,
          visitedCount: settled.size,
          heapSize: heap.size,
          viaEdgeId: prevEdge.get(u)?.edgeId ?? null,
        });
      } else {
        stepsTruncated = true;
      }
    }

    if (u === targetNodeId) {
      break;
    }

    const neighbors = graph.adjacency.get(u) ?? [];
    for (const edge of neighbors) {
      const w = getEdgeWeight(edge, costMode);
      if (w < 0) {
        throw new Error(`Negative edge weight encountered on ${edge.edgeId}: ${w}`);
      }
      const alt = d + w;
      const bestV = dist.get(edge.targetNodeId) ?? Infinity;
      if (alt < bestV) {
        dist.set(edge.targetNodeId, alt);
        prevNode.set(edge.targetNodeId, u);
        prevEdge.set(edge.targetNodeId, edge);
        heap.push(alt, edge.targetNodeId);
        relaxationsCount++;
      }
    }
  }

  const runtimeMs = Math.round((performance.now() - t0) * 1000) / 1000;
  const heapDeltaBytes = Math.max(0, process.memoryUsage().heapUsed - memBefore);

  if (!settled.has(targetNodeId)) {
    return {
      status: 'unreachable',
      algorithm: 'dijkstra',
      costMode,
      sourceNodeId,
      targetNodeId,
      pathNodeIds: [],
      pathEdgeIds: [],
      geometryCoordinates: [],
      roadNames: [],
      totalCost: 0,
      totalDistanceM: 0,
      estimatedTravelTimeS: 0,
      visitedNodesCount: settled.size,
      relaxationsCount,
      runtimeMs,
      heapDeltaBytes,
      steps,
      stepsTruncated,
      errorReason: `Destination ${targetNodeId} is unreachable from ${sourceNodeId} under current road closures and one-way restrictions.`,
      heuristicNote: 'Dijkstra explores uniformly by g(v) with h(v) = 0.',
      complexity: { time: 'O((V + E) log V)', space: 'O(V + E)' },
    };
  }

  const recon = reconstructPath(graph, sourceNodeId, targetNodeId, prevNode, prevEdge);
  const totalCost = Math.round((dist.get(targetNodeId) ?? 0) * 100) / 100;

  return {
    status: 'found',
    algorithm: 'dijkstra',
    costMode,
    sourceNodeId,
    targetNodeId,
    ...recon,
    totalCost,
    visitedNodesCount: settled.size,
    relaxationsCount,
    runtimeMs,
    heapDeltaBytes,
    steps,
    stepsTruncated,
    errorReason: null,
    heuristicNote: 'Dijkstra explores all directions radially by accumulated g(v); guaranteed optimal for nonnegative edge weights.',
    complexity: { time: 'O((V + E) log V)', space: 'O(V + E)' },
  };
}

/**
 * Custom A* shortest-path algorithm from scratch.
 * Uses an admissible and consistent heuristic h(u):
 * - distance_m mode: geodesic Haversine straight-line distance to target (m).
 * - travel_time_s mode: geodesic Haversine distance divided by global max edge speed (m/s).
 * By triangle inequality on a sphere and bounded max speed, h(u) <= true shortest remaining cost,
 * ensuring consistency and optimality identical to Dijkstra.
 */
export function runAStar(
  graph: GraphSnapshot,
  sourceNodeId: string,
  targetNodeId: string,
  costMode: CostMode = 'travel_time_s',
  recordSteps = false
): ShortestPathResult {
  const targetNode = graph.nodes.get(targetNodeId);
  if (!graph.nodes.has(sourceNodeId) || !targetNode) {
    return {
      status: 'invalid_input',
      algorithm: 'astar',
      costMode,
      sourceNodeId,
      targetNodeId,
      pathNodeIds: [],
      pathEdgeIds: [],
      geometryCoordinates: [],
      roadNames: [],
      totalCost: 0,
      totalDistanceM: 0,
      estimatedTravelTimeS: 0,
      visitedNodesCount: 0,
      relaxationsCount: 0,
      runtimeMs: 0,
      heapDeltaBytes: 0,
      steps: [],
      stepsTruncated: false,
      errorReason: 'Origin or destination node ID does not exist in active graph snapshot.',
      heuristicNote: 'Invalid input node.',
      complexity: { time: 'O((V + E) log V) worst-case', space: 'O(V + E)' },
    };
  }

  const heuristic = (nodeId: string): number => {
    const n = graph.nodes.get(nodeId);
    if (!n) return 0;
    const straightM = haversineMeters(n.lat, n.lng, targetNode.lat, targetNode.lng);
    if (costMode === 'distance_m') {
      return straightM;
    }
    return straightM / graph.maxSpeedMps;
  };

  const heuristicDesc =
    costMode === 'distance_m'
      ? 'Geodesic Haversine straight-line lower bound h(u) in meters (consistent & admissible).'
      : `Geodesic straight-line distance divided by global max road speed (${(graph.maxSpeedMps * 3.6).toFixed(0)} km/h) lower bound in seconds (consistent & admissible).`;

  const memBefore = process.memoryUsage().heapUsed;
  const t0 = performance.now();

  const gScore = new Map<string, number>();
  const prevNode = new Map<string, string>();
  const prevEdge = new Map<string, DirectedEdgeEntry>();
  const closed = new Set<string>();
  const openHeap = new BinaryMinHeap<string>();
  const steps: SearchStepSnapshot[] = [];
  let stepsTruncated = false;
  let relaxationsCount = 0;

  gScore.set(sourceNodeId, 0);
  openHeap.push(heuristic(sourceNodeId), sourceNodeId);

  while (openHeap.size > 0) {
    const top = openHeap.pop()!;
    const u = top.value;
    const fVal = top.key;

    if (closed.has(u)) continue;
    const gU = gScore.get(u) ?? Infinity;
    if (fVal > gU + heuristic(u) + 1e-6) continue;

    closed.add(u);

    if (recordSteps) {
      if (steps.length < MAX_STEPS) {
        steps.push({
          stepIndex: steps.length,
          settledNodeId: u,
          gScore: Math.round(gU * 100) / 100,
          fScore: Math.round(fVal * 100) / 100,
          visitedCount: closed.size,
          heapSize: openHeap.size,
          viaEdgeId: prevEdge.get(u)?.edgeId ?? null,
        });
      } else {
        stepsTruncated = true;
      }
    }

    if (u === targetNodeId) {
      break;
    }

    const neighbors = graph.adjacency.get(u) ?? [];
    for (const edge of neighbors) {
      const w = getEdgeWeight(edge, costMode);
      if (w < 0) {
        throw new Error(`Negative edge weight encountered on ${edge.edgeId}: ${w}`);
      }
      const tentativeG = gU + w;
      const currentBest = gScore.get(edge.targetNodeId) ?? Infinity;
      if (tentativeG < currentBest) {
        gScore.set(edge.targetNodeId, tentativeG);
        prevNode.set(edge.targetNodeId, u);
        prevEdge.set(edge.targetNodeId, edge);
        const fNext = tentativeG + heuristic(edge.targetNodeId);
        openHeap.push(fNext, edge.targetNodeId);
        relaxationsCount++;
      }
    }
  }

  const runtimeMs = Math.round((performance.now() - t0) * 1000) / 1000;
  const heapDeltaBytes = Math.max(0, process.memoryUsage().heapUsed - memBefore);

  if (!closed.has(targetNodeId)) {
    return {
      status: 'unreachable',
      algorithm: 'astar',
      costMode,
      sourceNodeId,
      targetNodeId,
      pathNodeIds: [],
      pathEdgeIds: [],
      geometryCoordinates: [],
      roadNames: [],
      totalCost: 0,
      totalDistanceM: 0,
      estimatedTravelTimeS: 0,
      visitedNodesCount: closed.size,
      relaxationsCount,
      runtimeMs,
      heapDeltaBytes,
      steps,
      stepsTruncated,
      errorReason: `Destination ${targetNodeId} is unreachable from ${sourceNodeId} under active scenario closures.`,
      heuristicNote: heuristicDesc,
      complexity: { time: 'O((V + E) log V) worst-case', space: 'O(V + E)' },
    };
  }

  const recon = reconstructPath(graph, sourceNodeId, targetNodeId, prevNode, prevEdge);
  const totalCost = Math.round((gScore.get(targetNodeId) ?? 0) * 100) / 100;

  return {
    status: 'found',
    algorithm: 'astar',
    costMode,
    sourceNodeId,
    targetNodeId,
    ...recon,
    totalCost,
    visitedNodesCount: closed.size,
    relaxationsCount,
    runtimeMs,
    heapDeltaBytes,
    steps,
    stepsTruncated,
    errorReason: null,
    heuristicNote: heuristicDesc,
    complexity: { time: 'O((V + E) log V) worst-case; prunes search space via f = g + h', space: 'O(V + E)' },
  };
}

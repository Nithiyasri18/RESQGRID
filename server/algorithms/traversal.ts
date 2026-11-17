import type { GraphSnapshot } from './graph.ts';

export interface TraversalStep {
  stepIndex: number;
  currentNodeId: string;
  frontierSize: number;
  visitedCount: number;
  discoveredEdgeId: string | null;
}

export interface TraversalResult {
  algorithm: 'bfs' | 'dfs';
  sourceNodeId: string;
  targetNodeId: string | null;
  reachableCount: number;
  totalNodes: number;
  targetReachable: boolean;
  hopDistanceToTarget: number | null;
  visitedOrder: string[];
  pathNodeIds: string[];
  pathEdgeIds: string[];
  steps: TraversalStep[];
  stepsTruncated: boolean;
  runtimeMs: number;
  complexity: {
    time: string;
    space: string;
    note: string;
  };
}

const MAX_RECORDED_STEPS = 80;

/**
 * Custom Breadth-First Search (BFS) on directed road graph G = (V, E).
 * Uses explicit head-pointer queue for O(1) dequeue and O(V + E) total complexity.
 * Intended strictly for unweighted reachability and hop-count connectivity, not weighted shortest paths.
 */
export function runBFS(
  graph: GraphSnapshot,
  sourceNodeId: string,
  targetNodeId: string | null = null,
  recordSteps = true
): TraversalResult {
  const t0 = performance.now();

  const visited = new Set<string>();
  const parentNode = new Map<string, string>();
  const parentEdge = new Map<string, string>();
  const hopDist = new Map<string, number>();
  const visitedOrder: string[] = [];
  const steps: TraversalStep[] = [];
  let stepsTruncated = false;

  if (!graph.nodes.has(sourceNodeId)) {
    return {
      algorithm: 'bfs',
      sourceNodeId,
      targetNodeId,
      reachableCount: 0,
      totalNodes: graph.nodes.size,
      targetReachable: false,
      hopDistanceToTarget: null,
      visitedOrder: [],
      pathNodeIds: [],
      pathEdgeIds: [],
      steps: [],
      stepsTruncated: false,
      runtimeMs: Math.round((performance.now() - t0) * 1000) / 1000,
      complexity: {
        time: 'O(V + E)',
        space: 'O(V)',
        note: 'Queue-based unweighted reachability traversal',
      },
    };
  }

  const queue: string[] = [sourceNodeId];
  let head = 0;
  visited.add(sourceNodeId);
  hopDist.set(sourceNodeId, 0);

  while (head < queue.length) {
    const u = queue[head++];
    visitedOrder.push(u);

    if (recordSteps) {
      if (steps.length < MAX_RECORDED_STEPS) {
        steps.push({
          stepIndex: steps.length,
          currentNodeId: u,
          frontierSize: queue.length - head,
          visitedCount: visited.size,
          discoveredEdgeId: parentEdge.get(u) ?? null,
        });
      } else {
        stepsTruncated = true;
      }
    }

    const neighbors = graph.adjacency.get(u) ?? [];
    for (const edge of neighbors) {
      const v = edge.targetNodeId;
      if (!visited.has(v)) {
        visited.add(v);
        parentNode.set(v, u);
        parentEdge.set(v, edge.edgeId);
        hopDist.set(v, (hopDist.get(u) ?? 0) + 1);
        queue.push(v);
      }
    }
  }

  const targetReachable = targetNodeId ? visited.has(targetNodeId) : false;
  const pathNodeIds: string[] = [];
  const pathEdgeIds: string[] = [];
  if (targetNodeId && targetReachable) {
    let curr: string | undefined = targetNodeId;
    while (curr) {
      pathNodeIds.push(curr);
      const pe = parentEdge.get(curr);
      if (pe) pathEdgeIds.push(pe);
      curr = parentNode.get(curr);
    }
    pathNodeIds.reverse();
    pathEdgeIds.reverse();
  }

  const runtimeMs = Math.round((performance.now() - t0) * 1000) / 1000;
  return {
    algorithm: 'bfs',
    sourceNodeId,
    targetNodeId,
    reachableCount: visited.size,
    totalNodes: graph.nodes.size,
    targetReachable,
    hopDistanceToTarget: targetNodeId && targetReachable ? (hopDist.get(targetNodeId) ?? null) : null,
    visitedOrder,
    pathNodeIds,
    pathEdgeIds,
    steps,
    stepsTruncated,
    runtimeMs,
    complexity: {
      time: 'O(V + E)',
      space: 'O(V)',
      note: 'FIFO queue traversal; finds minimum-hop path, not minimum-distance or travel-time path.',
    },
  };
}

/**
 * Custom iterative Depth-First Search (DFS) on directed road graph G = (V, E).
 * Uses an explicit stack (avoiding recursion limit issues) in O(V + E) time.
 */
export function runDFS(
  graph: GraphSnapshot,
  sourceNodeId: string,
  targetNodeId: string | null = null,
  recordSteps = true
): TraversalResult {
  const t0 = performance.now();

  const visited = new Set<string>();
  const parentNode = new Map<string, string>();
  const parentEdge = new Map<string, string>();
  const visitedOrder: string[] = [];
  const steps: TraversalStep[] = [];
  let stepsTruncated = false;

  if (!graph.nodes.has(sourceNodeId)) {
    return {
      algorithm: 'dfs',
      sourceNodeId,
      targetNodeId,
      reachableCount: 0,
      totalNodes: graph.nodes.size,
      targetReachable: false,
      hopDistanceToTarget: null,
      visitedOrder: [],
      pathNodeIds: [],
      pathEdgeIds: [],
      steps: [],
      stepsTruncated: false,
      runtimeMs: Math.round((performance.now() - t0) * 1000) / 1000,
      complexity: {
        time: 'O(V + E)',
        space: 'O(V)',
        note: 'Explicit stack-based DFS traversal',
      },
    };
  }

  const stack: Array<{ nodeId: string; fromNode?: string; viaEdge?: string }> = [
    { nodeId: sourceNodeId },
  ];

  while (stack.length > 0) {
    const item = stack.pop()!;
    const u = item.nodeId;
    if (visited.has(u)) continue;

    visited.add(u);
    if (item.fromNode && item.viaEdge) {
      parentNode.set(u, item.fromNode);
      parentEdge.set(u, item.viaEdge);
    }
    visitedOrder.push(u);

    if (recordSteps) {
      if (steps.length < MAX_RECORDED_STEPS) {
        steps.push({
          stepIndex: steps.length,
          currentNodeId: u,
          frontierSize: stack.length,
          visitedCount: visited.size,
          discoveredEdgeId: item.viaEdge ?? null,
        });
      } else {
        stepsTruncated = true;
      }
    }

    const neighbors = graph.adjacency.get(u) ?? [];
    for (let i = neighbors.length - 1; i >= 0; i--) {
      const edge = neighbors[i];
      if (!visited.has(edge.targetNodeId)) {
        stack.push({ nodeId: edge.targetNodeId, fromNode: u, viaEdge: edge.edgeId });
      }
    }
  }

  const targetReachable = targetNodeId ? visited.has(targetNodeId) : false;
  const pathNodeIds: string[] = [];
  const pathEdgeIds: string[] = [];
  if (targetNodeId && targetReachable) {
    let curr: string | undefined = targetNodeId;
    while (curr) {
      pathNodeIds.push(curr);
      const pe = parentEdge.get(curr);
      if (pe) pathEdgeIds.push(pe);
      curr = parentNode.get(curr);
    }
    pathNodeIds.reverse();
    pathEdgeIds.reverse();
  }

  const runtimeMs = Math.round((performance.now() - t0) * 1000) / 1000;
  return {
    algorithm: 'dfs',
    sourceNodeId,
    targetNodeId,
    reachableCount: visited.size,
    totalNodes: graph.nodes.size,
    targetReachable,
    hopDistanceToTarget: targetNodeId && targetReachable ? pathEdgeIds.length : null,
    visitedOrder,
    pathNodeIds,
    pathEdgeIds,
    steps,
    stepsTruncated,
    runtimeMs,
    complexity: {
      time: 'O(V + E)',
      space: 'O(V)',
      note: 'LIFO stack traversal for connected component & reachability exploration.',
    },
  };
}

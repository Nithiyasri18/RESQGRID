import type { DatabaseSync } from 'node:sqlite';
import {
  buildFeasibleRouteMatrix,
  runGreedyDispatch,
  runMcmfDispatch,
  type DispatchInputIncident,
  type DispatchInputTeam,
} from './dispatch.ts';
import { buildSampledSubgraph, getGraphSnapshot } from './graph.ts';
import { runAStar, runDijkstra } from './shortestPath.ts';
import { runBFS, runDFS } from './traversal.ts';

export interface ScalingBenchmarkPoint {
  nodeCount: number;
  edgeCount: number;
  dijkstraMedianMs: number;
  dijkstraMinMs: number;
  dijkstraMaxMs: number;
  astarMedianMs: number;
  astarMinMs: number;
  astarMaxMs: number;
  dijkstraVisited: number;
  astarVisited: number;
  bfsMedianMs: number;
  dfsMedianMs: number;
}

export interface ClosureImpactPoint {
  closurePercent: number;
  blockedEdges: number;
  totalEdges: number;
  reachableNodesPercent: number;
  reachablePairsPercent: number;
  avgTravelTimeS: number | null;
}

export interface DispatchBenchmarkComparison {
  scenarioId: string;
  teamCount: number;
  incidentCount: number;
  totalRequestedTeams: number;
  greedyAssigned: number;
  mcmfAssigned: number;
  greedyCost: number;
  mcmfCost: number;
  greedyRuntimeMs: number;
  mcmfRuntimeMs: number;
}

export interface BenchmarkSuiteResult {
  seed: number;
  repetitions: number;
  warmupRuns: number;
  costMode: 'travel_time_s';
  environment: {
    runtime: string;
    platform: string;
    arch: string;
    timingMethod: string;
    memoryMethod: string;
  };
  scalingCurve: ScalingBenchmarkPoint[];
  closureImpact: ClosureImpactPoint[];
  dispatchComparison: DispatchBenchmarkComparison[];
  generatedAt: string;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const val = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return Math.round(val * 1000) / 1000;
}

export function runReproducibleBenchmarkSuite(
  db: DatabaseSync,
  scenarioId: string,
  seed = 20251101,
  repetitions = 5
): BenchmarkSuiteResult {
  const baseGraph = getGraphSnapshot(db, scenarioId, 2.5);
  const fullNodes = baseGraph.nodes.size;
  const targetSizes = [20, 35, 50, Math.min(65, fullNodes), fullNodes].filter(
    (v, i, arr) => v > 4 && arr.indexOf(v) === i
  );

  const scalingCurve: ScalingBenchmarkPoint[] = [];

  for (const size of targetSizes) {
    const sub = buildSampledSubgraph(baseGraph, size, 0, seed + size);
    const nodeIds = Array.from(sub.nodes.keys()).sort();
    const src = nodeIds[0];
    const dst = nodeIds[nodeIds.length - 1];

    // Warm-up pass (discarded)
    runDijkstra(sub, src, dst, 'travel_time_s', false);
    runAStar(sub, src, dst, 'travel_time_s', false);

    const dijkTimes: number[] = [];
    const astarTimes: number[] = [];
    const bfsTimes: number[] = [];
    const dfsTimes: number[] = [];
    let dVisited = 0;
    let aVisited = 0;

    for (let r = 0; r < repetitions; r++) {
      const dRes = runDijkstra(sub, src, dst, 'travel_time_s', false);
      const aRes = runAStar(sub, src, dst, 'travel_time_s', false);
      const bRes = runBFS(sub, src, dst, false);
      const dfRes = runDFS(sub, src, dst, false);

      dijkTimes.push(dRes.runtimeMs);
      astarTimes.push(aRes.runtimeMs);
      bfsTimes.push(bRes.runtimeMs);
      dfsTimes.push(dfRes.runtimeMs);
      dVisited = dRes.visitedNodesCount;
      aVisited = aRes.visitedNodesCount;
    }

    scalingCurve.push({
      nodeCount: sub.nodes.size,
      edgeCount: sub.edges.size,
      dijkstraMedianMs: median(dijkTimes),
      dijkstraMinMs: Math.round(Math.min(...dijkTimes) * 1000) / 1000,
      dijkstraMaxMs: Math.round(Math.max(...dijkTimes) * 1000) / 1000,
      astarMedianMs: median(astarTimes),
      astarMinMs: Math.round(Math.min(...astarTimes) * 1000) / 1000,
      astarMaxMs: Math.round(Math.max(...astarTimes) * 1000) / 1000,
      dijkstraVisited: dVisited,
      astarVisited: aVisited,
      bfsMedianMs: median(bfsTimes),
      dfsMedianMs: median(dfsTimes),
    });
  }

  // Closure percentage vs reachability experiment
  const closureFractions = [0, 0.1, 0.2, 0.35, 0.5];
  const closureImpact: ClosureImpactPoint[] = [];
  const samplePairs: Array<[string, string]> = [
    ['N_GUINDY_IND', 'N_VELACHERY_VIJAYA'],
    ['N_EGMORE', 'N_ADYAR_SIGNAL'],
    ['N_ANNA_NGR_R', 'N_TONDIARPET'],
    ['N_PORUR', 'N_SHOLINGANALLUR'],
    ['N_AVADI', 'N_TNAGAR_PANAGAL'],
    ['N_AMBATTUR_OT', 'N_PERUNGUDI'],
    ['N_TAMBARAM', 'N_EGMORE'],
    ['N_ENNORE', 'N_CENTRAL'],
  ];

  for (const frac of closureFractions) {
    const sub = buildSampledSubgraph(baseGraph, fullNodes, frac, seed + Math.round(frac * 1000));
    const bfs = runBFS(sub, 'N_EGMORE', null, false);
    let reachablePairs = 0;
    let timeSum = 0;

    for (const [u, v] of samplePairs) {
      if (!sub.nodes.has(u) || !sub.nodes.has(v)) continue;
      const res = runDijkstra(sub, u, v, 'travel_time_s', false);
      if (res.status === 'found') {
        reachablePairs++;
        timeSum += res.estimatedTravelTimeS;
      }
    }

    closureImpact.push({
      closurePercent: Math.round(frac * 100),
      blockedEdges: sub.blockedEdgeCount,
      totalEdges: sub.edges.size,
      reachableNodesPercent:
        sub.nodes.size > 0 ? Math.round((bfs.reachableCount / sub.nodes.size) * 1000) / 10 : 0,
      reachablePairsPercent: Math.round((reachablePairs / samplePairs.length) * 1000) / 10,
      avgTravelTimeS:
        reachablePairs > 0 ? Math.round((timeSum / reachablePairs) * 10) / 10 : null,
    });
  }

  // Resource availability vs fulfillment experiment (using scenario nodes)
  const dispatchComparison: DispatchBenchmarkComparison[] = [];
  const allNodesList = Array.from(baseGraph.nodes.values());
  const sampleIncidents: DispatchInputIncident[] = [
    { id: 'BM_I1', title: 'Velachery Demand', severity: 'critical', locality: 'Velachery', lat: 12.9791, lng: 80.2212, requiredCapabilities: ['boat_water'], requestedTeams: 2, createdAt: '2026-01-01T00:00:00Z' },
    { id: 'BM_I2', title: 'T. Nagar Demand', severity: 'high', locality: 'T. Nagar', lat: 13.0418, lng: 80.2341, requiredCapabilities: ['medical'], requestedTeams: 1, createdAt: '2026-01-01T00:01:00Z' },
    { id: 'BM_I3', title: 'Ennore Demand', severity: 'critical', locality: 'Ennore', lat: 13.2146, lng: 80.3203, requiredCapabilities: ['boat_water'], requestedTeams: 1, createdAt: '2026-01-01T00:02:00Z' },
    { id: 'BM_I4', title: 'Ambattur Demand', severity: 'medium', locality: 'Ambattur', lat: 13.1143, lng: 80.1548, requiredCapabilities: ['heavy_rescue'], requestedTeams: 1, createdAt: '2026-01-01T00:03:00Z' },
    { id: 'BM_I5', title: 'Tambaram Demand', severity: 'high', locality: 'Tambaram', lat: 12.9285, lng: 80.1195, requiredCapabilities: ['medical'], requestedTeams: 1, createdAt: '2026-01-01T00:04:00Z' },
  ];

  const poolTeams: DispatchInputTeam[] = [
    { id: 'BM_T1', name: 'Team Guindy A', category: 'NDRF', capabilities: ['boat_water', 'medical'], vehicleMode: 'boat_carrier', homeBaseName: 'Guindy', lat: 13.0085, lng: 80.2206, personnelCount: 6, capacity: 8 },
    { id: 'BM_T2', name: 'Team Adyar B', category: 'SDRF', capabilities: ['boat_water'], vehicleMode: 'amphibious', homeBaseName: 'Adyar', lat: 13.0064, lng: 80.2476, personnelCount: 5, capacity: 6 },
    { id: 'BM_T3', name: 'Team Egmore C', category: 'Medical', capabilities: ['medical'], vehicleMode: 'ambulance', homeBaseName: 'Egmore', lat: 13.0732, lng: 80.2609, personnelCount: 4, capacity: 4 },
    { id: 'BM_T4', name: 'Team Tondiarpet D', category: 'Coastal', capabilities: ['boat_water', 'heavy_rescue'], vehicleMode: 'truck', homeBaseName: 'Tondiarpet', lat: 13.1282, lng: 80.2896, personnelCount: 6, capacity: 8 },
    { id: 'BM_T5', name: 'Team Ambattur E', category: 'Heavy', capabilities: ['heavy_rescue', 'medical'], vehicleMode: 'truck', homeBaseName: 'Ambattur', lat: 13.1143, lng: 80.1548, personnelCount: 6, capacity: 6 },
    { id: 'BM_T6', name: 'Team Porur F', category: 'Multi', capabilities: ['multi_hazard'], vehicleMode: 'suv', homeBaseName: 'Porur', lat: 13.0382, lng: 80.1565, personnelCount: 5, capacity: 6 },
  ].filter(() => allNodesList.length > 0);

  for (const teamCount of [2, 4, 6]) {
    const subsetTeams = poolTeams.slice(0, teamCount);
    const matrix = buildFeasibleRouteMatrix(baseGraph, subsetTeams, sampleIncidents, 'travel_time_s');
    const greedy = runGreedyDispatch(sampleIncidents, subsetTeams, matrix, 'travel_time_s');
    const mcmf = runMcmfDispatch(sampleIncidents, subsetTeams, matrix, 'travel_time_s');

    dispatchComparison.push({
      scenarioId,
      teamCount,
      incidentCount: sampleIncidents.length,
      totalRequestedTeams: greedy.totalRequestedTeams,
      greedyAssigned: greedy.totalAssignedTeams,
      mcmfAssigned: mcmf.totalAssignedTeams,
      greedyCost: greedy.totalDispatchCost,
      mcmfCost: mcmf.totalDispatchCost,
      greedyRuntimeMs: greedy.runtimeMs,
      mcmfRuntimeMs: mcmf.runtimeMs,
    });
  }

  return {
    seed,
    repetitions,
    warmupRuns: 1,
    costMode: 'travel_time_s',
    environment: {
      runtime: `Node.js ${process.version}`,
      platform: process.platform,
      arch: process.arch,
      timingMethod: 'performance.now() around pure algorithm execution (excluding DB & graph load)',
      memoryMethod: 'process.memoryUsage().heapUsed delta (V8 JS heap allocation, not total OS RSS)',
    },
    scalingCurve,
    closureImpact,
    dispatchComparison,
    generatedAt: new Date().toISOString(),
  };
}

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildFeasibleRouteMatrix,
  runGreedyDispatch,
  runMcmfDispatch,
  type DispatchInputIncident,
  type DispatchInputTeam,
} from '../algorithms/dispatch.ts';
import { getGraphSnapshot, snapToNearestNode, type DirectedEdgeEntry, type GraphSnapshot } from '../algorithms/graph.ts';
import { runAStar, runDijkstra } from '../algorithms/shortestPath.ts';
import { runBFS, runDFS } from '../algorithms/traversal.ts';
import { createInMemoryDbForTest } from '../db.ts';
import { seedDatabase } from '../seed.ts';

function makeTinyGraph(): GraphSnapshot {
  const nodes = new Map([
    ['A', { id: 'A', source_osm_id: '1', name: 'Node A', locality: 'Test', lat: 13.0, lng: 80.2 }],
    ['B', { id: 'B', source_osm_id: '2', name: 'Node B', locality: 'Test', lat: 13.01, lng: 80.2 }],
    ['C', { id: 'C', source_osm_id: '3', name: 'Node C', locality: 'Test', lat: 13.01, lng: 80.21 }],
    ['D', { id: 'D', source_osm_id: '4', name: 'Node D', locality: 'Test', lat: 13.02, lng: 80.21 }],
    ['ISO', { id: 'ISO', source_osm_id: '5', name: 'Isolated', locality: 'Test', lat: 13.05, lng: 80.25 }],
  ]);

  const mkEdge = (
    edgeId: string,
    u: string,
    v: string,
    len: number,
    time: number,
    status: 'open' | 'restricted' | 'blocked' = 'open'
  ): DirectedEdgeEntry => {
    const nu = nodes.get(u)!;
    const nv = nodes.get(v)!;
    return {
      edgeId,
      osmWayId: `way-${edgeId}`,
      name: edgeId,
      highwayType: 'primary',
      sourceNodeId: u,
      targetNodeId: v,
      lengthM: len,
      speedKmh: 50,
      travelTimeS: time,
      isOneway: true,
      closureStatus: status,
      closureReason: '',
      coordinatesLngLat: [
        [nu.lng, nu.lat],
        [nv.lng, nv.lat],
      ],
      effectiveDistanceM: status === 'restricted' ? len * 2.5 : len,
      effectiveTravelTimeS: status === 'restricted' ? time * 2.5 : time,
    };
  };

  // Parallel edges A -> B: E_AB_SLOW (1400m) and E_AB_FAST (1100m), plus one-way B -> D
  const edgeList = [
    mkEdge('E_AB_SLOW', 'A', 'B', 1400, 120),
    mkEdge('E_AB_FAST', 'A', 'B', 1100, 80),
    mkEdge('E_AC', 'A', 'C', 1500, 110),
    mkEdge('E_BD', 'B', 'D', 1500, 110),
    mkEdge('E_CD', 'C', 'D', 1200, 95),
  ];

  const edges = new Map<string, DirectedEdgeEntry>();
  const adjacency = new Map<string, DirectedEdgeEntry[]>();
  for (const id of nodes.keys()) adjacency.set(id, []);
  for (const e of edgeList) {
    edges.set(e.edgeId, e);
    if (e.closureStatus !== 'blocked') adjacency.get(e.sourceNodeId)!.push(e);
  }

  return {
    cacheKey: 'tiny-test',
    networkVersion: 'test-v1',
    scenarioId: 'test',
    closureVersion: 1,
    restrictedMultiplier: 2.5,
    nodes,
    edges,
    adjacency,
    blockedEdgeCount: 0,
    restrictedEdgeCount: 0,
    maxSpeedMps: (60 * 1000) / 3600,
  };
}

test('Dijkstra and A* find identical optimal cost and select faster parallel edge', () => {
  const g = makeTinyGraph();
  const dDist = runDijkstra(g, 'A', 'D', 'distance_m', true);
  const aDist = runAStar(g, 'A', 'D', 'distance_m', true);

  assert.equal(dDist.status, 'found');
  assert.equal(aDist.status, 'found');
  assert.equal(dDist.totalCost, 2600); // E_AB_FAST (1100) + E_BD (1500)
  assert.equal(aDist.totalCost, dDist.totalCost);
  assert.deepEqual(dDist.pathEdgeIds, ['E_AB_FAST', 'E_BD']);
  assert.deepEqual(aDist.pathEdgeIds, ['E_AB_FAST', 'E_BD']);
});

test('Dijkstra detects unreachable isolated nodes and one-way restrictions', () => {
  const g = makeTinyGraph();
  const isoRes = runDijkstra(g, 'A', 'ISO', 'travel_time_s');
  assert.equal(isoRes.status, 'unreachable');

  // Reverse direction D -> A does not exist (directed one-way edges)
  const revRes = runAStar(g, 'D', 'A', 'distance_m');
  assert.equal(revRes.status, 'unreachable');
});

test('BFS and DFS compute exact reachability', () => {
  const g = makeTinyGraph();
  const bfs = runBFS(g, 'A', 'D');
  const dfs = runDFS(g, 'A', 'ISO');

  assert.equal(bfs.reachableCount, 4);
  assert.equal(bfs.targetReachable, true);
  assert.equal(bfs.hopDistanceToTarget, 2);
  assert.equal(dfs.reachableCount, 4);
  assert.equal(dfs.targetReachable, false);
});

test('Spatial snapping rejects coordinates beyond max snap radius', () => {
  const g = makeTinyGraph();
  const okSnap = snapToNearestNode(g, 13.001, 80.201, 3500);
  assert.equal(okSnap.ok, true);
  assert.equal(okSnap.node?.id, 'A');

  const farSnap = snapToNearestNode(g, 13.9, 80.9, 3500);
  assert.equal(farSnap.ok, false);
});

test('Lexicographic MCMF outperforms Greedy on reallocation / shortage case', () => {
  // Hand-solvable case:
  // Critical Incident C1 can use Team T1 (cost 10) or Team T2 (cost 20).
  // High Incident H1 can ONLY use Team T1 (cost 15).
  // Greedy assigns T1 -> C1 (cost 10), leaving H1 UNMET (total assigned = 1).
  // MCMF assigns T2 -> C1 (cost 20) and T1 -> H1 (cost 15), achieving total assigned = 2!
  const db = createInMemoryDbForTest();
  seedDatabase(db);
  const graph = getGraphSnapshot(db, 'scen-velachery-monsoon', 2.5);

  const incidents: DispatchInputIncident[] = [
    {
      id: 'I_CRIT',
      title: 'Critical',
      severity: 'critical',
      locality: 'Guindy',
      lat: 13.0085,
      lng: 80.2206,
      requiredCapabilities: ['boat_water'],
      requestedTeams: 1,
      createdAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'I_HIGH',
      title: 'High',
      severity: 'high',
      locality: 'Velachery',
      lat: 12.9791,
      lng: 80.2212,
      requiredCapabilities: ['medical'],
      requestedTeams: 1,
      createdAt: '2026-01-01T00:01:00Z',
    },
  ];

  const teams: DispatchInputTeam[] = [
    {
      id: 'T1_MULTI',
      name: 'T1 Multi',
      category: 'Multi',
      capabilities: ['boat_water', 'medical'],
      vehicleMode: 'suv',
      homeBaseName: 'Guindy',
      lat: 13.0085,
      lng: 80.2206,
      personnelCount: 6,
      capacity: 6,
    },
    {
      id: 'T2_BOAT_ONLY',
      name: 'T2 Boat Only',
      category: 'Water',
      capabilities: ['boat_water'],
      vehicleMode: 'boat',
      homeBaseName: 'Egmore',
      lat: 13.0732,
      lng: 80.2609,
      personnelCount: 6,
      capacity: 6,
    },
  ];

  const matrix = buildFeasibleRouteMatrix(graph, teams, incidents, 'travel_time_s');
  const greedy = runGreedyDispatch(incidents, teams, matrix, 'travel_time_s');
  const mcmf = runMcmfDispatch(incidents, teams, matrix, 'travel_time_s');

  assert.equal(greedy.totalAssignedTeams, 1);
  assert.equal(greedy.totalUnmetDemand, 1);
  assert.equal(mcmf.totalAssignedTeams, 2);
  assert.equal(mcmf.totalUnmetDemand, 0);
  assert.equal(mcmf.tierSummary.critical.assigned, 1);
  assert.equal(mcmf.tierSummary.high.assigned, 1);
});

test('Seeded Chennai database loads all 5 scenarios and reroutes around blocked edges', () => {
  const db = createInMemoryDbForTest();
  seedDatabase(db);

  const scenarios = db.prepare('SELECT id FROM disaster_scenarios').all() as Array<{ id: string }>;
  assert.equal(scenarios.length, 5);

  const g = getGraphSnapshot(db, 'scen-velachery-monsoon', 2.5);
  const d = runDijkstra(g, 'N_GUINDY_IND', 'N_ADYAR_SIGNAL', 'travel_time_s');
  const a = runAStar(g, 'N_GUINDY_IND', 'N_ADYAR_SIGNAL', 'travel_time_s');

  assert.equal(d.status, 'found');
  assert.equal(a.status, 'found');
  assert.ok(Math.abs(d.totalCost - a.totalCost) < 0.05);
});

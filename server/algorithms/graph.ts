import type { DatabaseSync } from 'node:sqlite';
import { GRAPH_NETWORK_VERSION, haversineMeters } from '../chennaiNetwork.ts';
import type { CostMode, RoadClosureStatus, RoadEdge, RoadNode } from '../types.ts';

export interface DirectedEdgeEntry {
  edgeId: string;
  osmWayId: string;
  name: string;
  highwayType: string;
  sourceNodeId: string;
  targetNodeId: string;
  lengthM: number;
  speedKmh: number;
  travelTimeS: number;
  isOneway: boolean;
  closureStatus: RoadClosureStatus;
  closureReason: string;
  coordinatesLngLat: Array<[number, number]>;
  effectiveDistanceM: number;
  effectiveTravelTimeS: number;
}

export interface GraphSnapshot {
  cacheKey: string;
  networkVersion: string;
  scenarioId: string;
  closureVersion: number;
  restrictedMultiplier: number;
  nodes: Map<string, RoadNode>;
  edges: Map<string, DirectedEdgeEntry>;
  adjacency: Map<string, DirectedEdgeEntry[]>;
  blockedEdgeCount: number;
  restrictedEdgeCount: number;
  maxSpeedMps: number;
}

const snapshotCache = new Map<string, GraphSnapshot>();

export function invalidateGraphCache(scenarioId?: string): void {
  if (!scenarioId) {
    snapshotCache.clear();
    return;
  }
  for (const key of snapshotCache.keys()) {
    if (key.includes(`::${scenarioId}::`)) {
      snapshotCache.delete(key);
    }
  }
}

export function getGraphSnapshot(
  db: DatabaseSync,
  scenarioId: string,
  restrictedMultiplier = 2.5
): GraphSnapshot {
  const scenarioRow = db
    .prepare('SELECT id, closure_version FROM disaster_scenarios WHERE id = ?')
    .get(scenarioId) as { id: string; closure_version: number } | undefined;

  const closureVersion = scenarioRow?.closure_version ?? 1;
  const mult = Math.max(1.0, restrictedMultiplier);
  const cacheKey = `${GRAPH_NETWORK_VERSION}::${scenarioId}::v${closureVersion}::m${mult.toFixed(2)}`;

  const existing = snapshotCache.get(cacheKey);
  if (existing) {
    return existing;
  }

  const nodeRows = db.prepare('SELECT * FROM road_nodes').all() as unknown as RoadNode[];
  const edgeRows = db.prepare('SELECT * FROM road_edges').all() as unknown as RoadEdge[];
  const closureRows = db
    .prepare('SELECT road_edge_id, override_status, reason FROM scenario_road_closures WHERE scenario_id = ?')
    .all(scenarioId) as Array<{ road_edge_id: string; override_status: RoadClosureStatus; reason: string }>;

  const closureMap = new Map<string, { status: RoadClosureStatus; reason: string }>();
  for (const c of closureRows) {
    closureMap.set(c.road_edge_id, { status: c.override_status, reason: c.reason });
  }

  const nodes = new Map<string, RoadNode>();
  for (const n of nodeRows) {
    nodes.set(n.id, n);
  }

  const edges = new Map<string, DirectedEdgeEntry>();
  const adjacency = new Map<string, DirectedEdgeEntry[]>();
  for (const n of nodeRows) {
    adjacency.set(n.id, []);
  }

  let blockedEdgeCount = 0;
  let restrictedEdgeCount = 0;
  let maxSpeedKmh = 60;

  for (const e of edgeRows) {
    const closure = closureMap.get(e.id);
    const closureStatus: RoadClosureStatus = closure?.status ?? 'open';
    const closureReason = closure?.reason ?? '';
    if (closureStatus === 'blocked') blockedEdgeCount++;
    if (closureStatus === 'restricted') restrictedEdgeCount++;
    if (e.speed_kmh > maxSpeedKmh) maxSpeedKmh = e.speed_kmh;

    const factor = closureStatus === 'restricted' ? mult : 1.0;
    const entry: DirectedEdgeEntry = {
      edgeId: e.id,
      osmWayId: e.osm_way_id,
      name: e.name,
      highwayType: e.highway_type,
      sourceNodeId: e.source_node_id,
      targetNodeId: e.target_node_id,
      lengthM: e.length_m,
      speedKmh: e.speed_kmh,
      travelTimeS: e.travel_time_s,
      isOneway: e.is_oneway === 1,
      closureStatus,
      closureReason,
      coordinatesLngLat: JSON.parse(e.geometry_json) as Array<[number, number]>,
      effectiveDistanceM: Math.round(e.length_m * factor * 10) / 10,
      effectiveTravelTimeS: Math.round(e.travel_time_s * factor * 10) / 10,
    };

    edges.set(entry.edgeId, entry);

    // Only open and restricted edges are traversable in the routing graph
    if (closureStatus !== 'blocked') {
      const list = adjacency.get(entry.sourceNodeId);
      if (list) {
        list.push(entry);
      }
    }
  }

  const snapshot: GraphSnapshot = {
    cacheKey,
    networkVersion: GRAPH_NETWORK_VERSION,
    scenarioId,
    closureVersion,
    restrictedMultiplier: mult,
    nodes,
    edges,
    adjacency,
    blockedEdgeCount,
    restrictedEdgeCount,
    maxSpeedMps: (maxSpeedKmh * 1000) / 3600,
  };

  if (snapshotCache.size > 24) {
    const oldestKey = snapshotCache.keys().next().value;
    if (oldestKey) snapshotCache.delete(oldestKey);
  }
  snapshotCache.set(cacheKey, snapshot);
  return snapshot;
}

export function getEdgeWeight(edge: DirectedEdgeEntry, costMode: CostMode): number {
  return costMode === 'distance_m' ? edge.effectiveDistanceM : edge.effectiveTravelTimeS;
}

export interface SnapResult {
  ok: boolean;
  node?: RoadNode;
  snapDistanceMeters: number;
  error?: string;
}

export function snapToNearestNode(
  snapshot: GraphSnapshot,
  lat: number,
  lng: number,
  maxDistanceMeters = 3500
): SnapResult {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return {
      ok: false,
      snapDistanceMeters: Infinity,
      error: 'Coordinates out of valid geographic bounds.',
    };
  }

  let bestNode: RoadNode | undefined;
  let bestDist = Infinity;

  for (const node of snapshot.nodes.values()) {
    const d = haversineMeters(lat, lng, node.lat, node.lng);
    if (d < bestDist) {
      bestDist = d;
      bestNode = node;
    }
  }

  if (!bestNode || bestDist > maxDistanceMeters) {
    return {
      ok: false,
      snapDistanceMeters: Math.round(bestDist),
      error: `Coordinates (${lat.toFixed(4)}, ${lng.toFixed(4)}) are ${Math.round(bestDist)}m from nearest road intersection, exceeding bounded snap radius (${maxDistanceMeters}m).`,
    };
  }

  return {
    ok: true,
    node: bestNode,
    snapDistanceMeters: Math.round(bestDist * 10) / 10,
  };
}

/**
 * Builds an induced subgraph of size `targetNodeCount` via deterministic BFS expansion
 * from a seed node, optionally blocking `closureFraction` of edges deterministically.
 */
export function buildSampledSubgraph(
  base: GraphSnapshot,
  targetNodeCount: number,
  closureFraction: number,
  seed: number
): GraphSnapshot {
  const allNodeIds = Array.from(base.nodes.keys()).sort();
  if (allNodeIds.length === 0) return base;

  // Deterministic PRNG (Mulberry32)
  let s = seed >>> 0;
  const rand = () => {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const startId = allNodeIds.includes('N_GUINDY_IND') ? 'N_GUINDY_IND' : allNodeIds[0];
  const selectedIds = new Set<string>([startId]);
  const queue: string[] = [startId];

  while (queue.length > 0 && selectedIds.size < targetNodeCount) {
    const curr = queue.shift()!;
    const out = base.adjacency.get(curr) ?? [];
    for (const edge of out) {
      if (!selectedIds.has(edge.targetNodeId)) {
        selectedIds.add(edge.targetNodeId);
        queue.push(edge.targetNodeId);
        if (selectedIds.size >= targetNodeCount) break;
      }
    }
  }

  // Fill remaining if disconnected
  for (const id of allNodeIds) {
    if (selectedIds.size >= targetNodeCount) break;
    selectedIds.add(id);
  }

  const nodes = new Map<string, RoadNode>();
  const adjacency = new Map<string, DirectedEdgeEntry[]>();
  for (const id of selectedIds) {
    const n = base.nodes.get(id)!;
    nodes.set(id, n);
    adjacency.set(id, []);
  }

  const edges = new Map<string, DirectedEdgeEntry>();
  let blockedEdgeCount = 0;
  let restrictedEdgeCount = 0;

  for (const edge of base.edges.values()) {
    if (!selectedIds.has(edge.sourceNodeId) || !selectedIds.has(edge.targetNodeId)) continue;
    const isBlocked = closureFraction > 0 && rand() < closureFraction;
    const status: RoadClosureStatus = isBlocked ? 'blocked' : 'open';
    if (status === 'blocked') blockedEdgeCount++;
    const cloned: DirectedEdgeEntry = { ...edge, closureStatus: status };
    edges.set(cloned.edgeId, cloned);
    if (status !== 'blocked') {
      adjacency.get(cloned.sourceNodeId)!.push(cloned);
    }
  }

  return {
    cacheKey: `${base.cacheKey}::sub${nodes.size}::c${closureFraction.toFixed(2)}`,
    networkVersion: base.networkVersion,
    scenarioId: base.scenarioId,
    closureVersion: base.closureVersion,
    restrictedMultiplier: base.restrictedMultiplier,
    nodes,
    edges,
    adjacency,
    blockedEdgeCount,
    restrictedEdgeCount,
    maxSpeedMps: base.maxSpeedMps,
  };
}

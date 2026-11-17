import type { CostMode, IncidentRecord, IncidentSeverity, RescueTeamRecord } from '../types.ts';
import { snapToNearestNode, type GraphSnapshot } from './graph.ts';
import { runDijkstra, type ShortestPathResult } from './shortestPath.ts';

export interface DispatchInputTeam {
  id: string;
  name: string;
  category: string;
  capabilities: string[];
  vehicleMode: string;
  homeBaseName: string;
  lat: number;
  lng: number;
  personnelCount: number;
  capacity: number;
}

export interface DispatchInputIncident {
  id: string;
  title: string;
  severity: IncidentSeverity;
  locality: string;
  lat: number;
  lng: number;
  requiredCapabilities: string[];
  requestedTeams: number;
  createdAt: string;
}

export interface DispatchAssignmentOutput {
  incidentId: string;
  incidentTitle: string;
  severity: IncidentSeverity;
  teamId: string;
  teamName: string;
  cost: number;
  distanceM: number;
  travelTimeS: number;
  routeNodeIds: string[];
  routeEdgeIds: string[];
  geometryCoordinates: Array<[number, number]>;
  roadNames: string[];
}

export interface UnassignedIncidentReason {
  incidentId: string;
  incidentTitle: string;
  severity: IncidentSeverity;
  requestedTeams: number;
  assignedTeams: number;
  unmetDemand: number;
  reasonCode:
    | 'incompatible_capability'
    | 'no_feasible_route'
    | 'snap_out_of_bounds'
    | 'insufficient_teams'
    | 'partial_fulfillment';
  explanation: string;
}

export interface TierSummary {
  critical: { requested: number; assigned: number };
  high: { requested: number; assigned: number };
  medium: { requested: number; assigned: number };
  low: { requested: number; assigned: number };
}

export interface DispatchPlanResult {
  algorithm: 'greedy' | 'mcmf';
  costMode: CostMode;
  assignments: DispatchAssignmentOutput[];
  unassigned: UnassignedIncidentReason[];
  tierSummary: TierSummary;
  totalRequestedTeams: number;
  totalAssignedTeams: number;
  totalUnmetDemand: number;
  totalDispatchCost: number;
  averageRouteCost: number;
  runtimeMs: number;
  matrixPrepMs: number;
  complexityNote: string;
  objectiveNote: string;
}

const SEVERITY_RANK: Record<IncidentSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const SEVERITY_TIERS: IncidentSeverity[] = ['critical', 'high', 'medium', 'low'];

export function prepareDispatchInputs(
  incidents: IncidentRecord[],
  teams: RescueTeamRecord[]
): {
  eligibleIncidents: DispatchInputIncident[];
  eligibleTeams: DispatchInputTeam[];
} {
  const eligibleIncidents: DispatchInputIncident[] = incidents
    .filter((i) => i.verification_status === 'verified' && i.status === 'open')
    .map((i) => ({
      id: i.id,
      title: i.title,
      severity: i.severity,
      locality: i.locality,
      lat: i.lat,
      lng: i.lng,
      requiredCapabilities: JSON.parse(i.required_capabilities_json || '["general_rescue"]') as string[],
      requestedTeams: Math.max(1, i.requested_teams || 1),
      createdAt: i.created_at,
    }));

  const eligibleTeams: DispatchInputTeam[] = teams
    .filter((t) => t.status === 'available' && t.shift_available === 1)
    .map((t) => ({
      id: t.id,
      name: t.name,
      category: t.category,
      capabilities: JSON.parse(t.capabilities_json || '["general_rescue"]') as string[],
      vehicleMode: t.vehicle_mode,
      homeBaseName: t.home_base_name,
      lat: t.current_lat,
      lng: t.current_lng,
      personnelCount: t.personnel_count,
      capacity: t.capacity,
    }));

  return { eligibleIncidents, eligibleTeams };
}

function teamSatisfiesIncident(teamCaps: string[], reqCaps: string[]): boolean {
  if (reqCaps.length === 0) return true;
  if (teamCaps.includes('multi_hazard')) return true;
  return reqCaps.every((req) => teamCaps.includes(req) || req === 'general_rescue');
}

export interface FeasibleMatrix {
  routes: Map<string, ShortestPathResult>; // `${teamId}::${incidentId}`
  snapErrors: Map<string, string>;
  capabilityMatches: Map<string, number>; // incidentId -> count of capability-matching teams
  matrixPrepMs: number;
}

export function buildFeasibleRouteMatrix(
  graph: GraphSnapshot,
  teams: DispatchInputTeam[],
  incidents: DispatchInputIncident[],
  costMode: CostMode
): FeasibleMatrix {
  const t0 = performance.now();
  const routes = new Map<string, ShortestPathResult>();
  const snapErrors = new Map<string, string>();
  const capabilityMatches = new Map<string, number>();

  const teamSnaps = new Map<string, string>();
  for (const t of teams) {
    const snap = snapToNearestNode(graph, t.lat, t.lng, 4500);
    if (snap.ok && snap.node) {
      teamSnaps.set(t.id, snap.node.id);
    }
  }

  for (const inc of incidents) {
    const incSnap = snapToNearestNode(graph, inc.lat, inc.lng, 4500);
    if (!incSnap.ok || !incSnap.node) {
      snapErrors.set(inc.id, incSnap.error || 'Incident outside study-area road snap radius');
      capabilityMatches.set(inc.id, 0);
      continue;
    }

    let capCount = 0;
    for (const team of teams) {
      if (!teamSatisfiesIncident(team.capabilities, inc.requiredCapabilities)) {
        continue;
      }
      capCount++;
      const tNode = teamSnaps.get(team.id);
      if (!tNode) continue;

      const sp = runDijkstra(graph, tNode, incSnap.node.id, costMode, false);
      if (sp.status === 'found') {
        routes.set(`${team.id}::${inc.id}`, sp);
      }
    }
    capabilityMatches.set(inc.id, capCount);
  }

  const matrixPrepMs = Math.round((performance.now() - t0) * 1000) / 1000;
  return { routes, snapErrors, capabilityMatches, matrixPrepMs };
}

function summarizePlan(
  algorithm: 'greedy' | 'mcmf',
  costMode: CostMode,
  incidents: DispatchInputIncident[],
  assignments: DispatchAssignmentOutput[],
  matrix: FeasibleMatrix,
  runtimeMs: number,
  complexityNote: string,
  objectiveNote: string
): DispatchPlanResult {
  const tierSummary: TierSummary = {
    critical: { requested: 0, assigned: 0 },
    high: { requested: 0, assigned: 0 },
    medium: { requested: 0, assigned: 0 },
    low: { requested: 0, assigned: 0 },
  };

  const assignedPerIncident = new Map<string, number>();
  for (const a of assignments) {
    assignedPerIncident.set(a.incidentId, (assignedPerIncident.get(a.incidentId) ?? 0) + 1);
  }

  const unassigned: UnassignedIncidentReason[] = [];
  let totalRequestedTeams = 0;
  let totalAssignedTeams = assignments.length;

  for (const inc of incidents) {
    tierSummary[inc.severity].requested += inc.requestedTeams;
    const got = assignedPerIncident.get(inc.id) ?? 0;
    tierSummary[inc.severity].assigned += got;
    totalRequestedTeams += inc.requestedTeams;

    if (got < inc.requestedTeams) {
      const unmet = inc.requestedTeams - got;
      let reasonCode: UnassignedIncidentReason['reasonCode'] = 'insufficient_teams';
      let explanation = `${unmet} of ${inc.requestedTeams} requested team(s) unmet due to limited available teams.`;

      if (matrix.snapErrors.has(inc.id)) {
        reasonCode = 'snap_out_of_bounds';
        explanation = matrix.snapErrors.get(inc.id)!;
      } else if ((matrix.capabilityMatches.get(inc.id) ?? 0) === 0) {
        reasonCode = 'incompatible_capability';
        explanation = `No available team has required capabilities [${inc.requiredCapabilities.join(', ')}].`;
      } else {
        // Check if any feasible route existed at all
        let feasibleRouteCount = 0;
        for (const key of matrix.routes.keys()) {
          if (key.endsWith(`::${inc.id}`)) feasibleRouteCount++;
        }
        if (feasibleRouteCount === 0) {
          reasonCode = 'no_feasible_route';
          explanation = 'All capability-matched teams are disconnected by active road closures or one-way restrictions.';
        } else if (got > 0) {
          reasonCode = 'partial_fulfillment';
          explanation = `Partially fulfilled (${got}/${inc.requestedTeams} teams assigned); remaining teams allocated to higher-priority or lower-cost demand.`;
        }
      }

      unassigned.push({
        incidentId: inc.id,
        incidentTitle: inc.title,
        severity: inc.severity,
        requestedTeams: inc.requestedTeams,
        assignedTeams: got,
        unmetDemand: unmet,
        reasonCode,
        explanation,
      });
    }
  }

  const totalDispatchCost = Math.round(assignments.reduce((acc, a) => acc + a.cost, 0) * 100) / 100;
  const averageRouteCost =
    totalAssignedTeams > 0 ? Math.round((totalDispatchCost / totalAssignedTeams) * 100) / 100 : 0;

  return {
    algorithm,
    costMode,
    assignments,
    unassigned,
    tierSummary,
    totalRequestedTeams,
    totalAssignedTeams,
    totalUnmetDemand: Math.max(0, totalRequestedTeams - totalAssignedTeams),
    totalDispatchCost,
    averageRouteCost,
    runtimeMs,
    matrixPrepMs: matrix.matrixPrepMs,
    complexityNote,
    objectiveNote,
  };
}

/**
 * Custom Greedy Dispatch Baseline:
 * Sorts incident demand slots by severity (critical > high > medium > low),
 * tie-broken deterministically by (createdAt ASC, incidentId ASC), and greedily
 * assigns the nearest unused eligible team by Phase 3 road route cost.
 */
export function runGreedyDispatch(
  incidents: DispatchInputIncident[],
  teams: DispatchInputTeam[],
  matrix: FeasibleMatrix,
  costMode: CostMode
): DispatchPlanResult {
  const t0 = performance.now();

  const sortedIncidents = [...incidents].sort((a, b) => {
    const rDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (rDiff !== 0) return rDiff;
    const tDiff = a.createdAt.localeCompare(b.createdAt);
    if (tDiff !== 0) return tDiff;
    return a.id.localeCompare(b.id);
  });

  const usedTeams = new Set<string>();
  const assignments: DispatchAssignmentOutput[] = [];

  for (const inc of sortedIncidents) {
    for (let slot = 0; slot < inc.requestedTeams; slot++) {
      let bestTeam: DispatchInputTeam | null = null;
      let bestRoute: ShortestPathResult | null = null;
      let bestCost = Infinity;

      for (const team of teams) {
        if (usedTeams.has(team.id)) continue;
        const route = matrix.routes.get(`${team.id}::${inc.id}`);
        if (!route) continue;
        if (
          route.totalCost < bestCost ||
          (route.totalCost === bestCost && bestTeam && team.id.localeCompare(bestTeam.id) < 0)
        ) {
          bestCost = route.totalCost;
          bestTeam = team;
          bestRoute = route;
        }
      }

      if (bestTeam && bestRoute) {
        usedTeams.add(bestTeam.id);
        assignments.push({
          incidentId: inc.id,
          incidentTitle: inc.title,
          severity: inc.severity,
          teamId: bestTeam.id,
          teamName: bestTeam.name,
          cost: bestRoute.totalCost,
          distanceM: bestRoute.totalDistanceM,
          travelTimeS: bestRoute.estimatedTravelTimeS,
          routeNodeIds: bestRoute.pathNodeIds,
          routeEdgeIds: bestRoute.pathEdgeIds,
          geometryCoordinates: bestRoute.geometryCoordinates,
          roadNames: bestRoute.roadNames,
        });
      }
    }
  }

  const runtimeMs = Math.round((performance.now() - t0) * 1000) / 1000;
  return summarizePlan(
    'greedy',
    costMode,
    incidents,
    assignments,
    matrix,
    runtimeMs,
    'O(D * T + D log D) after route matrix, where D = total requested team slots and T = available teams.',
    'Greedy myopic baseline: assigns nearest available team slot-by-slot; can block optimal global pairings.'
  );
}

interface ResidualEdge {
  to: number;
  rev: number;
  cap: number;
  flow: number;
  cost: number; // scaled integer cost
}

/**
 * Custom Min-Cost Max-Flow (MCMF) Lexicographic Dispatch Optimizer from scratch.
 * Graph construction:
 *   Source (0) -> Team_i (cap 1, cost 0)
 *   Team_i -> Incident_j (cap 1, cost = scaled Phase 3 route cost)
 *   Incident_j -> Sink (1) (cap unlocked sequentially by priority tier: critical -> high -> medium -> low)
 *
 * Incremental Residual Graph Method:
 *   Unlocking sink capacity one priority tier at a time and running SPFA (Shortest Path Faster Algorithm)
 *   over the residual graph (including negative-cost reverse edges) guarantees maximum demand fulfillment
 *   for higher tiers is strictly preserved while allowing team swaps via reverse edges to maximize
 *   lower-tier coverage and minimize total route cost globally.
 */
export function runMcmfDispatch(
  incidents: DispatchInputIncident[],
  teams: DispatchInputTeam[],
  matrix: FeasibleMatrix,
  costMode: CostMode
): DispatchPlanResult {
  const t0 = performance.now();

  const sortedIncidents = [...incidents].sort((a, b) => a.id.localeCompare(b.id));
  const sortedTeams = [...teams].sort((a, b) => a.id.localeCompare(b.id));

  const SOURCE = 0;
  const SINK = 1;
  const TEAM_OFFSET = 2;
  const INC_OFFSET = 2 + sortedTeams.length;
  const V = INC_OFFSET + sortedIncidents.length;

  const adj: ResidualEdge[][] = Array.from({ length: V }, () => []);

  const addEdge = (u: number, v: number, cap: number, cost: number): ResidualEdge => {
    const fwd: ResidualEdge = { to: v, rev: adj[v].length, cap, flow: 0, cost };
    const rev: ResidualEdge = { to: u, rev: adj[u].length, cap: 0, flow: 0, cost: -cost };
    adj[u].push(fwd);
    adj[v].push(rev);
    return fwd;
  };

  // Source -> Team_i (cap 1, cost 0)
  for (let ti = 0; ti < sortedTeams.length; ti++) {
    addEdge(SOURCE, TEAM_OFFSET + ti, 1, 0);
  }

  // Team_i -> Incident_j (cap 1, scaled integer cost)
  const teamToIncEdges: Array<{
    teamIdx: number;
    incIdx: number;
    edge: ResidualEdge;
    route: ShortestPathResult;
  }> = [];

  for (let ti = 0; ti < sortedTeams.length; ti++) {
    for (let ii = 0; ii < sortedIncidents.length; ii++) {
      const route = matrix.routes.get(`${sortedTeams[ti].id}::${sortedIncidents[ii].id}`);
      if (!route) continue;
      // Scale cost by 100 to keep exact integer residual edge arithmetic without floating-point drift
      const scaledCost = Math.round(route.totalCost * 100);
      const edge = addEdge(TEAM_OFFSET + ti, INC_OFFSET + ii, 1, scaledCost);
      teamToIncEdges.push({ teamIdx: ti, incIdx: ii, edge, route });
    }
  }

  // Incident_j -> Sink edges (initially cap 0; unlocked tier by tier)
  const incSinkEdges: ResidualEdge[] = sortedIncidents.map((_inc, ii) =>
    addEdge(INC_OFFSET + ii, SINK, 0, 0)
  );

  // Sequential tier passes using SPFA on residual graph
  for (const tier of SEVERITY_TIERS) {
    let tierDemandAdded = 0;
    for (let ii = 0; ii < sortedIncidents.length; ii++) {
      if (sortedIncidents[ii].severity === tier) {
        incSinkEdges[ii].cap = sortedIncidents[ii].requestedTeams;
        tierDemandAdded += sortedIncidents[ii].requestedTeams;
      }
    }
    if (tierDemandAdded === 0) continue;

    // Augment along shortest residual paths until no s->t path remains
    while (true) {
      const dist = new Array<number>(V).fill(Infinity);
      const parentNode = new Array<number>(V).fill(-1);
      const parentEdgeIdx = new Array<number>(V).fill(-1);
      const inQueue = new Array<boolean>(V).fill(false);

      dist[SOURCE] = 0;
      const queue: number[] = [SOURCE];
      let head = 0;
      inQueue[SOURCE] = true;

      while (head < queue.length) {
        const u = queue[head++];
        inQueue[u] = false;

        for (let ei = 0; ei < adj[u].length; ei++) {
          const e = adj[u][ei];
          if (e.cap - e.flow > 0) {
            const nd = dist[u] + e.cost;
            if (nd < dist[e.to]) {
              dist[e.to] = nd;
              parentNode[e.to] = u;
              parentEdgeIdx[e.to] = ei;
              if (!inQueue[e.to]) {
                queue.push(e.to);
                inQueue[e.to] = true;
              }
            }
          }
        }
      }

      if (dist[SINK] === Infinity) break;

      // Push bottleneck flow (always 1 here since Source->Team and Team->Incident have cap 1)
      let aug = Infinity;
      for (let v = SINK; v !== SOURCE; v = parentNode[v]) {
        const u = parentNode[v];
        const e = adj[u][parentEdgeIdx[v]];
        aug = Math.min(aug, e.cap - e.flow);
      }

      for (let v = SINK; v !== SOURCE; v = parentNode[v]) {
        const u = parentNode[v];
        const e = adj[u][parentEdgeIdx[v]];
        e.flow += aug;
        adj[v][e.rev].flow -= aug;
      }
    }
  }

  const assignments: DispatchAssignmentOutput[] = [];
  for (const item of teamToIncEdges) {
    if (item.edge.flow === 1) {
      const team = sortedTeams[item.teamIdx];
      const inc = sortedIncidents[item.incIdx];
      const route = item.route;
      assignments.push({
        incidentId: inc.id,
        incidentTitle: inc.title,
        severity: inc.severity,
        teamId: team.id,
        teamName: team.name,
        cost: route.totalCost,
        distanceM: route.totalDistanceM,
        travelTimeS: route.estimatedTravelTimeS,
        routeNodeIds: route.pathNodeIds,
        routeEdgeIds: route.pathEdgeIds,
        geometryCoordinates: route.geometryCoordinates,
        roadNames: route.roadNames,
      });
    }
  }

  assignments.sort((a, b) => {
    const rDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (rDiff !== 0) return rDiff;
    return a.cost - b.cost;
  });

  const runtimeMs = Math.round((performance.now() - t0) * 1000) / 1000;
  return summarizePlan(
    'mcmf',
    costMode,
    incidents,
    assignments,
    matrix,
    runtimeMs,
    'O(F * V_flow * E_flow) worst-case via SPFA augmenting paths on residual graph with F <= min(|Teams|, TotalDemand) augmentations.',
    'Lexicographic Min-Cost Max-Flow: maximizes critical-tier fulfillment first, then high/medium/low via incremental residual graph, minimizing total route cost.'
  );
}

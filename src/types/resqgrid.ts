export type UserRole = 'admin' | 'dispatcher' | 'viewer';

export interface AuthUser {
  id: string;
  displayName: string;
  email: string;
  role: UserRole;
}

export type IncidentSeverity = 'critical' | 'high' | 'medium' | 'low';
export type IncidentVerificationStatus = 'unverified' | 'verified' | 'rejected';
export type IncidentStatus = 'open' | 'assigned' | 'resolved' | 'closed';
export type RoadClosureStatus = 'open' | 'restricted' | 'blocked';
export type TeamStatus = 'available' | 'assigned' | 'en_route' | 'on_scene' | 'offline';
export type AssignmentStatus =
  | 'proposed'
  | 'approved'
  | 'dispatched'
  | 'en_route'
  | 'arrived'
  | 'completed'
  | 'cancelled';

export type CostMode = 'distance_m' | 'travel_time_s';

export interface Scenario {
  id: string;
  name: string;
  description: string;
  type: string;
  subarea: string;
  is_active: number;
  simulation_seed: number;
  closure_version: number;
  is_seeded: number;
  created_at: string;
  updated_at: string;
  counts?: {
    incidentCount: number;
    blockedCount: number;
    restrictedCount: number;
    teamCount: number;
  };
}

export interface Incident {
  id: string;
  title: string;
  description: string;
  category: string;
  severity: IncidentSeverity;
  lat: number;
  lng: number;
  locality: string;
  affected_people_estimate: number;
  required_capabilities_json: string;
  requested_teams: number;
  verification_status: IncidentVerificationStatus;
  status: IncidentStatus;
  reporter_name?: string | null;
  scenario_id: string;
  is_simulated: number;
  created_at: string;
  updated_at: string;
}

export interface RescueTeam {
  id: string;
  name: string;
  category: string;
  capabilities_json: string;
  vehicle_mode: string;
  home_base_name: string;
  base_lat: number;
  base_lng: number;
  current_lat: number;
  current_lng: number;
  personnel_count: number;
  capacity: number;
  status: TeamStatus;
  shift_available: number;
  scenario_id: string;
  updated_at: string;
}

export interface RoadNodeDto {
  id: string;
  source_osm_id: string;
  name: string;
  locality: string;
  lat: number;
  lng: number;
}

export interface RoadEdgeDto {
  id: string;
  osm_way_id: string;
  name: string;
  highway_type: string;
  source_node_id: string;
  target_node_id: string;
  geometry_json: string;
  length_m: number;
  speed_kmh: number;
  travel_time_s: number;
  is_oneway: number;
  speed_is_assumed: number;
  closure_status: RoadClosureStatus;
  closure_reason: string;
}

export interface FacilityDto {
  id: string;
  name: string;
  kind: 'hospital' | 'shelter' | 'rescue_base';
  locality: string;
  lat: number;
  lng: number;
  capacity_note: string;
}

export interface AuditLogEntry {
  id: string;
  actor_name: string;
  action: string;
  entity_type: string;
  entity_id: string;
  metadata_json: string;
  created_at: string;
}

export interface ShortestPathResult {
  status: 'found' | 'unreachable' | 'invalid_input';
  algorithm: 'dijkstra' | 'astar';
  costMode: CostMode;
  sourceNodeId: string;
  targetNodeId: string;
  pathNodeIds: string[];
  pathEdgeIds: string[];
  geometryCoordinates: Array<[number, number]>;
  roadNames: string[];
  totalCost: number;
  totalDistanceM: number;
  estimatedTravelTimeS: number;
  visitedNodesCount: number;
  relaxationsCount: number;
  runtimeMs: number;
  heapDeltaBytes: number;
  steps: Array<{
    stepIndex: number;
    settledNodeId: string;
    gScore: number;
    fScore: number;
    visitedCount: number;
    heapSize: number;
    viaEdgeId: string | null;
  }>;
  stepsTruncated: boolean;
  errorReason: string | null;
  heuristicNote: string;
  complexity: { time: string; space: string };
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
  steps: Array<{
    stepIndex: number;
    currentNodeId: string;
    frontierSize: number;
    visitedCount: number;
    discoveredEdgeId: string | null;
  }>;
  stepsTruncated: boolean;
  runtimeMs: number;
  complexity: { time: string; space: string; note: string };
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

export interface DispatchPlanResult {
  algorithm: 'greedy' | 'mcmf';
  costMode: CostMode;
  assignments: DispatchAssignmentOutput[];
  unassigned: Array<{
    incidentId: string;
    incidentTitle: string;
    severity: IncidentSeverity;
    requestedTeams: number;
    assignedTeams: number;
    unmetDemand: number;
    reasonCode: string;
    explanation: string;
  }>;
  tierSummary: Record<IncidentSeverity, { requested: number; assigned: number }>;
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

export interface PersistedAssignment {
  id: string;
  scenario_id: string;
  incident_id: string;
  team_id: string;
  status: AssignmentStatus;
  algorithm_source: string;
  proposed_route_json: string;
  cost: number;
  distance_m: number;
  travel_time_s: number;
  created_at: string;
  updated_at: string;
  incident_title: string;
  incident_severity: IncidentSeverity;
  incident_locality: string;
  incident_lat: number;
  incident_lng: number;
  team_name: string;
  team_category: string;
  team_vehicle_mode: string;
  team_lat: number;
  team_lng: number;
}

export interface VolunteerRecord {
  id: string;
  display_name: string;
  locality: string;
  capabilities_json: string;
  availability_status: 'available' | 'standby' | 'unavailable';
  scenario_id: string;
  created_at: string;
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
  scalingCurve: Array<{
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
  }>;
  closureImpact: Array<{
    closurePercent: number;
    blockedEdges: number;
    totalEdges: number;
    reachableNodesPercent: number;
    reachablePairsPercent: number;
    avgTravelTimeS: number | null;
  }>;
  dispatchComparison: Array<{
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
  }>;
  generatedAt: string;
}

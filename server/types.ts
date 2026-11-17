export type UserRole = 'admin' | 'dispatcher' | 'viewer';

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
export type RoutingAlgorithm = 'dijkstra' | 'astar' | 'bfs' | 'dfs';

export interface UserRecord {
  id: string;
  display_name: string;
  email: string;
  role: UserRole;
  is_active: number;
  created_at: string;
}

export interface RoadNode {
  id: string;
  source_osm_id: string;
  name: string;
  locality: string;
  lat: number;
  lng: number;
}

export interface RoadEdge {
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
}

export interface DisasterScenario {
  id: string;
  name: string;
  description: string;
  type: string;
  subarea: string;
  is_active: number;
  simulation_seed: number;
  closure_version: number;
  is_seeded: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface IncidentRecord {
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
  reporter_name: string | null;
  reporter_id: string | null;
  scenario_id: string;
  is_simulated: number;
  created_at: string;
  updated_at: string;
}

export interface RescueTeamRecord {
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
  created_at: string;
}

export interface RescueAssignmentRecord {
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
  approved_by: string | null;
  created_at: string;
  updated_at: string;
}

import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { hashPassword } from './auth.ts';
import { buildChennaiRoadNetwork, SEEDED_FACILITIES } from './chennaiNetwork.ts';
import type { IncidentSeverity, RoadClosureStatus } from './types.ts';

interface SeedScenarioSpec {
  id: string;
  name: string;
  description: string;
  type: string;
  subarea: string;
  isActive: number;
  seed: number;
  incidents: Array<{
    id: string;
    title: string;
    description: string;
    category: string;
    severity: IncidentSeverity;
    lat: number;
    lng: number;
    locality: string;
    affected: number;
    capabilities: string[];
    requestedTeams: number;
    verification: 'verified' | 'unverified';
  }>;
  closures: Array<{
    edgeId: string;
    status: RoadClosureStatus;
    reason: string;
  }>;
  teams: Array<{
    id: string;
    name: string;
    category: string;
    capabilities: string[];
    vehicleMode: string;
    homeBaseName: string;
    lat: number;
    lng: number;
    personnel: number;
    capacity: number;
  }>;
}

export const SEEDED_SCENARIOS: SeedScenarioSpec[] = [
  {
    id: 'scen-velachery-monsoon',
    name: 'Velachery Northeast Monsoon Flood Simulation',
    description:
      'Hypothetical northeast monsoon waterlogging across Velachery, Taramani, Pallikaranai, and Adyar corridors. All incidents, road blocks, and rescue units are simulated.',
    type: 'monsoon_flood',
    subarea: 'south_chennai_velachery',
    isActive: 1,
    seed: 20251101,
    incidents: [
      {
        id: 'inc-vel-01',
        title: 'Simulated Submersion — Vijayanagar Bus Stand Sector',
        description: 'Hypothetical knee-to-waist water stagnation isolating ground-floor residents requiring inflatable boat evacuation.',
        category: 'flood_rescue',
        severity: 'critical',
        lat: 12.9794,
        lng: 80.2215,
        locality: 'Velachery',
        affected: 38,
        capabilities: ['boat_water', 'medical'],
        requestedTeams: 2,
        verification: 'verified',
      },
      {
        id: 'inc-vel-02',
        title: 'Simulated Transformer Hazard — Taramani Link Rd',
        description: 'Simulated downed feeder pillar and stranded commuters along waterlogged link road.',
        category: 'electrical_water',
        severity: 'high',
        lat: 12.9892,
        lng: 80.2468,
        locality: 'Taramani',
        affected: 16,
        capabilities: ['heavy_rescue'],
        requestedTeams: 1,
        verification: 'verified',
      },
      {
        id: 'inc-vel-03',
        title: 'Simulated Medical Dialysis Transfer — Pallikaranai',
        description: 'Simulated urgent patient transport request from marsh-adjacent residential block.',
        category: 'medical_evac',
        severity: 'critical',
        lat: 12.9378,
        lng: 80.2078,
        locality: 'Pallikaranai',
        affected: 4,
        capabilities: ['medical'],
        requestedTeams: 1,
        verification: 'verified',
      },
      {
        id: 'inc-vel-04',
        title: 'Simulated Culvert Overflow — Adyar LB Rd',
        description: 'Simulated water ingress near Adyar Depot requiring pump & triage support.',
        category: 'flood_rescue',
        severity: 'medium',
        lat: 13.0002,
        lng: 80.2555,
        locality: 'Adyar',
        affected: 14,
        capabilities: ['boat_water'],
        requestedTeams: 1,
        verification: 'verified',
      },
      {
        id: 'inc-vel-05',
        title: 'Simulated Citizen Report — Perungudi Side Lane',
        description: 'Unverified simulated citizen portal request reporting stranded senior citizens.',
        category: 'flood_rescue',
        severity: 'high',
        lat: 12.9661,
        lng: 80.2442,
        locality: 'Perungudi',
        affected: 6,
        capabilities: ['boat_water'],
        requestedTeams: 1,
        verification: 'unverified',
      },
    ],
    closures: [
      { edgeId: 'E_VIJ_VELS', status: 'blocked', reason: 'Simulated 1.1m waterlogging at Kaiveli low-lying stretch' },
      { edgeId: 'E_VIJ_VELS_REV', status: 'blocked', reason: 'Simulated 1.1m waterlogging at Kaiveli low-lying stretch' },
      { edgeId: 'E_VELS_PER', status: 'blocked', reason: 'Simulated Pallikaranai marsh overflow across carriageway' },
      { edgeId: 'E_VELS_PER_REV', status: 'blocked', reason: 'Simulated Pallikaranai marsh overflow across carriageway' },
      { edgeId: 'E_TAR_VELB', status: 'restricted', reason: 'Simulated slow water drainage; high-clearance vehicles only (2.5x penalty)' },
      { edgeId: 'E_TAR_VELB_REV', status: 'restricted', reason: 'Simulated slow water drainage; high-clearance vehicles only (2.5x penalty)' },
      { edgeId: 'E_GUI_VELB', status: 'restricted', reason: 'Simulated partial lane flooding near Guindy Race Course' },
    ],
    teams: [
      { id: 'team-vel-1', name: 'NDRF Boat Alpha-1', category: 'Water Rescue', capabilities: ['boat_water', 'medical'], vehicleMode: 'amphibious_carrier', homeBaseName: 'Guindy NDRF Staging Base', lat: 13.0085, lng: 80.213, personnel: 8, capacity: 10 },
      { id: 'team-vel-2', name: 'SDRF Aqua Bravo-2', category: 'Water Rescue', capabilities: ['boat_water'], vehicleMode: 'inflatable_boat_rig', homeBaseName: 'Adyar Coastal Depot', lat: 13.0064, lng: 80.2476, personnel: 6, capacity: 8 },
      { id: 'team-vel-3', name: 'Chennai Med-Evac Charlie-3', category: 'Medical Triage', capabilities: ['medical'], vehicleMode: 'high_clearance_ambulance', homeBaseName: 'Saidapet Staging Hub', lat: 13.0213, lng: 80.2231, personnel: 4, capacity: 6 },
      { id: 'team-vel-4', name: 'TNFRS Heavy Delta-4', category: 'Heavy Engineering', capabilities: ['heavy_rescue', 'multi_hazard'], vehicleMode: 'heavy_rescue_truck', homeBaseName: 'Egmore Fire HQ', lat: 13.0732, lng: 80.2609, personnel: 7, capacity: 8 },
      { id: 'team-vel-5', name: 'South Metro Swift Echo-5', category: 'Water Rescue', capabilities: ['boat_water', 'medical'], vehicleMode: '4x4_rescue_suv', homeBaseName: 'Tambaram Transit Hub', lat: 12.9285, lng: 80.1195, personnel: 5, capacity: 6 },
      { id: 'team-vel-6', name: 'T. Nagar Mobile Med Foxtrot-6', category: 'Medical Triage', capabilities: ['medical'], vehicleMode: 'ambulance', homeBaseName: 'T. Nagar Depot', lat: 13.0418, lng: 80.2341, personnel: 4, capacity: 4 },
    ],
  },
  {
    id: 'scen-coastal-cyclone',
    name: 'Coastal Cyclone Disruption Simulation',
    description:
      'Hypothetical severe cyclonic wind & storm-surge scenario impacting Marina, Santhome, Thiruvanmiyur, ECR, and Ennore coastal corridors.',
    type: 'coastal_cyclone',
    subarea: 'coastal_corridor',
    isActive: 0,
    seed: 20251102,
    incidents: [
      {
        id: 'inc-cyc-01',
        title: 'Simulated Coastal Surge — Ennore Fishing Hamlet',
        description: 'Hypothetical storm surge inundation requiring urgent coastal evacuation.',
        category: 'cyclone_evac',
        severity: 'critical',
        lat: 13.212,
        lng: 80.319,
        locality: 'Ennore',
        affected: 55,
        capabilities: ['boat_water', 'heavy_rescue'],
        requestedTeams: 2,
        verification: 'verified',
      },
      {
        id: 'inc-cyc-02',
        title: 'Simulated Fallen Banyan & Line Snag — Santhome',
        description: 'Hypothetical treefall trapping 2 vehicles along coastal road.',
        category: 'tree_debris',
        severity: 'high',
        lat: 13.0315,
        lng: 80.2775,
        locality: 'Santhome',
        affected: 8,
        capabilities: ['heavy_rescue'],
        requestedTeams: 1,
        verification: 'verified',
      },
      {
        id: 'inc-cyc-03',
        title: 'Simulated Roof Collapse — Thiruvanmiyur Shelter',
        description: 'Hypothetical structural damage requiring medical triage team.',
        category: 'structural',
        severity: 'critical',
        lat: 12.9858,
        lng: 80.2598,
        locality: 'Thiruvanmiyur',
        affected: 19,
        capabilities: ['medical', 'heavy_rescue'],
        requestedTeams: 1,
        verification: 'verified',
      },
      {
        id: 'inc-cyc-04',
        title: 'Simulated Beachfront Stranded Crew — Marina Lighthouse',
        description: 'Hypothetical high-wind advisory evacuation.',
        category: 'cyclone_evac',
        severity: 'medium',
        lat: 13.0398,
        lng: 80.2794,
        locality: 'Mylapore',
        affected: 11,
        capabilities: ['medical'],
        requestedTeams: 1,
        verification: 'verified',
      },
    ],
    closures: [
      { edgeId: 'E_CEN_MAR', status: 'blocked', reason: 'Simulated cyclone wave overtopping on Kamarajar Salai' },
      { edgeId: 'E_CEN_MAR_REV', status: 'blocked', reason: 'Simulated cyclone wave overtopping on Kamarajar Salai' },
      { edgeId: 'E_LIG_SAN', status: 'blocked', reason: 'Simulated fallen power poles along Marina-Santhome stretch' },
      { edgeId: 'E_LIG_SAN_REV', status: 'blocked', reason: 'Simulated fallen power poles along Marina-Santhome stretch' },
      { edgeId: 'E_THV_AKK', status: 'restricted', reason: 'Simulated crosswind debris hazard along ECR' },
      { edgeId: 'E_ENN_ERN', status: 'restricted', reason: 'Simulated coastal road sand & debris clearance underway' },
    ],
    teams: [
      { id: 'team-cyc-1', name: 'Coastal Guard Sim Unit-1', category: 'Coastal Rescue', capabilities: ['boat_water', 'heavy_rescue'], vehicleMode: 'amphibious_carrier', homeBaseName: 'Tondiarpet Coastal Base', lat: 13.1282, lng: 80.2896, personnel: 8, capacity: 12 },
      { id: 'team-cyc-2', name: 'Central Crane & Saw Unit-2', category: 'Heavy Engineering', capabilities: ['heavy_rescue'], vehicleMode: 'crane_utility_truck', homeBaseName: 'Egmore Fire HQ', lat: 13.0732, lng: 80.2609, personnel: 6, capacity: 4 },
      { id: 'team-cyc-3', name: 'Royapettah Trauma Med-3', category: 'Medical Triage', capabilities: ['medical'], vehicleMode: 'ambulance', homeBaseName: 'Royapettah Hospital Hub', lat: 13.0548, lng: 80.2645, personnel: 4, capacity: 6 },
      { id: 'team-cyc-4', name: 'OMR Multi-Hazard Rapid-4', category: 'Multi-Hazard', capabilities: ['multi_hazard'], vehicleMode: '4x4_rescue_suv', homeBaseName: 'Taramani Staging', lat: 12.9896, lng: 80.2484, personnel: 6, capacity: 8 },
    ],
  },
  {
    id: 'scen-north-chennai',
    name: 'North Chennai Heavy-Rainfall Transport Disruption',
    description:
      'Hypothetical intense localized cloudburst disrupting Basin Bridge, Vyasarpadi, Perambur, Tiruvottiyur, and Manali industrial corridors.',
    type: 'urban_disruption',
    subarea: 'north_chennai',
    isActive: 0,
    seed: 20251103,
    incidents: [
      {
        id: 'inc-nth-01',
        title: 'Simulated Subway Flooding — Vyasarpadi',
        description: 'Hypothetical bus stranded near flooded railway underpass.',
        category: 'flood_rescue',
        severity: 'critical',
        lat: 13.1088,
        lng: 80.2632,
        locality: 'Vyasarpadi',
        affected: 32,
        capabilities: ['boat_water', 'heavy_rescue'],
        requestedTeams: 1,
        verification: 'verified',
      },
      {
        id: 'inc-nth-02',
        title: 'Simulated Industrial Chemical Containment — Manali',
        description: 'Hypothetical warehouse stormwater overflow requiring hazmat/heavy inspection.',
        category: 'industrial_hazard',
        severity: 'high',
        lat: 13.1685,
        lng: 80.2652,
        locality: 'Manali',
        affected: 15,
        capabilities: ['heavy_rescue'],
        requestedTeams: 1,
        verification: 'verified',
      },
      {
        id: 'inc-nth-03',
        title: 'Simulated Clinic Backup Power Failure — Tiruvottiyur',
        description: 'Hypothetical urgent patient transfer to Stanley Medical Hub.',
        category: 'medical_evac',
        severity: 'high',
        lat: 13.1643,
        lng: 80.3001,
        locality: 'Tiruvottiyur',
        affected: 7,
        capabilities: ['medical'],
        requestedTeams: 1,
        verification: 'verified',
      },
    ],
    closures: [
      { edgeId: 'E_VYA_CEN', status: 'blocked', reason: 'Simulated railway subway submerged under 1.5m stormwater' },
      { edgeId: 'E_VYA_CEN_REV', status: 'blocked', reason: 'Simulated railway subway submerged under 1.5m stormwater' },
      { edgeId: 'E_WAS_VYA', status: 'blocked', reason: 'Simulated Basin Bridge approach closure' },
      { edgeId: 'E_WAS_VYA_REV', status: 'blocked', reason: 'Simulated Basin Bridge approach closure' },
      { edgeId: 'E_MOO_PER', status: 'restricted', reason: 'Simulated heavy surface runoff along Madhavaram High Rd' },
    ],
    teams: [
      { id: 'team-nth-1', name: 'Tondiarpet Aqua Unit-1', category: 'Water Rescue', capabilities: ['boat_water', 'heavy_rescue'], vehicleMode: 'amphibious_carrier', homeBaseName: 'Tondiarpet Coastal Base', lat: 13.1282, lng: 80.2896, personnel: 7, capacity: 10 },
      { id: 'team-nth-2', name: 'Ambattur Heavy Engineering-2', category: 'Heavy Engineering', capabilities: ['heavy_rescue'], vehicleMode: 'heavy_rescue_truck', homeBaseName: 'Ambattur Depot', lat: 13.1098, lng: 80.1635, personnel: 6, capacity: 6 },
      { id: 'team-nth-3', name: 'Kilpauk Rapid Med-3', category: 'Medical Triage', capabilities: ['medical'], vehicleMode: 'high_clearance_ambulance', homeBaseName: 'Kilpauk Medical Hub', lat: 13.0785, lng: 80.2368, personnel: 4, capacity: 5 },
      { id: 'team-nth-4', name: 'Egmore Reserve Multi-4', category: 'Multi-Hazard', capabilities: ['multi_hazard'], vehicleMode: '4x4_rescue_suv', homeBaseName: 'Egmore Fire HQ', lat: 13.0732, lng: 80.2609, personnel: 5, capacity: 6 },
    ],
  },
  {
    id: 'scen-multi-zone',
    name: 'Multi-Zone Chennai Flooding & Rescue Demand',
    description:
      'Hypothetical metropolitan-wide stress test spanning GCC core (T. Nagar, Velachery, Anna Nagar) and outer study-area corridors (Avadi, Tambaram).',
    type: 'multi_zone',
    subarea: 'chennai_metro_study_area',
    isActive: 0,
    seed: 20251104,
    incidents: [
      {
        id: 'inc-mz-01',
        title: 'Simulated Basement Flood — T. Nagar Panagal Sector',
        description: 'Hypothetical commercial cellar inundation trapping staff.',
        category: 'flood_rescue',
        severity: 'critical',
        lat: 13.0418,
        lng: 80.2341,
        locality: 'T. Nagar',
        affected: 22,
        capabilities: ['boat_water', 'heavy_rescue'],
        requestedTeams: 1,
        verification: 'verified',
      },
      {
        id: 'inc-mz-02',
        title: 'Simulated Lake Surplus Breach — Avadi Outer West',
        description: 'Hypothetical tank bund seepage affecting Avadi outer study-area neighborhood.',
        category: 'flood_rescue',
        severity: 'critical',
        lat: 13.1067,
        lng: 80.097,
        locality: 'Avadi',
        affected: 44,
        capabilities: ['boat_water'],
        requestedTeams: 2,
        verification: 'verified',
      },
      {
        id: 'inc-mz-03',
        title: 'Simulated Highway Pileup — Tambaram Bypass',
        description: 'Hypothetical multi-vehicle collision during heavy squall outside GCC limits.',
        category: 'traffic_trauma',
        severity: 'high',
        lat: 12.9249,
        lng: 80.1,
        locality: 'Tambaram',
        affected: 9,
        capabilities: ['medical', 'heavy_rescue'],
        requestedTeams: 1,
        verification: 'verified',
      },
      {
        id: 'inc-mz-04',
        title: 'Simulated Power Sub-Station Flood — Velachery',
        description: 'Hypothetical dewatering & medical standby request.',
        category: 'electrical_water',
        severity: 'high',
        lat: 12.9862,
        lng: 80.2244,
        locality: 'Velachery',
        affected: 12,
        capabilities: ['heavy_rescue'],
        requestedTeams: 1,
        verification: 'verified',
      },
      {
        id: 'inc-mz-05',
        title: 'Simulated Elderly Home Evacuation — Anna Nagar',
        description: 'Hypothetical preventive evacuation support.',
        category: 'medical_evac',
        severity: 'medium',
        lat: 13.085,
        lng: 80.2101,
        locality: 'Anna Nagar',
        affected: 18,
        capabilities: ['medical'],
        requestedTeams: 1,
        verification: 'verified',
      },
    ],
    closures: [
      { edgeId: 'E_TNP_TNB', status: 'blocked', reason: 'Simulated Usman Rd underpass waterlogging' },
      { edgeId: 'E_TNP_TNB_REV', status: 'blocked', reason: 'Simulated Usman Rd underpass waterlogging' },
      { edgeId: 'E_THM_KOY', status: 'restricted', reason: 'Simulated Koyambedu flyover approach congestion & pooling' },
      { edgeId: 'E_VELB_VIJ', status: 'blocked', reason: 'Simulated 100ft Bypass Rd breach' },
      { edgeId: 'E_VELB_VIJ_REV', status: 'blocked', reason: 'Simulated 100ft Bypass Rd breach' },
      { edgeId: 'E_AVA_THIR', status: 'restricted', reason: 'Simulated CTH Rd culvert overflow' },
    ],
    teams: [
      { id: 'team-mz-1', name: 'Ambattur West Swift-1', category: 'Water Rescue', capabilities: ['boat_water'], vehicleMode: 'boat_carrier', homeBaseName: 'Ambattur Depot', lat: 13.1143, lng: 80.1548, personnel: 6, capacity: 8 },
      { id: 'team-mz-2', name: 'Porur Heavy Trauma-2', category: 'Heavy + Med', capabilities: ['medical', 'heavy_rescue'], vehicleMode: 'heavy_rescue_truck', homeBaseName: 'Porur Hub', lat: 13.0382, lng: 80.1565, personnel: 6, capacity: 6 },
      { id: 'team-mz-3', name: 'Egmore Multi-Hazard-3', category: 'Multi-Hazard', capabilities: ['multi_hazard'], vehicleMode: '4x4_rescue_suv', homeBaseName: 'Egmore HQ', lat: 13.0732, lng: 80.2609, personnel: 7, capacity: 8 },
      { id: 'team-mz-4', name: 'Guindy Aqua Engineering-4', category: 'Water + Heavy', capabilities: ['boat_water', 'heavy_rescue'], vehicleMode: 'amphibious_carrier', homeBaseName: 'Guindy Base', lat: 13.0085, lng: 80.2206, personnel: 8, capacity: 10 },
      { id: 'team-mz-5', name: 'Kilpauk Med-5', category: 'Medical Triage', capabilities: ['medical'], vehicleMode: 'ambulance', homeBaseName: 'Kilpauk Hub', lat: 13.0785, lng: 80.2368, personnel: 4, capacity: 5 },
    ],
  },
  {
    id: 'scen-custom-sandbox',
    name: 'User-Configurable Custom Scenario',
    description:
      'Clean metropolitan baseline with zero initial road closures for custom faculty demonstrations, parameter sweeps, and student graph experiments.',
    type: 'custom',
    subarea: 'chennai_metro_study_area',
    isActive: 0,
    seed: 20251105,
    incidents: [
      {
        id: 'inc-cus-01',
        title: 'Simulated Baseline Drill — Guindy',
        description: 'Baseline tabletop simulation incident for custom route testing.',
        category: 'drill',
        severity: 'high',
        lat: 13.0085,
        lng: 80.2206,
        locality: 'Guindy',
        affected: 10,
        capabilities: ['medical'],
        requestedTeams: 1,
        verification: 'verified',
      },
      {
        id: 'inc-cus-02',
        title: 'Simulated Baseline Drill — Egmore',
        description: 'Baseline tabletop simulation incident in central Chennai.',
        category: 'drill',
        severity: 'medium',
        lat: 13.0732,
        lng: 80.2609,
        locality: 'Egmore',
        affected: 5,
        capabilities: ['heavy_rescue'],
        requestedTeams: 1,
        verification: 'verified',
      },
    ],
    closures: [],
    teams: [
      { id: 'team-cus-1', name: 'Sandbox Alpha-1', category: 'Multi-Hazard', capabilities: ['multi_hazard'], vehicleMode: '4x4_rescue_suv', homeBaseName: 'Anna Nagar Hub', lat: 13.085, lng: 80.2101, personnel: 6, capacity: 8 },
      { id: 'team-cus-2', name: 'Sandbox Bravo-2', category: 'Medical Triage', capabilities: ['medical'], vehicleMode: 'ambulance', homeBaseName: 'Adyar Hub', lat: 13.0064, lng: 80.2476, personnel: 4, capacity: 6 },
      { id: 'team-cus-3', name: 'Sandbox Charlie-3', category: 'Heavy Engineering', capabilities: ['heavy_rescue'], vehicleMode: 'heavy_rescue_truck', homeBaseName: 'Tondiarpet Hub', lat: 13.1282, lng: 80.2896, personnel: 6, capacity: 6 },
    ],
  },
];

export function seedScenarioData(db: DatabaseSync, spec: SeedScenarioSpec, adminId: string): void {
  const existing = db.prepare('SELECT id FROM disaster_scenarios WHERE id = ?').get(spec.id);
  if (!existing) {
    db.prepare(
      `INSERT INTO disaster_scenarios
       (id, name, description, type, subarea, is_active, simulation_seed, closure_version, is_seeded, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?)`
    ).run(spec.id, spec.name, spec.description, spec.type, spec.subarea, spec.isActive, spec.seed, adminId);
  }

  // Seed incidents idempotently
  const insertInc = db.prepare(
    `INSERT OR IGNORE INTO incidents
     (id, title, description, category, severity, lat, lng, locality, affected_people_estimate,
      required_capabilities_json, requested_teams, verification_status, status, reporter_name, scenario_id, is_simulated)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', 'Simulated Command Seed', ?, 1)`
  );
  for (const inc of spec.incidents) {
    insertInc.run(
      inc.id,
      inc.title,
      inc.description,
      inc.category,
      inc.severity,
      inc.lat,
      inc.lng,
      inc.locality,
      inc.affected,
      JSON.stringify(inc.capabilities),
      inc.requestedTeams,
      inc.verification,
      spec.id
    );
  }

  // Seed closures idempotently
  const insertClosure = db.prepare(
    `INSERT OR IGNORE INTO scenario_road_closures
     (id, scenario_id, road_edge_id, override_status, reason, updated_by)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  for (const cl of spec.closures) {
    insertClosure.run(
      `cl-${spec.id}-${cl.edgeId}`,
      spec.id,
      cl.edgeId,
      cl.status,
      cl.reason,
      adminId
    );
  }

  // Seed rescue teams idempotently
  const insertTeam = db.prepare(
    `INSERT OR IGNORE INTO rescue_teams
     (id, name, category, capabilities_json, vehicle_mode, home_base_name,
      base_lat, base_lng, current_lat, current_lng, personnel_count, capacity, status, shift_available, scenario_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'available', 1, ?)`
  );
  for (const t of spec.teams) {
    insertTeam.run(
      t.id,
      t.name,
      t.category,
      JSON.stringify(t.capabilities),
      t.vehicleMode,
      t.homeBaseName,
      t.lat,
      t.lng,
      t.lat,
      t.lng,
      t.personnel,
      t.capacity,
      spec.id
    );
  }
}

export function resetScenarioToSeed(
  db: DatabaseSync,
  scenarioId: string,
  actorId: string,
  actorName: string
): boolean {
  const spec = SEEDED_SCENARIOS.find((s) => s.id === scenarioId);
  if (!spec) return false;

  db.exec('BEGIN;');
  try {
    db.prepare('DELETE FROM rescue_assignments WHERE scenario_id = ?').run(scenarioId);
    db.prepare('DELETE FROM scenario_road_closures WHERE scenario_id = ?').run(scenarioId);
    db.prepare('DELETE FROM incidents WHERE scenario_id = ?').run(scenarioId);
    db.prepare('DELETE FROM rescue_teams WHERE scenario_id = ?').run(scenarioId);

    db.prepare(
      `UPDATE disaster_scenarios
       SET name = ?, description = ?, closure_version = closure_version + 1, updated_at = datetime('now')
       WHERE id = ?`
    ).run(spec.name, spec.description, scenarioId);

    seedScenarioData(db, spec, actorId);

    db.prepare(
      `INSERT INTO audit_logs (id, actor_id, actor_name, action, entity_type, entity_id, metadata_json)
       VALUES (?, ?, ?, 'SCENARIO_RESET_TO_SEED', 'scenario', ?, ?)`
    ).run(
      randomUUID(),
      actorId,
      actorName,
      scenarioId,
      JSON.stringify({ scenarioName: spec.name })
    );

    db.exec('COMMIT;');
    return true;
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

export function seedDatabase(db: DatabaseSync): void {
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@resqgrid.local';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'ResqAdmin@2026';
  const dispatcherEmail = 'dispatcher@resqgrid.local';
  const dispatcherPassword = process.env.SEED_DISPATCHER_PASSWORD || 'ResqDispatch@2026';
  const viewerEmail = process.env.SEED_VIEWER_EMAIL || 'viewer@resqgrid.local';
  const viewerPassword = process.env.SEED_VIEWER_PASSWORD || 'ResqViewer@2026';

  const adminId = 'user-admin-seed';
  const dispatcherId = 'user-dispatcher-seed';
  const viewerId = 'user-viewer-seed';

  const insertUser = db.prepare(
    `INSERT OR IGNORE INTO users (id, display_name, email, password_hash, role, is_active)
     VALUES (?, ?, ?, ?, ?, 1)`
  );
  insertUser.run(adminId, 'Cmdr. Kavya Sundaram (Admin)', adminEmail, hashPassword(adminPassword), 'admin');
  insertUser.run(dispatcherId, 'Arjun Natarajan (Dispatcher)', dispatcherEmail, hashPassword(dispatcherPassword), 'dispatcher');
  insertUser.run(viewerId, 'Dr. Meenakshi R. (Faculty Viewer)', viewerEmail, hashPassword(viewerPassword), 'viewer');

  // Road Network
  const nodeCountRow = db.prepare('SELECT COUNT(*) as cnt FROM road_nodes').get() as { cnt: number };
  if (nodeCountRow.cnt === 0) {
    const { nodes, edges } = buildChennaiRoadNetwork();
    db.exec('BEGIN;');
    try {
      const insNode = db.prepare(
        'INSERT OR IGNORE INTO road_nodes (id, source_osm_id, name, locality, lat, lng) VALUES (?, ?, ?, ?, ?, ?)'
      );
      for (const n of nodes) {
        insNode.run(n.id, n.source_osm_id, n.name, n.locality, n.lat, n.lng);
      }

      const insEdge = db.prepare(
        `INSERT OR IGNORE INTO road_edges
         (id, osm_way_id, name, highway_type, source_node_id, target_node_id, geometry_json, length_m, speed_kmh, travel_time_s, is_oneway, speed_is_assumed)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const e of edges) {
        insEdge.run(
          e.id,
          e.osm_way_id,
          e.name,
          e.highway_type,
          e.source_node_id,
          e.target_node_id,
          e.geometry_json,
          e.length_m,
          e.speed_kmh,
          e.travel_time_s,
          e.is_oneway,
          e.speed_is_assumed
        );
      }
      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  }

  // Facilities (Hospitals, Shelters, Bases)
  const insFac = db.prepare(
    `INSERT OR IGNORE INTO shelters_hospitals (id, name, kind, locality, lat, lng, capacity_note)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  for (const f of SEEDED_FACILITIES) {
    insFac.run(f.id, f.name, f.kind, f.locality, f.lat, f.lng, f.capacity_note);
  }

  // Scenarios
  const scenCountRow = db.prepare('SELECT COUNT(*) as cnt FROM disaster_scenarios').get() as { cnt: number };
  if (scenCountRow.cnt === 0) {
    for (const spec of SEEDED_SCENARIOS) {
      seedScenarioData(db, spec, adminId);
    }

    // Seed sample volunteers for active scenario
    const insVol = db.prepare(
      `INSERT OR IGNORE INTO volunteers (id, display_name, locality, capabilities_json, availability_status, scenario_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    insVol.run('vol-1', 'Karthik V. (Volunteer)', 'Velachery', '["first_aid","boat_water"]', 'available', 'scen-velachery-monsoon');
    insVol.run('vol-2', 'Priya M. (Volunteer)', 'Adyar', '["first_aid","logistics"]', 'available', 'scen-velachery-monsoon');
    insVol.run('vol-3', 'Senthil K. (Volunteer)', 'Tambaram', '["heavy_rescue","logistics"]', 'standby', 'scen-velachery-monsoon');

    // Initial Audit Event
    db.prepare(
      `INSERT INTO audit_logs (id, actor_id, actor_name, action, entity_type, entity_id, metadata_json)
       VALUES (?, ?, 'System Seed', 'DATABASE_INITIALIZED', 'system', 'resqgrid-v1', ?)`
    ).run(
      randomUUID(),
      adminId,
      JSON.stringify({ scenariosSeeded: SEEDED_SCENARIOS.length, note: 'Academic simulation baseline loaded' })
    );
  }

  // Default System Settings
  db.prepare(
    `INSERT OR IGNORE INTO system_settings (key, value) VALUES ('restricted_multiplier', '2.5')`
  ).run();
  db.prepare(
    `INSERT OR IGNORE INTO system_settings (key, value) VALUES ('snap_radius_m', '3500')`
  ).run();
}

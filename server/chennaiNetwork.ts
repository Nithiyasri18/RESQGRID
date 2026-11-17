import type { RoadEdge, RoadNode } from './types.ts';

export const GRAPH_NETWORK_VERSION = 'chennai-study-graph-v1.0';

export const STUDY_AREA_METADATA = {
  studyAreaName: 'Chennai Metropolitan Study Area (Academic Simulation)',
  distinctionNote:
    'Configurable study-area polygon encompassing Greater Chennai Corporation (GCC) core zones plus outer metropolitan corridors (Avadi, Ambattur West, Tambaram, Sholinganallur). Not equivalent to official Greater Chennai Corporation administrative boundaries.',
  dataSource:
    'Offline Chennai Arterial Road Graph (OSM-compatible topology & coordinates). Run scripts/import_chennai_roads.py with OSMnx for full citywide OpenStreetMap extract.',
  attribution: 'Map tiles & road reference © OpenStreetMap contributors (ODbL).',
  speedAssumption:
    'Edge speeds (25–60 km/h by road class) are academic simulation assumptions when live observed telemetry is unavailable. Never interpret open edges as flood-safe.',
  restrictedMultiplierDefault: 2.5,
  networkVersion: GRAPH_NETWORK_VERSION,
  polygon: {
    type: 'Feature' as const,
    properties: {
      name: 'Chennai Metropolitan Study Area',
      note: 'Includes GCC core + Avadi, Tambaram, Ennore, Sholinganallur',
    },
    geometry: {
      type: 'Polygon' as const,
      coordinates: [
        [
          [80.06, 13.23],
          [80.34, 13.24],
          [80.31, 13.08],
          [80.28, 12.88],
          [80.07, 12.89],
          [80.05, 13.06],
          [80.06, 13.23],
        ],
      ],
    },
  },
  gccCoreApproximatePolygon: {
    type: 'Feature' as const,
    properties: {
      name: 'GCC Core Reference Envelope (Illustrative)',
      note: 'Approximate central envelope; Avadi and Tambaram lie outside GCC limits.',
    },
    geometry: {
      type: 'Polygon' as const,
      coordinates: [
        [
          [80.14, 13.16],
          [80.31, 13.16],
          [80.28, 12.95],
          [80.16, 12.95],
          [80.14, 13.16],
        ],
      ],
    },
  },
};

export interface LocalityInfo {
  id: string;
  name: string;
  lat: number;
  lng: number;
  zone: string;
  inGccLimits: boolean;
}

export const CHENNAI_LOCALITIES: LocalityInfo[] = [
  { id: 'loc-anna-nagar', name: 'Anna Nagar', lat: 13.085, lng: 80.2101, zone: 'Central-West', inGccLimits: true },
  { id: 'loc-t-nagar', name: 'T. Nagar', lat: 13.0418, lng: 80.2341, zone: 'Central', inGccLimits: true },
  { id: 'loc-egmore', name: 'Egmore', lat: 13.0732, lng: 80.2609, zone: 'Central', inGccLimits: true },
  { id: 'loc-guindy', name: 'Guindy', lat: 13.0067, lng: 80.2206, zone: 'South-Central', inGccLimits: true },
  { id: 'loc-adyar', name: 'Adyar', lat: 13.0012, lng: 80.2565, zone: 'South-East', inGccLimits: true },
  { id: 'loc-velachery', name: 'Velachery', lat: 12.9791, lng: 80.2212, zone: 'South', inGccLimits: true },
  { id: 'loc-porur', name: 'Porur', lat: 13.0382, lng: 80.1565, zone: 'West', inGccLimits: true },
  { id: 'loc-ambattur', name: 'Ambattur', lat: 13.1143, lng: 80.1548, zone: 'North-West', inGccLimits: true },
  { id: 'loc-avadi', name: 'Avadi', lat: 13.1067, lng: 80.097, zone: 'Outer West (Metro Study Area)', inGccLimits: false },
  { id: 'loc-tambaram', name: 'Tambaram', lat: 12.9249, lng: 80.1, zone: 'Outer South (Metro Study Area)', inGccLimits: false },
  { id: 'loc-omr', name: 'OMR / Perungudi', lat: 12.9654, lng: 80.2461, zone: 'IT Corridor', inGccLimits: true },
  { id: 'loc-sholinganallur', name: 'Sholinganallur (OMR)', lat: 12.901, lng: 80.2279, zone: 'South IT Corridor', inGccLimits: true },
  { id: 'loc-ennore', name: 'Ennore Coastal', lat: 13.2146, lng: 80.3203, zone: 'North Coastal', inGccLimits: true },
  { id: 'loc-tiruvottiyur', name: 'Tiruvottiyur', lat: 13.1643, lng: 80.3001, zone: 'North Coastal', inGccLimits: true },
  { id: 'loc-parrys', name: 'George Town / Parrys', lat: 13.0906, lng: 80.2869, zone: 'North-East Core', inGccLimits: true },
  { id: 'loc-mylapore', name: 'Mylapore / Marina', lat: 13.0368, lng: 80.2676, zone: 'East Coastal', inGccLimits: true },
  { id: 'loc-koyambedu', name: 'Koyambedu', lat: 13.0694, lng: 80.1948, zone: 'West-Central', inGccLimits: true },
  { id: 'loc-pallikaranai', name: 'Pallikaranai', lat: 12.9369, lng: 80.2073, zone: 'South Marsh Basin', inGccLimits: true },
  { id: 'loc-chromepet', name: 'Chromepet', lat: 12.9516, lng: 80.1462, zone: 'South Metro', inGccLimits: false },
  { id: 'loc-perambur', name: 'Perambur', lat: 13.1187, lng: 80.2335, zone: 'North-Central', inGccLimits: true },
];

export const SEEDED_FACILITIES = [
  { id: 'fac-rgggh', name: 'Rajiv Gandhi Govt General Hospital', kind: 'hospital', locality: 'Park Town / Egmore', lat: 13.0816, lng: 80.2772, capacity_note: 'Tertiary Trauma & Emergency Hub (Simulated Ref)' },
  { id: 'fac-royapettah', name: 'Govt Royapettah Hospital', kind: 'hospital', locality: 'Royapettah', lat: 13.0542, lng: 80.2646, capacity_note: 'Central Emergency Care (Simulated Ref)' },
  { id: 'fac-kilpauk', name: 'Kilpauk Medical College Hospital', kind: 'hospital', locality: 'Kilpauk', lat: 13.0786, lng: 80.2433, capacity_note: 'West-Central Medical Hub (Simulated Ref)' },
  { id: 'fac-stanley', name: 'Stanley Medical College Hospital', kind: 'hospital', locality: 'Washermanpet', lat: 13.1066, lng: 80.2874, capacity_note: 'North Chennai Medical Hub (Simulated Ref)' },
  { id: 'fac-velachery-shelter', name: 'Velachery Relief Shelter (Sim)', kind: 'shelter', locality: 'Velachery', lat: 12.9765, lng: 80.2245, capacity_note: 'Simulated Capacity: 420 persons' },
  { id: 'fac-adyar-shelter', name: 'Adyar School Relief Camp (Sim)', kind: 'shelter', locality: 'Adyar', lat: 13.005, lng: 80.2518, capacity_note: 'Simulated Capacity: 300 persons' },
  { id: 'fac-ennore-shelter', name: 'Ennore Coastal Cyclone Shelter (Sim)', kind: 'shelter', locality: 'Ennore', lat: 13.2085, lng: 80.3168, capacity_note: 'Simulated Capacity: 500 persons' },
  { id: 'fac-tambaram-shelter', name: 'Tambaram Transit Relief Hub (Sim)', kind: 'shelter', locality: 'Tambaram', lat: 12.9278, lng: 80.1145, capacity_note: 'Simulated Capacity: 350 persons' },
  { id: 'fac-base-guindy', name: 'Guindy NDRF/State Staging Base', kind: 'rescue_base', locality: 'Guindy', lat: 13.0085, lng: 80.213, capacity_note: 'Primary South-Central Dispatch Depot' },
  { id: 'fac-base-egmore', name: 'Egmore Fire & Rescue HQ Base', kind: 'rescue_base', locality: 'Egmore', lat: 13.0751, lng: 80.2622, capacity_note: 'Central Command Staging Depot' },
  { id: 'fac-base-ambattur', name: 'Ambattur Industrial Rescue Depot', kind: 'rescue_base', locality: 'Ambattur', lat: 13.1098, lng: 80.1635, capacity_note: 'West-North Corridor Staging Depot' },
  { id: 'fac-base-tondiarpet', name: 'Tondiarpet Coastal Response Base', kind: 'rescue_base', locality: 'Tondiarpet', lat: 13.1282, lng: 80.2896, capacity_note: 'North Coastal Staging Depot' },
];

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

interface RawNodeDef {
  id: string;
  name: string;
  locality: string;
  lat: number;
  lng: number;
}

const RAW_NODES: RawNodeDef[] = [
  // North Coastal & North Chennai
  { id: 'N_ENNORE', name: 'Ennore Port Gate Jn', locality: 'Ennore', lat: 13.2146, lng: 80.3203 },
  { id: 'N_ERNAVUR', name: 'Ernavur Bridge Rd', locality: 'Ennore', lat: 13.1912, lng: 80.3088 },
  { id: 'N_MANALI', name: 'Manali Expressway Jn', locality: 'Manali', lat: 13.1685, lng: 80.2652 },
  { id: 'N_TIRUVOTTIYUR', name: 'Tiruvottiyur Theradi Jn', locality: 'Tiruvottiyur', lat: 13.1643, lng: 80.3001 },
  { id: 'N_TONDIARPET', name: 'Tondiarpet High Rd Jn', locality: 'Tondiarpet', lat: 13.1282, lng: 80.2896 },
  { id: 'N_WASHERMANPET', name: 'Washermanpet Mint Jn', locality: 'Washermanpet', lat: 13.1095, lng: 80.2814 },
  { id: 'N_MADHAVARAM', name: 'Madhavaram Roundtana', locality: 'Madhavaram', lat: 13.1488, lng: 80.2314 },
  { id: 'N_MOOLAKADAI', name: 'Moolakadai Junction', locality: 'Perambur', lat: 13.1332, lng: 80.2422 },
  { id: 'N_PERAMBUR', name: 'Perambur Barracks Rd', locality: 'Perambur', lat: 13.1187, lng: 80.2335 },
  { id: 'N_VYASARPADI', name: 'Vyasarpadi Basin Bridge', locality: 'Vyasarpadi', lat: 13.1088, lng: 80.2632 },
  { id: 'N_PARRYS', name: 'Parrys Corner', locality: 'George Town', lat: 13.0906, lng: 80.2869 },
  { id: 'N_HIGHCOURT', name: 'High Court / Beach Stn', locality: 'George Town', lat: 13.0908, lng: 80.2921 },
  { id: 'N_CENTRAL', name: 'Chennai Central / Park Town', locality: 'Park Town', lat: 13.0827, lng: 80.2755 },

  // North-West & Outer West (Avadi / Ambattur / Red Hills corridor)
  { id: 'N_AVADI_W', name: 'Avadi HVF Tank Rd', locality: 'Avadi', lat: 13.1165, lng: 80.0865 },
  { id: 'N_AVADI', name: 'Avadi Bus Terminus Jn', locality: 'Avadi', lat: 13.1067, lng: 80.097 },
  { id: 'N_THIRUMULLAIVOYAL', name: 'Thirumullaivoyal CTH Rd', locality: 'Avadi', lat: 13.1128, lng: 80.1292 },
  { id: 'N_AMBATTUR_OT', name: 'Ambattur OT Junction', locality: 'Ambattur', lat: 13.1143, lng: 80.1548 },
  { id: 'N_AMBATTUR_IE', name: 'Ambattur Industrial Estate', locality: 'Ambattur', lat: 13.0982, lng: 80.1632 },
  { id: 'N_PADI', name: 'Padi Lucas TVS Flyover', locality: 'Padi', lat: 13.0968, lng: 80.1846 },
  { id: 'N_RETTERI', name: 'Retteri Lake Junction', locality: 'Kolathur', lat: 13.1338, lng: 80.1995 },
  { id: 'N_VILLIVAKKAM', name: 'Villivakkam ICF Jn', locality: 'Villivakkam', lat: 13.1052, lng: 80.2094 },

  // Anna Nagar / Koyambedu / Kilpauk / Egmore
  { id: 'N_ANNA_NGR_W', name: 'Anna Nagar West Depot', locality: 'Anna Nagar', lat: 13.0891, lng: 80.1965 },
  { id: 'N_ANNA_NGR_R', name: 'Anna Nagar Roundtana', locality: 'Anna Nagar', lat: 13.085, lng: 80.2101 },
  { id: 'N_THIRUMANGALAM', name: 'Thirumangalam Flyover', locality: 'Anna Nagar', lat: 13.0854, lng: 80.1956 },
  { id: 'N_KOYAMBEDU', name: 'Koyambedu CMBT Jn', locality: 'Koyambedu', lat: 13.0694, lng: 80.1948 },
  { id: 'N_MADURAVOYAL', name: 'Maduravoyal Bypass Jn', locality: 'Maduravoyal', lat: 13.0652, lng: 80.1642 },
  { id: 'N_POONAMALLEE', name: 'Poonamallee Trunk Rd', locality: 'Poonamallee', lat: 13.0473, lng: 80.1045 },
  { id: 'N_AMINJIKARAI', name: 'Aminjikarai Nelson Manickam', locality: 'Aminjikarai', lat: 13.0736, lng: 80.2238 },
  { id: 'N_KILPAUK', name: 'Kilpauk Pachaiyappas Jn', locality: 'Kilpauk', lat: 13.0785, lng: 80.2368 },
  { id: 'N_CHETPET', name: 'Chetpet Signal', locality: 'Chetpet', lat: 13.0721, lng: 80.2448 },
  { id: 'N_EGMORE', name: 'Egmore Station / Pantheon Rd', locality: 'Egmore', lat: 13.0732, lng: 80.2609 },
  { id: 'N_CHINTADRIPET', name: 'Chintadripet / Simpson', locality: 'Chintadripet', lat: 13.0748, lng: 80.2725 },

  // Central Core (Nungambakkam, T Nagar, Kodambakkam, Vadapalani, Royapettah, Mylapore)
  { id: 'N_NUNGAMBAKKAM', name: 'Nungambakkam Valluvar Kottam', locality: 'Nungambakkam', lat: 13.0545, lng: 80.2414 },
  { id: 'N_STERLING', name: 'Sterling Rd / Loyola Jn', locality: 'Nungambakkam', lat: 13.0642, lng: 80.2398 },
  { id: 'N_GEMINI', name: 'Anna Flyover (Gemini Circle)', locality: 'Teynampet', lat: 13.0522, lng: 80.2516 },
  { id: 'N_THOUSAND_LIGHTS', name: 'Thousand Lights Anna Salai', locality: 'Thousand Lights', lat: 13.0596, lng: 80.2577 },
  { id: 'N_EXPRESS_AVE', name: 'Royapettah Clock Tower', locality: 'Royapettah', lat: 13.0548, lng: 80.2645 },
  { id: 'N_LIGHTHOUSE', name: 'Marina Lighthouse Loop', locality: 'Mylapore', lat: 13.0398, lng: 80.2794 },
  { id: 'N_MYLAPORE', name: 'Mylapore Luz Corner', locality: 'Mylapore', lat: 13.0368, lng: 80.2676 },
  { id: 'N_SANTHOME', name: 'Santhome High Rd', locality: 'Santhome', lat: 13.0315, lng: 80.2775 },
  { id: 'N_ALWARPET', name: 'Alwarpet TTK Rd Jn', locality: 'Alwarpet', lat: 13.0335, lng: 80.2528 },
  { id: 'N_TEYNAMPET', name: 'Teynampet Eldams Rd', locality: 'Teynampet', lat: 13.0428, lng: 80.2484 },
  { id: 'N_TNAGAR_PANAGAL', name: 'T. Nagar Panagal Park', locality: 'T. Nagar', lat: 13.0418, lng: 80.2341 },
  { id: 'N_TNAGAR_BUS', name: 'T. Nagar Bus Terminus', locality: 'T. Nagar', lat: 13.0352, lng: 80.2298 },
  { id: 'N_KODAMBAKKAM', name: 'Kodambakkam Bridge', locality: 'Kodambakkam', lat: 13.0518, lng: 80.2242 },
  { id: 'N_VADAPALANI', name: 'Vadapalani 100ft Rd Jn', locality: 'Vadapalani', lat: 13.0501, lng: 80.2121 },
  { id: 'N_ASHOK_PILLAR', name: 'Ashok Pillar Junction', locality: 'Ashok Nagar', lat: 13.0365, lng: 80.2122 },
  { id: 'N_PORUR', name: 'Porur Junction', locality: 'Porur', lat: 13.0382, lng: 80.1565 },
  { id: 'N_VALASARAVAKKAM', name: 'Valasaravakkam Arcot Rd', locality: 'Valasaravakkam', lat: 13.0402, lng: 80.1768 },
  { id: 'N_RAMAPURAM', name: 'Ramapuram Mount Poonamallee', locality: 'Ramapuram', lat: 13.0285, lng: 80.1812 },

  // South-Central & Adyar / Guindy / Velachery
  { id: 'N_SAIDAPET', name: 'Saidapet Maraimalai Bridge', locality: 'Saidapet', lat: 13.0213, lng: 80.2231 },
  { id: 'N_NANDANAM', name: 'Nandanam Signal', locality: 'Nandanam', lat: 13.0315, lng: 80.2412 },
  { id: 'N_KOTTURPURAM', name: 'Kotturpuram Bridge', locality: 'Kotturpuram', lat: 13.0181, lng: 80.2442 },
  { id: 'N_GUINDY_KATHIPARA', name: 'Kathipara Cloverleaf', locality: 'Guindy', lat: 13.0067, lng: 80.2036 },
  { id: 'N_GUINDY_IND', name: 'Guindy Estate / Anna Univ', locality: 'Guindy', lat: 13.0085, lng: 80.2206 },
  { id: 'N_LITTLE_MOUNT', name: 'Little Mount Junction', locality: 'Saidapet', lat: 13.0145, lng: 80.2248 },
  { id: 'N_ADYAR_SIGNAL', name: 'Adyar LB Rd / Madhya Kailash', locality: 'Adyar', lat: 13.0064, lng: 80.2476 },
  { id: 'N_ADYAR_DEPOT', name: 'Adyar Depot / Besant Ave', locality: 'Adyar', lat: 12.9992, lng: 80.2568 },
  { id: 'N_THIRUVANMIYUR', name: 'Thiruvanmiyur Signal', locality: 'Thiruvanmiyur', lat: 12.9858, lng: 80.2598 },
  { id: 'N_TARAMANI', name: 'Taramani TIDEL Park Jn', locality: 'Taramani', lat: 12.9896, lng: 80.2484 },
  { id: 'N_VELACHERY_VIJAYA', name: 'Velachery Vijayanagar Jn', locality: 'Velachery', lat: 12.9791, lng: 80.2212 },
  { id: 'N_VELACHERY_BYPASS', name: 'Velachery Bypass / 100ft Rd', locality: 'Velachery', lat: 12.9862, lng: 80.2244 },
  { id: 'N_VELACHERY_S', name: 'Velachery Kaiveli Junction', locality: 'Velachery', lat: 12.9668, lng: 80.2185 },
  { id: 'N_PERUNGUDI', name: 'Perungudi OMR Toll Plaza', locality: 'Perungudi', lat: 12.9654, lng: 80.2461 },

  // Outer South (Pallikaranai, Medavakkam, Sholinganallur, Chromepet, Tambaram)
  { id: 'N_PALLIKARANAI', name: 'Pallikaranai Radial Rd Jn', locality: 'Pallikaranai', lat: 12.9369, lng: 80.2073 },
  { id: 'N_MEDAVAKKAM', name: 'Medavakkam Koot Rd', locality: 'Medavakkam', lat: 12.9182, lng: 80.1922 },
  { id: 'N_THORAIPAKKAM', name: 'Thoraipakkam 200ft Radial', locality: 'Thoraipakkam', lat: 12.9428, lng: 80.2368 },
  { id: 'N_SHOLINGANALLUR', name: 'Sholinganallur OMR Jn', locality: 'Sholinganallur', lat: 12.901, lng: 80.2279 },
  { id: 'N_ECR_AKKARAI', name: 'Akkarai ECR Junction', locality: 'ECR', lat: 12.9005, lng: 80.2512 },
  { id: 'N_MEENAMBAKKAM', name: 'Meenambakkam Airport GST', locality: 'Meenambakkam', lat: 12.9875, lng: 80.1755 },
  { id: 'N_PALLAVARAM', name: 'Pallavaram Radial Rd Jn', locality: 'Pallavaram', lat: 12.9675, lng: 80.1492 },
  { id: 'N_CHROMEPET', name: 'Chromepet GST Rd', locality: 'Chromepet', lat: 12.9516, lng: 80.1462 },
  { id: 'N_TAMBARAM', name: 'Tambaram Sanatorium / MEPZ', locality: 'Tambaram', lat: 12.9285, lng: 80.1195 },
  { id: 'N_TAMBARAM_FLY', name: 'Tambaram Bypass Clover', locality: 'Tambaram', lat: 12.9249, lng: 80.1 },
  { id: 'N_NANDAMBAKKAM', name: 'Nandambakkam Trade Centre', locality: 'Nandambakkam', lat: 13.0108, lng: 80.1912 },
];

interface RawEdgeDef {
  id: string;
  name: string;
  highway_type: 'trunk' | 'primary' | 'secondary' | 'tertiary';
  u: string;
  v: string;
  speed_kmh: number;
  oneway?: boolean;
  mid?: Array<[number, number]>; // [lat, lng]
}

const RAW_EDGES: RawEdgeDef[] = [
  // North Coastal & Ennore Corridor
  { id: 'E_ENN_ERN', name: 'Ennore High Rd (North)', highway_type: 'primary', u: 'N_ENNORE', v: 'N_ERNAVUR', speed_kmh: 40, mid: [[13.203, 80.314]] },
  { id: 'E_ERN_TIR', name: 'Ennore High Rd (South)', highway_type: 'primary', u: 'N_ERNAVUR', v: 'N_TIRUVOTTIYUR', speed_kmh: 38, mid: [[13.178, 80.304]] },
  { id: 'E_TIR_TON', name: 'Tiruvottiyur High Rd', highway_type: 'primary', u: 'N_TIRUVOTTIYUR', v: 'N_TONDIARPET', speed_kmh: 35, mid: [[13.146, 80.295]] },
  { id: 'E_MAN_TIR', name: 'Manali-Tiruvottiyur Link', highway_type: 'secondary', u: 'N_MANALI', v: 'N_TIRUVOTTIYUR', speed_kmh: 42 },
  { id: 'E_MAN_MAD', name: 'Chennai Outer / Manali Rd', highway_type: 'trunk', u: 'N_MANALI', v: 'N_MADHAVARAM', speed_kmh: 50 },
  { id: 'E_TON_WAS', name: 'Tondiarpet - Washermanpet Rd', highway_type: 'primary', u: 'N_TONDIARPET', v: 'N_WASHERMANPET', speed_kmh: 32 },
  { id: 'E_WAS_PAR', name: 'Mint St / Basin Approach', highway_type: 'secondary', u: 'N_WASHERMANPET', v: 'N_PARRYS', speed_kmh: 28 },
  { id: 'E_WAS_VYA', name: 'Basin Bridge Link', highway_type: 'secondary', u: 'N_WASHERMANPET', v: 'N_VYASARPADI', speed_kmh: 35 },
  { id: 'E_TON_HC', name: 'Ennore Coastal Express (S)', highway_type: 'trunk', u: 'N_TONDIARPET', v: 'N_HIGHCOURT', speed_kmh: 45, mid: [[13.111, 80.294]] },

  // One-way Parrys / George Town loop (realistic urban one-way restrictions)
  { id: 'E_PAR_HC_1W', name: 'NSC Bose Rd (Eastbound One-Way)', highway_type: 'secondary', u: 'N_PARRYS', v: 'N_HIGHCOURT', speed_kmh: 25, oneway: true },
  { id: 'E_HC_CEN_1W', name: 'Rajaji Salai (Southbound One-Way)', highway_type: 'primary', u: 'N_HIGHCOURT', v: 'N_CENTRAL', speed_kmh: 32, oneway: true, mid: [[13.084, 80.289]] },
  { id: 'E_CEN_PAR_1W', name: 'EVR / Mint Loop (Northbound One-Way)', highway_type: 'secondary', u: 'N_CENTRAL', v: 'N_PARRYS', speed_kmh: 28, oneway: true, mid: [[13.087, 80.281]] },
  { id: 'E_PAR_CEN', name: 'Evening Bazaar Rd', highway_type: 'tertiary', u: 'N_PARRYS', v: 'N_CENTRAL', speed_kmh: 24 },

  // Perambur / Madhavaram / North-Central
  { id: 'E_MAD_MOO', name: 'GNT Rd (Madhavaram-Moolakadai)', highway_type: 'trunk', u: 'N_MADHAVARAM', v: 'N_MOOLAKADAI', speed_kmh: 50 },
  { id: 'E_MOO_PER', name: 'Madhavaram High Rd', highway_type: 'primary', u: 'N_MOOLAKADAI', v: 'N_PERAMBUR', speed_kmh: 35 },
  { id: 'E_MOO_VYA', name: 'GNT Rd (Moolakadai-Vyasarpadi)', highway_type: 'primary', u: 'N_MOOLAKADAI', v: 'N_VYASARPADI', speed_kmh: 38 },
  { id: 'E_VYA_CEN', name: 'Walltax / Basin Bridge Rd', highway_type: 'primary', u: 'N_VYASARPADI', v: 'N_CENTRAL', speed_kmh: 30 },
  { id: 'E_PER_VYA', name: 'Perambur High Rd', highway_type: 'secondary', u: 'N_PERAMBUR', v: 'N_VYASARPADI', speed_kmh: 30 },
  { id: 'E_PER_KIL', name: 'Konnor High Rd - Kilpauk', highway_type: 'secondary', u: 'N_PERAMBUR', v: 'N_KILPAUK', speed_kmh: 32, mid: [[13.098, 80.236]] },
  { id: 'E_PER_VIL', name: 'Perambur - Villivakkam Rd', highway_type: 'secondary', u: 'N_PERAMBUR', v: 'N_VILLIVAKKAM', speed_kmh: 32 },

  // West & Outer West (Avadi - Ambattur - Anna Nagar - Koyambedu)
  { id: 'E_AVW_AVA', name: 'CTH Rd (Avadi West)', highway_type: 'primary', u: 'N_AVADI_W', v: 'N_AVADI', speed_kmh: 45 },
  { id: 'E_AVA_THIR', name: 'CTH Rd (Avadi-Thirumullaivoyal)', highway_type: 'primary', u: 'N_AVADI', v: 'N_THIRUMULLAIVOYAL', speed_kmh: 48 },
  { id: 'E_THIR_AMB', name: 'CTH Rd (Ambattur Approach)', highway_type: 'primary', u: 'N_THIRUMULLAIVOYAL', v: 'N_AMBATTUR_OT', speed_kmh: 42 },
  { id: 'E_AMB_RET', name: '200ft Inner Ring (North)', highway_type: 'trunk', u: 'N_AMBATTUR_OT', v: 'N_RETTERI', speed_kmh: 52 },
  { id: 'E_RET_MAD', name: '200ft Inner Ring (Madhavaram)', highway_type: 'trunk', u: 'N_RETTERI', v: 'N_MADHAVARAM', speed_kmh: 55 },
  { id: 'E_AMB_IE', name: 'Ambattur Industrial Estate Rd', highway_type: 'secondary', u: 'N_AMBATTUR_OT', v: 'N_AMBATTUR_IE', speed_kmh: 36 },
  { id: 'E_IE_PADI', name: 'MTH Rd (Ambattur-Padi)', highway_type: 'primary', u: 'N_AMBATTUR_IE', v: 'N_PADI', speed_kmh: 40 },
  { id: 'E_PADI_RET', name: 'Inner Ring (Padi-Retteri)', highway_type: 'trunk', u: 'N_PADI', v: 'N_RETTERI', speed_kmh: 48 },
  { id: 'E_PADI_VIL', name: 'MTH Rd (Padi-Villivakkam)', highway_type: 'primary', u: 'N_PADI', v: 'N_VILLIVAKKAM', speed_kmh: 36 },
  { id: 'E_PADI_ANW', name: 'Padi - Anna Nagar West Link', highway_type: 'secondary', u: 'N_PADI', v: 'N_ANNA_NGR_W', speed_kmh: 38 },
  { id: 'E_AVA_POO', name: 'Avadi - Poonamallee High Link', highway_type: 'secondary', u: 'N_AVADI', v: 'N_POONAMALLEE', speed_kmh: 45, mid: [[13.076, 80.1]] },
  { id: 'E_POO_MAD', name: 'NH48 Chennai-Bangalore Hwy', highway_type: 'trunk', u: 'N_POONAMALLEE', v: 'N_MADURAVOYAL', speed_kmh: 58 },
  { id: 'E_POO_POR', name: 'Mount-Poonamallee High Rd', highway_type: 'primary', u: 'N_POONAMALLEE', v: 'N_PORUR', speed_kmh: 44 },
  { id: 'E_IE_MAD', name: 'Ambattur - Maduravoyal Link', highway_type: 'secondary', u: 'N_AMBATTUR_IE', v: 'N_MADURAVOYAL', speed_kmh: 42 },

  // Anna Nagar / Koyambedu / Poonamallee High Rd (EVR Periyar Salai)
  { id: 'E_ANW_THM', name: 'Anna Nagar 2nd Ave (West)', highway_type: 'secondary', u: 'N_ANNA_NGR_W', v: 'N_THIRUMANGALAM', speed_kmh: 35 },
  { id: 'E_THM_ANR', name: 'Anna Nagar 2nd Ave (East)', highway_type: 'primary', u: 'N_THIRUMANGALAM', v: 'N_ANNA_NGR_R', speed_kmh: 36 },
  { id: 'E_THM_KOY', name: '100ft Rd (Thirumangalam-Koyambedu)', highway_type: 'trunk', u: 'N_THIRUMANGALAM', v: 'N_KOYAMBEDU', speed_kmh: 48 },
  { id: 'E_MAD_KOY', name: 'EVR Salai (Maduravoyal-Koyambedu)', highway_type: 'trunk', u: 'N_MADURAVOYAL', v: 'N_KOYAMBEDU', speed_kmh: 50 },
  { id: 'E_ANR_VIL', name: 'New Avadi Rd (Anna Nagar-Villivakkam)', highway_type: 'secondary', u: 'N_ANNA_NGR_R', v: 'N_VILLIVAKKAM', speed_kmh: 34 },
  { id: 'E_ANR_AMI', name: 'EVR Salai (Anna Nagar-Aminjikarai)', highway_type: 'primary', u: 'N_ANNA_NGR_R', v: 'N_AMINJIKARAI', speed_kmh: 36 },
  { id: 'E_KOY_AMI', name: 'PH Rd (Koyambedu-Aminjikarai)', highway_type: 'primary', u: 'N_KOYAMBEDU', v: 'N_AMINJIKARAI', speed_kmh: 40 },
  { id: 'E_AMI_KIL', name: 'PH Rd (Aminjikarai-Kilpauk)', highway_type: 'primary', u: 'N_AMINJIKARAI', v: 'N_KILPAUK', speed_kmh: 38 },
  { id: 'E_KIL_CHET', name: 'PH Rd (Kilpauk-Chetpet)', highway_type: 'primary', u: 'N_KILPAUK', v: 'N_CHETPET', speed_kmh: 36 },
  { id: 'E_CHET_EGM', name: 'PH Rd (Chetpet-Egmore)', highway_type: 'primary', u: 'N_CHETPET', v: 'N_EGMORE', speed_kmh: 35 },
  { id: 'E_EGM_CHI', name: 'Pantheon - Chintadripet Rd', highway_type: 'secondary', u: 'N_EGMORE', v: 'N_CHINTADRIPET', speed_kmh: 30 },
  { id: 'E_CHI_CEN', name: 'Anna Salai North (Chintadripet-Central)', highway_type: 'primary', u: 'N_CHINTADRIPET', v: 'N_CENTRAL', speed_kmh: 34 },
  { id: 'E_EGM_CEN', name: 'EVR Salai (Egmore-Central)', highway_type: 'primary', u: 'N_EGMORE', v: 'N_CENTRAL', speed_kmh: 35 },

  // Central Corridor + Parallel Multi-Edges + One-Way Urban Loops
  { id: 'E_AMI_NUN', name: 'Nelson Manickam - Nungambakkam Rd', highway_type: 'secondary', u: 'N_AMINJIKARAI', v: 'N_NUNGAMBAKKAM', speed_kmh: 32, mid: [[13.065, 80.231]] },
  { id: 'E_CHET_STE', name: 'Harrington Rd - Sterling Rd', highway_type: 'secondary', u: 'N_CHETPET', v: 'N_STERLING', speed_kmh: 32 },
  { id: 'E_STE_NUN_1W', name: 'Valluvar Kottam High Rd (S One-Way)', highway_type: 'secondary', u: 'N_STERLING', v: 'N_NUNGAMBAKKAM', speed_kmh: 28, oneway: true },
  { id: 'E_NUN_GEM_1W', name: 'Nungambakkam High Rd (E One-Way)', highway_type: 'primary', u: 'N_NUNGAMBAKKAM', v: 'N_GEMINI', speed_kmh: 32, oneway: true },
  { id: 'E_GEM_THL_1W', name: 'Anna Salai Service (N One-Way)', highway_type: 'primary', u: 'N_GEMINI', v: 'N_THOUSAND_LIGHTS', speed_kmh: 36, oneway: true },
  { id: 'E_THL_STE_1W', name: 'Greams / College Rd (W One-Way)', highway_type: 'secondary', u: 'N_THOUSAND_LIGHTS', v: 'N_STERLING', speed_kmh: 30, oneway: true },
  { id: 'E_EGM_THL', name: 'Whites / Pantheon Link', highway_type: 'secondary', u: 'N_EGMORE', v: 'N_THOUSAND_LIGHTS', speed_kmh: 32 },
  { id: 'E_THL_EXP', name: 'Whites Rd - Royapettah', highway_type: 'secondary', u: 'N_THOUSAND_LIGHTS', v: 'N_EXPRESS_AVE', speed_kmh: 30 },
  { id: 'E_CHI_EXP', name: 'Triplicane High Rd', highway_type: 'secondary', u: 'N_CHINTADRIPET', v: 'N_EXPRESS_AVE', speed_kmh: 28, mid: [[13.066, 80.273]] },
  { id: 'E_CEN_MAR', name: 'Kamarajar Salai (Marina North)', highway_type: 'trunk', u: 'N_CENTRAL', v: 'N_LIGHTHOUSE', speed_kmh: 48, mid: [[13.063, 80.285]] },
  { id: 'E_EXP_LIG', name: 'Lloyds / Avvai Shanmugam Salai', highway_type: 'secondary', u: 'N_EXPRESS_AVE', v: 'N_LIGHTHOUSE', speed_kmh: 32 },
  { id: 'E_EXP_MYL', name: 'Royapettah High Rd', highway_type: 'primary', u: 'N_EXPRESS_AVE', v: 'N_MYLAPORE', speed_kmh: 32 },
  { id: 'E_LIG_SAN', name: 'Marina Coastal (Santhome)', highway_type: 'primary', u: 'N_LIGHTHOUSE', v: 'N_SANTHOME', speed_kmh: 40 },
  { id: 'E_MYL_SAN', name: 'Kutchery Rd', highway_type: 'secondary', u: 'N_MYLAPORE', v: 'N_SANTHOME', speed_kmh: 28 },
  { id: 'E_MYL_ALW', name: 'Luz Church - Alwarpet Rd', highway_type: 'secondary', u: 'N_MYLAPORE', v: 'N_ALWARPET', speed_kmh: 30 },
  { id: 'E_GEM_TEY', name: 'Anna Salai Main (Gemini-Teynampet)', highway_type: 'trunk', u: 'N_GEMINI', v: 'N_TEYNAMPET', speed_kmh: 45 },
  // Parallel edge on Anna Salai (flyover vs ground lane for DAA parallel-edge validation!)
  { id: 'E_GEM_TEY_FLY', name: 'Anna Flyover Express Lane', highway_type: 'trunk', u: 'N_GEMINI', v: 'N_TEYNAMPET', speed_kmh: 55 },
  { id: 'E_TEY_ALW', name: 'Eldams Rd', highway_type: 'secondary', u: 'N_TEYNAMPET', v: 'N_ALWARPET', speed_kmh: 32 },
  { id: 'E_TEY_NAN', name: 'Anna Salai (Teynampet-Nandanam)', highway_type: 'trunk', u: 'N_TEYNAMPET', v: 'N_NANDANAM', speed_kmh: 45 },
  { id: 'E_ALW_KOT', name: 'Chamiers / Boat Club Rd', highway_type: 'secondary', u: 'N_ALWARPET', v: 'N_KOTTURPURAM', speed_kmh: 34 },
  { id: 'E_SAN_ADY', name: 'Santhome - Foreshore - Adyar Bridge', highway_type: 'primary', u: 'N_SANTHOME', v: 'N_ADYAR_SIGNAL', speed_kmh: 40, mid: [[13.018, 80.271]] },

  // T Nagar / Kodambakkam / Vadapalani / Porur
  { id: 'E_NUN_TNP', name: 'Valluvar Kottam - Panagal Park', highway_type: 'secondary', u: 'N_NUNGAMBAKKAM', v: 'N_TNAGAR_PANAGAL', speed_kmh: 30 },
  { id: 'E_TEY_TNP', name: 'GN Chetty Rd', highway_type: 'primary', u: 'N_TEYNAMPET', v: 'N_TNAGAR_PANAGAL', speed_kmh: 34 },
  { id: 'E_TNP_TNB', name: 'Usman Rd (T. Nagar)', highway_type: 'secondary', u: 'N_TNAGAR_PANAGAL', v: 'N_TNAGAR_BUS', speed_kmh: 24 },
  { id: 'E_TNB_NAN', name: 'South Boag / Burkit Rd', highway_type: 'secondary', u: 'N_TNAGAR_BUS', v: 'N_NANDANAM', speed_kmh: 28 },
  { id: 'E_TNB_SAI', name: 'South Usman - Saidapet Rd', highway_type: 'secondary', u: 'N_TNAGAR_BUS', v: 'N_SAIDAPET', speed_kmh: 30 },
  { id: 'E_TNP_KOD', name: 'Kodambakkam High Rd', highway_type: 'primary', u: 'N_TNAGAR_PANAGAL', v: 'N_KODAMBAKKAM', speed_kmh: 32 },
  { id: 'E_AMI_KOD', name: 'Choolaimedu High Rd', highway_type: 'secondary', u: 'N_AMINJIKARAI', v: 'N_KODAMBAKKAM', speed_kmh: 30 },
  { id: 'E_KOD_VAD', name: 'Arcot Rd (Kodambakkam-Vadapalani)', highway_type: 'primary', u: 'N_KODAMBAKKAM', v: 'N_VADAPALANI', speed_kmh: 34 },
  { id: 'E_KOY_VAD', name: '100ft Inner Ring (Koyambedu-Vadapalani)', highway_type: 'trunk', u: 'N_KOYAMBEDU', v: 'N_VADAPALANI', speed_kmh: 48 },
  { id: 'E_VAD_ASH', name: '100ft Inner Ring (Vadapalani-Ashok Pillar)', highway_type: 'trunk', u: 'N_VADAPALANI', v: 'N_ASHOK_PILLAR', speed_kmh: 46 },
  { id: 'E_ASH_TNB', name: 'K.K. Nagar - Mambalam Link', highway_type: 'secondary', u: 'N_ASHOK_PILLAR', v: 'N_TNAGAR_BUS', speed_kmh: 32 },
  { id: 'E_VAD_VAL', name: 'Arcot Rd (Vadapalani-Valasaravakkam)', highway_type: 'primary', u: 'N_VADAPALANI', v: 'N_VALASARAVAKKAM', speed_kmh: 38 },
  { id: 'E_VAL_POR', name: 'Arcot Rd (Valasaravakkam-Porur)', highway_type: 'primary', u: 'N_VALASARAVAKKAM', v: 'N_PORUR', speed_kmh: 40 },
  { id: 'E_MAD_POR', name: 'Chennai Bypass (Maduravoyal-Porur)', highway_type: 'trunk', u: 'N_MADURAVOYAL', v: 'N_PORUR', speed_kmh: 58 },
  { id: 'E_POR_RAM', name: 'Mount-Poonamallee (Porur-Ramapuram)', highway_type: 'primary', u: 'N_PORUR', v: 'N_RAMAPURAM', speed_kmh: 40 },
  { id: 'E_RAM_NANB', name: 'Mount-Poonamallee (Ramapuram-Nandambakkam)', highway_type: 'primary', u: 'N_RAMAPURAM', v: 'N_NANDAMBAKKAM', speed_kmh: 42 },
  { id: 'E_NANB_KAT', name: 'Mount-Poonamallee (Kathipara Approach)', highway_type: 'trunk', u: 'N_NANDAMBAKKAM', v: 'N_GUINDY_KATHIPARA', speed_kmh: 48 },
  { id: 'E_ASH_KAT', name: '100ft Inner Ring (Ashok Pillar-Kathipara)', highway_type: 'trunk', u: 'N_ASHOK_PILLAR', v: 'N_GUINDY_KATHIPARA', speed_kmh: 48, mid: [[13.021, 80.207]] },

  // Guindy / Saidapet / Adyar / Velachery / OMR
  { id: 'E_NAN_SAI', name: 'Anna Salai (Nandanam-Saidapet)', highway_type: 'trunk', u: 'N_NANDANAM', v: 'N_SAIDAPET', speed_kmh: 45 },
  { id: 'E_SAI_LIT', name: 'Anna Salai (Saidapet-Little Mount)', highway_type: 'trunk', u: 'N_SAIDAPET', v: 'N_LITTLE_MOUNT', speed_kmh: 45 },
  { id: 'E_LIT_GUI', name: 'Sardar Patel / Guindy Link', highway_type: 'primary', u: 'N_LITTLE_MOUNT', v: 'N_GUINDY_IND', speed_kmh: 42 },
  { id: 'E_KAT_GUI', name: 'GST / Anna Salai (Kathipara-Guindy)', highway_type: 'trunk', u: 'N_GUINDY_KATHIPARA', v: 'N_GUINDY_IND', speed_kmh: 50 },
  { id: 'E_KOT_LIT', name: 'River View / Gandhi Mandapam Rd', highway_type: 'secondary', u: 'N_KOTTURPURAM', v: 'N_LITTLE_MOUNT', speed_kmh: 36 },
  { id: 'E_KOT_ADY', name: 'Sardar Patel Rd (Kotturpuram-Adyar)', highway_type: 'primary', u: 'N_KOTTURPURAM', v: 'N_ADYAR_SIGNAL', speed_kmh: 42 },
  { id: 'E_GUI_ADY', name: 'Sardar Patel Rd (Guindy-Madhya Kailash)', highway_type: 'trunk', u: 'N_GUINDY_IND', v: 'N_ADYAR_SIGNAL', speed_kmh: 48 },
  { id: 'E_ADY_DEP', name: 'LB Rd (Adyar Signal-Depot)', highway_type: 'primary', u: 'N_ADYAR_SIGNAL', v: 'N_ADYAR_DEPOT', speed_kmh: 36 },
  { id: 'E_DEP_THV', name: 'LB Rd (Adyar-Thiruvanmiyur)', highway_type: 'primary', u: 'N_ADYAR_DEPOT', v: 'N_THIRUVANMIYUR', speed_kmh: 38 },
  { id: 'E_ADY_TAR', name: 'OMR Rajiv Gandhi Salai (Adyar-Taramani)', highway_type: 'trunk', u: 'N_ADYAR_SIGNAL', v: 'N_TARAMANI', speed_kmh: 52 },
  { id: 'E_TAR_THV', name: 'Taramani - Thiruvanmiyur Link', highway_type: 'secondary', u: 'N_TARAMANI', v: 'N_THIRUVANMIYUR', speed_kmh: 36 },
  { id: 'E_TAR_VELB', name: 'Taramani Link Rd (Westbound)', highway_type: 'primary', u: 'N_TARAMANI', v: 'N_VELACHERY_BYPASS', speed_kmh: 42 },
  { id: 'E_GUI_VELB', name: 'Velachery Main Rd (Guindy-Bypass)', highway_type: 'primary', u: 'N_GUINDY_IND', v: 'N_VELACHERY_BYPASS', speed_kmh: 38 },
  { id: 'E_VELB_VIJ', name: 'Velachery 100ft Bypass Rd', highway_type: 'primary', u: 'N_VELACHERY_BYPASS', v: 'N_VELACHERY_VIJAYA', speed_kmh: 36 },
  { id: 'E_VIJ_TAR', name: 'Velachery - Taramani 100ft Rd', highway_type: 'primary', u: 'N_VELACHERY_VIJAYA', v: 'N_TARAMANI', speed_kmh: 40 },
  { id: 'E_VIJ_VELS', name: 'Velachery Main Rd (South)', highway_type: 'primary', u: 'N_VELACHERY_VIJAYA', v: 'N_VELACHERY_S', speed_kmh: 34 },
  { id: 'E_TAR_PER', name: 'OMR (Taramani-Perungudi)', highway_type: 'trunk', u: 'N_TARAMANI', v: 'N_PERUNGUDI', speed_kmh: 55 },
  { id: 'E_VELS_PER', name: 'Velachery - Perungudi Marsh Link', highway_type: 'secondary', u: 'N_VELACHERY_S', v: 'N_PERUNGUDI', speed_kmh: 35 },

  // South Metro, GST Rd, Pallikaranai, Tambaram, OMR South
  { id: 'E_VELS_PAL', name: 'Velachery-Tambaram Rd (Pallikaranai)', highway_type: 'primary', u: 'N_VELACHERY_S', v: 'N_PALLIKARANAI', speed_kmh: 38 },
  { id: 'E_PAL_MED', name: 'Velachery-Tambaram Rd (Medavakkam)', highway_type: 'primary', u: 'N_PALLIKARANAI', v: 'N_MEDAVAKKAM', speed_kmh: 40 },
  { id: 'E_PAL_THO', name: '200ft Radial Rd (Pallikaranai-Thoraipakkam)', highway_type: 'trunk', u: 'N_PALLIKARANAI', v: 'N_THORAIPAKKAM', speed_kmh: 52 },
  { id: 'E_PER_THO', name: 'OMR (Perungudi-Thoraipakkam)', highway_type: 'trunk', u: 'N_PERUNGUDI', v: 'N_THORAIPAKKAM', speed_kmh: 55 },
  { id: 'E_THO_SHO', name: 'OMR (Thoraipakkam-Sholinganallur)', highway_type: 'trunk', u: 'N_THORAIPAKKAM', v: 'N_SHOLINGANALLUR', speed_kmh: 56 },
  { id: 'E_MED_SHO', name: 'Medavakkam - Sholinganallur Link', highway_type: 'primary', u: 'N_MEDAVAKKAM', v: 'N_SHOLINGANALLUR', speed_kmh: 45 },
  { id: 'E_THV_AKK', name: 'East Coast Rd (ECR Coastal)', highway_type: 'trunk', u: 'N_THIRUVANMIYUR', v: 'N_ECR_AKKARAI', speed_kmh: 55, mid: [[12.942, 80.258]] },
  { id: 'E_SHO_AKK', name: 'Sholinganallur - Akkarai ECR Link', highway_type: 'secondary', u: 'N_SHOLINGANALLUR', v: 'N_ECR_AKKARAI', speed_kmh: 42 },
  { id: 'E_KAT_MEE', name: 'GST Rd (Kathipara-Meenambakkam)', highway_type: 'trunk', u: 'N_GUINDY_KATHIPARA', v: 'N_MEENAMBAKKAM', speed_kmh: 55 },
  { id: 'E_MEE_PAL', name: 'GST Rd (Airport-Pallavaram)', highway_type: 'trunk', u: 'N_MEENAMBAKKAM', v: 'N_PALLAVARAM', speed_kmh: 52 },
  { id: 'E_PAL_PALLI', name: 'Pallavaram - Thoraipakkam Radial Rd', highway_type: 'trunk', u: 'N_PALLAVARAM', v: 'N_PALLIKARANAI', speed_kmh: 54, mid: [[12.948, 80.178]] },
  { id: 'E_PAL_CHR', name: 'GST Rd (Pallavaram-Chromepet)', highway_type: 'trunk', u: 'N_PALLAVARAM', v: 'N_CHROMEPET', speed_kmh: 50 },
  { id: 'E_CHR_TAM', name: 'GST Rd (Chromepet-Tambaram)', highway_type: 'trunk', u: 'N_CHROMEPET', v: 'N_TAMBARAM', speed_kmh: 48 },
  { id: 'E_TAM_MED', name: 'Velachery-Tambaram Rd (East)', highway_type: 'primary', u: 'N_TAMBARAM', v: 'N_MEDAVAKKAM', speed_kmh: 44, mid: [[12.922, 80.155]] },
  { id: 'E_TAM_TBF', name: 'Tambaram Station - Bypass', highway_type: 'primary', u: 'N_TAMBARAM', v: 'N_TAMBARAM_FLY', speed_kmh: 46 },
  { id: 'E_POR_TBF', name: 'Chennai Outer Bypass (Porur-Tambaram)', highway_type: 'trunk', u: 'N_PORUR', v: 'N_TAMBARAM_FLY', speed_kmh: 60, mid: [[12.992, 80.118], [12.952, 80.105]] },
];

export function buildChennaiRoadNetwork(): { nodes: RoadNode[]; edges: RoadEdge[] } {
  const nodeMap = new Map<string, RoadNode>();
  const nodes: RoadNode[] = RAW_NODES.map((n, idx) => {
    const node: RoadNode = {
      id: n.id,
      source_osm_id: `osm_node_${900100 + idx}`,
      name: n.name,
      locality: n.locality,
      lat: n.lat,
      lng: n.lng,
    };
    nodeMap.set(node.id, node);
    return node;
  });

  const edges: RoadEdge[] = [];
  RAW_EDGES.forEach((e, idx) => {
    const src = nodeMap.get(e.u);
    const dst = nodeMap.get(e.v);
    if (!src || !dst) {
      throw new Error(`Invalid road edge endpoints: ${e.id} (${e.u} -> ${e.v})`);
    }

    const waypointsLatLng: Array<[number, number]> = [
      [src.lat, src.lng],
      ...(e.mid || []),
      [dst.lat, dst.lng],
    ];

    let lengthM = 0;
    for (let i = 0; i < waypointsLatLng.length - 1; i++) {
      lengthM += haversineMeters(
        waypointsLatLng[i][0],
        waypointsLatLng[i][1],
        waypointsLatLng[i + 1][0],
        waypointsLatLng[i + 1][1]
      );
    }
    const roundedLen = Math.round(lengthM * 10) / 10;
    const speedMps = (e.speed_kmh * 1000) / 3600;
    const travelTimeS = Math.round((roundedLen / speedMps) * 10) / 10;
    const coordsLngLat = waypointsLatLng.map(([lat, lng]) => [lng, lat]);
    const osmWayId = `osm_way_${700100 + idx}`;

    // Forward directed edge
    edges.push({
      id: e.id,
      osm_way_id: osmWayId,
      name: e.name,
      highway_type: e.highway_type,
      source_node_id: e.u,
      target_node_id: e.v,
      geometry_json: JSON.stringify(coordsLngLat),
      length_m: roundedLen,
      speed_kmh: e.speed_kmh,
      travel_time_s: travelTimeS,
      is_oneway: e.oneway ? 1 : 0,
      speed_is_assumed: 1,
    });

    // Reverse directed edge if bidirectional
    if (!e.oneway) {
      edges.push({
        id: `${e.id}_REV`,
        osm_way_id: osmWayId,
        name: e.name,
        highway_type: e.highway_type,
        source_node_id: e.v,
        target_node_id: e.u,
        geometry_json: JSON.stringify([...coordsLngLat].reverse()),
        length_m: roundedLen,
        speed_kmh: e.speed_kmh,
        travel_time_s: travelTimeS,
        is_oneway: 0,
        speed_is_assumed: 1,
      });
    }
  });

  return { nodes, edges };
}

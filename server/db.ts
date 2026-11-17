import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

let dbInstance: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (dbInstance) {
    return dbInstance;
  }

  const dbPath = process.env.DATABASE_PATH || path.resolve(process.cwd(), 'resqgrid.db');
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  runMigrations(db);
  dbInstance = db;
  return db;
}

export function createInMemoryDbForTest(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  runMigrations(db);
  return db;
}

export function runMigrations(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set<number>(
    (db.prepare('SELECT version FROM schema_migrations').all() as Array<{ version: number }>).map(
      (r) => r.version
    )
  );

  const migrations: Array<{ version: number; name: string; sql: string }> = [
    {
      version: 1,
      name: 'initial_resqgrid_schema',
      sql: `
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          display_name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('admin', 'dispatcher', 'viewer')),
          is_active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS disaster_scenarios (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT NOT NULL,
          type TEXT NOT NULL,
          subarea TEXT NOT NULL DEFAULT 'chennai_metro_study_area',
          is_active INTEGER NOT NULL DEFAULT 0,
          simulation_seed INTEGER NOT NULL DEFAULT 20251101,
          closure_version INTEGER NOT NULL DEFAULT 1,
          is_seeded INTEGER NOT NULL DEFAULT 0,
          created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS road_nodes (
          id TEXT PRIMARY KEY,
          source_osm_id TEXT NOT NULL,
          name TEXT NOT NULL,
          locality TEXT NOT NULL,
          lat REAL NOT NULL,
          lng REAL NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_road_nodes_coords ON road_nodes(lat, lng);

        CREATE TABLE IF NOT EXISTS road_edges (
          id TEXT PRIMARY KEY,
          osm_way_id TEXT NOT NULL,
          name TEXT NOT NULL,
          highway_type TEXT NOT NULL,
          source_node_id TEXT NOT NULL REFERENCES road_nodes(id) ON DELETE CASCADE,
          target_node_id TEXT NOT NULL REFERENCES road_nodes(id) ON DELETE CASCADE,
          geometry_json TEXT NOT NULL,
          length_m REAL NOT NULL CHECK (length_m >= 0),
          speed_kmh REAL NOT NULL CHECK (speed_kmh > 0),
          travel_time_s REAL NOT NULL CHECK (travel_time_s >= 0),
          is_oneway INTEGER NOT NULL DEFAULT 0,
          speed_is_assumed INTEGER NOT NULL DEFAULT 1
        );

        CREATE INDEX IF NOT EXISTS idx_road_edges_source ON road_edges(source_node_id);
        CREATE INDEX IF NOT EXISTS idx_road_edges_target ON road_edges(target_node_id);

        CREATE TABLE IF NOT EXISTS scenario_road_closures (
          id TEXT PRIMARY KEY,
          scenario_id TEXT NOT NULL REFERENCES disaster_scenarios(id) ON DELETE CASCADE,
          road_edge_id TEXT NOT NULL REFERENCES road_edges(id) ON DELETE CASCADE,
          override_status TEXT NOT NULL CHECK (override_status IN ('open', 'restricted', 'blocked')),
          reason TEXT NOT NULL DEFAULT '',
          updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(scenario_id, road_edge_id)
        );

        CREATE INDEX IF NOT EXISTS idx_closures_scenario ON scenario_road_closures(scenario_id);

        CREATE TABLE IF NOT EXISTS incidents (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          category TEXT NOT NULL,
          severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
          lat REAL NOT NULL,
          lng REAL NOT NULL,
          locality TEXT NOT NULL DEFAULT 'Chennai Study Area',
          affected_people_estimate INTEGER NOT NULL DEFAULT 1 CHECK (affected_people_estimate >= 0),
          required_capabilities_json TEXT NOT NULL DEFAULT '["general_rescue"]',
          requested_teams INTEGER NOT NULL DEFAULT 1 CHECK (requested_teams >= 1),
          verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified', 'verified', 'rejected')),
          status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'assigned', 'resolved', 'closed')),
          reporter_name TEXT,
          reporter_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          scenario_id TEXT NOT NULL REFERENCES disaster_scenarios(id) ON DELETE CASCADE,
          is_simulated INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_incidents_scenario ON incidents(scenario_id);
        CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity);

        CREATE TABLE IF NOT EXISTS rescue_teams (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          category TEXT NOT NULL,
          capabilities_json TEXT NOT NULL DEFAULT '["general_rescue"]',
          vehicle_mode TEXT NOT NULL DEFAULT 'rescue_truck',
          home_base_name TEXT NOT NULL,
          base_lat REAL NOT NULL,
          base_lng REAL NOT NULL,
          current_lat REAL NOT NULL,
          current_lng REAL NOT NULL,
          personnel_count INTEGER NOT NULL DEFAULT 4 CHECK (personnel_count >= 1),
          capacity INTEGER NOT NULL DEFAULT 6 CHECK (capacity >= 1),
          status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'assigned', 'en_route', 'on_scene', 'offline')),
          shift_available INTEGER NOT NULL DEFAULT 1,
          scenario_id TEXT NOT NULL REFERENCES disaster_scenarios(id) ON DELETE CASCADE,
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_teams_scenario ON rescue_teams(scenario_id);

        CREATE TABLE IF NOT EXISTS rescue_assignments (
          id TEXT PRIMARY KEY,
          scenario_id TEXT NOT NULL REFERENCES disaster_scenarios(id) ON DELETE CASCADE,
          incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
          team_id TEXT NOT NULL REFERENCES rescue_teams(id) ON DELETE CASCADE,
          status TEXT NOT NULL CHECK (status IN ('proposed', 'approved', 'dispatched', 'en_route', 'arrived', 'completed', 'cancelled')),
          algorithm_source TEXT NOT NULL DEFAULT 'mcmf',
          proposed_route_json TEXT NOT NULL DEFAULT '{}',
          cost REAL NOT NULL DEFAULT 0,
          distance_m REAL NOT NULL DEFAULT 0,
          travel_time_s REAL NOT NULL DEFAULT 0,
          approved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_assignments_scenario ON rescue_assignments(scenario_id);
        CREATE INDEX IF NOT EXISTS idx_assignments_team ON rescue_assignments(team_id);

        CREATE TABLE IF NOT EXISTS algorithm_runs (
          id TEXT PRIMARY KEY,
          scenario_id TEXT REFERENCES disaster_scenarios(id) ON DELETE CASCADE,
          graph_version TEXT NOT NULL,
          closure_version INTEGER NOT NULL DEFAULT 1,
          algorithm_name TEXT NOT NULL,
          parameters_json TEXT NOT NULL DEFAULT '{}',
          input_metadata_json TEXT NOT NULL DEFAULT '{}',
          results_json TEXT NOT NULL DEFAULT '{}',
          runtime_ms REAL,
          memory_bytes INTEGER,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_algo_runs_scenario ON algorithm_runs(scenario_id);

        CREATE TABLE IF NOT EXISTS audit_logs (
          id TEXT PRIMARY KEY,
          actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          actor_name TEXT NOT NULL DEFAULT 'System',
          action TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          metadata_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);

        CREATE TABLE IF NOT EXISTS volunteers (
          id TEXT PRIMARY KEY,
          display_name TEXT NOT NULL,
          locality TEXT NOT NULL,
          capabilities_json TEXT NOT NULL DEFAULT '["first_aid"]',
          availability_status TEXT NOT NULL DEFAULT 'available' CHECK (availability_status IN ('available', 'standby', 'unavailable')),
          scenario_id TEXT NOT NULL REFERENCES disaster_scenarios(id) ON DELETE CASCADE,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS shelters_hospitals (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          kind TEXT NOT NULL CHECK (kind IN ('hospital', 'shelter', 'rescue_base')),
          locality TEXT NOT NULL,
          lat REAL NOT NULL,
          lng REAL NOT NULL,
          capacity_note TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS system_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `,
    },
  ];

  for (const m of migrations) {
    if (!applied.has(m.version)) {
      db.exec('BEGIN;');
      try {
        db.exec(m.sql);
        db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(
          m.version,
          m.name
        );
        db.exec('COMMIT;');
      } catch (err) {
        db.exec('ROLLBACK;');
        throw err;
      }
    }
  }
}

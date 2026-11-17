import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { Router, type Response } from 'express';
import { runReproducibleBenchmarkSuite } from './algorithms/benchmark.ts';
import {
  buildFeasibleRouteMatrix,
  prepareDispatchInputs,
  runGreedyDispatch,
  runMcmfDispatch,
} from './algorithms/dispatch.ts';
import { getGraphSnapshot, invalidateGraphCache, snapToNearestNode } from './algorithms/graph.ts';
import { runAStar, runDijkstra } from './algorithms/shortestPath.ts';
import { runBFS, runDFS } from './algorithms/traversal.ts';
import {
  hashPassword,
  optionalAuth,
  requireAuth,
  requireRole,
  signAuthToken,
  verifyPassword,
  type AuthenticatedRequest,
} from './auth.ts';
import { CHENNAI_LOCALITIES, GRAPH_NETWORK_VERSION, STUDY_AREA_METADATA } from './chennaiNetwork.ts';
import { broadcastEvent, registerSseClient, removeSseClient } from './events.ts';
import { resetScenarioToSeed } from './seed.ts';
import type {
  AssignmentStatus,
  CostMode,
  DisasterScenario,
  IncidentRecord,
  IncidentSeverity,
  RescueAssignmentRecord,
  RescueTeamRecord,
  RoadClosureStatus,
  UserRole,
} from './types.ts';

function getRestrictedMultiplier(db: DatabaseSync): number {
  const row = db
    .prepare("SELECT value FROM system_settings WHERE key = 'restricted_multiplier'")
    .get() as { value: string } | undefined;
  const parsed = row ? Number(row.value) : 2.5;
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 2.5;
}

function getActiveScenario(db: DatabaseSync, scenarioId?: string): DisasterScenario | undefined {
  if (scenarioId) {
    return db.prepare('SELECT * FROM disaster_scenarios WHERE id = ?').get(scenarioId) as
      | DisasterScenario
      | undefined;
  }
  return (
    (db.prepare('SELECT * FROM disaster_scenarios WHERE is_active = 1 LIMIT 1').get() as
      | DisasterScenario
      | undefined) ||
    (db.prepare('SELECT * FROM disaster_scenarios ORDER BY created_at ASC LIMIT 1').get() as
      | DisasterScenario
      | undefined)
  );
}

function writeAudit(
  db: DatabaseSync,
  req: AuthenticatedRequest,
  action: string,
  entityType: string,
  entityId: string,
  metadata: Record<string, unknown> = {}
): void {
  db.prepare(
    `INSERT INTO audit_logs (id, actor_id, actor_name, action, entity_type, entity_id, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    randomUUID(),
    req.user?.sub ?? null,
    req.user?.displayName ?? 'Citizen / Public',
    action,
    entityType,
    entityId,
    JSON.stringify(metadata)
  );
}

const VALID_ASSIGNMENT_TRANSITIONS: Record<AssignmentStatus, AssignmentStatus[]> = {
  proposed: ['approved', 'cancelled'],
  approved: ['dispatched', 'cancelled'],
  dispatched: ['en_route', 'cancelled'],
  en_route: ['arrived', 'cancelled'],
  arrived: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function createApiRouter(db: DatabaseSync): Router {
  const router = Router();
  router.use(optionalAuth);

  // ==========================================
  // 1. HEALTH, METADATA & SSE
  // ==========================================
  router.get('/health', (_req, res) => {
    const nodesCount = (db.prepare('SELECT COUNT(*) as c FROM road_nodes').get() as { c: number }).c;
    const edgesCount = (db.prepare('SELECT COUNT(*) as c FROM road_edges').get() as { c: number }).c;
    const active = getActiveScenario(db);
    res.json({
      status: 'ok',
      service: 'RESQGRID Command API',
      academicSimulationOnly: true,
      networkVersion: GRAPH_NETWORK_VERSION,
      roadNodes: nodesCount,
      roadEdges: edgesCount,
      activeScenarioId: active?.id ?? null,
      closureVersion: active?.closure_version ?? null,
      timestamp: new Date().toISOString(),
    });
  });

  router.get('/study-area', (_req, res) => {
    const multiplier = getRestrictedMultiplier(db);
    res.json({
      ...STUDY_AREA_METADATA,
      restrictedMultiplier: multiplier,
      localities: CHENNAI_LOCALITIES,
    });
  });

  router.get('/events', (req, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const clientId = randomUUID();
    registerSseClient(clientId, res);
    res.write(
      `event: connected\ndata: ${JSON.stringify({ clientId, timestamp: new Date().toISOString() })}\n\n`
    );

    const heartbeat = setInterval(() => {
      try {
        res.write(': keepalive\n\n');
      } catch {
        clearInterval(heartbeat);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(heartbeat);
      removeSseClient(clientId);
    });
  });

  // ==========================================
  // 2. AUTHENTICATION & USER PROFILE
  // ==========================================
  router.post('/auth/login', (req, res) => {
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }
    const user = db
      .prepare('SELECT * FROM users WHERE lower(email) = lower(?) AND is_active = 1')
      .get(email.trim()) as
      | { id: string; display_name: string; email: string; password_hash: string; role: UserRole }
      | undefined;

    if (!user || !verifyPassword(password, user.password_hash)) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const token = signAuthToken({
      sub: user.id,
      email: user.email,
      displayName: user.display_name,
      role: user.role,
    });

    res.json({
      token,
      user: {
        id: user.id,
        displayName: user.display_name,
        email: user.email,
        role: user.role,
      },
    });
  });

  router.post('/auth/register', (req, res) => {
    const { displayName, email, password } = req.body ?? {};
    if (
      typeof displayName !== 'string' ||
      displayName.trim().length < 2 ||
      typeof email !== 'string' ||
      !email.includes('@') ||
      typeof password !== 'string' ||
      password.length < 6
    ) {
      res.status(400).json({
        error: 'Provide a valid displayName (>=2 chars), email, and password (>=6 chars).',
      });
      return;
    }

    const existing = db.prepare('SELECT id FROM users WHERE lower(email) = lower(?)').get(email.trim());
    if (existing) {
      res.status(409).json({ error: 'An account with that email already exists.' });
      return;
    }

    const id = randomUUID();
    db.prepare(
      `INSERT INTO users (id, display_name, email, password_hash, role, is_active)
       VALUES (?, ?, ?, ?, 'viewer', 1)`
    ).run(id, displayName.trim(), email.trim().toLowerCase(), hashPassword(password));

    const token = signAuthToken({
      sub: id,
      email: email.trim().toLowerCase(),
      displayName: displayName.trim(),
      role: 'viewer',
    });

    res.status(201).json({
      token,
      user: {
        id,
        displayName: displayName.trim(),
        email: email.trim().toLowerCase(),
        role: 'viewer',
      },
    });
  });

  router.post('/auth/demo-login', (req, res) => {
    if (process.env.ALLOW_DEMO_LOGIN === 'false') {
      res.status(403).json({ error: 'Demo login is disabled in this environment.' });
      return;
    }
    const roleRequested = (req.body?.role as UserRole) || 'admin';
    if (!['admin', 'dispatcher', 'viewer'].includes(roleRequested)) {
      res.status(400).json({ error: 'Invalid demo role requested.' });
      return;
    }

    const user = db
      .prepare('SELECT id, display_name, email, role FROM users WHERE role = ? AND is_active = 1 LIMIT 1')
      .get(roleRequested) as
      | { id: string; display_name: string; email: string; role: UserRole }
      | undefined;

    if (!user) {
      res.status(404).json({ error: 'Demo account not seeded for requested role.' });
      return;
    }

    const token = signAuthToken({
      sub: user.id,
      email: user.email,
      displayName: user.display_name,
      role: user.role,
    });

    res.json({
      token,
      user: {
        id: user.id,
        displayName: user.display_name,
        email: user.email,
        role: user.role,
      },
      note: 'Local academic demo session (server-seeded user without client-embedded credentials).',
    });
  });

  router.get('/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    res.json({ user: req.user });
  });

  // ==========================================
  // 3. DASHBOARD SUMMARY & AUDIT LOGS
  // ==========================================
  router.get('/dashboard/summary', (req, res) => {
    const scenario = getActiveScenario(db, req.query.scenarioId as string | undefined);
    if (!scenario) {
      res.json({
        scenario: null,
        kpis: {
          activeIncidents: 0,
          criticalIncidents: 0,
          availableTeams: 0,
          totalTeams: 0,
          blockedRoads: 0,
          restrictedRoads: 0,
          pendingDispatches: 0,
          simulatedAvgResponseTimeS: null,
        },
        severityBreakdown: [],
        teamStatusBreakdown: [],
        recentIncidents: [],
        recentAuditLogs: [],
      });
      return;
    }

    const activeIncidents = (
      db
        .prepare("SELECT COUNT(*) as c FROM incidents WHERE scenario_id = ? AND status IN ('open', 'assigned')")
        .get(scenario.id) as { c: number }
    ).c;

    const criticalIncidents = (
      db
        .prepare(
          "SELECT COUNT(*) as c FROM incidents WHERE scenario_id = ? AND severity = 'critical' AND status IN ('open', 'assigned')"
        )
        .get(scenario.id) as { c: number }
    ).c;

    const availableTeams = (
      db
        .prepare("SELECT COUNT(*) as c FROM rescue_teams WHERE scenario_id = ? AND status = 'available'")
        .get(scenario.id) as { c: number }
    ).c;

    const totalTeams = (
      db.prepare('SELECT COUNT(*) as c FROM rescue_teams WHERE scenario_id = ?').get(scenario.id) as {
        c: number;
      }
    ).c;

    const blockedRoads = (
      db
        .prepare(
          "SELECT COUNT(*) as c FROM scenario_road_closures WHERE scenario_id = ? AND override_status = 'blocked'"
        )
        .get(scenario.id) as { c: number }
    ).c;

    const restrictedRoads = (
      db
        .prepare(
          "SELECT COUNT(*) as c FROM scenario_road_closures WHERE scenario_id = ? AND override_status = 'restricted'"
        )
        .get(scenario.id) as { c: number }
    ).c;

    const pendingDispatches = (
      db
        .prepare(
          "SELECT COUNT(*) as c FROM rescue_assignments WHERE scenario_id = ? AND status IN ('proposed', 'approved', 'dispatched', 'en_route')"
        )
        .get(scenario.id) as { c: number }
    ).c;

    const avgRow = db
      .prepare(
        "SELECT AVG(travel_time_s) as avg_t FROM rescue_assignments WHERE scenario_id = ? AND status != 'cancelled' AND travel_time_s > 0"
      )
      .get(scenario.id) as { avg_t: number | null };

    const severityBreakdown = db
      .prepare(
        `SELECT severity, COUNT(*) as count
         FROM incidents WHERE scenario_id = ?
         GROUP BY severity`
      )
      .all(scenario.id);

    const teamStatusBreakdown = db
      .prepare(
        `SELECT status, COUNT(*) as count
         FROM rescue_teams WHERE scenario_id = ?
         GROUP BY status`
      )
      .all(scenario.id);

    const recentIncidents = db
      .prepare(
        `SELECT id, title, category, severity, locality, verification_status, status, requested_teams, affected_people_estimate, created_at
         FROM incidents WHERE scenario_id = ?
         ORDER BY created_at DESC LIMIT 8`
      )
      .all(scenario.id);

    const recentAuditLogs = db
      .prepare(
        `SELECT id, actor_name, action, entity_type, entity_id, metadata_json, created_at
         FROM audit_logs
         ORDER BY created_at DESC LIMIT 10`
      )
      .all();

    res.json({
      scenario,
      kpis: {
        activeIncidents,
        criticalIncidents,
        availableTeams,
        totalTeams,
        blockedRoads,
        restrictedRoads,
        pendingDispatches,
        simulatedAvgResponseTimeS:
          avgRow.avg_t !== null ? Math.round(avgRow.avg_t * 10) / 10 : null,
      },
      severityBreakdown,
      teamStatusBreakdown,
      recentIncidents,
      recentAuditLogs,
    });
  });

  router.get('/audit-logs', (req, res) => {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
    const logs = db
      .prepare(
        'SELECT id, actor_name, action, entity_type, entity_id, metadata_json, created_at FROM audit_logs ORDER BY created_at DESC LIMIT ?'
      )
      .all(limit);
    res.json({ items: logs });
  });

  // ==========================================
  // 4. GIS MAP FEATURES & ROAD CLOSURES
  // ==========================================
  router.get('/map/features', (req, res) => {
    const scenario = getActiveScenario(db, req.query.scenarioId as string | undefined);
    if (!scenario) {
      res.status(404).json({ error: 'No scenario found.' });
      return;
    }

    // Bounding box validation (Chennai study area fallback bounds)
    const minLat = Number(req.query.minLat ?? 12.82);
    const maxLat = Number(req.query.maxLat ?? 13.3);
    const minLng = Number(req.query.minLng ?? 80.0);
    const maxLng = Number(req.query.maxLng ?? 80.4);
    const limit = Math.min(1000, Math.max(10, Number(req.query.limit) || 600));

    if (
      !Number.isFinite(minLat) ||
      !Number.isFinite(maxLat) ||
      !Number.isFinite(minLng) ||
      !Number.isFinite(maxLng) ||
      minLat >= maxLat ||
      minLng >= maxLng
    ) {
      res.status(400).json({ error: 'Invalid bounding box query parameters.' });
      return;
    }

    const nodes = db
      .prepare(
        `SELECT * FROM road_nodes
         WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?
         LIMIT ?`
      )
      .all(minLat, maxLat, minLng, maxLng, limit) as Array<{
      id: string;
      source_osm_id: string;
      name: string;
      locality: string;
      lat: number;
      lng: number;
    }>;

    const nodeIds = new Set(nodes.map((n) => n.id));
    const allEdges = db
      .prepare(
        `SELECT e.*, COALESCE(c.override_status, 'open') as closure_status, COALESCE(c.reason, '') as closure_reason
         FROM road_edges e
         LEFT JOIN scenario_road_closures c
           ON c.road_edge_id = e.id AND c.scenario_id = ?
         LIMIT ?`
      )
      .all(scenario.id, limit) as Array<Record<string, unknown>>;

    const edges = allEdges.filter(
      (e) =>
        nodeIds.has(e.source_node_id as string) || nodeIds.has(e.target_node_id as string)
    );

    const incidents = db
      .prepare(
        `SELECT id, title, description, category, severity, lat, lng, locality,
                affected_people_estimate, required_capabilities_json, requested_teams,
                verification_status, status, scenario_id, is_simulated, created_at, updated_at
         FROM incidents
         WHERE scenario_id = ? AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?`
      )
      .all(scenario.id, minLat, maxLat, minLng, maxLng);

    const teams = db
      .prepare('SELECT * FROM rescue_teams WHERE scenario_id = ?')
      .all(scenario.id);

    const facilities = db.prepare('SELECT * FROM shelters_hospitals').all();

    res.json({
      scenario,
      graphVersion: `${GRAPH_NETWORK_VERSION}-v${scenario.closure_version}`,
      bbox: { minLat, maxLat, minLng, maxLng },
      nodes,
      edges,
      incidents,
      teams,
      facilities,
    });
  });

  router.put(
    '/scenarios/:scenarioId/closures/:edgeId',
    requireAuth,
    requireRole(['admin', 'dispatcher']),
    (req: AuthenticatedRequest, res) => {
      const { scenarioId, edgeId } = req.params;
      const { overrideStatus, reason = '', applyToReverse = true } = req.body ?? {};
      if (!['open', 'restricted', 'blocked'].includes(overrideStatus)) {
        res.status(400).json({ error: 'overrideStatus must be open, restricted, or blocked.' });
        return;
      }

      const scenario = db.prepare('SELECT * FROM disaster_scenarios WHERE id = ?').get(scenarioId);
      if (!scenario) {
        res.status(404).json({ error: 'Scenario not found.' });
        return;
      }

      const edge = db.prepare('SELECT * FROM road_edges WHERE id = ?').get(edgeId) as
        | { id: string; name: string; is_oneway: number }
        | undefined;
      if (!edge) {
        res.status(404).json({ error: 'Road edge not found.' });
        return;
      }

      const targetIds = [edgeId];
      if (applyToReverse) {
        const revId = edgeId.endsWith('_REV') ? edgeId.slice(0, -4) : `${edgeId}_REV`;
        const revEdge = db.prepare('SELECT id FROM road_edges WHERE id = ?').get(revId);
        if (revEdge) targetIds.push(revId);
      }

      db.exec('BEGIN;');
      try {
        for (const eid of targetIds) {
          if (overrideStatus === 'open') {
            db.prepare('DELETE FROM scenario_road_closures WHERE scenario_id = ? AND road_edge_id = ?').run(
              scenarioId,
              eid
            );
          } else {
            db.prepare(
              `INSERT INTO scenario_road_closures (id, scenario_id, road_edge_id, override_status, reason, updated_by)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(scenario_id, road_edge_id) DO UPDATE SET
                 override_status = excluded.override_status,
                 reason = excluded.reason,
                 updated_by = excluded.updated_by`
            ).run(randomUUID(), scenarioId, eid, overrideStatus, String(reason).slice(0, 300), req.user!.sub);
          }
        }

        db.prepare(
          `UPDATE disaster_scenarios SET closure_version = closure_version + 1, updated_at = datetime('now') WHERE id = ?`
        ).run(scenarioId);

        writeAudit(db, req, 'ROAD_CLOSURE_UPDATED', 'road_edge', edgeId, {
          scenarioId,
          roadName: edge.name,
          overrideStatus,
          reason,
          affectedEdges: targetIds,
        });

        db.exec('COMMIT;');
      } catch (err) {
        db.exec('ROLLBACK;');
        throw err;
      }

      invalidateGraphCache(scenarioId);
      const updated = db.prepare('SELECT closure_version FROM disaster_scenarios WHERE id = ?').get(scenarioId) as {
        closure_version: number;
      };
      broadcastEvent('road_closure:updated', {
        scenarioId,
        edgeId,
        overrideStatus,
        closureVersion: updated.closure_version,
      });

      res.json({
        ok: true,
        scenarioId,
        affectedEdges: targetIds,
        overrideStatus,
        closureVersion: updated.closure_version,
      });
    }
  );

  router.post(
    '/scenarios/:scenarioId/closures/reset',
    requireAuth,
    requireRole(['admin', 'dispatcher']),
    (req: AuthenticatedRequest, res) => {
      const { scenarioId } = req.params;
      db.prepare('DELETE FROM scenario_road_closures WHERE scenario_id = ?').run(scenarioId);
      db.prepare(
        `UPDATE disaster_scenarios SET closure_version = closure_version + 1, updated_at = datetime('now') WHERE id = ?`
      ).run(scenarioId);
      invalidateGraphCache(scenarioId);
      writeAudit(db, req, 'ROAD_CLOSURES_CLEARED', 'scenario', scenarioId);
      broadcastEvent('road_closure:reset', { scenarioId });
      res.json({ ok: true, scenarioId });
    }
  );

  // ==========================================
  // 5. INCIDENTS CRUD & VERIFICATION
  // ==========================================
  router.get('/incidents', (req: AuthenticatedRequest, res) => {
    const scenario = getActiveScenario(db, req.query.scenarioId as string | undefined);
    if (!scenario) {
      res.json({ items: [], total: 0, page: 1, pageSize: 20 });
      return;
    }

    const severity = req.query.severity as string | undefined;
    const status = req.query.status as string | undefined;
    const verificationStatus = req.query.verificationStatus as string | undefined;
    const search = ((req.query.search as string) || '').trim();
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;

    const conditions = ['scenario_id = ?'];
    const params: Array<string | number> = [scenario.id];

    if (severity && severity !== 'all') {
      conditions.push('severity = ?');
      params.push(severity);
    }
    if (status && status !== 'all') {
      conditions.push('status = ?');
      params.push(status);
    }
    if (verificationStatus && verificationStatus !== 'all') {
      conditions.push('verification_status = ?');
      params.push(verificationStatus);
    }
    if (search) {
      conditions.push('(lower(title) LIKE lower(?) OR lower(locality) LIKE lower(?) OR lower(description) LIKE lower(?))');
      const like = `%${search}%`;
      params.push(like, like, like);
    }

    const where = conditions.join(' AND ');
    const total = (
      db.prepare(`SELECT COUNT(*) as c FROM incidents WHERE ${where}`).get(...params) as { c: number }
    ).c;

    const rows = db
      .prepare(
        `SELECT id, title, description, category, severity, lat, lng, locality,
                affected_people_estimate, required_capabilities_json, requested_teams,
                verification_status, status, scenario_id, is_simulated, created_at, updated_at
                ${req.user && req.user.role !== 'viewer' ? ', reporter_name' : ''}
         FROM incidents
         WHERE ${where}
         ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, created_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(...params, pageSize, offset);

    res.json({ items: rows, total, page, pageSize, scenarioId: scenario.id });
  });

  router.get('/incidents/:id', (req, res) => {
    const row = db.prepare('SELECT * FROM incidents WHERE id = ?').get(req.params.id) as
      | IncidentRecord
      | undefined;
    if (!row) {
      res.status(404).json({ error: 'Incident not found.' });
      return;
    }
    res.json({ item: row });
  });

  router.post(
    '/incidents',
    requireAuth,
    requireRole(['admin', 'dispatcher']),
    (req: AuthenticatedRequest, res) => {
      const {
        title,
        description = '',
        category = 'flood_rescue',
        severity = 'high',
        lat,
        lng,
        locality = 'Chennai Study Area',
        affectedPeopleEstimate = 5,
        requiredCapabilities = ['general_rescue'],
        requestedTeams = 1,
        verificationStatus = 'verified',
        scenarioId,
      } = req.body ?? {};

      if (
        typeof title !== 'string' ||
        title.trim().length < 3 ||
        !['critical', 'high', 'medium', 'low'].includes(severity) ||
        typeof lat !== 'number' ||
        typeof lng !== 'number' ||
        lat < 12.7 ||
        lat > 13.4 ||
        lng < 79.9 ||
        lng > 80.5
      ) {
        res.status(400).json({
          error:
            'Valid title (>=3 chars), severity, and Chennai study-area coordinates (lat 12.7..13.4, lng 79.9..80.5) are required.',
        });
        return;
      }

      const scenario = getActiveScenario(db, scenarioId);
      if (!scenario) {
        res.status(404).json({ error: 'Target scenario not found.' });
        return;
      }

      const id = `inc-${randomUUID().slice(0, 8)}`;
      const safeVerif = ['unverified', 'verified', 'rejected'].includes(verificationStatus)
        ? verificationStatus
        : 'verified';

      db.prepare(
        `INSERT INTO incidents
         (id, title, description, category, severity, lat, lng, locality, affected_people_estimate,
          required_capabilities_json, requested_teams, verification_status, status, reporter_name, reporter_id, scenario_id, is_simulated)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, 1)`
      ).run(
        id,
        title.trim(),
        String(description).trim(),
        String(category),
        severity,
        lat,
        lng,
        String(locality),
        Math.max(0, Number(affectedPeopleEstimate) || 0),
        JSON.stringify(Array.isArray(requiredCapabilities) ? requiredCapabilities : ['general_rescue']),
        Math.max(1, Number(requestedTeams) || 1),
        safeVerif,
        req.user!.displayName,
        req.user!.sub,
        scenario.id
      );

      writeAudit(db, req, 'INCIDENT_CREATED', 'incident', id, {
        title: title.trim(),
        severity,
        scenarioId: scenario.id,
      });
      const created = db.prepare('SELECT * FROM incidents WHERE id = ?').get(id);
      broadcastEvent('incident:created', { scenarioId: scenario.id, incident: created });
      res.status(201).json({ item: created });
    }
  );

  router.patch(
    '/incidents/:id',
    requireAuth,
    requireRole(['admin', 'dispatcher']),
    (req: AuthenticatedRequest, res) => {
      const existing = db.prepare('SELECT * FROM incidents WHERE id = ?').get(req.params.id) as
        | IncidentRecord
        | undefined;
      if (!existing) {
        res.status(404).json({ error: 'Incident not found.' });
        return;
      }

      const {
        title = existing.title,
        description = existing.description,
        severity = existing.severity,
        verificationStatus = existing.verification_status,
        status = existing.status,
        requestedTeams = existing.requested_teams,
        affectedPeopleEstimate = existing.affected_people_estimate,
        requiredCapabilities,
      } = req.body ?? {};

      if (!['critical', 'high', 'medium', 'low'].includes(severity)) {
        res.status(400).json({ error: 'Invalid severity value.' });
        return;
      }
      if (!['unverified', 'verified', 'rejected'].includes(verificationStatus)) {
        res.status(400).json({ error: 'Invalid verificationStatus value.' });
        return;
      }
      if (!['open', 'assigned', 'resolved', 'closed'].includes(status)) {
        res.status(400).json({ error: 'Invalid status value.' });
        return;
      }

      db.prepare(
        `UPDATE incidents
         SET title = ?, description = ?, severity = ?, verification_status = ?, status = ?,
             requested_teams = ?, affected_people_estimate = ?, required_capabilities_json = ?,
             updated_at = datetime('now')
         WHERE id = ?`
      ).run(
        String(title).trim(),
        String(description).trim(),
        severity,
        verificationStatus,
        status,
        Math.max(1, Number(requestedTeams) || 1),
        Math.max(0, Number(affectedPeopleEstimate) || 0),
        Array.isArray(requiredCapabilities)
          ? JSON.stringify(requiredCapabilities)
          : existing.required_capabilities_json,
        existing.id
      );

      writeAudit(db, req, 'INCIDENT_UPDATED', 'incident', existing.id, {
        verificationStatus,
        status,
        severity,
      });

      const updated = db.prepare('SELECT * FROM incidents WHERE id = ?').get(existing.id);
      broadcastEvent('incident:updated', { scenarioId: existing.scenario_id, incident: updated });
      res.json({ item: updated });
    }
  );

  router.delete(
    '/incidents/:id',
    requireAuth,
    requireRole(['admin']),
    (req: AuthenticatedRequest, res) => {
      const existing = db.prepare('SELECT * FROM incidents WHERE id = ?').get(req.params.id) as
        | IncidentRecord
        | undefined;
      if (!existing) {
        res.status(404).json({ error: 'Incident not found.' });
        return;
      }
      db.prepare('DELETE FROM incidents WHERE id = ?').run(existing.id);
      writeAudit(db, req, 'INCIDENT_DELETED', 'incident', existing.id, { title: existing.title });
      broadcastEvent('incident:deleted', { scenarioId: existing.scenario_id, incidentId: existing.id });
      res.json({ ok: true });
    }
  );

  // ==========================================
  // 6. RESCUE TEAMS
  // ==========================================
  router.get('/teams', (req, res) => {
    const scenario = getActiveScenario(db, req.query.scenarioId as string | undefined);
    if (!scenario) {
      res.json({ items: [] });
      return;
    }

    const status = req.query.status as string | undefined;
    const capability = req.query.capability as string | undefined;
    let items = db
      .prepare('SELECT * FROM rescue_teams WHERE scenario_id = ? ORDER BY name ASC')
      .all(scenario.id) as unknown as RescueTeamRecord[];

    if (status && status !== 'all') {
      items = items.filter((t) => t.status === status);
    }
    if (capability && capability !== 'all') {
      items = items.filter((t) => {
        const caps = JSON.parse(t.capabilities_json || '[]') as string[];
        return caps.includes(capability) || caps.includes('multi_hazard');
      });
    }

    res.json({ items, scenarioId: scenario.id });
  });

  router.post(
    '/teams',
    requireAuth,
    requireRole(['admin', 'dispatcher']),
    (req: AuthenticatedRequest, res) => {
      const {
        name,
        category = 'Water Rescue',
        capabilities = ['general_rescue'],
        vehicleMode = '4x4_rescue_suv',
        homeBaseName = 'Egmore HQ',
        lat = 13.0732,
        lng = 80.2609,
        personnelCount = 5,
        capacity = 6,
        scenarioId,
      } = req.body ?? {};

      if (typeof name !== 'string' || name.trim().length < 2) {
        res.status(400).json({ error: 'Team name (>=2 chars) is required.' });
        return;
      }

      const scenario = getActiveScenario(db, scenarioId);
      if (!scenario) {
        res.status(404).json({ error: 'Scenario not found.' });
        return;
      }

      const id = `team-${randomUUID().slice(0, 8)}`;
      db.prepare(
        `INSERT INTO rescue_teams
         (id, name, category, capabilities_json, vehicle_mode, home_base_name,
          base_lat, base_lng, current_lat, current_lng, personnel_count, capacity, status, shift_available, scenario_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'available', 1, ?)`
      ).run(
        id,
        name.trim(),
        category,
        JSON.stringify(Array.isArray(capabilities) ? capabilities : ['general_rescue']),
        vehicleMode,
        homeBaseName,
        Number(lat),
        Number(lng),
        Number(lat),
        Number(lng),
        Math.max(1, Number(personnelCount) || 4),
        Math.max(1, Number(capacity) || 6),
        scenario.id
      );

      writeAudit(db, req, 'TEAM_CREATED', 'rescue_team', id, { name: name.trim(), scenarioId: scenario.id });
      const created = db.prepare('SELECT * FROM rescue_teams WHERE id = ?').get(id);
      broadcastEvent('team:updated', { scenarioId: scenario.id, team: created });
      res.status(201).json({ item: created });
    }
  );

  router.patch(
    '/teams/:id',
    requireAuth,
    requireRole(['admin', 'dispatcher']),
    (req: AuthenticatedRequest, res) => {
      const existing = db.prepare('SELECT * FROM rescue_teams WHERE id = ?').get(req.params.id) as
        | RescueTeamRecord
        | undefined;
      if (!existing) {
        res.status(404).json({ error: 'Rescue team not found.' });
        return;
      }

      const {
        status = existing.status,
        shiftAvailable = existing.shift_available,
        currentLat = existing.current_lat,
        currentLng = existing.current_lng,
      } = req.body ?? {};

      if (!['available', 'assigned', 'en_route', 'on_scene', 'offline'].includes(status)) {
        res.status(400).json({ error: 'Invalid team status.' });
        return;
      }

      db.prepare(
        `UPDATE rescue_teams
         SET status = ?, shift_available = ?, current_lat = ?, current_lng = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).run(status, shiftAvailable ? 1 : 0, Number(currentLat), Number(currentLng), existing.id);

      const updated = db.prepare('SELECT * FROM rescue_teams WHERE id = ?').get(existing.id);
      broadcastEvent('team:updated', { scenarioId: existing.scenario_id, team: updated });
      res.json({ item: updated });
    }
  );

  // ==========================================
  // 7. SCENARIOS & LABORATORY
  // ==========================================
  router.get('/scenarios', (_req, res) => {
    const scenarios = db
      .prepare('SELECT * FROM disaster_scenarios ORDER BY is_active DESC, created_at ASC')
      .all() as unknown as DisasterScenario[];

    const enriched = scenarios.map((s) => {
      const incidentCount = (
        db.prepare('SELECT COUNT(*) as c FROM incidents WHERE scenario_id = ?').get(s.id) as { c: number }
      ).c;
      const blockedCount = (
        db
          .prepare(
            "SELECT COUNT(*) as c FROM scenario_road_closures WHERE scenario_id = ? AND override_status = 'blocked'"
          )
          .get(s.id) as { c: number }
      ).c;
      const restrictedCount = (
        db
          .prepare(
            "SELECT COUNT(*) as c FROM scenario_road_closures WHERE scenario_id = ? AND override_status = 'restricted'"
          )
          .get(s.id) as { c: number }
      ).c;
      const teamCount = (
        db.prepare('SELECT COUNT(*) as c FROM rescue_teams WHERE scenario_id = ?').get(s.id) as { c: number }
      ).c;

      return {
        ...s,
        counts: { incidentCount, blockedCount, restrictedCount, teamCount },
      };
    });

    res.json({ items: enriched });
  });

  router.post(
    '/scenarios',
    requireAuth,
    requireRole(['admin', 'dispatcher']),
    (req: AuthenticatedRequest, res) => {
      const {
        name,
        description = 'Custom hypothetical simulation scenario.',
        type = 'custom',
        subarea = 'chennai_metro_study_area',
        simulationSeed = 20251201,
        closureFraction = 0,
        incidentCount = 0,
        teamCount = 3,
      } = req.body ?? {};

      if (typeof name !== 'string' || name.trim().length < 3) {
        res.status(400).json({ error: 'Scenario name (>=3 chars) is required.' });
        return;
      }

      const id = `scen-${randomUUID().slice(0, 8)}`;
      const seedNum = Number(simulationSeed) || 20251201;

      db.exec('BEGIN;');
      try {
        db.prepare(
          `INSERT INTO disaster_scenarios
           (id, name, description, type, subarea, is_active, simulation_seed, closure_version, is_seeded, created_by)
           VALUES (?, ?, ?, ?, ?, 0, ?, 1, 0, ?)`
        ).run(id, name.trim(), String(description).trim(), type, subarea, seedNum, req.user!.sub);

        // Deterministic PRNG for optional laboratory scenario generation
        let s = seedNum >>> 0;
        const rand = () => {
          s += 0x6d2b79f5;
          let t = Math.imul(s ^ (s >>> 15), 1 | s);
          t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };

        // Optional generated closures by closureFraction
        const frac = Math.min(0.6, Math.max(0, Number(closureFraction) || 0));
        if (frac > 0) {
          const edges = db.prepare('SELECT id, name FROM road_edges').all() as Array<{
            id: string;
            name: string;
          }>;
          const insCl = db.prepare(
            `INSERT OR IGNORE INTO scenario_road_closures (id, scenario_id, road_edge_id, override_status, reason, updated_by)
             VALUES (?, ?, ?, ?, ?, ?)`
          );
          for (const e of edges) {
            if (!e.id.endsWith('_REV') && rand() < frac) {
              const status = rand() < 0.65 ? 'blocked' : 'restricted';
              insCl.run(
                randomUUID(),
                id,
                e.id,
                status,
                `Scenario lab deterministic ${status} simulation (seed ${seedNum})`,
                req.user!.sub
              );
            }
          }
        }

        // Optional generated synthetic incidents from Chennai localities
        const incTotal = Math.min(20, Math.max(0, Number(incidentCount) || 0));
        if (incTotal > 0) {
          const sevs: IncidentSeverity[] = ['critical', 'high', 'medium', 'low'];
          const caps = [['boat_water'], ['medical'], ['heavy_rescue'], ['boat_water', 'medical']];
          const insInc = db.prepare(
            `INSERT INTO incidents
             (id, title, description, category, severity, lat, lng, locality, affected_people_estimate,
              required_capabilities_json, requested_teams, verification_status, status, reporter_name, scenario_id, is_simulated)
             VALUES (?, ?, ?, 'flood_rescue', ?, ?, ?, ?, ?, ?, 1, 'verified', 'open', 'Scenario Lab Generator', ?, 1)`
          );
          for (let i = 0; i < incTotal; i++) {
            const loc = CHENNAI_LOCALITIES[Math.floor(rand() * CHENNAI_LOCALITIES.length)];
            const sev = sevs[Math.floor(rand() * sevs.length)];
            const cap = caps[Math.floor(rand() * caps.length)];
            insInc.run(
              `inc-${id.slice(5)}-${i + 1}`,
              `Simulated Lab Incident #${i + 1} — ${loc.name}`,
              `Generated by Scenario Laboratory (seed ${seedNum})`,
              sev,
              loc.lat + (rand() - 0.5) * 0.008,
              loc.lng + (rand() - 0.5) * 0.008,
              loc.name,
              Math.floor(5 + rand() * 35),
              JSON.stringify(cap),
              id
            );
          }
        }

        // Seed teams for the new scenario
        const tCount = Math.min(12, Math.max(1, Number(teamCount) || 3));
        const teamTemplates = [
          { name: 'Lab Alpha Boat', cat: 'Water Rescue', caps: ['boat_water', 'medical'], loc: 'Guindy', lat: 13.0085, lng: 80.2206 },
          { name: 'Lab Bravo Medical', cat: 'Medical Triage', caps: ['medical'], loc: 'Egmore', lat: 13.0732, lng: 80.2609 },
          { name: 'Lab Charlie Heavy', cat: 'Heavy Engineering', caps: ['heavy_rescue', 'multi_hazard'], loc: 'Ambattur', lat: 13.1143, lng: 80.1548 },
          { name: 'Lab Delta Coastal', cat: 'Water Rescue', caps: ['boat_water', 'heavy_rescue'], loc: 'Adyar', lat: 13.0064, lng: 80.2476 },
          { name: 'Lab Echo Metro', cat: 'Multi-Hazard', caps: ['multi_hazard'], loc: 'Anna Nagar', lat: 13.085, lng: 80.2101 },
          { name: 'Lab Foxtrot South', cat: 'Medical Triage', caps: ['medical', 'boat_water'], loc: 'Tambaram', lat: 12.9285, lng: 80.1195 },
        ];
        const insTeam = db.prepare(
          `INSERT INTO rescue_teams
           (id, name, category, capabilities_json, vehicle_mode, home_base_name,
            base_lat, base_lng, current_lat, current_lng, personnel_count, capacity, status, shift_available, scenario_id)
           VALUES (?, ?, ?, ?, '4x4_rescue_suv', ?, ?, ?, ?, ?, 6, 8, 'available', 1, ?)`
        );
        for (let i = 0; i < tCount; i++) {
          const tpl = teamTemplates[i % teamTemplates.length];
          insTeam.run(
            `team-${id.slice(5)}-${i + 1}`,
            `${tpl.name} #${i + 1}`,
            tpl.cat,
            JSON.stringify(tpl.caps),
            tpl.loc,
            tpl.lat,
            tpl.lng,
            tpl.lat,
            tpl.lng,
            id
          );
        }

        writeAudit(db, req, 'SCENARIO_CREATED', 'scenario', id, { name: name.trim(), seed: seedNum });
        db.exec('COMMIT;');
      } catch (err) {
        db.exec('ROLLBACK;');
        throw err;
      }

      const created = db.prepare('SELECT * FROM disaster_scenarios WHERE id = ?').get(id);
      broadcastEvent('scenario:created', { scenario: created });
      res.status(201).json({ item: created });
    }
  );

  router.patch(
    '/scenarios/:id',
    requireAuth,
    requireRole(['admin', 'dispatcher']),
    (req: AuthenticatedRequest, res) => {
      const existing = db.prepare('SELECT * FROM disaster_scenarios WHERE id = ?').get(req.params.id) as
        | DisasterScenario
        | undefined;
      if (!existing) {
        res.status(404).json({ error: 'Scenario not found.' });
        return;
      }
      const {
        name = existing.name,
        description = existing.description,
        subarea = existing.subarea,
        simulationSeed = existing.simulation_seed,
      } = req.body ?? {};

      db.prepare(
        `UPDATE disaster_scenarios
         SET name = ?, description = ?, subarea = ?, simulation_seed = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).run(String(name).trim(), String(description).trim(), subarea, Number(simulationSeed), existing.id);

      const updated = db.prepare('SELECT * FROM disaster_scenarios WHERE id = ?').get(existing.id);
      res.json({ item: updated });
    }
  );

  router.post(
    '/scenarios/:id/activate',
    requireAuth,
    requireRole(['admin', 'dispatcher']),
    (req: AuthenticatedRequest, res) => {
      const target = db.prepare('SELECT * FROM disaster_scenarios WHERE id = ?').get(req.params.id) as
        | DisasterScenario
        | undefined;
      if (!target) {
        res.status(404).json({ error: 'Scenario not found.' });
        return;
      }

      db.exec('BEGIN;');
      try {
        db.prepare('UPDATE disaster_scenarios SET is_active = 0').run();
        db.prepare(
          "UPDATE disaster_scenarios SET is_active = 1, updated_at = datetime('now') WHERE id = ?"
        ).run(target.id);
        writeAudit(db, req, 'SCENARIO_ACTIVATED', 'scenario', target.id, { name: target.name });
        db.exec('COMMIT;');
      } catch (err) {
        db.exec('ROLLBACK;');
        throw err;
      }

      const updated = db.prepare('SELECT * FROM disaster_scenarios WHERE id = ?').get(target.id);
      broadcastEvent('scenario:activated', { scenario: updated });
      res.json({ item: updated });
    }
  );

  router.post(
    '/scenarios/:id/clone',
    requireAuth,
    requireRole(['admin', 'dispatcher']),
    (req: AuthenticatedRequest, res) => {
      const src = db.prepare('SELECT * FROM disaster_scenarios WHERE id = ?').get(req.params.id) as
        | DisasterScenario
        | undefined;
      if (!src) {
        res.status(404).json({ error: 'Source scenario not found.' });
        return;
      }

      const newId = `scen-${randomUUID().slice(0, 8)}`;
      const newName = (req.body?.name as string)?.trim() || `${src.name} (Clone)`;

      db.exec('BEGIN;');
      try {
        db.prepare(
          `INSERT INTO disaster_scenarios
           (id, name, description, type, subarea, is_active, simulation_seed, closure_version, is_seeded, created_by)
           VALUES (?, ?, ?, ?, ?, 0, ?, 1, 0, ?)`
        ).run(newId, newName, src.description, src.type, src.subarea, src.simulation_seed, req.user!.sub);

        const srcIncidents = db
          .prepare('SELECT * FROM incidents WHERE scenario_id = ?')
          .all(src.id) as unknown as IncidentRecord[];
        const insInc = db.prepare(
          `INSERT INTO incidents
           (id, title, description, category, severity, lat, lng, locality, affected_people_estimate,
            required_capabilities_json, requested_teams, verification_status, status, reporter_name, scenario_id, is_simulated)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, 1)`
        );
        for (const inc of srcIncidents) {
          insInc.run(
            `inc-${randomUUID().slice(0, 8)}`,
            inc.title,
            inc.description,
            inc.category,
            inc.severity,
            inc.lat,
            inc.lng,
            inc.locality,
            inc.affected_people_estimate,
            inc.required_capabilities_json,
            inc.requested_teams,
            inc.verification_status,
            inc.reporter_name,
            newId
          );
        }

        const srcClosures = db
          .prepare('SELECT * FROM scenario_road_closures WHERE scenario_id = ?')
          .all(src.id) as Array<{ road_edge_id: string; override_status: string; reason: string }>;
        const insCl = db.prepare(
          `INSERT INTO scenario_road_closures (id, scenario_id, road_edge_id, override_status, reason, updated_by)
           VALUES (?, ?, ?, ?, ?, ?)`
        );
        for (const cl of srcClosures) {
          insCl.run(randomUUID(), newId, cl.road_edge_id, cl.override_status, cl.reason, req.user!.sub);
        }

        const srcTeams = db
          .prepare('SELECT * FROM rescue_teams WHERE scenario_id = ?')
          .all(src.id) as unknown as RescueTeamRecord[];
        const insTeam = db.prepare(
          `INSERT INTO rescue_teams
           (id, name, category, capabilities_json, vehicle_mode, home_base_name,
            base_lat, base_lng, current_lat, current_lng, personnel_count, capacity, status, shift_available, scenario_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'available', 1, ?)`
        );
        for (const t of srcTeams) {
          insTeam.run(
            `team-${randomUUID().slice(0, 8)}`,
            t.name,
            t.category,
            t.capabilities_json,
            t.vehicle_mode,
            t.home_base_name,
            t.base_lat,
            t.base_lng,
            t.base_lat,
            t.base_lng,
            t.personnel_count,
            t.capacity,
            newId
          );
        }

        writeAudit(db, req, 'SCENARIO_CLONED', 'scenario', newId, { sourceId: src.id, name: newName });
        db.exec('COMMIT;');
      } catch (err) {
        db.exec('ROLLBACK;');
        throw err;
      }

      const created = db.prepare('SELECT * FROM disaster_scenarios WHERE id = ?').get(newId);
      res.status(201).json({ item: created });
    }
  );

  router.post(
    '/scenarios/:id/reset',
    requireAuth,
    requireRole(['admin', 'dispatcher']),
    (req: AuthenticatedRequest, res) => {
      const ok = resetScenarioToSeed(db, req.params.id, req.user!.sub, req.user!.displayName);
      if (!ok) {
        res.status(400).json({ error: 'Only built-in seeded scenarios can be reset to seed defaults.' });
        return;
      }
      invalidateGraphCache(req.params.id);
      broadcastEvent('scenario:reset', { scenarioId: req.params.id });
      const updated = db.prepare('SELECT * FROM disaster_scenarios WHERE id = ?').get(req.params.id);
      res.json({ item: updated });
    }
  );

  router.delete(
    '/scenarios/:id',
    requireAuth,
    requireRole(['admin']),
    (req: AuthenticatedRequest, res) => {
      const target = db.prepare('SELECT * FROM disaster_scenarios WHERE id = ?').get(req.params.id) as
        | DisasterScenario
        | undefined;
      if (!target) {
        res.status(404).json({ error: 'Scenario not found.' });
        return;
      }
      if (target.is_active === 1) {
        res.status(400).json({ error: 'Cannot delete the currently active scenario. Activate another scenario first.' });
        return;
      }
      db.prepare('DELETE FROM disaster_scenarios WHERE id = ?').run(target.id);
      invalidateGraphCache(target.id);
      writeAudit(db, req, 'SCENARIO_DELETED', 'scenario', target.id, { name: target.name });
      res.json({ ok: true });
    }
  );

  // ==========================================
  // 8. PHASE 3 — DAA ROUTING & COMPARISON
  // ==========================================
  function resolveEndpointNode(
    graph: ReturnType<typeof getGraphSnapshot>,
    endpoint: { nodeId?: string; lat?: number; lng?: number }
  ) {
    if (endpoint.nodeId && graph.nodes.has(endpoint.nodeId)) {
      return {
        ok: true as const,
        node: graph.nodes.get(endpoint.nodeId)!,
        snapDistanceMeters: 0,
      };
    }
    if (typeof endpoint.lat === 'number' && typeof endpoint.lng === 'number') {
      return snapToNearestNode(graph, endpoint.lat, endpoint.lng, 4500);
    }
    return {
      ok: false as const,
      snapDistanceMeters: Infinity,
      error: 'Provide valid nodeId or lat/lng coordinates.',
    };
  }

  router.post('/routes/optimize', (req, res) => {
    const {
      scenarioId,
      origin,
      destination,
      costMode = 'travel_time_s',
      algorithm = 'dijkstra',
      recordSteps = true,
    } = req.body ?? {};

    const scenario = getActiveScenario(db, scenarioId);
    if (!scenario) {
      res.status(404).json({ error: 'Scenario not found.' });
      return;
    }

    const mode: CostMode = costMode === 'distance_m' ? 'distance_m' : 'travel_time_s';
    const multiplier = getRestrictedMultiplier(db);
    const tGraph0 = performance.now();
    const graph = getGraphSnapshot(db, scenario.id, multiplier);
    const graphLoadMs = Math.round((performance.now() - tGraph0) * 1000) / 1000;

    const origSnap = resolveEndpointNode(graph, origin || {});
    if (!origSnap.ok || !origSnap.node) {
      res.status(400).json({ error: `Origin snap failed: ${origSnap.error}` });
      return;
    }
    const destSnap = resolveEndpointNode(graph, destination || {});
    if (!destSnap.ok || !destSnap.node) {
      res.status(400).json({ error: `Destination snap failed: ${destSnap.error}` });
      return;
    }

    if (algorithm === 'bfs' || algorithm === 'dfs') {
      const trav =
        algorithm === 'bfs'
          ? runBFS(graph, origSnap.node.id, destSnap.node.id, Boolean(recordSteps))
          : runDFS(graph, origSnap.node.id, destSnap.node.id, Boolean(recordSteps));

      const runId = randomUUID();
      db.prepare(
        `INSERT INTO algorithm_runs
         (id, scenario_id, graph_version, closure_version, algorithm_name, parameters_json, input_metadata_json, results_json, runtime_ms, memory_bytes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
      ).run(
        runId,
        scenario.id,
        graph.networkVersion,
        graph.closureVersion,
        algorithm,
        JSON.stringify({ costMode: 'unweighted_hops', originNode: origSnap.node.id, targetNode: destSnap.node.id }),
        JSON.stringify({ nodes: graph.nodes.size, edges: graph.edges.size, blockedEdges: graph.blockedEdgeCount }),
        JSON.stringify({
          reachableCount: trav.reachableCount,
          targetReachable: trav.targetReachable,
          hopDistance: trav.hopDistanceToTarget,
        }),
        trav.runtimeMs
      );

      res.json({
        runId,
        scenarioId: scenario.id,
        graphMetadata: {
          networkVersion: graph.networkVersion,
          closureVersion: graph.closureVersion,
          nodeCount: graph.nodes.size,
          edgeCount: graph.edges.size,
          blockedEdges: graph.blockedEdgeCount,
          restrictedEdges: graph.restrictedEdgeCount,
          restrictedMultiplier: multiplier,
          graphLoadMs,
        },
        snapping: {
          originNode: origSnap.node,
          originSnapM: origSnap.snapDistanceMeters,
          destinationNode: destSnap.node,
          destinationSnapM: destSnap.snapDistanceMeters,
        },
        traversal: trav,
      });
      return;
    }

    const result =
      algorithm === 'astar'
        ? runAStar(graph, origSnap.node.id, destSnap.node.id, mode, Boolean(recordSteps))
        : runDijkstra(graph, origSnap.node.id, destSnap.node.id, mode, Boolean(recordSteps));

    const runId = randomUUID();
    db.prepare(
      `INSERT INTO algorithm_runs
       (id, scenario_id, graph_version, closure_version, algorithm_name, parameters_json, input_metadata_json, results_json, runtime_ms, memory_bytes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      runId,
      scenario.id,
      graph.networkVersion,
      graph.closureVersion,
      result.algorithm,
      JSON.stringify({ costMode: mode, originNode: origSnap.node.id, targetNode: destSnap.node.id, restrictedMultiplier: multiplier }),
      JSON.stringify({ nodes: graph.nodes.size, edges: graph.edges.size, blockedEdges: graph.blockedEdgeCount }),
      JSON.stringify({
        status: result.status,
        totalCost: result.totalCost,
        totalDistanceM: result.totalDistanceM,
        estimatedTravelTimeS: result.estimatedTravelTimeS,
        visitedNodesCount: result.visitedNodesCount,
        relaxationsCount: result.relaxationsCount,
      }),
      result.runtimeMs,
      result.heapDeltaBytes
    );

    res.json({
      runId,
      scenarioId: scenario.id,
      graphMetadata: {
        networkVersion: graph.networkVersion,
        closureVersion: graph.closureVersion,
        nodeCount: graph.nodes.size,
        edgeCount: graph.edges.size,
        blockedEdges: graph.blockedEdgeCount,
        restrictedEdges: graph.restrictedEdgeCount,
        restrictedMultiplier: multiplier,
        graphLoadMs,
        safetyDisclaimer: 'Open OSM/graph edges represent simulated passability only; never verified hazard-safe.',
      },
      snapping: {
        originNode: origSnap.node,
        originSnapM: origSnap.snapDistanceMeters,
        destinationNode: destSnap.node,
        destinationSnapM: destSnap.snapDistanceMeters,
      },
      result,
    });
  });

  router.post('/routes/compare', (req, res) => {
    const { scenarioId, origin, destination, costMode = 'travel_time_s', recordSteps = true } = req.body ?? {};
    const scenario = getActiveScenario(db, scenarioId);
    if (!scenario) {
      res.status(404).json({ error: 'Scenario not found.' });
      return;
    }

    const mode: CostMode = costMode === 'distance_m' ? 'distance_m' : 'travel_time_s';
    const multiplier = getRestrictedMultiplier(db);
    const tGraph0 = performance.now();
    const graph = getGraphSnapshot(db, scenario.id, multiplier);
    const graphLoadMs = Math.round((performance.now() - tGraph0) * 1000) / 1000;

    const origSnap = resolveEndpointNode(graph, origin || {});
    if (!origSnap.ok || !origSnap.node) {
      res.status(400).json({ error: `Origin snap failed: ${origSnap.error}` });
      return;
    }
    const destSnap = resolveEndpointNode(graph, destination || {});
    if (!destSnap.ok || !destSnap.node) {
      res.status(400).json({ error: `Destination snap failed: ${destSnap.error}` });
      return;
    }

    const dijkstra = runDijkstra(graph, origSnap.node.id, destSnap.node.id, mode, Boolean(recordSteps));
    const astar = runAStar(graph, origSnap.node.id, destSnap.node.id, mode, Boolean(recordSteps));
    const bfs = runBFS(graph, origSnap.node.id, destSnap.node.id, Boolean(recordSteps));

    const insRun = db.prepare(
      `INSERT INTO algorithm_runs
       (id, scenario_id, graph_version, closure_version, algorithm_name, parameters_json, input_metadata_json, results_json, runtime_ms, memory_bytes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const runGroupId = randomUUID();
    for (const r of [dijkstra, astar]) {
      insRun.run(
        randomUUID(),
        scenario.id,
        graph.networkVersion,
        graph.closureVersion,
        r.algorithm,
        JSON.stringify({ costMode: mode, originNode: origSnap.node.id, targetNode: destSnap.node.id, compareGroup: runGroupId }),
        JSON.stringify({ nodes: graph.nodes.size, edges: graph.edges.size, blockedEdges: graph.blockedEdgeCount }),
        JSON.stringify({
          status: r.status,
          totalCost: r.totalCost,
          totalDistanceM: r.totalDistanceM,
          estimatedTravelTimeS: r.estimatedTravelTimeS,
          visitedNodesCount: r.visitedNodesCount,
          relaxationsCount: r.relaxationsCount,
        }),
        r.runtimeMs,
        r.heapDeltaBytes
      );
    }

    const costMatch =
      dijkstra.status === 'found' &&
      astar.status === 'found' &&
      Math.abs(dijkstra.totalCost - astar.totalCost) < 0.05;
    const sameEdgeSequence =
      dijkstra.pathEdgeIds.join('|') === astar.pathEdgeIds.join('|');

    res.json({
      compareGroupId: runGroupId,
      scenarioId: scenario.id,
      costMode: mode,
      graphMetadata: {
        networkVersion: graph.networkVersion,
        closureVersion: graph.closureVersion,
        nodeCount: graph.nodes.size,
        edgeCount: graph.edges.size,
        blockedEdges: graph.blockedEdgeCount,
        restrictedEdges: graph.restrictedEdgeCount,
        restrictedMultiplier: multiplier,
        graphLoadMs,
      },
      snapping: {
        originNode: origSnap.node,
        originSnapM: origSnap.snapDistanceMeters,
        destinationNode: destSnap.node,
        destinationSnapM: destSnap.snapDistanceMeters,
      },
      dijkstra,
      astar,
      bfsSummary: {
        reachableCount: bfs.reachableCount,
        totalNodes: bfs.totalNodes,
        targetReachable: bfs.targetReachable,
        hopDistanceToTarget: bfs.hopDistanceToTarget,
        runtimeMs: bfs.runtimeMs,
      },
      comparisonAnalysis: {
        optimalCostVerifiedEqual: costMatch,
        identicalEdgePath: sameEdgeSequence,
        visitedReduction: dijkstra.visitedNodesCount - astar.visitedNodesCount,
        relaxationReduction: dijkstra.relaxationsCount - astar.relaxationsCount,
        note:
          costMatch && !sameEdgeSequence
            ? 'Dijkstra and A* found distinct edge sequences with equal optimal total cost (tie-break difference).'
            : 'Both optimal algorithms evaluated on the identical graph snapshot, cost mode, and endpoints.',
      },
    });
  });

  router.get('/routes/runs', (req, res) => {
    const scenarioId = req.query.scenarioId as string | undefined;
    const rows = scenarioId
      ? db
          .prepare('SELECT * FROM algorithm_runs WHERE scenario_id = ? ORDER BY created_at DESC LIMIT 50')
          .all(scenarioId)
      : db.prepare('SELECT * FROM algorithm_runs ORDER BY created_at DESC LIMIT 50').all();
    res.json({ items: rows });
  });

  router.get('/routes/runs/:id', (req, res) => {
    const row = db.prepare('SELECT * FROM algorithm_runs WHERE id = ?').get(req.params.id);
    if (!row) {
      res.status(404).json({ error: 'Algorithm run not found.' });
      return;
    }
    res.json({ item: row });
  });

  // ==========================================
  // 9. PHASE 4 — MULTI-INCIDENT DISPATCH
  // ==========================================
  router.post('/dispatch/plan', (req, res) => {
    const { scenarioId, algorithm = 'compare', costMode = 'travel_time_s' } = req.body ?? {};
    const scenario = getActiveScenario(db, scenarioId);
    if (!scenario) {
      res.status(404).json({ error: 'Scenario not found.' });
      return;
    }

    const mode: CostMode = costMode === 'distance_m' ? 'distance_m' : 'travel_time_s';
    const multiplier = getRestrictedMultiplier(db);
    const graph = getGraphSnapshot(db, scenario.id, multiplier);

    const incidents = db
      .prepare('SELECT * FROM incidents WHERE scenario_id = ?')
      .all(scenario.id) as unknown as IncidentRecord[];
    const teams = db
      .prepare('SELECT * FROM rescue_teams WHERE scenario_id = ?')
      .all(scenario.id) as unknown as RescueTeamRecord[];

    const { eligibleIncidents, eligibleTeams } = prepareDispatchInputs(incidents, teams);
    const matrix = buildFeasibleRouteMatrix(graph, eligibleTeams, eligibleIncidents, mode);

    const runGreedy = algorithm === 'greedy' || algorithm === 'compare';
    const runMcmf = algorithm === 'mcmf' || algorithm === 'compare';

    const greedyPlan = runGreedy
      ? runGreedyDispatch(eligibleIncidents, eligibleTeams, matrix, mode)
      : null;
    const mcmfPlan = runMcmf
      ? runMcmfDispatch(eligibleIncidents, eligibleTeams, matrix, mode)
      : null;

    const insRun = db.prepare(
      `INSERT INTO algorithm_runs
       (id, scenario_id, graph_version, closure_version, algorithm_name, parameters_json, input_metadata_json, results_json, runtime_ms, memory_bytes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
    );

    if (greedyPlan) {
      insRun.run(
        randomUUID(),
        scenario.id,
        graph.networkVersion,
        graph.closureVersion,
        'greedy_dispatch',
        JSON.stringify({ costMode: mode }),
        JSON.stringify({ eligibleTeams: eligibleTeams.length, eligibleIncidents: eligibleIncidents.length }),
        JSON.stringify({
          totalAssigned: greedyPlan.totalAssignedTeams,
          totalRequested: greedyPlan.totalRequestedTeams,
          unmetDemand: greedyPlan.totalUnmetDemand,
          totalDispatchCost: greedyPlan.totalDispatchCost,
          tierSummary: greedyPlan.tierSummary,
        }),
        greedyPlan.runtimeMs
      );
    }

    if (mcmfPlan) {
      insRun.run(
        randomUUID(),
        scenario.id,
        graph.networkVersion,
        graph.closureVersion,
        'mcmf_dispatch',
        JSON.stringify({ costMode: mode }),
        JSON.stringify({ eligibleTeams: eligibleTeams.length, eligibleIncidents: eligibleIncidents.length }),
        JSON.stringify({
          totalAssigned: mcmfPlan.totalAssignedTeams,
          totalRequested: mcmfPlan.totalRequestedTeams,
          unmetDemand: mcmfPlan.totalUnmetDemand,
          totalDispatchCost: mcmfPlan.totalDispatchCost,
          tierSummary: mcmfPlan.tierSummary,
        }),
        mcmfPlan.runtimeMs
      );
    }

    res.json({
      scenarioId: scenario.id,
      graphVersion: `${graph.networkVersion}-v${graph.closureVersion}`,
      costMode: mode,
      snapshotSummary: {
        eligibleVerifiedOpenIncidents: eligibleIncidents.length,
        eligibleAvailableTeams: eligibleTeams.length,
        totalRequestedTeamSlots: eligibleIncidents.reduce((s, i) => s + i.requestedTeams, 0),
        matrixPrepMs: matrix.matrixPrepMs,
      },
      greedy: greedyPlan,
      mcmf: mcmfPlan,
    });
  });

  router.get('/dispatch/assignments', (req, res) => {
    const scenario = getActiveScenario(db, req.query.scenarioId as string | undefined);
    if (!scenario) {
      res.json({ items: [] });
      return;
    }

    const rows = db
      .prepare(
        `SELECT a.*, i.title as incident_title, i.severity as incident_severity, i.locality as incident_locality,
                i.lat as incident_lat, i.lng as incident_lng,
                t.name as team_name, t.category as team_category, t.vehicle_mode as team_vehicle_mode,
                t.current_lat as team_lat, t.current_lng as team_lng
         FROM rescue_assignments a
         JOIN incidents i ON i.id = a.incident_id
         JOIN rescue_teams t ON t.id = a.team_id
         WHERE a.scenario_id = ?
         ORDER BY a.created_at DESC`
      )
      .all(scenario.id);

    res.json({ items: rows, scenarioId: scenario.id });
  });

  router.post(
    '/dispatch/approve',
    requireAuth,
    requireRole(['admin', 'dispatcher']),
    (req: AuthenticatedRequest, res) => {
      const { scenarioId, algorithmSource = 'mcmf', assignments } = req.body ?? {};
      const scenario = getActiveScenario(db, scenarioId);
      if (!scenario || !Array.isArray(assignments) || assignments.length === 0) {
        res.status(400).json({ error: 'Valid scenarioId and non-empty assignments array are required.' });
        return;
      }

      const createdIds: string[] = [];
      db.exec('BEGIN IMMEDIATE;');
      try {
        for (const a of assignments) {
          const team = db
            .prepare('SELECT id, status, name FROM rescue_teams WHERE id = ? AND scenario_id = ?')
            .get(a.teamId, scenario.id) as { id: string; status: string; name: string } | undefined;

          if (!team || team.status !== 'available') {
            throw new Error(`DOUBLE_BOOKING_PREVENTED: Team ${a.teamId} is no longer available.`);
          }

          const inc = db
            .prepare('SELECT id, status, verification_status FROM incidents WHERE id = ? AND scenario_id = ?')
            .get(a.incidentId, scenario.id) as
            | { id: string; status: string; verification_status: string }
            | undefined;

          if (!inc || inc.verification_status !== 'verified' || !['open', 'assigned'].includes(inc.status)) {
            throw new Error(`INVALID_INCIDENT: Incident ${a.incidentId} is not verified and open.`);
          }

          const assignId = `asg-${randomUUID().slice(0, 8)}`;
          db.prepare(
            `INSERT INTO rescue_assignments
             (id, scenario_id, incident_id, team_id, status, algorithm_source, proposed_route_json, cost, distance_m, travel_time_s, approved_by)
             VALUES (?, ?, ?, ?, 'approved', ?, ?, ?, ?, ?, ?)`
          ).run(
            assignId,
            scenario.id,
            a.incidentId,
            a.teamId,
            algorithmSource,
            JSON.stringify({
              geometryCoordinates: a.geometryCoordinates || [],
              routeNodeIds: a.routeNodeIds || [],
              routeEdgeIds: a.routeEdgeIds || [],
              roadNames: a.roadNames || [],
            }),
            Number(a.cost) || 0,
            Number(a.distanceM) || 0,
            Number(a.travelTimeS) || 0,
            req.user!.sub
          );

          db.prepare("UPDATE rescue_teams SET status = 'assigned', updated_at = datetime('now') WHERE id = ?").run(
            a.teamId
          );
          db.prepare("UPDATE incidents SET status = 'assigned', updated_at = datetime('now') WHERE id = ?").run(
            a.incidentId
          );
          createdIds.push(assignId);
        }

        writeAudit(db, req, 'DISPATCH_PLAN_APPROVED', 'scenario', scenario.id, {
          algorithmSource,
          approvedCount: createdIds.length,
        });

        db.exec('COMMIT;');
      } catch (err) {
        db.exec('ROLLBACK;');
        res.status(409).json({
          error: err instanceof Error ? err.message : 'Approval transaction failed.',
          code: 'APPROVAL_CONFLICT',
        });
        return;
      }

      broadcastEvent('dispatch:approved', { scenarioId: scenario.id, count: createdIds.length });
      res.status(201).json({ ok: true, assignmentIds: createdIds });
    }
  );

  router.patch(
    '/dispatch/assignments/:id/status',
    requireAuth,
    requireRole(['admin', 'dispatcher']),
    (req: AuthenticatedRequest, res) => {
      const existing = db
        .prepare('SELECT * FROM rescue_assignments WHERE id = ?')
        .get(req.params.id) as RescueAssignmentRecord | undefined;

      if (!existing) {
        res.status(404).json({ error: 'Assignment not found.' });
        return;
      }

      const nextStatus = req.body?.status as AssignmentStatus;
      const allowed = VALID_ASSIGNMENT_TRANSITIONS[existing.status] || [];
      if (!allowed.includes(nextStatus)) {
        res.status(400).json({
          error: `Invalid state transition from '${existing.status}' to '${nextStatus}'. Allowed: ${allowed.join(', ') || 'none'}.`,
        });
        return;
      }

      db.exec('BEGIN;');
      try {
        db.prepare(
          `UPDATE rescue_assignments SET status = ?, updated_at = datetime('now') WHERE id = ?`
        ).run(nextStatus, existing.id);

        const routeData = JSON.parse(existing.proposed_route_json || '{}') as {
          geometryCoordinates?: Array<[number, number]>;
        };
        const coords = routeData.geometryCoordinates || [];

        if (nextStatus === 'dispatched') {
          db.prepare("UPDATE rescue_teams SET status = 'assigned', updated_at = datetime('now') WHERE id = ?").run(
            existing.team_id
          );
        } else if (nextStatus === 'en_route') {
          // Advance simulated position to midpoint of computed road route geometry
          if (coords.length > 0) {
            const mid = coords[Math.floor(coords.length / 2)];
            db.prepare(
              "UPDATE rescue_teams SET status = 'en_route', current_lng = ?, current_lat = ?, updated_at = datetime('now') WHERE id = ?"
            ).run(mid[0], mid[1], existing.team_id);
          } else {
            db.prepare("UPDATE rescue_teams SET status = 'en_route', updated_at = datetime('now') WHERE id = ?").run(
              existing.team_id
            );
          }
        } else if (nextStatus === 'arrived') {
          if (coords.length > 0) {
            const end = coords[coords.length - 1];
            db.prepare(
              "UPDATE rescue_teams SET status = 'on_scene', current_lng = ?, current_lat = ?, updated_at = datetime('now') WHERE id = ?"
            ).run(end[0], end[1], existing.team_id);
          } else {
            db.prepare("UPDATE rescue_teams SET status = 'on_scene', updated_at = datetime('now') WHERE id = ?").run(
              existing.team_id
            );
          }
        } else if (nextStatus === 'completed') {
          db.prepare("UPDATE rescue_teams SET status = 'available', updated_at = datetime('now') WHERE id = ?").run(
            existing.team_id
          );
          const remainingActive = (
            db
              .prepare(
                "SELECT COUNT(*) as c FROM rescue_assignments WHERE incident_id = ? AND id != ? AND status NOT IN ('completed', 'cancelled')"
              )
              .get(existing.incident_id, existing.id) as { c: number }
          ).c;
          if (remainingActive === 0) {
            db.prepare("UPDATE incidents SET status = 'resolved', updated_at = datetime('now') WHERE id = ?").run(
              existing.incident_id
            );
          }
        } else if (nextStatus === 'cancelled') {
          db.prepare("UPDATE rescue_teams SET status = 'available', updated_at = datetime('now') WHERE id = ?").run(
            existing.team_id
          );
          const remainingActive = (
            db
              .prepare(
                "SELECT COUNT(*) as c FROM rescue_assignments WHERE incident_id = ? AND id != ? AND status NOT IN ('completed', 'cancelled')"
              )
              .get(existing.incident_id, existing.id) as { c: number }
          ).c;
          if (remainingActive === 0) {
            db.prepare("UPDATE incidents SET status = 'open', updated_at = datetime('now') WHERE id = ?").run(
              existing.incident_id
            );
          }
        }

        writeAudit(db, req, 'ASSIGNMENT_STATUS_UPDATED', 'rescue_assignment', existing.id, {
          from: existing.status,
          to: nextStatus,
          teamId: existing.team_id,
          incidentId: existing.incident_id,
        });

        db.exec('COMMIT;');
      } catch (err) {
        db.exec('ROLLBACK;');
        throw err;
      }

      const updated = db.prepare('SELECT * FROM rescue_assignments WHERE id = ?').get(existing.id);
      broadcastEvent('assignment:updated', { scenarioId: existing.scenario_id, assignment: updated });
      res.json({ item: updated });
    }
  );

  // ==========================================
  // 10. CITIZEN & VOLUNTEER PORTAL
  // ==========================================
  router.post('/portal/incidents', (req, res) => {
    const {
      title,
      description = '',
      category = 'flood_rescue',
      severity = 'high',
      lat,
      lng,
      locality = 'Chennai Study Area',
      affectedPeopleEstimate = 4,
      requiredCapabilities = ['general_rescue'],
      reporterDisplayName = 'Simulated Citizen Reporter',
      scenarioId,
    } = req.body ?? {};

    if (
      typeof title !== 'string' ||
      title.trim().length < 3 ||
      !['critical', 'high', 'medium', 'low'].includes(severity) ||
      typeof lat !== 'number' ||
      typeof lng !== 'number' ||
      lat < 12.7 ||
      lat > 13.4 ||
      lng < 79.9 ||
      lng > 80.5
    ) {
      res.status(400).json({
        error: 'Valid incident title, severity, and Chennai study-area coordinates are required.',
      });
      return;
    }

    const scenario = getActiveScenario(db, scenarioId);
    if (!scenario) {
      res.status(404).json({ error: 'Active scenario not found.' });
      return;
    }

    const id = `inc-cit-${randomUUID().slice(0, 8)}`;
    // Citizens can ONLY submit unverified incidents; verification requires admin/dispatcher review
    db.prepare(
      `INSERT INTO incidents
       (id, title, description, category, severity, lat, lng, locality, affected_people_estimate,
        required_capabilities_json, requested_teams, verification_status, status, reporter_name, scenario_id, is_simulated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'unverified', 'open', ?, ?, 1)`
    ).run(
      id,
      title.trim(),
      String(description).trim(),
      category,
      severity,
      lat,
      lng,
      locality,
      Math.max(1, Number(affectedPeopleEstimate) || 1),
      JSON.stringify(Array.isArray(requiredCapabilities) ? requiredCapabilities : ['general_rescue']),
      String(reporterDisplayName).trim().slice(0, 60),
      scenario.id
    );

    db.prepare(
      `INSERT INTO audit_logs (id, actor_id, actor_name, action, entity_type, entity_id, metadata_json)
       VALUES (?, NULL, 'Citizen Portal', 'PORTAL_INCIDENT_SUBMITTED', 'incident', ?, ?)`
    ).run(randomUUID(), id, JSON.stringify({ scenarioId: scenario.id, verificationStatus: 'unverified' }));

    const created = db
      .prepare(
        'SELECT id, title, severity, locality, lat, lng, verification_status, status, created_at FROM incidents WHERE id = ?'
      )
      .get(id);
    broadcastEvent('incident:created', { scenarioId: scenario.id, incident: created });
    res.status(201).json({
      item: created,
      note: 'Simulated citizen report submitted. Remains unverified until reviewed by command staff.',
    });
  });

  router.get('/portal/volunteers', (req, res) => {
    const scenario = getActiveScenario(db, req.query.scenarioId as string | undefined);
    if (!scenario) {
      res.json({ items: [] });
      return;
    }
    // Privacy-preserving projection: only display_name, locality, capabilities, availability_status
    const rows = db
      .prepare(
        `SELECT id, display_name, locality, capabilities_json, availability_status, scenario_id, created_at
         FROM volunteers WHERE scenario_id = ? ORDER BY created_at DESC`
      )
      .all(scenario.id);
    res.json({ items: rows, scenarioId: scenario.id });
  });

  router.post('/portal/volunteers', (req, res) => {
    const {
      displayName,
      locality = 'Velachery',
      capabilities = ['first_aid'],
      availabilityStatus = 'available',
      scenarioId,
    } = req.body ?? {};

    if (typeof displayName !== 'string' || displayName.trim().length < 2) {
      res.status(400).json({ error: 'Display name (>=2 chars) is required.' });
      return;
    }
    if (!['available', 'standby', 'unavailable'].includes(availabilityStatus)) {
      res.status(400).json({ error: 'Invalid availabilityStatus.' });
      return;
    }

    const scenario = getActiveScenario(db, scenarioId);
    if (!scenario) {
      res.status(404).json({ error: 'Scenario not found.' });
      return;
    }

    const id = `vol-${randomUUID().slice(0, 8)}`;
    db.prepare(
      `INSERT INTO volunteers (id, display_name, locality, capabilities_json, availability_status, scenario_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      displayName.trim().slice(0, 60),
      String(locality).trim(),
      JSON.stringify(Array.isArray(capabilities) ? capabilities : ['first_aid']),
      availabilityStatus,
      scenario.id
    );

    const created = db
      .prepare(
        'SELECT id, display_name, locality, capabilities_json, availability_status, scenario_id, created_at FROM volunteers WHERE id = ?'
      )
      .get(id);
    broadcastEvent('volunteer:updated', { scenarioId: scenario.id, volunteer: created });
    res.status(201).json({ item: created });
  });

  router.patch('/portal/volunteers/:id', (req, res) => {
    const { availabilityStatus } = req.body ?? {};
    if (!['available', 'standby', 'unavailable'].includes(availabilityStatus)) {
      res.status(400).json({ error: 'Invalid availabilityStatus.' });
      return;
    }
    const existing = db.prepare('SELECT id, scenario_id FROM volunteers WHERE id = ?').get(req.params.id) as
      | { id: string; scenario_id: string }
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Volunteer record not found.' });
      return;
    }
    db.prepare('UPDATE volunteers SET availability_status = ? WHERE id = ?').run(availabilityStatus, existing.id);
    const updated = db
      .prepare(
        'SELECT id, display_name, locality, capabilities_json, availability_status, scenario_id, created_at FROM volunteers WHERE id = ?'
      )
      .get(existing.id);
    broadcastEvent('volunteer:updated', { scenarioId: existing.scenario_id, volunteer: updated });
    res.json({ item: updated });
  });

  // ==========================================
  // 11. PHASE 5 — ANALYTICS, BENCHMARKS & SETTINGS
  // ==========================================
  router.get('/analytics/summary', (req, res) => {
    const scenario = getActiveScenario(db, req.query.scenarioId as string | undefined);
    const runs = db
      .prepare('SELECT * FROM algorithm_runs ORDER BY created_at DESC LIMIT 120')
      .all() as Array<{
      id: string;
      scenario_id: string;
      graph_version: string;
      closure_version: number;
      algorithm_name: string;
      parameters_json: string;
      input_metadata_json: string;
      results_json: string;
      runtime_ms: number | null;
      memory_bytes: number | null;
      created_at: string;
    }>;

    const latestBenchmark = runs.find((r) => r.algorithm_name === 'benchmark');
    res.json({
      scenarioId: scenario?.id ?? null,
      runs,
      latestBenchmark: latestBenchmark ? JSON.parse(latestBenchmark.results_json) : null,
    });
  });

  router.post('/analytics/benchmarks/run', (req, res) => {
    const { scenarioId, seed = 20251101, repetitions = 5 } = req.body ?? {};
    const scenario = getActiveScenario(db, scenarioId);
    if (!scenario) {
      res.status(404).json({ error: 'Scenario not found.' });
      return;
    }

    const safeReps = Math.min(15, Math.max(2, Number(repetitions) || 5));
    const suite = runReproducibleBenchmarkSuite(db, scenario.id, Number(seed) || 20251101, safeReps);

    const runId = randomUUID();
    db.prepare(
      `INSERT INTO algorithm_runs
       (id, scenario_id, graph_version, closure_version, algorithm_name, parameters_json, input_metadata_json, results_json, runtime_ms, memory_bytes)
       VALUES (?, ?, ?, ?, 'benchmark', ?, ?, ?, ?, 0)`
    ).run(
      runId,
      scenario.id,
      GRAPH_NETWORK_VERSION,
      scenario.closure_version,
      JSON.stringify({ seed: suite.seed, repetitions: suite.repetitions, warmupRuns: suite.warmupRuns }),
      JSON.stringify(suite.environment),
      JSON.stringify(suite),
      suite.scalingCurve.reduce((acc, p) => acc + p.dijkstraMedianMs + p.astarMedianMs, 0)
    );

    res.json({ runId, benchmark: suite });
  });

  router.get('/analytics/export.csv', (_req, res) => {
    const runs = db
      .prepare('SELECT * FROM algorithm_runs ORDER BY created_at DESC LIMIT 250')
      .all() as Array<{
      id: string;
      scenario_id: string;
      graph_version: string;
      closure_version: number;
      algorithm_name: string;
      runtime_ms: number | null;
      memory_bytes: number | null;
      parameters_json: string;
      results_json: string;
      created_at: string;
    }>;

    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = [
      'id',
      'created_at',
      'scenario_id',
      'graph_version',
      'closure_version',
      'algorithm_name',
      'runtime_ms',
      'memory_bytes',
      'parameters_json',
      'results_json',
    ].join(',');

    const lines = runs.map((r) =>
      [
        esc(r.id),
        esc(r.created_at),
        esc(r.scenario_id),
        esc(r.graph_version),
        esc(r.closure_version),
        esc(r.algorithm_name),
        esc(r.runtime_ms ?? ''),
        esc(r.memory_bytes ?? ''),
        esc(r.parameters_json),
        esc(r.results_json),
      ].join(',')
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="resqgrid-algorithm-runs.csv"');
    res.send([header, ...lines].join('\n'));
  });

  router.get('/settings', (_req, res) => {
    const rows = db.prepare('SELECT key, value, updated_at FROM system_settings').all() as Array<{
      key: string;
      value: string;
      updated_at: string;
    }>;
    const settings: Record<string, string> = {};
    for (const r of rows) settings[r.key] = r.value;
    res.json({ settings });
  });

  router.patch(
    '/settings',
    requireAuth,
    requireRole(['admin']),
    (req: AuthenticatedRequest, res) => {
      const { restrictedMultiplier, snapRadiusM } = req.body ?? {};
      if (restrictedMultiplier !== undefined) {
        const val = Number(restrictedMultiplier);
        if (!Number.isFinite(val) || val < 1 || val > 20) {
          res.status(400).json({ error: 'restrictedMultiplier must be between 1.0 and 20.0.' });
          return;
        }
        db.prepare(
          `INSERT INTO system_settings (key, value, updated_at) VALUES ('restricted_multiplier', ?, datetime('now'))
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
        ).run(String(val));
        invalidateGraphCache();
      }
      if (snapRadiusM !== undefined) {
        const val = Number(snapRadiusM);
        if (!Number.isFinite(val) || val < 500 || val > 15000) {
          res.status(400).json({ error: 'snapRadiusM must be between 500 and 15000 meters.' });
          return;
        }
        db.prepare(
          `INSERT INTO system_settings (key, value, updated_at) VALUES ('snap_radius_m', ?, datetime('now'))
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
        ).run(String(val));
      }

      writeAudit(db, req, 'SETTINGS_UPDATED', 'system', 'settings', req.body ?? {});
      const rows = db.prepare('SELECT key, value FROM system_settings').all() as Array<{
        key: string;
        value: string;
      }>;
      const settings: Record<string, string> = {};
      for (const r of rows) settings[r.key] = r.value;
      res.json({ settings });
    }
  );

  return router;
}

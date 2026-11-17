import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  GitFork,
  Play,
  ShieldCheck,
  Users,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../app/AuthContext';
import { useScenario } from '../app/ScenarioContext';
import { ChennaiMap, type RouteOverlay } from '../components/maps/ChennaiMap';
import { EmptyState } from '../components/ui/EmptyState';
import { PageHeader } from '../components/ui/PageHeader';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useToast } from '../components/ui/Toast';
import { ApiError, apiRequest } from '../lib/api';
import {
  CAPABILITY_LABELS,
  formatDistance,
  formatDuration,
  formatRuntimeMs,
  parseCapabilities,
} from '../lib/format';
import type {
  AssignmentStatus,
  CostMode,
  DispatchPlanResult,
  Incident,
  PersistedAssignment,
  RescueTeam,
  RoadEdgeDto,
} from '../types/resqgrid';

interface PlanResponse {
  scenarioId: string;
  graphVersion: string;
  costMode: CostMode;
  snapshotSummary: {
    eligibleVerifiedOpenIncidents: number;
    eligibleAvailableTeams: number;
    totalRequestedTeamSlots: number;
    matrixPrepMs: number;
  };
  greedy: DispatchPlanResult | null;
  mcmf: DispatchPlanResult | null;
}

const NEXT_STATUS_ACTION: Partial<
  Record<AssignmentStatus, { next: AssignmentStatus; label: string }>
> = {
  approved: { next: 'dispatched', label: 'Dispatch' },
  dispatched: { next: 'en_route', label: 'Mark En Route (Sim)' },
  en_route: { next: 'arrived', label: 'Mark Arrived (Sim)' },
  arrived: { next: 'completed', label: 'Complete' },
};

export function DispatchPage() {
  const { selectedScenarioId, lastEventTick } = useScenario();
  const { canWrite } = useAuth();
  const { pushToast } = useToast();

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [teams, setTeams] = useState<RescueTeam[]>([]);
  const [edges, setEdges] = useState<RoadEdgeDto[]>([]);
  const [persisted, setPersisted] = useState<PersistedAssignment[]>([]);

  const [severityFilter, setSeverityFilter] = useState('all');
  const [capFilter, setCapFilter] = useState('all');
  const [costMode, setCostMode] = useState<CostMode>('travel_time_s');
  const [selectedPlanKey, setSelectedPlanKey] = useState<'mcmf' | 'greedy'>('mcmf');
  const [planResult, setPlanResult] = useState<PlanResponse | null>(null);
  const [busy, setBusy] = useState(false);

  const loadWorkspace = useCallback(async () => {
    try {
      const q = selectedScenarioId ? `?scenarioId=${encodeURIComponent(selectedScenarioId)}` : '';
      const [feat, asgRes] = await Promise.all([
        apiRequest<{ edges: RoadEdgeDto[]; incidents: Incident[]; teams: RescueTeam[] }>(
          `/map/features${q}`
        ),
        apiRequest<{ items: PersistedAssignment[] }>(`/dispatch/assignments${q}`),
      ]);
      setEdges(feat.edges);
      setIncidents(feat.incidents);
      setTeams(feat.teams);
      setPersisted(asgRes.items);
    } catch (err) {
      pushToast('Load failed', err instanceof Error ? err.message : 'Error', 'error');
    }
  }, [selectedScenarioId, pushToast]);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace, lastEventTick]);

  const handleRunPlan = async (algorithm: 'greedy' | 'mcmf' | 'compare') => {
    setBusy(true);
    try {
      const res = await apiRequest<PlanResponse>('/dispatch/plan', {
        method: 'POST',
        body: JSON.stringify({
          scenarioId: selectedScenarioId,
          algorithm,
          costMode,
        }),
      });
      setPlanResult(res);
      if (algorithm === 'greedy') setSelectedPlanKey('greedy');
      if (algorithm === 'mcmf' || algorithm === 'compare') setSelectedPlanKey('mcmf');
      pushToast('Dispatch plan computed', `Evaluated on ${res.graphVersion}`, 'success');
    } catch (err) {
      pushToast('Planning failed', err instanceof ApiError ? err.message : 'Error', 'error');
    } finally {
      setBusy(false);
    }
  };

  const activePlan =
    selectedPlanKey === 'greedy' ? planResult?.greedy ?? null : planResult?.mcmf ?? null;

  const handleApprovePlan = async () => {
    if (!activePlan || activePlan.assignments.length === 0) return;
    setBusy(true);
    try {
      await apiRequest('/dispatch/approve', {
        method: 'POST',
        body: JSON.stringify({
          scenarioId: selectedScenarioId,
          algorithmSource: activePlan.algorithm,
          assignments: activePlan.assignments,
        }),
      });
      pushToast(
        'Dispatch Plan Approved',
        `${activePlan.assignments.length} assignment(s) persisted atomically.`,
        'success'
      );
      setPlanResult(null);
      await loadWorkspace();
    } catch (err) {
      pushToast('Approval failed', err instanceof ApiError ? err.message : 'Conflict', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleStatusStep = async (assignmentId: string, nextStatus: AssignmentStatus) => {
    try {
      await apiRequest(`/dispatch/assignments/${assignmentId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      pushToast('Status updated', `Assignment moved to ${nextStatus.replace('_', ' ')}.`, 'info');
      await loadWorkspace();
    } catch (err) {
      pushToast('Transition blocked', err instanceof ApiError ? err.message : 'Error', 'error');
    }
  };

  const verifiedOpenIncidents = incidents
    .filter((i) => i.verification_status === 'verified' && ['open', 'assigned'].includes(i.status))
    .filter((i) => severityFilter === 'all' || i.severity === severityFilter);

  const filteredTeams = teams.filter((t) => {
    if (capFilter === 'all') return true;
    const caps = parseCapabilities(t.capabilities_json);
    return caps.includes(capFilter) || caps.includes('multi_hazard');
  });

  const routeOverlays: RouteOverlay[] = [];
  if (activePlan) {
    for (const a of activePlan.assignments) {
      routeOverlays.push({
        id: `${a.teamId}-${a.incidentId}`,
        label: `Proposed: ${a.teamName} -> ${a.incidentTitle}`,
        color: selectedPlanKey === 'mcmf' ? '#14b8a6' : '#f59e0b',
        dashArray: '6 5',
        weight: 4,
        coordinates: a.geometryCoordinates,
      });
    }
  }
  for (const p of persisted) {
    if (['completed', 'cancelled'].includes(p.status)) continue;
    try {
      const parsed = JSON.parse(p.proposed_route_json || '{}') as {
        geometryCoordinates?: Array<[number, number]>;
      };
      if (parsed.geometryCoordinates && parsed.geometryCoordinates.length > 1) {
        routeOverlays.push({
          id: p.id,
          label: `Active (${p.status}): ${p.team_name} -> ${p.incident_title}`,
          color: '#38bdf8',
          weight: 5,
          coordinates: parsed.geometryCoordinates,
        });
      }
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Multi-Incident Rescue Dispatch Optimization"
        subtitle="Human-reviewed decision support comparing Greedy Baseline vs Lexicographic Min-Cost Max-Flow (MCMF)."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Dispatch cost model"
              value={costMode}
              onChange={(e) => setCostMode(e.target.value as CostMode)}
              className="rounded border border-slate-700 bg-[#0E1729] px-2.5 py-1.5 text-xs text-slate-100"
            >
              <option value="travel_time_s">Cost: Est. Travel Time (s)</option>
              <option value="distance_m">Cost: Road Distance (m)</option>
            </select>
            <button
              onClick={() => handleRunPlan('greedy')}
              disabled={busy}
              className="rounded border border-slate-700 bg-[#0E1729] hover:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200"
            >
              Generate Greedy Plan
            </button>
            <button
              onClick={() => handleRunPlan('mcmf')}
              disabled={busy}
              className="rounded border border-teal-500/40 bg-teal-950/40 hover:bg-teal-900/50 px-3 py-1.5 text-xs font-medium text-teal-300"
            >
              Optimize Dispatch (MCMF)
            </button>
            <button
              onClick={() => handleRunPlan('compare')}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded bg-teal-600 hover:bg-teal-500 px-3.5 py-1.5 text-xs font-medium text-white"
            >
              <GitFork className="w-3.5 h-3.5" />
              Compare Plans
            </button>
          </div>
        }
      />

      {/* 3-Panel Dispatch Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Panel 1: Verified Incident Demand Queue */}
        <div className="lg:col-span-3 rounded-lg border border-slate-800/90 bg-[#0E1729] p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-semibold text-slate-200">Verified Incident Queue</h2>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="rounded border border-slate-700 bg-[#070D19] px-2 py-1 text-[11px] text-slate-200"
            >
              <option value="all">All Tiers</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
            </select>
          </div>
          <div className="space-y-2 max-h-[480px] overflow-y-auto">
            {verifiedOpenIncidents.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">No verified open incidents.</p>
            ) : (
              verifiedOpenIncidents.map((inc) => (
                <div
                  key={inc.id}
                  className="rounded border border-slate-800 bg-[#070D19] p-3 text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <StatusBadge value={inc.severity} />
                    <StatusBadge value={inc.status} />
                  </div>
                  <p className="font-medium text-slate-100">{inc.title}</p>
                  <p className="text-[11px] text-slate-400">
                    {inc.locality} · Req Teams:{' '}
                    <span className="font-mono text-slate-200">{inc.requested_teams}</span>
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Needs:{' '}
                    {parseCapabilities(inc.required_capabilities_json)
                      .map((c) => CAPABILITY_LABELS[c] || c)
                      .join(', ')}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Panel 2: Rescue Teams & Capabilities */}
        <div className="lg:col-span-3 rounded-lg border border-slate-800/90 bg-[#0E1729] p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-teal-400" />
              Rescue Teams
            </h2>
            <select
              value={capFilter}
              onChange={(e) => setCapFilter(e.target.value)}
              className="rounded border border-slate-700 bg-[#070D19] px-2 py-1 text-[11px] text-slate-200"
            >
              <option value="all">All Capabilities</option>
              <option value="boat_water">Boat / Water</option>
              <option value="medical">Medical Triage</option>
              <option value="heavy_rescue">Heavy Rescue</option>
            </select>
          </div>
          <div className="space-y-2 max-h-[480px] overflow-y-auto">
            {filteredTeams.map((t) => (
              <div
                key={t.id}
                className="rounded border border-slate-800 bg-[#070D19] p-3 text-xs space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-100 truncate">{t.name}</span>
                  <StatusBadge value={t.status} />
                </div>
                <p className="text-[11px] text-slate-400">
                  {t.home_base_name} · {t.personnel_count} staff (Cap {t.capacity})
                </p>
                <p className="text-[11px] text-teal-400/90">
                  {parseCapabilities(t.capabilities_json)
                    .map((c) => CAPABILITY_LABELS[c] || c)
                    .join(' · ')}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Panel 3: Interactive Dispatch Map & Plan Comparison */}
        <div className="lg:col-span-6 space-y-4">
          <ChennaiMap
            heightClass="h-[340px]"
            edges={edges}
            incidents={incidents}
            teams={teams}
            routes={routeOverlays}
          />

          {planResult && (
            <div className="rounded-lg border border-slate-800/90 bg-[#0E1729] p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1 p-1 rounded bg-[#070D19] border border-slate-800">
                  {planResult.mcmf && (
                    <button
                      onClick={() => setSelectedPlanKey('mcmf')}
                      className={`px-3 py-1 rounded text-xs font-medium ${
                        selectedPlanKey === 'mcmf'
                          ? 'bg-teal-600 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      MCMF Optimizer ({planResult.mcmf.totalAssignedTeams}/
                      {planResult.mcmf.totalRequestedTeams})
                    </button>
                  )}
                  {planResult.greedy && (
                    <button
                      onClick={() => setSelectedPlanKey('greedy')}
                      className={`px-3 py-1 rounded text-xs font-medium ${
                        selectedPlanKey === 'greedy'
                          ? 'bg-amber-600 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Greedy Baseline ({planResult.greedy.totalAssignedTeams}/
                      {planResult.greedy.totalRequestedTeams})
                    </button>
                  )}
                </div>

                {canWrite && activePlan && activePlan.assignments.length > 0 && (
                  <button
                    onClick={handleApprovePlan}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded bg-emerald-600 hover:bg-emerald-500 px-3.5 py-1.5 text-xs font-medium text-white"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    Approve Selected Plan ({activePlan.algorithm.toUpperCase()})
                  </button>
                )}
              </div>

              {/* Greedy vs MCMF Comparison Table */}
              {planResult.greedy && planResult.mcmf && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400">
                        <th className="py-1.5 text-left">Metric (Same Snapshot)</th>
                        <th className="py-1.5 text-right text-amber-400">Greedy</th>
                        <th className="py-1.5 text-right text-teal-400">Lexicographic MCMF</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono tabular-nums">
                      <tr>
                        <td className="py-1.5 font-sans text-slate-300">Teams Assigned / Demand</td>
                        <td className="py-1.5 text-right">
                          {planResult.greedy.totalAssignedTeams}/{planResult.greedy.totalRequestedTeams}
                        </td>
                        <td className="py-1.5 text-right">
                          {planResult.mcmf.totalAssignedTeams}/{planResult.mcmf.totalRequestedTeams}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1.5 font-sans text-slate-300">Critical Tier Assigned</td>
                        <td className="py-1.5 text-right">
                          {planResult.greedy.tierSummary.critical.assigned}/
                          {planResult.greedy.tierSummary.critical.requested}
                        </td>
                        <td className="py-1.5 text-right">
                          {planResult.mcmf.tierSummary.critical.assigned}/
                          {planResult.mcmf.tierSummary.critical.requested}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1.5 font-sans text-slate-300">Total Dispatch Cost</td>
                        <td className="py-1.5 text-right">
                          {costMode === 'distance_m'
                            ? formatDistance(planResult.greedy.totalDispatchCost)
                            : formatDuration(planResult.greedy.totalDispatchCost)}
                        </td>
                        <td className="py-1.5 text-right">
                          {costMode === 'distance_m'
                            ? formatDistance(planResult.mcmf.totalDispatchCost)
                            : formatDuration(planResult.mcmf.totalDispatchCost)}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1.5 font-sans text-slate-300">Algo-Only Runtime</td>
                        <td className="py-1.5 text-right">
                          {formatRuntimeMs(planResult.greedy.runtimeMs)}
                        </td>
                        <td className="py-1.5 text-right">
                          {formatRuntimeMs(planResult.mcmf.runtimeMs)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {activePlan && (
                <div className="space-y-2 text-xs">
                  <p className="text-[11px] text-slate-400">{activePlan.objectiveNote}</p>
                  {activePlan.assignments.map((a) => (
                    <div
                      key={`${a.teamId}-${a.incidentId}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-800 bg-[#070D19] px-3 py-2"
                    >
                      <div>
                        <p className="font-medium text-slate-100">
                          {a.teamName} {'->'} {a.incidentTitle}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          Corridors: {a.roadNames.slice(0, 3).join(' -> ')}
                        </p>
                      </div>
                      <div className="font-mono text-right text-[11px] text-teal-400">
                        <div>{formatDistance(a.distanceM)}</div>
                        <div className="text-slate-400">{formatDuration(a.travelTimeS)}</div>
                      </div>
                    </div>
                  ))}

                  {activePlan.unassigned.length > 0 && (
                    <div className="rounded border border-amber-800/60 bg-amber-950/20 p-3 space-y-1.5">
                      <p className="font-semibold text-amber-300">Unmet Demand Breakdown</p>
                      {activePlan.unassigned.map((u) => (
                        <div key={u.incidentId} className="text-[11px] text-amber-200/90">
                          <strong>{u.incidentTitle}</strong> ({u.unmetDemand} unmet): {u.explanation}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Persisted Assignments Execution Workflow */}
      <div className="space-y-3 pt-2">
        <h2 className="text-sm font-semibold text-slate-100">
          Approved &amp; Active Rescue Assignments (Simulated Movement Workflow)
        </h2>
        {persisted.length === 0 ? (
          <EmptyState
            title="No approved dispatch assignments yet"
            description="Run Compare Plans above and click Approve Selected Plan to commit human-reviewed assignments."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {persisted.map((asg) => {
              const nextAction = NEXT_STATUS_ACTION[asg.status];
              return (
                <div
                  key={asg.id}
                  className="rounded-lg border border-slate-800/90 bg-[#0E1729] p-4 text-xs space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] text-slate-400">
                      {asg.algorithm_source.toUpperCase()} · {asg.id}
                    </span>
                    <StatusBadge value={asg.status} />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-100">{asg.team_name}</p>
                    <p className="text-slate-400">Assigned to: {asg.incident_title}</p>
                  </div>
                  <div className="flex items-center justify-between font-mono text-[11px] text-slate-400">
                    <span>Dist: {formatDistance(asg.distance_m)}</span>
                    <span>Sim ETA: {formatDuration(asg.travel_time_s)}</span>
                  </div>
                  {canWrite && !['completed', 'cancelled'].includes(asg.status) && (
                    <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
                      {nextAction && (
                        <button
                          onClick={() => handleStatusStep(asg.id, nextAction.next)}
                          className="flex-1 inline-flex items-center justify-center gap-1 rounded bg-teal-600 hover:bg-teal-500 py-1.5 font-medium text-white"
                        >
                          {nextAction.next === 'completed' ? (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          ) : (
                            <Play className="w-3.5 h-3.5" />
                          )}
                          {nextAction.label}
                        </button>
                      )}
                      <button
                        onClick={() => handleStatusStep(asg.id, 'cancelled')}
                        className="inline-flex items-center gap-1 rounded border border-red-800/60 bg-red-950/30 hover:bg-red-900/40 px-2.5 py-1.5 text-red-300"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  Ban,
  Clock,
  GitFork,
  Map as MapIcon,
  ShieldCheck,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useScenario } from '../app/ScenarioContext';
import { ChennaiMap } from '../components/maps/ChennaiMap';
import { DataTable } from '../components/ui/DataTable';
import { ErrorState } from '../components/ui/ErrorState';
import { LoadingSkeleton } from '../components/ui/LoadingSkeleton';
import { PageHeader } from '../components/ui/PageHeader';
import { StatCard } from '../components/ui/StatCard';
import { StatusBadge } from '../components/ui/StatusBadge';
import { apiRequest } from '../lib/api';
import { formatDuration, formatTimestamp } from '../lib/format';
import type { AuditLogEntry, Incident, RescueTeam, RoadEdgeDto, Scenario } from '../types/resqgrid';

interface DashboardSummaryResponse {
  scenario: Scenario | null;
  kpis: {
    activeIncidents: number;
    criticalIncidents: number;
    availableTeams: number;
    totalTeams: number;
    blockedRoads: number;
    restrictedRoads: number;
    pendingDispatches: number;
    simulatedAvgResponseTimeS: number | null;
  };
  severityBreakdown: Array<{ severity: string; count: number }>;
  teamStatusBreakdown: Array<{ status: string; count: number }>;
  recentIncidents: Incident[];
  recentAuditLogs: AuditLogEntry[];
}

const SEV_ORDER = ['critical', 'high', 'medium', 'low'];
const SEV_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f59e0b',
  medium: '#38bdf8',
  low: '#64748b',
};

export function DashboardPage() {
  const { selectedScenarioId, lastEventTick } = useScenario();
  const [summary, setSummary] = useState<DashboardSummaryResponse | null>(null);
  const [mapPreview, setMapPreview] = useState<{
    edges: RoadEdgeDto[];
    incidents: Incident[];
    teams: RescueTeam[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const q = selectedScenarioId ? `?scenarioId=${encodeURIComponent(selectedScenarioId)}` : '';
      const [sumRes, mapRes] = await Promise.all([
        apiRequest<DashboardSummaryResponse>(`/dashboard/summary${q}`),
        apiRequest<{ edges: RoadEdgeDto[]; incidents: Incident[]; teams: RescueTeam[] }>(
          `/map/features${q}`
        ),
      ]);
      setSummary(sumRes);
      setMapPreview(mapRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load command center overview.');
    } finally {
      setLoading(false);
    }
  }, [selectedScenarioId]);

  useEffect(() => {
    loadData();
  }, [loadData, lastEventTick]);

  if (loading && !summary) {
    return (
      <div className="space-y-6">
        <PageHeader title="Command Center Overview" subtitle="Loading active scenario telemetry..." />
        <LoadingSkeleton rows={6} />
      </div>
    );
  }

  if (error && !summary) {
    return <ErrorState message={error} onRetry={loadData} />;
  }

  const kpis = summary?.kpis;
  const severityChartData = SEV_ORDER.map((sev) => ({
    severity: sev.charAt(0).toUpperCase() + sev.slice(1),
    key: sev,
    count: summary?.severityBreakdown.find((s) => s.severity === sev)?.count ?? 0,
  }));

  const teamChartData = (summary?.teamStatusBreakdown ?? []).map((t) => ({
    status: t.status.replace('_', ' '),
    count: t.count,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Command Center Overview"
        subtitle={
          summary?.scenario
            ? `Active Simulated Scenario: ${summary.scenario.name} · Seed #${summary.scenario.simulation_seed}`
            : 'No scenario active'
        }
        actions={
          <>
            <Link
              to="/map"
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-[#0E1729] hover:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors"
            >
              <MapIcon className="w-3.5 h-3.5 text-teal-400" />
              Open GIS Map
            </Link>
            <Link
              to="/dispatch"
              className="inline-flex items-center gap-1.5 rounded-md bg-teal-600 hover:bg-teal-500 px-3 py-1.5 text-xs font-medium text-white transition-colors"
            >
              <GitFork className="w-3.5 h-3.5" />
              Optimize Dispatch
            </Link>
          </>
        }
      />

      {/* Simulation Truthfulness Notice */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-200/90">
        <span>
          Academic Simulation Prototype — All Chennai incidents, road closures, and travel times are
          simulated for DAA algorithm evaluation.
        </span>
        <span className="font-mono text-[11px] text-amber-300">
          Closure Snapshot v{summary?.scenario?.closure_version ?? 1}
        </span>
      </div>

      {/* 6 Database-Backed KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          label="Active Incidents"
          value={kpis?.activeIncidents ?? 0}
          sublabel="Open or assigned in scenario"
          tone="accent"
          icon={<AlertTriangle className="w-4 h-4" />}
        />
        <StatCard
          label="Critical Incidents"
          value={kpis?.criticalIncidents ?? 0}
          sublabel="Highest dispatch tier"
          tone={(kpis?.criticalIncidents ?? 0) > 0 ? 'critical' : 'neutral'}
          icon={<AlertOctagon className="w-4 h-4" />}
        />
        <StatCard
          label="Available Teams"
          value={`${kpis?.availableTeams ?? 0} / ${kpis?.totalTeams ?? 0}`}
          sublabel="Ready for assignment"
          tone="success"
          icon={<Users className="w-4 h-4" />}
        />
        <StatCard
          label="Blocked Roads"
          value={kpis?.blockedRoads ?? 0}
          sublabel={`${kpis?.restrictedRoads ?? 0} restricted segments`}
          tone={(kpis?.blockedRoads ?? 0) > 0 ? 'warning' : 'neutral'}
          icon={<Ban className="w-4 h-4" />}
        />
        <StatCard
          label="Pending Dispatches"
          value={kpis?.pendingDispatches ?? 0}
          sublabel="Approved / active routes"
          tone="neutral"
          icon={<ShieldCheck className="w-4 h-4" />}
        />
        <StatCard
          label="Sim. Avg Response"
          value={
            kpis?.simulatedAvgResponseTimeS !== null &&
            kpis?.simulatedAvgResponseTimeS !== undefined
              ? formatDuration(kpis.simulatedAvgResponseTimeS)
              : 'Not measured'
          }
          sublabel={
            kpis?.simulatedAvgResponseTimeS !== null
              ? 'From approved route times'
              : 'Approve dispatch to measure'
          }
          tone="neutral"
          icon={<Clock className="w-4 h-4" />}
        />
      </div>

      {/* Map Preview + Charts Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Study-Area Map Preview */}
        <div className="xl:col-span-7 rounded-lg border border-slate-800/90 bg-[#0E1729] p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">
                Chennai Metropolitan Study-Area Preview
              </h2>
              <p className="text-xs text-slate-400">
                Live road closures, simulated incidents, and staging depots
              </p>
            </div>
            <Link
              to="/map"
              className="inline-flex items-center gap-1 text-xs font-medium text-teal-400 hover:text-teal-300"
            >
              Full Map Workspace
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <ChennaiMap
            heightClass="h-[320px]"
            zoom={11}
            edges={mapPreview?.edges ?? []}
            incidents={mapPreview?.incidents ?? []}
            teams={mapPreview?.teams ?? []}
            showLayers={{
              roads: true,
              roadStatus: true,
              incidents: true,
              teams: true,
              studyBoundary: false,
            }}
          />
        </div>

        {/* Severity & Team Breakdown Charts */}
        <div className="xl:col-span-5 flex flex-col gap-5">
          <div className="rounded-lg border border-slate-800/90 bg-[#0E1729] p-4 flex-1">
            <h2 className="text-sm font-semibold text-slate-100">Incident Severity Distribution</h2>
            <p className="text-xs text-slate-400 mb-3">Count by priority tier (simulated records)</p>
            <div className="h-[140px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={severityChartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="severity" stroke="#94a3b8" fontSize={11} />
                  <YAxis stroke="#94a3b8" fontSize={11} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0A1120',
                      borderColor: '#334155',
                      fontSize: '12px',
                      color: '#f1f5f9',
                    }}
                  />
                  <Bar dataKey="count" name="Incidents" radius={[4, 4, 0, 0]}>
                    {severityChartData.map((entry) => (
                      <Cell key={entry.key} fill={SEV_COLORS[entry.key] || '#38bdf8'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-lg border border-slate-800/90 bg-[#0E1729] p-4 flex-1">
            <h2 className="text-sm font-semibold text-slate-100">Rescue Team Status Breakdown</h2>
            <p className="text-xs text-slate-400 mb-3">Units across active simulation scenario</p>
            {teamChartData.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">No teams seeded in scenario.</p>
            ) : (
              <div className="h-[130px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={teamChartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="status" stroke="#94a3b8" fontSize={11} />
                    <YAxis stroke="#94a3b8" fontSize={11} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0A1120',
                        borderColor: '#334155',
                        fontSize: '12px',
                        color: '#f1f5f9',
                      }}
                    />
                    <Bar dataKey="count" name="Teams" fill="#14b8a6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Incidents & Audit Feed */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <div className="xl:col-span-8 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-100">Recent Scenario Incidents</h2>
            <Link to="/incidents" className="text-xs text-teal-400 hover:text-teal-300 font-medium">
              View &amp; Filter All
            </Link>
          </div>
          <DataTable
            rows={summary?.recentIncidents ?? []}
            rowKey={(r) => r.id}
            columns={[
              {
                key: 'title',
                header: 'Incident',
                render: (r) => (
                  <div className="min-w-[180px]">
                    <p className="font-medium text-slate-100 text-xs sm:text-sm">{r.title}</p>
                    <p className="text-[11px] text-slate-400">
                      {r.locality} · {r.affected_people_estimate} est. affected
                    </p>
                  </div>
                ),
              },
              {
                key: 'severity',
                header: 'Severity',
                render: (r) => <StatusBadge value={r.severity} />,
              },
              {
                key: 'verification',
                header: 'Verification',
                render: (r) => <StatusBadge value={r.verification_status} />,
              },
              {
                key: 'status',
                header: 'Status',
                render: (r) => <StatusBadge value={r.status} />,
              },
              {
                key: 'teams',
                header: 'Teams Req',
                align: 'right',
                render: (r) => <span className="font-mono text-xs">{r.requested_teams}</span>,
              },
            ]}
          />
        </div>

        <div className="xl:col-span-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-teal-400" />
              Latest Audit Events
            </h2>
          </div>
          <div className="rounded-lg border border-slate-800/90 bg-[#0E1729] divide-y divide-slate-800/70">
            {(summary?.recentAuditLogs ?? []).length === 0 ? (
              <p className="p-4 text-xs text-slate-400 text-center">No audit events recorded.</p>
            ) : (
              summary?.recentAuditLogs.map((ev) => (
                <div key={ev.id} className="px-4 py-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-200 truncate">
                      {ev.action.replace(/_/g, ' ')}
                    </span>
                    <span className="font-mono text-[11px] text-slate-500 shrink-0">
                      {formatTimestamp(ev.created_at)}
                    </span>
                  </div>
                  <p className="text-slate-400 mt-0.5 truncate">
                    {ev.actor_name} · {ev.entity_type}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

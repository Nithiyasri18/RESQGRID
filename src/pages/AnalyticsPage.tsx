import { useCallback, useEffect, useState } from 'react';
import { Download, Play, Printer } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useScenario } from '../app/ScenarioContext';
import { DataTable } from '../components/ui/DataTable';
import { EmptyState } from '../components/ui/EmptyState';
import { PageHeader } from '../components/ui/PageHeader';
import { useToast } from '../components/ui/Toast';
import { API_URL_BASE, apiRequest } from '../lib/api';
import { formatRuntimeMs, formatTimestamp } from '../lib/format';
import type { BenchmarkSuiteResult } from '../types/resqgrid';

interface AlgorithmRunRow {
  id: string;
  scenario_id: string;
  graph_version: string;
  closure_version: number;
  algorithm_name: string;
  parameters_json: string;
  results_json: string;
  runtime_ms: number | null;
  memory_bytes: number | null;
  created_at: string;
}

export function AnalyticsPage() {
  const { selectedScenarioId } = useScenario();
  const { pushToast } = useToast();

  const [runs, setRuns] = useState<AlgorithmRunRow[]>([]);
  const [benchmark, setBenchmark] = useState<BenchmarkSuiteResult | null>(null);
  const [seed, setSeed] = useState(20251101);
  const [reps, setReps] = useState(5);
  const [running, setRunning] = useState(false);

  const loadAnalytics = useCallback(async () => {
    try {
      const q = selectedScenarioId ? `?scenarioId=${encodeURIComponent(selectedScenarioId)}` : '';
      const res = await apiRequest<{
        runs: AlgorithmRunRow[];
        latestBenchmark: BenchmarkSuiteResult | null;
      }>(`/analytics/summary${q}`);
      setRuns(res.runs);
      if (res.latestBenchmark) {
        setBenchmark(res.latestBenchmark);
      }
    } catch (err) {
      pushToast('Analytics load failed', err instanceof Error ? err.message : 'Error', 'error');
    }
  }, [selectedScenarioId, pushToast]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const handleRunBenchmark = async () => {
    setRunning(true);
    try {
      const res = await apiRequest<{ benchmark: BenchmarkSuiteResult }>('/analytics/benchmarks/run', {
        method: 'POST',
        body: JSON.stringify({
          scenarioId: selectedScenarioId,
          seed,
          repetitions: reps,
        }),
      });
      setBenchmark(res.benchmark);
      pushToast('Benchmark completed', `Measured across ${res.benchmark.scalingCurve.length} graph sizes.`, 'success');
      await loadAnalytics();
    } catch (err) {
      pushToast('Benchmark failed', err instanceof Error ? err.message : 'Error', 'error');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="DAA Algorithm Analytics & Reproducible Benchmarks"
        subtitle="Empirically measured algorithm-only runtimes, visited vertex pruning, closure resilience, and dispatch optimization tradeoffs."
        actions={
          <>
            <a
              href={`${API_URL_BASE}/analytics/export.csv`}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-[#0E1729] hover:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 no-print"
            >
              <Download className="w-3.5 h-3.5 text-teal-400" />
              Export CSV
            </a>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-[#0E1729] hover:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 no-print"
            >
              <Printer className="w-3.5 h-3.5" />
              Print Report
            </button>
          </>
        }
      />

      {/* Reproducible Benchmark Controls */}
      <div className="rounded-lg border border-slate-800/90 bg-[#0E1729] p-4 flex flex-wrap items-end justify-between gap-4 no-print">
        <div className="flex flex-wrap items-end gap-4 text-xs">
          <div>
            <label className="block text-slate-400 mb-1">PRNG Fixed Seed</label>
            <input
              type="number"
              value={seed}
              onChange={(e) => setSeed(Number(e.target.value))}
              className="rounded border border-slate-700 bg-[#070D19] px-3 py-1.5 text-slate-100 font-mono w-32"
            />
          </div>
          <div>
            <label className="block text-slate-400 mb-1">Repetitions (w/ 1 warm-up)</label>
            <input
              type="number"
              min={2}
              max={15}
              value={reps}
              onChange={(e) => setReps(Number(e.target.value))}
              className="rounded border border-slate-700 bg-[#070D19] px-3 py-1.5 text-slate-100 font-mono w-24"
            />
          </div>
          <div className="text-[11px] text-slate-400 max-w-md">
            Timing uses <code className="font-mono text-teal-400">performance.now()</code> around
            pure algorithm execution only (excluding DB &amp; HTTP overhead).
          </div>
        </div>
        <button
          onClick={handleRunBenchmark}
          disabled={running}
          className="inline-flex items-center gap-1.5 rounded-md bg-teal-600 hover:bg-teal-500 disabled:opacity-50 px-4 py-2 text-xs font-medium text-white"
        >
          <Play className="w-3.5 h-3.5" />
          {running ? 'Running Benchmark Suite...' : 'Run Reproducible Benchmark'}
        </button>
      </div>

      {!benchmark ? (
        <EmptyState
          title="No benchmark suite executed yet"
          description="Click Run Reproducible Benchmark above to measure scaling curves, road-closure resilience, and Greedy vs MCMF resource tradeoffs on the Chennai graph."
          action={
            <button
              onClick={handleRunBenchmark}
              disabled={running}
              className="rounded bg-teal-600 hover:bg-teal-500 px-4 py-2 text-xs font-medium text-white"
            >
              Run Benchmark Now
            </button>
          }
        />
      ) : (
        <>
          <div className="rounded-lg border border-slate-800/80 bg-[#0A1120] px-4 py-2.5 text-[11px] text-slate-400 flex flex-wrap justify-between gap-2">
            <span>
              Runtime: {benchmark.environment.runtime} ({benchmark.environment.arch}) · Seed:{' '}
              <span className="font-mono text-slate-200">{benchmark.seed}</span> · Reps:{' '}
              {benchmark.repetitions} (+{benchmark.warmupRuns} warm-up)
            </span>
            <span className="font-mono">{benchmark.environment.timingMethod}</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Chart 1: Graph Size vs Median Runtime */}
            <div className="rounded-lg border border-slate-800/90 bg-[#0E1729] p-4 space-y-2">
              <h2 className="text-sm font-semibold text-slate-100">
                1. Graph Size (V) vs Algorithm-Only Runtime (ms)
              </h2>
              <p className="text-xs text-slate-400">
                Median execution time across {benchmark.repetitions} repetitions on sampled Chennai
                subgraphs (excluding DB load).
              </p>
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={benchmark.scalingCurve} margin={{ top: 10, right: 16, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="nodeCount" stroke="#94a3b8" fontSize={11} label={{ value: 'Vertices (V)', position: 'insideBottom', offset: -2, fill: '#94a3b8', fontSize: 11 }} />
                    <YAxis stroke="#94a3b8" fontSize={11} label={{ value: 'Time (ms)', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 11 }} />
                    <Tooltip contentStyle={{ backgroundColor: '#0A1120', borderColor: '#334155', fontSize: '12px' }} />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Line type="monotone" dataKey="dijkstraMedianMs" name="Dijkstra (ms)" stroke="#14b8a6" strokeWidth={2} />
                    <Line type="monotone" dataKey="astarMedianMs" name="A* (ms)" stroke="#f59e0b" strokeWidth={2} />
                    <Line type="monotone" dataKey="bfsMedianMs" name="BFS (ms)" stroke="#38bdf8" strokeWidth={1.5} strokeDasharray="4 4" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart 2: Dijkstra vs A* Explored Vertices */}
            <div className="rounded-lg border border-slate-800/90 bg-[#0E1729] p-4 space-y-2">
              <h2 className="text-sm font-semibold text-slate-100">
                2. Search Space Pruning: Visited Vertices (Dijkstra vs A*)
              </h2>
              <p className="text-xs text-slate-400">
                Vertices settled while guaranteeing identical optimal travel-time cost.
              </p>
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={benchmark.scalingCurve} margin={{ top: 10, right: 16, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="nodeCount" stroke="#94a3b8" fontSize={11} />
                    <YAxis stroke="#94a3b8" fontSize={11} />
                    <Tooltip contentStyle={{ backgroundColor: '#0A1120', borderColor: '#334155', fontSize: '12px' }} />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Bar dataKey="dijkstraVisited" name="Dijkstra Visited" fill="#14b8a6" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="astarVisited" name="A* Visited" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart 3: Road Closure % vs Reachability % */}
            <div className="rounded-lg border border-slate-800/90 bg-[#0E1729] p-4 space-y-2">
              <h2 className="text-sm font-semibold text-slate-100">
                3. Road Closure Fraction (%) vs Network Reachability (%)
              </h2>
              <p className="text-xs text-slate-400">
                BFS node reachability &amp; sampled OD pair feasibility as simulated edge closures increase.
              </p>
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={benchmark.closureImpact} margin={{ top: 10, right: 16, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="closurePercent" stroke="#94a3b8" fontSize={11} unit="%" />
                    <YAxis stroke="#94a3b8" fontSize={11} domain={[0, 100]} unit="%" />
                    <Tooltip contentStyle={{ backgroundColor: '#0A1120', borderColor: '#334155', fontSize: '12px' }} />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Line type="monotone" dataKey="reachableNodesPercent" name="Reachable Nodes (%)" stroke="#38bdf8" strokeWidth={2} />
                    <Line type="monotone" dataKey="reachablePairsPercent" name="Reachable OD Pairs (%)" stroke="#ef4444" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart 4: Team Availability vs Demand Fulfillment */}
            <div className="rounded-lg border border-slate-800/90 bg-[#0E1729] p-4 space-y-2">
              <h2 className="text-sm font-semibold text-slate-100">
                4. Resource Availability vs Demand Fulfillment (Greedy vs MCMF)
              </h2>
              <p className="text-xs text-slate-400">
                Teams assigned across 6 total requested slots as available fleet increases (2, 4, 6 teams).
              </p>
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={benchmark.dispatchComparison} margin={{ top: 10, right: 16, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="teamCount" stroke="#94a3b8" fontSize={11} />
                    <YAxis stroke="#94a3b8" fontSize={11} allowDecimals={false} />
                    <Tooltip contentStyle={{ backgroundColor: '#0A1120', borderColor: '#334155', fontSize: '12px' }} />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Bar dataKey="greedyAssigned" name="Greedy Assigned" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="mcmfAssigned" name="MCMF Assigned" fill="#10b981" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Individual Algorithm Run History */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-100">Saved Algorithm Run History (SQLite Persisted)</h2>
        <DataTable
          rows={runs.slice(0, 20)}
          rowKey={(r) => r.id}
          emptyState={
            <EmptyState
              title="No algorithm runs logged"
              description="Run routes in Route Optimizer, Dispatch Plans, or Benchmarks to record persistent execution telemetry."
            />
          }
          columns={[
            {
              key: 'algo',
              header: 'Algorithm',
              render: (r) => (
                <span className="font-mono text-xs uppercase text-teal-300">{r.algorithm_name}</span>
              ),
            },
            {
              key: 'scenario',
              header: 'Scenario / Graph',
              render: (r) => (
                <div className="text-xs">
                  <div className="text-slate-200">{r.scenario_id}</div>
                  <div className="font-mono text-[11px] text-slate-500">
                    {r.graph_version} · v{r.closure_version}
                  </div>
                </div>
              ),
            },
            {
              key: 'runtime',
              header: 'Algo Runtime',
              align: 'right',
              render: (r) => (
                <span className="font-mono text-xs">{formatRuntimeMs(r.runtime_ms)}</span>
              ),
            },
            {
              key: 'time',
              header: 'Recorded At',
              align: 'right',
              render: (r) => (
                <span className="font-mono text-xs text-slate-400">
                  {formatTimestamp(r.created_at)}
                </span>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}

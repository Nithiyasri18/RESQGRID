import { useCallback, useEffect, useState } from 'react';
import {
  Ban,
  Compass,
  Play,
  RefreshCw,
  RotateCcw,
  StepForward,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../app/AuthContext';
import { useScenario } from '../app/ScenarioContext';
import { ChennaiMap, type RouteOverlay } from '../components/maps/ChennaiMap';
import { PageHeader } from '../components/ui/PageHeader';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useToast } from '../components/ui/Toast';
import { ApiError, apiRequest } from '../lib/api';
import { formatDistance, formatDuration, formatRuntimeMs } from '../lib/format';
import type {
  CostMode,
  Incident,
  RescueTeam,
  RoadEdgeDto,
  RoadNodeDto,
  ShortestPathResult,
  TraversalResult,
} from '../types/resqgrid';

interface CompareResponse {
  scenarioId: string;
  costMode: CostMode;
  graphMetadata: {
    networkVersion: string;
    closureVersion: number;
    nodeCount: number;
    edgeCount: number;
    blockedEdges: number;
    restrictedEdges: number;
    restrictedMultiplier: number;
    graphLoadMs: number;
  };
  snapping: {
    originNode: RoadNodeDto;
    originSnapM: number;
    destinationNode: RoadNodeDto;
    destinationSnapM: number;
  };
  dijkstra: ShortestPathResult;
  astar: ShortestPathResult;
  bfsSummary: {
    reachableCount: number;
    totalNodes: number;
    targetReachable: boolean;
    hopDistanceToTarget: number | null;
    runtimeMs: number;
  };
  comparisonAnalysis: {
    optimalCostVerifiedEqual: boolean;
    identicalEdgePath: boolean;
    visitedReduction: number;
    relaxationReduction: number;
    note: string;
  };
}

export function RoutesPage() {
  const { selectedScenarioId, lastEventTick } = useScenario();
  const { canWrite } = useAuth();
  const { pushToast } = useToast();

  const [nodes, setNodes] = useState<RoadNodeDto[]>([]);
  const [edges, setEdges] = useState<RoadEdgeDto[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [teams, setTeams] = useState<RescueTeam[]>([]);

  const [originNodeId, setOriginNodeId] = useState('N_GUINDY_IND');
  const [destNodeId, setDestNodeId] = useState('N_VELACHERY_VIJAYA');
  const [costMode, setCostMode] = useState<CostMode>('travel_time_s');
  const [algoMode, setAlgoMode] = useState<'compare' | 'dijkstra' | 'astar' | 'bfs' | 'dfs'>('compare');
  const [pickTarget, setPickTarget] = useState<'origin' | 'destination' | null>(null);

  const [running, setRunning] = useState(false);
  const [compareRes, setCompareRes] = useState<CompareResponse | null>(null);
  const [singleRoute, setSingleRoute] = useState<ShortestPathResult | null>(null);
  const [traversalRes, setTraversalRes] = useState<TraversalResult | null>(null);

  // Step-by-step exploration animation
  const [stepCursor, setStepCursor] = useState(0);
  const [playingSteps, setPlayingSteps] = useState(false);

  const loadGraphData = useCallback(async () => {
    try {
      const q = selectedScenarioId ? `?scenarioId=${encodeURIComponent(selectedScenarioId)}` : '';
      const feat = await apiRequest<{
        nodes: RoadNodeDto[];
        edges: RoadEdgeDto[];
        incidents: Incident[];
        teams: RescueTeam[];
      }>(`/map/features${q}`);
      setNodes(feat.nodes);
      setEdges(feat.edges);
      setIncidents(feat.incidents);
      setTeams(feat.teams);
    } catch (err) {
      pushToast('Graph load failed', err instanceof Error ? err.message : 'Error', 'error');
    }
  }, [selectedScenarioId, pushToast]);

  useEffect(() => {
    loadGraphData();
  }, [loadGraphData, lastEventTick]);

  const activeSteps =
    traversalRes?.steps.map((s) => s.currentNodeId) ??
    compareRes?.dijkstra.steps.map((s) => s.settledNodeId) ??
    singleRoute?.steps.map((s) => s.settledNodeId) ??
    [];

  useEffect(() => {
    if (!playingSteps || activeSteps.length === 0) return;
    const timer = setInterval(() => {
      setStepCursor((c) => {
        if (c + 1 >= activeSteps.length) {
          setPlayingSteps(false);
          return c;
        }
        return c + 1;
      });
    }, 220);
    return () => clearInterval(timer);
  }, [playingSteps, activeSteps.length]);

  const handleRun = async () => {
    setRunning(true);
    setPlayingSteps(false);
    setStepCursor(0);
    try {
      if (algoMode === 'compare') {
        const res = await apiRequest<CompareResponse>('/routes/compare', {
          method: 'POST',
          body: JSON.stringify({
            scenarioId: selectedScenarioId,
            origin: { nodeId: originNodeId },
            destination: { nodeId: destNodeId },
            costMode,
            recordSteps: true,
          }),
        });
        setCompareRes(res);
        setSingleRoute(null);
        setTraversalRes(null);
      } else if (algoMode === 'bfs' || algoMode === 'dfs') {
        const res = await apiRequest<{ traversal: TraversalResult }>('/routes/optimize', {
          method: 'POST',
          body: JSON.stringify({
            scenarioId: selectedScenarioId,
            origin: { nodeId: originNodeId },
            destination: { nodeId: destNodeId },
            algorithm: algoMode,
            recordSteps: true,
          }),
        });
        setTraversalRes(res.traversal);
        setCompareRes(null);
        setSingleRoute(null);
      } else {
        const res = await apiRequest<{ result: ShortestPathResult }>('/routes/optimize', {
          method: 'POST',
          body: JSON.stringify({
            scenarioId: selectedScenarioId,
            origin: { nodeId: originNodeId },
            destination: { nodeId: destNodeId },
            costMode,
            algorithm: algoMode,
            recordSteps: true,
          }),
        });
        setSingleRoute(res.result);
        setCompareRes(null);
        setTraversalRes(null);
      }
    } catch (err) {
      pushToast('Routing error', err instanceof ApiError ? err.message : 'Failed', 'error');
    } finally {
      setRunning(false);
    }
  };

  const handleToggleEdgeBlock = async (edge: RoadEdgeDto) => {
    if (!canWrite || !selectedScenarioId) {
      pushToast('Read-only', 'Sign in as Admin/Dispatcher to toggle closures.', 'info');
      return;
    }
    const next = edge.closure_status === 'blocked' ? 'open' : 'blocked';
    try {
      await apiRequest(`/scenarios/${selectedScenarioId}/closures/${edge.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          overrideStatus: next,
          reason: next === 'blocked' ? 'Blocked during /routes reroute demonstration' : 'Reopened',
          applyToReverse: true,
        }),
      });
      pushToast(`Road ${next}`, `${edge.name} set to ${next}. Click "Rerun After Closure".`, 'info');
      await loadGraphData();
    } catch (err) {
      pushToast('Error', err instanceof Error ? err.message : 'Failed', 'error');
    }
  };

  const routeOverlays: RouteOverlay[] = [];
  if (compareRes) {
    if (compareRes.dijkstra.status === 'found') {
      routeOverlays.push({
        id: 'dijkstra',
        label: `Dijkstra (${formatDistance(compareRes.dijkstra.totalDistanceM)} · ${formatDuration(compareRes.dijkstra.estimatedTravelTimeS)})`,
        color: '#14b8a6',
        weight: 6,
        coordinates: compareRes.dijkstra.geometryCoordinates,
      });
    }
    if (compareRes.astar.status === 'found') {
      routeOverlays.push({
        id: 'astar',
        label: `A* (${formatDistance(compareRes.astar.totalDistanceM)} · ${formatDuration(compareRes.astar.estimatedTravelTimeS)})`,
        color: '#f59e0b',
        dashArray: '8 8',
        weight: 4,
        coordinates: compareRes.astar.geometryCoordinates,
      });
    }
  } else if (singleRoute && singleRoute.status === 'found') {
    routeOverlays.push({
      id: singleRoute.algorithm,
      label: `${singleRoute.algorithm.toUpperCase()} (${formatDistance(singleRoute.totalDistanceM)})`,
      color: singleRoute.algorithm === 'astar' ? '#f59e0b' : '#14b8a6',
      weight: 6,
      coordinates: singleRoute.geometryCoordinates,
    });
  }

  const visitedPreview = stepCursor > 0 ? activeSteps.slice(0, stepCursor + 1) : [];
  const activeStepNodeId = stepCursor > 0 ? activeSteps[stepCursor] : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="DAA Route Optimization & Algorithm Comparison"
        subtitle="Custom Python/TypeScript BFS, DFS, Dijkstra (Binary Min-Heap), and A* (Admissible Geodesic Heuristic) on Chennai road geometry."
      />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* Left Controls */}
        <div className="xl:col-span-3 rounded-lg border border-slate-800/90 bg-[#0E1729] p-4 space-y-4 text-xs">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-medium text-slate-300">Origin Node / Team</label>
              <button
                type="button"
                onClick={() => setPickTarget(pickTarget === 'origin' ? null : 'origin')}
                className="text-[11px] text-teal-400 hover:text-teal-300"
              >
                {pickTarget === 'origin' ? 'Click a node...' : 'Pick on map'}
              </button>
            </div>
            <select
              value={originNodeId}
              onChange={(e) => setOriginNodeId(e.target.value)}
              className="w-full rounded border border-slate-700 bg-[#070D19] px-2.5 py-2 text-slate-100"
            >
              {nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name} ({n.locality})
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-medium text-slate-300">Destination Node / Incident</label>
              <button
                type="button"
                onClick={() => setPickTarget(pickTarget === 'destination' ? null : 'destination')}
                className="text-[11px] text-teal-400 hover:text-teal-300"
              >
                {pickTarget === 'destination' ? 'Click a node...' : 'Pick on map'}
              </button>
            </div>
            <select
              value={destNodeId}
              onChange={(e) => setDestNodeId(e.target.value)}
              className="w-full rounded border border-slate-700 bg-[#070D19] px-2.5 py-2 text-slate-100"
            >
              {nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name} ({n.locality})
                </option>
              ))}
            </select>
          </div>

          {incidents.length > 0 && (
            <div>
              <label className="block font-medium text-slate-400 mb-1">
                Quick-Snap to Scenario Incident
              </label>
              <select
                value=""
                onChange={(e) => {
                  const inc = incidents.find((i) => i.id === e.target.value);
                  if (!inc || nodes.length === 0) return;
                  let nearest = nodes[0];
                  let best = Infinity;
                  for (const n of nodes) {
                    const d = Math.hypot(n.lat - inc.lat, n.lng - inc.lng);
                    if (d < best) {
                      best = d;
                      nearest = n;
                    }
                  }
                  setDestNodeId(nearest.id);
                }}
                className="w-full rounded border border-slate-800 bg-[#070D19] px-2.5 py-1.5 text-slate-300"
              >
                <option value="">Jump destination to incident...</option>
                {incidents.map((i) => (
                  <option key={i.id} value={i.id}>
                    [{i.severity.toUpperCase()}] {i.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block font-medium text-slate-300 mb-1">Edge Weight Model</label>
            <div className="grid grid-cols-2 gap-1 p-1 rounded-md bg-[#070D19] border border-slate-800">
              <button
                type="button"
                onClick={() => setCostMode('travel_time_s')}
                className={`py-1.5 rounded text-[11px] font-medium ${
                  costMode === 'travel_time_s' ? 'bg-slate-800 text-teal-300' : 'text-slate-400'
                }`}
              >
                Est. Travel Time
              </button>
              <button
                type="button"
                onClick={() => setCostMode('distance_m')}
                className={`py-1.5 rounded text-[11px] font-medium ${
                  costMode === 'distance_m' ? 'bg-slate-800 text-teal-300' : 'text-slate-400'
                }`}
              >
                Distance (m)
              </button>
            </div>
          </div>

          <div>
            <label className="block font-medium text-slate-300 mb-1">Algorithm Mode</label>
            <select
              value={algoMode}
              onChange={(e) =>
                setAlgoMode(e.target.value as 'compare' | 'dijkstra' | 'astar' | 'bfs' | 'dfs')
              }
              className="w-full rounded border border-slate-700 bg-[#070D19] px-2.5 py-2 text-slate-100"
            >
              <option value="compare">Compare Dijkstra vs A* (Identical Input)</option>
              <option value="dijkstra">Dijkstra Only (Binary Min-Heap)</option>
              <option value="astar">A* Only (Admissible Geodesic Heuristic)</option>
              <option value="bfs">BFS Reachability (Unweighted Hops)</option>
              <option value="dfs">DFS Traversal (Connected Exploration)</option>
            </select>
          </div>

          <div className="flex flex-col gap-2 pt-1">
            <button
              type="button"
              onClick={handleRun}
              disabled={running}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-teal-600 hover:bg-teal-500 disabled:opacity-50 py-2.5 font-medium text-white"
            >
              <Compass className="w-4 h-4" />
              {running ? 'Computing...' : 'Run Route Optimization'}
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleRun}
                disabled={running}
                className="inline-flex items-center justify-center gap-1 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 py-1.5 text-slate-200"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Rerun Closure
              </button>
              <button
                type="button"
                onClick={() => {
                  setCompareRes(null);
                  setSingleRoute(null);
                  setTraversalRes(null);
                  setStepCursor(0);
                  setPlayingSteps(false);
                }}
                className="inline-flex items-center justify-center gap-1 rounded border border-slate-800 bg-[#070D19] hover:bg-slate-900 py-1.5 text-slate-400"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear Route
              </button>
            </div>
          </div>

          {/* Step Animation Controls */}
          {activeSteps.length > 0 && (
            <div className="border-t border-slate-800 pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-300">Search Step Playback</span>
                <span className="font-mono text-[11px] text-teal-400">
                  {stepCursor}/{activeSteps.length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPlayingSteps((p) => !p)}
                  className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-slate-200 hover:bg-slate-800"
                >
                  <Play className="w-3 h-3" />
                  {playingSteps ? 'Pause' : 'Animate'}
                </button>
                <button
                  type="button"
                  onClick={() => setStepCursor((c) => Math.min(activeSteps.length - 1, c + 1))}
                  className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-slate-200 hover:bg-slate-800"
                >
                  <StepForward className="w-3 h-3" />
                  Step
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPlayingSteps(false);
                    setStepCursor(0);
                  }}
                  className="inline-flex items-center gap-1 rounded border border-slate-800 px-2 py-1 text-slate-400"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Center Map */}
        <div className="xl:col-span-5 space-y-2">
          <ChennaiMap
            heightClass="h-[580px]"
            nodes={nodes}
            edges={edges}
            incidents={incidents}
            teams={teams}
            routes={routeOverlays}
            visitedNodeIds={visitedPreview}
            activeStepNodeId={activeStepNodeId}
            onNodeClick={(n) => {
              if (pickTarget === 'origin') {
                setOriginNodeId(n.id);
                setPickTarget(null);
              } else if (pickTarget === 'destination') {
                setDestNodeId(n.id);
                setPickTarget(null);
              }
            }}
            onEdgeClick={handleToggleEdgeBlock}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 px-1">
            <span>Teal Solid: Dijkstra · Amber Dashed: A* · Click any road edge to block/unblock (Admin)</span>
            <span className="text-amber-300/90">Simulated travel times; open edges not guaranteed flood-safe</span>
          </div>
        </div>

        {/* Right Analysis Panel */}
        <div className="xl:col-span-4 space-y-4">
          {!compareRes && !singleRoute && !traversalRes && (
            <div className="rounded-lg border border-slate-800/90 bg-[#0E1729] p-5 text-xs text-slate-400 space-y-2">
              <p className="font-semibold text-slate-200 text-sm">Ready for DAA Evaluation</p>
              <p>
                Select an origin and destination intersection, choose an edge weight model, and click{' '}
                <strong className="text-slate-200">Run Route Optimization</strong> to compare
                Dijkstra and A* side by side on the active Chennai closure snapshot.
              </p>
            </div>
          )}

          {compareRes && (
            <div className="space-y-4">
              {compareRes.dijkstra.status === 'unreachable' ? (
                <div className="rounded-lg border border-red-800/70 bg-red-950/30 p-4 text-xs text-red-200 space-y-1.5">
                  <p className="font-semibold flex items-center gap-1.5">
                    <Ban className="w-4 h-4 text-red-400" />
                    No Feasible Route Found (Unreachable)
                  </p>
                  <p>{compareRes.dijkstra.errorReason}</p>
                </div>
              ) : (
                <div className="rounded-lg border border-slate-800/90 bg-[#0E1729] p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-100">
                      Dijkstra vs A* Comparison
                    </h3>
                    <StatusBadge
                      value={compareRes.comparisonAnalysis.optimalCostVerifiedEqual ? 'verified' : 'high'}
                      label={
                        compareRes.comparisonAnalysis.optimalCostVerifiedEqual
                          ? 'Optimal Cost Verified'
                          : 'Cost Delta'
                      }
                    />
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400">
                          <th className="py-1.5 pr-2">Metric</th>
                          <th className="py-1.5 px-2 text-right text-teal-400">Dijkstra</th>
                          <th className="py-1.5 pl-2 text-right text-amber-400">A*</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono tabular-nums">
                        <tr>
                          <td className="py-2 pr-2 font-sans text-slate-300">Optimal Cost</td>
                          <td className="py-2 px-2 text-right">
                            {costMode === 'distance_m'
                              ? formatDistance(compareRes.dijkstra.totalCost)
                              : formatDuration(compareRes.dijkstra.totalCost)}
                          </td>
                          <td className="py-2 pl-2 text-right">
                            {costMode === 'distance_m'
                              ? formatDistance(compareRes.astar.totalCost)
                              : formatDuration(compareRes.astar.totalCost)}
                          </td>
                        </tr>
                        <tr>
                          <td className="py-2 pr-2 font-sans text-slate-300">Road Distance</td>
                          <td className="py-2 px-2 text-right">
                            {formatDistance(compareRes.dijkstra.totalDistanceM)}
                          </td>
                          <td className="py-2 pl-2 text-right">
                            {formatDistance(compareRes.astar.totalDistanceM)}
                          </td>
                        </tr>
                        <tr>
                          <td className="py-2 pr-2 font-sans text-slate-300">Est. Travel Time</td>
                          <td className="py-2 px-2 text-right">
                            {formatDuration(compareRes.dijkstra.estimatedTravelTimeS)}
                          </td>
                          <td className="py-2 pl-2 text-right">
                            {formatDuration(compareRes.astar.estimatedTravelTimeS)}
                          </td>
                        </tr>
                        <tr>
                          <td className="py-2 pr-2 font-sans text-slate-300">Visited Vertices</td>
                          <td className="py-2 px-2 text-right">
                            {compareRes.dijkstra.visitedNodesCount}
                          </td>
                          <td className="py-2 pl-2 text-right">
                            {compareRes.astar.visitedNodesCount}
                          </td>
                        </tr>
                        <tr>
                          <td className="py-2 pr-2 font-sans text-slate-300">Edge Relaxations</td>
                          <td className="py-2 px-2 text-right">
                            {compareRes.dijkstra.relaxationsCount}
                          </td>
                          <td className="py-2 pl-2 text-right">
                            {compareRes.astar.relaxationsCount}
                          </td>
                        </tr>
                        <tr>
                          <td className="py-2 pr-2 font-sans text-slate-300">Algo-Only Time</td>
                          <td className="py-2 px-2 text-right">
                            {formatRuntimeMs(compareRes.dijkstra.runtimeMs)}
                          </td>
                          <td className="py-2 pl-2 text-right">
                            {formatRuntimeMs(compareRes.astar.runtimeMs)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="rounded bg-[#070D19] border border-slate-800 p-3 text-[11px] text-slate-300 space-y-1">
                    <p>{compareRes.comparisonAnalysis.note}</p>
                    <p className="text-slate-400">
                      Heuristic: {compareRes.astar.heuristicNote}
                    </p>
                    <p className="text-slate-400">
                      Road Corridors: {compareRes.astar.roadNames.join(' -> ')}
                    </p>
                  </div>
                </div>
              )}

              <div className="rounded-lg border border-slate-800/90 bg-[#0E1729] p-4 text-xs space-y-1.5">
                <p className="font-semibold text-slate-200">BFS Connectivity Check (Same Snapshot)</p>
                <div className="flex justify-between text-slate-400">
                  <span>Reachable Nodes from Origin</span>
                  <span className="font-mono text-slate-200">
                    {compareRes.bfsSummary.reachableCount} / {compareRes.bfsSummary.totalNodes}
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Min Unweighted Hops</span>
                  <span className="font-mono text-slate-200">
                    {compareRes.bfsSummary.hopDistanceToTarget ?? 'Unreachable'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {singleRoute && (
            <div className="rounded-lg border border-slate-800/90 bg-[#0E1729] p-4 text-xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-100 uppercase">
                  {singleRoute.algorithm} Result
                </h3>
                <StatusBadge
                  value={singleRoute.status === 'found' ? 'verified' : 'blocked'}
                  label={singleRoute.status}
                />
              </div>
              {singleRoute.status === 'found' ? (
                <dl className="grid grid-cols-2 gap-2 font-mono">
                  <div>
                    <dt className="font-sans text-slate-400">Distance</dt>
                    <dd className="text-slate-100">{formatDistance(singleRoute.totalDistanceM)}</dd>
                  </div>
                  <div>
                    <dt className="font-sans text-slate-400">Est. Time</dt>
                    <dd className="text-slate-100">{formatDuration(singleRoute.estimatedTravelTimeS)}</dd>
                  </div>
                  <div>
                    <dt className="font-sans text-slate-400">Visited</dt>
                    <dd className="text-slate-100">{singleRoute.visitedNodesCount} nodes</dd>
                  </div>
                  <div>
                    <dt className="font-sans text-slate-400">Algo Runtime</dt>
                    <dd className="text-slate-100">{formatRuntimeMs(singleRoute.runtimeMs)}</dd>
                  </div>
                </dl>
              ) : (
                <p className="text-red-300">{singleRoute.errorReason}</p>
              )}
            </div>
          )}

          {traversalRes && (
            <div className="rounded-lg border border-slate-800/90 bg-[#0E1729] p-4 text-xs space-y-2.5">
              <h3 className="text-sm font-semibold text-slate-100 uppercase">
                {traversalRes.algorithm} Reachability
              </h3>
              <p className="text-slate-400">{traversalRes.complexity.note}</p>
              <dl className="grid grid-cols-2 gap-2 font-mono">
                <div>
                  <dt className="font-sans text-slate-400">Reachable Nodes</dt>
                  <dd className="text-slate-100">
                    {traversalRes.reachableCount} / {traversalRes.totalNodes}
                  </dd>
                </div>
                <div>
                  <dt className="font-sans text-slate-400">Target Reachable</dt>
                  <dd className="text-slate-100">{traversalRes.targetReachable ? 'Yes' : 'No'}</dd>
                </div>
                <div>
                  <dt className="font-sans text-slate-400">Complexity</dt>
                  <dd className="text-teal-400">{traversalRes.complexity.time}</dd>
                </div>
                <div>
                  <dt className="font-sans text-slate-400">Algo Runtime</dt>
                  <dd className="text-slate-100">{formatRuntimeMs(traversalRes.runtimeMs)}</dd>
                </div>
              </dl>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

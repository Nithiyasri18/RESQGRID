import React, { useCallback, useEffect, useState } from 'react';
import {
  Ban,
  Crosshair,
  Info,
  Layers,
  MapPin,
  RotateCcw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useAuth } from '../app/AuthContext';
import { useScenario } from '../app/ScenarioContext';
import { ChennaiMap } from '../components/maps/ChennaiMap';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useToast } from '../components/ui/Toast';
import { ApiError, apiRequest } from '../lib/api';
import { formatDistance, formatDuration } from '../lib/format';
import type {
  FacilityDto,
  Incident,
  IncidentSeverity,
  RescueTeam,
  RoadClosureStatus,
  RoadEdgeDto,
  RoadNodeDto,
  Scenario,
} from '../types/resqgrid';

interface LocalityInfo {
  id: string;
  name: string;
  lat: number;
  lng: number;
  zone: string;
  inGccLimits: boolean;
}

interface StudyAreaResponse {
  studyAreaName: string;
  distinctionNote: string;
  dataSource: string;
  attribution: string;
  speedAssumption: string;
  localities: LocalityInfo[];
  polygon: { geometry: { coordinates: Array<Array<[number, number]>> } };
  gccCoreApproximatePolygon: { geometry: { coordinates: Array<Array<[number, number]>> } };
}

export function MapPage() {
  const { selectedScenarioId, scenarios, setSelectedScenarioId, lastEventTick } = useScenario();
  const { canWrite } = useAuth();
  const { pushToast } = useToast();

  const [studyArea, setStudyArea] = useState<StudyAreaResponse | null>(null);
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [nodes, setNodes] = useState<RoadNodeDto[]>([]);
  const [edges, setEdges] = useState<RoadEdgeDto[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [teams, setTeams] = useState<RescueTeam[]>([]);
  const [facilities, setFacilities] = useState<FacilityDto[]>([]);
  const [graphVersion, setGraphVersion] = useState('');

  const [localitySearch, setLocalitySearch] = useState('');
  const [focusPoint, setFocusPoint] = useState<{
    lat: number;
    lng: number;
    zoom?: number;
    nonce?: number;
  } | null>(null);

  const [showLayers, setShowLayers] = useState({
    roads: true,
    roadStatus: true,
    incidents: true,
    teams: true,
    facilities: true,
    studyBoundary: true,
    gccBoundary: true,
  });

  const [selectedEdge, setSelectedEdge] = useState<RoadEdgeDto | null>(null);
  const [closureStatus, setClosureStatus] = useState<RoadClosureStatus>('blocked');
  const [closureReason, setClosureReason] = useState('');
  const [lastUndoEdge, setLastUndoEdge] = useState<{
    edgeId: string;
    prevStatus: RoadClosureStatus;
    prevReason: string;
  } | null>(null);

  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [pickCreateMode, setPickCreateMode] = useState(false);
  const [newIncCoords, setNewIncCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [newIncForm, setNewIncForm] = useState({
    title: '',
    severity: 'high' as IncidentSeverity,
    locality: 'Chennai Study Area',
    description: '',
    capability: 'boat_water',
    requestedTeams: 1,
  });
  const [saving, setSaving] = useState(false);

  const loadFeatures = useCallback(async () => {
    try {
      const q = selectedScenarioId ? `?scenarioId=${encodeURIComponent(selectedScenarioId)}` : '';
      const [sa, feat] = await Promise.all([
        apiRequest<StudyAreaResponse>('/study-area'),
        apiRequest<{
          scenario: Scenario;
          graphVersion: string;
          nodes: RoadNodeDto[];
          edges: RoadEdgeDto[];
          incidents: Incident[];
          teams: RescueTeam[];
          facilities: FacilityDto[];
        }>(`/map/features${q}`),
      ]);
      setStudyArea(sa);
      setScenario(feat.scenario);
      setGraphVersion(feat.graphVersion);
      setNodes(feat.nodes);
      setEdges(feat.edges);
      setIncidents(feat.incidents);
      setTeams(feat.teams);
      setFacilities(feat.facilities);
    } catch (err) {
      pushToast('Map load failed', err instanceof Error ? err.message : 'Error', 'error');
    }
  }, [selectedScenarioId, pushToast]);

  useEffect(() => {
    loadFeatures();
  }, [loadFeatures, lastEventTick]);

  const handleSelectLocality = (loc: LocalityInfo) => {
    setFocusPoint({ lat: loc.lat, lng: loc.lng, zoom: 14, nonce: Date.now() });
    setNewIncForm((f) => ({ ...f, locality: loc.name }));
  };

  const handleEdgeClick = (edge: RoadEdgeDto) => {
    setSelectedEdge(edge);
    setSelectedIncident(null);
    setClosureStatus(edge.closure_status);
    setClosureReason(edge.closure_reason || '');
  };

  const handleSaveClosure = async () => {
    if (!selectedEdge || !scenario) return;
    setSaving(true);
    const prev = {
      edgeId: selectedEdge.id,
      prevStatus: selectedEdge.closure_status,
      prevReason: selectedEdge.closure_reason,
    };
    try {
      await apiRequest(`/scenarios/${scenario.id}/closures/${selectedEdge.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          overrideStatus: closureStatus,
          reason: closureReason || `Admin override: ${closureStatus}`,
          applyToReverse: true,
        }),
      });
      setLastUndoEdge(prev);
      pushToast('Road status saved', `${selectedEdge.name} marked ${closureStatus}.`, 'success');
      await loadFeatures();
      setSelectedEdge((curr) =>
        curr ? { ...curr, closure_status: closureStatus, closure_reason: closureReason } : null
      );
    } catch (err) {
      pushToast('Update failed', err instanceof ApiError ? err.message : 'Unauthorized', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleUndoClosure = async () => {
    if (!lastUndoEdge || !scenario) return;
    setSaving(true);
    try {
      await apiRequest(`/scenarios/${scenario.id}/closures/${lastUndoEdge.edgeId}`, {
        method: 'PUT',
        body: JSON.stringify({
          overrideStatus: lastUndoEdge.prevStatus,
          reason: lastUndoEdge.prevReason,
          applyToReverse: true,
        }),
      });
      pushToast('Closure undone', 'Restored previous road segment state.', 'info');
      setLastUndoEdge(null);
      await loadFeatures();
    } catch (err) {
      pushToast('Undo failed', err instanceof Error ? err.message : 'Error', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleResetAllClosures = async () => {
    if (!scenario) return;
    setSaving(true);
    try {
      await apiRequest(`/scenarios/${scenario.id}/closures/reset`, { method: 'POST' });
      pushToast('Closures cleared', 'All scenario road overrides reset to Open.', 'info');
      setSelectedEdge(null);
      await loadFeatures();
    } catch (err) {
      pushToast('Reset failed', err instanceof ApiError ? err.message : 'Unauthorized', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateOnMap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIncCoords || !scenario) return;
    setSaving(true);
    try {
      await apiRequest('/incidents', {
        method: 'POST',
        body: JSON.stringify({
          title: newIncForm.title,
          description: newIncForm.description,
          severity: newIncForm.severity,
          locality: newIncForm.locality,
          lat: newIncCoords.lat,
          lng: newIncCoords.lng,
          requiredCapabilities: [newIncForm.capability],
          requestedTeams: newIncForm.requestedTeams,
          verificationStatus: 'verified',
          scenarioId: scenario.id,
        }),
      });
      pushToast('Incident placed on map', newIncForm.title, 'success');
      setPickCreateMode(false);
      setNewIncCoords(null);
      setNewIncForm({
        title: '',
        severity: 'high',
        locality: 'Chennai Study Area',
        description: '',
        capability: 'boat_water',
        requestedTeams: 1,
      });
      await loadFeatures();
    } catch (err) {
      pushToast('Failed to create', err instanceof ApiError ? err.message : 'Error', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleVerifyIncident = async (inc: Incident) => {
    try {
      await apiRequest(`/incidents/${inc.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ verificationStatus: 'verified' }),
      });
      pushToast('Incident verified', inc.title, 'success');
      await loadFeatures();
      setSelectedIncident((c) => (c ? { ...c, verification_status: 'verified' } : null));
    } catch (err) {
      pushToast('Verify failed', err instanceof ApiError ? err.message : 'Unauthorized', 'error');
    }
  };

  const filteredLocalities = (studyArea?.localities ?? []).filter((l) =>
    l.name.toLowerCase().includes(localitySearch.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Active Scenario Banner */}
      <div className="rounded-lg border border-slate-800/90 bg-[#0E1729] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold text-amber-300">Active Simulation:</span>
            <span className="font-medium text-slate-100">{scenario?.name || 'Loading...'}</span>
            <span className="text-slate-500">·</span>
            <span className="font-mono text-slate-400">{graphVersion}</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {studyArea?.distinctionNote ||
              'Chennai Metropolitan Study Area (distinguished from GCC limits).'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <select
            aria-label="Switch scenario"
            value={selectedScenarioId || ''}
            onChange={(e) => setSelectedScenarioId(e.target.value)}
            className="rounded-md border border-slate-700 bg-[#070D19] px-3 py-1.5 text-xs text-slate-100"
          >
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          {canWrite && (
            <button
              onClick={() => {
                setPickCreateMode((v) => !v);
                setNewIncCoords(null);
              }}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                pickCreateMode
                  ? 'bg-amber-600 text-white'
                  : 'bg-teal-600 hover:bg-teal-500 text-white'
              }`}
            >
              <Crosshair className="w-3.5 h-3.5" />
              {pickCreateMode ? 'Click Map to Place...' : 'Add Incident on Map'}
            </button>
          )}
        </div>
      </div>

      {/* Main Split Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left GIS Controls & Locality Search */}
        <div className="lg:col-span-3 space-y-4">
          <div className="rounded-lg border border-slate-800/90 bg-[#0E1729] p-4 space-y-3">
            <h2 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-teal-400" />
              Chennai Study-Area Localities
            </h2>
            <input
              type="text"
              value={localitySearch}
              onChange={(e) => setLocalitySearch(e.target.value)}
              placeholder="Search locality (e.g. Velachery, Avadi)..."
              className="w-full rounded border border-slate-700 bg-[#070D19] px-2.5 py-1.5 text-xs text-slate-100"
            />
            <div className="max-h-48 overflow-y-auto divide-y divide-slate-800/60 border border-slate-800/70 rounded bg-[#070D19]">
              {filteredLocalities.map((loc) => (
                <button
                  key={loc.id}
                  type="button"
                  onClick={() => handleSelectLocality(loc)}
                  className="w-full px-2.5 py-1.5 text-left hover:bg-slate-800/60 transition-colors flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-200 truncate">{loc.name}</p>
                    <p className="text-[10px] text-slate-500 truncate">
                      {loc.zone} · {loc.inGccLimits ? 'Inside GCC' : 'Metro Study Area (Non-GCC)'}
                    </p>
                  </div>
                  <span className="font-mono text-[10px] text-teal-400 shrink-0">Zoom</span>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-slate-800/90 bg-[#0E1729] p-4 space-y-2.5">
            <h2 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-teal-400" />
              Map Layers &amp; Legend
            </h2>
            {(
              [
                ['roads', 'OSM-Compatible Road Edges'],
                ['roadStatus', 'Scenario Road Closures (Red/Amber)'],
                ['incidents', 'Simulated Incidents'],
                ['teams', 'Rescue Teams (Simulated Pos)'],
                ['facilities', 'Hospitals, Shelters & Bases'],
                ['studyBoundary', 'Metro Study-Area Polygon'],
                ['gccBoundary', 'GCC Core Reference Envelope'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showLayers[key]}
                  onChange={(e) =>
                    setShowLayers((prev) => ({ ...prev, [key]: e.target.checked }))
                  }
                  className="rounded border-slate-600 bg-slate-900 text-teal-500"
                />
                <span>{label}</span>
              </label>
            ))}

            <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 space-y-1">
              <div className="flex items-center justify-between">
                <span>Blocked Roads</span>
                <span className="font-mono text-red-400">
                  {edges.filter((e) => e.closure_status === 'blocked').length}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Restricted Roads</span>
                <span className="font-mono text-amber-400">
                  {edges.filter((e) => e.closure_status === 'restricted').length}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Incidents in View</span>
                <span className="font-mono text-slate-200">{incidents.length}</span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-800/90 bg-[#0E1729] p-3.5 text-[11px] text-slate-400 space-y-1.5">
            <p className="font-medium text-slate-200 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-teal-400" />
              Data Provenance &amp; Safety Notice
            </p>
            <p>{studyArea?.dataSource}</p>
            <p className="text-amber-300/90">{studyArea?.speedAssumption}</p>
          </div>
        </div>

        {/* Center Interactive Map */}
        <div className="lg:col-span-6 space-y-3">
          <ChennaiMap
            heightClass="h-[600px]"
            focusPoint={focusPoint}
            nodes={nodes}
            edges={edges}
            incidents={incidents}
            teams={teams}
            facilities={facilities}
            studyAreaPolygon={studyArea?.polygon.geometry.coordinates[0]}
            gccCorePolygon={studyArea?.gccCoreApproximatePolygon.geometry.coordinates[0]}
            showLayers={showLayers}
            selectedEdgeId={selectedEdge?.id}
            interactivePickMode={pickCreateMode}
            onMapClick={(lat, lng) => {
              if (pickCreateMode) {
                setNewIncCoords({ lat, lng });
              }
            }}
            onEdgeClick={handleEdgeClick}
            onIncidentClick={(inc) => {
              setSelectedIncident(inc);
              setSelectedEdge(null);
            }}
          />
          <p className="text-[11px] text-slate-400">
            Click any road segment to inspect OSM metadata or toggle scenario closures. Click any
            incident marker to inspect or verify.
          </p>
        </div>

        {/* Right Inspector / Incident Creation Drawer */}
        <div className="lg:col-span-3 space-y-4">
          {pickCreateMode && (
            <div className="rounded-lg border border-teal-500/40 bg-[#0E1729] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-teal-300">New Map Incident</h3>
                <button
                  onClick={() => {
                    setPickCreateMode(false);
                    setNewIncCoords(null);
                  }}
                  className="text-slate-400 hover:text-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {!newIncCoords ? (
                <p className="text-xs text-slate-300">
                  Click anywhere within the Chennai study area on the map to pick coordinates.
                </p>
              ) : (
                <form onSubmit={handleCreateOnMap} className="space-y-2.5 text-xs">
                  <p className="font-mono text-[11px] text-slate-400">
                    Selected: {newIncCoords.lat}, {newIncCoords.lng}
                  </p>
                  <input
                    required
                    minLength={3}
                    placeholder="Incident title..."
                    value={newIncForm.title}
                    onChange={(e) => setNewIncForm({ ...newIncForm, title: e.target.value })}
                    className="w-full rounded border border-slate-700 bg-[#070D19] px-2.5 py-1.5 text-slate-100"
                  />
                  <select
                    value={newIncForm.severity}
                    onChange={(e) =>
                      setNewIncForm({ ...newIncForm, severity: e.target.value as IncidentSeverity })
                    }
                    className="w-full rounded border border-slate-700 bg-[#070D19] px-2.5 py-1.5 text-slate-100"
                  >
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                  <select
                    value={newIncForm.capability}
                    onChange={(e) => setNewIncForm({ ...newIncForm, capability: e.target.value })}
                    className="w-full rounded border border-slate-700 bg-[#070D19] px-2.5 py-1.5 text-slate-100"
                  >
                    <option value="boat_water">Requires Boat / Water Rescue</option>
                    <option value="medical">Requires Medical Triage</option>
                    <option value="heavy_rescue">Requires Heavy Rescue</option>
                  </select>
                  <textarea
                    rows={2}
                    placeholder="Details..."
                    value={newIncForm.description}
                    onChange={(e) => setNewIncForm({ ...newIncForm, description: e.target.value })}
                    className="w-full rounded border border-slate-700 bg-[#070D19] px-2.5 py-1.5 text-slate-100"
                  />
                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full rounded bg-teal-600 hover:bg-teal-500 py-2 font-medium text-white"
                  >
                    {saving ? 'Saving...' : 'Save Incident to Scenario'}
                  </button>
                </form>
              )}
            </div>
          )}

          {selectedEdge && (
            <div className="rounded-lg border border-slate-800/90 bg-[#0E1729] p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[11px] font-mono text-teal-400">{selectedEdge.osm_way_id}</span>
                  <h3 className="text-sm font-semibold text-slate-100">{selectedEdge.name}</h3>
                </div>
                <button onClick={() => setSelectedEdge(null)} className="text-slate-400 hover:text-slate-200">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <StatusBadge value={selectedEdge.closure_status} />

              <dl className="grid grid-cols-2 gap-2 text-xs border-t border-slate-800 pt-2.5">
                <div>
                  <dt className="text-slate-500">Length</dt>
                  <dd className="font-mono text-slate-200">{formatDistance(selectedEdge.length_m)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Assumed Time</dt>
                  <dd className="font-mono text-slate-200">{formatDuration(selectedEdge.travel_time_s)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Road Class</dt>
                  <dd className="text-slate-200 capitalize">{selectedEdge.highway_type}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Direction</dt>
                  <dd className="text-slate-200">{selectedEdge.is_oneway ? 'One-way' : 'Bidirectional'}</dd>
                </div>
              </dl>

              {canWrite ? (
                <div className="border-t border-slate-800 pt-3 space-y-2.5 text-xs">
                  <p className="font-medium text-slate-200">Scenario Road Closure Control</p>
                  <select
                    aria-label="Road override status"
                    value={closureStatus}
                    onChange={(e) => setClosureStatus(e.target.value as RoadClosureStatus)}
                    className="w-full rounded border border-slate-700 bg-[#070D19] px-2.5 py-1.5 text-slate-100"
                  >
                    <option value="open">Open (Passable — Not Verified Safe)</option>
                    <option value="restricted">Restricted (2.5x Simulated Cost Penalty)</option>
                    <option value="blocked">Blocked (Impassable)</option>
                  </select>
                  <input
                    type="text"
                    value={closureReason}
                    onChange={(e) => setClosureReason(e.target.value)}
                    placeholder="Simulated closure reason..."
                    className="w-full rounded border border-slate-700 bg-[#070D19] px-2.5 py-1.5 text-slate-100"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveClosure}
                      disabled={saving}
                      className="flex-1 inline-flex items-center justify-center gap-1 rounded bg-teal-600 hover:bg-teal-500 py-1.5 font-medium text-white"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      Save Status
                    </button>
                    {lastUndoEdge && (
                      <button
                        onClick={handleUndoClosure}
                        disabled={saving}
                        className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 px-2.5 py-1.5 text-slate-200"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Undo
                      </button>
                    )}
                  </div>
                  <button
                    onClick={handleResetAllClosures}
                    disabled={saving}
                    className="w-full rounded border border-slate-800 bg-[#070D19] hover:bg-slate-900 py-1.5 text-[11px] text-slate-400"
                  >
                    Reset All Scenario Closures to Open
                  </button>
                </div>
              ) : (
                <p className="text-[11px] text-slate-400 border-t border-slate-800 pt-2">
                  Sign in as Admin or Dispatcher to edit road closures.
                </p>
              )}
            </div>
          )}

          {selectedIncident && (
            <div className="rounded-lg border border-slate-800/90 bg-[#0E1729] p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[11px] font-mono text-teal-400">{selectedIncident.id}</span>
                  <h3 className="text-sm font-semibold text-slate-100">{selectedIncident.title}</h3>
                </div>
                <button
                  onClick={() => setSelectedIncident(null)}
                  className="text-slate-400 hover:text-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <StatusBadge value={selectedIncident.severity} />
                <StatusBadge value={selectedIncident.verification_status} />
                <StatusBadge value={selectedIncident.status} />
              </div>
              <p className="text-xs text-slate-300">{selectedIncident.description}</p>
              <div className="text-xs text-slate-400 space-y-1 border-t border-slate-800 pt-2">
                <div>Locality: {selectedIncident.locality}</div>
                <div className="font-mono">
                  Coords: {selectedIncident.lat.toFixed(4)}, {selectedIncident.lng.toFixed(4)}
                </div>
                <div>Requested Teams: {selectedIncident.requested_teams}</div>
              </div>
              {canWrite && selectedIncident.verification_status !== 'verified' && (
                <button
                  onClick={() => handleVerifyIncident(selectedIncident)}
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded bg-emerald-600 hover:bg-emerald-500 py-2 text-xs font-medium text-white"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Verify Simulated Incident
                </button>
              )}
            </div>
          )}

          {!selectedEdge && !selectedIncident && !pickCreateMode && (
            <div className="rounded-lg border border-slate-800/90 bg-[#0E1729] p-4 text-xs text-slate-400 space-y-2">
              <p className="font-medium text-slate-200">GIS Inspector</p>
              <p>
                Click any road segment on the map to inspect its OSM metadata, directionality, and
                scenario closure state, or click an incident marker to review verification details.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

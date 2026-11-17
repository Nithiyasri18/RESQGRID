import React, { useState } from 'react';
import {
  CheckCircle2,
  Copy,
  FlaskConical,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../app/AuthContext';
import { useScenario } from '../app/ScenarioContext';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { PageHeader } from '../components/ui/PageHeader';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useToast } from '../components/ui/Toast';
import { ApiError, apiRequest } from '../lib/api';
import type { Scenario } from '../types/resqgrid';

export function ScenariosPage() {
  const { scenarios, refreshScenarios, setSelectedScenarioId } = useScenario();
  const { canWrite, isAdmin } = useAuth();
  const { pushToast } = useToast();

  const [labOpen, setLabOpen] = useState(false);
  const [labForm, setLabForm] = useState({
    name: '',
    description: 'Custom scenario laboratory experiment',
    subarea: 'chennai_metro_study_area',
    simulationSeed: 20251201,
    closureFraction: 0.15,
    incidentCount: 6,
    teamCount: 5,
  });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Scenario | null>(null);

  const handleActivate = async (s: Scenario) => {
    setBusyId(s.id);
    try {
      await apiRequest(`/scenarios/${s.id}/activate`, { method: 'POST' });
      setSelectedScenarioId(s.id);
      await refreshScenarios();
      pushToast('Scenario activated', s.name, 'success');
    } catch (err) {
      pushToast('Activate failed', err instanceof ApiError ? err.message : 'Unauthorized', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleClone = async (s: Scenario) => {
    setBusyId(s.id);
    try {
      await apiRequest(`/scenarios/${s.id}/clone`, {
        method: 'POST',
        body: JSON.stringify({ name: `${s.name} (Clone)` }),
      });
      await refreshScenarios();
      pushToast('Scenario cloned', `Cloned ${s.name}`, 'success');
    } catch (err) {
      pushToast('Clone failed', err instanceof ApiError ? err.message : 'Error', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleReset = async (s: Scenario) => {
    setBusyId(s.id);
    try {
      await apiRequest(`/scenarios/${s.id}/reset`, { method: 'POST' });
      await refreshScenarios();
      pushToast('Scenario reset', 'Restored to deterministic seeded state.', 'info');
    } catch (err) {
      pushToast('Reset failed', err instanceof ApiError ? err.message : 'Error', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    try {
      await apiRequest(`/scenarios/${deleteTarget.id}`, { method: 'DELETE' });
      await refreshScenarios();
      pushToast('Scenario deleted', deleteTarget.name, 'info');
      setDeleteTarget(null);
    } catch (err) {
      pushToast('Delete failed', err instanceof ApiError ? err.message : 'Error', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleCreateLab = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyId('lab');
    try {
      await apiRequest('/scenarios', {
        method: 'POST',
        body: JSON.stringify(labForm),
      });
      await refreshScenarios();
      setLabOpen(false);
      setLabForm((f) => ({ ...f, name: '' }));
      pushToast('Lab scenario created', 'Generated deterministic incidents, teams, and closures.', 'success');
    } catch (err) {
      pushToast('Create failed', err instanceof ApiError ? err.message : 'Error', 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Scenario Laboratory & Simulation Control"
        subtitle="Isolated hypothetical disaster scenarios across Chennai. Road closures never mutate the base OSM graph."
        actions={
          canWrite ? (
            <button
              onClick={() => setLabOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-md bg-teal-600 hover:bg-teal-500 px-3.5 py-2 text-xs font-medium text-white"
            >
              <Plus className="w-4 h-4" />
              New Laboratory Scenario
            </button>
          ) : null
        }
      />

      {labOpen && canWrite && (
        <form
          onSubmit={handleCreateLab}
          className="rounded-lg border border-teal-500/40 bg-[#0E1729] p-5 space-y-4 text-xs"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-teal-300">
            <FlaskConical className="w-4 h-4" />
            Generate Deterministic Scenario Experiment
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-slate-300 mb-1">Scenario Name</label>
              <input
                required
                minLength={3}
                value={labForm.name}
                onChange={(e) => setLabForm({ ...labForm, name: e.target.value })}
                placeholder="High-Closure South Stress Test"
                className="w-full rounded border border-slate-700 bg-[#070D19] px-3 py-2 text-slate-100"
              />
            </div>
            <div>
              <label className="block text-slate-300 mb-1">Chennai Subarea Focus</label>
              <select
                value={labForm.subarea}
                onChange={(e) => setLabForm({ ...labForm, subarea: e.target.value })}
                className="w-full rounded border border-slate-700 bg-[#070D19] px-3 py-2 text-slate-100"
              >
                <option value="chennai_metro_study_area">Full Metropolitan Study Area</option>
                <option value="south_chennai_velachery">South / Velachery Basin</option>
                <option value="coastal_corridor">Coastal Marina / Ennore</option>
                <option value="north_chennai">North Chennai Industrial</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-300 mb-1">Deterministic Seed</label>
              <input
                type="number"
                value={labForm.simulationSeed}
                onChange={(e) => setLabForm({ ...labForm, simulationSeed: Number(e.target.value) })}
                className="w-full rounded border border-slate-700 bg-[#070D19] px-3 py-2 text-slate-100 font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-300 mb-1">
                Road Closure Fraction ({Math.round(labForm.closureFraction * 100)}%)
              </label>
              <input
                type="range"
                min={0}
                max={0.5}
                step={0.05}
                value={labForm.closureFraction}
                onChange={(e) =>
                  setLabForm({ ...labForm, closureFraction: Number(e.target.value) })
                }
                className="w-full accent-teal-500"
              />
            </div>
            <div>
              <label className="block text-slate-300 mb-1">Simulated Incidents (0-20)</label>
              <input
                type="number"
                min={0}
                max={20}
                value={labForm.incidentCount}
                onChange={(e) => setLabForm({ ...labForm, incidentCount: Number(e.target.value) })}
                className="w-full rounded border border-slate-700 bg-[#070D19] px-3 py-2 text-slate-100 font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-300 mb-1">Rescue Teams (1-12)</label>
              <input
                type="number"
                min={1}
                max={12}
                value={labForm.teamCount}
                onChange={(e) => setLabForm({ ...labForm, teamCount: Number(e.target.value) })}
                className="w-full rounded border border-slate-700 bg-[#070D19] px-3 py-2 text-slate-100 font-mono"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setLabOpen(false)}
              className="rounded border border-slate-700 px-4 py-2 text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busyId === 'lab'}
              className="rounded bg-teal-600 hover:bg-teal-500 px-4 py-2 font-medium text-white"
            >
              {busyId === 'lab' ? 'Generating...' : 'Create Lab Scenario'}
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {scenarios.map((s) => (
          <div
            key={s.id}
            className="rounded-lg border border-slate-800/90 bg-[#0E1729] p-5 flex flex-col justify-between gap-4"
          >
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="font-mono text-[11px] text-slate-500">
                    Seed #{s.simulation_seed} · Snapshot v{s.closure_version}
                  </span>
                  <h2 className="text-base font-semibold text-slate-100 mt-0.5">{s.name}</h2>
                </div>
                {s.is_active === 1 ? (
                  <StatusBadge value="verified" label="Active" />
                ) : (
                  <StatusBadge value="neutral" label="Standby" />
                )}
              </div>

              <p className="text-xs text-slate-400 leading-relaxed">{s.description}</p>

              <div className="grid grid-cols-4 gap-2 pt-2 text-center font-mono text-xs">
                <div className="rounded bg-[#070D19] border border-slate-800 py-1.5">
                  <div className="text-slate-100 font-semibold">{s.counts?.incidentCount ?? 0}</div>
                  <div className="font-sans text-[10px] text-slate-500">Incidents</div>
                </div>
                <div className="rounded bg-[#070D19] border border-slate-800 py-1.5">
                  <div className="text-red-400 font-semibold">{s.counts?.blockedCount ?? 0}</div>
                  <div className="font-sans text-[10px] text-slate-500">Blocked</div>
                </div>
                <div className="rounded bg-[#070D19] border border-slate-800 py-1.5">
                  <div className="text-amber-400 font-semibold">{s.counts?.restrictedCount ?? 0}</div>
                  <div className="font-sans text-[10px] text-slate-500">Restricted</div>
                </div>
                <div className="rounded bg-[#070D19] border border-slate-800 py-1.5">
                  <div className="text-emerald-400 font-semibold">{s.counts?.teamCount ?? 0}</div>
                  <div className="font-sans text-[10px] text-slate-500">Teams</div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setSelectedScenarioId(s.id)}
                className="rounded border border-slate-700 bg-[#070D19] hover:bg-slate-800 px-3 py-1.5 text-slate-200"
              >
                Inspect in UI
              </button>

              {canWrite && s.is_active !== 1 && (
                <button
                  type="button"
                  disabled={busyId === s.id}
                  onClick={() => handleActivate(s)}
                  className="inline-flex items-center gap-1 rounded bg-teal-600 hover:bg-teal-500 px-3 py-1.5 font-medium text-white"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Activate
                </button>
              )}

              {canWrite && (
                <button
                  type="button"
                  disabled={busyId === s.id}
                  onClick={() => handleClone(s)}
                  className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 px-2.5 py-1.5 text-slate-300"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Clone
                </button>
              )}

              {canWrite && s.is_seeded === 1 && (
                <button
                  type="button"
                  disabled={busyId === s.id}
                  onClick={() => handleReset(s)}
                  className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 px-2.5 py-1.5 text-slate-300"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset Seed
                </button>
              )}

              {isAdmin && s.is_active !== 1 && (
                <button
                  type="button"
                  onClick={() => setDeleteTarget(s)}
                  className="inline-flex items-center gap-1 rounded border border-red-900/60 bg-red-950/30 hover:bg-red-900/40 px-2.5 py-1.5 text-red-300 ml-auto"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Scenario"
        description={`Delete "${deleteTarget?.name}" and its isolated incidents, teams, and road closures?`}
        confirmLabel="Delete Scenario"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

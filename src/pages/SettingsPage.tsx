import React, { useEffect, useState } from 'react';
import { Save, Shield } from 'lucide-react';
import { useAuth } from '../app/AuthContext';
import { PageHeader } from '../components/ui/PageHeader';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useToast } from '../components/ui/Toast';
import { ApiError, apiRequest } from '../lib/api';

export function SettingsPage() {
  const { user, isAdmin } = useAuth();
  const { pushToast } = useToast();

  const [restrictedMultiplier, setRestrictedMultiplier] = useState(2.5);
  const [snapRadiusM, setSnapRadiusM] = useState(3500);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiRequest<{ settings: Record<string, string> }>('/settings')
      .then((res) => {
        if (res.settings.restricted_multiplier) {
          setRestrictedMultiplier(Number(res.settings.restricted_multiplier));
        }
        if (res.settings.snap_radius_m) {
          setSnapRadiusM(Number(res.settings.snap_radius_m));
        }
      })
      .catch(() => {});
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiRequest('/settings', {
        method: 'PATCH',
        body: JSON.stringify({ restrictedMultiplier, snapRadiusM }),
      });
      pushToast('Settings saved', 'Graph routing assumptions updated & cache invalidated.', 'success');
    } catch (err) {
      pushToast('Save failed', err instanceof ApiError ? err.message : 'Admin required', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="Application & Graph Assumptions Settings"
        subtitle="Account authorization status, routing penalty parameters, and geographic attribution."
      />

      {/* User Account Card */}
      <div className="rounded-lg border border-slate-800/90 bg-[#0E1729] p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <Shield className="w-4 h-4 text-teal-400" />
            Authenticated Session
          </h2>
          {user && <StatusBadge value="verified" label={user.role.toUpperCase()} />}
        </div>
        {user ? (
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs pt-2">
            <div>
              <dt className="text-slate-500">Display Name</dt>
              <dd className="text-slate-100 font-medium mt-0.5">{user.displayName}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Email</dt>
              <dd className="font-mono text-slate-200 mt-0.5">{user.email}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Server-Enforced Role</dt>
              <dd className="text-teal-400 capitalize mt-0.5">{user.role}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-xs text-slate-400">
            Currently browsing as an unauthenticated guest (read-only access). Sign in at /login to
            perform operator actions.
          </p>
        )}
      </div>

      {/* Graph & Simulation Parameters */}
      <form
        onSubmit={handleSave}
        className="rounded-lg border border-slate-800/90 bg-[#0E1729] p-5 space-y-4 text-xs"
      >
        <div>
          <h2 className="text-sm font-semibold text-slate-100">
            Routing Graph &amp; Spatial Snap Assumptions
          </h2>
          <p className="text-slate-400 mt-0.5">
            Explicit simulation parameters governing restricted roads and coordinate snapping.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-slate-300 mb-1">
              Restricted Edge Cost Multiplier (1.0 - 20.0)
            </label>
            <input
              type="number"
              step="0.1"
              min={1}
              max={20}
              disabled={!isAdmin}
              value={restrictedMultiplier}
              onChange={(e) => setRestrictedMultiplier(Number(e.target.value))}
              className="w-full rounded border border-slate-700 bg-[#070D19] px-3 py-2 text-slate-100 font-mono disabled:opacity-60"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Applied to travel time &amp; effective cost on roads marked Restricted.
            </p>
          </div>
          <div>
            <label className="block text-slate-300 mb-1">
              Spatial Node Snap Bound (meters)
            </label>
            <input
              type="number"
              step={100}
              min={500}
              max={15000}
              disabled={!isAdmin}
              value={snapRadiusM}
              onChange={(e) => setSnapRadiusM(Number(e.target.value))}
              className="w-full rounded border border-slate-700 bg-[#070D19] px-3 py-2 text-slate-100 font-mono disabled:opacity-60"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Maximum geodesic distance before returning an out-of-bounds snap error.
            </p>
          </div>
        </div>

        {isAdmin ? (
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded bg-teal-600 hover:bg-teal-500 px-4 py-2 font-medium text-white"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Saving...' : 'Save Parameters'}
          </button>
        ) : (
          <p className="text-[11px] text-amber-300/80">Admin role required to modify global simulation parameters.</p>
        )}
      </form>

      {/* ODbL & Academic Disclaimers */}
      <div className="rounded-lg border border-slate-800/90 bg-[#0E1729] p-5 text-xs text-slate-400 space-y-2 leading-relaxed">
        <h2 className="text-sm font-semibold text-slate-100">
          Geographic Coverage, ODbL Attribution &amp; Disclaimers
        </h2>
        <p>
          <strong className="text-slate-200">Study Area vs. GCC:</strong> The RESQGRID study-area
          polygon includes Greater Chennai Corporation (GCC) core zones as well as outer
          metropolitan corridors such as Avadi and Tambaram. Outer localities are explicitly labeled
          as Metropolitan Study Area (Non-GCC).
        </p>
        <p>
          <strong className="text-slate-200">OpenStreetMap Attribution (ODbL):</strong> Map tile
          layers and road topology references are derived from OpenStreetMap (&copy; OpenStreetMap
          contributors, ODbL). Run <code className="font-mono text-teal-400">scripts/import_chennai_roads.py</code>{' '}
          locally with OSMnx to ingest a fresh citywide extract.
        </p>
        <p>
          <strong className="text-slate-200">Safety Disclaimer:</strong> Open roads in the graph
          represent simulated passability only and are never guaranteed hazard-safe. All emergencies,
          teams, and movement states are academic simulations.
        </p>
      </div>
    </div>
  );
}

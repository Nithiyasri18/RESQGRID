import React, { useCallback, useEffect, useState } from 'react';
import { Send, UserPlus, Users } from 'lucide-react';
import { useScenario } from '../app/ScenarioContext';
import { PageHeader } from '../components/ui/PageHeader';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useToast } from '../components/ui/Toast';
import { ApiError, apiRequest } from '../lib/api';
import { CAPABILITY_LABELS, parseCapabilities } from '../lib/format';
import type { IncidentSeverity, VolunteerRecord } from '../types/resqgrid';

export function PortalPage() {
  const { selectedScenarioId, activeScenario, lastEventTick } = useScenario();
  const { pushToast } = useToast();

  const [volunteers, setVolunteers] = useState<VolunteerRecord[]>([]);
  const [incForm, setIncForm] = useState({
    title: '',
    description: '',
    severity: 'high' as IncidentSeverity,
    locality: 'Velachery',
    lat: 12.9791,
    lng: 80.2212,
    affectedPeopleEstimate: 4,
    capability: 'boat_water',
    reporterDisplayName: 'Simulated Citizen User',
  });
  const [volForm, setVolForm] = useState({
    displayName: '',
    locality: 'Adyar',
    capability: 'first_aid',
    availabilityStatus: 'available' as 'available' | 'standby' | 'unavailable',
  });
  const [busy, setBusy] = useState(false);

  const loadVolunteers = useCallback(async () => {
    try {
      const q = selectedScenarioId ? `?scenarioId=${encodeURIComponent(selectedScenarioId)}` : '';
      const res = await apiRequest<{ items: VolunteerRecord[] }>(`/portal/volunteers${q}`);
      setVolunteers(res.items);
    } catch {
      // ignore
    }
  }, [selectedScenarioId]);

  useEffect(() => {
    loadVolunteers();
  }, [loadVolunteers, lastEventTick]);

  const submitCitizenIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await apiRequest('/portal/incidents', {
        method: 'POST',
        body: JSON.stringify({
          ...incForm,
          requiredCapabilities: [incForm.capability],
          scenarioId: selectedScenarioId,
        }),
      });
      pushToast(
        'Test Report Submitted',
        'Queued as UNVERIFIED until command staff verifies it.',
        'success'
      );
      setIncForm((f) => ({ ...f, title: '', description: '' }));
    } catch (err) {
      pushToast('Submission failed', err instanceof ApiError ? err.message : 'Error', 'error');
    } finally {
      setBusy(false);
    }
  };

  const submitVolunteer = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await apiRequest('/portal/volunteers', {
        method: 'POST',
        body: JSON.stringify({
          displayName: volForm.displayName,
          locality: volForm.locality,
          capabilities: [volForm.capability],
          availabilityStatus: volForm.availabilityStatus,
          scenarioId: selectedScenarioId,
        }),
      });
      pushToast('Volunteer Registered', 'Availability saved with privacy controls.', 'success');
      setVolForm((f) => ({ ...f, displayName: '' }));
      await loadVolunteers();
    } catch (err) {
      pushToast('Registration failed', err instanceof ApiError ? err.message : 'Error', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Citizen & Volunteer Simulation Portal"
        subtitle={`Submitting into simulated scenario: ${activeScenario?.name || 'Active Scenario'}. Submissions remain unverified until reviewed by an Admin/Dispatcher.`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Citizen Fictional Test Incident Form */}
        <form
          onSubmit={submitCitizenIncident}
          className="lg:col-span-6 rounded-lg border border-slate-800/90 bg-[#0E1729] p-5 space-y-4 text-xs"
        >
          <div>
            <h2 className="text-base font-semibold text-slate-100">Submit Simulated Test Incident</h2>
            <p className="text-slate-400 mt-0.5">
              Do not enter real emergency events. Reports enter the queue as <strong>Unverified</strong>.
            </p>
          </div>

          <div>
            <label className="block text-slate-300 mb-1">Report Title</label>
            <input
              required
              minLength={3}
              value={incForm.title}
              onChange={(e) => setIncForm({ ...incForm, title: e.target.value })}
              placeholder="Simulated Street Flooding — Perungudi 3rd Cross"
              className="w-full rounded border border-slate-700 bg-[#070D19] px-3 py-2 text-slate-100"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 mb-1">Perceived Severity</label>
              <select
                value={incForm.severity}
                onChange={(e) =>
                  setIncForm({ ...incForm, severity: e.target.value as IncidentSeverity })
                }
                className="w-full rounded border border-slate-700 bg-[#070D19] px-3 py-2 text-slate-100"
              >
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-300 mb-1">Chennai Locality</label>
              <input
                value={incForm.locality}
                onChange={(e) => setIncForm({ ...incForm, locality: e.target.value })}
                className="w-full rounded border border-slate-700 bg-[#070D19] px-3 py-2 text-slate-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 mb-1">Latitude</label>
              <input
                type="number"
                step="0.0001"
                value={incForm.lat}
                onChange={(e) => setIncForm({ ...incForm, lat: Number(e.target.value) })}
                className="w-full rounded border border-slate-700 bg-[#070D19] px-3 py-2 text-slate-100 font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-300 mb-1">Longitude</label>
              <input
                type="number"
                step="0.0001"
                value={incForm.lng}
                onChange={(e) => setIncForm({ ...incForm, lng: Number(e.target.value) })}
                className="w-full rounded border border-slate-700 bg-[#070D19] px-3 py-2 text-slate-100 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-300 mb-1">Situation Notes</label>
            <textarea
              rows={3}
              value={incForm.description}
              onChange={(e) => setIncForm({ ...incForm, description: e.target.value })}
              placeholder="Simulated water depth, access blockages, assistance needed..."
              className="w-full rounded border border-slate-700 bg-[#070D19] px-3 py-2 text-slate-100"
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md bg-teal-600 hover:bg-teal-500 px-4 py-2 font-medium text-white"
          >
            <Send className="w-3.5 h-3.5" />
            Submit Unverified Test Incident
          </button>
        </form>

        {/* Volunteer Availability Registration */}
        <div className="lg:col-span-6 space-y-5">
          <form
            onSubmit={submitVolunteer}
            className="rounded-lg border border-slate-800/90 bg-[#0E1729] p-5 space-y-3 text-xs"
          >
            <div>
              <h2 className="text-base font-semibold text-slate-100 flex items-center gap-1.5">
                <UserPlus className="w-4 h-4 text-teal-400" />
                Register Simulated Volunteer Availability
              </h2>
              <p className="text-slate-400 mt-0.5">
                Privacy notice: Only public display alias, locality, and skill tags are stored or shown.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 mb-1">Display Name / Alias</label>
                <input
                  required
                  minLength={2}
                  value={volForm.displayName}
                  onChange={(e) => setVolForm({ ...volForm, displayName: e.target.value })}
                  placeholder="Ramesh N. (Volunteer)"
                  className="w-full rounded border border-slate-700 bg-[#070D19] px-3 py-2 text-slate-100"
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1">Locality</label>
                <input
                  value={volForm.locality}
                  onChange={(e) => setVolForm({ ...volForm, locality: e.target.value })}
                  className="w-full rounded border border-slate-700 bg-[#070D19] px-3 py-2 text-slate-100"
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1">Skill Capability</label>
                <select
                  value={volForm.capability}
                  onChange={(e) => setVolForm({ ...volForm, capability: e.target.value })}
                  className="w-full rounded border border-slate-700 bg-[#070D19] px-3 py-2 text-slate-100"
                >
                  <option value="first_aid">First Aid</option>
                  <option value="boat_water">Boat / Flood Support</option>
                  <option value="logistics">Relief Logistics</option>
                  <option value="heavy_rescue">Debris Clearance</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-300 mb-1">Availability</label>
                <select
                  value={volForm.availabilityStatus}
                  onChange={(e) =>
                    setVolForm({
                      ...volForm,
                      availabilityStatus: e.target.value as 'available' | 'standby' | 'unavailable',
                    })
                  }
                  className="w-full rounded border border-slate-700 bg-[#070D19] px-3 py-2 text-slate-100"
                >
                  <option value="available">Available</option>
                  <option value="standby">Standby</option>
                  <option value="unavailable">Unavailable</option>
                </select>
              </div>
            </div>
            <button
              type="submit"
              disabled={busy}
              className="rounded-md border border-teal-500/40 bg-teal-950/40 hover:bg-teal-900/50 px-4 py-2 font-medium text-teal-300"
            >
              Register Availability
            </button>
          </form>

          <div className="rounded-lg border border-slate-800/90 bg-[#0E1729] p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-teal-400" />
              Active Simulated Volunteers ({volunteers.length})
            </h3>
            <div className="divide-y divide-slate-800/70">
              {volunteers.map((v) => (
                <div key={v.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                  <div>
                    <p className="font-medium text-slate-100">{v.display_name}</p>
                    <p className="text-slate-400">
                      {v.locality} ·{' '}
                      {parseCapabilities(v.capabilities_json)
                        .map((c) => CAPABILITY_LABELS[c] || c)
                        .join(', ')}
                    </p>
                  </div>
                  <StatusBadge
                    value={v.availability_status === 'available' ? 'available' : 'neutral'}
                    label={v.availability_status}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

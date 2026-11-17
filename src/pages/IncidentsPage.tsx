import React, { useCallback, useEffect, useState } from 'react';
import { Check, Plus, ShieldCheck, Trash2, X } from 'lucide-react';
import { useAuth } from '../app/AuthContext';
import { useScenario } from '../app/ScenarioContext';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { DataTable } from '../components/ui/DataTable';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { FilterBar } from '../components/ui/FilterBar';
import { LoadingSkeleton } from '../components/ui/LoadingSkeleton';
import { PageHeader } from '../components/ui/PageHeader';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useToast } from '../components/ui/Toast';
import { ApiError, apiRequest } from '../lib/api';
import { CAPABILITY_LABELS, formatTimestamp, parseCapabilities } from '../lib/format';
import type { Incident, IncidentSeverity } from '../types/resqgrid';

const DEFAULT_FORM = {
  title: '',
  description: '',
  category: 'flood_rescue',
  severity: 'high' as IncidentSeverity,
  locality: 'Velachery',
  lat: 12.9791,
  lng: 80.2212,
  affectedPeopleEstimate: 10,
  requestedTeams: 1,
  requiredCapabilities: ['boat_water'],
};

export function IncidentsPage() {
  const { selectedScenarioId, lastEventTick } = useScenario();
  const { canWrite, isAdmin } = useAuth();
  const { pushToast } = useToast();

  const [items, setItems] = useState<Incident[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [search, setSearch] = useState('');
  const [severity, setSeverity] = useState('all');
  const [status, setStatus] = useState('all');
  const [verificationStatus, setVerificationStatus] = useState('all');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Incident | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Incident | null>(null);

  const loadIncidents = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        severity,
        status,
        verificationStatus,
      });
      if (selectedScenarioId) params.set('scenarioId', selectedScenarioId);
      if (search.trim()) params.set('search', search.trim());

      const res = await apiRequest<{ items: Incident[]; total: number }>(
        `/incidents?${params.toString()}`
      );
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load incidents.');
    } finally {
      setLoading(false);
    }
  }, [page, severity, status, verificationStatus, search, selectedScenarioId]);

  useEffect(() => {
    loadIncidents();
  }, [loadIncidents, lastEventTick]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiRequest('/incidents', {
        method: 'POST',
        body: JSON.stringify({ ...form, scenarioId: selectedScenarioId }),
      });
      pushToast('Incident created', 'Simulated incident added to active scenario.', 'success');
      setModalOpen(false);
      setForm(DEFAULT_FORM);
      loadIncidents();
    } catch (err) {
      pushToast('Create failed', err instanceof ApiError ? err.message : 'Unable to save.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePatch = async (inc: Incident, patch: Record<string, unknown>, msg: string) => {
    try {
      const res = await apiRequest<{ item: Incident }>(`/incidents/${inc.id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      pushToast('Incident updated', msg, 'success');
      if (selected?.id === inc.id) setSelected(res.item);
      loadIncidents();
    } catch (err) {
      pushToast('Update failed', err instanceof ApiError ? err.message : 'Unauthorized.', 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiRequest(`/incidents/${deleteTarget.id}`, { method: 'DELETE' });
      pushToast('Incident deleted', deleteTarget.title, 'info');
      if (selected?.id === deleteTarget.id) setSelected(null);
      setDeleteTarget(null);
      loadIncidents();
    } catch (err) {
      pushToast('Delete failed', err instanceof ApiError ? err.message : 'Admin required.', 'error');
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Incident Operations"
        subtitle="Manage simulated incidents, verification statuses, capability requirements, and team demand."
        actions={
          canWrite ? (
            <button
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-teal-600 hover:bg-teal-500 px-3.5 py-2 text-xs font-medium text-white transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Simulated Incident
            </button>
          ) : (
            <span className="text-xs text-slate-400">Sign in as Admin/Dispatcher to create or verify</span>
          )
        }
      />

      <FilterBar
        search={search}
        onSearchChange={(val) => {
          setSearch(val);
          setPage(1);
        }}
        searchPlaceholder="Search by title, locality, or description..."
      >
        <select
          aria-label="Filter by severity"
          value={severity}
          onChange={(e) => {
            setSeverity(e.target.value);
            setPage(1);
          }}
          className="rounded-md border border-slate-700/80 bg-[#070D19] px-3 py-1.5 text-xs text-slate-200"
        >
          <option value="all">All Severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        <select
          aria-label="Filter by verification status"
          value={verificationStatus}
          onChange={(e) => {
            setVerificationStatus(e.target.value);
            setPage(1);
          }}
          className="rounded-md border border-slate-700/80 bg-[#070D19] px-3 py-1.5 text-xs text-slate-200"
        >
          <option value="all">All Verification</option>
          <option value="verified">Verified</option>
          <option value="unverified">Unverified</option>
          <option value="rejected">Rejected</option>
        </select>

        <select
          aria-label="Filter by incident status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="rounded-md border border-slate-700/80 bg-[#070D19] px-3 py-1.5 text-xs text-slate-200"
        >
          <option value="all">All Statuses</option>
          <option value="open">Open</option>
          <option value="assigned">Assigned</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
      </FilterBar>

      {error && <ErrorState message={error} onRetry={loadIncidents} />}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <div className={selected ? 'xl:col-span-8 space-y-3' : 'xl:col-span-12 space-y-3'}>
          {loading ? (
            <LoadingSkeleton rows={6} />
          ) : (
            <DataTable
              rows={items}
              rowKey={(r) => r.id}
              onRowClick={(r) => setSelected(r)}
              emptyState={
                <EmptyState
                  title="No incidents match filters"
                  description="Try clearing search filters or add a new simulated incident to this scenario."
                />
              }
              columns={[
                {
                  key: 'title',
                  header: 'Incident',
                  render: (r) => (
                    <div className="min-w-[200px]">
                      <p className="font-medium text-slate-100">{r.title}</p>
                      <p className="text-xs text-slate-400">
                        {r.locality} · {r.lat.toFixed(4)}, {r.lng.toFixed(4)}
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
                {
                  key: 'affected',
                  header: 'Est. Affected',
                  align: 'right',
                  render: (r) => (
                    <span className="font-mono text-xs">{r.affected_people_estimate}</span>
                  ),
                },
              ]}
            />
          )}

          {/* Pagination */}
          <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
            <span>
              Showing {items.length} of {total} incident(s)
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded border border-slate-800 bg-[#0E1729] px-3 py-1 disabled:opacity-40 hover:bg-slate-800"
              >
                Previous
              </button>
              <span className="font-mono">
                Page {page} / {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded border border-slate-800 bg-[#0E1729] px-3 py-1 disabled:opacity-40 hover:bg-slate-800"
              >
                Next
              </button>
            </div>
          </div>
        </div>

        {/* Detail Drawer */}
        {selected && (
          <div className="xl:col-span-4 rounded-lg border border-slate-800/90 bg-[#0E1729] p-5 space-y-4 h-fit">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] font-mono text-teal-400">{selected.id}</p>
                <h2 className="text-base font-semibold text-slate-100 mt-0.5">{selected.title}</h2>
              </div>
              <button
                onClick={() => setSelected(null)}
                aria-label="Close incident details"
                className="text-slate-400 hover:text-slate-200 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              <StatusBadge value={selected.severity} />
              <StatusBadge value={selected.verification_status} />
              <StatusBadge value={selected.status} />
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">{selected.description || 'No description provided.'}</p>

            <dl className="grid grid-cols-2 gap-3 text-xs border-t border-slate-800 pt-3">
              <div>
                <dt className="text-slate-500">Locality</dt>
                <dd className="text-slate-200 mt-0.5">{selected.locality}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Coordinates</dt>
                <dd className="font-mono text-slate-200 mt-0.5">
                  {selected.lat.toFixed(4)}, {selected.lng.toFixed(4)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Requested Teams</dt>
                <dd className="font-mono text-slate-200 mt-0.5">{selected.requested_teams}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Est. Affected</dt>
                <dd className="font-mono text-slate-200 mt-0.5">{selected.affected_people_estimate}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-slate-500">Required Capabilities</dt>
                <dd className="text-slate-200 mt-0.5">
                  {parseCapabilities(selected.required_capabilities_json)
                    .map((c) => CAPABILITY_LABELS[c] || c)
                    .join(' · ')}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-slate-500">Reported At</dt>
                <dd className="font-mono text-slate-300 mt-0.5">{formatTimestamp(selected.created_at)}</dd>
              </div>
            </dl>

            {canWrite && (
              <div className="border-t border-slate-800 pt-3 space-y-2">
                <p className="text-xs font-medium text-slate-300">Operator Actions</p>
                <div className="flex flex-wrap gap-2">
                  {selected.verification_status !== 'verified' && (
                    <button
                      onClick={() =>
                        handlePatch(selected, { verificationStatus: 'verified' }, 'Marked verified')
                      }
                      className="inline-flex items-center gap-1 rounded bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Verify Incident
                    </button>
                  )}
                  {selected.status !== 'resolved' && (
                    <button
                      onClick={() =>
                        handlePatch(selected, { status: 'resolved' }, 'Marked resolved')
                      }
                      className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Mark Resolved
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      onClick={() => setDeleteTarget(selected)}
                      className="inline-flex items-center gap-1 rounded border border-red-800/70 bg-red-950/40 hover:bg-red-900/50 px-3 py-1.5 text-xs font-medium text-red-300"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Incident Modal */}
      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        >
          <div className="w-full max-w-lg rounded-lg border border-slate-700 bg-[#0E1729] p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h2 className="text-base font-semibold text-slate-100">Create Simulated Incident</h2>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 mb-1">Title</label>
                <input
                  required
                  minLength={3}
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Simulated Waterlogging — Guindy Industrial Gate"
                  className="w-full rounded border border-slate-700 bg-[#070D19] px-3 py-2 text-slate-100"
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full rounded border border-slate-700 bg-[#070D19] px-3 py-2 text-slate-100"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1">Severity</label>
                  <select
                    value={form.severity}
                    onChange={(e) =>
                      setForm({ ...form, severity: e.target.value as IncidentSeverity })
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
                  <label className="block text-slate-300 mb-1">Locality</label>
                  <input
                    value={form.locality}
                    onChange={(e) => setForm({ ...form, locality: e.target.value })}
                    className="w-full rounded border border-slate-700 bg-[#070D19] px-3 py-2 text-slate-100"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1">Latitude (Chennai)</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={form.lat}
                    onChange={(e) => setForm({ ...form, lat: Number(e.target.value) })}
                    className="w-full rounded border border-slate-700 bg-[#070D19] px-3 py-2 text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">Longitude (Chennai)</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={form.lng}
                    onChange={(e) => setForm({ ...form, lng: Number(e.target.value) })}
                    className="w-full rounded border border-slate-700 bg-[#070D19] px-3 py-2 text-slate-100 font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1">Teams Requested</label>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={form.requestedTeams}
                    onChange={(e) => setForm({ ...form, requestedTeams: Number(e.target.value) })}
                    className="w-full rounded border border-slate-700 bg-[#070D19] px-3 py-2 text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">Est. Affected</label>
                  <input
                    type="number"
                    min={1}
                    value={form.affectedPeopleEstimate}
                    onChange={(e) =>
                      setForm({ ...form, affectedPeopleEstimate: Number(e.target.value) })
                    }
                    className="w-full rounded border border-slate-700 bg-[#070D19] px-3 py-2 text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">Capability Req</label>
                  <select
                    value={form.requiredCapabilities[0]}
                    onChange={(e) => setForm({ ...form, requiredCapabilities: [e.target.value] })}
                    className="w-full rounded border border-slate-700 bg-[#070D19] px-3 py-2 text-slate-100"
                  >
                    <option value="boat_water">Boat / Water</option>
                    <option value="medical">Medical Triage</option>
                    <option value="heavy_rescue">Heavy Rescue</option>
                    <option value="general_rescue">General Rescue</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded border border-slate-700 px-4 py-2 text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded bg-teal-600 hover:bg-teal-500 px-4 py-2 font-medium text-white"
                >
                  {submitting ? 'Saving...' : 'Create Incident'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Simulated Incident"
        description={`Permanently remove "${deleteTarget?.title}" from this scenario?`}
        confirmLabel="Delete Incident"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useDepartment } from '../../context/DepartmentContext';

const ENTITY_OPTIONS = [
  { value: 'call', label: 'Call' },
  { value: 'criminal_record', label: 'Record' },
  { value: 'arrest_report', label: 'Arrest Report' },
  { value: 'warrant', label: 'Warrant' },
  { value: 'poi', label: 'POI' },
  { value: 'evidence', label: 'Evidence' },
];

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'review', label: 'Supervisor Review' },
  { value: 'monitoring', label: 'Monitoring' },
  { value: 'closed', label: 'Closed' },
];

function formatEntityTypeLabel(value) {
  const item = ENTITY_OPTIONS.find((option) => option.value === value);
  return item?.label || String(value || '').trim() || 'Linked Item';
}

function formatStatusLabel(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'review') return 'Supervisor Review';
  if (normalized === 'monitoring') return 'Monitoring';
  if (normalized === 'closed') return 'Closed';
  return 'Open';
}

export default function Incidents() {
  const { activeDepartment } = useDepartment();
  const [searchParams, setSearchParams] = useSearchParams();
  const [incidents, setIncidents] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [listStatus, setListStatus] = useState('open');
  const [selectedIncidentId, setSelectedIncidentId] = useState(0);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [loadingIncident, setLoadingIncident] = useState(false);
  const [savingIncident, setSavingIncident] = useState(false);
  const [linkingItem, setLinkingItem] = useState(false);
  const [unlinkingLinkId, setUnlinkingLinkId] = useState(0);
  const [deletingIncident, setDeletingIncident] = useState(false);
  const [error, setError] = useState('');
  const [relatedEntityLinks, setRelatedEntityLinks] = useState([]);

  const [createForm, setCreateForm] = useState({
    title: '',
    summary: '',
    location: '',
    priority: '2',
  });

  const [linkForm, setLinkForm] = useState(() => ({
    entity_type: String(searchParams.get('entity_type') || '').trim().toLowerCase() || 'call',
    entity_id: String(searchParams.get('entity_id') || '').trim(),
    note: '',
  }));

  const departmentId = Number(activeDepartment?.id || 0);
  const dispatchMode = !!activeDepartment?.is_dispatch;

  const prefilledEntity = useMemo(() => {
    const entityType = String(searchParams.get('entity_type') || '').trim().toLowerCase();
    const entityId = Number(searchParams.get('entity_id'));
    if (!entityType || !Number.isInteger(entityId) || entityId <= 0) return null;
    return { entity_type: entityType, entity_id: entityId };
  }, [searchParams]);

  async function fetchIncidents(nextSelectedId = null) {
    if (!departmentId) {
      setIncidents([]);
      return;
    }
    setLoadingList(true);
    setError('');
    try {
      const query = new URLSearchParams({
        department_id: String(departmentId),
        status: listStatus,
        limit: '100',
      });
      if (dispatchMode) query.set('dispatch', 'true');
      const rows = await api.get(`/api/incidents?${query.toString()}`);
      const list = Array.isArray(rows) ? rows : [];
      setIncidents(list);

      const explicitSelection = Number(nextSelectedId || 0);
      if (explicitSelection > 0) {
        setSelectedIncidentId(explicitSelection);
        return;
      }

      if (selectedIncidentId > 0) {
        const stillExists = list.some((item) => Number(item.id) === Number(selectedIncidentId));
        if (stillExists) return;
      }
      setSelectedIncidentId(Number(list[0]?.id || 0));
    } catch (err) {
      setError(err.message || 'Failed to load incidents');
      setIncidents([]);
    } finally {
      setLoadingList(false);
    }
  }

  async function fetchIncidentById(incidentId) {
    const parsedId = Number(incidentId || 0);
    if (!parsedId) {
      setSelectedIncident(null);
      return;
    }
    setLoadingIncident(true);
    setError('');
    try {
      const data = await api.get(`/api/incidents/${parsedId}`);
      setSelectedIncident(data || null);
    } catch (err) {
      setSelectedIncident(null);
      setError(err.message || 'Failed to load incident');
    } finally {
      setLoadingIncident(false);
    }
  }

  async function fetchRelatedEntityLinks() {
    if (!departmentId || !prefilledEntity?.entity_type || !prefilledEntity?.entity_id) {
      setRelatedEntityLinks([]);
      return;
    }
    try {
      const query = new URLSearchParams({
        department_id: String(departmentId),
        entity_type: prefilledEntity.entity_type,
        entity_id: String(prefilledEntity.entity_id),
      });
      if (dispatchMode) query.set('dispatch', 'true');
      const rows = await api.get(`/api/incidents/by-entity?${query.toString()}`);
      setRelatedEntityLinks(Array.isArray(rows) ? rows : []);
    } catch {
      setRelatedEntityLinks([]);
    }
  }

  useEffect(() => {
    fetchIncidents();
  }, [departmentId, dispatchMode, listStatus]);

  useEffect(() => {
    fetchIncidentById(selectedIncidentId);
  }, [selectedIncidentId]);

  useEffect(() => {
    const nextEntityType = String(searchParams.get('entity_type') || '').trim().toLowerCase();
    const nextEntityId = String(searchParams.get('entity_id') || '').trim();
    const nextIncidentId = Number(searchParams.get('incident_id'));
    if (nextEntityType || nextEntityId) {
      setLinkForm((prev) => ({
        ...prev,
        entity_type: nextEntityType || prev.entity_type || 'call',
        entity_id: nextEntityId || prev.entity_id || '',
      }));
    }
    if (Number.isInteger(nextIncidentId) && nextIncidentId > 0) {
      setSelectedIncidentId(nextIncidentId);
    }
    fetchRelatedEntityLinks();
  }, [searchParams, departmentId, dispatchMode]);

  async function createIncident(event) {
    event.preventDefault();
    if (!departmentId) return;
    const title = String(createForm.title || '').trim();
    if (!title) {
      setError('Incident title is required');
      return;
    }

    const payload = {
      department_id: departmentId,
      title,
      summary: String(createForm.summary || '').trim(),
      location: String(createForm.location || '').trim(),
      priority: String(createForm.priority || '2'),
    };
    if (prefilledEntity?.entity_type && prefilledEntity?.entity_id) {
      payload.links = [{
        entity_type: prefilledEntity.entity_type,
        entity_id: prefilledEntity.entity_id,
        note: 'Initial link from lookup/workflow',
      }];
    }

    setSavingIncident(true);
    setError('');
    try {
      const created = await api.post('/api/incidents', payload);
      setCreateForm({ title: '', summary: '', location: '', priority: '2' });
      await fetchIncidents(created?.id);
      if (created?.id) {
        setSelectedIncidentId(Number(created.id));
      }
      await fetchRelatedEntityLinks();
    } catch (err) {
      setError(err.message || 'Failed to create incident');
    } finally {
      setSavingIncident(false);
    }
  }

  async function updateIncidentStatus(status) {
    if (!selectedIncident?.id) return;
    setSavingIncident(true);
    setError('');
    try {
      const updated = await api.patch(`/api/incidents/${selectedIncident.id}`, { status });
      setSelectedIncident(updated || null);
      await fetchIncidents(selectedIncident.id);
      await fetchRelatedEntityLinks();
    } catch (err) {
      setError(err.message || 'Failed to update incident');
    } finally {
      setSavingIncident(false);
    }
  }

  async function linkEntityToIncident(event) {
    event.preventDefault();
    if (!selectedIncident?.id) {
      setError('Select an incident/case first');
      return;
    }
    const entityType = String(linkForm.entity_type || '').trim().toLowerCase();
    const entityId = Number(linkForm.entity_id);
    if (!entityType || !Number.isInteger(entityId) || entityId <= 0) {
      setError('A valid entity type and numeric entity ID are required');
      return;
    }

    setLinkingItem(true);
    setError('');
    try {
      const updated = await api.post(`/api/incidents/${selectedIncident.id}/links`, {
        entity_type: entityType,
        entity_id: entityId,
        note: String(linkForm.note || '').trim(),
      });
      setSelectedIncident(updated || null);
      setLinkForm((prev) => ({ ...prev, note: '' }));
      await fetchIncidents(selectedIncident.id);
      await fetchRelatedEntityLinks();
    } catch (err) {
      setError(err.message || 'Failed to link item');
    } finally {
      setLinkingItem(false);
    }
  }

  async function unlinkFromIncident(linkId) {
    if (!selectedIncident?.id || !linkId) return;
    if (!window.confirm('Remove this link from the incident/case?')) return;
    setUnlinkingLinkId(Number(linkId));
    setError('');
    try {
      const updated = await api.delete(`/api/incidents/${selectedIncident.id}/links/${linkId}`);
      setSelectedIncident(updated || null);
      await fetchIncidents(selectedIncident.id);
      await fetchRelatedEntityLinks();
    } catch (err) {
      setError(err.message || 'Failed to remove link');
    } finally {
      setUnlinkingLinkId(0);
    }
  }

  async function deleteIncident() {
    if (!selectedIncident?.id) return;
    if (!window.confirm(`Delete ${selectedIncident.incident_number || `Incident #${selectedIncident.id}`} and all links?`)) return;
    setDeletingIncident(true);
    setError('');
    try {
      const deletingId = Number(selectedIncident.id);
      await api.delete(`/api/incidents/${deletingId}`);
      setSelectedIncident(null);
      setSelectedIncidentId(0);
      await fetchIncidents();
      await fetchRelatedEntityLinks();
      const params = new URLSearchParams(searchParams);
      params.delete('incident_id');
      setSearchParams(params, { replace: true });
    } catch (err) {
      setError(err.message || 'Failed to delete incident');
    } finally {
      setDeletingIncident(false);
    }
  }

  if (!activeDepartment) {
    return <p className="text-sm text-cad-muted">Select a department to manage incidents/cases.</p>;
  }

  return (
    <div className="max-w-7xl space-y-6">
      <div className="bg-cad-card border border-cad-border rounded-2xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-cad-muted">Incident Linking</p>
            <h2 className="text-xl font-bold mt-1">Incidents / Cases</h2>
            <p className="text-sm text-cad-muted mt-2 max-w-3xl">
              Link calls, records, arrest reports, warrants, POIs and evidence into a single incident/case for cross-department coordination.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-cad-muted">Status</label>
            <select
              value={listStatus}
              onChange={(e) => setListStatus(e.target.value)}
              className="bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm"
            >
              <option value="open">Open</option>
              <option value="all">All</option>
              <option value="review">Supervisor Review</option>
              <option value="monitoring">Monitoring</option>
              <option value="closed">Closed</option>
            </select>
            <button
              type="button"
              onClick={() => {
                fetchIncidents();
                if (selectedIncidentId) fetchIncidentById(selectedIncidentId);
                fetchRelatedEntityLinks();
              }}
              className="px-3 py-2 text-sm bg-cad-surface border border-cad-border rounded hover:bg-cad-card"
            >
              Refresh
            </button>
          </div>
        </div>

        {prefilledEntity ? (
          <div className="mt-4 rounded-xl border border-cad-accent/30 bg-cad-accent/5 p-3">
            <p className="text-xs uppercase tracking-wider text-cad-muted">Entity Context</p>
            <p className="text-sm mt-1">
              Linking from <span className="font-medium">{formatEntityTypeLabel(prefilledEntity.entity_type)}</span>{' '}
              <span className="font-mono">#{prefilledEntity.entity_id}</span>
            </p>
            {relatedEntityLinks.length > 0 && (
              <div className="mt-2 text-xs text-cad-muted">
                Already linked to: {relatedEntityLinks.map((link) => link.incident_number || `INC #${link.incident_id}`).join(', ')}
              </div>
            )}
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-lg border border-red-700/50 bg-red-950/30 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.05fr_1fr] gap-6 items-start">
        <div className="space-y-6">
          <div className="bg-cad-card border border-cad-border rounded-xl p-5">
            <h3 className="text-sm font-semibold mb-3">Create Incident / Case</h3>
            <form onSubmit={createIncident} className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-xs text-cad-muted mb-1">Title *</label>
                  <input
                    type="text"
                    value={createForm.title}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, title: e.target.value }))}
                    className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm"
                    placeholder="Alarm activation at Airport Terminal 1"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-cad-muted mb-1">Location</label>
                  <input
                    type="text"
                    value={createForm.location}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, location: e.target.value }))}
                    className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm"
                    placeholder="Melbourne-style wording / GTA location text"
                  />
                </div>
                <div>
                  <label className="block text-xs text-cad-muted mb-1">Priority</label>
                  <select
                    value={createForm.priority}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, priority: e.target.value }))}
                    className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm"
                  >
                    <option value="1">P1</option>
                    <option value="2">P2</option>
                    <option value="3">P3</option>
                    <option value="4">P4</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs text-cad-muted mb-1">Brief / Summary</label>
                  <textarea
                    rows={3}
                    value={createForm.summary}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, summary: e.target.value }))}
                    className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm"
                    placeholder="Operational summary, tasking notes, or investigation brief."
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-cad-muted">
                  Creates a department-owned incident/case and optionally links the current entity context if opened from another workflow.
                </p>
                <button
                  type="submit"
                  disabled={savingIncident || !departmentId}
                  className="px-4 py-2 bg-cad-accent hover:bg-cad-accent-light text-white rounded text-sm font-medium disabled:opacity-50"
                >
                  {savingIncident ? 'Creating...' : 'Create Incident'}
                </button>
              </div>
            </form>
          </div>

          <div className="bg-cad-card border border-cad-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-cad-border flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Incidents / Cases ({incidents.length})</h3>
              {loadingList ? <span className="text-xs text-cad-muted">Loading...</span> : null}
            </div>
            {incidents.length === 0 ? (
              <div className="px-4 py-6 text-sm text-cad-muted">No incidents found for the current filter.</div>
            ) : (
              <div className="divide-y divide-cad-border/60">
                {incidents.map((incident) => {
                  const isSelected = Number(selectedIncidentId) === Number(incident.id);
                  return (
                    <button
                      key={incident.id}
                      type="button"
                      onClick={() => {
                        setSelectedIncidentId(Number(incident.id));
                        const params = new URLSearchParams(searchParams);
                        params.set('incident_id', String(incident.id));
                        setSearchParams(params, { replace: true });
                      }}
                      className={`w-full text-left px-4 py-3 transition-colors ${isSelected ? 'bg-cad-surface' : 'hover:bg-cad-surface/60'}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-mono text-cad-muted">{incident.incident_number || `INC-${incident.id}`}</span>
                            <span className={`text-[11px] px-2 py-0.5 rounded border border-cad-border ${String(incident.status || '') === 'closed' ? 'text-cad-muted' : 'text-cad-ink'}`}>
                              {formatStatusLabel(incident.status)}
                            </span>
                            <span className="text-[11px] px-2 py-0.5 rounded border border-cad-border text-cad-muted">P{incident.priority || '2'}</span>
                          </div>
                          <div className="font-medium mt-1 truncate">{incident.title}</div>
                          <div className="text-xs text-cad-muted mt-1">
                            {[incident.location, `${Number(incident.link_count || 0)} linked item(s)`].filter(Boolean).join(' | ')}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-cad-card border border-cad-border rounded-xl p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Selected Incident / Case</h3>
                <p className="text-xs text-cad-muted mt-1">
                  Manage incident status and link operational entities.
                </p>
              </div>
              {loadingIncident ? <span className="text-xs text-cad-muted">Loading...</span> : null}
            </div>

            {!selectedIncident ? (
              <p className="text-sm text-cad-muted mt-4">Select an incident from the list to manage links.</p>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="rounded-lg border border-cad-border bg-cad-surface/60 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-mono text-cad-muted">{selectedIncident.incident_number || `INC-${selectedIncident.id}`}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded border border-cad-border">{formatStatusLabel(selectedIncident.status)}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded border border-cad-border">P{selectedIncident.priority || '2'}</span>
                  </div>
                  <h4 className="font-semibold mt-2">{selectedIncident.title}</h4>
                  {selectedIncident.location ? (
                    <p className="text-xs text-cad-muted mt-1">Location: {selectedIncident.location}</p>
                  ) : null}
                  {selectedIncident.summary ? (
                    <p className="text-sm text-cad-muted mt-2 whitespace-pre-wrap">{selectedIncident.summary}</p>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  {STATUS_OPTIONS.map((status) => (
                    <button
                      key={status.value}
                      type="button"
                      disabled={savingIncident || selectedIncident.status === status.value}
                      onClick={() => updateIncidentStatus(status.value)}
                      className={`px-3 py-1.5 text-xs rounded border transition-colors disabled:opacity-50 ${
                        selectedIncident.status === status.value
                          ? 'bg-cad-accent/15 border-cad-accent/40 text-cad-accent-light'
                          : 'bg-cad-surface border-cad-border text-cad-muted hover:text-cad-ink hover:bg-cad-card'
                      }`}
                    >
                      {status.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={deletingIncident}
                    onClick={deleteIncident}
                    className="ml-auto px-3 py-1.5 text-xs rounded border border-red-700/50 bg-red-950/20 text-red-300 hover:bg-red-950/40 disabled:opacity-50"
                  >
                    {deletingIncident ? 'Deleting...' : 'Delete Incident'}
                  </button>
                </div>

                <form onSubmit={linkEntityToIncident} className="space-y-3 pt-2 border-t border-cad-border">
                  <h4 className="text-sm font-semibold">Link Item to Incident</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-cad-muted mb-1">Item Type</label>
                      <select
                        value={linkForm.entity_type}
                        onChange={(e) => setLinkForm((prev) => ({ ...prev, entity_type: e.target.value }))}
                        className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm"
                      >
                        {ENTITY_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-cad-muted mb-1">Item ID</label>
                      <input
                        type="number"
                        min="1"
                        value={linkForm.entity_id}
                        onChange={(e) => setLinkForm((prev) => ({ ...prev, entity_id: e.target.value }))}
                        className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm font-mono"
                        placeholder="e.g. 42"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs text-cad-muted mb-1">Tasking / Link Note (optional)</label>
                      <input
                        type="text"
                        value={linkForm.note}
                        onChange={(e) => setLinkForm((prev) => ({ ...prev, note: e.target.value }))}
                        className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm"
                        placeholder="Why this item is linked to the case (optional)"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={linkingItem}
                      className="px-4 py-2 bg-cad-accent hover:bg-cad-accent-light text-white rounded text-sm font-medium disabled:opacity-50"
                    >
                      {linkingItem ? 'Linking...' : 'Link Item'}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>

          <div className="bg-cad-card border border-cad-border rounded-xl p-5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Linked Items</h3>
              <span className="text-xs text-cad-muted">
                {Array.isArray(selectedIncident?.links) ? selectedIncident.links.length : 0}
              </span>
            </div>
            {!selectedIncident?.links?.length ? (
              <p className="text-sm text-cad-muted mt-3">No linked calls/records/warrants/POIs/evidence yet.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {selectedIncident.links.map((link) => (
                  <div key={link.id} className="rounded-lg border border-cad-border bg-cad-surface/60 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] px-2 py-0.5 rounded border border-cad-border text-cad-muted">
                            {formatEntityTypeLabel(link.entity_type)}
                          </span>
                          <span className="text-xs font-mono text-cad-muted">#{link.entity_id}</span>
                        </div>
                        <div className="font-medium mt-1">{link.entity_title || `${formatEntityTypeLabel(link.entity_type)} #${link.entity_id}`}</div>
                        {link.entity_subtitle ? (
                          <div className="text-xs text-cad-muted mt-1">{link.entity_subtitle}</div>
                        ) : null}
                        {link.note ? (
                          <div className="text-xs text-cad-muted mt-2 italic">{link.note}</div>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => unlinkFromIncident(link.id)}
                        disabled={unlinkingLinkId === Number(link.id)}
                        className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                      >
                        {unlinkingLinkId === Number(link.id) ? 'Removing...' : 'Remove'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

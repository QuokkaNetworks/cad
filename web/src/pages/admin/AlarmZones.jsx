import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../../api/client';
import AdminPageHeader from '../../components/AdminPageHeader';

const EMPTY_FORM = {
  id: '',
  label: '',
  location: '',
  shape: 'circle',
  x: '',
  y: '',
  z: '',
  radius: '',
  pointsText: '[\n  {\n    "x": 0,\n    "y": 0,\n    "z": 0\n  }\n]',
  min_z: '',
  max_z: '',
  postal: '',
  department_id: '',
  backup_department_id: '',
  priority: '2',
  job_code: 'ALARM',
  cooldown_ms: '',
  per_player_cooldown_ms: '',
  description: '',
  title: '',
  message: '',
};

function formatErr(err) {
  return err?.message || 'Request failed';
}

function prettyPoints(points) {
  if (!Array.isArray(points) || points.length === 0) {
    return EMPTY_FORM.pointsText;
  }
  return JSON.stringify(points, null, 2);
}

function parsePointsText(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('Polygon points must be a JSON array');
  return parsed;
}

function toInputValue(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function zoneToForm(zone) {
  const z = zone || {};
  return {
    id: String(z.id || ''),
    label: String(z.label || ''),
    location: String(z.location || ''),
    shape: String(z.shape || 'circle') === 'polygon' ? 'polygon' : 'circle',
    x: toInputValue(z.x),
    y: toInputValue(z.y),
    z: toInputValue(z.z),
    radius: toInputValue(z.radius),
    pointsText: prettyPoints(z.points),
    min_z: toInputValue(z.min_z),
    max_z: toInputValue(z.max_z),
    postal: String(z.postal || ''),
    department_id: toInputValue(z.department_id),
    backup_department_id: toInputValue(z.backup_department_id),
    priority: String(z.priority || '2'),
    job_code: String(z.job_code || 'ALARM'),
    cooldown_ms: toInputValue(z.cooldown_ms),
    per_player_cooldown_ms: toInputValue(z.per_player_cooldown_ms),
    description: String(z.description || ''),
    title: String(z.title || ''),
    message: String(z.message || ''),
  };
}

function buildPayload(form) {
  const payload = {
    id: String(form.id || '').trim(),
    label: String(form.label || '').trim(),
    location: String(form.location || '').trim(),
    shape: String(form.shape || 'circle').trim() === 'polygon' ? 'polygon' : 'circle',
    postal: String(form.postal || '').trim(),
    department_id: String(form.department_id || '').trim() ? Number(String(form.department_id).trim()) : null,
    backup_department_id: String(form.backup_department_id || '').trim() ? Number(String(form.backup_department_id).trim()) : null,
    priority: String(form.priority || '').trim(),
    job_code: String(form.job_code || '').trim(),
    description: String(form.description || '').trim(),
    title: String(form.title || '').trim(),
    message: String(form.message || '').trim(),
  };

  const minZ = String(form.min_z || '').trim();
  const maxZ = String(form.max_z || '').trim();
  const cooldown = String(form.cooldown_ms || '').trim();
  const perPlayerCooldown = String(form.per_player_cooldown_ms || '').trim();
  if (minZ) payload.min_z = Number(minZ);
  if (maxZ) payload.max_z = Number(maxZ);
  if (cooldown) payload.cooldown_ms = Number(cooldown);
  if (perPlayerCooldown) payload.per_player_cooldown_ms = Number(perPlayerCooldown);

  if (payload.shape === 'polygon') {
    payload.points = parsePointsText(form.pointsText);
    const x = String(form.x || '').trim();
    const y = String(form.y || '').trim();
    const z = String(form.z || '').trim();
    if (x) payload.x = Number(x);
    if (y) payload.y = Number(y);
    if (z) payload.z = Number(z);
  } else {
    payload.x = Number(String(form.x || '').trim());
    payload.y = Number(String(form.y || '').trim());
    payload.z = Number(String(form.z || '').trim() || '0');
    payload.radius = Number(String(form.radius || '').trim());
  }

  return payload;
}

function ZoneSummary({ zone, departmentLookup }) {
  const pointCount = Array.isArray(zone?.points) ? zone.points.length : 0;
  const isPoly = String(zone?.shape || '').toLowerCase() === 'polygon';
  const primaryDeptId = Number(zone?.department_id || 0);
  const backupDeptId = Number(zone?.backup_department_id || 0);
  const primaryDept = primaryDeptId ? departmentLookup.get(primaryDeptId) : null;
  const backupDept = backupDeptId ? departmentLookup.get(backupDeptId) : null;
  return (
    <div className="text-xs text-cad-muted space-y-1">
      <div>
        {isPoly ? `Polygon (${pointCount} points)` : `Circle r=${Number(zone?.radius || 0).toFixed(1)}`}
        {zone?.postal ? ` | Postal ${zone.postal}` : ''}
        {zone?.priority ? ` | P${zone.priority}` : ''}
        {zone?.job_code ? ` | ${zone.job_code}` : ''}
      </div>
      {(primaryDeptId || backupDeptId) ? (
        <div>
          Dept: {primaryDept ? `${primaryDept.name}${primaryDept.short_name ? ` (${primaryDept.short_name})` : ''}` : (primaryDeptId ? `#${primaryDeptId}` : 'Auto')}
          {backupDeptId ? ` | Backup: ${backupDept ? `${backupDept.name}${backupDept.short_name ? ` (${backupDept.short_name})` : ''}` : `#${backupDeptId}`}` : ''}
        </div>
      ) : null}
      <div className="font-mono">
        {isPoly
          ? `points[0]=${pointCount > 0 ? `${Number(zone.points[0]?.x || 0).toFixed(1)}, ${Number(zone.points[0]?.y || 0).toFixed(1)}` : 'n/a'}`
          : `x=${Number(zone?.x || 0).toFixed(1)} y=${Number(zone?.y || 0).toFixed(1)} z=${Number(zone?.z || 0).toFixed(1)}`}
      </div>
    </div>
  );
}

export default function AdminAlarmZones() {
  const { key: locationKey } = useLocation();
  const [zones, setZones] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [editingId, setEditingId] = useState('');
  const [hasOverride, setHasOverride] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);

  const sortedZones = useMemo(() => {
    return [...zones].sort((a, b) => String(a.label || a.id || '').localeCompare(String(b.label || b.id || '')));
  }, [zones]);

  const departmentOptions = useMemo(() => (
    departments
      .filter((dept) => !!dept && dept.is_active && !dept.is_dispatch)
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
  ), [departments]);

  const departmentLookup = useMemo(() => {
    const map = new Map();
    for (const dept of departments) {
      if (!dept?.id) continue;
      map.set(Number(dept.id), dept);
    }
    return map;
  }, [departments]);

  async function fetchZones() {
    setLoading(true);
    setError('');
    try {
      const [zoneResult, deptResult] = await Promise.all([
        api.get('/api/admin/alarm-zones'),
        api.get('/api/admin/departments'),
      ]);
      setZones(Array.isArray(zoneResult?.zones) ? zoneResult.zones : []);
      setHasOverride(zoneResult?.has_override === true);
      setDepartments(Array.isArray(deptResult) ? deptResult : []);
    } catch (err) {
      setError(formatErr(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchZones();
  }, [locationKey]);

  function updateForm(key, value) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function resetForm() {
    setEditingId('');
    setForm(EMPTY_FORM);
    setError('');
  }

  function startEdit(zone) {
    setEditingId(String(zone?.id || ''));
    setForm(zoneToForm(zone));
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function saveZone(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = buildPayload(form);
      if (editingId) {
        const saved = await api.patch(`/api/admin/alarm-zones/${encodeURIComponent(editingId)}`, payload);
        setZones(prev => prev.map(z => (String(z.id) === String(editingId) ? saved : z)));
        setEditingId(String(saved.id || ''));
        setForm(zoneToForm(saved));
      } else {
        const created = await api.post('/api/admin/alarm-zones', payload);
        setZones(prev => [...prev, created]);
        setHasOverride(true);
        resetForm();
      }
    } catch (err) {
      setError(formatErr(err));
    } finally {
      setSaving(false);
    }
  }

  async function deleteZone(id) {
    if (!window.confirm('Delete this alarm zone?')) return;
    setDeletingId(String(id));
    setError('');
    try {
      await api.delete(`/api/admin/alarm-zones/${encodeURIComponent(id)}`);
      setZones(prev => prev.filter(z => String(z.id) !== String(id)));
      if (String(editingId) === String(id)) resetForm();
      setHasOverride(true);
    } catch (err) {
      setError(formatErr(err));
    } finally {
      setDeletingId('');
    }
  }

  async function importBuilderJson() {
    const raw = window.prompt('Paste a zone JSON object (e.g. from /cadalarmzone exportpoly/exportcircle):');
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      setForm(zoneToForm(parsed));
      setEditingId('');
      setError('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(`Invalid JSON: ${err.message || err}`);
    }
  }

  return (
    <div className="max-w-6xl space-y-6">
      <AdminPageHeader
        title="Alarm Zones"
        subtitle="Create named police alarm trigger zones (circle or polygon). Changes are polled live by cad_bridge without editing config.lua."
        links={[
          { to: '/admin/departments', label: 'Departments' },
          { to: '/admin/settings', label: 'System Settings' },
          { to: '/admin/audit-log', label: 'Audit Log' },
        ]}
      />

      <div className="bg-cad-card border border-cad-border rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">Live Alarm Zone Manager</h3>
            <p className="text-sm text-cad-muted mt-1">
              Use names like <span className="font-medium text-cad-ink">Airport Alarm Zone</span> or{' '}
              <span className="font-medium text-cad-ink">Vinewood Sign Alarm Zone</span> so the call title/location reads clearly in dispatch.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={importBuilderJson}
              className="px-3 py-2 text-sm rounded border border-cad-border bg-cad-surface hover:bg-cad-card"
            >
              Paste Builder JSON
            </button>
            <button
              type="button"
              onClick={fetchZones}
              disabled={loading}
              className="px-3 py-2 text-sm rounded border border-cad-border bg-cad-surface hover:bg-cad-card disabled:opacity-60"
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        <div className="text-xs text-cad-muted space-y-1">
          <div>In-game builder helper: <span className="font-mono">/cadalarmzone start</span>, <span className="font-mono">add</span>, <span className="font-mono">exportpoly &lt;id&gt; [label]</span></div>
          <div>Override source: {hasOverride ? 'CAD Admin (active)' : 'No admin override saved yet (resource config.lua fallback still applies)'}</div>
        </div>

        {error ? (
          <div className="text-sm text-red-300 bg-red-950/30 border border-red-700 rounded px-3 py-2 whitespace-pre-wrap">
            {error}
          </div>
        ) : null}

        <form onSubmit={saveZone} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-cad-muted mb-1">Zone Name *</label>
              <input
                type="text"
                value={form.label}
                onChange={e => updateForm('label', e.target.value)}
                className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm"
                placeholder="Airport Alarm Zone"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-cad-muted mb-1">Zone ID (optional)</label>
              <input
                type="text"
                value={form.id}
                onChange={e => updateForm('id', e.target.value)}
                className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm font-mono"
                placeholder="airport_alarm"
              />
            </div>
            <div>
              <label className="block text-xs text-cad-muted mb-1">Shape</label>
              <select
                value={form.shape}
                onChange={e => updateForm('shape', e.target.value)}
                className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm"
              >
                <option value="circle">Circle (radius)</option>
                <option value="polygon">Polygon (drawn area)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs text-cad-muted mb-1">CAD Location Text</label>
              <input
                type="text"
                value={form.location}
                onChange={e => updateForm('location', e.target.value)}
                className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm"
                placeholder="Vinewood Sign"
              />
            </div>
            <div>
              <label className="block text-xs text-cad-muted mb-1">Postal (optional)</label>
              <input
                type="text"
                value={form.postal}
                onChange={e => updateForm('postal', e.target.value)}
                className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm"
                placeholder="123"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-cad-muted mb-1">Primary Department (optional)</label>
              <select
                value={form.department_id}
                onChange={e => updateForm('department_id', e.target.value)}
                className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm"
              >
                <option value="">Auto (use layout/default routing)</option>
                {departmentOptions.map((dept) => (
                  <option key={dept.id} value={String(dept.id)}>
                    {dept.name}{dept.short_name ? ` (${dept.short_name})` : ''}
                  </option>
                ))}
              </select>
              <p className="text-xs text-cad-muted mt-1">
                If set, this zone routes alarms to this department first.
              </p>
            </div>
            <div>
              <label className="block text-xs text-cad-muted mb-1">Backup Department (optional)</label>
              <select
                value={form.backup_department_id}
                onChange={e => updateForm('backup_department_id', e.target.value)}
                className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm"
              >
                <option value="">None</option>
                {departmentOptions
                  .filter((dept) => String(dept.id) !== String(form.department_id || ''))
                  .map((dept) => (
                    <option key={dept.id} value={String(dept.id)}>
                      {dept.name}{dept.short_name ? ` (${dept.short_name})` : ''}
                    </option>
                  ))}
              </select>
              <p className="text-xs text-cad-muted mt-1">
                Used automatically when the primary department has no on-duty units online.
              </p>
            </div>
          </div>

          {form.shape === 'circle' ? (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs text-cad-muted mb-1">X *</label>
                <input type="number" step="0.001" value={form.x} onChange={e => updateForm('x', e.target.value)} className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm font-mono" required />
              </div>
              <div>
                <label className="block text-xs text-cad-muted mb-1">Y *</label>
                <input type="number" step="0.001" value={form.y} onChange={e => updateForm('y', e.target.value)} className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm font-mono" required />
              </div>
              <div>
                <label className="block text-xs text-cad-muted mb-1">Z</label>
                <input type="number" step="0.001" value={form.z} onChange={e => updateForm('z', e.target.value)} className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm font-mono" />
              </div>
              <div>
                <label className="block text-xs text-cad-muted mb-1">Radius *</label>
                <input type="number" step="0.1" min="0.1" value={form.radius} onChange={e => updateForm('radius', e.target.value)} className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm font-mono" required />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs text-cad-muted mb-1">Polygon Points JSON *</label>
              <textarea
                value={form.pointsText}
                onChange={e => updateForm('pointsText', e.target.value)}
                className="w-full min-h-[180px] bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm font-mono"
                placeholder='[{"x": 0, "y": 0, "z": 0}, {"x": 1, "y": 1, "z": 0}, {"x": 2, "y": 0, "z": 0}]'
              />
              <p className="text-xs text-cad-muted mt-1">
                Paste points from <span className="font-mono">/cadalarmzone exportpoly ...</span> or enter a manual points array.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-cad-muted mb-1">Min Z (optional)</label>
              <input type="number" step="0.001" value={form.min_z} onChange={e => updateForm('min_z', e.target.value)} className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm font-mono" />
            </div>
            <div>
              <label className="block text-xs text-cad-muted mb-1">Max Z (optional)</label>
              <input type="number" step="0.001" value={form.max_z} onChange={e => updateForm('max_z', e.target.value)} className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm font-mono" />
            </div>
            <div>
              <label className="block text-xs text-cad-muted mb-1">Priority</label>
              <input type="text" value={form.priority} onChange={e => updateForm('priority', e.target.value)} className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm" placeholder="1-4" />
            </div>
            <div>
              <label className="block text-xs text-cad-muted mb-1">Job Code</label>
              <input type="text" value={form.job_code} onChange={e => updateForm('job_code', e.target.value)} className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm font-mono" placeholder="ALARM" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-cad-muted mb-1">Zone Cooldown ms (optional)</label>
              <input type="number" min="0" step="1000" value={form.cooldown_ms} onChange={e => updateForm('cooldown_ms', e.target.value)} className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm font-mono" placeholder="180000" />
            </div>
            <div>
              <label className="block text-xs text-cad-muted mb-1">Per-Player Cooldown ms (optional)</label>
              <input type="number" min="0" step="1000" value={form.per_player_cooldown_ms} onChange={e => updateForm('per_player_cooldown_ms', e.target.value)} className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm font-mono" placeholder="60000" />
            </div>
          </div>

          <details className="bg-cad-surface border border-cad-border rounded p-3">
            <summary className="cursor-pointer text-sm font-medium">Advanced Call Text (optional)</summary>
            <div className="mt-3 space-y-3">
              <div>
                <label className="block text-xs text-cad-muted mb-1">Call Title Override</label>
                <input type="text" value={form.title} onChange={e => updateForm('title', e.target.value)} className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm" placeholder="Automatic alarm triggered at Airport Alarm Zone" />
              </div>
              <div>
                <label className="block text-xs text-cad-muted mb-1">Call Message / Description</label>
                <textarea value={form.message} onChange={e => updateForm('message', e.target.value)} className="w-full min-h-[90px] bg-cad-card border border-cad-border rounded px-3 py-2 text-sm" placeholder="Automatic alarm triggered..." />
              </div>
              <div>
                <label className="block text-xs text-cad-muted mb-1">Internal Description</label>
                <textarea value={form.description} onChange={e => updateForm('description', e.target.value)} className="w-full min-h-[70px] bg-cad-card border border-cad-border rounded px-3 py-2 text-sm" placeholder="Optional admin notes about this zone." />
              </div>
            </div>
          </details>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded bg-cad-accent text-white hover:opacity-90 disabled:opacity-60"
            >
              {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Alarm Zone'}
            </button>
            {editingId ? (
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 rounded border border-cad-border bg-cad-surface hover:bg-cad-card"
              >
                Cancel Edit
              </button>
            ) : null}
          </div>
        </form>
      </div>

      <div className="bg-cad-card border border-cad-border rounded-xl p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h3 className="font-semibold">Saved Alarm Zones ({sortedZones.length})</h3>
          <div className="text-xs text-cad-muted">Changes sync to `cad_bridge` via periodic polling.</div>
        </div>

        {sortedZones.length === 0 ? (
          <div className="text-sm text-cad-muted border border-dashed border-cad-border rounded p-4">
            No admin alarm zones saved yet. Resource config zones will continue to work until you save an admin override.
          </div>
        ) : (
          <div className="space-y-3">
            {sortedZones.map(zone => (
              <div key={zone.id} className="border border-cad-border rounded-lg p-4 bg-cad-surface">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-semibold">{zone.label || zone.id}</h4>
                      <span className="text-[11px] uppercase tracking-wide px-2 py-0.5 rounded border border-cad-border text-cad-muted">
                        {zone.shape === 'polygon' ? 'Polygon' : 'Circle'}
                      </span>
                      <span className="text-[11px] font-mono text-cad-muted">{zone.id}</span>
                    </div>
                    <div className="text-sm text-cad-muted mt-1">{zone.location || zone.label || zone.id}</div>
                    <div className="mt-2">
                      <ZoneSummary zone={zone} departmentLookup={departmentLookup} />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(zone)}
                      className="px-3 py-1.5 rounded border border-cad-border bg-cad-card hover:bg-cad-surface text-sm"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteZone(zone.id)}
                      disabled={deletingId === String(zone.id)}
                      className="px-3 py-1.5 rounded border border-red-700 bg-red-950/30 hover:bg-red-950/50 text-sm text-red-200 disabled:opacity-60"
                    >
                      {deletingId === String(zone.id) ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

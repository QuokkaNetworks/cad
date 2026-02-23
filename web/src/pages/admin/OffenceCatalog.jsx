import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../../api/client';
import Modal from '../../components/Modal';
import AdminPageHeader from '../../components/AdminPageHeader';
import {
  OFFENCE_CATEGORY,
  OFFENCE_CATEGORY_LABEL,
  OFFENCE_CATEGORY_ORDER,
  normalizeOffenceCategory,
} from '../../utils/offenceCatalog';

const EMPTY_FORM = {
  category: OFFENCE_CATEGORY.INFRINGEMENT,
  code: '',
  title: '',
  description: '',
  fine_amount: 0,
  jail_minutes: 0,
  sort_order: 0,
  is_active: 1,
};

function fmtMoney(amount) {
  const numeric = Number(amount || 0);
  return `$${numeric.toLocaleString()}`;
}

function sortOffences(list) {
  const order = new Map(OFFENCE_CATEGORY_ORDER.map((key, idx) => [key, idx]));
  return [...(list || [])].sort((a, b) => {
    const categoryDiff = (order.get(normalizeOffenceCategory(a.category)) || 99) - (order.get(normalizeOffenceCategory(b.category)) || 99);
    if (categoryDiff !== 0) return categoryDiff;
    const sortDiff = Number(a.sort_order || 0) - Number(b.sort_order || 0);
    if (sortDiff !== 0) return sortDiff;
    return String(a.title || '').localeCompare(String(b.title || ''));
  });
}

function downloadFile(fileName, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildJsonTemplate() {
  return {
    notes: [
      'Fill the offences array with one object per charge.',
      'Allowed categories: infringement, summary, indictment.',
      'is_active can be 1/0 or true/false.',
    ],
    offences: [],
    template_row: {
      category: OFFENCE_CATEGORY.INFRINGEMENT,
      code: 'INF-001',
      title: 'Example offence title',
      description: 'Optional offence description',
      fine_amount: 250,
      jail_minutes: 0,
      sort_order: 0,
      is_active: 1,
    },
  };
}

function buildCsvTemplate() {
  return 'category,code,title,description,fine_amount,jail_minutes,sort_order,is_active\n';
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ',') {
      row.push(current);
      current = '';
      continue;
    }
    if (char === '\n') {
      row.push(current);
      rows.push(row);
      row = [];
      current = '';
      continue;
    }
    if (char === '\r') {
      continue;
    }
    current += char;
  }

  row.push(current);
  if (row.length > 1 || String(row[0] || '').trim()) {
    rows.push(row);
  }
  return rows;
}

function parseCsvOffences(text) {
  const rows = parseCsvRows(text);
  if (!rows.length) return [];

  const headers = rows[0].map((h, idx) => {
    const raw = String(h || '').trim().toLowerCase();
    return idx === 0 ? raw.replace(/^\ufeff/, '') : raw;
  });
  const entries = [];
  for (let i = 1; i < rows.length; i += 1) {
    const raw = rows[i] || [];
    const isBlank = raw.every(cell => !String(cell || '').trim());
    if (isBlank) continue;

    const row = {};
    headers.forEach((header, idx) => {
      if (!header) return;
      row[header] = String(raw[idx] || '').trim();
    });
    entries.push(row);
  }
  return entries;
}

export default function AdminOffenceCatalog() {
  const { key: locationKey } = useLocation();
  const [offences, setOffences] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editForm, setEditForm] = useState({ id: null, ...EMPTY_FORM });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const jsonImportRef = useRef(null);
  const csvImportRef = useRef(null);

  const grouped = useMemo(() => {
    const out = {};
    for (const key of OFFENCE_CATEGORY_ORDER) out[key] = [];
    for (const offence of sortOffences(offences)) {
      const key = normalizeOffenceCategory(offence.category);
      if (!out[key]) out[key] = [];
      out[key].push(offence);
    }
    return out;
  }, [offences]);

  async function fetchOffences() {
    setLoading(true);
    try {
      const data = await api.get('/api/admin/offence-catalog?include_inactive=true');
      setOffences(sortOffences(Array.isArray(data) ? data : []));
    } catch (err) {
      alert('Failed to load offence catalog: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchOffences(); }, [locationKey]);

  async function createOffence(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/api/admin/offence-catalog', {
        category: normalizeOffenceCategory(form.category),
        code: String(form.code || '').trim(),
        title: String(form.title || '').trim(),
        description: String(form.description || '').trim(),
        fine_amount: Number(form.fine_amount || 0),
        jail_minutes: Math.max(0, Math.trunc(Number(form.jail_minutes || 0))),
        sort_order: Number(form.sort_order || 0),
        is_active: form.is_active ? 1 : 0,
      });
      setShowNew(false);
      setForm(EMPTY_FORM);
      fetchOffences();
    } catch (err) {
      alert('Failed to create offence: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  function openEdit(offence) {
    setEditForm({
      id: offence.id,
      category: normalizeOffenceCategory(offence.category),
      code: offence.code || '',
      title: offence.title || '',
      description: offence.description || '',
      fine_amount: Number(offence.fine_amount || 0),
      jail_minutes: Number(offence.jail_minutes || 0),
      sort_order: Number(offence.sort_order || 0),
      is_active: offence.is_active ? 1 : 0,
    });
    setShowEdit(true);
  }

  async function saveEdit(e) {
    e.preventDefault();
    if (!editForm.id) return;
    setSaving(true);
    try {
      await api.patch(`/api/admin/offence-catalog/${editForm.id}`, {
        category: normalizeOffenceCategory(editForm.category),
        code: String(editForm.code || '').trim(),
        title: String(editForm.title || '').trim(),
        description: String(editForm.description || '').trim(),
        fine_amount: Number(editForm.fine_amount || 0),
        jail_minutes: Math.max(0, Math.trunc(Number(editForm.jail_minutes || 0))),
        sort_order: Number(editForm.sort_order || 0),
        is_active: editForm.is_active ? 1 : 0,
      });
      setShowEdit(false);
      fetchOffences();
    } catch (err) {
      alert('Failed to save offence: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteOffence(offence) {
    const ok = confirm(`Delete "${offence.title}"?`);
    if (!ok) return;
    try {
      await api.delete(`/api/admin/offence-catalog/${offence.id}`);
      fetchOffences();
    } catch (err) {
      alert('Failed to delete offence: ' + err.message);
    }
  }

  async function importOffences(rows, sourceLabel = 'file') {
    if (!Array.isArray(rows) || rows.length === 0) {
      alert(`No offences found in ${sourceLabel}.`);
      return;
    }

    setSaving(true);
    try {
      const result = await api.post('/api/admin/offence-catalog/import', { offences: rows });
      await fetchOffences();
      if (result.failed > 0) {
        const firstErrors = (result.errors || [])
          .slice(0, 8)
          .map(e => `Row ${e.index}: ${e.error}`)
          .join('\n');
        alert(`Imported ${result.imported}/${result.total} offences.\n${result.failed} failed.\n\n${firstErrors}`);
      } else {
        alert(`Imported ${result.imported} offences successfully.`);
      }
    } catch (err) {
      alert('Failed to import offences: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleJsonImportFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const rows = Array.isArray(parsed)
        ? parsed
        : (Array.isArray(parsed?.offences) ? parsed.offences : []);
      await importOffences(rows, file.name);
    } catch (err) {
      alert('Failed to parse JSON file: ' + err.message);
    }
  }

  async function handleCsvImportFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const rows = parseCsvOffences(text);
      await importOffences(rows, file.name);
    } catch (err) {
      alert('Failed to parse CSV file: ' + err.message);
    }
  }

  function downloadJsonTemplate() {
    const template = buildJsonTemplate();
    downloadFile('offence-catalog-template.json', JSON.stringify(template, null, 2), 'application/json');
  }

  function downloadCsvTemplate() {
    downloadFile('offence-catalog-template.csv', buildCsvTemplate(), 'text/csv;charset=utf-8');
  }

  async function clearCatalog() {
    if (offences.length === 0) {
      alert('Catalog is already empty.');
      return;
    }

    const ok = confirm(`Clear all ${offences.length} offences from the catalog? This cannot be undone.`);
    if (!ok) return;

    setSaving(true);
    try {
      const result = await api.delete('/api/admin/offence-catalog');
      await fetchOffences();
      alert(`Cleared ${Number(result.cleared || 0)} offences.`);
    } catch (err) {
      alert('Failed to clear offence catalog: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-7xl space-y-6">
      <AdminPageHeader
        title="Offence Catalog"
        subtitle="Create preset Victorian-style offence entries for Infringements, Summary, and Indictments."
        links={[
          { to: '/admin/departments', label: 'Departments' },
          { to: '/admin/settings', label: 'System Settings' },
          { to: '/admin/audit-log', label: 'Audit Log' },
        ]}
      />

      <div className="bg-cad-card border border-cad-border rounded-xl p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowNew(true)}
              className="px-4 py-2 bg-cad-accent hover:bg-cad-accent-light text-white rounded-lg text-sm font-medium transition-colors"
            >
              + New Offence
            </button>
            <button
              onClick={downloadJsonTemplate}
              className="px-3 py-2 bg-cad-surface border border-cad-border rounded-lg text-sm text-cad-muted hover:text-cad-ink hover:bg-cad-card transition-colors"
            >
              Download JSON Template
            </button>
            <button
              onClick={downloadCsvTemplate}
              className="px-3 py-2 bg-cad-surface border border-cad-border rounded-lg text-sm text-cad-muted hover:text-cad-ink hover:bg-cad-card transition-colors"
            >
              Download CSV Template
            </button>
            <button
              disabled={saving}
              onClick={() => jsonImportRef.current?.click()}
              className="px-3 py-2 bg-cad-surface border border-cad-border rounded-lg text-sm text-cad-muted hover:text-cad-ink hover:bg-cad-card transition-colors disabled:opacity-50"
            >
              Import JSON
            </button>
            <button
              disabled={saving}
              onClick={() => csvImportRef.current?.click()}
              className="px-3 py-2 bg-cad-surface border border-cad-border rounded-lg text-sm text-cad-muted hover:text-cad-ink hover:bg-cad-card transition-colors disabled:opacity-50"
            >
              Import CSV
            </button>
            <button
              disabled={saving || offences.length === 0}
              onClick={clearCatalog}
              className="px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-300 hover:bg-red-500/20 transition-colors disabled:opacity-50"
            >
              Clear Catalog
            </button>
          </div>
          <p className="text-xs text-cad-muted mt-2">
            Import columns: <span className="font-mono">category, code, title, description, fine_amount, jail_minutes, sort_order, is_active</span>
          </p>
        </div>
        <input
          ref={jsonImportRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleJsonImportFile}
        />
        <input
          ref={csvImportRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={handleCsvImportFile}
        />
      </div>
      </div>

      {loading ? (
        <p className="text-sm text-cad-muted">Loading offences...</p>
      ) : (
        <div className="space-y-6">
          {OFFENCE_CATEGORY_ORDER.map(category => (
            <div key={category}>
              <h3 className="text-sm font-semibold text-cad-muted uppercase tracking-wider mb-3">
                {OFFENCE_CATEGORY_LABEL[category]} ({grouped[category]?.length || 0})
              </h3>
              <div className="space-y-2">
                {(grouped[category] || []).map(offence => (
                  <div key={offence.id} className="bg-cad-card border border-cad-border rounded-xl p-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {offence.code && (
                          <span className="text-xs px-2 py-0.5 rounded font-mono bg-cad-surface text-cad-ink border border-cad-border">
                            {offence.code}
                          </span>
                        )}
                        <span className="font-medium">{offence.title}</span>
                        <span className="text-xs text-amber-400">{fmtMoney(offence.fine_amount)}</span>
                        {Number(offence.jail_minutes || 0) > 0 && (
                          <span className="text-xs text-rose-300">{Number(offence.jail_minutes || 0)} min jail</span>
                        )}
                        {!offence.is_active && (
                          <span className="text-xs px-2 py-0.5 rounded bg-gray-500/20 text-gray-300 border border-gray-500/30">
                            Inactive
                          </span>
                        )}
                      </div>
                      {offence.description && (
                        <p className="text-sm text-cad-muted mt-1">{offence.description}</p>
                      )}
                      <p className="text-xs text-cad-muted mt-1">
                        Sort Order: {Number(offence.sort_order || 0)} | ID: {offence.id}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => openEdit(offence)}
                        className="text-xs px-2 py-1 bg-cad-surface text-cad-muted hover:text-cad-ink rounded transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteOffence(offence)}
                        className="text-xs px-2 py-1 bg-red-500/10 text-red-400 border border-red-500/30 rounded hover:bg-red-500/20 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
                {(grouped[category] || []).length === 0 && (
                  <p className="text-sm text-cad-muted">No offences in this category.</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={showNew} onClose={() => setShowNew(false)} title="New Offence">
        <form onSubmit={createOffence} className="space-y-3">
          <OffenceFormFields form={form} setForm={setForm} />
          <div className="flex gap-2 pt-2">
            <button disabled={saving} type="submit" className="flex-1 px-4 py-2 bg-cad-accent hover:bg-cad-accent-light text-white rounded text-sm font-medium transition-colors disabled:opacity-50">
              {saving ? 'Saving...' : 'Create'}
            </button>
            <button type="button" onClick={() => setShowNew(false)} className="px-4 py-2 bg-cad-card hover:bg-cad-border text-cad-muted rounded text-sm transition-colors">
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={showEdit} onClose={() => setShowEdit(false)} title={`Edit Offence #${editForm.id || ''}`}>
        <form onSubmit={saveEdit} className="space-y-3">
          <OffenceFormFields form={editForm} setForm={setEditForm} />
          <div className="flex gap-2 pt-2">
            <button disabled={saving} type="submit" className="flex-1 px-4 py-2 bg-cad-accent hover:bg-cad-accent-light text-white rounded text-sm font-medium transition-colors disabled:opacity-50">
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button type="button" onClick={() => setShowEdit(false)} className="px-4 py-2 bg-cad-card hover:bg-cad-border text-cad-muted rounded text-sm transition-colors">
              Cancel
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function OffenceFormFields({ form, setForm }) {
  return (
    <>
      <div>
        <label className="block text-sm text-cad-muted mb-1">Category *</label>
        <select
          required
          value={form.category}
          onChange={e => setForm(prev => ({ ...prev, category: e.target.value }))}
          className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
        >
          {OFFENCE_CATEGORY_ORDER.map(category => (
            <option key={category} value={category}>{OFFENCE_CATEGORY_LABEL[category]}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm text-cad-muted mb-1">Code</label>
          <input
            type="text"
            value={form.code}
            onChange={e => setForm(prev => ({ ...prev, code: e.target.value }))}
            className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-cad-accent"
            placeholder="e.g. INF-01"
          />
        </div>
        <div>
          <label className="block text-sm text-cad-muted mb-1">Fine Amount ($)</label>
          <input
            type="number"
            min="0"
            value={form.fine_amount}
            onChange={e => setForm(prev => ({ ...prev, fine_amount: Number(e.target.value) || 0 }))}
            className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm text-cad-muted mb-1">Default Jail Minutes</label>
        <input
          type="number"
          min="0"
          step="1"
          value={form.jail_minutes}
          onChange={e => setForm(prev => ({ ...prev, jail_minutes: Math.max(0, Math.trunc(Number(e.target.value) || 0)) }))}
          className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
        />
      </div>
      <div>
        <label className="block text-sm text-cad-muted mb-1">Title *</label>
        <input
          type="text"
          required
          value={form.title}
          onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
          className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
        />
      </div>
      <div>
        <label className="block text-sm text-cad-muted mb-1">Description</label>
        <textarea
          value={form.description}
          onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
          rows={3}
          className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent resize-none"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm text-cad-muted mb-1">Sort Order</label>
          <input
            type="number"
            value={form.sort_order}
            onChange={e => setForm(prev => ({ ...prev, sort_order: Number(e.target.value) || 0 }))}
            className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-cad-muted pt-7">
          <input
            type="checkbox"
            checked={!!form.is_active}
            onChange={e => setForm(prev => ({ ...prev, is_active: e.target.checked ? 1 : 0 }))}
            className="rounded"
          />
          Active
        </label>
      </div>
    </>
  );
}

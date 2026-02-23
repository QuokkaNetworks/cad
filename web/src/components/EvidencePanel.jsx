import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { useEventSource } from '../hooks/useEventSource';
import { formatDateTimeAU } from '../utils/dateTime';

function buildEmptyForm() {
  return {
    case_number: '',
    title: '',
    description: '',
    photo_url: '',
    chain_status: 'logged',
  };
}

export default function EvidencePanel({
  entityType,
  entityId,
  departmentId = null,
  title = 'Evidence',
  compact = false,
}) {
  const normalizedEntityType = String(entityType || '').trim().toLowerCase();
  const numericEntityId = Number(entityId);
  const canLoad = !!normalizedEntityType && Number.isInteger(numericEntityId) && numericEntityId > 0;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(buildEmptyForm);
  const [open, setOpen] = useState(false);

  async function loadEvidence() {
    if (!canLoad) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const data = await api.get(`/api/evidence?entity_type=${encodeURIComponent(normalizedEntityType)}&entity_id=${numericEntityId}`);
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load evidence:', err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open && compact) return;
    loadEvidence();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedEntityType, numericEntityId, open, compact]);

  useEventSource({
    'evidence:create': (payload) => {
      if (!canLoad) return;
      if (String(payload?.entity_type || '').trim().toLowerCase() !== normalizedEntityType) return;
      if (Number(payload?.entity_id) !== numericEntityId) return;
      loadEvidence();
    },
    'evidence:delete': (payload) => {
      if (!canLoad) return;
      if (String(payload?.entity_type || '').trim().toLowerCase() !== normalizedEntityType) return;
      if (Number(payload?.entity_id) !== numericEntityId) return;
      const deletedId = Number(payload?.evidence_id || 0);
      if (Number.isInteger(deletedId) && deletedId > 0) {
        setItems((current) => (
          Array.isArray(current)
            ? current.filter((item) => Number(item?.id) !== deletedId)
            : []
        ));
        return;
      }
      loadEvidence();
    },
  });

  async function createEvidence(e) {
    e.preventDefault();
    if (!canLoad) return;
    if (!String(form.title || '').trim()) return;
    setSaving(true);
    try {
      const created = await api.post('/api/evidence', {
        entity_type: normalizedEntityType,
        entity_id: numericEntityId,
        department_id: departmentId,
        ...form,
      });
      setItems((current) => [created, ...(Array.isArray(current) ? current : [])]);
      setForm(buildEmptyForm());
      if (!open) setOpen(true);
    } catch (err) {
      alert('Failed to add evidence: ' + (err?.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  }

  async function deleteEvidence(id) {
    if (!id) return;
    if (!confirm('Delete this evidence item?')) return;
    try {
      await api.delete(`/api/evidence/${id}`);
      setItems((current) => (Array.isArray(current) ? current.filter((item) => Number(item?.id) !== Number(id)) : []));
    } catch (err) {
      alert('Failed to delete evidence: ' + (err?.message || 'Unknown error'));
    }
  }

  const itemCount = useMemo(() => (Array.isArray(items) ? items.length : 0), [items]);

  return (
    <div className="bg-cad-surface border border-cad-border rounded-lg p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-cad-muted uppercase tracking-wider">
          {title} ({itemCount})
        </h4>
        {compact && (
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            className="px-2 py-1 text-[11px] rounded border border-cad-border text-cad-muted hover:text-cad-ink"
          >
            {open ? 'Hide' : 'Show'}
          </button>
        )}
      </div>

      {(!compact || open) && (
        <>
          <form onSubmit={createEvidence} className="space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <input
                type="text"
                value={form.case_number}
                onChange={(e) => setForm((current) => ({ ...current, case_number: e.target.value }))}
                placeholder="Case number"
                className="bg-cad-card border border-cad-border rounded px-3 py-2 text-sm"
              />
              <input
                type="text"
                value={form.chain_status}
                onChange={(e) => setForm((current) => ({ ...current, chain_status: e.target.value }))}
                placeholder="Chain status (logged/seized/etc)"
                className="bg-cad-card border border-cad-border rounded px-3 py-2 text-sm"
              />
            </div>
            <input
              type="text"
              required
              value={form.title}
              onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))}
              placeholder="Evidence title"
              className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm"
            />
            <input
              type="url"
              value={form.photo_url}
              onChange={(e) => setForm((current) => ({ ...current, photo_url: e.target.value }))}
              placeholder="Photo URL (optional)"
              className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm"
            />
            <textarea
              value={form.description}
              onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))}
              rows={compact ? 2 : 3}
              placeholder="Description / chain notes"
              className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm resize-none"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving || !canLoad}
                className="px-3 py-2 bg-cad-accent hover:bg-cad-accent-light text-white rounded text-sm font-medium disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Add Evidence'}
              </button>
            </div>
          </form>

          <div className="space-y-2">
            {loading ? (
              <p className="text-xs text-cad-muted">Loading evidence...</p>
            ) : itemCount === 0 ? (
              <p className="text-xs text-cad-muted">No evidence items attached yet.</p>
            ) : (
              items.map((item) => (
                <div key={item.id} className="bg-cad-card border border-cad-border rounded p-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium break-words">{item.title}</p>
                      <div className="flex flex-wrap gap-2 mt-1 text-[11px] text-cad-muted">
                        {item.case_number ? <span>Case: <span className="text-cad-ink">{item.case_number}</span></span> : null}
                        {item.chain_status ? <span>Status: <span className="text-cad-ink">{item.chain_status}</span></span> : null}
                        <span>{formatDateTimeAU(item.created_at ? `${item.created_at}Z` : '', '-')}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteEvidence(item.id)}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Delete
                    </button>
                  </div>
                  {item.description ? (
                    <p className="text-xs text-cad-muted mt-2 whitespace-pre-wrap break-words">{item.description}</p>
                  ) : null}
                  {item.photo_url ? (
                    <a
                      href={item.photo_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block mt-2 text-xs text-cad-accent-light hover:underline break-all"
                    >
                      {item.photo_url}
                    </a>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

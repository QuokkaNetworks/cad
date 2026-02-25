import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../../api/client';
import Modal from '../../components/Modal';
import { useDepartment } from '../../context/DepartmentContext';
import { useEventSource } from '../../hooks/useEventSource';
import { formatDateAU, formatDateTimeAU } from '../../utils/dateTime';
import { DEPARTMENT_LAYOUT, getDepartmentLayoutType } from '../../utils/departmentLayout';

const LIST_STATUS_OPTIONS = [
  { value: 'open', label: 'Open (Issued)' },
  { value: 'all', label: 'All' },
  { value: 'issued', label: 'Issued' },
  { value: 'cancelled', label: 'Cancelled' },
];

const PAYABLE_STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'paid', label: 'Paid' },
  { value: 'court_listed', label: 'Court Listed' },
  { value: 'waived', label: 'Waived' },
  { value: 'withdrawn', label: 'Withdrawn' },
];

const EDITABLE_PAYABLE_STATUS_OPTIONS = PAYABLE_STATUS_OPTIONS.filter((o) => o.value !== 'all');
const NOTICE_STATUS_OPTIONS = [
  { value: 'issued', label: 'Issued' },
  { value: 'cancelled', label: 'Cancelled' },
];

const EMPTY_FORM = {
  subject_name: '',
  citizen_id: '',
  vehicle_plate: '',
  location: '',
  title: '',
  description: '',
  amount: '',
  payable_status: 'unpaid',
  due_date: '',
  court_date: '',
  court_location: '',
  status: 'issued',
};

function money(value) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })
    .format(Number.isFinite(Number(value)) ? Number(value) : 0);
}

function labelize(value) {
  return String(value || '')
    .trim()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase()) || '-';
}

function normalizePersonSearchOption(row) {
  const source = row && typeof row === 'object' ? row : {};
  const citizenId = String(source.citizenId || source.citizenid || source.citizen_id || '').trim();
  const fullName = String(
    source.name
    || source.full_name
    || `${String(source.firstname || '').trim()} ${String(source.lastname || '').trim()}`.trim()
    || ''
  ).trim();

  return {
    citizenId,
    name: fullName || citizenId,
  };
}

function badgeClass(kind, value) {
  const key = `${kind}:${String(value || '').trim().toLowerCase()}`;
  const map = {
    'payable:paid': 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    'payable:court_listed': 'border-violet-500/30 bg-violet-500/10 text-violet-300',
    'payable:waived': 'border-sky-500/30 bg-sky-500/10 text-sky-300',
    'payable:withdrawn': 'border-slate-500/30 bg-slate-500/10 text-slate-300',
    'payable:unpaid': 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    'notice:cancelled': 'border-slate-500/30 bg-slate-500/10 text-slate-300',
    'notice:issued': 'border-blue-500/30 bg-blue-500/10 text-blue-300',
  };
  return map[key] || 'border-cad-border bg-cad-surface text-cad-muted';
}

function toInputDate(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? '' : new Date(parsed).toISOString().slice(0, 10);
}

function noticeToForm(notice) {
  if (!notice) return { ...EMPTY_FORM };
  return {
    subject_name: String(notice.subject_name || ''),
    citizen_id: String(notice.citizen_id || ''),
    vehicle_plate: String(notice.vehicle_plate || ''),
    location: String(notice.location || ''),
    title: String(notice.title || ''),
    description: String(notice.description || ''),
    amount: String(Number(notice.amount || 0)),
    payable_status: String(notice.payable_status || 'unpaid') || 'unpaid',
    due_date: toInputDate(notice.due_date),
    court_date: toInputDate(notice.court_date),
    court_location: String(notice.court_location || ''),
    status: String(notice.status || 'issued') || 'issued',
  };
}

function formToPayload(form) {
  const payload = {
    subject_name: String(form.subject_name || '').trim(),
    citizen_id: String(form.citizen_id || '').trim(),
    vehicle_plate: String(form.vehicle_plate || '').trim().toUpperCase(),
    location: String(form.location || '').trim(),
    title: String(form.title || '').trim(),
    description: String(form.description || '').trim(),
    amount: Number(form.amount || 0),
    payable_status: String(form.payable_status || 'unpaid').trim() || 'unpaid',
    due_date: String(form.due_date || '').trim() || null,
    court_date: String(form.court_date || '').trim() || null,
    court_location: String(form.court_location || '').trim(),
    status: String(form.status || 'issued').trim() || 'issued',
  };
  if (!Number.isFinite(payload.amount) || payload.amount < 0) payload.amount = 0;
  return payload;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function InfringementLockedCard() {
  return (
    <div className="bg-cad-card border border-cad-border rounded-lg p-5">
      <h2 className="text-xl font-bold mb-2">Infringement Notices</h2>
      <p className="text-sm text-cad-muted">
        Infringement Notices are available for law enforcement departments only.
      </p>
    </div>
  );
}

function FormFields({ form, setForm }) {
  const [personMatches, setPersonMatches] = useState([]);
  const [personSearching, setPersonSearching] = useState(false);
  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    const query = String(form.subject_name || '').trim();
    if (String(form.citizen_id || '').trim()) {
      setPersonMatches([]);
      setPersonSearching(false);
      return;
    }
    if (query.length < 2) {
      setPersonMatches([]);
      setPersonSearching(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setPersonSearching(true);
      try {
        const payload = await api.get(`/api/search/cad/persons?q=${encodeURIComponent(query)}`);
        if (cancelled) return;
        const matches = Array.isArray(payload)
          ? payload
            .map(normalizePersonSearchOption)
            .filter((entry) => entry.name)
            .slice(0, 8)
          : [];
        setPersonMatches(matches);
      } catch {
        if (!cancelled) setPersonMatches([]);
      } finally {
        if (!cancelled) setPersonSearching(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [form.subject_name, form.citizen_id]);

  function onSubjectNameChange(value) {
    setForm((prev) => ({
      ...prev,
      subject_name: value,
      citizen_id: '',
    }));
  }

  function selectPersonMatch(match) {
    const normalized = normalizePersonSearchOption(match);
    setForm((prev) => ({
      ...prev,
      subject_name: normalized.name || prev.subject_name,
      citizen_id: normalized.citizenId || prev.citizen_id,
    }));
    setPersonMatches([]);
    setPersonSearching(false);
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-cad-border bg-cad-card/60 p-4">
        <div className="mb-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-cad-muted">Subject & Location</p>
          <h3 className="text-sm font-semibold text-cad-ink mt-1">Recipient Details</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <label className="block text-sm mb-1 text-cad-muted">Civilian (Search & Select)</label>
            <input
              value={form.subject_name}
              onChange={(e) => onSubjectNameChange(e.target.value)}
              placeholder="Start typing the civilian name..."
              className="w-full rounded-md border border-cad-border bg-cad-surface px-3 py-2"
            />
            <div className="mt-1 text-xs text-cad-muted">
              {String(form.citizen_id || '').trim()
                ? `Selected civilian CID: ${String(form.citizen_id || '').trim()}`
                : (personSearching ? 'Searching civilians...' : 'Select a civilian from the results below to attach the notice.')}
            </div>
            {personMatches.length > 0 ? (
              <div className="mt-2 rounded-md border border-cad-border bg-cad-card overflow-hidden">
                {personMatches.map((match) => (
                  <button
                    key={`${match.citizenId || match.name}`}
                    type="button"
                    onClick={() => selectPersonMatch(match)}
                    className="w-full text-left px-3 py-2 border-b last:border-b-0 border-cad-border hover:bg-cad-surface/60 transition"
                  >
                    <div className="text-sm text-cad-ink">{match.name || 'Unknown Civilian'}</div>
                    <div className="text-xs text-cad-muted">{match.citizenId || 'No Citizen ID'}</div>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div>
            <label className="block text-sm mb-1 text-cad-muted">Vehicle Plate</label>
            <input value={form.vehicle_plate} onChange={(e) => setField('vehicle_plate', e.target.value.toUpperCase())} className="w-full rounded-md border border-cad-border bg-cad-surface px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm mb-1 text-cad-muted">Location</label>
            <input value={form.location} onChange={(e) => setField('location', e.target.value)} className="w-full rounded-md border border-cad-border bg-cad-surface px-3 py-2" />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-cad-border bg-cad-card/60 p-4">
        <div className="mb-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-cad-muted">Notice Details</p>
          <h3 className="text-sm font-semibold text-cad-ink mt-1">Offence / Infringement Information</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <label className="block text-sm mb-1 text-cad-muted">Title</label>
            <input required value={form.title} onChange={(e) => setField('title', e.target.value)} className="w-full rounded-md border border-cad-border bg-cad-surface px-3 py-2" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm mb-1 text-cad-muted">Description / Particulars</label>
            <textarea value={form.description} onChange={(e) => setField('description', e.target.value)} rows={4} className="w-full rounded-md border border-cad-border bg-cad-surface px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm mb-1 text-cad-muted">Amount (AUD)</label>
            <input type="number" min="0" step="1" value={form.amount} onChange={(e) => setField('amount', e.target.value)} className="w-full rounded-md border border-cad-border bg-cad-surface px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm mb-1 text-cad-muted">Payable Status</label>
            <select value={form.payable_status} onChange={(e) => setField('payable_status', e.target.value)} className="w-full rounded-md border border-cad-border bg-cad-surface px-3 py-2">
              {EDITABLE_PAYABLE_STATUS_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-cad-border bg-cad-card/60 p-4">
        <div className="mb-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-cad-muted">Court & Status</p>
          <h3 className="text-sm font-semibold text-cad-ink mt-1">Compliance Tracking</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm mb-1 text-cad-muted">Due Date</label>
            <input type="date" value={form.due_date} onChange={(e) => setField('due_date', e.target.value)} className="w-full rounded-md border border-cad-border bg-cad-surface px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm mb-1 text-cad-muted">Court Date</label>
            <input type="date" value={form.court_date} onChange={(e) => setField('court_date', e.target.value)} className="w-full rounded-md border border-cad-border bg-cad-surface px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm mb-1 text-cad-muted">Court Location</label>
            <input value={form.court_location} onChange={(e) => setField('court_location', e.target.value)} className="w-full rounded-md border border-cad-border bg-cad-surface px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm mb-1 text-cad-muted">Notice Status</label>
            <select value={form.status} onChange={(e) => setField('status', e.target.value)} className="w-full rounded-md border border-cad-border bg-cad-surface px-3 py-2">
              {NOTICE_STATUS_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>
        </div>
      </section>
    </div>
  );
}

function NoticeDetailPanel({
  selectedListItem,
  selectedNotice,
  detailLoading,
  formError,
  showCreate,
  setFormError,
  editForm,
  setEditForm,
  submitSave,
  saveSaving,
  printNoticeTemplate,
  exportNoticeJson,
  queuePrint,
  printing,
  markPaid,
  markingPaid,
  cancelNotice,
  cancelling,
  removeNotice,
  removingNotice,
  auditRows,
  auditLoading,
}) {
  const payableStatus = String(selectedNotice?.payable_status || '').trim().toLowerCase();
  const noticeStatus = String(selectedNotice?.status || '').trim().toLowerCase();
  const isPaid = payableStatus === 'paid' || !!String(selectedNotice?.paid_at || '').trim();
  const canCancel = !!selectedNotice && !isPaid && noticeStatus !== 'cancelled';
  const canRemove = !!selectedNotice && !isPaid;

  return (
    <div className="bg-cad-card border border-cad-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-cad-border bg-cad-surface/40">
        <p className="text-[10px] uppercase tracking-[0.18em] text-cad-muted">Notice Workspace</p>
        <h2 className="text-lg font-semibold text-cad-ink mt-1">
          {selectedNotice
            ? `Infringement Notice ${selectedNotice.notice_number || `#${selectedNotice.id}`}`
            : 'Select A Notice'}
        </h2>
        <p className="text-xs text-cad-muted mt-1">
          {selectedNotice
            ? 'Review, update, print, and track this notice without opening a popup.'
            : 'Choose a notice from the register to view and manage it here.'}
        </p>
      </div>

      <div className="p-4 space-y-4">
        {detailLoading && !selectedNotice ? <div className="text-sm text-cad-muted">Loading notice...</div> : null}
        {!detailLoading && !selectedNotice ? (
          <div className="rounded-xl border border-cad-border bg-cad-surface/40 p-4">
            {selectedListItem ? (
              <>
                <p className="text-sm font-semibold text-cad-ink">{selectedListItem.title || 'Untitled Notice'}</p>
                <p className="text-xs text-cad-muted mt-1">
                  {selectedListItem.subject_name || selectedListItem.citizen_id || 'Unknown'}
                  {selectedListItem.vehicle_plate ? ` | ${selectedListItem.vehicle_plate}` : ''}
                </p>
                <p className="text-xs text-cad-muted mt-1">Loading full notice details...</p>
              </>
            ) : (
              <p className="text-sm text-cad-muted">No notice selected.</p>
            )}
          </div>
        ) : null}

        {selectedNotice ? (
          <>
            {formError && !showCreate ? (
              <div className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                {formError}
              </div>
            ) : null}

            <div className="rounded-xl border border-cad-border bg-cad-surface/35 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs border ${badgeClass('payable', selectedNotice.payable_status)}`}>
                      {labelize(selectedNotice.payable_status)}
                    </span>
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs border ${badgeClass('notice', selectedNotice.status)}`}>
                      {labelize(selectedNotice.status)}
                    </span>
                    {Number(selectedNotice.print_count || 0) > 0 ? (
                      <span className="inline-flex px-2 py-0.5 rounded text-xs border border-cad-border bg-cad-card text-cad-muted">
                        Printed {Number(selectedNotice.print_count)}x
                      </span>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-1 gap-1 text-xs text-cad-muted">
                    <div>
                      Filed by {selectedNotice.officer_callsign ? `${selectedNotice.officer_callsign} ` : ''}
                      {selectedNotice.officer_name || selectedNotice.creator_name || '-'}
                    </div>
                    <div>
                      Created {formatDateTimeAU(selectedNotice.created_at)}
                      {selectedNotice.updated_at ? ` | Updated ${formatDateTimeAU(selectedNotice.updated_at)}` : ''}
                    </div>
                    {selectedNotice.paid_at ? <div>Paid {formatDateTimeAU(selectedNotice.paid_at)}</div> : null}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => { setFormError(''); printNoticeTemplate(); }} className="px-3 py-2 rounded-md border border-cad-border bg-cad-card text-sm">
                    Print Template
                  </button>
                  <button type="button" onClick={exportNoticeJson} className="px-3 py-2 rounded-md border border-cad-border bg-cad-card text-sm">
                    Export
                  </button>
                  <button type="button" onClick={queuePrint} disabled={printing} className="px-3 py-2 rounded-md bg-cad-accent text-white text-sm font-medium disabled:opacity-50">
                    {printing ? 'Queueing...' : (Number(selectedNotice.print_count || 0) > 0 ? 'Reprint In-Game' : 'Print In-Game')}
                  </button>
                  <button
                    type="button"
                    onClick={markPaid}
                    disabled={markingPaid || String(selectedNotice.payable_status || '').toLowerCase() === 'paid'}
                    className="px-3 py-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 text-sm disabled:opacity-50"
                  >
                    {markingPaid ? 'Updating...' : 'Mark Paid'}
                  </button>
                  <button
                    type="button"
                    onClick={cancelNotice}
                    disabled={!canCancel || cancelling}
                    className="px-3 py-2 rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-200 text-sm disabled:opacity-50"
                    title={isPaid ? 'Paid notices cannot be cancelled' : undefined}
                  >
                    {cancelling ? 'Cancelling...' : (noticeStatus === 'cancelled' ? 'Cancelled' : 'Cancel Notice')}
                  </button>
                  <button
                    type="button"
                    onClick={removeNotice}
                    disabled={!canRemove || removingNotice}
                    className="px-3 py-2 rounded-md border border-red-500/40 bg-red-500/10 text-red-300 text-sm disabled:opacity-50"
                    title={isPaid ? 'Paid notices cannot be removed' : undefined}
                  >
                    {removingNotice ? 'Removing...' : 'Remove Notice'}
                  </button>
                </div>
              </div>
              {isPaid ? (
                <p className="text-xs text-cad-muted mt-2">
                  Paid notices are preserved and cannot be cancelled or removed.
                </p>
              ) : null}
            </div>

            <form onSubmit={submitSave} className="space-y-4">
              <FormFields form={editForm} setForm={setEditForm} />
              <div className="flex justify-end">
                <button type="submit" disabled={saveSaving} className="px-4 py-2 rounded-md bg-cad-accent text-white font-medium disabled:opacity-50">
                  {saveSaving ? 'Saving...' : 'Save Notice'}
                </button>
              </div>
            </form>

            <div className="rounded-xl border border-cad-border bg-cad-surface/35 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">Print / Reprint Audit</h3>
                <span className="text-xs text-cad-muted">{auditRows.length} entries</span>
              </div>
              {auditLoading ? <div className="text-sm text-cad-muted">Loading audit...</div> : null}
              {!auditLoading && auditRows.length === 0 ? <div className="text-sm text-cad-muted">No print activity recorded yet.</div> : null}
              <div className="space-y-2">
                {auditRows.map((row) => (
                  <div key={row.id} className="rounded-md border border-cad-border bg-cad-card px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{String(row.print_action || '').toLowerCase() === 'reprint' ? 'Reprint' : 'Print'}</span>
                      <span className="text-xs text-cad-muted">{formatDateTimeAU(row.created_at)}</span>
                    </div>
                    <div className="text-xs text-cad-muted mt-1">
                      {row.printed_by_callsign ? `${row.printed_by_callsign} ` : ''}{row.printed_by_name || ''}
                      {row.print_job_id ? ` | Print Job #${row.print_job_id}` : ''}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

export default function Infringements() {
  const { activeDepartment } = useDepartment();
  const { key: locationKey, search } = useLocation();
  const departmentId = Number(activeDepartment?.id || 0) || null;
  const isLaw = getDepartmentLayoutType(activeDepartment) === DEPARTMENT_LAYOUT.LAW_ENFORCEMENT;

  const [filters, setFilters] = useState({ status: 'open', payable_status: 'unpaid', q: '', court_only: false });
  const [list, setList] = useState([]);
  const [courtList, setCourtList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [selectedNotice, setSelectedNotice] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [auditRows, setAuditRows] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ ...EMPTY_FORM });
  const [editForm, setEditForm] = useState({ ...EMPTY_FORM });
  const [formError, setFormError] = useState('');
  const [createSaving, setCreateSaving] = useState(false);
  const [saveSaving, setSaveSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [removingNotice, setRemovingNotice] = useState(false);

  const summary = useMemo(() => {
    const issued = list.filter((row) => String(row.status || '').toLowerCase() === 'issued');
    const unpaid = issued.filter((row) => String(row.payable_status || '').toLowerCase() === 'unpaid');
    const unpaidTotal = unpaid.reduce((sum, row) => sum + (Number(row.amount || 0) || 0), 0);
    const courtListed = issued.filter((row) => String(row.payable_status || '').toLowerCase() === 'court_listed' || String(row.court_date || '').trim());
    const today = new Date().toISOString().slice(0, 10);
    const overdue = unpaid.filter((row) => {
      const due = String(row.due_date || '').slice(0, 10);
      return due && due < today;
    });
    return { issued: issued.length, unpaid: unpaid.length, unpaidTotal, courtListed: courtListed.length, overdue: overdue.length };
  }, [list]);

  const selectedListItem = useMemo(
    () => list.find((row) => Number(row.id) === Number(selectedId)) || null,
    [list, selectedId],
  );

  const fetchList = useCallback(async () => {
    if (!departmentId || !isLaw) {
      setList([]);
      setCourtList([]);
      return;
    }
    const params = new URLSearchParams();
    params.set('department_id', String(departmentId));
    params.set('limit', '200');
    params.set('status', String(filters.status || 'open'));
    params.set('payable_status', String(filters.payable_status || 'all'));
    if (String(filters.q || '').trim()) params.set('q', String(filters.q).trim());
    if (filters.court_only) params.set('court_only', 'true');

    const courtParams = new URLSearchParams();
    courtParams.set('department_id', String(departmentId));
    courtParams.set('limit', '20');
    courtParams.set('status', 'open');
    courtParams.set('court_only', 'true');

    setLoading(true);
    setError('');
    try {
      const [rows, courtRows] = await Promise.all([
        api.get(`/api/infringements?${params.toString()}`),
        api.get(`/api/infringements?${courtParams.toString()}`).catch(() => []),
      ]);
      const next = Array.isArray(rows) ? rows : [];
      setList(next);
      setCourtList(Array.isArray(courtRows) ? courtRows : []);
      setSelectedId((current) => {
        if (current && next.some((r) => Number(r.id) === Number(current))) return current;
        return next[0]?.id || null;
      });
    } catch (err) {
      setError(err?.message || 'Failed to load infringement notices');
      setList([]);
      setCourtList([]);
    } finally {
      setLoading(false);
    }
  }, [departmentId, filters, isLaw]);

  const fetchDetail = useCallback(async (noticeId) => {
    const id = Number(noticeId);
    if (!Number.isInteger(id) || id <= 0) {
      setSelectedNotice(null);
      setAuditRows([]);
      return;
    }
    setDetailLoading(true);
    setAuditLoading(true);
    setFormError('');
    try {
      const [notice, audit] = await Promise.all([
        api.get(`/api/infringements/${id}`),
        api.get(`/api/infringements/${id}/print-audit?limit=25`).catch(() => []),
      ]);
      setSelectedNotice(notice || null);
      setEditForm(noticeToForm(notice));
      setAuditRows(Array.isArray(audit) ? audit : []);
    } catch (err) {
      setFormError(err?.message || 'Failed to load infringement notice');
      setSelectedNotice(null);
      setAuditRows([]);
    } finally {
      setDetailLoading(false);
      setAuditLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList, locationKey]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedNotice(null);
      setAuditRows([]);
      return;
    }
    fetchDetail(selectedId);
  }, [selectedId, fetchDetail]);

  useEffect(() => {
    const params = new URLSearchParams(search || '');
    const cid = String(params.get('citizen_id') || '').trim();
    if (!cid) return;
    setFilters((prev) => ({ ...prev, q: cid }));
    setCreateForm((prev) => ({ ...prev, citizen_id: cid }));

    let cancelled = false;
    api.get(`/api/search/cad/persons/${encodeURIComponent(cid)}`)
      .then((person) => {
        if (cancelled) return;
        const normalized = normalizePersonSearchOption(person);
        if (!normalized.name) return;
        setCreateForm((prev) => {
          if (String(prev.citizen_id || '').trim() !== cid) return prev;
          if (String(prev.subject_name || '').trim()) return prev;
          return { ...prev, subject_name: normalized.name };
        });
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [search]);

  useEventSource({
    'infringement:create': (payload) => {
      if (Number(payload?.departmentId || payload?.department_id || 0) !== Number(departmentId || 0)) return;
      fetchList();
    },
    'infringement:update': (payload) => {
      if (Number(payload?.departmentId || payload?.department_id || 0) !== Number(departmentId || 0)) return;
      fetchList();
      const updatedId = Number(payload?.infringement?.id || 0);
      if (updatedId && Number(selectedId || 0) === updatedId) fetchDetail(updatedId);
    },
    'infringement:delete': (payload) => {
      if (Number(payload?.departmentId || payload?.department_id || 0) !== Number(departmentId || 0)) return;
      fetchList();
      const deletedId = Number(payload?.infringementId || payload?.infringement_id || 0);
      if (deletedId && Number(selectedId || 0) === deletedId) {
        setSelectedId(null);
        setSelectedNotice(null);
        setAuditRows([]);
      }
    },
  });

  async function submitCreate(event) {
    event.preventDefault();
    if (!departmentId) return;
    setCreateSaving(true);
    setFormError('');
    try {
      const payload = formToPayload(createForm);
      if (payload.payable_status === 'court_listed' && !payload.court_date) {
        throw new Error('Court date is required when payable status is Court Listed');
      }
      const created = await api.post('/api/infringements', { ...payload, department_id: departmentId });
      setShowCreate(false);
      setSelectedId(Number(created?.id || 0) || null);
      await fetchList();
      if (created?.id) await fetchDetail(created.id);
    } catch (err) {
      setFormError(err?.message || 'Failed to create infringement notice');
    } finally {
      setCreateSaving(false);
    }
  }

  async function submitSave(event) {
    event.preventDefault();
    if (!selectedNotice?.id) return;
    setSaveSaving(true);
    setFormError('');
    try {
      const payload = formToPayload(editForm);
      if (payload.payable_status === 'court_listed' && !payload.court_date) {
        throw new Error('Court date is required when payable status is Court Listed');
      }
      await api.patch(`/api/infringements/${selectedNotice.id}`, payload);
      await fetchList();
      await fetchDetail(selectedNotice.id);
    } catch (err) {
      setFormError(err?.message || 'Failed to save infringement notice');
    } finally {
      setSaveSaving(false);
    }
  }

  async function markPaid() {
    if (!selectedNotice?.id) return;
    setMarkingPaid(true);
    setFormError('');
    try {
      await api.post(`/api/infringements/${selectedNotice.id}/mark-paid`, {});
      await fetchList();
      await fetchDetail(selectedNotice.id);
    } catch (err) {
      setFormError(err?.message || 'Failed to mark notice paid');
    } finally {
      setMarkingPaid(false);
    }
  }

  async function queuePrint() {
    if (!selectedNotice?.id) return;
    setPrinting(true);
    setFormError('');
    try {
      await api.post(`/api/infringements/${selectedNotice.id}/print`, {});
      await fetchList();
      await fetchDetail(selectedNotice.id);
    } catch (err) {
      setFormError(err?.message || 'Failed to queue print / reprint');
    } finally {
      setPrinting(false);
    }
  }

  async function cancelNotice() {
    if (!selectedNotice?.id) return;
    const payableStatus = String(selectedNotice.payable_status || '').trim().toLowerCase();
    const isPaid = payableStatus === 'paid' || !!String(selectedNotice.paid_at || '').trim();
    if (isPaid) {
      setFormError('Paid infringement notices cannot be cancelled');
      return;
    }
    if (String(selectedNotice.status || '').trim().toLowerCase() === 'cancelled') {
      return;
    }
    if (!confirm('Cancel this infringement notice? This will mark it as cancelled/withdrawn.')) return;

    setCancelling(true);
    setFormError('');
    try {
      await api.post(`/api/infringements/${selectedNotice.id}/cancel`, {});
      await fetchList();
      await fetchDetail(selectedNotice.id);
    } catch (err) {
      setFormError(err?.message || 'Failed to cancel infringement notice');
    } finally {
      setCancelling(false);
    }
  }

  async function removeNotice() {
    if (!selectedNotice?.id) return;
    const payableStatus = String(selectedNotice.payable_status || '').trim().toLowerCase();
    const isPaid = payableStatus === 'paid' || !!String(selectedNotice.paid_at || '').trim();
    if (isPaid) {
      setFormError('Paid infringement notices cannot be removed');
      return;
    }
    const confirmMessage = [
      'Remove this infringement notice from CAD?',
      '',
      'This permanently deletes the notice record and its print audit entries.',
      'Paid notices cannot be removed.',
    ].join('\n');
    if (!confirm(confirmMessage)) return;

    const deletingId = Number(selectedNotice.id);
    setRemovingNotice(true);
    setFormError('');
    try {
      await api.delete(`/api/infringements/${deletingId}`);
      setSelectedId(null);
      setSelectedNotice(null);
      setAuditRows([]);
      await fetchList();
    } catch (err) {
      setFormError(err?.message || 'Failed to remove infringement notice');
    } finally {
      setRemovingNotice(false);
    }
  }

  function openCreate() {
    const due = new Date(Date.now() + (14 * 24 * 60 * 60 * 1000)).toISOString().slice(0, 10);
    setCreateForm({
      ...EMPTY_FORM,
      subject_name: createForm.subject_name || '',
      citizen_id: createForm.citizen_id || '',
      due_date: due,
    });
    setFormError('');
    setShowCreate(true);
  }

  function exportNoticeJson() {
    if (!selectedNotice) return;
    const payload = {
      template: 'victoria_infringement_notice',
      generated_at: new Date().toISOString(),
      notice: selectedNotice,
      print_audit: auditRows,
    };
    const suffix = String(selectedNotice.notice_number || `notice-${selectedNotice.id}`).replace(/[^a-zA-Z0-9_-]/g, '-');
    downloadJson(`victoria-infringement-${suffix}.json`, payload);
  }

  function printNoticeTemplate() {
    if (!selectedNotice) return;
    const officerLabel = selectedNotice.officer_callsign
      ? `${selectedNotice.officer_callsign} - ${selectedNotice.officer_name || ''}`.trim()
      : (selectedNotice.officer_name || selectedNotice.creator_name || '-');
    const html = `<!doctype html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Victoria Police Infringement Notice ${escapeHtml(selectedNotice.notice_number || `#${selectedNotice.id}`)}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 24px; color: #101828; background: #fff; }
          .header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom: 3px solid #0a2f6b; padding-bottom:12px; margin-bottom:16px; }
          .brand { color:#0a2f6b; font-weight:800; font-size:24px; }
          .sub { color:#b56d00; font-weight:700; margin-top:4px; }
          .notice { font-size:12px; color:#475467; text-align:right; }
          .grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px; }
          .card { border:1px solid #d0d5dd; border-radius:8px; padding:10px 12px; }
          .label { font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:#667085; }
          .value { margin-top:4px; font-weight:600; white-space:pre-wrap; }
          .wide { margin-top:12px; }
          .pill { display:inline-block; border:1px solid #d0d5dd; border-radius:999px; padding:4px 8px; font-size:11px; margin-right:6px; }
          .footer { margin-top:14px; color:#667085; font-size:11px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="brand">Victoria Police</div>
            <div class="sub">Infringement Notice</div>
          </div>
          <div class="notice">
            <div><strong>${escapeHtml(selectedNotice.notice_number || `#${selectedNotice.id}`)}</strong></div>
            <div>Generated ${escapeHtml(formatDateTimeAU(selectedNotice.updated_at || selectedNotice.created_at || '', '-'))}</div>
          </div>
        </div>
        <div class="grid">
          <div class="card"><div class="label">Subject</div><div class="value">${escapeHtml(selectedNotice.subject_name || '-')}</div></div>
          <div class="card"><div class="label">Citizen ID</div><div class="value">${escapeHtml(selectedNotice.citizen_id || '-')}</div></div>
          <div class="card"><div class="label">Vehicle Plate</div><div class="value">${escapeHtml(selectedNotice.vehicle_plate || '-')}</div></div>
          <div class="card"><div class="label">Location</div><div class="value">${escapeHtml(selectedNotice.location || '-')}</div></div>
          <div class="card"><div class="label">Filed By</div><div class="value">${escapeHtml(officerLabel)}</div></div>
          <div class="card"><div class="label">Amount</div><div class="value">${escapeHtml(money(selectedNotice.amount))}</div></div>
        </div>
        <div class="card wide">
          <div class="label">Offence / Notice Title</div>
          <div class="value">${escapeHtml(selectedNotice.title || '-')}</div>
          <div class="label" style="margin-top:10px;">Particulars</div>
          <div class="value">${escapeHtml(selectedNotice.description || '-')}</div>
        </div>
        <div class="card wide">
          <div class="label">Status</div>
          <div class="value">
            <span class="pill">Payable: ${escapeHtml(labelize(selectedNotice.payable_status))}</span>
            <span class="pill">Notice: ${escapeHtml(labelize(selectedNotice.status))}</span>
            <span class="pill">Due: ${escapeHtml(formatDateAU(selectedNotice.due_date || '', '-'))}</span>
            <span class="pill">Court: ${escapeHtml(selectedNotice.court_date ? formatDateAU(selectedNotice.court_date, '-') : 'Not listed')}</span>
          </div>
          <div class="label" style="margin-top:10px;">Court Location</div>
          <div class="value">${escapeHtml(selectedNotice.court_location || '-')}</div>
        </div>
        <div class="footer">Victoria-style printable template generated by CAD. This printout does not replace in-game issued document handling.</div>
        <script>window.onload = () => window.print();</script>
      </body>
      </html>`;
    const win = window.open('', '_blank', 'noopener,noreferrer,width=1000,height=760');
    if (!win) {
      alert('Popup blocked. Please allow popups to print the notice.');
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  if (!isLaw) return <InfringementLockedCard />;

  return (
    <div className="space-y-5">
      <div className="bg-cad-card border border-cad-border rounded-lg p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-cad-muted">Roadside Enforcement</div>
            <h1 className="text-2xl font-bold mt-1">Infringement Notices</h1>
            <p className="text-sm text-cad-muted mt-2 max-w-3xl">
              Separate roadside infringement notices from criminal records, with due dates, payable status, court listings, and in-game print / reprint audit tracking.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={openCreate} className="px-4 py-2 rounded-md bg-cad-accent text-white font-medium hover:opacity-90 transition">+ New Notice</button>
            <button type="button" onClick={fetchList} className="px-4 py-2 rounded-md border border-cad-border bg-cad-surface hover:border-cad-accent/40 transition">Refresh</button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
        <div className="bg-cad-card border border-cad-border rounded-lg p-4"><div className="text-xs text-cad-muted uppercase tracking-wide">Issued</div><div className="text-2xl font-semibold mt-1">{summary.issued}</div></div>
        <div className="bg-cad-card border border-cad-border rounded-lg p-4"><div className="text-xs text-cad-muted uppercase tracking-wide">Unpaid</div><div className="text-2xl font-semibold mt-1">{summary.unpaid}</div></div>
        <div className="bg-cad-card border border-cad-border rounded-lg p-4"><div className="text-xs text-cad-muted uppercase tracking-wide">Unpaid Value</div><div className="text-xl font-semibold mt-1">{money(summary.unpaidTotal)}</div></div>
        <div className="bg-cad-card border border-cad-border rounded-lg p-4"><div className="text-xs text-cad-muted uppercase tracking-wide">Court Listed</div><div className="text-2xl font-semibold mt-1">{summary.courtListed}</div></div>
        <div className="bg-cad-card border border-cad-border rounded-lg p-4"><div className="text-xs text-cad-muted uppercase tracking-wide">Overdue</div><div className={`text-2xl font-semibold mt-1 ${summary.overdue > 0 ? 'text-rose-300' : 'text-emerald-300'}`}>{summary.overdue}</div></div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,560px)] gap-5">
        <div className="space-y-4">
          <div className="bg-cad-card border border-cad-border rounded-lg p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
            <div className="xl:col-span-2">
              <label className="block text-xs text-cad-muted uppercase tracking-wide mb-1">Search</label>
              <input value={filters.q} onChange={(e) => setFilters((prev) => ({ ...prev, q: e.target.value }))} placeholder="Notice no., name, CID, plate, title, location" className="w-full rounded-md border border-cad-border bg-cad-surface px-3 py-2" />
            </div>
            <div>
              <label className="block text-xs text-cad-muted uppercase tracking-wide mb-1">Notice Status</label>
              <select value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))} className="w-full rounded-md border border-cad-border bg-cad-surface px-3 py-2">
                {LIST_STATUS_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-cad-muted uppercase tracking-wide mb-1">Payable Status</label>
              <select value={filters.payable_status} onChange={(e) => setFilters((prev) => ({ ...prev, payable_status: e.target.value }))} className="w-full rounded-md border border-cad-border bg-cad-surface px-3 py-2">
                {PAYABLE_STATUS_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </div>
            <label className="flex items-end gap-2 text-sm">
              <input type="checkbox" checked={filters.court_only} onChange={(e) => setFilters((prev) => ({ ...prev, court_only: e.target.checked }))} />
              Court list only
            </label>
          </div>

          <div className="bg-cad-card border border-cad-border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-cad-border flex items-center justify-between">
              <div className="font-semibold">Notice Register</div>
              <div className="text-xs text-cad-muted">{loading ? 'Loading...' : `${list.length} result${list.length === 1 ? '' : 's'}`}</div>
            </div>
            <div className="max-h-[62vh] overflow-y-auto p-4 space-y-3">
              {error ? <div className="text-sm text-rose-300">{error}</div> : null}
              {!loading && list.length === 0 ? <div className="text-sm text-cad-muted">No infringement notices found.</div> : null}
              {list.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setSelectedId(Number(row.id))}
                  className={`w-full text-left rounded-lg border px-4 py-3 transition ${Number(selectedId) === Number(row.id) ? 'border-cad-accent bg-cad-accent/10' : 'border-cad-border bg-cad-card hover:border-cad-accent/40'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-cad-muted">{row.notice_number || `INFRINGEMENT-${row.id}`}</div>
                      <div className="font-semibold mt-0.5">{row.title || 'Untitled Notice'}</div>
                      <div className="text-xs text-cad-muted mt-1">
                        {row.subject_name || row.citizen_id || 'Unknown'}
                        {row.vehicle_plate ? ` | ${row.vehicle_plate}` : ''}
                        {row.location ? ` | ${row.location}` : ''}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-semibold">{money(row.amount)}</div>
                      <div className="text-xs text-cad-muted mt-1">
                        {row.court_date ? `Court ${formatDateAU(row.court_date)}` : (row.due_date ? `Due ${formatDateAU(row.due_date)}` : 'No due')}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs border ${badgeClass('payable', row.payable_status)}`}>{labelize(row.payable_status)}</span>
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs border ${badgeClass('notice', row.status)}`}>{labelize(row.status)}</span>
                    {Number(row.print_count || 0) > 0 ? <span className="inline-flex px-2 py-0.5 rounded text-xs border border-cad-border bg-cad-surface text-cad-muted">Printed {Number(row.print_count)}x</span> : null}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-cad-card border border-cad-border rounded-lg p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Court Listing</h2>
              <span className="text-xs text-cad-muted">{courtList.length}</span>
            </div>
            <div className="mt-3 space-y-2 max-h-80 overflow-y-auto">
              {courtList.length === 0 ? <div className="text-sm text-cad-muted">No court-listed notices.</div> : null}
              {courtList.map((row) => (
                <button key={row.id} type="button" onClick={() => setSelectedId(Number(row.id))} className={`w-full text-left rounded-md border px-3 py-2 transition ${Number(selectedId) === Number(row.id) ? 'border-cad-accent bg-cad-accent/10' : 'border-cad-border bg-cad-surface hover:border-cad-accent/40'}`}>
                  <div className="text-xs text-cad-muted">{formatDateAU(row.court_date)}</div>
                  <div className="font-medium text-sm">{row.title}</div>
                  <div className="text-xs text-cad-muted mt-0.5">{row.subject_name || row.citizen_id || 'Unknown'}{row.court_location ? ` | ${row.court_location}` : ''}</div>
                </button>
              ))}
            </div>
          </div>
          <NoticeDetailPanel
            selectedListItem={selectedListItem}
            selectedNotice={selectedNotice}
            detailLoading={detailLoading}
            formError={formError}
            showCreate={showCreate}
            setFormError={setFormError}
            editForm={editForm}
            setEditForm={setEditForm}
            submitSave={submitSave}
            saveSaving={saveSaving}
            printNoticeTemplate={printNoticeTemplate}
            exportNoticeJson={exportNoticeJson}
            queuePrint={queuePrint}
            printing={printing}
            markPaid={markPaid}
            markingPaid={markingPaid}
            cancelNotice={cancelNotice}
            cancelling={cancelling}
            removeNotice={removeNotice}
            removingNotice={removingNotice}
            auditRows={auditRows}
            auditLoading={auditLoading}
          />
        </div>
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Infringement Notice" wide>
        <form onSubmit={submitCreate} className="space-y-4">
          <div className="rounded-xl border border-cad-border bg-cad-surface/40 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-cad-muted">New Notice</p>
                <h3 className="text-base font-semibold text-cad-ink mt-1">Create Roadside Infringement</h3>
                <p className="text-xs text-cad-muted mt-1">
                  Complete the recipient details, offence information, and payment/court fields before issuing.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="px-2 py-1 rounded-md border border-cad-border bg-cad-card text-cad-muted">
                  Amount: {money(createForm.amount)}
                </span>
                <span className={`px-2 py-1 rounded-md border ${badgeClass('payable', createForm.payable_status)}`}>
                  {labelize(createForm.payable_status)}
                </span>
              </div>
            </div>
          </div>

          {formError && showCreate ? (
            <div className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {formError}
            </div>
          ) : null}

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_220px] gap-4">
            <div>
              <FormFields form={createForm} setForm={setCreateForm} />
            </div>
            <aside className="space-y-3">
              <div className="rounded-xl border border-cad-border bg-cad-card/60 p-3">
                <p className="text-[10px] uppercase tracking-[0.16em] text-cad-muted">Quick Checks</p>
                <ul className="mt-2 space-y-2 text-xs text-cad-muted">
                  <li>Use `Court Listed` only when a court date is entered.</li>
                  <li>Vehicle plate is optional for non-vehicle infringements.</li>
                  <li>Due date usually defaults to 14 days for standard notices.</li>
                </ul>
              </div>
              <div className="rounded-xl border border-cad-border bg-cad-card/60 p-3">
                <p className="text-[10px] uppercase tracking-[0.16em] text-cad-muted">Live Summary</p>
                <div className="mt-2 space-y-1.5 text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="text-cad-muted">Subject</span>
                    <span className="text-cad-ink text-right truncate">{createForm.subject_name || createForm.citizen_id || '-'}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-cad-muted">Title</span>
                    <span className="text-cad-ink text-right truncate">{createForm.title || '-'}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-cad-muted">Amount</span>
                    <span className="text-cad-ink">{money(createForm.amount)}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-cad-muted">Due</span>
                    <span className="text-cad-ink">{createForm.due_date || '-'}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-cad-muted">Court</span>
                    <span className="text-cad-ink">{createForm.court_date || '-'}</span>
                  </div>
                </div>
              </div>
            </aside>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-md border border-cad-border bg-cad-surface">
              Cancel
            </button>
            <button type="submit" disabled={createSaving} className="px-4 py-2 rounded-md bg-cad-accent text-white font-medium disabled:opacity-50">
              {createSaving ? 'Creating...' : 'Create Notice'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDepartment } from '../../context/DepartmentContext';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';
import StatusBadge from '../../components/StatusBadge';
import Modal from '../../components/Modal';
import EvidencePanel from '../../components/EvidencePanel';
import { DEPARTMENT_LAYOUT, getDepartmentLayoutType } from '../../utils/departmentLayout';
import {
  BODY_REGION_OPTIONS,
  encodeFireDescription,
  encodeMedicalDescription,
  parseFireRecord,
  parseMedicalRecord,
} from '../../utils/incidentRecordFormat';
import {
  calculateSelectionTotal,
  calculateSelectionJailTotal,
  normalizeOffenceSelections,
  parseRecordOffenceItems,
} from '../../utils/offenceCatalog';
import { formatDateAU, formatDateTimeAU } from '../../utils/dateTime';

const EMPTY_NEW_FORM = {
  person_name: '',
  title: '',
  description: '',
  jail_minutes: 0,
};

const EMPTY_MEDICAL_FORM = {
  report_type: 'assessment',
  complaint: '',
  severity: 'minor',
  pain: 0,
  body_regions: [],
  treatment: '',
  transport_to: '',
  notes: '',
};

const EMPTY_FIRE_FORM = {
  incident_type: 'structure_fire',
  severity: 'moderate',
  action_taken: '',
  hazard_notes: '',
  suppression_used: '',
  casualties: 0,
  notes: '',
};

const MEDICAL_REPORT_TYPES = [
  { value: 'assessment', label: 'On-Scene Assessment' },
  { value: 'treatment', label: 'Treatment Update' },
  { value: 'transport', label: 'Transport / Handover' },
  { value: 'release', label: 'Refusal / Release' },
];

const FIRE_INCIDENT_TYPES = [
  { value: 'structure_fire', label: 'Structure Fire' },
  { value: 'vehicle_fire', label: 'Vehicle Fire' },
  { value: 'rescue', label: 'Rescue' },
  { value: 'hazmat', label: 'Hazmat' },
  { value: 'alarm', label: 'Alarm Activation' },
];

const SEVERITY_OPTIONS = [
  { value: 'minor', label: 'Minor' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'severe', label: 'Severe' },
  { value: 'critical', label: 'Critical' },
];

function mapRecordToEditForm(record) {
  const offenceItems = parseRecordOffenceItems(record);
  const offenceJailTotal = offenceItems.reduce(
    (sum, item) => sum + (Number(item.line_jail_minutes || (Number(item.jail_minutes || 0) * Number(item.quantity || 1))) || 0),
    0
  );
  const totalJailMinutes = Math.max(0, Number(record?.jail_minutes || 0));
  return {
    title: record?.title || '',
    description: record?.description || '',
    // When offences are attached, the edit form stores only "extra" jail time added on top.
    jail_minutes: Math.max(0, totalJailMinutes - Math.max(0, offenceJailTotal)),
  };
}

function normalizeArrestWorkflowStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized || normalized === 'pending') return 'draft';
  if (normalized === 'supervisor_review') return 'supervisor_review';
  if (normalized === 'finalized') return 'finalized';
  return 'draft';
}

function arrestWorkflowLabel(value) {
  const normalized = normalizeArrestWorkflowStatus(value);
  if (normalized === 'supervisor_review') return 'Supervisor Review';
  if (normalized === 'finalized') return 'Finalized';
  return 'Draft';
}

function arrestWorkflowPillClass(value) {
  const normalized = normalizeArrestWorkflowStatus(value);
  if (normalized === 'finalized') return 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300';
  if (normalized === 'supervisor_review') return 'border-orange-500/40 bg-orange-500/15 text-orange-300';
  return 'border-blue-500/40 bg-blue-500/15 text-blue-300';
}

function buildArrestReportExportPayload(record, person) {
  const offenceItems = parseRecordOffenceItems(record);
  const offenceFineTotal = offenceItems.reduce(
    (sum, item) => sum + (Number(item.line_total || (Number(item.fine_amount || 0) * Number(item.quantity || 1))) || 0),
    0
  );
  const offenceJailTotal = offenceItems.reduce(
    (sum, item) => sum + (Number(item.line_jail_minutes || (Number(item.jail_minutes || 0) * Number(item.quantity || 1))) || 0),
    0
  );
  return {
    format: 'victoria_police_arrest_report_v1',
    generated_at: new Date().toISOString(),
    arrest_report: {
      id: Number(record?.id || 0),
      workflow_status: normalizeArrestWorkflowStatus(record?.workflow_status),
      workflow_status_label: arrestWorkflowLabel(record?.workflow_status),
      title: String(record?.title || ''),
      notes: String(record?.description || ''),
      fine_amount_total: Number(record?.fine_amount || 0),
      jail_minutes_total: Number(record?.jail_minutes || 0),
      offence_fine_total: offenceFineTotal,
      offence_jail_total: offenceJailTotal,
      created_at: record?.created_at || null,
      finalized_record_id: Number(record?.finalized_record_id || 0) || null,
      finalized_at: record?.finalized_at || null,
    },
    subject: person ? {
      citizen_id: String(person?.citizenid || ''),
      first_name: String(person?.firstname || ''),
      last_name: String(person?.lastname || ''),
      full_name: `${String(person?.firstname || '').trim()} ${String(person?.lastname || '').trim()}`.trim(),
      birthdate: String(person?.birthdate || ''),
    } : null,
    filing_officer: {
      name: String(record?.officer_name || ''),
      callsign: String(record?.officer_callsign || ''),
    },
    charges: offenceItems.map((item) => ({
      offence_id: Number(item?.offence_id || 0) || null,
      code: String(item?.code || ''),
      title: String(item?.title || ''),
      quantity: Number(item?.quantity || 1),
      fine_amount_each: Number(item?.fine_amount || 0),
      jail_minutes_each: Number(item?.jail_minutes || 0),
      line_total: Number(item?.line_total || 0),
      line_jail_minutes: Number(item?.line_jail_minutes || 0),
    })),
  };
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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function toTitleCase(value) {
  const text = String(value || '').replace(/_/g, ' ').trim();
  if (!text) return '';
  return text
    .split(' ')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function buildMedicalTitle(form) {
  const reportType = toTitleCase(form.report_type || 'assessment');
  const complaint = String(form.complaint || '').trim();
  return complaint ? `${reportType} - ${complaint}` : `${reportType} - Patient Care`;
}

function buildFireTitle(form) {
  const incidentType = toTitleCase(form.incident_type || 'incident');
  const action = String(form.action_taken || '').trim();
  return action ? `${incidentType} - ${action}` : `${incidentType} - Fire Response`;
}

function toggleBodyRegion(selected, key) {
  if (selected.includes(key)) return selected.filter(item => item !== key);
  return [...selected, key];
}

function BodyRegionSelector({ selected, onChange }) {
  return (
    <div className="bg-cad-surface border border-cad-border rounded-lg p-3">
      <p className="text-xs text-cad-muted mb-2">
        Injury areas (Wasabi-friendly quick selector, no body diagram)
      </p>
      <div className="flex flex-wrap gap-2">
        {BODY_REGION_OPTIONS.map(region => {
          const active = selected.includes(region.key);
          return (
            <button
              key={region.key}
              type="button"
              onClick={() => onChange(toggleBodyRegion(selected, region.key))}
              className={`px-2 py-1 rounded text-xs border transition-colors ${
                active
                  ? 'bg-red-500/25 text-red-200 border-red-400/60'
                  : 'bg-cad-card text-cad-muted border-cad-border hover:text-cad-ink'
              }`}
            >
              {region.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MedicalFields({ form, setForm }) {
  return (
    <>
      <div className="bg-cad-surface border border-cad-border rounded-lg px-3 py-2">
        <p className="text-xs text-cad-muted uppercase tracking-wider">EMS Report Workflow</p>
        <p className="text-sm text-cad-ink mt-1">
          Wasabi Ambulance-friendly summary report. Use Treatment Log / Transport Tracker for live charting, then keep this report concise.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm text-cad-muted mb-1">Report Type</label>
          <select
            value={form.report_type}
            onChange={e => setForm(prev => ({ ...prev, report_type: e.target.value }))}
            className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
          >
            {MEDICAL_REPORT_TYPES.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm text-cad-muted mb-1">Severity</label>
          <select
            value={form.severity}
            onChange={e => setForm(prev => ({ ...prev, severity: e.target.value }))}
            className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
          >
            {SEVERITY_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-sm text-cad-muted mb-1">Chief Complaint / Scene Reason</label>
        <input
          type="text"
          value={form.complaint}
          onChange={e => setForm(prev => ({ ...prev, complaint: e.target.value }))}
          className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
          placeholder="e.g. GSW, MVA, unconscious person, chest pain"
        />
      </div>
      <div>
        <label className="block text-sm text-cad-muted mb-1">Pain Score (0-10)</label>
        <input
          type="number"
          min="0"
          max="10"
          value={form.pain}
          onChange={e => setForm(prev => ({ ...prev, pain: Math.max(0, Math.min(10, Number(e.target.value) || 0)) }))}
          className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
        />
      </div>
      <BodyRegionSelector
        selected={form.body_regions}
        onChange={next => setForm(prev => ({ ...prev, body_regions: next }))}
      />
      <div>
        <label className="block text-sm text-cad-muted mb-1">Treatment / Actions Taken</label>
        <input
          type="text"
          value={form.treatment}
          onChange={e => setForm(prev => ({ ...prev, treatment: e.target.value }))}
          className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
          placeholder="e.g. Bandage, CPR, revive, oxygen, splinting, medication"
        />
      </div>
      <div>
        <label className="block text-sm text-cad-muted mb-1">Transport Destination / Outcome</label>
        <input
          type="text"
          value={form.transport_to}
          onChange={e => setForm(prev => ({ ...prev, transport_to: e.target.value }))}
          className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
          placeholder="Hospital name, treated on scene, refusal, morgue, etc."
        />
      </div>
      <div>
        <label className="block text-sm text-cad-muted mb-1">Clinical / Handover Notes</label>
        <textarea
          value={form.notes}
          onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
          rows={3}
          className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent resize-none"
        />
      </div>
    </>
  );
}

function FireFields({ form, setForm }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm text-cad-muted mb-1">Incident Type</label>
          <select
            value={form.incident_type}
            onChange={e => setForm(prev => ({ ...prev, incident_type: e.target.value }))}
            className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
          >
            {FIRE_INCIDENT_TYPES.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm text-cad-muted mb-1">Severity</label>
          <select
            value={form.severity}
            onChange={e => setForm(prev => ({ ...prev, severity: e.target.value }))}
            className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
          >
            {SEVERITY_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-sm text-cad-muted mb-1">Action Taken</label>
        <input
          type="text"
          value={form.action_taken}
          onChange={e => setForm(prev => ({ ...prev, action_taken: e.target.value }))}
          className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
          placeholder="e.g. Suppressed room fire, extracted occupant"
        />
      </div>
      <div>
        <label className="block text-sm text-cad-muted mb-1">Hazard Notes</label>
        <input
          type="text"
          value={form.hazard_notes}
          onChange={e => setForm(prev => ({ ...prev, hazard_notes: e.target.value }))}
          className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
          placeholder="e.g. Gas leak risk, electrical hazard"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm text-cad-muted mb-1">Suppression Used</label>
          <input
            type="text"
            value={form.suppression_used}
            onChange={e => setForm(prev => ({ ...prev, suppression_used: e.target.value }))}
            className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
            placeholder="Foam, dry chem, hose line"
          />
        </div>
        <div>
          <label className="block text-sm text-cad-muted mb-1">Casualties</label>
          <input
            type="number"
            min="0"
            value={form.casualties}
            onChange={e => setForm(prev => ({ ...prev, casualties: Math.max(0, Number(e.target.value) || 0) }))}
            className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm text-cad-muted mb-1">Operational Notes</label>
        <textarea
          value={form.notes}
          onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
          rows={3}
          className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent resize-none"
        />
      </div>
    </>
  );
}

function upsertOffenceSelection(selection, offenceId, quantity) {
  const next = { ...(selection || {}) };
  const id = String(offenceId);
  if (!Number.isFinite(Number(quantity)) || Number(quantity) <= 0) {
    delete next[id];
    return next;
  }
  next[id] = Math.max(1, Math.min(20, Math.trunc(Number(quantity))));
  return next;
}

function tokenizeOffenceCode(code) {
  const text = String(code || '').trim().toUpperCase();
  if (!text) return [];
  const matches = text.match(/[A-Z]+|\d+/g);
  if (!matches) return [];
  return matches.map((part) => {
    if (/^\d+$/.test(part)) {
      return { type: 'number', value: Number(part) };
    }
    return { type: 'text', value: part };
  });
}

function compareOffenceCodes(aCode, bCode) {
  const aParts = tokenizeOffenceCode(aCode);
  const bParts = tokenizeOffenceCode(bCode);

  if (aParts.length === 0 && bParts.length === 0) return 0;
  if (aParts.length === 0) return 1;
  if (bParts.length === 0) return -1;

  const limit = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < limit; i += 1) {
    const a = aParts[i];
    const b = bParts[i];
    if (!a && !b) return 0;
    if (!a) return -1;
    if (!b) return 1;

    if (a.type === b.type) {
      if (a.value < b.value) return -1;
      if (a.value > b.value) return 1;
      continue;
    }

    if (a.type === 'text') return -1;
    return 1;
  }

  return 0;
}

function LawOffenceFields({ catalog, selection, setSelection, loading, totalFine, totalJailMinutes }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');

  const sortedCatalog = useMemo(() => {
    return [...catalog].sort((a, b) => {
      const codeDiff = compareOffenceCodes(a?.code, b?.code);
      if (codeDiff !== 0) return codeDiff;

      const sortDiff = Number(a?.sort_order || 0) - Number(b?.sort_order || 0);
      if (sortDiff !== 0) return sortDiff;

      return String(a?.title || '').localeCompare(String(b?.title || ''), undefined, { sensitivity: 'base' });
    });
  }, [catalog]);

  const filteredCatalog = useMemo(() => {
    const query = String(search || '').trim().toLowerCase();
    if (!query) return sortedCatalog;
    return sortedCatalog.filter((offence) => (
      String(offence?.code || '').toLowerCase().includes(query)
      || String(offence?.title || '').toLowerCase().includes(query)
      || String(offence?.description || '').toLowerCase().includes(query)
      || String(offence?.category || '').toLowerCase().includes(query)
    ));
  }, [sortedCatalog, search]);

  const selectedCount = useMemo(() => (
    Object.values(selection || {}).filter(qty => Number(qty) > 0).length
  ), [selection]);

  return (
    <>
      <div className="bg-cad-surface border border-cad-border rounded-lg p-3">
        <div className="flex items-center justify-between gap-2 mb-3">
          <p className="text-sm font-medium">Preset Offences</p>
          <div className="flex items-center gap-3">
            <p className="text-sm text-amber-300">Total Fine: ${Number(totalFine || 0).toLocaleString()}</p>
            <p className="text-sm text-rose-300">Total Jail: {Number(totalJailMinutes || 0).toLocaleString()} min</p>
            <button
              type="button"
              onClick={() => setPickerOpen(prev => !prev)}
              disabled={loading || catalog.length === 0}
              className="px-3 py-1 text-xs bg-cad-card border border-cad-border rounded hover:bg-cad-border transition-colors disabled:opacity-50"
            >
              {pickerOpen ? 'Hide Offences' : 'Search Offences'}
            </button>
          </div>
        </div>
        {loading ? (
          <p className="text-sm text-cad-muted">Loading offence catalog...</p>
        ) : catalog.length === 0 ? (
          <p className="text-sm text-cad-muted">
            No offences are configured yet. Ask an admin to add entries in Admin - Offence Catalog.
          </p>
        ) : !pickerOpen ? (
          <p className="text-xs text-cad-muted">
            {selectedCount > 0
              ? `${selectedCount} offence${selectedCount === 1 ? '' : 's'} selected. Click "Search Offences" to add or edit.`
              : 'Click "Search Offences" to find and add charges.'}
          </p>
        ) : (
          <div className="space-y-2">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
              placeholder="Search by code, title, description, or category"
            />
            {filteredCatalog.length === 0 ? (
              <p className="text-xs text-cad-muted">No offences match your search.</p>
            ) : (
              <div className="max-h-[40vh] overflow-y-auto pr-1 overscroll-contain">
                <div className="space-y-2">
                  {filteredCatalog.map(offence => {
                    const id = String(offence.id);
                    const selectedQty = Number(selection[id] || 0);
                    const checked = selectedQty > 0;
                    return (
                      <div key={offence.id} className="bg-cad-card border border-cad-border rounded p-2">
                        <div className="flex items-center justify-between gap-3">
                          <label className="flex items-center gap-2 min-w-0">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={e => setSelection(prev => (
                                e.target.checked
                                  ? upsertOffenceSelection(prev, offence.id, selectedQty || 1)
                                  : upsertOffenceSelection(prev, offence.id, 0)
                              ))}
                              className="rounded"
                            />
                            <span className="min-w-0">
                              <span className="text-sm font-medium">
                                {offence.code ? `${offence.code} - ` : ''}{offence.title}
                              </span>
                              {offence.description && (
                                <span className="block text-xs text-cad-muted truncate">{offence.description}</span>
                              )}
                            </span>
                          </label>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-amber-300">${Number(offence.fine_amount || 0).toLocaleString()}</span>
                            {Number(offence.jail_minutes || 0) > 0 && (
                              <span className="text-xs text-rose-300">{Number(offence.jail_minutes || 0)}m</span>
                            )}
                            {checked && (
                              <input
                                type="number"
                                min="1"
                                max="20"
                                value={selectedQty}
                                onChange={e => setSelection(prev => upsertOffenceSelection(prev, offence.id, Number(e.target.value) || 1))}
                                className="w-16 bg-cad-surface border border-cad-border rounded px-2 py-1 text-xs focus:outline-none focus:border-cad-accent"
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

export default function Records({ embeddedPerson = null, embeddedDepartmentId = null, hideHeader = false, mode = 'records' }) {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const { activeDepartment } = useDepartment();
  const layoutType = getDepartmentLayoutType(activeDepartment);
  const isLaw = layoutType === DEPARTMENT_LAYOUT.LAW_ENFORCEMENT;
  const isParamedics = layoutType === DEPARTMENT_LAYOUT.PARAMEDICS;
  const isFire = layoutType === DEPARTMENT_LAYOUT.FIRE;
  const isOpsLeanMode = isParamedics || isFire;
  const isArrestReportsMode = isLaw && String(mode || '').trim().toLowerCase() === 'arrest_reports';
  const isEmbedded = !!embeddedPerson;
  const effectiveDepartmentId = embeddedDepartmentId || activeDepartment?.id;
  const routeCitizenId = String(searchParams.get('citizen_id') || '').trim();

  const pageCopy = isLaw
    ? {
      title: 'Arrest Reports',
      newButton: 'New Arrest Report',
      newModalTitle: 'New Arrest Report',
      editModalTitle: 'Edit Arrest Report',
      searchPlaceholder: 'Search person by first or last name...',
      noRecords: 'No arrest reports found for this person',
      countNoun: 'arrest report(s)',
    }
    : isParamedics
      ? {
        title: 'Patient Reports',
        newButton: 'New Patient Report',
        newModalTitle: 'New Patient Care Report',
        editModalTitle: 'Edit Patient Report',
        searchPlaceholder: 'Search patient by first or last name...',
        noRecords: 'No patient reports found for this person',
        countNoun: 'report(s)',
      }
      : {
        title: 'Incident Reports',
        newButton: 'New Incident Report',
        newModalTitle: 'New Fire Incident Report',
        editModalTitle: 'Edit Incident Report',
        searchPlaceholder: 'Search occupant / contact by first or last name...',
        noRecords: 'No fire incident reports linked to this contact / occupant',
        countNoun: 'report(s)',
      };
  const opsWorkflowHint = isParamedics
    ? 'Search patient -> chart live updates in Treatment/Transport -> create/update report summary. Optimized for Wasabi Ambulance RP handoff.'
    : isFire
      ? 'Search occupant/contact -> select person -> create/update incident report. Use incidents for live coordination, reports for final documentation.'
      : '';

  const personAnchorLabel = isFire ? 'Reporting Contact / Occupant' : 'Person';
  const findPersonButtonLabel = isFire ? 'Find Contact / Occupant' : 'Find Person';
  const createSubmitLabel = isLaw
    ? 'Create Arrest Report'
    : isParamedics ? 'Create Patient Report' : 'Create Incident Report';

  const [personQuery, setPersonQuery] = useState('');
  const [personMatches, setPersonMatches] = useState([]);
  const [selectedPerson, setSelectedPerson] = useState(() => (embeddedPerson ? {
    ...embeddedPerson,
  } : null));
  const [records, setRecords] = useState([]);
  const [searching, setSearching] = useState(false);
  const [lookingUpPersons, setLookingUpPersons] = useState(false);

  const [showNew, setShowNew] = useState(false);
  const [creatingRecord, setCreatingRecord] = useState(false);
  const [newForm, setNewForm] = useState(EMPTY_NEW_FORM);
  const [newMedicalForm, setNewMedicalForm] = useState(EMPTY_MEDICAL_FORM);
  const [newFireForm, setNewFireForm] = useState(EMPTY_FIRE_FORM);

  const [showEdit, setShowEdit] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [editingSaving, setEditingSaving] = useState(false);
  const [editForm, setEditForm] = useState(mapRecordToEditForm(null));
  const [editMedicalForm, setEditMedicalForm] = useState(EMPTY_MEDICAL_FORM);
  const [editFireForm, setEditFireForm] = useState(EMPTY_FIRE_FORM);
  const [deletingRecordId, setDeletingRecordId] = useState(null);
  const [printingRecordId, setPrintingRecordId] = useState(null);
  const [finalizingRecordId, setFinalizingRecordId] = useState(null);
  const [submittingReviewRecordId, setSubmittingReviewRecordId] = useState(null);
  const [returningDraftRecordId, setReturningDraftRecordId] = useState(null);
  const [currentUnit, setCurrentUnit] = useState(null);
  const [offenceCatalog, setOffenceCatalog] = useState([]);
  const [loadingOffenceCatalog, setLoadingOffenceCatalog] = useState(false);
  const [newOffenceSelection, setNewOffenceSelection] = useState({});
  const [editOffenceSelection, setEditOffenceSelection] = useState({});

  const newOffenceItems = useMemo(
    () => normalizeOffenceSelections(newOffenceSelection),
    [newOffenceSelection]
  );
  const editOffenceItems = useMemo(
    () => normalizeOffenceSelections(editOffenceSelection),
    [editOffenceSelection]
  );
  const newFineTotal = useMemo(
    () => calculateSelectionTotal(offenceCatalog, newOffenceSelection),
    [offenceCatalog, newOffenceSelection]
  );
  const editFineTotal = useMemo(
    () => calculateSelectionTotal(offenceCatalog, editOffenceSelection),
    [offenceCatalog, editOffenceSelection]
  );
  const newJailTotal = useMemo(
    () => calculateSelectionJailTotal(offenceCatalog, newOffenceSelection),
    [offenceCatalog, newOffenceSelection]
  );
  const editJailTotal = useMemo(
    () => calculateSelectionJailTotal(offenceCatalog, editOffenceSelection),
    [offenceCatalog, editOffenceSelection]
  );
  const filingOfficerName = String(user?.steam_name || user?.email || 'Unknown Officer').trim() || 'Unknown Officer';
  const filingOfficerCallsign = String(currentUnit?.callsign || '').trim();
  const filingOfficerLabel = filingOfficerCallsign ? `${filingOfficerCallsign} - ${filingOfficerName}` : filingOfficerName;

  useEffect(() => {
    if (!isLaw) return;
    let cancelled = false;
    async function fetchOffenceCatalog() {
      setLoadingOffenceCatalog(true);
      try {
        const data = await api.get('/api/records/offence-catalog');
        if (!cancelled) {
          setOffenceCatalog(Array.isArray(data) ? data : []);
        }
      } catch {
        if (!cancelled) {
          setOffenceCatalog([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingOffenceCatalog(false);
        }
      }
    }
    fetchOffenceCatalog();
    return () => { cancelled = true; };
  }, [isLaw]);

  useEffect(() => {
    if (!isLaw) return;
    let cancelled = false;
    api.get('/api/units/me')
      .then((unit) => {
        if (!cancelled) setCurrentUnit(unit && typeof unit === 'object' ? unit : null);
      })
      .catch(() => {
        if (!cancelled) setCurrentUnit(null);
      });
    return () => { cancelled = true; };
  }, [isLaw]);

  useEffect(() => {
    if (!isEmbedded) return;

    const nextPerson = embeddedPerson && String(embeddedPerson.citizenid || '').trim()
      ? {
        ...embeddedPerson,
      }
      : null;

    setSelectedPerson(nextPerson);
    setPersonMatches([]);
    setPersonQuery('');
    setShowNew(false);
    setShowEdit(false);
    setEditingRecord(null);
    setNewOffenceSelection({});
    setEditOffenceSelection({});
    setNewMedicalForm(EMPTY_MEDICAL_FORM);
    setNewFireForm(EMPTY_FIRE_FORM);
    setEditMedicalForm(EMPTY_MEDICAL_FORM);
    setEditFireForm(EMPTY_FIRE_FORM);
    setEditForm(mapRecordToEditForm(null));

    if (!nextPerson) {
      setRecords([]);
      setNewForm(EMPTY_NEW_FORM);
      return;
    }

    setNewForm({
      ...EMPTY_NEW_FORM,
      person_name: `${nextPerson.firstname || ''} ${nextPerson.lastname || ''}`.trim(),
    });
    refreshSelectedPersonRecords(nextPerson.citizenid);
  }, [
    isEmbedded,
    embeddedPerson?.citizenid,
    embeddedPerson?.firstname,
    embeddedPerson?.lastname,
  ]);

  useEffect(() => {
    if (isEmbedded) return;
    if (!routeCitizenId) return;
    const selectedCid = String(selectedPerson?.citizenid || '').trim();
    if (selectedCid && selectedCid.toUpperCase() === routeCitizenId.toUpperCase()) return;

    let cancelled = false;
    async function loadPersonFromRoute() {
      try {
        let person = null;
        try {
          person = await api.get(`/api/search/persons/${encodeURIComponent(routeCitizenId)}`);
        } catch {
          person = await api.get(`/api/search/cad/persons/${encodeURIComponent(routeCitizenId)}`);
        }
        if (cancelled || !person) return;
        const normalized = {
          ...person,
          citizenid: String(person?.citizenid || routeCitizenId).trim(),
          firstname: String(person?.firstname || '').trim(),
          lastname: String(person?.lastname || '').trim(),
        };
        setSelectedPerson(normalized);
        setNewForm({
          ...EMPTY_NEW_FORM,
          person_name: `${normalized.firstname || ''} ${normalized.lastname || ''}`.trim(),
        });
        setNewOffenceSelection({});
        setEditOffenceSelection({});
        setShowEdit(false);
        setEditingRecord(null);
        await refreshSelectedPersonRecords(normalized.citizenid);
      } catch (err) {
        if (!cancelled) {
          alert('Failed to load selected person from URL: ' + (err?.message || 'Request failed'));
        }
      }
    }

    loadPersonFromRoute();
    return () => { cancelled = true; };
  }, [isEmbedded, routeCitizenId, selectedPerson?.citizenid]);

  async function refreshSelectedPersonRecords(citizenId) {
    if (!citizenId) {
      setRecords([]);
      return;
    }
    setSearching(true);
    try {
      const query = [
        `citizen_id=${encodeURIComponent(citizenId)}`,
        isLaw ? `mode=${encodeURIComponent(isArrestReportsMode ? 'arrest_reports' : 'records')}` : '',
      ].filter(Boolean).join('&');
      const data = await api.get(`/api/records?${query}`);
      setRecords(data);
    } catch (err) {
      alert('Failed to load records: ' + err.message);
    } finally {
      setSearching(false);
    }
  }

  async function searchPeople(e) {
    e.preventDefault();
    if (personQuery.trim().length < 2) return;
    setLookingUpPersons(true);
    try {
      const data = await api.get(`/api/search/persons?q=${encodeURIComponent(personQuery.trim())}`);
      setPersonMatches(data);
    } catch (err) {
      alert('Lookup failed: ' + err.message);
    } finally {
      setLookingUpPersons(false);
    }
  }

  async function selectPerson(person) {
    setSelectedPerson(person);
    setNewForm({
      ...EMPTY_NEW_FORM,
      person_name: `${person.firstname} ${person.lastname}`.trim(),
    });
    setNewOffenceSelection({});
    setNewMedicalForm(EMPTY_MEDICAL_FORM);
    setNewFireForm(EMPTY_FIRE_FORM);
    await refreshSelectedPersonRecords(person.citizenid);
  }

  async function createRecord(e) {
    e.preventDefault();
    if (!selectedPerson) {
      alert(isFire ? 'Select a reporting contact or occupant first' : 'Select a person first');
      return;
    }
    setCreatingRecord(true);
    try {
      let payload;
      if (isLaw) {
        if (newOffenceItems.length === 0) {
          alert('Select at least one offence from the preset list.');
          setCreatingRecord(false);
          return;
        }
        payload = {
          ...(isArrestReportsMode ? { type: 'arrest_report' } : {}),
          title: newForm.title,
          description: newForm.description,
          // Backend adds this value on top of offence-derived jail time.
          jail_minutes: Math.max(0, Math.trunc(Number(newForm.jail_minutes) || 0)),
          offence_items: newOffenceItems,
        };
      } else if (isParamedics) {
        const medical = {
          ...newMedicalForm,
          body_regions: Array.isArray(newMedicalForm.body_regions) ? newMedicalForm.body_regions : [],
        };
        payload = {
          type: 'warning',
          title: buildMedicalTitle(medical),
          description: encodeMedicalDescription(medical),
          fine_amount: 0,
        };
      } else {
        const fire = {
          ...newFireForm,
          casualties: Math.max(0, Number(newFireForm.casualties) || 0),
        };
        payload = {
          type: 'warning',
          title: buildFireTitle(fire),
          description: encodeFireDescription(fire),
          fine_amount: 0,
        };
      }

      await api.post('/api/records', {
        citizen_id: selectedPerson.citizenid,
        department_id: effectiveDepartmentId,
        ...payload,
      });
      setShowNew(false);
      await refreshSelectedPersonRecords(selectedPerson.citizenid);
      setNewForm({
        ...EMPTY_NEW_FORM,
        person_name: `${selectedPerson.firstname} ${selectedPerson.lastname}`.trim(),
      });
      setNewOffenceSelection({});
      setNewMedicalForm(EMPTY_MEDICAL_FORM);
      setNewFireForm(EMPTY_FIRE_FORM);
    } catch (err) {
      alert('Failed to create record: ' + err.message);
    } finally {
      setCreatingRecord(false);
    }
  }

  function openEdit(record) {
    setEditingRecord(record);
    if (isLaw) {
      setEditForm(mapRecordToEditForm(record));
      const parsedOffences = parseRecordOffenceItems(record);
      const nextSelection = {};
      for (const item of parsedOffences) {
        if (item.offence_id > 0) {
          nextSelection[String(item.offence_id)] = Math.max(1, Number(item.quantity || 1));
        }
      }
      setEditOffenceSelection(nextSelection);
    } else if (isParamedics) {
      const medical = parseMedicalRecord(record);
      setEditMedicalForm(medical
        ? { ...EMPTY_MEDICAL_FORM, ...medical }
        : {
          ...EMPTY_MEDICAL_FORM,
          complaint: record.title || '',
          notes: record.description || '',
        });
    } else {
      const fire = parseFireRecord(record);
      setEditFireForm(fire
        ? { ...EMPTY_FIRE_FORM, ...fire }
        : {
          ...EMPTY_FIRE_FORM,
          action_taken: record.title || '',
          notes: record.description || '',
        });
    }
    setShowEdit(true);
  }

  async function saveEdit(e) {
    e.preventDefault();
    if (!editingRecord) return;
    setEditingSaving(true);
    try {
      if (isLaw) {
        const previousOffenceItems = parseRecordOffenceItems(editingRecord);
        const lawPayload = {
          ...(isArrestReportsMode ? { type: 'arrest_report' } : {}),
          title: editForm.title,
          description: editForm.description,
          // Backend adds this value on top of offence-derived jail time.
          jail_minutes: Math.max(0, Math.trunc(Number(editForm.jail_minutes) || 0)),
        };
        if (editOffenceItems.length > 0) {
          lawPayload.offence_items = editOffenceItems;
        } else if (previousOffenceItems.length > 0) {
          lawPayload.offence_items = [];
        }
        await api.patch(`/api/records/${editingRecord.id}`, lawPayload);
      } else if (isParamedics) {
        const medical = {
          ...editMedicalForm,
          body_regions: Array.isArray(editMedicalForm.body_regions) ? editMedicalForm.body_regions : [],
        };
        await api.patch(`/api/records/${editingRecord.id}`, {
          type: 'warning',
          title: buildMedicalTitle(medical),
          description: encodeMedicalDescription(medical),
          fine_amount: 0,
        });
      } else {
        const fire = {
          ...editFireForm,
          casualties: Math.max(0, Number(editFireForm.casualties) || 0),
        };
        await api.patch(`/api/records/${editingRecord.id}`, {
          type: 'warning',
          title: buildFireTitle(fire),
          description: encodeFireDescription(fire),
          fine_amount: 0,
        });
      }
      setShowEdit(false);
      setEditingRecord(null);
      if (selectedPerson?.citizenid) {
        await refreshSelectedPersonRecords(selectedPerson.citizenid);
      }
    } catch (err) {
      alert('Failed to update record: ' + err.message);
    } finally {
      setEditingSaving(false);
    }
  }

  async function deleteRecord(record) {
    if (!record?.id) return;
    const ok = confirm(`Delete record #${record.id} (${record.title})?`);
    if (!ok) return;
    setDeletingRecordId(record.id);
    try {
      await api.delete(`/api/records/${record.id}`);
      if (showEdit && editingRecord?.id === record.id) {
        setShowEdit(false);
        setEditingRecord(null);
      }
      if (selectedPerson?.citizenid) {
        await refreshSelectedPersonRecords(selectedPerson.citizenid);
      }
    } catch (err) {
      alert('Failed to delete record: ' + err.message);
    } finally {
      setDeletingRecordId(null);
    }
  }

  async function printRecordInGame(record) {
    if (!record?.id) return;
    const recordType = String(record.type || '').trim().toLowerCase();
    if (!['fine', 'warning'].includes(recordType)) return;

    const subjectName = `${String(selectedPerson?.firstname || '').trim()} ${String(selectedPerson?.lastname || '').trim()}`.trim();
    setPrintingRecordId(record.id);
    try {
      await api.post(`/api/records/${record.id}/print`, {
        person_name: subjectName || String(record.citizen_id || '').trim(),
      });
      alert(`${recordType === 'fine' ? 'Ticket' : 'Warning'} sent to in-game printer queue.`);
    } catch (err) {
      alert('Failed to send print job: ' + err.message);
    } finally {
      setPrintingRecordId(null);
    }
  }

  async function finalizeArrestReport(record) {
    if (!record?.id) return;
    if (normalizeArrestWorkflowStatus(record.workflow_status) === 'finalized') return;
    const ok = confirm(`Finalize arrest report #${record.id}? This will apply fines/jail from the selected charges.`);
    if (!ok) return;
    setFinalizingRecordId(record.id);
    try {
      await api.post(`/api/records/${record.id}/finalize-arrest-report`, {});
      if (selectedPerson?.citizenid) {
        await refreshSelectedPersonRecords(selectedPerson.citizenid);
      }
    } catch (err) {
      alert('Failed to finalize arrest report: ' + err.message);
    } finally {
      setFinalizingRecordId(null);
    }
  }

  async function submitArrestReportForReview(record) {
    if (!record?.id) return;
    const status = normalizeArrestWorkflowStatus(record.workflow_status);
    if (status === 'supervisor_review' || status === 'finalized') return;
    setSubmittingReviewRecordId(record.id);
    try {
      await api.post(`/api/records/${record.id}/submit-arrest-report-review`, {});
      if (selectedPerson?.citizenid) {
        await refreshSelectedPersonRecords(selectedPerson.citizenid);
      }
    } catch (err) {
      alert('Failed to submit arrest report for supervisor review: ' + err.message);
    } finally {
      setSubmittingReviewRecordId(null);
    }
  }

  async function returnArrestReportToDraft(record) {
    if (!record?.id) return;
    if (normalizeArrestWorkflowStatus(record.workflow_status) === 'finalized') return;
    setReturningDraftRecordId(record.id);
    try {
      await api.post(`/api/records/${record.id}/return-arrest-report-draft`, {});
      if (selectedPerson?.citizenid) {
        await refreshSelectedPersonRecords(selectedPerson.citizenid);
      }
    } catch (err) {
      alert('Failed to return arrest report to draft: ' + err.message);
    } finally {
      setReturningDraftRecordId(null);
    }
  }

  function exportArrestReport(record) {
    if (!record || String(record.type || '') !== 'arrest_report') return;
    const payload = buildArrestReportExportPayload(record, selectedPerson);
    const cid = String(selectedPerson?.citizenid || 'unknown').trim() || 'unknown';
    downloadJson(`victoria-police-arrest-report-${cid}-${record.id}.json`, payload);
  }

  function printArrestReport(record) {
    if (!record || String(record.type || '') !== 'arrest_report') return;
    const payload = buildArrestReportExportPayload(record, selectedPerson);
    const chargesRows = payload.charges.length > 0
      ? payload.charges.map((charge) => `
          <tr>
            <td>${escapeHtml(charge.code || '-')}</td>
            <td>${escapeHtml(charge.title || '-')}</td>
            <td>${escapeHtml(String(charge.quantity || 1))}</td>
            <td>$${Number(charge.fine_amount_each || 0).toLocaleString()}</td>
            <td>${Number(charge.jail_minutes_each || 0)} min</td>
          </tr>
        `).join('')
      : `<tr><td colspan="5">No charges attached</td></tr>`;
    const officer = payload.filing_officer?.callsign
      ? `${payload.filing_officer.callsign} - ${payload.filing_officer.name || ''}`.trim()
      : (payload.filing_officer?.name || '-');
    const subjectName = payload.subject?.full_name || payload.subject?.citizen_id || 'Unknown Person';
    const subjectCid = payload.subject?.citizen_id || '-';
    const html = `<!doctype html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Victoria Police Arrest Report #${payload.arrest_report.id}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
          .header { border-bottom: 3px solid #0a2f6b; padding-bottom: 12px; margin-bottom: 18px; }
          .brand { color: #0a2f6b; font-weight: 800; font-size: 24px; }
          .sub { color: #b56d00; font-weight: 700; margin-top: 4px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
          .card { border: 1px solid #d1d5db; border-radius: 8px; padding: 10px 12px; }
          .label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: .06em; }
          .value { margin-top: 4px; font-weight: 600; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; font-size: 12px; vertical-align: top; }
          th { background: #f3f4f6; }
          .notes { white-space: pre-wrap; }
          .footer { margin-top: 16px; font-size: 11px; color: #6b7280; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="brand">Victoria Police</div>
          <div class="sub">Arrest Report</div>
        </div>
        <div class="grid">
          <div class="card"><div class="label">Report</div><div class="value">#${payload.arrest_report.id} | ${escapeHtml(payload.arrest_report.workflow_status_label)}</div></div>
          <div class="card"><div class="label">Filed By</div><div class="value">${escapeHtml(officer)}</div></div>
          <div class="card"><div class="label">Subject</div><div class="value">${escapeHtml(subjectName)} (${escapeHtml(subjectCid)})</div></div>
          <div class="card"><div class="label">Created</div><div class="value">${escapeHtml(formatDateTimeAU(payload.arrest_report.created_at ? `${payload.arrest_report.created_at}Z` : '', '-'))}</div></div>
        </div>
        <div class="card">
          <div class="label">Case Title</div>
          <div class="value">${escapeHtml(payload.arrest_report.title || '-')}</div>
          <div class="label" style="margin-top:10px;">Notes</div>
          <div class="value notes">${escapeHtml(payload.arrest_report.notes || '-')}</div>
        </div>
        <table>
          <thead>
            <tr><th>Code</th><th>Charge</th><th>Qty</th><th>Fine Each</th><th>Jail Each</th></tr>
          </thead>
          <tbody>${chargesRows}</tbody>
        </table>
        <div class="grid" style="margin-top: 12px;">
          <div class="card"><div class="label">Total Fine</div><div class="value">$${Number(payload.arrest_report.fine_amount_total || 0).toLocaleString()}</div></div>
          <div class="card"><div class="label">Total Jail</div><div class="value">${Number(payload.arrest_report.jail_minutes_total || 0).toLocaleString()} minute(s)</div></div>
        </div>
        <div class="footer">Generated by CAD for Victoria Police workflow.</div>
        <script>window.onload = () => window.print();</script>
      </body>
      </html>`;
    const win = window.open('', '_blank', 'noopener,noreferrer,width=960,height=720');
    if (!win) {
      alert('Popup blocked. Please allow popups to print the arrest report.');
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  return (
    <div>
      <div className={`flex items-center justify-between ${hideHeader ? 'mb-3' : 'mb-6'}`}>
        <div>
          {hideHeader ? (
            <h3 className="text-lg font-semibold">{pageCopy.title}</h3>
          ) : (
            <h2 className="text-xl font-bold">{pageCopy.title}</h2>
          )}
          {!hideHeader && isOpsLeanMode && (
            <p className="text-sm text-cad-muted mt-1">{opsWorkflowHint}</p>
          )}
        </div>
        <button
          onClick={() => setShowNew(true)}
          disabled={!selectedPerson}
          className="px-4 py-2 bg-cad-accent hover:bg-cad-accent-light text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        >
          + {hideHeader ? 'New' : pageCopy.newButton}
        </button>
      </div>

      {!isEmbedded && (
        <div className="bg-cad-card border border-cad-border rounded-2xl p-4 mb-6">
          {isOpsLeanMode && (
            <div className="mb-3 rounded-lg border border-cad-border bg-cad-surface px-3 py-2">
              <p className="text-xs text-cad-muted">
                {isFire
                  ? 'Fire incident reports are linked to a person (occupant, owner, or reporting contact) for searchability. Use the Incidents page for live incident coordination and evidence.'
                  : 'Patient reports are person-linked for quick lookup and treatment/transport handoff continuity.'}
              </p>
            </div>
          )}
          <form onSubmit={searchPeople} className="flex flex-col md:flex-row gap-3">
            <input
              type="text"
              value={personQuery}
              onChange={e => setPersonQuery(e.target.value)}
              placeholder={pageCopy.searchPlaceholder}
              className="flex-1 bg-cad-surface border border-cad-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
            />
            <button
              type="submit"
              disabled={lookingUpPersons || personQuery.trim().length < 2}
              className="px-6 py-2 bg-cad-accent hover:bg-cad-accent-light text-white rounded text-sm font-medium transition-colors disabled:opacity-50"
            >
              {lookingUpPersons ? 'Searching...' : findPersonButtonLabel}
            </button>
          </form>

          {personMatches.length > 0 && (
            <div className="mt-3 border border-cad-border rounded-lg overflow-hidden">
              {personMatches.slice(0, 8).map((p, idx) => (
                <button
                  key={`${p.citizenid}-${idx}`}
                  onClick={() => selectPerson(p)}
                  className="w-full text-left px-3 py-2 bg-cad-surface hover:bg-cad-card transition-colors border-b border-cad-border/60 last:border-b-0"
                >
                  <span className="font-medium">{p.firstname} {p.lastname}</span>
                  <span className="text-xs text-cad-muted ml-2">{formatDateAU(p.birthdate, 'Unknown DOB')}</span>
                </button>
              ))}
            </div>
          )}

          {selectedPerson && (
            <div className="mt-3 flex items-center justify-between gap-2 text-sm text-cad-muted">
              <div>
                {isFire ? 'Selected Contact / Occupant:' : 'Selected:'}{' '}
                <span className="text-cad-ink font-medium">{selectedPerson.firstname} {selectedPerson.lastname}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedPerson(null);
                  setRecords([]);
                  setShowEdit(false);
                  setEditingRecord(null);
                  setNewOffenceSelection({});
                  setEditOffenceSelection({});
                }}
                className="px-2 py-1 text-xs bg-cad-surface border border-cad-border rounded hover:bg-cad-card transition-colors"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}

      {isEmbedded && selectedPerson && (
        <div className="mb-3 text-sm text-cad-muted">
          {isFire ? 'Managing incident reports linked to ' : 'Managing records for '}
          <span className="text-cad-ink font-medium">
            {selectedPerson.firstname} {selectedPerson.lastname}
          </span>
        </div>
      )}

      {isEmbedded && !selectedPerson && (
        <p className="text-sm text-cad-muted py-3">
          {isFire
            ? 'Search and select a reporting contact or occupant to manage linked incident reports.'
            : 'Search and select a person to manage their records.'}
        </p>
      )}

      {records.length > 0 && (
        <div className="space-y-3">
          <div className="text-sm text-cad-muted">
            {isOpsLeanMode
              ? `${records.length} report(s) for ${selectedPerson?.firstname} ${selectedPerson?.lastname}`
              : `${records.length} ${pageCopy.countNoun} ${isFire ? 'linked to' : 'for'} ${selectedPerson?.firstname} ${selectedPerson?.lastname}`}
          </div>
          {records.map(r => {
            const medical = parseMedicalRecord(r);
            const fire = parseFireRecord(r);
            const offenceItems = parseRecordOffenceItems(r);
            const arrestWorkflowStatus = normalizeArrestWorkflowStatus(r.workflow_status);
            const isArrestReport = isLaw && String(r.type || '') === 'arrest_report';
            const canFinalizeArrestReport = isArrestReport && arrestWorkflowStatus === 'supervisor_review';
            const offenceTotal = offenceItems.reduce(
              (sum, item) => sum + (Number(item.line_total || (item.fine_amount * item.quantity)) || 0),
              0
            );
            const offenceJailTotal = offenceItems.reduce(
              (sum, item) => sum + (Number(item.line_jail_minutes || (item.jail_minutes * item.quantity)) || 0),
              0
            );
            return (
            <div key={r.id} className="bg-cad-card border border-cad-border rounded-lg p-4">
              <div className="flex items-start justify-between mb-2 gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <StatusBadge status={r.type} />
                  {isArrestReport && (
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded border ${arrestWorkflowPillClass(arrestWorkflowStatus)}`}
                    >
                      {arrestWorkflowLabel(arrestWorkflowStatus)}
                    </span>
                  )}
                  <span className="font-medium">{r.title}</span>
                  {medical && (
                    <span className="text-[11px] px-2 py-0.5 rounded border border-cyan-500/40 bg-cyan-500/15 text-cyan-300">
                      Medical Report
                    </span>
                  )}
                  {fire && (
                    <span className="text-[11px] px-2 py-0.5 rounded border border-orange-500/40 bg-orange-500/15 text-orange-300">
                      Fire Report
                    </span>
                  )}
                  {offenceItems.length > 0 && (
                    <span className="text-[11px] px-2 py-0.5 rounded border border-amber-500/40 bg-amber-500/15 text-amber-300">
                      Offence Set ({offenceItems.length})
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {isArrestReport && arrestWorkflowStatus === 'draft' && (
                    <button
                      type="button"
                      onClick={() => submitArrestReportForReview(r)}
                      disabled={submittingReviewRecordId === r.id}
                      className="px-2 py-1 text-xs bg-orange-500/10 text-orange-300 border border-orange-500/30 rounded hover:bg-orange-500/20 transition-colors disabled:opacity-50"
                    >
                      {submittingReviewRecordId === r.id ? 'Submitting...' : 'Submit Review'}
                    </button>
                  )}
                  {isArrestReport && arrestWorkflowStatus === 'supervisor_review' && (
                    <button
                      type="button"
                      onClick={() => returnArrestReportToDraft(r)}
                      disabled={returningDraftRecordId === r.id}
                      className="px-2 py-1 text-xs bg-blue-500/10 text-blue-300 border border-blue-500/30 rounded hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                    >
                      {returningDraftRecordId === r.id ? 'Returning...' : 'Return Draft'}
                    </button>
                  )}
                  {canFinalizeArrestReport && (
                    <button
                      type="button"
                      onClick={() => finalizeArrestReport(r)}
                      disabled={finalizingRecordId === r.id}
                      className="px-2 py-1 text-xs bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 rounded hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                    >
                      {finalizingRecordId === r.id ? 'Finalizing...' : 'Finalize'}
                    </button>
                  )}
                  {isArrestReport && (
                    <>
                      <button
                        type="button"
                        onClick={() => printArrestReport(r)}
                        className="px-2 py-1 text-xs bg-cad-surface border border-cad-border rounded hover:bg-cad-card transition-colors"
                      >
                        Print
                      </button>
                      <button
                        type="button"
                        onClick={() => exportArrestReport(r)}
                        className="px-2 py-1 text-xs bg-cad-surface border border-cad-border rounded hover:bg-cad-card transition-colors"
                      >
                        Export
                      </button>
                    </>
                  )}
                  {isLaw && !isArrestReport && (String(r.type || '').toLowerCase() === 'fine' || String(r.type || '').toLowerCase() === 'warning') && (
                    <button
                      type="button"
                      onClick={() => printRecordInGame(r)}
                      disabled={printingRecordId === r.id}
                      className="px-2 py-1 text-xs bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 rounded hover:bg-indigo-500/20 transition-colors disabled:opacity-50"
                    >
                      {printingRecordId === r.id ? 'Printing...' : (String(r.type || '').toLowerCase() === 'fine' ? 'Print Ticket' : 'Print Warning')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => openEdit(r)}
                    disabled={isArrestReport && arrestWorkflowStatus === 'finalized'}
                    className="px-2 py-1 text-xs bg-cad-surface border border-cad-border rounded hover:bg-cad-card transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteRecord(r)}
                    disabled={deletingRecordId === r.id}
                    className="px-2 py-1 text-xs bg-red-500/10 text-red-400 border border-red-500/30 rounded hover:bg-red-500/20 transition-colors disabled:opacity-50"
                  >
                    {deletingRecordId === r.id ? 'Deleting...' : 'Delete'}
                  </button>
                  <span className="text-xs text-cad-muted">#{r.id}</span>
                </div>
              </div>
              {medical ? (
                <div className="space-y-2 text-sm">
                  <p className="text-cad-muted">
                    Severity: <span className="text-cad-ink">{toTitleCase(medical.severity)}</span> | Pain: <span className="text-cad-ink">{medical.pain}/10</span>
                  </p>
                  {medical.body_regions.length > 0 && (
                    <p className="text-cad-muted">
                      Injuries: <span className="text-cad-ink">{medical.body_regions.map(region => BODY_REGION_OPTIONS.find(option => option.key === region)?.label || region).join(', ')}</span>
                    </p>
                  )}
                  {medical.treatment && <p className="text-cad-muted">Treatment: <span className="text-cad-ink">{medical.treatment}</span></p>}
                  {medical.transport_to && <p className="text-cad-muted">Transport: <span className="text-cad-ink">{medical.transport_to}</span></p>}
                  {medical.notes && <p className="text-cad-muted">Notes: <span className="text-cad-ink">{medical.notes}</span></p>}
                </div>
              ) : fire ? (
                <div className="space-y-2 text-sm">
                  <p className="text-cad-muted">
                    Type: <span className="text-cad-ink">{toTitleCase(fire.incident_type)}</span> | Severity: <span className="text-cad-ink">{toTitleCase(fire.severity)}</span>
                  </p>
                  {fire.hazard_notes && <p className="text-cad-muted">Hazards: <span className="text-cad-ink">{fire.hazard_notes}</span></p>}
                  {fire.suppression_used && <p className="text-cad-muted">Suppression: <span className="text-cad-ink">{fire.suppression_used}</span></p>}
                  <p className="text-cad-muted">Casualties: <span className="text-cad-ink">{Number(fire.casualties || 0)}</span></p>
                  {fire.notes && <p className="text-cad-muted">Notes: <span className="text-cad-ink">{fire.notes}</span></p>}
                </div>
              ) : offenceItems.length > 0 ? (
                <div className="space-y-2 text-sm">
                  <div className="space-y-1">
                    {offenceItems.map((item, idx) => (
                      <p key={`${r.id}-offence-${idx}`} className="text-cad-muted">
                        <span className="text-cad-ink font-medium">{item.quantity}x</span>{' '}
                        {item.code ? <span className="text-cad-ink">{item.code} - {item.title}</span> : <span className="text-cad-ink">{item.title}</span>}
                        {Number(item.fine_amount || 0) > 0 && (
                          <span className="text-amber-300"> (${Number(item.fine_amount).toLocaleString()} each)</span>
                        )}
                        {Number(item.jail_minutes || 0) > 0 && (
                          <span className="text-rose-300"> ({Number(item.jail_minutes || 0)} min each)</span>
                        )}
                      </p>
                    ))}
                  </div>
                  <p className="text-amber-400">
                    {isArrestReport && arrestWorkflowStatus !== 'finalized' ? 'Pending Fine' : 'Total Fine'}: ${Number(offenceTotal || 0).toLocaleString()}
                  </p>
                  {Number(offenceJailTotal || 0) > 0 && (
                    <p className="text-rose-300">
                      {isArrestReport && arrestWorkflowStatus !== 'finalized' ? 'Pending Offence Jail Total' : 'Offence Jail Total'}: {Number(offenceJailTotal || 0).toLocaleString()} minute(s)
                    </p>
                  )}
                  {Number(r.jail_minutes || 0) > 0 && (
                    <p className="text-rose-300">
                      {isArrestReport && arrestWorkflowStatus !== 'finalized' ? 'Pending Jail' : 'Jail'}: {Number(r.jail_minutes || 0).toLocaleString()} minute(s)
                    </p>
                  )}
                  {isArrestReport && Number(r.finalized_record_id || 0) > 0 && (
                    <p className="text-emerald-300">Finalized Record: #{Number(r.finalized_record_id || 0)}</p>
                  )}
                  {r.description && (
                    <p className="text-cad-muted">Notes: <span className="text-cad-ink">{r.description}</span></p>
                  )}
                </div>
              ) : (
                <>
                  {r.description && <p className="text-sm text-cad-muted mb-2">{r.description}</p>}
                  {r.type === 'fine' && Number(r.fine_amount || 0) > 0 && (
                    <p className="text-sm text-amber-400 mb-2">Fine: ${Number(r.fine_amount).toLocaleString()}</p>
                  )}
                  {Number(r.jail_minutes || 0) > 0 && (
                    <p className="text-sm text-rose-300 mb-2">Jail: {Number(r.jail_minutes || 0).toLocaleString()} minute(s)</p>
                  )}
                </>
              )}
              <div className="flex items-center justify-between text-xs text-cad-muted">
                <span>
                  {r.officer_callsign && `${r.officer_callsign} - `}{r.officer_name}
                </span>
                <span>{formatDateTimeAU(r.created_at ? `${r.created_at}Z` : '', '-')}</span>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {records.length === 0 && selectedPerson && !searching && (
        <p className="text-center text-cad-muted py-8">{pageCopy.noRecords}</p>
      )}

      <Modal open={showNew} onClose={() => setShowNew(false)} title={pageCopy.newModalTitle}>
        <form onSubmit={createRecord} className="space-y-3">
          {isOpsLeanMode && (
            <div className="bg-cad-surface border border-cad-border rounded-lg px-3 py-2">
              <p className="text-xs text-cad-muted uppercase tracking-wider">Report Entry</p>
              <p className="text-sm text-cad-ink mt-1">
                {isParamedics
                  ? 'Log only treatment/transport-relevant facts. Avoid duplicate details already stored in the incident.'
                  : 'Log outcome, hazards, and actions taken. Avoid duplicating live dispatch chatter.'}
              </p>
            </div>
          )}
          <div>
            <label className="block text-sm text-cad-muted mb-1">{personAnchorLabel} *</label>
            <input
              type="text"
              required
              value={`${selectedPerson?.firstname || ''} ${selectedPerson?.lastname || ''}`.trim()}
              readOnly
              className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm text-cad-ink"
              placeholder={isFire ? 'Select a reporting contact or occupant from lookup' : 'Select a person from lookup'}
            />
          </div>
          {isLaw ? (
            <>
              <div className="bg-cad-surface border border-cad-border rounded-lg px-3 py-2">
                <p className="text-xs text-cad-muted uppercase tracking-wider">Filing Officer</p>
                <p className="text-sm text-cad-ink font-medium mt-1">{filingOfficerLabel}</p>
                {isArrestReportsMode && (
                  <p className="text-xs text-blue-300 mt-1">
                    Victoria Police workflow: Draft {'->'} Supervisor Review {'->'} Finalize. Charges and sentencing stay pending until finalization.
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm text-cad-muted mb-1">Case Title (optional)</label>
                <input
                  type="text"
                  value={newForm.title}
                  onChange={e => setNewForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
                  placeholder="Auto-generated from selected offences if left blank"
                />
              </div>
              <div>
                <label className="block text-sm text-cad-muted mb-1">Notes</label>
                <textarea
                  value={newForm.description}
                  onChange={e => setNewForm(f => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent resize-none"
                />
              </div>
              <div>
                <label className="block text-sm text-cad-muted mb-1">
                  {newJailTotal > 0 ? 'Extra Jail Minutes' : 'Jail Minutes'}
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={newForm.jail_minutes}
                  onChange={e => setNewForm(f => ({ ...f, jail_minutes: Math.max(0, Number(e.target.value) || 0) }))}
                  className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
                />
                {newJailTotal > 0 && (
                  <p className="mt-1 text-xs text-rose-300">
                    Selected offences add {Number(newJailTotal || 0).toLocaleString()} minute(s) automatically.
                    Extra time entered here is added on top. Total sentence: {Number((newJailTotal || 0) + (Number(newForm.jail_minutes || 0) || 0)).toLocaleString()} minute(s).
                  </p>
                )}
              </div>
              <LawOffenceFields
                catalog={offenceCatalog}
                selection={newOffenceSelection}
                setSelection={setNewOffenceSelection}
                loading={loadingOffenceCatalog}
                totalFine={newFineTotal}
                totalJailMinutes={newJailTotal}
              />
            </>
          ) : isParamedics ? (
            <MedicalFields form={newMedicalForm} setForm={setNewMedicalForm} />
          ) : (
            <FireFields form={newFireForm} setForm={setNewFireForm} />
          )}
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={
                creatingRecord ||
                (isLaw && (loadingOffenceCatalog || offenceCatalog.length === 0 || newOffenceItems.length === 0))
              }
              className="flex-1 px-4 py-2 bg-cad-accent hover:bg-cad-accent-light text-white rounded text-sm font-medium transition-colors disabled:opacity-50"
            >
              {creatingRecord ? 'Creating...' : createSubmitLabel}
            </button>
            <button
              type="button"
              onClick={() => setShowNew(false)}
              className="px-4 py-2 bg-cad-card hover:bg-cad-border text-cad-muted rounded text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={showEdit} onClose={() => setShowEdit(false)} title={`${pageCopy.editModalTitle} #${editingRecord?.id || ''}`}>
        <form onSubmit={saveEdit} className="space-y-3">
          {isOpsLeanMode && editingRecord?.id ? (
            <div className="bg-cad-surface border border-cad-border rounded-lg px-3 py-2">
              <p className="text-xs text-cad-muted uppercase tracking-wider">Editing Report</p>
              <p className="text-sm text-cad-ink mt-1">
                {isParamedics ? 'Update treatment/transport details and handoff notes only.' : 'Update incident outcome details and hazards only.'}
              </p>
            </div>
          ) : null}
          {isLaw ? (
            <>
              <div className="bg-cad-surface border border-cad-border rounded-lg px-3 py-2">
                <p className="text-xs text-cad-muted uppercase tracking-wider">
                  {String(editingRecord?.officer_name || '').trim() || String(editingRecord?.officer_callsign || '').trim()
                    ? 'Filed By'
                    : 'Filing Officer'}
                </p>
                <p className="text-sm text-cad-ink font-medium mt-1">
                  {editingRecord?.officer_callsign ? `${editingRecord.officer_callsign} - ` : ''}{editingRecord?.officer_name || filingOfficerLabel}
                </p>
                {isArrestReportsMode && normalizeArrestWorkflowStatus(editingRecord?.workflow_status) === 'finalized' && (
                  <p className="text-xs text-emerald-300 mt-1">
                    This arrest report has been finalized. Edit the finalized record for charge/fine changes.
                  </p>
                )}
                {isArrestReportsMode && editingRecord?.id && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className={`text-[11px] px-2 py-0.5 rounded border ${arrestWorkflowPillClass(editingRecord?.workflow_status)}`}>
                      {arrestWorkflowLabel(editingRecord?.workflow_status)}
                    </span>
                    <button
                      type="button"
                      onClick={() => printArrestReport(editingRecord)}
                      className="px-2 py-1 text-xs bg-cad-card border border-cad-border rounded hover:bg-cad-border transition-colors"
                    >
                      Print
                    </button>
                    <button
                      type="button"
                      onClick={() => exportArrestReport(editingRecord)}
                      className="px-2 py-1 text-xs bg-cad-card border border-cad-border rounded hover:bg-cad-border transition-colors"
                    >
                      Export
                    </button>
                    {normalizeArrestWorkflowStatus(editingRecord?.workflow_status) === 'draft' && (
                      <button
                        type="button"
                        onClick={() => submitArrestReportForReview(editingRecord)}
                        disabled={submittingReviewRecordId === editingRecord.id}
                        className="px-2 py-1 text-xs bg-orange-500/10 text-orange-300 border border-orange-500/30 rounded hover:bg-orange-500/20 transition-colors disabled:opacity-50"
                      >
                        {submittingReviewRecordId === editingRecord.id ? 'Submitting...' : 'Submit Review'}
                      </button>
                    )}
                    {normalizeArrestWorkflowStatus(editingRecord?.workflow_status) === 'supervisor_review' && (
                      <>
                        <button
                          type="button"
                          onClick={() => returnArrestReportToDraft(editingRecord)}
                          disabled={returningDraftRecordId === editingRecord.id}
                          className="px-2 py-1 text-xs bg-blue-500/10 text-blue-300 border border-blue-500/30 rounded hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                        >
                          {returningDraftRecordId === editingRecord.id ? 'Returning...' : 'Return Draft'}
                        </button>
                        <button
                          type="button"
                          onClick={() => finalizeArrestReport(editingRecord)}
                          disabled={finalizingRecordId === editingRecord.id}
                          className="px-2 py-1 text-xs bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 rounded hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                        >
                          {finalizingRecordId === editingRecord.id ? 'Finalizing...' : 'Finalize'}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm text-cad-muted mb-1">Case Title (optional)</label>
                <input
                  type="text"
                  value={editForm.title}
                  onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
                />
              </div>
              <div>
                <label className="block text-sm text-cad-muted mb-1">Notes</label>
                <textarea
                  value={editForm.description}
                  onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent resize-none"
                />
              </div>
              <div>
                <label className="block text-sm text-cad-muted mb-1">
                  {editJailTotal > 0 ? 'Extra Jail Minutes' : 'Jail Minutes'}
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={editForm.jail_minutes}
                  onChange={e => setEditForm(f => ({ ...f, jail_minutes: Math.max(0, Number(e.target.value) || 0) }))}
                  className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
                />
                {editJailTotal > 0 && (
                  <p className="mt-1 text-xs text-rose-300">
                    Selected offences add {Number(editJailTotal || 0).toLocaleString()} minute(s) automatically.
                    Extra time entered here is added on top. Total sentence: {Number((editJailTotal || 0) + (Number(editForm.jail_minutes || 0) || 0)).toLocaleString()} minute(s).
                  </p>
                )}
              </div>
              <LawOffenceFields
                catalog={offenceCatalog}
                selection={editOffenceSelection}
                setSelection={setEditOffenceSelection}
                loading={loadingOffenceCatalog}
                totalFine={editFineTotal}
                totalJailMinutes={editJailTotal}
              />
            </>
          ) : isParamedics ? (
            <MedicalFields form={editMedicalForm} setForm={setEditMedicalForm} />
          ) : (
            <FireFields form={editFireForm} setForm={setEditFireForm} />
          )}
          {isLaw && editingRecord?.id ? (
            <EvidencePanel
              entityType={String(editingRecord?.type || '').trim().toLowerCase() === 'arrest_report' ? 'arrest_report' : 'criminal_record'}
              entityId={editingRecord.id}
              departmentId={editingRecord.department_id || effectiveDepartmentId || null}
              title="Evidence Chain"
              compact
            />
          ) : null}
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={
                editingSaving ||
                (isLaw && loadingOffenceCatalog) ||
                (isArrestReportsMode && normalizeArrestWorkflowStatus(editingRecord?.workflow_status) === 'finalized')
              }
              className="flex-1 px-4 py-2 bg-cad-accent hover:bg-cad-accent-light text-white rounded text-sm font-medium transition-colors disabled:opacity-50"
            >
              {editingSaving ? 'Saving...' : (isArrestReportsMode && normalizeArrestWorkflowStatus(editingRecord?.workflow_status) === 'finalized' ? 'Finalized' : 'Save Changes')}
            </button>
            <button
              type="button"
              onClick={() => setShowEdit(false)}
              className="px-4 py-2 bg-cad-card hover:bg-cad-border text-cad-muted rounded text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}


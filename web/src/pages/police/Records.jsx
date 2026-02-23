import { useEffect, useMemo, useState } from 'react';
import { useDepartment } from '../../context/DepartmentContext';
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
  { value: 'assessment', label: 'Assessment' },
  { value: 'treatment', label: 'Treatment' },
  { value: 'transport', label: 'Transport' },
  { value: 'release', label: 'Release' },
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
  return {
    title: record?.title || '',
    description: record?.description || '',
    jail_minutes: Math.max(0, Number(record?.jail_minutes || 0)),
  };
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
      <p className="text-xs text-cad-muted mb-2">Tap body areas to mark injuries</p>
      <div className="relative mx-auto w-44 h-80 rounded-xl border border-cad-border/70 bg-cad-card overflow-hidden">
        <div className="absolute left-1/2 top-3 -translate-x-1/2 w-8 h-8 rounded-full border border-cad-border bg-cad-surface" />
        <div className="absolute left-1/2 top-12 -translate-x-1/2 w-10 h-14 rounded-lg border border-cad-border bg-cad-surface" />
        <div className="absolute left-1/2 top-26 -translate-x-1/2 w-14 h-16 rounded-lg border border-cad-border bg-cad-surface" />
        <div className="absolute left-[42%] top-42 w-4 h-20 rounded-lg border border-cad-border bg-cad-surface" />
        <div className="absolute left-[54%] top-42 w-4 h-20 rounded-lg border border-cad-border bg-cad-surface" />

        {BODY_REGION_OPTIONS.map(region => {
          const active = selected.includes(region.key);
          return (
            <button
              key={region.key}
              type="button"
              onClick={() => onChange(toggleBodyRegion(selected, region.key))}
              className={`absolute -translate-x-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded text-[10px] border transition-colors ${
                active
                  ? 'bg-red-500/25 text-red-200 border-red-400/60'
                  : 'bg-cad-bg/80 text-cad-muted border-cad-border hover:text-cad-ink'
              }`}
              style={{ top: region.top, left: region.left }}
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
        <label className="block text-sm text-cad-muted mb-1">Chief Complaint</label>
        <input
          type="text"
          value={form.complaint}
          onChange={e => setForm(prev => ({ ...prev, complaint: e.target.value }))}
          className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
          placeholder="e.g. Chest pain, breathing difficulty"
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
        <label className="block text-sm text-cad-muted mb-1">Treatment Provided</label>
        <input
          type="text"
          value={form.treatment}
          onChange={e => setForm(prev => ({ ...prev, treatment: e.target.value }))}
          className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
          placeholder="e.g. Oxygen, splinting, medication"
        />
      </div>
      <div>
        <label className="block text-sm text-cad-muted mb-1">Transport Destination</label>
        <input
          type="text"
          value={form.transport_to}
          onChange={e => setForm(prev => ({ ...prev, transport_to: e.target.value }))}
          className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
          placeholder="Hospital or clinic"
        />
      </div>
      <div>
        <label className="block text-sm text-cad-muted mb-1">Clinical Notes</label>
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

export default function Records({ embeddedPerson = null, embeddedDepartmentId = null, hideHeader = false }) {
  const { activeDepartment } = useDepartment();
  const layoutType = getDepartmentLayoutType(activeDepartment);
  const isLaw = layoutType === DEPARTMENT_LAYOUT.LAW_ENFORCEMENT;
  const isParamedics = layoutType === DEPARTMENT_LAYOUT.PARAMEDICS;
  const isFire = layoutType === DEPARTMENT_LAYOUT.FIRE;
  const isEmbedded = !!embeddedPerson;
  const effectiveDepartmentId = embeddedDepartmentId || activeDepartment?.id;

  const pageCopy = isLaw
    ? {
      title: 'Criminal Records',
      newButton: 'New Record',
      newModalTitle: 'New Criminal Record',
      editModalTitle: 'Edit Record',
      searchPlaceholder: 'Search person by first or last name...',
      noRecords: 'No records found for this person',
      countNoun: 'record(s)',
    }
    : isParamedics
      ? {
        title: 'Patient Care Reports',
        newButton: 'New Patient Report',
        newModalTitle: 'New Patient Care Report',
        editModalTitle: 'Edit Patient Report',
        searchPlaceholder: 'Search patient by first or last name...',
        noRecords: 'No patient reports found for this person',
        countNoun: 'report(s)',
      }
      : {
        title: 'Fire Incident Reports',
        newButton: 'New Incident Report',
        newModalTitle: 'New Fire Incident Report',
        editModalTitle: 'Edit Incident Report',
        searchPlaceholder: 'Search occupant / contact by first or last name...',
        noRecords: 'No fire incident reports linked to this contact / occupant',
        countNoun: 'report(s)',
      };

  const personAnchorLabel = isFire ? 'Reporting Contact / Occupant' : 'Person';
  const findPersonButtonLabel = isFire ? 'Find Contact / Occupant' : 'Find Person';
  const createSubmitLabel = isLaw ? 'Create Record' : isParamedics ? 'Create Patient Report' : 'Create Incident Report';

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

  async function refreshSelectedPersonRecords(citizenId) {
    if (!citizenId) {
      setRecords([]);
      return;
    }
    setSearching(true);
    try {
      const data = await api.get(`/api/records?citizen_id=${encodeURIComponent(citizenId)}`);
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
          title: newForm.title,
          description: newForm.description,
          jail_minutes: Math.max(
            Math.max(0, Math.trunc(Number(newForm.jail_minutes) || 0)),
            Math.max(0, Math.trunc(Number(newJailTotal) || 0))
          ),
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
          title: editForm.title,
          description: editForm.description,
          jail_minutes: Math.max(
            Math.max(0, Math.trunc(Number(editForm.jail_minutes) || 0)),
            Math.max(0, Math.trunc(Number(editJailTotal) || 0))
          ),
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

  return (
    <div>
      <div className={`flex items-center justify-between ${hideHeader ? 'mb-3' : 'mb-6'}`}>
        {hideHeader ? (
          <h3 className="text-lg font-semibold">{pageCopy.title}</h3>
        ) : (
          <h2 className="text-xl font-bold">{pageCopy.title}</h2>
        )}
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
          {isFire && (
            <div className="mb-3 rounded-lg border border-cad-border bg-cad-surface px-3 py-2">
              <p className="text-xs text-cad-muted">
                Fire incident reports are currently linked to a person record (occupant, owner, or reporting contact) for searchability until incident linking is fully implemented.
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
            {records.length} {pageCopy.countNoun} {isFire ? 'linked to' : 'for'} {selectedPerson?.firstname} {selectedPerson?.lastname}
          </div>
          {records.map(r => {
            const medical = parseMedicalRecord(r);
            const fire = parseFireRecord(r);
            const offenceItems = parseRecordOffenceItems(r);
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
                  <button
                    type="button"
                    onClick={() => openEdit(r)}
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
                  <p className="text-amber-400">Total Fine: ${Number(offenceTotal || 0).toLocaleString()}</p>
                  {Number(offenceJailTotal || 0) > 0 && (
                    <p className="text-rose-300">Offence Jail Total: {Number(offenceJailTotal || 0).toLocaleString()} minute(s)</p>
                  )}
                  {Number(r.jail_minutes || 0) > 0 && (
                    <p className="text-rose-300">Jail: {Number(r.jail_minutes || 0).toLocaleString()} minute(s)</p>
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
                <label className="block text-sm text-cad-muted mb-1">Jail Minutes</label>
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
                    Selected offences include {Number(newJailTotal || 0).toLocaleString()} minute(s) minimum.
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
          {isLaw ? (
            <>
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
                <label className="block text-sm text-cad-muted mb-1">Jail Minutes</label>
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
                    Selected offences include {Number(editJailTotal || 0).toLocaleString()} minute(s) minimum.
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
              entityType="criminal_record"
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
                (isLaw && loadingOffenceCatalog)
              }
              className="flex-1 px-4 py-2 bg-cad-accent hover:bg-cad-accent-light text-white rounded text-sm font-medium transition-colors disabled:opacity-50"
            >
              {editingSaving ? 'Saving...' : 'Save Changes'}
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


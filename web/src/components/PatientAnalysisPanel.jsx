import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { formatDateAU } from '../utils/dateTime';

const TRIAGE_OPTIONS = [
  { value: 'undetermined', label: 'Undetermined' },
  { value: 'immediate', label: 'Immediate' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'delayed', label: 'Delayed' },
  { value: 'minor', label: 'Minor' },
  { value: 'deceased', label: 'Deceased' },
];

const MARK_TYPES = [
  'pain',
  'wound',
  'bleeding',
  'fracture',
  'burn',
  'swelling',
  'other',
];

const MARK_SEVERITY = ['minor', 'moderate', 'severe', 'critical'];
const MCI_TAG_OPTIONS = [
  { value: '', label: 'Not MCI-tagged' },
  { value: 'green', label: 'Green (Minor)' },
  { value: 'yellow', label: 'Yellow (Delayed)' },
  { value: 'red', label: 'Red (Immediate)' },
  { value: 'black', label: 'Black (Deceased/Expectant)' },
];
const TRANSPORT_STATUS_OPTIONS = [
  { value: '', label: 'Not transporting' },
  { value: 'pending', label: 'Pending transport' },
  { value: 'enroute', label: 'En route to hospital' },
  { value: 'arrived', label: 'Arrived at hospital' },
  { value: 'handover_complete', label: 'Handover complete' },
];

function resolvePersonName(person) {
  const fullName = String(person?.full_name || '').trim();
  if (fullName) return fullName;
  const fallback = `${String(person?.firstname || '').trim()} ${String(person?.lastname || '').trim()}`.trim();
  if (fallback) return fallback;
  return String(person?.citizenid || 'Unknown Patient');
}

function buildDefaultDraft(person) {
  return {
    patient_name: resolvePersonName(person),
    triage_category: 'undetermined',
    chief_complaint: '',
    pain_score: 0,
    questionnaire: {
      mechanism: '',
      onset: '',
      conscious_state: 'alert',
      airway_state: 'clear',
      breathing_state: 'normal',
      circulation_state: 'stable',
      mobility_state: '',
      allergies: '',
      medications: '',
      treatment_given: '',
    },
    vitals: {
      pulse: '',
      blood_pressure: '',
      respiratory_rate: '',
      spo2: '',
      temperature: '',
      glucose: '',
    },
    body_marks: [],
    treatment_log: [],
    transport: {
      destination: '',
      eta_minutes: '',
      bed_availability: '',
      status: '',
      unit_callsign: '',
      notes: '',
    },
    mci_incident_key: '',
    mci_tag: '',
    notes: '',
  };
}

function toDraft(person, analysis) {
  const base = buildDefaultDraft(person);
  if (!analysis || typeof analysis !== 'object') return base;
  return {
    ...base,
    patient_name: String(analysis.patient_name || base.patient_name).trim(),
    triage_category: String(analysis.triage_category || base.triage_category).trim().toLowerCase(),
    chief_complaint: String(analysis.chief_complaint || '').trim(),
    pain_score: Number.isFinite(Number(analysis.pain_score)) ? Math.max(0, Math.min(10, Number(analysis.pain_score))) : 0,
    questionnaire: {
      ...base.questionnaire,
      ...(analysis.questionnaire && typeof analysis.questionnaire === 'object' ? analysis.questionnaire : {}),
    },
    vitals: {
      ...base.vitals,
      ...(analysis.vitals && typeof analysis.vitals === 'object' ? analysis.vitals : {}),
    },
    body_marks: Array.isArray(analysis.body_marks) ? analysis.body_marks : [],
    treatment_log: Array.isArray(analysis.treatment_log) ? analysis.treatment_log : [],
    transport: {
      ...base.transport,
      ...(analysis.transport && typeof analysis.transport === 'object' ? analysis.transport : {}),
      eta_minutes: (analysis.transport && analysis.transport.eta_minutes != null) ? String(analysis.transport.eta_minutes) : '',
      bed_availability: (analysis.transport && analysis.transport.bed_availability != null) ? String(analysis.transport.bed_availability) : '',
    },
    mci_incident_key: String(analysis.mci_incident_key || '').trim(),
    mci_tag: String(analysis.mci_tag || '').trim().toLowerCase(),
    notes: String(analysis.notes || '').trim(),
  };
}

function formatStatusLabel(value) {
  return String(value || '')
    .trim()
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getSeverityColor(severity) {
  const s = String(severity || '').trim().toLowerCase();
  if (s === 'critical') return '#ef4444';
  if (s === 'severe') return '#f97316';
  if (s === 'moderate') return '#facc15';
  return '#60a5fa';
}

function BodyDiagram({
  marks,
  activeView,
  onChangeView,
  onAddMark,
  onRemoveMark,
  markType,
  markSeverity,
}) {
  const filteredMarks = useMemo(
    () => (Array.isArray(marks) ? marks.filter((mark) => String(mark?.view || 'front') === activeView) : []),
    [marks, activeView]
  );

  function handleSvgClick(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    onAddMark({
      view: activeView,
      x: Math.max(0, Math.min(100, Number(x.toFixed(2)))),
      y: Math.max(0, Math.min(100, Number(y.toFixed(2)))),
      type: markType,
      severity: markSeverity,
      note: '',
    });
  }

  return (
    <div className="bg-cad-surface border border-cad-border rounded-lg p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h4 className="text-sm font-semibold text-cad-muted uppercase tracking-wider">Body Diagram</h4>
        <div className="flex rounded border border-cad-border overflow-hidden text-xs">
          <button
            type="button"
            onClick={() => onChangeView('front')}
            className={`px-2 py-1 ${activeView === 'front' ? 'bg-cad-accent text-white' : 'bg-cad-card text-cad-muted'}`}
          >
            Front
          </button>
          <button
            type="button"
            onClick={() => onChangeView('back')}
            className={`px-2 py-1 ${activeView === 'back' ? 'bg-cad-accent text-white' : 'bg-cad-card text-cad-muted'}`}
          >
            Back
          </button>
        </div>
      </div>

      <svg
        viewBox="0 0 100 180"
        className="w-full max-w-[220px] h-auto mx-auto rounded bg-cad-card border border-cad-border cursor-crosshair"
        onClick={handleSvgClick}
      >
        <circle cx="50" cy="15" r="10" fill="#15243b" stroke="#39506e" strokeWidth="1.5" />
        <rect x="38" y="28" width="24" height="45" rx="10" fill="#15243b" stroke="#39506e" strokeWidth="1.5" />
        <rect x="26" y="32" width="10" height="40" rx="5" fill="#15243b" stroke="#39506e" strokeWidth="1.5" />
        <rect x="64" y="32" width="10" height="40" rx="5" fill="#15243b" stroke="#39506e" strokeWidth="1.5" />
        <rect x="42" y="74" width="8" height="50" rx="4" fill="#15243b" stroke="#39506e" strokeWidth="1.5" />
        <rect x="50" y="74" width="8" height="50" rx="4" fill="#15243b" stroke="#39506e" strokeWidth="1.5" />
        <rect x="42" y="124" width="8" height="44" rx="4" fill="#15243b" stroke="#39506e" strokeWidth="1.5" />
        <rect x="50" y="124" width="8" height="44" rx="4" fill="#15243b" stroke="#39506e" strokeWidth="1.5" />

        {filteredMarks.map((mark, index) => {
          const id = String(mark?.id || `${index}`);
          const x = Math.max(0, Math.min(100, Number(mark?.x || 0)));
          const y = Math.max(0, Math.min(100, Number(mark?.y || 0))) * 1.8;
          const color = getSeverityColor(mark?.severity);
          return (
            <g
              key={id}
              onClick={(event) => {
                event.stopPropagation();
                onRemoveMark(id);
              }}
              className="cursor-pointer"
            >
              <circle cx={x} cy={y} r="3.8" fill={color} stroke="#0b1220" strokeWidth="1.2" />
            </g>
          );
        })}
      </svg>

      <p className="text-xs text-cad-muted mt-2">
        Click the diagram to place a triage marker. Click an existing marker to remove it.
      </p>
    </div>
  );
}

export default function PatientAnalysisPanel({ person, activeDepartmentId, mode = 'full' }) {
  const citizenId = String(person?.citizenid || '').trim();
  const normalizedMode = String(mode || 'full').trim().toLowerCase();
  const isTransportMode = normalizedMode === 'transport';
  const isTreatmentMode = normalizedMode === 'treatment';
  const showTreatmentLogSection = !isTransportMode;
  const showTransportTrackerSection = !isTreatmentMode;
  const showPrimaryAssessmentSection = !isTransportMode;
  const showVitalsSection = !isTransportMode;
  const showMciSection = !isTransportMode;
  const showSecondaryQuestionsSection = !isTransportMode;
  const showBodyDiagramTools = !isTransportMode;
  const [history, setHistory] = useState([]);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState(null);
  const [draft, setDraft] = useState(() => buildDefaultDraft(person));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [activeBodyView, setActiveBodyView] = useState('front');
  const [markType, setMarkType] = useState('pain');
  const [markSeverity, setMarkSeverity] = useState('moderate');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!citizenId) {
        setHistory([]);
        setSelectedAnalysisId(null);
        setDraft(buildDefaultDraft(person));
        return;
      }
      setLoading(true);
      setError('');
      setMessage('');
      try {
        const data = await api.get(`/api/medical/patients/${encodeURIComponent(citizenId)}/analyses`);
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        setHistory(list);
        if (list.length > 0) {
          setSelectedAnalysisId(list[0].id);
          setDraft(toDraft(person, list[0]));
        } else {
          setSelectedAnalysisId(null);
          setDraft(buildDefaultDraft(person));
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || 'Failed to load patient analysis history');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [citizenId, person]);

  function updateQuestionnaire(key, value) {
    setDraft((current) => ({
      ...current,
      questionnaire: {
        ...(current.questionnaire || {}),
        [key]: value,
      },
    }));
  }

  function updateVitals(key, value) {
    setDraft((current) => ({
      ...current,
      vitals: {
        ...(current.vitals || {}),
        [key]: value,
      },
    }));
  }

  function addBodyMark(mark) {
    setDraft((current) => ({
      ...current,
      body_marks: [
        ...(Array.isArray(current.body_marks) ? current.body_marks : []),
        {
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          ...mark,
        },
      ],
    }));
  }

  function removeBodyMark(id) {
    setDraft((current) => ({
      ...current,
      body_marks: (Array.isArray(current.body_marks) ? current.body_marks : []).filter(
        (mark) => String(mark?.id || '') !== String(id || '')
      ),
    }));
  }

  function addTreatmentLogItem() {
    setDraft((current) => ({
      ...current,
      treatment_log: [
        ...(Array.isArray(current.treatment_log) ? current.treatment_log : []),
        {
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          category: 'treatment',
          name: '',
          dose: '',
          route: '',
          status: 'completed',
          timestamp: new Date().toISOString(),
          notes: '',
        },
      ],
    }));
  }

  function updateTreatmentLogItem(id, key, value) {
    setDraft((current) => ({
      ...current,
      treatment_log: (Array.isArray(current.treatment_log) ? current.treatment_log : []).map((entry) => (
        String(entry?.id || '') === String(id || '')
          ? { ...entry, [key]: value }
          : entry
      )),
    }));
  }

  function removeTreatmentLogItem(id) {
    setDraft((current) => ({
      ...current,
      treatment_log: (Array.isArray(current.treatment_log) ? current.treatment_log : []).filter(
        (entry) => String(entry?.id || '') !== String(id || '')
      ),
    }));
  }

  function loadHistoryItem(item) {
    setSelectedAnalysisId(item.id);
    setDraft(toDraft(person, item));
    setMessage('');
    setError('');
  }

  function startNewAnalysis() {
    setSelectedAnalysisId(null);
    setDraft(buildDefaultDraft(person));
    setMessage('New analysis draft started.');
    setError('');
  }

  async function saveAnalysis() {
    if (!citizenId) return;
    setSaving(true);
    setError('');
    setMessage('');

    const payload = {
      patient_name: draft.patient_name || resolvePersonName(person),
      department_id: Number.isFinite(Number(activeDepartmentId)) ? Number(activeDepartmentId) : null,
      triage_category: draft.triage_category,
      chief_complaint: draft.chief_complaint,
      pain_score: draft.pain_score,
      questionnaire: draft.questionnaire,
      vitals: draft.vitals,
      body_marks: draft.body_marks,
      treatment_log: Array.isArray(draft.treatment_log) ? draft.treatment_log : [],
      transport: {
        ...(draft.transport || {}),
        eta_minutes: draft.transport?.eta_minutes === '' ? null : Number(draft.transport?.eta_minutes),
        bed_availability: draft.transport?.bed_availability === '' ? null : Number(draft.transport?.bed_availability),
      },
      mci_incident_key: draft.mci_incident_key,
      mci_tag: draft.mci_tag,
      notes: draft.notes,
    };

    try {
      let saved;
      if (selectedAnalysisId) {
        saved = await api.patch(`/api/medical/analyses/${selectedAnalysisId}`, payload);
      } else {
        saved = await api.post(`/api/medical/patients/${encodeURIComponent(citizenId)}/analyses`, payload);
      }

      const refreshed = await api.get(`/api/medical/patients/${encodeURIComponent(citizenId)}/analyses`);
      const list = Array.isArray(refreshed) ? refreshed : [];
      setHistory(list);
      setSelectedAnalysisId(saved?.id || null);
      setDraft(toDraft(person, saved));
      if (isTransportMode) {
        setMessage(selectedAnalysisId ? 'Transport tracker updated.' : 'Transport tracker saved.');
      } else {
        setMessage(selectedAnalysisId ? 'Patient analysis updated.' : 'Patient analysis saved.');
      }
    } catch (err) {
      setError(err?.message || (isTransportMode ? 'Failed to save transport tracker' : 'Failed to save patient analysis'));
    } finally {
      setSaving(false);
    }
  }

  const treatmentLogCount = Array.isArray(draft.treatment_log) ? draft.treatment_log.length : 0;
  const transportStatusText = String(draft.transport?.status || '').trim()
    ? formatStatusLabel(draft.transport?.status)
    : 'Not transporting';
  const saveButtonText = saving
    ? (isTransportMode ? 'Saving Transport Update...' : 'Saving Analysis...')
    : (selectedAnalysisId
      ? (isTransportMode ? 'Update Transport' : 'Update Analysis')
      : (isTransportMode ? 'Save Transport Update' : 'Save Analysis'));

  return (
    <div className="space-y-4">
      <div className="bg-cad-surface border border-cad-border rounded-lg px-4 py-4 text-sm">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h4 className="text-sm font-semibold text-cad-muted uppercase tracking-wider">Patient Snapshot</h4>
          <span className="px-2 py-1 rounded border border-cad-border bg-cad-card text-xs text-cad-muted">
            {selectedAnalysisId ? `Analysis #${selectedAnalysisId}` : 'New Analysis'}
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-lg border border-cad-border/60 bg-cad-card/70 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wider text-cad-muted">Patient</p>
            <p className="mt-1 text-sm text-cad-ink">{resolvePersonName(person)}</p>
          </div>
          <div className="rounded-lg border border-cad-border/60 bg-cad-card/70 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wider text-cad-muted">Citizen ID</p>
            <p className="mt-1 text-sm text-cad-ink font-mono">{person?.citizenid || '-'}</p>
          </div>
          <div className="rounded-lg border border-cad-border/60 bg-cad-card/70 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wider text-cad-muted">Date Of Birth</p>
            <p className="mt-1 text-sm text-cad-ink">{formatDateAU(person?.birthdate || person?.cad_driver_license?.date_of_birth || '', '-')}</p>
          </div>
          <div className="rounded-lg border border-cad-border/60 bg-cad-card/70 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wider text-cad-muted">Gender</p>
            <p className="mt-1 text-sm text-cad-ink">{String(person?.gender || person?.cad_driver_license?.gender || '-')}</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="px-3 py-2 rounded border border-red-500/40 bg-red-500/10 text-red-200 text-sm">
          {error}
        </div>
      )}
      {message && (
        <div className="px-3 py-2 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-200 text-sm">
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-4">
        <div className="space-y-4">
          {showPrimaryAssessmentSection && (
            <div className="bg-cad-surface border border-cad-border rounded-lg p-3 space-y-3">
              <h4 className="text-sm font-semibold text-cad-muted uppercase tracking-wider">Primary Assessment</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-cad-muted mb-1">Triage Category</label>
                  <select
                    value={draft.triage_category}
                    onChange={(event) => setDraft((current) => ({ ...current, triage_category: event.target.value }))}
                    className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm"
                  >
                    {TRIAGE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-cad-muted mb-1">Pain Score ({draft.pain_score}/10)</label>
                  <input
                    type="range"
                    min="0"
                    max="10"
                    step="1"
                    value={draft.pain_score}
                    onChange={(event) => setDraft((current) => ({ ...current, pain_score: Number(event.target.value || 0) }))}
                    className="w-full"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-cad-muted mb-1">Chief Complaint</label>
                <input
                  type="text"
                  value={draft.chief_complaint}
                  onChange={(event) => setDraft((current) => ({ ...current, chief_complaint: event.target.value }))}
                  placeholder="Primary complaint / reason for attendance"
                  className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-cad-muted mb-1">Conscious State</label>
                  <select
                    value={draft.questionnaire?.conscious_state || ''}
                    onChange={(event) => updateQuestionnaire('conscious_state', event.target.value)}
                    className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm"
                  >
                    <option value="">Select...</option>
                    <option value="alert">Alert</option>
                    <option value="verbal">Responds To Verbal</option>
                    <option value="pain">Responds To Pain</option>
                    <option value="unresponsive">Unresponsive</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-cad-muted mb-1">Airway</label>
                  <select
                    value={draft.questionnaire?.airway_state || ''}
                    onChange={(event) => updateQuestionnaire('airway_state', event.target.value)}
                    className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm"
                  >
                    <option value="">Select...</option>
                    <option value="clear">Clear</option>
                    <option value="compromised">Compromised</option>
                    <option value="obstructed">Obstructed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-cad-muted mb-1">Breathing</label>
                  <select
                    value={draft.questionnaire?.breathing_state || ''}
                    onChange={(event) => updateQuestionnaire('breathing_state', event.target.value)}
                    className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm"
                  >
                    <option value="">Select...</option>
                    <option value="normal">Normal</option>
                    <option value="laboured">Laboured</option>
                    <option value="assisted">Assisted</option>
                    <option value="apnoea">Apnoea</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-cad-muted mb-1">Circulation</label>
                  <select
                    value={draft.questionnaire?.circulation_state || ''}
                    onChange={(event) => updateQuestionnaire('circulation_state', event.target.value)}
                    className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm"
                  >
                    <option value="">Select...</option>
                    <option value="stable">Stable</option>
                    <option value="bleeding">Bleeding</option>
                    <option value="shock">Shock</option>
                    <option value="arrest">Cardiac Arrest</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {showVitalsSection && (
            <div className="bg-cad-surface border border-cad-border rounded-lg p-3 space-y-3">
              <h4 className="text-sm font-semibold text-cad-muted uppercase tracking-wider">Vitals</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <input value={draft.vitals?.pulse || ''} onChange={(e) => updateVitals('pulse', e.target.value)} placeholder="Pulse (bpm)" className="bg-cad-card border border-cad-border rounded px-3 py-2 text-sm" />
                <input value={draft.vitals?.blood_pressure || ''} onChange={(e) => updateVitals('blood_pressure', e.target.value)} placeholder="Blood Pressure (mmHg)" className="bg-cad-card border border-cad-border rounded px-3 py-2 text-sm" />
                <input value={draft.vitals?.respiratory_rate || ''} onChange={(e) => updateVitals('respiratory_rate', e.target.value)} placeholder="Respiratory Rate" className="bg-cad-card border border-cad-border rounded px-3 py-2 text-sm" />
                <input value={draft.vitals?.spo2 || ''} onChange={(e) => updateVitals('spo2', e.target.value)} placeholder="SpO2 (%)" className="bg-cad-card border border-cad-border rounded px-3 py-2 text-sm" />
                <input value={draft.vitals?.temperature || ''} onChange={(e) => updateVitals('temperature', e.target.value)} placeholder="Temperature (C)" className="bg-cad-card border border-cad-border rounded px-3 py-2 text-sm" />
                <input value={draft.vitals?.glucose || ''} onChange={(e) => updateVitals('glucose', e.target.value)} placeholder="Glucose (mmol/L)" className="bg-cad-card border border-cad-border rounded px-3 py-2 text-sm" />
              </div>
            </div>
          )}

          {isTransportMode && (
            <div className="bg-cad-surface border border-cad-border rounded-lg p-3 space-y-3">
              <h4 className="text-sm font-semibold text-cad-muted uppercase tracking-wider">Transport Handover Context</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                <div className="rounded border border-cad-border bg-cad-card px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wider text-cad-muted">Chief Complaint</p>
                  <p className="mt-1 text-cad-ink">{draft.chief_complaint || '-'}</p>
                </div>
                <div className="rounded border border-cad-border bg-cad-card px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wider text-cad-muted">Triage</p>
                  <p className="mt-1 text-cad-ink">{formatStatusLabel(draft.triage_category || 'undetermined') || 'Undetermined'}</p>
                </div>
                <div className="rounded border border-cad-border bg-cad-card px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wider text-cad-muted">Treatments Logged</p>
                  <p className="mt-1 text-cad-ink">{treatmentLogCount}</p>
                </div>
                <div className="rounded border border-cad-border bg-cad-card px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wider text-cad-muted">Transport Status</p>
                  <p className="mt-1 text-cad-ink">{transportStatusText}</p>
                </div>
              </div>
              <p className="text-xs text-cad-muted">
                Assessment, vitals, treatment entries, and MCI tagging are managed in the Treatment Log tab to avoid duplicate charting.
              </p>
            </div>
          )}

          {showTreatmentLogSection && (
            <div className="bg-cad-surface border border-cad-border rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-cad-muted uppercase tracking-wider">Treatment Log</h4>
                <button
                  type="button"
                  onClick={addTreatmentLogItem}
                  className="px-2 py-1 text-xs rounded border border-cad-border text-cad-muted hover:text-cad-ink"
                >
                  + Add Entry
                </button>
              </div>
              {Array.isArray(draft.treatment_log) && draft.treatment_log.length > 0 ? (
                <div className="space-y-2">
                  {draft.treatment_log.map((entry) => (
                    <div key={entry.id} className="bg-cad-card border border-cad-border rounded p-2 space-y-2">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <select
                          value={entry.category || 'treatment'}
                          onChange={(e) => updateTreatmentLogItem(entry.id, 'category', e.target.value)}
                          className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm"
                        >
                          <option value="treatment">Treatment</option>
                          <option value="medication">Medication</option>
                          <option value="procedure">Procedure</option>
                          <option value="transport">Transport</option>
                        </select>
                        <input
                          type="datetime-local"
                          value={String(entry.timestamp || '').slice(0, 16)}
                          onChange={(e) => updateTreatmentLogItem(entry.id, 'timestamp', e.target.value)}
                          className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm"
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <input
                          value={entry.name || ''}
                          onChange={(e) => updateTreatmentLogItem(entry.id, 'name', e.target.value)}
                          placeholder="Medication / procedure name"
                          className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm"
                        />
                        <input
                          value={entry.dose || ''}
                          onChange={(e) => updateTreatmentLogItem(entry.id, 'dose', e.target.value)}
                          placeholder="Dose / quantity"
                          className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm"
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2">
                        <input
                          value={entry.route || ''}
                          onChange={(e) => updateTreatmentLogItem(entry.id, 'route', e.target.value)}
                          placeholder="Route (PO/IV/IM/etc)"
                          className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm"
                        />
                        <input
                          value={entry.status || ''}
                          onChange={(e) => updateTreatmentLogItem(entry.id, 'status', e.target.value)}
                          placeholder="Status"
                          className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => removeTreatmentLogItem(entry.id)}
                          className="px-3 py-2 text-xs border border-red-500/30 text-red-300 rounded hover:bg-red-500/10"
                        >
                          Remove
                        </button>
                      </div>
                      <textarea
                        value={entry.notes || ''}
                        onChange={(e) => updateTreatmentLogItem(entry.id, 'notes', e.target.value)}
                        placeholder="Notes"
                        rows={2}
                        className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm resize-none"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-cad-muted">No treatments logged yet.</p>
              )}
            </div>
          )}

          {showTransportTrackerSection && (
            <div className="bg-cad-surface border border-cad-border rounded-lg p-3 space-y-3">
              <h4 className="text-sm font-semibold text-cad-muted uppercase tracking-wider">Transport Tracker</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <input
                  value={draft.transport?.destination || ''}
                  onChange={(e) => setDraft((current) => ({
                    ...current,
                    transport: { ...(current.transport || {}), destination: e.target.value },
                  }))}
                  placeholder="Destination hospital"
                  className="bg-cad-card border border-cad-border rounded px-3 py-2 text-sm"
                />
                <select
                  value={draft.transport?.status || ''}
                  onChange={(e) => setDraft((current) => ({
                    ...current,
                    transport: { ...(current.transport || {}), status: e.target.value },
                  }))}
                  className="bg-cad-card border border-cad-border rounded px-3 py-2 text-sm"
                >
                  {TRANSPORT_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <input
                  type="number"
                  min="0"
                  value={draft.transport?.eta_minutes ?? ''}
                  onChange={(e) => setDraft((current) => ({
                    ...current,
                    transport: { ...(current.transport || {}), eta_minutes: e.target.value },
                  }))}
                  placeholder="ETA (minutes)"
                  className="bg-cad-card border border-cad-border rounded px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  min="0"
                  value={draft.transport?.bed_availability ?? ''}
                  onChange={(e) => setDraft((current) => ({
                    ...current,
                    transport: { ...(current.transport || {}), bed_availability: e.target.value },
                  }))}
                  placeholder="Beds available (if known)"
                  className="bg-cad-card border border-cad-border rounded px-3 py-2 text-sm"
                />
                <input
                  value={draft.transport?.unit_callsign || ''}
                  onChange={(e) => setDraft((current) => ({
                    ...current,
                    transport: { ...(current.transport || {}), unit_callsign: e.target.value },
                  }))}
                  placeholder="Transport unit callsign"
                  className="bg-cad-card border border-cad-border rounded px-3 py-2 text-sm md:col-span-2"
                />
              </div>
              <textarea
                value={draft.transport?.notes || ''}
                onChange={(e) => setDraft((current) => ({
                  ...current,
                  transport: { ...(current.transport || {}), notes: e.target.value },
                }))}
                rows={2}
                placeholder="Transport notes / destination updates"
                className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm resize-none"
              />
            </div>
          )}

          {showMciSection && (
            <div className="bg-cad-surface border border-cad-border rounded-lg p-3 space-y-3">
              <h4 className="text-sm font-semibold text-cad-muted uppercase tracking-wider">MCI / START Triage</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <input
                  value={draft.mci_incident_key || ''}
                  onChange={(e) => setDraft((current) => ({ ...current, mci_incident_key: e.target.value }))}
                  placeholder="MCI Incident Key (shared across patients)"
                  className="bg-cad-card border border-cad-border rounded px-3 py-2 text-sm"
                />
                <select
                  value={draft.mci_tag || ''}
                  onChange={(e) => setDraft((current) => ({ ...current, mci_tag: e.target.value }))}
                  className="bg-cad-card border border-cad-border rounded px-3 py-2 text-sm"
                >
                  {MCI_TAG_OPTIONS.map((option) => (
                    <option key={option.value || 'none'} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-cad-muted">
                Use the same incident key for all patients in a mass casualty incident to group them together.
              </p>
            </div>
          )}

          {showSecondaryQuestionsSection && (
            <div className="bg-cad-surface border border-cad-border rounded-lg p-3 space-y-3">
              <h4 className="text-sm font-semibold text-cad-muted uppercase tracking-wider">Secondary Questions</h4>
              <input value={draft.questionnaire?.mechanism || ''} onChange={(e) => updateQuestionnaire('mechanism', e.target.value)} placeholder="Mechanism of injury / illness" className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm" />
              <input value={draft.questionnaire?.onset || ''} onChange={(e) => updateQuestionnaire('onset', e.target.value)} placeholder="Onset / timeline" className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm" />
              <input value={draft.questionnaire?.allergies || ''} onChange={(e) => updateQuestionnaire('allergies', e.target.value)} placeholder="Allergies" className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm" />
              <input value={draft.questionnaire?.medications || ''} onChange={(e) => updateQuestionnaire('medications', e.target.value)} placeholder="Current medications" className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm" />
              <textarea value={draft.questionnaire?.treatment_given || ''} onChange={(e) => updateQuestionnaire('treatment_given', e.target.value)} placeholder="Treatment provided" rows={3} className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm" />
              <textarea value={draft.notes} onChange={(e) => setDraft((current) => ({ ...current, notes: e.target.value }))} placeholder="Clinical notes..." rows={4} className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm" />
            </div>
          )}
        </div>

        <div className="space-y-4">
          {showBodyDiagramTools && (
            <div className="bg-cad-surface border border-cad-border rounded-lg p-3 space-y-2">
              <h4 className="text-sm font-semibold text-cad-muted uppercase tracking-wider">Marker Tool</h4>
              <div className="grid grid-cols-1 gap-2">
                <select
                  value={markType}
                  onChange={(event) => setMarkType(event.target.value)}
                  className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm"
                >
                  {MARK_TYPES.map((type) => (
                    <option key={type} value={type}>{formatStatusLabel(type)}</option>
                  ))}
                </select>
                <select
                  value={markSeverity}
                  onChange={(event) => setMarkSeverity(event.target.value)}
                  className="w-full bg-cad-card border border-cad-border rounded px-3 py-2 text-sm"
                >
                  {MARK_SEVERITY.map((severity) => (
                    <option key={severity} value={severity}>{formatStatusLabel(severity)}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setDraft((current) => ({ ...current, body_marks: [] }))}
                  className="px-3 py-2 border border-cad-border rounded text-sm text-cad-muted hover:text-cad-ink hover:border-cad-border-light"
                >
                  Clear All Markers
                </button>
              </div>
            </div>
          )}

          {showBodyDiagramTools && (
            <BodyDiagram
              marks={draft.body_marks}
              activeView={activeBodyView}
              onChangeView={setActiveBodyView}
              onAddMark={addBodyMark}
              onRemoveMark={removeBodyMark}
              markType={markType}
              markSeverity={markSeverity}
            />
          )}

          <div className="bg-cad-surface border border-cad-border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-cad-muted uppercase tracking-wider">Analysis History</h4>
              <button
                type="button"
                onClick={startNewAnalysis}
                className="px-2 py-1 text-xs rounded border border-cad-border text-cad-muted hover:text-cad-ink"
              >
                New
              </button>
            </div>
            {loading ? (
              <p className="text-xs text-cad-muted">Loading analyses...</p>
            ) : history.length === 0 ? (
              <p className="text-xs text-cad-muted">No prior analyses for this patient.</p>
            ) : (
              <div className="max-h-52 overflow-y-auto space-y-1">
                {history.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => loadHistoryItem(item)}
                    className={`w-full text-left rounded border px-2 py-2 text-xs transition-colors ${
                      Number(item.id) === Number(selectedAnalysisId)
                        ? 'border-cad-accent bg-cad-accent/10 text-cad-ink'
                        : 'border-cad-border bg-cad-card text-cad-muted hover:text-cad-ink'
                    }`}
                    >
                      <p className="font-semibold">#{item.id} - {formatStatusLabel(item.triage_category)}</p>
                      <p>{formatDateAU(item.updated_at || item.created_at || '', '-')}</p>
                      {(Array.isArray(item.treatment_log) && item.treatment_log.length > 0) || item?.mci_tag ? (
                        <p className="mt-1">
                          {Array.isArray(item.treatment_log) && item.treatment_log.length > 0 ? `${item.treatment_log.length} tx` : '0 tx'}
                          {item?.mci_tag ? ` | MCI ${String(item.mci_tag).toUpperCase()}` : ''}
                        </p>
                      ) : null}
                    </button>
                  ))}
                </div>
            )}
          </div>

          <button
            type="button"
            onClick={saveAnalysis}
            disabled={saving}
            className="w-full px-4 py-2 bg-cad-accent hover:bg-cad-accent-light text-white rounded text-sm font-medium transition-colors disabled:opacity-50"
          >
            {saveButtonText}
          </button>
        </div>
      </div>
    </div>
  );
}

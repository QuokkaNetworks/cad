import { useMemo, useState } from 'react';
import { api } from '../../api/client';
import SearchResults from '../../components/SearchResults';
import PatientAnalysisPanel from '../../components/PatientAnalysisPanel';
import { useDepartment } from '../../context/DepartmentContext';
import { DEPARTMENT_LAYOUT, getDepartmentLayoutType } from '../../utils/departmentLayout';
import { formatDateTimeAU } from '../../utils/dateTime';

function resolvePersonName(person) {
  const fullName = String(person?.full_name || '').trim();
  if (fullName) return fullName;
  const fallback = `${String(person?.firstname || '').trim()} ${String(person?.lastname || '').trim()}`.trim();
  if (fallback) return fallback;
  return String(person?.citizenid || 'Unknown Patient');
}

function formatErr(err) {
  if (!err) return 'Unknown error';
  const base = err.message || 'Request failed';
  if (Array.isArray(err.details?.errors) && err.details.errors.length > 0) {
    return `${base}\n- ${err.details.errors.join('\n- ')}`;
  }
  return base;
}

function DepartmentLockedCard({ title }) {
  return (
    <div className="bg-cad-card border border-cad-border rounded-lg p-5">
      <h2 className="text-xl font-bold mb-2">{title}</h2>
      <p className="text-sm text-cad-muted">
        This workflow is available for EMS / Paramedic departments only.
      </p>
    </div>
  );
}

export default function EmsPatientWorkflowPage({
  mode = 'full',
  title = 'EMS Patient Workflow',
  subtitle = '',
}) {
  const { activeDepartment } = useDepartment();
  const layoutType = getDepartmentLayoutType(activeDepartment);
  const isParamedics = layoutType === DEPARTMENT_LAYOUT.PARAMEDICS;
  const isTreatmentMode = String(mode || '').toLowerCase() === 'treatment';
  const isTransportMode = String(mode || '').toLowerCase() === 'transport';

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [loadingPerson, setLoadingPerson] = useState(false);
  const [error, setError] = useState('');

  const query = useMemo(
    () => [String(firstName || '').trim(), String(lastName || '').trim()].filter(Boolean).join(' ').trim(),
    [firstName, lastName]
  );
  const canSearch = query.length >= 2;
  const medicalCount = Math.max(0, Number(selectedPerson?.medical_analysis_count || 0));
  const workflowFocus = isTreatmentMode
    ? 'Document on-scene findings, Wasabi treatment actions (CPR/revive/bandage), and patient response to care.'
    : isTransportMode
      ? 'Track Wasabi transport status, destination, ETA changes, refusals, and hospital handoff.'
      : 'Search a patient and document EMS care or transport updates.';

  async function doSearch(event) {
    event.preventDefault();
    if (!canSearch) return;
    setSearching(true);
    setError('');
    setResults([]);
    try {
      const params = [
        `first_name=${encodeURIComponent(String(firstName || '').trim())}`,
        `last_name=${encodeURIComponent(String(lastName || '').trim())}`,
        `q=${encodeURIComponent(query)}`,
      ].join('&');
      const data = await api.get(`/api/search/cad/persons?${params}`);
      setResults(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(formatErr(err));
    } finally {
      setSearching(false);
    }
  }

  async function selectPerson(person) {
    const citizenId = String(person?.citizenid || '').trim();
    if (!citizenId) return;
    setLoadingPerson(true);
    setError('');
    try {
      const details = await api.get(`/api/search/cad/persons/${encodeURIComponent(citizenId)}`);
      setSelectedPerson(details && typeof details === 'object' ? details : person);
    } catch (err) {
      setError(formatErr(err));
    } finally {
      setLoadingPerson(false);
    }
  }

  if (!isParamedics) {
    return <DepartmentLockedCard title={title} />;
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">{title}</h2>
        {subtitle ? <p className="text-sm text-cad-muted mt-1">{subtitle}</p> : null}
      </div>

      <div className="bg-cad-card border border-cad-border rounded-xl p-4">
        <p className="text-xs uppercase tracking-wider text-cad-muted">Workflow Focus</p>
        <p className="text-sm text-cad-ink mt-1">{workflowFocus}</p>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
          <div className="rounded-lg border border-cad-border bg-cad-surface px-3 py-2">1. Search patient</div>
          <div className="rounded-lg border border-cad-border bg-cad-surface px-3 py-2">2. Confirm identity and history</div>
          <div className="rounded-lg border border-cad-border bg-cad-surface px-3 py-2">
            {isTransportMode ? '3. Update transport / handoff' : '3. Update care notes'}
          </div>
        </div>
      </div>

      <div className="bg-cad-card border border-cad-border rounded-2xl p-4">
        <form onSubmit={doSearch} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <div>
            <label className="block text-xs text-cad-muted mb-1">First Name</label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Patient first name"
              className="w-full bg-cad-surface border border-cad-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
            />
          </div>
          <div>
            <label className="block text-xs text-cad-muted mb-1">Last Name</label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Patient last name"
              className="w-full bg-cad-surface border border-cad-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
            />
          </div>
          <button
            type="submit"
            disabled={searching || !canSearch}
            className="px-6 py-2 bg-cad-accent hover:bg-cad-accent-light text-white rounded text-sm font-medium transition-colors disabled:opacity-50"
          >
            {searching ? 'Searching...' : 'Search'}
          </button>
        </form>

        {error ? (
          <div className="mt-3 px-3 py-2 rounded border border-red-500/40 bg-red-500/10 text-red-200 text-sm whitespace-pre-wrap">
            {error}
          </div>
        ) : null}

        {results.length > 0 ? (
          <div className="mt-3 border border-cad-border rounded-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-cad-border bg-cad-surface/60 text-xs text-cad-muted uppercase tracking-wider">
              Search Results ({results.length})
            </div>
            <SearchResults type="person" results={results} onSelect={selectPerson} />
          </div>
        ) : null}
      </div>

      {selectedPerson ? (
        <div className="space-y-4">
          <div className="bg-cad-card border border-cad-border rounded-xl px-4 py-3">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div>
                <p className="text-xs text-cad-muted uppercase tracking-wider">Selected Patient</p>
                <p className="text-lg font-semibold mt-1">{resolvePersonName(selectedPerson)}</p>
                <p className="text-xs text-cad-muted mt-1">
                  Citizen ID: <span className="font-mono">{selectedPerson?.citizenid || '-'}</span>
                </p>
                <p className="text-xs text-cad-muted mt-1">
                  {isTransportMode ? 'Transport workflow active' : isTreatmentMode ? 'Treatment workflow active' : 'EMS workflow active'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                {medicalCount > 0 ? (
                  <span className="px-3 py-1.5 rounded border border-cyan-500/40 bg-cyan-500/10 text-sm text-cyan-200">
                    Medical History: {medicalCount}
                    {selectedPerson?.medical_last_analysis_at
                      ? ` | Last: ${formatDateTimeAU(`${selectedPerson.medical_last_analysis_at}Z`, '-', false)}`
                      : ''}
                  </span>
                ) : (
                  <span className="px-3 py-1.5 rounded border border-cad-border bg-cad-surface text-sm text-cad-muted">
                    No recorded analyses yet
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedPerson(null)}
                  className="px-3 py-1.5 rounded border border-cad-border bg-cad-surface text-sm text-cad-muted hover:text-cad-ink"
                >
                  Clear Patient
                </button>
              </div>
            </div>
          </div>

          {loadingPerson ? (
            <div className="bg-cad-card border border-cad-border rounded-lg p-4 text-sm text-cad-muted">
              Loading patient details...
            </div>
          ) : (
            <PatientAnalysisPanel
              person={selectedPerson}
              activeDepartmentId={activeDepartment?.id || null}
              mode={mode}
            />
          )}
        </div>
      ) : (
        <div className="bg-cad-card border border-cad-border rounded-lg p-5 text-sm text-cad-muted">
          {isTransportMode ? 'Search and select a patient to start tracking transport and hospital handoff.' : 'Search and select a patient to begin.'}
        </div>
      )}
    </div>
  );
}

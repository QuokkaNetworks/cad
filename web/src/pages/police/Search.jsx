import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import SearchResults from '../../components/SearchResults';
import Modal from '../../components/Modal';
import PatientAnalysisPanel from '../../components/PatientAnalysisPanel';
import Records from './Records';
import { DEPARTMENT_LAYOUT, getDepartmentLayoutType } from '../../utils/departmentLayout';
import { useDepartment } from '../../context/DepartmentContext';
import { formatDateAU, formatDateTimeAU } from '../../utils/dateTime';

const LICENSE_STATUS_OPTIONS = ['valid', 'suspended', 'disqualified', 'expired'];
const REGISTRATION_STATUS_OPTIONS = ['valid', 'suspended', 'revoked', 'expired'];

function formatErr(err) {
  if (!err) return 'Unknown error';
  const base = err.message || 'Request failed';
  if (Array.isArray(err.details?.errors) && err.details.errors.length > 0) {
    return `${base}\n- ${err.details.errors.join('\n- ')}`;
  }
  return base;
}

function formatStatusLabel(value) {
  return String(value || '')
    .trim()
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function resolvePersonName(person) {
  const fullName = String(person?.full_name || '').trim();
  if (fullName) return fullName;
  const fallback = `${String(person?.firstname || '').trim()} ${String(person?.lastname || '').trim()}`.trim();
  if (fallback) return fallback;
  return String(person?.citizenid || 'Unknown Person');
}

function formatGenderLabel(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return '-';
  if (raw === '0' || raw === 'm' || raw === 'male' || raw === 'man') return 'Male';
  if (raw === '1' || raw === 'f' || raw === 'female' || raw === 'woman') return 'Female';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function buildRecordsPerson(person) {
  if (!person) return null;
  const citizenid = String(person.citizenid || '').trim();
  if (!citizenid) return null;
  const fullName = resolvePersonName(person);
  const pieces = fullName.split(/\s+/).filter(Boolean);
  return {
    citizenid,
    firstname: String(person.firstname || pieces[0] || '').trim(),
    lastname: String(person.lastname || pieces.slice(1).join(' ') || '').trim(),
    full_name: fullName,
    birthdate: String(person.birthdate || person?.cad_driver_license?.date_of_birth || '').trim(),
    gender: String(person.gender || person?.cad_driver_license?.gender || '').trim(),
  };
}

function MugshotPreview({ url }) {
  const value = String(url || '').trim();
  if (!value) return null;
  return (
    <div className="bg-cad-card border border-cad-border rounded-lg p-2">
      <p className="text-[10px] uppercase tracking-wider text-cad-muted mb-1">Mugshot</p>
      <img
        src={value}
        alt="Character mugshot"
        className="w-36 h-36 object-cover object-top rounded border border-cad-border bg-transparent"
      />
    </div>
  );
}

function CadVictoriaLicenseCard({ person }) {
  const license = person?.cad_driver_license;
  if (!license) {
    return (
      <p className="text-sm text-cad-muted">No CAD driver licence record found.</p>
    );
  }

  const fullName = resolvePersonName(person);
  const licenceNumber = String(license.license_number || '-').trim() || '-';
  const dob = formatDateAU(license.date_of_birth || person?.birthdate || '', '-');
  const expiry = formatDateAU(license.expiry_at || '', '-');
  const status = formatStatusLabel(license.status || '');
  const licenceType = Array.isArray(license.license_classes) && license.license_classes.length > 0
    ? license.license_classes.join(', ')
    : '-';
  const conditions = Array.isArray(license.conditions) && license.conditions.length > 0
    ? license.conditions.join(', ')
    : '-';
  const mugshot = String(license.mugshot_url || '').trim();
  const gender = formatGenderLabel(license.gender || person?.gender || '');

  return (
    <div
      className="relative overflow-hidden rounded-[18px] border border-[#7ca270] p-4 text-[#0f2215] shadow-[0_18px_40px_rgba(5,24,13,0.32)]"
      style={{
        backgroundImage: 'radial-gradient(circle at 20% 40%, rgba(255,255,255,0.55), rgba(255,255,255,0.12) 34%, transparent 50%), repeating-linear-gradient(168deg, rgba(93,145,78,0.26) 0px, rgba(93,145,78,0.26) 2px, rgba(226,244,216,0.16) 2px, rgba(226,244,216,0.16) 8px), linear-gradient(160deg, #dbeec9 0%, #c4e1a8 45%, #d8ecc6 100%)',
      }}
    >
      <div className="mb-3 rounded-[10px] bg-gradient-to-r from-[#044497] to-[#1c5dab] px-4 py-2 text-center text-white shadow-inner">
        <p className="text-[28px] leading-none font-black tracking-[0.08em]">DRIVER LICENCE</p>
        <p className="text-[24px] leading-none font-extrabold tracking-[0.06em]">VICTORIA AUSTRALIA</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_210px] gap-4 items-start">
        <div>
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.07em] text-[#354a3a] font-bold">Name</p>
              <p className="mt-1 text-[34px] leading-none font-extrabold uppercase tracking-[0.02em] break-words">{fullName}</p>
            </div>
            <div className="sm:text-right min-w-0">
              <p className="text-[11px] uppercase tracking-[0.07em] text-[#354a3a] font-bold">Licence No.</p>
              <p className="mt-1 text-[34px] leading-none font-extrabold tracking-[0.02em] break-all">{licenceNumber}</p>
            </div>
          </div>

          <div className="mt-4 border-t border-[#18382442] pt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2">
            <div>
              <p className="text-[11px] uppercase tracking-[0.07em] text-[#32493a] font-bold">Licence Expiry</p>
              <p className="text-[29px] leading-none font-extrabold">{expiry}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.07em] text-[#32493a] font-bold">Date Of Birth</p>
              <p className="text-[29px] leading-none font-extrabold">{dob}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.07em] text-[#32493a] font-bold">Licence Type</p>
              <p className="text-[29px] leading-none font-extrabold break-words">{licenceType}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.07em] text-[#32493a] font-bold">Conditions</p>
              <p className="text-[29px] leading-none font-extrabold break-words">{conditions}</p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-[12px]">
            <span className="rounded-full border border-[#18382442] bg-white/45 px-2 py-1">Status: <strong>{status || '-'}</strong></span>
            <span className="rounded-full border border-[#18382442] bg-white/45 px-2 py-1">Gender: <strong>{gender || '-'}</strong></span>
            <span className="rounded-full border border-[#18382442] bg-white/45 px-2 py-1">Citizen ID: <strong className="font-mono">{person?.citizenid || '-'}</strong></span>
          </div>
        </div>

        <div className="flex flex-col items-start gap-2">
          <div className="h-[250px] w-[210px] rounded-[8px] border border-[#18382472] bg-white/45 overflow-hidden">
            {mugshot ? (
              <img src={mugshot} alt="Licence photo" className="h-full w-full object-cover object-top" />
            ) : null}
          </div>
          <img src="/vicroads-logo.png" alt="VicRoads" className="h-auto w-[152px] rounded border border-[#18382459] bg-white/90 p-0.5" />
        </div>
      </div>
    </div>
  );
}

export default function Search() {
  const { activeDepartment } = useDepartment();
  const layoutType = getDepartmentLayoutType(activeDepartment);
  const isLaw = layoutType === DEPARTMENT_LAYOUT.LAW_ENFORCEMENT;
  const isParamedics = layoutType === DEPARTMENT_LAYOUT.PARAMEDICS;
  const isFire = layoutType === DEPARTMENT_LAYOUT.FIRE;

  const [searchType, setSearchType] = useState('person');
  const [personFirstName, setPersonFirstName] = useState('');
  const [personLastName, setPersonLastName] = useState('');
  const [vehicleQuery, setVehicleQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const [selectedPerson, setSelectedPerson] = useState(null);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [vehicleOwner, setVehicleOwner] = useState(null);
  const [showRecordsModal, setShowRecordsModal] = useState(false);

  const [licenseStatusDraft, setLicenseStatusDraft] = useState('valid');
  const [registrationStatusDraft, setRegistrationStatusDraft] = useState('valid');
  const [licenseStatusSaving, setLicenseStatusSaving] = useState(false);
  const [registrationStatusSaving, setRegistrationStatusSaving] = useState(false);

  const personQuery = [
    String(personFirstName || '').trim(),
    String(personLastName || '').trim(),
  ].filter(Boolean).join(' ').trim();
  const activeQuery = searchType === 'person' ? personQuery : String(vehicleQuery || '').trim();
  const canSearch = activeQuery.length >= 2;
  const pageTitle = isLaw ? 'Licence & Registration Search' : isParamedics ? 'Patient Analysis' : 'Incident Lookup';
  const personTabLabel = isParamedics ? 'Patient' : isFire ? 'Occupant / Person' : 'Person';
  const vehicleTabLabel = isFire ? 'Vehicle / Asset' : 'Vehicle';
  const personFirstLabel = isFire ? 'Occupant / Contact First Name' : 'First Name';
  const personLastLabel = isFire ? 'Occupant / Contact Last Name' : 'Last Name';
  const personFirstPlaceholder = isParamedics ? 'Patient first name' : isFire ? 'Occupant/contact first name' : 'Person first name';
  const personLastPlaceholder = isParamedics ? 'Patient last name' : isFire ? 'Occupant/contact last name' : 'Person last name';
  const vehicleSearchLabel = isFire ? 'Plate, Owner, Or Vehicle Model' : 'Plate, Owner, Or Model';
  const vehicleSearchPlaceholder = isFire
    ? 'Search incident vehicle by plate, owner, or model...'
    : 'Search by plate, owner name, or model...';
  const recordsButtonLabel = isFire ? 'Open Incident Reports' : 'Add / Manage Records';
  const recordsModalTitle = isFire
    ? (selectedPerson ? `Incident Reports - ${resolvePersonName(selectedPerson)}` : 'Incident Reports')
    : (selectedPerson ? `Records - ${resolvePersonName(selectedPerson)}` : 'Records');

  useEffect(() => {
    if (isParamedics && searchType !== 'person') {
      setSearchType('person');
    }
  }, [isParamedics, searchType]);

  async function doSearch(e) {
    e.preventDefault();
    if (!canSearch) return;
    setSearching(true);
    setResults([]);
    try {
      const endpoint = searchType === 'person' ? '/api/search/cad/persons' : '/api/search/cad/vehicles';
      const query = searchType === 'person'
        ? [
            `first_name=${encodeURIComponent(String(personFirstName || '').trim())}`,
            `last_name=${encodeURIComponent(String(personLastName || '').trim())}`,
            `q=${encodeURIComponent(activeQuery)}`,
          ].join('&')
        : `q=${encodeURIComponent(activeQuery)}`;
      const data = await api.get(`${endpoint}?${query}`);
      setResults(Array.isArray(data) ? data : []);
    } catch (err) {
      alert('Search failed:\n' + formatErr(err));
    } finally {
      setSearching(false);
    }
  }

  async function selectPerson(person) {
    setSelectedVehicle(null);
    setVehicleOwner(null);

    const citizenId = String(person?.citizenid || '').trim();
    if (!citizenId) return;

    try {
      const details = await api.get(`/api/search/cad/persons/${encodeURIComponent(citizenId)}`);
      const resolved = details && typeof details === 'object' ? details : person;
      setSelectedPerson(resolved);
      setLicenseStatusDraft(String(resolved?.cad_driver_license?.status || 'valid'));
    } catch (err) {
      alert('Failed to load person details:\n' + formatErr(err));
    }
  }

  async function selectVehicle(vehicle) {
    setSelectedPerson(null);
    setVehicleOwner(null);

    const plate = String(vehicle?.plate || '').trim();
    if (!plate) return;

    try {
      const details = await api.get(`/api/search/cad/vehicles/${encodeURIComponent(plate)}`);
      const resolved = details && typeof details === 'object' ? details : vehicle;
      setSelectedVehicle(resolved);
      setRegistrationStatusDraft(String(resolved?.cad_registration?.status || 'valid'));

      const ownerCitizenId = String(resolved?.owner || '').trim();
      if (ownerCitizenId) {
        try {
          const owner = await api.get(`/api/search/cad/persons/${encodeURIComponent(ownerCitizenId)}`);
          setVehicleOwner(owner && typeof owner === 'object' ? owner : null);
        } catch {
          setVehicleOwner(null);
        }
      }
    } catch (err) {
      alert('Failed to load vehicle details:\n' + formatErr(err));
    }
  }

  async function savePersonLicenseStatus() {
    const citizenId = String(selectedPerson?.citizenid || '').trim();
    if (!citizenId || !selectedPerson?.cad_driver_license) return;

    setLicenseStatusSaving(true);
    try {
      const updated = await api.patch(
        `/api/search/persons/${encodeURIComponent(citizenId)}/license`,
        { status: licenseStatusDraft }
      );
      setSelectedPerson((current) => {
        if (!current || String(current.citizenid || '').trim() !== citizenId) return current;
        return { ...current, cad_driver_license: updated };
      });
    } catch (err) {
      alert('Failed to update license status:\n' + formatErr(err));
    } finally {
      setLicenseStatusSaving(false);
    }
  }

  async function saveVehicleRegistrationStatus() {
    const plate = String(selectedVehicle?.plate || '').trim();
    if (!plate || !selectedVehicle?.cad_registration) return;

    setRegistrationStatusSaving(true);
    try {
      const updated = await api.patch(
        `/api/search/vehicles/${encodeURIComponent(plate)}/registration`,
        { status: registrationStatusDraft }
      );

      setSelectedVehicle((current) => {
        if (!current || String(current.plate || '').trim() !== plate) return current;
        return { ...current, cad_registration: updated };
      });
    } catch (err) {
      alert('Failed to update registration status:\n' + formatErr(err));
    } finally {
      setRegistrationStatusSaving(false);
    }
  }

  const personRegistrations = Array.isArray(selectedPerson?.cad_vehicle_registrations)
    ? selectedPerson.cad_vehicle_registrations
    : [];
  const recordsEmbeddedPerson = useMemo(() => buildRecordsPerson(selectedPerson), [selectedPerson]);
  const selectedPersonRecordCount = Math.max(0, Number(selectedPerson?.criminal_record_count || 0));
  const selectedPersonMedicalCount = Math.max(0, Number(selectedPerson?.medical_analysis_count || 0));
  const selectedPersonWarrants = Array.isArray(selectedPerson?.active_warrants)
    ? selectedPerson.active_warrants
    : (Array.isArray(selectedPerson?.warrants) ? selectedPerson.warrants : []);

  return (
    <div>
      <h2 className="text-xl font-bold mb-6">
        {pageTitle}
      </h2>

      {isFire && (
        <div className="bg-cad-card border border-cad-border rounded-xl p-4 mb-6">
          <h3 className="text-sm font-semibold text-cad-muted uppercase tracking-wider">Fire Lookup Guidance</h3>
          <p className="text-sm text-cad-muted mt-2">
            Use this tab to identify occupants/contacts and incident vehicles. Open Incident Reports from a selected person to document the fire response report.
          </p>
        </div>
      )}

      <div className="bg-cad-card border border-cad-border rounded-2xl p-4 mb-6">
        <form onSubmit={doSearch} className="flex flex-col gap-3">
          <div className="flex bg-cad-surface rounded-lg border border-cad-border overflow-hidden">
            <button
              type="button"
              onClick={() => setSearchType('person')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                searchType === 'person' ? 'bg-cad-accent text-white' : 'text-cad-muted hover:text-cad-ink'
              }`}
            >
              {personTabLabel}
            </button>
            {!isParamedics && (
              <button
                type="button"
                onClick={() => setSearchType('vehicle')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  searchType === 'vehicle' ? 'bg-cad-accent text-white' : 'text-cad-muted hover:text-cad-ink'
                }`}
              >
                {vehicleTabLabel}
              </button>
            )}
          </div>

          {searchType === 'person' ? (
            <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
              <div>
                <label className="block text-xs text-cad-muted mb-1">{personFirstLabel}</label>
                <input
                  type="text"
                  value={personFirstName}
                  onChange={(e) => setPersonFirstName(e.target.value)}
                  placeholder={personFirstPlaceholder}
                  className="w-full bg-cad-surface border border-cad-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
                />
              </div>
              <div>
                <label className="block text-xs text-cad-muted mb-1">{personLastLabel}</label>
                <input
                  type="text"
                  value={personLastName}
                  onChange={(e) => setPersonLastName(e.target.value)}
                  placeholder={personLastPlaceholder}
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
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
              <div>
                <label className="block text-xs text-cad-muted mb-1">{vehicleSearchLabel}</label>
                <input
                  type="text"
                  value={vehicleQuery}
                  onChange={(e) => setVehicleQuery(e.target.value)}
                  placeholder={vehicleSearchPlaceholder}
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
            </div>
          )}
        </form>
      </div>

      {results.length > 0 && (
        <div className="bg-cad-card border border-cad-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-cad-border">
            <span className="text-sm text-cad-muted">{results.length} result(s)</span>
          </div>
          <SearchResults
            type={searchType}
            results={results}
            onSelect={searchType === 'person' ? selectPerson : selectVehicle}
          />
        </div>
      )}

      <Modal
        open={!!selectedPerson}
        onClose={() => {
          setSelectedPerson(null);
          setShowRecordsModal(false);
          setLicenseStatusDraft('valid');
        }}
        title={selectedPerson ? resolvePersonName(selectedPerson) : ''}
        wide
      >
        {selectedPerson && (
          isParamedics ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {selectedPersonMedicalCount > 0 ? (
                  <div className="px-3 py-2 rounded-lg border border-cyan-500/40 bg-cyan-500/10 text-sm text-cyan-200">
                    Medical History: {selectedPersonMedicalCount} analys{selectedPersonMedicalCount === 1 ? 'is' : 'es'}
                    {selectedPerson?.medical_last_analysis_at ? ` | Last: ${formatDateTimeAU(`${selectedPerson.medical_last_analysis_at}Z`, '-', false)}` : ''}
                  </div>
                ) : (
                  <div className="px-3 py-2 rounded-lg border border-cad-border bg-cad-surface text-sm text-cad-muted">
                    No recorded patient analyses yet.
                  </div>
                )}
              </div>
              <PatientAnalysisPanel
                person={selectedPerson}
                activeDepartmentId={activeDepartment?.id || null}
              />
            </div>
          ) : (
            <div className="space-y-4">
            {isFire && (
              <div className="bg-cad-surface border border-cad-border rounded-lg px-3 py-3">
                <h4 className="text-sm font-semibold text-cad-muted uppercase tracking-wider mb-1">
                  Incident Context
                </h4>
                <p className="text-sm text-cad-muted">
                  Use this person as an occupant, owner, or reporting contact, then open Incident Reports to document the fire response report.
                </p>
              </div>
            )}

            {isLaw && (selectedPerson.has_warrant || selectedPerson.has_bolo || selectedPerson.repeat_offender) ? (
              <div className="flex flex-wrap gap-2">
                {selectedPerson.has_warrant ? (
                  <div className="px-3 py-2 rounded-lg border border-red-500/40 bg-red-500/10 text-sm text-red-200">
                    Active Warrant{Number(selectedPerson.warrant_count || 0) > 1 ? `s (${Number(selectedPerson.warrant_count)})` : ''}
                  </div>
                ) : null}
                {selectedPerson.has_bolo ? (
                  <div className="px-3 py-2 rounded-lg border border-amber-500/40 bg-amber-500/10 text-sm text-amber-200">
                    Active BOLO{Number(selectedPerson.bolo_count || 0) > 1 ? `s (${Number(selectedPerson.bolo_count)})` : ''}
                  </div>
                ) : null}
                {selectedPerson.repeat_offender ? (
                  <div className="px-3 py-2 rounded-lg border border-fuchsia-500/40 bg-fuchsia-500/10 text-sm text-fuchsia-200">
                    Repeat Offender Flag ({selectedPersonRecordCount} records)
                  </div>
                ) : null}
              </div>
            ) : null}

            {isLaw && selectedPersonRecordCount > 0 ? (
              <div className="bg-cad-surface border border-cad-border rounded-lg px-3 py-3">
                <h4 className="text-sm font-semibold text-cad-muted uppercase tracking-wider mb-1">
                  Criminal History Summary
                </h4>
                <p className="text-sm text-cad-muted">
                  {selectedPersonRecordCount} record{selectedPersonRecordCount === 1 ? '' : 's'} found for this citizen.
                  {selectedPerson.repeat_offender ? ' Repeat-offender flag is active.' : ''}
                </p>
              </div>
            ) : null}

            {isLaw && selectedPersonWarrants.length > 0 ? (
              <div className="bg-cad-surface border border-red-500/25 rounded-lg px-3 py-3">
                <h4 className="text-sm font-semibold text-red-300 uppercase tracking-wider mb-2">
                  Warrant Alerts ({selectedPersonWarrants.length})
                </h4>
                <div className="space-y-2">
                  {selectedPersonWarrants.slice(0, 5).map((warrant) => (
                    <div key={warrant.id} className="bg-cad-card border border-red-500/20 rounded px-3 py-2">
                      <p className="text-sm text-cad-ink">{warrant.title || 'Active Warrant'}</p>
                      {warrant.description ? (
                        <p className="text-xs text-cad-muted mt-1 whitespace-pre-wrap">{warrant.description}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="bg-cad-surface border border-cad-border rounded-lg px-3 py-3">
              <h4 className="text-sm font-semibold text-cad-muted uppercase tracking-wider mb-2">
                {isFire ? 'Licence / Identity (CAD)' : 'Driver Licence (CAD)'}
              </h4>
              {selectedPerson.cad_driver_license ? (
                <div className="space-y-3">
                  <CadVictoriaLicenseCard person={selectedPerson} />
                  {isLaw ? (
                    <div className="flex flex-col md:flex-row gap-2 md:items-center">
                      <select
                        value={licenseStatusDraft}
                        onChange={(e) => setLicenseStatusDraft(e.target.value)}
                        className="bg-cad-card border border-cad-border rounded px-3 py-2 text-sm"
                      >
                        {LICENSE_STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {formatStatusLabel(status)}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={savePersonLicenseStatus}
                        disabled={licenseStatusSaving}
                        className="px-3 py-2 bg-cad-accent hover:bg-cad-accent-light text-white rounded text-sm font-medium transition-colors disabled:opacity-50"
                      >
                        {licenseStatusSaving ? 'Saving...' : 'Update Licence Status'}
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-cad-muted">
                      Fire users can view licence/identity details here for incident context. Status changes are managed by police/admin workflows.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-cad-muted">No CAD driver licence record found.</p>
              )}
            </div>

            {!isParamedics && (
              <div className="bg-cad-surface border border-cad-border rounded-lg px-3 py-3">
                <h4 className="text-sm font-semibold text-cad-muted uppercase tracking-wider mb-2">
                  {isFire ? 'Known Vehicles / Registrations' : 'Registrations'} ({personRegistrations.length})
                </h4>
                {personRegistrations.length > 0 ? (
                  <div className="space-y-2">
                    {personRegistrations.map((reg) => (
                      <button
                        key={`${reg.plate_normalized || reg.plate}`}
                        type="button"
                        onClick={() => selectVehicle({ plate: reg.plate })}
                        className="w-full text-left bg-cad-card rounded px-3 py-2 text-sm hover:bg-cad-surface border border-cad-border/40"
                      >
                        <div className="flex flex-wrap items-center gap-4">
                          <span className="font-mono font-bold text-cad-accent-light">{reg.plate}</span>
                          <span>{reg.vehicle_model || '-'}</span>
                          <span className="text-cad-muted">{reg.vehicle_colour || '-'}</span>
                        </div>
                        <div className="mt-1 text-xs text-cad-muted">
                          Status: {formatStatusLabel(reg.status)} | Expiry: {formatDateAU(reg.expiry_at || '', '-')}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-cad-muted">
                    No CAD registrations found for this {isFire ? 'person/contact' : 'person'}.
                  </p>
                )}
              </div>
            )}

            <div className="pt-1 flex justify-end">
              <button
                type="button"
                onClick={() => setShowRecordsModal(true)}
                className="px-4 py-2 bg-cad-accent hover:bg-cad-accent-light text-white rounded text-sm font-medium transition-colors"
              >
                {recordsButtonLabel}
              </button>
            </div>
            </div>
          )
        )}
      </Modal>

      <Modal
        open={!!selectedVehicle}
        onClose={() => {
          setSelectedVehicle(null);
          setVehicleOwner(null);
          setRegistrationStatusDraft('valid');
        }}
        title={selectedVehicle ? `Vehicle ${selectedVehicle.plate || ''}` : ''}
        wide
      >
        {selectedVehicle && (
          <div className="space-y-4">
            <div className="bg-cad-surface border border-cad-border rounded-lg px-3 py-3">
              <h4 className="text-sm font-semibold text-cad-muted uppercase tracking-wider mb-2">
                {isFire ? 'Vehicle / Asset Registration (CAD)' : 'Registration (CAD)'}
              </h4>
              {selectedVehicle.cad_registration ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                    <p>Plate: <span className="text-cad-ink">{selectedVehicle.cad_registration.plate || '-'}</span></p>
                    <p>Owner: <span className="text-cad-ink">{selectedVehicle.cad_registration.owner_name || '-'}</span></p>
                    <p>Model: <span className="text-cad-ink">{selectedVehicle.cad_registration.vehicle_model || '-'}</span></p>
                    <p>Colour: <span className="text-cad-ink">{selectedVehicle.cad_registration.vehicle_colour || '-'}</span></p>
                    <p>Expiry: <span className="text-cad-ink">{formatDateAU(selectedVehicle.cad_registration.expiry_at || '', '-')}</span></p>
                    <p>Status: <span className="text-cad-ink">{formatStatusLabel(selectedVehicle.cad_registration.status)}</span></p>
                  </div>
                  {isLaw ? (
                    <div className="flex flex-col md:flex-row gap-2 md:items-center">
                      <select
                        value={registrationStatusDraft}
                        onChange={(e) => setRegistrationStatusDraft(e.target.value)}
                        className="bg-cad-card border border-cad-border rounded px-3 py-2 text-sm"
                      >
                        {REGISTRATION_STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {formatStatusLabel(status)}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={saveVehicleRegistrationStatus}
                        disabled={registrationStatusSaving}
                        className="px-3 py-2 bg-cad-accent hover:bg-cad-accent-light text-white rounded text-sm font-medium transition-colors disabled:opacity-50"
                      >
                        {registrationStatusSaving ? 'Saving...' : 'Update Registration Status'}
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-cad-muted">
                      Registration data is shown as reference for fire incident context.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-cad-muted">No CAD registration record found.</p>
              )}
            </div>

            {vehicleOwner && (
              <div className="bg-cad-surface rounded px-3 py-3">
                <h4 className="text-sm font-semibold text-cad-muted uppercase tracking-wider mb-2">
                  {isFire ? 'Registered Owner / Linked Person' : 'Registered Owner'}
                </h4>
                <p className="text-sm">{resolvePersonName(vehicleOwner)}</p>
                <p className="text-xs text-cad-muted">Citizen ID: {vehicleOwner.citizenid || '-'}</p>
                <div className="mt-2">
                  <MugshotPreview url={vehicleOwner?.cad_driver_license?.mugshot_url} />
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={!isParamedics && showRecordsModal && !!recordsEmbeddedPerson}
        onClose={() => setShowRecordsModal(false)}
        title={recordsModalTitle}
        wide
      >
        {recordsEmbeddedPerson && (
          <Records
            embeddedPerson={recordsEmbeddedPerson}
            embeddedDepartmentId={activeDepartment?.id || null}
            hideHeader
          />
        )}
      </Modal>
    </div>
  );
}

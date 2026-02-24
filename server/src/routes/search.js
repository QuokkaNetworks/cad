const express = require('express');
const { requireAuth, requireFiveMOnline } = require('../auth/middleware');
const {
  CriminalRecords,
  CadWarnings,
  Warrants,
  Bolos,
  PatientAnalyses,
  DriverLicenses,
  VehicleRegistrations,
  Units,
} = require('../db/sqlite');
const { audit } = require('../utils/audit');
const qbox = require('../db/qbox');
const FiveMPrintJobs = require('../services/fivemPrintJobs');
const { buildPrintedDocumentPdfAttachment } = require('../services/printedDocumentPdf');

const router = express.Router();
const DRIVER_LICENSE_STATUSES = new Set(['valid', 'suspended', 'disqualified', 'expired']);
const VEHICLE_REGISTRATION_STATUSES = new Set(['valid', 'suspended', 'revoked', 'expired']);
const REPEAT_OFFENDER_THRESHOLD = 3;

function buildPrintJobDeliveryTarget(req) {
  const activeLink = req?.fivemLink || null;
  return {
    user_id: Number(req?.user?.id || 0) || null,
    // Printed warnings should be delivered to the officer's inventory.
    citizen_id: String(activeLink?.citizen_id || '').trim(),
    game_id: String(activeLink?.game_id || '').trim(),
    steam_id: String(req?.user?.steam_id || '').trim(),
    discord_id: String(req?.user?.discord_id || '').trim(),
  };
}

function normalizeDateOnly(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const parsed = Date.parse(text);
  if (Number.isNaN(parsed)) return '';
  return new Date(parsed).toISOString().slice(0, 10);
}

function normalizeStatus(value, allowedStatuses) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!allowedStatuses.has(normalized)) return '';
  return normalized;
}

function shouldForceExpired(expiryAt) {
  const normalized = normalizeDateOnly(expiryAt);
  if (!normalized) return false;
  const today = new Date().toISOString().slice(0, 10);
  return normalized < today;
}

function splitFullName(fullName) {
  const normalized = String(fullName || '').trim();
  if (!normalized) return { firstname: '', lastname: '' };
  const parts = normalized.split(/\s+/);
  if (parts.length === 1) return { firstname: parts[0], lastname: '' };
  return {
    firstname: parts[0],
    lastname: parts.slice(1).join(' '),
  };
}

function normalizeGender(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return '';
  if (raw === '0' || raw === 'm' || raw === 'male' || raw === 'man') return 'male';
  if (raw === '1' || raw === 'f' || raw === 'female' || raw === 'woman') return 'female';
  return raw;
}

function normalizeLicenseForResponse(license) {
  if (!license || typeof license !== 'object') return license;
  return {
    ...license,
    gender: normalizeGender(license.gender),
  };
}

function normalizePersonForResponse(person) {
  if (!person || typeof person !== 'object') return person;
  const citizenid = String(person.citizenid || person.citizen_id || person.citizenId || '').trim();
  return {
    ...person,
    citizenid,
    gender: normalizeGender(person.gender),
  };
}

function normalizeNameKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}


function personMatchesNameFilters(person, firstNameFilter = '', lastNameFilter = '') {
  const firstNeedle = normalizeNameKey(firstNameFilter);
  const lastNeedle = normalizeNameKey(lastNameFilter);
  if (!firstNeedle && !lastNeedle) return true;

  const firstHay = normalizeNameKey(person?.firstname || '');
  const lastHay = normalizeNameKey(person?.lastname || '');
  const fullHay = normalizeNameKey(person?.full_name || `${person?.firstname || ''} ${person?.lastname || ''}`);

  if (firstNeedle && !(firstHay.includes(firstNeedle) || fullHay.includes(firstNeedle))) return false;
  if (lastNeedle && !(lastHay.includes(lastNeedle) || fullHay.includes(lastNeedle))) return false;
  return true;
}

function getScopedDepartmentIds(req) {
  if (!req?.user) return [];
  if (!Array.isArray(req.user.departments)) return [];
  return Array.from(new Set(
    req.user.departments
      .map((dept) => Number(dept?.id || 0))
      .filter((id) => Number.isInteger(id) && id > 0)
  ));
}

function parseJsonObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  const text = String(value || '').trim();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function extractWarrantSubjectName(warrant) {
  const details = parseJsonObject(warrant?.details_json);
  return String(
    warrant?.subject_name
    || details?.subject_name
    || details?.name
    || ''
  ).trim();
}

function warrantMatchesPerson(warrant, citizenId, fullName) {
  const normalizedCitizenId = String(citizenId || '').trim().toLowerCase();
  const warrantCitizenId = String(warrant?.citizen_id || '').trim().toLowerCase();
  if (normalizedCitizenId && warrantCitizenId && normalizedCitizenId === warrantCitizenId) return true;

  const personNameKey = normalizeNameKey(fullName);
  if (!personNameKey) return false;

  const subjectName = extractWarrantSubjectName(warrant);
  const subjectKey = normalizeNameKey(subjectName);
  if (subjectKey && (subjectKey === personNameKey || subjectKey.includes(personNameKey) || personNameKey.includes(subjectKey))) {
    return true;
  }

  const titleKey = normalizeNameKey(warrant?.title || '');
  if (titleKey && (titleKey.includes(personNameKey) || personNameKey.includes(titleKey))) {
    return true;
  }

  return false;
}

function findActivePersonWarrants(req, citizenId, fullName) {
  const departmentIds = getScopedDepartmentIds(req);
  if (departmentIds.length === 0) return [];
  if (!Array.isArray(req._activeScopedWarrants)) {
    req._activeScopedWarrants = Warrants.listByDepartmentIds(departmentIds, 'active');
  }
  const activeWarrants = req._activeScopedWarrants;
  return activeWarrants.filter((warrant) => warrantMatchesPerson(warrant, citizenId, fullName));
}

function findActivePersonBolos(req, citizenId, fullName) {
  const departmentIds = getScopedDepartmentIds(req);
  if (departmentIds.length === 0) return [];

  const needleCitizen = String(citizenId || '').trim().toLowerCase();
  const needleName = normalizeNameKey(fullName);
  if (!Array.isArray(req._activeScopedBolos)) {
    req._activeScopedBolos = Bolos.listByDepartmentIds(departmentIds, 'active');
  }
  return req._activeScopedBolos
    .filter((bolo) => {
      if (bolo.type !== 'person') return false;
      const details = parseJsonObject(bolo.details_json);
      const detailCitizenId = String(details?.citizen_id || '').trim().toLowerCase();
      const detailName = normalizeNameKey(details?.name || '');
      const hayTitle = normalizeNameKey(bolo.title || '');
      const hayDescription = normalizeNameKey(bolo.description || '');
      if (needleCitizen && detailCitizenId && detailCitizenId === needleCitizen) return true;
      if (needleName && detailName && (detailName === needleName || detailName.includes(needleName) || needleName.includes(detailName))) return true;
      if (needleName && hayTitle.includes(needleName)) return true;
      if (needleName && hayDescription.includes(needleName)) return true;
      return false;
    });
}

function buildCadPersonResponse(req, citizenId, license, fallbackName = '') {
  const cid = String(citizenId || '').trim();
  const fullName = String(license?.full_name || fallbackName || cid).trim();
  const names = splitFullName(fullName);
  const warrants = findActivePersonWarrants(req, cid, fullName);
  const bolos = findActivePersonBolos(req, cid, fullName);
  return {
    citizenid: cid,
    firstname: names.firstname,
    lastname: names.lastname,
    full_name: fullName,
    birthdate: String(license?.date_of_birth || '').trim(),
    gender: normalizeGender(license?.gender),
    has_warrant: warrants.length > 0,
    has_bolo: bolos.length > 0,
    warrant_count: warrants.length,
    bolo_count: bolos.length,
    warrants,
    bolos,
  };
}

function buildCadPersonFromSources(req, citizenId, {
  license = null,
  fallbackName = '',
  qboxPerson = null,
} = {}) {
  const cid = String(citizenId || '').trim();
  const qboxFirstName = String(qboxPerson?.firstname || '').trim();
  const qboxLastName = String(qboxPerson?.lastname || '').trim();
  const qboxFullName = String(
    qboxPerson?.full_name
    || `${qboxFirstName} ${qboxLastName}`.trim()
    || fallbackName
    || license?.full_name
    || cid
  ).trim();

  const base = buildCadPersonResponse(req, cid, license, qboxFullName);
  return {
    ...base,
    firstname: qboxFirstName || base.firstname,
    lastname: qboxLastName || base.lastname,
    full_name: qboxFullName || base.full_name,
    birthdate: String(license?.date_of_birth || qboxPerson?.birthdate || base.birthdate || '').trim(),
    gender: normalizeGender(license?.gender ?? qboxPerson?.gender ?? base.gender),
    phone: String(qboxPerson?.phone || '').trim(),
    nationality: String(qboxPerson?.nationality || '').trim(),
    custom_fields: (qboxPerson && typeof qboxPerson.custom_fields === 'object') ? qboxPerson.custom_fields : {},
    lookup_fields: Array.isArray(qboxPerson?.lookup_fields) ? qboxPerson.lookup_fields : [],
  };
}

function normalizeVehicleSubjectKey(value) {
  return String(value || '').trim().toUpperCase();
}

function resolveOfficerWarningIdentity(req) {
  const unit = Units.findByUserId(req.user.id);
  const officerName = String(req.user?.steam_name || req.user?.email || 'Unknown Officer').trim() || 'Unknown Officer';
  return {
    officer_name: officerName,
    officer_callsign: String(unit?.callsign || '').trim(),
    department_id: Number(unit?.department_id || 0) || null,
  };
}

function buildWarningPrintDescription(warning) {
  const parts = [];
  const title = String(warning?.title || '').trim();
  if (title) parts.push(title);
  const subject = String(warning?.subject_display || warning?.subject_key || '').trim();
  if (subject) parts.push(subject);
  return parts.join(' | ').slice(0, 500);
}

function decoratePersonHistoryFlags(person, {
  recordCount = 0,
  medicalCount = 0,
  medicalLastAnalysisAt = null,
} = {}) {
  const normalizedRecordCount = Math.max(0, Number(recordCount || 0));
  const normalizedMedicalCount = Math.max(0, Number(medicalCount || 0));
  return {
    ...person,
    active_warrant_count: Math.max(0, Number(person?.warrant_count || 0)),
    active_bolo_count: Math.max(0, Number(person?.bolo_count || 0)),
    criminal_record_count: normalizedRecordCount,
    repeat_offender: normalizedRecordCount >= REPEAT_OFFENDER_THRESHOLD,
    repeat_offender_threshold: REPEAT_OFFENDER_THRESHOLD,
    medical_analysis_count: normalizedMedicalCount,
    medical_last_analysis_at: medicalLastAnalysisAt || null,
  };
}

function buildCadVehicleResponse(registration) {
  const reg = registration || {};
  const plate = String(reg.plate || '').trim();
  return {
    plate,
    owner: String(reg.citizen_id || '').trim(),
    owner_name: String(reg.owner_name || '').trim(),
    vehicle: String(reg.vehicle_model || '').trim(),
    vehicle_model: String(reg.vehicle_model || '').trim(),
    vehicle_colour: String(reg.vehicle_colour || '').trim(),
    warning_count: CadWarnings.countActiveBySubject('vehicle', normalizeVehicleSubjectKey(plate)),
    cad_registration: reg,
  };
}

// Search persons in QBox
router.get('/persons', requireAuth, async (req, res) => {
  const { q } = req.query;
  if (!q || q.trim().length < 2) {
    return res.status(400).json({ error: 'Search query must be at least 2 characters' });
  }
  try {
    const results = await qbox.searchCharacters(q.trim());

    // Add warrant and BOLO flags to each result
    const enrichedResults = results.map(person => {
      const normalizedPerson = normalizePersonForResponse(person);
      const citizenId = String(normalizedPerson.citizenid || '').trim();
      const personFullName = String(
        normalizedPerson.full_name
        || `${normalizedPerson.firstname || ''} ${normalizedPerson.lastname || ''}`.trim()
      ).trim();
      const warrants = findActivePersonWarrants(req, normalizedPerson.citizenid, personFullName);
      const personBolos = findActivePersonBolos(req, normalizedPerson.citizenid, personFullName);

      return {
        ...normalizedPerson,
        cad_driver_license: citizenId ? normalizeLicenseForResponse(DriverLicenses.findByCitizenId(citizenId)) : null,
        has_warrant: warrants.length > 0,
        has_bolo: personBolos.length > 0,
        warrant_count: warrants.length,
        bolo_count: personBolos.length,
      };
    });

    res.json(enrichedResults);
  } catch (err) {
    res.status(500).json({ error: 'Search failed', message: err.message });
  }
});

// Get a specific person by citizen ID
router.get('/persons/:citizenid', requireAuth, async (req, res) => {
  try {
    const person = await qbox.getCharacterById(req.params.citizenid);
    if (!person) return res.status(404).json({ error: 'Person not found' });
    const normalizedPerson = normalizePersonForResponse(person);

    // Add warrant and BOLO flags
    const personFullName = String(
      normalizedPerson.full_name
      || `${normalizedPerson.firstname || ''} ${normalizedPerson.lastname || ''}`.trim()
    ).trim();
    const warrants = findActivePersonWarrants(req, normalizedPerson.citizenid, personFullName);
    const personBolos = findActivePersonBolos(req, normalizedPerson.citizenid, personFullName);

    const enrichedPerson = {
      ...normalizedPerson,
      has_warrant: warrants.length > 0,
      has_bolo: personBolos.length > 0,
      warrant_count: warrants.length,
      bolo_count: personBolos.length,
      warrants,
      bolos: personBolos,
      active_warnings: CadWarnings.listBySubject('person', normalizedPerson.citizenid, 'active', 25),
      warning_count: CadWarnings.countActiveBySubject('person', normalizedPerson.citizenid),
      cad_driver_license: normalizeLicenseForResponse(DriverLicenses.findByCitizenId(normalizedPerson.citizenid)),
      cad_vehicle_registrations: VehicleRegistrations.listByCitizenId(normalizedPerson.citizenid),
    };

    res.json(enrichedPerson);
  } catch (err) {
    res.status(500).json({ error: 'Lookup failed', message: err.message });
  }
});

// Get vehicles owned by a person
router.get('/persons/:citizenid/vehicles', requireAuth, async (req, res) => {
  try {
    const vehicles = await qbox.getVehiclesByOwner(req.params.citizenid);
    const enriched = Array.isArray(vehicles)
      ? vehicles.map((vehicle) => ({
          ...vehicle,
          cad_registration: VehicleRegistrations.findByPlate(vehicle?.plate || ''),
        }))
      : [];
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: 'Lookup failed', message: err.message });
  }
});

// Get criminal records for a person
router.get('/persons/:citizenid/records', requireAuth, (req, res) => {
  const records = CriminalRecords.findByCitizenId(req.params.citizenid);
  res.json(records);
});

// Search vehicles in QBox
router.get('/vehicles', requireAuth, async (req, res) => {
  const { q } = req.query;
  if (!q || q.trim().length < 2) {
    return res.status(400).json({ error: 'Search query must be at least 2 characters' });
  }
  try {
    const results = await qbox.searchVehicles(q.trim());
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: 'Search failed', message: err.message });
  }
});

// Get a specific vehicle by plate
router.get('/vehicles/:plate', requireAuth, async (req, res) => {
  const plate = String(req.params.plate || '').trim();
  if (!plate) return res.status(400).json({ error: 'plate is required' });
  try {
    const vehicle = await qbox.getVehicleByPlate(plate);
    if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });
    res.json({
      ...vehicle,
      cad_registration: VehicleRegistrations.findByPlate(plate),
      active_warnings: CadWarnings.listBySubject('vehicle', normalizeVehicleSubjectKey(plate), 'active', 25),
      warning_count: CadWarnings.countActiveBySubject('vehicle', normalizeVehicleSubjectKey(plate)),
    });
  } catch (err) {
    res.status(500).json({ error: 'Lookup failed', message: err.message });
  }
});

// ============================================================================
// CAD-native search (licenses/registrations with QBX fallback for people without CAD docs)
// ============================================================================

router.get('/cad/persons', requireAuth, async (req, res) => {
  const q = String(req.query?.q || '').trim();
  const firstNameFilter = String(req.query?.first_name || '').trim();
  const lastNameFilter = String(req.query?.last_name || '').trim();
  if (q.length < 2 && firstNameFilter.length < 2 && lastNameFilter.length < 2) {
    return res.status(400).json({ error: 'Search query must be at least 2 characters' });
  }

  try {
    const byCitizen = new Map();

    for (const license of DriverLicenses.search(q, 100)) {
      const normalizedLicense = normalizeLicenseForResponse(license);
      const citizenId = String(normalizedLicense?.citizen_id || '').trim();
      if (!citizenId) continue;
      byCitizen.set(citizenId, {
        ...buildCadPersonFromSources(req, citizenId, { license: normalizedLicense }),
        cad_driver_license: normalizedLicense,
      });
    }

    // Include owners from registration records even when no license exists yet.
    for (const reg of VehicleRegistrations.search(q, 100)) {
      const citizenId = String(reg?.citizen_id || '').trim();
      if (!citizenId || byCitizen.has(citizenId)) continue;
      byCitizen.set(citizenId, {
        ...buildCadPersonFromSources(req, citizenId, { fallbackName: reg.owner_name || citizenId }),
        cad_driver_license: null,
      });
    }

    // QBX fallback: keep people searchable even if they have no CAD licence/rego yet.
    let qboxMatches = [];
    try {
      qboxMatches = await qbox.searchCharacters(q);
    } catch (err) {
      console.warn('[Search] QBX person fallback search failed:', err.message);
    }

    for (const match of qboxMatches) {
      const citizenId = String(match?.citizenid || '').trim();
      if (!citizenId) continue;

      const existing = byCitizen.get(citizenId);
      const existingLicense = existing?.cad_driver_license || normalizeLicenseForResponse(DriverLicenses.findByCitizenId(citizenId)) || null;
      const existingFallbackName = existing?.full_name || '';
      byCitizen.set(citizenId, {
        ...buildCadPersonFromSources(req, citizenId, {
          license: existingLicense,
          fallbackName: existingFallbackName,
          qboxPerson: match,
        }),
        cad_driver_license: existingLicense,
      });
    }

    const filtered = Array.from(byCitizen.values())
      .filter((person) => personMatchesNameFilters(person, firstNameFilter, lastNameFilter))
      .slice(0, 100);

    const citizenIds = filtered
      .map((person) => String(person?.citizenid || '').trim())
      .filter(Boolean);
    const recordCounts = CriminalRecords.countByCitizenIds(citizenIds);
    const medicalCounts = PatientAnalyses.countByCitizenIds(citizenIds);

    res.json(filtered.map((person) => {
      const citizenId = String(person?.citizenid || '').trim();
      const medical = medicalCounts[citizenId] || {};
      const decorated = decoratePersonHistoryFlags(person, {
        recordCount: recordCounts[citizenId] || 0,
        medicalCount: Number(medical.count || 0),
        medicalLastAnalysisAt: medical.last_updated_at || null,
      });
      return {
        ...decorated,
        warning_count: CadWarnings.countActiveBySubject('person', citizenId),
      };
    }));
  } catch (err) {
    res.status(500).json({ error: 'Search failed', message: err.message });
  }
});

router.get('/cad/persons/:citizenid', requireAuth, async (req, res) => {
  const citizenId = String(req.params.citizenid || '').trim();
  if (!citizenId) return res.status(400).json({ error: 'citizenid is required' });

  try {
    const license = normalizeLicenseForResponse(DriverLicenses.findByCitizenId(citizenId));
    const registrations = VehicleRegistrations.listByCitizenId(citizenId);
    let qboxPerson = null;
    try {
      qboxPerson = await qbox.getCharacterById(citizenId);
    } catch (err) {
      console.warn(`[Search] QBX person lookup failed for ${citizenId}:`, err.message);
    }

    if (!license && registrations.length === 0 && !qboxPerson) {
      return res.status(404).json({ error: 'Person not found' });
    }

    const fallbackName = registrations[0]?.owner_name || license?.full_name || citizenId;
    const person = buildCadPersonFromSources(req, citizenId, {
      license,
      fallbackName,
      qboxPerson,
    });
    const recordCount = CriminalRecords.countByCitizenId(citizenId);
    const medicalSummary = PatientAnalyses.countByCitizenIds([citizenId])[citizenId] || {};
    const decoratedPerson = decoratePersonHistoryFlags(person, {
      recordCount,
      medicalCount: Number(medicalSummary.count || 0),
      medicalLastAnalysisAt: medicalSummary.last_updated_at || null,
    });
    res.json({
      ...decoratedPerson,
      active_warrants: Array.isArray(decoratedPerson.warrants) ? decoratedPerson.warrants : [],
      active_bolos: Array.isArray(decoratedPerson.bolos) ? decoratedPerson.bolos : [],
      active_warnings: CadWarnings.listBySubject('person', citizenId, 'active', 25),
      warning_count: CadWarnings.countActiveBySubject('person', citizenId),
      cad_driver_license: license || null,
      cad_vehicle_registrations: registrations,
    });
  } catch (err) {
    res.status(500).json({ error: 'Lookup failed', message: err.message });
  }
});

router.get('/cad/persons/:citizenid/vehicles', requireAuth, (req, res) => {
  const citizenId = String(req.params.citizenid || '').trim();
  if (!citizenId) return res.status(400).json({ error: 'citizenid is required' });
  try {
    const registrations = VehicleRegistrations.listByCitizenId(citizenId);
    res.json(registrations.map((reg) => ({
      ...buildCadVehicleResponse(reg),
      cad_registration: reg,
    })));
  } catch (err) {
    res.status(500).json({ error: 'Lookup failed', message: err.message });
  }
});

router.get('/cad/vehicles', requireAuth, (req, res) => {
  const q = String(req.query?.q || '').trim();
  if (q.length < 2) {
    return res.status(400).json({ error: 'Search query must be at least 2 characters' });
  }
  try {
    const results = VehicleRegistrations.search(q, 100).map((reg) => buildCadVehicleResponse(reg));
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: 'Search failed', message: err.message });
  }
});

router.get('/cad/vehicles/:plate', requireAuth, (req, res) => {
  const plate = String(req.params.plate || '').trim();
  if (!plate) return res.status(400).json({ error: 'plate is required' });
  try {
    const reg = VehicleRegistrations.findByPlate(plate);
    if (!reg) return res.status(404).json({ error: 'Vehicle not found' });
    const normalizedPlate = normalizeVehicleSubjectKey(plate);
    res.json({
      ...buildCadVehicleResponse(reg),
      active_warnings: CadWarnings.listBySubject('vehicle', normalizedPlate, 'active', 25),
      warning_count: CadWarnings.countActiveBySubject('vehicle', normalizedPlate),
    });
  } catch (err) {
    res.status(500).json({ error: 'Lookup failed', message: err.message });
  }
});

router.get('/cad/persons/:citizenid/warnings', requireAuth, (req, res) => {
  const citizenId = String(req.params.citizenid || '').trim();
  if (!citizenId) return res.status(400).json({ error: 'citizenid is required' });
  res.json(CadWarnings.listBySubject('person', citizenId, 'all', 100));
});

router.post('/cad/persons/:citizenid/warnings', requireAuth, (req, res) => {
  const citizenId = String(req.params.citizenid || '').trim();
  if (!citizenId) return res.status(400).json({ error: 'citizenid is required' });
  const title = String(req.body?.title || '').trim();
  const description = String(req.body?.description || '');
  if (!title) return res.status(400).json({ error: 'title is required' });
  const officer = resolveOfficerWarningIdentity(req);
  const warning = CadWarnings.create({
    subject_type: 'person',
    subject_key: citizenId,
    subject_display: String(req.body?.subject_display || citizenId).trim(),
    title,
    description,
    ...officer,
    created_by_user_id: req.user.id,
  });
  audit(req.user.id, 'person_warning_created', { warning_id: warning.id, citizen_id: citizenId, title });
  res.status(201).json(warning);
});

router.get('/cad/vehicles/:plate/warnings', requireAuth, (req, res) => {
  const plate = String(req.params.plate || '').trim();
  if (!plate) return res.status(400).json({ error: 'plate is required' });
  const key = normalizeVehicleSubjectKey(plate);
  res.json(CadWarnings.listBySubject('vehicle', key, 'all', 100));
});

router.post('/cad/vehicles/:plate/warnings', requireAuth, (req, res) => {
  const plate = String(req.params.plate || '').trim();
  if (!plate) return res.status(400).json({ error: 'plate is required' });
  const title = String(req.body?.title || '').trim();
  const description = String(req.body?.description || '');
  if (!title) return res.status(400).json({ error: 'title is required' });
  const officer = resolveOfficerWarningIdentity(req);
  const key = normalizeVehicleSubjectKey(plate);
  const warning = CadWarnings.create({
    subject_type: 'vehicle',
    subject_key: key,
    subject_display: String(req.body?.subject_display || plate).trim(),
    title,
    description,
    ...officer,
    created_by_user_id: req.user.id,
  });
  audit(req.user.id, 'vehicle_warning_created', { warning_id: warning.id, plate: key, title });
  res.status(201).json(warning);
});

router.patch('/warnings/:id', requireAuth, (req, res) => {
  const warningId = parseInt(req.params.id, 10);
  const warning = CadWarnings.findById(warningId);
  if (!warning) return res.status(404).json({ error: 'Warning not found' });
  const status = String(req.body?.status || '').trim().toLowerCase();
  if (!['resolved', 'cancelled', 'active'].includes(status)) {
    return res.status(400).json({ error: 'status must be active, resolved, or cancelled' });
  }
  const updated = CadWarnings.updateStatus(warningId, status, req.user.id);
  audit(req.user.id, 'warning_status_updated', {
    warning_id: warningId,
    subject_type: warning.subject_type,
    subject_key: warning.subject_key,
    status,
  });
  res.json(updated);
});

router.post('/warnings/:id/print', requireAuth, requireFiveMOnline, async (req, res) => {
  const warningId = parseInt(req.params.id, 10);
  if (!Number.isInteger(warningId) || warningId <= 0) {
    return res.status(400).json({ error: 'Invalid warning id' });
  }

  const warning = CadWarnings.findById(warningId);
  if (!warning) return res.status(404).json({ error: 'Warning not found' });

  const unit = Units.findByUserId(req.user.id);
  if (!unit) {
    return res.status(400).json({ error: 'You must be on duty to print documents in-game' });
  }

  const metadata = {
    source: 'cad_warning',
    warning_id: Number(warning.id || 0),
    subject_type: String(warning.subject_type || '').trim(),
    subject_key: String(warning.subject_key || '').trim(),
    subject_display: String(warning.subject_display || '').trim(),
    title: String(warning.title || '').trim(),
    notes: String(warning.description || '').trim(),
    officer_name: String(warning.officer_name || '').trim() || String(req.user?.steam_name || req.user?.email || 'Unknown Officer').trim(),
    officer_callsign: String(warning.officer_callsign || '').trim() || String(unit.callsign || '').trim(),
    status: String(warning.status || '').trim(),
    issued_at: new Date().toISOString(),
  };

  const printTitle = `Printed Warning #${warning.id}`;
  const printDescription = buildWarningPrintDescription(warning);
  let metadataWithPdf = metadata;
  try {
    const pdfAttachment = await buildPrintedDocumentPdfAttachment({
      title: printTitle,
      description: printDescription,
      document_subtype: 'written_warning',
      metadata,
    });
    metadataWithPdf = { ...metadata, ...pdfAttachment };
  } catch (err) {
    console.warn('[cad] Failed generating warning PDF:', err?.message || err);
  }

  const job = FiveMPrintJobs.create({
    ...buildPrintJobDeliveryTarget(req),
    department_id: Number(unit.department_id || 0) || null,
    document_type: 'cad_document',
    document_subtype: 'written_warning',
    title: printTitle,
    description: printDescription,
    metadata: metadataWithPdf,
  });

  audit(req.user.id, 'warning_print_job_created', {
    print_job_id: Number(job.id || 0),
    warning_id: Number(warning.id || 0),
    subject_type: String(warning.subject_type || ''),
    subject_key: String(warning.subject_key || ''),
    unit_id: Number(unit.id || 0),
    callsign: String(unit.callsign || ''),
  });

  return res.status(201).json({ ok: true, job });
});

// Update CAD driver license status/expiry.
router.patch('/persons/:citizenid/license', requireAuth, (req, res) => {
  const citizenId = String(req.params.citizenid || '').trim();
  if (!citizenId) return res.status(400).json({ error: 'citizenid is required' });

  const existing = DriverLicenses.findByCitizenId(citizenId);
  if (!existing) return res.status(404).json({ error: 'Driver license not found' });

  const updates = {};
  if (req.body?.status !== undefined) {
    const status = normalizeStatus(req.body.status, DRIVER_LICENSE_STATUSES);
    if (!status) {
      return res.status(400).json({ error: 'status must be valid, suspended, disqualified, or expired' });
    }
    updates.status = status;
  }
  if (req.body?.expiry_at !== undefined) {
    const expiryAt = normalizeDateOnly(req.body.expiry_at);
    if (!expiryAt && String(req.body.expiry_at || '').trim() !== '') {
      return res.status(400).json({ error: 'expiry_at must be a valid date' });
    }
    updates.expiry_at = expiryAt || null;
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid update fields supplied' });
  }

  updates.updated_by_user_id = req.user.id;
  let updated = DriverLicenses.update(existing.id, updates);
  if (updated && shouldForceExpired(updated.expiry_at)) {
    updated = DriverLicenses.update(existing.id, {
      status: 'expired',
      updated_by_user_id: req.user.id,
    });
  }

  audit(req.user.id, 'driver_license_updated', {
    citizen_id: citizenId,
    license_id: existing.id,
    updates,
  });

  res.json(updated);
});

// Update CAD vehicle registration status/expiry.
router.patch('/vehicles/:plate/registration', requireAuth, (req, res) => {
  const plate = String(req.params.plate || '').trim();
  if (!plate) return res.status(400).json({ error: 'plate is required' });

  const existing = VehicleRegistrations.findByPlate(plate);
  if (!existing) return res.status(404).json({ error: 'Vehicle registration not found' });

  const updates = {};
  if (req.body?.status !== undefined) {
    const status = normalizeStatus(req.body.status, VEHICLE_REGISTRATION_STATUSES);
    if (!status) {
      return res.status(400).json({ error: 'status must be valid, suspended, revoked, or expired' });
    }
    updates.status = status;
  }
  if (req.body?.expiry_at !== undefined) {
    const expiryAt = normalizeDateOnly(req.body.expiry_at);
    if (!expiryAt && String(req.body.expiry_at || '').trim() !== '') {
      return res.status(400).json({ error: 'expiry_at must be a valid date' });
    }
    updates.expiry_at = expiryAt || null;
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid update fields supplied' });
  }

  updates.updated_by_user_id = req.user.id;
  let updated = VehicleRegistrations.update(existing.id, updates);
  if (updated && shouldForceExpired(updated.expiry_at)) {
    updated = VehicleRegistrations.update(existing.id, {
      status: 'expired',
      updated_by_user_id: req.user.id,
    });
  }

  audit(req.user.id, 'vehicle_registration_updated', {
    plate: existing.plate,
    registration_id: existing.id,
    updates,
  });

  res.json(updated);
});

// Delete a CAD vehicle registration record by plate.
router.delete('/vehicles/:plate/registration', requireAuth, (req, res) => {
  const plate = String(req.params.plate || '').trim();
  if (!plate) return res.status(400).json({ error: 'plate is required' });

  const existing = VehicleRegistrations.findByPlate(plate);
  if (!existing) return res.status(404).json({ error: 'Vehicle registration not found' });

  VehicleRegistrations.delete(existing.id);

  audit(req.user.id, 'vehicle_registration_deleted', {
    plate: existing.plate,
    registration_id: existing.id,
    citizen_id: existing.citizen_id || '',
    owner_name: existing.owner_name || '',
  });

  res.json({ success: true, deleted: existing });
});

module.exports = router;

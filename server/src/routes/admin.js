const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const sharp = require('sharp');
const { requireAuth, requireAdmin } = require('../auth/middleware');
const {
  Users, Departments, UserDepartments, DiscordRoleMappings,
  Settings, AuditLog, Announcements, Units, FiveMPlayerLinks, FiveMJobSyncJobs, FiveMFineJobs, SubDepartments, OffenceCatalog,
  DriverLicenses, VehicleRegistrations,
} = require('../db/sqlite');
const { audit } = require('../utils/audit');
const bus = require('../utils/eventBus');
const qbox = require('../db/qbox');
const { processPendingFineJobs } = require('../services/fivemFineProcessor');
const {
  installOrUpdateResource,
  getStatus: getFiveMResourceStatus,
  startFiveMResourceAutoSync,
} = require('../services/fivemResourceManager');
const { sendTestWarrantCommunityPoster } = require('../utils/warrantCommunityPoster');

const router = express.Router();
router.use(requireAuth, requireAdmin);
const ACTIVE_LINK_MAX_AGE_MS = 5 * 60 * 1000;
const OFFENCE_CATEGORIES = new Set(['infringement', 'summary', 'indictment']);

function parseSqliteUtc(value) {
  const text = String(value || '').trim();
  if (!text) return NaN;
  const base = text.replace(' ', 'T');
  const normalized = base.endsWith('Z') ? base : `${base}Z`;
  return Date.parse(normalized);
}

function isActiveFiveMLink(link) {
  const ts = parseSqliteUtc(link?.updated_at);
  if (Number.isNaN(ts)) return false;
  return (Date.now() - ts) <= ACTIVE_LINK_MAX_AGE_MS;
}

function parseFiveMLinkKey(value) {
  const key = String(value || '').trim();
  if (!key) return { type: 'unknown', value: '' };
  if (key.startsWith('discord:')) {
    return { type: 'discord', value: key.slice('discord:'.length) };
  }
  if (key.startsWith('license:')) {
    return { type: 'license', value: key.slice('license:'.length) };
  }
  return { type: 'steam', value: key };
}

function normalizeOffenceCategory(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (OFFENCE_CATEGORIES.has(normalized)) return normalized;
  return 'infringement';
}

function parseOffenceIsActive(value) {
  if (value === undefined || value === null || value === '') return 1;
  if (typeof value === 'boolean') return value ? 1 : 0;
  const text = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'active', 'on'].includes(text)) return 1;
  if (['0', 'false', 'no', 'n', 'inactive', 'off'].includes(text)) return 0;
  return 1;
}

function parseOrderedIds(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value
      .map(id => Number(id))
      .filter(id => Number.isInteger(id) && id > 0)
  ));
}

function parseSortOrder(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.trunc(parsed));
}

function normalizeJobNameKey(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeJobGrade(value, { wildcard = false } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return wildcard ? -1 : 0;
  if (wildcard && parsed < 0) return -1;
  return Math.max(0, Math.trunc(parsed));
}

function jobMappingMatchesPreview(mapping, job) {
  const mappingName = normalizeJobNameKey(mapping?.job_name);
  const jobName = normalizeJobNameKey(job?.job_name);
  if (!mappingName || !jobName || mappingName !== jobName) return false;
  const mappingGrade = normalizeJobGrade(mapping?.job_grade, { wildcard: true });
  if (mappingGrade < 0) return true;
  return mappingGrade === normalizeJobGrade(job?.job_grade);
}

const uploadRoot = path.resolve(__dirname, '../../data/uploads/department-icons');
fs.mkdirSync(uploadRoot, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
    if (allowed.has(file.mimetype)) return cb(null, true);
    cb(new Error('Only PNG, JPG, WEBP, or GIF images are allowed'));
  },
});

router.post('/departments/upload-icon', upload.single('icon'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'icon file is required' });
  try {
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.webp`;
    const outputPath = path.join(uploadRoot, fileName);

    await sharp(req.file.buffer)
      .rotate()
      .resize(256, 256, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .webp({ quality: 88 })
      .toFile(outputPath);

    res.json({ icon: `/uploads/department-icons/${fileName}` });
  } catch (err) {
    next(err);
  }
});

// --- Users ---
router.get('/users', (req, res) => {
  const users = Users.list().map(u => {
    u.departments = UserDepartments.getForUser(u.id);
    return u;
  });
  res.json(users);
});

router.patch('/users/:id', (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const user = Users.findById(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const { is_admin, is_banned, preferred_citizen_id } = req.body;
  const updates = {};
  if (is_admin !== undefined) updates.is_admin = is_admin ? 1 : 0;
  if (is_banned !== undefined) updates.is_banned = is_banned ? 1 : 0;
  if (preferred_citizen_id !== undefined) updates.preferred_citizen_id = String(preferred_citizen_id || '').trim();

  Users.update(userId, updates);
  audit(req.user.id, 'user_updated', { targetUserId: userId, updates });

  if (is_banned) {
    Units.removeByUserId(userId);
  }

  res.json(Users.findById(userId));
});

// --- Departments ---
router.get('/departments', (req, res) => {
  const depts = Departments.list();
  const allSubs = SubDepartments.list();
  const withCounts = depts.map(d => ({
    ...d,
    sub_department_count: allSubs.filter(sd => sd.department_id === d.id).length,
  }));
  res.json(withCounts);
});

router.post('/departments', (req, res) => {
  const {
    name,
    short_name,
    color,
    icon,
    slogan,
    layout_type,
    fivem_job_name,
    fivem_job_grade,
  } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const dept = Departments.create({
    name,
    short_name,
    color,
    icon,
    slogan,
    layout_type,
    fivem_job_name: String(fivem_job_name || '').trim(),
    fivem_job_grade: Number.isFinite(Number(fivem_job_grade)) ? Number(fivem_job_grade) : 0,
  });
  audit(req.user.id, 'department_created', { departmentId: dept.id, name });
  res.status(201).json(dept);
});

router.patch('/departments/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const dept = Departments.findById(id);
  if (!dept) return res.status(404).json({ error: 'Department not found' });

  Departments.update(id, req.body);
  audit(req.user.id, 'department_updated', { departmentId: id });
  res.json(Departments.findById(id));
});

router.post('/departments/reorder', (req, res) => {
  const orderedIds = parseOrderedIds(req.body?.ordered_ids);
  if (!orderedIds.length) {
    return res.status(400).json({ error: 'ordered_ids is required' });
  }

  const departments = Departments.list();
  const existingIds = new Set(departments.map(d => d.id));
  if (orderedIds.some(id => !existingIds.has(id))) {
    return res.status(400).json({ error: 'ordered_ids contains unknown department id(s)' });
  }

  const provided = new Set(orderedIds);
  const remaining = departments
    .filter(d => !provided.has(d.id))
    .map(d => d.id);
  const finalOrder = [...orderedIds, ...remaining];

  Departments.reorder(finalOrder);
  audit(req.user.id, 'department_reordered', { ordered_ids: finalOrder });
  res.json(Departments.list());
});

router.delete('/departments/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const dept = Departments.findById(id);
  if (!dept) return res.status(404).json({ error: 'Department not found' });
  try {
    Departments.delete(id);
    audit(req.user.id, 'department_deleted', { departmentId: id });
    res.json({ success: true });
  } catch (err) {
    if (String(err.message).includes('FOREIGN KEY')) {
      return res.status(400).json({ error: 'Cannot delete department while records/units/mappings still reference it' });
    }
    throw err;
  }
});

// --- Sub Departments ---
router.get('/sub-departments', (req, res) => {
  const deptId = parseInt(req.query.department_id, 10);
  if (deptId) {
    return res.json(SubDepartments.listByDepartment(deptId));
  }
  res.json(SubDepartments.list());
});

router.post('/sub-departments', (req, res) => {
  const {
    department_id,
    name,
    short_name,
    color,
    is_active,
    fivem_job_name,
    fivem_job_grade,
  } = req.body;
  const deptId = parseInt(department_id, 10);
  if (!deptId || !name || !short_name) {
    return res.status(400).json({ error: 'department_id, name and short_name are required' });
  }
  const parent = Departments.findById(deptId);
  if (!parent) return res.status(400).json({ error: 'Parent department not found' });

  try {
    const sub = SubDepartments.create({
      department_id: deptId,
      name: String(name).trim(),
      short_name: String(short_name).trim(),
      color: color || parent.color || '#0052C2',
      is_active: is_active === undefined ? 1 : (is_active ? 1 : 0),
      fivem_job_name: String(fivem_job_name || '').trim(),
      fivem_job_grade: Number.isFinite(Number(fivem_job_grade)) ? Number(fivem_job_grade) : 0,
    });
    audit(req.user.id, 'sub_department_created', { subDepartmentId: sub.id, departmentId: deptId });
    res.status(201).json(sub);
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(400).json({ error: 'Sub-department name or short name already exists for this department' });
    }
    throw err;
  }
});

router.patch('/sub-departments/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const sub = SubDepartments.findById(id);
  if (!sub) return res.status(404).json({ error: 'Sub department not found' });

  try {
    SubDepartments.update(id, req.body || {});
    audit(req.user.id, 'sub_department_updated', { subDepartmentId: id });
    res.json(SubDepartments.findById(id));
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(400).json({ error: 'Sub-department name or short name already exists for this department' });
    }
    throw err;
  }
});

router.post('/sub-departments/reorder', (req, res) => {
  const departmentId = parseInt(req.body?.department_id, 10);
  if (!departmentId) return res.status(400).json({ error: 'department_id is required' });
  if (!Departments.findById(departmentId)) return res.status(404).json({ error: 'Department not found' });

  const orderedIds = parseOrderedIds(req.body?.ordered_ids);
  if (!orderedIds.length) return res.status(400).json({ error: 'ordered_ids is required' });

  const subs = SubDepartments.listByDepartment(departmentId);
  const existingIds = new Set(subs.map(s => s.id));
  if (orderedIds.some(id => !existingIds.has(id))) {
    return res.status(400).json({ error: 'ordered_ids contains unknown sub-department id(s) for that department' });
  }

  const provided = new Set(orderedIds);
  const remaining = subs.filter(s => !provided.has(s.id)).map(s => s.id);
  const finalOrder = [...orderedIds, ...remaining];

  SubDepartments.reorderForDepartment(departmentId, finalOrder);
  audit(req.user.id, 'sub_department_reordered', { departmentId, ordered_ids: finalOrder });
  res.json(SubDepartments.listByDepartment(departmentId));
});

router.delete('/sub-departments/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const sub = SubDepartments.findById(id);
  if (!sub) return res.status(404).json({ error: 'Sub department not found' });
  try {
    SubDepartments.delete(id);
    audit(req.user.id, 'sub_department_deleted', { subDepartmentId: id });
    res.json({ success: true });
  } catch (err) {
    if (String(err.message).includes('FOREIGN KEY')) {
      return res.status(400).json({ error: 'Cannot delete sub department while units still reference it' });
    }
    throw err;
  }
});

// --- Discord Role Mappings ---
router.get('/role-mappings', (req, res) => {
  res.json(DiscordRoleMappings.list());
});

router.post('/role-mappings', (req, res) => {
  const {
    discord_role_id,
    discord_role_name,
    target_type,
    target_id,
    department_id,
    job_name,
    job_grade,
  } = req.body;

  // Backward compatibility: treat department_id as department target.
  const resolvedType = target_type || (department_id ? 'department' : '');
  if (!discord_role_id || !resolvedType) {
    return res.status(400).json({ error: 'discord_role_id and target_type are required' });
  }
  if (!['department', 'sub_department', 'job'].includes(resolvedType)) {
    return res.status(400).json({ error: 'target_type must be department, sub_department, or job' });
  }

  let resolvedTargetId = 0;
  let resolvedJobName = '';
  let resolvedJobGrade = -1;

  if (resolvedType === 'department' || resolvedType === 'sub_department') {
    resolvedTargetId = parseInt(target_id || department_id, 10);
    if (!resolvedTargetId) {
      return res.status(400).json({ error: 'target_id is required for department/sub_department mappings' });
    }
  }
  if (resolvedType === 'department' && !Departments.findById(resolvedTargetId)) {
    return res.status(400).json({ error: 'Department target not found' });
  }
  if (resolvedType === 'sub_department' && !SubDepartments.findById(resolvedTargetId)) {
    return res.status(400).json({ error: 'Sub-department target not found' });
  }
  if (resolvedType === 'job') {
    resolvedJobName = String(job_name || '').trim();
    if (!resolvedJobName) {
      return res.status(400).json({ error: 'job_name is required for job mappings' });
    }
    const rawGrade = job_grade;
    const rawGradeText = String(rawGrade ?? '').trim();
    if (!rawGradeText) {
      resolvedJobGrade = -1; // Any rank
    } else {
      const parsedGrade = Number(rawGrade);
      if (!Number.isFinite(parsedGrade)) {
        return res.status(400).json({ error: 'job_grade must be a number, or leave it blank for any rank' });
      }
      if (parsedGrade < 0) {
        resolvedJobGrade = -1;
      } else {
        resolvedJobGrade = Math.max(0, Math.trunc(parsedGrade));
      }
    }
  }

  try {
    const mapping = DiscordRoleMappings.create({
      discord_role_id,
      discord_role_name: discord_role_name || '',
      target_type: resolvedType,
      target_id: resolvedTargetId,
      job_name: resolvedJobName,
      job_grade: resolvedJobGrade,
    });
    audit(req.user.id, 'role_mapping_created', { mapping });
    res.status(201).json(mapping);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'This Discord role is already mapped to that target' });
    }
    throw err;
  }
});

router.delete('/role-mappings/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  DiscordRoleMappings.delete(id);
  audit(req.user.id, 'role_mapping_deleted', { mappingId: id });
  res.json({ success: true });
});

// Discord guild roles (from bot)
router.get('/discord/roles', async (req, res) => {
  try {
    const { getGuildRoles } = require('../discord/bot');
    const roles = await getGuildRoles();
    res.json(roles);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch Discord roles', message: err.message });
  }
});

// Trigger full role sync
router.post('/discord/sync', async (req, res) => {
  try {
    const { syncAllMembers } = require('../discord/bot');
    const result = await syncAllMembers();
    audit(req.user.id, 'discord_full_sync', result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Sync failed', message: err.message });
  }
});

router.get('/discord/job-sync-preview', async (req, res) => {
  const userId = parseInt(req.query.user_id, 10);
  if (!userId) return res.status(400).json({ error: 'user_id is required' });

  const user = Users.findById(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const preferredCitizenId = String(user.preferred_citizen_id || '').trim();
  const linkedCitizenIds = (() => {
    const seen = new Set();
    const list = [];
    const add = (value) => {
      const cid = String(value || '').trim();
      if (!cid) return;
      const key = cid.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      list.push(cid);
    };
    add(preferredCitizenId);
    if (String(user.steam_id || '').trim()) {
      add(FiveMPlayerLinks.findBySteamId(String(user.steam_id || '').trim())?.citizen_id);
    }
    if (typeof FiveMJobSyncJobs.listDistinctCitizenIdsByUserId === 'function') {
      const rows = FiveMJobSyncJobs.listDistinctCitizenIdsByUserId(Number(user.id || 0), 100);
      for (const row of rows || []) add(row?.citizen_id);
    } else {
      add(FiveMJobSyncJobs.findLatestByUserId(Number(user.id || 0))?.citizen_id);
    }
    return list;
  })();
  const reverseEnabled = String(Settings.get('fivem_bridge_job_sync_reverse_enabled') || 'true').trim().toLowerCase() !== 'false';
  const allMappings = DiscordRoleMappings.list();
  const jobMappings = allMappings
    .filter((mapping) => mapping.target_type === 'job' && String(mapping.discord_role_id || '').trim() !== '')
    .map((mapping) => ({
      id: Number(mapping.id || 0),
      discord_role_id: String(mapping.discord_role_id || ''),
      discord_role_name: String(mapping.discord_role_name || ''),
      job_name: String(mapping.job_name || '').trim(),
      job_grade: Number.isFinite(Number(mapping.job_grade)) ? Number(mapping.job_grade) : 0,
      rank_mode: Number(mapping.job_grade) < 0 ? 'any' : 'exact',
    }));

  const response = {
    enabled: reverseEnabled,
    user: {
      id: Number(user.id || 0),
      steam_name: String(user.steam_name || ''),
      discord_id: String(user.discord_id || ''),
      preferred_citizen_id: preferredCitizenId,
      linked_citizen_ids: linkedCitizenIds,
    },
    qbox: {
      players_table: String(Settings.get('qbox_players_table') || 'players').trim() || 'players',
      job_table: String(Settings.get('qbox_job_table') || Settings.get('qbox_players_table') || 'players').trim() || 'players',
      job_match_col: String(Settings.get('qbox_job_match_col') || 'license').trim() || 'license',
      job_col: String(Settings.get('qbox_job_col') || 'job').trim() || 'job',
      job_grade_col: String(Settings.get('qbox_job_grade_col') || '').trim(),
    },
    mapping_count: jobMappings.length,
    reason: '',
    detected_jobs: [],
    matched_mappings: [],
    lookup_citizen_ids: linkedCitizenIds,
    players_job_fallback_allowed: true,
    players_job_fallback_used: false,
  };
  const playersTableKey = String(response.qbox.players_table || '').trim().toLowerCase();
  const jobTableKey = String(response.qbox.job_table || '').trim().toLowerCase();
  response.players_job_fallback_allowed = !!playersTableKey && !!jobTableKey && playersTableKey === jobTableKey;

  if (!reverseEnabled) {
    response.reason = 'reverse_job_role_sync_disabled';
  } else if (linkedCitizenIds.length === 0) {
    response.reason = 'no_linked_citizen_ids';
  } else if (jobMappings.length === 0) {
    response.reason = 'no_job_mappings';
  } else {
    try {
      let detectedJobs = [];
      let playersJobFallbackUsed = false;
      if (typeof qbox.getPlayerCharacterJobsByCitizenId === 'function') {
        const aggregatedRows = [];
        for (const seedCitizenId of linkedCitizenIds) {
          const rows = await qbox.getPlayerCharacterJobsByCitizenId(seedCitizenId);
          if (!Array.isArray(rows) || rows.length === 0) continue;
          aggregatedRows.push(...rows);
        }
        if (Array.isArray(aggregatedRows) && aggregatedRows.length > 0) {
          detectedJobs = aggregatedRows.map((row) => ({
            citizen_id: String(row?.citizenid || '').trim(),
            job_name: String(row?.name || '').trim(),
            job_grade: normalizeJobGrade(row?.grade),
          })).filter((row) => row.job_name);
        }
      }
      if (detectedJobs.length === 0 && response.players_job_fallback_allowed && typeof qbox.getCharacterJobById === 'function') {
        playersJobFallbackUsed = true;
        for (const seedCitizenId of linkedCitizenIds) {
          const row = await qbox.getCharacterJobById(seedCitizenId);
          const name = String(row?.name || '').trim();
          if (!name) continue;
          detectedJobs.push({
            citizen_id: String(row?.citizenid || seedCitizenId).trim(),
            job_name: name,
            job_grade: normalizeJobGrade(row?.grade),
          });
        }
      }
      if (detectedJobs.length > 0) {
        detectedJobs = Array.from(new Map(
          detectedJobs.map((row) => {
            const cid = String(row?.citizen_id || '').trim();
            const jobName = String(row?.job_name || '').trim();
            const jobGrade = normalizeJobGrade(row?.job_grade);
            return [`${cid.toLowerCase()}::${jobName.toLowerCase()}::${jobGrade}`, {
              citizen_id: cid,
              job_name: jobName,
              job_grade: jobGrade,
            }];
          })
        ).values()).filter((row) => row.job_name);
      }
      response.players_job_fallback_used = playersJobFallbackUsed;

      response.detected_jobs = detectedJobs;
      if (detectedJobs.length === 0) {
        response.reason = 'no_jobs_detected';
      } else {
        const matched = [];
        for (const mapping of jobMappings) {
          if (!detectedJobs.some((job) => jobMappingMatchesPreview(mapping, job))) continue;
          matched.push(mapping);
        }
        response.matched_mappings = matched;
        response.reason = matched.length > 0 ? 'ok' : 'no_matching_mappings';
      }
    } catch (err) {
      response.reason = 'lookup_failed';
      response.error = err.message || 'Lookup failed';
    }
  }

  return res.json(response);
});

router.post('/discord/sync-user', async (req, res) => {
  const userId = parseInt(req.body?.user_id, 10);
  if (!userId) return res.status(400).json({ error: 'user_id is required' });

  const user = Users.findById(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const discordId = String(user.discord_id || '').trim();
  if (!discordId) return res.status(400).json({ error: 'User does not have a linked Discord account' });

  try {
    const { syncUserRoles } = require('../discord/bot');
    const result = await syncUserRoles(discordId);
    audit(req.user.id, 'discord_user_sync', {
      targetUserId: userId,
      discordId,
      result,
    });
    res.json({ ok: true, user_id: userId, discord_id: discordId, result });
  } catch (err) {
    res.status(500).json({ error: 'User sync failed', message: err.message });
  }
});

// --- QBox diagnostics ---
router.get('/qbox/test', async (req, res) => {
  try {
    const result = await qbox.testConnection();
    if (!result.success) {
      return res.status(400).json({ error: 'QBox connection failed', message: result.message });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'QBox connection failed', message: err.message });
  }
});

router.get('/qbox/schema', async (req, res) => {
  try {
    const report = await qbox.inspectConfiguredSchema();
    if (!report.success) {
      return res.status(400).json({ error: 'QBox schema validation failed', message: report.message, details: report });
    }
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: 'QBox schema validation failed', message: err.message });
  }
});

// --- Offence catalog ---
router.get('/offence-catalog', (req, res) => {
  const includeInactive = String(req.query.include_inactive || '').toLowerCase() === 'true';
  const offences = OffenceCatalog.list(!includeInactive);
  res.json(offences);
});

router.post('/offence-catalog', (req, res) => {
  const {
    category,
    code,
    title,
    description,
    fine_amount,
    jail_minutes,
    sort_order,
    is_active,
  } = req.body || {};

  const normalizedTitle = String(title || '').trim();
  if (!normalizedTitle) {
    return res.status(400).json({ error: 'title is required' });
  }

  const fineAmount = Number(fine_amount || 0);
  if (!Number.isFinite(fineAmount) || fineAmount < 0) {
    return res.status(400).json({ error: 'fine_amount must be a non-negative number' });
  }
  const jailMinutes = Number(jail_minutes || 0);
  if (!Number.isFinite(jailMinutes) || jailMinutes < 0) {
    return res.status(400).json({ error: 'jail_minutes must be a non-negative number' });
  }

  try {
    const offence = OffenceCatalog.create({
      category: normalizeOffenceCategory(category),
      code: String(code || '').trim(),
      title: normalizedTitle,
      description: String(description || '').trim(),
      fine_amount: fineAmount,
      jail_minutes: jailMinutes,
      sort_order: Number.isFinite(Number(sort_order)) ? Number(sort_order) : 0,
      is_active: is_active === undefined ? 1 : (is_active ? 1 : 0),
    });
    audit(req.user.id, 'offence_catalog_created', { offenceId: offence.id, category: offence.category });
    res.status(201).json(offence);
  } catch (err) {
    if (String(err?.message || '').includes('UNIQUE')) {
      return res.status(400).json({ error: 'An offence with that category/code already exists' });
    }
    throw err;
  }
});

router.post('/offence-catalog/import', (req, res) => {
  const rows = Array.isArray(req.body?.offences) ? req.body.offences : [];
  if (!rows.length) {
    return res.status(400).json({ error: 'offences array is required' });
  }
  if (rows.length > 5000) {
    return res.status(400).json({ error: 'Too many offences in one import (max 5000)' });
  }

  const errors = [];
  const createdIds = [];

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] || {};
    const rowNumber = i + 1;
    try {
      const normalizedTitle = String(row.title || '').trim();
      if (!normalizedTitle) {
        throw new Error('title is required');
      }

      const fineAmount = Number(row.fine_amount ?? 0);
      if (!Number.isFinite(fineAmount) || fineAmount < 0) {
        throw new Error('fine_amount must be a non-negative number');
      }
      const jailMinutes = Number(row.jail_minutes ?? 0);
      if (!Number.isFinite(jailMinutes) || jailMinutes < 0) {
        throw new Error('jail_minutes must be a non-negative number');
      }

      const offence = OffenceCatalog.create({
        category: normalizeOffenceCategory(row.category),
        code: String(row.code || '').trim(),
        title: normalizedTitle,
        description: String(row.description || '').trim(),
        fine_amount: fineAmount,
        jail_minutes: jailMinutes,
        sort_order: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 0,
        is_active: parseOffenceIsActive(row.is_active),
      });
      createdIds.push(offence.id);
    } catch (err) {
      const message = String(err?.message || 'Import row failed');
      if (message.includes('UNIQUE')) {
        errors.push({ index: rowNumber, error: 'An offence with that category/code already exists' });
      } else {
        errors.push({ index: rowNumber, error: message });
      }
    }
  }

  audit(req.user.id, 'offence_catalog_imported', {
    total: rows.length,
    imported: createdIds.length,
    failed: errors.length,
  });

  res.json({
    success: errors.length === 0,
    total: rows.length,
    imported: createdIds.length,
    failed: errors.length,
    created_ids: createdIds,
    errors,
  });
});

router.patch('/offence-catalog/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Invalid offence id' });
  const existing = OffenceCatalog.findById(id);
  if (!existing) return res.status(404).json({ error: 'Offence not found' });

  const updates = {};
  if (req.body?.category !== undefined) updates.category = normalizeOffenceCategory(req.body.category);
  if (req.body?.code !== undefined) updates.code = String(req.body.code || '').trim();
  if (req.body?.title !== undefined) {
    const normalizedTitle = String(req.body.title || '').trim();
    if (!normalizedTitle) return res.status(400).json({ error: 'title is required' });
    updates.title = normalizedTitle;
  }
  if (req.body?.description !== undefined) updates.description = String(req.body.description || '').trim();
  if (req.body?.sort_order !== undefined) updates.sort_order = Number.isFinite(Number(req.body.sort_order)) ? Number(req.body.sort_order) : 0;
  if (req.body?.is_active !== undefined) updates.is_active = req.body.is_active ? 1 : 0;
  if (req.body?.fine_amount !== undefined) {
    const fineAmount = Number(req.body.fine_amount);
    if (!Number.isFinite(fineAmount) || fineAmount < 0) {
      return res.status(400).json({ error: 'fine_amount must be a non-negative number' });
    }
    updates.fine_amount = fineAmount;
  }
  if (req.body?.jail_minutes !== undefined) {
    const jailMinutes = Number(req.body.jail_minutes);
    if (!Number.isFinite(jailMinutes) || jailMinutes < 0) {
      return res.status(400).json({ error: 'jail_minutes must be a non-negative number' });
    }
    updates.jail_minutes = Math.trunc(jailMinutes);
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid fields supplied' });
  }

  try {
    OffenceCatalog.update(id, updates);
    const updated = OffenceCatalog.findById(id);
    audit(req.user.id, 'offence_catalog_updated', { offenceId: id, updates: Object.keys(updates) });
    res.json(updated);
  } catch (err) {
    if (String(err?.message || '').includes('UNIQUE')) {
      return res.status(400).json({ error: 'An offence with that category/code already exists' });
    }
    throw err;
  }
});

router.delete('/offence-catalog', (req, res) => {
  const cleared = OffenceCatalog.clearAll();
  audit(req.user.id, 'offence_catalog_cleared', { cleared });
  res.json({ success: true, cleared });
});

router.delete('/offence-catalog/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Invalid offence id' });
  const existing = OffenceCatalog.findById(id);
  if (!existing) return res.status(404).json({ error: 'Offence not found' });
  OffenceCatalog.delete(id);
  audit(req.user.id, 'offence_catalog_deleted', { offenceId: id });
  res.json({ success: true });
});

// --- CAD records maintenance ---
router.delete('/cad-records/licenses', (req, res) => {
  const cleared = DriverLicenses.clearAll();
  audit(req.user.id, 'driver_licenses_cleared', { cleared });
  res.json({ success: true, cleared });
});

router.delete('/cad-records/registrations', (req, res) => {
  const cleared = VehicleRegistrations.clearAll();
  audit(req.user.id, 'vehicle_registrations_cleared', { cleared });
  res.json({ success: true, cleared });
});

router.get('/qbox/table-columns', async (req, res) => {
  const tableName = String(req.query.table_name || '').trim();
  if (!tableName) {
    return res.status(400).json({ error: 'table_name is required' });
  }

  try {
    const columns = await qbox.listTableColumns(tableName);
    res.json(columns);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to inspect table columns' });
  }
});

// --- Settings ---
router.get('/settings', (req, res) => {
  res.json(Settings.getAll());
});

router.put('/settings', (req, res) => {
  const { settings } = req.body;
  if (!settings || typeof settings !== 'object') {
    return res.status(400).json({ error: 'settings object is required' });
  }
  for (const [key, value] of Object.entries(settings)) {
    Settings.set(key, String(value));
  }
  startFiveMResourceAutoSync();
  try {
    const { refreshPeriodicRoleSync } = require('../discord/bot');
    if (typeof refreshPeriodicRoleSync === 'function') {
      refreshPeriodicRoleSync();
    }
  } catch {
    // Discord bot may not be running; settings still save successfully.
  }
  audit(req.user.id, 'settings_updated', { keys: Object.keys(settings) });
  res.json(Settings.getAll());
});

router.post('/warrant-community-webhook/test', async (req, res) => {
  try {
    const result = await sendTestWarrantCommunityPoster();
    if (result?.skipped) {
      return res.status(400).json({ error: 'Webhook not configured in CAD settings', result });
    }
    audit(req.user.id, 'warrant_community_webhook_test_sent', {
      configured: true,
      location: String(result?.location || ''),
    });
    return res.json({ ok: true, ...result });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to send test webhook', message: err.message });
  }
});

// --- FiveM resource management ---
router.get('/fivem-resource/status', (_req, res) => {
  res.json(getFiveMResourceStatus());
});

router.post('/fivem-resource/install', (req, res) => {
  try {
    const result = installOrUpdateResource();
    audit(req.user.id, 'fivem_resource_installed', {
      targetDir: result.targetDir,
      version: result.version,
    });
    startFiveMResourceAutoSync();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/fivem/links', (_req, res) => {
  const activeOnly = String(_req.query.active || '').toLowerCase() === 'true';
  const links = FiveMPlayerLinks.list();
  const filtered = activeOnly ? links.filter(isActiveFiveMLink) : links;
  const enriched = filtered.map((link) => {
    const parsed = parseFiveMLinkKey(link.steam_id);
    const cadUser = parsed.type === 'discord'
      ? (Users.findByDiscordId(parsed.value) || null)
      : (parsed.type === 'steam' ? (Users.findBySteamId(parsed.value) || null) : null);
    return {
      ...link,
      identifier_type: parsed.type,
      steam_id_resolved: parsed.type === 'steam' ? parsed.value : '',
      discord_id_resolved: parsed.type === 'discord' ? parsed.value : (cadUser?.discord_id || ''),
      license_id_resolved: parsed.type === 'license' ? parsed.value : '',
      cad_user_id: cadUser?.id || null,
      cad_user_name: cadUser?.steam_name || '',
    };
  });
  res.json(enriched);
});

router.get('/fivem/fine-jobs', (req, res) => {
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 100));
  res.json(FiveMFineJobs.listRecent(limit));
});

router.post('/fivem/fine-jobs/:id/retry', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Invalid job id' });
  const job = FiveMFineJobs.findById(id);
  if (!job) return res.status(404).json({ error: 'Fine job not found' });

  FiveMFineJobs.markPending(id);
  processPendingFineJobs().catch((err) => {
    console.error('[FineProcessor] Retry run failed:', err?.message || err);
  });
  res.json({ ok: true });
});

router.post('/fivem/fine-jobs/:id/cancel', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Invalid job id' });
  const job = FiveMFineJobs.findById(id);
  if (!job) return res.status(404).json({ error: 'Fine job not found' });

  FiveMFineJobs.markCancelled(id, 'Cancelled by admin');
  audit(req.user.id, 'fivem_fine_job_cancelled', { fineJobId: id });
  res.json({ ok: true });
});

// --- Audit Log ---
router.get('/audit-log', (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 100;
  const offset = parseInt(req.query.offset, 10) || 0;
  res.json(AuditLog.list(limit, offset));
});

// --- Announcements ---
router.get('/announcements', (req, res) => {
  res.json(Announcements.list());
});

router.post('/announcements', (req, res) => {
  const { title, content, expires_at } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });

  const announcement = Announcements.create({
    title,
    content: content || '',
    created_by: req.user.id,
    expires_at: expires_at || null,
  });

  bus.emit('announcement:new', { announcement });
  audit(req.user.id, 'announcement_created', { announcementId: announcement.id });
  res.status(201).json(announcement);
});

router.delete('/announcements/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  Announcements.delete(id);
  audit(req.user.id, 'announcement_deleted', { announcementId: id });
  res.json({ success: true });
});

// --- Admin unit management ---
router.patch('/units/:id/status', (req, res) => {
  const { Units: U } = require('../db/sqlite');
  const unit = U.findById(parseInt(req.params.id, 10));
  if (!unit) return res.status(404).json({ error: 'Unit not found' });

  const { status } = req.body;
  if (status) {
    U.update(unit.id, { status });
    bus.emit('unit:update', { departmentId: unit.department_id, unit: U.findById(unit.id) });
  }
  res.json(U.findById(unit.id));
});

router.delete('/units/:id', (req, res) => {
  const { Units: U } = require('../db/sqlite');
  const unit = U.findById(parseInt(req.params.id, 10));
  if (!unit) return res.status(404).json({ error: 'Unit not found' });

  U.remove(unit.id);
  bus.emit('unit:offline', { departmentId: unit.department_id, unit });
  audit(req.user.id, 'admin_unit_removed', { unitId: unit.id, callsign: unit.callsign });
  res.json({ success: true });
});

module.exports = router;

const express = require('express');
const { requireAuth } = require('../auth/middleware');
const { Units, Departments, SubDepartments, Users, FiveMPlayerLinks, Calls, AuditLog } = require('../db/sqlite');
const { audit } = require('../utils/audit');
const bus = require('../utils/eventBus');

const router = express.Router();
const ACTIVE_LINK_MAX_AGE_MS = 5 * 60 * 1000;

function parseSqliteUtc(value) {
  const text = String(value || '').trim();
  if (!text) return NaN;
  const base = text.replace(' ', 'T');
  const normalized = base.endsWith('Z') ? base : `${base}Z`;
  return Date.parse(normalized);
}

function findDispatchDepartments() {
  return Departments.list().filter(d => d.is_dispatch);
}

function isUserInDispatchDepartment(user) {
  const dispatchDepts = findDispatchDepartments();
  if (!dispatchDepts.length) return false;
  const dispatchIds = dispatchDepts.map(d => d.id);
  return user.departments.some(d => dispatchIds.includes(d.id));
}

function normalizeUnitStatus(status) {
  return String(status || '').trim().toLowerCase();
}

function getEditableUnitStatuses() {
  return new Set(['available', 'busy', 'enroute', 'on-scene', 'unavailable']);
}

const OFF_DUTY_SUMMARY_AUDIT_ACTIONS = [
  'call_created',
  'call_unit_assigned',
  'call_unit_unassigned',
  'record_created',
  'traffic_stop_created',
  'shift_note_created',
  'warrant_created',
  'bolo_created',
  'patient_analysis_created',
  'patient_analysis_updated',
  'pursuit_outcome_logged',
  'evidence_created',
];

function emitRouteClearOnAvailable(unit, statusValue) {
  const normalizedStatus = normalizeUnitStatus(statusValue);
  if (normalizedStatus !== 'available') return;
  if (!unit || !unit.id) return;

  const activeCall = Calls.getAssignedCallForUnit(unit.id);
  bus.emit('unit:status_available', {
    departmentId: unit.department_id,
    unit,
    call: activeCall || null,
  });
}

function buildOffDutySummaryForUnit(user, unit) {
  if (!user || !unit) return null;

  const now = new Date();
  const nowSql = now.toISOString().replace('T', ' ').slice(0, 19);
  const startedAtSql = String(unit.created_at || '').trim() || null;
  const startedAtMs = parseSqliteUtc(startedAtSql);
  const durationSeconds = Number.isFinite(startedAtMs)
    ? Math.max(0, Math.round((Date.now() - startedAtMs) / 1000))
    : null;

  const department = Departments.findById(Number(unit.department_id));
  const activeCall = Calls.getAssignedCallForUnit(unit.id);
  const auditCounts = AuditLog.countByUserActionsSince(user.id, {
    since: startedAtSql || null,
    actions: OFF_DUTY_SUMMARY_AUDIT_ACTIONS,
  });

  return {
    unit: {
      id: Number(unit.id),
      callsign: String(unit.callsign || '').trim(),
      status: String(unit.status || '').trim().toLowerCase(),
      department_id: Number(unit.department_id || 0) || null,
      department_name: String(department?.name || '').trim(),
      department_short_name: String(department?.short_name || '').trim(),
      sub_department_name: String(unit?.sub_department_name || '').trim(),
      sub_department_short_name: String(unit?.sub_department_short_name || '').trim(),
    },
    shift_started_at: startedAtSql,
    shift_ended_at: nowSql,
    duration_seconds: Number.isFinite(durationSeconds) ? durationSeconds : null,
    active_call_at_signoff: activeCall ? {
      id: Number(activeCall.id),
      title: String(activeCall.title || '').trim(),
      priority: String(activeCall.priority || '').trim(),
      location: String(activeCall.location || '').trim(),
      status: String(activeCall.status || '').trim().toLowerCase(),
    } : null,
    stats: {
      calls_created: Number(auditCounts.call_created || 0),
      call_assignments: Number(auditCounts.call_unit_assigned || 0),
      call_unassignments: Number(auditCounts.call_unit_unassigned || 0),
      records_created: Number(auditCounts.record_created || 0),
      traffic_stops_created: Number(auditCounts.traffic_stop_created || 0),
      shift_notes_created: Number(auditCounts.shift_note_created || 0),
      warrants_created: Number(auditCounts.warrant_created || 0),
      bolos_created: Number(auditCounts.bolo_created || 0),
      patient_analyses_created: Number(auditCounts.patient_analysis_created || 0),
      patient_analyses_updated: Number(auditCounts.patient_analysis_updated || 0),
      pursuit_outcomes_logged: Number(auditCounts.pursuit_outcome_logged || 0),
      evidence_created: Number(auditCounts.evidence_created || 0),
    },
  };
}

function canDispatchManageUnit(user, unit) {
  if (!user || !unit) return false;
  if (user.is_admin) return true;
  if (Number(user.id) === Number(unit.user_id)) return true;
  if (!isUserInDispatchDepartment(user)) return false;

  const actingUnit = Units.findByUserId(user.id);
  if (!actingUnit) return false;
  const actingDept = Departments.findById(Number(actingUnit.department_id));
  if (!actingDept?.is_dispatch) return false;

  const allowedDeptIds = new Set(Departments.listDispatchVisible().map(d => Number(d.id)));
  for (const dispatchDept of findDispatchDepartments()) {
    allowedDeptIds.add(Number(dispatchDept.id));
  }
  return allowedDeptIds.has(Number(unit.department_id));
}

function chooseActiveLinkForUser(user) {
  if (!user) return null;

  const candidates = [];
  const steamId = String(user.steam_id || '').trim();
  const discordId = String(user.discord_id || '').trim();

  if (steamId) {
    const bySteam = FiveMPlayerLinks.findBySteamId(steamId);
    if (bySteam) candidates.push(bySteam);
  }
  if (discordId) {
    const byDiscord = FiveMPlayerLinks.findBySteamId(`discord:${discordId}`);
    if (byDiscord) candidates.push(byDiscord);
  }

  let selected = null;
  let selectedTs = NaN;
  for (const candidate of candidates) {
    const ts = parseSqliteUtc(candidate?.updated_at);
    if (Number.isNaN(ts)) continue;
    if (!selected || ts > selectedTs) {
      selected = candidate;
      selectedTs = ts;
    }
  }
  return selected;
}

function isFieldUnit(unit, dispatchDeptIds) {
  if (!unit) return false;
  if (dispatchDeptIds.has(Number(unit.department_id))) return false;
  const callsign = String(unit.callsign || '').trim().toUpperCase();
  if (!callsign || callsign === 'DISPATCH') return false;
  return true;
}

function getAvailableSubDepartments(user, deptId) {
  const allForDept = SubDepartments.listByDepartment(deptId, true);
  if (user.is_admin) return allForDept;

  const allowed = Array.isArray(user.sub_departments)
    ? user.sub_departments.filter(sd => sd.department_id === deptId && sd.is_active)
    : [];

  // If no specific sub-department role mapping exists for this user+department,
  // allow any active sub-department in the department.
  return allowed.length > 0 ? allowed : allForDept;
}

// List on-duty units (filtered by department query param)
router.get('/', requireAuth, (req, res) => {
  const { department_id } = req.query;
  if (department_id) {
    const deptId = parseInt(department_id, 10);
    const hasDept = req.user.is_admin || req.user.departments.some(d => d.id === deptId);
    if (!hasDept) return res.status(403).json({ error: 'Department access denied' });
    return res.json(Units.listByDepartment(deptId));
  }
  res.json(Units.list());
});

// Dispatcher availability for self-dispatch logic
router.get('/dispatcher-status', requireAuth, (req, res) => {
  const { department_id } = req.query;
  const deptId = parseInt(department_id, 10);
  if (!deptId) return res.status(400).json({ error: 'department_id is required' });

  const hasDept = req.user.is_admin || req.user.departments.some(d => d.id === deptId);
  if (!hasDept) return res.status(403).json({ error: 'Department access denied' });

  const dispatchDepts = findDispatchDepartments();
  if (!dispatchDepts.length) {
    return res.json({
      dispatch_department: null,
      dispatcher_online: false,
      online_count: 0,
      is_dispatch_department: false,
    });
  }

  const dispatchIds = dispatchDepts.map(d => d.id);
  const dispatchUnits = Units.listByDepartmentIds(dispatchIds);
  const isDispatchDept = dispatchIds.includes(deptId);
  return res.json({
    dispatch_department: dispatchDepts[0],
    dispatcher_online: dispatchUnits.length > 0,
    online_count: dispatchUnits.length,
    is_dispatch_department: isDispatchDept,
  });
});

// Get all units from dispatch-visible departments (for dispatch centres)
router.get('/dispatchable', requireAuth, (req, res) => {
  if (!req.user.is_admin && !isUserInDispatchDepartment(req.user)) {
    return res.status(403).json({ error: 'Only dispatch departments can access this' });
  }

  const visibleDepts = Departments.listDispatchVisible();
  const deptIds = visibleDepts.map(d => d.id);
  const units = Units.listByDepartmentIds(deptIds);
  res.json({ departments: visibleDepts, units });
});

// List units with FiveM position data.
router.get('/map', requireAuth, (req, res) => {
  const deptId = parseInt(req.query.department_id, 10);
  if (!deptId) return res.status(400).json({ error: 'department_id is required' });

  const hasDept = req.user.is_admin || req.user.departments.some(d => d.id === deptId);
  if (!hasDept) return res.status(403).json({ error: 'Department access denied' });

  let units = [];
  const dispatchMode = req.query.dispatch === 'true';
  if (dispatchMode && (req.user.is_admin || isUserInDispatchDepartment(req.user))) {
    const visibleIds = Departments.listDispatchVisible().map(d => d.id);
    if (!visibleIds.includes(deptId)) visibleIds.push(deptId);
    units = Units.listByDepartmentIds(visibleIds);
  } else {
    units = Units.listByDepartment(deptId);
  }

  // Live map should only show field units, never dispatch units.
  const dispatchDeptIds = new Set(findDispatchDepartments().map(d => d.id));
  units = units.filter(unit => isFieldUnit(unit, dispatchDeptIds));

  const userCache = new Map();
  const payload = units.map((unit) => {
    let user = userCache.get(unit.user_id);
    if (!user) {
      user = Users.findById(unit.user_id) || null;
      userCache.set(unit.user_id, user);
    }

    const link = chooseActiveLinkForUser(user);
    const linkTs = parseSqliteUtc(link?.updated_at);
    const stale = !link || Number.isNaN(linkTs) || (Date.now() - linkTs) > ACTIVE_LINK_MAX_AGE_MS;

    return {
      ...unit,
      position_x: link ? Number(link.position_x || 0) : null,
      position_y: link ? Number(link.position_y || 0) : null,
      position_z: link ? Number(link.position_z || 0) : null,
      position_heading: link ? Number(link.heading || 0) : null,
      position_speed: link ? Number(link.speed || 0) : null,
      position_updated_at: link?.updated_at || null,
      position_stale: stale,
    };
  });

  res.json(payload);
});

// List sub-departments available to current user for a department
router.get('/sub-departments', requireAuth, (req, res) => {
  const deptId = parseInt(req.query.department_id, 10);
  if (!deptId) return res.status(400).json({ error: 'department_id is required' });

  const hasDept = req.user.is_admin || req.user.departments.some(d => d.id === deptId);
  if (!hasDept) return res.status(403).json({ error: 'Department access denied' });

  res.json(getAvailableSubDepartments(req.user, deptId));
});

// Get current user's unit
router.get('/me', requireAuth, (req, res) => {
  const unit = Units.findByUserId(req.user.id);
  if (!unit) return res.status(404).json({ error: 'Not on duty' });
  res.json(unit);
});

// Get current user's active assigned call (if any)
router.get('/me/active-call', requireAuth, (req, res) => {
  const unit = Units.findByUserId(req.user.id);
  if (!unit) return res.status(404).json({ error: 'Not on duty' });

  const assigned = Calls.getAssignedCallForUnit(unit.id);
  if (!assigned) return res.json(null);

  const call = Calls.findById(assigned.id) || assigned;
  const department = Departments.findById(Number(call.department_id));
  res.json({
    ...call,
    department_name: department?.name || '',
    department_short_name: department?.short_name || '',
    department_color: department?.color || '',
  });
});

// Go on duty
router.post('/me', requireAuth, (req, res) => {
  const existing = Units.findByUserId(req.user.id);
  if (existing) return res.status(400).json({ error: 'Already on duty' });

  const { callsign, department_id, sub_department_id } = req.body;
  if (!department_id) {
    return res.status(400).json({ error: 'Department is required' });
  }

  const deptId = parseInt(department_id, 10);
  const dept = Departments.findById(deptId);
  if (!dept) return res.status(400).json({ error: 'Department not found' });

  const hasDept = req.user.is_admin || req.user.departments.some(d => d.id === deptId);
  if (!hasDept) return res.status(403).json({ error: 'Department access denied' });

  const availableSubDepts = getAvailableSubDepartments(req.user, deptId);
  let selectedSubDeptId = null;
  if (!dept.is_dispatch && availableSubDepts.length > 0) {
    selectedSubDeptId = parseInt(sub_department_id, 10);
    if (!selectedSubDeptId) {
      return res.status(400).json({ error: 'sub_department_id is required for this department' });
    }
    const valid = availableSubDepts.find(sd => sd.id === selectedSubDeptId);
    if (!valid) {
      return res.status(400).json({ error: 'Invalid sub department selection' });
    }
  }

  const normalizedCallsign = dept.is_dispatch ? 'DISPATCH' : String(callsign || '').trim();
  if (!normalizedCallsign) {
    return res.status(400).json({ error: 'Callsign is required' });
  }

  const unit = Units.create({
    user_id: req.user.id,
    department_id: deptId,
    sub_department_id: selectedSubDeptId,
    callsign: normalizedCallsign,
  });

  const selectedSubDept = selectedSubDeptId ? SubDepartments.findById(selectedSubDeptId) : null;
  audit(req.user.id, 'unit_on_duty', {
    callsign: normalizedCallsign,
    department: dept.short_name,
    sub_department: selectedSubDept?.short_name || '',
  });
  bus.emit('unit:online', { departmentId: deptId, unit });
  res.status(201).json(unit);
});

// Update own unit (status/callsign only; location is driven by bridge heartbeat)
router.patch('/me', requireAuth, (req, res) => {
  const unit = Units.findByUserId(req.user.id);
  if (!unit) return res.status(404).json({ error: 'Not on duty' });

  const { status, callsign } = req.body;
  const updates = {};
  if (status !== undefined) {
    const normalizedStatus = String(status || '').trim().toLowerCase();
    if (!getEditableUnitStatuses().has(normalizedStatus)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }
    updates.status = normalizedStatus;
  }
  if (callsign !== undefined) {
    const normalizedCallsign = String(callsign || '').trim();
    if (!normalizedCallsign) {
      return res.status(400).json({ error: 'Callsign cannot be empty' });
    }
    updates.callsign = normalizedCallsign;
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No editable unit fields supplied' });
  }

  Units.update(unit.id, updates);
  const updated = Units.findById(unit.id);

  bus.emit('unit:update', { departmentId: unit.department_id, unit: updated });
  emitRouteClearOnAvailable(updated, updates.status);
  res.json(updated);
});

// Dispatch/Admin update unit status.
router.patch('/:id/status', requireAuth, (req, res) => {
  const unitId = parseInt(req.params.id, 10);
  if (!unitId) return res.status(400).json({ error: 'Invalid unit id' });

  const unit = Units.findById(unitId);
  if (!unit) return res.status(404).json({ error: 'Unit not found' });
  if (!canDispatchManageUnit(req.user, unit)) {
    return res.status(403).json({ error: 'Only dispatch or admins can update this unit status' });
  }

  const normalizedStatus = normalizeUnitStatus(req.body?.status);
  if (!getEditableUnitStatuses().has(normalizedStatus)) {
    return res.status(400).json({ error: 'Invalid status value' });
  }

  Units.update(unit.id, { status: normalizedStatus });
  const updated = Units.findById(unit.id);
  bus.emit('unit:update', { departmentId: unit.department_id, unit: updated });
  emitRouteClearOnAvailable(updated, normalizedStatus);
  audit(req.user.id, 'unit_status_updated_by_dispatch', {
    target_unit_id: unit.id,
    callsign: unit.callsign,
    status: normalizedStatus,
  });
  res.json(updated);
});

// Go off duty
router.delete('/me', requireAuth, (req, res) => {
  const unit = Units.findByUserId(req.user.id);
  if (!unit) return res.status(404).json({ error: 'Not on duty' });

  const deptId = unit.department_id;
  const summary = buildOffDutySummaryForUnit(req.user, unit);
  Units.remove(unit.id);

  audit(req.user.id, 'unit_off_duty', { callsign: unit.callsign });
  bus.emit('unit:offline', { departmentId: deptId, unit });
  res.json({ success: true, summary });
});

module.exports = router;

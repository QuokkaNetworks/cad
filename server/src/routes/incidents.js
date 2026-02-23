const express = require('express');
const { requireAuth } = require('../auth/middleware');
const {
  Incidents,
  IncidentLinks,
  Departments,
  Calls,
  CriminalRecords,
  Warrants,
  Bolos,
  EvidenceItems,
} = require('../db/sqlite');
const { audit } = require('../utils/audit');
const bus = require('../utils/eventBus');

const router = express.Router();

function isUserInDispatchDepartment(user) {
  const dispatchDepts = Departments.list().filter((d) => d.is_dispatch);
  if (!dispatchDepts.length) return false;
  const dispatchIds = new Set(dispatchDepts.map((d) => Number(d.id)));
  return Array.isArray(user?.departments) && user.departments.some((d) => dispatchIds.has(Number(d.id)));
}

function getDispatchVisibleDeptIds() {
  return Departments.listDispatchVisible().map((d) => Number(d.id)).filter((id) => Number.isInteger(id) && id > 0);
}

function canAccessDepartment(user, departmentId) {
  const parsed = Number(departmentId);
  if (!Number.isInteger(parsed) || parsed <= 0) return false;
  if (user?.is_admin) return true;
  if (Array.isArray(user?.departments) && user.departments.some((d) => Number(d.id) === parsed)) return true;
  if (!isUserInDispatchDepartment(user)) return false;
  return getDispatchVisibleDeptIds().includes(parsed);
}

function canAccessIncident(user, incident) {
  if (!incident) return false;
  return canAccessDepartment(user, incident.department_id);
}

function normalizePriority(value, fallback = '2') {
  const text = String(value || '').trim();
  if (['1', '2', '3', '4'].includes(text)) return text;
  return fallback;
}

function normalizeStatus(value, fallback = 'open') {
  const text = String(value || '').trim().toLowerCase();
  if (['open', 'review', 'monitoring', 'closed'].includes(text)) return text;
  return fallback;
}

function normalizeEntityType(value) {
  const text = String(value || '').trim().toLowerCase();
  if (['call', 'criminal_record', 'arrest_report', 'warrant', 'poi', 'evidence'].includes(text)) return text;
  return '';
}

function validateEntityForIncidentLink(entityType, entityId) {
  const type = normalizeEntityType(entityType);
  const id = Number(entityId);
  if (!type) return { error: 'Invalid entity_type' };
  if (!Number.isInteger(id) || id <= 0) return { error: 'Invalid entity_id' };

  if (type === 'call') {
    const row = Calls.findById(id);
    if (!row) return { error: 'Call not found' };
    return { entity: row };
  }
  if (type === 'criminal_record' || type === 'arrest_report') {
    const row = CriminalRecords.findById(id);
    if (!row) return { error: 'Record not found' };
    const isArrest = String(row.type || '').trim().toLowerCase() === 'arrest_report';
    if (type === 'criminal_record' && isArrest) return { error: 'Selected record is an arrest report' };
    if (type === 'arrest_report' && !isArrest) return { error: 'Selected record is not an arrest report' };
    return { entity: row };
  }
  if (type === 'warrant') {
    const row = Warrants.findById(id);
    if (!row) return { error: 'Warrant not found' };
    return { entity: row };
  }
  if (type === 'poi') {
    const row = Bolos.findById(id);
    if (!row) return { error: 'POI not found' };
    return { entity: row };
  }
  if (type === 'evidence') {
    const row = EvidenceItems.findById(id);
    if (!row) return { error: 'Evidence item not found' };
    return { entity: row };
  }

  return { error: 'Unsupported entity type' };
}

function resolveRequestedDepartmentIdsForList(user, departmentId, dispatchMode) {
  const parsedDeptId = Number(departmentId);
  if (!Number.isInteger(parsedDeptId) || parsedDeptId <= 0) return [];
  if (!dispatchMode) return [parsedDeptId];

  if (!(user?.is_admin || isUserInDispatchDepartment(user))) return [parsedDeptId];

  const ids = new Set(getDispatchVisibleDeptIds());
  ids.add(parsedDeptId);
  return Array.from(ids).filter((id) => canAccessDepartment(user, id));
}

router.get('/', requireAuth, (req, res) => {
  const deptId = Number(req.query?.department_id);
  if (!Number.isInteger(deptId) || deptId <= 0) {
    return res.status(400).json({ error: 'department_id is required' });
  }
  if (!canAccessDepartment(req.user, deptId)) {
    return res.status(403).json({ error: 'Department access denied' });
  }

  const dispatchMode = String(req.query?.dispatch || '').trim().toLowerCase() === 'true';
  const departmentIds = resolveRequestedDepartmentIdsForList(req.user, deptId, dispatchMode);
  const incidents = Incidents.listByDepartmentIds(departmentIds, {
    status: String(req.query?.status || 'open'),
    limit: Number(req.query?.limit || 100),
  });
  return res.json(incidents);
});

router.get('/by-entity', requireAuth, (req, res) => {
  const entityType = normalizeEntityType(req.query?.entity_type);
  const entityId = Number(req.query?.entity_id);
  const deptId = Number(req.query?.department_id);
  const dispatchMode = String(req.query?.dispatch || '').trim().toLowerCase() === 'true';

  if (!entityType) return res.status(400).json({ error: 'entity_type is required' });
  if (!Number.isInteger(entityId) || entityId <= 0) return res.status(400).json({ error: 'entity_id is required' });
  if (!Number.isInteger(deptId) || deptId <= 0) return res.status(400).json({ error: 'department_id is required' });
  if (!canAccessDepartment(req.user, deptId)) return res.status(403).json({ error: 'Department access denied' });

  const scopedDeptIds = resolveRequestedDepartmentIdsForList(req.user, deptId, dispatchMode);
  const links = IncidentLinks.listByEntity(entityType, entityId, scopedDeptIds);
  res.json(links);
});

router.post('/', requireAuth, (req, res) => {
  const departmentId = Number(req.body?.department_id);
  const title = String(req.body?.title || '').trim();
  if (!Number.isInteger(departmentId) || departmentId <= 0) {
    return res.status(400).json({ error: 'department_id is required' });
  }
  if (!title) return res.status(400).json({ error: 'title is required' });
  if (!canAccessDepartment(req.user, departmentId)) {
    return res.status(403).json({ error: 'Department access denied' });
  }

  const incident = Incidents.create({
    department_id: departmentId,
    title,
    summary: String(req.body?.summary || '').trim(),
    location: String(req.body?.location || '').trim(),
    priority: normalizePriority(req.body?.priority, '2'),
    status: normalizeStatus(req.body?.status, 'open'),
    owner_user_id: Number.isInteger(Number(req.body?.owner_user_id)) ? Number(req.body.owner_user_id) : req.user.id,
    created_by_user_id: req.user.id,
  });

  const initialLinks = Array.isArray(req.body?.links) ? req.body.links : [];
  for (const link of initialLinks) {
    const entityType = normalizeEntityType(link?.entity_type);
    const entityId = Number(link?.entity_id);
    if (!entityType || !Number.isInteger(entityId) || entityId <= 0) continue;
    const validation = validateEntityForIncidentLink(entityType, entityId);
    if (validation.error) continue;
    try {
      IncidentLinks.create({
        incident_id: incident.id,
        entity_type: entityType,
        entity_id: entityId,
        note: String(link?.note || '').trim(),
        created_by_user_id: req.user.id,
      });
    } catch {
      // Ignore duplicate or invalid inserts in the optional initial link array.
    }
  }

  const created = Incidents.findById(incident.id);
  audit(req.user.id, 'incident_created', {
    incident_id: created.id,
    incident_number: created.incident_number,
    department_id: created.department_id,
    title: created.title,
  });
  bus.emit('incident:create', { departmentId: created.department_id, incident: created });
  res.status(201).json(created);
});

router.get('/:id', requireAuth, (req, res) => {
  const incident = Incidents.findById(Number(req.params.id), { includeLinks: true });
  if (!incident) return res.status(404).json({ error: 'Incident not found' });
  if (!canAccessIncident(req.user, incident)) {
    return res.status(403).json({ error: 'Department access denied' });
  }
  res.json(incident);
});

router.patch('/:id', requireAuth, (req, res) => {
  const incident = Incidents.findById(Number(req.params.id), { includeLinks: false });
  if (!incident) return res.status(404).json({ error: 'Incident not found' });
  if (!canAccessIncident(req.user, incident)) {
    return res.status(403).json({ error: 'Department access denied' });
  }

  const updated = Incidents.update(incident.id, {
    title: req.body?.title,
    summary: req.body?.summary,
    location: req.body?.location,
    priority: req.body?.priority,
    status: req.body?.status,
    owner_user_id: req.body?.owner_user_id,
  });

  audit(req.user.id, 'incident_updated', {
    incident_id: updated.id,
    incident_number: updated.incident_number,
    status: updated.status,
  });
  bus.emit('incident:update', { departmentId: updated.department_id, incident: updated });
  res.json(updated);
});

router.delete('/:id', requireAuth, (req, res) => {
  const incident = Incidents.findById(Number(req.params.id), { includeLinks: false });
  if (!incident) return res.status(404).json({ error: 'Incident not found' });
  if (!canAccessIncident(req.user, incident)) {
    return res.status(403).json({ error: 'Department access denied' });
  }

  Incidents.delete(incident.id);
  audit(req.user.id, 'incident_deleted', {
    incident_id: incident.id,
    incident_number: incident.incident_number,
    title: incident.title,
  });
  bus.emit('incident:delete', { departmentId: incident.department_id, incidentId: incident.id });
  res.json({ success: true });
});

router.post('/:id/links', requireAuth, (req, res) => {
  const incident = Incidents.findById(Number(req.params.id), { includeLinks: false });
  if (!incident) return res.status(404).json({ error: 'Incident not found' });
  if (!canAccessIncident(req.user, incident)) {
    return res.status(403).json({ error: 'Department access denied' });
  }

  const entityType = normalizeEntityType(req.body?.entity_type);
  const entityId = Number(req.body?.entity_id);
  const note = String(req.body?.note || '').trim();
  const validation = validateEntityForIncidentLink(entityType, entityId);
  if (validation.error) return res.status(400).json({ error: validation.error });

  try {
    IncidentLinks.create({
      incident_id: incident.id,
      entity_type: entityType,
      entity_id: entityId,
      note,
      created_by_user_id: req.user.id,
    });
  } catch (err) {
    return res.status(400).json({ error: 'Failed to link entity to incident', message: err.message });
  }

  const updated = Incidents.findById(incident.id, { includeLinks: true });
  audit(req.user.id, 'incident_link_added', {
    incident_id: incident.id,
    incident_number: incident.incident_number,
    entity_type: entityType,
    entity_id: entityId,
  });
  bus.emit('incident:link', { departmentId: incident.department_id, incident: updated, entityType, entityId });
  res.status(201).json(updated);
});

router.delete('/:id/links/:linkId', requireAuth, (req, res) => {
  const incident = Incidents.findById(Number(req.params.id), { includeLinks: false });
  if (!incident) return res.status(404).json({ error: 'Incident not found' });
  if (!canAccessIncident(req.user, incident)) {
    return res.status(403).json({ error: 'Department access denied' });
  }

  const linkId = Number(req.params.linkId);
  if (!Number.isInteger(linkId) || linkId <= 0) {
    return res.status(400).json({ error: 'Invalid link id' });
  }
  const link = IncidentLinks.findById(linkId);
  if (!link || Number(link.incident_id) !== Number(incident.id)) {
    return res.status(404).json({ error: 'Incident link not found' });
  }

  IncidentLinks.delete(linkId);
  const updated = Incidents.findById(incident.id, { includeLinks: true });
  audit(req.user.id, 'incident_link_removed', {
    incident_id: incident.id,
    incident_number: incident.incident_number,
    entity_type: link.entity_type,
    entity_id: Number(link.entity_id || 0),
    link_id: linkId,
  });
  bus.emit('incident:unlink', { departmentId: incident.department_id, incident: updated, linkId });
  res.json(updated);
});

module.exports = router;

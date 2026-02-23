const express = require('express');
const { requireAuth } = require('../auth/middleware');
const { Warrants } = require('../db/sqlite');
const { audit } = require('../utils/audit');
const bus = require('../utils/eventBus');
const { notifyWarrantCommunityPoster } = require('../utils/warrantCommunityPoster');

const router = express.Router();

// List active warrants for a department
router.get('/', requireAuth, (req, res) => {
  const { department_id, status } = req.query;
  if (!department_id) return res.status(400).json({ error: 'department_id is required' });

  const deptId = parseInt(department_id, 10);
  const hasDept = req.user.is_admin || req.user.departments.some(d => d.id === deptId);
  if (!hasDept) return res.status(403).json({ error: 'Department access denied' });

  const warrants = Warrants.listByDepartment(deptId, status || 'active');
  res.json(warrants);
});

// Create a warrant
router.post('/', requireAuth, (req, res) => {
  const { department_id, citizen_id, subject_name, title, description, details } = req.body;
  const normalizedSubjectName = String(subject_name || '').trim();
  if (!department_id || !title || !normalizedSubjectName) {
    return res.status(400).json({ error: 'department_id, subject_name, and title are required' });
  }

  const deptId = parseInt(department_id, 10);
  const hasDept = req.user.is_admin || req.user.departments.some(d => d.id === deptId);
  if (!hasDept) return res.status(403).json({ error: 'Department access denied' });

  const warrant = Warrants.create({
    department_id: deptId,
    citizen_id: String(citizen_id || '').trim(),
    subject_name: normalizedSubjectName,
    title,
    description: description || '',
    details_json: details ? JSON.stringify(details) : '{}',
    created_by: req.user.id,
  });

  audit(req.user.id, 'warrant_created', {
    warrantId: warrant.id,
    citizenId: String(citizen_id || '').trim(),
    subjectName: normalizedSubjectName,
    title,
  });
  bus.emit('warrant:create', { departmentId: deptId, warrant });

  // Community wanted-post notifications are best-effort only and should never block warrant creation.
  setImmediate(() => {
    notifyWarrantCommunityPoster(warrant).catch((err) => {
      console.warn(`[Warrants] Community wanted notification failed for warrant #${warrant.id}: ${err?.message || err}`);
    });
  });

  res.status(201).json(warrant);
});

// Serve a warrant (mark as completed)
router.patch('/:id/serve', requireAuth, (req, res) => {
  const warrant = Warrants.findById(parseInt(req.params.id, 10));
  if (!warrant) return res.status(404).json({ error: 'Warrant not found' });

  Warrants.updateStatus(warrant.id, 'served');
  audit(req.user.id, 'warrant_served', { warrantId: warrant.id });
  bus.emit('warrant:serve', { departmentId: warrant.department_id, warrantId: warrant.id });
  res.json({ success: true });
});

// Cancel a warrant
router.patch('/:id/cancel', requireAuth, (req, res) => {
  const warrant = Warrants.findById(parseInt(req.params.id, 10));
  if (!warrant) return res.status(404).json({ error: 'Warrant not found' });

  Warrants.updateStatus(warrant.id, 'cancelled');
  audit(req.user.id, 'warrant_cancelled', { warrantId: warrant.id });
  bus.emit('warrant:cancel', { departmentId: warrant.department_id, warrantId: warrant.id });
  res.json({ success: true });
});

module.exports = router;

const express = require('express');
const { requireAuth, requireFiveMOnline } = require('../auth/middleware');
const {
  InfringementNotices,
  InfringementNoticePrintAudit,
  Departments,
  Units,
} = require('../db/sqlite');
const { audit } = require('../utils/audit');
const FiveMPrintJobs = require('../services/fivemPrintJobs');
const { buildPrintedDocumentPdfAttachment } = require('../services/printedDocumentPdf');
const bus = require('../utils/eventBus');

const router = express.Router();

router.use(requireAuth, requireFiveMOnline);

function ensureLawDepartmentAccess(req, departmentId) {
  const deptId = Number(departmentId);
  if (!Number.isInteger(deptId) || deptId <= 0) {
    return { error: 'department_id is required' };
  }
  const department = Departments.findById(deptId);
  if (!department) return { error: 'Department not found', status: 404 };
  if (String(department.layout_type || '').trim().toLowerCase() !== 'law_enforcement') {
    return { error: 'Infringement Notices are available for law enforcement departments only', status: 403 };
  }
  const hasDept = req.user?.is_admin || (Array.isArray(req.user?.departments) && req.user.departments.some((d) => Number(d.id) === deptId));
  if (!hasDept) return { error: 'Department access denied', status: 403 };
  return { department, deptId };
}

function canAccessInfringement(req, notice) {
  if (!notice) return false;
  if (req.user?.is_admin) return true;
  return Array.isArray(req.user?.departments) && req.user.departments.some((d) => Number(d.id) === Number(notice.department_id));
}

function isPaidInfringementNotice(notice) {
  if (!notice) return false;
  const payableStatus = String(notice.payable_status || '').trim().toLowerCase();
  return payableStatus === 'paid' || !!String(notice.paid_at || '').trim();
}

function normalizeDateOnlyInput(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const parsed = Date.parse(text);
  if (Number.isNaN(parsed)) return '';
  return new Date(parsed).toISOString().slice(0, 10);
}

function normalizePayableStatus(value, fallback = 'unpaid') {
  const normalized = String(value || '').trim().toLowerCase();
  if (['unpaid', 'paid', 'court_listed', 'withdrawn', 'waived'].includes(normalized)) return normalized;
  return fallback;
}

function normalizeStatus(value, fallback = 'issued') {
  const normalized = String(value || '').trim().toLowerCase();
  if (['issued', 'cancelled'].includes(normalized)) return normalized;
  return fallback;
}

function buildPrintDescription(notice) {
  const parts = [];
  if (notice?.notice_number) parts.push(String(notice.notice_number));
  if (notice?.title) parts.push(String(notice.title).trim());
  if (Number(notice?.amount || 0) > 0) {
    parts.push(`$${Number(notice.amount || 0).toLocaleString()}`);
  }
  if (notice?.due_date) parts.push(`Due ${String(notice.due_date).trim()}`);
  if (notice?.court_date) parts.push(`Court ${String(notice.court_date).trim()}`);
  return parts.join(' | ').slice(0, 500);
}

function buildPrintJobDeliveryTarget(req) {
  const activeLink = req?.fivemLink || null;
  return {
    user_id: Number(req?.user?.id || 0) || null,
    // Target the printing officer's current in-game character/inventory, not the notice subject.
    citizen_id: String(activeLink?.citizen_id || '').trim(),
    game_id: String(activeLink?.game_id || '').trim(),
    steam_id: String(req?.user?.steam_id || '').trim(),
    discord_id: String(req?.user?.discord_id || '').trim(),
  };
}

router.get('/', requireAuth, (req, res) => {
  const deptAccess = ensureLawDepartmentAccess(req, req.query.department_id);
  if (deptAccess.error) return res.status(deptAccess.status || 400).json({ error: deptAccess.error });

  const rows = InfringementNotices.listByDepartment(deptAccess.deptId, {
    status: String(req.query.status || 'open'),
    payable_status: String(req.query.payable_status || ''),
    citizen_id: String(req.query.citizen_id || ''),
    query: String(req.query.q || ''),
    court_only: String(req.query.court_only || '').toLowerCase() === 'true',
    limit: Number(req.query.limit || 100),
    offset: Number(req.query.offset || 0),
  });
  res.json(rows);
});

router.get('/:id', requireAuth, (req, res) => {
  const noticeId = parseInt(req.params.id, 10);
  if (!noticeId) return res.status(400).json({ error: 'Invalid infringement notice id' });
  const notice = InfringementNotices.findById(noticeId);
  if (!notice) return res.status(404).json({ error: 'Infringement notice not found' });
  if (!canAccessInfringement(req, notice)) return res.status(403).json({ error: 'Department access denied' });
  res.json(notice);
});

router.get('/:id/print-audit', requireAuth, (req, res) => {
  const noticeId = parseInt(req.params.id, 10);
  if (!noticeId) return res.status(400).json({ error: 'Invalid infringement notice id' });
  const notice = InfringementNotices.findById(noticeId);
  if (!notice) return res.status(404).json({ error: 'Infringement notice not found' });
  if (!canAccessInfringement(req, notice)) return res.status(403).json({ error: 'Department access denied' });
  const rows = InfringementNoticePrintAudit.listByNoticeId(noticeId, Number(req.query.limit || 50));
  res.json(rows);
});

router.post('/', requireAuth, (req, res) => {
  const deptAccess = ensureLawDepartmentAccess(req, req.body?.department_id);
  if (deptAccess.error) return res.status(deptAccess.status || 400).json({ error: deptAccess.error });

  const title = String(req.body?.title || '').trim();
  const subjectName = String(req.body?.subject_name || '').trim();
  const citizenId = String(req.body?.citizen_id || '').trim();
  if (!title) return res.status(400).json({ error: 'title is required' });
  if (!subjectName && !citizenId) return res.status(400).json({ error: 'subject_name or citizen_id is required' });

  const amount = Number(req.body?.amount || 0);
  if (!Number.isFinite(amount) || amount < 0) {
    return res.status(400).json({ error: 'amount must be a non-negative number' });
  }

  const dueDate = req.body?.due_date === undefined ? '' : normalizeDateOnlyInput(req.body.due_date);
  if (req.body?.due_date !== undefined && !dueDate && String(req.body?.due_date || '').trim()) {
    return res.status(400).json({ error: 'due_date must be a valid date' });
  }
  const courtDate = req.body?.court_date === undefined ? '' : normalizeDateOnlyInput(req.body.court_date);
  if (req.body?.court_date !== undefined && !courtDate && String(req.body?.court_date || '').trim()) {
    return res.status(400).json({ error: 'court_date must be a valid date' });
  }

  const unit = Units.findByUserId(req.user.id);
  const notice = InfringementNotices.create({
    department_id: deptAccess.deptId,
    citizen_id: citizenId,
    subject_name: subjectName || citizenId,
    vehicle_plate: String(req.body?.vehicle_plate || '').trim(),
    location: String(req.body?.location || '').trim(),
    title,
    description: String(req.body?.description || '').trim(),
    amount,
    payable_status: normalizePayableStatus(req.body?.payable_status, courtDate ? 'court_listed' : 'unpaid'),
    due_date: dueDate || null,
    court_date: courtDate || null,
    court_location: String(req.body?.court_location || '').trim(),
    status: normalizeStatus(req.body?.status, 'issued'),
    details: req.body?.details || {},
    officer_name: String(unit?.user_name || req.user?.steam_name || '').trim(),
    officer_callsign: String(unit?.callsign || '').trim(),
    created_by_user_id: req.user.id,
    updated_by_user_id: req.user.id,
    paid_at: normalizePayableStatus(req.body?.payable_status, '') === 'paid' ? new Date().toISOString() : null,
  });

  audit(req.user.id, 'infringement_notice_created', {
    infringement_notice_id: Number(notice.id || 0),
    notice_number: String(notice.notice_number || ''),
    citizen_id: citizenId,
    vehicle_plate: String(notice.vehicle_plate || ''),
    amount: Number(notice.amount || 0),
  });
  bus.emit('infringement:create', { departmentId: deptAccess.deptId, infringement: notice });
  res.status(201).json(notice);
});

router.patch('/:id', requireAuth, (req, res) => {
  const noticeId = parseInt(req.params.id, 10);
  if (!noticeId) return res.status(400).json({ error: 'Invalid infringement notice id' });
  const existing = InfringementNotices.findById(noticeId);
  if (!existing) return res.status(404).json({ error: 'Infringement notice not found' });
  if (!canAccessInfringement(req, existing)) return res.status(403).json({ error: 'Department access denied' });

  const updates = {};
  const textFields = ['notice_number', 'citizen_id', 'subject_name', 'vehicle_plate', 'location', 'title', 'description', 'court_location', 'officer_name', 'officer_callsign'];
  for (const key of textFields) {
    if (req.body?.[key] !== undefined) updates[key] = req.body[key];
  }
  if (req.body?.amount !== undefined) {
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      return res.status(400).json({ error: 'amount must be a non-negative number' });
    }
    updates.amount = amount;
  }
  if (req.body?.status !== undefined) updates.status = normalizeStatus(req.body.status, existing.status);
  if (req.body?.payable_status !== undefined) updates.payable_status = normalizePayableStatus(req.body.payable_status, existing.payable_status);
  if (req.body?.due_date !== undefined) {
    const dueDate = normalizeDateOnlyInput(req.body.due_date);
    if (!dueDate && String(req.body.due_date || '').trim()) return res.status(400).json({ error: 'due_date must be a valid date' });
    updates.due_date = dueDate || null;
  }
  if (req.body?.court_date !== undefined) {
    const courtDate = normalizeDateOnlyInput(req.body.court_date);
    if (!courtDate && String(req.body.court_date || '').trim()) return res.status(400).json({ error: 'court_date must be a valid date' });
    updates.court_date = courtDate || null;
  }
  if (req.body?.details !== undefined) updates.details = req.body.details;
  if (req.body?.details_json !== undefined) updates.details_json = req.body.details_json;

  if (updates.payable_status === 'paid') {
    updates.paid_at = new Date().toISOString();
  } else if (updates.payable_status && updates.payable_status !== 'paid' && req.body?.paid_at === undefined) {
    updates.paid_at = null;
  }
  if (req.body?.paid_at !== undefined) {
    updates.paid_at = req.body.paid_at ? String(req.body.paid_at) : null;
  }
  if (updates.payable_status === 'court_listed' && req.body?.court_date === undefined && !existing.court_date) {
    return res.status(400).json({ error: 'court_date is required when payable_status is court_listed' });
  }

  updates.updated_by_user_id = req.user.id;
  const updated = InfringementNotices.update(noticeId, updates);
  audit(req.user.id, 'infringement_notice_updated', {
    infringement_notice_id: noticeId,
    keys: Object.keys(updates),
  });
  bus.emit('infringement:update', { departmentId: Number(updated?.department_id || existing.department_id), infringement: updated });
  res.json(updated);
});

router.post('/:id/mark-paid', requireAuth, (req, res) => {
  const noticeId = parseInt(req.params.id, 10);
  const notice = InfringementNotices.findById(noticeId);
  if (!notice) return res.status(404).json({ error: 'Infringement notice not found' });
  if (!canAccessInfringement(req, notice)) return res.status(403).json({ error: 'Department access denied' });
  const updated = InfringementNotices.update(noticeId, {
    payable_status: 'paid',
    paid_at: new Date().toISOString(),
    updated_by_user_id: req.user.id,
  });
  audit(req.user.id, 'infringement_notice_marked_paid', { infringement_notice_id: noticeId });
  bus.emit('infringement:update', { departmentId: Number(updated?.department_id || notice.department_id), infringement: updated });
  res.json(updated);
});

router.post('/:id/cancel', requireAuth, (req, res) => {
  const noticeId = parseInt(req.params.id, 10);
  const notice = InfringementNotices.findById(noticeId);
  if (!notice) return res.status(404).json({ error: 'Infringement notice not found' });
  if (!canAccessInfringement(req, notice)) return res.status(403).json({ error: 'Department access denied' });
  if (isPaidInfringementNotice(notice)) {
    return res.status(400).json({ error: 'Paid infringement notices cannot be cancelled' });
  }

  const updated = InfringementNotices.update(noticeId, {
    status: 'cancelled',
    payable_status: 'withdrawn',
    paid_at: null,
    updated_by_user_id: req.user.id,
  });

  audit(req.user.id, 'infringement_notice_cancelled', {
    infringement_notice_id: noticeId,
    previous_status: String(notice.status || ''),
    previous_payable_status: String(notice.payable_status || ''),
  });
  bus.emit('infringement:update', { departmentId: Number(updated?.department_id || notice.department_id), infringement: updated });
  res.json(updated);
});

router.delete('/:id', requireAuth, (req, res) => {
  const noticeId = parseInt(req.params.id, 10);
  const notice = InfringementNotices.findById(noticeId);
  if (!notice) return res.status(404).json({ error: 'Infringement notice not found' });
  if (!canAccessInfringement(req, notice)) return res.status(403).json({ error: 'Department access denied' });
  if (isPaidInfringementNotice(notice)) {
    return res.status(400).json({ error: 'Paid infringement notices cannot be removed' });
  }

  const deleted = InfringementNotices.delete(noticeId);
  if (!deleted) return res.status(404).json({ error: 'Infringement notice not found' });

  audit(req.user.id, 'infringement_notice_deleted', {
    infringement_notice_id: noticeId,
    notice_number: String(notice.notice_number || ''),
    payable_status: String(notice.payable_status || ''),
    status: String(notice.status || ''),
  });
  bus.emit('infringement:delete', {
    departmentId: Number(notice.department_id || 0),
    infringementId: noticeId,
  });
  res.json({ success: true, id: noticeId });
});

router.post('/:id/print', requireAuth, async (req, res) => {
  const noticeId = parseInt(req.params.id, 10);
  const notice = InfringementNotices.findById(noticeId);
  if (!notice) return res.status(404).json({ error: 'Infringement notice not found' });
  if (!canAccessInfringement(req, notice)) return res.status(403).json({ error: 'Department access denied' });

  const unit = Units.findByUserId(req.user.id);
  if (!unit) {
    return res.status(400).json({ error: 'You must be on duty to print infringement notices in-game' });
  }

  const priorPrintCount = Math.max(0, Number(notice.print_count || 0));
  const printAction = priorPrintCount > 0 ? 'reprint' : 'print';
  const metadata = {
    source: 'infringement_notice',
    infringement_notice_id: Number(notice.id || 0),
    notice_number: String(notice.notice_number || '').trim(),
    subject_name: String(notice.subject_name || '').trim(),
    citizen_id: String(notice.citizen_id || '').trim(),
    vehicle_plate: String(notice.vehicle_plate || '').trim(),
    location: String(notice.location || '').trim(),
    title: String(notice.title || '').trim(),
    notes: String(notice.description || '').trim(),
    amount: Math.max(0, Number(notice.amount || 0)),
    payable_status: String(notice.payable_status || '').trim(),
    due_date: String(notice.due_date || '').trim(),
    court_date: String(notice.court_date || '').trim(),
    court_location: String(notice.court_location || '').trim(),
    officer_name: String(notice.officer_name || '').trim() || String(unit.user_name || req.user?.steam_name || '').trim(),
    officer_callsign: String(notice.officer_callsign || '').trim() || String(unit.callsign || '').trim(),
    issued_at: String(notice.created_at || '').trim(),
    print_action: printAction,
    details: notice.details || {},
  };

  let metadataWithPdf = metadata;
  try {
    const pdfAttachment = await buildPrintedDocumentPdfAttachment({
      title: `Infringement Notice ${String(notice.notice_number || `#${notice.id}`)}`.slice(0, 120),
      description: buildPrintDescription(notice),
      document_subtype: 'ticket',
      metadata,
    });
    metadataWithPdf = { ...metadata, ...pdfAttachment };
  } catch (err) {
    console.warn('[cad] Failed generating infringement PDF for print job:', err?.message || err);
  }

  const job = FiveMPrintJobs.create({
    ...buildPrintJobDeliveryTarget(req),
    department_id: Number(unit.department_id || 0) || null,
    document_type: 'cad_document',
    document_subtype: 'ticket',
    title: `Infringement Notice ${String(notice.notice_number || `#${notice.id}`)}`.slice(0, 120),
    description: buildPrintDescription(notice),
    metadata: metadataWithPdf,
  });

  InfringementNotices.markPrintIssued(noticeId, { print_job_id: Number(job.id || 0) });
  const auditRow = InfringementNoticePrintAudit.create({
    infringement_notice_id: noticeId,
    print_job_id: Number(job.id || 0),
    print_action: printAction,
    printed_by_user_id: req.user.id,
    printed_by_callsign: String(unit.callsign || '').trim(),
  });
  const updatedNotice = InfringementNotices.findById(noticeId);

  audit(req.user.id, 'infringement_notice_print_job_created', {
    infringement_notice_id: noticeId,
    print_job_id: Number(job.id || 0),
    print_action: printAction,
    unit_id: Number(unit.id || 0),
    callsign: String(unit.callsign || ''),
  });
  bus.emit('infringement:update', { departmentId: Number(updatedNotice?.department_id || notice.department_id), infringement: updatedNotice });
  res.status(201).json({ ok: true, job, print_action: printAction, notice: updatedNotice, audit: auditRow });
});

module.exports = router;

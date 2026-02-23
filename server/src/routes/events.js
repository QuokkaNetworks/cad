const express = require('express');
const { verifyToken } = require('../auth/jwt');
const { Users, UserDepartments, Departments, UserSubDepartments, SubDepartments } = require('../db/sqlite');
const bus = require('../utils/eventBus');

const router = express.Router();

router.get('/', (req, res) => {
  const queryToken = typeof req.query.token === 'string' ? req.query.token : '';
  const cookieToken = req.cookies?.[req.app?.locals?.authCookieName || 'cad_token'] || '';
  const { authorization = '' } = req.headers;
  const bearerToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const token = bearerToken || cookieToken || queryToken;
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  let user;
  try {
    const decoded = verifyToken(token);
    user = Users.findById(decoded.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    user.departments = user.is_admin
      ? Departments.list()
      : UserDepartments.getForUser(user.id);
    user.sub_departments = user.is_admin
      ? SubDepartments.list()
      : UserSubDepartments.getForUser(user.id);
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  // SSE setup
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('\n');

  let userDeptIds = user.is_admin
    ? null // Admin gets all events
    : user.departments.map(d => d.id);

  // If user is in a dispatch department, also include all dispatch-visible departments
  if (userDeptIds) {
    const isInDispatch = user.departments.some(d => d.is_dispatch);
    if (isInDispatch) {
      const visibleDepts = Departments.listDispatchVisible();
      for (const vd of visibleDepts) {
        if (!userDeptIds.includes(vd.id)) userDeptIds.push(vd.id);
      }
    }
  }

  function shouldSend(departmentId) {
    if (!userDeptIds) return true; // Admin
    if (!departmentId) return true; // Global event
    return userDeptIds.includes(departmentId);
  }

  function send(event, data) {
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {
      // Connection may be closed
    }
  }

  // Event handlers
  const handlers = {};
  const events = [
    'unit:online', 'unit:offline', 'unit:update',
    'call:create', 'call:update', 'call:close', 'call:assign', 'call:unassign',
    'bolo:create', 'bolo:resolve', 'bolo:cancel',
    'warrant:create', 'warrant:serve', 'warrant:cancel',
    'trafficstop:create',
    'evidence:create',
    'evidence:delete',
    'shiftnote:create',
    'pursuit:update',
    'pursuit:outcome_create',
    'announcement:new', 'sync:department',
  ];

  for (const event of events) {
    handlers[event] = (data) => {
      const unitDeptId = data?.unit?.department_id;
      const dispatchUnitEvent = event.startsWith('unit:')
        && unitDeptId
        && !!Departments.findById(unitDeptId)?.is_dispatch;

      if (dispatchUnitEvent || shouldSend(data.departmentId)) {
        send(event, data);
      }
    };
    bus.on(event, handlers[event]);
  }

  // Heartbeat
  const heartbeat = setInterval(() => {
    try { res.write(':heartbeat\n\n'); } catch { clearInterval(heartbeat); }
  }, 30000);

  // Cleanup on disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    for (const event of events) {
      bus.off(event, handlers[event]);
    }
  });
});

module.exports = router;

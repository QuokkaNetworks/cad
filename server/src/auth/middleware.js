const { verifyToken, generateToken } = require('./jwt');
const config = require('../config');
const { Users, UserDepartments, Departments, UserSubDepartments, SubDepartments, FiveMPlayerLinks } = require('../db/sqlite');

const FIVEM_LINK_ACTIVE_MAX_AGE_MS = 2 * 60 * 1000;

function authCookieOptions() {
  const options = {
    httpOnly: true,
    secure: !!config.auth.cookieSecure,
    sameSite: config.auth.cookieSameSite || 'Lax',
    path: '/',
    maxAge: Number(config.auth.cookieMaxAgeMs || 0) || (30 * 24 * 60 * 60 * 1000),
  };
  if (config.auth.cookieDomain) {
    options.domain = config.auth.cookieDomain;
  }
  return options;
}

function getRefreshWindowSeconds() {
  const cookieSeconds = Math.floor((Number(config.auth.cookieMaxAgeMs || 0) || (30 * 24 * 60 * 60 * 1000)) / 1000);
  if (!Number.isFinite(cookieSeconds) || cookieSeconds <= 0) return 300;
  return Math.max(300, Math.floor(cookieSeconds / 3));
}

function parseSqliteUtc(value) {
  const text = String(value || '').trim();
  if (!text) return NaN;
  const base = text.replace(' ', 'T');
  const normalized = base.endsWith('Z') ? base : `${base}Z`;
  return Date.parse(normalized);
}

function isActiveFiveMLink(link) {
  if (!link) return false;
  const ts = parseSqliteUtc(link.updated_at);
  if (Number.isNaN(ts)) return false;
  return (Date.now() - ts) <= FIVEM_LINK_ACTIVE_MAX_AGE_MS;
}

function getUserFiveMOnlineStatus(user) {
  const steamId = String(user?.steam_id || '').trim();
  if (!steamId) {
    return { online: false, link: null, reason: 'missing_steam_id' };
  }
  const link = FiveMPlayerLinks.findBySteamId(steamId);
  if (!link) {
    return { online: false, link: null, reason: 'no_link' };
  }
  if (!isActiveFiveMLink(link)) {
    return { online: false, link, reason: 'stale_link' };
  }
  return { online: true, link, reason: '' };
}

function parseActiveDepartmentHeader(req) {
  const raw = req?.headers?.['x-cad-active-department-id'];
  const text = Array.isArray(raw) ? raw[0] : raw;
  const parsed = Number.parseInt(String(text || '').trim(), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return 0;
  return parsed;
}

function isDispatchDepartmentRequest(req) {
  const departments = Array.isArray(req?.user?.departments) ? req.user.departments : [];
  if (!departments.length) return false;

  const activeDepartmentId = parseActiveDepartmentHeader(req);
  if (activeDepartmentId > 0) {
    const activeDepartment = departments.find((dept) => Number(dept?.id) === activeDepartmentId);
    return !!activeDepartment?.is_dispatch;
  }

  // Fallback for older clients that do not send the active department header.
  // Only bypass if the user has dispatch-only access.
  return departments.length > 0 && departments.every((dept) => !!dept?.is_dispatch);
}

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const cookieToken = req.cookies?.[config.auth.cookieName] || '';
  const token = bearerToken || cookieToken;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = verifyToken(token);
    const user = Users.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    if (user.is_banned) {
      return res.status(403).json({ error: 'Account is banned' });
    }
    user.departments = user.is_admin
      ? Departments.list()
      : UserDepartments.getForUser(user.id);
    user.sub_departments = user.is_admin
      ? SubDepartments.list()
      : UserSubDepartments.getForUser(user.id);
    req.user = user;

    const usingCookieAuth = !!cookieToken && token === cookieToken && !bearerToken;
    if (usingCookieAuth) {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const expiresAtSeconds = Number(decoded.exp || 0) || 0;
      const refreshWindowSeconds = getRefreshWindowSeconds();
      if (expiresAtSeconds > 0 && (expiresAtSeconds - nowSeconds) <= refreshWindowSeconds) {
        const refreshedToken = generateToken(user);
        res.cookie(config.auth.cookieName, refreshedToken, authCookieOptions());
      }
    }

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireDepartment(departmentId) {
  return (req, res, next) => {
    if (req.user.is_admin) return next();
    const hasDept = req.user.departments.some(d => d.id === departmentId);
    if (!hasDept) {
      return res.status(403).json({ error: 'Department access denied' });
    }
    next();
  };
}

function requireAdmin(req, res, next) {
  if (!req.user.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

function requireFiveMOnline(req, res, next) {
  if (isDispatchDepartmentRequest(req)) {
    req.fivemLink = null;
    req.fivemOnlineBypass = 'dispatch_department';
    return next();
  }
  const status = getUserFiveMOnlineStatus(req.user);
  if (!status.online) {
    return res.status(403).json({
      error: 'You must be online in the FiveM server to access this resource',
      code: 'fivem_online_required',
      online: false,
      reason: status.reason || 'offline',
    });
  }
  req.fivemLink = status.link || null;
  next();
}

module.exports = {
  requireAuth,
  requireDepartment,
  requireAdmin,
  requireFiveMOnline,
  getUserFiveMOnlineStatus,
};

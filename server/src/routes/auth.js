const express = require('express');
const passport = require('passport');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { generateToken } = require('../auth/jwt');
const { requireAuth, getUserFiveMOnlineStatus } = require('../auth/middleware');
const { Users, UserDepartments, UserSubDepartments, Settings } = require('../db/sqlite');
const { audit } = require('../utils/audit');
const { getAnnouncementPermissionForUser } = require('../utils/announcementPermissions');
const { getDepartmentLeaderScopeForUser } = require('../utils/departmentLeaderPermissions');

const router = express.Router();
const steamAuthExchangeById = new Map();

function authExchangeCookieOptions(req) {
  // This cookie is minted from the HTTP Steam callback listener (port 3031),
  // so it cannot rely on `Secure`; keep it short-lived and one-time instead.
  const options = {
    httpOnly: true,
    secure: false,
    sameSite: config.auth.cookieSameSite || 'Lax',
    path: '/',
    maxAge: Number(config.auth.exchangeCookieMaxAgeMs || 0) || (5 * 60 * 1000),
  };
  if (config.auth.cookieDomain) {
    options.domain = config.auth.cookieDomain;
  }
  return options;
}

function pruneSteamAuthExchanges() {
  const now = Date.now();
  for (const [exchangeId, entry] of steamAuthExchangeById.entries()) {
    if (!entry || Number(entry.expires_at_ms || 0) <= now) {
      steamAuthExchangeById.delete(exchangeId);
    }
  }
}

function issueSteamAuthExchange(userId) {
  pruneSteamAuthExchanges();
  const exchangeId = crypto.randomBytes(32).toString('base64url');
  const expiresAtMs = Date.now() + (Number(config.auth.exchangeCookieMaxAgeMs || 0) || (5 * 60 * 1000));
  steamAuthExchangeById.set(exchangeId, {
    user_id: Number(userId || 0),
    expires_at_ms: expiresAtMs,
  });
  return exchangeId;
}

function consumeSteamAuthExchange(exchangeId) {
  pruneSteamAuthExchanges();
  const id = String(exchangeId || '').trim();
  if (!id) return null;
  const entry = steamAuthExchangeById.get(id);
  steamAuthExchangeById.delete(id);
  if (!entry) return null;
  if (Number(entry.expires_at_ms || 0) <= Date.now()) return null;
  return entry;
}

function parseOriginFromUrl(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    return new URL(text).origin;
  } catch {
    return '';
  }
}

function isTrustedAuthRequestOrigin(req) {
  const expectedOrigin = parseOriginFromUrl(config.webUrl);
  if (!expectedOrigin) return false;

  const candidates = [
    String(req.headers.origin || '').trim(),
    String(req.headers.referer || '').trim(),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (parseOriginFromUrl(candidate) === expectedOrigin) {
      return true;
    }
  }
  return false;
}

function createDiscordOAuthState(userId) {
  return jwt.sign(
    { kind: 'discord_link', userId: Number(userId || 0) },
    config.jwt.secret,
    { expiresIn: '10m' }
  );
}

function verifyDiscordOAuthState(rawState) {
  const token = String(rawState || '').trim();
  if (!token) throw new Error('missing_state');
  const decoded = jwt.verify(token, config.jwt.secret);
  if (!decoded || decoded.kind !== 'discord_link') throw new Error('invalid_state_kind');
  const userId = Number(decoded.userId || 0);
  if (!Number.isInteger(userId) || userId <= 0) throw new Error('invalid_state_user');
  return userId;
}

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

// Steam OpenID login
router.get('/steam', passport.authenticate('steam', { session: false }));

// Steam callback
// Steam can return to the HTTP bridge listener (3031). After verifying OpenID,
// we mint a short-lived one-time exchange cookie, then redirect to WEB_URL where
// AuthCallback exchanges it for the long-lived auth cookie on the web origin.
router.get('/steam/callback',
  passport.authenticate('steam', { session: false, failureRedirect: `${config.webUrl}/login?error=steam_failed` }),
  (req, res) => {
    const exchangeId = issueSteamAuthExchange(req.user.id);
    audit(req.user.id, 'login', 'Steam login');
    res.cookie(config.auth.exchangeCookieName, exchangeId, authExchangeCookieOptions(req));
    // Redirect to web callback without exposing auth tokens in URL parameters.
    res.redirect(`${config.webUrl}/auth/callback`);
  }
);

// Called by AuthCallback on the web origin to exchange a one-time Steam callback
// cookie for a long-lived auth cookie.
router.post('/set-cookie', (req, res) => {
  if (!req.is('application/json')) {
    return res.status(415).json({ error: 'application/json required' });
  }
  if (!isTrustedAuthRequestOrigin(req)) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }

  const exchangeId = String(req.cookies?.[config.auth.exchangeCookieName] || '').trim();
  const exchange = consumeSteamAuthExchange(exchangeId);
  if (!exchange) {
    return res.status(401).json({ error: 'Invalid or expired login exchange' });
  }

  const user = Users.findById(exchange.user_id);
  if (!user || user.is_banned) return res.status(403).json({ error: 'Forbidden' });

  const refreshedToken = generateToken(user);
  res.clearCookie(config.auth.exchangeCookieName, authExchangeCookieOptions(req));
  res.cookie(config.auth.cookieName, refreshedToken, authCookieOptions());
  res.json({ ok: true });
});

// Get current user profile
router.get('/me', requireAuth, async (req, res) => {
  const {
    id,
    steam_id,
    steam_name,
    avatar_url,
    discord_id,
    discord_name,
    is_admin,
    created_at,
    rules_agreed_version,
    rules_agreed_at,
  } = req.user;
  const departments = req.user.departments;
  const sub_departments = req.user.sub_departments || [];
  const fivemStatus = getUserFiveMOnlineStatus(req.user);
  const currentRulesVersion = String(Settings.get('cms_rules_version') || '1').trim() || '1';
  const departmentLeaderScope = await getDepartmentLeaderScopeForUser(req.user);
  const announcementPermission = await getAnnouncementPermissionForUser(req.user, { departmentLeaderScope });
  res.json({
    id,
    steam_id,
    steam_name,
    avatar_url,
    discord_id,
    discord_name,
    is_admin: !!is_admin,
    created_at,
    rules_agreed_version: String(rules_agreed_version || '').trim(),
    rules_agreed_at: rules_agreed_at || null,
    current_rules_version: currentRulesVersion,
    can_manage_announcements: !!announcementPermission?.allowed,
    can_manage_department_applications: !!departmentLeaderScope?.allowed,
    is_department_leader: !!departmentLeaderScope?.is_department_leader || !!announcementPermission?.is_department_leader,
    managed_department_ids: Array.isArray(departmentLeaderScope?.managed_department_ids) ? departmentLeaderScope.managed_department_ids : [],
    departments,
    sub_departments,
    is_fivem_online: !!fivemStatus.online,
    fivem_online_reason: fivemStatus.reason || '',
    fivem_link_updated_at: fivemStatus.link?.updated_at || null,
    fivem_citizen_id: String(fivemStatus.link?.citizen_id || '').trim() || null,
  });
});

// Generate Discord OAuth2 URL for account linking
router.post('/link-discord', requireAuth, (req, res) => {
  if (!config.discord.clientId) {
    return res.status(400).json({ error: 'Discord OAuth not configured' });
  }
  const redirectUri = `${config.steam.realm}/api/auth/discord/callback`;
  const state = createDiscordOAuthState(req.user.id);
  const url = `https://discord.com/api/oauth2/authorize?client_id=${config.discord.clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify&state=${state}`;
  res.json({ url });
});

// Discord OAuth2 callback
router.get('/discord/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state) {
    return res.redirect(`${config.webUrl}/settings?error=discord_failed`);
  }

  let userId;
  try {
    userId = verifyDiscordOAuthState(state);
  } catch {
    return res.redirect(`${config.webUrl}/settings?error=invalid_state`);
  }

  try {
    const redirectUri = `${config.steam.realm}/api/auth/discord/callback`;

    // Exchange code for access token
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.discord.clientId,
        client_secret: config.discord.clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      return res.redirect(`${config.webUrl}/settings?error=discord_token_failed`);
    }

    // Fetch Discord user info
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const discordUser = await userRes.json();

    // Update user with Discord info
    Users.update(userId, {
      discord_id: discordUser.id,
      discord_name: `${discordUser.username}`,
    });

    audit(userId, 'discord_linked', `Linked Discord: ${discordUser.username} (${discordUser.id})`);

    // Trigger role sync for this user if the bot module is available
    try {
      const { syncUserRoles } = require('../discord/bot');
      await syncUserRoles(discordUser.id);
    } catch {
      // Bot may not be initialized yet
    }

    res.redirect(`${config.webUrl}/settings?discord=linked`);
  } catch (err) {
    console.error('Discord OAuth error:', err);
    res.redirect(`${config.webUrl}/settings?error=discord_failed`);
  }
});

// Unlink Discord account
router.post('/unlink-discord', requireAuth, (req, res) => {
  Users.update(req.user.id, { discord_id: null, discord_name: '' });
  UserDepartments.setForUser(req.user.id, []);
  UserSubDepartments.setForUser(req.user.id, []);
  audit(req.user.id, 'discord_unlinked', 'Unlinked Discord account');
  res.json({ success: true });
});

router.post('/logout', (req, res) => {
  const options = {
    httpOnly: true,
    secure: !!config.auth.cookieSecure,
    sameSite: config.auth.cookieSameSite || 'Lax',
    path: '/',
  };
  if (config.auth.cookieDomain) {
    options.domain = config.auth.cookieDomain;
  }
  res.clearCookie(config.auth.exchangeCookieName, authExchangeCookieOptions(req));
  res.clearCookie(config.auth.cookieName, options);
  res.json({ success: true });
});

module.exports = router;

const express = require('express');
const passport = require('passport');
const config = require('../config');
const { generateToken } = require('../auth/jwt');
const { requireAuth, getUserFiveMOnlineStatus } = require('../auth/middleware');
const { Users, UserDepartments, UserSubDepartments } = require('../db/sqlite');
const { audit } = require('../utils/audit');

const router = express.Router();

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
// Steam redirects the browser to the HTTP bridge port (3031) since self-signed
// HTTPS certs cause ERR_EMPTY_RESPONSE. After verifying the OpenID assertion here,
// we redirect to the HTTPS SPA (WEB_URL, port 3030) passing the JWT as a query
// param so AuthCallback can POST it back to the HTTPS origin to set the cookie.
router.get('/steam/callback',
  passport.authenticate('steam', { session: false, failureRedirect: `${config.webUrl}/login?error=steam_failed` }),
  (req, res) => {
    const token = generateToken(req.user);
    audit(req.user.id, 'login', 'Steam login');
    // Pass token in URL so the HTTPS SPA can set the cookie on its own origin.
    res.redirect(`${config.webUrl}/auth/callback?token=${encodeURIComponent(token)}`);
  }
);

// Called by AuthCallback on the HTTPS origin to exchange the URL token for a cookie.
// This sets the httpOnly cookie on the correct origin (HTTPS port 3030).
router.post('/set-cookie', (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  if (!token) return res.status(400).json({ error: 'Token required' });
  const { verifyToken } = require('../auth/jwt');
  let decoded;
  try {
    decoded = verifyToken(token);
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
  const { Users } = require('../db/sqlite');
  const user = Users.findById(decoded.userId);
  if (!user || user.is_banned) return res.status(403).json({ error: 'Forbidden' });
  const refreshedToken = generateToken(user);
  res.cookie(config.auth.cookieName, refreshedToken, authCookieOptions());
  res.json({ ok: true });
});

// Get current user profile
router.get('/me', requireAuth, (req, res) => {
  const { id, steam_id, steam_name, avatar_url, discord_id, discord_name, is_admin, created_at } = req.user;
  const departments = req.user.departments;
  const sub_departments = req.user.sub_departments || [];
  const fivemStatus = getUserFiveMOnlineStatus(req.user);
  res.json({
    id,
    steam_id,
    steam_name,
    avatar_url,
    discord_id,
    discord_name,
    is_admin: !!is_admin,
    created_at,
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
  const state = Buffer.from(JSON.stringify({ userId: req.user.id })).toString('base64url');
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
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString());
    userId = decoded.userId;
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
  res.clearCookie(config.auth.cookieName, options);
  res.json({ success: true });
});

module.exports = router;

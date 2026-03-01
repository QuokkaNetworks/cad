const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

function parseIntEnv(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function parseBoolEnv(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
}

function parseCsvEnv(value, fallback = []) {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value)
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
}

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function parseTrustProxyEnv(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const text = String(value).trim().toLowerCase();
  if (['true', 'yes', 'on'].includes(text)) return 1;
  if (['false', 'no', 'off'].includes(text)) return false;
  const parsed = Number.parseInt(text, 10);
  if (!Number.isNaN(parsed)) return parsed;
  return value;
}

const nodeEnv = process.env.NODE_ENV || 'development';
const configuredJwtSecret = String(process.env.JWT_SECRET || '').trim();
const isDefaultJwtSecret = configuredJwtSecret === '' || configuredJwtSecret === 'change-me';
if (nodeEnv === 'production' && isDefaultJwtSecret) {
  throw new Error('[config] JWT_SECRET must be set to a strong non-default value in production.');
}
if (nodeEnv !== 'production' && isDefaultJwtSecret) {
  console.warn('[config] JWT_SECRET is not set; using a development fallback secret.');
}
const steamRealm = normalizeBaseUrl(process.env.STEAM_REALM || 'http://localhost:3030');
const steamReturnUrl = normalizeBaseUrl(process.env.STEAM_RETURN_URL || `${steamRealm}/api/auth/steam/callback`);

let webUrl = normalizeBaseUrl(
  process.env.WEB_URL || (nodeEnv === 'production' ? steamRealm : 'http://localhost:5173')
);

// Protect production from redirecting to Vite's dev server URL.
if (nodeEnv === 'production' && /:5173(?:\/|$)/.test(webUrl) && steamRealm) {
  console.warn('[config] WEB_URL points to :5173 in production; using STEAM_REALM instead.');
  webUrl = steamRealm;
}

const isHttpsBase = /^https:\/\//i.test(webUrl || steamRealm);
const defaultCookieSecure = nodeEnv === 'production' && isHttpsBase;
if (nodeEnv === 'production' && !defaultCookieSecure && process.env.AUTH_COOKIE_SECURE === undefined) {
  console.warn('[config] Running production over HTTP; auth cookie secure flag disabled. Use HTTPS to harden auth.');
}

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3030,
  nodeEnv,
  jwt: {
    secret: configuredJwtSecret || 'change-me-dev-fallback',
    expiresIn: String(process.env.JWT_EXPIRES_IN || process.env.AUTH_SESSION_EXPIRES_IN || '30d').trim() || '30d',
  },
  auth: {
    cookieName: process.env.AUTH_COOKIE_NAME || 'cad_token',
    exchangeCookieName: process.env.AUTH_EXCHANGE_COOKIE_NAME || 'cad_auth_exchange',
    cookieSameSite: process.env.AUTH_COOKIE_SAMESITE || 'Lax',
    cookieSecure: parseBoolEnv(process.env.AUTH_COOKIE_SECURE, defaultCookieSecure),
    cookieDomain: process.env.AUTH_COOKIE_DOMAIN || '',
    cookieMaxAgeMs: Math.max(60 * 60 * 1000, parseIntEnv(process.env.AUTH_COOKIE_MAX_AGE_MS, 30 * 24 * 60 * 60 * 1000)),
    exchangeCookieMaxAgeMs: Math.max(30 * 1000, parseIntEnv(process.env.AUTH_EXCHANGE_COOKIE_MAX_AGE_MS, 5 * 60 * 1000)),
  },
  steam: {
    apiKey: process.env.STEAM_API_KEY || '',
    realm: steamRealm,
    returnUrl: steamReturnUrl,
  },
  discord: {
    botToken: process.env.DISCORD_BOT_TOKEN || '',
    guildId: process.env.DISCORD_GUILD_ID || '',
    clientId: process.env.DISCORD_CLIENT_ID || '',
    clientSecret: process.env.DISCORD_CLIENT_SECRET || '',
    periodicSyncMinutes: parseIntEnv(process.env.DISCORD_PERIODIC_SYNC_MINUTES, 10),
    warrantCommunityWebhookUrl: process.env.DISCORD_WARRANT_COMMUNITY_WEBHOOK_URL || '',
    warrantCommunityPosterTemplatePath: process.env.DISCORD_WARRANT_COMMUNITY_POSTER_TEMPLATE_PATH || '',
    warrantCommunityDefaultLocation: process.env.DISCORD_WARRANT_COMMUNITY_DEFAULT_LOCATION || 'Los Santos',
  },
  autoUpdate: {
    enabled: String(process.env.AUTO_UPDATE_ENABLED || 'false').toLowerCase() === 'true',
    intervalMinutes: parseIntEnv(process.env.AUTO_UPDATE_INTERVAL_MINUTES, 5),
    branch: process.env.AUTO_UPDATE_BRANCH || '',
    gitBin: process.env.GIT_BIN || 'git',
    npmBin: process.env.NPM_BIN || 'npm',
    forceSync: parseBoolEnv(process.env.AUTO_UPDATE_FORCE_SYNC, true),
    preservePaths: parseCsvEnv(process.env.AUTO_UPDATE_PRESERVE_PATHS, ['.env', 'server/data/']),
    runNpmInstall: String(process.env.AUTO_UPDATE_RUN_NPM_INSTALL || 'true').toLowerCase() === 'true',
    runWebBuild: String(process.env.AUTO_UPDATE_RUN_WEB_BUILD || 'true').toLowerCase() === 'true',
    exitOnUpdate: String(process.env.AUTO_UPDATE_EXIT_ON_UPDATE || 'true').toLowerCase() === 'true',
    selfRestart: String(process.env.AUTO_UPDATE_SELF_RESTART || 'true').toLowerCase() === 'true',
  },
  webUrl,
  http: {
    trustProxy: parseTrustProxyEnv(process.env.TRUST_PROXY, false),
  },
  rateLimit: {
    apiWindowMs: Math.max(1_000, parseIntEnv(process.env.API_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000)),
    apiMax: Math.max(0, parseIntEnv(process.env.API_RATE_LIMIT_MAX, 500)),
    apiSkipAuthenticated: parseBoolEnv(process.env.API_RATE_LIMIT_SKIP_AUTHENTICATED, true),
    fivemWindowMs: Math.max(1_000, parseIntEnv(process.env.FIVEM_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000)),
    fivemMax: Math.max(0, parseIntEnv(process.env.FIVEM_RATE_LIMIT_MAX, 120000)),
  },
  sqlite: {
    file: path.resolve(__dirname, '../data/cad.sqlite'),
  },
  qbox: {
    host: process.env.QBOX_DB_HOST || '127.0.0.1',
    port: parseInt(process.env.QBOX_DB_PORT, 10) || 3306,
    user: process.env.QBOX_DB_USER || 'root',
    password: process.env.QBOX_DB_PASSWORD || '',
    database: process.env.QBOX_DB_NAME || 'qbox',
  },
};

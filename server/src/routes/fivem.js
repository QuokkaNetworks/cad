const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const express = require('express');
const {
  Settings,
  Users,
  Units,
  Calls,
  TrafficStops,
  Departments,
  FiveMPlayerLinks,
  UserCitizenLinks,
  FiveMFineJobs,
  FiveMJailJobs,
  DriverLicenses,
  VehicleRegistrations,
  Bolos,
} = require('../db/sqlite');
const { getVehicleByPlate, getCharacterById, getLicenseByCitizenId } = require('../db/qbox');
const bus = require('../utils/eventBus');
const { audit } = require('../utils/audit');
const FiveMPrintJobs = require('../services/fivemPrintJobs');

const router = express.Router();
const QUIET_BRIDGE_GET_PATHS = new Set([
  '/fine-jobs',
  '/jail-jobs',
  '/print-jobs',
  '/call-prompts',
  '/alarm-zones',
]);

// Log every incoming request to the fivem integration router.
router.use((req, _res, next) => {
  // Skip noisy heartbeat and poll endpoint logging unless they fail auth.
  const suppressNoisyGet = req.method === 'GET' && QUIET_BRIDGE_GET_PATHS.has(req.path);
  if (req.path !== '/heartbeat' && !suppressNoisyGet) {
    console.log(`[FiveMBridge] Incoming ${req.method} ${req.path} from ${req.ip || req.connection?.remoteAddress || 'unknown'}`);
  }
  next();
});

const liveLinkUserCache = new Map();
const ACTIVE_LINK_MAX_AGE_MS = 5 * 60 * 1000;
const pendingRouteJobs = new Map();
const pendingClosestCallPrompts = new Map();
const closestCallDeclines = new Map();
const closestCallDeptEscalations = new Map();
const pendingCallAutoCloseTimers = new Map();
const CALL_STATUS_PENDING_DISPATCH = 'pending_dispatch';
const CALL_STATUS_ACTIVE = 'active';
const MINICAD_UNASSIGNED_CALL_AUTOCLOSE_DELAY_MS = Math.max(
  1_000,
  Number.parseInt(process.env.FIVEM_MINICAD_UNASSIGNED_CALL_AUTOCLOSE_DELAY_MS || '10000', 10) || 10_000
);
const CLOSEST_CALL_DECLINE_COOLDOWN_MS = Math.max(
  10_000,
  Number.parseInt(process.env.FIVEM_CLOSEST_CALL_DECLINE_COOLDOWN_MS || '90000', 10) || 90_000
);
const CLOSEST_CALL_PROMPT_REFRESH_INTERVAL_MS = Math.max(
  2_000,
  Number.parseInt(process.env.FIVEM_CLOSEST_CALL_PROMPT_REFRESH_INTERVAL_MS || '3000', 10) || 3_000
);
const CLOSEST_CALL_PROMPT_RESEND_INTERVAL_MS = Math.max(
  5_000,
  Number.parseInt(process.env.FIVEM_CLOSEST_CALL_PROMPT_RESEND_INTERVAL_MS || '20000', 10) || 20_000
);
const PURSUIT_ROUTE_REFRESH_INTERVAL_MS = Math.max(
  5_000,
  Number.parseInt(process.env.FIVEM_PURSUIT_ROUTE_REFRESH_INTERVAL_MS || '5000', 10) || 5_000
);
let lastClosestCallPromptRefreshAtMs = 0;
const DRIVER_LICENSE_STATUSES = new Set(['valid', 'suspended', 'disqualified', 'expired']);
const VEHICLE_REGISTRATION_STATUSES = new Set(['valid', 'suspended', 'revoked', 'expired']);
const ALPR_IGNORED_PLATES = new Set(['BUYME']);
const BRIDGE_MUGSHOT_MAX_CHARS = Math.max(
  250000,
  Number.parseInt(process.env.FIVEM_BRIDGE_MUGSHOT_MAX_CHARS || '4000000', 10) || 4000000
);
const BRIDGE_MUGSHOT_MAX_BYTES = Math.max(
  250000,
  Number.parseInt(process.env.FIVEM_BRIDGE_MUGSHOT_MAX_BYTES || '5000000', 10) || 5000000
);
const BRIDGE_MUGSHOT_UPLOAD_DIR = path.resolve(__dirname, '../../data/uploads/fivem-mugshots');
const BRIDGE_MUGSHOT_CHROMA_KEY_ENABLED = String(process.env.FIVEM_BRIDGE_MUGSHOT_CHROMA_KEY_ENABLED || 'false')
  .trim()
  .toLowerCase() === 'true';
const BRIDGE_DOCUMENT_DEBUG_LOGS = String(process.env.FIVEM_BRIDGE_DOCUMENT_DEBUG_LOGS || 'true')
  .trim()
  .toLowerCase() !== 'false';
const BRIDGE_LICENSE_LOG_TO_FILE = String(process.env.FIVEM_BRIDGE_LICENSE_LOG_TO_FILE || 'true')
  .trim()
  .toLowerCase() !== 'false';
const BRIDGE_LICENSE_LOG_FILE = String(
  process.env.FIVEM_BRIDGE_LICENSE_LOG_FILE || path.resolve(__dirname, '../../data/logs/fivem-license.log')
).trim();
let bridgeLicenseLogStream = null;
let bridgeLicenseLogInitFailed = false;
const DEPARTMENT_LAYOUT_TYPES = new Set(['law_enforcement', 'paramedics', 'fire']);
const LAW_ENFORCEMENT_LAYOUT_TYPE = 'law_enforcement';
const activePursuitFollowerUnitIdsByCall = new Map();
const FIVEM_AUTO_ALARM_ZONES_SETTINGS_KEY = 'fivem_bridge_auto_alarm_zones_json';

function getBridgeToken() {
  return String(Settings.get('fivem_bridge_shared_token') || process.env.FIVEM_BRIDGE_SHARED_TOKEN || '').trim();
}

function getFineDeliveryMode() {
  return String(Settings.get('fivem_bridge_qbox_fines_delivery_mode') || 'bridge')
    .trim()
    .toLowerCase();
}

function getFineAccountKey() {
  return String(Settings.get('qbox_fine_account_key') || 'bank').trim() || 'bank';
}

function normalizeAlarmZoneShape(value) {
  return String(value || '').trim().toLowerCase() === 'polygon' ? 'polygon' : 'circle';
}

function parseAlarmZonePoints(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((point) => {
      if (!point || typeof point !== 'object') return null;
      const x = Number(point.x ?? point[0]);
      const y = Number(point.y ?? point[1]);
      const zRaw = point.z ?? point[2];
      const z = zRaw === undefined || zRaw === null || zRaw === '' ? null : Number(zRaw);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return {
        x: Number(x.toFixed(3)),
        y: Number(y.toFixed(3)),
        ...(Number.isFinite(z) ? { z: Number(z.toFixed(3)) } : {}),
      };
    })
    .filter(Boolean);
}

function sanitizeAlarmZoneRow(row, fallbackIndex = 1) {
  const input = row && typeof row === 'object' ? row : {};
  const label = String(input.label || input.name || '').trim();
  const baseId = String(input.id || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const derivedId = baseId || `alarm_zone_${fallbackIndex}`;
  const shape = normalizeAlarmZoneShape(input.shape || input.type);
  const points = parseAlarmZonePoints(input.points);

  const zone = {
    id: derivedId,
    shape,
    label: label || derivedId,
    location: String(input.location || '').trim() || label || derivedId,
    description: String(input.description || '').trim(),
    title: String(input.title || '').trim(),
    message: String(input.message || '').trim(),
    postal: String(input.postal || '').trim(),
    priority: String(input.priority || '').trim(),
    job_code: String(input.job_code || input.jobCode || '').trim(),
    requested_department_layout_type: String(
      input.requested_department_layout_type || input.layout_type || ''
    ).trim(),
    department_id: null,
    backup_department_id: null,
    cooldown_ms: null,
    per_player_cooldown_ms: null,
    min_z: null,
    max_z: null,
    points: [],
    radius: 0,
    x: 0,
    y: 0,
    z: 0,
  };

  zone.department_id = normalizeAlarmZoneDepartmentRef(
    input.department_id ?? input.primary_department_id ?? input.primaryDepartmentId
  );
  zone.backup_department_id = normalizeAlarmZoneDepartmentRef(
    input.backup_department_id ?? input.fallback_department_id ?? input.backupDepartmentId
  );
  if (zone.department_id && zone.backup_department_id && zone.department_id === zone.backup_department_id) {
    zone.backup_department_id = null;
  }

  for (const key of ['cooldown_ms', 'per_player_cooldown_ms', 'min_z', 'max_z']) {
    const value = input[key];
    if (value === undefined || value === null || value === '') continue;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) continue;
    zone[key] = key.endsWith('_ms') ? Math.max(0, Math.trunc(numeric)) : Number(numeric.toFixed(3));
  }

  if (shape === 'polygon' || points.length >= 3) {
    if (points.length < 3) return null;
    zone.shape = 'polygon';
    zone.points = points;
    zone.x = Number(points[0].x);
    zone.y = Number(points[0].y);
    zone.z = Number.isFinite(Number(points[0].z)) ? Number(points[0].z) : 0;
    zone.radius = 0;
    return zone;
  }

  const x = Number(input.x);
  const y = Number(input.y);
  const z = Number(input.z ?? 0);
  const radius = Number(input.radius ?? input.r ?? input.distance);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius) || radius <= 0) return null;
  zone.shape = 'circle';
  zone.x = Number(x.toFixed(3));
  zone.y = Number(y.toFixed(3));
  zone.z = Number.isFinite(z) ? Number(z.toFixed(3)) : 0;
  zone.radius = Number(radius.toFixed(2));
  zone.points = [];
  return zone;
}

function readAdminAlarmZonesOverride() {
  const raw = Settings.get(FIVEM_AUTO_ALARM_ZONES_SETTINGS_KEY);
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    return { has_override: false, zones: [] };
  }
  try {
    const parsed = JSON.parse(String(raw));
    if (!Array.isArray(parsed)) {
      return { has_override: true, zones: [] };
    }
    const zones = [];
    const seenIds = new Set();
    parsed.forEach((row, index) => {
      const zone = sanitizeAlarmZoneRow(row, index + 1);
      if (!zone) return;
      if (seenIds.has(zone.id)) return;
      seenIds.add(zone.id);
      zones.push(zone);
    });
    return { has_override: true, zones };
  } catch {
    return { has_override: true, zones: [] };
  }
}

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

function rememberCadUserCitizenLink(cadUser, citizenId, source = 'fivem_bridge') {
  const userId = Number(cadUser?.id || 0);
  const normalizedCitizenId = String(citizenId || '').trim();
  if (!Number.isInteger(userId) || userId <= 0 || !normalizedCitizenId) return null;
  try {
    return UserCitizenLinks.upsert({
      user_id: userId,
      citizen_id: normalizedCitizenId,
      source,
      seen_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[FiveMBridge] Failed to persist user citizen link:', err?.message || err);
    return null;
  }
}

function requireBridgeAuth(req, res, next) {
  const configured = getBridgeToken();
  if (!configured) {
    console.warn('[FiveMBridge] Bridge token not configured. Check FIVEM_BRIDGE_SHARED_TOKEN in .env or admin settings.', {
      path: req.path,
      method: req.method,
    });
    return res.status(503).json({ error: 'FiveM bridge token not configured' });
  }
  const header = String(req.headers['x-cad-bridge-token'] || '').trim();
  if (!header || header !== configured) {
    console.warn('[FiveMBridge] Bridge auth failed: token mismatch.', {
      path: req.path,
      method: req.method,
      headerPresent: !!header,
      headerLength: header.length,
      configuredLength: configured.length,
    });
    return res.status(401).json({ error: 'Bridge authentication failed' });
  }
  next();
}

function steamHexToSteam64(hexValue) {
  try {
    const normalized = String(hexValue || '').toLowerCase().replace(/^steam:/, '').trim();
    if (!/^[0-9a-f]+$/.test(normalized)) return '';
    return BigInt(`0x${normalized}`).toString(10);
  } catch {
    return '';
  }
}

function parseIdentifier(identifiers = [], prefix = '') {
  let list = [];
  if (Array.isArray(identifiers)) {
    list = identifiers;
  } else if (identifiers && typeof identifiers === 'object') {
    list = Object.values(identifiers);
  } else {
    return '';
  }
  const normalizedPrefix = `${String(prefix || '').toLowerCase()}:`;
  if (!normalizedPrefix || normalizedPrefix === ':') return '';
  const hit = list.find(i => typeof i === 'string' && i.toLowerCase().startsWith(normalizedPrefix));
  if (!hit) return '';
  const raw = String(hit);
  return raw.slice(raw.indexOf(':') + 1).trim();
}

function parseSteamIdentifier(identifiers = []) {
  const steamRaw = parseIdentifier(identifiers, 'steam');
  if (!steamRaw) return '';
  const steam64 = steamHexToSteam64(steamRaw);
  return steam64 || String(steamRaw).toLowerCase();
}

function parseDiscordIdentifier(identifiers = []) {
  return parseIdentifier(identifiers, 'discord');
}

function parseLicenseIdentifier(identifiers = []) {
  return parseIdentifier(identifiers, 'license') || parseIdentifier(identifiers, 'license2');
}

function resolveLinkIdentifiers(identifiers = []) {
  const steamId = parseSteamIdentifier(identifiers);
  const discordId = parseDiscordIdentifier(identifiers);
  const licenseId = parseLicenseIdentifier(identifiers);

  if (steamId) {
    return {
      linkKey: steamId,
      steamId,
      discordId,
      licenseId,
      source: 'steam',
    };
  }
  if (discordId) {
    return {
      linkKey: `discord:${discordId}`,
      steamId: '',
      discordId,
      licenseId,
      source: 'discord',
    };
  }
  if (licenseId) {
    return {
      linkKey: `license:${licenseId}`,
      steamId: '',
      discordId: '',
      licenseId,
      source: 'license',
    };
  }
  return {
    linkKey: '',
    steamId: '',
    discordId: '',
    licenseId: '',
    source: '',
  };
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

function resolveCadUserFromIdentifiers(identifiers = {}) {
  if (identifiers.steamId) {
    const bySteam = Users.findBySteamId(identifiers.steamId);
    if (bySteam) return bySteam;
  }
  if (identifiers.discordId) {
    const byDiscord = Users.findByDiscordId(identifiers.discordId);
    if (byDiscord) return byDiscord;
  }
  return null;
}

function resolveCadUserFromFiveMPlayerLink(link) {
  if (!link) return null;
  const linkKey = String(link.steam_id || '').trim();
  const parsed = parseFiveMLinkKey(linkKey);

  if (parsed.type === 'steam' && parsed.value) {
    const bySteam = Users.findBySteamId(parsed.value);
    if (bySteam) return bySteam;
  }
  if (parsed.type === 'discord' && parsed.value) {
    const byDiscord = Users.findByDiscordId(parsed.value);
    if (byDiscord) return byDiscord;
  }

  if (linkKey) {
    const cachedUserId = Number(liveLinkUserCache.get(linkKey) || 0);
    if (cachedUserId > 0) {
      const cached = Users.findById(cachedUserId);
      if (cached) return cached;
    }
  }

  const linkedCitizenId = String(link.citizen_id || '').trim();
  if (linkedCitizenId) {
    const byPreferredCitizen = Users.findByPreferredCitizenId(linkedCitizenId);
    if (byPreferredCitizen) return byPreferredCitizen;
    const persistedLink = UserCitizenLinks.findLatestByCitizenId(linkedCitizenId);
    if (persistedLink) {
      const byPersisted = Users.findById(Number(persistedLink.user_id || 0));
      if (byPersisted) return byPersisted;
    }
  }

  return null;
}

function resolveCadUserFromBridgeIdentity({ ids = {}, citizenId = '' } = {}) {
  let cadUser = resolveCadUserFromIdentifiers(ids);
  if (!cadUser && ids?.linkKey) {
    const cachedUserId = Number(liveLinkUserCache.get(ids.linkKey) || 0);
    if (cachedUserId > 0) {
      cadUser = Users.findById(cachedUserId) || null;
    }
  }
  if (!cadUser && citizenId) {
    const byActiveCitizenLink = findActiveLinkByCitizenId(citizenId);
    cadUser = resolveCadUserFromFiveMPlayerLink(byActiveCitizenLink);
  }
  if (!cadUser && citizenId) {
    const byCitizenLink = FiveMPlayerLinks.findByCitizenId(citizenId);
    cadUser = resolveCadUserFromFiveMPlayerLink(byCitizenLink);
  }
  if (!cadUser && citizenId) {
    cadUser = Users.findByPreferredCitizenId(citizenId) || null;
  }
  if (!cadUser && citizenId) {
    const persistedLink = UserCitizenLinks.findLatestByCitizenId(citizenId);
    if (persistedLink) cadUser = Users.findById(Number(persistedLink.user_id || 0)) || null;
  }
  return cadUser || null;
}

function parseCadUserId(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return 0;
  return parsed;
}

function resolveCadUserFromHeartbeatPayload(player = {}) {
  const candidates = [
    player?.cad_user_id,
    player?.cadUserId,
    player?.cad_id,
    player?.cadId,
  ];

  for (const candidate of candidates) {
    const userId = parseCadUserId(candidate);
    if (!userId) continue;
    const user = Users.findById(userId);
    if (user) return user;
  }
  return null;
}

function normalizeIdentityToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function isAutoInGameNote(value) {
  return /^in-game\s*#\d+\b/i.test(String(value || '').trim());
}

function buildOnDutyNameIndex(units = []) {
  const index = new Map();
  for (const unit of units) {
    const key = normalizeIdentityToken(unit.user_name);
    if (!key) continue;
    const bucket = index.get(key) || [];
    bucket.push(unit);
    index.set(key, bucket);
  }
  return index;
}

function resolveCadUserByName(playerName, onDutyNameIndex) {
  const key = normalizeIdentityToken(playerName);
  if (!key) return null;
  const matches = onDutyNameIndex.get(key) || [];
  if (matches.length !== 1) return null;
  return Users.findById(matches[0].user_id) || null;
}

function getDispatchDepartmentIds() {
  return new Set(
    Departments.list()
      .filter(d => d.is_dispatch)
      .map(d => d.id)
  );
}

function offDutyIfNotDispatch(unit, source) {
  if (!unit) return false;
  const dept = Departments.findById(unit.department_id);
  if (dept && dept.is_dispatch) return false;

  Units.remove(unit.id);
  bus.emit('unit:offline', { departmentId: unit.department_id, unit });
  audit(null, 'unit_off_duty_not_detected', {
    source,
    unitId: unit.id,
    userId: unit.user_id,
    callsign: unit.callsign,
    departmentId: unit.department_id,
  });
  return true;
}

function enforceInGamePresenceForOnDutyUnits(detectedCadUserIds, source) {
  const dispatchDeptIds = getDispatchDepartmentIds();
  let removed = 0;
  for (const unit of Units.list()) {
    if (dispatchDeptIds.has(unit.department_id)) continue;
    if (detectedCadUserIds.has(unit.user_id)) continue;
    if (offDutyIfNotDispatch(unit, source)) removed += 1;
  }
  return removed;
}

function parseHeartbeatSource(player = {}) {
  const candidates = [
    player?.source,
    player?.source_id,
    player?.sourceId,
    player?.server_id,
    player?.serverId,
    player?.player_id,
    player?.playerId,
  ];
  for (const candidate of candidates) {
    const parsed = Number.parseInt(String(candidate ?? '').trim(), 10);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return 0;
}

function parseHeartbeatPosition(payload = {}) {
  const nested = payload?.position && typeof payload.position === 'object'
    ? payload.position
    : (payload?.pos && typeof payload.pos === 'object' ? payload.pos : {});

  const x = Number(nested?.x ?? payload?.position_x ?? payload?.pos_x ?? payload?.x);
  const y = Number(nested?.y ?? payload?.position_y ?? payload?.pos_y ?? payload?.y);
  const z = Number(nested?.z ?? payload?.position_z ?? payload?.pos_z ?? payload?.z);

  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
    z: Number.isFinite(z) ? z : 0,
  };
}

function formatUnitLocation(payload) {
  const street = String(payload?.street || '').trim();
  const crossing = String(payload?.crossing || '').trim();
  const postal = String(payload?.postal || '').trim();
  const position = parseHeartbeatPosition(payload);

  const withPostal = (base) => (postal ? `${base} (${postal})` : base);
  if (street && crossing && street.toLowerCase() !== crossing.toLowerCase()) {
    return withPostal(`${street} / ${crossing}`);
  }
  if (street) return withPostal(street);
  if (crossing) return withPostal(crossing);

  const x = Number(position.x || 0).toFixed(1);
  const y = Number(position.y || 0).toFixed(1);
  const z = Number(position.z || 0).toFixed(1);
  const fallback = `X:${x} Y:${y} Z:${z}`;
  return postal ? `${fallback} (${postal})` : fallback;
}

function formatCallLocation(payload) {
  const explicit = String(payload?.location || '').trim();
  if (explicit) return explicit;

  const hasStreet = !!String(payload?.street || '').trim();
  const hasCrossing = !!String(payload?.crossing || '').trim();
  const hasPostal = !!String(payload?.postal || '').trim();
  const hasPosition = !!(
    (payload?.position && (payload.position.x !== undefined || payload.position.y !== undefined || payload.position.z !== undefined))
    || (payload?.pos && (payload.pos.x !== undefined || payload.pos.y !== undefined || payload.pos.z !== undefined))
  );

  if (!hasStreet && !hasCrossing && !hasPostal && !hasPosition) return '';
  return formatUnitLocation(payload);
}

function normalizePriority(value) {
  const priority = String(value || '1').trim();
  return ['1', '2', '3', '4'].includes(priority) ? priority : '1';
}

function normalizeEmergencySourceType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'command';

  const commandValues = new Set([
    'command',
    'command_000',
    'slash',
    'slash_command',
    'chat_command',
    '/000',
    'ingame_command',
    'in_game_command',
  ]);
  if (commandValues.has(normalized)) return 'command';

  const phoneValues = new Set([
    'phone',
    'phone_000',
    'phone-call',
    'phone_call',
    'phonecall',
    'emergency_phone',
    'phone_emergency',
  ]);
  if (phoneValues.has(normalized)) return 'phone';

  return normalized;
}

function normalizeStatus(value, allowedStatuses, fallback) {
  const normalized = String(value || '').trim().toLowerCase();
  if (allowedStatuses.has(normalized)) return normalized;
  return fallback;
}

function normalizePlateKey(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function describePlateStatus(status) {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'valid') return 'Registration valid';
  if (normalized === 'suspended') return 'Registration suspended';
  if (normalized === 'revoked') return 'Registration revoked';
  if (normalized === 'expired') return 'Registration expired';
  if (normalized === 'unregistered') return 'No registration found in CAD';
  return 'Registration status unknown';
}

const VEHICLE_BOLO_FLAG_LABELS = {
  stolen: 'Stolen',
  wanted: 'Wanted',
  armed: 'Armed',
  dangerous: 'Dangerous',
  disqualified_driver: 'Disqualified Driver',
  evade_police: 'Evade Police',
  suspended_registration: 'Suspended Registration',
  unregistered_vehicle: 'Unregistered Vehicle',
};

function parseJsonObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  const text = String(value || '').trim();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeVehicleBoloFlags(value) {
  const source = Array.isArray(value) ? value : [];
  return Array.from(new Set(
    source
      .map((entry) => String(entry || '').trim().toLowerCase())
      .filter(Boolean)
  ));
}

function formatVehicleBoloFlag(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  if (VEHICLE_BOLO_FLAG_LABELS[normalized]) return VEHICLE_BOLO_FLAG_LABELS[normalized];
  return normalized
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function summarizeVehicleBoloFlags(flags = []) {
  const labels = flags
    .map((flag) => formatVehicleBoloFlag(flag))
    .filter(Boolean);
  if (labels.length === 0) return 'Vehicle POI match';
  return `POI Flags: ${labels.join(', ')}`;
}

function normalizeDateOnly(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const parsed = Date.parse(text);
  if (Number.isNaN(parsed)) return '';
  return new Date(parsed).toISOString().slice(0, 10);
}

function extractFirstName(value) {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ');
  if (!normalized) return '';
  const parts = normalized.split(' ').filter(Boolean);
  if (parts.length === 0) return '';
  return String(parts[0] || '').trim();
}

function extractLastName(value) {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ');
  if (!normalized) return '';
  const parts = normalized.split(' ').filter(Boolean);
  if (parts.length === 0) return '';
  return String(parts[parts.length - 1] || '').trim();
}

function filterLicenseConditionsForDisplay(conditions) {
  const source = Array.isArray(conditions) ? conditions : [];
  const normalized = source
    .map(value => String(value || '').trim())
    .filter(Boolean);
  const hadQuizPass = normalized.some(value => /quiz\s*pass/i.test(value));
  return normalized.filter((value) => {
    if (/quiz\s*pass/i.test(value)) return false;
    if (hadQuizPass && /^\d{1,3}%$/.test(value)) return false;
    return true;
  });
}

function addDaysDateOnly(daysFromNow) {
  const days = Number(daysFromNow);
  const safeDays = Number.isFinite(days) ? Math.max(1, Math.trunc(days)) : 1;
  const now = new Date();
  now.setUTCDate(now.getUTCDate() + safeDays);
  return now.toISOString().slice(0, 10);
}

function isPastDateOnly(value) {
  const normalized = normalizeDateOnly(value);
  if (!normalized) return false;
  const today = new Date().toISOString().slice(0, 10);
  return normalized < today;
}


function daysUntilDateOnly(value) {
  const normalized = normalizeDateOnly(value);
  if (!normalized) return null;
  const target = Date.parse(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(target)) return null;
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((target - todayUtc) / (24 * 60 * 60 * 1000));
}

function normalizeTextList(value, { uppercase = false, maxLength = 64 } = {}) {
  const source = Array.isArray(value) ? value : [];
  const out = [];
  const seen = new Set();
  for (const entry of source) {
    let text = String(entry || '').trim();
    if (!text) continue;
    if (uppercase) text = text.toUpperCase();
    if (text.length > maxLength) text = text.slice(0, maxLength);
    if (seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function createBridgeInputError(statusCode, message, details = {}) {
  const err = new Error(String(message || 'Invalid request payload'));
  err.statusCode = Number(statusCode) || 400;
  err.details = details && typeof details === 'object' ? details : {};
  return err;
}

function sanitizeFileToken(value, fallback = 'player') {
  const token = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 40);
  return token || fallback;
}

function ensureBridgeMugshotUploadDir() {
  fs.mkdirSync(BRIDGE_MUGSHOT_UPLOAD_DIR, { recursive: true });
  return BRIDGE_MUGSHOT_UPLOAD_DIR;
}

function resolveMugshotExtension(mimeType = '') {
  const normalized = String(mimeType || '').trim().toLowerCase();
  if (normalized === 'image/jpg' || normalized === 'image/jpeg') return { mime: 'image/jpeg', extension: 'jpg' };
  if (normalized === 'image/png') return { mime: 'image/png', extension: 'png' };
  if (normalized === 'image/webp') return { mime: 'image/webp', extension: 'webp' };
  return null;
}

function decodeMugshotBase64Payload(rawValue, rawMimeHint = '') {
  const encoded = String(rawValue || '').trim().replace(/\s+/g, '');
  if (!encoded) return null;
  if (!/^[A-Za-z0-9+/=]+$/.test(encoded)) {
    throw createBridgeInputError(400, 'mugshot payload contains invalid base64 data');
  }

  const mimeHint = String(rawMimeHint || '').trim().toLowerCase();
  const resolvedType = resolveMugshotExtension(mimeHint || 'image/jpeg');
  if (!resolvedType) {
    throw createBridgeInputError(400, 'unsupported mugshot image type');
  }

  const imageBuffer = Buffer.from(encoded, 'base64');
  if (!imageBuffer || imageBuffer.length === 0) {
    throw createBridgeInputError(400, 'mugshot payload decoded to an empty image');
  }
  if (imageBuffer.length > BRIDGE_MUGSHOT_MAX_BYTES) {
    throw createBridgeInputError(413, `mugshot image is too large (max ${BRIDGE_MUGSHOT_MAX_BYTES} bytes)`, {
      mugshot_bytes: imageBuffer.length,
      mugshot_limit_bytes: BRIDGE_MUGSHOT_MAX_BYTES,
    });
  }

  return {
    imageBuffer,
    mimeType: resolvedType.mime,
    extension: resolvedType.extension,
  };
}

/**
 * Chroma-key: replace bright green pixels with transparency.
 * Tolerances are generous to handle GTA lighting variation on the green-screen.
 */
async function chromaKeyGreen(inputBuffer) {
  const image = sharp(inputBuffer).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // Green-screen pixel: green channel dominant, red and blue low.
    if (g > 100 && r < 150 && b < 150 && g > r && g > b) {
      data[i + 3] = 0; // fully transparent
    }
  }

  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
}

async function persistBridgeMugshot(payload = {}, citizenId = '') {
  const mugshotDataInput = String(payload.mugshot_data || payload.mugshotData || '').trim();
  const mugshotUrlInput = String(payload.mugshot_url || '').trim();
  const dataCandidate = mugshotDataInput || (/^data:image\//i.test(mugshotUrlInput) ? mugshotUrlInput : '');

  if (!dataCandidate) {
    if (!mugshotUrlInput) {
      return {
        mugshot_url: '',
        persisted: false,
        bytes: 0,
        mime_type: '',
      };
    }
    if (mugshotUrlInput.length > BRIDGE_MUGSHOT_MAX_CHARS) {
      throw createBridgeInputError(413, `mugshot_url is too large (max ${BRIDGE_MUGSHOT_MAX_CHARS} characters)`, {
        mugshot_length: mugshotUrlInput.length,
        mugshot_limit: BRIDGE_MUGSHOT_MAX_CHARS,
      });
    }
    return {
      mugshot_url: mugshotUrlInput,
      persisted: false,
      bytes: 0,
      mime_type: '',
    };
  }

  if (dataCandidate.length > BRIDGE_MUGSHOT_MAX_CHARS) {
    throw createBridgeInputError(413, `mugshot payload is too large (max ${BRIDGE_MUGSHOT_MAX_CHARS} characters)`, {
      mugshot_length: dataCandidate.length,
      mugshot_limit: BRIDGE_MUGSHOT_MAX_CHARS,
    });
  }

  let parsed = null;
  const dataUriMatch = dataCandidate.match(/^data:(image\/[A-Za-z0-9.+-]+);base64,(.+)$/i);
  if (dataUriMatch) {
    parsed = decodeMugshotBase64Payload(dataUriMatch[2], dataUriMatch[1]);
  } else {
    parsed = decodeMugshotBase64Payload(
      dataCandidate,
      payload.mugshot_mime || payload.mugshotMime || 'image/jpeg'
    );
  }
  if (!parsed) {
    throw createBridgeInputError(400, 'mugshot payload decoded to an empty image');
  }

  const uploadDir = ensureBridgeMugshotUploadDir();
  const safeCitizenId = sanitizeFileToken(citizenId, 'unknown');
  let outputBuffer = parsed.imageBuffer;
  let outputExtension = parsed.extension;
  let outputMimeType = parsed.mimeType;

  if (BRIDGE_MUGSHOT_CHROMA_KEY_ENABLED) {
    // Optional chroma-key mode for green-screen workflows.
    outputBuffer = await chromaKeyGreen(parsed.imageBuffer);
    outputExtension = 'png';
    outputMimeType = 'image/png';
  } else if (parsed.mimeType === 'image/webp') {
    // Normalise WEBP captures for broad CAD/browser compatibility.
    outputBuffer = await sharp(parsed.imageBuffer).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
    outputExtension = 'jpg';
    outputMimeType = 'image/jpeg';
  }

  // Fixed filename per citizen. Renewals overwrite the previous photo automatically.
  const fileName = `${safeCitizenId}.${outputExtension}`;
  const filePath = path.join(uploadDir, fileName);

  // Remove any old mugshot files for this citizen (previous format or old .webp).
  try {
    const entries = fs.readdirSync(uploadDir);
    for (const entry of entries) {
      const nameWithoutExt = path.parse(entry).name;
      if (nameWithoutExt === safeCitizenId || nameWithoutExt.startsWith(`${safeCitizenId}-`)) {
        const oldPath = path.join(uploadDir, entry);
        if (oldPath !== filePath) fs.unlinkSync(oldPath);
      }
    }
  } catch (_cleanupErr) {
    // Non-fatal: stale files may remain but the new photo will take precedence.
  }

  fs.writeFileSync(filePath, outputBuffer);
  return {
    mugshot_url: `/uploads/fivem-mugshots/${fileName}`,
    persisted: true,
    bytes: outputBuffer.length,
    mime_type: outputMimeType,
  };
}

function summarizeBridgeLicensePayload(payload = {}) {
  const classes = Array.isArray(payload.license_classes)
    ? payload.license_classes
    : (Array.isArray(payload.classes) ? payload.classes : []);
  const conditions = Array.isArray(payload.conditions) ? payload.conditions : [];
  const mugshotUrl = String(payload.mugshot_url || '').trim();
  const mugshotData = String(payload.mugshot_data || payload.mugshotData || '').trim();
  return {
    source: Number(payload.source || 0) || 0,
    player_name: String(payload.character_name || payload.characterName || payload.player_name || payload.name || '').trim(),
    citizenid: String(payload.citizenid || payload.citizen_id || '').trim(),
    full_name: String(payload.full_name || payload.character_name || payload.name || '').trim(),
    date_of_birth: String(payload.date_of_birth || payload.dob || payload.birthdate || '').trim(),
    gender: String(payload.gender || '').trim(),
    classes_count: classes.length,
    conditions_count: conditions.length,
    expiry_days: Number(payload.expiry_days ?? payload.duration_days ?? 0) || 0,
    expiry_at: String(payload.expiry_at || '').trim(),
    mugshot_length: mugshotData.length || mugshotUrl.length,
    mugshot_data_length: mugshotData.length,
    mugshot_url_length: mugshotUrl.length,
  };
}

function summarizeBridgeRegistrationPayload(payload = {}) {
  return {
    source: Number(payload.source || 0) || 0,
    player_name: String(payload.character_name || payload.characterName || payload.player_name || payload.name || '').trim(),
    citizenid: String(payload.citizenid || payload.citizen_id || '').trim(),
    owner_name: String(payload.owner_name || payload.character_name || payload.full_name || '').trim(),
    plate: String(payload.plate || payload.license_plate || '').trim(),
    vehicle_model: String(payload.vehicle_model || payload.model || '').trim(),
    vehicle_colour: String(payload.vehicle_colour || payload.colour || payload.color || '').trim(),
    duration_days: Number(payload.duration_days ?? payload.expiry_days ?? 0) || 0,
    expiry_at: String(payload.expiry_at || '').trim(),
  };
}

function getBridgeLicenseLogStream() {
  if (!BRIDGE_LICENSE_LOG_TO_FILE || !BRIDGE_LICENSE_LOG_FILE) return null;
  if (bridgeLicenseLogStream) return bridgeLicenseLogStream;
  if (bridgeLicenseLogInitFailed) return null;

  try {
    fs.mkdirSync(path.dirname(BRIDGE_LICENSE_LOG_FILE), { recursive: true });
    bridgeLicenseLogStream = fs.createWriteStream(BRIDGE_LICENSE_LOG_FILE, { flags: 'a', encoding: 'utf8' });
    console.log('[FiveMBridge] License log file enabled:', { path: BRIDGE_LICENSE_LOG_FILE });
    bridgeLicenseLogStream.on('error', (error) => {
      bridgeLicenseLogInitFailed = true;
      bridgeLicenseLogStream = null;
      console.error('[FiveMBridge] License log file stream error:', {
        path: BRIDGE_LICENSE_LOG_FILE,
        error: error?.message || String(error),
      });
    });
    return bridgeLicenseLogStream;
  } catch (error) {
    bridgeLicenseLogInitFailed = true;
    console.error('[FiveMBridge] Failed to initialize license log file:', {
      path: BRIDGE_LICENSE_LOG_FILE,
      error: error?.message || String(error),
    });
    return null;
  }
}

function writeBridgeLicenseLog(event, details = {}, level = 'info') {
  const stream = getBridgeLicenseLogStream();
  if (!stream) return;

  try {
    const payload = details && typeof details === 'object'
      ? details
      : { value: details };

    stream.write(`${JSON.stringify({
      ts: new Date().toISOString(),
      level,
      event: String(event || '').trim() || 'license_event',
      details: payload,
    })}\n`);
  } catch (error) {
    console.error('[FiveMBridge] Failed to write license log entry:', {
      path: BRIDGE_LICENSE_LOG_FILE,
      error: error?.message || String(error),
    });
  }
}

function logBridgeDocumentReject(kind, statusCode, reason, payloadSummary, extra = {}) {
  if (String(kind || '').toLowerCase() === 'license') {
    writeBridgeLicenseLog('license_rejected', {
      status_code: statusCode,
      reason,
      ...payloadSummary,
      ...extra,
    }, 'warn');
  }

  console.warn(`[FiveMBridge] ${kind} rejected (${statusCode}): ${reason}`, {
    ...payloadSummary,
    ...extra,
  });
}

function logBridgeDocumentTrace(kind, data, force = false) {
  if (String(kind || '').toLowerCase().startsWith('license')) {
    writeBridgeLicenseLog(kind, data || {}, 'info');
  }

  if (!force && !BRIDGE_DOCUMENT_DEBUG_LOGS) return;
  console.log(`[FiveMBridge] ${kind}`, data || {});
}

function getDispatchVisibleDepartments() {
  return Departments.listDispatchVisible().filter(dept => dept.is_active && !dept.is_dispatch);
}

function normalizeDepartmentLayoutType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (DEPARTMENT_LAYOUT_TYPES.has(normalized)) return normalized;
  return '';
}

function countOnDutyUnitsByDepartmentLayoutType(layoutType) {
  const normalizedLayoutType = normalizeDepartmentLayoutType(layoutType);
  if (!normalizedLayoutType) return 0;

  const departmentById = new Map(
    Departments.list()
      .filter((dept) => dept && dept.is_active && !dept.is_dispatch)
      .map((dept) => [Number(dept.id), dept])
  );

  let count = 0;
  for (const unit of Units.list()) {
    const dept = departmentById.get(Number(unit?.department_id || 0));
    if (!dept) continue;
    if (normalizeDepartmentLayoutType(dept.layout_type) !== normalizedLayoutType) continue;
    count += 1;
  }
  return count;
}

function normalizeAlarmZoneDepartmentRef(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  const department = Departments.findById(parsed);
  if (!department || !department.is_active || department.is_dispatch) return null;
  return Number(department.id);
}

function normalizeRequestedDepartmentIds(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value
      .map(item => Number(item))
      .filter(item => Number.isInteger(item) && item > 0)
  ));
}

function resolveRequestedDepartmentIds(value, fallbackDepartmentId, options = {}) {
  const preferredLayoutType = normalizeDepartmentLayoutType(options.preferred_layout_type || options.preferredLayoutType);
  const visibleDepartments = getDispatchVisibleDepartments();
  const preferredDepartments = preferredLayoutType
    ? visibleDepartments.filter(
      dept => normalizeDepartmentLayoutType(dept?.layout_type) === preferredLayoutType
    )
    : [];
  const candidateDepartments = preferredDepartments.length > 0 ? preferredDepartments : visibleDepartments;
  const visibleIds = new Set(candidateDepartments.map(dept => Number(dept.id)));
  const normalized = normalizeRequestedDepartmentIds(value).filter(id => visibleIds.has(id));
  if (normalized.length > 0) return normalized;

  const fallbackId = Number(fallbackDepartmentId);
  if (visibleIds.has(fallbackId)) return [fallbackId];

  const firstVisibleId = Array.from(visibleIds)[0] || 0;
  return firstVisibleId ? [firstVisibleId] : [];
}

function chooseCallDepartmentId(cadUser, requestedDepartmentId, options = {}) {
  const preferredLayoutType = normalizeDepartmentLayoutType(options.preferred_layout_type || options.preferredLayoutType);
  const matchesPreferredLayout = (dept) => (
    !preferredLayoutType || normalizeDepartmentLayoutType(dept?.layout_type) === preferredLayoutType
  );

  if (cadUser) {
    const onDutyUnit = Units.findByUserId(cadUser.id);
    if (onDutyUnit) {
      const unitDept = Departments.findById(onDutyUnit.department_id);
      if (unitDept && unitDept.is_active && !unitDept.is_dispatch && matchesPreferredLayout(unitDept)) {
        return unitDept.id;
      }
    }
  }

  const requestedId = parseInt(requestedDepartmentId, 10);
  if (requestedId) {
    const requestedDept = Departments.findById(requestedId);
    if (requestedDept && requestedDept.is_active && !requestedDept.is_dispatch && matchesPreferredLayout(requestedDept)) {
      return requestedDept.id;
    }
  }

  const dispatchVisible = Departments.listDispatchVisible().find(
    d => d.is_active && !d.is_dispatch && matchesPreferredLayout(d)
  );
  if (dispatchVisible) return dispatchVisible.id;

  const activeNonDispatch = Departments.listActive().find(
    d => !d.is_dispatch && matchesPreferredLayout(d)
  );
  if (activeNonDispatch) return activeNonDispatch.id;

  if (!preferredLayoutType) {
    const activeAny = Departments.listActive()[0];
    return activeAny ? activeAny.id : null;
  }

  return null;
}

function countOnDutyUnitsForDepartment(departmentId) {
  const deptId = Number(departmentId);
  if (!Number.isInteger(deptId) || deptId <= 0) return 0;
  try {
    return Units.listByDepartment(deptId).length;
  } catch {
    return 0;
  }
}

function chooseAlarmPrimaryOrBackupDepartment(primaryDepartmentId, backupDepartmentId) {
  const primaryId = normalizeAlarmZoneDepartmentRef(primaryDepartmentId);
  const backupId = normalizeAlarmZoneDepartmentRef(backupDepartmentId);

  if (primaryId) {
    const primaryOnlineCount = countOnDutyUnitsForDepartment(primaryId);
    if (primaryOnlineCount > 0 || !backupId) {
      return {
        department_id: primaryId,
        backup_used: false,
        primary_online_count: primaryOnlineCount,
        backup_online_count: backupId ? countOnDutyUnitsForDepartment(backupId) : 0,
      };
    }
    return {
      department_id: backupId,
      backup_used: true,
      primary_online_count: primaryOnlineCount,
      backup_online_count: countOnDutyUnitsForDepartment(backupId),
    };
  }

  if (backupId) {
    return {
      department_id: backupId,
      backup_used: true,
      primary_online_count: 0,
      backup_online_count: countOnDutyUnitsForDepartment(backupId),
    };
  }

  return {
    department_id: 0,
    backup_used: false,
    primary_online_count: 0,
    backup_online_count: 0,
  };
}

function isLawEnforcementDepartment(department) {
  return !!(
    department
    && !department.is_dispatch
    && department.is_active
    && normalizeDepartmentLayoutType(department.layout_type) === LAW_ENFORCEMENT_LAYOUT_TYPE
  );
}

function chooseTrafficStopDepartmentId(cadUser, requestedDepartmentId, callId) {
  const parsedCallId = Number(callId);
  if (Number.isInteger(parsedCallId) && parsedCallId > 0) {
    const linkedCall = Calls.findById(parsedCallId);
    const linkedCallDept = linkedCall ? Departments.findById(Number(linkedCall.department_id || 0)) : null;
    if (isLawEnforcementDepartment(linkedCallDept)) {
      return Number(linkedCallDept.id);
    }
  }

  const preferred = chooseCallDepartmentId(cadUser, requestedDepartmentId, {
    preferred_layout_type: LAW_ENFORCEMENT_LAYOUT_TYPE,
  });
  const preferredDept = preferred ? Departments.findById(Number(preferred)) : null;
  if (isLawEnforcementDepartment(preferredDept)) {
    return Number(preferredDept.id);
  }

  const dispatchVisiblePolice = Departments.listDispatchVisible().find((dept) => isLawEnforcementDepartment(dept));
  if (dispatchVisiblePolice?.id) return Number(dispatchVisiblePolice.id);

  const activePolice = Departments.listActive().find((dept) => isLawEnforcementDepartment(dept));
  if (activePolice?.id) return Number(activePolice.id);

  return 0;
}

function chooseActiveLinkForUser(user) {
  if (!user) return null;
  const preferredCitizenId = String(user.preferred_citizen_id || '').trim();

  const candidates = [];
  if (String(user.steam_id || '').trim()) {
    candidates.push(FiveMPlayerLinks.findBySteamId(String(user.steam_id).trim()));
  }
  if (String(user.discord_id || '').trim()) {
    candidates.push(FiveMPlayerLinks.findBySteamId(`discord:${String(user.discord_id).trim()}`));
  }

  let selectedPreferred = null;
  let selectedFallback = null;
  for (const candidate of candidates) {
    if (!candidate || !isActiveFiveMLink(candidate)) continue;
    const candidateCitizen = String(candidate.citizen_id || '').trim();
    const candidateScore = (candidateCitizen ? 2 : 0) + (String(candidate.game_id || '').trim() ? 1 : 0);

    const isPreferred = !!preferredCitizenId && candidateCitizen === preferredCitizenId;
    if (isPreferred) {
      if (!selectedPreferred) {
        selectedPreferred = candidate;
      } else {
        const selectedPreferredScore = (String(selectedPreferred.citizen_id || '').trim() ? 2 : 0)
          + (String(selectedPreferred.game_id || '').trim() ? 1 : 0);
        if (candidateScore > selectedPreferredScore) selectedPreferred = candidate;
      }
      continue;
    }

    if (!selectedFallback) {
      selectedFallback = candidate;
      continue;
    }
    const selectedFallbackScore = (String(selectedFallback.citizen_id || '').trim() ? 2 : 0)
      + (String(selectedFallback.game_id || '').trim() ? 1 : 0);
    if (candidateScore > selectedFallbackScore) selectedFallback = candidate;
  }
  return selectedPreferred || selectedFallback || null;
}

function findActiveLinkByCitizenId(citizenId) {
  const target = String(citizenId || '').trim().toLowerCase();
  if (!target) return null;

  for (const link of FiveMPlayerLinks.list()) {
    if (!isActiveFiveMLink(link)) continue;
    const linkedCitizenId = String(link.citizen_id || '').trim().toLowerCase();
    if (!linkedCitizenId) continue;
    if (linkedCitizenId === target) return link;
  }
  return null;
}

function findActiveLinkByGameId(gameId) {
  const target = String(gameId || '').trim();
  if (!target) return null;

  for (const link of FiveMPlayerLinks.list()) {
    if (!isActiveFiveMLink(link)) continue;
    const linkedGameId = String(link.game_id || '').trim();
    if (!linkedGameId) continue;
    if (linkedGameId === target) return link;
  }
  return null;
}

function resolveCadUserIdByGameId(gameId) {
  const target = String(gameId || '').trim();
  if (!target) return 0;

  for (const link of FiveMPlayerLinks.list()) {
    if (!isActiveFiveMLink(link)) continue;
    if (String(link.game_id || '').trim() !== target) continue;

    const linkKey = String(link.steam_id || '').trim();
    const parsed = parseFiveMLinkKey(linkKey);

    let cadUser = null;
    if (parsed.type === 'steam' && parsed.value) {
      cadUser = Users.findBySteamId(parsed.value) || null;
    } else if (parsed.type === 'discord' && parsed.value) {
      cadUser = Users.findByDiscordId(parsed.value) || null;
    }

    if (!cadUser && linkKey) {
      const cachedUserId = liveLinkUserCache.get(linkKey);
      if (cachedUserId) {
        cadUser = Users.findById(cachedUserId) || null;
      }
    }

    if (cadUser?.id) return Number(cadUser.id);
  }

  return 0;
}

function normalizePostalToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function extractPostalFromLocation(location) {
  const text = String(location || '').trim();
  if (!text) return '';

  const trailingParen = text.match(/\(([^)]+)\)\s*$/);
  if (trailingParen?.[1]) return trailingParen[1].trim();

  const directPostal = text.match(/^\s*([a-zA-Z]?\d{3,6}[a-zA-Z]?)\s*$/);
  if (directPostal?.[1]) return directPostal[1].trim();

  const lastPostal = text.match(/([a-zA-Z]?\d{3,6}[a-zA-Z]?)(?!.*[a-zA-Z]?\d{3,6}[a-zA-Z]?)/);
  if (lastPostal?.[1]) return lastPostal[1].trim();
  return '';
}

function resolveCallPostal(call) {
  const explicit = String(call?.postal || '').trim();
  if (explicit) return explicit;
  return extractPostalFromLocation(call?.location || '');
}

function getRouteJobId(unitId, callId, action = 'set') {
  return `${Number(unitId || 0)}:${Number(callId || 0)}:${String(action || 'set').toLowerCase()}`;
}

function clearRouteJobsForAssignment(callId, unitId) {
  const targetCallId = Number(callId || 0);
  const targetUnitId = Number(unitId || 0);
  if (!targetCallId || !targetUnitId) return;
  for (const [key, job] of pendingRouteJobs.entries()) {
    if (Number(job.unit_id || 0) !== targetUnitId) continue;
    if (Number(job.call_id || 0) !== targetCallId) continue;
    pendingRouteJobs.delete(key);
  }
}

function resolveRouteTargetForUnit(unit) {
  if (!unit) return null;
  const user = Users.findById(unit.user_id);
  if (!user) return null;
  const activeLink = chooseActiveLinkForUser(user);

  return {
    user_id: Number(user.id || 0),
    steam_id: String(activeLink?.steam_id || user.steam_id || '').trim(),
    discord_id: String(user.discord_id || '').trim(),
    citizen_id: String(activeLink?.citizen_id || user.preferred_citizen_id || '').trim(),
    game_id: String(activeLink?.game_id || '').trim(),
    player_name: String(activeLink?.player_name || '').trim(),
    target_position_x: Number(activeLink?.position_x),
    target_position_y: Number(activeLink?.position_y),
    target_position_z: Number(activeLink?.position_z),
  };
}

function hasRouteTarget(target) {
  if (!target || typeof target !== 'object') return false;
  return !!(
    String(target.game_id || '').trim()
    || String(target.citizen_id || '').trim()
    || String(target.discord_id || '').trim()
    || String(target.steam_id || '').trim()
  );
}

function enrichRouteJobWithTarget(baseJob, target) {
  const resolved = target && typeof target === 'object' ? target : {};
  return {
    ...baseJob,
    user_id: Number(resolved.user_id || 0) || 0,
    steam_id: String(resolved.steam_id || '').trim(),
    discord_id: String(resolved.discord_id || '').trim(),
    citizen_id: String(resolved.citizen_id || '').trim(),
    game_id: String(resolved.game_id || '').trim(),
    player_name: String(resolved.player_name || '').trim(),
    target_position_x: Number(resolved.target_position_x),
    target_position_y: Number(resolved.target_position_y),
    target_position_z: Number(resolved.target_position_z),
  };
}

function queueRouteJobForAssignment(call, unit) {
  const callId = Number(call?.id || 0);
  const unitId = Number(unit?.id || 0);
  if (!callId || !unitId) return;

  const routeTarget = resolveRouteTargetForUnit(unit);
  if (!hasRouteTarget(routeTarget)) return;

  const postal = String(resolveCallPostal(call) || '').trim();
  const positionX = Number(call?.position_x);
  const positionY = Number(call?.position_y);
  const positionZ = Number(call?.position_z);
  const hasPosition = Number.isFinite(positionX) && Number.isFinite(positionY);
  if (!postal && !hasPosition) return;

  clearRouteJobsForAssignment(callId, unitId);
  const routeJobId = getRouteJobId(unitId, callId, 'set');
  pendingRouteJobs.set(routeJobId, enrichRouteJobWithTarget({
    id: routeJobId,
    unit_id: unitId,
    call_id: callId,
    action: 'set',
    clear_waypoint: 0,
    call_title: String(call?.title || ''),
    location: String(call?.location || ''),
    postal,
    position_x: hasPosition ? positionX : null,
    position_y: hasPosition ? positionY : null,
    position_z: Number.isFinite(positionZ) ? positionZ : null,
    created_at: Date.now(),
    updated_at: Date.now(),
  }, routeTarget));
}

function queueRouteClearJob(call, unit, fallbackUnitId = 0) {
  const unitId = Number(unit?.id || fallbackUnitId || 0);
  if (!unitId) return;

  const callId = Number(call?.id || 0);
  const routeTarget = resolveRouteTargetForUnit(unit);
  if (!hasRouteTarget(routeTarget)) return;

  clearRouteJobsForAssignment(callId, unitId);
  const routeJobId = getRouteJobId(unitId, callId, 'clear');
  pendingRouteJobs.set(routeJobId, enrichRouteJobWithTarget({
    id: routeJobId,
    unit_id: unitId,
    call_id: callId,
    action: 'clear',
    clear_waypoint: 1,
    call_title: String(call?.title || ''),
    location: String(call?.location || ''),
    postal: '',
    position_x: null,
    position_y: null,
    position_z: null,
    created_at: Date.now(),
    updated_at: Date.now(),
  }, routeTarget));
}

function getPursuitRouteJobId(unitId, callId, action = 'pursuit') {
  return `${Number(unitId || 0)}:${Number(callId || 0)}:${String(action || 'pursuit').toLowerCase()}`;
}

function queuePursuitFollowRouteJob(call, followerUnit, primaryUnit, primaryTarget) {
  const callId = Number(call?.id || 0);
  const followerUnitId = Number(followerUnit?.id || 0);
  const primaryUnitId = Number(primaryUnit?.id || 0);
  if (!callId || !followerUnitId || !primaryUnitId) return;
  if (followerUnitId === primaryUnitId) return;

  const routeTarget = resolveRouteTargetForUnit(followerUnit);
  if (!hasRouteTarget(routeTarget)) return;

  const x = Number(primaryTarget?.target_position_x);
  const y = Number(primaryTarget?.target_position_y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;

  clearRouteJobsForAssignment(callId, followerUnitId);
  const routeJobId = getPursuitRouteJobId(followerUnitId, callId, 'pursuit');
  pendingRouteJobs.set(routeJobId, enrichRouteJobWithTarget({
    id: routeJobId,
    unit_id: followerUnitId,
    call_id: callId,
    action: 'pursuit',
    clear_waypoint: 0,
    call_title: String(call?.title || 'Pursuit'),
    location: `Follow primary unit ${String(primaryUnit?.callsign || '').trim() || `#${primaryUnitId}`}`,
    postal: '',
    position_x: x,
    position_y: y,
    position_z: Number.isFinite(Number(primaryTarget?.target_position_z))
      ? Number(primaryTarget.target_position_z)
      : null,
    route_type: 'pursuit_follow',
    route_label: `Pursuit lead ${String(primaryUnit?.callsign || '').trim() || `#${primaryUnitId}`}`,
    suppress_notify: 1,
    primary_unit_id: primaryUnitId,
    primary_callsign: String(primaryUnit?.callsign || '').trim(),
    created_at: Date.now(),
    updated_at: Date.now(),
  }, routeTarget));
}

function queuePursuitRouteClearJob(call, followerUnit) {
  const callId = Number(call?.id || 0);
  const followerUnitId = Number(followerUnit?.id || 0);
  if (!callId || !followerUnitId) return;

  const routeTarget = resolveRouteTargetForUnit(followerUnit);
  if (!hasRouteTarget(routeTarget)) return;

  clearRouteJobsForAssignment(callId, followerUnitId);
  const routeJobId = getPursuitRouteJobId(followerUnitId, callId, 'pursuit_clear');
  pendingRouteJobs.set(routeJobId, enrichRouteJobWithTarget({
    id: routeJobId,
    unit_id: followerUnitId,
    call_id: callId,
    action: 'clear',
    clear_waypoint: 1,
    call_title: String(call?.title || 'Pursuit'),
    location: '',
    postal: '',
    position_x: null,
    position_y: null,
    position_z: null,
    route_type: 'pursuit_follow',
    route_label: 'Pursuit route',
    suppress_notify: 1,
    created_at: Date.now(),
    updated_at: Date.now(),
  }, routeTarget));
}

function refreshPursuitFollowerRoutes() {
  const activeDepartments = Departments.listActive().filter((dept) => !dept.is_dispatch);
  const departmentIds = activeDepartments
    .map((dept) => Number(dept.id))
    .filter((id) => Number.isInteger(id) && id > 0);
  const activeCalls = departmentIds.length > 0 ? Calls.listByDepartmentIds(departmentIds, false) : [];
  const nextFollowerUnitIdsByCall = new Map();

  for (const call of activeCalls) {
    if (normalizeCallStatus(call?.status) === 'closed') continue;
    const pursuitEnabled = Number(call?.pursuit_mode_enabled || 0) === 1;
    if (!pursuitEnabled) continue;

    const primaryUnitId = Number(call?.pursuit_primary_unit_id || 0);
    if (!primaryUnitId) continue;

    const assignedUnits = Array.isArray(call?.assigned_units) ? call.assigned_units : [];
    const primaryUnit = assignedUnits.find((unit) => Number(unit?.id || 0) === primaryUnitId) || null;
    if (!primaryUnit) continue;

    const followerUnits = assignedUnits.filter((unit) => {
      const unitId = Number(unit?.id || 0);
      return unitId > 0 && unitId !== primaryUnitId;
    });
    nextFollowerUnitIdsByCall.set(Number(call.id), new Set(followerUnits.map((unit) => Number(unit.id))));

    const primaryTarget = resolveRouteTargetForUnit(primaryUnit);
    const hasPrimaryCoords = Number.isFinite(Number(primaryTarget?.target_position_x))
      && Number.isFinite(Number(primaryTarget?.target_position_y));
    if (!hasPrimaryCoords) continue;

    for (const followerUnit of followerUnits) {
      queuePursuitFollowRouteJob(call, followerUnit, primaryUnit, primaryTarget);
    }
  }

  for (const [callId, previousFollowerIds] of activePursuitFollowerUnitIdsByCall.entries()) {
    const nextFollowerIds = nextFollowerUnitIdsByCall.get(callId) || new Set();
    for (const previousFollowerId of previousFollowerIds.values()) {
      if (nextFollowerIds.has(previousFollowerId)) continue;
      const unit = Units.findById(previousFollowerId);
      if (!unit) continue;
      queuePursuitRouteClearJob({ id: callId, title: 'Pursuit' }, unit);
    }
  }

  activePursuitFollowerUnitIdsByCall.clear();
  for (const [callId, followerIds] of nextFollowerUnitIdsByCall.entries()) {
    activePursuitFollowerUnitIdsByCall.set(callId, followerIds);
  }
}

function clearRouteJobsForUnit(unitId) {
  const target = Number(unitId || 0);
  if (!target) return;
  for (const [key, job] of pendingRouteJobs.entries()) {
    if (Number(job.unit_id || 0) === target) {
      pendingRouteJobs.delete(key);
    }
  }
}

function clearRouteJobsForCall(callId, keepClearJobs = true) {
  const target = Number(callId || 0);
  if (!target) return;
  for (const [key, job] of pendingRouteJobs.entries()) {
    if (Number(job.call_id || 0) === target) {
      if (keepClearJobs && String(job.action || '').toLowerCase() === 'clear') continue;
      pendingRouteJobs.delete(key);
    }
  }
}

function normalizeRequestedDepartmentIdsFromCall(call) {
  if (Array.isArray(call?.requested_department_ids)) {
    return Array.from(new Set(
      call.requested_department_ids
        .map(item => Number(item))
        .filter(item => Number.isInteger(item) && item > 0)
    ));
  }

  const raw = String(call?.requested_department_ids_json || '').trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return Array.from(new Set(
          parsed
            .map(item => Number(item))
            .filter(item => Number.isInteger(item) && item > 0)
        ));
      }
    } catch {
      // ignore malformed JSON
    }
  }

  const fallback = Number(call?.department_id || 0);
  return Number.isInteger(fallback) && fallback > 0 ? [fallback] : [];
}

function normalizeCallStatus(value) {
  return String(value || '').trim().toLowerCase();
}

function isPendingDispatchCall(call) {
  return normalizeCallStatus(call?.status) === CALL_STATUS_PENDING_DISPATCH;
}

function clearPendingCallAutoClose(callId) {
  const normalizedCallId = Number(callId || 0);
  if (!normalizedCallId) return;
  const handle = pendingCallAutoCloseTimers.get(normalizedCallId);
  if (handle) {
    clearTimeout(handle);
  }
  pendingCallAutoCloseTimers.delete(normalizedCallId);
}

function getAssignedUnitCount(call) {
  if (!Array.isArray(call?.assigned_units)) return 0;
  return call.assigned_units.reduce((count, unit) => (
    Number(unit?.id || 0) > 0 ? count + 1 : count
  ), 0);
}

function schedulePendingCallAutoClose(callId) {
  const normalizedCallId = Number(callId || 0);
  if (!normalizedCallId) return;

  clearPendingCallAutoClose(normalizedCallId);
  const handle = setTimeout(() => {
    pendingCallAutoCloseTimers.delete(normalizedCallId);

    const call = Calls.findById(normalizedCallId);
    if (!call) return;
    if (normalizeCallStatus(call.status) === 'closed') return;
    if (getAssignedUnitCount(call) > 0) return;

    Calls.close(normalizedCallId);
    audit(null, 'fivem_call_autoclosed_unassigned', {
      callId: normalizedCallId,
      delay_ms: MINICAD_UNASSIGNED_CALL_AUTOCLOSE_DELAY_MS,
      source: 'fivem_bridge_minicad_detach',
    });
  }, MINICAD_UNASSIGNED_CALL_AUTOCLOSE_DELAY_MS);

  pendingCallAutoCloseTimers.set(normalizedCallId, handle);
}

function getCallPromptId(callId, departmentId) {
  return `closest:${Number(callId || 0)}:${Number(departmentId || 0)}`;
}

function getDeclineKey(callId, departmentId, unitId) {
  return `${Number(callId || 0)}:${Number(departmentId || 0)}:${Number(unitId || 0)}`;
}

function getEscalationKey(callId, departmentId) {
  return `${Number(callId || 0)}:${Number(departmentId || 0)}`;
}

function pruneClosestCallDeclines(now = Date.now()) {
  const cutoff = Number(now) - CLOSEST_CALL_DECLINE_COOLDOWN_MS;
  for (const [key, declinedAt] of closestCallDeclines.entries()) {
    if (Number(declinedAt || 0) < cutoff) {
      closestCallDeclines.delete(key);
    }
  }
}

function clearClosestCallPrompt(callId, departmentId = null) {
  const normalizedCallId = Number(callId || 0);
  if (!normalizedCallId) return;

  const normalizedDepartmentId = Number(departmentId || 0);
  if (normalizedDepartmentId > 0) {
    pendingClosestCallPrompts.delete(getCallPromptId(normalizedCallId, normalizedDepartmentId));
    return;
  }

  const prefix = `closest:${normalizedCallId}:`;
  for (const [id] of pendingClosestCallPrompts.entries()) {
    if (id.startsWith(prefix)) {
      pendingClosestCallPrompts.delete(id);
    }
  }
}

function clearClosestCallPromptsForUnit(unitId) {
  const normalizedUnitId = Number(unitId || 0);
  if (!normalizedUnitId) return;
  for (const [id, job] of pendingClosestCallPrompts.entries()) {
    if (Number(job?.unit_id || 0) === normalizedUnitId) {
      pendingClosestCallPrompts.delete(id);
    }
  }
}

function clearClosestCallDeclines(callId, departmentId = null) {
  const normalizedCallId = Number(callId || 0);
  if (!normalizedCallId) return;
  const normalizedDepartmentId = Number(departmentId || 0);
  for (const [key] of closestCallDeclines.entries()) {
    if (normalizedDepartmentId > 0) {
      if (key.startsWith(`${normalizedCallId}:${normalizedDepartmentId}:`)) {
        closestCallDeclines.delete(key);
      }
      continue;
    }
    if (key.startsWith(`${normalizedCallId}:`)) {
      closestCallDeclines.delete(key);
    }
  }
}

function clearClosestCallEscalations(callId, departmentId = null) {
  const normalizedCallId = Number(callId || 0);
  if (!normalizedCallId) return;
  const normalizedDepartmentId = Number(departmentId || 0);
  for (const [key] of closestCallDeptEscalations.entries()) {
    if (normalizedDepartmentId > 0) {
      if (key === getEscalationKey(normalizedCallId, normalizedDepartmentId)) {
        closestCallDeptEscalations.delete(key);
      }
      continue;
    }
    if (key.startsWith(`${normalizedCallId}:`)) {
      closestCallDeptEscalations.delete(key);
    }
  }
}

function markClosestCallDepartmentEscalated(callId, departmentId) {
  const normalizedCallId = Number(callId || 0);
  const normalizedDepartmentId = Number(departmentId || 0);
  if (!normalizedCallId || !normalizedDepartmentId) return;
  closestCallDeptEscalations.set(getEscalationKey(normalizedCallId, normalizedDepartmentId), Date.now());
}

function isClosestCallDepartmentEscalated(callId, departmentId) {
  const normalizedCallId = Number(callId || 0);
  const normalizedDepartmentId = Number(departmentId || 0);
  if (!normalizedCallId || !normalizedDepartmentId) return false;
  return closestCallDeptEscalations.has(getEscalationKey(normalizedCallId, normalizedDepartmentId));
}

function countClosestCallPromptsForCall(callId) {
  const normalizedCallId = Number(callId || 0);
  if (!normalizedCallId) return 0;
  let count = 0;
  for (const job of pendingClosestCallPrompts.values()) {
    if (Number(job?.call_id || 0) === normalizedCallId) {
      count += 1;
    }
  }
  return count;
}

function hasActiveDispatcherOnline() {
  const dispatchDeptIds = Departments.list()
    .filter(dept => dept.is_dispatch)
    .map(dept => Number(dept.id))
    .filter(id => Number.isInteger(id) && id > 0);

  if (dispatchDeptIds.length === 0) return false;
  return Units.listByDepartmentIds(dispatchDeptIds).length > 0;
}

function parseCallPosition(call) {
  const x = Number(call?.position_x);
  const y = Number(call?.position_y);
  const z = Number(call?.position_z);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y, z: Number.isFinite(z) ? z : 0 };
}

function extractMiniCadCallerAndReason(call) {
  const title = String(call?.title || '').trim();
  const rawDescription = String(call?.description || '').trim();
  const jobCode = String(call?.job_code || '').trim();
  const parts = rawDescription
    .split('|')
    .map(part => String(part || '').trim())
    .filter(Boolean);

  let callerName = '';
  let reasonForCall = '';

  const callerMatch = rawDescription.match(/(?:^|\r?\n)\s*caller\s*:\s*([^\r\n]+)/i);
  if (callerMatch && callerMatch[1]) {
    callerName = String(callerMatch[1] || '').trim();
  }

  const reasonMatch = rawDescription.match(/(?:^|\r?\n)\s*reason\s*:\s*([\s\S]*)$/i);
  if (reasonMatch && reasonMatch[1]) {
    reasonForCall = String(reasonMatch[1] || '').trim();
  }

  if (!callerName) {
    const legacyCallerLine = parts.find(part => /^000 call from /i.test(part)) || '';
    if (legacyCallerLine) {
      callerName = legacyCallerLine
        .replace(/^000 call from /i, '')
        .replace(/\s*\(#\d+\)\s*$/i, '')
        .trim();
    }
  }

  if (!reasonForCall) {
    const legacyCallerLine = parts.find(part => /^000 call from /i.test(part)) || '';
    const filtered = parts.filter(part => (
      part !== legacyCallerLine
      && !/^requested departments:/i.test(part)
      && !/^link:/i.test(part)
    ));
    reasonForCall = filtered.join(' | ').trim();
  }

  if (!reasonForCall) {
    reasonForCall = rawDescription || title;
  }

  if (jobCode !== '000' && !callerName) {
    callerName = '';
  }

  return {
    caller_name: callerName,
    reason_for_call: reasonForCall,
  };
}

function publishPendingDispatchCall(call, { reason = '' } = {}) {
  const callId = Number(call?.id || 0);
  if (!callId) return null;

  let resolvedCall = Calls.findById(callId) || call;
  if (!resolvedCall) return null;

  if (normalizeCallStatus(resolvedCall.status) === 'closed') {
    clearClosestCallPrompt(callId);
    clearClosestCallDeclines(callId);
    clearClosestCallEscalations(callId);
    return resolvedCall;
  }

  const wasPendingDispatch = isPendingDispatchCall(resolvedCall);
  if (wasPendingDispatch) {
    Calls.update(callId, {
      status: CALL_STATUS_ACTIVE,
    });
    resolvedCall = Calls.findById(callId) || {
      ...resolvedCall,
      status: CALL_STATUS_ACTIVE,
    };
    const normalizedReason = String(reason || '').trim().toLowerCase();
    bus.emit('call:create', {
      departmentId: resolvedCall.department_id,
      call: resolvedCall,
      from_fivem_pending_dispatch: true,
      fivem_pending_dispatch_reason: normalizedReason,
      play_emergency_sound: normalizedReason === 'closest_unit_declined',
    });
  }

  clearClosestCallPrompt(callId);
  clearClosestCallDeclines(callId);
  clearClosestCallEscalations(callId);

  if (reason) {
    audit(null, 'fivem_pending_call_published', {
      callId,
      reason,
      was_pending_dispatch: wasPendingDispatch,
    });
  }

  return resolvedCall;
}

function queueClosestCallPromptForCall(call, { force = false } = {}) {
  const callId = Number(call?.id || 0);
  if (!callId) {
    return {
      call_id: 0,
      queued_prompt_count: 0,
      requested_department_ids: [],
      queued_prompt_ids: [],
    };
  }

  const resolvedCall = Calls.findById(callId) || call;
  if (!resolvedCall) {
    clearClosestCallPrompt(callId);
    clearClosestCallDeclines(callId);
    clearClosestCallEscalations(callId);
    return {
      call_id: callId,
      queued_prompt_count: 0,
      requested_department_ids: [],
      queued_prompt_ids: [],
    };
  }

  const callStatus = normalizeCallStatus(resolvedCall.status);
  if (callStatus === 'closed') {
    clearClosestCallPrompt(callId);
    clearClosestCallDeclines(callId);
    clearClosestCallEscalations(callId);
    return {
      call_id: callId,
      queued_prompt_count: 0,
      requested_department_ids: [],
      queued_prompt_ids: [],
    };
  }

  // Closest-unit prompts only run while the call is hidden from CAD.
  if (callStatus !== CALL_STATUS_PENDING_DISPATCH) {
    clearClosestCallPrompt(callId);
    clearClosestCallDeclines(callId);
    clearClosestCallEscalations(callId);
    return {
      call_id: callId,
      queued_prompt_count: 0,
      requested_department_ids: normalizeRequestedDepartmentIdsFromCall(resolvedCall),
      queued_prompt_ids: [],
    };
  }

  const callPosition = parseCallPosition(resolvedCall);
  if (!callPosition) {
    clearClosestCallPrompt(callId);
    return {
      call_id: callId,
      queued_prompt_count: 0,
      requested_department_ids: normalizeRequestedDepartmentIdsFromCall(resolvedCall),
      queued_prompt_ids: [],
    };
  }

  if (hasActiveDispatcherOnline()) {
    clearClosestCallPrompt(callId);
    return {
      call_id: callId,
      queued_prompt_count: 0,
      requested_department_ids: normalizeRequestedDepartmentIdsFromCall(resolvedCall),
      queued_prompt_ids: [],
    };
  }

  const assignedUnits = Array.isArray(resolvedCall.assigned_units) ? resolvedCall.assigned_units : [];
  if (assignedUnits.length > 0) {
    clearClosestCallPrompt(callId);
    return {
      call_id: callId,
      queued_prompt_count: 0,
      requested_department_ids: normalizeRequestedDepartmentIdsFromCall(resolvedCall),
      queued_prompt_ids: [],
    };
  }

  const requestedDeptIds = normalizeRequestedDepartmentIdsFromCall(resolvedCall);
  if (requestedDeptIds.length === 0) {
    clearClosestCallPrompt(callId);
    return {
      call_id: callId,
      queued_prompt_count: 0,
      requested_department_ids: [],
      queued_prompt_ids: [],
    };
  }

  pruneClosestCallDeclines();
  const requestedDeptIdSet = new Set(requestedDeptIds);
  const availableUnits = Units.listByDepartmentIds(requestedDeptIds)
    .filter((unit) => {
      if (String(unit?.status || '').trim().toLowerCase() !== 'available') return false;
      const unitDeptId = Number(unit?.department_id || 0);
      return requestedDeptIdSet.has(unitDeptId);
    });

  const queuedPromptJobs = [];

  for (const departmentId of requestedDeptIds) {
    if (isClosestCallDepartmentEscalated(callId, departmentId)) {
      clearClosestCallPrompt(callId, departmentId);
      continue;
    }

    let best = null;
    for (const unit of availableUnits) {
      const unitId = Number(unit?.id || 0);
      const unitDeptId = Number(unit?.department_id || 0);
      if (!unitId || unitDeptId !== departmentId) continue;
      if (assignedUnits.some(assigned => Number(assigned?.id || 0) === unitId)) continue;

      const target = resolveRouteTargetForUnit(unit);
      if (!hasRouteTarget(target)) continue;

      let unitX = Number(target.target_position_x);
      let unitY = Number(target.target_position_y);

      if ((!Number.isFinite(unitX) || !Number.isFinite(unitY)) && String(target.citizen_id || '').trim()) {
        const byCitizen = findActiveLinkByCitizenId(target.citizen_id);
        unitX = Number(byCitizen?.position_x);
        unitY = Number(byCitizen?.position_y);
      }
      if (!Number.isFinite(unitX) || !Number.isFinite(unitY)) continue;

      const declineKey = getDeclineKey(callId, departmentId, unitId);
      const declinedAt = Number(closestCallDeclines.get(declineKey) || 0);
      if (!force && declinedAt > 0 && (Date.now() - declinedAt) < CLOSEST_CALL_DECLINE_COOLDOWN_MS) {
        continue;
      }

      const dx = unitX - callPosition.x;
      const dy = unitY - callPosition.y;
      const distance = Math.sqrt((dx * dx) + (dy * dy));
      if (!Number.isFinite(distance)) continue;

      if (!best || distance < best.distance) {
        best = {
          unit,
          target,
          distance,
        };
      }
    }

    if (!best) {
      clearClosestCallPrompt(callId, departmentId);
      continue;
    }

    const promptId = getCallPromptId(callId, departmentId);
    const existingJob = pendingClosestCallPrompts.get(promptId) || null;
    if (
      !force
      && existingJob
      && Number(existingJob.unit_id || 0) === Number(best.unit.id || 0)
      && Number(existingJob.dispatched_at || 0) > 0
    ) {
      queuedPromptJobs.push(existingJob);
      continue;
    }

    const department = Departments.findById(departmentId) || null;
    const routePostal = String(resolveCallPostal(resolvedCall) || '').trim();
    const job = {
      id: promptId,
      call_id: callId,
      department_id: departmentId,
      department_name: String(department?.name || '').trim(),
      department_short_name: String(department?.short_name || '').trim(),
      unit_id: Number(best.unit.id || 0),
      distance_meters: Number(best.distance.toFixed(2)),
      title: String(resolvedCall.title || '').trim(),
      priority: String(resolvedCall.priority || '').trim(),
      location: String(resolvedCall.location || '').trim(),
      postal: routePostal,
      position_x: callPosition.x,
      position_y: callPosition.y,
      position_z: callPosition.z,
      created_at: Date.now(),
      updated_at: Date.now(),
      dispatched_at: 0,
    };

    pendingClosestCallPrompts.set(promptId, enrichRouteJobWithTarget(job, best.target));
    queuedPromptJobs.push(pendingClosestCallPrompts.get(promptId));
  }

  return {
    call_id: callId,
    queued_prompt_count: queuedPromptJobs.length,
    requested_department_ids: requestedDeptIds,
    queued_prompt_ids: queuedPromptJobs
      .map(job => String(job?.id || '').trim())
      .filter(Boolean),
  };
}

function resolveActiveLinkForBridgeJob(job = {}, options = {}) {
  const preferUser = options?.preferUser === true;

  const userId = Number(job.user_id || 0);
  if (preferUser && userId > 0) {
    const user = Users.findById(userId);
    if (user) {
      const activeLink = chooseActiveLinkForUser(user);
      if (activeLink) return activeLink;
    }
  }

  const gameId = String(job.game_id || '').trim();
  if (gameId) {
    const byGameId = findActiveLinkByGameId(gameId);
    if (byGameId) return byGameId;
  }

  const citizenId = String(job.citizen_id || '').trim();
  if (citizenId) {
    const byCitizenId = findActiveLinkByCitizenId(citizenId);
    if (byCitizenId) return byCitizenId;
  }

  const discordId = String(job.discord_id || '').trim();
  if (discordId) {
    const byDiscord = FiveMPlayerLinks.findBySteamId(`discord:${discordId}`);
    if (byDiscord && isActiveFiveMLink(byDiscord)) return byDiscord;
  }

  const steamId = String(job.steam_id || '').trim();
  if (steamId) {
    const bySteam = FiveMPlayerLinks.findBySteamId(steamId);
    if (bySteam && isActiveFiveMLink(bySteam)) return bySteam;
  }

  if (userId > 0) {
    const user = Users.findById(userId);
    if (user) {
      const activeLink = chooseActiveLinkForUser(user);
      if (activeLink) return activeLink;
    }
  }

  return null;
}

function shouldAutoSetUnitOnScene(unit, playerPayload, assignedCall) {
  if (!unit || String(unit.status || '').trim().toLowerCase() !== 'enroute') return false;
  if (!assignedCall || String(assignedCall.status || '').trim().toLowerCase() === 'closed') return false;

  const targetPostal = normalizePostalToken(resolveCallPostal(assignedCall));
  if (!targetPostal) return false;
  const currentPostal = normalizePostalToken(playerPayload?.postal || '');
  if (!currentPostal) return false;

  return targetPostal === currentPostal;
}

function refreshClosestPromptForCall(call, options = {}) {
  try {
    return queueClosestCallPromptForCall(call, options);
  } catch (err) {
    console.warn('[FiveMBridge] Could not evaluate closest-unit prompt:', err?.message || err);
  }
  return null;
}

bus.on('call:create', ({ call }) => {
  refreshClosestPromptForCall(call);
});

bus.on('call:update', ({ call }) => {
  refreshClosestPromptForCall(call);
});

bus.on('call:assign', ({ call, unit }) => {
  clearPendingCallAutoClose(call?.id);
  clearClosestCallPrompt(call?.id);
  clearClosestCallDeclines(call?.id);
  clearClosestCallEscalations(call?.id);
  clearClosestCallPromptsForUnit(unit?.id);
  try {
    queueRouteJobForAssignment(call, unit);
  } catch (err) {
    console.warn('[FiveMBridge] Could not queue route job on call assign:', err?.message || err);
  }
});

bus.on('call:unassign', ({ call, unit, unit_id, removed }) => {
  const resolvedCallId = Number(call?.id || 0);
  const resolvedCall = resolvedCallId
    ? (Calls.findById(resolvedCallId) || call)
    : call;
  const resolvedCallStatus = normalizeCallStatus(resolvedCall?.status);
  const resolvedAssignedCount = getAssignedUnitCount(resolvedCall);
  if (resolvedCallId > 0) {
    if (resolvedCallStatus === 'closed') {
      clearPendingCallAutoClose(resolvedCallId);
    } else if (resolvedAssignedCount <= 0) {
      schedulePendingCallAutoClose(resolvedCallId);
    } else {
      clearPendingCallAutoClose(resolvedCallId);
    }
  }

  const resolvedUnit = unit || Units.findById(Number(unit_id || 0));
  const resolvedUnitId = resolvedUnit?.id || unit_id;
  clearRouteJobsForAssignment(call?.id, resolvedUnitId);
  if (!removed) return;
  if (!resolvedUnit) return;

  try {
    queueRouteClearJob(call, resolvedUnit, resolvedUnitId);
  } catch (err) {
    console.warn('[FiveMBridge] Could not queue clear route job on call unassign:', err?.message || err);
  }

  refreshClosestPromptForCall(call, { force: true });
});

bus.on('call:close', ({ call }) => {
  const callId = Number(call?.id || 0);
  clearPendingCallAutoClose(callId);
  clearClosestCallPrompt(callId);
  clearClosestCallDeclines(callId);
  clearClosestCallEscalations(callId);
  const resolvedCall = (callId && Array.isArray(call?.assigned_units))
    ? call
    : (callId ? (Calls.findById(callId) || call) : call);
  const assignedUnits = Array.isArray(resolvedCall?.assigned_units)
    ? resolvedCall.assigned_units
    : [];

  for (const assignedUnit of assignedUnits) {
    const assignedUnitId = Number(assignedUnit?.id || 0);
    if (!assignedUnitId) continue;

    const resolvedUnit = Units.findById(assignedUnitId) || assignedUnit;
    clearRouteJobsForAssignment(callId, assignedUnitId);
    try {
      queueRouteClearJob(resolvedCall, resolvedUnit, assignedUnitId);
    } catch (err) {
      console.warn('[FiveMBridge] Could not queue clear route job on call close:', err?.message || err);
    }
  }

  clearRouteJobsForCall(callId, true);
});

bus.on('unit:offline', ({ unit }) => {
  clearRouteJobsForUnit(unit?.id);
  clearClosestCallPromptsForUnit(unit?.id);
});

bus.on('unit:status_available', ({ unit, call }) => {
  const resolvedUnit = unit || Units.findById(Number(unit?.id || 0));
  if (!resolvedUnit) return;

  clearRouteJobsForUnit(resolvedUnit.id);
  const resolvedCall = call || Calls.getAssignedCallForUnit(resolvedUnit.id) || null;
  if (!resolvedCall) return;
  try {
    queueRouteClearJob(resolvedCall, resolvedUnit, resolvedUnit.id);
  } catch (err) {
    console.warn('[FiveMBridge] Could not queue clear route job on status available:', err?.message || err);
  }

  refreshClosestPromptForCall(resolvedCall, { force: true });
});

bus.on('pursuit:update', () => {
  try {
    refreshPursuitFollowerRoutes();
  } catch (err) {
    console.warn('[FiveMBridge] Could not refresh pursuit follower routes after pursuit update:', err?.message || err);
  }
});

setInterval(() => {
  try {
    refreshPursuitFollowerRoutes();
  } catch (err) {
    console.warn('[FiveMBridge] Pursuit route refresh failed:', err?.message || err);
  }
}, PURSUIT_ROUTE_REFRESH_INTERVAL_MS);

// Heartbeat from FiveM resource with online players + position.
router.post('/heartbeat', requireBridgeAuth, (req, res) => {
  const players = Array.isArray(req.body?.players) ? req.body.players : [];
  const seenLinks = new Set();
  const detectedCadUserIds = new Set();
  const onDutyNameIndex = buildOnDutyNameIndex(Units.list());
  let mappedUnits = 0;
  let unmatchedPlayers = 0;

  for (const player of players) {
    const ids = resolveLinkIdentifiers(player.identifiers);
    if (!ids.linkKey) {
      const fallbackCitizenId = String(player?.citizenid || player?.citizen_id || '').trim().toLowerCase();
      if (fallbackCitizenId) {
        ids.linkKey = `citizen:${fallbackCitizenId}`;
      } else {
        const fallbackSource = String(parseHeartbeatSource(player) || '').trim();
        if (fallbackSource) {
          ids.linkKey = `source:${fallbackSource}`;
        }
      }
    }
    if (!ids.linkKey) continue;
    seenLinks.add(ids.linkKey);
    const playerSource = parseHeartbeatSource(player);
    const gameId = String(playerSource || player?.source || '').trim();
    const position = parseHeartbeatPosition(player);
    const citizenId = String(player.citizenid || player.citizen_id || '').trim();
    const platformName = String(player.platform_name || player.platformName || '').trim();
    const characterName = String(player.character_name || player.characterName || '').trim();
    const fullName = String(player.full_name || player.fullName || '').trim();
    const licenseCharacterName = citizenId
      ? String(DriverLicenses.findByCitizenId(citizenId)?.full_name || '').trim()
      : '';
    const playerName = characterName
      || fullName
      || licenseCharacterName
      || String(player.player_name || player.playerName || player.name || '').trim()
      || platformName;
    const location = String(player.location || '').trim() || formatUnitLocation({ ...player, position });
    const heading = Number(player.heading || 0);
    const speed = Number(player.speed || 0);

    FiveMPlayerLinks.upsert({
      steam_id: ids.linkKey,
      game_id: gameId,
      citizen_id: citizenId,
      player_name: playerName || platformName,
      position_x: position.x,
      position_y: position.y,
      position_z: position.z,
      heading,
      speed,
    });

    const cadUserFromIdentifiers = resolveCadUserFromIdentifiers(ids);
    const cadUserFromPayload = resolveCadUserFromHeartbeatPayload(player);
    let cadUser = cadUserFromIdentifiers || cadUserFromPayload;
    if (cadUserFromIdentifiers && cadUserFromPayload && Number(cadUserFromIdentifiers.id) !== Number(cadUserFromPayload.id)) {
      // Prefer identifier-based mapping if heartbeat-provided CAD id conflicts.
      cadUser = cadUserFromIdentifiers;
    }
    if (!cadUser) {
      const cachedUserId = liveLinkUserCache.get(ids.linkKey);
      if (cachedUserId) {
        const cached = Users.findById(cachedUserId);
        if (cached) {
          cadUser = cached;
        }
      }
    }
    if (!cadUser) {
      // Prefer active character display names for CAD identity matching.
      cadUser = resolveCadUserByName(playerName, onDutyNameIndex)
        || resolveCadUserByName(platformName, onDutyNameIndex);
    }

    const resolvedPlayerName = playerName || platformName;
    const cadUserSteamId = String(cadUser?.steam_id || '').trim();
    if (cadUser && cadUserSteamId) {
      // Keep a canonical link row keyed by the CAD user's steam_id so SQL joins for
      // unit cards always resolve to the current in-game character name.
      FiveMPlayerLinks.upsert({
        steam_id: cadUserSteamId,
        game_id: gameId,
        citizen_id: citizenId,
        player_name: resolvedPlayerName,
        position_x: position.x,
        position_y: position.y,
        position_z: position.z,
        heading,
        speed,
      });

      if (citizenId && String(cadUser.preferred_citizen_id || '').trim() !== citizenId) {
        Users.update(cadUser.id, { preferred_citizen_id: citizenId });
      }
    }
    if (cadUser && citizenId) {
      rememberCadUserCitizenLink(cadUser, citizenId, 'heartbeat');
    }

    const mappedUnit = cadUser ? Units.findByUserId(cadUser.id) : null;

    if (!cadUser) {
      unmatchedPlayers += 1;
      continue;
    }

    if (ids.steamId) liveLinkUserCache.set(ids.steamId, cadUser.id);
    if (ids.discordId) liveLinkUserCache.set(`discord:${ids.discordId}`, cadUser.id);
    if (ids.licenseId) liveLinkUserCache.set(`license:${ids.licenseId}`, cadUser.id);
    detectedCadUserIds.add(cadUser.id);
    const unit = mappedUnit;
    if (!unit) continue;

    mappedUnits += 1;
    const updates = {
      location,
    };
    // Clear legacy auto-generated in-game note text so cards only show operator notes.
    if (isAutoInGameNote(unit.note)) {
      updates.note = '';
    }
    const activeCall = Calls.getAssignedCallForUnit(unit.id);
    if (shouldAutoSetUnitOnScene(unit, { ...player, position }, activeCall)) {
      updates.status = 'on-scene';
    }
    Units.update(unit.id, updates);
    const updated = Units.findById(unit.id);
    bus.emit('unit:update', { departmentId: unit.department_id, unit: updated });
  }

  // Keep closest-unit prompt queue current as fresh unit positions arrive.
  const nowMs = Date.now();
  if ((nowMs - Number(lastClosestCallPromptRefreshAtMs || 0)) >= CLOSEST_CALL_PROMPT_REFRESH_INTERVAL_MS) {
    lastClosestCallPromptRefreshAtMs = nowMs;
    const dispatchVisibleIds = getDispatchVisibleDepartments()
      .map(d => Number(d.id))
      .filter(id => Number.isInteger(id) && id > 0);
    if (dispatchVisibleIds.length > 0) {
      for (const activeCall of Calls.listByDepartmentIds(dispatchVisibleIds, true)) {
        if (normalizeCallStatus(activeCall?.status) !== CALL_STATUS_PENDING_DISPATCH) continue;
        const promptResult = refreshClosestPromptForCall(activeCall);
        if (Number(promptResult?.queued_prompt_count || 0) <= 0) {
          publishPendingDispatchCall(activeCall, { reason: 'closest_prompt_unavailable' });
        }
      }
    }
  }

  const autoOffDutyCount = enforceInGamePresenceForOnDutyUnits(detectedCadUserIds, 'heartbeat');
  res.json({
    ok: true,
    tracked: seenLinks.size,
    mapped_units: mappedUnits,
    unmatched_players: unmatchedPlayers,
    auto_off_duty: autoOffDutyCount,
  });
});

// Optional player disconnect event.
router.post('/offline', requireBridgeAuth, (req, res) => {
  const ids = resolveLinkIdentifiers(req.body?.identifiers || []);
  const cachedUserId = ids.linkKey ? liveLinkUserCache.get(ids.linkKey) : null;
  let cadUser = resolveCadUserFromIdentifiers(ids);
  if (!cadUser && cachedUserId) {
    cadUser = Users.findById(cachedUserId) || null;
  }

  if (ids.steamId) FiveMPlayerLinks.removeBySteamId(ids.steamId);
  if (ids.discordId) FiveMPlayerLinks.removeBySteamId(`discord:${ids.discordId}`);
  if (ids.licenseId) FiveMPlayerLinks.removeBySteamId(`license:${ids.licenseId}`);
  if (ids.steamId) liveLinkUserCache.delete(ids.steamId);
  if (ids.discordId) liveLinkUserCache.delete(`discord:${ids.discordId}`);
  if (ids.licenseId) liveLinkUserCache.delete(`license:${ids.licenseId}`);
  if (ids.linkKey) liveLinkUserCache.delete(ids.linkKey);

  let autoOffDuty = false;
  if (cadUser) {
    autoOffDuty = offDutyIfNotDispatch(Units.findByUserId(cadUser.id), 'offline_event');
  }
  res.json({ ok: true, auto_off_duty: autoOffDuty });
});

// Trigger Discord reverse job-role sync for a specific in-game player after a job/group change.
router.post('/discord/job-role-sync', requireBridgeAuth, async (req, res) => {
  const payload = req.body || {};
  const ids = resolveLinkIdentifiers(payload.identifiers || []);
  const citizenId = String(payload.citizenid || payload.citizen_id || '').trim();
  const trigger = String(payload.trigger || payload.reason || 'job_update').trim() || 'job_update';
  const sourceId = String(payload.source ?? payload.source_id ?? '').trim();
  const jobName = String(payload.job_name || payload.group || '').trim();
  const parsedGrade = Number(payload.job_grade ?? payload.grade ?? 0);
  const jobGrade = Number.isFinite(parsedGrade) ? Math.max(0, Math.trunc(parsedGrade)) : 0;

  let cadUser = resolveCadUserFromBridgeIdentity({ ids, citizenId });
  if (cadUser) {
    if (ids.steamId) liveLinkUserCache.set(ids.steamId, cadUser.id);
    if (ids.discordId) liveLinkUserCache.set(`discord:${ids.discordId}`, cadUser.id);
    if (ids.licenseId) liveLinkUserCache.set(`license:${ids.licenseId}`, cadUser.id);
    if (ids.linkKey) liveLinkUserCache.set(ids.linkKey, cadUser.id);
  }
  if (cadUser && citizenId) {
    rememberCadUserCitizenLink(cadUser, citizenId, 'job_role_sync_trigger');
  }

  if (!cadUser) {
    audit(null, 'fivem_discord_job_role_sync_skipped', {
      reason: 'cad_user_not_linked',
      citizenId,
      trigger,
      sourceId,
      job_name: jobName,
      job_grade: jobGrade,
      hasSteam: !!ids.steamId,
      hasDiscord: !!ids.discordId,
      hasLicense: !!ids.licenseId,
    });
    return res.json({ ok: true, synced: false, reason: 'cad_user_not_linked' });
  }

  const discordId = String(cadUser.discord_id || '').trim();
  if (!discordId) {
    audit(cadUser.id, 'fivem_discord_job_role_sync_skipped', {
      reason: 'cad_user_missing_discord_link',
      citizenId: citizenId || String(cadUser.preferred_citizen_id || '').trim(),
      trigger,
      sourceId,
      job_name: jobName,
      job_grade: jobGrade,
    });
    return res.json({ ok: true, synced: false, reason: 'cad_user_missing_discord_link', user_id: cadUser.id });
  }

  try {
    const { syncUserRoles } = require('../discord/bot');
    const syncResult = await syncUserRoles(discordId);

    audit(cadUser.id, 'fivem_discord_job_role_sync_triggered', {
      discordId,
      citizenId: citizenId || String(cadUser.preferred_citizen_id || '').trim(),
      trigger,
      sourceId,
      job_name: jobName,
      job_grade: jobGrade,
      sync_result: {
        synced: !!syncResult?.synced,
        reason: String(syncResult?.reason || ''),
        reverse_job_role_sync: syncResult?.reverse_job_role_sync || null,
      },
    });

    return res.json({
      ok: true,
      synced: !!syncResult?.synced,
      user_id: cadUser.id,
      discord_id: discordId,
      citizen_id: citizenId || String(cadUser.preferred_citizen_id || '').trim(),
      result: syncResult,
    });
  } catch (err) {
    console.error('[FiveMBridge] Discord job role sync trigger failed:', err?.message || err);
    return res.status(500).json({ error: 'Discord job role sync failed', message: err.message });
  }
});

// List dispatch-visible non-dispatch departments for in-game /000 UI department selection.
router.get('/departments', requireBridgeAuth, (_req, res) => {
  const departments = getDispatchVisibleDepartments().map((dept) => ({
    id: Number(dept.id),
    name: String(dept.name || ''),
    short_name: String(dept.short_name || ''),
    color: String(dept.color || ''),
  }));
  res.json(departments);
});

// Create CAD calls from in-game bridge events (e.g. /000 command).
router.get('/alarm-zones', requireBridgeAuth, (_req, res) => {
  const result = readAdminAlarmZonesOverride();
  res.json({
    ok: true,
    ...result,
    settings_key: FIVEM_AUTO_ALARM_ZONES_SETTINGS_KEY,
    updated_at: new Date().toISOString(),
  });
});

// Create CAD calls from in-game bridge events (e.g. /000 command).
router.post('/calls', requireBridgeAuth, (req, res) => {
  const payload = req.body || {};
  const ids = resolveLinkIdentifiers(payload.identifiers || []);
  const characterName = String(payload.character_name || payload.characterName || '').trim();
  const playerName = characterName || String(payload.player_name || payload.name || '').trim() || 'Unknown Caller';
  const platformName = String(payload.platform_name || payload.platformName || '').trim();
  const sourceId = String(payload.source ?? '').trim();
  const sourceType = normalizeEmergencySourceType(
    payload.source_type || payload.call_source || payload.origin || payload.entry_type
  );
  const preferredLayoutType = normalizeDepartmentLayoutType(
    payload.requested_department_layout_type || payload.department_layout_type || payload.layout_type
  );
  const details = String(payload.message || payload.details || '').trim();

  if (sourceType === 'auto_medical_down') {
    const onlineParamedics = countOnDutyUnitsByDepartmentLayoutType('paramedics');
    if (onlineParamedics <= 0) {
      return res.status(409).json({
        error: 'No on-duty paramedic units online',
        code: 'no_paramedics_online',
        layout_type: 'paramedics',
        online_count: 0,
      });
    }
  }

  let cadUser = resolveCadUserFromIdentifiers(ids);
  if (!cadUser && ids.linkKey) {
    const cachedUserId = liveLinkUserCache.get(ids.linkKey);
    if (cachedUserId) cadUser = Users.findById(cachedUserId) || null;
  }
  if (!cadUser) {
    const onDutyNameIndex = buildOnDutyNameIndex(Units.list());
    const byName = resolveCadUserByName(playerName, onDutyNameIndex)
      || resolveCadUserByName(platformName, onDutyNameIndex);
    if (byName) cadUser = byName;
  }
  if (cadUser) {
    if (ids.steamId) liveLinkUserCache.set(ids.steamId, cadUser.id);
    if (ids.discordId) liveLinkUserCache.set(`discord:${ids.discordId}`, cadUser.id);
    if (ids.licenseId) liveLinkUserCache.set(`license:${ids.licenseId}`, cadUser.id);
  }

  const isAutoAlarmZoneCall = sourceType === 'auto_alarm_zone';
  const alarmDepartmentSelection = isAutoAlarmZoneCall
    ? chooseAlarmPrimaryOrBackupDepartment(
      payload.primary_department_id ?? payload.alarm_primary_department_id ?? payload.department_id,
      payload.backup_department_id ?? payload.alarm_backup_department_id ?? payload.fallback_department_id
    )
    : null;

  const departmentId = Number(alarmDepartmentSelection?.department_id || 0) || chooseCallDepartmentId(cadUser, payload.department_id, {
    preferred_layout_type: preferredLayoutType,
  });
  if (!departmentId) {
    return res.status(400).json({ error: 'No active department available to create call' });
  }
  const requestedDepartmentIds = Number(alarmDepartmentSelection?.department_id || 0) > 0
    ? [Number(alarmDepartmentSelection.department_id)]
    : resolveRequestedDepartmentIds(payload.requested_department_ids, departmentId, {
      preferred_layout_type: preferredLayoutType,
    });

  const location = formatCallLocation(payload);
  const postal = String(payload?.postal || extractPostalFromLocation(location) || '').trim();
  const positionX = Number(payload?.position?.x);
  const positionY = Number(payload?.position?.y);
  const positionZ = Number(payload?.position?.z);
  const requestedJobCode = String(payload?.job_code || payload?.jobCode || '').trim().slice(0, 24);
  const jobCode = requestedJobCode || '000';
  const title = String(payload.title || '').trim() || (details ? details.slice(0, 120) : `000 Call from ${playerName}`);
  const reasonForCall = details || title;
  const descriptionLines = [];
  descriptionLines.push(`Caller: ${playerName}`);
  if (reasonForCall) descriptionLines.push(`Reason: ${reasonForCall}`);
  const description = descriptionLines.join('\n');

  const call = Calls.create({
    department_id: departmentId,
    title,
    priority: normalizePriority(payload.priority || '1'),
    location,
    description,
    job_code: jobCode,
    status: CALL_STATUS_PENDING_DISPATCH,
    requested_department_ids: requestedDepartmentIds,
    created_by: cadUser?.id || null,
    postal,
    position_x: Number.isFinite(positionX) ? positionX : null,
    position_y: Number.isFinite(positionY) ? positionY : null,
    position_z: Number.isFinite(positionZ) ? positionZ : null,
  });

  const promptResult = refreshClosestPromptForCall(call, { force: true });
  let responseCall = call;
  if (Number(promptResult?.queued_prompt_count || 0) <= 0) {
    responseCall = publishPendingDispatchCall(call, { reason: 'closest_prompt_unavailable' }) || call;
  }

  audit(cadUser?.id || null, 'fivem_000_call_created', {
    callId: call.id,
    departmentId,
    playerName,
    sourceId,
    sourceType,
    job_code: jobCode,
    preferred_layout_type: preferredLayoutType || '',
    alarm_zone_department_id: Number(alarmDepartmentSelection?.department_id || 0) || null,
    alarm_zone_backup_used: alarmDepartmentSelection ? !!alarmDepartmentSelection.backup_used : null,
    alarm_zone_primary_online_count: alarmDepartmentSelection ? Number(alarmDepartmentSelection.primary_online_count || 0) : null,
    alarm_zone_backup_online_count: alarmDepartmentSelection ? Number(alarmDepartmentSelection.backup_online_count || 0) : null,
    matchedUserId: cadUser?.id || null,
    initial_status: call?.status || CALL_STATUS_PENDING_DISPATCH,
    closest_prompt_count: Number(promptResult?.queued_prompt_count || 0),
  });

  res.status(201).json({
    ok: true,
    call: responseCall,
    source_type: sourceType,
  });
});

// Create a traffic stop log from an in-game bridge command (/trafficstop or /ts).
router.post('/traffic-stops', requireBridgeAuth, (req, res) => {
  const payload = req.body || {};
  const ids = resolveLinkIdentifiers(payload.identifiers || []);
  const characterName = String(payload.character_name || payload.characterName || '').trim();
  const playerName = characterName || String(payload.player_name || payload.name || '').trim() || 'Unknown Officer';
  const platformName = String(payload.platform_name || payload.platformName || '').trim();

  let cadUser = resolveCadUserFromIdentifiers(ids);
  if (!cadUser && ids.linkKey) {
    const cachedUserId = liveLinkUserCache.get(ids.linkKey);
    if (cachedUserId) cadUser = Users.findById(cachedUserId) || null;
  }
  if (!cadUser) {
    const onDutyNameIndex = buildOnDutyNameIndex(Units.list());
    const byName = resolveCadUserByName(playerName, onDutyNameIndex)
      || resolveCadUserByName(platformName, onDutyNameIndex);
    if (byName) cadUser = byName;
  }
  if (cadUser) {
    if (ids.steamId) liveLinkUserCache.set(ids.steamId, cadUser.id);
    if (ids.discordId) liveLinkUserCache.set(`discord:${ids.discordId}`, cadUser.id);
    if (ids.licenseId) liveLinkUserCache.set(`license:${ids.licenseId}`, cadUser.id);
  }

  const reason = String(payload.reason || '').trim();
  if (!reason) {
    return res.status(400).json({ error: 'reason is required' });
  }

  const linkedCallIdRaw = Number(payload.call_id || payload.callId || 0);
  const linkedCallId = Number.isInteger(linkedCallIdRaw) && linkedCallIdRaw > 0 ? linkedCallIdRaw : null;
  const departmentId = chooseTrafficStopDepartmentId(cadUser, payload.department_id || payload.departmentId, linkedCallId);
  if (!departmentId) {
    return res.status(400).json({ error: 'No active law enforcement department available to create traffic stop' });
  }

  const activeUnit = cadUser ? Units.findByUserId(cadUser.id) : null;
  const useUnitId = activeUnit && Number(activeUnit.department_id) === Number(departmentId) ? Number(activeUnit.id) : null;
  const location = formatCallLocation(payload);
  const postal = String(payload?.postal || extractPostalFromLocation(location) || '').trim();
  const position = parseHeartbeatPosition(payload);
  const plate = String(
    payload.plate || payload.license_plate || payload.licensePlate || ''
  ).trim();

  const stop = TrafficStops.create({
    department_id: departmentId,
    call_id: linkedCallId,
    unit_id: useUnitId,
    created_by_user_id: cadUser?.id || null,
    location,
    postal,
    plate,
    reason,
    outcome: payload.outcome,
    notes: payload.notes,
    position_x: Number.isFinite(Number(position.x)) ? Number(position.x) : null,
    position_y: Number.isFinite(Number(position.y)) ? Number(position.y) : null,
    position_z: Number.isFinite(Number(position.z)) ? Number(position.z) : null,
  });

  audit(cadUser?.id || null, 'fivem_traffic_stop_created', {
    traffic_stop_id: stop.id,
    department_id: departmentId,
    plate: stop.plate || '',
    reason: stop.reason || '',
    outcome: stop.outcome || '',
    call_id: stop.call_id || null,
    source: 'fivem_command',
  });
  bus.emit('trafficstop:create', { departmentId, stop });

  res.status(201).json({
    ok: true,
    stop,
  });
});

// Create/update a driver license from in-game CAD bridge UI.
router.post('/licenses', requireBridgeAuth, async (req, res) => {
  try {
    const payload = req.body || {};
    const payloadSummary = summarizeBridgeLicensePayload(payload);
    logBridgeDocumentTrace('license request received', payloadSummary, true);
    const ids = resolveLinkIdentifiers(payload.identifiers || []);
    const characterName = String(payload.character_name || payload.characterName || '').trim();
    const playerName = characterName || String(payload.player_name || payload.name || '').trim() || 'Unknown Player';
    const platformName = String(payload.platform_name || payload.platformName || '').trim();

    let cadUser = resolveCadUserFromIdentifiers(ids);
    if (!cadUser && ids.linkKey) {
      const cachedUserId = liveLinkUserCache.get(ids.linkKey);
      if (cachedUserId) cadUser = Users.findById(cachedUserId) || null;
    }
    if (!cadUser) {
      const onDutyNameIndex = buildOnDutyNameIndex(Units.list());
      const byName = resolveCadUserByName(playerName, onDutyNameIndex)
        || resolveCadUserByName(platformName, onDutyNameIndex);
      if (byName) cadUser = byName;
    }
    if (cadUser) {
      if (ids.steamId) liveLinkUserCache.set(ids.steamId, cadUser.id);
      if (ids.discordId) liveLinkUserCache.set(`discord:${ids.discordId}`, cadUser.id);
      if (ids.licenseId) liveLinkUserCache.set(`license:${ids.licenseId}`, cadUser.id);
    }

    let citizenId = String(payload.citizenid || payload.citizen_id || '').trim();
    if (!citizenId && ids.linkKey) {
      citizenId = String(FiveMPlayerLinks.findBySteamId(ids.linkKey)?.citizen_id || '').trim();
    }
    if (!citizenId) {
      logBridgeDocumentReject('license', 400, 'missing_citizenid', payloadSummary);
      return res.status(400).json({ error: 'citizenid is required to create a license' });
    }

    const fullName = String(payload.full_name || payload.character_name || payload.name || '').trim() || playerName;
    const dateOfBirth = normalizeDateOnly(payload.date_of_birth || payload.dob || payload.birthdate || '');
    const gender = String(payload.gender || '').trim();
    const classesInput = Array.isArray(payload.license_classes)
      ? payload.license_classes
      : (Array.isArray(payload.classes) ? payload.classes : []);
    const licenseClasses = normalizeTextList(classesInput, { uppercase: true, maxLength: 10 });
    if (!fullName || !dateOfBirth || !gender || licenseClasses.length === 0) {
      logBridgeDocumentReject('license', 400, 'invalid_required_fields', payloadSummary, {
        resolved_full_name: fullName,
        resolved_date_of_birth: dateOfBirth,
        resolved_gender: gender,
        resolved_classes_count: licenseClasses.length,
      });
      return res.status(400).json({
        error: 'full_name, date_of_birth, gender and at least one license class are required',
      });
    }

    const defaultExpiryDaysRaw = Number(Settings.get('driver_license_default_expiry_days') || 1095);
    const defaultExpiryDays = Number.isFinite(defaultExpiryDaysRaw) ? Math.max(1, Math.trunc(defaultExpiryDaysRaw)) : 1095;
    const expiryDaysRaw = Number(payload.expiry_days ?? payload.duration_days ?? defaultExpiryDays);
    const expiryDays = Number.isFinite(expiryDaysRaw) ? Math.max(1, Math.trunc(expiryDaysRaw)) : defaultExpiryDays;
    const photoOnly = payload.photo_only === true
      || payload.photo_only === 1
      || String(payload.photo_only || '').trim().toLowerCase() === 'true';
    let expiryAt = normalizeDateOnly(payload.expiry_at || '') || addDaysDateOnly(expiryDays);
    let status = normalizeStatus(payload.status, DRIVER_LICENSE_STATUSES, 'valid');
    if (isPastDateOnly(expiryAt)) {
      status = 'expired';
    }

    DriverLicenses.markExpiredDue();
    const existingLicense = DriverLicenses.findByCitizenId(citizenId);
    const existingStatus = String(existingLicense?.status || '').trim().toLowerCase();
    if (existingStatus === 'suspended' || existingStatus === 'disqualified') {
      if (!photoOnly) {
        logBridgeDocumentReject('license', 403, 'status_blocks_renewal', payloadSummary, {
          citizenid: citizenId,
          existing_status: existingStatus,
        });
        return res.status(403).json({
          error: `License renewal is blocked while status is ${existingStatus}`,
        });
      }
      status = existingStatus;
      const existingExpiryAt = normalizeDateOnly(existingLicense?.expiry_at || '');
      if (existingExpiryAt) {
        expiryAt = existingExpiryAt;
      }
    }

    const providedLicenseNumber = String(payload.license_number || '').trim();
    const generatedLicenseNumber = `VIC-${citizenId.slice(-8).toUpperCase() || String(Date.now()).slice(-8)}`;
    const licenseNumber = providedLicenseNumber || generatedLicenseNumber;
    const conditions = normalizeTextList(payload.conditions, { uppercase: false, maxLength: 80 });
    let mugshotUrl = '';
    let mugshotPersisted = false;
    let mugshotBytes = 0;
    let mugshotMimeType = '';
    try {
      const persistedMugshot = await persistBridgeMugshot(payload, citizenId);
      mugshotUrl = persistedMugshot.mugshot_url;
      mugshotPersisted = persistedMugshot.persisted === true;
      mugshotBytes = Number(persistedMugshot.bytes || 0) || 0;
      mugshotMimeType = String(persistedMugshot.mime_type || '').trim();
    } catch (mugshotError) {
      const statusCode = Number(mugshotError?.statusCode || 400) || 400;
      logBridgeDocumentReject(
        'license',
        statusCode,
        'invalid_mugshot_payload',
        payloadSummary,
        {
          error: mugshotError?.message || String(mugshotError),
          ...(mugshotError?.details && typeof mugshotError.details === 'object' ? mugshotError.details : {}),
        }
      );
      return res.status(statusCode).json({ error: mugshotError?.message || 'Invalid mugshot payload' });
    }

    const record = DriverLicenses.upsertByCitizenId({
      citizen_id: citizenId,
      full_name: fullName,
      date_of_birth: dateOfBirth,
      gender,
      license_number: licenseNumber,
      license_classes: licenseClasses,
      conditions,
      mugshot_url: mugshotUrl,
      status,
      expiry_at: expiryAt,
      created_by_user_id: cadUser?.id || null,
      updated_by_user_id: cadUser?.id || null,
    });

    audit(cadUser?.id || null, 'fivem_driver_license_upserted', {
      citizen_id: citizenId,
      status: record?.status || status,
      expiry_at: record?.expiry_at || expiryAt,
      classes: licenseClasses,
      source: 'fivem',
    });
    logBridgeDocumentTrace('license upsert success', {
      citizenid: citizenId,
      license_number: record?.license_number || licenseNumber,
      status: record?.status || status,
      expiry_at: record?.expiry_at || expiryAt,
      mugshot_length: mugshotUrl.length,
      mugshot_persisted: mugshotPersisted,
      mugshot_bytes: mugshotBytes,
      mugshot_mime_type: mugshotMimeType,
    }, true);

    res.status(201).json({ ok: true, license: record });
  } catch (error) {
    const logPayload = {
      error: error?.message || String(error),
      stack: error?.stack || null,
      payload: summarizeBridgeLicensePayload(req.body || {}),
    };
    writeBridgeLicenseLog('license_upsert_failed', logPayload, 'error');
    console.error('[FiveMBridge] Failed to upsert driver license:', logPayload);
    res.status(500).json({ error: 'Failed to create driver license record' });
  }
});

// Read a driver's current license record for in-game /showid display.
router.get('/licenses/:citizenid', requireBridgeAuth, async (req, res) => {
  try {
    DriverLicenses.markExpiredDue();

    const citizenId = String(req.params.citizenid || '').trim();
    if (!citizenId) {
      return res.status(400).json({ error: 'citizenid is required' });
    }

    const record = DriverLicenses.findByCitizenId(citizenId);
    if (!record) {
      return res.status(404).json({ error: 'License not found' });
    }

    let qboxCharacter = null;
    try {
      qboxCharacter = await getCharacterById(citizenId);
    } catch (_lookupError) {}

    const resolvedFirstName = String(qboxCharacter?.firstname || '').trim() || extractFirstName(record?.full_name || '');
    const resolvedLastName = String(qboxCharacter?.lastname || '').trim() || extractLastName(record?.full_name || '');
    const resolvedFullName = String([resolvedFirstName, resolvedLastName].filter(Boolean).join(' ')).trim()
      || String(record?.full_name || '').trim();
    const resolvedAddress = String(qboxCharacter?.address || '').trim();
    const filteredConditions = filterLicenseConditionsForDisplay(record?.conditions);
    return res.json({
      ok: true,
      license: {
        ...record,
        full_name: resolvedFullName,
        first_name: resolvedFirstName,
        last_name: resolvedLastName,
        address: resolvedAddress,
        conditions: filteredConditions,
      },
    });
  } catch (error) {
    writeBridgeLicenseLog('license_read_failed', {
      citizenid: String(req.params.citizenid || '').trim(),
      error: error?.message || String(error),
      stack: error?.stack || null,
    }, 'error');
    console.error('[FiveMBridge] Failed to read driver license:', error);
    return res.status(500).json({ error: 'Failed to read driver license record' });
  }
});

// Create/update a vehicle registration from in-game CAD bridge UI.
router.post('/registrations', requireBridgeAuth, async (req, res) => {
  try {
    VehicleRegistrations.markExpiredDue();

    const payload = req.body || {};
    const payloadSummary = summarizeBridgeRegistrationPayload(payload);
    logBridgeDocumentTrace('registration request received', payloadSummary, true);
    const ids = resolveLinkIdentifiers(payload.identifiers || []);
    const characterName = String(payload.character_name || payload.characterName || '').trim();
    const playerName = characterName || String(payload.player_name || payload.name || '').trim() || 'Unknown Player';
    const platformName = String(payload.platform_name || payload.platformName || '').trim();

    let cadUser = resolveCadUserFromIdentifiers(ids);
    if (!cadUser && ids.linkKey) {
      const cachedUserId = liveLinkUserCache.get(ids.linkKey);
      if (cachedUserId) cadUser = Users.findById(cachedUserId) || null;
    }
    if (!cadUser) {
      const onDutyNameIndex = buildOnDutyNameIndex(Units.list());
      const byName = resolveCadUserByName(playerName, onDutyNameIndex)
        || resolveCadUserByName(platformName, onDutyNameIndex);
      if (byName) cadUser = byName;
    }
    if (cadUser) {
      if (ids.steamId) liveLinkUserCache.set(ids.steamId, cadUser.id);
      if (ids.discordId) liveLinkUserCache.set(`discord:${ids.discordId}`, cadUser.id);
      if (ids.licenseId) liveLinkUserCache.set(`license:${ids.licenseId}`, cadUser.id);
    }

    let citizenId = String(payload.citizenid || payload.citizen_id || '').trim();
    if (!citizenId && ids.linkKey) {
      citizenId = String(FiveMPlayerLinks.findBySteamId(ids.linkKey)?.citizen_id || '').trim();
    }

    const plate = String(payload.plate || payload.license_plate || '').trim();
    if (!plate) {
      logBridgeDocumentReject('registration', 400, 'missing_plate', payloadSummary);
      return res.status(400).json({ error: 'plate is required to create registration' });
    }
    const normalizedPlate = normalizePlateKey(plate);
    if (!normalizedPlate) {
      logBridgeDocumentReject('registration', 400, 'invalid_plate', payloadSummary);
      return res.status(400).json({ error: 'plate is invalid' });
    }
    if (!citizenId) {
      logBridgeDocumentReject('registration', 400, 'missing_citizenid', payloadSummary);
      return res.status(400).json({ error: 'citizenid is required to create registration' });
    }

    let ownedVehicle = null;
    try {
      ownedVehicle = await getVehicleByPlate(plate);
    } catch (lookupError) {
      console.error('[FiveMBridge] Failed to verify registration ownership against QBox:', {
        error: lookupError?.message || String(lookupError),
        plate: normalizedPlate,
        citizenid: citizenId,
      });
      return res.status(503).json({ error: 'Unable to verify vehicle ownership right now' });
    }
    const ownerCitizenId = String(ownedVehicle?.owner || '').trim();
    if (!ownedVehicle || !ownerCitizenId || ownerCitizenId.toLowerCase() !== citizenId.toLowerCase()) {
      logBridgeDocumentReject('registration', 403, 'ownership_mismatch', {
        ...payloadSummary,
        plate: normalizedPlate,
        citizenid: citizenId,
      });
      return res.status(403).json({
        error: 'Vehicle detected in the registration area, but you cannot register it because you do not own it.',
      });
    }

    const ownerName = String(payload.owner_name || payload.character_name || payload.full_name || playerName).trim();
    const vehicleModel = String(payload.vehicle_model || payload.model || '').trim();
    const vehicleColour = String(payload.vehicle_colour || payload.colour || payload.color || '').trim();
    if (!vehicleModel) {
      logBridgeDocumentReject('registration', 400, 'missing_vehicle_model', payloadSummary);
      return res.status(400).json({ error: 'vehicle_model is required' });
    }

    const defaultDurationRaw = Number(Settings.get('vehicle_registration_default_days') || 365);
    const defaultDuration = Number.isFinite(defaultDurationRaw) ? Math.max(1, Math.trunc(defaultDurationRaw)) : 365;
    const durationRaw = Number(payload.duration_days ?? payload.expiry_days ?? defaultDuration);
    const durationDays = Number.isFinite(durationRaw) ? Math.max(1, Math.trunc(durationRaw)) : defaultDuration;
    const expiryAt = normalizeDateOnly(payload.expiry_at || '') || addDaysDateOnly(durationDays);
    let status = normalizeStatus(payload.status, VEHICLE_REGISTRATION_STATUSES, 'valid');
    if (isPastDateOnly(expiryAt)) {
      status = 'expired';
    }

    const record = VehicleRegistrations.upsertByPlate({
      plate,
      citizen_id: citizenId,
      owner_name: ownerName,
      vehicle_model: vehicleModel,
      vehicle_colour: vehicleColour,
      status,
      expiry_at: expiryAt,
      duration_days: durationDays,
      created_by_user_id: cadUser?.id || null,
      updated_by_user_id: cadUser?.id || null,
    });

    audit(cadUser?.id || null, 'fivem_vehicle_registration_upserted', {
      plate: record?.plate || plate,
      citizen_id: citizenId,
      status: record?.status || status,
      expiry_at: record?.expiry_at || expiryAt,
      source: 'fivem',
    });
    logBridgeDocumentTrace('registration upsert success', {
      plate: record?.plate || plate,
      citizenid: citizenId,
      status: record?.status || status,
      expiry_at: record?.expiry_at || expiryAt,
    }, true);

    res.status(201).json({ ok: true, registration: record });
  } catch (error) {
    console.error('[FiveMBridge] Failed to upsert vehicle registration:', {
      error: error?.message || String(error),
      stack: error?.stack || null,
      payload: summarizeBridgeRegistrationPayload(req.body || {}),
    });
    res.status(500).json({ error: 'Failed to create vehicle registration record' });
  }
});

// Read a vehicle's current registration record for in-game renewal checks.
router.get('/registrations/:plate', requireBridgeAuth, (req, res) => {
  try {
    VehicleRegistrations.markExpiredDue();

    const plate = String(req.params.plate || '').trim();
    if (!plate) {
      return res.status(400).json({ error: 'plate is required' });
    }

    const record = VehicleRegistrations.findByPlate(plate);
    if (!record) {
      return res.status(404).json({ error: 'Registration not found' });
    }

    return res.json({ ok: true, registration: record });
  } catch (error) {
    console.error('[FiveMBridge] Failed to read vehicle registration:', error);
    return res.status(500).json({ error: 'Failed to read vehicle registration record' });
  }
});

// Plate status lookup used by Wraith plate-reader integrations.
router.get('/plate-status/:plate', requireBridgeAuth, (req, res) => {
  try {
    VehicleRegistrations.markExpiredDue();

    const rawPlate = String(req.params.plate || '').trim();
    if (!rawPlate) {
      return res.status(400).json({ error: 'plate is required' });
    }
    const normalizedPlate = normalizePlateKey(rawPlate);
    if (ALPR_IGNORED_PLATES.has(normalizedPlate)) {
      return res.json({
        ok: true,
        found: false,
        plate: rawPlate.toUpperCase(),
        plate_normalized: normalizedPlate,
        registration_status: 'ignored',
        registration_alert: false,
        bolo_alert: false,
        bolo_flags: [],
        bolo_count: 0,
        bolo_matches: [],
        alert: false,
        message: 'Plate excluded from ALPR alerts',
      });
    }
    const boloMatches = Bolos.listActiveVehicleByPlate(normalizedPlate).map((bolo) => {
      const details = parseJsonObject(bolo.details_json);
      const flags = normalizeVehicleBoloFlags(details.flags);
      return {
        id: Number(bolo.id || 0),
        department_id: Number(bolo.department_id || 0),
        title: String(bolo.title || '').trim(),
        description: String(bolo.description || '').trim(),
        plate: String(details.plate || details.registration_plate || details.rego || '').trim().toUpperCase(),
        flags,
      };
    });
    const boloFlags = Array.from(new Set(
      boloMatches
        .flatMap((bolo) => Array.isArray(bolo.flags) ? bolo.flags : [])
        .map((flag) => String(flag || '').trim().toLowerCase())
        .filter(Boolean)
    ));
    const boloAlert = boloMatches.length > 0;
    const boloMessage = boloAlert ? summarizeVehicleBoloFlags(boloFlags) : '';

    const registration = VehicleRegistrations.findByPlate(rawPlate);
    if (!registration) {
      const messageParts = [describePlateStatus('unregistered')];
      if (boloMessage) messageParts.push(boloMessage);
      return res.json({
        ok: true,
        found: false,
        plate: rawPlate.toUpperCase(),
        plate_normalized: normalizedPlate,
        registration_status: 'unregistered',
        registration_alert: true,
        bolo_alert: boloAlert,
        bolo_flags: boloFlags,
        bolo_count: boloMatches.length,
        bolo_matches: boloMatches,
        alert: true,
        message: messageParts.join(' | '),
      });
    }

    let status = normalizeStatus(registration.status, VEHICLE_REGISTRATION_STATUSES, 'valid');
    if (status === 'valid' && isPastDateOnly(registration.expiry_at)) {
      status = 'expired';
    }
    const registrationAlert = status !== 'valid';
    const alert = registrationAlert || boloAlert;
    const messageParts = [];
    if (registrationAlert) {
      messageParts.push(describePlateStatus(status));
    } else if (!boloAlert) {
      messageParts.push(describePlateStatus(status));
    }
    if (boloMessage) messageParts.push(boloMessage);

    return res.json({
      ok: true,
      found: true,
      plate: String(registration.plate || rawPlate).toUpperCase(),
      plate_normalized: String(registration.plate_normalized || normalizePlateKey(rawPlate)),
      registration_status: status,
      registration_alert: registrationAlert,
      bolo_alert: boloAlert,
      bolo_flags: boloFlags,
      bolo_count: boloMatches.length,
      bolo_matches: boloMatches,
      alert,
      message: messageParts.join(' | '),
      expiry_at: String(registration.expiry_at || ''),
      owner_name: String(registration.owner_name || ''),
      citizen_id: String(registration.citizen_id || ''),
      vehicle_model: String(registration.vehicle_model || ''),
      vehicle_colour: String(registration.vehicle_colour || ''),
    });
  } catch (error) {
    console.error('[FiveMBridge] Plate status lookup failed:', error);
    return res.status(500).json({ error: 'Failed to lookup plate status' });
  }
});

router.get('/fine-jobs', requireBridgeAuth, (req, res) => {
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
  if (getFineDeliveryMode() !== 'bridge') {
    return res.json([]);
  }

  const account = getFineAccountKey();
  const jobs = FiveMFineJobs.listPending(limit).map((job) => {
    const activeLink = resolveActiveLinkForBridgeJob(job);
    return {
      ...job,
      account,
      game_id: String(job.game_id || activeLink?.game_id || ''),
      steam_id: String(job.steam_id || activeLink?.steam_id || ''),
      citizen_id: String(job.citizen_id || activeLink?.citizen_id || ''),
      player_name: String(job.player_name || activeLink?.player_name || ''),
    };
  });

  return res.json(jobs);
});

router.post('/fine-jobs/:id/sent', requireBridgeAuth, (req, res) => {
  const id = Number.parseInt(String(req.params.id || '').trim(), 10);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid fine job id' });
  }
  const job = FiveMFineJobs.findById(id);
  if (!job) return res.status(404).json({ error: 'Fine job not found' });

  FiveMFineJobs.markSent(id);
  return res.json({ ok: true });
});

router.post('/fine-jobs/:id/failed', requireBridgeAuth, (req, res) => {
  const id = Number.parseInt(String(req.params.id || '').trim(), 10);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid fine job id' });
  }
  const job = FiveMFineJobs.findById(id);
  if (!job) return res.status(404).json({ error: 'Fine job not found' });

  const error = String(req.body?.error || 'Fine adapter failed').trim() || 'Fine adapter failed';
  FiveMFineJobs.markFailed(id, error);
  return res.json({ ok: true });
});

router.get('/print-jobs', requireBridgeAuth, (req, res) => {
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
  const jobs = FiveMPrintJobs.listPending(limit).map((job) => {
    const activeLink = resolveActiveLinkForBridgeJob(job, { preferUser: true });
    return {
      ...job,
      game_id: String(job.game_id || activeLink?.game_id || ''),
      steam_id: String(job.steam_id || activeLink?.steam_id || ''),
      citizen_id: String(job.citizen_id || activeLink?.citizen_id || ''),
      player_name: String(job.player_name || activeLink?.player_name || ''),
    };
  });
  return res.json(jobs);
});

router.post('/print-jobs/:id/sent', requireBridgeAuth, (req, res) => {
  const id = Number.parseInt(String(req.params.id || '').trim(), 10);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid print job id' });
  }
  const job = FiveMPrintJobs.findById(id);
  if (!job) return res.status(404).json({ error: 'Print job not found' });

  FiveMPrintJobs.markSent(id);
  return res.json({ ok: true });
});

router.post('/print-jobs/:id/failed', requireBridgeAuth, (req, res) => {
  const id = Number.parseInt(String(req.params.id || '').trim(), 10);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid print job id' });
  }
  const job = FiveMPrintJobs.findById(id);
  if (!job) return res.status(404).json({ error: 'Print job not found' });

  const error = String(req.body?.error || 'Print job failed').trim() || 'Print job failed';
  FiveMPrintJobs.markFailed(id, error);
  return res.json({ ok: true });
});

router.get('/jail-jobs', requireBridgeAuth, async (req, res) => {
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
  const jobs = FiveMJailJobs.listPending(limit).map((job) => {
    const activeLink = resolveActiveLinkForBridgeJob(job);
    return {
      ...job,
      game_id: String(job.game_id || activeLink?.game_id || ''),
      steam_id: String(job.steam_id || activeLink?.steam_id || ''),
      citizen_id: String(job.citizen_id || activeLink?.citizen_id || ''),
      player_name: String(job.player_name || activeLink?.player_name || ''),
    };
  });

  // Enrich each job with the player's license from the QBX database so
  // the FiveM bridge can resolve the target player even when the CAD has
  // no citizenID binding in its player links.
  for (const job of jobs) {
    const citizenId = String(job.citizen_id || '').trim();
    if (citizenId) {
      const license = await getLicenseByCitizenId(citizenId);
      if (license) job.license = license;
    }
  }

  return res.json(jobs);
});

router.post('/jail-jobs/:id/sent', requireBridgeAuth, (req, res) => {
  const id = Number.parseInt(String(req.params.id || '').trim(), 10);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid jail job id' });
  }
  const job = FiveMJailJobs.findById(id);
  if (!job) return res.status(404).json({ error: 'Jail job not found' });

  FiveMJailJobs.markSent(id);
  return res.json({ ok: true });
});

router.post('/jail-jobs/:id/failed', requireBridgeAuth, (req, res) => {
  const id = Number.parseInt(String(req.params.id || '').trim(), 10);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid jail job id' });
  }
  const job = FiveMJailJobs.findById(id);
  if (!job) return res.status(404).json({ error: 'Jail job not found' });

  const error = String(req.body?.error || 'Jail adapter failed').trim() || 'Jail adapter failed';
  FiveMJailJobs.markFailed(id, error);
  return res.json({ ok: true });
});

// FiveM resource polls pending route jobs to set in-game waypoints for assigned calls.
router.get('/route-jobs', requireBridgeAuth, (req, res) => {
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
  const jobs = [];
  for (const job of pendingRouteJobs.values()) {
    if (jobs.length >= limit) break;
    const activeLink = resolveActiveLinkForBridgeJob(job);
    jobs.push({
      ...job,
      game_id: String(job.game_id || activeLink?.game_id || ''),
      steam_id: String(job.steam_id || activeLink?.steam_id || ''),
      citizen_id: String(job.citizen_id || activeLink?.citizen_id || ''),
      player_name: String(job.player_name || activeLink?.player_name || ''),
    });
  }
  res.json(jobs);
});

router.post('/route-jobs/:id/sent', requireBridgeAuth, (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ error: 'Invalid route job id' });
  pendingRouteJobs.delete(id);
  res.json({ ok: true });
});

router.post('/route-jobs/:id/failed', requireBridgeAuth, (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ error: 'Invalid route job id' });
  const error = String(req.body?.error || 'Route delivery failed');
  pendingRouteJobs.delete(id);
  console.warn('[FiveMBridge] Route job failed:', id, error);
  res.json({ ok: true });
});

router.get('/call-prompts', requireBridgeAuth, (req, res) => {
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
  const jobs = [];
  const now = Date.now();

  for (const [id, job] of pendingClosestCallPrompts.entries()) {
    if (jobs.length >= limit) break;

    const callId = Number(job?.call_id || 0);
    const call = callId ? Calls.findById(callId) : null;
    if (!call || normalizeCallStatus(call.status) !== CALL_STATUS_PENDING_DISPATCH) {
      pendingClosestCallPrompts.delete(id);
      continue;
    }
    const dispatchedAt = Number(job?.dispatched_at || 0);
    if (dispatchedAt > 0 && (now - dispatchedAt) < CLOSEST_CALL_PROMPT_RESEND_INTERVAL_MS) {
      continue;
    }

    const activeLink = resolveActiveLinkForBridgeJob(job);
    jobs.push({
      ...job,
      game_id: String(job.game_id || activeLink?.game_id || ''),
      steam_id: String(job.steam_id || activeLink?.steam_id || ''),
      citizen_id: String(job.citizen_id || activeLink?.citizen_id || ''),
      player_name: String(job.player_name || activeLink?.player_name || ''),
    });
  }

  return res.json(jobs);
});

router.post('/call-prompts/:id/sent', requireBridgeAuth, (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ error: 'Invalid call prompt id' });
  const job = pendingClosestCallPrompts.get(id);
  if (!job) return res.status(404).json({ error: 'Call prompt not found' });

  pendingClosestCallPrompts.set(id, {
    ...job,
    dispatched_at: Date.now(),
    updated_at: Date.now(),
  });
  return res.json({ ok: true });
});

router.post('/call-prompts/:id/accept', requireBridgeAuth, (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ error: 'Invalid call prompt id' });

  const job = pendingClosestCallPrompts.get(id);
  if (!job) return res.status(404).json({ error: 'Call prompt not found' });

  const requestGameId = String(req.body?.game_id || '').trim();
  const requestCitizenId = String(req.body?.citizen_id || '').trim();
  if (requestGameId && String(job.game_id || '').trim() && requestGameId !== String(job.game_id || '').trim()) {
    return res.status(403).json({ error: 'Call prompt does not belong to this player' });
  }
  if (requestCitizenId && String(job.citizen_id || '').trim() && requestCitizenId.toLowerCase() !== String(job.citizen_id || '').trim().toLowerCase()) {
    return res.status(403).json({ error: 'Call prompt does not belong to this character' });
  }

  const callId = Number(job.call_id || 0);
  const unitId = Number(job.unit_id || 0);
  const call = callId ? Calls.findById(callId) : null;
  const unit = unitId ? Units.findById(unitId) : null;
  const callWasPendingDispatch = isPendingDispatchCall(call);

  if (!call || normalizeCallStatus(call.status) === 'closed') {
    pendingClosestCallPrompts.delete(id);
    return res.status(409).json({ error: 'Call is no longer active' });
  }
  if (!unit) {
    pendingClosestCallPrompts.delete(id);
    const promptResult = refreshClosestPromptForCall({ id: callId }, { force: true });
    if (Number(promptResult?.queued_prompt_count || 0) <= 0) {
      publishPendingDispatchCall({ id: callId }, { reason: 'closest_prompt_unavailable' });
    }
    return res.status(409).json({ error: 'Unit is no longer available' });
  }

  const alreadyAssigned = Array.isArray(call.assigned_units)
    && call.assigned_units.some(assigned => Number(assigned?.id || 0) === unitId);
  if (!alreadyAssigned && String(unit.status || '').trim().toLowerCase() !== 'available') {
    pendingClosestCallPrompts.delete(id);
    const promptResult = refreshClosestPromptForCall({ id: callId }, { force: true });
    if (Number(promptResult?.queued_prompt_count || 0) <= 0) {
      publishPendingDispatchCall({ id: callId }, { reason: 'closest_prompt_unavailable' });
    }
    return res.status(409).json({ error: 'Unit is no longer available for assignment' });
  }

  const assignmentChanges = Calls.assignUnit(call.id, unit.id);
  Calls.update(call.id, {
    status: CALL_STATUS_ACTIVE,
    was_ever_assigned: 1,
  });
  Units.update(unit.id, { status: 'enroute' });

  const refreshedUnit = Units.findById(unit.id) || unit;
  const updatedCall = Calls.findById(call.id) || call;
  clearClosestCallPrompt(call.id);
  clearClosestCallDeclines(call.id);
  clearClosestCallEscalations(call.id);

  if (callWasPendingDispatch) {
    bus.emit('call:create', {
      departmentId: updatedCall.department_id,
      call: updatedCall,
      from_fivem_pending_dispatch: true,
      fivem_pending_dispatch_reason: 'closest_unit_accepted',
      play_emergency_sound: false,
    });
  }

  bus.emit('unit:update', { departmentId: refreshedUnit.department_id, unit: refreshedUnit });
  bus.emit('call:assign', {
    departmentId: updatedCall.department_id,
    call: updatedCall,
    unit: refreshedUnit,
    from_fivem_pending_dispatch: callWasPendingDispatch,
    suppress_assignment_sound: callWasPendingDispatch,
  });
  audit(null, 'fivem_call_prompt_accepted', {
    callId: call.id,
    unitId: unit.id,
    callsign: refreshedUnit?.callsign || '',
    assignment_created: assignmentChanges > 0,
    source: 'fivem_bridge_prompt',
    was_pending_dispatch: callWasPendingDispatch,
  });

  return res.json({ ok: true, call: updatedCall, unit: refreshedUnit });
});

router.post('/call-prompts/:id/decline', requireBridgeAuth, (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ error: 'Invalid call prompt id' });

  const job = pendingClosestCallPrompts.get(id);
  if (!job) return res.status(404).json({ error: 'Call prompt not found' });

  const requestGameId = String(req.body?.game_id || '').trim();
  const requestCitizenId = String(req.body?.citizen_id || '').trim();
  if (requestGameId && String(job.game_id || '').trim() && requestGameId !== String(job.game_id || '').trim()) {
    return res.status(403).json({ error: 'Call prompt does not belong to this player' });
  }
  if (requestCitizenId && String(job.citizen_id || '').trim() && requestCitizenId.toLowerCase() !== String(job.citizen_id || '').trim().toLowerCase()) {
    return res.status(403).json({ error: 'Call prompt does not belong to this character' });
  }

  const callId = Number(job.call_id || 0);
  const unitId = Number(job.unit_id || 0);
  const departmentId = Number(job.department_id || 0);
  const call = callId ? Calls.findById(callId) : null;

  pendingClosestCallPrompts.delete(id);
  clearClosestCallPrompt(callId, departmentId);

  if (callId > 0 && departmentId > 0 && unitId > 0) {
    closestCallDeclines.set(getDeclineKey(callId, departmentId, unitId), Date.now());
  }
  if (callId > 0 && departmentId > 0) {
    markClosestCallDepartmentEscalated(callId, departmentId);
  }

  let publishedCall = call;
  if (call && isPendingDispatchCall(call)) {
    publishedCall = publishPendingDispatchCall(call, { reason: 'closest_unit_declined' }) || call;
  }

  audit(null, 'fivem_call_prompt_declined', {
    callId,
    departmentId,
    unitId,
    source: 'fivem_bridge_prompt',
    published_to_cad: !!(call && isPendingDispatchCall(call)),
  });
  return res.json({ ok: true, call: publishedCall || null });
});

// MiniCAD: Return active call details for a unit identified by game_id (source).
router.get('/unit-active-call', requireBridgeAuth, (req, res) => {
  const gameId = String(req.query.game_id || '').trim();
  if (!gameId) return res.status(400).json({ error: 'game_id is required' });

  const cadUserId = resolveCadUserIdByGameId(gameId);
  if (!cadUserId) return res.json(null);

  const unit = Units.findByUserId(cadUserId);
  if (!unit) return res.json(null);

  const assigned = Calls.getAssignedCallForUnit(unit.id);
  if (!assigned) return res.json(null);

  const call = Calls.findById(assigned.id) || assigned;
  const department = Departments.findById(Number(call.department_id));
  const emergencyMeta = extractMiniCadCallerAndReason(call);

  // Build a list of all active (non-closed) calls this unit is assigned to for navigation.
  const allAssignedCalls = [];
  const dispatchVisibleIds = getDispatchVisibleDepartments().map(d => Number(d.id)).filter(id => Number.isInteger(id) && id > 0);
  if (dispatchVisibleIds.length > 0) {
    const allCalls = Calls.listByDepartmentIds(dispatchVisibleIds, false);
    for (const c of allCalls) {
      if (String(c?.status || '').trim().toLowerCase() === 'closed') continue;
      const isAssigned = Array.isArray(c?.assigned_units) && c.assigned_units.some(u => Number(u.id) === Number(unit.id));
      if (isAssigned) {
        allAssignedCalls.push({
          id: c.id,
          title: c.title || '',
          priority: c.priority || '3',
          job_code: c.job_code || '',
          location: c.location || '',
          postal: c.postal || '',
          status: c.status || 'active',
        });
      }
    }
  }

  const assignedUnitBadges = Array.isArray(call.assigned_units)
    ? call.assigned_units.map(u => ({
      callsign: String(u.callsign || ''),
      status: String(u.status || ''),
      department_color: String(u.department_color || ''),
    }))
    : [];

  res.json({
    call_id: call.id,
    title: call.title || '',
    priority: call.priority || '3',
    job_code: call.job_code || '',
    location: call.location || '',
    postal: call.postal || '',
    description: call.description || '',
    caller_name: emergencyMeta.caller_name || '',
    reason_for_call: emergencyMeta.reason_for_call || '',
    status: call.status || 'active',
    department_name: department?.name || '',
    department_short_name: department?.short_name || '',
    department_color: department?.color || '',
    assigned_units: assignedUnitBadges,
    all_assigned_calls: allAssignedCalls,
    unit_callsign: unit.callsign || '',
    unit_id: unit.id,
  });
});

// MiniCAD: Detach a unit from a call, identified by game_id.
router.post('/unit-detach-call', requireBridgeAuth, (req, res) => {
  const gameId = String(req.body?.game_id || '').trim();
  const callId = Number(req.body?.call_id || 0);
  if (!gameId || !callId) return res.status(400).json({ error: 'game_id and call_id are required' });

  const cadUserId = resolveCadUserIdByGameId(gameId);
  if (!cadUserId) return res.status(404).json({ error: 'Player not found' });

  const unit = Units.findByUserId(cadUserId);
  if (!unit) return res.status(404).json({ error: 'Unit not found' });

  const call = Calls.findById(callId);
  if (!call) return res.status(404).json({ error: 'Call not found' });

  const isAssigned = Array.isArray(call?.assigned_units)
    && call.assigned_units.some(u => Number(u.id) === Number(unit.id));
  if (!isAssigned) return res.status(400).json({ error: 'Unit is not assigned to this call' });

  Calls.unassignUnit(callId, unit.id);
  Units.update(unit.id, { status: 'available' });
  const refreshedUnit = Units.findById(unit.id) || unit;
  const updated = Calls.findById(callId) || call;
  const updatedStatus = normalizeCallStatus(updated?.status);
  const assignedCount = getAssignedUnitCount(updated);
  const shouldScheduleAutoClose = updatedStatus !== 'closed' && assignedCount <= 0;
  if (shouldScheduleAutoClose) {
    schedulePendingCallAutoClose(callId);
  } else {
    clearPendingCallAutoClose(callId);
  }

  bus.emit('unit:update', { departmentId: refreshedUnit.department_id, unit: refreshedUnit });
  bus.emit('unit:status_available', {
    departmentId: refreshedUnit.department_id,
    unit: refreshedUnit,
    call: updated || null,
  });
  bus.emit('call:unassign', {
    departmentId: call.department_id,
    call: updated,
    unit: refreshedUnit,
    unit_id: unit.id,
    removed: true,
  });

  res.json({
    ok: true,
    auto_close_scheduled: shouldScheduleAutoClose,
    auto_close_delay_ms: shouldScheduleAutoClose ? MINICAD_UNASSIGNED_CALL_AUTOCLOSE_DELAY_MS : 0,
  });
});

module.exports = router;

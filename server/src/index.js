const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const passport = require('passport');
const path = require('path');
const config = require('./config');
const { verifyToken } = require('./auth/jwt');
const { initDb, DriverLicenses, VehicleRegistrations } = require('./db/sqlite');
const { initSteamAuth } = require('./auth/steam');
const { startBot } = require('./discord/bot');
const { startAutoUpdater } = require('./services/autoUpdater');
const { startFiveMResourceAutoSync } = require('./services/fivemResourceManager');
const { startFineProcessor } = require('./services/fivemFineProcessor');
const { startCallAutoCloseProcessor } = require('./services/callAutoCloseProcessor');

function runCadExpirySweep() {
  try {
    const expiredLicenses = Number(DriverLicenses.markExpiredDue() || 0);
    const expiredRegistrations = Number(VehicleRegistrations.markExpiredDue() || 0);
    if (expiredLicenses > 0 || expiredRegistrations > 0) {
      console.log(
        `[CadExpiry] Auto-expired licenses=${expiredLicenses} registrations=${expiredRegistrations}`
      );
    }
  } catch (error) {
    console.error('[CadExpiry] Sweep failed:', error?.message || error);
  }
}

// Initialize database
console.log('Initializing database...');
initDb();
console.log('Database ready');

// Initialize Express
const app = express();
app.locals.authCookieName = config.auth.cookieName;
if (config.http?.trustProxy !== false) {
  app.set('trust proxy', config.http.trustProxy);
}

// Security middleware
app.use(helmet({ contentSecurityPolicy: false }));
// Allow both the HTTP (port 3031) and HTTPS (port 3030) origins so users can
// access the CAD from either URL without CORS errors.
const allowedOrigins = new Set([config.webUrl]);
// Also accept the HTTPS variant on 3030.
try {
  const httpUrl  = new URL(config.webUrl);
  const httpsUrl = new URL(config.webUrl);
  httpsUrl.protocol = 'https:';
  httpsUrl.port = process.env.PORT || '3030';
  httpUrl.protocol  = 'http:';
  httpUrl.port = process.env.BRIDGE_HTTP_PORT || '3031';
  allowedOrigins.add(httpsUrl.toString().replace(/\/$/, ''));
  allowedOrigins.add(httpUrl.toString().replace(/\/$/, ''));
} catch {}
app.use(cors({
  origin: (origin, cb) => {
    // No origin = same-origin / server-to-server - always allow
    if (!origin || allowedOrigins.has(origin)) return cb(null, true);
    cb(null, false);
  },
  credentials: true,
}));
const jsonBodyLimit = String(process.env.CAD_JSON_BODY_LIMIT || '12mb').trim() || '12mb';
app.use(express.json({ limit: jsonBodyLimit }));
app.use(express.urlencoded({ extended: true, limit: jsonBodyLimit }));
app.use(cookieParser());

function extractRequestAuthToken(req) {
  const authHeader = String(req.headers.authorization || '').trim();
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  const cookieToken = String(req.cookies?.[config.auth.cookieName] || '').trim();
  if (cookieToken) return cookieToken;

  const cookieHeader = String(req.headers.cookie || '');
  if (!cookieHeader) return '';
  const cookieParts = cookieHeader.split(';');
  for (const rawPart of cookieParts) {
    const [rawKey, ...rest] = rawPart.split('=');
    if (!rawKey || rest.length === 0) continue;
    const key = String(rawKey).trim();
    if (key !== config.auth.cookieName) continue;
    const value = rest.join('=').trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return '';
}

function hasValidRequestAuthToken(req) {
  const token = extractRequestAuthToken(req);
  if (!token) return false;
  try {
    verifyToken(token);
    return true;
  } catch {
    return false;
  }
}

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: config.rateLimit.apiWindowMs,
  max: config.rateLimit.apiMax,
  standardHeaders: true,
  legacyHeaders: false,
  // FiveM bridge endpoints are high-frequency by design.
  // Authenticated CAD traffic can legitimately be bursty (SSE refreshes, dispatch fan-out).
  skip: (req) => req.path.startsWith('/integration/fivem/')
    || (config.rateLimit.apiSkipAuthenticated && hasValidRequestAuthToken(req)),
});
const fivemBridgeLimiter = rateLimit({
  windowMs: config.rateLimit.fivemWindowMs,
  max: config.rateLimit.fivemMax,
  standardHeaders: true,
  legacyHeaders: false,
});
if (config.rateLimit.apiMax > 0) {
  app.use('/api/', apiLimiter);
}
if (config.rateLimit.fivemMax > 0) {
  app.use('/api/integration/fivem', fivemBridgeLimiter);
}

// Passport (Steam)
app.use(passport.initialize());
initSteamAuth();

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/units', require('./routes/units'));
app.use('/api/calls', require('./routes/calls'));
app.use('/api/bolos', require('./routes/bolos'));
app.use('/api/warrants', require('./routes/warrants'));
app.use('/api/search', require('./routes/search'));
app.use('/api/records', require('./routes/records'));
app.use('/api/incidents', require('./routes/incidents'));
app.use('/api/medical', require('./routes/medical'));
app.use('/api/evidence', require('./routes/evidence'));
app.use('/api/traffic-stops', require('./routes/trafficStops'));
app.use('/api/shift-notes', require('./routes/shiftNotes'));
app.use('/api/events', require('./routes/events'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/integration/fivem', require('./routes/fivem'));

// Announcements (public, auth-required)
const { requireAuth } = require('./auth/middleware');
const { Announcements } = require('./db/sqlite');
app.get('/api/announcements', requireAuth, (req, res) => {
  res.json(Announcements.listActive());
});

// Serve uploaded assets
const uploadsPath = path.join(__dirname, '../data/uploads');
app.use('/uploads', express.static(uploadsPath));

// Serve static frontend in production
const distPath = path.join(__dirname, '../../web/dist');

app.use(express.static(distPath));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(distPath, 'index.html'), (err) => {
    if (err) next();
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (err?.type === 'entity.too.large' || err?.status === 413) {
    return res.status(413).json({
      error: `Request payload too large (max ${jsonBodyLimit})`,
    });
  }
  if (err?.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Image too large (max 2MB)' });
    }
    return res.status(400).json({ error: err.message || 'Upload error' });
  }
  if (err?.message === 'Only image files are allowed') {
    return res.status(400).json({ error: err.message });
  }
  res.status(500).json({ error: 'Internal server error' });
});

// Create HTTP or HTTPS server for Express.
// If TLS_CERT and TLS_KEY are set in .env, serve over HTTPS.
// If the cert files don't exist yet, auto-generates a self-signed cert using
// TLS_PUBLIC_IP.
function ensureSelfSignedCert(keyPath, certPath) {
  const { execSync } = require('child_process');
  const os = require('os');
  const dataDir = path.dirname(keyPath);
  fs.mkdirSync(dataDir, { recursive: true });

  const ip = String(process.env.TLS_PUBLIC_IP || '127.0.0.1').trim();
  const confPath = path.join(os.tmpdir(), 'cad-openssl-san.cnf');
  const conf = [
    '[req]', 'default_bits = 2048', 'prompt = no', 'default_md = sha256',
    'distinguished_name = dn', 'x509_extensions = v3_req',
    '', '[dn]', 'CN = CAD Server',
    '', '[v3_req]', 'subjectAltName = @alt_names',
    'basicConstraints = CA:FALSE',
    'keyUsage = digitalSignature, keyEncipherment',
    'extendedKeyUsage = serverAuth',
    '', '[alt_names]', `IP.1 = ${ip}`, 'IP.2 = 127.0.0.1',
  ].join('\n');
  fs.writeFileSync(confPath, conf, 'utf8');

  // Try openssl candidates in order
  const candidates = [
    'openssl',
    'C:\\Program Files\\Git\\mingw64\\bin\\openssl.exe',
    'C:\\Program Files\\OpenSSL-Win64\\bin\\openssl.exe',
    '/usr/bin/openssl',
  ];
  let generated = false;
  for (const bin of candidates) {
    try {
      execSync(
        `"${bin}" req -x509 -newkey rsa:2048 -sha256 -days 3650 -nodes` +
        ` -keyout "${keyPath}" -out "${certPath}" -config "${confPath}"`,
        { stdio: 'pipe' }
      );
      generated = true;
      break;
    } catch { /* try next */ }
  }
  try { fs.unlinkSync(confPath); } catch {}

  if (!generated) {
    console.warn('[TLS] Could not auto-generate cert (openssl not found). Install openssl or generate manually.');
    return false;
  }
  console.log(`[TLS] Self-signed cert generated for IP ${ip} - cert: ${certPath}`);
  return true;
}

function createServer(expressApp) {
  // Resolve paths relative to project root (parent of server/) so that
  // values like "server/data/server.key" in .env work correctly.
  const projectRoot = path.resolve(__dirname, '../../');
  const resolveTlsPath = (p) => p ? (path.isAbsolute(p) ? p : path.resolve(projectRoot, p)) : '';

  // Default to server/data/server.key + server.cert if not explicitly set in .env.
  // This means HTTPS works automatically on first run without needing to edit .env.
  const defaultKeyPath  = path.resolve(projectRoot, 'server/data/server.key');
  const defaultCertPath = path.resolve(projectRoot, 'server/data/server.cert');

  const certPath = resolveTlsPath(String(process.env.TLS_CERT || '').trim()) || defaultCertPath;
  const keyPath  = resolveTlsPath(String(process.env.TLS_KEY  || '').trim()) || defaultKeyPath;

  // Auto-generate cert if files don't exist yet (e.g. fresh clone / first run)
  if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
    console.log('[TLS] Cert files not found - auto-generating self-signed certificate...');
    ensureSelfSignedCert(keyPath, certPath);
  }
  try {
    const tlsOptions = {
      cert: fs.readFileSync(certPath),
      key:  fs.readFileSync(keyPath),
    };
    console.log(`[TLS] HTTPS enabled - cert: ${certPath}`);
    return { server: https.createServer(tlsOptions, expressApp), protocol: 'https' };
  } catch (err) {
    console.warn(`[TLS] Failed to load TLS cert/key (${err.message}) - falling back to HTTP`);
  }
  return { server: http.createServer(expressApp), protocol: 'http' };
}

const { server: httpServer, protocol: serverProtocol } = createServer(app);
if (serverProtocol === 'http') {
  console.warn('[TLS] Running over plain HTTP. Set TLS_CERT and TLS_KEY in .env for HTTPS (required for microphone).');
}

// Secondary plain-HTTP server on BRIDGE_HTTP_PORT (default 3031).
// Serves two purposes:
//   1. FiveM bridge - PerformHttpRequest cannot verify self-signed TLS certs,
//      so the bridge resource must reach the CAD over plain HTTP.
//      In resources/[...]/cad_bridge/config.cfg set:
//      cad_bridge_base_url "http://127.0.0.1:3031"
//   2. Steam OpenID callback - Steam redirects the browser back to returnURL.
//      If returnURL is HTTPS with a self-signed cert, the browser blocks it.
//      Set STEAM_REALM=http://103.203.241.35:3031 in .env so the callback
//      arrives over plain HTTP (no cert warning, no ERR_EMPTY_RESPONSE).
// Binds to 0.0.0.0 so both FiveM (localhost) and browsers (public IP) can reach it.
const bridgeHttpPort = parseInt(process.env.BRIDGE_HTTP_PORT || '3031', 10) || 3031;
const bridgeHttpServer = http.createServer(app);
bridgeHttpServer.listen(bridgeHttpPort, '0.0.0.0', () => {
  console.log(`[BridgeHTTP] HTTP listener on 0.0.0.0:${bridgeHttpPort} (FiveM bridge + Steam callbacks)`);
});
bridgeHttpServer.on('error', (err) => {
  console.warn(`[BridgeHTTP] Could not start HTTP listener on port ${bridgeHttpPort}: ${err.message}`);
});

// Async startup
(async () => {
  // Start HTTP server
  httpServer.listen(config.port, () => {
    console.log(`CAD server running on port ${config.port}`);
    console.log(`Environment: ${config.nodeEnv}`);
  });

  // Start Discord bot
  startBot().then(client => {
    if (client) console.log('Discord bot started');
  }).catch(err => {
    console.error('Discord bot failed to start:', err.message);
  });

  startAutoUpdater().catch(err => {
    console.error('Auto updater failed to start:', err.message);
  });

  startFiveMResourceAutoSync();
  startFineProcessor();
  startCallAutoCloseProcessor();

  const expirySweepMsRaw = parseInt(process.env.CAD_EXPIRY_SWEEP_MS || '60000', 10);
  const expirySweepMs = Number.isFinite(expirySweepMsRaw) ? Math.max(60000, expirySweepMsRaw) : 60000;
  runCadExpirySweep();
  setInterval(runCadExpirySweep, expirySweepMs);
})();

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const sharp = require('sharp');
const config = require('../config');
const { DriverLicenses, Warrants, Settings } = require('../db/sqlite');

const POSTER_WIDTH = 1080;
const POSTER_HEIGHT = 1350;

const PHOTO_FRAME = Object.freeze({
  x: 72,
  y: 278,
  width: 450,
  height: 610,
  radius: 14,
});

const TEXT_COLORS = Object.freeze({
  background: '#010049',
  orange: '#ff9f2a',
  white: '#f7f7f8',
  muted: '#cfd3dc',
});

function xmlEscape(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function truncateText(value, maxChars = 140) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  if (!text) return '';
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(1, maxChars - 1)).trim()}...`;
}

function wrapText(value, { maxCharsPerLine = 26, maxLines = 3 } = {}) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  if (!text) return [];

  const words = text.split(' ');
  const lines = [];
  let current = '';

  for (const word of words) {
    if (!word) continue;
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxCharsPerLine) {
      current = next;
      continue;
    }

    if (current) {
      lines.push(current);
      current = '';
      if (lines.length >= maxLines) break;
    }

    if (word.length > maxCharsPerLine) {
      lines.push(word.slice(0, maxCharsPerLine - 1) + '…');
      if (lines.length >= maxLines) break;
    } else {
      current = word;
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  }

  if (lines.length > maxLines) {
    return lines.slice(0, maxLines);
  }

  if (words.length > 0 && lines.length === maxLines) {
    const original = text;
    const reconstructed = lines.join(' ');
    if (original.length > reconstructed.length) {
      lines[maxLines - 1] = truncateText(lines[maxLines - 1], Math.max(8, maxCharsPerLine));
    }
  }

  return lines;
}

function normalizeUrl(value) {
  return String(value || '').trim();
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || '').trim());
}

function resolveMugshotSource(mugshotUrl) {
  const raw = normalizeUrl(mugshotUrl);
  if (!raw) return { type: 'none', value: '' };

  if (raw.startsWith('/uploads/') || raw.startsWith('uploads/')) {
    const relative = raw.replace(/^\/+/, '');
    const uploadsRoot = path.resolve(__dirname, '../../data/uploads');
    const candidate = path.resolve(__dirname, `../../data/${relative.replace(/^uploads\//, 'uploads/')}`);
    if (candidate.startsWith(uploadsRoot)) {
      return { type: 'file', value: candidate };
    }
  }

  if (isHttpUrl(raw)) {
    return { type: 'http', value: raw };
  }

  if (raw.startsWith('/')) {
    const base = String(config.webUrl || '').trim().replace(/\/+$/, '');
    if (base) {
      return { type: 'http', value: `${base}${raw}` };
    }
  }

  if (!/^[a-z]+:/i.test(raw)) {
    const base = String(config.webUrl || '').trim().replace(/\/+$/, '');
    if (base) {
      return { type: 'http', value: `${base}/${raw.replace(/^\/+/, '')}` };
    }
  }

  return { type: 'unknown', value: raw };
}

async function fetchImageBufferFromUrl(url) {
  const res = await fetch(url, {
    signal: typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(10_000)
      : undefined,
  });
  if (!res.ok) {
    throw new Error(`Image fetch failed (${res.status})`);
  }
  const contentType = String(res.headers.get('content-type') || '').toLowerCase();
  if (contentType && !contentType.startsWith('image/')) {
    throw new Error(`URL did not return an image (${contentType})`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function loadMugshotBuffer(citizenId) {
  const license = DriverLicenses.findByCitizenId(citizenId);
  const mugshotUrl = normalizeUrl(license?.mugshot_url);
  if (!mugshotUrl) return { buffer: null, sourceUrl: '', hasPhoto: false };

  const source = resolveMugshotSource(mugshotUrl);
  try {
    if (source.type === 'file') {
      const buffer = await fsp.readFile(source.value);
      return { buffer, sourceUrl: mugshotUrl, hasPhoto: true };
    }
    if (source.type === 'http') {
      const buffer = await fetchImageBufferFromUrl(source.value);
      return { buffer, sourceUrl: mugshotUrl, hasPhoto: true };
    }
  } catch (err) {
    console.warn(`[WarrantPoster] Failed to load mugshot for ${citizenId}: ${err?.message || err}`);
  }

  return { buffer: null, sourceUrl: mugshotUrl, hasPhoto: false };
}

function buildWantedPosterSvg({
  name,
  location,
  warrantCount,
  wantedFor,
  hasMugshot = false,
}) {
  const safeName = truncateText(name, 64);
  const safeLocation = truncateText(location, 42);
  const safeWarrantCount = String(Math.max(1, Number(warrantCount || 1)));
  const wantedLines = wrapText(truncateText(wantedFor, 180), { maxCharsPerLine: 24, maxLines: 4 });
  const nameLines = wrapText(safeName, { maxCharsPerLine: 18, maxLines: 2 });

  const line = (text, x, y, size, fill = TEXT_COLORS.white, weight = 700) => (
    `<text x="${x}" y="${y}" fill="${fill}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}">${xmlEscape(text)}</text>`
  );

  const labelX = 600;
  const valueX = 600;
  const topY = 360;
  const gapY = 140;

  const wantedForLineHeight = 50;
  const wantedForStartY = topY + (gapY * 3) + 58;

  const nameLineStartY = topY + 62;
  const nameLineHeight = 46;

  const svgParts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${POSTER_WIDTH}" height="${POSTER_HEIGHT}" viewBox="0 0 ${POSTER_WIDTH} ${POSTER_HEIGHT}">`,
    `<rect x="0" y="0" width="${POSTER_WIDTH}" height="${POSTER_HEIGHT}" fill="${TEXT_COLORS.background}" />`,
    // Header
    line('Wanted', 62, 145, 92, TEXT_COLORS.orange, 900),
    line('Have You Seen This Person?', 64, 238, 58, TEXT_COLORS.white, 800),
    // Photo panel
    `<rect x="${PHOTO_FRAME.x}" y="${PHOTO_FRAME.y}" width="${PHOTO_FRAME.width}" height="${PHOTO_FRAME.height}" rx="${PHOTO_FRAME.radius}" fill="#08106b" stroke="rgba(255,255,255,0.35)" stroke-width="4" />`,
    hasMugshot
      ? ''
      : `<g>
          <circle cx="${PHOTO_FRAME.x + (PHOTO_FRAME.width / 2)}" cy="${PHOTO_FRAME.y + 190}" r="78" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.16)" stroke-width="3" />
          <rect x="${PHOTO_FRAME.x + 110}" y="${PHOTO_FRAME.y + 292}" width="${PHOTO_FRAME.width - 220}" height="225" rx="28" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.14)" stroke-width="3" />
          <text x="${PHOTO_FRAME.x + 42}" y="${PHOTO_FRAME.y + PHOTO_FRAME.height - 28}" fill="${TEXT_COLORS.muted}" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700">No licence photo available</text>
        </g>`,
    // Right column labels
    line('Name:', labelX, topY, 44, TEXT_COLORS.orange, 800),
    line('Location:', labelX, topY + gapY, 44, TEXT_COLORS.orange, 800),
    line('No. of Warrants:', labelX, topY + (gapY * 2), 44, TEXT_COLORS.orange, 800),
    line('Wanted for:', labelX, topY + (gapY * 3), 44, TEXT_COLORS.orange, 800),
    // Values
    ...nameLines.map((value, index) => line(value, valueX, nameLineStartY + (index * nameLineHeight), 38, TEXT_COLORS.white, 700)),
    line(safeLocation || 'Los Santos', valueX, topY + gapY + 62, 38, TEXT_COLORS.white, 700),
    line(safeWarrantCount, valueX, topY + (gapY * 2) + 62, 42, TEXT_COLORS.white, 900),
    ...wantedLines.map((value, index) => line(value, valueX, wantedForStartY + (index * wantedForLineHeight), 34, TEXT_COLORS.white, 700)),
    // Footer call to action and simplified branding marks
    line('See something.', 60, 1150, 64, TEXT_COLORS.white, 800),
    line('Say something.', 62, 1220, 64, TEXT_COLORS.orange, 800),
    `<g transform="translate(530,1086)">
      <rect x="0" y="0" width="196" height="118" rx="6" fill="#ffffff" />
      <rect x="0" y="0" width="196" height="12" fill="#1b1b1b" />
      <rect x="0" y="12" width="196" height="8" fill="url(#checker)" />
      <text x="12" y="48" fill="#101010" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="900">CRIME</text>
      <text x="12" y="74" fill="#101010" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="900">STOPPERS</text>
      <text x="12" y="98" fill="#101010" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="700">1800 333 000</text>
    </g>`,
    `<text x="858" y="1200" fill="${TEXT_COLORS.white}" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" letter-spacing="4">VICTORIA POLICE</text>`,
    // Decorative subtle frame
    `<rect x="20" y="20" width="${POSTER_WIDTH - 40}" height="${POSTER_HEIGHT - 40}" rx="18" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="2" />`,
    `<defs>
      <pattern id="checker" width="8" height="8" patternUnits="userSpaceOnUse">
        <rect x="0" y="0" width="4" height="4" fill="#111"/>
        <rect x="4" y="4" width="4" height="4" fill="#111"/>
      </pattern>
    </defs>`,
    '</svg>',
  ];

  return svgParts.join('');
}

function buildPosterFieldOverlaySvg({
  name,
  location,
  warrantCount,
  wantedFor,
}) {
  const safeName = truncateText(name, 64);
  const safeLocation = truncateText(location, 42);
  const safeWarrantCount = String(Math.max(1, Number(warrantCount || 1)));
  const wantedLines = wrapText(truncateText(wantedFor, 180), { maxCharsPerLine: 24, maxLines: 4 });
  const nameLines = wrapText(safeName, { maxCharsPerLine: 18, maxLines: 2 });

  const line = (text, x, y, size, fill = TEXT_COLORS.white, weight = 700) => (
    `<text x="${x}" y="${y}" fill="${fill}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}">${xmlEscape(text)}</text>`
  );

  const labelX = 600;
  const valueX = 600;
  const topY = 360;
  const gapY = 140;
  const wantedForLineHeight = 50;
  const wantedForStartY = topY + (gapY * 3) + 58;
  const nameLineStartY = topY + 62;
  const nameLineHeight = 46;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${POSTER_WIDTH}" height="${POSTER_HEIGHT}" viewBox="0 0 ${POSTER_WIDTH} ${POSTER_HEIGHT}">`,
    ...nameLines.map((value, index) => line(value, valueX, nameLineStartY + (index * nameLineHeight), 38, TEXT_COLORS.white, 700)),
    line(safeLocation || 'Los Santos', valueX, topY + gapY + 62, 38, TEXT_COLORS.white, 700),
    line(safeWarrantCount, valueX, topY + (gapY * 2) + 62, 42, TEXT_COLORS.white, 900),
    ...wantedLines.map((value, index) => line(value, valueX, wantedForStartY + (index * wantedForLineHeight), 34, TEXT_COLORS.white, 700)),
    '</svg>',
  ].join('');
}

function getCustomTemplatePath() {
  const fromSettings = String(Settings.get('discord_warrant_community_poster_template_path') || '').trim();
  const fromConfig = String(config.discord?.warrantCommunityPosterTemplatePath || '').trim();
  const candidate = fromSettings || fromConfig;
  if (!candidate) return '';

  const resolved = path.isAbsolute(candidate)
    ? candidate
    : path.resolve(__dirname, '../../', candidate);
  return resolved;
}

async function renderWantedPoster({
  name,
  location = 'Los Santos',
  warrantCount = 1,
  wantedFor,
  mugshotBuffer = null,
}) {
  const customTemplatePath = getCustomTemplatePath();
  const hasCustomTemplate = !!customTemplatePath && fs.existsSync(customTemplatePath);
  const hasMugshot = !!mugshotBuffer;

  let baseBuffer;
  if (hasCustomTemplate) {
    baseBuffer = await sharp(customTemplatePath)
      .resize(POSTER_WIDTH, POSTER_HEIGHT, { fit: 'fill' })
      .png()
      .toBuffer();
  } else {
    const svg = buildWantedPosterSvg({ name, location, warrantCount, wantedFor, hasMugshot });
    baseBuffer = await sharp(Buffer.from(svg))
      .png()
      .toBuffer();
  }

  const composites = [];

  if (hasMugshot) {
    const photo = await sharp(mugshotBuffer)
      .rotate()
      .resize(PHOTO_FRAME.width - 12, PHOTO_FRAME.height - 12, { fit: 'cover', position: 'center' })
      .png()
      .toBuffer();

    const roundedMask = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${PHOTO_FRAME.width - 12}" height="${PHOTO_FRAME.height - 12}">
        <rect x="0" y="0" width="${PHOTO_FRAME.width - 12}" height="${PHOTO_FRAME.height - 12}" rx="${Math.max(8, PHOTO_FRAME.radius - 4)}" fill="#fff"/>
      </svg>`
    );

    const clippedPhoto = await sharp(photo)
      .composite([{ input: roundedMask, blend: 'dest-in' }])
      .png()
      .toBuffer();

    composites.push({
      input: clippedPhoto,
      left: PHOTO_FRAME.x + 6,
      top: PHOTO_FRAME.y + 6,
    });

    composites.push({
      input: Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${PHOTO_FRAME.width}" height="${PHOTO_FRAME.height}">
          <rect x="3" y="3" width="${PHOTO_FRAME.width - 6}" height="${PHOTO_FRAME.height - 6}" rx="${PHOTO_FRAME.radius}" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="2"/>
        </svg>`
      ),
      left: PHOTO_FRAME.x,
      top: PHOTO_FRAME.y,
    });
  }

  if (hasCustomTemplate) {
    composites.push({
      input: Buffer.from(buildPosterFieldOverlaySvg({
        name,
        location,
        warrantCount,
        wantedFor,
      })),
    });
  }

  return sharp(baseBuffer)
    .composite(composites)
    .png({ compressionLevel: 9 })
    .toBuffer();
}

function buildWebhookPayload({
  warrant,
  warrantCount,
  location,
  hasMugshot,
}) {
  const subjectName = String(warrant?.subject_name || 'Unknown').trim() || 'Unknown';
  const wantedFor = String(warrant?.title || warrant?.description || 'Active warrant').trim();

  return {
    username: String(Settings.get('discord_warrant_community_webhook_username') || 'Community Wanted Alerts').trim() || 'Community Wanted Alerts',
    avatar_url: String(Settings.get('discord_warrant_community_webhook_avatar_url') || '').trim() || undefined,
    content: `Community notification: **${subjectName}** is now wanted.`,
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: 'Wanted Notice',
        color: 0xff9f2a,
        description: `Have you seen **${subjectName}**?`,
        fields: [
          { name: 'Name', value: subjectName, inline: true },
          { name: 'Location', value: location, inline: true },
          { name: 'No. of Warrants', value: String(Math.max(1, Number(warrantCount || 1))), inline: true },
          { name: 'Wanted For', value: truncateText(wantedFor, 400), inline: false },
        ],
        footer: { text: hasMugshot ? 'CAD community alert (licence photo included)' : 'CAD community alert (no licence photo available)' },
        image: { url: 'attachment://wanted-poster.png' },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

function getWebhookUrl() {
  const fromSettings = String(Settings.get('discord_warrant_community_webhook_url') || '').trim();
  return fromSettings;
}

function getPosterLocationLabel() {
  const fromSettings = String(Settings.get('discord_warrant_community_default_location') || '').trim();
  const fromConfig = String(config.discord?.warrantCommunityDefaultLocation || '').trim();
  return fromSettings || fromConfig || 'Los Santos';
}

async function sendDiscordWebhookWithImage(webhookUrl, payload, pngBuffer) {
  const form = new FormData();
  form.append('payload_json', JSON.stringify(payload));
  form.append('files[0]', new Blob([pngBuffer], { type: 'image/png' }), 'wanted-poster.png');

  const res = await fetch(webhookUrl, {
    method: 'POST',
    body: form,
    signal: typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(12_000)
      : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Discord webhook failed (${res.status}): ${text.slice(0, 300)}`);
  }
}

async function notifyWarrantCommunityPoster(warrant) {
  if (!warrant || Number(warrant.id || 0) <= 0) {
    return { skipped: true, reason: 'invalid_warrant' };
  }

  const webhookUrl = getWebhookUrl();
  if (!webhookUrl) {
    return { skipped: true, reason: 'webhook_not_configured' };
  }

  const citizenId = String(warrant.citizen_id || '').trim();
  const activeWarrantsForCitizen = citizenId ? Warrants.findByCitizenId(citizenId, 'active') : [];
  const warrantCount = citizenId ? Math.max(1, activeWarrantsForCitizen.length) : 1;
  const location = getPosterLocationLabel();
  const mugshot = citizenId ? await loadMugshotBuffer(citizenId) : { buffer: null, sourceUrl: '', hasPhoto: false };
  const wantedFor = String(warrant.title || warrant.description || 'Active warrant').trim() || 'Active warrant';

  const posterBuffer = await renderWantedPoster({
    name: warrant.subject_name,
    location,
    warrantCount,
    wantedFor,
    mugshotBuffer: mugshot.buffer,
  });

  const payload = buildWebhookPayload({
    warrant,
    warrantCount,
    location,
    hasMugshot: !!mugshot.hasPhoto,
  });

  await sendDiscordWebhookWithImage(webhookUrl, payload, posterBuffer);

  return {
    skipped: false,
    warrant_id: Number(warrant.id),
    citizen_id: citizenId || '',
    warrant_count: warrantCount,
    has_mugshot: !!mugshot.hasPhoto,
  };
}

async function sendTestWarrantCommunityPoster() {
  const webhookUrl = getWebhookUrl();
  if (!webhookUrl) {
    return { skipped: true, reason: 'webhook_not_configured' };
  }

  const location = getPosterLocationLabel();
  const testWarrant = {
    id: 0,
    subject_name: 'Test Character',
    title: 'Test Warrant Notification',
    description: 'This is a CAD test webhook for community wanted posters.',
  };

  const posterBuffer = await renderWantedPoster({
    name: testWarrant.subject_name,
    location,
    warrantCount: 1,
    wantedFor: testWarrant.title,
    mugshotBuffer: null,
  });

  const payload = buildWebhookPayload({
    warrant: testWarrant,
    warrantCount: 1,
    location,
    hasMugshot: false,
  });
  payload.content = 'Test notification: this is a CAD warrant community poster webhook test.';
  if (Array.isArray(payload.embeds) && payload.embeds[0]) {
    payload.embeds[0].title = 'Wanted Notice (Test)';
    payload.embeds[0].description = 'Webhook connectivity test from CAD Admin Settings.';
  }

  await sendDiscordWebhookWithImage(webhookUrl, payload, posterBuffer);

  return {
    skipped: false,
    tested: true,
    location,
  };
}

module.exports = {
  notifyWarrantCommunityPoster,
  renderWantedPoster,
  sendTestWarrantCommunityPoster,
};

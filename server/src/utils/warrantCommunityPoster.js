const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const sharp = require('sharp');
const config = require('../config');
const { DriverLicenses, Warrants, WarrantCommunityMessages, Settings } = require('../db/sqlite');

const POSTER_WIDTH = 1080;
const POSTER_HEIGHT = 1350;

const PHOTO_FRAME = Object.freeze({
  x: 58,
  y: 300,
  width: 468,
  height: 622,
  radius: 14,
});

const TEMPLATE_TEXT_LAYOUT = Object.freeze({
  x: 600,
  topY: 360,
  gapY: 140,
  nameValueOffsetY: 78,
  locationValueOffsetY: 78,
  warrantCountValueOffsetY: 102,
  wantedForValueOffsetY: 92,
  nameFontSize: 38,
  locationFontSize: 38,
  warrantCountFontSize: 42,
  wantedForFontSize: 34,
  nameLineHeight: 46,
  wantedForLineHeight: 50,
});

const TEMPLATE_BASE_BLUE = '#000032';

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
    `<text x="${x}" y="${y}" fill="${fill}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}" paint-order="stroke fill" stroke="rgba(0,0,0,0.18)" stroke-width="1.5">${xmlEscape(text)}</text>`
  );

  const labelLine = (text, x, y) => (
    `<text x="${x}" y="${y}" fill="${TEXT_COLORS.orange}" font-family="Arial, Helvetica, sans-serif" font-size="44" font-weight="800" paint-order="stroke fill" stroke="rgba(0,0,0,0.18)" stroke-width="1.5">${xmlEscape(text)}</text>`
  );

  const labelX = TEMPLATE_TEXT_LAYOUT.x;
  const valueX = TEMPLATE_TEXT_LAYOUT.x;
  const topY = TEMPLATE_TEXT_LAYOUT.topY;
  const gapY = TEMPLATE_TEXT_LAYOUT.gapY;
  const wantedForStartY = topY + (gapY * 3) + TEMPLATE_TEXT_LAYOUT.wantedForValueOffsetY;
  const nameLineStartY = topY + TEMPLATE_TEXT_LAYOUT.nameValueOffsetY;
  const nameLineHeight = TEMPLATE_TEXT_LAYOUT.nameLineHeight;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${POSTER_WIDTH}" height="${POSTER_HEIGHT}" viewBox="0 0 ${POSTER_WIDTH} ${POSTER_HEIGHT}">`,
    // Clear the large photo area so baked-in sample portrait/placeholder from the template
    // doesn't show through. Real mugshots/placeholder are composited after this overlay.
    `<rect x="${PHOTO_FRAME.x + 2}" y="${PHOTO_FRAME.y + 2}" width="${PHOTO_FRAME.width - 4}" height="${PHOTO_FRAME.height - 4}" rx="${Math.max(8, PHOTO_FRAME.radius - 1)}" fill="${TEMPLATE_BASE_BLUE}" />`,
    // Clear only the dynamic text bands so the template artwork remains intact while
    // removing any baked-in sample values from the screenshot-based template.
    `<rect x="${labelX - 10}" y="${topY - 18}" width="364" height="104" fill="${TEMPLATE_BASE_BLUE}" />`,
    `<rect x="${labelX - 10}" y="${topY + gapY - 18}" width="364" height="104" fill="${TEMPLATE_BASE_BLUE}" />`,
    `<rect x="${labelX - 10}" y="${topY + (gapY * 2) - 18}" width="364" height="120" fill="${TEMPLATE_BASE_BLUE}" />`,
    `<rect x="${labelX - 10}" y="${topY + (gapY * 3) - 18}" width="364" height="232" fill="${TEMPLATE_BASE_BLUE}" />`,
    // Redraw labels aligned to the template positions.
    labelLine('Name:', labelX, topY),
    labelLine('Location:', labelX, topY + gapY),
    labelLine('No. of Warrants:', labelX, topY + (gapY * 2)),
    labelLine('Wanted for:', labelX, topY + (gapY * 3)),
    ...nameLines.map((value, index) => line(
      value,
      valueX,
      nameLineStartY + (index * nameLineHeight),
      TEMPLATE_TEXT_LAYOUT.nameFontSize,
      TEXT_COLORS.white,
      700
    )),
    line(
      safeLocation || 'Los Santos',
      valueX,
      topY + gapY + TEMPLATE_TEXT_LAYOUT.locationValueOffsetY,
      TEMPLATE_TEXT_LAYOUT.locationFontSize,
      TEXT_COLORS.white,
      700
    ),
    line(
      safeWarrantCount,
      valueX,
      topY + (gapY * 2) + TEMPLATE_TEXT_LAYOUT.warrantCountValueOffsetY,
      TEMPLATE_TEXT_LAYOUT.warrantCountFontSize,
      TEXT_COLORS.white,
      900
    ),
    ...wantedLines.map((value, index) => line(
      value,
      valueX,
      wantedForStartY + (index * TEMPLATE_TEXT_LAYOUT.wantedForLineHeight),
      TEMPLATE_TEXT_LAYOUT.wantedForFontSize,
      TEXT_COLORS.white,
      700
    )),
    '</svg>',
  ].join('');
}

function buildTemplatePlaceholderPhotoSvg() {
  const width = PHOTO_FRAME.width - 12;
  const height = PHOTO_FRAME.height - 12;
  const centerX = Math.round(width / 2);
  const headY = 220;
  const torsoY = 338;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<defs>
      <linearGradient id="bgFade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(255,255,255,0.06)" />
        <stop offset="100%" stop-color="rgba(255,255,255,0.02)" />
      </linearGradient>
      <linearGradient id="sil" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#d7dce8" stop-opacity="0.45" />
        <stop offset="100%" stop-color="#c7cedd" stop-opacity="0.22" />
      </linearGradient>
    </defs>`,
    `<rect x="0" y="0" width="${width}" height="${height}" rx="${Math.max(8, PHOTO_FRAME.radius - 4)}" fill="url(#bgFade)" />`,
    `<circle cx="${centerX}" cy="${headY}" r="92" fill="url(#sil)" stroke="rgba(255,255,255,0.18)" stroke-width="3" />`,
    `<path d="M ${centerX - 136} ${torsoY} C ${centerX - 136} ${torsoY - 78}, ${centerX - 80} ${torsoY - 120}, ${centerX} ${torsoY - 120} C ${centerX + 80} ${torsoY - 120}, ${centerX + 136} ${torsoY - 78}, ${centerX + 136} ${torsoY} L ${centerX + 136} ${torsoY + 184} Q ${centerX + 136} ${torsoY + 214}, ${centerX + 106} ${torsoY + 214} L ${centerX - 106} ${torsoY + 214} Q ${centerX - 136} ${torsoY + 214}, ${centerX - 136} ${torsoY + 184} Z" fill="url(#sil)" stroke="rgba(255,255,255,0.15)" stroke-width="3" />`,
    `<rect x="${centerX - 148}" y="${height - 124}" width="296" height="68" rx="14" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.12)" stroke-width="2" />`,
    `<text x="${centerX}" y="${height - 82}" text-anchor="middle" fill="${TEXT_COLORS.muted}" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="700" letter-spacing="0.5">No licence photo</text>`,
    `</svg>`,
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

function getBundledTemplatePath() {
  return path.resolve(__dirname, '../../assets/warrant-posters/crimestopperswantedposter.jpg');
}

function getCustomTemplateUrl() {
  const fromSettings = String(Settings.get('discord_warrant_community_poster_template_url') || '').trim();
  return isHttpUrl(fromSettings) ? fromSettings : '';
}

async function loadCustomTemplateBuffer() {
  const localPathCandidates = [
    getCustomTemplatePath(),
    getBundledTemplatePath(),
  ].filter(Boolean);

  for (const templatePath of localPathCandidates) {
    if (fs.existsSync(templatePath)) {
      try {
        const buffer = await fsp.readFile(templatePath);
        return { buffer, source: templatePath, kind: 'path' };
      } catch (err) {
        console.warn(`[WarrantPoster] Failed to read template image: ${err?.message || err}`);
      }
    } else if (templatePath === localPathCandidates[0] && templatePath !== getBundledTemplatePath()) {
      console.warn(`[WarrantPoster] Template path not found: ${templatePath}`);
    }
  }

  const customTemplateUrl = getCustomTemplateUrl();
  if (customTemplateUrl) {
    try {
      const buffer = await fetchImageBufferFromUrl(customTemplateUrl);
      return { buffer, source: customTemplateUrl, kind: 'url' };
    } catch (err) {
      console.warn(`[WarrantPoster] Failed to fetch template image: ${err?.message || err}`);
    }
  }

  return { buffer: null, source: '', kind: 'none' };
}

async function renderWantedPoster({
  name,
  location = 'Los Santos',
  warrantCount = 1,
  wantedFor,
  mugshotBuffer = null,
}) {
  const template = await loadCustomTemplateBuffer();
  const hasCustomTemplate = !!template.buffer;
  const hasMugshot = !!mugshotBuffer;

  let baseBuffer;
  if (hasCustomTemplate) {
    baseBuffer = await sharp(template.buffer)
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

    if (!hasCustomTemplate) {
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
  }
  if (!hasMugshot && hasCustomTemplate) {
    const placeholderPhoto = await sharp(Buffer.from(buildTemplatePlaceholderPhotoSvg()))
      .png()
      .toBuffer();
    composites.push({
      input: placeholderPhoto,
      left: PHOTO_FRAME.x + 6,
      top: PHOTO_FRAME.y + 6,
    });
  }

  return sharp(baseBuffer)
    .composite(composites)
    .png({ compressionLevel: 9 })
    .toBuffer();
}

function buildWebhookPayload() {
  return {
    username: String(Settings.get('discord_warrant_community_webhook_username') || 'Community Wanted Alerts').trim() || 'Community Wanted Alerts',
    avatar_url: String(Settings.get('discord_warrant_community_webhook_avatar_url') || '').trim() || undefined,
    allowed_mentions: { parse: [] },
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
  let executeUrl = webhookUrl;
  try {
    const parsed = new URL(String(webhookUrl || '').trim());
    parsed.searchParams.set('wait', 'true');
    executeUrl = parsed.toString();
  } catch {
    executeUrl = String(webhookUrl || '').trim();
  }

  const form = new FormData();
  form.append('payload_json', JSON.stringify(payload));
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const attachmentFileName = `wanted-poster-${uniqueSuffix}.png`;
  form.append('files[0]', new Blob([pngBuffer], { type: 'image/png' }), attachmentFileName);

  const res = await fetch(executeUrl, {
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

  const text = await res.text().catch(() => '');
  if (!text) return { ok: true, message_id: '' };
  try {
    const json = JSON.parse(text);
    return { ok: true, message_id: String(json?.id || '').trim(), raw: json };
  } catch {
    return { ok: true, message_id: '' };
  }
}

function buildWebhookMessageDeleteUrl(webhookUrl, messageId) {
  const parsed = new URL(String(webhookUrl || '').trim());
  parsed.search = '';
  const basePath = String(parsed.pathname || '').replace(/\/+$/, '');
  parsed.pathname = `${basePath}/messages/${encodeURIComponent(String(messageId || '').trim())}`;
  return parsed.toString();
}

async function deleteDiscordWebhookMessage(webhookUrl, messageId) {
  const targetUrl = buildWebhookMessageDeleteUrl(webhookUrl, messageId);
  const res = await fetch(targetUrl, {
    method: 'DELETE',
    signal: typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(12_000)
      : undefined,
  });

  if (res.ok) {
    return { ok: true, deleted: true };
  }

  const text = await res.text().catch(() => '');
  let discordCode = null;
  try {
    const json = text ? JSON.parse(text) : null;
    discordCode = Number(json?.code || 0) || null;
  } catch {
    discordCode = null;
  }

  // Unknown Message: treat as already gone.
  if (res.status === 404 && discordCode === 10008) {
    return { ok: true, deleted: true, already_missing: true };
  }

  throw new Error(`Discord webhook delete failed (${res.status}): ${text.slice(0, 300)}`);
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

  const payload = buildWebhookPayload();

  const sendResult = await sendDiscordWebhookWithImage(webhookUrl, payload, posterBuffer);
  const messageId = String(sendResult?.message_id || '').trim();
  if (messageId) {
    WarrantCommunityMessages.upsert({
      warrant_id: Number(warrant.id),
      discord_message_id: messageId,
      webhook_url: webhookUrl,
      status: 'posted',
      last_error: '',
    });
  }

  return {
    skipped: false,
    warrant_id: Number(warrant.id),
    citizen_id: citizenId || '',
    warrant_count: warrantCount,
    has_mugshot: !!mugshot.hasPhoto,
    discord_message_id: messageId,
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

  const payload = buildWebhookPayload();

  const sendResult = await sendDiscordWebhookWithImage(webhookUrl, payload, posterBuffer);

  return {
    skipped: false,
    tested: true,
    location,
    discord_message_id: String(sendResult?.message_id || '').trim(),
  };
}

async function deleteWarrantCommunityPosterMessage(warrantId) {
  const id = Number(warrantId);
  if (!Number.isInteger(id) || id <= 0) {
    return { skipped: true, reason: 'invalid_warrant_id' };
  }

  const record = WarrantCommunityMessages.findByWarrantId(id);
  if (!record) {
    return { skipped: true, reason: 'no_stored_message' };
  }

  const messageId = String(record.discord_message_id || '').trim();
  const webhookUrl = String(record.webhook_url || '').trim();
  if (!messageId || !webhookUrl) {
    WarrantCommunityMessages.markDeleteFailed(id, 'Missing stored webhook_url or discord_message_id');
    return { skipped: true, reason: 'missing_message_fields' };
  }

  try {
    const result = await deleteDiscordWebhookMessage(webhookUrl, messageId);
    WarrantCommunityMessages.markDeleted(id);
    return {
      skipped: false,
      warrant_id: id,
      discord_message_id: messageId,
      deleted: true,
      already_missing: !!result?.already_missing,
    };
  } catch (err) {
    WarrantCommunityMessages.markDeleteFailed(id, err?.message || err);
    throw err;
  }
}

module.exports = {
  notifyWarrantCommunityPoster,
  renderWantedPoster,
  sendTestWarrantCommunityPoster,
  deleteWarrantCommunityPosterMessage,
};

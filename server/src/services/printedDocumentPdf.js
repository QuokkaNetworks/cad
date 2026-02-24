const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const PAGE = {
  width: 595.28, // A4 portrait (pt)
  height: 841.89,
  margin: 38,
};

function cleanText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value.replace(/\r\n/g, '\n').trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  try {
    return JSON.stringify(value, null, 2).trim();
  } catch {
    return String(value).trim();
  }
}

function titleCase(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 'N/A';
  return `$${Math.round(n).toLocaleString('en-AU')}`;
}

function formatDate(value) {
  const text = cleanText(value);
  if (!text) return '';
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text;
  return parsed.toLocaleString('en-AU', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function wrapLines(text, font, size, maxWidth) {
  const normalized = String(text || '').replace(/\t/g, '  ');
  if (!normalized) return [];
  const paragraphs = normalized.split('\n');
  const out = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      const width = font.widthOfTextAtSize(candidate, size);
      if (width <= maxWidth || !line) {
        line = candidate;
        continue;
      }
      out.push(line);
      line = word;
    }
    if (line) out.push(line);
  }
  return out;
}

function drawTextBlock(page, text, options) {
  const {
    x,
    yTop,
    width,
    font,
    size = 10,
    color = rgb(0, 0, 0),
    lineHeight = size * 1.35,
    maxLines = 999,
  } = options;
  const lines = wrapLines(text, font, size, width);
  const visible = lines.slice(0, Math.max(0, maxLines));
  visible.forEach((line, index) => {
    page.drawText(line, {
      x,
      y: yTop - (index + 1) * lineHeight,
      size,
      font,
      color,
    });
  });
  const truncated = lines.length > visible.length;
  if (truncated && visible.length > 0) {
    const lastIndex = visible.length - 1;
    const line = String(visible[lastIndex] || '');
    const suffix = '…';
    let next = line;
    while (next.length > 0 && font.widthOfTextAtSize(`${next}${suffix}`, size) > width) {
      next = next.slice(0, -1);
    }
    page.drawRectangle({
      x,
      y: yTop - (lastIndex + 1) * lineHeight - 1,
      width,
      height: lineHeight + 2,
      color: rgb(0.98, 0.96, 0.9),
    });
    page.drawText(`${next}${suffix}`, {
      x,
      y: yTop - (lastIndex + 1) * lineHeight,
      size,
      font,
      color,
    });
  }
  return {
    lineCount: visible.length,
    height: visible.length * lineHeight,
    truncated,
  };
}

function drawFieldBox(page, label, value, layout, fonts) {
  const { x, yTop, width, height } = layout;
  page.drawRectangle({
    x,
    y: yTop - height,
    width,
    height,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.72, 0.72, 0.72),
    borderWidth: 0.9,
  });
  page.drawText(String(label || '').toUpperCase(), {
    x: x + 8,
    y: yTop - 13,
    size: 7.5,
    font: fonts.label,
    color: rgb(0.29, 0.29, 0.29),
  });
  drawTextBlock(page, cleanText(value) || 'N/A', {
    x: x + 8,
    yTop: yTop - 17,
    width: width - 16,
    font: fonts.value,
    size: 10.25,
    color: rgb(0.05, 0.05, 0.05),
    lineHeight: 12.8,
    maxLines: Math.max(1, Math.floor((height - 20) / 12.8)),
  });
}

function drawPageShell(page, titleText, subtitleText, fonts) {
  page.drawRectangle({
    x: 0,
    y: 0,
    width: PAGE.width,
    height: PAGE.height,
    color: rgb(0.985, 0.972, 0.93),
  });

  page.drawRectangle({
    x: PAGE.margin,
    y: PAGE.height - PAGE.margin - 60,
    width: PAGE.width - PAGE.margin * 2,
    height: 60,
    color: rgb(0.12, 0.18, 0.28),
  });

  page.drawText(titleText, {
    x: PAGE.margin + 14,
    y: PAGE.height - PAGE.margin - 28,
    size: 18,
    font: fonts.header,
    color: rgb(0.97, 0.98, 1),
  });
  page.drawText(subtitleText, {
    x: PAGE.margin + 14,
    y: PAGE.height - PAGE.margin - 45,
    size: 8.5,
    font: fonts.label,
    color: rgb(0.8, 0.86, 0.94),
  });

  page.drawRectangle({
    x: PAGE.margin,
    y: PAGE.margin,
    width: PAGE.width - PAGE.margin * 2,
    height: PAGE.height - PAGE.margin * 2,
    borderColor: rgb(0.66, 0.66, 0.66),
    borderWidth: 1,
    color: undefined,
  });

  for (let y = PAGE.margin + 12; y < PAGE.height - PAGE.margin - 70; y += 22) {
    page.drawLine({
      start: { x: PAGE.margin + 1, y },
      end: { x: PAGE.width - PAGE.margin - 1, y },
      color: rgb(0.94, 0.94, 0.9),
      thickness: 0.5,
    });
  }
}

function buildReferenceLine(metadata) {
  const parts = [];
  if (Number(metadata.infringement_notice_id || 0) > 0) parts.push(`INFRINGEMENT #${metadata.infringement_notice_id}`);
  if (cleanText(metadata.notice_number)) parts.push(`NOTICE ${cleanText(metadata.notice_number)}`);
  if (Number(metadata.record_id || 0) > 0) parts.push(`RECORD #${metadata.record_id}`);
  if (Number(metadata.warning_id || 0) > 0) parts.push(`WARNING #${metadata.warning_id}`);
  if (Number(metadata.cad_print_job_id || 0) > 0) parts.push(`PRINT #${metadata.cad_print_job_id}`);
  return parts.join('  |  ') || 'CAD PRINTED DOCUMENT';
}

function drawSignatureBlock(page, fonts, x, yTop, width, officerName) {
  page.drawLine({
    start: { x, y: yTop - 14 },
    end: { x: x + width, y: yTop - 14 },
    color: rgb(0.35, 0.35, 0.35),
    thickness: 0.8,
  });
  page.drawText('Officer Signature / Endorsement', {
    x,
    y: yTop - 26,
    size: 7.5,
    font: fonts.label,
    color: rgb(0.35, 0.35, 0.35),
  });
  const signatureText = cleanText(officerName) || 'Issuing Officer';
  page.drawText(signatureText, {
    x: x + 5,
    y: yTop - 11,
    size: 10,
    font: fonts.value,
    color: rgb(0.12, 0.12, 0.12),
  });
}

function drawInfringementNotice(page, payload, fonts) {
  const metadata = payload.metadata || {};
  drawPageShell(page, 'INFRINGEMENT NOTICE', 'Official CAD printout for in-game service', fonts);

  const innerX = PAGE.margin + 12;
  const innerW = PAGE.width - (PAGE.margin + 12) * 2;
  let y = PAGE.height - PAGE.margin - 72;

  page.drawText(buildReferenceLine(metadata), {
    x: innerX,
    y: y - 14,
    size: 8.5,
    font: fonts.label,
    color: rgb(0.28, 0.28, 0.28),
  });
  y -= 22;

  const colGap = 10;
  const leftW = Math.floor((innerW - colGap) * 0.58);
  const rightW = innerW - colGap - leftW;

  drawFieldBox(page, 'Notice Number', metadata.notice_number || payload.title, {
    x: innerX,
    yTop: y,
    width: leftW * 0.55,
    height: 44,
  }, fonts);
  drawFieldBox(page, 'Payable Status', titleCase(metadata.payable_status || metadata.status || 'unpaid'), {
    x: innerX + leftW * 0.55 + 8,
    yTop: y,
    width: leftW * 0.45 - 8,
    height: 44,
  }, fonts);
  drawFieldBox(page, 'Fine Amount', formatMoney(metadata.amount || metadata.fine_amount), {
    x: innerX + leftW + colGap,
    yTop: y,
    width: rightW,
    height: 44,
  }, fonts);
  y -= 52;

  drawFieldBox(page, 'Subject / Recipient', metadata.subject_name || metadata.subject_display || metadata.citizen_id, {
    x: innerX,
    yTop: y,
    width: leftW,
    height: 52,
  }, fonts);
  drawFieldBox(page, 'Citizen ID', metadata.citizen_id || 'N/A', {
    x: innerX + leftW + colGap,
    yTop: y,
    width: rightW,
    height: 52,
  }, fonts);
  y -= 60;

  drawFieldBox(page, 'Vehicle Plate', metadata.vehicle_plate || 'N/A', {
    x: innerX,
    yTop: y,
    width: leftW * 0.42,
    height: 52,
  }, fonts);
  drawFieldBox(page, 'Location', metadata.location || 'N/A', {
    x: innerX + leftW * 0.42 + 8,
    yTop: y,
    width: leftW * 0.58 - 8,
    height: 52,
  }, fonts);
  drawFieldBox(page, 'Issue Date', formatDate(metadata.issued_at || metadata.printed_at) || 'N/A', {
    x: innerX + leftW + colGap,
    yTop: y,
    width: rightW,
    height: 52,
  }, fonts);
  y -= 60;

  drawFieldBox(page, 'Due Date', formatDate(metadata.due_date) || cleanText(metadata.due_date) || 'N/A', {
    x: innerX,
    yTop: y,
    width: leftW * 0.5,
    height: 48,
  }, fonts);
  drawFieldBox(page, 'Court Date', formatDate(metadata.court_date) || cleanText(metadata.court_date) || 'N/A', {
    x: innerX + leftW * 0.5 + 8,
    yTop: y,
    width: leftW * 0.5 - 8,
    height: 48,
  }, fonts);
  drawFieldBox(page, 'Court Location', metadata.court_location || 'N/A', {
    x: innerX + leftW + colGap,
    yTop: y,
    width: rightW,
    height: 48,
  }, fonts);
  y -= 56;

  drawFieldBox(page, 'Offence / Title', metadata.title || payload.title || 'Infringement', {
    x: innerX,
    yTop: y,
    width: innerW,
    height: 52,
  }, fonts);
  y -= 60;

  const notesHeight = 176;
  page.drawRectangle({
    x: innerX,
    y: y - notesHeight,
    width: innerW,
    height: notesHeight,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.72, 0.72, 0.72),
    borderWidth: 0.9,
  });
  page.drawText('NARRATIVE / PARTICULARS', {
    x: innerX + 8,
    y: y - 13,
    size: 7.5,
    font: fonts.label,
    color: rgb(0.29, 0.29, 0.29),
  });
  drawTextBlock(page, cleanText(metadata.notes || metadata.description || payload.description || ''), {
    x: innerX + 8,
    yTop: y - 16,
    width: innerW - 16,
    font: fonts.body,
    size: 9.5,
    lineHeight: 13.2,
    maxLines: 12,
    color: rgb(0.08, 0.08, 0.08),
  });
  y -= notesHeight + 12;

  drawSignatureBlock(
    page,
    fonts,
    innerX + 4,
    y,
    Math.min(260, innerW * 0.52),
    [cleanText(metadata.officer_callsign), cleanText(metadata.officer_name)].filter(Boolean).join(' - ')
  );

  page.drawText(`Printed ${formatDate(metadata.printed_at || new Date().toISOString())}`, {
    x: innerX + innerW - 190,
    y: y - 24,
    size: 7.5,
    font: fonts.label,
    color: rgb(0.35, 0.35, 0.35),
  });
}

function drawGenericNotice(page, payload, fonts, kindLabel) {
  const metadata = payload.metadata || {};
  drawPageShell(page, kindLabel, 'Official CAD printout', fonts);

  const innerX = PAGE.margin + 12;
  const innerW = PAGE.width - (PAGE.margin + 12) * 2;
  let y = PAGE.height - PAGE.margin - 72;

  page.drawText(buildReferenceLine(metadata), {
    x: innerX,
    y: y - 14,
    size: 8.5,
    font: fonts.label,
    color: rgb(0.28, 0.28, 0.28),
  });
  y -= 22;

  const halfW = (innerW - 10) / 2;
  drawFieldBox(page, 'Subject', metadata.subject_name || metadata.subject_display || metadata.citizen_id || metadata.subject_key || 'N/A', {
    x: innerX, yTop: y, width: halfW, height: 56,
  }, fonts);
  drawFieldBox(page, 'Officer', [cleanText(metadata.officer_callsign), cleanText(metadata.officer_name)].filter(Boolean).join(' - ') || 'N/A', {
    x: innerX + halfW + 10, yTop: y, width: halfW, height: 56,
  }, fonts);
  y -= 64;

  drawFieldBox(page, 'Status', titleCase(metadata.status || metadata.payable_status || ''), {
    x: innerX, yTop: y, width: halfW * 0.62, height: 48,
  }, fonts);
  drawFieldBox(page, 'Issued', formatDate(metadata.issued_at || metadata.printed_at) || 'N/A', {
    x: innerX + halfW * 0.62 + 8, yTop: y, width: halfW * 0.38 - 8, height: 48,
  }, fonts);
  drawFieldBox(page, 'Fine / Penalty', formatMoney(metadata.fine_amount || metadata.amount) + (
    Number(metadata.jail_minutes || 0) > 0 ? ` | ${Math.trunc(Number(metadata.jail_minutes || 0))} min` : ''
  ), {
    x: innerX + halfW + 10, yTop: y, width: halfW, height: 48,
  }, fonts);
  y -= 56;

  drawFieldBox(page, 'Title', metadata.title || payload.title || kindLabel, {
    x: innerX, yTop: y, width: innerW, height: 54,
  }, fonts);
  y -= 62;

  const summaryHeight = 260;
  page.drawRectangle({
    x: innerX,
    y: y - summaryHeight,
    width: innerW,
    height: summaryHeight,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.72, 0.72, 0.72),
    borderWidth: 0.9,
  });
  page.drawText('SUMMARY / NOTES', {
    x: innerX + 8,
    y: y - 13,
    size: 7.5,
    font: fonts.label,
    color: rgb(0.29, 0.29, 0.29),
  });
  drawTextBlock(page, cleanText(metadata.notes || metadata.description || payload.description || metadata.info || ''), {
    x: innerX + 8,
    yTop: y - 16,
    width: innerW - 16,
    font: fonts.body,
    size: 9.5,
    lineHeight: 13.2,
    maxLines: 18,
    color: rgb(0.08, 0.08, 0.08),
  });
  y -= summaryHeight + 12;

  drawSignatureBlock(page, fonts, innerX + 4, y, 260, cleanText(metadata.officer_name));
}

function sanitizeFilename(value, fallback) {
  const cleaned = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return cleaned || fallback;
}

async function buildPrintedDocumentPdfAttachment(input = {}) {
  const metadata = input.metadata && typeof input.metadata === 'object' ? { ...input.metadata } : {};
  const subtype = String(input.document_subtype || metadata.document_subtype || '').trim().toLowerCase();
  const documentTitle = cleanText(input.title || metadata.title || metadata.label || 'CAD Printed Document').slice(0, 120);
  const description = cleanText(input.description || metadata.description || metadata.info || '').slice(0, 2000);

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(documentTitle);
  pdfDoc.setAuthor('CAD');
  pdfDoc.setProducer('CAD Printed Document Generator');
  pdfDoc.setCreator('CAD');
  pdfDoc.setSubject(subtype ? titleCase(subtype) : 'Printed Document');
  pdfDoc.setCreationDate(new Date());

  const fonts = {
    header: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
    label: await pdfDoc.embedFont(StandardFonts.Helvetica),
    body: await pdfDoc.embedFont(StandardFonts.TimesRoman),
    value: await pdfDoc.embedFont(StandardFonts.CourierOblique),
  };

  const page = pdfDoc.addPage([PAGE.width, PAGE.height]);
  const payload = {
    title: documentTitle,
    description,
    metadata: {
      ...metadata,
      title: metadata.title || documentTitle,
      description: metadata.description || description,
    },
  };

  if (subtype === 'ticket') {
    drawInfringementNotice(page, payload, fonts);
  } else if (subtype === 'written_warning' || subtype === 'warning') {
    drawGenericNotice(page, payload, fonts, 'WRITTEN WARNING');
  } else {
    drawGenericNotice(page, payload, fonts, titleCase(subtype || 'cad_document'));
  }

  const pdfBase64 = await pdfDoc.saveAsBase64({ dataUri: false });
  const fileStem = sanitizeFilename(
    cleanText(metadata.notice_number || metadata.warning_id || metadata.record_id || documentTitle),
    subtype || 'cad-document'
  );

  return {
    pdf_base64: pdfBase64,
    pdf_mime: 'application/pdf',
    pdf_filename: `${fileStem}.pdf`,
    pdf_layout: subtype === 'ticket' ? 'infringement_notice_v1' : 'cad_printed_document_v1',
  };
}

module.exports = {
  buildPrintedDocumentPdfAttachment,
};

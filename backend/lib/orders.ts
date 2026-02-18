// Server-only module - ensure this is not imported in client code
if (typeof window !== 'undefined') {
  throw new Error('lib/orders.ts can only be used on the server');
}

import * as cheerio from 'cheerio';
import ExcelJS from 'exceljs';
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

export type CaseTypeOption = { value: string; label: string };
export type OrdersCity = 'lucknow' | 'allahabad';

export type OrdersFetchInput = {
  caseType: string;
  caseNo: string;
  caseYear: string;
  city?: string;
};

export type OrderJudgmentEntry = {
  srNo: number;
  date: string;
  viewUrl: string;
  judgmentId: string;
};

export type OrderJudgmentDownload = {
  judgmentId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  base64: string;
};

export type OrdersFetchResult = {
  city: OrdersCity;
  caseInfo: {
    caseType: string;
    caseNo: string;
    caseYear: string;
    status?: string;
    petitionerVsRespondent?: string;
  };
  details: {
    header?: string;
    keyValues: Array<{ key: string; value: string }>;
    listingHistory: Array<Record<string, string>>;
    iaDetails: Array<Record<string, string>>;
  };
  pdf: { filename: string; base64: string };
  excel: { filename: string; base64: string };
  orderJudgments: OrderJudgmentEntry[];
};

type OrdersSourceConfig = {
  city: OrdersCity;
  label: string;
  baseUrl: string;
  origin: string;
  caseNumberUrl: string;
  caseInfoUrl: string;
  caseDetailsUrl: string;
  orderSheetsUrl: string;
  requiresServerCaptcha: boolean;
  captchaImageUrl?: string;
};

const LUCKNOW_SOURCE: OrdersSourceConfig = {
  city: 'lucknow',
  label: 'Case Status Lucknow Bench',
  baseUrl: 'https://hclko.allahabadhighcourt.in/status',
  origin: 'https://hclko.allahabadhighcourt.in',
  caseNumberUrl: 'https://hclko.allahabadhighcourt.in/status/index.php/case-number',
  caseInfoUrl: 'https://hclko.allahabadhighcourt.in/status/index.php/get_CaseInfo',
  caseDetailsUrl: 'https://hclko.allahabadhighcourt.in/status/index.php/get_CaseDetails',
  orderSheetsUrl: 'https://hclko.allahabadhighcourt.in/status/index.php/get-order-sheets',
  requiresServerCaptcha: false,
};

const ALLAHABAD_SOURCE: OrdersSourceConfig = {
  city: 'allahabad',
  label: 'Case Status Allahabad',
  baseUrl: 'https://www.allahabadhighcourt.in/apps/status_ccms',
  origin: 'https://www.allahabadhighcourt.in',
  caseNumberUrl: 'https://www.allahabadhighcourt.in/apps/status_ccms/index.php/case-number',
  caseInfoUrl: 'https://www.allahabadhighcourt.in/apps/status_ccms/index.php/get_CaseInfo',
  caseDetailsUrl: 'https://www.allahabadhighcourt.in/apps/status_ccms/index.php/get_CaseDetails',
  orderSheetsUrl: 'https://www.allahabadhighcourt.in/apps/status_ccms/index.php/get-order-sheets',
  requiresServerCaptcha: true,
  captchaImageUrl:
    'https://www.allahabadhighcourt.in/apps/status_ccms/index.php/secureimage/securimage',
};

function normalizeCity(city?: string): OrdersCity {
  return city?.toLowerCase() === 'allahabad' ? 'allahabad' : 'lucknow';
}

function getSourceConfig(city?: string): OrdersSourceConfig {
  return normalizeCity(city) === 'allahabad' ? ALLAHABAD_SOURCE : LUCKNOW_SOURCE;
}

function normalizeText(s: string) {
  return s.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function fetchCaseTypes(city?: string): Promise<CaseTypeOption[]> {
  const source = getSourceConfig(city);
  const res = await fetch(source.caseNumberUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
    },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Failed to load case types: ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  const opts: CaseTypeOption[] = [];
  $('#case_type option').each((_, el) => {
    const value = ($(el).attr('value') || '').trim();
    const label = normalizeText($(el).text());
    if (!value || !label || label.toLowerCase().includes('select case type')) return;
    opts.push({ value, label });
  });
  return opts;
}

function extractViewParams(caseInfoHtml: string) {
  // The response can be:
  //   viewCaseData('CINO')
  //   viewCaseData('CINO','source')
  //   viewCaseData('CINO','source','iemi')
  const re = /viewCaseData\(\s*'([^']+)'\s*(?:,\s*'([^']*)'\s*(?:,\s*'([^']*)'\s*)?)?\)/i;
  const m = caseInfoHtml.match(re);
  if (!m) return null;
  return { cino: m[1], source: m[2] || '', iemi: m[3] || '' };
}

function parseCaseInfo(caseInfoHtml: string) {
  const $ = cheerio.load(caseInfoHtml);
  const text = normalizeText($.root().text());

  // Try to get status and parties from the first row, if table exists.
  let status: string | undefined;
  let petitionerVsRespondent: string | undefined;

  const table = $('table').first();
  if (table.length) {
    const headers = table.find('tr').first().find('th,td').map((_, el) => normalizeText($(el).text())).get();
    const row = table.find('tr').slice(1).first();
    const cells = row.find('td').map((_, el) => normalizeText($(el).text())).get();
    const findIdx = (needle: string) => headers.findIndex((h) => h.toLowerCase().includes(needle));
    const statusIdx = findIdx('status');
    const partiesIdx = headers.findIndex((h) => h.toLowerCase().includes('petitioner'));
    if (statusIdx >= 0 && cells[statusIdx]) status = cells[statusIdx];
    if (partiesIdx >= 0 && cells[partiesIdx]) petitionerVsRespondent = cells[partiesIdx];
  } else {
    // Fallback: pull a likely "PENDING / DISPOSED" token
    const m = text.match(/\b(PENDING|DISPOSED|DECIDED)\b/i);
    if (m) status = m[1].toUpperCase();
  }

  return { status, petitionerVsRespondent };
}

function getSetCookieValues(headers: Headers): string[] {
  const withGetSetCookie = headers as Headers & { getSetCookie?: () => string[] };
  const values = withGetSetCookie.getSetCookie?.();
  if (values && values.length > 0) return values;
  const single = headers.get('set-cookie');
  return single ? [single] : [];
}

function updateCookieJar(cookieJar: Map<string, string>, response: Response) {
  for (const raw of getSetCookieValues(response.headers)) {
    const firstPart = raw.split(';')[0]?.trim();
    if (!firstPart) continue;
    const eqIdx = firstPart.indexOf('=');
    if (eqIdx <= 0) continue;
    const name = firstPart.slice(0, eqIdx).trim();
    const value = firstPart.slice(eqIdx + 1).trim();
    if (!name) continue;
    cookieJar.set(name, value);
  }
}

function toCookieHeader(cookieJar: Map<string, string>): string {
  return Array.from(cookieJar.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

function decodeCaptchaToken(token: string): string {
  const clean = token.trim();
  if (/^\d{6}$/.test(clean)) return clean;

  let decoded = '';
  try {
    decoded = Buffer.from(clean, 'base64').toString('utf8').trim();
  } catch {
    decoded = '';
  }

  if (/^\d{6}$/.test(decoded)) return decoded;
  throw new Error('Failed to decode eLegalix captcha token');
}

function runTesseractDigits(imagePath: string, psm: number): string {
  try {
    const out = execFileSync(
      'tesseract',
      [
        imagePath,
        'stdout',
        '--psm',
        String(psm),
        '-c',
        'tessedit_char_whitelist=0123456789',
      ],
      { encoding: 'utf8' }
    );
    return out.replace(/\D/g, '').trim();
  } catch (error) {
    const e = error as { stdout?: Buffer | string };
    const out = String(e.stdout || '');
    return out.replace(/\D/g, '').trim();
  }
}

async function getAllahabadCaptchaCandidates(image: Buffer): Promise<string[]> {
  const tmpRoot = realpathSync(os.tmpdir());
  const workDir = mkdtempSync(path.join(tmpRoot, 'hcourt-allahabad-cap-'));
  try {
    const variants: Array<{ name: string; buffer: Buffer }> = [
      { name: 'orig', buffer: image },
      {
        name: 'gray-140',
        buffer: await sharp(image).grayscale().normalize().threshold(140).toBuffer(),
      },
      {
        name: 'gray-160',
        buffer: await sharp(image).grayscale().normalize().threshold(160).toBuffer(),
      },
      {
        name: 'gray-180',
        buffer: await sharp(image).grayscale().normalize().threshold(180).toBuffer(),
      },
      {
        name: 'resize3-160',
        buffer: await sharp(image)
          .resize({ width: 750, height: 300, kernel: sharp.kernel.nearest })
          .grayscale()
          .normalize()
          .threshold(160)
          .toBuffer(),
      },
      {
        name: 'resize3-170',
        buffer: await sharp(image)
          .resize({ width: 750, height: 300, kernel: sharp.kernel.nearest })
          .grayscale()
          .normalize()
          .threshold(170)
          .toBuffer(),
      },
    ];

    const scored = new Map<string, number>();
    for (const variant of variants) {
      const file = path.join(workDir, `${variant.name}.png`);
      writeFileSync(file, variant.buffer);
      for (const psm of [8, 7, 13]) {
        const candidate = runTesseractDigits(file, psm);
        if (!candidate) continue;
        scored.set(candidate, (scored.get(candidate) || 0) + 1);
      }
    }

    return Array.from(scored.entries())
      .sort((a, b) => {
        const aLen4 = /^\d{4}$/.test(a[0]) ? 1 : 0;
        const bLen4 = /^\d{4}$/.test(b[0]) ? 1 : 0;
        if (aLen4 !== bLen4) return bLen4 - aLen4;
        if (a[1] !== b[1]) return b[1] - a[1];
        return b[0].length - a[0].length;
      })
      .map(([candidate]) => candidate);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

function extractOrderSheetParams(detailsHtml: string) {
  const m = detailsHtml.match(/viewOrderSheet\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/i);
  if (!m) return null;
  return {
    caseTypeCode: m[1],
    caseNo: m[2],
    caseYear: m[3],
  };
}

function extractJudgmentId(viewUrl: string): string {
  try {
    const u = new URL(viewUrl);
    return u.searchParams.get('judgmentID')?.trim() || '';
  } catch {
    return '';
  }
}

async function fetchOrderJudgments(
  detailsHtml: string,
  source: OrdersSourceConfig
): Promise<OrderJudgmentEntry[]> {
  const params = extractOrderSheetParams(detailsHtml);
  if (!params) return [];

  const form = new URLSearchParams();
  form.set('ct', params.caseTypeCode);
  form.set('cn', params.caseNo);
  form.set('cy', params.caseYear);

  const response = await fetch(source.orderSheetsUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'User-Agent': 'Mozilla/5.0',
      Origin: source.origin,
      Referer: source.caseNumberUrl,
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: form.toString(),
    cache: 'no-store',
  });

  if (!response.ok) return [];
  const html = await response.text();
  const $ = cheerio.load(html);
  const rows: OrderJudgmentEntry[] = [];

  $('tbody tr').each((_, tr) => {
    const tds = $(tr).find('td');
    if (tds.length < 3) return;

    const srNo = parseInt(normalizeText($(tds[0]).text()), 10);
    const date = normalizeText($(tds[1]).text());
    const href = ($(tds[2]).find('a').attr('href') || '').trim();
    if (!href) return;

    let viewUrl = href;
    try {
      viewUrl = new URL(href, source.baseUrl).toString();
    } catch {
      return;
    }

    const judgmentId = extractJudgmentId(viewUrl);
    if (!judgmentId) return;

    rows.push({
      srNo: Number.isFinite(srNo) ? srNo : rows.length + 1,
      date,
      viewUrl,
      judgmentId,
    });
  });

  return rows;
}

function safeFileToken(value: string): string {
  return value.replace(/[^a-z0-9\-_.]/gi, '_');
}

function buildJudgmentFilename(judgmentId: string, date?: string): string {
  const datePart = date ? `-${safeFileToken(date)}` : '';
  return `order-judgment-${safeFileToken(judgmentId)}${datePart}.pdf`;
}

export async function downloadOrderJudgment(viewUrl: string, date?: string): Promise<OrderJudgmentDownload> {
  if (!viewUrl) throw new Error('Missing judgment view URL');

  const parsed = new URL(viewUrl);
  const judgmentId = parsed.searchParams.get('judgmentID')?.trim() || '';
  if (!judgmentId) throw new Error('Judgment ID not found in view URL');

  const pathParts = parsed.pathname.split('/').filter(Boolean);
  const appRoot = pathParts.length > 1 ? `/${pathParts[0]}` : '';
  const baseAppUrl = `${parsed.origin}${appRoot}`;
  const formActionUrl = `${parsed.origin}${parsed.pathname}`;
  const referer = viewUrl;
  const cookieJar = new Map<string, string>();

  const initRes = await fetch(viewUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
    },
    cache: 'no-store',
  });
  updateCookieJar(cookieJar, initRes);
  if (!initRes.ok) {
    throw new Error(`Failed to open eLegalix page: ${initRes.status}`);
  }

  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const captchaRes = await fetch(`${baseAppUrl}/getData?action=generateCaptcha`, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Cookie: toCookieHeader(cookieJar),
      },
      cache: 'no-store',
    });
    updateCookieJar(cookieJar, captchaRes);
    if (!captchaRes.ok) continue;

    const token = await captchaRes.text();
    let securityCode = '';
    try {
      securityCode = decodeCaptchaToken(token);
    } catch {
      continue;
    }

    const form = new URLSearchParams();
    form.set('judgmentID', judgmentId);
    form.set('subseq', parsed.searchParams.get('subseq') || 'no');
    form.set('securitycode', securityCode);

    const fileRes = await fetch(formActionUrl, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: parsed.origin,
        Referer: referer,
        Cookie: toCookieHeader(cookieJar),
      },
      body: form.toString(),
      cache: 'no-store',
    });
    updateCookieJar(cookieJar, fileRes);

    const contentType = (fileRes.headers.get('content-type') || '').toLowerCase();
    if (!fileRes.ok || !contentType.includes('pdf')) {
      continue;
    }

    const data = Buffer.from(await fileRes.arrayBuffer());
    if (data.length < 8 || data.slice(0, 4).toString() !== '%PDF') {
      continue;
    }

    return {
      judgmentId,
      filename: buildJudgmentFilename(judgmentId, date),
      mimeType: 'application/pdf',
      sizeBytes: data.length,
      base64: data.toString('base64'),
    };
  }

  throw new Error('Failed to download judgment after multiple captcha attempts');
}

function isAllahabadCaptchaMismatch(html: string): boolean {
  return /captcha\s*code\s*was\s*not\s*match/i.test(html);
}

async function fetchAllahabadCaseInfoHtml(
  source: OrdersSourceConfig,
  form: URLSearchParams,
  cookieJar: Map<string, string>
): Promise<string> {
  if (!source.captchaImageUrl) {
    throw new Error('Captcha image URL is not configured for this source');
  }
  const initRes = await fetch(source.caseNumberUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
    },
    cache: 'no-store',
  });
  updateCookieJar(cookieJar, initRes);
  if (!initRes.ok) {
    throw new Error(`Failed to initialize ${source.label}: ${initRes.status}`);
  }

  const maxImages = 10;
  const maxCodesPerImage = 8;
  for (let imageAttempt = 1; imageAttempt <= maxImages; imageAttempt++) {
    const imageRes = await fetch(
      `${source.captchaImageUrl}?_t=${Date.now()}${imageAttempt}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          Cookie: toCookieHeader(cookieJar),
          Referer: source.caseNumberUrl,
        },
        cache: 'no-store',
      }
    );
    updateCookieJar(cookieJar, imageRes);
    if (!imageRes.ok) continue;

    const image = Buffer.from(await imageRes.arrayBuffer());
    const candidates = await getAllahabadCaptchaCandidates(image);
    if (candidates.length === 0) continue;

    for (const code of candidates.slice(0, maxCodesPerImage)) {
      form.set('captchacode', code);
      const response = await fetch(source.caseInfoUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'User-Agent': 'Mozilla/5.0',
          Origin: source.origin,
          Referer: source.caseNumberUrl,
          'X-Requested-With': 'XMLHttpRequest',
          Cookie: toCookieHeader(cookieJar),
        },
        body: form.toString(),
        cache: 'no-store',
      });
      updateCookieJar(cookieJar, response);
      if (!response.ok) continue;

      const html = await response.text();
      if (isAllahabadCaptchaMismatch(html)) continue;
      return html;
    }
  }

  throw new Error(
    'Unable to solve Allahabad captcha automatically after multiple attempts'
  );
}

function parseDetails(detailsHtml: string) {
  const $ = cheerio.load(detailsHtml);

  const header =
    normalizeText(
      $('h3')
        .filter((_, el) => normalizeText($(el).text()).toLowerCase().includes('case status -'))
        .first()
        .text()
    ) ||
    normalizeText($('h2,h3,center b,center strong').first().text());

  // Key-values: common pattern is table rows with 2 or 4 cells (label/value pairs)
  const keyValues: Array<{ key: string; value: string }> = [];
  $('table').each((_, tbl) => {
    const $t = $(tbl);
    const headerRowText = normalizeText(
      $t
        .find('tr')
        .first()
        .find('th,td')
        .map((__, el) => $(el).text())
        .get()
        .join(' ')
    ).toLowerCase();
    // Skip tabular sections that we parse separately
    if (headerRowText.includes('cause list type') || headerRowText.includes('listing date') || headerRowText.includes('short order')) return;
    if (headerRowText.includes('application(s) number') || headerRowText.includes('ia status')) return;

    $t.find('tr').each((__, tr) => {
      const cells = $(tr).find('td,th').map((___, el) => normalizeText($(el).text())).get().filter(Boolean);
      if (cells.length === 2) {
        const [k, v] = cells;
        if (k && v) keyValues.push({ key: k, value: v });
      } else if (cells.length === 4) {
        const [k1, v1, k2, v2] = cells;
        if (k1 && v1) keyValues.push({ key: k1, value: v1 });
        if (k2 && v2) keyValues.push({ key: k2, value: v2 });
      }
    });
  });

  // Listing history table: look for headers containing "Listing Date"
  const listingHistory: Array<Record<string, string>> = [];
  const iaDetails: Array<Record<string, string>> = [];

  $('table').each((_, tbl) => {
    const $t = $(tbl);
    const headers = $t.find('tr').first().find('th,td').map((__, el) => normalizeText($(el).text())).get().filter(Boolean);
    if (headers.length < 3) return;

    const headersLower = headers.map((h) => h.toLowerCase());
    const isListing =
      headersLower.some((h) => h.includes('listing')) ||
      headersLower.some((h) => h.includes('short order')) ||
      headersLower.some((h) => h.includes('cause list type'));
    const isIA =
      headersLower.some((h) => h.includes('ia')) &&
      headersLower.some((h) => h.includes('date')) &&
      headersLower.some((h) => h.includes('party'));

    if (!isListing && !isIA) return;

    $t.find('tr').slice(1).each((__, tr) => {
      const cells = $(tr).find('td').map((___, el) => normalizeText($(el).text())).get();
      if (cells.length === 0) return;
      const row: Record<string, string> = {};
      for (let i = 0; i < Math.min(headers.length, cells.length); i++) {
        row[headers[i]] = cells[i];
      }
      if (Object.values(row).some(Boolean)) {
        (isIA ? iaDetails : listingHistory).push(row);
      }
    });
  });

  // De-dupe keyValues (the page repeats some tables)
  const seen = new Set<string>();
  const deduped = keyValues.filter((kv) => {
    const k = `${kv.key}::${kv.value}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return { header, keyValues: deduped, listingHistory, iaDetails };
}

async function buildExcel(params: {
  caseTypeLabel: string;
  caseNo: string;
  caseYear: string;
  details: ReturnType<typeof parseDetails>;
}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'hcourt';

  const summary = wb.addWorksheet('Summary');
  summary.columns = [
    { header: 'Field', key: 'field', width: 38 },
    { header: 'Value', key: 'value', width: 80 },
  ];
  summary.addRow({ field: 'Case Type', value: params.caseTypeLabel });
  summary.addRow({ field: 'Case No', value: params.caseNo });
  summary.addRow({ field: 'Case Year', value: params.caseYear });
  if (params.details.header) summary.addRow({ field: 'Header', value: params.details.header });
  summary.addRow({ field: '', value: '' });
  for (const kv of params.details.keyValues) {
    summary.addRow({ field: kv.key, value: kv.value });
  }

  const listing = wb.addWorksheet('Listing History');
  if (params.details.listingHistory.length > 0) {
    const cols = Object.keys(params.details.listingHistory[0]);
    listing.columns = cols.map((c) => ({ header: c, key: c, width: Math.min(60, Math.max(18, c.length + 2)) }));
    for (const row of params.details.listingHistory) listing.addRow(row);
  } else {
    listing.addRow(['No listing history found']);
  }

  const ia = wb.addWorksheet('IA Details');
  if (params.details.iaDetails.length > 0) {
    const cols = Object.keys(params.details.iaDetails[0]);
    ia.columns = cols.map((c) => ({ header: c, key: c, width: Math.min(60, Math.max(18, c.length + 2)) }));
    for (const row of params.details.iaDetails) ia.addRow(row);
  } else {
    ia.addRow(['No IA details found']);
  }

  const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  return Buffer.from(buf);
}

async function buildPdf(detailsHtml: string) {
  // For Vercel serverless, ensure Chromium is available
  // Use headless shell if available (lighter for serverless)
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu',
      ],
    });
  } catch (error) {
    // Fallback: try with minimal args if the above fails
    console.error('Failed to launch browser with full args, trying minimal:', error);
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }
  try {
    const page = await browser.newPage();
    await page.setContent(
      `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Case Details</title>
          <style>
            body { font-family: Arial, sans-serif; color: #111; }
            table { width: 100%; border-collapse: collapse; }
            td, th { border: 1px solid #ddd; padding: 6px; font-size: 10px; vertical-align: top; }
            .no-print { display: none !important; }
          </style>
        </head>
        <body>
          ${detailsHtml}
        </body>
      </html>`,
      { waitUntil: 'domcontentloaded' }
    );
    // Give the page a moment to layout
    await page.waitForTimeout(200);
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '12mm', right: '10mm', bottom: '12mm', left: '10mm' } });
    return pdf;
  } finally {
    await browser.close();
  }
}

export async function fetchOrders(input: OrdersFetchInput): Promise<OrdersFetchResult> {
  const source = getSourceConfig(input.city);
  const caseNo = input.caseNo.trim();
  const caseYear = input.caseYear.trim();
  const caseType = input.caseType.trim();
  if (!caseType) throw new Error('Missing caseType');
  if (!/^\d+$/.test(caseNo)) throw new Error('Case No must be numeric');
  if (!/^\d{4}$/.test(caseYear)) throw new Error('Case Year must be 4 digits');

  // Fetch case types to get the display label (keeps output user-friendly)
  const types = await fetchCaseTypes(source.city);
  const caseTypeLabel = types.find((t) => t.value === caseType)?.label || caseType;

  const form = new URLSearchParams();
  form.set('case_type', caseType);
  form.set('case_no', caseNo);
  form.set('case_year', caseYear);
  const cookieJar = new Map<string, string>();

  let caseInfoHtml = '';
  if (source.requiresServerCaptcha) {
    caseInfoHtml = await fetchAllahabadCaseInfoHtml(source, form, cookieJar);
  } else {
    // Lucknow endpoint currently doesn't validate captcha server-side.
    form.set('captchacode', '0000');
    const infoRes = await fetch(source.caseInfoUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'User-Agent': 'Mozilla/5.0',
        Origin: source.origin,
        Referer: source.caseNumberUrl,
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: form.toString(),
      cache: 'no-store',
    });
    if (!infoRes.ok) throw new Error(`Failed to fetch case info: ${infoRes.status}`);
    caseInfoHtml = await infoRes.text();
  }

  // When the upstream site doesn't find a record, it returns a small card with this message
  if (/Record\s+Not\s+Found/i.test(caseInfoHtml)) {
    throw new Error(`Record not found for ${caseTypeLabel} / ${caseNo} / ${caseYear}. Check Case Year/No and try again.`);
  }

  const viewParams = extractViewParams(caseInfoHtml);
  if (!viewParams) throw new Error('Could not find a "view" link in case search results');

  const infoParsed = parseCaseInfo(caseInfoHtml);

  const detailsForm = new URLSearchParams();
  detailsForm.set('cino', viewParams.cino);
  if (viewParams.source) detailsForm.set('source', viewParams.source);
  if (viewParams.iemi) detailsForm.set('iemi', viewParams.iemi);

  const detailsHeaders: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'User-Agent': 'Mozilla/5.0',
    Origin: source.origin,
    Referer: source.caseNumberUrl,
    'X-Requested-With': 'XMLHttpRequest',
  };
  const cookieHeader = toCookieHeader(cookieJar);
  if (cookieHeader) {
    detailsHeaders.Cookie = cookieHeader;
  }

  const detailsRes = await fetch(source.caseDetailsUrl, {
    method: 'POST',
    headers: detailsHeaders,
    body: detailsForm.toString(),
    cache: 'no-store',
  });
  if (!detailsRes.ok) throw new Error(`Failed to fetch case details: ${detailsRes.status}`);
  const detailsHtml = await detailsRes.text();

  const details = parseDetails(detailsHtml);

  const [pdfBuf, xlsxBuf, orderJudgments] = await Promise.all([
    buildPdf(detailsHtml),
    buildExcel({ caseTypeLabel, caseNo, caseYear, details }),
    fetchOrderJudgments(detailsHtml, source),
  ]);

  const safeName = `${caseType}-${caseNo}-${caseYear}`.replace(/[^a-z0-9\\-_.]/gi, '_');

  return {
    city: source.city,
    caseInfo: {
      caseType: caseTypeLabel,
      caseNo,
      caseYear,
      status: infoParsed.status,
      petitionerVsRespondent: infoParsed.petitionerVsRespondent,
    },
    details,
    pdf: {
      filename: `orders-${safeName}.pdf`,
      base64: pdfBuf.toString('base64'),
    },
    excel: {
      filename: `orders-${safeName}.xlsx`,
      base64: xlsxBuf.toString('base64'),
    },
    orderJudgments,
  };
}

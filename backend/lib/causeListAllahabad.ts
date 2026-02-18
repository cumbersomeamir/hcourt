// Server-only module - ensure this is not imported in client code
if (typeof window !== 'undefined') {
  throw new Error('lib/causeListAllahabad.ts can only be used on the server');
}

import * as cheerio from 'cheerio';
import ExcelJS from 'exceljs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

const USER_AGENT = 'Mozilla/5.0';
const BASE_URL = 'https://www.allahabadhighcourt.in/causelist';
const INPUT1_URL = `${BASE_URL}/input1A.jsp`;
const INPUT2_URL = `${BASE_URL}/input2A.jsp`;
const VIEW_LIST_URL = `${BASE_URL}/viewlistA.jsp`;
const CAPTCHA_URL = `${BASE_URL}/test`;
const COUNSEL_RESULT_URL = `${BASE_URL}/counselSearchResult.jsp`;

const LIST_TYPE_LABELS: Record<string, string> = {
  D: 'Cause List',
  Z: 'Combined Cause List',
  F: 'Fresh Cases',
  U: 'Additional Cause List',
  B: 'Backlog Fresh Cases',
  S: 'Supplementary Fresh Cases',
  A: 'Applications (IA) List',
  C: 'Applications (Correction) List',
  W: 'Weekly List',
  L: 'National Lok Adalat',
};

export type CauseListDateOption = {
  value: string;
  label: string;
};

export type CauseListCourtOption = {
  value: string;
  label: string;
};

export type CauseListPdfLink = {
  label: string;
  url: string;
};

export type CauseListCourtSearchResult = {
  listType: string;
  listTypeLabel: string;
  listDate: string;
  courtNo: string;
  courtLabel: string;
  links: CauseListPdfLink[];
};

export type CauseListCounselRow = Record<string, string | number | null>;

export type CauseListCounselSearchResult = {
  listType: string;
  listTypeLabel: string;
  listDate: string;
  counselName: string;
  totalRows: number;
  previewRows: CauseListCounselRow[];
  excel: {
    filename: string;
    base64: string;
  };
};

export type CauseListPdfDownload = {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  base64: string;
};

function normalizeText(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeListType(listType?: string): string {
  const key = String(listType || 'Z').toUpperCase().trim();
  return LIST_TYPE_LABELS[key] ? key : 'Z';
}

function getListTypeLabel(listType?: string): string {
  const key = normalizeListType(listType);
  return LIST_TYPE_LABELS[key] || LIST_TYPE_LABELS.Z;
}

function validateListingDate(value: string): string {
  const date = String(value || '').trim();
  if (!/^\d{2}-\d{2}-\d{4}$/.test(date)) {
    throw new Error('Listing date must be in DD-MM-YYYY format');
  }
  return date;
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

function toAbsoluteUrl(url: string): string {
  try {
    return new URL(url, BASE_URL).toString();
  } catch {
    return url;
  }
}

function safeFileToken(value: string): string {
  return value.replace(/[^a-z0-9\-_.]/gi, '_');
}

function ensureOk(response: Response, message: string) {
  if (!response.ok) {
    throw new Error(`${message}: ${response.status}`);
  }
}

async function loadInput1Html(listType?: string): Promise<string> {
  const normalized = normalizeListType(listType);
  const form = new URLSearchParams();
  form.set('listType', normalized);

  const response = await fetch(INPUT1_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'User-Agent': USER_AGENT,
      Origin: 'https://www.allahabadhighcourt.in',
      Referer: `${BASE_URL}/indexA.html`,
    },
    body: form.toString(),
    cache: 'no-store',
  });
  ensureOk(response, 'Failed to load Allahabad cause list input page');
  return response.text();
}

async function loadCourtOptionsHtml(input: {
  listType?: string;
  listDate: string;
}): Promise<string> {
  const listType = normalizeListType(input.listType);
  const listDate = validateListingDate(input.listDate);

  const form = new URLSearchParams();
  form.set('listType', listType);
  form.set('criteria', 'court');
  form.set('listDate', listDate);

  const response = await fetch(INPUT2_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'User-Agent': USER_AGENT,
      Origin: 'https://www.allahabadhighcourt.in',
      Referer: INPUT1_URL,
    },
    body: form.toString(),
    cache: 'no-store',
  });
  ensureOk(response, 'Failed to load Allahabad court options');
  return response.text();
}

async function loadCourtResultHtml(input: {
  listType?: string;
  listDate: string;
  courtNo: string;
}): Promise<string> {
  const listType = normalizeListType(input.listType);
  const listDate = validateListingDate(input.listDate);
  const courtNo = String(input.courtNo || '').trim();
  if (!/^-?\d+$/.test(courtNo)) {
    throw new Error('Court number is invalid');
  }

  const form = new URLSearchParams();
  form.set('location', 'A');
  form.set('listType', listType);
  form.set('listDate', listDate);
  form.set('courtNo', courtNo);

  const response = await fetch(VIEW_LIST_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'User-Agent': USER_AGENT,
      Origin: 'https://www.allahabadhighcourt.in',
      Referer: INPUT2_URL,
    },
    body: form.toString(),
    cache: 'no-store',
  });
  ensureOk(response, 'Failed to fetch Allahabad court list');
  return response.text();
}

export async function fetchAllahabadCauseListDates(listType?: string): Promise<{
  listType: string;
  listTypeLabel: string;
  dates: CauseListDateOption[];
}> {
  const html = await loadInput1Html(listType);
  const $ = cheerio.load(html);
  const dates: CauseListDateOption[] = [];

  $('select[name="listDate"] option').each((_, el) => {
    const value = normalizeText($(el).attr('value') || '');
    const label = normalizeText($(el).text());
    if (!value || !label) return;
    dates.push({ value, label });
  });

  if (dates.length === 0) {
    throw new Error('No listing dates found from Allahabad cause list source');
  }

  const normalized = normalizeListType(listType);
  return {
    listType: normalized,
    listTypeLabel: getListTypeLabel(normalized),
    dates,
  };
}

export async function fetchAllahabadCourtOptions(input: {
  listType?: string;
  listDate: string;
}): Promise<{
  listType: string;
  listDate: string;
  options: CauseListCourtOption[];
}> {
  const listType = normalizeListType(input.listType);
  const listDate = validateListingDate(input.listDate);
  const html = await loadCourtOptionsHtml({ listType, listDate });
  const $ = cheerio.load(html);

  const options: CauseListCourtOption[] = [];
  $('select[name="courtNo"] option').each((_, el) => {
    const value = normalizeText($(el).attr('value') || '');
    const label = normalizeText($(el).text());
    if (!value || !label) return;
    options.push({ value, label });
  });

  if (options.length === 0) {
    throw new Error('No court numbers found for selected listing date');
  }

  return { listType, listDate, options };
}

export async function fetchAllahabadCourtPdfLinks(input: {
  listType?: string;
  listDate: string;
  courtNo: string;
}): Promise<CauseListCourtSearchResult> {
  const listType = normalizeListType(input.listType);
  const listDate = validateListingDate(input.listDate);
  const courtNo = String(input.courtNo || '').trim();
  const html = await loadCourtResultHtml({ listType, listDate, courtNo });
  const $ = cheerio.load(html);

  const links: CauseListPdfLink[] = [];
  $('a[href]').each((_, el) => {
    const href = normalizeText($(el).attr('href') || '');
    if (!href) return;
    const label = normalizeText($(el).text()) || 'List';
    const lowerHref = href.toLowerCase();
    const lowerLabel = label.toLowerCase();
    if (!lowerHref.includes('.pdf') && !lowerLabel.startsWith('list')) return;
    links.push({
      label,
      url: toAbsoluteUrl(href),
    });
  });

  const courtLabel =
    normalizeText(
      $('h6')
        .map((_, el) => normalizeText($(el).text()))
        .get()
        .find((value) => value.toLowerCase().includes('court no')) || ''
    ) || `Court No. ${courtNo}`;

  return {
    listType,
    listTypeLabel: getListTypeLabel(listType),
    listDate,
    courtNo,
    courtLabel,
    links,
  };
}

export async function downloadAllahabadCourtPdf(pdfUrl: string): Promise<CauseListPdfDownload> {
  const url = String(pdfUrl || '').trim();
  if (!url) {
    throw new Error('pdfUrl is required');
  }

  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Referer: VIEW_LIST_URL,
    },
    cache: 'no-store',
  });
  ensureOk(response, 'Failed to download cause list PDF');

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 8 || bytes.slice(0, 4).toString() !== '%PDF') {
    throw new Error('Downloaded file is not a valid PDF');
  }

  let filename = 'cause-list.pdf';
  try {
    const parsed = new URL(url);
    const token = parsed.pathname.split('/').pop() || '';
    if (token) filename = safeFileToken(token);
  } catch {
    filename = `cause-list-${Date.now()}.pdf`;
  }

  return {
    filename,
    mimeType: 'application/pdf',
    sizeBytes: bytes.length,
    base64: bytes.toString('base64'),
  };
}

function runTesseractAlphaNum(imagePath: string, psm: number): string {
  try {
    const out = execFileSync(
      'tesseract',
      [
        imagePath,
        'stdout',
        '--psm',
        String(psm),
        '-c',
        'tessedit_char_whitelist=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
      ],
      { encoding: 'utf8' }
    );
    return out.trim();
  } catch (error) {
    const e = error as { stdout?: Buffer | string };
    return String(e.stdout || '').trim();
  }
}

function buildSixCharCandidates(raw: string): string[] {
  const clean = raw.replace(/[^a-z0-9]/gi, '').toLowerCase();
  if (clean.length < 6) return [];
  if (clean.length === 6) return [clean];

  const out: string[] = [];
  for (let i = 0; i <= clean.length - 6; i++) {
    out.push(clean.slice(i, i + 6));
  }
  return out;
}

async function getCounselCaptchaCandidates(image: Buffer): Promise<string[]> {
  const tmpRoot = realpathSync(os.tmpdir());
  const workDir = mkdtempSync(path.join(tmpRoot, 'hcourt-cause-cap-'));

  try {
    const variants: Array<{ name: string; buffer: Buffer }> = [
      { name: 'orig', buffer: image },
      {
        name: 'gray',
        buffer: await sharp(image).grayscale().normalize().toBuffer(),
      },
      {
        name: 'th120',
        buffer: await sharp(image).grayscale().normalize().threshold(120).toBuffer(),
      },
      {
        name: 'th140',
        buffer: await sharp(image).grayscale().normalize().threshold(140).toBuffer(),
      },
      {
        name: 'resize3-gray',
        buffer: await sharp(image)
          .resize({ width: 450, height: 150, kernel: sharp.kernel.nearest })
          .grayscale()
          .normalize()
          .toBuffer(),
      },
      {
        name: 'resize3-th130',
        buffer: await sharp(image)
          .resize({ width: 450, height: 150, kernel: sharp.kernel.nearest })
          .grayscale()
          .normalize()
          .threshold(130)
          .toBuffer(),
      },
    ];

    const scored = new Map<string, number>();
    for (const variant of variants) {
      const file = path.join(workDir, `${variant.name}.png`);
      writeFileSync(file, variant.buffer);

      for (const psm of [7, 8, 13]) {
        const raw = runTesseractAlphaNum(file, psm);
        const candidates = buildSixCharCandidates(raw);
        for (const candidate of candidates) {
          scored.set(candidate, (scored.get(candidate) || 0) + 1);
        }
      }
    }

    return Array.from(scored.entries())
      .sort((a, b) => {
        if (a[1] !== b[1]) return b[1] - a[1];
        return a[0].localeCompare(b[0]);
      })
      .map(([candidate]) => candidate);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

function parseJsonLoose(text: string): unknown {
  const clean = text.trim();
  if (!clean) return null;
  const arrStart = clean.indexOf('[');
  const objStart = clean.indexOf('{');
  let start = -1;
  if (arrStart === -1) {
    start = objStart;
  } else if (objStart === -1) {
    start = arrStart;
  } else {
    start = Math.min(arrStart, objStart);
  }
  if (start < 0) return null;
  return JSON.parse(clean.slice(start));
}

async function initializeCounselSession(input: {
  listType: string;
  listDate: string;
  cookieJar: Map<string, string>;
}) {
  const form = new URLSearchParams();
  form.set('listType', input.listType);
  form.set('criteria', 'counsel');
  form.set('listDate', input.listDate);

  const response = await fetch(INPUT2_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'User-Agent': USER_AGENT,
      Origin: 'https://www.allahabadhighcourt.in',
      Referer: INPUT1_URL,
      Cookie: toCookieHeader(input.cookieJar),
    },
    body: form.toString(),
    cache: 'no-store',
  });
  updateCookieJar(input.cookieJar, response);
  ensureOk(response, 'Failed to initialize counsel search');
}

function normalizeCounselRows(value: unknown): CauseListCounselRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is CauseListCounselRow => !!row && typeof row === 'object');
}

async function fetchCounselRows(input: {
  listType: string;
  listDate: string;
  counselName: string;
}): Promise<CauseListCounselRow[]> {
  const cookieJar = new Map<string, string>();
  await initializeCounselSession({
    listType: input.listType,
    listDate: input.listDate,
    cookieJar,
  });

  const maxImages = 18;
  const maxCodesPerImage = 16;

  for (let imageAttempt = 1; imageAttempt <= maxImages; imageAttempt++) {
    const captchaResponse = await fetch(`${CAPTCHA_URL}?_t=${Date.now()}${imageAttempt}`, {
      headers: {
        'User-Agent': USER_AGENT,
        Referer: INPUT2_URL,
        Cookie: toCookieHeader(cookieJar),
      },
      cache: 'no-store',
    });
    updateCookieJar(cookieJar, captchaResponse);
    if (!captchaResponse.ok) continue;

    const image = Buffer.from(await captchaResponse.arrayBuffer());
    const candidates = await getCounselCaptchaCandidates(image);
    if (candidates.length === 0) continue;

    for (const code of candidates.slice(0, maxCodesPerImage)) {
      const form = new URLSearchParams();
      form.set('listingType', input.listType);
      form.set('listingDate', input.listDate);
      form.set('counselName', input.counselName);
      form.set('captchaValue', code);

      const response = await fetch(COUNSEL_RESULT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'User-Agent': USER_AGENT,
          Origin: 'https://www.allahabadhighcourt.in',
          Referer: INPUT2_URL,
          Cookie: toCookieHeader(cookieJar),
        },
        body: form.toString(),
        cache: 'no-store',
      });
      updateCookieJar(cookieJar, response);
      if (!response.ok) continue;

      const text = await response.text();
      const parsed = parseJsonLoose(text);

      if (!parsed) continue;
      if (Array.isArray(parsed)) {
        return normalizeCounselRows(parsed);
      }

      if (typeof parsed === 'object' && parsed) {
        const record = parsed as Record<string, unknown>;
        if (record.invalidSession) {
          await initializeCounselSession({
            listType: input.listType,
            listDate: input.listDate,
            cookieJar,
          });
          break;
        }
        if (record.captchaError) continue;
        if (record.error) {
          throw new Error('Source returned an error while fetching counsel cause list');
        }
      }
    }
  }

  throw new Error('Unable to solve counsel captcha automatically after multiple attempts');
}

function getOrderedCounselColumns(rows: CauseListCounselRow[]): string[] {
  const preferred = [
    'sr_no',
    'case_no',
    'petitioner_name',
    'respondent_name',
    'petitioner_advocate',
    'Extra_pet_adv',
    'respondent_advocate',
    'Extra_Res_adv',
    'court_no',
    'listing_type',
    'Bench_Name',
  ];

  const all = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) all.add(key);
  }

  const columns = preferred.filter((key) => all.has(key));
  for (const key of all) {
    if (!columns.includes(key)) columns.push(key);
  }
  return columns;
}

async function buildCounselExcel(input: {
  listTypeLabel: string;
  listDate: string;
  counselName: string;
  rows: CauseListCounselRow[];
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'hcourt';

  const summary = wb.addWorksheet('Summary');
  summary.columns = [
    { header: 'Field', key: 'field', width: 36 },
    { header: 'Value', key: 'value', width: 84 },
  ];
  summary.addRow({ field: 'Source', value: 'Allahabad Cause List (Counsel Wise)' });
  summary.addRow({ field: 'Listing Type', value: input.listTypeLabel });
  summary.addRow({ field: 'Listing Date', value: input.listDate });
  summary.addRow({ field: 'Counsel Name', value: input.counselName });
  summary.addRow({ field: 'Total Rows', value: String(input.rows.length) });

  const sheet = wb.addWorksheet('Counsel Cause List');
  if (input.rows.length === 0) {
    sheet.addRow(['No rows found']);
  } else {
    const columns = getOrderedCounselColumns(input.rows);
    sheet.columns = columns.map((key) => ({
      header: key,
      key,
      width: Math.min(60, Math.max(16, key.length + 2)),
    }));

    for (const row of input.rows) {
      const out: Record<string, string | number> = {};
      for (const col of columns) {
        const value = row[col];
        out[col] = value == null ? '' : String(value);
      }
      sheet.addRow(out);
    }
  }

  const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  return Buffer.from(buffer);
}

export async function fetchAllahabadCounselCauseList(input: {
  listType?: string;
  listDate: string;
  counselName: string;
}): Promise<CauseListCounselSearchResult> {
  const listType = normalizeListType(input.listType);
  const listDate = validateListingDate(input.listDate);
  const counselName = normalizeText(String(input.counselName || ''));

  if (counselName.length < 4) {
    throw new Error('Counsel name must be at least 4 characters');
  }

  const rows = await fetchCounselRows({
    listType,
    listDate,
    counselName,
  });

  const listTypeLabel = getListTypeLabel(listType);
  const excel = await buildCounselExcel({
    listTypeLabel,
    listDate,
    counselName,
    rows,
  });

  return {
    listType,
    listTypeLabel,
    listDate,
    counselName,
    totalRows: rows.length,
    previewRows: rows.slice(0, 15),
    excel: {
      filename: `cause-list-counsel-${safeFileToken(counselName)}-${safeFileToken(listDate)}.xlsx`,
      base64: excel.toString('base64'),
    },
  };
}

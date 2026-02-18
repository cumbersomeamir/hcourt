// Server-only module - ensure this is not imported in client code
if (typeof window !== 'undefined') {
  throw new Error('lib/causeListLucknow.ts can only be used on the server');
}

import * as cheerio from 'cheerio';
import ExcelJS from 'exceljs';

const USER_AGENT = 'Mozilla/5.0';
const BASE_URL = 'https://hclko.allahabadhighcourt.in/causelist';
const INPUT1_URL = `${BASE_URL}/input1L.jsp`;
const INPUT2_URL = `${BASE_URL}/input2L.jsp`;
const VIEW_LIST_URL = `${BASE_URL}/viewlistL.jsp`;
const COUNSEL_URL = `${BASE_URL}/counselL.jsp`;

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

export type LucknowDateOption = {
  value: string;
  label: string;
};

export type LucknowCourtOption = {
  value: string;
  label: string;
};

export type LucknowPdfLink = {
  label: string;
  url: string;
};

export type LucknowCourtSearchResult = {
  listType: string;
  listTypeLabel: string;
  listDate: string;
  courtNo: string;
  courtLabel: string;
  links: LucknowPdfLink[];
};

export type LucknowCounselRow = Record<string, string | number | null>;

export type LucknowCounselSearchResult = {
  listType: string;
  listTypeLabel: string;
  listDate: string;
  counselName: string;
  totalRows: number;
  previewRows: LucknowCounselRow[];
  excel: {
    filename: string;
    base64: string;
  };
};

export type LucknowPdfDownload = {
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
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(date)) {
    throw new Error('Listing date must be in DD/MM/YYYY format');
  }
  return date;
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

function htmlCellToTextWithLines($: cheerio.CheerioAPI, element: cheerio.Element): string {
  const clone = $(element).clone();
  clone.find('br').replaceWith('\n');
  const raw = clone.text();
  const lines = raw
    .split('\n')
    .map((line) => normalizeText(line))
    .filter(Boolean);
  return lines.join(' | ');
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
      Origin: 'https://hclko.allahabadhighcourt.in',
      Referer: `${BASE_URL}/indexL.html`,
    },
    body: form.toString(),
    cache: 'no-store',
  });
  ensureOk(response, 'Failed to load Lucknow cause list input page');
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
      Origin: 'https://hclko.allahabadhighcourt.in',
      Referer: INPUT1_URL,
    },
    body: form.toString(),
    cache: 'no-store',
  });
  ensureOk(response, 'Failed to load Lucknow court options');
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
  form.set('location', 'L');
  form.set('listType', listType);
  form.set('listDate', listDate);
  form.set('courtNo', courtNo);

  const response = await fetch(VIEW_LIST_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'User-Agent': USER_AGENT,
      Origin: 'https://hclko.allahabadhighcourt.in',
      Referer: INPUT2_URL,
    },
    body: form.toString(),
    cache: 'no-store',
  });
  ensureOk(response, 'Failed to fetch Lucknow court list');
  return response.text();
}

function parseCounselRows(html: string): LucknowCounselRow[] {
  const $ = cheerio.load(html);
  const rows: LucknowCounselRow[] = [];
  let currentCourt = '';

  $('div.row.row-border').each((_, row) => {
    const heading = normalizeText($(row).find('p.heading-stretch').first().text());
    if (heading) {
      currentCourt = heading;
      return;
    }

    const dataRow = $(row);
    if (!dataRow.hasClass('text-dark')) return;
    const cells = dataRow.children('div');
    if (cells.length < 5) return;

    const srNo = htmlCellToTextWithLines($, cells.get(0));
    const caseNo = htmlCellToTextWithLines($, cells.get(1));
    const party = htmlCellToTextWithLines($, cells.get(2));
    const petitionerAdvocate = htmlCellToTextWithLines($, cells.get(3));
    const respondentAdvocate = htmlCellToTextWithLines($, cells.get(4));

    if (!srNo && !caseNo && !party) return;

    rows.push({
      court_heading: currentCourt,
      sr_no: srNo,
      case_no: caseNo,
      party_details: party,
      petitioner_advocate: petitionerAdvocate,
      respondent_advocate: respondentAdvocate,
    });
  });

  return rows;
}

function getOrderedCounselColumns(rows: LucknowCounselRow[]): string[] {
  const preferred = [
    'court_heading',
    'sr_no',
    'case_no',
    'party_details',
    'petitioner_advocate',
    'respondent_advocate',
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
  rows: LucknowCounselRow[];
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'hcourt';

  const summary = wb.addWorksheet('Summary');
  summary.columns = [
    { header: 'Field', key: 'field', width: 36 },
    { header: 'Value', key: 'value', width: 84 },
  ];
  summary.addRow({ field: 'Source', value: 'Lucknow Cause List (Counsel Wise)' });
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

export async function fetchLucknowCauseListDates(listType?: string): Promise<{
  listType: string;
  listTypeLabel: string;
  dates: LucknowDateOption[];
}> {
  const html = await loadInput1Html(listType);
  const $ = cheerio.load(html);
  const dates: LucknowDateOption[] = [];

  $('select[name="listDate"] option').each((_, el) => {
    const value = normalizeText($(el).attr('value') || '');
    const label = normalizeText($(el).text());
    if (!value || !label) return;
    dates.push({ value, label });
  });

  if (dates.length === 0) {
    throw new Error('No listing dates found from Lucknow cause list source');
  }

  const normalized = normalizeListType(listType);
  return {
    listType: normalized,
    listTypeLabel: getListTypeLabel(normalized),
    dates,
  };
}

export async function fetchLucknowCourtOptions(input: {
  listType?: string;
  listDate: string;
}): Promise<{
  listType: string;
  listDate: string;
  options: LucknowCourtOption[];
}> {
  const listType = normalizeListType(input.listType);
  const listDate = validateListingDate(input.listDate);
  const html = await loadCourtOptionsHtml({ listType, listDate });
  const $ = cheerio.load(html);

  if (/ERROR!!!!!/i.test(html)) {
    throw new Error('Source returned an error for the selected date. Please choose another date.');
  }

  const options: LucknowCourtOption[] = [];
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

export async function fetchLucknowCourtPdfLinks(input: {
  listType?: string;
  listDate: string;
  courtNo: string;
}): Promise<LucknowCourtSearchResult> {
  const listType = normalizeListType(input.listType);
  const listDate = validateListingDate(input.listDate);
  const courtNo = String(input.courtNo || '').trim();
  const html = await loadCourtResultHtml({ listType, listDate, courtNo });
  const $ = cheerio.load(html);

  const links: LucknowPdfLink[] = [];
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
        .find((value) => value.toLowerCase().includes('court')) || ''
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

export async function downloadLucknowCourtPdf(pdfUrl: string): Promise<LucknowPdfDownload> {
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

  let filename = 'cause-list-lucknow.pdf';
  try {
    const parsed = new URL(url);
    const token = parsed.pathname.split('/').pop() || '';
    if (token) filename = safeFileToken(token);
  } catch {
    filename = `cause-list-lucknow-${Date.now()}.pdf`;
  }

  return {
    filename,
    mimeType: 'application/pdf',
    sizeBytes: bytes.length,
    base64: bytes.toString('base64'),
  };
}

export async function fetchLucknowCounselCauseList(input: {
  listType?: string;
  listDate: string;
  counselName: string;
}): Promise<LucknowCounselSearchResult> {
  const listType = normalizeListType(input.listType);
  const listDate = validateListingDate(input.listDate);
  const counselName = normalizeText(String(input.counselName || ''));
  if (counselName.length < 4) {
    throw new Error('Counsel name must be at least 4 characters');
  }

  // Keep the same source flow by opening input2 in counsel mode first.
  const initForm = new URLSearchParams();
  initForm.set('listType', listType);
  initForm.set('criteria', 'counsel');
  initForm.set('listDate', listDate);
  const initResponse = await fetch(INPUT2_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'User-Agent': USER_AGENT,
      Origin: 'https://hclko.allahabadhighcourt.in',
      Referer: INPUT1_URL,
    },
    body: initForm.toString(),
    cache: 'no-store',
  });
  ensureOk(initResponse, 'Failed to initialize Lucknow counsel search');

  const form = new URLSearchParams();
  form.set('location', 'L');
  form.set('listType', listType);
  form.set('listDate', listDate);
  form.set('FC', counselName);

  const response = await fetch(COUNSEL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'User-Agent': USER_AGENT,
      Origin: 'https://hclko.allahabadhighcourt.in',
      Referer: INPUT2_URL,
    },
    body: form.toString(),
    cache: 'no-store',
  });
  ensureOk(response, 'Failed to fetch Lucknow counsel list');
  const html = await response.text();

  if (/NO RECORD/i.test(html)) {
    const listTypeLabel = getListTypeLabel(listType);
    const excel = await buildCounselExcel({
      listTypeLabel,
      listDate,
      counselName,
      rows: [],
    });
    return {
      listType,
      listTypeLabel,
      listDate,
      counselName,
      totalRows: 0,
      previewRows: [],
      excel: {
        filename: `cause-list-lucknow-counsel-${safeFileToken(counselName)}-${safeFileToken(listDate)}.xlsx`,
        base64: excel.toString('base64'),
      },
    };
  }

  const rows = parseCounselRows(html);
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
      filename: `cause-list-lucknow-counsel-${safeFileToken(counselName)}-${safeFileToken(listDate)}.xlsx`,
      base64: excel.toString('base64'),
    },
  };
}

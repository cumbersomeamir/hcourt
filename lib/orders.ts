import * as cheerio from 'cheerio';
import ExcelJS from 'exceljs';
import { chromium } from 'playwright';

export type CaseTypeOption = { value: string; label: string };

export type OrdersFetchInput = {
  caseType: string;
  caseNo: string;
  caseYear: string;
};

export type OrdersFetchResult = {
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
};

const BASE = 'https://hclko.allahabadhighcourt.in/status';
const CASE_NUMBER_URL = `${BASE}/index.php/case-number`;
const CASE_INFO_URL = `${BASE}/index.php/get_CaseInfo`;
const CASE_DETAILS_URL = `${BASE}/index.php/get_CaseDetails`;

function normalizeText(s: string) {
  return s.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function fetchCaseTypes(): Promise<CaseTypeOption[]> {
  const res = await fetch(CASE_NUMBER_URL, {
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
  // The response includes onclick like: viewCaseData('CINO','source','iemi')
  const re = /viewCaseData\(\s*'([^']+)'\s*,\s*'([^']*)'\s*(?:,\s*'([^']*)'\s*)?\)/i;
  const m = caseInfoHtml.match(re);
  if (!m) return null;
  return { cino: m[1], source: m[2], iemi: m[3] || '' };
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
  const caseNo = input.caseNo.trim();
  const caseYear = input.caseYear.trim();
  const caseType = input.caseType.trim();
  if (!caseType) throw new Error('Missing caseType');
  if (!/^\d+$/.test(caseNo)) throw new Error('Case No must be numeric');
  if (!/^\d{4}$/.test(caseYear)) throw new Error('Case Year must be 4 digits');

  // Fetch case types to get the display label (keeps output user-friendly)
  const types = await fetchCaseTypes();
  const caseTypeLabel = types.find((t) => t.value === caseType)?.label || caseType;

  const form = new URLSearchParams();
  form.set('case_type', caseType);
  form.set('case_no', caseNo);
  form.set('case_year', caseYear);
  // Server endpoint doesn't validate captcha (client-side only), but include to mimic real form.
  form.set('captchacode', '0000');

  const infoRes = await fetch(CASE_INFO_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'User-Agent': 'Mozilla/5.0',
      'Origin': BASE,
      'Referer': CASE_NUMBER_URL,
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: form.toString(),
    cache: 'no-store',
  });
  if (!infoRes.ok) throw new Error(`Failed to fetch case info: ${infoRes.status}`);
  const caseInfoHtml = await infoRes.text();

  // When the upstream site doesn't find a record, it returns a small card with this message
  if (/Record\s+Not\s+Found/i.test(caseInfoHtml)) {
    throw new Error(`Record not found for ${caseTypeLabel} / ${caseNo} / ${caseYear}. Check Case Year/No and try again.`);
  }

  const viewParams = extractViewParams(caseInfoHtml);
  if (!viewParams) throw new Error('Could not find a "view" link in case search results');

  const infoParsed = parseCaseInfo(caseInfoHtml);

  const detailsForm = new URLSearchParams();
  detailsForm.set('cino', viewParams.cino);
  detailsForm.set('source', viewParams.source);
  if (viewParams.iemi) detailsForm.set('iemi', viewParams.iemi);

  const detailsRes = await fetch(CASE_DETAILS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'User-Agent': 'Mozilla/5.0',
      'Origin': BASE,
      'Referer': CASE_NUMBER_URL,
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: detailsForm.toString(),
    cache: 'no-store',
  });
  if (!detailsRes.ok) throw new Error(`Failed to fetch case details: ${detailsRes.status}`);
  const detailsHtml = await detailsRes.text();

  const details = parseDetails(detailsHtml);

  const [pdfBuf, xlsxBuf] = await Promise.all([
    buildPdf(detailsHtml),
    buildExcel({ caseTypeLabel, caseNo, caseYear, details }),
  ]);

  const safeName = `${caseType}-${caseNo}-${caseYear}`.replace(/[^a-z0-9\\-_.]/gi, '_');

  return {
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
  };
}


// Server-only module - ensure this is not imported in client code
if (typeof window !== 'undefined') {
  throw new Error('lib/causeListMediation.ts can only be used on the server');
}

import * as cheerio from 'cheerio';

const USER_AGENT = 'Mozilla/5.0';
const BASE_URL = 'https://www2.allahabadhighcourt.in';
const VIEW_URL = `${BASE_URL}/causelist/mediation/view.jsp`;

export type MediationListLink = {
  label: string;
  url: string;
};

export type MediationListRow = {
  date: string;
  lists: MediationListLink[];
};

export type MediationListResult = {
  allahabad: MediationListRow[];
  lucknow: MediationListRow[];
};

export type MediationDownloadResult = {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  base64: string;
};

function normalizeText(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
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

function guessMimeType(fileUrl: string): string {
  const lower = fileUrl.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.txt')) return 'text/plain; charset=utf-8';
  return 'application/octet-stream';
}

function ensureOk(response: Response, message: string) {
  if (!response.ok) {
    throw new Error(`${message}: ${response.status}`);
  }
}

function parseMediationRows($: cheerio.CheerioAPI, paneSelector: string): MediationListRow[] {
  const rows: MediationListRow[] = [];

  $(`${paneSelector} table tr`).each((_, tr) => {
    const tds = $(tr).find('td');
    if (tds.length < 2) return;

    const date = normalizeText($(tds[0]).text());
    if (!date || /date/i.test(date)) return;

    const lists: MediationListLink[] = [];
    $(tds[1])
      .find('a[href]')
      .each((__, a) => {
        const href = normalizeText($(a).attr('href') || '');
        if (!href) return;
        const label = normalizeText($(a).text()) || 'List';
        lists.push({
          label,
          url: toAbsoluteUrl(href),
        });
      });

    if (lists.length === 0) return;
    rows.push({ date, lists });
  });

  return rows;
}

export async function fetchMediationCauseLists(): Promise<MediationListResult> {
  const response = await fetch(VIEW_URL, {
    headers: {
      'User-Agent': USER_AGENT,
    },
    cache: 'no-store',
  });
  ensureOk(response, 'Failed to load mediation cause list page');
  const html = await response.text();
  const $ = cheerio.load(html);

  return {
    allahabad: parseMediationRows($, '#home'),
    lucknow: parseMediationRows($, '#menu1'),
  };
}

export async function downloadMediationListFile(fileUrl: string): Promise<MediationDownloadResult> {
  const target = String(fileUrl || '').trim();
  if (!target) {
    throw new Error('fileUrl is required');
  }

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    throw new Error('fileUrl is invalid');
  }

  if (parsed.hostname !== 'www2.allahabadhighcourt.in') {
    throw new Error('Only official mediation source downloads are allowed');
  }

  const response = await fetch(parsed.toString(), {
    headers: {
      'User-Agent': USER_AGENT,
      Referer: VIEW_URL,
    },
    cache: 'no-store',
  });
  ensureOk(response, 'Failed to download mediation file');

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) {
    throw new Error('Downloaded file is empty');
  }

  const filenameToken = parsed.pathname.split('/').filter(Boolean).pop() || '';
  const filename = filenameToken ? safeFileToken(filenameToken) : `mediation-list-${Date.now()}.bin`;
  const headerMime = normalizeText(response.headers.get('content-type') || '');
  const mimeType = headerMime || guessMimeType(parsed.toString());

  return {
    filename,
    mimeType,
    sizeBytes: bytes.length,
    base64: bytes.toString('base64'),
  };
}

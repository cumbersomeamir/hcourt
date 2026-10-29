import { courtDownloadUrl, fetchCourtDownload, readCourtDownload } from './courtDownload';
import { cachedCourtRequest } from './courtCache';
// Server-only module - ensure this is not imported in client code
if (typeof window !== 'undefined') {
  throw new Error('lib/causeListMediation.ts can only be used on the server');
}

import * as cheerio from 'cheerio';
import { uploadMediaToR2 } from './r2';

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

async function fetchMediationCauseListsSource(): Promise<MediationListResult> {
  const response = await fetch(VIEW_URL, {
    headers: {
      'User-Agent': USER_AGENT,
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(45000),
  });
  ensureOk(response, 'Failed to load mediation cause list page');
  const html = await response.text();
  const $ = cheerio.load(html);

  return {
    allahabad: parseMediationRows($, '#home'),
    lucknow: parseMediationRows($, '#menu1'),
  };
}

async function downloadMediationListFileSource(fileUrl: string): Promise<MediationDownloadResult> {
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

  const response = await fetchCourtDownload(parsed.toString(), ['www2.allahabadhighcourt.in'], {
    headers: {
      'User-Agent': USER_AGENT,
      Referer: VIEW_URL,
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(60000),
  });
  ensureOk(response, 'Failed to download mediation file');

  const bytes = await readCourtDownload(response);
  if (bytes.length === 0) {
    throw new Error('Downloaded file is empty');
  }

  const filenameToken = parsed.pathname.split('/').filter(Boolean).pop() || '';
  const filename = filenameToken ? safeFileToken(filenameToken) : `mediation-list-${Date.now()}.bin`;
  const headerMime = normalizeText(response.headers.get('content-type') || '');
  const mimeType = headerMime || guessMimeType(parsed.toString());

  void uploadMediaToR2({ bytes, filename, contentType: mimeType, folder: 'cause-lists/mediation' }).catch(() => console.warn('[cause-list] Download completed; storage copy failed.'));

  return {
    filename,
    mimeType,
    sizeBytes: bytes.length,
    base64: bytes.toString('base64'),
  };
}

export const fetchMediationCauseLists = (...args: Parameters<typeof fetchMediationCauseListsSource>) => cachedCourtRequest({
  key: ['fetchMediationCauseLists', args], source: 'www2.allahabadhighcourt.in', ttlMs: 300000, load: () => fetchMediationCauseListsSource(...args),
});

export const downloadMediationListFile = (value: string) => {
  const args: [string] = [courtDownloadUrl(value, ['www2.allahabadhighcourt.in'])];
  return cachedCourtRequest({
  key: ['downloadMediationListFile-validated', args], source: 'www2.allahabadhighcourt.in', ttlMs: 86400000, load: () => downloadMediationListFileSource(...args),
  });
};

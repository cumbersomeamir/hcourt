#!/usr/bin/env node
import http from 'node:http';

const PORT = Number(process.env.PORT || 5055);
const TOKEN = String(process.env.JUDGMENT_PROXY_TOKEN || '').trim();
const MAX_BODY_BYTES = 64 * 1024;
const USER_AGENT =
  process.env.JUDGMENT_PROXY_USER_AGENT ||
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function getSetCookieValues(headers) {
  return typeof headers.getSetCookie === 'function'
    ? headers.getSetCookie()
    : [headers.get('set-cookie')].filter(Boolean);
}

function updateCookieJar(cookieJar, response) {
  for (const raw of getSetCookieValues(response.headers)) {
    const firstPart = raw.split(';')[0]?.trim();
    if (!firstPart) continue;
    const eqIdx = firstPart.indexOf('=');
    if (eqIdx <= 0) continue;
    cookieJar.set(firstPart.slice(0, eqIdx), firstPart.slice(eqIdx + 1));
  }
}

function toCookieHeader(cookieJar) {
  return Array.from(cookieJar.entries())
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');
}

function decodeSecurityCode(token) {
  const clean = String(token || '').trim();
  if (/^\d{4,8}$/.test(clean)) return clean;

  const decoded = Buffer.from(clean, 'base64').toString('utf8').trim();
  if (/^\d{4,8}$/.test(decoded)) return decoded;

  throw new Error('Could not decode eLegalix security code');
}

function getJudgmentContext(viewUrl) {
  const parsed = new URL(viewUrl);
  const judgmentId = parsed.searchParams.get('judgmentID')?.trim() || '';
  if (!judgmentId) throw new Error('judgmentID missing from viewUrl');

  const pathParts = parsed.pathname.split('/').filter(Boolean);
  const appRoot = pathParts.length > 1 ? `/${pathParts[0]}` : '';
  if (!appRoot) throw new Error('Unsupported eLegalix URL');

  return {
    parsed,
    judgmentId,
    baseAppUrl: `${parsed.origin}${appRoot}`,
    formActionUrl: `${parsed.origin}${parsed.pathname}`,
    startPageUrl: `${parsed.origin}${appRoot}/StartWebSearch.do`,
    subseq: parsed.searchParams.get('subseq') || 'no',
  };
}

function buildFilename(judgmentId, date) {
  const safeId = judgmentId.replace(/[^a-z0-9\-_.]/gi, '_');
  const safeDate = String(date || '').replace(/[^a-z0-9\-_.]/gi, '_');
  return `order-judgment-${safeId}${safeDate ? `-${safeDate}` : ''}.pdf`;
}

async function fetchJudgmentPdf(viewUrl, date) {
  const context = getJudgmentContext(viewUrl);
  const cookieJar = new Map();

  const startRes = await fetch(context.startPageUrl, {
    headers: {
      'user-agent': USER_AGENT,
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    redirect: 'follow',
  });
  updateCookieJar(cookieJar, startRes);
  if (!startRes.ok) {
    throw new Error(`eLegalix start page failed: ${startRes.status}`);
  }

  const attempts = Number(process.env.JUDGMENT_PROXY_ATTEMPTS || 5);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const captchaRes = await fetch(
      `${context.baseAppUrl}/getData?action=generateCaptcha&_t=${Date.now()}-${attempt}`,
      {
        headers: {
          'user-agent': USER_AGENT,
          referer: context.startPageUrl,
          cookie: toCookieHeader(cookieJar),
        },
      }
    );
    updateCookieJar(cookieJar, captchaRes);
    if (!captchaRes.ok) continue;

    let securityCode = '';
    try {
      securityCode = decodeSecurityCode(await captchaRes.text());
    } catch {
      continue;
    }

    const form = new URLSearchParams();
    form.set('judgmentID', context.judgmentId);
    form.set('subseq', context.subseq);
    form.set('securitycode', securityCode);

    const fileRes = await fetch(context.formActionUrl, {
      method: 'POST',
      headers: {
        'user-agent': USER_AGENT,
        origin: context.parsed.origin,
        referer: context.startPageUrl,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf,*/*;q=0.8',
        'content-type': 'application/x-www-form-urlencoded',
        cookie: toCookieHeader(cookieJar),
      },
      body: form,
    });
    updateCookieJar(cookieJar, fileRes);

    const data = Buffer.from(await fileRes.arrayBuffer());
    const contentType = (fileRes.headers.get('content-type') || '').toLowerCase();
    if (fileRes.ok && contentType.includes('pdf') && data.subarray(0, 4).toString() === '%PDF') {
      return {
        judgmentId: context.judgmentId,
        filename: buildFilename(context.judgmentId, date),
        mimeType: 'application/pdf',
        sizeBytes: data.length,
        base64: data.toString('base64'),
      };
    }

    if (fileRes.status === 403) {
      throw new Error('eLegalix returned 403 from this proxy network');
    }
  }

  throw new Error('Could not download PDF after security-code retries');
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error('Request body too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') {
      return json(res, 200, { success: true });
    }

    if (req.method !== 'POST' || req.url !== '/judgment') {
      return json(res, 404, { success: false, error: 'not_found' });
    }

    if (TOKEN) {
      const auth = String(req.headers.authorization || '');
      if (auth !== `Bearer ${TOKEN}`) {
        return json(res, 401, { success: false, error: 'unauthorized' });
      }
    }

    const payload = JSON.parse(await readBody(req));
    const viewUrl = String(payload.viewUrl || '').trim();
    const date = String(payload.date || '').trim();
    if (!viewUrl) return json(res, 400, { success: false, error: 'viewUrl is required' });

    const result = await fetchJudgmentPdf(viewUrl, date || undefined);
    return json(res, 200, { success: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[judgment-proxy] ${message}`);
    return json(res, 502, { success: false, error: message });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[judgment-proxy] listening on ${PORT}`);
});

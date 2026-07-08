#!/usr/bin/env node

const proxyUrl = process.env.JUDGMENT_PROXY_VERIFY_URL || process.argv[2] || 'http://127.0.0.1:5055/judgment';
const token = process.env.JUDGMENT_PROXY_TOKEN || '';
const viewUrl =
  process.env.JUDGMENT_PROXY_VERIFY_VIEW_URL ||
  'https://elegalix.allahabadhighcourt.in/elegalix/WebDownloadJudgmentDocument.do?judgmentID=13416685';
const date = process.env.JUDGMENT_PROXY_VERIFY_DATE || '21-05-2026';

const headers = {
  'content-type': 'application/json',
};
if (token) headers.authorization = `Bearer ${token}`;

const response = await fetch(proxyUrl, {
  method: 'POST',
  headers,
  body: JSON.stringify({ viewUrl, date }),
});

const payload = await response.json().catch(() => null);
if (!response.ok || !payload?.success || !payload.result?.base64) {
  console.error(JSON.stringify({ status: response.status, payload }, null, 2));
  process.exit(1);
}

const header = Buffer.from(payload.result.base64, 'base64').subarray(0, 4).toString();
if (header !== '%PDF') {
  console.error(`Expected PDF header, got ${JSON.stringify(header)}`);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      success: true,
      status: response.status,
      judgmentId: payload.result.judgmentId,
      filename: payload.result.filename,
      sizeBytes: payload.result.sizeBytes,
      pdfHeader: header,
    },
    null,
    2
  )
);

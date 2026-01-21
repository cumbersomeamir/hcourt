import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import tesseract from 'node-tesseract-ocr';

type ElegalixSession = {
  cookie: string;
  judgmentId: string;
  createdAt: number;
};

const SESSIONS = new Map<string, ElegalixSession>();
const SESSION_TTL_MS = 5 * 60 * 1000;

async function solveCaptcha(imageBuf: Buffer): Promise<string> {
  // Write to temp file (node-tesseract-ocr needs file path)
  const tempFile = join(tmpdir(), `captcha-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);
  try {
    writeFileSync(tempFile, imageBuf);
    
    // Use node-tesseract-ocr (simpler, works better with Next.js)
    const text = await tesseract.recognize(tempFile, {
      lang: 'eng',
      tessedit_char_whitelist: '0123456789',
      psm: 8, // Single word
    });
    
    // Extract only digits
    const digits = text.replace(/\D/g, '');
    if (digits.length >= 6) {
      return digits.slice(0, 6);
    }
    throw new Error(`OCR failed: got "${digits}" (expected 6 digits)`);
  } finally {
    try {
      unlinkSync(tempFile);
    } catch {}
  }
}

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function cleanupSessions() {
  const now = Date.now();
  for (const [id, s] of SESSIONS.entries()) {
    if (now - s.createdAt > SESSION_TTL_MS) SESSIONS.delete(id);
  }
}

export type StartCaptchaResult = {
  sessionId: string;
  captchaImageUrl: string; // relative to /api/elegalix/captcha-image
};

export async function startCaptchaSession(judgmentId: string): Promise<StartCaptchaResult> {
  cleanupSessions();

  const url = `https://elegalix.allahabadhighcourt.in/elegalix/WebDownloadJudgmentDocument.do?judgmentID=${encodeURIComponent(
    judgmentId
  )}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Failed to load captcha page (${res.status})`);

  const setCookie = res.headers.get('set-cookie') || '';
  // Node fetch collapses cookies; keep only name=value parts
  const cookie = setCookie
    .split(',')
    .map((part) => part.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');

  if (!cookie) {
    // Still allow, but downloads may fail if cookie required
  }

  const sessionId = makeId();
  SESSIONS.set(sessionId, { cookie, judgmentId, createdAt: Date.now() });

  return {
    sessionId,
    captchaImageUrl: `/api/elegalix/captcha-image?sessionId=${encodeURIComponent(sessionId)}`,
  };
}

export async function getCaptchaImage(sessionId: string): Promise<Buffer> {
  cleanupSessions();
  const session = SESSIONS.get(sessionId);
  if (!session) throw new Error('Captcha session expired. Please retry.');

  // eLegalix JS sets: captcha_image src = /elegalix/getImage?{ts}
  const url = `https://elegalix.allahabadhighcourt.in/elegalix/getImage?${Date.now()}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      ...(session.cookie ? { Cookie: session.cookie } : {}),
    },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Failed to fetch captcha image (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

export async function downloadJudgmentWithCaptcha(sessionId: string, securityCode: string): Promise<{ buf: Buffer; contentType: string }> {
  cleanupSessions();
  const session = SESSIONS.get(sessionId);
  if (!session) throw new Error('Captcha session expired. Please retry.');

  if (!/^\d{6}$/.test(securityCode)) throw new Error('Security code must be 6 digits');

  const form = new URLSearchParams();
  form.set('judgmentID', session.judgmentId);
  form.set('subseq', 'no');
  form.set('securitycode', securityCode);

  const res = await fetch('https://elegalix.allahabadhighcourt.in/elegalix/WebDownloadJudgmentDocument.do', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0',
      ...(session.cookie ? { Cookie: session.cookie } : {}),
      Referer: `https://elegalix.allahabadhighcourt.in/elegalix/WebDownloadJudgmentDocument.do?judgmentID=${encodeURIComponent(
        session.judgmentId
      )}`,
    },
    body: form.toString(),
    cache: 'no-store',
    redirect: 'follow',
  });

  if (res.status === 429) {
    throw new Error('Upstream rate-limited. Please wait a few seconds and try again.');
  }
  if (!res.ok) throw new Error(`Upstream download failed (${res.status})`);

  const contentType = res.headers.get('content-type') || 'application/octet-stream';
  const buf = Buffer.from(await res.arrayBuffer());

  // If captcha fails, upstream returns HTML. Detect and fail loudly.
  if (contentType.includes('text/html') || buf.slice(0, 15).toString('utf8').toLowerCase().includes('<html')) {
    throw new Error('Invalid security code (captcha). Please retry.');
  }

  return { buf, contentType };
}

export async function downloadJudgmentAuto(judgmentId: string, maxRetries = 3): Promise<{ buf: Buffer; contentType: string }> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Start fresh session for each attempt to get a new captcha
      const { sessionId } = await startCaptchaSession(judgmentId);
      
      // Fetch captcha image (timestamp ensures fresh image)
      const captchaImage = await getCaptchaImage(sessionId);
      
      // Solve captcha using OCR
      const securityCode = await solveCaptcha(captchaImage);
      
      // Try to download with solved code
      return await downloadJudgmentWithCaptcha(sessionId, securityCode);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // If captcha failed, retry with fresh session
      if (attempt < maxRetries - 1) {
        // Wait a bit before retrying (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        continue;
      }
    }
  }
  
  throw lastError || new Error('Failed to download after multiple attempts');
}


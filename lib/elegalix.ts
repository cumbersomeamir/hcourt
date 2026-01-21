import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import tesseract from 'node-tesseract-ocr';
import { chromium } from 'playwright';
import sharp from 'sharp';

type ElegalixSession = {
  cookie: string;
  judgmentId: string;
  createdAt: number;
};

const SESSIONS = new Map<string, ElegalixSession>();
const SESSION_TTL_MS = 5 * 60 * 1000;

async function solveCaptcha(imageBuf: Buffer): Promise<string> {
  // Ensure buffer is complete and valid
  if (!imageBuf || imageBuf.length === 0) {
    throw new Error('Captcha image buffer is empty');
  }
  
  // Preprocess image to improve OCR accuracy
  // Try multiple preprocessing strategies
  let processedImage: Buffer;
  try {
    // Strategy 1: High contrast, binarized
    processedImage = await sharp(imageBuf)
      .greyscale() // Convert to grayscale
      .normalize() // Enhance contrast
      .threshold(140) // Binarize (black/white)
      .sharpen({ sigma: 2 }) // Sharpen edges more aggressively
      .resize(400, 150, { // Larger resize for better digit recognition
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      })
      .png()
      .toBuffer();
  } catch (err) {
    // If sharp fails, use original image
    processedImage = imageBuf;
  }
  
  // Write to temp file (node-tesseract-ocr needs file path)
  const tempFile = join(tmpdir(), `captcha-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);
  const fs = require('fs');
  
  try {
    // Write processed buffer
    writeFileSync(tempFile, processedImage, { flag: 'w' });
    
    // Small delay to ensure file system has flushed
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Verify file was written correctly
    if (!fs.existsSync(tempFile)) {
      throw new Error('Captcha image file was not created');
    }
    
    const stats = fs.statSync(tempFile);
    if (stats.size === 0) {
      throw new Error('Captcha image file is empty');
    }
    
    // Try OCR with multiple PSM modes and different preprocessing
    const psmModes = [8, 7, 6]; // 8=single word, 7=single line, 6=single block
    let bestResult: string | null = null;
    let bestLength = 0;
    
    // Try with current preprocessing
    for (const psm of psmModes) {
      try {
        const text = await tesseract.recognize(tempFile, {
          lang: 'eng',
          tessedit_char_whitelist: '0123456789',
          psm: psm,
        });
        
        // Extract only digits
        const digits = text.replace(/\D/g, '');
        
        console.log(`[OCR] PSM ${psm}: extracted "${text}" -> digits: "${digits}"`);
        
        // If we got 6 digits, use it immediately
        if (digits.length === 6) {
          console.log(`[OCR] Success with PSM ${psm}: "${digits}"`);
          return digits;
        }
        
        // Track the best result (longest digit sequence)
        if (digits.length > bestLength) {
          bestLength = digits.length;
          bestResult = digits;
        }
      } catch (err) {
        // Continue to next mode
        continue;
      }
    }
    
    // If we didn't get 6 digits, try with different preprocessing
    if (bestResult && bestResult.length < 6) {
      try {
        // Try with more aggressive preprocessing
        const enhancedImage = await sharp(imageBuf)
          .greyscale()
          .normalize({ upper: 100 }) // More aggressive normalization
          .threshold(128) // Binarize
          .sharpen({ sigma: 3, m1: 1, m2: 2 }) // More aggressive sharpening
          .resize(500, 200, { // Even larger
            fit: 'contain',
            background: { r: 255, g: 255, b: 255, alpha: 1 }
          })
          .png()
          .toBuffer();
        
        const enhancedFile = join(tmpdir(), `captcha-enhanced-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);
        writeFileSync(enhancedFile, enhancedImage, { flag: 'w' });
        await new Promise(resolve => setTimeout(resolve, 100));
        
        for (const psm of [8, 7]) {
          try {
            const text = await tesseract.recognize(enhancedFile, {
              lang: 'eng',
              tessedit_char_whitelist: '0123456789',
              psm: psm,
            });
            
            const digits = text.replace(/\D/g, '');
            console.log(`[OCR] Enhanced PSM ${psm}: extracted "${text}" -> digits: "${digits}"`);
            
            if (digits.length === 6) {
              console.log(`[OCR] Success with enhanced PSM ${psm}: "${digits}"`);
              try { unlinkSync(enhancedFile); } catch {}
              return digits;
            }
            
            if (digits.length > bestLength) {
              bestLength = digits.length;
              bestResult = digits;
            }
          } catch (err) {
            continue;
          }
        }
        
        try { unlinkSync(enhancedFile); } catch {}
      } catch (err) {
        // Ignore preprocessing errors
      }
    }
    
    // If we got 5 digits, pad with leading zero (some captchas are 5 digits)
    if (bestResult && bestResult.length === 5) {
      const padded = '0' + bestResult;
      console.log(`[OCR] Padded 5 digits to 6: "${bestResult}" -> "${padded}"`);
      return padded;
    }
    
    // If we got 4-6 digits, try to use it (might work)
    if (bestResult && bestResult.length >= 4) {
      // Pad to 6 digits with leading zeros
      const padded = bestResult.padStart(6, '0');
      console.log(`[OCR] Padded ${bestResult.length} digits to 6: "${bestResult}" -> "${padded}"`);
      return padded;
    }
    
    // If we got some digits but less than 4, try one more time with different preprocessing
    if (bestResult && bestResult.length > 0) {
      // Try with more aggressive preprocessing
      try {
        const enhancedImage = await sharp(processedImage)
          .greyscale()
          .normalize()
          .threshold(128) // Binarize
          .resize(400, 150, {
            fit: 'contain',
            background: { r: 255, g: 255, b: 255, alpha: 1 }
          })
          .png()
          .toBuffer();
        
        writeFileSync(tempFile, enhancedImage, { flag: 'w' });
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const text = await tesseract.recognize(tempFile, {
          lang: 'eng',
          tessedit_char_whitelist: '0123456789',
          psm: 8,
        });
        
        const digits = text.replace(/\D/g, '');
        if (digits.length >= 4) {
          return digits.padStart(6, '0').slice(0, 6);
        }
      } catch {
        // Ignore errors
      }
    }
    
    // If we have any result, pad it and try
    if (bestResult && bestResult.length > 0) {
      return bestResult.padStart(6, '0').slice(0, 6);
    }
    
    throw new Error(`OCR failed: could not extract sufficient digits. Best result: "${bestResult || 'none'}"`);
  } finally {
    try {
      if (fs.existsSync(tempFile)) {
        unlinkSync(tempFile);
      }
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
  
  // First request to establish session and get cookies
  const res = await fetch(url, {
    headers: { 
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br',
    },
    cache: 'no-store',
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`Failed to load captcha page (${res.status})`);

  // Extract cookies - try multiple methods
  let cookie = '';
  
  // Method 1: getSetCookie (if available in Node.js 18+)
  try {
    const setCookieHeaders = (res.headers as any).getSetCookie?.() || [];
    if (setCookieHeaders.length > 0) {
      cookie = setCookieHeaders.map((h: string) => h.split(';')[0].trim()).filter(Boolean).join('; ');
    }
  } catch {}
  
  // Method 2: get('set-cookie') - fallback
  if (!cookie) {
    const setCookie = res.headers.get('set-cookie') || '';
    if (setCookie) {
      // Handle multiple Set-Cookie headers (comma-separated or multiple headers)
      const parts = setCookie.split(',').map(p => p.trim());
      const cookies: string[] = [];
      for (const part of parts) {
        // Check if this looks like a new cookie (starts with cookie name)
        const cookiePart = part.split(';')[0].trim();
        if (cookiePart && cookiePart.includes('=')) {
          cookies.push(cookiePart);
        }
      }
      cookie = cookies.join('; ');
    }
  }
  
  // Method 3: Try to get all cookie-related headers
  if (!cookie) {
    const allHeaders = Object.fromEntries(res.headers.entries());
    const cookieHeaders: string[] = [];
    for (const [key, value] of Object.entries(allHeaders)) {
      if (key.toLowerCase() === 'set-cookie') {
        cookieHeaders.push(String(value));
      }
    }
    if (cookieHeaders.length > 0) {
      cookie = cookieHeaders.map(h => h.split(';')[0].trim()).filter(Boolean).join('; ');
    }
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

  // Use Playwright to load the page and intercept the captcha image response
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  
  try {
    const page = await context.newPage();
    
    // Intercept the getImage request to capture the image bytes
    let imageBuffer: Buffer | null = null;
    let imageResolved = false;
    
    // Set up response listener BEFORE navigation
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('/elegalix/getImage') && !imageResolved) {
        try {
          const buffer = await response.body();
          if (buffer) {
            const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
            // Verify it's a valid PNG image (PNG starts with 89 50 4E 47)
            if (buf.length > 100 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
              imageBuffer = buf;
              imageResolved = true;
              console.log(`[getCaptchaImage] Successfully intercepted image: ${imageBuffer.length} bytes`);
            }
          }
        } catch (e) {
          console.log(`[getCaptchaImage] Error intercepting image:`, e);
        }
      }
    });
    
    // Load the download page
    const pageUrl = `https://elegalix.allahabadhighcourt.in/elegalix/WebDownloadJudgmentDocument.do?judgmentID=${encodeURIComponent(session.judgmentId)}`;
    await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 30000 });
    
    // Wait for captcha image to appear and load
    try {
      await page.waitForSelector('img[src*="getImage"], img#captcha_image, img[alt*="security" i], img[alt*="captcha" i]', { timeout: 15000 });
    } catch {
      // Image selector not found, but continue anyway
    }
    
    // Wait a bit more for the image response to be intercepted
    await page.waitForTimeout(2000);
    
    // If we got the image from interception, use it
    if (imageBuffer && imageResolved) {
      await browser.close();
      return imageBuffer;
    }
    
    // If we didn't intercept it, try to get it from the img element
    if (!imageBuffer) {
      console.log(`[getCaptchaImage] Interception failed, trying direct fetch...`);
      const captchaImg = await page.$('img[src*="getImage"], img#captcha_image, img[alt*="security" i], img[alt*="captcha" i]').catch(() => null);
      if (captchaImg) {
        // Wait for image to be fully loaded
        try {
          await page.waitForFunction(
            () => {
              const img = document.querySelector('img[src*="getImage"], img#captcha_image') as HTMLImageElement;
              return img && img.complete && img.naturalWidth > 0;
            },
            { timeout: 5000 }
          );
        } catch {
          // Ignore timeout, continue anyway
        }
        
        // Get the actual image src and fetch it directly
        const imgSrc = await captchaImg.getAttribute('src');
        if (imgSrc) {
          // If it's a relative URL, make it absolute
          const fullUrl = imgSrc.startsWith('http') ? imgSrc : `https://elegalix.allahabadhighcourt.in${imgSrc.startsWith('/') ? '' : '/'}${imgSrc}`;
          
          // Fetch the image with cookies from the page
          const cookies = await context.cookies();
          const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
          
          const imgResponse = await fetch(fullUrl, {
            headers: {
              'Cookie': cookieHeader,
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
          });
          
          if (imgResponse.ok) {
            const arrayBuffer = await imgResponse.arrayBuffer();
            imageBuffer = Buffer.from(arrayBuffer);
          }
        }
        
        // Fallback: take screenshot if direct fetch failed
        if (!imageBuffer) {
          const screenshot = await captchaImg.screenshot();
          imageBuffer = Buffer.from(screenshot);
        }
      } else {
        throw new Error('Could not find captcha image element on page');
      }
    }
    
    await browser.close();
    
    if (!imageBuffer || imageBuffer.length === 0) {
      throw new Error('Failed to get captcha image - image was empty or not found');
    }
    
    // Verify it's a valid PNG
    if (imageBuffer.length < 8) {
      throw new Error(`Captcha image too small: ${imageBuffer.length} bytes`);
    }
    
    // Check PNG signature (optional - screenshot might be in different format)
    // But if it starts with PNG signature, verify it
    if (imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50 && imageBuffer[2] === 0x4E && imageBuffer[3] === 0x47) {
      // Valid PNG
      return imageBuffer;
    }
    
    // Screenshot format is fine too (Playwright screenshots are PNG)
    return imageBuffer;
  } catch (err) {
    await browser.close();
    throw err;
  }
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

export async function downloadJudgmentAuto(judgmentId: string, maxRetries = 5): Promise<{ buf: Buffer; contentType: string }> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Start fresh session for each attempt to get a new captcha
      const { sessionId } = await startCaptchaSession(judgmentId);
      
      // Fetch captcha image (timestamp ensures fresh image)
      const captchaImage = await getCaptchaImage(sessionId);
      
      // Solve captcha using OCR - try multiple times with same image
      let securityCode: string | null = null;
      for (let ocrAttempt = 0; ocrAttempt < 3; ocrAttempt++) {
        try {
          securityCode = await solveCaptcha(captchaImage);
          break; // Success
        } catch (ocrErr) {
          if (ocrAttempt === 2) throw ocrErr;
          // Wait a bit and retry OCR on same image
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      if (!securityCode) {
        throw new Error('Failed to solve captcha after multiple OCR attempts');
      }
      
      // Try to download with solved code
      console.log(`[downloadJudgmentAuto] Attempt ${attempt + 1}/${maxRetries}: Using security code "${securityCode}"`);
      return await downloadJudgmentWithCaptcha(sessionId, securityCode);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      
      // If it's a captcha validation error, retry with fresh session
      const isCaptchaError = err instanceof Error && (
        err.message.includes('Invalid security code') ||
        err.message.includes('captcha')
      );
      
      if (isCaptchaError && attempt < maxRetries - 1) {
        // Wait a bit before retrying (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)));
        continue;
      }
      
      // If it's not a captcha error or we're out of retries, throw
      if (attempt === maxRetries - 1 || !isCaptchaError) {
        throw err;
      }
    }
  }
  
  throw lastError || new Error('Failed to download after multiple attempts');
}


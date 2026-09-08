import { NextResponse } from 'next/server';
import {
  fetchOrders,
  isOrdersCaptchaRequiredError,
  refreshOrdersCaptchaChallenge,
  submitOrdersCaptchaChallenge,
} from '@/models/ordersModel';
import { getDb } from '@/lib/mongodb';
import { getLatestStatusSnapshot, saveStatusSnapshot } from '@/lib/aiStore';

// Server-only route configuration
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CacheInput = {
  city: 'lucknow' | 'allahabad';
  caseType: string;
  caseNo: string;
  caseYear: string;
};

function cachedResult(snapshot: NonNullable<Awaited<ReturnType<typeof getLatestStatusSnapshot>>>) {
  return {
    city: snapshot.city,
    caseInfo: snapshot.caseInfo,
    details: snapshot.details,
    orderJudgments: snapshot.orderJudgments,
    pdf: { filename: '', base64: '' },
    excel: { filename: '', base64: '' },
    servedFromCache: true,
    cachedAt: snapshot.fetchedAt.toISOString(),
  };
}

export async function POST(req: Request) {
  let cacheInput: CacheInput | null = null;
  try {
    const body = await req.json();

    const challengeId = String(body.challengeId || '').trim();
    const captchaCode = String(body.captchaCode || '').trim();
    const refreshCaptcha = body.refreshCaptcha === true;

    if (!challengeId) {
      cacheInput = {
        city: String(body.city || '').toLowerCase() === 'allahabad' ? 'allahabad' : 'lucknow',
        caseType: String(body.caseType || '').trim(),
        caseNo: String(body.caseNo || '').trim(),
        caseYear: String(body.caseYear || '').trim(),
      };

      try {
        const snapshot = await getLatestStatusSnapshot(await getDb(), cacheInput);
        if (snapshot && Date.now() - snapshot.fetchedAt.getTime() <= 10 * 60 * 1000) {
          return NextResponse.json({ success: true, result: cachedResult(snapshot) });
        }
      } catch {}
    }

    let result;
    if (challengeId) {
      if (refreshCaptcha) {
        const captchaChallenge = await refreshOrdersCaptchaChallenge(challengeId);
        return NextResponse.json(
          {
            success: false,
            code: 'captcha_required',
            error: 'Enter the captcha shown to continue the Allahabad search.',
            captchaChallenge,
          },
          { status: 409 }
        );
      }

      result = await submitOrdersCaptchaChallenge({
        challengeId,
        captchaCode,
      });
    } else {
      result = await fetchOrders({
        caseType: String(body.caseType || ''),
        caseNo: String(body.caseNo || ''),
        caseYear: String(body.caseYear || ''),
        city: String(body.city || 'lucknow'),
      });
    }

    if (cacheInput) {
      try {
        await saveStatusSnapshot(await getDb(), {
          caseKey: `${cacheInput.city}|${cacheInput.caseType}|${cacheInput.caseNo}|${cacheInput.caseYear}`,
          ...cacheInput,
          result,
        });
      } catch {}
    }

    return NextResponse.json({ success: true, result });
  } catch (error) {
    if (isOrdersCaptchaRequiredError(error)) {
      return NextResponse.json(
        {
          success: false,
          code: error.code,
          error: error.message,
          captchaChallenge: error.challenge,
        },
        { status: 409 }
      );
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.startsWith('Record not found for ')) {
      return NextResponse.json(
        { success: false, code: 'record_not_found', error: message },
        { status: 404 }
      );
    }

    if (cacheInput) {
      try {
        const snapshot = await getLatestStatusSnapshot(await getDb(), cacheInput);
        if (snapshot) {
          return NextResponse.json({ success: true, result: cachedResult(snapshot) });
        }
      } catch {}
    }

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

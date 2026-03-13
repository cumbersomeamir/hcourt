import { NextResponse } from 'next/server';
import {
  fetchOrders,
  isOrdersCaptchaRequiredError,
  refreshOrdersCaptchaChallenge,
  submitOrdersCaptchaChallenge,
} from '@/models/ordersModel';

// Server-only route configuration
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const challengeId = String(body.challengeId || '').trim();
    const captchaCode = String(body.captchaCode || '').trim();
    const refreshCaptcha = body.refreshCaptcha === true;

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

    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

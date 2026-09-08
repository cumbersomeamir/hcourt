import { NextResponse } from 'next/server';
import {
  CauseListCounselCaptchaRequiredError,
  fetchAllahabadCounselCauseList,
  submitAllahabadCounselCaptcha,
} from '@/models/causeListModel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const challengeId = String(body.challengeId || '').trim();
    const result = challengeId
      ? await submitAllahabadCounselCaptcha({
          challengeId,
          captchaCode: String(body.captchaCode || ''),
        })
      : await fetchAllahabadCounselCauseList({
          listType: String(body.listType || 'Z'),
          listDate: String(body.listDate || ''),
          counselName: String(body.counselName || ''),
        });
    return NextResponse.json({ success: true, result });
  } catch (error) {
    if (error instanceof CauseListCounselCaptchaRequiredError) {
      return NextResponse.json(
        { success: false, code: error.code, error: error.message, captchaChallenge: error.challenge },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';
import { startCaptchaSession } from '@/lib/elegalix';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const judgmentId = String(body.judgmentId || '').trim();
    if (!/^\d+$/.test(judgmentId)) {
      return NextResponse.json({ success: false, error: 'judgmentId must be numeric' }, { status: 400 });
    }
    const result = await startCaptchaSession(judgmentId);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}


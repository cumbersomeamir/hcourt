import { NextResponse } from 'next/server';
import { downloadJudgmentWithCaptcha } from '@/lib/elegalix';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const sessionId = String(body.sessionId || '').trim();
    const securityCode = String(body.securityCode || '').trim();
    if (!sessionId) {
      return NextResponse.json({ success: false, error: 'sessionId is required' }, { status: 400 });
    }
    const { buf, contentType } = await downloadJudgmentWithCaptcha(sessionId, securityCode);
    return new NextResponse(buf, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="judgment-${Date.now()}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    const status = msg.toLowerCase().includes('rate-limit') ? 429 : 400;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}


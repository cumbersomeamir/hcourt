import { NextResponse } from 'next/server';
import {
  downloadOrderJudgment,
  isOrderJudgmentPendingError,
} from '@/models/ordersModel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const viewUrl = String(body.viewUrl || '').trim();
    const date = String(body.date || '').trim();

    if (!viewUrl) {
      return NextResponse.json(
        { success: false, error: 'viewUrl is required' },
        { status: 400 }
      );
    }

    const result = await downloadOrderJudgment(viewUrl, date || undefined);
    return NextResponse.json({ success: true, result });
  } catch (error) {
    if (isOrderJudgmentPendingError(error)) {
      return NextResponse.json(
        {
          success: false,
          code: error.code,
          error: error.message,
          retryAfterMs: error.retryAfterMs,
        },
        { status: 202 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        code: 'document_download_failed',
        error: 'Could not prepare this court PDF right now. Please retry shortly.',
      },
      { status: 502 }
    );
  }
}

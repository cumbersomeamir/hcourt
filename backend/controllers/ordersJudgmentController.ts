import { NextResponse } from 'next/server';
import { OrderJudgmentSourceBusyError } from '@/lib/orders';
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
    if (error instanceof OrderJudgmentSourceBusyError) {
      return NextResponse.json({ success: false, code: error.code, error: error.message, retryAfterMs: error.retryAfterMs }, {
        status: 503, headers: { 'Retry-After': String(Math.ceil(error.retryAfterMs / 1000)) },
      });
    }
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
        error: 'The original order/judgment PDF is unavailable from the court. No case-status report has been substituted. Please retry later.',
      },
      { status: 502 }
    );
  }
}

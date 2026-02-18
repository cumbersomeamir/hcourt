import { NextResponse } from 'next/server';
import { downloadAllahabadCourtPdf } from '@/models/causeListModel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const pdfUrl = String(body.pdfUrl || '').trim();
    if (!pdfUrl) {
      return NextResponse.json(
        { success: false, error: 'pdfUrl is required' },
        { status: 400 }
      );
    }

    const result = await downloadAllahabadCourtPdf(pdfUrl);
    return NextResponse.json({ success: true, result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

import { rateLimit, readRequestJson } from '@/lib/requestSecurity';
import { NextResponse } from 'next/server';
import { downloadLucknowCourtPdf } from '@/models/causeListModel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const limited = await rateLimit('court-downloads', 300);
    if (limited) return limited;
    const body = await readRequestJson(req, 10000);
    const pdfUrl = String(body.pdfUrl || '').trim();
    if (!pdfUrl) {
      return NextResponse.json(
        { success: false, error: 'pdfUrl is required' },
        { status: 400 }
      );
    }

    const result = await downloadLucknowCourtPdf(pdfUrl);
    if (req.headers.get('accept')?.includes('application/octet-stream')) {
      return new Response(Buffer.from(result.base64, 'base64'), { headers: {
        'Content-Type': result.mimeType,
        'Content-Disposition': `attachment; filename="${result.filename.replace(/["\r\n]/g, '_')}"`,
        'Cache-Control': 'private, no-store',
      } });
    }
    return NextResponse.json({ success: true, result });
  } catch (error) {
    if (error instanceof Error && /Only official court|Invalid URL/.test(error.message)) return NextResponse.json({ success: false, error: 'Invalid court document URL.' }, { status: 400 });
    if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)) {
      return NextResponse.json({ success: false, error: 'The court download took too long. Please retry or choose an individual court instead of All Courts.' }, { status: 504 });
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

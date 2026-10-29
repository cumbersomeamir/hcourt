import { NextResponse } from 'next/server';
import { downloadMediationListFile } from '@/models/causeListModel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const fileUrl = String(body.fileUrl || '').trim();
    if (!fileUrl) {
      return NextResponse.json(
        { success: false, error: 'fileUrl is required' },
        { status: 400 }
      );
    }

    const result = await downloadMediationListFile(fileUrl);
    if (req.headers.get('accept')?.includes('application/octet-stream')) {
      return new Response(Buffer.from(result.base64, 'base64'), { headers: {
        'Content-Type': result.mimeType,
        'Content-Disposition': `attachment; filename="${result.filename.replace(/["\r\n]/g, '_')}"`,
        'Cache-Control': 'private, no-store',
      } });
    }
    return NextResponse.json({ success: true, result });
  } catch (error) {
    if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)) {
      return NextResponse.json({ success: false, error: 'The court download took too long. Please retry or choose an individual court instead of All Courts.' }, { status: 504 });
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

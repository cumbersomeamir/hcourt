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
    return NextResponse.json({ success: true, result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

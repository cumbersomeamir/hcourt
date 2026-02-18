import { NextResponse } from 'next/server';
import { fetchLucknowCounselCauseList } from '@/models/causeListModel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = await fetchLucknowCounselCauseList({
      listType: String(body.listType || 'Z'),
      listDate: String(body.listDate || ''),
      counselName: String(body.counselName || ''),
    });
    return NextResponse.json({ success: true, result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

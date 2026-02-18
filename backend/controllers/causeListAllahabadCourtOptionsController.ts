import { NextResponse } from 'next/server';
import { fetchAllahabadCourtOptions } from '@/models/causeListModel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const listType = String(body.listType || 'Z');
    const listDate = String(body.listDate || '');
    const result = await fetchAllahabadCourtOptions({ listType, listDate });
    return NextResponse.json({ success: true, result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';
import { fetchLucknowCauseListDates } from '@/models/causeListModel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const listType = searchParams.get('listType') || 'Z';
    const result = await fetchLucknowCauseListDates(listType);
    return NextResponse.json({ success: true, result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

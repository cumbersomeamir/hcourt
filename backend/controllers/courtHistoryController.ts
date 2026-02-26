import { NextResponse } from 'next/server';
import { getDb } from '@/models/mongodbModel';
import { appendCourtHistorySnapshot, getCourtHistory } from '@/lib/courtHistory';
import { CourtCase } from '@/types/court';

// Server-only route configuration
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function getUtcDateString(date: Date): string {
  return date.toISOString().split('T')[0];
}

function isCourtCase(value: unknown): value is CourtCase {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.courtNo === 'string' &&
    typeof item.isInSession === 'boolean' &&
    ('serialNo' in item) &&
    ('list' in item) &&
    ('progress' in item)
  );
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const courtNo = (searchParams.get('courtNo') || '').trim();
    const dateParam = (searchParams.get('date') || '').trim();
    const limitParam = parseInt(searchParams.get('limit') || '200', 10);

    if (!courtNo) {
      return NextResponse.json(
        { success: false, error: 'courtNo is required' },
        { status: 400 }
      );
    }

    const date = DATE_RE.test(dateParam) ? dateParam : getUtcDateString(new Date());
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(limitParam, 1), 500)
      : 200;

    const db = await getDb();
    const history = await getCourtHistory({ db, courtNo, date, limit });

    return NextResponse.json({
      success: true,
      courtNo,
      date,
      count: history.length,
      history,
    });
  } catch (error) {
    console.error('Error fetching court history:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const date = typeof body?.date === 'string' ? body.date.trim() : '';
    const source = typeof body?.source === 'string' && body.source.trim()
      ? body.source.trim()
      : 'api';
    const timestamp = body?.timestamp ? new Date(body.timestamp) : new Date();
    const courtsRaw = Array.isArray(body?.courts) ? body.courts : [];
    const courts = courtsRaw.filter(isCourtCase) as CourtCase[];

    if (!DATE_RE.test(date)) {
      return NextResponse.json(
        { success: false, error: 'date must be in YYYY-MM-DD format' },
        { status: 400 }
      );
    }

    if (Number.isNaN(timestamp.getTime())) {
      return NextResponse.json(
        { success: false, error: 'timestamp is invalid' },
        { status: 400 }
      );
    }

    if (courts.length === 0) {
      return NextResponse.json(
        { success: false, error: 'courts array is required' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const inserted = await appendCourtHistorySnapshot({
      db,
      date,
      timestamp,
      courts,
      source,
    });

    return NextResponse.json({
      success: true,
      date,
      inserted,
    });
  } catch (error) {
    console.error('Error saving court history:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

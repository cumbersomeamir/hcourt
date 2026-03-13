import { NextResponse } from 'next/server';
import { getDb } from '@/models/mongodbModel';
import { syncSchedule } from '@/lib/scheduleSync';

// Server-only route configuration
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = await getDb();
    const result = await syncSchedule({
      db,
      force: true,
      source: 'schedule_api',
      runTrackedOrders: false,
    });

    return NextResponse.json({
      success: true,
      date: result.schedule.date,
      lastUpdated: result.schedule.lastUpdated,
      courts: result.schedule.courts,
      stale: result.stale,
      warning: result.warning,
    });
  } catch (error) {
    console.error('Error fetching schedule:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

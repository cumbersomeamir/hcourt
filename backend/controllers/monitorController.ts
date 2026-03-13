import { NextResponse } from 'next/server';
import { getDb } from '@/models/mongodbModel';
import { syncSchedule } from '@/lib/scheduleSync';

// Server-only route configuration - skip build-time analysis
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function POST() {
  try {
    const db = await getDb();
    const result = await syncSchedule({
      db,
      force: true,
      source: 'monitor_api',
    });

    return NextResponse.json({
      success: true,
      changesDetected: result.changes.length,
      changes: result.changes,
      notifications: result.notificationsCreated,
      trackedOrders: result.trackedOrders,
      timestamp: result.schedule.lastUpdated,
      stale: result.stale,
      warning: result.warning,
    });
  } catch (error) {
    console.error('Error monitoring changes:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

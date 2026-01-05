import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';

export async function GET() {
  try {
    const db = await getDb();
    const scheduleCollection = db.collection('schedules');

    const latestSchedule = await scheduleCollection
      .findOne({}, { sort: { lastUpdated: -1 } });

    if (!latestSchedule) {
      return NextResponse.json({
        success: false,
        error: 'No schedule found',
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      schedule: latestSchedule,
    });
  } catch (error) {
    console.error('Error fetching latest schedule:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}


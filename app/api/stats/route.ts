import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';

export async function GET() {
  try {
    const db = await getDb();
    
    const schedulesCount = await db.collection('schedules').countDocuments();
    const changesCount = await db.collection('changes').countDocuments();
    const notificationsCount = await db.collection('notifications').countDocuments();
    
    const latestSchedule = await db.collection('schedules')
      .findOne({}, { sort: { lastUpdated: -1 } });
    
    const latestChanges = await db.collection('changes')
      .find({}, { sort: { timestamp: -1 }, limit: 5 })
      .toArray();

    return NextResponse.json({
      success: true,
      stats: {
        schedules: schedulesCount,
        changes: changesCount,
        notifications: notificationsCount,
        latestScheduleDate: latestSchedule?.lastUpdated || null,
        latestChangesCount: latestChanges.length,
      },
      latestChanges: latestChanges.map(c => ({
        timestamp: c.timestamp,
        courtNo: c.courtNo,
        changeType: c.changeType,
        description: c.description,
      })),
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}



import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';

/**
 * Setup database indexes for optimal performance
 * Run this once to create indexes
 */
export async function POST() {
  try {
    const db = await getDb();

    // Indexes for schedules collection
    await db.collection('schedules').createIndex({ lastUpdated: -1 });
    await db.collection('schedules').createIndex({ date: 1 });

    // Indexes for changes collection
    await db.collection('changes').createIndex({ timestamp: -1 });
    await db.collection('changes').createIndex({ courtNo: 1, timestamp: -1 });
    await db.collection('changes').createIndex({ changeType: 1, timestamp: -1 });

    // Indexes for notifications collection
    await db.collection('notifications').createIndex({ timestamp: -1 });
    await db.collection('notifications').createIndex({ read: 1, timestamp: -1 });
    await db.collection('notifications').createIndex({ courtNo: 1, timestamp: -1 });

    // Indexes for monitoring_logs collection
    await db.collection('monitoring_logs').createIndex({ timestamp: -1 });

    return NextResponse.json({
      success: true,
      message: 'Database indexes created successfully',
    });
  } catch (error) {
    console.error('Error setting up database indexes:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}


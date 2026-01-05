import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const unreadOnly = searchParams.get('unreadOnly') === 'true';
    const limit = parseInt(searchParams.get('limit') || '50');

    const db = await getDb();
    const notificationsCollection = db.collection('notifications');

    const query: any = {};
    if (unreadOnly) {
      query.read = false;
    }

    const notifications = await notificationsCollection
      .find(query)
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();

    return NextResponse.json({
      success: true,
      count: notifications.length,
      notifications,
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { notificationIds, read } = body;

    if (!Array.isArray(notificationIds) || typeof read !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const notificationsCollection = db.collection('notifications');

    const { ObjectId } = await import('mongodb');
    const objectIds = notificationIds.map((id: string) => new ObjectId(id));

    await notificationsCollection.updateMany(
      { _id: { $in: objectIds } },
      { $set: { read } }
    );

    return NextResponse.json({
      success: true,
      updated: notificationIds.length,
    });
  } catch (error) {
    console.error('Error updating notifications:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}


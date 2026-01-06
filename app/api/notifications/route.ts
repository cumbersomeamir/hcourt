import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const unreadOnly = searchParams.get('unreadOnly') === 'true';
    const limit = parseInt(searchParams.get('limit') || '50');
    const caseIdsParam = searchParams.get('caseIds');
    const userId = searchParams.get('userId');

    // Get tracked case IDs
    let trackedCaseIds: string[] = [];
    
    if (caseIdsParam) {
      // Parse from query parameter (comma-separated)
      trackedCaseIds = caseIdsParam.split(',').map(id => id.trim().toUpperCase()).filter(Boolean);
    } else if (userId) {
      // Fetch from user account
      const db = await getDb();
      const usersCollection = db.collection('users');
      const { ObjectId } = await import('mongodb');
      
      try {
        const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
        if (user && user.caseIds) {
          trackedCaseIds = user.caseIds.map((id: string) => id.toUpperCase());
        }
      } catch {
        // Invalid ObjectId, continue without filtering
      }
    }

    const db = await getDb();
    const notificationsCollection = db.collection('notifications');
    const changesCollection = db.collection('changes');

    const query: { read?: boolean } = {};
    if (unreadOnly) {
      query.read = false;
    }

    // Fetch notifications
    let notifications = await notificationsCollection
      .find(query)
      .sort({ timestamp: -1 })
      .limit(limit * 2) // Fetch more to filter later
      .toArray();

    // Filter by tracked case IDs if any are provided
    if (trackedCaseIds.length > 0) {
      // We need to check the change records to see which case IDs they relate to
      const changeRecordIds = notifications
        .map((n: { changeRecordId?: string }) => n.changeRecordId)
        .filter(Boolean) as string[];

      if (changeRecordIds.length > 0) {
        const { ObjectId } = await import('mongodb');
        const changeRecords = await changesCollection
          .find({
            _id: { $in: changeRecordIds.map((id: string) => new ObjectId(id)) },
          })
          .toArray();

        const changeRecordMap = new Map(
          changeRecords.map((cr: { _id: { toString: () => string }; oldValue?: { caseDetails?: { caseNumber?: string } }; newValue?: { caseDetails?: { caseNumber?: string } } }) => [cr._id.toString(), cr])
        );

        // Filter notifications based on whether their change records match tracked case IDs
        notifications = notifications.filter((notification: { changeRecordId?: string }) => {
          if (!notification.changeRecordId) {
            return false; // Skip notifications without change records
          }

          const changeRecord = changeRecordMap.get(notification.changeRecordId);
          if (!changeRecord) {
            return false;
          }

          // Check both old and new values for case numbers
          const oldCaseNumber = changeRecord.oldValue?.caseDetails?.caseNumber?.toUpperCase();
          const newCaseNumber = changeRecord.newValue?.caseDetails?.caseNumber?.toUpperCase();

          return (
            (oldCaseNumber && trackedCaseIds.includes(oldCaseNumber)) ||
            (newCaseNumber && trackedCaseIds.includes(newCaseNumber))
          );
        });

        // Limit after filtering
        notifications = notifications.slice(0, limit);
      } else {
        // No change records, return empty array
        notifications = [];
      }
    }

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


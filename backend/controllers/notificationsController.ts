import { NextResponse } from 'next/server';
import { getDb } from '@/models/mongodbModel';
import { Document, ObjectId, WithId } from 'mongodb';
import { ChangeRecord } from '@/types/court';
import { normalizeCaseIds, normalizeTrackedOrderCases } from '@/lib/tracking';
import { monitorTrackedOrderCasesByKeys } from '@/lib/trackedOrdersMonitor';

// Server-only route configuration
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const unreadOnly = searchParams.get('unreadOnly') === 'true';
    const limit = parseInt(searchParams.get('limit') || '50');
    const caseIdsParam = searchParams.get('caseIds');
    const orderTrackingKeysParam = searchParams.get('orderTrackingKeys');
    const userId = searchParams.get('userId');

    // Get tracked filters
    let trackedCaseIds: string[] = [];
    let trackedOrderTrackingKeys: string[] = [];

    if (caseIdsParam) {
      // Parse from query parameter (comma-separated)
      trackedCaseIds = normalizeCaseIds(caseIdsParam.split(','));
    }
    if (orderTrackingKeysParam) {
      trackedOrderTrackingKeys = orderTrackingKeysParam
        .split(',')
        .map((key) => key.trim())
        .filter(Boolean);
    }

    if (!caseIdsParam && !orderTrackingKeysParam && userId) {
      // Fetch from user account
      const db = await getDb();
      const usersCollection = db.collection('users');

      try {
        const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
        if (user) {
          trackedCaseIds = normalizeCaseIds(user.caseIds);
          trackedOrderTrackingKeys = normalizeTrackedOrderCases(user.trackedOrderCases).map(
            (trackedCase) => trackedCase.trackingKey
          );
        }
      } catch {
        // Invalid ObjectId, continue without filtering
      }
    }

    const db = await getDb();
    const notificationsCollection = db.collection('notifications');
    const changesCollection = db.collection('changes');

    if (trackedOrderTrackingKeys.length > 0) {
      await monitorTrackedOrderCasesByKeys(db, trackedOrderTrackingKeys, {
        minCheckIntervalMs: 30000,
      });
    }

    const query: { read?: boolean } = {};
    if (unreadOnly) {
      query.read = false;
    }

    // Fetch notifications
    let notifications = await notificationsCollection
      .find(query)
      .sort({ timestamp: -1 })
      .limit(limit * 3) // Fetch more to filter later
      .toArray() as WithId<Document>[];

    const hasCaseFilter = trackedCaseIds.length > 0;
    const hasOrderFilter = trackedOrderTrackingKeys.length > 0;
    const hasTrackedFilters = hasCaseFilter || hasOrderFilter;

    // Filter by tracked entities if any are provided
    if (hasTrackedFilters) {
      const trackedCaseIdSet = new Set(trackedCaseIds);
      const trackedOrderKeySet = new Set(trackedOrderTrackingKeys);

      const changeRecordMap = new Map<string, ChangeRecord>();
      if (hasCaseFilter) {
        const changeRecordObjectIds = notifications
          .map((n) => String(n.changeRecordId || '').trim())
          .filter(Boolean)
          .map((id) => {
            try {
              return new ObjectId(id);
            } catch {
              return null;
            }
          })
          .filter((id): id is ObjectId => Boolean(id));

        if (changeRecordObjectIds.length > 0) {
          const changeRecords = await changesCollection
            .find({
              _id: { $in: changeRecordObjectIds },
            })
            .toArray();

          for (const changeRecord of changeRecords) {
            changeRecordMap.set(
              changeRecord._id.toString(),
              changeRecord as unknown as ChangeRecord
            );
          }
        }
      }

      notifications = notifications.filter((notification) => {
        if (notification.type === 'order_update') {
          if (!hasOrderFilter) return false;
          const trackingKey = String(notification.orderTrackingKey || '').trim();
          return Boolean(trackingKey && trackedOrderKeySet.has(trackingKey));
        }

        if (!hasCaseFilter) return false;
        const changeRecordId = String(notification.changeRecordId || '').trim();
        if (!changeRecordId) return false;

        const changeRecord = changeRecordMap.get(changeRecordId);
        if (!changeRecord) return false;

        const oldCaseNumber = changeRecord.oldValue?.caseDetails?.caseNumber?.toUpperCase();
        const newCaseNumber = changeRecord.newValue?.caseDetails?.caseNumber?.toUpperCase();

        return (
          (oldCaseNumber && trackedCaseIdSet.has(oldCaseNumber)) ||
          (newCaseNumber && trackedCaseIdSet.has(newCaseNumber))
        );
      });
    }

    notifications = notifications.slice(0, limit);

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

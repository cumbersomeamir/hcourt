import { NextResponse } from 'next/server';
import { parseCourtSchedule } from '@/lib/parser';
import { detectChanges } from '@/lib/changeDetector';
import { getDb } from '@/lib/mongodb';
import { CourtCase, ChangeRecord, Notification } from '@/types/court';

const COURT_VIEW_URL = 'https://courtview2.allahabadhighcourt.in/courtview/CourtViewLucknow.do';

export async function POST() {
  try {
    // Fetch the latest schedule
    const response = await fetch(COURT_VIEW_URL, {
      next: { revalidate: 0 },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.statusText}`);
    }

    const html = await response.text();
    const newCourts = parseCourtSchedule(html);

    const db = await getDb();
    const scheduleCollection = db.collection('schedules');
    const changesCollection = db.collection('changes');
    const notificationsCollection = db.collection('notifications');

    // Get the most recent schedule from DB
    const lastSchedule = await scheduleCollection
      .findOne({}, { sort: { lastUpdated: -1 } });

    let changes: ChangeRecord[] = [];
    let notifications: Notification[] = [];

    if (lastSchedule && lastSchedule.courts) {
      const oldCourts: CourtCase[] = lastSchedule.courts;
      changes = detectChanges(oldCourts, newCourts);

      // Save changes to database
      if (changes.length > 0) {
        await changesCollection.insertMany(changes as any);

        // Create notifications from changes
        notifications = changes.map((change) => {
          let title = '';
          let message = '';

          switch (change.changeType) {
            case 'added':
              title = `New Case Added - Court ${change.courtNo}`;
              message = change.description;
              if (change.newValue?.caseDetails) {
                message += `\nCase: ${change.newValue.caseDetails.caseNumber}`;
                message += `\nTitle: ${change.newValue.caseDetails.title}`;
              }
              break;
            case 'updated':
              title = `Case Updated - Court ${change.courtNo}`;
              message = change.description;
              if (change.newValue?.caseDetails) {
                message += `\nCase: ${change.newValue.caseDetails.caseNumber}`;
                if (change.newValue.progress) {
                  message += `\nProgress: ${change.newValue.progress}`;
                }
              }
              break;
            case 'removed':
              title = `Case Removed - Court ${change.courtNo}`;
              message = change.description;
              break;
            case 'status_changed':
              title = `Status Changed - Court ${change.courtNo}`;
              message = change.description;
              break;
          }

          return {
            timestamp: change.timestamp,
            courtNo: change.courtNo,
            type: change.changeType === 'status_changed' ? 'status_change' : change.changeType === 'added' ? 'new_case' : 'change',
            title,
            message,
            changeRecordId: change._id?.toString(),
            read: false,
          } as Notification;
        });

        // Save notifications
        if (notifications.length > 0) {
          await notificationsCollection.insertMany(notifications as any);
        }
      }
    }

    // Save the new schedule
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const courtsToStore: CourtCase[] = newCourts.map(court => ({
      ...court,
      caseDetails: court.caseDetails,
    }));

    await scheduleCollection.insertOne({
      date: dateStr,
      lastUpdated: now,
      courts: courtsToStore,
    });

    return NextResponse.json({
      success: true,
      changesDetected: changes.length,
      changes,
      notifications: notifications.length,
      timestamp: now,
    });
  } catch (error) {
    console.error('Error monitoring changes:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}


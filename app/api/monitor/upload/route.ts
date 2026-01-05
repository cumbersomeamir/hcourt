import { NextResponse } from 'next/server';
import { parseCourtSchedule } from '@/lib/parser';
import { detectChanges } from '@/lib/changeDetector';
import { getDb } from '@/lib/mongodb';
import { generateChangeKey } from '@/lib/utils';
import { CourtCase, ChangeRecord, Notification } from '@/types/court';

/**
 * Upload HTML from client for monitoring changes
 * This bypasses Vercel's SSL issues by having the browser fetch directly
 */
export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const { html } = body;

    if (!html || typeof html !== 'string') {
      return NextResponse.json(
        { success: false, error: 'HTML content is required' },
        { status: 400 }
      );
    }

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
    let duplicatesSkipped = 0;

    if (lastSchedule && lastSchedule.courts) {
      const oldCourts: CourtCase[] = lastSchedule.courts;
      changes = detectChanges(oldCourts, newCourts);

      // Deduplicate changes
      if (changes.length > 0) {
        const now = new Date();
        const oneMinuteAgo = new Date(now.getTime() - 60000);
        
        const existingChanges = await changesCollection
          .find({
            timestamp: { $gte: oneMinuteAgo },
            courtNo: { $in: changes.map(c => c.courtNo) },
          })
          .toArray();

        const existingKeys = new Set(
          existingChanges.map(c => 
            generateChangeKey(
              c.courtNo,
              c.changeType,
              c.newValue?.caseDetails?.caseNumber || c.oldValue?.caseDetails?.caseNumber,
              c.timestamp
            )
          )
        );

        const uniqueChanges = changes.filter(change => {
          const changeKey = generateChangeKey(
            change.courtNo,
            change.changeType,
            change.newValue?.caseDetails?.caseNumber || change.oldValue?.caseDetails?.caseNumber,
            change.timestamp
          );
          
          if (existingKeys.has(changeKey)) {
            duplicatesSkipped++;
            return false;
          }
          return true;
        });

        changes = uniqueChanges;

        if (changes.length > 0) {
          const changesToInsert = changes.map(({ _id: _, ...change }) => change);
          await changesCollection.insertMany(changesToInsert);

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

          if (notifications.length > 0) {
            const notificationsToInsert = notifications.map(({ _id: _, ...notification }) => notification);
            await notificationsCollection.insertMany(notificationsToInsert);
          }
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

    const duration = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      changesDetected: changes.length,
      duplicatesSkipped,
      notifications: notifications.length,
      timestamp: now,
      duration: `${duration}ms`,
    });
  } catch (error) {
    console.error('Error in monitoring upload:', error);
    
    try {
      const db = await getDb();
      await db.collection('monitoring_logs').insertOne({
        timestamp: new Date(),
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        duration: Date.now() - startTime,
      });
    } catch (logError) {
      console.error('Failed to log error:', logError);
    }

    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      },
      { status: 500 }
    );
  }
}


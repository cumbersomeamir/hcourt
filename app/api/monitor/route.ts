import { NextResponse } from 'next/server';
import { parseCourtSchedule } from '@/lib/parser';
import { detectChanges } from '@/lib/changeDetector';
import { getDb } from '@/lib/mongodb';
import { retryWithBackoff, generateChangeKey } from '@/lib/utils';
import { CourtCase, ChangeRecord, Notification } from '@/types/court';

const COURT_VIEW_URL = 'https://courtview2.allahabadhighcourt.in/courtview/CourtViewLucknow.do';

/**
 * Monitoring endpoint (can be called from frontend or backend)
 * Uses retry logic and deduplication for robustness
 */
export async function POST() {
  const startTime = Date.now();

  try {
    // Fetch the latest schedule with retry logic
    const html = await retryWithBackoff(async () => {
      const response = await fetch(COURT_VIEW_URL, {
        next: { revalidate: 0 },
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; CourtMonitor/1.0)',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
      }

      return await response.text();
    }, 3, 1000);

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

      // Deduplicate changes - check if same change was recorded in last minute
      if (changes.length > 0) {
        const now = new Date();
        const oneMinuteAgo = new Date(now.getTime() - 60000);
        
        const existingChanges = await changesCollection
          .find({
            timestamp: { $gte: oneMinuteAgo },
            courtNo: { $in: changes.map(c => c.courtNo) },
          })
          .toArray();

        // Create set of existing change keys
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

        // Filter out duplicates
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

        // Save changes to database
        if (changes.length > 0) {
          // Remove _id field before inserting (MongoDB will generate it)
          const changesToInsert = changes.map(({ _id: _, ...change }) => change);
          await changesCollection.insertMany(changesToInsert);

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
            // Remove _id field before inserting (MongoDB will generate it)
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
      changes,
      notifications: notifications.length,
      timestamp: now,
      duration: `${duration}ms`,
    });
  } catch (error) {
    console.error('Error monitoring changes:', error);
    
    // Log error to database
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

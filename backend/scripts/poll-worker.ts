#!/usr/bin/env node
/**
 * Background polling worker for schedule monitoring
 * Runs independently of Next.js, polls every 30 seconds
 */

import { parseCourtSchedule } from '../lib/parser';
import { detectChanges } from '../lib/changeDetector';
import { getDb } from '../lib/mongodb';
import { CourtCase, ChangeRecord, Notification } from '../types/court';
import { Document } from 'mongodb';

const COURT_VIEW_URL = 'https://courtview2.allahabadhighcourt.in/courtview/CourtViewLucknow.do';
const POLL_INTERVAL_MS = 30000; // 30 seconds

let isRunning = false;
let pollTimeout: NodeJS.Timeout | null = null;

async function pollSchedule() {
  if (isRunning) {
    console.log('[Worker] Previous poll still running, skipping...');
    return;
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    console.log(`[Worker] Starting poll at ${new Date().toISOString()}`);

    // Fetch the latest schedule
    const response = await fetch(COURT_VIEW_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
      cache: 'no-store',
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
    const lastSchedule = await scheduleCollection.findOne({}, { sort: { lastUpdated: -1 } });

    let changes: ChangeRecord[] = [];
    let notifications: Notification[] = [];

    if (lastSchedule && lastSchedule.courts) {
      const oldCourts: CourtCase[] = lastSchedule.courts;
      changes = detectChanges(oldCourts, newCourts);

      // Save changes to database
      if (changes.length > 0) {
        console.log(`[Worker] Detected ${changes.length} change(s)`);
        await changesCollection.insertMany(changes as Document[]);

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
            type:
              change.changeType === 'status_changed'
                ? 'status_change'
                : change.changeType === 'added'
                  ? 'new_case'
                  : 'change',
            title,
            message,
            changeRecordId: change._id?.toString(),
            read: false,
          } as Notification;
        });

        // Save notifications
        if (notifications.length > 0) {
          await notificationsCollection.insertMany(notifications as Document[]);
          console.log(`[Worker] Created ${notifications.length} notification(s)`);
        }
      } else {
        console.log('[Worker] No changes detected');
      }
    } else {
      console.log('[Worker] No previous schedule found, saving initial schedule');
    }

    // Save the new schedule
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const courtsToStore: CourtCase[] = newCourts.map((court) => ({
      ...court,
      caseDetails: court.caseDetails,
    }));

    await scheduleCollection.insertOne({
      date: dateStr,
      lastUpdated: now,
      courts: courtsToStore,
    });

    const duration = Date.now() - startTime;
    console.log(
      `[Worker] Poll completed in ${duration}ms - Changes: ${changes.length}, Notifications: ${notifications.length}`
    );
  } catch (error) {
    console.error('[Worker] Error during poll:', error);
    if (error instanceof Error) {
      console.error('[Worker] Error message:', error.message);
      console.error('[Worker] Error stack:', error.stack);
    }
  } finally {
    isRunning = false;
  }
}

function startPolling() {
  console.log('[Worker] Starting background polling worker...');
  console.log(`[Worker] Poll interval: ${POLL_INTERVAL_MS / 1000} seconds`);

  // Run immediately on start
  pollSchedule();

  // Then schedule regular polls
  function scheduleNext() {
    pollTimeout = setTimeout(() => {
      pollSchedule().finally(() => {
        scheduleNext();
      });
    }, POLL_INTERVAL_MS);
  }

  scheduleNext();
}

function stopPolling() {
  console.log('[Worker] Stopping polling worker...');
  if (pollTimeout) {
    clearTimeout(pollTimeout);
    pollTimeout = null;
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Worker] Received SIGINT, shutting down gracefully...');
  stopPolling();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[Worker] Received SIGTERM, shutting down gracefully...');
  stopPolling();
  process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('[Worker] Uncaught exception:', error);
  stopPolling();
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Worker] Unhandled rejection at:', promise, 'reason:', reason);
  // Don't exit on unhandled rejection, just log it
});

// Start the worker
startPolling();

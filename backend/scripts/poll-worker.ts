#!/usr/bin/env node
/**
 * Background polling worker for schedule monitoring
 * Runs independently of Next.js, polls every 30 seconds
 */

import { getDb } from '../lib/mongodb';
import { syncSchedule } from '../lib/scheduleSync';
import { GET as getWebDiary } from '../controllers/webDiaryController';
import { getLatestWebDiarySnapshot } from '../lib/aiStore';
const POLL_INTERVAL_MS = 30000; // 30 seconds
const WEB_DIARY_SYNC_INTERVAL_MS = 15 * 60 * 1000;

let isRunning = false;
let pollTimeout: NodeJS.Timeout | null = null;
let lastWebDiarySyncAt = 0;
let diaryRunning = false;

function getIndiaDate() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return { day: value('day'), month: value('month'), year: value('year') };
}

function getRecentIndiaDates(days: number) {
  return Array.from({ length: days }, (_, offset) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - offset);
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
    }).formatToParts(date);
    const value = (type: string) => parts.find((part) => part.type === type)?.value || '';
    return { day: value('day'), month: value('month'), year: value('year') };
  });
}

async function syncWebDiary() {
  if (diaryRunning || Date.now() - lastWebDiarySyncAt < WEB_DIARY_SYNC_INTERVAL_MS) return;
  diaryRunning = true;
  try {
  lastWebDiarySyncAt = Date.now();

  const db = await getDb();
  for (const { day, month, year } of getRecentIndiaDates(7)) {
    for (const bench of ['allahabad', 'lucknow']) {
    const snapshotDate = `${bench}:${Number(day)}/${Number(month)}/${year}`;
    const existing = await getLatestWebDiarySnapshot(db, snapshotDate);
    if (existing && (snapshotDate !== `${bench}:${Number(getIndiaDate().day)}/${Number(getIndiaDate().month)}/${getIndiaDate().year}` || Date.now() - existing.fetchedAt.getTime() < WEB_DIARY_SYNC_INTERVAL_MS)) {
      continue;
    }

    const response = await getWebDiary(
      new Request(`http://localhost/api/web-diary?date=${day}&month=${month}&year=${year}&bench=${bench}`), true
    );
    const payload = (await response.json()) as { success?: boolean; data?: { notifications?: unknown[] } };
    console.log(
      `[Worker] Web diary ${snapshotDate}: ${payload.success ? `${payload.data?.notifications?.length || 0} notices saved` : 'source unavailable'}`
    );
    }
  }
  } finally { diaryRunning = false; }
}

async function pollSchedule() {
  if (isRunning) {
    console.log('[Worker] Previous poll still running, skipping...');
    return;
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    console.log(`[Worker] Starting poll at ${new Date().toISOString()}`);
    const db = await getDb();
    void syncWebDiary().catch((error) => console.error('[Worker] Diary sync failed:', error));
    await db.collection('schedules').createIndex({ lastUpdated: 1 }, { expireAfterSeconds: 604800 });
    await syncSchedule({ db, force: true, source: 'worker', bench: 'allahabad', runTrackedOrders: false });
    const result = await syncSchedule({
      db,
      force: true,
      source: 'worker',
    });

    const duration = Date.now() - startTime;
    console.log(
      `[Worker] Poll completed in ${duration}ms - Changes: ${result.changes.length}, Notifications: ${result.notificationsCreated}, History: ${result.historyInserted}, Tracked Orders: ${result.trackedOrders?.trackedCases ?? 0}, Invalid Tracked Orders: ${result.trackedOrders?.invalidCases ?? 0}, Order Notifications: ${result.trackedOrders?.notifications ?? 0}, Refreshed: ${result.refreshed}, Stale: ${result.stale}${result.warning ? `, Warning: ${result.warning}` : ''}`
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

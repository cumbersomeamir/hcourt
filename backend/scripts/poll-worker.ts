#!/usr/bin/env node
/**
 * Background polling worker for schedule monitoring
 * Runs independently of Next.js, polls every 30 seconds
 */

import { getDb } from '../lib/mongodb';
import { syncSchedule } from '../lib/scheduleSync';
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
    const db = await getDb();
    const result = await syncSchedule({
      db,
      force: true,
      source: 'worker',
    });

    const duration = Date.now() - startTime;
    console.log(
      `[Worker] Poll completed in ${duration}ms - Changes: ${result.changes.length}, Notifications: ${result.notificationsCreated}, History: ${result.historyInserted}, Tracked Orders: ${result.trackedOrders?.trackedCases ?? 0}, Order Notifications: ${result.trackedOrders?.notifications ?? 0}, Refreshed: ${result.refreshed}, Stale: ${result.stale}${result.warning ? `, Warning: ${result.warning}` : ''}`
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

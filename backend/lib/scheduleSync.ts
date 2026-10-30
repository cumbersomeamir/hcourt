import { courtFetch as fetch } from './courtFetch';
import { Db, ObjectId } from 'mongodb';
import { parseCourtSchedule } from './parser';
import { detectChanges } from './changeDetector';
import { appendCourtHistorySnapshot } from './courtHistory';
import { monitorTrackedOrderCases } from './trackedOrdersMonitor';
import { ChangeRecord, CourtCase, Notification } from '../types/court';

type CourtBench = 'allahabad' | 'lucknow';

const COURT_VIEW_URLS: Record<CourtBench, string> = {
  allahabad: 'https://courtview2.allahabadhighcourt.in/courtview/CourtViewAllahabad.do',
  lucknow: 'https://courtview2.allahabadhighcourt.in/courtview/CourtViewLucknow.do',
};
const DEFAULT_STALE_AFTER_MS = 60_000;
const COURT_FETCH_TIMEOUT_MS = 15_000;
const COURT_FETCH_RETRIES = 1;

type ScheduleDocument = {
  _id?: ObjectId;
  date: string;
  lastUpdated: Date;
  courts: CourtCase[];
  source?: string;
  bench?: CourtBench;
};

type ScheduleSyncOptions = {
  db: Db;
  force?: boolean;
  source: string;
  bench?: CourtBench;
  staleAfterMs?: number;
  runTrackedOrders?: boolean;
};

type ScheduleSyncResult = {
  schedule: ScheduleDocument;
  changes: ChangeRecord[];
  notificationsCreated: number;
  historyInserted: number;
  trackedOrders: Awaited<ReturnType<typeof monitorTrackedOrderCases>> | null;
  refreshed: boolean;
  stale: boolean;
  warning?: string;
};

const inFlightSync = new Map<CourtBench, Promise<ScheduleSyncResult>>();

function cloneCaseDetails(details: CourtCase['caseDetails']): CourtCase['caseDetails'] {
  if (!details) return null;

  return {
    caseNumber: details.caseNumber,
    title: details.title,
    petitionerCounsels: [...details.petitionerCounsels],
    respondentCounsels: [...details.respondentCounsels],
  };
}

function cloneCourt(court: CourtCase): CourtCase {
  return {
    courtNo: court.courtNo,
    serialNo: court.serialNo,
    list: court.list,
    progress: court.progress,
    caseDetails: cloneCaseDetails(court.caseDetails),
    isInSession: court.isInSession,
  };
}

function buildNotifications(changes: ChangeRecord[]): Notification[] {
  return changes.map((change) => {
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
    };
  });
}

function parseStaleAfterMs(value?: number): number {
  if (!Number.isFinite(value) || !value || value <= 0) {
    return DEFAULT_STALE_AFTER_MS;
  }

  return Math.max(1_000, Math.floor(value));
}

function isFresh(schedule: ScheduleDocument | null, staleAfterMs: number): boolean {
  if (!schedule?.lastUpdated) return false;
  const updatedAt = new Date(schedule.lastUpdated).getTime();
  if (!Number.isFinite(updatedAt)) return false;
  return Date.now() - updatedAt <= staleAfterMs;
}

async function getLatestScheduleDocument(db: Db, bench: CourtBench): Promise<ScheduleDocument | null> {
  return db.collection<ScheduleDocument>('schedules').findOne(
    bench === 'lucknow' ? { $or: [{ bench }, { bench: { $exists: false } }] } : { bench },
    { sort: { lastUpdated: -1 } }
  );
}

async function fetchCourtView(bench: CourtBench): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= COURT_FETCH_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), COURT_FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(COURT_VIEW_URLS[bench], {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        cache: 'no-store',
        signal: controller.signal,
      });

      if (response.ok) return response;
      lastError = new Error(`Failed to fetch live ${bench} court view: ${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Failed to fetch live ${bench} court view`);
}

async function syncScheduleInternal(
  db: Db,
  latestBeforeSync: ScheduleDocument | null,
  source: string,
  bench: CourtBench,
  runTrackedOrders: boolean
): Promise<ScheduleSyncResult> {
  try {
    await db.collection<{ _id: string; until: Date }>('court_request_leases').findOneAndUpdate(
      { _id: `schedule:${bench}`, until: { $lte: new Date() } },
      { $set: { until: new Date(Date.now() + 60000) } },
      { upsert: true },
    );
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      throw new Error('Showing saved court data while the shared refresh is pending.');
    }
    throw error;
  }
  const response = await fetchCourtView(bench);

  const html = await response.text();
  const parsedCourts = parseCourtSchedule(html);
  if (!parsedCourts.length) throw new Error('Court returned no valid schedule rows; keeping saved data.');
  const courtsToStore = parsedCourts.map((court) => cloneCourt(court));
  const now = new Date();
  const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);

  const scheduleCollection = db.collection<ScheduleDocument>('schedules');
  const changesCollection = db.collection<ChangeRecord>('changes');
  const notificationsCollection = db.collection<Notification>('notifications');

  const changes =
    latestBeforeSync?.courts && latestBeforeSync.courts.length > 0
      ? detectChanges(latestBeforeSync.courts, parsedCourts)
      : [];

  if (changes.length > 0) {
    await changesCollection.insertMany(changes);
  }

  const notifications = buildNotifications(changes);
  if (notifications.length > 0) {
    await notificationsCollection.insertMany(notifications);
  }

  const isSameAsLatest =
    Boolean(latestBeforeSync) && latestBeforeSync!.date === dateStr &&
    latestBeforeSync!.courts.length === courtsToStore.length &&
    changes.length === 0;

  let schedule: ScheduleDocument;

  if (isSameAsLatest && latestBeforeSync?._id) {
    await scheduleCollection.updateOne(
      { _id: latestBeforeSync._id },
      {
        $set: {
          date: dateStr,
          lastUpdated: now,
          source,
          bench,
        },
      }
    );

    schedule = {
      ...latestBeforeSync,
      date: dateStr,
      lastUpdated: now,
      source,
      bench,
    };
  } else {
    schedule = {
      date: dateStr,
      lastUpdated: now,
      courts: courtsToStore,
      source,
      bench,
    };

    const insertResult = await scheduleCollection.insertOne(schedule);
    schedule = {
      ...schedule,
      _id: insertResult.insertedId,
    };
  }

  const historyInserted = await appendCourtHistorySnapshot({
    db,
    bench,
    date: dateStr,
    timestamp: now,
    courts: courtsToStore,
    source,
  });

  const trackedOrders = runTrackedOrders ? await monitorTrackedOrderCases(db) : null;

  return {
    schedule,
    changes,
    notificationsCreated: notifications.length,
    historyInserted,
    trackedOrders,
    refreshed: true,
    stale: false,
  };
}

export async function syncSchedule({
  db,
  force = false,
  source,
  bench = 'lucknow',
  staleAfterMs,
  runTrackedOrders = false,
}: ScheduleSyncOptions): Promise<ScheduleSyncResult> {
  const maxAgeMs = parseStaleAfterMs(staleAfterMs);
  const latestBeforeSync = await getLatestScheduleDocument(db, bench);

  if (!force && source === 'schedule_latest' && latestBeforeSync &&
      Date.now() - new Date(latestBeforeSync.lastUpdated).getTime() < 7 * 86400000) {
    const stale = !isFresh(latestBeforeSync, maxAgeMs);
    if (stale) void syncSchedule({ db, force: true, source: 'background_refresh', bench, runTrackedOrders: false }).catch(console.error);
    return { schedule: latestBeforeSync, changes: [], notificationsCreated: 0, historyInserted: 0,
      trackedOrders: null, refreshed: false, stale,
      warning: stale ? 'Showing saved court data while refreshing.' : undefined };
  }

  if (isFresh(latestBeforeSync, force ? 60000 : maxAgeMs)) {
    const historyInserted = source === 'worker' && latestBeforeSync
      ? await appendCourtHistorySnapshot({
        db, bench, date: latestBeforeSync.date, timestamp: new Date(latestBeforeSync.lastUpdated),
        courts: latestBeforeSync.courts, source: 'worker',
      }) : 0;
    return {
      schedule: latestBeforeSync as ScheduleDocument,
      changes: [],
      notificationsCreated: 0,
      historyInserted,
      trackedOrders: null,
      refreshed: false,
      stale: false,
    };
  }

  const existingSync = inFlightSync.get(bench);
  if (existingSync) {
    return existingSync;
  }

  const syncPromise = syncScheduleInternal(db, latestBeforeSync, source, bench, runTrackedOrders)
    .catch((error) => {
      if (latestBeforeSync) {
        return {
          schedule: latestBeforeSync,
          changes: [],
          notificationsCreated: 0,
          historyInserted: 0,
          trackedOrders: null,
          refreshed: false,
          stale: true,
          warning: error instanceof Error ? error.message : 'Unknown error while syncing schedule',
        } satisfies ScheduleSyncResult;
      }

      throw error;
    })
    .finally(() => {
      if (inFlightSync.get(bench) === syncPromise) {
        inFlightSync.delete(bench);
      }
    });

  inFlightSync.set(bench, syncPromise);
  return syncPromise;
}

export async function getLatestStoredSchedule(db: Db, bench: CourtBench = 'lucknow'): Promise<ScheduleDocument | null> {
  return getLatestScheduleDocument(db, bench);
}

export async function getStoredScheduleByDate(
  db: Db,
  date: string,
  bench: CourtBench = 'lucknow'
): Promise<ScheduleDocument | null> {
  const stored = await db.collection<ScheduleDocument>('schedules').findOne(
    bench === 'lucknow'
      ? { date, $or: [{ bench }, { bench: { $exists: false } }] }
      : { date, bench },
    { sort: { lastUpdated: -1 } }
  );
  if (stored) return stored;
  if (bench !== 'lucknow') return null;

  const rows = await db.collection('court_history').aggregate<{
    _id: string;
    state: CourtCase;
    lastUpdated: Date;
  }>([
    { $match: { date } },
    { $sort: { timestamp: -1 } },
    { $group: { _id: '$courtNo', state: { $first: '$state' }, lastUpdated: { $first: '$timestamp' } } },
    { $sort: { _id: 1 } },
  ]).toArray();

  if (rows.length === 0) return null;
  return {
    date,
    bench,
    source: 'court_history',
    lastUpdated: rows.reduce(
      (latest, row) => row.lastUpdated > latest ? row.lastUpdated : latest,
      rows[0].lastUpdated
    ),
    courts: rows.map((row) => row.state),
  };
}

import { Db, ObjectId } from 'mongodb';
import { parseCourtSchedule } from './parser';
import { detectChanges } from './changeDetector';
import { appendCourtHistorySnapshot } from './courtHistory';
import { monitorTrackedOrderCases } from './trackedOrdersMonitor';
import { ChangeRecord, CourtCase, Notification } from '../types/court';

const COURT_VIEW_URL =
  'https://courtview2.allahabadhighcourt.in/courtview/CourtViewLucknow.do';
const DEFAULT_STALE_AFTER_MS = 45_000;

type ScheduleDocument = {
  _id?: ObjectId;
  date: string;
  lastUpdated: Date;
  courts: CourtCase[];
  source?: string;
};

type ScheduleSyncOptions = {
  db: Db;
  force?: boolean;
  source: string;
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

let inFlightSync: Promise<ScheduleSyncResult> | null = null;

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

async function getLatestScheduleDocument(db: Db): Promise<ScheduleDocument | null> {
  return db.collection<ScheduleDocument>('schedules').findOne({}, { sort: { lastUpdated: -1 } });
}

async function syncScheduleInternal(
  db: Db,
  latestBeforeSync: ScheduleDocument | null,
  source: string,
  runTrackedOrders: boolean
): Promise<ScheduleSyncResult> {
  const response = await fetch(COURT_VIEW_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch live Lucknow court view: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const parsedCourts = parseCourtSchedule(html);
  const courtsToStore = parsedCourts.map((court) => cloneCourt(court));
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];

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
    Boolean(latestBeforeSync) &&
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
        },
      }
    );

    schedule = {
      ...latestBeforeSync,
      date: dateStr,
      lastUpdated: now,
      source,
    };
  } else {
    schedule = {
      date: dateStr,
      lastUpdated: now,
      courts: courtsToStore,
      source,
    };

    const insertResult = await scheduleCollection.insertOne(schedule);
    schedule = {
      ...schedule,
      _id: insertResult.insertedId,
    };
  }

  const historyInserted = await appendCourtHistorySnapshot({
    db,
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
  staleAfterMs,
  runTrackedOrders = true,
}: ScheduleSyncOptions): Promise<ScheduleSyncResult> {
  const maxAgeMs = parseStaleAfterMs(staleAfterMs);
  const latestBeforeSync = await getLatestScheduleDocument(db);

  if (!force && isFresh(latestBeforeSync, maxAgeMs)) {
    return {
      schedule: latestBeforeSync as ScheduleDocument,
      changes: [],
      notificationsCreated: 0,
      historyInserted: 0,
      trackedOrders: null,
      refreshed: false,
      stale: false,
    };
  }

  if (inFlightSync) {
    return inFlightSync;
  }

  const syncPromise = syncScheduleInternal(db, latestBeforeSync, source, runTrackedOrders)
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
      if (inFlightSync === syncPromise) {
        inFlightSync = null;
      }
    });

  inFlightSync = syncPromise;
  return syncPromise;
}

export async function getLatestStoredSchedule(db: Db): Promise<ScheduleDocument | null> {
  return getLatestScheduleDocument(db);
}

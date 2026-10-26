import { AnyBulkWriteOperation, Db } from 'mongodb';
import { CourtCase, CourtHistoryRecord } from '@/types/court';

let historyIndexesEnsured = false;
const MIN_HISTORY_DURATION_MS = 30_000;

interface PendingCourtHistoryRecord {
  bench?: 'allahabad' | 'lucknow';
  date: string;
  courtNo: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  serialNo: string | null;
  list: string | null;
  progress: string | null;
  isInSession: boolean;
  caseDetails: CourtCase['caseDetails'] | null;
  state: CourtCase;
  source: string;
}

export interface AppendCourtHistoryParams {
  db: Db;
  bench?: 'allahabad' | 'lucknow';
  date: string;
  timestamp: Date;
  courts: CourtCase[];
  source: string;
}

function cloneCaseDetails(details: CourtCase['caseDetails']): CourtCase['caseDetails'] {
  if (!details) return null;
  return {
    caseNumber: details.caseNumber,
    title: details.title,
    petitionerCounsels: [...details.petitionerCounsels],
    respondentCounsels: [...details.respondentCounsels],
  };
}

function normalizeCourtState(court: CourtCase): CourtCase {
  return {
    courtNo: court.courtNo,
    serialNo: court.serialNo,
    list: court.list,
    progress: court.progress,
    caseDetails: cloneCaseDetails(court.caseDetails),
    isInSession: court.isInSession,
  };
}

function isSameCourtState(a: CourtCase | null | undefined, b: CourtCase): boolean {
  if (!a) return false;
  return JSON.stringify(normalizeCourtState(a)) === JSON.stringify(normalizeCourtState(b));
}

function toTimestampMs(value: Date | string): number {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.NaN;
}

function hasStayedLongEnough(firstSeenAt: Date | string, currentTimestamp: Date): boolean {
  const firstSeenMs = toTimestampMs(firstSeenAt);
  const currentMs = toTimestampMs(currentTimestamp);
  if (!Number.isFinite(firstSeenMs) || !Number.isFinite(currentMs)) return false;
  return currentMs - firstSeenMs >= MIN_HISTORY_DURATION_MS;
}

function shouldKeepHistoryRecord(
  record: CourtHistoryRecord,
  nextRecord: CourtHistoryRecord | null,
  nowMs: number
): boolean {
  const startMs = toTimestampMs(record.timestamp);
  if (!Number.isFinite(startMs)) return false;

  const endMs = nextRecord ? toTimestampMs(nextRecord.timestamp) : nowMs;
  if (!Number.isFinite(endMs)) return false;

  return endMs - startMs >= MIN_HISTORY_DURATION_MS;
}

function buildHistoryRecord(input: {
  bench?: 'allahabad' | 'lucknow';
  date: string;
  courtNo: string;
  timestamp: Date;
  state: CourtCase;
  source: string;
}): CourtHistoryRecord {
  return {
    bench: input.bench || 'lucknow',
    date: input.date,
    courtNo: input.courtNo,
    timestamp: input.timestamp,
    serialNo: input.state.serialNo,
    list: input.state.list,
    progress: input.state.progress,
    isInSession: input.state.isInSession,
    caseDetails: input.state.caseDetails,
    state: input.state,
    source: input.source,
  };
}

function buildPendingHistoryRecord(input: {
  bench?: 'allahabad' | 'lucknow';
  date: string;
  courtNo: string;
  timestamp: Date;
  state: CourtCase;
  source: string;
}): PendingCourtHistoryRecord {
  return {
    bench: input.bench || 'lucknow',
    date: input.date,
    courtNo: input.courtNo,
    firstSeenAt: input.timestamp,
    lastSeenAt: input.timestamp,
    serialNo: input.state.serialNo,
    list: input.state.list,
    progress: input.state.progress,
    isInSession: input.state.isInSession,
    caseDetails: input.state.caseDetails,
    state: input.state,
    source: input.source,
  };
}

async function ensureHistoryIndexes(db: Db): Promise<void> {
  if (historyIndexesEnsured) return;
  const collection = db.collection('court_history');
  const pendingCollection = db.collection('court_history_pending');
  await Promise.all([
    collection.createIndex({ bench: 1, date: 1, courtNo: 1, timestamp: -1 }),
    collection.createIndex({ timestamp: -1 }),
    pendingCollection.createIndex({ bench: 1, date: 1, courtNo: 1 }, { unique: true }),
    pendingCollection.createIndex({ lastSeenAt: -1 }),
  ]);
  const indexes = await pendingCollection.indexes();
  if (indexes.some(index => index.name === 'date_1_courtNo_1')) {
    await pendingCollection.dropIndex('date_1_courtNo_1').catch((error: { code?: number }) => {
      if (error.code !== 27) throw error;
    });
  }
  historyIndexesEnsured = true;
}

export async function appendCourtHistorySnapshot({
  db,
  date,
  timestamp,
  courts,
  source,
  bench = 'lucknow',
}: AppendCourtHistoryParams): Promise<number> {
  if (!courts || courts.length === 0) return 0;

  await ensureHistoryIndexes(db);

  const collection = db.collection<CourtHistoryRecord>('court_history');
  const pendingCollection = db.collection<PendingCourtHistoryRecord>('court_history_pending');
  const normalizedCourts = new Map<string, CourtCase>();

  courts.forEach((court) => {
    if (!court?.courtNo) return;
    normalizedCourts.set(court.courtNo, normalizeCourtState(court));
  });

  if (normalizedCourts.size === 0) return 0;

  const courtNos = Array.from(normalizedCourts.keys());

  const [latestByCourt, pendingDocs] = await Promise.all([
    collection
      .aggregate<{ _id: string; state: CourtCase }>([
        { $match: { bench, date, courtNo: { $in: courtNos } } },
        { $sort: { timestamp: -1 } },
        { $group: { _id: '$courtNo', state: { $first: '$state' } } },
      ])
      .toArray(),
    pendingCollection
      .find({ bench, date, courtNo: { $in: courtNos } })
      .toArray(),
  ]);

  const latestStateMap = new Map<string, CourtCase>();
  latestByCourt.forEach((row) => {
    latestStateMap.set(row._id, row.state);
  });

  const pendingStateMap = new Map<string, PendingCourtHistoryRecord>();
  pendingDocs.forEach((row) => {
    pendingStateMap.set(row.courtNo, row);
  });

  const docsToInsert: CourtHistoryRecord[] = [];
  const pendingOps: AnyBulkWriteOperation<PendingCourtHistoryRecord>[] = [];

  for (const [courtNo, normalizedState] of normalizedCourts.entries()) {
    const previousState = latestStateMap.get(courtNo);
    const pendingState = pendingStateMap.get(courtNo);

    if (!pendingState) {
      if (isSameCourtState(previousState, normalizedState)) {
        continue;
      }

      pendingOps.push({
        replaceOne: {
          filter: { bench, date, courtNo },
          replacement: buildPendingHistoryRecord({
            bench,
            date,
            courtNo,
            timestamp,
            state: normalizedState,
            source,
          }),
          upsert: true,
        },
      });
      continue;
    }

    if (isSameCourtState(pendingState.state, normalizedState)) {
      if (isSameCourtState(previousState, normalizedState)) {
        pendingOps.push({
          deleteOne: {
            filter: { bench, date, courtNo },
          },
        });
        continue;
      }

      if (hasStayedLongEnough(pendingState.firstSeenAt, timestamp)) {
        docsToInsert.push(
          buildHistoryRecord({
            bench,
            date,
            courtNo,
            timestamp: new Date(pendingState.firstSeenAt),
            state: pendingState.state,
            source: pendingState.source,
          })
        );
        pendingOps.push({
          deleteOne: {
            filter: { bench, date, courtNo },
          },
        });
      } else {
        pendingOps.push({
          updateOne: {
            filter: { bench, date, courtNo },
            update: {
              $set: {
                lastSeenAt: timestamp,
              },
            },
          },
        });
      }
      continue;
    }

    if (isSameCourtState(previousState, normalizedState)) {
      pendingOps.push({
        deleteOne: {
          filter: { bench, date, courtNo },
        },
      });
      continue;
    }

    pendingOps.push({
      replaceOne: {
        filter: { bench, date, courtNo },
        replacement: buildPendingHistoryRecord({
          bench,
          date,
          courtNo,
          timestamp,
          state: normalizedState,
          source,
        }),
        upsert: true,
      },
    });
  }

  if (docsToInsert.length > 0) {
    await collection.insertMany(docsToInsert);
  }

  if (pendingOps.length > 0) {
    await pendingCollection.bulkWrite(pendingOps, { ordered: false });
  }

  return docsToInsert.length;
}

export interface GetCourtHistoryParams {
  db: Db;
  courtNo: string;
  bench?: 'allahabad' | 'lucknow';
  date: string;
  limit: number;
}

export async function getCourtHistory({
  db,
  courtNo,
  date,
  limit,
  bench = 'lucknow',
}: GetCourtHistoryParams): Promise<CourtHistoryRecord[]> {
  const collection = db.collection<CourtHistoryRecord>('court_history');
  let history = await collection
    .find({ bench, courtNo, date })
    .sort({ timestamp: 1 })
    .toArray();

  if (history.length === 0 && bench === 'lucknow') {
    history = await collection.find({ courtNo, date, bench: { $exists: false } }).sort({ timestamp: 1 }).toArray();
  }
  const nowMs = Date.now();
  const filteredHistory = history.filter((record, index) =>
    shouldKeepHistoryRecord(record, history[index + 1] || null, nowMs)
  );

  return filteredHistory.reverse().slice(0, limit);
}

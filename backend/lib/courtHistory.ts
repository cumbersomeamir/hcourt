import { Db } from 'mongodb';
import { CourtCase, CourtHistoryRecord } from '@/types/court';

let historyIndexesEnsured = false;

export interface AppendCourtHistoryParams {
  db: Db;
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

async function ensureHistoryIndexes(db: Db): Promise<void> {
  if (historyIndexesEnsured) return;
  const collection = db.collection('court_history');
  await Promise.all([
    collection.createIndex({ date: 1, courtNo: 1, timestamp: -1 }),
    collection.createIndex({ timestamp: -1 }),
  ]);
  historyIndexesEnsured = true;
}

export async function appendCourtHistorySnapshot({
  db,
  date,
  timestamp,
  courts,
  source,
}: AppendCourtHistoryParams): Promise<number> {
  if (!courts || courts.length === 0) return 0;

  await ensureHistoryIndexes(db);

  const collection = db.collection<CourtHistoryRecord>('court_history');
  const courtNos = courts.map((court) => court.courtNo);

  const latestByCourt = await collection
    .aggregate<{ _id: string; state: CourtCase }>([
      { $match: { date, courtNo: { $in: courtNos } } },
      { $sort: { timestamp: -1 } },
      { $group: { _id: '$courtNo', state: { $first: '$state' } } },
    ])
    .toArray();

  const latestStateMap = new Map<string, CourtCase>();
  latestByCourt.forEach((row) => {
    latestStateMap.set(row._id, row.state);
  });

  const docsToInsert: CourtHistoryRecord[] = [];
  for (const court of courts) {
    const normalizedState = normalizeCourtState(court);
    const previousState = latestStateMap.get(court.courtNo);
    if (isSameCourtState(previousState, normalizedState)) {
      continue;
    }

    docsToInsert.push({
      date,
      courtNo: court.courtNo,
      timestamp,
      serialNo: normalizedState.serialNo,
      list: normalizedState.list,
      progress: normalizedState.progress,
      isInSession: normalizedState.isInSession,
      caseDetails: normalizedState.caseDetails,
      state: normalizedState,
      source,
    });
  }

  if (docsToInsert.length === 0) return 0;

  await collection.insertMany(docsToInsert);
  return docsToInsert.length;
}

export interface GetCourtHistoryParams {
  db: Db;
  courtNo: string;
  date: string;
  limit: number;
}

export async function getCourtHistory({
  db,
  courtNo,
  date,
  limit,
}: GetCourtHistoryParams): Promise<CourtHistoryRecord[]> {
  const collection = db.collection<CourtHistoryRecord>('court_history');
  return collection
    .find({ courtNo, date })
    .sort({ timestamp: -1 })
    .limit(limit)
    .toArray();
}

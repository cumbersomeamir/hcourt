import { AnyBulkWriteOperation, Db } from 'mongodb';
import { CourtCase, CourtHistoryRecord } from '@/types/court';

let historyIndexesEnsured = false;
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

export async function appendCourtHistorySnapshot({ db, date, timestamp, courts, source, bench = 'lucknow' }: AppendCourtHistoryParams): Promise<number> {
  if (!courts.length) return 0;
  const collection = db.collection<CourtHistoryRecord>('court_history');
  if (!historyIndexesEnsured) {
    await collection.createIndex({ bench: 1, date: 1, courtNo: 1, timestamp: -1 });
    historyIndexesEnsured = true;
  }
  const normalized = new Map(courts.filter(court => court.courtNo).map(court => [court.courtNo, normalizeCourtState(court)]));
  const latest = await collection.aggregate<{ _id: string; state: CourtCase; timestamp: Date }>([
    { $match: { bench, date, courtNo: { $in: [...normalized.keys()] } } },
    { $sort: { timestamp: -1 } },
    { $group: { _id: '$courtNo', state: { $first: '$state' }, timestamp: { $first: '$timestamp' } } },
  ]).toArray();
  const previous = new Map(latest.map(row => [row._id, row]));
  const operations: AnyBulkWriteOperation<CourtHistoryRecord>[] = [];
  for (const [courtNo, state] of normalized) {
    const last = previous.get(courtNo);
    if (last && (new Date(last.timestamp).getTime() >= timestamp.getTime() || isSameCourtState(last.state, state))) continue;
    const record = buildHistoryRecord({ bench, date, courtNo, timestamp, state, source });
    operations.push({ updateOne: { filter: { bench, date, courtNo, timestamp }, update: { $setOnInsert: record }, upsert: true } });
  }
  if (!operations.length) return 0;
  return (await collection.bulkWrite(operations, { ordered: false })).upsertedCount;
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
  return history.reverse().slice(0, limit);
}

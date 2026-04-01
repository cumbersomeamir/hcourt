import { Db } from 'mongodb';
import { CourtCase, Notification, TrackedOrderCase } from '@/types/court';
import { OrdersFetchResult } from '@/models/ordersModel';

export type CaseRegistryDoc = {
  caseKey: string;
  canonicalCaseId?: string | null;
  title?: string | null;
  explicitCaseIds: string[];
  orderTrackingKeys: string[];
  orderTrackers: TrackedOrderCase[];
  benches: Array<'lucknow' | 'allahabad'>;
  createdAt: Date;
  updatedAt: Date;
};

export type StatusSnapshotDoc = {
  snapshotKey: string;
  caseKey: string;
  canonicalCaseId?: string | null;
  city: 'lucknow' | 'allahabad';
  caseType: string;
  caseNo: string;
  caseYear: string;
  fetchedAt: Date;
  caseInfo: OrdersFetchResult['caseInfo'];
  details: OrdersFetchResult['details'];
  orderJudgments: OrdersFetchResult['orderJudgments'];
};

export type CauseListSnapshotDoc = {
  snapshotKey: string;
  bench: 'lucknow' | 'allahabad';
  listType: string;
  listTypeLabel: string;
  listDate: string;
  counselName: string;
  totalRows: number;
  previewRows: Array<Record<string, string | number | null>>;
  fetchedAt: Date;
};

export type WebDiarySnapshotDoc = {
  snapshotKey: string;
  date: string;
  fetchedAt: Date;
  notifications: Array<{
    title: string;
    pdfLink?: string;
    date: string;
    allLinks?: Array<{ type: string; link: string }>;
  }>;
};

export type CaseLatestSummaryDoc = {
  caseKey: string;
  canonicalCaseId?: string | null;
  title?: string | null;
  latestSchedule?: {
    boardDate: string;
    lastUpdated: Date;
    courtNo: string;
    serialNo: string | null;
    progress: string | null;
    list: string | null;
    isInSession: boolean;
  };
  latestStatus?: {
    city: 'lucknow' | 'allahabad';
    fetchedAt: Date;
    status?: string;
    petitionerVsRespondent?: string;
  };
  latestOrder?: {
    date: string;
    judgmentId: string;
    viewUrl: string;
    fetchedAt: Date;
  };
  latestAlert?: {
    timestamp: Date;
    title: string;
    type: Notification['type'];
  };
  updatedAt: Date;
  createdAt: Date;
};

export type AiChatRunDoc = {
  requestId: string;
  profileKey?: string;
  userId?: string;
  message: string;
  toolNames: string[];
  plan: unknown;
  toolResults: unknown[];
  answer: string;
  latencyMs: number;
  createdAt: Date;
};

const ensuredCollections = new Set<string>();

async function ensureIndexes(db: Db, collectionName: string) {
  if (ensuredCollections.has(collectionName)) return;

  switch (collectionName) {
    case 'case_registry': {
      const collection = db.collection<CaseRegistryDoc>('case_registry');
      await Promise.all([
        collection.createIndex({ caseKey: 1 }, { unique: true }),
        collection.createIndex({ canonicalCaseId: 1 }),
        collection.createIndex({ updatedAt: -1 }),
      ]);
      break;
    }
    case 'status_snapshots': {
      const collection = db.collection<StatusSnapshotDoc>('status_snapshots');
      await Promise.all([
        collection.createIndex({ snapshotKey: 1 }, { unique: true }),
        collection.createIndex({ caseKey: 1, fetchedAt: -1 }),
      ]);
      break;
    }
    case 'cause_list_snapshots': {
      const collection = db.collection<CauseListSnapshotDoc>('cause_list_snapshots');
      await Promise.all([
        collection.createIndex({ snapshotKey: 1 }, { unique: true }),
        collection.createIndex({ bench: 1, listDate: 1, counselName: 1, fetchedAt: -1 }),
      ]);
      break;
    }
    case 'web_diary_snapshots': {
      const collection = db.collection<WebDiarySnapshotDoc>('web_diary_snapshots');
      await Promise.all([
        collection.createIndex({ snapshotKey: 1 }, { unique: true }),
        collection.createIndex({ date: 1, fetchedAt: -1 }),
      ]);
      break;
    }
    case 'case_latest_summary': {
      const collection = db.collection<CaseLatestSummaryDoc>('case_latest_summary');
      await Promise.all([
        collection.createIndex({ caseKey: 1 }, { unique: true }),
        collection.createIndex({ updatedAt: -1 }),
      ]);
      break;
    }
    case 'ai_chat_runs': {
      const collection = db.collection<AiChatRunDoc>('ai_chat_runs');
      await Promise.all([
        collection.createIndex({ requestId: 1 }, { unique: true }),
        collection.createIndex({ createdAt: -1 }),
      ]);
      break;
    }
    default:
      break;
  }

  ensuredCollections.add(collectionName);
}

function uniqueCaseIds(caseIds: string[]) {
  return Array.from(
    new Set(
      caseIds
        .map((item) => String(item || '').trim().toUpperCase())
        .filter(Boolean)
    )
  );
}

function uniqueTrackingKeys(orderTrackers: TrackedOrderCase[]) {
  return Array.from(new Set(orderTrackers.map((item) => item.trackingKey)));
}

function uniqueBenches(orderTrackers: TrackedOrderCase[]) {
  return Array.from(new Set(orderTrackers.map((item) => item.city))) as Array<
    'lucknow' | 'allahabad'
  >;
}

export async function upsertCaseRegistry(
  db: Db,
  input: {
    caseKey: string;
    canonicalCaseId?: string | null;
    title?: string | null;
    explicitCaseIds?: string[];
    orderTrackers?: TrackedOrderCase[];
  }
) {
  const caseKey = String(input.caseKey || '').trim();
  if (!caseKey) return;

  await ensureIndexes(db, 'case_registry');
  const collection = db.collection<CaseRegistryDoc>('case_registry');
  const existing = await collection.findOne({ caseKey });
  const explicitCaseIds = uniqueCaseIds([
    ...(existing?.explicitCaseIds || []),
    ...(input.explicitCaseIds || []),
    ...(input.canonicalCaseId ? [input.canonicalCaseId] : []),
  ]);
  const orderTrackersMap = new Map<string, TrackedOrderCase>();
  for (const tracker of existing?.orderTrackers || []) {
    orderTrackersMap.set(tracker.trackingKey, tracker);
  }
  for (const tracker of input.orderTrackers || []) {
    orderTrackersMap.set(tracker.trackingKey, tracker);
  }
  const orderTrackers = Array.from(orderTrackersMap.values());
  const now = new Date();

  const nextDoc: CaseRegistryDoc = {
    caseKey,
    canonicalCaseId: input.canonicalCaseId || existing?.canonicalCaseId || null,
    title: input.title || existing?.title || null,
    explicitCaseIds,
    orderTrackingKeys: uniqueTrackingKeys(orderTrackers),
    orderTrackers,
    benches: uniqueBenches(orderTrackers),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  await collection.updateOne({ caseKey }, { $set: nextDoc }, { upsert: true });
}

export async function saveStatusSnapshot(
  db: Db,
  input: {
    caseKey: string;
    canonicalCaseId?: string | null;
    city: 'lucknow' | 'allahabad';
    caseType: string;
    caseNo: string;
    caseYear: string;
    result: OrdersFetchResult;
  }
) {
  await ensureIndexes(db, 'status_snapshots');
  const collection = db.collection<StatusSnapshotDoc>('status_snapshots');
  const fetchedAt = new Date();
  const snapshotKey = `${input.city}|${input.caseType}|${input.caseNo}|${input.caseYear}|${fetchedAt.toISOString()}`;

  const doc: StatusSnapshotDoc = {
    snapshotKey,
    caseKey: input.caseKey,
    canonicalCaseId: input.canonicalCaseId || null,
    city: input.city,
    caseType: input.caseType,
    caseNo: input.caseNo,
    caseYear: input.caseYear,
    fetchedAt,
    caseInfo: input.result.caseInfo,
    details: input.result.details,
    orderJudgments: input.result.orderJudgments,
  };

  await collection.insertOne(doc);

  const latestOrder = input.result.orderJudgments[0];
  await upsertCaseLatestSummary(db, {
    caseKey: input.caseKey,
    canonicalCaseId: input.canonicalCaseId || null,
    title: input.result.caseInfo.petitionerVsRespondent || null,
    latestStatus: {
      city: input.city,
      fetchedAt,
      status: input.result.caseInfo.status,
      petitionerVsRespondent: input.result.caseInfo.petitionerVsRespondent,
    },
    latestOrder: latestOrder
      ? {
          date: latestOrder.date,
          judgmentId: latestOrder.judgmentId,
          viewUrl: latestOrder.viewUrl,
          fetchedAt,
        }
      : undefined,
  });
}

export async function saveCauseListSnapshot(
  db: Db,
  input: {
    bench: 'lucknow' | 'allahabad';
    listType: string;
    listTypeLabel: string;
    listDate: string;
    counselName: string;
    totalRows: number;
    previewRows: Array<Record<string, string | number | null>>;
  }
) {
  await ensureIndexes(db, 'cause_list_snapshots');
  const collection = db.collection<CauseListSnapshotDoc>('cause_list_snapshots');
  const fetchedAt = new Date();
  const snapshotKey = `${input.bench}|${input.listType}|${input.listDate}|${input.counselName}|${fetchedAt.toISOString()}`;
  await collection.insertOne({
    snapshotKey,
    bench: input.bench,
    listType: input.listType,
    listTypeLabel: input.listTypeLabel,
    listDate: input.listDate,
    counselName: input.counselName,
    totalRows: input.totalRows,
    previewRows: input.previewRows,
    fetchedAt,
  });
}

export async function saveWebDiarySnapshot(
  db: Db,
  input: {
    date: string;
    notifications: WebDiarySnapshotDoc['notifications'];
  }
) {
  await ensureIndexes(db, 'web_diary_snapshots');
  const collection = db.collection<WebDiarySnapshotDoc>('web_diary_snapshots');
  const fetchedAt = new Date();
  const snapshotKey = `${input.date}|${fetchedAt.toISOString()}`;
  await collection.insertOne({
    snapshotKey,
    date: input.date,
    fetchedAt,
    notifications: input.notifications,
  });
}

export async function upsertCaseLatestSummary(
  db: Db,
  input: {
    caseKey: string;
    canonicalCaseId?: string | null;
    title?: string | null;
    latestSchedule?: CaseLatestSummaryDoc['latestSchedule'];
    latestStatus?: CaseLatestSummaryDoc['latestStatus'];
    latestOrder?: CaseLatestSummaryDoc['latestOrder'];
    latestAlert?: CaseLatestSummaryDoc['latestAlert'];
  }
) {
  const caseKey = String(input.caseKey || '').trim();
  if (!caseKey) return;

  await ensureIndexes(db, 'case_latest_summary');
  const collection = db.collection<CaseLatestSummaryDoc>('case_latest_summary');
  const existing = await collection.findOne({ caseKey });
  const now = new Date();
  const nextDoc: CaseLatestSummaryDoc = {
    caseKey,
    canonicalCaseId: input.canonicalCaseId || existing?.canonicalCaseId || null,
    title: input.title || existing?.title || null,
    latestSchedule: input.latestSchedule || existing?.latestSchedule,
    latestStatus: input.latestStatus || existing?.latestStatus,
    latestOrder: input.latestOrder || existing?.latestOrder,
    latestAlert: input.latestAlert || existing?.latestAlert,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  await collection.updateOne({ caseKey }, { $set: nextDoc }, { upsert: true });
}

export async function saveScheduleSummary(
  db: Db,
  input: {
    caseKey: string;
    canonicalCaseId?: string | null;
    title?: string | null;
    boardDate: string;
    lastUpdated: Date;
    court: CourtCase;
  }
) {
  await upsertCaseLatestSummary(db, {
    caseKey: input.caseKey,
    canonicalCaseId: input.canonicalCaseId || null,
    title: input.title || input.court.caseDetails?.title || null,
    latestSchedule: {
      boardDate: input.boardDate,
      lastUpdated: input.lastUpdated,
      courtNo: input.court.courtNo,
      serialNo: input.court.serialNo,
      progress: input.court.progress,
      list: input.court.list,
      isInSession: input.court.isInSession,
    },
  });
}

export async function saveNotificationSummary(
  db: Db,
  input: {
    caseKey: string;
    canonicalCaseId?: string | null;
    notification: Notification;
  }
) {
    await upsertCaseLatestSummary(db, {
    caseKey: input.caseKey,
    canonicalCaseId: input.canonicalCaseId || null,
    latestAlert: {
      timestamp:
        typeof input.notification.timestamp === 'string'
          ? new Date(input.notification.timestamp)
          : input.notification.timestamp,
      title: input.notification.title,
      type: input.notification.type,
    },
  });
}

export async function recordAiChatRun(
  db: Db,
  input: {
    requestId: string;
    profileKey?: string | null;
    userId?: string | null;
    message: string;
    toolNames: string[];
    plan: unknown;
    toolResults: unknown[];
    answer: string;
    latencyMs: number;
  }
) {
  await ensureIndexes(db, 'ai_chat_runs');
  const collection = db.collection<AiChatRunDoc>('ai_chat_runs');
  await collection.insertOne({
    requestId: input.requestId,
    profileKey: String(input.profileKey || '').trim() || undefined,
    userId: String(input.userId || '').trim() || undefined,
    message: input.message,
    toolNames: input.toolNames,
    plan: input.plan,
    toolResults: input.toolResults,
    answer: input.answer,
    latencyMs: input.latencyMs,
    createdAt: new Date(),
  });
}

export async function getCollectionStats(db: Db, name: string) {
  const collections = await db.listCollections({ name }).toArray();
  if (collections.length === 0) {
    return {
      exists: false,
      count: 0,
      latestAt: null as string | null,
    };
  }

  const collection = db.collection(name);
  const count = await collection.countDocuments();
  const latestDoc = await collection
    .find(
      {},
      {
        sort: {
          updatedAt: -1,
          lastUpdated: -1,
          fetchedAt: -1,
          timestamp: -1,
          createdAt: -1,
          _id: -1,
        },
        projection: {
          updatedAt: 1,
          lastUpdated: 1,
          fetchedAt: 1,
          timestamp: 1,
          createdAt: 1,
        },
      }
    )
    .limit(1)
    .next();

  const latestValue =
    latestDoc?.updatedAt ||
    latestDoc?.lastUpdated ||
    latestDoc?.fetchedAt ||
    latestDoc?.timestamp ||
    latestDoc?.createdAt ||
    null;

  return {
    exists: true,
    count,
    latestAt: latestValue ? new Date(latestValue).toISOString() : null,
  };
}

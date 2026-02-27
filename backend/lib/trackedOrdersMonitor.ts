import { Db } from 'mongodb';
import { fetchOrderJudgmentsForCase } from '@/models/ordersModel';
import { Notification, TrackedOrderCase } from '@/types/court';
import {
  normalizeTrackedOrderCases,
  parseOrderTrackingKey,
} from '@/lib/tracking';

type MonitorTrackedOrdersSummary = {
  trackedCases: number;
  initialized: number;
  notifications: number;
  errors: number;
  skippedRecentChecks: number;
};

type TrackedOrderStateDoc = {
  trackingKey: string;
  city: 'lucknow' | 'allahabad';
  caseType: string;
  caseTypeLabel?: string;
  caseNo: string;
  caseYear: string;
  judgmentIds: string[];
  lastCheckedAt: Date;
  updatedAt: Date;
};

type MonitorTrackedOrdersOptions = {
  minCheckIntervalMs?: number;
};

let indexesEnsured = false;

async function ensureIndexes(db: Db) {
  if (indexesEnsured) return;
  await Promise.all([
    db.collection('tracked_order_state').createIndex({ trackingKey: 1 }, { unique: true }),
    db.collection('notifications').createIndex({
      type: 1,
      orderTrackingKey: 1,
      'orderJudgment.judgmentId': 1,
    }),
  ]);
  indexesEnsured = true;
}

async function processTrackedOrderCases(
  db: Db,
  trackedOrderCasesByKey: Map<string, TrackedOrderCase>,
  options?: MonitorTrackedOrdersOptions
): Promise<MonitorTrackedOrdersSummary> {
  await ensureIndexes(db);

  const stateCollection = db.collection<TrackedOrderStateDoc>('tracked_order_state');
  const notificationsCollection = db.collection('notifications');
  const summary: MonitorTrackedOrdersSummary = {
    trackedCases: trackedOrderCasesByKey.size,
    initialized: 0,
    notifications: 0,
    errors: 0,
    skippedRecentChecks: 0,
  };
  const nowMs = Date.now();
  const minCheckIntervalMs = Math.max(0, options?.minCheckIntervalMs || 0);

  for (const trackedCase of trackedOrderCasesByKey.values()) {
    try {
      const existingState = await stateCollection.findOne({
        trackingKey: trackedCase.trackingKey,
      });

      if (
        existingState?.lastCheckedAt &&
        minCheckIntervalMs > 0 &&
        nowMs - new Date(existingState.lastCheckedAt).getTime() < minCheckIntervalMs
      ) {
        summary.skippedRecentChecks += 1;
        continue;
      }

      const result = await fetchOrderJudgmentsForCase({
        city: trackedCase.city,
        caseType: trackedCase.caseType,
        caseNo: trackedCase.caseNo,
        caseYear: trackedCase.caseYear,
      });

      const now = new Date();
      const caseTypeLabel =
        trackedCase.caseTypeLabel || result.caseInfo.caseType || trackedCase.caseType;
      const currentRows = result.orderJudgments.filter((row) => Boolean(row.judgmentId));
      const currentJudgmentIds = currentRows.map((row) => row.judgmentId);

      if (!existingState) {
        await stateCollection.updateOne(
          { trackingKey: trackedCase.trackingKey },
          {
            $set: {
              trackingKey: trackedCase.trackingKey,
              city: trackedCase.city,
              caseType: trackedCase.caseType,
              caseTypeLabel,
              caseNo: trackedCase.caseNo,
              caseYear: trackedCase.caseYear,
              judgmentIds: currentJudgmentIds,
              lastCheckedAt: now,
              updatedAt: now,
            } satisfies TrackedOrderStateDoc,
          },
          { upsert: true }
        );
        summary.initialized += 1;
        continue;
      }

      const previousJudgmentIds = new Set(
        Array.isArray(existingState.judgmentIds)
          ? existingState.judgmentIds.map((id) => String(id))
          : []
      );
      const addedRows = currentRows.filter((row) => !previousJudgmentIds.has(row.judgmentId));

      if (addedRows.length > 0) {
        const existingRows = await notificationsCollection
          .find({
            type: 'order_update',
            orderTrackingKey: trackedCase.trackingKey,
            'orderJudgment.judgmentId': { $in: addedRows.map((row) => row.judgmentId) },
          })
          .project({ 'orderJudgment.judgmentId': 1 })
          .toArray();
        const existingRowIds = new Set(
          existingRows
            .map((row) => {
              const orderJudgment = row.orderJudgment as
                | { judgmentId?: string }
                | undefined;
              return orderJudgment?.judgmentId || '';
            })
            .filter(Boolean)
        );

        const notificationsToInsert: Notification[] = addedRows
          .filter((row) => !existingRowIds.has(row.judgmentId))
          .map((row) => ({
            timestamp: now,
            courtNo: '-',
            type: 'order_update',
            title: `New Order/Judgment - ${caseTypeLabel} ${trackedCase.caseNo}/${trackedCase.caseYear}`,
            message: `A new Order/Judgment entry was added.\nCase: ${caseTypeLabel} ${trackedCase.caseNo}/${trackedCase.caseYear}\nDate: ${row.date || 'N/A'}`,
            orderTrackingKey: trackedCase.trackingKey,
            orderJudgment: {
              viewUrl: row.viewUrl,
              date: row.date,
              judgmentId: row.judgmentId,
            },
            metadata: {
              city: trackedCase.city,
              caseType: trackedCase.caseType,
              caseTypeLabel,
              caseNo: trackedCase.caseNo,
              caseYear: trackedCase.caseYear,
            },
            read: false,
          }));

        if (notificationsToInsert.length > 0) {
          await notificationsCollection.insertMany(notificationsToInsert);
          summary.notifications += notificationsToInsert.length;
        }
      }

      await stateCollection.updateOne(
        { trackingKey: trackedCase.trackingKey },
        {
          $set: {
            trackingKey: trackedCase.trackingKey,
            city: trackedCase.city,
            caseType: trackedCase.caseType,
            caseTypeLabel,
            caseNo: trackedCase.caseNo,
            caseYear: trackedCase.caseYear,
            judgmentIds: currentJudgmentIds,
            lastCheckedAt: now,
            updatedAt: now,
          } satisfies TrackedOrderStateDoc,
        },
        { upsert: true }
      );
    } catch (error) {
      summary.errors += 1;
      console.error(
        `[TrackedOrders] Failed for ${trackedCase.trackingKey}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  return summary;
}

export async function monitorTrackedOrderCases(
  db: Db,
  options?: MonitorTrackedOrdersOptions
): Promise<MonitorTrackedOrdersSummary> {
  const usersCollection = db.collection('users');
  const users = await usersCollection
    .find(
      { trackedOrderCases: { $exists: true, $type: 'array', $ne: [] } },
      { projection: { trackedOrderCases: 1 } }
    )
    .toArray();

  const trackedOrderCasesByKey = new Map<string, TrackedOrderCase>();
  for (const user of users) {
    for (const trackedCase of normalizeTrackedOrderCases(user.trackedOrderCases)) {
      trackedOrderCasesByKey.set(trackedCase.trackingKey, trackedCase);
    }
  }

  return processTrackedOrderCases(db, trackedOrderCasesByKey, options);
}

export async function monitorTrackedOrderCasesByKeys(
  db: Db,
  trackingKeys: string[],
  options?: MonitorTrackedOrdersOptions
): Promise<MonitorTrackedOrdersSummary> {
  const trackedOrderCasesByKey = new Map<string, TrackedOrderCase>();
  for (const key of trackingKeys) {
    const trackedCase = parseOrderTrackingKey(key);
    if (!trackedCase) continue;
    trackedOrderCasesByKey.set(trackedCase.trackingKey, trackedCase);
  }
  return processTrackedOrderCases(db, trackedOrderCasesByKey, options);
}

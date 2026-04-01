import { Db } from 'mongodb';
import { getCollectionStats } from '@/lib/aiStore';

export type AdminCollectionCard = {
  name: string;
  purpose: string;
  features: string[];
  primaryKeys: string[];
  persistence: 'persistent' | 'ephemeral' | 'derived';
  count: number;
  exists: boolean;
  latestAt: string | null;
};

export type AdminFeatureCard = {
  id: string;
  label: string;
  sourceOfTruth: string;
  collections: string[];
  lookupKeys: string[];
  mode: 'live_fetch' | 'persisted' | 'hybrid';
  freshness: string;
};

const COLLECTION_DEFS: Array<Omit<AdminCollectionCard, 'count' | 'exists' | 'latestAt'>> = [
  {
    name: 'users',
    purpose: 'Saved tracking preferences and optional cross-device account sync.',
    features: ['Track Cases', 'My Cases', 'Notifications'],
    primaryKeys: ['_id', 'email'],
    persistence: 'persistent',
  },
  {
    name: 'lawyer_profiles',
    purpose: 'Counsel identity, aliases, chamber aliases, and enrollment reference for assignment queries.',
    features: ['Admin', 'AI Chat'],
    primaryKeys: ['profileKey', 'userId'],
    persistence: 'persistent',
  },
  {
    name: 'case_registry',
    purpose: 'AI-facing canonical case registry linking saved case IDs and order-tracking identifiers.',
    features: ['My Cases', 'Track Cases', 'AI Chat'],
    primaryKeys: ['caseKey', 'canonicalCaseId'],
    persistence: 'persistent',
  },
  {
    name: 'case_latest_summary',
    purpose: 'Fast read model for the latest known schedule, status, order, and alert per case.',
    features: ['My Cases', 'AI Chat'],
    primaryKeys: ['caseKey'],
    persistence: 'derived',
  },
  {
    name: 'schedules',
    purpose: 'Latest live display-board snapshot.',
    features: ['Court View', 'AI Chat'],
    primaryKeys: ['date'],
    persistence: 'persistent',
  },
  {
    name: 'changes',
    purpose: 'Detected diffs between schedule snapshots.',
    features: ['Alerts', 'AI Chat'],
    primaryKeys: ['timestamp', 'courtNo'],
    persistence: 'persistent',
  },
  {
    name: 'notifications',
    purpose: 'User-visible alerts for board changes and tracked order updates.',
    features: ['Alerts', 'Track Cases', 'My Cases', 'AI Chat'],
    primaryKeys: ['timestamp', 'type'],
    persistence: 'persistent',
  },
  {
    name: 'court_history',
    purpose: 'Court-wise live-board history over time.',
    features: ['Court View', 'AI Chat'],
    primaryKeys: ['date', 'courtNo', 'timestamp'],
    persistence: 'persistent',
  },
  {
    name: 'court_history_pending',
    purpose: 'Pending court history writes and recovery staging.',
    features: ['Court View'],
    primaryKeys: ['date', 'courtNo'],
    persistence: 'ephemeral',
  },
  {
    name: 'tracked_order_state',
    purpose: 'Last seen order/judgment state per tracked case.',
    features: ['Track Cases', 'Alerts'],
    primaryKeys: ['trackingKey'],
    persistence: 'persistent',
  },
  {
    name: 'order_judgment_cache',
    purpose: 'Cached downloaded order/judgment files and metadata.',
    features: ['Orders', 'Alerts', 'AI Chat'],
    primaryKeys: ['judgmentId'],
    persistence: 'persistent',
  },
  {
    name: 'orders_captcha_challenges',
    purpose: 'Temporary Allahabad captcha sessions for status/orders retrieval.',
    features: ['Orders', 'AI Chat'],
    primaryKeys: ['challengeId'],
    persistence: 'ephemeral',
  },
  {
    name: 'status_snapshots',
    purpose: 'AI-friendly persisted case status and order metadata snapshots.',
    features: ['AI Chat', 'Admin'],
    primaryKeys: ['snapshotKey', 'caseKey'],
    persistence: 'persistent',
  },
  {
    name: 'cause_list_snapshots',
    purpose: 'Persisted counsel-search cause list results for assignment queries.',
    features: ['AI Chat', 'Admin'],
    primaryKeys: ['snapshotKey'],
    persistence: 'persistent',
  },
  {
    name: 'web_diary_snapshots',
    purpose: 'Persisted web diary notification snapshots by date.',
    features: ['AI Chat', 'Admin'],
    primaryKeys: ['snapshotKey', 'date'],
    persistence: 'persistent',
  },
  {
    name: 'ai_chat_runs',
    purpose: 'Audit trail of AI requests, planned tools, and final answers.',
    features: ['AI Chat', 'Admin'],
    primaryKeys: ['requestId'],
    persistence: 'persistent',
  },
];

const FEATURE_DEFS: AdminFeatureCard[] = [
  {
    id: 'court-view',
    label: 'Court View',
    sourceOfTruth: 'Latest Lucknow live display board and stored court history.',
    collections: ['schedules', 'court_history', 'court_history_pending', 'changes'],
    lookupKeys: ['courtNo', 'caseId', 'serialNo', 'date'],
    mode: 'hybrid',
    freshness: 'Live board sync plus stored history.',
  },
  {
    id: 'alerts',
    label: 'Alerts',
    sourceOfTruth: 'Detected schedule changes and tracked order monitoring.',
    collections: ['notifications', 'changes', 'tracked_order_state'],
    lookupKeys: ['caseId', 'orderTrackingKey', 'userId'],
    mode: 'persisted',
    freshness: 'Generated on schedule sync and tracked-order checks.',
  },
  {
    id: 'orders-status',
    label: 'Orders / Status',
    sourceOfTruth: 'Allahabad/Lucknow status services plus cached judgments.',
    collections: ['order_judgment_cache', 'orders_captcha_challenges', 'status_snapshots'],
    lookupKeys: ['city', 'caseType', 'caseNo', 'caseYear'],
    mode: 'hybrid',
    freshness: 'Live fetch with AI snapshots for reuse.',
  },
  {
    id: 'cause-list',
    label: 'Cause List',
    sourceOfTruth: 'Allahabad/Lucknow cause list services and AI snapshots.',
    collections: ['cause_list_snapshots'],
    lookupKeys: ['bench', 'listDate', 'counselName', 'listType'],
    mode: 'hybrid',
    freshness: 'Live fetch with persisted counsel-search snapshots.',
  },
  {
    id: 'web-diary',
    label: 'Web Diary',
    sourceOfTruth: 'Allahabad web diary date-wise notifications.',
    collections: ['web_diary_snapshots'],
    lookupKeys: ['date'],
    mode: 'hybrid',
    freshness: 'Live fetch with persisted daily snapshots.',
  },
  {
    id: 'tracking',
    label: 'Tracking / My Cases',
    sourceOfTruth: 'Saved local state, synced user tracking, and case registry.',
    collections: ['users', 'case_registry', 'case_latest_summary'],
    lookupKeys: ['userId', 'caseId', 'orderTrackingKey'],
    mode: 'hybrid',
    freshness: 'Local browser state plus synced account state.',
  },
  {
    id: 'lawyer-profile',
    label: 'Lawyer Profile',
    sourceOfTruth: 'Counsel identity and alias set configured by the lawyer.',
    collections: ['lawyer_profiles'],
    lookupKeys: ['profileKey', 'userId', 'counselName', 'aliases'],
    mode: 'persisted',
    freshness: 'User-managed profile data.',
  },
  {
    id: 'ai-chat',
    label: 'AI Chat',
    sourceOfTruth: 'GPT-5 Nano routing + deterministic tool calls + persisted snapshots.',
    collections: [
      'lawyer_profiles',
      'case_registry',
      'case_latest_summary',
      'status_snapshots',
      'cause_list_snapshots',
      'web_diary_snapshots',
      'ai_chat_runs',
    ],
    lookupKeys: ['profileKey', 'userId', 'message intent', 'case identifiers'],
    mode: 'hybrid',
    freshness: 'Planner + live tools + persisted summaries.',
  },
];

export async function getAdminCatalog(db: Db) {
  const collections = await Promise.all(
    COLLECTION_DEFS.map(async (definition) => {
      const stats = await getCollectionStats(db, definition.name);
      return {
        ...definition,
        ...stats,
      };
    })
  );

  return {
    generatedAt: new Date().toISOString(),
    collections,
    features: FEATURE_DEFS,
  };
}

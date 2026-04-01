import { TrackedOrderCase } from '@/types/court';

export type LawyerProfile = {
  profileKey: string;
  userId: string | null;
  email: string | null;
  counselName: string;
  aliases: string[];
  chamberAliases: string[];
  enrollmentNo: string | null;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
};

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

export type AdminOverview = {
  generatedAt: string;
  collections: AdminCollectionCard[];
  features: AdminFeatureCard[];
};

export type AiToolResult = {
  tool: string;
  ok: boolean;
  summary: string;
  data?: unknown;
};

export type AiChatResponse = {
  requestId: string;
  answer: string;
  plan: unknown;
  toolResults: AiToolResult[];
  clientMutation?: {
    trackedCaseIds?: string[];
    trackedOrderCases?: TrackedOrderCase[];
  };
  lawyerProfile: LawyerProfile | null;
};

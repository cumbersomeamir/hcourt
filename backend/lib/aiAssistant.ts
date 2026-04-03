import { randomUUID } from 'node:crypto';
import { getDb } from '@/lib/mongodb';
import {
  buildOrderTrackingKey,
  normalizeCaseIds,
  normalizeTrackedOrderCase,
  normalizeTrackedOrderCases,
} from '@/lib/tracking';
import { getCourtHistory } from '@/lib/courtHistory';
import { syncSchedule } from '@/lib/scheduleSync';
import { fetchAllahabadCounselCauseList, fetchLucknowCounselCauseList } from '@/models/causeListModel';
import { fetchCaseTypes, fetchOrders } from '@/models/ordersModel';
import { Notification, TrackedOrderCase } from '@/types/court';
import { findLawyerProfile, markLawyerProfileUsed, serializeLawyerProfile } from '@/lib/lawyerProfiles';
import {
  recordAiChatRun,
  saveCauseListSnapshot,
  saveNotificationSummary,
  saveScheduleSummary,
  saveStatusSnapshot,
  saveWebDiarySnapshot,
  upsertCaseRegistry,
} from '@/lib/aiStore';
import { runGpt5Nano } from '@/lib/gpt5Nano';
import { buildJudgmentViewerHref, loadLatestJudgmentDocument } from '@/lib/judgmentDocument';
import { GET as getWebDiary } from '@/controllers/webDiaryController';

export type AiClientState = {
  profileKey?: string | null;
  userId?: string | null;
  email?: string | null;
  trackedCaseIds?: unknown;
  trackedOrderCases?: unknown;
};

type ChatTurn = {
  role: 'user' | 'assistant';
  content: string;
};

type PlannerToolCall = {
  name: string;
  arguments?: Record<string, unknown>;
};

type ExecutedToolResult = {
  tool: string;
  ok: boolean;
  summary: string;
  data?: unknown;
  clientMutation?: {
    trackedCaseIds?: string[];
    trackedOrderCases?: TrackedOrderCase[];
  };
};

export type AiAssistantResponse = {
  requestId: string;
  answer: string;
  plan: unknown;
  toolResults: ExecutedToolResult[];
  clientMutation?: {
    trackedCaseIds?: string[];
    trackedOrderCases?: TrackedOrderCase[];
  };
  lawyerProfile: ReturnType<typeof serializeLawyerProfile>;
};

type NormalizedClientState = {
  profileKey: string | null;
  userId: string | null;
  email: string | null;
  trackedCaseIds: string[];
  trackedOrderCases: TrackedOrderCase[];
};

const DISPLAY_TIME_ZONE = 'Asia/Kolkata';

const ALLOWED_TOOLS = new Set([
  'get_my_cases',
  'get_case_status',
  'check_cause_list_assignments',
  'get_web_diary',
  'check_courtroom_transfer',
  'get_alerts',
  'track_case',
]);

function normalizeClientState(state: AiClientState): NormalizedClientState {
  return {
    profileKey: String(state.profileKey || '').trim() || null,
    userId: String(state.userId || '').trim() || null,
    email: String(state.email || '').trim() || null,
    trackedCaseIds: normalizeCaseIds(state.trackedCaseIds),
    trackedOrderCases: normalizeTrackedOrderCases(state.trackedOrderCases),
  };
}

function deriveCaseIdFromTrackedOrderCase(trackedCase: TrackedOrderCase): string | null {
  const caseNo = String(trackedCase.caseNo || '').trim();
  const caseYear = String(trackedCase.caseYear || '').trim();
  if (!/^\d+$/.test(caseNo) || !/^\d{4}$/.test(caseYear)) return null;

  const label = String(trackedCase.caseTypeLabel || '').trim();
  const primaryToken = label ? label.split('-')[0]?.trim() || label : '';
  const caseCode = primaryToken.split(/\s+/)[0]?.trim().toUpperCase() || '';
  if (!/^[A-Z0-9]+$/.test(caseCode)) return null;

  return `${caseCode}/${caseNo}/${caseYear}`;
}

function normalizeBench(value?: string | null): 'lucknow' | 'allahabad' {
  return String(value || '').toLowerCase().includes('allahabad') ? 'allahabad' : 'lucknow';
}

function normalizeCourtNo(value: string) {
  const digits = String(value || '').match(/\d+/g);
  return digits ? digits.join('') : String(value || '').trim().toLowerCase();
}

function parseDateParts(rawValue?: string | null) {
  const value = String(rawValue || '').trim();
  if (!value) return null;

  const normalized = value.replace(/\./g, '/').replace(/-/g, '/');
  const slashParts = normalized.split('/');
  if (slashParts.length === 3) {
    if (slashParts[0].length === 4) {
      const [year, month, day] = slashParts;
      if (/^\d{4}$/.test(year) && /^\d{1,2}$/.test(month) && /^\d{1,2}$/.test(day)) {
        return { day: Number(day), month: Number(month), year: Number(year) };
      }
    }

    const [day, month, year] = slashParts;
    if (/^\d{1,2}$/.test(day) && /^\d{1,2}$/.test(month) && /^\d{4}$/.test(year)) {
      return { day: Number(day), month: Number(month), year: Number(year) };
    }
  }

  return null;
}

function formatBenchDate(
  input: string | null | undefined,
  bench: 'lucknow' | 'allahabad'
): string | null {
  const parsed = parseDateParts(input);
  if (!parsed) return null;

  const day = String(parsed.day).padStart(2, '0');
  const month = String(parsed.month).padStart(2, '0');
  const year = String(parsed.year);
  return bench === 'allahabad' ? `${day}-${month}-${year}` : `${day}/${month}/${year}`;
}

function formatWebDiaryDate(input: string | null | undefined): string | null {
  const parsed = parseDateParts(input);
  if (!parsed) return null;
  return `${parsed.day}/${parsed.month}/${parsed.year}`;
}

function formatDisplayDate(input: string | null | undefined) {
  const parsed = parseDateParts(input);
  if (!parsed) return String(input || '').trim() || null;

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: DISPLAY_TIME_ZONE,
  }).format(new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)));
}

function formatDisplayTimestamp(input: Date | string | null | undefined) {
  if (!input) return null;
  const value = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(value.getTime())) return null;

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: DISPLAY_TIME_ZONE,
  }).format(value);
}

function extractCaseId(message: string): string | null {
  const match = message.match(/\b[A-Z][A-Z0-9]*\/\d+\/\d{4}\b/i);
  return match ? match[0].toUpperCase() : null;
}

function extractCaseNumberParts(message: string) {
  const match = message.match(/([A-Za-z][A-Za-z .()/-]{1,50}?)\s+(\d{1,8})\s+(?:of|\/)\s+(\d{4})/i);
  if (!match) return null;
  return {
    caseTypeQuery: cleanCaseTypeQuery(match[1].trim()),
    caseNo: match[2].trim(),
    caseYear: match[3].trim(),
  };
}

function extractCourtroomArgs(message: string) {
  const courtMatch = message.match(/court\s*room\s*([0-9]+)/i) || message.match(/court\s*([0-9]+)/i);
  const serialMatch = message.match(/serial\s*(?:number|no\.?)?\s*([0-9]+)/i);
  return {
    courtNo: courtMatch?.[1] || '',
    serialNo: serialMatch?.[1] || '',
  };
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const text = raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

function cleanCaseTypeQuery(value: string) {
  let nextValue = String(value || '').trim();

  const leadingPatterns = [
    /^(what(?:'s| is)? the status of)\s+/i,
    /^(what(?:'s| is)? status of)\s+/i,
    /^(status of)\s+/i,
    /^(show(?: me)?(?: the)? status of)\s+/i,
    /^(check(?: the)? status of)\s+/i,
    /^(give me(?: the)? status of)\s+/i,
    /^(case status of)\s+/i,
    /^(details of)\s+/i,
    /^(what(?:'s| is)? the latest order in)\s+/i,
    /^(what(?:'s| is)? the latest order for)\s+/i,
    /^(latest order in)\s+/i,
    /^(latest order for)\s+/i,
    /^(how many orders are there in)\s+/i,
    /^(how many orders in)\s+/i,
    /^(orders in)\s+/i,
    /^(how many judgments are there in)\s+/i,
    /^(how many judgments in)\s+/i,
    /^(judgments in)\s+/i,
    /^(track this case)\s+/i,
    /^(track)\s+/i,
  ];

  for (const pattern of leadingPatterns) {
    nextValue = nextValue.replace(pattern, '').trim();
  }

  return nextValue
    .replace(/\s+in\s+(lucknow|allahabad)\s+bench.*$/i, '')
    .replace(/[?.!,;:]+$/g, '')
    .trim();
}

function getToolArg(args: Record<string, unknown> | undefined, ...keys: string[]) {
  if (!args) return undefined;
  for (const key of keys) {
    if (key in args) return args[key];
  }
  return undefined;
}

function normalizeIntentText(message: string) {
  return String(message || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function extractBenchMention(message: string): 'lucknow' | 'allahabad' | null {
  const normalized = normalizeIntentText(message);
  if (normalized.includes('allahabad')) return 'allahabad';
  if (normalized.includes('lucknow')) return 'lucknow';
  return null;
}

function extractReferencedDate(message: string) {
  const match = String(message || '').match(/\b\d{1,4}[\/.-]\d{1,2}[\/.-]\d{1,4}\b/);
  return match?.[0] || '';
}

function getTimeZoneDateKey(input: Date | string, timeZone = DISPLAY_TIME_ZONE) {
  const value = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(value.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  }).format(value);
}

function isTrackedCasesLookup(message: string) {
  const lowerMessage = normalizeIntentText(message);
  if (isTrackedCasesStatusLookup(message) || isAlertsLookup(message)) return false;
  if (!/\b(track|tracked|tracking)\b/.test(lowerMessage)) return false;

  return [
    /\bwhich cases\b.*\b(track|tracked|tracking)\b/,
    /\bwhat cases\b.*\b(track|tracked|tracking)\b/,
    /\bshow\b.*\b(track|tracked|tracking)\b/,
    /\blist\b.*\b(track|tracked|tracking)\b/,
    /\btracked cases\b/,
    /\b(cases of mine|my cases)\b.*\btracked\b/,
    /\b(getting|being)\s+tracked\b/,
    /\b(am i|i am|i'm)\b.*\b(track|tracking)\b/,
    /\bwhat am i tracking\b/,
  ].some((pattern) => pattern.test(lowerMessage));
}

function isTrackedCasesStatusLookup(message: string) {
  const lowerMessage = normalizeIntentText(message);
  if (!/\bstatus\b/.test(lowerMessage)) return false;

  return [
    /\bwhat('?s| is)? the status of my cases?\b/,
    /\bstatus of my cases?\b/,
    /\bstatus of tracked cases?\b/,
    /\bstatus of saved cases?\b/,
    /\bshow( me)? the status of my cases?\b/,
    /\bmy cases?\b.*\bstatus\b/,
    /\btracked cases?\b.*\bstatus\b/,
    /\bsaved cases?\b.*\bstatus\b/,
  ].some((pattern) => pattern.test(lowerMessage));
}

function isLatestOrderLookup(message: string) {
  const lowerMessage = normalizeIntentText(message);
  return /\blatest (order|judgment)\b/.test(lowerMessage);
}

function isOrderCountLookup(message: string) {
  const lowerMessage = normalizeIntentText(message);
  return [
    /\bhow many orders?\b/,
    /\bhow many judgments?\b/,
    /\borders? count\b/,
    /\bjudgments? count\b/,
    /\bnumber of orders?\b/,
    /\bnumber of judgments?\b/,
  ].some((pattern) => pattern.test(lowerMessage));
}

function isAlertsLookup(message: string) {
  const lowerMessage = normalizeIntentText(message);

  if (/\balert(s)?\b/.test(lowerMessage)) return true;

  return [
    /\bany updates?\b/,
    /\bshow updates?\b/,
    /\bnew order\b/,
    /\bnew judgment\b/,
    /\bcourtroom change\b/,
    /\bchange alerts?\b/,
    /\bupdates? in my tracked cases\b/,
    /\bupdates? for my tracked cases\b/,
    /\bupdates? in my cases\b/,
  ].some((pattern) => pattern.test(lowerMessage));
}

function getCaseStatusResponseMode(message: string, useTrackedCases: boolean) {
  if (useTrackedCases) return 'tracked_overview' as const;
  if (isLatestOrderLookup(message)) return 'latest_order' as const;
  if (isOrderCountLookup(message)) return 'order_count' as const;
  return 'status' as const;
}

function isTrackAction(message: string) {
  const lowerMessage = normalizeIntentText(message);
  if (!/\btrack\b/.test(lowerMessage)) return false;
  if (isTrackedCasesLookup(message) || isTrackedCasesStatusLookup(message) || isAlertsLookup(message)) {
    return false;
  }

  return [
    /^track\b/,
    /\btrack this case\b/,
    /\btrack .* for me\b/,
    /\bstart tracking\b/,
    /\badd .*tracking\b/,
  ].some((pattern) => pattern.test(lowerMessage));
}

function isCauseListAssignmentLookup(message: string) {
  const lowerMessage = normalizeIntentText(message);
  if (!lowerMessage.includes('cause list')) return false;

  return [
    /\bassigned to me\b/,
    /\bany case assigned to me\b/,
    /\bfor me\b/,
    /\bmy aliases\b/,
    /\bmy lawyer profile\b/,
  ].some((pattern) => pattern.test(lowerMessage));
}

function isWebDiaryLookup(message: string) {
  const lowerMessage = normalizeIntentText(message);
  return /\bweb diary\b/.test(lowerMessage) || /\bdiary notices?\b/.test(lowerMessage);
}

function isCourtroomTransferLookup(message: string) {
  const lowerMessage = normalizeIntentText(message);
  return [
    /\btransfer\b.*\bcourt/,
    /\bcourtroom\b.*\btransfer\b/,
    /\bmove(d|ment)?\b.*\bcourt/,
    /\bwhere is\b.*\blive board\b/,
  ].some((pattern) => pattern.test(lowerMessage));
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutId: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function resolveCaseTypeValue(
  city: 'lucknow' | 'allahabad',
  caseTypeCandidate: string
) {
  const candidate = String(caseTypeCandidate || '').trim();
  if (!candidate) return null;

  const options = await fetchCaseTypes(city);
  const normalizedCandidate = candidate.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const exactByValue = options.find((option) => option.value === candidate);
  if (exactByValue) return exactByValue;

  const scored = options
    .map((option) => {
      const normalizedLabel = option.label.toUpperCase().replace(/[^A-Z0-9]/g, '');
      let score = 0;
      if (normalizedLabel === normalizedCandidate) score = 5;
      else if (normalizedLabel.includes(normalizedCandidate)) score = 4;
      else if (normalizedCandidate.includes(normalizedLabel)) score = 3;
      else if (option.label.toUpperCase().includes(candidate.toUpperCase())) score = 2;
      else if (candidate.toUpperCase().includes(option.label.toUpperCase())) score = 1;
      return { option, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  return scored[0]?.option || null;
}

async function buildPlanner(message: string, history: ChatTurn[], clientState: NormalizedClientState, lawyerProfile: ReturnType<typeof serializeLawyerProfile>) {
  const fallbackPlanner = () => {
    const lowerMessage = normalizeIntentText(message);
    if (isTrackedCasesLookup(message)) {
      return { tools: [{ name: 'get_my_cases', arguments: {} }] };
    }

    if (isTrackedCasesStatusLookup(message)) {
      return {
        tools: [
          {
            name: 'get_case_status',
            arguments: { useTrackedCases: true },
          },
        ],
      };
    }

    if (isAlertsLookup(message)) {
      return { tools: [{ name: 'get_alerts', arguments: {} }] };
    }

    if (isTrackAction(message)) {
      const caseId = extractCaseId(message);
      const caseParts = extractCaseNumberParts(message);
      return {
        tools: [
          {
            name: 'track_case',
            arguments: {
              caseId,
              city: extractBenchMention(message) || undefined,
              ...(caseParts || {}),
            },
          },
        ],
      };
    }

    if (isCauseListAssignmentLookup(message)) {
      return { tools: [{ name: 'check_cause_list_assignments', arguments: {} }] };
    }

    if (isCourtroomTransferLookup(message)) {
      return {
        tools: [
          {
            name: 'check_courtroom_transfer',
            arguments: {
              ...extractCourtroomArgs(message),
              caseId: extractCaseId(message) || undefined,
            },
          },
        ],
      };
    }

    if (
      lowerMessage.includes('status') ||
      lowerMessage.includes('judgment') ||
      lowerMessage.includes('order')
    ) {
      return {
        tools: [
          {
            name: 'get_case_status',
            arguments: {
              ...(isTrackedCasesStatusLookup(message) ? { useTrackedCases: true } : {}),
              city: normalizeBench(message),
              ...(extractCaseNumberParts(message) || {}),
              caseId: extractCaseId(message),
            },
          },
        ],
      };
    }

    if (isWebDiaryLookup(message)) {
      return { tools: [{ name: 'get_web_diary', arguments: {} }] };
    }

    return { tools: [{ name: 'get_my_cases', arguments: {} }] };
  };

  const historyText = history
    .slice(-6)
    .map((turn) => `${turn.role.toUpperCase()}: ${turn.content}`)
    .join('\n');

  let plannerResponse = '';
  try {
    plannerResponse = await withTimeout(
      runGpt5Nano({
        messages: [
          {
            role: 'system',
            content:
              'You route lawyer requests inside a court-monitoring app. Return only valid JSON. Schema: {"tools":[{"name":"tool_name","arguments":{}}]}. Use at most 3 tools. Available tools: get_my_cases, get_case_status, check_cause_list_assignments, get_web_diary, check_courtroom_transfer, get_alerts, track_case. If the request is about which cases are already being tracked or saved, use get_my_cases, not track_case. If the request asks for the status of saved, tracked, or "my" cases, use get_case_status with {"useTrackedCases":true}. If the request asks for alerts or updates on tracked/my/saved cases, use get_alerts. If the request is about "assigned to me", use check_cause_list_assignments. If it is about transfer or movement in a courtroom, use check_courtroom_transfer. If it is about case status or orders/judgments for a specific case, use get_case_status. If it is about saving or tracking a new case, use track_case. Never treat "which cases are tracked", "show tracked cases", or "updates in my tracked cases" as track_case.',
          },
          {
            role: 'user',
            content: [
              `Current lawyer profile configured: ${lawyerProfile ? 'yes' : 'no'}.`,
              `Tracked case IDs count: ${clientState.trackedCaseIds.length}.`,
              `Tracked order cases count: ${clientState.trackedOrderCases.length}.`,
              historyText ? `Recent conversation:\n${historyText}` : '',
              `User request: ${message}`,
            ]
              .filter(Boolean)
              .join('\n\n'),
          },
        ],
        maxCompletionTokens: 1400,
      }),
      15000,
      'planner model'
    );
  } catch {
    return fallbackPlanner();
  }

  const parsed = extractJsonObject(plannerResponse);
  const tools = Array.isArray(parsed?.tools) ? (parsed?.tools as unknown[]) : [];
  const sanitizedTools = tools
    .map((tool) => {
      if (!tool || typeof tool !== 'object') return null;
      const rawTool = tool as { name?: unknown; arguments?: unknown };
      const name = String(rawTool.name || '').trim();
      if (!ALLOWED_TOOLS.has(name)) return null;
      return {
        name,
        arguments:
          rawTool.arguments && typeof rawTool.arguments === 'object'
            ? (rawTool.arguments as Record<string, unknown>)
            : {},
      } as PlannerToolCall;
    })
    .filter((tool): tool is PlannerToolCall => Boolean(tool))
    .slice(0, 3);

  if (isTrackedCasesLookup(message)) {
    return { tools: [{ name: 'get_my_cases', arguments: {} }] };
  }

  if (isTrackedCasesStatusLookup(message)) {
    return { tools: [{ name: 'get_case_status', arguments: { useTrackedCases: true } }] };
  }

  if (isAlertsLookup(message)) {
    return { tools: [{ name: 'get_alerts', arguments: {} }] };
  }

  if (isCauseListAssignmentLookup(message)) {
    return { tools: [{ name: 'check_cause_list_assignments', arguments: {} }] };
  }

  if (isCourtroomTransferLookup(message)) {
    return {
      tools: [
        {
          name: 'check_courtroom_transfer',
          arguments: {
            ...extractCourtroomArgs(message),
            caseId: extractCaseId(message) || undefined,
          },
        },
      ],
    };
  }

  if (isWebDiaryLookup(message)) {
    return { tools: [{ name: 'get_web_diary', arguments: {} }] };
  }

  if (isTrackAction(message)) {
    return {
      tools: [
        {
          name: 'track_case',
          arguments: {
            caseId: extractCaseId(message) || undefined,
            city: extractBenchMention(message) || undefined,
            ...(extractCaseNumberParts(message) || {}),
          },
        },
      ],
    };
  }

  if (sanitizedTools.length > 0) {
    return { tools: sanitizedTools };
  }
  return fallbackPlanner();
}

function formatTrackedOrderLabel(trackedCase: TrackedOrderCase) {
  return `${trackedCase.caseTypeLabel || trackedCase.caseType} ${trackedCase.caseNo}/${trackedCase.caseYear}`;
}

function getEffectiveTrackedCaseIds(clientState: NormalizedClientState) {
  return Array.from(
    new Set([
      ...clientState.trackedCaseIds,
      ...clientState.trackedOrderCases
        .map((trackedCase) => deriveCaseIdFromTrackedOrderCase(trackedCase))
        .filter((caseId): caseId is string => Boolean(caseId)),
    ])
  );
}

async function loadRelevantNotifications(
  db: Awaited<ReturnType<typeof getDb>>,
  clientState: NormalizedClientState,
  limit = 100
) {
  const notificationsCollection = db.collection<Notification>('notifications');
  const changesCollection = db.collection('changes');
  const trackedOrderKeys = new Set(
    clientState.trackedOrderCases.map((trackedCase) => trackedCase.trackingKey)
  );
  const trackedCaseIds = new Set(getEffectiveTrackedCaseIds(clientState));

  let notifications = await notificationsCollection
    .find({})
    .sort({ timestamp: -1 })
    .limit(limit * 4)
    .toArray();

  const hasCaseFilter = trackedCaseIds.size > 0;
  const hasOrderFilter = trackedOrderKeys.size > 0;
  if (!hasCaseFilter && !hasOrderFilter) {
    return notifications;
  }

  const changeRecordMap = new Map<string, Notification['metadata'] & { oldCaseNumber?: string | null; newCaseNumber?: string | null }>();
  if (hasCaseFilter) {
    const { ObjectId } = await import('mongodb');
    const changeRecordObjectIds = notifications
      .map((notification) => String(notification.changeRecordId || '').trim())
      .filter(Boolean)
      .map((id) => {
        try {
          return new ObjectId(id);
        } catch {
          return null;
        }
      })
      .filter((id): id is InstanceType<typeof ObjectId> => id !== null);

    if (changeRecordObjectIds.length > 0) {
      const changeRecords = await changesCollection
        .find({ _id: { $in: changeRecordObjectIds } })
        .toArray();

      for (const changeRecord of changeRecords) {
        changeRecordMap.set(String(changeRecord._id), {
          oldCaseNumber: String(changeRecord.oldValue?.caseDetails?.caseNumber || '').toUpperCase() || null,
          newCaseNumber: String(changeRecord.newValue?.caseDetails?.caseNumber || '').toUpperCase() || null,
        });
      }
    }
  }

  notifications = notifications.filter((notification) => {
    if (notification.type === 'order_update') {
      const trackingKey = String(notification.orderTrackingKey || '').trim();
      return Boolean(trackingKey && trackedOrderKeys.has(trackingKey));
    }

    const changeRecord = changeRecordMap.get(String(notification.changeRecordId || '').trim());
    if (!changeRecord) return false;

    return Boolean(
      (changeRecord.oldCaseNumber && trackedCaseIds.has(changeRecord.oldCaseNumber)) ||
        (changeRecord.newCaseNumber && trackedCaseIds.has(changeRecord.newCaseNumber))
    );
  });

  return notifications.slice(0, limit);
}

async function findTrackedOrderCaseByCaseId(
  db: Awaited<ReturnType<typeof getDb>>,
  clientState: NormalizedClientState,
  caseId: string
) {
  const normalizedCaseId = String(caseId || '').trim().toUpperCase();
  if (!normalizedCaseId) return null;

  const trackedMatch = clientState.trackedOrderCases.find(
    (trackedCase) => deriveCaseIdFromTrackedOrderCase(trackedCase) === normalizedCaseId
  );
  if (trackedMatch) return trackedMatch;

  const registry = await db.collection('case_registry').findOne({
    $or: [
      { caseKey: normalizedCaseId },
      { canonicalCaseId: normalizedCaseId },
      { explicitCaseIds: normalizedCaseId },
    ],
  });

  const registryTrackers = normalizeTrackedOrderCases(registry?.orderTrackers);
  return registryTrackers[0] || null;
}

async function loadTrackedStatuses(
  db: Awaited<ReturnType<typeof getDb>>,
  clientState: NormalizedClientState
): Promise<ExecutedToolResult> {
  const effectiveCaseIds = getEffectiveTrackedCaseIds(clientState);

  if (effectiveCaseIds.length === 0 && clientState.trackedOrderCases.length === 0) {
    return {
      tool: 'get_case_status',
      ok: false,
      summary: 'No tracked cases are available in your current session.',
    };
  }

  const caseEntries = new Map<
    string,
    {
      caseKey: string;
      caseId: string | null;
      referenceLabel: string;
      trackingModes: string[];
      trackingKey?: string;
      liveBoard?: {
        visible: boolean;
        courtNo: string | null;
        serialNo: string | null;
        progress: string | null;
        title: string | null;
      };
      orderStatus?: {
        trackingKey: string;
        city: string;
        caseLabel: string;
        status: string | null;
        title: string | null;
        latestOrderDate: string | null;
        orderJudgmentsCount: number;
      };
    }
  >();
  const errors: string[] = [];

  for (const caseId of clientState.trackedCaseIds) {
    caseEntries.set(caseId, {
      caseKey: caseId,
      caseId,
      referenceLabel: caseId,
      trackingModes: ['schedule'],
    });
  }

  for (const trackedCase of clientState.trackedOrderCases) {
    const derivedCaseId = deriveCaseIdFromTrackedOrderCase(trackedCase);
    const caseKey = derivedCaseId || trackedCase.trackingKey;
    const existing = caseEntries.get(caseKey);
    caseEntries.set(caseKey, {
      caseKey,
      caseId: derivedCaseId || existing?.caseId || null,
      referenceLabel: derivedCaseId || formatTrackedOrderLabel(trackedCase),
      trackingModes: Array.from(new Set([...(existing?.trackingModes || []), 'order-status'])),
      trackingKey: trackedCase.trackingKey,
      liveBoard: existing?.liveBoard,
      orderStatus: existing?.orderStatus,
    });
  }

  if (effectiveCaseIds.length > 0) {
    try {
      const latestResult = await syncSchedule({
        db,
        force: false,
        source: 'ai_chat',
      });
      const schedule = latestResult.schedule;
      const scheduleCourts = schedule?.courts || [];

      for (const caseId of effectiveCaseIds) {
        const matchedCourt =
          scheduleCourts.find(
            (court) => String(court.caseDetails?.caseNumber || '').toUpperCase() === caseId
          ) || null;
        const existing = caseEntries.get(caseId);

        if (matchedCourt) {
          await upsertCaseRegistry(db, {
            caseKey: caseId,
            canonicalCaseId: caseId,
            title: matchedCourt.caseDetails?.title || null,
            explicitCaseIds: [caseId],
          });
          await saveScheduleSummary(db, {
            caseKey: caseId,
            canonicalCaseId: caseId,
            title: matchedCourt.caseDetails?.title || null,
            boardDate: schedule!.date,
            lastUpdated: new Date(schedule!.lastUpdated),
            court: matchedCourt,
          });
        }

        caseEntries.set(caseId, {
          caseKey: caseId,
          caseId,
          referenceLabel: existing?.referenceLabel || caseId,
          trackingModes: Array.from(new Set([...(existing?.trackingModes || []), 'schedule'])),
          trackingKey: existing?.trackingKey,
          orderStatus: existing?.orderStatus,
          liveBoard: {
            visible: Boolean(matchedCourt),
            courtNo: matchedCourt?.courtNo || null,
            serialNo: matchedCourt?.serialNo || null,
            progress: matchedCourt?.progress || null,
            title: matchedCourt?.caseDetails?.title || null,
          },
        });
      }
    } catch (error) {
      errors.push(
        error instanceof Error ? error.message : 'Failed to load live board status for tracked cases.'
      );
    }
  }

  const trackedOrderCasesToCheck = clientState.trackedOrderCases.slice(0, 5);
  for (const trackedCase of trackedOrderCasesToCheck) {
    try {
      const result = await withTimeout(
        fetchOrders({
          city: trackedCase.city,
          caseType: trackedCase.caseType,
          caseNo: trackedCase.caseNo,
          caseYear: trackedCase.caseYear,
        }),
        20000,
        `Tracked case status for ${trackedCase.trackingKey}`
      );

      const derivedCaseId = deriveCaseIdFromTrackedOrderCase(trackedCase);
      await upsertCaseRegistry(db, {
        caseKey: derivedCaseId || trackedCase.trackingKey,
        canonicalCaseId: derivedCaseId,
        title: result.caseInfo.petitionerVsRespondent || null,
        explicitCaseIds: derivedCaseId ? [derivedCaseId] : [],
        orderTrackers: [trackedCase],
      });
      await saveStatusSnapshot(db, {
        caseKey: derivedCaseId || trackedCase.trackingKey,
        canonicalCaseId: derivedCaseId,
        city: trackedCase.city,
        caseType: trackedCase.caseType,
        caseNo: trackedCase.caseNo,
        caseYear: trackedCase.caseYear,
        result,
      });

      const caseKey = derivedCaseId || trackedCase.trackingKey;
      const existing = caseEntries.get(caseKey);
      caseEntries.set(caseKey, {
        caseKey,
        caseId: derivedCaseId || existing?.caseId || null,
        referenceLabel: derivedCaseId || existing?.referenceLabel || formatTrackedOrderLabel(trackedCase),
        trackingModes: Array.from(new Set([...(existing?.trackingModes || []), 'order-status'])),
        trackingKey: trackedCase.trackingKey,
        liveBoard: existing?.liveBoard,
        orderStatus: {
          trackingKey: trackedCase.trackingKey,
          city: trackedCase.city,
          caseLabel: `${result.caseInfo.caseType} ${trackedCase.caseNo}/${trackedCase.caseYear}`,
          status: result.caseInfo.status || null,
          title: result.caseInfo.petitionerVsRespondent || null,
          latestOrderDate: result.orderJudgments[0]?.date || null,
          orderJudgmentsCount: result.orderJudgments.length,
        },
      });
    } catch (error) {
      errors.push(
        error instanceof Error
          ? error.message
          : `Failed to load tracked order status for ${trackedCase.trackingKey}.`
      );
    }
  }

  const skippedOrderCases = Math.max(clientState.trackedOrderCases.length - trackedOrderCasesToCheck.length, 0);
  const cases = Array.from(caseEntries.values());
  const visibleCount = cases.filter((entry) => entry.liveBoard?.visible).length;
  const orderLoadedCount = cases.filter((entry) => entry.orderStatus).length;

  return {
    tool: 'get_case_status',
    ok: cases.length > 0,
    summary: `Loaded detailed status for ${cases.length} tracked case${cases.length === 1 ? '' : 's'}. ${visibleCount} visible on the live board. ${orderLoadedCount} order-status record${orderLoadedCount === 1 ? '' : 's'} loaded.${skippedOrderCases > 0 ? ` ${skippedOrderCases} additional tracked order cases were skipped in this response.` : ''}`,
    data: {
      cases,
      errors,
      skippedOrderCases,
    },
  };
}

async function runTool(
  tool: PlannerToolCall,
  message: string,
  clientState: NormalizedClientState,
  lawyerProfile: Awaited<ReturnType<typeof findLawyerProfile>>
): Promise<ExecutedToolResult> {
  const db = await getDb();
  const trackedCaseIds = [...clientState.trackedCaseIds];
  const trackedOrderCases = [...clientState.trackedOrderCases];

  if (tool.name === 'get_my_cases') {
    const effectiveCaseIds = getEffectiveTrackedCaseIds(clientState);

    for (const caseId of effectiveCaseIds) {
      await upsertCaseRegistry(db, {
        caseKey: caseId,
        canonicalCaseId: caseId,
        explicitCaseIds: [caseId],
      });
    }

    for (const trackedCase of trackedOrderCases) {
      await upsertCaseRegistry(db, {
        caseKey: deriveCaseIdFromTrackedOrderCase(trackedCase) || trackedCase.trackingKey,
        canonicalCaseId: deriveCaseIdFromTrackedOrderCase(trackedCase),
        explicitCaseIds: deriveCaseIdFromTrackedOrderCase(trackedCase)
          ? [deriveCaseIdFromTrackedOrderCase(trackedCase)!]
          : [],
        orderTrackers: [trackedCase],
      });
    }

    const cases = effectiveCaseIds.map((caseId) => {
      const matchedTracker = trackedOrderCases.find(
        (trackedCase) => deriveCaseIdFromTrackedOrderCase(trackedCase) === caseId
      );
      return {
        caseId,
        scheduleTracked: trackedCaseIds.includes(caseId),
        orderTracked: Boolean(matchedTracker),
        orderTrackerLabel: matchedTracker ? formatTrackedOrderLabel(matchedTracker) : null,
        city: matchedTracker?.city || null,
      };
    });

    return {
      tool: tool.name,
      ok: true,
      summary: `Tracking ${cases.length} case reference${cases.length === 1 ? '' : 's'}: ${cases.map((entry) => entry.caseId).join(', ') || 'none'}.`,
      data: {
        cases,
        trackedCaseIds: effectiveCaseIds,
        trackedOrderCases: trackedOrderCases.map((trackedCase) => ({
          trackingKey: trackedCase.trackingKey,
          city: trackedCase.city,
          label: formatTrackedOrderLabel(trackedCase),
          caseId: deriveCaseIdFromTrackedOrderCase(trackedCase),
        })),
      },
    };
  }

  if (tool.name === 'track_case') {
    const caseId = String(
      getToolArg(tool.arguments, 'caseId', 'case_id') || extractCaseId(message) || ''
    )
      .trim()
      .toUpperCase();
    const city = normalizeBench(String(getToolArg(tool.arguments, 'city', 'bench') || 'lucknow'));
    const caseNo = String(getToolArg(tool.arguments, 'caseNo', 'case_no') || '').trim();
    const caseYear = String(getToolArg(tool.arguments, 'caseYear', 'case_year') || '').trim();
    const caseTypeCandidate = String(
      getToolArg(tool.arguments, 'caseType', 'case_type', 'caseTypeQuery', 'case_type_query') ||
        ''
    )
      .trim();

    let nextTrackedCaseIds = [...trackedCaseIds];
    let nextTrackedOrderCases = [...trackedOrderCases];
    let changeSummary = '';

    if (caseId) {
      if (!nextTrackedCaseIds.includes(caseId)) {
        nextTrackedCaseIds = [...nextTrackedCaseIds, caseId];
      }
      await upsertCaseRegistry(db, {
        caseKey: caseId,
        canonicalCaseId: caseId,
        explicitCaseIds: [caseId],
      });
      changeSummary = `Case ID ${caseId} is now tracked.`;
    } else if (caseNo && caseYear && caseTypeCandidate) {
      const resolvedCaseType = await resolveCaseTypeValue(city, caseTypeCandidate);
      if (!resolvedCaseType) {
        return {
          tool: tool.name,
          ok: false,
          summary: `Could not match case type "${caseTypeCandidate}" for ${city}.`,
        };
      }

      const trackedOrderCase = normalizeTrackedOrderCase({
        city,
        caseType: resolvedCaseType.value,
        caseTypeLabel: resolvedCaseType.label,
        caseNo,
        caseYear,
      });

      if (!trackedOrderCase) {
        return {
          tool: tool.name,
          ok: false,
          summary: 'Tracking needs a valid case type, numeric case number, and 4-digit case year.',
        };
      }

      if (!nextTrackedOrderCases.some((entry) => entry.trackingKey === trackedOrderCase.trackingKey)) {
        nextTrackedOrderCases = [...nextTrackedOrderCases, trackedOrderCase];
      }

      const derivedCaseId = deriveCaseIdFromTrackedOrderCase(trackedOrderCase);
      await upsertCaseRegistry(db, {
        caseKey: derivedCaseId || trackedOrderCase.trackingKey,
        canonicalCaseId: derivedCaseId,
        explicitCaseIds: derivedCaseId ? [derivedCaseId] : [],
        orderTrackers: [trackedOrderCase],
      });
      changeSummary = `Order tracking is now enabled for ${resolvedCaseType.label} ${caseNo}/${caseYear}.`;
    } else {
      return {
        tool: tool.name,
        ok: false,
        summary: 'I need either a case ID or a case type/no/year to start tracking.',
      };
    }

    if (clientState.userId) {
      const usersCollection = db.collection('users');
      await usersCollection.updateOne(
        { _id: new (await import('mongodb')).ObjectId(clientState.userId) },
        {
          $set: {
            caseIds: nextTrackedCaseIds,
            trackedOrderCases: nextTrackedOrderCases,
            updatedAt: new Date(),
          },
        }
      );
    }

    return {
      tool: tool.name,
      ok: true,
      summary: changeSummary,
      clientMutation: {
        trackedCaseIds: nextTrackedCaseIds,
        trackedOrderCases: nextTrackedOrderCases,
      },
      data: {
        trackedCaseIds: nextTrackedCaseIds,
        trackedOrderCases: nextTrackedOrderCases,
      },
    };
  }

  if (tool.name === 'get_case_status') {
    const useTrackedCases =
      Boolean(getToolArg(tool.arguments, 'useTrackedCases', 'use_tracked_cases')) ||
      isTrackedCasesStatusLookup(message);
    const responseMode = getCaseStatusResponseMode(message, useTrackedCases);
    let city = normalizeBench(
      String(getToolArg(tool.arguments, 'city', 'bench') || message)
    );
    const caseId = String(
      getToolArg(tool.arguments, 'caseId', 'case_id') || extractCaseId(message) || ''
    )
      .trim()
      .toUpperCase();
    const fallbackParts = extractCaseNumberParts(message);
    let caseNo = String(
      getToolArg(tool.arguments, 'caseNo', 'case_no') || fallbackParts?.caseNo || ''
    ).trim();
    let caseYear = String(
      getToolArg(tool.arguments, 'caseYear', 'case_year') || fallbackParts?.caseYear || ''
    ).trim();
    let caseTypeCandidate = cleanCaseTypeQuery(
      String(
        getToolArg(tool.arguments, 'caseType', 'case_type', 'caseTypeQuery', 'case_type_query') ||
          fallbackParts?.caseTypeQuery ||
          ''
      ).trim()
    );

    if (useTrackedCases && !caseNo && !caseYear && !caseTypeCandidate && !caseId) {
      const trackedResult = await loadTrackedStatuses(db, clientState);
      return {
        ...trackedResult,
        data: {
          ...((trackedResult.data as Record<string, unknown> | undefined) || {}),
          responseMode,
        },
      };
    }

    if (caseId && (!caseNo || !caseYear || !caseTypeCandidate)) {
      const matchedTrackedCase = await findTrackedOrderCaseByCaseId(db, clientState, caseId);
      if (matchedTrackedCase) {
        city = matchedTrackedCase.city;
        caseNo = matchedTrackedCase.caseNo;
        caseYear = matchedTrackedCase.caseYear;
        caseTypeCandidate = matchedTrackedCase.caseTypeLabel || matchedTrackedCase.caseType;
      }
    }

    if (caseId && (!caseNo || !caseYear || !caseTypeCandidate)) {
      const latestResult = await syncSchedule({
        db,
        force: false,
        source: 'ai_chat',
      });
      const schedule = latestResult.schedule;
      const matchedCourt =
        schedule?.courts?.find(
          (court) => String(court.caseDetails?.caseNumber || '').toUpperCase() === caseId
        ) || null;

      if (matchedCourt && schedule) {
        await upsertCaseRegistry(db, {
          caseKey: caseId,
          canonicalCaseId: caseId,
          title: matchedCourt.caseDetails?.title || null,
          explicitCaseIds: [caseId],
        });
        await saveScheduleSummary(db, {
          caseKey: caseId,
          canonicalCaseId: caseId,
          title: matchedCourt.caseDetails?.title || null,
          boardDate: schedule.date,
          lastUpdated: new Date(schedule.lastUpdated),
          court: matchedCourt,
        });

        return {
          tool: tool.name,
          ok: true,
          summary: `Live board status loaded for ${caseId}. Court ${matchedCourt.courtNo}, serial ${matchedCourt.serialNo || 'not shown'}, progress ${matchedCourt.progress || 'not shown'}.`,
          data: {
            responseMode,
            caseId,
            city: null,
            caseInfo: null,
            liveBoard: {
              visible: true,
              boardDate: schedule.date,
              lastUpdated: new Date(schedule.lastUpdated).toISOString(),
              courtNo: matchedCourt.courtNo,
              serialNo: matchedCourt.serialNo || null,
              progress: matchedCourt.progress || null,
              title: matchedCourt.caseDetails?.title || null,
            },
            latestOrder: null,
            orderJudgmentsCount: 0,
          },
        };
      }

      return {
        tool: tool.name,
        ok: true,
        summary: `${caseId} is not visible on the latest live board snapshot, and no order-status tracker is saved for it.`,
        data: {
          responseMode,
          caseId,
          city: null,
          caseInfo: null,
          liveBoard: {
            visible: false,
            boardDate: schedule?.date || null,
            lastUpdated: schedule ? new Date(schedule.lastUpdated).toISOString() : null,
            courtNo: null,
            serialNo: null,
            progress: null,
            title: null,
          },
          latestOrder: null,
          orderJudgmentsCount: 0,
        },
      };
    }

    if (!caseNo || !caseYear || !caseTypeCandidate) {
      return {
        tool: tool.name,
        ok: false,
        summary: caseId
          ? `I could not resolve order-status details for ${caseId}. Save order tracking for this case, or ask using case type, case number, and case year.`
          : 'Case status needs case type, case number, and case year.',
      };
    }

    const resolvedCaseType = await resolveCaseTypeValue(city, caseTypeCandidate);
    if (!resolvedCaseType) {
      return {
        tool: tool.name,
        ok: false,
        summary: `Could not match case type "${caseTypeCandidate}" for ${city}.`,
      };
    }

    const result = await fetchOrders({
      city,
      caseType: resolvedCaseType.value,
      caseNo,
      caseYear,
    });

    const caseKey =
      caseId ||
      buildOrderTrackingKey({
        city,
        caseType: resolvedCaseType.value,
        caseNo,
        caseYear,
      });

    const trackedOrderCase = normalizeTrackedOrderCase({
      city,
      caseType: resolvedCaseType.value,
      caseTypeLabel: resolvedCaseType.label,
      caseNo,
      caseYear,
    });

    await upsertCaseRegistry(db, {
      caseKey,
      canonicalCaseId: caseId || deriveCaseIdFromTrackedOrderCase(trackedOrderCase!),
      title: result.caseInfo.petitionerVsRespondent || null,
      explicitCaseIds: caseId ? [caseId] : [],
      orderTrackers: trackedOrderCase ? [trackedOrderCase] : [],
    });

    await saveStatusSnapshot(db, {
      caseKey,
      canonicalCaseId: caseId || deriveCaseIdFromTrackedOrderCase(trackedOrderCase!),
      city,
      caseType: resolvedCaseType.value,
      caseNo,
      caseYear,
      result,
    });

    const latestOrder = result.orderJudgments[0] || null;
    let latestOrderDocument: Record<string, unknown> | null = null;
    if (responseMode === 'latest_order' && latestOrder) {
      const latestDocument = await loadLatestJudgmentDocument({
        caseLabel: `${result.caseInfo.caseType} ${caseNo}/${caseYear}`,
        latestOrder,
      });
      latestOrderDocument = {
        judgmentId: latestDocument.download.judgmentId,
        filename: latestDocument.download.filename,
        date: latestDocument.entry.date || null,
        viewUrl: latestDocument.entry.viewUrl,
        viewerHref: buildJudgmentViewerHref({
          viewUrl: latestDocument.entry.viewUrl,
          date: latestDocument.entry.date || null,
          page: latestDocument.citations[0]?.page || 1,
          title: `${result.caseInfo.caseType} ${caseNo}/${caseYear}`,
        }),
        summary: latestDocument.summary,
        citations: latestDocument.citations,
      };
    }

    return {
      tool: tool.name,
      ok: true,
      summary:
        responseMode === 'latest_order'
          ? 'Latest order document loaded.'
          : responseMode === 'order_count'
            ? 'Order count loaded.'
            : 'Case status loaded.',
      data: {
        responseMode,
        caseId: caseId || deriveCaseIdFromTrackedOrderCase(trackedOrderCase!),
        city,
        caseInfo: result.caseInfo,
        liveBoard: null,
        details: {
          keyValues: result.details.keyValues.slice(0, 12),
          listingHistoryCount: result.details.listingHistory.length,
          iaDetailsCount: result.details.iaDetails.length,
        },
        latestOrder,
        latestOrderDocument,
        orderJudgmentsCount: result.orderJudgments.length,
      },
    };
  }

  if (tool.name === 'check_cause_list_assignments') {
    const explicitCounselName = String(tool.arguments?.counselName || '').trim();
    const requestedBench = String(tool.arguments?.bench || '').trim();
    const inputDate = String(getToolArg(tool.arguments, 'date', 'listDate', 'list_date') || '').trim();
    const benchCandidates = requestedBench
      ? [normalizeBench(requestedBench)]
      : (['lucknow', 'allahabad'] as Array<'lucknow' | 'allahabad'>);

    const primaryNames = [
      explicitCounselName,
      lawyerProfile?.counselName || '',
      ...(lawyerProfile?.aliases || []),
    ];
    const fallbackNames = lawyerProfile?.chamberAliases || [];
    const dedupedPrimary = Array.from(
      new Set(primaryNames.map((item) => String(item || '').trim()).filter(Boolean))
    );
    const searchNames = (dedupedPrimary.length > 0 ? dedupedPrimary : fallbackNames).slice(0, 3);

    if (searchNames.length === 0) {
      return {
        tool: tool.name,
        ok: false,
        summary: 'Add your lawyer profile first, or specify the counsel name in the question.',
      };
    }

    const rawDate =
      inputDate ||
      extractReferencedDate(message);

    if (!rawDate) {
      return {
        tool: tool.name,
        ok: false,
        summary: 'Cause list assignment checks need a date.',
      };
    }

    const benchResults: Array<{
      bench: 'lucknow' | 'allahabad';
      counselName: string;
      totalRows: number;
      listDate: string;
      previewRows: Array<Record<string, string | number | null>>;
    }> = [];
    const failures: string[] = [];
    const tasks: Array<Promise<void>> = [];

    for (const bench of benchCandidates) {
      const listDate = formatBenchDate(rawDate, bench);
      if (!listDate) continue;

      for (const counselName of searchNames) {
        tasks.push(
          (async () => {
            try {
              const result =
                bench === 'lucknow'
                  ? await withTimeout(
                      fetchLucknowCounselCauseList({
                        listType: 'Z',
                        listDate,
                        counselName,
                      }),
                      15000,
                      `Lucknow cause list search for ${counselName}`
                    )
                  : await withTimeout(
                      fetchAllahabadCounselCauseList({
                        listType: 'Z',
                        listDate,
                        counselName,
                      }),
                      15000,
                      `Allahabad cause list search for ${counselName}`
                    );

              await saveCauseListSnapshot(db, {
                bench,
                listType: result.listType,
                listTypeLabel: result.listTypeLabel,
                listDate: result.listDate,
                counselName,
                totalRows: result.totalRows,
                previewRows: result.previewRows,
              });

              benchResults.push({
                bench,
                counselName,
                totalRows: result.totalRows,
                listDate: result.listDate,
                previewRows: result.previewRows.slice(0, 5),
              });
            } catch (searchError) {
              failures.push(
                searchError instanceof Error
                  ? searchError.message
                  : `${bench} cause list search failed for ${counselName}`
              );
            }
          })()
        );
      }
    }

    await Promise.all(tasks);

    const matches = benchResults.filter((entry) => entry.totalRows > 0);
    const totalMatchedRows = matches.reduce((sum, entry) => sum + entry.totalRows, 0);
    return {
      tool: tool.name,
      ok: benchResults.length > 0,
      summary:
        matches.length > 0
          ? `Cause list for ${rawDate}: ${totalMatchedRows} matching row${totalMatchedRows === 1 ? '' : 's'} found across ${matches.length} successful search${matches.length === 1 ? '' : 'es'}.`
          : benchResults.length > 0
            ? `No cause list matches found for ${rawDate}.`
            : failures[0] || 'Cause list lookups did not complete.',
      data: {
        date: rawDate,
        searchesRun: benchResults.length,
        matches,
        failures,
      },
    };
  }

  if (tool.name === 'get_web_diary') {
    const rawDate = String(tool.arguments?.date || '').trim() || extractReferencedDate(message);

    const formatted = formatWebDiaryDate(rawDate || new Date().toLocaleDateString('en-GB'));
    if (!formatted) {
      return {
        tool: tool.name,
        ok: false,
        summary: 'Web diary queries need a valid date.',
      };
    }

    const parts = parseDateParts(formatted);
    if (!parts) {
      return {
        tool: tool.name,
        ok: false,
        summary: 'Web diary date parsing failed.',
      };
    }

    const response = await getWebDiary(
      new Request(
        `http://localhost/api/web-diary?date=${parts.day}&month=${parts.month}&year=${parts.year}`
      )
    );
    const payload = (await response.json()) as {
      success?: boolean;
      data?: {
        notifications?: Array<{
          title: string;
          pdfLink?: string;
          date: string;
          allLinks?: Array<{ type: string; link: string }>;
        }>;
      };
      meta?: {
        partial?: boolean;
        timedOut?: boolean;
        warning?: string;
      };
      error?: string;
    };

    if (!payload.success || !payload.data) {
      return {
        tool: tool.name,
        ok: false,
        summary: payload.error || 'Failed to fetch web diary data.',
      };
    }

    const notifications = payload.data.notifications || [];
    await saveWebDiarySnapshot(db, {
      date: formatted,
      notifications,
    });

    return {
      tool: tool.name,
      ok: !payload.meta?.timedOut,
      summary: payload.meta?.timedOut
        ? payload.meta.warning || `Web diary source timed out for ${formatted}.`
        : `Loaded ${notifications.length} web diary notification${notifications.length === 1 ? '' : 's'} for ${formatted}.`,
      data: {
        date: formatted,
        partial: Boolean(payload.meta?.partial),
        warning: payload.meta?.warning || null,
        notifications: notifications.slice(0, 8),
      },
    };
  }

  if (tool.name === 'check_courtroom_transfer') {
    let courtNoArg = String(
      getToolArg(tool.arguments, 'courtNo', 'court_no') || extractCourtroomArgs(message).courtNo || ''
    ).trim();
    const serialNoArg = String(
      getToolArg(tool.arguments, 'serialNo', 'serial_no') || extractCourtroomArgs(message).serialNo || ''
    ).trim();
    const caseIdArg = String(
      getToolArg(tool.arguments, 'caseId', 'case_id') || extractCaseId(message) || ''
    )
      .trim()
      .toUpperCase();

    if (!courtNoArg && !caseIdArg) {
      return {
        tool: tool.name,
        ok: false,
        summary: 'Courtroom transfer checks need a courtroom number or case ID.',
      };
    }

    const latestResult = await syncSchedule({
      db,
      force: false,
      source: 'ai_chat',
    });
    const schedule = latestResult.schedule;
    if (!schedule) {
      return {
        tool: tool.name,
        ok: false,
        summary: 'No live board snapshot is available right now.',
      };
    }

    let matchedCourt =
      (schedule.courts || []).find(
        (court) => normalizeCourtNo(court.courtNo) === normalizeCourtNo(courtNoArg)
      ) || null;

    if (!matchedCourt && caseIdArg) {
      matchedCourt =
        (schedule.courts || []).find(
          (court) => String(court.caseDetails?.caseNumber || '').toUpperCase() === caseIdArg
        ) || null;
      if (matchedCourt) {
        courtNoArg = matchedCourt.courtNo;
      }
    }

    if (!matchedCourt) {
      return {
        tool: tool.name,
        ok: false,
        summary: caseIdArg
          ? `${caseIdArg} is not visible on the latest live board snapshot, so courtroom movement cannot be confirmed right now.`
          : `Courtroom ${courtNoArg} was not found on the latest live board snapshot.`,
      };
    }

    const history = await getCourtHistory({
      db,
      courtNo: matchedCourt.courtNo,
      date: schedule.date,
      limit: 30,
    });

    const recentDistinct = history
      .map((entry) => ({
        timestamp: entry.timestamp,
        serialNo: entry.serialNo,
        caseNumber: entry.caseDetails?.caseNumber || null,
        title: entry.caseDetails?.title || null,
      }))
      .filter(
        (entry, index, array) =>
          array.findIndex(
            (candidate) =>
              candidate.serialNo === entry.serialNo &&
              candidate.caseNumber === entry.caseNumber
          ) === index
      )
      .slice(0, 6);

    const providedSerialSeen = serialNoArg
      ? history.some((entry) => String(entry.serialNo || '') === serialNoArg)
      : false;
    const providedCaseSeen = caseIdArg
      ? history.some(
          (entry) => String(entry.caseDetails?.caseNumber || '').toUpperCase() === caseIdArg
        )
      : false;
    const transferDetected =
      (serialNoArg && providedSerialSeen && matchedCourt.serialNo !== serialNoArg) ||
      (caseIdArg &&
        providedCaseSeen &&
        String(matchedCourt.caseDetails?.caseNumber || '').toUpperCase() !== caseIdArg);

    const currentCaseNumber = matchedCourt.caseDetails?.caseNumber?.toUpperCase() || null;
    if (currentCaseNumber) {
      await upsertCaseRegistry(db, {
        caseKey: currentCaseNumber,
        canonicalCaseId: currentCaseNumber,
        title: matchedCourt.caseDetails?.title || null,
        explicitCaseIds: [currentCaseNumber],
      });
      await saveScheduleSummary(db, {
        caseKey: currentCaseNumber,
        canonicalCaseId: currentCaseNumber,
        title: matchedCourt.caseDetails?.title || null,
        boardDate: schedule.date,
        lastUpdated: new Date(schedule.lastUpdated),
        court: matchedCourt,
      });
    }

    return {
      tool: tool.name,
      ok: true,
      summary: transferDetected
        ? `There is evidence that courtroom ${matchedCourt.courtNo} has moved away from the requested serial/case reference.`
        : `No transfer evidence found yet for courtroom ${matchedCourt.courtNo} using the provided reference.`,
      data: {
        scheduleDate: schedule.date,
        lastUpdated: new Date(schedule.lastUpdated).toISOString(),
        current: {
          courtNo: matchedCourt.courtNo,
          serialNo: matchedCourt.serialNo,
          progress: matchedCourt.progress,
          list: matchedCourt.list,
          caseNumber: matchedCourt.caseDetails?.caseNumber || null,
          title: matchedCourt.caseDetails?.title || null,
        },
        transferDetected,
        recentHistory: recentDistinct,
      },
    };
  }

  if (tool.name === 'get_alerts') {
    const effectiveCaseIds = getEffectiveTrackedCaseIds(clientState);
    const trackedOrderByKey = new Map(
      trackedOrderCases.map((trackedCase) => [trackedCase.trackingKey, trackedCase] as const)
    );
    const requestedDate = extractReferencedDate(message);
    const requestedDateParts = requestedDate ? parseDateParts(requestedDate) : null;
    const requestedDateKey = requestedDateParts
      ? getTimeZoneDateKey(
          new Date(
            Date.UTC(
              requestedDateParts.year,
              requestedDateParts.month - 1,
              requestedDateParts.day
            )
          )
        )
      : null;
    const todayOnly = /\btoday\b/.test(normalizeIntentText(message)) && !requestedDateKey;
    const todayDateKey = getTimeZoneDateKey(new Date());

    let filtered = await loadRelevantNotifications(db, clientState, 100);
    if (requestedDateKey) {
      filtered = filtered.filter(
        (notification) => getTimeZoneDateKey(notification.timestamp) === requestedDateKey
      );
    } else if (todayOnly && todayDateKey) {
      filtered = filtered.filter(
        (notification) => getTimeZoneDateKey(notification.timestamp) === todayDateKey
      );
    }

    const { ObjectId } = await import('mongodb');
    const changeRecordObjectIds = filtered
      .map((notification) => String(notification.changeRecordId || '').trim())
      .filter(Boolean)
      .map((id) => {
        try {
          return new ObjectId(id);
        } catch {
          return null;
        }
      })
      .filter((id): id is InstanceType<typeof ObjectId> => id !== null);
    const changeRecordMap = new Map<
      string,
      { oldCaseNumber: string | null; newCaseNumber: string | null }
    >();

    if (changeRecordObjectIds.length > 0) {
      const changeRecords = await db
        .collection('changes')
        .find({ _id: { $in: changeRecordObjectIds } })
        .toArray();

      for (const changeRecord of changeRecords) {
        changeRecordMap.set(String(changeRecord._id), {
          oldCaseNumber: String(changeRecord.oldValue?.caseDetails?.caseNumber || '').toUpperCase() || null,
          newCaseNumber: String(changeRecord.newValue?.caseDetails?.caseNumber || '').toUpperCase() || null,
        });
      }
    }

    const notifications = filtered.slice(0, 12).map((notification) => {
      let caseReference: string | null = null;

      if (notification.type === 'order_update') {
        const trackingKey = String(notification.orderTrackingKey || '').trim();
        const trackedCase = trackedOrderByKey.get(trackingKey);
        caseReference =
          trackedCase?.caseTypeLabel && trackedCase.caseNo && trackedCase.caseYear
            ? `${trackedCase.caseTypeLabel} ${trackedCase.caseNo}/${trackedCase.caseYear}`
            : trackingKey || null;
      } else {
        const changeRecord = changeRecordMap.get(String(notification.changeRecordId || '').trim());
        caseReference =
          changeRecord?.newCaseNumber ||
          changeRecord?.oldCaseNumber ||
          effectiveCaseIds.find((caseId) =>
            `${notification.title} ${notification.message}`.toUpperCase().includes(caseId)
          ) ||
          null;
      }

      return {
        caseReference,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        timestamp:
          typeof notification.timestamp === 'string'
            ? notification.timestamp
            : notification.timestamp.toISOString(),
      };
    });

    for (const entry of notifications.slice(0, 10)) {
      const matchedNotification = filtered.find(
        (notification) =>
          notification.title === entry.title &&
          notification.message === entry.message &&
          String(notification.timestamp) === String(entry.timestamp)
      );
      if (entry.caseReference && matchedNotification) {
        await saveNotificationSummary(db, {
          caseKey: entry.caseReference,
          canonicalCaseId: entry.caseReference,
          notification: matchedNotification,
        });
      }
    }

    return {
      tool: tool.name,
      ok: true,
      summary:
        requestedDateKey || todayOnly
          ? `${notifications.length} relevant alert${notifications.length === 1 ? '' : 's'} found for ${requestedDateKey ? formatDisplayDate(requestedDate) : 'today'}.`
          : `Loaded ${notifications.length} relevant alert${notifications.length === 1 ? '' : 's'} for your tracked cases.`,
      data: {
        count: notifications.length,
        dateScope: requestedDateKey ? formatDisplayDate(requestedDate) : todayOnly ? 'today' : null,
        notifications,
      },
    };
  }

  return {
    tool: tool.name,
    ok: false,
    summary: `Unsupported tool ${tool.name}.`,
  };
}

function summarizePreviewRow(row: Record<string, string | number | null> | undefined) {
  if (!row) return null;
  const parts = Object.entries(row)
    .filter(([, value]) => value !== null && String(value).trim())
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${value}`);
  return parts.length > 0 ? parts.join(' | ') : null;
}

function formatCitationSummary(citations: Array<Record<string, unknown>>) {
  const parts = citations
    .slice(0, 3)
    .map((citation) => {
      const page = Number(citation.page || 0);
      const lineStart = Number(citation.lineStart || 0);
      const lineEnd = Number(citation.lineEnd || 0);
      const quote = String(citation.quote || '').trim().slice(0, 140);
      if (!page || !lineStart || !lineEnd) return null;
      const lineLabel = lineStart === lineEnd ? `l${lineStart}` : `l${lineStart}-${lineEnd}`;
      return `p${page} ${lineLabel}${quote ? ` ("${quote}")` : ''}`;
    })
    .filter((value): value is string => Boolean(value));

  return parts.length > 0 ? `Source: ${parts.join('; ')}.` : null;
}

function formatSpecificCaseStatusAnswer(data: Record<string, unknown>) {
  const responseMode = String(data.responseMode || 'status');
  const caseInfo = (data.caseInfo as Record<string, unknown> | null) || null;
  const liveBoard = (data.liveBoard as Record<string, unknown> | null) || null;
  const latestOrder = (data.latestOrder as Record<string, unknown> | null) || null;
  const latestOrderDocument = (data.latestOrderDocument as Record<string, unknown> | null) || null;
  const orderCount = Number(data.orderJudgmentsCount || 0);
  const status = String(caseInfo?.status || '').trim();
  const latestOrderDate = String(latestOrder?.date || latestOrderDocument?.date || '').trim();

  if (responseMode === 'order_count') {
    return `${orderCount} order${orderCount === 1 ? '' : 's'} are available for this case.`;
  }

  if (responseMode === 'latest_order') {
    if (!latestOrderDate) {
      return 'No order/judgment document is available for this case yet.';
    }

    const summary = String(latestOrderDocument?.summary || '').trim();
    const citations = Array.isArray(latestOrderDocument?.citations)
      ? (latestOrderDocument!.citations as Array<Record<string, unknown>>)
      : [];
    const parts = [
      `Latest order dated ${formatDisplayDate(latestOrderDate)}: ${summary || 'The latest order PDF was loaded.'}`,
      formatCitationSummary(citations),
      latestOrderDocument?.viewerHref ? 'Open the latest order PDF below.' : null,
    ].filter(Boolean);

    return parts.join('\n');
  }

  if (caseInfo) {
    const parts = [
      status ? `Current status: ${status}.` : 'Current status is not shown in the source response.',
      orderCount > 0
        ? `${orderCount} order${orderCount === 1 ? '' : 's'} are available${latestOrderDate ? `, latest dated ${formatDisplayDate(latestOrderDate)}` : ''}.`
        : 'No order/judgment entries are listed for this case.',
    ];
    return parts.join(' ');
  }

  if (liveBoard?.visible) {
    return `It is visible on the live board: Court ${liveBoard.courtNo || 'not shown'}, serial ${liveBoard.serialNo || 'not shown'}, progress ${liveBoard.progress || 'not shown'}.`;
  }

  if (liveBoard) {
    return 'It is not visible on the latest live board snapshot right now.';
  }

  return null;
}

function buildDeterministicAnswer(message: string, results: ExecutedToolResult[]) {
  const sections: string[] = [];

  for (const result of results) {
    if (!result.ok && result.summary) {
      sections.push(result.summary);
      continue;
    }

    if (result.tool === 'get_my_cases') {
      const cases = Array.isArray((result.data as { cases?: unknown[] } | undefined)?.cases)
        ? ((result.data as { cases?: Array<Record<string, unknown>> }).cases || [])
        : [];

      if (cases.length === 0) {
        sections.push('No cases are currently being tracked in this session.');
        continue;
      }

      sections.push(
        [
          `You are tracking ${cases.length} case reference${cases.length === 1 ? '' : 's'}.`,
          ...cases.map((entry) => {
            const modes = [
              entry.scheduleTracked ? 'schedule' : null,
              entry.orderTracked ? 'orders/status' : null,
            ].filter(Boolean);
            const modeLabel = modes.length > 0 ? ` via ${modes.join(' + ')}` : '';
            const orderLabel =
              entry.orderTrackerLabel && entry.orderTrackerLabel !== entry.caseId
                ? ` (${entry.orderTrackerLabel})`
                : '';
            return `- ${entry.caseId}${orderLabel}${modeLabel}`;
          }),
        ].join('\n')
      );
      continue;
    }

    if (result.tool === 'get_case_status') {
      const trackedCases = Array.isArray((result.data as { cases?: unknown[] } | undefined)?.cases)
        ? ((result.data as { cases?: Array<Record<string, unknown>> }).cases || [])
        : [];

      if (trackedCases.length > 0) {
        const lines = trackedCases.map((entry) => {
          const parts: string[] = [];
          const label = String(entry.caseId || entry.referenceLabel || entry.caseKey || 'Tracked case');
          const liveBoard = entry.liveBoard as Record<string, unknown> | undefined;
          const orderStatus = entry.orderStatus as Record<string, unknown> | undefined;

          if (liveBoard?.visible) {
            parts.push(
              `live board: Court ${liveBoard.courtNo || 'not shown'}, serial ${liveBoard.serialNo || 'not shown'}, progress ${liveBoard.progress || 'not shown'}`
            );
          } else if (liveBoard) {
            parts.push('live board: not visible right now');
          }

          if (orderStatus) {
            parts.push(
              `orders/status: ${orderStatus.status || 'status not shown'}, ${orderStatus.orderJudgmentsCount || 0} order${Number(orderStatus.orderJudgmentsCount || 0) === 1 ? '' : 's'}${orderStatus.latestOrderDate ? `, latest ${formatDisplayDate(String(orderStatus.latestOrderDate))}` : ''}`
            );
          } else {
            parts.push('orders/status: no order tracker saved');
          }

          return `- ${label}: ${parts.join('. ')}.`;
        });

        const errors = Array.isArray((result.data as { errors?: unknown[] } | undefined)?.errors)
          ? ((result.data as { errors?: string[] }).errors || []).filter(Boolean)
          : [];

        sections.push(
          [...lines, ...(errors.length > 0 ? [`Source issues: ${errors.join(' | ')}`] : [])].join('\n')
        );
        continue;
      }

      const data = (result.data as Record<string, unknown> | undefined) || {};
      const response = formatSpecificCaseStatusAnswer(data);
      if (response) {
        sections.push(response);
        continue;
      }

      sections.push(result.summary);
      continue;
    }

    if (result.tool === 'track_case') {
      sections.push(result.summary);
      continue;
    }

    if (result.tool === 'get_alerts') {
      const data = (result.data as Record<string, unknown> | undefined) || {};
      const notifications = Array.isArray(data.notifications)
        ? (data.notifications as Array<Record<string, unknown>>)
        : [];
      const scope = String(data.dateScope || '').trim();

      if (notifications.length === 0) {
        sections.push(
          scope ? `No relevant alerts were found for ${scope}.` : 'No relevant alerts were found for your tracked cases.'
        );
        continue;
      }

      sections.push(
        [
          scope
            ? `Relevant alerts for ${scope}:`
            : 'Relevant alerts for your tracked cases:',
          ...notifications.slice(0, 6).map((entry) => {
            const prefix = entry.caseReference ? `${entry.caseReference}: ` : '';
            const when = formatDisplayTimestamp(String(entry.timestamp || ''));
            return `- ${prefix}${entry.title}. ${entry.message}${when ? ` (${when})` : ''}`;
          }),
        ].join('\n')
      );
      continue;
    }

    if (result.tool === 'check_cause_list_assignments') {
      const data = (result.data as Record<string, unknown> | undefined) || {};
      const matches = Array.isArray(data.matches)
        ? (data.matches as Array<Record<string, unknown>>)
        : [];
      const date = formatDisplayDate(String(data.date || '')) || String(data.date || '').trim();
      const failures = Array.isArray(data.failures)
        ? (data.failures as string[]).filter(Boolean)
        : [];

      if (matches.length === 0) {
        sections.push(
          failures.length > 0
            ? `${result.summary} Source issues: ${failures.join(' | ')}`
            : result.summary
        );
        continue;
      }

      sections.push(
        [
          `Cause list matches for ${date}:`,
          ...matches.slice(0, 5).map((entry) => {
            const previewRows = Array.isArray(entry.previewRows)
              ? (entry.previewRows as Array<Record<string, string | number | null>>)
              : [];
            const topRow = summarizePreviewRow(previewRows[0]);
            return `- ${String(entry.bench || '').toUpperCase()} / ${entry.counselName}: ${entry.totalRows} row${Number(entry.totalRows || 0) === 1 ? '' : 's'}${topRow ? `. Top row: ${topRow}` : ''}`;
          }),
          ...(failures.length > 0 ? [`Source issues: ${failures.join(' | ')}`] : []),
        ].join('\n')
      );
      continue;
    }

    if (result.tool === 'get_web_diary') {
      const data = (result.data as Record<string, unknown> | undefined) || {};
      const notifications = Array.isArray(data.notifications)
        ? (data.notifications as Array<Record<string, unknown>>)
        : [];
      const date = formatDisplayDate(String(data.date || '')) || String(data.date || '').trim();

      if (data.partial) {
        sections.push(`Web diary for ${date} is incomplete. ${data.warning || 'The source timed out.'}`);
        continue;
      }

      if (notifications.length === 0) {
        sections.push(`No web diary notices were found for ${date}.`);
        continue;
      }

      sections.push(
        [
          `Web diary for ${date}:`,
          ...notifications.slice(0, 5).map((entry) => `- ${entry.title}`),
        ].join('\n')
      );
      continue;
    }

    if (result.tool === 'check_courtroom_transfer') {
      const data = (result.data as Record<string, unknown> | undefined) || {};
      const current = (data.current as Record<string, unknown> | null) || null;
      const recentHistory = Array.isArray(data.recentHistory)
        ? (data.recentHistory as Array<Record<string, unknown>>)
        : [];
      const intro = data.transferDetected
        ? `Transfer is likely in courtroom ${current?.courtNo || 'not shown'}.`
        : `No transfer evidence found for courtroom ${current?.courtNo || 'not shown'}.`;

      sections.push(
        [
          intro,
          current
            ? `Current board entry: serial ${current.serialNo || 'not shown'}, case ${current.caseNumber || 'not shown'}, progress ${current.progress || 'not shown'}.`
            : null,
          recentHistory.length > 0
            ? `Recent history: ${recentHistory
                .slice(0, 3)
                .map(
                  (entry) =>
                    `${formatDisplayTimestamp(String(entry.timestamp || '')) || 'Earlier'} - serial ${entry.serialNo || 'not shown'}, case ${entry.caseNumber || 'not shown'}`
                )
                .join(' | ')}`
            : null,
        ]
          .filter(Boolean)
          .join('\n')
      );
      continue;
    }

    if (result.summary) {
      sections.push(result.summary);
    }
  }

  return sections.filter(Boolean).join('\n\n');
}

async function writeFinalAnswer(message: string, results: ExecutedToolResult[]) {
  const deterministicAnswer = buildDeterministicAnswer(message, results);
  if (deterministicAnswer) {
    return deterministicAnswer;
  }

  try {
    return await withTimeout(
      runGpt5Nano({
        messages: [
          {
            role: 'system',
            content:
              'You are Court View AI for lawyers. Answer only from the supplied tool results. Be concise, factual, and explicit when data is missing. Do not invent court facts. If a track_case action succeeded, mention that it is already saved. Do not ask follow-up questions unless the tools are blocked by missing input.',
          },
          {
            role: 'user',
            content: `Question: ${message}\n\nTool results:\n${JSON.stringify(
              results.map((result) => ({
                tool: result.tool,
                ok: result.ok,
                summary: result.summary,
                data: result.data,
              })),
              null,
              2
            )}`,
          },
        ],
        maxCompletionTokens: 1800,
      }),
      15000,
      'final answer model'
    );
  } catch {
    const successful = results.filter((result) => result.ok);
    if (successful.length === 0) {
      return results.map((result) => result.summary).join(' ');
    }
    return successful.map((result) => result.summary).join(' ');
  }
}

export async function runAiAssistantChat(input: {
  message: string;
  history?: ChatTurn[];
  clientState?: AiClientState;
}): Promise<AiAssistantResponse> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const message = String(input.message || '').trim();
  if (!message) {
    throw new Error('message is required');
  }

  const clientState = normalizeClientState(input.clientState || {});
  const lawyerProfile = await findLawyerProfile({
    profileKey: clientState.profileKey,
    userId: clientState.userId,
    email: clientState.email,
  });

  if (lawyerProfile) {
    await markLawyerProfileUsed({
      profileKey: lawyerProfile.profileKey,
      userId: lawyerProfile.userId,
      email: lawyerProfile.email,
    });
  }

  const plan = await buildPlanner(message, input.history || [], clientState, serializeLawyerProfile(lawyerProfile));
  const toolResults: ExecutedToolResult[] = [];
  let finalClientMutation: AiAssistantResponse['clientMutation'];

  for (const tool of plan.tools || []) {
    const result = await runTool(tool, message, clientState, lawyerProfile);
    toolResults.push(result);
    if (result.clientMutation) {
      finalClientMutation = {
        trackedCaseIds: result.clientMutation.trackedCaseIds,
        trackedOrderCases: result.clientMutation.trackedOrderCases,
      };
      clientState.trackedCaseIds = result.clientMutation.trackedCaseIds || clientState.trackedCaseIds;
      clientState.trackedOrderCases =
        result.clientMutation.trackedOrderCases || clientState.trackedOrderCases;
    }
  }

  const answer =
    toolResults.length > 0
      ? await writeFinalAnswer(message, toolResults)
      : 'I could not map that request to the available court tools yet.';

  const db = await getDb();
  await recordAiChatRun(db, {
    requestId,
    profileKey: clientState.profileKey,
    userId: clientState.userId,
    message,
    toolNames: toolResults.map((result) => result.tool),
    plan,
    toolResults,
    answer,
    latencyMs: Date.now() - startedAt,
  });

  return {
    requestId,
    answer,
    plan,
    toolResults,
    clientMutation: finalClientMutation,
    lawyerProfile: serializeLawyerProfile(lawyerProfile),
  };
}

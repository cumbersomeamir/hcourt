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
  return String(value || '')
    .replace(
      /^(what is the status of|what is status of|status of|show status of|check status of|track|track this case|details of|case status of)\s+/i,
      ''
    )
    .replace(/\s+in\s+(lucknow|allahabad)\s+bench.*$/i, '')
    .trim();
}

function getToolArg(args: Record<string, unknown> | undefined, ...keys: string[]) {
  if (!args) return undefined;
  for (const key of keys) {
    if (key in args) return args[key];
  }
  return undefined;
}

function isTrackedCasesLookup(message: string) {
  const lowerMessage = message.toLowerCase().replace(/\s+/g, ' ').trim();
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
  const lowerMessage = message.toLowerCase().replace(/\s+/g, ' ').trim();
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
    const lowerMessage = message.toLowerCase();
    if (isTrackedCasesLookup(message)) {
      return { tools: [{ name: 'get_my_cases', arguments: {} }] };
    }

    if (lowerMessage.includes('track')) {
      const caseId = extractCaseId(message);
      const caseParts = extractCaseNumberParts(message);
      return {
        tools: [
          {
            name: 'track_case',
            arguments: {
              caseId,
              ...(caseParts || {}),
            },
          },
        ],
      };
    }

    if (lowerMessage.includes('cause list') && lowerMessage.includes('assigned')) {
      return { tools: [{ name: 'check_cause_list_assignments', arguments: {} }] };
    }

    if (lowerMessage.includes('transfer') && lowerMessage.includes('court')) {
      return {
        tools: [{ name: 'check_courtroom_transfer', arguments: extractCourtroomArgs(message) }],
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

    if (lowerMessage.includes('web diary')) {
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
              'You route lawyer requests inside a court-monitoring app. Return only valid JSON. Schema: {"tools":[{"name":"tool_name","arguments":{}}]}. Use at most 3 tools. Available tools: get_my_cases, get_case_status, check_cause_list_assignments, get_web_diary, check_courtroom_transfer, get_alerts, track_case. If the request is about which cases are already being tracked or saved, use get_my_cases, not track_case. If the request asks for the status of saved, tracked, or "my" cases, use get_case_status with {"useTrackedCases":true}. If the request is about "assigned to me", use check_cause_list_assignments. If it is about transfer in a courtroom, use check_courtroom_transfer. If it is about case status or orders/judgments for a specific case, use get_case_status. If it is about saving or tracking a new case, use track_case.',
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

  if (sanitizedTools.length > 0) {
    return { tools: sanitizedTools };
  }
  return fallbackPlanner();
}

async function loadTrackedStatuses(
  db: Awaited<ReturnType<typeof getDb>>,
  clientState: NormalizedClientState
): Promise<ExecutedToolResult> {
  const derivedCaseIds = clientState.trackedOrderCases
    .map((trackedCase) => deriveCaseIdFromTrackedOrderCase(trackedCase))
    .filter((caseId): caseId is string => Boolean(caseId));
  const effectiveCaseIds = Array.from(
    new Set([...clientState.trackedCaseIds, ...derivedCaseIds])
  );

  if (effectiveCaseIds.length === 0 && clientState.trackedOrderCases.length === 0) {
    return {
      tool: 'get_case_status',
      ok: false,
      summary: 'No tracked cases are available in your current session.',
    };
  }

  const liveBoardCases: Array<{
    caseId: string;
    visible: boolean;
    courtNo?: string | null;
    serialNo?: string | null;
    progress?: string | null;
    title?: string | null;
  }> = [];
  const orderCases: Array<{
    trackingKey: string;
    city: string;
    caseLabel: string;
    status: string | null;
    title: string | null;
    latestOrderDate: string | null;
    orderJudgmentsCount: number;
  }> = [];
  const errors: string[] = [];

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

        liveBoardCases.push({
          caseId,
          visible: Boolean(matchedCourt),
          courtNo: matchedCourt?.courtNo || null,
          serialNo: matchedCourt?.serialNo || null,
          progress: matchedCourt?.progress || null,
          title: matchedCourt?.caseDetails?.title || null,
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

      orderCases.push({
        trackingKey: trackedCase.trackingKey,
        city: trackedCase.city,
        caseLabel: `${result.caseInfo.caseType} ${trackedCase.caseNo}/${trackedCase.caseYear}`,
        status: result.caseInfo.status || null,
        title: result.caseInfo.petitionerVsRespondent || null,
        latestOrderDate: result.orderJudgments[0]?.date || null,
        orderJudgmentsCount: result.orderJudgments.length,
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
  const visibleCount = liveBoardCases.filter((entry) => entry.visible).length;

  return {
    tool: 'get_case_status',
    ok: liveBoardCases.length > 0 || orderCases.length > 0,
    summary: `Tracked live-board cases: ${liveBoardCases.length} checked, ${visibleCount} visible now. Tracked order-status cases: ${orderCases.length} loaded.${skippedOrderCases > 0 ? ` ${skippedOrderCases} additional tracked order cases were skipped in this response.` : ''}`,
    data: {
      liveBoardCases,
      orderCases,
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
    const derivedCaseIds = trackedOrderCases
      .map((trackedCase) => deriveCaseIdFromTrackedOrderCase(trackedCase))
      .filter((caseId): caseId is string => Boolean(caseId));
    const effectiveCaseIds = Array.from(new Set([...trackedCaseIds, ...derivedCaseIds]));

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

    const trackedCaseSummary =
      effectiveCaseIds.length > 0 ? effectiveCaseIds.join(', ') : 'none';
    const trackedOrderSummary =
      trackedOrderCases.length > 0
        ? trackedOrderCases
            .map((trackedCase) => `${trackedCase.caseTypeLabel} ${trackedCase.caseNo}/${trackedCase.caseYear}`)
            .join(', ')
        : 'none';

    return {
      tool: tool.name,
      ok: true,
      summary: `Saved case IDs: ${trackedCaseSummary}. Order trackers: ${trackedOrderSummary}.`,
      data: {
        trackedCaseIds: effectiveCaseIds,
        trackedOrderCases,
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
    const city = normalizeBench(
      String(getToolArg(tool.arguments, 'city', 'bench') || message)
    );
    const caseId = String(
      getToolArg(tool.arguments, 'caseId', 'case_id') || extractCaseId(message) || ''
    )
      .trim()
      .toUpperCase();
    const fallbackParts = extractCaseNumberParts(message);
    const caseNo = String(
      getToolArg(tool.arguments, 'caseNo', 'case_no') || fallbackParts?.caseNo || ''
    ).trim();
    const caseYear = String(
      getToolArg(tool.arguments, 'caseYear', 'case_year') || fallbackParts?.caseYear || ''
    ).trim();
    const caseTypeCandidate = cleanCaseTypeQuery(
      String(
        getToolArg(tool.arguments, 'caseType', 'case_type', 'caseTypeQuery', 'case_type_query') ||
          fallbackParts?.caseTypeQuery ||
          ''
      ).trim()
    );

    if (useTrackedCases && !caseNo && !caseYear && !caseTypeCandidate && !caseId) {
      return loadTrackedStatuses(db, clientState);
    }

    if (!caseNo || !caseYear || !caseTypeCandidate) {
      return {
        tool: tool.name,
        ok: false,
        summary: 'Case status needs case type, case number, and case year.',
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

    return {
      tool: tool.name,
      ok: true,
      summary: `Status loaded for ${result.caseInfo.caseType} ${caseNo}/${caseYear}. Current status: ${result.caseInfo.status || 'not shown'}. Orders found: ${result.orderJudgments.length}.`,
      data: {
        city,
        caseInfo: result.caseInfo,
        details: {
          keyValues: result.details.keyValues.slice(0, 12),
          listingHistoryCount: result.details.listingHistory.length,
          iaDetailsCount: result.details.iaDetails.length,
        },
        latestOrder: result.orderJudgments[0] || null,
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
      (() => {
        const match = message.match(/\b\d{1,4}[\/-]\d{1,2}[\/-]\d{1,4}\b/);
        return match?.[0] || '';
      })();

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
    return {
      tool: tool.name,
      ok: benchResults.length > 0,
      summary:
        matches.length > 0
          ? `Found cause list matches for ${matches.length} alias/bench searches.`
          : benchResults.length > 0
            ? 'No cause list matches found for the configured lawyer aliases on that date.'
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
    const rawDate =
      String(tool.arguments?.date || '').trim() ||
      (() => {
        const match = message.match(/\b\d{1,4}[\/-]\d{1,2}[\/-]\d{1,4}\b/);
        return match?.[0] || '';
      })();

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
      ok: true,
      summary: `Loaded ${notifications.length} web diary notifications for ${formatted}.`,
      data: {
        date: formatted,
        notifications: notifications.slice(0, 8),
      },
    };
  }

  if (tool.name === 'check_courtroom_transfer') {
    const courtNoArg = String(
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

    if (!courtNoArg) {
      return {
        tool: tool.name,
        ok: false,
        summary: 'Courtroom transfer checks need a courtroom number.',
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

    const matchedCourt =
      (schedule.courts || []).find(
        (court) => normalizeCourtNo(court.courtNo) === normalizeCourtNo(courtNoArg)
      ) || null;

    if (!matchedCourt) {
      return {
        tool: tool.name,
        ok: false,
        summary: `Courtroom ${courtNoArg} was not found on the latest live board snapshot.`,
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
    const notificationsCollection = db.collection<Notification>('notifications');
    const trackedOrderKeys = new Set(trackedOrderCases.map((trackedCase) => trackedCase.trackingKey));
    const effectiveCaseIds = new Set(trackedCaseIds);
    const notifications = await notificationsCollection
      .find({})
      .sort({ timestamp: -1 })
      .limit(100)
      .toArray();

    const filtered = notifications.filter((notification) => {
      if (notification.type === 'order_update') {
        const trackingKey = String(notification.orderTrackingKey || '').trim();
        return trackingKey ? trackedOrderKeys.has(trackingKey) : false;
      }

      const message = `${notification.title} ${notification.message}`.toUpperCase();
      return Array.from(effectiveCaseIds).some((caseId) => message.includes(caseId));
    });

    for (const notification of filtered.slice(0, 10)) {
      const caseIdMatch = Array.from(effectiveCaseIds).find((caseId) =>
        `${notification.title} ${notification.message}`.toUpperCase().includes(caseId)
      );
      if (caseIdMatch) {
        await saveNotificationSummary(db, {
          caseKey: caseIdMatch,
          canonicalCaseId: caseIdMatch,
          notification,
        });
      }
    }

    return {
      tool: tool.name,
      ok: true,
      summary: `Loaded ${filtered.length} relevant alerts from the latest notification set.`,
      data: {
        count: filtered.length,
        notifications: filtered.slice(0, 12).map((notification) => ({
          title: notification.title,
          message: notification.message,
          type: notification.type,
          timestamp:
            typeof notification.timestamp === 'string'
              ? notification.timestamp
              : notification.timestamp.toISOString(),
        })),
      },
    };
  }

  return {
    tool: tool.name,
    ok: false,
    summary: `Unsupported tool ${tool.name}.`,
  };
}

async function writeFinalAnswer(message: string, results: ExecutedToolResult[]) {
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

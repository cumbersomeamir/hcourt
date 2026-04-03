import { TrackedOrderCase } from '@/types/court';
import { LawyerProfile } from '@/types/assistant';

const PROFILE_KEY_STORAGE = 'lawyerProfileKey';
const PROFILE_DRAFT_STORAGE = 'lawyerProfileDraft';

export type LawyerProfileDraft = {
  counselName: string;
  aliases: string[];
  chamberAliases: string[];
  enrollmentNo: string;
};

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    )
  );
}

function generateProfileKey() {
  const cryptoKey = globalThis.crypto?.randomUUID?.();
  if (cryptoKey) return cryptoKey;

  return `lp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getOrCreateLawyerProfileKey() {
  const existing = localStorage.getItem(PROFILE_KEY_STORAGE);
  if (existing) return existing;
  const nextKey = generateProfileKey();
  localStorage.setItem(PROFILE_KEY_STORAGE, nextKey);
  return nextKey;
}

export function readLawyerProfileDraft(): LawyerProfileDraft {
  const raw = localStorage.getItem(PROFILE_DRAFT_STORAGE);
  if (!raw) {
    return {
      counselName: '',
      aliases: [],
      chamberAliases: [],
      enrollmentNo: '',
    };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<LawyerProfileDraft>;
    return {
      counselName: String(parsed.counselName || '').trim(),
      aliases: normalizeStringList(parsed.aliases),
      chamberAliases: normalizeStringList(parsed.chamberAliases),
      enrollmentNo: String(parsed.enrollmentNo || '').trim(),
    };
  } catch {
    return {
      counselName: '',
      aliases: [],
      chamberAliases: [],
      enrollmentNo: '',
    };
  }
}

export function persistLawyerProfileDraft(input: LawyerProfileDraft) {
  localStorage.setItem(
    PROFILE_DRAFT_STORAGE,
    JSON.stringify({
      counselName: input.counselName.trim(),
      aliases: normalizeStringList(input.aliases),
      chamberAliases: normalizeStringList(input.chamberAliases),
      enrollmentNo: input.enrollmentNo.trim(),
    })
  );
}

export async function loadLawyerProfile(userId?: string | null): Promise<{
  profileKey: string;
  profile: LawyerProfile | null;
  draft: LawyerProfileDraft;
}> {
  const profileKey = getOrCreateLawyerProfileKey();
  const draft = readLawyerProfileDraft();
  const params = new URLSearchParams({ profileKey });
  if (userId) {
    params.append('userId', userId);
  }

  try {
    const response = await fetch(`/api/lawyer-profile?${params.toString()}`);
    const data = await response.json();
    if (data.success && data.profile) {
      persistLawyerProfileDraft({
        counselName: data.profile.counselName || '',
        aliases: normalizeStringList(data.profile.aliases),
        chamberAliases: normalizeStringList(data.profile.chamberAliases),
        enrollmentNo: String(data.profile.enrollmentNo || ''),
      });
      return {
        profileKey,
        profile: data.profile as LawyerProfile,
        draft: {
          counselName: data.profile.counselName || '',
          aliases: normalizeStringList(data.profile.aliases),
          chamberAliases: normalizeStringList(data.profile.chamberAliases),
          enrollmentNo: String(data.profile.enrollmentNo || ''),
        },
      };
    }
  } catch {
    // Keep local draft fallback.
  }

  return {
    profileKey,
    profile: null,
    draft,
  };
}

export async function saveLawyerProfile(input: {
  profileKey: string;
  userId?: string | null;
  email?: string | null;
  counselName: string;
  aliases: string[];
  chamberAliases: string[];
  enrollmentNo: string;
}) {
  persistLawyerProfileDraft({
    counselName: input.counselName,
    aliases: input.aliases,
    chamberAliases: input.chamberAliases,
    enrollmentNo: input.enrollmentNo,
  });

  const response = await fetch('/api/lawyer-profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      profileKey: input.profileKey,
      userId: input.userId,
      email: input.email,
      counselName: input.counselName,
      aliases: normalizeStringList(input.aliases),
      chamberAliases: normalizeStringList(input.chamberAliases),
      enrollmentNo: input.enrollmentNo.trim() || null,
    }),
  });
  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || 'Failed to save lawyer profile');
  }

  return data.profile as LawyerProfile;
}

export function applyTrackedMutation(mutation: {
  trackedCaseIds?: string[];
  trackedOrderCases?: TrackedOrderCase[];
}) {
  if (mutation.trackedCaseIds) {
    localStorage.setItem('trackedCaseIds', JSON.stringify(mutation.trackedCaseIds));
  }
  if (mutation.trackedOrderCases) {
    localStorage.setItem('trackedOrderCases', JSON.stringify(mutation.trackedOrderCases));
  }
}

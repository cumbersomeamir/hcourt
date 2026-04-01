import { TrackedOrderCase } from '@/types/court';

export type TrackedState = {
  accountEmail: string;
  caseIds: string[];
  hasAccount: boolean;
  trackedOrderCases: TrackedOrderCase[];
  userId: string | null;
};

export type SavedCaseProfile = {
  canonicalCaseId: string | null;
  effectiveCaseIds: string[];
  explicitCaseIds: string[];
  hasOrderTracking: boolean;
  hasScheduleTracking: boolean;
  orderTrackingKeys: string[];
  orderTrackers: TrackedOrderCase[];
  primaryCity: 'lucknow' | 'allahabad' | null;
  profileId: string;
};

export function buildOrderTrackingKey(params: {
  city: string;
  caseType: string;
  caseNo: string;
  caseYear: string;
}) {
  return `${params.city}|${params.caseType}|${params.caseNo}|${params.caseYear}`;
}

export function normalizeCaseIds(caseIds: unknown): string[] {
  if (!Array.isArray(caseIds)) return [];
  return caseIds
    .map((id) => String(id || '').trim().toUpperCase())
    .filter(Boolean);
}

export function deriveCaseIdFromTrackedOrderCase(trackedCase: TrackedOrderCase): string | null {
  const caseNo = String(trackedCase.caseNo || '').trim();
  const caseYear = String(trackedCase.caseYear || '').trim();
  if (!/^\d+$/.test(caseNo) || !/^\d{4}$/.test(caseYear)) return null;

  const label = String(trackedCase.caseTypeLabel || '').trim();
  const primaryToken = label ? label.split('-')[0]?.trim() || label : '';
  const caseCode = primaryToken.split(/\s+/)[0]?.trim().toUpperCase() || '';
  if (!/^[A-Z0-9]+$/.test(caseCode)) return null;

  return `${caseCode}/${caseNo}/${caseYear}`;
}

export function normalizeTrackedOrderCases(trackedCases: unknown): TrackedOrderCase[] {
  if (!Array.isArray(trackedCases)) return [];

  const byKey = new Map<string, TrackedOrderCase>();
  for (const item of trackedCases) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;
    const city =
      String(raw.city || 'lucknow').toLowerCase() === 'allahabad' ? 'allahabad' : 'lucknow';
    const caseType = String(raw.caseType || '').trim();
    const caseNo = String(raw.caseNo || '').trim();
    const caseYear = String(raw.caseYear || '').trim();
    const caseTypeLabel = String(raw.caseTypeLabel || '').trim();

    if (!caseType || !/^\d+$/.test(caseNo) || !/^\d{4}$/.test(caseYear)) continue;

    const trackingKey =
      String(raw.trackingKey || '').trim() ||
      buildOrderTrackingKey({ city, caseType, caseNo, caseYear });

    byKey.set(trackingKey, {
      city,
      caseType,
      caseTypeLabel: caseTypeLabel || undefined,
      caseNo,
      caseYear,
      trackingKey,
    });
  }

  return Array.from(byKey.values());
}

export function getTrackedOrderDisplay(trackedCase: TrackedOrderCase): string {
  const label = trackedCase.caseTypeLabel || trackedCase.caseType;
  return `${label} ${trackedCase.caseNo}/${trackedCase.caseYear}`;
}

export function formatBenchLabel(city: 'lucknow' | 'allahabad'): string {
  return city === 'allahabad' ? 'Allahabad Bench' : 'Lucknow Bench';
}

export function encodeCaseProfileSlug(value: string): string {
  return Array.from(new TextEncoder().encode(value))
    .map((part) => part.toString(16).padStart(2, '0'))
    .join('');
}

export function decodeCaseProfileSlug(slug: string): string {
  if (!/^[0-9a-f]+$/i.test(slug) || slug.length % 2 !== 0) return '';
  const parts = slug.match(/.{1,2}/g) || [];
  try {
    return new TextDecoder().decode(
      new Uint8Array(parts.map((part) => Number.parseInt(part, 16)))
    );
  } catch {
    return '';
  }
}

export function buildSavedCaseProfiles(
  caseIdsInput: unknown,
  trackedOrderCasesInput: unknown
): SavedCaseProfile[] {
  const caseIds = normalizeCaseIds(caseIdsInput);
  const trackedOrderCases = normalizeTrackedOrderCases(trackedOrderCasesInput);
  const profiles = new Map<string, SavedCaseProfile>();

  const ensureProfile = (profileId: string, canonicalCaseId: string | null) => {
    const existing = profiles.get(profileId);
    if (existing) {
      if (!existing.canonicalCaseId && canonicalCaseId) {
        existing.canonicalCaseId = canonicalCaseId;
      }
      return existing;
    }

    const created: SavedCaseProfile = {
      canonicalCaseId,
      effectiveCaseIds: canonicalCaseId ? [canonicalCaseId] : [],
      explicitCaseIds: [],
      hasOrderTracking: false,
      hasScheduleTracking: Boolean(canonicalCaseId),
      orderTrackingKeys: [],
      orderTrackers: [],
      primaryCity: null,
      profileId,
    };
    profiles.set(profileId, created);
    return created;
  };

  for (const caseId of caseIds) {
    const profile = ensureProfile(caseId, caseId);
    if (!profile.explicitCaseIds.includes(caseId)) {
      profile.explicitCaseIds.push(caseId);
    }
    if (!profile.effectiveCaseIds.includes(caseId)) {
      profile.effectiveCaseIds.push(caseId);
    }
    profile.hasScheduleTracking = true;
  }

  for (const trackedCase of trackedOrderCases) {
    const derivedCaseId = deriveCaseIdFromTrackedOrderCase(trackedCase);
    const profileId = derivedCaseId || trackedCase.trackingKey;
    const profile = ensureProfile(profileId, derivedCaseId);

    if (derivedCaseId && !profile.effectiveCaseIds.includes(derivedCaseId)) {
      profile.effectiveCaseIds.push(derivedCaseId);
      profile.hasScheduleTracking = true;
    }

    if (!profile.orderTrackingKeys.includes(trackedCase.trackingKey)) {
      profile.orderTrackingKeys.push(trackedCase.trackingKey);
    }
    if (!profile.orderTrackers.some((entry) => entry.trackingKey === trackedCase.trackingKey)) {
      profile.orderTrackers.push(trackedCase);
    }
    profile.hasOrderTracking = true;
    if (!profile.primaryCity) {
      profile.primaryCity = trackedCase.city;
    }
  }

  return Array.from(profiles.values()).sort((left, right) => {
    const leftKey = left.canonicalCaseId || left.orderTrackingKeys[0] || left.profileId;
    const rightKey = right.canonicalCaseId || right.orderTrackingKeys[0] || right.profileId;
    return leftKey.localeCompare(rightKey);
  });
}

export async function loadTrackedState(): Promise<TrackedState> {
  const storedCaseIds = localStorage.getItem('trackedCaseIds');
  const storedTrackedOrderCases = localStorage.getItem('trackedOrderCases');
  const storedUserId = localStorage.getItem('userId');
  const storedUserEmail = localStorage.getItem('userEmail');

  let caseIds = normalizeCaseIds([]);
  let trackedOrderCases = normalizeTrackedOrderCases([]);
  const hasAccount = Boolean(storedUserId);
  let accountEmail = storedUserEmail || '';

  if (storedCaseIds) {
    try {
      caseIds = normalizeCaseIds(JSON.parse(storedCaseIds));
    } catch (error) {
      console.error('Error parsing tracked case IDs:', error);
    }
  }

  if (storedTrackedOrderCases) {
    try {
      trackedOrderCases = normalizeTrackedOrderCases(JSON.parse(storedTrackedOrderCases));
    } catch (error) {
      console.error('Error parsing tracked order cases:', error);
    }
  }

  if (!storedUserId) {
    return {
      accountEmail,
      caseIds,
      hasAccount,
      trackedOrderCases,
      userId: null,
    };
  }

  try {
    const response = await fetch(`/api/users?userId=${storedUserId}`);
    const data = await response.json();
    if (data.success && data.user) {
      caseIds = normalizeCaseIds(data.user.caseIds);
      trackedOrderCases = normalizeTrackedOrderCases(data.user.trackedOrderCases);
      accountEmail = data.user.email || accountEmail;
      localStorage.setItem('trackedCaseIds', JSON.stringify(caseIds));
      localStorage.setItem('trackedOrderCases', JSON.stringify(trackedOrderCases));
      if (accountEmail) {
        localStorage.setItem('userEmail', accountEmail);
      }
    }
  } catch (error) {
    console.error('Error fetching tracked state:', error);
  }

  return {
    accountEmail,
    caseIds,
    hasAccount,
    trackedOrderCases,
    userId: storedUserId,
  };
}

import { TrackedOrderCase } from '@/types/court';

type OrderTrackingKeyInput = {
  city?: string;
  caseType?: string;
  caseNo?: string;
  caseYear?: string;
};

export function normalizeCaseIds(caseIds: unknown): string[] {
  if (!Array.isArray(caseIds)) return [];
  return caseIds
    .map((id) => String(id || '').trim().toUpperCase())
    .filter(Boolean);
}

export function normalizeTrackingCity(city?: string): 'lucknow' | 'allahabad' {
  return city?.toLowerCase() === 'allahabad' ? 'allahabad' : 'lucknow';
}

export function buildOrderTrackingKey(input: OrderTrackingKeyInput): string {
  const city = normalizeTrackingCity(input.city);
  const caseType = String(input.caseType || '').trim();
  const caseNo = String(input.caseNo || '').trim();
  const caseYear = String(input.caseYear || '').trim();
  return `${city}|${caseType}|${caseNo}|${caseYear}`;
}

export function normalizeTrackedOrderCase(item: unknown): TrackedOrderCase | null {
  if (!item || typeof item !== 'object') return null;
  const raw = item as Record<string, unknown>;
  const city = normalizeTrackingCity(String(raw.city || 'lucknow'));
  const caseType = String(raw.caseType || '').trim();
  const caseNo = String(raw.caseNo || '').trim();
  const caseYear = String(raw.caseYear || '').trim();
  const caseTypeLabelRaw = String(raw.caseTypeLabel || '').trim();

  if (!caseType || !/^\d+$/.test(caseNo) || !/^\d{4}$/.test(caseYear)) {
    return null;
  }

  return {
    city,
    caseType,
    caseTypeLabel: caseTypeLabelRaw || undefined,
    caseNo,
    caseYear,
    trackingKey: buildOrderTrackingKey({ city, caseType, caseNo, caseYear }),
  };
}

export function normalizeTrackedOrderCases(
  trackedOrderCases: unknown
): TrackedOrderCase[] {
  if (!Array.isArray(trackedOrderCases)) return [];

  const byKey = new Map<string, TrackedOrderCase>();
  for (const item of trackedOrderCases) {
    const normalized = normalizeTrackedOrderCase(item);
    if (!normalized) continue;
    byKey.set(normalized.trackingKey, normalized);
  }
  return Array.from(byKey.values());
}

export function parseOrderTrackingKey(
  trackingKey: string
): TrackedOrderCase | null {
  const parts = String(trackingKey || '').split('|');
  if (parts.length !== 4) return null;
  return normalizeTrackedOrderCase({
    city: parts[0],
    caseType: parts[1],
    caseNo: parts[2],
    caseYear: parts[3],
  });
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import CaseIdModal from '@/views/components/CaseIdModal';
import { TrackedOrderCase } from '@/types/court';

function buildOrderTrackingKey(params: {
  city: string;
  caseType: string;
  caseNo: string;
  caseYear: string;
}) {
  return `${params.city}|${params.caseType}|${params.caseNo}|${params.caseYear}`;
}

function normalizeTrackedOrderCases(trackedCases: unknown): TrackedOrderCase[] {
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

export default function TrackCasesPage() {
  const router = useRouter();
  const [trackedCaseIds, setTrackedCaseIds] = useState<string[]>([]);
  const [trackedOrderCases, setTrackedOrderCases] = useState<TrackedOrderCase[]>([]);

  useEffect(() => {
    const storedCaseIds = localStorage.getItem('trackedCaseIds');
    const storedTrackedOrderCases = localStorage.getItem('trackedOrderCases');
    const storedUserId = localStorage.getItem('userId');

    if (storedCaseIds) {
      try {
        setTrackedCaseIds(JSON.parse(storedCaseIds));
      } catch (error) {
        console.error('Error parsing tracked case IDs:', error);
      }
    }

    if (storedTrackedOrderCases) {
      try {
        setTrackedOrderCases(normalizeTrackedOrderCases(JSON.parse(storedTrackedOrderCases)));
      } catch (error) {
        console.error('Error parsing tracked order cases:', error);
      }
    }

    if (!storedUserId) return;

    fetch(`/api/users?userId=${storedUserId}`)
      .then((response) => response.json())
      .then((data) => {
        if (!data.success || !data.user) return;
        const userCaseIds = Array.isArray(data.user.caseIds) ? data.user.caseIds : [];
        const userTrackedOrderCases = normalizeTrackedOrderCases(data.user.trackedOrderCases);
        setTrackedCaseIds(userCaseIds);
        setTrackedOrderCases(userTrackedOrderCases);
        localStorage.setItem('trackedCaseIds', JSON.stringify(userCaseIds));
        localStorage.setItem('trackedOrderCases', JSON.stringify(userTrackedOrderCases));
      })
      .catch((error) => console.error('Error fetching user data:', error));
  }, []);

  return (
    <CaseIdModal
      isOpen
      onClose={() => router.replace('/')}
      onSave={(caseIds, orderCases) => {
        setTrackedCaseIds(caseIds);
        setTrackedOrderCases(orderCases);
      }}
      existingCaseIds={trackedCaseIds}
      existingTrackedOrderCases={trackedOrderCases}
    />
  );
}

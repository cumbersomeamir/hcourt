'use client';

import { useState, useEffect, useMemo } from 'react';
import CourtTable from '@/views/components/CourtTable';
import NotificationsPanel from '@/views/components/NotificationsPanel';
import CaseIdModal from '@/views/components/CaseIdModal';
import { CourtCase, TrackedOrderCase } from '@/types/court';

function buildOrderTrackingKey(params: {
  city: string;
  caseType: string;
  caseNo: string;
  caseYear: string;
}) {
  return `${params.city}|${params.caseType}|${params.caseNo}|${params.caseYear}`;
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

function normalizeTrackedOrderCases(trackedCases: unknown): TrackedOrderCase[] {
  if (!Array.isArray(trackedCases)) return [];
  const byKey = new Map<string, TrackedOrderCase>();
  for (const item of trackedCases) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;
    const city = String(raw.city || 'lucknow').toLowerCase() === 'allahabad' ? 'allahabad' : 'lucknow';
    const caseType = String(raw.caseType || '').trim();
    const caseNo = String(raw.caseNo || '').trim();
    const caseYear = String(raw.caseYear || '').trim();
    const caseTypeLabel = String(raw.caseTypeLabel || '').trim();
    if (!caseType || !/^\d+$/.test(caseNo) || !/^\d{4}$/.test(caseYear)) continue;
    const trackingKey = String(raw.trackingKey || '').trim() || buildOrderTrackingKey({
      city,
      caseType,
      caseNo,
      caseYear,
    });
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

export default function Home() {
  const [courts, setCourts] = useState<CourtCase[]>([]);
  const [filteredCourts, setFilteredCourts] = useState<CourtCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [scheduleDate, setScheduleDate] = useState<string>('');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [caseIdModalOpen, setCaseIdModalOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [trackedCaseIds, setTrackedCaseIds] = useState<string[]>([]);
  const [trackedOrderCases, setTrackedOrderCases] = useState<TrackedOrderCase[]>([]);
  const [scheduleFilterEnabled, setScheduleFilterEnabled] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const trackedOrderTrackingKeys = useMemo(
    () => trackedOrderCases.map((trackedCase) => trackedCase.trackingKey),
    [trackedOrderCases]
  );
  const derivedTrackedCaseIdsFromOrders = useMemo(
    () =>
      trackedOrderCases
        .map((trackedCase) => deriveCaseIdFromTrackedOrderCase(trackedCase))
        .filter((caseId): caseId is string => Boolean(caseId)),
    [trackedOrderCases]
  );
  const effectiveTrackedCaseIds = useMemo(() => {
    const normalized = [...trackedCaseIds, ...derivedTrackedCaseIdsFromOrders]
      .map((id) => String(id || '').trim().toUpperCase())
      .filter(Boolean);
    return Array.from(new Set(normalized));
  }, [trackedCaseIds, derivedTrackedCaseIdsFromOrders]);
  const hasTrackedScheduleCases = effectiveTrackedCaseIds.length > 0;
  const shouldApplyScheduleFilter = scheduleFilterEnabled && hasTrackedScheduleCases;
  const desktopNavItemClass =
    'group relative inline-flex h-11 items-center gap-2 rounded-full border bg-slate-950/35 px-4 text-sm font-semibold text-slate-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-colors duration-200 hover:bg-slate-900/70';
  const mobileMenuItemClass =
    'relative flex min-h-14 items-center gap-3 rounded-2xl border bg-slate-950/40 px-4 py-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-colors duration-200 hover:bg-slate-900/70';
  const mobileMenuIconClass =
    'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border bg-slate-950/80';

  const fetchSchedule = async (force = false) => {
    try {
      setError(null);
      const params = new URLSearchParams();
      if (force) {
        params.append('force', 'true');
      }
      if (shouldApplyScheduleFilter) {
        params.append('caseIds', effectiveTrackedCaseIds.join(','));
      }
      if (!shouldApplyScheduleFilter && scheduleFilterEnabled && userId) {
        params.append('userId', userId);
      }

      const url = force || shouldApplyScheduleFilter || (scheduleFilterEnabled && userId)
        ? `/api/schedule/latest?${params.toString()}`
        : '/api/schedule/latest';

      const response = await fetch(url);
      const data = await response.json();
      if (data.success && data.schedule) {
        const courtsData = data.schedule.courts || [];
        setCourts(courtsData);
        setLastUpdated(new Date(data.schedule.lastUpdated));
        setScheduleDate(
          data.schedule.date ||
            new Date(data.schedule.lastUpdated).toISOString().split('T')[0]
        );
        if (searchTerm.trim()) {
          applySearchFilter(courtsData, searchTerm);
        } else {
          setFilteredCourts(courtsData);
        }
      } else {
        setError(data.error || 'Failed to fetch schedule');
      }
    } catch (error) {
      console.error('Error fetching schedule:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch schedule');
    } finally {
      setLoading(false);
    }
  };

  const applySearchFilter = (courtsToFilter: CourtCase[], term: string) => {
    if (!term.trim()) {
      setFilteredCourts(courtsToFilter);
      return;
    }

    const searchLower = term.toLowerCase().trim();
    const filtered = courtsToFilter.filter((court) => {
      if (court.courtNo.toLowerCase().includes(searchLower)) return true;
      if (court.serialNo && court.serialNo.toLowerCase().includes(searchLower)) return true;
      if (court.list && court.list.toLowerCase().includes(searchLower)) return true;
      if (court.progress && court.progress.toLowerCase().includes(searchLower)) return true;
      if (court.caseDetails) {
        if (court.caseDetails.caseNumber.toLowerCase().includes(searchLower)) return true;
        if (court.caseDetails.title.toLowerCase().includes(searchLower)) return true;
        if (court.caseDetails.petitionerCounsels.some(
          (counsel) => counsel.toLowerCase().includes(searchLower)
        )) return true;
        if (court.caseDetails.respondentCounsels.some(
          (counsel) => counsel.toLowerCase().includes(searchLower)
        )) return true;
      }
      return false;
    });

    setFilteredCourts(filtered);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const term = e.target.value;
    setSearchTerm(term);
    applySearchFilter(courts, term);
  };

  const checkNotifications = async () => {
    try {
      const params = new URLSearchParams();
      params.append('unreadOnly', 'true');
      params.append('limit', '1');
      if (effectiveTrackedCaseIds.length > 0) {
        params.append('caseIds', effectiveTrackedCaseIds.join(','));
      }
      if (trackedOrderTrackingKeys.length > 0) {
        params.append('orderTrackingKeys', trackedOrderTrackingKeys.join(','));
      }
      if (userId) {
        params.append('userId', userId);
      }

      const response = await fetch(`/api/notifications?${params.toString()}`);
      const data = await response.json();
      if (data.success) {
        setUnreadCount(data.count || 0);
      }
    } catch (error) {
      console.error('Error checking notifications:', error);
    }
  };

  useEffect(() => {
    const storedCaseIds = localStorage.getItem('trackedCaseIds');
    const storedTrackedOrderCases = localStorage.getItem('trackedOrderCases');
    const storedUserId = localStorage.getItem('userId');
    const hasSkipped = localStorage.getItem('hasSkippedCaseIdEntry');

    if (storedCaseIds) {
      try {
        setTrackedCaseIds(JSON.parse(storedCaseIds));
      } catch (e) {
        console.error('Error parsing tracked case IDs:', e);
      }
    }
    if (storedTrackedOrderCases) {
      try {
        setTrackedOrderCases(normalizeTrackedOrderCases(JSON.parse(storedTrackedOrderCases)));
      } catch (e) {
        console.error('Error parsing tracked order cases:', e);
      }
    }

    if (storedUserId) {
      setUserId(storedUserId);
      fetch(`/api/users?userId=${storedUserId}`)
        .then(res => res.json())
        .then(data => {
          if (data.success && data.user) {
            const userCaseIds = Array.isArray(data.user.caseIds) ? data.user.caseIds : [];
            const userTrackedOrderCases = normalizeTrackedOrderCases(data.user.trackedOrderCases);
            setTrackedCaseIds(userCaseIds);
            setTrackedOrderCases(userTrackedOrderCases);
            localStorage.setItem('trackedCaseIds', JSON.stringify(userCaseIds));
            localStorage.setItem('trackedOrderCases', JSON.stringify(userTrackedOrderCases));
          }
        })
        .catch(err => console.error('Error fetching user data:', err));
    }

    if (!storedCaseIds && !storedTrackedOrderCases && !hasSkipped && !storedUserId) {
      setCaseIdModalOpen(true);
    }
  }, []);

  useEffect(() => {
    fetchSchedule();
    checkNotifications();

    const scheduleInterval = setInterval(() => {
      fetchSchedule();
    }, 30000);

    const notificationInterval = setInterval(() => {
      checkNotifications();
    }, 10000);

    return () => {
      clearInterval(scheduleInterval);
      clearInterval(notificationInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveTrackedCaseIds, trackedOrderTrackingKeys, scheduleFilterEnabled, userId]);

  useEffect(() => {
    if (courts.length > 0 && !searchTerm) {
      setFilteredCourts(courts);
    }
  }, [courts, searchTerm]);

  return (
    <div className="min-h-screen">
      <button
        onClick={() => setMobileNavOpen((open) => !open)}
        className="fixed right-4 top-4 z-50 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-700/60 bg-slate-950/80 text-slate-100 shadow-[0_18px_40px_rgba(2,6,23,0.45)] backdrop-blur-xl lg:hidden"
        aria-label="Toggle navigation menu"
        aria-expanded={mobileNavOpen}
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={mobileNavOpen ? 'M6 18L18 6M6 6l12 12' : 'M4 7h16M4 12h16M4 17h16'} />
        </svg>
      </button>
      <div
        className={`fixed inset-0 z-40 bg-slate-950/55 backdrop-blur-sm transition-opacity duration-200 lg:hidden ${
          mobileNavOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={() => setMobileNavOpen(false)}
        aria-hidden={!mobileNavOpen}
      />
      <aside
        className={`fixed right-0 top-0 z-50 flex h-full w-[min(24rem,calc(100vw-1rem))] flex-col border-l border-slate-700/60 bg-[#081127]/95 shadow-[-24px_0_80px_rgba(2,6,23,0.65)] backdrop-blur-2xl transition-transform duration-300 ease-out lg:hidden ${
          mobileNavOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-hidden={!mobileNavOpen}
      >
        <div className="flex items-center justify-between border-b border-slate-800/80 px-5 py-4">
          <div>
            <p className="text-[10px] tracking-[0.24em] uppercase text-slate-500">Navigation</p>
            <p className="mt-1 text-sm text-slate-400">Court services and monitoring tools</p>
          </div>
          <button
            onClick={() => setMobileNavOpen(false)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-700/60 bg-slate-950/50 text-slate-100"
            aria-label="Close navigation menu"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-400/10 bg-emerald-400/5 px-3 py-1 text-[11px] font-medium text-emerald-200/80">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
            Live
          </div>
          <div className="grid grid-cols-1 gap-2.5">
            <a href="/web-diary" onClick={() => setMobileNavOpen(false)} className={`${mobileMenuItemClass} border-violet-400/20`} title="View Web Diary">
              <span className={`${mobileMenuIconClass} border-violet-400/20 bg-violet-500/10 text-violet-200`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </span>
              <span className="text-base font-semibold text-slate-100">Web Diary</span>
            </a>
            <a href="/cause-list" onClick={() => setMobileNavOpen(false)} className={`${mobileMenuItemClass} border-amber-400/20`} title="View Cause List">
              <span className={`${mobileMenuIconClass} border-amber-400/20 bg-amber-500/10 text-amber-200`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h8m-8 4h8m-8 4h5M7 3h10a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z" />
                </svg>
              </span>
              <span className="text-base font-semibold text-slate-100">Cause List</span>
            </a>
            <a href="/status" onClick={() => setMobileNavOpen(false)} className={`${mobileMenuItemClass} border-indigo-400/20`} title="View Status">
              <span className={`${mobileMenuIconClass} border-indigo-400/20 bg-indigo-500/10 text-indigo-200`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-6m3 6V7m3 10v-3m4 7H5a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2z" />
                </svg>
              </span>
              <span className="text-base font-semibold text-slate-100">Status</span>
            </a>
            <a href="/orders" onClick={() => setMobileNavOpen(false)} className={`${mobileMenuItemClass} border-rose-400/20`} title="View Orders">
              <span className={`${mobileMenuIconClass} border-rose-400/20 bg-rose-500/10 text-rose-200`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z" />
                </svg>
              </span>
              <span className="text-base font-semibold text-slate-100">Orders</span>
            </a>
            <a href="/track-cases" onClick={() => setMobileNavOpen(false)} className={`${mobileMenuItemClass} border-emerald-400/20`} title="Manage tracked cases">
              <span className={`${mobileMenuIconClass} border-emerald-400/20 bg-emerald-500/10 text-emerald-200`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </span>
              <span className="text-base font-semibold text-slate-100">
                {trackedCaseIds.length + trackedOrderCases.length > 0
                  ? `Tracked (${trackedCaseIds.length + trackedOrderCases.length})`
                  : 'Track Cases'}
              </span>
            </a>
            <button
              onClick={() => {
                setMobileNavOpen(false);
                fetchSchedule(true);
              }}
              disabled={loading}
              className={`${mobileMenuItemClass} border-slate-600/40 disabled:opacity-40`}
            >
              <span className={`${mobileMenuIconClass} border-slate-600/40 bg-slate-800/40 text-slate-200`}>
                <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </span>
              <span className="text-base font-semibold text-slate-100">{loading ? 'Loading...' : 'Refresh'}</span>
            </button>
            <button
              onClick={() => {
                setMobileNavOpen(false);
                setNotificationsOpen(true);
              }}
              className={`${mobileMenuItemClass} border-sky-400/20`}
            >
              <span className={`${mobileMenuIconClass} border-sky-400/20 bg-sky-500/10 text-sky-200`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </span>
              <span className="text-base font-semibold text-slate-100">Alerts</span>
              {unreadCount > 0 && (
                <span className="ml-auto flex h-7 min-w-7 items-center justify-center rounded-full bg-red-500 px-2 text-xs font-bold text-white shadow-lg shadow-red-500/30">
                  {unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </aside>
      <div className="mx-auto max-w-7xl px-3 sm:px-6 py-6 sm:py-10">
        {/* Header Card */}
        <div className="glass-card-lg relative mb-6 overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.12),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(34,211,238,0.10),transparent_30%)]" />
          <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/12 to-transparent" />
          <div className="relative p-5 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div className="hidden lg:flex flex-wrap items-center justify-end gap-2.5 ml-auto">
                <a href="/web-diary" className={`${desktopNavItemClass} border-violet-400/20 text-violet-100 hover:border-violet-300/40`} title="View Web Diary">
                  <svg className="w-4 h-4 text-violet-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Web Diary
                </a>
                <a href="/cause-list" className={`${desktopNavItemClass} border-amber-400/20 text-amber-100 hover:border-amber-300/40`} title="View Cause List">
                  <svg className="w-4 h-4 text-amber-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h8m-8 4h8m-8 4h5M7 3h10a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z" />
                  </svg>
                  Cause List
                </a>
                <a href="/status" className={`${desktopNavItemClass} border-indigo-400/20 text-indigo-100 hover:border-indigo-300/40`} title="View Status">
                  <svg className="w-4 h-4 text-indigo-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-6m3 6V7m3 10v-3m4 7H5a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2z" />
                  </svg>
                  Status
                </a>
                <a href="/orders" className={`${desktopNavItemClass} border-rose-400/20 text-rose-100 hover:border-rose-300/40`} title="View Orders">
                  <svg className="w-4 h-4 text-rose-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z" />
                  </svg>
                  Orders
                </a>
                <a href="/track-cases" className={`${desktopNavItemClass} border-emerald-400/20 text-emerald-100 hover:border-emerald-300/40`} title="Manage tracked cases">
                  <svg className="w-4 h-4 text-emerald-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  {trackedCaseIds.length + trackedOrderCases.length > 0
                    ? `Tracked (${trackedCaseIds.length + trackedOrderCases.length})`
                    : 'Track Cases'}
                </a>
                <button onClick={() => fetchSchedule(true)} disabled={loading} className={`${desktopNavItemClass} border-slate-600/40 hover:border-slate-400/40 disabled:opacity-40`}>
                  <svg className={`w-4 h-4 text-slate-200 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {loading ? 'Loading...' : 'Refresh'}
                </button>
                <button onClick={() => setNotificationsOpen(true)} className={`${desktopNavItemClass} border-sky-400/20 text-sky-100 hover:border-sky-300/40`}>
                  <svg className="w-4 h-4 text-sky-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  Alerts
                  {unreadCount > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white shadow-lg shadow-red-500/30">
                      {unreadCount}
                    </span>
                  )}
                </button>
              </div>
            </div>

            <div className="mt-6 min-w-0">
              <p className="text-[11px] sm:text-xs tracking-[0.32em] uppercase text-amber-300/85 font-medium">
                Court View
              </p>
              <h1 className="mt-3 max-w-3xl text-3xl sm:text-[2.6rem] font-bold leading-[1.05] tracking-[-0.03em] text-slate-50">
                High Court of Judicature at Allahabad
              </h1>
              <p className="mt-3 max-w-2xl text-sm sm:text-base text-slate-400">
                Lucknow Bench &mdash; Online Court Activity Digital Display Board
              </p>
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="mb-5 sm:mb-6">
          <div className="relative">
            <input
              type="text"
              placeholder="Search by court number, case number, title, counsel name..."
              value={searchTerm}
              onChange={handleSearchChange}
              className="w-full rounded-xl border border-slate-600/25 bg-slate-900/50 backdrop-blur-sm px-4 py-3 pl-11 pr-10 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/15 focus:outline-none"
            />
            <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
              <svg className="h-4 w-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            {searchTerm && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setFilteredCourts(courts);
                }}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500 hover:text-slate-300 min-w-[44px]"
                aria-label="Clear search"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          {(searchTerm || shouldApplyScheduleFilter) && (
            <div className="mt-2 text-sm text-slate-400 px-1">
              {searchTerm && shouldApplyScheduleFilter && (
                <span>Showing {filteredCourts.length} of {courts.length} courts (filtered by search & tracked cases)</span>
              )}
              {searchTerm && !shouldApplyScheduleFilter && (
                <span>Showing {filteredCourts.length} of {courts.length} courts</span>
              )}
              {!searchTerm && shouldApplyScheduleFilter && (
                <span>Showing {filteredCourts.length} court{filteredCourts.length !== 1 ? 's' : ''} for your tracked case{effectiveTrackedCaseIds.length !== 1 ? 's' : ''}</span>
              )}
            </div>
          )}
          {!scheduleFilterEnabled && hasTrackedScheduleCases && (
            <div className="mt-2 text-sm text-amber-400/80 px-1">
              Tracked-case filter is off. You are seeing all courts.
              <button
                onClick={() => setScheduleFilterEnabled(true)}
                className="ml-2 text-cyan-400 hover:text-cyan-300 hover:underline"
              >
                Reapply filter
              </button>
            </div>
          )}
        </div>

        {loading && courts.length === 0 ? (
          <div className="glass-card p-12 flex flex-col items-center justify-center">
            <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin mb-4"></div>
            <div className="text-slate-400 text-sm">Loading court schedule...</div>
          </div>
        ) : error ? (
          <div className="glass-card p-12 flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-red-500/15 flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <div className="text-red-400 mb-4 text-center text-sm">{error}</div>
            <button
              onClick={() => fetchSchedule()}
              className="inline-flex items-center gap-2 rounded-xl bg-sky-500/15 border border-sky-400/25 px-5 py-2.5 text-sm font-semibold text-sky-300 hover:bg-sky-500/25"
            >
              Retry
            </button>
          </div>
        ) : searchTerm && filteredCourts.length === 0 ? (
          <div className="glass-card p-12 flex items-center justify-center">
            <div className="text-slate-400 text-sm">
              No courts found matching &quot;{searchTerm}&quot;
            </div>
          </div>
        ) : courts.length > 0 ? (
          <CourtTable
            courts={searchTerm ? filteredCourts : courts}
            lastUpdated={lastUpdated || undefined}
            historyDate={scheduleDate}
          />
        ) : shouldApplyScheduleFilter ? (
          <div className="glass-card p-12 flex flex-col items-center justify-center">
            <div className="text-slate-400 text-center mb-4 text-sm">
              Your tracked case is not in session right now.
            </div>
            <button
              onClick={() => setScheduleFilterEnabled(false)}
              className="inline-flex items-center gap-2 rounded-xl bg-sky-500/15 border border-sky-400/25 px-5 py-2.5 text-sm font-semibold text-sky-300 hover:bg-sky-500/25"
            >
              Remove filter and see all courts
            </button>
          </div>
        ) : (
          <div className="glass-card p-12 flex items-center justify-center">
            <div className="text-slate-400 text-sm">No schedule data available. Click &quot;Refresh&quot; to fetch data.</div>
          </div>
        )}

        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-500 px-2">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500/60 animate-pulse-dot"></span>
          Schedule updates automatically every 30 seconds
        </div>
      </div>

      <NotificationsPanel
        isOpen={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        trackedCaseIds={trackedCaseIds}
        trackedOrderTrackingKeys={trackedOrderTrackingKeys}
        userId={userId}
      />

      <CaseIdModal
        isOpen={caseIdModalOpen}
        onClose={() => setCaseIdModalOpen(false)}
        onSave={(caseIds, orderCases, newUserId) => {
          setTrackedCaseIds(caseIds);
          setTrackedOrderCases(orderCases);
          if (newUserId) {
            setUserId(newUserId);
          }
          fetchSchedule();
          checkNotifications();
        }}
        existingCaseIds={trackedCaseIds}
        existingTrackedOrderCases={trackedOrderCases}
      />
    </div>
  );
}
// Fix: Ensure courts display correctly

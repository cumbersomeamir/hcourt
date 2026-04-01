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
  const [dbStats, setDbStats] = useState<{ schedules: number; changes: number; notifications: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [caseIdModalOpen, setCaseIdModalOpen] = useState(false);
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
  const metricCardClass =
    'rounded-2xl border border-slate-700/40 bg-slate-950/30 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]';
  const quickActionBaseClass =
    'group relative flex min-h-[62px] items-center gap-3 overflow-hidden rounded-2xl border bg-slate-950/40 px-3.5 py-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-all duration-200 hover:bg-slate-900/70';
  const quickActionIconBaseClass =
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

  const fetchDbStats = async () => {
    try {
      const response = await fetch('/api/stats');
      const data = await response.json();
      if (data.success && data.stats) {
        setDbStats({
          schedules: data.stats.schedules,
          changes: data.stats.changes,
          notifications: data.stats.notifications,
        });
      }
    } catch (error) {
      console.error('Error fetching DB stats:', error);
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
    fetchDbStats();

    const scheduleInterval = setInterval(() => {
      fetchSchedule();
    }, 30000);

    const notificationInterval = setInterval(() => {
      checkNotifications();
    }, 10000);

    const statsInterval = setInterval(() => {
      fetchDbStats();
    }, 60000);

    return () => {
      clearInterval(scheduleInterval);
      clearInterval(notificationInterval);
      clearInterval(statsInterval);
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
      <div className="mx-auto max-w-7xl px-3 sm:px-6 py-6 sm:py-10">
        {/* Header Card */}
        <div className="glass-card-lg relative mb-6 overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.12),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(34,211,238,0.10),transparent_30%)]" />
          <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/12 to-transparent" />
          <div className="relative p-5 sm:p-8">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(380px,0.95fr)] lg:gap-8">
              <div className="min-w-0">
                <p className="text-[11px] sm:text-xs tracking-[0.32em] uppercase text-amber-300/85 font-medium">
                  Court View
                </p>
                <h1 className="mt-3 max-w-3xl text-3xl sm:text-[2.6rem] font-bold leading-[1.05] tracking-[-0.03em] text-slate-50">
                  High Court of Judicature at Allahabad
                </h1>
                <p className="mt-3 max-w-2xl text-sm sm:text-base text-slate-400">
                  Lucknow Bench &mdash; Online Court Activity Digital Display Board
                </p>
                {dbStats && (
                  <div className="mt-5 grid grid-cols-2 gap-2.5 min-[560px]:grid-cols-3 max-w-3xl">
                    <div className={metricCardClass}>
                      <div className="flex items-center gap-2">
                        <span className="inline-block h-2 w-2 rounded-full bg-cyan-400"></span>
                        <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
                          Schedules
                        </span>
                      </div>
                      <p className="mt-2 text-lg font-semibold text-slate-100">{dbStats.schedules}</p>
                    </div>
                    <div className={metricCardClass}>
                      <div className="flex items-center gap-2">
                        <span className="inline-block h-2 w-2 rounded-full bg-amber-400"></span>
                        <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
                          Changes
                        </span>
                      </div>
                      <p className="mt-2 text-lg font-semibold text-slate-100">{dbStats.changes}</p>
                    </div>
                    <div className={metricCardClass}>
                      <div className="flex items-center gap-2">
                        <span className="inline-block h-2 w-2 rounded-full bg-emerald-400"></span>
                        <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
                          Notifications
                        </span>
                      </div>
                      <p className="mt-2 text-lg font-semibold text-slate-100">{dbStats.notifications}</p>
                    </div>
                  </div>
                )}
              </div>
              <div className="rounded-[26px] border border-slate-700/45 bg-slate-950/35 p-3 sm:p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] lg:ml-auto lg:w-full lg:max-w-[560px]">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] sm:text-[11px] tracking-[0.24em] uppercase text-slate-500">
                      Quick Access
                    </p>
                    <p className="mt-1 text-xs sm:text-sm text-slate-400">
                      Court services and monitoring tools
                    </p>
                  </div>
                  <div className="hidden sm:inline-flex items-center gap-2 rounded-full border border-emerald-400/10 bg-emerald-400/5 px-3 py-1 text-[11px] font-medium text-emerald-200/80">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                    Live
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  <a
                    href="/web-diary"
                    className={`${quickActionBaseClass} border-violet-400/20 hover:border-violet-300/40`}
                    title="View Web Diary"
                  >
                    <span className={`${quickActionIconBaseClass} border-violet-400/20 bg-violet-500/10 text-violet-200`}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </span>
                    <span className="min-w-0 text-sm font-semibold text-slate-100">Web Diary</span>
                  </a>
                  <a
                    href="/cause-list"
                    className={`${quickActionBaseClass} border-amber-400/20 hover:border-amber-300/40`}
                    title="View Cause List"
                  >
                    <span className={`${quickActionIconBaseClass} border-amber-400/20 bg-amber-500/10 text-amber-200`}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h8m-8 4h8m-8 4h5M7 3h10a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z" />
                      </svg>
                    </span>
                    <span className="min-w-0 text-sm font-semibold text-slate-100">Cause List</span>
                  </a>
                  <a
                    href="/status"
                    className={`${quickActionBaseClass} border-indigo-400/20 hover:border-indigo-300/40`}
                    title="View Status"
                  >
                    <span className={`${quickActionIconBaseClass} border-indigo-400/20 bg-indigo-500/10 text-indigo-200`}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-6m3 6V7m3 10v-3m4 7H5a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2z" />
                      </svg>
                    </span>
                    <span className="min-w-0 text-sm font-semibold text-slate-100">Status</span>
                  </a>
                  <a
                    href="/orders"
                    className={`${quickActionBaseClass} border-rose-400/20 hover:border-rose-300/40`}
                    title="View Orders"
                  >
                    <span className={`${quickActionIconBaseClass} border-rose-400/20 bg-rose-500/10 text-rose-200`}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z" />
                      </svg>
                    </span>
                    <span className="min-w-0 text-sm font-semibold text-slate-100">Orders</span>
                  </a>
                  <button
                    onClick={() => setCaseIdModalOpen(true)}
                    className={`${quickActionBaseClass} border-emerald-400/20 hover:border-emerald-300/40`}
                    title="Manage tracked cases"
                  >
                    <span className={`${quickActionIconBaseClass} border-emerald-400/20 bg-emerald-500/10 text-emerald-200`}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    </span>
                    <span className="min-w-0 text-sm font-semibold text-slate-100">
                      {trackedCaseIds.length + trackedOrderCases.length > 0
                        ? `Tracked (${trackedCaseIds.length + trackedOrderCases.length})`
                        : 'Track Cases'}
                    </span>
                  </button>
                  <button
                    onClick={() => fetchSchedule(true)}
                    disabled={loading}
                    className={`${quickActionBaseClass} border-slate-600/40 hover:border-slate-400/40 disabled:opacity-40 disabled:hover:bg-slate-950/40`}
                  >
                    <span className={`${quickActionIconBaseClass} border-slate-600/40 bg-slate-800/40 text-slate-200`}>
                      <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </span>
                    <span className="min-w-0 text-sm font-semibold text-slate-100">
                      {loading ? 'Loading...' : 'Refresh'}
                    </span>
                  </button>
                  <button
                    onClick={() => setNotificationsOpen(true)}
                    className={`${quickActionBaseClass} border-sky-400/20 hover:border-sky-300/40`}
                  >
                    <span className={`${quickActionIconBaseClass} border-sky-400/20 bg-sky-500/10 text-sky-200`}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                      </svg>
                    </span>
                    <span className="min-w-0 text-sm font-semibold text-slate-100">Alerts</span>
                    {unreadCount > 0 && (
                      <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-lg shadow-red-500/30">
                        {unreadCount}
                      </span>
                    )}
                  </button>
                </div>
              </div>
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

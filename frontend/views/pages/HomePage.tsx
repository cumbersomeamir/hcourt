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

  const fetchSchedule = async () => {
    try {
      setError(null);
      // Build query params with tracked case IDs when filter is enabled
      const params = new URLSearchParams();
      if (shouldApplyScheduleFilter) {
        params.append('caseIds', effectiveTrackedCaseIds.join(','));
      }
      if (!shouldApplyScheduleFilter && scheduleFilterEnabled && userId) {
        params.append('userId', userId);
      }

      const url = shouldApplyScheduleFilter || (scheduleFilterEnabled && userId)
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
        // Apply current search filter or set all courts
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
      // Search in court number
      if (court.courtNo.toLowerCase().includes(searchLower)) return true;
      
      // Search in serial number
      if (court.serialNo && court.serialNo.toLowerCase().includes(searchLower)) return true;
      
      // Search in list
      if (court.list && court.list.toLowerCase().includes(searchLower)) return true;
      
      // Search in progress
      if (court.progress && court.progress.toLowerCase().includes(searchLower)) return true;
      
      // Search in case details
      if (court.caseDetails) {
        // Case number
        if (court.caseDetails.caseNumber.toLowerCase().includes(searchLower)) return true;
        
        // Title
        if (court.caseDetails.title.toLowerCase().includes(searchLower)) return true;
        
        // Petitioner counsels
        if (court.caseDetails.petitionerCounsels.some(
          (counsel) => counsel.toLowerCase().includes(searchLower)
        )) return true;
        
        // Respondent counsels
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


  // Load tracked case IDs and user info from localStorage on mount
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
      // Optionally fetch user's case IDs from DB
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

    // Show modal if user hasn't entered case IDs and hasn't skipped
    if (!storedCaseIds && !storedTrackedOrderCases && !hasSkipped && !storedUserId) {
      setCaseIdModalOpen(true);
    }
  }, []);

  useEffect(() => {
    // Initial load
    fetchSchedule();
    checkNotifications();
    fetchDbStats();

    // Poll for schedule updates every 30 seconds (backend worker handles change detection)
    const scheduleInterval = setInterval(() => {
      fetchSchedule();
    }, 30000);

    // Check for new notifications every 10 seconds
    const notificationInterval = setInterval(() => {
      checkNotifications();
    }, 10000);

    // Refresh DB stats every 60 seconds
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

  // Initialize filtered courts when courts data changes
  useEffect(() => {
    if (courts.length > 0 && !searchTerm) {
      setFilteredCourts(courts);
    }
  }, [courts, searchTerm]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <div className="mb-4 sm:mb-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100 leading-tight">
                High Court of Judicature at Allahabad, Lucknow Bench
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                Court View - Online Court Activity Digital Display Board System
              </p>
              {dbStats && (
                <div className="mt-2 sm:mt-3 flex flex-wrap gap-2 sm:gap-4 text-xs text-gray-500 dark:text-gray-400">
                  <span>📊 Schedules: {dbStats.schedules}</span>
                  <span>📝 Changes: {dbStats.changes}</span>
                  <span>🔔 Notifications: {dbStats.notifications}</span>
                </div>
              )}
            </div>
            <div className="flex gap-2 sm:gap-3 flex-shrink-0">
              <a
                href="/web-diary"
                className="rounded-md bg-purple-600 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-white hover:bg-purple-700 active:bg-purple-800 touch-manipulation inline-flex items-center gap-2"
                title="View Web Diary"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                Web Diary
              </a>
              <a
                href="/cause-list"
                className="rounded-md bg-orange-600 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-white hover:bg-orange-700 active:bg-orange-800 touch-manipulation inline-flex items-center gap-2"
                title="View Cause List"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7h8m-8 4h8m-8 4h5M7 3h10a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z"
                  />
                </svg>
                Cause List
              </a>
              <a
                href="/status"
                className="rounded-md bg-indigo-600 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-white hover:bg-indigo-700 active:bg-indigo-800 touch-manipulation inline-flex items-center gap-2"
                title="View Status"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 17v-6m3 6V7m3 10v-3m4 7H5a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2z"
                  />
                </svg>
                Status
              </a>
              <button
                onClick={() => setCaseIdModalOpen(true)}
                className="rounded-md bg-green-600 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-white hover:bg-green-700 active:bg-green-800 touch-manipulation"
                title="Manage tracked cases"
              >
                {trackedCaseIds.length + trackedOrderCases.length > 0
                  ? `Tracked (${trackedCaseIds.length + trackedOrderCases.length})`
                  : 'Track Cases'}
              </button>
              <button
                onClick={() => fetchSchedule()}
                disabled={loading}
                className="rounded-md bg-gray-600 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-white hover:bg-gray-700 active:bg-gray-800 disabled:opacity-50 touch-manipulation"
              >
                {loading ? 'Loading...' : 'Refresh'}
              </button>
              <button
                onClick={() => setNotificationsOpen(true)}
                className="relative rounded-md bg-blue-600 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-white hover:bg-blue-700 active:bg-blue-800 touch-manipulation"
              >
                Notifications
                {unreadCount > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 sm:-right-2 sm:-top-2 flex h-4 w-4 sm:h-5 sm:w-5 items-center justify-center rounded-full bg-red-500 text-[10px] sm:text-xs text-white">
                    {unreadCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="mb-4 sm:mb-6">
          <div className="relative">
            <input
              type="text"
              placeholder="Search by court number, case number, title, counsel name..."
              value={searchTerm}
              onChange={handleSearchChange}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 sm:px-4 py-2.5 sm:py-3 pl-9 sm:pl-10 pr-9 sm:pr-10 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none touch-manipulation"
            />
            <div className="absolute inset-y-0 left-0 flex items-center pl-2.5 sm:pl-3 pointer-events-none">
              <svg
                className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
            {searchTerm && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setFilteredCourts(courts);
                }}
                className="absolute inset-y-0 right-0 flex items-center pr-2.5 sm:pr-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 touch-manipulation min-w-[44px]"
                aria-label="Clear search"
              >
                <svg
                  className="h-4 w-4 sm:h-5 sm:w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>
          {(searchTerm || shouldApplyScheduleFilter) && (
            <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
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
            <div className="mt-2 text-sm text-amber-300">
              Tracked-case filter is off. You are seeing all courts.
              <button
                onClick={() => setScheduleFilterEnabled(true)}
                className="ml-2 text-blue-400 hover:underline"
              >
                Reapply filter
              </button>
            </div>
          )}
        </div>

        {loading && courts.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-gray-500 dark:text-gray-400">Loading court schedule...</div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12 px-4">
            <div className="text-red-600 dark:text-red-400 mb-4 text-center">
              Error: {error}
            </div>
            <button
              onClick={fetchSchedule}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Retry
            </button>
          </div>
        ) : searchTerm && filteredCourts.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-gray-500 dark:text-gray-400">
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
          <div className="flex flex-col items-center justify-center py-12 px-4">
            <div className="text-gray-400 text-center mb-4">
              Your tracked case is not in session right now.
            </div>
            <button
              onClick={() => setScheduleFilterEnabled(false)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Remove filter and see all courts
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center py-12">
            <div className="text-gray-500 dark:text-gray-400">No schedule data available. Click &quot;Refresh&quot; to fetch data.</div>
          </div>
        )}

        <div className="mt-3 sm:mt-4 text-center text-xs text-gray-500 dark:text-gray-400 px-2">
          Schedule updates automatically every 30 seconds. Change detection runs in the background.
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
          // Refresh schedule and notifications after saving
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

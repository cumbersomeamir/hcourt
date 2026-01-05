'use client';

import { useState, useEffect } from 'react';
import CourtTable from '@/components/CourtTable';
import NotificationsPanel from '@/components/NotificationsPanel';
import { CourtCase } from '@/types/court';

export default function Home() {
  const [courts, setCourts] = useState<CourtCase[]>([]);
  const [filteredCourts, setFilteredCourts] = useState<CourtCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [dbStats, setDbStats] = useState<{ schedules: number; changes: number; notifications: number } | null>(null);

  const fetchSchedule = async () => {
    try {
      const response = await fetch('/api/schedule/latest');
      const data = await response.json();
      if (data.success && data.schedule) {
        const courtsData = data.schedule.courts || [];
        setCourts(courtsData);
        setLastUpdated(new Date(data.schedule.lastUpdated));
        // Apply current search filter or set all courts
        if (searchTerm.trim()) {
          applySearchFilter(courtsData, searchTerm);
        } else {
          setFilteredCourts(courtsData);
        }
      }
    } catch (error) {
      console.error('Error fetching schedule:', error);
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
      const response = await fetch('/api/notifications?unreadOnly=true&limit=1');
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

  const startMonitoring = async () => {
    if (isMonitoring) return;
    setIsMonitoring(true);

    try {
      const response = await fetch('/api/monitor', { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        if (data.changesDetected > 0) {
          // Refresh schedule and notifications
          await fetchSchedule();
          await checkNotifications();
        }
      }
    } catch (error) {
      console.error('Error monitoring:', error);
    } finally {
      setIsMonitoring(false);
    }
  };

  useEffect(() => {
    fetchSchedule();
    checkNotifications();
    fetchDbStats();

    // Poll for schedule updates every 30 seconds
    const scheduleInterval = setInterval(() => {
      fetchSchedule();
    }, 30000);

    // Poll for monitoring changes every 30 seconds
    const monitorInterval = setInterval(() => {
      startMonitoring();
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
      clearInterval(monitorInterval);
      clearInterval(notificationInterval);
      clearInterval(statsInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initialize filtered courts when courts data changes
  useEffect(() => {
    if (courts.length > 0 && !searchTerm) {
      setFilteredCourts(courts);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          {searchTerm && (
            <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Showing {filteredCourts.length} of {courts.length} courts
            </div>
          )}
        </div>

        {loading && courts.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-gray-500 dark:text-gray-400">Loading court schedule...</div>
          </div>
        ) : searchTerm && filteredCourts.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-gray-500 dark:text-gray-400">
              No courts found matching &quot;{searchTerm}&quot;
            </div>
          </div>
        ) : courts.length > 0 ? (
          <CourtTable courts={searchTerm ? filteredCourts : courts} lastUpdated={lastUpdated || undefined} />
        ) : null}

        <div className="mt-3 sm:mt-4 text-center text-xs text-gray-500 dark:text-gray-400 px-2">
          This page refreshes automatically every 30 seconds
        </div>
      </div>

      <NotificationsPanel
        isOpen={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
      />
    </div>
  );
}
// Fix: Ensure courts display correctly

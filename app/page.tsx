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

  const fetchAndSyncSchedule = async () => {
    try {
      // Fetch HTML directly from court website (browser can do this, no SSL issues)
      const courtResponse = await fetch('https://courtview2.allahabadhighcourt.in/courtview/CourtViewLucknow.do', {
        mode: 'cors',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
      
      if (!courtResponse.ok) {
        throw new Error('Failed to fetch court website');
      }
      
      const html = await courtResponse.text();
      
      // Send HTML to our API to parse and save
      const uploadResponse = await fetch('/api/schedule/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html }),
      });
      
      const uploadData = await uploadResponse.json();
      
      if (uploadData.success) {
        // Now fetch the latest schedule from our DB
        await fetchSchedule();
      }
    } catch (error) {
      console.error('Error syncing schedule:', error);
      // Fallback: try to get from DB anyway
      await fetchSchedule();
    }
  };

  const fetchSchedule = async () => {
    try {
      const response = await fetch('/api/schedule/latest');
      const data = await response.json();
      if (data.success && data.schedule) {
        const courtsData = data.schedule.courts || [];
        setCourts(courtsData);
        setLastUpdated(new Date(data.schedule.lastUpdated));
        // Apply current search filter
        applySearchFilter(courtsData, searchTerm);
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

  // Client-side monitoring (fetches HTML in browser, sends to API)
  const startMonitoring = async () => {
    if (isMonitoring) return;
    setIsMonitoring(true);

    try {
      // Fetch HTML directly from court website (browser handles SSL fine)
      const courtResponse = await fetch('https://courtview2.allahabadhighcourt.in/courtview/CourtViewLucknow.do', {
        mode: 'cors',
      });
      
      if (!courtResponse.ok) {
        throw new Error('Failed to fetch court website');
      }
      
      const html = await courtResponse.text();
      
      // Send to API for change detection and saving
      const response = await fetch('/api/monitor/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html }),
      });
      
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
    // First load: fetch and sync schedule
    fetchAndSyncSchedule();
    checkNotifications();
    fetchDbStats();

    // Poll for schedule updates every 30 seconds (client-side fetch + sync)
    const scheduleInterval = setInterval(() => {
      fetchAndSyncSchedule();
    }, 30000);

    // Poll for monitoring changes every 30 seconds (client-side)
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
  }, []);

  // Initialize filtered courts when courts data changes
  useEffect(() => {
    if (courts.length > 0 && filteredCourts.length === 0 && !searchTerm) {
      setFilteredCourts(courts);
    }
  }, [courts, searchTerm]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-8">
        {/* Header */}
        <div className="mb-4 sm:mb-6">
          <div className="mb-4 sm:mb-0">
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
          {/* Buttons - Stack on mobile, row on desktop */}
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mt-4 sm:mt-0 sm:absolute sm:top-4 sm:right-4">
            <button
              onClick={() => fetchSchedule()}
              disabled={loading}
              className="rounded-md bg-gray-600 px-4 py-2.5 sm:py-2 text-sm font-medium text-white hover:bg-gray-700 active:bg-gray-800 disabled:opacity-50 touch-manipulation w-full sm:w-auto"
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
            <button
              onClick={() => setNotificationsOpen(true)}
              className="relative rounded-md bg-blue-600 px-4 py-2.5 sm:py-2 text-sm font-medium text-white hover:bg-blue-700 active:bg-blue-800 touch-manipulation w-full sm:w-auto"
            >
              Notifications
              {unreadCount > 0 && (
                <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white">
                  {unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="mb-4 sm:mb-6">
          <div className="relative">
            <input
              type="text"
              placeholder="Search courts, cases, counsels..."
              value={searchTerm}
              onChange={handleSearchChange}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2.5 sm:py-3 pl-9 sm:pl-10 pr-9 sm:pr-10 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none touch-manipulation"
            />
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
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
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 active:opacity-70 touch-manipulation"
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
            <div className="mt-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
              Showing {filteredCourts.length} of {courts.length} courts
            </div>
          )}
        </div>

        {loading && courts.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-sm sm:text-base text-gray-500 dark:text-gray-400">Loading court schedule...</div>
          </div>
        ) : filteredCourts.length === 0 && searchTerm ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-sm sm:text-base text-gray-500 dark:text-gray-400 text-center px-4">
              No courts found matching &quot;{searchTerm}&quot;
            </div>
          </div>
        ) : (
          <CourtTable courts={filteredCourts.length > 0 || searchTerm ? filteredCourts : courts} lastUpdated={lastUpdated || undefined} />
        )}

        <div className="mt-4 text-center text-xs text-gray-500 dark:text-gray-400 px-4">
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

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Notification {
  title: string;
  pdfLink?: string;
  date: string;
  allLinks?: Array<{ type: string; link: string }>;
}

export default function WebDiaryPage() {
  const currentDate = new Date();
  const currentDay = currentDate.getDate();
  const currentMonth = currentDate.getMonth() + 1; // 1-12
  const currentYear = currentDate.getFullYear();

  const [month, setMonth] = useState<string>(currentMonth.toString());
  const [year, setYear] = useState<string>(currentYear.toString());
  const [day, setDay] = useState<string>(currentDay.toString());
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Load current date's data on mount
    fetchDiaryData(currentDay, currentMonth, currentYear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // When month/year changes, reset to day 1 and fetch
    if (month && year) {
      const newDay = parseInt(day);
      if (newDay && newDay >= 1 && newDay <= 31) {
        fetchDiaryData(newDay, parseInt(month), parseInt(year));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, year]);

  const fetchDiaryData = async (selectedDay: number, selectedMonth: number, selectedYear: number) => {
    try {
      setLoading(true);
      setError(null);
      setNotifications([]);

      const response = await fetch(
        `/api/web-diary?date=${selectedDay}&month=${selectedMonth}&year=${selectedYear}`
      );
      const data = await response.json();

      if (data.success && data.data) {
        if (data.data.notifications && data.data.notifications.length > 0) {
          setNotifications(data.data.notifications);
        } else {
          setError('No notifications available for this date.');
        }
      } else {
        setError(data.error || 'Failed to fetch diary data');
      }
    } catch (err) {
      console.error('Error fetching diary data:', err);
      setError('Failed to load diary data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDateChange = (newDay: string) => {
    setDay(newDay);
    const dayNum = parseInt(newDay);
    if (dayNum && dayNum >= 1 && dayNum <= 31 && month && year) {
      fetchDiaryData(dayNum, parseInt(month), parseInt(year));
    }
  };

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // Generate days for selected month
  const getDaysInMonth = (monthNum: number, yearNum: number) => {
    return new Date(yearNum, monthNum, 0).getDate();
  };

  const daysInMonth = month && year ? getDaysInMonth(parseInt(month), parseInt(year)) : 31;
  const dayOptions = Array.from({ length: daysInMonth }, (_, i) => (i + 1).toString());

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6">
        {/* Header */}
        <div className="mb-4 sm:mb-6">
          <div className="flex items-center gap-4 mb-3 sm:mb-4">
            <Link
              href="/"
              className="text-blue-600 dark:text-blue-400 hover:underline text-sm font-medium flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Court View
            </Link>
          </div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100">
            Web Diary
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
            High Court of Judicature at Allahabad - Daily Notifications & Cause Lists
          </p>
        </div>

        {/* Date Selector - Mobile Optimized */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-3 sm:p-4 mb-4 sm:mb-6">
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 sm:mb-2">
                Day
              </label>
              <select
                value={day}
                onChange={(e) => handleDateChange(e.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 sm:px-3 py-1.5 sm:py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                {dayOptions.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 sm:mb-2">
                Month
              </label>
              <select
                value={month}
                onChange={(e) => {
                  setMonth(e.target.value);
                  setDay('1');
                }}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 sm:px-3 py-1.5 sm:py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                {monthNames.map((name, idx) => (
                  <option key={idx} value={(idx + 1).toString()}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 sm:mb-2">
                Year
              </label>
              <select
                value={year}
                onChange={(e) => {
                  setYear(e.target.value);
                  setDay('1');
                }}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 sm:px-3 py-1.5 sm:py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                {Array.from({ length: 62 }, (_, i) => currentYear - 30 + i).map((y) => (
                  <option key={y} value={y.toString()}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-3 sm:p-4 sm:p-6">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100 mb-3 sm:mb-4">
            Notifications for {day} {monthNames[parseInt(month) - 1]} {year}
          </h2>
          
          {loading ? (
            <div className="flex items-center justify-center py-8 sm:py-12">
              <div className="text-gray-500 dark:text-gray-400 text-sm sm:text-base">Loading notifications...</div>
            </div>
          ) : error ? (
            <div className="text-center py-8 sm:py-12">
              <div className="text-red-600 dark:text-red-400 text-sm sm:text-base mb-2">{error}</div>
              <button
                onClick={() => fetchDiaryData(parseInt(day), parseInt(month), parseInt(year))}
                className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
              >
                Retry
              </button>
            </div>
          ) : notifications.length > 0 ? (
            <div className="space-y-3 sm:space-y-4">
              {notifications.map((notification, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3 sm:p-4 hover:border-blue-300 dark:hover:border-blue-600 transition-all"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">
                        {notification.title}
                      </h3>
                      {notification.allLinks && notification.allLinks.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {notification.allLinks.map((linkItem, linkIdx) => (
                            <a
                              key={linkIdx}
                              href={linkItem.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                                linkItem.type === 'PDF'
                                  ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50'
                                  : linkItem.type === 'ODT'
                                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50'
                                  : linkItem.type === 'DOC'
                                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/50'
                                  : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                              }`}
                            >
                              {linkItem.type === 'PDF' && (
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                              )}
                              {linkItem.type}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 sm:py-12 text-gray-500 dark:text-gray-400 text-sm sm:text-base">
              No notifications available for this date.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

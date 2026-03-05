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
    <div className="min-h-screen">
      <div className="mx-auto max-w-7xl px-3 sm:px-6 py-6 sm:py-10">
        {/* Header */}
        <div className="mb-5 sm:mb-6">
          <div className="flex items-center gap-4 mb-3 sm:mb-4">
            <Link
              href="/"
              className="text-cyan-400 hover:text-cyan-300 text-sm font-medium flex items-center gap-1.5 group"
            >
              <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Court View
            </Link>
          </div>
          <div className="glass-card-lg p-5 sm:p-8">
            <p className="text-[11px] sm:text-xs tracking-[0.25em] uppercase text-amber-400/80 font-medium mb-2">
              Web Diary
            </p>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-100">
              Daily Notifications & Cause Lists
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-400">
              High Court of Judicature at Allahabad
            </p>
          </div>
        </div>

        {/* Date Selector */}
        <div className="glass-card p-4 sm:p-5 mb-5 sm:mb-6">
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            <div>
              <label className="block text-xs sm:text-sm font-medium text-slate-400 mb-1.5">
                Day
              </label>
              <select
                value={day}
                onChange={(e) => handleDateChange(e.target.value)}
                className="w-full rounded-lg border border-slate-600/25 bg-slate-900/60 px-2 sm:px-3 py-2 sm:py-2.5 text-sm text-slate-100 focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/15 focus:outline-none"
              >
                {dayOptions.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-medium text-slate-400 mb-1.5">
                Month
              </label>
              <select
                value={month}
                onChange={(e) => {
                  setMonth(e.target.value);
                  setDay('1');
                }}
                className="w-full rounded-lg border border-slate-600/25 bg-slate-900/60 px-2 sm:px-3 py-2 sm:py-2.5 text-sm text-slate-100 focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/15 focus:outline-none"
              >
                {monthNames.map((name, idx) => (
                  <option key={idx} value={(idx + 1).toString()}>{name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-medium text-slate-400 mb-1.5">
                Year
              </label>
              <select
                value={year}
                onChange={(e) => {
                  setYear(e.target.value);
                  setDay('1');
                }}
                className="w-full rounded-lg border border-slate-600/25 bg-slate-900/60 px-2 sm:px-3 py-2 sm:py-2.5 text-sm text-slate-100 focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/15 focus:outline-none"
              >
                {Array.from({ length: 62 }, (_, i) => currentYear - 30 + i).map((y) => (
                  <option key={y} value={y.toString()}>{y}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className="glass-card p-4 sm:p-6">
          <h2 className="text-lg sm:text-xl font-bold text-slate-100 mb-4">
            Notifications for {day} {monthNames[parseInt(month) - 1]} {year}
          </h2>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-10">
              <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin mb-4"></div>
              <div className="text-slate-400 text-sm">Loading notifications...</div>
            </div>
          ) : error ? (
            <div className="text-center py-10">
              <div className="w-12 h-12 rounded-full bg-red-500/15 flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div className="text-red-400 text-sm mb-3">{error}</div>
              <button
                onClick={() => fetchDiaryData(parseInt(day), parseInt(month), parseInt(year))}
                className="inline-flex items-center gap-2 rounded-xl bg-sky-500/15 border border-sky-400/25 px-5 py-2 text-sm font-semibold text-sky-300 hover:bg-sky-500/25"
              >
                Retry
              </button>
            </div>
          ) : notifications.length > 0 ? (
            <div className="space-y-3">
              {notifications.map((notification, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-slate-700/40 bg-slate-800/30 p-4 hover:border-cyan-500/30 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-1">
                      <div className="w-2 h-2 rounded-full bg-cyan-400/80"></div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm sm:text-base font-semibold text-slate-100 mb-2 leading-relaxed">
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
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                                linkItem.type === 'PDF'
                                  ? 'bg-red-500/15 text-red-300 border border-red-400/20 hover:bg-red-500/25'
                                  : linkItem.type === 'ODT'
                                  ? 'bg-sky-500/15 text-sky-300 border border-sky-400/20 hover:bg-sky-500/25'
                                  : linkItem.type === 'DOC'
                                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/20 hover:bg-emerald-500/25'
                                  : 'bg-slate-500/15 text-slate-300 border border-slate-400/20 hover:bg-slate-500/25'
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
            <div className="text-center py-10 text-slate-500 text-sm">
              No notifications available for this date.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

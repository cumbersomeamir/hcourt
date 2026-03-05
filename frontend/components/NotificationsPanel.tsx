'use client';

import { useState, useEffect } from 'react';
import { Notification } from '@/types/court';

interface NotificationsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  trackedCaseIds?: string[];
  trackedOrderTrackingKeys?: string[];
  userId?: string | null;
}

function downloadBase64(filename: string, base64: string, mime: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function NotificationsPanel({
  isOpen,
  onClose,
  trackedCaseIds = [],
  trackedOrderTrackingKeys = [],
  userId,
}: NotificationsPanelProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [judgmentLoadingId, setJudgmentLoadingId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, trackedCaseIds, trackedOrderTrackingKeys, userId]);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append('limit', '100');
      if (trackedCaseIds.length > 0) {
        params.append('caseIds', trackedCaseIds.join(','));
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
        setNotifications(data.notifications);
        setUnreadCount(data.notifications.filter((n: Notification) => !n.read).length);
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const downloadJudgment = async (viewUrl: string, date: string, judgmentId: string) => {
    try {
      setJudgmentLoadingId(judgmentId);
      const res = await fetch('/api/orders/judgment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ viewUrl, date }),
      });
      const data = await res.json();
      if (!data.success || !data.result) {
        throw new Error(data.error || 'Failed to download order/judgment');
      }
      downloadBase64(
        data.result.filename,
        data.result.base64,
        data.result.mimeType || 'application/pdf'
      );
    } catch (error) {
      console.error('Error downloading order/judgment:', error);
    } finally {
      setJudgmentLoadingId(null);
    }
  };

  const markAsRead = async (notificationIds: string[]) => {
    try {
      const response = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationIds, read: true }),
      });
      if (response.ok) {
        fetchNotifications();
      }
    } catch (error) {
      console.error('Error marking notifications as read:', error);
    }
  };

  const markAllAsRead = async () => {
    const unreadIds = notifications.filter(n => !n.read).map(n => n._id!).filter(Boolean);
    if (unreadIds.length > 0) {
      await markAsRead(unreadIds);
    }
  };

  const formatDate = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleString();
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'new_case':
        return (
          <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-400/20 flex items-center justify-center">
            <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </div>
        );
      case 'status_change':
        return (
          <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-400/20 flex items-center justify-center">
            <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
        );
      case 'change':
        return (
          <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-400/20 flex items-center justify-center">
            <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </div>
        );
      case 'order_update':
        return (
          <div className="w-8 h-8 rounded-lg bg-indigo-500/15 border border-indigo-400/20 flex items-center justify-center">
            <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
        );
      default:
        return (
          <div className="w-8 h-8 rounded-lg bg-sky-500/15 border border-sky-400/20 flex items-center justify-center">
            <svg className="w-4 h-4 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </div>
        );
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className="absolute right-0 top-0 h-full w-full sm:max-w-2xl bg-slate-950/95 backdrop-blur-xl border-l border-slate-700/30 shadow-2xl">
        <div className="flex h-full flex-col">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-700/40 px-5 sm:px-6 py-4 gap-3">
            <h2 className="text-lg sm:text-xl font-bold text-slate-100 flex items-center gap-3">
              <svg className="w-5 h-5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              Notifications
              {unreadCount > 0 && (
                <span className="ml-1 inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white shadow-lg shadow-red-500/30">
                  {unreadCount}
                </span>
              )}
            </h2>
            <div className="flex gap-2 flex-shrink-0">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="inline-flex items-center rounded-lg bg-sky-500/15 border border-sky-400/20 px-3 py-2 text-xs sm:text-sm font-medium text-sky-300 hover:bg-sky-500/25"
                >
                  Mark all as read
                </button>
              )}
              <button
                onClick={onClose}
                className="inline-flex items-center rounded-lg bg-slate-700/40 border border-slate-600/20 px-3 py-2 text-xs sm:text-sm font-medium text-slate-300 hover:bg-slate-700/60"
              >
                Close
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin mb-4"></div>
                <div className="text-slate-400 text-sm">Loading notifications...</div>
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="w-12 h-12 rounded-full bg-slate-800/50 flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                </div>
                <div className="text-slate-500 text-sm">No notifications yet</div>
              </div>
            ) : (
              <div className="space-y-3">
                {notifications.map((notification) => (
                  <div
                    key={notification._id}
                    className={`rounded-xl border p-4 transition-colors ${
                      notification.read
                        ? 'border-slate-700/30 bg-slate-800/20'
                        : 'border-sky-500/25 bg-sky-500/5'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-0.5">
                        {getNotificationIcon(notification.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-semibold text-sm sm:text-base text-slate-100 break-words">
                            {notification.title}
                          </h3>
                          {!notification.read && (
                            <span className="rounded-full bg-sky-400 h-2 w-2 flex-shrink-0 mt-2"></span>
                          )}
                        </div>
                        <div className="mt-1.5 text-xs sm:text-sm text-slate-400 whitespace-pre-line break-words leading-relaxed">
                          {notification.message}
                        </div>
                        {notification.type === 'order_update' && notification.orderJudgment && (
                          <div className="mt-3">
                            <button
                              onClick={() =>
                                downloadJudgment(
                                  notification.orderJudgment!.viewUrl,
                                  notification.orderJudgment!.date,
                                  notification.orderJudgment!.judgmentId
                                )
                              }
                              disabled={judgmentLoadingId === notification.orderJudgment.judgmentId}
                              className="inline-flex items-center gap-2 rounded-lg bg-indigo-500/15 border border-indigo-400/20 px-3 py-2 text-xs sm:text-sm font-medium text-indigo-300 hover:bg-indigo-500/25 disabled:opacity-40"
                            >
                              {judgmentLoadingId === notification.orderJudgment.judgmentId
                                ? 'Downloading...'
                                : 'Download Order/Judgment'}
                            </button>
                          </div>
                        )}
                        <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-500">
                          <span>{formatDate(notification.timestamp)}</span>
                          <span className="w-1 h-1 rounded-full bg-slate-600"></span>
                          <span>Court {notification.courtNo}</span>
                        </div>
                      </div>
                    </div>
                    {!notification.read && (
                      <div className="mt-3 flex justify-end">
                        <button
                          onClick={() => markAsRead([notification._id!])}
                          className="text-xs text-sky-400 hover:text-sky-300 hover:underline font-medium"
                        >
                          Mark as read
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

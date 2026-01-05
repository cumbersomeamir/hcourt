'use client';

import { useState, useEffect } from 'react';
import { Notification } from '@/types/court';

interface NotificationsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function NotificationsPanel({ isOpen, onClose }: NotificationsPanelProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen]);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/notifications?limit=100');
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
        return '🆕';
      case 'status_change':
        return '🔄';
      case 'change':
        return '📝';
      default:
        return '🔔';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose}></div>
      <div className="absolute right-0 top-0 h-full w-full sm:max-w-2xl bg-white dark:bg-gray-900 shadow-xl">
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6 py-3 sm:py-4">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100">
              Notifications {unreadCount > 0 && (
                <span className="ml-2 rounded-full bg-red-500 px-2 py-1 text-xs text-white">
                  {unreadCount}
                </span>
              )}
            </h2>
            <div className="flex gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="rounded-md bg-blue-600 px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium text-white hover:bg-blue-700 active:bg-blue-800 touch-manipulation"
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={onClose}
                className="rounded-md bg-gray-200 dark:bg-gray-700 px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 active:bg-gray-400 dark:active:bg-gray-500 touch-manipulation"
              >
                Close
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-gray-500 dark:text-gray-400">Loading notifications...</div>
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-gray-500 dark:text-gray-400">No notifications yet</div>
              </div>
            ) : (
              <div className="space-y-3 sm:space-y-4">
                {notifications.map((notification) => (
                  <div
                    key={notification._id}
                    className={`rounded-lg border p-3 sm:p-4 ${
                      notification.read
                        ? 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800'
                        : 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-lg sm:text-xl flex-shrink-0">{getNotificationIcon(notification.type)}</span>
                          <h3 className="font-semibold text-sm sm:text-base text-gray-900 dark:text-gray-100 break-words">
                            {notification.title}
                          </h3>
                          {!notification.read && (
                            <span className="rounded-full bg-blue-500 h-2 w-2 flex-shrink-0"></span>
                          )}
                        </div>
                        <div className="mt-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400 whitespace-pre-line break-words">
                          {notification.message}
                        </div>
                        <div className="mt-2 text-xs text-gray-500 dark:text-gray-500">
                          {formatDate(notification.timestamp)} • Court {notification.courtNo}
                        </div>
                      </div>
                      {!notification.read && (
                        <button
                          onClick={() => markAsRead([notification._id!])}
                          className="ml-2 text-xs text-blue-600 dark:text-blue-400 hover:underline active:opacity-70 touch-manipulation flex-shrink-0"
                        >
                          Mark read
                        </button>
                      )}
                    </div>
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

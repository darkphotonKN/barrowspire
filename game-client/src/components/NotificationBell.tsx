'use client';

import type { components } from "@/api/generated/schema";

type Notification = components["schemas"]["Notification"];

import { useState, useEffect, useRef, type ComponentType, type SVGProps } from 'react';
import {
  BellIcon,
  EnvelopeIcon,
  MegaphoneIcon,
  SparklesIcon,
  TrophyIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import { apiClient } from '@/utils/api';
import { useAuthStore } from '@/stores/authStore';

// Line icons, never emoji (design guideline, Iconography).
const TYPE_ICONS: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  game: SparklesIcon,
  achievement: TrophyIcon,
  system: MegaphoneIcon,
  friend: UsersIcon,
};

export default function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { isAuthenticated } = useAuthStore();

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  // Fetch notifications from API
  const fetchNotifications = async () => {
    if (!isAuthenticated) return;

    setIsLoading(true);
    try {
      const response = await apiClient.getNotifications();
      if (response.notifications) {
        setNotifications(response.notifications);
        // Calculate unread count from notifications
        const unread = response.notifications.filter((n: Notification) => !n.read).length;
        setUnreadCount(unread);
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch notifications on mount and when authenticated
  useEffect(() => {
    fetchNotifications();

    // Optional: Set up polling to refresh notifications every 30 seconds
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  const handleMarkAsRead = async (id: string) => {
    try {
      await apiClient.markNotificationAsRead(id);
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, read: true } : n))
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await apiClient.markAllNotificationsAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
    }
  };

  const iconFor = (type: Notification['notification_type']) =>
    (type && TYPE_ICONS[type]) || EnvelopeIcon;

  const getTimeAgo = (
    // seconds/nanos are optional: the gateway emits protobuf omitempty, and the
    // generated contract says so. The body already guards with != null.
    timestamp: string | { seconds?: number; nanos?: number },
  ) => {
    const now = new Date();
    // Handle protobuf Timestamp format {seconds, nanos}
    let past: Date;
    if (typeof timestamp === 'object' && timestamp?.seconds != null) {
      past = new Date(Number(timestamp.seconds) * 1000);
    } else {
      past = new Date(timestamp as string);
    }

    // Guard against invalid dates
    if (isNaN(past.getTime())) return '';

    const diffInSeconds = Math.floor((now.getTime() - past.getTime()) / 1000);

    if (diffInSeconds < 0) return 'Just now';
    if (diffInSeconds < 60) return `${diffInSeconds}s ago`;

    const days = Math.floor(diffInSeconds / 86400);
    const hours = Math.floor((diffInSeconds % 86400) / 3600);
    const minutes = Math.floor((diffInSeconds % 3600) / 60);
    const seconds = diffInSeconds % 60;

    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 && days === 0) parts.push(`${seconds}s`); // skip seconds if days shown

    return parts.join(' ') + ' ago';
  };

  return (
    <div className="notification-bell" ref={dropdownRef}>
      <button
        className={`notification-bell-trigger ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <BellIcon className="bell-icon" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="notification-count">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {isOpen && (
        <div className="header-popover notification-dropdown" role="dialog" aria-label="Notifications">
          <div className="notification-dropdown-header">
            <h3>Tidings</h3>
            {unreadCount > 0 && (
              <button className="mark-read-btn" onClick={handleMarkAllAsRead}>
                Mark all read
              </button>
            )}
          </div>

          <div className="notification-list">
            {notifications.length === 0 ? (
              <div className="notification-empty">
                <BellIcon className="notification-empty-icon" aria-hidden="true" />
                <p className="notification-empty-title">{isLoading ? 'Listening…' : 'No tidings'}</p>
                {!isLoading && <p className="notification-empty-hint">Word from the barrow gathers here.</p>}
              </div>
            ) : (
              notifications.map((notification) => {
                const Icon = iconFor(notification.notification_type);
                return (
                  <button
                    type="button"
                    key={notification.id}
                    className={`notification-item ${notification.read ? '' : 'unread'}`}
                    onClick={() => !notification.read && notification.id && handleMarkAsRead(notification.id)}
                  >
                    <span className="notification-icon">
                      <Icon aria-hidden="true" />
                    </span>
                    <span className="notification-content">
                      <span className="notification-header">
                        <span className="notification-title">{notification.title}</span>
                        <span className="notification-time">
                          {notification.created_at ? getTimeAgo(notification.created_at) : ''}
                        </span>
                      </span>
                      <span className="notification-message">{notification.message}</span>
                    </span>
                    {!notification.read && <span className="notification-unread-dot" aria-label="Unread" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

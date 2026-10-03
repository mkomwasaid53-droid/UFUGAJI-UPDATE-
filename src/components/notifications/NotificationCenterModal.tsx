/**
 * Ufugaji Platform - Notification Center Modal (V1.7H)
 * Shared structured notification inbox for Farmers, Sellers, and Administrators.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Bell,
  X,
  CheckCheck,
  Filter,
  RefreshCw,
  ShieldAlert,
  Inbox
} from 'lucide-react';
import { AppNotification, NotificationCategory } from '../../types/notification';
import {
  fetchUserNotifications,
  subscribeToUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  calculateUnreadCount
} from '../../services/notificationService';
import { NotificationItem } from './NotificationItem';

interface NotificationCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  isAdmin?: boolean;
  onNavigate?: (url: string) => void;
}

export const NotificationCenterModal: React.FC<NotificationCenterModalProps> = ({
  isOpen,
  onClose,
  userId,
  isAdmin = false,
  onNavigate
}) => {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [filterTab, setFilterTab] = useState<'ALL' | 'UNREAD' | 'ADMIN' | 'SELLER'>('ALL');

  const loadNotifications = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const data = await fetchUserNotifications(userId, isAdmin, { limitCount: 60 });
      setNotifications(data);
    } catch (err) {
      console.warn('Hitilafu ya kupakia arifa:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !userId) return;

    setLoading(true);
    const unsubscribe = subscribeToUserNotifications(userId, isAdmin, (data) => {
      setNotifications(data);
      setLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, [isOpen, userId, isAdmin]);

  const handleMarkAsRead = async (notificationId: string) => {
    // Optimistic UI update
    setNotifications((prev) =>
      prev.map((n) =>
        n.notificationId === notificationId ? { ...n, read: true, readAt: new Date().toISOString() } : n
      )
    );
    await markNotificationAsRead(userId, notificationId, isAdmin);
  };

  const handleMarkAllRead = async () => {
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, read: true, readAt: n.readAt || new Date().toISOString() }))
    );
    await markAllNotificationsAsRead(userId, isAdmin);
  };

  const handleItemNavigation = (url: string) => {
    onClose();
    if (onNavigate) {
      onNavigate(url);
    } else {
      window.location.href = url;
    }
  };

  const unreadCount = useMemo(() => calculateUnreadCount(notifications), [notifications]);

  const isSellerNotification = (n: AppNotification) =>
    n.category === 'SELLER' ||
    n.type.startsWith('SELLER_') ||
    n.targetType === 'SELLER' ||
    n.type.startsWith('LISTING_') ||
    n.targetType === 'LISTING';

  const sellerCount = useMemo(
    () => notifications.filter(isSellerNotification).length,
    [notifications]
  );

  const adminCount = useMemo(
    () =>
      notifications.filter(
        (n) => n.category === 'ADMIN' || n.category === 'GOVERNANCE' || n.recipientUserId === 'ADMIN_GROUP'
      ).length,
    [notifications]
  );

  const filteredNotifications = useMemo(() => {
    return notifications.filter((n) => {
      if (filterTab === 'UNREAD') return !n.read;
      if (filterTab === 'ADMIN') {
        return (
          n.category === 'ADMIN' ||
          n.category === 'GOVERNANCE' ||
          n.recipientUserId === 'ADMIN_GROUP'
        );
      }
      if (filterTab === 'SELLER') return isSellerNotification(n);
      return true;
    });
  }, [notifications, filterTab]);

  if (!isOpen) return null;

  return (
    <div
      id="notification-center-backdrop"
      className="fixed inset-0 z-50 flex items-start justify-center sm:justify-end p-2 sm:p-4 bg-stone-900/40 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="notification-center-panel"
        className="w-full max-w-md bg-white border border-stone-200 rounded-2xl shadow-xl flex flex-col max-h-[90vh] overflow-hidden mt-12 sm:mt-14 mr-0 sm:mr-4"
      >
        {/* Header */}
        <div className="p-4 border-b border-stone-100 flex items-center justify-between bg-stone-50/70">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-100/70 text-emerald-800">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-stone-900">Kituo cha Arifa</h3>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 text-[11px] font-bold bg-emerald-700 text-white rounded-full">
                    {unreadCount} mpya
                  </span>
                )}
              </div>
              <p className="text-[11px] text-stone-500">Taarifa za soko, usimamizi, na akaunti</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              id="btn-refresh-notifications"
              type="button"
              onClick={loadNotifications}
              disabled={loading}
              title="Pakia upya"
              className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-stone-200/60 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
            </button>
            <button
              id="btn-close-notification-center"
              type="button"
              onClick={onClose}
              className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-stone-200/60 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filter Tabs & Bulk Actions */}
        <div className="px-4 py-2.5 border-b border-stone-100 bg-white flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 overflow-x-auto py-0.5 no-scrollbar">
            <button
              id="tab-notif-all"
              type="button"
              onClick={() => setFilterTab('ALL')}
              className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                filterTab === 'ALL'
                  ? 'bg-stone-900 text-white'
                  : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              Zote ({notifications.length})
            </button>

            {/* Seller Tab: displayed for sellers or when seller notifications exist */}
            {(!isAdmin || sellerCount > 0) && (
              <button
                id="tab-notif-seller"
                type="button"
                onClick={() => setFilterTab('SELLER')}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                  filterTab === 'SELLER'
                    ? 'bg-stone-900 text-white'
                    : 'text-stone-600 hover:bg-stone-100'
                }`}
              >
                Muuzaji ({sellerCount})
              </button>
            )}

            {/* Admin / Governance Tab: displayed for administrators or when admin notifications exist */}
            {(isAdmin || adminCount > 0) && (
              <button
                id="tab-notif-gov"
                type="button"
                onClick={() => setFilterTab('ADMIN')}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                  filterTab === 'ADMIN'
                    ? 'bg-stone-900 text-white'
                    : 'text-stone-600 hover:bg-stone-100'
                }`}
              >
                Utawala ({adminCount})
              </button>
            )}

            <button
              id="tab-notif-unread"
              type="button"
              onClick={() => setFilterTab('UNREAD')}
              className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                filterTab === 'UNREAD'
                  ? 'bg-stone-900 text-white'
                  : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              Zisizosomwa ({unreadCount})
            </button>
          </div>

          {unreadCount > 0 && (
            <button
              id="btn-mark-all-read"
              type="button"
              onClick={handleMarkAllRead}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 hover:text-emerald-900 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              title="Soma zote"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>Soma zote</span>
            </button>
          )}
        </div>

        {/* List of notifications */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {filteredNotifications.length === 0 ? (
            <div className="py-12 px-4 text-center space-y-2">
              <Inbox className="w-8 h-8 text-stone-300 mx-auto stroke-1" />
              <p className="text-xs font-medium text-stone-600">Huna arifa katika sehemu hii</p>
              <p className="text-[11px] text-stone-400">
                Arifa za maamuzi ya soko, maonyo, na taarifa za mfumo zitaonekana hapa.
              </p>
            </div>
          ) : (
            filteredNotifications.map((notification) => (
              <NotificationItem
                key={notification.notificationId}
                notification={notification}
                onMarkAsRead={handleMarkAsRead}
                onNavigate={handleItemNavigation}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
};

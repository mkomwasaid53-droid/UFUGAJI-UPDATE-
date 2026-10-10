/**
 * Ufugaji Platform - Notification Center Modal (V9.5)
 * Shared structured notification inbox for Farmers, Sellers, and Administrators.
 * Supports single deletion, bulk deletion, delete-all, module-specific filtering,
 * unread badges, and responsive UI.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Bell,
  X,
  CheckCheck,
  RefreshCw,
  Inbox,
  Trash2,
  CheckSquare,
  Square,
  AlertTriangle,
  ShoppingBag,
  Users,
  Shield,
  Layers
} from 'lucide-react';
import {
  AppNotification,
  NotificationCategory,
  getNotificationModule
} from '../../types/notification';
import {
  fetchUserNotifications,
  subscribeToUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  deleteSelectedNotifications,
  deleteAllNotifications,
  calculateUnreadCount,
  calculateModuleUnreadCounts
} from '../../services/notificationService';
import { NotificationItem } from './NotificationItem';

interface NotificationCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  isAdmin?: boolean;
  onNavigate?: (url: string) => void;
}

type FilterTab = 'ALL' | 'MARKETPLACE' | 'GUMZO' | 'UNREAD' | 'ADMIN' | 'SELLER';

export const NotificationCenterModal: React.FC<NotificationCenterModalProps> = ({
  isOpen,
  onClose,
  userId,
  isAdmin = false,
  onNavigate
}) => {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [filterTab, setFilterTab] = useState<FilterTab>('ALL');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Bulk selection state
  const [isSelectionMode, setIsSelectionMode] = useState<boolean>(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Confirmation dialog modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);

  const loadNotifications = async () => {
    if (!userId) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await fetchUserNotifications(userId, isAdmin, { limitCount: 100 });
      setNotifications(data);
    } catch (err: any) {
      console.warn('Hitilafu ya kupakia arifa:', err);
      setErrorMessage('Imeshindwa kupakia arifa. Tafadhali jaribu tena.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !userId) {
      setIsSelectionMode(false);
      setSelectedIds([]);
      setConfirmModal(null);
      setErrorMessage(null);
      return;
    }

    setLoading(true);
    const unsubscribe = subscribeToUserNotifications(userId, isAdmin, (data) => {
      setNotifications(data);
      setLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, [isOpen, userId, isAdmin]);

  // Mark single as read
  const handleMarkAsRead = async (notificationId: string) => {
    setNotifications((prev) =>
      prev.map((n) =>
        n.notificationId === notificationId ? { ...n, read: true, readAt: new Date().toISOString() } : n
      )
    );
    try {
      await markNotificationAsRead(userId, notificationId, isAdmin);
    } catch (err) {
      console.warn('Hitilafu ya kuweka arifa kama imesomwa:', err);
    }
  };

  // Mark all as read
  const handleMarkAllRead = async () => {
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, read: true, readAt: n.readAt || new Date().toISOString() }))
    );
    try {
      await markAllNotificationsAsRead(userId, isAdmin);
    } catch (err) {
      console.warn('Hitilafu ya kusoma arifa zote:', err);
    }
  };

  // Delete single notification
  const handleDeleteOne = async (notificationId: string) => {
    // Optimistic UI update
    const previous = [...notifications];
    setNotifications((prev) => prev.filter((n) => n.notificationId !== notificationId));
    setSelectedIds((prev) => prev.filter((id) => id !== notificationId));

    try {
      await deleteNotification(userId, notificationId, isAdmin);
    } catch (err: any) {
      console.error('Hitilafu ya kufuta arifa:', err);
      setNotifications(previous);
      setErrorMessage(err.message || 'Imeshindwa kufuta arifa. Tafadhali jaribu tena.');
    }
  };

  // Toggle selection for a notification
  const handleToggleSelect = (notificationId: string) => {
    setSelectedIds((prev) =>
      prev.includes(notificationId) ? prev.filter((id) => id !== notificationId) : [...prev, notificationId]
    );
  };

  // Toggle selection mode
  const handleToggleSelectionMode = () => {
    setIsSelectionMode((prev) => {
      if (prev) setSelectedIds([]);
      return !prev;
    });
  };

  // Delete selected notifications with confirmation
  const handleConfirmDeleteSelected = () => {
    if (selectedIds.length === 0) return;

    setConfirmModal({
      isOpen: true,
      title: 'Futa Arifa Zilizochaguliwa',
      message: `Una uhakika unataka kufuta arifa ${selectedIds.length} zilizochaguliwa? Hatua hii haitafuta rekodi za msingi za soko au vikundi.`,
      confirmLabel: `Futa (${selectedIds.length})`,
      onConfirm: async () => {
        setConfirmModal(null);
        const toDelete = [...selectedIds];
        const previous = [...notifications];

        // Optimistic UI update
        setNotifications((prev) => prev.filter((n) => !toDelete.includes(n.notificationId)));
        setSelectedIds([]);
        setIsSelectionMode(false);

        try {
          await deleteSelectedNotifications(userId, toDelete, isAdmin);
        } catch (err: any) {
          console.error('Hitilafu ya kufuta arifa zilizochaguliwa:', err);
          setNotifications(previous);
          setErrorMessage('Hitilafu wakati wa kufuta arifa zilizochaguliwa.');
        }
      }
    });
  };

  // Delete all notifications for authenticated user with confirmation
  const handleConfirmDeleteAll = () => {
    if (notifications.length === 0) return;

    setConfirmModal({
      isOpen: true,
      title: 'Futa Arifa Zote',
      message: `Una uhakika unataka kufuta arifa zote (${notifications.length}) za akaunti yako? Rekodi za msingi (matangazo, maoni, n.k.) zitabaki salama.`,
      confirmLabel: 'Futa Zote',
      onConfirm: async () => {
        setConfirmModal(null);
        const previous = [...notifications];

        // Optimistic UI update
        setNotifications([]);
        setSelectedIds([]);
        setIsSelectionMode(false);

        try {
          await deleteAllNotifications(userId, isAdmin);
        } catch (err: any) {
          console.error('Hitilafu ya kufuta arifa zote:', err);
          setNotifications(previous);
          setErrorMessage('Hitilafu wakati wa kufuta arifa zote.');
        }
      }
    });
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
  const moduleCounts = useMemo(() => calculateModuleUnreadCounts(notifications), [notifications]);

  const marketplaceCount = useMemo(
    () => notifications.filter((n) => getNotificationModule(n) === 'MARKETPLACE').length,
    [notifications]
  );

  const gumzoCount = useMemo(
    () => notifications.filter((n) => getNotificationModule(n) === 'GUMZO').length,
    [notifications]
  );

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
      if (filterTab === 'MARKETPLACE') return getNotificationModule(n) === 'MARKETPLACE';
      if (filterTab === 'GUMZO') return getNotificationModule(n) === 'GUMZO';
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

  // Select all currently filtered notifications
  const handleSelectAllFiltered = () => {
    const filteredIds = filteredNotifications.map((n) => n.notificationId);
    const allSelected = filteredIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !filteredIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...filteredIds])));
    }
  };

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
        className="w-full max-w-lg bg-white border border-stone-200 rounded-2xl shadow-xl flex flex-col max-h-[90vh] overflow-hidden mt-12 sm:mt-14 mr-0 sm:mr-4"
      >
        {/* Header */}
        <div className="p-4 border-b border-stone-100 flex items-center justify-between bg-stone-50/70">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-100/70 text-emerald-800">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-stone-900">Kituo cha Arifa</h3>
                {unreadCount > 0 && (
                  <span
                    id="modal-total-unread-badge"
                    className="px-2 py-0.5 text-[11px] font-bold bg-emerald-700 text-white rounded-full"
                  >
                    {unreadCount} mpya
                  </span>
                )}
              </div>
              <p className="text-[11px] text-stone-500">Gulio, Gumzo, na Usimamizi wa Akaunti</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              id="btn-refresh-notifications"
              type="button"
              onClick={loadNotifications}
              disabled={loading}
              title="Pakia upya"
              aria-label="Pakia arifa upya"
              className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-stone-200/60 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
            </button>
            <button
              id="btn-close-notification-center"
              type="button"
              onClick={onClose}
              aria-label="Funga kituo cha arifa"
              className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-stone-200/60 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Error Alert Banner */}
        {errorMessage && (
          <div
            id="notification-error-banner"
            className="px-4 py-2 bg-rose-50 border-b border-rose-200 text-rose-800 text-xs flex items-center justify-between gap-2"
          >
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-rose-500 hover:text-rose-800 p-0.5"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Filter Tabs */}
        <div className="px-4 py-2.5 border-b border-stone-100 bg-white flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-1 shrink-0">
            {/* All tab */}
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

            {/* Gulio (Marketplace) Tab with unread counter */}
            <button
              id="tab-notif-marketplace"
              type="button"
              onClick={() => setFilterTab('MARKETPLACE')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                filterTab === 'MARKETPLACE'
                  ? 'bg-emerald-800 text-white'
                  : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              <ShoppingBag className="w-3 h-3" />
              <span>Gulio ({marketplaceCount})</span>
              {moduleCounts.marketplace > 0 && (
                <span
                  id="tab-marketplace-unread-badge"
                  className="ml-0.5 px-1.5 py-0.2 bg-red-600 text-white text-[10px] font-bold rounded-full"
                >
                  {moduleCounts.marketplace}
                </span>
              )}
            </button>

            {/* Gumzo Tab with unread counter */}
            <button
              id="tab-notif-gumzo"
              type="button"
              onClick={() => setFilterTab('GUMZO')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                filterTab === 'GUMZO'
                  ? 'bg-blue-800 text-white'
                  : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              <Users className="w-3 h-3" />
              <span>Gumzo ({gumzoCount})</span>
              {moduleCounts.gumzo > 0 && (
                <span
                  id="tab-gumzo-unread-badge"
                  className="ml-0.5 px-1.5 py-0.2 bg-red-600 text-white text-[10px] font-bold rounded-full"
                >
                  {moduleCounts.gumzo}
                </span>
              )}
            </button>

            {/* Unread Tab */}
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

            {/* Admin Tab if applicable */}
            {(isAdmin || adminCount > 0) && (
              <button
                id="tab-notif-gov"
                type="button"
                onClick={() => setFilterTab('ADMIN')}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                  filterTab === 'ADMIN'
                    ? 'bg-purple-900 text-white'
                    : 'text-stone-600 hover:bg-stone-100'
                }`}
              >
                Utawala ({adminCount})
              </button>
            )}
          </div>
        </div>

        {/* Action Toolbar (Mark all read, selection mode, bulk delete, delete all) */}
        <div className="px-4 py-2 border-b border-stone-100 bg-stone-50/50 flex items-center justify-between gap-2 flex-wrap text-xs">
          <div className="flex items-center gap-2">
            {/* Toggle selection mode */}
            {notifications.length > 0 && (
              <button
                id="btn-toggle-selection-mode"
                type="button"
                onClick={handleToggleSelectionMode}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                  isSelectionMode
                    ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                    : 'text-stone-600 hover:bg-stone-200/70'
                }`}
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>{isSelectionMode ? 'Ghairi Uchaguzi' : 'Chagua'}</span>
              </button>
            )}

            {/* Select all in filtered view */}
            {isSelectionMode && filteredNotifications.length > 0 && (
              <button
                id="btn-select-all-filtered"
                type="button"
                onClick={handleSelectAllFiltered}
                className="text-stone-600 hover:text-stone-900 underline text-[11px] cursor-pointer"
              >
                Chagua zote za hapa
              </button>
            )}

            {isSelectionMode && selectedIds.length > 0 && (
              <span id="selected-notifications-count" className="text-emerald-800 font-semibold text-[11px]">
                {selectedIds.length} zimechaguliwa
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {/* Delete Selected Button */}
            {isSelectionMode && selectedIds.length > 0 && (
              <button
                id="btn-delete-selected-notifications"
                type="button"
                onClick={handleConfirmDeleteSelected}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                <span>Futa Zilizochaguliwa ({selectedIds.length})</span>
              </button>
            )}

            {/* Mark all read */}
            {!isSelectionMode && unreadCount > 0 && (
              <button
                id="btn-mark-all-read"
                type="button"
                onClick={handleMarkAllRead}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 hover:text-emerald-900 transition-colors cursor-pointer whitespace-nowrap"
                title="Soma zote"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Soma zote</span>
              </button>
            )}

            {/* Delete All Notifications Button */}
            {!isSelectionMode && notifications.length > 0 && (
              <button
                id="btn-delete-all-notifications"
                type="button"
                onClick={handleConfirmDeleteAll}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-stone-400 hover:text-rose-600 transition-colors cursor-pointer whitespace-nowrap"
                title="Futa arifa zote"
                aria-label="Futa arifa zote za akaunti yako"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Futa zote</span>
              </button>
            )}
          </div>
        </div>

        {/* List of notifications */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {filteredNotifications.length === 0 ? (
            <div id="notifications-empty-state" className="py-12 px-4 text-center space-y-2">
              <Inbox className="w-8 h-8 text-stone-300 mx-auto stroke-1" />
              <p className="text-xs font-semibold text-stone-600">
                {filterTab === 'UNREAD'
                  ? 'Huna arifa ambazo hazijasomwa'
                  : filterTab === 'MARKETPLACE'
                  ? 'Huna arifa za Gulio kwa sasa'
                  : filterTab === 'GUMZO'
                  ? 'Huna arifa za vikundi vya Gumzo kwa sasa'
                  : 'Huna arifa katika sehemu hii'}
              </p>
              <p className="text-[11px] text-stone-400 max-w-xs mx-auto">
                Arifa za maamuzi ya soko, miamala, maoni ya Gumzo, na taarifa za mfumo zitaonekana hapa.
              </p>
            </div>
          ) : (
            filteredNotifications.map((notification) => (
              <NotificationItem
                key={notification.notificationId}
                notification={notification}
                onMarkAsRead={handleMarkAsRead}
                onNavigate={handleItemNavigation}
                onDelete={handleDeleteOne}
                isSelectionMode={isSelectionMode}
                isSelected={selectedIds.includes(notification.notificationId)}
                onToggleSelect={handleToggleSelect}
              />
            ))
          )}
        </div>
      </div>

      {/* Confirmation Dialog Modal */}
      {confirmModal && confirmModal.isOpen && (
        <div
          id="delete-confirmation-backdrop"
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-stone-950/60 backdrop-blur-xs animate-in fade-in"
          onClick={() => setConfirmModal(null)}
        >
          <div
            id="delete-confirmation-card"
            className="w-full max-w-sm bg-white rounded-2xl p-5 shadow-2xl border border-stone-200 space-y-4 animate-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-rose-100 text-rose-700 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-stone-900">{confirmModal.title}</h4>
                <p className="text-xs text-stone-600 mt-1 leading-relaxed">{confirmModal.message}</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
              <button
                id="btn-cancel-delete"
                type="button"
                onClick={() => setConfirmModal(null)}
                className="px-3.5 py-1.5 text-xs font-semibold text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors cursor-pointer"
              >
                Ghairi
              </button>
              <button
                id="btn-confirm-delete"
                type="button"
                onClick={confirmModal.onConfirm}
                className="px-4 py-1.5 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                {confirmModal.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

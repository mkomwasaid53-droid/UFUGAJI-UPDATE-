/**
 * Ufugaji Platform - Notification Item Component (V9.5)
 * Displays structured notifications with module indicators, read/unread status,
 * target navigation, single delete action, and bulk selection support.
 */

import React from 'react';
import {
  Bell,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Info,
  ExternalLink,
  Check,
  FileText,
  Clock,
  Ban,
  ShieldCheck,
  AlertCircle,
  MessageSquare,
  Users,
  ShoppingBag,
  Trash2
} from 'lucide-react';
import { AppNotification, getNotificationModule } from '../../types/notification';

interface NotificationItemProps {
  notification: AppNotification;
  onMarkAsRead: (notificationId: string) => void;
  onNavigate?: (actionUrl: string) => void;
  onDelete?: (notificationId: string) => void;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (notificationId: string) => void;
}

export const NotificationItem: React.FC<NotificationItemProps> = ({
  notification,
  onMarkAsRead,
  onNavigate,
  onDelete,
  isSelectionMode = false,
  isSelected = false,
  onToggleSelect
}) => {
  const moduleName = getNotificationModule(notification);

  const getIcon = () => {
    switch (notification.type) {
      case 'GUMZO_COMMENT_RECEIVED':
      case 'GUMZO_POST_CREATED':
      case 'GUMZO_MEMBERSHIP_APPROVED':
      case 'GUMZO_MEMBERSHIP_REQUEST':
      case 'GUMZO_GROUP_STATUS_UPDATED':
      case 'GUMZO_FOUNDER_TRANSFERRED':
        return <Users className="w-4 h-4 text-blue-600 shrink-0" />;
      case 'SELLER_RESTRICTION_APPLIED':
      case 'LISTING_SUSPENDED':
      case 'SELLER_MONETIZATION_SUSPENDED':
        return <Ban className="w-4 h-4 text-red-600 shrink-0" />;
      case 'SELLER_WARNING_ISSUED':
      case 'LISTING_REJECTED':
      case 'APPEAL_DECISION_MADE':
      case 'SELLER_GRACE_STARTED':
      case 'SELLER_PAYMENT_REQUIRED':
      case 'SELLER_SUBSCRIPTION_EXPIRED':
      case 'SELLER_RENEWAL_FAILED':
        return <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />;
      case 'ADMIN_REVIEW_REQUIRED':
      case 'REPORT_RECEIVED':
      case 'APPEAL_SUBMITTED':
      case 'CORRECTION_REQUESTED':
      case 'SELLER_TRIAL_ENDING':
        return <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />;
      case 'LISTING_RESTORED':
      case 'SELLER_RESTRICTION_REVOKED':
      case 'SELLER_TRIAL_STARTED':
      case 'SELLER_RENEWAL_SUCCESS':
      case 'SELLER_MONETIZATION_REACTIVATED':
      case 'VERIFICATION_PAYMENT_CONFIRMED':
      case 'VERIFICATION_APPROVED':
      case 'VERIFICATION_BADGE_ACTIVATED':
        return <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />;
      case 'VERIFICATION_PAYMENT_FAILED':
      case 'VERIFICATION_REJECTED':
      case 'VERIFICATION_SUSPENDED':
      case 'VERIFICATION_BADGE_DEACTIVATED':
        return <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />;
      case 'VERIFICATION_APPLICATION_SUBMITTED':
      case 'VERIFICATION_UNDER_REVIEW':
      case 'VERIFICATION_CORRECTION_REQUESTED':
      case 'VERIFICATION_REVERIFICATION_REQUIRED':
        return <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />;
      case 'MARKETPLACE_MESSAGE_RECEIVED':
      case 'MARKETPLACE_PAYMENT_REQUEST_CREATED':
        return <MessageSquare className="w-4 h-4 text-emerald-600 shrink-0" />;
      case 'MARKETPLACE_PAYMENT_SUCCESS':
        return <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />;
      case 'MARKETPLACE_PAYMENT_FAILED':
        return <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />;
      case 'MARKETPLACE_PAYMENT_PROCESSING':
        return <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />;
      case 'MARKETPLACE_PAYMENT_CANCELLED':
        return <Ban className="w-4 h-4 text-stone-500 shrink-0" />;
      case 'MARKETPLACE_PAYMENT_EXPIRED':
        return <Clock className="w-4 h-4 text-stone-400 shrink-0" />;
      default:
        return moduleName === 'MARKETPLACE' ? (
          <ShoppingBag className="w-4 h-4 text-emerald-600 shrink-0" />
        ) : (
          <Info className="w-4 h-4 text-stone-500 shrink-0" />
        );
    }
  };

  const getModuleBadge = () => {
    switch (moduleName) {
      case 'GUMZO':
        return (
          <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 rounded">
            Gumzo
          </span>
        );
      case 'MARKETPLACE':
        return (
          <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded">
            Gulio
          </span>
        );
      case 'ADMIN':
        return (
          <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200 rounded">
            Utawala
          </span>
        );
      case 'DAKTARI':
        return (
          <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-teal-50 text-teal-700 border border-teal-200 rounded">
            Daktari
          </span>
        );
      case 'MY_ASSISTANT':
        return (
          <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded">
            Msaidizi
          </span>
        );
      case 'SYSTEM':
      default:
        return (
          <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-stone-100 text-stone-600 border border-stone-200 rounded">
            Mfumo
          </span>
        );
    }
  };

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const diffMinutes = Math.floor((Date.now() - date.getTime()) / 60000);
      if (diffMinutes < 1) return 'Sasa hivi';
      if (diffMinutes < 60) return `Dakika ${diffMinutes} zilizopita`;
      const diffHours = Math.floor(diffMinutes / 60);
      if (diffHours < 24) return `Saa ${diffHours} zilizopita`;
      return date.toLocaleDateString('sw-TZ', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div
      id={`notification-item-${notification.notificationId}`}
      className={`p-3.5 rounded-xl border transition-all ${
        notification.read
          ? 'bg-white border-stone-200/80 text-stone-700'
          : 'bg-emerald-50/50 border-emerald-300/80 text-stone-900 shadow-xs'
      } ${isSelected ? 'ring-2 ring-emerald-500 bg-emerald-50/80' : ''}`}
    >
      <div className="flex items-start gap-3">
        {/* Bulk Selection Checkbox */}
        {isSelectionMode && (
          <div className="pt-1">
            <input
              type="checkbox"
              id={`select-notif-${notification.notificationId}`}
              checked={isSelected}
              onChange={() => onToggleSelect && onToggleSelect(notification.notificationId)}
              aria-label={`Chagua arifa: ${notification.title}`}
              className="w-4 h-4 rounded text-emerald-700 focus:ring-emerald-500 border-stone-300 cursor-pointer"
            />
          </div>
        )}

        <div className="mt-0.5 p-2 rounded-lg bg-stone-100 border border-stone-200/60 shrink-0">
          {getIcon()}
        </div>

        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              {getModuleBadge()}
              {!notification.read && (
                <span
                  id={`unread-dot-${notification.notificationId}`}
                  className="inline-block w-2 h-2 rounded-full bg-emerald-600 shrink-0"
                  title="Haijasomwa"
                />
              )}
              {notification.priority === 'URGENT' && (
                <span className="px-1.5 py-0.5 text-[10px] font-bold bg-red-100 text-red-800 border border-red-200 rounded">
                  Muhimu Sana
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 text-[11px] text-stone-400">
                <Clock className="w-3 h-3" />
                <span>{formatTime(notification.createdAt)}</span>
              </div>

              {/* Single item delete action */}
              {onDelete && (
                <button
                  id={`btn-delete-${notification.notificationId}`}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(notification.notificationId);
                  }}
                  className="p-1 rounded text-stone-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                  title="Futa arifa hii"
                  aria-label={`Futa arifa: ${notification.title}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <h4 className="text-xs font-bold text-stone-900 leading-snug">
            {notification.title}
          </h4>

          <p className="text-xs text-stone-600 leading-relaxed break-words whitespace-pre-line">
            {notification.message}
          </p>

          <div className="pt-1.5 flex items-center justify-between gap-2 flex-wrap border-t border-stone-100">
            {notification.actionUrl ? (
              <button
                id={`btn-action-${notification.notificationId}`}
                type="button"
                onClick={() => {
                  if (!notification.read) {
                    onMarkAsRead(notification.notificationId);
                  }
                  if (onNavigate) {
                    onNavigate(notification.actionUrl!);
                  }
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-800 bg-emerald-100/80 hover:bg-emerald-200/80 rounded-md transition-colors cursor-pointer"
              >
                <span>Fungua / Hatua</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            ) : (
              <div />
            )}

            {!notification.read && (
              <button
                id={`btn-mark-read-${notification.notificationId}`}
                type="button"
                onClick={() => onMarkAsRead(notification.notificationId)}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-stone-500 hover:text-stone-800 transition-colors cursor-pointer ml-auto"
                title="Weka kama imesomwa"
              >
                <Check className="w-3 h-3" />
                <span>Weka kama imesomwa</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

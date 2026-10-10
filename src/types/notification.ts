/**
 * Ufugaji Platform Notification Foundation (V1.7H)
 * Shared structured notification models for Governance, Marketplace, Seller, and System events.
 */

export type NotificationCategory =
  | 'ADMIN'
  | 'SELLER'
  | 'USER'
  | 'MARKETPLACE'
  | 'GOVERNANCE'
  | 'MODERATION'
  | 'SYSTEM'
  | 'DAKTARI'
  | 'MY_ASSISTANT'
  | 'GUMZO';

export type NotificationType =
  | 'ADMIN_REVIEW_REQUIRED'
  | 'REPORT_RECEIVED'
  | 'LISTING_UNDER_REVIEW'
  | 'LISTING_REJECTED'
  | 'LISTING_HIDDEN'
  | 'LISTING_SUSPENDED'
  | 'LISTING_RESTORED'
  | 'CORRECTION_REQUESTED'
  | 'SELLER_WARNING_ISSUED'
  | 'SELLER_RESTRICTION_APPLIED'
  | 'SELLER_RESTRICTION_REVOKED'
  | 'APPEAL_SUBMITTED'
  | 'APPEAL_DECISION_MADE'
  | 'CATEGORY_OR_LISTING_VALIDATION_ISSUE'
  | 'SELLER_TRIAL_STARTED'
  | 'SELLER_TRIAL_ENDING'
  | 'SELLER_GRACE_STARTED'
  | 'SELLER_PAYMENT_REQUIRED'
  | 'SELLER_SUBSCRIPTION_EXPIRED'
  | 'SELLER_RENEWAL_SUCCESS'
  | 'SELLER_RENEWAL_FAILED'
  | 'SELLER_MONETIZATION_SUSPENDED'
  | 'SELLER_MONETIZATION_REACTIVATED'
  | 'VERIFICATION_APPLICATION_SUBMITTED'
  | 'VERIFICATION_PAYMENT_CONFIRMED'
  | 'VERIFICATION_PAYMENT_FAILED'
  | 'VERIFICATION_UNDER_REVIEW'
  | 'VERIFICATION_CORRECTION_REQUESTED'
  | 'VERIFICATION_APPROVED'
  | 'VERIFICATION_REJECTED'
  | 'VERIFICATION_BADGE_ACTIVATED'
  | 'VERIFICATION_BADGE_DEACTIVATED'
  | 'VERIFICATION_REVERIFICATION_REQUIRED'
  | 'VERIFICATION_SUSPENDED'
  | 'MARKETPLACE_MESSAGE_RECEIVED'
  | 'MARKETPLACE_PAYMENT_REQUEST_CREATED'
  | 'MARKETPLACE_PAYMENT_PROCESSING'
  | 'MARKETPLACE_PAYMENT_SUCCESS'
  | 'MARKETPLACE_PAYMENT_FAILED'
  | 'MARKETPLACE_PAYMENT_CANCELLED'
  | 'MARKETPLACE_PAYMENT_EXPIRED'
  | 'GUMZO_COMMENT_RECEIVED'
  | 'GUMZO_POST_CREATED'
  | 'GUMZO_MEMBERSHIP_APPROVED'
  | 'GUMZO_MEMBERSHIP_REQUEST'
  | 'GUMZO_GROUP_STATUS_UPDATED'
  | 'GUMZO_FOUNDER_TRANSFERRED';

export type NotificationPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export type NotificationTargetType =
  | 'LISTING'
  | 'PRODUCT'
  | 'SHOP'
  | 'SELLER'
  | 'REPORT'
  | 'APPEAL'
  | 'MODERATION'
  | 'WARNING'
  | 'RESTRICTION'
  | 'CATEGORY'
  | 'CONVERSATION'
  | 'PAYMENT_REQUEST'
  | 'GROUP'
  | 'POST'
  | 'COMMENT'
  | 'SYSTEM';

/**
 * Canonical module classification for module-specific unread badges & filtering (V9.5)
 */
export type NotificationModule =
  | 'MARKETPLACE'
  | 'GUMZO'
  | 'ADMIN'
  | 'SYSTEM'
  | 'DAKTARI'
  | 'MY_ASSISTANT';

export interface AppNotification {
  notificationId: string;
  recipientUserId: string; // Specific user UID, or 'ADMIN_GROUP' for platform administrator broadcast
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  message: string;
  read: boolean;
  readAt: string | null;
  priority: NotificationPriority;

  module?: NotificationModule;
  deleted?: boolean;
  deletedAt?: string | null;

  targetType?: NotificationTargetType;
  targetId?: string;

  relatedProductId?: string;
  relatedListingId?: string;
  relatedShopId?: string;
  relatedSellerId?: string;

  relatedGroupId?: string;
  relatedPostId?: string;
  relatedCommentId?: string;

  relatedReportId?: string;
  relatedModerationId?: string;
  relatedWarningId?: string;
  relatedRestrictionId?: string;
  relatedAppealId?: string;

  actionUrl?: string;
  senderUserId?: string;
  createdAt: string;
  expiresAt?: string;
  deduplicationKey?: string;
  metadata?: Record<string, any>;
}

export interface CreateNotificationInput {
  recipientUserId: string;
  senderUserId?: string;
  type: NotificationType;
  category: NotificationCategory;
  module?: NotificationModule;
  title: string;
  message: string;
  priority?: NotificationPriority;
  notificationId?: string;
  deduplicationKey?: string;

  targetType?: NotificationTargetType;
  targetId?: string;

  relatedProductId?: string;
  relatedListingId?: string;
  relatedShopId?: string;
  relatedSellerId?: string;

  relatedGroupId?: string;
  relatedPostId?: string;
  relatedCommentId?: string;

  relatedReportId?: string;
  relatedModerationId?: string;
  relatedWarningId?: string;
  relatedRestrictionId?: string;
  relatedAppealId?: string;

  actionUrl?: string;
  expiresAt?: string;
  metadata?: Record<string, any>;
}

/**
 * Module-specific unread count summary (V9.5)
 */
export interface ModuleUnreadCounts {
  marketplace: number;
  gumzo: number;
  total: number;
  byModule: Record<NotificationModule, number>;
}

export interface DeleteNotificationResult {
  success: boolean;
  deletedNotificationId?: string;
  error?: string;
}

export interface BulkDeleteNotificationResult {
  success: boolean;
  successCount: number;
  failedCount: number;
  deletedIds: string[];
}

/**
 * Canonical mapper to resolve the module of a notification reliably.
 * Maps both explicit 'module' field and category/type heuristics for 100% backwards compatibility.
 */
export function getNotificationModule(notification: {
  module?: NotificationModule | string;
  category?: NotificationCategory;
  type?: string;
  targetType?: string;
  metadata?: Record<string, any>;
}): NotificationModule {
  if (notification.module) {
    const raw = String(notification.module).toUpperCase();
    if (raw === 'MARKETPLACE' || raw === 'GULIO') return 'MARKETPLACE';
    if (raw === 'GUMZO' || raw === 'COMMUNITY') return 'GUMZO';
    if (raw === 'ADMIN' || raw === 'GOVERNANCE') return 'ADMIN';
    if (raw === 'DAKTARI') return 'DAKTARI';
    if (raw === 'MY_ASSISTANT') return 'MY_ASSISTANT';
    if (raw === 'SYSTEM') return 'SYSTEM';
  }

  // Gumzo module heuristics
  if (
    notification.category === 'GUMZO' ||
    notification.type?.startsWith('GUMZO_') ||
    notification.targetType === 'GROUP' ||
    notification.targetType === 'POST' ||
    notification.targetType === 'COMMENT' ||
    Boolean(notification.metadata?.groupId) ||
    Boolean(notification.metadata?.postId)
  ) {
    return 'GUMZO';
  }

  // Marketplace / Gulio module heuristics
  if (
    notification.category === 'MARKETPLACE' ||
    notification.category === 'SELLER' ||
    notification.type?.startsWith('MARKETPLACE_') ||
    notification.type?.startsWith('LISTING_') ||
    notification.type?.startsWith('SELLER_') ||
    notification.type?.startsWith('VERIFICATION_') ||
    notification.targetType === 'LISTING' ||
    notification.targetType === 'PRODUCT' ||
    notification.targetType === 'SHOP' ||
    notification.targetType === 'SELLER' ||
    notification.targetType === 'CONVERSATION' ||
    notification.targetType === 'PAYMENT_REQUEST'
  ) {
    return 'MARKETPLACE';
  }

  // Admin / Governance heuristics
  if (
    notification.category === 'ADMIN' ||
    notification.category === 'GOVERNANCE' ||
    notification.category === 'MODERATION' ||
    notification.type?.startsWith('ADMIN_') ||
    notification.type?.startsWith('REPORT_') ||
    notification.type?.startsWith('APPEAL_')
  ) {
    return 'ADMIN';
  }

  if (notification.category === 'DAKTARI') return 'DAKTARI';
  if (notification.category === 'MY_ASSISTANT') return 'MY_ASSISTANT';

  return 'SYSTEM';
}

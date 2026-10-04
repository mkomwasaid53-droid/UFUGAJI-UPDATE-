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
  | 'MY_ASSISTANT';

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
  | 'VERIFICATION_SUSPENDED';

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
  | 'SYSTEM';

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

  targetType?: NotificationTargetType;
  targetId?: string;

  relatedProductId?: string;
  relatedListingId?: string;
  relatedShopId?: string;
  relatedSellerId?: string;

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

  relatedReportId?: string;
  relatedModerationId?: string;
  relatedWarningId?: string;
  relatedRestrictionId?: string;
  relatedAppealId?: string;

  actionUrl?: string;
  expiresAt?: string;
  metadata?: Record<string, any>;
}

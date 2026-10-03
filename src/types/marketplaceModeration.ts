/**
 * V1.7D — Admin Moderation Data Models & Interfaces
 * Phase 6: Marketplace Governance
 *
 * Core Principles:
 * 1. Admin Moderation is a GOVERNANCE layer, NOT a replacement for:
 *    - Seller Verification (V1.6A)
 *    - Shop Trust & Profile Integrity (V1.6B)
 *    - Product Trust & Ownership (V1.6C)
 *    - Price & Stock Trust (V1.6D)
 *    - Location & Delivery Trust (V1.6E)
 *    - Reviews & Reporting (V1.6F)
 *    - Trust Signals (V1.6G)
 *    - Category Governance (V1.7A)
 *    - Listing Validation (V1.7B)
 *    - AI Assisted Classification (V1.7C)
 *    - Daktari Verification
 * 2. Moderation Workflow:
 *    REVIEW -> INVESTIGATE -> DECIDE -> TAKE AUTHORIZED MODERATION ACTION -> RECORD AUDIT TRAIL
 * 3. An admin action (e.g. LISTING_APPROVED) must NEVER:
 *    - Automatically change sellerVerificationStatus = VERIFIED
 *    - Automatically declare product authenticity or medical approval
 *    - Silently rewrite sellerId, shopId, price, stock, or location
 *    - Bypass mandatory V1.7B Listing Validation or V1.7A Category Governance
 * 4. Audit trail is append-only and immutable.
 */

import { MarketplaceProduct, ProductStatus } from './marketplace';
import { ListingValidationResult } from './marketplaceListingValidation';
import { MarketplaceReport, MarketplaceReview } from './marketplaceReview';
import { AiClassificationResult } from './marketplaceAiClassification';
import { ProductOwnershipValidation } from './marketplace';
import { ProductPriceStockTrust } from './marketplace';
import { ProductLocationDeliveryTrust } from './marketplace';

/**
 * Controlled Moderation Statuses
 */
export type ModerationStatus =
  | 'NOT_REVIEWED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'HIDDEN'
  | 'SUSPENDED'
  | 'RESTORED'
  | 'ESCALATED';

/**
 * Controlled Moderation Actions
 */
export type ModerationAction =
  | 'START_REVIEW'
  | 'APPROVE_LISTING'
  | 'REJECT_LISTING'
  | 'HIDE_LISTING'
  | 'SUSPEND_LISTING'
  | 'RESTORE_LISTING'
  | 'REQUEST_CORRECTION'
  | 'ESCALATE';

/**
 * Deterministic Moderation Priority
 * Derived strictly from structured signals (reports, validation status, mismatch),
 * never from an opaque AI trust score.
 */
export type ModerationPriority = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';

/**
 * Structured Rejection & Correction Reason Codes
 * Governance records, not criminal allegations.
 */
export type ModerationReasonCode =
  | 'INVALID_CATEGORY'
  | 'INVALID_LISTING_DATA'
  | 'MISLEADING_INFORMATION'
  | 'DUPLICATE_LISTING'
  | 'INAPPROPRIATE_CONTENT'
  | 'NON_LIVESTOCK_CONTENT'
  | 'UNSUPPORTED_PRODUCT'
  | 'OWNERSHIP_CONCERN'
  | 'PRICE_DATA_PROBLEM'
  | 'STOCK_DATA_PROBLEM'
  | 'LOCATION_DATA_PROBLEM'
  | 'DELIVERY_INFORMATION_PROBLEM'
  | 'MEDIA_PROBLEM'
  | 'POLICY_VIOLATION'
  | 'OTHER';

export const MODERATION_REASON_LABELS: Record<ModerationReasonCode, { sw: string; en: string }> = {
  INVALID_CATEGORY: {
    sw: 'Kundi lisilo sahihi au lisilotambuliwa sokoni',
    en: 'Invalid or unrecognized category'
  },
  INVALID_LISTING_DATA: {
    sw: 'Taarifa za tangazo hazijakamilika au si sahihi',
    en: 'Incomplete or invalid listing data'
  },
  MISLEADING_INFORMATION: {
    sw: 'Maelezo yanayopotosha wanunuzi',
    en: 'Misleading listing information'
  },
  DUPLICATE_LISTING: {
    sw: 'Tangazo limejirudia mara mbili au zaidi',
    en: 'Duplicate listing'
  },
  INAPPROPRIATE_CONTENT: {
    sw: 'Maudhui yasiyofaa kwenye jukwaa la wafugaji',
    en: 'Inappropriate platform content'
  },
  NON_LIVESTOCK_CONTENT: {
    sw: 'Bidhaa haihusiani na mifugo wala kilimo',
    en: 'Non-livestock / non-agriculture product'
  },
  UNSUPPORTED_PRODUCT: {
    sw: 'Aina ya bidhaa hairuhusiwi kuuzwa sokoni',
    en: 'Unsupported product type'
  },
  OWNERSHIP_CONCERN: {
    sw: 'Shaka kuhusu umiliki wa duka au bidhaa',
    en: 'Ownership or identity concern'
  },
  PRICE_DATA_PROBLEM: {
    sw: 'Hitilafu kwenye bei au muundo wa sarafu',
    en: 'Price data inconsistency'
  },
  STOCK_DATA_PROBLEM: {
    sw: 'Hitilafu kwenye idadi au upatikanaji wa bidhaa',
    en: 'Stock data inconsistency'
  },
  LOCATION_DATA_PROBLEM: {
    sw: 'Taarifa ya eneo au mkoa haipo wazi',
    en: 'Unclear or missing location data'
  },
  DELIVERY_INFORMATION_PROBLEM: {
    sw: 'Taarifa ya usafirishaji/uchukuaji haieleweki',
    en: 'Unclear delivery or pickup information'
  },
  MEDIA_PROBLEM: {
    sw: 'Picha haionyeshi bidhaa husika au ina utata',
    en: 'Problematic media or image quality'
  },
  POLICY_VIOLATION: {
    sw: 'Ukiukwaji wa miongozo na sera za Ufugaji Update',
    en: 'Platform policy violation'
  },
  OTHER: {
    sw: 'Sababu nyingine ya kiutawala',
    en: 'Other administrative reason'
  }
};

/**
 * Authoritative Moderation Record per Listing
 */
export interface MarketplaceModerationRecord {
  moderationId: string;
  targetType: 'LISTING' | 'PRODUCT';
  targetId: string; // Authoritative productId
  productId: string;
  listingId: string;
  sellerId: string; // Authoritative sellerId
  shopId?: string | null;
  status: ModerationStatus;
  previousStatus?: ModerationStatus;
  lastAction?: ModerationAction;
  priority: ModerationPriority;
  reasonCode?: ModerationReasonCode | null;
  reasonText?: string | null;
  internalNote?: string | null; // Treated as private governance data (NOT public)
  publicExplanation?: string | null; // Safe Swahili user-facing explanation
  correctionInstructions?: string | null; // Clear guidance for seller correction
  reviewedByUserId?: string | null;
  reviewedByDisplayName?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Append-Only, Immutable Moderation Audit Log Entry
 */
export interface MarketplaceModerationAuditEntry {
  auditId: string;
  moderationId: string;
  targetType: 'LISTING' | 'PRODUCT';
  targetId: string;
  productId: string;
  sellerId: string;
  shopId?: string | null;
  action: ModerationAction;
  previousStatus: ModerationStatus;
  newStatus: ModerationStatus;
  reasonCode?: ModerationReasonCode | null;
  reasonText?: string | null;
  internalNote?: string | null; // Internal governance note
  publicExplanation?: string | null; // User-facing safe explanation
  correctionInstructions?: string | null;
  performedByUserId: string;
  performedByDisplayName: string;
  performedAt: string; // ISO 8601
}

/**
 * Moderation Queue Filter Options
 */
export type ModerationQueueFilter =
  | 'ALL'
  | 'NOT_REVIEWED'
  | 'UNDER_REVIEW'
  | 'REPORTED'
  | 'INVALID'
  | 'NEEDS_REVIEW'
  | 'AI_CLASSIFICATION_AMBIGUOUS'
  | 'CATEGORY_MISMATCH'
  | 'SUSPENDED'
  | 'RECENTLY_UPDATED';

/**
 * Aggregated Queue Item for Admin Review
 * Synthesizes structured data from existing systems without duplicating authority
 */
export interface ModerationQueueItem {
  product: MarketplaceProduct;
  moderationRecord: MarketplaceModerationRecord;
  validationResult: ListingValidationResult;
  priority: ModerationPriority;
  priorityReasons: string[];
  reportCount: number;
  reports: MarketplaceReport[];
  publishedReviews: MarketplaceReview[];
  aiClassification?: AiClassificationResult | null;
  ownershipValidation: ProductOwnershipValidation;
  priceStockTrust: ProductPriceStockTrust;
  locationDeliveryTrust: ProductLocationDeliveryTrust;
}

/**
 * Moderation Action Input Payload
 */
export interface PerformModerationActionInput {
  targetProductId: string;
  action: ModerationAction;
  reasonCode?: ModerationReasonCode;
  reasonText?: string;
  internalNote?: string;
  publicExplanation?: string;
  correctionInstructions?: string;
}

/**
 * Action Execution Result
 */
export interface ModerationActionResult {
  success: boolean;
  moderationRecord?: MarketplaceModerationRecord;
  auditEntry?: MarketplaceModerationAuditEntry;
  updatedProduct?: MarketplaceProduct;
  error?: string;
  validationBlocked?: boolean;
}

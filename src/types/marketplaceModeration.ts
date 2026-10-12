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
 * V1.0 Content Moderation Foundation:
 * - DRAFT: Seller is still editing, not published
 * - PENDING_REVIEW: Submitted by seller, waiting for admin approval
 * - APPROVED: Approved by admin, eligible for public discovery
 * - REJECTED: Rejected by admin with structured reason, not public
 * - HIDDEN: Hidden by admin or moderation action, not public
 * - SUSPENDED: Temporarily suspended, not public
 * - Legacy compatibility: NOT_REVIEWED, UNDER_REVIEW, RESTORED, ESCALATED
 */
export type ModerationStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'NOT_REVIEWED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'HIDDEN'
  | 'SUSPENDED'
  | 'RESTORED'
  | 'ESCALATED';

/**
 * Controlled Seller Trust Statuses (V1.0 Content Moderation Foundation)
 * Strictly separated from identity verification, registration, and payments.
 * - NEW_SELLER: Listings require admin approval before becoming active
 * - TRUSTED_SELLER: Can be granted only by authorized admin action
 * - RESTRICTED_SELLER: Active restrictions imposed by governance; cannot bypass review
 */
export type SellerTrustStatus = 'NEW_SELLER' | 'TRUSTED_SELLER' | 'RESTRICTED_SELLER';

/**
 * AI Screening Statuses (V1.0 AI Screening)
 * - PASS: Content passed policy evaluation
 * - BLOCK: Violates one or more prohibited content policies
 * - REVIEW_REQUIRED: Complex, ambiguous, or sensitive context (e.g., veterinary, wound, medical slaughter)
 * - SCREENING_ERROR: Model failure, timeout, unparseable response, or unreachable image
 */
export type AIScreeningStatus = 'PASS' | 'BLOCK' | 'REVIEW_REQUIRED' | 'SCREENING_ERROR';

/**
 * Controlled AI Screening Categories
 */
export type AIScreeningCategory =
  | 'SEXUAL_OR_EXPLICIT_CONTENT'
  | 'GRAPHIC_VIOLENCE'
  | 'WEAPONS_OR_DANGEROUS_GOODS'
  | 'SCAM_OR_FRAUD'
  | 'ILLEGAL_OR_PROHIBITED_GOODS'
  | 'HATE_OR_HARASSMENT'
  | 'SPAM_OR_MISLEADING_CLAIMS'
  | 'IRRELEVANT_OR_NON_AGRICULTURAL'
  | 'ANIMAL_WELFARE_CONCERN'
  | 'POTENTIALLY_LEGITIMATE_VETERINARY_CONTENT'
  | 'UNCERTAIN';

export const AI_SCREENING_CATEGORY_LABELS: Record<AIScreeningCategory, { sw: string; en: string }> = {
  SEXUAL_OR_EXPLICIT_CONTENT: {
    sw: 'Maudhui ya ngono au yasiyo na staha',
    en: 'Sexual or explicit content'
  },
  GRAPHIC_VIOLENCE: {
    sw: 'Ukatili au picha za kutisha zisizo na muktadha',
    en: 'Graphic violence'
  },
  WEAPONS_OR_DANGEROUS_GOODS: {
    sw: 'Silaha au bidhaa hatari zilizopigwa marufuku',
    en: 'Weapons or dangerous goods'
  },
  SCAM_OR_FRAUD: {
    sw: 'Ulaghai au madai ya uongo ya kifedha',
    en: 'Scam or fraud'
  },
  ILLEGAL_OR_PROHIBITED_GOODS: {
    sw: 'Bidhaa haramu au zilizopigwa marufuku kisheria',
    en: 'Illegal or prohibited goods'
  },
  HATE_OR_HARASSMENT: {
    sw: 'Chuki, udhalilishaji au matamshi ya uchochezi',
    en: 'Hate or harassment'
  },
  SPAM_OR_MISLEADING_CLAIMS: {
    sw: 'Spam au madai ya kupotosha wanunuzi',
    en: 'Spam or misleading claims'
  },
  IRRELEVANT_OR_NON_AGRICULTURAL: {
    sw: 'Bidhaa isiyohusiana na kilimo, mifugo au uvuvi',
    en: 'Non-agricultural / irrelevant product'
  },
  ANIMAL_WELFARE_CONCERN: {
    sw: 'Hofu kuhusu ustawi au mateso ya wanyama',
    en: 'Animal welfare concern'
  },
  POTENTIALLY_LEGITIMATE_VETERINARY_CONTENT: {
    sw: 'Maudhui halali ya kitabibu/matibabu ya mifugo (yanahitaji uhakiki)',
    en: 'Potentially legitimate veterinary content'
  },
  UNCERTAIN: {
    sw: 'Maudhui yenye utata au yasiyo wazi',
    en: 'Uncertain context'
  }
};

/**
 * Immutable Record of an AI Screening Evaluation
 */
export interface AIScreeningResult {
  screeningId: string;
  requestId: string;
  status: AIScreeningStatus;
  categories: AIScreeningCategory[];
  explanation: string; // Concise, non-defamatory, auditable explanation
  explanationSwahili: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  model: string;
  policyVersion: string;
  contentFingerprint: string;
  timestamp: string; // ISO 8601
  latencyMs?: number;
  evaluatedFields: {
    hasTitle: boolean;
    hasDescription: boolean;
    hasCategory: boolean;
    hasPrice: boolean;
    imageCount: number;
  };
  cached?: boolean;
}


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
  aiScreening?: AIScreeningResult | null;
  relatedReportId?: string | null;
  manualReviewOverride?: boolean;
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
  relatedReportId?: string | null; // Related user report ID if action resolves/moderates a reported listing
  manualReviewOverride?: boolean; // Set if manually overriding an AI screening error
}

/**
 * Moderation Queue Filter Options
 */
export type ModerationQueueFilter =
  | 'ALL'
  | 'NEW_SELLER_PENDING'
  | 'AI_SCREENING_REVIEW_REQUIRED'
  | 'AI_SCREENING_ERROR'
  | 'REPORTED'
  | 'UNDER_REVIEW'
  | 'NOT_REVIEWED'
  | 'INVALID'
  | 'NEEDS_REVIEW'
  | 'AI_CLASSIFICATION_AMBIGUOUS'
  | 'CATEGORY_MISMATCH'
  | 'AI_SCREENING_BLOCKED'
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
  reportReasons?: string[];
  reportReasonsList?: { reason: string; count: number }[];
  reports: MarketplaceReport[];
  publishedReviews: MarketplaceReview[];
  aiClassification?: AiClassificationResult | null;
  aiScreening?: AIScreeningResult | null;
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
  relatedReportId?: string;
  manualReviewOverride?: boolean;
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

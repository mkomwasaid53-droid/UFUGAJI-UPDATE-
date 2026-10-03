/**
 * V1.6F — REVIEWS, REPUTATION & REPORTING TYPES
 * Marketplace Trust Phase 5
 *
 * Distinguishes:
 * 1. User-Generated Reviews (claims / subjective experiences)
 * 2. Authoritative Marketplace Facts (structured product / shop / seller data)
 * 3. Authorized Moderation Decisions (admin / moderation status)
 * 4. Seller Responses (official shop owner response)
 * 5. AI Summaries (strictly grounded on published review text, never synthesized)
 */

export type ReviewTargetType = 'PRODUCT' | 'SHOP' | 'SELLER';

export type ReviewModerationStatus =
  | 'PUBLISHED'
  | 'HIDDEN'
  | 'REMOVED'
  | 'UNDER_REVIEW';

export type ReviewStatus = 'active' | 'archived' | 'deleted';

export type ValidRatingValue = 1 | 2 | 3 | 4 | 5;

export interface MarketplaceReview {
  reviewId: string;
  authorUserId: string; // Authenticated user UID from Firebase Auth
  authorDisplayName: string; // Sanitized public display name (e.g., 'Mfugaji Said' or 'Mfugaji (Mwanza)')
  targetType: ReviewTargetType;
  targetId: string; // Authoritative ID (productId, shopId, or sellerId)
  sellerId: string; // Authoritative seller UID associated with target
  shopId?: string | null;
  productId?: string | null;
  rating: ValidRatingValue; // Strictly integer 1..5
  title: string;
  body: string;
  status: ReviewStatus;
  moderationStatus: ReviewModerationStatus;
  reportCount: number;
  helpfulCount?: number;
  sellerResponse?: string | null;
  sellerResponseCreatedAt?: string | null;
  sellerResponseSellerId?: string | null;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

export type ReportTargetType = 'REVIEW' | 'PRODUCT' | 'SHOP' | 'SELLER';

export type ReportReason =
  | 'SPAM'
  | 'FRAUD_SUSPECTED'
  | 'HARASSMENT'
  | 'ABUSIVE_CONTENT'
  | 'MISLEADING_INFORMATION'
  | 'WRONG_PRODUCT'
  | 'DUPLICATE_REVIEW'
  | 'IMPERSONATION'
  | 'PRIVACY_VIOLATION'
  | 'OTHER';

export type ReportStatus = 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED' | 'DISMISSED';

export interface MarketplaceReport {
  reportId: string;
  reporterUserId: string; // Authenticated user UID
  targetType: ReportTargetType;
  targetId: string; // ID of the review, product, shop, or seller being reported
  reason: ReportReason;
  description: string;
  status: ReportStatus;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
}

export interface ReputationSummary {
  targetType: ReviewTargetType;
  targetId: string;
  totalPublishedReviews: number;
  averageRating: number | null; // e.g., 4.5 or null if 0 reviews
  ratingDistribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
  hasReviews: boolean;
  isSmallSample: boolean; // true if 1 or 2 reviews
  smallSampleWarning?: string;
  displayRatingText: string;
  reputationDisclaimer: string;
}

export type ReviewEligibilityState =
  | 'ELIGIBLE'
  | 'NOT_ELIGIBLE'
  | 'SELF_OWNED'
  | 'ALREADY_REVIEWED'
  | 'UNKNOWN'
  | 'UNAVAILABLE';

export interface ReviewEligibilityResult {
  state: ReviewEligibilityState;
  canReview: boolean;
  existingReview?: MarketplaceReview | null;
  reasonText: string;
}

export interface ReviewSubmissionInput {
  targetType: ReviewTargetType;
  targetId: string;
  sellerId: string;
  shopId?: string | null;
  productId?: string | null;
  rating: number;
  title: string;
  body: string;
}

export interface ReviewUpdateInput {
  rating?: number;
  title?: string;
  body?: string;
}

export interface ReportSubmissionInput {
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  description?: string;
}

export interface SellerResponseInput {
  reviewId: string;
  response: string;
}

export interface AIReviewSummaryResult {
  targetType: ReviewTargetType;
  targetId: string;
  hasSufficientData: boolean;
  totalReviewsAnalyzed: number;
  averageRating: number | null;
  summaryText: string;
  positiveThemes: string[];
  constructiveFeedback: string[];
  disclaimer: string;
}

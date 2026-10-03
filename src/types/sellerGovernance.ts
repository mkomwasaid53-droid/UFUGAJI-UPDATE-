/**
 * Ufugaji Update - Phase 6: Marketplace Governance
 * V1.7E: Seller Warnings & Restrictions Types
 *
 * Core Principle:
 * OBSERVED GOVERNANCE ISSUE
 * → DOCUMENTED MODERATION EVIDENCE
 * → WARNING / RESTRICTION DECISION
 * → SELLER NOTIFICATION
 * → AUDIT TRAIL
 * → REVIEW / EXPIRY / RESTORATION WHERE APPROPRIATE
 *
 * Explicit Non-Negotiable Invariants:
 * - NO reputation score, NO trust score, NO fraud score, NO AI seller risk score.
 * - AI is NOT the decision maker; all actions require human admin authorization.
 * - Reports alone are NOT proof.
 * - Seller verification status (V1.6A) is NOT automatically revoked or modified.
 * - Shop ownership (V1.6B) and Product ownership (V1.6C) remain strictly immutable.
 * - Existing active listings are NOT automatically mass-deleted.
 * - Internal notes are strictly separated from seller-facing explanations.
 */

// ==========================================
// 1. CONTROLLED WARNING TYPES & SEVERITIES
// ==========================================

export type SellerWarningType =
  | 'MISLEADING_LISTING'
  | 'INVALID_CATEGORY'
  | 'REPEATED_LISTING_ERRORS'
  | 'MISLEADING_PRICE'
  | 'MISLEADING_STOCK'
  | 'MISLEADING_LOCATION'
  | 'MISLEADING_DELIVERY_INFORMATION'
  | 'DUPLICATE_LISTING'
  | 'INAPPROPRIATE_CONTENT'
  | 'NON_MARKETPLACE_CONTENT'
  | 'REPEATED_POLICY_VIOLATION'
  | 'OTHER';

export type SellerWarningSeverity =
  | 'NOTICE'           // Taarifa ya kawaida ya usimamizi
  | 'WARNING'          // Onyo rasmi la sera ya sokoni
  | 'SERIOUS_WARNING'; // Onyo kali la kukiuka taratibu

export type SellerWarningStatus =
  | 'ACTIVE'
  | 'ACKNOWLEDGED'
  | 'EXPIRED'
  | 'RESOLVED'
  | 'REVOKED';

export type SellerWarningSourceType =
  | 'MODERATION'
  | 'REPORT'
  | 'LISTING_VALIDATION'
  | 'CATEGORY_GOVERNANCE'
  | 'OTHER_GOVERNANCE';

// ==========================================
// 2. SELLER WARNING MODEL
// ==========================================

export interface SellerWarning {
  warningId: string;
  sellerId: string;             // Authoritative seller user ID
  userId: string;               // User ID (equals sellerId)
  shopId?: string | null;       // Associated digital shop if available
  warningType: SellerWarningType;
  severity: SellerWarningSeverity;
  status: SellerWarningStatus;
  reasonCode: string;           // Structured reason code (e.g. INVALID_CATEGORY)
  reasonText: string;           // User-facing neutral Swahili explanation
  internalNote?: string | null; // Strictly private internal moderator note
  sourceType: SellerWarningSourceType;
  sourceId?: string | null;     // ID of related record (e.g. moderationId, reportId)
  relatedListingId?: string | null;
  relatedModerationId?: string | null;
  issuedBy: string;             // Admin UID
  issuedByName: string;         // Admin Display Name
  issuedAt: string;             // ISO 8601
  acknowledgedAt?: string | null;
  expiresAt?: string | null;    // ISO 8601 (Deterministic expiration)
  resolvedAt?: string | null;
  revokedAt?: string | null;
  revokedBy?: string | null;
  revocationReason?: string | null;
}

// ==========================================
// 3. SELLER RESTRICTION MODEL
// ==========================================

export type SellerRestrictionType =
  | 'LISTING_CREATE_RESTRICTED'     // Cannot create/publish new active listings
  | 'LISTING_EDIT_RESTRICTED'       // Cannot modify listings covered by restriction
  | 'MARKETPLACE_SELLING_RESTRICTED'// Cannot activate/publish any listings
  | 'NEW_PRODUCT_REVIEW_REQUIRED';  // New products require admin moderation before active

export type SellerRestrictionScope =
  | 'LISTING_CREATION'
  | 'LISTING_EDITING'
  | 'MARKETPLACE_SELLING'
  | 'PRODUCT_REVIEW';

export type SellerRestrictionStatus =
  | 'ACTIVE'
  | 'EXPIRED'
  | 'REVOKED';

export interface SellerRestriction {
  restrictionId: string;
  sellerId: string;
  userId: string;
  shopId?: string | null;
  restrictionType: SellerRestrictionType;
  scope: SellerRestrictionScope;
  status: SellerRestrictionStatus;
  reasonCode: string;
  reasonText: string;           // Safe user-facing Swahili explanation
  internalNote?: string | null; // Strictly private internal note
  sourceType: SellerWarningSourceType;
  sourceId?: string | null;
  relatedWarningId?: string | null;
  relatedListingId?: string | null;
  issuedBy: string;
  issuedByName: string;
  issuedAt: string;
  expiresAt?: string | null;    // ISO 8601
  revokedAt?: string | null;
  revokedBy?: string | null;
  revocationReason?: string | null;
}

// ==========================================
// 4. IMMUTABLE AUDIT TRAIL MODEL
// ==========================================

export type SellerGovernanceAuditAction =
  | 'ISSUE_WARNING'
  | 'ACKNOWLEDGE_WARNING'
  | 'RESOLVE_WARNING'
  | 'REVOKE_WARNING'
  | 'IMPOSE_RESTRICTION'
  | 'REVOKE_RESTRICTION'
  | 'EXPIRE_RESTRICTION';

export interface SellerGovernanceAuditEntry {
  auditId: string;
  action: SellerGovernanceAuditAction;
  targetType: 'SELLER_WARNING' | 'SELLER_RESTRICTION';
  targetId: string;             // warningId or restrictionId
  sellerId: string;
  performedBy: string;          // User ID of administrator or seller acknowledging
  performedByName: string;
  performedAt: string;          // ISO 8601
  previousState?: any;
  newState?: any;
  reasonCode?: string | null;
  reasonText?: string | null;
  internalNote?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
}

// ==========================================
// 5. STRUCTURED GOVERNANCE SUMMARY
// (NO SCORES - ONLY AUTHORITATIVE FACTS)
// ==========================================

export interface SellerGovernanceSummary {
  sellerId: string;
  activeWarningsCount: number;
  totalWarningsCount: number;
  activeRestrictions: SellerRestriction[];
  hasActiveRestriction: boolean;
  isListingCreateRestricted: boolean;
  isListingEditRestricted: boolean;
  isMarketplaceSellingRestricted: boolean;
  isProductReviewRequired: boolean;
  effectiveRestrictionNotice?: string | null;
  warnings: SellerWarning[];
  restrictions: SellerRestriction[];
  auditLogs?: SellerGovernanceAuditEntry[];
}

// ==========================================
// 6. ACTION INPUT TYPES
// ==========================================

export interface IssueWarningInput {
  targetSellerId: string;
  shopId?: string | null;
  warningType: SellerWarningType;
  severity: SellerWarningSeverity;
  reasonCode: string;
  reasonText: string;
  internalNote?: string | null;
  sourceType?: SellerWarningSourceType;
  sourceId?: string | null;
  relatedListingId?: string | null;
  relatedModerationId?: string | null;
  expiresInDays?: number | null; // e.g. 14, 30 days
}

export interface ImposeRestrictionInput {
  targetSellerId: string;
  shopId?: string | null;
  restrictionType: SellerRestrictionType;
  scope?: SellerRestrictionScope;
  reasonCode: string;
  reasonText: string;
  internalNote?: string | null;
  sourceType?: SellerWarningSourceType;
  sourceId?: string | null;
  relatedWarningId?: string | null;
  relatedListingId?: string | null;
  expiresInDays?: number | null; // e.g. 7, 14, 30, 60 days
}

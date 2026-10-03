/**
 * V1.7B — Marketplace Listing Validation Data Models & Interfaces
 * Phase 6: Marketplace Governance
 *
 * Core Principles:
 * 1. Every Marketplace listing must pass deterministic validation before it can become publicly ACTIVE.
 * 2. Conceptual flow:
 *    SELLER -> SELLER IDENTITY -> DIGITAL SHOP -> PRODUCT -> GOVERNED CATEGORY -> LISTING VALIDATION -> TRUST DATA CHECK -> MARKETPLACE ACTIVE LISTING
 * 3. Validation results are structured, traceable, and deterministic.
 * 4. AI, seller free text, images, videos, and client-side claims must NOT override authoritative validation.
 */

export type ListingValidationStatus =
  | 'VALID'
  | 'INCOMPLETE'
  | 'INVALID'
  | 'BLOCKED'
  | 'UNAVAILABLE';

export type ListingValidationCheckType =
  | 'SELLER_IDENTITY'
  | 'SHOP_OWNERSHIP'
  | 'PRODUCT_OWNERSHIP'
  | 'PRODUCT_STATUS'
  | 'CATEGORY'
  | 'CATEGORY_STATUS'
  | 'PRODUCT_NAME'
  | 'DESCRIPTION'
  | 'PRICE'
  | 'STOCK'
  | 'LOCATION'
  | 'DELIVERY'
  | 'MEDIA'
  | 'MARKETPLACE_ELIGIBILITY'
  | 'LISTING_STATUS';

export type CheckStatus = 'PASSED' | 'FAILED' | 'WARNING' | 'SKIPPED';

export interface ListingValidationCheck {
  checkType: ListingValidationCheckType;
  status: CheckStatus;
  message: string;
  code?: string;
  details?: string;
}

export interface ListingValidationError {
  checkType: ListingValidationCheckType;
  code: string;
  message: string;
}

export interface ListingValidationWarning {
  checkType: ListingValidationCheckType;
  code: string;
  message: string;
}

export interface ListingValidationResult {
  listingId: string;
  productId: string;
  sellerId: string;
  shopId: string | null;
  validationStatus: ListingValidationStatus;
  isEligibleForActive: boolean;
  validatedAt: string;
  validatedBy: string;
  validationVersion: string; // 'V1.7B'
  errors: ListingValidationError[];
  warnings: ListingValidationWarning[];
  checks: ListingValidationCheck[];
  summaryMessage: string;
}

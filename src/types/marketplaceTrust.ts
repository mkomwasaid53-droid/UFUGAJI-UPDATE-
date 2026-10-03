/**
 * V1.6G — MARKETPLACE TRUST SIGNALS TYPES
 * Phase 5: Marketplace Trust
 *
 * Core Principles:
 * 1. A trust signal is evidence about a specific attribute (e.g. verified identity,
 *    structured price, delivery availability, published user reviews).
 * 2. A trust signal is NOT a guarantee of the entire seller or product:
 *    - Verified Seller != Guaranteed Product Quality, Stock, or Delivery.
 *    - High Rating != Guaranteed Future Experience.
 *    - Delivery Available != Guaranteed Delivery Time.
 *    - Price Provided != Guaranteed Final Price.
 *    - In Stock != Guaranteed Physical Stock at the moment of purchase.
 * 3. Authority Hierarchy:
 *    - 1. Authoritative structured Marketplace data
 *    - 2. Authorized moderation / verification data
 *    - 3. Published user reviews
 *    - 4. Seller-provided claims
 *    - 5. AI interpretation
 * 4. Strictly NO misleading generic badges:
 *    - "100% Trusted", "Guaranteed Seller", "Safe Seller", "Best Seller" are BANNED.
 * 5. Strictly NO opaque combined trust scores.
 * 6. Missing signals remain explicitly missing without conversion into allegations.
 */

import {
  PriceStatus,
  StockStatus,
  LocationStatus,
  DeliveryType,
  DeliveryFeeType,
  PickupStatus,
  FreshnessState
} from './marketplace';
import { ReviewTargetType } from './marketplaceReview';

export type TrustSignalAuthorityLevel =
  | 'AUTHORITATIVE_STRUCTURED' // Direct from DB fields (price, stock, location, delivery)
  | 'AUTHORITATIVE_VERIFICATION' // Admin-verified identity record
  | 'PUBLISHED_USER_REVIEW' // Published reviews by authenticated buyers
  | 'SELLER_CLAIM' // Unverified seller free-text description
  | 'AI_INTERPRETATION'; // AI synthesis (lowest authority, read-only)

export interface VerifiedSellerTrustSignal {
  isVerified: boolean;
  status: 'VERIFIED' | 'UNVERIFIED' | 'PENDING' | 'REVOKED';
  businessName?: string;
  verificationDate?: string | null;
  authority: TrustSignalAuthorityLevel;
  displayBadge: string;
  disclaimer: string;
}

export interface ShopTrustSignal {
  hasShop: boolean;
  shopId?: string | null;
  shopName?: string;
  isPublished: boolean;
  ownershipState: 'VALID' | 'INCONSISTENT' | 'UNAVAILABLE';
  authority: TrustSignalAuthorityLevel;
  ownershipNotice?: string;
}

export interface PriceTrustSignal {
  status: PriceStatus;
  displayPrice: string;
  rawAmount: number | null;
  currency: string;
  unit: string | null;
  lastUpdatedText: string | null;
  isStale: boolean;
  authority: TrustSignalAuthorityLevel;
  disclaimer: string;
  hasDescriptionConflict: boolean;
  descriptionConflictPrice?: number;
  conflictNotice?: string;
}

export interface StockTrustSignal {
  status: StockStatus;
  displayStock: string;
  quantity: number | null;
  unit: string | null;
  lastUpdatedText: string | null;
  isStale: boolean;
  authority: TrustSignalAuthorityLevel;
  disclaimer: string;
  hasDescriptionConflict: boolean;
  conflictNotice?: string;
}

export interface LocationTrustSignal {
  status: LocationStatus;
  displayLocation: string;
  region?: string;
  district?: string;
  area?: string;
  isShopLocation: boolean;
  isStale: boolean;
  authority: TrustSignalAuthorityLevel;
  disclaimer: string;
  hasDescriptionConflict: boolean;
  conflictNotice?: string;
}

export interface DeliveryTrustSignal {
  status: DeliveryType | 'DELIVERY_AVAILABLE' | 'DELIVERY_NOT_AVAILABLE' | 'DELIVERY_INFORMATION_NOT_PROVIDED' | 'UNAVAILABLE' | 'ERROR';
  deliveryAvailable: boolean;
  displayDelivery: string;
  feeType: DeliveryFeeType | 'PROVIDED' | 'NOT_PROVIDED' | 'FREE' | 'FIXED' | 'CALCULATED_ON_ORDER' | 'NEGOTIABLE' | 'UNAVAILABLE' | 'ERROR';
  feeAmount: number | null;
  deliveryAreas: string[];
  timeEstimate?: string | null;
  isStale: boolean;
  authority: TrustSignalAuthorityLevel;
  disclaimer: string;
  hasDescriptionConflict: boolean;
  conflictNotice?: string;
}

export interface PickupTrustSignal {
  status: PickupStatus;
  pickupAvailable: boolean;
  pickupAddress?: string | null;
  displayPickup: string;
  authority: TrustSignalAuthorityLevel;
  disclaimer: string;
}

export interface ReputationTrustSignal {
  targetType: ReviewTargetType;
  targetId: string;
  hasReviews: boolean;
  totalPublishedReviews: number;
  averageRating: number | null;
  isSmallSample: boolean;
  smallSampleWarning?: string;
  ratingDistribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
  displayRatingText: string;
  authority: TrustSignalAuthorityLevel;
  disclaimer: string;
}

export interface ModerationTrustSignal {
  hasOpenReports: boolean;
  reportCount: number;
  isPublicAllegationOnly: boolean;
  moderationNotice: string;
  authority: TrustSignalAuthorityLevel;
}

/**
 * Unified Product Trust Signals Bundle
 */
export interface ProductTrustSignals {
  productId: string;
  sellerId: string;
  shopId?: string | null;

  // Individual domain signals (each traceable to source)
  sellerVerification: VerifiedSellerTrustSignal;
  shop: ShopTrustSignal;
  price: PriceTrustSignal;
  stock: StockTrustSignal;
  location: LocationTrustSignal;
  delivery: DeliveryTrustSignal;
  pickup: PickupTrustSignal;
  reputation: ReputationTrustSignal;
  moderation: ModerationTrustSignal;

  // High-level factual summary (concise, never "100% trusted")
  conciseBulletPoints: string[];

  // Global boundary disclaimer
  boundaryNotice: string;

  // Audit timestamp
  evaluatedAt: string;
}

/**
 * Unified Shop Trust Signals Bundle
 */
export interface ShopTrustSignals {
  shopId: string;
  sellerId: string;
  shopName: string;
  isPublished: boolean;

  sellerVerification: VerifiedSellerTrustSignal;
  location: LocationTrustSignal;
  reputation: ReputationTrustSignal;
  moderation: ModerationTrustSignal;

  totalActiveProducts: number;
  conciseBulletPoints: string[];
  boundaryNotice: string;
  evaluatedAt: string;
}

/**
 * Deterministic Trust Comparison between two products/sellers
 * AI uses this to compare structured signals WITHOUT ranking as "best seller"
 */
export interface TrustComparisonResult {
  basis: string;
  productA: {
    title: string;
    sellerName: string;
    isVerified: boolean;
    priceStatus: string;
    stockStatus: string;
    location: string;
    deliveryAvailable: boolean;
    publishedReviewsCount: number;
    averageRating: number | null;
  };
  productB: {
    title: string;
    sellerName: string;
    isVerified: boolean;
    priceStatus: string;
    stockStatus: string;
    location: string;
    deliveryAvailable: boolean;
    publishedReviewsCount: number;
    averageRating: number | null;
  };
  neutralComparisonSwahili: string;
}

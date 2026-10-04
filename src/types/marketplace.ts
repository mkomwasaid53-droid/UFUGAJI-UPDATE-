export type ProductStatus = 'active' | 'inactive' | 'sold_out' | 'draft';
export type VerificationStatus = 'unverified' | 'pending' | 'verified';
export type { SellerVerification, SellerVerificationStatus, SellerVerificationType } from './sellerVerification';

export interface ProductImage {
  id: string;
  url: string;
  thumbnailUrl?: string;
  isPrimary?: boolean;
  caption?: string;
  uploadedAt?: string;
}

export interface ProductVideo {
  id: string;
  url: string;
  storagePath?: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  title?: string;
  description?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface MarketplaceCategory {
  id: string;
  name: string;
  swahiliName: string;
  iconName: string;
  description: string;
  subcategories: string[];
}

export interface SellerProfile {
  uid: string;
  businessName: string;
  displayName: string;
  phone: string;
  location: string;
  region?: string;
  district?: string;
  description?: string;
  verificationStatus: VerificationStatus;
  logoImage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DigitalShop {
  shopId: string;
  sellerId: string;
  shopName: string;
  description: string;
  location: string;
  region?: string;
  district?: string;
  area?: string;
  shopLocation?: string;
  shopLocationUpdatedAt?: string;
  phone: string;
  whatsapp?: string;
  isPublished: boolean;
  coverImage?: string;
  logoImage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ShopCatalogue {
  catalogueId: string;
  shopId: string;
  sellerId: string;
  name: string;
  description?: string;
  icon?: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceProduct {
  productId: string;
  sellerId: string;
  shopId?: string | null;
  catalogueId?: string | null;
  catalogueName?: string;
  sellerName: string;
  sellerBusinessName?: string;
  sellerPhone: string;
  sellerLocation: string;
  sellerVerificationStatus?: VerificationStatus;
  title: string;
  description: string;
  category: string;
  subcategory?: string;
  categoryId?: string;
  subcategoryId?: string;
  price: number;
  currency: 'TZS' | 'Tsh';
  unit: string; // e.g. 'kuku', 'trei', 'mfuko 50kg', 'lita', 'kichwa', 'seti', etc.
  quantityAvailable: number;
  priceUpdatedAt?: string;
  stockUpdatedAt?: string;
  priceStatus?: PriceStatus;
  stockStatus?: StockStatus;
  location: string;
  region?: string;
  district?: string;
  area?: string;
  productLocation?: string;
  productLocationType?: LocationType;
  productLocationUpdatedAt?: string;

  // V1.6E Delivery Trust
  deliveryAvailable?: boolean;
  deliveryType?: DeliveryType;
  deliveryAreas?: string[];
  deliveryAreaLevel?: DeliveryAreaLevel;
  pickupAvailable?: boolean;
  pickupAddress?: string;
  deliveryFee?: number | null;
  deliveryFeeType?: DeliveryFeeType;
  deliveryTimeEstimate?: string | null;
  deliveryUpdatedAt?: string;
  availabilityStatus?: ProductAvailabilityState;

  imageUrl?: string;
  images?: ProductImage[];
  video?: ProductVideo;
  status: ProductStatus;

  // V1.7B Marketplace Listing Validation
  validationStatus?: 'VALID' | 'INCOMPLETE' | 'INVALID' | 'BLOCKED' | 'UNAVAILABLE';
  validationVersion?: string;
  validatedAt?: string;
  validatedBy?: string;
  validationErrors?: Array<{ checkType: string; code: string; message: string }>;
  validationWarnings?: Array<{ checkType: string; code: string; message: string }>;

  // V1.7D Admin Moderation
  moderationStatus?: 'NOT_REVIEWED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'HIDDEN' | 'SUSPENDED' | 'RESTORED' | 'ESCALATED';
  moderationId?: string;
  moderatedAt?: string;
  moderatedBy?: string;
  moderationReasonCode?: string;
  moderationPublicReason?: string;
  moderationCorrectionNote?: string;

  createdAt: string;
  updatedAt: string;
  isTestDemo?: boolean; // Clearly indicates sample/test data
  livestockLink?: {
    category?: string;
    type?: string;
  };
}

export interface ProductFilterState {
  searchTerm: string;
  category: string;
  subcategory?: string;
  region: string;
  minPrice?: number;
  maxPrice?: number;
  statusFilter: 'all' | 'active' | 'in_stock';
  sortBy: 'newest' | 'price_asc' | 'price_desc';
  onlyMyProducts?: boolean;
}

/**
 * V1.6C — Product Trust & Ownership Integrity
 * Authoritative relationship: Authenticated Seller -> Seller Identity -> Digital Shop -> Product
 */
export type ProductOwnershipState = 'VALID' | 'INCONSISTENT' | 'UNAVAILABLE' | 'ERROR';

export interface ProductOwnershipValidation {
  state: ProductOwnershipState;
  isValid: boolean;
  authoritativeSellerId: string | null;
  authoritativeShopId: string | null;
  authoritativeShopName: string;
  authoritativeSellerName: string;
  isSellerVerified: boolean;
  verificationBadgeLabel: string;
  disclaimer: string;
  status: ProductStatus;
  errorReason?: string;
  isLegacyProduct?: boolean;
}

/**
 * V1.6D — Price & Stock Trust
 * Authoritative states, freshness, and display models
 */
export type PriceStatus = 'PROVIDED' | 'NOT_PROVIDED' | 'UNAVAILABLE' | 'STALE' | 'ERROR';
export type StockStatus = 'IN_STOCK' | 'OUT_OF_STOCK' | 'NOT_PROVIDED' | 'UNAVAILABLE' | 'STALE' | 'ERROR';
export type FreshnessState = 'CURRENT' | 'STALE' | 'UNKNOWN';

export interface FormattedPriceResult {
  status: PriceStatus;
  freshness: FreshnessState;
  displayPrice: string;
  rawAmount: number | null;
  currency: 'TZS' | 'Tsh';
  unit: string | null;
  lastUpdatedText: string | null;
  isStale: boolean;
  trustDisclaimer: string;
}

export interface FormattedStockResult {
  status: StockStatus;
  freshness: FreshnessState;
  displayStock: string;
  quantity: number | null;
  unit: string | null;
  lastUpdatedText: string | null;
  isAvailable: boolean;
  isOutOfStock: boolean;
  isStale: boolean;
  trustDisclaimer: string;
}

export interface ProductPriceStockTrust {
  price: FormattedPriceResult;
  stock: FormattedStockResult;
  hasDescriptionPriceConflict: boolean;
  descriptionPriceFound?: number;
  hasDescriptionStockConflict: boolean;
  structuredWinsNotice?: string;
  isSellerVerified: boolean;
  verificationBoundaryNotice: string;
}

/**
 * V1.6E — Location, Delivery & Availability Trust
 * Deterministic states and formatted results
 */
export type LocationStatus =
  | 'LOCATION_PROVIDED'
  | 'LOCATION_PARTIAL'
  | 'LOCATION_NOT_PROVIDED'
  | 'LOCATION_UNAVAILABLE'
  | 'LOCATION_STALE'
  | 'LOCATION_ERROR';

export type LocationType =
  | 'PRODUCT_LOCATION'
  | 'SHOP_LOCATION'
  | 'SELLER_LOCATION'
  | 'UNKNOWN';

export type DeliveryType =
  | 'DELIVERY_AVAILABLE'
  | 'PICKUP_ONLY'
  | 'DELIVERY_AND_PICKUP'
  | 'DELIVERY_NOT_AVAILABLE'
  | 'DELIVERY_INFORMATION_NOT_PROVIDED'
  | 'DELIVERY_UNAVAILABLE'
  | 'DELIVERY_ERROR';

export type DeliveryAreaLevel = 'REGION' | 'DISTRICT' | 'AREA' | 'SPECIFIC_AREA';

export type DeliveryFeeStatus =
  | 'DELIVERY_FEE_PROVIDED'
  | 'DELIVERY_FEE_NOT_PROVIDED'
  | 'DELIVERY_FEE_UNAVAILABLE'
  | 'DELIVERY_FEE_STALE'
  | 'DELIVERY_FEE_ERROR';

export type DeliveryFeeType = 'FIXED' | 'NEGOTIABLE' | 'FREE' | 'NOT_PROVIDED';

export type DeliveryTimeStatus =
  | 'DELIVERY_TIME_PROVIDED'
  | 'DELIVERY_TIME_NOT_PROVIDED'
  | 'DELIVERY_TIME_UNAVAILABLE'
  | 'DELIVERY_TIME_STALE'
  | 'DELIVERY_TIME_ERROR';

export type PickupStatus =
  | 'PICKUP_AVAILABLE'
  | 'PICKUP_NOT_AVAILABLE'
  | 'PICKUP_INFORMATION_NOT_PROVIDED'
  | 'PICKUP_UNAVAILABLE'
  | 'PICKUP_ERROR';

export type ProductAvailabilityState =
  | 'AVAILABLE'
  | 'LIMITED_INFORMATION'
  | 'NOT_AVAILABLE'
  | 'UNAVAILABLE'
  | 'STALE'
  | 'ERROR';

export interface FormattedLocationResult {
  status: LocationStatus;
  locationType: LocationType;
  displayLocation: string;
  region?: string;
  district?: string;
  area?: string;
  isPartial: boolean;
  isStale: boolean;
  lastUpdatedText: string | null;
  trustDisclaimer: string;
}

export interface FormattedDeliveryResult {
  status: DeliveryType;
  deliveryAvailable: boolean;
  pickupAvailable: boolean;
  displayDelivery: string;
  displayPickup: string;
  deliveryAreas: string[];
  deliveryAreaLevel?: DeliveryAreaLevel;
  feeStatus: DeliveryFeeStatus;
  feeType: DeliveryFeeType;
  deliveryFee: number | null;
  displayFee: string;
  timeStatus: DeliveryTimeStatus;
  deliveryTimeEstimate: string | null;
  displayTime: string;
  isStale: boolean;
  lastUpdatedText: string | null;
  trustDisclaimer: string;
}

export interface FormattedAvailabilityResult {
  state: ProductAvailabilityState;
  isPurchasable: boolean;
  displayLabel: string;
  explanation: string;
  trustDisclaimer: string;
}

export interface ProductLocationDeliveryTrust {
  location: FormattedLocationResult;
  delivery: FormattedDeliveryResult;
  availability: FormattedAvailabilityResult;
  hasDescriptionLocationConflict: boolean;
  hasDescriptionDeliveryConflict: boolean;
  conflicts: string[];
  structuredWinsNotice?: string;
  trustNotice: string;
}

export * from './sellerVerification';
export * from './marketplaceReview';
export * from './marketplaceCategory';
export * from './marketplaceListingValidation';
export * from './marketplaceModeration';
export * from './sellerGovernance';
export type {
  MarketplaceReportRecord,
  ReportReasonCode,
  ReportResolutionCode,
  SubmitReportInput,
  ReviewReportInput,
  AppealTargetType,
  AppealReasonCode,
  AppealStatus,
  AppealDecisionCode,
  MarketplaceAppealRecord,
  SubmitAppealInput,
  ReviewAppealInput,
  GovernanceReportAppealAuditAction,
  MarketplaceReportAppealAuditEntry
} from './marketplaceReportAndAppeal';
export {
  REPORT_REASON_METADATA,
  APPEAL_REASON_METADATA
} from './marketplaceReportAndAppeal';



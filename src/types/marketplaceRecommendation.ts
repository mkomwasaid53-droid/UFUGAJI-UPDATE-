import { MarketplaceProduct, DigitalShop, VerificationStatus } from './marketplace';
import { VisualMatchScore, VisualProductMatchResult } from './visualMarketplace';
import { ProductTrustSignals, ShopTrustSignals } from './marketplaceTrust';

export type MarketplaceIntentType =
  | 'PRODUCT_SEARCH'
  | 'PRODUCT_NEED'
  | 'SHOP_SEARCH'
  | 'EQUIPMENT_SEARCH'
  | 'VISUAL_PRODUCT_SEARCH'
  | 'VISUAL_PRODUCT_NEED'
  | 'NO_MARKETPLACE_INTENT';

export type IntentConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type RecommendationMatchType = 'exact' | 'related';

export type LocationMatchType = 'same_area' | 'same_region' | 'other' | 'unknown';

export interface StructuredMarketplaceQuery {
  source?: 'USER_DIRECT' | 'MY_ASSISTANT' | 'VISUAL_SEARCH' | 'AI_CONVERSATION';
  intent: MarketplaceIntentType;
  confidence: IntentConfidence;
  targetType: 'product' | 'shop';
  category?: string;
  subcategory?: string;
  livestockType?: string;
  productType?: string;
  keywords: string[];
  location?: string;
  budget?: { min?: number | null; max?: number | null } | number;
  availability?: string;
  requiresStock?: boolean;
}

export interface ProductRecommendationItem {
  productId: string;
  title: string;
  price: number;
  currency: string;
  unit: string;
  location: string;
  region?: string;
  district?: string;
  sellerId: string;
  sellerName: string;
  sellerBusinessName?: string;
  sellerVerified: boolean;
  inStock: boolean;
  quantityAvailable: number;
  imageUrl?: string;
  hasVideo?: boolean;
  videoDurationSeconds?: number;
  relevanceReason?: string;
  matchType: RecommendationMatchType;
  locationMatch?: LocationMatchType;
  shopId?: string | null;
  catalogueId?: string | null;
  catalogueName?: string;
  visualMatch?: VisualMatchScore;
  visualMatchConfidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  visualMatchExplanation?: string;
  isSemanticOnly?: boolean;
  trustSignals?: ProductTrustSignals;
}

export interface ShopRecommendationItem {
  shopId: string;
  sellerId: string;
  shopName: string;
  description: string;
  location: string;
  region?: string;
  district?: string;
  phone?: string;
  whatsapp?: string;
  isPublished: boolean;
  sellerVerified: boolean;
  logoImage?: string;
  coverImage?: string;
  relevanceReason?: string;
  matchType: RecommendationMatchType;
  locationMatch?: LocationMatchType;
  trustSignals?: ShopTrustSignals;
}

export interface AiMarketplaceRecommendationResult {
  detected: boolean;
  intentType: MarketplaceIntentType;
  confidence: IntentConfidence;
  targetType: 'product' | 'shop';
  queryKeywords: string[];
  queryCategory?: string;
  queryLocation?: string;
  status: 'has_results' | 'no_results' | 'error';
  explanation: string;
  products?: ProductRecommendationItem[];
  shops?: ShopRecommendationItem[];
  visualMatchResult?: VisualProductMatchResult;
}

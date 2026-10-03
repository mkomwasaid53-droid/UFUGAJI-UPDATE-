/**
 * V1.5C — AI -> MARKETPLACE INTELLIGENCE BRIDGE TYPES
 * Phase 4: The Intelligent Loop (AI Context Layer)
 *
 * Defines types for the read-only, authoritative integration between
 * the AI Assistant and the Marketplace / Gulio Retrieval Engine.
 */

import { MarketplaceProduct, DigitalShop } from './marketplace';
import {
  MarketplaceIntentType,
  IntentConfidence,
  StructuredMarketplaceQuery,
  ProductRecommendationItem,
  ShopRecommendationItem,
  AiMarketplaceRecommendationResult
} from './marketplaceRecommendation';

export type {
  MarketplaceIntentType,
  IntentConfidence,
  StructuredMarketplaceQuery,
  ProductRecommendationItem,
  ShopRecommendationItem,
  AiMarketplaceRecommendationResult
};

export type MarketplaceDataSufficiency =
  | 'EXACT_MATCHES'
  | 'RELATED_MATCHES'
  | 'NO_MATCHES'
  | 'INSUFFICIENT_DATA'
  | 'SOURCE_ERROR';

export type MarketplaceProvenance = 'MODULE_SOURCE' | 'REALTIME_MODULE';

export type MarketplaceAuthorityLevel = 'REALTIME_MODULE' | 'AUTHORITATIVE_COMMERCIAL';

export interface MarketplaceBridgeAdapterParams {
  question: string;
  history?: any[];
  marketplaceProducts?: MarketplaceProduct[];
  publishedShops?: DigitalShop[];
  farmerLocation?: string;
  mentionedSpecies?: string[];
  explicitStructuredQuery?: StructuredMarketplaceQuery | null;
}

export interface MarketplaceAIIntelligenceResult {
  detected: boolean;
  intent: MarketplaceIntentType;
  confidence: IntentConfidence;
  targetType: 'product' | 'shop';
  queryKeywords: string[];
  queryCategory?: string;
  querySubcategory?: string;
  queryLocation?: string;
  structuredQuery: StructuredMarketplaceQuery | null;

  // Real retrieval & verification
  status: 'has_results' | 'no_results' | 'error';
  dataSufficiency: MarketplaceDataSufficiency;
  totalProductsMatched: number;
  totalShopsMatched: number;
  verifiedSellerCount: number;
  inStockCount: number;

  // Verified results from Gulio (Never hallucinated)
  products: ProductRecommendationItem[];
  shops: ShopRecommendationItem[];

  // Deterministic answer or structured factual summary (zero-guess, zero-hallucination)
  isDeterministicEligible: boolean;
  deterministicAnswer: string;
  explanationSwahili: string;
  rawRecommendationResult?: AiMarketplaceRecommendationResult;

  // Commercial & Medical Safety Notice
  safetyNotice: string | null;

  // Diagnostic observability metadata
  observability: {
    serviceCalled: string;
    totalProductsExamined: number;
    totalShopsExamined: number;
    computationDurationMs: number;
  };
}

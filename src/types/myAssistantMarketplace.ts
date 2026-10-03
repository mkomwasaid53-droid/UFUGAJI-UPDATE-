/**
 * V1.5D — MY ASSISTANT -> MARKETPLACE TYPES
 * Phase 4: The Intelligent Loop
 *
 * Controlled integration interfaces between My Assistant farmer intelligence
 * and the authoritative Gulio Marketplace discovery engine.
 */

import { ProductRecommendationItem, StructuredMarketplaceQuery } from './marketplaceRecommendation';

export type MyAssistantIntelligenceType =
  | 'LIVESTOCK_COUNT'
  | 'LIVESTOCK_ADDITION'
  | 'LIVESTOCK_TREND'
  | 'ACTIVITY_SUMMARY'
  | 'OBSERVATION_INSIGHT'
  | 'FARM_OVERVIEW';

/**
 * Thin integration context adapter converting existing My Assistant
 * intelligence into Marketplace discovery context without duplicating intelligence.
 */
export interface MyAssistantMarketplaceContext {
  livestockType?: string;
  livestockCategory?: string;
  currentQuantity?: number;
  relevantCategories?: string[];
  relevantActivity?: string;
  relevantIntelligenceType?: MyAssistantIntelligenceType;
  relevantPeriod?: string;
  farmerLocationIfAppropriate?: string;
  explicitUserCriteria?: {
    searchQuery?: string;
    category?: string;
    location?: string;
    maxPrice?: number;
    livestockType?: string;
  };
}

/**
 * Represents a detected discovery opportunity from My Assistant intelligence.
 * Distinguishes contextual discovery from explicit purchase intent.
 */
export interface ContextualMarketplaceOpportunity {
  hasOpportunity: boolean;
  reason: string;
  livestockType: string;
  livestockCategory: string;
  suggestedActionLabel: string;
  suggestedKeywords: string[];
  suggestedCategory?: string;
  isMedicalProtected: boolean;
  sourceIntelligenceType: string;
}

/**
 * Result of executing a My Assistant originated Marketplace query.
 */
export interface MyAssistantMarketplaceQueryResult {
  source: 'MY_ASSISTANT';
  context: MyAssistantMarketplaceContext;
  structuredQuery: StructuredMarketplaceQuery;
  status: 'has_results' | 'no_results' | 'error';
  products: ProductRecommendationItem[];
  totalMatched: number;
  explanationSwahili: string;
  contextualLabel: string;
  isRefinedByFarmer: boolean;
  refinementSummary?: string;
  safetyNotice?: string;
  traceableReason: {
    source: 'MY_ASSISTANT';
    intelligenceType: string;
    livestockType: string;
    category?: string;
    reason: string;
  };
}

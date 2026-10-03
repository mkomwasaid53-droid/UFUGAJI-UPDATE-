/**
 * V1.3 — VISUAL MARKETPLACE SEARCH FOUNDATION
 * MarketplaceSearchService
 *
 * Provides a clean architectural facade between Visual Understanding and Marketplace Retrieval:
 *
 * VisualIntentService
 *       ↓
 * MarketplaceQueryNormalizer
 *       ↓
 * MarketplaceSearchService (Source of Truth)
 *
 * Rules:
 * - VISUAL UNDERSTANDING ≠ MARKETPLACE TRUTH
 * - Queries only real published Marketplace products and verified shops
 * - Never constructs fake products, fake sellers, fake stock, or fake prices
 * - Does not execute visual vector/image matching yet (reserved for V1.3A–V1.3F)
 */

import { MarketplaceProduct, DigitalShop } from '../types/marketplace';
import { NormalizedVisualMarketplaceQuery, VisualMarketplaceAction } from '../types/visualMarketplace';
import { fetchMarketplaceProducts, fetchAllPublishedShops } from './marketplaceService';
import { getMarketplaceRecommendations } from './marketplaceRecommendationService';
import { AiMarketplaceRecommendationResult } from '../types/marketplaceRecommendation';

export interface PreparedVisualSearchContext {
  query: NormalizedVisualMarketplaceQuery;
  action: VisualMarketplaceAction;
  status: 'foundation_ready' | 'pending_activation';
  sourceOfTruthReady: boolean;
}

/**
 * Prepares the visual marketplace search context based on normalized query.
 * Does not fabricate products; marks status as foundation_ready until visual matching in V1.3A-F.
 */
export function prepareVisualMarketplaceSearch(
  query: NormalizedVisualMarketplaceQuery
): PreparedVisualSearchContext {
  const action: VisualMarketplaceAction = {
    type: 'VISUAL_MARKETPLACE_CTA',
    label: `🔎 Tafuta "${query.productConcept}" Sokoni`,
    source: query.source,
    query,
    status: 'foundation_ready'
  };

  return {
    query,
    action,
    status: 'foundation_ready',
    sourceOfTruthReady: true
  };
}

/**
 * Reusable execution gateway: executes text-based search queries via the established Marketplace engine.
 * Future builds (V1.3A-F) will connect visual embeddings/similarity matching to this service.
 */
export async function executeStandardMarketplaceSearch(
  queryText: string,
  farmerLocation?: string,
  cachedProducts?: MarketplaceProduct[],
  cachedShops?: DigitalShop[]
): Promise<AiMarketplaceRecommendationResult> {
  const products = cachedProducts && cachedProducts.length > 0
    ? cachedProducts
    : await fetchMarketplaceProducts();

  const shops = cachedShops && cachedShops.length > 0
    ? cachedShops
    : await fetchAllPublishedShops(products);

  return getMarketplaceRecommendations(queryText, products, shops, farmerLocation);
}

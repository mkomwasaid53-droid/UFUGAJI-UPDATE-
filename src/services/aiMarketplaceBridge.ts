/**
 * V1.5C — AI -> MARKETPLACE INTELLIGENCE BRIDGE
 * Phase 4: The Intelligent Loop (AI Context Layer)
 *
 * Provides a controlled, read-only integration adapter between the AI Assistant
 * and the authoritative Marketplace / Gulio Engine.
 *
 * Core Principles:
 * 1. "Marketplace is the source of truth for commercial information.
 *    AI Assistant is the interface that understands the farmer's request,
 *    retrieves relevant Marketplace information, and explains the result."
 * 2. "AI must NEVER invent Marketplace facts" (no guessed prices, stock,
 *    sellers, products, phone numbers, or locations).
 * 3. "If Marketplace has no data, AI must state that clearly."
 * 4. "Do not bypass V1.5A (Context Orchestration)."
 * 5. "Reuse existing Marketplace architecture" (deterministic ranking, intent classifier,
 *    and structured query builders).
 * 6. "Veterinary/medicine-related requests must NOT automatically convert into product search."
 * 7. "No automatic actions" (AI cannot purchase, pay, order, or contact sellers automatically).
 */

import { MarketplaceProduct, DigitalShop } from '../types/marketplace';
import {
  MarketplaceAIIntelligenceResult,
  MarketplaceBridgeAdapterParams,
  MarketplaceDataSufficiency,
  StructuredMarketplaceQuery,
  ProductRecommendationItem,
  ShopRecommendationItem
} from '../types/aiMarketplace';
import {
  resolveProductTrustSignals,
  resolveShopTrustSignals
} from './marketplaceTrustService';
import {
  classifyMarketplaceIntent,
  buildStructuredMarketplaceQuery
} from '../utils/marketplaceIntentClassifier';
import { getMarketplaceRecommendations } from './marketplaceRecommendationService';

// Swahili currency formatter
function formatTzs(amount: number): string {
  try {
    return new Intl.NumberFormat('sw-TZ', { maximumFractionDigits: 0 }).format(amount);
  } catch {
    return amount.toLocaleString();
  }
}

/**
 * Executes authoritative Marketplace retrieval and verification for AI Assistant.
 */
export function getMarketplaceIntelligenceForAI(
  params: MarketplaceBridgeAdapterParams
): MarketplaceAIIntelligenceResult {
  const startMs = Date.now();
  const {
    question = '',
    marketplaceProducts = [],
    publishedShops = [],
    farmerLocation,
    explicitStructuredQuery
  } = params;

  const cleanQuestion = question.trim();

  // 1. Intent Detection & Classification
  let structuredQuery: StructuredMarketplaceQuery | null = explicitStructuredQuery || null;
  const intentClassification = classifyMarketplaceIntent(cleanQuestion, farmerLocation);

  if (!structuredQuery) {
    structuredQuery = buildStructuredMarketplaceQuery(intentClassification);
  }

  // If no marketplace intent detected and no explicit query provided
  if (!structuredQuery || intentClassification.intent === 'NO_MARKETPLACE_INTENT') {
    return {
      detected: false,
      intent: 'NO_MARKETPLACE_INTENT',
      confidence: 'LOW',
      targetType: 'product',
      queryKeywords: intentClassification.keywords || [],
      structuredQuery: null,
      status: 'no_results',
      dataSufficiency: 'NO_MATCHES',
      totalProductsMatched: 0,
      totalShopsMatched: 0,
      verifiedSellerCount: 0,
      inStockCount: 0,
      products: [],
      shops: [],
      isDeterministicEligible: false,
      deterministicAnswer: '',
      explanationSwahili: 'Hakuna nia ya kibiashara au ya manunuzi iliyogunduliwa katika ombi hili.',
      safetyNotice: null,
      observability: {
        serviceCalled: 'getMarketplaceIntelligenceForAI',
        totalProductsExamined: marketplaceProducts.length,
        totalShopsExamined: publishedShops.length,
        computationDurationMs: Date.now() - startMs
      }
    };
  }

  // 2. Real Retrieval & Deterministic Ranking (Reuse existing Marketplace Engine)
  let rawRecommendationResult;
  try {
    rawRecommendationResult = getMarketplaceRecommendations(
      cleanQuestion,
      marketplaceProducts,
      publishedShops,
      farmerLocation
    );
  } catch (err: any) {
    console.warn('[V1.5C Bridge] Error executing marketplace recommendation service:', err);
    return {
      detected: true,
      intent: structuredQuery.intent,
      confidence: structuredQuery.confidence,
      targetType: structuredQuery.targetType,
      queryKeywords: structuredQuery.keywords,
      queryCategory: structuredQuery.category,
      querySubcategory: structuredQuery.subcategory,
      queryLocation: structuredQuery.location,
      structuredQuery,
      status: 'error',
      dataSufficiency: 'SOURCE_ERROR',
      totalProductsMatched: 0,
      totalShopsMatched: 0,
      verifiedSellerCount: 0,
      inStockCount: 0,
      products: [],
      shops: [],
      isDeterministicEligible: true,
      deterministicAnswer: 'Gulio la Ufugaji Update halikupatikana kwa sasa kwa sababu ya hitilafu ya mtandao. Unaweza kuangalia moja kwa moja kwenye ukurasa wa Gulio.',
      explanationSwahili: 'Hitilafu ya kiufundi ilitokea wakati wa kupakua data za soko.',
      safetyNotice: 'Huduma ya Gulio haikufikiwa. Hakuna makadirio ya bei au wauzaji yaliyofanywa.',
      observability: {
        serviceCalled: 'getMarketplaceIntelligenceForAI',
        totalProductsExamined: marketplaceProducts.length,
        totalShopsExamined: publishedShops.length,
        computationDurationMs: Date.now() - startMs
      }
    };
  }

  if (!rawRecommendationResult) {
    return {
      detected: true,
      intent: structuredQuery.intent,
      confidence: structuredQuery.confidence,
      targetType: structuredQuery.targetType,
      queryKeywords: structuredQuery.keywords,
      queryCategory: structuredQuery.category,
      querySubcategory: structuredQuery.subcategory,
      queryLocation: structuredQuery.location,
      structuredQuery,
      status: 'no_results',
      dataSufficiency: 'NO_MATCHES',
      totalProductsMatched: 0,
      totalShopsMatched: 0,
      verifiedSellerCount: 0,
      inStockCount: 0,
      products: [],
      shops: [],
      isDeterministicEligible: true,
      deterministicAnswer: `Sijaona bidhaa inayolingana na "${(Array.isArray(structuredQuery.keywords) && structuredQuery.keywords.length > 0 ? structuredQuery.keywords.join(', ') : '') || structuredQuery.category || 'ulichoomba'}" kwenye Gulio la Ufugaji Update kwa sasa. Unaweza kutafuta bidhaa nyingine au kuangalia tena baadaye.`,
      explanationSwahili: 'Hakuna matokeo yaliyopatikana Gulioni kwa ombi hili.',
      safetyNotice: 'Ukweli wa kibiashara: Hakuna bidhaa iliyobuniwa.',
      observability: {
        serviceCalled: 'getMarketplaceIntelligenceForAI',
        totalProductsExamined: marketplaceProducts.length,
        totalShopsExamined: publishedShops.length,
        computationDurationMs: Date.now() - startMs
      }
    };
  }

  const products: ProductRecommendationItem[] = rawRecommendationResult.products || [];
  const shops: ShopRecommendationItem[] = rawRecommendationResult.shops || [];
  const totalProductsMatched = products.length;
  const totalShopsMatched = shops.length;

  const verifiedSellerCount = products.filter((p) => p.sellerVerified).length;
  const inStockCount = products.filter((p) => p.inStock).length;

  // 3. Data Sufficiency Evaluation
  let dataSufficiency: MarketplaceDataSufficiency = 'NO_MATCHES';
  if (totalProductsMatched > 0 || totalShopsMatched > 0) {
    const hasExact = products.some((p) => p.matchType === 'exact') || shops.some((s) => s.matchType === 'exact');
    dataSufficiency = hasExact ? 'EXACT_MATCHES' : 'RELATED_MATCHES';
  } else if (marketplaceProducts.length === 0) {
    dataSufficiency = 'INSUFFICIENT_DATA';
  }

  // 4. Zero-Hallucination Deterministic Answer Construction
  let deterministicAnswer = '';
  const keywordDisplay = (Array.isArray(structuredQuery.keywords) && structuredQuery.keywords.length > 0 ? structuredQuery.keywords.join(', ') : '') || structuredQuery.category || 'bidhaa uliyotafuta';

  if (totalProductsMatched === 0 && totalShopsMatched === 0) {
    deterministicAnswer =
      `Sijaona bidhaa wala duka linalouza "${keywordDisplay}" kwenye Gulio la Ufugaji Update kwa sasa.\n\n` +
      `Unaweza kuendelea kuangalia tena baadaye wafugaji na maduka wanapoongeza bidhaa mpya, ` +
      `au kutembelea moja kwa moja ukurasa wa **Gulio** kutazama bidhaa zote zilizopo.`;
  } else {
    const lines: string[] = [];
    if (structuredQuery.targetType === 'shop' && totalShopsMatched > 0) {
      lines.push(`Kwenye Gulio la Ufugaji Update, nimeona maduka yafuatayo yanayohusiana na "${keywordDisplay}":`);
      for (const shop of shops) {
        const verifiedTag = shop.sellerVerified ? ' (Muuzaji Aliyethibitishwa ✅)' : '';
        const loc = shop.location || 'Tanzania';
        lines.push(`• **${shop.shopName}**${verifiedTag}: Mahali: ${loc}.`);
        if (shop.description) {
          lines.push(`  *Maelezo:* ${shop.description}`);
        }
      }
    } else {
      const intro = dataSufficiency === 'EXACT_MATCHES'
        ? `Kwenye Gulio la Ufugaji Update, nimeona bidhaa halisi zifuatazo zinazohusiana na "${keywordDisplay}":`
        : `Sijaona bidhaa inayolingana kikamilifu na "${keywordDisplay}", lakini bidhaa hizi zilizopo Gulioni zinaweza kukusaidia:`;
      lines.push(intro);

      for (const item of products) {
        const signals = (item as any).trustSignals || resolveProductTrustSignals(item as any);
        const verifiedTag = signals.sellerVerification.isVerified ? ' (Muuzaji Aliyethibitishwa ✅)' : ' (Haijahakikiwa)';
        const priceText = signals.price.status === 'NOT_PROVIDED'
          ? 'Bei haijawekwa'
          : `TZS ${formatTzs(item.price)} kwa ${item.unit || 'kipimo'}${signals.price.isStale ? ' (Bei ya zamani >90d)' : ''}`;
        const stockStatus = signals.stock.status === 'IN_STOCK'
          ? `Ipo (Kiasi: ${signals.stock.quantity} ${item.unit || 'vipimo'})`
          : signals.stock.status === 'OUT_OF_STOCK'
          ? 'Hisa imekwisha (0 inapatikana)'
          : 'Hisa haijawekwa';
        const loc = signals.location.displayLocation;

        let line = `• **${item.title}**: ${priceText} | Muuzaji: ${item.sellerName}${verifiedTag} (${loc}) | Hali: ${stockStatus}`;
        if (signals.reputation.hasReviews && signals.reputation.averageRating !== null) {
          line += ` | Tathmini: ${signals.reputation.averageRating.toFixed(1)}★ (${signals.reputation.totalPublishedReviews} zilizochapishwa)`;
        }
        lines.push(line);
      }
    }

    const isTrustQuery = /\b(uaminifu|kuaminika|hakikiwa|thibitishwa|trust|tathmini|reviews|rating|usalama)\b/i.test(cleanQuestion);
    if (isTrustQuery && products.length > 0) {
      lines.push(`\n*Ilani ya Uaminifu:* Ishara za uthibitisho na tathmini zilizoorodheshwa ni ushahidi halisi wa taarifa maalum zilizothibitishwa Gulioni. Hazitoi dhamana ya asilimia 100.`);
    }

    lines.push(`\nUnaweza kubofya kadi ya bidhaa hapa chini kufungua taarifa kamili na kuwasiliana na muuzaji moja kwa moja kupitia Gulio.`);
    deterministicAnswer = lines.join('\n');
  }

  // 5. Commercial & Medical Safety Notice
  const safetyNotice =
    'Taarifa hizi zimetolewa moja kwa moja kutoka Gulio la Ufugaji Update. ' +
    'Msaidizi wa AI hawezi kulipa wala kukamilisha ununuzi kiotomatiki; makubaliano na malipo hufanyika moja kwa moja kati yako na muuzaji.';

  // 6. Direct Answer Eligibility Check
  // Inquiries asking directly about price, store location, or stock availability without needing
  // broad explanatory advice can use deterministic answers directly.
  const isDirectCommercialQuery =
    /\b(bei|inauzwa|zinauzwa|shingapi|kiasi gani|wapi nitapata|wapi naweza kupata|duka|maduka|zipo|ipo)\b/i.test(cleanQuestion) &&
    !/\b(kwanini|kwa nini|sababu|eleza|nieleze|jinsi ya|namna ya|ushauri|tathmini)\b/i.test(cleanQuestion);

  const isDeterministicEligible = Boolean(structuredQuery && isDirectCommercialQuery);

  return {
    detected: true,
    intent: structuredQuery.intent,
    confidence: structuredQuery.confidence,
    targetType: structuredQuery.targetType,
    queryKeywords: structuredQuery.keywords,
    queryCategory: structuredQuery.category,
    querySubcategory: structuredQuery.subcategory,
    queryLocation: structuredQuery.location,
    structuredQuery,
    status: rawRecommendationResult.status,
    dataSufficiency,
    totalProductsMatched,
    totalShopsMatched,
    verifiedSellerCount,
    inStockCount,
    products,
    shops,
    isDeterministicEligible,
    deterministicAnswer,
    explanationSwahili: rawRecommendationResult.explanation || 'Matokeo halisi ya utafutaji wa Gulio.',
    rawRecommendationResult,
    safetyNotice,
    observability: {
      serviceCalled: 'getMarketplaceIntelligenceForAI',
      totalProductsExamined: marketplaceProducts.length,
      totalShopsExamined: publishedShops.length,
      computationDurationMs: Date.now() - startMs
    }
  };
}

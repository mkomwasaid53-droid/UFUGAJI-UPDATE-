import { MarketplaceProduct, DigitalShop } from '../types/marketplace';
import { validateProductOwnership } from './productOwnershipService';
import {
  isProductMarketplaceEligible
} from './marketplaceGovernanceEnforcement';
import {
  checkSellerRestriction
} from './sellerGovernanceService';
import {
  StructuredMarketplaceQuery,
  AiMarketplaceRecommendationResult,
  ProductRecommendationItem,
  ShopRecommendationItem,
  LocationMatchType,
  RecommendationMatchType
} from '../types/marketplaceRecommendation';
import {
  resolveProductTrustSignals,
  resolveShopTrustSignals
} from './marketplaceTrustService';
import {
  StructuredVisualMarketplaceQuery,
  VisualProductMatchResult,
  MatchedMarketplaceProductItem
} from '../types/visualMarketplace';
import {
  extractConservativeVisualCharacteristics,
  scoreCandidateVisualMatch
} from './visualProductMatcher';
import {
  classifyMarketplaceIntent,
  buildStructuredMarketplaceQuery
} from '../utils/marketplaceIntentClassifier';

interface ScoredProduct {
  product: MarketplaceProduct;
  score: number;
  relevanceScore: number;
  matchType: RecommendationMatchType;
  locationMatch: LocationMatchType;
  relevanceReason: string;
}

interface ScoredShop {
  shop: DigitalShop;
  score: number;
  matchType: RecommendationMatchType;
  locationMatch: LocationMatchType;
  relevanceReason: string;
}

/**
 * Normalizes strings for matching
 */
function clean(str?: string): string {
  return (str || '').toLowerCase().trim();
}

/**
 * Checks location match hierarchy between product and farmer/query location
 */
function evaluateLocationMatch(
  itemRegion?: string,
  itemDistrict?: string,
  itemLocation?: string,
  targetLocation?: string
): { matchType: LocationMatchType; boost: number } {
  if (!targetLocation || !targetLocation.trim()) {
    return { matchType: 'unknown', boost: 0 };
  }

  const target = clean(targetLocation);
  const r = clean(itemRegion);
  const d = clean(itemDistrict);
  const l = clean(itemLocation);

  // 1. Same area/district
  if (d && (d === target || d.includes(target) || target.includes(d))) {
    return { matchType: 'same_area', boost: 100 };
  }

  // 2. Same region / primary location
  if (r && (r === target || r.includes(target) || target.includes(r))) {
    return { matchType: 'same_region', boost: 60 };
  }
  if (l && (l === target || l.includes(target) || target.includes(l))) {
    return { matchType: 'same_region', boost: 60 };
  }

  return { matchType: 'other', boost: 0 };
}

/**
 * Computes deterministic score for a product based on requirements
 */
function scoreProduct(
  product: MarketplaceProduct,
  query: StructuredMarketplaceQuery,
  farmerLocation?: string
): ScoredProduct | null {
  // V1.7G: Authoritative Governance Enforcement (Excludes REJECTED, HIDDEN, SUSPENDED, UNDER_REVIEW, inactive, restricted sellers)
  if (!isProductMarketplaceEligible(product)) {
    return null;
  }

  const title = clean(product.title);
  const desc = clean(product.description);
  const cat = clean(product.category);
  const subcat = clean(product.subcategory);
  const catalogue = clean(product.catalogueName);
  const livestockType = clean(product.livestockLink?.type);
  const livestockCat = clean(product.livestockLink?.category);

  let relevanceScore = 0;
  let matchedKeywordsCount = 0;

  // 1. RELEVANCE PRIORITY
  // Check category and subcategory matches
  if (query.category && cat.includes(clean(query.category))) {
    relevanceScore += 180;
  }
  if (query.subcategory && subcat.includes(clean(query.subcategory))) {
    relevanceScore += 220;
  }

  // Check keyword matches in title, subcat, desc, livestockLink
  for (const kw of query.keywords) {
    const k = clean(kw);
    if (!k || k.length < 2) continue;

    if (title === k) {
      relevanceScore += 300;
      matchedKeywordsCount++;
    } else if (title.includes(k)) {
      relevanceScore += 160;
      matchedKeywordsCount++;
    } else if (subcat.includes(k)) {
      relevanceScore += 120;
      matchedKeywordsCount++;
    } else if (livestockType.includes(k) || livestockCat.includes(k)) {
      relevanceScore += 100;
      matchedKeywordsCount++;
    } else if (catalogue.includes(k)) {
      relevanceScore += 80;
      matchedKeywordsCount++;
    } else if (desc.includes(k)) {
      relevanceScore += 40;
      matchedKeywordsCount++;
    }
  }

  // If equipment search, ensure equipment keywords match
  if (query.intent === 'EQUIPMENT_SEARCH') {
    if (cat.includes('vifaa') || subcat.includes('incubator') || title.includes('incubator') || title.includes('mashine')) {
      relevanceScore += 250;
    }
  }

  // Strict relevance filter: Must have meaningful match
  if (relevanceScore < 100 && matchedKeywordsCount === 0) {
    return null;
  }

  let totalScore = relevanceScore;

  // 2. VERIFIED SELLER PRIORITY
  // V1.6C: Derived strictly from authoritative ownership validation (Inconsistent ownership never gets verified boost)
  const ownership = validateProductOwnership(product);
  const isVerified = ownership.isValid && ownership.isSellerVerified;
  if (isVerified) {
    totalScore += 200;
  } else if (ownership.state === 'INCONSISTENT') {
    // Penalize inconsistent or hijacked records
    totalScore -= 100;
  }

  // 3. STOCK PRIORITY
  // Products that are in stock rank above out of stock
  const inStock = product.status === 'active' && (product.quantityAvailable || 0) > 0;
  if (inStock) {
    totalScore += 150;
  } else {
    // If out of stock, reduce priority
    totalScore -= 80;
  }

  // 4. LOCATION PRIORITY
  const targetLoc = query.location || farmerLocation;
  const locEval = evaluateLocationMatch(
    product.region,
    product.district,
    product.location,
    targetLoc
  );
  totalScore += locEval.boost;

  // 5. SELLER / SHOP COMPLETENESS
  if (product.shopId) totalScore += 20;
  if (product.sellerPhone) totalScore += 15;
  if (product.catalogueId) totalScore += 15;
  if (product.imageUrl || (product.images && product.images.length > 0)) totalScore += 10;
  if (product.video) totalScore += 10;

  // Determine matchType and relevanceReason
  const matchType: RecommendationMatchType = relevanceScore >= 250 ? 'exact' : 'related';

  let relevanceReason = 'Inaendana na ulichotafuta';
  if (locEval.matchType === 'same_area' || locEval.matchType === 'same_region') {
    relevanceReason = `Inapatikana katika eneo lako (${product.region || product.location})`;
  } else if (isVerified) {
    relevanceReason = 'Kutoka kwa muuzaji aliyehakikiwa';
  } else if (inStock) {
    relevanceReason = 'Ipo dukani sasa';
  }

  return {
    product,
    score: totalScore,
    relevanceScore,
    matchType,
    locationMatch: locEval.matchType,
    relevanceReason
  };
}

/**
 * Computes deterministic score for a shop
 */
function scoreShop(
  shop: DigitalShop,
  query: StructuredMarketplaceQuery,
  farmerLocation?: string,
  isVerified: boolean = false
): ScoredShop | null {
  if (!shop.isPublished) {
    return null;
  }
  // V1.7E: Check seller-level marketplace selling restriction
  if (shop.sellerId && checkSellerRestriction(shop.sellerId, 'MARKETPLACE_SELLING').isRestricted) {
    return null;
  }

  const name = clean(shop.shopName);
  const desc = clean(shop.description);
  const loc = clean(shop.location);
  const reg = clean(shop.region);
  const dist = clean(shop.district);

  let relevanceScore = 0;
  let matches = 0;

  for (const kw of query.keywords) {
    const k = clean(kw);
    if (!k || k.length < 2) continue;

    if (name.includes(k)) {
      relevanceScore += 250;
      matches++;
    } else if (desc.includes(k)) {
      relevanceScore += 100;
      matches++;
    } else if (loc.includes(k) || reg.includes(k) || dist.includes(k)) {
      relevanceScore += 80;
      matches++;
    }
  }

  // If query mentions "dawa" or "agrovet"
  if (query.keywords.some((k) => ['dawa', 'agrovet', 'vet', 'clinic'].includes(k))) {
    if (name.includes('vet') || name.includes('agrovet') || desc.includes('dawa') || desc.includes('agrovet')) {
      relevanceScore += 300;
      matches++;
    }
  }

  // Location evaluation
  const targetLoc = query.location || farmerLocation;
  const locEval = evaluateLocationMatch(shop.region, shop.district, shop.location, targetLoc);

  if (matches === 0 && locEval.matchType === 'other') {
    return null;
  }

  let totalScore = relevanceScore + locEval.boost;

  // Verified seller boost (authoritative only)
  if (isVerified) {
    totalScore += 200;
  }

  if (shop.phone) totalScore += 20;
  if (shop.whatsapp) totalScore += 15;
  if (shop.logoImage || shop.coverImage) totalScore += 15;

  const matchType: RecommendationMatchType = relevanceScore >= 200 ? 'exact' : 'related';
  let relevanceReason = 'Duka linalohusiana na unachotafuta';
  if (locEval.matchType === 'same_area' || locEval.matchType === 'same_region') {
    relevanceReason = `Duka lililopo eneo lako (${shop.region || shop.location})`;
  }

  return {
    shop,
    score: totalScore,
    matchType,
    locationMatch: locEval.matchType,
    relevanceReason
  };
}

/**
 * Main engine function: retrieves and ranks actual Marketplace recommendations
 */
export function getMarketplaceRecommendations(
  userText: string,
  allProducts: MarketplaceProduct[],
  allShops: DigitalShop[],
  farmerLocation?: string,
  sellerVerificationsMap?: Record<string, { status: string }>
): AiMarketplaceRecommendationResult | null {
  // Step 1: Understand Intent
  const intentResult = classifyMarketplaceIntent(userText, farmerLocation);

  // If no marketplace intent or low confidence, return null
  if (intentResult.intent === 'NO_MARKETPLACE_INTENT' || intentResult.confidence === 'LOW') {
    return null;
  }

  // Step 2: Create structured Marketplace query
  const query = buildStructuredMarketplaceQuery(intentResult);
  if (!query) return null;

  // Step 3 & 4: Query and Rank actual Marketplace data
  if (query.targetType === 'shop') {
    // Rank published shops
    const scoredShops: ScoredShop[] = [];

    for (const shop of allShops) {
      const isShopSellerVerified = Boolean(
        sellerVerificationsMap?.[shop.sellerId]?.status === 'VERIFIED' ||
        allProducts.some((p) => p.sellerId === shop.sellerId && p.sellerVerificationStatus === 'verified')
      );
      const scored = scoreShop(shop, query, farmerLocation, isShopSellerVerified);
      if (scored) {
        scoredShops.push(scored);
      }
    }

    scoredShops.sort((a, b) => b.score - a.score);

    // Limit to at most 3 shops
    const topShops = scoredShops.slice(0, 3);

    if (topShops.length === 0) {
      return {
        detected: true,
        intentType: query.intent,
        confidence: query.confidence,
        targetType: 'shop',
        queryKeywords: query.keywords,
        queryCategory: query.category,
        queryLocation: query.location,
        status: 'no_results',
        explanation: 'Sijaona duka linalolingana na ulichotafuta kwenye Gulio kwa sasa. Unaweza kuendelea kutafuta kwenye Gulio.',
        shops: [],
        products: []
      };
    }

    const shopItems: ShopRecommendationItem[] = topShops.map((s) => {
      const isVerified = Boolean(
        sellerVerificationsMap?.[s.shop.sellerId]?.status === 'VERIFIED' ||
        allProducts.some((p) => p.sellerId === s.shop.sellerId && p.sellerVerificationStatus === 'verified')
      );
      return {
        shopId: s.shop.shopId,
        sellerId: s.shop.sellerId,
        shopName: s.shop.shopName,
        description: s.shop.description,
        location: s.shop.location,
        region: s.shop.region,
        district: s.shop.district,
        phone: s.shop.phone,
        whatsapp: s.shop.whatsapp,
        isPublished: s.shop.isPublished,
        sellerVerified: isVerified,
        logoImage: s.shop.logoImage,
        coverImage: s.shop.coverImage,
        relevanceReason: s.relevanceReason,
        matchType: s.matchType,
        locationMatch: s.locationMatch,
        trustSignals: resolveShopTrustSignals(s.shop, isVerified ? ({ status: 'VERIFIED' } as any) : null)
      };
    });

    return {
      detected: true,
      intentType: query.intent,
      confidence: query.confidence,
      targetType: 'shop',
      queryKeywords: query.keywords,
      queryCategory: query.category,
      queryLocation: query.location,
      status: 'has_results',
      explanation: 'Kwa maduka yanayohusiana na unachotafuta, unaweza kuangalia haya kwenye Gulio:',
      shops: shopItems,
      products: []
    };
  }

  // Query and Rank products
  const scoredProducts: ScoredProduct[] = [];

  for (const product of allProducts) {
    const scored = scoreProduct(product, query, farmerLocation);
    if (scored) {
      scoredProducts.push(scored);
    }
  }

  // Sort by total score descending
  scoredProducts.sort((a, b) => b.score - a.score);

  // Result limit: Up to 3 highly relevant products
  const topProducts = scoredProducts.slice(0, 3);

  if (topProducts.length === 0) {
    return {
      detected: true,
      intentType: query.intent,
      confidence: query.confidence,
      targetType: 'product',
      queryKeywords: query.keywords,
      queryCategory: query.category,
      queryLocation: query.location,
      status: 'no_results',
      explanation: 'Sijaona bidhaa inayolingana na ulichotafuta kwenye Gulio kwa sasa. Unaweza kuendelea kutafuta kwenye Gulio.',
      products: []
    };
  }

  const isExact = topProducts[0].matchType === 'exact';
  const explanation = isExact
    ? 'Kwa bidhaa zinazohusiana na unachotafuta, unaweza kuangalia hizi kwenye Gulio:'
    : 'Bidhaa hizi zinaweza kuwa zinazohusiana na ulichotafuta kwenye Gulio:';

  const productItems: ProductRecommendationItem[] = topProducts.map((sp) => {
    const p = sp.product;
    const primaryImg = p.imageUrl || (p.images && p.images.length > 0 ? p.images[0].url : undefined);

    return {
      productId: p.productId,
      title: p.title,
      price: p.price,
      currency: p.currency || 'Tsh',
      unit: p.unit,
      location: p.location,
      region: p.region,
      district: p.district,
      sellerId: p.sellerId,
      sellerName: p.sellerName,
      sellerBusinessName: p.sellerBusinessName,
      sellerVerified: p.sellerVerificationStatus === 'verified',
      inStock: p.status === 'active' && (p.quantityAvailable || 0) > 0,
      quantityAvailable: p.quantityAvailable || 0,
      imageUrl: primaryImg,
      hasVideo: Boolean(p.video?.url),
      videoDurationSeconds: p.video?.durationSeconds,
      relevanceReason: sp.relevanceReason,
      matchType: sp.matchType,
      locationMatch: sp.locationMatch,
      shopId: p.shopId,
      catalogueId: p.catalogueId,
      catalogueName: p.catalogueName,
      trustSignals: resolveProductTrustSignals(p)
    };
  });

  return {
    detected: true,
    intentType: query.intent,
    confidence: query.confidence,
    targetType: 'product',
    queryKeywords: query.keywords,
    queryCategory: query.category,
    queryLocation: query.location,
    status: 'has_results',
    explanation,
    products: productItems
  };
}

/**
 * V1.5D — Executes deterministic product retrieval and ranking for a StructuredMarketplaceQuery.
 * Reuses the authoritative V1.5C scoring and ranking engine.
 */
export function executeStructuredMarketplaceProductQuery(
  query: StructuredMarketplaceQuery,
  allProducts: MarketplaceProduct[],
  farmerLocation?: string,
  maxResults: number = 6
): ProductRecommendationItem[] {
  const scoredProducts: ScoredProduct[] = [];

  for (const product of allProducts) {
    // Budget filter if explicitly provided by user
    if (query.budget) {
      const maxBudget = typeof query.budget === 'number' ? query.budget : query.budget.max;
      const minBudget = typeof query.budget === 'object' ? query.budget.min : null;
      if (typeof product.price === 'number') {
        if (maxBudget !== undefined && maxBudget !== null && product.price > maxBudget) continue;
        if (minBudget !== undefined && minBudget !== null && product.price < minBudget) continue;
      }
    }

    const scored = scoreProduct(product, query, farmerLocation);
    if (scored) {
      scoredProducts.push(scored);
    }
  }

  scoredProducts.sort((a, b) => b.score - a.score);
  const topProducts = scoredProducts.slice(0, maxResults);

  return topProducts.map((sp) => {
    const p = sp.product;
    const primaryImg = p.imageUrl || (p.images && p.images.length > 0 ? p.images[0].url : undefined);

    return {
      productId: p.productId,
      title: p.title,
      price: p.price,
      currency: p.currency || 'Tsh',
      unit: p.unit,
      location: p.location,
      region: p.region,
      district: p.district,
      sellerId: p.sellerId,
      sellerName: p.sellerName,
      sellerBusinessName: p.sellerBusinessName,
      sellerVerified: p.sellerVerificationStatus === 'verified',
      inStock: p.status === 'active' && (p.quantityAvailable || 0) > 0,
      quantityAvailable: p.quantityAvailable || 0,
      imageUrl: primaryImg,
      hasVideo: Boolean(p.video?.url),
      videoDurationSeconds: p.video?.durationSeconds,
      relevanceReason: sp.relevanceReason,
      matchType: sp.matchType,
      locationMatch: sp.locationMatch,
      shopId: p.shopId,
      catalogueId: p.catalogueId,
      catalogueName: p.catalogueName,
      trustSignals: resolveProductTrustSignals(p)
    };
  });
}

/**
 * V1.3B — IMAGE → MARKETPLACE QUERY RETRIEVAL
 *
 * Executes deterministic relevance search and ranking for a StructuredVisualMarketplaceQuery.
 * Strict rules:
 * - Section 19: Passes query through existing Marketplace ranking engine.
 * - Section 20: Validated fields only.
 * - Section 21: Product visibility (active, published only; no drafts/unpublished).
 * - Section 22: Small result set (up to 3 products).
 * - Section 23: Relevance priority (1. relevance, 2. verified seller, 3. stock, 4. location, 5. completeness).
 * - Section 25: Phrasing separates visual understanding from marketplace results.
 * - Section 26: Real products only — never fabricates listings.
 * - Section 27: Honest no-match handling if 0 products match.
 */
export function getVisualMarketplaceRecommendations(
  structuredQuery: StructuredVisualMarketplaceQuery,
  allProducts: MarketplaceProduct[],
  allShops: DigitalShop[] = [],
  farmerLocation?: string
): AiMarketplaceRecommendationResult {
  const targetLocation = structuredQuery.region || farmerLocation;
  const conceptClean = clean(structuredQuery.productConcept || '');
  const catClean = clean(structuredQuery.category || '');
  const subcatClean = clean(structuredQuery.subcategory || '');
  const livestockClean = clean(structuredQuery.livestockUse || '');

  // Extract core keywords from productConcept, attributes, and livestock
  const searchKeywords: string[] = [];
  if (conceptClean) {
    const tokens = conceptClean.split(/\s+/).filter((t) => t.length > 2 && !['ya', 'za', 'cha', 'vya', 'kwa', 'na', 'kama', 'hii', 'hiki'].includes(t));
    searchKeywords.push(...tokens);
  }
  for (const attr of structuredQuery.attributes) {
    const valClean = clean(attr.value);
    if (valClean.length > 2) {
      searchKeywords.push(valClean);
    }
  }
  if (livestockClean && !searchKeywords.includes(livestockClean)) {
    searchKeywords.push(livestockClean);
  }

  const scoredProducts: ScoredProduct[] = [];

  for (const product of allProducts) {
    // 1. Visibility & Governance Eligibility Filter (V1.7G: only authoritatively active and approved listings)
    if (!isProductMarketplaceEligible(product)) {
      continue;
    }

    // 2. Stock Preference (Section 13)
    const inStock = product.status === 'active' && (product.quantityAvailable || 0) > 0;
    if (structuredQuery.stockPreference === true && !inStock) {
      continue;
    }

    // 3. Price Preference Filter (Section 12: numeric bounds)
    const price = typeof product.price === 'number' ? product.price : null;
    if (price !== null) {
      if (structuredQuery.pricePreference.min !== null && price < structuredQuery.pricePreference.min) {
        continue;
      }
      if (structuredQuery.pricePreference.max !== null && price > structuredQuery.pricePreference.max) {
        continue;
      }
    }

    const title = clean(product.title);
    const desc = clean(product.description);
    const prodCat = clean(product.category);
    const prodSubcat = clean(product.subcategory);
    const prodLiveType = clean(product.livestockLink?.type);
    const prodLiveCat = clean(product.livestockLink?.category);

    let relevanceScore = 0;
    let matchedKeywordsCount = 0;

    // 4. RELEVANCE PRIORITY (Section 23 #1)
    // Canonical category match
    if (catClean && prodCat.includes(catClean)) {
      relevanceScore += 200;
    }
    // Subcategory match
    if (subcatClean && (prodSubcat.includes(subcatClean) || subcatClean.includes(prodSubcat))) {
      relevanceScore += 260;
    }

    // Concept direct matching in title
    if (conceptClean && title.includes(conceptClean)) {
      relevanceScore += 300;
      matchedKeywordsCount++;
    }

    // Search keywords matching
    for (const kw of searchKeywords) {
      if (!kw) continue;
      if (title.includes(kw)) {
        relevanceScore += 160;
        matchedKeywordsCount++;
      } else if (prodSubcat.includes(kw)) {
        relevanceScore += 120;
        matchedKeywordsCount++;
      } else if (prodLiveType.includes(kw) || prodLiveCat.includes(kw)) {
        relevanceScore += 100;
        matchedKeywordsCount++;
      } else if (desc.includes(kw)) {
        relevanceScore += 50;
        matchedKeywordsCount++;
      }
    }

    // Livestock use match
    if (livestockClean && (prodLiveType.includes(livestockClean) || title.includes(livestockClean) || desc.includes(livestockClean))) {
      relevanceScore += 120;
    }

    // Strict relevance threshold: Must have genuine relevance to visual concept/category
    if (relevanceScore < 120 && matchedKeywordsCount === 0) {
      continue;
    }

    let totalScore = relevanceScore;

    // 5. VERIFIED SELLER PRIORITY (Section 23 #2)
    const isVerified = product.sellerVerificationStatus === 'verified';
    if (isVerified) {
      totalScore += 200;
    }

    // 6. STOCK PRIORITY (Section 23 #3)
    if (inStock) {
      totalScore += 150;
    } else {
      totalScore -= 70;
    }

    // 7. LOCATION PRIORITY (Section 23 #4: targetLocation from user text or farmer context)
    const locEval = evaluateLocationMatch(
      product.region,
      product.district,
      product.location,
      targetLocation || undefined
    );
    totalScore += locEval.boost;

    // 8. COMPLETENESS (Section 23 #5)
    if (product.shopId) totalScore += 20;
    if (product.sellerPhone) totalScore += 15;
    if (product.catalogueId) totalScore += 15;
    if (product.imageUrl || (product.images && product.images.length > 0)) totalScore += 10;
    if (product.video) totalScore += 10;

    const matchType: RecommendationMatchType = relevanceScore >= 250 ? 'exact' : 'related';

    let relevanceReason = 'Inaendana na ulichotafuta';
    if (locEval.matchType === 'same_area' || locEval.matchType === 'same_region') {
      relevanceReason = `Inapatikana katika eneo lako (${product.region || product.location})`;
    } else if (isVerified) {
      relevanceReason = 'Kutoka kwa muuzaji aliyehakikiwa';
    } else if (inStock) {
      relevanceReason = 'Ipo dukani sasa';
    }

    scoredProducts.push({
      product,
      score: totalScore,
      relevanceScore,
      matchType,
      locationMatch: locEval.matchType,
      relevanceReason
    });
  }

  // Sort by total score descending
  scoredProducts.sort((a, b) => b.score - a.score);

  // Result Limit (Section 22: conservative small result set, up to 3 products)
  const topProducts = scoredProducts.slice(0, 3);

  // Confidence mapping
  const confidence: 'HIGH' | 'MEDIUM' | 'LOW' =
    structuredQuery.visualConfidence === 'UNCERTAIN' ? 'LOW' : structuredQuery.visualConfidence;

  // No-match handling (Section 27: honest no-match, no fake alternatives)
  if (topProducts.length === 0) {
    const noMatchResult: VisualProductMatchResult = {
      status: 'no_match',
      confidence,
      matchCount: 0,
      topMatchTier: 'NO_RELIABLE_MATCH',
      headlineExplanation: 'Hatukupata bidhaa inayofanana vya kutosha na picha/video yako.',
      userGuidance: 'Hakuna bidhaa inayokaribiana kutosha na kigezo cha picha kwenye Gulio.',
      results: [],
      structuredQuery,
      isFallback: false
    };

    return {
      detected: true,
      intentType: structuredQuery.intentType,
      confidence,
      targetType: 'product',
      queryKeywords: searchKeywords,
      queryCategory: structuredQuery.category || undefined,
      queryLocation: structuredQuery.region || undefined,
      status: 'no_results',
      explanation: 'Hatukupata bidhaa inayofanana vya kutosha na picha/video yako.',
      products: [],
      shops: [],
      visualMatchResult: noMatchResult
    };
  }

  // Section 12 & 25 Phrasing: Cautious wording, never claim "Hii ndiyo bidhaa hiyo"
  const characteristics = extractConservativeVisualCharacteristics({
    source: structuredQuery.source,
    structuredQuery,
    userText: structuredQuery.productConcept || undefined,
    farmerLocation
  });

  const productItems: ProductRecommendationItem[] = topProducts.map((sp) => {
    const p = sp.product;
    const primaryImg = p.imageUrl || (p.images && p.images.length > 0 ? p.images[0].url : undefined);
    const vMatch = scoreCandidateVisualMatch(p, characteristics, structuredQuery);

    return {
      productId: p.productId,
      title: p.title,
      price: p.price,
      currency: p.currency || 'Tsh',
      unit: p.unit,
      location: p.location,
      region: p.region,
      district: p.district,
      sellerId: p.sellerId,
      sellerName: p.sellerName,
      sellerBusinessName: p.sellerBusinessName,
      sellerVerified: p.sellerVerificationStatus === 'verified',
      inStock: p.status === 'active' && (p.quantityAvailable || 0) > 0,
      quantityAvailable: p.quantityAvailable || 0,
      imageUrl: primaryImg,
      hasVideo: Boolean(p.video?.url),
      videoDurationSeconds: p.video?.durationSeconds,
      relevanceReason: vMatch.reasons[0] || sp.relevanceReason,
      matchType: sp.matchType,
      locationMatch: sp.locationMatch,
      shopId: p.shopId,
      catalogueId: p.catalogueId,
      catalogueName: p.catalogueName,
      visualMatch: vMatch,
      visualMatchConfidence: vMatch.confidence,
      visualMatchExplanation: vMatch.explanation,
      isSemanticOnly: vMatch.visualSimilarityScore === undefined,
      trustSignals: resolveProductTrustSignals(p)
    };
  });

  const allSemantic = productItems.every((item) => item.isSemanticOnly);
  const isPoorQuality = characteristics.quality !== 'clear';
  let explanation = structuredQuery.source === 'video'
    ? 'Bidhaa inayokaribiana zaidi na kifaa kwenye video yako kwenye Gulio:'
    : 'Bidhaa inayokaribiana zaidi na picha yako kwenye Gulio:';

  if (isPoorQuality) {
    explanation = 'Picha/video haitoshi kufanya visual matching ya kuaminika. Hapa kuna bidhaa zinazohusiana kulingana na maelezo:';
  } else if (allSemantic) {
    explanation = 'Hatukuweza kuthibitisha ufanano wa picha (bidhaa hazina picha), lakini tumepata bidhaa zinazohusiana:';
  }

  const matchedItems: MatchedMarketplaceProductItem[] = productItems.map((pi) => ({
    productId: pi.productId,
    title: pi.title,
    price: pi.price,
    currency: pi.currency,
    unit: pi.unit,
    location: pi.location,
    region: pi.region,
    district: pi.district,
    sellerId: pi.sellerId,
    sellerName: pi.sellerName,
    sellerBusinessName: pi.sellerBusinessName,
    sellerVerified: pi.sellerVerified,
    inStock: pi.inStock,
    quantityAvailable: pi.quantityAvailable,
    imageUrl: pi.imageUrl,
    hasProductImage: Boolean(pi.imageUrl),
    hasVideo: pi.hasVideo,
    videoDurationSeconds: pi.videoDurationSeconds,
    relevanceReason: pi.relevanceReason,
    shopId: pi.shopId,
    catalogueId: pi.catalogueId,
    catalogueName: pi.catalogueName,
    visualMatchScore: pi.visualMatch!,
    matchTier: pi.visualMatch!.matchTier,
    visualMatchConfidence: pi.visualMatchConfidence || 'MEDIUM',
    visualMatchExplanation: pi.visualMatchExplanation || '',
    isSemanticOnly: pi.isSemanticOnly || false,
    trustSignals: pi.trustSignals
  }));

  const visualMatchResult: VisualProductMatchResult = {
    status: isPoorQuality ? 'poor_visual_evidence' : (allSemantic ? 'semantic_only' : 'matched'),
    confidence,
    matchCount: matchedItems.length,
    topMatchTier: matchedItems[0]?.matchTier || 'RELATED_PRODUCT',
    headlineExplanation: explanation,
    userGuidance: isPoorQuality
      ? 'Tuma picha iliyo wazi zaidi au eleza bidhaa unayotafuta.'
      : 'Unaweza kuboresha utafutaji kwa kubadilisha eneo au bajeti.',
    results: matchedItems,
    structuredQuery,
    isFallback: false
  };

  return {
    detected: true,
    intentType: structuredQuery.intentType,
    confidence,
    targetType: 'product',
    queryKeywords: searchKeywords,
    queryCategory: structuredQuery.category || undefined,
    queryLocation: structuredQuery.region || undefined,
    status: 'has_results',
    explanation,
    products: productItems,
    shops: [],
    visualMatchResult
  };
}


/**
 * V1.5D — MY ASSISTANT -> MARKETPLACE ADAPTER
 * Phase 4: The Intelligent Loop
 *
 * Provides a thin, controlled integration layer between My Assistant
 * farmer intelligence and the authoritative Gulio Marketplace retrieval engine.
 *
 * Core Principles:
 * 1. "My Assistant knows the farmer's recorded livestock context and intelligence.
 *     Marketplace knows actual products, prices, sellers, stock, and commercial information."
 * 2. "Contextual discovery is NOT explicit purchase intent."
 * 3. "Medical-related intelligence (treatments, vaccinations, mortality, disease)
 *     MUST NEVER automatically trigger marketplace medicine recommendations."
 * 4. "Explicit user criteria always override contextual assumptions."
 * 5. "Do not invent unsupported fields (budget, quantities, specifications)."
 * 6. "Private farmer data is never exposed to marketplace sellers."
 */

import { MarketplaceProduct } from '../types/marketplace';
import { filterMarketplaceEligibleProducts } from './marketplaceGovernanceEnforcement';
import {
  StructuredMarketplaceQuery,
  ProductRecommendationItem
} from '../types/marketplaceRecommendation';
import {
  MyAssistantMarketplaceContext,
  ContextualMarketplaceOpportunity,
  MyAssistantMarketplaceQueryResult,
  MyAssistantIntelligenceType
} from '../types/myAssistantMarketplace';
import { executeStructuredMarketplaceProductQuery } from './marketplaceRecommendationService';

/**
 * Normalizes livestock category / type to canonical Gulio Marketplace categories and keywords
 */
export function mapLivestockToMarketplaceCategory(livestockType?: string, livestockCategory?: string): {
  canonicalCategory?: string;
  relatedCategories: string[];
  defaultKeywords: string[];
  swahiliLabel: string;
} {
  const normType = (livestockType || '').toLowerCase().trim();
  const normCat = (livestockCategory || '').toLowerCase().trim();

  // Poultry / Kuku
  if (
    normCat.includes('poultry') ||
    normType.includes('kuku') ||
    normType.includes('broiler') ||
    normType.includes('layers') ||
    normType.includes('sasso') ||
    normType.includes('kuroiler') ||
    normType.includes('kuchi') ||
    normType.includes('bata') ||
    normType.includes('kanga')
  ) {
    return {
      canonicalCategory: 'Kuku',
      relatedCategories: ['Chakula cha Mifugo', 'Vifaa vya Ufugaji', 'Vifaranga'],
      defaultKeywords: ['kuku'],
      swahiliLabel: 'Kuku'
    };
  }

  // Cattle / Ng'ombe
  if (
    normCat.includes('cattle') ||
    normType.includes("ng'ombe") ||
    normType.includes('ngombe') ||
    normType.includes('friesian') ||
    normType.includes('ayrshire') ||
    normType.includes('boran') ||
    normType.includes('zebu')
  ) {
    return {
      canonicalCategory: "Ng'ombe",
      relatedCategories: ['Chakula cha Mifugo', 'Vifaa vya Ufugaji'],
      defaultKeywords: ["ng'ombe"],
      swahiliLabel: "Ng'ombe"
    };
  }

  // Goats / Mbuzi
  if (
    normCat.includes('goat') ||
    normType.includes('mbuzi') ||
    normType.includes('boer') ||
    normType.includes('saanen') ||
    normType.includes('galla') ||
    normType.includes('toggenburg')
  ) {
    return {
      canonicalCategory: 'Mbuzi',
      relatedCategories: ['Chakula cha Mifugo', 'Vifaa vya Ufugaji'],
      defaultKeywords: ['mbuzi'],
      swahiliLabel: 'Mbuzi'
    };
  }

  // Sheep / Kondoo
  if (
    normCat.includes('sheep') ||
    normType.includes('kondoo') ||
    normType.includes('dorper') ||
    normType.includes('maasai')
  ) {
    return {
      canonicalCategory: 'Mbuzi', // Gulio groups 'Mbuzi & Kondoo'
      relatedCategories: ['Chakula cha Mifugo', 'Vifaa vya Ufugaji'],
      defaultKeywords: ['kondoo'],
      swahiliLabel: 'Kondoo'
    };
  }

  // Pigs / Nguruwe
  if (
    normCat.includes('pig') ||
    normType.includes('nguruwe') ||
    normType.includes('landrace') ||
    normType.includes('duroc')
  ) {
    return {
      canonicalCategory: 'Nguruwe',
      relatedCategories: ['Chakula cha Mifugo', 'Vifaa vya Ufugaji'],
      defaultKeywords: ['nguruwe'],
      swahiliLabel: 'Nguruwe'
    };
  }

  // Rabbits / Sungura
  if (
    normCat.includes('rabbit') ||
    normType.includes('sungura')
  ) {
    return {
      canonicalCategory: 'Sungura',
      relatedCategories: ['Chakula cha Mifugo', 'Vifaa vya Ufugaji'],
      defaultKeywords: ['sungura'],
      swahiliLabel: 'Sungura'
    };
  }

  // Fish / Samaki
  if (
    normCat.includes('fish') ||
    normType.includes('samaki') ||
    normType.includes('sato') ||
    normType.includes('kambale')
  ) {
    return {
      canonicalCategory: 'Samaki',
      relatedCategories: ['Chakula cha Mifugo', 'Vifaa vya Ufugaji'],
      defaultKeywords: ['samaki'],
      swahiliLabel: 'Samaki'
    };
  }

  // Fallback for general livestock
  return {
    canonicalCategory: 'Chakula cha Mifugo',
    relatedCategories: ['Vifaa vya Ufugaji'],
    defaultKeywords: normType ? [normType] : ['mifugo'],
    swahiliLabel: livestockType || 'Mifugo'
  };
}

/**
 * Section 19: Strict Medical Safety Protection Check.
 * Medical-related My Assistant intelligence (vaccinations, treatments,
 * mortality patterns, disease notes) MUST NEVER automatically trigger
 * commercial medicine or drug product recommendations.
 */
export function isMedicalOrHealthIntelligence(
  intelligenceType?: MyAssistantIntelligenceType,
  activityType?: string,
  notesOrTitle?: string
): boolean {
  const combined = `${activityType || ''} ${notesOrTitle || ''}`.toLowerCase();
  const medicalKeywords = [
    'treatment',
    'tiba',
    'matibabu',
    'chanjo',
    'vaccin',
    'vifo',
    'mortality',
    'kifo',
    'ugonjwa',
    'disease',
    'dawa',
    'antibiotic',
    'kuhara',
    'homa',
    'mdondo',
    'newcastle'
  ];

  return medicalKeywords.some((kw) => combined.includes(kw));
}

/**
 * Section 8 & 24: Detects whether a valid, meaningful, non-random
 * Marketplace discovery opportunity exists from My Assistant intelligence.
 */
export function detectMarketplaceOpportunity(
  intelligence: {
    intelligenceType: MyAssistantIntelligenceType;
    livestockType?: string;
    livestockCategory?: string;
    currentQuantity?: number;
    activitySummary?: string;
    periodLabel?: string;
    isHealthOrMedical?: boolean;
  }
): ContextualMarketplaceOpportunity {
  const {
    intelligenceType,
    livestockType = 'Mifugo',
    livestockCategory,
    currentQuantity,
    activitySummary = '',
    isHealthOrMedical = false
  } = intelligence;

  // SECTION 19: Strict Medical Protection Check
  if (
    isHealthOrMedical ||
    isMedicalOrHealthIntelligence(intelligenceType, activitySummary)
  ) {
    return {
      hasOpportunity: false,
      reason: 'Kumbukumbu za matibabu, chanjo, au vifo zinalindwa; hazitengenezi mapendekezo ya kibiashara ya dawa.',
      livestockType,
      livestockCategory: livestockCategory || '',
      suggestedActionLabel: '',
      suggestedKeywords: [],
      isMedicalProtected: true,
      sourceIntelligenceType: intelligenceType
    };
  }

  const mapping = mapLivestockToMarketplaceCategory(livestockType, livestockCategory);

  // If no livestock type could be determined or general empty context, no opportunity
  if (!livestockType || livestockType.toLowerCase() === 'mifugo yote' || livestockType.toLowerCase() === 'nyingine') {
    return {
      hasOpportunity: false,
      reason: 'Hakuna aina mahususi ya mifugo iliyobainishwa kwa ugunduzi wa bidhaa.',
      livestockType,
      livestockCategory: livestockCategory || '',
      suggestedActionLabel: '',
      suggestedKeywords: [],
      isMedicalProtected: false,
      sourceIntelligenceType: intelligenceType
    };
  }

  // Formulate traceable reason and action label based on intelligence type
  let reason = '';
  let suggestedActionLabel = `Angalia bidhaa za ${mapping.swahiliLabel}`;

  switch (intelligenceType) {
    case 'LIVESTOCK_COUNT':
      reason = currentQuantity
        ? `Una ${mapping.swahiliLabel} ${currentQuantity} kwenye kumbukumbu zako za Msaidizi Wangu.`
        : `Una kumbukumbu za ${mapping.swahiliLabel} kwenye Msaidizi Wangu.`;
      suggestedActionLabel = `Angalia bidhaa za ${mapping.swahiliLabel}`;
      break;

    case 'LIVESTOCK_ADDITION':
      reason = `Umeongeza ${mapping.swahiliLabel} katika kipindi cha hivi karibuni.`;
      suggestedActionLabel = `Angalia vifaa na malisho ya ${mapping.swahiliLabel}`;
      break;

    case 'LIVESTOCK_TREND':
      reason = `Mwenendo wa ${mapping.swahiliLabel} unaonyesha shughuli hai kwenye shamba lako.`;
      suggestedActionLabel = `Angalia bidhaa za ${mapping.swahiliLabel}`;
      break;

    case 'ACTIVITY_SUMMARY':
      reason = `Umerekodi shughuli za ufugaji wa ${mapping.swahiliLabel}.`;
      suggestedActionLabel = `Angalia bidhaa za ${mapping.swahiliLabel}`;
      break;

    case 'OBSERVATION_INSIGHT':
      reason = `Kumbukumbu zako za ${mapping.swahiliLabel} zinaonyesha ukuaji wa kundi.`;
      suggestedActionLabel = `Angalia bidhaa zinazohusiana`;
      break;

    case 'FARM_OVERVIEW':
    default:
      reason = `Muktadha wa ufugaji wa ${mapping.swahiliLabel} kwenye shamba lako.`;
      suggestedActionLabel = `Angalia bidhaa za ${mapping.swahiliLabel}`;
      break;
  }

  return {
    hasOpportunity: true,
    reason,
    livestockType: mapping.swahiliLabel,
    livestockCategory: mapping.canonicalCategory || livestockCategory || 'Mifugo',
    suggestedActionLabel,
    suggestedKeywords: mapping.defaultKeywords,
    suggestedCategory: mapping.canonicalCategory,
    isMedicalProtected: false,
    sourceIntelligenceType: intelligenceType
  };
}

/**
 * Section 9 & 15: Builds a Structured Marketplace Query from My Assistant context,
 * strictly enforcing that explicit user criteria OVERRIDE context.
 */
export function buildStructuredMarketplaceQueryFromMyAssistant(
  context: MyAssistantMarketplaceContext
): StructuredMarketplaceQuery {
  const {
    livestockType,
    livestockCategory,
    farmerLocationIfAppropriate,
    explicitUserCriteria
  } = context;

  const mapping = mapLivestockToMarketplaceCategory(livestockType, livestockCategory);

  // Section 15: Priority Rule: Explicit User Criteria OVERRIDE Context!
  const hasExplicitSearch = Boolean(explicitUserCriteria?.searchQuery?.trim());
  const hasExplicitCategory = Boolean(explicitUserCriteria?.category?.trim());
  const hasExplicitLocation = Boolean(explicitUserCriteria?.location?.trim());
  const hasExplicitLivestock = Boolean(explicitUserCriteria?.livestockType?.trim());
  const explicitMaxPrice = explicitUserCriteria?.maxPrice;

  // Determine effective category
  const effectiveCategory = hasExplicitCategory
    ? explicitUserCriteria!.category
    : mapping.canonicalCategory;

  // Determine effective keywords
  let keywords: string[] = [];
  if (hasExplicitSearch) {
    keywords = explicitUserCriteria!.searchQuery!
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 1);
  } else if (hasExplicitLivestock) {
    keywords = [explicitUserCriteria!.livestockType!.toLowerCase()];
  } else {
    keywords = [...mapping.defaultKeywords];
  }

  // Determine effective location
  const effectiveLocation = hasExplicitLocation
    ? explicitUserCriteria!.location
    : farmerLocationIfAppropriate;

  // Build structured query according to Section 9
  // DO NOT invent budget, quantity, brand, specifications if not explicitly specified.
  const query: StructuredMarketplaceQuery = {
    source: 'MY_ASSISTANT',
    intent: 'PRODUCT_SEARCH',
    confidence: 'HIGH',
    targetType: 'product',
    category: effectiveCategory,
    livestockType: hasExplicitLivestock ? explicitUserCriteria!.livestockType : mapping.swahiliLabel,
    keywords,
    location: effectiveLocation,
    budget: explicitMaxPrice ? { max: explicitMaxPrice } : undefined,
    requiresStock: true
  };

  return query;
}

/**
 * Section 12, 26, 27, 28: Executes real Marketplace retrieval and ranking
 * for My Assistant-originated discovery.
 */
export function executeMyAssistantMarketplaceDiscovery(
  context: MyAssistantMarketplaceContext,
  allProducts: MarketplaceProduct[] = []
): MyAssistantMarketplaceQueryResult {
  const mapping = mapLivestockToMarketplaceCategory(context.livestockType, context.livestockCategory);
  const structuredQuery = buildStructuredMarketplaceQueryFromMyAssistant(context);

  const isRefined = Boolean(
    context.explicitUserCriteria?.searchQuery ||
    context.explicitUserCriteria?.category ||
    context.explicitUserCriteria?.location ||
    context.explicitUserCriteria?.maxPrice
  );

  let refinementSummary = '';
  if (isRefined) {
    const parts: string[] = [];
    if (context.explicitUserCriteria?.searchQuery) parts.push(`Utafutaji: "${context.explicitUserCriteria.searchQuery}"`);
    if (context.explicitUserCriteria?.category) parts.push(`Kundi: ${context.explicitUserCriteria.category}`);
    if (context.explicitUserCriteria?.location) parts.push(`Eneo: ${context.explicitUserCriteria.location}`);
    if (context.explicitUserCriteria?.maxPrice) parts.push(`Bajeti: hadi TSh ${context.explicitUserCriteria.maxPrice.toLocaleString()}`);
    refinementSummary = parts.join(' | ');
  }

  const contextualLabel = isRefined
    ? `Imeboreshwa kulingana na vigezo ulivyochagua (${refinementSummary})`
    : `Imebainishwa kulingana na rekodi zako za ${mapping.swahiliLabel} kwenye Msaidizi Wangu. Hii ni fursa ya ugunduzi, si makisio ya ununuzi.`;

  // Traceable reason (Section 24)
  const traceableReason = {
    source: 'MY_ASSISTANT' as const,
    intelligenceType: context.relevantIntelligenceType || 'FARM_OVERVIEW',
    livestockType: mapping.swahiliLabel,
    category: structuredQuery.category,
    reason: isRefined
      ? `Utafutaji uliowekwa wazi na mfugaji (${refinementSummary}).`
      : `Muktadha wa ${mapping.swahiliLabel} uliotokana na rekodi zako rasmi za Msaidizi Wangu.`
  };

  // Error simulation / validation handling (Section 28)
  if (!allProducts || !Array.isArray(allProducts)) {
    return {
      source: 'MY_ASSISTANT',
      context,
      structuredQuery,
      status: 'error',
      products: [],
      totalMatched: 0,
      explanationSwahili: 'Marketplace haikupatikana kwa sasa, hivyo siwezi kuthibitisha bidhaa zinazopatikana.',
      contextualLabel,
      isRefinedByFarmer: isRefined,
      refinementSummary,
      traceableReason
    };
  }

  // Real retrieval & ranking through V1.5C engine (Section 6, 26)
  // Authoritative Governance: strictly filter out ineligible listings before query execution
  const eligibleProducts = filterMarketplaceEligibleProducts(allProducts);
  let matchedProducts: ProductRecommendationItem[] = [];
  try {
    matchedProducts = executeStructuredMarketplaceProductQuery(
      structuredQuery,
      eligibleProducts,
      context.farmerLocationIfAppropriate,
      6
    );
  } catch (err) {
    console.error('[V1.5D Adapter] Retrieval error:', err);
    return {
      source: 'MY_ASSISTANT',
      context,
      structuredQuery,
      status: 'error',
      products: [],
      totalMatched: 0,
      explanationSwahili: 'Marketplace haikupatikana kwa sasa, hivyo siwezi kuthibitisha bidhaa zinazopatikana.',
      contextualLabel,
      isRefinedByFarmer: isRefined,
      refinementSummary,
      traceableReason
    };
  }

  // No-result handling (Section 27)
  if (matchedProducts.length === 0) {
    return {
      source: 'MY_ASSISTANT',
      context,
      structuredQuery,
      status: 'no_results',
      products: [],
      totalMatched: 0,
      explanationSwahili: 'Sijaona bidhaa zinazolingana na muktadha huo kwenye Marketplace kwa sasa. Unaweza kuboresha au kubadilisha vigezo vya utafutaji.',
      contextualLabel,
      isRefinedByFarmer: isRefined,
      refinementSummary,
      traceableReason
    };
  }

  // Successful retrieval
  const explanationSwahili = isRefined
    ? `Hizi ni bidhaa ${matchedProducts.length} zilizothibitishwa sokoni kulingana na vigezo vyako:`
    : `Kutokana na ufugaji wako wa ${mapping.swahiliLabel}, hizi ni baadhi ya bidhaa halisi zilizopo Gulio:`;

  return {
    source: 'MY_ASSISTANT',
    context,
    structuredQuery,
    status: 'has_results',
    products: matchedProducts,
    totalMatched: matchedProducts.length,
    explanationSwahili,
    contextualLabel,
    isRefinedByFarmer: isRefined,
    refinementSummary,
    traceableReason
  };
}

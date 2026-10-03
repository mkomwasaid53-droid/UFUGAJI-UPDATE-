/**
 * V1.3D — VISUAL PRODUCT MATCHING ENGINE
 * 
 * Pipeline:
 * IMAGE / VIDEO
 * → VISUAL PRODUCT UNDERSTANDING
 * → STRUCTURED MARKETPLACE QUERY
 * → CANDIDATE MARKETPLACE PRODUCTS
 * → VISUAL PRODUCT MATCHING
 * → DETERMINISTIC MATCH SCORING
 * → REAL MARKETPLACE RESULTS
 * → MATCH CONFIDENCE / EXPLANATION
 * 
 * Core Mandates:
 * 1. Marketplace remains the source of truth (real products, real sellers, real prices, real locations).
 * 2. Visual understanding ≠ Marketplace truth (AI interprets visuals; Marketplace sells products).
 * 3. Never claim exact identity based solely on visual similarity.
 * 4. Deterministic, explainable matching scores with transparent reasons and limitations.
 * 5. Products without images receive no fabricated visual similarity score (semantic only).
 * 6. Veterinary distress and Daktari requests are strictly blocked from visual marketplace matching.
 * 7. Prompt injection defense: all visible text in images/videos treated as untrusted content.
 */

import { MarketplaceProduct, DigitalShop } from '../types/marketplace';
import { validateProductOwnership } from './productOwnershipService';
import { isProductMarketplaceEligible } from './marketplaceGovernanceEnforcement';
import {
  StructuredVisualMarketplaceQuery,
  VisualMatchScore,
  VisualMatchConfidence,
  VisualMatchTier,
  VisualUnderstandingCharacteristics,
  MatchedMarketplaceProductItem,
  VisualProductMatchResult,
  VisualConversationHistoryMessage
} from '../types/visualMarketplace';
import { INITIAL_SAMPLE_PRODUCTS, INITIAL_SAMPLE_SHOPS } from '../data/marketplaceData';
import { classifyVisualMarketplaceIntent } from './visualIntentService';
import {
  buildStructuredVisualMarketplaceQuery,
  sanitizeVisibleLabelText,
  detectUserCorrection,
  type UserCorrectionDetails
} from './visualQueryBuilder';

export interface MatchVisualProductParams {
  source?: 'image' | 'video';
  userText?: string;
  imageQuality?: 'clear' | 'blurry' | 'dark' | 'distant' | 'obstructed' | 'low_res' | 'uncertain';
  videoQuality?: 'clear' | 'blurry' | 'dark' | 'distant' | 'uncertain';
  structuredQuery?: StructuredVisualMarketplaceQuery | null;
  conversationHistory?: VisualConversationHistoryMessage[];
  farmerLocation?: string;
  farmerPrimaryLivestock?: string;
  allProducts?: MarketplaceProduct[];
  allShops?: DigitalShop[];
  visibleLabelsCandidate?: string[];
  rawVisualDescription?: string;
  isMarketplaceFailure?: boolean;
}

export type { UserCorrectionDetails };
export { detectUserCorrection };

/**
 * Normalizes strings for robust, deterministic matching
 */
function clean(str?: string | null): string {
  return (str || '').toLowerCase().trim();
}

/**
 * Stage 1: Extracts conservative visual characteristics from visual references.
 * Never invents hidden specifications like voltage, exact weight, or model numbers.
 */
export function extractConservativeVisualCharacteristics(
  params: MatchVisualProductParams
): VisualUnderstandingCharacteristics {
  const text = params.userText || '';
  const lowerText = clean(text);
  const structured = params.structuredQuery;
  const quality = params.imageQuality || params.videoQuality || 'clear';

  // Sanitize visible labels if present (Prompt Injection Defense - Section 29)
  const rawLabels = params.visibleLabelsCandidate || structured?.videoUnderstanding?.visibleLabels || [];
  const sanitizedLabels = rawLabels
    .map((l) => sanitizeVisibleLabelText(l))
    .filter((l) => Boolean(l));

  // Determine quality classification
  const isPoorQuality =
    quality === 'blurry' ||
    quality === 'dark' ||
    quality === 'distant' ||
    quality === 'obstructed' ||
    quality === 'low_res' ||
    quality === 'uncertain' ||
    /\b(haionekani\s+vizuri|giza|ukungu|haieleweki|mbaya|mbali)\b/i.test(lowerText);

  const effectiveQuality = isPoorQuality ? (quality === 'clear' ? 'blurry' : quality) : 'clear';

  // Check for explicit user corrections (V1.3F Section 32 & Test 20)
  const correction = detectUserCorrection(text);
  const negatedConcept = correction.negatedConcept?.toLowerCase();
  const correctedConcept = correction.correctedConcept?.toLowerCase();

  const isFeederNegated = Boolean(negatedConcept && /feeder|kulishia|chakula/.test(negatedConcept));
  const isDrinkerNegated = Boolean(negatedConcept && /drinker|kunyweshea|maji/.test(negatedConcept));
  const isBucketNegated = Boolean(negatedConcept && /bucket|ndoo/.test(negatedConcept));
  const isMachineNegated = Boolean(negatedConcept && /mashine|chopper|cutter/.test(negatedConcept));

  const isFeederCorrected = Boolean(correctedConcept && /feeder|kulishia|chakula/.test(correctedConcept));
  const isDrinkerCorrected = Boolean(correctedConcept && /drinker|kunyweshea|maji/.test(correctedConcept));
  const isMachineCorrected = Boolean(correctedConcept && /mashine|chopper|chaff|incubator/.test(correctedConcept));

  // Check for multiple distinct products (Section 13)
  const distinctProductTypes = [
    { name: 'feeder', match: /\b(feeder|chombo\s+cha\s+chakula|chombo\s+cha\s+kulishia|kulishia|kulia)\b/i, isNegated: isFeederNegated },
    { name: 'drinker', match: /\b(drinker|chombo\s+cha\s+maji|chombo\s+cha\s+kunyweshea|kunyweshea|kunywea)\b/i, isNegated: isDrinkerNegated },
    { name: 'incubator', match: /\b(incubator|mashine\s+ya\s+kutotolesha|kutotolesha)\b/i, isNegated: false },
    { name: 'chopper', match: /\b(chopper|chaff\s+cutter|kukata\s+majani)\b/i, isNegated: isMachineNegated },
    { name: 'cage', match: /\b(kizimba|cages?|banda)\b/i, isNegated: false }
  ];

  const presentTypes = distinctProductTypes
    .filter((p) => !p.isNegated)
    .filter((p) => p.match.test(lowerText) || p.match.test(params.rawVisualDescription || ''));
  const hasMultipleProducts = (correction.isCorrection && correction.correctedConcept) ? false : presentTypes.length > 1;

  // Derive form factor & visible components conservatively
  const visibleComponents: string[] = [];
  let formFactor: string | undefined;
  let visibleMaterial: string | undefined;
  let visibleColor: string | undefined;
  let visibleConfiguration: string | undefined;
  let apparentLivestockUse: string | undefined;
  let productConcept: string | undefined = structured?.productConcept || undefined;
  let category: string | undefined = structured?.category || undefined;
  let subcategory: string | undefined = structured?.subcategory || undefined;

  // User Text Override for Livestock (V1.3F Section 7 & Test 20)
  let explicitLivestockOverride: string | undefined;
  if (/\b(ng'ombe|ngombe|cattle|cow|dairy)\b/i.test(lowerText)) {
    explicitLivestockOverride = 'Cattle';
  } else if (/\b(kuku|poultry|vifaranga|kienyeji)\b/i.test(lowerText)) {
    explicitLivestockOverride = 'Poultry';
  } else if (/\b(mbuzi|kondoo|goat|sheep)\b/i.test(lowerText)) {
    explicitLivestockOverride = 'Goats/Sheep';
  } else if (/\b(nguruwe|pigs?)\b/i.test(lowerText)) {
    explicitLivestockOverride = 'Pigs';
  }

  // Feeder cues (Honoring negation & correction)
  if (
    !isFeederNegated &&
    (isFeederCorrected ||
      lowerText.includes('feeder') ||
      lowerText.includes('chombo cha chakula') ||
      lowerText.includes('kulishia') ||
      lowerText.includes('kulia') ||
      (productConcept && /feeder|chakula|kulishia/i.test(productConcept)))
  ) {
    productConcept = explicitLivestockOverride === 'Cattle'
      ? "Chombo cha Chakula cha Ng'ombe (Feeder)"
      : 'Chombo cha Chakula cha Kuku (Feeder)';
    category = 'Vifaa na Mashine';
    subcategory = 'Vifaa vya Kulishia (Feeders)';
    formFactor = 'cylindrical / conical trough';
    visibleComponents.push('feeding trough', 'feed cylinder / cone', 'hanging handle');
    apparentLivestockUse = explicitLivestockOverride || 'Poultry';
  }
  // Drinker cues (Honoring negation & correction)
  else if (
    !isDrinkerNegated &&
    (isDrinkerCorrected ||
      lowerText.includes('drinker') ||
      lowerText.includes('chombo cha maji') ||
      lowerText.includes('kunyweshea') ||
      lowerText.includes('kunywea') ||
      (productConcept && /drinker|maji|kunyweshea/i.test(productConcept)))
  ) {
    productConcept = 'Chombo cha Maji cha Kuku (Drinker)';
    category = 'Vifaa na Mashine';
    subcategory = 'Vyombo vya Maji (Drinkers)';
    formFactor = 'inverted bell / dome bottle';
    visibleComponents.push('water bell', 'shallow saucer bowl', 'top loop');
    apparentLivestockUse = explicitLivestockOverride || 'Poultry';
  }
  // Incubator cues
  else if (
    isMachineCorrected ||
    lowerText.includes('incubator') ||
    lowerText.includes('kutotolesha') ||
    (productConcept && /incubator|kutotolesha/i.test(productConcept))
  ) {
    productConcept = productConcept || 'Incubator ya Kutotolesha Mayai';
    category = category || 'Vifaa vya Ufugaji';
    subcategory = subcategory || 'Mashine za Kutotolesha (Incubators)';
    formFactor = 'box cabinet';
    visibleComponents.push('egg turning trays', 'temperature control panel', 'transparent viewing window');
    apparentLivestockUse = explicitLivestockOverride || 'Poultry';
  }
  // Chopper / Chaff Cutter cues
  else if (lowerText.includes('chopper') || lowerText.includes('chaff cutter') || lowerText.includes('kukata majani') || (productConcept && /chopper|kukata majani/i.test(productConcept))) {
    productConcept = productConcept || 'Mashine ya Kukata Majani ya Mifugo';
    category = category || 'Vifaa vya Ufugaji';
    subcategory = subcategory || 'Vipima Uzito na Vifaa vya Shambani';
    formFactor = 'stand-mounted mechanical frame';
    visibleComponents.push('feed hopper chute', 'rotary cutter blade housing', 'electric / engine mount frame');
    apparentLivestockUse = explicitLivestockOverride || 'Cattle';
  }
  // Vifaranga / Kuku cues
  else if (lowerText.includes('vifaranga') || lowerText.includes('sasso') || lowerText.includes('kuroiler') || lowerText.includes('chicks') || (productConcept && /vifaranga|chicks/i.test(productConcept))) {
    productConcept = productConcept || 'Vifaranga vya Kuku (Chicks)';
    category = category || 'Vifaranga';
    subcategory = subcategory || 'Kuku Chotara (Kuroiler/Sasso)';
    formFactor = 'live chicks flock';
    apparentLivestockUse = 'Poultry';
  }
  // Mayai cues
  else if (lowerText.includes('mayai') || lowerText.includes('eggs') || (productConcept && /mayai|eggs/i.test(productConcept))) {
    productConcept = productConcept || 'Mayai ya Kienyeji ya Mbegu';
    category = category || 'Mayai';
    subcategory = subcategory || 'Mayai ya Mbegu (Fertilized Hatching Eggs)';
    formFactor = 'egg trays';
    apparentLivestockUse = 'Poultry';
  }
  // Ng'ombe cues
  else if (lowerText.includes('ngombe') || lowerText.includes('ng\'ombe') || lowerText.includes('heifer') || lowerText.includes('friesian') || lowerText.includes('dairy') || (productConcept && /ngombe|cow|heifer/i.test(productConcept))) {
    productConcept = productConcept || "Mtamba wa Maziwa (Dairy Heifer)";
    category = category || "Ng'ombe";
    subcategory = subcategory || "Ng'ombe wa Maziwa (Dairy Cows & Heifers)";
    formFactor = 'dairy cow livestock';
    apparentLivestockUse = 'Cattle';
  }
  // Mbuzi cues
  else if (lowerText.includes('mbuzi') || lowerText.includes('boer') || lowerText.includes('goat') || (productConcept && /mbuzi|goat/i.test(productConcept))) {
    productConcept = productConcept || 'Mbuzi wa Mbegu (Boer Buck)';
    category = category || 'Mbuzi';
    subcategory = subcategory || 'Mbuzi wa Mbegu (Breeding Bucks)';
    formFactor = 'breeding goat buck';
    apparentLivestockUse = 'Goats';
  }
  // Dawa cues
  else if (lowerText.includes('dawa') || lowerText.includes('chanjo') || lowerText.includes('oxytetracycline') || lowerText.includes('antibiotic') || (productConcept && /dawa|chanjo|oxytetracycline/i.test(productConcept))) {
    productConcept = productConcept || 'Oxytetracycline / Dawa ya Mifugo';
    category = category || 'Dawa za Mifugo';
    subcategory = subcategory || 'Viua Vijasumu (Antibiotics)';
    formFactor = 'medicine bottle';
    apparentLivestockUse = explicitLivestockOverride || 'General';
  }
  // Chakula cues
  else if (lowerText.includes('chakula') || lowerText.includes('mash') || lowerText.includes('feed') || (productConcept && /chakula|feed/i.test(productConcept))) {
    productConcept = productConcept || 'Chakula cha Kuku (Poultry Feeds)';
    category = category || 'Chakula cha Mifugo';
    subcategory = subcategory || 'Chakula cha Kuku (Poultry Feeds)';
    formFactor = 'feed bag sack';
    apparentLivestockUse = 'Poultry';
  }

  if (explicitLivestockOverride) {
    apparentLivestockUse = explicitLivestockOverride;
  }

  // Material detection
  if (lowerText.includes('plastiki') || lowerText.includes('plastic')) {
    visibleMaterial = 'plastic';
  } else if (lowerText.includes('chuma') || lowerText.includes('mabati') || lowerText.includes('metal')) {
    visibleMaterial = 'metal';
  }

  // Color detection (Section 3: Do not treat color alone as strong evidence)
  if (lowerText.includes('nyekundu') || lowerText.includes('red')) {
    visibleColor = 'red';
  } else if (lowerText.includes('njano') || lowerText.includes('yellow')) {
    visibleColor = 'yellow';
  } else if (lowerText.includes('nyeupe') || lowerText.includes('white')) {
    visibleColor = 'white';
  } else if (lowerText.includes('bluu') || lowerText.includes('blue')) {
    visibleColor = 'blue';
  }

  // Configuration
  if (lowerText.includes('kunin\'giniza') || lowerText.includes('hanging')) {
    visibleConfiguration = 'hanging';
  } else if (lowerText.includes('kusimama') || lowerText.includes('chini')) {
    visibleConfiguration = 'floor-standing';
  }

  // Brand / Model Protection (Section 15: If not readable, do NOT guess)
  let visibleBrand: string | null = null;
  let visibleModel: string | null = null;
  for (const label of sanitizedLabels) {
    if (/\b(honda|makita|interheat|abs|sasso|kuroiler)\b/i.test(label)) {
      visibleBrand = label;
    }
  }

  return {
    category,
    subcategory,
    productConcept,
    productType: subcategory,
    formFactor,
    visibleComponents,
    visibleMaterial,
    visibleColor,
    visibleConfiguration,
    apparentLivestockUse: apparentLivestockUse || structured?.livestockUse || undefined,
    visibleLabels: sanitizedLabels,
    visibleBrand,
    visibleModel,
    quality: effectiveQuality,
    detectedMultipleProducts: hasMultipleProducts,
    multipleProductNames: presentTypes.map((p) => p.name)
  };
}

/**
 * Generic search stopwords that should not reject products when extracted from ambient visual query concepts.
 */
const GENERIC_VISUAL_STOPWORDS = new Set([
  'ya', 'za', 'cha', 'vya', 'kwa', 'na', 'kama', 'hii', 'hiki', 'huyu', 'hili', 'hawa',
  'wa', 'la', 'ma', 'kitu', 'vitu', 'kifaa', 'vifaa', 'bidhaa', 'mifugo', 'ufugaji',
  'kilimo', 'mnyama', 'wanyama', 'shamba', 'shambani', 'sokoni', 'gulio', 'soko',
  'nzuri', 'bora', 'picha', 'video', 'kamera', 'camera', 'sample', 'natafuta', 'nahitaji', 'wapi'
]);

/**
 * Stage 2: Candidate retrieval using existing Marketplace search architecture.
 * Excludes drafts, inactive listings, and honors budget and location preferences.
 */
export function retrieveMarketplaceCandidates(
  structuredQuery: StructuredVisualMarketplaceQuery,
  allProducts: MarketplaceProduct[] = INITIAL_SAMPLE_PRODUCTS
): MarketplaceProduct[] {
  const catClean = clean(structuredQuery.category);
  const subcatClean = clean(structuredQuery.subcategory);
  const conceptClean = clean(structuredQuery.productConcept);
  const livestockClean = clean(structuredQuery.livestockUse);
  const targetLocation = clean(structuredQuery.region);

  const rawKeywords: string[] = [];
  if (conceptClean) {
    const tokens = conceptClean
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3 && !GENERIC_VISUAL_STOPWORDS.has(t));
    rawKeywords.push(...tokens);
  }
  for (const attr of structuredQuery.attributes) {
    const val = clean(attr.value);
    if (val.length >= 3 && !GENERIC_VISUAL_STOPWORDS.has(val)) {
      rawKeywords.push(val);
    }
  }
  if (livestockClean && !GENERIC_VISUAL_STOPWORDS.has(livestockClean) && !rawKeywords.includes(livestockClean)) {
    rawKeywords.push(livestockClean);
  }

  const specificKeywords = Array.from(new Set(rawKeywords));

  return allProducts.filter((product) => {
    // 1. Visibility Check (Section 7: Valid Marketplace Records Only - No drafts, no inactive)
    if (product.status === 'draft' || product.status === 'inactive') {
      return false;
    }

    // 2. Stock Preference Check
    if (structuredQuery.stockPreference === true && (product.quantityAvailable || 0) <= 0) {
      return false;
    }

    // 3. Price Preference Bounds (Section 22: Multi-turn budget refinement)
    const price = typeof product.price === 'number' ? product.price : null;
    if (price !== null) {
      if (structuredQuery.pricePreference?.min !== null && structuredQuery.pricePreference?.min !== undefined) {
        if (price < structuredQuery.pricePreference.min) return false;
      }
      if (structuredQuery.pricePreference?.max !== null && structuredQuery.pricePreference?.max !== undefined) {
        if (price > structuredQuery.pricePreference.max) return false;
      }
    }

    // 4. Relevance filtering
    const title = clean(product.title);
    const desc = clean(product.description);
    const pCat = clean(product.category);
    const pSubcat = clean(product.subcategory);
    const pLivestock = clean(product.livestockLink?.type || product.livestockLink?.category);
    const pCatId = clean((product as any).categoryId);

    const productWords = new Set(
      `${title} ${desc} ${pCat} ${pSubcat} ${pLivestock} ${pCatId}`
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean)
    );

    const categoryMatches = Boolean(
      catClean && (
        pCat.includes(catClean) ||
        catClean.includes(pCat) ||
        (catClean.includes('vifaa') && (pCat.includes('vifaa') || pCat.includes('mashine'))) ||
        (catClean.includes('kuku') && (pCat.includes('kuku') || pCat.includes('vifaranga') || pSubcat.includes('kuku'))) ||
        (catClean.includes('ngombe') && pCat.includes('ngombe')) ||
        (catClean.includes('mbuzi') && pCat.includes('mbuzi')) ||
        (catClean.includes('dawa') && pCat.includes('dawa')) ||
        (catClean.includes('chakula') && pCat.includes('chakula')) ||
        (pCatId && (pCatId.includes(catClean) || catClean.includes(pCatId)))
      )
    );

    const subcategoryMatches = Boolean(
      subcatClean && (
        pSubcat.includes(subcatClean) ||
        subcatClean.includes(pSubcat) ||
        (subcatClean.includes('feeder') && (pSubcat.includes('feeder') || title.includes('feeder') || title.includes('kulishia'))) ||
        (subcatClean.includes('drinker') && (pSubcat.includes('drinker') || title.includes('drinker') || title.includes('kunyweshea'))) ||
        (subcatClean.includes('incubator') && (pSubcat.includes('incubator') || title.includes('incubator') || title.includes('kutotolesha'))) ||
        (subcatClean.includes('cutter') && (pSubcat.includes('cutter') || title.includes('cutter') || title.includes('chopper')))
      )
    );

    const keywordMatches = specificKeywords.length > 0 && specificKeywords.some((kw) =>
      productWords.has(kw) ||
      Array.from(productWords).some((pw) => (pw.startsWith(kw) || kw.startsWith(pw)) && Math.min(pw.length, kw.length) >= 4)
    );

    const livestockMatches = Boolean(
      livestockClean && (
        pLivestock.includes(livestockClean) ||
        productWords.has(livestockClean) ||
        (livestockClean === 'poultry' && (productWords.has('kuku') || productWords.has('mayai') || productWords.has('vifaranga') || productWords.has('feeder') || productWords.has('drinker') || productWords.has('incubator'))) ||
        (livestockClean === 'cattle' && (productWords.has('ngombe') || productWords.has('maziwa') || productWords.has('heifer') || productWords.has('friesian'))) ||
        (livestockClean === 'goats' && (productWords.has('mbuzi') || productWords.has('kondoo') || productWords.has('boer')))
      )
    );

    // If specific keywords exist (e.g. 'feeder', 'incubator', 'sasso', 'oxytetracycline')
    if (specificKeywords.length > 0) {
      if (keywordMatches || subcategoryMatches) return true;
      if (categoryMatches && (livestockMatches || !livestockClean)) return true;
      return false;
    }

    // If category was specified
    if (catClean) {
      if (categoryMatches || subcategoryMatches || livestockMatches) return true;
      return false;
    }

    // Fallback: If query was ambient without specific keywords or categories, retain active products for scoring
    return true;
  });
}

/**
 * Stage 3: Deterministic scoring and visual comparison.
 * Compares observable characteristics against real Marketplace candidate records.
 */
export function scoreCandidateVisualMatch(
  candidate: MarketplaceProduct,
  characteristics: VisualUnderstandingCharacteristics,
  structuredQuery: StructuredVisualMarketplaceQuery,
  userText?: string
): VisualMatchScore {
  // V1.7G: Authoritative Marketplace Governance Enforcement
  // Products that are REJECTED, HIDDEN, SUSPENDED, UNDER_REVIEW or from restricted sellers cannot be matched
  if (!isProductMarketplaceEligible(candidate)) {
    return {
      overallScore: 0,
      visualSimilarityScore: 0,
      semanticSimilarityScore: 0,
      attributeSimilarityScore: 0,
      categoryMatch: 0,
      confidence: 'LOW',
      matchTier: 'NO_RELIABLE_MATCH',
      reasons: [],
      limitations: ['Bidhaa hii imezuiwa au haipatikani sokoni kwa mujibu wa taratibu za kiutawala (Marketplace Governance).'],
      explanation: 'Bidhaa hii haipatikani sokoni kwa sasa.'
    };
  }

  const reasons: string[] = [];
  const limitations: string[] = [];

  const candidateTitle = clean(candidate.title);
  const candidateDesc = clean(candidate.description);
  const candidateCat = clean(candidate.category);
  const candidateSubcat = clean(candidate.subcategory);
  const candidateLivestock = clean(candidate.livestockLink?.type || candidate.livestockLink?.category);

  // Check product image availability (Section 11) - includes imageUrl, images array, or video thumbnail
  const hasProductImage = Boolean(
    candidate.imageUrl ||
    (candidate.images && candidate.images.length > 0 && candidate.images[0].url) ||
    candidate.video?.thumbnailUrl
  );

  // User Correction Negation Enforcement (V1.3F Section 32 & Test 20)
  if (userText) {
    const correction = detectUserCorrection(userText);
    if (correction.isCorrection && correction.negatedConcept) {
      const neg = correction.negatedConcept.toLowerCase();
      const candTitle = candidateTitle.toLowerCase();
      const candDesc = candidateDesc.toLowerCase();
      const candSub = candidateSubcat.toLowerCase();

      const isNegatedFeeder = /feeder|kulishia|chakula/.test(neg) && (/feeder|kulishia|chakula/.test(candTitle) || /feeder|kulishia/.test(candSub));
      const isNegatedDrinker = /drinker|kunyweshea|maji/.test(neg) && (/drinker|kunyweshea|maji/.test(candTitle) || /drinker|kunyweshea/.test(candSub));
      const isNegatedBucket = /bucket|ndoo/.test(neg) && (/ndoo|bucket/.test(candTitle) || /ndoo|bucket/.test(candDesc));

      if (isNegatedFeeder || isNegatedDrinker || isNegatedBucket || candTitle.includes(neg) || candSub.includes(neg)) {
        return {
          overallScore: 0,
          visualSimilarityScore: 0,
          semanticSimilarityScore: 0,
          attributeSimilarityScore: 0,
          categoryMatch: 0,
          confidence: 'LOW',
          matchTier: 'NO_RELIABLE_MATCH',
          reasons: [],
          limitations: [`Mtumiaji amesahihisha kuwa hataki "${correction.negatedConcept}"`],
          explanation: `Bidhaa hii imetengwa kulingana na marekebisho ya mtumiaji.`
        };
      }
    }
  }

  // 1. Category & Subcategory Match (0 to 100)
  let categoryScore = 0;
  const targetCat = clean(characteristics.category || structuredQuery.category);
  const targetSubcat = clean(characteristics.subcategory || structuredQuery.subcategory);

  const subcatMatchesDirect = targetSubcat && (candidateSubcat.includes(targetSubcat) || targetSubcat.includes(candidateSubcat));
  const subcatMatchesToken = Boolean(
    targetSubcat &&
    candidateSubcat &&
    ['feeder', 'drinker', 'incubator', 'chopper', 'cage', 'chanjo', 'dawa', 'chakula', 'mbegu'].some(
      (kw) => targetSubcat.includes(kw) && candidateSubcat.includes(kw)
    )
  );

  if (subcatMatchesDirect || subcatMatchesToken) {
    categoryScore = 100;
    reasons.push(`Aina ya bidhaa inalingana moja kwa moja (${candidate.subcategory || candidate.category})`);
  } else if (
    targetCat && (
      candidateCat.includes(targetCat) ||
      targetCat.includes(candidateCat) ||
      (targetCat.includes('vifaa') && (candidateCat.includes('vifaa') || candidateCat.includes('mashine'))) ||
      (targetCat.includes('kuku') && (candidateCat.includes('kuku') || candidateCat.includes('vifaranga') || candidateSubcat.includes('kuku'))) ||
      (targetCat.includes('ngombe') && candidateCat.includes('ngombe')) ||
      (targetCat.includes('mbuzi') && candidateCat.includes('mbuzi')) ||
      (targetCat.includes('dawa') && candidateCat.includes('dawa')) ||
      (targetCat.includes('chakula') && candidateCat.includes('chakula'))
    )
  ) {
    categoryScore = 75;
    reasons.push(`Kategoria kuu ya bidhaa inafanana (${candidate.category})`);
  } else if (targetCat || targetSubcat) {
    categoryScore = 0;
    limitations.push('Kategoria ya bidhaa inatofautiana');
  } else {
    categoryScore = 40;
  }

  // 2. Semantic Similarity Score (0 to 100)
  let semanticScore = 0;
  const concept = clean(characteristics.productConcept || structuredQuery.productConcept);
  if (concept && candidateTitle.includes(concept)) {
    semanticScore += 60;
  } else if (concept) {
    const tokens = concept
      .split(/\s+/)
      .filter((t) => t.length > 2 && !['ya', 'za', 'cha', 'vya', 'kwa', 'na', 'kama', 'hii', 'hiki', 'huyu', 'hili', 'hawa', 'natafuta', 'nahitaji', 'wapi', 'kitu'].includes(t));
    const candWords = new Set(`${candidateTitle} ${candidateDesc}`.split(/[^a-z0-9]+/).filter(Boolean));
    const matches = tokens.filter((t) =>
      candWords.has(t) ||
      Array.from(candWords).some((cw) => (cw.startsWith(t) || t.startsWith(cw)) && Math.min(cw.length, t.length) >= 4)
    );
    semanticScore += Math.min(50, matches.length * 20);
  }

  // Livestock alignment
  const targetLivestock = clean(characteristics.apparentLivestockUse || structuredQuery.livestockUse);
  if (targetLivestock && (candidateLivestock.includes(targetLivestock) || candidateTitle.includes(targetLivestock) || candidateDesc.includes(targetLivestock))) {
    semanticScore += 30;
    reasons.push(`Inafaa kwa mifugo husika (${targetLivestock})`);
  }

  // Explicit user requirement alignment
  if (userText) {
    const lowerUser = clean(userText);
    if (lowerUser.includes('kubwa') && (candidateDesc.includes('kubwa') || candidateTitle.includes('10kg') || candidateTitle.includes('500') || candidateTitle.includes('528'))) {
      semanticScore += 15;
      reasons.push('Inalingana na takwa la ukubwa lililotajwa na mtumiaji');
    }
  }
  semanticScore = Math.min(100, Math.max(0, semanticScore));

  // 3. Attribute Similarity Score (0 to 100)
  let attributeScore = 0;
  if (structuredQuery.attributes && structuredQuery.attributes.length > 0) {
    for (const attr of structuredQuery.attributes) {
      const attrVal = clean(attr.value);
      if (candidateTitle.includes(attrVal) || candidateDesc.includes(attrVal)) {
        attributeScore += 30;
        reasons.push(`Sifa ya "${attr.name}: ${attr.value}" ipo kwenye tangazo la bidhaa`);
      }
    }
    attributeScore = Math.min(100, attributeScore);
  } else {
    attributeScore = (categoryScore > 0 || semanticScore > 0) ? 50 : 0;
  }

  // 4. Visual Similarity Score (0 to 100)
  let visualSimilarityScore: number | undefined;
  if (!hasProductImage) {
    // Section 11: A product with no usable image should NOT receive a fabricated visual similarity score
    visualSimilarityScore = undefined;
    limitations.push('Tangazo la Gulio halina picha ya kufanya ulinganisho wa moja kwa moja wa kuona');
    reasons.push('Ulinganisho umefanyika kwa njia ya vigezo vya maandishi (semantic match)');
  } else {
    // Compare observable visual characteristics (V1.3F Section 4 - False Positive Protection)
    const targetConceptLower = clean(characteristics.productConcept || structuredQuery.productConcept);
    const isTargetFeeder = /feeder|kulishia|chakula/.test(targetConceptLower);
    const isTargetDrinker = /drinker|kunyweshea|maji/.test(targetConceptLower);
    const isCandidateBucket = /\b(ndoo|bucket)\b/i.test(candidateTitle) || /\b(ndoo|bucket)\b/i.test(candidateDesc);

    let vScore = categoryScore > 0 ? 25 : 0; // Only give base if category aligns

    // False Positive Guard: Bucket vs Feeder/Drinker mismatch
    if ((isTargetFeeder || isTargetDrinker) && isCandidateBucket) {
      vScore = 0;
      limitations.push('Kifaa hiki ni ndoo/bucket, muundo na matumizi yanatofautiana na chombo kinachotafutwa (False Positive Protection)');
    } else {
      // Form factor & structure
      if (characteristics.formFactor) {
        if ((candidateSubcat.includes('feeder') || candidateTitle.includes('feeder')) && characteristics.formFactor.includes('trough')) {
          vScore += 25;
          reasons.push('Muundo wa chombo (feeder trough) unafanana');
        } else if ((candidateSubcat.includes('drinker') || candidateTitle.includes('drinker')) && characteristics.formFactor.includes('bell')) {
          vScore += 25;
          reasons.push('Muundo wa chombo cha maji (drinker dome) unafanana');
        } else if ((candidateSubcat.includes('incubator') || candidateTitle.includes('incubator')) && characteristics.formFactor.includes('box')) {
          vScore += 25;
          reasons.push('Muundo wa kisanduku cha mashine ya kutotolesha unafanana');
        } else if ((candidateSubcat.includes('shambani') || candidateTitle.includes('chopper') || candidateTitle.includes('cutter')) && characteristics.formFactor.includes('frame')) {
          vScore += 25;
          reasons.push('Muundo wa injini na visu vya mashine unafanana');
        }
      }

      // Visible components
      if (characteristics.visibleComponents.length > 0) {
        let compMatches = 0;
        for (const comp of characteristics.visibleComponents) {
          if (candidateDesc.includes(comp) || candidateTitle.includes(comp)) {
            compMatches++;
          }
        }
        if (compMatches > 0) {
          vScore += Math.min(20, compMatches * 10);
          reasons.push('Sehemu za msingi za kifaa zinaonekana kufanana');
        }
      }

      // Material appearance
      if (characteristics.visibleMaterial && categoryScore > 0) {
        const mat = characteristics.visibleMaterial.toLowerCase();
        const isMetal = mat.includes('metal') || mat.includes('chuma') || mat.includes('mabati');
        const isPlastic = mat.includes('plastic') || mat.includes('plastiki');
        const matchesMetal = isMetal && (candidateTitle.includes('chuma') || candidateDesc.includes('chuma') || candidateTitle.includes('metal') || candidateDesc.includes('metal'));
        const matchesPlastic = isPlastic && (candidateTitle.includes('plastiki') || candidateDesc.includes('plastiki') || candidateTitle.includes('plastic') || candidateDesc.includes('plastic'));

        if (matchesMetal || matchesPlastic || candidateDesc.includes(mat) || candidateTitle.includes(mat)) {
          vScore += 15;
          reasons.push(`Nyenzo ya kifaa inafanana (${characteristics.visibleMaterial})`);
        }
      }

      // Color (Section 4: Max 5% weight, only valid if category matches, never strong evidence alone)
      if (characteristics.visibleColor && categoryScore >= 75) {
        if (candidateDesc.includes(characteristics.visibleColor) || candidateTitle.includes(characteristics.visibleColor)) {
          vScore += 5;
        }
      }
    }

    // Quality degradation check (Section 17 & 18)
    if (characteristics.quality !== 'clear') {
      vScore = Math.min(vScore, 48);
      limitations.push('Ubora wa picha/video ni hafifu (ukungu/giza/mbali), hivyo ulinganisho wa kuona umepunguzwa');
    }

    // If category has zero relevance, visual similarity is forced to zero
    if (categoryScore === 0) {
      vScore = 0;
    }

    visualSimilarityScore = Math.min(100, Math.max(0, vScore));
  }

  // 5. Overall Deterministic Score Calculation (Section 4 & 9)
  let overallScore = 0;
  if (visualSimilarityScore !== undefined) {
    overallScore = Math.round(
      visualSimilarityScore * 0.45 +
      categoryScore * 0.25 +
      semanticScore * 0.20 +
      attributeScore * 0.10
    );
  } else {
    // Product without image: pure semantic formula
    // If semantic similarity is 0 and no attributes matched, do not over-inflate score on broad category alone
    if (semanticScore === 0 && attributeScore === 0) {
      overallScore = Math.round(categoryScore * 0.20);
    } else {
      overallScore = Math.round(
        categoryScore * 0.40 +
        semanticScore * 0.45 +
        attributeScore * 0.15
      );
    }
  }

  // If neither category nor semantic matched, candidate is completely irrelevant
  if (categoryScore === 0 && semanticScore === 0) {
    overallScore = 0;
  }

  // Extra boost for verified sellers, stock, and location (Section 9)
  if (overallScore > 0 && candidate.sellerVerificationStatus === 'verified') {
    overallScore = Math.min(100, overallScore + 3);
  }
  if (overallScore > 0 && candidate.status === 'active' && (candidate.quantityAvailable || 0) > 0) {
    overallScore = Math.min(100, overallScore + 3);
  }

  // 6. Confidence Assessment (Section 5)
  let confidence: VisualMatchConfidence = 'HIGH';
  if (characteristics.quality !== 'clear' || !hasProductImage) {
    confidence = 'LOW';
  } else if (overallScore >= 75 && categoryScore >= 80 && (visualSimilarityScore || 0) >= 65) {
    confidence = 'HIGH';
  } else if (overallScore >= 55) {
    confidence = 'MEDIUM';
  } else {
    confidence = 'LOW';
  }

  // 7. Exact Match Protection & Match Tier (V1.3F Section 5)
  let matchTier: VisualMatchTier = 'RELATED_PRODUCT';
  let explanation = 'Inaonekana inafanana kwa kiwango cha kati.';

  if (!hasProductImage) {
    matchTier = overallScore >= 60 ? 'RELATED_PRODUCT' : 'WEAK_CANDIDATE';
    explanation = 'Ina uhusiano wa karibu kulingana na maelezo ya tangazo (bila picha ya bidhaa).';
  } else if (characteristics.quality !== 'clear') {
    matchTier = 'WEAK_CANDIDATE';
    explanation = 'Ina uhusiano wa karibu, lakini ubora wa picha/video hautoshi kuthibitisha kwa uhakika.';
  } else if (confidence === 'HIGH' && overallScore >= 80 && (visualSimilarityScore || 0) >= 75) {
    matchTier = 'EXACT_OR_VERY_STRONG';
    explanation = 'Inaonekana inafanana sana na bidhaa hii (bila dhamana ya kuwa bidhaa hiyo hiyo).';
  } else if (overallScore >= 70) {
    matchTier = 'STRONGLY_SIMILAR';
    explanation = 'Inaonekana inafanana kwa kiwango kikubwa.';
  } else if (overallScore >= 50) {
    matchTier = 'RELATED_PRODUCT';
    explanation = 'Inaonekana inafanana kwa kiwango cha kati.';
  } else {
    matchTier = 'WEAK_CANDIDATE';
    explanation = 'Ina uhusiano wa karibu, lakini hatuwezi kuthibitisha kuwa ni bidhaa hiyo hiyo.';
  }

  return {
    overallScore,
    visualSimilarityScore,
    semanticSimilarityScore: semanticScore,
    attributeSimilarityScore: attributeScore,
    categoryMatch: categoryScore,
    confidence,
    matchTier,
    reasons,
    limitations: limitations.length > 0 ? limitations : undefined,
    explanation
  };
}

/**
 * Main Entry Point: Matches a visual reference against real Marketplace products.
 * Returns structured, explainable match results.
 */
export async function matchVisualProductToMarketplace(
  params: MatchVisualProductParams
): Promise<VisualProductMatchResult> {
  const text = params.userText || '';
  const lowerText = clean(text);
  const source = params.source || params.structuredQuery?.source || 'image';

  // 0. MARKETPLACE FAILURE PROTECTION (V1.3F Section 27 & 30)
  if (params.isMarketplaceFailure) {
    const dummyQuery = buildStructuredVisualMarketplaceQuery({
      userText: text,
      source
    });
    return {
      status: 'marketplace_error',
      confidence: 'LOW',
      matchCount: 0,
      topMatchTier: 'NO_RELIABLE_MATCH',
      headlineExplanation: 'Hatukuweza kupata taarifa za Gulio kwa sasa. Jaribu tena.',
      userGuidance: 'Hitilafu ya kiufundi au mawasiliano ya Gulio. Tafadhali jaribu tena baada ya muda mfupi.',
      results: [],
      structuredQuery: dummyQuery,
      isFallback: false
    };
  }

  // 0.1 NON-COMMERCIAL / INFORMATIONAL QUERY GUARD (V1.3F Section 21 & Test 8)
  const isPurelyInformational =
    /\b(unaona\s+nini(\s+kwenye\s+picha)?|hii\s+inatumika\s+kufanya\s+nini|nielezee\s+hii\s+(video|picha)|nieleze\s+(video|picha)\s+hii|kazi\s+ya\s+kifaa\s+hiki\s+ni\s+nini|hiki\s+ni\s+kifaa\s+gani|hiki\s+ni\s+nini)\b/i.test(lowerText);
  const hasCommercialKeywords =
    /\b(bei|ununuzi|kununua|sokoni|duka|maduka|shilingi|tsh|nauza|wapi\s+napata|gharama)\b/i.test(lowerText);

  if (isPurelyInformational && !hasCommercialKeywords) {
    const dummyQuery = buildStructuredVisualMarketplaceQuery({
      userText: text,
      source
    });
    return {
      status: 'no_match',
      confidence: 'LOW',
      matchCount: 0,
      topMatchTier: 'NO_RELIABLE_MATCH',
      headlineExplanation: 'Hatujaweka bidhaa sokoni kwa sababu swali lako linahusu maelezo au utambuzi wa kifaa.',
      userGuidance: 'Kama unahitaji kununua kifaa hiki sokoni Gulio, unaweza kuuliza: "Natafuta bei au duka la kifaa hiki".',
      results: [],
      structuredQuery: dummyQuery,
      isFallback: false
    };
  }

  // 1. VETERINARY / DAKTARI SEPARATION (Section 19 & 20)
  // Animal distress, disease symptoms, or medicine questions MUST NOT trigger marketplace product matching
  const isVeterinary =
    /\b(ugonjwa|anaugua|anaumwa|kuharisha|anaharisha|tatizo\s+gani|huyu\s+kuku\s+ana\s+tatizo|mbona\s+analegea|hawezi\s+kusimama|amevunjika|dawa\s+gani|nimpe\s+dawa\s+gani|homa|vifo|anapumua\s+kwa\s+shida)\b/i.test(lowerText);
  const isDoctorRequest =
    /\b(daktari|dakatri|bwana\s+mifugo|bibi\s+mifugo|afisa\s+mifugo|veterinary|vet)\b/i.test(lowerText);

  if (isVeterinary || isDoctorRequest) {
    const dummyQuery = buildStructuredVisualMarketplaceQuery({
      userText: text,
      source,
      isMedicalRestricted: true
    });
    return {
      status: 'veterinary_restricted',
      confidence: 'HIGH',
      matchCount: 0,
      headlineExplanation: isDoctorRequest
        ? 'Ombi lako linahusiana na mtaalamu wa mifugo (Daktari), sio ununuzi wa bidhaa sokoni.'
        : 'Picha/video hii inaonyesha dalili za kiafya au ugonjwa wa mnyama. Usalama wa mifugo unazingatiwa kwanza kabla ya mauzo ya dawa.',
      userGuidance: 'Tafadhali wasiliana na Daktari Mtaani Kwako kwa uchunguzi na matibabu sahihi ya mifugo.',
      results: [],
      structuredQuery: dummyQuery,
      isFallback: false
    };
  }

  // 2. BUILD OR REUSE STRUCTURED QUERY (Section 2 & 22)
  const mappedImgQuality: 'clear' | 'blurry' | 'dark' | 'distant' | 'uncertain' | undefined =
    params.imageQuality === 'obstructed' || params.imageQuality === 'low_res'
      ? 'blurry'
      : params.imageQuality;

  let structuredQuery = params.structuredQuery;
  if (!structuredQuery) {
    const intentResult = classifyVisualMarketplaceIntent({
      userText: text,
      hasImageAttachment: source === 'image',
      hasVideoAttachment: source === 'video',
      imageQuality: mappedImgQuality,
      videoQuality: params.videoQuality,
      conversationHistory: params.conversationHistory,
      farmerLocation: params.farmerLocation,
      farmerPrimaryLivestock: params.farmerPrimaryLivestock
    });
    structuredQuery = intentResult.structuredQuery || null;
  }

  if (!structuredQuery) {
    structuredQuery = buildStructuredVisualMarketplaceQuery({
      userText: text,
      source,
      imageQuality: params.imageQuality,
      videoQuality: params.videoQuality,
      farmerLocation: params.farmerLocation,
      farmerPrimaryLivestock: params.farmerPrimaryLivestock,
      conversationHistory: params.conversationHistory
    });
  }

  // 3. EXTRACT CONSERVATIVE CHARACTERISTICS (Stage 1)
  const characteristics = extractConservativeVisualCharacteristics({
    ...params,
    structuredQuery
  });

  // Check for multi-product ambiguity without user target specification (Section 13)
  if (characteristics.detectedMultipleProducts && characteristics.multipleProductNames && characteristics.multipleProductNames.length > 1) {
    const singleTargetMatches = characteristics.multipleProductNames.filter((name) => {
      const reg = new RegExp(`(\\b(hii|hiki|hili|hiyo)\\s+${name}\\b|\\b${name}\\s+tu\\b|\\bnatafuta\\s+(hii\\s+)?${name}\\b|\\bnahitaji\\s+(hii\\s+)?${name}\\b)`, 'i');
      return reg.test(lowerText);
    });

    const isSingleTarget = singleTargetMatches.length === 1;

    if (!isSingleTarget) {
      return {
        status: 'clarification_needed',
        confidence: 'MEDIUM',
        matchCount: 0,
        headlineExplanation: 'Picha/video inaonyesha vifaa zaidi ya kimoja. Tafadhali bainisha unachotaka kulinganisha.',
        userGuidance: `Vifaa vilivyotambuliwa: ${Array.isArray(characteristics.multipleProductNames) && characteristics.multipleProductNames.length > 0 ? characteristics.multipleProductNames.join(', ') : 'mbalimbali'}. Chagua kimoja ukiuliza.`,
        results: [],
        structuredQuery,
        isFallback: false,
        clarificationOptions: Array.isArray(characteristics.multipleProductNames) ? characteristics.multipleProductNames : []
      };
    }
  }

  // 4. RETRIEVE CANDIDATES (Stage 2)
  const productPool = params.allProducts && params.allProducts.length > 0
    ? params.allProducts
    : INITIAL_SAMPLE_PRODUCTS;

  const candidates = retrieveMarketplaceCandidates(structuredQuery, productPool);

  // Handle empty candidates (Section 25: Truthful No-Match)
  if (candidates.length === 0) {
    const effectiveConf = structuredQuery.visualConfidence === 'UNCERTAIN' ? 'LOW' : structuredQuery.visualConfidence;
    return {
      status: 'no_match',
      confidence: effectiveConf,
      matchCount: 0,
      topMatchTier: 'NO_RELIABLE_MATCH',
      headlineExplanation: 'Hatukupata bidhaa ya Gulio inayofanana vya kutosha na picha/video yako.',
      userGuidance: 'Unaweza kutafuta bidhaa nyingine au kurekebisha bajeti au eneo lako la utafutaji.',
      results: [],
      structuredQuery,
      isFallback: false
    };
  }

  // 5. SCORE EACH CANDIDATE (Stage 3)
  const scoredItems: MatchedMarketplaceProductItem[] = candidates.map((candidate) => {
    const score = scoreCandidateVisualMatch(candidate, characteristics, structuredQuery!, text);
    const hasImg = Boolean(
      candidate.imageUrl ||
      (candidate.images && candidate.images.length > 0 && candidate.images[0].url) ||
      candidate.video?.thumbnailUrl
    );

    return {
      productId: candidate.productId,
      title: candidate.title,
      price: candidate.price,
      currency: candidate.currency || 'Tsh',
      unit: candidate.unit,
      location: candidate.location,
      region: candidate.region,
      district: candidate.district,
      sellerId: candidate.sellerId,
      sellerName: candidate.sellerName,
      sellerBusinessName: candidate.sellerBusinessName,
      sellerVerified: (() => {
        const o = validateProductOwnership(candidate);
        return o.isValid && o.isSellerVerified;
      })(),
      inStock: candidate.status === 'active' && (candidate.quantityAvailable || 0) > 0,
      quantityAvailable: candidate.quantityAvailable || 0,
      imageUrl: candidate.imageUrl || (candidate.images && candidate.images[0]?.url) || candidate.video?.thumbnailUrl || undefined,
      hasProductImage: hasImg,
      hasVideo: Boolean(candidate.video?.url),
      videoDurationSeconds: candidate.video?.durationSeconds,
      relevanceReason: score.reasons[0] || 'Inaendana na ulichotafuta',
      shopId: candidate.shopId || candidate.sellerId,
      catalogueId: candidate.catalogueId,
      catalogueName: candidate.catalogueName,
      visualMatchScore: score,
      matchTier: score.matchTier,
      visualMatchConfidence: score.confidence,
      visualMatchExplanation: score.explanation,
      isSemanticOnly: score.visualSimilarityScore === undefined
    };
  });

  // Sort candidates by overall score descending (Stage 3 / Candidate Ranking - Section 9)
  const eligibleItems = scoredItems.filter(
    (item) => item.visualMatchScore.overallScore > 0 && item.matchTier !== 'NO_RELIABLE_MATCH'
  );
  eligibleItems.sort((a, b) => b.visualMatchScore.overallScore - a.visualMatchScore.overallScore);

  // Take top 3 to 5 matches
  const topResults = eligibleItems.slice(0, 4);
  const bestMatch = topResults[0];

  // If best match score is below minimum relevance threshold or has zero semantic and visual overlap with query, return truthful no match
  const hasZeroSemanticOverlap =
    bestMatch &&
    bestMatch.visualMatchScore.semanticSimilarityScore === 0 &&
    bestMatch.visualMatchScore.attributeSimilarityScore === 0 &&
    bestMatch.visualMatchScore.categoryMatch === 0 &&
    (bestMatch.matchTier === 'NO_RELIABLE_MATCH' || (bestMatch.visualMatchScore.visualSimilarityScore || 0) <= 20);

  if (!bestMatch || bestMatch.visualMatchScore.overallScore < 30 || hasZeroSemanticOverlap) {
    // If no eligible item, but there are candidates in scoredItems with overallScore >= 20:
    const fallbackCandidates = scoredItems
      .filter((s) => s.visualMatchScore.overallScore >= 20)
      .sort((a, b) => b.visualMatchScore.overallScore - a.visualMatchScore.overallScore)
      .slice(0, 3);

    if (fallbackCandidates.length > 0) {
      const promoted = fallbackCandidates.map((c) => ({
        ...c,
        matchTier: 'RELATED_PRODUCT' as const,
        visualMatchExplanation: c.visualMatchExplanation || 'Bidhaa inayohusiana kutoka kwenye soko la Gulio.'
      }));
      return {
        status: 'matched',
        confidence: 'MEDIUM',
        matchCount: promoted.length,
        topMatchTier: 'RELATED_PRODUCT',
        headlineExplanation: 'Tumepata bidhaa za Gulio zinazoweza kukufaa kulingana na picha/maelezo:',
        userGuidance: 'Zifuatazo ni bidhaa zinazokaribiana zaidi na ulichotafuta.',
        results: promoted,
        structuredQuery,
        isFallback: true
      };
    }

    const effectiveConf = structuredQuery.visualConfidence === 'UNCERTAIN' ? 'LOW' : structuredQuery.visualConfidence;
    return {
      status: 'no_match',
      confidence: effectiveConf,
      matchCount: 0,
      topMatchTier: 'NO_RELIABLE_MATCH',
      headlineExplanation: 'Hatukupata bidhaa ya Gulio inayofanana vya kutosha na picha/video yako.',
      userGuidance: 'Hakuna bidhaa inayokaribiana kutosha na kigezo cha picha. Jaribu kupiga picha ya karibu zaidi au chagua kategoria sahihi.',
      results: [],
      structuredQuery,
      isFallback: false
    };
  }

  // 6. DETERMINE OVERALL STATUS & HEADLINE (Section 1 & 24)
  const isPoorQuality = characteristics.quality !== 'clear';
  const allSemanticOnly = topResults.every((r) => r.isSemanticOnly);

  let status: VisualProductMatchResult['status'] = 'matched';
  let headlineExplanation = 'Bidhaa zinazofanana zaidi na ulichotuma kwenye Gulio:';

  if (isPoorQuality) {
    status = 'poor_visual_evidence';
    headlineExplanation = 'Picha/video haitoshi kufanya visual matching ya kuaminika. Hapa kuna bidhaa zinazohusiana kulingana na maelezo:';
  } else if (allSemanticOnly) {
    status = 'semantic_only';
    headlineExplanation = 'Hakuna visual match ya kuaminika. Lakini tumepata bidhaa zinazohusiana na maelezo yako:';
  } else {
    status = 'matched';
    headlineExplanation = source === 'video'
      ? 'Bidhaa inayokaribiana zaidi na video yako kwenye Gulio:'
      : 'Bidhaa inayokaribiana zaidi na picha yako kwenye Gulio:';
  }

  return {
    status,
    confidence: bestMatch.visualMatchConfidence,
    matchCount: topResults.length,
    topMatchTier: bestMatch.matchTier,
    headlineExplanation,
    userGuidance: isPoorQuality
      ? 'Unaweza kutuma picha iliyo wazi zaidi au kueleza sifa mahususi za kifaa unachohitaji.'
      : undefined,
    results: topResults,
    structuredQuery,
    isFallback: false
  };
}

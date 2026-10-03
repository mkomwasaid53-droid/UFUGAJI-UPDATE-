/**
 * V1.7C — AI Assisted Marketplace Classification Service
 * Phase 6: Marketplace Governance
 *
 * Core Principles:
 * 1. AI SUGGESTS -> GOVERNED CATEGORY SYSTEM VALIDATES -> HUMAN CONFIRMS -> DETERMINISTIC ACTIVE GATE.
 * 2. AI is ASSISTIVE ONLY. Never authoritative.
 * 3. AI must NOT create categories, category IDs, or activate listings.
 * 4. AI must select ONLY from active, governed, marketplace-eligible categories.
 * 5. Confidence is an AI guidance signal, NOT a trust/verification score.
 * 6. Listing Validation (V1.7B) remains the sole authoritative gate to ACTIVE status.
 */

import {
  AiClassificationResult,
  AiClassificationRequestInput,
  AiClassificationStatus,
  AiClassificationConfidence,
  AiAlternativeSuggestion
} from '../types/marketplaceAiClassification';
import { GovernedCategory } from '../types/marketplaceCategory';
import {
  getLocalCachedCategories,
  findCategoryById,
  validateProductCategoryAssignment
} from './marketplaceCategoryService';

export const AI_CLASSIFICATION_VERSION = 'V1.7C-AI-ASSIST-1.0';

// In-memory cache for cost control and avoiding redundant Gemini requests
const classificationCache = new Map<string, { result: AiClassificationResult; timestamp: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache

function computeCacheKey(input: AiClassificationRequestInput): string {
  const t = (input.title || '').trim().toLowerCase();
  const d = (input.description || '').trim().toLowerCase();
  const c = (input.sellerSelectedCategoryId || '').trim();
  const sc = (input.sellerSelectedSubcategoryId || '').trim();
  const img = input.imageUrl ? input.imageUrl.slice(-30) : '';
  return `${t}::${d.slice(0, 100)}::${c}::${sc}::${img}`;
}

/**
 * Validates any raw AI classification output deterministically against the
 * authoritative governed category taxonomy (V1.7A).
 *
 * This function is the non-negotiable security and governance boundary.
 * No AI output enters the application state without passing this check.
 */
export function validateAiClassificationOutput(
  raw: any,
  governedCategories: GovernedCategory[] = getLocalCachedCategories(),
  sellerSelectedCategoryId?: string | null
): AiClassificationResult {
  const nowIso = new Date().toISOString();

  // Defensive fallback if raw is null or not an object
  if (!raw || typeof raw !== 'object') {
    return {
      classificationStatus: 'ERROR',
      suggestedCategoryId: null,
      suggestedCategoryName: null,
      suggestedSubcategoryId: null,
      suggestedSubcategoryName: null,
      suggestedParentCategoryId: null,
      suggestedLivestockType: null,
      suggestedProductType: null,
      confidenceLevel: 'LOW',
      reason: 'Majibu ya AI si sahihi au yameharibika (Malformed AI output).',
      matchedSignals: [],
      extractedKeywords: [],
      alternativeSuggestions: [],
      isMismatchWithSellerCategory: false,
      sellerSelectedCategoryId: sellerSelectedCategoryId || null,
      classificationVersion: AI_CLASSIFICATION_VERSION,
      classifiedAt: nowIso,
      rawAiExplanation: ''
    };
  }

  // 1. Sanitize raw inputs
  const rawCategoryId = typeof raw.suggestedCategoryId === 'string' ? raw.suggestedCategoryId.trim() : null;
  const rawSubcategoryId = typeof raw.suggestedSubcategoryId === 'string' ? raw.suggestedSubcategoryId.trim() : null;
  const rawConfidence: AiClassificationConfidence =
    raw.confidenceLevel === 'HIGH' || raw.confidence === 'HIGH'
      ? 'HIGH'
      : raw.confidenceLevel === 'MEDIUM' || raw.confidence === 'MEDIUM'
      ? 'MEDIUM'
      : 'LOW';

  let rawStatus: AiClassificationStatus =
    raw.classificationStatus === 'SUGGESTED' ||
    raw.classificationStatus === 'NO_MATCH' ||
    raw.classificationStatus === 'AMBIGUOUS' ||
    raw.classificationStatus === 'NEEDS_REVIEW' ||
    raw.classificationStatus === 'MISMATCH_REVIEW' ||
    raw.classificationStatus === 'ERROR'
      ? raw.classificationStatus
      : 'SUGGESTED';

  const matchedSignals: string[] = Array.isArray(raw.matchedSignals)
    ? raw.matchedSignals.filter((s: any) => typeof s === 'string').map((s: string) => s.slice(0, 50))
    : [];

  const extractedKeywords: string[] = Array.isArray(raw.extractedKeywords)
    ? raw.extractedKeywords.filter((k: any) => typeof k === 'string').map((k: string) => k.slice(0, 30))
    : [];

  const rawExplanation = typeof raw.reason === 'string' ? raw.reason.slice(0, 300) : '';

  // 2. DETERMINISTIC CATEGORY ID VERIFICATION (V1.7A)
  // AI MUST NOT create categories. categoryName alone is NOT authoritative.
  let validCategory: GovernedCategory | null = null;
  let validSubcategory: GovernedCategory | null = null;
  let parentCategoryId: string | null = null;

  if (rawCategoryId) {
    const matched = findCategoryById(rawCategoryId, governedCategories);
    if (matched) {
      // Must be ACTIVE
      if (matched.status === 'ACTIVE') {
        validCategory = matched;
        parentCategoryId = matched.parentCategoryId || null;
      }
    }
  }

  // If AI proposed a categoryId that is not in governed active taxonomy -> REJECT IMMEDIATELY
  if (rawCategoryId && !validCategory) {
    rawStatus = 'NO_MATCH';
  }

  // 3. Subcategory verification if provided
  if (validCategory && rawSubcategoryId) {
    const matchedSub = findCategoryById(rawSubcategoryId, governedCategories);
    if (matchedSub && matchedSub.status === 'ACTIVE' && matchedSub.parentCategoryId === validCategory.categoryId) {
      validSubcategory = matchedSub;
    } else {
      // Discard invalid subcategory without crashing parent category
      validSubcategory = null;
    }
  }

  // 4. Fallback status if no valid category was found
  if (!validCategory) {
    if (rawStatus === 'SUGGESTED') {
      rawStatus = 'NO_MATCH';
    }
    return {
      classificationStatus: rawStatus,
      suggestedCategoryId: null,
      suggestedCategoryName: null,
      suggestedSubcategoryId: null,
      suggestedSubcategoryName: null,
      suggestedParentCategoryId: null,
      suggestedLivestockType: typeof raw.suggestedLivestockType === 'string' ? raw.suggestedLivestockType.slice(0, 40) : null,
      suggestedProductType: typeof raw.suggestedProductType === 'string' ? raw.suggestedProductType.slice(0, 40) : null,
      confidenceLevel: rawConfidence,
      reason: rawExplanation || 'AI haikupata category inayolingana vizuri kwenye categories zilizopo.',
      matchedSignals,
      extractedKeywords,
      alternativeSuggestions: [],
      isMismatchWithSellerCategory: false,
      sellerSelectedCategoryId: sellerSelectedCategoryId || null,
      classificationVersion: AI_CLASSIFICATION_VERSION,
      classifiedAt: nowIso,
      rawAiExplanation: rawExplanation
    };
  }

  // 5. SELLER CATEGORY MISMATCH DETECTION (V1.7C Rule 23 & 24)
  let isMismatchWithSeller = false;
  let cleanSellerCatName: string | undefined = undefined;

  if (sellerSelectedCategoryId && sellerSelectedCategoryId.trim()) {
    const cleanSellerCatId = sellerSelectedCategoryId.trim();
    const sellerCat = findCategoryById(cleanSellerCatId, governedCategories);
    if (sellerCat) {
      cleanSellerCatName = sellerCat.name;
      if (cleanSellerCatId !== validCategory.categoryId) {
        isMismatchWithSeller = true;
        rawStatus = 'MISMATCH_REVIEW';
      }
    }
  }

  // 6. Alternative suggestions verification
  const validAlternatives: AiAlternativeSuggestion[] = [];
  if (Array.isArray(raw.alternativeSuggestions)) {
    for (const alt of raw.alternativeSuggestions) {
      if (alt && typeof alt.categoryId === 'string') {
        const altCat = findCategoryById(alt.categoryId, governedCategories);
        if (altCat && altCat.status === 'ACTIVE' && altCat.categoryId !== validCategory.categoryId) {
          validAlternatives.push({
            categoryId: altCat.categoryId,
            categoryName: altCat.name,
            subcategoryId: alt.subcategoryId || null,
            subcategoryName: alt.subcategoryName || null,
            reason: typeof alt.reason === 'string' ? alt.reason.slice(0, 150) : undefined,
            confidence: alt.confidence || 'LOW'
          });
        }
      }
    }
  }

  // 7. Sanitize livestock type & product type
  const cleanLivestockType = typeof raw.suggestedLivestockType === 'string' ? raw.suggestedLivestockType.slice(0, 40) : null;
  const cleanProductType = typeof raw.suggestedProductType === 'string' ? raw.suggestedProductType.slice(0, 40) : null;

  return {
    classificationStatus: rawStatus,
    suggestedCategoryId: validCategory.categoryId,
    suggestedCategoryName: validCategory.name,
    suggestedSubcategoryId: validSubcategory ? validSubcategory.categoryId : null,
    suggestedSubcategoryName: validSubcategory ? validSubcategory.name : null,
    suggestedParentCategoryId: parentCategoryId,
    suggestedLivestockType: cleanLivestockType,
    suggestedProductType: cleanProductType,
    confidenceLevel: rawConfidence,
    reason: rawExplanation || `AI imependekeza kundi la "${validCategory.name}" kulingana na sifa za bidhaa.`,
    matchedSignals,
    extractedKeywords,
    alternativeSuggestions: validAlternatives.slice(0, 3),
    isMismatchWithSellerCategory: isMismatchWithSeller,
    sellerSelectedCategoryId: sellerSelectedCategoryId || null,
    sellerSelectedCategoryName: cleanSellerCatName,
    classificationVersion: AI_CLASSIFICATION_VERSION,
    classifiedAt: nowIso,
    rawAiExplanation: rawExplanation
  };
}

/**
 * Deterministic offline rule-based classifier that maps common Swahili/English livestock
 * and agriculture terms to existing active governed categories.
 *
 * Used when offline, during network failure, or as server fallback.
 */
export function classifyListingDeterministically(
  input: AiClassificationRequestInput,
  governedCategories: GovernedCategory[] = getLocalCachedCategories()
): AiClassificationResult {
  const combined = `${input.title || ''} ${input.description || ''}`.toLowerCase();
  const nowIso = new Date().toISOString();

  // Extract signals & keywords
  const tokens = combined.replace(/[^a-zA-Z0-9\s]/g, ' ').split(/\s+/).filter((t) => t.length > 2);
  const uniqueTokens = Array.from(new Set(tokens)).slice(0, 8);

  // Keyword rules targeting authoritative seed categories
  // 1. Poultry feeds
  if (
    combined.includes('chakula') ||
    combined.includes('layers') ||
    combined.includes('broiler') ||
    combined.includes('grower') ||
    combined.includes('pumba') ||
    combined.includes('mashudu') ||
    combined.includes('feed')
  ) {
    const cat = findCategoryById('cat_chakula_cha_mifugo', governedCategories);
    const sub = combined.includes('kuku') ? findCategoryById('cat_sub_poultry_feed', governedCategories) : null;
    if (cat && cat.status === 'ACTIVE') {
      return validateAiClassificationOutput(
        {
          classificationStatus: 'SUGGESTED',
          suggestedCategoryId: cat.categoryId,
          suggestedSubcategoryId: sub?.categoryId || null,
          suggestedLivestockType: combined.includes('kuku') ? 'Poultry / Kuku' : 'Mifugo',
          suggestedProductType: 'Feed / Chakula',
          confidenceLevel: 'HIGH',
          reason: 'Imebainika kuwa ni chakula cha mifugo/kuku kulingana na maneno ya bidhaa.',
          matchedSignals: ['chakula', 'lishe'],
          extractedKeywords: uniqueTokens
        },
        governedCategories,
        input.sellerSelectedCategoryId
      );
    }
  }

  // 2. Equipment / Incubator / Feeders
  if (
    combined.includes('incubator') ||
    combined.includes('totolesha') ||
    combined.includes('feeder') ||
    combined.includes('drinker') ||
    combined.includes('chombo') ||
    combined.includes('chaff cutter') ||
    combined.includes('kizimba') ||
    combined.includes('mashine')
  ) {
    const cat = findCategoryById('cat_vifaa_vya_ufugaji', governedCategories);
    let sub = null;
    if (combined.includes('incubator') || combined.includes('totolesha')) {
      sub = findCategoryById('cat_sub_incubators', governedCategories);
    } else if (combined.includes('feeder') || combined.includes('drinker') || combined.includes('kunyweshea') || combined.includes('kulishia')) {
      sub = findCategoryById('cat_sub_feeders_drinkers', governedCategories);
    }
    if (cat && cat.status === 'ACTIVE') {
      return validateAiClassificationOutput(
        {
          classificationStatus: 'SUGGESTED',
          suggestedCategoryId: cat.categoryId,
          suggestedSubcategoryId: sub?.categoryId || null,
          suggestedLivestockType: combined.includes('kuku') ? 'Poultry / Kuku' : 'Mifugo',
          suggestedProductType: 'Equipment / Kifaa',
          confidenceLevel: 'HIGH',
          reason: 'Imebainika kuwa ni kifaa cha ufugaji kulingana na sifa zilizoelezwa.',
          matchedSignals: ['kifaa', 'mashine'],
          extractedKeywords: uniqueTokens
        },
        governedCategories,
        input.sellerSelectedCategoryId
      );
    }
  }

  // 3. Veterinary medicines / vaccines
  if (
    combined.includes('chanjo') ||
    combined.includes('dawa') ||
    combined.includes('antibiotic') ||
    combined.includes('minyoo') ||
    combined.includes('vitamini') ||
    combined.includes('oxytetracycline') ||
    combined.includes('gumboro') ||
    combined.includes('kideri')
  ) {
    const cat = findCategoryById('cat_dawa_za_mifugo', governedCategories);
    let sub = null;
    if (combined.includes('chanjo') || combined.includes('vaccine')) {
      sub = findCategoryById('cat_sub_chanjo', governedCategories);
    } else if (combined.includes('antibiotic') || combined.includes('viua')) {
      sub = findCategoryById('cat_sub_antibiotics', governedCategories);
    } else if (combined.includes('vitamini') || combined.includes('madini')) {
      sub = findCategoryById('cat_sub_vitamini', governedCategories);
    }
    if (cat && cat.status === 'ACTIVE') {
      return validateAiClassificationOutput(
        {
          classificationStatus: 'SUGGESTED',
          suggestedCategoryId: cat.categoryId,
          suggestedSubcategoryId: sub?.categoryId || null,
          suggestedLivestockType: 'Mifugo',
          suggestedProductType: 'Veterinary Product',
          confidenceLevel: 'HIGH',
          reason: 'Imebainika kuwa ni bidhaa ya afya au dawa ya mifugo (Kategoria ya sokoni pekee; si ushauri wa kimatibabu).',
          matchedSignals: ['dawa', 'afya ya mifugo'],
          extractedKeywords: uniqueTokens
        },
        governedCategories,
        input.sellerSelectedCategoryId
      );
    }
  }

  // 4. Live livestock
  if (
    combined.includes('kuku') ||
    combined.includes('vifaranga') ||
    combined.includes('ng\'ombe') ||
    combined.includes('ngombe') ||
    combined.includes('mbuzi') ||
    combined.includes('kondoo') ||
    combined.includes('nguruwe') ||
    combined.includes('ndama')
  ) {
    const cat = findCategoryById('cat_mifugo_hai', governedCategories);
    let sub = null;
    let lType = 'Mifugo';
    if (combined.includes('kuku') || combined.includes('vifaranga')) {
      sub = findCategoryById('cat_sub_kuku_vifaranga', governedCategories);
      lType = 'Poultry / Kuku';
    } else if (combined.includes('ng\'ombe') || combined.includes('ngombe') || combined.includes('maziwa') || combined.includes('ndama')) {
      sub = findCategoryById('cat_sub_ngombe', governedCategories);
      lType = 'Cattle / Ng\'ombe';
    } else if (combined.includes('mbuzi') || combined.includes('kondoo')) {
      sub = findCategoryById('cat_sub_mbuzi_kondoo', governedCategories);
      lType = 'Goats & Sheep';
    }
    if (cat && cat.status === 'ACTIVE') {
      return validateAiClassificationOutput(
        {
          classificationStatus: 'SUGGESTED',
          suggestedCategoryId: cat.categoryId,
          suggestedSubcategoryId: sub?.categoryId || null,
          suggestedLivestockType: lType,
          suggestedProductType: 'Live Animal / Mnyama Hai',
          confidenceLevel: 'HIGH',
          reason: 'Imebainika kuwa ni mnyama au ndege hai wa mfugaji.',
          matchedSignals: ['mnyama hai'],
          extractedKeywords: uniqueTokens
        },
        governedCategories,
        input.sellerSelectedCategoryId
      );
    }
  }

  // 5. Animal products (Eggs, Milk)
  if (combined.includes('mayai') || combined.includes('trei') || combined.includes('maziwa')) {
    const cat = findCategoryById('cat_mazao_ya_mifugo', governedCategories);
    let sub = null;
    if (combined.includes('mayai')) sub = findCategoryById('cat_sub_mayai', governedCategories);
    if (combined.includes('maziwa')) sub = findCategoryById('cat_sub_maziwa', governedCategories);
    if (cat && cat.status === 'ACTIVE') {
      return validateAiClassificationOutput(
        {
          classificationStatus: 'SUGGESTED',
          suggestedCategoryId: cat.categoryId,
          suggestedSubcategoryId: sub?.categoryId || null,
          suggestedLivestockType: combined.includes('mayai') ? 'Poultry / Kuku' : 'Cattle / Ng\'ombe',
          suggestedProductType: 'Livestock Produce',
          confidenceLevel: 'HIGH',
          reason: 'Imebainika kuwa ni zao la mifugo (mayai/maziwa).',
          matchedSignals: ['zao la mifugo'],
          extractedKeywords: uniqueTokens
        },
        governedCategories,
        input.sellerSelectedCategoryId
      );
    }
  }

  // Default if no specific keywords matched
  return {
    classificationStatus: 'NO_MATCH',
    suggestedCategoryId: null,
    suggestedCategoryName: null,
    suggestedSubcategoryId: null,
    suggestedSubcategoryName: null,
    suggestedParentCategoryId: null,
    suggestedLivestockType: null,
    suggestedProductType: null,
    confidenceLevel: 'LOW',
    reason: 'AI haikupata category inayolingana vizuri kwenye categories zilizopo za sokoni. Tafadhali chagua wewe mwenyewe.',
    matchedSignals: [],
    extractedKeywords: uniqueTokens,
    alternativeSuggestions: [],
    isMismatchWithSellerCategory: false,
    sellerSelectedCategoryId: input.sellerSelectedCategoryId || null,
    classificationVersion: AI_CLASSIFICATION_VERSION,
    classifiedAt: nowIso,
    rawAiExplanation: '',
    isDeterministicFallback: true
  };
}

/**
 * Public function to request AI-assisted listing classification.
 * Connects to server-side Gemini route `/api/marketplace/ai-classify`
 * with client-side caching, privacy filtering, and deterministic fallback.
 */
export async function requestAiListingClassification(
  input: AiClassificationRequestInput,
  options?: { signal?: AbortSignal }
): Promise<AiClassificationResult> {
  const cacheKey = computeCacheKey(input);
  const cached = classificationCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.result;
  }

  const governedCategories = getLocalCachedCategories();

  try {
    const response = await fetch('/api/marketplace/ai-classify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        title: input.title,
        description: input.description,
        sellerSelectedCategoryId: input.sellerSelectedCategoryId,
        sellerSelectedSubcategoryId: input.sellerSelectedSubcategoryId,
        sellerSelectedCategoryName: input.sellerSelectedCategoryName,
        livestockType: input.livestockType,
        productType: input.productType,
        imageUrl: input.imageUrl
      }),
      signal: options?.signal
    });

    if (response.ok) {
      const data = await response.json();
      const validated = validateAiClassificationOutput(
        data,
        governedCategories,
        input.sellerSelectedCategoryId
      );
      classificationCache.set(cacheKey, { result: validated, timestamp: Date.now() });
      return validated;
    }
  } catch (err) {
    // Network or server error - gracefully fall back to deterministic classifier
    console.warn('[AI Classification Service] Server request failed, using deterministic fallback:', err);
  }

  // Graceful deterministic fallback
  const fallback = classifyListingDeterministically(input, governedCategories);
  classificationCache.set(cacheKey, { result: fallback, timestamp: Date.now() });
  return fallback;
}

/**
 * V1.3A — VISUAL PRODUCT INTENT
 * MarketplaceQueryNormalizer & Server Validator
 *
 * Implements strict query safety, field sanitization, and structured result validation.
 * Raw AI output is untrusted and must never execute arbitrary Firestore queries.
 */

import {
  RawVisualMarketplaceQuery,
  NormalizedVisualMarketplaceQuery,
  StructuredVisualMarketplaceQuery,
  VisualMarketplaceAttribute,
  VideoProductUnderstanding,
  VisualSourceType,
  VisualMarketplaceIntentType,
  VisualIntentConfidence,
  VisualMarketplaceIntentResult,
  VisualProductIntentStructuredResult
} from '../types/visualMarketplace';
import { TANZANIA_REGIONS_LIST } from './marketplaceIntentClassifier';

// Strict whitelist of supported visual intent types (V1.3A Section 4 & 14)
export const VALID_INTENT_TYPES: Set<VisualMarketplaceIntentType> = new Set([
  'VISUAL_PRODUCT_SEARCH',
  'VISUAL_PRODUCT_NEED',
  'VISUAL_PRODUCT_IDENTIFICATION',
  'VISUAL_PRODUCT_INFORMATION',
  'NON_PRODUCT_VISUAL',
  'VETERINARY_VISUAL',
  'UNCERTAIN_VISUAL_INTENT',
  'NO_MARKETPLACE_INTENT'
]);

// Strict whitelist of supported confidence levels (V1.3A Section 8)
export const VALID_CONFIDENCE_LEVELS: Set<VisualIntentConfidence> = new Set([
  'HIGH',
  'MEDIUM',
  'LOW'
]);

// Approved marketplace category mappings
const KNOWN_MARKETPLACE_CATEGORIES = [
  'Vifaa na Mashine',
  'Chakula cha Mifugo',
  'Dawa za Mifugo',
  'Vifaranga',
  'Kuku',
  'Mayai',
  'Ng\'ombe',
  'Mbuzi',
  'Kondoo',
  'Nguruwe',
  'Sungura',
  'Samaki',
  'Mbolea na Mazao',
  'Mbegu za Malisho'
];

/**
 * Sanitizes single-line plain text strings, removing control characters, HTML tags, and excessive spaces.
 */
export function sanitizeQueryString(input: unknown, maxLength = 120): string {
  if (typeof input !== 'string') return '';
  // Strip html tags, null bytes, control characters
  const clean = input
    .replace(/<[^>]*>?/gm, '')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .trim();
  return clean.slice(0, maxLength);
}

/**
 * Validates and sanitizes a geographical region against recognized Tanzania regions.
 */
export function sanitizeRegion(input: unknown): string | undefined {
  if (typeof input !== 'string' || !input.trim()) return undefined;
  const target = input.trim().toLowerCase();
  const matched = TANZANIA_REGIONS_LIST.find(
    (region) => region.toLowerCase() === target || target.includes(region.toLowerCase())
  );
  return matched || undefined;
}

/**
 * MarketplaceQueryNormalizer
 *
 * Enforces strict whitelist of approved query fields.
 * Explicitly discards dangerous fields like collection, path, _id, token, uid, sellerPhone, admin.
 */
export function normalizeVisualMarketplaceQuery(
  raw: RawVisualMarketplaceQuery,
  options?: {
    fallbackSource?: VisualSourceType;
    fallbackLocation?: string;
    hasCommercialSignal?: boolean;
    isMedicalRestricted?: boolean;
  }
): NormalizedVisualMarketplaceQuery | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  // 1. Source validation
  const rawSource = typeof raw.source === 'string' ? raw.source.toLowerCase() : '';
  const source: VisualSourceType =
    rawSource === 'video' || rawSource === 'image'
      ? (rawSource as VisualSourceType)
      : options?.fallbackSource || 'image';

  // 2. Intent validation
  const rawIntent = typeof raw.intent === 'string' ? raw.intent.toUpperCase() : (typeof raw.intentType === 'string' ? raw.intentType.toUpperCase() : '');
  const intent: VisualMarketplaceIntentType = VALID_INTENT_TYPES.has(
    rawIntent as VisualMarketplaceIntentType
  )
    ? (rawIntent as VisualMarketplaceIntentType)
    : 'NO_MARKETPLACE_INTENT';

  // 3. Confidence validation
  const rawConfidence = typeof raw.confidence === 'string' ? raw.confidence.toUpperCase() : '';
  const confidence: VisualIntentConfidence = VALID_CONFIDENCE_LEVELS.has(
    rawConfidence as VisualIntentConfidence
  )
    ? (rawConfidence as VisualIntentConfidence)
    : 'LOW';

  let confidenceScore = 0.5;
  if (typeof raw.confidenceScore === 'number' && !isNaN(raw.confidenceScore)) {
    confidenceScore = Math.max(0.0, Math.min(1.0, raw.confidenceScore));
  } else {
    if (confidence === 'HIGH') confidenceScore = 0.9;
    else if (confidence === 'MEDIUM') confidenceScore = 0.65;
    else confidenceScore = 0.35;
  }

  // 4. Visual Object & Product Concept (sanitized, conservative)
  const rawVisualObj = typeof raw.visualObject === 'string' ? sanitizeQueryString(raw.visualObject, 80) : null;
  const visualObject = rawVisualObj && rawVisualObj !== 'null' && rawVisualObj !== 'undefined' ? rawVisualObj : null;
  const productConcept = sanitizeQueryString(raw.productConcept, 100);

  // 5. Category and Subcategory
  let category: string | undefined = undefined;
  if (typeof raw.category === 'string' && raw.category.trim()) {
    const rawCatClean = raw.category.trim();
    const matchedKnown = KNOWN_MARKETPLACE_CATEGORIES.find(
      (c) => c.toLowerCase() === rawCatClean.toLowerCase()
    );
    category = matchedKnown || sanitizeQueryString(rawCatClean, 60);
  }

  const subcategory =
    typeof raw.subcategory === 'string' && raw.subcategory.trim()
      ? sanitizeQueryString(raw.subcategory, 80)
      : undefined;

  // 6. Attributes list (whitelist: array of clean strings, max 8 items, max 40 chars each)
  const attributes: string[] = [];
  if (Array.isArray(raw.attributes)) {
    for (const attr of raw.attributes) {
      if (typeof attr === 'string' && attr.trim()) {
        const cleanAttr = sanitizeQueryString(attr, 40);
        if (cleanAttr && !attributes.includes(cleanAttr) && attributes.length < 8) {
          attributes.push(cleanAttr);
        }
      }
    }
  }

  // 7. Livestock Use
  const livestockUse =
    typeof raw.livestockUse === 'string' && raw.livestockUse.trim()
      ? sanitizeQueryString(raw.livestockUse, 50)
      : undefined;

  // 8. Location: Region & District
  const region =
    sanitizeRegion(raw.region) ||
    sanitizeRegion(raw.location) ||
    sanitizeRegion(options?.fallbackLocation);

  const district =
    typeof raw.district === 'string' && raw.district.trim()
      ? sanitizeQueryString(raw.district, 50)
      : undefined;

  // 9. Price preference (numeric bounds only)
  let pricePreference: { min?: number; max?: number } | null = null;
  if (raw.pricePreference && typeof raw.pricePreference === 'object') {
    const min =
      typeof (raw.pricePreference as any).min === 'number' && (raw.pricePreference as any).min >= 0
        ? (raw.pricePreference as any).min
        : undefined;
    const max =
      typeof (raw.pricePreference as any).max === 'number' && (raw.pricePreference as any).max >= (min || 0)
        ? (raw.pricePreference as any).max
        : undefined;
    if (min !== undefined || max !== undefined) {
      pricePreference = { min, max };
    }
  }

  // 10. Stock preference
  let stockPreference: 'in_stock' | 'any' | null = null;
  if (raw.stockPreference === 'in_stock' || raw.stockPreference === 'any') {
    stockPreference = raw.stockPreference;
  }

  // 11. Commercial & Medical restrictions
  const hasCommercialSignal = Boolean(
    options?.hasCommercialSignal ?? (raw.hasCommercialSignal as boolean | undefined) ?? (raw.commercialIntent as boolean | undefined)
  );
  const isMedicalSafetyRestricted = Boolean(
    options?.isMedicalRestricted ?? (raw.isMedicalSafetyRestricted as boolean | undefined)
  );

  // 12. Reasoning Signals (sanitized categorical array, max 8 items)
  const reasoningSignals: string[] = [];
  if (Array.isArray(raw.reasoningSignals)) {
    for (const sig of raw.reasoningSignals) {
      if (typeof sig === 'string' && sig.trim()) {
        const cleanSig = sanitizeQueryString(sig, 50);
        if (cleanSig && !reasoningSignals.includes(cleanSig) && reasoningSignals.length < 8) {
          reasoningSignals.push(cleanSig);
        }
      }
    }
  }

  const clarificationPrompt = typeof raw.clarificationPrompt === 'string' && raw.clarificationPrompt.trim()
    ? sanitizeQueryString(raw.clarificationPrompt, 160)
    : null;

  return {
    source,
    intent,
    productConcept: productConcept || (visualObject ? visualObject : (category ? category : 'Bidhaa ya Mifugo')),
    visualObject,
    category,
    subcategory,
    attributes,
    livestockUse,
    region,
    district,
    pricePreference,
    stockPreference,
    confidence,
    confidenceScore,
    commercialIntent: hasCommercialSignal && (intent === 'VISUAL_PRODUCT_SEARCH' || intent === 'VISUAL_PRODUCT_NEED'),
    hasCommercialSignal,
    isMedicalSafetyRestricted,
    reasoningSignals,
    clarificationPrompt
  };
}

/**
 * V1.3B Query Validator (Section 20)
 * Validates and sanitizes all fields of StructuredVisualMarketplaceQuery before retrieval.
 * Whitelists safe fields:
 * - source, intentType, productConcept, category, subcategory, attributes,
 *   livestockUse, region, district, pricePreference, stockPreference, visualConfidence.
 * Explicitly rejects/ignores:
 * - Firestore paths, collection names, seller private fields, admin fields,
 *   verification internals, arbitrary database operators, security rule instructions,
 *   URLs generated by the model, arbitrary code.
 */
export function validateAndSanitizeStructuredQuery(
  raw: unknown
): StructuredVisualMarketplaceQuery | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const r = raw as Record<string, any>;

  // Reject dangerous properties
  const DANGEROUS_KEYS = ['path', 'collection', 'operator', '$where', 'where', 'limit', 'orderBy', 'admin', 'token', 'uid', 'sellerPhone'];
  for (const k of DANGEROUS_KEYS) {
    if (k in r) {
      delete r[k];
    }
  }

  // 1. Source
  const source: 'image' | 'video' = r.source === 'video' ? 'video' : 'image';

  // 2. IntentType (Section 7 whitelist)
  const intentType: 'VISUAL_PRODUCT_SEARCH' | 'VISUAL_PRODUCT_NEED' =
    r.intentType === 'VISUAL_PRODUCT_NEED' ? 'VISUAL_PRODUCT_NEED' : 'VISUAL_PRODUCT_SEARCH';

  // 3. Product Concept
  const rawProduct = typeof r.productConcept === 'string' ? sanitizeQueryString(r.productConcept, 100) : null;
  const productConcept = rawProduct && rawProduct !== 'null' ? rawProduct : null;

  // 4. Category & Subcategory
  let category: string | null = null;
  if (typeof r.category === 'string' && r.category.trim()) {
    const rawCatClean = r.category.trim();
    const matchedKnown = KNOWN_MARKETPLACE_CATEGORIES.find(
      (c) => c.toLowerCase() === rawCatClean.toLowerCase()
    );
    category = matchedKnown || sanitizeQueryString(rawCatClean, 60) || null;
  }

  const subcategory =
    typeof r.subcategory === 'string' && r.subcategory.trim()
      ? sanitizeQueryString(r.subcategory, 80)
      : null;

  // 5. Attributes (Section 7 & 15: Array of { name, value, confidence })
  const attributes: VisualMarketplaceAttribute[] = [];
  if (Array.isArray(r.attributes)) {
    for (const attr of r.attributes) {
      if (attr && typeof attr === 'object') {
        const name = typeof attr.name === 'string' ? sanitizeQueryString(attr.name, 40) : '';
        const value = typeof attr.value === 'string' ? sanitizeQueryString(attr.value, 60) : '';
        const confRaw = typeof attr.confidence === 'string' ? attr.confidence.toUpperCase() : '';
        const confidence: 'HIGH' | 'MEDIUM' | 'LOW' =
          confRaw === 'HIGH' || confRaw === 'MEDIUM' || confRaw === 'LOW' ? confRaw : 'MEDIUM';

        if (name && value && attributes.length < 8) {
          attributes.push({ name, value, confidence });
        }
      } else if (typeof attr === 'string' && attr.trim() && attributes.length < 8) {
        attributes.push({
          name: 'feature',
          value: sanitizeQueryString(attr, 60),
          confidence: 'MEDIUM'
        });
      }
    }
  }

  // 6. Livestock Use
  const livestockUse =
    typeof r.livestockUse === 'string' && r.livestockUse.trim()
      ? sanitizeQueryString(r.livestockUse, 50)
      : null;

  // 7. Region & District
  const region = sanitizeRegion(r.region) || null;
  const district =
    typeof r.district === 'string' && r.district.trim()
      ? sanitizeQueryString(r.district, 50)
      : null;

  // 8. Price Preference (Section 12: numeric bounds only)
  let pricePreference: { min: number | null; max: number | null } = { min: null, max: null };
  if (r.pricePreference && typeof r.pricePreference === 'object') {
    const minVal = typeof r.pricePreference.min === 'number' && r.pricePreference.min >= 0 ? r.pricePreference.min : null;
    const maxVal = typeof r.pricePreference.max === 'number' && r.pricePreference.max >= (minVal || 0) ? r.pricePreference.max : null;
    pricePreference = { min: minVal, max: maxVal };
  }

  // 9. Stock Preference (Section 13: boolean or null)
  let stockPreference: boolean | null = null;
  if (typeof r.stockPreference === 'boolean') {
    stockPreference = r.stockPreference;
  } else if (r.stockPreference === 'in_stock') {
    stockPreference = true;
  }

  // 10. Visual Confidence (Section 7: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNCERTAIN')
  let visualConfidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNCERTAIN' = 'MEDIUM';
  if (r.visualConfidence === 'HIGH' || r.visualConfidence === 'MEDIUM' || r.visualConfidence === 'LOW' || r.visualConfidence === 'UNCERTAIN') {
    visualConfidence = r.visualConfidence;
  } else if (r.confidence === 'HIGH' || r.confidence === 'LOW') {
    visualConfidence = r.confidence;
  }

  // 11. Video Product Understanding (V1.3C Section 5)
  let videoUnderstanding: VideoProductUnderstanding | null = null;
  if (r.videoUnderstanding && typeof r.videoUnderstanding === 'object') {
    const vu = r.videoUnderstanding as Record<string, any>;
    const rawAttrs = Array.isArray(vu.visibleAttributes)
      ? vu.visibleAttributes.map((a: any) => typeof a === 'string' ? sanitizeQueryString(a, 60) : '').filter(Boolean).slice(0, 8)
      : undefined;
    const rawNotes = Array.isArray(vu.qualityNotes)
      ? vu.qualityNotes.map((n: any) => typeof n === 'string' ? sanitizeQueryString(n, 100) : '').filter(Boolean).slice(0, 5)
      : undefined;

    videoUnderstanding = {
      productConcept: typeof vu.productConcept === 'string' ? sanitizeQueryString(vu.productConcept, 80) : undefined,
      category: typeof vu.category === 'string' ? sanitizeQueryString(vu.category, 60) : undefined,
      subcategory: typeof vu.subcategory === 'string' ? sanitizeQueryString(vu.subcategory, 60) : undefined,
      visibleAttributes: rawAttrs && rawAttrs.length > 0 ? rawAttrs : undefined,
      intendedUse: typeof vu.intendedUse === 'string' ? sanitizeQueryString(vu.intendedUse, 60) : undefined,
      livestockUse: typeof vu.livestockUse === 'string' ? sanitizeQueryString(vu.livestockUse, 50) : undefined,
      visibleBrand: typeof vu.visibleBrand === 'string' ? sanitizeQueryString(vu.visibleBrand, 50) : undefined,
      visibleModel: typeof vu.visibleModel === 'string' ? sanitizeQueryString(vu.visibleModel, 50) : undefined,
      visibleSize: typeof vu.visibleSize === 'string' ? sanitizeQueryString(vu.visibleSize, 40) : undefined,
      visibleLabelText: typeof vu.visibleLabelText === 'string' ? sanitizeQueryString(vu.visibleLabelText, 80) : undefined,
      visualConfidence: vu.visualConfidence === 'HIGH' || vu.visualConfidence === 'LOW' ? vu.visualConfidence : 'MEDIUM',
      temporalConfidence: vu.temporalConfidence === 'HIGH' || vu.temporalConfidence === 'LOW' ? vu.temporalConfidence : 'MEDIUM',
      qualityNotes: rawNotes && rawNotes.length > 0 ? rawNotes : undefined
    };
  }

  return {
    source,
    intentType,
    productConcept,
    category,
    subcategory,
    attributes,
    livestockUse,
    region,
    district,
    pricePreference,
    stockPreference,
    visualConfidence,
    videoUnderstanding
  };
}

/**
 * Server-side validation for raw AI-generated visual intent result.
 * Validates enums, sanitizes strings, checks booleans, and ensures boundaries are preserved.
 */
export function validateAndSanitizeVisualIntentResult(raw: unknown): VisualMarketplaceIntentResult {
  if (!raw || typeof raw !== 'object') {
    return {
      detected: false,
      intent: 'NO_MARKETPLACE_INTENT',
      intentType: 'NO_MARKETPLACE_INTENT',
      confidence: 'LOW',
      confidenceScore: 0.1,
      commercialIntent: false,
      visualObject: null,
      source: 'image',
      hasExplicitCommercialSignal: false,
      isMedicalRestricted: false,
      explanation: 'Taarifa za nia ya kuona haziwezi kusomwa.',
      reasoningSignals: ['invalid_raw_payload'],
      matchedCues: [],
      clarificationPrompt: null,
      normalizedQuery: null,
      structuredQuery: null
    };
  }

  const r = raw as Record<string, any>;

  // Validate Source
  const source: VisualSourceType = r.source === 'video' ? 'video' : 'image';

  // Validate Intent Type
  const rawIntentStr = typeof r.intentType === 'string' ? r.intentType : (typeof r.intent === 'string' ? r.intent : '');
  const intent: VisualMarketplaceIntentType = VALID_INTENT_TYPES.has(rawIntentStr as VisualMarketplaceIntentType)
    ? (rawIntentStr as VisualMarketplaceIntentType)
    : 'NO_MARKETPLACE_INTENT';

  // Validate Confidence
  const rawConfStr = typeof r.confidence === 'string' ? r.confidence.toUpperCase() : '';
  const confidence: VisualIntentConfidence = VALID_CONFIDENCE_LEVELS.has(rawConfStr as VisualIntentConfidence)
    ? (rawConfStr as VisualIntentConfidence)
    : 'LOW';

  const confidenceScore = typeof r.confidenceScore === 'number' && !isNaN(r.confidenceScore)
    ? Math.max(0.0, Math.min(1.0, r.confidenceScore))
    : (confidence === 'HIGH' ? 0.9 : (confidence === 'MEDIUM' ? 0.65 : 0.35));

  // Medical Safety & Commercial checks
  const isMedicalRestricted = Boolean(r.isMedicalRestricted || r.isMedicalSafetyRestricted);
  const rawCommercial = Boolean(r.commercialIntent || r.hasExplicitCommercialSignal);
  const commercialIntent = !isMedicalRestricted && rawCommercial && (intent === 'VISUAL_PRODUCT_SEARCH' || intent === 'VISUAL_PRODUCT_NEED');

  // Sanitize Visual Object (conservative product concept)
  const visualObject = typeof r.visualObject === 'string' && r.visualObject.trim() && r.visualObject !== 'null'
    ? sanitizeQueryString(r.visualObject, 80)
    : null;

  // Sanitize Reasoning Signals
  const reasoningSignals: string[] = [];
  if (Array.isArray(r.reasoningSignals)) {
    for (const item of r.reasoningSignals) {
      if (typeof item === 'string' && item.trim()) {
        const cleanItem = sanitizeQueryString(item, 50);
        if (cleanItem && !reasoningSignals.includes(cleanItem) && reasoningSignals.length < 8) {
          reasoningSignals.push(cleanItem);
        }
      }
    }
  }

  // Matched cues
  const matchedCues: string[] = [];
  if (Array.isArray(r.matchedCues)) {
    for (const cue of r.matchedCues) {
      if (typeof cue === 'string' && cue.trim()) {
        const cleanCue = sanitizeQueryString(cue, 50);
        if (cleanCue && !matchedCues.includes(cleanCue) && matchedCues.length < 8) {
          matchedCues.push(cleanCue);
        }
      }
    }
  }

  // Clarification prompt
  const clarificationPrompt = typeof r.clarificationPrompt === 'string' && r.clarificationPrompt.trim()
    ? sanitizeQueryString(r.clarificationPrompt, 160)
    : null;

  // Explanation
  const explanation = sanitizeQueryString(r.explanation || '', 180) || (
    commercialIntent ? 'Nia ya kibiashara imetambuliwa.' : 'Hakuna nia ya kibiashara sokoni.'
  );

  // Structured Query Validation (V1.3B)
  let structuredQuery: StructuredVisualMarketplaceQuery | null = null;
  if (commercialIntent && r.structuredQuery) {
    structuredQuery = validateAndSanitizeStructuredQuery(r.structuredQuery);
  }

  // Normalized Query
  let normalizedQuery: NormalizedVisualMarketplaceQuery | null = null;
  if (commercialIntent && (r.normalizedQuery || visualObject || structuredQuery)) {
    normalizedQuery = normalizeVisualMarketplaceQuery(r.normalizedQuery || {
      source,
      intent,
      visualObject,
      productConcept: structuredQuery?.productConcept || visualObject || 'Kifaa cha Mifugo',
      confidence,
      confidenceScore,
      commercialIntent,
      reasoningSignals,
      clarificationPrompt
    }, {
      fallbackSource: source,
      hasCommercialSignal: commercialIntent,
      isMedicalRestricted
    });

    if (normalizedQuery && structuredQuery) {
      normalizedQuery.structuredQuery = structuredQuery;
    }
  }

  return {
    detected: commercialIntent,
    intent,
    intentType: intent,
    confidence,
    confidenceScore,
    commercialIntent,
    visualObject,
    source,
    hasExplicitCommercialSignal: Boolean(r.hasExplicitCommercialSignal || commercialIntent),
    isMedicalRestricted,
    explanation,
    reasoningSignals,
    matchedCues,
    clarificationPrompt,
    normalizedQuery,
    structuredQuery
  };
}

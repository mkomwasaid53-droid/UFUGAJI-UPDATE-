/**
 * V1.3A — VISUAL PRODUCT INTENT
 * Core type definitions for Visual Product Intent architecture.
 *
 * Principles:
 * 1. VISUAL UNDERSTANDING ≠ MARKETPLACE TRUTH
 *    AI interprets visual content; Marketplace determines real products, sellers, prices, stock, and locations.
 * 2. Visual attachment alone is evidence about what is shown; it is NOT automatically evidence of purchase intent.
 * 3. Controlled intent enum strictly distinguishes commercial intent from educational/functional/veterinary content.
 * 4. Animal distress or medical questions must never trigger automatic medication shopping.
 * 5. Multi-turn conversation context preserves visual references across subsequent turns without persisting raw media.
 * 6. Strict query normalization prevents arbitrary Firestore queries or security bypasses.
 */

export type VisualSourceType = 'image' | 'video';
import { ProductTrustSignals } from './marketplaceTrust';

/**
 * Controlled Visual Intent enum (V1.3A Section 4 & 14)
 */
export type VisualMarketplaceIntentType =
  | 'VISUAL_PRODUCT_SEARCH'
  | 'VISUAL_PRODUCT_NEED'
  | 'VISUAL_PRODUCT_IDENTIFICATION'
  | 'VISUAL_PRODUCT_INFORMATION'
  | 'NON_PRODUCT_VISUAL'
  | 'VETERINARY_VISUAL'
  | 'UNCERTAIN_VISUAL_INTENT'
  | 'HISTORICAL_MEDIA_UNAVAILABLE'
  | 'NO_MARKETPLACE_INTENT';

export type VisualIntentConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * Controlled structured result schema (V1.3A Section 14)
 */
export interface VisualProductIntentStructuredResult {
  intentType: VisualMarketplaceIntentType;
  confidence: VisualIntentConfidence;
  commercialIntent: boolean;
  visualObject: string | null;
  reasoningSignals: string[];
  clarificationPrompt?: string | null;
}

/**
 * Minimal safe conversation message metadata for multi-turn visual intent continuity (V1.3A Section 6, 7, 19)
 */
export interface VisualConversationHistoryMessage {
  role: 'user' | 'model';
  text?: string;
  hasImage?: boolean;
  hasVideo?: boolean;
  visualObject?: string | null;
  visualIntent?: VisualMarketplaceIntentType;
  productConcept?: string;
  structuredQuery?: StructuredVisualMarketplaceQuery | null;
}

/**
 * Raw untrusted query attributes that may be extracted from AI vision understanding.
 * MUST be validated and sanitized by MarketplaceQueryNormalizer before any query execution.
 */
export interface RawVisualMarketplaceQuery {
  source?: unknown;
  intent?: unknown;
  intentType?: unknown;
  productConcept?: unknown;
  visualObject?: unknown;
  category?: unknown;
  subcategory?: unknown;
  attributes?: unknown;
  livestockUse?: unknown;
  location?: unknown;
  region?: unknown;
  district?: unknown;
  pricePreference?: unknown;
  stockPreference?: unknown;
  confidence?: unknown;
  confidenceScore?: unknown;
  commercialIntent?: unknown;
  reasoningSignals?: unknown;
  clarificationPrompt?: unknown;
  [key: string]: unknown; // Raw untrusted input may have excess fields
}

/**
 * V1.3B Visual Marketplace Attribute with confidence
 */
export interface VisualMarketplaceAttribute {
  name: string;
  value: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

/**
 * V1.3C Video Product Understanding (Section 5)
 * Captures temporal and operational observations across frames without hallucinating exact brands or specs.
 */
export interface VideoProductUnderstanding {
  productConcept?: string;
  category?: string;
  subcategory?: string;
  visibleAttributes?: string[];
  intendedUse?: string;
  livestockUse?: string;
  visibleBrand?: string;
  visibleModel?: string;
  visibleSize?: string;
  visibleLabelText?: string;
  visibleLabels?: string[];
  visualConfidence: 'HIGH' | 'MEDIUM' | 'LOW';
  temporalConfidence: 'HIGH' | 'MEDIUM' | 'LOW';
  qualityNotes?: string[];
}

/**
 * V1.3B & V1.3C Controlled Structured Marketplace Query (Section 7)
 */
export interface StructuredVisualMarketplaceQuery {
  source: 'image' | 'video';
  intentType: 'VISUAL_PRODUCT_SEARCH' | 'VISUAL_PRODUCT_NEED';
  productConcept: string | null;
  category: string | null;
  subcategory: string | null;
  attributes: VisualMarketplaceAttribute[];
  livestockUse: string | null;
  region: string | null;
  district: string | null;
  pricePreference: {
    min: number | null;
    max: number | null;
  };
  stockPreference: boolean | null;
  visualConfidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNCERTAIN';
  videoUnderstanding?: VideoProductUnderstanding | null;
}

/**
 * Strictly normalized and validated query structure.
 * Only approved fields are preserved. All arbitrary, private, or database fields are rejected.
 */
export interface NormalizedVisualMarketplaceQuery {
  source: VisualSourceType;
  intent: VisualMarketplaceIntentType;
  productConcept: string;
  visualObject: string | null;
  category?: string;
  subcategory?: string;
  attributes: string[];
  structuredAttributes?: VisualMarketplaceAttribute[];
  livestockUse?: string;
  region?: string;
  district?: string;
  pricePreference?: {
    min?: number;
    max?: number;
  } | null;
  stockPreference?: 'in_stock' | 'any' | null;
  confidence: VisualIntentConfidence;
  confidenceScore: number; // 0.0 to 1.0 (internal metric only)
  commercialIntent: boolean;
  hasCommercialSignal: boolean;
  isMedicalSafetyRestricted: boolean;
  reasoningSignals: string[];
  clarificationPrompt?: string | null;
  structuredQuery?: StructuredVisualMarketplaceQuery | null;
}

/**
 * Result of the visual marketplace intent classification.
 */
export interface VisualMarketplaceIntentResult {
  detected: boolean; // true ONLY when commercialIntent is true (VISUAL_PRODUCT_SEARCH or VISUAL_PRODUCT_NEED)
  intent: VisualMarketplaceIntentType;
  intentType: VisualMarketplaceIntentType; // alias for schema conformity
  confidence: VisualIntentConfidence;
  confidenceScore: number; // 0.0 to 1.0
  commercialIntent: boolean;
  visualObject: string | null;
  source: VisualSourceType;
  hasExplicitCommercialSignal: boolean;
  isMedicalRestricted: boolean;
  explanation: string;
  reasoningSignals: string[];
  matchedCues: string[];
  clarificationPrompt?: string | null;
  normalizedQuery?: NormalizedVisualMarketplaceQuery | null;
  structuredQuery?: StructuredVisualMarketplaceQuery | null;
}

/**
 * Action structure for visual marketplace search CTA (V1.3 foundation).
 */
export interface VisualMarketplaceAction {
  type: 'VISUAL_MARKETPLACE_CTA';
  label: string; // e.g. "🔎 Tafuta bidhaa hii Sokoni"
  source: VisualSourceType;
  query: NormalizedVisualMarketplaceQuery;
  structuredQuery?: StructuredVisualMarketplaceQuery | null;
  status: 'foundation_ready' | 'pending_activation';
}

/**
 * ====================================================================
 * V1.3D — VISUAL PRODUCT MATCHING TYPE DEFINITIONS
 * ====================================================================
 */

export type VisualMatchConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type VisualMatchTier =
  | 'EXACT_OR_VERY_STRONG' // "Inaonekana inafanana sana na bidhaa hii."
  | 'STRONGLY_SIMILAR'     // "Inaonekana inafanana kwa kiwango kikubwa."
  | 'RELATED_PRODUCT'      // "Inaonekana inafanana kwa kiwango cha kati."
  | 'WEAK_CANDIDATE'       // "Ina uhusiano wa karibu, lakini hatuwezi kuthibitisha kuwa ni bidhaa hiyo hiyo."
  | 'NO_RELIABLE_MATCH';   // "Hatukupata bidhaa ya Gulio inayofanana vya kutosha na picha/video yako."

export interface VisualUnderstandingCharacteristics {
  category?: string;
  subcategory?: string;
  productConcept?: string;
  productType?: string;
  formFactor?: string;
  visibleComponents: string[];
  visibleMaterial?: string;
  visibleColor?: string;
  visibleConfiguration?: string;
  visibleAttachments?: string[];
  apparentLivestockUse?: string;
  visibleLabels?: string[];
  visibleBrand?: string | null;
  visibleModel?: string | null;
  quality: 'clear' | 'blurry' | 'dark' | 'distant' | 'obstructed' | 'low_res' | 'uncertain';
  detectedMultipleProducts?: boolean;
  multipleProductNames?: string[];
}

export interface VisualMatchScore {
  overallScore: number;               // 0 to 100
  visualSimilarityScore?: number;     // 0 to 100 (undefined if candidate has no usable product image)
  semanticSimilarityScore?: number;   // 0 to 100
  attributeSimilarityScore?: number;  // 0 to 100
  categoryMatch?: number;             // 0 to 100
  confidence: VisualMatchConfidence;
  matchTier: VisualMatchTier;
  reasons: string[];
  limitations?: string[];
  explanation: string;
}

export interface MatchedMarketplaceProductItem {
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
  hasProductImage: boolean;
  hasVideo?: boolean;
  videoDurationSeconds?: number;
  relevanceReason: string;
  shopId?: string | null;
  catalogueId?: string | null;
  catalogueName?: string;
  visualMatchScore: VisualMatchScore;
  matchTier: VisualMatchTier;
  visualMatchConfidence: VisualMatchConfidence;
  visualMatchExplanation: string;
  isSemanticOnly: boolean;
  trustSignals?: ProductTrustSignals;
}

export interface VisualProductMatchResult {
  status:
    | 'matched'
    | 'semantic_only'
    | 'poor_visual_evidence'
    | 'no_match'
    | 'veterinary_restricted'
    | 'clarification_needed'
    | 'marketplace_error';
  confidence: VisualMatchConfidence;
  matchCount: number;
  topMatchTier?: VisualMatchTier;
  headlineExplanation: string;
  userGuidance?: string;
  results: MatchedMarketplaceProductItem[];
  structuredQuery: StructuredVisualMarketplaceQuery;
  isFallback: boolean;
  clarificationOptions?: string[];
}


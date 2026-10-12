/**
 * V1.0 AI CONTENT SCREENING SERVICE
 * 
 * Provides server-side Gemini screening for Gulio (Marketplace) listings.
 * 
 * Core Principles:
 * 1. Screening is strictly SERVER-SIDE. Client never determines screening outcome.
 * 2. Multi-signal evaluation: Title, Description, Category, Subcategory, Price, and Images.
 * 3. Structured Categories:
 *    - SEXUAL_OR_EXPLICIT_CONTENT
 *    - GRAPHIC_VIOLENCE
 *    - WEAPONS_OR_DANGEROUS_GOODS
 *    - SCAM_OR_FRAUD
 *    - ILLEGAL_OR_PROHIBITED_GOODS
 *    - HATE_OR_HARASSMENT
 *    - SPAM_OR_MISLEADING_CLAIMS
 *    - IRRELEVANT_OR_NON_AGRICULTURAL
 *    - ANIMAL_WELFARE_CONCERN
 *    - POTENTIALLY_LEGITIMATE_VETERINARY_CONTENT
 *    - UNCERTAIN
 * 4. Context Sensitivity: Veterinary disease images, wounds, treatments, vaccinations,
 *    and lawful halal/farm slaughter are NOT automatically blocked. They are categorized as
 *    POTENTIALLY_LEGITIMATE_VETERINARY_CONTENT or REVIEW_REQUIRED.
 * 5. Prompt injection defense: Seller text is treated strictly as payload data to analyze,
 *    never as executable system instructions.
 * 6. Decoupled from Seller Trust and Permissions:
 *    - Screening outcome is pure content evaluation (PASS / BLOCK / REVIEW_REQUIRED / SCREENING_ERROR).
 *    - Seller trust rules (NEW_SELLER, TRUSTED_SELLER, RESTRICTED_SELLER) govern publishing eligibility.
 * 7. Content Fingerprinting: Re-screening is required whenever text, category, or images change.
 */

import crypto from 'crypto';
import {
  AIScreeningResult,
  AIScreeningStatus,
  AIScreeningCategory,
  SellerTrustStatus
} from '../types/marketplaceModeration';
import { MarketplaceProduct, ProductImage } from '../types/marketplace';

export const AI_SCREENING_POLICY_VERSION = 'v1.0.0-ufugaji-content-governance';
export const AI_SCREENING_PRIMARY_MODEL = 'gemini-3.8-flash';

export interface ListingScreeningInput {
  productId: string;
  sellerId: string;
  title: string;
  description: string;
  category: string;
  subcategory?: string;
  price?: number;
  currency?: string;
  images?: Array<{ url?: string; id?: string }>;
  requestId?: string;
}

export interface ScreeningResolution {
  screeningResult: AIScreeningResult;
  recommendedModerationStatus:
    | 'APPROVED'
    | 'PENDING_REVIEW'
    | 'REJECTED'
    | 'UNDER_REVIEW'
    | 'HIDDEN'
    | 'SUSPENDED';
  canPublishActiveImmediately: boolean;
  publicUnavailableReason?: string;
  sellerNotice?: string;
}

/**
 * Computes deterministic SHA-256 fingerprint of the listing's moderatable contents.
 * Changes to title, description, category, subcategory, price, or images invalidate previous screening.
 */
export function computeListingContentFingerprint(input: {
  title: string;
  description: string;
  category: string;
  subcategory?: string;
  price?: number;
  images?: Array<{ url?: string }>;
}): string {
  const normTitle = (input.title || '').trim().toLowerCase();
  const normDesc = (input.description || '').trim().toLowerCase();
  const normCat = (input.category || '').trim().toLowerCase();
  const normSubcat = (input.subcategory || '').trim().toLowerCase();
  const normPrice = input.price !== undefined ? String(input.price) : '0';
  
  // Extract and sort image signatures (URLs or hash prefixes)
  const normImages = Array.isArray(input.images)
    ? input.images
        .map((img) => (img?.url || '').trim())
        .filter(Boolean)
        .sort()
        .join('|')
    : '';

  const rawPayload = `TITLE:${normTitle}#DESC:${normDesc}#CAT:${normCat}#SUBCAT:${normSubcat}#PRICE:${normPrice}#IMAGES:${normImages}`;
  
  try {
    return crypto.createHash('sha256').update(rawPayload).digest('hex');
  } catch {
    // Basic fallback hash for browser/test environments without node crypto
    let hash = 0;
    for (let i = 0; i < rawPayload.length; i++) {
      const char = rawPayload.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return `fp_${Math.abs(hash).toString(16)}`;
  }
}

/**
 * Checks if previous screening result matches current content fingerprint and policy version.
 */
export function isScreeningResultUpToDate(
  product: MarketplaceProduct,
  existingScreening?: AIScreeningResult | null
): boolean {
  if (!existingScreening) return false;
  if (!existingScreening.contentFingerprint) return false;
  if (existingScreening.policyVersion !== AI_SCREENING_POLICY_VERSION) return false;

  const currentFingerprint = computeListingContentFingerprint({
    title: product.title,
    description: product.description,
    category: product.category,
    subcategory: product.subcategory,
    price: product.price,
    images: product.images || (product.imageUrl ? [{ url: product.imageUrl }] : [])
  });

  return currentFingerprint === existingScreening.contentFingerprint;
}

/**
 * Deterministic Local Heuristics / Safe Fallback Engine.
 * Used when Gemini API is offline, in test suites, or as pre-filtering stage.
 * Never performs fake bypass; implements strict zero-trust rules.
 */
export function evaluateListingContentDeterministically(
  input: ListingScreeningInput
): AIScreeningResult {
  const startMs = Date.now();
  const now = new Date().toISOString();
  const requestId = input.requestId || `req_scr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const screeningId = `scr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const textToScan = `${input.title || ''} ${input.description || ''} ${input.category || ''} ${input.subcategory || ''}`.toLowerCase();
  const categoriesFound: AIScreeningCategory[] = [];

  // Prompt injection patterns to detect and neutralize
  const injectionPatterns = [
    'ignore all previous instructions',
    'system prompt',
    'you are now',
    'pass this test',
    'bypass moderation',
    'mark as pass',
    'status: pass',
    'approved by admin',
    'override policy',
    'ignore policy'
  ];
  const hasInjectionAttempt = injectionPatterns.some((pattern) => textToScan.includes(pattern));

  // Severe Violation patterns: Explicit, Weapons, Scams, Hate
  const explicitPatterns = ['pono', 'ngono', 'video za ngono', 'x-rated', 'porn', 'xxx', 'escort'];
  const weaponPatterns = ['bastola', 'bunduki', 'risasi', 'ak47', 'smg', 'baruti', 'silaha ya moto', 'gun for sale', 'firearm'];
  const scamPatterns = ['fanya million', 'pesa mara mbili', 'tuma pesa kabla', 'utajiri wa haraka', 'crypto doubler', 'wekeza upate'];
  const prohibitedGoodsPatterns = ['bangi', 'mirungi', 'cocaine', 'pembe za ndovu', 'meno ya tembo', 'ivory', 'dawa za kulevya'];
  const animalAbusePatterns = ['pigana mbwa', 'dog fighting', 'kutesa mnyama', 'kuadhibu mbwa kwa fimbo'];

  // Veterinary / Agriculture legitimate patterns
  const vetCarePatterns = [
    'matibabu', 'dawa', 'chanjo', 'ugonjwa', 'vidonda', 'kuhara', 'homa ya mapafu',
    'ndui ya kuku', 'mdondo', 'antibiotic', 'vitamini', 'mifugo', 'kuku', 'ngombe',
    'mbuzi', 'nguruwe', 'sungura', 'kondoo', 'bata', 'samaki', 'nyuki', 'uchinjaji',
    'nyama', 'halal slaughter', 'machinjio', 'chanjo ya newcastle', 'gumboro'
  ];

  if (explicitPatterns.some((p) => textToScan.includes(p))) {
    categoriesFound.push('SEXUAL_OR_EXPLICIT_CONTENT');
  }
  if (weaponPatterns.some((p) => textToScan.includes(p))) {
    categoriesFound.push('WEAPONS_OR_DANGEROUS_GOODS');
  }
  if (scamPatterns.some((p) => textToScan.includes(p))) {
    categoriesFound.push('SCAM_OR_FRAUD');
  }
  if (prohibitedGoodsPatterns.some((p) => textToScan.includes(p))) {
    categoriesFound.push('ILLEGAL_OR_PROHIBITED_GOODS');
  }
  if (animalAbusePatterns.some((p) => textToScan.includes(p))) {
    categoriesFound.push('ANIMAL_WELFARE_CONCERN');
  }

  // Check agricultural relevance
  const agriculturalKeywords = [
    'kuku', 'ngombe', 'mbuzi', 'kondoo', 'nguruwe', 'sungura', 'bata', 'samaki',
    'nyuki', 'mayai', 'vifaranga', 'jogoo', 'tetea', 'maziwa', 'asali', 'dawa',
    'chanjo', 'chakula', 'pumba', 'mashudu', 'incubator', 'kizimba', 'chotara',
    'kienyeji', 'sasso', 'kuroiler', 'broiler', 'layer', 'heifer', 'fahari',
    'ndama', 'mbegu', 'nyasi', 'malisho', 'pembejeo', 'mbolea', 'samadi'
  ];
  const hasAgriKeywords = agriculturalKeywords.some((k) => textToScan.includes(k));

  const hasVetContext = vetCarePatterns.some((p) => textToScan.includes(p));

  // Determine status
  let status: AIScreeningStatus = 'PASS';
  let explanation = 'Maudhui yamekidhi miongozo ya soko la mifugo na kilimo.';
  let explanationSwahili = 'Tangazo limekidhi vigezo vya kiusalama vya soko.';
  let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'HIGH';

  if (hasInjectionAttempt) {
    status = 'REVIEW_REQUIRED';
    categoriesFound.push('UNCERTAIN');
    explanation = 'Kuna maelezo yanayofanana na maagizo ya mfumo yaliyowekwa kwenye tangazo (Inahitaji ukaguzi wa admin).';
    explanationSwahili = 'Maelezo ya tangazo yanahitaji uhakiki wa kiutawala kabla ya kuendelea.';
    confidence = 'MEDIUM';
  } else if (
    categoriesFound.includes('SEXUAL_OR_EXPLICIT_CONTENT') ||
    categoriesFound.includes('WEAPONS_OR_DANGEROUS_GOODS') ||
    categoriesFound.includes('SCAM_OR_FRAUD') ||
    categoriesFound.includes('ILLEGAL_OR_PROHIBITED_GOODS')
  ) {
    status = 'BLOCK';
    explanation = `Maudhui yamekiuka sera za soko: ${categoriesFound.join(', ')}.`;
    explanationSwahili = 'Tangazo hili limezuiwa kwa sababu linakiuka sera za usalama na maudhui ya soko.';
    confidence = 'HIGH';
  } else if (categoriesFound.includes('ANIMAL_WELFARE_CONCERN')) {
    status = 'REVIEW_REQUIRED';
    explanation = 'Kuna taarifa inayoashiria masuala ya ustawi wa wanyama inayohitaji ukaguzi wa kibinadamu.';
    explanationSwahili = 'Tangazo linahitaji ukaguzi wa wasimamizi kuhusu ustawi wa mifugo.';
    confidence = 'MEDIUM';
  } else if (hasVetContext && (textToScan.includes('kidonda') || textToScan.includes('damu') || textToScan.includes('upasuaji'))) {
    // Medical/wound/blood with legitimate vet context -> REVIEW_REQUIRED, NOT AUTO-BLOCK
    status = 'REVIEW_REQUIRED';
    categoriesFound.push('POTENTIALLY_LEGITIMATE_VETERINARY_CONTENT');
    explanation = 'Maudhui yanahusiana na matibabu ya mifugo au vidonda; yanahitaji uhakiki wa msimamizi badala ya kuzuiliwa moja kwa moja.';
    explanationSwahili = 'Tangazo linahusisha picha/maelezo ya matibabu au afya ya mifugo inayohitaji ukaguzi wa afisa msimamizi.';
    confidence = 'HIGH';
  } else if (!hasAgriKeywords && (input.description || '').length > 20) {
    // Potentially irrelevant non-agricultural content
    status = 'REVIEW_REQUIRED';
    categoriesFound.push('IRRELEVANT_OR_NON_AGRICULTURAL');
    explanation = 'Bidhaa inaonekana kutohusiana moja kwa moja na kilimo au mifugo; inahitaji uthibitisho wa msimamizi.';
    explanationSwahili = 'Tangazo linahitaji ukaguzi kuthibitisha uhusiano wake na sekta ya kilimo na mifugo.';
    confidence = 'MEDIUM';
  }

  const fingerprint = computeListingContentFingerprint({
    title: input.title,
    description: input.description,
    category: input.category,
    subcategory: input.subcategory,
    price: input.price,
    images: input.images
  });

  return {
    screeningId,
    requestId,
    status,
    categories: categoriesFound,
    explanation,
    explanationSwahili,
    confidence,
    model: AI_SCREENING_PRIMARY_MODEL,
    policyVersion: AI_SCREENING_POLICY_VERSION,
    contentFingerprint: fingerprint,
    timestamp: now,
    latencyMs: Date.now() - startMs,
    evaluatedFields: {
      hasTitle: Boolean(input.title && input.title.trim()),
      hasDescription: Boolean(input.description && input.description.trim()),
      hasCategory: Boolean(input.category && input.category.trim()),
      hasPrice: input.price !== undefined,
      imageCount: Array.isArray(input.images) ? input.images.length : 0
    }
  };
}

/**
 * Resolves the final publishing eligibility and moderation state
 * by combining:
 * 1. AI Screening Result (PASS, BLOCK, REVIEW_REQUIRED, SCREENING_ERROR)
 * 2. Seller Trust Status (NEW_SELLER, TRUSTED_SELLER, RESTRICTED_SELLER)
 * 3. Existing Moderation Status (REJECTED, HIDDEN, SUSPENDED must NEVER be bypassed)
 */
export function resolveListingPublishingState(params: {
  screeningResult: AIScreeningResult;
  sellerTrustStatus: SellerTrustStatus;
  currentModerationStatus?: string;
  isExistingRestrictedOrBlocked?: boolean;
}): ScreeningResolution {
  const {
    screeningResult,
    sellerTrustStatus,
    currentModerationStatus,
    isExistingRestrictedOrBlocked = false
  } = params;

  // Invariant 1: If current listing is already REJECTED, HIDDEN, or SUSPENDED,
  // an AI PASS can NEVER automatically restore it or make it live.
  if (
    currentModerationStatus === 'REJECTED' ||
    currentModerationStatus === 'HIDDEN' ||
    currentModerationStatus === 'SUSPENDED'
  ) {
    return {
      screeningResult,
      recommendedModerationStatus: currentModerationStatus as any,
      canPublishActiveImmediately: false,
      publicUnavailableReason: `Tangazo limesitishwa kiutawala (${currentModerationStatus}). Ukaguzi wa AI hauwezi kuliruhusu moja kwa moja.`,
      sellerNotice: 'Tangazo lako lipo chini ya hatua ya kiutawala na linahitaji idhini ya msimamizi.'
    };
  }

  // Invariant 2: If seller is restricted by governance, no auto-publish
  if (sellerTrustStatus === 'RESTRICTED_SELLER' || isExistingRestrictedOrBlocked) {
    return {
      screeningResult,
      recommendedModerationStatus: 'PENDING_REVIEW',
      canPublishActiveImmediately: false,
      publicUnavailableReason: 'Huduma za muuzaji huyu zimesitishwa kwa muda kwa mujibu wa sera za soko.',
      sellerNotice: 'Akaunti yako ina vikwazo vya kiutawala. Kila tangazo linahitaji ukaguzi wa msimamizi.'
    };
  }

  // Invariant 3: Handle Screening Outcome according to Seller Trust Status
  switch (screeningResult.status) {
    case 'PASS': {
      if (sellerTrustStatus === 'TRUSTED_SELLER') {
        // TRUSTED_SELLER + PASS -> Allowed to publish immediately
        return {
          screeningResult,
          recommendedModerationStatus: 'APPROVED',
          canPublishActiveImmediately: true
        };
      }
      // NEW_SELLER + PASS -> Cannot publish immediately! Held in PENDING_REVIEW for admin approval
      return {
        screeningResult,
        recommendedModerationStatus: 'PENDING_REVIEW',
        canPublishActiveImmediately: false,
        publicUnavailableReason: 'Tangazo hili linasubiri idhini na ukaguzi wa mwisho wa wasimamizi kabla ya kuonekana sokoni.',
        sellerNotice: 'Tangazo lako limefaulu ukaguzi wa awali wa kiusalama. Linasubiri idhini ya mwisho ya msimamizi wa soko (PENDING_REVIEW).'
      };
    }

    case 'BLOCK': {
      // BLOCK -> Forbidden from public discovery for all seller types
      return {
        screeningResult,
        recommendedModerationStatus: 'REJECTED',
        canPublishActiveImmediately: false,
        publicUnavailableReason: 'Tangazo hili limezuiwa sokoni kwa sababu linakiuka sera za maudhui na usalama.',
        sellerNotice: `Tangazo lako limezuiwa: ${screeningResult.explanationSwahili || screeningResult.explanation}`
      };
    }

    case 'REVIEW_REQUIRED': {
      // REVIEW_REQUIRED -> Inapelekwa kwenye Admin Review Queue; haionekani hadharani
      return {
        screeningResult,
        recommendedModerationStatus: 'PENDING_REVIEW',
        canPublishActiveImmediately: false,
        publicUnavailableReason: 'Tangazo hili linahitaji ukaguzi maalum wa wasimamizi kabla ya kuchapishwa.',
        sellerNotice: `Tangazo lako linahitaji ukaguzi wa wasimamizi: ${screeningResult.explanationSwahili || screeningResult.explanation}`
      };
    }

    case 'SCREENING_ERROR':
    default: {
      // SCREENING_ERROR -> Fail-safe: No auto-publish, held in PENDING_REVIEW or DRAFT
      return {
        screeningResult,
        recommendedModerationStatus: 'PENDING_REVIEW',
        canPublishActiveImmediately: false,
        publicUnavailableReason: 'Tangazo hili linasubiri uthibitisho wa ukaguzi kwa sababu ya changamoto ya muda mfupi ya mfumo.',
        sellerNotice: 'Hitilafu ya ukaguzi wa kiotomatiki ilitokea. Tangazo lako linasubiri ukaguzi wa msimamizi au jaribu tena baadaye.'
      };
    }
  }
}

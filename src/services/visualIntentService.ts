/**
 * V1.3A — VISUAL PRODUCT INTENT
 * VisualIntentService
 *
 * Core service for detecting and classifying Visual Product Intent across:
 * - IMAGE ONLY
 * - IMAGE + TEXT
 * - VIDEO ONLY
 * - VIDEO + TEXT
 * - TEXT ONLY (with multi-turn visual context inheritance)
 *
 * Adheres strictly to:
 * 1. VISUAL UNDERSTANDING ≠ MARKETPLACE TRUTH
 *    Visual attachment is evidence about what is shown, NOT automatically evidence of purchase intent.
 * 2. Visual attachment alone does NOT imply purchase intent.
 * 3. Controlled Intent Enum:
 *    - VISUAL_PRODUCT_SEARCH
 *    - VISUAL_PRODUCT_NEED
 *    - VISUAL_PRODUCT_IDENTIFICATION
 *    - VISUAL_PRODUCT_INFORMATION
 *    - NON_PRODUCT_VISUAL
 *    - VETERINARY_VISUAL
 *    - UNCERTAIN_VISUAL_INTENT
 *    - NO_MARKETPLACE_INTENT
 * 4. Medical / Veterinary Visuals must never convert into commercial medicine shopping.
 * 5. Multi-turn conversation context preserves visual references across subsequent turns without persisting raw media.
 * 6. Conservative visual object representation — no hallucinated brand or model names.
 */

import {
  VisualSourceType,
  VisualMarketplaceIntentType,
  VisualIntentConfidence,
  VisualMarketplaceIntentResult,
  NormalizedVisualMarketplaceQuery,
  StructuredVisualMarketplaceQuery,
  RawVisualMarketplaceQuery,
  VisualConversationHistoryMessage
} from '../types/visualMarketplace';
import { normalizeVisualMarketplaceQuery } from '../utils/visualMarketplaceNormalizer';
import { TANZANIA_REGIONS_LIST } from '../utils/marketplaceIntentClassifier';
import { buildStructuredVisualMarketplaceQuery, detectUserCorrection } from './visualQueryBuilder';

export interface VisualIntentClassificationParams {
  userText?: string;
  hasImageAttachment: boolean;
  hasVideoAttachment: boolean;
  modelAnswer?: string;
  farmerLocation?: string;
  farmerPrimaryLivestock?: string;
  conversationHistory?: VisualConversationHistoryMessage[];
  imageQuality?: 'clear' | 'blurry' | 'dark' | 'distant' | 'uncertain';
  videoQuality?: 'clear' | 'blurry' | 'dark' | 'distant' | 'uncertain';
}

// 1. Strong Explicit Commercial Signals (Natural Swahili & English)
const COMMERCIAL_PATTERNS = [
  // Swahili natural expressions
  /\b(naweza\s+kupata\s+(hii|hiki|kitu\s+kama\s+hiki|kama\s+hii|kama\s+hiki|wapi))\b/i,
  /\b(wapi\s+(naweza\s+kupata|napata|nitapata|inauzwa|wanauza))\b/i,
  /\b(napata\s+(hii|hiki|wapi))\b/i,
  /\b(hii\s+inauzwa\s+wapi|inauzwa\s+wapi|wapi\s+inauzwa)\b/i,
  /\b(nataka\s+(kununua|nunua|kama\s+hii|kama\s+hiki|kitu\s+kama\s+hiki|moja\s+kama\s+hii|kuku\s+kama\s+huyu\s+wa\s+kununua))\b/i,
  /\b(ninataka\s+(kununua|nunua|kama\s+hii|kama\s+hiki|kitu\s+kama\s+hiki|moja\s+kama\s+hii))\b/i,
  /\b(ninunue\s+(hii|hiki|wapi|kama\s+hii))\b/i,
  /\b(naomba\s+(kununua|kupata\s+kama\s+hii))\b/i,
  /\b(nataka\s+kama\s+(hii|hiki|huyu))\b/i,
  /\b(nataka|nahitaji|ninataka|ninahitaji|natafuta|ninatafuta)\s+([a-zA-Z0-9'\s]{1,30})?\s*kama\s+(hii|hiki|huyu|hizi|hawa)\b/i,
  /\b(nataka|nahitaji|ninataka|ninahitaji|natafuta|ninatafuta)\s+([a-zA-Z0-9'\s]{1,30})?\s*(hizi|hawa|hiki|hii|hili)\s+(\d+|mbili|tatu|nne|tano)\b/i,
  /\b(kama\s+(hii|hiki|huyu|hizi))\b/i,
  /\b(ninahitaji\s+kama\s+(hii|hiki|huyu|kitu\s+kama\s+hiki|moja\s+kama\s+hii))\b/i,
  /\b(nahitaji\s+kama\s+(hii|hiki|huyu|kitu\s+kama\s+hiki|moja\s+kama\s+hii))\b/i,
  /\b(tafuta\s+(hii|hiki|kitu\s+kama\s+hiki|sokoni))\b/i,
  /\b(nitafutie\s+(hii|hiki|kitu\s+kama\s+hiki|kama\s+hii|kama\s+hiki|sokoni))\b/i,
  /\b(bei\s+(ya\s+hii|ya\s+hiki|yake|gani|ni\s+kiasi\s+gani))\b/i,
  /\b(gharama\s+(ya\s+hii|yake))\b/i,
  /\b(muuzaji\s+wa\s+(hii|hiki|vifaa\s+hivi))\b/i,
  /\b(wauzaji\s+wa\s+(hii|hiki))\b/i,
  /\b(maduka\s+ya\s+(hii|hiki)|duka\s+la\s+(hii|hiki))\b/i,
  /\b(bidhaa\s+kama\s+(hii|hiki)|kifaa\s+kama\s+(hiki|hili)|vifaa\s+kama\s+hivi)\b/i,
  /\b(kuna\s+(hii|hiki)\s+sokoni|inapatikana\s+sokoni|kwenye\s+gulio)\b/i,
  /\b(natafuta\s+(hii|hiki|kitu\s+kama\s+hiki|kama\s+hii))\b/i,
  /\b(ninatafuta\s+(hii|hiki|kitu\s+kama\s+hiki|kama\s+hii))\b/i,
  /\b(shilingi\s+ngapi\s+(hii|hiki))\b/i,
  // English expressions
  /\b(where\s+can\s+i\s+(get|buy|find)\s+(this|one\s+like\s+this))\b/i,
  /\b(where\s+is\s+this\s+sold)\b/i,
  /\b(how\s+much\s+(is\s+this|does\s+this\s+cost))\b/i,
  /\b(i\s+want\s+to\s+buy\s+(this|one\s+like\s+this))\b/i,
  /\b(i\s+need\s+(one\s+like\s+this|this))\b/i,
  /\b(find\s+(this|one\s+like\s+this)\s+(for\s+me|in\s+the\s+market))\b/i,
  /\b(looking\s+for\s+(this|one\s+like\s+this))\b/i,
  /\b(available\s+in\s+the\s+market)\b/i
];

// 2. Follow-Up Commercial Signal Patterns (for multi-turn context without new image/video attachment)
const MULTITURN_FOLLOWUP_COMMERCIAL_PATTERNS = [
  /\b(ndiyo|ndio|naam)[,\s]+(nataka|nahitaji|ninataka|ninahitaji)\s+kama\s+(hii|hiki|huyu)\b/i,
  /\b(naweza\s+kununua\s+kama\s+(hii|hiki|huyu))\b/i,
  /\b(nataka\s+(moja\s+kama\s+hii|kama\s+hii|kama\s+hiki))\b/i,
  /\b(na\s+iwe\s+kubwa\s+zaidi|iwe\s+ndogo\s+zaidi|yenye\s+uwezo\s+mkubwa)\b/i,
  /\b(bei\s+yake\s+ni\s+(ngapi|kiasi\s+gani)\s+na\s+wapi\s+(inauzwa|nitapata))\b/i,
  /\b(nitafutie\s+hii\s+sokoni|tafuta\s+hii\s+kwenye\s+gulio)\b/i,
  /\b(wapi\s+naweza\s+kuipata|wapi\s+naweza\s+kukinunua)\b/i,
  // Multi-turn video/image refinements (Section 13: Price, Livestock, Attributes, Location, Quantity)
  /\b(iwe\s+(chini\s+ya|isizidi|hadi)\s+(tsh|tzs|\d+)|chini\s+ya\s+(tsh|tzs|\d+)|isizidi\s+(tsh|tzs|\d+)|bajeti\s+(yangu|ni))\b/i,
  /\b(nataka\s+kwa\s+ajili\s+ya|nahitaji\s+kwa\s+ajili\s+ya|kwa\s+ajili\s+ya\s+(ng'?ombe|kuku|mbuzi|nguruwe|sungura|samaki|bata))\b/i,
  /\b(na\s+iwe\s+ya\s+(mayai|lita|kilo)|iwe\s+ya\s+(mayai|lita|kilo)|yenye\s+uwezo\s+wa)\b/i,
  /\b(nahitaji\s+(mbili|tatu|nne|tano|\d+)|nataka\s+(mbili|tatu|nne|tano|\d+))\b/i,
  /\b(nataka\s+(morogoro|dar|arusha|mwanza|mbeya|tanga|dodoma|zanzibar|kilimanjaro|iringa|tabora)|tafuta\s+(morogoro|dar|arusha|mwanza|mbeya|tanga|dodoma|zanzibar))\b/i,
  /\b(nataka|nahitaji|tafuta)\s+(ya\s+|wa\s+|za\s+)?(morogoro|dar|arusha|mwanza|mbeya|tanga|dodoma|zanzibar|kilimanjaro|iringa|tabora)\b/i
];

// 10. Historical Media Re-inspection Request without fresh media attachment (V1.3F Section 14)
const HISTORICAL_MEDIA_PATTERNS = [
  /\b(angalia\s+tena\s+(video|picha)|tazama\s+tena\s+ile\s+(video|picha)|ikague\s+tena\s+(video|picha)|kwenye\s+ile\s+(video|picha)\s+(ya\s+(jana|juzi|awali|zamani)|niliyotuma))\b/i,
  /\b((video|picha)\s+(niliyotuma\s+(jana|juzi)|ya\s+(jana|juzi|awali|zamani)|iliyopita))\b/i,
  /\b(kwenye\s+(video|picha)\s+(ya\s+(jana|juzi)|niliyotuma\s+awali|ya\s+zamani))\b/i,
  /\b(angalia|tazama|ikague|tafuta|natafuta)\s+(ile\s+)?(picha|video)\s+ya\s+(jana|juzi|zamani)\b/i,
  /\b(ile\s+(picha|video)\s+ya\s+(jana|juzi|zamani|awali))\b/i
];

// 3. Veterinary / Medical Distress & Disease Patterns (strictly guarded against marketplace commerce)
const VETERINARY_PATTERNS = [
  /\b(ugonjwa|anaugua|anaumwa|kuharisha|anaharisha|kinyesi\s+cha\s+kijani|kinyesi\s+cha\s+damu)\b/i,
  /\b(tatizo\s+gani|huyu\s+kuku\s+ana\s+tatizo\s+gani|mnyama\s+huyu\s+ana\s+tatizo\s+gani|shida\s+gani|ana\s+shida\s+gani)\b/i,
  /\b(kwa\s+nini\s+anatembea\s+hivi|mbona\s+anatembea\s+hivi|mbona\s+analegea|hawezi\s+kusimama|amelegea)\b/i,
  /\b(anapumua\s+kwa\s+shida|kukohoa|kukoroma|macho\s+yamefunga|uvimbe|kidonda|majeraha)\b/i,
  /\b(wanakufa|vifo|amevunjika|dalili\s+za\s+ugonjwa)\b/i,
  /\b(dawa\s+ya\s+hii|dawa\s+gani|nimpe\s+dawa\s+gani|nimchome\s+sindano\s+gani)\b/i
];

// 4. Doctor query cues (strictly routed to Daktari handoff)
const DOCTOR_PATTERNS = [
  /\b(daktari|dakatri|bwana\s+mifugo|bibi\s+mifugo|afisa\s+mifugo|veterinary|vet)\b/i
];

// 5. Functional / How-It-Works Patterns (VISUAL_PRODUCT_INFORMATION - V1.3F Section 9)
const FUNCTIONAL_INFO_PATTERNS = [
  /\b(inafanya\s+kazi\s+vipi|inafanyaje\s+kazi|jinsi\s+ya\s+kutumia|namna\s+ya\s+kutumia)\b/i,
  /\b(inatumia\s+umeme|matumizi\s+ya\s+umeme|inatumiaje\s+umeme)\b/i,
  /\b(mbona\s+inatoa\s+sauti|kwa\s+nini\s+inapiga\s+kelele|mbona\s+haizunguki)\b/i,
  /\b(joto\s+gani|unyevunyevu\s+kiasi\s+gani|rekebisha\s+vipi)\b/i,
  /\b(hii\s+inatumika\s+kufanya\s+nini|inatumika\s+kufanya\s+nini|nielezee\s+hii\s+video|nieleze\s+video\s+hii)\b/i,
  /\b(how\s+does\s+this\s+work|how\s+to\s+use\s+this)\b/i
];

// 6. Educational Identification Patterns (VISUAL_PRODUCT_IDENTIFICATION - V1.3F Section 9)
const IDENTIFICATION_PATTERNS = [
  /\b(hii\s+ni\s+nini|hiki\s+ni\s+nini|hiki\s+ni\s+kifaa\s+gani|ni\s+kifaa\s+gani)\b/i,
  /\b(unaona\s+nini\s+kwenye\s+picha|unaona\s+nini|nielezee\s+picha\s+hii)\b/i,
  /\b(ni\s+aina\s+gani\s+ya\s+kuku|ni\s+kuku\s+gani|uzao\s+gani|breed\s+gani)\b/i,
  /\b(ni\s+mbegu\s+gani|ni\s+majani\s+gani|ni\s+chakula\s+gani)\b/i,
  /\b(what\s+is\s+this|what\s+kind\s+of\s+chicken\s+is\s+this|what\s+breed)\b/i
];

// 7. Non-Product Visual Patterns (NON_PRODUCT_VISUAL)
const NON_PRODUCT_PATTERNS = [
  /\b(shamba\s+hili|shamba\s+langu|shamba\s+linaonekana\s+vipi)\b/i,
  /\b(banda\s+hili|banda\s+langu|muundo\s+wa\s+banda|banda\s+likoje)\b/i,
  /\b(mazingira\s+haya|mazingira\s+ya\s+shamba|hali\s+ya\s+hewa)\b/i,
  /\b(how\s+does\s+this\s+farm\s+look|how\s+is\s+my\s+shed|pen\s+structure)\b/i
];

// 8. Vague or Ambiguous Triggers (UNCERTAIN_VISUAL_INTENT)
const AMBIGUOUS_PATTERNS = [
  /^(angalia\s+hii|tazama\s+hii|ona\s+hii|angalia|tazama|ona|niambie|hebu\s+ona)[\s.?!]*$/i,
  /^(look\s+at\s+this|check\s+this|see\s+this|tell\s+me)[\s.?!]*$/i
];

// 9. Poor Quality / Blurry indicators
const POOR_QUALITY_PATTERNS = [
  /\b(haionekani\s+vizuri|picha\s+hafifu|video\s+ya\s+giza|kuna\s+ukungu|giza\s+totoro|iko\s+mbali)\b/i,
  /\b(blurry|too\s+dark|cannot\s+see\s+well|unclear)\b/i
];

/**
 * Extracts explicit region mentioned by the farmer in user text.
 */
function extractExplicitRegion(text: string): string | undefined {
  const clean = text.toLowerCase();
  for (const region of TANZANIA_REGIONS_LIST) {
    if (clean.includes(region.toLowerCase())) {
      return region;
    }
  }
  return undefined;
}

/**
 * Derives a conservative visual product concept.
 * Adheres strictly to Section 16: Keep product descriptions conservative (e.g. "incubator ya mayai",
 * "chombo cha maji cha kuku"). Never hallucinate brand or model names.
 */
function deriveConservativeProductConcept(
  text: string,
  quality?: string
): { visualObject: string | null; productConcept: string; category?: string; subcategory?: string } {
  const lower = text.toLowerCase();

  // If image or video quality is explicitly blurry/dark or uncertain, do not claim specific identity
  if (quality === 'blurry' || quality === 'dark' || quality === 'distant' || quality === 'uncertain' || POOR_QUALITY_PATTERNS.some((p) => p.test(lower))) {
    return {
      visualObject: 'UNCERTAIN',
      productConcept: 'Kifaa au Pembejeo za Mifugo',
      category: 'Vifaa na Mashine'
    };
  }

  // Check user corrections first (e.g. "Hii si feeder, ni drinker")
  const correction = detectUserCorrection(text);
  const isNegatedFeeder = Boolean(correction.negatedConcept && /feeder|chakula|kulishia/i.test(correction.negatedConcept));
  const isNegatedDrinker = Boolean(correction.negatedConcept && /drinker|maji|kunyweshea/i.test(correction.negatedConcept));

  if (correction.isCorrection && correction.correctedConcept) {
    const cLower = correction.correctedConcept.toLowerCase();
    if (cLower.includes('drinker') || cLower.includes('maji') || cLower.includes('kunyweshea')) {
      return {
        visualObject: 'Chombo cha Maji cha Kuku',
        productConcept: 'Chombo cha Maji cha Kuku',
        category: 'Vifaa na Mashine',
        subcategory: 'Vyombo vya Kuku'
      };
    }
    if (cLower.includes('feeder') || cLower.includes('chakula') || cLower.includes('kulishia')) {
      return {
        visualObject: 'Chombo cha Chakula cha Kuku',
        productConcept: 'Chombo cha Chakula cha Kuku',
        category: 'Vifaa na Mashine',
        subcategory: 'Vyombo vya Kuku'
      };
    }
  }

  if (lower.includes('incubator') || lower.includes('mashine ya kutotolesha') || lower.includes('kutotolesha') || (lower.includes('mashine') && lower.includes('mayai'))) {
    return {
      visualObject: 'Incubator ya Mayai',
      productConcept: 'Incubator ya Kutotolesha Mayai',
      category: 'Vifaa na Mashine',
      subcategory: 'Incubators'
    };
  }

  if (lower.includes('kukata majani') || lower.includes('chopper') || lower.includes('chaff cutter') || (lower.includes('mashine') && lower.includes('majani'))) {
    return {
      visualObject: 'Mashine ya Kukata Majani',
      productConcept: 'Mashine ya Kukata Majani ya Mifugo',
      category: 'Vifaa na Mashine',
      subcategory: 'Mashine za Shambani'
    };
  }

  if (!isNegatedDrinker && (lower.includes('drinker') || lower.includes('chombo cha maji') || lower.includes('kunyweshea'))) {
    return {
      visualObject: 'Chombo cha Maji cha Kuku',
      productConcept: 'Chombo cha Maji cha Kuku',
      category: 'Vifaa na Mashine',
      subcategory: 'Vyombo vya Kuku'
    };
  }

  if (!isNegatedFeeder && (lower.includes('feeder') || lower.includes('chombo cha chakula') || lower.includes('kulishia'))) {
    return {
      visualObject: 'Chombo cha Chakula cha Kuku',
      productConcept: 'Chombo cha Chakula cha Kuku',
      category: 'Vifaa na Mashine',
      subcategory: 'Vyombo vya Kuku'
    };
  }

  // If text specifies "kwa ajili ya ng'ombe/kuku/mbuzi", this is livestockUse attribute, not buying an animal directly
  const isTargetLivestockOnly = /\bkwa\s+ajili\s+ya\s+(ng'?ombe|kuku|mbuzi|nguruwe|sungura|samaki|bata)\b/i.test(lower);
  if (isTargetLivestockOnly) {
    return {
      visualObject: null,
      productConcept: 'Vifaa au Pembejeo za Mifugo'
    };
  }

  if (lower.includes('kuku')) {
    return {
      visualObject: 'Kuku wa Ufugaji',
      productConcept: 'Kuku Bora wa Ufugaji',
      category: 'Kuku'
    };
  }

  if (lower.includes('vifaranga') || lower.includes('kifaranga')) {
    return {
      visualObject: 'Vifaranga vya Kuku',
      productConcept: 'Vifaranga Bora',
      category: 'Vifaranga'
    };
  }

  if (lower.includes('mayai') || lower.includes('trei')) {
    return {
      visualObject: 'Mayai ya Kuku',
      productConcept: 'Mayai ya Kutotolesha au Kula',
      category: 'Mayai'
    };
  }

  if (lower.includes('kukamua') || lower.includes('milking')) {
    return {
      visualObject: 'Mashine ya Kukamua Maziwa',
      productConcept: 'Mashine ya Kukamua Maziwa',
      category: 'Vifaa na Mashine'
    };
  }

  if (lower.includes('chakula') || lower.includes('mash') || lower.includes('pellets')) {
    return {
      visualObject: 'Chakula cha Mifugo',
      productConcept: 'Chakula cha Mifugo',
      category: 'Chakula cha Mifugo'
    };
  }

  if (lower.includes('ng\'ombe') || lower.includes('ngombe')) {
    return {
      visualObject: 'Ng\'ombe wa Ufugaji',
      productConcept: 'Ng\'ombe wa Maziwa au Nyama',
      category: 'Ng\'ombe'
    };
  }

  if (lower.includes('mbuzi')) {
    return {
      visualObject: 'Mbuzi wa Ufugaji',
      productConcept: 'Mbuzi Bora',
      category: 'Mbuzi'
    };
  }

  // Default conservative fallback: preserve actual user text if provided
  return {
    visualObject: null,
    productConcept: text && text.trim() ? text.trim() : 'Vifaa au Pembejeo za Mifugo'
  };
}

/**
 * Searches recent conversation history for an active visual context.
 * Enables Section 6, 7, and 19: Follow-up intent where user refers to earlier image/video.
 */
function findActiveVisualContext(
  history?: VisualConversationHistoryMessage[]
): {
  hasContext: boolean;
  source: VisualSourceType;
  visualObject: string | null;
  productConcept?: string;
  previousStructuredQuery?: StructuredVisualMarketplaceQuery | null;
  turnsAgo: number;
} | null {
  if (!history || !Array.isArray(history) || history.length === 0) {
    return null;
  }

  // Look back through the most recent 4 messages
  const recentSlice = history.slice(-4).reverse();
  for (let i = 0; i < recentSlice.length; i++) {
    const msg = recentSlice[i];
    if (msg.hasImage || msg.hasVideo || msg.visualObject || msg.productConcept || msg.structuredQuery) {
      return {
        hasContext: true,
        source: msg.structuredQuery?.source || (msg.hasVideo ? 'video' : 'image'),
        visualObject: msg.visualObject || msg.structuredQuery?.productConcept || null,
        productConcept: msg.productConcept || msg.structuredQuery?.productConcept,
        previousStructuredQuery: msg.structuredQuery || null,
        turnsAgo: i + 1
      };
    }
  }

  return null;
}

/**
 * Classifies Visual Product Intent across:
 * A. IMAGE ONLY
 * B. IMAGE + TEXT
 * C. VIDEO ONLY
 * D. VIDEO + TEXT
 * E. TEXT ONLY (with multi-turn visual inheritance)
 */
export function classifyVisualMarketplaceIntent(
  params: VisualIntentClassificationParams
): VisualMarketplaceIntentResult {
  const {
    userText = '',
    hasImageAttachment,
    hasVideoAttachment,
    farmerLocation,
    farmerPrimaryLivestock,
    conversationHistory,
    imageQuality,
    videoQuality
  } = params;

  const isDirectVisual = hasImageAttachment || hasVideoAttachment;
  const directSource: VisualSourceType = hasVideoAttachment ? 'video' : 'image';
  const effectiveQuality = hasVideoAttachment ? videoQuality : imageQuality;

  const cleanText = userText.trim();
  const lowerText = cleanText.toLowerCase();

  // Multi-Turn Visual Check: if no direct attachment, check if this is a follow-up referencing prior media
  const activeVisualContext = !isDirectVisual ? findActiveVisualContext(conversationHistory) : null;

  // Check if user is asking to re-inspect an unavailable historical image or video (V1.3F Section 14 & Test 12)
  if (!isDirectVisual && HISTORICAL_MEDIA_PATTERNS.some((p) => p.test(cleanText))) {
    return {
      detected: false,
      intent: 'HISTORICAL_MEDIA_UNAVAILABLE' as any,
      intentType: 'HISTORICAL_MEDIA_UNAVAILABLE',
      confidence: 'HIGH',
      confidenceScore: 0.1,
      commercialIntent: false,
      visualObject: null,
      source: cleanText.toLowerCase().includes('video') ? 'video' : 'image',
      hasExplicitCommercialSignal: false,
      isMedicalRestricted: false,
      explanation: 'Picha/video ya zamani haipatikani tena kwa ukaguzi wa kuona. Tafadhali itume tena.',
      reasoningSignals: ['historical_media_unavailable_privacy_protection'],
      matchedCues: ['historical_media_cue'],
      clarificationPrompt: 'Picha/video ya zamani haipatikani tena kwa ukaguzi wa kuona. Tafadhali itume tena.',
      normalizedQuery: null
    };
  }

  const isMultiTurnVisualFollowup = Boolean(
    !isDirectVisual && activeVisualContext?.hasContext &&
    (
      MULTITURN_FOLLOWUP_COMMERCIAL_PATTERNS.some((p) => p.test(cleanText)) ||
      (activeVisualContext.previousStructuredQuery && (
        /\b(chini ya|isizidi|tsh|tzs|kwa ajili ya|ya mayai|mbili|tatu|nne|tano)\b/i.test(cleanText) ||
        extractExplicitRegion(cleanText) !== undefined
      ))
    )
  );

  // E. TEXT ONLY without prior visual context: Defer strictly to existing text marketplace intent
  if (!isDirectVisual && !isMultiTurnVisualFollowup) {
    return {
      detected: false,
      intent: 'NO_MARKETPLACE_INTENT',
      intentType: 'NO_MARKETPLACE_INTENT',
      confidence: 'LOW',
      confidenceScore: 0.0,
      commercialIntent: false,
      visualObject: null,
      source: 'image',
      hasExplicitCommercialSignal: false,
      isMedicalRestricted: false,
      explanation: 'Hakuna picha, video au muktadha wa hivi karibuni wa picha/video.',
      reasoningSignals: ['text_only_standard_routing'],
      matchedCues: [],
      clarificationPrompt: null,
      normalizedQuery: null
    };
  }

  const effectiveSource: VisualSourceType = isDirectVisual ? directSource : (activeVisualContext?.source || 'image');

  // ============================================================================
  // 1. DAKTARI SEPARATION & VETERINARY BOUNDARIES (SECTION 11 & 12)
  // ============================================================================

  // Direct Doctor request ("Nipatie daktari wa kuku")
  const isDoctorQuery = DOCTOR_PATTERNS.some((p) => p.test(cleanText));
  if (isDoctorQuery) {
    return {
      detected: false,
      intent: 'NO_MARKETPLACE_INTENT',
      intentType: 'NO_MARKETPLACE_INTENT',
      confidence: 'HIGH',
      confidenceScore: 0.1,
      commercialIntent: false,
      visualObject: null,
      source: effectiveSource,
      hasExplicitCommercialSignal: false,
      isMedicalRestricted: false,
      explanation: 'Ombi la daktari wa mifugo. Linasimamiwa chini ya Daktari Mtaani Kwako.',
      reasoningSignals: ['daktari_handoff_requested'],
      matchedCues: ['daktari_query'],
      clarificationPrompt: null,
      normalizedQuery: null
    };
  }

  // Animal distress / symptoms / medical question with image/video
  // [image of sick chicken] "Ni ugonjwa gani huu?" or "Huyu kuku ana tatizo gani?"
  // [image of sick animal] "Naweza kununua dawa hii wapi?"
  const isVeterinary = VETERINARY_PATTERNS.some((p) => p.test(cleanText));
  if (isVeterinary) {
    return {
      detected: false,
      intent: 'VETERINARY_VISUAL',
      intentType: 'VETERINARY_VISUAL',
      confidence: 'HIGH',
      confidenceScore: 0.1,
      commercialIntent: false,
      visualObject: null,
      source: effectiveSource,
      hasExplicitCommercialSignal: false,
      isMedicalRestricted: true,
      explanation: 'Maudhui ya picha/video yanahusu afya au dalili za mnyama. AI haitafuti dawa sokoni kiotomatiki bila daktari.',
      reasoningSignals: ['veterinary_distress_symptoms', 'medical_safety_restriction'],
      matchedCues: ['veterinary_visual_cue'],
      clarificationPrompt: null,
      normalizedQuery: null
    };
  }

  // ============================================================================
  // 2. NON-COMMERCIAL VISUAL INTENTS (SECTIONS 2, 9, 10)
  // ============================================================================

  // Non-Product Visual (e.g. farm, shed, environment)
  const isNonProduct = NON_PRODUCT_PATTERNS.some((p) => p.test(cleanText));
  if (isNonProduct) {
    return {
      detected: false,
      intent: 'NON_PRODUCT_VISUAL',
      intentType: 'NON_PRODUCT_VISUAL',
      confidence: 'HIGH',
      confidenceScore: 0.2,
      commercialIntent: false,
      visualObject: null,
      source: effectiveSource,
      hasExplicitCommercialSignal: false,
      isMedicalRestricted: false,
      explanation: 'Picha au video inahusu mazingira, shamba au banda. Hakuna nia ya kibiashara.',
      reasoningSignals: ['non_product_visual_analysis'],
      matchedCues: ['farm_environment_cue'],
      clarificationPrompt: null,
      normalizedQuery: null
    };
  }

  // Functional / How-It-Works (e.g. [photo of incubator] "Hii inafanya kazi vipi?")
  const isFunctionalInfo = FUNCTIONAL_INFO_PATTERNS.some((p) => p.test(cleanText));
  if (isFunctionalInfo) {
    const { visualObject } = deriveConservativeProductConcept(cleanText, effectiveQuality);
    return {
      detected: false,
      intent: 'VISUAL_PRODUCT_INFORMATION',
      intentType: 'VISUAL_PRODUCT_INFORMATION',
      confidence: 'HIGH',
      confidenceScore: 0.2,
      commercialIntent: false,
      visualObject,
      source: effectiveSource,
      hasExplicitCommercialSignal: false,
      isMedicalRestricted: false,
      explanation: 'Mfugaji anauliza namna kifaa kinavyofanya kazi au matumizi yake. Hakuna nia ya kununua.',
      reasoningSignals: ['functional_product_information', 'no_commercial_signal'],
      matchedCues: ['how_it_works_cue'],
      clarificationPrompt: null,
      normalizedQuery: null
    };
  }

  // Identification (e.g. [photo of chicken] "Ni aina gani ya kuku huyu?", [photo] "Hii ni nini?")
  const isIdentification = IDENTIFICATION_PATTERNS.some((p) => p.test(cleanText));
  if (isIdentification) {
    const { visualObject } = deriveConservativeProductConcept(cleanText, effectiveQuality);
    return {
      detected: false,
      intent: 'VISUAL_PRODUCT_IDENTIFICATION',
      intentType: 'VISUAL_PRODUCT_IDENTIFICATION',
      confidence: 'HIGH',
      confidenceScore: 0.2,
      commercialIntent: false,
      visualObject,
      source: effectiveSource,
      hasExplicitCommercialSignal: false,
      isMedicalRestricted: false,
      explanation: 'Mfugaji anaomba utambuzi wa aina au kifaa. Hakuna nia ya kibiashara sokoni.',
      reasoningSignals: ['visual_product_identification', 'no_commercial_signal'],
      matchedCues: ['identification_inquiry'],
      clarificationPrompt: null,
      normalizedQuery: null
    };
  }

  // Pure Visual Upload without text (IMAGE ONLY or VIDEO ONLY)
  if (!cleanText) {
    const defaultClarification = 'Unataka nikueleze kuhusu hii, au nikutafutie bidhaa kama hii kwenye Gulio?';
    if (hasVideoAttachment) {
      return {
        detected: false,
        intent: 'UNCERTAIN_VISUAL_INTENT',
        intentType: 'UNCERTAIN_VISUAL_INTENT',
        confidence: 'LOW',
        confidenceScore: 0.25,
        commercialIntent: false,
        visualObject: null,
        source: 'video',
        hasExplicitCommercialSignal: false,
        isMedicalRestricted: false,
        explanation: 'Video imepokelewa bila maelezo. Nia ya kibiashara haijathibitishwa.',
        reasoningSignals: ['video_only_no_text', 'clarification_recommended'],
        matchedCues: [],
        clarificationPrompt: defaultClarification,
        normalizedQuery: null
      };
    }

    return {
      detected: false,
      intent: 'VISUAL_PRODUCT_IDENTIFICATION',
      intentType: 'VISUAL_PRODUCT_IDENTIFICATION',
      confidence: 'LOW',
      confidenceScore: 0.25,
      commercialIntent: false,
      visualObject: null,
      source: 'image',
      hasExplicitCommercialSignal: false,
      isMedicalRestricted: false,
      explanation: 'Picha imepokelewa bila maelezo ya kibiashara. Haielekezwi sokoni kiotomatiki.',
      reasoningSignals: ['image_only_no_text'],
      matchedCues: [],
      clarificationPrompt: defaultClarification,
      normalizedQuery: null
    };
  }

  // Ambiguous short phrases: "Angalia hii", "Tazama", "Niambie" (UNCERTAIN_VISUAL_INTENT)
  const isAmbiguous = AMBIGUOUS_PATTERNS.some((p) => p.test(cleanText));
  if (isAmbiguous) {
    return {
      detected: false,
      intent: 'UNCERTAIN_VISUAL_INTENT',
      intentType: 'UNCERTAIN_VISUAL_INTENT',
      confidence: 'LOW',
      confidenceScore: 0.25,
      commercialIntent: false,
      visualObject: null,
      source: effectiveSource,
      hasExplicitCommercialSignal: false,
      isMedicalRestricted: false,
      explanation: 'Nia haijabainika wazi kati ya kupata maelezo au kutafuta bidhaa.',
      reasoningSignals: ['ambiguous_visual_expression', 'clarification_recommended'],
      matchedCues: ['ambiguous_cue'],
      clarificationPrompt: 'Unataka nikueleze kuhusu hii, au nikutafutie bidhaa kama hii kwenye Gulio?',
      normalizedQuery: null
    };
  }

  // ============================================================================
  // 3. EXPLICIT COMMERCIAL INTENT WITH VISUAL ATTACHMENT OR MULTI-TURN CONTEXT
  // ============================================================================

  const matchedCommercialCues = COMMERCIAL_PATTERNS.filter((p) => p.test(cleanText)).map((p) => p.source);
  const hasDirectCommercialCue = matchedCommercialCues.length > 0;

  if (hasDirectCommercialCue || isMultiTurnVisualFollowup) {
    // Distinguish VISUAL_PRODUCT_NEED ("nataka kama hii", "ninahitaji kama hii") vs VISUAL_PRODUCT_SEARCH ("wapi napata hii", "inauzwa wapi")
    const isNeed = /\b(nataka\s+(kama\s+hii|kama\s+hiki|kitu\s+kama\s+hiki|moja\s+kama\s+hii)|nahitaji\s+kama|ninahitaji\s+kama)\b/i.test(cleanText);
    const intent: VisualMarketplaceIntentType = isNeed ? 'VISUAL_PRODUCT_NEED' : 'VISUAL_PRODUCT_SEARCH';

    // Quality check (Section 17 & 18)
    const isQualityCompromised = effectiveQuality === 'blurry' || effectiveQuality === 'dark' ||
      effectiveQuality === 'distant' || effectiveQuality === 'uncertain' ||
      POOR_QUALITY_PATTERNS.some((p) => p.test(lowerText));

    const confidence: VisualIntentConfidence = isQualityCompromised ? 'MEDIUM' : 'HIGH';
    const confidenceScore = isQualityCompromised ? 0.65 : 0.9;

    const explicitLocation = extractExplicitRegion(cleanText);
    const resolvedLocation = explicitLocation || farmerLocation;

    // Conservative Product Concept Derivation
    const { visualObject, productConcept, category, subcategory } = deriveConservativeProductConcept(
      cleanText,
      isQualityCompromised ? 'blurry' : undefined
    );

    const hasSpecificConceptInText = productConcept && productConcept !== 'Vifaa au Pembejeo za Mifugo';
    const effectiveConcept = hasSpecificConceptInText
      ? productConcept
      : (activeVisualContext?.productConcept || activeVisualContext?.previousStructuredQuery?.productConcept || 'Vifaa au Pembejeo za Mifugo');
    const effectiveVisualObj = isQualityCompromised
      ? 'UNCERTAIN'
      : (hasSpecificConceptInText ? visualObject : (activeVisualContext?.visualObject || activeVisualContext?.previousStructuredQuery?.productConcept || visualObject));

    const reasoningSignals = isMultiTurnVisualFollowup
      ? ['multiturn_visual_context_inherited', 'follow_up_commercial_signal']
      : (isQualityCompromised
        ? ['commercial_signal_confirmed', 'quality_uncertain_visual_object_unverified']
        : ['explicit_commercial_signal', 'visual_attachment_present']);

    // V1.3B Build Controlled Structured Marketplace Query (Section 7 & 10)
    const structuredQuery = buildStructuredVisualMarketplaceQuery({
      userText: cleanText,
      source: effectiveSource,
      intentType: intent,
      visualObject: effectiveVisualObj,
      productConceptCandidate: effectiveConcept,
      farmerLocation,
      farmerPrimaryLivestock,
      imageQuality: imageQuality || (isQualityCompromised ? 'blurry' : 'clear'),
      videoQuality: videoQuality || (effectiveSource === 'video' && isQualityCompromised ? 'blurry' : undefined),
      conversationHistory,
      previousStructuredQuery: activeVisualContext?.previousStructuredQuery || null,
      isMedicalRestricted: false
    });

    const rawQuery: RawVisualMarketplaceQuery = {
      source: effectiveSource,
      intent,
      intentType: intent,
      productConcept: structuredQuery.productConcept || effectiveConcept,
      visualObject: effectiveVisualObj,
      category: structuredQuery.category || category,
      subcategory: structuredQuery.subcategory || subcategory,
      attributes: structuredQuery.attributes.map((a) => `${a.name}: ${a.value}`),
      livestockUse: structuredQuery.livestockUse || farmerPrimaryLivestock,
      region: structuredQuery.region || resolvedLocation,
      district: structuredQuery.district || undefined,
      pricePreference: structuredQuery.pricePreference?.max !== null || structuredQuery.pricePreference?.min !== null
        ? {
            min: structuredQuery.pricePreference?.min ?? undefined,
            max: structuredQuery.pricePreference?.max ?? undefined
          }
        : null,
      stockPreference: structuredQuery.stockPreference ? 'in_stock' : null,
      confidence,
      confidenceScore,
      commercialIntent: true,
      hasCommercialSignal: true,
      isMedicalSafetyRestricted: false,
      reasoningSignals
    };

    const normalizedQuery = normalizeVisualMarketplaceQuery(rawQuery, {
      fallbackSource: effectiveSource,
      fallbackLocation: structuredQuery.region || resolvedLocation,
      hasCommercialSignal: true,
      isMedicalRestricted: false
    });

    if (normalizedQuery) {
      normalizedQuery.structuredQuery = structuredQuery;
      normalizedQuery.structuredAttributes = structuredQuery.attributes;
    }

    return {
      detected: true,
      intent,
      intentType: intent,
      confidence,
      confidenceScore,
      commercialIntent: true,
      visualObject: effectiveVisualObj,
      source: effectiveSource,
      hasExplicitCommercialSignal: true,
      isMedicalRestricted: false,
      explanation: isMultiTurnVisualFollowup
        ? 'Nia ya kibiashara ya mwendelezo imetambuliwa kutoka kwenye muktadha wa awali wa picha/video.'
        : 'Nia halisi ya kibiashara imetambuliwa pamoja na kiambatisho cha kuona.',
      reasoningSignals,
      matchedCues: hasDirectCommercialCue ? matchedCommercialCues : ['multiturn_followup_cue'],
      clarificationPrompt: null,
      normalizedQuery,
      structuredQuery
    };
  }

  // ============================================================================
  // 4. DEFAULT: UNCERTAIN INTENT (UNCERTAIN_VISUAL_INTENT)
  // ============================================================================
  return {
    detected: false,
    intent: 'UNCERTAIN_VISUAL_INTENT',
    intentType: 'UNCERTAIN_VISUAL_INTENT',
    confidence: 'LOW',
    confidenceScore: 0.3,
    commercialIntent: false,
    visualObject: null,
    source: effectiveSource,
    hasExplicitCommercialSignal: false,
    isMedicalRestricted: false,
    explanation: 'Hakuna nia iliyo wazi ya kutafuta au kununua bidhaa sokoni.',
    reasoningSignals: ['unclear_visual_intent', 'clarification_recommended'],
    matchedCues: [],
    clarificationPrompt: 'Unataka nikueleze kuhusu hii, au nikutafutie bidhaa kama hii kwenye Gulio?',
    normalizedQuery: null
  };
}

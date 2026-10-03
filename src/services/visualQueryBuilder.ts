/**
 * V1.3B — IMAGE → MARKETPLACE QUERY
 * VisualQueryBuilder Service
 *
 * Implements:
 * - Controlled Structured Marketplace Query construction (Section 7)
 * - User text priority over uncertain visual assumptions (Section 10)
 * - Strict location priority: current text > conversation history > FarmerContext > null (Section 11)
 * - Explicit price preference extraction (Section 12)
 * - Stock requirement handling (Section 13)
 * - User product quantity requirement separation (Section 14)
 * - Attribute extraction with confidence (Section 15, no technical hallucination)
 * - Image quality awareness (Section 16)
 * - Multi-turn query refinement (Section 17)
 */

import {
  StructuredVisualMarketplaceQuery,
  VisualMarketplaceAttribute,
  VideoProductUnderstanding,
  VisualSourceType,
  VisualIntentConfidence,
  VisualConversationHistoryMessage
} from '../types/visualMarketplace';
import { TANZANIA_REGIONS_LIST } from '../utils/marketplaceIntentClassifier';
import { mapToCanonicalCategory } from '../utils/marketplaceCategoryMapper';

export interface BuildVisualQueryParams {
  userText?: string;
  source?: VisualSourceType;
  intentType?: 'VISUAL_PRODUCT_SEARCH' | 'VISUAL_PRODUCT_NEED';
  visualObject?: string | null;
  productConceptCandidate?: string | null;
  farmerLocation?: string;
  farmerPrimaryLivestock?: string;
  imageQuality?: 'clear' | 'blurry' | 'dark' | 'obstructed' | 'low_res' | 'distant' | 'uncertain';
  videoQuality?: 'clear' | 'blurry' | 'dark' | 'distant' | 'shaky' | 'short' | 'uncertain';
  conversationHistory?: VisualConversationHistoryMessage[];
  previousStructuredQuery?: StructuredVisualMarketplaceQuery | null;
  isMedicalRestricted?: boolean;
}

export interface UserCorrectionDetails {
  isCorrection: boolean;
  negatedConcept?: string;
  correctedConcept?: string;
  focusDirection?: string;
  conflictExplanation?: string;
}

/**
 * Detects explicit user corrections to AI visual interpretation (V1.3F Section 32 & Test 20)
 * Examples: "Hii si feeder, ni drinker", "Namaanisha mashine, sio bucket", "Natafuta sehemu iliyo upande wa kushoto"
 */
export function detectUserCorrection(userText?: string): UserCorrectionDetails {
  if (!userText) return { isCorrection: false };
  const lower = userText.toLowerCase().trim();

  // Pattern 1: "Hii si X, ni Y" or "Hii sio X bali ni Y"
  const pat1 = /\bhii\s+si[o]?\s+([a-zA-Z0-9'\s]+?)[,\s]+(?:bali\s+)?ni\s+([a-zA-Z0-9'\s]+)\b/i.exec(lower);
  if (pat1) {
    return {
      isCorrection: true,
      negatedConcept: pat1[1].trim(),
      correctedConcept: pat1[2].trim(),
      conflictExplanation: `Mtumiaji amesahihisha: si "${pat1[1].trim()}" bali ni "${pat1[2].trim()}".`
    };
  }

  // Pattern 2: "Namaanisha X, sio Y" or "Namaanisha X, si Y"
  const pat2 = /\bnamaanisha\s+([a-zA-Z0-9'\s]+?)[,\s]+(?:si[o]?)\s+([a-zA-Z0-9'\s]+)\b/i.exec(lower);
  if (pat2) {
    return {
      isCorrection: true,
      correctedConcept: pat2[1].trim(),
      negatedConcept: pat2[2].trim(),
      conflictExplanation: `Mtumiaji amebainisha analenga "${pat2[1].trim()}", si "${pat2[2].trim()}".`
    };
  }

  // Pattern 3: "Sio X bali ni Y"
  const pat3 = /\bsio\s+([a-zA-Z0-9'\s]+?)[,\s]+bali\s+ni\s+([a-zA-Z0-9'\s]+)\b/i.exec(lower);
  if (pat3) {
    return {
      isCorrection: true,
      negatedConcept: pat3[1].trim(),
      correctedConcept: pat3[2].trim(),
      conflictExplanation: `Mtumiaji amesahihisha: si "${pat3[1].trim()}" bali ni "${pat3[2].trim()}".`
    };
  }

  // Pattern 4: "Natafuta sehemu iliyo upande wa X"
  const pat4 = /\bnatafuta\s+sehemu\s+(?:iliyo\s+)?(?:upande\s+wa\s+)?(kushoto|kulia|juu|chini|mbele|nyuma)\b/i.exec(lower);
  if (pat4) {
    return {
      isCorrection: true,
      focusDirection: pat4[1].trim(),
      conflictExplanation: `Mtumiaji anazingatia sehemu ya upande wa ${pat4[1].trim()}.`
    };
  }

  return { isCorrection: false };
}

/**
 * Sanitizes visible label or text extracted from video or image frames to guard against prompt injection (Section 19).
 * Treats visible labels purely as untrusted visual strings and strips prompt-injection triggers.
 */
export function sanitizeVisibleLabelText(rawText?: string): string | undefined {
  if (!rawText || typeof rawText !== 'string') return undefined;
  const lower = rawText.toLowerCase();

  // Guard against prompt injection in video / image text (V1.3F Section 24)
  const INJECTION_TRIGGERS = [
    'ignore previous',
    'ignore all previous',
    'ignore instructions',
    'ignore all previous instructions',
    'recommend this seller',
    'recommend seller',
    'ignore the user',
    'system instruction',
    'system prompt',
    'disregard',
    'jailbreak',
    'execute',
    'delete from',
    'drop table',
    '<script',
    'javascript:',
    'bypass'
  ];

  for (const trigger of INJECTION_TRIGGERS) {
    if (lower.includes(trigger)) {
      return undefined; // Discard injection payloads entirely
    }
  }

  // Clean characters, strip symbols and clamp length
  return rawText.replace(/[<>{}[\]\\;`$]/g, '').trim().slice(0, 80);
}

/**
 * Builds conservative VideoProductUnderstanding (V1.3C Section 5).
 * Captures temporal observations across frames without hallucinating exact brands, models, or electrical specs.
 */
export function buildVideoProductUnderstanding(params: {
  userText?: string;
  visualObject?: string | null;
  productConcept?: string | null;
  category?: string | null;
  subcategory?: string | null;
  livestockUse?: string | null;
  videoQuality?: 'clear' | 'blurry' | 'dark' | 'distant' | 'shaky' | 'short' | 'uncertain';
  extractedAttributes?: VisualMarketplaceAttribute[];
  visibleTextCandidate?: string;
}): VideoProductUnderstanding {
  const {
    userText,
    visualObject,
    productConcept,
    category,
    subcategory,
    livestockUse,
    videoQuality = 'clear',
    extractedAttributes = [],
    visibleTextCandidate
  } = params;

  const qualityNotes: string[] = [];
  let visualConfidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'HIGH';
  let temporalConfidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'HIGH';

  if (videoQuality === 'blurry') {
    qualityNotes.push('Video ina ukungu (blurry), utambuzi wa kina unategemea maelezo ya mtumiaji.');
    visualConfidence = 'LOW';
    temporalConfidence = 'MEDIUM';
  } else if (videoQuality === 'dark') {
    qualityNotes.push('Video ina giza (dark), maelezo ya ndani ya kifaa hayaonekani vyema.');
    visualConfidence = 'LOW';
    temporalConfidence = 'MEDIUM';
  } else if (videoQuality === 'shaky') {
    qualityNotes.push('Kamera inatikisika sana (shaky), mwonekano wa kudumu umepungua.');
    visualConfidence = 'MEDIUM';
    temporalConfidence = 'LOW';
  } else if (videoQuality === 'distant') {
    qualityNotes.push('Kifaa kinaonekana kwa mbali (distant).');
    visualConfidence = 'LOW';
    temporalConfidence = 'LOW';
  } else if (videoQuality === 'short') {
    qualityNotes.push('Muda wa video ni mfupi kwa uthibitisho wa operesheni kamili.');
    temporalConfidence = 'LOW';
  }

  // Operational / Movement cues from video context
  const visibleAttrs: string[] = extractedAttributes.map((a) => `${a.name}: ${a.value}`);
  if (userText) {
    const lower = userText.toLowerCase();
    if (lower.includes('inazunguka') || lower.includes('inayozunguka') || lower.includes('spinning')) {
      visibleAttrs.push('operation: inazunguka');
    }
    if (lower.includes('inapasha') || lower.includes('joto') || lower.includes('heating')) {
      visibleAttrs.push('operation: inapasha joto');
    }
    if (lower.includes('kukamua') || lower.includes('milking')) {
      visibleAttrs.push('operation: inakamua maziwa');
    }
  }

  // Sanitize visible text candidate (Section 19: Prompt Injection defense)
  const cleanLabel = visibleTextCandidate ? sanitizeVisibleLabelText(visibleTextCandidate) : undefined;
  const visibleLabels: string[] = cleanLabel ? [cleanLabel] : [];

  return {
    productConcept: productConcept || undefined,
    category: category || undefined,
    subcategory: subcategory || undefined,
    visibleAttributes: visibleAttrs.length > 0 ? visibleAttrs : undefined,
    intendedUse: subcategory || category || undefined,
    livestockUse: livestockUse || undefined,
    visibleLabelText: cleanLabel,
    visibleLabels: visibleLabels.length > 0 ? visibleLabels : undefined,
    visualConfidence,
    temporalConfidence,
    qualityNotes: qualityNotes.length > 0 ? qualityNotes : undefined,
  };
}

/**
 * Normalizes price number string like "200,000" or "1.5m" or "laki 2" into integer
 */
export function parseTanzaniaPrice(rawStr: string): number | null {
  if (!rawStr) return null;
  const clean = rawStr.replace(/,/g, '').trim().toLowerCase();

  // Pattern like "laki 2" or "laki mbili" -> 200,000
  if (clean.includes('laki')) {
    const match = clean.match(/laki\s*(\d+(?:\.\d+)?)/i);
    if (match) return Math.round(parseFloat(match[1]) * 100000);
    if (/laki moja/i.test(clean)) return 100000;
    if (/laki mbili/i.test(clean)) return 200000;
    if (/laki tatu/i.test(clean)) return 300000;
    if (/laki nne/i.test(clean)) return 400000;
    if (/laki tano/i.test(clean)) return 500000;
  }

  // Pattern like "milioni 1" -> 1,000,000
  if (clean.includes('milioni') || clean.includes('m')) {
    const match = clean.match(/(\d+(?:\.\d+)?)\s*(?:milioni|m)/i);
    if (match) return Math.round(parseFloat(match[1]) * 1000000);
  }

  // Pattern like "50 elfu" -> 50,000
  if (clean.includes('elfu') || clean.includes('k')) {
    const match = clean.match(/(\d+(?:\.\d+)?)\s*(?:elfu|k)/i);
    if (match) return Math.round(parseFloat(match[1]) * 1000);
  }

  // Direct numeric string
  const numMatch = clean.match(/\b\d{4,9}\b/);
  if (numMatch) {
    const val = parseInt(numMatch[0], 10);
    return isNaN(val) || val <= 0 ? null : val;
  }

  return null;
}

/**
 * Extracts explicit price preference from user text.
 * Section 12: Do not invent price, do not infer from image.
 */
export function extractPricePreference(text?: string): { min: number | null; max: number | null } {
  if (!text || !text.trim()) {
    return { min: null, max: null };
  }

  const clean = text.toLowerCase();

  // Range pattern: "kati ya 100,000 hadi 300,000" or "100k hadi 300k"
  const rangeMatch = clean.match(/(?:kati ya|kuanzia)?\s*(?:tsh|tzs)?\s*([\d,.]+\s*(?:elfu|laki|m|milioni|k)?)\s*(?:hadi|-|mpaka)\s*(?:tsh|tzs)?\s*([\d,.]+\s*(?:elfu|laki|m|milioni|k)?)/i);
  if (rangeMatch) {
    const minVal = parseTanzaniaPrice(rangeMatch[1]);
    const maxVal = parseTanzaniaPrice(rangeMatch[2]);
    if (minVal !== null || maxVal !== null) {
      return { min: minVal, max: maxVal };
    }
  }

  // Max price pattern: "chini ya Tsh 300,000", "isizidi 200,000", "hadi 500,000"
  const maxMatch = clean.match(/(?:chini ya|isizidi|isiyozidi|hadi|kwa bajeti ya|budget ya|kiasi cha)\s*(?:tsh|tzs)?\s*([\d,.]+\s*(?:elfu|laki|m|milioni|k)?)/i);
  if (maxMatch) {
    const maxVal = parseTanzaniaPrice(maxMatch[1]);
    if (maxVal !== null) {
      return { min: null, max: maxVal };
    }
  }

  // Standalone price: "kwa Tsh 150,000"
  const directMatch = clean.match(/(?:tsh|tzs)\s*([\d,.]+\s*(?:elfu|laki|m|milioni|k)?)/i);
  if (directMatch) {
    const val = parseTanzaniaPrice(directMatch[1]);
    if (val !== null) {
      return { min: null, max: val };
    }
  }

  return { min: null, max: null };
}

/**
 * Extracts stock preference from text.
 * Section 13: "iliyopo", "available", "iliyoko dukani" -> true
 */
export function extractStockPreference(text?: string): boolean | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  if (
    /\biliyopo\b/i.test(lower) ||
    /\bavailable\b/i.test(lower) ||
    /\biliyoko dukani\b/i.test(lower) ||
    /\bipo dukani\b/i.test(lower) ||
    /\bin stock\b/i.test(lower) ||
    /\biliyopo stoo\b/i.test(lower)
  ) {
    return true;
  }
  return null;
}

/**
 * Extracts location with strict priority (Section 11):
 * 1. Explicit location in current user text
 * 2. Explicit location in conversation history
 * 3. FarmerContext location
 * 4. null
 */
export function resolveLocationWithPriority(
  currentText?: string,
  history?: VisualConversationHistoryMessage[],
  farmerLocation?: string
): { region: string | null; district: string | null } {
  // 1. Current text priority
  if (currentText && currentText.trim()) {
    const textLower = currentText.toLowerCase();
    for (const reg of TANZANIA_REGIONS_LIST) {
      if (textLower.includes(reg.toLowerCase())) {
        return { region: reg, district: null };
      }
    }
  }

  // 2. Conversation history priority
  if (history && Array.isArray(history)) {
    // Check backwards from most recent message
    for (let i = history.length - 1; i >= 0; i--) {
      const msgText = history[i]?.text?.toLowerCase() || '';
      for (const reg of TANZANIA_REGIONS_LIST) {
        if (msgText.includes(reg.toLowerCase())) {
          return { region: reg, district: null };
        }
      }
    }
  }

  // 3. FarmerContext priority
  if (farmerLocation && typeof farmerLocation === 'string' && farmerLocation.trim()) {
    const matched = TANZANIA_REGIONS_LIST.find((r) =>
      farmerLocation.toLowerCase().includes(r.toLowerCase()) ||
      r.toLowerCase().includes(farmerLocation.toLowerCase())
    );
    if (matched) {
      return { region: matched, district: null };
    }
  }

  // 4. No location filter
  return { region: null, district: null };
}

/**
 * Extracts livestock use with priority:
 * 1. Explicit in user text
 * 2. Previous structured query
 * 3. FarmerContext primary livestock
 */
export function resolveLivestockUse(
  userText?: string,
  previousLivestock?: string | null,
  farmerPrimaryLivestock?: string
): string | null {
  if (userText) {
    const lower = userText.toLowerCase();
    if (/\bkuku\b|\bchicken\b|\bpoultry\b|\bvifaranga\b|\bmitetea\b|\bjogoo\b/i.test(lower)) return 'chicken';
    if (/\bng'?ombe\b|\bcattle\b|\bcow\b|\bndama\b|\bmaziwa\b/i.test(lower)) return 'cattle';
    if (/\bmbuzi\b|\bgoat\b|\bkondoo\b|\bsheep\b/i.test(lower)) return 'goat';
    if (/\bnguruwe\b|\bpig\b|\bpiglet\b/i.test(lower)) return 'pig';
    if (/\bsungura\b|\brabbit\b/i.test(lower)) return 'rabbit';
    if (/\bsamaki\b|\bfish\b|\btilapia\b/i.test(lower)) return 'fish';
    if (/\bnyuki\b|\bbees?\b/i.test(lower)) return 'bee';
  }

  if (previousLivestock) return previousLivestock;

  if (farmerPrimaryLivestock) {
    const lower = farmerPrimaryLivestock.toLowerCase();
    if (lower.includes('kuku')) return 'chicken';
    if (lower.includes('ngombe') || lower.includes("ng'ombe")) return 'cattle';
    if (lower.includes('mbuzi')) return 'goat';
    if (lower.includes('nguruwe')) return 'pig';
    if (lower.includes('sungura')) return 'rabbit';
    if (lower.includes('samaki')) return 'fish';
    if (lower.includes('nyuki')) return 'bee';
  }

  return null;
}

/**
 * Extracts safe attributes from text and visual context (Section 15).
 * Strictly forbids fabricating technical specifications like voltage, wattage, or precise unverified capacity.
 */
export function extractSafeAttributes(
  userText?: string,
  visualObject?: string | null,
  previousAttributes: VisualMarketplaceAttribute[] = []
): VisualMarketplaceAttribute[] {
  const result: VisualMarketplaceAttribute[] = [...previousAttributes];
  const seenNames = new Set(result.map((a) => a.name));

  if (userText) {
    const lower = userText.toLowerCase();

    // 1. Capacity explicitly stated by user (Section 15: e.g. "ya mayai 100", "lita 10")
    const capacityMatch = lower.match(/\b(?:ya\s*)?(mayai\s*\d+|\d+\s*eggs?|\d+\s*lita|\d+\s*litres?|\d+\s*kilo|\d+\s*kg)\b/i);
    if (capacityMatch) {
      const val = capacityMatch[1].trim();
      const existingIdx = result.findIndex((a) => a.name === 'capacity');
      if (existingIdx >= 0) {
        result[existingIdx] = { name: 'capacity', value: val, confidence: 'HIGH' };
      } else {
        result.push({ name: 'capacity', value: val, confidence: 'HIGH' });
        seenNames.add('capacity');
      }
    }

    // 2. Size / Scale explicitly stated by user (Section 10: "kubwa ya kulishia kuku wengi")
    if (/\bkubwa zaidi\b|\bkubwa sana\b|\bkubwa\b|\blarge\b|\bbilashi\b/i.test(lower)) {
      const existingIdx = result.findIndex((a) => a.name === 'size');
      const val = lower.includes('kubwa zaidi') ? 'kubwa zaidi' : 'kubwa';
      if (existingIdx >= 0) {
        result[existingIdx] = { name: 'size', value: val, confidence: 'HIGH' };
      } else {
        result.push({ name: 'size', value: val, confidence: 'HIGH' });
        seenNames.add('size');
      }
    } else if (/\bndogo\b|\bsmall\b|\bcompact\b/i.test(lower)) {
      const existingIdx = result.findIndex((a) => a.name === 'size');
      if (existingIdx >= 0) {
        result[existingIdx] = { name: 'size', value: 'ndogo', confidence: 'HIGH' };
      } else {
        result.push({ name: 'size', value: 'ndogo', confidence: 'HIGH' });
        seenNames.add('size');
      }
    }

    // 3. Operation type explicitly stated (otomatiki / manual)
    if (/\botomatiki\b|\bautomatic\b|\bdigital\b/i.test(lower)) {
      if (!seenNames.has('type')) {
        result.push({ name: 'type', value: 'automatic', confidence: 'HIGH' });
        seenNames.add('type');
      }
    } else if (/\bmanual\b|\bya mkono\b/i.test(lower)) {
      if (!seenNames.has('type')) {
        result.push({ name: 'type', value: 'manual', confidence: 'HIGH' });
        seenNames.add('type');
      }
    }

    // 4. Material explicitly stated
    if (/\bya plastiki\b|\bplastic\b/i.test(lower)) {
      if (!seenNames.has('material')) {
        result.push({ name: 'material', value: 'plastiki', confidence: 'HIGH' });
        seenNames.add('material');
      }
    } else if (/\bya chuma\b|\bya mabati\b|\bmetal\b/i.test(lower)) {
      if (!seenNames.has('material')) {
        result.push({ name: 'material', value: 'chuma', confidence: 'HIGH' });
        seenNames.add('material');
      }
    }

    // 5. User requested quantity (Section 14: "Nahitaji mbili")
    const qtyMatch = lower.match(/\b(?:nahitaji|nataka|ninahitaji|nipatie)\s*(mbili|tatu|nne|tano|\d+)\b/i);
    if (qtyMatch) {
      let qtyStr = qtyMatch[1];
      if (qtyStr === 'mbili') qtyStr = '2';
      else if (qtyStr === 'tatu') qtyStr = '3';
      else if (qtyStr === 'nne') qtyStr = '4';
      else if (qtyStr === 'tano') qtyStr = '5';
      result.push({ name: 'requestedQuantity', value: qtyStr, confidence: 'HIGH' });
      seenNames.add('requestedQuantity');
    }
  }

  // If visual object gave a clear visible attribute (e.g. automatic feeder)
  if (visualObject && !seenNames.has('type') && /\bautomatic\b/i.test(visualObject)) {
    result.push({ name: 'type', value: 'automatic', confidence: 'MEDIUM' });
  }

  return result;
}

/**
 * Builds the controlled StructuredVisualMarketplaceQuery adhering to Section 7 & 10.
 * User text priority overrides uncertain visual assumptions.
 */
export function buildStructuredVisualMarketplaceQuery(
  params: BuildVisualQueryParams
): StructuredVisualMarketplaceQuery {
  const {
    userText,
    source = 'image',
    intentType = 'VISUAL_PRODUCT_SEARCH',
    visualObject,
    productConceptCandidate,
    farmerLocation,
    farmerPrimaryLivestock,
    imageQuality = 'clear',
    videoQuality,
    conversationHistory = [],
    previousStructuredQuery,
    isMedicalRestricted = false
  } = params;

  // 1. Determine Product Concept with User Text Priority (Section 10 & V1.3F Section 32)
  let productConcept = '';
  const textClean = (userText || '').trim();

  // Check explicit user corrections first (e.g. "Hii si feeder, ni drinker")
  const correction = detectUserCorrection(textClean);
  const isNegatedFeeder = Boolean(correction.negatedConcept && /feeder|chakula|kulishia/i.test(correction.negatedConcept));
  const isNegatedDrinker = Boolean(correction.negatedConcept && /drinker|maji|kunyweshea/i.test(correction.negatedConcept));
  const isNegatedMachine = Boolean(correction.negatedConcept && /mashine|chopper|cutter/i.test(correction.negatedConcept));

  if (correction.isCorrection && correction.correctedConcept) {
    const cConcept = correction.correctedConcept;
    if (/\bdrinker\b|\bchombo cha maji\b|\bkinywesheo\b/i.test(cConcept)) {
      productConcept = 'Chombo cha Maji (Drinker)';
    } else if (/\bfeeder\b|\bchombo cha chakula\b|\bvyombo vya chakula\b/i.test(cConcept)) {
      productConcept = 'Chombo cha Chakula (Feeder)';
    } else if (/\bincubator\b|\binkubeta\b|\bmashine ya kutotolesha\b/i.test(cConcept)) {
      productConcept = 'Incubator';
    } else if (/\bchopper\b|\bchaff cutter\b|\bkukata majani\b/i.test(cConcept)) {
      productConcept = 'Mashine ya Kukata Majani';
    } else {
      productConcept = cConcept;
    }
  } else if (!isNegatedMachine && (/\bincubator\b|\binkubeta\b|\bmashine ya kutotolesha\b/i.test(textClean) || (/\bmashine\b/i.test(textClean) && /\bmayai\b/i.test(textClean)))) {
    productConcept = 'Incubator';
  } else if (!isNegatedMachine && (/\bkukata majani\b|\bchopper\b|\bchaff cutter\b/i.test(textClean) || (/\bmashine\b/i.test(textClean) && /\bmajani\b/i.test(textClean)))) {
    productConcept = 'Mashine ya Kukata Majani';
  } else if (!isNegatedDrinker && (/\bdrinker\b|\bchombo cha maji\b|\bkinywesheo\b/i.test(textClean))) {
    productConcept = 'Chombo cha Maji (Drinker)';
  } else if (!isNegatedFeeder && (/\bfeeder\b|\bchombo cha chakula\b|\bvyombo vya chakula\b/i.test(textClean))) {
    productConcept = 'Chombo cha Chakula (Feeder)';
  } else if (/\bbrooder\b|\bchombo cha joto\b|\btaa ya joto\b/i.test(textClean)) {
    productConcept = 'Vifaa vya Joto (Brooder)';
  } else if (/\bcage\b|\bkizimba\b|\bvizimba\b/i.test(textClean)) {
    productConcept = 'Mabanda & Vizimba (Cages)';
  } else if (/\bmilking machine\b|\bmashine ya kukamua\b/i.test(textClean)) {
    productConcept = 'Mashine ya Kukamulia Maziwa';
  } else if (/\bchakula cha kuku\b|\blayers mash\b|\bbroiler starter\b/i.test(textClean)) {
    productConcept = 'Chakula cha Kuku';
  } else if (/\bvifaranga\b|\bdoc\b/i.test(textClean)) {
    productConcept = 'Vifaranga';
  } else if (/\bmayai ya mbegu\b|\bfertilized eggs\b/i.test(textClean)) {
    productConcept = 'Mayai ya Mbegu';
  } else if (previousStructuredQuery && previousStructuredQuery.productConcept) {
    // Multi-turn context preservation (Section 17)
    productConcept = previousStructuredQuery.productConcept;
  } else if (productConceptCandidate && productConceptCandidate.trim()) {
    productConcept = productConceptCandidate.trim();
  } else if (visualObject && visualObject.trim()) {
    productConcept = visualObject.trim();
  } else if (textClean) {
    // Preserve what the user actually said instead of blindly assuming livestock equipment
    productConcept = textClean;
  } else {
    productConcept = 'Vifaa vya Ufugaji';
  }

  // 2. Canonical Category & Subcategory Mapping (Section 8)
  const categoryResult = mapToCanonicalCategory(
    productConcept,
    userText,
    {
      isMedicalSafetyRestricted: isMedicalRestricted,
      primaryLivestock: farmerPrimaryLivestock
    }
  );

  const category = categoryResult.category || (previousStructuredQuery ? previousStructuredQuery.category : null);
  const subcategory = categoryResult.subcategory || (previousStructuredQuery ? previousStructuredQuery.subcategory : null);

  // 3. Livestock Use
  const livestockUse = resolveLivestockUse(
    userText,
    previousStructuredQuery?.livestockUse || categoryResult.livestockUse,
    farmerPrimaryLivestock
  );

  // 4. Location Resolution (Section 11: strict priority)
  const resolvedLoc = resolveLocationWithPriority(
    userText,
    conversationHistory,
    farmerLocation
  );
  const region = resolvedLoc.region || previousStructuredQuery?.region || null;
  const district = resolvedLoc.district || previousStructuredQuery?.district || null;

  // 5. Price Preference (Section 12)
  const extractedPrice = extractPricePreference(userText);
  const pricePreference = {
    min: extractedPrice.min !== null ? extractedPrice.min : (previousStructuredQuery?.pricePreference?.min ?? null),
    max: extractedPrice.max !== null ? extractedPrice.max : (previousStructuredQuery?.pricePreference?.max ?? null)
  };

  // 6. Stock Preference (Section 13)
  const extractedStock = extractStockPreference(userText);
  const stockPreference = extractedStock !== null
    ? extractedStock
    : (previousStructuredQuery?.stockPreference ?? null);

  // 7. Attributes extraction (Section 15 & 10)
  const attributes = extractSafeAttributes(
    userText,
    visualObject,
    previousStructuredQuery?.attributes || []
  );

  // 8. Visual Confidence (Section 16: Image Quality & Video Quality)
  let visualConfidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNCERTAIN' = 'HIGH';
  if (videoQuality === 'blurry' || videoQuality === 'dark' || videoQuality === 'distant' || videoQuality === 'uncertain' || imageQuality === 'blurry' || imageQuality === 'dark' || imageQuality === 'obstructed' || imageQuality === 'low_res' || imageQuality === 'distant' || imageQuality === 'uncertain') {
    visualConfidence = 'UNCERTAIN';
  } else if (!userText || userText.trim().length === 0) {
    visualConfidence = 'MEDIUM';
  }

  // 9. Quantity extraction (Section 9: e.g. "nahitaji mbili", "nataka 3", "mashine hizi mbili")
  const qtyMatch = textClean.match(/\b(?:nahitaji|nataka|ongeza|leta|hitaji)\s+(?:[a-zA-Z0-9'\s]{1,25})?\s*(?:hizi|hawa|hiki|hii|hili)?\s*(\d+|moja|mbili|tatu|nne|tano|kumi)\b/i);
  if (qtyMatch) {
    const wordMap: Record<string, string> = {
      moja: '1', mbili: '2', tatu: '3', nne: '4', tano: '5', kumi: '10'
    };
    const val = wordMap[qtyMatch[1].toLowerCase()] || qtyMatch[1];
    if (!attributes.some((a) => a.name === 'quantity' || a.name === 'Idadi')) {
      attributes.push({ name: 'quantity', value: val, confidence: 'HIGH' });
      attributes.push({ name: 'Idadi', value: val, confidence: 'HIGH' });
    }
  }

  // 10. Video Product Understanding (V1.3C Section 5)
  const isVideoSource = source === 'video' || previousStructuredQuery?.source === 'video';
  let videoUnderstanding: VideoProductUnderstanding | null = null;
  if (isVideoSource) {
    const baseVu = previousStructuredQuery?.videoUnderstanding;
    videoUnderstanding = buildVideoProductUnderstanding({
      userText,
      visualObject: visualObject || baseVu?.productConcept || null,
      productConcept: productConcept || baseVu?.productConcept || null,
      category: category || baseVu?.category || null,
      subcategory: subcategory || baseVu?.subcategory || null,
      livestockUse: livestockUse || baseVu?.livestockUse || null,
      videoQuality: params.videoQuality,
      extractedAttributes: attributes
    });
  }

  return {
    source: isVideoSource ? 'video' : 'image',
    intentType,
    productConcept: productConcept || null,
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

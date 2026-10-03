import {
  MarketplaceIntentType,
  IntentConfidence,
  StructuredMarketplaceQuery
} from '../types/marketplaceRecommendation';

// List of all 26+ Tanzania regions for location extraction
export const TANZANIA_REGIONS_LIST = [
  'Dar es Salaam',
  'Arusha',
  'Mbeya',
  'Morogoro',
  'Mwanza',
  'Dodoma',
  'Tanga',
  'Kilimanjaro',
  'Iringa',
  'Tabora',
  'Shinyanga',
  'Kagera',
  'Kigoma',
  'Mara',
  'Manyara',
  'Singida',
  'Ruvuma',
  'Njombe',
  'Rukwa',
  'Katavi',
  'Lindi',
  'Mtwara',
  'Pwani',
  'Songwe',
  'Geita',
  'Simiyu',
  'Zanzibar',
  'Pemba',
  'Unguja'
];

// Informational and educational patterns that suppress commercial intent
const INFORMATIONAL_PATTERNS = [
  /\bni\s+(nini|kitu\s+gani|ugonjwa\s+gani|tiba\s+gani)\b/i,
  /\bmaana\s+yake\b/i,
  /\bdalili\b/i,
  /\bkwa\s+nini\b/i,
  /\bsababu\s+(za|yake|gani)\b/i,
  /\bjinsi\s+ya\b/i,
  /\bumuhimu\s+(wa|gani|wake)\b/i,
  /\bfaida\s+(za|gani|zake)\b/i,
  /\bhasara\s+(za|gani)\b/i,
  /\bnifundishe\b/i,
  /\bnieleze\b/i,
  /\bniambie\s+kuhusu\b/i,
  /\bnataka\s+kujua\b/i, // "Nataka kujua ..." is educational inquiry, not purchase
  /\bnahitaji\s+kujua\b/i,
  /\bninawezaje\s+kuboresha\b/i,
  /\bkwanini\b/i,
  /\brekodi\s+zangu\b/i,
  /\bkulingana\s+na\s+rekodi\b/i,
  /\bkwenye\s+msaidizi\s+wangu\b/i,
  /\bkatika\s+rekodi\b/i,
  /\buzito\s+gani\b/i,
  /\bidadi\s+yangu\b/i,
  /\bmifugo\s+yangu\s+iko\s+mingapi\b/i,
  /\bmbona\s+kuku\b/i,
  /\bwanapumua\s+kwa\s+shida\b/i
];

// Equipment keywords that trigger EQUIPMENT_SEARCH
const EQUIPMENT_KEYWORDS = [
  'incubator',
  'mashine ya kutotolesha',
  'mashine za kutotolesha',
  'chombo cha maji',
  'vyombo vya maji',
  'chombo cha chakula',
  'vyombo vya chakula',
  'vizimba',
  'kizimba',
  'cage',
  'cages',
  'brooder',
  'mzinga',
  'mizinga',
  'debe',
  'kichanja',
  'drinker',
  'feeder',
  'taa ya joto',
  'mashine'
];

// Shop / Store search cues
const SHOP_PATTERNS = [
  /\b(duka|maduka)\s+(la|ya)?\s*(dawa|pembejeo|vifaa|kilimo|mifugo|kuku|agrovet)\b/i,
  /\b(nipatie|nipe|nionyeshe|wapi|natafuta)\s+(duka|maduka|agrovet|muuzaji|wauzaji)\b/i,
  /\bduka\s+gani\b/i,
  /\bduka\s+linalouza\b/i,
  /\bmaduka\s+yanayouza\b/i,
  /\bmaduka\s+yaliyopo\b/i
];

// Explicit commercial acquisition triggers
const COMMERCIAL_TRIGGERS = [
  /\bnatafuta\b/i,
  /\bnahitaji\s+kununua\b/i,
  /\bnataka\s+kununua\b/i,
  /\bninahitaji\s+kununua\b/i,
  /\bkuagiza\b/i,
  /\bwapi\s+naweza\s+(kupata|kununua)\b/i,
  /\bwapi\s+(inauzwa|zinauzwa|panauzwa)\b/i,
  /\binauzwa\s+wapi\b/i,
  /\bzinauzwa\s+wapi\b/i,
  /\b(nipe|nipatie|nionyeshe)\s+bidhaa\b/i,
  /\bbidhaa\s+gani\s+za\b/i,
  /\bzipo\s+gulioni\b/i,
  /\bkwenye\s+gulio\b/i,
  /\bbei\s+ya\s+kununua\b/i
];

// Product need triggers (e.g. "nahitaji chakula", "nataka chanjo")
const PRODUCT_NEED_TRIGGERS = [
  /\bnahitaji\s+(chakula|chanjo|vifaranga|mayai|dawa|mbegu|mitamba|ng'ombe|mbuzi|kuku|sungura|nyasi|mashudu|pumba)\b/i,
  /\bnataka\s+(chakula|chanjo|vifaranga|mayai|dawa|mbegu|mitamba|ng'ombe|mbuzi|kuku|sungura|nyasi|mashudu|pumba|incubator)\b/i
];

// Stopwords in Swahili to clean query keywords
const SWAHILI_STOPWORDS = new Set([
  'na', 'ya', 'wa', 'za', 'la', 'cha', 'vya', 'kwa', 'katika', 'kwenye', 'hapa',
  'hiki', 'huyu', 'hawa', 'hizi', 'hizo', 'kila', 'kama', 'ili', 'je', 'au',
  'ni', 'si', 'yangu', 'wangu', 'zangu', 'changu', 'vyangu', 'yetu', 'wetu',
  'zetu', 'chetu', 'vyetu', 'yako', 'wako', 'zako', 'chako', 'vyako',
  'mimi', 'wewe', 'yeye', 'sisi', 'ninyi', 'wao', 'nina', 'nili', 'nita',
  'tuna', 'tuli', 'tuta', 'ana', 'ali', 'ata', 'wana', 'wali', 'wata',
  'habari', 'asante', 'tafadhali', 'ndugu', 'mbona', 'je', 'lini', 'wapi',
  'jinsi', 'gani', 'ipi', 'kipi', 'vipi', 'gani', 'nataka', 'nahitaji',
  'natafuta', 'kununua', 'kupata', 'kuuza', 'kuagiza', 'nipatie', 'nipe',
  'nionyeshe', 'kujua', 'kuhusu', 'ina', 'zina', 'kuna', 'hapa', 'pale'
]);

/**
 * Clean and extract keywords from text
 */
export function extractCleanKeywords(text: string): string[] {
  const normalized = text
    .toLowerCase()
    .replace(/[^\w\s\d'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const rawTokens = normalized.split(' ').filter(Boolean);
  const meaningful: string[] = [];

  for (const token of rawTokens) {
    if (token.length < 3) continue;
    if (SWAHILI_STOPWORDS.has(token)) continue;
    meaningful.push(token);
  }

  return meaningful;
}

/**
 * Extract location mention from query text
 */
export function extractLocationFromText(text: string): string | undefined {
  const lower = text.toLowerCase();
  for (const region of TANZANIA_REGIONS_LIST) {
    const regLower = region.toLowerCase();
    if (lower.includes(regLower)) {
      return region;
    }
  }
  return undefined;
}

export interface IntentClassifierResult {
  intent: MarketplaceIntentType;
  confidence: IntentConfidence;
  targetType: 'product' | 'shop';
  category?: string;
  subcategory?: string;
  keywords: string[];
  location?: string;
  isAmbiguous: boolean;
  isEducational: boolean;
}

/**
 * Classifies farmer's message to determine if it has a Marketplace intent
 */
export function classifyMarketplaceIntent(
  userText: string,
  fallbackFarmerLocation?: string
): IntentClassifierResult {
  if (!userText || !userText.trim()) {
    return {
      intent: 'NO_MARKETPLACE_INTENT',
      confidence: 'LOW',
      targetType: 'product',
      keywords: [],
      isAmbiguous: false,
      isEducational: false,
    };
  }

  const cleanText = userText.trim();
  const lower = cleanText.toLowerCase();

  // 1. Check for informational/educational cues or Doctor queries
  // V1.2G: Daktari requests (e.g. "Nipatie daktari wa kuku Morogoro") must never trigger Marketplace!
  const isDoctorQuery = /\b(daktari|dakatri|bwana\s+mifugo|bibi\s+mifugo|afisa\s+mifugo|afisa\s+ugani|mtaalamu\s+wa\s+mifugo|veterinary|vet)\b/i.test(cleanText);
  const isEducational = INFORMATIONAL_PATTERNS.some((pattern) => pattern.test(cleanText));
  
  // Explicit purchase phrases like "nataka kununua" or "wapi naweza kununua" take precedence over general question marks
  const hasExplicitBuy = /\b(kununua|kuagiza|inauzwa\s+wapi|wapi\s+inauzwa|bei\s+ya\s+kununua|wapi\s+naweza\s+kununua)\b/i.test(cleanText);

  // If user is searching for a doctor and didn't explicitly ask to buy a product, suppress marketplace immediately
  if (isDoctorQuery && !hasExplicitBuy) {
    return {
      intent: 'NO_MARKETPLACE_INTENT',
      confidence: 'LOW',
      targetType: 'product',
      keywords: extractCleanKeywords(cleanText),
      isAmbiguous: false,
      isEducational: false,
    };
  }

  if (isEducational && !hasExplicitBuy) {
    return {
      intent: 'NO_MARKETPLACE_INTENT',
      confidence: 'LOW',
      targetType: 'product',
      keywords: extractCleanKeywords(cleanText),
      isAmbiguous: false,
      isEducational: true,
    };
  }

  // 2. Ambiguity check:
  // "Nataka kujua chanjo ya Newcastle" -> ambiguous informational
  // If user says "nataka kujua" without "kununua", do NOT force commercial intent.
  if (/\bnataka\s+kujua\b/i.test(cleanText) && !hasExplicitBuy) {
    return {
      intent: 'NO_MARKETPLACE_INTENT',
      confidence: 'LOW',
      targetType: 'product',
      keywords: extractCleanKeywords(cleanText),
      isAmbiguous: true,
      isEducational: true,
    };
  }

  // 3. Check for SHOP_SEARCH
  // Example: "Nipatie duka la dawa za mifugo.", "Natafuta maduka ya kilimo Morogoro."
  const isShopSearch = SHOP_PATTERNS.some((pattern) => pattern.test(cleanText));
  if (isShopSearch) {
    const extractedLoc = extractLocationFromText(cleanText) || fallbackFarmerLocation;
    return {
      intent: 'SHOP_SEARCH',
      confidence: 'HIGH',
      targetType: 'shop',
      category: lower.includes('dawa') ? 'Dawa za Mifugo' : lower.includes('chakula') ? 'Chakula cha Mifugo' : undefined,
      keywords: extractCleanKeywords(cleanText),
      location: extractedLoc,
      isAmbiguous: false,
      isEducational: false,
    };
  }

  // 4. Check for EQUIPMENT_SEARCH
  // Example: "Natafuta incubator ya mayai.", "Nataka kununua incubator."
  const hasEquipmentKeyword = EQUIPMENT_KEYWORDS.some((k) => lower.includes(k));
  const hasCommercialCue = COMMERCIAL_TRIGGERS.some((p) => p.test(cleanText));
  const hasProductNeedCue = PRODUCT_NEED_TRIGGERS.some((p) => p.test(cleanText));

  if (hasEquipmentKeyword) {
    // If it mentions equipment and either has a commercial cue or general seeking word
    if (hasCommercialCue || hasProductNeedCue || /\b(natafuta|nahitaji|nataka|wapi)\b/i.test(cleanText)) {
      const extractedLoc = extractLocationFromText(cleanText) || fallbackFarmerLocation;
      return {
        intent: 'EQUIPMENT_SEARCH',
        confidence: 'HIGH',
        targetType: 'product',
        category: 'Vifaa vya Ufugaji',
        subcategory: lower.includes('incubator') || lower.includes('kutotolesha') ? 'Mashine za Kutotolesha (Incubators)' : undefined,
        keywords: extractCleanKeywords(cleanText),
        location: extractedLoc,
        isAmbiguous: false,
        isEducational: false,
      };
    }
  }

  // 5. Check for PRODUCT_SEARCH & PRODUCT_NEED
  // PRODUCT_SEARCH: Farmer explicitly searches for a specific product
  // Examples:
  // "Natafuta chanjo ya Newcastle."
  // "Nataka kununua chanjo ya Newcastle."
  // "Nipe bidhaa za chanjo ya Newcastle."
  // "Wapi naweza kupata vifaranga vya sasso?"
  // PRODUCT_NEED: Farmer describes a need mapping to a product
  // Examples:
  // "Nahitaji chakula cha kuku wa mayai."
  // "Nahitaji chakula cha kuku wa mayai Morogoro."
  // "Nataka chakula kizuri cha kuku wa mayai."
  if (hasCommercialCue || hasProductNeedCue) {
    const extractedLoc = extractLocationFromText(cleanText) || fallbackFarmerLocation;
    const keywords = extractCleanKeywords(cleanText);

    // Determine category mapping
    let mappedCategory: string | undefined;
    let mappedSubcategory: string | undefined;

    if (lower.includes('chanjo') || lower.includes('dawa') || lower.includes('antibiotic') || lower.includes('minyoo') || lower.includes('newcastle')) {
      mappedCategory = 'Dawa za Mifugo';
      if (lower.includes('chanjo') || lower.includes('newcastle') || lower.includes('gumboro') || lower.includes('marek')) {
        mappedSubcategory = 'Chanjo (Vaccines)';
      }
    } else if (lower.includes('chakula') || lower.includes('mashudu') || lower.includes('pumba') || lower.includes('mash') || lower.includes('starter') || lower.includes('grower')) {
      mappedCategory = 'Chakula cha Mifugo';
      if (lower.includes('kuku') || lower.includes('mayai') || lower.includes('layers') || lower.includes('broiler')) {
        mappedSubcategory = 'Chakula cha Kuku (Poultry Feeds)';
      }
    } else if (lower.includes('vifaranga') || lower.includes('kifaranga') || lower.includes('doc')) {
      mappedCategory = 'Vifaranga';
    } else if (lower.includes('mayai') || lower.includes('trei') || lower.includes('trei ya mayai')) {
      mappedCategory = 'Mayai';
    } else if (lower.includes('ng\'ombe') || lower.includes('ngombe') || lower.includes('mtamba')) {
      mappedCategory = 'Ng\'ombe';
    } else if (lower.includes('mbuzi') || lower.includes('kondoo') || lower.includes('boer')) {
      mappedCategory = 'Mbuzi';
    } else if (lower.includes('nguruwe')) {
      mappedCategory = 'Nguruwe';
    } else if (lower.includes('sungura')) {
      mappedCategory = 'Sungura';
    }

    const isProductNeed = PRODUCT_NEED_TRIGGERS.some((p) => p.test(cleanText));
    const intentType: MarketplaceIntentType = isProductNeed ? 'PRODUCT_NEED' : 'PRODUCT_SEARCH';

    return {
      intent: intentType,
      confidence: 'HIGH',
      targetType: 'product',
      category: mappedCategory,
      subcategory: mappedSubcategory,
      keywords,
      location: extractedLoc,
      isAmbiguous: false,
      isEducational: false,
    };
  }

  // 6. Default to NO_MARKETPLACE_INTENT
  return {
    intent: 'NO_MARKETPLACE_INTENT',
    confidence: 'LOW',
    targetType: 'product',
    keywords: extractCleanKeywords(cleanText),
    isAmbiguous: false,
    isEducational: false,
  };
}

/**
 * Builds structured Marketplace query from classification result
 */
export function buildStructuredMarketplaceQuery(
  classification: IntentClassifierResult
): StructuredMarketplaceQuery | null {
  if (classification.intent === 'NO_MARKETPLACE_INTENT' || classification.confidence === 'LOW') {
    return null;
  }

  return {
    intent: classification.intent,
    confidence: classification.confidence,
    targetType: classification.targetType,
    category: classification.category,
    subcategory: classification.subcategory,
    keywords: classification.keywords,
    location: classification.location,
    requiresStock: true,
  };
}

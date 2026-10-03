import { LivestockRecord, LivestockEvent, EventType } from '../types';
import {
  TrendTimeWindow,
  DataSufficiencyLevel,
  ImportantObservation,
  FarmInsight,
  HealthActivityHistorySnapshot,
  LivestockMovementSnapshot,
  LivestockTrendsSnapshot,
  ActivitySummarySnapshot,
  ImportantObservationsSnapshot
} from '../types/livestockIntelligence';
import {
  ParsedHistoryQuestionIntent,
  HistoryQuestionIntent,
  HistoryCategory,
  HistoryMetric,
  HistorySupportingEvent,
  HistoryQuestionResult
} from '../types/historyQuestionTypes';
import {
  normalizeDateToYMD,
  normalizeCanonicalEventType,
  calculateWindowDateRange,
  getLivestockTrendsSnapshot,
  getLivestockMovementSnapshot,
  getHealthActivityHistorySnapshot,
  getActivitySummarySnapshot,
  getImportantObservationsSnapshot
} from './livestockIntelligenceEngine';

// ============================================================================
// 1. LIVESTOCK TYPE & SPECIES NORMALIZATION
// ============================================================================

export interface SpeciesNormalization {
  key: string;
  swahiliLabel: string;
  aliases: string[];
}

export const KNOWN_LIVESTOCK_SPECIES: SpeciesNormalization[] = [
  {
    key: 'chicken',
    swahiliLabel: 'Kuku',
    aliases: ['kuku', 'poultry', 'broiler', 'broilers', 'layer', 'layers', 'sasso', 'kienyeji', 'tetea', 'jogoo', 'vifaranga', 'kuroiler']
  },
  {
    key: 'cattle',
    swahiliLabel: "Ng'ombe",
    aliases: ["ng'ombe", 'ngombe', 'cattle', 'cow', 'cows', 'dairy', 'beef', 'friesian', 'ayrshire', 'boran', 'sahiwal', 'dume', 'ndama']
  },
  {
    key: 'goat',
    swahiliLabel: 'Mbuzi',
    aliases: ['mbuzi', 'goat', 'goats', 'boer', 'beberu', 'buzi']
  },
  {
    key: 'sheep',
    swahiliLabel: 'Kondoo',
    aliases: ['kondoo', 'sheep', 'kondoo wa sufu', 'kondoo wa nyama']
  },
  {
    key: 'pig',
    swahiliLabel: 'Nguruwe',
    aliases: ['nguruwe', 'pig', 'pigs', 'swine', 'kitimoto', 'nguluwe']
  },
  {
    key: 'rabbit',
    swahiliLabel: 'Sungura',
    aliases: ['sungura', 'rabbit', 'rabbits']
  },
  {
    key: 'fish',
    swahiliLabel: 'Samaki',
    aliases: ['samaki', 'fish', 'tilapia', 'kambale', 'sato']
  },
  {
    key: 'duck',
    swahiliLabel: 'Bata',
    aliases: ['bata', 'duck', 'ducks', 'bata bukini']
  },
  {
    key: 'bee',
    swahiliLabel: 'Nyuki',
    aliases: ['nyuki', 'bee', 'bees', 'beekeeping']
  }
];

export function extractLivestockSpecies(text: string): { key: string; label: string } | null {
  const lower = (text || '').toLowerCase();
  for (const species of KNOWN_LIVESTOCK_SPECIES) {
    for (const alias of species.aliases) {
      // Word boundary or matching substring
      const regex = new RegExp(`\\b${alias}\\b`, 'i');
      if (regex.test(lower)) {
        return { key: species.key, label: species.swahiliLabel };
      }
    }
  }
  return null;
}

export function matchRecordToSpecies(record: LivestockRecord, speciesKey: string | null): boolean {
  if (!speciesKey) return true;
  const spec = KNOWN_LIVESTOCK_SPECIES.find((s) => s.key === speciesKey);
  if (!spec) return true;

  const typeLower = (record.livestockType || '').toLowerCase();
  const catLower = (record.livestockCategory || '').toLowerCase();
  const nameLower = (record.recordName || '').toLowerCase();

  return spec.aliases.some((alias) =>
    typeLower.includes(alias) || catLower.includes(alias) || nameLower.includes(alias)
  );
}

// ============================================================================
// 2. TIME PERIOD PARSER
// ============================================================================

export interface ParsedTimePeriod {
  labelSwahili: string;
  canonicalWindow: TrendTimeWindow | 'all-time' | 'custom';
  startDate: string | null;
  endDate: string | null;
  isSpecific: boolean;
}

export function parseNaturalTimePeriod(text: string, referenceDate?: string): ParsedTimePeriod {
  const lower = (text || '').toLowerCase();
  const todayYmd = normalizeDateToYMD(referenceDate) || new Date().toISOString().split('T')[0];

  // 1. Leo / Jana
  if (/\b(leo|today)\b/.test(lower)) {
    return {
      labelSwahili: 'Leo',
      canonicalWindow: 'custom',
      startDate: todayYmd,
      endDate: todayYmd,
      isSpecific: true
    };
  }
  if (/\b(jana|yesterday)\b/.test(lower)) {
    const yesterday = new Date(todayYmd);
    yesterday.setDate(yesterday.getDate() - 1);
    const yYmd = yesterday.toISOString().split('T')[0];
    return {
      labelSwahili: 'Jana',
      canonicalWindow: 'custom',
      startDate: yYmd,
      endDate: yYmd,
      isSpecific: true
    };
  }

  // 2. Wiki hii / Wiki iliyopita / Siku 7
  if (/\b(wiki hii|this week)\b/.test(lower)) {
    const d = new Date(todayYmd);
    const day = d.getDay() || 7; // Monday = 1
    d.setDate(d.getDate() - day + 1);
    const startYmd = d.toISOString().split('T')[0];
    return {
      labelSwahili: 'Wiki hii',
      canonicalWindow: 'custom',
      startDate: startYmd,
      endDate: todayYmd,
      isSpecific: true
    };
  }
  if (/\b(wiki iliyopita|wiki ilopita|wiki 1 iliyopita|last week)\b/.test(lower)) {
    const d = new Date(todayYmd);
    d.setDate(d.getDate() - 7);
    const startYmd = d.toISOString().split('T')[0];
    return {
      labelSwahili: 'Wiki iliyopita',
      canonicalWindow: '7d',
      startDate: startYmd,
      endDate: todayYmd,
      isSpecific: true
    };
  }
  if (/\b(siku 7|siku saba|last 7 days)\b/.test(lower)) {
    const d = new Date(todayYmd);
    d.setDate(d.getDate() - 7);
    return {
      labelSwahili: 'Siku 7 zilizopita',
      canonicalWindow: '7d',
      startDate: d.toISOString().split('T')[0],
      endDate: todayYmd,
      isSpecific: true
    };
  }

  // 3. Mwezi huu / Mwezi uliopita / Siku 30
  if (/\b(mwezi huu|this month)\b/.test(lower)) {
    const startYmd = `${todayYmd.slice(0, 7)}-01`;
    return {
      labelSwahili: 'Mwezi huu',
      canonicalWindow: 'custom',
      startDate: startYmd,
      endDate: todayYmd,
      isSpecific: true
    };
  }
  if (/\b(mwezi uliopita|mwezi uliopita|mwezi 1 uliopita|last month)\b/.test(lower)) {
    const d = new Date(todayYmd);
    d.setDate(d.getDate() - 30);
    return {
      labelSwahili: 'Mwezi uliopita',
      canonicalWindow: '30d',
      startDate: d.toISOString().split('T')[0],
      endDate: todayYmd,
      isSpecific: true
    };
  }
  if (/\b(siku 30|last 30 days)\b/.test(lower)) {
    const d = new Date(todayYmd);
    d.setDate(d.getDate() - 30);
    return {
      labelSwahili: 'Siku 30 zilizopita',
      canonicalWindow: '30d',
      startDate: d.toISOString().split('T')[0],
      endDate: todayYmd,
      isSpecific: true
    };
  }

  // 4. Miezi 3 iliyopita / 90 days
  if (/\b(miezi 3|miezi mitatu|siku 90|last 90 days|3 months)\b/.test(lower)) {
    const d = new Date(todayYmd);
    d.setDate(d.getDate() - 90);
    return {
      labelSwahili: 'Miezi 3 iliyopita',
      canonicalWindow: '90d',
      startDate: d.toISOString().split('T')[0],
      endDate: todayYmd,
      isSpecific: true
    };
  }

  // 5. Miezi 6 iliyopita / 180 days
  if (/\b(miezi 6|miezi sita|siku 180|6 months)\b/.test(lower)) {
    const d = new Date(todayYmd);
    d.setDate(d.getDate() - 180);
    return {
      labelSwahili: 'Miezi 6 iliyopita',
      canonicalWindow: 'custom',
      startDate: d.toISOString().split('T')[0],
      endDate: todayYmd,
      isSpecific: true
    };
  }

  // 6. Mwaka huu / Mwaka jana / 1 year
  if (/\b(mwaka huu|this year)\b/.test(lower)) {
    const startYmd = `${todayYmd.slice(0, 4)}-01-01`;
    return {
      labelSwahili: 'Mwaka huu',
      canonicalWindow: 'custom',
      startDate: startYmd,
      endDate: todayYmd,
      isSpecific: true
    };
  }
  if (/\b(mwaka jana|mwaka uliopita|last year|mwaka 1 iliyopita)\b/.test(lower)) {
    const d = new Date(todayYmd);
    d.setDate(d.getDate() - 365);
    return {
      labelSwahili: 'Mwaka uliopita',
      canonicalWindow: '12m',
      startDate: d.toISOString().split('T')[0],
      endDate: todayYmd,
      isSpecific: true
    };
  }

  // 7. All-time explicit words
  if (/\b(nimewahi|tangu nianze|yote|historia yote|kila mara|ever|all time)\b/.test(lower)) {
    return {
      labelSwahili: 'Kipindi chote cha kumbukumbu',
      canonicalWindow: 'all-time',
      startDate: null,
      endDate: todayYmd,
      isSpecific: true
    };
  }

  // Default: if asking "ya mwisho" or count without time constraint, consider all-time
  return {
    labelSwahili: 'Kipindi chote cha kumbukumbu',
    canonicalWindow: 'all-time',
    startDate: null,
    endDate: todayYmd,
    isSpecific: false
  };
}

// ============================================================================
// 3. INTENT CLASSIFIER & MULTI-TURN RESOLVER
// ============================================================================

export function classifyHistoryQuestionIntent(
  question: string,
  conversationHistory: Array<{ role: string; text?: string; content?: string }> = [],
  availableRecords: LivestockRecord[] = []
): ParsedHistoryQuestionIntent {
  const q = (question || '').trim();
  const lower = q.toLowerCase();

  // 1. Check for Unsupported Medical / Diagnostic Inquiries (V1.4G Section 25 & 26)
  const isMedicalWhy =
    /\b(kwa nini|kwanini|sababu ya|chanzo cha|nini kiliua|nini kimesababisha)\b/i.test(lower) &&
    /\b(walikufa|kufa|vifo|kifo|ugonjwa|kuugua)\b/i.test(lower);
  const isMedicalPrescription =
    /\b(dawa gani inafaa|dawa gani nitumie|niwape dawa gani|dozi gani|je dawa hii ni sahihi|je treatment ilikuwa sahihi|matibabu yalikuwa sahihi)\b/i.test(lower);

  if (isMedicalWhy || isMedicalPrescription) {
    const spec = extractLivestockSpecies(lower);
    const parsedTime = parseNaturalTimePeriod(lower);
    return {
      isHistoryQuestion: true,
      intent: 'UNSUPPORTED_MEDICAL',
      confidence: 'HIGH',
      category: 'unsupported',
      livestockType: spec ? spec.key : null,
      rawLivestockKeyword: spec ? spec.label : null,
      timePeriodLabel: parsedTime.labelSwahili,
      canonicalTimeWindow: parsedTime.canonicalWindow,
      metric: 'eventCount',
      latestOrExtremum: null,
      isFollowUp: false,
      isAmbiguous: false,
      isUnsupportedMedical: true,
      unsupportedMedicalReason: isMedicalWhy
        ? 'AI haitambui chanzo cha kifo cha mnyama bila uchunguzi wa daktari wa mifugo.'
        : 'AI haitoi tathmini ya usahihi wa kitabibu wa dawa au maagizo ya dozi.'
    };
  }

  // 2. Check for Follow-Up Questions referencing earlier turns (V1.4G Section 31 & 32)
  let isFollowUp = false;
  let inheritedCategory: HistoryCategory | null = null;
  let inheritedLivestockType: string | null = null;
  let inheritedTimeWindow: TrendTimeWindow | 'all-time' | 'custom' | null = null;
  let inheritedDimension: string | undefined = undefined;

  const isShortFollowUp =
    /^(na\s+|vipi\s+kuhusu\s+|kwa\s+|je\s+kwa\s+|hizo\s+|ya\s+mwisho\s+|lini\s+)/i.test(lower) ||
    lower.length < 35;

  if (isShortFollowUp && conversationHistory && conversationHistory.length > 0) {
    // Scan backwards through previous conversation turns
    for (let i = conversationHistory.length - 1; i >= 0; i--) {
      const msg = conversationHistory[i];
      const prevText = (msg.text || msg.content || '').toLowerCase();
      if (!prevText) continue;

      if (!inheritedCategory) {
        if (/\b(chanjo|vaccin)/.test(prevText)) inheritedCategory = 'vaccination';
        else if (/\b(treatment|matibabu|dawa|kutibu)/.test(prevText)) inheritedCategory = 'treatment';
        else if (/\b(ongeza|kununua|zaliwa)/.test(prevText)) inheritedCategory = 'addition';
        else if (/\b(punguz|kuuz|chinj)/.test(prevText)) inheritedCategory = 'reduction';
        else if (/\b(vifo|kifo|kufa)/.test(prevText)) inheritedCategory = 'mortality';
        else if (/\b(shughuli|activity|matukio)/.test(prevText)) inheritedCategory = 'activity';
        else if (/\b(observation|tathmini|mambo muhimu)/.test(prevText)) inheritedCategory = 'observation';
      }

      if (!inheritedLivestockType) {
        const prevSpec = extractLivestockSpecies(prevText);
        if (prevSpec) inheritedLivestockType = prevSpec.key;
      }

      if (inheritedCategory) {
        isFollowUp = true;
        inheritedDimension = `Kutoka mazungumzo yaliyotangulia (${inheritedCategory})`;
        break;
      }
    }
  }

  // 3. Extract Species in current question
  const currentSpecies = extractLivestockSpecies(lower);
  const effectiveSpecies = currentSpecies ? currentSpecies.key : (isFollowUp ? inheritedLivestockType : null);

  // 4. Extract Time Window
  const parsedTime = parseNaturalTimePeriod(lower);
  const effectiveTimeWindow = parsedTime.isSpecific
    ? parsedTime.canonicalWindow
    : (isFollowUp && inheritedTimeWindow ? inheritedTimeWindow : parsedTime.canonicalWindow);

  // 5. Category Detection
  let detectedCategory: HistoryCategory | null = null;
  if (/\b(chanjo|vaccin|kuchanja|walichanjwa|nimechanja)\b/i.test(lower)) {
    detectedCategory = 'vaccination';
  } else if (/\b(treatment|matibabu|dawa|nilitibu|nimetibu|walitibiwa|kutibu|kutibiwa)\b/i.test(lower)) {
    detectedCategory = 'treatment';
  } else if (/\b(kuongeza|nimeongeza|niliyongeza|kununua|nimenunua|kuzaliwa|waliozaliwa|kuingiza|ongezeko|aliongezeka)\b/i.test(lower)) {
    detectedCategory = 'addition';
  } else if (/\b(kupunguza|nimepunguza|kuuza|nimeuza|kuchinja|walipungua|punguzo|mauzo)\b/i.test(lower)) {
    detectedCategory = 'reduction';
  } else if (/\b(vifo|kifo|kufa|walikufa|nimepoteza|waliokufa|mortality|vifo vingapi)\b/i.test(lower)) {
    detectedCategory = 'mortality';
  } else if (/\b(shughuli|matukio|activity|activities|nini kimetokea|nini kilitokea|shughuli gani)\b/i.test(lower)) {
    detectedCategory = 'activity';
  } else if (/\b(observation|tathmini|mambo muhimu|jambo gani la muhimu|nini kilibadilika|mabadiliko gani)\b/i.test(lower)) {
    detectedCategory = 'observation';
  }

  // Fallback to inherited category if this is a follow-up
  const effectiveCategory: HistoryCategory = detectedCategory || inheritedCategory || 'all';

  // 6. Latest / Extremum Detection
  const isLatest = /\b(ya mwisho|wa mwisho|mwisho kabisa|mara ya mwisho|lini|tarehe gani)\b/i.test(lower);
  const isFirst = /\b(ya kwanza|wa kwanza|mwanzo kabisa|mara ya kwanza)\b/i.test(lower);
  const isMost = /\b(zaidi|nyingi zaidi|wengi zaidi|kilele|highest|most)\b/i.test(lower);
  const isLeast = /\b(chache zaidi|kidogo zaidi|lowest|least)\b/i.test(lower);

  const extremum: 'latest' | 'first' | 'most' | 'least' | null = isLatest
    ? 'latest'
    : (isFirst ? 'first' : (isMost ? 'most' : (isLeast ? 'least' : null)));

  // 7. Metric Detection (Event Count vs Animal Quantity)
  let metric: HistoryMetric = 'eventCount';
  if (/\b(wangapi|mifugo mingapi|kuku wangapi|idadi ya wanyama|wanyama wangapi|ng'ombe wangapi|mbuzi wangapi|nguruwe wangapi|kiasi gani cha mifugo|kiasi gani cha wanyama)\b/i.test(lower)) {
    metric = 'affectedAnimalQuantity';
  } else if (isLatest && /\b(lini|tarehe)\b/i.test(lower)) {
    metric = 'latestEventDate';
  } else if (isMost || isLeast) {
    metric = 'mostFrequentEventCategory';
  } else if (/\b(mabadiliko|mwelekeo|ongezeka au kupungua|trend|kupanda au kushuka)\b/i.test(lower)) {
    metric = 'netChange';
  } else if (/\b(observation|mambo muhimu|kwa nini)\b/i.test(lower)) {
    metric = 'observationExplanation';
  } else if (/\b(mifugo gani|aina gani ya mifugo|spishi gani)\b/i.test(lower)) {
    metric = 'breakdown';
  }

  // 8. Determine if this is actually a History Question (avoiding false positives on general chat)
  const hasExplicitHistoryKeyword =
    /\b(nimewahi|tangu nianze|rekodi|historia|daftari|matukio|nimefanya|niliyo|niliwahi|zilizopita|iliyopita|jana|mwezi huu|mwezi uliopita|wiki hii|wiki iliyopita|miezi 3|miezi 6|mwaka huu|mwaka jana|siku 7|siku 30|mara ngapi|wangapi|ya mwisho|lini|kilibadilika|mabadiliko|shughuli|vifo|chanjo|treatment|matibabu)\b/i.test(lower);

  const hasEventCategory = detectedCategory !== null;
  const isHistoryQuestion = isFollowUp || hasEventCategory || hasExplicitHistoryKeyword;

  if (!isHistoryQuestion) {
    return {
      isHistoryQuestion: false,
      intent: 'NO_HISTORY_DATA',
      confidence: 'LOW',
      category: 'all',
      livestockType: null,
      rawLivestockKeyword: null,
      timePeriodLabel: parsedTime.labelSwahili,
      canonicalTimeWindow: 'all-time',
      metric: 'eventCount',
      latestOrExtremum: null,
      isFollowUp: false,
      isAmbiguous: false,
      isUnsupportedMedical: false
    };
  }

  // 9. Intent Mapping
  let intent: HistoryQuestionIntent = 'HISTORY_COUNT';
  let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM';

  if (metric === 'observationExplanation' || (effectiveCategory === 'observation' && !isLatest)) {
    intent = 'HISTORY_INSIGHT';
    confidence = 'HIGH';
  } else if (isLatest) {
    intent = 'HISTORY_LATEST';
    confidence = 'HIGH';
  } else if (metric === 'breakdown' || /\b(mifugo gani|aina gani za mifugo)\b/i.test(lower)) {
    intent = 'HISTORY_BY_TYPE';
    confidence = 'HIGH';
  } else if (metric === 'netChange' || /\b(mwelekeo|ongezeka au kupungua)\b/i.test(lower)) {
    intent = 'HISTORY_TREND';
    confidence = 'HIGH';
  } else if (effectiveCategory === 'mortality') {
    intent = 'HISTORY_MORTALITY';
    confidence = 'HIGH';
  } else if (effectiveCategory === 'vaccination') {
    intent = 'HISTORY_VACCINATION';
    confidence = 'HIGH';
  } else if (effectiveCategory === 'treatment') {
    intent = 'HISTORY_TREATMENT';
    confidence = 'HIGH';
  } else if (effectiveCategory === 'activity') {
    intent = 'HISTORY_ACTIVITY';
    confidence = 'HIGH';
  } else if (parsedTime.isSpecific) {
    intent = 'HISTORY_BY_PERIOD';
    confidence = 'HIGH';
  } else {
    intent = 'HISTORY_COUNT';
    confidence = 'MEDIUM';
  }

  // 10. Ambiguity Check (V1.4G Section 24)
  // E.g. "ya lini?" or "ziko ngapi?" with no category and no prior conversation context
  const isAmbiguousQuery =
    !isFollowUp &&
    effectiveCategory === 'all' &&
    !currentSpecies &&
    (lower === 'ya mwisho ilikuwa lini?' ||
      lower === 'lini?' ||
      lower === 'nimefanya mara ngapi?' ||
      lower === 'ziko ngapi?' ||
      lower === 'ilikuwa lini?');

  if (isAmbiguousQuery) {
    return {
      isHistoryQuestion: true,
      intent: 'AMBIGUOUS_HISTORY',
      confidence: 'LOW',
      category: 'all',
      livestockType: null,
      rawLivestockKeyword: null,
      timePeriodLabel: parsedTime.labelSwahili,
      canonicalTimeWindow: parsedTime.canonicalWindow,
      metric,
      latestOrExtremum: extremum,
      isFollowUp: false,
      isAmbiguous: true,
      clarificationPromptSwahili:
        'Tafadhali fafanua: Ungependa kujua historia ya tukio gani (kama vile chanjo, matibabu, kuongeza/kupunguza mifugo, au vifo) na kwa aina gani ya mifugo?',
      isUnsupportedMedical: false
    };
  }

  return {
    isHistoryQuestion: true,
    intent,
    confidence,
    category: effectiveCategory,
    livestockType: effectiveSpecies,
    rawLivestockKeyword: currentSpecies ? currentSpecies.label : null,
    timePeriodLabel: parsedTime.labelSwahili,
    canonicalTimeWindow: effectiveTimeWindow,
    customStartDate: parsedTime.startDate,
    customEndDate: parsedTime.endDate,
    metric,
    latestOrExtremum: extremum,
    isFollowUp,
    inheritedDimension,
    isAmbiguous: false,
    isUnsupportedMedical: false
  };
}

// ============================================================================
// 4. STRUCTURED HISTORICAL RETRIEVAL METHODS (V1.4G Section 28)
// ============================================================================

export interface HistoricalQueryCriteria {
  category?: HistoryCategory;
  livestockType?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  canonicalWindow?: TrendTimeWindow | 'all-time' | 'custom';
  metric?: HistoryMetric;
}

/**
 * Filter and collect authoritative events matching criteria.
 * Sorted deterministically: eventDate DESC, createdAt DESC.
 */
export function getFilteredAuthoritativeEvents(
  records: LivestockRecord[],
  recordEventsMap: Record<string, LivestockEvent[]>,
  criteria: HistoricalQueryCriteria
): { events: HistorySupportingEvent[]; targetRecords: LivestockRecord[] } {
  const matchingRecords = records.filter((r) => matchRecordToSpecies(r, criteria.livestockType || null));
  const recordMap = new Map<string, LivestockRecord>();
  matchingRecords.forEach((r) => recordMap.set(r.recordId, r));

  const collected: HistorySupportingEvent[] = [];

  for (const rec of matchingRecords) {
    const evts = recordEventsMap[rec.recordId] || [];
    for (const raw of evts) {
      const normDate = normalizeDateToYMD(raw.eventDate);
      if (!normDate) continue;

      // Date range filtering
      if (criteria.startDate && normDate < criteria.startDate) continue;
      if (criteria.endDate && normDate > criteria.endDate) continue;

      const canonicalType = normalizeCanonicalEventType(raw.eventType);

      // Category matching
      if (criteria.category && criteria.category !== 'all') {
        if (criteria.category === 'vaccination' && canonicalType !== 'vaccination') continue;
        if (criteria.category === 'treatment' && canonicalType !== 'treatment') continue;
        if (criteria.category === 'mortality' && canonicalType !== 'death' && canonicalType !== 'mortality') continue;
        if (criteria.category === 'addition' && canonicalType !== 'addition' && canonicalType !== 'birth' && canonicalType !== 'purchase') continue;
        if (criteria.category === 'reduction' && canonicalType !== 'sale' && canonicalType !== 'death' && canonicalType !== 'mortality') continue;
      }

      // Quantity normalization
      const qtyNum = typeof raw.quantity === 'number' && raw.quantity > 0 ? raw.quantity : null;

      // Extract medicine name from notes / title if available
      let medName: string | undefined = undefined;
      const combinedText = `${raw.title || ''} ${raw.notes || ''}`;
      const medMatch = combinedText.match(/(?:dawa|medicine|vaccine|chanjo|antibiotic|kutumia)\s*[:=\-]?\s*([a-zA-Z0-9\s%\-]+)(?:[,\.\n]|$)/i);
      if (medMatch && medMatch[1]) {
        medName = medMatch[1].trim().slice(0, 40);
      }

      collected.push({
        eventId: raw.eventId,
        recordId: rec.recordId,
        recordName: rec.recordName || `${rec.livestockCategory} (${rec.livestockType})`,
        livestockType: rec.livestockType,
        livestockCategory: rec.livestockCategory,
        eventType: canonicalType,
        eventDate: normDate,
        quantity: qtyNum,
        hasRecordedQuantity: qtyNum !== null,
        title: raw.title || '',
        notes: raw.notes || '',
        medicineName: medName,
        reason: raw.notes ? raw.notes.slice(0, 80) : undefined
      });
    }
  }

  // Deterministic sort: eventDate DESC, createdAt DESC
  collected.sort((a, b) => {
    if (b.eventDate !== a.eventDate) {
      return b.eventDate.localeCompare(a.eventDate);
    }
    return b.eventId.localeCompare(a.eventId);
  });

  return { events: collected, targetRecords: matchingRecords };
}

/**
 * 1. getHistoricalCount()
 */
export function getHistoricalCount(
  userId: string,
  records: LivestockRecord[],
  recordEventsMap: Record<string, LivestockEvent[]>,
  criteria: HistoricalQueryCriteria
): { eventCount: number; animalQuantity: number | null; hasRecordedAnimalQuantity: boolean; unrecordedQuantityEventCount: number } {
  const { events } = getFilteredAuthoritativeEvents(records, recordEventsMap, criteria);

  let totalAnimals = 0;
  let hasQuantity = false;
  let unrecordedCount = 0;

  for (const evt of events) {
    if (evt.quantity !== null && evt.quantity > 0) {
      totalAnimals += evt.quantity;
      hasQuantity = true;
    } else {
      unrecordedCount++;
    }
  }

  return {
    eventCount: events.length,
    animalQuantity: hasQuantity ? totalAnimals : null,
    hasRecordedAnimalQuantity: hasQuantity,
    unrecordedQuantityEventCount: unrecordedCount
  };
}

/**
 * 2. getLatestHistoricalEvent()
 */
export function getLatestHistoricalEvent(
  userId: string,
  records: LivestockRecord[],
  recordEventsMap: Record<string, LivestockEvent[]>,
  criteria: HistoricalQueryCriteria
): HistorySupportingEvent | null {
  const { events } = getFilteredAuthoritativeEvents(records, recordEventsMap, criteria);
  return events.length > 0 ? events[0] : null;
}

/**
 * 3. getHistoricalEventsByType()
 */
export function getHistoricalEventsByType(
  userId: string,
  records: LivestockRecord[],
  recordEventsMap: Record<string, LivestockEvent[]>,
  criteria: HistoricalQueryCriteria
): Array<{ livestockType: string; eventCount: number; animalQuantity: number | null }> {
  const { events } = getFilteredAuthoritativeEvents(records, recordEventsMap, criteria);
  const byTypeMap = new Map<string, { count: number; qty: number; hasQty: boolean }>();

  for (const evt of events) {
    const t = evt.livestockType || 'Mchanganyiko';
    const curr = byTypeMap.get(t) || { count: 0, qty: 0, hasQty: false };
    curr.count++;
    if (evt.quantity !== null && evt.quantity > 0) {
      curr.qty += evt.quantity;
      curr.hasQty = true;
    }
    byTypeMap.set(t, curr);
  }

  return Array.from(byTypeMap.entries()).map(([livestockType, val]) => ({
    livestockType,
    eventCount: val.count,
    animalQuantity: val.hasQty ? val.qty : null
  }));
}

/**
 * 4. getHistoricalEventsByPeriod()
 */
export function getHistoricalEventsByPeriod(
  userId: string,
  records: LivestockRecord[],
  recordEventsMap: Record<string, LivestockEvent[]>,
  criteria: HistoricalQueryCriteria
): HistorySupportingEvent[] {
  const { events } = getFilteredAuthoritativeEvents(records, recordEventsMap, criteria);
  return events;
}

/**
 * 5. getHistoricalTrendSnapshot() (reusing V1.4B)
 */
export function getHistoricalTrendSnapshot(
  userId: string,
  records: LivestockRecord[],
  recordEventsMap: Record<string, LivestockEvent[]>,
  options: { timeWindow?: TrendTimeWindow; customStartDate?: string; customEndDate?: string; livestockType?: string } = {}
): LivestockTrendsSnapshot {
  const targetType = options.livestockType?.toLowerCase();
  const filteredRecords = targetType
    ? records.filter((r) =>
        r.livestockType?.toLowerCase().includes(targetType) ||
        r.livestockCategory?.toLowerCase().includes(targetType)
      )
    : records;
  return getLivestockTrendsSnapshot(userId, filteredRecords, recordEventsMap, {
    timeWindow: options.timeWindow || '30d',
    customStartDate: options.customStartDate,
    customEndDate: options.customEndDate
  });
}

/**
 * 6. getHistoricalActivitySnapshot() (reusing V1.4E)
 */
export function getHistoricalActivitySnapshot(
  userId: string,
  records: LivestockRecord[],
  recordEventsMap: Record<string, LivestockEvent[]>,
  options: { timeWindow?: TrendTimeWindow; customStartDate?: string; customEndDate?: string; livestockType?: string } = {}
): ActivitySummarySnapshot {
  const targetType = options.livestockType?.toLowerCase();
  const filteredRecords = targetType
    ? records.filter((r) =>
        r.livestockType?.toLowerCase().includes(targetType) ||
        r.livestockCategory?.toLowerCase().includes(targetType)
      )
    : records;
  return getActivitySummarySnapshot(userId, filteredRecords, recordEventsMap, {
    timeWindow: options.timeWindow || '30d',
    customStartDate: options.customStartDate,
    customEndDate: options.customEndDate
  });
}

/**
 * 7. getHistoricalMortalitySnapshot() (reusing V1.4C)
 */
export function getHistoricalMortalitySnapshot(
  userId: string,
  records: LivestockRecord[],
  recordEventsMap: Record<string, LivestockEvent[]>,
  options: { timeWindow?: TrendTimeWindow; customStartDate?: string; customEndDate?: string; livestockType?: string } = {}
): LivestockMovementSnapshot {
  const targetType = options.livestockType?.toLowerCase();
  const filteredRecords = targetType
    ? records.filter((r) =>
        r.livestockType?.toLowerCase().includes(targetType) ||
        r.livestockCategory?.toLowerCase().includes(targetType)
      )
    : records;
  return getLivestockMovementSnapshot(userId, filteredRecords, recordEventsMap, {
    timeWindow: options.timeWindow || '30d',
    customStartDate: options.customStartDate,
    customEndDate: options.customEndDate
  });
}

/**
 * 8. getHistoricalVaccinationSnapshot() (reusing V1.4D)
 */
export function getHistoricalVaccinationSnapshot(
  userId: string,
  records: LivestockRecord[],
  recordEventsMap: Record<string, LivestockEvent[]>,
  options: { timeWindow?: TrendTimeWindow; customStartDate?: string; customEndDate?: string; livestockType?: string } = {}
): HealthActivityHistorySnapshot {
  return getHealthActivityHistorySnapshot(userId, records, recordEventsMap, {
    timeWindow: options.timeWindow || '30d',
    customStartDate: options.customStartDate,
    customEndDate: options.customEndDate,
    livestockType: options.livestockType
  });
}

/**
 * 9. getHistoricalTreatmentSnapshot() (reusing V1.4D)
 */
export function getHistoricalTreatmentSnapshot(
  userId: string,
  records: LivestockRecord[],
  recordEventsMap: Record<string, LivestockEvent[]>,
  options: { timeWindow?: TrendTimeWindow; customStartDate?: string; customEndDate?: string; livestockType?: string } = {}
): HealthActivityHistorySnapshot {
  return getHealthActivityHistorySnapshot(userId, records, recordEventsMap, {
    timeWindow: options.timeWindow || '30d',
    customStartDate: options.customStartDate,
    customEndDate: options.customEndDate,
    livestockType: options.livestockType
  });
}

/**
 * 10. getHistoricalObservationExplanation() (reusing V1.4F)
 */
export function getHistoricalObservationExplanation(
  userId: string,
  records: LivestockRecord[],
  recordEventsMap: Record<string, LivestockEvent[]>,
  options: { timeWindow?: TrendTimeWindow; customStartDate?: string; customEndDate?: string; livestockType?: string } = {}
): ImportantObservationsSnapshot {
  return getImportantObservationsSnapshot(userId, records, recordEventsMap, {
    timeWindow: options.timeWindow || '30d',
    customStartDate: options.customStartDate,
    customEndDate: options.customEndDate,
    livestockType: options.livestockType
  });
}

// ============================================================================
// 5. PRIMARY SERVICE INTERFACE: getHistoryQuestionResult (V1.4G Section 28)
// ============================================================================

export function getHistoryQuestionResult(
  userId: string,
  records: LivestockRecord[],
  recordEventsMap: Record<string, LivestockEvent[]>,
  question: string,
  conversationHistory: Array<{ role: string; text?: string; content?: string }> = [],
  referenceDate?: string
): HistoryQuestionResult {
  const originalQuestion = (question || '').trim();
  const parsedIntent = classifyHistoryQuestionIntent(originalQuestion, conversationHistory, records);

  // If question is not a history question, return detected: false
  if (!parsedIntent.isHistoryQuestion) {
    return {
      version: '1.4G',
      detected: false,
      intent: 'NO_HISTORY_DATA',
      parsedQuestion: {
        originalQuestion,
        category: parsedIntent.category,
        livestockType: parsedIntent.livestockType,
        timePeriod: parsedIntent.timePeriodLabel,
        metric: parsedIntent.metric
      },
      authoritativeSource: {
        recordsCount: records.length,
        totalEventsAvailable: 0,
        queriedPeriod: {
          window: parsedIntent.canonicalTimeWindow,
          startDate: null,
          endDate: null,
          labelSwahili: parsedIntent.timePeriodLabel
        },
        livestockTypeFilter: null
      },
      eventCount: 0,
      animalQuantity: null,
      hasRecordedAnimalQuantity: false,
      latestEvent: null,
      supportingEvents: [],
      supportingEventsCount: 0,
      dataSufficiency: 'SUFFICIENT',
      sufficiencyReason: 'Hili si swali la kihistoria la kumbukumbu za mifugo.',
      factualSummarySwahili: '',
      isDeterministicFact: false
    };
  }

  // If user has no records at all (V1.4G Section 22)
  if (records.length === 0) {
    return {
      version: '1.4G',
      detected: true,
      intent: 'NO_HISTORY_DATA',
      parsedQuestion: {
        originalQuestion,
        category: parsedIntent.category,
        livestockType: parsedIntent.livestockType,
        timePeriod: parsedIntent.timePeriodLabel,
        metric: parsedIntent.metric
      },
      authoritativeSource: {
        recordsCount: 0,
        totalEventsAvailable: 0,
        queriedPeriod: {
          window: parsedIntent.canonicalTimeWindow,
          startDate: null,
          endDate: null,
          labelSwahili: parsedIntent.timePeriodLabel
        },
        livestockTypeFilter: parsedIntent.livestockType
      },
      eventCount: 0,
      animalQuantity: null,
      hasRecordedAnimalQuantity: false,
      latestEvent: null,
      supportingEvents: [],
      supportingEventsCount: 0,
      dataSufficiency: 'INSUFFICIENT',
      sufficiencyReason: 'Mfugaji hajaongeza rekodi zozote za mifugo kwenye Msaidizi Wangu.',
      factualSummarySwahili:
        'Bado hujaongeza rekodi za mifugo kwenye mfumo wa Msaidizi Wangu. Ili kuweza kuuliza na kupokea majibu ya historia, tafadhali anza kwa kusajili kundi la mifugo kwenye Msaidizi Wangu.',
      isDeterministicFact: true
    };
  }

  // If question is ambiguous (V1.4G Section 24)
  if (parsedIntent.intent === 'AMBIGUOUS_HISTORY') {
    return {
      version: '1.4G',
      detected: true,
      intent: 'AMBIGUOUS_HISTORY',
      parsedQuestion: {
        originalQuestion,
        category: parsedIntent.category,
        livestockType: parsedIntent.livestockType,
        timePeriod: parsedIntent.timePeriodLabel,
        metric: parsedIntent.metric
      },
      authoritativeSource: {
        recordsCount: records.length,
        totalEventsAvailable: Object.values(recordEventsMap).reduce((acc, evs) => acc + evs.length, 0),
        queriedPeriod: {
          window: parsedIntent.canonicalTimeWindow,
          startDate: null,
          endDate: null,
          labelSwahili: parsedIntent.timePeriodLabel
        },
        livestockTypeFilter: null
      },
      eventCount: 0,
      animalQuantity: null,
      hasRecordedAnimalQuantity: false,
      latestEvent: null,
      supportingEvents: [],
      supportingEventsCount: 0,
      dataSufficiency: 'LIMITED',
      sufficiencyReason: 'Swali linahitaji ufafanuzi wa aina ya tukio au mnyama anayelengwa.',
      clarificationPromptSwahili: parsedIntent.clarificationPromptSwahili,
      factualSummarySwahili:
        parsedIntent.clarificationPromptSwahili ||
        'Tafadhali fafanua: Ungependa kufahamu historia ya tukio gani (chanjo, matibabu, kuongeza/kupunguza, au vifo)?',
      isDeterministicFact: false
    };
  }

  // Count total events available in records
  let totalEventsInRecords = 0;
  for (const r of records) {
    totalEventsInRecords += (recordEventsMap[r.recordId] || []).length;
  }

  // Prepare criteria
  const criteria: HistoricalQueryCriteria = {
    category: parsedIntent.category,
    livestockType: parsedIntent.livestockType,
    startDate: parsedIntent.customStartDate,
    endDate: parsedIntent.customEndDate,
    canonicalWindow: parsedIntent.canonicalTimeWindow,
    metric: parsedIntent.metric
  };

  // Execute Core Retrieval
  const { events: matchingEvents } = getFilteredAuthoritativeEvents(records, recordEventsMap, criteria);
  const countStats = getHistoricalCount(userId, records, recordEventsMap, criteria);
  const latestEvt = getLatestHistoricalEvent(userId, records, recordEventsMap, criteria);
  const byTypeBreakdown = getHistoricalEventsByType(userId, records, recordEventsMap, criteria);

  // Determine Data Sufficiency
  let dataSufficiency: DataSufficiencyLevel = 'SUFFICIENT';
  let sufficiencyReason = 'Kumbukumbu zinatosheleza kujibu swali kwa uhakika.';

  if (totalEventsInRecords === 0) {
    dataSufficiency = 'INSUFFICIENT';
    sufficiencyReason = 'Hakuna matukio yoyote ya mifugo yaliyorekodiwa bado.';
  } else if (matchingEvents.length === 0) {
    dataSufficiency = 'SUFFICIENT'; // Zero recorded is a valid factual answer
    sufficiencyReason = `Hakuna tukio lililorekodiwa kwa kigezo kilichoombwa (${parsedIntent.category}).`;
  } else if (countStats.unrecordedQuantityEventCount > 0 && parsedIntent.metric === 'affectedAnimalQuantity') {
    dataSufficiency = 'LIMITED';
    sufficiencyReason = `Matukio ${countStats.unrecordedQuantityEventCount} kati ya ${matchingEvents.length} hayana idadi ya wanyama iliyorekodiwa.`;
  }

  // Activity breakdown if activity query
  let activityBreakdown: Record<string, number> | undefined = undefined;
  if (parsedIntent.category === 'activity' || parsedIntent.category === 'all') {
    const actMap: Record<string, number> = {};
    for (const e of matchingEvents) {
      actMap[e.eventType] = (actMap[e.eventType] || 0) + 1;
    }
    activityBreakdown = actMap;
  }

  // Observations / Insights if insight query (V1.4F integration)
  let matchingObservations: ImportantObservation[] | undefined = undefined;
  let matchingInsights: FarmInsight[] | undefined = undefined;
  if (parsedIntent.intent === 'HISTORY_INSIGHT') {
    const obsSnapshot = getHistoricalObservationExplanation(userId, records, recordEventsMap, {
      timeWindow: parsedIntent.canonicalTimeWindow === 'all-time' || parsedIntent.canonicalTimeWindow === 'custom' ? '30d' : parsedIntent.canonicalTimeWindow,
      customStartDate: parsedIntent.customStartDate || undefined,
      customEndDate: parsedIntent.customEndDate || undefined,
      livestockType: parsedIntent.livestockType || undefined
    });
    matchingObservations = obsSnapshot.observations;
    matchingInsights = obsSnapshot.insights;
  }

  // Generate Factual Swahili Summary
  const factualSummarySwahili = buildFactualSwahiliAnswer({
    intent: parsedIntent.intent,
    category: parsedIntent.category,
    livestockType: parsedIntent.livestockType,
    rawLivestockKeyword: parsedIntent.rawLivestockKeyword,
    timePeriodLabel: parsedIntent.timePeriodLabel,
    metric: parsedIntent.metric,
    eventCount: matchingEvents.length,
    animalQuantity: countStats.animalQuantity,
    hasRecordedQuantity: countStats.hasRecordedAnimalQuantity,
    unrecordedCount: countStats.unrecordedQuantityEventCount,
    latestEvent: latestEvt,
    supportingEvents: matchingEvents,
    byLivestockType: byTypeBreakdown,
    activityBreakdown,
    matchingObservations,
    matchingInsights,
    isUnsupportedMedical: parsedIntent.isUnsupportedMedical,
    unsupportedReason: parsedIntent.unsupportedMedicalReason
  });

  // Quantity disclaimer if animal count is partially missing (V1.4G Section 23)
  let quantityDisclaimerSwahili: string | undefined = undefined;
  if (countStats.unrecordedQuantityEventCount > 0 && countStats.hasRecordedAnimalQuantity) {
    quantityDisclaimerSwahili = `Kumbuka: Matukio ${countStats.unrecordedQuantityEventCount} kati ya ${matchingEvents.length} hayakurekodi idadi ya wanyama, hivyo jumla halisi ya wanyama inaweza kuwa kubwa zaidi.`;
  }

  // Safety notice for medical or mortality questions
  let safetyNoticeSwahili: string | undefined = undefined;
  if (parsedIntent.category === 'mortality' || parsedIntent.category === 'treatment' || parsedIntent.isUnsupportedMedical) {
    safetyNoticeSwahili = 'Taarifa hizi zinatokana na kumbukumbu zako za matukio na siyo utambuzi wa kitabibu au maelekezo ya dawa.';
  }

  return {
    version: '1.4G',
    detected: true,
    intent: parsedIntent.intent,
    parsedQuestion: {
      originalQuestion,
      category: parsedIntent.category,
      livestockType: parsedIntent.livestockType,
      timePeriod: parsedIntent.timePeriodLabel,
      metric: parsedIntent.metric
    },
    authoritativeSource: {
      recordsCount: records.length,
      totalEventsAvailable: totalEventsInRecords,
      queriedPeriod: {
        window: parsedIntent.canonicalTimeWindow,
        startDate: parsedIntent.customStartDate || null,
        endDate: parsedIntent.customEndDate || null,
        labelSwahili: parsedIntent.timePeriodLabel
      },
      livestockTypeFilter: parsedIntent.livestockType
    },
    eventCount: matchingEvents.length,
    animalQuantity: countStats.animalQuantity,
    hasRecordedAnimalQuantity: countStats.hasRecordedAnimalQuantity,
    quantityDisclaimerSwahili,
    latestEvent: latestEvt,
    supportingEvents: matchingEvents.slice(0, 10), // Limit supporting events payload
    supportingEventsCount: matchingEvents.length,
    byLivestockType: byTypeBreakdown,
    activityBreakdown,
    matchingObservations,
    matchingInsights,
    dataSufficiency,
    sufficiencyReason,
    factualSummarySwahili,
    safetyNoticeSwahili,
    isDeterministicFact: true
  };
}

// ============================================================================
// 6. DETERMINISTIC FACTUAL SWAHILI EXPLAINER (V1.4G Section 4, 7, 21, 30)
// ============================================================================

interface ExplainerParams {
  intent: HistoryQuestionIntent;
  category: HistoryCategory;
  livestockType: string | null;
  rawLivestockKeyword?: string | null;
  timePeriodLabel: string;
  metric: HistoryMetric;
  eventCount: number;
  animalQuantity: number | null;
  hasRecordedQuantity: boolean;
  unrecordedCount: number;
  latestEvent: HistorySupportingEvent | null;
  supportingEvents: HistorySupportingEvent[];
  byLivestockType: Array<{ livestockType: string; eventCount: number; animalQuantity: number | null }>;
  activityBreakdown?: Record<string, number>;
  matchingObservations?: ImportantObservation[];
  matchingInsights?: FarmInsight[];
  isUnsupportedMedical?: boolean;
  unsupportedReason?: string;
}

export function buildFactualSwahiliAnswer(p: ExplainerParams): string {
  const targetName = p.rawLivestockKeyword || (p.livestockType ? getLivestockDisplayName(p.livestockType) : 'mifugo yote');
  const periodText = p.timePeriodLabel || 'katika historia yako';

  // 1. Unsupported Medical Inquiry
  if (p.isUnsupportedMedical) {
    let text = `Kulingana na kumbukumbu zako za ${targetName} (${periodText}):\n`;
    if (p.eventCount > 0) {
      text += `- Kuna matukio ${p.eventCount} yaliyorekodiwa kwenye daftari lako`;
      if (p.animalQuantity !== null) {
        text += ` yakihusisha jumla ya wanyama ${p.animalQuantity}`;
      }
      text += `.\n`;
    } else {
      text += `- Hakuna matukio yaliyorekodiwa katika kipindi hiki.\n`;
    }
    text += `\n⚠️ **Ujumbe wa Usalama wa Kitaalamu:** ${p.unsupportedReason || 'AI haiwezi kutoa utambuzi wa kitabibu au maagizo ya dawa kwa kutumia historia ya kumbukumbu.'}\nKwa uchunguzi sahihi wa ugonjwa au chanzo cha vifo, tafadhali shirikiana na Daktari wa Mifugo au Afisa Ugani aliyesajiliwa.`;
    return text;
  }

  // 2. Zero events recorded in this category/period (V1.4G Section 22)
  if (p.eventCount === 0) {
    const catLabels: Record<string, string> = {
      vaccination: 'chanjo',
      treatment: 'matibabu',
      addition: 'kuongeza mifugo',
      reduction: 'kupunguza mifugo',
      mortality: 'vifo',
      activity: 'shughuli',
      all: 'matukio'
    };
    const catName = catLabels[p.category] || 'matukio';
    return `Kulingana na kumbukumbu zako za Msaidizi Wangu, hakuna tukio la **${catName}** lililorekodiwa kwa **${targetName}** katika **${periodText}**.\n\n*(Kumbuka: Kutokuwepo kwa kumbukumbu hapa kunaonyesha kuwa hakuna tukio lililoandikwa kwenye daftari lako katika kipindi hicho).*`;
  }

  // 3. Latest Event Query (V1.4G Section 12)
  if (p.intent === 'HISTORY_LATEST' && p.latestEvent) {
    const e = p.latestEvent;
    const catLabels: Record<string, string> = {
      vaccination: 'Chanjo',
      treatment: 'Matibabu',
      birth: 'Kuzaliwa',
      purchase: 'Kununuliwa',
      addition: 'Kuongezwa',
      death: 'Kifo/Vifo',
      mortality: 'Vifo',
      sale: 'Mauzo',
      other: 'Tukio'
    };
    const actionName = catLabels[e.eventType] || 'Tukio';
    let text = `Tukio lako la mwisho la **${actionName}** kwa **${targetName}** liliandikwa tarehe **${formatDateDisplay(e.eventDate)}**.\n\n**Maelezo ya Kumbukumbu:**\n`;
    text += `- **Kundi:** ${e.recordName}\n`;
    text += `- **Aina ya Tukio:** ${actionName}\n`;
    if (e.quantity !== null && e.quantity > 0) {
      text += `- **Idadi ya Wanyama Waliohusika:** ${e.quantity}\n`;
    }
    if (e.medicineName) {
      text += `- **Dawa/Chanjo:** ${e.medicineName}\n`;
    }
    if (e.title && e.title !== actionName) {
      text += `- **Kichwa:** ${e.title}\n`;
    }
    if (e.notes) {
      text += `- **Maelezo:** ${e.notes}\n`;
    }
    return text;
  }

  // 4. Vaccination History (V1.4G Section 14)
  if (p.category === 'vaccination') {
    let text = `Kulingana na kumbukumbu zako za Msaidizi Wangu, umeandika **matukio ${p.eventCount} ya chanjo** kwa **${targetName}** katika **${periodText}**.\n\n`;

    if (p.hasRecordedQuantity && p.animalQuantity !== null) {
      text += `- **Jumla ya Wanyama Waliochanjwa (Iliyorekodiwa):** ${p.animalQuantity}\n`;
      if (p.unrecordedCount > 0) {
        text += `- *(Kumbuka: Matukio ${p.unrecordedCount} hayakuwa na idadi ya wanyama iliyojazwa)*\n`;
      }
    } else {
      text += `- *(Idadi maalum ya wanyama haikurekodiwa kwenye matukio haya ya chanjo)*\n`;
    }

    if (p.latestEvent) {
      text += `- **Chanjo ya Mwisho:** Tarehe ${formatDateDisplay(p.latestEvent.eventDate)}`;
      if (p.latestEvent.medicineName) text += ` (${p.latestEvent.medicineName})`;
      text += `\n`;
    }

    if (p.byLivestockType.length > 1) {
      text += `\n**Mgawanyo kwa Makundi:**\n`;
      for (const item of p.byLivestockType) {
        text += `- ${item.livestockType}: matukio ${item.eventCount}`;
        if (item.animalQuantity !== null) text += ` (${item.animalQuantity} waliochanjwa)`;
        text += `\n`;
      }
    }

    return text;
  }

  // 5. Treatment History (V1.4G Section 15)
  if (p.category === 'treatment') {
    let text = `Kulingana na kumbukumbu zako, umeandika **matukio ${p.eventCount} ya matibabu** kwa **${targetName}** katika **${periodText}**.\n\n`;

    if (p.hasRecordedQuantity && p.animalQuantity !== null) {
      text += `- **Wanyama Waliohusishwa na Matibabu:** ${p.animalQuantity}\n`;
      if (p.unrecordedCount > 0) {
        text += `- *(Matukio ${p.unrecordedCount} hayakujumuisha idadi ya wanyama)*\n`;
      }
    }

    if (p.latestEvent) {
      text += `- **Matibabu ya Mwisho:** Tarehe ${formatDateDisplay(p.latestEvent.eventDate)}`;
      if (p.latestEvent.medicineName) text += ` (Dawa: ${p.latestEvent.medicineName})`;
      text += `\n`;
    }

    if (p.byLivestockType.length > 1) {
      text += `\n**Mgawanyo kwa Aina ya Mifugo:**\n`;
      for (const item of p.byLivestockType) {
        text += `- ${item.livestockType}: matukio ${item.eventCount}`;
        if (item.animalQuantity !== null) text += ` (wanyama ${item.animalQuantity})`;
        text += `\n`;
      }
    }

    return text;
  }

  // 6. Mortality History (V1.4G Section 16)
  if (p.category === 'mortality') {
    let text = `Katika **${periodText}**, kumbukumbu zako zinaonyesha **matukio ${p.eventCount} ya vifo** kwa **${targetName}**.\n\n`;

    if (p.hasRecordedQuantity && p.animalQuantity !== null) {
      text += `- **Jumla ya Vifo Vilivyoripotiwa:** ${p.animalQuantity} ${targetName}\n`;
    } else {
      text += `- **Matukio:** Matukio ${p.eventCount} ya vifo yamerekodiwa bila idadi kamili ya wanyama.\n`;
    }

    if (p.latestEvent) {
      text += `- **Tukio la Mwisho la Kifo:** Tarehe ${formatDateDisplay(p.latestEvent.eventDate)}`;
      if (p.latestEvent.quantity) text += ` (${p.latestEvent.quantity} walikufa)`;
      text += `\n`;
    }

    text += `\n*(Kikumbusho: Taarifa hizi zinategemea kumbukumbu ulizoweka na haziwezi kutumiwa kubaini chanzo cha ugonjwa au utambuzi wa kitabibu bila daktari wa mifugo).*`;
    return text;
  }

  // 7. Addition History (V1.4G Section 17)
  if (p.category === 'addition') {
    let text = `Katika **${periodText}**, umeandika **matukio ${p.eventCount} ya kuongeza mifugo** (${targetName}).\n\n`;
    if (p.hasRecordedQuantity && p.animalQuantity !== null) {
      text += `- **Jumla ya Mifugo Iliyoongezwa:** ${p.animalQuantity}\n`;
    }
    if (p.latestEvent) {
      text += `- **Ongezeko la Mwisho:** Tarehe ${formatDateDisplay(p.latestEvent.eventDate)}`;
      if (p.latestEvent.quantity) text += ` (${p.latestEvent.quantity} waliongezwa kupitia ${p.latestEvent.eventType})`;
      text += `\n`;
    }
    return text;
  }

  // 8. Reduction History (V1.4G Section 17)
  if (p.category === 'reduction') {
    let text = `Katika **${periodText}**, umeandika **matukio ${p.eventCount} ya kupunguza mifugo** (${targetName}).\n\n`;
    if (p.hasRecordedQuantity && p.animalQuantity !== null) {
      text += `- **Jumla ya Mifugo Iliyopungua:** ${p.animalQuantity}\n`;
    }
    if (p.latestEvent) {
      text += `- **Punguzo la Mwisho:** Tarehe ${formatDateDisplay(p.latestEvent.eventDate)}`;
      if (p.latestEvent.quantity) text += ` (${p.latestEvent.quantity} kupitia ${p.latestEvent.eventType})`;
      text += `\n`;
    }
    return text;
  }

  // 9. Activity / Summary Query (V1.4G Section 18)
  if (p.category === 'activity') {
    let text = `Kulingana na daftari lako la Msaidizi Wangu, umerekodi **jumla ya shughuli ${p.eventCount}** katika **${periodText}**.\n\n`;

    if (p.activityBreakdown && Object.keys(p.activityBreakdown).length > 0) {
      text += `**Mgawanyo wa Shughuli:**\n`;
      const catNames: Record<string, string> = {
        addition: 'Kuongeza mifugo',
        birth: 'Vizazi',
        purchase: 'Manunuzi',
        sale: 'Mauzo',
        death: 'Vifo',
        mortality: 'Vifo',
        vaccination: 'Chanjo',
        treatment: 'Matibabu',
        feed: 'Chakula',
        observation: 'Uchunguzi'
      };
      for (const [k, count] of Object.entries(p.activityBreakdown)) {
        text += `- ${catNames[k] || k}: matukio ${count}\n`;
      }
    }

    if (p.latestEvent) {
      text += `\n- **Shughuli ya Mwisho:** ${p.latestEvent.title || p.latestEvent.eventType} tarehe ${formatDateDisplay(p.latestEvent.eventDate)}\n`;
    }

    return text;
  }

  // 10. Observations & Insights (V1.4G Section 20)
  if (p.intent === 'HISTORY_INSIGHT' && p.matchingObservations && p.matchingObservations.length > 0) {
    let text = `Hapa kuna mambo muhimu yaliyobainika kulingana na kumbukumbu zako katika **${periodText}**:\n\n`;
    for (const obs of p.matchingObservations.slice(0, 3)) {
      text += `🔹 **${obs.title}**\n${obs.summary}\n\n`;
    }
    if (p.matchingInsights && p.matchingInsights.length > 0) {
      text += `💡 **Maarifa ya Jumla:** ${p.matchingInsights[0].summary}\n`;
    }
    return text;
  }

  // 11. General History Count Fallback
  let text = `Katika **${periodText}**, una **matukio ${p.eventCount} yaliyorekodiwa** kwa **${targetName}**.\n\n`;
  if (p.hasRecordedQuantity && p.animalQuantity !== null) {
    text += `- **Jumla ya Wanyama Waliohusika:** ${p.animalQuantity}\n`;
  }
  if (p.latestEvent) {
    text += `- **Tukio la Mwisho:** Tarehe ${formatDateDisplay(p.latestEvent.eventDate)} (${p.latestEvent.eventType})\n`;
  }
  return text;
}

function getLivestockDisplayName(key: string): string {
  const item = KNOWN_LIVESTOCK_SPECIES.find((s) => s.key === key);
  return item ? item.swahiliLabel : key;
}

function formatDateDisplay(ymd: string): string {
  if (!ymd) return 'haijatajwa';
  const parts = ymd.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return ymd;
}

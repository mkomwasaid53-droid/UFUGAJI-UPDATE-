/**
 * V1.5A — AI CONTEXT ORCHESTRATOR
 * Phase 4: The Intelligent Loop — AI Context Layer
 *
 * Centralized, secure, and efficient AI Context Orchestration Layer.
 * Determines what information the AI actually needs to answer the user request,
 * minimizes unnecessary context, respects authority hierarchies and provenance,
 * enforces token budgets, and ensures strict farmer data isolation.
 */

import {
  LivestockRecord,
  LivestockEvent,
  FarmerContext,
  UserProfile,
  EventType,
  HistoryQuestionResult
} from '../types';
import {
  ContextSourceType,
  ContextProvenance,
  ContextAuthorityLevel,
  ContextAvailabilityStatus,
  ContextFreshness,
  ContextRelevance,
  ContextIntentNeed,
  ContextSourceMetadata,
  ConversationContextData,
  MarketplaceContextData,
  DaktariContextData,
  AIContextBundle,
  GeminiContextPackage,
  OrchestrationInputParams
} from '../types/contextOrchestration';
import {
  getLivestockIntelligenceSnapshot,
  getLivestockTrendsSnapshot,
  getLivestockMovementSnapshot,
  getHealthActivityHistorySnapshot,
  getActivitySummarySnapshot,
  getImportantObservationsSnapshot,
  serializeIntelligenceSnapshotForAI,
  serializeLivestockTrendsForAI,
  serializeLivestockMovementForAI,
  serializeHealthActivityHistoryForAI,
  serializeActivitySummaryForAI,
  serializeImportantObservationsForAI
} from './livestockIntelligenceEngine';
import { getHistoryQuestionResult } from './livestockHistoryQuestionService';
import { getMyAssistantIntelligenceForAI } from './aiMyAssistantBridge';
import {
  formatTrustSignalsForAIContext,
  resolveProductTrustSignals
} from './marketplaceTrustService';
import { getMarketplaceIntelligenceForAI } from './aiMarketplaceBridge';
import { evaluateCombinedContextReasoning } from './aiCombinedReasoningService';
import { CombinedContextReasoningResult } from '../types/aiCombinedReasoning';
import { MarketplaceAIIntelligenceResult } from '../types/aiMarketplace';
import { MyAssistantAIIntelligenceResult } from '../types/aiMyAssistant';
import { DaktariAIIntelligenceResult } from '../types/aiDaktariLoop';
import { getDaktariIntelligenceForAISync } from './aiDaktariLoopService';

// Maximum characters allowed per context source to enforce token budgeting
const DEFAULT_MAX_TOKEN_BUDGET = 3500; // ~14,000 characters equivalent
const CHARS_PER_TOKEN_ESTIMATE = 4;

// ==============================================================================
// 1. INTENT & NEED DETECTION (Section 1 & 36)
// ==============================================================================

/**
 * Educational / Informational Swahili patterns indicating General Knowledge.
 * When matching without personal reference pronouns, farmer databases are excluded.
 */
const GENERAL_KNOWLEDGE_PATTERNS = [
  /\bkwa\s+nini\b/i,
  /\bkwanini\b/i,
  /\bjinsi\s+ya\b/i,
  /\bumuhimu\s+(wa|ya|chake|wake|gani)\b/i,
  /\bfaida\s+(za|ya|gani|zake)\b/i,
  /\bhasara\s+(za|ya|gani)\b/i,
  /\bmaana\s+yake\b/i,
  /\bdalili\s+za\b/i,
  /\bnifundishe\b/i,
  /\bnieleze\s+kuhusu\b/i,
  /\bniambie\s+kuhusu\b/i,
  /\bsababu\s+(za|gani|yake)\b/i,
  /\bkanuni\s+za\b/i,
  /\bmuongozo\s+wa\b/i,
  /\bmagonjwa\s+ya\s+kawaida\b/i,
  /\blishe\s+ya\b/i,
  /\bbanda\s+bora\b/i
];

/**
 * First-person / Personal Farm Reference patterns.
 * Explicitly indicates the user is referring to THEIR own animals / records.
 */
const PERSONAL_FARM_PATTERNS = [
  /\b(wangu|yangu|zangu|changu|vyangu|kwangu)\b/i,
  /\bshamba\s+langu\b/i,
  /\brekodi\s+zangu\b/i,
  /\bdaftari\s+(langu|la\s+shamba)\b/i,
  /\bkwenye\s+msaidizi\s+wangu\b/i,
  /\bnina\s+(kuku|ng'ombe|mbuzi|kondoo|nguruwe|bata|sungura)\b/i,
  /\bnimefanya\b/i,
  /\bnilinunua\b/i,
  /\bniliuza\b/i,
  /\bniliwapa\b/i,
  /\bwalikufa\b/i,
  /\bwamepungua\b/i,
  /\bwameongezeka\b/i,
  /\bsalio\s+langu\b/i
];

/**
 * Historical Q&A patterns.
 */
const HISTORICAL_QA_PATTERNS = [
  /\bmara\s+ngapi\b/i,
  /\blini\b/i,
  /\btarehe\s+gani\b/i,
  /\bmwezi\s+(uliopita|huu|wa)\b/i,
  /\bsiku\s+(\d+|thelathini|saba)\s+zilizopita\b/i,
  /\bhistoria\b/i,
  /\bmatukio\b/i,
  /\bchanjo\s+(ngapi|mara|gani)\b/i,
  /\btreatment\s+(ngapi|mara|gani)\b/i,
  /\bmatibabu\s+(mangapi|mara|gani)\b/i,
  /\bvifo\s+vingapi\b/i,
  /\bwaliozaliwa\b/i,
  /\bwalionunuliwa\b/i,
  /\bwaliouzwa\b/i,
  /\bya\s+mwisho\b/i
];

/**
 * Current Livestock Status / Balance patterns.
 */
const LIVESTOCK_STATUS_PATTERNS = [
  /\bwako\s+wangapi\b/i,
  /\bidadi\s+(ya|gani|ngapi)\b/i,
  /\bsalio\b/i,
  /\bmakundi\s+yangu\b/i,
  /\bkundi\s+(gani|lipi)\b/i,
  /\bkuku\s+wangu\s+wangapi\b/i,
  /\bng'ombe\s+wangu\s+wangapi\b/i,
  /\bmbuzi\s+wangu\s+wangapi\b/i,
  /\bnina\s+mifugo\s+mingapi\b/i
];

/**
 * Farm Trends & Insights patterns.
 */
const FARM_TRENDS_PATTERNS = [
  /\bimebadilikaje\b/i,
  /\bmabadiliko\b/i,
  /\bmwenendo\b/i,
  /\bmambo\s+muhimu\b/i,
  /\bunaona\s+nini\b/i,
  /\bmaoni\s+yako\b/i,
  /\btathmini\b/i,
  /\buchambuzi\b/i,
  /\bshamba\s+langu\s+linaendeleaje\b/i
];

/**
 * Marketplace Intent patterns.
 */
const MARKETPLACE_PATTERNS = [
  /\bnatafuta\s+(chakula|dawa|chanjo|vifaranga|mbegu|pumba|mashudu|nyasi|madini|vitalu|banda)\b/i,
  /\bbei\s+ya\b/i,
  /\bwapi\s+nitapata\b/i,
  /\bnunua\b/i,
  /\bkuuza\b/i,
  /\bnunue\b/i,
  /\bgulio\b/i,
  /\bsokoni\b/i,
  /\bbidhaa\b/i,
  /\bduka\b/i,
  /\bwauzaji\b/i
];

/**
 * Detects user intent and required context needs deterministically.
 */
export function detectContextNeeds(
  question: string = '',
  history: any[] = [],
  hasMedia: { hasImage?: boolean; hasVideo?: boolean } = {},
  options: {
    historyQuestionDetected?: boolean;
    visualMarketplaceDetected?: boolean;
  } = {}
): {
  intent: ContextIntentNeed;
  confidence: number;
  mentionedSpecies: string[];
  isPersonalQuestion: boolean;
  isFollowUp: boolean;
  rationale: string;
} {
  const q = (typeof question === 'string' ? question : '').trim().toLowerCase();

  // 1. Detect mentioned livestock species
  const speciesList: string[] = [];
  if (/\bkuku\b/i.test(q)) speciesList.push('kuku');
  if (/\bng'ombe\b/i.test(q) || /\bngombe\b/i.test(q)) speciesList.push("ng'ombe");
  if (/\bmbuzi\b/i.test(q)) speciesList.push('mbuzi');
  if (/\bkondoo\b/i.test(q)) speciesList.push('kondoo');
  if (/\bnguruwe\b/i.test(q)) speciesList.push('nguruwe');
  if (/\bbata\b/i.test(q)) speciesList.push('bata');
  if (/\bsungura\b/i.test(q)) speciesList.push('sungura');

  // Check if it's a follow-up referring to previous context
  const isFollowUp = (
    /\b(na\s+kwa|vipi\s+kuhusu|je\s+kwa|hao|hiyo|hizo|yake|zao|ya\s+mwisho)\b/i.test(q) ||
    (history.length > 0 && q.length < 30 && (speciesList.length > 0 || /\blini\b/i.test(q)))
  );

  const isPersonal = PERSONAL_FARM_PATTERNS.some((p) => p.test(q)) || (isFollowUp && history.length > 0);

  // 2. Multimodal Image/Video Visual Assessment
  if (hasMedia.hasImage || hasMedia.hasVideo) {
    if (MARKETPLACE_PATTERNS.some((p) => p.test(q)) || options.visualMarketplaceDetected) {
      return {
        intent: 'COMBINED_CONTEXT',
        confidence: 0.9,
        mentionedSpecies: speciesList,
        isPersonalQuestion: isPersonal,
        isFollowUp,
        rationale: 'Picha/video imeambatishwa sambamba na nia ya kutafuta bidhaa au huduma ya sokoni.'
      };
    }
    if (isPersonal || /\b(rekodi|daftari|wangu|yangu|zangu|kundi|shamba|mifugo)\b/i.test(q)) {
      return {
        intent: 'COMBINED_CONTEXT',
        confidence: 0.92,
        mentionedSpecies: speciesList,
        isPersonalQuestion: true,
        isFollowUp,
        rationale: 'Picha/video imeambatishwa sambamba na kulinganisha na rekodi za mifugo kwenye daftari.'
      };
    }
    return {
      intent: 'VISUAL_ASSESSMENT',
      confidence: 0.95,
      mentionedSpecies: speciesList,
      isPersonalQuestion: isPersonal,
      isFollowUp,
      rationale: 'Picha au video imeambatishwa kwa ajili ya tathmini ya mwonekano wa awali.'
    };
  }

  // 3. Specific My Assistant & History Intents (V1.5B)
  if (/\b(vifo|kifo|walikufa|kufa|nimepoteza|upotevu)\b/i.test(q)) {
    return {
      intent: 'LIVESTOCK_MORTALITY',
      confidence: 0.96,
      mentionedSpecies: speciesList,
      isPersonalQuestion: true,
      isFollowUp,
      rationale: 'Swali linahusu takwimu halisi za vifo vya mifugo kutoka kwenye daftari la Msaidizi Wangu.'
    };
  }

  if (/\b(chanjo|nimechanja|nilichanja|kuchanja|vaccine|vaccination)\b/i.test(q)) {
    return {
      intent: 'VACCINATION_HISTORY',
      confidence: 0.96,
      mentionedSpecies: speciesList,
      isPersonalQuestion: true,
      isFollowUp,
      rationale: 'Swali linahusu historia rasmi ya chanjo zilizorekodiwa kwenye daftari.'
    };
  }

  if (/\b(treatment|matibabu|tiba|dawa|nilitibu|nimetibu)\b/i.test(q)) {
    return {
      intent: 'TREATMENT_HISTORY',
      confidence: 0.96,
      mentionedSpecies: speciesList,
      isPersonalQuestion: true,
      isFollowUp,
      rationale: 'Swali linahusu historia rasmi ya matibabu (treatments) zilizofanywa.'
    };
  }

  if (/\b(nimeongeza|niliongeza|ongeza|nyongeza|vizazi|waliozaliwa|wamenunuliwa)\b/i.test(q)) {
    return {
      intent: 'LIVESTOCK_ADDITIONS',
      confidence: 0.95,
      mentionedSpecies: speciesList,
      isPersonalQuestion: true,
      isFollowUp,
      rationale: 'Swali linahusu mifugo iliyoongezwa (vizazi, manunuzi au uhamisho wa ndani).'
    };
  }

  if (/\b(nimepunguza|nilipunguza|punguza|punguzo|niliuza|nimeuza|waliochinjwa)\b/i.test(q)) {
    return {
      intent: 'LIVESTOCK_REDUCTIONS',
      confidence: 0.95,
      mentionedSpecies: speciesList,
      isPersonalQuestion: true,
      isFollowUp,
      rationale: 'Swali linahusu mifugo iliyopungua (mauzo, machinjio au uhamisho wa nje).'
    };
  }

  if (/\b(shughuli|shughuli\s+gani|shughuli\s+ngapi|matukio\s+mengi)\b/i.test(q) && (isPersonal || isFollowUp)) {
    return {
      intent: 'ACTIVITY_SUMMARY',
      confidence: 0.94,
      mentionedSpecies: speciesList,
      isPersonalQuestion: true,
      isFollowUp,
      rationale: 'Swali linahusu muhtasari wa shughuli zilizofanyika shambani kwa kipindi fulani.'
    };
  }

  if (/\b(jambo\s+gani\s+muhimu|angalizo|observation|imegundua\s+nini)\b/i.test(q) && (isPersonal || isFollowUp)) {
    return {
      intent: 'IMPORTANT_OBSERVATIONS',
      confidence: 0.93,
      mentionedSpecies: speciesList,
      isPersonalQuestion: true,
      isFollowUp,
      rationale: 'Mfugaji anauliza kuhusu mambo muhimu yaliyobainika kwenye data za Msaidizi Wangu.'
    };
  }

  if (/\b(insight|insights|inaona\s+nini|pattern)\b/i.test(q) && (isPersonal || isFollowUp)) {
    return {
      intent: 'FARM_INSIGHTS',
      confidence: 0.92,
      mentionedSpecies: speciesList,
      isPersonalQuestion: true,
      isFollowUp,
      rationale: 'Mfugaji anauliza kuhusu maarifa au mwelekeo wa kina wa shamba lake.'
    };
  }

  if (/\b(mwenendo|trend|badilika|mabadiliko|imebadilikaje|ongezeka|pungua)\b/i.test(q) && (isPersonal || isFollowUp)) {
    return {
      intent: 'LIVESTOCK_TREND',
      confidence: 0.94,
      mentionedSpecies: speciesList,
      isPersonalQuestion: true,
      isFollowUp,
      rationale: 'Mfugaji anauliza kuhusu mwelekeo (trend) wa mifugo kwa kipindi fulani.'
    };
  }

  // 4. Historical Q&A Detection
  if (options.historyQuestionDetected || HISTORICAL_QA_PATTERNS.some((p) => p.test(q))) {
    return {
      intent: 'HISTORICAL_QA',
      confidence: 0.92,
      mentionedSpecies: speciesList,
      isPersonalQuestion: true,
      isFollowUp,
      rationale: 'Swali linahusu takwimu halisi za matukio yaliyopita (vifo, chanjo, tiba, mauzo, n.k).'
    };
  }

  // 5. Farm Trends & Observations (Legacy Fallback)
  if (FARM_TRENDS_PATTERNS.some((p) => p.test(q)) && isPersonal) {
    return {
      intent: 'FARM_TRENDS_INSIGHTS',
      confidence: 0.88,
      mentionedSpecies: speciesList,
      isPersonalQuestion: true,
      isFollowUp,
      rationale: 'Mfugaji anauliza kuhusu mwelekeo, mabadiliko au mambo muhimu yaliyobainika kwenye mifugo yake.'
    };
  }

  // 5. Combined Assistant & Marketplace Intent
  if (/\b(msaidizi\s+wangu|matukio|mwelekeo|ongezeko|muhtasari)\b/i.test(q) && MARKETPLACE_PATTERNS.some((p) => p.test(q))) {
    return {
      intent: 'COMBINED_CONTEXT',
      confidence: 0.92,
      mentionedSpecies: speciesList,
      isPersonalQuestion: true,
      isFollowUp,
      rationale: 'Swali linajumuisha maarifa ya Msaidizi Wangu sambamba na uchunguzi wa fursa sokoni.'
    };
  }

  // 5b. Marketplace Intent
  if (MARKETPLACE_PATTERNS.some((p) => p.test(q))) {
    if (isPersonal || speciesList.length > 0 || /\b(\d+\s*(kuku|ng'ombe|ngombe|mbuzi|kondoo)|kundi|mifugo)\b/i.test(q)) {
      return {
        intent: 'COMBINED_CONTEXT',
        confidence: 0.88,
        mentionedSpecies: speciesList,
        isPersonalQuestion: true,
        isFollowUp,
        rationale: 'Mfugaji anatafuta bidhaa inayofaa kwa kundi au idadi ya mifugo yake (Combined Context).'
      };
    }
    return {
      intent: 'MARKETPLACE_QUERY',
      confidence: 0.9,
      mentionedSpecies: speciesList,
      isPersonalQuestion: false,
      isFollowUp,
      rationale: 'Swali linahusu ununuzi, bei, au upatikanaji wa bidhaa au pembejeo sokoni.'
    };
  }

  // 6. Current Livestock Status / Balance
  if (LIVESTOCK_STATUS_PATTERNS.some((p) => p.test(q)) && (isPersonal || speciesList.length > 0)) {
    return {
      intent: 'LIVESTOCK_STATUS',
      confidence: 0.9,
      mentionedSpecies: speciesList,
      isPersonalQuestion: true,
      isFollowUp,
      rationale: 'Swali linahusu idadi ya sasa, makundi ya mifugo, au salio la wanyama.'
    };
  }

  // 7. General Knowledge Detection
  const hasEdu = GENERAL_KNOWLEDGE_PATTERNS.some((p) => p.test(q));
  if (hasEdu && !isPersonal) {
    return {
      intent: 'GENERAL_KNOWLEDGE',
      confidence: 0.95,
      mentionedSpecies: speciesList,
      isPersonalQuestion: false,
      isFollowUp: false,
      rationale: 'Swali ni la kielimu/miongozo ya jumla isiyohitaji data binafsi za mfugaji.'
    };
  }

  // 8. Default / Ambiguous
  return {
    intent: isPersonal ? 'LIVESTOCK_STATUS' : 'GENERAL_KNOWLEDGE',
    confidence: 0.65,
    mentionedSpecies: speciesList,
    isPersonalQuestion: isPersonal,
    isFollowUp,
    rationale: isPersonal
      ? 'Swali limetaja maneno binafsi ya mfugaji; tunajumuisha data za msingi za mifugo.'
      : 'Swali halikutaja data binafsi; linashughulikiwa kama ushauri wa jumla.'
  };
}

// ==============================================================================
// 2. EXTRACTORS & RELEVANCE FILTERS (Sections 2–11)
// ==============================================================================

/**
 * Extracts Farmer Profile Context
 */
export function extractFarmerProfileContext(
  userProfile?: UserProfile | null,
  farmerLocation?: string
): { metadata: ContextSourceMetadata; text: string } {
  if (!userProfile) {
    return {
      metadata: {
        source: 'FARMER_PROFILE',
        provenance: 'FACT_SOURCE',
        authority: 'AUTHORITATIVE_STRUCTURED',
        status: 'UNAVAILABLE',
        relevance: 'EXCLUDED',
        freshness: 'NOT_APPLICABLE',
        sensitivity: 'FARMER_PRIVATE',
        estimatedTokens: 0,
        characterCount: 0,
        reason: 'Wasifu wa mfugaji haukutolewa.'
      },
      text: ''
    };
  }

  const name = userProfile.displayName || userProfile.name || 'Mfugaji';
  const location = userProfile.region || userProfile.location || farmerLocation || 'Haijabainishwa';
  const role = userProfile.role || 'farmer';
  const mainLivestock = Array.isArray(userProfile.mainLivestock) ? userProfile.mainLivestock.join(', ') : '';

  const summary = `Mfugaji: ${name} | Eneo: ${location} | Wajibu: ${role}${mainLivestock ? ` | Mifugo Mikuu: ${mainLivestock}` : ''}`;

  return {
    metadata: {
      source: 'FARMER_PROFILE',
      provenance: 'FACT_SOURCE',
      authority: 'AUTHORITATIVE_STRUCTURED',
      status: 'AVAILABLE',
      relevance: 'SUPPORTING',
      freshness: 'FRESH',
      sensitivity: 'FARMER_PRIVATE',
      estimatedTokens: Math.ceil(summary.length / CHARS_PER_TOKEN_ESTIMATE),
      characterCount: summary.length,
      reason: 'Wasifu wa mfugaji kwa ajili ya utambulisho na eneo.',
      summaryText: summary
    },
    text: summary
  };
}

/**
 * Extracts Livestock Records Context (Current balances & groups)
 */
export function extractLivestockRecordsContext(
  records: LivestockRecord[] = [],
  filterSpecies?: string[]
): { metadata: ContextSourceMetadata; text: string } {
  if (!records || records.length === 0) {
    return {
      metadata: {
        source: 'LIVESTOCK_RECORDS',
        provenance: 'FACT_SOURCE',
        authority: 'AUTHORITATIVE_STRUCTURED',
        status: 'INSUFFICIENT',
        relevance: 'SUPPORTING',
        freshness: 'FRESH',
        sensitivity: 'FARMER_PRIVATE',
        estimatedTokens: 10,
        characterCount: 40,
        reason: 'Hakuna makundi ya mifugo yaliyosajiliwa.',
        summaryText: 'Makundi ya Mifugo: 0'
      },
      text: 'Makundi ya Mifugo: 0'
    };
  }

  let relevantRecords = records;
  if (filterSpecies && filterSpecies.length > 0) {
    const matched = records.filter((r) =>
      filterSpecies.some((s) => (r.livestockType || r.livestockCategory || '').toLowerCase().includes(s.toLowerCase()))
    );
    if (matched.length > 0) {
      relevantRecords = matched;
    }
  }

  const lines: string[] = [];
  lines.push(`Jumla ya Makundi: ${relevantRecords.length}`);
  let totalCurrent = 0;
  for (const r of relevantRecords) {
    const qty = typeof (r as any).currentQuantity === 'number' ? (r as any).currentQuantity : r.quantity;
    const startQty = typeof (r as any).startingQuantity === 'number' ? (r as any).startingQuantity : r.quantity;
    totalCurrent += qty;
    lines.push(`• ${r.recordName || r.livestockCategory} (${r.livestockType}): Idadi ya sasa = ${qty} (Kuanzia = ${startQty})`);
  }
  lines.push(`Jumla ya Wanyama: ${totalCurrent}`);

  const text = lines.join('\n');
  return {
    metadata: {
      source: 'LIVESTOCK_RECORDS',
      provenance: 'FACT_SOURCE',
      authority: 'AUTHORITATIVE_STRUCTURED',
      status: 'AVAILABLE',
      relevance: 'CRITICAL',
      freshness: 'FRESH',
      sensitivity: 'FARMER_PRIVATE',
      estimatedTokens: Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE),
      characterCount: text.length,
      reason: 'Rekodi rasmi za idadi na makundi ya mifugo.',
      data: relevantRecords,
      summaryText: text
    },
    text
  };
}

/**
 * Extracts Livestock History Context (Summarized & structured, not dumping hundreds of events)
 */
export function extractLivestockHistoryContext(
  records: LivestockRecord[] = [],
  recordEventsMap: Record<string, LivestockEvent[]> = {},
  historyQuestionResult?: HistoryQuestionResult
): { metadata: ContextSourceMetadata; text: string } {
  // If V1.4G historical Q&A result already computed authoritative answer, reuse it!
  if (historyQuestionResult && historyQuestionResult.detected) {
    const lines: string[] = [];
    lines.push(`[SWALI LA HISTORIA - UKWELI USIOPINGIKA]`);
    lines.push(`• Nia (Intent): ${historyQuestionResult.intent}`);
    lines.push(`• Kategoria: ${historyQuestionResult.parsedQuestion.category}`);
    lines.push(`• Aina ya Mfugo: ${historyQuestionResult.parsedQuestion.livestockType || 'Mifugo yote'}`);
    lines.push(`• Kipindi: ${historyQuestionResult.authoritativeSource.queriedPeriod.labelSwahili}`);
    lines.push(`• Idadi ya Matukio (Event Count): ${historyQuestionResult.eventCount}`);
    if (historyQuestionResult.hasRecordedAnimalQuantity && historyQuestionResult.animalQuantity !== null) {
      lines.push(`• Idadi ya Wanyama Waliohusika: ${historyQuestionResult.animalQuantity}`);
    }
    if (historyQuestionResult.latestEvent) {
      lines.push(`• Tukio la Mwisho: [${historyQuestionResult.latestEvent.eventDate}] ${historyQuestionResult.latestEvent.eventType} kwa ${historyQuestionResult.latestEvent.recordName}`);
      if (historyQuestionResult.latestEvent.medicineName) {
        lines.push(`  - Dawa/Chanjo: ${historyQuestionResult.latestEvent.medicineName}`);
      }
    }
    lines.push(`• Muhtasari wa Ukweli: ${historyQuestionResult.factualSummarySwahili}`);

    const text = lines.join('\n');
    return {
      metadata: {
        source: 'LIVESTOCK_HISTORY',
        provenance: 'FACT_SOURCE',
        authority: 'AUTHORITATIVE_STRUCTURED',
        status: 'AVAILABLE',
        relevance: 'CRITICAL',
        freshness: 'FRESH',
        sensitivity: 'FARMER_PRIVATE',
        estimatedTokens: Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE),
        characterCount: text.length,
        reason: 'Ukweli rasmi wa swali la kihistoria uliothibitishwa na V1.4G engine.',
        data: historyQuestionResult,
        summaryText: text
      },
      text
    };
  }

  // Otherwise, compile structured historical summary (counts by event type and latest 5 events)
  let totalEvents = 0;
  const countByType: Partial<Record<EventType, { events: number; qty: number }>> = {};
  const allEventsList: { date: string; type: string; record: string; qty?: number }[] = [];

  for (const r of records) {
    const events = recordEventsMap[r.recordId] || [];
    totalEvents += events.length;
    for (const ev of events) {
      if (!countByType[ev.eventType]) {
        countByType[ev.eventType] = { events: 0, qty: 0 };
      }
      countByType[ev.eventType]!.events += 1;
      countByType[ev.eventType]!.qty += (ev.quantity || 0);

      allEventsList.push({
        date: ev.eventDate,
        type: ev.eventType,
        record: r.recordName || r.livestockType,
        qty: ev.quantity
      });
    }
  }

  if (totalEvents === 0) {
    const text = 'Hakuna matukio yoyote ya kihistoria yaliyorekodiwa bado.';
    return {
      metadata: {
        source: 'LIVESTOCK_HISTORY',
        provenance: 'FACT_SOURCE',
        authority: 'AUTHORITATIVE_STRUCTURED',
        status: 'INSUFFICIENT',
        relevance: 'SUPPORTING',
        freshness: 'FRESH',
        sensitivity: 'FARMER_PRIVATE',
        estimatedTokens: 15,
        characterCount: text.length,
        reason: 'Hakuna matukio ya kihistoria.',
        summaryText: text
      },
      text
    };
  }

  // Sort descending by date
  allEventsList.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const lines: string[] = [];
  lines.push(`Jumla ya Matukio ya Kihistoria: ${totalEvents}`);
  for (const t in countByType) {
    const item = countByType[t as EventType]!;
    lines.push(`• ${t}: matukio ${item.events}${item.qty > 0 ? ` (Wanyama: ${item.qty})` : ''}`);
  }
  lines.push(`Matukio ya Hivi Karibuni:`);
  for (const ev of allEventsList.slice(0, 5)) {
    lines.push(`• [${ev.date}] ${ev.record} - ${ev.type}${ev.qty ? ` (${ev.qty})` : ''}`);
  }

  const text = lines.join('\n');
  return {
    metadata: {
      source: 'LIVESTOCK_HISTORY',
      provenance: 'FACT_SOURCE',
      authority: 'AUTHORITATIVE_STRUCTURED',
      status: 'AVAILABLE',
      relevance: 'CRITICAL',
      freshness: 'FRESH',
      sensitivity: 'FARMER_PRIVATE',
      estimatedTokens: Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE),
      characterCount: text.length,
      reason: 'Muhtasari rasmi wa matukio ya kihistoria.',
      summaryText: text
    },
    text
  };
}

/**
 * Extracts My Assistant Intelligence Context (V1.4A through V1.4F)
 */
export function extractMyAssistantIntelligenceContext(
  userId: string,
  records: LivestockRecord[] = [],
  recordEventsMap: Record<string, LivestockEvent[]> = {},
  options: {
    includeTrends?: boolean;
    includeHealth?: boolean;
    includeObservations?: boolean;
    filterSpecies?: string[];
  } = {}
): { metadata: ContextSourceMetadata; text: string } {
  if (!records || records.length === 0) {
    return {
      metadata: {
        source: 'MY_ASSISTANT_INTELLIGENCE',
        provenance: 'DERIVED_SOURCE',
        authority: 'DERIVED_STRUCTURED',
        status: 'NOT_RELEVANT',
        relevance: 'EXCLUDED',
        freshness: 'NOT_APPLICABLE',
        sensitivity: 'FARMER_PRIVATE',
        estimatedTokens: 0,
        characterCount: 0,
        reason: 'Hakuna rekodi za kuhesabia maarifa ya shamba.'
      },
      text: ''
    };
  }

  const parts: string[] = [];

  // 1. Health history (if health/treatment requested)
  if (options.includeHealth) {
    try {
      const healthSnapshot = getHealthActivityHistorySnapshot(userId, records, recordEventsMap);
      parts.push(serializeHealthActivityHistoryForAI(healthSnapshot));
    } catch {
      // Graceful fallback
    }
  }

  // 2. Observations & Insights (if trends/insights requested)
  if (options.includeObservations) {
    try {
      const obsSnapshot = getImportantObservationsSnapshot(userId, records, recordEventsMap);
      parts.push(serializeImportantObservationsForAI(obsSnapshot));
    } catch {
      // Graceful fallback
    }
  }

  // 3. Trends (if trends requested)
  if (options.includeTrends) {
    try {
      const trendsSnapshot = getLivestockTrendsSnapshot(userId, records, recordEventsMap, { timeWindow: '30d' });
      parts.push(serializeLivestockTrendsForAI(trendsSnapshot));
    } catch {
      // Graceful fallback
    }
  }

  // If none explicitly requested, include compact activity summary
  if (parts.length === 0) {
    try {
      const actSnapshot = getActivitySummarySnapshot(userId, records, recordEventsMap, { timeWindow: '30d' });
      parts.push(serializeActivitySummaryForAI(actSnapshot));
    } catch {
      // Graceful fallback
    }
  }

  const text = parts.join('\n\n');
  return {
    metadata: {
      source: 'MY_ASSISTANT_INTELLIGENCE',
      provenance: 'DERIVED_SOURCE',
      authority: 'DERIVED_STRUCTURED',
      status: text.length > 0 ? 'AVAILABLE' : 'INSUFFICIENT',
      relevance: text.length > 0 ? 'CRITICAL' : 'OPTIONAL',
      freshness: 'FRESH',
      sensitivity: 'FARMER_PRIVATE',
      estimatedTokens: Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE),
      characterCount: text.length,
      reason: 'Maarifa yaliyokokotolewa na Msaidizi Wangu (V1.4 Intelligence Layer).',
      summaryText: text
    },
    text
  };
}

/**
 * Extracts Marketplace Context (Section 7 & V1.5C)
 */
export function extractMarketplaceContext(
  products: any[] = [],
  queryOrSpecies?: string,
  verifiedMarketplaceResult?: MarketplaceAIIntelligenceResult
): { metadata: ContextSourceMetadata; text: string } {
  // If authoritative verified result from V1.5C bridge exists, use it directly
  if (verifiedMarketplaceResult && verifiedMarketplaceResult.detected) {
    const text = verifiedMarketplaceResult.deterministicAnswer;
    return {
      metadata: {
        source: 'MARKETPLACE',
        provenance: 'MODULE_SOURCE',
        authority: 'REALTIME_MODULE',
        status: verifiedMarketplaceResult.status === 'has_results'
          ? 'AVAILABLE'
          : (verifiedMarketplaceResult.status === 'no_results' ? 'UNAVAILABLE' : 'INSUFFICIENT'),
        relevance: 'CRITICAL',
        freshness: 'FRESH',
        sensitivity: 'PUBLIC',
        estimatedTokens: Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE),
        characterCount: text.length,
        reason: verifiedMarketplaceResult.explanationSwahili || 'Matokeo halisi ya utafutaji wa Gulio.',
        data: verifiedMarketplaceResult.products,
        summaryText: text
      },
      text
    };
  }

  if (!products || products.length === 0) {
    return {
      metadata: {
        source: 'MARKETPLACE',
        provenance: 'MODULE_SOURCE',
        authority: 'REALTIME_MODULE',
        status: 'UNAVAILABLE',
        relevance: 'EXCLUDED',
        freshness: 'NOT_APPLICABLE',
        sensitivity: 'PUBLIC',
        estimatedTokens: 0,
        characterCount: 0,
        reason: 'Hakuna bidhaa za sokoni zilizopatikana kwa sasa.'
      },
      text: ''
    };
  }

  // Filter top 3-5 relevant products if query or species is provided
  let filtered = products;
  if (queryOrSpecies && queryOrSpecies.trim().length > 0) {
    const term = queryOrSpecies.toLowerCase();
    const matched = products.filter((p: any) =>
      (p.title || '').toLowerCase().includes(term) ||
      (p.category || '').toLowerCase().includes(term) ||
      (p.description || '').toLowerCase().includes(term)
    );
    if (matched.length > 0) {
      filtered = matched;
    }
  }

  const topItems = filtered.slice(0, 4);
  const lines: string[] = [];
  lines.push(`Bidhaa za Sokoni (Marketplace Results):`);
  for (const item of topItems) {
    const signals = resolveProductTrustSignals(item);
    const verifiedStatus = signals.sellerVerification.isVerified ? ' (Aliyethibitishwa)' : ' (Haijahakikiwa)';
    const stockStatus = signals.stock.status === 'IN_STOCK' ? `Ipo (${signals.stock.quantity})` : signals.stock.displayStock;
    const sellerDisplay = item.sellerName || signals.sellerVerification.businessName || 'Muuzaji';
    lines.push(`• ${item.title}: ${signals.price.displayPrice} | Muuzaji: ${sellerDisplay}${verifiedStatus} | Eneo: ${signals.location.displayLocation} | Mzigo: ${stockStatus}`);
    if (signals.reputation.hasReviews && signals.reputation.averageRating !== null) {
      lines.push(`  Tathmini: ${signals.reputation.averageRating.toFixed(1)}★ (${signals.reputation.totalPublishedReviews} zilizochapishwa)`);
    }
  }

  const text = lines.join('\n');
  return {
    metadata: {
      source: 'MARKETPLACE',
      provenance: 'MODULE_SOURCE',
      authority: 'REALTIME_MODULE',
      status: 'AVAILABLE',
      relevance: 'CRITICAL',
      freshness: 'FRESH',
      sensitivity: 'PUBLIC',
      estimatedTokens: Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE),
      characterCount: text.length,
      reason: 'Data halisi za bidhaa zilizopo sokoni (Gulio la Ufugaji).',
      data: topItems,
      summaryText: text
    },
    text
  };
}

/**
 * Extracts Conversation Context (Recent bounded turns, not entire chat history)
 */
export function extractConversationContext(
  history: any[] = [],
  maxTurns: number = 4
): { metadata: ContextSourceMetadata; text: string } {
  if (!history || history.length === 0) {
    return {
      metadata: {
        source: 'CONVERSATION',
        provenance: 'CONVERSATION_SOURCE',
        authority: 'CONVERSATIONAL',
        status: 'AVAILABLE',
        relevance: 'SUPPORTING',
        freshness: 'FRESH',
        sensitivity: 'FARMER_PRIVATE',
        estimatedTokens: 0,
        characterCount: 0,
        reason: 'Mwanzo wa mazungumzo mapya.'
      },
      text: ''
    };
  }

  const recent = history.slice(-maxTurns);
  const lines: string[] = [];
  for (const msg of recent) {
    const role = msg.role === 'user' ? 'Mfugaji' : 'AI';
    const text = (msg.text || msg.content || '').trim().replace(/[\r\n]+/g, ' ');
    if (text) {
      lines.push(`${role}: "${text.slice(0, 160)}"`);
    }
  }

  const text = lines.join('\n');
  return {
    metadata: {
      source: 'CONVERSATION',
      provenance: 'CONVERSATION_SOURCE',
      authority: 'CONVERSATIONAL',
      status: 'AVAILABLE',
      relevance: 'SUPPORTING',
      freshness: 'FRESH',
      sensitivity: 'FARMER_PRIVATE',
      estimatedTokens: Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE),
      characterCount: text.length,
      reason: 'Muktadha wa mazungumzo ya hivi karibuni (Conversation turns).',
      summaryText: text
    },
    text
  };
}

/**
 * Extracts Image Context
 */
export function extractImageContext(
  hasImage: boolean,
  attachment?: { fileName?: string; mimeType?: string; sizeBytes?: number }
): { metadata: ContextSourceMetadata; text: string } {
  if (!hasImage) {
    return {
      metadata: {
        source: 'IMAGE',
        provenance: 'VISUAL_SOURCE',
        authority: 'VISUAL_EVIDENCE',
        status: 'NOT_RELEVANT',
        relevance: 'EXCLUDED',
        freshness: 'NOT_APPLICABLE',
        sensitivity: 'FARMER_PRIVATE',
        estimatedTokens: 0,
        characterCount: 0,
        reason: 'Hakuna picha iliyoambatishwa kwenye ujumbe huu.'
      },
      text: ''
    };
  }

  const text = `Picha imeambatishwa (${attachment?.fileName || 'image'}, ${attachment?.mimeType || 'image/jpeg'}). Ushuhuda wa kuona (visual observation) pekee; sio utambuzi wa kitatibu.`;
  return {
    metadata: {
      source: 'IMAGE',
      provenance: 'VISUAL_SOURCE',
      authority: 'VISUAL_EVIDENCE',
      status: 'AVAILABLE',
      relevance: 'CRITICAL',
      freshness: 'FRESH',
      sensitivity: 'FARMER_PRIVATE',
      estimatedTokens: Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE),
      characterCount: text.length,
      reason: 'Ushahidi wa picha ulioambatishwa na mfugaji.',
      summaryText: text
    },
    text
  };
}

/**
 * Extracts Video Context
 */
export function extractVideoContext(
  hasVideo: boolean,
  attachment?: { fileName?: string; duration?: number }
): { metadata: ContextSourceMetadata; text: string } {
  if (!hasVideo) {
    return {
      metadata: {
        source: 'VIDEO',
        provenance: 'VISUAL_SOURCE',
        authority: 'VISUAL_EVIDENCE',
        status: 'NOT_RELEVANT',
        relevance: 'EXCLUDED',
        freshness: 'NOT_APPLICABLE',
        sensitivity: 'FARMER_PRIVATE',
        estimatedTokens: 0,
        characterCount: 0,
        reason: 'Hakuna video iliyoambatishwa kwenye ujumbe huu.'
      },
      text: ''
    };
  }

  const durStr = attachment?.duration ? ` - Muda: ${attachment.duration}s` : '';
  const text = `Video imeambatishwa (${attachment?.fileName || 'video'}${durStr}). Uchunguzi wa mienendo ya kuona (visual movement observation); sio utambuzi thabiti wa kitatibu.`;
  return {
    metadata: {
      source: 'VIDEO',
      provenance: 'VISUAL_SOURCE',
      authority: 'VISUAL_EVIDENCE',
      status: 'AVAILABLE',
      relevance: 'CRITICAL',
      freshness: 'FRESH',
      sensitivity: 'FARMER_PRIVATE',
      estimatedTokens: Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE),
      characterCount: text.length,
      reason: 'Ushahidi wa video ulioambatishwa na mfugaji.',
      summaryText: text
    },
    text
  };
}

/**
 * V1.5G Daktari Mtaani Kwako Context Extractor
 * Incorporates real registered doctor profiles into the context bundle when requested.
 * Enforces:
 * - Registration ≠ Verification
 * - Private consultation boundary (consultation data is never in AI context)
 * - Explicit contact gate (AI never auto-contacts doctor)
 */
export function extractDaktariContext(
  daktariResult?: DaktariAIIntelligenceResult
): {
  metadata: ContextSourceMetadata;
  container: DaktariContextData;
  text: string;
} {
  if (!daktariResult || !daktariResult.detected) {
    const placeholderContainer: DaktariContextData = {
      searchIntent: undefined,
      specialty: undefined,
      location: undefined,
      verifiedDoctorsAvailable: 0,
      note: 'Hakuna hitaji la daktari wa mifugo lililotambuliwa katika swali hili.'
    };
    return {
      metadata: {
        source: 'DAKTARI',
        provenance: 'MODULE_SOURCE',
        authority: 'REALTIME_MODULE',
        status: 'NOT_RELEVANT',
        relevance: 'EXCLUDED',
        freshness: 'NOT_APPLICABLE',
        sensitivity: 'SYSTEM_INTERNAL',
        estimatedTokens: 0,
        characterCount: 0,
        reason: 'Hakuna utafutaji wa daktari uliohitajika.',
        data: placeholderContainer
      },
      container: placeholderContainer,
      text: ''
    };
  }

  const verifiedCount = daktariResult.results.filter(
    (r) => r.verificationStatus === 'VERIFIED'
  ).length;

  const container: DaktariContextData = {
    searchIntent: daktariResult.intent,
    specialty: daktariResult.query.specialty || daktariResult.query.livestockType,
    location: daktariResult.query.region,
    verifiedDoctorsAvailable: verifiedCount,
    note: daktariResult.deterministicExplanationSwahili
  };

  const lines: string[] = [];
  lines.push(`--- [DAKTARI MTAANI KWAKO / LEVEL_1_AUTHORITATIVE (Professional Discovery Module)] ---`);
  lines.push(`Nia ya Utafutaji (Search Intent): ${daktariResult.intent}`);
  if (daktariResult.query.livestockType) lines.push(`Mifugo Inayolengwa: ${daktariResult.query.livestockType}`);
  if (daktariResult.query.region) lines.push(`Eneo/Mkoa: ${daktariResult.query.region}`);
  if (daktariResult.query.emergency) lines.push(`Hali ya Dharura: NDIYO (Emergency 24/7)`);
  lines.push(`Ufafanuzi Rasmi: ${daktariResult.deterministicExplanationSwahili}`);

  if (daktariResult.results.length > 0) {
    lines.push(`\nWataalamu Halisi Waliosajiliwa (${daktariResult.results.length}):`);
    daktariResult.results.slice(0, 3).forEach((doc, idx) => {
      const verifLabel =
        doc.verificationStatus === 'VERIFIED'
          ? 'IMEHAKIKIWA RASMI (VERIFIED)'
          : 'IMESAJILIWA - HAIJADHIBITISHWA (REGISTERED)';
      const livestockTypesStr = Array.isArray(doc.livestockTypes) && doc.livestockTypes.length > 0
        ? doc.livestockTypes.join(', ')
        : (doc.specialty || 'Mifugo yote');
      lines.push(
        `${idx + 1}. ${doc.fullName || 'Mtaalamu wa Mifugo'} (${doc.professionalTitle || 'Daktari wa Mifugo'})\n` +
        `   - Hali ya Uhakiki: ${verifLabel}\n` +
        `   - Utaalamu/Mifugo: ${livestockTypesStr}\n` +
        `   - Mahali: ${doc.district ? doc.district + ', ' : ''}${doc.region || 'Tanzania'}\n` +
        `   - Upatikanaji: ${doc.availability === 'available' ? 'Yupo Leo' : 'Kwa Miadi'} | Dharura 24/7: ${doc.emergencyAvailability ? 'Ndio' : 'Hapana'}\n` +
        `   - Simu: ${doc.phone || 'Haipo'} | WhatsApp: ${doc.whatsapp || 'Haipo'}`
      );
    });
  } else {
    lines.push(`\nTAHADHARI KALI (STRICT ZERO HALLUCINATION):`);
    lines.push(`KWA SASA HAKUNA DAKTARI ALIYESAJILIWA KWENYE MFUMO WA UFUGAJI UPDATE.`);
    lines.push(`- KAMWE USIBUNI au kutaja jina la daktari yeyote kutoka nje ya Ufugaji Update.`);
    lines.push(`- Eleza wazi na moja kwa moja kwamba kwa sasa hakuna daktari au mtaalamu aliyesajiliwa kwenye mfumo wa Ufugaji Update.`);
    lines.push(`- Mshauri mfugaji kuwasiliana na Afisa Ugani wa kata au wilaya yake, au kufika kituo cha mifugo kilicho karibu kwa msaada wa haraka.`);
  }

  lines.push(`\nILANI YA USALAMA NA FARAGHA YA DAKTARI:`);
  lines.push(`- Registration ≠ Verification: Usidai mtaalamu amehakikiwa isipokuwa profaili yake inathibitisha VERIFIED.`);
  lines.push(`- Hakuna Mawasiliano ya Kiotomatiki (Explicit Contact Gate): AI haipigi simu wala kutuma WhatsApp.`);
  lines.push(`- Faragha ya Mashauriano (Zero Ingestion): Mazungumzo ya faragha ya kitabibu hayaruhusiwi kuingia kwenye muktadha wa AI.`);

  const text = lines.join('\n');
  const tokens = Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE);

  return {
    metadata: {
      source: 'DAKTARI',
      provenance: 'MODULE_SOURCE',
      authority: 'REALTIME_MODULE',
      status: daktariResult.status === 'FOUND' ? 'AVAILABLE' : 'INSUFFICIENT',
      relevance: 'CRITICAL',
      freshness: 'FRESH',
      sensitivity: 'PUBLIC',
      estimatedTokens: tokens,
      characterCount: text.length,
      reason: daktariResult.deterministicExplanationSwahili,
      summaryText: daktariResult.deterministicExplanationSwahili,
      data: container
    },
    container,
    text
  };
}

export function getDaktariContextPlaceholder(): {
  metadata: ContextSourceMetadata;
  container: DaktariContextData;
} {
  const res = extractDaktariContext(undefined);
  return { metadata: res.metadata, container: res.container };
}

// ==============================================================================
// 3. CONFLICT DETECTION (Section 26)
// ==============================================================================

export function detectContextConflicts(
  question: string = '',
  records: LivestockRecord[] = []
): { hasConflict: boolean; notes: string[] } {
  const notes: string[] = [];
  const q = (typeof question === 'string' ? question : '').toLowerCase();

  // Pattern: "nina kuku 200" or "kuku wangu 500"
  const match = q.match(/\b(nina|kuna)\s+(kuku|ng'ombe|mbuzi|kondoo|nguruwe)\s+(\d+)\b/i) ||
                q.match(/\b(kuku|ng'ombe|mbuzi|kondoo|nguruwe)\s+wangu\s+(\d+)\b/i);

  if (match) {
    const mentionedSpecies = match[2] || match[1];
    const mentionedQty = parseInt(match[3] || match[2], 10);

    const record = records.find((r) =>
      (r.livestockType || r.livestockCategory || '').toLowerCase().includes(mentionedSpecies.toLowerCase())
    );

    if (record) {
      const recordQty = typeof (record as any).currentQuantity === 'number' ? (record as any).currentQuantity : record.quantity;
      if (Math.abs(recordQty - mentionedQty) > 0) {
        notes.push(
          `Tofauti ya idadi: Mfugaji ametaja "${mentionedSpecies} ${mentionedQty}" kwenye mazungumzo, lakini rekodi rasmi ya daftari inaonyesha "${recordQty}". Hifadhi idadi ya daftari kama ukweli rasmi na ueleze tofauti hiyo kwa heshima.`
        );
      }
    }
  }

  return {
    hasConflict: notes.length > 0,
    notes
  };
}

// ==============================================================================
// 4. MAIN ORCHESTRATION PIPELINE (Section 1 & 12)
// ==============================================================================

/**
 * Builds the complete, normalized AI Context Bundle.
 * Follows the Core Principle:
 * USER REQUEST -> CONTEXT ORCHESTRATOR -> NEED DETECTION -> RELEVANT SELECTION
 * -> VALIDATION -> PRIORITIZATION -> BUDGET MINIMIZATION -> BUNDLE
 */
export function orchestrateAIContext(params: OrchestrationInputParams): {
  bundle: AIContextBundle;
  geminiPackage: GeminiContextPackage;
} {
  const {
    userId = 'authenticated-farmer',
    question,
    history = [],
    userProfile,
    farmerLocation,
    farmerRecords = [],
    recordEventsMap = {},
    marketplaceProducts = [],
    publishedShops = [],
    explicitMarketplaceQuery,
    imageAttachment,
    videoAttachment,
    hasBinaryImage = false,
    hasBinaryVideo = false,
    historyQuestionResult,
    visualMarketplaceIntent,
    maxTokenBudget = DEFAULT_MAX_TOKEN_BUDGET
  } = params;

  const safeQuestion = typeof question === 'string'
    ? question
    : typeof (params as any).questionText === 'string'
    ? (params as any).questionText
    : '';

  const requestId = `ctx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const timestamp = new Date().toISOString();

  // Step 1: Detect intent and needed context sources
  const needAnalysis = detectContextNeeds(
    safeQuestion,
    history,
    { hasImage: hasBinaryImage || Boolean(imageAttachment), hasVideo: hasBinaryVideo || Boolean(videoAttachment) },
    {
      historyQuestionDetected: Boolean(historyQuestionResult?.detected),
      visualMarketplaceDetected: Boolean(visualMarketplaceIntent?.detected)
    }
  );

  // V1.5C: Authoritative Marketplace retrieval and verification
  const marketplaceResult = getMarketplaceIntelligenceForAI({
    question: safeQuestion,
    history,
    marketplaceProducts,
    publishedShops,
    farmerLocation,
    mentionedSpecies: needAnalysis.mentionedSpecies,
    explicitStructuredQuery: explicitMarketplaceQuery
  });

  // Step 2: Extract candidate context sources
  const profileExtract = extractFarmerProfileContext(userProfile, farmerLocation);
  const recordsExtract = extractLivestockRecordsContext(farmerRecords, needAnalysis.mentionedSpecies);
  const historyExtract = extractLivestockHistoryContext(farmerRecords, recordEventsMap, historyQuestionResult);
  const conversationExtract = extractConversationContext(history, 4);
  const imageExtract = extractImageContext(hasBinaryImage || Boolean(imageAttachment), imageAttachment);
  const videoExtract = extractVideoContext(hasBinaryVideo || Boolean(videoAttachment), videoAttachment);
  // V1.5G: Authoritative Daktari Mtaani Kwako Loop retrieval
  const daktariResult = getDaktariIntelligenceForAISync({
    question: safeQuestion,
    farmerLocation,
    farmerPrimaryLivestock: needAnalysis.mentionedSpecies[0],
    hasEmergency: Boolean(params.doctorAction?.urgency === 'high' || /dharura|emergency|mahututi/i.test(safeQuestion)),
    hasMediaWithDistress: Boolean(hasBinaryImage || hasBinaryVideo),
    existingProfiles: params.daktariProfiles
  });

  const daktariExtract = extractDaktariContext(daktariResult);

  const intelligenceExtract = extractMyAssistantIntelligenceContext(
    userId,
    farmerRecords,
    recordEventsMap,
    {
      includeTrends: needAnalysis.intent === 'FARM_TRENDS_INSIGHTS' || needAnalysis.intent === 'COMBINED_CONTEXT',
      includeHealth: needAnalysis.intent === 'HEALTH_TREATMENT' || (needAnalysis.intent === 'HISTORICAL_QA' && /dawa|chanjo|tiba|treatment/i.test(safeQuestion)),
      includeObservations: needAnalysis.intent === 'FARM_TRENDS_INSIGHTS',
      filterSpecies: needAnalysis.mentionedSpecies
    }
  );

  const marketplaceExtract = extractMarketplaceContext(
    marketplaceProducts,
    needAnalysis.mentionedSpecies[0] || safeQuestion,
    marketplaceResult
  );

  // V1.5B: Authoritative My Assistant Intelligence retrieval
  const myAssistantResult = getMyAssistantIntelligenceForAI({
    userId,
    records: farmerRecords,
    recordEventsMap,
    question: safeQuestion,
    history,
    species: needAnalysis.mentionedSpecies[0] || null
  });

  // V1.5E: Combined Context Reasoning Evaluation (Phase 4: The Intelligent Loop)
  const combinedReasoningResult = evaluateCombinedContextReasoning({
    question: safeQuestion,
    history,
    userProfile,
    farmerLocation,
    farmerRecords,
    recordEventsMap,
    marketplaceResult,
    myAssistantResult,
    historyQuestionResult,
    hasMedia: { hasImage: hasBinaryImage || Boolean(imageAttachment), hasVideo: hasBinaryVideo || Boolean(videoAttachment) },
    visualMarketplaceDetected: Boolean(visualMarketplaceIntent?.detected)
  });

  if (combinedReasoningResult && combinedReasoningResult.detected) {
    needAnalysis.intent = 'COMBINED_CONTEXT';
  }

  // Step 3: Determine relevance according to intent (Minimization Rule: Section 17 & 36)
  const sourcesMap: Record<ContextSourceType, ContextSourceMetadata> = {
    FARMER_PROFILE: profileExtract.metadata,
    FARMER_CONTEXT: {
      source: 'FARMER_CONTEXT',
      provenance: 'DERIVED_SOURCE',
      authority: 'DERIVED_STRUCTURED',
      status: farmerRecords.length > 0 ? 'AVAILABLE' : 'INSUFFICIENT',
      relevance: 'OPTIONAL',
      freshness: 'FRESH',
      sensitivity: 'FARMER_PRIVATE',
      estimatedTokens: 30,
      characterCount: 120,
      reason: 'Muhtasari wa hali ya sasa ya shamba.'
    },
    LIVESTOCK_RECORDS: recordsExtract.metadata,
    LIVESTOCK_HISTORY: historyExtract.metadata,
    MY_ASSISTANT_INTELLIGENCE: {
      source: 'MY_ASSISTANT_INTELLIGENCE',
      provenance: myAssistantResult.provenance === 'FACT' ? 'FACT_SOURCE' : 'DERIVED_SOURCE',
      authority: myAssistantResult.authorityLevel,
      status: myAssistantResult.dataSufficiency === 'NO_DATA' ? 'INSUFFICIENT' : 'AVAILABLE',
      relevance: 'OPTIONAL',
      freshness: 'FRESH',
      sensitivity: 'FARMER_PRIVATE',
      estimatedTokens: Math.ceil((myAssistantResult.deterministicAnswer.length + intelligenceExtract.text.length) / CHARS_PER_TOKEN_ESTIMATE),
      characterCount: myAssistantResult.deterministicAnswer.length + intelligenceExtract.text.length,
      reason: myAssistantResult.deterministicAnswer.slice(0, 100) || 'Uchambuzi rasmi wa daftari la Msaidizi Wangu.',
      summaryText: myAssistantResult.deterministicAnswer
    },
    MARKETPLACE: marketplaceExtract.metadata,
    CONVERSATION: conversationExtract.metadata,
    IMAGE: imageExtract.metadata,
    VIDEO: videoExtract.metadata,
    DAKTARI: daktariExtract.metadata
  };

  // Re-weight relevance based on intent:
  switch (needAnalysis.intent) {
    case 'GENERAL_KNOWLEDGE':
      // Exclude all personal farm databases and commercial catalogs
      sourcesMap.FARMER_PROFILE.relevance = 'EXCLUDED';
      sourcesMap.FARMER_CONTEXT.relevance = 'EXCLUDED';
      sourcesMap.LIVESTOCK_RECORDS.relevance = 'EXCLUDED';
      sourcesMap.LIVESTOCK_HISTORY.relevance = 'EXCLUDED';
      sourcesMap.MY_ASSISTANT_INTELLIGENCE.relevance = 'EXCLUDED';
      sourcesMap.MARKETPLACE.relevance = 'EXCLUDED';
      sourcesMap.IMAGE.relevance = 'EXCLUDED';
      sourcesMap.VIDEO.relevance = 'EXCLUDED';
      sourcesMap.DAKTARI.relevance = 'EXCLUDED';
      sourcesMap.CONVERSATION.relevance = needAnalysis.isFollowUp ? 'SUPPORTING' : 'EXCLUDED';
      break;

    case 'HISTORICAL_QA':
      sourcesMap.LIVESTOCK_HISTORY.relevance = 'CRITICAL';
      sourcesMap.MY_ASSISTANT_INTELLIGENCE.relevance = 'SUPPORTING';
      sourcesMap.LIVESTOCK_RECORDS.relevance = 'SUPPORTING';
      sourcesMap.CONVERSATION.relevance = 'SUPPORTING';
      sourcesMap.MARKETPLACE.relevance = 'EXCLUDED';
      sourcesMap.IMAGE.relevance = 'EXCLUDED';
      sourcesMap.VIDEO.relevance = 'EXCLUDED';
      sourcesMap.DAKTARI.relevance = 'EXCLUDED';
      break;

    case 'LIVESTOCK_STATUS':
      sourcesMap.LIVESTOCK_RECORDS.relevance = 'CRITICAL';
      sourcesMap.MY_ASSISTANT_INTELLIGENCE.relevance = 'CRITICAL';
      sourcesMap.FARMER_CONTEXT.relevance = 'SUPPORTING';
      sourcesMap.CONVERSATION.relevance = 'SUPPORTING';
      sourcesMap.LIVESTOCK_HISTORY.relevance = 'EXCLUDED';
      sourcesMap.MARKETPLACE.relevance = 'EXCLUDED';
      sourcesMap.IMAGE.relevance = 'EXCLUDED';
      sourcesMap.VIDEO.relevance = 'EXCLUDED';
      sourcesMap.DAKTARI.relevance = 'EXCLUDED';
      break;

    case 'LIVESTOCK_TREND':
    case 'LIVESTOCK_ADDITIONS':
    case 'LIVESTOCK_REDUCTIONS':
    case 'LIVESTOCK_MORTALITY':
    case 'VACCINATION_HISTORY':
    case 'TREATMENT_HISTORY':
    case 'ACTIVITY_SUMMARY':
    case 'IMPORTANT_OBSERVATIONS':
    case 'FARM_INSIGHTS':
    case 'FARM_TRENDS_INSIGHTS':
      sourcesMap.MY_ASSISTANT_INTELLIGENCE.relevance = 'CRITICAL';
      sourcesMap.LIVESTOCK_RECORDS.relevance = 'SUPPORTING';
      sourcesMap.LIVESTOCK_HISTORY.relevance = 'SUPPORTING';
      sourcesMap.CONVERSATION.relevance = 'SUPPORTING';
      sourcesMap.MARKETPLACE.relevance = 'EXCLUDED';
      sourcesMap.IMAGE.relevance = 'EXCLUDED';
      sourcesMap.VIDEO.relevance = 'EXCLUDED';
      sourcesMap.DAKTARI.relevance = 'EXCLUDED';
      break;

    case 'MARKETPLACE_QUERY':
      sourcesMap.MARKETPLACE.relevance = 'CRITICAL';
      sourcesMap.LIVESTOCK_RECORDS.relevance = needAnalysis.mentionedSpecies.length > 0 ? 'SUPPORTING' : 'OPTIONAL';
      sourcesMap.CONVERSATION.relevance = 'SUPPORTING';
      sourcesMap.LIVESTOCK_HISTORY.relevance = 'EXCLUDED';
      sourcesMap.MY_ASSISTANT_INTELLIGENCE.relevance = 'EXCLUDED';
      sourcesMap.IMAGE.relevance = 'EXCLUDED';
      sourcesMap.VIDEO.relevance = 'EXCLUDED';
      sourcesMap.DAKTARI.relevance = 'EXCLUDED';
      break;

    case 'VISUAL_ASSESSMENT':
      if (hasBinaryImage || imageAttachment) sourcesMap.IMAGE.relevance = 'CRITICAL';
      if (hasBinaryVideo || videoAttachment) sourcesMap.VIDEO.relevance = 'CRITICAL';
      sourcesMap.CONVERSATION.relevance = 'SUPPORTING';
      sourcesMap.LIVESTOCK_RECORDS.relevance = needAnalysis.mentionedSpecies.length > 0 ? 'SUPPORTING' : 'OPTIONAL';
      sourcesMap.MARKETPLACE.relevance = 'EXCLUDED';
      sourcesMap.LIVESTOCK_HISTORY.relevance = 'EXCLUDED';
      sourcesMap.MY_ASSISTANT_INTELLIGENCE.relevance = 'EXCLUDED';
      sourcesMap.DAKTARI.relevance = 'EXCLUDED';
      break;

    case 'COMBINED_CONTEXT':
      if (combinedReasoningResult && combinedReasoningResult.detected) {
        // Enforce Relevance-First: only activate sources that are part of the combination
        for (const k in sourcesMap) {
          sourcesMap[k as ContextSourceType].relevance = 'EXCLUDED';
        }
        sourcesMap.CONVERSATION.relevance = 'SUPPORTING';
        for (const src of combinedReasoningResult.primarySources) {
          if (sourcesMap[src]) {
            sourcesMap[src].relevance = 'CRITICAL';
          }
        }
      } else {
        sourcesMap.LIVESTOCK_RECORDS.relevance = 'CRITICAL';
        sourcesMap.MARKETPLACE.relevance = 'CRITICAL';
        sourcesMap.CONVERSATION.relevance = 'SUPPORTING';
        sourcesMap.MY_ASSISTANT_INTELLIGENCE.relevance = 'SUPPORTING';
        sourcesMap.LIVESTOCK_HISTORY.relevance = 'EXCLUDED';
        sourcesMap.DAKTARI.relevance = 'EXCLUDED';
      }
      break;

    default:
      break;
  }

  // V1.5G: Daktari Mtaani Kwako Activation
  if (daktariResult.detected) {
    sourcesMap.DAKTARI.relevance = 'CRITICAL';
    sourcesMap.CONVERSATION.relevance = 'SUPPORTING';
  } else if (daktariResult.handoff) {
    sourcesMap.DAKTARI.relevance = 'SUPPORTING';
  }

  // Step 4: Conflict detection
  const conflictAnalysis = detectContextConflicts(safeQuestion, farmerRecords);

  // Step 5: Prioritization & Budget Minification (Section 18 & 19)
  const selectedSources: ContextSourceType[] = [];
  const excludedSources: ContextSourceType[] = [];
  const selectionRationale: Record<ContextSourceType, string> = {} as any;

  for (const key in sourcesMap) {
    const srcType = key as ContextSourceType;
    const meta = sourcesMap[srcType];
    if (meta.relevance === 'CRITICAL' || meta.relevance === 'SUPPORTING') {
      selectedSources.push(srcType);
      selectionRationale[srcType] = `Imechaguliwa (${meta.relevance}): ${meta.reason}`;
    } else {
      excludedSources.push(srcType);
      selectionRationale[srcType] = `Imeondolewa (${meta.relevance}): Haikuhitajika kwa nia ya "${needAnalysis.intent}".`;
    }
  }

  // Step 6: Assemble Prompt Context Block with Provenance & Authority
  const contextSections: string[] = [];

  // 6.0 V1.5E Combined Context Reasoning Synthesis (Authority: Cross-Context Synthesis)
  if (combinedReasoningResult && combinedReasoningResult.detected) {
    contextSections.push(
      `--- [MUKTADHA WA PAMOJA / V1.5E COMBINED CONTEXT REASONING (Authority: Cross-Context Synthesis)] ---\n` +
      `Aina ya Muungano wa Vyanzo: ${combinedReasoningResult.intentLabelSwahili}\n` +
      `Lengo Kuu la Uchambuzi: ${combinedReasoningResult.reasoningGoal}\n` +
      `Vyanzo Vikuu Vilivyotumika: ${Array.isArray(combinedReasoningResult.primarySources) ? combinedReasoningResult.primarySources.join(', ') : 'N/A'}\n` +
      (combinedReasoningResult.authoritativeAnchors.farmFacts ? `Ukweli wa Shamba (Records): ${combinedReasoningResult.authoritativeAnchors.farmFacts.summary}\n` : '') +
      (combinedReasoningResult.authoritativeAnchors.commercialFacts ? `Ukweli wa Gulio (Marketplace): ${combinedReasoningResult.authoritativeAnchors.commercialFacts.summary}\n` : '') +
      (combinedReasoningResult.authoritativeAnchors.intelligenceFacts ? `Ukweli wa Msaidizi Wangu: ${combinedReasoningResult.authoritativeAnchors.intelligenceFacts.summary}\n` : '') +
      (combinedReasoningResult.authoritativeAnchors.visualEvidence ? `Ushuhuda wa Kuona: ${combinedReasoningResult.authoritativeAnchors.visualEvidence.summary}\n` : '') +
      (combinedReasoningResult.authoritativeAnchors.profileContext ? `Muktadha wa Eneo: ${combinedReasoningResult.authoritativeAnchors.profileContext.summary}\n` : '') +
      (combinedReasoningResult.medicalSafetyNotice ? `\nILANI YA USALAMA WA KITATIBU:\n${combinedReasoningResult.medicalSafetyNotice}\n` : '') +
      `\nKANUNI ZA MSINGI ZA V1.5E:\n` +
      `- Kila chanzo kinabaki na mamlaka yake binafsi (Source Authority Preservation).\n` +
      `- AI inafanya uchambuzi wa kusoma tu (Read-Only). Kamwe usigeuze makisio kuwa rekodi za daftari au kufanya manunuzi kiotomatiki.\n` +
      `- Soko halina ushawishi wala kupotosha takwimu za Msaidizi Wangu (Independence Verified).`
    );
  }

  // 6.1 Authoritative Structured Data (FACT_SOURCE)
  if (selectedSources.includes('LIVESTOCK_RECORDS') && recordsExtract.text) {
    contextSections.push(
      `--- [CHANZO CHA UKWELI WA DAFTARI / FACT_SOURCE (Authority: Authoritative Structured)] ---\n` +
      `REKODI RASMI ZA MIFUGO:\n${recordsExtract.text}`
    );
  }

  if (selectedSources.includes('LIVESTOCK_HISTORY') && historyExtract.text) {
    contextSections.push(
      `--- [CHANZO CHA UKWELI WA MATUKIO / FACT_SOURCE (Authority: Authoritative Structured)] ---\n` +
      `${historyExtract.text}`
    );
  }

  // 6.2 Derived Intelligence & Authoritative My Assistant (DERIVED_SOURCE / FACT_SOURCE - V1.5B)
  if (selectedSources.includes('MY_ASSISTANT_INTELLIGENCE')) {
    if (myAssistantResult && myAssistantResult.detected) {
      contextSections.push(
        `--- [MAARIFA RASMI YA MSAIDIZI WANGU / V1.5B AUTHORITATIVE INTELLIGENCE (Authority: ${myAssistantResult.authorityLevel})] ---\n` +
        `Nia ya Swali (Intent): ${myAssistantResult.intent}\n` +
        `Kipindi cha Muda (Time Window): ${myAssistantResult.timePeriod.label}\n` +
        `Spishi: ${myAssistantResult.speciesLabel || 'Mifugo yote'}\n` +
        `Ujazo wa Data (Data Sufficiency): ${myAssistantResult.dataSufficiency}\n` +
        (myAssistantResult.eventCount !== undefined ? `Jumla ya Matukio (Event Count): ${myAssistantResult.eventCount}\n` : '') +
        (myAssistantResult.animalQuantity !== undefined ? `Idadi ya Wanyama Waliohusika (Animal Quantity): ${myAssistantResult.animalQuantity}\n` : '') +
        `JIBU RASMI LILILOTHIBITISHWA KIMAHESABU:\n${myAssistantResult.deterministicAnswer}\n` +
        (myAssistantResult.safetyNotice ? `\nILANI YA USALAMA: ${myAssistantResult.safetyNotice}\n` : '') +
        `KANUNI KUU YA AI: Jibu hili limetolewa moja kwa moja kutoka kwenye daftari la Msaidizi Wangu. Usibuni namba au matukio wala kubadilisha hesabu hii.`
      );
    } else if (intelligenceExtract.text) {
      contextSections.push(
        `--- [MAARIFA YALIYOTOKANA NA DATA / DERIVED_SOURCE (Authority: Derived Structured)] ---\n` +
        `${intelligenceExtract.text}`
      );
    }
  }

  // 6.3 Real-Time Module Data (MODULE_SOURCE / V1.5C Authoritative Marketplace)
  if (selectedSources.includes('MARKETPLACE')) {
    if (marketplaceResult && marketplaceResult.detected) {
      contextSections.push(
        `--- [DATA HALISI ZA SOKONI / V1.5C AUTHORITATIVE MARKETPLACE (Authority: Realtime Module)] ---\n` +
        `Nia ya Soko (Commercial Intent): ${marketplaceResult.intent} (Confidence: ${marketplaceResult.confidence})\n` +
        `Aina ya Utafutaji: ${marketplaceResult.targetType}\n` +
        `Maneno Muhimu (Keywords): ${Array.isArray(marketplaceResult.queryKeywords) ? marketplaceResult.queryKeywords.join(', ') : 'N/A'}\n` +
        (marketplaceResult.queryCategory ? `Kundi la Bidhaa: ${marketplaceResult.queryCategory}\n` : '') +
        (marketplaceResult.querySubcategory ? `Kundi Dogo: ${marketplaceResult.querySubcategory}\n` : '') +
        (marketplaceResult.queryLocation ? `Eneo Lililolengwa: ${marketplaceResult.queryLocation}\n` : '') +
        `Upatikanaji wa Data (Data Sufficiency): ${marketplaceResult.dataSufficiency}\n` +
        `Jumla ya Bidhaa Zilizothibitishwa Sokoni: ${marketplaceResult.totalProductsMatched}\n` +
        `Jumla ya Maduka Yaliyothibitishwa: ${marketplaceResult.totalShopsMatched}\n\n` +
        `MATOKEO RASMI YALIYOTHIBITISHWA KUTOKA GULIO LA UFUGAJI UPDATE:\n${marketplaceResult.deterministicAnswer}\n` +
        (marketplaceResult.products && marketplaceResult.products.length > 0 && marketplaceResult.products.some((p: any) => p.trustSignals)
          ? `\nISHARA ZA UAMINIFU (AUTHORITATIVE TRUST SIGNALS):\n` +
            marketplaceResult.products
              .filter((p: any) => p.trustSignals)
              .map((p: any) => formatTrustSignalsForAIContext(p.trustSignals))
              .join('\n\n') + '\n'
          : '') +
        (marketplaceResult.safetyNotice ? `\nILANI YA USALAMA WA KIBIASHARA: ${marketplaceResult.safetyNotice}\n` : '') +
        `KANUNI KUU YA AI: Gulio la Ufugaji Update ndicho chanzo cha ukweli wa kibiashara. Usibuni bei, bidhaa, wala wauzaji wasiokuwepo hapa. Usifanye manunuzi wala ahadi za kiotomatiki.`
      );
    } else if (marketplaceExtract.text) {
      contextSections.push(
        `--- [DATA HALISI ZA SOKONI / MODULE_SOURCE (Authority: Realtime Module)] ---\n` +
        `${marketplaceExtract.text}`
      );
    }
  }

  // 6.4 Visual Evidence (VISUAL_SOURCE)
  if (selectedSources.includes('IMAGE') && imageExtract.text) {
    contextSections.push(
      `--- [USHUHUDA WA PICHA / VISUAL_SOURCE (Authority: Visual Evidence)] ---\n` +
      `${imageExtract.text}`
    );
  }
  if (selectedSources.includes('VIDEO') && videoExtract.text) {
    contextSections.push(
      `--- [USHUHUDA WA VIDEO / VISUAL_SOURCE (Authority: Visual Evidence)] ---\n` +
      `${videoExtract.text}`
    );
  }

  // 6.5 Conversational Context (CONVERSATION_SOURCE)
  if (selectedSources.includes('CONVERSATION') && conversationExtract.text) {
    contextSections.push(
      `--- [MUKTADHA WA MAZUNGUMZO / CONVERSATION_SOURCE (Authority: Conversational)] ---\n` +
      `${conversationExtract.text}`
    );
  }

  // 6.6 Conflicts notice if detected
  if (conflictAnalysis.hasConflict) {
    contextSections.push(
      `--- [ILANI YA TOFAUTI / CONFLICT_WARNING] ---\n` +
      (Array.isArray(conflictAnalysis.notes) ? conflictAnalysis.notes.join('\n') : '')
    );
  }

  // 6.7 Authoritative Daktari Mtaani Kwako (DAKTARI_SOURCE - V1.5G)
  if (selectedSources.includes('DAKTARI') && daktariExtract.text) {
    contextSections.push(daktariExtract.text);
  }

  // Calculate used tokens and budget
  const fullContextText = contextSections.join('\n\n');
  const estimatedUsedTokens = Math.ceil(fullContextText.length / CHARS_PER_TOKEN_ESTIMATE);
  const utilizationPercent = Math.min(100, Math.round((estimatedUsedTokens / maxTokenBudget) * 100));

  // Build the AIContextBundle
  const bundle: AIContextBundle = {
    version: 'V1.5H',
    requestId,
    userId,
    timestamp,
    detectedIntent: needAnalysis.intent,
    detectedTopics: needAnalysis.mentionedSpecies,
    mentionedSpecies: needAnalysis.mentionedSpecies,
    sources: sourcesMap,
    selectedSources,
    excludedSources,
    myAssistantIntelligenceResult: myAssistantResult,
    marketplaceIntelligenceResult: marketplaceResult,
    combinedReasoning: combinedReasoningResult || undefined,
    daktariIntelligenceResult: daktariResult,
    budget: {
      maxTokenBudget,
      usedTokens: estimatedUsedTokens,
      utilizationPercent,
      minimized: fullContextText.length < 12000,
      truncationOccurred: false
    },
    observability: {
      intentConfidence: needAnalysis.confidence,
      selectionRationale,
      degradedSources: [],
      hasConflictWarning: conflictAnalysis.hasConflict,
      conflictNotes: conflictAnalysis.notes
    },
    daktariReadiness: {
      isSupportedInV15A: true,
      architecturalStatus: 'ACTIVE_V15H_INTEGRATED',
      schemaVersion: '1.5H',
      note: 'Phase 4 V1.5H Frozen: Daktari Mtaani Kwako loop is fully integrated. Registration ≠ Verification is strictly enforced and consultation privacy is preserved.'
    }
  };

  // Build Gemini Input Contract Package (Section 30 & V1.5H Frozen Safety Directives)
  const safetyDirectives = [
    '1. CHANZO CHA UKWELI NDICHO KINACHOTAWALA (Source Authority Hierarchy): 1. Rekodi za Daftari la Mifugo (Level 1 FACT) -> 2. My Assistant Intelligence (Level 2 DERIVED) -> 3. Gulio la Ufugaji Update (Level 3 FACT ya Sokoni) -> 4. Daktari Mtaani Kwako (Level 4 FACT ya Profaili) -> 5. Mazungumzo (Level 5 Intent/Statements) -> 6. Ushuhuda wa Picha/Video (Level 6 VISUAL OBSERVATION) -> 7. AI Gemini (Level 7 INTERPRETATION ONLY). AI kamwe haibadilishi au kupinga data ya vyanzo vya juu.',
    '2. FACT LOCKING & ZERO HALLUCINATION: Kamwe usibuni bidhaa za Gulio, bei, wala wauzaji nje ya matokeo ya soko. Ikiwa hakuna daktari aliyesajiliwa kwenye Ufugaji Update katika muktadha (totalMatched: 0 au orodha tupu), eleza wazi na moja kwa moja kuwa KWA SASA HAKUNA DAKTARI ALIYESAJILIWA KWENYE MFUMO WA UFUGAJI UPDATE. KAMWE usitaje, usipendekeze, wala usibuni madaktari kutoka nje ya mfumo au kumbukumbu za mtandao. Mshauri mfugaji kuwasiliana na Afisa Ugani wa serikali wa kata/wilaya yake au kufika kituo cha mifugo kilicho karibu kwa msaada wa moja kwa moja.',
    '3. HAKUNA UTAMBUZI WA UGONJWA WALA MATIBABU (Medical Safety): Picha, video au mazungumzo havitoi utambuzi thabiti wa ugonjwa wala maelekezo ya dawa/dozi/sindano. Elekeza kwa daktari wa mifugo.',
    '4. ZUIA MATENDO YA KIOTOMATIKI (Zero Automatic Actions): AI haipigi simu, haitumi WhatsApp, haiagizi bidhaa wala kufanya malipo. Mfugaji lazima achague mwenyewe kwa kubonyeza kitufe.',
    '5. UTENGANISHO WA AFYA NA BIASHARA: Upatikanaji wa dawa sokoni hauruhusiwi kuwa ushauri wa kitatibu wala dawa hazipendekezwi kutibu vifo au magonjwa bila daktari.',
    '6. USHUHUDA WA KUONA (Visual Evidence): Picha na video ni ushuhuda wa kuona tu, siyo rekodi za daftari wala utambuzi wa kitatibu.',
    '7. V1.5H READ-ONLY GUARANTEE: AI inasoma tu data; hairuhusiwi kuandika wala kurekodi matukio mapya kwenye daftari la mifugo au profaili.',
    '8. DAKTARI MTAANI KWAKO & FARAGHA YA MASHAURIANO: Usajili siyo uthibitisho (Registration ≠ Verification). Madaktari huorodheshwa kwa taarifa zao halisi; AI haipigi simu wala kutuma WhatsApp kiotomatiki, na data za mashauriano ya daktari zinalindwa kwa faragha kamili (Zero Ingestion).',
    '9. UTENGANISHO WA FACT, DERIVED, NA INTERPRETATION: Ufafanuzi wa AI kamwe hauingizwi kama rekodi halisi kwenye Daftari la Mifugo, My Assistant, Gulio, au Daktari bila kibali cha mfugaji.',
    '10. ISHARA ZA UAMINIFU WA GULIO (Marketplace Trust Principle): Kila ishara ya uaminifu ni ushahidi wa sifa mahususi zilizorekodiwa (uthibitisho, duka, bei, hisa, eneo, usafirishaji, tathmini). Kamwe usidai muuzaji au bidhaa ni "100% Guaranteed" au "Dhamana Kamili ya Kila Kitu". Data rasmi za mfumo zinashinda maelezo ya maandishi ya muuzaji endapo kuna ukinzani (Structured System Data > Seller Claims). Ikiwa taarifa haipo, eleza wazi haijawekwa bila kubuni.'
  ];

  if (combinedReasoningResult && combinedReasoningResult.detected && combinedReasoningResult.medicalRestricted) {
    safetyDirectives.push(
      '7. ILANI YA USALAMA WA DAWA (Medical Guardrail): Dawa za mifugo hazipendekezwi sokoni kulingana na vifo au magonjwa. Mwelekeze mfugaji kwa Daktari wa Mifugo (Daktari Mtaani Kwako).'
    );
  }

  let formattedBlock = '';
  if (contextSections.length > 0) {
    formattedBlock =
      `\n\n======================================================================\n` +
      `V1.5A CONTEXT ORCHESTRATION LAYER (THE INTELLIGENT LOOP)\n` +
      `======================================================================\n` +
      `NIA YA SWALI (INTENT): ${needAnalysis.intent}\n` +
      `VYANZO VILIVYOJUMUISHWA: ${Array.isArray(selectedSources) && selectedSources.length > 0 ? selectedSources.join(', ') : 'Hakuna (Swali la jumla)'}\n` +
      `VYANZO VILIVYOONDOLEWA: ${Array.isArray(excludedSources) && excludedSources.length > 0 ? excludedSources.join(', ') : 'Hakuna'}\n\n` +
      fullContextText + `\n\n` +
      `KANUNI ZA USALAMA NA UHALISIA WA DATA:\n` +
      (Array.isArray(safetyDirectives) ? safetyDirectives.join('\n') : '') +
      `\n======================================================================\n`;
  }

  const geminiPackage: GeminiContextPackage = {
    contextBlock: formattedBlock,
    selectedSourcesCount: selectedSources.length,
    provenanceSummary: `V1.5A Context: ${selectedSources.length} sources active (${Array.isArray(selectedSources) ? selectedSources.join(', ') : ''}), ${excludedSources.length} excluded.`,
    safetyDirectives,
    systemPromptAddendum: `\nV1.5A AI Context Orchestrator inatumika. Zingatia vyanzo vya data kulingana na daraja lao la ukweli.`,
    observabilitySummary: {
      intent: needAnalysis.intent,
      includedSources: selectedSources,
      excludedSources,
      estimatedTokens: estimatedUsedTokens
    }
  };

  return { bundle, geminiPackage };
}

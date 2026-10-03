/**
 * V1.5B — AI -> MY ASSISTANT INTELLIGENCE BRIDGE
 * Phase 4: The Intelligent Loop (AI Context Layer)
 *
 * Provides a controlled, read-only integration adapter between the AI Assistant
 * and the authoritative My Assistant Intelligence Layer (V1.4).
 *
 * Core Principles:
 * 1. "My Assistant is the source of farmer intelligence. AI Assistant is the interface
 *    that understands the farmer's question, retrieves the relevant intelligence, and explains the result."
 * 2. AI MUST NOT independently recalculate, guess, or invent farmer intelligence when
 *    authoritative calculations already exist in My Assistant.
 * 3. Thin Integration Interfaces: This module acts strictly as an adapter over existing
 *    V1.4 services. No duplicate business logic or divergent state calculations.
 * 4. Read-Only: AI cannot create, edit, or delete records/events in My Assistant.
 * 5. Medical Safety: Strict adherence to non-diagnostic boundaries (no disease inference,
 *    no cause of death guessing, no veterinary prescription).
 * 6. Deterministic Answers Where Possible: Simple factual queries can be directly answered
 *    from authoritative structured intelligence.
 */

import { LivestockRecord, LivestockEvent } from '../types';
import {
  MyAssistantIntentType,
  MyAssistantDataSufficiency,
  MyAssistantAIIntelligenceResult,
  MyAssistantTimePeriod,
  BridgeAdapterInputParams
} from '../types/aiMyAssistant';
import { TrendTimeWindow } from '../types/livestockIntelligence';
import {
  getLivestockIntelligenceSnapshot,
  getLivestockTrendsSnapshot,
  getLivestockMovementSnapshot,
  getHealthActivityHistorySnapshot,
  getActivitySummarySnapshot,
  getImportantObservationsSnapshot,
  normalizeLivestockTypeName
} from './livestockIntelligenceEngine';
import {
  getHistoryQuestionResult,
  classifyHistoryQuestionIntent,
  parseNaturalTimePeriod,
  extractLivestockSpecies,
  matchRecordToSpecies,
  KNOWN_LIVESTOCK_SPECIES
} from './livestockHistoryQuestionService';

// ==============================================================================
// 1. HELPER UTILITIES FOR ADAPTERS
// ==============================================================================

function getSpeciesLabel(speciesKey: string | null): string {
  if (!speciesKey) return 'mifugo';
  const found = KNOWN_LIVESTOCK_SPECIES.find((s) => s.key === speciesKey);
  return found ? found.swahiliLabel.toLowerCase() : speciesKey;
}

function formatDateDisplay(ymd: string | null | undefined): string {
  if (!ymd) return 'haijatajwa';
  const parts = ymd.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return ymd;
}

function normalizeRequestedWindow(timeWindow?: string | null): '7d' | '30d' | '90d' | '180d' | '365d' | 'all_time' {
  if (!timeWindow) return '30d';
  const w = timeWindow.toLowerCase().trim();
  if (w === '7d' || w === '7' || w === 'week' || w === 'wiki') return '7d';
  if (w === '30d' || w === '30' || w === 'month' || w === 'mwezi') return '30d';
  if (w === '90d' || w === '90' || w === '3months' || w === 'miezi3') return '90d';
  if (w === '180d' || w === '180' || w === '6months' || w === 'miezi6') return '180d';
  if (w === '365d' || w === '365' || w === 'year' || w === 'mwaka') return '365d';
  if (w === 'all' || w === 'all-time' || w === 'all_time') return 'all_time';
  return '30d';
}

function getTimePeriodLabel(window: string): string {
  switch (window) {
    case '7d': return 'siku 7 zilizopita';
    case '30d': return 'siku 30 zilizopita (mwezi huu)';
    case '90d': return 'miezi 3 iliyopita';
    case '180d': return 'miezi 6 iliyopita';
    case '365d': return 'mwaka 1 uliopita';
    case 'all_time': return 'historia yote ya shamba';
    default: return 'kipindi cha karibuni';
  }
}

export function toTrendTimeWindow(rawWindow: string | undefined): TrendTimeWindow {
  if (!rawWindow) return '30d';
  if (rawWindow === '7d' || rawWindow === '30d' || rawWindow === '90d' || rawWindow === '6m' || rawWindow === '12m' || rawWindow === 'custom') {
    return rawWindow as TrendTimeWindow;
  }
  if (rawWindow === '180d') return '6m';
  if (rawWindow === '365d' || rawWindow === 'all_time') return '12m';
  return '30d';
}

// ==============================================================================
// 2. THIN INTEGRATION INTERFACES (V1.5B Section 22)
// ==============================================================================

/**
 * A. CURRENT LIVESTOCK STATE
 * Retrieves current stock balance, starting stock, and group counts.
 */
export function getCurrentLivestockIntelligenceForAI(
  params: BridgeAdapterInputParams
): MyAssistantAIIntelligenceResult {
  const startMs = Date.now();
  const { userId, records = [], recordEventsMap = {}, species } = params;

  if (!records || records.length === 0) {
    return {
      detected: true,
      intent: 'CURRENT_LIVESTOCK',
      confidence: 0.95,
      species: species || null,
      speciesLabel: getSpeciesLabel(species || null),
      timePeriod: { label: 'wakati huu wa sasa', startDate: null, endDate: null },
      provenance: 'FACT',
      source: 'LIVESTOCK_RECORDS',
      authorityLevel: 'AUTHORITATIVE_STRUCTURED',
      dataSufficiency: 'NO_DATA',
      eventCount: 0,
      animalQuantity: 0,
      startingQuantity: 0,
      currentQuantity: 0,
      isDeterministicEligible: true,
      deterministicAnswer: 'Bado hujasajili makundi yoyote ya mifugo kwenye daftari lako la Msaidizi Wangu. Unaweza kusajili kundi jipya kupitia kichupo cha Mifugo Yangu.',
      explanationSwahili: 'Kwenye mfumo wa Msaidizi Wangu hakuna rekodi za mifugo zilizowekwa bado.',
      safetyNotice: null,
      evidence: { totalRecords: 0 },
      observability: {
        serviceCalled: 'getLivestockIntelligenceSnapshot',
        recordCount: 0,
        totalEventsExamined: 0,
        computationDurationMs: Date.now() - startMs
      }
    };
  }

  const snapshot = getLivestockIntelligenceSnapshot(userId, records, recordEventsMap);
  const targetSpecies = species ? species.toLowerCase().trim() : null;

  // Species-specific query
  if (targetSpecies) {
    const matchedType = snapshot.livestockByType.find((t) => {
      const typeKey = (t.livestockType || '').toLowerCase();
      return typeKey.includes(targetSpecies) || targetSpecies.includes(typeKey);
    });

    const targetLabel = getSpeciesLabel(targetSpecies);

    if (!matchedType) {
      return {
        detected: true,
        intent: 'CURRENT_LIVESTOCK',
        confidence: 0.92,
        species: targetSpecies,
        speciesLabel: targetLabel,
        timePeriod: { label: 'wakati huu wa sasa', startDate: null, endDate: null },
        provenance: 'FACT',
        source: 'LIVESTOCK_RECORDS',
        authorityLevel: 'AUTHORITATIVE_STRUCTURED',
        dataSufficiency: 'ZERO_RESULT',
        eventCount: 0,
        animalQuantity: 0,
        startingQuantity: 0,
        currentQuantity: 0,
        isDeterministicEligible: true,
        deterministicAnswer: `Kulingana na daftari lako la Msaidizi Wangu, huna kundi la ${targetLabel} lililosajiliwa kwa sasa.`,
        explanationSwahili: `Hakuna kundi lolote la ${targetLabel} kwenye kumbukumbu zako za Msaidizi Wangu.`,
        safetyNotice: null,
        evidence: { livestockByType: snapshot.livestockByType },
        observability: {
          serviceCalled: 'getLivestockIntelligenceSnapshot',
          recordCount: records.length,
          totalEventsExamined: snapshot.recentActivity.totalEvents,
          computationDurationMs: Date.now() - startMs
        }
      };
    }

    const currentQty = matchedType.currentQuantity;
    const startQty = matchedType.startingQuantity;
    const answer = `Kwa mujibu wa daftari lako la Msaidizi Wangu, kwa sasa una **${targetLabel} ${currentQty}** kwenye makundi ${matchedType.groupCount}. (Kumbukumbu zilianza na ${startQty}, zikaongezeka +${matchedType.additions} na kupungua -${matchedType.reductions}).`;

    return {
      detected: true,
      intent: 'CURRENT_LIVESTOCK',
      confidence: 0.96,
      species: targetSpecies,
      speciesLabel: targetLabel,
      timePeriod: { label: 'wakati huu wa sasa', startDate: null, endDate: null },
      provenance: 'FACT',
      source: 'LIVESTOCK_RECORDS',
      authorityLevel: 'AUTHORITATIVE_STRUCTURED',
      dataSufficiency: 'SUFFICIENT',
      eventCount: matchedType.eventCount,
      animalQuantity: currentQty,
      startingQuantity: startQty,
      currentQuantity: currentQty,
      isDeterministicEligible: true,
      deterministicAnswer: answer,
      explanationSwahili: answer,
      safetyNotice: null,
      evidence: matchedType,
      observability: {
        serviceCalled: 'getLivestockIntelligenceSnapshot',
        recordCount: matchedType.groupCount,
        totalEventsExamined: matchedType.eventCount,
        computationDurationMs: Date.now() - startMs
      }
    };
  }

  // Farm-wide overall stock balance
  const totalCurrent = snapshot.totalLivestock;
  const totalStarting = snapshot.totalStartingLivestock;
  const breakdownParts = snapshot.livestockByType.map((t) => `${t.livestockType.toLowerCase()} ${t.currentQuantity}`);
  const breakdownStr = breakdownParts.length > 0 ? ` (${breakdownParts.join(', ')})` : '';

  const answer = `Kwa mujibu wa daftari la Msaidizi Wangu, kwa sasa una **jumla ya mifugo ${totalCurrent}** kwenye makundi ${snapshot.totalRecords}${breakdownStr}.`;

  return {
    detected: true,
    intent: 'CURRENT_LIVESTOCK',
    confidence: 0.96,
    species: null,
    speciesLabel: 'mifugo yote',
    timePeriod: { label: 'wakati huu wa sasa', startDate: null, endDate: null },
    provenance: 'FACT',
    source: 'LIVESTOCK_RECORDS',
    authorityLevel: 'AUTHORITATIVE_STRUCTURED',
    dataSufficiency: 'SUFFICIENT',
    eventCount: snapshot.recentActivity.totalEvents,
    animalQuantity: totalCurrent,
    startingQuantity: totalStarting,
    currentQuantity: totalCurrent,
    isDeterministicEligible: true,
    deterministicAnswer: answer,
    explanationSwahili: answer,
    safetyNotice: null,
    evidence: { totalLivestock: totalCurrent, totalStartingLivestock: totalStarting, livestockByType: snapshot.livestockByType },
    observability: {
      serviceCalled: 'getLivestockIntelligenceSnapshot',
      recordCount: snapshot.totalRecords,
      totalEventsExamined: snapshot.recentActivity.totalEvents,
      computationDurationMs: Date.now() - startMs
    }
  };
}

/**
 * B. LIVESTOCK TRENDS
 * Retrieves trend analysis over a requested time window.
 */
export function getLivestockTrendForAI(
  params: BridgeAdapterInputParams
): MyAssistantAIIntelligenceResult {
  const startMs = Date.now();
  const { userId, records = [], recordEventsMap = {}, species, timeWindow } = params;
  const canonicalWindow = normalizeRequestedWindow(timeWindow);
  const periodLabel = getTimePeriodLabel(canonicalWindow);

  if (!records || records.length === 0) {
    return {
      detected: true,
      intent: 'LIVESTOCK_TREND',
      confidence: 0.9,
      species: species || null,
      timePeriod: { label: periodLabel, canonicalWindow, startDate: null, endDate: null },
      provenance: 'DERIVED_INTELLIGENCE',
      source: 'MY_ASSISTANT_INTELLIGENCE',
      authorityLevel: 'DERIVED_STRUCTURED',
      dataSufficiency: 'NO_DATA',
      eventCount: 0,
      animalQuantity: null,
      isDeterministicEligible: true,
      deterministicAnswer: `Hakuna rekodi za mifugo zilizopo ili kutathmini mwelekeo katika ${periodLabel}.`,
      explanationSwahili: 'Hakuna rekodi zilizopo za mifugo.',
      safetyNotice: null,
      evidence: null,
      observability: {
        serviceCalled: 'getLivestockTrendsSnapshot',
        recordCount: 0,
        totalEventsExamined: 0,
        computationDurationMs: Date.now() - startMs
      }
    };
  }

  const trendsSnapshot = getLivestockTrendsSnapshot(userId, records, recordEventsMap, { timeWindow: toTrendTimeWindow(canonicalWindow) });
  const targetSpecies = species ? species.toLowerCase().trim() : null;
  const targetLabel = getSpeciesLabel(targetSpecies);

  let trendItem = trendsSnapshot.overallFarmTrend;
  if (targetSpecies) {
    const match = trendsSnapshot.typeTrends.find((t) =>
      (t.livestockType || '').toLowerCase().includes(targetSpecies) || targetSpecies.includes((t.livestockType || '').toLowerCase())
    );
    if (match) {
      trendItem = match;
    }
  }

  if (!trendItem) {
    const answer = `Katika **${periodLabel}**, hakuna data ya kutosha kutathmini mwelekeo wa ${targetLabel}.`;
    return {
      detected: true,
      intent: 'LIVESTOCK_TREND',
      confidence: 0.9,
      species: targetSpecies,
      speciesLabel: targetLabel,
      timePeriod: {
        label: periodLabel,
        canonicalWindow,
        startDate: trendsSnapshot.startDate,
        endDate: trendsSnapshot.endDate
      },
      provenance: 'DERIVED_INTELLIGENCE',
      source: 'MY_ASSISTANT_INTELLIGENCE',
      authorityLevel: 'DERIVED_STRUCTURED',
      dataSufficiency: 'INSUFFICIENT',
      eventCount: 0,
      animalQuantity: null,
      isDeterministicEligible: true,
      deterministicAnswer: answer,
      explanationSwahili: answer,
      safetyNotice: null,
      evidence: null,
      observability: {
        serviceCalled: 'getLivestockTrendsSnapshot',
        recordCount: records.length,
        totalEventsExamined: 0,
        computationDurationMs: Date.now() - startMs
      }
    };
  }

  const netChange = trendItem.netChange;
  const startBalance = trendItem.startingKnownCount;
  const endBalance = trendItem.endingKnownCount;
  const pct = startBalance > 0 ? Math.round((Math.abs(netChange) / startBalance) * 100) : 0;
  const eventsInWindow = trendItem.supportingEvents?.totalEventsInWindow || 0;

  let directionText = '';
  if (trendItem.direction === 'INCREASING') {
    directionText = `idadi ya ${targetLabel} **imeongezeka kwa ${netChange}** (kutoka ${startBalance} hadi ${endBalance}, ongezeko la +${pct}%)`;
  } else if (trendItem.direction === 'DECREASING') {
    directionText = `idadi ya ${targetLabel} **imepungua kwa ${Math.abs(netChange)}** (kutoka ${startBalance} hadi ${endBalance}, upungufu wa -${pct}%)`;
  } else if (trendItem.direction === 'STABLE') {
    directionText = `idadi ya ${targetLabel} **imebaki thabiti** (${startBalance} hadi ${endBalance})`;
  } else {
    directionText = `hakukuwa na mabadiliko au matukio ya kutosha yaliyorekodiwa kutathmini mwelekeo kwa uhakika`;
  }

  const answer = `Katika **${periodLabel}**, kulingana na takwimu za Msaidizi Wangu, ${directionText}.`;

  return {
    detected: true,
    intent: 'LIVESTOCK_TREND',
    confidence: 0.94,
    species: targetSpecies,
    speciesLabel: targetLabel,
    timePeriod: {
      label: periodLabel,
      canonicalWindow,
      startDate: trendsSnapshot.startDate,
      endDate: trendsSnapshot.endDate
    },
    provenance: 'DERIVED_INTELLIGENCE',
    source: 'MY_ASSISTANT_INTELLIGENCE',
    authorityLevel: 'DERIVED_STRUCTURED',
    dataSufficiency: trendItem.dataSufficiency,
    eventCount: eventsInWindow,
    animalQuantity: netChange,
    startingQuantity: startBalance,
    currentQuantity: endBalance,
    isDeterministicEligible: true,
    deterministicAnswer: answer,
    explanationSwahili: answer,
    safetyNotice: 'Uchambuzi huu unatokana na matukio yaliyorekodiwa kihistoria kwenye daftari lako na haujumuishi utabiri wa kibinafsi au makisio ya mbeleni.',
    evidence: trendItem,
    observability: {
      serviceCalled: 'getLivestockTrendsSnapshot',
      recordCount: records.length,
      totalEventsExamined: eventsInWindow,
      computationDurationMs: Date.now() - startMs
    }
  };
}

/**
 * C. ADDITIONS INTELLIGENCE
 * Retrieves verified addition events, newly acquired/born animals.
 */
export function getAdditionIntelligenceForAI(
  params: BridgeAdapterInputParams
): MyAssistantAIIntelligenceResult {
  const startMs = Date.now();
  const { userId, records = [], recordEventsMap = {}, species, timeWindow } = params;
  const canonicalWindow = normalizeRequestedWindow(timeWindow);
  const periodLabel = getTimePeriodLabel(canonicalWindow);

  const movementSnapshot = getLivestockMovementSnapshot(userId, records, recordEventsMap, { timeWindow: toTrendTimeWindow(canonicalWindow) });
  const targetSpecies = species ? species.toLowerCase().trim() : null;
  const targetLabel = getSpeciesLabel(targetSpecies);

  let additions = movementSnapshot.additions;
  if (targetSpecies) {
    const match = movementSnapshot.typeMovements.find((t) =>
      t.livestockType.toLowerCase().includes(targetSpecies) || targetSpecies.includes(t.livestockType.toLowerCase())
    );
    if (match) {
      additions = match.additions;
    }
  }

  const animalCount = additions.total;
  const eventCount = additions.eventCount;

  if (eventCount === 0 || animalCount === 0) {
    const answer = `Katika **${periodLabel}**, hakuna matukio ya kuongeza ${targetLabel} yaliyorekodiwa kwenye daftari lako.`;
    return {
      detected: true,
      intent: 'ADDITIONS',
      confidence: 0.94,
      species: targetSpecies,
      speciesLabel: targetLabel,
      timePeriod: { label: periodLabel, canonicalWindow, startDate: movementSnapshot.startDate, endDate: movementSnapshot.endDate },
      provenance: 'FACT',
      source: 'MY_ASSISTANT_INTELLIGENCE',
      authorityLevel: 'AUTHORITATIVE_STRUCTURED',
      dataSufficiency: 'ZERO_RESULT',
      eventCount: 0,
      animalQuantity: 0,
      isDeterministicEligible: true,
      deterministicAnswer: answer,
      explanationSwahili: answer,
      safetyNotice: null,
      evidence: additions,
      observability: {
        serviceCalled: 'getLivestockMovementSnapshot',
        recordCount: records.length,
        totalEventsExamined: eventCount,
        computationDurationMs: Date.now() - startMs
      }
    };
  }

  const breakdownParts: string[] = [];
  if (additions.births > 0) breakdownParts.push(`vizazi: ${additions.births}`);
  if (additions.purchases > 0) breakdownParts.push(`manunuzi: ${additions.purchases}`);
  if (additions.otherAdditions > 0) breakdownParts.push(`nyongeza nyingine: ${additions.otherAdditions}`);
  const breakdownStr = breakdownParts.length > 0 ? ` (${breakdownParts.join(', ')})` : '';

  const answer = `Katika **${periodLabel}**, umerekodi **kuongeza ${targetLabel} ${animalCount}** kupitia **matukio ${eventCount}** ya nyongeza${breakdownStr}.`;

  return {
    detected: true,
    intent: 'ADDITIONS',
    confidence: 0.96,
    species: targetSpecies,
    speciesLabel: targetLabel,
    timePeriod: { label: periodLabel, canonicalWindow, startDate: movementSnapshot.startDate, endDate: movementSnapshot.endDate },
    provenance: 'FACT',
    source: 'MY_ASSISTANT_INTELLIGENCE',
    authorityLevel: 'AUTHORITATIVE_STRUCTURED',
    dataSufficiency: 'SUFFICIENT',
    eventCount,
    animalQuantity: animalCount,
    isDeterministicEligible: true,
    deterministicAnswer: answer,
    explanationSwahili: answer,
    safetyNotice: null,
    evidence: additions,
    observability: {
      serviceCalled: 'getLivestockMovementSnapshot',
      recordCount: records.length,
      totalEventsExamined: eventCount,
      computationDurationMs: Date.now() - startMs
    }
  };
}

/**
 * D. REDUCTIONS INTELLIGENCE
 * Retrieves verified reduction events (sales, slaughters, transfers out, etc.).
 */
export function getReductionIntelligenceForAI(
  params: BridgeAdapterInputParams
): MyAssistantAIIntelligenceResult {
  const startMs = Date.now();
  const { userId, records = [], recordEventsMap = {}, species, timeWindow } = params;
  const canonicalWindow = normalizeRequestedWindow(timeWindow);
  const periodLabel = getTimePeriodLabel(canonicalWindow);

  const movementSnapshot = getLivestockMovementSnapshot(userId, records, recordEventsMap, { timeWindow: toTrendTimeWindow(canonicalWindow) });
  const targetSpecies = species ? species.toLowerCase().trim() : null;
  const targetLabel = getSpeciesLabel(targetSpecies);

  let reductions = movementSnapshot.reductions;
  if (targetSpecies) {
    const match = movementSnapshot.typeMovements.find((t) =>
      t.livestockType.toLowerCase().includes(targetSpecies) || targetSpecies.includes(t.livestockType.toLowerCase())
    );
    if (match) {
      reductions = match.reductions;
    }
  }

  const animalCount = reductions.total;
  const eventCount = reductions.eventCount;

  if (eventCount === 0 || animalCount === 0) {
    const answer = `Katika **${periodLabel}**, hakuna matukio ya kupunguza ${targetLabel} yaliyorekodiwa kwenye daftari lako.`;
    return {
      detected: true,
      intent: 'REDUCTIONS',
      confidence: 0.94,
      species: targetSpecies,
      speciesLabel: targetLabel,
      timePeriod: { label: periodLabel, canonicalWindow, startDate: movementSnapshot.startDate, endDate: movementSnapshot.endDate },
      provenance: 'FACT',
      source: 'MY_ASSISTANT_INTELLIGENCE',
      authorityLevel: 'AUTHORITATIVE_STRUCTURED',
      dataSufficiency: 'ZERO_RESULT',
      eventCount: 0,
      animalQuantity: 0,
      isDeterministicEligible: true,
      deterministicAnswer: answer,
      explanationSwahili: answer,
      safetyNotice: null,
      evidence: reductions,
      observability: {
        serviceCalled: 'getLivestockMovementSnapshot',
        recordCount: records.length,
        totalEventsExamined: eventCount,
        computationDurationMs: Date.now() - startMs
      }
    };
  }

  const breakdownParts: string[] = [];
  if (reductions.sales > 0) breakdownParts.push(`mauzo: ${reductions.sales}`);
  if (reductions.mortality > 0) breakdownParts.push(`vifo: ${reductions.mortality}`);
  if (reductions.otherReductions > 0) breakdownParts.push(`punguzo lingine: ${reductions.otherReductions}`);
  const breakdownStr = breakdownParts.length > 0 ? ` (${breakdownParts.join(', ')})` : '';

  const answer = `Katika **${periodLabel}**, umerekodi **kupunguza ${targetLabel} ${animalCount}** kupitia **matukio ${eventCount}**${breakdownStr}.`;

  return {
    detected: true,
    intent: 'REDUCTIONS',
    confidence: 0.96,
    species: targetSpecies,
    speciesLabel: targetLabel,
    timePeriod: { label: periodLabel, canonicalWindow, startDate: movementSnapshot.startDate, endDate: movementSnapshot.endDate },
    provenance: 'FACT',
    source: 'MY_ASSISTANT_INTELLIGENCE',
    authorityLevel: 'AUTHORITATIVE_STRUCTURED',
    dataSufficiency: 'SUFFICIENT',
    eventCount,
    animalQuantity: animalCount,
    isDeterministicEligible: true,
    deterministicAnswer: answer,
    explanationSwahili: answer,
    safetyNotice: null,
    evidence: reductions,
    observability: {
      serviceCalled: 'getLivestockMovementSnapshot',
      recordCount: records.length,
      totalEventsExamined: eventCount,
      computationDurationMs: Date.now() - startMs
    }
  };
}

/**
 * E. MORTALITY INTELLIGENCE
 * Strictly reports recorded death counts and event timelines without medical inference.
 */
export function getMortalityIntelligenceForAI(
  params: BridgeAdapterInputParams
): MyAssistantAIIntelligenceResult {
  const startMs = Date.now();
  const { userId, records = [], recordEventsMap = {}, species, timeWindow } = params;
  const canonicalWindow = normalizeRequestedWindow(timeWindow);
  const periodLabel = getTimePeriodLabel(canonicalWindow);

  const movementSnapshot = getLivestockMovementSnapshot(userId, records, recordEventsMap, { timeWindow: toTrendTimeWindow(canonicalWindow) });
  const targetSpecies = species ? species.toLowerCase().trim() : null;
  const targetLabel = getSpeciesLabel(targetSpecies);

  let lostCount = movementSnapshot.mortality.totalMortalityCount;
  let eventCount = movementSnapshot.mortality.mortalityEventCount;

  if (targetSpecies) {
    const match = movementSnapshot.typeMovements.find((t) =>
      t.livestockType.toLowerCase().includes(targetSpecies) || targetSpecies.includes(t.livestockType.toLowerCase())
    );
    if (match) {
      lostCount = match.mortalityCount;
      eventCount = match.reductions.eventCount;
    }
  }

  const safetyDisclaimer = 'Kumbuka: Rekodi hizi zinatokana na matukio uliyoweka kwenye daftari lako na hazibainishi chanzo cha kifo, ugonjwa, wala kutoa utambuzi wa kitabibu bila daktari wa mifugo.';

  if (lostCount === 0) {
    const answer = `Katika **${periodLabel}**, hakuna matukio ya vifo vya ${targetLabel} yaliyorekodiwa kwenye daftari lako la Msaidizi Wangu.`;
    return {
      detected: true,
      intent: 'MORTALITY',
      confidence: 0.95,
      species: targetSpecies,
      speciesLabel: targetLabel,
      timePeriod: { label: periodLabel, canonicalWindow, startDate: movementSnapshot.startDate, endDate: movementSnapshot.endDate },
      provenance: 'FACT',
      source: 'MY_ASSISTANT_INTELLIGENCE',
      authorityLevel: 'AUTHORITATIVE_STRUCTURED',
      dataSufficiency: 'ZERO_RESULT',
      eventCount: 0,
      animalQuantity: 0,
      isDeterministicEligible: true,
      deterministicAnswer: answer,
      explanationSwahili: answer,
      safetyNotice: safetyDisclaimer,
      evidence: movementSnapshot.mortality,
      observability: {
        serviceCalled: 'getLivestockMovementSnapshot',
        recordCount: records.length,
        totalEventsExamined: 0,
        computationDurationMs: Date.now() - startMs
      }
    };
  }

  const answer = `Katika **${periodLabel}**, kulingana na daftari la Msaidizi Wangu, umerekodi **vifo ${lostCount} vya ${targetLabel}** kupitia **matukio ${eventCount}** ya vifo.`;

  return {
    detected: true,
    intent: 'MORTALITY',
    confidence: 0.96,
    species: targetSpecies,
    speciesLabel: targetLabel,
    timePeriod: { label: periodLabel, canonicalWindow, startDate: movementSnapshot.startDate, endDate: movementSnapshot.endDate },
    provenance: 'FACT',
    source: 'MY_ASSISTANT_INTELLIGENCE',
    authorityLevel: 'AUTHORITATIVE_STRUCTURED',
    dataSufficiency: 'SUFFICIENT',
    eventCount,
    animalQuantity: lostCount,
    isDeterministicEligible: true,
    deterministicAnswer: answer,
    explanationSwahili: answer,
    safetyNotice: safetyDisclaimer,
    evidence: movementSnapshot.mortality,
    observability: {
      serviceCalled: 'getLivestockMovementSnapshot',
      recordCount: records.length,
      totalEventsExamined: eventCount,
      computationDurationMs: Date.now() - startMs
    }
  };
}

/**
 * F. VACCINATION HISTORY
 * Retrieves recorded vaccination events, dates, and medicine names.
 */
export function getVaccinationHistoryForAI(
  params: BridgeAdapterInputParams
): MyAssistantAIIntelligenceResult {
  const startMs = Date.now();
  const { userId, records = [], recordEventsMap = {}, species, timeWindow } = params;
  const canonicalWindow = normalizeRequestedWindow(timeWindow);
  const periodLabel = getTimePeriodLabel(canonicalWindow);

  const healthSnapshot = getHealthActivityHistorySnapshot(userId, records, recordEventsMap, { timeWindow: toTrendTimeWindow(canonicalWindow) });
  const targetSpecies = species ? species.toLowerCase().trim() : null;
  const targetLabel = getSpeciesLabel(targetSpecies);

  const vax = healthSnapshot.vaccination;
  let matchingEvents = vax.events;
  if (targetSpecies) {
    matchingEvents = vax.events.filter((e) =>
      (e.livestockType || '').toLowerCase().includes(targetSpecies) || targetSpecies.includes((e.livestockType || '').toLowerCase())
    );
  }

  const eventCount = matchingEvents.length;
  const safetyNotice = 'Taarifa za chanjo ni kumbukumbu za matukio uliyoweka kwenye daftari lako; AI haitoi ushauri wa dawa, maagizo ya vipimo wala ratiba mpya bila daktari wa mifugo.';

  if (eventCount === 0) {
    const answer = `Katika **${periodLabel}**, hakuna matukio ya chanjo kwa **${targetLabel}** yaliyorekodiwa kwenye daftari lako la Msaidizi Wangu.`;
    return {
      detected: true,
      intent: 'VACCINATION',
      confidence: 0.95,
      species: targetSpecies,
      speciesLabel: targetLabel,
      timePeriod: { label: periodLabel, canonicalWindow, startDate: healthSnapshot.startDate, endDate: healthSnapshot.endDate },
      provenance: 'FACT',
      source: 'MY_ASSISTANT_INTELLIGENCE',
      authorityLevel: 'AUTHORITATIVE_STRUCTURED',
      dataSufficiency: 'ZERO_RESULT',
      eventCount: 0,
      animalQuantity: 0,
      isDeterministicEligible: true,
      deterministicAnswer: answer,
      explanationSwahili: answer,
      safetyNotice,
      evidence: vax,
      observability: {
        serviceCalled: 'getHealthActivityHistorySnapshot',
        recordCount: records.length,
        totalEventsExamined: eventCount,
        computationDurationMs: Date.now() - startMs
      }
    };
  }

  const latestEvt = matchingEvents[0];
  let answer = `Katika **${periodLabel}**, umerekodi **matukio ${eventCount} ya chanjo** kwa **${targetLabel}**.`;
  if (latestEvt) {
    answer += `\n- **Chanjo ya mwisho:** Tarehe ${formatDateDisplay(latestEvt.eventDate)}`;
    if (latestEvt.recordedVaccineName) answer += ` (Dawa/Chanjo: ${latestEvt.recordedVaccineName})`;
  }

  return {
    detected: true,
    intent: 'VACCINATION',
    confidence: 0.96,
    species: targetSpecies,
    speciesLabel: targetLabel,
    timePeriod: { label: periodLabel, canonicalWindow, startDate: healthSnapshot.startDate, endDate: healthSnapshot.endDate },
    provenance: 'FACT',
    source: 'MY_ASSISTANT_INTELLIGENCE',
    authorityLevel: 'AUTHORITATIVE_STRUCTURED',
    dataSufficiency: 'SUFFICIENT',
    eventCount,
    animalQuantity: vax.totalAnimalsVaccinatedRaw,
    isDeterministicEligible: true,
    deterministicAnswer: answer,
    explanationSwahili: answer,
    safetyNotice,
    evidence: { vaxSummary: vax.totalAnimalsVaccinatedByType, latest: latestEvt },
    observability: {
      serviceCalled: 'getHealthActivityHistorySnapshot',
      recordCount: records.length,
      totalEventsExamined: eventCount,
      computationDurationMs: Date.now() - startMs
    }
  };
}

/**
 * G. TREATMENT HISTORY
 * Retrieves recorded medical treatments, medicines used, and dates.
 */
export function getTreatmentHistoryForAI(
  params: BridgeAdapterInputParams
): MyAssistantAIIntelligenceResult {
  const startMs = Date.now();
  const { userId, records = [], recordEventsMap = {}, species, timeWindow } = params;
  const canonicalWindow = normalizeRequestedWindow(timeWindow);
  const periodLabel = getTimePeriodLabel(canonicalWindow);

  const healthSnapshot = getHealthActivityHistorySnapshot(userId, records, recordEventsMap, { timeWindow: toTrendTimeWindow(canonicalWindow) });
  const targetSpecies = species ? species.toLowerCase().trim() : null;
  const targetLabel = getSpeciesLabel(targetSpecies);

  const treatments = healthSnapshot.treatment;
  let matchingEvents = treatments.events;
  if (targetSpecies) {
    matchingEvents = treatments.events.filter((e) =>
      (e.livestockType || '').toLowerCase().includes(targetSpecies) || targetSpecies.includes((e.livestockType || '').toLowerCase())
    );
  }

  const eventCount = matchingEvents.length;
  const safetyNotice = 'Kumbuka: Kumbukumbu za matibabu ni matukio ya kihistoria tu na hazithibitishi utambuzi rasmi wa ugonjwa wala hazichukui nafasi ya ushauri wa daktari wa mifugo.';

  if (eventCount === 0) {
    const answer = `Katika **${periodLabel}**, hakuna matukio ya matibabu (treatment) kwa **${targetLabel}** yaliyorekodiwa kwenye daftari lako.`;
    return {
      detected: true,
      intent: 'TREATMENT',
      confidence: 0.95,
      species: targetSpecies,
      speciesLabel: targetLabel,
      timePeriod: { label: periodLabel, canonicalWindow, startDate: healthSnapshot.startDate, endDate: healthSnapshot.endDate },
      provenance: 'FACT',
      source: 'MY_ASSISTANT_INTELLIGENCE',
      authorityLevel: 'AUTHORITATIVE_STRUCTURED',
      dataSufficiency: 'ZERO_RESULT',
      eventCount: 0,
      animalQuantity: 0,
      isDeterministicEligible: true,
      deterministicAnswer: answer,
      explanationSwahili: answer,
      safetyNotice,
      evidence: treatments,
      observability: {
        serviceCalled: 'getHealthActivityHistorySnapshot',
        recordCount: records.length,
        totalEventsExamined: eventCount,
        computationDurationMs: Date.now() - startMs
      }
    };
  }

  const latestEvt = matchingEvents[0];
  let answer = `Katika **${periodLabel}**, umerekodi **matukio ${eventCount} ya matibabu (treatment)** kwa **${targetLabel}**.`;
  if (latestEvt) {
    answer += `\n- **Tiba ya mwisho:** Tarehe ${formatDateDisplay(latestEvt.eventDate)}`;
    if (latestEvt.recordedMedicineName) answer += ` (Dawa: ${latestEvt.recordedMedicineName})`;
  }

  return {
    detected: true,
    intent: 'TREATMENT',
    confidence: 0.96,
    species: targetSpecies,
    speciesLabel: targetLabel,
    timePeriod: { label: periodLabel, canonicalWindow, startDate: healthSnapshot.startDate, endDate: healthSnapshot.endDate },
    provenance: 'FACT',
    source: 'MY_ASSISTANT_INTELLIGENCE',
    authorityLevel: 'AUTHORITATIVE_STRUCTURED',
    dataSufficiency: 'SUFFICIENT',
    eventCount,
    animalQuantity: treatments.totalAnimalsTreatedRaw,
    isDeterministicEligible: true,
    deterministicAnswer: answer,
    explanationSwahili: answer,
    safetyNotice,
    evidence: { treatmentSummary: treatments.totalAnimalsTreatedByType, latest: latestEvt },
    observability: {
      serviceCalled: 'getHealthActivityHistorySnapshot',
      recordCount: records.length,
      totalEventsExamined: eventCount,
      computationDurationMs: Date.now() - startMs
    }
  };
}

/**
 * H. ACTIVITY SUMMARY
 * Retrieves aggregate farm activities breakdown and busiest periods.
 */
export function getActivitySummaryForAI(
  params: BridgeAdapterInputParams
): MyAssistantAIIntelligenceResult {
  const startMs = Date.now();
  const { userId, records = [], recordEventsMap = {}, timeWindow } = params;
  const canonicalWindow = normalizeRequestedWindow(timeWindow);
  const periodLabel = getTimePeriodLabel(canonicalWindow);

  const actSnapshot = getActivitySummarySnapshot(userId, records, recordEventsMap, { timeWindow: toTrendTimeWindow(canonicalWindow) });
  const totalEvents = actSnapshot.totalActivitiesCount;

  if (totalEvents === 0) {
    const answer = `Katika **${periodLabel}**, hakuna shughuli au matukio yoyote yaliyorekodiwa kwenye daftari lako la Msaidizi Wangu.`;
    return {
      detected: true,
      intent: 'ACTIVITY_SUMMARY',
      confidence: 0.94,
      species: null,
      timePeriod: { label: periodLabel, canonicalWindow, startDate: actSnapshot.startDate, endDate: actSnapshot.endDate },
      provenance: 'DERIVED_INTELLIGENCE',
      source: 'MY_ASSISTANT_INTELLIGENCE',
      authorityLevel: 'DERIVED_STRUCTURED',
      dataSufficiency: 'ZERO_RESULT',
      eventCount: 0,
      animalQuantity: null,
      isDeterministicEligible: true,
      deterministicAnswer: answer,
      explanationSwahili: answer,
      safetyNotice: null,
      evidence: actSnapshot,
      observability: {
        serviceCalled: 'getActivitySummarySnapshot',
        recordCount: records.length,
        totalEventsExamined: 0,
        computationDurationMs: Date.now() - startMs
      }
    };
  }

  const topCats = Object.values(actSnapshot.rollup.byCanonicalCategory)
    .filter((c) => c.eventCount > 0)
    .map((c) => `${c.labelSwahili.toLowerCase()}: ${c.eventCount}`);
  const catSummaryStr = topCats.length > 0 ? ` (shughuli kuu: ${topCats.join(', ')})` : '';

  let answer = `Katika **${periodLabel}**, umerekodi **jumla ya shughuli ${totalEvents}** kwenye shamba lako${catSummaryStr}.`;
  if (actSnapshot.busiestPeriod && actSnapshot.busiestPeriod.label) {
    answer += `\n- **Kipindi chenye shughuli nyingi zaidi:** ${actSnapshot.busiestPeriod.label} (matukio ${actSnapshot.busiestPeriod.eventCount})`;
  }

  return {
    detected: true,
    intent: 'ACTIVITY_SUMMARY',
    confidence: 0.95,
    species: null,
    timePeriod: { label: periodLabel, canonicalWindow, startDate: actSnapshot.startDate, endDate: actSnapshot.endDate },
    provenance: 'DERIVED_INTELLIGENCE',
    source: 'MY_ASSISTANT_INTELLIGENCE',
    authorityLevel: 'DERIVED_STRUCTURED',
    dataSufficiency: 'SUFFICIENT',
    eventCount: totalEvents,
    animalQuantity: null,
    isDeterministicEligible: true,
    deterministicAnswer: answer,
    explanationSwahili: answer,
    safetyNotice: null,
    evidence: actSnapshot,
    observability: {
      serviceCalled: 'getActivitySummarySnapshot',
      recordCount: records.length,
      totalEventsExamined: totalEvents,
      computationDurationMs: Date.now() - startMs
    }
  };
}

/**
 * I. IMPORTANT OBSERVATIONS
 * Retrieves deterministic, rule-based observations computed by My Assistant.
 */
export function getImportantObservationsForAI(
  params: BridgeAdapterInputParams
): MyAssistantAIIntelligenceResult {
  const startMs = Date.now();
  const { userId, records = [], recordEventsMap = {} } = params;

  const obsSnapshot = getImportantObservationsSnapshot(userId, records, recordEventsMap);
  const observations = obsSnapshot.observations;

  if (observations.length === 0) {
    const answer = 'Kulingana na daftari lako la Msaidizi Wangu, hakuna angalizo lolote lisilo la kawaida lililobainika kwa sasa.';
    return {
      detected: true,
      intent: 'IMPORTANT_OBSERVATIONS',
      confidence: 0.92,
      species: null,
      timePeriod: { label: 'hivi karibuni', startDate: null, endDate: null },
      provenance: 'OBSERVATION',
      source: 'MY_ASSISTANT_INTELLIGENCE',
      authorityLevel: 'DERIVED_STRUCTURED',
      dataSufficiency: 'SUFFICIENT',
      eventCount: 0,
      animalQuantity: null,
      isDeterministicEligible: true,
      deterministicAnswer: answer,
      explanationSwahili: answer,
      safetyNotice: null,
      evidence: observations,
      observability: {
        serviceCalled: 'getImportantObservationsSnapshot',
        recordCount: records.length,
        totalEventsExamined: 0,
        computationDurationMs: Date.now() - startMs
      }
    };
  }

  const lines: string[] = ['Hapa kuna mambo muhimu yaliyobainika kutoka kwenye kumbukumbu zako za Msaidizi Wangu:\n'];
  for (const obs of observations.slice(0, 3)) {
    lines.push(`• **${obs.title}**: ${obs.summary}`);
  }
  const answer = lines.join('\n');

  return {
    detected: true,
    intent: 'IMPORTANT_OBSERVATIONS',
    confidence: 0.94,
    species: null,
    timePeriod: { label: 'hivi karibuni', startDate: null, endDate: null },
    provenance: 'OBSERVATION',
    source: 'MY_ASSISTANT_INTELLIGENCE',
    authorityLevel: 'DERIVED_STRUCTURED',
    dataSufficiency: 'SUFFICIENT',
    eventCount: observations.length,
    animalQuantity: null,
    isDeterministicEligible: true,
    deterministicAnswer: answer,
    explanationSwahili: answer,
    safetyNotice: 'Angalizo hizi zinatokana na uchambuzi wa takwimu za daftari lako na hazihusishi utambuzi wa ugonjwa.',
    evidence: observations,
    observability: {
      serviceCalled: 'getImportantObservationsSnapshot',
      recordCount: records.length,
      totalEventsExamined: observations.length,
      computationDurationMs: Date.now() - startMs
    }
  };
}

/**
 * J. FARM INSIGHTS
 * Retrieves evidence-based farm patterns detected by My Assistant.
 */
export function getFarmInsightsForAI(
  params: BridgeAdapterInputParams
): MyAssistantAIIntelligenceResult {
  const startMs = Date.now();
  const { userId, records = [], recordEventsMap = {} } = params;

  const obsSnapshot = getImportantObservationsSnapshot(userId, records, recordEventsMap);
  const insights = obsSnapshot.insights;

  if (insights.length === 0) {
    const answer = 'Kulingana na data iliyopo, bado hakuna mwelekeo au pattern ya kipekee iliyobainika kwenye historia ya shamba lako.';
    return {
      detected: true,
      intent: 'FARM_INSIGHTS',
      confidence: 0.9,
      species: null,
      timePeriod: { label: 'hivi karibuni', startDate: null, endDate: null },
      provenance: 'FARM_INSIGHT',
      source: 'MY_ASSISTANT_INTELLIGENCE',
      authorityLevel: 'DERIVED_STRUCTURED',
      dataSufficiency: 'LIMITED',
      eventCount: 0,
      animalQuantity: null,
      isDeterministicEligible: true,
      deterministicAnswer: answer,
      explanationSwahili: answer,
      safetyNotice: null,
      evidence: insights,
      observability: {
        serviceCalled: 'getImportantObservationsSnapshot',
        recordCount: records.length,
        totalEventsExamined: 0,
        computationDurationMs: Date.now() - startMs
      }
    };
  }

  const lines: string[] = ['Hapa kuna maarifa muhimu yaliyobainika kuhusu shamba lako:\n'];
  for (const ins of insights.slice(0, 3)) {
    lines.push(`💡 **${ins.title}**: ${ins.summary}`);
  }
  const answer = lines.join('\n');

  return {
    detected: true,
    intent: 'FARM_INSIGHTS',
    confidence: 0.93,
    species: null,
    timePeriod: { label: 'hivi karibuni', startDate: null, endDate: null },
    provenance: 'FARM_INSIGHT',
    source: 'MY_ASSISTANT_INTELLIGENCE',
    authorityLevel: 'DERIVED_STRUCTURED',
    dataSufficiency: 'SUFFICIENT',
    eventCount: insights.length,
    animalQuantity: null,
    isDeterministicEligible: true,
    deterministicAnswer: answer,
    explanationSwahili: answer,
    safetyNotice: 'Maarifa haya yanatokana na data iliyorekodiwa na hayajumuishi dhamana ya kibiashara wala makadirio ya kifedha.',
    evidence: insights,
    observability: {
      serviceCalled: 'getImportantObservationsSnapshot',
      recordCount: records.length,
      totalEventsExamined: insights.length,
      computationDurationMs: Date.now() - startMs
    }
  };
}

/**
 * Historical Count & Latest Event adapters wrapping V1.4G Question Service.
 */
export function getHistoricalCountForAI(
  params: BridgeAdapterInputParams
): MyAssistantAIIntelligenceResult {
  const { userId, records = [], recordEventsMap = {}, question = '', history = [] } = params;
  const hqr = getHistoryQuestionResult(userId, records, recordEventsMap, question, history);

  return {
    detected: hqr.detected,
    intent: 'HISTORICAL_COUNT',
    confidence: hqr.detected ? 0.95 : 0.4,
    species: hqr.parsedQuestion.livestockType,
    timePeriod: {
      label: hqr.authoritativeSource.queriedPeriod.labelSwahili,
      startDate: hqr.authoritativeSource.queriedPeriod.window,
      endDate: null
    },
    provenance: 'FACT',
    source: 'LIVESTOCK_HISTORY',
    authorityLevel: 'AUTHORITATIVE_STRUCTURED',
    dataSufficiency: hqr.detected ? 'SUFFICIENT' : 'INSUFFICIENT',
    eventCount: hqr.eventCount,
    animalQuantity: hqr.animalQuantity,
    isDeterministicEligible: true,
    deterministicAnswer: hqr.factualSummarySwahili,
    explanationSwahili: hqr.factualSummarySwahili,
    safetyNotice: hqr.safetyNoticeSwahili,
    evidence: hqr.supportingEvents,
    observability: {
      serviceCalled: 'getHistoryQuestionResult',
      recordCount: records.length,
      totalEventsExamined: hqr.eventCount,
      computationDurationMs: 0
    }
  };
}

export function getLatestHistoricalEventForAI(
  params: BridgeAdapterInputParams
): MyAssistantAIIntelligenceResult {
  const { userId, records = [], recordEventsMap = {}, question = '', history = [] } = params;
  const hqr = getHistoryQuestionResult(userId, records, recordEventsMap, question, history);

  return {
    detected: hqr.detected,
    intent: 'HISTORICAL_LATEST',
    confidence: hqr.detected ? 0.95 : 0.4,
    species: hqr.parsedQuestion.livestockType,
    timePeriod: {
      label: hqr.authoritativeSource.queriedPeriod.labelSwahili,
      startDate: null,
      endDate: null
    },
    provenance: 'FACT',
    source: 'LIVESTOCK_HISTORY',
    authorityLevel: 'AUTHORITATIVE_STRUCTURED',
    dataSufficiency: hqr.detected ? 'SUFFICIENT' : 'INSUFFICIENT',
    eventCount: hqr.eventCount,
    animalQuantity: hqr.animalQuantity,
    isDeterministicEligible: true,
    deterministicAnswer: hqr.factualSummarySwahili,
    explanationSwahili: hqr.factualSummarySwahili,
    safetyNotice: hqr.safetyNoticeSwahili,
    evidence: hqr.latestEvent,
    observability: {
      serviceCalled: 'getHistoryQuestionResult',
      recordCount: records.length,
      totalEventsExamined: hqr.eventCount,
      computationDurationMs: 0
    }
  };
}

// ==============================================================================
// 3. MASTER ROUTER: getMyAssistantIntelligenceForAI (Section 22 & 23)
// ==============================================================================

/**
 * Unified entry point for retrieving My Assistant Intelligence for the AI Assistant.
 * Maps the farmer's question and context to the authoritative intelligence service.
 */
export function getMyAssistantIntelligenceForAI(
  params: BridgeAdapterInputParams
): MyAssistantAIIntelligenceResult {
  const { question = '', history = [], species, timeWindow } = params;
  const q = question.toLowerCase().trim();

  // Extract species if not explicitly passed
  let detectedSpecies = species || null;
  if (!detectedSpecies) {
    const extracted = extractLivestockSpecies(q);
    if (extracted) {
      detectedSpecies = extracted.key;
    } else if (history.length > 0) {
      // Check recent turns for context continuity
      for (let i = history.length - 1; i >= 0; i--) {
        const turnText = (history[i].text || history[i].content || '').toLowerCase();
        const prevSpec = extractLivestockSpecies(turnText);
        if (prevSpec) {
          detectedSpecies = prevSpec.key;
          break;
        }
      }
    }
  }

  // Extract natural time window from question
  let detectedWindow = timeWindow || null;
  if (!detectedWindow) {
    const parsedPeriod = parseNaturalTimePeriod(q);
    if (parsedPeriod.canonicalWindow) {
      detectedWindow = parsedPeriod.canonicalWindow;
    }
  }

  const adapterParams: BridgeAdapterInputParams = {
    ...params,
    species: detectedSpecies,
    timeWindow: detectedWindow
  };

  // 1. Current Livestock State (Section 5A)
  // Patterns: "Nina kuku wangapi?", "Mifugo mingapi?", "Salio langu", "Idadi ya mifugo"
  if (
    /\b(wangapi|mingapi|idadi\s+ya\s+sasa|salio|makundi\s+yangu|nina\s+mifugo|kwa\s+sasa\s+nina)\b/i.test(q) &&
    !/\b(mwezi|miezi|mwaka|wiki|siku|ongeza|punguza|vifo|chanjo|tiba|treatment|historia)\b/i.test(q)
  ) {
    return getCurrentLivestockIntelligenceForAI(adapterParams);
  }

  // 2. Additions (Section 5C)
  // Patterns: "Nimeongeza kuku wangapi?", "Niliongeza lini?", "Vizazi"
  if (/\b(ongeza|nimeongeza|niliongeza|walioongezeka|vizazi|waliozaliwa|wamenunuliwa)\b/i.test(q)) {
    return getAdditionIntelligenceForAI(adapterParams);
  }

  // 3. Reductions (Section 5D)
  // Patterns: "Nimepunguza kuku wangapi?", "Niliuza wangapi?", "Punguzo"
  if (/\b(punguza|nimepunguza|nilipunguza|waliopungua|niliuza|nimeuza|waliochinjwa)\b/i.test(q) && !/\bvifo|kufa|kifo\b/i.test(q)) {
    return getReductionIntelligenceForAI(adapterParams);
  }

  // 4. Mortality (Section 5E)
  // Patterns: "Nimepoteza kuku wangapi?", "Vifo vya kuku", "Walikufa lini"
  if (/\b(vifo|kifo|walikufa|kufa|nimepoteza|upotevu)\b/i.test(q)) {
    return getMortalityIntelligenceForAI(adapterParams);
  }

  // 5. Vaccination History (Section 5F)
  // Patterns: "Nimechanja kuku mara ngapi?", "Chanjo ya mwisho"
  if (/\b(chanjo|kuchanja|nimechanja|nilichanja|vaccine|vaccination)\b/i.test(q)) {
    return getVaccinationHistoryForAI(adapterParams);
  }

  // 6. Treatment History (Section 5G)
  // Patterns: "Nimefanya treatment mara ngapi?", "Treatment ya mwisho"
  if (/\b(treatment|matibabu|tiba|dawa|nilitibu|nimetibu)\b/i.test(q)) {
    return getTreatmentHistoryForAI(adapterParams);
  }

  // 7. Activity Summary (Section 5H)
  // Patterns: "Shughuli gani nyingi?", "Nimefanya shughuli ngapi?"
  if (/\b(shughuli|matukio|activity|activities|kazi|busiest)\b/i.test(q)) {
    return getActivitySummaryForAI(adapterParams);
  }

  // 8. Trends (Section 5B)
  // Patterns: "Mifugo yangu imeongezeka?", "Wamebadilikaje?", "Mwenendo"
  if (/\b(mwenendo|trend|badilika|mabadiliko|ongezeka|pungua|kulinganisha)\b/i.test(q)) {
    return getLivestockTrendForAI(adapterParams);
  }

  // 9. Important Observations (Section 5I)
  // Patterns: "Jambo gani muhimu?", "My Assistant imegundua nini?"
  if (/\b(muhimu|angalizo|observation|imegundua|jambo\s+gani\s+muhimu)\b/i.test(q)) {
    return getImportantObservationsForAI(adapterParams);
  }

  // 10. Farm Insights (Section 5J)
  // Patterns: "My Assistant inaona nini?", "Insight gani", "Pattern gani"
  if (/\b(insight|insights|inaona\s+nini|maoni|ushauri|pattern)\b/i.test(q)) {
    return getFarmInsightsForAI(adapterParams);
  }

  // 11. General Historical Questions (Latest event / historical count)
  if (/\b(lini|mara\s+ngapi|tarehe\s+gani|mwisho|historia)\b/i.test(q)) {
    if (/\blini|tarehe|mwisho\b/i.test(q)) {
      return getLatestHistoricalEventForAI(adapterParams);
    }
    return getHistoricalCountForAI(adapterParams);
  }

  // Default: If no farm records intent was detected in the question, return non-detected
  return {
    detected: false,
    intent: 'CURRENT_LIVESTOCK',
    confidence: 0,
    species: detectedSpecies,
    speciesLabel: getSpeciesLabel(detectedSpecies),
    timePeriod: { label: 'wakati huu wa sasa', startDate: null, endDate: null },
    provenance: 'FACT',
    source: 'LIVESTOCK_RECORDS',
    authorityLevel: 'DERIVED_STRUCTURED',
    dataSufficiency: 'INSUFFICIENT',
    eventCount: 0,
    animalQuantity: 0,
    startingQuantity: 0,
    currentQuantity: 0,
    isDeterministicEligible: false,
    deterministicAnswer: '',
    explanationSwahili: 'Swali hili halihusu takwimu au rekodi za Daftari la Mifugo.',
    safetyNotice: null,
    evidence: { totalRecords: (params.records || []).length },
    observability: {
      serviceCalled: 'getMyAssistantIntelligenceForAI',
      recordCount: (params.records || []).length,
      totalEventsExamined: 0,
      computationDurationMs: 0
    }
  };
}

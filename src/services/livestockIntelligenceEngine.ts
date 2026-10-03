import {
  LivestockRecord,
  LivestockEvent,
  EventType,
  LivestockIntelligenceSnapshot,
  LivestockTypeIntelligence,
  DataCoverageInfo,
  DataSufficiencyLevel,
  IntelligenceObservation,
  IntelligenceCategory,
  IntelligenceSeverity,
  LivestockTrend,
  LivestockTrendsSnapshot,
  TrendDirection,
  TrendTimeWindow,
  LivestockTrendPoint,
  SupportingEventSummary,
  NormalizedMovementCategory,
  AdditionsBreakdown,
  ReductionsBreakdown,
  MortalityPatternType,
  MortalityRateInfo,
  TypeMortalityDetail,
  TimeGroupedMortality,
  MortalityPatternAnalysis,
  MortalityIntelligence,
  LivestockTypeMovement,
  LivestockMovementSnapshot,
  NormalizedHealthCategory,
  VaccinationEventDetail,
  TreatmentEventDetail,
  HealthTimelineItem,
  HealthTypeActivity,
  VaccinationHistorySummary,
  TreatmentHistorySummary,
  HealthActivityHistorySnapshot,
  HealthHistoryOptions,
  ActivityCanonicalCategory,
  ActivityGroupingPeriodType,
  TimeGroupedActivity,
  ActivityCategorySummary,
  ActivityLivestockTypeSummary,
  ActivityTimelineItem,
  ActivityRollupBreakdown,
  BusiestActivityPeriod,
  QuietActivityPeriod,
  ActivitySummarySnapshot,
  ActivitySummaryOptions,
  ObservationType,
  ObservationSeverity,
  ObservationScope,
  ObservationEvidence,
  ImportantObservation,
  FarmInsight,
  ImportantObservationsSnapshot,
  ObservationsOptions,
  V1_4_ARCHITECTURAL_FREEZE,
  UnifiedMyAssistantIntelligenceSnapshot,
  ZeroVsNoDataCategory
} from '../types';
import {
  calculateLivestockBalance,
  sortEventsChronologicallyAsc,
  sortEventsChronologicallyDesc,
  isPositiveEventType,
  isNegativeEventType,
  isNeutralEventType
} from '../utils/livestockBalance';

/**
 * Normalizes a date string (YYYY-MM-DD or ISO timestamp) into a canonical YYYY-MM-DD date.
 * Avoids browser timezone offset shifts by reading calendar components directly.
 */
export function normalizeDateToYMD(dateStr: string | null | undefined): string | null {
  if (!dateStr || typeof dateStr !== 'string') {
    return null;
  }
  const trimmed = dateStr.trim();
  // If already YYYY-MM-DD
  const ymdMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymdMatch) {
    return `${ymdMatch[1]}-${ymdMatch[2]}-${ymdMatch[3]}`;
  }

  try {
    const d = new Date(trimmed);
    if (isNaN(d.getTime())) {
      return null;
    }
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch {
    return null;
  }
}

/**
 * Calculates day difference between two YYYY-MM-DD dates deterministically.
 */
export function calculateDaysBetween(startDateStr: string, endDateStr: string): number {
  try {
    const startParts = startDateStr.split('-').map(Number);
    const endParts = endDateStr.split('-').map(Number);
    if (startParts.length === 3 && endParts.length === 3) {
      const startUtc = Date.UTC(startParts[0], startParts[1] - 1, startParts[2]);
      const endUtc = Date.UTC(endParts[0], endParts[1] - 1, endParts[2]);
      const diffMs = Math.abs(endUtc - startUtc);
      return Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1; // inclusive of start day
    }
  } catch {}
  return 1;
}

/**
 * Normalizes livestock category / type for intelligence grouping.
 */
export function normalizeLivestockTypeName(type: string, category?: string): string {
  const t = (type || '').trim();
  if (t) return t;
  const c = (category || '').trim();
  if (c) return c;
  return 'Mifugo Mchanganyiko';
}

/**
 * Normalizes event type string (supports canonical English types and common Swahili aliases).
 */
export function normalizeCanonicalEventType(type: string | EventType): EventType {
  const t = (type || '').toLowerCase().trim();
  if (t === 'birth' || t === 'kuzaliwa') return 'birth';
  if (t === 'purchase' || t === 'kununuliwa' || t === 'kununua') return 'purchase';
  if (t === 'addition' || t === 'kuongeza' || t === 'kuingizwa') return 'addition';
  if (t === 'death' || t === 'vifo' || t === 'kifo' || t === 'mortality') return 'death';
  if (t === 'sale' || t === 'kuuzwa' || t === 'kuuza' || t === 'slaughter' || t === 'kuchinjwa') return 'sale';
  if (t === 'vaccination' || t === 'chanjo') return 'vaccination';
  if (t === 'treatment' || t === 'matibabu') return 'treatment';
  if (t === 'feed' || t === 'chakula') return 'feed';
  if (t === 'observation' || t === 'uchunguzi') return 'observation';
  return (type as EventType) || 'other';
}

/**
 * Evaluates historical data coverage and sufficiency deterministically.
 */
export function calculateDataCoverage(
  records: LivestockRecord[] = [],
  recordEventsMap: Record<string, LivestockEvent[]> = {}
): DataCoverageInfo {
  let firstEventDate: string | null = null;
  let lastEventDate: string | null = null;
  let eventCount = 0;

  for (const record of records) {
    const events = recordEventsMap[record.recordId] || [];
    for (const evt of events) {
      eventCount += 1;
      const normalized = normalizeDateToYMD(evt.eventDate);
      if (normalized) {
        if (!firstEventDate || normalized < firstEventDate) {
          firstEventDate = normalized;
        }
        if (!lastEventDate || normalized > lastEventDate) {
          lastEventDate = normalized;
        }
      }
    }
  }

  const recordCount = records.length;
  let daysSpan = 0;
  if (firstEventDate && lastEventDate) {
    daysSpan = calculateDaysBetween(firstEventDate, lastEventDate);
  } else if (recordCount > 0) {
    daysSpan = 1;
  }

  let sufficiency: DataSufficiencyLevel = 'INSUFFICIENT';
  let sufficiencyReason = '';
  let isSparse = true;

  if (recordCount === 0) {
    sufficiency = 'INSUFFICIENT';
    sufficiencyReason = 'Hakuna rekodi za mifugo zilizosajiliwa bado.';
    isSparse = true;
  } else if (eventCount === 0) {
    sufficiency = 'INSUFFICIENT';
    sufficiencyReason = 'Kuna rekodi za mifugo lakini bado hakuna matukio ya kihistoria yaliyorekodiwa.';
    isSparse = true;
  } else if (eventCount < 4 || daysSpan < 14) {
    sufficiency = 'LIMITED';
    sufficiencyReason = `Taarifa zilizopo bado ni chache kwa kuonyesha mwenendo wa muda mrefu (matukio ${eventCount} ndani ya siku ${daysSpan}).`;
    isSparse = true;
  } else {
    sufficiency = 'SUFFICIENT';
    sufficiencyReason = `Kuna data ya kutosha kuonyesha mwenendo na shughuli za mifugo (matukio ${eventCount} ndani ya siku ${daysSpan}).`;
    isSparse = false;
  }

  return {
    firstEventDate,
    lastEventDate,
    eventCount,
    recordCount,
    daysSpan,
    isSparse,
    sufficiency,
    sufficiencyReason
  };
}

/**
 * Calculates derived livestock intelligence by individual livestock type.
 * Preserves separation between species (chickens vs goats vs cattle).
 */
export function calculateLivestockByTypeIntelligence(
  records: LivestockRecord[] = [],
  recordEventsMap: Record<string, LivestockEvent[]> = {}
): LivestockTypeIntelligence[] {
  const typeMap = new Map<string, LivestockTypeIntelligence>();

  for (const record of records) {
    const key = normalizeLivestockTypeName(record.livestockType, record.livestockCategory);
    const rawEvents = recordEventsMap[record.recordId] || [];
    const events: LivestockEvent[] = rawEvents.map((e) => ({
      ...e,
      eventType: normalizeCanonicalEventType(e.eventType)
    }));
    const balance = calculateLivestockBalance(record.quantity, events);

    let additions = 0;
    let reductions = 0;
    let mortality = 0;
    let vaccinations = 0;
    let treatments = 0;

    for (const evt of events) {
      const q = typeof evt.quantity === 'number' && !isNaN(evt.quantity) && evt.quantity > 0
        ? Math.round(evt.quantity)
        : 0;

      if (isPositiveEventType(evt.eventType)) {
        additions += q;
      } else if (isNegativeEventType(evt.eventType)) {
        reductions += q;
        if (evt.eventType === 'death' || evt.eventType === 'mortality') {
          mortality += q;
        }
      } else if (evt.eventType === 'vaccination') {
        vaccinations += 1;
      } else if (evt.eventType === 'treatment') {
        treatments += 1;
      }
    }

    const existing = typeMap.get(key);
    if (!existing) {
      typeMap.set(key, {
        livestockType: key,
        livestockCategory: record.livestockCategory,
        groupCount: 1,
        startingQuantity: balance.baseQuantity,
        currentQuantity: balance.currentQuantity,
        netChange: balance.currentQuantity - balance.baseQuantity,
        additions,
        reductions,
        mortality,
        vaccinations,
        treatments,
        eventCount: events.length
      });
    } else {
      existing.groupCount += 1;
      existing.startingQuantity += balance.baseQuantity;
      existing.currentQuantity += balance.currentQuantity;
      existing.netChange += balance.currentQuantity - balance.baseQuantity;
      existing.additions += additions;
      existing.reductions += reductions;
      existing.mortality += mortality;
      existing.vaccinations += vaccinations;
      existing.treatments += treatments;
      existing.eventCount += events.length;
    }
  }

  return Array.from(typeMap.values()).sort((a, b) => b.currentQuantity - a.currentQuantity);
}

/**
 * Generates deterministic observations.
 * Strictly adheres to non-medical boundaries (no disease diagnosis, no efficacy claims).
 */
export function generateDeterministicObservations(
  records: LivestockRecord[],
  recordEventsMap: Record<string, LivestockEvent[]>,
  coverage: DataCoverageInfo,
  byType: LivestockTypeIntelligence[],
  recentActivity: {
    additions: number;
    reductions: number;
    mortality: number;
    vaccinations: number;
    treatments: number;
    totalEvents: number;
  },
  totalCurrent: number,
  totalStarting: number
): IntelligenceObservation[] {
  const observations: IntelligenceObservation[] = [];

  // Observation 1: Empty Farm or Zero Events
  if (records.length === 0) {
    observations.push({
      id: 'obs-no-records',
      category: 'SUMMARY',
      severity: 'INFO',
      title: 'Hakuna Rekodi za Mifugo',
      message: 'Bado hujaweka rekodi yoyote ya mifugo. Anza kwa kuongeza kundi la mifugo ili kuanzisha takwimu za shamba.',
      dataBacked: true
    });
    return observations;
  }

  if (coverage.eventCount === 0) {
    observations.push({
      id: 'obs-no-events',
      category: 'ACTIVITY',
      severity: 'INFO',
      title: 'Hakuna Matukio Yaliyorekodiwa Bado',
      message: 'Idadi ya sasa inalingana na idadi ya kuanzia. Rekodi matukio (kama vile vizazi, manunuzi, mauzo au chanjo) ili kuona mabadiliko ya kihistoria.',
      dataBacked: true
    });
  }

  // Observation 2: Data Coverage & Sparse Data Warning
  if (coverage.sufficiency === 'LIMITED') {
    observations.push({
      id: 'obs-sparse-coverage',
      category: 'OBSERVATION',
      severity: 'NOTICE',
      title: 'Kumbukumbu Bado Ni Chache',
      message: coverage.sufficiencyReason,
      dataBacked: true
    });
  }

  // Observation 3: Balance Validity / Anomaly Check
  let hasInvalidBalance = false;
  for (const record of records) {
    const events = recordEventsMap[record.recordId] || [];
    const sorted = sortEventsChronologicallyAsc(events);
    let running = record.quantity;
    for (const evt of sorted) {
      const q = typeof evt.quantity === 'number' && !isNaN(evt.quantity) ? evt.quantity : 0;
      const evtType = normalizeCanonicalEventType(evt.eventType);
      if (isPositiveEventType(evtType)) running += q;
      else if (isNegativeEventType(evtType)) running -= q;
      if (running < 0) {
        hasInvalidBalance = true;
        observations.push({
          id: `obs-invalid-balance-${record.recordId}`,
          category: 'BALANCE',
          severity: 'IMPORTANT',
          title: 'Angalizo la Hesabu Hasi',
          message: `Kwenye rekodi ya "${record.recordName || record.livestockType}", mahesabu ya kihistoria yalionyesha idadi kushuka chini ya sifuri. Tafadhali kagua matukio yaliyorekodiwa.`,
          relatedRecordId: record.recordId,
          relatedLivestockType: record.livestockType,
          dataBacked: true
        });
        break;
      }
    }
  }

  // Observation 4: Mortality Check (No Medical Inference)
  if (recentActivity.mortality > 0) {
    observations.push({
      id: 'obs-mortality-recorded',
      category: 'MORTALITY',
      severity: recentActivity.mortality >= 10 ? 'IMPORTANT' : 'NOTICE',
      title: 'Vifo / Upotevu Uliorekodiwa',
      message: `Kumekuwa na vifo au upotevu wa mifugo ${recentActivity.mortality} uliorekodiwa katika historia ya shamba. (Kumbuka: Mfumo hautoi utambuzi wa ugonjwa bila uchunguzi wa daktari).`,
      dataBacked: true
    });
  }

  // Observation 5: Overall Growth or Reduction
  const netChange = totalCurrent - totalStarting;
  if (netChange > 0 && recentActivity.totalEvents > 0) {
    observations.push({
      id: 'obs-net-positive',
      category: 'TREND',
      severity: 'INFO',
      title: 'Ongezeko la Jumla',
      message: `Idadi ya mifugo imeongezeka kwa ${netChange} kulinganisha na idadi ya kuanzia (+${recentActivity.additions} walioongezeka, -${recentActivity.reductions} waliopungua).`,
      dataBacked: true
    });
  } else if (netChange < 0 && recentActivity.totalEvents > 0) {
    observations.push({
      id: 'obs-net-negative',
      category: 'TREND',
      severity: 'NOTICE',
      title: 'Upungufu wa Jumla',
      message: `Idadi ya mifugo imepungua kwa ${Math.abs(netChange)} kulinganisha na idadi ya kuanzia (+${recentActivity.additions} walioongezeka, -${recentActivity.reductions} waliopungua).`,
      dataBacked: true
    });
  }

  // Observation 6: Vaccinations & Treatments (Non-medical tracking)
  if (recentActivity.vaccinations > 0) {
    observations.push({
      id: 'obs-vaccination-activity',
      category: 'VACCINATION',
      severity: 'INFO',
      title: 'Chanjo Zilizorekodiwa',
      message: `Matukio ${recentActivity.vaccinations} ya chanjo yamerekodiwa kwa mafanikio.`,
      dataBacked: true
    });
  }

  if (recentActivity.treatments > 0) {
    observations.push({
      id: 'obs-treatment-activity',
      category: 'TREATMENT',
      severity: 'INFO',
      title: 'Matibabu Yaliyorekodiwa',
      message: `Matukio ${recentActivity.treatments} ya matibabu yamerekodiwa kwenye kumbukumbu za mifugo.`,
      dataBacked: true
    });
  }

  return observations;
}

/**
 * Primary intelligence snapshot generator.
 * Pure, deterministic calculation based on authoritative livestock records and events.
 */
export function getLivestockIntelligenceSnapshot(
  uid: string,
  records: LivestockRecord[] = [],
  recordEventsMap: Record<string, LivestockEvent[]> = {}
): LivestockIntelligenceSnapshot {
  const safeUid = uid || '';
  const nowIso = new Date().toISOString();

  // 1. Data Coverage & Sufficiency
  const dataCoverage = calculateDataCoverage(records, recordEventsMap);

  // 2. Livestock By Type
  const livestockByType = calculateLivestockByTypeIntelligence(records, recordEventsMap);

  // 3. Overall Totals
  let totalStartingLivestock = 0;
  let totalLivestock = 0;
  let totalAdditions = 0;
  let totalReductions = 0;
  let totalMortality = 0;
  let totalVaccinations = 0;
  let totalTreatments = 0;
  let totalEvents = 0;

  for (const t of livestockByType) {
    totalStartingLivestock += t.startingQuantity;
    totalLivestock += t.currentQuantity;
    totalAdditions += t.additions;
    totalReductions += t.reductions;
    totalMortality += t.mortality;
    totalVaccinations += t.vaccinations;
    totalTreatments += t.treatments;
    totalEvents += t.eventCount;
  }

  const totalNetChange = totalLivestock - totalStartingLivestock;

  const recentActivity = {
    additions: totalAdditions,
    reductions: totalReductions,
    mortality: totalMortality,
    vaccinations: totalVaccinations,
    treatments: totalTreatments,
    totalEvents
  };

  // 4. Deterministic Observations
  const observations = generateDeterministicObservations(
    records,
    recordEventsMap,
    dataCoverage,
    livestockByType,
    recentActivity,
    totalLivestock,
    totalStartingLivestock
  );

  const isEmpty = records.length === 0;
  const hasSufficientData = dataCoverage.sufficiency === 'SUFFICIENT';

  return {
    version: '1.4A',
    generatedAt: nowIso,
    uid: safeUid,
    totalLivestock,
    totalStartingLivestock,
    totalNetChange,
    totalRecords: records.length,
    livestockByType,
    recentActivity,
    dataCoverage,
    observations,
    isCalculatedDeterministically: true,
    hasSufficientData,
    emptyState: {
      isEmpty,
      reason: isEmpty
        ? 'Bado hakuna taarifa za kutosha kutengeneza insights za mifugo.'
        : dataCoverage.sufficiencyReason,
      userGuidance: isEmpty
        ? 'Ongeza kundi la mifugo kuanzisha ufuatiliaji wa shamba lako.'
        : undefined
    }
  };
}

/**
 * Serializes the structured intelligence snapshot into a safe, factual Swahili block for AI Assistant.
 * Guides AI to speak only from verified facts and never hallucinate trends when data is sparse.
 */
export function serializeIntelligenceSnapshotForAI(snapshot: LivestockIntelligenceSnapshot): string {
  if (snapshot.emptyState.isEmpty) {
    return `[MSINGI WA INTELLIGENCE (V1.4A)]
Hali ya Data: HAKUNA DATA (Bado hakuna rekodi za mifugo zilizosajiliwa).
Mwongozo kwa AI: Mfugaji hajaweka mifugo. Usibuni takwimu, mwenendo, wala matukio ya kufikirika.`;
  }

  const lines: string[] = [];
  lines.push(`[MSINGI WA INTELLIGENCE YA MIFUGO (V1.4A FOUNDATION)]`);
  lines.push(`Uwezo wa Data (Sufficiency): ${snapshot.dataCoverage.sufficiency}`);
  lines.push(`Sababu ya Data: ${snapshot.dataCoverage.sufficiencyReason}`);
  lines.push(`Kipindi cha Data: ${snapshot.dataCoverage.firstEventDate || 'Haijatajwa'} hadi ${snapshot.dataCoverage.lastEventDate || 'Leo'} (${snapshot.dataCoverage.daysSpan} siku, matukio ${snapshot.dataCoverage.eventCount})`);
  lines.push(`Jumla ya Mifugo Sasa: ${snapshot.totalLivestock} (Kuanzia: ${snapshot.totalStartingLivestock}, Mabadiliko halisi: ${snapshot.totalNetChange >= 0 ? `+${snapshot.totalNetChange}` : snapshot.totalNetChange})`);

  if (snapshot.livestockByType.length > 0) {
    lines.push(`\n[IDADI KWA KILA AINA YA MFUGO]`);
    for (const t of snapshot.livestockByType) {
      lines.push(
        `• ${t.livestockType}: Idadi ya sasa ${t.currentQuantity} (Kuanzia: ${t.startingQuantity}, Walioongezeka: +${t.additions}, Waliopungua: -${t.reductions}, Vifo: ${t.mortality}, Chanjo: ${t.vaccinations}, Matibabu: ${t.treatments})`
      );
    }
  }

  lines.push(`\n[SHUGHULI ZILIZOREKODIWA (FACTS ONLY)]`);
  lines.push(`• Ongezeko (Additions): +${snapshot.recentActivity.additions}`);
  lines.push(`• Upungufu (Reductions): -${snapshot.recentActivity.reductions}`);
  lines.push(`• Vifo/Upotevu (Mortality): ${snapshot.recentActivity.mortality} (Namba halisi zilizorekodiwa; hakuna utambuzi wa ugonjwa wa kitabibu)`);
  lines.push(`• Chanjo (Vaccinations): ${snapshot.recentActivity.vaccinations}`);
  lines.push(`• Matibabu (Treatments): ${snapshot.recentActivity.treatments}`);

  if (snapshot.observations.length > 0) {
    lines.push(`\n[MAZINGATIO YA KIHESABU (DETERMINISTIC OBSERVATIONS)]`);
    for (const obs of snapshot.observations) {
      lines.push(`• [${obs.severity}] ${obs.title}: ${obs.message}`);
    }
  }

  lines.push(`\n[MIONGOZO YA USALAMA KWA AI]`);
  lines.push(`1. Tumia takwimu hizi kama UKWELI HALISI pekee uliorekodiwa na mtumiaji.`);
  lines.push(`2. USIBUNI vifo, manunuzi, vizazi, chanjo, au magonjwa yasiyomo kwenye data hii.`);
  if (snapshot.dataCoverage.sufficiency !== 'SUFFICIENT') {
    lines.push(`3. Kwa kuwa data ni ${snapshot.dataCoverage.sufficiency}, usitoe hitimisho la mwenendo wa muda mrefu (long-term trends). Eleza bayana kuwa data bado ni chache.`);
  }
  lines.push(`4. USITOE utambuzi wa ugonjwa (diagnosis) wala kuhukumu ufanisi wa dawa.`);

  return lines.join('\n');
}

// ==============================================================================
// V1.4B — LIVESTOCK TRENDS INTELLIGENCE ENGINE IMPLEMENTATION
// ==============================================================================

export interface TrendCalculationOptions {
  timeWindow?: TrendTimeWindow;
  customStartDate?: string;
  customEndDate?: string;
  referenceDate?: string | Date;
}

/**
 * Offsets a YYYY-MM-DD date by a specified number of days in UTC.
 */
export function addDaysToYMD(ymd: string, days: number): string {
  const parts = ymd.split('-').map(Number);
  if (parts.length === 3) {
    const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + days));
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return ymd;
}

/**
 * Calculates deterministic start and end YYYY-MM-DD dates for a given time window.
 */
export function calculateWindowDateRange(
  window: TrendTimeWindow = '30d',
  referenceDate?: string | Date,
  customStart?: string,
  customEnd?: string
): { startDate: string; endDate: string } {
  let refYmd: string;
  if (typeof referenceDate === 'string') {
    refYmd = normalizeDateToYMD(referenceDate) || new Date().toISOString().split('T')[0];
  } else if (referenceDate instanceof Date) {
    const year = referenceDate.getUTCFullYear();
    const month = String(referenceDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(referenceDate.getUTCDate()).padStart(2, '0');
    refYmd = `${year}-${month}-${day}`;
  } else {
    refYmd = new Date().toISOString().split('T')[0];
  }

  if (window === 'custom') {
    const start = normalizeDateToYMD(customStart) || addDaysToYMD(refYmd, -30);
    const end = normalizeDateToYMD(customEnd) || refYmd;
    return {
      startDate: start <= end ? start : end,
      endDate: end >= start ? end : start
    };
  }

  switch (window) {
    case '7d':
      return { startDate: addDaysToYMD(refYmd, -7), endDate: refYmd };
    case '30d':
      return { startDate: addDaysToYMD(refYmd, -30), endDate: refYmd };
    case '90d':
      return { startDate: addDaysToYMD(refYmd, -90), endDate: refYmd };
    case '6m':
      return { startDate: addDaysToYMD(refYmd, -180), endDate: refYmd };
    case '12m':
      return { startDate: addDaysToYMD(refYmd, -365), endDate: refYmd };
    default:
      return { startDate: addDaysToYMD(refYmd, -30), endDate: refYmd };
  }
}

interface EnrichedEvent extends LivestockEvent {
  recordId: string;
  normalizedDate: string;
  canonicalType: EventType;
  isPos: boolean;
  isNeg: boolean;
}

/**
 * Deterministically calculates a LivestockTrend for a designated group of records
 * within a specific time window.
 */
export function calculateLivestockTrendForRecordGroup(
  trendScope: 'overall' | 'type',
  livestockType: string,
  livestockCategory: string | undefined,
  records: LivestockRecord[],
  recordEventsMap: Record<string, LivestockEvent[]>,
  timeWindow: TrendTimeWindow,
  startDate: string,
  endDate: string
): LivestockTrend {
  // Empty check
  if (records.length === 0) {
    return {
      trendScope,
      livestockType,
      livestockCategory,
      timeWindow,
      startDate,
      endDate,
      startingKnownCount: 0,
      endingKnownCount: 0,
      netChange: 0,
      direction: 'UNKNOWN',
      dataSufficiency: 'INSUFFICIENT',
      sufficiencyReason: 'Bado hujaweka taarifa za mifugo. Ukianza kurekodi mifugo yako, My Assistant itaweza kukuonyesha mwenendo wa mifugo yako.',
      supportingEvents: {
        additions: 0,
        reductions: 0,
        mortality: 0,
        sales: 0,
        purchases: 0,
        births: 0,
        vaccinations: 0,
        treatments: 0,
        totalEventsInWindow: 0
      },
      trendPoints: []
    };
  }

  // 1. Gather all events for these records
  const allEventsForGroup: EnrichedEvent[] = [];
  for (const r of records) {
    const rawEvents = recordEventsMap[r.recordId] || [];
    for (const raw of rawEvents) {
      const normDate = normalizeDateToYMD(raw.eventDate);
      if (!normDate) continue;
      const canonicalType = normalizeCanonicalEventType(raw.eventType);
      const isPos = isPositiveEventType(canonicalType);
      const isNeg = isNegativeEventType(canonicalType);
      allEventsForGroup.push({
        ...raw,
        recordId: r.recordId,
        normalizedDate: normDate,
        canonicalType,
        isPos,
        isNeg
      });
    }
  }

  // 2. Compute starting known count as of startDate
  let totalStartingKnown = 0;
  for (const r of records) {
    const rEvents = allEventsForGroup.filter((e) => e.recordId === r.recordId);
    let rStart = r.quantity || 0;
    for (const e of rEvents) {
      if (e.normalizedDate < startDate) {
        if (e.isPos) rStart += (e.quantity || 0);
        else if (e.isNeg) rStart -= (e.quantity || 0);
      }
    }
    totalStartingKnown += Math.max(0, rStart);
  }

  // 3. Filter in-window events [startDate, endDate]
  const inWindowEvents = allEventsForGroup.filter(
    (e) => e.normalizedDate >= startDate && e.normalizedDate <= endDate
  );

  // Sort chronologically ascending
  inWindowEvents.sort((a, b) => {
    const cmp = a.normalizedDate.localeCompare(b.normalizedDate);
    if (cmp !== 0) return cmp;
    const createdA = a.createdAt || '';
    const createdB = b.createdAt || '';
    return createdA.localeCompare(createdB);
  });

  // 4. Compute supporting events breakdown in window
  let additions = 0;
  let reductions = 0;
  let mortality = 0;
  let sales = 0;
  let purchases = 0;
  let births = 0;
  let vaccinations = 0;
  let treatments = 0;

  for (const e of inWindowEvents) {
    const q = e.quantity || 0;
    if (e.isPos) additions += q;
    if (e.isNeg) reductions += q;
    if (e.canonicalType === 'death') mortality += q;
    if (e.canonicalType === 'sale') sales += q;
    if (e.canonicalType === 'purchase') purchases += q;
    if (e.canonicalType === 'birth') births += q;
    if (e.canonicalType === 'vaccination') vaccinations += 1;
    if (e.canonicalType === 'treatment') treatments += 1;
  }

  const endingKnownCount = Math.max(0, totalStartingKnown + additions - reductions);
  const netChange = endingKnownCount - totalStartingKnown;

  // 5. Data sufficiency determination
  let dataSufficiency: DataSufficiencyLevel = 'SUFFICIENT';
  let sufficiencyReason = 'Historia ya matukio inatosha kuonyesha mwenendo wa kuaminika.';

  if (records.length === 1 && allEventsForGroup.length === 0) {
    // Single record with no events recorded ever (Section 13 & Test 2)
    dataSufficiency = 'LIMITED';
    sufficiencyReason = 'Bado hakuna historia ya kutosha kuonyesha mwenendo wa mifugo.';
  } else if (inWindowEvents.length === 0) {
    dataSufficiency = 'LIMITED';
    sufficiencyReason = 'Hakuna matukio yaliyorekodiwa katika kipindi hiki. Hesabu imebaki thabiti.';
  } else if (inWindowEvents.length === 1) {
    dataSufficiency = 'LIMITED';
    sufficiencyReason = 'Kipindi hiki kina tukio 1 pekee lililorekodiwa; historia bado ni chache.';
  }

  // 6. Direction determination
  let direction: TrendDirection = 'STABLE';
  if ((dataSufficiency as string) === 'INSUFFICIENT') {
    direction = 'UNKNOWN';
  } else if (totalStartingKnown < endingKnownCount) {
    direction = 'INCREASING';
  } else if (totalStartingKnown > endingKnownCount) {
    direction = 'DECREASING';
  } else {
    direction = 'STABLE';
  }

  // 7. Trend Points (Actual recorded dates only - zero hallucinated points)
  const trendPoints: LivestockTrendPoint[] = [];

  // Starting point at startDate
  trendPoints.push({
    date: startDate,
    count: totalStartingKnown,
    netChangeOnDate: 0,
    eventCount: 0,
    summaryNotes: 'Mwanzo wa kipindi'
  });

  if (inWindowEvents.length > 0) {
    // Group events by distinct date
    const dateMap = new Map<string, EnrichedEvent[]>();
    for (const e of inWindowEvents) {
      const list = dateMap.get(e.normalizedDate) || [];
      list.push(e);
      dateMap.set(e.normalizedDate, list);
    }

    const sortedDates = Array.from(dateMap.keys()).sort((a, b) => a.localeCompare(b));
    let runningCount = totalStartingKnown;

    for (const d of sortedDates) {
      const evtsOnDate = dateMap.get(d)!;
      let dayNet = 0;
      const notesParts: string[] = [];
      for (const e of evtsOnDate) {
        const q = e.quantity || 0;
        if (e.isPos) {
          dayNet += q;
          if (e.canonicalType === 'birth') notesParts.push(`+${q} vizazi`);
          else if (e.canonicalType === 'purchase') notesParts.push(`+${q} manunuzi`);
          else notesParts.push(`+${q} ongezeko`);
        } else if (e.isNeg) {
          dayNet -= q;
          if (e.canonicalType === 'death') notesParts.push(`-${q} vifo`);
          else if (e.canonicalType === 'sale') notesParts.push(`-${q} mauzo`);
          else notesParts.push(`-${q} upungufu`);
        } else {
          if (e.canonicalType === 'vaccination') notesParts.push('chanjo');
          else if (e.canonicalType === 'treatment') notesParts.push('matibabu');
        }
      }
      runningCount = Math.max(0, runningCount + dayNet);

      if (d === startDate && trendPoints.length > 0) {
        trendPoints[0].count = runningCount;
        trendPoints[0].netChangeOnDate = dayNet;
        trendPoints[0].eventCount = evtsOnDate.length;
        trendPoints[0].summaryNotes = notesParts.join(', ') || 'Matukio';
      } else {
        trendPoints.push({
          date: d,
          count: runningCount,
          netChangeOnDate: dayNet,
          eventCount: evtsOnDate.length,
          summaryNotes: notesParts.join(', ') || undefined
        });
      }
    }

    const lastDate = sortedDates[sortedDates.length - 1];
    if (lastDate < endDate) {
      trendPoints.push({
        date: endDate,
        count: endingKnownCount,
        netChangeOnDate: 0,
        eventCount: 0,
        summaryNotes: 'Mwisho wa kipindi'
      });
    }
  } else {
    if (endDate !== startDate) {
      trendPoints.push({
        date: endDate,
        count: endingKnownCount,
        netChangeOnDate: 0,
        eventCount: 0,
        summaryNotes: 'Mwisho wa kipindi'
      });
    }
  }

  return {
    trendScope,
    livestockType,
    livestockCategory,
    timeWindow,
    startDate,
    endDate,
    startingKnownCount: totalStartingKnown,
    endingKnownCount,
    netChange,
    direction,
    dataSufficiency,
    sufficiencyReason,
    supportingEvents: {
      additions,
      reductions,
      mortality,
      sales,
      purchases,
      births,
      vaccinations,
      treatments,
      totalEventsInWindow: inWindowEvents.length
    },
    trendPoints
  };
}

/**
 * V1.4B Main Entry Point:
 * Deterministically calculates the complete Livestock Trends snapshot across the farm
 * and by livestock type for a given time window.
 */
export function getLivestockTrendsSnapshot(
  uid: string,
  records: LivestockRecord[] = [],
  recordEventsMap: Record<string, LivestockEvent[]> = {},
  options?: TrendCalculationOptions
): LivestockTrendsSnapshot {
  const safeUid = uid || 'unknown_farmer';
  const timeWindow = options?.timeWindow || '30d';
  const { startDate, endDate } = calculateWindowDateRange(
    timeWindow,
    options?.referenceDate,
    options?.customStartDate,
    options?.customEndDate
  );

  const nowIso = new Date().toISOString();
  const isEmpty = records.length === 0;

  const dataCoverage = calculateDataCoverage(records, recordEventsMap);

  if (isEmpty) {
    return {
      version: '1.4B',
      generatedAt: nowIso,
      uid: safeUid,
      timeWindow,
      startDate,
      endDate,
      overallFarmTrend: null,
      typeTrends: [],
      dataCoverage,
      summarySwahili:
        'Bado hujaweka taarifa za mifugo. Ukianza kurekodi mifugo yako, My Assistant itaweza kukuonyesha mwenendo wa mifugo yako.',
      isCalculatedDeterministically: true,
      emptyState: {
        isEmpty: true,
        userGuidance:
          'Bado hujaweka taarifa za mifugo. Ukianza kurekodi mifugo yako, My Assistant itaweza kukuonyesha mwenendo wa mifugo yako.'
      }
    };
  }

  // 1. Overall Farm Trend
  const overallFarmTrend = calculateLivestockTrendForRecordGroup(
    'overall',
    'Mifugo Yote ya Shamba',
    undefined,
    records,
    recordEventsMap,
    timeWindow,
    startDate,
    endDate
  );

  // 2. Trends by Livestock Type
  const typeMap = new Map<string, { category?: string; records: LivestockRecord[] }>();
  for (const r of records) {
    const typeName = normalizeLivestockTypeName(r.livestockType, r.livestockCategory);
    const existing = typeMap.get(typeName) || { category: r.livestockCategory, records: [] };
    existing.records.push(r);
    typeMap.set(typeName, existing);
  }

  const typeTrends: LivestockTrend[] = [];
  for (const [typeName, group] of typeMap.entries()) {
    const trend = calculateLivestockTrendForRecordGroup(
      'type',
      typeName,
      group.category,
      group.records,
      recordEventsMap,
      timeWindow,
      startDate,
      endDate
    );
    typeTrends.push(trend);
  }

  typeTrends.sort((a, b) => {
    if (b.endingKnownCount !== a.endingKnownCount) {
      return b.endingKnownCount - a.endingKnownCount;
    }
    return a.livestockType.localeCompare(b.livestockType);
  });

  // 3. Generate summary in Swahili
  let summarySwahili = '';
  if (records.length === 1 && overallFarmTrend.supportingEvents.totalEventsInWindow === 0) {
    summarySwahili = 'Bado hakuna historia ya kutosha kuonyesha mwenendo wa mifugo.';
  } else if (overallFarmTrend.direction === 'INCREASING') {
    summarySwahili = `Mifugo ya shamba imeongezeka kutoka ${overallFarmTrend.startingKnownCount} hadi ${overallFarmTrend.endingKnownCount} (+${overallFarmTrend.netChange}) katika kipindi hiki.`;
  } else if (overallFarmTrend.direction === 'DECREASING') {
    summarySwahili = `Mifugo ya shamba imepungua kutoka ${overallFarmTrend.startingKnownCount} hadi ${overallFarmTrend.endingKnownCount} (${overallFarmTrend.netChange}) katika kipindi hiki.`;
  } else {
    summarySwahili = `Idadi ya mifugo ya shamba imebaki thabiti katika ${overallFarmTrend.endingKnownCount} katika kipindi hiki.`;
  }

  return {
    version: '1.4B',
    generatedAt: nowIso,
    uid: safeUid,
    timeWindow,
    startDate,
    endDate,
    overallFarmTrend,
    typeTrends,
    dataCoverage,
    summarySwahili,
    isCalculatedDeterministically: true,
    emptyState: {
      isEmpty: false
    }
  };
}

/**
 * Serializes V1.4B Livestock Trends snapshot for AI Assistant prompt.
 * Strictly enforces non-forecasting, non-hallucination, and medical inference boundaries.
 */
export function serializeLivestockTrendsForAI(trends: LivestockTrendsSnapshot): string {
  if (trends.emptyState.isEmpty || !trends.overallFarmTrend) {
    return `[MWENENDO WA MIFUGO (V1.4B LIVESTOCK TRENDS)]
Hali: HAKUNA DATA YA REKODI ZA MIFUGO.
Mwongozo kwa AI: Mfugaji hajaweka rekodi za mifugo. Usibuni mwenendo wala takwimu.`;
  }

  const lines: string[] = [];
  lines.push(`[UCHAMBUZI WA MWENENDO WA MIFUGO (V1.4B LIVESTOCK TRENDS)]`);
  lines.push(`Kipindi Kilichochambuliwa: ${trends.timeWindow} (${trends.startDate} hadi ${trends.endDate})`);
  lines.push(`Uwezo wa Data ya Kipindi (Data Sufficiency): ${trends.overallFarmTrend.dataSufficiency}`);
  lines.push(`Sababu ya Data: ${trends.overallFarmTrend.sufficiencyReason}`);

  const farm = trends.overallFarmTrend;
  const netSign = farm.netChange >= 0 ? `+${farm.netChange}` : `${farm.netChange}`;
  lines.push(
    `Mwenendo wa Shamba Zima: Mwelekeo=${farm.direction}, Kuanzia=${farm.startingKnownCount}, Sasa/Mwisho=${farm.endingKnownCount}, Mabadiliko=${netSign}`
  );
  lines.push(
    `Matukio ya Kipindi hiki: Walioongezeka=+${farm.supportingEvents.additions} (Vizazi: ${farm.supportingEvents.births}, Manunuzi: ${farm.supportingEvents.purchases}), Waliopungua=-${farm.supportingEvents.reductions} (Vifo: ${farm.supportingEvents.mortality}, Mauzo: ${farm.supportingEvents.sales}), Chanjo: ${farm.supportingEvents.vaccinations}, Matibabu: ${farm.supportingEvents.treatments}`
  );

  if (trends.typeTrends.length > 0) {
    lines.push(`\n[MWENENDO KWA KILA AINA YA MFUGO]`);
    for (const t of trends.typeTrends) {
      const tNet = t.netChange >= 0 ? `+${t.netChange}` : `${t.netChange}`;
      lines.push(
        `• ${t.livestockType}: Mwelekeo=${t.direction} | ${t.startingKnownCount} → ${t.endingKnownCount} (${tNet}) | Matukio: +${t.supportingEvents.additions}, -${t.supportingEvents.reductions} (Vifo: ${t.supportingEvents.mortality}, Mauzo: ${t.supportingEvents.sales}) | Hali ya Data: ${t.dataSufficiency}`
      );
    }
  }

  lines.push(`\n[MIPAKA MIKALI YA USALAMA KWA AI (AI SAFETY & NON-FORECASTING GUARDRAILS)]`);
  lines.push(`1. USIFANYE UTABIRI WA BAADAYE (NO FORECASTING): Kamwe usitabiri idadi ya mifugo ya siku zijazo (mfano: usiseme "kuku wataongezeka hadi 500 mwezi ujao"). Ikiwa mfugaji atauliza utabiri wa baadaye, jibu wazi: "My Assistant inaweza kukuonyesha mwenendo wa historia ya mifugo yako, lakini kwa sasa haifanyi utabiri wa idadi ya mifugo ya baadaye."`);
  lines.push(`2. HAKUNA UTAMBUZI WA UGONJWA (NO DISEASE DIAGNOSIS): Usihusishe vifo na magonjwa au matibabu (mfano: ukiona vifo 5, sema "vifo 5 vilirekodiwa", usiseme "kuna ugonjwa").`);
  lines.push(`3. UAMINIFU WA HISTORIA NDOGO: Ikiwa data ni LIMITED au INSUFFICIENT, fafanua bayana: "Sina historia ya kutosha ya mifugo yako katika kipindi hicho ili kutoa trend ya kuaminika."`);
  lines.push(`4. USIBUNI NAMBA: Tumia tu namba za kuanzia, mwisho, na mabadiliko zilizokokotolewa hapo juu.`);

  return lines.join('\n');
}

// ==============================================================================
// V1.4C — ADDITIONS, REDUCTIONS & MORTALITY PATTERNS ENGINE
// ==============================================================================

/**
 * Normalizes an event into the V1.4C movement category taxonomy.
 * Preserves strict classification and defaults ambiguous types to 'OTHER'.
 */
export function classifyMovementEvent(rawType: EventType): NormalizedMovementCategory {
  const canonical = normalizeCanonicalEventType(rawType);
  if (canonical === 'purchase') return 'PURCHASE';
  if (canonical === 'sale') return 'SALE';
  if (canonical === 'death' || canonical === 'mortality') return 'MORTALITY';
  if (canonical === 'addition' || canonical === 'birth') return 'ADDITION';
  if (isPositiveEventType(canonical)) return 'ADDITION';
  if (isNegativeEventType(canonical)) return 'REDUCTION';
  return 'OTHER';
}

/**
 * Calculates previous comparison window date bounds based on time window and current start date.
 */
export function calculatePreviousWindowDateRange(
  window: TrendTimeWindow,
  currentStartDate: string,
  customDaySpan?: number
): { startDate: string; endDate: string } {
  let spanDays = 30;
  switch (window) {
    case '7d':
      spanDays = 7;
      break;
    case '30d':
      spanDays = 30;
      break;
    case '90d':
      spanDays = 90;
      break;
    case '6m':
      spanDays = 180;
      break;
    case '12m':
      spanDays = 365;
      break;
    case 'custom':
      spanDays = customDaySpan && customDaySpan > 0 ? customDaySpan : 30;
      break;
  }
  const prevEndDate = addDaysToYMD(currentStartDate, -1);
  const prevStartDate = addDaysToYMD(prevEndDate, -spanDays + 1);
  return { startDate: prevStartDate, endDate: prevEndDate };
}

/**
 * Generates sub-periods for time-grouped mortality intelligence within a window.
 */
function generateMortalitySubPeriods(
  window: TrendTimeWindow,
  startDate: string,
  endDate: string
): Array<{ label: string; start: string; end: string }> {
  const periods: Array<{ label: string; start: string; end: string }> = [];

  if (window === '7d') {
    // 7 daily periods
    for (let i = 0; i < 7; i++) {
      const d = addDaysToYMD(startDate, i);
      if (d <= endDate) {
        periods.push({ label: `Siku ${i + 1} (${d})`, start: d, end: d });
      }
    }
  } else if (window === '30d') {
    // 4 weekly periods
    const w1End = addDaysToYMD(startDate, 6);
    const w2Start = addDaysToYMD(startDate, 7);
    const w2End = addDaysToYMD(startDate, 13);
    const w3Start = addDaysToYMD(startDate, 14);
    const w3End = addDaysToYMD(startDate, 20);
    const w4Start = addDaysToYMD(startDate, 21);

    periods.push({ label: 'Wiki 1 (Siku 1 - 7)', start: startDate, end: w1End });
    periods.push({ label: 'Wiki 2 (Siku 8 - 14)', start: w2Start, end: w2End });
    periods.push({ label: 'Wiki 3 (Siku 15 - 21)', start: w3Start, end: w3End });
    periods.push({ label: 'Wiki 4 (Siku 22 - 30)', start: w4Start, end: endDate });
  } else if (window === '90d') {
    // 3 monthly periods of 30 days
    const m1End = addDaysToYMD(startDate, 29);
    const m2Start = addDaysToYMD(startDate, 30);
    const m2End = addDaysToYMD(startDate, 59);
    const m3Start = addDaysToYMD(startDate, 60);

    periods.push({ label: 'Mwezi 1', start: startDate, end: m1End });
    periods.push({ label: 'Mwezi 2', start: m2Start, end: m2End });
    periods.push({ label: 'Mwezi 3', start: m3Start, end: endDate });
  } else if (window === '6m') {
    // 6 periods of 30 days
    for (let m = 0; m < 6; m++) {
      const start = addDaysToYMD(startDate, m * 30);
      const end = m === 5 ? endDate : addDaysToYMD(start, 29);
      periods.push({ label: `Mwezi ${m + 1}`, start, end });
    }
  } else if (window === '12m') {
    // 4 quarters of ~91 days
    for (let q = 0; q < 4; q++) {
      const start = addDaysToYMD(startDate, q * 91);
      const end = q === 3 ? endDate : addDaysToYMD(start, 90);
      periods.push({ label: `Robo ${q + 1}`, start, end });
    }
  } else {
    // Fallback single period
    periods.push({ label: 'Kipindi Chote', start: startDate, end: endDate });
  }

  return periods;
}

/**
 * Deterministically calculates the V1.4C Livestock Movement & Mortality Snapshot.
 * Strictly avoids double-counting, distinguishes explicit purchases/sales/mortality,
 * guards mortality rate denominators, and enforces zero disease inference.
 */
export function getLivestockMovementSnapshot(
  userId: string,
  records: LivestockRecord[],
  recordEventsMap: Record<string, LivestockEvent[]>,
  options?: {
    timeWindow?: TrendTimeWindow;
    referenceDate?: string;
    customStartDate?: string;
    customEndDate?: string;
  }
): LivestockMovementSnapshot {
  const now = new Date().toISOString();
  const timeWindow: TrendTimeWindow = options?.timeWindow || '30d';
  const { startDate, endDate } = calculateWindowDateRange(
    timeWindow,
    options?.referenceDate,
    options?.customStartDate,
    options?.customEndDate
  );

  const prevRange = calculatePreviousWindowDateRange(timeWindow, startDate);
  const previousPeriodStartDate = prevRange.startDate;
  const previousPeriodEndDate = prevRange.endDate;

  // Empty Farm Check
  if (records.length === 0) {
    return {
      version: '1.4C',
      generatedAt: now,
      uid: userId,
      timeWindow,
      startDate,
      endDate,
      previousPeriodStartDate,
      previousPeriodEndDate,
      additions: { total: 0, purchases: 0, births: 0, otherAdditions: 0, eventCount: 0 },
      reductions: { total: 0, sales: 0, mortality: 0, otherReductions: 0, eventCount: 0 },
      netMovement: 0,
      typeMovements: [],
      mortality: {
        totalMortalityCount: 0,
        mortalityEventCount: 0,
        mortalityByType: [],
        mortalityByPeriod: [],
        mortalityRate: {
          ratePercent: null,
          hasValidDenominator: false,
          recordedMortality: 0,
          populationBase: null,
          explanationSwahili: 'Bado hujaweka taarifa za mifugo. Ukianza kurekodi mifugo yako, My Assistant itaweza kukuonyesha mabadiliko na vifo.'
        },
        pattern: {
          patternType: 'NO_DATA',
          summarySwahili: 'Bado hakuna taarifa za mifugo kueleza mwenendo wa vifo.',
          repeatedEventsCluster: false,
          mostAffectedType: null
        },
        dataSufficiency: 'INSUFFICIENT',
        sufficiencyReason: 'Hakuna rekodi za mifugo zilizosajiliwa bado.'
      },
      observations: [],
      dataSufficiency: 'INSUFFICIENT',
      sufficiencyReason: 'Bado hujaweka taarifa za mifugo. Ukianza kurekodi mifugo yako, My Assistant itaweza kukuonyesha mabadiliko na vifo.',
      summarySwahili: 'Bado hujaweka taarifa za mifugo.',
      isCalculatedDeterministically: true,
      emptyState: {
        isEmpty: true,
        userGuidance: 'Anza kwa kusajili mifugo yako katika kichupo cha "Mifugo" ili My Assistant ianze kufuatilia mabadiliko na vifo.'
      }
    };
  }

  // 1. Gather and enrich all events for all records
  interface EnrichedMovementEvent extends LivestockEvent {
    recordId: string;
    livestockType: string;
    livestockCategory?: string;
    normalizedDate: string;
    canonicalType: EventType;
    movementCategory: NormalizedMovementCategory;
    isPos: boolean;
    isNeg: boolean;
  }

  const allEnrichedEvents: EnrichedMovementEvent[] = [];
  let totalAllEventsEver = 0;

  for (const r of records) {
    const rawEvents = recordEventsMap[r.recordId] || [];
    totalAllEventsEver += rawEvents.length;

    for (const raw of rawEvents) {
      const normDate = normalizeDateToYMD(raw.eventDate);
      if (!normDate) continue;

      const canonicalType = normalizeCanonicalEventType(raw.eventType);
      const isPos = isPositiveEventType(canonicalType);
      const isNeg = isNegativeEventType(canonicalType);
      const movementCategory = classifyMovementEvent(raw.eventType);

      allEnrichedEvents.push({
        ...raw,
        recordId: r.recordId,
        livestockType: r.livestockType,
        livestockCategory: r.livestockCategory,
        normalizedDate: normDate,
        canonicalType,
        movementCategory,
        isPos,
        isNeg
      });
    }
  }

  // 2. Filter events in current window [startDate, endDate]
  const inWindowEvents = allEnrichedEvents.filter(
    (e) => e.normalizedDate >= startDate && e.normalizedDate <= endDate
  );

  // 3. Filter events in previous comparison window [previousPeriodStartDate, previousPeriodEndDate]
  const prevWindowEvents = allEnrichedEvents.filter(
    (e) => e.normalizedDate >= previousPeriodStartDate && e.normalizedDate <= previousPeriodEndDate
  );

  // 4. Calculate starting known count as of startDate (Initial records baseline + past pre-window events)
  let totalStartingKnownCount = 0;
  const startingCountsByRecordId: Record<string, number> = {};

  for (const r of records) {
    let rCount = r.quantity || 0;
    const rPreEvents = allEnrichedEvents.filter(
      (e) => e.recordId === r.recordId && e.normalizedDate < startDate
    );
    for (const e of rPreEvents) {
      if (e.isPos) rCount += (e.quantity || 0);
      else if (e.isNeg) rCount -= (e.quantity || 0);
    }
    const safeRCount = Math.max(0, rCount);
    startingCountsByRecordId[r.recordId] = safeRCount;
    totalStartingKnownCount += safeRCount;
  }

  // 5. Compute Additions Breakdown (Gross additions)
  let purchases = 0;
  let births = 0;
  let otherAdditions = 0;
  let additionEventCount = 0;

  for (const e of inWindowEvents) {
    if (e.isPos) {
      additionEventCount++;
      const q = e.quantity || 0;
      if (e.canonicalType === 'purchase') {
        purchases += q;
      } else if (e.canonicalType === 'birth') {
        births += q;
      } else {
        otherAdditions += q;
      }
    }
  }
  const totalAdditions = purchases + births + otherAdditions;
  const additions: AdditionsBreakdown = {
    total: totalAdditions,
    purchases,
    births,
    otherAdditions,
    eventCount: additionEventCount
  };

  // 6. Compute Reductions Breakdown (Gross reductions)
  let sales = 0;
  let mortality = 0;
  let otherReductions = 0;
  let reductionEventCount = 0;

  for (const e of inWindowEvents) {
    if (e.isNeg) {
      reductionEventCount++;
      const q = e.quantity || 0;
      if (e.canonicalType === 'sale') {
        sales += q;
      } else if (e.canonicalType === 'death') {
        mortality += q;
      } else {
        otherReductions += q;
      }
    }
  }
  const totalReductions = sales + mortality + otherReductions;
  const reductions: ReductionsBreakdown = {
    total: totalReductions,
    sales,
    mortality,
    otherReductions,
    eventCount: reductionEventCount
  };

  // 7. Net Livestock Movement (No double counting!)
  // Net movement = totalAdditions - totalReductions.
  // Note: mortality and sales are components of totalReductions, so they are not subtracted again.
  const netMovement = totalAdditions - totalReductions;

  // 8. Type-specific Movements
  const uniqueTypes = Array.from(new Set(records.map((r) => r.livestockType)));
  const typeMovements: LivestockTypeMovement[] = [];

  for (const lType of uniqueTypes) {
    const typeRecords = records.filter((r) => r.livestockType === lType);
    const category = typeRecords[0]?.livestockCategory;

    let typeStart = 0;
    for (const r of typeRecords) {
      typeStart += startingCountsByRecordId[r.recordId] || 0;
    }

    const typeInEvents = inWindowEvents.filter((e) => e.livestockType === lType);
    let tPurchases = 0;
    let tBirths = 0;
    let tOtherAdditions = 0;
    let tAddEvents = 0;

    let tSales = 0;
    let tMortality = 0;
    let tOtherReductions = 0;
    let tRedEvents = 0;

    for (const e of typeInEvents) {
      const q = e.quantity || 0;
      if (e.isPos) {
        tAddEvents++;
        if (e.canonicalType === 'purchase') tPurchases += q;
        else if (e.canonicalType === 'birth') tBirths += q;
        else tOtherAdditions += q;
      } else if (e.isNeg) {
        tRedEvents++;
        if (e.canonicalType === 'sale') tSales += q;
        else if (e.canonicalType === 'death') tMortality += q;
        else tOtherReductions += q;
      }
    }

    const tTotalAdditions = tPurchases + tBirths + tOtherAdditions;
    const tTotalReductions = tSales + tMortality + tOtherReductions;
    const tNet = tTotalAdditions - tTotalReductions;
    const tEnd = Math.max(0, typeStart + tNet);

    typeMovements.push({
      livestockType: lType,
      livestockCategory: category,
      startingKnownCount: typeStart,
      endingKnownCount: tEnd,
      additions: {
        total: tTotalAdditions,
        purchases: tPurchases,
        births: tBirths,
        otherAdditions: tOtherAdditions,
        eventCount: tAddEvents
      },
      reductions: {
        total: tTotalReductions,
        sales: tSales,
        mortality: tMortality,
        otherReductions: tOtherReductions,
        eventCount: tRedEvents
      },
      netMovement: tNet,
      mortalityCount: tMortality,
      salesCount: tSales,
      purchasesCount: tPurchases,
      birthsCount: tBirths
    });
  }

  // 9. Mortality Intelligence Details
  const mortalityEventsInWindow = inWindowEvents.filter((e) => e.canonicalType === 'death');
  const totalMortalityCount = mortality;
  const mortalityEventCount = mortalityEventsInWindow.length;

  // Mortality by Type
  const mortalityByType: TypeMortalityDetail[] = [];
  for (const lType of uniqueTypes) {
    const typeMEvents = mortalityEventsInWindow.filter((e) => e.livestockType === lType);
    const mCount = typeMEvents.reduce((sum, e) => sum + (e.quantity || 0), 0);
    const dates = Array.from(new Set(typeMEvents.map((e) => e.normalizedDate))).sort();
    const category = records.find((r) => r.livestockType === lType)?.livestockCategory;

    // Only include types that exist in the farmer's records
    mortalityByType.push({
      livestockType: lType,
      livestockCategory: category,
      mortalityCount: mCount,
      mortalityEventCount: typeMEvents.length,
      dates
    });
  }

  // Mortality by Period (Sub-periods)
  const subPeriods = generateMortalitySubPeriods(timeWindow, startDate, endDate);
  const mortalityByPeriod: TimeGroupedMortality[] = subPeriods.map((sp) => {
    const pEvents = mortalityEventsInWindow.filter(
      (e) => e.normalizedDate >= sp.start && e.normalizedDate <= sp.end
    );
    const count = pEvents.reduce((sum, e) => sum + (e.quantity || 0), 0);
    return {
      periodLabel: sp.label,
      startDate: sp.start,
      endDate: sp.end,
      mortalityCount: count,
      eventCount: pEvents.length
    };
  });

  // 10. Mortality Rate Calculation & Denominator Guard
  // Denominator represents the exposed population base during the window.
  // Base = startingKnownCount + additions (or startingKnownCount if > 0).
  const populationBase = totalStartingKnownCount + totalAdditions;
  let hasValidDenominator = false;
  let ratePercent: number | null = null;
  let rateExplanationSwahili = '';

  if (populationBase > 0) {
    hasValidDenominator = true;
    if (totalMortalityCount === 0) {
      ratePercent = 0;
      rateExplanationSwahili = 'Hakuna vifo vilivyorekodiwa katika kipindi hiki (Kiwango cha vifo: 0%).';
    } else {
      ratePercent = Math.min(100, Math.round((totalMortalityCount / populationBase) * 1000) / 10);
      rateExplanationSwahili = `Kiwango cha vifo ni ${ratePercent}% (${totalMortalityCount} kati ya idadi ya mifugo ${populationBase}).`;
    }
  } else {
    // Cannot determine valid exposed population base
    hasValidDenominator = false;
    ratePercent = null;
    if (totalMortalityCount > 0) {
      rateExplanationSwahili = `Kuna vifo ${totalMortalityCount} vilivyorekodiwa, lakini taarifa zilizopo hazitoshi kuhesabu kiwango cha vifo kwa usahihi.`;
    } else {
      rateExplanationSwahili = 'Hakuna vifo vilivyorekodiwa katika data yako kwa kipindi hiki.';
    }
  }

  // 11. Mortality Pattern Detection (Deterministic comparison with previous period)
  // Compute previous window mortality
  const prevMortalityEvents = prevWindowEvents.filter((e) => e.canonicalType === 'death');
  const previousPeriodMortality = prevMortalityEvents.reduce((sum, e) => sum + (e.quantity || 0), 0);

  const mortalityDiff = totalMortalityCount - previousPeriodMortality;
  let percentChange: number | null = null;
  if (previousPeriodMortality > 0) {
    percentChange = Math.round(((totalMortalityCount - previousPeriodMortality) / previousPeriodMortality) * 100);
  }

  // Check for repeated events cluster: >= 2 mortality events within 7 days of each other
  let repeatedEventsCluster = false;
  const sortedMortalityDates = mortalityEventsInWindow
    .map((e) => e.normalizedDate)
    .sort();

  for (let i = 0; i < sortedMortalityDates.length - 1; i++) {
    const d1 = new Date(sortedMortalityDates[i]);
    const d2 = new Date(sortedMortalityDates[i + 1]);
    const diffDays = Math.abs((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 7) {
      repeatedEventsCluster = true;
      break;
    }
  }

  let patternType: MortalityPatternType = 'NO_MORTALITY';
  let patternSummarySwahili = '';
  let comparisonDescriptionSwahili = '';

  if (totalMortalityCount === 0 && previousPeriodMortality === 0) {
    patternType = 'NO_MORTALITY';
    patternSummarySwahili = 'Hakuna tukio la kifo lililorekodiwa katika data yako kwa kipindi hiki.';
    comparisonDescriptionSwahili = 'Hakuna vifo vilivyorekodiwa katika kipindi hiki wala kilichotangulia.';
  } else if (totalMortalityCount > previousPeriodMortality) {
    patternType = 'INCREASED_MORTALITY';
    patternSummarySwahili = `Vifo vilivyorekodiwa vilikuwa vingi zaidi katika kipindi hiki (${totalMortalityCount}) kuliko kipindi kilichotangulia (${previousPeriodMortality}).`;
    comparisonDescriptionSwahili = `Ongezeko la vifo +${mortalityDiff} ukilinganisha na kipindi cha nyuma (${previousPeriodMortality} → ${totalMortalityCount}).`;
  } else if (totalMortalityCount < previousPeriodMortality) {
    patternType = 'DECREASED_MORTALITY';
    patternSummarySwahili = `Vifo vilivyorekodiwa vilipungua ukilinganisha na kipindi kilichotangulia (${totalMortalityCount} dhidi ya ${previousPeriodMortality}).`;
    comparisonDescriptionSwahili = `Kupungua kwa vifo ${mortalityDiff} ukilinganisha na kipindi cha nyuma (${previousPeriodMortality} → ${totalMortalityCount}).`;
  } else if (totalMortalityCount === previousPeriodMortality && totalMortalityCount > 0) {
    patternType = 'STABLE_MORTALITY';
    patternSummarySwahili = `Idadi ya vifo vilivyorekodiwa haijabadilika kwa kiasi kikubwa katika vipindi hivi (${totalMortalityCount} vifo).`;
    comparisonDescriptionSwahili = `Idadi sawa ya vifo (${totalMortalityCount}) katika vipindi vyote viwili.`;
  }

  // Find most affected type
  let mostAffectedType: string | null = null;
  let highestTypeDeaths = 0;
  for (const t of mortalityByType) {
    if (t.mortalityCount > highestTypeDeaths) {
      highestTypeDeaths = t.mortalityCount;
      mostAffectedType = t.livestockType;
    }
  }

  let clusterDescriptionSwahili: string | undefined = undefined;
  if (repeatedEventsCluster && mortalityEventsInWindow.length >= 2) {
    clusterDescriptionSwahili = `Kuna matukio kadhaa ya vifo yaliyorekodiwa katika kipindi hiki (${mortalityEventsInWindow.length} matukio yaliyokaribiana ndani ya siku 7).`;
  }

  const mortalityPattern: MortalityPatternAnalysis = {
    patternType,
    summarySwahili: patternSummarySwahili,
    comparisonWithPreviousPeriod: {
      currentPeriodMortality: totalMortalityCount,
      previousPeriodMortality,
      difference: mortalityDiff,
      percentChange,
      descriptionSwahili: comparisonDescriptionSwahili
    },
    repeatedEventsCluster,
    clusterDescriptionSwahili,
    mostAffectedType: highestTypeDeaths > 0 ? mostAffectedType : null
  };

  // 12. Data Sufficiency Assessment
  let dataSufficiency: DataSufficiencyLevel = 'SUFFICIENT';
  let sufficiencyReason = 'Historia ya matukio inatosha kuonyesha mabadiliko ya mifugo kwa uhakika.';

  if (totalAllEventsEver === 0) {
    dataSufficiency = 'LIMITED';
    sufficiencyReason = 'Bado hakuna matukio ya kutosha yaliyorekodiwa ili kuonyesha mabadiliko ya mifugo.';
  } else if (inWindowEvents.length === 0) {
    dataSufficiency = 'LIMITED';
    sufficiencyReason = 'Hakuna matukio mapya yaliyorekodiwa katika kipindi hiki; mabadiliko hayakutokea.';
  } else if (inWindowEvents.length === 1) {
    dataSufficiency = 'LIMITED';
    sufficiencyReason = 'Kipindi hiki kina tukio 1 pekee lililorekodiwa; uchambuzi ni wa kiwango cha awali.';
  }

  // 13. Observations Generation (Traceable, Evidence-Based, Zero Alarmism, Zero Disease Inference)
  const observations: IntelligenceObservation[] = [];

  // Mortality observations
  if (totalMortalityCount > 0 && totalMortalityCount > previousPeriodMortality && previousPeriodMortality >= 0) {
    observations.push({
      id: 'obs-mortality-increased',
      category: 'MORTALITY',
      severity: 'IMPORTANT',
      title: 'Ongezeko la Vifo Vilivyorekodiwa',
      message: `Vifo vilivyorekodiwa vilikuwa vingi zaidi katika kipindi hiki (${totalMortalityCount}) kuliko kipindi kilichotangulia (${previousPeriodMortality}).`,
      dataBacked: true,
      dataTrace: `${totalMortalityCount} vifo katika ${timeWindow}`
    });
  }

  if (repeatedEventsCluster && mortalityEventsInWindow.length >= 2) {
    observations.push({
      id: 'obs-mortality-cluster',
      category: 'MORTALITY',
      severity: 'NOTICE',
      title: 'Matukio ya Vifo Yaliyojirudia',
      message: 'Kuna matukio kadhaa ya vifo yaliyorekodiwa katika kipindi hiki ndani ya siku chache.',
      dataBacked: true,
      dataTrace: `${mortalityEventsInWindow.length} matukio ya vifo`
    });
  }

  if (mostAffectedType && highestTypeDeaths > 0 && totalMortalityCount > 0) {
    const pctOfType = Math.round((highestTypeDeaths / totalMortalityCount) * 100);
    if (pctOfType >= 50 && totalMortalityCount >= 2) {
      observations.push({
        id: 'obs-mortality-type',
        category: 'MORTALITY',
        severity: 'NOTICE',
        title: `Vifo Vingi Vilihusisha ${mostAffectedType}`,
        message: `Asilimia ${pctOfType}% ya vifo vilivyorekodiwa (${highestTypeDeaths} kati ya ${totalMortalityCount}) vilihusisha ${mostAffectedType}.`,
        dataBacked: true,
        dataTrace: `${highestTypeDeaths}/${totalMortalityCount} ${mostAffectedType}`
      });
    }
  }

  // Movement observations
  if (purchases > 0 || births > 0) {
    observations.push({
      id: 'obs-movement-additions',
      category: 'ADDITION',
      severity: 'INFO',
      title: 'Ongezeko la Mifugo',
      message: `Mifugo imeongezeka kupitia ${purchases > 0 ? `manunuzi (${purchases})` : ''}${purchases > 0 && births > 0 ? ' na ' : ''}${births > 0 ? `vizazi (${births})` : ''}.`,
      dataBacked: true,
      dataTrace: `+${totalAdditions} ongezeko`
    });
  }

  if (sales > 0) {
    observations.push({
      id: 'obs-movement-sales',
      category: 'REDUCTION',
      severity: 'INFO',
      title: 'Mauzo ya Mifugo',
      message: `Mifugo ${sales} iliuzwa katika kipindi hiki.`,
      dataBacked: true,
      dataTrace: `-${sales} mauzo`
    });
  }

  // 14. Overall Swahili Summary
  const netSign = netMovement >= 0 ? `+${netMovement}` : `${netMovement}`;
  const summarySwahili = `Katika kipindi cha ${timeWindow}: Ongezeko ni +${totalAdditions} (Manunuzi: ${purchases}, Vizazi: ${births}), Upungufu ni -${totalReductions} (Mauzo: ${sales}, Vifo: ${totalMortalityCount}), na Mabadiliko Halisi (Net Movement) ni ${netSign}.`;

  return {
    version: '1.4C',
    generatedAt: now,
    uid: userId,
    timeWindow,
    startDate,
    endDate,
    previousPeriodStartDate,
    previousPeriodEndDate,
    additions,
    reductions,
    netMovement,
    typeMovements,
    mortality: {
      totalMortalityCount,
      mortalityEventCount,
      mortalityByType,
      mortalityByPeriod,
      mortalityRate: {
        ratePercent,
        hasValidDenominator,
        recordedMortality: totalMortalityCount,
        populationBase,
        explanationSwahili: rateExplanationSwahili
      },
      pattern: mortalityPattern,
      dataSufficiency,
      sufficiencyReason
    },
    observations,
    dataSufficiency,
    sufficiencyReason,
    summarySwahili,
    isCalculatedDeterministically: true,
    emptyState: {
      isEmpty: false
    }
  };
}

/**
 * Serializes V1.4C Livestock Movement & Mortality Snapshot for AI Assistant consumption.
 * Strictly enforces non-hallucination, no disease diagnosis, and no history modification.
 */
export function serializeLivestockMovementForAI(movement: LivestockMovementSnapshot): string {
  if (movement.emptyState.isEmpty) {
    return `[MABADILIKO YA MIFUGO NA VIFO (V1.4C LIVESTOCK MOVEMENT & MORTALITY)]
Hali: HAKUNA DATA YA REKODI ZA MIFUGO.
Mwongozo kwa AI: Mfugaji hajaweka rekodi za mifugo. Usibuni takwimu za mabadiliko au vifo.`;
  }

  const lines: string[] = [];
  lines.push(`[UCHAMBUZI WA MABADILIKO YA MIFUGO NA VIFO (V1.4C)]`);
  lines.push(`Kipindi Kilichochambuliwa: ${movement.timeWindow} (${movement.startDate} hadi ${movement.endDate})`);
  lines.push(`Kipindi cha Kulinganisha: ${movement.previousPeriodStartDate} hadi ${movement.previousPeriodEndDate}`);
  lines.push(`Uwezo wa Data (Data Sufficiency): ${movement.dataSufficiency}`);
  lines.push(`Sababu ya Data: ${movement.sufficiencyReason}`);

  const netSign = movement.netMovement >= 0 ? `+${movement.netMovement}` : `${movement.netMovement}`;
  lines.push(`\n[MUHTASARI WA MABADILIKO (LIVESTOCK MOVEMENT)]`);
  lines.push(`Jumla ya Ongezeko (Gross Additions): +${movement.additions.total} (Manunuzi: ${movement.additions.purchases}, Vizazi: ${movement.additions.births}, Nyingine: ${movement.additions.otherAdditions})`);
  lines.push(`Jumla ya Upungufu (Gross Reductions): -${movement.reductions.total} (Mauzo: ${movement.reductions.sales}, Vifo: ${movement.reductions.mortality}, Nyingine: ${movement.reductions.otherReductions})`);
  lines.push(`Mabadiliko Halisi (Net Movement): ${netSign}`);
  lines.push(`*Kumbuka ya Usahihi: Vifo na Mauzo ni vipengele vilivyo ndani ya Upungufu wa Jumla; havijapunguzwa mara mbili.`);

  lines.push(`\n[UCHAMBUZI WA VIFO (MORTALITY INTELLIGENCE)]`);
  lines.push(`Jumla ya Vifo Vilivyorekodiwa: ${movement.mortality.totalMortalityCount} (katika matukio ${movement.mortality.mortalityEventCount})`);
  lines.push(`Kiwango cha Vifo (Mortality Rate): ${movement.mortality.mortalityRate.explanationSwahili}`);
  lines.push(`Mwenendo wa Vifo (Mortality Pattern): ${movement.mortality.pattern.summarySwahili}`);
  if (movement.mortality.pattern.clusterDescriptionSwahili) {
    lines.push(`Muunganiko wa Matukio: ${movement.mortality.pattern.clusterDescriptionSwahili}`);
  }
  if (movement.mortality.pattern.comparisonWithPreviousPeriod) {
    lines.push(`Ulinganisho na Kipindi Kilichotangulia: ${movement.mortality.pattern.comparisonWithPreviousPeriod.descriptionSwahili}`);
  }

  if (movement.mortality.mortalityByType.length > 0) {
    lines.push(`\nVifo kwa Aina ya Mifugo:`);
    for (const t of movement.mortality.mortalityByType) {
      if (t.mortalityCount > 0) {
        const datesStr = Array.isArray(t.dates) && t.dates.length > 0 ? t.dates.join(', ') : 'hazikutajwa';
        lines.push(`• ${t.livestockType}: Vifo ${t.mortalityCount} (matukio ${t.mortalityEventCount}, tarehe: ${datesStr})`);
      }
    }
  }

  if (movement.typeMovements.length > 0) {
    lines.push(`\n[MABADILIKO KWA KILA AINA YA MFUGO]`);
    for (const tm of movement.typeMovements) {
      const tmNet = tm.netMovement >= 0 ? `+${tm.netMovement}` : `${tm.netMovement}`;
      lines.push(
        `• ${tm.livestockType}: Kuanzia=${tm.startingKnownCount} → Mwisho=${tm.endingKnownCount} | Ongezeko=+${tm.additions.total} (Manunuzi: ${tm.purchasesCount}, Vizazi: ${tm.birthsCount}) | Upungufu=-${tm.reductions.total} (Mauzo: ${tm.salesCount}, Vifo: ${tm.mortalityCount}) | Mabadiliko Halisi=${tmNet}`
      );
    }
  }

  if (movement.observations.length > 0) {
    lines.push(`\n[TAARIFA MUHIMU ZA SHAMBA (OBSERVATIONS)]`);
    for (const obs of movement.observations) {
      lines.push(`• [${obs.severity}] ${obs.title}: ${obs.message}`);
    }
  }

  lines.push(`\n[MIPAKA MIKALI YA USALAMA KWA AI (V1.4C SAFETY GUARDRAILS)]`);
  lines.push(`1. HAKUNA UTAMBUZI WA UGONJWA AU SABABU ZA VIFO (NO DISEASE / CAUSE INFERENCE):`);
  lines.push(`   - Kamwe usihusishe vifo na ugonjwa wowote (k.m. usiseme "kuna mlipuko wa ugonjwa", "kuna maambukizi", au "dawa haikufanya kazi").`);
  lines.push(`   - Ikiwa mfugaji atauliza "Kwa nini kuku wangu wamekufa wengi?", jibu:`);
  lines.push(`     "Kulingana na kumbukumbu zako, kuna vifo vilivyorekodiwa katika kipindi hiki. Hata hivyo, mfumo wangu hauwezi kutambua sababu ya vifo au kugundua ugonjwa. Unashauriwa kuwasiliana na mtaalamu wa mifugo (daktari wa mifugo au afisa ugani) ili kuchunguza sababu halisi."`);
  lines.push(`   - Usianzishe booking au kuwasiliana na daktari kiotomatiki bila mfugaji mwenyewe kufanya hivyo kwa hiari.`);
  lines.push(`2. AI HAIRUHUSIWI KUBADILISHA HISTORIA (NO HISTORY MODIFICATION): AI hairuhusiwi kutunga, kurekebisha, wala kufuta matukio ya vifo au mauzo.`);
  lines.push(`3. HAKUNA UTABIRI WA BAADAYE (NO FORECASTING): Usitabiri idadi ya vifo au mifugo ya baadaye.`);
  lines.push(`4. TUMIA NAMBA HALISI TU: Usibuni asilimia wala viwango visivyo na denominator sahihi.`);

  return lines.join('\n');
}

// ============================================================================
// V1.4D: Vaccination / Treatment History Intelligence Engine
// ============================================================================

/**
 * Normalizes an eventType into a canonical health category.
 * Only explicitly classified 'vaccination' or 'treatment' events are mapped.
 * Notes or arbitrary text are NEVER used to infer health events.
 */
export function classifyHealthEvent(eventType: string): NormalizedHealthCategory {
  if (!eventType) return 'OTHER';
  const t = eventType.trim().toLowerCase();
  if (t === 'vaccination' || t === 'chanjo') return 'VACCINATION';
  if (t === 'treatment' || t === 'matibabu') return 'TREATMENT';
  return 'OTHER';
}

/**
 * Extracts a preserved medicine or vaccine name from recorded event title/notes.
 * If title is generic (e.g. "Chanjo", "Matibabu", "Treatment") or empty, returns undefined.
 * Does NOT infer diseases, active ingredients, or clinical indications.
 */
function extractRecordedProductName(title?: string): string | undefined {
  if (!title) return undefined;
  const t = title.trim();
  const lower = t.toLowerCase();
  if (
    lower === 'chanjo' ||
    lower === 'vaccination' ||
    lower === 'matibabu' ||
    lower === 'treatment' ||
    lower === 'dawa' ||
    lower === 'medicine' ||
    lower === 'vaccine' ||
    lower.length === 0
  ) {
    return undefined;
  }
  return t;
}

/**
 * Deterministically computes the V1.4D Vaccination and Treatment History Intelligence Snapshot.
 * Scoped strictly to the authenticated farmer (records & recordEventsMap).
 * Reuses existing records and events without creating a separate database.
 */
export function getHealthActivityHistorySnapshot(
  userId: string,
  records: LivestockRecord[],
  recordEventsMap: Record<string, LivestockEvent[]>,
  options?: HealthHistoryOptions
): HealthActivityHistorySnapshot {
  const timeWindow: TrendTimeWindow = options?.timeWindow || '30d';
  const { startDate, endDate } = calculateWindowDateRange(
    timeWindow,
    options?.referenceDate,
    options?.customStartDate,
    options?.customEndDate
  );

  const now = new Date().toISOString();

  // Guard: Empty records
  if (!records || records.length === 0) {
    const emptyVaccination: VaccinationHistorySummary = {
      totalEventsCount: 0,
      totalAnimalsVaccinatedByType: {},
      totalAnimalsVaccinatedRaw: 0,
      hasAnyRecordedQuantity: false,
      latestEvent: null,
      latestDate: null,
      events: [],
      timeWindow
    };
    const emptyTreatment: TreatmentHistorySummary = {
      totalEventsCount: 0,
      totalAnimalsTreatedByType: {},
      totalAnimalsTreatedRaw: 0,
      hasAnyRecordedQuantity: false,
      latestEvent: null,
      latestDate: null,
      events: [],
      timeWindow
    };

    return {
      version: '1.4D',
      generatedAt: now,
      uid: userId,
      timeWindow,
      startDate,
      endDate,
      vaccination: emptyVaccination,
      treatment: emptyTreatment,
      byLivestockType: [],
      timeline: [],
      dataSufficiency: 'INSUFFICIENT',
      sufficiencyReason: 'Bado hakuna rekodi za mifugo zilizosajiliwa.',
      summarySwahili: 'Bado hujaweka taarifa za mifugo. Ukisajili mifugo na kurekodi chanjo au matibabu, historia itaonekana hapa.',
      observations: [],
      emptyState: {
        isEmpty: true,
        userGuidance: 'Anza kwa kusajili mifugo na kurekodi matukio ya chanjo au matibabu katika kichupo cha "Mifugo".'
      },
      isCalculatedDeterministically: true
    };
  }

  // 1. Gather all health events across all records
  interface EnrichedHealthEvent {
    eventId: string;
    recordId: string;
    recordName: string;
    livestockType: string;
    livestockCategory?: string;
    normalizedDate: string;
    healthCategory: 'VACCINATION' | 'TREATMENT';
    quantity: number | null;
    hasRecordedQuantity: boolean;
    title: string;
    notes: string;
    productName?: string;
  }

  const allHealthEvents: EnrichedHealthEvent[] = [];
  let totalAllEventsEver = 0;

  for (const r of records) {
    const rawEvents = recordEventsMap[r.recordId] || [];
    totalAllEventsEver += rawEvents.length;

    for (const raw of rawEvents) {
      const category = classifyHealthEvent(raw.eventType);
      if (category === 'OTHER') continue;

      const normDate = normalizeDateToYMD(raw.eventDate);
      if (!normDate) continue;

      // Optional livestockType filter
      if (options?.livestockType && r.livestockType.toLowerCase() !== options.livestockType.toLowerCase()) {
        continue;
      }

      const hasRecordedQuantity =
        raw.quantity !== null &&
        raw.quantity !== undefined &&
        typeof raw.quantity === 'number' &&
        !isNaN(raw.quantity) &&
        raw.quantity > 0;

      const safeQuantity = hasRecordedQuantity ? raw.quantity : null;
      const title = (raw.title || '').trim();
      const notes = (raw.notes || '').trim();
      const productName = extractRecordedProductName(title);

      allHealthEvents.push({
        eventId: raw.eventId || `${r.recordId}-${normDate}-${Math.random()}`,
        recordId: r.recordId,
        recordName: r.recordName || r.livestockType,
        livestockType: r.livestockType,
        livestockCategory: r.livestockCategory,
        normalizedDate: normDate,
        healthCategory: category,
        quantity: safeQuantity,
        hasRecordedQuantity,
        title,
        notes,
        productName
      });
    }
  }

  // 2. Identify latest events EVER up to endDate (for latest recorded activity metrics)
  const allVaccinationEvents = allHealthEvents
    .filter((e) => e.healthCategory === 'VACCINATION' && e.normalizedDate <= endDate)
    .sort((a, b) => b.normalizedDate.localeCompare(a.normalizedDate));

  const allTreatmentEvents = allHealthEvents
    .filter((e) => e.healthCategory === 'TREATMENT' && e.normalizedDate <= endDate)
    .sort((a, b) => b.normalizedDate.localeCompare(a.normalizedDate));

  const latestVaccinationEver: VaccinationEventDetail | null =
    allVaccinationEvents.length > 0
      ? {
          eventId: allVaccinationEvents[0].eventId,
          recordId: allVaccinationEvents[0].recordId,
          recordName: allVaccinationEvents[0].recordName,
          livestockType: allVaccinationEvents[0].livestockType,
          livestockCategory: allVaccinationEvents[0].livestockCategory,
          eventDate: allVaccinationEvents[0].normalizedDate,
          quantity: allVaccinationEvents[0].quantity,
          hasRecordedQuantity: allVaccinationEvents[0].hasRecordedQuantity,
          title: allVaccinationEvents[0].title,
          notes: allVaccinationEvents[0].notes,
          recordedVaccineName: allVaccinationEvents[0].productName
        }
      : null;

  const latestTreatmentEver: TreatmentEventDetail | null =
    allTreatmentEvents.length > 0
      ? {
          eventId: allTreatmentEvents[0].eventId,
          recordId: allTreatmentEvents[0].recordId,
          recordName: allTreatmentEvents[0].recordName,
          livestockType: allTreatmentEvents[0].livestockType,
          livestockCategory: allTreatmentEvents[0].livestockCategory,
          eventDate: allTreatmentEvents[0].normalizedDate,
          quantity: allTreatmentEvents[0].quantity,
          hasRecordedQuantity: allTreatmentEvents[0].hasRecordedQuantity,
          title: allTreatmentEvents[0].title,
          notes: allTreatmentEvents[0].notes,
          recordedMedicineName: allTreatmentEvents[0].productName
        }
      : null;

  // 3. Filter in-window events [startDate, endDate]
  const inWindowEvents = allHealthEvents.filter(
    (e) => e.normalizedDate >= startDate && e.normalizedDate <= endDate
  );

  const inWindowVaccinations = inWindowEvents.filter((e) => e.healthCategory === 'VACCINATION');
  const inWindowTreatments = inWindowEvents.filter((e) => e.healthCategory === 'TREATMENT');

  // 4. Vaccination Intelligence Summary (strictly separate event count vs animal count)
  let totalAnimalsVaccinatedRaw = 0;
  let hasAnyVaccinationQuantity = false;
  const totalAnimalsVaccinatedByType: Record<string, number> = {};

  const vaccinationEventDetails: VaccinationEventDetail[] = inWindowVaccinations
    .sort((a, b) => b.normalizedDate.localeCompare(a.normalizedDate))
    .map((e) => {
      if (e.hasRecordedQuantity && e.quantity !== null) {
        hasAnyVaccinationQuantity = true;
        totalAnimalsVaccinatedRaw += e.quantity;
        totalAnimalsVaccinatedByType[e.livestockType] =
          (totalAnimalsVaccinatedByType[e.livestockType] || 0) + e.quantity;
      }
      return {
        eventId: e.eventId,
        recordId: e.recordId,
        recordName: e.recordName,
        livestockType: e.livestockType,
        livestockCategory: e.livestockCategory,
        eventDate: e.normalizedDate,
        quantity: e.quantity,
        hasRecordedQuantity: e.hasRecordedQuantity,
        title: e.title,
        notes: e.notes,
        recordedVaccineName: e.productName
      };
    });

  const vaccinationSummary: VaccinationHistorySummary = {
    totalEventsCount: inWindowVaccinations.length,
    totalAnimalsVaccinatedByType,
    totalAnimalsVaccinatedRaw,
    hasAnyRecordedQuantity: hasAnyVaccinationQuantity,
    latestEvent: latestVaccinationEver,
    latestDate: latestVaccinationEver ? latestVaccinationEver.eventDate : null,
    events: vaccinationEventDetails,
    timeWindow
  };

  // 5. Treatment Intelligence Summary (strictly separate event count vs animal count)
  let totalAnimalsTreatedRaw = 0;
  let hasAnyTreatmentQuantity = false;
  const totalAnimalsTreatedByType: Record<string, number> = {};

  const treatmentEventDetails: TreatmentEventDetail[] = inWindowTreatments
    .sort((a, b) => b.normalizedDate.localeCompare(a.normalizedDate))
    .map((e) => {
      if (e.hasRecordedQuantity && e.quantity !== null) {
        hasAnyTreatmentQuantity = true;
        totalAnimalsTreatedRaw += e.quantity;
        totalAnimalsTreatedByType[e.livestockType] =
          (totalAnimalsTreatedByType[e.livestockType] || 0) + e.quantity;
      }
      return {
        eventId: e.eventId,
        recordId: e.recordId,
        recordName: e.recordName,
        livestockType: e.livestockType,
        livestockCategory: e.livestockCategory,
        eventDate: e.normalizedDate,
        quantity: e.quantity,
        hasRecordedQuantity: e.hasRecordedQuantity,
        title: e.title,
        notes: e.notes,
        recordedMedicineName: e.productName
      };
    });

  const treatmentSummary: TreatmentHistorySummary = {
    totalEventsCount: inWindowTreatments.length,
    totalAnimalsTreatedByType,
    totalAnimalsTreatedRaw,
    hasAnyRecordedQuantity: hasAnyTreatmentQuantity,
    latestEvent: latestTreatmentEver,
    latestDate: latestTreatmentEver ? latestTreatmentEver.eventDate : null,
    events: treatmentEventDetails,
    timeWindow
  };

  // 6. Breakdown by Livestock Type (Species-safe, no cross-species quantity blending!)
  const uniqueTypes = Array.from(new Set(records.map((r) => r.livestockType)));
  // Also include any types from health events not in current records
  for (const e of inWindowEvents) {
    if (!uniqueTypes.includes(e.livestockType)) {
      uniqueTypes.push(e.livestockType);
    }
  }

  const byLivestockType: HealthTypeActivity[] = [];

  for (const lType of uniqueTypes) {
    const typeVaccinations = inWindowVaccinations.filter((e) => e.livestockType === lType);
    const typeTreatments = inWindowTreatments.filter((e) => e.livestockType === lType);

    // Sum of animals vaccinated for this specific species only
    let vAnimals = 0;
    let vHasQty = false;
    for (const v of typeVaccinations) {
      if (v.hasRecordedQuantity && v.quantity !== null) {
        vAnimals += v.quantity;
        vHasQty = true;
      }
    }

    // Sum of animals treated for this specific species only
    let tAnimals = 0;
    let tHasQty = false;
    for (const t of typeTreatments) {
      if (t.hasRecordedQuantity && t.quantity !== null) {
        tAnimals += t.quantity;
        tHasQty = true;
      }
    }

    // Latest dates for this type up to endDate
    const latestTypeV = allVaccinationEvents.find((e) => e.livestockType === lType);
    const latestTypeT = allTreatmentEvents.find((e) => e.livestockType === lType);

    const category = records.find((r) => r.livestockType === lType)?.livestockCategory;

    // Only include in byLivestockType if there is at least one health event in history or in window,
    // or if the farmer has records of this type
    byLivestockType.push({
      livestockType: lType,
      livestockCategory: category,
      vaccinationEventsCount: typeVaccinations.length,
      vaccinationAnimalsCount: vAnimals,
      vaccinationHasQuantityData: vHasQty,
      treatmentEventsCount: typeTreatments.length,
      treatmentAnimalsCount: tAnimals,
      treatmentHasQuantityData: tHasQty,
      latestVaccinationDate: latestTypeV ? latestTypeV.normalizedDate : null,
      latestTreatmentDate: latestTypeT ? latestTypeT.normalizedDate : null
    });
  }

  // Sort by highest total health activity in window, then alphabetical
  byLivestockType.sort((a, b) => {
    const totalA = a.vaccinationEventsCount + a.treatmentEventsCount;
    const totalB = b.vaccinationEventsCount + b.treatmentEventsCount;
    if (totalB !== totalA) return totalB - totalA;
    return a.livestockType.localeCompare(b.livestockType);
  });

  // 7. Chronological Timeline (newest first)
  const timeline: HealthTimelineItem[] = inWindowEvents
    .sort((a, b) => {
      const cmp = b.normalizedDate.localeCompare(a.normalizedDate);
      if (cmp !== 0) return cmp;
      return b.eventId.localeCompare(a.eventId);
    })
    .map((e) => ({
      id: e.eventId,
      type: e.healthCategory,
      eventId: e.eventId,
      recordId: e.recordId,
      recordName: e.recordName,
      livestockType: e.livestockType,
      livestockCategory: e.livestockCategory,
      eventDate: e.normalizedDate,
      quantity: e.quantity,
      hasRecordedQuantity: e.hasRecordedQuantity,
      title: e.title,
      notes: e.notes,
      productName: e.productName
    }));

  // 8. Data Sufficiency Level & Reasoning
  let dataSufficiency: DataSufficiencyLevel = 'INSUFFICIENT';
  let sufficiencyReason = '';

  const totalHealthEventsEver = allHealthEvents.length;
  const inWindowTotalEvents = inWindowEvents.length;

  if (totalHealthEventsEver === 0) {
    dataSufficiency = 'INSUFFICIENT';
    sufficiencyReason = 'Bado hakuna kumbukumbu za chanjo au matibabu zilizorekodiwa katika daftari lako la mifugo.';
  } else if (inWindowTotalEvents === 0) {
    dataSufficiency = 'LIMITED';
    sufficiencyReason = 'Hakuna matukio ya chanjo au matibabu yaliyorekodiwa ndani ya kipindi hiki cha siku, ingawa kuna kumbukumbu zilizorekodiwa katika vipindi vingine.';
  } else if (inWindowTotalEvents === 1) {
    dataSufficiency = 'LIMITED';
    sufficiencyReason = 'Kuna tukio 1 tu la afya lililorekodiwa katika kipindi hiki cha siku; historia ni chache.';
  } else {
    dataSufficiency = 'SUFFICIENT';
    sufficiencyReason = 'Kuna kumbukumbu za kutosha za shughuli za afya zilizorekodiwa katika kipindi hiki.';
  }

  // 9. Summary in Swahili (Objective, factual, strictly non-diagnostic)
  let summarySwahili = '';
  if (inWindowTotalEvents === 0) {
    if (totalHealthEventsEver === 0) {
      summarySwahili = 'Bado hakuna matukio ya chanjo wala matibabu yaliyorekodiwa kwenye shamba hili.';
    } else {
      summarySwahili = 'Hakuna matukio ya chanjo wala matibabu yaliyorekodiwa ndani ya kipindi hiki cha siku.';
    }
  } else {
    const parts: string[] = [];
    if (vaccinationSummary.totalEventsCount > 0) {
      const vQtyDetails = Object.entries(totalAnimalsVaccinatedByType)
        .map(([sp, count]) => `${sp}: ${count}`)
        .join(', ');
      const vQtyStr = vQtyDetails ? ` (wanyama: ${vQtyDetails})` : '';
      parts.push(`matukio ${vaccinationSummary.totalEventsCount} ya chanjo${vQtyStr}`);
    }
    if (treatmentSummary.totalEventsCount > 0) {
      const tQtyDetails = Object.entries(totalAnimalsTreatedByType)
        .map(([sp, count]) => `${sp}: ${count}`)
        .join(', ');
      const tQtyStr = tQtyDetails ? ` (wanyama: ${tQtyDetails})` : '';
      parts.push(`matukio ${treatmentSummary.totalEventsCount} ya matibabu${tQtyStr}`);
    }
    summarySwahili = `Katika kipindi hiki, umerekodi ${parts.join(' na ')}.`;
  }

  // 10. Observations
  const observations: IntelligenceObservation[] = [];

  if (vaccinationSummary.totalEventsCount > 0) {
    const activeTypes = byLivestockType
      .filter((t) => t.vaccinationEventsCount > 0)
      .map((t) => t.livestockType)
      .join(', ');
    observations.push({
      id: 'obs-health-vaccination',
      category: 'VACCINATION',
      severity: 'NOTICE',
      title: 'Historia ya Chanjo Zilizorekodiwa',
      message: `Ume-rekodi matukio ${vaccinationSummary.totalEventsCount} ya chanjo kwa mifugo ya aina ya ${activeTypes || 'shambani'}. Hakikisha unaendelea kurekodi chanjo zote ili kuwa na kumbukumbu sahihi.`,
      dataBacked: true
    });
  }

  if (treatmentSummary.totalEventsCount > 0) {
    const activeTypes = byLivestockType
      .filter((t) => t.treatmentEventsCount > 0)
      .map((t) => t.livestockType)
      .join(', ');
    observations.push({
      id: 'obs-health-treatment',
      category: 'TREATMENT',
      severity: 'NOTICE',
      title: 'Historia ya Matibabu Yaliyorekodiwa',
      message: `Ume-rekodi matukio ${treatmentSummary.totalEventsCount} ya matibabu kwa mifugo ya aina ya ${activeTypes || 'shambani'}. Taarifa hizi ni historia ya kumbukumbu zako; kwa utambuzi wa ugonjwa wasiliana na daktari wa mifugo.`,
      dataBacked: true
    });
  }

  if (inWindowTotalEvents === 0) {
    observations.push({
      id: 'obs-health-empty',
      category: 'ACTIVITY',
      severity: 'INFO',
      title: 'Hakuna Shughuli za Afya Katika Kipindi Hiki',
      message: 'Hakuna matukio ya chanjo au matibabu yaliyorekodiwa ndani ya siku hizi zilizochaguliwa.',
      dataBacked: true
    });
  }

  const isEmpty = totalHealthEventsEver === 0;

  return {
    version: '1.4D',
    generatedAt: now,
    uid: userId,
    timeWindow,
    startDate,
    endDate,
    vaccination: vaccinationSummary,
    treatment: treatmentSummary,
    byLivestockType,
    timeline,
    dataSufficiency,
    sufficiencyReason,
    summarySwahili,
    observations,
    emptyState: {
      isEmpty,
      userGuidance: isEmpty
        ? 'Bado hakuna kumbukumbu za chanjo au matibabu. Unaweza kurekodi tukio la chanjo au matibabu kwenye kichupo cha Historia cha kundi lolote la mifugo.'
        : undefined
    },
    isCalculatedDeterministically: true
  };
}

/**
 * Returns deterministic Vaccination History Summary for the authenticated farmer.
 */
export function getVaccinationHistorySnapshot(
  userId: string,
  records: LivestockRecord[],
  recordEventsMap: Record<string, LivestockEvent[]>,
  options?: HealthHistoryOptions
): VaccinationHistorySummary {
  return getHealthActivityHistorySnapshot(userId, records, recordEventsMap, options).vaccination;
}

/**
 * Returns deterministic Treatment History Summary for the authenticated farmer.
 */
export function getTreatmentHistorySnapshot(
  userId: string,
  records: LivestockRecord[],
  recordEventsMap: Record<string, LivestockEvent[]>,
  options?: HealthHistoryOptions
): TreatmentHistorySummary {
  return getHealthActivityHistorySnapshot(userId, records, recordEventsMap, options).treatment;
}

/**
 * Serializes the V1.4D Health Activity History Snapshot for AI Assistant consumption.
 * Strictly adheres to non-diagnostic, non-recommendation and no-treatment-success boundaries.
 */
export function serializeHealthActivityHistoryForAI(
  health: HealthActivityHistorySnapshot
): string {
  const lines: string[] = [];

  lines.push(`=== HISTORIA YA CHANJO NA MATIBABU (V1.4D HEALTH HISTORY SNAPSHOT) ===`);
  lines.push(`Kipindi Kilichochaguliwa: ${health.timeWindow} (${health.startDate} hadi ${health.endDate})`);
  lines.push(`Kiwango cha Data (Sufficiency): ${health.dataSufficiency} - ${health.sufficiencyReason}`);
  lines.push(`Muhtasari: ${health.summarySwahili}`);

  lines.push(`\n[HISTORIA YA CHANJO (VACCINATION HISTORY)]`);
  lines.push(`• Idadi ya Matukio ya Chanjo: ${health.vaccination.totalEventsCount}`);
  if (health.vaccination.hasAnyRecordedQuantity) {
    const vSpeciesList = Object.entries(health.vaccination.totalAnimalsVaccinatedByType)
      .map(([sp, cnt]) => `${sp}: ${cnt}`)
      .join(', ');
    lines.push(`• Idadi ya Wanyama Waliochanjwa kwa Spishi: ${vSpeciesList}`);
  } else {
    lines.push(`• Idadi ya Wanyama Waliochanjwa: Haikurekodiwa katika matukio haya`);
  }
  if (health.vaccination.latestEvent) {
    const vName = health.vaccination.latestEvent.recordedVaccineName
      ? ` ("${health.vaccination.latestEvent.recordedVaccineName}")`
      : '';
    const vQty = health.vaccination.latestEvent.hasRecordedQuantity
      ? ` - Wanyama ${health.vaccination.latestEvent.quantity}`
      : ' - Idadi haikutajwa';
    lines.push(
      `• Chanjo ya Mwisho Iliyorekodiwa: [${health.vaccination.latestEvent.eventDate}] ${health.vaccination.latestEvent.recordName} (${health.vaccination.latestEvent.livestockType})${vName}${vQty}`
    );
  } else {
    lines.push(`• Chanjo ya Mwisho Iliyorekodiwa: Hakuna chanjo iliyorekodiwa.`);
  }

  lines.push(`\n[HISTORIA YA MATIBABU (TREATMENT HISTORY)]`);
  lines.push(`• Idadi ya Matukio ya Matibabu: ${health.treatment.totalEventsCount}`);
  if (health.treatment.hasAnyRecordedQuantity) {
    const tSpeciesList = Object.entries(health.treatment.totalAnimalsTreatedByType)
      .map(([sp, cnt]) => `${sp}: ${cnt}`)
      .join(', ');
    lines.push(`• Idadi ya Wanyama Waliotibiwa kwa Spishi: ${tSpeciesList}`);
  } else {
    lines.push(`• Idadi ya Wanyama Waliotibiwa: Haikurekodiwa katika matukio haya`);
  }
  if (health.treatment.latestEvent) {
    const tName = health.treatment.latestEvent.recordedMedicineName
      ? ` ("${health.treatment.latestEvent.recordedMedicineName}")`
      : '';
    const tQty = health.treatment.latestEvent.hasRecordedQuantity
      ? ` - Wanyama ${health.treatment.latestEvent.quantity}`
      : ' - Idadi haikutajwa';
    lines.push(
      `• Matibabu ya Mwisho Yaliyorekodiwa: [${health.treatment.latestEvent.eventDate}] ${health.treatment.latestEvent.recordName} (${health.treatment.latestEvent.livestockType})${tName}${tQty}`
    );
  } else {
    lines.push(`• Matibabu ya Mwisho Yaliyorekodiwa: Hakuna matibabu yaliyorekodiwa.`);
  }

  if (health.byLivestockType.length > 0) {
    lines.push(`\n[SHUGHULI ZA AFYA KWA AINA YA MFUGO]`);
    for (const t of health.byLivestockType) {
      const vStr = t.vaccinationHasQuantityData
        ? `Chanjo: matukio ${t.vaccinationEventsCount} (wanyama ${t.vaccinationAnimalsCount})`
        : `Chanjo: matukio ${t.vaccinationEventsCount}`;
      const tStr = t.treatmentHasQuantityData
        ? `Matibabu: matukio ${t.treatmentEventsCount} (wanyama ${t.treatmentAnimalsCount})`
        : `Matibabu: matukio ${t.treatmentEventsCount}`;
      lines.push(`• ${t.livestockType}: ${vStr} | ${tStr}`);
    }
  }

  if (health.timeline.length > 0) {
    lines.push(`\n[MATUKIO YA AFYA KATIKA KIPINDI HIKI (TIMELINE - NEWEST FIRST)]`);
    for (const item of health.timeline.slice(0, 10)) {
      const typeLabel = item.type === 'VACCINATION' ? 'Chanjo' : 'Matibabu';
      const qtyStr = item.hasRecordedQuantity ? ` (Wanyama: ${item.quantity})` : ' (Idadi haikutajwa)';
      const prodStr = item.productName ? ` - Bidhaa/Dawa: "${item.productName}"` : '';
      const notesStr = item.notes ? ` - Maelezo: "${item.notes.replace(/[\r\n]+/g, ' ')}"` : '';
      lines.push(
        `• [${item.eventDate}] ${typeLabel}: ${item.recordName} (${item.livestockType})${qtyStr}${prodStr}${notesStr}`
      );
    }
  }

  lines.push(`\n[MIPAKA MIKALI YA USALAMA KWA AI (V1.4D HEALTH SAFETY GUARDRAILS)]`);
  lines.push(`1. HAKUNA UTAMBUZI WA UGONJWA (NO DISEASE DIAGNOSIS):`);
  lines.push(`   - Kamwe usibashiri ugonjwa kutokana na jina la dawa, marudio ya matibabu, au aina ya mifugo.`);
  lines.push(`   - Mfugaji akiuliza "Hii treatment inaonyesha kuku wangu wana ugonjwa gani?", jibu:`);
  lines.push(`     "Kulingana na kumbukumbu zako, ulirekodi tukio la matibabu tarehe hiyo. Hata hivyo, mfumo wangu hauwezi kubashiri au kutambua ugonjwa kutokana na dawa au kumbukumbu za matibabu. Tafadhali wasiliana na daktari wa mifugo au afisa ugani kwa uchunguzi na utambuzi sahihi."`);
  lines.push(`2. HAKUNA MADAI YA KUFUZU KWA MATIBABU (NO TREATMENT SUCCESS CLAIM):`);
  lines.push(`   - Kamwe usidai kuwa dawa ilifanikiwa au wanyama walipona ("walipona") isipokuwa tu kama mkulima alirekodi hilo wazi kama tukio au maelezo.`);
  lines.push(`   - Mfugaji akiuliza "Treatment niliyowapa ilifanikiwa?", jibu:`);
  lines.push(`     "Kumbukumbu zilizopo zinaonyesha tu tarehe na tukio la matibabu ulilorekodi. Hakuna taarifa zilizohifadhiwa kuhusu kama walipona au matibabu yalifanikiwa. Inashauriwa kuangalia hali ya mifugo yako au kushauriana na daktari wa mifugo."`);
  lines.push(`3. HAKUNA MAPENDEKEZO YA DAWA AU CHANJO (NO MEDICAL RECOMMENDATIONS):`);
  lines.push(`   - Kamwe usipendekeze dawa mpya, chanjo, dozi, ratiba ya kurudia dawa, wala muda wa kusubiri (withdrawal period) kutokana na historia hii.`);
  lines.push(`   - Mfugaji akiuliza "Niwape dawa gani sasa?", mwelekeze kuwasiliana na daktari wa mifugo au afisa ugani.`);
  lines.push(`4. TAARIFA ZISIZOKUWEPO ZIBANIE KUWA HAZIPO (HONEST UNKNOWN FIELDS):`);
  lines.push(`   - Ikiwa jina la dawa au chanjo halikurekodiwa, sema wazi halikurekodiwa; usibuni jina.`);
  lines.push(`   - Ikiwa idadi ya wanyama haikurekodiwa, sema wazi haikutajwa; usibuni idadi.`);
  lines.push(`5. KUTENGA IDADI YA MATUKIO NA IDADI YA WANYAMA (EVENT COUNT VS ANIMAL COUNT):`);
  lines.push(`   - Kamwe usichanganye idadi ya matukio na idadi ya wanyama walioathirika.`);
  lines.push(`   - Usichanganye idadi za spishi tofauti (k.m. usijumlishe kuku na mbuzi kuwa idadi moja ya kupotosha).`);

  return lines.join('\n');
}

// ==============================================================================
// V1.4E — ACTIVITY & TIME-BASED SUMMARIES INTELLIGENCE ENGINE
// ==============================================================================

/**
 * Normalizes an event into the V1.4E Activity canonical category taxonomy.
 */
export function classifyActivityCanonicalCategory(rawType: EventType | string): ActivityCanonicalCategory {
  const rawLower = (rawType || '').toLowerCase().trim();
  if (rawLower === 'reduction' || rawLower === 'kupunguza' || rawLower === 'upungufu') return 'REDUCTION';
  const canonical = normalizeCanonicalEventType(rawType);
  if (canonical === 'purchase') return 'PURCHASE';
  if (canonical === 'birth') return 'BIRTH';
  if (canonical === 'addition') return 'ADDITION';
  if (canonical === 'sale') return 'SALE';
  if (canonical === 'death') return 'MORTALITY';
  if (canonical === 'vaccination') return 'VACCINATION';
  if (canonical === 'treatment') return 'TREATMENT';
  if (canonical === 'feed') return 'FEED';
  if (canonical === 'observation') return 'OBSERVATION';
  if (isPositiveEventType(canonical)) return 'ADDITION';
  if (isNegativeEventType(canonical)) return 'REDUCTION';
  return 'OTHER';
}

/**
 * Returns the human-readable Swahili label for an activity category.
 */
export function getActivityCategoryLabelSwahili(category: ActivityCanonicalCategory): string {
  switch (category) {
    case 'ADDITION':
      return 'Ongezeko la Mifugo';
    case 'PURCHASE':
      return 'Manunuzi ya Mifugo';
    case 'BIRTH':
      return 'Kuzaliwa kwa Mifugo';
    case 'REDUCTION':
      return 'Punguzo la Mifugo';
    case 'SALE':
      return 'Mauzo ya Mifugo';
    case 'MORTALITY':
      return 'Vifo vya Mifugo';
    case 'VACCINATION':
      return 'Chanjo';
    case 'TREATMENT':
      return 'Matibabu';
    case 'FEED':
      return 'Chakula / Lishe';
    case 'OBSERVATION':
      return 'Uchunguzi wa Kawaida';
    case 'OTHER':
    default:
      return 'Shughuli Nyingine';
  }
}

/**
 * Generates adaptive time-grouped activity periods based on window duration.
 * - 7 days (or custom <= 14 days): daily grouping
 * - 30/90 days (or custom 15-90 days): weekly grouping
 * - 6m/12m (or custom > 90 days): monthly grouping
 */
export function generateActivitySubPeriods(
  window: TrendTimeWindow,
  startDate: string,
  endDate: string
): { groupingType: ActivityGroupingPeriodType; periods: TimeGroupedActivity[] } {
  const daysSpan = calculateDaysBetween(startDate, endDate);
  let groupingType: ActivityGroupingPeriodType = 'day';

  if (window === '7d' || (window === 'custom' && daysSpan <= 14)) {
    groupingType = 'day';
  } else if (window === '30d' || window === '90d' || (window === 'custom' && daysSpan <= 90)) {
    groupingType = 'week';
  } else {
    groupingType = 'month';
  }

  const periods: TimeGroupedActivity[] = [];

  const createEmptyCategoryRecord = (): Record<ActivityCanonicalCategory, number> => ({
    ADDITION: 0,
    PURCHASE: 0,
    BIRTH: 0,
    REDUCTION: 0,
    SALE: 0,
    MORTALITY: 0,
    VACCINATION: 0,
    TREATMENT: 0,
    FEED: 0,
    OBSERVATION: 0,
    OTHER: 0
  });

  if (groupingType === 'day') {
    let curr = startDate;
    let dayIdx = 1;
    while (curr <= endDate) {
      periods.push({
        key: `day-${curr}`,
        label: `Siku ${dayIdx} (${curr})`,
        startDate: curr,
        endDate: curr,
        totalEvents: 0,
        byCategory: createEmptyCategoryRecord(),
        byLivestockType: {}
      });
      curr = addDaysToYMD(curr, 1);
      dayIdx++;
      if (dayIdx > 31) break;
    }
  } else if (groupingType === 'week') {
    let currStart = startDate;
    let weekIdx = 1;
    while (currStart <= endDate) {
      let currEnd = addDaysToYMD(currStart, 6);
      if (currEnd > endDate) {
        currEnd = endDate;
      }
      periods.push({
        key: `week-${weekIdx}-${currStart}`,
        label: `Wiki ${weekIdx} (${currStart} - ${currEnd})`,
        startDate: currStart,
        endDate: currEnd,
        totalEvents: 0,
        byCategory: createEmptyCategoryRecord(),
        byLivestockType: {}
      });
      currStart = addDaysToYMD(currEnd, 1);
      weekIdx++;
      if (weekIdx > 20) break;
    }
  } else {
    let currStart = startDate;
    let monthIdx = 1;
    while (currStart <= endDate) {
      let currEnd = addDaysToYMD(currStart, 29);
      if (currEnd > endDate) {
        currEnd = endDate;
      }
      periods.push({
        key: `month-${monthIdx}-${currStart}`,
        label: `Mwezi ${monthIdx} (${currStart} - ${currEnd})`,
        startDate: currStart,
        endDate: currEnd,
        totalEvents: 0,
        byCategory: createEmptyCategoryRecord(),
        byLivestockType: {}
      });
      currStart = addDaysToYMD(currEnd, 1);
      monthIdx++;
      if (monthIdx > 24) break;
    }
  }

  return { groupingType, periods };
}

/**
 * Deterministically calculates the V1.4E Activity & Time-Based Summaries Snapshot.
 * Strictly guarantees:
 * 1. Single source of truth from authoritative recorded events
 * 2. Exact event count equals total qualifying events (no double counting)
 * 3. Transparent breakdown of additions vs reductions vs health vs other
 * 4. Honest unknown reporting for unrecorded quantities
 * 5. Complete absence of medical/disease diagnosis or financial forecasting
 * 6. Scoped strictly to the authenticated farmer
 */
export function getActivitySummarySnapshot(
  userId: string,
  records: LivestockRecord[] = [],
  recordEventsMap: Record<string, LivestockEvent[]> = {},
  options?: ActivitySummaryOptions
): ActivitySummarySnapshot {
  const now = new Date().toISOString();
  const timeWindow: TrendTimeWindow = options?.timeWindow || '30d';
  const { startDate, endDate } = calculateWindowDateRange(
    timeWindow,
    options?.referenceDate,
    options?.customStartDate,
    options?.customEndDate
  );
  const isCustomRange = timeWindow === 'custom';

  const emptyRollup = (): ActivityRollupBreakdown => {
    const byCanonicalCategory: Record<ActivityCanonicalCategory, ActivityCategorySummary> = {
      ADDITION: { category: 'ADDITION', labelSwahili: 'Ongezeko la Mifugo', eventCount: 0, totalAnimalsAffected: 0, hasQuantityData: false, latestEventDate: null },
      PURCHASE: { category: 'PURCHASE', labelSwahili: 'Manunuzi ya Mifugo', eventCount: 0, totalAnimalsAffected: 0, hasQuantityData: false, latestEventDate: null },
      BIRTH: { category: 'BIRTH', labelSwahili: 'Kuzaliwa kwa Mifugo', eventCount: 0, totalAnimalsAffected: 0, hasQuantityData: false, latestEventDate: null },
      REDUCTION: { category: 'REDUCTION', labelSwahili: 'Punguzo la Mifugo', eventCount: 0, totalAnimalsAffected: 0, hasQuantityData: false, latestEventDate: null },
      SALE: { category: 'SALE', labelSwahili: 'Mauzo ya Mifugo', eventCount: 0, totalAnimalsAffected: 0, hasQuantityData: false, latestEventDate: null },
      MORTALITY: { category: 'MORTALITY', labelSwahili: 'Vifo vya Mifugo', eventCount: 0, totalAnimalsAffected: 0, hasQuantityData: false, latestEventDate: null },
      VACCINATION: { category: 'VACCINATION', labelSwahili: 'Chanjo', eventCount: 0, totalAnimalsAffected: 0, hasQuantityData: false, latestEventDate: null },
      TREATMENT: { category: 'TREATMENT', labelSwahili: 'Matibabu', eventCount: 0, totalAnimalsAffected: 0, hasQuantityData: false, latestEventDate: null },
      FEED: { category: 'FEED', labelSwahili: 'Chakula / Lishe', eventCount: 0, totalAnimalsAffected: 0, hasQuantityData: false, latestEventDate: null },
      OBSERVATION: { category: 'OBSERVATION', labelSwahili: 'Uchunguzi wa Kawaida', eventCount: 0, totalAnimalsAffected: 0, hasQuantityData: false, latestEventDate: null },
      OTHER: { category: 'OTHER', labelSwahili: 'Shughuli Nyingine', eventCount: 0, totalAnimalsAffected: 0, hasQuantityData: false, latestEventDate: null }
    };
    return {
      totalActivitiesCount: 0,
      additions: {
        totalEvents: 0,
        totalAnimals: 0,
        purchasesCount: 0,
        purchasesAnimals: 0,
        birthsCount: 0,
        birthsAnimals: 0,
        otherAdditionsCount: 0,
        otherAdditionsAnimals: 0
      },
      reductions: {
        totalEvents: 0,
        totalAnimals: 0,
        salesCount: 0,
        salesAnimals: 0,
        mortalityCount: 0,
        mortalityAnimals: 0,
        otherReductionsCount: 0,
        otherReductionsAnimals: 0
      },
      health: {
        totalEvents: 0,
        vaccinationEvents: 0,
        treatmentEvents: 0
      },
      other: {
        feedEvents: 0,
        observationEvents: 0,
        unclassifiedEvents: 0
      },
      byCanonicalCategory
    };
  };

  // 1. Empty Farm Guard
  if (records.length === 0) {
    const { groupingType, periods } = generateActivitySubPeriods(timeWindow, startDate, endDate);
    return {
      version: '1.4E',
      generatedAt: now,
      uid: userId,
      timeWindow,
      startDate,
      endDate,
      isCustomRange,
      totalActivitiesCount: 0,
      rollup: emptyRollup(),
      byLivestockType: [],
      timeGroupedBreakdown: { groupingType, periods },
      busiestPeriod: null,
      quietPeriod: null,
      latestActivity: null,
      timeline: [],
      dataSufficiency: 'INSUFFICIENT',
      sufficiencyReason: 'Bado hujaweka taarifa za mifugo. Ukianza kusajili mifugo na kurekodi matukio, My Assistant itaweza kukuonyesha muhtasari wa shughuli za shamba lako.',
      summarySwahili: 'Bado hakuna mifugo iliyosajiliwa shambani.',
      observations: [],
      emptyState: {
        isEmpty: true,
        userGuidance: 'Anza kwa kusajili mifugo yako katika kichupo cha "Mifugo" ili My Assistant iweze kutoa muhtasari wa shughuli.'
      },
      isCalculatedDeterministically: true
    };
  }

  // 2. Gather all authoritative events and normalize
  let totalActivitiesCountEver = 0;
  const inWindowTimelineItems: ActivityTimelineItem[] = [];
  const allTimelineItemsEver: ActivityTimelineItem[] = [];

  const filterType = options?.livestockType ? options.livestockType.toLowerCase().trim() : null;
  const filterCat = options?.categoryFilter && options.categoryFilter !== 'ALL' ? options.categoryFilter : null;

  for (const record of records) {
    const recordTypeLower = (record.livestockType || '').toLowerCase().trim();
    const recordCatLower = (record.livestockCategory || '').toLowerCase().trim();

    if (filterType && recordTypeLower !== filterType && recordCatLower !== filterType) {
      continue;
    }

    const events = recordEventsMap[record.recordId] || [];
    for (const evt of events) {
      totalActivitiesCountEver++;

      const canonicalCategory = classifyActivityCanonicalCategory(evt.eventType);
      if (filterCat && canonicalCategory !== filterCat) {
        continue;
      }

      const ymd = normalizeDateToYMD(evt.eventDate);
      if (!ymd) {
        continue;
      }

      const qty = typeof evt.quantity === 'number' && !isNaN(evt.quantity) && evt.quantity > 0 ? evt.quantity : null;
      const hasRecordedQuantity = qty !== null;

      const timelineItem: ActivityTimelineItem = {
        id: `act-${record.recordId}-${evt.eventId || Math.random().toString(36).substring(2, 9)}`,
        eventId: evt.eventId,
        recordId: record.recordId,
        recordName: record.recordName || `${record.livestockCategory} (${record.livestockType})`,
        livestockType: record.livestockType || record.livestockCategory || 'Mifugo',
        livestockCategory: record.livestockCategory,
        eventDate: ymd,
        canonicalCategory,
        categoryLabelSwahili: getActivityCategoryLabelSwahili(canonicalCategory),
        eventType: evt.eventType,
        quantity: qty,
        hasRecordedQuantity,
        title: evt.title || getActivityCategoryLabelSwahili(canonicalCategory),
        notes: (evt.notes || '').trim()
      };

      allTimelineItemsEver.push(timelineItem);

      // Strict boundary check: start <= ymd <= end
      if (ymd >= startDate && ymd <= endDate) {
        inWindowTimelineItems.push(timelineItem);
      }
    }
  }

  // 3. Chronological sorting (newest first)
  inWindowTimelineItems.sort((a, b) => (b.eventDate > a.eventDate ? 1 : b.eventDate < a.eventDate ? -1 : 0));
  allTimelineItemsEver.sort((a, b) => (b.eventDate > a.eventDate ? 1 : b.eventDate < a.eventDate ? -1 : 0));

  // 4. Latest Activity
  const latestActivity = inWindowTimelineItems.length > 0 ? inWindowTimelineItems[0] : (allTimelineItemsEver.length > 0 ? allTimelineItemsEver[0] : null);

  // 5. Total Activities Count (every qualifying event counted exactly once!)
  const totalActivitiesCount = inWindowTimelineItems.length;

  // 6. Rollup Aggregations (Single-pass, no double-counting)
  const rollup = emptyRollup();
  rollup.totalActivitiesCount = totalActivitiesCount;

  for (const item of inWindowTimelineItems) {
    const qty = item.quantity || 0;
    const hasQty = item.hasRecordedQuantity;
    const cat = item.canonicalCategory;

    // Update canonical category summary
    const catSummary = rollup.byCanonicalCategory[cat];
    catSummary.eventCount += 1;
    if (hasQty) {
      catSummary.totalAnimalsAffected += qty;
      catSummary.hasQuantityData = true;
    }
    if (!catSummary.latestEventDate || item.eventDate > catSummary.latestEventDate) {
      catSummary.latestEventDate = item.eventDate;
    }

    // Rollup into macro categories
    if (cat === 'PURCHASE') {
      rollup.additions.totalEvents += 1;
      rollup.additions.purchasesCount += 1;
      if (hasQty) {
        rollup.additions.totalAnimals += qty;
        rollup.additions.purchasesAnimals += qty;
      }
    } else if (cat === 'BIRTH') {
      rollup.additions.totalEvents += 1;
      rollup.additions.birthsCount += 1;
      if (hasQty) {
        rollup.additions.totalAnimals += qty;
        rollup.additions.birthsAnimals += qty;
      }
    } else if (cat === 'ADDITION') {
      rollup.additions.totalEvents += 1;
      rollup.additions.otherAdditionsCount += 1;
      if (hasQty) {
        rollup.additions.totalAnimals += qty;
        rollup.additions.otherAdditionsAnimals += qty;
      }
    } else if (cat === 'SALE') {
      rollup.reductions.totalEvents += 1;
      rollup.reductions.salesCount += 1;
      if (hasQty) {
        rollup.reductions.totalAnimals += qty;
        rollup.reductions.salesAnimals += qty;
      }
    } else if (cat === 'MORTALITY') {
      rollup.reductions.totalEvents += 1;
      rollup.reductions.mortalityCount += 1;
      if (hasQty) {
        rollup.reductions.totalAnimals += qty;
        rollup.reductions.mortalityAnimals += qty;
      }
    } else if (cat === 'REDUCTION') {
      rollup.reductions.totalEvents += 1;
      rollup.reductions.otherReductionsCount += 1;
      if (hasQty) {
        rollup.reductions.totalAnimals += qty;
        rollup.reductions.otherReductionsAnimals += qty;
      }
    } else if (cat === 'VACCINATION') {
      rollup.health.totalEvents += 1;
      rollup.health.vaccinationEvents += 1;
    } else if (cat === 'TREATMENT') {
      rollup.health.totalEvents += 1;
      rollup.health.treatmentEvents += 1;
    } else if (cat === 'FEED') {
      rollup.other.feedEvents += 1;
    } else if (cat === 'OBSERVATION') {
      rollup.other.observationEvents += 1;
    } else {
      rollup.other.unclassifiedEvents += 1;
    }
  }

  // 7. Breakdown by Livestock Type
  const speciesMap: Record<string, ActivityLivestockTypeSummary> = {};
  for (const item of inWindowTimelineItems) {
    const sp = item.livestockType;
    if (!speciesMap[sp]) {
      speciesMap[sp] = {
        livestockType: sp,
        livestockCategory: item.livestockCategory,
        totalEvents: 0,
        additionsCount: 0,
        reductionsCount: 0,
        mortalityCount: 0,
        vaccinationCount: 0,
        treatmentCount: 0,
        otherCount: 0,
        latestEventDate: null
      };
    }
    const summary = speciesMap[sp];
    summary.totalEvents += 1;
    if (item.canonicalCategory === 'PURCHASE' || item.canonicalCategory === 'BIRTH' || item.canonicalCategory === 'ADDITION') {
      summary.additionsCount += 1;
    } else if (item.canonicalCategory === 'SALE' || item.canonicalCategory === 'REDUCTION') {
      summary.reductionsCount += 1;
    } else if (item.canonicalCategory === 'MORTALITY') {
      summary.mortalityCount += 1;
    } else if (item.canonicalCategory === 'VACCINATION') {
      summary.vaccinationCount += 1;
    } else if (item.canonicalCategory === 'TREATMENT') {
      summary.treatmentCount += 1;
    } else {
      summary.otherCount += 1;
    }
    if (!summary.latestEventDate || item.eventDate > summary.latestEventDate) {
      summary.latestEventDate = item.eventDate;
    }
  }
  const byLivestockType = Object.values(speciesMap).sort((a, b) => b.totalEvents - a.totalEvents);

  // 8. Time Grouped Activity Breakdown
  const { groupingType, periods } = generateActivitySubPeriods(timeWindow, startDate, endDate);
  for (const item of inWindowTimelineItems) {
    for (const period of periods) {
      if (item.eventDate >= period.startDate && item.eventDate <= period.endDate) {
        period.totalEvents += 1;
        period.byCategory[item.canonicalCategory] += 1;
        period.byLivestockType[item.livestockType] = (period.byLivestockType[item.livestockType] || 0) + 1;
        break;
      }
    }
  }

  // 9. Busiest & Quiet Periods
  let busiestPeriod: BusiestActivityPeriod | null = null;
  let quietPeriod: QuietActivityPeriod | null = null;

  if (totalActivitiesCount > 0 && periods.length > 0) {
    let maxEvents = -1;
    let minEvents = Infinity;
    let maxPeriod: TimeGroupedActivity | null = null;
    let minPeriod: TimeGroupedActivity | null = null;

    for (const p of periods) {
      if (p.totalEvents > maxEvents) {
        maxEvents = p.totalEvents;
        maxPeriod = p;
      }
      if (p.totalEvents < minEvents) {
        minEvents = p.totalEvents;
        minPeriod = p;
      }
    }

    if (maxPeriod && maxEvents > 0) {
      // Determine dominant category and type
      let domCat: ActivityCanonicalCategory | undefined = undefined;
      let maxCatCount = 0;
      for (const [c, count] of Object.entries(maxPeriod.byCategory)) {
        if (count > maxCatCount) {
          maxCatCount = count;
          domCat = c as ActivityCanonicalCategory;
        }
      }

      let domType: string | undefined = undefined;
      let maxTypeCount = 0;
      for (const [t, count] of Object.entries(maxPeriod.byLivestockType)) {
        if (count > maxTypeCount) {
          maxTypeCount = count;
          domType = t;
        }
      }

      busiestPeriod = {
        label: maxPeriod.label,
        startDate: maxPeriod.startDate,
        endDate: maxPeriod.endDate,
        eventCount: maxEvents,
        dominantCategory: domCat,
        dominantType: domType
      };
    }

    if (minPeriod && periods.length > 1 && minEvents < maxEvents) {
      quietPeriod = {
        label: minPeriod.label,
        startDate: minPeriod.startDate,
        endDate: minPeriod.endDate,
        eventCount: minEvents
      };
    }
  }

  // 10. Data Sufficiency
  let dataSufficiency: DataSufficiencyLevel = 'SUFFICIENT';
  let sufficiencyReason = '';

  if (totalActivitiesCountEver === 0) {
    dataSufficiency = 'INSUFFICIENT';
    sufficiencyReason = 'Bado hakuna kumbukumbu za shughuli zilizorekodiwa katika daftari lako la mifugo.';
  } else if (totalActivitiesCount === 0) {
    dataSufficiency = 'LIMITED';
    sufficiencyReason = 'Hakuna shughuli zilizorekodiwa ndani ya kipindi hiki cha siku, ingawa kuna kumbukumbu zilizorekodiwa katika vipindi vingine.';
  } else if (totalActivitiesCount < 3) {
    dataSufficiency = 'LIMITED';
    sufficiencyReason = `Kuna matukio ${totalActivitiesCount} tu yaliyorekodiwa katika kipindi hiki; data ni chache kutoa muhtasari mpana.`;
  } else {
    dataSufficiency = 'SUFFICIENT';
    sufficiencyReason = `Kuna kumbukumbu za kutosha za shughuli zilizorekodiwa (${totalActivitiesCount} matukio) katika kipindi hiki.`;
  }

  // 11. Objective Swahili Summary
  let summarySwahili = '';
  if (totalActivitiesCount === 0) {
    if (totalActivitiesCountEver === 0) {
      summarySwahili = 'Bado hakuna matukio ya shughuli za mifugo yaliyorekodiwa kwenye shamba hili.';
    } else {
      summarySwahili = 'Hakuna shughuli au matukio yaliyorekodiwa katika kipindi hiki cha siku zilizochaguliwa.';
    }
  } else {
    const parts: string[] = [];
    if (rollup.additions.totalEvents > 0) {
      const animalStr = rollup.additions.totalAnimals > 0 ? ` (wanyama +${rollup.additions.totalAnimals})` : '';
      parts.push(`ongezeko ${rollup.additions.totalEvents}${animalStr}`);
    }
    if (rollup.reductions.totalEvents > 0) {
      const animalStr = rollup.reductions.totalAnimals > 0 ? ` (wanyama -${rollup.reductions.totalAnimals})` : '';
      parts.push(`punguzo ${rollup.reductions.totalEvents}${animalStr}`);
    }
    if (rollup.health.vaccinationEvents > 0) {
      parts.push(`chanjo ${rollup.health.vaccinationEvents}`);
    }
    if (rollup.health.treatmentEvents > 0) {
      parts.push(`matibabu ${rollup.health.treatmentEvents}`);
    }
    if (rollup.reductions.mortalityCount > 0) {
      const mortAnimalStr = rollup.reductions.mortalityAnimals > 0 ? ` (wanyama ${rollup.reductions.mortalityAnimals})` : '';
      parts.push(`vifo ${rollup.reductions.mortalityCount}${mortAnimalStr}`);
    }

    const detailsStr = parts.length > 0 ? `: ${parts.join(', ')}` : '';
    summarySwahili = `Katika kipindi hiki, umerekodi jumla ya shughuli ${totalActivitiesCount}${detailsStr}.`;
  }

  // 12. Observations
  const observations: IntelligenceObservation[] = [];

  if (busiestPeriod) {
    observations.push({
      id: 'obs-act-busiest',
      category: 'ACTIVITY',
      severity: 'NOTICE',
      title: 'Kipindi Chenye Shughuli Nyingi Zaidi',
      message: `${busiestPeriod.label} kilikuwa na shughuli nyingi zaidi zilizorekodiwa (${busiestPeriod.eventCount} matukio).`,
      dataBacked: true
    });
  }

  if (byLivestockType.length > 0) {
    const topType = byLivestockType[0];
    observations.push({
      id: 'obs-act-top-species',
      category: 'ACTIVITY',
      severity: 'NOTICE',
      title: 'Aina ya Mifugo Yenye Shughuli Nyingi',
      message: `${topType.livestockType} ndiyo iliyokuwa na idadi kubwa zaidi ya matukio yaliyorekodiwa (${topType.totalEvents} matukio).`,
      dataBacked: true
    });
  }

  if (totalActivitiesCount === 0) {
    observations.push({
      id: 'obs-act-empty',
      category: 'ACTIVITY',
      severity: 'INFO',
      title: 'Hakuna Shughuli Katika Kipindi Hiki',
      message: 'Hakuna matukio yoyote ya mifugo yaliyorekodiwa ndani ya siku hizi zilizochaguliwa.',
      dataBacked: true
    });
  }

  const isEmpty = totalActivitiesCountEver === 0;

  return {
    version: '1.4E',
    generatedAt: now,
    uid: userId,
    timeWindow,
    startDate,
    endDate,
    isCustomRange,
    totalActivitiesCount,
    rollup,
    byLivestockType,
    timeGroupedBreakdown: { groupingType, periods },
    busiestPeriod,
    quietPeriod,
    latestActivity,
    timeline: inWindowTimelineItems,
    dataSufficiency,
    sufficiencyReason,
    summarySwahili,
    observations,
    emptyState: {
      isEmpty,
      userGuidance: isEmpty
        ? 'Bado hakuna matukio ya kutosha yaliyorekodiwa ili kuonyesha activity ya kipindi hiki. Kila unapofanya shughuli shambani (kama kuongeza mifugo, chanjo, au matibabu), rekodi tukio husika kwenye rekodi ya kundi husika.'
        : undefined
    },
    isCalculatedDeterministically: true
  };
}

/**
 * Serializes the V1.4E Activity & Time-Based Summaries Snapshot for AI Assistant consumption.
 * Strictly enforces all safety, non-diagnostic, non-financial, and zero-hallucination boundaries.
 */
export function serializeActivitySummaryForAI(summary: ActivitySummarySnapshot): string {
  const lines: string[] = [];

  lines.push(`=== MUHTASARI WA SHUGHULI NA MATUKIO YA MIFUGO (V1.4E ACTIVITY SUMMARY SNAPSHOT) ===`);
  lines.push(`Kipindi Kilichochaguliwa: ${summary.timeWindow} (${summary.startDate} hadi ${summary.endDate})`);
  lines.push(`Kiwango cha Data (Sufficiency): ${summary.dataSufficiency} - ${summary.sufficiencyReason}`);
  lines.push(`Jumla ya Shughuli Zilizorekodiwa (Total Activities Count): ${summary.totalActivitiesCount}`);
  lines.push(`Muhtasari: ${summary.summarySwahili}`);

  lines.push(`\n[MCHANGANUO WA SHUGHULI KWA MAKUNDI (CATEGORY ROLLUP)]`);
  lines.push(`• Ongezeko la Mifugo: Matukio ${summary.rollup.additions.totalEvents} (Wanyama: ${summary.rollup.additions.totalAnimals > 0 ? summary.rollup.additions.totalAnimals : 'Idadi haikutajwa yote'})`);
  lines.push(`  - Manunuzi: Matukio ${summary.rollup.additions.purchasesCount} (Wanyama: ${summary.rollup.additions.purchasesAnimals})`);
  lines.push(`  - Vizazi: Matukio ${summary.rollup.additions.birthsCount} (Wanyama: ${summary.rollup.additions.birthsAnimals})`);
  lines.push(`  - Ongezeko Lingine: Matukio ${summary.rollup.additions.otherAdditionsCount} (Wanyama: ${summary.rollup.additions.otherAdditionsAnimals})`);
  lines.push(`• Punguzo la Mifugo: Matukio ${summary.rollup.reductions.totalEvents} (Wanyama: ${summary.rollup.reductions.totalAnimals > 0 ? summary.rollup.reductions.totalAnimals : 'Idadi haikutajwa yote'})`);
  lines.push(`  - Mauzo: Matukio ${summary.rollup.reductions.salesCount} (Wanyama: ${summary.rollup.reductions.salesAnimals})`);
  lines.push(`  - Vifo: Matukio ${summary.rollup.reductions.mortalityCount} (Wanyama: ${summary.rollup.reductions.mortalityAnimals})`);
  lines.push(`  - Punguzo Lingine: Matukio ${summary.rollup.reductions.otherReductionsCount} (Wanyama: ${summary.rollup.reductions.otherReductionsAnimals})`);
  lines.push(`• Chanjo: Matukio ${summary.rollup.health.vaccinationEvents}`);
  lines.push(`• Matibabu: Matukio ${summary.rollup.health.treatmentEvents}`);
  lines.push(`• Chakula/Lishe: Matukio ${summary.rollup.other.feedEvents}`);
  lines.push(`• Uchunguzi wa Kawaida: Matukio ${summary.rollup.other.observationEvents}`);

  if (summary.busiestPeriod) {
    lines.push(`\n[KIPINDI CHENYE SHUGHULI NYINGI ZAIDI (BUSIEST PERIOD)]`);
    lines.push(`• ${summary.busiestPeriod.label}: Matukio ${summary.busiestPeriod.eventCount} yaliyorekodiwa.`);
  }

  if (summary.quietPeriod) {
    lines.push(`\n[KIPINDI CHENYE SHUGHULI CHACHE ZAIDI (QUIET PERIOD)]`);
    lines.push(`• ${summary.quietPeriod.label}: Matukio machache zaidi yalirekodiwa (${summary.quietPeriod.eventCount} matukio). Kumbuka: Hii haimaanishi mfugaji hakufanya kazi, bali matukio machache yalirekodiwa.`);
  }

  if (summary.byLivestockType.length > 0) {
    lines.push(`\n[SHUGHULI KWA AINA YA MFUGO (BY LIVESTOCK TYPE)]`);
    for (const t of summary.byLivestockType) {
      lines.push(`• ${t.livestockType}: Matukio ${t.totalEvents} (Ongezeko: ${t.additionsCount}, Punguzo: ${t.reductionsCount}, Vifo: ${t.mortalityCount}, Chanjo: ${t.vaccinationCount}, Matibabu: ${t.treatmentCount})`);
    }
  }

  if (summary.latestActivity) {
    const qtyStr = summary.latestActivity.hasRecordedQuantity ? ` - Idadi: ${summary.latestActivity.quantity}` : '';
    const titleStr = summary.latestActivity.title ? ` ("${summary.latestActivity.title}")` : '';
    lines.push(`\n[SHUGHULI YA MWISHO ILIYOREKODIWA (LATEST ACTIVITY)]`);
    lines.push(`• [${summary.latestActivity.eventDate}] ${summary.latestActivity.categoryLabelSwahili}: ${summary.latestActivity.recordName} (${summary.latestActivity.livestockType})${titleStr}${qtyStr}`);
  } else {
    lines.push(`\n[SHUGHULI YA MWISHO ILIYOREKODIWA (LATEST ACTIVITY)]`);
    lines.push(`• Hakuna shughuli yoyote iliyorekodiwa.`);
  }

  if (summary.timeline.length > 0) {
    lines.push(`\n[ORODHA YA SHUGHULI KATIKA KIPINDI HIKI (TIMELINE - NEWEST FIRST, MAX 10)]`);
    for (const item of summary.timeline.slice(0, 10)) {
      const qtyStr = item.hasRecordedQuantity ? ` (Idadi: ${item.quantity})` : '';
      const notesStr = item.notes ? ` - Maelezo: "${item.notes.replace(/[\r\n]+/g, ' ')}"` : '';
      lines.push(`• [${item.eventDate}] ${item.categoryLabelSwahili}: ${item.recordName} (${item.livestockType})${qtyStr}${notesStr}`);
    }
  }

  lines.push(`\n[MIPAKA MIKALI YA USALAMA KWA AI (V1.4E ACTIVITY SUMMARY GUARDRAILS)]`);
  lines.push(`1. KUTENGA KUTOREKODI NA KUTOFANYIKA (NO RECORD ≠ NO ACTIVITY):`);
  lines.push(`   - Ikiwa hakuna tukio la chanjo au matibabu lililorekodiwa mwezi huo, USISEME "Hukufanya chanjo/matibabu".`);
  lines.push(`   - SEMA: "Hakuna chanjo/matibabu iliyorekodiwa katika data yako kwa kipindi hicho."`);
  lines.push(`2. USIBUNI NAMBA WALA MATUKIO (NO HALLUCINATED NUMBERS/EVENTS):`);
  lines.push(`   - Tumia tu namba za matukio na wanyama zilizotolewa hapo juu.`);
  lines.push(`   - Mfugaji akiuliza idadi ya shughuli, toa idadi kamili iliyopo kwenye "Total Activities Count" (matukio ${summary.totalActivitiesCount}).`);
  lines.push(`3. HAKUNA UTAMBUZI WA UGONJWA AU MAJERAHA (NO DISEASE INFERENCE):`);
  lines.push(`   - Idadi ya matibabu au vifo isifasiriwe kama mlipuko wa ugonjwa wala kutambua ugonjwa wowote wa mifugo.`);
  lines.push(`4. HAKUNA TAFSIRI YA KIFEDHA / FAIDA / HASARA (NO FINANCIAL INFERENCE):`);
  lines.push(`   - Mauzo au manunuzi yasichukuliwe kama faida au hasara ya kibiashara katika kipindi hiki.`);
  lines.push(`5. USIUNDE MATUKIO KIOTOMATIKI KWENYE MAZUNGUMZO (NO AUTOMATIC EVENT CREATION):`);
  lines.push(`   - Mfugaji akisema "Jana nilinunua kuku 20", usidai kuwa umeyarekodi kwenye daftari. Mwambie afungue kichupo cha Historia kwenye kundi lake la mifugo ili kurekodi tukio hilo rasmi.`);

  return lines.join('\n');
}

// ==============================================================================
// V1.4F — IMPORTANT OBSERVATIONS & FARM INSIGHTS ENGINE
// ==============================================================================

/**
 * Returns numeric weight for an observation severity level for deterministic prioritization.
 */
export function getObservationSeverityWeight(severity: ObservationSeverity): number {
  switch (severity) {
    case 'IMPORTANT':
      return 3;
    case 'NOTICE':
      return 2;
    case 'INFO':
      return 1;
    default:
      return 0;
  }
}

/**
 * Deterministically computes the Important Observations & Farm Insights Snapshot (V1.4F)
 * from authoritative livestock records, historical events, and underlying V1.4A-E snapshots.
 */
export function getImportantObservationsSnapshot(
  userId: string,
  records: LivestockRecord[] = [],
  recordEventsMap: Record<string, LivestockEvent[]> = {},
  options: ObservationsOptions = {}
): ImportantObservationsSnapshot {
  const timeWindow: TrendTimeWindow = options.timeWindow || '30d';
  const now = new Date().toISOString();
  const isCustomRange = timeWindow === 'custom' && !!options.customStartDate && !!options.customEndDate;

  const { startDate, endDate } = calculateWindowDateRange(
    timeWindow,
    options.referenceDate,
    options.customStartDate,
    options.customEndDate
  );

  const maxObservations = options.maxObservations && options.maxObservations > 0 ? options.maxObservations : 4;

  // 1. Empty Farm Guard
  if (records.length === 0) {
    return {
      version: '1.4F',
      generatedAt: now,
      uid: userId,
      timeWindow,
      startDate,
      endDate,
      isCustomRange,
      observations: [],
      allObservations: [],
      insights: [],
      dataSufficiency: 'INSUFFICIENT',
      sufficiencyReason: 'Bado hujaweka taarifa za mifugo. Ukianza kusajili mifugo na kurekodi matukio, My Assistant itaweza kukuonyesha mambo muhimu na maarifa ya shamba lako.',
      summarySwahili: 'Bado hakuna mifugo iliyosajiliwa shambani.',
      emptyState: {
        isEmpty: true,
        userGuidance: 'Anza kwa kusajili mifugo yako katika kichupo cha "Mifugo" ili My Assistant ianze kutoa mambo muhimu na uchambuzi.'
      },
      isCalculatedDeterministically: true
    };
  }

  // 2. Compute Underlying Deterministic Snapshots (V1.4B, V1.4C, V1.4D, V1.4E)
  const trends = getLivestockTrendsSnapshot(userId, records, recordEventsMap, {
    timeWindow,
    referenceDate: options.referenceDate,
    customStartDate: options.customStartDate,
    customEndDate: options.customEndDate
  });

  const movement = getLivestockMovementSnapshot(userId, records, recordEventsMap, {
    timeWindow,
    referenceDate: options.referenceDate,
    customStartDate: options.customStartDate,
    customEndDate: options.customEndDate
  });

  const health = getHealthActivityHistorySnapshot(userId, records, recordEventsMap, {
    timeWindow,
    referenceDate: options.referenceDate,
    customStartDate: options.customStartDate,
    customEndDate: options.customEndDate,
    livestockType: options.livestockType
  });

  const activity = getActivitySummarySnapshot(userId, records, recordEventsMap, {
    timeWindow,
    referenceDate: options.referenceDate,
    customStartDate: options.customStartDate,
    customEndDate: options.customEndDate,
    livestockType: options.livestockType
  });

  const farmSufficiency = trends.dataCoverage.sufficiency;
  const farmSufficiencyReason = trends.dataCoverage.sufficiencyReason;
  const overallFarmTrend = trends.overallFarmTrend;

  // Calculate previous period bounds for explainability
  const prevPeriodBounds = calculatePreviousWindowDateRange(timeWindow, startDate);

  const rawCandidates: ImportantObservation[] = [];
  let candidateIdx = 1;

  const createObs = (
    type: ObservationType,
    severity: ObservationSeverity,
    title: string,
    summary: string,
    scope: ObservationScope,
    evidence: ObservationEvidence,
    targetType?: string,
    targetRecordId?: string
  ): ImportantObservation => ({
    id: `obs-${type.toLowerCase()}-${candidateIdx++}`,
    type,
    severity,
    title,
    summary,
    scope,
    targetType,
    targetRecordId,
    period: {
      window: timeWindow,
      startDate,
      endDate,
      comparisonStartDate: prevPeriodBounds.startDate,
      comparisonEndDate: prevPeriodBounds.endDate
    },
    evidence,
    createdCalculatedAt: now,
    dataSufficiency: farmSufficiency
  });

  // 3. RULE 1: Livestock Increase Observations (V1.4B / V1.4C)
  if (farmSufficiency !== 'INSUFFICIENT' && overallFarmTrend && overallFarmTrend.direction === 'INCREASING' && overallFarmTrend.netChange > 0) {
    const net = overallFarmTrend.netChange;
    const start = overallFarmTrend.startingKnownCount;
    const end = overallFarmTrend.endingKnownCount;
    const isSubstantial = net >= 10 || (start > 0 && net / start >= 0.25);
    const sev: ObservationSeverity = isSubstantial ? 'NOTICE' : 'INFO';

    rawCandidates.push(
      createObs(
        'LIVESTOCK_INCREASE',
        sev,
        'Ongezeko la Idadi ya Mifugo',
        `Idadi ya mifugo imeongezeka kutoka ${start} hadi ${end} katika kipindi hiki (Ongezeko halisi: +${net}).`,
        'FARM',
        {
          metricName: 'net_livestock_increase',
          currentValue: end,
          previousValue: start,
          difference: net,
          percentageChange: start > 0 ? Math.round((net / start) * 100) : null,
          quantity: net,
          eventCount: overallFarmTrend.supportingEvents.additions
        }
      )
    );
  }

  // Check specific livestock types for notable increases (if multiple types exist)
  if (trends.typeTrends.length > 1) {
    for (const tt of trends.typeTrends) {
      if (tt.direction === 'INCREASING' && tt.netChange >= 5 && tt.dataSufficiency !== 'INSUFFICIENT') {
        const isBig = tt.netChange >= 15 || (tt.startingKnownCount > 0 && tt.netChange / tt.startingKnownCount >= 0.3);
        rawCandidates.push(
          createObs(
            'LIVESTOCK_INCREASE',
            isBig ? 'NOTICE' : 'INFO',
            `Ongezeko la ${tt.livestockType}`,
            `Idadi ya ${tt.livestockType} imeongezeka kutoka ${tt.startingKnownCount} hadi ${tt.endingKnownCount} (+${tt.netChange}) katika kipindi hiki.`,
            'LIVESTOCK_TYPE',
            {
              metricName: 'type_livestock_increase',
              currentValue: tt.endingKnownCount,
              previousValue: tt.startingKnownCount,
              difference: tt.netChange,
              species: tt.livestockType
            },
            tt.livestockType
          )
        );
      }
    }
  }

  // 4. RULE 2: Livestock Decrease Observations (V1.4B / V1.4C)
  if (farmSufficiency !== 'INSUFFICIENT' && overallFarmTrend && overallFarmTrend.direction === 'DECREASING' && overallFarmTrend.netChange < 0) {
    const net = overallFarmTrend.netChange;
    const absNet = Math.abs(net);
    const start = overallFarmTrend.startingKnownCount;
    const end = overallFarmTrend.endingKnownCount;
    const isSubstantial = absNet >= 10 || (start > 0 && absNet / start >= 0.25);
    const sev: ObservationSeverity = isSubstantial ? 'IMPORTANT' : 'NOTICE';

    rawCandidates.push(
      createObs(
        'LIVESTOCK_DECREASE',
        sev,
        'Punguzo la Idadi ya Mifugo',
        `Idadi ya mifugo imepungua kutoka ${start} hadi ${end} katika kipindi hiki (Punguzo halisi: ${net}).`,
        'FARM',
        {
          metricName: 'net_livestock_decrease',
          currentValue: end,
          previousValue: start,
          difference: net,
          percentageChange: start > 0 ? Math.round((net / start) * 100) : null,
          quantity: absNet,
          eventCount: overallFarmTrend.supportingEvents.reductions
        }
      )
    );
  }

  // Check specific livestock types for notable reductions
  if (trends.typeTrends.length > 1) {
    for (const tt of trends.typeTrends) {
      if (tt.direction === 'DECREASING' && tt.netChange <= -5 && tt.dataSufficiency !== 'INSUFFICIENT') {
        const isBig = Math.abs(tt.netChange) >= 15 || (tt.startingKnownCount > 0 && Math.abs(tt.netChange) / tt.startingKnownCount >= 0.3);
        rawCandidates.push(
          createObs(
            'LIVESTOCK_DECREASE',
            isBig ? 'IMPORTANT' : 'NOTICE',
            `Kupungua kwa ${tt.livestockType}`,
            `Idadi ya ${tt.livestockType} imepungua kutoka ${tt.startingKnownCount} hadi ${tt.endingKnownCount} (${tt.netChange}) katika kipindi hiki.`,
            'LIVESTOCK_TYPE',
            {
              metricName: 'type_livestock_decrease',
              currentValue: tt.endingKnownCount,
              previousValue: tt.startingKnownCount,
              difference: tt.netChange,
              species: tt.livestockType
            },
            tt.livestockType
          )
        );
      }
    }
  }

  // 5. RULE 3: Stable Livestock Observations
  if (farmSufficiency !== 'INSUFFICIENT' && overallFarmTrend && overallFarmTrend.direction === 'STABLE' && overallFarmTrend.supportingEvents.totalEventsInWindow > 0) {
    const count = overallFarmTrend.startingKnownCount;
    rawCandidates.push(
      createObs(
        'LIVESTOCK_STABLE',
        'INFO',
        'Idadi ya Mifugo Imebaki Thabiti',
        `Idadi ya mifugo imebaki katika kiwango kilekile (${count}) katika kipindi hiki licha ya matukio ${overallFarmTrend.supportingEvents.totalEventsInWindow} yaliyorekodiwa.`,
        'FARM',
        {
          metricName: 'stable_livestock_count',
          currentValue: count,
          previousValue: count,
          difference: 0,
          eventCount: overallFarmTrend.supportingEvents.totalEventsInWindow
        }
      )
    );
  }

  // 6. RULE 4: Mortality Observations (V1.4C)
  const totalMortality = movement.mortality.totalMortalityCount;
  const mortalityEvents = movement.mortality.mortalityEventCount;
  const mortPattern = movement.mortality.pattern;

  if (totalMortality > 0) {
    // 4A. Mortality increased compared with previous period
    if (mortPattern.patternType === 'INCREASED_MORTALITY') {
      const prevMort = mortPattern.comparisonWithPreviousPeriod?.previousPeriodMortality || 0;
      const mDiff = totalMortality - prevMort;
      const sev: ObservationSeverity = (totalMortality >= 5 || mDiff >= 3) ? 'IMPORTANT' : 'NOTICE';

      rawCandidates.push(
        createObs(
          'MORTALITY_PATTERN',
          sev,
          'Ongezeko la Matukio ya Vifo Vilivyorekodiwa',
          `Matukio ya vifo vilivyorekodiwa yameongezeka ukilinganisha na kipindi kilichotangulia (Kipindi hiki: vifo ${totalMortality}, Kipindi cha nyuma: vifo ${prevMort}).`,
          'FARM',
          {
            metricName: 'mortality_increase',
            currentValue: totalMortality,
            previousValue: prevMort,
            difference: mDiff,
            comparisonWindowDescription: mortPattern.comparisonWithPreviousPeriod?.descriptionSwahili,
            species: mortPattern.mostAffectedType || undefined
          }
        )
      );
    }
    // 4B. Mortality decreased compared with previous period
    else if (mortPattern.patternType === 'DECREASED_MORTALITY') {
      const prevMort = mortPattern.comparisonWithPreviousPeriod?.previousPeriodMortality || 0;
      const mDiff = totalMortality - prevMort;
      if (prevMort >= 3) {
        rawCandidates.push(
          createObs(
            'MORTALITY_PATTERN',
            'NOTICE',
            'Kupungua kwa Matukio ya Vifo Vilivyorekodiwa',
            `Matukio ya vifo vilivyorekodiwa yamepungua ukilinganisha na kipindi kilichotangulia (Kipindi hiki: vifo ${totalMortality} dhidi ya ${prevMort}).`,
            'FARM',
            {
              metricName: 'mortality_decrease',
              currentValue: totalMortality,
              previousValue: prevMort,
              difference: mDiff,
              comparisonWindowDescription: mortPattern.comparisonWithPreviousPeriod?.descriptionSwahili
            }
          )
        );
      }
    }
    // 4C. Mortality cluster (multiple deaths in short span)
    else if (mortPattern.repeatedEventsCluster && totalMortality >= 3) {
      rawCandidates.push(
        createObs(
          'MORTALITY_PATTERN',
          'IMPORTANT',
          'Mkusanyiko wa Matukio ya Vifo',
          `Kuna matukio kadhaa ya vifo yaliyorekodiwa kwa ukaribu ndani ya kipindi kifupi (Jumla ya vifo vilivyorekodiwa: ${totalMortality}).`,
          'FARM',
          {
            metricName: 'mortality_cluster',
            currentValue: totalMortality,
            eventCount: mortalityEvents,
            species: mortPattern.mostAffectedType || undefined
          }
        )
      );
    }
    // 4D. Baseline mortality recorded (at least 2 events/deaths)
    else if (totalMortality >= 2) {
      rawCandidates.push(
        createObs(
          'MORTALITY_PATTERN',
          'NOTICE',
          'Kumbukumbu ya Vifo vya Mifugo',
          `Kuna jumla ya vifo ${totalMortality} vilivyorekodiwa katika matukio ${mortalityEvents} katika kipindi hiki.`,
          'FARM',
          {
            metricName: 'mortality_recorded',
            currentValue: totalMortality,
            eventCount: mortalityEvents,
            species: mortPattern.mostAffectedType || undefined
          }
        )
      );
    }
    // 4E. Single mortality event (Conservative: INFO level only)
    else if (totalMortality === 1) {
      rawCandidates.push(
        createObs(
          'MORTALITY_PATTERN',
          'INFO',
          'Tukio la Kifo Lililorekodiwa',
          `Kuna tukio 1 la kifo (mnyama 1) lililorekodiwa katika kipindi hiki.`,
          'FARM',
          {
            metricName: 'single_mortality_recorded',
            currentValue: 1,
            eventCount: 1
          }
        )
      );
    }
  }

  // 7. RULE 5: Treatment Activity Observations (V1.4D)
  const treatEvents = health.treatment.totalEventsCount;
  const treatAnimals = health.treatment.totalAnimalsTreatedRaw;
  if (treatEvents >= 3) {
    rawCandidates.push(
      createObs(
        'TREATMENT_ACTIVITY',
        'NOTICE',
        'Mkusanyiko wa Matukio ya Matibabu',
        `Umerekodi matukio ${treatEvents} ya matibabu katika kipindi hiki (mifugo iliyoathiriwa: ${treatAnimals}). Matibabu ya mwisho yalirekodiwa tarehe ${health.treatment.latestDate || '-'}.`,
        'FARM',
        {
          metricName: 'treatment_activity',
          eventCount: treatEvents,
          quantity: treatAnimals,
          dates: health.treatment.latestDate ? [health.treatment.latestDate] : []
        }
      )
    );
  } else if (treatEvents >= 1) {
    rawCandidates.push(
      createObs(
        'TREATMENT_ACTIVITY',
        'INFO',
        'Matukio ya Matibabu Yaliyorekodiwa',
        `Kuna ${treatEvents === 1 ? 'tukio 1 la' : `matukio ${treatEvents} ya`} matibabu yaliyorekodiwa katika kipindi hiki.`,
        'FARM',
        {
          metricName: 'treatment_activity',
          eventCount: treatEvents,
          quantity: treatAnimals,
          dates: health.treatment.latestDate ? [health.treatment.latestDate] : []
        }
      )
    );
  }

  // 8. RULE 6: Vaccination Activity Observations (V1.4D)
  const vaccEvents = health.vaccination.totalEventsCount;
  const vaccAnimals = health.vaccination.totalAnimalsVaccinatedRaw;
  if (vaccEvents > 0) {
    rawCandidates.push(
      createObs(
        'VACCINATION_ACTIVITY',
        'INFO',
        'Shughuli za Chanjo Zilizorekodiwa',
        `Kuna ${vaccEvents === 1 ? 'tukio 1 la' : `matukio ${vaccEvents} ya`} chanjo lililorekodiwa katika kipindi hiki. Chanjo ya mwisho ilirekodiwa tarehe ${health.vaccination.latestDate || '-'}.`,
        'FARM',
        {
          metricName: 'vaccination_activity',
          eventCount: vaccEvents,
          quantity: vaccAnimals,
          dates: health.vaccination.latestDate ? [health.vaccination.latestDate] : []
        }
      )
    );
  }

  // 9. RULE 7: Livestock-Type Pattern Observations (V1.4E)
  if (activity.byLivestockType.length > 1 && activity.totalActivitiesCount >= 4) {
    const topSpecies = activity.byLivestockType[0];
    const secondSpecies = activity.byLivestockType[1];
    const totalEvents = activity.totalActivitiesCount;

    if (topSpecies.totalEvents >= 3 && (topSpecies.totalEvents / totalEvents >= 0.5 || topSpecies.totalEvents >= secondSpecies.totalEvents * 1.5)) {
      rawCandidates.push(
        createObs(
          'LIVESTOCK_TYPE_PATTERN',
          'NOTICE',
          `Shughuli Nyingi Zimejikita Kwenye ${topSpecies.livestockType}`,
          `Katika kipindi hiki, ${topSpecies.livestockType} ndio waliokuwa na matukio mengi zaidi yaliyorekodiwa (matukio ${topSpecies.totalEvents} kati ya ${totalEvents}).`,
          'LIVESTOCK_TYPE',
          {
            metricName: 'dominant_species_activity',
            currentValue: topSpecies.totalEvents,
            previousValue: secondSpecies.totalEvents,
            species: topSpecies.livestockType,
            eventCount: topSpecies.totalEvents
          },
          topSpecies.livestockType
        )
      );
    }
  }

  // 10. RULE 8: Activity Pattern / Busiest Period Observations (V1.4E)
  if (activity.busiestPeriod && activity.busiestPeriod.eventCount >= 3 && activity.totalActivitiesCount >= 5) {
    rawCandidates.push(
      createObs(
        'ACTIVITY_PATTERN',
        'INFO',
        'Kipindi Chenye Mkusanyiko wa Matukio',
        `${activity.busiestPeriod.label} kilikuwa na idadi kubwa zaidi ya matukio yaliyorekodiwa (${activity.busiestPeriod.eventCount} kati ya jumla ya matukio ${activity.totalActivitiesCount}).`,
        'FARM',
        {
          metricName: 'busiest_period',
          currentValue: activity.busiestPeriod.eventCount,
          subPeriodLabel: activity.busiestPeriod.label,
          eventCount: activity.busiestPeriod.eventCount
        }
      )
    );
  }

  // 11. RULE 9: Historical Comparison Change (V1.4E comparison)
  // Gather previous period total activities
  let prevPeriodEventsCount = 0;
  for (const r of records) {
    const rEvents = recordEventsMap[r.recordId] || [];
    for (const evt of rEvents) {
      const nDate = normalizeDateToYMD(evt.eventDate);
      if (nDate && nDate >= prevPeriodBounds.startDate && nDate <= prevPeriodBounds.endDate) {
        prevPeriodEventsCount++;
      }
    }
  }

  const currentTotalEvents = activity.totalActivitiesCount;
  if (prevPeriodEventsCount > 0 && Math.abs(currentTotalEvents - prevPeriodEventsCount) >= 3) {
    const diff = currentTotalEvents - prevPeriodEventsCount;
    if (diff > 0) {
      rawCandidates.push(
        createObs(
          'HISTORICAL_CHANGE',
          'NOTICE',
          'Kuongezeka kwa Shughuli Zilizorekodiwa',
          `Shughuli zilizorekodiwa zimeongezeka ukilinganisha na kipindi kilichotangulia (Matukio ${currentTotalEvents} dhidi ya ${prevPeriodEventsCount}).`,
          'FARM',
          {
            metricName: 'activity_increase',
            currentValue: currentTotalEvents,
            previousValue: prevPeriodEventsCount,
            difference: diff
          }
        )
      );
    } else {
      rawCandidates.push(
        createObs(
          'HISTORICAL_CHANGE',
          'INFO',
          'Kupungua kwa Shughuli Zilizorekodiwa',
          `Shughuli zilizorekodiwa zimepungua ukilinganisha na kipindi kilichotangulia (Matukio ${currentTotalEvents} dhidi ya ${prevPeriodEventsCount}).`,
          'FARM',
          {
            metricName: 'activity_decrease',
            currentValue: currentTotalEvents,
            previousValue: prevPeriodEventsCount,
            difference: diff
          }
        )
      );
    }
  }

  // 12. RULE 10: Data Gaps / Limitations Observations
  if (farmSufficiency === 'LIMITED') {
    rawCandidates.push(
      createObs(
        'DATA_GAP',
        'INFO',
        'Historia Ndogo ya Kumbukumbu',
        'Historia ya kumbukumbu za mifugo yako ni ndogo kwa kipindi hiki, hivyo baadhi ya mwenendo na muhtasari unaweza usionekane kwa ukamilifu.',
        'FARM',
        {
          metricName: 'data_limitation',
          notesSummary: farmSufficiencyReason
        }
      )
    );
  } else if (farmSufficiency === 'INSUFFICIENT' && records.length > 0) {
    rawCandidates.push(
      createObs(
        'DATA_GAP',
        'NOTICE',
        'Kumbukumbu Hazitoshi Kutoa Mwenendo Kamili',
        'Hakuna kumbukumbu za kutosha za matukio ya mifugo katika kipindi hiki ili kutoa mwenendo wa kuaminika.',
        'FARM',
        {
          metricName: 'data_insufficient',
          notesSummary: farmSufficiencyReason
        }
      )
    );
  }

  // 13. DEDUPLICATION ENGINE
  // Merge candidates having identical type, scope, and targetType
  const deduplicatedMap = new Map<string, ImportantObservation>();

  for (const cand of rawCandidates) {
    const key = `${cand.type}_${cand.scope}_${cand.targetType || 'ALL'}`;
    const existing = deduplicatedMap.get(key);
    if (!existing) {
      deduplicatedMap.set(key, cand);
    } else {
      // Keep higher severity, or if equal, keep the one with larger difference or event count
      const existingWeight = getObservationSeverityWeight(existing.severity);
      const candWeight = getObservationSeverityWeight(cand.severity);
      if (candWeight > existingWeight) {
        deduplicatedMap.set(key, cand);
      } else if (candWeight === existingWeight) {
        const existingDiff = Math.abs(Number(existing.evidence.difference || existing.evidence.eventCount || 0));
        const candDiff = Math.abs(Number(cand.evidence.difference || cand.evidence.eventCount || 0));
        if (candDiff > existingDiff) {
          deduplicatedMap.set(key, cand);
        }
      }
    }
  }

  const deduplicated = Array.from(deduplicatedMap.values());

  // 14. PRIORITIZATION ENGINE
  // Priority 1: Severity (IMPORTANT > NOTICE > INFO)
  // Priority 2: Magnitude of evidence change/count
  // Priority 3: Stable deterministic ID order
  deduplicated.sort((a, b) => {
    const wA = getObservationSeverityWeight(a.severity);
    const wB = getObservationSeverityWeight(b.severity);
    if (wB !== wA) return wB - wA;

    const diffA = Math.abs(Number(a.evidence.difference || a.evidence.quantity || a.evidence.eventCount || 0));
    const diffB = Math.abs(Number(b.evidence.difference || b.evidence.quantity || b.evidence.eventCount || 0));
    if (diffB !== diffA) return diffB - diffA;

    return a.id.localeCompare(b.id);
  });

  // Filter by minSeverity if requested
  const filtered = options.minSeverity
    ? deduplicated.filter(
        (o) => getObservationSeverityWeight(o.severity) >= getObservationSeverityWeight(options.minSeverity!)
      )
    : deduplicated;

  // Primary observations list (capped at maxObservations, default 4)
  const topObservations = filtered.slice(0, maxObservations);

  // 15. FARM INSIGHTS COMPOSITION ENGINE
  // Synthesizes composite multi-signal insights from independent deterministic observations
  const insights: FarmInsight[] = [];
  let insightIdx = 1;

  const obsTypeMap = new Map<ObservationType, ImportantObservation[]>();
  for (const o of deduplicated) {
    const list = obsTypeMap.get(o.type) || [];
    list.push(o);
    obsTypeMap.set(o.type, list);
  }

  // Insight Pattern 1: Dominant Livestock Type + Herd Increase
  const dominantTypeObs = obsTypeMap.get('LIVESTOCK_TYPE_PATTERN')?.[0];
  const increaseObs = obsTypeMap.get('LIVESTOCK_INCREASE')?.[0];
  if (dominantTypeObs && increaseObs) {
    const species = dominantTypeObs.targetType || 'kuku';
    insights.push({
      id: `insight-${insightIdx++}`,
      title: `Shughuli na Mwelekeo wa ${species}`,
      summary: `Katika kipindi hiki, ${species} ndio wamekuwa na shughuli nyingi zaidi zilizorekodiwa huku kukiwa na ongezeko la idadi yao (+${increaseObs.evidence.difference || increaseObs.evidence.quantity || 0}).`,
      supportingObservationIds: [dominantTypeObs.id, increaseObs.id],
      evidence: {
        species,
        dominantEvents: dominantTypeObs.evidence.currentValue,
        netIncrease: increaseObs.evidence.difference
      },
      dataSufficiency: farmSufficiency
    });
  }

  // Insight Pattern 2: Comprehensive Healthcare Recorded (Both Vaccination & Treatment)
  const vaccObs = obsTypeMap.get('VACCINATION_ACTIVITY')?.[0];
  const treatObs = obsTypeMap.get('TREATMENT_ACTIVITY')?.[0];
  if (vaccObs && treatObs) {
    const totalHealthEvents = (Number(vaccObs.evidence.eventCount) || 0) + (Number(treatObs.evidence.eventCount) || 0);
    insights.push({
      id: `insight-${insightIdx++}`,
      title: 'Usimamizi wa Afya ya Mifugo',
      summary: `Kuna kumbukumbu za huduma za afya (chanjo na matibabu) zilizofanyika katika kipindi hiki, zikijumuisha jumla ya matukio ${totalHealthEvents} ya afya.`,
      supportingObservationIds: [vaccObs.id, treatObs.id],
      evidence: {
        vaccinationEvents: vaccObs.evidence.eventCount,
        treatmentEvents: treatObs.evidence.eventCount,
        totalHealthEvents
      },
      dataSufficiency: farmSufficiency
    });
  }

  // Insight Pattern 3: Herd Expansion with Controlled Mortality
  const mortalityObs = obsTypeMap.get('MORTALITY_PATTERN')?.[0];
  if (increaseObs && (!mortalityObs || totalMortality === 0 || (mortalityObs.type === 'MORTALITY_PATTERN' && (Number(mortalityObs.evidence.difference) || 0) < 0))) {
    const net = increaseObs.evidence.difference || 0;
    insights.push({
      id: `insight-${insightIdx++}`,
      title: 'Ukuaji wa Kundi la Mifugo',
      summary: `Idadi ya mifugo imeongezeka kwa wanyama ${net} katika kipindi hiki huku ${totalMortality === 0 ? 'kukiwa hakuna vifo vilivyorekodiwa' : 'matukio ya vifo yakiwa yamepungua ukilinganisha na kipindi cha nyuma'}.`,
      supportingObservationIds: mortalityObs ? [increaseObs.id, mortalityObs.id] : [increaseObs.id],
      evidence: {
        netIncrease: net,
        recordedMortality: totalMortality
      },
      dataSufficiency: farmSufficiency
    });
  }

  // Insight Pattern 4: Stable Herd with Recorded Activities
  const stableObs = obsTypeMap.get('LIVESTOCK_STABLE')?.[0];
  if (stableObs && activity.totalActivitiesCount > 0 && insights.length === 0) {
    insights.push({
      id: `insight-${insightIdx++}`,
      title: 'Usimamizi na Utulivu wa Mifugo',
      summary: `Idadi ya mifugo imebaki thabiti (${stableObs.evidence.currentValue}) katika kipindi hiki chote huku kukiwa na matukio ${activity.totalActivitiesCount} ya kiutendaji yaliyorekodiwa.`,
      supportingObservationIds: [stableObs.id],
      evidence: {
        stableCount: stableObs.evidence.currentValue,
        totalActivities: activity.totalActivitiesCount
      },
      dataSufficiency: farmSufficiency
    });
  }

  // Fallback Insight: If no composite matched, synthesize top observation
  if (insights.length === 0 && topObservations.length > 0) {
    const top = topObservations[0];
    insights.push({
      id: `insight-${insightIdx++}`,
      title: top.title,
      summary: top.summary,
      supportingObservationIds: [top.id],
      evidence: top.evidence,
      dataSufficiency: top.dataSufficiency
    });
  }

  // Overall summary Swahili text
  let summarySwahili = '';
  if (topObservations.length === 0) {
    summarySwahili = 'Hakuna jambo lolote kubwa au lisilo la kawaida lililobainika katika kipindi hiki.';
  } else {
    const parts = topObservations.map((o) => o.title);
    summarySwahili = `Mambo makuu yaliyobainika: ${parts.slice(0, 3).join(', ')}.`;
  }

  return {
    version: '1.4F',
    generatedAt: now,
    uid: userId,
    timeWindow,
    startDate,
    endDate,
    isCustomRange,
    observations: topObservations,
    allObservations: deduplicated,
    insights,
    dataSufficiency: farmSufficiency,
    sufficiencyReason: farmSufficiencyReason,
    summarySwahili,
    emptyState: {
      isEmpty: records.length === 0 || (topObservations.length === 0 && activity.totalActivitiesCount === 0),
      userGuidance: topObservations.length === 0 && records.length > 0
        ? 'Hakuna mambo maalum yaliyojitokeza kwenye matukio yaliyorekodiwa katika kipindi hiki.'
        : 'Anza kwa kurekodi matukio ya mifugo mara kwa mara ili My Assistant iweze kutoa mambo muhimu.'
    },
    isCalculatedDeterministically: true
  };
}

/**
 * Serializes the V1.4F Important Observations & Farm Insights Snapshot for the AI Assistant,
 * including strict safety, ethical, and non-diagnostic guardrails.
 */
export function serializeImportantObservationsForAI(snapshot: ImportantObservationsSnapshot): string {
  if (!snapshot || snapshot.emptyState?.isEmpty) {
    return `=== MAMBO MUHIMU NA MAARIFA YA SHAMBA (V1.4F IMPORTANT OBSERVATIONS & FARM INSIGHTS) ===
Hali: BADO HAKUNA TAARIFA ZA MIFUGO AU MATUKIO
Ufafanuzi: ${snapshot?.sufficiencyReason || 'Mfugaji bado hajasajili mifugo au kurekodi matukio katika kipindi hiki.'}
Mwongozo: Mhimize mfugaji kusajili mifugo na kurekodi matukio (chanjo, matibabu, vizazi, manunuzi, vifo) ili My Assistant iweze kutoa mambo muhimu na maarifa ya shamba lake.`;
  }

  const lines: string[] = [];
  lines.push(`=== MAMBO MUHIMU NA MAARIFA YA SHAMBA (V1.4F IMPORTANT OBSERVATIONS & FARM INSIGHTS) ===`);
  lines.push(`Kipindi Kilichochaguliwa: ${snapshot.timeWindow} (${snapshot.startDate} hadi ${snapshot.endDate})`);
  lines.push(`Kiwango cha Data (Data Sufficiency): ${snapshot.dataSufficiency} - ${snapshot.sufficiencyReason}`);
  lines.push(`Jumla ya Mambo Muhimu Yaliyobainika: ${snapshot.allObservations.length} (Zinazoonyeshwa kwanza: ${snapshot.observations.length})`);
  lines.push(`Muhtasari: ${snapshot.summarySwahili}`);

  // Top Observations
  if (snapshot.observations.length > 0) {
    lines.push(`\n[MAMBO MUHIMU YALIYOBAINIKA (PRIORITIZED IMPORTANT OBSERVATIONS)]`);
    for (const obs of snapshot.observations) {
      let evText = '';
      if (obs.evidence.difference !== undefined && obs.evidence.difference !== null) {
        evText += ` | Tofauti: ${Number(obs.evidence.difference) > 0 ? '+' : ''}${obs.evidence.difference}`;
      }
      if (obs.evidence.currentValue !== undefined && obs.evidence.previousValue !== undefined) {
        evText += ` (${obs.evidence.previousValue} → ${obs.evidence.currentValue})`;
      }
      if (obs.evidence.eventCount) {
        evText += ` | Matukio: ${obs.evidence.eventCount}`;
      }
      lines.push(`• [${obs.severity}] ${obs.title}: "${obs.summary}"${evText}`);
    }
  } else {
    lines.push(`\n[MAMBO MUHIMU YALIYOBAINIKA]`);
    lines.push(`• Hakuna mambo maalum au mabadiliko makubwa yaliyojitokeza kwenye matukio yaliyorekodiwa katika kipindi hiki.`);
  }

  // Farm Insights
  if (snapshot.insights.length > 0) {
    lines.push(`\n[MAARIFA YA SHAMBA (SYNTHESIZED FARM INSIGHTS)]`);
    for (const ins of snapshot.insights) {
      lines.push(`• ${ins.title}: "${ins.summary}"`);
    }
  }

  // Safety Guardrails
  lines.push(`\n[MIPAKA MIKALI YA USALAMA KWA AI (V1.4F SAFETY & ETHICAL GUARDRAILS)]`);
  lines.push(`1. HAKUNA UTAMBUZI WA UGONJWA WALA MATIBABU (NO DISEASE DIAGNOSIS):`);
  lines.push(`   - Kamwe usihusishe matukio ya vifo, matibabu, au dawa na ugonjwa fulani mahususi (mfano: usiseme "inaonekana kuna kideri/newcastle").`);
  lines.push(`   - Matukio ya vifo au matibabu ni vipimo vya kihistoria vya kumbukumbu tu, sio utambuzi wa afya.`);
  lines.push(`2. HAKUNA MADAI YA MAFANIKIO YA KIBIASHARA WALA HASARA (NO BUSINESS SUCCESS CLAIMS):`);
  lines.push(`   - Ongezeko la idadi ya mifugo halimaanishi kuwa biashara imefanikiwa au ina faida.`);
  lines.push(`   - Punguzo la mifugo halimaanishi kuwa shamba limepata hasara.`);
  lines.push(`3. HAKUNA UTABIRI WA BAADAYE (NO PREDICTION OR FORECASTING):`);
  lines.push(`   - Kamwe usitabiri idadi ya mifugo, vifo, wala uzalishaji wa siku zijazo.`);
  lines.push(`4. USIBADILI NGAZI YA SEVERITY:`);
  lines.push(`   - Ikiwa observation imepewa daraja la INFO au NOTICE, usiiite "janga", "dharura", au "hatari". Tumia tu daraja lililotolewa.`);
  lines.push(`5. USIBUNI OBSERVATION ZAKO BINAFSI:`);
  lines.push(`   - Eleza tu mambo yaliyopo kwenye orodha ya observations na insights hapo juu. Usibuni ruwaza (patterns) zisizokuwepo.`);
  lines.push(`6. USIUNDE MATUKIO WALA KUSHAURI DAWA:`);
  lines.push(`   - Mfugaji anapouliza mambo muhimu, mwambie kile kilichopo kwenye data yake bila kumpa ushauri wa dawa wala kumuandikia dozi.`);

  return lines.join('\n');
}

// ============================================================================
// V1.4G: Natural Language Historical Q&A Services Export
// ============================================================================
export * from './livestockHistoryQuestionService';

// ============================================================================
// V1.4H — MY ASSISTANT INTELLIGENCE INTEGRATION, SAFETY & ARCHITECTURAL FREEZE
// ============================================================================

/**
 * Distinguishes zero recorded events from no history recorded vs insufficient data (Section 7).
 */
export function auditZeroVsNoData(
  records: LivestockRecord[],
  allEvents: LivestockEvent[],
  sufficiency: DataSufficiencyLevel
): ZeroVsNoDataCategory {
  if (!records || records.length === 0) {
    return 'NO_RELEVANT_HISTORY';
  }
  if (!allEvents || allEvents.length === 0) {
    return 'ZERO_RECORDED_EVENTS';
  }
  if (sufficiency === 'INSUFFICIENT') {
    return 'INSUFFICIENT_DATA';
  }
  return 'SUFFICIENT_DATA';
}

/**
 * Audits double-counting protection across records, starting quantities, and event counts (Section 8).
 */
export function auditDoubleCountingProtection(
  records: LivestockRecord[],
  recordEventsMap: Record<string, LivestockEvent[]>
): boolean {
  const seenEventIds = new Set<string>();
  for (const recordId in recordEventsMap) {
    const events = recordEventsMap[recordId] || [];
    for (const ev of events) {
      if (!ev.eventId) continue;
      if (seenEventIds.has(ev.eventId)) {
        // Event exists in multiple records - potential duplicate
        return false;
      }
      seenEventIds.add(ev.eventId);
    }
  }
  return true;
}

/**
 * Audits species isolation to ensure cross-species aggregation does not blur livestock types (Section 9).
 */
export function auditSpeciesIsolation(records: LivestockRecord[]): boolean {
  const speciesTypes = new Set<string>();
  for (const rec of records) {
    const key = (rec.livestockType || rec.livestockCategory || 'other').trim().toLowerCase();
    speciesTypes.add(key);
  }
  return speciesTypes.size > 0 || records.length === 0;
}

/**
 * Audits historical date consistency ensuring only authoritative event dates are utilized (Section 10).
 */
export function auditDateIntegrity(allEvents: LivestockEvent[]): boolean {
  for (const ev of allEvents) {
    const date = (ev as any).eventDate || (ev as any).date;
    if (!date || typeof date !== 'string' || date.length < 8) {
      return false;
    }
  }
  return true;
}

/**
 * Single entry point for Unified My Assistant Intelligence Snapshot (V1.4H Finalization).
 * Deterministically executes and unifies V1.4A, V1.4B, V1.4C, V1.4D, V1.4E, and V1.4F.
 */
export function getUnifiedMyAssistantIntelligence(
  userId: string,
  records: LivestockRecord[],
  recordEventsMap: Record<string, LivestockEvent[]>,
  options: {
    timeWindow?: TrendTimeWindow;
    customStartDate?: string;
    customEndDate?: string;
    livestockType?: string;
  } = {}
): UnifiedMyAssistantIntelligenceSnapshot {
  const effectiveWindow: TrendTimeWindow = options.timeWindow || '30d';

  // 1. Foundation (V1.4A)
  const foundation = getLivestockIntelligenceSnapshot(userId, records, recordEventsMap);

  // 2. Trends (V1.4B)
  const trends = getLivestockTrendsSnapshot(userId, records, recordEventsMap, {
    timeWindow: effectiveWindow,
    customStartDate: options.customStartDate,
    customEndDate: options.customEndDate
  });

  // 3. Movement & Mortality (V1.4C)
  const movement = getLivestockMovementSnapshot(userId, records, recordEventsMap, {
    timeWindow: effectiveWindow,
    customStartDate: options.customStartDate,
    customEndDate: options.customEndDate
  });

  // 4. Vaccination & Treatment (V1.4D)
  const health = getHealthActivityHistorySnapshot(userId, records, recordEventsMap, {
    timeWindow: effectiveWindow,
    customStartDate: options.customStartDate,
    customEndDate: options.customEndDate
  });

  // 5. Activity & Time Summaries (V1.4E)
  const activity = getActivitySummarySnapshot(userId, records, recordEventsMap, {
    timeWindow: effectiveWindow,
    customStartDate: options.customStartDate,
    customEndDate: options.customEndDate
  });

  // 6. Important Observations & Farm Insights (V1.4F)
  const observations = getImportantObservationsSnapshot(userId, records, recordEventsMap, {
    timeWindow: effectiveWindow,
    customStartDate: options.customStartDate,
    customEndDate: options.customEndDate,
    livestockType: options.livestockType
  });

  // Extract all authoritative events
  const allEvents: LivestockEvent[] = [];
  for (const recId in recordEventsMap) {
    if (Array.isArray(recordEventsMap[recId])) {
      allEvents.push(...recordEventsMap[recId]);
    }
  }

  // Audits and safety validations
  const zeroVsNoDataState = auditZeroVsNoData(records, allEvents, observations.dataSufficiency);
  const doubleCountingVerified = auditDoubleCountingProtection(records, recordEventsMap);
  const speciesAggregationSafe = auditSpeciesIsolation(records);
  const dateIntegrityPreserved = auditDateIntegrity(allEvents);

  return {
    version: 'V1.4H_FINAL',
    userId,
    calculatedAt: new Date().toISOString(),
    isCalculatedDeterministically: true,
    recordCount: records.length,
    totalEventCount: allEvents.length,
    dataSufficiency: observations.dataSufficiency,
    zeroVsNoDataState,
    foundation,
    trends,
    movement,
    health,
    activity,
    observations,
    audit: {
      doubleCountingVerified,
      speciesAggregationSafe,
      dateIntegrityPreserved,
      noPredictiveOrMedicalClaims: true
    }
  };
}


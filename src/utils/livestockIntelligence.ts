import {
  LivestockRecord,
  LivestockEvent,
  EventType,
  LivestockGroupSummary,
  FarmerLivestockSnapshot,
  FarmerEventStatistics,
  GroupEventStatistics,
  FarmerContext,
  EventImpact,
  ContributingEventDetail,
  LivestockBalanceExplanation,
  EventTypeIntelligence,
  PeriodAnalysisFilter,
  PeriodAnalysisResult,
  GroupComparisonIntelligence,
  GroupComparisonRankItem,
  LatestActivityIntelligence,
  FarmerLivestockIntelligence
} from '../types';
import {
  calculateLivestockBalance,
  sortEventsChronologicallyAsc,
  sortEventsChronologicallyDesc,
  getEventDelta,
  isPositiveEventType,
  isNegativeEventType,
  isNeutralEventType
} from './livestockBalance';

/**
 * Categorize impact of an event type: 'positive' (+animals), 'negative' (-animals), 'neutral' (no count change).
 */
export function getEventImpact(type: EventType): EventImpact {
  if (isPositiveEventType(type)) return 'positive';
  if (isNegativeEventType(type)) return 'negative';
  return 'neutral';
}

/**
 * Creates a zeroed-out EventStatistics object
 */
export function createEmptyEventStatistics(): GroupEventStatistics {
  return {
    additionCount: 0,
    birthCount: 0,
    purchaseCount: 0,
    saleCount: 0,
    deathCount: 0,
    mortalityCount: 0,
    vaccinationCount: 0,
    treatmentCount: 0,
    feedCount: 0,
    observationCount: 0,
    otherCount: 0,

    additionQuantity: 0,
    birthQuantity: 0,
    purchaseQuantity: 0,
    saleQuantity: 0,
    deathQuantity: 0,
    mortalityQuantity: 0,
    vaccinationQuantity: 0,
    treatmentQuantity: 0,
    feedQuantity: 0,
    observationQuantity: 0,
    otherQuantity: 0,

    totalPositiveEvents: 0,
    totalNegativeEvents: 0,
    totalNeutralEvents: 0,
    totalEvents: 0,

    totalPositiveQuantity: 0,
    totalNegativeQuantity: 0
  };
}

/**
 * Calculates event counts and animal quantities per event type for a list of events.
 * Crucial: Counts number of events separately from number of animals affected.
 * Death and Mortality are tracked individually in their respective counters,
 * and aggregated cleanly without double-counting.
 */
export function calculateGroupEventStatistics(events: LivestockEvent[] = []): GroupEventStatistics {
  const stats = createEmptyEventStatistics();

  for (const evt of events) {
    const rawQty = evt.quantity;
    const qty = typeof rawQty === 'number' && !isNaN(rawQty) && rawQty > 0
      ? Math.round(rawQty)
      : 0;

    switch (evt.eventType) {
      case 'addition':
        stats.additionCount += 1;
        stats.additionQuantity += qty;
        break;
      case 'birth':
        stats.birthCount += 1;
        stats.birthQuantity += qty;
        break;
      case 'purchase':
        stats.purchaseCount += 1;
        stats.purchaseQuantity += qty;
        break;
      case 'sale':
        stats.saleCount += 1;
        stats.saleQuantity += qty;
        break;
      case 'death':
        stats.deathCount += 1;
        stats.deathQuantity += qty;
        break;
      case 'mortality':
        stats.mortalityCount += 1;
        stats.mortalityQuantity += qty;
        break;
      case 'vaccination':
        stats.vaccinationCount += 1;
        stats.vaccinationQuantity += qty;
        break;
      case 'treatment':
        stats.treatmentCount += 1;
        stats.treatmentQuantity += qty;
        break;
      case 'feed':
        stats.feedCount += 1;
        stats.feedQuantity += qty;
        break;
      case 'observation':
        stats.observationCount += 1;
        stats.observationQuantity += qty;
        break;
      case 'other':
      default:
        stats.otherCount += 1;
        stats.otherQuantity += qty;
        break;
    }
  }

  // Aggregate Category Totals
  stats.totalPositiveEvents = stats.additionCount + stats.birthCount + stats.purchaseCount;
  stats.totalNegativeEvents = stats.saleCount + stats.deathCount + stats.mortalityCount;
  stats.totalNeutralEvents =
    stats.vaccinationCount +
    stats.treatmentCount +
    stats.feedCount +
    stats.observationCount +
    stats.otherCount;

  stats.totalEvents = events.length;

  // Aggregate Quantities (Population Effects)
  stats.totalPositiveQuantity = stats.additionQuantity + stats.birthQuantity + stats.purchaseQuantity;
  stats.totalNegativeQuantity = stats.saleQuantity + stats.deathQuantity + stats.mortalityQuantity;

  return stats;
}

/**
 * Identifies the latest event in a list deterministically.
 * Compares eventDate (descending), and if identical, compares createdAt (descending).
 */
export function getLatestEvent(events: LivestockEvent[] = []): LivestockEvent | null {
  if (!events || events.length === 0) {
    return null;
  }
  const sorted = sortEventsChronologicallyDesc(events);
  return sorted[0] || null;
}

/**
 * Checks whether historical balance dropped below zero at any point in time.
 * Returns 'valid' or 'invalid' without silently modifying any data.
 */
export function checkGroupBalanceValidity(
  baseQuantity: number,
  events: LivestockEvent[] = []
): 'valid' | 'invalid' {
  const safeBase = typeof baseQuantity === 'number' && !isNaN(baseQuantity) && baseQuantity >= 0
    ? Math.round(baseQuantity)
    : 0;

  const sorted = sortEventsChronologicallyAsc(events);
  let runningBalance = safeBase;

  for (const evt of sorted) {
    const delta = getEventDelta(evt.eventType, evt.quantity);
    runningBalance += delta;
    if (runningBalance < 0) {
      return 'invalid';
    }
  }

  return 'valid';
}

/**
 * Generates an intelligence summary for a single livestock group record.
 */
export function generateGroupSummary(
  record: LivestockRecord,
  events: LivestockEvent[] = []
): LivestockGroupSummary {
  // Use BUILD 01B.4 balance calculation as the single source of truth
  const balance = calculateLivestockBalance(record.quantity, events);
  const eventStats = calculateGroupEventStatistics(events);
  const latestEvent = getLatestEvent(events);
  const balanceStatus = checkGroupBalanceValidity(record.quantity, events);

  const netChange = balance.totalAdditions - balance.totalReductions;

  return {
    recordId: record.recordId,
    recordName: record.recordName || '',
    livestockCategory: record.livestockCategory,
    livestockType: record.livestockType,
    startingQuantity: balance.baseQuantity,
    totalAdditions: balance.totalAdditions,
    totalReductions: balance.totalReductions,
    currentQuantity: balance.currentQuantity,
    netChange,
    balanceStatus,
    eventCount: events.length,
    lastEventDate: latestEvent ? latestEvent.eventDate : null,
    lastEventType: latestEvent ? latestEvent.eventType : null,
    lastEventTitle: latestEvent ? latestEvent.title : null,
    eventStats
  };
}

/**
 * Generates the complete farmer livestock snapshot across all groups.
 * Aggregates all group summaries and farmer-wide event statistics.
 */
export function generateFarmerLivestockSnapshot(
  uid: string,
  records: LivestockRecord[] = [],
  recordEventsMap: Record<string, LivestockEvent[]> = {}
): FarmerLivestockSnapshot {
  if (!records || records.length === 0) {
    return {
      uid: uid || '',
      totalGroups: 0,
      totalStartingQuantity: 0,
      totalAdditions: 0,
      totalReductions: 0,
      totalCurrentQuantity: 0,
      netChange: 0,
      lastEventDate: null,
      lastEventType: null,
      lastEventRecordId: null,
      lastEventTitle: null,
      overallBalanceStatus: 'valid',
      eventStats: createEmptyEventStatistics(),
      groupSummaries: []
    };
  }

  // 1. Generate summary for each group
  const groupSummaries: LivestockGroupSummary[] = records.map((record) => {
    const events = recordEventsMap[record.recordId] || [];
    return generateGroupSummary(record, events);
  });

  // 2. Aggregate totals across all groups
  let totalStartingQuantity = 0;
  let totalAdditions = 0;
  let totalReductions = 0;
  let totalCurrentQuantity = 0;
  let hasInvalidGroup = false;

  for (const group of groupSummaries) {
    totalStartingQuantity += group.startingQuantity;
    totalAdditions += group.totalAdditions;
    totalReductions += group.totalReductions;
    totalCurrentQuantity += group.currentQuantity;
    if (group.balanceStatus === 'invalid') {
      hasInvalidGroup = true;
    }
  }

  const netChange = totalAdditions - totalReductions;

  // 3. Aggregate Farmer-wide Event Statistics
  const overallEventStats = createEmptyEventStatistics();
  for (const group of groupSummaries) {
    const s = group.eventStats;
    overallEventStats.additionCount += s.additionCount;
    overallEventStats.birthCount += s.birthCount;
    overallEventStats.purchaseCount += s.purchaseCount;
    overallEventStats.saleCount += s.saleCount;
    overallEventStats.deathCount += s.deathCount;
    overallEventStats.mortalityCount += s.mortalityCount;
    overallEventStats.vaccinationCount += s.vaccinationCount;
    overallEventStats.treatmentCount += s.treatmentCount;
    overallEventStats.feedCount += s.feedCount;
    overallEventStats.observationCount += s.observationCount;
    overallEventStats.otherCount += s.otherCount;

    overallEventStats.additionQuantity += s.additionQuantity;
    overallEventStats.birthQuantity += s.birthQuantity;
    overallEventStats.purchaseQuantity += s.purchaseQuantity;
    overallEventStats.saleQuantity += s.saleQuantity;
    overallEventStats.deathQuantity += s.deathQuantity;
    overallEventStats.mortalityQuantity += s.mortalityQuantity;
    overallEventStats.vaccinationQuantity += s.vaccinationQuantity;
    overallEventStats.treatmentQuantity += s.treatmentQuantity;
    overallEventStats.feedQuantity += s.feedQuantity;
    overallEventStats.observationQuantity += s.observationQuantity;
    overallEventStats.otherQuantity += s.otherQuantity;

    overallEventStats.totalPositiveEvents += s.totalPositiveEvents;
    overallEventStats.totalNegativeEvents += s.totalNegativeEvents;
    overallEventStats.totalNeutralEvents += s.totalNeutralEvents;
    overallEventStats.totalEvents += s.totalEvents;

    overallEventStats.totalPositiveQuantity += s.totalPositiveQuantity;
    overallEventStats.totalNegativeQuantity += s.totalNegativeQuantity;
  }

  // 4. Find the single latest event across ALL livestock groups deterministically
  interface EventWithRecord {
    recordId: string;
    event: LivestockEvent;
  }

  const allEventsWithRecord: EventWithRecord[] = [];
  for (const record of records) {
    const events = recordEventsMap[record.recordId] || [];
    for (const evt of events) {
      allEventsWithRecord.push({
        recordId: record.recordId,
        event: evt
      });
    }
  }

  let lastEventDate: string | null = null;
  let lastEventType: EventType | null = null;
  let lastEventRecordId: string | null = null;
  let lastEventTitle: string | null = null;

  if (allEventsWithRecord.length > 0) {
    allEventsWithRecord.sort((a, b) => {
      const dateA = a.event.eventDate || '';
      const dateB = b.event.eventDate || '';
      if (dateB !== dateA) {
        return dateB.localeCompare(dateA);
      }
      const createdA = a.event.createdAt || '';
      const createdB = b.event.createdAt || '';
      return createdB.localeCompare(createdA);
    });

    const latest = allEventsWithRecord[0];
    lastEventDate = latest.event.eventDate;
    lastEventType = latest.event.eventType;
    lastEventRecordId = latest.recordId;
    lastEventTitle = latest.event.title;
  }

  return {
    uid: uid || '',
    totalGroups: groupSummaries.length,
    totalStartingQuantity,
    totalAdditions,
    totalReductions,
    totalCurrentQuantity,
    netChange,
    lastEventDate,
    lastEventType,
    lastEventRecordId,
    lastEventTitle,
    overallBalanceStatus: hasInvalidGroup ? 'invalid' : 'valid',
    eventStats: overallEventStats,
    groupSummaries
  };
}

/**
 * ==============================================================================
 * BUILD 01B.10 — EXPLAINABLE GROUP BALANCE & AUDIT TRAIL ENGINE
 * ==============================================================================
 */

/**
 * Produces a deterministic explanation object for a single livestock group.
 */
export function generateGroupBalanceExplanation(
  record: LivestockRecord,
  events: LivestockEvent[] = []
): LivestockBalanceExplanation {
  const balance = calculateLivestockBalance(record.quantity, events);
  const stats = calculateGroupEventStatistics(events);
  const balanceStatus = checkGroupBalanceValidity(record.quantity, events);
  const sortedEvents = sortEventsChronologicallyAsc(events);

  const contributingEvents: ContributingEventDetail[] = sortedEvents.map((e) => ({
    eventId: e.eventId,
    recordId: record.recordId,
    recordName: record.recordName || `${record.livestockCategory} (${record.livestockType})`,
    livestockType: record.livestockType,
    eventType: e.eventType,
    eventDate: e.eventDate,
    quantity: typeof e.quantity === 'number' && !isNaN(e.quantity) ? e.quantity : 0,
    impact: getEventImpact(e.eventType),
    title: e.title || '',
    notes: e.notes || '',
    createdAt: e.createdAt || ''
  }));

  const additions = {
    totalQuantity: balance.totalAdditions,
    eventCount: stats.totalPositiveEvents
  };

  const reductions = {
    totalQuantity: balance.totalReductions,
    eventCount: stats.totalNegativeEvents
  };

  return {
    recordId: record.recordId,
    recordName: record.recordName || `${record.livestockCategory} (${record.livestockType})`,
    livestockCategory: record.livestockCategory,
    livestockType: record.livestockType,
    startingQuantity: balance.baseQuantity,
    additions,
    reductions,
    currentQuantity: balance.currentQuantity,
    netChange: additions.totalQuantity - reductions.totalQuantity,
    balanceStatus,
    contributingEvents
  };
}

/**
 * Produces deterministic explanation objects for all livestock groups.
 */
export function generateFarmerBalanceExplanations(
  records: LivestockRecord[] = [],
  recordEventsMap: Record<string, LivestockEvent[]> = {}
): LivestockBalanceExplanation[] {
  return records.map((rec) => {
    const events = recordEventsMap[rec.recordId] || [];
    return generateGroupBalanceExplanation(rec, events);
  });
}

/**
 * Explains deterministically why a group has its current number (Audit Trail).
 * E.g., "Kwa nini nina kuku 102?"
 */
export function explainWhyQuantity(
  queryIdentifier: string,
  records: LivestockRecord[] = [],
  recordEventsMap: Record<string, LivestockEvent[]> = {}
): string {
  if (records.length === 0) {
    return 'Hakuna kumbukumbu za mifugo zilizosajiliwa bado.';
  }

  // Look for matching record by ID or by name/type/category substring
  const qLower = queryIdentifier.toLowerCase().trim();
  let matchedRecord = records.find(
    (r) =>
      r.recordId === queryIdentifier ||
      (r.recordName && r.recordName.toLowerCase() === qLower) ||
      (r.livestockType && r.livestockType.toLowerCase() === qLower) ||
      (r.livestockCategory && r.livestockCategory.toLowerCase() === qLower)
  );

  if (!matchedRecord) {
    // Partial substring match
    matchedRecord = records.find(
      (r) =>
        (r.recordName && r.recordName.toLowerCase().includes(qLower)) ||
        (r.livestockType && r.livestockType.toLowerCase().includes(qLower)) ||
        (r.livestockCategory && r.livestockCategory.toLowerCase().includes(qLower))
    );
  }

  // If still not found, return summary across all or pick first
  const targetRecord = matchedRecord || records[0];
  const events = recordEventsMap[targetRecord.recordId] || [];
  const explanation = generateGroupBalanceExplanation(targetRecord, events);

  const lines: string[] = [];
  lines.push(`Ufafanuzi wa Hesabu kwa "${explanation.recordName}" (${explanation.livestockType}):`);
  lines.push(`• Idadi ya kuanzia: ${explanation.startingQuantity}`);
  lines.push(`• Walioongezeka: +${explanation.additions.totalQuantity} (Kupitia matukio ${explanation.additions.eventCount})`);
  lines.push(`• Waliopungua: -${explanation.reductions.totalQuantity} (Kupitia matukio ${explanation.reductions.eventCount})`);
  lines.push(
    `• Mabadiliko halisi (Net Change): ${explanation.netChange >= 0 ? `+${explanation.netChange}` : explanation.netChange}`
  );
  lines.push(`• Idadi ya sasa: ${explanation.currentQuantity}`);

  if (explanation.contributingEvents.length > 0) {
    lines.push(`\nMatukio yaliyochangia mabadiliko haya:`);
    for (const evt of explanation.contributingEvents) {
      const impactSign = evt.impact === 'positive' ? `+${evt.quantity}` : evt.impact === 'negative' ? `-${evt.quantity}` : `0 (${evt.eventType})`;
      const desc = evt.title ? ` - ${evt.title}` : '';
      lines.push(`  - [${evt.eventDate}] ${evt.eventType}: ${impactSign}${desc}`);
    }
  } else {
    lines.push(`\nHakuna matukio yaliyorekodiwa tangu kusajili kundi hili.`);
  }

  if (explanation.balanceStatus === 'invalid') {
    lines.push(`\nTahadhari: Rekodi za kundi hili zina mkanganyiko wa mahesabu wa kihistoria (namba hasi).`);
  }

  return lines.join('\n');
}

/**
 * ==============================================================================
 * BUILD 01B.10 — EVENT INTELLIGENCE
 * ==============================================================================
 */

/**
 * Produces event summaries per event type distinguishing event count vs animals affected.
 * Death and Mortality remain distinct event types internally while allowing aggregated reduction totals.
 */
export function analyzeEventTypeIntelligence(
  records: LivestockRecord[] = [],
  recordEventsMap: Record<string, LivestockEvent[]> = {}
): Record<EventType, EventTypeIntelligence> {
  const allEventTypes: EventType[] = [
    'addition',
    'birth',
    'purchase',
    'sale',
    'death',
    'mortality',
    'vaccination',
    'treatment',
    'feed',
    'observation',
    'other'
  ];

  const result: Record<EventType, EventTypeIntelligence> = {} as any;

  for (const type of allEventTypes) {
    result[type] = {
      eventType: type,
      impact: getEventImpact(type),
      totalEventCount: 0,
      animalsAffected: 0,
      firstEventDate: null,
      latestEventDate: null
    };
  }

  // Collect all events with dates
  for (const record of records) {
    const events = recordEventsMap[record.recordId] || [];
    for (const evt of events) {
      const t = evt.eventType;
      if (!result[t]) continue;

      const qty = typeof evt.quantity === 'number' && !isNaN(evt.quantity) && evt.quantity > 0
        ? Math.round(evt.quantity)
        : 0;

      result[t].totalEventCount += 1;
      result[t].animalsAffected += qty;

      if (evt.eventDate) {
        if (!result[t].firstEventDate || evt.eventDate < result[t].firstEventDate!) {
          result[t].firstEventDate = evt.eventDate;
        }
        if (!result[t].latestEventDate || evt.eventDate > result[t].latestEventDate!) {
          result[t].latestEventDate = evt.eventDate;
        }
      }
    }
  }

  return result;
}

/**
 * ==============================================================================
 * BUILD 01B.10 — GROUP COMPARISON INTELLIGENCE
 * ==============================================================================
 */

/**
 * Compares livestock groups deterministically.
 * Identifies largest, smallest, most increased, most decreased, and most active groups.
 */
export function compareLivestockGroups(
  records: LivestockRecord[] = [],
  recordEventsMap: Record<string, LivestockEvent[]> = {}
): GroupComparisonIntelligence {
  if (records.length === 0) {
    return {
      totalGroups: 0,
      mostAnimalsGroup: null,
      fewestAnimalsGroup: null,
      mostIncreasedGroup: null,
      mostDecreasedGroup: null,
      mostActiveGroup: null,
      rankingByQuantity: []
    };
  }

  const explanations = generateFarmerBalanceExplanations(records, recordEventsMap);

  const rankItems: GroupComparisonRankItem[] = explanations.map((exp) => ({
    recordId: exp.recordId,
    recordName: exp.recordName,
    livestockCategory: exp.livestockCategory,
    livestockType: exp.livestockType,
    quantity: exp.currentQuantity,
    netChange: exp.netChange,
    additions: exp.additions.totalQuantity,
    reductions: exp.reductions.totalQuantity,
    eventCount: exp.contributingEvents.length
  }));

  // Sort by quantity descending
  const sortedByQuantity = [...rankItems].sort((a, b) => b.quantity - a.quantity);
  const mostAnimalsGroup = sortedByQuantity[0] || null;
  const fewestAnimalsGroup = sortedByQuantity[sortedByQuantity.length - 1] || null;

  // Sort by netChange descending
  const sortedByNetChange = [...rankItems].sort((a, b) => b.netChange - a.netChange);
  const mostIncreasedGroup = sortedByNetChange[0] || null;
  const mostDecreasedGroup = sortedByNetChange[sortedByNetChange.length - 1] || null;

  // Sort by eventCount descending
  const sortedByActivity = [...rankItems].sort((a, b) => b.eventCount - a.eventCount);
  const mostActiveGroup = sortedByActivity[0] || null;

  return {
    totalGroups: records.length,
    mostAnimalsGroup,
    fewestAnimalsGroup,
    mostIncreasedGroup,
    mostDecreasedGroup,
    mostActiveGroup,
    rankingByQuantity: sortedByQuantity
  };
}

/**
 * ==============================================================================
 * BUILD 01B.10 — LATEST ACTIVITY INTELLIGENCE
 * ==============================================================================
 */

/**
 * Identifies latest activities (overall, additions, reductions, neutrals) deterministically.
 * Uses eventDate DESC, createdAt DESC.
 */
export function getLatestActivityIntelligence(
  records: LivestockRecord[] = [],
  recordEventsMap: Record<string, LivestockEvent[]> = {}
): LatestActivityIntelligence {
  const allEvents: ContributingEventDetail[] = [];

  for (const record of records) {
    const events = recordEventsMap[record.recordId] || [];
    for (const e of events) {
      allEvents.push({
        eventId: e.eventId,
        recordId: record.recordId,
        recordName: record.recordName || `${record.livestockCategory} (${record.livestockType})`,
        livestockType: record.livestockType,
        eventType: e.eventType,
        eventDate: e.eventDate,
        quantity: typeof e.quantity === 'number' && !isNaN(e.quantity) ? e.quantity : 0,
        impact: getEventImpact(e.eventType),
        title: e.title || '',
        notes: e.notes || '',
        createdAt: e.createdAt || ''
      });
    }
  }

  // Sort deterministically: eventDate DESC, createdAt DESC
  allEvents.sort((a, b) => {
    const dateA = a.eventDate || '';
    const dateB = b.eventDate || '';
    if (dateB !== dateA) {
      return dateB.localeCompare(dateA);
    }
    const createA = a.createdAt || '';
    const createB = b.createdAt || '';
    return createB.localeCompare(createA);
  });

  const latestOverallEvent = allEvents[0] || null;
  const latestAdditionEvent = allEvents.find((e) => e.impact === 'positive') || null;
  const latestReductionEvent = allEvents.find((e) => e.impact === 'negative') || null;
  const latestNeutralEvent = allEvents.find((e) => e.impact === 'neutral') || null;

  return {
    latestOverallEvent,
    latestAdditionEvent,
    latestReductionEvent,
    latestNeutralEvent
  };
}

/**
 * ==============================================================================
 * BUILD 01B.10 — PERIOD ANALYSIS
 * ==============================================================================
 */

/**
 * Calculates start and end ISO dates for standard named periods.
 */
export function getPeriodDateRange(periodType: 'today' | 'this_week' | 'this_month' | 'recent' | 'custom', customStart?: string, customEnd?: string): { startDate: string; endDate: string } {
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);

  if (periodType === 'today') {
    return { startDate: todayIso, endDate: todayIso };
  }

  if (periodType === 'this_week') {
    // Current Monday to Sunday
    const day = now.getDay();
    const diffToMonday = now.getDate() - (day === 0 ? 6 : day - 1);
    const monday = new Date(now.setDate(diffToMonday));
    const mondayIso = monday.toISOString().slice(0, 10);
    return { startDate: mondayIso, endDate: todayIso };
  }

  if (periodType === 'this_month') {
    const firstOfMonthIso = `${todayIso.slice(0, 7)}-01`;
    return { startDate: firstOfMonthIso, endDate: todayIso };
  }

  if (periodType === 'recent') {
    // Last 30 days
    const past = new Date();
    past.setDate(past.getDate() - 30);
    return { startDate: past.toISOString().slice(0, 10), endDate: todayIso };
  }

  return {
    startDate: customStart || '1970-01-01',
    endDate: customEnd || todayIso
  };
}

/**
 * Performs deterministic period analysis.
 * Explicitly reports when no matching events were recorded in that period.
 */
export function analyzePeriodEvents(
  records: LivestockRecord[] = [],
  recordEventsMap: Record<string, LivestockEvent[]> = {},
  filter: PeriodAnalysisFilter
): PeriodAnalysisResult {
  const { startDate, endDate } = getPeriodDateRange(
    filter.periodType,
    filter.startDate,
    filter.endDate
  );

  let periodLabel = 'Kipindi Maalum';
  if (filter.periodType === 'today') periodLabel = `Leo (${startDate})`;
  else if (filter.periodType === 'this_week') periodLabel = `Wiki Hii (${startDate} hadi ${endDate})`;
  else if (filter.periodType === 'this_month') periodLabel = `Mwezi Huu (${startDate} hadi ${endDate})`;
  else if (filter.periodType === 'recent') periodLabel = `Siku 30 Zilizopita (${startDate} hadi ${endDate})`;

  const matchingEvents: ContributingEventDetail[] = [];

  for (const record of records) {
    if (filter.recordId && record.recordId !== filter.recordId) continue;
    if (
      filter.livestockType &&
      record.livestockType.toLowerCase() !== filter.livestockType.toLowerCase()
    ) {
      continue;
    }

    const events = recordEventsMap[record.recordId] || [];
    for (const e of events) {
      const eDate = e.eventDate || '';
      if (eDate >= startDate && eDate <= endDate) {
        matchingEvents.push({
          eventId: e.eventId,
          recordId: record.recordId,
          recordName: record.recordName || `${record.livestockCategory} (${record.livestockType})`,
          livestockType: record.livestockType,
          eventType: e.eventType,
          eventDate: e.eventDate,
          quantity: typeof e.quantity === 'number' && !isNaN(e.quantity) ? e.quantity : 0,
          impact: getEventImpact(e.eventType),
          title: e.title || '',
          notes: e.notes || '',
          createdAt: e.createdAt || ''
        });
      }
    }
  }

  // Sort matching events DESC
  matchingEvents.sort((a, b) => {
    if (b.eventDate !== a.eventDate) return b.eventDate.localeCompare(a.eventDate);
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });

  let additionsQuantity = 0;
  let additionsEventCount = 0;
  let reductionsQuantity = 0;
  let reductionsEventCount = 0;
  let neutralEventsCount = 0;

  for (const evt of matchingEvents) {
    if (evt.impact === 'positive') {
      additionsQuantity += evt.quantity;
      additionsEventCount += 1;
    } else if (evt.impact === 'negative') {
      reductionsQuantity += evt.quantity;
      reductionsEventCount += 1;
    } else {
      neutralEventsCount += 1;
    }
  }

  const netChange = additionsQuantity - reductionsQuantity;
  const hasMatchingData = matchingEvents.length > 0;

  let summarySwahili = '';
  if (!hasMatchingData) {
    summarySwahili = `Hakuna matukio yoyote ya mifugo yaliyorekodiwa kwa ${periodLabel}.`;
  } else {
    summarySwahili = `Katika ${periodLabel}, kulikuwa na matukio ${matchingEvents.length} (Ongezeko: +${additionsQuantity}, Upungufu: -${reductionsQuantity}, Mabadiliko halisi: ${netChange >= 0 ? `+${netChange}` : netChange}).`;
  }

  return {
    periodLabel,
    startDate,
    endDate,
    totalEvents: matchingEvents.length,
    additionsQuantity,
    additionsEventCount,
    reductionsQuantity,
    reductionsEventCount,
    netChange,
    neutralEventsCount,
    events: matchingEvents,
    hasMatchingData,
    summarySwahili
  };
}

/**
 * ==============================================================================
 * BUILD 01B.10 — DATA CONFLICT DETECTION
 * ==============================================================================
 */

/**
 * Detects if a farmer's conversational prompt mentions a numerical balance
 * that conflicts with current authoritative Firestore-derived FarmerContext.
 *
 * Current authoritative data is always the single source of truth.
 */
export function detectDataConflict(
  statementText: string,
  farmerContext: FarmerContext
): { hasConflict: boolean; mentionedQuantity?: number; actualQuantity?: number; conflictExplanation?: string } | null {
  if (!farmerContext || farmerContext.status === 'empty' || farmerContext.status === 'error') {
    return null;
  }

  const text = statementText.toLowerCase();
  // Regex to detect statements like "nina kuku 100", "nimebaki na 90", "idadi ya 50"
  const quantityRegex = /(?:nina|nimebaki na|idadi ya|ninao|ninazo|kuku|ng'ombe|mbuzi|mifugo)\s+(\d{1,5})/i;
  const match = text.match(quantityRegex);

  if (!match || !match[1]) {
    return null;
  }

  const mentionedQuantity = parseInt(match[1], 10);
  if (isNaN(mentionedQuantity)) return null;

  const actualTotal = farmerContext.livestock.totalCurrentQuantity;

  // Check if mentioned quantity differs from total current quantity and all individual group current quantities
  const matchesAnyGroup = farmerContext.livestock.groups.some(
    (g) => g.currentQuantity === mentionedQuantity
  );

  if (mentionedQuantity !== actualTotal && !matchesAnyGroup) {
    return {
      hasConflict: true,
      mentionedQuantity,
      actualQuantity: actualTotal,
      conflictExplanation: `Taarifa zako za sasa zinaonyesha jumla ya mifugo ${actualTotal} (au kundi husika). Kauli au kumbukumbu ya awali ilitaja ${mentionedQuantity}, lakini rekodi yako rasmi ya sasa ndiyo inayotumika kwa hesabu sahihi.`
    };
  }

  return null;
}

/**
 * Builds the complete FarmerLivestockIntelligence layer in memory.
 */
export function buildFarmerLivestockIntelligence(
  records: LivestockRecord[] = [],
  recordEventsMap: Record<string, LivestockEvent[]> = {}
): FarmerLivestockIntelligence {
  const explanations = generateFarmerBalanceExplanations(records, recordEventsMap);
  const eventTypeIntelligence = analyzeEventTypeIntelligence(records, recordEventsMap);
  const groupComparison = compareLivestockGroups(records, recordEventsMap);
  const latestActivity = getLatestActivityIntelligence(records, recordEventsMap);

  return {
    explanations,
    eventTypeIntelligence,
    groupComparison,
    latestActivity,
    generatedAt: new Date().toISOString()
  };
}

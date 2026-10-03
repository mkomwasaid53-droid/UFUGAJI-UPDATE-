import {
  UserProfile,
  LivestockRecord,
  LivestockEvent,
  FarmerContext,
  FarmerProfileContext,
  RecentFarmerEvent,
  LivestockGroupContext,
  GroupStatusInsight
} from '../types';
import {
  generateFarmerLivestockSnapshot,
  generateGroupSummary,
  buildFarmerLivestockIntelligence
} from './livestockIntelligence';
import {
  getLivestockIntelligenceSnapshot,
  serializeIntelligenceSnapshotForAI,
  getLivestockTrendsSnapshot,
  serializeLivestockTrendsForAI,
  getLivestockMovementSnapshot,
  serializeLivestockMovementForAI,
  getHealthActivityHistorySnapshot,
  serializeHealthActivityHistoryForAI,
  getActivitySummarySnapshot,
  serializeActivitySummaryForAI,
  getImportantObservationsSnapshot,
  serializeImportantObservationsForAI
} from '../services/livestockIntelligenceEngine';

/**
 * Calculates a derived status insight for a single group based strictly on numerical data.
 * Does NOT infer diseases, negligence, or medical conditions.
 */
export function getGroupStatusInsight(group: {
  netChange: number;
  eventCount: number;
}): GroupStatusInsight {
  if (group.eventCount === 0) {
    return 'Hakuna matukio bado';
  }
  if (group.netChange > 0) {
    return 'Imeongezeka';
  }
  if (group.netChange < 0) {
    return 'Imepungua';
  }
  return 'Hakuna mabadiliko ya idadi';
}

/**
 * Collects and deterministically sorts the latest recent events across all farmer livestock groups.
 * Default limit: 10 events.
 * Ordered by: eventDate descending, then createdAt descending.
 */
export function getRecentFarmerEvents(
  records: LivestockRecord[] = [],
  recordEventsMap: Record<string, LivestockEvent[]> = {},
  limit: number = 10
): RecentFarmerEvent[] {
  const allEvents: RecentFarmerEvent[] = [];

  for (const record of records) {
    const events = recordEventsMap[record.recordId] || [];
    for (const evt of events) {
      allEvents.push({
        eventId: evt.eventId,
        recordId: record.recordId,
        recordName: record.recordName || `${record.livestockCategory} (${record.livestockType})`,
        livestockType: record.livestockType,
        eventType: evt.eventType,
        eventDate: evt.eventDate,
        quantity: evt.quantity,
        title: evt.title || '',
        notes: evt.notes || '',
        createdAt: evt.createdAt || ''
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
    const createdA = a.createdAt || '';
    const createdB = b.createdAt || '';
    return createdB.localeCompare(createdA);
  });

  return allEvents.slice(0, limit);
}

/**
 * Builds the complete FarmerContext object from the authenticated farmer's profile,
 * livestock records, and event mappings.
 *
 * Deterministic and read-only. Does not mutate Firestore or application state.
 */
export function buildFarmerContext(
  uid: string,
  profile: UserProfile | null | undefined,
  records: LivestockRecord[] = [],
  recordEventsMap: Record<string, LivestockEvent[]> = {},
  errorState?: string | null
): FarmerContext {
  const safeUid = uid || '';
  const now = new Date().toISOString();

  // 1. Sanitize Farmer Profile
  const profileContext: FarmerProfileContext = {
    displayName: profile?.displayName || profile?.name || 'Mfugaji',
    phone: profile?.phone || '',
    location: profile?.location || profile?.region || '',
    mainLivestock: Array.isArray(profile?.mainLivestock) ? profile.mainLivestock : [],
    livestockTypes: Array.isArray(profile?.livestockTypes) ? profile.livestockTypes : [],
    role: profile?.role || 'farmer'
  };

  // If explicitly flagged with an error and no records exist
  if (errorState && records.length === 0) {
    return {
      uid: safeUid,
      status: 'error',
      errorMessage: errorState,
      profile: profileContext,
      livestock: {
        totalGroups: 0,
        totalStartingQuantity: 0,
        totalAdditions: 0,
        totalReductions: 0,
        totalCurrentQuantity: 0,
        totalNetChange: 0,
        lastActivityDate: null,
        lastActivityType: null,
        lastActivityRecordId: null,
        overallBalanceStatus: 'valid',
        groups: []
      },
      eventSummary: {
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
      },
      recentEvents: [],
      generatedAt: now
    };
  }

  // 2. Determine Context Status
  const status: 'ready' | 'empty' = records.length === 0 ? 'empty' : 'ready';

  // 3. Leverage existing BUILD 01B.5 snapshot engine
  const snapshot = generateFarmerLivestockSnapshot(safeUid, records, recordEventsMap);

  // 4. Transform group summaries to group contexts with status insights
  const groups: LivestockGroupContext[] = snapshot.groupSummaries.map((g) => {
    return {
      recordId: g.recordId,
      recordName: g.recordName || `${g.livestockCategory} (${g.livestockType})`,
      livestockCategory: g.livestockCategory,
      livestockType: g.livestockType,
      startingQuantity: g.startingQuantity,
      totalAdditions: g.totalAdditions,
      totalReductions: g.totalReductions,
      currentQuantity: g.currentQuantity,
      netChange: g.netChange,
      eventCount: g.eventCount,
      lastEventDate: g.lastEventDate,
      lastEventType: g.lastEventType,
      balanceStatus: g.balanceStatus,
      statusInsight: getGroupStatusInsight(g)
    };
  });

  // 5. Extract Recent Events (up to 10)
  const recentEvents = getRecentFarmerEvents(records, recordEventsMap, 10);

  // 6. Build Livestock Intelligence Layer (BUILD 01B.10)
  const intelligence = buildFarmerLivestockIntelligence(records, recordEventsMap);

  // 7. Build V1.4A Intelligence Engine Foundation Snapshot
  const intelligenceSnapshot = getLivestockIntelligenceSnapshot(safeUid, records, recordEventsMap);

  // 8. Build V1.4B Livestock Trends Snapshot (Default 30d window)
  const trendsSnapshot = getLivestockTrendsSnapshot(safeUid, records, recordEventsMap, { timeWindow: '30d' });

  // 9. Build V1.4C Livestock Movement & Mortality Snapshot (Default 30d window)
  const movementSnapshot = getLivestockMovementSnapshot(safeUid, records, recordEventsMap, { timeWindow: '30d' });

  // 10. Build V1.4D Vaccination & Treatment History Snapshot (Default 30d window)
  const healthSnapshot = getHealthActivityHistorySnapshot(safeUid, records, recordEventsMap, { timeWindow: '30d' });

  // 11. Build V1.4E Activity & Time-Based Summaries Snapshot (Default 30d window)
  const activitySummarySnapshot = getActivitySummarySnapshot(safeUid, records, recordEventsMap, { timeWindow: '30d' });

  // 12. Build V1.4F Important Observations & Farm Insights Snapshot (Default 30d window)
  const observationsSnapshot = getImportantObservationsSnapshot(safeUid, records, recordEventsMap, { timeWindow: '30d' });

  return {
    uid: safeUid,
    status,
    profile: profileContext,
    livestock: {
      totalGroups: snapshot.totalGroups,
      totalStartingQuantity: snapshot.totalStartingQuantity,
      totalAdditions: snapshot.totalAdditions,
      totalReductions: snapshot.totalReductions,
      totalCurrentQuantity: snapshot.totalCurrentQuantity,
      totalNetChange: snapshot.netChange,
      lastActivityDate: snapshot.lastEventDate,
      lastActivityType: snapshot.lastEventType,
      lastActivityRecordId: snapshot.lastEventRecordId,
      overallBalanceStatus: snapshot.overallBalanceStatus,
      groups
    },
    eventSummary: snapshot.eventStats,
    recentEvents,
    intelligence,
    intelligenceSnapshot,
    trendsSnapshot,
    movementSnapshot,
    healthSnapshot,
    activitySummarySnapshot,
    observationsSnapshot,
    generatedAt: now
  };
}

/**
 * Serializes the FarmerContext into a clean, human-readable Swahili context block
 * prepared for AI Assistant consumption.
 *
 * Excludes sensitive personal information (phone numbers, email, API keys, credentials).
 */
export function serializeFarmerContextForAI(context: FarmerContext): string {
  if (context.status === 'empty') {
    return `[TAARIFA ZA MFUGAJI]
Mfugaji: ${context.profile.displayName}
Mahali: ${context.profile.location || 'Haijatajwa'}
Mifugo Mikuu ya Wasifu: ${context.profile.mainLivestock.length > 0 ? context.profile.mainLivestock.join(', ') : 'Haijatajwa'}
Makundi ya Mifugo: 0 (Hajaongeza rekodi ya mifugo bado kwenye Msaidizi Wangu).`;
  }

  if (context.status === 'error') {
    return `[TAARIFA ZA MFUGAJI]
Mfugaji: ${context.profile.displayName}
Hali ya Data: Hitilafu ya kupakia kumbukumbu za mifugo.`;
  }

  const lines: string[] = [];

  lines.push(`[TAARIFA ZA MFUGAJI: ${context.profile.displayName}]`);
  if (context.profile.location) {
    lines.push(`Mahali: ${context.profile.location}`);
  }
  if (context.profile.mainLivestock.length > 0) {
    lines.push(`Mifugo Mikuu: ${context.profile.mainLivestock.join(', ')}`);
  }

  lines.push(`\n[MUHTASARI WA JUMLA YA MIFUGO]`);
  lines.push(`Jumla ya Makundi ya Mifugo: ${context.livestock.totalGroups}`);
  lines.push(`Jumla ya Mifugo ya Kuanzia: ${context.livestock.totalStartingQuantity}`);
  lines.push(`Jumla ya Ongezeko: +${context.livestock.totalAdditions}`);
  lines.push(`Jumla ya Upungufu: -${context.livestock.totalReductions}`);
  lines.push(`Jumla ya Mifugo Iliyopo Sasa: ${context.livestock.totalCurrentQuantity}`);
  lines.push(`Mabadiliko Halisi (Net Change): ${context.livestock.totalNetChange >= 0 ? `+${context.livestock.totalNetChange}` : context.livestock.totalNetChange}`);
  if (context.livestock.overallBalanceStatus === 'invalid') {
    lines.push(`Hali ya Mahesabu ya Jumla: INVALID (Kuna mkanganyiko wa mahesabu kwenye baadhi ya rekodi za matukio)`);
  }

  if (context.livestock.groups.length > 0) {
    lines.push(`\n[UFAFANUZI WA MAISHA YA MAKUNDI YA MIFUGO (EXPLAINABLE GROUP BALANCES)]`);
    for (const group of context.livestock.groups) {
      const balanceWarning = group.balanceStatus === 'invalid' ? ' [TAHADHARI: Hesabu ina mkanganyiko]' : '';
      const lastEventInfo = group.lastEventDate ? `, Tukio la Mwisho: ${group.lastEventType || 'tukio'} (${group.lastEventDate})` : '';
      lines.push(
        `• Kundi: "${group.recordName}" | Aina: ${group.livestockType} (${group.livestockCategory}) | Idadi ya Kuanzia: ${group.startingQuantity} | Walioongezeka: +${group.totalAdditions} | Waliopungua: -${group.totalReductions} | Mabadiliko Halisi: ${group.netChange >= 0 ? `+${group.netChange}` : group.netChange} | Idadi ya Sasa: ${group.currentQuantity} | Matukio Yote: ${group.eventCount} | Hali: ${group.statusInsight}${balanceWarning}${lastEventInfo}`
      );
    }
  }

  // Group Comparisons (BUILD 01B.10)
  if (context.intelligence && context.intelligence.groupComparison && context.livestock.groups.length > 1) {
    const comp = context.intelligence.groupComparison;
    lines.push(`\n[UCHAMBUZI WA KULINGANISHA MAKUNDI (GROUP COMPARISON)]`);
    if (comp.mostAnimalsGroup) {
      lines.push(`• Kundi lenye mifugo mingi zaidi: "${comp.mostAnimalsGroup.recordName}" (${comp.mostAnimalsGroup.quantity})`);
    }
    if (comp.fewestAnimalsGroup) {
      lines.push(`• Kundi lenye mifugo michache zaidi: "${comp.fewestAnimalsGroup.recordName}" (${comp.fewestAnimalsGroup.quantity})`);
    }
    if (comp.mostIncreasedGroup && comp.mostIncreasedGroup.netChange > 0) {
      lines.push(`• Kundi lililoongezeka zaidi: "${comp.mostIncreasedGroup.recordName}" (+${comp.mostIncreasedGroup.netChange})`);
    }
    if (comp.mostDecreasedGroup && comp.mostDecreasedGroup.netChange < 0) {
      lines.push(`• Kundi lililopungua zaidi: "${comp.mostDecreasedGroup.recordName}" (${comp.mostDecreasedGroup.netChange})`);
    }
    if (comp.mostActiveGroup) {
      lines.push(`• Kundi lenye matukio mengi zaidi: "${comp.mostActiveGroup.recordName}" (${comp.mostActiveGroup.eventCount} matukio)`);
    }
  }

  // Latest Activity Intelligence (BUILD 01B.10)
  if (context.intelligence && context.intelligence.latestActivity) {
    const act = context.intelligence.latestActivity;
    lines.push(`\n[MATUKIO YA MWISHO KWA KILA AINA YA ATHARI]`);
    if (act.latestOverallEvent) {
      const q = act.latestOverallEvent.quantity ? ` (Idadi: ${act.latestOverallEvent.quantity})` : '';
      lines.push(`• Tukio la Mwisho Kabisa: [${act.latestOverallEvent.eventDate}] ${act.latestOverallEvent.recordName} - ${act.latestOverallEvent.eventType}${q}`);
    }
    if (act.latestAdditionEvent) {
      lines.push(`• Tukio la Mwisho la Ongezeko: [${act.latestAdditionEvent.eventDate}] ${act.latestAdditionEvent.recordName} - ${act.latestAdditionEvent.eventType} (+${act.latestAdditionEvent.quantity})`);
    }
    if (act.latestReductionEvent) {
      lines.push(`• Tukio la Mwisho la Upungufu: [${act.latestReductionEvent.eventDate}] ${act.latestReductionEvent.recordName} - ${act.latestReductionEvent.eventType} (-${act.latestReductionEvent.quantity})`);
    }
    if (act.latestNeutralEvent) {
      lines.push(`• Tukio la Mwisho la Utunzaji/Chanjo (Neutral): [${act.latestNeutralEvent.eventDate}] ${act.latestNeutralEvent.recordName} - ${act.latestNeutralEvent.eventType}`);
    }
  }

  // Event summary statistics
  const stats = context.eventSummary;
  lines.push(`\n[TAKWIMU ZA MATUKIO YA MIFUGO (EVENT INTELLIGENCE)]`);
  lines.push(`• Vizazi (Births): matukio ${stats.birthCount}, wanyama waliozaliwa ${stats.birthQuantity}`);
  lines.push(`• Manunuzi (Purchases): matukio ${stats.purchaseCount}, wanyama walionunuliwa ${stats.purchaseQuantity}`);
  lines.push(`• Mauzo (Sales): matukio ${stats.saleCount}, wanyama waliouzwa ${stats.saleQuantity}`);
  lines.push(`• Vifo (Deaths): matukio ${stats.deathCount}, wanyama waliokufa ${stats.deathQuantity}`);
  lines.push(`• Upotevu (Mortality): matukio ${stats.mortalityCount}, wanyama waliopotea ${stats.mortalityQuantity}`);
  lines.push(`• Jumla ya Vifo + Upotevu: matukio ${stats.deathCount + stats.mortalityCount}, wanyama ${stats.deathQuantity + stats.mortalityQuantity}`);
  lines.push(`• Chanjo (Vaccinations): matukio ${stats.vaccinationCount} (Tukio lisilobadili idadi ya mifugo)`);
  lines.push(`• Matibabu (Treatments): matukio ${stats.treatmentCount} (Tukio lisilobadili idadi ya mifugo)`);
  lines.push(`• Chakula (Feed): matukio ${stats.feedCount} (Tukio lisilobadili idadi ya mifugo)`);
  lines.push(`• Uchunguzi (Observations): matukio ${stats.observationCount} (Tukio lisilobadili idadi ya mifugo)`);

  if (context.recentEvents.length > 0) {
    lines.push(`\n[ORODHA YA MATUKIO 10 YA HIVI KARIBUNI]`);
    for (const evt of context.recentEvents.slice(0, 10)) {
      const qtyStr = evt.quantity !== null && evt.quantity !== undefined ? ` (Idadi: ${evt.quantity})` : '';
      const notesStr = evt.notes ? ` - Maelezo: "${evt.notes.replace(/[\r\n]+/g, ' ')}"` : '';
      const titleStr = evt.title ? ` - "${evt.title}"` : '';
      lines.push(`• [${evt.eventDate}] ${evt.recordName} (${evt.livestockType}): Aina: ${evt.eventType}${qtyStr}${titleStr}${notesStr}`);
    }
  }

  // V1.4A Intelligence Engine Foundation Section
  if (context.intelligenceSnapshot) {
    lines.push(`\n${serializeIntelligenceSnapshotForAI(context.intelligenceSnapshot)}`);
  }

  // V1.4B Livestock Trends Intelligence Section
  if (context.trendsSnapshot) {
    lines.push(`\n${serializeLivestockTrendsForAI(context.trendsSnapshot)}`);
  }

  // V1.4C Additions, Reductions & Mortality Intelligence Section
  if (context.movementSnapshot) {
    lines.push(`\n${serializeLivestockMovementForAI(context.movementSnapshot)}`);
  }

  // V1.4D Vaccination & Treatment History Intelligence Section
  if (context.healthSnapshot) {
    lines.push(`\n${serializeHealthActivityHistoryForAI(context.healthSnapshot)}`);
  }

  // V1.4E Activity & Time-Based Summaries Intelligence Section
  if (context.activitySummarySnapshot) {
    lines.push(`\n${serializeActivitySummaryForAI(context.activitySummarySnapshot)}`);
  }

  // V1.4F Important Observations & Farm Insights Section
  if (context.observationsSnapshot) {
    lines.push(`\n${serializeImportantObservationsForAI(context.observationsSnapshot)}`);
  }

  return lines.join('\n');
}


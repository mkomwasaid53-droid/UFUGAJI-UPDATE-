import { EventType } from '../types';

export type EventImpact = 'positive' | 'negative' | 'neutral';

export interface ContributingEventDetail {
  eventId: string;
  recordId: string;
  recordName: string;
  livestockType: string;
  eventType: EventType;
  eventDate: string;
  quantity: number;
  impact: EventImpact;
  title?: string;
  notes?: string;
  createdAt?: string;
}

export interface LivestockBalanceExplanation {
  recordId: string;
  recordName: string;
  livestockCategory: string;
  livestockType: string;
  startingQuantity: number;
  additions: {
    totalQuantity: number;
    eventCount: number;
  };
  reductions: {
    totalQuantity: number;
    eventCount: number;
  };
  currentQuantity: number;
  netChange: number;
  balanceStatus: 'valid' | 'invalid';
  contributingEvents: ContributingEventDetail[];
}

export interface EventTypeIntelligence {
  eventType: EventType;
  impact: EventImpact;
  totalEventCount: number;
  animalsAffected: number;
  firstEventDate: string | null;
  latestEventDate: string | null;
}

export interface PeriodAnalysisFilter {
  periodType: 'today' | 'this_week' | 'this_month' | 'recent' | 'custom';
  startDate?: string;
  endDate?: string;
  recordId?: string;
  livestockType?: string;
}

export interface PeriodAnalysisResult {
  periodLabel: string;
  startDate: string | null;
  endDate: string | null;
  totalEvents: number;
  additionsQuantity: number;
  additionsEventCount: number;
  reductionsQuantity: number;
  reductionsEventCount: number;
  netChange: number;
  neutralEventsCount: number;
  events: ContributingEventDetail[];
  hasMatchingData: boolean;
  summarySwahili: string;
}

export interface GroupComparisonRankItem {
  recordId: string;
  recordName: string;
  livestockCategory: string;
  livestockType: string;
  quantity: number;
  netChange: number;
  additions: number;
  reductions: number;
  eventCount: number;
}

export interface GroupComparisonIntelligence {
  totalGroups: number;
  mostAnimalsGroup: GroupComparisonRankItem | null;
  fewestAnimalsGroup: GroupComparisonRankItem | null;
  mostIncreasedGroup: GroupComparisonRankItem | null;
  mostDecreasedGroup: GroupComparisonRankItem | null;
  mostActiveGroup: GroupComparisonRankItem | null;
  rankingByQuantity: GroupComparisonRankItem[];
}

export interface LatestActivityIntelligence {
  latestOverallEvent: ContributingEventDetail | null;
  latestAdditionEvent: ContributingEventDetail | null;
  latestReductionEvent: ContributingEventDetail | null;
  latestNeutralEvent: ContributingEventDetail | null;
}

export interface FarmerLivestockIntelligence {
  explanations: LivestockBalanceExplanation[];
  eventTypeIntelligence: Record<EventType, EventTypeIntelligence>;
  groupComparison: GroupComparisonIntelligence;
  latestActivity: LatestActivityIntelligence;
  generatedAt: string;
}

// ==============================================================================
// V1.4A — INTELLIGENCE ENGINE FOUNDATION TYPES
// ==============================================================================

export type IntelligenceCategory =
  | 'TREND'
  | 'BALANCE'
  | 'ADDITION'
  | 'REDUCTION'
  | 'MORTALITY'
  | 'VACCINATION'
  | 'TREATMENT'
  | 'ACTIVITY'
  | 'SUMMARY'
  | 'OBSERVATION'
  | 'INSIGHT';

export type IntelligenceSeverity = 'INFO' | 'NOTICE' | 'IMPORTANT';

export type DataSufficiencyLevel = 'SUFFICIENT' | 'LIMITED' | 'INSUFFICIENT';

export interface DataCoverageInfo {
  firstEventDate: string | null;
  lastEventDate: string | null;
  eventCount: number;
  recordCount: number;
  daysSpan: number;
  isSparse: boolean;
  sufficiency: DataSufficiencyLevel;
  sufficiencyReason: string;
}

export interface IntelligenceObservation {
  id: string;
  category: IntelligenceCategory;
  severity: IntelligenceSeverity;
  title: string;
  message: string;
  relatedLivestockType?: string;
  relatedRecordId?: string;
  dataBacked: boolean;
  dataTrace?: string;
}

export interface LivestockTypeIntelligence {
  livestockType: string;
  livestockCategory: string;
  groupCount: number;
  startingQuantity: number;
  currentQuantity: number;
  netChange: number;
  additions: number;
  reductions: number;
  mortality: number;
  vaccinations: number;
  treatments: number;
  eventCount: number;
}

export interface LivestockIntelligenceSnapshot {
  version: '1.4A';
  generatedAt: string;
  uid: string;
  totalLivestock: number;
  totalStartingLivestock: number;
  totalNetChange: number;
  totalRecords: number;
  livestockByType: LivestockTypeIntelligence[];
  recentActivity: {
    additions: number;
    reductions: number;
    mortality: number;
    vaccinations: number;
    treatments: number;
    totalEvents: number;
  };
  dataCoverage: DataCoverageInfo;
  observations: IntelligenceObservation[];
  isCalculatedDeterministically: true;
  hasSufficientData: boolean;
  emptyState: {
    isEmpty: boolean;
    reason?: string;
    userGuidance?: string;
  };
}

// ==============================================================================
// V1.4B — LIVESTOCK TRENDS INTELLIGENCE TYPES
// ==============================================================================

export type TrendDirection = 'INCREASING' | 'DECREASING' | 'STABLE' | 'UNKNOWN';

export type TrendTimeWindow = '7d' | '30d' | '90d' | '6m' | '12m' | 'custom';

export interface LivestockTrendPoint {
  date: string; // YYYY-MM-DD
  count: number;
  netChangeOnDate: number;
  eventCount: number;
  summaryNotes?: string;
}

export interface SupportingEventSummary {
  additions: number;
  reductions: number;
  mortality: number;
  sales: number;
  purchases: number;
  births: number;
  vaccinations: number;
  treatments: number;
  totalEventsInWindow: number;
}

export interface LivestockTrend {
  trendScope: 'overall' | 'type';
  livestockType: string;
  livestockCategory?: string;
  timeWindow: TrendTimeWindow;
  startDate: string;
  endDate: string;
  startingKnownCount: number;
  endingKnownCount: number;
  netChange: number;
  direction: TrendDirection;
  dataSufficiency: DataSufficiencyLevel;
  sufficiencyReason: string;
  supportingEvents: SupportingEventSummary;
  trendPoints: LivestockTrendPoint[];
}

export interface LivestockTrendsSnapshot {
  version: '1.4B';
  generatedAt: string;
  uid: string;
  timeWindow: TrendTimeWindow;
  startDate: string;
  endDate: string;
  overallFarmTrend: LivestockTrend | null;
  typeTrends: LivestockTrend[];
  dataCoverage: DataCoverageInfo;
  summarySwahili: string;
  isCalculatedDeterministically: true;
  emptyState: {
    isEmpty: boolean;
    userGuidance?: string;
  };
}

// ==============================================================================
// V1.4C — ADDITIONS, REDUCTIONS & MORTALITY PATTERNS TYPES
// ==============================================================================

export type NormalizedMovementCategory =
  | 'ADDITION'
  | 'REDUCTION'
  | 'PURCHASE'
  | 'SALE'
  | 'MORTALITY'
  | 'OTHER';

export interface AdditionsBreakdown {
  total: number; // Gross additions (purchases + births + otherAdditions)
  purchases: number; // explicit purchase events
  births: number; // explicit birth events
  otherAdditions: number; // explicit generic addition events
  eventCount: number;
}

export interface ReductionsBreakdown {
  total: number; // Gross reductions (sales + mortality + otherReductions)
  sales: number; // explicit sale events
  mortality: number; // explicit death/mortality events
  otherReductions: number; // explicit generic reduction events
  eventCount: number;
}

export type MortalityPatternType =
  | 'REPEATED_MORTALITY'
  | 'INCREASED_MORTALITY'
  | 'DECREASED_MORTALITY'
  | 'STABLE_MORTALITY'
  | 'NO_MORTALITY'
  | 'NO_DATA';

export interface MortalityRateInfo {
  ratePercent: number | null; // e.g. 4.5 (%) or null if invalid denominator
  hasValidDenominator: boolean;
  recordedMortality: number;
  populationBase: number | null; // defensible exposed population base
  explanationSwahili: string;
}

export interface TypeMortalityDetail {
  livestockType: string;
  livestockCategory?: string;
  mortalityCount: number;
  mortalityEventCount: number;
  dates: string[];
}

export interface TimeGroupedMortality {
  periodLabel: string; // e.g. "Wiki 1" au "Agosti 2026"
  startDate: string;
  endDate: string;
  mortalityCount: number;
  eventCount: number;
}

export interface MortalityPatternAnalysis {
  patternType: MortalityPatternType;
  summarySwahili: string;
  comparisonWithPreviousPeriod?: {
    currentPeriodMortality: number;
    previousPeriodMortality: number;
    difference: number;
    percentChange: number | null;
    descriptionSwahili: string;
  };
  repeatedEventsCluster: boolean;
  clusterDescriptionSwahili?: string;
  mostAffectedType: string | null;
}

export interface MortalityIntelligence {
  totalMortalityCount: number;
  mortalityEventCount: number;
  mortalityByType: TypeMortalityDetail[];
  mortalityByPeriod: TimeGroupedMortality[];
  mortalityRate: MortalityRateInfo;
  pattern: MortalityPatternAnalysis;
  dataSufficiency: DataSufficiencyLevel;
  sufficiencyReason: string;
}

export interface LivestockTypeMovement {
  livestockType: string;
  livestockCategory?: string;
  startingKnownCount: number;
  endingKnownCount: number;
  additions: AdditionsBreakdown;
  reductions: ReductionsBreakdown;
  netMovement: number; // additions.total - reductions.total
  mortalityCount: number;
  salesCount: number;
  purchasesCount: number;
  birthsCount: number;
}

export interface LivestockMovementSnapshot {
  version: '1.4C';
  generatedAt: string;
  uid: string;
  timeWindow: TrendTimeWindow;
  startDate: string;
  endDate: string;
  previousPeriodStartDate: string;
  previousPeriodEndDate: string;
  additions: AdditionsBreakdown;
  reductions: ReductionsBreakdown;
  netMovement: number; // Gross Additions - Gross Reductions (No double counting!)
  typeMovements: LivestockTypeMovement[];
  mortality: MortalityIntelligence;
  observations: IntelligenceObservation[];
  dataSufficiency: DataSufficiencyLevel;
  sufficiencyReason: string;
  summarySwahili: string;
  isCalculatedDeterministically: true;
  emptyState: {
    isEmpty: boolean;
    userGuidance?: string;
  };
}

// ============================================================================
// V1.4D: Vaccination / Treatment History Intelligence Types
// ============================================================================

export type NormalizedHealthCategory = 'VACCINATION' | 'TREATMENT' | 'OTHER';

export interface VaccinationEventDetail {
  eventId: string;
  recordId: string;
  recordName: string;
  livestockType: string;
  livestockCategory?: string;
  eventDate: string; // Authoritative ISO date YYYY-MM-DD
  quantity: number | null; // Number of animals vaccinated where recorded, or null
  hasRecordedQuantity: boolean;
  title: string; // Authoritative recorded title
  notes: string; // Authoritative recorded notes
  recordedVaccineName?: string; // Preserved recorded vaccine name if entered
}

export interface TreatmentEventDetail {
  eventId: string;
  recordId: string;
  recordName: string;
  livestockType: string;
  livestockCategory?: string;
  eventDate: string; // Authoritative ISO date YYYY-MM-DD
  quantity: number | null; // Animals treated where recorded, or null
  hasRecordedQuantity: boolean;
  title: string; // Authoritative recorded title
  notes: string; // Authoritative recorded notes
  recordedMedicineName?: string; // Preserved recorded medicine name if entered
  recordedCondition?: string; // Preserved reason/condition ONLY if explicitly entered
}

export interface HealthTimelineItem {
  id: string;
  type: 'VACCINATION' | 'TREATMENT';
  eventId: string;
  recordId: string;
  recordName: string;
  livestockType: string;
  livestockCategory?: string;
  eventDate: string;
  quantity: number | null;
  hasRecordedQuantity: boolean;
  title: string;
  notes: string;
  productName?: string; // Vaccine or medicine name if recorded
}

export interface HealthTypeActivity {
  livestockType: string;
  livestockCategory?: string;
  vaccinationEventsCount: number;
  vaccinationAnimalsCount: number; // Sum of quantities for this specific species only (no cross-species blending!)
  vaccinationHasQuantityData: boolean;
  treatmentEventsCount: number;
  treatmentAnimalsCount: number; // Sum of quantities for this specific species only
  treatmentHasQuantityData: boolean;
  latestVaccinationDate: string | null;
  latestTreatmentDate: string | null;
}

export interface VaccinationHistorySummary {
  totalEventsCount: number;
  totalAnimalsVaccinatedByType: Record<string, number>; // Species-safe breakdown! e.g. { "Kuku": 120, "Mbuzi": 10 }
  totalAnimalsVaccinatedRaw: number; // Total where quantity was provided
  hasAnyRecordedQuantity: boolean;
  latestEvent: VaccinationEventDetail | null;
  latestDate: string | null;
  events: VaccinationEventDetail[];
  timeWindow: TrendTimeWindow;
}

export interface TreatmentHistorySummary {
  totalEventsCount: number;
  totalAnimalsTreatedByType: Record<string, number>; // Species-safe breakdown! e.g. { "Kuku": 32 }
  totalAnimalsTreatedRaw: number;
  hasAnyRecordedQuantity: boolean;
  latestEvent: TreatmentEventDetail | null;
  latestDate: string | null;
  events: TreatmentEventDetail[];
  timeWindow: TrendTimeWindow;
}

export interface HealthHistoryOptions {
  timeWindow?: TrendTimeWindow;
  referenceDate?: string;
  customStartDate?: string;
  customEndDate?: string;
  livestockType?: string;
}

export interface HealthActivityHistorySnapshot {
  version: '1.4D';
  generatedAt: string;
  uid: string;
  timeWindow: TrendTimeWindow;
  startDate: string;
  endDate: string;
  vaccination: VaccinationHistorySummary;
  treatment: TreatmentHistorySummary;
  byLivestockType: HealthTypeActivity[];
  timeline: HealthTimelineItem[];
  dataSufficiency: DataSufficiencyLevel;
  sufficiencyReason: string;
  summarySwahili: string;
  observations: IntelligenceObservation[];
  emptyState: {
    isEmpty: boolean;
    userGuidance?: string;
  };
  isCalculatedDeterministically: true;
}

// ============================================================================
// V1.4E: Activity & Time-Based Summaries Types
// ============================================================================

export type ActivityCanonicalCategory =
  | 'ADDITION'
  | 'PURCHASE'
  | 'BIRTH'
  | 'REDUCTION'
  | 'SALE'
  | 'MORTALITY'
  | 'VACCINATION'
  | 'TREATMENT'
  | 'FEED'
  | 'OBSERVATION'
  | 'OTHER';

export type ActivityGroupingPeriodType = 'day' | 'week' | 'month';

export interface TimeGroupedActivity {
  key: string;
  label: string;
  startDate: string;
  endDate: string;
  totalEvents: number;
  byCategory: Record<ActivityCanonicalCategory, number>;
  byLivestockType: Record<string, number>;
}

export interface ActivityCategorySummary {
  category: ActivityCanonicalCategory;
  labelSwahili: string;
  eventCount: number;
  totalAnimalsAffected: number;
  hasQuantityData: boolean;
  latestEventDate: string | null;
}

export interface ActivityLivestockTypeSummary {
  livestockType: string;
  livestockCategory?: string;
  totalEvents: number;
  additionsCount: number;
  reductionsCount: number;
  mortalityCount: number;
  vaccinationCount: number;
  treatmentCount: number;
  otherCount: number;
  latestEventDate: string | null;
}

export interface ActivityTimelineItem {
  id: string;
  eventId: string;
  recordId: string;
  recordName: string;
  livestockType: string;
  livestockCategory?: string;
  eventDate: string;
  canonicalCategory: ActivityCanonicalCategory;
  categoryLabelSwahili: string;
  eventType: EventType;
  quantity: number | null;
  hasRecordedQuantity: boolean;
  title: string;
  notes: string;
}

export interface ActivityRollupBreakdown {
  totalActivitiesCount: number;
  additions: {
    totalEvents: number;
    totalAnimals: number;
    purchasesCount: number;
    purchasesAnimals: number;
    birthsCount: number;
    birthsAnimals: number;
    otherAdditionsCount: number;
    otherAdditionsAnimals: number;
  };
  reductions: {
    totalEvents: number;
    totalAnimals: number;
    salesCount: number;
    salesAnimals: number;
    mortalityCount: number;
    mortalityAnimals: number;
    otherReductionsCount: number;
    otherReductionsAnimals: number;
  };
  health: {
    totalEvents: number;
    vaccinationEvents: number;
    treatmentEvents: number;
  };
  other: {
    feedEvents: number;
    observationEvents: number;
    unclassifiedEvents: number;
  };
  byCanonicalCategory: Record<ActivityCanonicalCategory, ActivityCategorySummary>;
}

export interface BusiestActivityPeriod {
  label: string;
  startDate: string;
  endDate: string;
  eventCount: number;
  dominantCategory?: ActivityCanonicalCategory;
  dominantType?: string;
}

export interface QuietActivityPeriod {
  label: string;
  startDate: string;
  endDate: string;
  eventCount: number;
}

export interface ActivitySummarySnapshot {
  version: '1.4E';
  generatedAt: string;
  uid: string;
  timeWindow: TrendTimeWindow;
  startDate: string;
  endDate: string;
  isCustomRange: boolean;

  totalActivitiesCount: number;

  rollup: ActivityRollupBreakdown;
  byLivestockType: ActivityLivestockTypeSummary[];
  timeGroupedBreakdown: {
    groupingType: ActivityGroupingPeriodType;
    periods: TimeGroupedActivity[];
  };

  busiestPeriod: BusiestActivityPeriod | null;
  quietPeriod: QuietActivityPeriod | null;

  latestActivity: ActivityTimelineItem | null;
  timeline: ActivityTimelineItem[];

  dataSufficiency: DataSufficiencyLevel;
  sufficiencyReason: string;
  summarySwahili: string;
  observations: IntelligenceObservation[];

  emptyState: {
    isEmpty: boolean;
    userGuidance?: string;
  };

  isCalculatedDeterministically: true;
}

export interface ActivitySummaryOptions {
  timeWindow?: TrendTimeWindow;
  referenceDate?: string;
  customStartDate?: string;
  customEndDate?: string;
  livestockType?: string;
  categoryFilter?: ActivityCanonicalCategory | 'ALL';
}

// ==============================================================================
// V1.4F: Important Observations & Farm Insights
// ==============================================================================

export type ObservationType =
  | 'LIVESTOCK_INCREASE'
  | 'LIVESTOCK_DECREASE'
  | 'LIVESTOCK_STABLE'
  | 'MORTALITY_PATTERN'
  | 'ACTIVITY_PATTERN'
  | 'VACCINATION_ACTIVITY'
  | 'TREATMENT_ACTIVITY'
  | 'LIVESTOCK_TYPE_PATTERN'
  | 'DATA_GAP'
  | 'HISTORICAL_CHANGE'
  | 'OTHER';

export type ObservationSeverity = 'INFO' | 'NOTICE' | 'IMPORTANT';

export type ObservationScope = 'FARM' | 'LIVESTOCK_TYPE' | 'GROUP';

export interface ObservationEvidence {
  metricName: string;
  currentValue?: number | string | null;
  previousValue?: number | string | null;
  difference?: number | string | null;
  percentageChange?: number | null;
  eventCount?: number;
  quantity?: number;
  dates?: string[];
  species?: string;
  subPeriodLabel?: string;
  notesSummary?: string;
  comparisonWindowDescription?: string;
  [key: string]: any;
}

export interface ImportantObservation {
  id: string;
  type: ObservationType;
  severity: ObservationSeverity;
  title: string;
  summary: string;
  scope: ObservationScope;
  targetType?: string;
  targetRecordId?: string;
  period: {
    window: TrendTimeWindow;
    startDate: string;
    endDate: string;
    comparisonStartDate?: string;
    comparisonEndDate?: string;
  };
  evidence: ObservationEvidence;
  createdCalculatedAt: string;
  dataSufficiency: DataSufficiencyLevel;
}

export interface FarmInsight {
  id: string;
  title: string;
  summary: string;
  supportingObservationIds: string[];
  evidence: Record<string, any>;
  dataSufficiency: DataSufficiencyLevel;
}

export interface ImportantObservationsSnapshot {
  version: '1.4F';
  generatedAt: string;
  uid: string;
  timeWindow: TrendTimeWindow;
  startDate: string;
  endDate: string;
  isCustomRange: boolean;

  // The prioritized top observations for clean display (max 3-5)
  observations: ImportantObservation[];
  // Complete set of valid deduplicated observations
  allObservations: ImportantObservation[];

  // Synthesized multi-signal insights
  insights: FarmInsight[];

  dataSufficiency: DataSufficiencyLevel;
  sufficiencyReason: string;
  summarySwahili: string;

  emptyState: {
    isEmpty: boolean;
    userGuidance: string;
  };

  isCalculatedDeterministically: true;
}

export interface ObservationsOptions {
  timeWindow?: TrendTimeWindow;
  referenceDate?: string;
  customStartDate?: string;
  customEndDate?: string;
  livestockType?: string;
  minSeverity?: ObservationSeverity;
  maxObservations?: number;
}

// ==============================================================================
// V1.4H — UNIFIED MY ASSISTANT INTELLIGENCE SNAPSHOT & ARCHITECTURAL FREEZE
// ==============================================================================

export const V1_4_ARCHITECTURAL_FREEZE = {
  version: 'V1.4H_FINAL',
  status: 'FROZEN' as const,
  frozenAt: '2026-09-09',
  supportedLayers: [
    'V1.4A_FOUNDATION',
    'V1.4B_TRENDS',
    'V1.4C_MOVEMENT_MORTALITY',
    'V1.4D_VACCINATION_TREATMENT',
    'V1.4E_ACTIVITY_SUMMARIES',
    'V1.4F_OBSERVATIONS_INSIGHTS',
    'V1.4G_HISTORICAL_QA'
  ] as const,
  supportedIntelligenceTypes: [
    'TREND',
    'BALANCE',
    'ADDITION',
    'REDUCTION',
    'MORTALITY',
    'VACCINATION',
    'TREATMENT',
    'ACTIVITY',
    'SUMMARY',
    'OBSERVATION',
    'INSIGHT'
  ] as const,
  safetyGuarantees: [
    'SINGLE_SOURCE_OF_TRUTH',
    'EVIDENCE_BASED_DETERMINISM',
    'NO_HALLUCINATED_FACTS',
    'EVENT_ANIMAL_DISTINCTION',
    'DOUBLE_COUNTING_PROTECTION',
    'SPECIES_TYPE_SAFETY',
    'HISTORICAL_DATE_CONSISTENCY',
    'TIME_WINDOW_CONSISTENCY',
    'CONSERVATIVE_SEVERITY_PRESERVATION',
    'NO_MEDICAL_DIAGNOSIS_OR_PRESCRIPTION',
    'NO_FINANCIAL_OR_PREDICTIVE_SCORING',
    'DAKTARI_WORKFLOW_SEPARATION',
    'MARKETPLACE_SEPARATION',
    'STRICT_FARMER_DATA_ISOLATION'
  ] as const
};

export type ZeroVsNoDataCategory =
  | 'ZERO_RECORDED_EVENTS'
  | 'NO_RELEVANT_HISTORY'
  | 'INSUFFICIENT_DATA'
  | 'SUFFICIENT_DATA';

export interface UnifiedMyAssistantIntelligenceSnapshot {
  version: 'V1.4H_FINAL';
  userId: string;
  calculatedAt: string;
  isCalculatedDeterministically: true;

  // Single Source of Truth Metadata
  recordCount: number;
  totalEventCount: number;
  dataSufficiency: DataSufficiencyLevel;
  zeroVsNoDataState: ZeroVsNoDataCategory;

  // Subsystem Snapshots (V1.4A - V1.4F)
  foundation: LivestockIntelligenceSnapshot;
  trends: LivestockTrendsSnapshot;
  movement: LivestockMovementSnapshot;
  health: HealthActivityHistorySnapshot;
  activity: ActivitySummarySnapshot;
  observations: ImportantObservationsSnapshot;

  // Safety & Verification Audits
  audit: {
    doubleCountingVerified: boolean;
    speciesAggregationSafe: boolean;
    dateIntegrityPreserved: boolean;
    noPredictiveOrMedicalClaims: boolean;
  };
}




import { EventType } from '../types';
import {
  TrendTimeWindow,
  DataSufficiencyLevel,
  ImportantObservation,
  FarmInsight
} from './livestockIntelligence';

export type HistoryQuestionIntent =
  | 'HISTORY_COUNT'
  | 'HISTORY_LATEST'
  | 'HISTORY_BY_TYPE'
  | 'HISTORY_BY_PERIOD'
  | 'HISTORY_TREND'
  | 'HISTORY_MORTALITY'
  | 'HISTORY_VACCINATION'
  | 'HISTORY_TREATMENT'
  | 'HISTORY_ACTIVITY'
  | 'HISTORY_INSIGHT'
  | 'AMBIGUOUS_HISTORY'
  | 'NO_HISTORY_DATA'
  | 'UNSUPPORTED_MEDICAL';

export type HistoryCategory =
  | 'vaccination'
  | 'treatment'
  | 'addition'
  | 'reduction'
  | 'mortality'
  | 'activity'
  | 'observation'
  | 'all'
  | 'unsupported';

export type HistoryMetric =
  | 'eventCount'
  | 'affectedAnimalQuantity'
  | 'latestEventDate'
  | 'mostFrequentEventCategory'
  | 'netChange'
  | 'breakdown'
  | 'observationExplanation';

export interface ParsedHistoryQuestionIntent {
  isHistoryQuestion: boolean;
  intent: HistoryQuestionIntent;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  category: HistoryCategory;
  livestockType: string | null;
  rawLivestockKeyword?: string | null;
  timePeriodLabel: string;
  canonicalTimeWindow: TrendTimeWindow | 'all-time' | 'custom';
  customStartDate?: string | null;
  customEndDate?: string | null;
  metric: HistoryMetric;
  latestOrExtremum: 'latest' | 'first' | 'most' | 'least' | null;
  isFollowUp: boolean;
  inheritedDimension?: string;
  isAmbiguous: boolean;
  clarificationPromptSwahili?: string;
  isUnsupportedMedical: boolean;
  unsupportedMedicalReason?: string;
}

export interface HistorySupportingEvent {
  eventId: string;
  recordId: string;
  recordName: string;
  livestockType: string;
  livestockCategory?: string;
  eventType: EventType;
  eventDate: string;
  quantity: number | null;
  hasRecordedQuantity: boolean;
  title: string;
  notes: string;
  medicineName?: string;
  reason?: string;
}

export interface HistoryQuestionResult {
  version: '1.4G';
  detected: boolean;
  intent: HistoryQuestionIntent;
  parsedQuestion: {
    originalQuestion: string;
    category: HistoryCategory;
    livestockType: string | null;
    timePeriod: string;
    metric: HistoryMetric;
  };
  authoritativeSource: {
    recordsCount: number;
    totalEventsAvailable: number;
    queriedPeriod: {
      window: string;
      startDate: string | null;
      endDate: string | null;
      labelSwahili: string;
    };
    livestockTypeFilter: string | null;
  };
  // Explicit separation of event count vs animal quantity (V1.4G Section 7)
  eventCount: number;
  animalQuantity: number | null;
  hasRecordedAnimalQuantity: boolean;
  quantityDisclaimerSwahili?: string;

  latestEvent: HistorySupportingEvent | null;
  supportingEvents: HistorySupportingEvent[];
  supportingEventsCount: number;

  byLivestockType?: Array<{
    livestockType: string;
    eventCount: number;
    animalQuantity: number | null;
  }>;

  activityBreakdown?: Record<string, number>;

  trendComparison?: {
    currentCount: number;
    previousCount: number;
    difference: number;
    direction: 'INCREASING' | 'DECREASING' | 'STABLE';
    descriptionSwahili: string;
  };

  matchingObservations?: ImportantObservation[];
  matchingInsights?: FarmInsight[];

  dataSufficiency: DataSufficiencyLevel;
  sufficiencyReason: string;
  factualSummarySwahili: string;
  safetyNoticeSwahili?: string;
  clarificationPromptSwahili?: string;
  isDeterministicFact: boolean;
}

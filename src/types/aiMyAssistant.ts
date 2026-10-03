/**
 * V1.5B — AI -> MY ASSISTANT INTELLIGENCE BRIDGE TYPES
 * Phase 4: The Intelligent Loop (AI Context Layer)
 *
 * Defines types for the read-only, authoritative integration between
 * the AI Assistant and the My Assistant Intelligence Engine.
 */

import { LivestockRecord, LivestockEvent } from '../types';

export type MyAssistantIntentType =
  | 'CURRENT_LIVESTOCK'
  | 'LIVESTOCK_TREND'
  | 'ADDITIONS'
  | 'REDUCTIONS'
  | 'MORTALITY'
  | 'VACCINATION'
  | 'TREATMENT'
  | 'ACTIVITY_SUMMARY'
  | 'IMPORTANT_OBSERVATIONS'
  | 'FARM_INSIGHTS'
  | 'HISTORICAL_COUNT'
  | 'HISTORICAL_LATEST'
  | 'HISTORICAL_BY_TYPE'
  | 'HISTORICAL_BY_PERIOD'
  | 'UNKNOWN_INTENT';

export type MyAssistantDataSufficiency =
  | 'SUFFICIENT'
  | 'LIMITED'
  | 'INSUFFICIENT'
  | 'ZERO_RESULT'
  | 'NO_DATA'
  | 'SOURCE_ERROR';

export type MyAssistantProvenance =
  | 'FACT'
  | 'DERIVED_INTELLIGENCE'
  | 'OBSERVATION'
  | 'FARM_INSIGHT';

export interface MyAssistantTimePeriod {
  label: string;
  canonicalWindow?: '7d' | '30d' | '90d' | '180d' | '365d' | 'all_time';
  startDate: string | null;
  endDate: string | null;
}

export interface MyAssistantAIIntelligenceResult {
  detected: boolean;
  intent: MyAssistantIntentType;
  confidence: number;
  species: string | null;
  speciesLabel?: string;
  timePeriod: MyAssistantTimePeriod;
  provenance: MyAssistantProvenance;
  source: 'MY_ASSISTANT_INTELLIGENCE' | 'LIVESTOCK_RECORDS' | 'LIVESTOCK_HISTORY';
  authorityLevel: 'AUTHORITATIVE_STRUCTURED' | 'DERIVED_STRUCTURED';
  dataSufficiency: MyAssistantDataSufficiency;

  // Numerical clarity: distinction between event counts and animal quantities
  eventCount: number | null;
  animalQuantity: number | null;
  startingQuantity?: number | null;
  currentQuantity?: number | null;

  // Deterministic Answer where applicable (Section 14)
  isDeterministicEligible: boolean;
  deterministicAnswer: string;
  explanationSwahili: string;

  // Safety notices (Veterinary & diagnostic boundary: no medical diagnosis, no drug prescribing)
  safetyNotice: string | null;

  // Verified structured evidence / payload from V1.4 engine
  evidence: any;

  // Diagnostic observability metadata
  observability: {
    serviceCalled: string;
    recordCount: number;
    totalEventsExamined: number;
    computationDurationMs: number;
  };
}

export interface BridgeAdapterInputParams {
  userId: string;
  records: LivestockRecord[];
  recordEventsMap: Record<string, LivestockEvent[]>;
  species?: string | null;
  timeWindow?: string | null;
  question?: string;
  history?: any[];
  options?: any;
}

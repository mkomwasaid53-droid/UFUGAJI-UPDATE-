/**
 * V1.5A — CONTEXT ORCHESTRATION TYPES
 * Phase 4: The Intelligent Loop — AI Context Layer
 *
 * Defines the normalized internal context model, provenance labeling,
 * authority hierarchy, context budget, and Gemini input contract.
 */

import { UserProfile, LivestockRecord, LivestockEvent, FarmerContext, EventType } from '../types';
import {
  LivestockIntelligenceSnapshot,
  LivestockTrendsSnapshot,
  LivestockMovementSnapshot,
  HealthActivityHistorySnapshot,
  ActivitySummarySnapshot,
  ImportantObservationsSnapshot,
  DataSufficiencyLevel
} from './livestockIntelligence';
import { HistoryQuestionResult } from './historyQuestionTypes';
import { MarketplaceProduct } from './marketplace';
import { VisualMarketplaceIntentResult, NormalizedVisualMarketplaceQuery } from './visualMarketplace';
import { VideoProcessingResult } from './videoPipeline';
import { MyAssistantAIIntelligenceResult } from './aiMyAssistant';
import { MarketplaceAIIntelligenceResult } from './aiMarketplace';
import { DigitalShop } from './marketplace';
import {
  CombinedContextReasoningResult,
  CombinedContextCombinationType,
  AuthoritativeAnchors,
  AuthoritativeFarmAnchor,
  AuthoritativeIntelligenceAnchor,
  AuthoritativeCommercialAnchor,
  AuthoritativeVisualAnchor,
  AuthoritativeProfileAnchor
} from './aiCombinedReasoning';
import { SafetyValidationResult } from './aiSafetyControl';
import { DaktariAIIntelligenceResult } from './aiDaktariLoop';

export type {
  CombinedContextReasoningResult,
  CombinedContextCombinationType,
  AuthoritativeAnchors,
  AuthoritativeFarmAnchor,
  AuthoritativeIntelligenceAnchor,
  AuthoritativeCommercialAnchor,
  AuthoritativeVisualAnchor,
  AuthoritativeProfileAnchor,
  SafetyValidationResult
};

// ==============================================================================
// 1. CONTEXT SOURCES & PROVENANCE
// ==============================================================================

export type ContextSourceType =
  | 'FARMER_PROFILE'
  | 'FARMER_CONTEXT'
  | 'LIVESTOCK_RECORDS'
  | 'LIVESTOCK_HISTORY'
  | 'MY_ASSISTANT_INTELLIGENCE'
  | 'MARKETPLACE'
  | 'CONVERSATION'
  | 'IMAGE'
  | 'VIDEO'
  | 'DAKTARI'; // Architectural readiness for Daktari Mtaani Kwako

/**
 * Fact provenance labeling (Section 15).
 * Distinguishes where a piece of information came from.
 */
export type ContextProvenance =
  | 'FACT_SOURCE'         // Authoritative database records, verified historical events, confirmed marketplace facts
  | 'DERIVED_SOURCE'      // Mathematically/rule-derived V1.4 intelligence snapshots
  | 'MODULE_SOURCE'       // Real-time module data (e.g. active marketplace products)
  | 'CONVERSATION_SOURCE' // User statements or conversational exchanges; NOT authoritative farm facts
  | 'VISUAL_SOURCE';      // Visual observations from images or videos; evidence, not facts

/**
 * Authority hierarchy (Section 14).
 * Level 1: Authoritative structured data (records, history, confirmed facts)
 * Level 2: Derived structured intelligence (My Assistant V1.4)
 * Level 3: Current real-time module data
 * Level 4: Conversational context
 * Level 5: Visual evidence
 */
export type ContextAuthorityLevel =
  | 'AUTHORITATIVE_STRUCTURED'
  | 'DERIVED_STRUCTURED'
  | 'REALTIME_MODULE'
  | 'CONVERSATIONAL'
  | 'VISUAL_EVIDENCE';

// ==============================================================================
// 2. CONTEXT STATUS & RELEVANCE
// ==============================================================================

export type ContextAvailabilityStatus =
  | 'AVAILABLE'
  | 'NOT_RELEVANT'
  | 'UNAVAILABLE'
  | 'STALE'
  | 'INSUFFICIENT'
  | 'ERROR';

export type ContextFreshness =
  | 'FRESH'
  | 'STALE'
  | 'CACHED'
  | 'NOT_APPLICABLE';

export type ContextRelevance =
  | 'CRITICAL'   // Absolutely required to answer the prompt
  | 'SUPPORTING' // Provides helpful context or grounding
  | 'OPTIONAL'   // Can be included if token budget permits
  | 'EXCLUDED';  // Not relevant to the intent; MUST be omitted

export type ContextIntentNeed =
  | 'GENERAL_KNOWLEDGE'        // Generic farming principle (e.g. "Kwa nini kuku wanahitaji maji safi?")
  | 'HISTORICAL_QA'             // History/events question (e.g. "Nimefanya treatment mara ngapi?")
  | 'LIVESTOCK_STATUS'          // Current balance/stock (e.g. "Kuku wangu wako wangapi?")
  | 'LIVESTOCK_TREND'           // Trends over time (e.g. "Mifugo yangu imeongezeka?")
  | 'LIVESTOCK_ADDITIONS'       // Additions / newly acquired (e.g. "Nimeongeza kuku wangapi?")
  | 'LIVESTOCK_REDUCTIONS'      // Reductions / sales (e.g. "Nimepunguza kuku wangapi?")
  | 'LIVESTOCK_MORTALITY'       // Mortality history (e.g. "Vifo vya kuku vikoje?")
  | 'VACCINATION_HISTORY'       // Vaccination history (e.g. "Nimechanja kuku mara ngapi?")
  | 'TREATMENT_HISTORY'         // Treatment history (e.g. "Nimefanya treatment mara ngapi?")
  | 'ACTIVITY_SUMMARY'          // Activity rollups (e.g. "Nimefanya shughuli gani nyingi?")
  | 'IMPORTANT_OBSERVATIONS'    // Key observations (e.g. "Kuna jambo gani muhimu?")
  | 'FARM_INSIGHTS'             // Farm insights (e.g. "My Assistant inaona nini?")
  | 'FARM_TRENDS_INSIGHTS'      // Trends, movement, observations, insights (legacy umbrella)
  | 'HEALTH_TREATMENT'          // Vaccines, treatments, medicines (legacy umbrella)
  | 'MARKETPLACE_QUERY'         // Products, feed, pricing, sellers
  | 'VISUAL_ASSESSMENT'         // Photo/video observation & guidance
  | 'FARMER_PROFILE'            // User identity, location, farming type
  | 'COMBINED_CONTEXT'          // Cross-domain questions (e.g. feed for my chickens)
  | 'UNKNOWN_AMBIGUOUS';        // Ambiguous -> conservative minimal context

// ==============================================================================
// 3. CONTEXT SOURCE METADATA & DATA CONTAINERS
// ==============================================================================

export interface ContextSourceMetadata<T = any> {
  source: ContextSourceType;
  provenance: ContextProvenance;
  authority: ContextAuthorityLevel;
  status: ContextAvailabilityStatus;
  relevance: ContextRelevance;
  freshness: ContextFreshness;
  sensitivity: 'PUBLIC' | 'FARMER_PRIVATE' | 'SYSTEM_INTERNAL';
  estimatedTokens: number;
  characterCount: number;
  reason: string;
  data?: T;
  summaryText?: string;
  warningNotice?: string;
}

/**
 * Normalized conversation context turn
 */
export interface ConversationContextTurn {
  role: 'user' | 'model';
  text: string;
  hasImage?: boolean;
  hasVideo?: boolean;
}

export interface ConversationContextData {
  recentTurns: ConversationContextTurn[];
  activeTopic?: string;
  referencedEntities?: {
    livestockType?: string;
    productConcept?: string;
    timeframe?: string;
    isFollowUpQuestion?: boolean;
  };
}

/**
 * Normalized Marketplace context data (Section 7)
 */
export interface MarketplaceContextData {
  query?: string;
  category?: string;
  livestockTarget?: string;
  products: Array<{
    productId: string;
    title: string;
    price: number;
    currency: string;
    unit: string;
    quantityAvailable: number;
    sellerName: string;
    sellerLocation: string;
    sellerVerificationStatus?: string;
  }>;
  resultCount: number;
  isRealTimeRetrieval: boolean;
}

/**
 * Architectural Readiness for Daktari Context (Section 11 & 25)
 * Prepared to accommodate future Daktari context without executing actions in V1.5A.
 */
export interface DaktariContextData {
  searchIntent?: string;
  specialty?: string;
  location?: string;
  verifiedDoctorsAvailable?: number;
  note: string;
}

// ==============================================================================
// 4. NORMALIZED AI CONTEXT BUNDLE (Section 12)
// ==============================================================================

export interface AIContextBundle {
  version: 'V1.5A' | 'V1.5B' | 'V1.5C' | 'V1.5D' | 'V1.5E' | 'V1.5F' | 'V1.5G' | 'V1.5H';
  requestId: string;
  userId: string;
  timestamp: string;
  detectedIntent: ContextIntentNeed;
  detectedTopics: string[];
  mentionedSpecies: string[];

  // Source metadata map
  sources: Record<ContextSourceType, ContextSourceMetadata>;

  // Selection summary
  selectedSources: ContextSourceType[];
  excludedSources: ContextSourceType[];

  // V1.5B: Authoritative My Assistant Intelligence Result
  myAssistantIntelligenceResult?: MyAssistantAIIntelligenceResult;

  // V1.5C: Authoritative Marketplace Intelligence Result (Gulio la Ufugaji Update)
  marketplaceIntelligenceResult?: MarketplaceAIIntelligenceResult;

  // V1.5E: Combined Context Reasoning Result (Controlled cross-context reasoning)
  combinedReasoning?: CombinedContextReasoningResult;

  // V1.5F: Safety & Hallucination Control Result
  safetyValidation?: SafetyValidationResult;

  // V1.5G: Authoritative Daktari Mtaani Kwako Loop Result
  daktariIntelligenceResult?: DaktariAIIntelligenceResult;

  // Context Budgeting & Minimization (Section 19 & 20)
  budget: {
    maxTokenBudget: number;
    usedTokens: number;
    utilizationPercent: number;
    minimized: boolean;
    truncationOccurred: boolean;
  };

  // Safe Observability (Section 41 & 42)
  observability: {
    intentConfidence: number;
    selectionRationale: Record<ContextSourceType, string>;
    degradedSources: ContextSourceType[];
    hasConflictWarning: boolean;
    conflictNotes?: string[];
  };

  // Architectural Readiness & Integration for Daktari Mtaani Kwako
  daktariReadiness: {
    isSupportedInV15A: boolean;
    architecturalStatus: 'ACTIVE_V15G_INTEGRATED' | 'ACTIVE_V15H_INTEGRATED' | 'READY_FOR_FUTURE_EXPANSION';
    schemaVersion: string;
    note: string;
  };
}

// ==============================================================================
// 5. GEMINI INPUT CONTRACT (Section 30)
// ==============================================================================

export interface GeminiContextPackage {
  contextBlock: string;
  selectedSourcesCount: number;
  provenanceSummary: string;
  safetyDirectives: string[];
  systemPromptAddendum: string;
  observabilitySummary: {
    intent: ContextIntentNeed;
    includedSources: ContextSourceType[];
    excludedSources: ContextSourceType[];
    estimatedTokens: number;
  };
}

// ==============================================================================
// 6. ORCHESTRATION INPUT PARAMETERS
// ==============================================================================

export interface OrchestrationInputParams {
  userId?: string;
  question: string;
  history?: any[];
  userProfile?: UserProfile | null;
  farmerLocation?: string;
  farmerRecords?: LivestockRecord[];
  recordEventsMap?: Record<string, LivestockEvent[]>;
  farmerContext?: FarmerContext | null;
  serializedFarmerContext?: string;
  marketplaceProducts?: MarketplaceProduct[];
  publishedShops?: DigitalShop[];
  explicitMarketplaceQuery?: any;
  imageAttachment?: {
    fileName?: string;
    mimeType?: string;
    sizeBytes?: number;
    width?: number;
    height?: number;
  };
  videoAttachment?: {
    id?: string;
    fileName?: string;
    mimeType?: string;
    fileSize?: number;
    duration?: number;
  };
  hasBinaryImage?: boolean;
  hasBinaryVideo?: boolean;
  videoProcessingResult?: VideoProcessingResult;
  historyQuestionResult?: HistoryQuestionResult;
  marketplaceIntent?: any;
  visualMarketplaceIntent?: VisualMarketplaceIntentResult;
  daktariProfiles?: import('./aiDaktariLoop').DaktariContextProfile[];
  doctorAction?: any;
  maxTokenBudget?: number;
}

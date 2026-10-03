/**
 * V1.5E — COMBINED CONTEXT REASONING TYPES
 * Phase 4: The Intelligent Loop (AI Context Layer)
 *
 * Defines the types and contracts for controlled cross-context reasoning
 * across multiple authoritative sources (Farmer Profile, FarmerContext,
 * Livestock Records/History, My Assistant, Marketplace, Conversation, Image, Video).
 *
 * Core Principles:
 * 1. Source Authority Preservation:
 *    - Livestock Records / History: Authoritative for farm facts (counts, events, mortality).
 *    - My Assistant: Authoritative for structured farmer intelligence (trends, activity summaries).
 *    - Marketplace: Authoritative for commercial facts (prices, verified stock, sellers).
 *    - Visual Evidence: Observational evidence only (not diagnosis, not commerce truth).
 *    - Conversation: User intent & conversational constraints.
 *    - AI Interpretation: Synthesized reasoning & explanation, NEVER turning inference into fact.
 * 2. Relevance First: Retrieve only what is necessary; never combine all sources by default.
 * 3. Read-Only Enforced: AI cannot modify, write, or create records or events.
 * 4. Marketplace / Assistant Independence: Zero commercial bias in farm intelligence.
 * 5. Medical Safety Boundary: Never recommend medicine based on mortality or marketplace stock.
 */

import { ContextSourceType } from './contextOrchestration';

export type CombinedContextCombinationType =
  | 'FARM_RECORDS_AND_MARKETPLACE'  // E.g. farmer's chickens + feed / equipment pricing
  | 'MY_ASSISTANT_AND_MARKETPLACE'  // E.g. additions/trends/activities + marketplace discovery
  | 'VISUAL_AND_RECORDS'            // E.g. photo/video observation + farm ledger comparison
  | 'VISUAL_AND_MARKETPLACE'        // E.g. photo/video + marketplace product query
  | 'PROFILE_AND_MARKETPLACE'       // E.g. farmer location + regional marketplace discovery
  | 'MULTI_SOURCE_SYNTHESIS';       // E.g. profile + records + marketplace, or media + records + marketplace

export interface AuthoritativeFarmAnchor {
  summary: string;
  recordCount?: number;
  totalLivestock?: number;
  primarySpecies?: string;
  source: 'LIVESTOCK_RECORDS' | 'LIVESTOCK_HISTORY' | 'FARMER_CONTEXT';
}

export interface AuthoritativeIntelligenceAnchor {
  summary: string;
  intent?: string;
  period?: string;
  dataSufficiency?: string;
  source: 'MY_ASSISTANT_INTELLIGENCE';
}

export interface AuthoritativeCommercialAnchor {
  summary: string;
  totalProductsMatched: number;
  totalShopsMatched: number;
  topMatchedProducts?: Array<{
    title: string;
    priceFormatted: string;
    sellerName: string;
    location: string;
  }>;
  source: 'MARKETPLACE';
}

export interface AuthoritativeVisualAnchor {
  summary: string;
  mediaType: 'image' | 'video';
  detectedObjectConcept?: string;
  source: 'IMAGE' | 'VIDEO';
}

export interface AuthoritativeProfileAnchor {
  summary: string;
  location?: string;
  source: 'FARMER_PROFILE';
}

export interface AuthoritativeAnchors {
  farmFacts?: AuthoritativeFarmAnchor;
  intelligenceFacts?: AuthoritativeIntelligenceAnchor;
  commercialFacts?: AuthoritativeCommercialAnchor;
  visualEvidence?: AuthoritativeVisualAnchor;
  profileContext?: AuthoritativeProfileAnchor;
}

export interface CombinedContextReasoningResult {
  detected: boolean;
  combinationType: CombinedContextCombinationType;
  intentLabelSwahili: string;
  primarySources: ContextSourceType[];
  reasoningGoal: string;
  authoritativeAnchors: AuthoritativeAnchors;
  synthesizedGuidanceSwahili: string;
  safetyConstraints: string[];
  medicalRestricted: boolean;
  medicalSafetyNotice?: string;
  readOnlyEnforced: true;
  independenceVerified: true;
  confidence: number;
  isDeterministicEligible: boolean;
}

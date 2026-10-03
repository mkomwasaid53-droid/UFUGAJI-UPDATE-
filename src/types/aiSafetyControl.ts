/**
 * V1.5F — SAFETY & HALLUCINATION CONTROLS
 * Type Definitions & Data Contracts
 *
 * Enforces strict grounding against authoritative sources:
 * - LEVEL 1: Authoritative System Data (Records, History, My Assistant, Marketplace live results, Verified Daktari)
 * - LEVEL 2: Derived Structured Data (Totals, Trends, Mortality rates, Aggregates)
 * - LEVEL 3: User Conversation (Intent, Questions, Preferences - NOT automatic history)
 * - LEVEL 4: Image/Video Evidence (Visual features - NOT diagnosis, NOT records)
 * - LEVEL 5: AI Interpretation (Explanations - NEVER promoted to FACT)
 */

export type AuthorityLevel =
  | 'LEVEL_1_AUTHORITATIVE'
  | 'LEVEL_2_DERIVED'
  | 'LEVEL_3_CONVERSATION'
  | 'LEVEL_4_VISUAL_EVIDENCE'
  | 'LEVEL_5_AI_INTERPRETATION';

export type ClaimClassification =
  | 'FACT'
  | 'DERIVED'
  | 'OBSERVATION'
  | 'INFERENCE'
  | 'INTERPRETATION'
  | 'UNKNOWN'
  | 'NOT_VERIFIED';

export type DataAvailabilityState =
  | 'NO_DATA'
  | 'UNKNOWN'
  | 'ERROR'
  | 'STALE'
  | 'INSUFFICIENT';

export type SafetyRiskLevel =
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH'
  | 'BLOCKED';

export type SafetyViolationType =
  | 'UNSUPPORTED_MARKETPLACE_PRODUCT'
  | 'UNSUPPORTED_PRICE'
  | 'UNSUPPORTED_STOCK'
  | 'UNVERIFIED_PRICE_CLAIM'
  | 'UNSUPPORTED_SELLER'
  | 'UNSUPPORTED_DOCTOR'
  | 'UNSUPPORTED_DOCTOR_HALLUCINATION'
  | 'UNSUPPORTED_CREDENTIAL'
  | 'UNSUPPORTED_LIVESTOCK_HISTORY'
  | 'UNSUPPORTED_TREATMENT_HISTORY'
  | 'UNSUPPORTED_VACCINATION_HISTORY'
  | 'UNSUPPORTED_OBSERVATION'
  | 'UNSUPPORTED_FARM_INSIGHT'
  | 'MEDICAL_DIAGNOSIS'
  | 'UNSUPPORTED_MEDICAL_RECOMMENDATION'
  | 'AUTOMATIC_ACTION_ATTEMPT'
  | 'PRIVACY_LEAKAGE'
  | 'CROSS_FARMER_LEAKAGE'
  | 'UNSUPPORTED_CERTAINTY'
  | 'CONTRADICTION_WITH_AUTHORITATIVE_SOURCE'
  | 'PROMPT_INJECTION_DETECTED';

export interface SafetyViolation {
  type: SafetyViolationType;
  claim: string;
  sourceAuthority?: string;
  severity: 'WARNING' | 'CRITICAL';
  suggestedRemedy: string;
}

export interface SourceConflict {
  field: string;
  authoritativeSource: string;
  authoritativeValue: string;
  untrustedSource: string;
  untrustedValue: string;
  resolution: string;
}

export interface SafetyTelemetry {
  validationPassed: boolean;
  riskLevel: SafetyRiskLevel;
  blockedViolationsCount: number;
  blockedHallucinationTypes: SafetyViolationType[];
  sourceConflictDetected: boolean;
  medicalSafetyTriggered: boolean;
  externalActionBlocked: boolean;
  promptInjectionBlocked: boolean;
  regenerationRequired: boolean;
  timestamp: string;
}

export interface GroundedClaimAnchor {
  category: ClaimClassification;
  authorityLevel: AuthorityLevel;
  sourceName: string;
  verifiedFact: string;
}

export interface SafetyValidationResult {
  allowed: boolean;
  riskLevel: SafetyRiskLevel;
  grounded: boolean;
  validatedText: string;
  originalText: string;
  violations: SafetyViolation[];
  unsupportedClaims: string[];
  sourceConflicts: SourceConflict[];
  medicalSafetyTriggered: boolean;
  externalActionBlocked: boolean;
  privacyIssueDetected: boolean;
  promptInjectionDetected: boolean;
  rewriteRequired: boolean;
  telemetry: SafetyTelemetry;
  authorityPreserved: boolean;
  readOnlyGuaranteed: boolean;
  anchors: GroundedClaimAnchor[];
}

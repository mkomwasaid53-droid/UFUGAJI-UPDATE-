/**
 * UFUGAJI UPDATE — V1.5G Daktari Mtaani Kwako Loop Integration Types
 * 
 * Central types for the professional assistance module integration into:
 * AI ↔ My Assistant ↔ Marketplace ecosystem.
 * 
 * CORE PRINCIPLE:
 * "AI/My Assistant can identify a signal and guide the farmer toward professional help.
 * AI/My Assistant is NOT the professional assessor."
 * "Daktari Mtaani Kwako provides professional discovery and verified professional information."
 * "Consultation/private medical interaction data MUST NOT automatically flow back into AI context."
 */

export type DaktariSearchIntent =
  | 'DAKTARI_SEARCH'
  | 'DAKTARI_NEARBY'
  | 'DAKTARI_BY_LIVESTOCK'
  | 'DAKTARI_BY_SPECIALTY'
  | 'DAKTARI_BY_SERVICE'
  | 'DAKTARI_EMERGENCY'
  | 'DAKTARI_BY_LOCATION'
  | 'DAKTARI_VERIFIED_ONLY'
  | 'DAKTARI_PROFILE'
  | 'NO_DAKTARI_INTENT'
  | 'AMBIGUOUS_DAKTARI_REQUEST';

/**
 * STRICT RULE: Registration ≠ Verification
 * A professional who has registered or paid registration fee must NOT automatically
 * receive "Verified" status unless actual verification status confirms it.
 */
export type AuthoritativeDoctorVerificationStatus =
  | 'REGISTERED'
  | 'PENDING_VERIFICATION'
  | 'VERIFIED'
  | 'REJECTED'
  | 'SUSPENDED'
  | 'UNAVAILABLE';

/**
 * Structured Daktari Query (Section 5)
 * Only populate fields supported by the farmer's request or trusted context.
 * Never invent location, specialty, livestock type, urgency, emergency requirement.
 */
export interface DaktariQuery {
  intent: DaktariSearchIntent;
  livestockType?: string;
  specialty?: string;
  service?: string;
  region?: string;
  district?: string;
  area?: string;
  nearby?: boolean;
  emergency?: boolean;
  verificationPreference?: boolean;
  availabilityPreference?: string;
  specificDoctorName?: string;
}

/**
 * Safe Structured Daktari Profile Data for AI Context (Section 20)
 * Only public profile fields are included.
 * Private consultation content (messages, notes, diagnosis, history) MUST NOT BE INCLUDED.
 */
export interface DaktariContextProfile {
  profileId: string;
  fullName: string;
  professionalTitle: string;
  professionalType: string;
  specialty?: string;
  livestockTypes: string[];
  services: string[];
  region: string;
  district: string;
  area?: string;
  phone?: string;
  whatsapp?: string;
  verificationStatus: AuthoritativeDoctorVerificationStatus;
  availability: string;
  emergencyAvailability: boolean;
  profileCompleteness: number; // 0 - 100%
  bio?: string;
  isStaleAvailability?: boolean;
}

/**
 * Daktari Handoff Model (Section 39)
 * Used when AI or My Assistant detects a signal recommending professional care.
 * SIGNAL ≠ DIAGNOSIS
 */
export interface DaktariHandoff {
  reason: string;
  source: 'AI_CONVERSATION' | 'MY_ASSISTANT' | 'VISUAL_MEDIA' | 'LIVESTOCK_HISTORY';
  signalType:
    | 'MORTALITY_PATTERN'
    | 'TREATMENT_ACTIVITY'
    | 'VACCINATION_ACTIVITY'
    | 'IMPORTANT_OBSERVATION'
    | 'DATA_GAP'
    | 'LIVESTOCK_HEALTH_RELATED_HISTORY'
    | 'EXPLICIT_REQUEST'
    | 'EMERGENCY_DETECTED'
    | 'INSUFFICIENT_VISUAL_EVIDENCE';
  livestockType?: string;
  location?: string;
  urgency: 'ROUTINE' | 'ADVISORY' | 'URGENT' | 'EMERGENCY';
  suggestedAction: 'PROFESSIONAL_ASSESSMENT' | 'CONSULTATION_SEARCH' | 'EMERGENCY_CARE';
  explanatoryNoteSwahili: string;
}

/**
 * Daktari AI Intelligence Result (Section 4, 9, 20)
 * Authoritative outcome of Daktari discovery passed into the context bundle.
 */
export interface DaktariAIIntelligenceResult {
  detected: boolean;
  intent: DaktariSearchIntent;
  query: DaktariQuery;
  status: 'FOUND' | 'NO_RESULT' | 'RETRIEVAL_ERROR';
  totalMatched: number;
  results: DaktariContextProfile[];
  topRecommendation?: DaktariContextProfile;
  handoff?: DaktariHandoff;
  deterministicExplanationSwahili: string;
  safetyNotice: string;
  authorityLevel: 'LEVEL_1_AUTHORITATIVE';
  // Consultation privacy guarantee
  consultationPrivacyConfirmed: true;
}

export interface DaktariSearchResult {
  status: 'FOUND' | 'NO_RESULT' | 'RETRIEVAL_ERROR';
  results: DaktariContextProfile[];
  totalMatched: number;
  query: DaktariQuery;
}

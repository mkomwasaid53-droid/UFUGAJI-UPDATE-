/**
 * V1.2G — AI ASSISTANT ↔ DAKTARI MTAANI KWAKO INTEGRATION
 * Type definitions for structured AI doctor recommendations and actions.
 */

import { VisualMarketplaceAction } from './visualMarketplace';

export type DoctorHandoffReason =
  | 'PROFESSIONAL_ASSESSMENT_RECOMMENDED'
  | 'EXPLICIT_REQUEST'
  | 'EMERGENCY_DETECTED'
  | 'INSUFFICIENT_VISUAL_EVIDENCE';

export interface DoctorSearchFilters {
  region?: string;
  district?: string;
  livestockType?: string;
  service?: string;
  emergency?: boolean;
  query?: string;
}

export interface AiDoctorAction {
  type: 'FIND_DOCTOR';
  label: string; // e.g. "Tafuta Daktari", "Tafuta Daktari wa Kuku", "Tafuta Daktari wa Karibu", "Tafuta Daktari wa Dharura"
  reason: DoctorHandoffReason;
  filters: DoctorSearchFilters;
}

export type AiAction = AiDoctorAction | VisualMarketplaceAction;

export interface DoctorClassifierResult {
  detected: boolean;
  action?: AiDoctorAction;
  isEmergency: boolean;
  reason?: DoctorHandoffReason;
  matchedKeywords: string[];
}

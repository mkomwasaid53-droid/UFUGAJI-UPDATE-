/**
 * Ufugaji Update — V1.9D Advertising Operations, Analytics & Controlled Launch Foundation Types
 *
 * Strictly typed definitions for:
 * 1. Advertising Operational Events & Observability Model
 * 2. Reward Funnel & Free AI Quota Progression Metrics
 * 3. Provider Performance & Availability Health Metrics
 * 4. Controlled Production Launch & Safety Gate Status
 * 5. Emergency Rollback Kill Switch & Abuse Guard
 * 6. Server-Authoritative Time (EAT / UTC+3) Date Range Filtering
 * 7. Non-Financial Metric Boundaries (rewardCount != revenue)
 */

import { AdPlatform, AdProviderMode } from '../services/ad/adProviderInterface';
import { AdFailureState, UserConsentStatus } from './aiUsageAndCache';

// ============================================================================
// 1. ADVERTISING OPERATIONAL EVENT TYPES
// ============================================================================

export type AdOperationalEventType =
  | 'AD_SESSION_CREATED'
  | 'AD_STARTED'
  | 'AD_COMPLETED'
  | 'AD_REWARD_GRANTED'
  | 'AD_REWARD_DUPLICATE'
  | 'AD_REWARD_REJECTED'
  | 'AD_SESSION_EXPIRED'
  | 'AD_USER_MISMATCH'
  | 'AD_PRODUCTION_BLOCKED'
  | 'AD_PROVIDER_ERROR'
  | 'AD_CONSENT_REQUIRED'
  | 'AD_CONSENT_DENIED'
  | 'AD_PROVIDER_UNAVAILABLE'
  | 'AD_OFFERED'
  | 'AD_DISMISSED'
  | 'AD_ABUSE_THROTTLED'
  | 'AD_KILL_SWITCH_BLOCKED'
  // V1.9F Web Rewarded & Google Ad Manager Events
  | 'WEB_REWARDED_SESSION_CREATED'
  | 'WEB_REWARDED_READY'
  | 'WEB_REWARDED_SHOWN'
  | 'WEB_REWARDED_GRANTED_SIGNAL'
  | 'WEB_REWARDED_CLOSED'
  | 'WEB_REWARDED_COMPLETED'
  | 'WEB_REWARDED_REJECTED'
  | 'WEB_REWARDED_NO_FILL'
  | 'WEB_REWARDED_PROVIDER_ERROR'
  | 'WEB_REWARDED_DUPLICATE';

export interface AdOperationalEvent {
  eventId: string;
  userId: string;
  adSessionId: string;
  rewardReference?: string;
  requestId?: string;
  provider: string;
  platform: AdPlatform;
  mode: AdProviderMode;
  eventType: AdOperationalEventType;
  timestamp: string; // ISO 8601 server time
  success: boolean;
  failureCode?: string;
  environment: string; // 'development' | 'production' | 'test'
  appVersion: string; // 'V1.9D'
  metadata?: Record<string, string | number | boolean>; // Strictly non-sensitive, no secrets
}

// ============================================================================
// 2. DATE RANGES & TIMEZONE (EAT / UTC+3)
// ============================================================================

export type AdDateRangeOption = 'TODAY' | 'YESTERDAY' | 'LAST_7_DAYS' | 'LAST_30_DAYS' | 'ALL';

export interface AdTimeWindow {
  option: AdDateRangeOption;
  label: string;
  startTimeIso: string;
  endTimeIso: string;
  timeZone: string; // 'Africa/Dar_es_Salaam (EAT / UTC+3)'
}

// ============================================================================
// 3. REWARD FUNNEL METRICS
// ============================================================================

export interface FunnelStepCount {
  step: string;
  label: string;
  description: string;
  count: number;
  conversionRateFromPreviousPct?: number;
  conversionRateFromTopPct?: number;
}

export interface AdRewardFunnelMetrics {
  timeWindow: AdTimeWindow;
  // Free AI Funnel Steps
  quotaExhaustedUsersCount: number;
  adOfferedCount: number;
  sessionsCreatedCount: number;
  adsStartedCount: number;
  adsCompletedCount: number;
  rewardsVerifiedCount: number;
  rewardsGrantedCount: number;
  rewardsRejectedCount: number;
  duplicateAttemptsCount: number;
  expiredSessionsCount: number;
  userMismatchCount: number;
  // Sequential Step Breakdown
  steps: FunnelStepCount[];
  // Summary Ratios
  completionRatePct: number; // completed / started
  grantRatePct: number; // granted / completed
  // Reward Metrics
  totalVerifiedRewards: number;
  totalGrantedTextQueriesAllowance: number; // strictly 5 * totalVerifiedRewards
  averageRewardCyclesPerFreeUser: number;
  uniqueRewardedUsersCount: number;
  repeatRewardedUsersCount: number;
}

// ============================================================================
// 4. PROVIDER PERFORMANCE & HEALTH METRICS
// ============================================================================

export interface ProviderPerformanceBreakdown {
  provider: string;
  platform: AdPlatform;
  mode: AdProviderMode;
  adRequests: number;
  sessionsCreated: number;
  successfulCompletions: number;
  rewardGrants: number;
  rejectedRewards: number;
  providerFailures: number;
  unavailableEvents: number;
  productionBlockedEvents: number;
  lastActiveTimestamp?: string;
}

export interface ProviderHealthStatus {
  status: 'AVAILABLE' | 'UNAVAILABLE' | 'DEGRADED';
  isConfigured: boolean;
  activeProviderName: string;
  activeMode: AdProviderMode;
  activePlatform: AdPlatform;
  errorCountLast24h: number;
  lastSuccessfulEventAt: string | null;
  lastFailureEventAt: string | null;
  lastFailureReason?: string;
  lastDiagnosticCheckAt: string;
  killSwitchActive: boolean;
  productionEnabled: boolean;
  diagnosticDetails: {
    safetyGatePassed: boolean;
    failingConditionsCount: number;
    hasActiveNetworkProvider: boolean;
    appAdsTxtConfigured: boolean;
    privacyPolicyConfigured: boolean;
  };
}

// ============================================================================
// 5. CONTROLLED LAUNCH & SAFETY GATE OVERVIEW
// ============================================================================

export interface AdControlledLaunchState {
  productionEnabled: boolean;
  mode: AdProviderMode;
  platform: AdPlatform;
  providerName: string;
  killSwitchActive: boolean;
  safetyGate: {
    eligible: boolean;
    stage: string;
    failingConditions: string[];
    summary: string;
  };
  consentConfig: {
    defaultPolicy: string;
    totalConsentsRecorded: number;
  };
}

// ============================================================================
// 6. AD OPERATIONS ADMIN OVERVIEW
// ============================================================================

export interface AdOperationsAdminOverview {
  version: 'V1.9D';
  generatedAt: string;
  timeZone: string;
  status: AdControlledLaunchState;
  rewardOverview: {
    today: number;
    yesterday: number;
    thisWeek: number;
    thisMonth: number;
    uniqueRewardedUsers: number;
    duplicateAttempts: number;
    rejectedRewards: number;
    totalGrantedAllowance: number;
  };
  funnel: AdRewardFunnelMetrics;
  providerHealth: ProviderHealthStatus;
  providerPerformance: ProviderPerformanceBreakdown[];
  costAndRevenueDisclaimer: {
    notice: string;
    measuredRevenueTSh: null;
    currency: 'TZS';
    reason: string;
  };
}

// ============================================================================
// 7. ABUSE PROTECTION & RATE LIMITING
// ============================================================================

export interface AdAbuseGuardResult {
  allowed: boolean;
  errorCode?: 'AD_ABUSE_THROTTLED' | 'AD_COOLDOWN_ACTIVE';
  reason?: string;
  retryAfterSeconds?: number;
  temporaryCooldownActive: boolean;
}

// ============================================================================
// 8. V1.9E — PRODUCTION ADVERTISING LAUNCH & CONTROLLED ACTIVATION TYPES
// ============================================================================

export type ProductionLaunchStatus =
  | 'NOT_READY'
  | 'READY_FOR_ACTIVATION'
  | 'ACTIVATED'
  | 'PAUSED'
  | 'BLOCKED';

export type ProductionPauseReason =
  | 'MANUAL_PAUSE'
  | 'SAFETY_GATE_FAILURE'
  | 'PROVIDER_UNAVAILABLE'
  | 'NONE';

export type ProductionRolloutMode = 'ALL_ELIGIBLE_USERS' | 'DISABLED';

export type ProductionHealthState = 'HEALTHY' | 'DEGRADED' | 'BLOCKED' | 'PAUSED';

export interface ProductionHealthEvaluation {
  status: ProductionHealthState;
  providerAvailability: boolean;
  productionAdConfiguration: boolean;
  safetyGate: {
    passed: boolean;
    reason?: string;
    failingConditions: string[];
  };
  consentReadiness: boolean;
  runtimeEnvironment: string;
  killSwitch: boolean;
  lastSuccessfulAdEvent: string | null;
  recentProviderFailures: number;
  evaluatedAt: string;
}

export type ChecklistItemId =
  | 'production_provider_configured'
  | 'production_platform_configured'
  | 'production_ad_unit_configured'
  | 'privacy_policy_available'
  | 'terms_available'
  | 'contact_support_available'
  | 'developer_website_configured'
  | 'app_ads_txt_validated'
  | 'consent_configuration_ready'
  | 'admin_production_enablement'
  | 'production_runtime_environment'
  | 'provider_availability'
  | 'safety_gate_passed'
  | 'kill_switch_off';

export interface ChecklistItem {
  id: ChecklistItemId;
  number: number;
  label: string;
  description: string;
  satisfied: boolean;
  critical: boolean;
  failureReason?: string;
  value?: string;
}

export interface ProductionLaunchChecklist {
  version: 'V1.9E';
  status: ProductionLaunchStatus;
  overallReady: boolean;
  totalRequirements: 14;
  satisfiedCount: number;
  items: ChecklistItem[];
  pauseReason: ProductionPauseReason;
  rolloutMode: ProductionRolloutMode;
  healthState: ProductionHealthState;
  activeAdUnitIdMasked?: string;
  lastEvaluatedAt: string;
}

export type ProductionAuditAction =
  | 'production_readiness_evaluated'
  | 'activation_attempted'
  | 'activation_succeeded'
  | 'activation_blocked'
  | 'production_paused'
  | 'production_resumed'
  | 'automatic_safety_pause'
  | 'kill_switch_activated'
  | 'kill_switch_released';

export interface ProductionAuditEvent {
  eventId: string;
  adminUserId: string;
  action: ProductionAuditAction;
  timestamp: string;
  previousState: ProductionLaunchStatus;
  newState: ProductionLaunchStatus;
  reason?: string;
  failedRequirements?: string[];
  metadata?: Record<string, string | number | boolean>;
}


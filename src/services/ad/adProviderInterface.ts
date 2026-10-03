/**
 * V1.9A — Ad Provider Interface & Contracts
 *
 * Defines the provider-agnostic abstraction for advertising and rewarded access.
 * Decouples the application, Free AI quota, and AI entitlement system from
 * any specific commercial ad network (AdMob, Unity, AppLovin, etc.).
 */

import {
  AdType,
  AdRewardStatus,
  AdRewardRecord,
  AdAuditEvent,
  AdAuditEventType,
  AdObservabilityMetrics,
  AdProviderMode,
  AdPlatform,
  AdFailureState,
  UserConsentStatus,
  AdReadinessLifecycleStage,
  AdPresentationLifecycleState
} from '../../types/aiUsageAndCache';

export type {
  AdType,
  AdRewardStatus,
  AdRewardRecord,
  AdAuditEvent,
  AdAuditEventType,
  AdObservabilityMetrics,
  AdProviderMode,
  AdPlatform,
  AdFailureState,
  UserConsentStatus,
  AdReadinessLifecycleStage,
  AdPresentationLifecycleState
};

export type MockAdBehavior =
  | 'MOCK_COMPLETED'
  | 'MOCK_FAILED'
  | 'MOCK_DUPLICATE'
  | 'MOCK_INVALID_TOKEN'
  | 'MOCK_EXPIRED';

export interface StartRewardedAdParams {
  userId: string;
  requestId?: string;
  platform?: AdPlatform;
  mode?: AdProviderMode;
  consentStatus?: UserConsentStatus;
  metadata?: Record<string, any>;
}

export interface StartRewardedAdResult {
  success: boolean;
  providerSessionId: string;
  providerRewardId: string;
  rewardToken: string;
  adProvider: string;
  adType: AdType;
  mockMode?: boolean;
  mode?: AdProviderMode;
  platform?: AdPlatform;
  adUnitId?: string;
  errorCode?: AdFailureState;
  errorMessage?: string | null;
  diagnostic?: {
    provider: 'GAM_WEB' | 'MOCK' | string;
    environment: 'TEST' | 'PRODUCTION' | string;
    mode: 'REAL_PROVIDER' | 'SIMULATION' | string;
    adUnitPath: string;
    mock: boolean;
    status?: string;
  };
}

export interface VerifyRewardParams {
  userId: string;
  rewardToken: string;
  providerRewardId: string;
  providerTransactionId?: string;
  requestId?: string;
  platform?: AdPlatform;
  mode?: AdProviderMode;
  metadata?: Record<string, any>;
}

export interface VerifyRewardResult {
  isValid: boolean;
  providerRewardId: string;
  providerTransactionId: string;
  isDuplicate?: boolean;
  isExpired?: boolean;
  errorCode?: AdFailureState;
  errorMessage?: string | null;
  rawProviderResponse?: Record<string, any>;
}

/**
 * Core interface required for all Ad Providers.
 * Future ad networks can be connected by implementing this contract.
 */
export interface AdProvider {
  readonly providerName: string;
  readonly isConfigured: boolean;
  readonly mode?: AdProviderMode;
  readonly platform?: AdPlatform;
  readonly supportedPlatforms?: AdPlatform[];

  /**
   * Checks if this provider can run on the target platform (WEB or ANDROID).
   */
  supportsPlatform?(platform: AdPlatform): boolean;

  /**
   * Starts a rewarded ad session for the given user.
   */
  startRewardedAd(params: StartRewardedAdParams): Promise<StartRewardedAdResult>;

  /**
   * Verifies the completion proof returned by the ad network.
   */
  verifyReward(params: VerifyRewardParams): Promise<VerifyRewardResult>;

  /**
   * Safe configuration snapshot without secrets.
   */
  getSafeConfig?(): Record<string, any>;

  /**
   * Updates provider configuration at runtime (e.g., from Admin Panel).
   */
  updateConfig?(newConfig: Record<string, any>): void;

  /**
   * Safe non-ad test connection check.
   */
  testConnection?(): Promise<{
    status: 'CONNECTED' | 'CONFIGURATION_ERROR' | 'AUTHENTICATION_ERROR' | 'PROVIDER_ERROR' | 'NETWORK_ERROR';
    message: string;
    details?: any;
  }>;
}

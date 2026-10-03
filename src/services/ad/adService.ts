/**
 * V1.9A — Governed Ad & Reward Service
 *
 * Core engine for provider-neutral advertising and rewarded access:
 * 1. Provider-neutral abstraction & registry integration
 * 2. Server-authoritative reward records & lifecycle (PENDING, VERIFIED, REJECTED, CONSUMED, EXPIRED)
 * 3. Server-governed reward amount (Exactly 5 text queries, client cannot change)
 * 4. Strict replay protection & idempotency
 * 5. Complete user isolation (User A cannot claim or view User B's reward)
 * 6. Free quota integration without creating a secondary quota counter
 * 7. Strict Premium boundary (Ads NEVER activate or modify Premium)
 * 8. Strict Media restriction (Ads ONLY grant text queries; image/video stay blocked)
 * 9. Deterministic REWARDED_AD_UNAVAILABLE state when provider is unconfigured
 * 10. Audit trail & Admin observability
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
  AdSettingsState,
  AdReadinessLifecycleStage,
  UserConsentStatus
} from '../../types/aiUsageAndCache';
import {
  AdProvider,
  MockAdBehavior,
  StartRewardedAdResult
} from './adProviderInterface';
import { AdProviderRegistry, adProviderRegistry } from './adProviderRegistry';
import { adComplianceService } from './adComplianceService';
import { adOperationsAnalyticsService } from './adOperationsAnalyticsService';
import { adProductionLaunchService } from './adProductionLaunchService';
import {
  getUserEntitlementStatus,
  grantAuthoritativeAdRewardAllowance
} from '../aiUsageTrackingService';

export const REWARD_UNITS_PER_AD = 5; // Governed strictly on server
export const REWARD_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes window

export interface AdEligibilityResult {
  eligible: boolean;
  canUseAdReward: boolean;
  providerAvailable: boolean;
  activeProviderName: string | null;
  adType: AdType;
  remainingTextQueries: number;
  mode: AdProviderMode;
  platform: AdPlatform;
  rewardUnits: number;
  consentStatus: UserConsentStatus;
  uiLabel: string;
  errorCode?: AdFailureState;
  reason?: string;
}

export interface VerifyAndGrantParams {
  userId: string;
  rewardToken: string;
  providerRewardId: string;
  providerName?: string;
  providerTransactionId?: string;
  requestId?: string;
  platform?: AdPlatform;
  mode?: AdProviderMode;
  clientRequestedUnits?: number; // Ignored and rejected if manipulated
}

export interface VerifyAndGrantResult {
  success: boolean;
  rewardId?: string;
  status: AdRewardStatus;
  queriesGranted: number;
  newAdRewardRemaining: number;
  isDuplicate?: boolean;
  isExpired?: boolean;
  errorCode?: AdFailureState;
  error?: string;
  message?: string;
}

export class AdService {
  private static instance: AdService | null = null;
  private registry: AdProviderRegistry;

  // Authoritative in-memory registry of rewards
  private rewardsStore: Map<string, AdRewardRecord> = new Map();
  // Indexes for high-speed replay protection & idempotency
  private providerRewardIdIndex: Map<string, string> = new Map(); // providerRewardId -> rewardId
  private tokenIndex: Map<string, string> = new Map(); // rewardToken -> rewardId
  private requestIdIndex: Map<string, string> = new Map(); // requestId -> rewardId

  // Authoritative Audit Trail
  private auditEvents: AdAuditEvent[] = [];

  // V1.9D Emergency Rollback Kill Switch
  private killSwitchActive: boolean = false;

  // Observability metrics
  private metrics: AdObservabilityMetrics = {
    adRequestedCount: 0,
    adStartedCount: 0,
    adCompletedCount: 0,
    verifiedRewardCount: 0,
    rejectedRewardCount: 0,
    duplicateAttemptsCount: 0,
    expiredAttemptsCount: 0,
    providerErrorsCount: 0,
    totalGrantedTextUnits: 0,
    activeProviders: []
  };

  public constructor(customRegistry?: AdProviderRegistry) {
    this.registry = customRegistry || adProviderRegistry;
    this.refreshActiveProvidersList();
  }

  public static getInstance(): AdService {
    if (!AdService.instance) {
      AdService.instance = new AdService();
    }
    return AdService.instance;
  }

  private refreshActiveProvidersList(): void {
    this.metrics.activeProviders = this.registry
      .getAllProviders()
      .filter((p) => p.isConfigured)
      .map((p) => p.providerName);
  }

  /**
   * Records an authoritative audit event.
   * Strips out any private credentials or sensitive secrets.
   */
  public recordAuditEvent(
    eventType: AdAuditEventType,
    userId: string,
    adProvider: string,
    rewardId?: string,
    providerRewardId?: string,
    details?: Record<string, any>
  ): void {
    const event: AdAuditEvent = {
      eventId: `ad_evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      eventType,
      timestamp: new Date().toISOString(),
      userId,
      adProvider,
      rewardId,
      providerRewardId,
      details: details ? { ...details } : undefined
    };

    this.auditEvents.push(event);
    if (this.auditEvents.length > 1000) {
      this.auditEvents.shift();
    }
  }

  /**
   * Generates localized and mode-appropriate UI CTA labels.
   */
  private getUiLabelForMode(mode: AdProviderMode): string {
    switch (mode) {
      case 'MOCK':
        return 'Zawadi ya Jaribio (Mock) (+5)';
      case 'TEST':
        return 'Tangazo la Jaribio (Test Ad) (+5)';
      case 'PRODUCTION':
        return 'Tazama Tangazo (+5)';
      default:
        return 'Pata Maswali +5';
    }
  }

  /**
   * Checks whether a user is currently eligible to view a rewarded ad.
   *
   * Business Rules:
   * 1. Premium users NEVER need ad rewards (they use their governed daily quota).
   * 2. Free users must have exhausted their free text quota (freeRemaining <= 0).
   * 3. An ad provider must be configured and available.
   * 4. User consent must not be DENIED or required and unresolved.
   * 5. If PRODUCTION mode, Production Safety Gate must pass.
   */
  public checkEligibility(userId: string, platformParam?: AdPlatform): AdEligibilityResult {
    this.refreshActiveProvidersList();
    const entitlementStatus = getUserEntitlementStatus(userId);
    const hasConfiguredProvider = this.registry.hasConfiguredProvider();
    const activeProvider = this.registry.getActiveProvider();
    const currentMode = this.registry.getActiveMode();
    const currentPlatform = platformParam || this.registry.getActivePlatform();
    const consentStatus = adComplianceService.getUserConsent(userId);
    const uiLabel = this.getUiLabelForMode(currentMode);

    this.recordAuditEvent('AD_REWARD_ELIGIBILITY_CHECKED', userId, activeProvider?.providerName || 'NONE', undefined, undefined, {
      currentMode,
      currentPlatform,
      consentStatus
    });

    // 0. Emergency Rollback Kill Switch Check
    if (this.killSwitchActive) {
      return {
        eligible: false,
        canUseAdReward: false,
        providerAvailable: false,
        activeProviderName: activeProvider?.providerName || null,
        adType: 'REWARDED_AD',
        mode: currentMode,
        platform: currentPlatform,
        rewardUnits: REWARD_UNITS_PER_AD,
        consentStatus,
        uiLabel,
        remainingTextQueries: entitlementStatus.remainingTextQueries,
        errorCode: 'REWARDED_AD_UNAVAILABLE',
        reason: 'Matangazo yamesitishwa kwa muda.'
      };
    }

    // 1. Provider availability check
    if (!hasConfiguredProvider || !activeProvider) {
      return {
        eligible: false,
        canUseAdReward: false,
        providerAvailable: false,
        activeProviderName: null,
        adType: 'REWARDED_AD',
        mode: currentMode,
        platform: currentPlatform,
        rewardUnits: REWARD_UNITS_PER_AD,
        consentStatus,
        uiLabel,
        remainingTextQueries: entitlementStatus.remainingTextQueries,
        errorCode: 'REWARDED_AD_UNAVAILABLE',
        reason: 'REWARDED_AD_UNAVAILABLE'
      };
    }

    // 2. Provider basic configuration check
    if (!activeProvider.isConfigured) {
      return {
        eligible: false,
        canUseAdReward: false,
        providerAvailable: false,
        activeProviderName: activeProvider.providerName,
        adType: 'REWARDED_AD',
        mode: currentMode,
        platform: currentPlatform,
        rewardUnits: REWARD_UNITS_PER_AD,
        consentStatus,
        uiLabel,
        remainingTextQueries: entitlementStatus.remainingTextQueries,
        errorCode: 'AD_PROVIDER_NOT_CONFIGURED',
        reason: 'AD_PROVIDER_NOT_CONFIGURED: Mtoa tangazo hajawezeshwa.'
      };
    }

    // 3. Platform separation check
    const isPlatformCompatible = typeof activeProvider.supportsPlatform === 'function'
      ? activeProvider.supportsPlatform(currentPlatform)
      : true;

    if (!isPlatformCompatible) {
      return {
        eligible: false,
        canUseAdReward: false,
        providerAvailable: false,
        activeProviderName: activeProvider.providerName,
        adType: 'REWARDED_AD',
        mode: currentMode,
        platform: currentPlatform,
        rewardUnits: REWARD_UNITS_PER_AD,
        consentStatus,
        uiLabel,
        remainingTextQueries: entitlementStatus.remainingTextQueries,
        errorCode: 'AD_PLATFORM_MISMATCH',
        reason: `AD_PLATFORM_MISMATCH: Mtoa tangazo wa ${activeProvider.providerName} hawezi kutumika moja kwa moja kwenye jukwaa la ${currentPlatform}.`
      };
    }

    // 4. Premium users are NOT eligible for ad rewards (boundary preservation)
    if (entitlementStatus.entitlementTier === 'PREMIUM' && entitlementStatus.entitlement.status === 'ACTIVE') {
      return {
        eligible: false,
        canUseAdReward: false,
        providerAvailable: hasConfiguredProvider,
        activeProviderName: activeProvider?.providerName || null,
        adType: 'REWARDED_AD',
        mode: currentMode,
        platform: currentPlatform,
        rewardUnits: REWARD_UNITS_PER_AD,
        consentStatus,
        uiLabel,
        remainingTextQueries: entitlementStatus.remainingTextQueries,
        reason: 'Watumiaji wa Premium wana ukomo mkubwa wa kila siku na hawahitaji matangazo.'
      };
    }

    // 5. Free users who still have remaining text queries (initial free or active rewarded queries)
    if (entitlementStatus.remainingTextQueries > 0) {
      return {
        eligible: false,
        canUseAdReward: false,
        providerAvailable: hasConfiguredProvider,
        activeProviderName: activeProvider?.providerName || null,
        adType: 'REWARDED_AD',
        mode: currentMode,
        platform: currentPlatform,
        rewardUnits: REWARD_UNITS_PER_AD,
        consentStatus,
        uiLabel,
        remainingTextQueries: entitlementStatus.remainingTextQueries,
        reason: 'Bado una maswali ya kutosha. Tangazo litapatikana utakapomaliza maswali yako ya sasa.'
      };
    }

    // 6. User Consent Check
    if (consentStatus === 'DENIED') {
      return {
        eligible: false,
        canUseAdReward: false,
        providerAvailable: true,
        activeProviderName: activeProvider.providerName,
        adType: 'REWARDED_AD',
        mode: currentMode,
        platform: currentPlatform,
        rewardUnits: REWARD_UNITS_PER_AD,
        consentStatus,
        uiLabel,
        remainingTextQueries: entitlementStatus.remainingTextQueries,
        errorCode: 'AD_CONSENT_REQUIRED',
        reason: 'AD_CONSENT_REQUIRED: Mtumiaji amekataa idhini ya matangazo.'
      };
    }
    if (consentStatus === 'REQUIRED') {
      return {
        eligible: false,
        canUseAdReward: false,
        providerAvailable: true,
        activeProviderName: activeProvider.providerName,
        adType: 'REWARDED_AD',
        mode: currentMode,
        platform: currentPlatform,
        rewardUnits: REWARD_UNITS_PER_AD,
        consentStatus,
        uiLabel,
        remainingTextQueries: entitlementStatus.remainingTextQueries,
        errorCode: 'AD_CONSENT_REQUIRED',
        reason: 'AD_CONSENT_REQUIRED: Idhini ya mtumiaji inahitajika kabla ya kuonyesha tangazo.'
      };
    }

    // 7. PRODUCTION Mode Safety Gate & Controlled Launch Check
    if (currentMode === 'PRODUCTION') {
      adProductionLaunchService.checkAndApplyAutoSafetyPause('eligibility_check');

      if (adProductionLaunchService.isProductionPaused()) {
        const pauseReason = adProductionLaunchService.getPauseReason();
        this.recordAuditEvent('AD_PRODUCTION_BLOCKED', userId, activeProvider.providerName, undefined, undefined, {
          reason: `Production paused: ${pauseReason}`,
          errorCode: 'AD_PRODUCTION_PAUSED'
        });
        return {
          eligible: false,
          canUseAdReward: false,
          providerAvailable: false,
          activeProviderName: activeProvider.providerName,
          adType: 'REWARDED_AD',
          mode: currentMode,
          platform: currentPlatform,
          rewardUnits: REWARD_UNITS_PER_AD,
          consentStatus,
          uiLabel,
          remainingTextQueries: entitlementStatus.remainingTextQueries,
          errorCode: 'AD_PRODUCTION_PAUSED',
          reason: 'AD_PRODUCTION_PAUSED: Matangazo ya uzalishaji yamesitishwa kwa muda.'
        };
      }

      if (!this.registry.isProductionEnabled() || !adProductionLaunchService.isProductionActivated()) {
        this.recordAuditEvent('AD_PRODUCTION_BLOCKED', userId, activeProvider.providerName, undefined, undefined, {
          reason: 'Production disabled by administrator',
          errorCode: 'AD_PRODUCTION_DISABLED'
        });
        return {
          eligible: false,
          canUseAdReward: false,
          providerAvailable: false,
          activeProviderName: activeProvider.providerName,
          adType: 'REWARDED_AD',
          mode: currentMode,
          platform: currentPlatform,
          rewardUnits: REWARD_UNITS_PER_AD,
          consentStatus,
          uiLabel,
          remainingTextQueries: entitlementStatus.remainingTextQueries,
          errorCode: 'AD_PRODUCTION_DISABLED',
          reason: 'AD_PRODUCTION_DISABLED: Matangazo halisi hayajawezeshwa na msimamizi.'
        };
      }

      const hasProdUnit = typeof (activeProvider as any).hasProductionAdUnit === 'function'
        ? (activeProvider as any).hasProductionAdUnit(currentPlatform)
        : true;

      const safetyGate = adComplianceService.evaluateProductionSafetyGate({
        providerConfigured: activeProvider.isConfigured,
        providerIntegrationAvailable: true,
        platform: currentPlatform,
        platformConfigured: true,
        platformCompatible: isPlatformCompatible,
        productionAdUnitConfigured: hasProdUnit,
        productionEnabledByAdmin: this.registry.isProductionEnabled(),
        isProductionEnv: process.env.NODE_ENV === 'production',
        consentStatus
      });

      if (!safetyGate.eligible) {
        this.recordAuditEvent('AD_PRODUCTION_BLOCKED', userId, activeProvider.providerName, undefined, undefined, {
          reason: safetyGate.reason,
          errorCode: safetyGate.errorCode,
          failingConditions: safetyGate.failingConditions
        });
        return {
          eligible: false,
          canUseAdReward: false,
          providerAvailable: false,
          activeProviderName: activeProvider.providerName,
          adType: 'REWARDED_AD',
          mode: currentMode,
          platform: currentPlatform,
          rewardUnits: REWARD_UNITS_PER_AD,
          consentStatus,
          uiLabel,
          remainingTextQueries: entitlementStatus.remainingTextQueries,
          errorCode: safetyGate.errorCode || 'AD_PRODUCTION_NOT_READY',
          reason: safetyGate.reason || 'AD_PRODUCTION_NOT_READY: Mfumo haupo tayari kwa matangazo halisi.'
        };
      }
    }

    // 8. Eligible: Free user with exhausted free quota and passing provider checks
    adOperationsAnalyticsService.recordEvent({
      userId,
      adSessionId: `offered_${Date.now()}`,
      eventType: 'AD_OFFERED',
      provider: activeProvider.providerName,
      platform: currentPlatform,
      mode: currentMode,
      success: true
    });

    return {
      eligible: true,
      canUseAdReward: true,
      providerAvailable: true,
      activeProviderName: activeProvider.providerName,
      adType: 'REWARDED_AD',
      mode: currentMode,
      platform: currentPlatform,
      rewardUnits: REWARD_UNITS_PER_AD,
      consentStatus,
      uiLabel,
      remainingTextQueries: entitlementStatus.remainingTextQueries
    };
  }

  /**
   * Starts a rewarded ad session through the active provider.
   * Creates a server-authoritative PENDING reward record.
   */
  public async startRewardedAd(
    userId: string,
    requestId?: string,
    providerName?: string,
    platformParam?: AdPlatform
  ): Promise<{
    success: boolean;
    state?: string;
    rewardId?: string;
    providerSessionId?: string;
    providerRewardId?: string;
    rewardToken?: string;
    adProvider?: string;
    adType: AdType;
    mode?: AdProviderMode;
    platform?: AdPlatform;
    adUnitId?: string;
    errorCode?: AdFailureState;
    message?: string;
    error?: string;
    diagnostic?: {
      provider: 'GAM_WEB' | 'MOCK' | string;
      environment: 'TEST' | 'PRODUCTION' | string;
      mode: 'REAL_PROVIDER' | 'SIMULATION' | string;
      adUnitPath: string;
      mock: boolean;
      status?: string;
    };
  }> {
    this.metrics.adRequestedCount++;
    const currentMode = this.registry.getActiveMode();
    const currentPlatform = platformParam || this.registry.getActivePlatform();

    this.recordAuditEvent('AD_REWARD_REQUESTED', userId, providerName || this.registry.getActiveProviderName(), undefined, undefined, {
      requestId,
      mode: currentMode,
      platform: currentPlatform
    });

    // 0. Emergency Rollback Kill Switch Check
    if (this.killSwitchActive) {
      adOperationsAnalyticsService.recordEvent({
        userId,
        adSessionId: requestId || 'kill_switch_blocked',
        eventType: 'AD_KILL_SWITCH_BLOCKED',
        provider: providerName || this.registry.getActiveProviderName(),
        platform: currentPlatform,
        mode: currentMode,
        success: false,
        failureCode: 'AD_KILL_SWITCH_ACTIVE',
        metadata: { reason: 'Kill switch active' }
      });
      return {
        success: false,
        state: 'REWARDED_AD_UNAVAILABLE',
        adType: 'REWARDED_AD',
        mode: currentMode,
        platform: currentPlatform,
        errorCode: 'REWARDED_AD_UNAVAILABLE',
        message: 'Matangazo yamesitishwa kwa muda.',
        error: 'AD_KILL_SWITCH_ACTIVE'
      };
    }

    // 0b. Abuse Guard & Burst Rate Limiting Check
    const abuseCheck = adOperationsAnalyticsService.checkAbuseGuard(userId);
    if (!abuseCheck.allowed) {
      return {
        success: false,
        state: abuseCheck.errorCode || 'AD_ABUSE_THROTTLED',
        adType: 'REWARDED_AD',
        mode: currentMode,
        platform: currentPlatform,
        errorCode: 'NOT_ELIGIBLE',
        message: abuseCheck.reason || 'Tafadhali subiri kabla ya kuanzisha tangazo lingine.',
        error: abuseCheck.errorCode || 'AD_ABUSE_THROTTLED'
      };
    }

    // 0c. Production Mode Pause & Safety Check
    if (currentMode === 'PRODUCTION') {
      adProductionLaunchService.checkAndApplyAutoSafetyPause('start_rewarded_ad');
      if (adProductionLaunchService.isProductionPaused()) {
        return {
          success: false,
          state: 'AD_PRODUCTION_PAUSED',
          adType: 'REWARDED_AD',
          mode: currentMode,
          platform: currentPlatform,
          errorCode: 'AD_PRODUCTION_PAUSED',
          message: 'Matangazo halisi ya uzalishaji yamesitishwa kwa muda.',
          error: 'AD_PRODUCTION_PAUSED'
        };
      }
    }

    // Check user eligibility
    const eligibility = this.checkEligibility(userId);
    if (!eligibility.providerAvailable) {
      const code = eligibility.errorCode || 'AD_PROVIDER_UNAVAILABLE';
      this.recordAuditEvent('AD_PROVIDER_ERROR', userId, 'NONE', undefined, undefined, {
        reason: code
      });
      return {
        success: false,
        state: code,
        adType: 'REWARDED_AD',
        mode: currentMode,
        platform: currentPlatform,
        errorCode: code,
        message: eligibility.reason || 'Huduma ya matangazo ya zawadi haipatikani kwa sasa.',
        error: code
      };
    }

    if (!eligibility.eligible) {
      const code = eligibility.errorCode || 'NOT_ELIGIBLE';
      return {
        success: false,
        state: 'NOT_ELIGIBLE',
        adType: 'REWARDED_AD',
        mode: currentMode,
        platform: currentPlatform,
        errorCode: eligibility.errorCode || 'NOT_ELIGIBLE',
        message: eligibility.reason || 'Huna sifa ya kuangalia tangazo la zawadi kwa sasa.',
        error: code
      };
    }

    const provider = this.registry.getProvider(providerName);
    if (!provider || !provider.isConfigured) {
      this.metrics.providerErrorsCount++;
      return {
        success: false,
        state: 'AD_PROVIDER_NOT_CONFIGURED',
        adType: 'REWARDED_AD',
        mode: currentMode,
        platform: currentPlatform,
        errorCode: 'AD_PROVIDER_NOT_CONFIGURED',
        message: 'Mtoa tangazo hajawezeshwa (Provider not configured).',
        error: 'AD_PROVIDER_NOT_CONFIGURED'
      };
    }

    try {
      const startResult: StartRewardedAdResult = await provider.startRewardedAd({
        userId,
        requestId,
        mode: currentMode,
        platform: currentPlatform,
        consentStatus: eligibility.consentStatus
      });

      if (!startResult.success) {
        this.metrics.providerErrorsCount++;
        const errCode = startResult.errorCode || 'AD_PROVIDER_ERROR';
        this.recordAuditEvent('AD_PROVIDER_ERROR', userId, provider.providerName, undefined, undefined, {
          error: startResult.errorMessage,
          errorCode: errCode
        });
        adOperationsAnalyticsService.recordEvent({
          userId,
          adSessionId: requestId || 'start_failed',
          eventType: 'AD_PROVIDER_ERROR',
          provider: provider.providerName,
          platform: currentPlatform,
          mode: currentMode,
          success: false,
          failureCode: errCode,
          metadata: { error: startResult.errorMessage || 'Failed to start ad' }
        });
        return {
          success: false,
          state: errCode,
          adType: 'REWARDED_AD',
          mode: currentMode,
          platform: currentPlatform,
          errorCode: errCode,
          error: startResult.errorMessage || 'Imeshindikana kuanzisha tangazo.',
          message: startResult.errorMessage || 'Imeshindikana kuanzisha tangazo.',
          diagnostic: startResult.diagnostic
        };
      }

      this.metrics.adStartedCount++;
      const now = Date.now();
      const rewardId = `rew_${now}_${Math.random().toString(36).substring(2, 7)}`;
      const expiresAt = new Date(now + REWARD_EXPIRY_MS).toISOString();

      // Create authoritative PENDING record
      const record: AdRewardRecord = {
        rewardId,
        userId,
        adProvider: provider.providerName,
        adType: 'REWARDED_AD',
        providerRewardId: startResult.providerRewardId,
        providerTransactionId: startResult.providerSessionId,
        rewardUnits: REWARD_UNITS_PER_AD, // Strictly 5
        status: 'PENDING',
        createdAt: new Date(now).toISOString(),
        expiresAt,
        requestId,
        metadata: {
          mockMode: Boolean(startResult.mockMode),
          mode: currentMode,
          platform: currentPlatform
        }
      };

      this.rewardsStore.set(rewardId, record);
      if (startResult.providerRewardId) {
        this.providerRewardIdIndex.set(startResult.providerRewardId, rewardId);
      }
      if (startResult.rewardToken) {
        this.tokenIndex.set(startResult.rewardToken, rewardId);
      }
      if (requestId) {
        this.requestIdIndex.set(requestId, rewardId);
      }

      this.recordAuditEvent('AD_REWARD_STARTED', userId, provider.providerName, rewardId, startResult.providerRewardId, {
        providerSessionId: startResult.providerSessionId,
        mode: currentMode,
        platform: currentPlatform
      });

      adOperationsAnalyticsService.recordEvent({
        userId,
        adSessionId: startResult.providerSessionId || rewardId,
        rewardReference: rewardId,
        requestId,
        eventType: 'AD_SESSION_CREATED',
        provider: provider.providerName,
        platform: currentPlatform,
        mode: currentMode,
        success: true
      });

      adOperationsAnalyticsService.recordEvent({
        userId,
        adSessionId: startResult.providerSessionId || rewardId,
        rewardReference: rewardId,
        requestId,
        eventType: 'AD_STARTED',
        provider: provider.providerName,
        platform: currentPlatform,
        mode: currentMode,
        success: true
      });

      return {
        success: true,
        rewardId,
        providerSessionId: startResult.providerSessionId,
        providerRewardId: startResult.providerRewardId,
        rewardToken: startResult.rewardToken,
        adProvider: provider.providerName,
        adType: 'REWARDED_AD',
        mode: currentMode,
        platform: currentPlatform,
        adUnitId: startResult.adUnitId,
        diagnostic: startResult.diagnostic
      };
    } catch (err: any) {
      this.metrics.providerErrorsCount++;
      this.recordAuditEvent('AD_PROVIDER_ERROR', userId, provider.providerName, undefined, undefined, {
        exception: err.message
      });
      return {
        success: false,
        state: 'AD_PROVIDER_ERROR',
        adType: 'REWARDED_AD',
        mode: currentMode,
        platform: currentPlatform,
        errorCode: 'AD_PROVIDER_ERROR',
        error: err.message || 'Hitilafu wakati wa kuwasiliana na mtoa tangazo.'
      };
    }
  }

  /**
   * Server-Authoritative Verification and Grant.
   *
   * Verifies proof/token from provider, guards against replays, verifies user isolation,
   * and authoritatively grants +5 text queries into the single source-of-truth usage store.
   *
   * Client-supplied `rewardUnits` is strictly ignored and rejected if tampering detected.
   */
  public async verifyAndGrantReward(params: VerifyAndGrantParams): Promise<VerifyAndGrantResult> {
    const { userId, rewardToken, providerRewardId, providerName, requestId, platform, mode, clientRequestedUnits } = params;

    const currentMode = mode || this.registry.getActiveMode();
    const currentPlatform = platform || this.registry.getActivePlatform();

    this.recordAuditEvent('AD_REWARD_VERIFICATION_STARTED', userId, providerName || 'DEFAULT', undefined, providerRewardId, {
      requestId,
      mode: currentMode,
      platform: currentPlatform
    });

    // 0. Emergency Rollback Kill Switch Check
    if (this.killSwitchActive) {
      return {
        success: false,
        status: 'REJECTED',
        errorCode: 'AD_PROVIDER_UNAVAILABLE',
        queriesGranted: 0,
        newAdRewardRemaining: 0,
        error: 'Matangazo yamesitishwa kwa muda.'
      };
    }

    // 1. Basic payload validation
    if (!userId || !rewardToken || !providerRewardId) {
      this.metrics.rejectedRewardCount++;
      this.recordAuditEvent('AD_REWARD_REJECTED', userId, providerName || 'UNKNOWN', undefined, providerRewardId, {
        reason: 'MISSING_REQUIRED_FIELDS'
      });
      return {
        success: false,
        status: 'REJECTED',
        errorCode: 'AD_REWARD_VERIFICATION_FAILED',
        queriesGranted: 0,
        newAdRewardRemaining: 0,
        error: 'Taarifa za uthibitisho hazijakamilika (Missing proof fields).'
      };
    }

    // 2. Reject tampering if client attempted to request custom units
    if (clientRequestedUnits !== undefined && clientRequestedUnits !== REWARD_UNITS_PER_AD) {
      this.metrics.rejectedRewardCount++;
      this.recordAuditEvent('AD_REWARD_REJECTED', userId, providerName || 'SECURITY', undefined, providerRewardId, {
        reason: 'TAMPERED_REWARD_UNITS',
        attemptedUnits: clientRequestedUnits
      });
      return {
        success: false,
        status: 'REJECTED',
        errorCode: 'AD_REWARD_VERIFICATION_FAILED',
        queriesGranted: 0,
        newAdRewardRemaining: 0,
        error: 'Idadi ya zawadi inadhibitiwa na seva pekee (Server-governed reward units).'
      };
    }

    // 3. Replay Protection: Check if this providerRewardId or token has ALREADY been verified
    const existingRewardId = this.providerRewardIdIndex.get(providerRewardId) || this.tokenIndex.get(rewardToken);
    let record: AdRewardRecord | undefined;
    if (existingRewardId) {
      record = this.rewardsStore.get(existingRewardId);
    }

    if (record && (record.status === 'VERIFIED' || record.status === 'CONSUMED')) {
      this.metrics.duplicateAttemptsCount++;
      this.recordAuditEvent('AD_REWARD_DUPLICATE', userId, record.adProvider, record.rewardId, providerRewardId, {
        previouslyVerifiedAt: record.verifiedAt
      });
      adOperationsAnalyticsService.recordFailedAttempt(userId);
      adOperationsAnalyticsService.recordEvent({
        userId,
        adSessionId: providerRewardId,
        rewardReference: record.rewardId,
        requestId,
        eventType: 'AD_REWARD_DUPLICATE',
        provider: record.adProvider,
        platform: currentPlatform,
        mode: currentMode,
        success: false,
        failureCode: 'AD_REWARD_DUPLICATE'
      });
      const currentStatus = getUserEntitlementStatus(userId);
      return {
        success: false,
        rewardId: record.rewardId,
        status: 'REJECTED',
        isDuplicate: true,
        errorCode: 'AD_REWARD_DUPLICATE',
        queriesGranted: 0,
        newAdRewardRemaining: currentStatus.summary.currentAdRewardRemaining,
        error: 'Tangazo hili limekwisha tumika kupata zawadi (Duplicate reward token).'
      };
    }

    // 4. User Isolation: Ensure User A cannot claim User B's reward record
    if (record && record.userId !== userId) {
      this.metrics.rejectedRewardCount++;
      this.recordAuditEvent('AD_REWARD_REJECTED', userId, record.adProvider, record.rewardId, providerRewardId, {
        reason: 'CROSS_USER_ATTEMPT',
        recordOwnerId: record.userId
      });
      adOperationsAnalyticsService.recordFailedAttempt(userId);
      adOperationsAnalyticsService.recordEvent({
        userId,
        adSessionId: providerRewardId,
        rewardReference: record.rewardId,
        requestId,
        eventType: 'AD_USER_MISMATCH',
        provider: record.adProvider,
        platform: currentPlatform,
        mode: currentMode,
        success: false,
        failureCode: 'USER_MISMATCH'
      });
      return {
        success: false,
        status: 'REJECTED',
        errorCode: 'AD_REWARD_VERIFICATION_FAILED',
        queriesGranted: 0,
        newAdRewardRemaining: 0,
        error: 'Huna ruhusa ya kutumia zawadi hii (User mismatch).'
      };
    }

    // 5. Expiry Check
    if (record && new Date(record.expiresAt).getTime() < Date.now()) {
      record.status = 'EXPIRED';
      this.metrics.expiredAttemptsCount++;
      this.recordAuditEvent('AD_REWARD_EXPIRED', userId, record.adProvider, record.rewardId, providerRewardId, {
        expiresAt: record.expiresAt
      });
      adOperationsAnalyticsService.recordFailedAttempt(userId);
      adOperationsAnalyticsService.recordEvent({
        userId,
        adSessionId: providerRewardId,
        rewardReference: record.rewardId,
        requestId,
        eventType: 'AD_SESSION_EXPIRED',
        provider: record.adProvider,
        platform: currentPlatform,
        mode: currentMode,
        success: false,
        failureCode: 'AD_REWARD_EXPIRED'
      });
      return {
        success: false,
        rewardId: record.rewardId,
        status: 'EXPIRED',
        isExpired: true,
        errorCode: 'AD_REWARD_EXPIRED',
        queriesGranted: 0,
        newAdRewardRemaining: 0,
        error: 'Muda wa kuthibitisha zawadi hii umekwisha (Expired).'
      };
    }

    // 6. Provider Verification
    const resolvedProviderName = providerName || record?.adProvider || this.registry.getActiveProviderName();
    const provider = this.registry.getProvider(resolvedProviderName);
    if (!provider) {
      this.metrics.providerErrorsCount++;
      return {
        success: false,
        status: 'REJECTED',
        errorCode: 'AD_PROVIDER_NOT_CONFIGURED',
        queriesGranted: 0,
        newAdRewardRemaining: 0,
        error: `Mtoa tangazo hajapatikana: ${resolvedProviderName}`
      };
    }

    const verificationResult = await provider.verifyReward({
      userId,
      rewardToken,
      providerRewardId,
      providerTransactionId: record?.providerTransactionId,
      requestId,
      mode: currentMode,
      platform: currentPlatform
    });

    if (!verificationResult.isValid) {
      if (verificationResult.isExpired) {
        if (record) record.status = 'EXPIRED';
        this.metrics.expiredAttemptsCount++;
        this.recordAuditEvent('AD_REWARD_EXPIRED', userId, provider.providerName, record?.rewardId, providerRewardId, {
          reason: verificationResult.errorMessage
        });
        adOperationsAnalyticsService.recordFailedAttempt(userId);
        adOperationsAnalyticsService.recordEvent({
          userId,
          adSessionId: providerRewardId,
          rewardReference: record?.rewardId,
          requestId,
          eventType: 'AD_SESSION_EXPIRED',
          provider: provider.providerName,
          platform: currentPlatform,
          mode: currentMode,
          success: false,
          failureCode: 'AD_REWARD_EXPIRED'
        });
        return {
          success: false,
          status: 'EXPIRED',
          isExpired: true,
          errorCode: 'AD_REWARD_EXPIRED',
          queriesGranted: 0,
          newAdRewardRemaining: 0,
          error: verificationResult.errorMessage || 'Muda wa zawadi umekwisha.'
        };
      }

      if (record) {
        record.status = 'REJECTED';
        record.rejectionReason = verificationResult.errorMessage;
      }
      this.metrics.rejectedRewardCount++;
      const errCode = verificationResult.errorCode || 'AD_REWARD_VERIFICATION_FAILED';
      this.recordAuditEvent('AD_REWARD_REJECTED', userId, provider.providerName, record?.rewardId, providerRewardId, {
        reason: verificationResult.errorMessage,
        errorCode: errCode
      });
      adOperationsAnalyticsService.recordFailedAttempt(userId);
      adOperationsAnalyticsService.recordEvent({
        userId,
        adSessionId: providerRewardId,
        rewardReference: record?.rewardId,
        requestId,
        eventType: 'AD_REWARD_REJECTED',
        provider: provider.providerName,
        platform: currentPlatform,
        mode: currentMode,
        success: false,
        failureCode: errCode,
        metadata: { reason: verificationResult.errorMessage || 'Verification rejected' }
      });
      return {
        success: false,
        status: 'REJECTED',
        errorCode: errCode,
        queriesGranted: 0,
        newAdRewardRemaining: 0,
        error: verificationResult.errorMessage || 'Tangazo limekamilika, lakini hatukuweza kuthibitisha zawadi. Jaribu tena.'
      };
    }

    // 7. Success! Grant strictly +5 to Free text AI allowance in single source-of-truth usage store
    const now = new Date().toISOString();
    const finalRewardId = record?.rewardId || `rew_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const grantedResult = await grantAuthoritativeAdRewardAllowance(
      userId,
      REWARD_UNITS_PER_AD,
      `Rewarded Ad verified via ${provider.providerName}`
    );

    if (!grantedResult.success) {
      this.metrics.providerErrorsCount++;
      return {
        success: false,
        status: 'REJECTED',
        errorCode: 'AD_PROVIDER_ERROR',
        queriesGranted: 0,
        newAdRewardRemaining: 0,
        error: grantedResult.error || 'Haikuweza kuongeza zawadi kwenye akaunti yako.'
      };
    }

    // 8. Update authoritative reward record
    if (record) {
      record.status = 'VERIFIED';
      record.verifiedAt = now;
      record.rewardUnits = REWARD_UNITS_PER_AD;
    } else {
      const newRecord: AdRewardRecord = {
        rewardId: finalRewardId,
        userId,
        adProvider: provider.providerName,
        adType: 'REWARDED_AD',
        providerRewardId,
        providerTransactionId: verificationResult.providerTransactionId,
        rewardUnits: REWARD_UNITS_PER_AD,
        status: 'VERIFIED',
        verifiedAt: now,
        createdAt: now,
        expiresAt: new Date(Date.now() + REWARD_EXPIRY_MS).toISOString(),
        requestId
      };
      this.rewardsStore.set(finalRewardId, newRecord);
      this.providerRewardIdIndex.set(providerRewardId, finalRewardId);
      this.tokenIndex.set(rewardToken, finalRewardId);
      if (requestId) this.requestIdIndex.set(requestId, finalRewardId);
    }

    // 9. Update metrics & audit log
    this.metrics.adCompletedCount++;
    this.metrics.verifiedRewardCount++;
    this.metrics.totalGrantedTextUnits += REWARD_UNITS_PER_AD;

    this.recordAuditEvent('AD_REWARD_VERIFIED', userId, provider.providerName, finalRewardId, providerRewardId, {
      unitsGranted: REWARD_UNITS_PER_AD,
      newAdRewardRemaining: grantedResult.newAdRewardRemaining
    });

    this.recordAuditEvent('FREE_QUOTA_REWARDED', userId, provider.providerName, finalRewardId, providerRewardId, {
      unitsAdded: REWARD_UNITS_PER_AD
    });

    this.recordAuditEvent('AD_REWARD_GRANTED', userId, provider.providerName, finalRewardId, providerRewardId, {
      unitsGranted: REWARD_UNITS_PER_AD,
      newAdRewardRemaining: grantedResult.newAdRewardRemaining
    });

    adOperationsAnalyticsService.recordEvent({
      userId,
      adSessionId: providerRewardId,
      rewardReference: finalRewardId,
      requestId,
      eventType: 'AD_REWARD_GRANTED',
      provider: provider.providerName,
      platform: currentPlatform,
      mode: currentMode,
      success: true,
      metadata: { unitsGranted: REWARD_UNITS_PER_AD }
    });

    return {
      success: true,
      rewardId: finalRewardId,
      status: 'VERIFIED',
      queriesGranted: REWARD_UNITS_PER_AD,
      newAdRewardRemaining: grantedResult.newAdRewardRemaining,
      message: 'Umeongezewa maswali 5 ya AI.'
    };
  }

  /**
   * Safe audit event recording for ad presentation lifecycle events (e.g. AD_PRESENTED, AD_DISMISSED).
   */
  public recordPresentationEvent(
    eventType: 'AD_PRESENTED' | 'AD_COMPLETED' | 'AD_DISMISSED' | 'AD_FAILED',
    userId: string,
    providerRewardId?: string,
    metadata?: Record<string, any>
  ): void {
    const activeProvider = this.registry.getActiveProviderName();
    this.recordAuditEvent(eventType, userId, activeProvider, undefined, providerRewardId, metadata);

    if (eventType === 'AD_COMPLETED') {
      adOperationsAnalyticsService.recordEvent({
        userId,
        adSessionId: providerRewardId || `comp_${Date.now()}`,
        rewardReference: providerRewardId,
        eventType: 'AD_COMPLETED',
        provider: activeProvider,
        success: true
      });
    } else if (eventType === 'AD_DISMISSED') {
      adOperationsAnalyticsService.recordEvent({
        userId,
        adSessionId: providerRewardId || `dism_${Date.now()}`,
        rewardReference: providerRewardId,
        eventType: 'AD_DISMISSED',
        provider: activeProvider,
        success: true
      });
    } else if (eventType === 'AD_FAILED') {
      adOperationsAnalyticsService.recordEvent({
        userId,
        adSessionId: providerRewardId || `fail_${Date.now()}`,
        rewardReference: providerRewardId,
        eventType: 'AD_PROVIDER_ERROR',
        provider: activeProvider,
        success: false,
        failureCode: 'AD_PRESENTATION_FAILED'
      });
    }
  }

  // ============================================================================
  // ADMIN ADVERTISING SETTINGS & READINESS DASHBOARD
  // ============================================================================

  /**
   * Evaluates and returns the complete Admin Advertising Settings state.
   */
  public getAdminSettings(): AdSettingsState {
    const activeProvider = this.registry.getActiveProvider();
    const providerName = this.registry.getActiveProviderName();
    const currentMode = this.registry.getActiveMode();
    const currentPlatform = this.registry.getActivePlatform();
    const isProdEnabled = this.registry.isProductionEnabled();

    // Check safe configs
    let testConfigured = false;
    let prodConfigured = false;
    let productionAdUnitMasked = 'NOT_CONFIGURED';
    let supportedPlatforms: AdPlatform[] = ['ANDROID', 'WEB'];
    let platformCompatible = true;

    if (activeProvider && typeof activeProvider.getSafeConfig === 'function') {
      const safe = activeProvider.getSafeConfig();
      testConfigured = Boolean(safe.hasTestAdUnit || safe.testAdUnitId);
      prodConfigured = Boolean(safe.hasProductionAdUnit || safe.productionAdUnitConfigured);
      productionAdUnitMasked = safe.productionAdUnitMasked || (prodConfigured ? 'ca-app-pub-***' : 'NOT_CONFIGURED');
      supportedPlatforms = safe.supportedPlatforms || activeProvider.supportedPlatforms || ['ANDROID'];
      platformCompatible = typeof activeProvider.supportsPlatform === 'function' ? activeProvider.supportsPlatform(currentPlatform) : true;
    } else {
      testConfigured = true; // Mock is always test-ready
      prodConfigured = false;
      supportedPlatforms = ['WEB', 'ANDROID'];
      platformCompatible = true;
    }

    // Evaluate compliance
    const complianceChecks = adComplianceService.evaluateComplianceChecks({
      providerConfigured: Boolean(activeProvider?.isConfigured),
      testAdConfigured: testConfigured,
      productionAdConfigured: prodConfigured,
      productionEnabled: isProdEnabled,
      platform: currentPlatform
    });

    const requiredChecks = complianceChecks.filter((c) => c.requiredForProduction);
    const complianceReady = requiredChecks.every((c) => c.status === 'READY');

    // Safety gate evaluation with admin flag
    const safetyResult = adComplianceService.evaluateProductionSafetyGate({
      providerConfigured: Boolean(activeProvider?.isConfigured),
      providerIntegrationAvailable: true,
      platform: currentPlatform,
      platformConfigured: true,
      platformCompatible,
      productionAdUnitConfigured: prodConfigured,
      productionEnabledByAdmin: isProdEnabled,
      isProductionEnv: process.env.NODE_ENV === 'production'
    });

    // Technical safety check without requiring admin switch to evaluate readiness
    const technicalSafetyResult = adComplianceService.evaluateProductionSafetyGate({
      providerConfigured: Boolean(activeProvider?.isConfigured),
      providerIntegrationAvailable: true,
      platform: currentPlatform,
      platformConfigured: true,
      platformCompatible,
      productionAdUnitConfigured: prodConfigured,
      productionEnabledByAdmin: true,
      isProductionEnv: process.env.NODE_ENV === 'production'
    });

    const isReadyForProd = safetyResult.eligible;
    const isTechnicallyProdReady = technicalSafetyResult.eligible;

    // V1.9C: 5 Lifecycle Stages:
    // IMPLEMENTED -> CONFIGURED -> COMPLIANT -> PRODUCTION_READY -> PRODUCTION_ENABLED
    const isImplemented = Boolean(activeProvider);
    const isConfigured = Boolean(activeProvider?.isConfigured) && (currentMode === 'TEST' ? testConfigured : currentMode === 'PRODUCTION' ? prodConfigured : true);
    const isCompliant = complianceReady;
    const isProductionReady = isTechnicallyProdReady && isCompliant && platformCompatible;
    const isProductionEnabled = isProdEnabled && isProductionReady;

    let lifecycleStage: AdReadinessLifecycleStage = 'IMPLEMENTED';
    if (isProductionEnabled) {
      lifecycleStage = 'PRODUCTION_ENABLED';
    } else if (isProductionReady) {
      lifecycleStage = 'PRODUCTION_READY';
    } else if (isCompliant) {
      lifecycleStage = 'COMPLIANT';
    } else if (isConfigured) {
      lifecycleStage = 'CONFIGURED';
    } else {
      lifecycleStage = 'IMPLEMENTED';
    }

    const lifecycleBreakdown = {
      implemented: isImplemented,
      configured: isConfigured,
      compliant: isCompliant,
      productionReady: isProductionReady,
      productionEnabled: isProductionEnabled,
      isImplemented,
      isConfigured,
      isCompliant,
      isProductionReady,
      isProductionEnabled
    };

    return {
      providerName,
      platform: currentPlatform,
      mode: currentMode,
      productionEnabled: isProdEnabled,
      rewardType: 'REWARDED',
      rewardUnits: REWARD_UNITS_PER_AD, // Read-only 5
      testAdConfigured: testConfigured,
      productionAdConfigured: prodConfigured,
      complianceReady,
      providerReady: Boolean(activeProvider?.isConfigured),
      productionSafetyLocked: !isReadyForProd,
      overallReadiness: isReadyForProd ? 'READY_FOR_PRODUCTION' : 'NOT_READY_FOR_PRODUCTION',
      lifecycleStage,
      lifecycleBreakdown,
      platformCompatible,
      supportedPlatforms,
      productionAdUnitMasked,
      failingSafetyGateConditions: safetyResult.failingConditions,
      readinessDisclaimer:
        'Huu ni utayari wa mifumo ya ndani tu. Haidai idhini ya Google wala haihakikishi ukubali wa duka la programu.'
    };
  }

  /**
   * V1.9C — Evaluates readiness and the 5 canonical lifecycle stages.
   */
  public evaluateReadiness(): AdSettingsState {
    return this.getAdminSettings();
  }

  /**
   * Updates Admin Advertising Settings with validation.
   */
  public updateAdminSettings(settings: Partial<AdSettingsState>, adminUserId: string = 'admin'): AdSettingsState {
    const oldMode = this.registry.getActiveMode();
    const oldProvider = this.registry.getActiveProviderName();
    const oldPlatform = this.registry.getActivePlatform();
    const oldProdEnabled = this.registry.isProductionEnabled();

    // 1. Provider
    if (settings.providerName) {
      this.registry.setActiveProvider(settings.providerName);
    }

    // 2. Mode
    if (settings.mode && (settings.mode === 'MOCK' || settings.mode === 'TEST' || settings.mode === 'PRODUCTION')) {
      this.registry.setActiveMode(settings.mode);
      if (settings.mode !== oldMode) {
        this.recordAuditEvent('AD_MODE_CHANGED', adminUserId, this.registry.getActiveProviderName(), undefined, undefined, {
          from: oldMode,
          to: settings.mode
        });
      }
    }

    // 3. Platform
    if (settings.platform && (settings.platform === 'WEB' || settings.platform === 'ANDROID')) {
      if (settings.platform !== oldPlatform) {
        this.recordAuditEvent('AD_PLATFORM_CHANGED', adminUserId, this.registry.getActiveProviderName(), undefined, undefined, {
          from: oldPlatform,
          to: settings.platform
        });
      }
      this.registry.setActivePlatform(settings.platform);
    }

    // 4. Production Enabled
    if (typeof settings.productionEnabled === 'boolean') {
      this.registry.setProductionEnabled(settings.productionEnabled);
      if (settings.productionEnabled && !oldProdEnabled) {
        this.recordAuditEvent('AD_PRODUCTION_ENABLED', adminUserId, this.registry.getActiveProviderName(), undefined, undefined, {
          timestamp: new Date().toISOString()
        });
      } else if (!settings.productionEnabled && oldProdEnabled) {
        this.recordAuditEvent('AD_PRODUCTION_DISABLED', adminUserId, this.registry.getActiveProviderName(), undefined, undefined, {
          timestamp: new Date().toISOString()
        });
      }
    }

    // 5. Update provider internal safe configs if available
    const active = this.registry.getActiveProvider();
    if (active && typeof (active as any).updateConfig === 'function') {
      const providerConfigUpdates: Record<string, any> = {
        mode: this.registry.getActiveMode(),
        platform: this.registry.getActivePlatform(),
        productionEnabled: this.registry.isProductionEnabled()
      };
      if (typeof (settings as any).productionRewardedAdUnitId === 'string') {
        providerConfigUpdates.productionRewardedAdUnitId = (settings as any).productionRewardedAdUnitId;
      }
      if (typeof (settings as any).webRewardedAdUnitId === 'string') {
        providerConfigUpdates.webRewardedAdUnitId = (settings as any).webRewardedAdUnitId;
      }
      (active as any).updateConfig(providerConfigUpdates);
    }

    this.recordAuditEvent('AD_CONFIGURATION_CHANGED', adminUserId, this.registry.getActiveProviderName(), undefined, undefined, {
      providerName: this.registry.getActiveProviderName(),
      mode: this.registry.getActiveMode(),
      platform: this.registry.getActivePlatform(),
      productionEnabled: this.registry.isProductionEnabled()
    });

    return this.getAdminSettings();
  }

  /**
   * Retrieves the reward history for a specific user (strict user isolation).
   */
  public getUserRewardHistory(userId: string): AdRewardRecord[] {
    const list: AdRewardRecord[] = [];
    for (const record of this.rewardsStore.values()) {
      if (record.userId === userId) {
        list.push({ ...record });
      }
    }
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * Admin Observability: Returns aggregated metrics.
   */
  public getObservabilityMetrics(): AdObservabilityMetrics {
    this.refreshActiveProvidersList();
    return { ...this.metrics };
  }

  /**
   * Admin Observability: Returns recent audit events.
   */
  public getRecentAuditEvents(limit: number = 50): AdAuditEvent[] {
    const clamped = Math.max(1, Math.min(limit, 200));
    return this.auditEvents.slice(-clamped).reverse();
  }

  /**
   * Admin Observability: Returns reward records for inspection.
   */
  public getAllRewards(limit: number = 100): AdRewardRecord[] {
    const list = Array.from(this.rewardsStore.values());
    return list
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  /**
   * Helper to configure the mock provider behavior for testing.
   */
  public configureMockProvider(behavior: MockAdBehavior, isConfigured: boolean = true): void {
    const mock = this.registry.getProvider('MOCK_REWARDED_AD') as any;
    if (mock && typeof mock.setBehavior === 'function') {
      mock.setBehavior(behavior, isConfigured);
    }
    this.refreshActiveProvidersList();
  }

  // ============================================================================
  // V1.9D — CONTROLLED LAUNCH & EMERGENCY KILL SWITCH CONTROLS
  // ============================================================================

  /**
   * Returns whether the emergency kill switch is currently active.
   */
  public isKillSwitchActive(): boolean {
    return this.killSwitchActive;
  }

  /**
   * Sets the authoritative emergency kill switch state.
   * When active: blocks all ad sessions, eligibility, and reward grants immediately.
   */
  public setKillSwitch(
    active: boolean,
    adminUserId: string = 'admin'
  ): { success: boolean; killSwitchActive: boolean; message: string } {
    this.killSwitchActive = active;
    this.recordAuditEvent(
      active ? 'AD_PROVIDER_ERROR' : 'AD_REWARD_ELIGIBILITY_CHECKED',
      adminUserId,
      this.registry.getActiveProviderName(),
      undefined,
      undefined,
      {
        action: active ? 'KILL_SWITCH_ENGAGED' : 'KILL_SWITCH_RESTORED',
        updatedBy: adminUserId
      }
    );
    adOperationsAnalyticsService.recordEvent({
      userId: adminUserId,
      adSessionId: `kill_switch_${Date.now()}`,
      eventType: active ? 'AD_KILL_SWITCH_BLOCKED' : 'AD_PROVIDER_UNAVAILABLE',
      success: true,
      metadata: { killSwitchActive: active, actor: adminUserId }
    });
    return {
      success: true,
      killSwitchActive: this.killSwitchActive,
      message: active
        ? 'Swichi ya dharura imewashwa (Kill switch ACTIVE): Matangazo yote yamesitishwa kwa muda.'
        : 'Swichi ya dharura imezimwa (Kill switch OFF): Mfumo wa matangazo umerejeshwa kawaida.'
    };
  }

  /**
   * V1.9D Controlled Production Launch.
   * Strictly evaluates the V1.9C Production Safety Gate.
   * If gate is not satisfied, the enable attempt is rejected and live advertising remains blocked.
   */
  public enableProduction(adminUserId: string = 'admin'): {
    success: boolean;
    productionEnabled: boolean;
    message: string;
    failingConditions?: string[];
    errorCode?: string;
  } {
    const activeProvider = this.registry.getActiveProvider();
    const currentPlatform = this.registry.getActivePlatform();

    const isPlatformCompatible =
      typeof activeProvider?.supportsPlatform === 'function'
        ? activeProvider.supportsPlatform(currentPlatform)
        : true;

    const hasProdUnit =
      typeof (activeProvider as any)?.hasProductionAdUnit === 'function'
        ? (activeProvider as any).hasProductionAdUnit(currentPlatform)
        : false;

    // Evaluate Production Safety Gate
    const safetyGate = adComplianceService.evaluateProductionSafetyGate({
      providerConfigured: activeProvider?.isConfigured || false,
      providerIntegrationAvailable: Boolean(activeProvider),
      platform: currentPlatform,
      platformConfigured: true,
      platformCompatible: isPlatformCompatible,
      productionAdUnitConfigured: hasProdUnit,
      productionEnabledByAdmin: true,
      isProductionEnv: process.env.NODE_ENV === 'production'
    });

    if (!safetyGate.eligible) {
      this.recordAuditEvent(
        'AD_PRODUCTION_BLOCKED',
        adminUserId,
        activeProvider?.providerName || 'NONE',
        undefined,
        undefined,
        {
          reason: safetyGate.reason,
          failingConditions: safetyGate.failingConditions
        }
      );
      adOperationsAnalyticsService.recordEvent({
        userId: adminUserId,
        adSessionId: `prod_gate_failed_${Date.now()}`,
        eventType: 'AD_PRODUCTION_BLOCKED',
        success: false,
        failureCode: safetyGate.errorCode || 'AD_PRODUCTION_NOT_READY',
        metadata: { failingCount: safetyGate.failingConditions.length }
      });
      return {
        success: false,
        productionEnabled: false,
        message:
          'Haiwezekani kuwasha uzalishaji (Production). Vigezo vya geti la usalama havijakamilika.',
        failingConditions: safetyGate.failingConditions,
        errorCode: safetyGate.errorCode || 'AD_PRODUCTION_NOT_READY'
      };
    }

    // Safety Gate satisfied! Enable production
    this.registry.setProductionEnabled(true);
    this.registry.setActiveMode('PRODUCTION');
    this.recordAuditEvent(
      'AD_MODE_CHANGED',
      adminUserId,
      activeProvider?.providerName || 'NONE',
      undefined,
      undefined,
      {
        productionEnabled: true,
        mode: 'PRODUCTION'
      }
    );
    return {
      success: true,
      productionEnabled: true,
      message: 'Matangazo halisi ya uzalishaji (Production) yamewashwa kikamilifu na msimamizi.'
    };
  }

  /**
   * V1.9D Controlled Production Disable.
   */
  public disableProduction(adminUserId: string = 'admin'): {
    success: boolean;
    productionEnabled: boolean;
    message: string;
  } {
    this.registry.setProductionEnabled(false);
    this.registry.setActiveMode('TEST');
    this.recordAuditEvent(
      'AD_MODE_CHANGED',
      adminUserId,
      this.registry.getActiveProviderName(),
      undefined,
      undefined,
      {
        productionEnabled: false,
        mode: 'TEST'
      }
    );
    return {
      success: true,
      productionEnabled: false,
      message: 'Matangazo halisi ya uzalishaji yamezimwa. Mfumo umerejea kwenye hali ya majaribio (TEST).'
    };
  }

  /**
   * Reset store for automated tests.
   */
  public resetForTesting(): void {
    this.rewardsStore.clear();
    this.providerRewardIdIndex.clear();
    this.tokenIndex.clear();
    this.requestIdIndex.clear();
    this.auditEvents = [];
    this.killSwitchActive = false;
    this.metrics = {
      adRequestedCount: 0,
      adStartedCount: 0,
      adCompletedCount: 0,
      verifiedRewardCount: 0,
      rejectedRewardCount: 0,
      duplicateAttemptsCount: 0,
      expiredAttemptsCount: 0,
      providerErrorsCount: 0,
      totalGrantedTextUnits: 0,
      activeProviders: []
    };
    this.registry.resetForTesting();
    this.refreshActiveProvidersList();
    adComplianceService.resetConsentForTesting();
    adOperationsAnalyticsService.resetForTesting();
  }
}

export const adService = AdService.getInstance();


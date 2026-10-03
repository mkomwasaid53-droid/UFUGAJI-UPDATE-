/**
 * Ufugaji Update — V1.9D Advertising Operations, Analytics & Controlled Launch Service
 *
 * Operational layer responsible for:
 * 1. Server-authoritative structured advertising event logging (AD_SESSION_CREATED, AD_STARTED, etc.)
 * 2. Deterministic funnel metrics (Quota Exhausted -> Ad Offered -> Started -> Completed -> Verified -> +5 Granted)
 * 3. Provider performance & health observability without revealing secrets
 * 4. Server-authoritative time accounting in East Africa Time (EAT / UTC+3)
 * 5. Cost & Revenue boundaries: rewardCount != revenue (strictly no fabricated revenue)
 * 6. Rate & abuse protection: temporary throttling & cooldowns (never permanent ban, never affects Marketplace trust)
 * 7. Privacy & data minimization: strictly non-sensitive, no livestock/veterinary/chat data
 */

import { AdPlatform, AdProviderMode } from './adProviderInterface';
import {
  AdOperationalEvent,
  AdOperationalEventType,
  AdDateRangeOption,
  AdTimeWindow,
  AdRewardFunnelMetrics,
  ProviderPerformanceBreakdown,
  ProviderHealthStatus,
  AdOperationsAdminOverview,
  AdAbuseGuardResult,
  FunnelStepCount
} from '../../types/adOperationsTypes';
import { adProviderRegistry } from './adProviderRegistry';
import { adComplianceService } from './adComplianceService';

const MAX_EVENT_BUFFER = 5000;
const BURST_SESSION_LIMIT = 10; // Max 10 ad sessions per minute per user
const BURST_WINDOW_MS = 60 * 1000;
const FAILED_ATTEMPT_LIMIT = 5; // Max 5 failed attempts in 5 minutes
const FAILED_ATTEMPT_WINDOW_MS = 5 * 60 * 1000;
const ABUSE_COOLDOWN_MS = 5 * 60 * 1000; // 5-minute cooldown on abuse trigger

interface UserAbuseTracker {
  sessionTimestamps: number[];
  failedTimestamps: number[];
  cooldownUntil?: number;
  violationCount: number;
}

export class AdOperationsAnalyticsService {
  private static instance: AdOperationsAnalyticsService;

  // In-memory operational event store (server-authoritative)
  private events: AdOperationalEvent[] = [];

  // Abuse guard state tracking
  private abuseTrackers: Map<string, UserAbuseTracker> = new Map();

  // Diagnostic check timestamp
  private lastDiagnosticCheck: string = new Date().toISOString();

  private constructor() {}

  public static getInstance(): AdOperationsAnalyticsService {
    if (!AdOperationsAnalyticsService.instance) {
      AdOperationsAnalyticsService.instance = new AdOperationsAnalyticsService();
    }
    return AdOperationsAnalyticsService.instance;
  }

  // ==========================================================================
  // 1. TIMEZONE & SERVER-AUTHORITATIVE DATE CALCULATIONS (EAT / UTC+3)
  // ==========================================================================

  /**
   * Returns start and end Date for a given date range option in East Africa Time (UTC+3).
   */
  public getTimeWindow(option: AdDateRangeOption): AdTimeWindow {
    const now = new Date();
    // EAT is UTC+3 (3 * 3600 * 1000 ms)
    const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;
    const nowEat = new Date(now.getTime() + EAT_OFFSET_MS);

    // Get year, month, date in EAT
    const year = nowEat.getUTCFullYear();
    const month = nowEat.getUTCMonth();
    const date = nowEat.getUTCDate();

    // Start of today in UTC corresponding to midnight EAT
    const startOfTodayUtc = new Date(Date.UTC(year, month, date) - EAT_OFFSET_MS);

    let startTimeUtc: Date;
    let endTimeUtc = now;
    let label = 'Leo (Today)';

    switch (option) {
      case 'TODAY':
        startTimeUtc = startOfTodayUtc;
        label = 'Leo (Today - EAT)';
        break;

      case 'YESTERDAY': {
        const startOfYesterdayUtc = new Date(startOfTodayUtc.getTime() - 24 * 60 * 60 * 1000);
        startTimeUtc = startOfYesterdayUtc;
        endTimeUtc = startOfTodayUtc;
        label = 'Jana (Yesterday - EAT)';
        break;
      }

      case 'LAST_7_DAYS': {
        startTimeUtc = new Date(startOfTodayUtc.getTime() - 6 * 24 * 60 * 60 * 1000);
        label = 'Siku 7 Zilizopita (Last 7 Days)';
        break;
      }

      case 'LAST_30_DAYS': {
        startTimeUtc = new Date(startOfTodayUtc.getTime() - 29 * 24 * 60 * 60 * 1000);
        label = 'Siku 30 Zilizopita (Last 30 Days)';
        break;
      }

      case 'ALL':
      default:
        startTimeUtc = new Date(0);
        label = 'Muda Wote (All Time)';
        break;
    }

    return {
      option,
      label,
      startTimeIso: startTimeUtc.toISOString(),
      endTimeIso: endTimeUtc.toISOString(),
      timeZone: 'Africa/Dar_es_Salaam (EAT / UTC+3)'
    };
  }

  // ==========================================================================
  // 2. EVENT RECORDING & SANITIZATION
  // ==========================================================================

  /**
   * Records a server-authoritative operational ad event.
   * Strips all credentials, secrets, raw payloads, or sensitive user data.
   */
  public recordEvent(params: {
    userId: string;
    adSessionId: string;
    eventType: AdOperationalEventType;
    provider?: string;
    platform?: AdPlatform;
    mode?: AdProviderMode;
    rewardReference?: string;
    requestId?: string;
    success?: boolean;
    failureCode?: string;
    metadata?: Record<string, string | number | boolean>;
  }): AdOperationalEvent {
    const now = new Date();
    const activeRegistry = adProviderRegistry;

    // Filter metadata to strictly safe keys
    const sanitizedMetadata: Record<string, string | number | boolean> = {};
    if (params.metadata) {
      for (const [key, val] of Object.entries(params.metadata)) {
        const lowerKey = key.toLowerCase();
        // Disallow secrets, passwords, tokens, full responses, private medical/financial info
        if (
          !lowerKey.includes('secret') &&
          !lowerKey.includes('key') &&
          !lowerKey.includes('token') &&
          !lowerKey.includes('password') &&
          !lowerKey.includes('private') &&
          !lowerKey.includes('bearer') &&
          (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean')
        ) {
          sanitizedMetadata[key] = val;
        }
      }
    }

    const event: AdOperationalEvent = {
      eventId: `ad_op_${now.getTime()}_${Math.random().toString(36).substring(2, 7)}`,
      userId: params.userId,
      adSessionId: params.adSessionId,
      rewardReference: params.rewardReference,
      requestId: params.requestId,
      provider: params.provider || activeRegistry.getActiveProviderName(),
      platform: params.platform || activeRegistry.getActivePlatform(),
      mode: params.mode || activeRegistry.getActiveMode(),
      eventType: params.eventType,
      timestamp: now.toISOString(),
      success: params.success !== undefined ? params.success : !params.failureCode,
      failureCode: params.failureCode,
      environment: process.env.NODE_ENV || 'development',
      appVersion: 'V1.9D',
      metadata: Object.keys(sanitizedMetadata).length > 0 ? sanitizedMetadata : undefined
    };

    this.events.unshift(event); // newest first

    // Prevent unbounded memory growth
    if (this.events.length > MAX_EVENT_BUFFER) {
      this.events.length = MAX_EVENT_BUFFER;
    }

    return event;
  }

  /**
   * Retrieves recent events with optional limit and filter.
   */
  public getRecentEvents(options?: {
    limit?: number;
    userId?: string;
    eventType?: AdOperationalEventType;
    provider?: string;
  }): AdOperationalEvent[] {
    let result = this.events;

    if (options?.userId) {
      result = result.filter((e) => e.userId === options.userId);
    }
    if (options?.eventType) {
      result = result.filter((e) => e.eventType === options.eventType);
    }
    if (options?.provider) {
      result = result.filter((e) => e.provider.toUpperCase() === options.provider!.toUpperCase());
    }

    const limit = options?.limit || 50;
    return result.slice(0, limit);
  }

  // ==========================================================================
  // 3. REWARD FUNNEL METRICS CALCULATION
  // ==========================================================================

  public getFunnelMetrics(dateOption: AdDateRangeOption = 'TODAY'): AdRewardFunnelMetrics {
    const timeWindow = this.getTimeWindow(dateOption);
    const startMs = new Date(timeWindow.startTimeIso).getTime();
    const endMs = new Date(timeWindow.endTimeIso).getTime();

    // Filter events in time window
    const windowEvents = this.events.filter((e) => {
      const t = new Date(e.timestamp).getTime();
      return t >= startMs && t <= endMs;
    });

    // Counts
    const quotaExhaustedUsers = new Set<string>();
    let adOfferedCount = 0;
    let sessionsCreatedCount = 0;
    let adsStartedCount = 0;
    let adsCompletedCount = 0;
    let rewardsVerifiedCount = 0;
    let rewardsGrantedCount = 0;
    let rewardsRejectedCount = 0;
    let duplicateAttemptsCount = 0;
    let expiredSessionsCount = 0;
    let userMismatchCount = 0;

    const rewardedUsersMap = new Map<string, number>(); // userId -> reward count

    for (const evt of windowEvents) {
      switch (evt.eventType) {
        case 'AD_OFFERED':
          adOfferedCount++;
          quotaExhaustedUsers.add(evt.userId);
          break;
        case 'AD_SESSION_CREATED':
          sessionsCreatedCount++;
          quotaExhaustedUsers.add(evt.userId);
          break;
        case 'AD_STARTED':
          adsStartedCount++;
          break;
        case 'AD_COMPLETED':
          adsCompletedCount++;
          break;
        case 'AD_REWARD_GRANTED':
          rewardsVerifiedCount++;
          rewardsGrantedCount++;
          rewardedUsersMap.set(evt.userId, (rewardedUsersMap.get(evt.userId) || 0) + 1);
          break;
        case 'AD_REWARD_REJECTED':
          rewardsRejectedCount++;
          break;
        case 'AD_REWARD_DUPLICATE':
          duplicateAttemptsCount++;
          break;
        case 'AD_SESSION_EXPIRED':
          expiredSessionsCount++;
          break;
        case 'AD_USER_MISMATCH':
          userMismatchCount++;
          break;
      }
    }

    // Default quota exhausted users count
    const quotaExhaustedCount = Math.max(quotaExhaustedUsers.size, adOfferedCount, sessionsCreatedCount);

    const uniqueRewardedUsersCount = rewardedUsersMap.size;
    let repeatRewardedUsersCount = 0;
    for (const count of rewardedUsersMap.values()) {
      if (count > 1) repeatRewardedUsersCount++;
    }

    const totalVerifiedRewards = rewardsGrantedCount;
    const totalGrantedTextQueriesAllowance = totalVerifiedRewards * 5; // strictly 5 units
    const averageRewardCyclesPerFreeUser =
      uniqueRewardedUsersCount > 0
        ? parseFloat((totalVerifiedRewards / uniqueRewardedUsersCount).toFixed(2))
        : 0;

    const completionRatePct =
      adsStartedCount > 0 ? parseFloat(((adsCompletedCount / adsStartedCount) * 100).toFixed(1)) : 0;
    const grantRatePct =
      adsCompletedCount > 0 ? parseFloat(((rewardsGrantedCount / adsCompletedCount) * 100).toFixed(1)) : 0;

    // Structured Funnel Steps
    const steps: FunnelStepCount[] = [
      {
        step: 'QUOTA_EXHAUSTED',
        label: 'Quota Exhausted',
        description: 'Watumiaji wa bure waliomaliza maswali ya bure',
        count: quotaExhaustedCount
      },
      {
        step: 'AD_OFFERED',
        label: 'Ad Offered',
        description: 'Watumiaji walioonyeshwa chaguo la kutazama tangazo',
        count: adOfferedCount || quotaExhaustedCount,
        conversionRateFromPreviousPct:
          quotaExhaustedCount > 0
            ? parseFloat((((adOfferedCount || quotaExhaustedCount) / quotaExhaustedCount) * 100).toFixed(1))
            : 0
      },
      {
        step: 'AD_STARTED',
        label: 'Ad Started',
        description: 'Vipindi vya matangazo vilivyoanzishwa na kuanza kucheza',
        count: adsStartedCount,
        conversionRateFromPreviousPct:
          (adOfferedCount || quotaExhaustedCount) > 0
            ? parseFloat(((adsStartedCount / (adOfferedCount || quotaExhaustedCount)) * 100).toFixed(1))
            : 0
      },
      {
        step: 'AD_COMPLETED',
        label: 'Ad Completed',
        description: 'Watumiaji waliomaliza kutazama tangazo lote',
        count: adsCompletedCount,
        conversionRateFromPreviousPct: completionRatePct
      },
      {
        step: 'REWARD_VERIFIED',
        label: 'Reward Verified',
        description: 'Uthibitisho salama wa uthibitishaji uliofaulu',
        count: rewardsVerifiedCount,
        conversionRateFromPreviousPct: grantRatePct
      },
      {
        step: 'ALLOWANCE_GRANTED',
        label: '+5 Granted',
        description: 'Maswali 5 ya bure ya maandishi yaliyoongezwa kwenye mfumo',
        count: rewardsGrantedCount,
        conversionRateFromPreviousPct:
          rewardsVerifiedCount > 0
            ? parseFloat(((rewardsGrantedCount / rewardsVerifiedCount) * 100).toFixed(1))
            : 0
      }
    ];

    return {
      timeWindow,
      quotaExhaustedUsersCount: quotaExhaustedCount,
      adOfferedCount: adOfferedCount || quotaExhaustedCount,
      sessionsCreatedCount,
      adsStartedCount,
      adsCompletedCount,
      rewardsVerifiedCount,
      rewardsGrantedCount,
      rewardsRejectedCount,
      duplicateAttemptsCount,
      expiredSessionsCount,
      userMismatchCount,
      steps,
      completionRatePct,
      grantRatePct,
      totalVerifiedRewards,
      totalGrantedTextQueriesAllowance,
      averageRewardCyclesPerFreeUser,
      uniqueRewardedUsersCount,
      repeatRewardedUsersCount
    };
  }

  // ==========================================================================
  // 4. PROVIDER PERFORMANCE BREAKDOWNS
  // ==========================================================================

  public getProviderPerformance(): ProviderPerformanceBreakdown[] {
    const map = new Map<string, ProviderPerformanceBreakdown>();

    for (const evt of this.events) {
      const key = `${evt.provider}_${evt.platform}_${evt.mode}`;
      let row = map.get(key);
      if (!row) {
        row = {
          provider: evt.provider,
          platform: evt.platform,
          mode: evt.mode,
          adRequests: 0,
          sessionsCreated: 0,
          successfulCompletions: 0,
          rewardGrants: 0,
          rejectedRewards: 0,
          providerFailures: 0,
          unavailableEvents: 0,
          productionBlockedEvents: 0,
          lastActiveTimestamp: evt.timestamp
        };
        map.set(key, row);
      }

      switch (evt.eventType) {
        case 'AD_SESSION_CREATED':
          row.sessionsCreated++;
          row.adRequests++;
          break;
        case 'AD_STARTED':
          row.adRequests++;
          break;
        case 'AD_COMPLETED':
          row.successfulCompletions++;
          break;
        case 'AD_REWARD_GRANTED':
          row.rewardGrants++;
          break;
        case 'AD_REWARD_REJECTED':
        case 'AD_REWARD_DUPLICATE':
        case 'AD_USER_MISMATCH':
          row.rejectedRewards++;
          break;
        case 'AD_PROVIDER_ERROR':
          row.providerFailures++;
          break;
        case 'AD_PROVIDER_UNAVAILABLE':
          row.unavailableEvents++;
          break;
        case 'AD_PRODUCTION_BLOCKED':
          row.productionBlockedEvents++;
          break;
      }
    }

    // Also include default active provider if no events yet
    const activeRegistry = adProviderRegistry;
    const defaultKey = `${activeRegistry.getActiveProviderName()}_${activeRegistry.getActivePlatform()}_${activeRegistry.getActiveMode()}`;
    if (!map.has(defaultKey)) {
      map.set(defaultKey, {
        provider: activeRegistry.getActiveProviderName(),
        platform: activeRegistry.getActivePlatform(),
        mode: activeRegistry.getActiveMode(),
        adRequests: 0,
        sessionsCreated: 0,
        successfulCompletions: 0,
        rewardGrants: 0,
        rejectedRewards: 0,
        providerFailures: 0,
        unavailableEvents: 0,
        productionBlockedEvents: 0
      });
    }

    return Array.from(map.values());
  }

  // ==========================================================================
  // 5. PROVIDER HEALTH STATUS
  // ==========================================================================

  public getProviderHealth(isKillSwitchActive = false): ProviderHealthStatus {
    const activeRegistry = adProviderRegistry;
    const activeProvider = activeRegistry.getActiveProvider();
    const activeMode = activeRegistry.getActiveMode();
    const activePlatform = activeRegistry.getActivePlatform();

    const nowMs = Date.now();
    const oneDayAgoMs = nowMs - 24 * 60 * 60 * 1000;

    let errorCountLast24h = 0;
    let lastSuccessfulEventAt: string | null = null;
    let lastFailureEventAt: string | null = null;
    let lastFailureReason: string | undefined;

    for (const evt of this.events) {
      const evtMs = new Date(evt.timestamp).getTime();
      if (evtMs >= oneDayAgoMs) {
        if (!evt.success || evt.eventType === 'AD_PROVIDER_ERROR' || evt.eventType === 'AD_PROVIDER_UNAVAILABLE') {
          errorCountLast24h++;
        }
      }

      if (evt.success && !lastSuccessfulEventAt) {
        lastSuccessfulEventAt = evt.timestamp;
      }
      if (!evt.success && !lastFailureEventAt) {
        lastFailureEventAt = evt.timestamp;
        lastFailureReason = evt.failureCode || evt.eventType;
      }
    }

    const safetyGateResult = adComplianceService.evaluateProductionSafetyGate({
      providerConfigured: activeProvider?.isConfigured || false,
      providerIntegrationAvailable: true,
      platform: activePlatform,
      platformConfigured: true,
      platformCompatible: true,
      productionAdUnitConfigured: false,
      productionEnabledByAdmin: activeRegistry.isProductionEnabled(),
      isProductionEnv: process.env.NODE_ENV === 'production'
    });

    const isAvailable = Boolean(
      !isKillSwitchActive &&
      activeProvider &&
      activeProvider.isConfigured &&
      (activeMode !== 'PRODUCTION' || safetyGateResult.eligible)
    );

    const status: 'AVAILABLE' | 'UNAVAILABLE' | 'DEGRADED' = isKillSwitchActive
      ? 'UNAVAILABLE'
      : !isAvailable
      ? 'UNAVAILABLE'
      : errorCountLast24h > 10
      ? 'DEGRADED'
      : 'AVAILABLE';

    this.lastDiagnosticCheck = new Date().toISOString();

    return {
      status,
      isConfigured: activeProvider?.isConfigured || false,
      activeProviderName: activeRegistry.getActiveProviderName(),
      activeMode,
      activePlatform,
      errorCountLast24h,
      lastSuccessfulEventAt,
      lastFailureEventAt,
      lastFailureReason,
      lastDiagnosticCheckAt: this.lastDiagnosticCheck,
      killSwitchActive: isKillSwitchActive,
      productionEnabled: activeRegistry.isProductionEnabled(),
      diagnosticDetails: {
        safetyGatePassed: safetyGateResult.eligible,
        failingConditionsCount: safetyGateResult.failingConditions.length,
        hasActiveNetworkProvider: Boolean(activeProvider),
        appAdsTxtConfigured: true,
        privacyPolicyConfigured: true
      }
    };
  }

  // ==========================================================================
  // 6. RATE & ABUSE PROTECTION (SERVER-AUTHORITATIVE)
  // ==========================================================================

  /**
   * Evaluates user request against abuse thresholds.
   * If excessive sessions or failed verifications occur, initiates temporary cooldown.
   * NEVER applies permanent bans in V1.9D.
   * NEVER modifies Marketplace trust or seller status.
   */
  public checkAbuseGuard(userId: string): AdAbuseGuardResult {
    const now = Date.now();
    let tracker = this.abuseTrackers.get(userId);

    if (!tracker) {
      tracker = {
        sessionTimestamps: [],
        failedTimestamps: [],
        violationCount: 0
      };
      this.abuseTrackers.set(userId, tracker);
    }

    // 1. Check if under active temporary cooldown
    if (tracker.cooldownUntil && tracker.cooldownUntil > now) {
      const remainingSeconds = Math.ceil((tracker.cooldownUntil - now) / 1000);
      return {
        allowed: false,
        errorCode: 'AD_COOLDOWN_ACTIVE',
        reason: `Muda wa kusubiri unaendelea (Cooldown). Tafadhali subiri sekunde ${remainingSeconds} kabla ya kujaribu tena.`,
        retryAfterSeconds: remainingSeconds,
        temporaryCooldownActive: true
      };
    }

    // Clean old session timestamps outside burst window
    tracker.sessionTimestamps = tracker.sessionTimestamps.filter((t) => now - t <= BURST_WINDOW_MS);

    // 2. Burst session creation limit
    if (tracker.sessionTimestamps.length >= BURST_SESSION_LIMIT) {
      tracker.cooldownUntil = now + 60 * 1000; // 1-minute burst cooldown
      tracker.violationCount++;
      this.recordEvent({
        userId,
        adSessionId: 'abuse_guard',
        eventType: 'AD_ABUSE_THROTTLED',
        success: false,
        failureCode: 'AD_BURST_LIMIT_EXCEEDED',
        metadata: { burstCount: tracker.sessionTimestamps.length }
      });
      return {
        allowed: false,
        errorCode: 'AD_ABUSE_THROTTLED',
        reason: 'Maombi ya matangazo yanatokea kwa kasi sana. Tafadhali subiri sekunde 60.',
        retryAfterSeconds: 60,
        temporaryCooldownActive: true
      };
    }

    // Clean old failure timestamps outside failure window
    tracker.failedTimestamps = tracker.failedTimestamps.filter((t) => now - t <= FAILED_ATTEMPT_WINDOW_MS);

    // 3. Repeated failed verifications limit
    if (tracker.failedTimestamps.length >= FAILED_ATTEMPT_LIMIT) {
      tracker.cooldownUntil = now + ABUSE_COOLDOWN_MS; // 5-minute cooldown
      tracker.violationCount++;
      this.recordEvent({
        userId,
        adSessionId: 'abuse_guard',
        eventType: 'AD_ABUSE_THROTTLED',
        success: false,
        failureCode: 'AD_FAILED_ATTEMPTS_EXCEEDED',
        metadata: { failedCount: tracker.failedTimestamps.length }
      });
      return {
        allowed: false,
        errorCode: 'AD_COOLDOWN_ACTIVE',
        reason: 'Majaribio mengi ya zawadi yameshindwa kuthibitishwa. Mfumo umeweka mapumziko ya dakika 5 kwa usalama.',
        retryAfterSeconds: Math.ceil(ABUSE_COOLDOWN_MS / 1000),
        temporaryCooldownActive: true
      };
    }

    // Register this request timestamp
    tracker.sessionTimestamps.push(now);

    return {
      allowed: true,
      temporaryCooldownActive: false
    };
  }

  /**
   * Records a failed verification attempt for abuse protection tracking.
   */
  public recordFailedAttempt(userId: string): void {
    const now = Date.now();
    let tracker = this.abuseTrackers.get(userId);
    if (!tracker) {
      tracker = { sessionTimestamps: [], failedTimestamps: [], violationCount: 0 };
      this.abuseTrackers.set(userId, tracker);
    }
    tracker.failedTimestamps.push(now);
  }

  /**
   * Resets abuse tracker for a user (used during tests or admin resets).
   */
  public resetAbuseTracker(userId: string): void {
    this.abuseTrackers.delete(userId);
  }

  // ==========================================================================
  // 7. COMPREHENSIVE ADMIN OPERATIONS OVERVIEW
  // ==========================================================================

  public getAdminOverview(isKillSwitchActive = false): AdOperationsAdminOverview {
    const now = new Date();
    const activeRegistry = adProviderRegistry;
    const activeProvider = activeRegistry.getActiveProvider();
    const activeMode = activeRegistry.getActiveMode();
    const activePlatform = activeRegistry.getActivePlatform();

    const funnelToday = this.getFunnelMetrics('TODAY');
    const funnelYesterday = this.getFunnelMetrics('YESTERDAY');
    const funnel7Days = this.getFunnelMetrics('LAST_7_DAYS');
    const funnel30Days = this.getFunnelMetrics('LAST_30_DAYS');

    const safetyGateResult = adComplianceService.evaluateProductionSafetyGate({
      providerConfigured: activeProvider?.isConfigured || false,
      providerIntegrationAvailable: true,
      platform: activePlatform,
      platformConfigured: true,
      platformCompatible: true,
      productionAdUnitConfigured: false,
      productionEnabledByAdmin: activeRegistry.isProductionEnabled(),
      isProductionEnv: process.env.NODE_ENV === 'production'
    });

    const providerHealth = this.getProviderHealth(isKillSwitchActive);
    const providerPerformance = this.getProviderPerformance();

    return {
      version: 'V1.9D',
      generatedAt: now.toISOString(),
      timeZone: 'Africa/Dar_es_Salaam (EAT / UTC+3)',
      status: {
        productionEnabled: activeRegistry.isProductionEnabled(),
        mode: activeMode,
        platform: activePlatform,
        providerName: activeRegistry.getActiveProviderName(),
        killSwitchActive: isKillSwitchActive,
        safetyGate: {
          eligible: safetyGateResult.eligible,
          stage: safetyGateResult.eligible ? 'PRODUCTION_READY' : 'CONFIGURED',
          failingConditions: safetyGateResult.failingConditions || [],
          summary: safetyGateResult.reason || 'Safety gate evaluated'
        },
        consentConfig: {
          defaultPolicy: 'OPT_IN_EXPLICIT_OR_PASSIVE',
          totalConsentsRecorded: 0
        }
      },
      rewardOverview: {
        today: funnelToday.totalVerifiedRewards,
        yesterday: funnelYesterday.totalVerifiedRewards,
        thisWeek: funnel7Days.totalVerifiedRewards,
        thisMonth: funnel30Days.totalVerifiedRewards,
        uniqueRewardedUsers: funnel30Days.uniqueRewardedUsersCount,
        duplicateAttempts: funnel30Days.duplicateAttemptsCount,
        rejectedRewards: funnel30Days.rewardsRejectedCount,
        totalGrantedAllowance: funnel30Days.totalGrantedTextQueriesAllowance
      },
      funnel: funnelToday,
      providerHealth,
      providerPerformance,
      costAndRevenueDisclaimer: {
        notice: 'Kiwango cha zawadi (rewardCount) na ukamilishaji wa matangazo (completionCount) havimaanishi mapato ya fedha. Mapato halisi hayajumuishwi hapa mpaka pale taarifa rasmi za mtoa huduma wa kibiashara (AdMob) zitakapounganishwa.',
        measuredRevenueTSh: null,
        currency: 'TZS',
        reason: 'REVENUE_NOT_MEASURED_UNTIL_PRODUCTION_PAYOUT_ACTIVE'
      }
    };
  }

  /**
   * Testing helper to reset all events and trackers.
   */
  public resetForTesting(): void {
    this.events = [];
    this.abuseTrackers.clear();
  }
}

export const adOperationsAnalyticsService = AdOperationsAnalyticsService.getInstance();

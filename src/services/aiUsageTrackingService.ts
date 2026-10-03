/**
 * Ufugaji Update — V1.8A AI Usage Tracking, Cost & Accounting Service
 *
 * Provides server-authoritative infrastructure for:
 * 1. Request & input type classification
 * 2. Idempotent usage event logging
 * 3. Server-authoritative daily usage boundaries (East Africa Time, UTC+3)
 * 4. Free text allowance (initial 10 queries limit)
 * 5. Authorized Ad-Reward entitlement hook (5 queries increment)
 * 6. Premium daily usage limit placeholders
 * 7. Token accounting without fabrication (explicit UNKNOWN state)
 * 8. Configurable model cost metadata
 * 9. Concurrency & replay attack prevention
 * 10. Observability metrics for platform administrators
 */

import {
  AiRequestType,
  AiInputType,
  AiUsageSource,
  AiEntitlementSource,
  AiEntitlementTier,
  AiPackageType,
  AiEntitlementStatus,
  AiEntitlementSourceType,
  AiEntitlementRecord,
  AiUsageState,
  AiLimitResponse,
  TokenCount,
  EstimatedCost,
  AiUsageEvent,
  AiUserDailyUsage,
  AiUserUsageSummary,
  AiCostConfiguration,
  AiBusinessConfig,
  AdRewardGrantRequest,
  AdRewardGrantResult,
  AiObservabilityMetrics,
  AiCacheStatus
} from '../types/aiUsageAndCache';
import fs from 'node:fs';
import path from 'node:path';

// Detect runtime environment (Node vs Browser)
const isNode = typeof window === 'undefined' || !window.location || !window.location.origin;

// ============================================================================
// 1. CONFIGURATION & CONSTANTS
// ============================================================================

export const DEFAULT_AI_BUSINESS_CONFIG: AiBusinessConfig = {
  freeTextInitialLimit: 10,
  adRewardTextQueries: 5,
  premiumWeeklyDailyLimit: 50,
  premiumMonthlyDailyLimit: 100,
  premiumAnnualDailyLimit: 200,
  mediaAiAllowedForFree: false,
  answerCacheEnabled: true,
  knowledgeBaseVersion: '1.0.0',
  defaultCacheTtlMs: 7 * 24 * 60 * 60 * 1000 // 7 days
};

let currentBusinessConfig: AiBusinessConfig = { ...DEFAULT_AI_BUSINESS_CONFIG };

export function getAiBusinessConfig(): AiBusinessConfig {
  return { ...currentBusinessConfig };
}

export function updateAiBusinessConfig(newConfig: Partial<AiBusinessConfig>): AiBusinessConfig {
  currentBusinessConfig = { ...currentBusinessConfig, ...newConfig };
  return { ...currentBusinessConfig };
}

// Active Model Cost Metadata table (dynamic, not hardcoded into business logic)
const costConfigurations: Map<string, AiCostConfiguration> = new Map([
  [
    'google-gemini:gemini-3.1-flash-lite',
    {
      configId: 'cfg_gemini_31_flash_lite',
      provider: 'google-gemini',
      model: 'gemini-3.1-flash-lite',
      inputCostPerUnit: 0.075, // $0.075 per 1,000,000 tokens
      outputCostPerUnit: 0.30,  // $0.30 per 1,000,000 tokens
      unitTokens: 1000000,
      currency: 'USD',
      effectiveFrom: '2025-01-01T00:00:00Z',
      active: true
    }
  ],
  [
    'google-gemini:gemini-3.5-flash',
    {
      configId: 'cfg_gemini_35_flash',
      provider: 'google-gemini',
      model: 'gemini-3.5-flash',
      inputCostPerUnit: 0.15,
      outputCostPerUnit: 0.60,
      unitTokens: 1000000,
      currency: 'USD',
      effectiveFrom: '2025-01-01T00:00:00Z',
      active: true
    }
  ],
  [
    'google-gemini:gemini-3.8-flash',
    {
      configId: 'cfg_gemini_38_flash',
      provider: 'google-gemini',
      model: 'gemini-3.8-flash',
      inputCostPerUnit: 0.20,
      outputCostPerUnit: 0.80,
      unitTokens: 1000000,
      currency: 'USD',
      effectiveFrom: '2025-01-01T00:00:00Z',
      active: true
    }
  ]
]);

export function registerCostConfiguration(config: AiCostConfiguration): void {
  const key = `${config.provider}:${config.model}`;
  costConfigurations.set(key, config);
}

export function getCostConfiguration(provider: string, model: string): AiCostConfiguration | null {
  const key = `${provider}:${model}`;
  const cfg = costConfigurations.get(key);
  if (cfg && cfg.active) {
    return cfg;
  }
  return null;
}

// ============================================================================
// 2. SERVER-AUTHORITATIVE DATE & TIME BOUNDARIES
// ============================================================================

/**
 * Returns YYYY-MM-DD based on server time in East Africa Time (EAT, UTC+3).
 * Never relies on client device clock.
 */
export function getServerDateKey(date: Date = new Date()): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Dar_es_Salaam',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(date); // Format: 'YYYY-MM-DD'
  } catch {
    // Robust UTC fallback
    const d = new Date(date.getTime() + 3 * 60 * 60 * 1000); // Shift to UTC+3
    return d.toISOString().slice(0, 10);
  }
}

// ============================================================================
// 3. REQUEST & INPUT CLASSIFICATION
// ============================================================================

export function classifyAiRequestType(params: {
  hasText: boolean;
  hasImage: boolean;
  hasVideo: boolean;
}): { requestType: AiRequestType; inputType: AiInputType } {
  const { hasText, hasImage, hasVideo } = params;

  if (hasVideo && hasText) {
    return { requestType: 'TEXT_WITH_VIDEO', inputType: 'TEXT_VIDEO' };
  }
  if (hasVideo) {
    return { requestType: 'VIDEO_QUERY', inputType: 'VIDEO' };
  }
  if (hasImage && hasText) {
    return { requestType: 'TEXT_WITH_IMAGE', inputType: 'TEXT_IMAGE' };
  }
  if (hasImage) {
    return { requestType: 'IMAGE_QUERY', inputType: 'IMAGE' };
  }
  // Default to text query
  return { requestType: 'TEXT_QUERY', inputType: 'TEXT' };
}

// ============================================================================
// 4. COST ESTIMATION CALCULATION
// ============================================================================

export function calculateEstimatedCost(
  provider: string,
  model: string,
  inputTokens: TokenCount,
  outputTokens: TokenCount
): EstimatedCost {
  if (inputTokens === 'UNKNOWN' || outputTokens === 'UNKNOWN') {
    return 'UNKNOWN';
  }

  const config = getCostConfiguration(provider, model);
  if (!config) {
    // If actual provider pricing is not configured: estimatedCost = UNKNOWN
    return 'UNKNOWN';
  }

  const inputCost = (inputTokens / config.unitTokens) * config.inputCostPerUnit;
  const outputCost = (outputTokens / config.unitTokens) * config.outputCostPerUnit;
  const total = inputCost + outputCost;

  // Round to 6 decimal places in USD
  return Math.round(total * 1000000) / 1000000;
}

// ============================================================================
// 5. IN-MEMORY STORES & CONCURRENCY LOCKS
// ============================================================================

// Memory stores for immediate server-authoritative lookup and deduplication
const usageEventsStore: Map<string, AiUsageEvent> = new Map();
const userDailyUsageStore: Map<string, AiUserDailyUsage> = new Map(); // key: `${userId}_${dateKey}`
const userSummaryStore: Map<string, AiUserUsageSummary> = new Map(); // key: userId
const aiEntitlementsStore: Map<string, AiEntitlementRecord> = new Map(); // key: userId
const redeemedRewardTokens: Set<string> = new Set(); // Replay protection for ad reward proofs
const userLocks: Map<string, Promise<void>> = new Map(); // Per-user concurrency lock

// Durable disk persistence to prevent quota wipe on server restarts or container scaling
const USAGE_STORE_PATH = path.join(process.cwd(), 'data', 'ai_usage_store.json');
const USAGE_STORE_BACKUP_PATH = path.join(process.cwd(), 'data', 'ai_usage_store.json.bak');

/**
 * Identifies whether a user ID is a synthetic/automated test user
 * to prevent automated test suites from polluting production storage.
 */
export function isTestUserId(userId: string): boolean {
  if (!userId || typeof userId !== 'string') return false;
  return (
    userId.startsWith('farmer_pluspesa_test_') ||
    userId.startsWith('test_farmer_') ||
    userId.startsWith('test_user_') ||
    userId.startsWith('test_mock_') ||
    userId.startsWith('mock_user_') ||
    userId === 'test_farmer_123' ||
    userId === 'test_user_quota_demo'
  );
}

function parseUsageStoreData(raw: string): boolean {
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return false;

    // 1. User summaries (supports array of [k, v] or object dictionary)
    if (Array.isArray(data.userSummaries)) {
      for (const item of data.userSummaries) {
        if (Array.isArray(item) && item.length >= 2) {
          const [uid, summary] = item;
          if (uid && !isTestUserId(uid)) {
            userSummaryStore.set(uid, summary);
          }
        }
      }
    } else if (data.userSummaries && typeof data.userSummaries === 'object') {
      for (const [uid, summary] of Object.entries(data.userSummaries)) {
        if (uid && !isTestUserId(uid)) {
          userSummaryStore.set(uid, summary as AiUserUsageSummary);
        }
      }
    }

    // 2. AI entitlements (supports array of [k, v] or object dictionary)
    if (Array.isArray(data.aiEntitlements)) {
      for (const item of data.aiEntitlements) {
        if (Array.isArray(item) && item.length >= 2) {
          const [uid, ent] = item;
          if (uid && !isTestUserId(uid)) {
            aiEntitlementsStore.set(uid, ent);
          }
        }
      }
    } else if (data.aiEntitlements && typeof data.aiEntitlements === 'object') {
      for (const [uid, ent] of Object.entries(data.aiEntitlements)) {
        if (uid && !isTestUserId(uid)) {
          aiEntitlementsStore.set(uid, ent as AiEntitlementRecord);
        }
      }
    }

    // 3. Daily usage records (supports array of [k, v] or object dictionary)
    if (Array.isArray(data.userDailyUsages)) {
      for (const item of data.userDailyUsages) {
        if (Array.isArray(item) && item.length >= 2) {
          const [key, daily] = item;
          const ownerUid = key ? String(key).replace(/_\d{4}-\d{2}-\d{2}$/, '') : '';
          if (key && !isTestUserId(ownerUid)) {
            userDailyUsageStore.set(key, daily);
          }
        }
      }
    } else if (data.userDailyUsages && typeof data.userDailyUsages === 'object') {
      for (const [key, daily] of Object.entries(data.userDailyUsages)) {
        const ownerUid = key ? String(key).replace(/_\d{4}-\d{2}-\d{2}$/, '') : '';
        if (key && !isTestUserId(ownerUid)) {
          userDailyUsageStore.set(key, daily as AiUserDailyUsage);
        }
      }
    }

    // 4. Redeemed tokens
    if (Array.isArray(data.redeemedRewardTokens)) {
      for (const tok of data.redeemedRewardTokens) {
        if (tok && typeof tok === 'string') {
          redeemedRewardTokens.add(tok);
        }
      }
    }

    return true;
  } catch (err) {
    console.warn('[aiUsageTrackingService] Error parsing usage store payload:', err);
    return false;
  }
}

function loadPersistedUsageStore(): void {
  try {
    let loaded = false;

    if (fs.existsSync(USAGE_STORE_PATH)) {
      const raw = fs.readFileSync(USAGE_STORE_PATH, 'utf-8');
      if (raw && raw.trim().length > 0) {
        loaded = parseUsageStoreData(raw);
      }
    }

    // Automatic fallback to backup if primary file was missing or unparseable
    if (!loaded && fs.existsSync(USAGE_STORE_BACKUP_PATH)) {
      console.warn('[aiUsageTrackingService] Attempting recovery from backup store file...');
      const backupRaw = fs.readFileSync(USAGE_STORE_BACKUP_PATH, 'utf-8');
      if (backupRaw && backupRaw.trim().length > 0) {
        loaded = parseUsageStoreData(backupRaw);
        if (loaded) {
          console.log('[aiUsageTrackingService] Successfully recovered storage from backup file.');
        }
      }
    }

    console.log(`[aiUsageTrackingService] Loaded persisted usage store: ${userSummaryStore.size} users, ${aiEntitlementsStore.size} entitlements.`);
  } catch (err) {
    console.warn('[aiUsageTrackingService] Notice: Could not read persisted usage store:', err);
  }
}

/**
 * Persists current authoritative user usage and entitlement records to disk.
 * Uses atomic file write and maintains an active backup file.
 */
export function savePersistedUsageStore(): void {
  try {
    const dataDir = path.dirname(USAGE_STORE_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Clean up any stale .tmp files from previous interrupted runs
    try {
      const files = fs.readdirSync(dataDir);
      for (const f of files) {
        if (f.startsWith('ai_usage_store.json.tmp_')) {
          fs.unlinkSync(path.join(dataDir, f));
        }
      }
    } catch {
      // Non-blocking cleanup
    }

    // Filter out transient test users so production disk store remains clean
    const persistedSummaries = Array.from(userSummaryStore.entries())
      .filter(([uid]) => !isTestUserId(uid));
    const persistedEntitlements = Array.from(aiEntitlementsStore.entries())
      .filter(([uid]) => !isTestUserId(uid));
    const persistedDailyUsages = Array.from(userDailyUsageStore.entries())
      .filter(([key]) => !isTestUserId(String(key).replace(/_\d{4}-\d{2}-\d{2}$/, '')));

    const payload = {
      version: 'V1.8E',
      updatedAt: new Date().toISOString(),
      userSummaries: persistedSummaries,
      aiEntitlements: persistedEntitlements,
      userDailyUsages: persistedDailyUsages,
      redeemedRewardTokens: Array.from(redeemedRewardTokens.values())
    };

    const tmpPath = `${USAGE_STORE_PATH}.tmp_${Date.now()}`;
    fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2), 'utf-8');

    // Create / update backup copy before atomic replacement
    if (fs.existsSync(USAGE_STORE_PATH)) {
      try {
        fs.copyFileSync(USAGE_STORE_PATH, USAGE_STORE_BACKUP_PATH);
      } catch {
        // Backup failure is non-blocking
      }
    }

    fs.renameSync(tmpPath, USAGE_STORE_PATH);
  } catch (err) {
    console.error('[aiUsageTrackingService] Error persisting usage store to disk:', err);
  }
}

/**
 * Prunes all transient test records and immediately writes a clean store to disk.
 */
export function pruneTestUsersFromPersistence(): { prunedCount: number; remainingUsersCount: number } {
  let prunedCount = 0;
  for (const uid of Array.from(userSummaryStore.keys())) {
    if (isTestUserId(uid)) {
      userSummaryStore.delete(uid);
      prunedCount++;
    }
  }
  for (const uid of Array.from(aiEntitlementsStore.keys())) {
    if (isTestUserId(uid)) {
      aiEntitlementsStore.delete(uid);
    }
  }
  for (const key of Array.from(userDailyUsageStore.keys())) {
    const uid = String(key).replace(/_\d{4}-\d{2}-\d{2}$/, '');
    if (isTestUserId(uid)) {
      userDailyUsageStore.delete(key);
    }
  }
  savePersistedUsageStore();
  return { prunedCount, remainingUsersCount: userSummaryStore.size };
}

// Immediately load on startup
loadPersistedUsageStore();

// Quota in-flight reservation map for deterministic concurrency protection (key: requestId)
interface ActiveQuotaReservation {
  userId: string;
  requestType: AiRequestType;
  timestamp: number;
}
const activeQuotaReservations: Map<string, ActiveQuotaReservation> = new Map();

export function releaseAiQuotaReservation(userId: string, requestId: string): void {
  const existing = activeQuotaReservations.get(requestId);
  if (existing && existing.userId === userId) {
    activeQuotaReservations.delete(requestId);
  }
}

function cleanStaleQuotaReservations(): void {
  const now = Date.now();
  for (const [rId, res] of activeQuotaReservations.entries()) {
    if (now - res.timestamp > 60000) {
      activeQuotaReservations.delete(rId);
    }
  }
}

// Observability aggregates
const observabilityState: AiObservabilityMetrics = {
  totalAiRequests: 0,
  textRequests: 0,
  mediaRequests: 0,
  allowedRequests: 0,
  blockedRequests: 0,
  freeAllowanceUsage: 0,
  adRewardUsage: 0,
  premiumUsage: 0,
  mediaBlocked: 0,
  dailyPremiumLimitReached: 0,
  freeQuotaExhausted: 0,
  entitlementUnavailable: 0,
  cacheHits: 0,
  cacheMisses: 0,
  cacheBypasses: 0,
  cacheInvalidated: 0,
  apiCalls: 0,
  failedRequests: 0,
  totalTokensRecorded: 0,
  tokensRecordedCount: 0,
  unknownTokenRequests: 0,
  estimatedTotalCostUsd: 0,
  unknownCostRequests: 0,
  // V1.8C Premium & Lifecycle Observability Metrics
  entitlementResolutions: 0,
  premiumAllowedRequests: 0,
  premiumBlockedRequests: 0,
  premiumMediaAllowed: 0,
  planSelectionAttempts: 0,
  paymentIntentsCreated: 0,
  entitlementActivations: 0,
  entitlementExpirations: 0
};

// Concurrency mutex helper
async function runWithUserLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const currentLock = userLocks.get(userId) || Promise.resolve();
  let release: () => void;
  const nextLock = new Promise<void>((resolve) => {
    release = resolve;
  });
  userLocks.set(userId, currentLock.then(() => nextLock));

  try {
    await currentLock;
    return await fn();
  } finally {
    release!();
    if (userLocks.get(userId) === nextLock) {
      userLocks.delete(userId);
    }
  }
}

// ============================================================================
// 6. USER ACCOUNTING & ENTITLEMENT HELPERS
// ============================================================================

export function getOrCreateUserSummary(userId: string): AiUserUsageSummary {
  let summary = userSummaryStore.get(userId);
  if (!summary) {
    summary = {
      userId,
      lifetimeTextQueries: 0,
      lifetimeMediaQueries: 0,
      lifetimeFreeAllowanceUsed: 0,
      lifetimeAdRewardsGranted: 0,
      lifetimeAdRewardsUsed: 0,
      lifetimePremiumQueries: 0,
      lifetimeCacheHits: 0,
      currentFreeAllowanceRemaining: currentBusinessConfig.freeTextInitialLimit,
      currentAdRewardRemaining: 0,
      activeEntitlement: 'FREE_TIER',
      premiumPackage: null,
      premiumExpiresAt: null
    };
    userSummaryStore.set(userId, summary);
  }
  return summary;
}

export function getOrCreateDailyUsage(userId: string, dateKey: string): AiUserDailyUsage {
  const compositeKey = `${userId}_${dateKey}`;
  let daily = userDailyUsageStore.get(compositeKey);
  if (!daily) {
    daily = {
      userId,
      dateKey,
      totalQueriesCount: 0,
      textQueriesCount: 0,
      mediaQueriesCount: 0,
      freeAllowanceUsed: 0,
      adRewardsGranted: 0,
      adRewardsUsed: 0,
      premiumQueriesUsed: 0,
      cacheHitsCount: 0,
      lastUpdated: new Date().toISOString(),
      processedRequestIds: []
    };
    userDailyUsageStore.set(compositeKey, daily);
  }
  return daily;
}

/**
 * Resolves the server-authoritative entitlement record for a user.
 * Existing users or new users without an explicit document resolve safely to FREE.
 */
export function resolveUserEntitlement(userId: string): AiEntitlementRecord {
  observabilityState.entitlementResolutions = (observabilityState.entitlementResolutions || 0) + 1;
  const existing = aiEntitlementsStore.get(userId);
  if (existing) {
    // Check if premium package has expired deterministically based on server time
    const now = Date.now();
    if (existing.tier === 'PREMIUM' && existing.expiresAt && new Date(existing.expiresAt).getTime() <= now) {
      if (existing.status === 'ACTIVE') {
        existing.status = 'EXPIRED';
        existing.updatedAt = new Date().toISOString();
        observabilityState.entitlementExpirations = (observabilityState.entitlementExpirations || 0) + 1;
        aiEntitlementsStore.set(userId, existing);
      }
    }
    return existing;
  }

  // Backward compatibility & safe default: New or un-provisioned user resolves to FREE
  const defaultFreeRecord: AiEntitlementRecord = {
    entitlementId: `ent_${userId}_free`,
    userId,
    tier: 'FREE',
    status: 'ACTIVE',
    packageType: 'NONE',
    source: 'DEFAULT_FREE',
    startedAt: new Date().toISOString(),
    expiresAt: null,
    dailyLimit: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: {
      initialFreeLimit: currentBusinessConfig.freeTextInitialLimit
    }
  };
  aiEntitlementsStore.set(userId, defaultFreeRecord);
  return defaultFreeRecord;
}

/**
 * Authoritatively creates or updates a user's entitlement record (Server/Admin only).
 */
export function grantOrUpdateUserEntitlement(
  record: Partial<AiEntitlementRecord> & { userId: string }
): AiEntitlementRecord {
  const userId = record.userId;
  const current = resolveUserEntitlement(userId);
  const nowIso = new Date().toISOString();

  const packageType = record.packageType ?? current.packageType;
  const tier = record.tier ?? current.tier;
  let dailyLimit = record.dailyLimit !== undefined ? record.dailyLimit : current.dailyLimit;

  if (tier === 'PREMIUM' && (!dailyLimit || dailyLimit <= 0)) {
    if (packageType === 'WEEKLY') dailyLimit = currentBusinessConfig.premiumWeeklyDailyLimit;
    else if (packageType === 'MONTHLY') dailyLimit = currentBusinessConfig.premiumMonthlyDailyLimit;
    else if (packageType === 'ANNUAL') dailyLimit = currentBusinessConfig.premiumAnnualDailyLimit;
    else dailyLimit = currentBusinessConfig.premiumMonthlyDailyLimit;
  } else if (tier === 'FREE') {
    dailyLimit = 0;
  }

  const updated: AiEntitlementRecord = {
    entitlementId: record.entitlementId || current.entitlementId || `ent_${userId}_${Date.now()}`,
    userId,
    tier,
    status: record.status ?? 'ACTIVE',
    packageType,
    source: record.source ?? (tier === 'PREMIUM' ? 'ADMIN_GRANT' : 'DEFAULT_FREE'),
    startedAt: record.startedAt ?? current.startedAt ?? nowIso,
    expiresAt: record.expiresAt !== undefined ? record.expiresAt : current.expiresAt,
    dailyLimit,
    externalReference: record.externalReference !== undefined ? record.externalReference : current.externalReference,
    pendingPlan: record.pendingPlan !== undefined ? record.pendingPlan : current.pendingPlan,
    createdAt: current.createdAt || nowIso,
    updatedAt: nowIso,
    metadata: {
      ...current.metadata,
      ...record.metadata
    }
  };

  aiEntitlementsStore.set(userId, updated);

  // Sync with userSummary
  const summary = getOrCreateUserSummary(userId);
  if (updated.tier === 'PREMIUM' && updated.status === 'ACTIVE') {
    summary.premiumPackage = updated.packageType === 'NONE' ? 'MONTHLY' : updated.packageType;
    summary.premiumExpiresAt = updated.expiresAt;
    if (updated.packageType === 'WEEKLY') summary.activeEntitlement = 'PREMIUM_WEEKLY';
    else if (updated.packageType === 'ANNUAL') summary.activeEntitlement = 'PREMIUM_ANNUAL';
    else summary.activeEntitlement = 'PREMIUM_MONTHLY';
  } else if (updated.status === 'EXPIRED') {
    summary.premiumPackage = null;
    summary.premiumExpiresAt = null;
    summary.activeEntitlement = 'FREE_TIER';
  }

  savePersistedUsageStore();
  return updated;
}

/**
 * Returns comprehensive user entitlement status, quota summary, and daily limits.
 */
export function getUserEntitlementStatus(userId: string) {
  const entitlement = resolveUserEntitlement(userId);
  const summary = getOrCreateUserSummary(userId);
  const dateKey = getServerDateKey();
  const daily = getOrCreateDailyUsage(userId, dateKey);
  const isPremiumActive =
    entitlement.tier === 'PREMIUM' &&
    entitlement.status === 'ACTIVE' &&
    (!entitlement.expiresAt || new Date(entitlement.expiresAt).getTime() > Date.now());

  const freeLimit = currentBusinessConfig.freeTextInitialLimit;
  const freeUsed = summary.lifetimeFreeAllowanceUsed;
  const freeRemaining = Math.max(0, freeLimit - freeUsed);

  let usageState: AiUsageState = 'FREE_QUOTA_AVAILABLE';
  if (isPremiumActive) {
    if (daily.totalQueriesCount >= entitlement.dailyLimit) {
      usageState = 'PREMIUM_DAILY_LIMIT_REACHED';
    } else {
      usageState = 'PREMIUM_ACTIVE';
    }
  } else if (entitlement.tier === 'PREMIUM' && entitlement.status === 'EXPIRED') {
    usageState = 'PREMIUM_EXPIRED';
  } else if (freeRemaining > 0) {
    usageState = 'FREE_QUOTA_AVAILABLE';
  } else if (summary.currentAdRewardRemaining > 0) {
    usageState = 'AD_REWARD_AVAILABLE';
  } else {
    usageState = 'FREE_QUOTA_EXHAUSTED';
  }

  return {
    userId,
    entitlement,
    summary,
    daily,
    usageState,
    entitlementTier: isPremiumActive ? 'PREMIUM' : 'FREE',
    remainingTextQueries: isPremiumActive
      ? Math.max(0, entitlement.dailyLimit - daily.totalQueriesCount)
      : freeRemaining + summary.currentAdRewardRemaining,
    freeLimit,
    freeUsed,
    freeRemaining,
    consumedFreeQueries: freeUsed,
    initialFreeLimit: freeLimit,
    canUseAdReward: !isPremiumActive && freeRemaining <= 0 && summary.currentAdRewardRemaining <= 0,
    mediaAllowed: isPremiumActive
  };
}

/**
 * Checks whether user is eligible for an AI request before making an API call (Synchronous legacy wrapper).
 */
export function checkUserAiEntitlement(
  userId: string,
  requestType: AiRequestType
): {
  allowed: boolean;
  source: AiUsageSource;
  entitlement: AiEntitlementSource;
  freeRemaining: number;
  adRewardRemaining: number;
  reason?: string;
} {
  const entitlement = resolveUserEntitlement(userId);
  const summary = getOrCreateUserSummary(userId);
  const isMedia = requestType !== 'TEXT_QUERY';

  // Check active premium status
  const isPremiumActive =
    entitlement.tier === 'PREMIUM' &&
    entitlement.status === 'ACTIVE' &&
    (!entitlement.expiresAt || new Date(entitlement.expiresAt).getTime() > Date.now());

  if (isPremiumActive) {
    const daily = getOrCreateDailyUsage(userId, getServerDateKey());
    const limit = entitlement.dailyLimit > 0 ? entitlement.dailyLimit : currentBusinessConfig.premiumMonthlyDailyLimit;

    if (daily.totalQueriesCount >= limit) {
      return {
        allowed: false,
        source: 'PREMIUM',
        entitlement: summary.activeEntitlement,
        freeRemaining: summary.currentFreeAllowanceRemaining,
        adRewardRemaining: summary.currentAdRewardRemaining,
        reason: 'Ukomo wa kila siku wa matumizi ya Premium umefikiwa.'
      };
    }

    return {
      allowed: true,
      source: 'PREMIUM',
      entitlement: summary.activeEntitlement,
      freeRemaining: summary.currentFreeAllowanceRemaining,
      adRewardRemaining: summary.currentAdRewardRemaining
    };
  }

  // Free Tier constraints: Media queries are not allowed for Free users
  if (isMedia && !currentBusinessConfig.mediaAiAllowedForFree) {
    return {
      allowed: false,
      source: 'FREE_ALLOWANCE',
      entitlement: 'FREE_TIER',
      freeRemaining: summary.currentFreeAllowanceRemaining,
      adRewardRemaining: summary.currentAdRewardRemaining,
      reason: 'Uchambuzi wa picha na video unahitaji kifurushi cha Premium.'
    };
  }

  // Free text allowance check
  if (summary.currentFreeAllowanceRemaining > 0) {
    return {
      allowed: true,
      source: 'FREE_ALLOWANCE',
      entitlement: 'FREE_TIER',
      freeRemaining: summary.currentFreeAllowanceRemaining,
      adRewardRemaining: summary.currentAdRewardRemaining
    };
  }

  // Ad reward check
  if (summary.currentAdRewardRemaining > 0) {
    return {
      allowed: true,
      source: 'AD_REWARD',
      entitlement: 'AD_REWARD',
      freeRemaining: 0,
      adRewardRemaining: summary.currentAdRewardRemaining
    };
  }

  // Allowance exhausted
  return {
    allowed: false,
    source: 'FREE_ALLOWANCE',
    entitlement: 'FREE_TIER',
    freeRemaining: 0,
    adRewardRemaining: 0,
    reason: 'Umetumia nafasi zako 10 za bure za maswali. Tazama tangazo kupata nafasi 5 zaidi au jiunge na Premium.'
  };
}

/**
 * Comprehensive Server-Authoritative Entitlement Gate for the AI Assistant Pipeline.
 * Concurrency-locked with double-spend protection and structured limit responses.
 */
export async function checkUserAiEntitlementGate(
  userId: string,
  requestType: AiRequestType,
  requestId: string
): Promise<{
  allowed: boolean;
  reasonCode: AiUsageState;
  entitlement: AiEntitlementRecord;
  limitResponse?: AiLimitResponse;
  usageSource: AiUsageSource;
  remainingTextQueries: number;
  freeLimit?: number;
  freeUsed?: number;
  freeRemaining?: number;
  reply?: string;
  entitlementTier: AiEntitlementTier;
  packageType: AiPackageType;
  dailyLimit: number;
  dailyUsed: number;
  canUseAdReward: boolean;
  mediaAllowed: boolean;
  retryAfter?: string | null;
}> {
  return runWithUserLock(userId, async () => {
    cleanStaleQuotaReservations();

    const entitlement = resolveUserEntitlement(userId);
    const summary = getOrCreateUserSummary(userId);
    const dateKey = getServerDateKey();
    const daily = getOrCreateDailyUsage(userId, dateKey);
    const isMedia = requestType !== 'TEXT_QUERY';

    const freeLimit = currentBusinessConfig.freeTextInitialLimit;
    const freeUsed = summary.lifetimeFreeAllowanceUsed;

    // Idempotency & Replay Protection at Gate:
    // If this requestId was already processed, or is already reserved in flight for this user, do not double count
    const isAlreadyProcessed = daily.processedRequestIds.includes(requestId);
    const isAlreadyReserved =
      activeQuotaReservations.has(requestId) &&
      activeQuotaReservations.get(requestId)!.userId === userId;

    if (isAlreadyProcessed || isAlreadyReserved) {
      console.log('[AI Quota] free_quota_replay_ignored', {
        userId,
        requestId,
        freeLimit,
        freeUsed,
        freeRemaining: Math.max(0, freeLimit - freeUsed),
        requestType,
        wasCached: false
      });

      return {
        allowed: true,
        reasonCode: 'FREE_QUOTA_AVAILABLE',
        entitlement,
        usageSource: isAlreadyProcessed ? 'CACHE' : 'FREE_ALLOWANCE',
        remainingTextQueries: Math.max(0, freeLimit - freeUsed),
        freeLimit,
        freeUsed,
        freeRemaining: Math.max(0, freeLimit - freeUsed),
        entitlementTier: entitlement.tier,
        packageType: entitlement.packageType,
        dailyLimit: entitlement.dailyLimit,
        dailyUsed: daily.totalQueriesCount,
        canUseAdReward: false,
        mediaAllowed: entitlement.tier === 'PREMIUM',
        retryAfter: null
      };
    }

    // 1. Check if premium is active
    const isPremiumActive =
      entitlement.tier === 'PREMIUM' &&
      entitlement.status === 'ACTIVE' &&
      (!entitlement.expiresAt || new Date(entitlement.expiresAt).getTime() > Date.now());

    // 2. Media Restriction: Free users cannot access image/video AI
    if (isMedia) {
      if (!isPremiumActive) {
        observabilityState.blockedRequests += 1;
        observabilityState.mediaBlocked += 1;

        const reply = 'Uchambuzi wa picha na video unahitaji kifurushi cha Premium. Unaweza kuendelea kuuliza maswali ya maandishi bila malipo, au kujiunga na kifurushi cha Premium kufurahia uchambuzi wa picha na video.';
        const limitResponse: AiLimitResponse = {
          allowed: false,
          entitlementTier: entitlement.tier,
          packageType: entitlement.packageType,
          usageSource: 'FREE_ALLOWANCE',
          remainingTextQueries: summary.currentFreeAllowanceRemaining,
          dailyLimit: entitlement.dailyLimit,
          dailyUsed: daily.totalQueriesCount,
          reasonCode: 'MEDIA_ACCESS_DENIED',
          canUseAdReward: summary.currentFreeAllowanceRemaining <= 0,
          mediaAllowed: false,
          retryAfter: null,
          reply
        };

        return {
          allowed: false,
          reasonCode: 'MEDIA_ACCESS_DENIED',
          entitlement,
          limitResponse,
          usageSource: 'FREE_ALLOWANCE',
          remainingTextQueries: summary.currentFreeAllowanceRemaining,
          reply,
          entitlementTier: entitlement.tier,
          packageType: entitlement.packageType,
          dailyLimit: entitlement.dailyLimit,
          dailyUsed: daily.totalQueriesCount,
          canUseAdReward: summary.currentFreeAllowanceRemaining <= 0,
          mediaAllowed: false,
          retryAfter: null
        };
      }

      // Premium user with media: check daily limit
      let effectiveDailyLimit = entitlement.dailyLimit;
      if (!effectiveDailyLimit || effectiveDailyLimit <= 0) {
        effectiveDailyLimit = currentBusinessConfig.premiumMonthlyDailyLimit;
      }

      if (daily.totalQueriesCount >= effectiveDailyLimit) {
        observabilityState.blockedRequests += 1;
        observabilityState.dailyPremiumLimitReached += 1;
        observabilityState.premiumBlockedRequests = (observabilityState.premiumBlockedRequests || 0) + 1;

        const reply = 'Umefikia kikomo cha matumizi ya AI kwa siku. Kikomo chako kitaanza tena kulingana na kipindi cha matumizi kilichowekwa.';
        const limitResponse: AiLimitResponse = {
          allowed: false,
          entitlementTier: 'PREMIUM',
          packageType: entitlement.packageType,
          usageSource: 'PREMIUM',
          remainingTextQueries: 0,
          dailyLimit: effectiveDailyLimit,
          dailyUsed: daily.totalQueriesCount,
          reasonCode: 'PREMIUM_DAILY_LIMIT_REACHED',
          canUseAdReward: false,
          mediaAllowed: true,
          retryAfter: 'Kesho saa 00:00 EAT',
          reply
        };

        return {
          allowed: false,
          reasonCode: 'PREMIUM_DAILY_LIMIT_REACHED',
          entitlement,
          limitResponse,
          usageSource: 'PREMIUM',
          remainingTextQueries: 0,
          reply,
          entitlementTier: 'PREMIUM',
          packageType: entitlement.packageType,
          dailyLimit: effectiveDailyLimit,
          dailyUsed: daily.totalQueriesCount,
          canUseAdReward: false,
          mediaAllowed: true,
          retryAfter: 'Kesho saa 00:00 EAT'
        };
      }

      observabilityState.premiumAllowedRequests = (observabilityState.premiumAllowedRequests || 0) + 1;
      observabilityState.premiumMediaAllowed = (observabilityState.premiumMediaAllowed || 0) + 1;

      return {
        allowed: true,
        reasonCode: 'PREMIUM_ACTIVE',
        entitlement,
        usageSource: 'PREMIUM',
        remainingTextQueries: Math.max(0, effectiveDailyLimit - daily.totalQueriesCount),
        entitlementTier: 'PREMIUM',
        packageType: entitlement.packageType,
        dailyLimit: effectiveDailyLimit,
        dailyUsed: daily.totalQueriesCount,
        canUseAdReward: false,
        mediaAllowed: true,
        retryAfter: null
      };
    }

    // 3. Text Query Handling
    if (isPremiumActive) {
      let effectiveDailyLimit = entitlement.dailyLimit;
      if (!effectiveDailyLimit || effectiveDailyLimit <= 0) {
        effectiveDailyLimit = currentBusinessConfig.premiumMonthlyDailyLimit;
      }

      if (daily.totalQueriesCount >= effectiveDailyLimit) {
        observabilityState.blockedRequests += 1;
        observabilityState.dailyPremiumLimitReached += 1;
        observabilityState.premiumBlockedRequests = (observabilityState.premiumBlockedRequests || 0) + 1;

        const reply = 'Umefikia kikomo cha matumizi ya AI kwa siku. Kikomo chako kitaanza tena kulingana na kipindi cha matumizi kilichowekwa.';
        const limitResponse: AiLimitResponse = {
          allowed: false,
          entitlementTier: 'PREMIUM',
          packageType: entitlement.packageType,
          usageSource: 'PREMIUM',
          remainingTextQueries: 0,
          dailyLimit: effectiveDailyLimit,
          dailyUsed: daily.totalQueriesCount,
          reasonCode: 'PREMIUM_DAILY_LIMIT_REACHED',
          canUseAdReward: false,
          mediaAllowed: true,
          retryAfter: 'Kesho saa 00:00 EAT',
          reply
        };

        return {
          allowed: false,
          reasonCode: 'PREMIUM_DAILY_LIMIT_REACHED',
          entitlement,
          limitResponse,
          usageSource: 'PREMIUM',
          remainingTextQueries: 0,
          reply,
          entitlementTier: 'PREMIUM',
          packageType: entitlement.packageType,
          dailyLimit: effectiveDailyLimit,
          dailyUsed: daily.totalQueriesCount,
          canUseAdReward: false,
          mediaAllowed: true,
          retryAfter: 'Kesho saa 00:00 EAT'
        };
      }

      observabilityState.premiumAllowedRequests = (observabilityState.premiumAllowedRequests || 0) + 1;

      return {
        allowed: true,
        reasonCode: 'PREMIUM_ACTIVE',
        entitlement,
        usageSource: 'PREMIUM',
        remainingTextQueries: Math.max(0, effectiveDailyLimit - daily.totalQueriesCount),
        entitlementTier: 'PREMIUM',
        packageType: entitlement.packageType,
        dailyLimit: effectiveDailyLimit,
        dailyUsed: daily.totalQueriesCount,
        canUseAdReward: false,
        mediaAllowed: true,
        retryAfter: null
      };
    }

    // 4. Free Tier Text Allowance Check (Authoritative & Concurrency-Protected)
    let inFlightCount = 0;
    for (const [rId, res] of activeQuotaReservations.entries()) {
      if (res.userId === userId && rId !== requestId) {
        inFlightCount++;
      }
    }
    const effectiveUsed = freeUsed + inFlightCount;
    const freeRemaining = Math.max(0, freeLimit - effectiveUsed);

    console.log('[AI Quota] free_quota_checked', {
      userId,
      requestId,
      freeLimit,
      freeUsed: effectiveUsed,
      freeRemaining,
      requestType
    });

    if (effectiveUsed < freeLimit) {
      // Reserve slot immediately to protect against race conditions
      activeQuotaReservations.set(requestId, {
        userId,
        requestType,
        timestamp: Date.now()
      });

      const nextRemaining = Math.max(0, freeLimit - effectiveUsed - 1);

      console.log('[AI Quota] free_quota_allowed', {
        userId,
        requestId,
        freeLimit,
        freeUsed: effectiveUsed,
        freeRemaining: nextRemaining,
        requestType
      });

      return {
        allowed: true,
        reasonCode: 'FREE_QUOTA_AVAILABLE',
        entitlement,
        usageSource: 'FREE_ALLOWANCE',
        remainingTextQueries: nextRemaining,
        freeLimit,
        freeUsed: effectiveUsed,
        freeRemaining: Math.max(0, freeLimit - effectiveUsed),
        entitlementTier: 'FREE',
        packageType: 'NONE',
        dailyLimit: 0,
        dailyUsed: daily.totalQueriesCount,
        canUseAdReward: false,
        mediaAllowed: false,
        retryAfter: null
      };
    }

    if (summary.currentAdRewardRemaining > 0) {
      return {
        allowed: true,
        reasonCode: 'AD_REWARD_AVAILABLE',
        entitlement,
        usageSource: 'AD_REWARD',
        remainingTextQueries: summary.currentAdRewardRemaining,
        freeLimit,
        freeUsed: effectiveUsed,
        freeRemaining: 0,
        entitlementTier: 'FREE',
        packageType: 'NONE',
        dailyLimit: 0,
        dailyUsed: daily.totalQueriesCount,
        canUseAdReward: false,
        mediaAllowed: false,
        retryAfter: null
      };
    }

    // Quota exhausted!
    observabilityState.blockedRequests += 1;
    observabilityState.freeQuotaExhausted += 1;

    console.log('[AI Quota] free_quota_blocked', {
      userId,
      requestId,
      freeLimit,
      freeUsed: effectiveUsed,
      freeRemaining: 0,
      requestType,
      wasCached: false
    });

    const canUseAd = true;
    const reply =
      'Umefikia ukomo wa maswali ya AI. Tazama tangazo ili kupata maswali 5 zaidi, au tumia Premium kwa matumizi yasiyo na kikomo.';

    const limitResponse: AiLimitResponse = {
      allowed: false,
      entitlementTier: 'FREE',
      packageType: 'NONE',
      usageSource: 'FREE_ALLOWANCE',
      remainingTextQueries: 0,
      freeLimit,
      freeUsed: effectiveUsed,
      freeRemaining: 0,
      dailyLimit: 0,
      dailyUsed: daily.totalQueriesCount,
      reasonCode: 'FREE_QUOTA_EXHAUSTED',
      canUseAdReward: canUseAd,
      mediaAllowed: false,
      retryAfter: null,
      reply
    };

    return {
      allowed: false,
      reasonCode: 'FREE_QUOTA_EXHAUSTED',
      entitlement,
      limitResponse,
      usageSource: 'FREE_ALLOWANCE',
      remainingTextQueries: 0,
      freeLimit,
      freeUsed: effectiveUsed,
      freeRemaining: 0,
      reply,
      entitlementTier: 'FREE',
      packageType: 'NONE',
      dailyLimit: 0,
      dailyUsed: daily.totalQueriesCount,
      canUseAdReward: canUseAd,
      mediaAllowed: false,
      retryAfter: null
    };
  });
}

// ============================================================================
// 7. RECORDING USAGE EVENTS (TRANSACTIONAL & IDEMPOTENT)
// ============================================================================

export interface RecordUsageEventInput {
  userId: string;
  requestType: AiRequestType;
  inputType: AiInputType;
  cacheStatus: AiCacheStatus;
  modelProvider?: string;
  modelName?: string;
  inputTokens?: TokenCount;
  outputTokens?: TokenCount;
  totalTokens?: TokenCount;
  estimatedCost?: EstimatedCost;
  currency?: string;
  successStatus: 'SUCCESS' | 'FAILURE';
  errorType?: string;
  conversationId?: string;
  requestId: string;
  explicitUsageSource?: AiUsageSource;
}

export async function recordAiUsageEvent(input: RecordUsageEventInput): Promise<{
  event: AiUsageEvent;
  isDuplicate: boolean;
}> {
  return runWithUserLock(input.userId, async () => {
    activeQuotaReservations.delete(input.requestId);

    const dateKey = getServerDateKey();
    const daily = getOrCreateDailyUsage(input.userId, dateKey);
    const summary = getOrCreateUserSummary(input.userId);

    // 1. Idempotency & Replay Protection:
    // If this requestId was already processed, do NOT double-charge or create duplicate event
    if (daily.processedRequestIds.includes(input.requestId)) {
      const existing = Array.from(usageEventsStore.values()).find(
        (e) => e.userId === input.userId && e.requestId === input.requestId
      );
      console.log('[AI Quota] free_quota_replay_ignored', {
        userId: input.userId,
        requestId: input.requestId,
        freeLimit: currentBusinessConfig.freeTextInitialLimit,
        freeUsed: summary.lifetimeFreeAllowanceUsed,
        freeRemaining: summary.currentFreeAllowanceRemaining,
        requestType: input.requestType,
        wasCached: input.cacheStatus === 'HIT'
      });
      if (existing) {
        return { event: existing, isDuplicate: true };
      }
    }

    const isMedia = input.requestType !== 'TEXT_QUERY';
    const isPremiumUser = Boolean(
      summary.premiumPackage && summary.premiumExpiresAt && new Date(summary.premiumExpiresAt) > new Date()
    );

    // 2. Authoritative Usage Source determination
    let usageSource: AiUsageSource = 'SYSTEM';
    let entitlementSource: AiEntitlementSource = summary.activeEntitlement;

    if (input.cacheStatus === 'HIT') {
      usageSource = 'CACHE';
    } else if (input.explicitUsageSource) {
      usageSource = input.explicitUsageSource;
    } else if (isPremiumUser) {
      usageSource = 'PREMIUM';
      entitlementSource = summary.activeEntitlement;
    } else if (summary.currentFreeAllowanceRemaining > 0 && !isMedia) {
      usageSource = 'FREE_ALLOWANCE';
      entitlementSource = 'FREE_TIER';
    } else if (summary.currentAdRewardRemaining > 0 && !isMedia) {
      usageSource = 'AD_REWARD';
      entitlementSource = 'AD_REWARD';
    } else {
      usageSource = 'SYSTEM';
      entitlementSource = 'UNKNOWN';
    }

    // 3. Token Accounting & Cost computation
    const inTokens: TokenCount = input.inputTokens !== undefined ? input.inputTokens : 'UNKNOWN';
    const outTokens: TokenCount = input.outputTokens !== undefined ? input.outputTokens : 'UNKNOWN';
    const totTokens: TokenCount = input.totalTokens !== undefined ? input.totalTokens : 'UNKNOWN';
    const provider = input.modelProvider || 'google-gemini';
    const model = input.modelName || 'gemini-3.1-flash-lite';
    const calculatedCost =
      input.estimatedCost !== undefined
        ? input.estimatedCost
        : calculateEstimatedCost(provider, model, inTokens, outTokens);

    const usageEventId = `usevt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const nowIso = new Date().toISOString();

    const event: AiUsageEvent = {
      usageEventId,
      userId: input.userId,
      requestType: input.requestType,
      inputType: input.inputType,
      usageSource,
      timestamp: nowIso,
      dateKey,
      modelProvider: provider,
      modelName: model,
      inputTokens: inTokens,
      outputTokens: outTokens,
      totalTokens: totTokens,
      estimatedCost: calculatedCost,
      currency: input.currency || 'USD',
      cacheStatus: input.cacheStatus,
      entitlementSource,
      successStatus: input.successStatus,
      errorType: input.errorType,
      conversationId: input.conversationId,
      requestId: input.requestId
    };

    // Store event in-memory
    usageEventsStore.set(usageEventId, event);

    // 4. Update Daily & Lifetime Accounting
    daily.totalQueriesCount += 1;
    if (isMedia) {
      daily.mediaQueriesCount += 1;
      summary.lifetimeMediaQueries += 1;
    } else {
      daily.textQueriesCount += 1;
      summary.lifetimeTextQueries += 1;
    }

    if (usageSource === 'CACHE') {
      daily.cacheHitsCount += 1;
      summary.lifetimeCacheHits += 1;
      // Per V1.8B Quota Rules: Free user getting answer from cache consumes 1 of their free queries
      if (!isPremiumUser && !isMedia && input.successStatus === 'SUCCESS') {
        daily.freeAllowanceUsed += 1;
        summary.lifetimeFreeAllowanceUsed += 1;
        summary.currentFreeAllowanceRemaining = Math.max(
          0,
          currentBusinessConfig.freeTextInitialLimit - summary.lifetimeFreeAllowanceUsed
        );
        observabilityState.freeAllowanceUsage += 1;
      }
    } else if (usageSource === 'FREE_ALLOWANCE') {
      daily.freeAllowanceUsed += 1;
      summary.lifetimeFreeAllowanceUsed += 1;
      summary.currentFreeAllowanceRemaining = Math.max(
        0,
        currentBusinessConfig.freeTextInitialLimit - summary.lifetimeFreeAllowanceUsed
      );
      observabilityState.freeAllowanceUsage += 1;
    } else if (usageSource === 'AD_REWARD') {
      daily.adRewardsUsed += 1;
      summary.lifetimeAdRewardsUsed += 1;
      summary.currentAdRewardRemaining = Math.max(
        0,
        summary.lifetimeAdRewardsGranted - summary.lifetimeAdRewardsUsed
      );
      observabilityState.adRewardUsage += 1;
    } else if (usageSource === 'PREMIUM') {
      daily.premiumQueriesUsed += 1;
      summary.lifetimePremiumQueries += 1;
      observabilityState.premiumUsage += 1;
    }

    daily.lastUpdated = nowIso;
    daily.processedRequestIds.push(input.requestId);
    if (daily.processedRequestIds.length > 500) {
      daily.processedRequestIds.shift();
    }
    // Release in-flight quota reservation now that it is committed to storage
    activeQuotaReservations.delete(input.requestId);

    console.log('[AI Quota] free_quota_recorded', {
      userId: input.userId,
      requestId: input.requestId,
      freeLimit: currentBusinessConfig.freeTextInitialLimit,
      freeUsed: summary.lifetimeFreeAllowanceUsed,
      freeRemaining: summary.currentFreeAllowanceRemaining,
      requestType: input.requestType,
      wasCached: input.cacheStatus === 'HIT',
      executionMode: input.cacheStatus === 'HIT' ? 'CACHE_HIT' : 'FRESH_API'
    });

    // 5. Update Observability Metrics
    observabilityState.totalAiRequests += 1;
    observabilityState.allowedRequests += 1;
    if (isMedia) {
      observabilityState.mediaRequests += 1;
    } else {
      observabilityState.textRequests += 1;
    }

    if (input.cacheStatus === 'HIT') {
      observabilityState.cacheHits += 1;
    } else if (input.cacheStatus === 'MISS') {
      observabilityState.cacheMisses += 1;
    } else if (input.cacheStatus === 'BYPASS') {
      observabilityState.cacheBypasses += 1;
    } else if (input.cacheStatus === 'INVALIDATED') {
      observabilityState.cacheInvalidated += 1;
    }

    if (input.cacheStatus !== 'HIT') {
      observabilityState.apiCalls += 1;
    }

    if (input.successStatus === 'FAILURE') {
      observabilityState.failedRequests += 1;
    }

    if (typeof totTokens === 'number') {
      observabilityState.totalTokensRecorded += totTokens;
      observabilityState.tokensRecordedCount += 1;
    } else {
      observabilityState.unknownTokenRequests += 1;
    }

    if (typeof calculatedCost === 'number') {
      observabilityState.estimatedTotalCostUsd += calculatedCost;
    } else {
      observabilityState.unknownCostRequests += 1;
    }

    savePersistedUsageStore();

    return { event, isDuplicate: false };
  });
}

// ============================================================================
// 8. AD REWARD AUTHORITATIVE HOOK (V1.8A FOUNDATION)
// ============================================================================

/**
 * Server-authoritative hook for granting ad rewards.
 * Rejects client attempts to self-grant arbitrary rewards.
 */
export async function grantAdRewardAllowance(
  request: AdRewardGrantRequest
): Promise<AdRewardGrantResult> {
  const { userId, rewardToken, provider } = request;

  // Authoritative validation check:
  // Client cannot send arbitrary payload. Token must be verifiable.
  if (!rewardToken || typeof rewardToken !== 'string' || rewardToken.trim().length < 10) {
    return {
      success: false,
      userId,
      queriesGranted: 0,
      newAdRewardRemaining: 0,
      error: 'Token ya uthibitisho wa tangazo si sahihi (Invalid ad reward proof).'
    };
  }

  // Check known authorized provider proof structure (foundation for V1.9)
  if (!provider || provider !== 'AUTHORIZED_AD_PROVIDER') {
    return {
      success: false,
      userId,
      queriesGranted: 0,
      newAdRewardRemaining: 0,
      error: 'Mtoa tangazo hajaidhinishwa (Unauthorized advertising provider).'
    };
  }

  return runWithUserLock(userId, async () => {
    const summary = getOrCreateUserSummary(userId);

    // Replay protection: Prevent duplicate reward redemptions
    if (redeemedRewardTokens.has(rewardToken.trim())) {
      return {
        success: false,
        userId,
        queriesGranted: 0,
        newAdRewardRemaining: summary.currentAdRewardRemaining,
        error: 'Token ya uthibitisho wa tangazo imekwisha tumika (Ad reward token already redeemed).'
      };
    }

    redeemedRewardTokens.add(rewardToken.trim());
    const queriesToAdd = currentBusinessConfig.adRewardTextQueries; // Exactly 5 queries

    summary.lifetimeAdRewardsGranted += queriesToAdd;
    summary.currentAdRewardRemaining =
      summary.lifetimeAdRewardsGranted - summary.lifetimeAdRewardsUsed;

    const dateKey = getServerDateKey();
    const daily = getOrCreateDailyUsage(userId, dateKey);
    daily.adRewardsGranted += queriesToAdd;
    daily.lastUpdated = new Date().toISOString();

    savePersistedUsageStore();

    return {
      success: true,
      userId,
      queriesGranted: queriesToAdd,
      newAdRewardRemaining: summary.currentAdRewardRemaining
    };
  });
}

/**
 * V1.9A — Governed Authoritative Ad Reward Grant Function
 *
 * Called strictly by the provider-neutral AdService after successful server-side
 * verification of an ad reward token/proof.
 *
 * Guarantees:
 * 1. Exactly adds `units` (governed server-side, default 5) text queries to the Free user's allowance.
 * 2. Does NOT modify Premium entitlement, tier, or expiration.
 * 3. Does NOT grant media access.
 * 4. Integrates directly with the single source-of-truth usage store.
 */
export async function grantAuthoritativeAdRewardAllowance(
  userId: string,
  units: number = 5,
  reason?: string
): Promise<{
  success: boolean;
  userId: string;
  queriesGranted: number;
  newAdRewardRemaining: number;
  error?: string;
}> {
  return runWithUserLock(userId, async () => {
    const summary = getOrCreateUserSummary(userId);

    // Server enforces governed unit amount (fallback to 5)
    const queriesToAdd = units > 0 ? units : currentBusinessConfig.adRewardTextQueries;

    summary.lifetimeAdRewardsGranted += queriesToAdd;
    summary.currentAdRewardRemaining =
      summary.lifetimeAdRewardsGranted - summary.lifetimeAdRewardsUsed;

    const dateKey = getServerDateKey();
    const daily = getOrCreateDailyUsage(userId, dateKey);
    daily.adRewardsGranted += queriesToAdd;
    daily.lastUpdated = new Date().toISOString();

    savePersistedUsageStore();

    return {
      success: true,
      userId,
      queriesGranted: queriesToAdd,
      newAdRewardRemaining: summary.currentAdRewardRemaining
    };
  });
}

// ============================================================================
// 9. OBSERVABILITY & ADMIN METRICS EXPORT
// ============================================================================

export function getAiObservabilityMetrics(): AiObservabilityMetrics {
  // Count entitlements by status
  let statusActiveCount = 0;
  let statusExpiredCount = 0;
  let statusCancelledCount = 0;
  let statusRevokedCount = 0;
  let statusSuspendedCount = 0;
  let statusPendingCount = 0;

  for (const ent of aiEntitlementsStore.values()) {
    if (ent.status === 'ACTIVE') statusActiveCount++;
    else if (ent.status === 'EXPIRED') statusExpiredCount++;
    else if (ent.status === 'CANCELLED') statusCancelledCount++;
    else if (ent.status === 'REVOKED') statusRevokedCount++;
    else if (ent.status === 'SUSPENDED') statusSuspendedCount++;
    else if (ent.status === 'PENDING') statusPendingCount++;
  }

  return {
    ...observabilityState,
    statusActiveCount,
    statusExpiredCount,
    statusCancelledCount,
    statusRevokedCount,
    statusSuspendedCount,
    statusPendingCount
  };
}

export function incrementAiObservabilityMetric(
  metricName: keyof AiObservabilityMetrics,
  delta: number = 1
): void {
  if (typeof (observabilityState as any)[metricName] === 'number') {
    (observabilityState as any)[metricName] += delta;
  }
}

export function getUserUsageEvents(userId: string): AiUsageEvent[] {
  return Array.from(usageEventsStore.values())
    .filter((e) => e.userId === userId)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export function getAllUsageEvents(limitCount: number = 100): AiUsageEvent[] {
  return Array.from(usageEventsStore.values())
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limitCount);
}

export function getAllEntitlementRecords(): AiEntitlementRecord[] {
  return Array.from(aiEntitlementsStore.values())
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

// Helper for test cleanup
export function resetUsageAccountingForTesting(): void {
  usageEventsStore.clear();
  userDailyUsageStore.clear();
  userSummaryStore.clear();
  aiEntitlementsStore.clear();
  redeemedRewardTokens.clear();
  userLocks.clear();
  Object.assign(observabilityState, {
    totalAiRequests: 0,
    textRequests: 0,
    mediaRequests: 0,
    allowedRequests: 0,
    blockedRequests: 0,
    freeAllowanceUsage: 0,
    adRewardUsage: 0,
    premiumUsage: 0,
    mediaBlocked: 0,
    dailyPremiumLimitReached: 0,
    freeQuotaExhausted: 0,
    entitlementUnavailable: 0,
    cacheHits: 0,
    cacheMisses: 0,
    cacheBypasses: 0,
    cacheInvalidated: 0,
    apiCalls: 0,
    failedRequests: 0,
    totalTokensRecorded: 0,
    tokensRecordedCount: 0,
    unknownTokenRequests: 0,
    estimatedTotalCostUsd: 0,
    unknownCostRequests: 0,
    entitlementResolutions: 0,
    premiumAllowedRequests: 0,
    premiumBlockedRequests: 0,
    premiumMediaAllowed: 0,
    planSelectionAttempts: 0,
    paymentIntentsCreated: 0,
    entitlementActivations: 0,
    entitlementExpirations: 0
  });
  currentBusinessConfig = { ...DEFAULT_AI_BUSINESS_CONFIG };
}

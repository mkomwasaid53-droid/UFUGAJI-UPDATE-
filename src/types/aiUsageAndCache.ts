/**
 * Ufugaji Update — V1.8A AI Usage, Cost & Answer Cache Foundation Types
 *
 * Defines strictly typed structures for:
 * 1. AI Usage Events & Accounting
 * 2. Request & Input Classification
 * 3. Daily & Lifetime Usage Tracking
 * 4. Free, Ad-Reward, and Premium Entitlements
 * 5. Cost Metadata & Token Accounting (Unknown vs. Measured)
 * 6. Categorized Answer Cache & Invalidation
 * 7. Observability & Operational Metrics
 */

// ============================================================================
// 1. REQUEST & INPUT CLASSIFICATION
// ============================================================================

export type AiRequestType =
  | 'TEXT_QUERY'
  | 'IMAGE_QUERY'
  | 'VIDEO_QUERY'
  | 'TEXT_WITH_IMAGE'
  | 'TEXT_WITH_VIDEO';

export type AiInputType =
  | 'TEXT'
  | 'IMAGE'
  | 'VIDEO'
  | 'TEXT_IMAGE'
  | 'TEXT_VIDEO';

// Track how an AI request was consumed
export type AiUsageSource =
  | 'FREE_ALLOWANCE'
  | 'AD_REWARD'
  | 'PREMIUM'
  | 'CACHE' // CACHE is NOT an API usage event
  | 'SYSTEM'
  | 'UNKNOWN';

export type AiEntitlementTier = 'FREE' | 'PREMIUM';

export type AiPackageType = 'NONE' | 'WEEKLY' | 'MONTHLY' | 'ANNUAL';

export type AiEntitlementStatus =
  | 'ACTIVE'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'REVOKED'
  | 'SUSPENDED'
  | 'PENDING'
  | 'UNAVAILABLE';

export type AiEntitlementSourceType =
  | 'DEFAULT_FREE'
  | 'PREPAID'
  | 'PAYMENT'
  | 'SUBSCRIPTION'
  | 'AD_REWARD'
  | 'ADMIN_GRANT'
  | 'SYSTEM'
  | 'PROMOTIONAL';

export interface AiPendingPlanInfo {
  planType: AiPackageType;
  paymentStatus: 'PENDING' | 'SUCCESS' | 'FAILED';
  intentId?: string;
  selectedAt?: string;
}

export interface AiEntitlementRecord {
  entitlementId: string;
  userId: string;
  tier: AiEntitlementTier;
  status: AiEntitlementStatus;
  packageType: AiPackageType;
  planType?: AiPackageType;
  source: AiEntitlementSourceType;
  startedAt: string; // ISO 8601
  expiresAt: string | null; // ISO 8601 or null
  dailyLimit: number;
  externalReference?: string | null;
  pendingPlan?: AiPackageType | AiPendingPlanInfo | null;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, any>;
}

// ============================================================================
// 1B. V1.8C PREMIUM PRODUCT CATALOG & PAYMENT ABSTRACTION TYPES
// ============================================================================

export type AiPremiumPlanType = 'WEEKLY' | 'MONTHLY' | 'ANNUAL';
export type AiPremiumPlanStatus = 'ACTIVE' | 'INACTIVE';

export interface AiPremiumPlan {
  planId: string;
  planType: AiPremiumPlanType;
  displayName: string;
  description: string;
  billingPeriod: AiPremiumPlanType;
  durationDays: number; // Duration in days (7, 30, 365)
  dailyAiLimit: number; // e.g. 50, 100, 200
  mediaAccess: boolean; // true for all Premium plans
  currency: string; // 'TZS' or 'TSh'
  indicativePrice?: number; // Configurable metadata, NOT hardcoded in business logic
  status: AiPremiumPlanStatus;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

export type PaymentStatus =
  | 'CREATED'
  | 'PENDING'
  | 'PROCESSING'
  | 'SUCCESS'
  | 'FAILED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'UNKNOWN';

export interface PaymentIntent {
  intentId: string;
  userId: string;
  planId: string;
  planType: AiPremiumPlanType;
  amount: number | null; // Configurable metadata, not locked commercial price
  currency: string; // 'TZS'
  status: PaymentStatus;
  provider: string; // Neutral abstraction
  paymentReference: string;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string; // ISO 8601
  metadata?: Record<string, any>;
}

/**
 * V1.8D — Provider-Neutral Payment Transaction Record
 * Extends and pairs with PaymentIntent for authoritative server reconciliation.
 */
export interface PaymentTransaction {
  paymentId: string;
  externalId: string; // Unique internal externalId (e.g. UFU-PAY-...) passed to provider as external_id
  userId: string;
  planId: string;
  planType: AiPremiumPlanType;
  paymentIntentId: string;
  provider: string;
  providerTransactionReference: string | null;
  providerUuid?: string | null; // PlusPesa data.uuid
  customerPhone?: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  failureReason?: string | null;
  rawProviderReference?: string | null;
  entitlementId?: string | null; // Connected when SUCCESS triggers authoritative activation
  metadata?: Record<string, any>;
}

export type PaymentAuditEventType =
  | 'PAYMENT_CREATED'
  | 'PAYMENT_PROCESSING'
  | 'PAYMENT_SUCCESS'
  | 'PAYMENT_FAILED'
  | 'PAYMENT_CANCELLED'
  | 'PAYMENT_EXPIRED'
  | 'PAYMENT_WEBHOOK_RECEIVED'
  | 'PAYMENT_WEBHOOK_SIGNATURE_FAILED'
  | 'PAYMENT_VALIDATION_FAILED'
  | 'PAYMENT_VERIFICATION_FAILED'
  | 'PAYMENT_DUPLICATE_CALLBACK'
  | 'PAYMENT_STATUS_POLLED'
  | 'PAYMENT_PROVIDER_ERROR'
  | 'PREMIUM_ACTIVATED_FROM_PAYMENT';

export interface PaymentAuditEvent {
  eventId: string;
  paymentId: string;
  userId: string;
  eventType: PaymentAuditEventType;
  timestamp: string;
  provider: string;
  providerReference: string | null;
  planId?: string;
  correlationId?: string;
  safeMetadata?: Record<string, any>;
}

export interface PaymentObservabilityMetrics {
  paymentCreationCount: number;
  paymentPendingCount: number;
  paymentProcessingCount: number;
  paymentSuccessCount: number;
  paymentFailureCount: number;
  paymentCancelledCount: number;
  paymentExpiredCount: number;
  paymentVerificationFailures: number;
  paymentDuplicateCallbacks: number;
  premiumActivationsFromPayment: number;
  providerErrors: number;
}

export interface UserPremiumStatusResponse {
  tier: AiEntitlementTier;
  planType: AiPackageType;
  status: AiEntitlementStatus;
  startedAt: string | null;
  expiresAt: string | null;
  dailyLimit: number;
  dailyUsed: number;
  dailyRemaining: number;
  mediaAllowed: boolean;
  entitlementSource: string;
  pendingPlan: AiPackageType | AiPendingPlanInfo | any | null;
  reasonCode: string;
  isPremiumActive?: boolean;
  daysRemaining?: number | null;
  freeLimit?: number;
  freeUsed?: number;
  freeRemaining?: number;
  canUseAdReward?: boolean;
}

export type AiUsageState =
  | 'FREE_QUOTA_AVAILABLE'
  | 'FREE_QUOTA_EXHAUSTED'
  | 'AD_REWARD_AVAILABLE'
  | 'PREMIUM_ACTIVE'
  | 'PREMIUM_DAILY_LIMIT_REACHED'
  | 'PREMIUM_EXPIRED'
  | 'MEDIA_ACCESS_DENIED'
  | 'ENTITLEMENT_UNAVAILABLE';

export interface AiLimitResponse {
  allowed: boolean;
  entitlementTier: AiEntitlementTier;
  packageType: AiPackageType;
  usageSource: AiUsageSource;
  remainingTextQueries: number;
  freeLimit?: number;
  freeUsed?: number;
  freeRemaining?: number;
  dailyLimit: number;
  dailyUsed: number;
  reasonCode: AiUsageState;
  canUseAdReward: boolean;
  mediaAllowed: boolean;
  retryAfter?: string | null;
  reply: string;
  error?: string;
}

export type AiEntitlementSource =
  | 'FREE_TIER'
  | 'AD_REWARD'
  | 'PREMIUM_WEEKLY'
  | 'PREMIUM_MONTHLY'
  | 'PREMIUM_ANNUAL'
  | 'SYSTEM_INTERNAL'
  | 'UNKNOWN';

export type AiCacheStatus =
  | 'HIT'
  | 'MISS'
  | 'BYPASS'
  | 'INVALIDATED';

// Do not fabricate token counts or costs: represent unknown explicitly
export type TokenCount = number | 'UNKNOWN';
export type EstimatedCost = number | 'UNKNOWN';

// ============================================================================
// 2. USAGE EVENT MODEL
// ============================================================================

export interface AiUsageEvent {
  usageEventId: string;
  userId: string;
  requestType: AiRequestType;
  inputType: AiInputType;
  usageSource: AiUsageSource;
  timestamp: string; // ISO 8601 string
  dateKey: string; // Server-authoritative YYYY-MM-DD
  modelProvider: string; // e.g., 'google-gemini'
  modelName: string; // e.g., 'gemini-3.1-flash-lite', 'gemini-3.5-flash', etc.
  inputTokens: TokenCount;
  outputTokens: TokenCount;
  totalTokens: TokenCount;
  estimatedCost: EstimatedCost;
  currency: string; // 'USD' | 'TZS'
  cacheStatus: AiCacheStatus;
  entitlementSource: AiEntitlementSource;
  successStatus: 'SUCCESS' | 'FAILURE';
  errorType?: string;
  conversationId?: string;
  requestId: string; // Idempotency key
}

// ============================================================================
// 3. DAILY & LIFETIME ACCOUNTING MODEL
// ============================================================================

export interface AiUserDailyUsage {
  userId: string;
  dateKey: string; // Server-authoritative YYYY-MM-DD
  totalQueriesCount: number;
  textQueriesCount: number;
  mediaQueriesCount: number;
  freeAllowanceUsed: number;
  adRewardsGranted: number;
  adRewardsUsed: number;
  premiumQueriesUsed: number;
  cacheHitsCount: number;
  lastUpdated: string;
  processedRequestIds: string[]; // Window of processed request IDs for idempotency
}

export interface AiUserUsageSummary {
  userId: string;
  lifetimeTextQueries: number;
  lifetimeMediaQueries: number;
  lifetimeFreeAllowanceUsed: number;
  lifetimeAdRewardsGranted: number;
  lifetimeAdRewardsUsed: number;
  lifetimePremiumQueries: number;
  lifetimeCacheHits: number;
  currentFreeAllowanceRemaining: number;
  currentAdRewardRemaining: number;
  activeEntitlement: AiEntitlementSource;
  premiumPackage?: 'WEEKLY' | 'MONTHLY' | 'ANNUAL' | null;
  premiumExpiresAt?: string | null;
}

// ============================================================================
// 4. COST METADATA MODEL
// ============================================================================

export interface AiCostConfiguration {
  configId: string;
  provider: string; // 'google-gemini'
  model: string; // 'gemini-3.1-flash-lite', etc.
  inputCostPerUnit: number; // Cost in currency per unitTokens (e.g. 1M tokens)
  outputCostPerUnit: number;
  unitTokens: number; // e.g., 1000000 (1 million tokens)
  currency: string; // 'USD'
  effectiveFrom: string;
  effectiveTo?: string | null;
  active: boolean;
}

// Global business configuration foundation (configurable, not hardcoded in UI)
export interface AiBusinessConfig {
  freeTextInitialLimit: number; // Default: 10
  adRewardTextQueries: number; // Default: 5
  premiumWeeklyDailyLimit: number; // Configurable daily limit for weekly pack
  premiumMonthlyDailyLimit: number; // Configurable daily limit for monthly pack
  premiumAnnualDailyLimit: number; // Configurable daily limit for annual pack
  mediaAiAllowedForFree: boolean; // Default: false
  answerCacheEnabled: boolean; // Default: true
  knowledgeBaseVersion: string; // Default: '1.0.0'
  defaultCacheTtlMs: number; // Default: 7 days
}

// ============================================================================
// 5. ANSWER CACHE MODEL & CATEGORIES
// ============================================================================

export type AiCacheCategory =
  | 'GLOBAL_GENERAL_KNOWLEDGE'
  | 'PERSONALIZED_CONTEXTUAL'
  | 'MARKETPLACE_DYNAMIC'
  | 'VISUAL_ANALYSIS'
  | 'DAKTARI_CONTEXTUAL';

export interface AiAnswerCacheRecord {
  cacheId: string;
  cacheType: AiCacheCategory;
  normalizedKey: string;
  language: string; // 'sw' | 'en'
  questionIntent?: string;
  answerText: string;
  sourceType: 'GEMINI_API' | 'LOCAL_EXPERT_SYSTEM';
  knowledgeVersion: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  validationStatus: 'VALID' | 'INVALID' | 'FLAGGED';
  safetyStatus: 'PASSED' | 'FAILED' | 'PENDING';
  modelProvider: string;
  modelName: string;
  usageMetadata?: {
    hitCount: number;
    lastHitAt?: string;
  };
}

export interface CacheLookupResult {
  status: AiCacheStatus;
  record?: AiAnswerCacheRecord;
  reason?: string;
}

export interface CacheEligibilityAssessment {
  eligible: boolean;
  category: AiCacheCategory;
  reason: string;
}

// ============================================================================
// 6. REWARD HOOK INTERFACE
// ============================================================================

export interface AdRewardGrantRequest {
  userId: string;
  rewardToken: string; // Authoritative proof token from advertising server
  provider: string; // e.g., 'AUTHORIZED_AD_PROVIDER'
  timestamp: number;
}

export interface AdRewardGrantResult {
  success: boolean;
  userId: string;
  queriesGranted: number;
  newAdRewardRemaining: number;
  error?: string;
}

// ============================================================================
// 7. OBSERVABILITY & ADMIN METRICS
// ============================================================================

export interface AiObservabilityMetrics {
  totalAiRequests: number;
  textRequests: number;
  mediaRequests: number;
  allowedRequests: number;
  blockedRequests: number;
  freeAllowanceUsage: number;
  adRewardUsage: number;
  premiumUsage: number;
  mediaBlocked: number;
  dailyPremiumLimitReached: number;
  freeQuotaExhausted: number;
  entitlementUnavailable: number;
  cacheHits: number;
  cacheMisses: number;
  cacheBypasses: number;
  cacheInvalidated: number;
  apiCalls: number;
  failedRequests: number;
  totalTokensRecorded: number;
  tokensRecordedCount: number;
  unknownTokenRequests: number;
  estimatedTotalCostUsd: number;
  unknownCostRequests: number;
  // V1.8C Premium & Lifecycle Observability Metrics
  entitlementResolutions: number;
  premiumAllowedRequests: number;
  premiumBlockedRequests: number;
  premiumMediaAllowed: number;
  planSelectionAttempts: number;
  paymentIntentsCreated: number;
  entitlementActivations: number;
  entitlementExpirations: number;
  statusActiveCount?: number;
  statusExpiredCount?: number;
  statusCancelledCount?: number;
  statusRevokedCount?: number;
  statusSuspendedCount?: number;
  statusPendingCount?: number;
}

// ============================================================================
// 8. V1.9A — ADVERTISING & REWARD TYPES
// ============================================================================

export type AdType = 'REWARDED_AD';

export type AdRewardStatus =
  | 'PENDING'
  | 'VERIFIED'
  | 'REJECTED'
  | 'CONSUMED'
  | 'EXPIRED';

export type AdAuditEventType =
  | 'AD_REWARD_REQUESTED'
  | 'AD_REWARD_STARTED'
  | 'AD_PRESENTED'
  | 'AD_COMPLETED'
  | 'AD_DISMISSED'
  | 'AD_FAILED'
  | 'AD_REWARD_VERIFICATION_RECEIVED'
  | 'AD_REWARD_VERIFIED'
  | 'AD_REWARD_GRANTED'
  | 'AD_REWARD_REJECTED'
  | 'AD_REWARD_DUPLICATE'
  | 'AD_REWARD_EXPIRED'
  | 'FREE_QUOTA_REWARDED'
  | 'AD_PROVIDER_ERROR'
  | 'AD_CONFIGURATION_CHANGED'
  | 'AD_MODE_CHANGED'
  | 'AD_PLATFORM_CHANGED'
  | 'AD_PRODUCTION_ENABLED'
  | 'AD_PRODUCTION_DISABLED'
  | 'AD_PRODUCTION_BLOCKED'
  | 'AD_READINESS_CHECKED'
  | 'AD_PROVIDER_INITIALIZED'
  | 'AD_REWARD_ELIGIBILITY_CHECKED'
  | 'AD_REWARD_VERIFICATION_STARTED'
  | 'AD_CONSENT_CHANGED';

// ============================================================================
// 9. V1.9B & V1.9C — AD PROVIDER MODES, COMPLIANCE & READINESS TYPES
// ============================================================================

export type AdProviderMode = 'MOCK' | 'TEST' | 'PRODUCTION';

export type AdPlatform = 'WEB' | 'ANDROID';

export type AdProviderType =
  | 'MOCK_REWARDED'
  | 'GOOGLE_AD_MANAGER_WEB'
  | 'GOOGLE_ADMOB_ANDROID';

export type AdPresentationLifecycleState =
  | 'AD_REQUESTED'
  | 'AD_LOADING'
  | 'AD_LOADED'
  | 'AD_PRESENTED'
  | 'AD_COMPLETED'
  | 'AD_DISMISSED'
  | 'AD_FAILED'
  | 'REWARD_PENDING_VERIFICATION'
  | 'REWARD_VERIFIED'
  | 'REWARD_GRANTED'
  | 'REWARD_REJECTED'
  | 'REWARD_DUPLICATE';

export type AdFailureState =
  | 'AD_PRODUCTION_NOT_READY'
  | 'AD_PROVIDER_NOT_CONFIGURED'
  | 'AD_PLATFORM_MISMATCH'
  | 'AD_PLATFORM_PROVIDER_MISMATCH'
  | 'AD_CONSENT_REQUIRED'
  | 'AD_CONSENT_DENIED'
  | 'AD_PROVIDER_UNAVAILABLE'
  | 'AD_PRODUCTION_DISABLED'
  | 'AD_PRODUCTION_PAUSED'
  | 'AD_PROVIDER_ERROR'
  | 'AD_REWARD_VERIFICATION_FAILED'
  | 'AD_REWARD_DUPLICATE'
  | 'AD_REWARD_EXPIRED'
  | 'AD_UNSUPPORTED_AD_TYPE'
  | 'AD_REWARD_ALREADY_CLAIMED'
  | 'REWARDED_AD_UNAVAILABLE'
  | 'WEB_REWARDED_NO_FILL'
  | 'GAM_TEST_NOT_CONFIGURED'
  | 'GAM_TEST_UNAVAILABLE'
  | 'NOT_ELIGIBLE'
  | 'USER_MISMATCH';

export type AdReadinessLifecycleStage =
  | 'IMPLEMENTED'
  | 'CONFIGURED'
  | 'COMPLIANT'
  | 'PRODUCTION_READY'
  | 'PRODUCTION_ENABLED';

export type ComplianceCheckName =
  | 'PRIVACY_POLICY_URL'
  | 'TERMS_URL'
  | 'CONTACT_PAGE_URL'
  | 'DEVELOPER_WEBSITE'
  | 'APP_STORE_LISTING'
  | 'APP_ADS_TXT_STATUS'
  | 'AD_PROVIDER_CONFIGURATION'
  | 'TEST_AD_CONFIGURATION'
  | 'PRODUCTION_AD_CONFIGURATION'
  | 'CONSENT_CONFIGURATION'
  | 'PRODUCTION_AD_ENABLEMENT';

export type ComplianceCheckStatus = 'READY' | 'MISSING' | 'NOT_APPLICABLE' | 'PENDING';

export type AppAdsTxtStatus = 'NOT_CONFIGURED' | 'PENDING' | 'READY';

export type StorePublicationStatus = 'NOT_PUBLISHED' | 'TESTING' | 'PUBLISHED' | 'UNKNOWN';

export type UserConsentStatus = 'UNKNOWN' | 'REQUIRED' | 'GRANTED' | 'DENIED';

export interface AdComplianceCheckItem {
  id: ComplianceCheckName;
  label: string;
  status: ComplianceCheckStatus;
  description: string;
  value?: string | null;
  linkUrl?: string;
  requiredForProduction: boolean;
}

export interface AdStoreConfig {
  packageName: string;
  playStoreUrl: string;
  publicationStatus: StorePublicationStatus;
}

export interface AdWebConfig {
  productionUrl: string;
  publicationStatus: StorePublicationStatus;
}

export interface AdComplianceConfig {
  privacyPolicyUrl: string;
  termsUrl: string;
  contactPageUrl: string;
  developerWebsiteUrl: string;
  appAdsTxtUrl: string;
  appAdsTxtStatus: AppAdsTxtStatus;
  lastAppAdsTxtVerification?: string | null;
  android: AdStoreConfig;
  web: AdWebConfig;
  consentRequired: boolean;
  defaultConsentStatus: UserConsentStatus;
}

export interface AdSettingsState {
  providerName: 'MOCK_REWARDED_AD' | 'ADMOB' | string;
  platform: AdPlatform;
  mode: AdProviderMode;
  productionEnabled: boolean;
  rewardType: 'REWARDED';
  rewardUnits: number; // strictly read-only: 5
  testAdConfigured: boolean;
  productionAdConfigured: boolean;
  complianceReady: boolean;
  providerReady: boolean;
  productionSafetyLocked: boolean;
  overallReadiness: 'READY_FOR_PRODUCTION' | 'NOT_READY_FOR_PRODUCTION';
  lifecycleStage: AdReadinessLifecycleStage;
  lifecycleBreakdown: {
    isImplemented: boolean;
    isConfigured: boolean;
    isCompliant: boolean;
    isProductionReady: boolean;
    isProductionEnabled: boolean;
    implemented?: boolean;
    configured?: boolean;
    compliant?: boolean;
    productionReady?: boolean;
    productionEnabled?: boolean;
  };
  supportedPlatforms: AdPlatform[];
  platformCompatible: boolean;
  productionAdUnitMasked: string;
  testAdUnitMasked?: string;
  failingSafetyGateConditions?: string[];
  readinessDisclaimer: string;
}

export interface AdProductionSafetyGateResult {
  eligible: boolean;
  reason?: string;
  errorCode?: AdFailureState;
  failingConditions?: string[];
}

export interface AdRewardRecord {
  rewardId: string;
  userId: string;
  adProvider: string;
  adType: AdType;
  providerRewardId: string;
  providerTransactionId: string;
  rewardUnits: number;
  status: AdRewardStatus;
  verifiedAt?: string | null;
  createdAt: string;
  expiresAt: string;
  requestId?: string;
  metadata?: Record<string, any>;
  rejectionReason?: string | null;
}

export interface AdAuditEvent {
  eventId: string;
  eventType: AdAuditEventType;
  timestamp: string;
  userId: string;
  adProvider: string;
  rewardId?: string;
  providerRewardId?: string;
  details?: Record<string, any>;
}

export interface AdObservabilityMetrics {
  adRequestedCount: number;
  adStartedCount: number;
  adCompletedCount: number;
  verifiedRewardCount: number;
  rejectedRewardCount: number;
  duplicateAttemptsCount: number;
  expiredAttemptsCount: number;
  providerErrorsCount: number;
  totalGrantedTextUnits: number;
  activeProviders: string[];
}


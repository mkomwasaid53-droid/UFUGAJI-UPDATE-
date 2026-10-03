/**
 * Ufugaji Update — V1.8C Premium Entitlement & Subscription Foundation Service
 *
 * Server-authoritative engine for:
 * 1. Governed Premium Product Catalog (aiPremiumPlans: WEEKLY, MONTHLY, ANNUAL)
 * 2. Provider-neutral Payment Abstraction (PaymentIntent, PaymentReference, PaymentStatus)
 * 3. Plan Selection Foundation (Selecting a plan creates PENDING intent, NEVER activates Premium)
 * 4. Deterministic Subscription Lifecycle (PENDING -> ACTIVE -> EXPIRED / CANCELLED / REVOKED / SUSPENDED)
 * 5. Idempotent Entitlement Activation & Renewal Foundation
 * 6. Server-time Expiry Enforcement (Client time never trusted)
 * 7. Admin Test/Grant Provisioning
 * 8. User Privacy & Isolation
 */

import {
  AiPremiumPlan,
  AiPremiumPlanType,
  AiPremiumPlanStatus,
  PaymentIntent,
  PaymentStatus,
  AiEntitlementRecord,
  AiEntitlementStatus,
  AiEntitlementTier,
  AiPackageType,
  UserPremiumStatusResponse,
  AiObservabilityMetrics
} from '../types/aiUsageAndCache';
import {
  resolveUserEntitlement,
  grantOrUpdateUserEntitlement,
  getOrCreateUserSummary,
  getOrCreateDailyUsage,
  getServerDateKey,
  getAiBusinessConfig,
  getAiObservabilityMetrics,
  incrementAiObservabilityMetric
} from './aiUsageTrackingService';

// ============================================================================
// 1. STRUCTURED PREMIUM PRODUCT CATALOG (aiPremiumPlans)
// ============================================================================

const governedPremiumPlans: Map<string, AiPremiumPlan> = new Map([
  [
    'plan_weekly',
    {
      planId: 'plan_weekly',
      planType: 'WEEKLY',
      displayName: 'Kifurushi cha Wiki (Weekly Premium)',
      description: 'Maswali ya AI bila kikomo cha siku, uchambuzi wa picha na video kwa siku 7 kamili.',
      billingPeriod: 'WEEKLY',
      durationDays: 7,
      dailyAiLimit: 50,
      mediaAccess: true,
      currency: 'TZS',
      indicativePrice: 3000, // Configurable metadata; not locked in business logic
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      createdBy: 'SYSTEM_BOOTSTRAP'
    }
  ],
  [
    'plan_monthly',
    {
      planId: 'plan_monthly',
      planType: 'MONTHLY',
      displayName: 'Kifurushi cha Mwezi (Monthly Premium)',
      description: 'Kifurushi kinachopendwa zaidi: Maswali ya maandishi, picha na video kwa siku 30.',
      billingPeriod: 'MONTHLY',
      durationDays: 30,
      dailyAiLimit: 50,
      mediaAccess: true,
      currency: 'TZS',
      indicativePrice: 10000, // Configurable metadata; not locked in business logic
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      createdBy: 'SYSTEM_BOOTSTRAP'
    }
  ],
  [
    'plan_annual',
    {
      planId: 'plan_annual',
      planType: 'ANNUAL',
      displayName: 'Kifurushi cha Mwaka (Annual Premium)',
      description: 'Upatikanaji mkubwa zaidi wa AI kwa wamiliki wa mashamba na wataalamu kwa mwaka mzima.',
      billingPeriod: 'ANNUAL',
      durationDays: 365,
      dailyAiLimit: 50,
      mediaAccess: true,
      currency: 'TZS',
      indicativePrice: 90000, // Configurable metadata; not locked in business logic
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      createdBy: 'SYSTEM_BOOTSTRAP'
    }
  ]
]);

export function getAvailablePremiumPlans(): (AiPremiumPlan & {
  id: string;
  name: string;
  nameSwahili: string;
  descriptionSwahili: string;
  priceAmount: number;
  dailyQueryLimit: number;
  mediaAllowed: boolean;
  prioritySupport: boolean;
})[] {
  return Array.from(governedPremiumPlans.values())
    .filter((p) => p.status === 'ACTIVE')
    .map((p) => ({
      ...p,
      id: p.planId,
      name: p.displayName,
      nameSwahili: p.planType === 'WEEKLY' ? 'Wiki Moja' : p.planType === 'MONTHLY' ? 'Mwezi Mmoja' : 'Mwaka Mmoja',
      descriptionSwahili: p.description,
      priceAmount: p.indicativePrice ?? (p.planType === 'WEEKLY' ? 3000 : p.planType === 'MONTHLY' ? 10000 : 90000),
      dailyQueryLimit: p.dailyAiLimit ?? 50,
      mediaAllowed: p.mediaAccess ?? true,
      prioritySupport: true
    }));
}

export function getAllPremiumPlans(): AiPremiumPlan[] {
  return Array.from(governedPremiumPlans.values());
}

export function getPremiumPlanById(planId: string): AiPremiumPlan | undefined {
  if (!planId || typeof planId !== 'string') return undefined;
  // Direct lookup
  const direct = governedPremiumPlans.get(planId);
  if (direct) return direct;

  // Normalized lookup (e.g. ai_plan_weekly -> plan_weekly, or WEEKLY -> plan_weekly)
  const cleanId = planId.trim();
  const normalized = cleanId.toLowerCase().replace(/^ai_/, '');
  for (const [key, plan] of governedPremiumPlans.entries()) {
    if (key === normalized || plan.planId === normalized) return plan;
    if (plan.planType.toLowerCase() === normalized) return plan;
    if (plan.planType.toLowerCase() === cleanId.toLowerCase()) return plan;
  }
  return undefined;
}

export function getPremiumPlanByType(planType: AiPremiumPlanType): AiPremiumPlan | undefined {
  for (const plan of governedPremiumPlans.values()) {
    if (plan.planType === planType) return plan;
  }
  return undefined;
}

export function updatePremiumPlanConfig(
  planId: string,
  updates: Partial<AiPremiumPlan>,
  updatedBy: string = 'ADMIN'
): AiPremiumPlan | undefined {
  const existing = governedPremiumPlans.get(planId);
  if (!existing) return undefined;
  const updated: AiPremiumPlan = {
    ...existing,
    ...updates,
    planId: existing.planId, // Immutable
    updatedAt: new Date().toISOString(),
    updatedBy
  };
  governedPremiumPlans.set(planId, updated);
  return updated;
}

// ============================================================================
// 2. IN-MEMORY STORAGE FOR PAYMENT INTENTS & IDEMPOTENCY
// ============================================================================

// Payment intents store (intentId -> PaymentIntent)
const paymentIntentsStore: Map<string, PaymentIntent> = new Map();

// Payment reference to intentId mapping (paymentReference -> intentId)
const paymentReferenceMap: Map<string, string> = new Map();

// Processed payment references for strict activation idempotency
const activatedPaymentReferences: Set<string> = new Set();

// ============================================================================
// 3. PLAN SELECTION FOUNDATION (CREATES PENDING INTENT, NEVER ACTIVATES)
// ============================================================================

export interface PlanSelectionResult {
  success: boolean;
  intent?: PaymentIntent;
  requiredAction: 'PAYMENT_REQUIRED';
  pendingPlan: AiPremiumPlanType;
  message: string;
  error?: string;
}

/**
 * Initiates plan selection for a user.
 * CRITICAL RULE: Plan selection is NOT payment. Selecting a plan MUST NOT activate Premium.
 * Creates a PENDING PaymentIntent and records the user's pending interest.
 */
export function selectPremiumPlan(
  userId: string,
  planType: AiPremiumPlanType,
  metadata?: Record<string, any>
): PlanSelectionResult {
  if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
    return {
      success: false,
      requiredAction: 'PAYMENT_REQUIRED',
      pendingPlan: planType,
      message: 'userId is required',
      error: 'INVALID_USER_ID'
    };
  }

  const plan = getPremiumPlanByType(planType);
  if (!plan || plan.status !== 'ACTIVE') {
    return {
      success: false,
      requiredAction: 'PAYMENT_REQUIRED',
      pendingPlan: planType,
      message: `Kifurushi kilichochaguliwa (${planType}) hakipatikani kwa sasa.`,
      error: 'PLAN_UNAVAILABLE'
    };
  }

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  // Payment intent expires after 24 hours if not completed
  const expiresAtIso = new Date(now + 24 * 60 * 60 * 1000).toISOString();

  const randomRef = Math.random().toString(36).substring(2, 9).toUpperCase();
  const paymentReference = `PAY-${planType}-${now}-${randomRef}`;
  const intentId = `pi_${userId}_${planType}_${now}`;
  const idempotencyKey = `idemp_${userId}_${planType}_${now}`;

  const intent: PaymentIntent = {
    intentId,
    userId,
    planId: plan.planId,
    planType,
    amount: plan.indicativePrice ?? null,
    currency: plan.currency || 'TZS',
    status: 'PENDING',
    provider: 'PROVIDER_NEUTRAL_ABSTRACTION',
    paymentReference,
    idempotencyKey,
    createdAt: nowIso,
    updatedAt: nowIso,
    expiresAt: expiresAtIso,
    metadata: {
      ...metadata,
      planDisplayName: plan.displayName,
      durationDays: plan.durationDays,
      dailyAiLimit: plan.dailyAiLimit
    }
  };

  paymentIntentsStore.set(intentId, intent);
  paymentReferenceMap.set(paymentReference, intentId);

  // Update user's pending plan record without modifying active tier or status
  const currentEntitlement = resolveUserEntitlement(userId);
  currentEntitlement.pendingPlan = {
    planType,
    paymentStatus: 'PENDING',
    intentId,
    selectedAt: nowIso
  };
  currentEntitlement.updatedAt = nowIso;
  grantOrUpdateUserEntitlement(currentEntitlement);

  // Update observability
  incrementAiObservabilityMetric('planSelectionAttempts', 1);
  incrementAiObservabilityMetric('paymentIntentsCreated', 1);

  return {
    success: true,
    intent,
    requiredAction: 'PAYMENT_REQUIRED',
    pendingPlan: planType,
    message: `Umechagua ${plan.displayName}. Tafadhali kamilisha malipo ili kuwezesha huduma za Premium.`
  };
}

export function getPaymentIntentById(intentId: string): PaymentIntent | undefined {
  return paymentIntentsStore.get(intentId);
}

export function getPaymentIntentByReference(paymentReference: string): PaymentIntent | undefined {
  const intentId = paymentReferenceMap.get(paymentReference);
  if (!intentId) return undefined;
  return paymentIntentsStore.get(intentId);
}

// ============================================================================
// 4. AUTHORITATIVE PAYMENT CONFIRMATION & ENTITLEMENT ACTIVATION (IDEMPOTENT)
// ============================================================================

export interface AuthoritativeActivationInput {
  userId: string;
  planType: AiPremiumPlanType;
  paymentReference: string;
  intentId?: string;
  source: 'PAYMENT' | 'SUBSCRIPTION' | 'ADMIN_GRANT' | 'SYSTEM' | 'PROMOTIONAL';
  externalReference?: string;
  customDurationDays?: number;
  customDailyLimit?: number;
  adminId?: string;
  notes?: string;
}

export interface AuthoritativeActivationResult {
  success: boolean;
  isIdempotentReplay: boolean;
  entitlement: AiEntitlementRecord;
  message: string;
  error?: string;
}

/**
 * Authoritatively activates a Premium entitlement upon verified payment or admin test grant.
 * IDEMPOTENCY:
 * The same paymentReference will NEVER activate multiple entitlements or duplicate periods.
 * Uses strict server time (Date.now()) for calculating startedAt and expiresAt.
 */
export function activatePremiumEntitlementAuthoritatively(
  input: AuthoritativeActivationInput
): AuthoritativeActivationResult {
  const {
    userId,
    planType,
    paymentReference,
    intentId,
    source,
    externalReference,
    customDurationDays,
    customDailyLimit,
    notes
  } = input;

  if (!userId || !paymentReference) {
    throw new Error('userId and paymentReference are required for entitlement activation');
  }

  const current = resolveUserEntitlement(userId);

  // 1. Check Idempotency: Has this payment reference already been processed?
  if (activatedPaymentReferences.has(paymentReference)) {
    console.log(`[V1.8C Idempotency] Payment reference ${paymentReference} already activated. Replaying current entitlement.`);
    return {
      success: true,
      isIdempotentReplay: true,
      entitlement: current,
      message: 'Malipo haya yameshawahi kuthibitishwa. Kifurushi chako kiko hai tayari.'
    };
  }

  // Also check if current entitlement already carries this external reference
  if (current.externalReference === paymentReference && current.status === 'ACTIVE') {
    activatedPaymentReferences.add(paymentReference);
    return {
      success: true,
      isIdempotentReplay: true,
      entitlement: current,
      message: 'Malipo haya yameshawahi kuthibitishwa. Kifurushi chako kiko hai tayari.'
    };
  }

  const plan = getPremiumPlanByType(planType);
  const durationDays = customDurationDays ?? plan?.durationDays ?? (planType === 'WEEKLY' ? 7 : planType === 'ANNUAL' ? 365 : 30);
  const durationMs = durationDays * 24 * 60 * 60 * 1000;

  // Server time controls expiry; client time is never trusted
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  // Renewal foundation: If the user currently has an ACTIVE Premium entitlement that has not expired,
  // extend from the existing expiresAt. Otherwise, start from now.
  let startMs = now;
  if (
    current.tier === 'PREMIUM' &&
    current.status === 'ACTIVE' &&
    current.expiresAt &&
    new Date(current.expiresAt).getTime() > now
  ) {
    startMs = new Date(current.expiresAt).getTime();
  }
  const expiresAtIso = new Date(startMs + durationMs).toISOString();

  // Determine authoritative daily limit from plan or business config
  const bConfig = getAiBusinessConfig();
  let dailyLimit = customDailyLimit ?? plan?.dailyAiLimit;
  if (!dailyLimit || dailyLimit <= 0) {
    if (planType === 'WEEKLY') dailyLimit = bConfig.premiumWeeklyDailyLimit;
    else if (planType === 'ANNUAL') dailyLimit = bConfig.premiumAnnualDailyLimit;
    else dailyLimit = bConfig.premiumMonthlyDailyLimit;
  }

  const updatedEntitlement: AiEntitlementRecord = {
    entitlementId: `ent_${userId}_${planType.toLowerCase()}_${now}`,
    userId,
    tier: 'PREMIUM',
    status: 'ACTIVE',
    packageType: planType,
    planType,
    source,
    startedAt: nowIso,
    expiresAt: expiresAtIso,
    dailyLimit,
    externalReference: externalReference || paymentReference,
    pendingPlan: null, // Clear pending plan upon active entitlement
    createdAt: current.createdAt || nowIso,
    updatedAt: nowIso,
    metadata: {
      ...current.metadata,
      paymentReference,
      intentId,
      durationDays,
      activatedAt: nowIso,
      notes
    }
  };

  // Update in memory and sync with summary
  grantOrUpdateUserEntitlement(updatedEntitlement);

  // Mark reference as activated to guarantee idempotency
  activatedPaymentReferences.add(paymentReference);

  // Update payment intent if one was registered
  if (intentId && paymentIntentsStore.has(intentId)) {
    const pIntent = paymentIntentsStore.get(intentId)!;
    pIntent.status = 'SUCCESS';
    pIntent.updatedAt = nowIso;
    paymentIntentsStore.set(intentId, pIntent);
  }

  // Observability
  incrementAiObservabilityMetric('entitlementActivations', 1);

  console.log(`[V1.8C Premium] Entitlement ACTIVATED for user ${userId}: plan=${planType}, dailyLimit=${dailyLimit}, expiresAt=${expiresAtIso}, source=${source}`);

  return {
    success: true,
    isIdempotentReplay: false,
    entitlement: updatedEntitlement,
    message: `Hongera! Kifurushi chako cha Premium (${plan?.displayName || planType}) kimewezeshwa hadi ${new Date(expiresAtIso).toLocaleDateString('sw-TZ')}.`
  };
}

// ============================================================================
// 5. SUBSCRIPTION LIFECYCLE MANAGEMENT
// ============================================================================

/**
 * Updates the status of an entitlement deterministically.
 * Allowed statuses: ACTIVE, EXPIRED, CANCELLED, REVOKED, SUSPENDED, PENDING
 * Only ACTIVE grants Premium privileges.
 */
export function setEntitlementLifecycleStatus(
  userId: string,
  newStatus: AiEntitlementStatus,
  reason: string = 'STATUS_UPDATE_REQUESTED'
): AiEntitlementRecord {
  const current = resolveUserEntitlement(userId);
  const nowIso = new Date().toISOString();

  current.status = newStatus;
  current.updatedAt = nowIso;
  current.metadata = {
    ...current.metadata,
    lastStatusChangeReason: reason,
    lastStatusChangeAt: nowIso
  };

  // If status is not ACTIVE, tier behaves as non-premium (effectively resolves to FREE in gates)
  const updated = grantOrUpdateUserEntitlement(current);

  if (newStatus === 'EXPIRED') {
    incrementAiObservabilityMetric('entitlementExpirations', 1);
  }

  console.log(`[V1.8C Lifecycle] Entitlement status for user ${userId} changed to ${newStatus}. Reason: ${reason}`);
  return updated;
}

// ============================================================================
// 6. ADMIN TEST / GRANT PROVISIONING FOUNDATION
// ============================================================================

export interface AdminGrantInput {
  userId: string;
  planType: AiPremiumPlanType;
  durationDays?: number;
  dailyLimit?: number;
  adminId?: string;
  notes?: string;
}

/**
 * Server/Admin mechanism for provisioning a test or complimentary Premium entitlement without real payment.
 * Clearly marks source as ADMIN_GRANT.
 */
export function adminGrantPremiumPlan(input: AdminGrantInput): AuthoritativeActivationResult {
  const { userId, planType, durationDays, dailyLimit, adminId = 'ADMIN', notes } = input;
  const paymentRef = `ADMIN-GRANT-${userId}-${planType}-${Date.now()}`;

  return activatePremiumEntitlementAuthoritatively({
    userId,
    planType,
    paymentReference: paymentRef,
    source: 'ADMIN_GRANT',
    externalReference: `admin_${adminId}`,
    customDurationDays: durationDays,
    customDailyLimit: dailyLimit,
    adminId,
    notes: notes || `Admin grant by ${adminId}`
  });
}

// ============================================================================
// 7. USER-FACING STRUCTURED PREMIUM STATUS RESOLVER
// ============================================================================

/**
 * Prepares the structured user-facing Premium status response.
 * Completely isolates internal payment secrets or provider tokens.
 */
export function resolveUserPremiumStatus(userId: string): UserPremiumStatusResponse {
  const entitlement = resolveUserEntitlement(userId);
  const summary = getOrCreateUserSummary(userId);
  const dateKey = getServerDateKey();
  const daily = getOrCreateDailyUsage(userId, dateKey);
  const bConfig = getAiBusinessConfig();

  // Server-authoritative check: ONLY 'ACTIVE' with valid unexpired date grants Premium
  const now = Date.now();
  const isExpired = Boolean(entitlement.expiresAt && new Date(entitlement.expiresAt).getTime() <= now);
  if (isExpired && entitlement.status === 'ACTIVE') {
    // Deterministic state transition on read
    entitlement.status = 'EXPIRED';
    grantOrUpdateUserEntitlement(entitlement);
  }

  const isPremiumActive =
    entitlement.tier === 'PREMIUM' &&
    entitlement.status === 'ACTIVE' &&
    (!entitlement.expiresAt || new Date(entitlement.expiresAt).getTime() > now);

  const freeLimit = bConfig.freeTextInitialLimit;
  const freeUsed = summary.lifetimeFreeAllowanceUsed;
  const freeRemaining = Math.max(0, freeLimit - freeUsed);

  let reasonCode = 'FREE_QUOTA_AVAILABLE';
  let dailyLimit = 0;
  let dailyUsed = daily.totalQueriesCount;
  let dailyRemaining = 0;

  if (isPremiumActive) {
    dailyLimit = entitlement.dailyLimit > 0 ? entitlement.dailyLimit : bConfig.premiumMonthlyDailyLimit;
    dailyRemaining = Math.max(0, dailyLimit - daily.totalQueriesCount);
    if (daily.totalQueriesCount >= dailyLimit) {
      reasonCode = 'PREMIUM_DAILY_LIMIT_REACHED';
    } else {
      reasonCode = 'PREMIUM_ACTIVE';
    }
  } else if (entitlement.tier === 'PREMIUM') {
    reasonCode = `PREMIUM_${entitlement.status}`;
  } else if (freeRemaining > 0) {
    reasonCode = 'FREE_QUOTA_AVAILABLE';
  } else if (summary.currentAdRewardRemaining > 0) {
    reasonCode = 'AD_REWARD_AVAILABLE';
  } else {
    reasonCode = 'FREE_QUOTA_EXHAUSTED';
  }

  // Update observability resolution count
  incrementAiObservabilityMetric('entitlementResolutions', 1);

  const daysRemaining = entitlement.expiresAt
    ? Math.max(0, Math.ceil((new Date(entitlement.expiresAt).getTime() - now) / (1000 * 60 * 60 * 24)))
    : null;

  return {
    tier: isPremiumActive ? 'PREMIUM' : 'FREE',
    planType: entitlement.packageType,
    status: entitlement.status,
    isPremiumActive,
    daysRemaining,
    startedAt: isPremiumActive ? entitlement.startedAt : null,
    expiresAt: isPremiumActive ? entitlement.expiresAt : null,
    dailyLimit,
    dailyUsed,
    dailyRemaining,
    mediaAllowed: isPremiumActive,
    entitlementSource: entitlement.source,
    pendingPlan: entitlement.pendingPlan || null,
    reasonCode,
    freeLimit,
    freeUsed,
    freeRemaining,
    canUseAdReward: !isPremiumActive && freeRemaining <= 0
  };
}

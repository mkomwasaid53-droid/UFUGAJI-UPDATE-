/**
 * UFUGAJI UPDATE V1.10A — SELLER MONETIZATION FOUNDATION & LIFECYCLE
 *
 * Types and interfaces for the server-authoritative Seller Monetization system.
 * Commercial plan:
 * - Monthly seller subscription: TSh 1,000 / month (TZS)
 * - First month: FREE (1 month trial)
 * - After free period: paid monthly seller subscription
 *
 * Separation of Concerns:
 * Seller monetization is strictly separate from seller identity, seller verification,
 * marketplace trust, product ownership, moderation, reviews, and reputation.
 * Payment or subscription activation must NEVER automatically create a Verified badge.
 */

export type SellerMonetizationStatus =
  | 'NOT_ACTIVATED'
  | 'TRIAL_ACTIVE'
  | 'ACTIVE'
  | 'GRACE_PERIOD'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'SUSPENDED';

export type SellerPaymentStatus =
  | 'NOT_REQUIRED'
  | 'PENDING'
  | 'PROCESSING'
  | 'SUCCESS'
  | 'FAILED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'UNKNOWN';

export type SellerMonetizationPlan = 'SELLER_MONTHLY';

export interface SellerMonetizationConfig {
  plan: SellerMonetizationPlan;
  monthlyPrice: number; // 1000
  currency: 'TZS';
  trialDurationDays: number; // 30 days
  graceDurationDays: number; // 7 days (governed config)
}

export interface SellerMonetizationRecord {
  sellerUserId: string;
  sellerProfileId?: string;
  status: SellerMonetizationStatus;
  plan: SellerMonetizationPlan;
  price: number; // 1000
  currency: 'TZS';
  trialStartAt: string | null; // ISO timestamp
  trialEndAt: string | null;
  graceStartAt: string | null;
  graceEndAt: string | null;
  currentPeriodStartAt: string | null;
  currentPeriodEndAt: string | null;
  activatedAt: string | null;
  lastPaymentAt: string | null;
  lastPaymentStatus?: SellerPaymentStatus;
  lastPaymentAmount?: number;
  lastTransactionRef?: string;
  nextRenewalAt: string | null;
  expiredAt: string | null;
  cancelledAt?: string | null;
  suspendedAt?: string | null;
  suspendedReason?: string | null;
  hasHadTrial: boolean; // Protects against repeated trial resets
  emittedTransitions?: string[]; // Deterministic deduplication of emitted lifecycle transitions
  testSimulation?: boolean; // Section 8: Traceable controlled simulation metadata (never replaces status)
  lastLifecycleAction?: string | null;
  lastLifecycleActionAt?: string | null;
  lastLifecycleActionBy?: string | null;
  version?: number; // Monotonic version for read/write race protection
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, any>;
}

export type SellerMonetizationAuditEventType =
  | 'SELLER_MONETIZATION_ACTIVATED'
  | 'SELLER_TRIAL_STARTED'
  | 'SELLER_TRIAL_EXPIRED'
  | 'SELLER_GRACE_STARTED'
  | 'SELLER_EXPIRED'
  | 'SELLER_RENEWAL_REQUESTED'
  | 'SELLER_RENEWAL_SUCCESS'
  | 'SELLER_PAYMENT_PENDING'
  | 'SELLER_PAYMENT_SUCCESS'
  | 'SELLER_PAYMENT_FAILED'
  | 'SELLER_MONETIZATION_CANCELLED'
  | 'SELLER_MONETIZATION_SUSPENDED'
  | 'SELLER_MONETIZATION_REACTIVATED';

export interface SellerMonetizationAuditEntry {
  id: string;
  sellerUserId: string;
  eventType: SellerMonetizationAuditEventType;
  previousStatus: SellerMonetizationStatus | null;
  newStatus: SellerMonetizationStatus;
  performedBy: string; // 'SYSTEM' | sellerUserId | adminUserId
  timestamp: string; // ISO
  reason?: string;
  idempotencyKey?: string;
  metadata?: Record<string, any>;
}

/**
 * Structured lifecycle diagnostic record for Section 28:
 * Answers: "Ni action gani ilibadilisha seller kutoka state A kwenda state B?"
 */
export interface SellerMonetizationDiagnosticLog {
  id: string;
  sellerUserId: string;
  previousStatus: SellerMonetizationStatus;
  nextStatus: SellerMonetizationStatus;
  transitionId: string;
  action: string;
  source: 'ADMIN_ACTION' | 'SELLER_ACTION' | 'LIFECYCLE_EVALUATOR' | 'PAYMENT_CONFIRMATION' | 'SYSTEM_INITIALIZATION';
  actorUserId: string;
  timestamp: string;
  notificationEventIds: string[];
  idempotencyKey?: string;
  metadata?: Record<string, any>;
}

/**
 * Parameters for the single authoritative transition function (Section 15)
 */
export interface TransitionSellerMonetizationParams {
  sellerUserId: string;
  action:
    | 'ACTIVATE_TRIAL'
    | 'EVALUATE_LIFECYCLE'
    | 'RECORD_PAYMENT'
    | 'SUSPEND'
    | 'REACTIVATE'
    | 'CANCEL'
    | 'SIMULATE_GRACE'
    | 'SIMULATE_EXPIRY';
  actorUserId?: string;
  source?: 'ADMIN_ACTION' | 'SELLER_ACTION' | 'LIFECYCLE_EVALUATOR' | 'PAYMENT_CONFIRMATION' | 'SYSTEM_INITIALIZATION';
  reason?: string;
  sellerProfileId?: string;
  idempotencyKey?: string;
  commandId?: string;
  entryPoint?: string;
  currentTime?: Date;
  paymentDetails?: {
    amount: number;
    transactionRef?: string;
    paymentStatus?: SellerPaymentStatus;
  };
}

export interface SellerSellingEligibility {
  canSell: boolean;
  status: SellerMonetizationStatus;
  reason: string;
  reasonSwahili: string;
  isTrialActive: boolean;
  isGracePeriod: boolean;
  isExpired: boolean;
  trialDaysRemaining?: number;
  graceDaysRemaining?: number;
  renewalDate?: string | null;
  requiresPaymentAction: boolean;
}

export type SellerTrialEntryPoint =
  | 'SELLER_MAIN_CTA'
  | 'WEKA_TANGAZO_CTA'
  | 'CATALOGUE_CTA'
  | 'SHOP_PUBLISH_CTA'
  | string;

export interface ActivateTrialInput {
  sellerUserId: string;
  sellerProfileId?: string;
  idempotencyKey?: string;
  commandId?: string;
  entryPoint?: SellerTrialEntryPoint;
}

export interface ActivateTrialResult {
  success: boolean;
  record: SellerMonetizationRecord;
  message: string;
  isDuplicate?: boolean;
  commandId?: string;
  entryPoint?: string;
  createdNotificationId?: string;
  stateBefore?: SellerMonetizationStatus;
  stateAfter?: SellerMonetizationStatus;
}

export interface TestPaymentInput {
  sellerUserId: string;
  paymentStatus: SellerPaymentStatus;
  amount: number;
  transactionRef?: string;
  performedBy: string;
  idempotencyKey?: string;
}

/**
 * V1.10B — Governed Seller Payment Intent
 * Strictly isolates seller monetization transactions from AI Premium entitlements.
 */
export interface SellerPaymentIntent {
  paymentIntentId: string;
  sellerUserId: string;
  sellerProfileId?: string;
  plan: SellerMonetizationPlan; // 'SELLER_MONTHLY'
  amount: number; // Governed 1,000 TZS
  currency: 'TZS';
  provider: string; // 'PLUSPESA' | 'MOCK_PROVIDER'
  status: SellerPaymentStatus; // 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'EXPIRED'
  externalId: string; // UFUGAJI_SELLER_PREMIUM_<ref>
  providerReference?: string | null;
  providerUuid?: string | null;
  customerPhone: string;
  providerNetwork?: string;
  idempotencyKey?: string;
  failureReason?: string;
  checkoutUrl?: string | null;
  paymentInstructions?: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  resultingSellerState?: SellerMonetizationStatus;
  periodStart?: string | null;
  periodEnd?: string | null;
  lifecycleTransitionApplied?: boolean;
  metadata?: Record<string, any>;
}

export interface InitiateSellerPaymentParams {
  sellerUserId: string;
  sellerProfileId?: string;
  customerPhone: string;
  providerName?: string;
  providerNetwork?: string;
  idempotencyKey?: string;
  correlationId?: string;
}

export interface InitiateSellerPaymentResult {
  success: boolean;
  paymentIntent: SellerPaymentIntent;
  checkoutUrl?: string | null;
  paymentInstructions?: string | null;
  error?: string;
  errorCode?: string;
}

export interface CheckSellerPaymentResult {
  success: boolean;
  paymentIntent: SellerPaymentIntent;
  record?: SellerMonetizationRecord;
  eligibility?: SellerSellingEligibility;
  polledFromProvider?: boolean;
  lifecycleRenewed?: boolean;
  error?: string;
}


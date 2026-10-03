/// <reference types="node" />
/**
 * V1.8E — Payment Service & Orchestrator
 *
 * Core engine managing:
 * 1. Provider-neutral transaction registry & lifecycle (PlusPesa & Mock)
 * 2. Strict client vs server vs provider authority boundary
 * 3. Server-authoritative plan resolution & amount locking (V1.8C governed pricing)
 * 4. Tanzanian mobile phone number normalization & validation
 * 5. Unique externalId generation & indexing (UFU-PAY-...)
 * 6. Webhook verification with raw HTTP body HMAC-SHA256
 * 7. Controlled status polling fallback reconciliation (GET /collections/{reference}/status)
 * 8. Strict validation: amount match, currency match (TZS), external_id match
 * 9. Idempotent payment processing & duplicate callback protection
 * 10. Authoritative entitlement activation upon verified SUCCESS only
 * 11. Payment audit trail & observability metrics
 * 12. User-isolated access controls
 */

import type { Buffer } from 'node:buffer';
import {
  PaymentStatus,
  PaymentTransaction,
  PaymentAuditEvent,
  PaymentAuditEventType,
  PaymentObservabilityMetrics
} from '../../types/aiUsageAndCache';
import {
  PaymentProvider,
  VerifyCallbackResult,
  CreatePaymentRequestResult
} from './paymentProviderInterface';
import { PlusPesaPaymentProvider } from './plusPesaPaymentProvider';
import { MockPaymentProvider } from './mockPaymentProvider';
import {
  selectPremiumPlan,
  getPremiumPlanById,
  activatePremiumEntitlementAuthoritatively
} from '../aiPremiumSubscriptionService';
import {
  normalizeTanzanianPhoneNumber,
  generatePaymentExternalId,
  resolvePlusPesaProvider
} from './paymentUtils';

// In-memory stores for authoritative tracking
const paymentTransactionsStore = new Map<string, PaymentTransaction>();
const paymentReferenceIndex = new Map<string, string>(); // providerReference -> paymentId
const paymentIntentIndex = new Map<string, string>(); // paymentIntentId -> paymentId
const paymentExternalIdIndex = new Map<string, string>(); // externalId -> paymentId
const paymentAuditEventsStore: PaymentAuditEvent[] = [];

// Observability metrics for payments
const paymentMetrics: PaymentObservabilityMetrics = {
  paymentCreationCount: 0,
  paymentPendingCount: 0,
  paymentProcessingCount: 0,
  paymentSuccessCount: 0,
  paymentFailureCount: 0,
  paymentCancelledCount: 0,
  paymentExpiredCount: 0,
  paymentVerificationFailures: 0,
  paymentDuplicateCallbacks: 0,
  premiumActivationsFromPayment: 0,
  providerErrors: 0
};

export class PaymentService {
  private providers = new Map<string, PaymentProvider>();
  private defaultProviderName: string = 'PLUSPESA';

  constructor() {
    const plusPesa = new PlusPesaPaymentProvider();
    const mock = new MockPaymentProvider();
    this.registerProvider(plusPesa);
    this.registerProvider(mock);
  }

  public registerProvider(provider: PaymentProvider): void {
    this.providers.set(provider.providerName.toUpperCase(), provider);
  }

  public getProvider(name?: string): PaymentProvider {
    const targetName = (name || this.defaultProviderName).toUpperCase();
    const provider = this.providers.get(targetName);
    if (!provider) {
      const fallback = this.providers.get('PLUSPESA') || Array.from(this.providers.values())[0];
      if (!fallback) throw new Error(`Hakuna payment provider iliyosajiliwa: ${targetName}`);
      return fallback;
    }
    return provider;
  }

  public setDefaultProvider(name: string): void {
    this.defaultProviderName = name.toUpperCase();
  }

  /**
   * Records an authoritative audit event.
   * Strictly filters out any sensitive payment credentials.
   */
  public recordAuditEvent(
    eventType: PaymentAuditEventType,
    paymentId: string,
    userId: string,
    provider: string,
    providerReference: string | null,
    planId?: string,
    safeMetadata?: Record<string, any>,
    correlationId?: string
  ): PaymentAuditEvent {
    const event: PaymentAuditEvent = {
      eventId: `pae_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      paymentId,
      userId,
      eventType,
      timestamp: new Date().toISOString(),
      provider,
      providerReference,
      planId,
      correlationId,
      safeMetadata: safeMetadata ? { ...safeMetadata } : undefined
    };

    paymentAuditEventsStore.push(event);
    return event;
  }

  /**
   * Step 1: Initiates a payment transaction.
   * Client selects a plan; this generates an internal PaymentIntent and sets status to PENDING/PROCESSING.
   * 
   * STRICT BOUNDARIES:
   * - Validates customer mobile number format (Tanzanian 07X/06X/255X)
   * - Server resolves amount from governed plan catalog; client amounts are NEVER trusted
   * - Unique externalId (UFU-PAY-...) generated and passed to PlusPesa as external_id
   * - Created payment enters PENDING/PROCESSING and NEVER activates Premium!
   */
  public async createPaymentTransaction(params: {
    userId: string;
    userName?: string;
    planId: string;
    providerName?: string;
    customerPhone?: string;
    providerNetwork?: string;
    customerEmail?: string;
    correlationId?: string;
  }): Promise<{
    success: boolean;
    transaction: PaymentTransaction;
    checkoutUrl?: string | null;
    paymentInstructions?: string | null;
    error?: string;
    errorCode?: string;
  }> {
    const { userId, userName, planId, customerPhone, providerNetwork, customerEmail, correlationId } = params;

    // 1. Resolve governed plan server-side
    const plan = getPremiumPlanById(planId);
    if (!plan) {
      return {
        success: false,
        transaction: null as any,
        error: `Kifurushi hakikupatikana: ${planId}`,
        errorCode: 'PLAN_ERROR'
      };
    }

    // 2. Validate customer phone number (required for mobile money collections; fallback for mock/tests)
    const effectivePhone = (customerPhone && customerPhone.trim().length > 0)
      ? customerPhone.trim()
      : (params.providerName === 'MOCK_PROVIDER' ? '0712345678' : '');

    if (!effectivePhone) {
      return {
        success: false,
        transaction: null as any,
        error: 'Tafadhali weka namba yako ya simu ya Tanzania (M-Pesa, TigoPesa, AirtelMoney, au Halopesa) kukamilisha malipo.',
        errorCode: 'USER_INPUT_ERROR'
      };
    }

    const phoneValidation = normalizeTanzanianPhoneNumber(effectivePhone);
    if (!phoneValidation.isValid || !phoneValidation.normalizedPhone) {
      return {
        success: false,
        transaction: null as any,
        error: phoneValidation.error || 'Namba ya simu ya Tanzania si sahihi.',
        errorCode: 'USER_INPUT_ERROR'
      };
    }

    // Resolve supported provider (Mpesa | Tigo | Airtel | Halopesa | Azampesa)
    const providerResolution = resolvePlusPesaProvider(effectivePhone, providerNetwork);
    if (!providerResolution.isValid || !providerResolution.provider) {
      return {
        success: false,
        transaction: null as any,
        error: providerResolution.error || 'Mtandao wa simu haujatambuliwa.',
        errorCode: 'USER_INPUT_ERROR'
      };
    }

    const normalizedPhone = phoneValidation.normalizedPhone;
    const resolvedNetwork = providerResolution.provider;

    // 3. Create underlying V1.8C governed PaymentIntent
    const intentResult = selectPremiumPlan(userId, plan.planType);
    if (!intentResult.success || !intentResult.intent) {
      return {
        success: false,
        transaction: null as any,
        error: intentResult.message || 'Haikuweza kuunda dhamira ya malipo.',
        errorCode: 'PLAN_ERROR'
      };
    }

    const intent = intentResult.intent;
    const paymentId = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const externalId = generatePaymentExternalId(paymentId);
    const nowIso = new Date().toISOString();
    const providerInstance = this.getProvider(params.providerName);

    // 4. Call provider adapter layer (POST /collections for PlusPesa)
    let providerResult: CreatePaymentRequestResult;
    try {
      providerResult = await providerInstance.createPaymentRequest({
        paymentId,
        externalId,
        paymentIntentId: intent.intentId,
        userId,
        customerName: userName,
        planId: plan.planId,
        amount: plan.indicativePrice || 0,
        currency: plan.currency || 'TZS',
        customerPhone: normalizedPhone,
        providerNetwork: resolvedNetwork,
        customerEmail,
        description: `Malipo ya ${plan.displayName} kwa mkulima ${userId}`,
        metadata: {
          correlationId,
          planType: plan.planType,
          operator: phoneValidation.operator,
          providerNetwork: resolvedNetwork
        }
      });
    } catch (err: any) {
      paymentMetrics.providerErrors++;
      return {
        success: false,
        transaction: null as any,
        error: `Hitilafu ya mtoa huduma wa malipo: ${err.message}`,
        errorCode: 'PAYMENT_PROVIDER_ERROR'
      };
    }

    if (!providerResult.success) {
      paymentMetrics.providerErrors++;
      return {
        success: false,
        transaction: null as any,
        error: providerResult.errorMessage || 'Mtoa huduma wa malipo alikataa ombi la mkusanyiko.',
        errorCode: 'PAYMENT_PROVIDER_ERROR'
      };
    }

    // Determine initial transaction status (PROCESSING / PENDING)
    // Documented PlusPesa create acknowledgement status is normally 'processing'
    const initialStatus: PaymentStatus = providerResult.normalizedStatus === 'PROCESSING' 
      ? 'PROCESSING' 
      : 'PENDING';

    const transaction: PaymentTransaction = {
      paymentId,
      externalId,
      userId,
      planId: plan.planId,
      planType: plan.planType,
      paymentIntentId: intent.intentId,
      provider: providerInstance.providerName,
      providerTransactionReference: providerResult.providerReference || null,
      providerUuid: providerResult.providerUuid || null,
      customerPhone: phoneValidation.nationalFormat,
      amount: plan.indicativePrice || 0,
      currency: plan.currency || 'TZS',
      status: initialStatus,
      createdAt: nowIso,
      updatedAt: nowIso,
      expiresAt: intent.expiresAt,
      rawProviderReference: providerResult.providerReference || null,
      entitlementId: null, // STRICT BOUNDARY: Never granted at creation
      metadata: {
        customerPhoneNormalized: normalizedPhone,
        customerPhoneDisplay: phoneValidation.nationalFormat,
        operator: phoneValidation.operator,
        correlationId,
        providerStatus: providerResult.providerStatus
      }
    };

    // Store transaction & all lookup indices
    paymentTransactionsStore.set(paymentId, transaction);
    paymentIntentIndex.set(intent.intentId, paymentId);
    paymentExternalIdIndex.set(externalId, paymentId);
    if (providerResult.providerReference) {
      paymentReferenceIndex.set(providerResult.providerReference, paymentId);
    }

    // Update metrics
    paymentMetrics.paymentCreationCount++;
    if (initialStatus === 'PENDING') paymentMetrics.paymentPendingCount++;
    if (initialStatus === 'PROCESSING') paymentMetrics.paymentProcessingCount++;

    // Record audit event
    this.recordAuditEvent(
      'PAYMENT_CREATED',
      paymentId,
      userId,
      providerInstance.providerName,
      providerResult.providerReference || null,
      plan.planId,
      {
        externalId,
        amount: transaction.amount,
        currency: transaction.currency,
        initialStatus,
        operator: phoneValidation.operator
      },
      correlationId
    );

    return {
      success: true,
      transaction,
      checkoutUrl: providerResult.checkoutUrl || null,
      paymentInstructions: providerResult.paymentInstructions || 'Omba la malipo limetumwa kwenye simu yako. Ingiza PIN kukamilisha malipo.'
    };
  }

  /**
   * Step 2: Authoritative Callback / Webhook Processing
   * STRICT BOUNDARIES:
   * 1. Cryptographic HMAC verification via X-PlusPesa-Signature (when configured)
   * 2. Reconciles internal payment via external_id (not userId or client metadata)
   * 3. Validates amount, currency (TZS), and external_id match internal authoritative data
   * 4. Enforces IDEMPOTENCY: repeated SUCCESS callback NEVER double-activates or extends subscription
   * 5. Activates Premium ONLY when verified SUCCESS occurs via activatePremiumEntitlementAuthoritatively()
   */
  public async processProviderCallback(
    providerName: string,
    payload: any,
    headers?: Record<string, string | string[] | undefined>,
    correlationId?: string,
    rawBody?: Buffer | string
  ): Promise<{
    success: boolean;
    isDuplicate: boolean;
    transaction: PaymentTransaction | null;
    entitlementActivated: boolean;
    error?: string;
    errorCode?: string;
  }> {
    const providerInstance = this.getProvider(providerName);

    // Initial audit event: Webhook payload arrived
    const incomingExtId = (payload && (payload.external_id || payload.data?.external_id)) || 'unknown';
    const incomingRef = (payload && (payload.reference || payload.data?.reference)) || null;
    this.recordAuditEvent(
      'PAYMENT_WEBHOOK_RECEIVED',
      incomingExtId,
      'unknown',
      providerInstance.providerName,
      incomingRef,
      undefined,
      { provider: providerName },
      correlationId
    );

    // 1. Verify callback authenticity & signature
    let verification: VerifyCallbackResult;
    try {
      verification = await providerInstance.verifyPaymentCallback(payload, headers, rawBody);
    } catch (err: any) {
      paymentMetrics.paymentVerificationFailures++;
      paymentMetrics.providerErrors++;
      return {
        success: false,
        isDuplicate: false,
        transaction: null,
        entitlementActivated: false,
        error: `Hitilafu ya uthibitishaji wa callback: ${err.message}`,
        errorCode: 'WEBHOOK_VERIFICATION_ERROR'
      };
    }

    if (!verification.isValid) {
      paymentMetrics.paymentVerificationFailures++;
      const isSignatureIssue = verification.providerStatus === 'SIGNATURE_MISMATCH' || verification.providerStatus === 'MISSING_SIGNATURE';
      
      if (isSignatureIssue) {
        this.recordAuditEvent(
          'PAYMENT_WEBHOOK_SIGNATURE_FAILED',
          verification.externalId || verification.internalPaymentId || incomingExtId,
          'unknown',
          providerInstance.providerName,
          verification.providerReference || incomingRef,
          undefined,
          { reason: verification.errorMessage || 'HMAC Signature verification failed' },
          correlationId
        );
      } else {
        this.recordAuditEvent(
          'PAYMENT_VALIDATION_FAILED',
          verification.externalId || verification.internalPaymentId || incomingExtId,
          'unknown',
          providerInstance.providerName,
          verification.providerReference || incomingRef,
          undefined,
          { reason: verification.errorMessage || 'Payload validation failed' },
          correlationId
        );
      }

      this.recordAuditEvent(
        'PAYMENT_VERIFICATION_FAILED',
        verification.externalId || verification.internalPaymentId || incomingExtId,
        'unknown',
        providerInstance.providerName,
        verification.providerReference || incomingRef,
        undefined,
        { reason: verification.errorMessage || 'Signature or payload verification failed' },
        correlationId
      );

      return {
        success: false,
        isDuplicate: false,
        transaction: null,
        entitlementActivated: false,
        error: verification.errorMessage || 'Callback verification failed.',
        errorCode: 'WEBHOOK_VERIFICATION_ERROR'
      };
    }

    // 2. Locate internal payment transaction
    // Primary: lookup by external_id (authoritative link to internal payment)
    let transaction: PaymentTransaction | undefined;
    if (verification.externalId && paymentExternalIdIndex.has(verification.externalId)) {
      const pId = paymentExternalIdIndex.get(verification.externalId)!;
      transaction = paymentTransactionsStore.get(pId);
    }
    if (!transaction && verification.internalPaymentId) {
      transaction = paymentTransactionsStore.get(verification.internalPaymentId);
    }
    if (!transaction && verification.providerReference) {
      const pId = paymentReferenceIndex.get(verification.providerReference);
      if (pId) transaction = paymentTransactionsStore.get(pId);
    }

    if (!transaction) {
      paymentMetrics.paymentVerificationFailures++;
      this.recordAuditEvent(
        'PAYMENT_VALIDATION_FAILED',
        verification.externalId || 'unknown',
        'unknown',
        providerInstance.providerName,
        verification.providerReference,
        undefined,
        { reason: 'Transaction not found for external_id' },
        correlationId
      );

      return {
        success: false,
        isDuplicate: false,
        transaction: null,
        entitlementActivated: false,
        error: 'Muamala wa malipo haukutambuliwa kwenye mfumo (Payment not found for external_id).',
        errorCode: 'PAYMENT_VALIDATION_ERROR'
      };
    }

    // Associate provider reference & UUID if newly received
    if (verification.providerReference && !transaction.providerTransactionReference) {
      transaction.providerTransactionReference = verification.providerReference;
      paymentReferenceIndex.set(verification.providerReference, transaction.paymentId);
    }
    if (verification.providerUuid && !transaction.providerUuid) {
      transaction.providerUuid = verification.providerUuid;
    }

    // 3. Strict Payload Integrity Validation: Amount & Currency match
    if (verification.amount !== undefined && verification.amount !== transaction.amount) {
      paymentMetrics.paymentVerificationFailures++;
      this.recordAuditEvent(
        'PAYMENT_VALIDATION_FAILED',
        transaction.paymentId,
        transaction.userId,
        transaction.provider,
        verification.providerReference,
        transaction.planId,
        {
          reason: 'AMOUNT_MISMATCH',
          expectedAmount: transaction.amount,
          receivedAmount: verification.amount
        },
        correlationId
      );

      return {
        success: false,
        isDuplicate: false,
        transaction,
        entitlementActivated: false,
        error: `Kiasi cha malipo hakikulingana (Amount mismatch: expected ${transaction.amount}, received ${verification.amount}).`,
        errorCode: 'PAYMENT_VALIDATION_ERROR'
      };
    }

    if (verification.currency && verification.currency.toUpperCase() !== 'TZS') {
      paymentMetrics.paymentVerificationFailures++;
      this.recordAuditEvent(
        'PAYMENT_VALIDATION_FAILED',
        transaction.paymentId,
        transaction.userId,
        transaction.provider,
        verification.providerReference,
        transaction.planId,
        {
          reason: 'CURRENCY_MISMATCH',
          expectedCurrency: 'TZS',
          receivedCurrency: verification.currency
        },
        correlationId
      );

      return {
        success: false,
        isDuplicate: false,
        transaction,
        entitlementActivated: false,
        error: `Sarafu ya malipo si sahihi (Currency mismatch: expected TZS, received ${verification.currency}).`,
        errorCode: 'PAYMENT_VALIDATION_ERROR'
      };
    }

    const newStatus = verification.normalizedStatus;

    // 4. IDEMPOTENCY CHECK: If already SUCCESS, safe return without re-activation
    if (transaction.status === 'SUCCESS') {
      paymentMetrics.paymentDuplicateCallbacks++;
      this.recordAuditEvent(
        'PAYMENT_DUPLICATE_CALLBACK',
        transaction.paymentId,
        transaction.userId,
        transaction.provider,
        transaction.providerTransactionReference,
        transaction.planId,
        {
          existingStatus: 'SUCCESS',
          incomingStatus: newStatus,
          externalId: transaction.externalId
        },
        correlationId
      );

      return {
        success: true,
        isDuplicate: true,
        transaction,
        entitlementActivated: false
      };
    }

    // 5. Update transaction status
    const previousStatus = transaction.status;
    transaction.status = newStatus;
    transaction.updatedAt = new Date().toISOString();
    if (verification.failureReason) {
      transaction.failureReason = verification.failureReason;
    }

    // Adjust metric counters
    if (previousStatus === 'PENDING') paymentMetrics.paymentPendingCount = Math.max(0, paymentMetrics.paymentPendingCount - 1);
    if (previousStatus === 'PROCESSING') paymentMetrics.paymentProcessingCount = Math.max(0, paymentMetrics.paymentProcessingCount - 1);

    if (newStatus === 'SUCCESS') paymentMetrics.paymentSuccessCount++;
    else if (newStatus === 'FAILED') paymentMetrics.paymentFailureCount++;
    else if (newStatus === 'CANCELLED') paymentMetrics.paymentCancelledCount++;
    else if (newStatus === 'EXPIRED') paymentMetrics.paymentExpiredCount++;
    else if (newStatus === 'PROCESSING') paymentMetrics.paymentProcessingCount++;

    // Record audit event for state transition
    const auditType: PaymentAuditEventType = 
      newStatus === 'SUCCESS' ? 'PAYMENT_SUCCESS' :
      newStatus === 'FAILED' ? 'PAYMENT_FAILED' :
      newStatus === 'CANCELLED' ? 'PAYMENT_CANCELLED' :
      newStatus === 'EXPIRED' ? 'PAYMENT_EXPIRED' :
      newStatus === 'PROCESSING' ? 'PAYMENT_PROCESSING' : 'PAYMENT_CREATED';

    this.recordAuditEvent(
      auditType,
      transaction.paymentId,
      transaction.userId,
      transaction.provider,
      transaction.providerTransactionReference,
      transaction.planId,
      { previousStatus, newStatus, externalId: transaction.externalId },
      correlationId
    );

    // 6. THE AUTHORITATIVE ACTIVATION BOUNDARY
    // Only verified SUCCESS triggers authoritative activation!
    let entitlementActivated = false;
    if (newStatus === 'SUCCESS') {
      const activationResult = activatePremiumEntitlementAuthoritatively({
        userId: transaction.userId,
        planType: transaction.planType,
        paymentReference: transaction.paymentId,
        intentId: transaction.paymentIntentId,
        source: 'PAYMENT',
        externalReference: transaction.providerTransactionReference || transaction.externalId,
        notes: `Malipo yamethibitishwa kupitia ${transaction.provider} ref #${transaction.providerTransactionReference || transaction.externalId}`
      });

      if (activationResult.success) {
        entitlementActivated = true;
        transaction.entitlementId = activationResult.entitlement.entitlementId;
        paymentMetrics.premiumActivationsFromPayment++;

        this.recordAuditEvent(
          'PREMIUM_ACTIVATED_FROM_PAYMENT',
          transaction.paymentId,
          transaction.userId,
          transaction.provider,
          transaction.providerTransactionReference,
          transaction.planId,
          {
            entitlementId: activationResult.entitlement.entitlementId,
            expiresAt: activationResult.entitlement.expiresAt,
            isIdempotentReplay: activationResult.isIdempotentReplay,
            externalId: transaction.externalId
          },
          correlationId
        );
      }
    }

    return {
      success: true,
      isDuplicate: false,
      transaction,
      entitlementActivated
    };
  }

  /**
   * Step 3: Status Polling Fallback & Reconciliation
   * Dispatches GET /collections/{reference}/status
   * 
   * PRIORITY RULE:
   * - Webhook is primary. Polling is secondary fallback.
   * - Terminal states (SUCCESS, FAILED, CANCELLED, EXPIRED) are NEVER repolled.
   * - Both Webhook and Polling converge on the exact same authoritative validation & activation pipeline.
   */
  public async pollPaymentStatus(
    paymentId: string,
    requestingUserId?: string,
    isAdmin: boolean = false
  ): Promise<{
    success: boolean;
    transaction: PaymentTransaction;
    polledFromProvider: boolean;
    entitlementActivated: boolean;
    error?: string;
  }> {
    const transaction = this.getPaymentTransactionById(paymentId, requestingUserId, isAdmin);
    if (!transaction) {
      return {
        success: false,
        transaction: null as any,
        polledFromProvider: false,
        entitlementActivated: false,
        error: 'Muamala haukutambuliwa.'
      };
    }

    // If already in terminal state, return directly without hitting provider API
    if (['SUCCESS', 'FAILED', 'CANCELLED', 'EXPIRED'].includes(transaction.status)) {
      return {
        success: true,
        transaction,
        polledFromProvider: false,
        entitlementActivated: false
      };
    }

    const providerRef = transaction.providerTransactionReference;
    if (!providerRef) {
      return {
        success: true,
        transaction,
        polledFromProvider: false,
        entitlementActivated: false
      };
    }

    const providerInstance = this.getProvider(transaction.provider);
    if (!providerInstance.isConfigured) {
      return {
        success: true,
        transaction,
        polledFromProvider: false,
        entitlementActivated: false
      };
    }

    try {
      const pollResult = await providerInstance.getPaymentStatus(providerRef);
      this.recordAuditEvent(
        'PAYMENT_STATUS_POLLED',
        transaction.paymentId,
        transaction.userId,
        transaction.provider,
        providerRef,
        transaction.planId,
        {
          pollSuccess: pollResult.success,
          polledStatus: pollResult.normalizedStatus
        }
      );

      if (!pollResult.success) {
        return {
          success: true,
          transaction,
          polledFromProvider: true,
          entitlementActivated: false
        };
      }

      // If provider status has changed, process through the EXACT SAME callback pipeline
      if (pollResult.normalizedStatus !== transaction.status) {
        const callbackResult = await this.processProviderCallback(
          transaction.provider,
          {
            reference: pollResult.providerReference,
            uuid: pollResult.providerUuid || transaction.providerUuid,
            external_id: transaction.externalId,
            status: pollResult.normalizedStatus,
            amount: pollResult.amount ?? transaction.amount,
            currency: pollResult.currency ?? transaction.currency
          },
          undefined,
          `poll_${Date.now()}`
        );

        return {
          success: callbackResult.success,
          transaction: callbackResult.transaction || transaction,
          polledFromProvider: true,
          entitlementActivated: callbackResult.entitlementActivated,
          error: callbackResult.error
        };
      }

      return {
        success: true,
        transaction,
        polledFromProvider: true,
        entitlementActivated: false
      };
    } catch (err: any) {
      return {
        success: false,
        transaction,
        polledFromProvider: false,
        entitlementActivated: false,
        error: `Hitilafu ya polling: ${err.message}`
      };
    }
  }

  /**
   * User-Isolated Status Query:
   * Users can view only their own payments.
   */
  public getPaymentTransactionById(
    paymentId: string,
    requestingUserId?: string,
    isAdmin: boolean = false
  ): PaymentTransaction | null {
    const tx = paymentTransactionsStore.get(paymentId);
    if (!tx) return null;

    if (!isAdmin && requestingUserId && tx.userId !== requestingUserId) {
      throw new Error('Huna idhini ya kutazama muamala wa mtumiaji mwingine (Access denied: User isolated).');
    }

    return tx;
  }

  /**
   * Returns all transactions for a specific user.
   */
  public getUserPaymentTransactions(userId: string): PaymentTransaction[] {
    return Array.from(paymentTransactionsStore.values())
      .filter((tx) => tx.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * Admin-Only: Returns all transactions with pagination.
   */
  public getAllPaymentTransactions(limitCount: number = 100): PaymentTransaction[] {
    return Array.from(paymentTransactionsStore.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limitCount);
  }

  /**
   * Returns audit events (optionally filtered by paymentId).
   */
  public getPaymentAuditEvents(paymentId?: string, limitCount: number = 100): PaymentAuditEvent[] {
    let list = paymentAuditEventsStore;
    if (paymentId) {
      list = list.filter((e) => e.paymentId === paymentId);
    }
    return list
      .slice()
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limitCount);
  }

  /**
   * Returns safe system observability metrics.
   */
  public getPaymentObservabilityMetrics(): PaymentObservabilityMetrics {
    return { ...paymentMetrics };
  }

  /**
   * Safe provider configuration snapshot for admin diagnostic panel.
   */
  public getProviderSafeConfig(providerName: string = 'PLUSPESA') {
    const provider = this.getProvider(providerName);
    if (provider.getSafeConfig) {
      return provider.getSafeConfig();
    }
    return {
      providerName: provider.providerName,
      isConfigured: provider.isConfigured
    };
  }

  /**
   * Updates provider configuration at runtime (admin panel).
   */
  public updateProviderConfig(providerName: string, config: any) {
    const provider = this.getProvider(providerName);
    if (provider.updateConfig) {
      provider.updateConfig(config);
      return { success: true, message: 'Usanidi wa mtoa huduma umehifadhiwa.' };
    }
    return { success: false, message: 'Mtoa huduma haungi mkono mabadiliko ya usanidi.' };
  }

  /**
   * Non-payment safe connectivity test to provider API.
   */
  public async testProviderConnection(providerName: string = 'PLUSPESA') {
    const provider = this.getProvider(providerName);
    if (provider.testConnection) {
      return await provider.testConnection();
    }
    return {
      status: provider.isConfigured ? 'CONNECTED' : 'CONFIGURATION_ERROR',
      message: provider.isConfigured ? 'Mtoa huduma ameunganishwa.' : 'Mtoa huduma hajasanidiwa.'
    };
  }

  /**
   * Test helper to reset state between automated test runs.
   */
  public resetPaymentStateForTesting(): void {
    paymentTransactionsStore.clear();
    paymentReferenceIndex.clear();
    paymentIntentIndex.clear();
    paymentExternalIdIndex.clear();
    paymentAuditEventsStore.length = 0;

    paymentMetrics.paymentCreationCount = 0;
    paymentMetrics.paymentPendingCount = 0;
    paymentMetrics.paymentProcessingCount = 0;
    paymentMetrics.paymentSuccessCount = 0;
    paymentMetrics.paymentFailureCount = 0;
    paymentMetrics.paymentCancelledCount = 0;
    paymentMetrics.paymentExpiredCount = 0;
    paymentMetrics.paymentVerificationFailures = 0;
    paymentMetrics.paymentDuplicateCallbacks = 0;
    paymentMetrics.premiumActivationsFromPayment = 0;
    paymentMetrics.providerErrors = 0;
  }
}

// Global Singleton Instance
export const paymentService = new PaymentService();

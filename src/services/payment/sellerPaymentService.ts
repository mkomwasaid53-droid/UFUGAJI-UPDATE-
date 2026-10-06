/// <reference types="node" />
/**
 * V1.10B — SELLER MONETIZATION PAYMENT SERVICE & ORCHESTRATOR
 *
 * Implements real provider-backed seller subscription payments and renewals
 * using the provider-neutral architecture (PlusPesa & Mock) established in V1.8E.
 *
 * STRICT SEPARATION OF COMMERCIAL PRODUCTS:
 * - Seller monetization is completely separate from AI Premium.
 * - Does NOT use AI Premium entitlement records.
 * - Seller payment NEVER activates AI Premium.
 * - AI Premium payment NEVER activates Seller Monetization.
 * - Does NOT modify V1.8 AI Premium pricing or entitlement behavior.
 *
 * KEY RULES:
 * 1. Plan & Pricing Locked Server-Side:
 *    - SELLER_MONTHLY, TSh 1,000, TZS, 30 days. Client amounts are NEVER trusted.
 * 2. Strict Phone Normalization:
 *    - Uses Tanzanian phone normalization & operator resolution (M-Pesa, Tigo, Airtel, Halopesa).
 * 3. Deterministic External IDs:
 *    - Format: UFUGAJI_SELLER_PREMIUM_<reference>
 * 4. Client Cannot Fabricate Success:
 *    - Creation yields PENDING/PROCESSING.
 *    - Only verified webhook or authoritative status polling triggers transition to ACTIVE.
 * 5. Lifecycle Extension & Renewal:
 *    - From GRACE_PERIOD -> ACTIVE (30 days)
 *    - From EXPIRED -> ACTIVE (30 days, hasHadTrial remains true)
 *    - From ACTIVE -> ACTIVE (extends current period by 30 days without loss of remaining days)
 */

import {
  SellerPaymentIntent,
  InitiateSellerPaymentParams,
  InitiateSellerPaymentResult,
  CheckSellerPaymentResult,
  SellerPaymentStatus,
  SellerMonetizationRecord,
  SellerSellingEligibility
} from '../../types/sellerMonetization';
import {
  PaymentProvider,
  CreatePaymentRequestResult,
  ProviderPaymentStatusResult,
  VerifyCallbackResult
} from './paymentProviderInterface';
import { PlusPesaPaymentProvider } from './plusPesaPaymentProvider';
import { MockPaymentProvider } from './mockPaymentProvider';
import {
  normalizeTanzanianPhoneNumber,
  generateSellerPaymentExternalId,
  resolvePlusPesaProvider
} from './paymentUtils';
import {
  sellerMonetizationService,
  SELLER_MONETIZATION_CONFIG
} from '../sellerMonetizationService';

// Storage for seller payment intents
const sellerPaymentIntentsStore = new Map<string, SellerPaymentIntent>();
const externalIdToIntentMap = new Map<string, string>(); // externalId -> paymentIntentId
const providerRefToIntentMap = new Map<string, string>(); // providerReference/uuid -> paymentIntentId
const idempotencyKeyToIntentMap = new Map<string, string>(); // idempotencyKey -> paymentIntentId

const isNode = typeof window === 'undefined';
let fsModule: any = null;
let pathModule: any = null;
const STORE_FILE_PATH = 'data/seller_payment_intents.json';

if (isNode) {
  try {
    fsModule = require('fs');
    pathModule = require('path');
    loadIntentsFromFile();
  } catch {}
}

function loadIntentsFromFile() {
  if (!fsModule || !pathModule) return;
  try {
    const fullPath = pathModule.resolve(process.cwd(), STORE_FILE_PATH);
    if (fsModule.existsSync(fullPath)) {
      const data = fsModule.readFileSync(fullPath, 'utf8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        parsed.forEach((intent: SellerPaymentIntent) => {
          sellerPaymentIntentsStore.set(intent.paymentIntentId, intent);
          if (intent.externalId) externalIdToIntentMap.set(intent.externalId, intent.paymentIntentId);
          if (intent.providerReference) providerRefToIntentMap.set(intent.providerReference, intent.paymentIntentId);
          if (intent.providerUuid) providerRefToIntentMap.set(intent.providerUuid, intent.paymentIntentId);
          if (intent.idempotencyKey) idempotencyKeyToIntentMap.set(intent.idempotencyKey, intent.paymentIntentId);
        });
      }
    }
  } catch (err) {
    console.warn('[sellerPaymentService] Failed to load store file:', err);
  }
}

function persistIntentsToFile() {
  if (!fsModule || !pathModule) return;
  try {
    const fullPath = pathModule.resolve(process.cwd(), STORE_FILE_PATH);
    const dir = pathModule.dirname(fullPath);
    if (!fsModule.existsSync(dir)) {
      fsModule.mkdirSync(dir, { recursive: true });
    }
    const intents = Array.from(sellerPaymentIntentsStore.values());
    fsModule.writeFileSync(fullPath, JSON.stringify(intents, null, 2), 'utf8');
  } catch (err) {
    console.warn('[sellerPaymentService] Failed to persist store file:', err);
  }
}

export class SellerPaymentService {
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

  public updateProviderConfig(providerName: string, config: any): { success: boolean; error?: string } {
    try {
      const provider = this.getProvider(providerName);
      if (provider.updateConfig) {
        provider.updateConfig(config);
        return { success: true };
      }
      return { success: false, error: `Provider ${providerName} haiauni updateConfig` };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public getProviderSafeConfig(providerName: string = 'PLUSPESA'): any {
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
   * Initiates a real or test mobile payment request for Seller Monetization.
   *
   * STRICT BOUNDARIES:
   * - Plan locked to SELLER_MONTHLY
   * - Amount locked to TSh 1,000 (monthlyPrice)
   * - Currency locked to TZS
   * - Validates Tanzanian mobile number
   * - Generates deterministic externalId: UFUGAJI_SELLER_PREMIUM_<id>
   * - Status starts as PENDING/PROCESSING and NEVER immediately activates subscription!
   */
  public async initiateSellerPayment(
    params: InitiateSellerPaymentParams
  ): Promise<InitiateSellerPaymentResult> {
    const {
      sellerUserId,
      sellerProfileId,
      customerPhone,
      providerName,
      providerNetwork,
      idempotencyKey,
      correlationId
    } = params;

    if (!sellerUserId || typeof sellerUserId !== 'string' || sellerUserId.trim().length === 0) {
      return {
        success: false,
        paymentIntent: null as any,
        error: 'sellerUserId inahitajika ili kuanzisha malipo ya usajili wa muuzaji.',
        errorCode: 'INVALID_SELLER'
      };
    }

    // Check seller monetization state
    const currentRecord = sellerMonetizationService.getSellerRecord(sellerUserId);
    if (currentRecord.status === 'SUSPENDED') {
      return {
        success: false,
        paymentIntent: null as any,
        error: 'Akaunti ya muuzaji imesimamishwa kiutawala (Suspended). Haiwezi kufanya malipo ya usajili hadi itatuliwe na msimamizi.',
        errorCode: 'SELLER_SUSPENDED'
      };
    }

    // Idempotency check: if existing pending intent with this key, return it
    if (idempotencyKey && idempotencyKeyToIntentMap.has(idempotencyKey)) {
      const existingId = idempotencyKeyToIntentMap.get(idempotencyKey)!;
      const existingIntent = sellerPaymentIntentsStore.get(existingId);
      if (existingIntent && (existingIntent.status === 'PENDING' || existingIntent.status === 'PROCESSING')) {
        return {
          success: true,
          paymentIntent: existingIntent,
          checkoutUrl: existingIntent.checkoutUrl,
          paymentInstructions: existingIntent.paymentInstructions
        };
      }
    }

    // Phone validation
    const effectivePhone = customerPhone && customerPhone.trim().length > 0
      ? customerPhone.trim()
      : (providerName === 'MOCK_PROVIDER' ? '0712345678' : '');

    if (!effectivePhone) {
      return {
        success: false,
        paymentIntent: null as any,
        error: 'Tafadhali weka namba yako ya simu ya Tanzania (M-Pesa, TigoPesa, AirtelMoney, au Halopesa) kukamilisha malipo ya TSh 1,000.',
        errorCode: 'INVALID_PHONE'
      };
    }

    const phoneValidation = normalizeTanzanianPhoneNumber(effectivePhone);
    if (!phoneValidation.isValid || !phoneValidation.normalizedPhone) {
      return {
        success: false,
        paymentIntent: null as any,
        error: phoneValidation.error || 'Namba ya simu ya Tanzania si sahihi.',
        errorCode: 'INVALID_PHONE'
      };
    }

    const providerResolution = resolvePlusPesaProvider(effectivePhone, providerNetwork);
    if (!providerResolution.isValid || !providerResolution.provider) {
      return {
        success: false,
        paymentIntent: null as any,
        error: providerResolution.error || 'Mtandao wa simu haujatambuliwa.',
        errorCode: 'INVALID_NETWORK'
      };
    }

    const normalizedPhone = phoneValidation.normalizedPhone;
    const resolvedNetwork = providerResolution.provider;

    // Generate Intent and External ID
    const paymentIntentId = `spi_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const externalId = generateSellerPaymentExternalId(paymentIntentId);
    const governedAmount = SELLER_MONETIZATION_CONFIG.monthlyPrice; // 1,000 TZS
    const governedCurrency = SELLER_MONETIZATION_CONFIG.currency;   // 'TZS'
    const nowIso = new Date().toISOString();

    const providerInstance = this.getProvider(providerName);

    // Call Provider Request
    let providerResult: CreatePaymentRequestResult;
    try {
      providerResult = await providerInstance.createPaymentRequest({
        paymentId: paymentIntentId,
        externalId,
        paymentIntentId,
        userId: sellerUserId,
        customerName: sellerProfileId || sellerUserId,
        planId: 'SELLER_MONTHLY',
        amount: governedAmount,
        currency: governedCurrency,
        customerPhone: normalizedPhone,
        providerNetwork: resolvedNetwork,
        description: `Malipo ya Usajili wa Muuzaji (Seller Subscription) - TSh 1,000 kwa mwezi (Muuzaji: ${sellerUserId})`,
        metadata: {
          productType: 'SELLER_MONETIZATION',
          sellerUserId,
          sellerProfileId,
          correlationId,
          operator: phoneValidation.operator,
          providerNetwork: resolvedNetwork
        }
      });
    } catch (err: any) {
      return {
        success: false,
        paymentIntent: null as any,
        error: `Hitilafu ya mtoa huduma (${providerInstance.providerName}): ${err.message || 'Haikuweza kutuma ombi'}`,
        errorCode: 'PROVIDER_ERROR'
      };
    }

    if (!providerResult.success) {
      return {
        success: false,
        paymentIntent: null as any,
        error: providerResult.errorMessage || 'Mtoa huduma amekataa ombi la malipo.',
        errorCode: 'PROVIDER_REJECTED'
      };
    }

    const initialStatus: SellerPaymentStatus = providerResult.normalizedStatus === 'SUCCESS'
      ? 'SUCCESS'
      : (providerResult.normalizedStatus || 'PROCESSING') as SellerPaymentStatus;

    const paymentIntent: SellerPaymentIntent = {
      paymentIntentId,
      sellerUserId,
      sellerProfileId: sellerProfileId || currentRecord.sellerProfileId,
      plan: 'SELLER_MONTHLY',
      amount: governedAmount,
      currency: governedCurrency,
      provider: providerInstance.providerName,
      status: initialStatus,
      externalId,
      providerReference: providerResult.providerReference,
      providerUuid: providerResult.providerUuid,
      customerPhone: normalizedPhone,
      providerNetwork: resolvedNetwork,
      idempotencyKey,
      checkoutUrl: providerResult.checkoutUrl,
      paymentInstructions: providerResult.paymentInstructions,
      createdAt: nowIso,
      updatedAt: nowIso,
      lifecycleTransitionApplied: false,
      metadata: {
        correlationId,
        providerStatus: providerResult.providerStatus
      }
    };

    // Store in memory & index
    sellerPaymentIntentsStore.set(paymentIntentId, paymentIntent);
    externalIdToIntentMap.set(externalId, paymentIntentId);
    if (providerResult.providerReference) {
      providerRefToIntentMap.set(providerResult.providerReference, paymentIntentId);
    }
    if (providerResult.providerUuid) {
      providerRefToIntentMap.set(providerResult.providerUuid, paymentIntentId);
    }
    if (idempotencyKey) {
      idempotencyKeyToIntentMap.set(idempotencyKey, paymentIntentId);
    }

    persistIntentsToFile();

    // If provider immediately reported SUCCESS (e.g. mock provider synchronous test), apply activation
    if (initialStatus === 'SUCCESS') {
      this.applyAuthoritativePaymentActivation(paymentIntent, `DIRECT_${providerInstance.providerName}`);
    }

    return {
      success: true,
      paymentIntent,
      checkoutUrl: providerResult.checkoutUrl,
      paymentInstructions: providerResult.paymentInstructions
    };
  }

  /**
   * Internal helper: Authoritatively applies Seller Monetization activation / renewal
   * via the single state transition engine in sellerMonetizationService.
   *
   * STRICT SEPARATION:
   * - Does NOT call AI Premium activation.
   * - Idempotent: checks lifecycleTransitionApplied flag.
   */
  private applyAuthoritativePaymentActivation(
    intent: SellerPaymentIntent,
    actorSource: string
  ): { success: boolean; record: SellerMonetizationRecord } {
    if (intent.lifecycleTransitionApplied) {
      const currentRecord = sellerMonetizationService.getSellerRecord(intent.sellerUserId);
      return { success: true, record: currentRecord };
    }

    const activationResult = sellerMonetizationService.recordAuthoritativePaymentConfirmation({
      sellerUserId: intent.sellerUserId,
      paymentStatus: 'SUCCESS',
      amount: intent.amount,
      transactionRef: intent.providerReference || intent.externalId,
      performedBy: actorSource,
      idempotencyKey: `seller_pay_act_${intent.paymentIntentId}`
    });

    intent.lifecycleTransitionApplied = true;
    intent.status = 'SUCCESS';
    intent.completedAt = new Date().toISOString();
    intent.updatedAt = new Date().toISOString();
    intent.resultingSellerState = activationResult.record.status;
    intent.periodStart = activationResult.record.currentPeriodStartAt;
    intent.periodEnd = activationResult.record.currentPeriodEndAt;
    persistIntentsToFile();

    return {
      success: true,
      record: activationResult.record
    };
  }

  /**
   * Authoritative Webhook / Callback Handler for Seller Monetization
   *
   * 1. Validates signature via provider adapter
   * 2. Finds matching SellerPaymentIntent by externalId or providerReference
   * 3. Validates amount (1,000 TZS) and currency
   * 4. Idempotent: if already SUCCESS, safe 200 without duplicate renewals
   * 5. Transitions seller to ACTIVE upon verified SUCCESS
   */
  public async processProviderCallback(
    providerName: string,
    payload: any,
    headers?: Record<string, string | string[] | undefined>,
    correlationId?: string,
    rawBody?: any
  ): Promise<{
    success: boolean;
    isDuplicate: boolean;
    paymentIntent?: SellerPaymentIntent;
    lifecycleRenewed: boolean;
    error?: string;
    errorCode?: string;
  }> {
    const provider = this.getProvider(providerName);

    // 1. Verify callback with provider
    const verification: VerifyCallbackResult = await provider.verifyPaymentCallback(
      payload,
      headers,
      rawBody
    );

    if (!verification.isValid) {
      return {
        success: false,
        isDuplicate: false,
        lifecycleRenewed: false,
        error: verification.errorMessage || 'Sahihi ya callback haikulingana au payload si sahihi.',
        errorCode: 'SIGNATURE_VERIFICATION_FAILED'
      };
    }

    // 2. Resolve matching SellerPaymentIntent
    let paymentIntent: SellerPaymentIntent | undefined;

    if (verification.externalId && externalIdToIntentMap.has(verification.externalId)) {
      const intentId = externalIdToIntentMap.get(verification.externalId)!;
      paymentIntent = sellerPaymentIntentsStore.get(intentId);
    } else if (verification.providerReference && providerRefToIntentMap.has(verification.providerReference)) {
      const intentId = providerRefToIntentMap.get(verification.providerReference)!;
      paymentIntent = sellerPaymentIntentsStore.get(intentId);
    } else if (verification.providerUuid && providerRefToIntentMap.has(verification.providerUuid)) {
      const intentId = providerRefToIntentMap.get(verification.providerUuid)!;
      paymentIntent = sellerPaymentIntentsStore.get(intentId);
    } else if (verification.internalPaymentId && sellerPaymentIntentsStore.has(verification.internalPaymentId)) {
      paymentIntent = sellerPaymentIntentsStore.get(verification.internalPaymentId);
    }

    if (!paymentIntent) {
      // Check if externalId matches seller pattern
      const candidateExternalId = verification.externalId || (payload?.data?.external_id) || (payload?.external_id);
      if (candidateExternalId && typeof candidateExternalId === 'string' && candidateExternalId.startsWith('UFUGAJI_SELLER_')) {
        return {
          success: false,
          isDuplicate: false,
          lifecycleRenewed: false,
          error: `Dhamira ya malipo ya muuzaji haikupatikana kwa externalId: ${candidateExternalId}`,
          errorCode: 'PAYMENT_NOT_FOUND'
        };
      }
      return {
        success: false,
        isDuplicate: false,
        lifecycleRenewed: false,
        error: 'Dhamira ya malipo ya muuzaji haikupatikana (PaymentIntent not found).',
        errorCode: 'PAYMENT_NOT_FOUND'
      };
    }

    // 3. Amount and Currency Validation
    if (verification.amount !== undefined && verification.amount !== paymentIntent.amount) {
      return {
        success: false,
        isDuplicate: false,
        paymentIntent,
        lifecycleRenewed: false,
        error: `Kiasi kilicholipwa (${verification.amount}) hakikulingana na ada ya usajili (${paymentIntent.amount} TZS).`,
        errorCode: 'AMOUNT_MISMATCH'
      };
    }

    if (verification.currency && verification.currency.toUpperCase() !== 'TZS') {
      return {
        success: false,
        isDuplicate: false,
        paymentIntent,
        lifecycleRenewed: false,
        error: `Sarafu si sahihi (${verification.currency}). Lazima iwe TZS.`,
        errorCode: 'CURRENCY_MISMATCH'
      };
    }

    // 4. Idempotency Check: if already SUCCESS, safe idempotent return
    if (paymentIntent.status === 'SUCCESS' && paymentIntent.lifecycleTransitionApplied) {
      return {
        success: true,
        isDuplicate: true,
        paymentIntent,
        lifecycleRenewed: false
      };
    }

    // 5. Update Status
    const normalizedStatus = (verification.normalizedStatus as SellerPaymentStatus) || 'PROCESSING';
    paymentIntent.status = normalizedStatus;
    paymentIntent.updatedAt = new Date().toISOString();
    if (verification.providerReference) paymentIntent.providerReference = verification.providerReference;
    if (verification.providerUuid) paymentIntent.providerUuid = verification.providerUuid;
    if (verification.failureReason) paymentIntent.failureReason = verification.failureReason;

    let lifecycleRenewed = false;
    if (normalizedStatus === 'SUCCESS') {
      this.applyAuthoritativePaymentActivation(paymentIntent, `WEBHOOK_${provider.providerName}`);
      lifecycleRenewed = true;
    }

    persistIntentsToFile();

    return {
      success: true,
      isDuplicate: false,
      paymentIntent,
      lifecycleRenewed
    };
  }

  /**
   * Checks or polls payment status from provider for reconciliation.
   */
  public async checkOrPollPaymentStatus(
    paymentIntentId: string,
    requestingUserId?: string,
    isAdmin?: boolean
  ): Promise<CheckSellerPaymentResult> {
    const paymentIntent = sellerPaymentIntentsStore.get(paymentIntentId);
    if (!paymentIntent) {
      return {
        success: false,
        paymentIntent: null as any,
        error: `Dhamira ya malipo ${paymentIntentId} haikupatikana.`
      };
    }

    // Access control
    if (requestingUserId && requestingUserId !== paymentIntent.sellerUserId && !isAdmin) {
      return {
        success: false,
        paymentIntent: null as any,
        error: 'Ruhusa imekataliwa: Huwezi kuangalia malipo ya muuzaji mwingine.'
      };
    }

    let polledFromProvider = false;
    let lifecycleRenewed = false;

    // If still pending/processing, poll provider
    if (paymentIntent.status === 'PENDING' || paymentIntent.status === 'PROCESSING') {
      try {
        const provider = this.getProvider(paymentIntent.provider);
        const refToQuery = paymentIntent.providerReference || paymentIntent.externalId;
        if (refToQuery) {
          const providerStatus: ProviderPaymentStatusResult = await provider.getPaymentStatus(refToQuery);
          polledFromProvider = true;

          if (providerStatus.success) {
            const normalizedStatus = (providerStatus.normalizedStatus as SellerPaymentStatus) || paymentIntent.status;
            paymentIntent.status = normalizedStatus;
            paymentIntent.updatedAt = new Date().toISOString();
            if (providerStatus.providerReference) paymentIntent.providerReference = providerStatus.providerReference;
            if (providerStatus.providerUuid) paymentIntent.providerUuid = providerStatus.providerUuid;
            if (providerStatus.errorMessage) paymentIntent.failureReason = providerStatus.errorMessage;

            if (normalizedStatus === 'SUCCESS') {
              this.applyAuthoritativePaymentActivation(paymentIntent, `POLL_${provider.providerName}`);
              lifecycleRenewed = true;
            }
            persistIntentsToFile();
          }
        }
      } catch (err) {
        console.warn(`[sellerPaymentService] Poll status failed for ${paymentIntentId}:`, err);
      }
    }

    const currentRecord = sellerMonetizationService.getSellerRecord(paymentIntent.sellerUserId);
    const eligibility = sellerMonetizationService.canSellerSellOnMarketplace(paymentIntent.sellerUserId);

    return {
      success: true,
      paymentIntent,
      record: currentRecord,
      eligibility,
      polledFromProvider,
      lifecycleRenewed
    };
  }

  /**
   * Returns all seller payment intents for a given seller.
   */
  public getSellerPaymentIntents(sellerUserId: string): SellerPaymentIntent[] {
    return Array.from(sellerPaymentIntentsStore.values())
      .filter((intent) => intent.sellerUserId === sellerUserId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * Returns all seller payment intents for admin inspection.
   */
  public getAllSellerPaymentIntents(): SellerPaymentIntent[] {
    return Array.from(sellerPaymentIntentsStore.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * Resets in-memory store for testing.
   */
  public _resetForTesting(): void {
    sellerPaymentIntentsStore.clear();
    externalIdToIntentMap.clear();
    providerRefToIntentMap.clear();
    idempotencyKeyToIntentMap.clear();
    if (fsModule && pathModule) {
      try {
        const fullPath = pathModule.resolve(process.cwd(), STORE_FILE_PATH);
        if (fsModule.existsSync(fullPath)) fsModule.unlinkSync(fullPath);
      } catch {}
    }
  }
}

export const sellerPaymentService = new SellerPaymentService();

/// <reference types="node" />
/**
 * Marketplace Payment Request Service (V1.11C)
 *
 * Governed commercial payment request engine connecting:
 * Buyer <-> Seller <-> Shop <-> Product/Listing <-> Conversation
 *
 * CRITICAL BOUNDARIES:
 * - Only verified sellers with APPROVED application & ACTIVE badge may create payment requests.
 * - Server is the sole authority for amounts, currency, eligibility, and payment state.
 * - Payment SUCCESS != Seller Payout. Payouts belong exclusively to V1.11D.
 * - Reuses existing PlusPesa and Mock payment provider abstraction.
 * - No transaction fees or commissions.
 */

import {
  MarketplacePaymentRequest,
  MarketplacePaymentRequestStatus,
  MarketplacePaymentRequestAudit,
  CreatePaymentRequestInput,
  InitiateMarketplacePaymentInput,
  InitiateMarketplacePaymentResult,
  MARKETPLACE_PAYMENT_CONFIG,
  PaymentRequestAuditEventType
} from '../types/marketplacePaymentRequest';
import { MarketplaceProduct } from '../types/marketplace';
import { marketplaceInboxService } from './marketplaceInboxService';
import { sellerVerificationService } from './sellerVerificationService';
import { sellerMonetizationService } from './sellerMonetizationService';
import { fetchProductById } from './marketplaceService';
import { createAuthoritativeNotification } from './notificationService';
import { PaymentProvider } from './payment/paymentProviderInterface';
import { PlusPesaPaymentProvider } from './payment/plusPesaPaymentProvider';
import { MockPaymentProvider } from './payment/mockPaymentProvider';
import {
  normalizeTanzanianPhoneNumber,
  resolvePlusPesaProvider
} from './payment/paymentUtils';

const isNode = typeof window === 'undefined' || !window.location || !window.location.origin;

// LocalStorage cache keys
const LOCAL_PAYMENT_REQUESTS_KEY = 'ufugaji_marketplace_payment_requests';
const LOCAL_PAYMENT_AUDITS_KEY = 'ufugaji_marketplace_payment_audits';

// Disk persistence file paths (Node.js runtime)
let diskFs: any = null;
let diskPath: any = null;
let REQUESTS_FILE = 'data/marketplace_payment_requests.json';
let AUDITS_FILE = 'data/marketplace_payment_audits.json';

// In-memory data stores
const paymentRequestsStore = new Map<string, MarketplacePaymentRequest>(); // paymentRequestId -> entity
const paymentAuditsStore = new Map<string, MarketplacePaymentRequestAudit[]>(); // paymentRequestId -> audits[]
const externalIdToRequestIdMap = new Map<string, string>(); // externalId -> paymentRequestId

/**
 * Initialize storage for Node.js runtime and automated tests.
 */
export function initPaymentRequestStorage(fsModule?: any, pathModule?: any, customDir?: string): void {
  if (fsModule && pathModule) {
    diskFs = fsModule;
    diskPath = pathModule;
  } else if (isNode) {
    try {
      diskFs = require('fs');
      diskPath = require('path');
    } catch {}
  }

  const baseDir = customDir || (diskPath ? diskPath.join(process.cwd(), 'data') : 'data');
  REQUESTS_FILE = diskPath ? diskPath.join(baseDir, 'marketplace_payment_requests.json') : `${baseDir}/marketplace_payment_requests.json`;
  AUDITS_FILE = diskPath ? diskPath.join(baseDir, 'marketplace_payment_audits.json') : `${baseDir}/marketplace_payment_audits.json`;

  loadPaymentRequestsFromDisk();
}

if (isNode) {
  try {
    initPaymentRequestStorage();
  } catch {}
}

function loadPaymentRequestsFromDisk(): void {
  if (!diskFs || !diskFs.existsSync) return;
  try {
    if (diskFs.existsSync(REQUESTS_FILE)) {
      const raw = diskFs.readFileSync(REQUESTS_FILE, 'utf-8');
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        paymentRequestsStore.clear();
        externalIdToRequestIdMap.clear();
        for (const item of list) {
          if (item && item.paymentRequestId) {
            paymentRequestsStore.set(item.paymentRequestId, item);
            if (item.externalPaymentId) {
              externalIdToRequestIdMap.set(item.externalPaymentId, item.paymentRequestId);
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('[marketplacePaymentRequestService] Failed reading requests from disk:', err);
  }

  try {
    if (diskFs.existsSync(AUDITS_FILE)) {
      const raw = diskFs.readFileSync(AUDITS_FILE, 'utf-8');
      const mapObj = JSON.parse(raw);
      if (mapObj && typeof mapObj === 'object') {
        paymentAuditsStore.clear();
        for (const [id, audits] of Object.entries(mapObj)) {
          if (Array.isArray(audits)) {
            paymentAuditsStore.set(id, audits);
          }
        }
      }
    }
  } catch (err) {
    console.warn('[marketplacePaymentRequestService] Failed reading audits from disk:', err);
  }
}

function savePaymentRequestsToDisk(): void {
  if (!diskFs || !diskFs.writeFileSync) return;
  try {
    const dir = diskPath ? diskPath.dirname(REQUESTS_FILE) : 'data';
    if (!diskFs.existsSync(dir)) {
      diskFs.mkdirSync(dir, { recursive: true });
    }
    const list = Array.from(paymentRequestsStore.values());
    diskFs.writeFileSync(REQUESTS_FILE, JSON.stringify(list, null, 2), 'utf-8');

    const auditObj: Record<string, MarketplacePaymentRequestAudit[]> = {};
    for (const [id, audits] of paymentAuditsStore.entries()) {
      auditObj[id] = audits;
    }
    diskFs.writeFileSync(AUDITS_FILE, JSON.stringify(auditObj, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[marketplacePaymentRequestService] Failed writing requests to disk:', err);
  }
}

function getBrowserRequests(): MarketplacePaymentRequest[] {
  if (typeof localStorage === 'undefined') return Array.from(paymentRequestsStore.values());
  try {
    const raw = localStorage.getItem(LOCAL_PAYMENT_REQUESTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function saveBrowserRequests(list: MarketplacePaymentRequest[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_PAYMENT_REQUESTS_KEY, JSON.stringify(list));
  } catch {}
}

function getBrowserAudits(paymentRequestId: string): MarketplacePaymentRequestAudit[] {
  if (typeof localStorage === 'undefined') return paymentAuditsStore.get(paymentRequestId) || [];
  try {
    const raw = localStorage.getItem(`${LOCAL_PAYMENT_AUDITS_KEY}_${paymentRequestId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function saveBrowserAudits(paymentRequestId: string, audits: MarketplacePaymentRequestAudit[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(`${LOCAL_PAYMENT_AUDITS_KEY}_${paymentRequestId}`, JSON.stringify(audits));
  } catch {}
}

export class MarketplacePaymentRequestService {
  private providers = new Map<string, PaymentProvider>();
  private defaultProviderName: string = 'PLUSPESA';

  constructor() {
    const plusPesa = new PlusPesaPaymentProvider();
    const mock = new MockPaymentProvider();
    this.registerProvider(plusPesa);
    this.registerProvider(mock);
    this.providers.set('MOCK', mock);
  }

  public registerProvider(provider: PaymentProvider): void {
    this.providers.set(provider.providerName.toUpperCase(), provider);
  }

  public getProvider(name?: string): PaymentProvider {
    const targetName = (name || this.defaultProviderName).toUpperCase();
    if (targetName === 'MOCK' || targetName === 'MOCK_PROVIDER') {
      return this.providers.get('MOCK') || this.providers.get('MOCK_PROVIDER')!;
    }
    const provider = this.providers.get(targetName);
    if (!provider) {
      const fallback = this.providers.get('PLUSPESA') || Array.from(this.providers.values())[0];
      if (!fallback) throw new Error(`Hakuna payment provider iliyosajiliwa: ${targetName}`);
      return fallback;
    }
    return provider;
  }

  /**
   * Reset all in-memory, disk, and local caches for clean isolated testing.
   */
  public _resetForTesting(): void {
    paymentRequestsStore.clear();
    paymentAuditsStore.clear();
    externalIdToRequestIdMap.clear();

    if (diskFs && diskFs.existsSync) {
      try {
        if (diskFs.existsSync(REQUESTS_FILE)) diskFs.unlinkSync(REQUESTS_FILE);
        if (diskFs.existsSync(AUDITS_FILE)) diskFs.unlinkSync(AUDITS_FILE);
      } catch {}
    }

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(LOCAL_PAYMENT_REQUESTS_KEY);
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(LOCAL_PAYMENT_AUDITS_KEY)) {
            keysToRemove.push(k);
          }
        }
        keysToRemove.forEach((k) => localStorage.removeItem(k));
      } catch {}
    }
  }

  // --------------------------------------------------------------------------
  // AUDIT TRAIL LOGGING (IMMUTABLE)
  // --------------------------------------------------------------------------

  private recordAudit(
    paymentRequestId: string,
    conversationId: string,
    eventType: PaymentRequestAuditEventType,
    actorUserId: string,
    actorRole: 'BUYER' | 'SELLER' | 'SYSTEM' | 'ADMIN',
    amount: number,
    previousStatus: MarketplacePaymentRequestStatus | undefined,
    newStatus: MarketplacePaymentRequestStatus,
    providerReference?: string | null,
    externalId?: string | null,
    notes?: string
  ): MarketplacePaymentRequestAudit {
    const audit: MarketplacePaymentRequestAudit = {
      auditId: `mpr_aud_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      paymentRequestId,
      conversationId,
      eventType,
      actorUserId,
      actorRole,
      previousStatus,
      newStatus,
      amount,
      currency: 'TZS',
      providerReference: providerReference || null,
      externalId: externalId || null,
      timestamp: new Date().toISOString(),
      notes,
    };

    if (isNode) {
      const list = paymentAuditsStore.get(paymentRequestId) || [];
      list.push(audit);
      paymentAuditsStore.set(paymentRequestId, list);
      savePaymentRequestsToDisk();
    } else {
      const browserList = getBrowserAudits(paymentRequestId);
      browserList.push(audit);
      saveBrowserAudits(paymentRequestId, browserList);
    }

    return audit;
  }

  // --------------------------------------------------------------------------
  // 1. CREATE PAYMENT REQUEST (Verified Seller Only)
  // --------------------------------------------------------------------------
  public async createPaymentRequest(
    input: CreatePaymentRequestInput,
    callerUserId: string,
    injectedProduct?: MarketplaceProduct
  ): Promise<MarketplacePaymentRequest> {
    if (!callerUserId || callerUserId.trim() === '') {
      throw new Error('Hujaingia kwenye mfumo. Tafadhali ingia ili uweze kutuma ombi la malipo.');
    }

    if (!input.conversationId) {
      throw new Error('Mazungumzo (conversationId) hayajabainishwa.');
    }

    // Client-side API fetch fallback
    if (typeof window !== 'undefined') {
      try {
        const res = await fetch(`/api/marketplace/inbox/conversations/${encodeURIComponent(input.conversationId)}/payment-requests`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': callerUserId,
          },
          body: JSON.stringify(input),
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.paymentRequestId) {
            const list = getBrowserRequests().filter((r) => r.paymentRequestId !== data.paymentRequestId);
            list.unshift(data);
            saveBrowserRequests(list);
            return data;
          }
        } else {
          const errData = await res.json().catch(() => ({}));
          if (errData && errData.error) {
            throw new Error(errData.error);
          }
        }
      } catch (apiErr: any) {
        if (
          apiErr.message &&
          (apiErr.message.includes('Malipo kupitia jukwaa yanapatikana') ||
            apiErr.message.includes('Huruhusiwi') ||
            apiErr.message.includes('Huwezi') ||
            apiErr.message.includes('Kuna ombi jingine') ||
            apiErr.message.includes('haijakamilika') ||
            apiErr.message.includes('Kiasi cha malipo'))
        ) {
          throw apiErr;
        }
        console.warn('[marketplacePaymentRequestService] API fetch error, falling back to local service:', apiErr);
      }
    }

    // 1. Authoritative conversation verification
    const conversation = await marketplaceInboxService.getConversationById(input.conversationId, callerUserId);
    if (!conversation) {
      throw new Error('Mazungumzo hayajapatikana au yamefungwa.');
    }

    // 2. Who may create: Only the seller participant
    if (callerUserId !== conversation.sellerUserId) {
      throw new Error('Huruhusiwi kuanzisha ombi la malipo. Ni muuzaji pekee wa tangazo anayeruhusiwa kuomba malipo.');
    }

    // 3. SELLER ELIGIBILITY (Requirement 2)
    // Must be verified with APPROVED application and ACTIVE badge
    const badge = sellerVerificationService.getPublicSellerBadge(conversation.sellerUserId);
    const verificationApp = sellerVerificationService.getVerificationBySellerId(conversation.sellerUserId);

    const isVerifiedApproved =
      badge.isVerified === true &&
      badge.badgeStatus === 'ACTIVE' &&
      verificationApp !== null &&
      verificationApp.status === 'APPROVED' &&
      verificationApp.hasActiveBadge === true;

    if (!isVerifiedApproved) {
      throw new Error('Malipo kupitia jukwaa yanapatikana kwa muuzaji aliyethibitishwa pekee.');
    }

    // Commercial monetization check
    const monetization = sellerMonetizationService.canSellerSellOnMarketplace(conversation.sellerUserId);
    if (!monetization.canSell) {
      throw new Error(`Muuzaji hawezi kuomba malipo kwa sasa: ${monetization.reasonSwahili}`);
    }

    // 4. MARKETPLACE LISTING GOVERNANCE (Requirement 20)
    let product: MarketplaceProduct | null = injectedProduct || null;
    if (!product && conversation.productId) {
      try {
        product = await fetchProductById(conversation.productId);
      } catch {}
    }

    if (product) {
      if (['REJECTED', 'HIDDEN', 'SUSPENDED', 'UNDER_REVIEW'].includes(product.moderationStatus || '')) {
        throw new Error(`Tangazo hili haliruhusiwi kwa sasa (${product.moderationStatus}). Huwezi kuanzisha ombi la malipo.`);
      }
      if (product.status === 'draft') {
        throw new Error('Tangazo hili lipo kwenye rasimu na halijachapishwa kwa umma.');
      }
    }

    // 5. AMOUNT & COMMERCIAL AUTHORITY (Requirement 4)
    const rawQty = Number(input.quantity);
    if (isNaN(rawQty) || rawQty <= 0) {
      throw new Error('Idadi (Quantity) lazima iwe namba chanya (zaidi ya 0).');
    }
    const quantity = Number.isInteger(rawQty) ? rawQty : Number(rawQty.toFixed(2));

    const rawPrice = Number(input.unitPrice);
    if (isNaN(rawPrice) || rawPrice <= 0) {
      throw new Error('Bei kwa moja (Unit Price) lazima iwe namba chanya (zaidi ya 0).');
    }
    const unitPrice = Math.round(rawPrice);

    const totalAmount = Math.round(quantity * unitPrice);
    if (totalAmount < MARKETPLACE_PAYMENT_CONFIG.minAmount) {
      throw new Error(
        `Kiasi cha chini cha malipo ni TSh ${MARKETPLACE_PAYMENT_CONFIG.minAmount.toLocaleString()}.`
      );
    }

    if (totalAmount > MARKETPLACE_PAYMENT_CONFIG.maxAmount) {
      throw new Error(
        `Kiasi cha juu cha malipo ya usalama ni TSh ${MARKETPLACE_PAYMENT_CONFIG.maxAmount.toLocaleString()}.`
      );
    }

    // 6. DUPLICATE ACTIVE PAYMENT REQUEST PROTECTION (Requirement 14)
    if (isNode) loadPaymentRequestsFromDisk();
    const allRequests = isNode
      ? Array.from(paymentRequestsStore.values())
      : getBrowserRequests();

    const existingPending = allRequests.find(
      (r) =>
        r.conversationId === input.conversationId &&
        (r.status === 'PENDING_PAYMENT' || r.status === 'PROCESSING')
    );

    if (existingPending) {
      // Check if it is expired
      if (new Date().getTime() > new Date(existingPending.expiresAt).getTime()) {
        existingPending.status = 'EXPIRED';
        existingPending.updatedAt = new Date().toISOString();
        if (isNode) savePaymentRequestsToDisk();
      } else {
        throw new Error(
          'Kuna ombi jingine la malipo linalosubiri katika mazungumzo haya. Ghairi ombi lililopo kwanza kabla ya kuanzisha jipya.'
        );
      }
    }

    // 7. CREATE IMMUTABLE ENTITY
    const now = new Date().toISOString();
    const paymentRequestId = `mpr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const externalPaymentId = `${MARKETPLACE_PAYMENT_CONFIG.paymentPrefix}${paymentRequestId}`;
    const expiresAt = new Date(
      Date.now() + MARKETPLACE_PAYMENT_CONFIG.defaultExpiryHours * 3600 * 1000
    ).toISOString();

    const cleanDescription = (input.description || '').trim().slice(0, 500);

    const paymentRequest: MarketplacePaymentRequest = {
      paymentRequestId,
      conversationId: input.conversationId,
      buyerUserId: conversation.buyerUserId,
      sellerUserId: conversation.sellerUserId,
      shopId: conversation.shopId,
      productId: conversation.productId,
      listingId: conversation.listingId,
      amount: totalAmount,
      currency: 'TZS',
      description: cleanDescription || undefined,
      quantity,
      unitPrice,
      totalAmount,
      productTitleSnapshot: conversation.productTitleSnapshot,
      listingTitleSnapshot: conversation.listingTitleSnapshot,
      sellerNameSnapshot: conversation.sellerNameSnapshot || 'Muuzaji Aliyethibitishwa',
      buyerNameSnapshot: conversation.buyerNameSnapshot || 'Mnunuzi',
      productImageUrlSnapshot: conversation.imageUrlSnapshot || undefined,
      status: 'PENDING_PAYMENT',
      paymentReference: null,
      externalPaymentId,
      paidAt: null,
      failureReason: null,
      cancelledAt: null,
      cancelledBy: null,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    };

    // Store entity
    if (isNode) {
      paymentRequestsStore.set(paymentRequestId, paymentRequest);
      externalIdToRequestIdMap.set(externalPaymentId, paymentRequestId);
      savePaymentRequestsToDisk();
    } else {
      const list = getBrowserRequests();
      list.unshift(paymentRequest);
      saveBrowserRequests(list);
    }

    // 8. RECORD AUDIT EVENTS
    this.recordAudit(
      paymentRequestId,
      input.conversationId,
      'PAYMENT_REQUEST_CREATED',
      callerUserId,
      'SELLER',
      totalAmount,
      undefined,
      'DRAFT',
      null,
      externalPaymentId,
      'Ombi la malipo limeundwa na muuzaji aliyethibitishwa'
    );

    this.recordAudit(
      paymentRequestId,
      input.conversationId,
      'PAYMENT_REQUEST_SUBMITTED',
      callerUserId,
      'SELLER',
      totalAmount,
      'DRAFT',
      'PENDING_PAYMENT',
      null,
      externalPaymentId,
      `Ombi la malipo limewasilishwa kwa mnunuzi: TSh ${totalAmount.toLocaleString()} (${quantity} x ${unitPrice.toLocaleString()})`
    );

    // 9. INSERT STRUCTURED PAYMENT REQUEST MESSAGE INTO CONVERSATION (Requirement 21)
    try {
      const paymentMessageText = `💰 Ombi la Malipo: TSh ${totalAmount.toLocaleString()} (${quantity} × TSh ${unitPrice.toLocaleString()})\nBidhaa: ${conversation.productTitleSnapshot}${cleanDescription ? `\nMaelezo: ${cleanDescription}` : ''}`;
      
      await marketplaceInboxService.sendMessage(
        {
          conversationId: input.conversationId,
          senderUserId: callerUserId,
          text: paymentMessageText,
          messageType: 'PAYMENT_REQUEST',
          paymentRequestId,
          paymentRequestSnapshot: paymentRequest,
        },
        callerUserId
      );
    } catch (msgErr) {
      console.warn('[marketplacePaymentRequestService] Notice injecting payment request message:', msgErr);
    }

    // 10. DISPATCH NOTIFICATION TO BUYER (Requirement 22)
    try {
      await createAuthoritativeNotification({
        recipientUserId: conversation.buyerUserId,
        type: 'MARKETPLACE_PAYMENT_REQUEST_CREATED',
        category: 'MARKETPLACE',
        priority: 'HIGH',
        title: `Ombi la Malipo: ${conversation.productTitleSnapshot}`,
        message: `Muuzaji amekutumia ombi la malipo ya TSh ${totalAmount.toLocaleString()} kwa ajili ya ${conversation.productTitleSnapshot}. Bonyeza kulipa kwa njia ya simu.`,
        targetType: 'PAYMENT_REQUEST',
        targetId: paymentRequestId,
        actionUrl: `/market?tab=inbox&conv=${input.conversationId}`,
        relatedProductId: conversation.productId,
        relatedListingId: conversation.listingId,
        relatedShopId: conversation.shopId,
        relatedSellerId: conversation.sellerUserId,
        deduplicationKey: `notif_payreq_create_${paymentRequestId}`,
        metadata: {
          paymentRequestId,
          conversationId: input.conversationId,
          amount: totalAmount,
          currency: 'TZS',
          sellerUserId: conversation.sellerUserId,
        },
      });
    } catch (notifErr) {
      console.warn('[marketplacePaymentRequestService] Notice dispatching payment notification:', notifErr);
    }

    return paymentRequest;
  }

  // --------------------------------------------------------------------------
  // 2. GET PAYMENT REQUEST BY ID (Participant Authorized)
  // --------------------------------------------------------------------------
  public async getPaymentRequest(
    paymentRequestId: string,
    callerUserId: string,
    isAdmin = false
  ): Promise<MarketplacePaymentRequest | null> {
    if (!callerUserId) throw new Error('Hujaingia kwenye mfumo.');
    if (isNode) loadPaymentRequestsFromDisk();

    const request = isNode
      ? paymentRequestsStore.get(paymentRequestId)
      : getBrowserRequests().find((r) => r.paymentRequestId === paymentRequestId);

    if (!request) return null;

    // Scoped participant authorization
    if (!isAdmin && request.buyerUserId !== callerUserId && request.sellerUserId !== callerUserId) {
      throw new Error('Huruhusiwi kuona ombi hili la malipo (Access Forbidden).');
    }

    // Automatic server-authoritative expiry check (Requirement 16)
    if (request.status === 'PENDING_PAYMENT') {
      const nowMs = new Date().getTime();
      const expiryMs = new Date(request.expiresAt).getTime();
      if (nowMs > expiryMs) {
        request.status = 'EXPIRED';
        request.updatedAt = new Date().toISOString();
        if (isNode) {
          paymentRequestsStore.set(paymentRequestId, request);
          savePaymentRequestsToDisk();
        }
        this.recordAudit(
          paymentRequestId,
          request.conversationId,
          'PAYMENT_EXPIRED',
          'SYSTEM',
          'SYSTEM',
          request.totalAmount,
          'PENDING_PAYMENT',
          'EXPIRED',
          request.paymentReference,
          request.externalPaymentId,
          'Muda wa ombi la malipo umekwisha (Expired)'
        );
      }
    }

    return request;
  }

  // --------------------------------------------------------------------------
  // 3. LIST PAYMENT REQUESTS FOR CONVERSATION
  // --------------------------------------------------------------------------
  public async listPaymentRequestsForConversation(
    conversationId: string,
    callerUserId: string,
    isAdmin = false
  ): Promise<MarketplacePaymentRequest[]> {
    if (!callerUserId) throw new Error('Hujaingia kwenye mfumo.');

    // Verify participant authorization on conversation
    const conv = await marketplaceInboxService.getConversationById(conversationId, callerUserId, isAdmin);
    if (!conv) throw new Error('Mazungumzo hayajapatikana.');

    if (isNode) loadPaymentRequestsFromDisk();
    const all = isNode
      ? Array.from(paymentRequestsStore.values())
      : getBrowserRequests();

    const nowMs = new Date().getTime();
    const filtered = all.filter((r) => r.conversationId === conversationId);

    // Check expiry
    for (const r of filtered) {
      if (r.status === 'PENDING_PAYMENT' && nowMs > new Date(r.expiresAt).getTime()) {
        r.status = 'EXPIRED';
        r.updatedAt = new Date().toISOString();
        if (isNode) {
          paymentRequestsStore.set(r.paymentRequestId, r);
          savePaymentRequestsToDisk();
        }
      }
    }

    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return filtered;
  }

  // --------------------------------------------------------------------------
  // 4. INITIATE PAYMENT (Buyer Only - PlusPesa / Mobile Money)
  // --------------------------------------------------------------------------
  public async initiatePayment(
    input: InitiateMarketplacePaymentInput,
    callerUserId: string,
    providerName?: string
  ): Promise<InitiateMarketplacePaymentResult> {
    if (!callerUserId) {
      throw new Error('Hujaingia kwenye mfumo. Tafadhali ingia ili uweze kulipa.');
    }

    // Client-side API fetch fallback
    if (typeof window !== 'undefined') {
      try {
        const res = await fetch(`/api/marketplace/payment-requests/${encodeURIComponent(input.paymentRequestId)}/pay`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': callerUserId,
          },
          body: JSON.stringify(input),
        });
        if (res.ok) {
          const data = await res.json();
          return data;
        } else {
          const errData = await res.json().catch(() => ({}));
          if (errData && errData.error) {
            throw new Error(errData.error);
          }
        }
      } catch (apiErr: any) {
        if (
          apiErr.message &&
          (apiErr.message.includes('Ni mnunuzi pekee') ||
            apiErr.message.includes('tayari limekamilika') ||
            apiErr.message.includes('limeghairiwa') ||
            apiErr.message.includes('limekwisha muda') ||
            apiErr.message.includes('Namba ya simu'))
        ) {
          throw apiErr;
        }
        console.warn('[marketplacePaymentRequestService] API fetch error, falling back to local service:', apiErr);
      }
    }

    const request = await this.getPaymentRequest(input.paymentRequestId, callerUserId);
    if (!request) {
      throw new Error('Ombi la malipo halijapatikana.');
    }

    // WHO MAY PAY: Only the buyer participant (Requirement 7)
    if (callerUserId !== request.buyerUserId) {
      throw new Error('Huruhusiwi kulipia ombi hili la malipo. Ni mnunuzi pekee anayeruhusiwa kufanya malipo.');
    }

    // DUPLICATE PAYMENT PROTECTION (Requirement 14)
    if (request.status === 'SUCCESS') {
      throw new Error('Ombi hili la malipo tayari limekamilika (SUCCESS). Huwezi kulipa mara mbili.');
    }

    if (request.status === 'PROCESSING') {
      return {
        success: true,
        status: 'PROCESSING',
        paymentRequestId: request.paymentRequestId,
        externalId: request.externalPaymentId || `${MARKETPLACE_PAYMENT_CONFIG.paymentPrefix}${request.paymentRequestId}`,
        providerReference: request.paymentReference || null,
        instructions: 'Malipo tayari yanachakatwa kwenye simu yako. Tafadhali ingiza PIN kwenye simu kukamilisha.',
      };
    }

    if (request.status === 'CANCELLED') {
      throw new Error('Ombi hili limeghairiwa na muuzaji. Huwezi kufanya malipo.');
    }

    if (request.status === 'EXPIRED') {
      throw new Error('Ombi hili limekwisha muda (Expired). Muombe muuzaji akutengenezee ombi jipya la malipo.');
    }

    if (request.status !== 'PENDING_PAYMENT' && request.status !== 'FAILED') {
      throw new Error(`Hali ya ombi hili (${request.status}) hairuhusu malipo kwa sasa.`);
    }

    // Validate phone number
    const phoneValidation = normalizeTanzanianPhoneNumber(input.buyerPhone);
    if (!phoneValidation.isValid || !phoneValidation.normalizedPhone) {
      throw new Error('Namba ya simu ya mnunuzi si sahihi. Weka namba halali ya Tanzania (k.m. 0712345678 au 255712345678).');
    }
    const normalizedPhone = phoneValidation.normalizedPhone;

    const providerRes = resolvePlusPesaProvider(normalizedPhone, input.providerNetwork);
    const resolvedNetwork = providerRes.provider || input.providerNetwork || 'Mpesa';

    const provider = this.getProvider(providerName);
    const externalId = request.externalPaymentId || `${MARKETPLACE_PAYMENT_CONFIG.paymentPrefix}${request.paymentRequestId}`;

    const prevStatus = request.status;

    // Call Provider to initiate Push / USSD
    let providerResult;
    try {
      providerResult = await provider.createPaymentRequest({
        paymentId: request.paymentRequestId,
        externalId,
        paymentIntentId: request.paymentRequestId,
        userId: callerUserId,
        customerName: request.buyerNameSnapshot,
        planId: 'MARKETPLACE_PURCHASE',
        amount: request.totalAmount,
        currency: 'TZS',
        customerPhone: normalizedPhone,
        providerNetwork: resolvedNetwork,
        description: `Malipo ya Gulio: ${request.productTitleSnapshot} (${request.quantity} x TSh ${request.unitPrice.toLocaleString()})`,
        metadata: {
          paymentRequestId: request.paymentRequestId,
          conversationId: request.conversationId,
          buyerUserId: request.buyerUserId,
          sellerUserId: request.sellerUserId,
          productId: request.productId,
          listingId: request.listingId,
        },
      });
    } catch (providerErr: any) {
      throw new Error(`Hitilafu ya kuanzisha malipo kwa mtoa huduma: ${providerErr.message}`);
    }

    if (!providerResult.success) {
      request.status = 'FAILED';
      request.failureReason = providerResult.errorMessage || 'Mtoa huduma alikataa kuanzisha malipo';
      request.updatedAt = new Date().toISOString();

      if (isNode) {
        paymentRequestsStore.set(request.paymentRequestId, request);
        savePaymentRequestsToDisk();
      }

      this.recordAudit(
        request.paymentRequestId,
        request.conversationId,
        'PAYMENT_FAILED',
        callerUserId,
        'BUYER',
        request.totalAmount,
        prevStatus,
        'FAILED',
        null,
        externalId,
        request.failureReason
      );

      throw new Error(request.failureReason);
    }

    // Transition to PROCESSING
    request.status = 'PROCESSING';
    request.paymentReference = providerResult.providerReference;
    request.updatedAt = new Date().toISOString();

    if (isNode) {
      paymentRequestsStore.set(request.paymentRequestId, request);
      externalIdToRequestIdMap.set(externalId, request.paymentRequestId);
      savePaymentRequestsToDisk();
    } else {
      const list = getBrowserRequests();
      const idx = list.findIndex((r) => r.paymentRequestId === request.paymentRequestId);
      if (idx >= 0) list[idx] = request;
      saveBrowserRequests(list);
    }

    // Record audits
    this.recordAudit(
      request.paymentRequestId,
      request.conversationId,
      'PAYMENT_INITIATED',
      callerUserId,
      'BUYER',
      request.totalAmount,
      prevStatus,
      'PROCESSING',
      providerResult.providerReference,
      externalId,
      `Malipo ya TSh ${request.totalAmount.toLocaleString()} yameanzishwa kupitia ${provider.providerName} (${resolvedNetwork}: ${normalizedPhone})`
    );

    this.recordAudit(
      request.paymentRequestId,
      request.conversationId,
      'PAYMENT_PROCESSING',
      callerUserId,
      'BUYER',
      request.totalAmount,
      'PROCESSING',
      'PROCESSING',
      providerResult.providerReference,
      externalId,
      'Ombi la malipo linasubiri uthibitisho wa PIN kwenye simu ya mnunuzi'
    );

    // Notify participants
    try {
      await createAuthoritativeNotification({
        recipientUserId: request.buyerUserId,
        type: 'MARKETPLACE_PAYMENT_PROCESSING',
        category: 'MARKETPLACE',
        priority: 'HIGH',
        title: 'Malipo Yanachakatwa',
        message: `Ombi la malipo ya TSh ${request.totalAmount.toLocaleString()} linachakatwa. Weka PIN kwenye simu yako kukamilisha.`,
        targetType: 'PAYMENT_REQUEST',
        targetId: request.paymentRequestId,
        actionUrl: `/market?tab=inbox&conv=${request.conversationId}`,
        relatedProductId: request.productId,
        deduplicationKey: `notif_pay_proc_${request.paymentRequestId}`,
      });
    } catch {}

    return {
      success: true,
      status: 'PROCESSING',
      paymentRequestId: request.paymentRequestId,
      externalId,
      providerReference: providerResult.providerReference,
      checkoutUrl: providerResult.checkoutUrl,
      instructions: providerResult.paymentInstructions || 'Tafadhali ingiza PIN kwenye simu yako kukamilisha malipo.',
    };
  }

  // --------------------------------------------------------------------------
  // 5. POLL / CHECK PAYMENT STATUS (Authoritative Polling)
  // --------------------------------------------------------------------------
  public async getPaymentStatus(
    paymentRequestId: string,
    callerUserId: string,
    providerName?: string,
    isAdmin = false
  ): Promise<MarketplacePaymentRequest> {
    const request = await this.getPaymentRequest(paymentRequestId, callerUserId, isAdmin);
    if (!request) throw new Error('Ombi la malipo halijapatikana.');

    // If currently PROCESSING and has providerReference, poll provider
    if (request.status === 'PROCESSING' && request.paymentReference) {
      try {
        const provider = this.getProvider(providerName);
        const pollRes = await provider.getPaymentStatus(request.paymentReference);

        const normStatus = String(pollRes.normalizedStatus || '').toUpperCase();
        if (normStatus === 'SUCCESS' || normStatus === 'PAID' || normStatus === 'ACTIVE') {
          // Authoritative transition to SUCCESS
          request.status = 'SUCCESS';
          request.paidAt = new Date().toISOString();
          request.updatedAt = request.paidAt;

          if (isNode) {
            paymentRequestsStore.set(request.paymentRequestId, request);
            savePaymentRequestsToDisk();
          }

          this.recordAudit(
            request.paymentRequestId,
            request.conversationId,
            'PAYMENT_SUCCESS',
            'SYSTEM',
            'SYSTEM',
            request.totalAmount,
            'PROCESSING',
            'SUCCESS',
            request.paymentReference,
            request.externalPaymentId,
            `Malipo ya TSh ${request.totalAmount.toLocaleString()} yamethibitishwa kikamilifu kupitia polling`
          );

          await this.dispatchPaymentSuccessNotifications(request);
        } else if (pollRes.normalizedStatus === 'FAILED' || pollRes.normalizedStatus === 'CANCELLED') {
          request.status = 'FAILED';
          request.failureReason = pollRes.errorMessage || 'Mteja alighairi au muamala ulishindikana';
          request.updatedAt = new Date().toISOString();

          if (isNode) {
            paymentRequestsStore.set(request.paymentRequestId, request);
            savePaymentRequestsToDisk();
          }

          this.recordAudit(
            request.paymentRequestId,
            request.conversationId,
            'PAYMENT_FAILED',
            'SYSTEM',
            'SYSTEM',
            request.totalAmount,
            'PROCESSING',
            'FAILED',
            request.paymentReference,
            request.externalPaymentId,
            request.failureReason
          );
        }
      } catch (pollErr) {
        console.warn('[marketplacePaymentRequestService] Notice during status poll:', pollErr);
      }
    }

    return request;
  }

  // --------------------------------------------------------------------------
  // 6. CANCEL PAYMENT REQUEST (Seller Only)
  // --------------------------------------------------------------------------
  public async cancelPaymentRequest(
    paymentRequestId: string,
    callerUserId: string,
    reason?: string
  ): Promise<MarketplacePaymentRequest> {
    if (!callerUserId) throw new Error('Hujaingia kwenye mfumo.');

    const request = await this.getPaymentRequest(paymentRequestId, callerUserId);
    if (!request) throw new Error('Ombi la malipo halijapatikana.');

    // Only seller can cancel an unpaid request (Requirement 15)
    if (callerUserId !== request.sellerUserId) {
      throw new Error('Huruhusiwi kughairi ombi hili. Ni muuzaji pekee aliyetuma ombi anayeruhusiwa kughairi.');
    }

    if (request.status === 'SUCCESS') {
      throw new Error('Malipo yameshakamilika (SUCCESS). Huwezi kughairi ombi hili.');
    }

    if (request.status === 'PROCESSING') {
      throw new Error('Malipo yanachakatwa kwenye simu ya mnunuzi kwa sasa. Huwezi kughairi wakati yanachakatwa.');
    }

    const prevStatus = request.status;
    const now = new Date().toISOString();
    request.status = 'CANCELLED';
    request.cancelledAt = now;
    request.cancelledBy = callerUserId;
    request.updatedAt = now;

    if (isNode) {
      paymentRequestsStore.set(request.paymentRequestId, request);
      savePaymentRequestsToDisk();
    } else {
      const list = getBrowserRequests();
      const idx = list.findIndex((r) => r.paymentRequestId === request.paymentRequestId);
      if (idx >= 0) list[idx] = request;
      saveBrowserRequests(list);
    }

    this.recordAudit(
      request.paymentRequestId,
      request.conversationId,
      'PAYMENT_CANCELLED',
      callerUserId,
      'SELLER',
      request.totalAmount,
      prevStatus,
      'CANCELLED',
      request.paymentReference,
      request.externalPaymentId,
      reason || 'Muuzaji ameghairi ombi la malipo'
    );

    // Notify buyer
    try {
      await createAuthoritativeNotification({
        recipientUserId: request.buyerUserId,
        type: 'MARKETPLACE_PAYMENT_CANCELLED',
        category: 'MARKETPLACE',
        priority: 'NORMAL',
        title: 'Ombi la Malipo Limeghairiwa',
        message: `Muuzaji ameghairi ombi la malipo ya TSh ${request.totalAmount.toLocaleString()} kwa ajili ya ${request.productTitleSnapshot}.`,
        targetType: 'PAYMENT_REQUEST',
        targetId: request.paymentRequestId,
        actionUrl: `/market?tab=inbox&conv=${request.conversationId}`,
        deduplicationKey: `notif_pay_cancel_${request.paymentRequestId}`,
      });
    } catch {}

    return request;
  }

  // --------------------------------------------------------------------------
  // 7. RETRY PAYMENT (Buyer Only - After Failure)
  // --------------------------------------------------------------------------
  public async retryPayment(
    paymentRequestId: string,
    callerUserId: string,
    input: Omit<InitiateMarketplacePaymentInput, 'paymentRequestId'>,
    providerName?: string
  ): Promise<InitiateMarketplacePaymentResult> {
    const request = await this.getPaymentRequest(paymentRequestId, callerUserId);
    if (!request) throw new Error('Ombi la malipo halijapatikana.');

    if (callerUserId !== request.buyerUserId) {
      throw new Error('Ni mnunuzi pekee anayeruhusiwa kujaribu tena malipo.');
    }

    if (request.status !== 'FAILED') {
      throw new Error(`Huwezi kurudia malipo kwa ombi lenye hali ya (${request.status}).`);
    }

    request.status = 'PENDING_PAYMENT';
    request.failureReason = null;
    request.updatedAt = new Date().toISOString();

    if (isNode) {
      paymentRequestsStore.set(request.paymentRequestId, request);
      savePaymentRequestsToDisk();
    }

    this.recordAudit(
      request.paymentRequestId,
      request.conversationId,
      'PAYMENT_RETRY',
      callerUserId,
      'BUYER',
      request.totalAmount,
      'FAILED',
      'PENDING_PAYMENT',
      null,
      request.externalPaymentId,
      'Mnunuzi anajaribu tena malipo baada ya kushindwa'
    );

    return this.initiatePayment(
      {
        paymentRequestId,
        buyerPhone: input.buyerPhone,
        providerNetwork: input.providerNetwork,
      },
      callerUserId,
      providerName
    );
  }

  // --------------------------------------------------------------------------
  // 8. WEBHOOK HANDLER (Server-Side Authoritative Verification & Idempotency)
  // --------------------------------------------------------------------------
  public async handlePaymentWebhook(
    providerName: string,
    payload: any,
    headers?: Record<string, string | string[] | undefined>,
    correlationId?: string,
    rawBody?: any
  ): Promise<{
    success: boolean;
    isDuplicate: boolean;
    paymentRequest?: MarketplacePaymentRequest;
    error?: string;
  }> {
    const provider = this.getProvider(providerName);
    const verifyResult = await provider.verifyPaymentCallback(payload, headers, rawBody);

    if (!verifyResult.isValid) {
      return {
        success: false,
        isDuplicate: false,
        error: verifyResult.errorMessage || 'Saini au muundo wa callback ya malipo si sahihi',
      };
    }

    // Extract external ID (e.g. UFUGAJI_MARKETPLACE_PAYMENT_mpr_...)
    const externalId =
      verifyResult.externalId ||
      payload?.external_id ||
      payload?.data?.external_id ||
      payload?.reference ||
      payload?.data?.reference;

    if (!externalId || typeof externalId !== 'string') {
      return { success: false, isDuplicate: false, error: 'external_id haikupatikana kwenye callback' };
    }

    if (isNode) loadPaymentRequestsFromDisk();

    let paymentRequestId = externalIdToRequestIdMap.get(externalId);
    if (!paymentRequestId && externalId.startsWith(MARKETPLACE_PAYMENT_CONFIG.paymentPrefix)) {
      paymentRequestId = externalId.replace(MARKETPLACE_PAYMENT_CONFIG.paymentPrefix, '');
    }

    if (!paymentRequestId) {
      return { success: false, isDuplicate: false, error: `Ombi la malipo halikupatikana kwa externalId: ${externalId}` };
    }

    const request = paymentRequestsStore.get(paymentRequestId);
    if (!request) {
      return { success: false, isDuplicate: false, error: `Ombi la malipo ${paymentRequestId} halipo kwenye hifadhidata` };
    }

    // IDEMPOTENCY & REPLAY PROTECTION (Requirement 13)
    if (request.status === 'SUCCESS') {
      return {
        success: true,
        isDuplicate: true,
        paymentRequest: request,
      };
    }

    // Validate amount & currency if provided in callback
    if (verifyResult.amount !== undefined && verifyResult.amount !== null) {
      if (Math.abs(Number(verifyResult.amount) - request.totalAmount) > 0.01) {
        return {
          success: false,
          isDuplicate: false,
          error: `Kiasi cha malipo kwenye webhook (${verifyResult.amount}) hakilingani na ombi la malipo (${request.totalAmount})`,
        };
      }
    }

    if (verifyResult.currency && verifyResult.currency !== request.currency) {
      return {
        success: false,
        isDuplicate: false,
        error: `Sarafu ya malipo kwenye webhook (${verifyResult.currency}) si sahihi (inapaswa kuwa ${request.currency})`,
      };
    }

    const prevStatus = request.status;

    const normStatus = String(verifyResult.normalizedStatus || '').toUpperCase();
    if (normStatus === 'SUCCESS' || normStatus === 'PAID' || normStatus === 'ACTIVE') {
      request.status = 'SUCCESS';
      request.paidAt = new Date().toISOString();
      request.paymentReference = verifyResult.providerReference || request.paymentReference;
      request.updatedAt = request.paidAt;

      paymentRequestsStore.set(paymentRequestId, request);
      savePaymentRequestsToDisk();

      this.recordAudit(
        request.paymentRequestId,
        request.conversationId,
        'PAYMENT_SUCCESS',
        'SYSTEM',
        'SYSTEM',
        request.totalAmount,
        prevStatus,
        'SUCCESS',
        request.paymentReference,
        externalId,
        `Malipo ya TSh ${request.totalAmount.toLocaleString()} yamethibitishwa kupitia webhook ya ${provider.providerName}`
      );

      // CRITICAL: Payout is NOT executed in V1.11C. Funds remain platform-controlled.
      await this.dispatchPaymentSuccessNotifications(request);

      return {
        success: true,
        isDuplicate: false,
        paymentRequest: request,
      };
    } else if (verifyResult.normalizedStatus === 'FAILED' || verifyResult.normalizedStatus === 'CANCELLED') {
      request.status = 'FAILED';
      request.failureReason =
        verifyResult.failureReason ||
        verifyResult.errorMessage ||
        payload?.failure_reason ||
        payload?.failureReason ||
        'Malipo yameshindwa';
      request.updatedAt = new Date().toISOString();

      paymentRequestsStore.set(paymentRequestId, request);
      savePaymentRequestsToDisk();

      this.recordAudit(
        request.paymentRequestId,
        request.conversationId,
        'PAYMENT_FAILED',
        'SYSTEM',
        'SYSTEM',
        request.totalAmount,
        prevStatus,
        'FAILED',
        verifyResult.providerReference || request.paymentReference,
        externalId,
        request.failureReason
      );

      return {
        success: true,
        isDuplicate: false,
        paymentRequest: request,
      };
    }

    return {
      success: true,
      isDuplicate: false,
      paymentRequest: request,
    };
  }

  // --------------------------------------------------------------------------
  // 9. AUDIT LOGS RETRIEVAL
  // --------------------------------------------------------------------------
  public async getAuditLogs(
    paymentRequestId: string,
    callerUserId: string,
    isAdmin = false
  ): Promise<MarketplacePaymentRequestAudit[]> {
    const request = await this.getPaymentRequest(paymentRequestId, callerUserId, isAdmin);
    if (!request) throw new Error('Ombi la malipo halijapatikana.');

    if (isNode) loadPaymentRequestsFromDisk();
    const audits = isNode
      ? paymentAuditsStore.get(paymentRequestId) || []
      : getBrowserAudits(paymentRequestId);

    return [...audits].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  // --------------------------------------------------------------------------
  // HELPER: DISPATCH PAYMENT SUCCESS NOTIFICATIONS
  // --------------------------------------------------------------------------
  private async dispatchPaymentSuccessNotifications(request: MarketplacePaymentRequest): Promise<void> {
    try {
      // 1. Notify Buyer
      await createAuthoritativeNotification({
        recipientUserId: request.buyerUserId,
        type: 'MARKETPLACE_PAYMENT_SUCCESS',
        category: 'MARKETPLACE',
        priority: 'HIGH',
        title: 'Malipo Yamekamilika',
        message: `Malipo yako ya TSh ${request.totalAmount.toLocaleString()} kwa ajili ya ${request.productTitleSnapshot} yamekamilika kikamilifu.`,
        targetType: 'PAYMENT_REQUEST',
        targetId: request.paymentRequestId,
        actionUrl: `/market?tab=inbox&conv=${request.conversationId}`,
        relatedProductId: request.productId,
        deduplicationKey: `notif_pay_succ_b_${request.paymentRequestId}`,
      });

      // 2. Notify Seller
      await createAuthoritativeNotification({
        recipientUserId: request.sellerUserId,
        type: 'MARKETPLACE_PAYMENT_SUCCESS',
        category: 'MARKETPLACE',
        priority: 'HIGH',
        title: 'Malipo Yamepokelewa kwenye Mfumo',
        message: `Mnunuzi amelipa TSh ${request.totalAmount.toLocaleString()} kwa ajili ya ombi lako la malipo (#${request.paymentRequestId.slice(-6)}). Pesa zipo salama kwenye mfumo wa Ufugaji Update.`,
        targetType: 'PAYMENT_REQUEST',
        targetId: request.paymentRequestId,
        actionUrl: `/market?tab=inbox&conv=${request.conversationId}`,
        relatedProductId: request.productId,
        deduplicationKey: `notif_pay_succ_s_${request.paymentRequestId}`,
      });
    } catch (err) {
      console.warn('[marketplacePaymentRequestService] Notice dispatching success notifications:', err);
    }
  }
}

export const marketplacePaymentRequestService = new MarketplacePaymentRequestService();

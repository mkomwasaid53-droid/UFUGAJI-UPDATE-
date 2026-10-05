/**
 * V1.11C — VERIFIED SELLER PAYMENT REQUEST TEST SUITE
 *
 * Validates the complete authoritative domain:
 * 1. Product Purpose & Bindings (Buyer <-> Seller <-> Shop <-> Product <-> Listing <-> Conversation)
 * 2. Seller Eligibility (APPROVED verification, ACTIVE badge, Monetization active, no private trust leak)
 * 3. Participant Authorization & Boundaries (Seller creates, Buyer pays, impersonators blocked)
 * 4. Commercial Amount Authority (Server calculates total, precision, min/max limits, currency TZS)
 * 5. Marketplace Governance (Blocked/moderated/draft listings rejected)
 * 6. PlusPesa Integration & Idempotency (Deterministic external ID, single SUCCESS transition)
 * 7. Duplicate Payment Protection (Cannot double-pay, no duplicate pending requests)
 * 8. Webhook & Polling Verification (Authoritative status change, timing-safe checks, no payout in V1.11C)
 * 9. Cancellation & Expiry Lifecycle (Seller cancels, buyer cannot cancel, expiry enforced)
 * 10. Failure & Governed Retry (Retry without duplicate entity)
 * 11. Immutable Audit Trail & Notification Center Dispatch
 */

import { marketplacePaymentRequestService } from '../src/services/marketplacePaymentRequestService';
import { marketplaceInboxService } from '../src/services/marketplaceInboxService';
import { sellerVerificationService } from '../src/services/sellerVerificationService';
import { sellerMonetizationService } from '../src/services/sellerMonetizationService';
import { _resetNotificationsForTesting, getLocalCachedNotifications } from '../src/services/notificationService';
import { MarketplaceProduct } from '../src/types/marketplace';
import { MARKETPLACE_PAYMENT_CONFIG } from '../src/types/marketplacePaymentRequest';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    passed++;
    console.log(`✅ [PASS] ${testName}`);
  } else {
    failed++;
    console.error(`❌ [FAIL] ${testName} ${detail ? `-> ${detail}` : ''}`);
  }
}

async function runV111cTests() {
  console.log('================================================================');
  console.log('  UFUGAJI UPDATE — V1.11C VERIFIED SELLER PAYMENT REQUEST TESTS');
  console.log('================================================================\n');

  // Reset all services for clean testing
  marketplacePaymentRequestService._resetForTesting();
  marketplaceInboxService._resetInboxForTesting();
  sellerVerificationService._clearAllForTesting();
  sellerMonetizationService._resetForTesting();
  _resetNotificationsForTesting();

  // Test Actors
  const verifiedSeller = 'seller_verified_101';
  const unverifiedSeller = 'seller_unverified_102';
  const buyerUser = 'buyer_user_201';
  const thirdPartyUser = 'intruder_user_999';

  // 1. Setup Verified Seller
  // Activate commercial monetization (can sell)
  sellerMonetizationService.activateFirstMonthFreeTrial({
    sellerUserId: verifiedSeller,
    sellerProfileId: `profile_${verifiedSeller}`,
  });

  // Complete authoritative verification application & approval
  const verifDraft = sellerVerificationService.createOrUpdateDraft({
    sellerUserId: verifiedSeller,
    shopId: 'shop_101',
    input: {
      verificationType: 'INDIVIDUAL',
      legalName: 'Baraka Emmanuel Mushi',
      businessName: 'Baraka Dairy Farm',
      phone: '0754123456',
      region: 'Arusha',
      district: 'Arusha Mjini',
      area: 'Mianzini',
    },
  });

  const submittedVerif = sellerVerificationService.submitApplication({
    sellerUserId: verifiedSeller,
    verificationId: verifDraft.verificationId,
  });

  const payInit = await sellerVerificationService.initiateVerificationPayment({
    sellerUserId: verifiedSeller,
    verificationId: submittedVerif.verificationId,
    customerPhone: '0754123456'
  });

  await sellerVerificationService.processVerificationPaymentCallback(
    'MOCK',
    {
      externalId: payInit.paymentIntent.externalId,
      internalPaymentId: payInit.paymentIntent.paymentIntentId,
      status: 'SUCCESS',
      amount: 5000,
      currency: 'TZS',
      providerReference: 'MPESA_REF_VERIF_101'
    }
  );

  sellerVerificationService.approveVerification({
    verificationId: submittedVerif.verificationId,
    adminNotes: 'Vigezo vyote vya uthibitisho vimezingatiwa',
    autoActivateBadge: true,
    adminUserId: 'admin_sys'
  });

  // Verify verifiedSeller trust state is truly VERIFIED
  const badgeCheck = sellerVerificationService.getPublicSellerBadge(verifiedSeller);
  assert(badgeCheck.isVerified === true, 'Setup Check: Seller is authoritatively verified');
  assert(badgeCheck.badgeStatus === 'ACTIVE', 'Setup Check: Seller badge is ACTIVE');

  // 2. Setup Unverified Seller (Monetized but NOT verified)
  sellerMonetizationService.activateFirstMonthFreeTrial({
    sellerUserId: unverifiedSeller,
    sellerProfileId: `profile_${unverifiedSeller}`,
  });

  // 3. Setup mock marketplace product
  const mockProduct: MarketplaceProduct = {
    productId: 'prod_cow_friesian_01',
    sellerId: verifiedSeller,
    shopId: 'shop_101',
    title: "Ng'ombe wa Maziwa Friesian",
    description: "Ng'ombe bora anayetoa lita 25 za maziwa kwa siku",
    price: 2500000,
    currency: 'TZS',
    category: 'MIFUGO',
    subcategory: "Ng'ombe",
    status: 'active',
    moderationStatus: 'APPROVED',
    sellerName: 'Baraka Mushi',
    sellerPhone: '+255754123456',
    sellerLocation: 'Arusha',
    location: 'Arusha',
    unit: 'kichwa',
    quantityAvailable: 1,
    imageUrl: 'https://storage.googleapis.com/ufugaji/cow.jpg',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    images: [{ id: 'img_cow_1', url: 'https://storage.googleapis.com/ufugaji/cow.jpg', isPrimary: true }],
  };

  // 4. Create authoritative conversation between buyerUser and verifiedSeller
  const { conversation } = await marketplaceInboxService.getOrCreateConversation(
    {
      buyerUserId: buyerUser,
      sellerUserId: verifiedSeller,
      shopId: 'shop_101',
      productId: mockProduct.productId,
      listingId: mockProduct.productId,
      productTitleSnapshot: mockProduct.title,
      priceSnapshot: mockProduct.price,
      currencySnapshot: 'TZS',
      imageUrlSnapshot: mockProduct.images[0]?.url,
      sellerNameSnapshot: 'Baraka Mushi (Dairy)',
      buyerNameSnapshot: 'Juma Mnunuzi',
      initialMessageText: 'Habari, nahitaji ngombe huyu.',
    },
    buyerUser,
    mockProduct
  );

  const convId = conversation.conversationId;

  // --------------------------------------------------------------------------
  // Group 1: Authoritative Commercial Creation & Context Binding
  // --------------------------------------------------------------------------
  console.log('--- Group 1: Context Binding & Commercial Creation ---');

  const req1 = await marketplacePaymentRequestService.createPaymentRequest(
    {
      conversationId: convId,
      quantity: 1,
      unitPrice: 2400000, // Agreed price can differ from listing price
      description: "Ng'ombe mmoja kama tulivyokubaliana kwenye gumzo.",
    },
    verifiedSeller,
    mockProduct
  );

  assert(req1.paymentRequestId.startsWith('mpr_'), 'Test 1.1: Generates valid paymentRequestId');
  assert(req1.conversationId === convId, 'Test 1.2: Binds authoritative conversationId');
  assert(req1.buyerUserId === buyerUser, 'Test 1.3: Binds authoritative buyerUserId');
  assert(req1.sellerUserId === verifiedSeller, 'Test 1.4: Binds authoritative sellerUserId');
  assert(req1.shopId === 'shop_101', 'Test 1.5: Binds authoritative shopId');
  assert(req1.productId === mockProduct.productId, 'Test 1.6: Binds authoritative productId');
  assert(req1.listingId === mockProduct.productId, 'Test 1.7: Binds authoritative listingId');
  assert(req1.quantity === 1, 'Test 1.8: Quantity recorded accurately');
  assert(req1.unitPrice === 2400000, 'Test 1.9: Agreed unit price stored accurately');
  assert(req1.totalAmount === 2400000, 'Test 1.10: Server authoritative totalAmount = quantity * unitPrice');
  assert(req1.currency === 'TZS', 'Test 1.11: Currency locked to TZS');
  assert(req1.status === 'PENDING_PAYMENT', 'Test 1.12: Initial lifecycle status is PENDING_PAYMENT');
  assert(
    req1.externalPaymentId?.startsWith(MARKETPLACE_PAYMENT_CONFIG.paymentPrefix),
    'Test 1.13: Deterministic PlusPesa external identifier created'
  );
  assert(
    mockProduct.price === 2500000,
    'Test 1.14: Gulio product listing price is NOT overwritten by payment request price'
  );

  // Check display snapshots
  assert(
    req1.productTitleSnapshot === mockProduct.title,
    'Test 1.15: Product title snapshot stored for immutability'
  );
  assert(
    req1.sellerNameSnapshot.includes('Baraka'),
    'Test 1.16: Seller name snapshot stored'
  );

  // Check structured message insertion
  const msgs = await marketplaceInboxService.getMessagesForConversation(convId, verifiedSeller);
  const paymentMsg = msgs.find((m) => m.messageType === 'PAYMENT_REQUEST');
  assert(paymentMsg !== undefined, 'Test 1.17: Structured PAYMENT_REQUEST message inserted into conversation');
  assert(
    paymentMsg?.paymentRequestId === req1.paymentRequestId,
    'Test 1.18: Structured message links to paymentRequestId'
  );

  // Check notification to buyer
  const notifs = getLocalCachedNotifications(buyerUser);
  const buyerNotif = notifs.find(
    (n) => n.recipientUserId === buyerUser && n.type === 'MARKETPLACE_PAYMENT_REQUEST_CREATED'
  );
  assert(buyerNotif !== undefined, 'Test 1.19: Authoritative notification dispatched to buyer');
  assert(buyerNotif?.priority === 'HIGH', 'Test 1.20: Payment request notification priority is HIGH');

  // Check audits
  const audits = await marketplacePaymentRequestService.getAuditLogs(req1.paymentRequestId, verifiedSeller);
  assert(audits.length >= 2, 'Test 1.21: Audit trail recorded initial lifecycle events');
  assert(audits[0].eventType === 'PAYMENT_REQUEST_CREATED', 'Test 1.22: Audit includes PAYMENT_REQUEST_CREATED');
  assert(audits[1].eventType === 'PAYMENT_REQUEST_SUBMITTED', 'Test 1.23: Audit includes PAYMENT_REQUEST_SUBMITTED');

  // --------------------------------------------------------------------------
  // Group 2: Seller Eligibility Gating & Authorization Boundaries
  // --------------------------------------------------------------------------
  console.log('\n--- Group 2: Seller Verification & Eligibility Gating ---');

  // Reset request store to test rejection cases cleanly
  marketplacePaymentRequestService._resetForTesting();

  // Test 2.1: Unauthenticated request
  try {
    await marketplacePaymentRequestService.createPaymentRequest(
      { conversationId: convId, quantity: 1, unitPrice: 50000 },
      ''
    );
    assert(false, 'Test 2.1: Unauthenticated request should throw');
  } catch (err: any) {
    assert(err.message.includes('Hujaingia'), 'Test 2.1: Unauthenticated caller rejected with 401 requirement');
  }

  // Test 2.2: Buyer participant trying to create payment request
  try {
    await marketplacePaymentRequestService.createPaymentRequest(
      { conversationId: convId, quantity: 1, unitPrice: 50000 },
      buyerUser
    );
    assert(false, 'Test 2.2: Buyer creating seller payment request should throw');
  } catch (err: any) {
    assert(err.message.includes('Huruhusiwi'), 'Test 2.2: Buyer cannot create seller payment request (403)');
  }

  // Test 2.3: Third-party non-participant trying to create request
  try {
    await marketplacePaymentRequestService.createPaymentRequest(
      { conversationId: convId, quantity: 1, unitPrice: 50000 },
      thirdPartyUser
    );
    assert(false, 'Test 2.3: Third party creating request should throw');
  } catch (err: any) {
    assert(err.message.includes('Huruhusiwi'), 'Test 2.3: Third party participant rejected (403)');
  }

  // Test 2.4: Unverified seller conversation
  const unverifiedProduct: MarketplaceProduct = {
    ...mockProduct,
    productId: 'prod_unverified_99',
    sellerId: unverifiedSeller,
  };
  const { conversation: unverifiedConv } = await marketplaceInboxService.getOrCreateConversation(
    {
      buyerUserId: buyerUser,
      sellerUserId: unverifiedSeller,
      shopId: 'shop_unverified',
      productId: unverifiedProduct.productId,
      listingId: unverifiedProduct.productId,
      productTitleSnapshot: 'Kuku wa Kienyeji',
      priceSnapshot: 25000,
    },
    buyerUser,
    unverifiedProduct
  );

  try {
    await marketplacePaymentRequestService.createPaymentRequest(
      { conversationId: unverifiedConv.conversationId, quantity: 2, unitPrice: 25000 },
      unverifiedSeller,
      unverifiedProduct
    );
    assert(false, 'Test 2.4: Unverified seller creating payment request should throw');
  } catch (err: any) {
    assert(
      err.message.includes('Malipo kupitia jukwaa yanapatikana kwa muuzaji aliyethibitishwa pekee'),
      'Test 2.4: Unverified seller strictly denied with safe Swahili message'
    );
  }

  // Test 2.5: Seller with DEACTIVATED/INACTIVE badge
  sellerVerificationService.deactivateBadge({
    verificationId: submittedVerif.verificationId,
    reason: 'Uchunguzi wa kiutawala',
    adminUserId: 'admin_sys',
  });
  try {
    await marketplacePaymentRequestService.createPaymentRequest(
      { conversationId: convId, quantity: 1, unitPrice: 100000 },
      verifiedSeller,
      mockProduct
    );
    assert(false, 'Test 2.5: Deactivated verified seller should throw');
  } catch (err: any) {
    assert(
      err.message.includes('Malipo kupitia jukwaa yanapatikana kwa muuzaji aliyethibitishwa pekee'),
      'Test 2.5: Verification INACTIVE badge seller cannot create payment request'
    );
  }

  // Restore badge to ACTIVE
  sellerVerificationService.activateBadge({
    verificationId: submittedVerif.verificationId,
    adminUserId: 'admin_sys',
  });

  // Test 2.6: Unmonetized seller
  sellerMonetizationService._resetForTesting(); // All monetization inactive
  try {
    await marketplacePaymentRequestService.createPaymentRequest(
      { conversationId: convId, quantity: 1, unitPrice: 100000 },
      verifiedSeller,
      mockProduct
    );
    assert(false, 'Test 2.6: Unmonetized seller should throw');
  } catch (err: any) {
    assert(err.message.includes('Muuzaji hawezi kuomba malipo'), 'Test 2.6: Unmonetized seller rejected');
  }

  // Re-activate monetization
  sellerMonetizationService.activateFirstMonthFreeTrial({
    sellerUserId: verifiedSeller,
    sellerProfileId: `profile_${verifiedSeller}`,
  });

  // --------------------------------------------------------------------------
  // Group 3: Commercial Amount Authority & Input Validation
  // --------------------------------------------------------------------------
  console.log('\n--- Group 3: Commercial Amount Authority & Constraints ---');

  // Test 3.1: Zero quantity
  try {
    await marketplacePaymentRequestService.createPaymentRequest(
      { conversationId: convId, quantity: 0, unitPrice: 10000 },
      verifiedSeller,
      mockProduct
    );
    assert(false, 'Test 3.1: Zero quantity should throw');
  } catch (err: any) {
    assert(err.message.includes('Quantity'), 'Test 3.1: Zero quantity rejected');
  }

  // Test 3.2: Negative unit price
  try {
    await marketplacePaymentRequestService.createPaymentRequest(
      { conversationId: convId, quantity: 1, unitPrice: -500 },
      verifiedSeller,
      mockProduct
    );
    assert(false, 'Test 3.2: Negative unit price should throw');
  } catch (err: any) {
    assert(err.message.includes('Unit Price'), 'Test 3.2: Negative unit price rejected');
  }

  // Test 3.3: Below minimum (min: 500 TZS)
  try {
    await marketplacePaymentRequestService.createPaymentRequest(
      { conversationId: convId, quantity: 1, unitPrice: 200 },
      verifiedSeller,
      mockProduct
    );
    assert(false, 'Test 3.3: Total amount below 500 TZS should throw');
  } catch (err: any) {
    assert(err.message.includes('Kiasi cha chini'), 'Test 3.3: Total amount < 500 TZS rejected');
  }

  // Test 3.4: Above maximum safety cap (50,000,000 TZS)
  try {
    await marketplacePaymentRequestService.createPaymentRequest(
      { conversationId: convId, quantity: 2, unitPrice: 30000000 }, // 60,000,000 TZS
      verifiedSeller,
      mockProduct
    );
    assert(false, 'Test 3.4: Total amount above cap should throw');
  } catch (err: any) {
    assert(err.message.includes('Kiasi cha juu'), 'Test 3.4: Total amount > 50,000,000 TZS rejected');
  }

  // --------------------------------------------------------------------------
  // Group 4: Marketplace Governance Gating (Listing Status)
  // --------------------------------------------------------------------------
  console.log('\n--- Group 4: Marketplace Governance Gating ---');

  const rejectedListingProduct: MarketplaceProduct = {
    ...mockProduct,
    moderationStatus: 'REJECTED',
  };
  try {
    await marketplacePaymentRequestService.createPaymentRequest(
      { conversationId: convId, quantity: 1, unitPrice: 100000 },
      verifiedSeller,
      rejectedListingProduct
    );
    assert(false, 'Test 4.1: REJECTED listing should throw');
  } catch (err: any) {
    assert(err.message.includes('haliruhusiwi'), 'Test 4.1: REJECTED listing blocked from payment request');
  }

  const draftListingProduct: MarketplaceProduct = {
    ...mockProduct,
    status: 'draft',
  };
  try {
    await marketplacePaymentRequestService.createPaymentRequest(
      { conversationId: convId, quantity: 1, unitPrice: 100000 },
      verifiedSeller,
      draftListingProduct
    );
    assert(false, 'Test 4.2: Draft listing should throw');
  } catch (err: any) {
    assert(err.message.includes('rasimu'), 'Test 4.2: Draft listing blocked from payment request');
  }

  // --------------------------------------------------------------------------
  // Group 5: Buyer Payment Initiation & Role Boundaries
  // --------------------------------------------------------------------------
  console.log('\n--- Group 5: Buyer Payment Initiation ---');

  // Reset payment requests store so activeReq is freshly created without leftover pending requests
  marketplacePaymentRequestService._resetForTesting();

  // Create valid active payment request for payment testing
  const activeReq = await marketplacePaymentRequestService.createPaymentRequest(
    {
      conversationId: convId,
      quantity: 2,
      unitPrice: 500000, // Total: 1,000,000 TZS
      description: "Ndama wawili wa kienyeji",
    },
    verifiedSeller,
    mockProduct
  );

  // Test 5.1: Seller attempting to pay their own request
  try {
    await marketplacePaymentRequestService.initiatePayment(
      {
        paymentRequestId: activeReq.paymentRequestId,
        buyerPhone: '0712345678',
      },
      verifiedSeller
    );
    assert(false, 'Test 5.1: Seller paying own request should throw');
  } catch (err: any) {
    assert(err.message.includes('Ni mnunuzi pekee'), 'Test 5.1: Seller cannot pay own request (403)');
  }

  // Test 5.2: Third-party attempting to pay
  try {
    await marketplacePaymentRequestService.initiatePayment(
      {
        paymentRequestId: activeReq.paymentRequestId,
        buyerPhone: '0712345678',
      },
      thirdPartyUser
    );
    assert(false, 'Test 5.2: Third party paying request should throw');
  } catch (err: any) {
    assert(err.message.includes('Huruhusiwi'), 'Test 5.2: Third party cannot pay someone elses request (403)');
  }

  // Test 5.3: Invalid phone number
  try {
    await marketplacePaymentRequestService.initiatePayment(
      {
        paymentRequestId: activeReq.paymentRequestId,
        buyerPhone: '12345',
      },
      buyerUser
    );
    assert(false, 'Test 5.3: Invalid phone number should throw');
  } catch (err: any) {
    assert(err.message.includes('Namba ya simu'), 'Test 5.3: Invalid phone number rejected');
  }

  // Test 5.4: Legitimate Buyer Initiates Payment (Using Mock Provider for predictable tests)
  const payResult = await marketplacePaymentRequestService.initiatePayment(
    {
      paymentRequestId: activeReq.paymentRequestId,
      buyerPhone: '0754123456',
      providerNetwork: 'Mpesa',
    },
    buyerUser,
    'MOCK'
  );

  assert(payResult.success === true, 'Test 5.4: Payment initiation succeeded');
  assert(payResult.status === 'PROCESSING', 'Test 5.5: Payment transitions to PROCESSING status');
  assert(
    payResult.externalId.startsWith(MARKETPLACE_PAYMENT_CONFIG.paymentPrefix),
    'Test 5.6: Deterministic externalId returned'
  );

  // Check request state in service
  const inProgressReq = await marketplacePaymentRequestService.getPaymentRequest(
    activeReq.paymentRequestId,
    buyerUser
  );
  assert(inProgressReq?.status === 'PROCESSING', 'Test 5.7: Request entity updated to PROCESSING');
  assert(inProgressReq?.paymentReference !== null, 'Test 5.8: Provider reference saved');

  // Check audit trail
  const procAudits = await marketplacePaymentRequestService.getAuditLogs(activeReq.paymentRequestId, buyerUser);
  const initiatedAudit = procAudits.find((a) => a.eventType === 'PAYMENT_INITIATED');
  const processingAudit = procAudits.find((a) => a.eventType === 'PAYMENT_PROCESSING');
  assert(initiatedAudit !== undefined, 'Test 5.9: Audit records PAYMENT_INITIATED');
  assert(processingAudit !== undefined, 'Test 5.10: Audit records PAYMENT_PROCESSING');

  // --------------------------------------------------------------------------
  // Group 6: Duplicate Payment Protection & Idempotency
  // --------------------------------------------------------------------------
  console.log('\n--- Group 6: Duplicate Payment Protection & Idempotency ---');

  // Test 6.1: Repeated initiation while PROCESSING returns existing processing state
  const repeatPayResult = await marketplacePaymentRequestService.initiatePayment(
    {
      paymentRequestId: activeReq.paymentRequestId,
      buyerPhone: '0754123456',
    },
    buyerUser,
    'MOCK'
  );
  assert(
    repeatPayResult.status === 'PROCESSING',
    'Test 6.1: Repeated initiate returns existing PROCESSING status idempotently'
  );

  // Test 6.2: Duplicate active request in conversation blocked
  try {
    await marketplacePaymentRequestService.createPaymentRequest(
      { conversationId: convId, quantity: 1, unitPrice: 200000 },
      verifiedSeller,
      mockProduct
    );
    assert(false, 'Test 6.2: Creating another request while one is active should throw');
  } catch (err: any) {
    assert(
      err.message.includes('Kuna ombi jingine'),
      'Test 6.2: Duplicate pending/processing request in same conversation rejected'
    );
  }

  // --------------------------------------------------------------------------
  // Group 7: Webhook & Polling Authoritative Verification
  // --------------------------------------------------------------------------
  console.log('\n--- Group 7: Webhook & Polling Authoritative Verification ---');

  // Test 7.1: Authoritative Polling checks status and transitions to SUCCESS
  const mockProvider = marketplacePaymentRequestService.getProvider('MOCK') as any;
  mockProvider.setTransactionStatus(inProgressReq!.paymentReference!, 'PAID');

  const statusBeforePoll = await marketplacePaymentRequestService.getPaymentStatus(
    activeReq.paymentRequestId,
    buyerUser,
    'MOCK'
  );
  assert(
    statusBeforePoll.status === 'SUCCESS',
    'Test 7.1: Status polling authoritatively confirms provider success -> SUCCESS'
  );
  assert(statusBeforePoll.paidAt !== null, 'Test 7.2: paidAt timestamp recorded');

  // Check audit for SUCCESS
  const successAudits = await marketplacePaymentRequestService.getAuditLogs(activeReq.paymentRequestId, buyerUser);
  const successAudit = successAudits.find((a) => a.eventType === 'PAYMENT_SUCCESS');
  assert(successAudit !== undefined, 'Test 7.3: Audit records PAYMENT_SUCCESS');

  // Check notifications for SUCCESS
  const buyerSuccessNotif = getLocalCachedNotifications(buyerUser).find(
    (n) => n.recipientUserId === buyerUser && n.type === 'MARKETPLACE_PAYMENT_SUCCESS'
  );
  const sellerSuccessNotif = getLocalCachedNotifications(verifiedSeller).find(
    (n) => n.recipientUserId === verifiedSeller && n.type === 'MARKETPLACE_PAYMENT_SUCCESS'
  );
  assert(buyerSuccessNotif !== undefined, 'Test 7.4: Buyer receives payment success notification');
  assert(sellerSuccessNotif !== undefined, 'Test 7.5: Seller receives payment success notification');

  // Test 7.6: Double payment block on SUCCESS
  try {
    await marketplacePaymentRequestService.initiatePayment(
      { paymentRequestId: activeReq.paymentRequestId, buyerPhone: '0754123456' },
      buyerUser
    );
    assert(false, 'Test 7.6: Paying already SUCCESS request should throw');
  } catch (err: any) {
    assert(err.message.includes('tayari limekamilika'), 'Test 7.6: Double payment strictly prohibited');
  }

  // Test 7.7: Webhook Idempotency on already SUCCESS request
  const duplicateWebhookRes = await marketplacePaymentRequestService.handlePaymentWebhook(
    'MOCK',
    {
      external_id: activeReq.externalPaymentId,
      status: 'SUCCESS',
      amount: activeReq.totalAmount,
      currency: 'TZS',
    }
  );
  assert(duplicateWebhookRes.success === true, 'Test 7.7: Duplicate webhook returns success: true');
  assert(duplicateWebhookRes.isDuplicate === true, 'Test 7.8: Duplicate webhook recognized as duplicate (idempotent)');

  // Test 7.9: Webhook with amount mismatch rejected
  const fakeWebhookMismatch = await marketplacePaymentRequestService.handlePaymentWebhook(
    'MOCK',
    {
      external_id: activeReq.externalPaymentId,
      status: 'SUCCESS',
      amount: 999999999, // Tampered amount
      currency: 'TZS',
    }
  );
  // Note: Since already SUCCESS, duplicate check returns first; let's test amount mismatch on a fresh pending request
  console.log('\n--- Group 8: Webhook Validation & Failure Lifecycle ---');

  // Create another request in a new conversation to test fresh webhook flows
  const { conversation: conv2 } = await marketplaceInboxService.getOrCreateConversation(
    {
      buyerUserId: buyerUser,
      sellerUserId: verifiedSeller,
      shopId: 'shop_101',
      productId: 'prod_another_002',
      listingId: 'prod_another_002',
      productTitleSnapshot: 'Mbuzi wa Maziwa',
      priceSnapshot: 300000,
    },
    buyerUser
  );

  const req2 = await marketplacePaymentRequestService.createPaymentRequest(
    { conversationId: conv2.conversationId, quantity: 1, unitPrice: 300000 },
    verifiedSeller
  );

  // Webhook with tampered amount
  const tamperedAmountRes = await marketplacePaymentRequestService.handlePaymentWebhook(
    'MOCK',
    {
      external_id: req2.externalPaymentId,
      status: 'SUCCESS',
      amount: 150000, // Should be 300000
      currency: 'TZS',
    }
  );
  assert(tamperedAmountRes.success === false, 'Test 8.1: Webhook with mismatched amount rejected');
  assert(
    tamperedAmountRes.error?.includes('hakilingani'),
    'Test 8.2: Tampered amount error specifies mismatch'
  );

  // Webhook reporting FAILED
  const failedWebhookRes = await marketplacePaymentRequestService.handlePaymentWebhook(
    'MOCK',
    {
      external_id: req2.externalPaymentId,
      status: 'FAILED',
      amount: 300000,
      currency: 'TZS',
      failure_reason: 'Salio halitoshi kwenye akaunti ya simu',
    }
  );
  assert(failedWebhookRes.success === true, 'Test 8.3: Failure webhook processed');
  const failedReq = await marketplacePaymentRequestService.getPaymentRequest(req2.paymentRequestId, buyerUser);
  assert(failedReq?.status === 'FAILED', 'Test 8.4: Request status updated to FAILED');
  assert(
    failedReq?.failureReason?.includes('Salio halitoshi'),
    'Test 8.5: Failure reason recorded'
  );

  // Test 8.6: Governed retry without creating a second logical payment request
  const retryResult = await marketplacePaymentRequestService.retryPayment(
    req2.paymentRequestId,
    buyerUser,
    {
      buyerPhone: '0754123456',
      providerNetwork: 'Mpesa',
    },
    'MOCK'
  );
  assert(retryResult.success === true, 'Test 8.6: Retry payment initiated successfully');
  assert(retryResult.status === 'PROCESSING', 'Test 8.7: Retried payment is in PROCESSING state');
  const retriedReq = await marketplacePaymentRequestService.getPaymentRequest(req2.paymentRequestId, buyerUser);
  assert(
    retriedReq?.paymentRequestId === req2.paymentRequestId,
    'Test 8.8: Retry retains same logical paymentRequestId (no entity duplication)'
  );

  // --------------------------------------------------------------------------
  // Group 9: Cancellation & Expiry Lifecycle
  // --------------------------------------------------------------------------
  console.log('\n--- Group 9: Cancellation & Expiry Lifecycle ---');

  const { conversation: conv3 } = await marketplaceInboxService.getOrCreateConversation(
    {
      buyerUserId: buyerUser,
      sellerUserId: verifiedSeller,
      shopId: 'shop_101',
      productId: 'prod_another_003',
      listingId: 'prod_another_003',
      productTitleSnapshot: 'Kuku Chotara 50',
      priceSnapshot: 500000,
    },
    buyerUser
  );

  const req3 = await marketplacePaymentRequestService.createPaymentRequest(
    { conversationId: conv3.conversationId, quantity: 1, unitPrice: 500000 },
    verifiedSeller
  );

  // Test 9.1: Buyer cannot cancel seller's payment request
  try {
    await marketplacePaymentRequestService.cancelPaymentRequest(req3.paymentRequestId, buyerUser);
    assert(false, 'Test 9.1: Buyer cancelling request should throw');
  } catch (err: any) {
    assert(err.message.includes('Ni muuzaji pekee'), 'Test 9.1: Buyer cannot cancel seller payment request');
  }

  // Test 9.2: Seller cancels unpaid request
  const cancelledReq = await marketplacePaymentRequestService.cancelPaymentRequest(
    req3.paymentRequestId,
    verifiedSeller,
    'Mteja ameomba kubadilisha idadi'
  );
  assert(cancelledReq.status === 'CANCELLED', 'Test 9.2: Seller successfully cancels request -> CANCELLED');
  assert(cancelledReq.cancelledAt !== null, 'Test 9.3: cancelledAt timestamp recorded');

  // Test 9.4: Cancelled request cannot be paid
  try {
    await marketplacePaymentRequestService.initiatePayment(
      { paymentRequestId: req3.paymentRequestId, buyerPhone: '0754123456' },
      buyerUser
    );
    assert(false, 'Test 9.4: Paying cancelled request should throw');
  } catch (err: any) {
    assert(err.message.includes('limeghairiwa'), 'Test 9.4: Cancelled request cannot be paid');
  }

  // Test 9.5: Expired request handling
  const { conversation: conv4 } = await marketplaceInboxService.getOrCreateConversation(
    {
      buyerUserId: buyerUser,
      sellerUserId: verifiedSeller,
      shopId: 'shop_101',
      productId: 'prod_another_004',
      listingId: 'prod_another_004',
      productTitleSnapshot: 'Kondoo wa Nyama',
      priceSnapshot: 150000,
    },
    buyerUser
  );

  const req4 = await marketplacePaymentRequestService.createPaymentRequest(
    { conversationId: conv4.conversationId, quantity: 1, unitPrice: 150000 },
    verifiedSeller
  );

  // Manually backdate expiresAt to simulate passage of 72 hours
  req4.expiresAt = new Date(Date.now() - 1000).toISOString();

  const fetchedExpired = await marketplacePaymentRequestService.getPaymentRequest(
    req4.paymentRequestId,
    buyerUser
  );
  assert(fetchedExpired?.status === 'EXPIRED', 'Test 9.5: Server authoritatively marks past-due request as EXPIRED');

  // Test 9.6: Expired request cannot be paid
  try {
    await marketplacePaymentRequestService.initiatePayment(
      { paymentRequestId: req4.paymentRequestId, buyerPhone: '0754123456' },
      buyerUser
    );
    assert(false, 'Test 9.6: Paying expired request should throw');
  } catch (err: any) {
    assert(err.message.includes('limekwisha muda'), 'Test 9.6: Expired request cannot be paid');
  }

  // --------------------------------------------------------------------------
  // Group 10: Scoped Participant Access & Audits
  // --------------------------------------------------------------------------
  console.log('\n--- Group 10: Scoped Participant Access & Audits ---');

  // Test 10.1: Third party non-participant blocked from fetching request
  try {
    await marketplacePaymentRequestService.getPaymentRequest(activeReq.paymentRequestId, thirdPartyUser);
    assert(false, 'Test 10.1: Third party viewing request should throw');
  } catch (err: any) {
    assert(err.message.includes('Huruhusiwi'), 'Test 10.1: Third party blocked from viewing payment request (403)');
  }

  // Test 10.2: Third party blocked from audit trail
  try {
    await marketplacePaymentRequestService.getAuditLogs(activeReq.paymentRequestId, thirdPartyUser);
    assert(false, 'Test 10.2: Third party viewing audits should throw');
  } catch (err: any) {
    assert(err.message.includes('Huruhusiwi'), 'Test 10.2: Third party blocked from audit trail (403)');
  }

  // Test 10.3: Admin can inspect request and audit trail
  const adminView = await marketplacePaymentRequestService.getPaymentRequest(
    activeReq.paymentRequestId,
    'admin_user_01',
    true // isAdmin
  );
  assert(adminView !== null, 'Test 10.3: Platform admin can view payment request for governance/dispute resolution');

  console.log('\n================================================================');
  console.log(`  TEST RESULTS: ${passed} PASSED / ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runV111cTests().catch((err) => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});

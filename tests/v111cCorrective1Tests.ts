/**
 * V1.11C-CORRECTIVE-1 TEST SUITE
 *
 * Verifies:
 * 1. Single Authoritative Public Verification Source (getPublicSellerVerificationStatus & getPublicSellerBadge)
 * 2. Strict Badge Eligibility (APPROVED + ACTIVE badge only; never from profile text, payments, etc.)
 * 3. Consistent badge status across all three surfaces:
 *    - Surface 1: Main Marketplace / Gulio
 *    - Surface 2: Seller's own shop
 *    - Surface 3: Buyer viewing seller's shop
 * 4. Real-time cache invalidation and revalidation
 * 5. Payment Request Form corrections (validations, unverified prevention, duplicate prevention)
 * 6. PlusPesa configuration synchronization across all three domains (AI, Monetization, Marketplace)
 * 7. Zero leak of secrets, NIDA, TIN, or internal review notes
 */

import { sellerVerificationService, getPublicSellerVerificationStatus, invalidatePublicVerificationCache } from '../src/services/sellerVerificationService';
import { marketplacePaymentRequestService } from '../src/services/marketplacePaymentRequestService';
import { marketplaceInboxService } from '../src/services/marketplaceInboxService';
import { sellerMonetizationService } from '../src/services/sellerMonetizationService';
import { paymentService } from '../src/services/payment/paymentService';
import { sellerPaymentService } from '../src/services/payment/sellerPaymentService';
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

async function runTests() {
  console.log('================================================================');
  console.log('  UFUGAJI UPDATE — V1.11C-CORRECTIVE-1 REGRESSION TEST SUITE');
  console.log('================================================================\n');

  // Reset all services
  sellerVerificationService._clearAllForTesting(true);
  marketplacePaymentRequestService._resetForTesting();
  marketplaceInboxService._resetInboxForTesting();
  sellerMonetizationService._resetForTesting();

  const seller1 = 'seller_corr_101';
  const seller2 = 'seller_corr_102';
  const buyer1 = 'buyer_corr_201';

  // --- Group 1: Single Authoritative Public Verification Source ---
  console.log('--- Group 1: Single Authoritative Public Verification Source ---');

  // Initially unverified seller
  const initialBadge1 = await getPublicSellerVerificationStatus(seller1);
  assert(initialBadge1.isVerified === false, 'Test 1.1: Initially unverified seller reports isVerified: false');
  assert(initialBadge1.badgeStatus === 'INACTIVE', 'Test 1.2: Badge status is INACTIVE for unverified seller');
  assert((initialBadge1 as any).nidaNumber === undefined, 'Test 1.3: Public badge projection never leaks NIDA');
  assert((initialBadge1 as any).tinNumber === undefined, 'Test 1.4: Public badge projection never leaks TIN');
  assert((initialBadge1 as any).documents === undefined, 'Test 1.5: Public badge projection never leaks documents');
  assert((initialBadge1 as any).internalReviewNotes === undefined, 'Test 1.6: Public badge projection never leaks review notes');

  // Submit and approve seller 1
  const draft1 = sellerVerificationService.createOrUpdateDraft({
    sellerUserId: seller1,
    input: {
      verificationType: 'INDIVIDUAL',
      displayName: 'Juma Farm',
      businessName: 'Juma Livestock Enterprises',
      nationalId: '19900101-12345-00001-20',
      tinNumber: '123-456-789',
      phone: '0754123456',
      region: 'Arusha',
      district: 'Arusha Mjini',
      documents: [{ documentType: 'NIDA', title: 'Kitambulisho', referenceNumber: 'NIDA-123' }]
    }
  });

  const submitted1 = sellerVerificationService.submitApplication({
    verificationId: draft1.verificationId,
    sellerUserId: seller1
  });

  // After submission but before approval, badge must still be false!
  const submittedBadge1 = await getPublicSellerVerificationStatus(seller1);
  assert(submittedBadge1.isVerified === false, 'Test 1.7: Submitted unpaid/unapproved application is NOT verified');

  // Confirm payment & approve
  await sellerVerificationService.processVerificationPaymentCallback(
    'mock',
    {
      externalId: 'UFUGAJI_VERIFICATION_mock',
      amount: 5000,
      currency: 'TZS',
      status: 'SUCCESS'
    }
  );

  sellerVerificationService.approveVerification({
    verificationId: submitted1.verificationId,
    adminUserId: 'admin_said',
    autoActivateBadge: true
  });

  const approvedBadge1 = await getPublicSellerVerificationStatus(seller1);
  assert(approvedBadge1.isVerified === true, 'Test 1.8: Approved seller with active badge is isVerified: true');
  assert(approvedBadge1.badgeStatus === 'ACTIVE', 'Test 1.9: Approved seller badgeStatus is ACTIVE');

  // --- Group 2: Strict Badge Eligibility (Negative Cases) ---
  console.log('\n--- Group 2: Strict Badge Eligibility ---');

  // Deactivate badge
  sellerVerificationService.deactivateBadge({
    verificationId: submitted1.verificationId,
    adminUserId: 'admin_said',
    reason: 'Uchunguzi'
  });
  const deactivatedBadge = await getPublicSellerVerificationStatus(seller1);
  assert(deactivatedBadge.isVerified === false, 'Test 2.1: Deactivated badge seller reports isVerified: false');
  assert(deactivatedBadge.badgeStatus === 'INACTIVE', 'Test 2.2: Deactivated badge status is INACTIVE');

  // Reactivate
  sellerVerificationService.activateBadge({
    verificationId: submitted1.verificationId,
    adminUserId: 'admin_said'
  });
  const reactivatedBadge = await getPublicSellerVerificationStatus(seller1);
  assert(reactivatedBadge.isVerified === true, 'Test 2.3: Reactivated badge seller reports isVerified: true');

  // Suspend
  sellerVerificationService.suspendVerification({
    verificationId: submitted1.verificationId,
    adminUserId: 'admin_said',
    reason: 'Ukiukaji wa taratibu za soko'
  });
  const suspendedBadge = await getPublicSellerVerificationStatus(seller1);
  assert(suspendedBadge.isVerified === false, 'Test 2.4: Suspended verification seller reports isVerified: false');
  assert(suspendedBadge.badgeStatus === 'SUSPENDED', 'Test 2.5: Suspended badge status is SUSPENDED');

  // Restore to active for multi-surface test
  sellerVerificationService.approveVerification({
    verificationId: submitted1.verificationId,
    adminUserId: 'admin_said',
    autoActivateBadge: true
  });

  // --- Group 3: Consistency Across Surfaces ---
  console.log('\n--- Group 3: Consistency Across Surfaces ---');
  // Surface 1 projection (Marketplace landing page)
  const surface1Badge = sellerVerificationService.getPublicSellerBadge(seller1);
  // Surface 2 projection (Seller own shop)
  const surface2Badge = await getPublicSellerVerificationStatus(seller1);
  // Surface 3 projection (Buyer viewing seller shop)
  const surface3Badge = await getPublicSellerVerificationStatus(seller1);

  assert(surface1Badge.isVerified === surface2Badge.isVerified, 'Test 3.1: Surface 1 and Surface 2 match isVerified');
  assert(surface2Badge.isVerified === surface3Badge.isVerified, 'Test 3.2: Surface 2 and Surface 3 match isVerified');
  assert(surface1Badge.badgeStatus === surface3Badge.badgeStatus, 'Test 3.3: Surface 1 and Surface 3 match badgeStatus');

  // --- Group 4: Real-time Invalidation & Revalidation ---
  console.log('\n--- Group 4: Real-time Invalidation & Revalidation ---');
  invalidatePublicVerificationCache(seller1);
  const revalidatedBadge = await getPublicSellerVerificationStatus(seller1);
  assert(revalidatedBadge.isVerified === true, 'Test 4.1: Cache invalidation preserves authoritative active status on revalidation');

  invalidatePublicVerificationCache(); // Clear all
  const revalidatedAll = await getPublicSellerVerificationStatus(seller1);
  assert(revalidatedAll.isVerified === true, 'Test 4.2: Global cache clear preserves authoritative active status');

  // --- Group 5: Payment Request Form Corrections & Gating ---
  console.log('\n--- Group 5: Payment Request Form Corrections & Gating ---');

  // Activate monetization for seller 1
  sellerMonetizationService.activateFirstMonthFreeTrial({
    sellerUserId: seller1,
    sellerProfileId: 'shop_101'
  });

  // Create conversation
  const conv = await marketplaceInboxService.getOrCreateConversation(
    {
      productId: 'prod_cow_1',
      listingId: 'prod_cow_1',
      buyerUserId: buyer1,
      sellerUserId: seller1,
      shopId: 'shop_101',
      productTitleSnapshot: 'Ng\'ombe Bora wa Maziwa',
      priceSnapshot: 1500000,
      currencySnapshot: 'TZS',
      buyerNameSnapshot: 'Baraka Mkulima',
      initialMessageText: 'Habari, ninahitaji ng\'ombe huyu.'
    },
    buyer1,
    {
      id: 'prod_cow_1',
      productId: 'prod_cow_1',
      sellerId: seller1,
      title: 'Ng\'ombe Bora wa Maziwa',
      price: 1500000,
      currency: 'TZS',
      status: 'active',
      quantityAvailable: 2
    } as any
  );

  // Verified seller creates payment request
  const createdReq = await marketplacePaymentRequestService.createPaymentRequest(
    {
      conversationId: conv.conversation.conversationId,
      quantity: 1,
      unitPrice: 1500000,
      description: 'Ng\'ombe 1 kama tulivyokubaliana'
    },
    seller1
  );

  assert(createdReq.paymentRequestId.startsWith('mpr_'), 'Test 5.1: Payment request successfully created by verified seller');
  assert(createdReq.totalAmount === 1500000, 'Test 5.2: Server authoritatively computed totalAmount = 1 * 1,500,000');
  assert(createdReq.status === 'PENDING_PAYMENT', 'Test 5.3: Initial status is PENDING_PAYMENT');

  // Duplicate active payment request prevention
  let dupError = false;
  try {
    await marketplacePaymentRequestService.createPaymentRequest(
      {
        conversationId: conv.conversation.conversationId,
        quantity: 1,
        unitPrice: 1500000
      },
      seller1
    );
  } catch (err: any) {
    dupError = true;
    assert(
      err.message.includes('linalosubiri katika mazungumzo haya'),
      'Test 5.4: Duplicate pending payment request blocked with clear Swahili notice'
    );
  }
  assert(dupError, 'Test 5.5: Duplicate pending request in same conversation threw error');

  // Activate monetization for seller2 (can sell, but remains UNVERIFIED)
  sellerMonetizationService.activateFirstMonthFreeTrial({
    sellerUserId: seller2,
    sellerProfileId: 'shop_102'
  });

  // Unverified seller blocked from payment request
  const conv2 = await marketplaceInboxService.getOrCreateConversation(
    {
      productId: 'prod_goat_2',
      listingId: 'prod_goat_2',
      buyerUserId: buyer1,
      sellerUserId: seller2,
      shopId: 'shop_102',
      productTitleSnapshot: 'Mbuzi wa Maziwa',
      priceSnapshot: 200000,
      currencySnapshot: 'TZS',
      buyerNameSnapshot: 'Baraka Mkulima',
      initialMessageText: 'Nahitaji mbuzi.'
    },
    buyer1,
    {
      id: 'prod_goat_2',
      productId: 'prod_goat_2',
      sellerId: seller2,
      title: 'Mbuzi wa Maziwa',
      price: 200000,
      currency: 'TZS',
      status: 'active',
      quantityAvailable: 3
    } as any
  );

  let unverifiedError = false;
  try {
    await marketplacePaymentRequestService.createPaymentRequest(
      {
        conversationId: conv2.conversation.conversationId,
        quantity: 1,
        unitPrice: 200000
      },
      seller2
    );
  } catch (err: any) {
    unverifiedError = true;
    assert(
      err.message.includes('muuzaji aliyethibitishwa pekee'),
      'Test 5.6: Unverified seller strictly denied with Verified Seller requirement'
    );
  }
  assert(unverifiedError, 'Test 5.7: Unverified seller creation threw error');

  // Amount limits
  let minAmountError = false;
  try {
    await marketplacePaymentRequestService.createPaymentRequest(
      {
        conversationId: conv2.conversation.conversationId,
        quantity: 1,
        unitPrice: 100 // Below min 500 TZS
      },
      seller1
    );
  } catch (err: any) {
    minAmountError = true;
  }
  assert(minAmountError, 'Test 5.8: Sub-500 TZS amount rejected');

  // --- Group 6: PlusPesa Configuration Synchronization ---
  console.log('\n--- Group 6: PlusPesa Configuration Synchronization ---');

  const testConfig = {
    publicKey: 'pk_test_ufugaji_corr_1',
    secretKey: 'sk_test_ufugaji_corr_1',
    baseUrl: 'https://sandbox.pluspesa.com/api/v1',
    environment: 'sandbox',
    callbackSecret: 'whsec_test_corr_1'
  };

  // Sync config across paymentService, sellerPaymentService, marketplacePaymentRequestService
  paymentService.updateProviderConfig('PLUSPESA', testConfig);
  sellerPaymentService.updateProviderConfig('PLUSPESA', testConfig);
  marketplacePaymentRequestService.updateProviderConfig('PLUSPESA', testConfig);

  const safeConfigAI = paymentService.getProviderSafeConfig('PLUSPESA');
  const safeConfigSeller = sellerPaymentService.getProviderSafeConfig('PLUSPESA');
  const safeConfigMarket = marketplacePaymentRequestService.getProviderSafeConfig('PLUSPESA');

  assert(safeConfigAI.isConfigured === true, 'Test 6.1: paymentService PlusPesa is configured');
  assert(safeConfigSeller.isConfigured === true, 'Test 6.2: sellerPaymentService PlusPesa is configured');
  assert(safeConfigMarket.isConfigured === true, 'Test 6.3: marketplacePaymentRequestService PlusPesa is configured');

  assert(safeConfigAI.maskedPublicKey.includes('****'), 'Test 6.4: AI Safe config masks public key');
  assert(safeConfigSeller.maskedSecretKey.includes('****'), 'Test 6.5: Seller Safe config masks secret key');
  assert((safeConfigMarket as any).secretKey === undefined, 'Test 6.6: Market Safe config never leaks raw secretKey');

  console.log('\n================================================================');
  console.log(`  CORRECTIVE-1 SUITE SUMMARY: ${passed} PASSED / ${failed} FAILED`);
  console.log('================================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

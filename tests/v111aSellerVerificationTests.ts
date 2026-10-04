/**
 * V1.11A — SELLER VERIFICATION & GOVERNANCE FOUNDATION TEST SUITE
 *
 * Validates the complete authoritative seller verification domain:
 * 1. Application Draft & Submission
 * 2. Server-Authoritative Processing Fee (5,000 TZS, Purpose: VERIFICATION_PROCESSING_FEE)
 * 3. Payment Boundary: Payment Success != Verification Approval (Payment is NOT purchase of trust!)
 * 4. Provider Callback Validation & Idempotency (Amount, Currency, External ID format)
 * 5. Admin Governance Workflow: Under Review, Request Correction, Approval, Rejection
 * 6. Authoritative Badge Gating: Badge cannot activate without APPROVED state
 * 7. Badge Lifecycle: Activation, Deactivation, Suspension
 * 8. Separation from Seller Monetization (Monetization remains intact regardless of verification status)
 * 9. Immutable Audit Trail & Structured Event Log
 * 10. Lightweight Public Trust Signal (Zero leak of sensitive documents or NIDA)
 * 11. Notification Center Integration
 */

import { sellerVerificationService } from '../src/services/sellerVerificationService';
import { sellerMonetizationService } from '../src/services/sellerMonetizationService';
import { VERIFICATION_FEE_CONFIG, getSellerVerificationDisplay } from '../src/types/sellerVerification';
import { getLocalCachedNotifications, _resetNotificationsForTesting } from '../src/services/notificationService';

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

async function runV111aTests() {
  console.log('================================================================');
  console.log('  UFUGAJI UPDATE — V1.11A SELLER VERIFICATION FOUNDATION TESTS');
  console.log('================================================================\n');

  sellerVerificationService._clearAllForTesting();
  _resetNotificationsForTesting();

  // --------------------------------------------------------------------------
  // Group 1: Governed Processing Fee Configuration
  // --------------------------------------------------------------------------
  console.log('--- Group 1: Governed Fee Configuration ---');
  assert(VERIFICATION_FEE_CONFIG.amount === 5000, 'Test 1.1: Verification processing fee is exactly 5,000 TZS');
  assert(VERIFICATION_FEE_CONFIG.currency === 'TZS', 'Test 1.2: Processing fee currency is strictly TZS');
  assert(
    VERIFICATION_FEE_CONFIG.purpose === 'VERIFICATION_PROCESSING_FEE',
    'Test 1.3: Payment purpose is locked to VERIFICATION_PROCESSING_FEE'
  );
  assert(
    VERIFICATION_FEE_CONFIG.disclaimer.includes('hakumaanishi verification imekubaliwa'),
    'Test 1.4: Disclaimer explicitly states fee is for processing, not automatic trust purchase'
  );

  // --------------------------------------------------------------------------
  // Group 2: Application Draft & Structured Submission
  // --------------------------------------------------------------------------
  console.log('\n--- Group 2: Application Draft & Submission ---');
  const sellerId1 = 'seller_poultry_kuku_01';

  const draft = sellerVerificationService.createOrUpdateDraft({
    sellerUserId: sellerId1,
    shopId: 'shop_kuku_01',
    input: {
      verificationType: 'INDIVIDUAL',
      legalName: 'Juma Ramadhani Mussa',
      displayName: 'Juma Kuku Farm',
      businessName: 'Juma Poultry Supplies',
      phone: '0754123456',
      region: 'Morogoro',
      district: 'Morogoro Mjini',
      area: 'Mazimbu',
      nationalId: '19850101-12345-00001-20',
      tinNumber: '123-456-789',
      documents: [
        {
          documentType: 'NIDA',
          title: 'Kitambulisho cha NIDA',
          referenceNumber: '19850101-12345-00001-20'
        }
      ]
    }
  });

  assert(draft.status === 'DRAFT', 'Test 2.1: Created application starts in DRAFT status');
  assert(draft.badgeStatus === 'INACTIVE', 'Test 2.2: Badge is strictly INACTIVE during DRAFT');
  assert(draft.hasActiveBadge === false, 'Test 2.3: hasActiveBadge is false during DRAFT');
  assert(draft.applicationNumber.startsWith('VER-'), 'Test 2.4: Deterministic application number generated (VER-YYYY-XXXX)');
  assert(draft.sellerUserId === sellerId1, 'Test 2.5: Correctly bound to sellerUserId');
  assert(draft.documents.length === 1, 'Test 2.6: Structured document reference recorded');

  // Submit application
  const submitted = sellerVerificationService.submitApplication({
    sellerUserId: sellerId1,
    verificationId: draft.verificationId
  });

  assert(
    submitted.status === 'PAYMENT_REQUIRED',
    'Test 2.7: Submission transitions from DRAFT to PAYMENT_REQUIRED because fee is unpaid'
  );
  assert(submitted.processingPaymentStatus === 'NOT_PAID', 'Test 2.8: Processing payment status is NOT_PAID');

  // Prevent duplicate active submission
  let duplicatePrevented = false;
  try {
    sellerVerificationService.createOrUpdateDraft({
      sellerUserId: sellerId1,
      input: {
        verificationType: 'FARM',
        businessName: 'Other Farm',
        phone: '0711111111'
      }
    });
  } catch (err: any) {
    duplicatePrevented = true;
  }
  assert(duplicatePrevented, 'Test 2.9: Prevents starting duplicate application when one is active');

  // --------------------------------------------------------------------------
  // Group 3: Server-Authoritative Fee Payment Initiation
  // --------------------------------------------------------------------------
  console.log('\n--- Group 3: Server-Authoritative Fee Payment Initiation ---');

  const payInit = await sellerVerificationService.initiateVerificationPayment({
    sellerUserId: sellerId1,
    verificationId: submitted.verificationId,
    customerPhone: '0754123456',
    providerName: 'MOCK'
  });

  assert(payInit.success === true, 'Test 3.1: Verification payment initiated successfully via mock provider');
  assert(payInit.paymentIntent.amount === 5000, 'Test 3.2: Payment intent amount strictly locked to 5,000 TZS');
  assert(payInit.paymentIntent.currency === 'TZS', 'Test 3.3: Payment intent currency is TZS');
  assert(
    payInit.paymentIntent.purpose === 'VERIFICATION_PROCESSING_FEE',
    'Test 3.4: Payment purpose is VERIFICATION_PROCESSING_FEE'
  );
  assert(
    payInit.paymentIntent.externalId.startsWith('UFUGAJI_VERIFICATION_'),
    `Test 3.5: External ID follows governed prefix: ${payInit.paymentIntent.externalId}`
  );

  const appAfterInit = sellerVerificationService.getVerificationById(submitted.verificationId)!;
  assert(
    appAfterInit.status === 'PAYMENT_PENDING' || appAfterInit.status === 'PAYMENT_CONFIRMED',
    'Test 3.6: Application status updated upon payment initiation'
  );

  // Cross-user unauthorized payment attempt
  const crossUserPay = await sellerVerificationService.initiateVerificationPayment({
    sellerUserId: 'attacker_user_999',
    verificationId: submitted.verificationId,
    customerPhone: '0754123456'
  });
  assert(crossUserPay.success === false, 'Test 3.7: Unauthorized user cannot pay for another seller verification');

  // --------------------------------------------------------------------------
  // Group 4: CORE BUSINESS RULE: Payment Success != Verification Approval!
  // --------------------------------------------------------------------------
  console.log('\n--- Group 4: Payment Boundary (Payment != Approval / Trust) ---');

  const webhookResult = await sellerVerificationService.processVerificationPaymentCallback(
    'MOCK',
    {
      externalId: payInit.paymentIntent.externalId,
      internalPaymentId: payInit.paymentIntent.paymentIntentId,
      status: 'SUCCESS',
      amount: 5000,
      currency: 'TZS',
      providerReference: 'MPESA_REF_VERIF_001'
    }
  );

  assert(webhookResult.success === true, 'Test 4.1: Webhook processed successfully');
  const appAfterPayment = sellerVerificationService.getVerificationById(submitted.verificationId)!;

  // CRITICAL CHECKS:
  assert(
    appAfterPayment.status === 'PAYMENT_CONFIRMED',
    `Test 4.2: Application status is PAYMENT_CONFIRMED (current: ${appAfterPayment.status})`
  );
  assert(
    appAfterPayment.status !== 'APPROVED',
    'Test 4.3: CRITICAL: Successful payment did NOT approve verification!'
  );
  assert(
    appAfterPayment.badgeStatus === 'INACTIVE',
    'Test 4.4: CRITICAL: Successful payment did NOT activate badge (remains INACTIVE)'
  );
  assert(
    appAfterPayment.hasActiveBadge === false,
    'Test 4.5: CRITICAL: hasActiveBadge remains strictly false'
  );

  const publicBadgePreReview = sellerVerificationService.getPublicSellerBadge(sellerId1);
  assert(
    publicBadgePreReview.isVerified === false,
    'Test 4.6: Public trust signal remains isVerified: false after payment'
  );

  // Idempotency: duplicate webhook callback
  const duplicateWebhook = await sellerVerificationService.processVerificationPaymentCallback(
    'MOCK',
    {
      externalId: payInit.paymentIntent.externalId,
      internalPaymentId: payInit.paymentIntent.paymentIntentId,
      status: 'SUCCESS',
      amount: 5000,
      currency: 'TZS',
      providerReference: 'MPESA_REF_VERIF_001'
    }
  );
  assert(duplicateWebhook.isDuplicate === true, 'Test 4.7: Duplicate webhook recognized idempotently');

  // Tampering: amount mismatch
  const tamperedAmount = await sellerVerificationService.processVerificationPaymentCallback(
    'MOCK',
    {
      externalId: payInit.paymentIntent.externalId,
      internalPaymentId: payInit.paymentIntent.paymentIntentId,
      status: 'SUCCESS',
      amount: 1000, // Underpayment
      currency: 'TZS',
      providerReference: 'TAMPER_REF'
    }
  );
  assert(tamperedAmount.errorCode === 'AMOUNT_MISMATCH', 'Test 4.8: Amount tampering (1,000 vs 5,000) rejected');

  // Tampering: currency mismatch
  const tamperedCurrency = await sellerVerificationService.processVerificationPaymentCallback(
    'MOCK',
    {
      externalId: payInit.paymentIntent.externalId,
      internalPaymentId: payInit.paymentIntent.paymentIntentId,
      status: 'SUCCESS',
      amount: 5000,
      currency: 'USD',
      providerReference: 'TAMPER_CURR'
    }
  );
  assert(tamperedCurrency.errorCode === 'CURRENCY_MISMATCH', 'Test 4.9: Currency tampering (USD vs TZS) rejected');

  // --------------------------------------------------------------------------
  // Group 5: Admin Governance Workflow & Authoritative Review
  // --------------------------------------------------------------------------
  console.log('\n--- Group 5: Admin Governance Workflow ---');
  const adminUid = 'admin_compliance_officer_01';

  // Step 5A: Start Review
  const underReview = sellerVerificationService.startReview({
    verificationId: submitted.verificationId,
    adminUserId: adminUid
  });
  assert(underReview.status === 'UNDER_REVIEW', 'Test 5.1: Admin moves application to UNDER_REVIEW');
  assert(underReview.reviewedBy === adminUid, 'Test 5.2: Reviewer admin UID recorded');

  // Step 5B: Request Correction
  const corrected = sellerVerificationService.requestCorrection({
    verificationId: submitted.verificationId,
    correctionNotes: 'Tafadhali pakia picha ya NIDA iliyo wazi zaidi pande zote mbili.',
    adminUserId: adminUid
  });
  assert(corrected.status === 'DRAFT', 'Test 5.3: Request correction moves status to DRAFT');
  assert(
    corrected.correctionNotes?.includes('NIDA'),
    'Test 5.4: Correction notes preserved for seller visibility'
  );

  // Seller resubmits after correction (since fee is already paid, goes directly to PAYMENT_CONFIRMED)
  const resubmitted = sellerVerificationService.submitApplication({
    sellerUserId: sellerId1,
    verificationId: submitted.verificationId,
    input: {
      verificationType: 'INDIVIDUAL',
      legalName: 'Juma Ramadhani Mussa',
      businessName: 'Juma Poultry Supplies',
      phone: '0754123456',
      region: 'Morogoro',
      district: 'Morogoro Mjini',
      area: 'Mazimbu'
    }
  });
  assert(
    resubmitted.status === 'PAYMENT_CONFIRMED',
    'Test 5.5: Resubmission with existing paid fee bypasses repayment and moves to PAYMENT_CONFIRMED'
  );

  // Resume review
  sellerVerificationService.startReview({
    verificationId: submitted.verificationId,
    adminUserId: adminUid
  });

  // Step 5C: Premature badge activation attempt
  let prematureBadgePrevented = false;
  try {
    sellerVerificationService.activateBadge({
      verificationId: submitted.verificationId,
      adminUserId: adminUid
    });
  } catch (err: any) {
    prematureBadgePrevented = true;
  }
  assert(prematureBadgePrevented, 'Test 5.6: Badge CANNOT be activated before application is APPROVED');

  // Step 5D: Authoritative Approval & Badge Activation
  const approved = sellerVerificationService.approveVerification({
    verificationId: submitted.verificationId,
    adminNotes: 'Nyaraka zote za NIDA na eneo la shamba zimekaguliwa na kuthibitishwa.',
    autoActivateBadge: true,
    adminUserId: adminUid
  });

  assert(approved.status === 'APPROVED', 'Test 5.7: Status transitioned authoritatively to APPROVED');
  assert(approved.badgeStatus === 'ACTIVE', 'Test 5.8: Badge activated upon authoritative approval');
  assert(approved.hasActiveBadge === true, 'Test 5.9: hasActiveBadge is true');
  assert(Boolean(approved.approvedAt), 'Test 5.10: approvedAt timestamp recorded');
  assert(Boolean(approved.badgeActivatedAt), 'Test 5.11: badgeActivatedAt timestamp recorded');

  // Step 5E: Public Trust Signal after approval
  const publicBadgePostApproval = sellerVerificationService.getPublicSellerBadge(sellerId1);
  assert(publicBadgePostApproval.isVerified === true, 'Test 5.12: Public trust signal now shows isVerified: true');
  assert(publicBadgePostApproval.badgeStatus === 'ACTIVE', 'Test 5.13: Public badge status is ACTIVE');
  assert(
    publicBadgePostApproval.badgeLabel.includes('Aliyethibitishwa'),
    'Test 5.14: Public label indicates Verified Seller'
  );
  assert(!('nationalId' in (publicBadgePostApproval as any)), 'Test 5.15: Public signal NEVER leaks national ID');
  assert(!('documents' in (publicBadgePostApproval as any)), 'Test 5.16: Public signal NEVER leaks verification documents');

  // --------------------------------------------------------------------------
  // Group 6: Badge Governance Lifecycle (Deactivation & Suspension)
  // --------------------------------------------------------------------------
  console.log('\n--- Group 6: Badge Governance Lifecycle ---');

  // Deactivate Badge
  const deactivated = sellerVerificationService.deactivateBadge({
    verificationId: submitted.verificationId,
    reason: 'Uchunguzi wa kisheria unaendelea',
    adminUserId: adminUid
  });
  assert(deactivated.badgeStatus === 'INACTIVE', 'Test 6.1: Badge deactivated to INACTIVE');
  assert(deactivated.hasActiveBadge === false, 'Test 6.2: hasActiveBadge is false');
  assert(
    sellerVerificationService.getPublicSellerBadge(sellerId1).isVerified === false,
    'Test 6.3: Public badge immediately updates to unverified when deactivated'
  );

  // Reactivate Badge
  const reactivated = sellerVerificationService.activateBadge({
    verificationId: submitted.verificationId,
    adminUserId: adminUid
  });
  assert(reactivated.badgeStatus === 'ACTIVE', 'Test 6.4: Badge successfully reactivated');

  // Suspend Verification
  const suspended = sellerVerificationService.suspendVerification({
    verificationId: submitted.verificationId,
    reason: 'Ukiukwaji wa mkataba wa mauzo',
    adminUserId: adminUid
  });
  assert(suspended.status === 'SUSPENDED', 'Test 6.5: Application status moves to SUSPENDED');
  assert(suspended.badgeStatus === 'SUSPENDED', 'Test 6.6: Badge status moves to SUSPENDED');
  assert(suspended.hasActiveBadge === false, 'Test 6.7: hasActiveBadge is false while suspended');

  // Require Re-verification
  const reverif = sellerVerificationService.requireReverification({
    verificationId: submitted.verificationId,
    reason: 'Muda wa vibali vya shamba umekwisha',
    adminUserId: adminUid
  });
  assert(reverif.status === 'REVERIFICATION_REQUIRED', 'Test 6.8: Status set to REVERIFICATION_REQUIRED');

  // --------------------------------------------------------------------------
  // Group 7: Rejection Workflow & Isolation from Monetization
  // --------------------------------------------------------------------------
  console.log('\n--- Group 7: Rejection Workflow & Monetization Isolation ---');
  const sellerId2 = 'seller_feed_agrovet_02';

  // Ensure seller 2 has active monetization
  sellerMonetizationService.activateFirstMonthFreeTrial({
    sellerUserId: sellerId2,
    sellerProfileId: sellerId2
  });
  const monetBefore = sellerMonetizationService.canSellerSellOnMarketplace(sellerId2);
  assert(monetBefore.canSell === true, 'Test 7.1: Seller 2 has active monetization access');

  // Create & submit application for seller 2
  const app2 = sellerVerificationService.createOrUpdateDraft({
    sellerUserId: sellerId2,
    input: {
      verificationType: 'AGROVET',
      businessName: 'Fake Agrovet Supplies',
      phone: '0712345678',
      region: 'Arusha',
      district: 'Arusha Mjini',
      area: 'Kijenge'
    }
  });
  sellerVerificationService.submitApplication({
    sellerUserId: sellerId2,
    verificationId: app2.verificationId
  });

  // Admin starts review and rejects
  sellerVerificationService.startReview({
    verificationId: app2.verificationId,
    adminUserId: adminUid
  });

  const rejected = sellerVerificationService.rejectVerification({
    verificationId: app2.verificationId,
    safeRejectionReason: 'Vibali vya biashara havikuweza kuthibitishwa na mamlaka husika.',
    internalAdminNotes: 'Nyaraka ya TMDA iliyowasilishwa ni ghushi.',
    adminUserId: adminUid
  });

  assert(rejected.status === 'REJECTED', 'Test 7.2: Application is REJECTED');
  assert(rejected.badgeStatus === 'INACTIVE', 'Test 7.3: Badge is INACTIVE');
  assert(
    rejected.safeRejectionReason?.includes('havikuweza kuthibitishwa'),
    'Test 7.4: Safe rejection reason recorded for seller'
  );
  assert(
    rejected.reviewDecisionNotes?.includes('ghushi'),
    'Test 7.5: Internal admin notes kept distinct from public/seller reason'
  );

  // STRICT SEPARATION: Rejection of verification DOES NOT disable Seller Monetization!
  const monetAfter = sellerMonetizationService.canSellerSellOnMarketplace(sellerId2);
  assert(
    monetAfter.canSell === true,
    'Test 7.6: STRICT SEPARATION: Verification rejection does NOT suspend seller monetization or shop sales'
  );

  // --------------------------------------------------------------------------
  // Group 8: Immutable Audit Trail
  // --------------------------------------------------------------------------
  console.log('\n--- Group 8: Immutable Audit Trail ---');
  const audits1 = sellerVerificationService.getAuditLogs(submitted.verificationId);
  assert(audits1.length >= 7, `Test 8.1: Complete audit trail recorded for application 1 (found ${audits1.length} events)`);

  const actions = audits1.map((a) => a.action);
  assert(actions.includes('VERIFICATION_APPLICATION_CREATED'), 'Test 8.2: Audit includes CREATED');
  assert(actions.includes('VERIFICATION_APPLICATION_SUBMITTED'), 'Test 8.3: Audit includes SUBMITTED');
  assert(actions.includes('VERIFICATION_PAYMENT_CONFIRMED'), 'Test 8.4: Audit includes PAYMENT_CONFIRMED');
  assert(actions.includes('VERIFICATION_REVIEW_STARTED'), 'Test 8.5: Audit includes REVIEW_STARTED');
  assert(actions.includes('VERIFICATION_APPROVED'), 'Test 8.6: Audit includes APPROVED');
  assert(actions.includes('VERIFICATION_BADGE_ACTIVATED'), 'Test 8.7: Audit includes BADGE_ACTIVATED');
  assert(actions.includes('VERIFICATION_BADGE_DEACTIVATED'), 'Test 8.8: Audit includes BADGE_DEACTIVATED');

  // --------------------------------------------------------------------------
  // Group 9: Presentation & Status Display Mapping
  // --------------------------------------------------------------------------
  console.log('\n--- Group 9: Presentation & Display Mapping ---');
  const displayApproved = getSellerVerificationDisplay('APPROVED', 'ACTIVE');
  assert(displayApproved.isVerified === true, 'Test 9.1: APPROVED + ACTIVE badge displays isVerified: true');
  assert(displayApproved.colorClass.includes('emerald'), 'Test 9.2: Verified badge uses authoritative green color styling');

  const displayPaidUnreviewed = getSellerVerificationDisplay('PAYMENT_CONFIRMED', 'INACTIVE');
  assert(displayPaidUnreviewed.isVerified === false, 'Test 9.3: PAYMENT_CONFIRMED without approval displays isVerified: false');
  assert(displayPaidUnreviewed.badgeLabel.includes('Inasubiri Review'), 'Test 9.4: Indicates awaiting administrative review');

  const displayRejected = getSellerVerificationDisplay('REJECTED', 'INACTIVE');
  assert(displayRejected.isVerified === false, 'Test 9.5: REJECTED displays isVerified: false');

  // --------------------------------------------------------------------------
  // Group 10: Notification Center Verification Events
  // --------------------------------------------------------------------------
  console.log('\n--- Group 10: Notification Center Integration ---');
  const seller1Notifications = getLocalCachedNotifications(sellerId1);
  assert(
    seller1Notifications.length >= 4,
    `Test 10.1: Notifications emitted to seller during verification lifecycle (found ${seller1Notifications.length})`
  );

  const notifTypes = seller1Notifications.map((n) => n.type);
  assert(
    notifTypes.includes('VERIFICATION_APPLICATION_SUBMITTED'),
    'Test 10.2: Notified on APPLICATION_SUBMITTED'
  );
  assert(
    notifTypes.includes('VERIFICATION_PAYMENT_CONFIRMED'),
    'Test 10.3: Notified on PAYMENT_CONFIRMED'
  );
  assert(
    notifTypes.includes('VERIFICATION_APPROVED'),
    'Test 10.4: Notified on VERIFICATION_APPROVED'
  );
  assert(
    notifTypes.includes('VERIFICATION_BADGE_ACTIVATED'),
    'Test 10.5: Notified on BADGE_ACTIVATED'
  );

  // --------------------------------------------------------------------------
  // Final Summary
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`  V1.11A VERIFICATION SUITE: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runV111aTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});

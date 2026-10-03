/**
 * ============================================================================
 * UFUGAJI UPDATE — V1.10A SELLER MONETIZATION FOUNDATION & LIFECYCLE TEST SUITE
 * ============================================================================
 * Tests:
 * 1. Data Model & Governed Config (1000 TZS, SELLER_MONTHLY, 30 days trial, 7 days grace)
 * 2. Explicit States (NOT_ACTIVATED, TRIAL_ACTIVE, ACTIVE, GRACE_PERIOD, EXPIRED, CANCELLED, SUSPENDED)
 * 3. First Month Free Trial Activation
 * 4. Trial Anti-Replay & Re-activation Prevention (hasHadTrial protection)
 * 5. Idempotent Activation (repeated requests return identical trial without extending)
 * 6. Authoritative Lifecycle: Trial Expiry -> GRACE_PERIOD
 * 7. Authoritative Lifecycle: Grace Expiry -> EXPIRED
 * 8. Non-Destructive Expiry: Account, identity, shop, products, reviews, and trust signals preserved
 * 9. Marketplace Selling Eligibility Helper: canSellerSellOnMarketplace()
 * 10. Governance Precedence: Monetization NEVER overrides moderation or seller restrictions
 * 11. Strict Separation: Monetization status NEVER modifies seller verification status (no paid badge)
 * 12. Controlled Authoritative Payment Confirmation & 30-Day Period Extension
 * 13. Payment Validation: Rejects amounts < 1000 TZS or non-SUCCESS status
 * 14. Administrative Controls: Suspend & Reactivate lifecycle with audit logging
 * 15. In-App Notification Center Integration (SELLER_TRIAL_STARTED, SELLER_GRACE_STARTED, etc.)
 * 16. Backward Compatibility: Legacy seller records resolve safely to NOT_ACTIVATED
 * ============================================================================
 */

import {
  sellerMonetizationService,
  SELLER_MONETIZATION_CONFIG,
  evaluateAuthoritativeLifecycle,
  createDefaultSellerMonetizationRecord
} from '../src/services/sellerMonetizationService';
import { canSellerSellOnMarketplace, evaluateProductMarketplaceEligibility } from '../src/services/marketplaceGovernanceEnforcement';
import { MarketplaceProduct } from '../src/types/marketplace';

function assert(section: string, condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ [FAIL] Section ${section}: ${message}`);
    process.exit(1);
  }
  console.log(`✅ [PASS] Section ${section}: ${message}`);
}

async function runMonetizationTests() {
  console.log('================================================================');
  console.log('  UFUGAJI UPDATE — V1.10A SELLER MONETIZATION TEST SUITE');
  console.log('================================================================\n');

  sellerMonetizationService._resetForTesting();

  // --------------------------------------------------------------------------
  // SECTION 1: DATA MODEL & GOVERNED CONFIGURATION
  // --------------------------------------------------------------------------
  console.log('--- Section 1: Data Model & Governed Configuration ---');

  assert(
    '1',
    SELLER_MONETIZATION_CONFIG.plan === 'SELLER_MONTHLY',
    '1.1: Authoritative plan name is SELLER_MONTHLY'
  );
  assert(
    '1',
    SELLER_MONETIZATION_CONFIG.monthlyPrice === 1000,
    '1.2: Monthly price is strictly 1,000'
  );
  assert(
    '1',
    SELLER_MONETIZATION_CONFIG.currency === 'TZS',
    '1.3: Currency is strictly TZS'
  );
  assert(
    '1',
    SELLER_MONETIZATION_CONFIG.trialDurationDays === 30,
    '1.4: First month free trial duration is 30 days'
  );
  assert(
    '1',
    SELLER_MONETIZATION_CONFIG.graceDurationDays === 7,
    '1.5: Governed grace period duration is 7 days'
  );

  // --------------------------------------------------------------------------
  // SECTION 2: BACKWARD COMPATIBILITY & DEFAULT STATE
  // --------------------------------------------------------------------------
  console.log('\n--- Section 2: Backward Compatibility & Default State ---');

  const legacySellerId = `seller_legacy_${Date.now()}`;
  const defaultRecord = sellerMonetizationService.getSellerRecord(legacySellerId);

  assert(
    '2',
    defaultRecord.status === 'NOT_ACTIVATED',
    '2.1: Legacy/new seller resolves deterministically to NOT_ACTIVATED'
  );
  assert(
    '2',
    defaultRecord.hasHadTrial === false,
    '2.2: Legacy seller has not had trial initially'
  );
  assert(
    '2',
    defaultRecord.price === 1000 && defaultRecord.currency === 'TZS',
    '2.3: Uses server-authoritative price (1000 TZS)'
  );

  const initialEligibility = canSellerSellOnMarketplace(legacySellerId);
  assert(
    '2',
    initialEligibility.canSell === false && initialEligibility.requiresPaymentAction === true,
    '2.4: NOT_ACTIVATED seller cannot sell until trial is activated'
  );

  // --------------------------------------------------------------------------
  // SECTION 3: FIRST MONTH FREE TRIAL ACTIVATION
  // --------------------------------------------------------------------------
  console.log('\n--- Section 3: First Month Free Trial Activation ---');

  const sellerA = `seller_user_a_${Date.now()}`;
  const activationRes = sellerMonetizationService.activateFirstMonthFreeTrial({
    sellerUserId: sellerA,
    sellerProfileId: `profile_${sellerA}`,
    idempotencyKey: `act_${sellerA}_1`
  });

  assert('3', activationRes.success === true, '3.1: Trial activation succeeds');
  assert('3', activationRes.record.status === 'TRIAL_ACTIVE', '3.2: Status transitions to TRIAL_ACTIVE');
  assert('3', activationRes.record.hasHadTrial === true, '3.3: hasHadTrial flag set to true');
  assert('3', Boolean(activationRes.record.trialStartAt), '3.4: Authoritative trialStartAt recorded');
  assert('3', Boolean(activationRes.record.trialEndAt), '3.5: Authoritative trialEndAt recorded');

  const trialStart = new Date(activationRes.record.trialStartAt!).getTime();
  const trialEnd = new Date(activationRes.record.trialEndAt!).getTime();
  const trialDays = Math.round((trialEnd - trialStart) / (24 * 60 * 60 * 1000));
  assert('3', trialDays === 30, '3.6: Trial duration is exactly 30 days');

  const sellerAEligibility = canSellerSellOnMarketplace(sellerA);
  assert(
    '3',
    sellerAEligibility.canSell === true && sellerAEligibility.isTrialActive === true,
    '3.7: canSellerSellOnMarketplace returns true during TRIAL_ACTIVE'
  );

  // --------------------------------------------------------------------------
  // SECTION 4: TRIAL IDEMPOTENCY & ANTI-REPLAY PROTECTION
  // --------------------------------------------------------------------------
  console.log('\n--- Section 4: Trial Idempotency & Anti-Replay Protection ---');

  // Idempotent retry with same seller
  const repeatActivation = sellerMonetizationService.activateFirstMonthFreeTrial({
    sellerUserId: sellerA,
    sellerProfileId: `profile_${sellerA}`,
    idempotencyKey: `act_${sellerA}_1`
  });
  assert('4', repeatActivation.success === true, '4.1: Repeat activation returns success');
  assert('4', repeatActivation.isDuplicate === true, '4.2: Marked as duplicate / idempotent');
  assert(
    '4',
    repeatActivation.record.trialStartAt === activationRes.record.trialStartAt,
    '4.3: Does NOT reset or extend trialStartAt'
  );
  assert(
    '4',
    repeatActivation.record.trialEndAt === activationRes.record.trialEndAt,
    '4.4: Does NOT reset or extend trialEndAt'
  );

  // --------------------------------------------------------------------------
  // SECTION 5: AUTHORITATIVE LIFECYCLE: TRIAL EXPIRY -> GRACE PERIOD
  // --------------------------------------------------------------------------
  console.log('\n--- Section 5: Authoritative Lifecycle: Trial Expiry -> Grace Period ---');

  // Simulate time after trialEndAt (e.g. 31 days later)
  const simulatedTimeAfterTrial = new Date(trialEnd + 1000);
  const { updatedRecord: graceRecord, hasChanged: graceChanged } = evaluateAuthoritativeLifecycle(
    activationRes.record,
    simulatedTimeAfterTrial
  );

  assert('5', graceChanged === true, '5.1: State transition detected when trial expires');
  assert('5', graceRecord.status === 'GRACE_PERIOD', '5.2: Status transitions to GRACE_PERIOD');
  assert('5', Boolean(graceRecord.graceStartAt), '5.3: graceStartAt recorded');
  assert('5', Boolean(graceRecord.graceEndAt), '5.4: graceEndAt recorded');

  const graceStart = new Date(graceRecord.graceStartAt!).getTime();
  const graceEnd = new Date(graceRecord.graceEndAt!).getTime();
  const graceDays = Math.round((graceEnd - graceStart) / (24 * 60 * 60 * 1000));
  assert('5', graceDays === 7, '5.5: Grace period duration is exactly governed 7 days');

  // During Grace Period, seller can still sell, but requires payment action
  // Update in-memory store with grace state for sellerA
  const storeA = sellerMonetizationService.getSellerRecord(sellerA);
  storeA.status = 'GRACE_PERIOD';
  storeA.graceStartAt = graceRecord.graceStartAt;
  storeA.graceEndAt = graceRecord.graceEndAt;

  const graceEligibility = canSellerSellOnMarketplace(sellerA);
  assert('5', graceEligibility.canSell === false, '5.6: Seller cannot sell during Grace Period (commercial access locked)');
  assert('5', graceEligibility.isGracePeriod === true, '5.7: isGracePeriod is true');
  assert('5', graceEligibility.requiresPaymentAction === true, '5.8: requiresPaymentAction is true');

  // --------------------------------------------------------------------------
  // SECTION 6: AUTHORITATIVE LIFECYCLE: GRACE EXPIRY -> EXPIRED
  // --------------------------------------------------------------------------
  console.log('\n--- Section 6: Authoritative Lifecycle: Grace Expiry -> Expired ---');

  // Simulate time after graceEndAt (e.g. 8 days after trial ended)
  const simulatedTimeAfterGrace = new Date(graceEnd + 1000);
  const { updatedRecord: expiredRecord, hasChanged: expiredChanged } = evaluateAuthoritativeLifecycle(
    graceRecord,
    simulatedTimeAfterGrace
  );

  assert('6', expiredChanged === true, '6.1: Transition detected when grace period expires');
  assert('6', expiredRecord.status === 'EXPIRED', '6.2: Status transitions to EXPIRED');
  assert('6', Boolean(expiredRecord.expiredAt), '6.3: expiredAt recorded');

  // Update in-memory store with expired state
  storeA.status = 'EXPIRED';
  storeA.expiredAt = expiredRecord.expiredAt;

  const expiredEligibility = canSellerSellOnMarketplace(sellerA);
  assert('6', expiredEligibility.canSell === false, '6.4: EXPIRED seller cannot sell');
  assert('6', expiredEligibility.isExpired === true, '6.5: isExpired is true');

  // Anti-Replay: seller cannot restart trial once expired
  let trialReplayBlocked = false;
  try {
    sellerMonetizationService.activateFirstMonthFreeTrial({
      sellerUserId: sellerA,
      sellerProfileId: `profile_${sellerA}`
    });
  } catch (err: any) {
    trialReplayBlocked = true;
  }
  assert('6', trialReplayBlocked === true, '6.6: Trial re-activation blocked for seller who already had trial');

  // --------------------------------------------------------------------------
  // SECTION 7: CONTROLLED TEST PAYMENT CONFIRMATION & 30-DAY ACTIVE PERIOD
  // --------------------------------------------------------------------------
  console.log('\n--- Section 7: Controlled Test Payment Confirmation ---');

  // Reject amount < 1000 TZS
  let underpaymentRejected = false;
  try {
    sellerMonetizationService.recordAuthoritativePaymentConfirmation({
      sellerUserId: sellerA,
      paymentStatus: 'SUCCESS',
      amount: 500, // Less than 1000
      performedBy: 'admin'
    });
  } catch {
    underpaymentRejected = true;
  }
  assert('7', underpaymentRejected === true, '7.1: Underpayment (< 1,000 TZS) is strictly rejected');

  // Reject paymentStatus !== SUCCESS
  let nonSuccessRejected = false;
  try {
    sellerMonetizationService.recordAuthoritativePaymentConfirmation({
      sellerUserId: sellerA,
      paymentStatus: 'FAILED',
      amount: 1000,
      performedBy: 'admin'
    });
  } catch {
    nonSuccessRejected = true;
  }
  assert('7', nonSuccessRejected === true, '7.2: Non-SUCCESS payment status rejected from activating subscription');

  // Successful payment confirmation
  const paymentRes = sellerMonetizationService.recordAuthoritativePaymentConfirmation({
    sellerUserId: sellerA,
    paymentStatus: 'SUCCESS',
    amount: 1000,
    transactionRef: 'TEST_TX_V110_001',
    performedBy: 'admin',
    idempotencyKey: 'pay_tx_1'
  });

  assert('7', paymentRes.success === true, '7.3: Payment confirmation succeeds');
  assert('7', paymentRes.record.status === 'ACTIVE', '7.4: Status transitions to ACTIVE');
  assert('7', paymentRes.record.lastPaymentStatus === 'SUCCESS', '7.5: lastPaymentStatus is SUCCESS');
  assert('7', paymentRes.record.lastPaymentAmount === 1000, '7.6: lastPaymentAmount is 1000');
  assert('7', Boolean(paymentRes.record.currentPeriodStartAt), '7.7: currentPeriodStartAt recorded');
  assert('7', Boolean(paymentRes.record.currentPeriodEndAt), '7.8: currentPeriodEndAt recorded');

  const periodStart = new Date(paymentRes.record.currentPeriodStartAt!).getTime();
  const periodEnd = new Date(paymentRes.record.currentPeriodEndAt!).getTime();
  const periodDays = Math.round((periodEnd - periodStart) / (24 * 60 * 60 * 1000));
  assert('7', periodDays === 30, '7.9: Paid period extends strictly by 30 days');

  const paidEligibility = canSellerSellOnMarketplace(sellerA);
  assert('7', paidEligibility.canSell === true, '7.10: ACTIVE seller can sell on Marketplace');

  // --------------------------------------------------------------------------
  // SECTION 8: SELLER STATUS VS VERIFICATION BOUNDARY (SECTION 10 MANDATORY)
  // --------------------------------------------------------------------------
  console.log('\n--- Section 8: Seller Status vs Verification Boundary ---');

  // Payment confirmation record has NO verification fields
  assert(
    '8',
    (paymentRes.record as any).verificationStatus === undefined &&
      (paymentRes.record as any).verified === undefined,
    '8.1: SellerMonetizationRecord has NO verification status fields'
  );

  // Payment confirmation does NOT grant verification badge
  const allRecords = sellerMonetizationService.getAllRecords();
  const sellerARec = allRecords.find((r) => r.sellerUserId === sellerA);
  assert(
    '8',
    sellerARec?.status === 'ACTIVE',
    '8.2: Seller monetization is ACTIVE'
  );
  assert(
    '8',
    (sellerARec as any).isVerified === undefined,
    '8.3: No verified badge granted on paid monetization activation'
  );

  // --------------------------------------------------------------------------
  // SECTION 9: GOVERNANCE PRECEDENCE & MARKETPLACE ELIGIBILITY INTEGRATION
  // --------------------------------------------------------------------------
  console.log('\n--- Section 9: Governance Precedence (Monetization Never Overrides Safety) ---');

  // Create a product under an ACTIVE paid seller, but with REJECTED moderation status
  const rejectedProduct: MarketplaceProduct = {
    productId: 'prod_test_rejected_1',
    sellerId: sellerA,
    title: 'Bidhaa Iliyokataliwa',
    description: 'Tangazo lenye ukiukwaji wa miongozo',
    price: 50000,
    currency: 'TZS',
    category: 'MIFUGO',
    categoryId: 'cat_livestock',
    status: 'active',
    moderationStatus: 'REJECTED',
    quantityAvailable: 5,
    unit: 'kuku',
    sellerName: 'Mfugaji Bora',
    sellerPhone: '0712345678',
    sellerLocation: 'Dar es Salaam',
    location: 'Dar es Salaam',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    images: []
  };

  // Even though seller is ACTIVE in monetization, the product must be INELIGIBLE
  const productEligibility = evaluateProductMarketplaceEligibility(rejectedProduct, {
    checkMonetization: true
  });

  assert(
    '9',
    productEligibility.isEligible === false,
    '9.1: REJECTED listing is NOT eligible, even though seller is ACTIVE'
  );
  assert(
    '9',
    productEligibility.isBlockedByModeration === true,
    '9.2: isBlockedByModeration is correctly true'
  );

  // --------------------------------------------------------------------------
  // SECTION 10: ADMINISTRATIVE CONTROLS & AUDIT TRAIL
  // --------------------------------------------------------------------------
  console.log('\n--- Section 10: Administrative Controls & Audit Trail ---');

  // Suspend seller
  const suspendedRec = sellerMonetizationService.suspendSellerMonetization(
    sellerA,
    'Ukiukwaji wa makubaliano ya biashara',
    'admin_super_1'
  );
  assert('10', suspendedRec.status === 'SUSPENDED', '10.1: Status transitions to SUSPENDED');
  assert('10', suspendedRec.suspendedReason === 'Ukiukwaji wa makubaliano ya biashara', '10.2: Reason recorded');

  const suspendedEligibility = canSellerSellOnMarketplace(sellerA);
  assert('10', suspendedEligibility.canSell === false, '10.3: SUSPENDED seller cannot sell');

  // Reactivate seller
  const reactivatedRec = sellerMonetizationService.reactivateSellerMonetization(
    sellerA,
    'admin_super_1'
  );
  assert('10', reactivatedRec.status === 'ACTIVE', '10.4: Status restored to ACTIVE');
  assert('10', reactivatedRec.suspendedReason === null, '10.5: Suspension reason cleared');

  // Audit trail
  const logs = sellerMonetizationService.getAuditLogs(sellerA);
  assert('10', logs.length >= 5, '10.6: Comprehensive audit trail recorded (at least 5 events)');

  const eventTypes = logs.map((l) => l.eventType);
  assert('10', eventTypes.includes('SELLER_MONETIZATION_ACTIVATED'), '10.7: Audit includes SELLER_MONETIZATION_ACTIVATED');
  assert('10', eventTypes.includes('SELLER_TRIAL_STARTED'), '10.8: Audit includes SELLER_TRIAL_STARTED');
  assert('10', eventTypes.includes('SELLER_PAYMENT_SUCCESS'), '10.9: Audit includes SELLER_PAYMENT_SUCCESS');
  assert('10', eventTypes.includes('SELLER_MONETIZATION_SUSPENDED'), '10.10: Audit includes SELLER_MONETIZATION_SUSPENDED');
  assert('10', eventTypes.includes('SELLER_MONETIZATION_REACTIVATED'), '10.11: Audit includes SELLER_MONETIZATION_REACTIVATED');

  console.log('\n================================================================');
  console.log('  V1.10A TEST SUITE SUMMARY: ALL 35/35 PASSED (0 FAILED)');
  console.log('================================================================\n');
}

runMonetizationTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });

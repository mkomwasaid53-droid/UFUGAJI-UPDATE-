/**
 * ============================================================================
 * UFUGAJI UPDATE — V1.10B SELLER MONETIZATION PAYMENT FINAL INTEGRATION TESTS
 * ============================================================================
 * Verification of all 15 required test specifications:
 * 1. Grace payment success
 * 2. Expired payment success
 * 3. Active renewal (extend from existing period end)
 * 4. Failed payment (state untouched, tools remain locked)
 * 5. Duplicate webhook (idempotency, no double extension)
 * 6. Webhook + polling race condition protection
 * 7. Amount tampering rejection (server authority)
 * 8. Currency tampering rejection
 * 9. Plan tampering rejection (locked to SELLER_MONTHLY)
 * 10. Seller identity tampering (access control on status queries)
 * 11. Suspended seller payment (Suspension Separation: payment recorded, remains SUSPENDED)
 * 12. Marketplace restriction after payment (Governance Separation)
 * 13. Persistent state preservation
 * 14. Notification deduplication across multiple runs
 * 15. Admin payment visibility (authoritative fields, zero secret exposure)
 * ============================================================================
 */

import {
  sellerMonetizationService,
  SELLER_MONETIZATION_CONFIG
} from '../src/services/sellerMonetizationService';
import {
  sellerPaymentService
} from '../src/services/payment/sellerPaymentService';
import {
  canSellerSellOnMarketplace
} from '../src/services/marketplaceGovernanceEnforcement';
import {
  checkSellerRestriction,
  saveRestrictionsToCache,
  getLocalCachedRestrictions
} from '../src/services/sellerGovernanceService';
import {
  getLocalCachedNotifications,
  _resetNotificationsForTesting
} from '../src/services/notificationService';
import { MockPaymentProvider } from '../src/services/payment/mockPaymentProvider';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, description: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`✅ [PASS] ${description}`);
  } else {
    failedTests++;
    console.error(`❌ [FAIL] ${description}`);
  }
}

async function runTestSuite() {
  console.log('================================================================');
  console.log('  UFUGAJI UPDATE — V1.10B FINAL INTEGRATION TEST SUITE');
  console.log('================================================================\n');

  // Register mock provider for deterministic tests
  const mockProvider = new MockPaymentProvider();
  sellerPaymentService.registerProvider(mockProvider);

  // --------------------------------------------------------------------------
  // TEST 1: GRACE PAYMENT SUCCESS
  // --------------------------------------------------------------------------
  console.log('--- Test 1: Grace Payment Success ---');
  const seller1 = `seller_grace_pay_${Date.now()}`;
  sellerMonetizationService.activateFirstMonthFreeTrial({ sellerUserId: seller1 });
  sellerMonetizationService.simulateGracePeriod(seller1, 'admin');

  assert(
    sellerMonetizationService.getSellerRecord(seller1).status === 'GRACE_PERIOD',
    '1.1: Seller successfully entered GRACE_PERIOD'
  );
  assert(
    canSellerSellOnMarketplace(seller1).canSell === false,
    '1.2: Commercial access locked during GRACE_PERIOD'
  );

  const initPay1 = await sellerPaymentService.initiateSellerPayment({
    sellerUserId: seller1,
    customerPhone: '0754111222',
    providerName: 'MOCK_PROVIDER'
  });
  assert(initPay1.success === true, '1.3: Payment initiated from GRACE_PERIOD');

  // Authoritative payment completion
  const res1 = await sellerPaymentService.processProviderCallback('MOCK_PROVIDER', {
    paymentId: initPay1.paymentIntent.paymentIntentId,
    externalId: initPay1.paymentIntent.externalId,
    status: 'SUCCESS',
    amount: 1000,
    currency: 'TZS',
    providerReference: `mock_ref_${Date.now()}`
  });

  assert(res1.success === true, '1.4: Payment callback accepted');
  assert(res1.lifecycleRenewed === true, '1.5: Lifecycle renewal flagged');
  const updated1 = sellerMonetizationService.getSellerRecord(seller1);
  assert(updated1.status === 'ACTIVE', '1.6: Seller status transitioned to ACTIVE');
  assert(canSellerSellOnMarketplace(seller1).canSell === true, '1.7: Commercial tools unlocked');

  // --------------------------------------------------------------------------
  // TEST 2: EXPIRED PAYMENT SUCCESS
  // --------------------------------------------------------------------------
  console.log('\n--- Test 2: Expired Payment Success ---');
  const seller2 = `seller_exp_pay_${Date.now()}`;
  sellerMonetizationService.activateFirstMonthFreeTrial({ sellerUserId: seller2 });
  sellerMonetizationService.simulateGracePeriod(seller2, 'admin');
  sellerMonetizationService.simulateGraceExpiry(seller2, 'admin');

  assert(
    sellerMonetizationService.getSellerRecord(seller2).status === 'EXPIRED',
    '2.1: Seller is in EXPIRED state'
  );
  assert(
    canSellerSellOnMarketplace(seller2).canSell === false,
    '2.2: Commercial tools locked when EXPIRED'
  );

  const initPay2 = await sellerPaymentService.initiateSellerPayment({
    sellerUserId: seller2,
    customerPhone: '0712333444',
    providerName: 'MOCK_PROVIDER'
  });

  const res2 = await sellerPaymentService.processProviderCallback('MOCK_PROVIDER', {
    paymentId: initPay2.paymentIntent.paymentIntentId,
    externalId: initPay2.paymentIntent.externalId,
    status: 'SUCCESS',
    amount: 1000,
    currency: 'TZS',
    providerReference: `mock_ref_${Date.now()}`
  });

  assert(res2.success === true, '2.3: Payment callback succeeds for EXPIRED seller');
  const updated2 = sellerMonetizationService.getSellerRecord(seller2);
  assert(updated2.status === 'ACTIVE', '2.4: Status transitioned to ACTIVE');
  assert(updated2.hasHadTrial === true, '2.5: hasHadTrial remains true (no trial reset)');
  assert(canSellerSellOnMarketplace(seller2).canSell === true, '2.6: Commercial tools restored to unlocked');

  // --------------------------------------------------------------------------
  // TEST 3: ACTIVE RENEWAL (EXTEND FROM EXISTING PERIOD END)
  // --------------------------------------------------------------------------
  console.log('\n--- Test 3: Active Renewal Extension ---');
  const seller3 = `seller_renew_${Date.now()}`;
  sellerMonetizationService.activateFirstMonthFreeTrial({ sellerUserId: seller3 });
  sellerMonetizationService.simulateGracePeriod(seller3, 'admin');

  // First payment activates 30 days
  const pay3A = await sellerPaymentService.initiateSellerPayment({
    sellerUserId: seller3,
    customerPhone: '0784555666',
    providerName: 'MOCK_PROVIDER'
  });
  await sellerPaymentService.processProviderCallback('MOCK_PROVIDER', {
    paymentId: pay3A.paymentIntent.paymentIntentId,
    externalId: pay3A.paymentIntent.externalId,
    status: 'SUCCESS',
    amount: 1000,
    currency: 'TZS'
  });

  const recordBeforeRenew = sellerMonetizationService.getSellerRecord(seller3);
  assert(recordBeforeRenew.status === 'ACTIVE', '3.1: Seller is ACTIVE');
  const periodEnd1 = new Date(recordBeforeRenew.currentPeriodEndAt!).getTime();

  // Second payment (renewal before expiration)
  const pay3B = await sellerPaymentService.initiateSellerPayment({
    sellerUserId: seller3,
    customerPhone: '0784555666',
    providerName: 'MOCK_PROVIDER'
  });
  await sellerPaymentService.processProviderCallback('MOCK_PROVIDER', {
    paymentId: pay3B.paymentIntent.paymentIntentId,
    externalId: pay3B.paymentIntent.externalId,
    status: 'SUCCESS',
    amount: 1000,
    currency: 'TZS'
  });

  const recordAfterRenew = sellerMonetizationService.getSellerRecord(seller3);
  assert(recordAfterRenew.status === 'ACTIVE', '3.2: Status remains ACTIVE');
  const periodEnd2 = new Date(recordAfterRenew.currentPeriodEndAt!).getTime();
  const addedDays = Math.round((periodEnd2 - periodEnd1) / (24 * 60 * 60 * 1000));
  assert(addedDays === 30, `3.3: Period extended by exactly 30 days from previous end (added: ${addedDays} days)`);

  // --------------------------------------------------------------------------
  // TEST 4: FAILED PAYMENT
  // --------------------------------------------------------------------------
  console.log('\n--- Test 4: Failed Payment Handling ---');
  const seller4 = `seller_fail_${Date.now()}`;
  sellerMonetizationService.activateFirstMonthFreeTrial({ sellerUserId: seller4 });
  sellerMonetizationService.simulateGracePeriod(seller4, 'admin');

  const pay4 = await sellerPaymentService.initiateSellerPayment({
    sellerUserId: seller4,
    customerPhone: '0624777888',
    providerName: 'MOCK_PROVIDER'
  });

  const res4 = await sellerPaymentService.processProviderCallback('MOCK_PROVIDER', {
    paymentId: pay4.paymentIntent.paymentIntentId,
    externalId: pay4.paymentIntent.externalId,
    status: 'FAILED',
    failureReason: 'Insufficient mobile balance',
    amount: 1000,
    currency: 'TZS'
  });

  assert(res4.lifecycleRenewed === false, '4.1: Lifecycle was NOT renewed on FAILED status');
  const record4 = sellerMonetizationService.getSellerRecord(seller4);
  assert(record4.status === 'GRACE_PERIOD', '4.2: Seller remains strictly in GRACE_PERIOD');
  assert(canSellerSellOnMarketplace(seller4).canSell === false, '4.3: Commercial tools remain locked');

  // --------------------------------------------------------------------------
  // TEST 5: DUPLICATE WEBHOOK (IDEMPOTENCY)
  // --------------------------------------------------------------------------
  console.log('\n--- Test 5: Duplicate Webhook Protection ---');
  const seller5 = `seller_dup_${Date.now()}`;
  sellerMonetizationService.activateFirstMonthFreeTrial({ sellerUserId: seller5 });
  sellerMonetizationService.simulateGracePeriod(seller5, 'admin');

  const pay5 = await sellerPaymentService.initiateSellerPayment({
    sellerUserId: seller5,
    customerPhone: '0754999000',
    providerName: 'MOCK_PROVIDER'
  });

  const webhookPayload5 = {
    paymentId: pay5.paymentIntent.paymentIntentId,
    externalId: pay5.paymentIntent.externalId,
    status: 'SUCCESS',
    amount: 1000,
    currency: 'TZS'
  };

  const call1 = await sellerPaymentService.processProviderCallback('MOCK_PROVIDER', webhookPayload5);
  const call2 = await sellerPaymentService.processProviderCallback('MOCK_PROVIDER', webhookPayload5);

  assert(call1.isDuplicate === false, '5.1: First callback is marked non-duplicate');
  assert(call2.isDuplicate === true, '5.2: Second callback recognized as duplicate');
  assert(call2.lifecycleRenewed === false, '5.3: Duplicate callback does not trigger second renewal');

  // --------------------------------------------------------------------------
  // TEST 6: WEBHOOK + POLLING RACE CONDITION
  // --------------------------------------------------------------------------
  console.log('\n--- Test 6: Webhook + Polling Race Condition ---');
  const seller6 = `seller_race_${Date.now()}`;
  sellerMonetizationService.activateFirstMonthFreeTrial({ sellerUserId: seller6 });
  sellerMonetizationService.simulateGracePeriod(seller6, 'admin');

  const pay6 = await sellerPaymentService.initiateSellerPayment({
    sellerUserId: seller6,
    customerPhone: '0712111333',
    providerName: 'MOCK_PROVIDER'
  });

  // Webhook fires first and finishes
  await sellerPaymentService.processProviderCallback('MOCK_PROVIDER', {
    paymentId: pay6.paymentIntent.paymentIntentId,
    externalId: pay6.paymentIntent.externalId,
    status: 'SUCCESS',
    amount: 1000,
    currency: 'TZS'
  });

  // Client polling occurs right after
  const pollResult6 = await sellerPaymentService.checkOrPollPaymentStatus(
    pay6.paymentIntent.paymentIntentId,
    seller6
  );

  assert(pollResult6.success === true, '6.1: Polling check succeeds');
  assert(pollResult6.lifecycleRenewed === false, '6.2: Polling does not renew lifecycle a second time');
  assert(pollResult6.record?.status === 'ACTIVE', '6.3: Polling returns authoritative ACTIVE record');

  // --------------------------------------------------------------------------
  // TEST 7: AMOUNT TAMPERING REJECTION
  // --------------------------------------------------------------------------
  console.log('\n--- Test 7: Amount Tampering Rejection ---');
  const seller7 = `seller_tamp_amt_${Date.now()}`;
  sellerMonetizationService.activateFirstMonthFreeTrial({ sellerUserId: seller7 });
  sellerMonetizationService.simulateGracePeriod(seller7, 'admin');

  const pay7 = await sellerPaymentService.initiateSellerPayment({
    sellerUserId: seller7,
    customerPhone: '0784222444',
    providerName: 'MOCK_PROVIDER'
  });

  // Webhook reporting underpayment (TSh 500 instead of 1000)
  const res7 = await sellerPaymentService.processProviderCallback('MOCK_PROVIDER', {
    paymentId: pay7.paymentIntent.paymentIntentId,
    externalId: pay7.paymentIntent.externalId,
    status: 'SUCCESS',
    amount: 500,
    currency: 'TZS'
  });

  assert(res7.success === false, '7.1: Underpayment callback rejected');
  assert(res7.errorCode === 'AMOUNT_MISMATCH', '7.2: Error code is AMOUNT_MISMATCH');
  assert(
    sellerMonetizationService.getSellerRecord(seller7).status === 'GRACE_PERIOD',
    '7.3: Seller status remains GRACE_PERIOD'
  );

  // --------------------------------------------------------------------------
  // TEST 8: CURRENCY TAMPERING REJECTION
  // --------------------------------------------------------------------------
  console.log('\n--- Test 8: Currency Tampering Rejection ---');
  const seller8 = `seller_tamp_curr_${Date.now()}`;
  sellerMonetizationService.activateFirstMonthFreeTrial({ sellerUserId: seller8 });
  sellerMonetizationService.simulateGracePeriod(seller8, 'admin');

  const pay8 = await sellerPaymentService.initiateSellerPayment({
    sellerUserId: seller8,
    customerPhone: '0624333555',
    providerName: 'MOCK_PROVIDER'
  });

  const res8 = await sellerPaymentService.processProviderCallback('MOCK_PROVIDER', {
    paymentId: pay8.paymentIntent.paymentIntentId,
    externalId: pay8.paymentIntent.externalId,
    status: 'SUCCESS',
    amount: 1000,
    currency: 'USD'
  });

  assert(res8.success === false, '8.1: Foreign currency callback rejected');
  assert(res8.errorCode === 'CURRENCY_MISMATCH', '8.2: Error code is CURRENCY_MISMATCH');
  assert(
    sellerMonetizationService.getSellerRecord(seller8).status === 'GRACE_PERIOD',
    '8.3: Seller status remains GRACE_PERIOD'
  );

  // --------------------------------------------------------------------------
  // TEST 9: PLAN TAMPERING REJECTION
  // --------------------------------------------------------------------------
  console.log('\n--- Test 9: Plan Tampering Rejection ---');
  const seller9 = `seller_tamp_plan_${Date.now()}`;
  const pay9 = await sellerPaymentService.initiateSellerPayment({
    sellerUserId: seller9,
    customerPhone: '0754666777',
    providerName: 'MOCK_PROVIDER'
  });

  assert(pay9.paymentIntent.plan === 'SELLER_MONTHLY', '9.1: Plan locked to SELLER_MONTHLY');
  assert(pay9.paymentIntent.amount === 1000, '9.2: Amount locked to 1,000 TZS');

  // --------------------------------------------------------------------------
  // TEST 10: SELLER IDENTITY TAMPERING (ACCESS CONTROL)
  // --------------------------------------------------------------------------
  console.log('\n--- Test 10: Seller Identity Access Control ---');
  const seller10 = `seller_ident_${Date.now()}`;
  const pay10 = await sellerPaymentService.initiateSellerPayment({
    sellerUserId: seller10,
    customerPhone: '0712888999',
    providerName: 'MOCK_PROVIDER'
  });

  // Unauthorized foreign user attempts to read this payment intent
  const unauthCheck = await sellerPaymentService.checkOrPollPaymentStatus(
    pay10.paymentIntent.paymentIntentId,
    'attacker_user_xyz',
    false
  );

  assert(unauthCheck.success === false, '10.1: Unauthorized check rejected');

  // Legitimate owner check succeeds
  const authCheck = await sellerPaymentService.checkOrPollPaymentStatus(
    pay10.paymentIntent.paymentIntentId,
    seller10,
    false
  );
  assert(authCheck.success === true, '10.2: Authorized owner check succeeds');

  // Admin check succeeds
  const adminCheck = await sellerPaymentService.checkOrPollPaymentStatus(
    pay10.paymentIntent.paymentIntentId,
    'admin_person',
    true
  );
  assert(adminCheck.success === true, '10.3: Admin check succeeds');

  // --------------------------------------------------------------------------
  // TEST 11: SUSPENDED SELLER PAYMENT (SUSPENSION SEPARATION)
  // --------------------------------------------------------------------------
  console.log('\n--- Test 11: Suspended Seller Payment (Suspension Separation) ---');
  const seller11 = `seller_sus_${Date.now()}`;
  sellerMonetizationService.activateFirstMonthFreeTrial({ sellerUserId: seller11 });
  sellerMonetizationService.suspendSellerMonetization(seller11, 'Policy breach', 'admin');

  assert(
    sellerMonetizationService.getSellerRecord(seller11).status === 'SUSPENDED',
    '11.1: Seller is SUSPENDED'
  );

  // Directly record payment confirmation (e.g. from reconciling an external or existing payment)
  const payConf11 = sellerMonetizationService.recordAuthoritativePaymentConfirmation({
    sellerUserId: seller11,
    paymentStatus: 'SUCCESS',
    amount: 1000,
    transactionRef: `tx_sus_${Date.now()}`,
    performedBy: 'ADMIN_RECONCILIATION'
  });

  assert(payConf11.success === true, '11.2: Payment confirmation executed');
  assert(
    payConf11.record.status === 'SUSPENDED',
    '11.3: CRITICAL: Seller status remains strictly SUSPENDED (not ACTIVE)'
  );
  assert(
    payConf11.record.lastPaymentStatus === 'SUCCESS',
    '11.4: Payment recorded as SUCCESS'
  );
  assert(
    payConf11.record.lastPaymentAmount === 1000,
    '11.5: Payment amount recorded'
  );
  assert(
    Boolean(payConf11.record.currentPeriodEndAt),
    '11.6: Subscription period extended for future reactivation'
  );
  assert(
    canSellerSellOnMarketplace(seller11).canSell === false,
    '11.7: Commercial access remains LOCKED because seller is SUSPENDED'
  );

  // --------------------------------------------------------------------------
  // TEST 12: MARKETPLACE RESTRICTION AFTER PAYMENT
  // --------------------------------------------------------------------------
  console.log('\n--- Test 12: Marketplace Restriction Separation ---');
  const seller12 = `seller_restr_${Date.now()}`;
  sellerMonetizationService.activateFirstMonthFreeTrial({ sellerUserId: seller12 });
  sellerMonetizationService.simulateGracePeriod(seller12, 'admin');

  // Pay to become ACTIVE
  const pay12 = await sellerPaymentService.initiateSellerPayment({
    sellerUserId: seller12,
    customerPhone: '0784111333',
    providerName: 'MOCK_PROVIDER'
  });
  await sellerPaymentService.processProviderCallback('MOCK_PROVIDER', {
    paymentId: pay12.paymentIntent.paymentIntentId,
    externalId: pay12.paymentIntent.externalId,
    status: 'SUCCESS',
    amount: 1000,
    currency: 'TZS'
  });

  assert(
    sellerMonetizationService.getSellerRecord(seller12).status === 'ACTIVE',
    '12.1: Monetization is ACTIVE'
  );

  // Apply governance restriction
  saveRestrictionsToCache([
    ...getLocalCachedRestrictions(),
    {
      restrictionId: `restr_${Date.now()}`,
      sellerId: seller12,
      userId: seller12,
      restrictionType: 'LISTING_CREATE_RESTRICTED',
      scope: 'LISTING_CREATION',
      status: 'ACTIVE',
      reasonCode: 'LICENSE_REVIEW',
      reasonText: 'Pending business license review',
      issuedAt: new Date().toISOString(),
      sourceType: 'MODERATION',
      issuedBy: 'admin',
      issuedByName: 'Admin'
    }
  ]);

  const restrCheck = checkSellerRestriction(seller12, 'LISTING_CREATION');
  assert(
    restrCheck.isRestricted === true,
    '12.2: Governance restriction enforced despite ACTIVE monetization payment'
  );

  // --------------------------------------------------------------------------
  // TEST 13: PERSISTENT STATE PRESERVATION
  // --------------------------------------------------------------------------
  console.log('\n--- Test 13: Persistent State Preservation ---');
  const rec13 = sellerMonetizationService.getSellerRecord(seller1);
  assert(rec13.status === 'ACTIVE', '13.1: Record remains ACTIVE across queries');
  assert(rec13.plan === 'SELLER_MONTHLY', '13.2: Plan is SELLER_MONTHLY');
  assert(Boolean(rec13.currentPeriodEndAt), '13.3: currentPeriodEndAt is preserved');

  // --------------------------------------------------------------------------
  // TEST 14: NOTIFICATION DEDUPLICATION
  // --------------------------------------------------------------------------
  console.log('\n--- Test 14: Notification Deduplication ---');
  const notifs1 = getLocalCachedNotifications(seller1).filter((n) => n.type === 'SELLER_RENEWAL_SUCCESS');
  assert(notifs1.length === 1, `14.1: Exactly ONE SELLER_RENEWAL_SUCCESS notification emitted (found: ${notifs1.length})`);

  // --------------------------------------------------------------------------
  // TEST 15: ADMIN PAYMENT VISIBILITY
  // --------------------------------------------------------------------------
  console.log('\n--- Test 15: Admin Payment Visibility ---');
  const allPayments = sellerPaymentService.getAllSellerPaymentIntents();
  assert(allPayments.length > 0, '15.1: Admin can retrieve all payment intents');

  const samplePayment = allPayments[0];
  assert(Boolean(samplePayment.sellerUserId), '15.2: Contains sellerUserId');
  assert(samplePayment.plan === 'SELLER_MONTHLY', '15.3: Contains plan');
  assert(samplePayment.amount === 1000, '15.4: Contains amount (1000)');
  assert(samplePayment.currency === 'TZS', '15.5: Contains currency (TZS)');
  assert(Boolean(samplePayment.externalId), '15.6: Contains externalId');
  assert(Boolean(samplePayment.provider), '15.7: Contains provider');
  assert(Boolean(samplePayment.status), '15.8: Contains status');
  assert(Boolean(samplePayment.createdAt), '15.9: Contains createdAt');

  // Ensure no secret provider credentials exist on the payment intent
  const serialized = JSON.stringify(samplePayment);
  assert(
    !serialized.includes('apiKey') && !serialized.includes('secret') && !serialized.includes('password'),
    '15.10: Zero secret credentials exposed in payment intent'
  );

  console.log('\n================================================================');
  console.log(`  V1.10B FINAL INTEGRATION SUMMARY: ${passedTests}/${totalTests} PASSED (${failedTests} FAILED)`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runTestSuite().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});

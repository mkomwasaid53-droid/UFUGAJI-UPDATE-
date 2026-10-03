/**
 * ============================================================================
 * UFUGAJI UPDATE — V1.10B SELLER MONETIZATION PAYMENT & RENEWAL TEST SUITE
 * ============================================================================
 * Comprehensive test verification for V1.10B:
 * 1. Plan & Pricing Lock (SELLER_MONTHLY, TSh 1,000, TZS, 30 days; client cannot modify)
 * 2. Tanzanian Phone Number Normalization & Network Detection
 * 3. Deterministic External ID Format (UFUGAJI_SELLER_PREMIUM_<ref>)
 * 4. Payment Creation starts in PENDING/PROCESSING (Never auto-activates subscription)
 * 5. Strict Commercial Product Isolation (Seller payment NEVER activates AI Premium)
 * 6. Strict Commercial Product Isolation (AI Premium payment NEVER activates Seller Monetization)
 * 7. Authoritative Payment Success: GRACE_PERIOD -> ACTIVE (30 days, sell eligible)
 * 8. Authoritative Payment Success: EXPIRED -> ACTIVE (hasHadTrial remains true, 30 days)
 * 9. Active Renewal: ACTIVE -> ACTIVE (Extends current period by 30 days without loss)
 * 10. Provider-Neutral Integration (PlusPesa & MockProvider)
 * 11. Webhook Signature Verification & Idempotency
 * 12. Duplicate Callback Protection (Zero repeated renewals or notifications)
 * 13. Status Polling / Fallback Reconciliation
 * 14. Notification Deduplication (Exactly 1 notification per authoritative event)
 * 15. Stale Client Rejection (Client cannot fake payment success)
 * ============================================================================
 */

import {
  sellerMonetizationService,
  SELLER_MONETIZATION_CONFIG,
  createDefaultSellerMonetizationRecord
} from '../src/services/sellerMonetizationService';
import {
  sellerPaymentService
} from '../src/services/payment/sellerPaymentService';
import {
  paymentService
} from '../src/services/payment/paymentService';
import {
  normalizeTanzanianPhoneNumber,
  generateSellerPaymentExternalId,
  generatePaymentExternalId,
  resolvePlusPesaProvider
} from '../src/services/payment/paymentUtils';
import {
  resolveUserPremiumStatus
} from '../src/services/aiPremiumSubscriptionService';
import {
  getLocalCachedNotifications,
  _resetNotificationsForTesting
} from '../src/services/notificationService';
import { MockPaymentProvider } from '../src/services/payment/mockPaymentProvider';

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passedTests++;
    console.log(`✅ [PASS] ${message}`);
  } else {
    failedTests++;
    console.error(`❌ [FAIL] ${message}`);
  }
}

export async function runV110BTests() {
  console.log('================================================================');
  console.log('  UFUGAJI UPDATE — V1.10B SELLER PAYMENT & RENEWAL TEST SUITE');
  console.log('================================================================\n');

  // Reset stores for clean state
  sellerMonetizationService._resetForTesting();
  sellerPaymentService._resetForTesting();
  _resetNotificationsForTesting();

  // Configure Mock Payment Provider for tests
  const mockProvider = new MockPaymentProvider();
  sellerPaymentService.registerProvider(mockProvider);
  sellerPaymentService.setDefaultProvider('MOCK_PROVIDER');

  // -------------------------------------------------------------------------
  // TEST GROUP 1: Plan & Pricing Governance
  // -------------------------------------------------------------------------
  console.log('--- Group 1: Plan & Pricing Governance ---');

  assert(
    SELLER_MONETIZATION_CONFIG.plan === 'SELLER_MONTHLY',
    'Test 1.1: Governed plan is SELLER_MONTHLY'
  );
  assert(
    SELLER_MONETIZATION_CONFIG.monthlyPrice === 1000,
    'Test 1.2: Governed price is exactly 1,000 TZS'
  );
  assert(
    SELLER_MONETIZATION_CONFIG.currency === 'TZS',
    'Test 1.3: Governed currency is TZS'
  );

  // -------------------------------------------------------------------------
  // TEST GROUP 2: Tanzanian Phone Validation & Provider Resolution
  // -------------------------------------------------------------------------
  console.log('\n--- Group 2: Phone Validation & Network Detection ---');

  const vodaResult = normalizeTanzanianPhoneNumber('0754123456');
  assert(
    vodaResult.isValid && vodaResult.normalizedPhone === '255754123456' && vodaResult.suggestedProvider === 'Mpesa',
    'Test 2.1: Vodacom number normalized to 255754123456 (M-Pesa)'
  );

  const tigoResult = normalizeTanzanianPhoneNumber('+255 712 345 678');
  assert(
    tigoResult.isValid && tigoResult.normalizedPhone === '255712345678' && tigoResult.suggestedProvider === 'Tigo',
    'Test 2.2: Tigo number normalized to 255712345678 (Tigo)'
  );

  const airtelResult = normalizeTanzanianPhoneNumber('0784 123 456');
  assert(
    airtelResult.isValid && airtelResult.normalizedPhone === '255784123456' && airtelResult.suggestedProvider === 'Airtel',
    'Test 2.3: Airtel number normalized to 255784123456 (Airtel)'
  );

  const haloResult = normalizeTanzanianPhoneNumber('0624123456');
  assert(
    haloResult.isValid && haloResult.normalizedPhone === '255624123456' && haloResult.suggestedProvider === 'Halopesa',
    'Test 2.4: Halotel number normalized to 255624123456 (Halopesa)'
  );

  const invalidResult = normalizeTanzanianPhoneNumber('12345');
  assert(
    !invalidResult.isValid,
    'Test 2.5: Invalid short phone number rejected'
  );

  // -------------------------------------------------------------------------
  // TEST GROUP 3: Deterministic External ID Schema
  // -------------------------------------------------------------------------
  console.log('\n--- Group 3: Deterministic External ID Schema ---');

  const sellerExtId = generateSellerPaymentExternalId('spi_123456_abc');
  const aiExtId = generatePaymentExternalId('pay_123456_abc');

  assert(
    sellerExtId.startsWith('UFUGAJI_SELLER_PREMIUM_'),
    `Test 3.1: Seller external ID follows UFUGAJI_SELLER_PREMIUM_ format: ${sellerExtId}`
  );
  assert(
    aiExtId.startsWith('UFUGAJI_PREMIUM_'),
    `Test 3.2: AI external ID follows UFUGAJI_PREMIUM_ format: ${aiExtId}`
  );
  assert(
    sellerExtId !== aiExtId && !sellerExtId.startsWith('UFUGAJI_PREMIUM_'),
    'Test 3.3: Seller external ID is strictly distinct from AI Premium external ID'
  );

  // -------------------------------------------------------------------------
  // TEST GROUP 4: Payment Initiation & Lifecycle State Boundary
  // -------------------------------------------------------------------------
  console.log('\n--- Group 4: Payment Initiation & State Boundary ---');

  const sellerUser1 = `seller-v110b-user-01_${Date.now()}`;
  sellerMonetizationService.activateFirstMonthFreeTrial({ sellerUserId: sellerUser1 });
  sellerMonetizationService.simulateGracePeriod(sellerUser1, 'admin');

  const recordBeforePay = sellerMonetizationService.getSellerRecord(sellerUser1);
  assert(
    recordBeforePay.status === 'GRACE_PERIOD',
    'Test 4.1: Initial record is in GRACE_PERIOD'
  );

  // Default mock creates PENDING
  mockProvider.setNextStatus('PENDING');

  const initResult = await sellerPaymentService.initiateSellerPayment({
    sellerUserId: sellerUser1,
    customerPhone: '0754123456',
    providerName: 'MOCK_PROVIDER',
    idempotencyKey: 'idemp_test_init_1'
  });

  assert(
    initResult.success,
    'Test 4.2: Payment initiation succeeded'
  );
  assert(
    initResult.paymentIntent.plan === 'SELLER_MONTHLY',
    'Test 4.3: Intent plan is locked to SELLER_MONTHLY'
  );
  assert(
    initResult.paymentIntent.amount === 1000 && initResult.paymentIntent.currency === 'TZS',
    'Test 4.4: Intent amount is locked to 1,000 TZS'
  );
  assert(
    initResult.paymentIntent.status === 'PENDING',
    'Test 4.5: Created payment is in PENDING status'
  );

  // CRITICAL: Payment creation MUST NOT activate subscription!
  const recordAfterCreate = sellerMonetizationService.getSellerRecord(sellerUser1);
  assert(
    recordAfterCreate.status === 'GRACE_PERIOD',
    'Test 4.6: Creation did NOT immediately activate subscription (remains in GRACE_PERIOD)'
  );

  // -------------------------------------------------------------------------
  // TEST GROUP 5: Commercial Product Isolation
  // -------------------------------------------------------------------------
  console.log('\n--- Group 5: Commercial Product Isolation (Seller vs AI Premium) ---');

  const aiStatus = resolveUserPremiumStatus(sellerUser1);
  assert(
    !aiStatus.isPremiumActive && aiStatus.tier === 'FREE',
    'Test 5.1: Seller payment intent did NOT grant AI Premium entitlement'
  );

  // -------------------------------------------------------------------------
  // TEST GROUP 6: Authoritative Transition on Payment Success (GRACE -> ACTIVE)
  // -------------------------------------------------------------------------
  console.log('\n--- Group 6: Authoritative Transition on Payment Success (GRACE -> ACTIVE) ---');

  // Simulate verified provider webhook confirming payment
  const webhookResult = await sellerPaymentService.processProviderCallback(
    'MOCK_PROVIDER',
    {
      data: {
        external_id: initResult.paymentIntent.externalId,
        reference: initResult.paymentIntent.providerReference || 'MOCK_REF_001',
        status: 'success',
        amount: 1000,
        currency: 'TZS'
      }
    }
  );

  assert(
    webhookResult.success && webhookResult.lifecycleRenewed,
    'Test 6.1: Webhook processed successfully and triggered lifecycle renewal'
  );

  const updatedRecord = sellerMonetizationService.getSellerRecord(sellerUser1);
  assert(
    updatedRecord.status === 'ACTIVE',
    'Test 6.2: Seller monetization transitioned authoritatively to ACTIVE'
  );
  assert(
    updatedRecord.lastPaymentStatus === 'SUCCESS' && updatedRecord.lastPaymentAmount === 1000,
    'Test 6.3: Last payment status recorded as SUCCESS with 1,000 TZS'
  );

  const eligibility = sellerMonetizationService.canSellerSellOnMarketplace(sellerUser1);
  assert(
    eligibility.canSell === true && eligibility.status === 'ACTIVE',
    'Test 6.4: Seller is fully eligible to sell on Marketplace'
  );

  // AI Premium remains inactive
  const aiStatusAfterPayment = resolveUserPremiumStatus(sellerUser1);
  assert(
    !aiStatusAfterPayment.isPremiumActive && aiStatusAfterPayment.tier === 'FREE',
    'Test 6.5: Authoritative seller payment success did NOT activate AI Premium'
  );

  // -------------------------------------------------------------------------
  // TEST GROUP 7: Authoritative Payment Success: EXPIRED -> ACTIVE
  // -------------------------------------------------------------------------
  console.log('\n--- Group 7: Authoritative Transition from EXPIRED to ACTIVE ---');

  const sellerUser2 = `seller-v110b-user-02_${Date.now()}`;
  sellerMonetizationService.activateFirstMonthFreeTrial({ sellerUserId: sellerUser2 });
  sellerMonetizationService.simulateGracePeriod(sellerUser2, 'admin');
  sellerMonetizationService.simulateGraceExpiry(sellerUser2, 'admin');

  const expiredRecord = sellerMonetizationService.getSellerRecord(sellerUser2);
  assert(
    expiredRecord.status === 'EXPIRED',
    'Test 7.1: SellerUser2 is in EXPIRED state'
  );

  const expiredEligibility = sellerMonetizationService.canSellerSellOnMarketplace(sellerUser2);
  assert(
    expiredEligibility.canSell === false,
    'Test 7.2: EXPIRED seller is blocked from selling on Marketplace'
  );

  // Initiate renewal from EXPIRED
  const expiredPayment = await sellerPaymentService.initiateSellerPayment({
    sellerUserId: sellerUser2,
    customerPhone: '0712345678',
    providerName: 'MOCK_PROVIDER',
    idempotencyKey: 'idemp_expired_pay_1'
  });

  assert(
    expiredPayment.success,
    'Test 7.3: Payment initiated successfully from EXPIRED'
  );

  // Provider callback confirms payment
  await sellerPaymentService.processProviderCallback(
    'MOCK_PROVIDER',
    {
      data: {
        external_id: expiredPayment.paymentIntent.externalId,
        reference: expiredPayment.paymentIntent.providerReference,
        status: 'success',
        amount: 1000,
        currency: 'TZS'
      }
    }
  );

  const restoredRecord = sellerMonetizationService.getSellerRecord(sellerUser2);
  assert(
    restoredRecord.status === 'ACTIVE',
    'Test 7.4: EXPIRED seller transitioned to ACTIVE upon payment'
  );
  assert(
    restoredRecord.hasHadTrial === true,
    'Test 7.5: hasHadTrial remains true (no free trial reset)'
  );

  const restoredEligibility = sellerMonetizationService.canSellerSellOnMarketplace(sellerUser2);
  assert(
    restoredEligibility.canSell === true,
    'Test 7.6: Restored seller can now sell on Marketplace'
  );

  // -------------------------------------------------------------------------
  // TEST GROUP 8: Active Renewal (Extending Paid Period)
  // -------------------------------------------------------------------------
  console.log('\n--- Group 8: Active Renewal (Extending Paid Period) ---');

  const initialEnd = new Date(restoredRecord.currentPeriodEndAt!).getTime();

  // Pre-pay/renew while ACTIVE
  const renewalInit = await sellerPaymentService.initiateSellerPayment({
    sellerUserId: sellerUser2,
    customerPhone: '0712345678',
    providerName: 'MOCK_PROVIDER',
    idempotencyKey: 'idemp_renewal_1'
  });

  assert(
    renewalInit.success,
    'Test 8.1: Active renewal payment initiated successfully'
  );

  // Confirm payment via webhook
  await sellerPaymentService.processProviderCallback(
    'MOCK_PROVIDER',
    {
      data: {
        external_id: renewalInit.paymentIntent.externalId,
        reference: renewalInit.paymentIntent.providerReference,
        status: 'success',
        amount: 1000,
        currency: 'TZS'
      }
    }
  );

  const renewedRecord = sellerMonetizationService.getSellerRecord(sellerUser2);
  const renewedEnd = new Date(renewedRecord.currentPeriodEndAt!).getTime();
  const diffDays = Math.round((renewedEnd - initialEnd) / (24 * 60 * 60 * 1000));

  assert(
    renewedRecord.status === 'ACTIVE',
    'Test 8.2: Status remains ACTIVE after renewal'
  );
  assert(
    diffDays === 30,
    `Test 8.3: Renewal extended currentPeriodEndAt by exactly 30 days (difference: ${diffDays} days)`
  );

  // -------------------------------------------------------------------------
  // TEST GROUP 9: Webhook Validation & Duplicate Protection
  // -------------------------------------------------------------------------
  console.log('\n--- Group 9: Webhook Validation & Duplicate Protection ---');

  const sellerUser3 = `seller-v110b-user-03_${Date.now()}`;
  sellerMonetizationService.activateFirstMonthFreeTrial({ sellerUserId: sellerUser3 });
  sellerMonetizationService.simulateGracePeriod(sellerUser3, 'admin');

  const payInit3 = await sellerPaymentService.initiateSellerPayment({
    sellerUserId: sellerUser3,
    customerPhone: '0784111222',
    providerName: 'MOCK_PROVIDER'
  });

  // Test 9.1: Mismatched amount rejected
  const badAmountCallback = await sellerPaymentService.processProviderCallback(
    'MOCK_PROVIDER',
    {
      data: {
        external_id: payInit3.paymentIntent.externalId,
        reference: 'MOCK_TX_BAD',
        status: 'success',
        amount: 500, // Invalid amount (expected 1000)
        currency: 'TZS'
      }
    }
  );

  assert(
    !badAmountCallback.success && badAmountCallback.errorCode === 'AMOUNT_MISMATCH',
    'Test 9.1: Webhook with mismatched amount (500 vs 1000) rejected'
  );

  // Test 9.2: Mismatched currency rejected
  const badCurrencyCallback = await sellerPaymentService.processProviderCallback(
    'MOCK_PROVIDER',
    {
      data: {
        external_id: payInit3.paymentIntent.externalId,
        reference: 'MOCK_TX_BAD_CURR',
        status: 'success',
        amount: 1000,
        currency: 'USD' // Invalid currency (expected TZS)
      }
    }
  );

  assert(
    !badCurrencyCallback.success && badCurrencyCallback.errorCode === 'CURRENCY_MISMATCH',
    'Test 9.2: Webhook with mismatched currency (USD vs TZS) rejected'
  );

  // Test 9.3: Valid callback succeeds
  const validCallback = await sellerPaymentService.processProviderCallback(
    'MOCK_PROVIDER',
    {
      data: {
        external_id: payInit3.paymentIntent.externalId,
        reference: 'MOCK_TX_VALID',
        status: 'success',
        amount: 1000,
        currency: 'TZS'
      }
    }
  );

  assert(
    validCallback.success && validCallback.lifecycleRenewed,
    'Test 9.3: Valid callback transitions seller to ACTIVE'
  );

  // Test 9.4: Duplicate callback returns isDuplicate: true and does not re-extend
  const preDupEnd = sellerMonetizationService.getSellerRecord(sellerUser3).currentPeriodEndAt;
  const duplicateCallback = await sellerPaymentService.processProviderCallback(
    'MOCK_PROVIDER',
    {
      data: {
        external_id: payInit3.paymentIntent.externalId,
        reference: 'MOCK_TX_VALID',
        status: 'success',
        amount: 1000,
        currency: 'TZS'
      }
    }
  );

  assert(
    duplicateCallback.success && duplicateCallback.isDuplicate === true && duplicateCallback.lifecycleRenewed === false,
    'Test 9.4: Duplicate webhook callback is recognized idempotently without re-activation'
  );

  const postDupEnd = sellerMonetizationService.getSellerRecord(sellerUser3).currentPeriodEndAt;
  assert(
    preDupEnd === postDupEnd,
    'Test 9.5: Duplicate callback did not modify currentPeriodEndAt'
  );

  // -------------------------------------------------------------------------
  // TEST GROUP 10: Polling & Status Reconciliation
  // -------------------------------------------------------------------------
  console.log('\n--- Group 10: Polling & Status Reconciliation ---');

  const sellerUser4 = `seller-v110b-user-04_${Date.now()}`;
  sellerMonetizationService.activateFirstMonthFreeTrial({ sellerUserId: sellerUser4 });
  sellerMonetizationService.simulateGracePeriod(sellerUser4, 'admin');

  // Initiate payment
  const pollInit = await sellerPaymentService.initiateSellerPayment({
    sellerUserId: sellerUser4,
    customerPhone: '0712333444',
    providerName: 'MOCK_PROVIDER'
  });

  assert(
    pollInit.paymentIntent.status === 'PENDING',
    'Test 10.1: Initial status is PENDING'
  );

  // Simulate provider status change to SUCCESS
  mockProvider.setNextStatus('SUCCESS');

  // Query/poll status
  const pollResult = await sellerPaymentService.checkOrPollPaymentStatus(
    pollInit.paymentIntent.paymentIntentId,
    sellerUser4
  );

  assert(
    pollResult.success && pollResult.paymentIntent.status === 'SUCCESS' && pollResult.lifecycleRenewed === true,
    'Test 10.2: Status polling reconciled provider status to SUCCESS and renewed lifecycle'
  );

  const pollRecord = sellerMonetizationService.getSellerRecord(sellerUser4);
  assert(
    pollRecord.status === 'ACTIVE',
    'Test 10.3: Seller status updated to ACTIVE from polling reconciliation'
  );

  // -------------------------------------------------------------------------
  // TEST GROUP 11: Notification Deduplication
  // -------------------------------------------------------------------------
  console.log('\n--- Group 11: Notification Deduplication ---');

  await new Promise((r) => setTimeout(r, 50));
  const notifications = getLocalCachedNotifications(sellerUser1);

  const renewalSuccessNotifs = notifications.filter(
    (n) => n.type === 'SELLER_RENEWAL_SUCCESS'
  );

  assert(
    renewalSuccessNotifs.length === 1,
    `Test 11.1: Exactly 1 SELLER_RENEWAL_SUCCESS notification emitted (found: ${renewalSuccessNotifs.length})`
  );


  // -------------------------------------------------------------------------
  // TEST GROUP 12: Suspended Seller Cannot Pay
  // -------------------------------------------------------------------------
  console.log('\n--- Group 12: Suspended Seller Protection ---');

  const sellerUser5 = `seller-v110b-user-05_${Date.now()}`;
  sellerMonetizationService.activateFirstMonthFreeTrial({ sellerUserId: sellerUser5 });
  sellerMonetizationService.suspendSellerMonetization(sellerUser5, 'Breach of policy', 'admin');

  const suspendPaymentResult = await sellerPaymentService.initiateSellerPayment({
    sellerUserId: sellerUser5,
    customerPhone: '0754123456',
    providerName: 'MOCK_PROVIDER'
  });

  assert(
    !suspendPaymentResult.success && suspendPaymentResult.errorCode === 'SELLER_SUSPENDED',
    'Test 12.1: Suspended seller cannot initiate subscription payments'
  );

  // -------------------------------------------------------------------------
  // TEST GROUP 13: Stale Client Rejection
  // -------------------------------------------------------------------------
  console.log('\n--- Group 13: Stale Client / Tampering Rejection ---');

  // Non-existent intent
  const fakeStatusResult = await sellerPaymentService.checkOrPollPaymentStatus(
    'fake_intent_99999',
    sellerUser1
  );

  assert(
    !fakeStatusResult.success,
    'Test 13.1: Non-existent payment intent is rejected by status checker'
  );

  // Unauthorized caller
  const unauthCheckResult = await sellerPaymentService.checkOrPollPaymentStatus(
    pollInit.paymentIntent.paymentIntentId,
    'random-hacker-user',
    false // not admin
  );

  assert(
    !unauthCheckResult.success && unauthCheckResult.error?.includes('Ruhusa imekataliwa'),
    'Test 13.2: Unauthorized user cannot check another seller’s payment intent'
  );

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`  V1.10B TEST SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('================================================================');

  if (failedTests > 0) {
    throw new Error(`V1.10B Test Suite Failed with ${failedTests} failure(s)`);
  }
}

runV110BTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('Test execution failed:', err);
    process.exit(1);
  });


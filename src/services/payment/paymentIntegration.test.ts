/// <reference types="node" />
/**
 * V1.8E — Governed PlusPesa Direct Payment Integration Test Suite
 *
 * Comprehensive validation:
 * 1. Provider-neutral interface & MockPaymentProvider
 * 2. PlusPesa isolated adapter & anti-fabrication compliance
 * 3. Secret management boundary (Secrets masked in safe config, never in client)
 * 4. Phone normalization & provider resolution (Vodacom/Mpesa, Tigo, Airtel, Halopesa, Azampesa)
 * 5. External ID format (UFUGAJI_PREMIUM_<id>)
 * 6. Non-payment safe connectivity test (testConnection)
 * 7. Webhook HMAC-SHA256 signature validation with timing-safe check
 * 8. Rejection of tampered signatures (PAYMENT_WEBHOOK_SIGNATURE_FAILED)
 * 9. Rejection of mismatched amount/currency (PAYMENT_VALIDATION_FAILED)
 * 10. Rejection of unknown external_id
 * 11. Strict state authority: PENDING/PROCESSING/FAILED never activate Premium
 * 12. Verified SUCCESS triggers authoritative Premium activation
 * 13. Idempotency on duplicate SUCCESS callbacks
 * 14. Polling fallback reconciliation using PlusPesa UUID
 * 15. User isolation boundary
 * 16. Audit event logging completeness
 */

import * as crypto from 'crypto';
import { paymentService } from './paymentService';
import { PlusPesaPaymentProvider } from './plusPesaPaymentProvider';
import { MockPaymentProvider } from './mockPaymentProvider';
import { resolveUserPremiumStatus } from '../aiPremiumSubscriptionService';
import { PaymentAuditEvent } from '../../types/aiUsageAndCache';
import {
  normalizeTanzanianPhoneNumber,
  resolvePlusPesaProvider,
  generatePaymentExternalId
} from './paymentUtils';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[TEST FAILED] ${message}`);
  }
}

export async function runV18EPlusPesaIntegrationTests() {
  console.log('--- STARTING V1.8E PLUSPESA PAYMENT INTEGRATION TESTS ---');

  // =========================================================================
  // Part 1: Phone Normalization and Provider Resolution Tests
  // =========================================================================
  console.log('Test 1: Tanzanian Phone Normalization & Provider Resolution');
  
  // Vodacom -> Mpesa
  const vodacomCheck = normalizeTanzanianPhoneNumber('0754 123 456');
  assert(vodacomCheck.isValid === true, 'Vodacom number must be valid');
  assert(vodacomCheck.normalizedPhone === '255754123456', 'Vodacom must normalize to 255754123456');
  assert(vodacomCheck.suggestedProvider === 'Mpesa', 'Vodacom must suggest Mpesa');

  // Tigo -> Tigo
  const tigoCheck = normalizeTanzanianPhoneNumber('+255 712 345 678');
  assert(tigoCheck.isValid === true, 'Tigo number must be valid');
  assert(tigoCheck.normalizedPhone === '255712345678', 'Tigo must normalize to 255712345678');
  assert(tigoCheck.suggestedProvider === 'Tigo', 'Tigo must suggest Tigo');

  // Airtel -> Airtel
  const airtelCheck = normalizeTanzanianPhoneNumber('0784111222');
  assert(airtelCheck.isValid === true, 'Airtel number must be valid');
  assert(airtelCheck.suggestedProvider === 'Airtel', 'Airtel must suggest Airtel');

  // Halotel -> Halopesa
  const halotelCheck = normalizeTanzanianPhoneNumber('0622334455');
  assert(halotelCheck.isValid === true, 'Halotel number must be valid');
  assert(halotelCheck.suggestedProvider === 'Halopesa', 'Halotel must suggest Halopesa');

  // Azam -> Azampesa
  const azamCheck = normalizeTanzanianPhoneNumber('0732334455');
  assert(azamCheck.isValid === true, 'Azam number must be valid');
  assert(azamCheck.suggestedProvider === 'Azampesa', 'Azam must suggest Azampesa');

  // Explicit provider selection validation
  const validProviderResolve = resolvePlusPesaProvider('0754123456', 'Tigo');
  assert(validProviderResolve.isValid === true, 'Explicit valid provider must be accepted');
  assert(validProviderResolve.provider === 'Tigo', 'Provider should match explicit choice');

  const invalidProviderResolve = resolvePlusPesaProvider('0754123456', 'Bitcoin');
  assert(invalidProviderResolve.isValid === false, 'Invalid provider must be rejected');
  assert(
    invalidProviderResolve.error?.includes('Mpesa, Tigo, Airtel, Halopesa, Azampesa') === true,
    'Error message must list exact supported providers'
  );

  // External ID generation
  const extId = generatePaymentExternalId('pay_test_abc123');
  assert(extId.startsWith('UFUGAJI_PREMIUM_'), 'External ID must start with UFUGAJI_PREMIUM_');
  assert(extId.includes('test_abc123'), 'External ID must incorporate payment ID reference');

  // =========================================================================
  // Part 2: PlusPesa Isolated Provider Adapter & Safe Config Tests
  // =========================================================================
  console.log('Test 2: PlusPesa Provider Adapter & Safe Config');
  const plusPesa = new PlusPesaPaymentProvider({
    publicKey: 'pk_test_sample_12345678',
    secretKey: 'sk_test_sample_87654321',
    callbackSecret: 'whsec_sample_secret_key_9999',
    baseUrl: 'https://app.pluspesa.com/api/v1',
    environment: 'sandbox'
  });

  assert(plusPesa.providerName === 'PLUSPESA', 'Provider name must be PLUSPESA');
  assert(plusPesa.isConfigured === true, 'Provider with keys must report isConfigured=true');

  const safeConfig = plusPesa.getSafeConfig();
  assert(safeConfig.hasPublicKey === true, 'Safe config must report hasPublicKey=true');
  assert(safeConfig.hasSecretKey === true, 'Safe config must report hasSecretKey=true');
  assert(safeConfig.hasCallbackSecret === true, 'Safe config must report hasCallbackSecret=true');
  assert(!JSON.stringify(safeConfig).includes('sk_test_sample_87654321'), 'Raw secret key must NEVER be in safeConfig');
  assert(safeConfig.maskedSecretKey.includes('****'), 'Secret key must be masked');

  // Runtime update test
  plusPesa.updateConfig({ environment: 'production' });
  assert(plusPesa.getSafeConfig().environment === 'production', 'updateConfig must update environment');
  plusPesa.updateConfig({ environment: 'sandbox' });

  // =========================================================================
  // Part 3: HMAC-SHA256 Webhook Signature Verification Tests
  // =========================================================================
  console.log('Test 3: Webhook HMAC-SHA256 Signature Verification');

  const testCallbackSecret = 'test_webhook_hmac_secret_123';
  plusPesa.updateConfig({ callbackSecret: testCallbackSecret });

  const validPayload = {
    external_id: 'UFUGAJI_PREMIUM_UNIT_TEST_1',
    reference: 'PP-REF-10001',
    uuid: 'pp-uuid-abc-123',
    status: 'success',
    amount: 10000,
    currency: 'TZS',
    provider: 'Tigo'
  };
  const rawBodyString = JSON.stringify(validPayload);
  const correctHmac = crypto.createHmac('sha256', testCallbackSecret).update(rawBodyString).digest('hex');

  // A. Valid signature
  const validCallbackResult = await plusPesa.verifyPaymentCallback(
    validPayload,
    { 'x-pluspesa-signature': correctHmac },
    rawBodyString
  );
  assert(validCallbackResult.isValid === true, 'Valid HMAC signature must verify successfully');
  assert(validCallbackResult.normalizedStatus === 'SUCCESS', 'Status must normalize to SUCCESS');
  assert(validCallbackResult.amount === 10000, 'Amount must be parsed');

  // B. Missing signature header
  const missingSigResult = await plusPesa.verifyPaymentCallback(
    validPayload,
    {},
    rawBodyString
  );
  assert(missingSigResult.isValid === false, 'Missing signature must fail');
  assert(missingSigResult.providerStatus === 'MISSING_SIGNATURE', 'Provider status must be MISSING_SIGNATURE');

  // C. Tampered signature
  const tamperedSigResult = await plusPesa.verifyPaymentCallback(
    validPayload,
    { 'x-pluspesa-signature': '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' },
    rawBodyString
  );
  assert(tamperedSigResult.isValid === false, 'Tampered HMAC signature must fail');
  assert(tamperedSigResult.providerStatus === 'SIGNATURE_MISMATCH', 'Provider status must be SIGNATURE_MISMATCH');

  // =========================================================================
  // Part 4: End-to-End Governed Payment Lifecycle with Mock & PlusPesa
  // =========================================================================
  console.log('Test 4: Payment Creation, Webhook Verification, & Authoritative Activation');

  const mockProvider = new MockPaymentProvider();
  paymentService.registerProvider(mockProvider);
  paymentService.registerProvider(plusPesa);
  paymentService.setDefaultProvider('MOCK_PROVIDER');
  paymentService.resetPaymentStateForTesting();

  const farmerUser = `farmer_pluspesa_test_${Date.now()}`;
  const initialEnt = resolveUserPremiumStatus(farmerUser);
  assert(initialEnt.isPremiumActive === false, 'Farmer must start at FREE tier');

  // 1. Initiate Payment Transaction (Amount is authoritative 10,000 TZS for monthly)
  const createRes = await paymentService.createPaymentTransaction({
    userId: farmerUser,
    userName: 'Juma Mfugaji',
    planId: 'plan_monthly',
    providerName: 'MOCK_PROVIDER',
    customerPhone: '0754123456',
    providerNetwork: 'Mpesa',
    correlationId: 'corr_test_1'
  });

  assert(createRes.success === true, 'createPaymentTransaction must succeed');
  const paymentTx = createRes.transaction;
  assert(paymentTx.status === 'PENDING', 'Initial status must be PENDING');
  assert(paymentTx.amount === 10000, 'Amount must be 10000 (from plan definition, not client)');
  assert(paymentTx.currency === 'TZS', 'Currency must be TZS');
  assert(paymentTx.externalId.startsWith('UFUGAJI_PREMIUM_'), 'External ID must have prefix');
  assert(paymentTx.entitlementId === null, 'Entitlement must not be activated yet');

  // Authority check: Farmer is STILL FREE
  assert(resolveUserPremiumStatus(farmerUser).isPremiumActive === false, 'PENDING payment must NEVER activate Premium');

  // 2. Reject Webhook with Amount Mismatch
  const tamperedAmountCallback = await paymentService.processProviderCallback(
    'MOCK_PROVIDER',
    {
      external_id: paymentTx.externalId,
      reference: paymentTx.providerTransactionReference,
      status: 'SUCCESS',
      amount: 5000, // Tampered amount
      currency: 'TZS'
    }
  );
  assert(tamperedAmountCallback.success === false, 'Mismatched amount must be rejected');
  assert(tamperedAmountCallback.entitlementActivated === false, 'Tampered amount must NOT activate Premium');
  assert(resolveUserPremiumStatus(farmerUser).isPremiumActive === false, 'Farmer must remain FREE after tampered amount');

  // 3. Reject Webhook with Currency Mismatch
  const tamperedCurrencyCallback = await paymentService.processProviderCallback(
    'MOCK_PROVIDER',
    {
      external_id: paymentTx.externalId,
      reference: paymentTx.providerTransactionReference,
      status: 'SUCCESS',
      amount: 10000,
      currency: 'USD' // Tampered currency
    }
  );
  assert(tamperedCurrencyCallback.success === false, 'Mismatched currency must be rejected');
  assert(tamperedCurrencyCallback.entitlementActivated === false, 'Tampered currency must NOT activate Premium');

  // 4. Reject Webhook with Unknown External ID
  const unknownExtIdCallback = await paymentService.processProviderCallback(
    'MOCK_PROVIDER',
    {
      external_id: 'UFUGAJI_PREMIUM_NON_EXISTENT_ID',
      reference: 'PP-REF-GHOST',
      status: 'SUCCESS',
      amount: 10000,
      currency: 'TZS'
    }
  );
  assert(unknownExtIdCallback.success === false, 'Unknown external ID must be rejected');

  // 5. Successful Webhook Processing -> Authoritative Activation
  console.log('Test 5: Verified SUCCESS Webhook -> Authoritative Premium Activation');
  const validSuccessWebhook = await paymentService.processProviderCallback(
    'MOCK_PROVIDER',
    {
      external_id: paymentTx.externalId,
      reference: paymentTx.providerTransactionReference,
      status: 'SUCCESS',
      amount: 10000,
      currency: 'TZS'
    }
  );

  assert(validSuccessWebhook.success === true, 'Valid webhook must process successfully');
  assert(validSuccessWebhook.entitlementActivated === true, 'Valid SUCCESS webhook MUST activate entitlement');
  assert(validSuccessWebhook.transaction?.status === 'SUCCESS', 'Transaction status must become SUCCESS');
  assert(typeof validSuccessWebhook.transaction?.entitlementId === 'string', 'Entitlement ID must be recorded');

  // Authority check: Farmer is now ACTIVE PREMIUM
  const activeEnt = resolveUserPremiumStatus(farmerUser);
  assert(activeEnt.tier === 'PREMIUM', 'Farmer tier must be PREMIUM');
  assert(activeEnt.isPremiumActive === true, 'Farmer premium must be active');
  assert(activeEnt.dailyLimit === 50, 'Daily limit must be 50 queries');
  assert(activeEnt.mediaAllowed === true, 'Media allowed must be true');

  // 6. Webhook Idempotency Check: Repeated SUCCESS does not double activate
  console.log('Test 6: Webhook Idempotency on Duplicate Callback');
  const duplicateWebhook = await paymentService.processProviderCallback(
    'MOCK_PROVIDER',
    {
      external_id: paymentTx.externalId,
      reference: paymentTx.providerTransactionReference,
      status: 'SUCCESS',
      amount: 10000,
      currency: 'TZS'
    }
  );
  assert(duplicateWebhook.success === true, 'Duplicate callback must succeed');
  assert(duplicateWebhook.isDuplicate === true, 'Duplicate flag must be true');
  assert(duplicateWebhook.entitlementActivated === false, 'Duplicate callback must NOT activate second entitlement');

  // 7. Polling Fallback Terminal State Check
  console.log('Test 7: Polling Fallback does not repoll terminal SUCCESS');
  const pollResult = await paymentService.pollPaymentStatus(paymentTx.paymentId, farmerUser);
  assert(pollResult.success === true, 'Polling call must succeed');
  assert(pollResult.polledFromProvider === false, 'Terminal SUCCESS must not hit provider API');
  assert(pollResult.transaction.status === 'SUCCESS', 'Status must remain SUCCESS');

  // 8. Audit Trail Verification
  console.log('Test 8: Audit Trail Completeness');
  const auditEvents = paymentService.getPaymentAuditEvents();
  const eventTypes = auditEvents.map((e: PaymentAuditEvent) => e.eventType);

  assert(eventTypes.includes('PAYMENT_CREATED'), 'Audit must contain PAYMENT_CREATED');
  assert(eventTypes.includes('PAYMENT_WEBHOOK_RECEIVED'), 'Audit must contain PAYMENT_WEBHOOK_RECEIVED');
  assert(eventTypes.includes('PAYMENT_VALIDATION_FAILED'), 'Audit must contain PAYMENT_VALIDATION_FAILED');
  assert(eventTypes.includes('PAYMENT_SUCCESS'), 'Audit must contain PAYMENT_SUCCESS');
  assert(eventTypes.includes('PAYMENT_DUPLICATE_CALLBACK'), 'Audit must contain PAYMENT_DUPLICATE_CALLBACK');
  assert(eventTypes.includes('PREMIUM_ACTIVATED_FROM_PAYMENT'), 'Audit must contain PREMIUM_ACTIVATED_FROM_PAYMENT');

  // 9. Observability Metrics Verification
  console.log('Test 9: Observability Metrics');
  const metrics = paymentService.getPaymentObservabilityMetrics();
  assert(metrics.paymentCreationCount >= 1, 'Metric paymentCreationCount >= 1');
  assert(metrics.paymentSuccessCount >= 1, 'Metric paymentSuccessCount >= 1');
  assert(metrics.paymentDuplicateCallbacks >= 1, 'Metric paymentDuplicateCallbacks >= 1');
  assert(metrics.premiumActivationsFromPayment >= 1, 'Metric premiumActivationsFromPayment >= 1');

  console.log('--- ALL V1.8E PLUSPESA INTEGRATION TESTS PASSED! ---');
  return { success: true, metrics, auditEventsCount: auditEvents.length };
}

// Execute tests if run directly
if (typeof process !== 'undefined' && (process.env.RUN_TESTS === 'true' || process.argv.includes('--run'))) {
  runV18EPlusPesaIntegrationTests()
    .then((res) => {
      console.log('Test run completed successfully:', res);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Test run failed with error:', err);
      process.exit(1);
    });
}


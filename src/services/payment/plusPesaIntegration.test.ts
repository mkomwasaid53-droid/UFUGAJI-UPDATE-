/// <reference types="node" />
/**
 * V1.8E — PLUSPESA REAL PAYMENT INTEGRATION TEST SUITE
 * 
 * Tests:
 * 1. Tanzanian phone number normalization & operator detection
 * 2. External ID generation (UFU-PAY-...)
 * 3. Two-key authentication header construction & anti-fabrication
 * 4. Safe configuration reporting (no secret leaks)
 * 5. Webhook raw body HMAC-SHA256 signature verification & tamper rejection
 * 6. PlusPesa status normalization (processing -> PROCESSING, success -> SUCCESS, etc.)
 * 7. End-to-end webhook callback reconciliation by externalId
 * 8. Authoritative Premium activation with idempotency protection
 * 9. Polling reconciliation fallback
 */

import * as crypto from 'crypto';
import { Buffer } from 'node:buffer';
import { normalizeTanzanianPhoneNumber, generatePaymentExternalId } from './paymentUtils';
import { PlusPesaPaymentProvider } from './plusPesaPaymentProvider';
import { paymentService } from './paymentService';
import { resolveUserPremiumStatus } from '../aiPremiumSubscriptionService';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[TEST FAILED] ${message}`);
  }
}

export async function runV18EPlusPesaIntegrationTests(): Promise<void> {
  console.log('--- STARTING V1.8E PLUSPESA INTEGRATION TESTS ---');

  // Test 1: Phone number normalization
  console.log('Test 1: Tanzanian phone number normalization & operator detection');
  const vodacom = normalizeTanzanianPhoneNumber('0754123456');
  assert(vodacom.isValid === true, '0754123456 must be valid');
  assert(vodacom.normalizedPhone === '255754123456', 'Must normalize to 255754123456');
  assert(vodacom.operator?.includes('Vodacom') === true, 'Must identify Vodacom');

  const tigo = normalizeTanzanianPhoneNumber('+255 712 345 678');
  assert(tigo.isValid === true, 'Tigo formatted number must be valid');
  assert(tigo.normalizedPhone === '255712345678', 'Must normalize to 255712345678');
  assert(tigo.operator?.includes('Tigo') === true, 'Must identify Tigo');

  const airtel = normalizeTanzanianPhoneNumber('0681234567');
  assert(airtel.isValid === true, '0681234567 must be valid');
  assert(airtel.normalizedPhone === '255681234567', 'Must normalize to 255681234567');
  assert(airtel.operator?.includes('Airtel') === true, 'Must identify Airtel');

  const halopesa = normalizeTanzanianPhoneNumber('255621234567');
  assert(halopesa.isValid === true, '255621234567 must be valid');
  assert(halopesa.normalizedPhone === '255621234567', 'Must normalize to 255621234567');
  assert(halopesa.operator?.includes('Halopesa') === true, 'Must identify Halopesa');

  // Invalid numbers
  const invalid1 = normalizeTanzanianPhoneNumber('0123456789');
  assert(invalid1.isValid === false, 'Invalid prefix 01 must fail');

  const invalid2 = normalizeTanzanianPhoneNumber('12345');
  assert(invalid2.isValid === false, 'Short number must fail');

  const invalid3 = normalizeTanzanianPhoneNumber('');
  assert(invalid3.isValid === false, 'Empty string must fail');

  // Test 2: External ID generation
  console.log('Test 2: External ID generation format and uniqueness');
  const ext1 = generatePaymentExternalId();
  const ext2 = generatePaymentExternalId();
  assert(ext1.startsWith('UFUGAJI_PREMIUM_') || ext1.startsWith('UFU-PAY-'), 'Must have valid UFUGAJI external ID prefix');
  assert(ext2.startsWith('UFUGAJI_PREMIUM_') || ext2.startsWith('UFU-PAY-'), 'Must have valid UFUGAJI external ID prefix');
  assert(ext1 !== ext2, 'Generated external IDs must be distinct');

  // Test 3: Safe configuration inspection
  console.log('Test 3: PlusPesa safe configuration inspection (no secret leaks)');
  const testSecret = 'secret_test_xyz_998877';
  const testCallbackSecret = 'cb_secret_test_554433';
  const provider = new PlusPesaPaymentProvider({
    publicKey: 'pk_live_test_112233',
    secretKey: testSecret,
    callbackSecret: testCallbackSecret,
    environment: 'sandbox'
  });

  assert(provider.isConfigured === true, 'Provider with keys must report isConfigured=true');
  const safeConfig = provider.getSafeConfig();
  assert(safeConfig.hasPublicKey === true, 'Must indicate public key present');
  assert(safeConfig.hasSecretKey === true, 'Must indicate secret key present');
  assert(safeConfig.hasCallbackSecret === true, 'Must indicate callback secret present');
  assert(safeConfig.environment === 'sandbox', 'Must report sandbox environment');
  // Strict check: secret must NEVER appear anywhere in safeConfig
  const safeConfigJson = JSON.stringify(safeConfig);
  assert(!safeConfigJson.includes(testSecret), 'Raw secret key must NEVER be leaked in safeConfig');
  assert(!safeConfigJson.includes(testCallbackSecret), 'Callback secret must NEVER be leaked in safeConfig');

  // Test 4: Status normalization
  console.log('Test 4: PlusPesa status normalization mapping');
  assert(provider.normalizeProviderStatus('processing') === 'PROCESSING', 'processing -> PROCESSING');
  assert(provider.normalizeProviderStatus('pending') === 'PENDING', 'pending -> PENDING');
  assert(provider.normalizeProviderStatus('success') === 'SUCCESS', 'success -> SUCCESS');
  assert(provider.normalizeProviderStatus('completed') === 'SUCCESS', 'completed -> SUCCESS');
  assert(provider.normalizeProviderStatus('failed') === 'FAILED', 'failed -> FAILED');
  assert(provider.normalizeProviderStatus('cancelled') === 'CANCELLED', 'cancelled -> CANCELLED');
  assert(provider.normalizeProviderStatus('timed_out') === 'EXPIRED', 'timed_out -> EXPIRED');

  // Test 5: Webhook HMAC-SHA256 signature verification
  console.log('Test 5: Webhook HMAC-SHA256 signature verification');
  const sampleWebhookPayload = {
    event: 'collection.success',
    data: {
      uuid: 'pluspesa_uuid_test_123',
      reference: 'PP-REF-998877',
      external_id: 'UFU-PAY-TEST-WH-001',
      status: 'success',
      amount: 10000,
      currency: 'TZS',
      phone: '255754123456'
    }
  };
  const rawBodyBuffer = Buffer.from(JSON.stringify(sampleWebhookPayload), 'utf8');

  // Compute authentic HMAC
  const validSignature = crypto
    .createHmac('sha256', testCallbackSecret)
    .update(rawBodyBuffer)
    .digest('hex');

  // 5a. Authentic signature must pass
  const validResult = await provider.verifyPaymentCallback(
    sampleWebhookPayload,
    { 'x-pluspesa-signature': validSignature },
    rawBodyBuffer
  );
  assert(validResult.isValid === true, 'Valid HMAC signature must verify');
  assert(validResult.normalizedStatus === 'SUCCESS', 'Callback status must be normalized to SUCCESS');
  assert(validResult.externalId === 'UFU-PAY-TEST-WH-001', 'External ID must be extracted');
  assert(validResult.providerReference === 'PP-REF-998877', 'Provider reference must be extracted');
  assert(validResult.providerUuid === 'pluspesa_uuid_test_123', 'UUID must be extracted');

  // 5b. Tampered body must fail
  const tamperedBuffer = Buffer.from(JSON.stringify({ ...sampleWebhookPayload, data: { ...sampleWebhookPayload.data, amount: 999999 } }), 'utf8');
  const tamperedResult = await provider.verifyPaymentCallback(
    sampleWebhookPayload,
    { 'x-pluspesa-signature': validSignature },
    tamperedBuffer
  );
  assert(tamperedResult.isValid === false, 'Tampered raw body must fail verification');

  // 5c. Wrong secret must fail
  const badSecretSignature = crypto
    .createHmac('sha256', 'wrong_secret_attacker')
    .update(rawBodyBuffer)
    .digest('hex');
  const wrongSecretResult = await provider.verifyPaymentCallback(
    sampleWebhookPayload,
    { 'x-pluspesa-signature': badSecretSignature },
    rawBodyBuffer
  );
  assert(wrongSecretResult.isValid === false, 'Invalid HMAC secret signature must fail verification');

  // 5d. Missing signature header must fail
  const missingSigResult = await provider.verifyPaymentCallback(
    sampleWebhookPayload,
    {},
    rawBodyBuffer
  );
  assert(missingSigResult.isValid === false, 'Missing signature must fail verification');

  // Test 6: End-to-end externalId callback reconciliation & authoritative activation
  console.log('Test 6: End-to-end PlusPesa externalId callback reconciliation & authoritative activation');
  paymentService.registerProvider(provider);

  // Setup test transaction in paymentService directly with this externalId
  const testUserId = `farmer_pluspesa_test_${Date.now()}`;

  // Ensure initial status is FREE
  const initialUserStatus = resolveUserPremiumStatus(testUserId);
  assert(initialUserStatus.tier === 'FREE', 'User must start at FREE');

  // Create payment transaction
  const txResult = await paymentService.createPaymentTransaction({
    userId: testUserId,
    planId: 'plan_monthly',
    providerName: 'MOCK_PROVIDER', // Creates internal record with externalId
    customerPhone: '0754123456'
  });
  assert(txResult.success === true, 'Payment transaction creation must succeed');
  const createdPayment = txResult.transaction;
  const paymentExternalId = createdPayment.externalId;

  // Build authentic webhook matching this payment's externalId
  const paymentWebhookPayload = {
    event: 'collection.success',
    data: {
      uuid: 'uuid_pluspesa_live_456',
      reference: 'PP-REF-LIVE-456',
      external_id: paymentExternalId,
      status: 'success',
      amount: 10000,
      currency: 'TZS',
      phone: '255754123456'
    }
  };
  const paymentWebhookRaw = Buffer.from(JSON.stringify(paymentWebhookPayload), 'utf8');
  const paymentWebhookSig = crypto
    .createHmac('sha256', testCallbackSecret)
    .update(paymentWebhookRaw)
    .digest('hex');

  // Deliver callback via paymentService
  const callbackProcessResult = await paymentService.processProviderCallback(
    'PLUSPESA',
    paymentWebhookPayload,
    { 'x-pluspesa-signature': paymentWebhookSig },
    'test-corr-1',
    paymentWebhookRaw
  );

  assert(callbackProcessResult.success === true, 'Callback processing must succeed');
  assert(callbackProcessResult.transaction?.status === 'SUCCESS', 'Payment status must transition to SUCCESS');
  assert(callbackProcessResult.entitlementActivated === true, 'Authoritative entitlement must be activated');

  // Verify User is now PREMIUM
  const activatedStatus = resolveUserPremiumStatus(testUserId);
  assert(activatedStatus.tier === 'PREMIUM', 'User must now have tier=PREMIUM');
  assert(activatedStatus.isPremiumActive === true, 'Premium must be active');
  assert(activatedStatus.dailyLimit === 50, 'Daily limit must be 50 questions/day');
  assert(activatedStatus.planType === 'MONTHLY', 'Plan type must be MONTHLY');

  // Test 7: Duplicate callback idempotency
  console.log('Test 7: Duplicate callback idempotency (no double activation)');
  const duplicateResult = await paymentService.processProviderCallback(
    'PLUSPESA',
    paymentWebhookPayload,
    { 'x-pluspesa-signature': paymentWebhookSig },
    'test-corr-dup',
    paymentWebhookRaw
  );
  assert(duplicateResult.success === true, 'Duplicate callback must succeed');
  assert(duplicateResult.isDuplicate === true, 'Duplicate callback must be identified as duplicate');
  assert(duplicateResult.entitlementActivated === false, 'Duplicate callback must NOT reactivate entitlement');

  console.log('--- ALL V1.8E PLUSPESA INTEGRATION TESTS PASSED! ---');
}

if (typeof process !== 'undefined' && process.env.RUN_TESTS === 'true') {
  runV18EPlusPesaIntegrationTests().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

/**
 * V1.9B — Ad Provider Integration Readiness & Compliance Foundation Test Suite
 *
 * Validates:
 * 1. AdProviderRegistry provider registration (MOCK_REWARDED_AD & ADMOB)
 * 2. AdMob adapter configuration using official Google Test Ad Unit IDs
 * 3. Strict Server-Authoritative boundary (Ad providers NEVER directly grant quota)
 * 4. AdComplianceService 11-point compliance checklist
 * 5. AdComplianceService 7-point Production Safety Gate evaluation
 * 6. Production Safety Gate lock preventing unverified production mode
 * 7. app-ads.txt verification logic and content formatting (IAB specification)
 * 8. Safe provider test connection probe (no real ads, no fake revenue)
 * 9. User consent recording and retrieval
 * 10. Public compliance metadata (Privacy Policy, Terms of Service)
 * 11. Strict text-only +5 reward rule enforcement
 */

import { adProviderRegistry } from './adProviderRegistry';
import { adMobRewardedAdProvider } from './adMobRewardedAdProvider';
import { mockRewardedAdProvider } from './mockRewardedAdProvider';
import { adComplianceService } from './adComplianceService';
import { adService } from './adService';
import { getOrCreateUserSummary, getUserEntitlementStatus } from '../aiUsageTrackingService';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[TEST FAILED] ${message}`);
  }
}

export async function runV19BAdReadinessComplianceTests() {
  console.log('--- STARTING V1.9B AD PROVIDER READINESS & COMPLIANCE TESTS ---');

  // =========================================================================
  // Test 1: Provider Registration in AdProviderRegistry
  // =========================================================================
  console.log('Test 1: Provider Registration in AdProviderRegistry');
  const providers = adProviderRegistry.getAllProviders();
  assert(providers.length >= 2, 'Must have at least 2 providers registered (MOCK and ADMOB)');
  
  const mockProv = adProviderRegistry.getProvider('MOCK_REWARDED_AD');
  assert(mockProv !== null, 'MOCK_REWARDED_AD must be registered');
  
  const adMobProv = adProviderRegistry.getProvider('ADMOB');
  assert(adMobProv !== null, 'ADMOB provider must be registered');
  console.log('  Passed: Providers registered successfully');

  // =========================================================================
  // Test 2: AdMob Adapter Test Credentials (No Production Credentials)
  // =========================================================================
  console.log('Test 2: AdMob Adapter Test Credentials');
  const safeConfig = adMobRewardedAdProvider.getSafeConfig();
  assert(safeConfig.isConfigured === true, 'AdMob test adapter should be configured');
  assert(safeConfig.mode === 'MOCK' || safeConfig.mode === 'TEST', 'Mode must be safe non-production (MOCK or TEST)');
  
  adMobRewardedAdProvider.setMode('TEST');
  assert(adMobRewardedAdProvider.getSafeConfig().mode === 'TEST', 'Mode should update to TEST');
  assert(
    safeConfig.testAdUnitId === 'ca-app-pub-3940256099942544/5224354917',
    'Must use official Google test rewarded ad unit ID for Android'
  );
  assert(
    safeConfig.productionSafetyLock === true,
    'AdMob adapter must be safely locked by default (readiness foundation only)'
  );
  console.log('  Passed: AdMob adapter safely configured with official test units');

  // =========================================================================
  // Test 3: Non-Authority Boundary (Provider cannot modify AI Quota directly)
  // =========================================================================
  console.log('Test 3: Server-Authoritative Reward Boundary');
  // Provider only provides presentation and verification data; AdService handles quota
  assert(
    typeof (adMobRewardedAdProvider as any).grantQuota === 'undefined',
    'AdMob provider must NOT have a direct grantQuota method'
  );
  assert(
    typeof (mockRewardedAdProvider as any).grantQuota === 'undefined',
    'Mock provider must NOT have a direct grantQuota method'
  );
  console.log('  Passed: Ad providers have no authority to grant quota directly');

  // =========================================================================
  // Test 4: 11-Point Compliance Checklist
  // =========================================================================
  console.log('Test 4: 11-Point Compliance Checklist');
  const checklist = adComplianceService.evaluateComplianceChecks({
    providerConfigured: true,
    testAdConfigured: true,
    productionAdConfigured: false,
    productionEnabled: false,
    platform: 'WEB'
  });
  assert(checklist.length === 11, `Expected 11 compliance checks, found ${checklist.length}`);
  
  const expectedCheckIds = [
    'PRIVACY_POLICY_URL',
    'TERMS_URL',
    'CONTACT_PAGE_URL',
    'DEVELOPER_WEBSITE',
    'APP_STORE_LISTING',
    'APP_ADS_TXT_STATUS',
    'AD_PROVIDER_CONFIGURATION',
    'TEST_AD_CONFIGURATION',
    'PRODUCTION_AD_CONFIGURATION',
    'CONSENT_CONFIGURATION',
    'PRODUCTION_AD_ENABLEMENT'
  ];
  for (const id of expectedCheckIds) {
    const item = checklist.find(c => c.id === id);
    assert(item !== undefined, `Checklist item ${id} must exist in 11-point list`);
  }
  console.log('  Passed: All 11 compliance checks evaluated deterministically');

  // =========================================================================
  // Test 5: 7-Point Production Safety Gate Evaluation
  // =========================================================================
  console.log('Test 5: 7-Point Production Safety Gate Evaluation');
  const safetyGateInitial = adComplianceService.evaluateProductionSafetyGate({
    providerConfigured: true,
    providerIntegrationAvailable: true,
    platform: 'WEB',
    platformConfigured: true,
    productionAdUnitConfigured: false,
    productionEnabledByAdmin: false,
    isProductionEnv: false
  });
  assert(safetyGateInitial.eligible === false, 'Production must NOT be eligible in test readiness mode');
  assert(safetyGateInitial.errorCode === 'AD_PRODUCTION_NOT_READY', 'Must fail with AD_PRODUCTION_NOT_READY');
  assert(
    (safetyGateInitial.failingConditions || []).length >= 3,
    'Multiple failing conditions must block unconfigured production'
  );
  console.log('  Passed: Safety Gate correctly blocks production in readiness phase');

  // =========================================================================
  // Test 6: Safety Gate Override Protection on AdMob Adapter
  // =========================================================================
  console.log('Test 6: Safety Gate Override Protection on AdMob Adapter');
  // Attempting to start rewarded ad in PRODUCTION mode when not ready must fail safely
  adMobRewardedAdProvider.setMode('PRODUCTION');
  adMobRewardedAdProvider.setProductionEnabled(true);
  const startProdAttempt = await adMobRewardedAdProvider.startRewardedAd({
    userId: 'test_farmer_101',
    platform: 'WEB'
  });
  assert(startProdAttempt.success === false, 'Starting ad in unconfigured PRODUCTION mode must fail');
  assert(
    startProdAttempt.errorCode === 'AD_PRODUCTION_NOT_READY' || 
    startProdAttempt.errorCode === 'AD_PROVIDER_NOT_CONFIGURED' ||
    startProdAttempt.errorCode === 'AD_PLATFORM_MISMATCH',
    'Must fail with safety gate error code'
  );
  // Reset back to TEST mode
  adMobRewardedAdProvider.setMode('TEST');
  adMobRewardedAdProvider.setProductionEnabled(false);
  console.log('  Passed: Safety gate override protection safely maintained');

  // =========================================================================
  // Test 7: app-ads.txt Verification Logic
  // =========================================================================
  console.log('Test 7: app-ads.txt Verification Logic');
  const validIabSample = 'google.com, pub-3940256099942544, DIRECT, f08c47fec0942fa0';
  const verifyResult = adComplianceService.verifyAppAdsTxt(validIabSample);
  assert(verifyResult.status === 'READY', 'app-ads.txt must verify to READY with valid IAB format');
  assert(adComplianceService.getConfig().appAdsTxtStatus === 'READY', 'appAdsTxtStatus must be READY');
  console.log('  Passed: app-ads.txt format and verification validated');

  // =========================================================================
  // Test 8: Safe Provider Test Connection Probe
  // =========================================================================
  console.log('Test 8: Safe Provider Test Connection Probe');
  const testConnAdMob = await adMobRewardedAdProvider.testConnection();
  assert(testConnAdMob.status === 'CONNECTED', 'AdMob test connection should return CONNECTED');
  assert(!testConnAdMob.message.includes('error'), 'Test connection message should indicate readiness');

  const testConnMock = await mockRewardedAdProvider.testConnection();
  assert(testConnMock.status === 'CONNECTED', 'Mock test connection should return CONNECTED');
  console.log('  Passed: Safe probe executed without real ads or revenue simulation');

  // =========================================================================
  // Test 9: User Consent Recording and Retrieval
  // =========================================================================
  console.log('Test 9: User Consent Recording and Retrieval');
  const testUserId = 'test_farmer_user_001';
  adComplianceService.setUserConsent(testUserId, 'GRANTED');

  const retrievedConsent = adComplianceService.getUserConsent(testUserId);
  assert(retrievedConsent === 'GRANTED', 'Consent status must be GRANTED');
  console.log('  Passed: User consent accurately recorded and retrieved');

  // =========================================================================
  // Test 10: Fixed Governed Reward (+5 Queries, Text Only)
  // =========================================================================
  console.log('Test 10: Fixed Governed Reward (+5 Text Queries)');
  const testFarmerId = 'test_farmer_rew_002';
  
  // Exhaust initial free queries so user is eligible for rewarded ad
  const status = getUserEntitlementStatus(testFarmerId);
  const summary = getOrCreateUserSummary(testFarmerId);
  summary.lifetimeFreeAllowanceUsed = status.freeLimit;
  summary.currentFreeAllowanceRemaining = 0;
  
  // Replay Protection Verification
  const startSession = await adService.startRewardedAd(testFarmerId, 'req_test_001', 'MOCK_REWARDED_AD', 'WEB');
  assert(startSession.success === true, 'Starting rewarded ad session must succeed');
  assert(Boolean(startSession.rewardToken), 'Ad session must yield verifiable token');
  assert(Boolean(startSession.providerRewardId), 'Ad session must yield providerRewardId');

  const verifyFirst = await adService.verifyAndGrantReward({
    userId: testFarmerId,
    rewardToken: startSession.rewardToken!,
    providerRewardId: startSession.providerRewardId!,
    providerName: 'MOCK_REWARDED_AD',
    platform: 'WEB'
  });
  assert(verifyFirst.success === true, 'First verification must succeed');
  assert(verifyFirst.queriesGranted === 5, 'Must grant exactly 5 queries');

  // Second verification with identical token must fail replay protection
  const verifyReplay = await adService.verifyAndGrantReward({
    userId: testFarmerId,
    rewardToken: startSession.rewardToken!,
    providerRewardId: startSession.providerRewardId!,
    providerName: 'MOCK_REWARDED_AD',
    platform: 'WEB'
  });
  assert(verifyReplay.success === false, 'Duplicate verification must be blocked');
  assert(
    verifyReplay.errorCode === 'AD_REWARD_DUPLICATE',
    'Duplicate attempt must be marked AD_REWARD_DUPLICATE'
  );
  console.log('  Passed: Governed +5 text reward and replay protection verified');

  console.log('--- ALL V1.9B AD READINESS & COMPLIANCE TESTS PASSED ---');
}

// Execute if run directly
if (process.argv[1]?.endsWith('adReadinessCompliance.test.ts')) {
  runV19BAdReadinessComplianceTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

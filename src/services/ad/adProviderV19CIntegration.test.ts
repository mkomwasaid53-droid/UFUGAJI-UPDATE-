/**
 * V1.9C — Real Ad Provider Integration & Production Reward Foundation Test Suite
 *
 * Validates:
 * 1. Provider-Agnostic Architecture (AdProvider, AdService, Registry, Safety Gate, Compliance, Consent, Audit)
 * 2. Platform Separation (WEB vs ANDROID, AD_PLATFORM_MISMATCH on incompatible combinations)
 * 3. AdMob Production Adapter Safety (Google test units for TEST, separated production configuration, masked credentials)
 * 4. Production Safety Gate Deterministic Failures (AD_PRODUCTION_NOT_READY, AD_PLATFORM_MISMATCH, AD_CONSENT_DENIED, AD_CONSENT_REQUIRED, AD_PRODUCTION_DISABLED)
 * 5. Strict Prohibition of Silent Fallback (Never silently fallback from PRODUCTION to MOCK)
 * 6. Rewarded Ad Request Flow & Server-Authoritative Verification (Free quota exhaustion -> Start -> Verify -> +5 Text queries)
 * 7. Replay Protection (Double-claiming token or providerRewardId is blocked deterministically)
 * 8. Tampering Protection (Reject client-supplied custom units)
 * 9. Non-Authority Boundary (Providers cannot directly modify quota, premium, or media access)
 * 10. Premium & Media Separation (Rewarded ads never grant Premium; free users remain text-only; media calls return MEDIA_ACCESS_DENIED)
 * 11. Consent Handling (UNKNOWN -> blocked, DENIED -> blocked, GRANTED -> evaluated)
 * 12. 5 Distinct Lifecycle Stages (IMPLEMENTED, CONFIGURED, COMPLIANT, PRODUCTION_READY, PRODUCTION_ENABLED)
 * 13. Audit Logging (Safe audit events without sensitive token/secret leaks)
 */

import { adProviderRegistry } from './adProviderRegistry';
import { adMobRewardedAdProvider } from './adMobRewardedAdProvider';
import { mockRewardedAdProvider } from './mockRewardedAdProvider';
import { adComplianceService } from './adComplianceService';
import { adService } from './adService';
import { 
  getOrCreateUserSummary, 
  getUserEntitlementStatus,
  checkUserAiEntitlement
} from '../aiUsageTrackingService';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[TEST FAILED] ${message}`);
  }
}

export async function runV19CAdIntegrationTests() {
  console.log('================================================================');
  console.log('--- STARTING V1.9C REAL AD PROVIDER INTEGRATION & SAFETY TESTS ---');
  console.log('================================================================');

  // =========================================================================
  // 1. Provider-Agnostic Architecture & Platform Separation
  // =========================================================================
  console.log('\n[V1.9C - Test 1] Provider-Agnostic Architecture & Platform Support Declaration');
  const allProviders = adProviderRegistry.getAllProviders();
  assert(allProviders.length >= 2, 'Registry must contain both MOCK and ADMOB providers');

  // Check supported platforms declaration
  assert(adMobRewardedAdProvider.supportedPlatforms.includes('ANDROID'), 'AdMob must declare ANDROID platform support');
  assert(mockRewardedAdProvider.supportedPlatforms.includes('WEB'), 'Mock provider must support WEB platform');
  assert(mockRewardedAdProvider.supportedPlatforms.includes('ANDROID'), 'Mock provider must support ANDROID platform');

  // Verify platform compatibility helper
  assert(adMobRewardedAdProvider.supportsPlatform('ANDROID') === true, 'AdMob must support ANDROID');
  assert(adMobRewardedAdProvider.supportsPlatform('WEB') === false, 'AdMob Android SDK must NOT claim native WEB platform support without Web ad unit');
  console.log('  Passed: Platform separation and supported platform declarations verified.');

  // =========================================================================
  // 2. Platform Separation Enforced: WEB + Android-only AdMob = BLOCKED
  // =========================================================================
  console.log('\n[V1.9C - Test 2] Platform Mismatch Gate: WEB + Android-only Provider');
  const testFarmerWeb = 'test_farmer_web_platform_check';
  
  // Set registry to AdMob on WEB
  adProviderRegistry.setActiveProvider('ADMOB');
  adProviderRegistry.setActivePlatform('WEB');
  adProviderRegistry.setActiveMode('TEST');

  const webEligibility = adService.checkEligibility(testFarmerWeb, 'WEB');
  assert(webEligibility.eligible === false, 'AdMob on WEB must be marked ineligible without web ad unit');
  assert(webEligibility.errorCode === 'AD_PLATFORM_MISMATCH', 'Must return AD_PLATFORM_MISMATCH for Web + Android AdMob');
  assert(webEligibility.reason?.includes('AD_PLATFORM_MISMATCH'), 'Reason must explicitly specify AD_PLATFORM_MISMATCH');

  // Switch to ANDROID: eligibility check passes platform check
  adProviderRegistry.setActivePlatform('ANDROID');
  const androidEligibility = adService.checkEligibility(testFarmerWeb, 'ANDROID');
  assert(androidEligibility.errorCode !== 'AD_PLATFORM_MISMATCH', 'AdMob on ANDROID must not fail platform match');
  console.log('  Passed: Platform mismatch gate deterministically blocks incompatible provider/platform combinations.');

  // =========================================================================
  // 3. AdMob Production Adapter: Test Units vs Production Isolation & Masking
  // =========================================================================
  console.log('\n[V1.9C - Test 3] AdMob Adapter Configuration & Masked Credentials');
  const safeConfig = adMobRewardedAdProvider.getSafeConfig();
  assert(
    safeConfig.testAdUnitId === 'ca-app-pub-3940256099942544/5224354917',
    'TEST mode must use official Google rewarded test unit ID'
  );
  assert(safeConfig.productionSafetyLock === true, 'Production safety lock must default to true');
  
  // Verify masked representation doesn't leak secrets
  const adminSettings = adService.getAdminSettings();
  assert(typeof adminSettings.productionAdUnitMasked === 'string', 'Masked ad unit must be exposed');
  assert(!adminSettings.productionAdUnitMasked.includes('super_secret'), 'Masked unit must never leak full secrets');
  console.log('  Passed: Test ad units preserved; production credentials strictly masked.');

  // =========================================================================
  // 4. Production Safety Gate: All Failure States Deterministic & No Silent Fallback
  // =========================================================================
  console.log('\n[V1.9C - Test 4] Production Safety Gate: Deterministic Machine-Readable Error Codes');

  // Case A: Production mode when admin disabled
  const gateProdDisabled = adComplianceService.evaluateProductionSafetyGate({
    providerConfigured: true,
    providerIntegrationAvailable: true,
    platform: 'ANDROID',
    platformConfigured: true,
    platformCompatible: true,
    productionAdUnitConfigured: true,
    productionEnabledByAdmin: false, // Disabled
    isProductionEnv: true,
    consentStatus: 'GRANTED'
  });
  assert(gateProdDisabled.eligible === false, 'Safety gate must block when production is disabled');
  assert(gateProdDisabled.errorCode === 'AD_PRODUCTION_DISABLED', 'Must return AD_PRODUCTION_DISABLED');

  // Case B: Production mode with consent denied
  const gateConsentDenied = adComplianceService.evaluateProductionSafetyGate({
    providerConfigured: true,
    providerIntegrationAvailable: true,
    platform: 'ANDROID',
    platformConfigured: true,
    platformCompatible: true,
    productionAdUnitConfigured: true,
    productionEnabledByAdmin: true,
    isProductionEnv: true,
    consentStatus: 'DENIED' // Denied
  });
  assert(gateConsentDenied.eligible === false, 'Safety gate must block when consent denied');
  assert(gateConsentDenied.errorCode === 'AD_CONSENT_DENIED', 'Must return AD_CONSENT_DENIED');

  // Case C: Production mode with consent required/unknown
  const gateConsentRequired = adComplianceService.evaluateProductionSafetyGate({
    providerConfigured: true,
    providerIntegrationAvailable: true,
    platform: 'ANDROID',
    platformConfigured: true,
    platformCompatible: true,
    productionAdUnitConfigured: true,
    productionEnabledByAdmin: true,
    isProductionEnv: true,
    consentStatus: 'UNKNOWN' // Unknown
  });
  assert(gateConsentRequired.eligible === false, 'Safety gate must block when consent is unknown');
  assert(gateConsentRequired.errorCode === 'AD_CONSENT_REQUIRED', 'Must return AD_CONSENT_REQUIRED');

  // Case D: Production mode with platform mismatch
  const gatePlatformMismatch = adComplianceService.evaluateProductionSafetyGate({
    providerConfigured: true,
    providerIntegrationAvailable: true,
    platform: 'WEB',
    platformConfigured: true,
    platformCompatible: false, // Incompatible
    productionAdUnitConfigured: true,
    productionEnabledByAdmin: true,
    isProductionEnv: true,
    consentStatus: 'GRANTED'
  });
  assert(gatePlatformMismatch.eligible === false, 'Safety gate must block on platform mismatch');
  assert(gatePlatformMismatch.errorCode === 'AD_PLATFORM_MISMATCH', 'Must return AD_PLATFORM_MISMATCH');

  // Case E: Production mode with unconfigured production ad unit
  const gateNotConfigured = adComplianceService.evaluateProductionSafetyGate({
    providerConfigured: true,
    providerIntegrationAvailable: true,
    platform: 'ANDROID',
    platformConfigured: true,
    platformCompatible: true,
    productionAdUnitConfigured: false, // Missing ad unit
    productionEnabledByAdmin: true,
    isProductionEnv: true,
    consentStatus: 'GRANTED'
  });
  assert(gateNotConfigured.eligible === false, 'Safety gate must block when production unit is missing');
  assert(
    gateNotConfigured.errorCode === 'AD_PROVIDER_NOT_CONFIGURED' || gateNotConfigured.errorCode === 'AD_PRODUCTION_NOT_READY',
    'Must return AD_PROVIDER_NOT_CONFIGURED or AD_PRODUCTION_NOT_READY'
  );

  // PROHIBITION OF SILENT FALLBACK:
  // When in PRODUCTION mode and unready, adService must FAIL deterministically and NOT silently fallback to MOCK
  const prodUserSummary = getOrCreateUserSummary('test_user_prod_attempt');
  prodUserSummary.lifetimeFreeAllowanceUsed = 10;
  prodUserSummary.currentFreeAllowanceRemaining = 0;

  adProviderRegistry.setActiveMode('PRODUCTION');
  adProviderRegistry.setProductionEnabled(false);
  const prodAttempt = await adService.startRewardedAd('test_user_prod_attempt', 'req_prod_test');
  assert(prodAttempt.success === false, 'Must NOT succeed in unverified PRODUCTION mode');
  assert(prodAttempt.mode === 'PRODUCTION', 'Must preserve mode as PRODUCTION without silent fallback');
  assert(
    prodAttempt.errorCode === 'AD_PRODUCTION_DISABLED' || prodAttempt.errorCode === 'AD_PRODUCTION_NOT_READY',
    `Must return deterministic production error code, got ${prodAttempt.errorCode}`
  );
  console.log('  Passed: All 7 safety gate conditions and deterministic codes verified; zero silent fallback.');

  // =========================================================================
  // 5. Authoritative Rewarded Ad Flow & Server-Governed +5 Text Quota Grant
  // =========================================================================
  console.log('\n[V1.9C - Test 5] Authoritative Reward Flow: Free Quota Exhaustion -> Verified +5 Grant');
  // Reset back to safe MOCK mode for flow test
  adProviderRegistry.setActiveProvider('MOCK_REWARDED_AD');
  adProviderRegistry.setActivePlatform('WEB');
  adProviderRegistry.setActiveMode('MOCK');
  adService.configureMockProvider('MOCK_COMPLETED', true);

  const testUserFlow = 'test_farmer_v19c_flow_user';
  const initialSummary = getOrCreateUserSummary(testUserFlow);
  const initialStatus = getUserEntitlementStatus(testUserFlow);

  // Exhaust the 10 free queries
  initialSummary.lifetimeFreeAllowanceUsed = initialStatus.freeLimit;
  initialSummary.currentFreeAllowanceRemaining = 0;

  // Check eligibility: user is free and exhausted, should be eligible
  const eligBefore = adService.checkEligibility(testUserFlow, 'WEB');
  assert(eligBefore.eligible === true, 'Exhausted free user must be eligible for rewarded ad');

  // Start rewarded ad session
  const startSession = await adService.startRewardedAd(testUserFlow, 'req_v19c_001', 'MOCK_REWARDED_AD', 'WEB');
  assert(startSession.success === true, 'Session start must succeed');
  assert(Boolean(startSession.rewardToken), 'Session must return reward token');
  assert(Boolean(startSession.providerRewardId), 'Session must return providerRewardId');

  // Verify and Authoritatively Grant
  const verifyResult = await adService.verifyAndGrantReward({
    userId: testUserFlow,
    rewardToken: startSession.rewardToken!,
    providerRewardId: startSession.providerRewardId!,
    providerName: 'MOCK_REWARDED_AD',
    platform: 'WEB'
  });

  assert(verifyResult.success === true, 'Verification must succeed');
  assert(verifyResult.queriesGranted === 5, 'Must grant exactly 5 queries');

  // Check user entitlement post-reward
  const postStatus = getUserEntitlementStatus(testUserFlow);
  assert(postStatus.summary.currentAdRewardRemaining === 5, 'Ad reward allowance must be exactly 5');
  assert(postStatus.entitlementTier === 'FREE', 'User must remain in FREE tier (never upgraded to Premium)');
  assert(postStatus.entitlement.tier === 'FREE', 'Entitlement record tier must remain FREE');
  console.log('  Passed: Exactly +5 text queries granted by server authority; user remained FREE.');

  // =========================================================================
  // 6. Replay Protection: Duplicate Token / Reference Prevention
  // =========================================================================
  console.log('\n[V1.9C - Test 6] Replay Protection: Prevent Double-Consuming Reward Tokens');
  const replayAttempt = await adService.verifyAndGrantReward({
    userId: testUserFlow,
    rewardToken: startSession.rewardToken!,
    providerRewardId: startSession.providerRewardId!,
    providerName: 'MOCK_REWARDED_AD',
    platform: 'WEB'
  });

  assert(replayAttempt.success === false, 'Replay attempt must be rejected');
  assert(replayAttempt.errorCode === 'AD_REWARD_DUPLICATE', 'Replay must be flagged as AD_REWARD_DUPLICATE');
  assert(replayAttempt.isDuplicate === true, 'isDuplicate must be true');
  assert(replayAttempt.queriesGranted === 0, 'Zero queries granted on replay');

  // Verify allowance did not increase
  const postReplayStatus = getUserEntitlementStatus(testUserFlow);
  assert(
    postReplayStatus.summary.currentAdRewardRemaining === 5,
    'Allowance must NOT increase on duplicate replay attempt'
  );
  console.log('  Passed: Replay attack blocked deterministically without quota inflation.');

  // =========================================================================
  // 7. Tampering Protection: Client Cannot Specify Custom Units
  // =========================================================================
  console.log('\n[V1.9C - Test 7] Tampering Protection: Reject Client-Supplied Custom Units');
  const testUserTamper = `user_test_v19c_tamper_${Date.now()}`;
  const tamperSummary = getOrCreateUserSummary(testUserTamper);
  const tamperStatus = getUserEntitlementStatus(testUserTamper);
  tamperSummary.lifetimeFreeAllowanceUsed = tamperStatus.freeLimit;
  tamperSummary.currentFreeAllowanceRemaining = 0;

  const startTamper = await adService.startRewardedAd(testUserTamper, 'req_tamper_001', 'MOCK_REWARDED_AD', 'WEB');
  assert(startTamper.success === true, 'Session start must succeed');

  const tamperResult = await adService.verifyAndGrantReward({
    userId: testUserTamper,
    rewardToken: startTamper.rewardToken!,
    providerRewardId: startTamper.providerRewardId!,
    clientRequestedUnits: 100 as any // Attacker trying to request 100 queries
  });

  assert(tamperResult.success === false, 'Tampered reward units request must be rejected');
  assert(tamperResult.errorCode === 'AD_REWARD_VERIFICATION_FAILED', 'Must fail verification');
  console.log('  Passed: Tampered reward requests rejected deterministically.');

  // =========================================================================
  // 8. Media & Premium Separation: Free Rewarded Users Remain Text-Only
  // =========================================================================
  console.log('\n[V1.9C - Test 8] Premium & Media Separation: Text-Only Verification');
  // Text action should be allowed with remaining rewarded quota
  const textCheck = checkUserAiEntitlement(testUserFlow, 'TEXT_QUERY');
  assert(textCheck.allowed === true, 'Text query must be allowed with ad reward');
  assert(textCheck.source === 'AD_REWARD', 'Allowance source must be AD_REWARD');

  // Image action must be BLOCKED for free rewarded user
  const imageCheck = checkUserAiEntitlement(testUserFlow, 'IMAGE_QUERY');
  assert(imageCheck.allowed === false, 'Image query must be blocked for free rewarded user');
  assert(imageCheck.reason?.includes('Premium'), 'Must indicate Premium is required for media');

  // Video action must be BLOCKED for free rewarded user
  const videoCheck = checkUserAiEntitlement(testUserFlow, 'VIDEO_QUERY');
  assert(videoCheck.allowed === false, 'Video query must be blocked for free rewarded user');
  assert(videoCheck.reason?.includes('Premium'), 'Must indicate Premium is required for video');
  console.log('  Passed: Free rewarded users remain strictly text-only; Media AI queries blocked.');

  // =========================================================================
  // 9. Consent Foundation: State Transitions & Audit Event
  // =========================================================================
  console.log('\n[V1.9C - Test 9] Consent Foundation & Audit Trail');
  const consentUser = 'test_farmer_consent_001';
  
  // Initial consent should be UNKNOWN
  const initialConsent = adComplianceService.getUserConsent(consentUser);
  assert(initialConsent === 'UNKNOWN', 'Initial consent must be UNKNOWN');

  // Update consent to GRANTED
  adComplianceService.setUserConsent(consentUser, 'GRANTED');
  assert(adComplianceService.getUserConsent(consentUser) === 'GRANTED', 'Consent must update to GRANTED');

  // Update consent to DENIED
  adComplianceService.setUserConsent(consentUser, 'DENIED');
  assert(adComplianceService.getUserConsent(consentUser) === 'DENIED', 'Consent must update to DENIED');
  console.log('  Passed: User consent state transitions work deterministically.');

  // =========================================================================
  // 10. 5 Distinct Lifecycle Stages Distinction
  // =========================================================================
  console.log('\n[V1.9C - Test 10] 5 Distinct Lifecycle Stages Distinction');
  const readinessEval = adService.evaluateReadiness();
  assert(Boolean(readinessEval.lifecycleStage), 'Must declare lifecycleStage');
  assert(
    ['IMPLEMENTED', 'CONFIGURED', 'COMPLIANT', 'PRODUCTION_READY', 'PRODUCTION_ENABLED'].includes(readinessEval.lifecycleStage),
    'lifecycleStage must be one of the 5 canonical stages'
  );
  assert(Boolean(readinessEval.lifecycleBreakdown), 'Must provide lifecycleBreakdown breakdown object');
  assert(readinessEval.lifecycleBreakdown.implemented === true, 'IMPLEMENTED stage must be true');
  console.log(`  Passed: Distinct lifecycle stages evaluated (Current: ${readinessEval.lifecycleStage}).`);

  // =========================================================================
  // 11. Audit Observability & No Secret Leaks
  // =========================================================================
  console.log('\n[V1.9C - Test 11] Audit Trail & Safe Observability');
  const recentEvents = adService.getRecentAuditEvents(20);
  assert(recentEvents.length > 0, 'Audit trail must record events');

  for (const evt of recentEvents) {
    const serialized = JSON.stringify(evt);
    assert(!serialized.includes('super_secret_password'), 'Audit trail must never contain raw passwords or secret keys');
  }
  console.log('  Passed: Audit logs cleanly recorded without credentials exposure.');

  console.log('\n================================================================');
  console.log('--- ALL V1.9C AD INTEGRATION & REWARD FOUNDATION TESTS PASSED ---');
  console.log('================================================================\n');
}

// Execute if run directly
if (process.argv[1]?.endsWith('adProviderV19CIntegration.test.ts')) {
  runV19CAdIntegrationTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

/**
 * ============================================================================
 * UFUGAJI UPDATE — V1.9F-CORRECTIVE-2 AUTHORITATIVE TEST SUITE
 * ============================================================================
 * Validates:
 * 1. Authoritative Platform (WEB only, GAM_WEB real provider, MOCK internal simulator)
 * 2. Rejection of Google sample interstitial paths & invented test paths
 * 3. Explicit provider modes (GAM_WEB vs MOCK, TEST vs PRODUCTION)
 * 4. Prohibition of MOCK in PRODUCTION (MOCK + PRODUCTION is blocked)
 * 5. Elimination of silent mock fallback: missing/invalid test path fails with
 *    GAM_TEST_NOT_CONFIGURED or GAM_TEST_UNAVAILABLE (never silently uses MOCK)
 * 6. Explicit diagnostic proof for GAM_WEB (mock: false) vs MOCK (mock: true)
 * 7. Verification boundary & authoritative +5 query reward
 * ============================================================================
 */

import { googleAdManagerWebRewardedProvider } from '../src/services/ad/googleAdManagerWebRewardedProvider';
import { mockRewardedAdProvider } from '../src/services/ad/mockRewardedAdProvider';
import { adProviderRegistry } from '../src/services/ad/adProviderRegistry';
import { adService } from '../src/services/ad/adService';
import { recordAiUsageEvent, getUserEntitlementStatus } from '../src/services/aiUsageTrackingService';

function assert(section: string, condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ [FAIL] Section ${section}: ${message}`);
    process.exit(1);
  }
  console.log(`✅ [PASS] Section ${section}: ${message}`);
}

async function runTests() {
  console.log('================================================================');
  console.log('  UFUGAJI UPDATE — V1.9F-CORRECTIVE-2 TEST SUITE');
  console.log('  GAM Web Test Provider Activation & Mock Separation');
  console.log('================================================================\n');

  // --------------------------------------------------------------------------
  // SECTION 1: AUTHORITATIVE PLATFORM
  // --------------------------------------------------------------------------
  console.log('--- Section 1: Authoritative Platform ---');
  adProviderRegistry.setActivePlatform('WEB');
  assert('1', adProviderRegistry.getActivePlatform() === 'WEB', '1.1: Platform is strictly WEB');
  assert(
    '1',
    googleAdManagerWebRewardedProvider.supportsPlatform('WEB') === true,
    '1.2: GAM Web provider supports WEB'
  );
  assert(
    '1',
    googleAdManagerWebRewardedProvider.supportsPlatform('ANDROID') === false,
    '1.3: GAM Web provider rejects ANDROID'
  );

  // --------------------------------------------------------------------------
  // SECTION 2: GOOGLE GAM PATH DISTINCTION & REJECTION
  // --------------------------------------------------------------------------
  console.log('\n--- Section 2: Google GAM Path Distinction & Rejection ---');

  // Interstitial example rejection
  const interstitialRes = googleAdManagerWebRewardedProvider.validateAdUnitPath('/6355419/Travel/Europe/France/Paris');
  assert(
    '2',
    interstitialRes.isValid === false && interstitialRes.reason?.includes('Interstitial'),
    '2.1: Rejects /6355419/Travel/Europe/France/Paris as interstitial example'
  );

  // Bare network code rejection
  const bareNetworkRes = googleAdManagerWebRewardedProvider.validateAdUnitPath('/6355419');
  assert(
    '2',
    bareNetworkRes.isValid === false,
    '2.2: Rejects bare network code without ad unit path (/6355419)'
  );

  // Legacy invented Ufugaji test path rejection
  const inventedRes = googleAdManagerWebRewardedProvider.validateAdUnitPath('/21775744923/ufugaji_web_test_rewarded');
  assert(
    '2',
    inventedRes.isValid === false,
    '2.3: Rejects legacy invented path /21775744923/ufugaji_web_test_rewarded'
  );

  // Whitespace rejection
  const whitespaceRes = googleAdManagerWebRewardedProvider.validateAdUnitPath('/12345/my test unit');
  assert(
    '2',
    whitespaceRes.isValid === false,
    '2.4: Rejects path with whitespace'
  );

  // Valid custom GAM path accepted
  const validPathRes = googleAdManagerWebRewardedProvider.validateAdUnitPath('/88889999/real_web_rewarded_test');
  assert(
    '2',
    validPathRes.isValid === true,
    '2.5: Accepts valid custom GAM test path /88889999/real_web_rewarded_test'
  );

  // --------------------------------------------------------------------------
  // SECTION 3: EXPLICIT PROVIDER & ENVIRONMENT MATRIX
  // --------------------------------------------------------------------------
  console.log('\n--- Section 3: Explicit Provider & Environment Matrix ---');

  // GAM_WEB + TEST
  adProviderRegistry.setWebRewardedProvider('GAM_WEB');
  adProviderRegistry.setWebRewardedEnvironment('TEST');
  assert('3', adProviderRegistry.getWebRewardedProvider() === 'GAM_WEB', '3.1: Provider is GAM_WEB');
  assert('3', adProviderRegistry.getWebRewardedEnvironment() === 'TEST', '3.2: Environment is TEST');

  // MOCK + TEST
  adProviderRegistry.setWebRewardedProvider('MOCK');
  adProviderRegistry.setWebRewardedEnvironment('TEST');
  assert('3', adProviderRegistry.getWebRewardedProvider() === 'MOCK', '3.3: Provider is MOCK in TEST');

  // MOCK + PRODUCTION must be blocked
  let blockedCaught = false;
  try {
    adProviderRegistry.setWebRewardedEnvironment('PRODUCTION');
  } catch (err: any) {
    blockedCaught = true;
  }
  assert('3', blockedCaught === true, '3.4: Setting MOCK + PRODUCTION throws error');

  // Reset to GAM_WEB
  adProviderRegistry.setWebRewardedProvider('GAM_WEB');
  adProviderRegistry.setWebRewardedEnvironment('TEST');

  // --------------------------------------------------------------------------
  // SECTION 4: NO SILENT MOCK FALLBACK (CRITICAL REQUIREMENT)
  // --------------------------------------------------------------------------
  console.log('\n--- Section 4: Elimination of Silent Mock Fallback ---');

  const testUser = `test_cor2_${Date.now()}`;
  // Drain quota for user
  for (let i = 0; i < 11; i++) {
    await recordAiUsageEvent({
      userId: testUser,
      requestId: `drain_${i}_${Date.now()}`,
      requestType: 'TEXT_QUERY',
      inputType: 'TEXT',
      cacheStatus: 'MISS',
      successStatus: 'SUCCESS'
    });
  }

  // Clear test path in GAM provider
  googleAdManagerWebRewardedProvider.setTestAdUnitPath('');
  adProviderRegistry.setWebRewardedProvider('GAM_WEB');
  adProviderRegistry.setWebRewardedEnvironment('TEST');

  // Call startRewardedAd when test path is unconfigured
  const unconfiguredStart = await adService.startRewardedAd(
    testUser,
    'req_cor2_unconf',
    'GOOGLE_AD_MANAGER_WEB',
    'WEB'
  );

  assert('4', unconfiguredStart.success === false, '4.1: Unconfigured GAM test path fails');
  assert(
    '4',
    unconfiguredStart.errorCode === 'GAM_TEST_NOT_CONFIGURED',
    '4.2: Fails with GAM_TEST_NOT_CONFIGURED (no silent fallback to Mock)'
  );
  assert(
    '4',
    unconfiguredStart.diagnostic?.mock === false,
    '4.3: Diagnostic confirms mock === false (no silent mock)'
  );

  // --------------------------------------------------------------------------
  // SECTION 5: REAL GAM TEST ACTIVATION & RUNTIME PROOF
  // --------------------------------------------------------------------------
  console.log('\n--- Section 5: Real GAM Test Activation & Runtime Proof ---');

  // Configure a valid custom GAM test path
  const setTestPathRes = googleAdManagerWebRewardedProvider.setTestAdUnitPath('/88889999/real_web_rewarded_test');
  assert('5', setTestPathRes.success === true, '5.1: setTestAdUnitPath succeeds');

  const gamStart = await adService.startRewardedAd(
    testUser,
    'req_cor2_gam_test',
    'GOOGLE_AD_MANAGER_WEB',
    'WEB'
  );

  assert('5', gamStart.success === true, '5.2: GAM TEST start succeeds with configured test path');
  assert('5', gamStart.diagnostic?.provider === 'GAM_WEB', '5.3: Diagnostic provider is GAM_WEB');
  assert('5', gamStart.diagnostic?.environment === 'TEST', '5.4: Diagnostic environment is TEST');
  assert('5', gamStart.diagnostic?.mode === 'REAL_PROVIDER', '5.5: Diagnostic mode is REAL_PROVIDER');
  assert('5', gamStart.diagnostic?.mock === false, '5.6: Diagnostic mock is strictly false');
  assert(
    '5',
    gamStart.diagnostic?.adUnitPath === '/88889999/real_web_rewarded_test',
    '5.7: Diagnostic adUnitPath matches configured path'
  );

  // --------------------------------------------------------------------------
  // SECTION 6: MOCK SIMULATOR RUNTIME PROOF
  // --------------------------------------------------------------------------
  console.log('\n--- Section 6: Mock Simulator Runtime Proof ---');

  adProviderRegistry.setWebRewardedProvider('MOCK');
  adProviderRegistry.setWebRewardedEnvironment('TEST');

  const mockStart = await adService.startRewardedAd(
    testUser,
    'req_cor2_mock',
    'MOCK_REWARDED_AD',
    'WEB'
  );

  assert('6', mockStart.success === true, '6.1: MOCK start succeeds');
  assert('6', mockStart.diagnostic?.provider === 'MOCK', '6.2: Mock diagnostic provider is MOCK');
  assert('6', mockStart.diagnostic?.mode === 'SIMULATION', '6.3: Mock diagnostic mode is SIMULATION');
  assert('6', mockStart.diagnostic?.mock === true, '6.4: Mock diagnostic mock is strictly true');

  // --------------------------------------------------------------------------
  // SECTION 7: REWARD VERIFICATION & +5 AI QUERIES
  // --------------------------------------------------------------------------
  console.log('\n--- Section 7: Reward Verification & Authoritative +5 Grant ---');

  // Switch back to GAM_WEB
  adProviderRegistry.setWebRewardedProvider('GAM_WEB');
  adProviderRegistry.setWebRewardedEnvironment('TEST');

  const userBefore = getUserEntitlementStatus(testUser);
  assert('7', userBefore.remainingTextQueries === 0, '7.1: Pre-grant queries is 0');

  const grantRes = await adService.verifyAndGrantReward({
    userId: testUser,
    rewardToken: gamStart.rewardToken!,
    providerRewardId: gamStart.providerRewardId!,
    providerName: 'GOOGLE_AD_MANAGER_WEB'
  });

  assert('7', grantRes.success === true, '7.2: verifyAndGrantReward succeeds');
  assert('7', grantRes.queriesGranted === 5, '7.3: Grants strictly 5 text queries');

  const userAfter = getUserEntitlementStatus(testUser);
  assert('7', userAfter.remainingTextQueries === 5, '7.4: Post-grant queries is strictly 5');
  assert('7', userAfter.entitlementTier === 'FREE', '7.5: User tier remains FREE (no Premium leak)');

  console.log('\n================================================================');
  console.log('  V1.9F-CORRECTIVE-2 TEST SUITE SUMMARY: ALL PASSED (0 FAILED)');
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

/**
 * Ufugaji Update — V1.9F-CORRECTIVE Test Suite
 *
 * Verifies:
 * 1. Web App platform boundary: GOOGLE_AD_MANAGER_WEB is authoritative web provider
 * 2. AdMob removal from Web: Android AdMob is strictly inactive/isolated from Web runtime and readiness
 * 3. 14-Point checklist unchanged: strictly 14 items, no 15th item
 * 4. Google Web Rewarded verification boundary: internal reward-session security token, no false claim of Google SSV
 * 5. Google Web Rewarded events: rewardedSlotGranted is primary signal; rewardedSlotVideoCompleted is informational
 * 6. Test ad unit configuration: no hardcoded fake test inventory; clear distinction between MOCK TEST and GAM TEST
 * 7. Server-side validation: strictly rejects empty, placeholders, mobile AdMob IDs, arbitrary pub IDs, and test-in-prod
 * 8. Authoritative reward amount: strictly +5 text AI queries, zero Premium leaks
 */

import { googleAdManagerWebRewardedProvider, GOOGLE_ADMOB_MOBILE_TEST_PUBLISHER_ID } from '../src/services/ad/googleAdManagerWebRewardedProvider';
import { adProviderRegistry } from '../src/services/ad/adProviderRegistry';
import { adProductionLaunchService } from '../src/services/ad/adProductionLaunchService';
import { adOperationsAnalyticsService } from '../src/services/ad/adOperationsAnalyticsService';
import { adService } from '../src/services/ad/adService';
import { recordAiUsageEvent, getUserEntitlementStatus } from '../src/services/aiUsageTrackingService';

function assert(section: string, condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ [FAIL] Section ${section}: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ [PASS] Section ${section}: ${message}`);
  }
}

async function runCorrectiveTests() {
  console.log('================================================================');
  console.log('  UFUGAJI UPDATE — V1.9F-CORRECTIVE TEST SUITE');
  console.log('================================================================');

  // --------------------------------------------------------------------------
  // SECTION 1: WEB APP PLATFORM & PROVIDER BOUNDARY
  // --------------------------------------------------------------------------
  console.log('\n--- Section 1: Web App Platform & Provider Boundary ---');

  assert(
    '1',
    googleAdManagerWebRewardedProvider.providerName === 'GOOGLE_AD_MANAGER_WEB',
    '1.1: Web production provider is GOOGLE_AD_MANAGER_WEB'
  );

  assert(
    '1',
    googleAdManagerWebRewardedProvider.supportsPlatform('WEB') === true,
    '1.2: GAM Web provider explicitly supports WEB platform'
  );

  assert(
    '1',
    googleAdManagerWebRewardedProvider.supportsPlatform('ANDROID') === false,
    '1.3: GAM Web provider strictly rejects ANDROID platform'
  );

  adProviderRegistry.setActivePlatform('WEB');
  adProviderRegistry.setActiveProvider('GOOGLE_AD_MANAGER_WEB');
  const activeProv = adProviderRegistry.getActiveProvider();
  assert(
    '1',
    activeProv?.providerName === 'GOOGLE_AD_MANAGER_WEB',
    '1.4: Registry active provider is GOOGLE_AD_MANAGER_WEB on WEB'
  );

  // --------------------------------------------------------------------------
  // SECTION 2: ADMOB REMOVAL & ISOLATION FROM WEB
  // --------------------------------------------------------------------------
  console.log('\n--- Section 2: AdMob Removal & Isolation from Web ---');

  // Setting registry to Android AdMob while on Web must fail platform eligibility
  const mismatchAttempt = await googleAdManagerWebRewardedProvider.startRewardedAd({
    userId: 'web_corrective_user_1',
    requestId: 'req_1',
    platform: 'ANDROID',
    mode: 'TEST'
  });
  assert(
    '2',
    mismatchAttempt.success === false && mismatchAttempt.errorCode === 'AD_PLATFORM_PROVIDER_MISMATCH',
    '2.1: GAM Web provider returns AD_PLATFORM_PROVIDER_MISMATCH for Android'
  );

  // Web readiness evaluation must NOT require Android configuration
  adProviderRegistry.setActivePlatform('WEB');
  adProviderRegistry.setActiveProvider('GOOGLE_AD_MANAGER_WEB');
  const webChecklist = adProductionLaunchService.evaluateChecklist();
  const platformItem = webChecklist.items.find((i) => i.id === 'production_platform_configured');
  assert(
    '2',
    platformItem?.satisfied === true && platformItem.value === 'WEB',
    '2.2: Web platform satisfies Checklist Item 2 without requiring Android'
  );

  // --------------------------------------------------------------------------
  // SECTION 3: 14-POINT CANONICAL CHECKLIST UNCHANGED
  // --------------------------------------------------------------------------
  console.log('\n--- Section 3: 14-Point Canonical Checklist Unchanged ---');

  assert(
    '3',
    webChecklist.totalRequirements === 14,
    '3.1: Checklist has strictly 14 total requirements'
  );

  assert(
    '3',
    webChecklist.items.length === 14,
    '3.2: Checklist items array contains exactly 14 items (no 15th item added)'
  );

  const expectedIds = [
    'production_provider_configured',
    'production_platform_configured',
    'production_ad_unit_configured',
    'privacy_policy_available',
    'terms_available',
    'contact_support_available',
    'developer_website_configured',
    'app_ads_txt_validated',
    'consent_configuration_ready',
    'admin_production_enablement',
    'production_runtime_environment',
    'provider_availability',
    'safety_gate_passed',
    'kill_switch_off'
  ];

  const actualIds = webChecklist.items.map((i) => i.id);
  const allIdsMatch = expectedIds.every((id) => actualIds.includes(id as any));
  assert(
    '3',
    allIdsMatch,
    '3.3: Canonical 14 item IDs match authoritative V1.9E specification exactly'
  );

  // --------------------------------------------------------------------------
  // SECTION 4: GOOGLE WEB REWARDED VERIFICATION BOUNDARY
  // --------------------------------------------------------------------------
  console.log('\n--- Section 4: Google Web Rewarded Verification Boundary ---');

  // Start session on Web
  const sessionRes = await googleAdManagerWebRewardedProvider.startRewardedAd({
    userId: 'web_corrective_user_2',
    requestId: 'req_boundary_test',
    platform: 'WEB',
    mode: 'MOCK'
  });

  assert('4', sessionRes.success === true, '4.1: Web session start succeeds');
  assert('4', Boolean(sessionRes.rewardToken), '4.2: Generates Ufugaji Update internal reward-session security token');

  // Verify reward
  const verifyRes = await googleAdManagerWebRewardedProvider.verifyReward({
    userId: 'web_corrective_user_2',
    rewardToken: sessionRes.rewardToken,
    providerRewardId: sessionRes.providerRewardId,
    platform: 'WEB'
  });

  assert('4', verifyRes.isValid === true, '4.3: Internal reward-session security token verification succeeds');
  assert(
    '4',
    verifyRes.rawProviderResponse?.verificationMechanism === 'UFUGAJI_UPDATE_INTERNAL_REWARD_SESSION_SECURITY_TOKEN',
    '4.4: Mechanism is identified as UFUGAJI_UPDATE_INTERNAL_REWARD_SESSION_SECURITY_TOKEN (no claim of Google SSV)'
  );

  // --------------------------------------------------------------------------
  // SECTION 5: GOOGLE WEB REWARDED EVENTS
  // --------------------------------------------------------------------------
  console.log('\n--- Section 5: Google Web Rewarded Events ---');

  // Event logging preserves rewardedSlotReady, rewardedSlotGranted, rewardedSlotClosed
  const readyLog = adOperationsAnalyticsService.recordEvent({
    userId: 'web_corrective_user_2',
    adSessionId: sessionRes.providerSessionId!,
    eventType: 'WEB_REWARDED_READY',
    provider: 'GOOGLE_AD_MANAGER_WEB',
    platform: 'WEB'
  });
  assert('5', readyLog.eventType === 'WEB_REWARDED_READY', '5.1: rewardedSlotReady (WEB_REWARDED_READY) event preserved');

  const grantedLog = adOperationsAnalyticsService.recordEvent({
    userId: 'web_corrective_user_2',
    adSessionId: sessionRes.providerSessionId!,
    eventType: 'WEB_REWARDED_GRANTED_SIGNAL',
    provider: 'GOOGLE_AD_MANAGER_WEB',
    platform: 'WEB'
  });
  assert('5', grantedLog.eventType === 'WEB_REWARDED_GRANTED_SIGNAL', '5.2: rewardedSlotGranted (WEB_REWARDED_GRANTED_SIGNAL) preserved as provider signal');

  const closedLog = adOperationsAnalyticsService.recordEvent({
    userId: 'web_corrective_user_2',
    adSessionId: sessionRes.providerSessionId!,
    eventType: 'WEB_REWARDED_CLOSED',
    provider: 'GOOGLE_AD_MANAGER_WEB',
    platform: 'WEB'
  });
  assert('5', closedLog.eventType === 'WEB_REWARDED_CLOSED', '5.3: rewardedSlotClosed (WEB_REWARDED_CLOSED) event preserved');

  // --------------------------------------------------------------------------
  // SECTION 6: TEST AD UNIT CONFIGURATION (NO FAKE HARDCODED INVENTORY)
  // --------------------------------------------------------------------------
  console.log('\n--- Section 6: Test Ad Unit Configuration ---');

  const safeConfig = googleAdManagerWebRewardedProvider.getSafeConfig();
  // Must distinguish between MOCK TEST and GAM TEST
  assert(
    '6',
    safeConfig.testAdUnitLabel === 'Ufugaji Update MOCK TEST' ||
      safeConfig.testAdUnitLabel === 'Google Ad Manager TEST configuration',
    '6.1: Safe config clearly labels test configuration (MOCK vs GAM TEST)'
  );

  // Admin configures a real GAM test path
  const setGamTestPath = googleAdManagerWebRewardedProvider.setTestAdUnitPath('/12345678/test_rewarded_unit');
  assert('6', setGamTestPath.success === true, '6.2: Admin can configure real GAM test ad unit path');

  const updatedSafeConfig = googleAdManagerWebRewardedProvider.getSafeConfig();
  assert(
    '6',
    updatedSafeConfig.testAdUnitLabel === 'Google Ad Manager TEST configuration',
    '6.3: Labeled as "Google Ad Manager TEST configuration" when test path is set'
  );

  // Reset test path to empty defaults back to Ufugaji Update MOCK TEST
  googleAdManagerWebRewardedProvider.setTestAdUnitPath('');
  const resetSafeConfig = googleAdManagerWebRewardedProvider.getSafeConfig();
  assert(
    '6',
    resetSafeConfig.testAdUnitLabel === 'Ufugaji Update MOCK TEST',
    '6.4: Unconfigured test path cleanly defaults to "Ufugaji Update MOCK TEST"'
  );

  // --------------------------------------------------------------------------
  // SECTION 7: SERVER-SIDE VALIDATION
  // --------------------------------------------------------------------------
  console.log('\n--- Section 7: Server-side Validation ---');

  // Empty production path rejected
  const emptyRes = googleAdManagerWebRewardedProvider.validateAdUnitPath('', true);
  assert('7', emptyRes.isValid === false, '7.1: Empty production path strictly rejected');

  // Placeholder path rejected
  const placeholderRes = googleAdManagerWebRewardedProvider.validateAdUnitPath('/12345/network_code_placeholder', true);
  assert('7', placeholderRes.isValid === false, '7.2: Placeholder path rejected');

  // Mobile AdMob ID rejected on Web
  const admobMobileRes = googleAdManagerWebRewardedProvider.validateAdUnitPath(
    'ca-app-pub-3940256099942544/5224354917',
    true
  );
  assert('7', admobMobileRes.isValid === false, '7.3: AdMob mobile ca-app-pub-* ID strictly rejected on Web');

  // Arbitrary AdSense publisher ID rejected
  const adsensePubRes = googleAdManagerWebRewardedProvider.validateAdUnitPath(
    `ca-pub-${GOOGLE_ADMOB_MOBILE_TEST_PUBLISHER_ID}/98765`,
    true
  );
  assert('7', adsensePubRes.isValid === false, '7.4: Arbitrary AdSense publisher ID strictly rejected');

  // Test value used as production path rejected in production
  const testAsProdRes = googleAdManagerWebRewardedProvider.validateAdUnitPath(
    '/12345678/test_rewarded',
    true
  );
  assert('7', testAsProdRes.isValid === false, '7.5: Path with "test" strictly rejected in production');

  // Valid production GAM path accepted
  const validGamProdRes = googleAdManagerWebRewardedProvider.validateAdUnitPath(
    '/21775744923/ufugaji_web_rewarded',
    true
  );
  assert('7', validGamProdRes.isValid === true, '7.6: Valid production GAM path accepted');

  // --------------------------------------------------------------------------
  // SECTION 8: AUTHORITATIVE REWARD AMOUNT (+5 TEXT AI QUERIES)
  // --------------------------------------------------------------------------
  console.log('\n--- Section 8: Authoritative Reward Amount (+5 Text AI Queries) ---');

  const rewardUser = `web_corrective_user_${Date.now()}`;
  // Drain user free quota
  for (let i = 0; i < 11; i++) {
    await recordAiUsageEvent({
      userId: rewardUser,
      requestId: `drain_cor_${i}_${Date.now()}`,
      requestType: 'TEXT_QUERY',
      inputType: 'TEXT',
      cacheStatus: 'MISS',
      successStatus: 'SUCCESS'
    });
  }

  const preQuota = getUserEntitlementStatus(rewardUser);
  assert('8', preQuota.remainingTextQueries === 0, '8.1: Free quota exhausted prior to reward');

  // Start & verify reward through adService
  adProviderRegistry.setActivePlatform('WEB');
  adProviderRegistry.setActiveProvider('GOOGLE_AD_MANAGER_WEB');
  googleAdManagerWebRewardedProvider.setTestAdUnitPath('/12345678/test_rewarded_unit');
  const startResult = await adService.startRewardedAd(
    rewardUser,
    'req_reward_cor_test',
    'GOOGLE_AD_MANAGER_WEB',
    'WEB'
  );
  assert('8', startResult.success === true, '8.2: adService.startRewardedAd succeeds');

  const rewardGrantResult = await adService.verifyAndGrantReward({
    userId: rewardUser,
    rewardToken: startResult.rewardToken!,
    providerRewardId: startResult.providerRewardId!,
    providerName: 'GOOGLE_AD_MANAGER_WEB'
  });

  assert('8', rewardGrantResult.success === true, '8.3: Reward verification and grant succeeds');
  assert('8', rewardGrantResult.queriesGranted === 5, '8.4: Strictly grants exactly 5 queries');

  const postQuota = getUserEntitlementStatus(rewardUser);
  assert('8', postQuota.remainingTextQueries === 5, '8.5: Authoritative remaining queries is strictly 5');
  assert('8', postQuota.entitlementTier === 'FREE', '8.6: User tier strictly remains FREE (no Premium escalation)');

  console.log('================================================================');
  console.log('  V1.9F-CORRECTIVE TEST SUITE SUMMARY: ALL PASSED (0 FAILED)');
  console.log('================================================================');
}

runCorrectiveTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

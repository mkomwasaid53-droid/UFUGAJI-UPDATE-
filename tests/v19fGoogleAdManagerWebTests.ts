/**
 * Ufugaji Update — V1.9F Web Rewarded Ads & Google Ad Manager Integration Tests
 *
 * Validates the corrective architecture for Web Rewarded Ads using Google Ad Manager (GPT):
 * 1. Google Ad Manager Web Rewarded Provider Initialization & Platform Support
 * 2. Strict GAM Ad Unit Path Validation (Rejects mobile AdMob test units & fake publisher IDs)
 * 3. Platform Separation Enforced: WEB + GAM = Supported; WEB + Android AdMob = Rejected
 * 4. Web Rewarded Session Lifecycle & GPT Out-of-Page Format Support
 * 5. Event-Driven Lifecycle Handling (rewardedSlotReady, rewardedSlotGranted, etc.)
 * 6. Server-Authoritative Reward Verification & Strict +5 Text Query Allowance
 * 7. Replay Protection & Duplicate Rejection
 * 8. Production Launch Checklist & Safety Gate Integration for Web
 * 9. Non-Regression of Core Systems (Free Quota, Premium, Marketplace, Daktari, Cache)
 */

import {
  googleAdManagerWebRewardedProvider,
  GoogleAdManagerWebRewardedProvider,
  GOOGLE_ADMOB_MOBILE_TEST_PUBLISHER_ID
} from '../src/services/ad/googleAdManagerWebRewardedProvider.js';
import { adProviderRegistry } from '../src/services/ad/adProviderRegistry.js';
import { adComplianceService } from '../src/services/ad/adComplianceService.js';
import { adService } from '../src/services/ad/adService.js';
import { adOperationsAnalyticsService } from '../src/services/ad/adOperationsAnalyticsService.js';
import { adProductionLaunchService } from '../src/services/ad/adProductionLaunchService.js';
import {
  getUserEntitlementStatus,
  grantAuthoritativeAdRewardAllowance,
  recordAiUsageEvent
} from '../src/services/aiUsageTrackingService.js';
import { getAllPremiumPlans } from '../src/services/aiPremiumSubscriptionService.js';
import { assessCacheEligibility } from '../src/services/aiAnswerCacheService.js';
import { executeStructuredMarketplaceProductQuery } from '../src/services/marketplaceRecommendationService.js';
import { searchDaktariProfessionalsSync, buildDaktariQuery } from '../src/services/aiDaktariLoopService.js';

interface TestResult {
  section: string;
  name: string;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];

function assert(section: string, condition: boolean, name: string, details?: string) {
  results.push({ section, name, passed: Boolean(condition), details });
  if (!condition) {
    console.error(`❌ [FAIL] Section ${section}: ${name}${details ? ` - ${details}` : ''}`);
  } else {
    console.log(`✅ [PASS] Section ${section}: ${name}`);
  }
}

async function runTestSuite() {
  console.log('================================================================');
  console.log('  UFUGAJI UPDATE — V1.9F WEB REWARDED ADS TEST SUITE (GAM / GPT)');
  console.log('================================================================\n');

  process.env.ALLOW_PROD_TEST = 'true';

  // Pristine reset
  adProductionLaunchService.resetForTesting();
  adOperationsAnalyticsService.resetForTesting();
  adProviderRegistry.resetForTesting();
  adService.setKillSwitch(false, 'test_runner');

  // --------------------------------------------------------------------------
  // SECTION 1: PROVIDER INITIALIZATION & PLATFORM SUPPORT
  // --------------------------------------------------------------------------
  console.log('--- Section 1: GAM Web Provider Initialization & Platform Support ---');

  assert(
    '1',
    googleAdManagerWebRewardedProvider.providerName === 'GOOGLE_AD_MANAGER_WEB',
    '1.1: Provider name is GOOGLE_AD_MANAGER_WEB'
  );

  assert(
    '1',
    googleAdManagerWebRewardedProvider.supportedPlatforms.includes('WEB'),
    '1.2: Declares WEB platform support'
  );

  assert(
    '1',
    googleAdManagerWebRewardedProvider.supportsPlatform('WEB') === true,
    '1.3: supportsPlatform(WEB) is true'
  );

  assert(
    '1',
    googleAdManagerWebRewardedProvider.supportsPlatform('ANDROID') === false,
    '1.4: supportsPlatform(ANDROID) is false (Web only)'
  );

  const safeConfig = googleAdManagerWebRewardedProvider.getSafeConfig();
  assert(
    '1',
    safeConfig.gptScriptUrl === 'https://securepubads.g.doubleclick.net/tag/js/gpt.js',
    '1.5: Config exposes official GPT script URL'
  );
  assert(
    '1',
    safeConfig.format === 'googletag.enums.OutOfPageFormat.REWARDED',
    '1.6: Config specifies official OutOfPageFormat.REWARDED'
  );

  // --------------------------------------------------------------------------
  // SECTION 2: AD UNIT PATH VALIDATION & ADMOB MOBILE ID REJECTION
  // --------------------------------------------------------------------------
  console.log('\n--- Section 2: Ad Unit Path Validation (No Mobile AdMob on Web) ---');

  // 2.1 Rejects empty or undefined
  const emptyRes = googleAdManagerWebRewardedProvider.validateAdUnitPath('', false);
  assert('2', !emptyRes.isValid, '2.1: Empty ad unit path is rejected');

  // 2.2 Rejects official Android AdMob test ad unit
  const adMobMobileRes = googleAdManagerWebRewardedProvider.validateAdUnitPath(
    'ca-app-pub-3940256099942544/5224354917',
    false
  );
  assert(
    '2',
    !adMobMobileRes.isValid && adMobMobileRes.reason?.includes('Google AdMob ya Mobile App'),
    '2.2: Mobile AdMob ad unit ID strictly rejected on Web'
  );

  // 2.3 Rejects AdMob publisher ID
  const adMobPubRes = googleAdManagerWebRewardedProvider.validateAdUnitPath(
    `ca-pub-${GOOGLE_ADMOB_MOBILE_TEST_PUBLISHER_ID}/12345`,
    false
  );
  assert('2', !adMobPubRes.isValid, '2.3: Mobile AdMob publisher ID strictly rejected');

  // 2.4 Rejects path without leading slash
  const noSlashRes = googleAdManagerWebRewardedProvider.validateAdUnitPath('21775744923/rewarded', false);
  assert('2', !noSlashRes.isValid, '2.4: Path missing leading slash rejected');

  // 2.5 Rejects placeholder in production mode
  const placeholderRes = googleAdManagerWebRewardedProvider.validateAdUnitPath(
    '/12345/network_code_placeholder',
    true
  );
  assert('2', !placeholderRes.isValid, '2.5: Dummy placeholder path rejected in production');

  // 2.6 Accepts valid Google Ad Manager network path
  const validGamPath = '/21775744923/ufugaji_web_rewarded';
  const validRes = googleAdManagerWebRewardedProvider.validateAdUnitPath(validGamPath, true);
  assert('2', validRes.isValid, '2.6: Valid Google Ad Manager ad unit path accepted');

  // 2.7 Setter updates internal path
  const setRes = googleAdManagerWebRewardedProvider.setWebRewardedAdUnitPath(validGamPath);
  assert('2', setRes.success, '2.7: setWebRewardedAdUnitPath succeeds with valid path');
  assert(
    '2',
    googleAdManagerWebRewardedProvider.getWebRewardedAdUnitPath() === validGamPath,
    '2.8: Stored GAM ad unit path matches configured path'
  );

  // --------------------------------------------------------------------------
  // SECTION 3: PLATFORM SEPARATION IN REGISTRY & AD SERVICE
  // --------------------------------------------------------------------------
  console.log('\n--- Section 3: Platform Separation in Registry & AdService ---');

  const testUser = `web_gam_user_${Date.now()}`;

  // Drain free quota so user is eligible for rewarded ads
  for (let i = 0; i < 12; i++) {
    await recordAiUsageEvent({
      userId: testUser,
      requestId: `drain_${i}_${Date.now()}`,
      requestType: 'TEXT_QUERY',
      inputType: 'TEXT',
      cacheStatus: 'MISS',
      successStatus: 'SUCCESS'
    });
  }

  // 3.1 On WEB platform, setting provider to GOOGLE_ADMOB fails platform match
  adProviderRegistry.setActivePlatform('WEB');
  adProviderRegistry.setActiveProvider('GOOGLE_ADMOB');
  const admobOnWeb = adService.checkEligibility(testUser);
  assert('3', admobOnWeb.eligible === false, '3.1: Android AdMob is ineligible on Web platform');
  assert(
    '3',
    admobOnWeb.errorCode === 'AD_PLATFORM_MISMATCH',
    '3.2: Returns AD_PLATFORM_MISMATCH when Android AdMob selected for Web'
  );

  // 3.2 On WEB platform, setting provider to GOOGLE_AD_MANAGER_WEB is compatible
  adProviderRegistry.setActiveProvider('GOOGLE_AD_MANAGER_WEB');
  adProviderRegistry.setActiveMode('MOCK');
  const gamOnWeb = adService.checkEligibility(testUser);
  assert('3', gamOnWeb.eligible === true, '3.3: GOOGLE_AD_MANAGER_WEB is eligible on Web platform');
  assert(
    '3',
    gamOnWeb.activeProviderName === 'GOOGLE_AD_MANAGER_WEB',
    '3.4: Active provider reported as GOOGLE_AD_MANAGER_WEB'
  );

  // 3.3 Starting GAM ad on ANDROID platform fails
  const androidAttempt = await googleAdManagerWebRewardedProvider.startRewardedAd({
    userId: testUser,
    platform: 'ANDROID',
    mode: 'MOCK',
    consentStatus: 'GRANTED'
  });
  assert('3', !androidAttempt.success, '3.5: GAM Web provider rejects Android platform');
  assert(
    '3',
    androidAttempt.errorCode === 'AD_PLATFORM_PROVIDER_MISMATCH',
    '3.6: Returns AD_PLATFORM_PROVIDER_MISMATCH for Android'
  );

  // --------------------------------------------------------------------------
  // SECTION 4: WEB REWARDED SESSION START & TOKEN GENERATION
  // --------------------------------------------------------------------------
  console.log('\n--- Section 4: Web Rewarded Session Start ---');

  const startResult = await adService.startRewardedAd(
    testUser,
    `gam_req_${Date.now()}`,
    'GOOGLE_AD_MANAGER_WEB',
    'WEB'
  );

  assert('4', startResult.success === true, '4.1: startRewardedAd succeeds on Web with GAM');
  assert('4', Boolean(startResult.rewardId), '4.2: Generates server-authoritative rewardId');
  assert('4', Boolean(startResult.providerSessionId), '4.3: Generates providerSessionId');
  assert('4', Boolean(startResult.providerRewardId), '4.4: Generates providerRewardId');
  assert('4', Boolean(startResult.rewardToken), '4.5: Generates cryptographic rewardToken');
  assert('4', startResult.platform === 'WEB', '4.6: Session platform is WEB');
  assert('4', startResult.adProvider === 'GOOGLE_AD_MANAGER_WEB', '4.7: Provider is GOOGLE_AD_MANAGER_WEB');

  // --------------------------------------------------------------------------
  // SECTION 5: EVENT-DRIVEN GPT LIFECYCLE OBSERVABILITY
  // --------------------------------------------------------------------------
  console.log('\n--- Section 5: GPT Event-Driven Lifecycle Handling ---');

  // Record simulated GPT web rewarded signals
  const gptReadyEvent = adOperationsAnalyticsService.recordEvent({
    userId: testUser,
    adSessionId: startResult.providerSessionId!,
    eventType: 'WEB_REWARDED_READY',
    provider: 'GOOGLE_AD_MANAGER_WEB',
    platform: 'WEB'
  });
  assert('5', gptReadyEvent.eventType === 'WEB_REWARDED_READY', '5.1: WEB_REWARDED_READY recorded');

  const gptShownEvent = adOperationsAnalyticsService.recordEvent({
    userId: testUser,
    adSessionId: startResult.providerSessionId!,
    eventType: 'WEB_REWARDED_SHOWN',
    provider: 'GOOGLE_AD_MANAGER_WEB',
    platform: 'WEB'
  });
  assert('5', gptShownEvent.eventType === 'WEB_REWARDED_SHOWN', '5.2: WEB_REWARDED_SHOWN recorded');

  const gptGrantedSignal = adOperationsAnalyticsService.recordEvent({
    userId: testUser,
    adSessionId: startResult.providerSessionId!,
    eventType: 'WEB_REWARDED_GRANTED_SIGNAL',
    provider: 'GOOGLE_AD_MANAGER_WEB',
    platform: 'WEB'
  });
  assert('5', gptGrantedSignal.eventType === 'WEB_REWARDED_GRANTED_SIGNAL', '5.3: WEB_REWARDED_GRANTED_SIGNAL recorded');

  const gptClosedEvent = adOperationsAnalyticsService.recordEvent({
    userId: testUser,
    adSessionId: startResult.providerSessionId!,
    eventType: 'WEB_REWARDED_CLOSED',
    provider: 'GOOGLE_AD_MANAGER_WEB',
    platform: 'WEB'
  });
  assert('5', gptClosedEvent.eventType === 'WEB_REWARDED_CLOSED', '5.4: WEB_REWARDED_CLOSED recorded');

  // --------------------------------------------------------------------------
  // SECTION 6: SERVER-AUTHORITATIVE REWARD VERIFICATION & QUOTA GRANT
  // --------------------------------------------------------------------------
  console.log('\n--- Section 6: Server Verification & Authoritative +5 Grant ---');

  const beforeEntitlement = getUserEntitlementStatus(testUser);
  assert('6', beforeEntitlement.remainingTextQueries === 0, '6.1: User has 0 remaining text queries prior to verification');

  const verifyResult = await adService.verifyAndGrantReward({
    userId: testUser,
    rewardToken: startResult.rewardToken!,
    providerRewardId: startResult.providerRewardId!,
    providerName: 'GOOGLE_AD_MANAGER_WEB'
  });

  assert('6', verifyResult.success === true, '6.2: Reward verification succeeds');
  assert('6', verifyResult.queriesGranted === 5, '6.3: Strictly grants exactly 5 text queries');

  const afterEntitlement = getUserEntitlementStatus(testUser);
  assert(
    '6',
    afterEntitlement.remainingTextQueries === 5,
    '6.4: Authoritative user store now has exactly 5 text queries'
  );
  assert('6', afterEntitlement.entitlementTier === 'FREE', '6.5: User remains FREE tier (no Premium leak)');

  // --------------------------------------------------------------------------
  // SECTION 7: REPLAY PROTECTION (DUPLICATE REJECTION)
  // --------------------------------------------------------------------------
  console.log('\n--- Section 7: Replay Protection ---');

  const replayAttempt = await adService.verifyAndGrantReward({
    userId: testUser,
    rewardToken: startResult.rewardToken!,
    providerRewardId: startResult.providerRewardId!,
    providerName: 'GOOGLE_AD_MANAGER_WEB'
  });

  assert('7', replayAttempt.success === false, '7.1: Replay attempt is rejected');
  assert('7', replayAttempt.isDuplicate === true, '7.2: isDuplicate flag is true');
  assert('7', replayAttempt.errorCode === 'AD_REWARD_DUPLICATE', '7.3: Error code is AD_REWARD_DUPLICATE');

  const afterReplayEntitlement = getUserEntitlementStatus(testUser);
  assert(
    '7',
    afterReplayEntitlement.remainingTextQueries === 5,
    '7.4: No additional queries granted on replay (strictly 5 total)'
  );

  // --------------------------------------------------------------------------
  // SECTION 8: PRODUCTION LAUNCH CHECKLIST & SAFETY GATE FOR WEB
  // --------------------------------------------------------------------------
  console.log('\n--- Section 8: Production Checklist Integration for Web ---');

  // 8.1 Validating production ad unit on WEB rejects AdMob mobile format
  const webAdMobReject = adProductionLaunchService.validateProductionAdUnit(
    'ca-app-pub-8765432109876543/1234567890',
    'WEB'
  );
  assert(
    '8',
    !webAdMobReject.isValid && webAdMobReject.reason?.includes('Google Ad Manager'),
    '8.1: Web production validation rejects mobile ca-app-pub ID'
  );

  // 8.2 Validating GAM format on WEB succeeds
  const webGamAccept = adProductionLaunchService.validateProductionAdUnit(
    '/21775744923/ufugaji_web_rewarded',
    'WEB'
  );
  assert('8', webGamAccept.isValid === true, '8.2: Web production validation accepts GAM path');

  // 8.3 Setting production ad unit on WEB
  const setGamProdRes = adProductionLaunchService.setProductionAdUnitId(
    '/21775744923/ufugaji_web_rewarded',
    'admin'
  );
  assert('8', setGamProdRes.success === true, '8.3: setProductionAdUnitId succeeds for Web GAM path');

  // 8.4 Evaluate checklist on Web
  adProviderRegistry.setActivePlatform('WEB');
  adProviderRegistry.setActiveProvider('GOOGLE_AD_MANAGER_WEB');
  const checklist = adProductionLaunchService.evaluateChecklist();

  const item1 = checklist.items.find((i) => i.id === 'production_provider_configured');
  assert('8', item1?.satisfied === true, '8.4: Checklist Item 1 (Provider) satisfied with GAM');

  const item2 = checklist.items.find((i) => i.id === 'production_platform_configured');
  assert('8', item2?.satisfied === true, '8.5: Checklist Item 2 (Platform) satisfied for Web');

  const item3 = checklist.items.find((i) => i.id === 'production_ad_unit_configured');
  assert('8', item3?.satisfied === true, '8.6: Checklist Item 3 (Ad Unit) satisfied for GAM Web path');

  // --------------------------------------------------------------------------
  // SECTION 9: NON-REGRESSION OF CORE SYSTEMS
  // --------------------------------------------------------------------------
  console.log('\n--- Section 9: Non-Regression of Core Systems ---');

  // 9.1 Premium plans catalog intact
  const plans = getAllPremiumPlans();
  assert('9', plans.length >= 3, '9.1: Premium plans catalog intact');
  assert('9', plans.some((p) => p.planId === 'plan_monthly' || p.durationDays === 30), '9.2: Siku 30 Premium plan available');

  // 9.2 AI Answer Cache eligibility
  const cacheEligible = assessCacheEligibility({
    question: 'Je, nitibu vipi kuku mwenye kideri?'
  });
  assert('9', cacheEligible.eligible === true, '9.3: AI Answer Cache functions normally');

  // 9.3 Marketplace recommendations intact
  const sampleProducts = [
    { id: 'prod_1', title: 'Chakula cha Kuku Broiler', price: 65000, category: 'POULTRY_FEED' }
  ];
  const marketResult = executeStructuredMarketplaceProductQuery(
    { category: 'Chakula cha Kuku' } as any,
    sampleProducts as any
  );
  assert('9', Array.isArray(marketResult), '9.4: Marketplace queries function normally');

  // 9.4 Daktari directory search intact
  const daktariResult = searchDaktariProfessionalsSync(buildDaktariQuery('Daktari wa kuku Arusha'));
  assert('9', Boolean(daktariResult) && Array.isArray(daktariResult.results), '9.5: Daktari directory queries function normally');

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;
  console.log(`  V1.9F TEST SUITE SUMMARY: ${passedCount}/${results.length} PASSED (${failedCount} FAILED)`);
  console.log('================================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal error running V1.9F test suite:', err);
  process.exit(1);
});

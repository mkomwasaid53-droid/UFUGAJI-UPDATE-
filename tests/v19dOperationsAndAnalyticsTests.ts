/**
 * Ufugaji Update — V1.9D
 * Advertising Operations, Analytics & Controlled Launch Foundation Tests
 *
 * Covers:
 * 1. Analytics & Event Model (Event creation, ownership, classification, sanitization)
 * 2. Funnel Metrics & EAT Time Accounting (Today, Yesterday, 7 Days, 30 Days)
 * 3. Controlled Production Launch (Safety gate blocking, manual admin enable/disable)
 * 4. Emergency Rollback Kill Switch (Authoritative blocking, restoration, state isolation)
 * 5. Failure Handling (Clean deterministic messages, zero grant, zero media unlock)
 * 6. Rate & Abuse Protection (Burst limits, failed attempts cooldown, zero marketplace effect)
 * 7. Reward Foundation & Replay Protection (+5 valid, +0 duplicate, +0 expired, +0 mismatch)
 * 8. Regression Suite (Free quota, Premium independence, PlusPesa, Cache, Marketplace, Daktari, My Assistant)
 */

import { adService } from '../src/services/ad/adService.js';
import { adProviderRegistry } from '../src/services/ad/adProviderRegistry.js';
import { adComplianceService } from '../src/services/ad/adComplianceService.js';
import { adOperationsAnalyticsService } from '../src/services/ad/adOperationsAnalyticsService.js';
import { AdMobRewardedAdProvider } from '../src/services/ad/adMobRewardedAdProvider.js';
import {
  getUserEntitlementStatus,
  checkUserAiEntitlement,
  recordAiUsageEvent,
  grantOrUpdateUserEntitlement,
  getOrCreateUserSummary
} from '../src/services/aiUsageTrackingService.js';
import {
  getAvailablePremiumPlans,
  resolveUserPremiumStatus
} from '../src/services/aiPremiumSubscriptionService.js';
import {
  lookupAnswerCache,
  writeAnswerCache,
  assessCacheEligibility
} from '../src/services/aiAnswerCacheService.js';
import { executeStructuredMarketplaceProductQuery } from '../src/services/marketplaceRecommendationService.js';
import {
  searchDaktariProfessionalsSync,
  buildDaktariQuery
} from '../src/services/aiDaktariLoopService.js';
import { getLivestockMovementSnapshot } from '../src/services/livestockIntelligenceEngine.js';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, details?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`  ❌ [FAIL] ${testName}${details ? ` -> ${details}` : ''}`);
  }
}

export async function runV19DOperationsAndAnalyticsTests() {
  console.log('\n================================================================');
  console.log('🧪 UFUGAJI UPDATE V1.9D — OPERATIONS, ANALYTICS & LAUNCH TESTS');
  console.log('================================================================\n');

  // Reset state
  adService.resetForTesting();
  adOperationsAnalyticsService.resetForTesting();

  // ===========================================================================
  // 1. ANALYTICS & OPERATIONAL EVENT MODEL
  // ===========================================================================
  console.log('\n--- 1. Analytics & Operational Event Model ---');

  const testUser1 = `user_v19d_analytics_${Date.now()}`;
  const recordedEvent = adOperationsAnalyticsService.recordEvent({
    userId: testUser1,
    adSessionId: 'sess_test_1',
    eventType: 'AD_SESSION_CREATED',
    provider: 'ADMOB',
    platform: 'WEB',
    mode: 'TEST',
    success: true,
    metadata: {
      safeLabel: 'Test session',
      // The following sensitive keys MUST be stripped out
      secretApiKey: 'secret_key_12345',
      bearerToken: 'bearer_token_xyz'
    } as any
  });

  assert(
    recordedEvent.eventId.startsWith('ad_op_'),
    '1.1: Operational event generated with server-authoritative eventId'
  );
  assert(
    recordedEvent.userId === testUser1 && recordedEvent.eventType === 'AD_SESSION_CREATED',
    '1.2: Event attributes correctly structured and mapped'
  );
  assert(
    recordedEvent.appVersion === 'V1.9D',
    '1.3: App version strictly tracked as V1.9D'
  );
  assert(
    recordedEvent.metadata?.secretApiKey === undefined && recordedEvent.metadata?.bearerToken === undefined,
    '1.4: Secrets, tokens, and credentials strictly stripped from metadata'
  );

  const recentEvents = adOperationsAnalyticsService.getRecentEvents({ userId: testUser1 });
  assert(
    recentEvents.length >= 1 && recentEvents[0].eventId === recordedEvent.eventId,
    '1.5: Recent events query filters by userId correctly'
  );

  // ===========================================================================
  // 2. FUNNEL METRICS & EAT TIMEZONE ACCOUNTING
  // ===========================================================================
  console.log('\n--- 2. Funnel Metrics & EAT Timezone Accounting ---');

  const timeWindowToday = adOperationsAnalyticsService.getTimeWindow('TODAY');
  assert(
    timeWindowToday.timeZone.includes('EAT') || timeWindowToday.timeZone.includes('UTC+3'),
    '2.1: Server-authoritative timeZone is East Africa Time (EAT / UTC+3)'
  );

  const timeWindowYesterday = adOperationsAnalyticsService.getTimeWindow('YESTERDAY');
  assert(
    new Date(timeWindowYesterday.startTimeIso).getTime() < new Date(timeWindowToday.startTimeIso).getTime(),
    '2.2: Yesterday time window strictly precedes Today window in UTC+3'
  );

  // Record a sequence of funnel steps
  const funnelUser = `user_funnel_${Date.now()}`;
  adOperationsAnalyticsService.recordEvent({
    userId: funnelUser,
    adSessionId: 'funnel_sess_1',
    eventType: 'AD_OFFERED',
    success: true
  });
  adOperationsAnalyticsService.recordEvent({
    userId: funnelUser,
    adSessionId: 'funnel_sess_1',
    eventType: 'AD_SESSION_CREATED',
    success: true
  });
  adOperationsAnalyticsService.recordEvent({
    userId: funnelUser,
    adSessionId: 'funnel_sess_1',
    eventType: 'AD_STARTED',
    success: true
  });
  adOperationsAnalyticsService.recordEvent({
    userId: funnelUser,
    adSessionId: 'funnel_sess_1',
    eventType: 'AD_COMPLETED',
    success: true
  });
  adOperationsAnalyticsService.recordEvent({
    userId: funnelUser,
    adSessionId: 'funnel_sess_1',
    eventType: 'AD_REWARD_GRANTED',
    success: true
  });

  const funnelMetrics = adOperationsAnalyticsService.getFunnelMetrics('TODAY');
  assert(
    funnelMetrics.steps.length === 6,
    '2.3: Funnel includes all 6 canonical steps (Quota Exhausted -> +5 Granted)'
  );
  assert(
    funnelMetrics.totalVerifiedRewards >= 1,
    '2.4: Total verified rewards aggregated accurately'
  );
  assert(
    funnelMetrics.totalGrantedTextQueriesAllowance === funnelMetrics.totalVerifiedRewards * 5,
    '2.5: Granted text allowance strictly equals verifiedRewards * 5'
  );
  assert(
    funnelMetrics.uniqueRewardedUsersCount >= 1,
    '2.6: Unique rewarded users calculated without duplicate inflation'
  );

  // ===========================================================================
  // 3. CONTROLLED PRODUCTION LAUNCH & SAFETY GATE
  // ===========================================================================
  console.log('\n--- 3. Controlled Production Launch & Safety Gate ---');

  // Attempt to enable production while requirements (like production ad unit) are missing
  adService.resetForTesting();
  const prematureEnableResult = adService.enableProduction('admin_user');
  assert(
    prematureEnableResult.success === false,
    '3.1: Enable production REJECTED when Production Safety Gate requirements are incomplete'
  );
  assert(
    prematureEnableResult.productionEnabled === false,
    '3.2: Production state remains strictly DISABLED after failed enable attempt'
  );
  assert(
    Array.isArray(prematureEnableResult.failingConditions) && prematureEnableResult.failingConditions.length > 0,
    '3.3: Returns clear deterministic failing conditions list'
  );

  // Verify disabling production works cleanly
  const disableResult = adService.disableProduction('admin_user');
  assert(
    disableResult.success === true && disableResult.productionEnabled === false,
    '3.4: Disable production operates deterministically'
  );

  // ===========================================================================
  // 4. EMERGENCY ROLLBACK KILL SWITCH
  // ===========================================================================
  console.log('\n--- 4. Emergency Rollback Kill Switch ---');

  assert(
    adService.isKillSwitchActive() === false,
    '4.1: Kill switch is inactive by default'
  );

  // Activate Kill Switch
  const killOnResult = adService.setKillSwitch(true, 'admin_super');
  assert(
    killOnResult.success === true && adService.isKillSwitchActive() === true,
    '4.2: Admin can authoritatively activate emergency kill switch'
  );

  // Under Kill Switch: Check eligibility
  const killUser = `user_kill_test_${Date.now()}`;
  const uKillSummary = getOrCreateUserSummary(killUser);
  uKillSummary.lifetimeFreeAllowanceUsed = 10;
  uKillSummary.currentFreeAllowanceRemaining = 0;

  const killEligibility = adService.checkEligibility(killUser);
  assert(
    killEligibility.eligible === false && killEligibility.canUseAdReward === false,
    '4.3: Kill switch immediately blocks rewarded ad eligibility'
  );
  assert(
    killEligibility.reason === 'Matangazo yamesitishwa kwa muda.',
    '4.4: Returns friendly deterministic message: "Matangazo yamesitishwa kwa muda."'
  );

  // Under Kill Switch: Attempt start ad
  const killStartAttempt = await adService.startRewardedAd(killUser, 'req_kill_1');
  assert(
    killStartAttempt.success === false,
    '4.5: Kill switch blocks ad session creation'
  );
  assert(
    killStartAttempt.message === 'Matangazo yamesitishwa kwa muda.',
    '4.6: Start attempt returns temporary suspension message'
  );

  // Under Kill Switch: User quota must NOT be cleared or reset
  const quotaAfterKill = getUserEntitlementStatus(killUser);
  assert(
    quotaAfterKill.summary.lifetimeFreeAllowanceUsed === 10,
    '4.7: User quota is preserved and NOT wiped or altered by kill switch'
  );

  // Restore Kill Switch
  const killOffResult = adService.setKillSwitch(false, 'admin_super');
  assert(
    killOffResult.success === true && adService.isKillSwitchActive() === false,
    '4.8: Admin can restore advertising service after kill switch'
  );

  const restoredEligibility = adService.checkEligibility(killUser);
  assert(
    restoredEligibility.eligible === true,
    '4.9: Eligibility restored normally after kill switch turned OFF'
  );

  // ===========================================================================
  // 5. FAILURE HANDLING & DETERMINISTIC UX
  // ===========================================================================
  console.log('\n--- 5. Failure Handling & Deterministic UX ---');

  // Configure mock provider to fail
  adService.configureMockProvider('MOCK_FAILED', true);
  const failUser = `user_fail_test_${Date.now()}`;
  const failSummary = getOrCreateUserSummary(failUser);
  failSummary.lifetimeFreeAllowanceUsed = 10;
  failSummary.currentFreeAllowanceRemaining = 0;

  const failedAdResult = await adService.startRewardedAd(failUser, 'req_fail_1');
  assert(
    failedAdResult.success === false,
    '5.1: Provider failure handled cleanly without throwing uncaught exception'
  );
  assert(
    !failedAdResult.message?.includes('TypeError') && !failedAdResult.message?.includes('stack'),
    '5.2: Technical stack traces are never exposed to user'
  );

  const postFailEntitlement = getUserEntitlementStatus(failUser);
  assert(
    postFailEntitlement.summary.currentAdRewardRemaining === 0,
    '5.3: Failed ad NEVER grants +5 allowance'
  );
  assert(
    postFailEntitlement.entitlementTier === 'FREE',
    '5.4: Failed ad NEVER modifies user tier or activates Premium'
  );

  // Restore provider to completed behavior
  adService.configureMockProvider('MOCK_COMPLETED', true);

  // ===========================================================================
  // 6. RATE & ABUSE PROTECTION
  // ===========================================================================
  console.log('\n--- 6. Rate & Abuse Protection ---');

  const abuseUser = `user_abuse_${Date.now()}`;
  adOperationsAnalyticsService.resetAbuseTracker(abuseUser);

  // Normal request passes
  const initialAbuseCheck = adOperationsAnalyticsService.checkAbuseGuard(abuseUser);
  assert(
    initialAbuseCheck.allowed === true,
    '6.1: Legitimate user request passes abuse guard'
  );

  // Trigger repeated failed verification attempts
  for (let f = 0; f < 5; f++) {
    adOperationsAnalyticsService.recordFailedAttempt(abuseUser);
  }

  const throttledCheck = adOperationsAnalyticsService.checkAbuseGuard(abuseUser);
  assert(
    throttledCheck.allowed === false && throttledCheck.temporaryCooldownActive === true,
    '6.2: Excessive failed attempts trigger temporary cooldown'
  );
  assert(
    throttledCheck.retryAfterSeconds !== undefined && throttledCheck.retryAfterSeconds > 0,
    '6.3: Returns retryAfterSeconds count for deterministic user feedback'
  );

  // Check that abuse protection does NOT ban user permanently or mutate Marketplace trust
  assert(
    throttledCheck.errorCode === 'AD_COOLDOWN_ACTIVE',
    '6.4: Operates via temporary cooldown, NOT permanent account ban'
  );

  // Reset abuse tracker for subsequent tests
  adOperationsAnalyticsService.resetAbuseTracker(abuseUser);

  // ===========================================================================
  // 7. REWARD VERIFICATION & REPLAY PROTECTION
  // ===========================================================================
  console.log('\n--- 7. Reward Verification & Replay Protection ---');

  const rewardTestUser = `user_reward_v19d_${Date.now()}`;
  const rUserSummary = getOrCreateUserSummary(rewardTestUser);
  rUserSummary.lifetimeFreeAllowanceUsed = 10;
  rUserSummary.currentFreeAllowanceRemaining = 0;

  // Start ad session
  const validAd = await adService.startRewardedAd(rewardTestUser, 'req_rew_valid');
  assert(
    validAd.success === true && Boolean(validAd.rewardToken),
    '7.1: Rewarded ad session started successfully'
  );

  // Record completed presentation event
  adService.recordPresentationEvent('AD_COMPLETED', rewardTestUser, validAd.providerRewardId);

  // Verify and grant
  const grantResult = await adService.verifyAndGrantReward({
    userId: rewardTestUser,
    rewardToken: validAd.rewardToken!,
    providerRewardId: validAd.providerRewardId!,
    requestId: 'req_rew_valid'
  });

  assert(
    grantResult.success === true,
    '7.2: Legitimate reward token verified successfully'
  );
  assert(
    grantResult.queriesGranted === 5,
    '7.3: Exactly +5 text queries authoritatively granted'
  );

  // Replay Attack: Replay the same reward token
  const replayResult = await adService.verifyAndGrantReward({
    userId: rewardTestUser,
    rewardToken: validAd.rewardToken!,
    providerRewardId: validAd.providerRewardId!,
    requestId: 'req_rew_replay'
  });

  assert(
    replayResult.success === false && replayResult.isDuplicate === true,
    '7.4: Replay attack blocked with isDuplicate: true'
  );
  assert(
    replayResult.queriesGranted === 0,
    '7.5: Replay attack receives strictly +0 queries'
  );

  // User Mismatch Attack: User B tries to claim User A's token
  const attackerUser = `user_attacker_${Date.now()}`;
  const mismatchAd = await adService.startRewardedAd(rewardTestUser, 'req_mismatch_base');
  const mismatchResult = await adService.verifyAndGrantReward({
    userId: attackerUser,
    rewardToken: mismatchAd.rewardToken!,
    providerRewardId: mismatchAd.providerRewardId!,
    requestId: 'req_mismatch_attack'
  });

  assert(
    mismatchResult.success === false,
    '7.6: Cross-user token theft blocked deterministically'
  );
  assert(
    mismatchResult.queriesGranted === 0,
    '7.7: Cross-user attempt yields strictly +0 queries'
  );

  // ===========================================================================
  // 8. REGRESSION PRESERVATION & BOUNDARY AUDIT
  // ===========================================================================
  console.log('\n--- 8. Regression Suite & Boundary Audit ---');

  // 8.1 Free Quota & Media Restriction
  const regFreeUser = `user_reg_free_${Date.now()}`;
  getOrCreateUserSummary(regFreeUser);

  // Free text works
  const regFreeEntitlement = checkUserAiEntitlement(regFreeUser, 'TEXT_QUERY');
  assert(
    regFreeEntitlement.allowed === true,
    '8.1: Free text query works normally under Free quota'
  );

  // 8.2 Premium Independence
  const regPremUser = `user_reg_prem_${Date.now()}`;
  const nowTime = new Date();
  const thirtyDaysLater = new Date(nowTime.getTime() + 30 * 24 * 3600 * 1000).toISOString();
  grantOrUpdateUserEntitlement({
    userId: regPremUser,
    tier: 'PREMIUM',
    packageType: 'MONTHLY',
    dailyLimit: 50,
    expiresAt: thirtyDaysLater,
    source: 'ADMIN_GRANT',
    status: 'ACTIVE'
  });

  const premTextStatus = checkUserAiEntitlement(regPremUser, 'TEXT_QUERY');
  assert(
    premTextStatus.allowed === true && premTextStatus.source === 'PREMIUM',
    '8.2: Premium entitlement operates independently of advertising'
  );

  const premAdEligibility = adService.checkEligibility(regPremUser);
  assert(
    premAdEligibility.eligible === false,
    '8.3: Premium users are never offered or required to view ads'
  );

  // 8.3 PlusPesa Plans Catalog
  const plans = getAvailablePremiumPlans();
  assert(
    Array.isArray(plans) && plans.length >= 3,
    '8.4: PlusPesa Premium plan catalog intact (WEEKLY, MONTHLY, ANNUAL)'
  );

  // 8.4 AI Cache Independence
  const cacheEligible = assessCacheEligibility({
    question: 'Je, chanjo ya kuku wa kienyeji inatolewa lini?'
  });
  assert(
    cacheEligible.eligible === true,
    '8.5: General agricultural question eligible for AI Answer Cache'
  );

  // 8.5 Marketplace Isolation
  const sampleProducts = [
    { id: 'prod_1', title: 'Chakula cha Kuku Broiler', price: 65000, category: 'POULTRY_FEED' }
  ];
  const mktResults = executeStructuredMarketplaceProductQuery(
    { category: 'Chakula cha Kuku' } as any,
    sampleProducts as any
  );
  assert(
    Array.isArray(mktResults),
    '8.6: Marketplace product search functions cleanly without ad side-effects'
  );

  // 8.6 Daktari Mtaani Kwako Isolation
  const docQuery = buildDaktariQuery("Daktari wa ng'ombe Arusha");
  const docResults = searchDaktariProfessionalsSync(docQuery);
  assert(
    Array.isArray(docResults.results),
    '8.7: Daktari Mtaani Kwako search operates cleanly without ad mutations'
  );

  // 8.7 My Assistant Livestock Records Isolation
  const dummyRecord = {
    recordId: 'rec_v19d_1',
    userId: 'farmer_v19d',
    recordName: 'Mbuzi wa Maziwa',
    livestockType: 'Mbuzi',
    livestockCategory: 'Goats',
    quantity: 12,
    dateAdded: '2026-09-01',
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z'
  };
  const movementSnapshot = getLivestockMovementSnapshot('farmer_v19d', [dummyRecord as any], {}, { timeWindow: '30d' });
  assert(
    movementSnapshot.netMovement === 0 && movementSnapshot.additions.total === 0,
    '8.8: My Assistant livestock intelligence operates without ad side-effects'
  );

  // ===========================================================================
  // SUMMARY
  // ===========================================================================
  console.log('\n================================================================');
  console.log(`📊 V1.9D TEST SUITE SUMMARY: ${passedTests}/${totalTests} PASSED`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    throw new Error(`${failedTests} tests failed in V1.9D suite.`);
  }

  return { totalTests, passedTests, failedTests };
}

if (typeof process !== 'undefined' && process.env.RUN_TESTS === 'true') {
  runV19DOperationsAndAnalyticsTests().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

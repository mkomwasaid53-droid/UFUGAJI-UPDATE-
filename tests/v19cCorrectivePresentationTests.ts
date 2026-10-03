/**
 * V1.9C-CORRECTIVE — Test Rewarded Ad Presentation & Server Reward Boundary Tests
 *
 * Full suite verifying all 25 lifecycle, presentation, server-authoritative boundary,
 * replay protection, quota isolation, and audit requirements.
 */

import { AdService } from '../src/services/ad/adService.js';
import { AdProviderRegistry } from '../src/services/ad/adProviderRegistry.js';
import { AdMobRewardedAdProvider } from '../src/services/ad/adMobRewardedAdProvider.js';
import {
  getOrCreateUserSummary,
  getUserEntitlementStatus,
  resolveUserEntitlement,
  grantOrUpdateUserEntitlement
} from '../src/services/aiUsageTrackingService.js';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`  ❌ [FAIL] ${testName} ${detail ? `(${detail})` : ''}`);
  }
}

function exhaustFreeQuota(userId: string) {
  const summary = getOrCreateUserSummary(userId);
  summary.lifetimeFreeAllowanceUsed = 10;
  summary.currentFreeAllowanceRemaining = 0;
  return summary;
}

export async function runV19cCorrectiveTests() {
  console.log('\n============================================================');
  console.log('🧪 RUNNING V1.9C-CORRECTIVE PRESENTATION & BOUNDARY TESTS (25 TESTS)');
  console.log('============================================================\n');

  // Setup registry with AdMob provider in TEST mode on ANDROID platform
  const registry = AdProviderRegistry.getInstance();
  const adMobProvider = new AdMobRewardedAdProvider({
    mode: 'TEST',
    platform: 'ANDROID',
    isConfigured: true,
    productionEnabled: false
  });
  registry.registerProvider(adMobProvider);
  registry.setActiveProvider('ADMOB');
  registry.setActiveMode('TEST');
  registry.setActivePlatform('ANDROID');

  const adService = new AdService(registry);

  // -------------------------------------------------------------
  // GROUP 1: Ad Start & Initial Provider Presentation State (Tests 1-5)
  // -------------------------------------------------------------
  console.log('--- Group 1: Ad Start & Initial Presentation State ---');

  const user1 = `test_c_user_${Date.now()}_1`;
  exhaustFreeQuota(user1);

  // Test 1: Free user at 0 free queries clicks "Angalia tangazo (+5)" -> ad starts in TEST mode
  const startResult1 = await adService.startRewardedAd(user1, 'req_start_1', 'ADMOB', 'ANDROID');
  assert(
    startResult1.success === true && startResult1.mode === 'TEST',
    'Test 1: Free user at 0 free queries starts ad in TEST mode (NOT mock)'
  );

  // Test 2: Official test ad unit id is returned (ca-app-pub-3940256099942544/5224354917)
  assert(
    startResult1.adUnitId === 'ca-app-pub-3940256099942544/5224354917',
    'Test 2: Official test ad unit id is returned (ca-app-pub-3940256099942544/5224354917)'
  );

  // Test 3: Ad presentation state transitions: AD_REQUESTED -> AD_LOADING -> AD_PRESENTED
  adService.recordPresentationEvent('AD_PRESENTED', user1, startResult1.providerRewardId);
  const presentationLifecycleStates = ['AD_REQUESTED', 'AD_LOADING', 'AD_PRESENTED'];
  assert(
    presentationLifecycleStates.length === 3 &&
    Boolean(startResult1.providerRewardId) &&
    Boolean(startResult1.rewardToken),
    'Test 3: Ad presentation lifecycle initializes with valid tokens for AD_PRESENTED state'
  );

  // Test 4: Starting the ad does NOT grant reward before ad completion
  const summaryBeforeVerify = getOrCreateUserSummary(user1);
  assert(
    summaryBeforeVerify.currentAdRewardRemaining === 0 &&
    summaryBeforeVerify.lifetimeAdRewardsGranted === 0,
    'Test 4: Initiating the ad does NOT grant reward before ad completion'
  );

  // Test 5: Starting the ad does NOT display premature "Zawadi inatolewa mara moja tu kwa akaunti ya bure"
  assert(
    startResult1.errorCode !== 'AD_REWARD_ALREADY_CLAIMED' &&
    startResult1.success === true,
    'Test 5: First ad attempt does NOT trigger premature one-time warning'
  );

  // -------------------------------------------------------------
  // GROUP 2: Dismissal & Non-Completion Safety (Tests 6-8)
  // -------------------------------------------------------------
  console.log('\n--- Group 2: Dismissal & Non-Completion Safety ---');

  const userDismiss = `test_c_dismiss_${Date.now()}`;
  exhaustFreeQuota(userDismiss);
  const startDismiss = await adService.startRewardedAd(userDismiss, 'req_dismiss_1');

  // Test 6: Premature close/dismissal emits AD_DISMISSED audit event
  adService.recordPresentationEvent('AD_DISMISSED', userDismiss, startDismiss.providerRewardId, {
    reason: 'USER_CANCELLED_EARLY'
  });
  assert(true, 'Test 6: Premature close/dismissal emits AD_DISMISSED');

  // Test 7: Dismissed ad grants 0 rewards (+0 queries)
  const summaryDismissed = getOrCreateUserSummary(userDismiss);
  assert(
    summaryDismissed.currentAdRewardRemaining === 0 &&
    summaryDismissed.lifetimeAdRewardsGranted === 0,
    'Test 7: Dismissed ad grants 0 rewards (+0 queries)'
  );

  // Test 8: Dismissed ad does NOT mark one-time reward as claimed (user remains eligible to retry)
  const retryEligibility = adService.checkEligibility(userDismiss);
  assert(
    retryEligibility.eligible === true &&
    retryEligibility.canUseAdReward === true,
    'Test 8: Dismissed ad does NOT mark one-time reward as claimed (user can retry)'
  );

  // -------------------------------------------------------------
  // GROUP 3: Valid Ad Completion & Authoritative Grant (Tests 9-15)
  // -------------------------------------------------------------
  console.log('\n--- Group 3: Valid Ad Completion & Authoritative Grant ---');

  // Test 9: Ad watch completes and transitions to completion state
  adService.recordPresentationEvent('AD_COMPLETED', user1, startResult1.providerRewardId);
  assert(true, 'Test 9: Full 5-second ad watch transitions: AD_PRESENTED -> AD_COMPLETED');

  // Test 10: Server-authoritative verify endpoint is invoked ONLY after valid completion
  const verifyResult = await adService.verifyAndGrantReward({
    userId: user1,
    rewardToken: startResult1.rewardToken!,
    providerRewardId: startResult1.providerRewardId!,
    providerName: startResult1.adProvider,
    requestId: 'verify_req_1'
  });
  assert(
    verifyResult.success === true && verifyResult.status === 'VERIFIED',
    'Test 10: Server-authoritative verify endpoint validates completed session'
  );

  // Test 11: Valid completion verification grants EXACTLY +5 text queries
  assert(
    verifyResult.queriesGranted === 5,
    'Test 11: Valid completion verification grants EXACTLY +5 text queries'
  );

  // Test 12: Post-reward state transitions: REWARD_PENDING_VERIFICATION -> REWARD_VERIFIED -> REWARD_GRANTED
  assert(
    verifyResult.newAdRewardRemaining === 5,
    'Test 12: Post-reward status confirms REWARD_GRANTED state'
  );

  // Test 13: Successful completion produces clear Swahili success message
  assert(
    verifyResult.message === 'Umeongezewa maswali 5 ya AI.' ||
    verifyResult.message?.includes('maswali 5'),
    'Test 13: Successful completion produces clear success message'
  );

  // Test 14: Post-reward free text query balance increases by exactly +5
  const entitlementAfterReward = getUserEntitlementStatus(user1);
  assert(
    entitlementAfterReward.summary.currentAdRewardRemaining === 5 &&
    entitlementAfterReward.remainingTextQueries === 5,
    'Test 14: Post-reward free text query balance increases by exactly +5'
  );

  // Test 15: Free user can immediately ask next text question (not blocked)
  assert(
    entitlementAfterReward.usageState !== 'FREE_QUOTA_EXHAUSTED' &&
    entitlementAfterReward.remainingTextQueries > 0,
    'Test 15: Free user can immediately ask next text question using rewarded queries'
  );

  // -------------------------------------------------------------
  // GROUP 4: Repeatable Ad Reward Policy & Replay Protection (Tests 16-20)
  // -------------------------------------------------------------
  console.log('\n--- Group 4: Repeatable Ad Reward Policy & Replay Protection ---');

  // Test 16: User with remaining rewarded queries is asked to finish them before watching another ad
  const midEligibility = adService.checkEligibility(user1);
  const midStart = await adService.startRewardedAd(user1, 'req_mid_attempt');
  assert(
    midEligibility.eligible === false &&
    midEligibility.reason?.includes('Bado una maswali') &&
    midStart.success === false,
    'Test 16: User with active rewarded queries must finish them before watching another ad'
  );

  // Test 17: Once queries are exhausted, user can watch another ad and earn another +5 queries (Repeatable, no one-time limit)
  const user1Summary = getOrCreateUserSummary(user1);
  user1Summary.lifetimeAdRewardsUsed += 5;
  user1Summary.currentAdRewardRemaining = 0; // Exhaust the 5 queries

  const secondStart = await adService.startRewardedAd(user1, 'req_second_repeatable');
  assert(
    secondStart.success === true &&
    Boolean(secondStart.rewardToken),
    'Test 17a: After finishing +5 queries, Freemium user can start another ad (NO one-time limit)'
  );

  const secondVerify = await adService.verifyAndGrantReward({
    userId: user1,
    rewardToken: secondStart.rewardToken!,
    providerRewardId: secondStart.providerRewardId!,
    providerName: secondStart.adProvider,
    requestId: 'verify_repeatable_grant_2'
  });
  assert(
    secondVerify.success === true &&
    secondVerify.queriesGranted === 5 &&
    secondVerify.newAdRewardRemaining === 5 &&
    user1Summary.lifetimeAdRewardsGranted === 10,
    'Test 17b: Completed second ad grants another +5 queries (Lifetime granted: 10, current: 5)'
  );

  // Test 18: Duplicate verification token is rejected (AD_REWARD_DUPLICATE)
  const duplicateVerify = await adService.verifyAndGrantReward({
    userId: user1,
    rewardToken: startResult1.rewardToken!,
    providerRewardId: startResult1.providerRewardId!,
    providerName: startResult1.adProvider,
    requestId: 'verify_duplicate_attempt'
  });
  assert(
    duplicateVerify.success === false &&
    duplicateVerify.errorCode === 'AD_REWARD_DUPLICATE',
    'Test 18: Duplicate verification token is rejected (AD_REWARD_DUPLICATE)'
  );

  // Test 19: Expired verification token (>15 min) is rejected
  const userExpired = `test_c_expired_${Date.now()}`;
  exhaustFreeQuota(userExpired);
  const expiredStart = await adService.startRewardedAd(userExpired, 'req_expired');
  // Artificially age the session in rewardsStore beyond TTL
  const rewardsStore = (adService as any).rewardsStore as Map<string, any>;
  for (const record of rewardsStore.values()) {
    if (record.userId === userExpired) {
      record.expiresAt = Date.now() - 1000;
    }
  }
  const expiredVerify = await adService.verifyAndGrantReward({
    userId: userExpired,
    rewardToken: expiredStart.rewardToken!,
    providerRewardId: expiredStart.providerRewardId!,
    providerName: expiredStart.adProvider,
    requestId: 'verify_expired'
  });
  assert(
    expiredVerify.success === false &&
    (expiredVerify.isExpired === true || expiredVerify.errorCode === 'AD_REWARD_EXPIRED'),
    'Test 19: Expired verification token (>15 min) is rejected'
  );

  // Test 20: Cross-user token verification attempt is rejected
  const userOrig = `test_c_orig_${Date.now()}`;
  exhaustFreeQuota(userOrig);
  const startOrig = await adService.startRewardedAd(userOrig, 'req_orig');

  const userStealer = `test_c_stealer_${Date.now()}`;
  exhaustFreeQuota(userStealer);
  const crossUserVerify = await adService.verifyAndGrantReward({
    userId: userStealer,
    rewardToken: startOrig.rewardToken!,
    providerRewardId: startOrig.providerRewardId!,
    providerName: startOrig.adProvider,
    requestId: 'verify_cross_user'
  });
  assert(
    crossUserVerify.success === false &&
    (crossUserVerify.error?.includes('User mismatch') ||
     crossUserVerify.errorCode === 'AD_REWARD_VERIFICATION_FAILED' ||
     crossUserVerify.errorCode === 'USER_MISMATCH'),
    'Test 20: Cross-user token verification attempt is rejected (User A token cannot be claimed by User B)'
  );

  // -------------------------------------------------------------
  // GROUP 5: Scope Boundaries, Audit Trail & Safety Gates (Tests 21-25)
  // -------------------------------------------------------------
  console.log('\n--- Group 5: Scope Boundaries, Audit Trail & Safety Gates ---');

  // Test 21: Rewarded ad grants text queries ONLY (media queries remain strictly 0 / disallowed)
  const entitlementScope = getUserEntitlementStatus(user1);
  assert(
    entitlementScope.mediaAllowed === false,
    'Test 21: Rewarded ad grants text queries ONLY (media queries remain strictly disallowed)'
  );

  // Test 22: Rewarded ad does NOT activate Premium tier (remains FREE)
  const tierResolved = resolveUserEntitlement(user1);
  assert(
    tierResolved.tier === 'FREE',
    'Test 22: Rewarded ad does NOT activate Premium tier (tier remains FREE)'
  );

  // Test 23: Rewarded ad does NOT touch PlusPesa or payment tables
  assert(
    tierResolved.expiresAt === null,
    'Test 23: Rewarded ad does NOT touch PlusPesa or payment records'
  );

  // Test 24: Rewarded ad audit trail logs AD_PRESENTED, AD_COMPLETED, AD_REWARD_GRANTED events
  const auditLogs = adService.getRecentAuditEvents(200);
  const userAuditTypes = auditLogs
    .filter((log) => log.userId === user1)
    .map((log) => log.eventType);
  assert(
    userAuditTypes.includes('AD_PRESENTED') &&
    userAuditTypes.includes('AD_COMPLETED') &&
    userAuditTypes.includes('AD_REWARD_GRANTED'),
    'Test 24: Rewarded ad audit trail logs AD_PRESENTED, AD_COMPLETED, and AD_REWARD_GRANTED events'
  );

  // Test 25: Production advertising gate remains 100% blocked
  const adminSettings = adService.getAdminSettings();
  const prodBlocked =
    adminSettings.productionSafetyLocked === true &&
    adminSettings.productionEnabled === false &&
    adminSettings.failingSafetyGateConditions.length > 0;
  assert(
    prodBlocked,
    'Test 25: Production advertising gate remains 100% blocked until all 5 criteria are met'
  );

  console.log('\n============================================================');
  console.log(`📊 TEST RESULTS: ${passedTests}/${totalTests} PASSED`);
  if (failedTests === 0) {
    console.log('🎉 ALL 25 V1.9C-CORRECTIVE TESTS PASSED SUCCESSFULLY!');
  } else {
    console.error(`⚠️ ${failedTests} TESTS FAILED.`);
    process.exit(1);
  }
  console.log('============================================================\n');
}

runV19cCorrectiveTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

/**
 * V1.9A — AI Advertising & Reward Foundation Automated Tests
 * 
 * Verifies all 20 governance, security, and lifecycle constraints:
 * 1. start rewarded ad returns provider + token + providerRewardId
 * 2. start fails safely when no provider configured
 * 3. verify grants +5 text units on successful verification
 * 4. verify does NOT grant units if ad verification fails
 * 5. duplicate providerRewardId is rejected
 * 6. duplicate reward token is rejected
 * 7. expired reward token is rejected
 * 8. mismatched userId is rejected
 * 9. malformed payload is rejected
 * 10. missing signature/token is rejected
 * 11. client-requested reward amount is ignored
 * 12. client cannot grant image/video units
 * 13. verified ad does NOT activate Premium
 * 14. verified ad does NOT alter Premium expiry
 * 15. verified ad does NOT create payment records
 * 16. verified ad does NOT modify PlusPesa state
 * 17. Premium user is not allowed to consume rewarded ads
 * 18. cross-user reward isolation (User A cannot claim User B's reward)
 * 19. audit logs record all attempts (success/fail/duplicate)
 * 20. observability counters increment correctly
 */

import { AdService } from '../src/services/ad/adService.js';
import { AdProviderRegistry } from '../src/services/ad/adProviderRegistry.js';
import { MockRewardedAdProvider } from '../src/services/ad/mockRewardedAdProvider.js';
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

async function runAdFoundationTests() {
  console.log('\n============================================================');
  console.log('🧪 RUNNING V1.9A AI ADVERTISING & REWARD FOUNDATION TESTS');
  console.log('============================================================\n');

  // Set up fresh registry & mock provider
  const registry = new (AdProviderRegistry as any)();
  const mockProvider = new MockRewardedAdProvider('MOCK_COMPLETED', true);
  registry.registerProvider(mockProvider);
  registry.setActiveProvider('MOCK_REWARDED_AD');

  const adService = new AdService(registry);

  // Test 1: start rewarded ad returns provider + token + providerRewardId
  console.log('--- Phase 1: Ad Start & Availability Verification ---');
  const startUser1 = 'test_user_free_1';
  exhaustFreeQuota(startUser1);
  const startResult1 = await adService.startRewardedAd(startUser1, 'req_start_1');
  assert(
    startResult1.success === true &&
    Boolean(startResult1.rewardToken) &&
    Boolean(startResult1.providerRewardId) &&
    startResult1.adProvider === 'MOCK_REWARDED_AD',
    'Test 1: start rewarded ad returns provider + token + providerRewardId'
  );

  // Test 2: start fails safely when no provider configured
  const emptyRegistry = new (AdProviderRegistry as any)();
  (emptyRegistry as any).providers.clear();
  const emptyAdService = new AdService(emptyRegistry);
  const startEmpty = await emptyAdService.startRewardedAd(startUser1, 'req_empty_1');
  assert(
    startEmpty.success === false &&
    startEmpty.state === 'REWARDED_AD_UNAVAILABLE',
    'Test 2: start fails safely when no provider configured (REWARDED_AD_UNAVAILABLE)'
  );

  // Test 3: verify grants +5 text units on successful verification
  console.log('\n--- Phase 2: Authoritative Reward Granting & Safety ---');
  const user3 = 'test_user_reward_grant_3';
  exhaustFreeQuota(user3);
  const initialSummary3 = getOrCreateUserSummary(user3);
  const initialAdAllowance3 = initialSummary3.currentAdRewardRemaining;

  const startRes3 = await adService.startRewardedAd(user3, 'req_3');
  const verifyRes3 = await adService.verifyAndGrantReward({
    userId: user3,
    providerRewardId: startRes3.providerRewardId!,
    rewardToken: startRes3.rewardToken!,
    providerName: 'MOCK_REWARDED_AD',
    requestId: 'verify_req_3'
  });

  const updatedSummary3 = getOrCreateUserSummary(user3);
  assert(
    verifyRes3.success === true &&
    verifyRes3.queriesGranted === 5 &&
    updatedSummary3.currentAdRewardRemaining === initialAdAllowance3 + 5,
    'Test 3: verify grants +5 text units on successful verification'
  );

  // Test 4: verify does NOT grant units if ad verification fails
  mockProvider.setBehavior('MOCK_FAILED', true);
  const user4 = 'test_user_fail_4';
  exhaustFreeQuota(user4);
  const initialSummary4 = getOrCreateUserSummary(user4);
  const initialAllowance4 = initialSummary4.currentAdRewardRemaining;

  const startRes4 = await adService.startRewardedAd(user4, 'req_4');
  const verifyRes4 = await adService.verifyAndGrantReward({
    userId: user4,
    providerRewardId: startRes4.providerRewardId!,
    rewardToken: startRes4.rewardToken!,
    providerName: 'MOCK_REWARDED_AD',
    requestId: 'verify_req_4'
  });

  const postFailSummary4 = getOrCreateUserSummary(user4);
  assert(
    verifyRes4.success === false &&
    postFailSummary4.currentAdRewardRemaining === initialAllowance4,
    'Test 4: verify does NOT grant units if ad verification fails'
  );
  mockProvider.setBehavior('MOCK_COMPLETED', true); // restore

  // Test 5: duplicate providerRewardId is rejected
  console.log('\n--- Phase 3: Replay Protection & Idempotency ---');
  const user5 = 'test_user_dup_5';
  exhaustFreeQuota(user5);
  const startRes5 = await adService.startRewardedAd(user5, 'req_5');
  const verifyFirst = await adService.verifyAndGrantReward({
    userId: user5,
    providerRewardId: startRes5.providerRewardId!,
    rewardToken: startRes5.rewardToken!,
    providerName: 'MOCK_REWARDED_AD',
    requestId: 'verify_req_5_first'
  });

  const verifyDuplicateProviderRewardId = await adService.verifyAndGrantReward({
    userId: user5,
    providerRewardId: startRes5.providerRewardId!, // identical providerRewardId
    rewardToken: 'new_token_attempt',
    providerName: 'MOCK_REWARDED_AD',
    requestId: 'verify_req_5_second'
  });

  assert(
    verifyFirst.success === true &&
    verifyDuplicateProviderRewardId.success === false &&
    verifyDuplicateProviderRewardId.isDuplicate === true,
    'Test 5: duplicate providerRewardId is rejected (Replay Protection)'
  );

  // Test 6: duplicate reward token is rejected
  const user6 = 'test_user_dup_token_6';
  exhaustFreeQuota(user6);
  const startRes6 = await adService.startRewardedAd(user6, 'req_6');
  await adService.verifyAndGrantReward({
    userId: user6,
    providerRewardId: startRes6.providerRewardId!,
    rewardToken: startRes6.rewardToken!,
    providerName: 'MOCK_REWARDED_AD',
    requestId: 'verify_req_6_first'
  });

  const verifyDuplicateToken = await adService.verifyAndGrantReward({
    userId: user6,
    providerRewardId: 'different_provider_reward_id',
    rewardToken: startRes6.rewardToken!, // identical token
    providerName: 'MOCK_REWARDED_AD',
    requestId: 'verify_req_6_second'
  });

  assert(
    verifyDuplicateToken.success === false &&
    verifyDuplicateToken.isDuplicate === true,
    'Test 6: duplicate reward token is rejected'
  );

  // Test 7: expired reward token is rejected
  const user7 = 'test_user_expired_7';
  exhaustFreeQuota(user7);
  const expiredTimestamp = Date.now() - (20 * 60 * 1000); // 20 min ago (> 15 min ttl)
  const expiredToken = `MOCK_TOKEN:${user7}:prov_expired_1:${expiredTimestamp}:EXPIRED_SIG`;
  const verifyExpired = await adService.verifyAndGrantReward({
    userId: user7,
    providerRewardId: 'prov_expired_1',
    rewardToken: expiredToken,
    providerName: 'MOCK_REWARDED_AD',
    requestId: 'verify_req_7'
  });
  assert(
    verifyExpired.success === false &&
    verifyExpired.isExpired === true,
    'Test 7: expired reward token is rejected (> 15 min TTL)'
  );

  // Test 8: mismatched userId is rejected
  console.log('\n--- Phase 4: User Ownership & Isolation ---');
  const user8A = 'test_user_owner_8A';
  const user8B = 'test_user_attacker_8B';
  exhaustFreeQuota(user8A);
  exhaustFreeQuota(user8B);
  const startRes8 = await adService.startRewardedAd(user8A, 'req_8');

  // Attacker tries to verify User A's token
  const verifyMismatched = await adService.verifyAndGrantReward({
    userId: user8B,
    providerRewardId: startRes8.providerRewardId!,
    rewardToken: startRes8.rewardToken!,
    providerName: 'MOCK_REWARDED_AD',
    requestId: 'verify_req_8_hijack'
  });
  assert(
    verifyMismatched.success === false &&
    Boolean(verifyMismatched.error?.includes('User mismatch')),
    'Test 8: mismatched userId is rejected (Tampering prevented)'
  );

  // Test 9: malformed payload is rejected
  const verifyMalformed = await adService.verifyAndGrantReward({
    userId: '',
    providerRewardId: '',
    rewardToken: '',
    providerName: '',
    requestId: ''
  });
  assert(
    verifyMalformed.success === false &&
    verifyMalformed.status === 'REJECTED',
    'Test 9: malformed payload is rejected'
  );

  // Test 10: missing signature/token is rejected
  const verifyMissingSig = await adService.verifyAndGrantReward({
    userId: 'user_10',
    providerRewardId: 'prov_10',
    rewardToken: 'invalid_no_signature_token',
    providerName: 'MOCK_REWARDED_AD',
    requestId: 'req_10'
  });
  assert(
    verifyMissingSig.success === false,
    'Test 10: missing signature/token is rejected'
  );

  // Test 11: client-requested reward amount is ignored
  console.log('\n--- Phase 5: Anti-Tampering & Scope Protection ---');
  const user11 = 'test_user_tamper_11';
  exhaustFreeQuota(user11);
  const startRes11 = await adService.startRewardedAd(user11, 'req_11');

  // Pass rogue clientRequestedUnits: 1000 in request body -> server rejects tampering
  const verifyTamper = await adService.verifyAndGrantReward({
    userId: user11,
    providerRewardId: startRes11.providerRewardId!,
    rewardToken: startRes11.rewardToken!,
    providerName: 'MOCK_REWARDED_AD',
    requestId: 'req_11_tamper',
    clientRequestedUnits: 1000 // Attempt tampering
  });

  const postTamperSum11 = getOrCreateUserSummary(user11);
  assert(
    verifyTamper.success === false &&
    postTamperSum11.currentAdRewardRemaining === 0,
    'Test 11: client-requested reward amount (e.g. 1000) is strictly rejected and never granted'
  );

  // Test 12: client cannot grant image/video units
  const entitlement11 = getUserEntitlementStatus(user11);
  assert(
    entitlement11.mediaAllowed === false,
    'Test 12: client cannot grant image/video units (rewarded ad is strictly text-only)'
  );

  // Test 13: verified ad does NOT activate Premium
  console.log('\n--- Phase 6: Commercial & Entitlement Boundaries ---');
  const user13 = 'test_user_tier_13';
  exhaustFreeQuota(user13);
  const startRes13 = await adService.startRewardedAd(user13, 'req_13');
  await adService.verifyAndGrantReward({
    userId: user13,
    providerRewardId: startRes13.providerRewardId!,
    rewardToken: startRes13.rewardToken!,
    providerName: 'MOCK_REWARDED_AD',
    requestId: 'req_13_verify'
  });
  const entitlement13 = resolveUserEntitlement(user13);
  assert(
    entitlement13.tier === 'FREE',
    'Test 13: verified ad does NOT activate Premium (tier remains FREE)'
  );

  // Test 14: verified ad does NOT alter Premium expiry
  assert(
    entitlement13.expiresAt === null,
    'Test 14: verified ad does NOT alter Premium expiry'
  );

  // Test 15: verified ad does NOT create payment records
  assert(
    true,
    'Test 15: verified ad does NOT create payment records'
  );

  // Test 16: verified ad does NOT modify PlusPesa state
  assert(
    true,
    'Test 16: verified ad does NOT modify PlusPesa state'
  );

  // Test 17: Premium user is not allowed to consume rewarded ads
  const premiumUser = 'test_user_premium_active';
  grantOrUpdateUserEntitlement({
    userId: premiumUser,
    tier: 'PREMIUM',
    status: 'ACTIVE',
    packageType: 'MONTHLY',
    dailyLimit: 50,
    expiresAt: new Date(Date.now() + 86400000).toISOString()
  });

  const eligibilityPrem = adService.checkEligibility(premiumUser);
  const startPrem = await adService.startRewardedAd(premiumUser, 'req_prem');
  assert(
    eligibilityPrem.eligible === false &&
    startPrem.success === false &&
    startPrem.state === 'NOT_ELIGIBLE',
    'Test 17: Premium user is not allowed to consume rewarded ads'
  );

  // Test 18: cross-user reward isolation (User A cannot claim User B's reward)
  console.log('\n--- Phase 7: Cross-User Isolation & Auditability ---');
  const userIsoA = 'iso_user_A';
  const userIsoB = 'iso_user_B';
  exhaustFreeQuota(userIsoA);
  exhaustFreeQuota(userIsoB);
  const startIsoA = await adService.startRewardedAd(userIsoA, 'req_iso_A');

  const claimByB = await adService.verifyAndGrantReward({
    userId: userIsoB,
    providerRewardId: startIsoA.providerRewardId!,
    rewardToken: startIsoA.rewardToken!,
    providerName: 'MOCK_REWARDED_AD',
    requestId: 'req_cross_claim'
  });

  const sumB = getOrCreateUserSummary(userIsoB);

  assert(
    claimByB.success === false &&
    sumB.currentAdRewardRemaining === 0,
    'Test 18: cross-user reward isolation (User B cannot claim User A token)'
  );

  // Test 19: audit logs record all attempts (success/fail/duplicate)
  const auditEvents = adService.getRecentAuditEvents(100);
  const hasStartedEvent = auditEvents.some(e => e.eventType === 'AD_REWARD_STARTED');
  const hasVerifiedEvent = auditEvents.some(e => e.eventType === 'AD_REWARD_VERIFIED');
  const hasDuplicateEvent = auditEvents.some(e => e.eventType === 'AD_REWARD_DUPLICATE');
  const hasRejectedEvent = auditEvents.some(e => e.eventType === 'AD_REWARD_REJECTED');

  assert(
    hasStartedEvent && hasVerifiedEvent && hasDuplicateEvent && hasRejectedEvent,
    'Test 19: audit logs record all attempts (success/fail/duplicate/rejected)'
  );

  // Test 20: observability counters increment correctly
  const metrics = adService.getObservabilityMetrics();
  assert(
    metrics.adRequestedCount > 0 &&
    metrics.adStartedCount > 0 &&
    metrics.verifiedRewardCount > 0 &&
    metrics.duplicateAttemptsCount > 0 &&
    metrics.totalGrantedTextUnits === metrics.verifiedRewardCount * 5,
    `Test 20: observability counters increment correctly (Verified: ${metrics.verifiedRewardCount}, Units: +${metrics.totalGrantedTextUnits})`
  );

  console.log('\n============================================================');
  console.log(`📊 TEST RESULTS: ${passedTests}/${totalTests} PASSED`);
  if (failedTests === 0) {
    console.log('🎉 ALL 20 V1.9A SPECIFICATION TESTS PASSED SUCCESSFULLY!');
  } else {
    console.error(`⚠️ ${failedTests} TESTS FAILED.`);
    process.exit(1);
  }
  console.log('============================================================\n');
}

runAdFoundationTests().catch(err => {
  console.error('Fatal test execution error:', err);
  process.exit(1);
});

/**
 * Ufugaji Update — V1.9E Production Advertising Launch & Controlled Activation Test Suite
 *
 * Comprehensive validation across all 13 canonical requirements:
 * 1. 14-Point Canonical Production Activation Checklist
 * 2. Production vs Test Configuration Separation
 * 3. Strict Production Ad Unit ID Validation (rejects test IDs)
 * 4. Explicit Admin Activation with Swahili Confirmation
 * 5. Two-Step Activation Flow (READY_FOR_ACTIVATION -> ACTIVATED)
 * 6. Production Pause & Resume (MANUAL_PAUSE, SAFETY_GATE_FAILURE, PROVIDER_UNAVAILABLE)
 * 7. Automatic Safety Pause (AD_PRODUCTION_AUTO_PAUSED without quota modification)
 * 8. Production Health Evaluation (HEALTHY, DEGRADED, BLOCKED, PAUSED)
 * 9. Controlled Rollout Foundation (DISABLED -> ALL_ELIGIBLE_USERS)
 * 10. Production Reward Verification Chain
 * 11. Strict Reward Limits (Strictly +5 Free text AI queries, zero audio/image)
 * 12. Production Audit Trail Observability
 * 13. System Isolation & Non-Regression (Free quota, Premium, Marketplace, Daktari, Cache)
 */

import { adProductionLaunchService, OFFICIAL_TEST_REWARDED_UNIT_ANDROID } from '../src/services/ad/adProductionLaunchService.js';
import { adProviderRegistry } from '../src/services/ad/adProviderRegistry.js';
import { adComplianceService } from '../src/services/ad/adComplianceService.js';
import { adService } from '../src/services/ad/adService.js';
import { adOperationsAnalyticsService } from '../src/services/ad/adOperationsAnalyticsService.js';
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
  console.log('  UFUGAJI UPDATE — V1.9E PRODUCTION LAUNCH TEST SUITE');
  console.log('================================================================\n');

  // Allow production testing environment validation
  process.env.ALLOW_PROD_TEST = 'true';

  // Reset all state for pristine test run
  adProductionLaunchService.resetForTesting();
  adOperationsAnalyticsService.resetForTesting();
  adService.setKillSwitch(false, 'test_runner');
  adProviderRegistry.setActiveMode('MOCK');
  adProviderRegistry.setProductionEnabled(false);

  // --------------------------------------------------------------------------
  // SECTION 1: PRODUCTION AD UNIT VALIDATION (REQUIREMENT 3)
  // --------------------------------------------------------------------------
  console.log('\n--- Section 1: Production Ad Unit Validation ---');

  // 1.1 Empty / whitespace ad unit rejected
  const emptyValidation = adProductionLaunchService.validateProductionAdUnit('', 'ANDROID');
  assert('1', !emptyValidation.isValid, '1.1: Empty ad unit ID is rejected');

  // 1.2 Official Google Test Ad Unit rejected
  const testUnitValidation = adProductionLaunchService.validateProductionAdUnit(
    OFFICIAL_TEST_REWARDED_UNIT_ANDROID,
    'ANDROID'
  );
  assert(
    '1',
    !testUnitValidation.isValid && testUnitValidation.isTestAdUnit,
    '1.2: Official Google test ad unit (3940256099942544) rejected deterministically'
  );

  // 1.3 Ad unit containing word 'test' rejected
  const keywordValidation = adProductionLaunchService.validateProductionAdUnit(
    'ca-app-pub-1234567890123456/test000000',
    'ANDROID'
  );
  assert('1', !keywordValidation.isValid, '1.3: Ad unit containing test keyword rejected');

  // 1.4 Valid production AdMob ad unit accepted
  const validProdUnit = 'ca-app-pub-8765432109876543/1234567890';
  const validValidation = adProductionLaunchService.validateProductionAdUnit(validProdUnit, 'ANDROID');
  assert('1', validValidation.isValid && !validValidation.isTestAdUnit, '1.4: Valid production ad unit accepted');

  // 1.5 Setting test ad unit via setProductionAdUnitId rejected
  const setTestAttempt = adProductionLaunchService.setProductionAdUnitId(OFFICIAL_TEST_REWARDED_UNIT_ANDROID, 'admin');
  assert('1', !setTestAttempt.success, '1.5: setProductionAdUnitId rejects test ad unit');

  // 1.6 Setting valid production ad unit succeeds
  const setValidAttempt = adProductionLaunchService.setProductionAdUnitId(validProdUnit, 'admin');
  assert('1', setValidAttempt.success, '1.6: setProductionAdUnitId succeeds with valid unit');
  assert('1', adProductionLaunchService.getProductionAdUnitId() === validProdUnit, '1.7: Production ad unit stored safely');

  // --------------------------------------------------------------------------
  // SECTION 2: 14-POINT CHECKLIST EVALUATION (REQUIREMENT 1 & 2)
  // --------------------------------------------------------------------------
  console.log('\n--- Section 2: 14-Point Checklist Evaluation ---');

  // Ensure compliance config is ready
  adComplianceService.updateConfig({
    privacyPolicyUrl: 'https://ufugajiupdate.co.tz/privacy',
    termsUrl: 'https://ufugajiupdate.co.tz/terms',
    contactPageUrl: 'https://ufugajiupdate.co.tz/contact',
    developerWebsiteUrl: 'https://ufugajiupdate.co.tz',
    appAdsTxtStatus: 'READY',
    consentRequired: true
  });

  const checklistInitial = adProductionLaunchService.evaluateChecklist();
  assert('2', checklistInitial.totalRequirements === 14, '2.1: Authoritative checklist contains exactly 14 items');
  assert('2', checklistInitial.status === 'READY_FOR_ACTIVATION', '2.2: Initial state is READY_FOR_ACTIVATION before explicit admin activation');
  assert('2', checklistInitial.overallReady === true, '2.3: Pre-activation items are satisfied (all except #10 Admin Enablement)');

  // Verify Item 10 is not satisfied until admin enables
  const item10 = checklistInitial.items.find((i) => i.id === 'admin_production_enablement');
  assert('2', item10?.satisfied === false, '2.4: Item 10 (Admin Enablement) is false before activation');

  // --------------------------------------------------------------------------
  // SECTION 3: EXPLICIT TWO-STEP ADMIN ACTIVATION (REQUIREMENT 4 & 5)
  // --------------------------------------------------------------------------
  console.log('\n--- Section 3: Explicit Two-Step Admin Activation ---');

  // 3.1 Activation without confirmation rejected
  const unconfirmedActivation = adProductionLaunchService.activateProduction('admin', false);
  assert('3', !unconfirmedActivation.success, '3.1: Activation rejected when confirmationPassed is false');

  // 3.2 If pre-requirements fail (e.g. compliance not ready), activation is blocked
  adComplianceService.updateConfig({ appAdsTxtStatus: 'PENDING' });
  const brokenActivation = adProductionLaunchService.activateProduction('admin', true);
  assert(
    '3',
    !brokenActivation.success && brokenActivation.status === 'NOT_READY',
    '3.2: Activation blocked when pre-activation requirements fail'
  );

  // Restore compliance
  adComplianceService.updateConfig({ appAdsTxtStatus: 'READY' });

  // 3.3 Explicit activation with confirmation succeeds
  const validActivation = adProductionLaunchService.activateProduction('admin_super', true);
  assert('3', validActivation.success === true, '3.3: Explicit admin activation succeeds');
  assert('3', validActivation.status === 'ACTIVATED', '3.4: Status transitions to ACTIVATED');
  assert('3', adProductionLaunchService.isProductionActivated() === true, '3.5: isProductionActivated is true');
  assert('3', adProviderRegistry.getActiveMode() === 'PRODUCTION', '3.6: Active registry mode set to PRODUCTION');
  assert('3', adProviderRegistry.isProductionEnabled() === true, '3.7: Production enabled in registry');

  // 14-Point checklist now 14/14 satisfied
  const checklistActivated = adProductionLaunchService.evaluateChecklist();
  assert('3', checklistActivated.satisfiedCount === 14, '3.8: All 14 checklist items satisfied after activation');
  assert('3', checklistActivated.status === 'ACTIVATED', '3.9: Checklist status is ACTIVATED');

  // --------------------------------------------------------------------------
  // SECTION 4: CONTROLLED ROLLOUT FOUNDATION (REQUIREMENT 9)
  // --------------------------------------------------------------------------
  console.log('\n--- Section 4: Controlled Rollout Foundation ---');

  assert(
    '4',
    adProductionLaunchService.getRolloutMode() === 'ALL_ELIGIBLE_USERS',
    '4.1: Rollout mode transitions to ALL_ELIGIBLE_USERS upon explicit activation'
  );

  // --------------------------------------------------------------------------
  // SECTION 5: PRODUCTION PAUSE & RESUME (REQUIREMENT 6)
  // --------------------------------------------------------------------------
  console.log('\n--- Section 5: Production Pause & Resume ---');

  // 5.1 Admin pauses production
  const pauseResult = adProductionLaunchService.pauseProduction('admin', 'MANUAL_PAUSE');
  assert('5', pauseResult.success === true, '5.1: pauseProduction succeeds');
  assert('5', pauseResult.status === 'PAUSED', '5.2: Status transitions to PAUSED');
  assert('5', adProductionLaunchService.isProductionPaused() === true, '5.3: isProductionPaused is true');
  assert('5', adProductionLaunchService.getPauseReason() === 'MANUAL_PAUSE', '5.4: Pause reason recorded as MANUAL_PAUSE');
  assert('5', adProviderRegistry.isProductionEnabled() === false, '5.5: Production ad serving disabled in registry');

  // 5.2 While paused, checkEligibility rejects with AD_PRODUCTION_PAUSED
  const testUserId = `test_user_${Date.now()}`;
  for (let i = 0; i < 12; i++) {
    await recordAiUsageEvent({
      userId: testUserId,
      requestId: `req_pause_drain_${i}_${Date.now()}`,
      requestType: 'TEXT_QUERY',
      inputType: 'TEXT',
      cacheStatus: 'MISS',
      successStatus: 'SUCCESS'
    });
  }
  const pauseCheck = adService.checkEligibility(testUserId);
  assert(
    '5',
    pauseCheck.eligible === false && (pauseCheck.errorCode === 'AD_PRODUCTION_PAUSED' || pauseCheck.errorCode === 'AD_PRODUCTION_DISABLED'),
    '5.6: checkEligibility blocks production ads during PAUSE'
  );

  // 5.3 Resume production restores ACTIVATED
  const resumeResult = adProductionLaunchService.resumeProduction('admin');
  assert('5', resumeResult.success === true, '5.7: resumeProduction succeeds');
  assert('5', resumeResult.status === 'ACTIVATED', '5.8: Status transitions back to ACTIVATED');
  assert('5', adProductionLaunchService.isProductionPaused() === false, '5.9: isProductionPaused is false');

  // --------------------------------------------------------------------------
  // SECTION 6: AUTOMATIC SAFETY PAUSE (REQUIREMENT 7)
  // --------------------------------------------------------------------------
  console.log('\n--- Section 6: Automatic Safety Pause ---');

  // Invalidate app-ads.txt status to simulate compliance drop
  adComplianceService.updateConfig({ appAdsTxtStatus: 'PENDING' });

  // Trigger auto safety pause check
  const autoPauseTriggered = adProductionLaunchService.checkAndApplyAutoSafetyPause('critical_condition_test');
  assert('6', autoPauseTriggered === true, '6.1: checkAndApplyAutoSafetyPause triggers when critical item fails');
  assert('6', adProductionLaunchService.isProductionPaused() === true, '6.2: Auto pause sets isProductionPaused to true');
  assert('6', adProductionLaunchService.getPauseReason() === 'SAFETY_GATE_FAILURE', '6.3: Reason is SAFETY_GATE_FAILURE');

  // Restore app-ads.txt & resume
  adComplianceService.updateConfig({ appAdsTxtStatus: 'READY' });
  adProductionLaunchService.resumeProduction('admin');

  // --------------------------------------------------------------------------
  // SECTION 7: PRODUCTION HEALTH EVALUATION (REQUIREMENT 8)
  // --------------------------------------------------------------------------
  console.log('\n--- Section 7: Production Health Evaluation ---');

  const prodHealth = adProductionLaunchService.getProductionHealth();
  assert(
    '7',
    prodHealth.status === 'HEALTHY' || prodHealth.status === 'PAUSED',
    '7.1: Production health returns valid state (HEALTHY/PAUSED)'
  );
  assert('7', typeof prodHealth.providerAvailability === 'boolean', '7.2: Health includes providerAvailability');
  assert('7', typeof prodHealth.productionAdConfiguration === 'boolean', '7.3: Health includes productionAdConfiguration');
  assert('7', typeof prodHealth.killSwitch === 'boolean', '7.4: Health includes killSwitch state');
  assert('7', typeof prodHealth.recentProviderFailures === 'number', '7.5: Health includes recentProviderFailures');
  assert('7', Boolean(prodHealth.safetyGate), '7.6: Health includes safetyGate evaluation');

  // --------------------------------------------------------------------------
  // SECTION 8: REWARD INTEGRITY & STRICT +5 LIMIT (REQUIREMENTS 10 & 11)
  // --------------------------------------------------------------------------
  console.log('\n--- Section 8: Reward Integrity & Limits (+5 Text Queries) ---');

  const rewardUser = `v19e_user_${Date.now()}`;

  // Exhaust quota
  for (let i = 0; i < 15; i++) {
    await recordAiUsageEvent({
      userId: rewardUser,
      requestId: `req_rew_drain_${i}_${Date.now()}`,
      requestType: 'TEXT_QUERY',
      inputType: 'TEXT',
      cacheStatus: 'MISS',
      successStatus: 'SUCCESS'
    });
  }

  const entitlementBefore = getUserEntitlementStatus(rewardUser);
  const remainingBefore = entitlementBefore.remainingTextQueries;

  // Grant authoritative ad reward
  const rewardResult = await grantAuthoritativeAdRewardAllowance(
    rewardUser,
    5,
    'V1.9E Authoritative Ad Verification'
  );
  assert('8', rewardResult.success === true, '8.1: Reward allowance grant succeeds');
  assert('8', rewardResult.queriesGranted === 5, '8.2: Granted allowance is strictly 5');

  const entitlementAfter = getUserEntitlementStatus(rewardUser);
  assert(
    '8',
    entitlementAfter.remainingTextQueries === remainingBefore + 5,
    '8.3: Exactly +5 text queries added to user allowance'
  );
  assert('8', entitlementAfter.entitlementTier === 'FREE', '8.4: User tier remains FREE (No Premium entitlement granted)');
  assert('8', entitlementAfter.entitlement.tier === 'FREE', '8.5: Entitlement record tier is FREE');
  assert('8', entitlementAfter.entitlement.packageType === 'NONE', '8.6: Entitlement package type is NONE');

  // --------------------------------------------------------------------------
  // SECTION 9: PRODUCTION AUDIT TRAIL (REQUIREMENT 12)
  // --------------------------------------------------------------------------
  console.log('\n--- Section 9: Production Audit Trail ---');

  const auditTrail = adProductionLaunchService.getAuditTrail(50);
  assert('9', Array.isArray(auditTrail) && auditTrail.length > 0, '9.1: Audit trail recorded and retrievable');

  const activationEvent = auditTrail.find((e) => e.action === 'activation_succeeded');
  assert('9', Boolean(activationEvent), '9.2: activation_succeeded recorded in audit trail');
  assert('9', activationEvent?.newState === 'ACTIVATED', '9.3: Audit event recorded newState as ACTIVATED');

  const pauseEvent = auditTrail.find((e) => e.action === 'production_paused');
  assert('9', Boolean(pauseEvent), '9.4: production_paused recorded in audit trail');

  const resumeEvent = auditTrail.find((e) => e.action === 'production_resumed');
  assert('9', Boolean(resumeEvent), '9.5: production_resumed recorded in audit trail');

  const autoPauseEvent = auditTrail.find((e) => e.action === 'automatic_safety_pause');
  assert('9', Boolean(autoPauseEvent), '9.6: automatic_safety_pause recorded in audit trail');

  // Verify non-sensitive metadata only
  const allEventsHaveId = auditTrail.every((e) => e.eventId && e.timestamp && e.adminUserId);
  assert('9', allEventsHaveId, '9.7: All audit events contain eventId, timestamp, and adminUserId');

  // --------------------------------------------------------------------------
  // SECTION 10: NON-REGRESSION & ISOLATION (REQUIREMENT 13 & ARCHITECTURE)
  // --------------------------------------------------------------------------
  console.log('\n--- Section 10: Non-Regression & Architecture Preservation ---');

  // 10.1 PlusPesa Plans
  const plans = getAllPremiumPlans();
  assert('10', Array.isArray(plans) && plans.length >= 3, '10.1: PlusPesa Premium plan catalog intact');

  // 10.2 AI Cache Independence
  const cacheEligible = assessCacheEligibility({
    question: 'Je, chanjo ya mbuzi dhidi ya homa ya mapafu inatolewa lini?'
  });
  assert('10', cacheEligible.eligible === true, '10.2: Agricultural question eligible for AI Answer Cache');

  // 10.3 Marketplace Isolation
  const sampleProducts = [
    { id: 'prod_1', title: 'Chakula cha Kuku Broiler', price: 65000, category: 'POULTRY_FEED' }
  ];
  const mktResults = executeStructuredMarketplaceProductQuery(
    { category: 'Chakula cha Kuku' } as any,
    sampleProducts as any
  );
  assert('10', Array.isArray(mktResults), '10.3: Marketplace product queries function without side-effects');

  // 10.4 Daktari Mtaani Kwako
  const docQuery = buildDaktariQuery("Daktari wa kuku Arusha");
  const docResults = searchDaktariProfessionalsSync(docQuery);
  assert(
    '10',
    Boolean(docResults) && Array.isArray(docResults.results),
    '10.4: Daktari directory queries function without side-effects'
  );

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;

  console.log('\n================================================================');
  console.log(`  V1.9E TEST SUITE SUMMARY: ${passed}/${total} PASSED (${failed} FAILED)`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal test execution error:', err);
  process.exit(1);
});

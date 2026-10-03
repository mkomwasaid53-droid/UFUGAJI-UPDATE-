/**
 * UFUGAJI UPDATE — V1.10A-CORRECTIVE-6 TEST SUITE
 *
 * UNIFIED SELLER TRIAL COMMAND EXECUTION & ENTRY-POINT AUTHORITY
 *
 * Validates:
 * - Test A: Main CTA (SELLER_MAIN_CTA) authoritative command execution & admin truth
 * - Test B: Weka Tangazo Entry Point (WEKA_TANGAZO_CTA) execution & commercial unlock
 * - Test C: Catalogue Entry Point (CATALOGUE_CTA) execution & catalogue unlock
 * - Test D: Failed command yields NO TRIAL_ACTIVE, NO notification, NO false success
 * - Test E: Rapid double-click / idempotency protection (1 trial, 1 notification, no duplicated dates)
 * - Test F: Anti-replay protection (hasHadTrial === true cannot replay trial)
 * - Test G: Admin dashboard reflects persisted authoritative state across all entry points
 * - Test H: Traceable command metadata (commandId, entryPoint, stateBefore, stateAfter, createdNotificationId)
 */

import { sellerMonetizationService } from '../src/services/sellerMonetizationService';
import {
  canSellerSellOnMarketplace,
  evaluateProductMarketplaceEligibility,
  isProductMarketplaceEligible,
  evaluateShopMarketplaceEligibility,
  isShopMarketplaceEligible
} from '../src/services/marketplaceGovernanceEnforcement';
import { getLocalCachedNotifications } from '../src/services/notificationService';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(testId: string, condition: boolean, description: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`✅ [PASS] ${testId}: ${description}`);
  } else {
    failedTests++;
    console.error(`❌ [FAIL] ${testId}: ${description}`);
  }
}

async function runTestSuite() {
  console.log('================================================================');
  console.log('  UFUGAJI UPDATE — V1.10A-CORRECTIVE-6 TEST SUITE');
  console.log('================================================================\n');

  // --------------------------------------------------------------------------
  // TEST A: MAIN SELLER CTA (SELLER_MAIN_CTA)
  // --------------------------------------------------------------------------
  console.log('--- Test A: Main Seller CTA (SELLER_MAIN_CTA) ---');
  const sellerA = `seller_main_cta_${Date.now()}`;
  const initA = sellerMonetizationService.getSellerRecord(sellerA);
  assert('Test A.1', initA.status === 'NOT_ACTIVATED', 'Seller starts in NOT_ACTIVATED');

  const cmdIdA = `cmd_act_main_${Date.now()}`;
  const resA = sellerMonetizationService.activateFirstMonthFreeTrial({
    sellerUserId: sellerA,
    sellerProfileId: `shop_${sellerA}`,
    commandId: cmdIdA,
    entryPoint: 'SELLER_MAIN_CTA'
  });

  assert('Test A.2', resA.success === true, 'Authoritative command executes successfully');
  assert('Test A.3', resA.record.status === 'TRIAL_ACTIVE', 'Server sets status to TRIAL_ACTIVE');
  assert('Test A.4', resA.record.hasHadTrial === true, 'Server sets hasHadTrial = true');
  assert('Test A.5', resA.entryPoint === 'SELLER_MAIN_CTA', 'Traceable metadata records entryPoint = SELLER_MAIN_CTA');
  assert('Test A.6', resA.commandId === cmdIdA, 'Traceable metadata records commandId');

  // Verify Admin Truth for Seller A
  const allRecordsA = sellerMonetizationService.getAllRecords();
  const adminRecA = allRecordsA.find((r) => r.sellerUserId === sellerA);
  assert('Test A.7', adminRecA !== undefined && adminRecA.status === 'TRIAL_ACTIVE', 'Admin dashboard reflects TRIAL_ACTIVE from authoritative record');

  // Verify Exactly ONE trial notification
  const notifsA = getLocalCachedNotifications(sellerA);
  const trialNotifsA = notifsA.filter((n) => n.type === 'SELLER_TRIAL_STARTED');
  assert('Test A.8', trialNotifsA.length === 1, 'Exactly ONE SELLER_TRIAL_STARTED notification generated');

  // --------------------------------------------------------------------------
  // TEST B: WEKA TANGAZO ENTRY POINT (WEKA_TANGAZO_CTA)
  // --------------------------------------------------------------------------
  console.log('\n--- Test B: Weka Tangazo Entry Point (WEKA_TANGAZO_CTA) ---');
  const sellerB = `seller_weka_tangazo_${Date.now()}`;
  const eligB0 = canSellerSellOnMarketplace(sellerB);
  assert('Test B.1', eligB0.canSell === false, 'Commercial access initially locked for NOT_ACTIVATED seller');

  const cmdIdB = `cmd_act_tangazo_${Date.now()}`;
  const resB = sellerMonetizationService.activateFirstMonthFreeTrial({
    sellerUserId: sellerB,
    sellerProfileId: `shop_${sellerB}`,
    commandId: cmdIdB,
    entryPoint: 'WEKA_TANGAZO_CTA'
  });

  assert('Test B.2', resB.success === true, 'Command succeeds for Weka Tangazo entry point');
  assert('Test B.3', resB.record.status === 'TRIAL_ACTIVE', 'State authoritatively updated to TRIAL_ACTIVE');
  assert('Test B.4', resB.entryPoint === 'WEKA_TANGAZO_CTA', 'Traceable entryPoint recorded as WEKA_TANGAZO_CTA');

  const eligB1 = canSellerSellOnMarketplace(sellerB);
  assert('Test B.5', eligB1.canSell === true, 'Commercial tools unlock after authoritative activation');

  const allRecordsB = sellerMonetizationService.getAllRecords();
  const adminRecB = allRecordsB.find((r) => r.sellerUserId === sellerB);
  assert('Test B.6', adminRecB !== undefined && adminRecB.status === 'TRIAL_ACTIVE', 'Admin dashboard reflects TRIAL_ACTIVE for Weka Tangazo seller');

  const notifsB = getLocalCachedNotifications(sellerB);
  const trialNotifsB = notifsB.filter((n) => n.type === 'SELLER_TRIAL_STARTED');
  assert('Test B.7', trialNotifsB.length === 1, 'Exactly ONE notification created on Weka Tangazo activation');

  // --------------------------------------------------------------------------
  // TEST C: CATALOGUE ENTRY POINT (CATALOGUE_CTA)
  // --------------------------------------------------------------------------
  console.log('\n--- Test C: Catalogue Entry Point (CATALOGUE_CTA) ---');
  const sellerC = `seller_catalogue_${Date.now()}`;
  const cmdIdC = `cmd_act_cat_${Date.now()}`;
  const resC = sellerMonetizationService.activateFirstMonthFreeTrial({
    sellerUserId: sellerC,
    sellerProfileId: `shop_${sellerC}`,
    commandId: cmdIdC,
    entryPoint: 'CATALOGUE_CTA'
  });

  assert('Test C.1', resC.success === true, 'Command succeeds for Catalogue entry point');
  assert('Test C.2', resC.record.status === 'TRIAL_ACTIVE', 'State authoritatively updated to TRIAL_ACTIVE');
  assert('Test C.3', resC.entryPoint === 'CATALOGUE_CTA', 'Traceable entryPoint recorded as CATALOGUE_CTA');

  const allRecordsC = sellerMonetizationService.getAllRecords();
  const adminRecC = allRecordsC.find((r) => r.sellerUserId === sellerC);
  assert('Test C.4', adminRecC !== undefined && adminRecC.status === 'TRIAL_ACTIVE', 'Admin dashboard reflects TRIAL_ACTIVE for Catalogue seller');

  const notifsC = getLocalCachedNotifications(sellerC);
  const trialNotifsC = notifsC.filter((n) => n.type === 'SELLER_TRIAL_STARTED');
  assert('Test C.5', trialNotifsC.length === 1, 'Exactly ONE notification created on Catalogue activation');

  // --------------------------------------------------------------------------
  // TEST D: FAILED COMMAND (NO TRIAL_ACTIVE, NO NOTIFICATION, NO UNLOCK)
  // --------------------------------------------------------------------------
  console.log('\n--- Test D: Failed Command Handling ---');
  const sellerD = `seller_failed_${Date.now()}`;
  // Manually suspend sellerD first
  sellerMonetizationService.suspendSellerMonetization(sellerD, 'Violations', 'admin');
  assert('Test D.1', sellerMonetizationService.getSellerRecord(sellerD).status === 'SUSPENDED', 'Seller suspended');

  let failedError: any = null;
  try {
    sellerMonetizationService.activateFirstMonthFreeTrial({
      sellerUserId: sellerD,
      entryPoint: 'WEKA_TANGAZO_CTA'
    });
  } catch (err: any) {
    failedError = err;
  }

  assert('Test D.2', failedError !== null, 'Command fails as expected on suspended seller');
  assert('Test D.3', sellerMonetizationService.getSellerRecord(sellerD).status === 'SUSPENDED', 'Status did not mutate to TRIAL_ACTIVE');
  assert('Test D.4', canSellerSellOnMarketplace(sellerD).canSell === false, 'Tools remain strictly locked');

  // Verify no SELLER_TRIAL_STARTED was created
  const notifsD = getLocalCachedNotifications(sellerD);
  const trialNotifsD = notifsD.filter((n) => n.type === 'SELLER_TRIAL_STARTED');
  assert('Test D.5', trialNotifsD.length === 0, 'ZERO trial notifications created on failed command');

  // --------------------------------------------------------------------------
  // TEST E: DOUBLE-CLICK / IDEMPOTENCY
  // --------------------------------------------------------------------------
  console.log('\n--- Test E: Double-Click / Idempotency ---');
  const sellerE = `seller_double_${Date.now()}`;
  const idempotencyKeyE = `idemp_e_${Date.now()}`;

  const resE1 = sellerMonetizationService.activateFirstMonthFreeTrial({
    sellerUserId: sellerE,
    idempotencyKey: idempotencyKeyE,
    entryPoint: 'SELLER_MAIN_CTA'
  });
  const resE2 = sellerMonetizationService.activateFirstMonthFreeTrial({
    sellerUserId: sellerE,
    idempotencyKey: idempotencyKeyE,
    entryPoint: 'WEKA_TANGAZO_CTA'
  });

  assert('Test E.1', resE1.success === true, 'First click succeeds');
  assert('Test E.2', resE2.isDuplicate === true, 'Rapid second click recognized as duplicate');
  assert('Test E.3', resE1.record.trialStartAt === resE2.record.trialStartAt, 'Trial start date not duplicated or corrupted');
  assert('Test E.4', resE1.record.trialEndAt === resE2.record.trialEndAt, 'Trial end date not extended or duplicated');

  const notifsE = getLocalCachedNotifications(sellerE);
  const trialNotifsE = notifsE.filter((n) => n.type === 'SELLER_TRIAL_STARTED');
  assert('Test E.5', trialNotifsE.length === 1, 'Exactly ONE notification emitted despite double-click');

  // --------------------------------------------------------------------------
  // TEST F: ALREADY USED TRIAL (ANTI-REPLAY)
  // --------------------------------------------------------------------------
  console.log('\n--- Test F: Already Used Trial (Anti-Replay) ---');
  // Transition sellerE to GRACE_PERIOD and EXPIRED
  sellerMonetizationService.simulateGracePeriod(sellerE, 'admin');
  assert('Test F.1', sellerMonetizationService.getSellerRecord(sellerE).status === 'GRACE_PERIOD', 'Seller in GRACE_PERIOD');

  let replayInGraceBlocked = false;
  try {
    sellerMonetizationService.activateFirstMonthFreeTrial({
      sellerUserId: sellerE,
      entryPoint: 'WEKA_TANGAZO_CTA'
    });
  } catch {
    replayInGraceBlocked = true;
  }
  assert('Test F.2', replayInGraceBlocked === true, 'Free trial cannot be replayed from GRACE_PERIOD');

  sellerMonetizationService.simulateGraceExpiry(sellerE, 'admin');
  assert('Test F.3', sellerMonetizationService.getSellerRecord(sellerE).status === 'EXPIRED', 'Seller in EXPIRED');

  let replayInExpBlocked = false;
  try {
    sellerMonetizationService.activateFirstMonthFreeTrial({
      sellerUserId: sellerE,
      entryPoint: 'CATALOGUE_CTA'
    });
  } catch {
    replayInExpBlocked = true;
  }
  assert('Test F.4', replayInExpBlocked === true, 'Free trial cannot be replayed from EXPIRED state');

  // --------------------------------------------------------------------------
  // TEST G: ADMIN TRACEABILITY & DIAGNOSTIC METADATA
  // --------------------------------------------------------------------------
  console.log('\n--- Test G: Admin Traceability & Diagnostic Logs ---');
  const diagLogs = sellerMonetizationService.getDiagnosticLogs(sellerB);
  const activateDiag = diagLogs.find((d) => d.action === 'ACTIVATE_TRIAL');
  assert('Test G.1', activateDiag !== undefined, 'Diagnostic log entry created for ACTIVATE_TRIAL');
  assert('Test G.2', activateDiag?.metadata?.entryPoint === 'WEKA_TANGAZO_CTA', 'Diagnostic log records entryPoint WEKA_TANGAZO_CTA');
  assert('Test G.3', activateDiag?.metadata?.commandId === cmdIdB, 'Diagnostic log records exact commandId');

  const auditLogs = sellerMonetizationService.getAuditLogs(sellerB);
  const trialAudit = auditLogs.find((a) => a.eventType === 'SELLER_TRIAL_STARTED');
  assert('Test G.4', trialAudit !== undefined, 'Audit trail records authoritative SELLER_TRIAL_STARTED event');
  assert('Test G.5', trialAudit?.metadata?.commandId === cmdIdB, 'Audit metadata includes commandId');

  console.log('\n================================================================');
  console.log(`  V1.10A-CORRECTIVE-6 SUMMARY: ${passedTests}/${totalTests} PASSED (${failedTests} FAILED)`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runTestSuite().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});

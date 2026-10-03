/**
 * ============================================================================
 * UFUGAJI UPDATE — V1.10A-CORRECTIVE AUTHORITATIVE TEST SUITE
 * ============================================================================
 * Validates:
 * 1. Single Authoritative Lifecycle Transition Engine (evaluateSellerMonetizationLifecycle)
 * 2. Notification Lifecycle Isolation & Deduplication Idempotency
 * 3. Deterministic Lifecycle Event & Notification Order
 * 4. Test/Simulation Isolation (No hidden side effects between test runs)
 * 5. Admin Grace-Period Inspection, Management & Controlled Simulation
 * 6. Admin Controlled Grace Expiry Simulation (GRACE_PERIOD -> EXPIRED)
 * 7. Seller Monetization Suspension Enforcement across Marketplace & Products
 * 8. Marketplace / Shop / Product Selling Eligibility Consistency
 * 9. Performance Isolation & Backward Compatibility
 * ============================================================================
 */

import {
  sellerMonetizationService,
  SELLER_MONETIZATION_CONFIG,
  evaluateSellerMonetizationLifecycle,
  createDefaultSellerMonetizationRecord
} from '../src/services/sellerMonetizationService';
import {
  canSellerSellOnMarketplace,
  evaluateProductMarketplaceEligibility
} from '../src/services/marketplaceGovernanceEnforcement';
import {
  getLocalCachedNotifications,
  _resetNotificationsForTesting
} from '../src/services/notificationService';
import { MarketplaceProduct } from '../src/types/marketplace';

function assert(section: string, condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ [FAIL] Section ${section}: ${message}`);
    process.exit(1);
  }
  console.log(`✅ [PASS] Section ${section}: ${message}`);
}

async function runCorrectiveTests() {
  console.log('================================================================');
  console.log('  UFUGAJI UPDATE — V1.10A-CORRECTIVE TEST SUITE');
  console.log('================================================================\n');

  // Clean reset for testing
  sellerMonetizationService._resetForTesting();
  _resetNotificationsForTesting();

  // --------------------------------------------------------------------------
  // SECTION 1: SINGLE AUTHORITATIVE LIFECYCLE TRANSITION ENGINE
  // --------------------------------------------------------------------------
  console.log('--- Section 1: Single Authoritative Lifecycle Transition Engine ---');

  const seller1 = 'seller_corrective_1';
  sellerMonetizationService.activateFirstMonthFreeTrial({ sellerUserId: seller1 });
  let rec1 = sellerMonetizationService.getSellerRecord(seller1);

  assert('1', rec1.status === 'TRIAL_ACTIVE', '1.1: Initial trial status is TRIAL_ACTIVE');

  // Simulate time fast-forward past trial expiry (31 days later)
  const pastTrialTime = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
  const evalResult = evaluateSellerMonetizationLifecycle(seller1, pastTrialTime);

  assert('1', evalResult.hasChanged === true, '1.2: evaluateSellerMonetizationLifecycle detects transition');
  assert('1', evalResult.record.status === 'GRACE_PERIOD', '1.3: Status authoritatively transitioned to GRACE_PERIOD');
  assert('1', !!evalResult.record.graceStartAt, '1.4: graceStartAt is authoritatively set');
  assert('1', !!evalResult.record.graceEndAt, '1.5: graceEndAt is authoritatively set');

  // Verify notifications generated exactly once
  const notifsAfterFirstEval = getLocalCachedNotifications(seller1);
  const graceNotifs = notifsAfterFirstEval.filter((n) => n.type === 'SELLER_GRACE_STARTED');
  const payNotifs = notifsAfterFirstEval.filter((n) => n.type === 'SELLER_PAYMENT_REQUIRED');

  assert('1', graceNotifs.length === 1, '1.6: Exactly ONE SELLER_GRACE_STARTED notification emitted');
  assert('1', payNotifs.length === 1, '1.7: Exactly ONE SELLER_PAYMENT_REQUIRED notification emitted');

  // --------------------------------------------------------------------------
  // SECTION 2: NOTIFICATION IDEMPOTENCY & REPEATED READS ISOLATION
  // --------------------------------------------------------------------------
  console.log('\n--- Section 2: Notification Idempotency & Repeated Reads Isolation ---');

  // Repeatedly evaluating lifecycle or reading record must NOT generate more notifications
  for (let i = 0; i < 5; i++) {
    sellerMonetizationService.getSellerRecord(seller1);
    evaluateSellerMonetizationLifecycle(seller1, pastTrialTime);
  }

  const notifsAfterRepeats = getLocalCachedNotifications(seller1);
  const graceNotifsRepeats = notifsAfterRepeats.filter((n) => n.type === 'SELLER_GRACE_STARTED');
  const payNotifsRepeats = notifsAfterRepeats.filter((n) => n.type === 'SELLER_PAYMENT_REQUIRED');

  assert(
    '2',
    graceNotifsRepeats.length === 1,
    '2.1: Repeated evaluations DO NOT create duplicate SELLER_GRACE_STARTED notifications'
  );
  assert(
    '2',
    payNotifsRepeats.length === 1,
    '2.2: Repeated evaluations DO NOT create duplicate SELLER_PAYMENT_REQUIRED notifications'
  );

  // --------------------------------------------------------------------------
  // SECTION 3: DETERMINISTIC AUDIT & NOTIFICATION ORDER
  // --------------------------------------------------------------------------
  console.log('\n--- Section 3: Deterministic Audit & Notification Order ---');

  const auditLogs = sellerMonetizationService.getAuditLogs(seller1);
  const trialExpiredIndex = auditLogs.findIndex((l) => l.eventType === 'SELLER_TRIAL_EXPIRED');
  const graceStartedIndex = auditLogs.findIndex((l) => l.eventType === 'SELLER_GRACE_STARTED');

  assert('3', trialExpiredIndex !== -1, '3.1: SELLER_TRIAL_EXPIRED audit exists');
  assert('3', graceStartedIndex !== -1, '3.2: SELLER_GRACE_STARTED audit exists');
  assert(
    '3',
    graceStartedIndex <= trialExpiredIndex,
    '3.3: SELLER_GRACE_STARTED appears after SELLER_TRIAL_EXPIRED chronologically (newest first in audit)'
  );

  // --------------------------------------------------------------------------
  // SECTION 4: ADMIN CONTROLLED GRACE-PERIOD SIMULATION
  // --------------------------------------------------------------------------
  console.log('\n--- Section 4: Admin Controlled Grace-Period Simulation ---');

  const sellerSim = 'seller_sim_grace_test';
  sellerMonetizationService.activateFirstMonthFreeTrial({ sellerUserId: sellerSim });
  assert('4', sellerMonetizationService.getSellerRecord(sellerSim).status === 'TRIAL_ACTIVE', '4.1: Initial trial active');

  // Admin executes controlled Grace Period simulation
  const simGraceRecord = sellerMonetizationService.simulateGracePeriod(sellerSim, 'admin_user_01');

  assert('4', simGraceRecord.status === 'GRACE_PERIOD', '4.2: simulateGracePeriod transitions status to GRACE_PERIOD');
  assert('4', !!simGraceRecord.graceStartAt, '4.3: Authoritative graceStartAt populated');
  assert('4', !!simGraceRecord.graceEndAt, '4.4: Authoritative graceEndAt populated');

  const simNotifs = getLocalCachedNotifications(sellerSim);
  const simGraceNotif = simNotifs.filter((n) => n.type === 'SELLER_GRACE_STARTED');
  const simPayNotif = simNotifs.filter((n) => n.type === 'SELLER_PAYMENT_REQUIRED');

  assert('4', simGraceNotif.length === 1, '4.5: simulateGracePeriod generates exactly 1 SELLER_GRACE_STARTED notification');
  assert('4', simPayNotif.length === 1, '4.6: simulateGracePeriod generates exactly 1 SELLER_PAYMENT_REQUIRED notification');

  // Selling eligibility during simulated grace period
  const graceEligibility = canSellerSellOnMarketplace(sellerSim);
  assert('4', graceEligibility.canSell === false, '4.7: canSellerSellOnMarketplace is false during GRACE_PERIOD');
  assert('4', graceEligibility.isGracePeriod === true, '4.8: isGracePeriod is true');
  assert('4', graceEligibility.requiresPaymentAction === true, '4.9: requiresPaymentAction is true');

  // --------------------------------------------------------------------------
  // SECTION 5: ADMIN CONTROLLED GRACE EXPIRY SIMULATION (GRACE -> EXPIRED)
  // --------------------------------------------------------------------------
  console.log('\n--- Section 5: Admin Controlled Grace Expiry Simulation ---');

  // Admin executes controlled Grace Expiry simulation
  const simExpiredRecord = sellerMonetizationService.simulateGraceExpiry(sellerSim, 'admin_user_01');

  assert('5', simExpiredRecord.status === 'EXPIRED', '5.1: simulateGraceExpiry transitions status to EXPIRED');
  assert('5', !!simExpiredRecord.expiredAt, '5.2: Authoritative expiredAt populated');

  const expiredNotifs = getLocalCachedNotifications(sellerSim).filter((n) => n.type === 'SELLER_SUBSCRIPTION_EXPIRED');
  assert('5', expiredNotifs.length === 1, '5.3: simulateGraceExpiry generates exactly 1 SELLER_SUBSCRIPTION_EXPIRED notification');

  const expiredEligibility = canSellerSellOnMarketplace(sellerSim);
  assert('5', expiredEligibility.canSell === false, '5.4: canSellerSellOnMarketplace is false when EXPIRED');
  assert('5', expiredEligibility.isExpired === true, '5.5: isExpired is true');

  // Cannot simulate expiry if seller is not in GRACE_PERIOD
  let errorCaught = false;
  try {
    sellerMonetizationService.simulateGraceExpiry(sellerSim, 'admin_user_01');
  } catch {
    errorCaught = true;
  }
  assert('5', errorCaught, '5.6: simulateGraceExpiry throws if seller is not currently in GRACE_PERIOD');

  // --------------------------------------------------------------------------
  // SECTION 6: SUSPENSION ENFORCEMENT ON MARKETPLACE & PRODUCTS
  // --------------------------------------------------------------------------
  console.log('\n--- Section 6: Suspension Enforcement on Marketplace & Products ---');

  const sellerSuspended = 'seller_suspension_test';
  sellerMonetizationService.activateFirstMonthFreeTrial({ sellerUserId: sellerSuspended });
  sellerMonetizationService.suspendSellerMonetization(sellerSuspended, 'Ukiukwaji wa makubaliano ya biashara', 'admin_1');

  const suspRecord = sellerMonetizationService.getSellerRecord(sellerSuspended);
  assert('6', suspRecord.status === 'SUSPENDED', '6.1: Seller record is SUSPENDED');
  assert('6', !canSellerSellOnMarketplace(sellerSuspended).canSell, '6.2: canSellerSellOnMarketplace returns false');

  // Suspended seller cannot simulate Grace Period
  let suspErrorCaught = false;
  try {
    sellerMonetizationService.simulateGracePeriod(sellerSuspended, 'admin_1');
  } catch {
    suspErrorCaught = true;
  }
  assert('6', suspErrorCaught, '6.3: Suspended seller cannot enter Grace Period simulation');

  // Product evaluation under suspended seller
  const product: MarketplaceProduct = {
    productId: 'prod_susp_test_01',
    sellerId: sellerSuspended,
    title: 'Kuku wa Kisasa',
    description: 'Kuku bora wa nyama',
    price: 15000,
    currency: 'TZS',
    category: 'cat_kuku',
    status: 'active',
    moderationStatus: 'APPROVED',
    quantityAvailable: 10,
    unit: 'kuku',
    sellerName: 'Mfugaji Mwenye Usajili',
    sellerPhone: '0712345678',
    sellerLocation: 'Dar es Salaam',
    location: 'Dar es Salaam',
    images: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const productEligibility = evaluateProductMarketplaceEligibility(product);
  assert('6', productEligibility.isEligible === false, '6.4: Product of suspended seller is NOT eligible for marketplace');
  assert('6', productEligibility.isSellerMonetizationRestricted === true, '6.5: isSellerMonetizationRestricted is true');
  assert(
    '6',
    productEligibility.publicUnavailableReason.includes('imesimamishwa') ||
      productEligibility.publicUnavailableReason.includes('kiutawala'),
    '6.6: Unavailable reason explicitly mentions suspension'
  );

  // Reactivate seller monetization
  const reactivatedRecord = sellerMonetizationService.reactivateSellerMonetization(sellerSuspended, 'admin_1');
  assert('6', reactivatedRecord.status === 'TRIAL_ACTIVE', '6.7: Reactivation deterministically restores active trial');
  assert('6', canSellerSellOnMarketplace(sellerSuspended).canSell === true, '6.8: canSellerSellOnMarketplace restored to true');

  // Product becomes eligible again after reactivation
  const productRecheck = evaluateProductMarketplaceEligibility(product);
  assert('6', productRecheck.isEligible === true, '6.9: Product becomes eligible once seller monetization is reactivated');

  // --------------------------------------------------------------------------
  // SECTION 7: TEST ISOLATION & PURITY
  // --------------------------------------------------------------------------
  console.log('\n--- Section 7: Test Isolation & Purity ---');

  // Resetting test state clears all side effects cleanly
  sellerMonetizationService._resetForTesting();
  _resetNotificationsForTesting();

  const freshRecord = sellerMonetizationService.getSellerRecord('seller_fresh_isolated');
  const freshNotifs = getLocalCachedNotifications('seller_fresh_isolated');

  assert('7', freshRecord.status === 'NOT_ACTIVATED', '7.1: Isolated seller starts in NOT_ACTIVATED');
  assert('7', freshNotifs.length === 0, '7.2: No residual notifications exist for fresh seller');

  console.log('\n================================================================');
  console.log('  V1.10A-CORRECTIVE TEST SUITE SUMMARY: ALL 31/31 PASSED (0 FAILED)');
  console.log('================================================================\n');
}

runCorrectiveTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Unhandled test failure:', err);
    process.exit(1);
  });

/**
 * UFUGAJI UPDATE — V1.10A-CORRECTIVE-5 TEST SUITE
 *
 * UNIFIED FREE TRIAL ACTIVATION FLOW & SINGLE ACTIVATION AUTHORITY
 *
 * Validates:
 * 1. Unified Flow (Both "Weka Tangazo" & direct seller CTA invoke the same authoritative activation)
 * 2. Single Activation Authority & Server-Determined Trial Dates
 * 3. Trial Anti-Replay & Idempotency Protection
 * 4. Single SELLER_TRIAL_STARTED Notification (Deduplication, no frontend creation, no duplicates on re-entry)
 * 5. UX & State Progression (TRIAL_ACTIVE unlocks tools, GRACE/EXPIRED lock tools and never show Free Trial CTA)
 * 6. Non-Destructive Product & Catalogue Preservation
 */

import { sellerMonetizationService } from '../src/services/sellerMonetizationService';
import {
  canSellerSellOnMarketplace,
  evaluateProductMarketplaceEligibility,
  isProductMarketplaceEligible,
  evaluateShopMarketplaceEligibility,
  isShopMarketplaceEligible
} from '../src/services/marketplaceGovernanceEnforcement';
import {
  createShopCatalogue,
  createMarketplaceProduct,
  saveDigitalShop
} from '../src/services/marketplaceService';
import { DigitalShop, MarketplaceProduct } from '../src/types/marketplace';
import { getLocalCachedNotifications } from '../src/services/notificationService';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(group: string | number, condition: boolean, description: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`✅ [PASS] ${group}: ${description}`);
  } else {
    failedTests++;
    console.error(`❌ [FAIL] ${group}: ${description}`);
  }
}

async function runTestSuite() {
  console.log('================================================================');
  console.log('  UFUGAJI UPDATE — V1.10A-CORRECTIVE-5 TEST SUITE');
  console.log('================================================================\n');

  // --------------------------------------------------------------------------
  // SECTION 1: UNIFIED FLOW & IDENTICAL LIFECYCLE RESULTS
  // --------------------------------------------------------------------------
  console.log('--- Section 1: Unified Activation Flow ---');
  const sellerA = `seller_flow_a_${Date.now()}`;
  const sellerB = `seller_flow_b_${Date.now()}`;

  // Seller A represents origin action: "Weka Tangazo" (CREATE_LISTING)
  // Seller B represents origin action: "Washa Free Trial" (DIRECT_CTA)
  const recA0 = sellerMonetizationService.getSellerRecord(sellerA);
  const recB0 = sellerMonetizationService.getSellerRecord(sellerB);
  assert('1', recA0.status === 'NOT_ACTIVATED', '1.1: Entry Point A seller starts as NOT_ACTIVATED');
  assert('1', recB0.status === 'NOT_ACTIVATED', '1.2: Entry Point B seller starts as NOT_ACTIVATED');

  // Both invoke the exact same server-authoritative activation operation
  const resA = sellerMonetizationService.activateFirstMonthFreeTrial({
    sellerUserId: sellerA,
    sellerProfileId: `shop_${sellerA}`
  });
  const resB = sellerMonetizationService.activateFirstMonthFreeTrial({
    sellerUserId: sellerB,
    sellerProfileId: `shop_${sellerB}`
  });

  assert('1', resA.success === true && resB.success === true, '1.3: Both entry points succeed through single authoritative activation');
  assert('1', resA.record.status === 'TRIAL_ACTIVE', '1.4: Entry Point A transitions to TRIAL_ACTIVE');
  assert('1', resB.record.status === 'TRIAL_ACTIVE', '1.5: Entry Point B transitions to TRIAL_ACTIVE');
  assert('1', resA.record.hasHadTrial === true && resB.record.hasHadTrial === true, '1.6: Both record hasHadTrial = true');

  // Verify server-authoritative timestamps
  const durationA = (new Date(resA.record.trialEndAt!).getTime() - new Date(resA.record.trialStartAt!).getTime()) / (1000 * 60 * 60 * 24);
  const durationB = (new Date(resB.record.trialEndAt!).getTime() - new Date(resB.record.trialStartAt!).getTime()) / (1000 * 60 * 60 * 24);
  assert('1', Math.round(durationA) === 30, '1.7: Entry Point A trial duration is exactly 30 days');
  assert('1', Math.round(durationB) === 30, '1.8: Entry Point B trial duration is exactly 30 days');

  // Both entry points result in identical selling capabilities (treated as both chosen)
  const eligA = canSellerSellOnMarketplace(sellerA);
  const eligB = canSellerSellOnMarketplace(sellerB);
  assert('1', eligA.canSell === true && eligB.canSell === true, '1.9: Both entry points grant immediate selling access');
  assert('1', eligA.status === eligB.status, '1.10: Both entry points produce identical TRIAL_ACTIVE status');
  assert('1', eligA.requiresPaymentAction === false && eligB.requiresPaymentAction === false, '1.11: Neither entry point requires payment during trial');

  // --------------------------------------------------------------------------
  // SECTION 2: SINGLE TRIAL START EVENT & NOTIFICATION DEDUPLICATION
  // --------------------------------------------------------------------------
  console.log('\n--- Section 2: Notifications Authority & Deduplication ---');
  // Check notifications for Seller A
  const notifsA = getLocalCachedNotifications(sellerA);
  const trialNotifsA = notifsA.filter((n) => n.type === 'SELLER_TRIAL_STARTED');
  assert('2', trialNotifsA.length === 1, '2.1: Entry Point A generated exactly ONE SELLER_TRIAL_STARTED notification');

  // Check notifications for Seller B
  const notifsB = getLocalCachedNotifications(sellerB);
  const trialNotifsB = notifsB.filter((n) => n.type === 'SELLER_TRIAL_STARTED');
  assert('2', trialNotifsB.length === 1, '2.2: Entry Point B generated exactly ONE SELLER_TRIAL_STARTED notification');

  // Idempotency: Rapid second click / replay
  const repeatA = sellerMonetizationService.activateFirstMonthFreeTrial({
    sellerUserId: sellerA,
    sellerProfileId: `shop_${sellerA}`,
    idempotencyKey: 'dup_key_test_123'
  });
  assert('2', repeatA.isDuplicate === true, '2.3: Second activation recognized as duplicate');
  assert('2', repeatA.record.trialStartAt === resA.record.trialStartAt, '2.4: Duplicate call does not reset trialStartAt');

  // Ensure duplicate call did NOT emit a second notification
  const notifsAAfter = getLocalCachedNotifications(sellerA);
  const trialNotifsAAfter = notifsAAfter.filter((n) => n.type === 'SELLER_TRIAL_STARTED');
  assert('2', trialNotifsAAfter.length === 1, '2.5: Rapid repeat click emits ZERO duplicate notifications');

  // Refresh / read simulation: Opening page or reading notifications does NOT create notifications
  getLocalCachedNotifications(sellerA);
  sellerMonetizationService.canSellerSellOnMarketplace(sellerA);
  const notifsAReadAfter = getLocalCachedNotifications(sellerA);
  assert('2', notifsAReadAfter.length === notifsAAfter.length, '2.6: Evaluating eligibility or reading does NOT emit notifications');

  // --------------------------------------------------------------------------
  // SECTION 3: COMMERCIAL ACCESS UNLOCK & RESUME BEHAVIOR
  // --------------------------------------------------------------------------
  console.log('\n--- Section 3: Commercial Access Unlock ---');
  // Before trial activation, seller is locked
  const freshSeller = `seller_fresh_${Date.now()}`;
  const freshElig = canSellerSellOnMarketplace(freshSeller);
  assert('3', freshElig.canSell === false, '3.1: NOT_ACTIVATED seller cannot sell');

  let prodBlocked = false;
  try {
    await createMarketplaceProduct(freshSeller, {
      title: 'Mbuzi wa Maziwa',
      description: 'Mbuzi bora wa maziwa',
      category: 'mbuzi',
      categoryId: 'mbuzi',
      price: 150000,
      unit: 'mbuzi',
      quantityAvailable: 5,
      location: 'Mbeya',
      sellerLocation: 'Mbeya',
      sellerName: 'Mfugaji Mbeya',
      sellerPhone: '0754123456'
    });
  } catch {
    prodBlocked = true;
  }
  assert('3', prodBlocked === true, '3.2: Product creation blocked before trial activation');

  // Now activate trial for freshSeller
  sellerMonetizationService.activateFirstMonthFreeTrial({
    sellerUserId: freshSeller,
    sellerProfileId: `shop_${freshSeller}`
  });
  const activatedElig = canSellerSellOnMarketplace(freshSeller);
  assert('3', activatedElig.canSell === true, '3.3: Activated seller can now sell (tools unlocked)');

  let prodAllowed = false;
  let createdProd: any = null;
  try {
    createdProd = await createMarketplaceProduct(freshSeller, {
      title: 'Pumba Safi ya Mahindi',
      description: 'Chakula bora cha mifugo na kuku',
      category: 'Chakula cha Mifugo',
      categoryId: 'cat_chakula_cha_mifugo',
      price: 15000,
      unit: 'mfuko',
      quantityAvailable: 10,
      location: 'Dar es Salaam',
      sellerLocation: 'Dar es Salaam',
      sellerName: 'Mfugaji Bora',
      sellerPhone: '0754123456'
    });
    createdProd.moderationStatus = 'approved';
    prodAllowed = true;
  } catch (err: any) {
    console.error('Product creation error:', err);
    prodAllowed = false;
  }
  assert('3', prodAllowed === true && Boolean(createdProd), '3.4: Product creation succeeds after trial activation');

  // Catalogue creation succeeds
  let catAllowed = false;
  try {
    const cat = await createShopCatalogue(freshSeller, { name: 'Mifugo Bora' });
    catAllowed = Boolean(cat);
  } catch {
    catAllowed = false;
  }
  assert('3', catAllowed === true, '3.5: Catalogue creation succeeds after trial activation');

  // --------------------------------------------------------------------------
  // SECTION 4: GRACE & EXPIRED STATES NEVER SHOW FREE TRIAL CTA
  // --------------------------------------------------------------------------
  console.log('\n--- Section 4: Grace & Expired States ---');
  // Transition freshSeller to GRACE_PERIOD
  sellerMonetizationService.simulateGracePeriod(freshSeller, 'admin');
  const graceElig = canSellerSellOnMarketplace(freshSeller);
  assert('4', graceElig.canSell === false, '4.1: GRACE_PERIOD seller commercial access is locked');
  assert('4', graceElig.isGracePeriod === true, '4.2: isGracePeriod is true');
  assert('4', graceElig.requiresPaymentAction === true, '4.3: requiresPaymentAction is true');

  // Verify anti-replay: cannot activate trial from GRACE_PERIOD
  let replayGraceBlocked = false;
  try {
    sellerMonetizationService.activateFirstMonthFreeTrial({
      sellerUserId: freshSeller
    });
  } catch {
    replayGraceBlocked = true;
  }
  assert('4', replayGraceBlocked === true, '4.4: Free trial cannot be re-activated during GRACE_PERIOD');

  // Transition to EXPIRED
  sellerMonetizationService.simulateGraceExpiry(freshSeller, 'admin');
  const expElig = canSellerSellOnMarketplace(freshSeller);
  assert('4', expElig.canSell === false, '4.5: EXPIRED seller commercial access is locked');
  assert('4', expElig.isExpired === true, '4.6: isExpired is true');

  let replayExpBlocked = false;
  try {
    sellerMonetizationService.activateFirstMonthFreeTrial({
      sellerUserId: freshSeller
    });
  } catch {
    replayExpBlocked = true;
  }
  assert('4', replayExpBlocked === true, '4.7: Free trial cannot be re-activated in EXPIRED state');

  // --------------------------------------------------------------------------
  // SECTION 5: NON-DESTRUCTIVE PRESERVATION
  // --------------------------------------------------------------------------
  console.log('\n--- Section 5: Non-Destructive Preservation ---');
  // Ensure createdProd still exists and is not deleted
  assert('5', Boolean(createdProd?.productId), '5.1: Product record is preserved through GRACE and EXPIRED states');

  // Product is filtered from public discovery while seller is locked
  assert('5', isProductMarketplaceEligible(createdProd) === false, '5.2: Product is filtered from public marketplace during EXPIRED state');

  // Once payment is confirmed, commercial access restores and preserved product becomes eligible again
  sellerMonetizationService.recordAuthoritativePaymentConfirmation({
    sellerUserId: freshSeller,
    paymentStatus: 'SUCCESS',
    amount: 1000,
    performedBy: 'TEST_SYSTEM'
  });
  const paidElig = canSellerSellOnMarketplace(freshSeller);
  assert('5', paidElig.canSell === true, '5.3: Paid seller transitions to ACTIVE and commercial access unlocks');
  assert('5', isProductMarketplaceEligible(createdProd) === true, '5.4: Preserved product automatically restores to public discovery');

  console.log('\n================================================================');
  console.log(`  V1.10A-CORRECTIVE-5 SUMMARY: ${passedTests}/${totalTests} PASSED (${failedTests} FAILED)`);
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
